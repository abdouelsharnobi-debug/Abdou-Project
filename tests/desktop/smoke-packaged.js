/*
 * Smoke test for a packaged desktop build: starts the executable with a temporary data folder and
 * waits for the startup log to report the page loaded from app://coldload. Used by CI on Windows and macOS.
 * Run: node tests/desktop/smoke-packaged.js "<path to executable>"
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const exe = process.argv[2];
if (!exe || !fs.existsSync(exe)) { console.error('Executable not found:', exe); process.exit(2); }
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-smoke-'));
const logFile = path.join(userData, 'logs', 'main.log');
const child = spawn(exe, [], { env: { ...process.env, COLDLOAD_USER_DATA: userData, COLDLOAD_TEST_SAVE_DIR: userData }, stdio: 'ignore' });
const t0 = Date.now();
const finish = (ok, msg) => {
  console.log(fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '(no log written)');
  console.log(ok ? `PASS  ${msg}` : `FAIL  ${msg}`);
  try { child.kill(); } catch (e) { /* already gone */ }
  setTimeout(() => process.exit(ok ? 0 : 1), 1000);
};
child.on('exit', (code) => finish(false, `app exited early with code ${code}`));
const timer = setInterval(() => {
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
  if (/uncaughtException|load failed|renderer gone/.test(log)) { clearInterval(timer); child.removeAllListeners('exit'); return finish(false, 'error in startup log'); }
  if (/page loaded app:\/\/coldload\/index\.html/.test(log)) { clearInterval(timer); child.removeAllListeners('exit'); return finish(true, `packaged app started and loaded the page in ${((Date.now() - t0) / 1000).toFixed(1)} s`); }
  if (Date.now() - t0 > 90000) { clearInterval(timer); child.removeAllListeners('exit'); finish(false, 'page did not load within 90 s'); }
}, 500);
