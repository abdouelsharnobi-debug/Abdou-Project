/*
 * Sync folder (desktop main process, plain Node.js — no Electron APIs, so it is unit-tested directly).
 *
 * Layout inside the folder the user chooses (e.g. in OneDrive, iCloud Drive, Dropbox, Google Drive):
 *   ColdLoad Pro Sync/sync.json                    folder identity { format, formatVersion, folderId }
 *   ColdLoad Pro Sync/records/<store>/<key>.json   one file per record: line 1 = header JSON, line 2 = record JSON
 *   ColdLoad Pro Sync/devices/<deviceId>.json      last sync of each computer (information only)
 * One file per record keeps cloud-service conflicts small; a deletion is a header with deleted:true
 * (tombstone). Files are written to a temporary name and renamed. Copies made by the cloud service
 * ("x (1).json", "x-conflict.json") do not match their record key and are ignored.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORES = ['companies', 'customers', 'projects', 'revisions', 'templates', 'climate', 'references', 'attachments', 'settings'];
const FOLDER_NAME = 'ColdLoad Pro Sync';
const MAX_RECORD = 64 * 1024 * 1024;

/** Record key → file name that is safe on Windows, macOS (case-insensitive) and cloud services. */
function encodeKey(key) {
  const s = String(key).replace(/[^a-z0-9._-]/g, (c) => '~' + c.codePointAt(0).toString(16).padStart(4, '0'));
  return s.length <= 180 ? s : s.slice(0, 100) + '~h' + crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 24);
}
function decodeKey(name) {
  if (/~h[0-9a-f]{24}$/.test(name)) return null; // hashed long key: not reversible (only used for iCloud placeholders)
  return name.replace(/~([0-9a-f]{4})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function readHeader(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const text = buf.subarray(0, n).toString('utf8');
    const nl = text.indexOf('\n');
    if (nl < 0) throw new Error('incomplete file');
    return JSON.parse(text.slice(0, nl));
  } finally { fs.closeSync(fd); }
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.~tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** The folder root: the chosen folder itself if it already is a sync folder, else "<chosen>/ColdLoad Pro Sync". */
function resolveRoot(chosen) {
  if (fs.existsSync(path.join(chosen, 'sync.json'))) return chosen;
  return path.join(chosen, FOLDER_NAME);
}

function createFolderRemote(chosenDir) {
  const root = resolveRoot(path.resolve(chosenDir));
  const recDir = (store) => {
    if (!STORES.includes(store)) throw new Error(`Unknown store ${store}`);
    return path.join(root, 'records', store);
  };
  const cache = new Map(); // file → { mtimeMs, size, header }

  function info({ create = false } = {}) {
    const f = path.join(root, 'sync.json');
    if (fs.existsSync(f)) {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (j.format !== 'coldload-sync' || typeof j.folderId !== 'string') throw new Error('sync.json in this folder is not a ColdLoad sync file.');
      if (j.formatVersion > 1) throw new Error('This sync folder was created by a newer version of ColdLoad Pro. Update the application first.');
      return { root, folderId: j.folderId, createdAt: j.createdAt };
    }
    if (!create) throw new Error(`The sync folder is not available: ${root}`);
    const j = { format: 'coldload-sync', formatVersion: 1, folderId: crypto.randomUUID(), createdAt: new Date().toISOString() };
    writeAtomic(f, JSON.stringify(j, null, 2));
    return { root, folderId: j.folderId, createdAt: j.createdAt };
  }

  /** Headers of all records. pending = files the cloud service has not downloaded yet (iCloud placeholders). */
  function scan() {
    const records = [], pending = [];
    let ignored = 0;
    for (const store of STORES) {
      const dir = recDir(store);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        const file = path.join(dir, name);
        const ph = /^\.(.+)\.json\.icloud$/.exec(name);
        if (ph) { const key = decodeKey(ph[1]); if (key !== null) pending.push({ store, key }); continue; }
        if (name.startsWith('.') || !name.endsWith('.json')) continue;
        let st; try { st = fs.statSync(file); } catch (e) { continue; }
        let c = cache.get(file);
        if (!c || c.mtimeMs !== st.mtimeMs || c.size !== st.size) {
          try { c = { mtimeMs: st.mtimeMs, size: st.size, header: readHeader(file) }; } catch (e) { ignored++; continue; }
          cache.set(file, c);
        }
        const h = c.header;
        if (!h || h.store !== store || typeof h.key !== 'string' || encodeKey(h.key) + '.json' !== name) { ignored++; continue; }
        records.push(h);
      }
    }
    return { records, pending, ignored };
  }

  function read(store, key) {
    const file = path.join(recDir(store), encodeKey(key) + '.json');
    if (fs.statSync(file).size > MAX_RECORD) throw new Error('record too large');
    const text = fs.readFileSync(file, 'utf8');
    const nl = text.indexOf('\n');
    if (nl < 0) throw new Error('incomplete file');
    const header = JSON.parse(text.slice(0, nl));
    const body = text.slice(nl + 1).trim();
    return { header, value: header.deleted ? null : JSON.parse(body) };
  }

  function write(store, key, header, valueJson) {
    if (typeof key !== 'string' || !key) throw new Error('invalid key');
    if (valueJson != null && typeof valueJson !== 'string') throw new Error('invalid record');
    if (valueJson && valueJson.length > MAX_RECORD) throw new Error('record too large');
    const h = { v: 1, store, key, hash: header.hash || null, deleted: !!header.deleted, at: header.at || new Date().toISOString(), device: String(header.device || ''), deviceName: String(header.deviceName || '').slice(0, 80) };
    writeAtomic(path.join(recDir(store), encodeKey(key) + '.json'), JSON.stringify(h) + '\n' + (h.deleted ? '' : valueJson) + '\n');
    return true;
  }

  function writeDevice(d) {
    if (!d || typeof d.deviceId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(d.deviceId)) throw new Error('invalid device');
    const rec = { deviceId: d.deviceId, deviceName: String(d.deviceName || '').slice(0, 80), platform: String(d.platform || '').slice(0, 20), appVersion: String(d.appVersion || '').slice(0, 20), lastSync: new Date().toISOString() };
    writeAtomic(path.join(root, 'devices', `${d.deviceId}.json`), JSON.stringify(rec, null, 2));
    return true;
  }
  function devices() {
    const dir = path.join(root, 'devices');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.')).map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return null; }
    }).filter(Boolean);
  }

  return { root, info, scan, read, write, writeDevice, devices };
}

module.exports = { createFolderRemote, encodeKey, decodeKey, STORES, FOLDER_NAME };
