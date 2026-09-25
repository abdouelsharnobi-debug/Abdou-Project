/*
 * ColdLoad Pro — desktop shell for Windows and macOS (Electron main process).
 * The application itself is the same offline web app (app/index.html). This shell adds:
 *  - a fixed app:// origin so the database lives in %APPDATA%\ColdLoad Pro (not a browser profile)
 *  - native Save dialogs, "open with default application", direct PDF export
 *  - automatic backups to a folder the user chooses
 *  - sync between computers through a shared cloud folder (sync-folder.js)
 * Security: sandboxed renderer, context isolation, no Node.js in the page, navigation locked.
 */
const { app, BrowserWindow, protocol, net, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const os = require('os');
const { createFolderRemote } = require('./sync-folder');

const APP_DIR = path.join(__dirname, 'app');
// Automated tests only: when set, Save dialogs are skipped and files go to this folder.
const TEST_SAVE_DIR = process.env.COLDLOAD_TEST_SAVE_DIR || null;
// Automated tests only: when set, the sync-folder chooser returns this folder without a dialog.
const TEST_SYNC_DIR = process.env.COLDLOAD_TEST_SYNC_DIR || null;
async function askSavePath(opts) {
  if (TEST_SAVE_DIR) return { canceled: false, filePath: path.join(TEST_SAVE_DIR, path.basename(opts.defaultPath)) };
  return dialog.showSaveDialog(win, opts);
}
const ORIGIN = 'app://coldload';
app.setName('ColdLoad Pro');
if (process.env.COLDLOAD_USER_DATA) app.setPath('userData', process.env.COLDLOAD_USER_DATA); // automated tests only
if (process.platform === 'win32') app.setAppUserModelId('com.coldload.pro');

/* Support log: %APPDATA%\ColdLoad Pro\logs\main.log (last ~1 MB). */
function log(...a) {
  try {
    const dir = path.join(app.getPath('userData'), 'logs'); fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'main.log');
    if (fs.existsSync(f) && fs.statSync(f).size > 1e6) fs.renameSync(f, f + '.1');
    fs.appendFileSync(f, `${new Date().toISOString()} ${a.map(String).join(' ')}\n`);
  } catch (e) { /* logging must never break the app */ }
}
process.on('uncaughtException', (e) => { log('uncaughtException', e && e.stack); });
log('start', app.getVersion(), process.platform, process.arch, 'electron', process.versions.electron);

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

const gotLock = app.requestSingleInstanceLock();
log('single-instance lock', gotLock);
if (!gotLock) { app.quit(); }

let win = null;
const settingsFile = () => path.join(app.getPath('userData'), 'desktop-settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch (e) { return {}; }
}
function writeSettings(s) { fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); }
function defaultBackupDir() { return path.join(app.getPath('documents'), 'ColdLoad Pro', 'Backups'); }

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function serveApp() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(APP_DIR, rel));
    if (!file.startsWith(APP_DIR)) return new Response('Forbidden', { status: 403 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    if (file.endsWith('.html')) headers.set('Content-Security-Policy', CSP);
    return new Response(res.body, { status: res.status, headers });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 680, show: false,
    title: 'ColdLoad Pro', backgroundColor: '#f2f4f7', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  let shown = false;
  const reveal = (why) => { if (shown || !win) return; shown = true; log('show window', why); win.maximize(); win.show(); };
  win.once('ready-to-show', () => reveal('ready-to-show'));
  setTimeout(() => reveal('fallback'), 3000); // never leave the user without a window
  win.loadURL(`${ORIGIN}/index.html`);
  win.webContents.on('did-finish-load', () => log('page loaded', win.webContents.getURL()));
  win.webContents.on('did-fail-load', (e, code, desc, url) => log('load failed', code, desc, url));
  win.webContents.on('render-process-gone', (e, d) => log('renderer gone', JSON.stringify(d)));

  // Links: only the app itself inside the window; http(s) links open in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });

  // The app blocks unload while a project has unsaved changes: ask the user natively.
  win.webContents.on('will-prevent-unload', (e) => {
    if (TEST_SAVE_DIR) { e.preventDefault(); return; }
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: ['Stay and save', 'Close without saving'], defaultId: 0, cancelId: 0,
      title: 'Unsaved changes', message: 'The open project has unsaved changes.', detail: 'Choose “Stay and save”, then press Ctrl+S.',
    });
    if (choice === 1) e.preventDefault(); // preventDefault here = allow the unload
  });
  win.on('closed', () => { win = null; });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [{ label: 'Open data folder', click: () => shell.openPath(app.getPath('userData')) }, { label: 'Open backup folder', click: () => { const d = readSettings().backupDir || defaultBackupDir(); fs.mkdirSync(d, { recursive: true }); shell.openPath(d); } }, ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: 'Exit' }])] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'toggleDevTools', label: 'Developer tools (support)' }] },
    ...(isMac ? [{ role: 'windowMenu' }] : []),
    { label: 'Help', submenu: [{ label: `About ColdLoad Pro ${app.getVersion()}`, click: () => dialog.showMessageBox(win, { type: 'info', title: 'About ColdLoad Pro', message: `ColdLoad Pro ${app.getVersion()} (desktop)`, detail: `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}\nData folder: ${app.getPath('userData')}` }) }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------- IPC (called from preload.js) ---------------- */
const MAX_BYTES = 200 * 1024 * 1024;
const toBuffer = (data) => (typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data));
const safeName = (n) => String(n || 'file').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 180);

