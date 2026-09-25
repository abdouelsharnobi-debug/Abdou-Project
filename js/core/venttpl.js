/*
 * Common machinery-room ventilation standard (template) with project overrides.
 * A linked machinery room keeps: tpl = { id, name, version, snapshot }. Field values on the
 * room are the effective (engine) values. Override status = value differs from snapshot.
 * Template changes never alter a project until the engineer accepts the update.
 */
(function (root) {
  'use strict';
  const FIELDS = [
    ['code', 'Code / standard basis'], ['refrigerant', 'Refrigerant'], ['detector', 'Detector activates ventilation'],
    ['maxSetpoint', 'Maximum detector setpoint (ppm)'], ['setpoint', 'Detector setpoint (ppm)'],
    ['basement', 'Machinery room in basement'], ['occupants', 'Design occupancy'],
    ['toaC', 'Outdoor design dry-bulb (°C)'], ['tsaC', 'Supply air temperature (°C)'],
  ];
  const same = (a, b) => String(a ?? '') === String(b ?? '');

  function templateFromRoom(m, name) {
    const data = {}; for (const [k] of FIELDS) data[k] = m[k];
    return { kind: 'machineryVent', name: name || 'Machinery room standard', data };
  }

  function link(m, tpl) {
    for (const [k] of FIELDS) if (tpl.data[k] !== undefined) m[k] = tpl.data[k];
    m.tpl = { id: tpl.id, name: tpl.name, version: tpl.version, snapshot: { ...tpl.data } };
    return m;
  }

  function unlink(m) { delete m.tpl; return m; }

  /** Rows: { field, label, standard, project, overridden } */
  function status(m) {
    if (!m.tpl) return [];
    return FIELDS.map(([k, label]) => ({ field: k, label, standard: m.tpl.snapshot[k], project: m[k], overridden: !same(m.tpl.snapshot[k], m[k]) }));
  }

  function resetField(m, field) { if (m.tpl) m[field] = m.tpl.snapshot[field]; return m; }

  /** Pending template update for a linked room: null if up to date. */
  function pendingUpdate(m, tpl) {
    if (!m.tpl || !tpl || tpl.id !== m.tpl.id || tpl.version <= m.tpl.version) return null;
    const changes = FIELDS.filter(([k]) => !same(m.tpl.snapshot[k], tpl.data[k])).map(([k, label]) => ({
      field: k, label, oldStandard: m.tpl.snapshot[k], newStandard: tpl.data[k], project: m[k],
      overridden: !same(m.tpl.snapshot[k], m[k]),
    }));
    return { from: m.tpl.version, to: tpl.version, changes };
  }

  /** Accept a template update: non-overridden fields follow the new standard; overrides are kept. */
  function acceptUpdate(m, tpl) {
    const p = pendingUpdate(m, tpl);
    if (!p) return m;
    for (const c of p.changes) if (!c.overridden) m[c.field] = c.newStandard;
    m.tpl = { id: tpl.id, name: tpl.name, version: tpl.version, snapshot: { ...tpl.data } };
    return m;
  }

  const api = { FIELDS, templateFromRoom, link, unlink, status, resetField, pendingUpdate, acceptUpdate };
  root.CL = root.CL || {};
  root.CL.venttpl = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
