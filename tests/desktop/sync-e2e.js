/*
 * Desktop QA — sync between two computers. Two desktop app instances ("Windows PC" and "MacBook") with
 * separate data folders share one sync folder, as two computers would through OneDrive / iCloud Drive.
 * Run: cd desktop && npm run prepare-app && cd .. && NODE_PATH=$(npm root -g) xvfb-run -a node tests/desktop/sync-e2e.js
 */
const { _electron: electron } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DESK = path.join(ROOT, 'desktop');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-sync-e2e-'));
const syncDir = path.join(tmp, 'OneDrive');
fs.mkdirSync(syncDir);
const results = [];
const check = (id, name, ok, detail = '') => { results.push({ id, name, result: ok ? 'PASS' : 'FAIL', detail: String(detail).slice(0, 200) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} ${name}${detail ? ' — ' + detail : ''}`); };

function computer(name) {
  const userData = path.join(tmp, name, 'userData'), saveDir = path.join(tmp, name, 'saved');
  fs.mkdirSync(userData, { recursive: true }); fs.mkdirSync(saveDir, { recursive: true });
  fs.writeFileSync(path.join(userData, 'desktop-settings.json'), JSON.stringify({ autoBackup: false }));
  return { name, userData, launch: () => electron.launch({ executablePath: require(path.join(DESK, 'node_modules', 'electron')), args: [DESK, '--no-sandbox'], env: { ...process.env, COLDLOAD_USER_DATA: userData, COLDLOAD_TEST_SAVE_DIR: saveDir, COLDLOAD_TEST_SYNC_DIR: syncDir } }) };
}
async function start(pc, errs, firstRun) {
  pc.app = await pc.launch(); pc.pg = await pc.app.firstWindow();
  pc.pg.on('pageerror', (e) => errs.push(`${pc.name}: ${e.message}`));
  if (firstRun) {
    await pc.pg.waitForSelector('#n', { timeout: 30000 });
    await pc.pg.fill('#n', `${pc.name} user`); await pc.pg.fill('#u', 'engineer'); await pc.pg.fill('#p1', 'SyncPass2026'); await pc.pg.fill('#p2', 'SyncPass2026');
  } else {
    await pc.pg.waitForSelector('#u', { timeout: 30000 }); await pc.pg.fill('#u', 'engineer'); await pc.pg.fill('#p', 'SyncPass2026');
  }
  await pc.pg.click('button[type=submit]');
  await pc.pg.waitForSelector('.dash', { timeout: 20000 }); await pc.pg.waitForTimeout(1500);
}
const dlgBtn = (pg, label) => pg.click(`.dlg-foot button:has-text("${label}")`);
async function setupSync(pc, deviceName, choice) {
  const pg = pc.pg;
  await pg.evaluate(() => { location.hash = '#/settings/storage'; }); await pg.waitForSelector('button:has-text("Set up sync")', { timeout: 10000 });
  await pg.click('button:has-text("Set up sync")');
  await pg.waitForSelector('.dialog input'); await pg.fill('.dialog input', deviceName); await dlgBtn(pg, 'Continue');
  await pg.waitForSelector('.dialog'); await pg.waitForTimeout(300);
  await dlgBtn(pg, choice);
  await pg.waitForSelector('.dialog h3:has-text("Sync is on")', { timeout: 30000 }); await dlgBtn(pg, 'OK');
  await pg.waitForTimeout(500);
}
const sync = (pc) => pc.pg.evaluate(() => CL.syncUI.runNow());
const projects = (pc) => pc.pg.evaluate(async () => (await CL.App.repo.listProjects()).map((p) => ({ id: p.id, no: p.projectNo, name: p.name, sf: p.working.data.design.safetyFactor, kW: p.summary.totalKW })));

(async () => {
  const errs = [];
  const A = computer('Windows'), B = computer('Mac');
  await start(A, errs, true);
  const pid = await A.pg.evaluate(async () => { const p = await CL.App.repo.createProject({ name: 'Cold store shared' }, HLModel.exampleProject()); CL.App.cache.projects = null; return p.id; });
  await setupSync(A, 'Windows PC', 'Start syncing');
  const root = path.join(syncDir, 'ColdLoad Pro Sync');
  const recFiles = fs.existsSync(path.join(root, 'records', 'projects')) ? fs.readdirSync(path.join(root, 'records', 'projects')) : [];
  check('SYN-1', 'First computer writes its data into the shared folder', fs.existsSync(path.join(root, 'sync.json')) && recFiles.length === 1, `${recFiles.length} project file(s)`);

  await start(B, errs, true);
  await setupSync(B, 'MacBook', 'Use the folder’s data');
  const pa = await projects(A), pb = await projects(B);
  check('SYN-2', 'Second computer joins and receives the project with identical results', pb.length === 1 && pb[0].id === pid && Math.abs(pb[0].kW - pa[0].kW) < 1e-9, `${pb.map((p) => `${p.name} ${p.kW.toFixed(2)} kW`).join(', ')}`);
  check('SYN-3', 'Joining replaces the new computer’s default company (no duplicates)', (await B.pg.evaluate(async () => (await CL.App.repo.listCompanies()).length)) === 1);

  // Edit on the Mac through the editor and Save → sent shortly after saving → received on Windows.
  await B.pg.evaluate(async (id) => { location.hash = `#/project/${id}/details`; }, pid); await B.pg.waitForTimeout(1200);
  await B.pg.evaluate(async () => { CL.App.open.data.design.safetyFactor = 20; CL.App.open.data.rooms[0].safety = 20; CL.App.changed(); await CL.App.save(); });
  await B.pg.waitForTimeout(6000); // automatic sync ~3 s after save
  await sync(A);
  const a2 = (await projects(A))[0], b2 = (await projects(B))[0];
  check('SYN-4', 'An edit saved on one computer appears on the other (with recalculated results)', a2.sf === 20 && Math.abs(a2.kW - b2.kW) < 1e-9 && a2.kW !== pa[0].kW, `safety ${a2.sf} %, ${a2.kW.toFixed(2)} kW`);

  // Project open (no unsaved changes) on Windows is refreshed when it changes on the Mac.
  await A.pg.evaluate(async (id) => { location.hash = `#/project/${id}/details`; }, pid); await A.pg.waitForTimeout(1200);
  await B.pg.evaluate(async () => { CL.App.open.data.design.safetyFactor = 12; CL.App.changed(); await CL.App.save(); await CL.syncUI.runNow(); });
  await sync(A); await A.pg.waitForTimeout(800);
  const openSf = await A.pg.evaluate(() => CL.App.open && CL.App.open.data.design.safetyFactor);
  check('SYN-5', 'An open project without unsaved changes is refreshed from the other computer', openSf === 12, `open copy safety ${openSf} %`);

  // Unsaved changes are never overwritten; after saving, edits made on both computers give a conflict copy.
  await A.pg.evaluate(() => { CL.App.open.data.design.safetyFactor = 7; CL.App.changed(); });
  await B.pg.evaluate(async () => { CL.App.open.data.design.safetyFactor = 25; CL.App.changed(); await CL.App.save(); await CL.syncUI.runNow(); });
  const rep = await A.pg.evaluate(() => CL.syncUI.runNow());
  const keep = await A.pg.evaluate(() => [CL.App.open.dirty, CL.App.open.data.design.safetyFactor]);
  check('SYN-6', 'Unsaved changes in the open project are not overwritten by sync', rep && rep.deferred.length === 1 && keep[0] === true && keep[1] === 7, `deferred ${rep && rep.deferred.length}, on screen ${keep[1]} %`);
  await A.pg.evaluate(async () => { await CL.App.save(); }); await A.pg.waitForTimeout(5000);
  await sync(B); await sync(A);
  const a3 = await projects(A), b3 = await projects(B);
  const copyA = a3.find((p) => p.id !== pid), copyB = b3.find((p) => p.id !== pid);
  check('SYN-7', 'Edited on both computers: the newer edit is kept and the other is saved as a conflict copy on both', a3.length === 2 && b3.length === 2 && copyA && copyB && copyA.id === copyB.id && /conflict copy/.test(copyA.name) && [a3.find((p) => p.id === pid).sf, copyA.sf].sort().join() === '25,7', a3.map((p) => `${p.name}: ${p.sf} %`).join(' | '));
  const toastTxt = await A.pg.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.innerText).join(' | '));
  const toastB = await B.pg.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.innerText).join(' | '));
  check('SYN-8', 'The conflict is reported to the user (not silent)', /changed on both computers/.test(toastTxt + toastB), (toastTxt + ' ' + toastB).slice(0, 150));

  const chip = await A.pg.innerText('#syncstate');
  await A.pg.evaluate(() => { location.hash = '#/settings/storage'; }); await A.pg.waitForTimeout(1200);
  const card = await A.pg.innerText('#view');
  await A.pg.setViewportSize({ width: 1280, height: 900 }).catch(() => {});
  await A.pg.screenshot({ path: path.join(ROOT, 'docs', 'qa', 'screens', '08-sync-settings.png') });
  check('SYN-9', 'Status chip and Settings show the sync state and the other computer', /Synced \d\d:\d\d/.test(chip) && card.includes('MacBook') && card.includes(root), chip);

  // Work done while the other computer is closed arrives when it starts.
  await A.app.close();
  await B.pg.evaluate(async () => { await CL.App.repo.createProject({ name: 'Made on the Mac while the PC was off' }); CL.App.cache.projects = null; await CL.syncUI.runNow(); });
  await start(A, errs, false); await A.pg.waitForTimeout(2500);
  const a4 = await projects(A);
  check('SYN-10', 'Changes made while a computer was closed arrive at its next start', a4.some((p) => p.name === 'Made on the Mac while the PC was off'), `${a4.length} projects`);

  // Deletion (Trash → delete permanently) reaches the other computer.
  const copyId = copyA.id;
  await B.pg.evaluate(async (id) => { location.hash = '#/dashboard'; await new Promise((r) => setTimeout(r, 500)); await CL.App.repo.trashProject(id); await CL.App.repo.purgeProject(id); await CL.syncUI.runNow(); }, copyId);
  await sync(A);
  check('SYN-11', 'A project deleted on one computer is deleted on the other', !(await projects(A)).some((p) => p.id === copyId));

  check('SYN-12', 'No uncaught errors on either computer', errs.length === 0, errs.join(' | '));
  await A.app.close(); await B.app.close();
  const pass = results.filter((x) => x.result === 'PASS').length;
  fs.mkdirSync(path.join(ROOT, 'docs', 'qa'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'qa', 'sync-results.json'), JSON.stringify({ ranAt: new Date().toISOString(), platform: process.platform, pass, fail: results.length - pass, results }, null, 1));
  console.log(`\n${pass} passed, ${results.length - pass} failed`);
  process.exit(results.length - pass ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
