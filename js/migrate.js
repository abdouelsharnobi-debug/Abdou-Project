/*
 * Schema v2 migration (Gate 2 proposal — NOT yet wired into the app).
 *
 * Converts a v1 project (single-project localStorage payload or .coldload.json file)
 * into v2 records: customer → project → revision "00". The v1 payload is carried
 * unchanged as the revision's engine input dataset, so calculation results cannot drift.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.HLMigrate = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 2;
  const INPUT_DATA_VERSION = 1; // engine input dataset format (the v1 project payload)

  const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const str = (x, max = 500) => (typeof x === 'string' ? x.slice(0, max) : x == null ? '' : String(x).slice(0, max));

  function uuid() {
    if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  /**
   * Structural validation of a v1 project. Returns { ok, errors[], warnings[] }.
   * Data only — nothing in the file is ever executed.
   */
  function validateV1(p) {
    const errors = [], warnings = [];
    if (!isObj(p)) return { ok: false, errors: ['File does not contain a project object.'], warnings };
    if (p.version !== undefined && p.version !== 1) errors.push(`Unsupported project version "${p.version}".`);
    if (!isObj(p.info)) errors.push('Missing project information block ("info").');
    if (!isObj(p.design)) errors.push('Missing design conditions block ("design").');
    if (!Array.isArray(p.rooms)) errors.push('Missing room list ("rooms").');
    else {
      p.rooms.forEach((r, i) => {
        const where = `Room ${i + 1}${r && r.name ? ` "${str(r.name, 60)}"` : ''}`;
        if (!isObj(r)) { errors.push(`${where}: not a valid room.`); return; }
        for (const k of ['dims', 'cond']) if (!isObj(r[k])) errors.push(`${where}: missing "${k}".`);
        if (!Array.isArray(r.surfaces)) errors.push(`${where}: missing surfaces.`);
        if (r.products !== undefined && !Array.isArray(r.products)) errors.push(`${where}: products must be a list.`);
        if (r.doors !== undefined && !Array.isArray(r.doors)) errors.push(`${where}: doors must be a list.`);
      });
    }
    if (p.machinery !== undefined && !Array.isArray(p.machinery)) errors.push('Machinery rooms must be a list.');
    if (Array.isArray(p.rooms) && !p.rooms.length) warnings.push('Project has no rooms.');
    return { ok: errors.length === 0, errors, warnings };
  }

  /**
   * v1 project → v2 records. Pure function.
   * @param v1 validated v1 payload
   * @param ctx { user, now (ISO), customers: existing customer records (for find-or-create), source }
   */
  function migrateV1Project(v1, ctx = {}) {
    const v = validateV1(v1);
    if (!v.ok) throw Object.assign(new Error('Invalid v1 project'), { details: v.errors });
    const now = ctx.now || new Date().toISOString();
    const user = ctx.user || 'unknown';
    const info = v1.info || {};
    const data = JSON.parse(JSON.stringify(v1)); // unchanged engine input dataset

    const clientName = str(info.client).trim();
    let customer = null, customerCreated = false;
    if (clientName) {
      customer = (ctx.customers || []).find((c) => c.name.trim().toLowerCase() === clientName.toLowerCase()) || null;
      if (!customer) {
        customer = { id: uuid(), name: clientName, logo: '', address: '', contact: '', phone: '', email: '', notes: '', createdAt: now, createdBy: user };
        customerCreated = true;
      }
    }

    const projectId = uuid();
    const revId = uuid();
    const created = /^\d{4}-\d{2}-\d{2}/.test(str(info.date)) ? new Date(info.date).toISOString() : now;

    const revision = {
      id: revId, projectId, rev: '00', seq: 0,
      legacyRevLabel: str(info.rev, 20),
      createdAt: now, createdBy: user,
      description: `Migrated from v1 ${ctx.source || 'project'} (original revision "${str(info.rev, 20) || '-'}")`,
      data, dataVersion: INPUT_DATA_VERSION,
      engineVersion: ctx.engineVersion || '1.0.0',
      results: ctx.summarize ? ctx.summarize(data) : null,
      review: { prepared: { name: str(info.engineer), date: '' }, checked: { name: '', date: '' }, approved: { name: '', date: '' }, status: 'Draft' },
      locked: false,
    };

    const project = {
      id: projectId, projectNo: '', name: str(info.name) || 'Untitled project',
      companyId: ctx.companyId || null, customerId: customer ? customer.id : null,
      endUser: '', consultant: '', contractor: '',
      site: str(info.location), country: '', city: '', climateId: null,
      status: 'Draft', type: '', tags: [], notes: '',
      createdAt: created, createdBy: str(info.engineer) || user,
      modifiedAt: now, modifiedBy: user,
      currentRevId: revId,
      working: { data: JSON.parse(JSON.stringify(data)), baseRevId: revId, dirty: false, savedAt: now },
      vent: { templateId: null, templateVersion: null, overrides: {} },
      archived: false, deletedAt: null,
      migratedFrom: { schema: 1, source: ctx.source || 'unknown', at: now },
    };

    return { customer, customerCreated, project, revision, warnings: v.warnings };
  }

  /** Inverse used for rollback / "Export as v1 file": returns the untouched v1 payload. */
  function toV1(revisionOrProject) {
    const d = revisionOrProject.working ? revisionOrProject.working.data : revisionOrProject.data;
    return JSON.parse(JSON.stringify(d));
  }

  return { SCHEMA_VERSION, INPUT_DATA_VERSION, validateV1, migrateV1Project, toV1, uuid };
});
