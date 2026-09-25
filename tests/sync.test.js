/* Sync between computers through a shared folder: two in-memory databases ("Windows" and "Mac") and a real folder. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const C = require('../js/calc.js');
const M = require('../js/model.js');
const migrate = require('../js/migrate.js');
const version = require('../js/core/version.js');
const { MemoryAdapter } = require('../js/core/db.js');
const { createRepo } = require('../js/core/repo.js');
const { createBackup } = require('../js/core/backup.js');
const { createSync } = require('../js/core/sync.js');
const climate = require('../js/core/climate.js');
const refs = require('../js/core/refs.js');
const { createFolderRemote, detectCloudFolders, encodeKey, decodeKey } = require('../desktop/sync-folder.js');

async function computer(name) {
  const store = new MemoryAdapter();
  const repo = createRepo(store, { calc: C, model: M, migrate, version });
  repo.setUserProvider(() => name);
  const meta = await repo.init({ seedClimate: climate.seedRecords(), seedReferences: refs.REFERENCES });
  const backup = createBackup(store, { version, repo, migrate });
  const sync = createSync(store, { backup, migrate, version, repo });
  return { name, store, repo, backup, sync, deviceId: meta.installId };
}
const tmpFolder = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cl-sync-'));
function remoteFor(dir) {
  const r = createFolderRemote(dir);
  r.info({ create: true });
  return r;
}
const run = (pc, remote, extra = {}) => pc.sync.run(remote, { deviceId: pc.deviceId, deviceName: pc.name, ...extra });
const live = async (pc) => (await pc.repo.listProjects()).sort((a, b) => (a.projectNo < b.projectNo ? -1 : 1));
const later = () => new Promise((r) => setTimeout(r, 5));

test('sync: a project made on one computer appears on the other, edits flow both ways', async () => {
  const dir = tmpFolder(), remote = remoteFor(dir);
  const win = await computer('Windows'), mac = await computer('Mac');
  const p = await win.repo.createProject({ name: 'Cold store Cairo' });
  const r1 = await run(win, remote);
  assert.ok(r1.pushed > 1 && r1.pulled === 0);

  // The Mac joins: it takes the folder's data (its own untouched default company is replaced).
  const pv = await mac.sync.preview(remote);
  assert.equal(pv.projectsThere, 1); assert.equal(pv.projectsHere, 0);
  const r2 = await run(mac, remote, { mode: 'replaceLocal' });
  assert.ok(r2.pulled >= 1);
  assert.equal((await mac.repo.listCompanies()).length, 1, 'one company after joining');
  const onMac = await mac.repo.getProject(p.id);
  assert.equal(onMac.name, 'Cold store Cairo');
  assert.equal(onMac.summary.totalKW, p.summary.totalKW, 'same results on both computers');

  // Edit on the Mac → appears on Windows.
  const data = onMac.working.data; data.design.safetyFactor = 15;
  await later(); await mac.repo.saveWorking(p.id, data, { name: 'Cold store Cairo (rev)' });
  const r3 = await run(mac, remote); assert.equal(r3.pushed, 1);
  const r4 = await run(win, remote); assert.equal(r4.pulled, 1); assert.equal(r4.conflicts.length, 0);
  const onWin = await win.repo.getProject(p.id);
  assert.equal(onWin.name, 'Cold store Cairo (rev)');
  assert.equal(onWin.working.data.design.safetyFactor, 15);

  // Revisions and customers follow; a second run changes nothing.
  await win.repo.saveRevision(p.id, 'Issued for review');
  await win.repo.saveCustomer({ name: 'Delta Foods' });
  await run(win, remote);
  const r5 = await run(mac, remote);
  assert.ok(r5.pulled >= 3, 'revision, project and customer received');
  assert.equal((await mac.repo.listRevisions(p.id)).length, 1);
  assert.ok((await mac.repo.listCustomers()).some((c) => c.name === 'Delta Foods'));
  const again = await run(mac, remote);
  assert.equal(again.pulled + again.pushed + again.deletedHere + again.deletedThere, 0);
});

test('sync: deletion reaches the other computer through tombstones; a missing file never deletes', async () => {
  const dir = tmpFolder(), remote = remoteFor(dir);
  const win = await computer('Windows'), mac = await computer('Mac');
  const a = await win.repo.createProject({ name: 'To be deleted' });
  const b = await win.repo.createProject({ name: 'Keeper' });
  await win.repo.saveRevision(a.id, 'first');
  await run(win, remote); await run(mac, remote, { mode: 'replaceLocal' });
  assert.equal((await live(mac)).length, 2);

  await win.repo.trashProject(a.id); await win.repo.purgeProject(a.id);
  const r = await run(win, remote); assert.ok(r.deletedThere >= 2, 'project and revision tombstoned');
  const r2 = await run(mac, remote); assert.ok(r2.deletedHere >= 2);
  assert.equal(await mac.repo.getProject(a.id), undefined);
  assert.equal((await mac.repo.listRevisions(a.id)).length, 0);
  assert.ok((await mac.backup.listSafety()).some((x) => x.reason === 'before sync'), 'safety backup before deleting');

  // Someone removes a record file by hand: the record is kept and written again, not deleted.
  fs.unlinkSync(path.join(remote.root, 'records', 'projects', encodeKey(b.id) + '.json'));
  const r3 = await run(mac, remote);
  assert.equal(r3.deletedHere, 0); assert.equal(r3.pushed, 1);
  assert.ok(await mac.repo.getProject(b.id));
});

test('sync: the same project edited on both computers — the newer edit wins, the other becomes a conflict copy', async () => {
  const dir = tmpFolder(), remote = remoteFor(dir);
  const win = await computer('Windows'), mac = await computer('Mac');
  const p = await win.repo.createProject({ name: 'Shared project' });
  await run(win, remote); await run(mac, remote, { mode: 'replaceLocal' });

  const dw = (await win.repo.getProject(p.id)).working.data; dw.design.safetyFactor = 12;
  await win.repo.saveWorking(p.id, dw);
  await later();
  const dm = (await mac.repo.getProject(p.id)).working.data; dm.design.safetyFactor = 18;
  await mac.repo.saveWorking(p.id, dm);

  await run(win, remote);                       // Windows syncs first: no conflict yet
  const r = await run(mac, remote);             // Mac sees both changed
  assert.equal(r.conflicts.length, 1);
  const c = r.conflicts[0];
  await run(win, remote);
  for (const pc of [win, mac]) {
    const list = await live(pc);
    assert.equal(list.length, 2, `${pc.name}: original and conflict copy`);
    const orig = list.find((x) => x.id === p.id), copy = list.find((x) => x.id === c.copyId);
    assert.equal(orig.working.data.design.safetyFactor, 18, 'newer edit (Mac) kept');
    assert.equal(copy.working.data.design.safetyFactor, 12, 'older edit kept as a copy');
    assert.match(copy.name, /conflict copy — Windows/);
    assert.equal(copy.conflictOf.projectId, p.id);
  }
  const quiet = await run(mac, remote);
  assert.equal(quiet.conflicts.length, 0);
});

test('sync: an open project with unsaved changes is not replaced; edit beats delete', async () => {
  const dir = tmpFolder(), remote = remoteFor(dir);
  const win = await computer('Windows'), mac = await computer('Mac');
  const p = await win.repo.createProject({ name: 'Open on Mac' });
  const q = await win.repo.createProject({ name: 'Deleted on Windows, edited on Mac' });
  await run(win, remote); await run(mac, remote, { mode: 'replaceLocal' });

  await win.repo.updateProject(p.id, { name: 'Renamed on Windows' });
  await run(win, remote);
  const r = await run(mac, remote, { skip: new Set([`projects/${p.id}`]) });
  assert.equal(r.deferred.length, 1);
  assert.equal((await mac.repo.getProject(p.id)).name, 'Open on Mac');
  const r2 = await run(mac, remote);
  assert.equal(r2.pulled, 1);
  assert.equal((await mac.repo.getProject(p.id)).name, 'Renamed on Windows');

  await win.repo.trashProject(q.id); await win.repo.purgeProject(q.id);
  await mac.repo.updateProject(q.id, { name: 'Still needed' });
  await run(win, remote);
  const r3 = await run(mac, remote);
  assert.ok(r3.conflicts.some((x) => /deleted on the other computer/.test(x.what)));
  await run(win, remote);
  assert.equal((await win.repo.getProject(q.id)).name, 'Still needed', 'the edited project comes back');
});

test('sync: damaged, invalid and cloud-duplicate files are never imported', async () => {
  const dir = tmpFolder(), remote = remoteFor(dir);
  const win = await computer('Windows'), mac = await computer('Mac');
  const p = await win.repo.createProject({ name: 'Original' });
  await run(win, remote); await run(mac, remote, { mode: 'replaceLocal' });
  const file = path.join(remote.root, 'records', 'projects', encodeKey(p.id) + '.json');

  // Body changed without a matching header hash (partly downloaded / edited by hand).
  const [head, body] = fs.readFileSync(file, 'utf8').split('\n');
  const h = JSON.parse(head); h.hash = 'f'.repeat(64); h.at = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(h) + '\n' + body.replace('Original', 'Tampered') + '\n');
  const r = await run(mac, remote);
  assert.equal(r.rejected.length, 1); assert.match(r.rejected[0].reason, /checksum/);
  assert.equal((await mac.repo.getProject(p.id)).name, 'Original');

  // A record with invalid calculation data, correctly hashed, is rejected by validation.
  const { canonical, sha256 } = require('../js/core/backup.js');
  const bad = JSON.parse(body); bad.working.data = { nonsense: true }; bad.name = 'Bad';
  const bh = await sha256(canonical(bad));
  fs.writeFileSync(file, JSON.stringify({ ...h, hash: bh }) + '\n' + JSON.stringify(bad) + '\n');
  const r2 = await run(mac, remote);
  assert.equal(r2.rejected.length, 1);
  assert.equal((await mac.repo.getProject(p.id)).name, 'Original');

  // A copy made by the cloud service under another name is ignored.
  fs.writeFileSync(file, JSON.stringify(h) + '\n' + body + '\n');
  fs.copyFileSync(file, file.replace('.json', ' (1).json'));
  assert.ok(remote.scan().ignored >= 1);
});

test('sync: iCloud placeholders wait; a new folder starts fresh; file names are safe', async () => {
  const dir = tmpFolder(), remote = remoteFor(dir);
  const win = await computer('Windows');
  const p = await win.repo.createProject({ name: 'Placeholder test' });
  await run(win, remote);
  const name = encodeKey(p.id);
  const f = path.join(remote.root, 'records', 'projects', name + '.json');
  fs.renameSync(f, path.join(path.dirname(f), `.${name}.json.icloud`));
  const r = await run(win, remote);
  assert.equal(r.waiting, 1); assert.equal(r.pushed, 0, 'not re-written while the cloud service still has it');

  const other = remoteFor(tmpFolder());
  const r2 = await run(win, other);
  assert.ok(r2.pushed > 10, 'everything written to a new folder');

  for (const k of ['seed:egypt:cairo:cairo', 'General', 'a/b\\c:d*e?f"g<h>i|j', 'x'.repeat(300)]) {
    const e = encodeKey(k);
    assert.match(e, /^[a-z0-9._~-]+$/); assert.ok(e.length <= 180);
    if (k.length < 100) assert.equal(decodeKey(e), k);
  }
});

test('sync: iCloud Drive, OneDrive and Dropbox are found on Windows and macOS', () => {
  const home = tmpFolder();
  const mk = (...p) => fs.mkdirSync(path.join(home, ...p), { recursive: true });
  mk('iCloudDrive'); mk('OneDrive');
  const win = detectCloudFolders({ platform: 'win32', home, env: { OneDrive: path.join(home, 'OneDrive') } });
  assert.deepEqual(win.map((f) => f.provider), ['iCloud Drive', 'OneDrive']);
  assert.equal(win[0].path, path.join(home, 'iCloudDrive'));
  mk('Library', 'Mobile Documents', 'com~apple~CloudDocs', 'ColdLoad Pro Sync'); mk('Library', 'CloudStorage', 'Dropbox');
  const mac = detectCloudFolders({ platform: 'darwin', home, env: {} });
  assert.equal(mac[0].provider, 'iCloud Drive'); assert.equal(mac[0].existing, true);
  assert.ok(mac.some((f) => f.provider === 'Dropbox'));
});
