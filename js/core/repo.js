/*
 * Application services over the storage adapter: companies, customers, projects,
 * working copy, revisions, templates, attachments, settings, audit log, v1 migration.
 * The engine is only called to summarise results (read-only).
 */
(function (root) {
  'use strict';

  const DEFAULT_STATUSES = ['Draft', 'In Progress', 'Calculation Complete', 'Under Review', 'Approved', 'Issued', 'Archived'];
  const LOCKING_STATUSES = ['Approved', 'Issued'];
  const DEFAULT_SETTINGS = {
    general: { language: 'en', theme: 'system', units: 'SI', powerUnit: 'kW', dateFormat: 'YYYY-MM-DD', autosaveSec: 0 },
    reports: { numbering: 'PRJ-{YYYY}-{####}', footer: 'Calculation prepared with ColdLoad Pro. Verify inputs against the project basis of design.', showCustomerLogo: true, showCompanyLogo: true, calcTitle: 'Refrigeration Heat Load Calculation' },
    statuses: DEFAULT_STATUSES,
    engineering: { ambientDB: 35, ambientRH: 45, altitude: 0, groundTemp: 10, safetyFactor: 10, refrigerant: 'R717 (Ammonia)' },
    session: { hours: 12 },
  };

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const now = () => new Date().toISOString();
  const pad = (n, w) => String(n).padStart(w, '0');

  function createRepo(store, deps) {
    const { calc, model, migrate, version } = deps;
    let currentUser = () => 'unknown';
    const uuid = () => root.crypto.randomUUID();

    function setUserProvider(fn) { currentUser = fn; }

    async function audit(action, entity, entityId, summary) {
      await store.put('auditLog', { id: uuid(), at: now(), user: currentUser(), action, entity, entityId, summary: String(summary || '').slice(0, 300) });
    }

    /* ---------- init / settings ---------- */
    async function init({ seedClimate = [], seedReferences = [] } = {}) {
      let meta = await store.get('meta', 'schema');
      const ops = [];
      if (!meta) {
        meta = { key: 'schema', schemaVersion: version.SCHEMA_VERSION, appVersion: version.APP_VERSION, createdAt: now(), migrations: [], installId: uuid() };
        ops.push({ op: 'put', store: 'meta', value: meta });
      }
      if (!(await store.all('companies')).length) {
        ops.push({ op: 'put', store: 'companies', value: { id: uuid(), name: 'My Company', logo: '', address: '', phone: '', email: '', web: '', isDefault: true, createdAt: now() } });
      }
      if (!(await store.all('climate')).length) for (const c of seedClimate) ops.push({ op: 'put', store: 'climate', value: c });
      const refs = await store.all('references');
      const have = new Set(refs.map((r) => r.id));
      for (const r of seedReferences) if (!have.has(r.id)) ops.push({ op: 'put', store: 'references', value: r });
      if (ops.length) await store.batch(ops);
      return meta;
    }

    async function getSettings() {
      const rows = await store.all('settings');
      const out = clone(DEFAULT_SETTINGS);
      for (const r of rows) out[r.key] = Array.isArray(DEFAULT_SETTINGS[r.key]) ? r.value : { ...(out[r.key] || {}), ...r.value };
      return out;
    }
    async function setSetting(key, value) { await store.put('settings', { key, value }); await audit('update', 'settings', key, key); }

    /* ---------- companies / customers ---------- */
    const listCompanies = () => store.all('companies');
    async function saveCompany(c) {
      const rec = { logo: '', address: '', phone: '', email: '', web: '', ...c, id: c.id || uuid(), modifiedAt: now() };
      if (!String(rec.name || '').trim()) throw new Error('Company name is required.');
      if (rec.isDefault) for (const o of await listCompanies()) if (o.id !== rec.id && o.isDefault) await store.put('companies', { ...o, isDefault: false });
      await store.put('companies', rec); await audit('save', 'company', rec.id, rec.name); return rec;
    }
    async function removeCompany(id) {
      const used = (await store.all('projects')).filter((p) => p.companyId === id && !p.deletedAt);
      if (used.length) throw new Error(`This company is used by ${used.length} project(s). Reassign them first.`);
      await store.del('companies', id); await audit('delete', 'company', id, '');
    }
    const listCustomers = () => store.all('customers');
    async function saveCustomer(c) {
      const rec = { logo: '', address: '', contact: '', phone: '', email: '', notes: '', ...c, id: c.id || uuid(), modifiedAt: now() };
      if (!String(rec.name || '').trim()) throw new Error('Customer name is required.');
      if (!c.id) { rec.createdAt = now(); rec.createdBy = currentUser(); }
      await store.put('customers', rec); await audit('save', 'customer', rec.id, rec.name); return rec;
    }
    async function removeCustomer(id) {
      const used = (await store.byIndex('projects', 'customerId', id)).filter((p) => !p.deletedAt);
      if (used.length) throw new Error(`This customer has ${used.length} project(s). Move or delete them first.`);
      await store.del('customers', id); await audit('delete', 'customer', id, '');
    }

    /* ---------- summaries ---------- */
    function summarize(data) {
      try {
        const pr = calc.calcProject(data);
        return {
          totalKW: pr.totalKW,
          rooms: pr.rooms.map(({ room, res }) => ({ name: room.name, type: room.type, T: +room.cond.T, kW: res.capacity })),
          levels: pr.levels.map((l) => ({ sst: l.sst, kW: l.kW })),
          engineVersion: version.ENGINE_VERSION, at: now(),
        };
      } catch (e) { return { totalKW: null, error: e.message, rooms: [], levels: [], at: now() }; }
    }

    /* ---------- projects ---------- */
    async function listProjects({ includeArchived = true, includeDeleted = false } = {}) {
      return (await store.all('projects')).filter((p) => (includeDeleted || !p.deletedAt) && (includeArchived || !p.archived));
    }
    const getProject = (id) => store.get('projects', id);

    async function nextProjectNo() {
      const s = await getSettings();
      const pat = s.reports.numbering || 'PRJ-{YYYY}-{####}';
      const year = String(new Date().getFullYear());
      const all = await store.all('projects');
      for (let n = all.length + 1; ; n++) {
        const no = pat.replace('{YYYY}', year).replace(/\{(#+)\}/, (_, h) => pad(n, h.length));
        if (!all.some((p) => p.projectNo === no)) return no;
      }
    }

    function blankProject(fields, data) {
      const t = now(), u = currentUser();
      return {
        id: uuid(), projectNo: '', name: 'New project', companyId: null, customerId: null,
        endUser: '', consultant: '', contractor: '', site: '', country: '', city: '', climateId: null,
        status: 'Draft', type: '', tags: [], notes: '',
        createdAt: t, createdBy: u, modifiedAt: t, modifiedBy: u, currentRevId: null,
        working: { data, baseRevId: null, dirty: false, savedAt: t },
        summary: summarize(data),
        archived: false, deletedAt: null, ...fields,
      };
    }

    async function createProject(fields = {}, data) {
      const s = await getSettings();
      const d = data ? clone(data) : model.newProject();
      if (!data) d.design = { ...d.design, ...s.engineering };
      const companies = await listCompanies();
      const p = blankProject({
        projectNo: fields.projectNo || await nextProjectNo(),
        companyId: fields.companyId || (companies.find((c) => c.isDefault) || companies[0] || {}).id || null,
        ...fields,
      }, d);
      syncInfo(p);
      await store.put('projects', p); await audit('create', 'project', p.id, p.name);
      return p;
    }

    /** Keep the engine dataset's info block in step with project metadata (used by reports). */
    function syncInfo(p) {
      const info = p.working.data.info = p.working.data.info || {};
      info.name = p.name; info.location = [p.site, p.city, p.country].filter(Boolean).join(', ');
    }

    async function updateProject(id, patch) {
      const p = await getProject(id);
      if (!p) throw new Error('Project not found.');
      const allowed = ['projectNo', 'name', 'companyId', 'customerId', 'endUser', 'consultant', 'contractor', 'site', 'country', 'city', 'climateId', 'status', 'type', 'tags', 'notes'];
      for (const k of allowed) if (patch[k] !== undefined) p[k] = patch[k];
      if (!String(p.name).trim()) throw new Error('Project name is required.');
      p.modifiedAt = now(); p.modifiedBy = currentUser();
      syncInfo(p);
      await store.put('projects', p);
      return p;
    }

    async function saveWorking(id, data, patch) {
      const p = await getProject(id);
      if (!p) throw new Error('Project not found.');
      if (patch) Object.assign(p, patch);
      p.working = { ...p.working, data: clone(data), dirty: false, savedAt: now() };
      syncInfo(p);
      p.summary = summarize(p.working.data);
      p.modifiedAt = now(); p.modifiedBy = currentUser();
      await store.put('projects', p);
      return p;
    }

    async function listRevisions(projectId) {
      return (await store.byIndex('revisions', 'projectId', projectId)).sort((a, b) => a.seq - b.seq);
    }

    async function saveRevision(projectId, description, data) {
      const p = await getProject(projectId);
      if (!p) throw new Error('Project not found.');
      if (!String(description || '').trim()) throw new Error('Describe what changed in this revision.');
      const revs = await listRevisions(projectId);
      const seq = revs.length ? revs[revs.length - 1].seq + 1 : 0;
      const d = clone(data || p.working.data);
      const rev = {
        id: uuid(), projectId, rev: pad(seq, 2), seq, createdAt: now(), createdBy: currentUser(),
        description: String(description).trim(), data: d, dataVersion: version.INPUT_DATA_VERSION,
        engineVersion: version.ENGINE_VERSION, appVersion: version.APP_VERSION, results: summarize(d),
        review: { prepared: { name: currentUser(), date: now().slice(0, 10) }, checked: { name: '', date: '' }, approved: { name: '', date: '' }, status: 'Draft' },
        locked: false,
      };
      p.currentRevId = rev.id;
      p.working = { ...p.working, data: clone(d), baseRevId: rev.id, dirty: false, savedAt: now() };
      p.summary = rev.results; p.modifiedAt = now(); p.modifiedBy = currentUser();
      await store.batch([{ op: 'put', store: 'revisions', value: rev }, { op: 'put', store: 'projects', value: p }]);
      await audit('revision', 'project', projectId, `Rev ${rev.rev}: ${rev.description}`);
      return rev;
    }

    async function updateReview(revId, review) {
      const r = await store.get('revisions', revId);
      if (!r) throw new Error('Revision not found.');
      if (r.locked) throw new Error(`Rev ${r.rev} is ${r.review.status.toLowerCase()} and locked. Create a new revision to make changes.`);
      r.review = { ...r.review, ...review };
      if (LOCKING_STATUSES.includes(r.review.status)) r.locked = true;
      await store.put('revisions', r); await audit('review', 'revision', revId, `${r.rev} → ${r.review.status}`);
      return r;
    }

    async function restoreRevision(projectId, revId) {
      const p = await getProject(projectId), r = await store.get('revisions', revId);
      if (!p || !r || r.projectId !== projectId) throw new Error('Revision not found for this project.');
      p.working = { data: clone(r.data), baseRevId: r.id, dirty: false, savedAt: now() };
      p.summary = summarize(p.working.data); p.modifiedAt = now(); p.modifiedBy = currentUser();
      await store.put('projects', p); await audit('restore-revision', 'project', projectId, `Working copy ← Rev ${r.rev}`);
      return p;
    }

    async function saveAsProject(id, fields = {}) {
      const src = await getProject(id);
      if (!src) throw new Error('Project not found.');
      const { id: _i, projectNo: _n, currentRevId: _c, working, summary, createdAt, createdBy, modifiedAt, modifiedBy, deletedAt, archived, ...meta } = src;
      const p = await createProject({ ...meta, status: 'Draft', name: fields.name || `${src.name} (copy)`, projectNo: fields.projectNo, copiedFrom: { projectId: src.id, projectNo: src.projectNo, at: now() } }, working.data);
      return p;
    }

    async function setArchived(id, archived) {
      const p = await getProject(id); p.archived = !!archived; p.modifiedAt = now(); p.modifiedBy = currentUser();
      await store.put('projects', p); await audit(archived ? 'archive' : 'unarchive', 'project', id, p.name); return p;
    }
    async function trashProject(id) {
      const p = await getProject(id); p.deletedAt = now();
      await store.put('projects', p); await audit('trash', 'project', id, p.name);
    }
    async function untrashProject(id) {
      const p = await getProject(id); p.deletedAt = null;
      await store.put('projects', p); await audit('untrash', 'project', id, p.name);
    }
    async function purgeProject(id) {
      const p = await getProject(id);
      if (!p || !p.deletedAt) throw new Error('Only projects in the Trash can be permanently deleted.');
      const revs = await store.byIndex('revisions', 'projectId', id);
      const atts = await store.byIndex('attachments', 'projectId', id);
      await store.batch([{ op: 'del', store: 'projects', key: id }, ...revs.map((r) => ({ op: 'del', store: 'revisions', key: r.id })), ...atts.map((a) => ({ op: 'del', store: 'attachments', key: a.id }))]);
      await audit('purge', 'project', id, p.name);
    }

    /* ---------- attachments ---------- */
    const MAX_ATTACH = 15 * 1024 * 1024;
    async function addAttachment(projectId, { name, mime, size, dataUrl, note }) {
      if (size > MAX_ATTACH) throw new Error('Attachments are limited to 15 MB each.');
      const a = { id: uuid(), projectId, name: String(name).slice(0, 200), mime: mime || 'application/octet-stream', size, dataUrl, note: note || '', addedAt: now(), addedBy: currentUser() };
      await store.put('attachments', a); await audit('attach', 'project', projectId, a.name); return a;
    }
    const listAttachments = (projectId) => store.byIndex('attachments', 'projectId', projectId);
    async function removeAttachment(id) { await store.del('attachments', id); }

    /* ---------- templates ---------- */
    const listTemplates = (kind) => (kind ? store.byIndex('templates', 'kind', kind) : store.all('templates'));
    async function saveTemplate(t) {
      const old = t.id ? await store.get('templates', t.id) : null;
      const rec = { ...t, id: t.id || uuid(), version: old ? old.version + 1 : 1, modifiedAt: now(), modifiedBy: currentUser() };
      if (!String(rec.name || '').trim()) throw new Error('Template name is required.');
      await store.put('templates', rec); await audit('save', 'template', rec.id, `${rec.name} v${rec.version}`); return rec;
    }
    async function removeTemplate(id) { await store.del('templates', id); }

    /* ---------- climate / references ---------- */
    const listClimate = () => store.all('climate');
    async function saveClimate(c) {
      const rec = { ...c, id: c.id || uuid(), status: c.status === 'verified' ? 'verified' : 'user-entered', modifiedAt: now(), modifiedBy: currentUser() };
      await store.put('climate', rec); return rec;
    }
    const listReferences = () => store.all('references');
    async function saveReference(r) { const rec = { ...r, id: r.id || uuid(), userDefined: r.userDefined !== false }; await store.put('references', rec); return rec; }
    async function removeReference(id) { await store.del('references', id); }

    const listAudit = async (entityId) => (entityId ? store.byIndex('auditLog', 'entityId', entityId) : store.all('auditLog')).then((a) => a.sort((x, y) => (x.at < y.at ? 1 : -1)));

    /* ---------- v1 migration ---------- */
    async function migrateLegacy(v1, source) {
      const v = migrate.validateV1(v1);
      if (!v.ok) return { ok: false, errors: v.errors };
      const customers = await listCustomers();
      const companies = await listCompanies();
      const out = migrate.migrateV1Project(v1, {
        user: currentUser(), source, customers, companyId: (companies.find((c) => c.isDefault) || companies[0] || {}).id,
        engineVersion: version.ENGINE_VERSION, summarize,
      });
      out.project.projectNo = await nextProjectNo();
      out.project.summary = out.revision.results;
      const before = summarize(v1).totalKW, after = summarize(out.revision.data).totalKW;
      if (before !== after) return { ok: false, errors: [`Result check failed (${before} vs ${after} kW). Nothing was migrated.`] };
      const meta = await store.get('meta', 'schema');
      meta.migrations = [...(meta.migrations || []), { from: 1, to: 2, at: now(), source, projectId: out.project.id }];
      const safety = { id: uuid(), createdAt: now(), reason: `pre-migration (${source})`, payload: JSON.stringify(v1) };
      const ops = [
        { op: 'put', store: 'safetyBackups', value: safety },
        ...(out.customerCreated ? [{ op: 'put', store: 'customers', value: out.customer }] : []),
        { op: 'put', store: 'projects', value: out.project },
        { op: 'put', store: 'revisions', value: out.revision },
        { op: 'put', store: 'meta', value: meta },
      ];
      await store.batch(ops);
      await pruneSafety();
      await audit('migrate', 'project', out.project.id, `v1 ${source} → v2`);
      return { ok: true, project: out.project, before, after, warnings: out.warnings };
    }

    async function pruneSafety(keep = 5) {
      const all = (await store.all('safetyBackups')).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const drop = all.slice(keep).map((s) => ({ op: 'del', store: 'safetyBackups', key: s.id }));
      if (drop.length) await store.batch(drop);
    }

    return {
      DEFAULT_STATUSES, LOCKING_STATUSES, setUserProvider, init, audit, getSettings, setSetting,
      listCompanies, saveCompany, removeCompany, listCustomers, saveCustomer, removeCustomer,
      summarize, listProjects, getProject, nextProjectNo, createProject, updateProject, saveWorking,
      listRevisions, saveRevision, updateReview, restoreRevision, saveAsProject, setArchived,
      trashProject, untrashProject, purgeProject, addAttachment, listAttachments, removeAttachment,
      listTemplates, saveTemplate, removeTemplate, listClimate, saveClimate, listReferences,
      saveReference, removeReference, listAudit, migrateLegacy, pruneSafety,
    };
  }

  const api = { createRepo, DEFAULT_SETTINGS, DEFAULT_STATUSES };
  root.CL = root.CL || {};
  root.CL.repo = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