function registerIpc() {
  ipcMain.handle('desk:info', () => {
    const s = readSettings();
    return { platform: process.platform, version: app.getVersion(), electron: process.versions.electron, userData: app.getPath('userData'),
      backupDir: s.backupDir || defaultBackupDir(), autoBackup: s.autoBackup !== false, keepBackups: s.keepBackups || 20, lastAutoBackup: s.lastAutoBackup || null };
  });

  ipcMain.handle('desk:saveFile', async (e, { name, data, filters }) => {
    const buf = toBuffer(data);
    if (buf.length > MAX_BYTES) throw new Error('File too large.');
    const s = readSettings();
    const r = await askSavePath({ defaultPath: path.join(s.lastSaveDir || app.getPath('documents'), safeName(name)), filters: filters && filters.length ? filters : undefined });
    if (r.canceled || !r.filePath) return { saved: false };
    fs.writeFileSync(r.filePath, buf);
    writeSettings({ ...s, lastSaveDir: path.dirname(r.filePath) });
    return { saved: true, path: r.filePath, name: path.basename(r.filePath) };
  });

  ipcMain.handle('desk:printToPDF', async (e, { name }) => {
    const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: 'A4', generateDocumentOutline: true });
    const s = readSettings();
    const r = await askSavePath({ defaultPath: path.join(s.lastSaveDir || app.getPath('documents'), safeName(name)), filters: [{ name: 'PDF document', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return { saved: false };
    fs.writeFileSync(r.filePath, pdf);
    writeSettings({ ...s, lastSaveDir: path.dirname(r.filePath) });
    return { saved: true, path: r.filePath, name: path.basename(r.filePath) };
  });

  ipcMain.handle('desk:openPath', async (e, p) => {
    if (typeof p !== 'string' || !fs.existsSync(p)) throw new Error('File not found.');
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
    return true;
  });
  ipcMain.handle('desk:showInFolder', (e, p) => { if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p); return true; });
  ipcMain.handle('desk:openDataFolder', () => shell.openPath(app.getPath('userData')));

  ipcMain.handle('desk:chooseBackupDir', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Backup folder', properties: ['openDirectory', 'createDirectory'], defaultPath: readSettings().backupDir || defaultBackupDir() });
    if (r.canceled || !r.filePaths[0]) return null;
    writeSettings({ ...readSettings(), backupDir: r.filePaths[0] });
    return r.filePaths[0];
  });
  ipcMain.handle('desk:setBackupOptions', (e, { autoBackup, keepBackups }) => {
    writeSettings({ ...readSettings(), autoBackup: !!autoBackup, keepBackups: Math.max(1, Math.min(365, +keepBackups || 20)) });
    return true;
  });

  /* ---- Sync between computers through a shared (cloud) folder; the logic is in js/core/sync.js ---- */
  let remote = null, remoteDir = null;
  const getRemote = () => {
    const s = readSettings();
    if (!s.syncEnabled || !s.syncDir) throw new Error('Sync is not set up on this computer.');
    if (remoteDir !== s.syncDir) { remote = createFolderRemote(s.syncDir); remoteDir = s.syncDir; }
    return remote;
  };
  const syncInfo = () => {
    const s = readSettings();
    return { enabled: !!(s.syncEnabled && s.syncDir), dir: s.syncDir || null, root: s.syncDir ? createFolderRemote(s.syncDir).root : null,
      deviceName: s.syncDeviceName || os.hostname().replace(/\.local$/, ''), platform: process.platform, intervalMin: s.syncIntervalMin || 2 };
  };
  ipcMain.handle('desk:sync:get', () => syncInfo());
  ipcMain.handle('desk:sync:choose', async () => {
    if (TEST_SYNC_DIR) return TEST_SYNC_DIR;
    const r = await dialog.showOpenDialog(win, { title: 'Choose a folder that is synced to all your computers (OneDrive, iCloud Drive, Dropbox, Google Drive…)', properties: ['openDirectory', 'createDirectory'], defaultPath: readSettings().syncDir || app.getPath('home') });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  });
  // Look at a folder before connecting (creates nothing).
  ipcMain.handle('desk:sync:inspect', (e, dir) => {
    const r = createFolderRemote(String(dir));
    let exists = true; try { r.info(); } catch (err) { exists = false; }
    return { root: r.root, exists, devices: exists ? r.devices() : [], scan: exists ? r.scan() : { records: [], pending: [], ignored: 0 } };
  });
  ipcMain.handle('desk:sync:connect', (e, { dir, deviceName }) => {
    const r = createFolderRemote(String(dir));
    const info = r.info({ create: true });
    writeSettings({ ...readSettings(), syncEnabled: true, syncDir: String(dir), syncDeviceName: String(deviceName || '').slice(0, 80) || undefined });
    remote = r; remoteDir = String(dir);
    log('sync connected', info.root);
    return syncInfo();
  });
  ipcMain.handle('desk:sync:disconnect', () => { writeSettings({ ...readSettings(), syncEnabled: false }); remote = null; remoteDir = null; log('sync turned off'); return syncInfo(); });
  ipcMain.handle('desk:sync:setOptions', (e, { deviceName, intervalMin }) => {
    writeSettings({ ...readSettings(), syncDeviceName: String(deviceName || '').slice(0, 80) || undefined, syncIntervalMin: Math.max(1, Math.min(60, +intervalMin || 2)) });
    return syncInfo();
  });
  ipcMain.handle('desk:sync:info', () => getRemote().info());
  ipcMain.handle('desk:sync:scan', () => getRemote().scan());
  ipcMain.handle('desk:sync:read', (e, { store, key }) => getRemote().read(store, key));
  ipcMain.handle('desk:sync:write', (e, { store, key, header, json }) => getRemote().write(store, key, header, json));
  ipcMain.handle('desk:sync:writeDevice', (e, d) => getRemote().writeDevice(d));
  ipcMain.handle('desk:sync:devices', () => getRemote().devices());
  ipcMain.handle('desk:sync:openFolder', () => { const r = getRemote(); return shell.openPath(r.root); });

  // Automatic / folder backup: write the JSON (built by the app) into the backup folder and prune old ones.
  ipcMain.handle('desk:writeBackup', (e, { json, auto }) => {
    const s = readSettings();
    const dir = s.backupDir || defaultBackupDir();
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const file = path.join(dir, `ColdLoad_${auto ? 'auto' : 'manual'}-backup_${stamp}.coldload-backup.json`);
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, json);            // write-then-rename: never leaves a half-written backup
    fs.renameSync(tmp, file);
    const keep = s.keepBackups || 20;
    const autos = fs.readdirSync(dir).filter((f) => /^ColdLoad_auto-backup_.*\.coldload-backup\.json$/.test(f)).sort().reverse();
    for (const f of autos.slice(keep)) { try { fs.unlinkSync(path.join(dir, f)); } catch (err) { /* ignore */ } }
    if (auto) writeSettings({ ...readSettings(), lastAutoBackup: new Date().toISOString() });
    return { path: file, dir };
  });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => { log('ready; data folder', app.getPath('userData')); serveApp(); registerIpc(); buildMenu(); createWindow(); });
app.on('window-all-closed', () => { log('all windows closed'); app.quit(); });
app.on('quit', (e, code) => log('quit', code));
