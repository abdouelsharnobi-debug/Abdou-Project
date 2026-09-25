/*
 * Sync between computers through a shared folder (desktop version).
 *
 * Three-way comparison per record, using the hash each record had at the last successful sync ("base"):
 *   changed here only   → write it to the folder
 *   changed there only  → take it from the folder (validated first; deletions only via explicit tombstones)
 *   changed on both     → projects: the newer edit keeps the project, the other edit becomes a separate
 *                         "conflict copy" project (nothing is lost); other records: the newer edit wins and a
 *                         safety backup of this computer's data is stored first.
 * A project open with unsaved changes is never replaced ("deferred"). User accounts, sessions, the audit
 * log and safety backups stay on each computer.
 *
 * remote = { info(), scan(), read(store, key), write(store, key, header, valueJson), writeDevice(d) }
 */
(function (root) {
  'use strict';
  const STORES = ['companies', 'customers', 'projects', 'revisions', 'templates', 'climate', 'references', 'attachments', 'settings'];
  const LOCAL_ONLY = new Set(['settings/lastBackup']); // device-specific
  const keyField = (s) => (s === 'settings' ? 'key' : 'id');
  const K = (s, k) => `${s}/${k}`;

  function createSync(store, deps) {
    const { backup, migrate, version, repo } = deps;
    const { canonical, sha256 } = root.CL.backup;
    const hashOf = (v) => sha256(canonical(v));
    let running = null;

    async function getState() { return (await store.get('meta', 'sync')) || { key: 'sync', folderId: null, base: {} }; }

    function validRecord(s, v, key) {
      if (!v || typeof v !== 'object' || Array.isArray(v) || v[keyField(s)] !== key) return 'record key does not match';
      if (s === 'projects') { const r = migrate.validateV1(v.working && v.working.data); if (!r.ok) return r.errors[0]; }
      if (s === 'revisions') { const r = migrate.validateV1(v.data); if (!r.ok) return r.errors[0]; }
      return null;
    }
    const stamp = (v) => (v && (v.modifiedAt || (v.review && v.review.updatedAt) || v.createdAt || v.addedAt)) || '';

    /**
     * Run one sync. opts: { deviceId, deviceName, platform, skip: Set of "store/key" not to replace locally,
     * mode: 'merge' (default) | 'replaceLocal' (this computer takes the folder's data; used when joining) }
     */
    function run(remote, opts) {
      if (running) return running;
      running = doRun(remote, opts).finally(() => { running = null; });
      return running;
    }

    async function doRun(remote, { deviceId, deviceName = '', platform = '', skip = new Set(), mode = 'merge' } = {}) {
      const t0 = Date.now();
      const info = await remote.info();
      let st = await getState();
      if (st.folderId !== info.folderId) st = { key: 'sync', folderId: info.folderId, base: {} };
      const base = st.base;
      const scan = await remote.scan();
      const R = new Map();
      for (const h of scan.records) if (STORES.includes(h.store) && !LOCAL_ONLY.has(K(h.store, h.key))) R.set(K(h.store, h.key), h);
      const pending = new Set((scan.pending || []).map((p) => K(p.store, p.key)));
      const L = new Map();
      for (const s of STORES) for (const v of await store.all(s)) {
        const k = K(s, v[keyField(s)]);
        if (!LOCAL_ONLY.has(k)) L.set(k, { s, key: v[keyField(s)], value: v, hash: await hashOf(v) });
      }

      const rep = { pulled: 0, pushed: 0, deletedHere: 0, deletedThere: 0, conflicts: [], deferred: [], rejected: [], waiting: pending.size, ignored: scan.ignored || 0, changed: [] };
      const pulls = [];   // { k, s, key, value|null, hash|null, expect }
      const pushes = [];  // { k, s, key, value|null, hash|null }
      let needSafety = mode === 'replaceLocal';
      const now = new Date().toISOString();

      const readRemote = async (s, key, h) => {
        try {
          const r = await remote.read(s, key);
          if (r.header.hash !== h.hash) throw new Error('changed while reading');
          if (!r.header.deleted && (await hashOf(r.value)) !== h.hash) throw new Error('checksum mismatch');
          const bad = r.header.deleted ? null : validRecord(s, r.value, key);
          if (bad) { rep.rejected.push({ store: s, key, reason: bad }); return undefined; }
          return r.value;
        } catch (e) { rep.rejected.push({ store: s, key, reason: e.message }); return undefined; }
      };
      const pull = async (k, s, key, h, l) => {
        if (skip.has(k)) { rep.deferred.push({ store: s, key }); return false; }
        const value = h && !h.deleted ? await readRemote(s, key, h) : null;
        if (value === undefined) return false;
        if (value === null && !l) { base[k] = null; return true; }
        pulls.push({ k, s, key, value, hash: value === null ? null : h.hash, expect: l ? l.hash : null });
        return true;
      };

      for (const k of new Set([...L.keys(), ...R.keys()])) {
        const l = L.get(k), h = R.get(k);
        const s = l ? l.s : h.store, key = l ? l.key : h.key;
        const lv = l ? l.hash : null;
        if (!h) {                                   // nothing in the folder for this record
          if (pending.has(k)) continue;            // not downloaded yet by the cloud service
          if (mode === 'replaceLocal') { pulls.push({ k, s, key, value: null, hash: null, expect: lv }); continue; }
          if (l) pushes.push({ k, s, key, value: l.value, hash: lv });
          continue;
        }
        const rv = h.deleted ? null : h.hash;
        if (mode === 'replaceLocal') { if (lv !== rv) await pull(k, s, key, h, l); else base[k] = rv; continue; }
        if (lv === rv) { base[k] = rv; continue; }
        const known = Object.prototype.hasOwnProperty.call(base, k), b = base[k];
        const localSame = known ? lv === b : lv === null;
        const remoteSame = known ? rv === b : rv === null;
        if (localSame) { if (rv === null) needSafety = true; await pull(k, s, key, h, l); continue; }
        if (remoteSame) { pushes.push({ k, s, key, value: l ? l.value : null, hash: lv }); continue; }
        // Changed on both computers.
        if (lv === null) { await pull(k, s, key, h, l); rep.conflicts.push({ store: s, key, what: 'deleted here, changed on the other computer — kept the changed record' }); continue; }
        if (rv === null) { pushes.push({ k, s, key, value: l.value, hash: lv }); rep.conflicts.push({ store: s, key, what: 'deleted on the other computer, changed here — kept the changed record' }); continue; }
        if (skip.has(k)) { rep.deferred.push({ store: s, key }); continue; }
        const other = await readRemote(s, key, h);
        if (other === undefined) continue;
        const remoteNewer = stamp(other) > stamp(l.value);
        if (s === 'projects') {
          const [win, lose, loseFrom] = remoteNewer ? [other, l.value, deviceName || 'this computer'] : [l.value, other, h.deviceName || 'the other computer'];
          const copy = JSON.parse(JSON.stringify(lose));
          copy.id = root.crypto.randomUUID();
          copy.name = `${lose.name} (conflict copy — ${loseFrom} ${now.slice(0, 16).replace('T', ' ')})`;
          copy.projectNo = `${lose.projectNo}-C${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
          copy.currentRevId = null; if (copy.working) copy.working.baseRevId = null;
          copy.conflictOf = { projectId: lose.id, projectNo: lose.projectNo, device: loseFrom, at: now };
          const ch = await hashOf(copy);
          pulls.push({ k: K(s, copy.id), s, key: copy.id, value: copy, hash: ch, expect: null });
          pushes.push({ k: K(s, copy.id), s, key: copy.id, value: copy, hash: ch });
          if (remoteNewer) pulls.push({ k, s, key, value: other, hash: rv, expect: lv });
          else pushes.push({ k, s, key, value: l.value, hash: lv });
          rep.conflicts.push({ store: s, key, name: win.name, copyId: copy.id, copyNo: copy.projectNo, what: `edited on both computers — the newer edit is kept, the other is saved as project ${copy.projectNo}` });
        } else {
          if (remoteNewer) { needSafety = true; pulls.push({ k, s, key, value: other, hash: rv, expect: lv }); }
          else pushes.push({ k, s, key, value: l.value, hash: lv });
          rep.conflicts.push({ store: s, key, what: `edited on both computers — kept the newer edit (${remoteNewer ? 'other computer' : 'this computer'})${remoteNewer ? '; a safety backup of the previous data was stored' : ''}` });
        }
      }

      // Apply incoming changes in one transaction, skipping records edited here while this sync was running.
      if (pulls.length) {
        if (needSafety && backup && pulls.some((p) => p.expect !== null)) await backup.safetyBackup(mode === 'replaceLocal' ? 'before joining sync folder' : 'before sync', deviceName);
        const ops = [];
        for (const p of pulls) {
          if (p.expect !== null) {
            const cur = await store.get(p.s, p.key);
            if (!cur || (await hashOf(cur)) !== p.expect) { rep.deferred.push({ store: p.s, key: p.key }); continue; }
          }
          ops.push(p.value === null ? { op: 'del', store: p.s, key: p.key } : { op: 'put', store: p.s, value: p.value });
          base[p.k] = p.hash;
          if (p.value === null) rep.deletedHere++; else rep.pulled++;
          rep.changed.push({ store: p.s, key: p.key });
        }
        ops.push({ op: 'put', store: 'meta', value: st });
        await store.batch(ops);
      }

      // Write outgoing changes.
      const hdr = (p) => ({ hash: p.hash, deleted: p.value === null, at: now, device: deviceId, deviceName });
      for (const p of pushes) {
        await remote.write(p.s, p.key, hdr(p), p.value === null ? null : JSON.stringify(p.value));
        base[p.k] = p.hash;
        if (p.value === null) rep.deletedThere++; else rep.pushed++;
      }
      if (deviceId) { try { await remote.writeDevice({ deviceId, deviceName, platform, appVersion: version ? version.APP_VERSION : '' }); } catch (e) { /* information only */ } }

      // Projects that share a number (created on both computers while apart) are reported, never renumbered.
      const counts = new Map();
      for (const p of await store.all('projects')) if (!p.deletedAt) counts.set(p.projectNo, (counts.get(p.projectNo) || 0) + 1);
      rep.duplicates = [...counts].filter(([, n]) => n > 1).map(([no]) => no);

      st.lastRun = new Date().toISOString();
      st.lastReport = { at: st.lastRun, pulled: rep.pulled, pushed: rep.pushed, deletedHere: rep.deletedHere, deletedThere: rep.deletedThere, conflicts: rep.conflicts.slice(0, 50), rejected: rep.rejected.slice(0, 50), deferred: rep.deferred.length, waiting: rep.waiting, duplicates: rep.duplicates, ms: Date.now() - t0 };
      st.history = [st.lastReport, ...(st.history || [])].filter((r) => r.pulled || r.pushed || r.deletedHere || r.deletedThere || r.conflicts.length || r.rejected.length).slice(0, 20);
      await store.put('meta', st);
      if (repo && (rep.conflicts.length || rep.rejected.length)) await repo.audit('sync', 'sync', info.folderId, `conflicts=${rep.conflicts.length}; rejected=${rep.rejected.length}`);
      rep.ms = Date.now() - t0;
      return rep;
    }

    /** What joining a folder would do: counts used to ask the user how to start. */
    async function preview(remote) {
      const scan = await remote.scan();
      const live = scan.records.filter((h) => !h.deleted && STORES.includes(h.store));
      const projectsThere = live.filter((h) => h.store === 'projects').length;
      const projectsHere = (await store.all('projects')).length;
      return { recordsThere: live.length, projectsThere, projectsHere };
    }

    async function status() { const s = await getState(); return { folderId: s.folderId, lastRun: s.lastRun || null, lastReport: s.lastReport || null, history: s.history || [] }; }
    async function forget() { await store.del('meta', 'sync'); }

    return { run, preview, status, forget };
  }

  const api = { createSync, STORES };
  root.CL = root.CL || {};
  root.CL.sync = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
