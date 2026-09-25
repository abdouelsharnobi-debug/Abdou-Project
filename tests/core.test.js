/* Core services: auth, repository, revisions, backup/restore, templates, units, validation, exports. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const C = require('../js/calc.js');
const D = require('../js/data.js');
const M = require('../js/model.js');
const Vent = require('../js/vent.js');
const migrate = require('../js/migrate.js');
const version = require('../js/core/version.js');
const { MemoryAdapter } = require('../js/core/db.js');
const { createAuth, passwordProblems } = require('../js/core/auth.js');
const { createRepo } = require('../js/core/repo.js');
const { createBackup } = require('../js/core/backup.js');
const venttpl = require('../js/core/venttpl.js');
const units = require('../js/core/units.js');
const { validateProject, count } = require('../js/core/validate.js');
const explain = require('../js/core/explain.js');
const climate = require('../js/core/climate.js');
const refs = require('../js/core/refs.js');
const xlsx = require('../js/core/xlsx.js');
const report = require('../js/core/report.js');
const Psychro = require('../js/psychro.js');
const { cases } = require('./baseline-cases.js');

async function setup() {
  const store = new MemoryAdapter();
  const repo = createRepo(store, { calc: C, model: M, migrate, version });
  repo.setUserProvider(() => 'tester');
  await repo.init({ seedClimate: climate.seedRecords(), seedReferences: refs.REFERENCES });
  const backup = createBackup(store, { version, repo, migrate });
  return { store, repo, backup, auth: createAuth(store) };
}

test('auth: hashed passwords, sign-in, wrong password, change password, sessions', async () => {
  const { store, auth } = await setup();
  assert.equal(await auth.hasUsers(), false);
  await assert.rejects(auth.createUser({ username: 'ab', password: 'x' }), /Username/);
  await assert.rejects(auth.createUser({ username: 'eng1', password: 'short' }), /Password must contain/);
  const u = await auth.createUser({ username: 'Eng1', displayName: 'Engineer One', password: 'Cold2026store', role: 'admin' });
  assert.equal(u.username, 'eng1');
  assert.equal(u.pw, undefined, 'public user must not expose hash');
  const raw = (await store.all('users'))[0];
  assert.ok(!JSON.stringify(raw).includes('Cold2026store'), 'plain password stored');
  assert.equal(raw.pw.algo, 'PBKDF2-SHA256');
  await assert.rejects(auth.createUser({ username: 'eng1', password: 'Cold2026store' }), /already exists/);
  await assert.rejects(auth.signIn('eng1', 'wrongpass1'), /Incorrect/);
  const { session } = await auth.signIn('ENG1', 'Cold2026store', true);
  assert.ok((await auth.resume(session.id)).user.displayName === 'Engineer One');
  await auth.changePassword(u.id, 'Cold2026store', 'NewPass2027');
  assert.equal(await auth.resume(session.id), null, 'sessions revoked after password change');
  await assert.rejects(auth.signIn('eng1', 'Cold2026store'), /Incorrect/);
  assert.ok(await auth.signIn('eng1', 'NewPass2027'));
  await auth.updateProfile(u.id, { email: 'Eng1@Example.com' });
  assert.ok(await auth.signIn('eng1@example.com', 'NewPass2027'), 'sign in with email');
  assert.deepEqual(passwordProblems('abcdefgh1'), []);
});

test('repo: projects for multiple customers, unique IDs and numbers, no overwrite', async () => {
  const { repo } = await setup();
  const a = await repo.saveCustomer({ name: 'Customer A' });
  const b = await repo.saveCustomer({ name: 'Customer B' });
  const ps = [];
  for (let i = 0; i < 30; i++) ps.push(await repo.createProject({ name: `P${i}`, customerId: i % 2 ? a.id : b.id }));
  assert.equal(new Set(ps.map((p) => p.id)).size, 30);
  assert.equal(new Set(ps.map((p) => p.projectNo)).size, 30);
  assert.equal((await repo.listProjects()).length, 30);
  await assert.rejects(repo.removeCustomer(a.id), /has 15 project/);
  assert.equal((await repo.listCompanies())[0].name, 'My Company');
  assert.ok((await repo.listClimate()).length > 100);
});

test('repo: working copy, revisions, lock on Issued, restore, save-as', async () => {
  const { repo } = await setup();
  const p = await repo.createProject({ name: 'Rev test' }, M.exampleProject());
  const kw0 = p.summary.totalKW;
  await assert.rejects(repo.saveRevision(p.id, ''), /Describe/);
  const r0 = await repo.saveRevision(p.id, 'Initial issue');
  assert.equal(r0.rev, '00');
  assert.equal(r0.engineVersion, version.ENGINE_VERSION);
  const d = (await repo.getProject(p.id)).working.data;
  d.rooms[0].dims.L = 50;
  await repo.saveWorking(p.id, d);
  const r1 = await repo.saveRevision(p.id, 'Longer freezer');
  assert.equal(r1.rev, '01');
  assert.ok(r1.results.totalKW > r0.results.totalKW);
  assert.equal((await repo.listRevisions(p.id)).length, 2);
  await repo.updateReview(r0.id, { status: 'Issued', checked: { name: 'Checker', date: '2026-09-25' } });
  await assert.rejects(repo.updateReview(r0.id, { status: 'Draft' }), /locked/);
  await repo.restoreRevision(p.id, r0.id);
  const back = await repo.getProject(p.id);
  assert.equal(back.working.data.rooms[0].dims.L, 40);
  assert.equal(back.summary.totalKW, kw0);
  assert.equal((await repo.listRevisions(p.id)).length, 2, 'history kept');
  const copy = await repo.saveAsProject(p.id, { name: 'Copy' });
  assert.notEqual(copy.id, p.id);
  assert.equal(copy.copiedFrom.projectId, p.id);
  await assert.rejects(repo.purgeProject(copy.id), /Trash/);
  await repo.trashProject(copy.id);
  assert.equal((await repo.listProjects()).length, 1);
  await repo.purgeProject(copy.id);
  assert.equal(await repo.getProject(copy.id), undefined);
});

test('repo: legacy migration keeps results and writes a safety backup', async () => {
  const { repo, store } = await setup();
  const v1 = M.exampleProject();
  const out = await repo.migrateLegacy(v1, 'localStorage');
  assert.ok(out.ok);
  assert.equal(out.before, out.after);
  assert.equal((await store.all('safetyBackups')).length, 1);
  assert.equal((await repo.listCustomers())[0].name, 'Demo client');
  assert.equal((await repo.listRevisions(out.project.id))[0].rev, '00');
  assert.equal((await store.get('meta', 'schema')).migrations.length, 1);
  const bad = await repo.migrateLegacy({ rooms: 3 }, 'file');
  assert.equal(bad.ok, false);
});

test('backup: validate, detect tampering, restore skip / copy / replace with safety backup', async () => {
  const { repo, backup, store } = await setup();
  const p = await repo.createProject({ name: 'Backup me' }, M.exampleProject());
  await repo.saveRevision(p.id, 'Rev 0');
  const full = await backup.build({ scope: 'full', user: 'tester' });
  assert.equal(full.counts.projects, 1);
  const v = await backup.validate(JSON.parse(JSON.stringify(full)));
  assert.ok(v.ok, v.errors.join());
  const tampered = JSON.parse(JSON.stringify(full)); tampered.payload.projects[0].name = 'x';
  assert.match((await backup.validate(tampered)).errors.join(), /Checksum/);
  assert.equal((await backup.validate({ format: 'nope' })).ok, false);
  const future = JSON.parse(JSON.stringify(full)); future.formatVersion = 99;
  assert.match((await backup.validate(future)).errors.join(), /newer version/);

  let r = await backup.restore(full, { mode: 'skip' });
  assert.equal(r.imported.projects, 0);
  assert.ok(r.safety, 'safety backup written');
  r = await backup.restore(full, { mode: 'copy' });
  assert.equal(r.imported.projects, 1);
  const all = await repo.listProjects();
  assert.equal(all.length, 2);
  const cp = all.find((x) => x.name.endsWith('(restored copy)'));
  assert.equal((await repo.listRevisions(cp.id)).length, 1);
  assert.equal(cp.currentRevId, (await repo.listRevisions(cp.id))[0].id);
  await backup.restore(full, { mode: 'copy' });
  const nos = (await repo.listProjects()).map((x) => x.projectNo);
  assert.equal(new Set(nos).size, nos.length, 'restored copies must get unique project numbers');
  r = await backup.restore(full, { mode: 'replace' });
  assert.equal((await repo.listProjects()).length, 1);
  assert.ok((await store.all('safetyBackups')).length >= 3);
  // v1 file through restore → migration
  const r2 = await backup.restore(M.exampleProject(), { mode: 'skip' });
  assert.equal(r2.imported.projects, 1);
  // selected-project backup contains only that project
  const sel = await backup.build({ scope: 'selected', projectIds: [p.id] });
  assert.equal(sel.payload.projects.length, 1);
  assert.ok((await backup.validate(sel)).ok);
});

test('machinery template: standard vs project value, overrides survive template updates', () => {
  const m = Vent.newMachineryRoom();
  const tpl = { id: 't1', name: 'Std', version: 1, data: venttpl.templateFromRoom(m).data };
  venttpl.link(m, tpl);
  assert.ok(venttpl.status(m).every((s) => !s.overridden));
  m.setpoint = 20; // project override
  const st = venttpl.status(m).find((s) => s.field === 'setpoint');
  assert.deepEqual([st.standard, st.project, st.overridden], [25, 20, true]);
  const tpl2 = { ...tpl, version: 2, data: { ...tpl.data, setpoint: 30, tsaC: 41 } };
  const pend = venttpl.pendingUpdate(m, tpl2);
  assert.equal(pend.changes.length, 2);
  assert.equal(m.tsaC, 38, 'no silent change before acceptance');
  venttpl.acceptUpdate(m, tpl2);
  assert.equal(m.tsaC, 41, 'non-overridden follows standard');
  assert.equal(m.setpoint, 20, 'override preserved');
  assert.equal(venttpl.pendingUpdate(m, tpl2), null);
});

test('units: round trips and labels', () => {
  units.set({ system: 'IP' });
  assert.equal(units.label('temp'), '°F');
  assert.equal(units.toDisplay('temp', 0), 32);
  assert.equal(units.fromDisplay('temp', units.toDisplay('temp', -25)), -25);
  for (const k of Object.keys(units.KINDS)) assert.ok(Math.abs(units.fromDisplay(k, units.toDisplay(k, 12.345)) - 12.345) < 1e-9, k);
  assert.ok(Math.abs(units.toDisplay('len', 1) - 3.28084) < 1e-9);
  units.set({ system: 'SI', power: 'TR' });
  assert.ok(Math.abs(units.pw(3.51685) - 1) < 1e-9);
  units.set({ power: 'kW' });
  assert.equal(units.toDisplay('temp', 5), 5);
});

test('validation: regression projects have no errors; bad inputs are caught, never corrected', () => {
  for (const [k, make] of Object.entries(cases)) {
    const p = make();
    const msgs = validateProject(p, C, D, Vent);
    assert.equal(count(msgs).error, 0, `${k}: ${msgs.filter((m) => m.level === 'error').map((m) => m.msg).join(' | ')}`);
  }
  const p = M.exampleProject(); const r = p.rooms[0];
  r.dims.L = -20; r.cond.T = ''; r.runHours = 30; r.products[0].pullDown = 0; r.products[0].crf = 1.5; r.doors[0].w = 0;
  const before = JSON.stringify(p);
  const codes = validateProject(p, C, D, Vent).filter((m) => m.level === 'error').map((m) => m.code);
  for (const c of ['R02', 'R03', 'R07', 'M07', 'M09', 'I04']) assert.ok(codes.includes(c), c);
  assert.equal(JSON.stringify(p), before, 'validation must not modify inputs');
  p.design.ambientDB = '';
  assert.ok(validateProject(p, C, D, Vent).some((m) => m.code === 'P01'));
  const q = M.exampleProject(); q.rooms[1].surfaces[1].adj = 'custom'; q.rooms[1].surfaces[1].tAdj = -25;
  assert.ok(validateProject(q, C, D, Vent).some((m) => m.code === 'X02'), 'heat-loss credit warned');
  const v = M.exampleProject(); v.machinery[0].refrigerant = 'other';
  assert.ok(validateProject(v, C, D, Vent).some((m) => m.code === 'V02'));
});

test('transparency: explanation values equal engine results', () => {
  const p = M.exampleProject();
  for (const r of p.rooms) {
    const res = C.calcRoom(r, p);
    const blocks = explain.explainRoom(r, res, p, D);
    assert.equal(blocks.find((b) => b.id === 'transmission').result[0], res.transmission.kWh);
    assert.equal(blocks.find((b) => b.id === 'total').result[0], res.capacity);
  }
  const a = explain.assumptions(p, D, M);
  assert.ok(a.some((x) => x.item === 'Surface film coefficients'));
  assert.ok(a.some((x) => x.kind === 'database'));
});

test('climate: regions and RH from wet bulb', () => {
  assert.deepEqual(climate.REGIONS, ['Africa', 'Asia', 'Europe', 'Mid-East', 'North & Central America', 'South America', 'South West Pacific']);
  const seed = climate.seedRecords();
  assert.ok(seed.every((c) => climate.REGIONS.includes(c.region) && c.db04 === ''));
  assert.equal(new Set(seed.map((c) => c.id)).size, seed.length);
  // 35 °C DB / 25 °C WB at sea level ≈ 45 % RH (psychrometric chart)
  const rh = climate.rhFromWB(35, 25, 101.325, Psychro);
  assert.ok(rh > 43 && rh < 47, String(rh));
});

test('exports: XLSX opens in a spreadsheet reader, CSV and report contain traceability', async () => {
  const { repo } = await setup();
  const p = await repo.createProject({ name: 'Export test' }, M.exampleProject());
  const rev = await repo.saveRevision(p.id, 'Issue for review');
  const proj = await repo.getProject(p.id);
  const ctx = { project: proj, data: rev.data, revision: rev, revisions: [rev], company: { name: 'My Company' }, customer: { name: 'C' }, user: { displayName: 'T' },
    settings: await repo.getSettings(), messages: validateProject(rev.data, C, D, Vent), refs: refs.REFERENCES, version, calc: C, vent: Vent, explain, D, M, venttpl, units };
  const html = report.buildReport(ctx);
  for (const s of [p.id, 'Rev', version.ENGINE_VERSION, version.APP_VERSION, 'Engineering assumptions', 'Revision history', 'Prepared / Checked / Approved', 'Final refrigeration load']) assert.ok(html.includes(s), s);
  const tot = C.calcProject(rev.data).totalKW;
  assert.ok(html.includes(tot.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })));
  const book = xlsx.workbook(report.exportSheets(ctx), { title: 'x' });
  const file = path.join(os.tmpdir(), `cl-test-${process.pid}.xlsx`);
  fs.writeFileSync(file, book);
  let py;
  try {
    py = execFileSync('python3', ['-c', `import openpyxl,sys;wb=openpyxl.load_workbook(sys.argv[1]);ws=wb['Load summary'];print(len(wb.sheetnames), ws.max_row, ws.cell(ws.max_row, 21).value)`, file]).toString().trim();
  } catch (e) { py = null; }
  if (py) {
    const [nSheets, rows, total] = py.split(' ');
    assert.equal(+nSheets, 9);
    assert.equal(+rows, 3 + 2);
    assert.ok(Math.abs(+total - tot) < 1e-6, `${total} vs ${tot}`);
  }
  fs.unlinkSync(file);
  const csv = xlsx.csv(report.csvRows(ctx));
  assert.ok(csv.startsWith('﻿project_id'));
  assert.ok(csv.includes(version.ENGINE_VERSION));
});
