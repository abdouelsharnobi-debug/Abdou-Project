/*
 * Backup / restore / project package.
 * File = { format, formatVersion, appVersion, engineVersion, schemaVersion, createdAt, createdBy,
 *          scope, counts, sha256, payload }. Payload is validated (format, version, checksum,
 * record shape) before anything is written; a safety backup is stored first; restore is one
 * atomic batch. User accounts and sessions are never included.
 */
(function (root) {
  'use strict';
  const DATA_STORES = ['companies', 'customers', 'projects', 'revisions', 'templates', 'climate', 'references', 'attachments', 'settings'];
  const FORMATS = { 'coldload-backup': 1, 'coldload-project': 1 };

  function canonical(x) {
    if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
    if (x && typeof x === 'object') return '{' + Object.keys(x).sort().filter((k) => x[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
    return JSON.stringify(x);
  }
  async function sha256(text) {
    const buf = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function createBackup(store, deps) {
    const { version, repo, migrate } = deps;

    async function build({ scope = 'full', projectIds = null, user = '' } = {}) {
      const payload = {};
      for (const s of DATA_STORES) payload[s] = await store.all(s);
      if (scope !== 'full') {
        const ids = new Set(projectIds || []);
        payload.projects = payload.projects.filter((p) => ids.has(p.id));
        payload.revisions = payload.revisions.filter((r) => ids.has(r.projectId));
        payload.attachments = payload.attachments.filter((a) => ids.has(a.projectId));
        const cust = new Set(payload.projects.map((p) => p.customerId)), comp = new Set(payload.projects.map((p) => p.companyId));
        payload.customers = payload.customers.filter((c) => cust.has(c.id));
        payload.companies = payload.companies.filter((c) => comp.has(c.id));
        payload.templates = []; payload.climate = []; payload.references = []; payload.settings = [];
      }
      const counts = Object.fromEntries(DATA_STORES.map((s) => [s, payload[s].length]));
      return {
        format: scope === 'project' ? 'coldload-project' : 'coldload-backup', formatVersion: 1,
        appVersion: version.APP_VERSION, engineVersion: version.ENGINE_VERSION, schemaVersion: version.SCHEMA_VERSION,
        createdAt: new Date().toISOString(), createdBy: user, scope, counts,
        sha256: await sha256(canonical(payload)), payload,
      };
    }

    /** Validate a parsed backup object. Returns { ok, errors[], warnings[], info }. */
    async function validate(obj) {
      const errors = [], warnings = [];
      const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
      if (!isObj(obj)) return { ok: false, errors: ['The file is not a ColdLoad backup.'], warnings };
      // A v1 single-project file is accepted and routed through migration.
      if (!obj.format && Array.isArray(obj.rooms)) {
        const v = migrate.validateV1(obj);
        return { ok: v.ok, errors: v.errors, warnings: v.warnings, legacyV1: true, info: { format: 'ColdLoad v1 project file', projects: 1, createdAt: (obj.info && obj.info.date) || '' } };
      }
      if (!(obj.format in FORMATS)) errors.push(`Unknown file format "${String(obj.format).slice(0, 40)}".`);
      else if (obj.formatVersion > FORMATS[obj.format]) errors.push(`This backup was made by a newer version (format ${obj.formatVersion}). Update the application first.`);
      if (obj.schemaVersion > version.SCHEMA_VERSION) errors.push(`Backup schema ${obj.schemaVersion} is newer than this application (schema ${version.SCHEMA_VERSION}).`);
      if (!isObj(obj.payload)) errors.push('Backup has no data payload.');
      if (errors.length) return { ok: false, errors, warnings };
      for (const s of DATA_STORES) if (obj.payload[s] !== undefined && !Array.isArray(obj.payload[s])) errors.push(`Section "${s}" is damaged.`);
      const got = await sha256(canonical(obj.payload));
      if (got !== obj.sha256) errors.push('Checksum mismatch: the file is incomplete or has been modified.');
      const keyOf = { settings: 'key' };
      for (const s of DATA_STORES) for (const r of obj.payload[s] || []) {
        if (!isObj(r) || typeof r[keyOf[s] || 'id'] !== 'string') { errors.push(`Section "${s}" contains an invalid record.`); break; }
      }
      for (const p of obj.payload.projects || []) {
        const v = migrate.validateV1(p.working && p.working.data);
        if (!v.ok) { errors.push(`Project "${String(p.name).slice(0, 60)}" has invalid calculation data: ${v.errors[0]}`); }
      }
      for (const r of obj.payload.revisions || []) {
        if (!migrate.validateV1(r.data).ok) { errors.push(`A revision (${r.rev}) has invalid calculation data.`); break; }
      }
      if (obj.engineVersion && obj.engineVersion !== version.ENGINE_VERSION) warnings.push(`Backup made with calculation engine ${obj.engineVersion}; this application uses ${version.ENGINE_VERSION}. Stored revision results are kept as recorded.`);
      const info = { format: obj.format, scope: obj.scope, createdAt: obj.createdAt, createdBy: obj.createdBy, appVersion: obj.appVersion, engineVersion: obj.engineVersion, counts: obj.counts, projects: (obj.payload.projects || []).length };
      return { ok: errors.length === 0, errors, warnings, info };
    }

    /** Which incoming records already exist locally. */
    async function conflicts(obj) {
      const out = {};
      for (const s of DATA_STORES) {
        const k = s === 'settings' ? 'key' : 'id';
        const local = new Set((await store.all(s)).map((r) => r[k]));
        out[s] = (obj.payload[s] || []).filter((r) => local.has(r[k])).length;
      }
      return out;
    }

    async function safetyBackup(reason, user) {
      const full = await build({ scope: 'full', user });
      const rec = { id: root.crypto.randomUUID(), createdAt: new Date().toISOString(), reason, payload: JSON.stringify(full) };
      await store.put('safetyBackups', rec);
      await repo.pruneSafety();
      return rec;
    }

    /**
     * Restore. mode: 'skip' (keep local on conflict) | 'copy' (import conflicting projects as copies)
     * | 'replace' (wipe data stores, then load). Always validates and writes a safety backup first.
     */
    async function restore(obj, { mode = 'skip', user = '' } = {}) {
      const v = await validate(obj);
      if (!v.ok) throw Object.assign(new Error('Backup validation failed'), { details: v.errors });
      if (v.legacyV1) {
        const res = await repo.migrateLegacy(obj, 'imported v1 file');
        if (!res.ok) throw Object.assign(new Error('Import failed'), { details: res.errors });
        return { imported: { projects: 1 }, safety: null, projectIds: [res.project.id] };
      }
      const safety = await safetyBackup(`pre-restore (${mode})`, user);
      const P = JSON.parse(JSON.stringify(obj.payload));
      const ops = [];
      const imported = {};
      if (mode === 'replace') {
        for (const s of DATA_STORES) for (const r of await store.all(s)) ops.push({ op: 'del', store: s, key: s === 'settings' ? r.key : r.id });
      }
      const localIds = {};
      for (const s of DATA_STORES) localIds[s] = new Set(mode === 'replace' ? [] : (await store.all(s)).map((r) => (s === 'settings' ? r.key : r.id)));
      const remap = new Map();
      if (mode === 'copy') {
        const usedNos = new Set([...(await store.all('projects')).map((x) => x.projectNo), ...(P.projects || []).map((x) => x.projectNo)]);
        const uniqueNo = (base) => { let n = 1, no; do { no = `${base}-R${n > 1 ? n : ''}`; n++; } while (usedNos.has(no)); usedNos.add(no); return no; };
        for (const p of P.projects || []) if (localIds.projects.has(p.id)) {
          const nid = root.crypto.randomUUID(); remap.set(p.id, nid);
          p.id = nid; p.name = `${p.name} (restored copy)`; p.projectNo = uniqueNo(p.projectNo);
        }
        for (const r of [...(P.revisions || []), ...(P.attachments || [])]) if (remap.has(r.projectId)) {
          r.projectId = remap.get(r.projectId); r.id = root.crypto.randomUUID();
        }
        for (const p of P.projects || []) if ([...remap.values()].includes(p.id)) {
          const revs = (P.revisions || []).filter((r) => r.projectId === p.id).sort((a, b) => a.seq - b.seq);
          p.currentRevId = revs.length ? revs[revs.length - 1].id : null;
          if (p.working) p.working.baseRevId = p.currentRevId;
        }
      }
      const restoredProjectIds = [];
      for (const s of DATA_STORES) {
        let n = 0;
        for (const r of P[s] || []) {
          const k = s === 'settings' ? r.key : r.id;
          if (localIds[s].has(k)) continue; // skip existing (skip/copy for non-project stores)
          ops.push({ op: 'put', store: s, value: r }); n++;
          if (s === 'projects') restoredProjectIds.push(r.id);
        }
        imported[s] = n;
      }
      await store.batch(ops);
      await repo.audit('restore', 'backup', safety.id, `mode=${mode}; projects=${imported.projects}`);
      return { imported, safety, projectIds: restoredProjectIds };
    }

    async function listSafety() {
      return (await store.all('safetyBackups')).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map(({ payload, ...m }) => ({ ...m, size: payload.length }));
    }
    async function getSafety(id) { const s = await store.get('safetyBackups', id); return s ? JSON.parse(s.payload) : null; }

    return { build, validate, conflicts, restore, safetyBackup, listSafety, getSafety };
  }

  const api = { createBackup, canonical, sha256, DATA_STORES };
  root.CL = root.CL || {};
  root.CL.backup = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
