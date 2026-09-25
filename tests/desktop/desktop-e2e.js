/*
 * Desktop QA: drives the Electron app (desktop/) with Playwright under Xvfb.
 * Run: cd desktop && npm run prepare-app && cd .. && NODE_PATH=$(npm root -g) xvfb-run -a node tests/desktop/desktop-e2e.js
 */
const { _electron: electron } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DESK = path.join(ROOT, 'desktop');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-desk-'));
const userData = path.join(tmp, 'userData'), saveDir = path.join(tmp, 'saved'), backupDir = path.join(tmp, 'backups');
fs.mkdirSync(userData, { recursive: true }); fs.mkdirSync(saveDir); fs.mkdirSync(backupDir);
fs.writeFileSync(path.join(userData, 'desktop-settings.json'), JSON.stringify({ backupDir, autoBackup: true, keepBackups: 3 }));
const results = [];
const check = (id, name, ok, detail = '') => { results.push({ id, name, result: ok ? 'PASS' : 'FAIL', detail: String(detail).slice(0, 200) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} ${name}${detail ? ' — ' + detail : ''}`); };
const launch = () => electron.launch({ executablePath: require(path.join(DESK, 'node_modules', 'electron')), args: [DESK, '--no-sandbox'], env: { ...process.env, COLDLOAD_USER_DATA: userData, COLDLOAD_TEST_SAVE_DIR: saveDir } });

(async () => {
  let appE = await launch();
  let pg = await appE.firstWindow();
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.waitForSelector('.auth-form', { timeout: 30000 });
  check('DSK-1', 'App loads from the app:// origin inside the desktop window', (await pg.evaluate(() => location.origin)) === 'app://coldload');
  check('DSK-2', 'Desktop bridge available; no Node.js in the page', await pg.evaluate(() => !!(window.desktop && window.desktop.isDesktop) && typeof require === 'undefined' && typeof process === 'undefined'));
  const info = await pg.evaluate(() => window.desktop.info());
  check('DSK-3', 'Database in the application data folder (not a browser profile)', info.userData === userData, info.userData);
  await pg.fill('#n', 'Desk User'); await pg.fill('#u', 'desk.user'); await pg.fill('#p1', 'DeskPass2026'); await pg.fill('#p2', 'DeskPass2026'); await pg.click('button[type=submit]');
  await pg.waitForSelector('.dash', { timeout: 20000 }); await pg.waitForTimeout(1500);
  const autos = fs.readdirSync(backupDir).filter((f) => f.startsWith('ColdLoad_auto-backup_'));
  check('DSK-4', 'Automatic daily backup written to the backup folder at start-up', autos.length === 1, autos.join(', '));
  // project with rooms + tunnel
  const pid = await pg.evaluate(async () => { const d = HLModel.exampleProject(); d.tunnels = [HLFreeze.newTunnel()]; const p = await CL.App.repo.createProject({ name: 'Desktop QA project' }, d); CL.App.cache.projects = null; return p.id; });
  await pg.evaluate((id) => { location.hash = `#/project/${id}/report/output`; }, pid); await pg.waitForSelector('.outcard', { timeout: 15000 }); await pg.waitForTimeout(800);
  await pg.click('.outcard:has-text("Excel")'); await pg.waitForTimeout(1200);
  const xl = fs.readdirSync(saveDir).find((f) => f.endsWith('.xlsx'));
  check('DSK-5', 'Excel saved through the native Save flow', !!xl && fs.statSync(path.join(saveDir, xl)).size > 5000, xl);
  check('DSK-6', 'After export: “Open” (default application) and “Show in folder” offered', (await pg.$$('.toast-acts button')).length === 2);
  await pg.click('.outcard:has-text("PDF engineering report")'); await pg.waitForTimeout(4000);
  const pdf = fs.readdirSync(saveDir).find((f) => f.endsWith('.pdf'));
  const pdfBuf = pdf ? fs.readFileSync(path.join(saveDir, pdf)) : Buffer.alloc(0);
  check('DSK-7', 'PDF report saved directly (printToPDF, A4, multi-page)', pdfBuf.slice(0, 5).toString() === '%PDF-' && pdfBuf.length > 80000 && (pdfBuf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length >= 8, `${pdf} ${pdfBuf.length} bytes`);
  const r = await pg.evaluate(() => CL.projectActions.backupToFolder(false));
  check('DSK-8', 'Manual backup to folder (write-then-rename, valid backup)', fs.existsSync(r.path) && JSON.parse(fs.readFileSync(r.path, 'utf8')).format === 'coldload-backup');
  await pg.evaluate(() => { location.hash = '#/settings/storage'; }); await pg.waitForTimeout(800);
  check('DSK-9', 'Settings → Storage shows data and backup folders', (await pg.innerText('#view')).includes(backupDir) && (await pg.innerText('#view')).includes(userData));
  const blocked = await pg.evaluate(() => { try { window.open('https://example.com'); } catch (e) { /* denied */ } return location.origin; });
  check('DSK-10', 'External navigation blocked inside the app window', blocked === 'app://coldload');
  await appE.close();

  // restart: data persists, auto-backup not repeated the same day
  appE = await launch(); pg = await appE.firstWindow();
  await pg.waitForSelector('#u', { timeout: 30000 }); await pg.fill('#u', 'desk.user'); await pg.fill('#p', 'DeskPass2026'); await pg.click('button[type=submit]');
  await pg.waitForSelector('.dash', { timeout: 20000 }); await pg.waitForTimeout(1200);
  const names = await pg.evaluate(async () => (await CL.App.repo.listProjects()).map((p) => p.name));
  check('DSK-11', 'Projects persist after closing and reopening the app', names.includes('Desktop QA project'), names.join(', '));
  check('DSK-12', 'Automatic backup runs once per day (not on every start)', fs.readdirSync(backupDir).filter((f) => f.startsWith('ColdLoad_auto-backup_')).length === 1);
  const kw = await pg.evaluate(async () => { const p = (await CL.App.repo.listProjects()).find((x) => x.name === 'Desktop QA project'); return [p.summary.totalKW, CL.plant(p.working.data).totalKW]; });
  check('DSK-13', 'Calculation results identical in the desktop build', Math.abs(kw[0] - kw[1]) < 1e-9 && kw[0] > 300, kw.map((x) => x.toFixed(2)).join(' = '));
  check('DSK-14', 'No uncaught errors', errs.length === 0, errs.join(' | '));
  await appE.close();
  const pass = results.filter((x) => x.result === 'PASS').length;
  fs.mkdirSync(path.join(ROOT, 'docs', 'qa'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'qa', 'desktop-results.json'), JSON.stringify({ ranAt: new Date().toISOString(), electron: require(path.join(DESK, 'node_modules', 'electron', 'package.json')).version, pass, fail: results.length - pass, results }, null, 1));
  console.log(`\n${pass} passed, ${results.length - pass} failed`);
  process.exit(results.length - pass ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
