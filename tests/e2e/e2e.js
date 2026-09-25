/*
 * End-to-end QA (Gate 4). Drives the bundled app (dist/ColdLoadPro.html) in Chromium with a
 * fresh browser profile and records PASS/FAIL checks to docs/qa/e2e-results.json.
 * Run: npm run build && NODE_PATH=$(npm root -g) node tests/e2e/e2e.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const APP = 'file://' + path.join(ROOT, 'dist', 'ColdLoadPro.html');
const LEGACY = 'file://' + path.join(ROOT, 'dist', 'legacy', 'ColdLoadPro-v1.html');
const OUT = path.join(ROOT, 'docs', 'qa');
const results = [];
const CLG = Object.values(require('../../js/core/guide.js').TOPICS).filter((t, i, a) => t !== a.find((x) => x.title === 'Tunnel / blast freezer')).map((t) => t.title);
const check = (id, name, cond, detail = '') => { results.push({ id, name, result: cond ? 'PASS' : 'FAIL', detail: String(detail).slice(0, 300) }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${id} ${name}${detail ? ' — ' + detail : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-e2e-'));

(async () => {
  fs.mkdirSync(path.join(OUT, 'screens'), { recursive: true });
  const ctx = await chromium.launchPersistentContext(path.join(tmp, 'profile'), { viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await pg.addInitScript(() => { delete window.showSaveFilePicker; });
  const shot = (n, full = false) => pg.screenshot({ path: path.join(OUT, 'screens', `${n}.png`), fullPage: full });
  const go = async (hash) => { await pg.evaluate((x) => { location.hash = x; }, hash); await pg.waitForTimeout(500); };

  // --- legacy v1 project present before first start
  await pg.goto(LEGACY); await pg.waitForTimeout(300);
  const legacyKW = await pg.evaluate(() => { const p = HLModel.exampleProject(); p.info.name = 'Legacy v1 project'; localStorage.setItem('coldload-pro-project-v1', JSON.stringify(p)); return HLCalc.calcProject(p).totalKW; });

  // --- first-run setup, no default password
  await pg.goto(APP); await pg.waitForSelector('.auth-form');
  check('SEC-1', 'First start requires creating an administrator (no default password)', await pg.$('#p1') !== null);
  await shot('01-setup');
  await pg.fill('#n', 'QA Engineer'); await pg.fill('#u', 'qa.eng'); await pg.fill('#p1', 'short'); await pg.fill('#p2', 'short'); await pg.click('button[type=submit]'); await pg.waitForTimeout(400);
  check('SEC-2', 'Weak password rejected', /Password must/.test(await pg.textContent('.form-err')));
  await pg.fill('#p1', 'QaPass2026'); await pg.fill('#p2', 'QaPass2026'); await pg.fill('#co', 'Neutral Refrigeration Co.'); await pg.click('button[type=submit]');
  await pg.waitForSelector('.dialog');
  const migText = await pg.innerText('.dialog');
  check('MIG-1', 'v1 project migrated on first start with identical total', migText.includes(legacyKW.toFixed(2)) && /before[\s\S]*after/i.test(migText), migText.replace(/\s+/g, ' ').slice(0, 160));
  await pg.click('.dlg-foot .btn.primary'); await pg.waitForTimeout(600);
  check('MIG-2', 'Legacy localStorage copy kept (rollback)', await pg.evaluate(() => !!localStorage.getItem('coldload-pro-project-v1')));
  const hashDb = await pg.evaluate(async () => JSON.stringify(await CL.App.store.all('users')));
  check('SEC-3', 'Password not stored in plain text', !hashDb.includes('QaPass2026') && hashDb.includes('PBKDF2'));

  // --- details: city picker + design criteria
  await pg.waitForSelector('.cpicker');
  await pg.click('.cp-col:nth-child(1) .cp-it:has-text("Mid-East")'); await pg.click('.cp-col:nth-child(2) .cp-it:has-text("Saudi Arabia")');
  await pg.click('.cp-col:nth-child(3) .cp-it:has-text("Eastern Province")'); await pg.click('.cp-col:nth-child(4) .cp-it:has-text("Dammam")'); await pg.waitForTimeout(300);
  const ins = await pg.$$('.citycard .grid input'); await ins[0].fill('47'); await ins[1].fill('25'); await ins[4].fill('QA test values');
  await pg.click('text=Save to city library and apply'); await pg.waitForTimeout(500);
  check('UX-CITY', 'Region→Country→State→City picker fills design conditions', (await pg.inputValue('[data-f="ambientDB"] input')) === '47' && (await pg.inputValue('[data-f="altitude"] input')) === '10');
  check('SAVE-1', 'Edits show “Unsaved changes”', /Unsaved/.test(await pg.textContent('#savestate')));
  await pg.keyboard.press('Control+s'); await pg.waitForTimeout(500);
  check('SAVE-2', 'Ctrl+S saves and shows “Saved”', /Saved/.test(await pg.textContent('#savestate')));
  await shot('02-details', true);

  // --- design: validation, undo, transparency
  await pg.click('.stepper li:nth-child(2) a'); await pg.waitForSelector('.editor');
  await pg.fill('[data-f="L"] input', '-5'); await pg.waitForTimeout(300);
  check('VAL-1', 'Invalid input raises ERROR and marks field (not corrected)', (await pg.textContent('#msgstrip')).includes('ERROR') && await pg.$eval('[data-f="L"]', (e) => e.classList.contains('has-err')) && (await pg.evaluate(() => CL.App.open.data.rooms[0].dims.L)) === -5);
  await pg.click('.ed-head h2'); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(500);
  check('UNDO-1', 'Undo restores previous value', (await pg.inputValue('[data-f="L"] input')) === '40');
  await pg.click('.ed-head h2'); await pg.keyboard.press('Control+y'); await pg.waitForTimeout(500);
  check('UNDO-2', 'Redo re-applies change', (await pg.inputValue('[data-f="L"] input')) === '-5');
  await pg.click('.ed-head h2'); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(400);
  await pg.click('.tab[data-tab="product"]'); await pg.waitForTimeout(300);
  check('TIP-1', 'Engineering tips available on inputs', (await pg.$$('.tipbtn')).length >= 5);
  await pg.click('[data-f="tIn"] .tipbtn'); await pg.waitForTimeout(200);
  check('TIP-2', 'Tip explains “Entering product temperature”', /Entering product temperature/.test(await pg.textContent('.tippop')));
  await pg.mouse.click(5, 300);
  await pg.click('.tab[data-tab="results"]'); await pg.waitForTimeout(400);
  const blocks = await pg.$$eval('details.calc summary', (s) => s.map((x) => x.innerText));
  check('TRN-1', 'Calculation transparency blocks (formula/inputs/results) per load', blocks.length >= 6 && (await pg.$('details.calc .formula')) !== null, blocks.length + ' blocks');
  await shot('03-results', true);

  // --- machinery standard + override
  await pg.click('.rl-it:has-text("Engine room")'); await pg.waitForTimeout(400);
  await pg.click('text=Save these values as a new common standard'); await pg.click('.dlg-foot .btn.primary'); await pg.waitForTimeout(500);
  await pg.fill('[data-f="setpoint"] input', '20'); await pg.waitForTimeout(300);
  check('MRV-1', 'Machinery room shows Standard / Project / Override', /Project override/.test(await pg.innerText('#mr-status')));
  await pg.keyboard.press('Control+s'); await pg.waitForTimeout(400);
  await pg.evaluate(async () => { const t = (await CL.App.repo.listTemplates('machineryVent'))[0]; t.data.tsaC = 41; t.data.setpoint = 30; await CL.App.repo.saveTemplate(t); CL.App.rerender(); });
  await pg.waitForTimeout(700);
  const unchanged = (await pg.inputValue('[data-f="tsaC"] input')) === '38';
  await pg.click('text=Accept standard v2'); await pg.waitForTimeout(400);
  check('MRV-2', 'Standard update not applied silently; accept keeps overrides', unchanged && (await pg.inputValue('[data-f="tsaC"] input')) === '41' && (await pg.inputValue('[data-f="setpoint"] input')) === '20');
  await pg.keyboard.press('Control+s'); await pg.waitForTimeout(400);
  await shot('04-machinery', true);

  // --- tunnel / blast freezer + reference guide
  const before = await pg.textContent('#ph-total');
  await pg.click('button[title="Add tunnel / blast freezer"]'); await pg.waitForSelector('.editor[data-tn]'); await pg.waitForTimeout(500);
  check('FRZ-1', 'Tunnel freezing time shown by Pham and Plank (hand calc 11.48 / 7.86 h)', (await pg.textContent('[data-out="freezing.phamH"]')).startsWith('11.48') && (await pg.textContent('[data-out="freezing.plankH"]')).startsWith('7.86'));
  const after = await pg.textContent('#ph-total');
  check('FRZ-2', 'Tunnel capacity added to the plant total', parseFloat(after.replace(/,/g, '')) > parseFloat(before.replace(/,/g, '')) + 100, `${before} → ${after}`);
  await pg.keyboard.press('F1'); await pg.waitForTimeout(300);
  check('GUIDE-1', 'Reference guide opens (F1) with the tunnel topic while working', /Tunnel \/ blast freezer/.test(await pg.textContent('.g-body h3')) && /Pham/.test(await pg.textContent('.g-body')));
  await pg.fill('[data-f="batchKg"] input', '12000'); await pg.waitForTimeout(300);
  check('GUIDE-2', 'Guide stays open while editing', (await pg.$('.guide:not([hidden])')) !== null);
  await pg.selectOption('[data-f="libId"] select', { label: 'Fish, fresh' }); await pg.waitForTimeout(400);
  check('FRZ-3', 'Tabulated freezing point above 0 °C is flagged (not corrected)', /Library freezing point/.test(await pg.textContent('#msgstrip')));
  await pg.selectOption('[data-f="libId"] select', { label: 'Poultry, fresh' }); await pg.waitForTimeout(300);
  await pg.click('.rl-it:has-text("Frozen")'); await pg.waitForTimeout(400);
  { const g3 = await pg.textContent('.g-body h3'); check('GUIDE-3', 'Guide follows the current screen (room topic after leaving the tunnel)', !/Tunnel/.test(g3) && Object.values(CLG).includes(g3), g3); }
  await pg.keyboard.press('F1'); await pg.waitForTimeout(200);
  await shot('04b-tunnel', false);
  await pg.keyboard.press('Control+s'); await pg.waitForTimeout(400);

  // --- review & report
  await pg.click('.stepper li:nth-child(3) a'); await pg.waitForTimeout(500);
  await pg.click('text=Revisions & review'); await pg.waitForTimeout(300);
  await pg.click('text=Save new revision'); await pg.fill('.dialog textarea', 'QA revision'); await pg.click('.dlg-foot .btn.primary'); await pg.waitForTimeout(600);
  const revs = await pg.$$eval('.rtable tbody tr td.mono.strong', (t) => t.map((x) => x.textContent.trim()));
  check('REV-1', 'Revisions numbered and history kept (00 migrated, 01 new)', revs.includes('01') && revs.includes('00'), revs.join(','));
  await pg.selectOption('[data-f="status"] select', 'Issued');
  await pg.click('text=Save review'); await pg.waitForSelector('.dialog'); await pg.click('.dlg-foot .btn.primary'); await pg.waitForTimeout(700);
  check('REV-2', 'Issued revision is locked', /locked/.test(await pg.innerText('#view')));
  await pg.click('text=Assumptions'); await pg.waitForTimeout(300);
  check('ASM-1', 'Assumptions register lists defaults/database/user values', (await pg.$$('.rtable tbody tr')).length > 10);
  await pg.click('text=Validation'); await pg.waitForTimeout(300);
  check('VAL-2', 'Validation page shows three levels', (await pg.$$('.vsec')).length === 3);
  await pg.click('text=Report & export'); await pg.waitForTimeout(900);
  const prev = await pg.innerText('.rep-preview');
  check('RPT-1', 'Report contains required sections', ['Project information', 'Design criteria', 'Engineering assumptions', 'Input data', 'Detailed heat load calculations', 'Load summary', 'Design allowances', 'Final refrigeration load', 'Engineering notes', 'Standards and references', 'Revision history', 'Prepared / Checked / Approved'].every((s) => prev.includes(s)));
  check('FRZ-4', 'Report includes the tunnel section with freezing time', prev.includes('Tunnel / blast freezers') && /Pham freezing time/.test(prev));
  check('RPT-2', 'Report traceability block', ['Project ID', 'Calculation engine version', 'Input dataset version', 'Application version', 'Calculation date'].every((s) => prev.includes(s)));
  check('BRAND-1', 'Report uses configured company (no hard-coded brand)', prev.includes('Neutral Refrigeration Co.') && !/Johnson Controls|JCI/.test(prev));
  const [dx] = await Promise.all([pg.waitForEvent('download'), pg.click('.outcard:has-text("Excel")')]);
  await dx.saveAs(path.join(tmp, 'qa.xlsx'));
  check('EXP-1', 'Excel workbook exported', fs.statSync(path.join(tmp, 'qa.xlsx')).size > 5000, dx.suggestedFilename());
  const [dc] = await Promise.all([pg.waitForEvent('download'), pg.click('.outcard:has-text("CSV")')]);
  await dc.saveAs(path.join(tmp, 'qa.csv'));
  check('EXP-2', 'CSV exported with traceability columns', fs.readFileSync(path.join(tmp, 'qa.csv'), 'utf8').includes('engine_version'));
  await pg.evaluate(async () => { window.print = () => {}; const r = await CL.App.repo.listRevisions(CL.App.open.id); await CL.projectActions.print(r[r.length - 1]); });
  await pg.waitForTimeout(700); await pg.emulateMedia({ media: 'print' });
  await pg.pdf({ path: path.join(OUT, 'sample-report.pdf'), preferCSSPageSize: true, printBackground: true });
  await pg.emulateMedia({ media: 'screen' });
  check('EXP-3', 'PDF report generated (A4, page numbers via print CSS)', fs.statSync(path.join(OUT, 'sample-report.pdf')).size > 50000);
  fs.writeFileSync(path.join(tmp, 'qa.xlsx.path'), path.join(tmp, 'qa.xlsx'));

  // --- document center, search, trash, backup/restore
  await pg.click('.actionbar button:has-text("New")'); await pg.fill('.dialog input >> nth=0', 'QA second project'); await pg.click('.dlg-foot .btn.primary'); await pg.waitForTimeout(600);
  check('PRJ-1', 'New project gets its own ID and number (no overwrite)', await pg.evaluate(async () => { const p = await CL.App.repo.listProjects(); return p.length === 2 && new Set(p.map((x) => x.projectNo)).size === 2; }));
  await go('#/documents'); await shot('05-documents');
  await pg.fill('#gsearch', 'dammam'); await pg.waitForTimeout(400);
  check('SRCH-1', 'Global search with partial match (site/city)', (await pg.$$('.ghit')).length >= 1);
  await pg.keyboard.press('Escape');
  const [db] = await Promise.all([pg.waitForEvent('download'), pg.click('.actionbar button:has-text("Backup")').then(() => pg.click('.dlg-foot button:has-text("Full database")'))]);
  await db.saveAs(path.join(tmp, 'full.json'));
  const bk = JSON.parse(fs.readFileSync(path.join(tmp, 'full.json'), 'utf8'));
  check('BAK-1', 'Full backup with checksum and counts; no user accounts', bk.sha256 && bk.counts.projects === 2 && !JSON.stringify(bk).includes('PBKDF2'));
  const tampered = { ...bk, payload: { ...bk.payload, projects: bk.payload.projects.map((p, i) => (i ? p : { ...p, name: 'x' })) } };
  fs.writeFileSync(path.join(tmp, 'tampered.json'), JSON.stringify(tampered));
  let fc = pg.waitForEvent('filechooser'); await pg.click('.actionbar button:has-text("Restore")'); (await fc).setFiles(path.join(tmp, 'tampered.json'));
  await pg.waitForSelector('.dialog'); await pg.waitForTimeout(300);
  check('BAK-2', 'Tampered backup rejected before any change', /failed validation/i.test(await pg.innerText('.dialog')));
  await pg.click('.dlg-foot .btn.primary'); await pg.waitForTimeout(300);
  await pg.click('.dtable tbody tr:first-child button[title="Delete (move to Trash)"]'); await pg.click('.dlg-foot .btn.danger'); await pg.waitForTimeout(500);
  await go('#/documents/trash');
  check('DEL-1', 'Delete moves to Trash (recoverable)', (await pg.$$('.dtable tbody tr')).length === 1);
  fc = pg.waitForEvent('filechooser'); await pg.click('.actionbar button:has-text("Restore")'); (await fc).setFiles(path.join(tmp, 'full.json'));
  await pg.waitForSelector('.dialog'); await pg.waitForTimeout(300);
  const rinfo = await pg.innerText('.dialog');
  check('BAK-3', 'Restore shows date, counts, versions, overwrite warning', /Backup date/.test(rinfo) && /2 project/.test(rinfo) && /engine/.test(rinfo) && /Replace everything/.test(rinfo));
  await pg.click('.dlg-foot button:has-text("Add as copies")'); await pg.waitForTimeout(1200);
  await pg.click('.dlg-foot .btn.primary'); await pg.waitForTimeout(500);
  const nos = await pg.evaluate(async () => (await CL.App.repo.listProjects({ includeDeleted: true })).map((p) => p.projectNo));
  const safety = await pg.evaluate(async () => (await CL.App.backup.listSafety()).length);
  check('BAK-4', 'Restore as copies: unique numbers, safety backup created', new Set(nos).size === nos.length && safety >= 2, nos.join(', '));

  // --- settings / units / theme / responsive
  await pg.evaluate(async () => { CL.App.user = await CL.App.auth.updateProfile(CL.App.user.id, { prefs: { units: 'IP', powerUnit: 'TR' } }); await CL.App.reloadSettings(); });
  const pid = await pg.evaluate(async () => (await CL.App.repo.listProjects()).find((p) => p.name.startsWith('Legacy') && !p.name.includes('copy')).id);
  await go(`#/project/${pid}/design`); await pg.waitForTimeout(400);
  await pg.click('.tab[data-tab="general"]'); await pg.waitForTimeout(400);
  check('UNIT-1', 'IP units: temperature in °F, length in ft, load in TR', (await pg.textContent('[data-f="T"] .unit')) === '°F' && (await pg.textContent('[data-f="L"] .unit')) === 'ft' && /TR/.test(await pg.textContent('#live .big')));
  await pg.evaluate(async () => { CL.App.user = await CL.App.auth.updateProfile(CL.App.user.id, { prefs: { units: 'SI', powerUnit: 'kW' } }); await CL.App.reloadSettings(); });
  await go('#/dashboard');
  await pg.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await shot('06-dashboard-dark');
  const darkBg = await pg.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('THEME-1', 'Dark mode applies', darkBg !== 'rgb(242, 244, 247)', darkBg);
  await pg.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await pg.setViewportSize({ width: 390, height: 860 });
  let overflow = [];
  for (const h of ['#/dashboard', '#/documents', '#/customers', '#/standards', '#/settings', '#/settings/engineering', '#/settings/climate', '#/settings/storage', '#/settings/security', '#/help', `#/project/${pid}/report/review`, `#/project/${pid}/report/attachments`, `#/project/${pid}/report/assumptions`, `#/project/${pid}/details`, `#/project/${pid}/design`, `#/project/${pid}/report/results`]) {
    await go(h); const w = await pg.evaluate(() => document.documentElement.scrollWidth); if (w > 392) overflow.push(`${h}:${w}`);
  }
  check('RESP-1', 'No horizontal page scroll at 390 px width', overflow.length === 0, overflow.join(' '));
  await shot('07-mobile');
  await pg.setViewportSize({ width: 1440, height: 950 });
  // unsaved-change guard
  await go(`#/project/${pid}/details`); await pg.fill('[data-f="groundTemp"] input', '11'); await pg.waitForTimeout(200);
  await go('#/dashboard'); await pg.waitForTimeout(300);
  check('SAVE-3', 'Leaving a modified project asks Save / Discard / Cancel', /Unsaved changes/.test(await pg.innerText('.dialog')));
  await pg.click('.dlg-foot button:has-text("Discard changes")'); await pg.waitForTimeout(400);
  // sign out / sign in with wrong password
  await pg.evaluate(() => CL.App.signOut()); await pg.waitForSelector('#u');
  await pg.fill('#u', 'qa.eng'); await pg.fill('#p', 'wrong1234'); await pg.click('button[type=submit]'); await pg.waitForTimeout(500);
  check('SEC-4', 'Sign out; wrong password rejected', /Incorrect/.test(await pg.textContent('.form-err')));
  check('ERR-1', 'No uncaught errors during the run', errs.length === 0, errs.join(' | '));

  await ctx.close();
  const summary = { ranAt: new Date().toISOString(), pass: results.filter((r) => r.result === 'PASS').length, fail: results.filter((r) => r.result === 'FAIL').length, results };
  fs.writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify(summary, null, 1));
  console.log(`\n${summary.pass} passed, ${summary.fail} failed`);
  process.exit(summary.fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
