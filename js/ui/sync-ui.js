/*
 * Sync between computers (desktop version): status chip, automatic runs, and the Settings → Storage card.
 * Runs at sign-in, every few minutes, when the window regains focus, and shortly after each save.
 * The engine is js/core/sync.js; the folder access is in the desktop shell (desktop/sync-folder.js).
 */
(function (root) {
  'use strict';
  const CL = root.CL, App = CL.App;
  const { h, icon, btn, toast, modal, confirmDlg, formDlg, alertDlg, fdate, errorDlg } = CL.ui;

  const S = { engine: null, cfg: null, timer: null, soonTimer: null, busy: false, last: null, error: null, lastFocus: 0, shownError: '', dupShown: '' };
  const bridge = () => root.desktop && root.desktop.sync;
  const available = () => !!bridge();
  const remote = () => {
    const b = bridge();
    return { info: () => b.info(), scan: () => b.scan(), read: (s, k) => b.read(s, k), write: (s, k, hd, json) => b.write(s, k, hd, json), writeDevice: (d) => b.writeDevice(d) };
  };
  function engine() {
    if (!S.engine) S.engine = CL.sync.createSync(App.store, { backup: App.backup, migrate: root.HLMigrate, version: CL.version, repo: App.repo });
    return S.engine;
  }
  async function deviceId() { const m = await App.store.get('meta', 'schema'); return m.installId; }

  /* ---------- status chip in the top bar ---------- */
  function badge() {
    if (!available()) return null;
    return h('button', { id: 'syncstate', class: 'savestate none', type: 'button', title: 'Sync between computers — Settings → Storage', onclick: () => App.go('settings/storage') }, icon('sync', 14), h('span', {}, 'Sync off'));
  }
  function paint() {
    const el = document.getElementById('syncstate'); if (!el) return;
    const txt = el.querySelector('span');
    let cls = 'none', t = 'Sync off', tip = 'Sync between computers is off — Settings → Storage';
    if (S.cfg && S.cfg.enabled) {
      if (S.busy) { cls = 'saving'; t = 'Syncing…'; tip = 'Synchronising with the shared folder'; }
      else if (S.error) { cls = 'dirty'; t = 'Sync problem'; tip = S.error; }
      else if (S.last) { cls = ''; t = `Synced ${new Date(S.last).toTimeString().slice(0, 5)}`; tip = `Last sync ${fdate(S.last, true)} · ${S.cfg.root}`; }
      else { t = 'Sync on'; tip = S.cfg.root; }
    }
    el.className = 'savestate ' + cls; txt.textContent = t; el.title = tip;
  }

  /* ---------- running ---------- */
  function skipSet() {
    const o = App.open;
    return new Set(o && (o.dirty || o.saving || App.pendingMeta) ? [`projects/${o.id}`] : []);
  }

  async function runNow({ manual = false, mode = 'merge' } = {}) {
    if (!available() || !App.user) return null;
    S.cfg = await bridge().get();
    if (!S.cfg.enabled) { paint(); return null; }
    if (S.busy) return null;
    S.busy = true; paint();
    try {
      const rep = await engine().run(remote(), { deviceId: await deviceId(), deviceName: S.cfg.deviceName, platform: S.cfg.platform, skip: skipSet(), mode });
      S.last = new Date().toISOString(); S.error = null; S.shownError = '';
      await afterRun(rep, manual);
      return rep;
    } catch (e) {
      S.error = `Sync failed: ${e.message}`;
      if (manual) errorDlg('Synchronising', e, 'Check that the sync folder is available (cloud drive running and signed in), then try again. Your data on this computer is unchanged.');
      else if (S.shownError !== e.message) { S.shownError = e.message; toast(`${S.error}. Your data on this computer is unchanged.`, 'err', 8000, [{ label: 'Details', run: () => App.go('settings/storage') }]); }
      return null;
    } finally { S.busy = false; paint(); }
  }

  async function afterRun(rep, manual) {
    const changed = rep.changed || [];
    if (changed.length) {
      App.cache.projects = null;
      if (changed.some((c) => c.store === 'settings')) await App.reloadSettings();
      const o = App.open;
      const openChanged = o && changed.some((c) => c.store === 'projects' && c.key === o.id) && !o.dirty;
      if (openChanged) { App.open = null; toast('This project was updated from your other computer.', 'info', 5000); App.rerender(); }
      else if (['dashboard', 'documents', 'customers'].includes(App.route.name) && !document.querySelector('.overlay')) App.rerender();
    }
    if (rep.conflicts.length) {
      toast(`Sync: ${rep.conflicts.length} record(s) were changed on both computers. Nothing was lost.`, 'warn', 12000, [{ label: 'Details', run: () => showReport(rep) }]);
    }
    if (rep.rejected.length) toast(`Sync: ${rep.rejected.length} file(s) in the sync folder were damaged or invalid and were not imported.`, 'err', 12000, [{ label: 'Details', run: () => showReport(rep) }]);
    const dup = (rep.duplicates || []).join(', ');
    if (dup && dup !== S.dupShown) { S.dupShown = dup; toast(`Two projects now share the number ${dup} (created on different computers). Renumber one in Project Details.`, 'warn', 12000); }
    if (manual) toast(`Sync complete: ${rep.pulled} received, ${rep.pushed} sent${rep.deletedHere + rep.deletedThere ? `, ${rep.deletedHere + rep.deletedThere} deletion(s)` : ''}${rep.deferred.length ? `, ${rep.deferred.length} waiting (open with unsaved changes)` : ''}${rep.waiting ? `, ${rep.waiting} file(s) still downloading` : ''}.`, 'ok', 6000);
  }

  function showReport(rep) {
    const row = (x) => h('li', {}, `${x.store === 'projects' ? 'Project' : x.store}: ${x.name ? `“${x.name}” — ` : ''}${x.what || x.reason}`);
    return alertDlg('Sync details', h('div', {},
      rep.conflicts.length ? h('div', {}, h('h4', {}, 'Changed on both computers'), h('ul', {}, rep.conflicts.map(row)),
        h('p', { class: 'muted small' }, 'For projects, the newer edit keeps the project and the other edit is saved as a separate “conflict copy” project — compare them and delete the one you do not need. For other records the newer edit is kept; a safety backup (Settings → Storage) holds the previous data.')) : null,
      rep.rejected.length ? h('div', {}, h('h4', {}, 'Not imported'), h('ul', {}, rep.rejected.map(row)), h('p', { class: 'muted small' }, 'These files were incomplete, modified outside ColdLoad Pro or failed validation. They are retried on the next sync.')) : null));
  }

  const soon = () => { if (!S.cfg || !S.cfg.enabled) return; clearTimeout(S.soonTimer); S.soonTimer = setTimeout(() => runNow(), 3000); };

  async function start() {
    if (!available()) return;
    S.cfg = await bridge().get();
    const st = await engine().status(); S.last = st.lastRun;
    paint();
    clearInterval(S.timer);
    S.timer = setInterval(() => runNow(), Math.max(1, S.cfg.intervalMin || 2) * 60000);
    if (!S.focusHooked) {
      S.focusHooked = true;
      root.addEventListener('focus', () => { if (Date.now() - S.lastFocus > 30000) { S.lastFocus = Date.now(); runNow(); } });
    }
    if (S.cfg.enabled) await runNow();
  }
  function stop() { clearInterval(S.timer); clearTimeout(S.soonTimer); }

  /* ---------- Settings → Storage card ---------- */
  async function setup() {
    const b = bridge();
    const dir = await b.choose();
    if (!dir) return;
    const cfg = await b.get();
    const look = await b.inspect(dir);
    const projectsHere = (await App.repo.listProjects({ includeDeleted: true })).length;
    const liveThere = look.scan.records.filter((x) => !x.deleted);
    const projectsThere = liveThere.filter((x) => x.store === 'projects').length;
    const me = await deviceId();
    const others = look.devices.filter((d) => d.deviceId !== me);
    const name = await formDlg('Set up sync', [{ key: 'deviceName', label: 'Name of this computer (shown on the other computers)', value: cfg.deviceName, required: true }],
      { ok: 'Continue', intro: `Sync folder: ${look.root}` });
    if (!name) return;
    let mode = 'merge';
    if (liveThere.length) {
      const body = h('div', {},
        h('p', {}, `This folder already holds data from ${others.length ? others.map((d) => `${d.deviceName || 'another computer'} (last sync ${fdate(d.lastSync, true)})`).join(', ') : 'another computer'}: ${projectsThere} project(s).`),
        h('p', {}, `This computer has ${projectsHere} project(s).`),
        h('ul', {},
          h('li', {}, h('b', {}, 'Use the folder’s data on this computer'), ' — recommended for a new computer. This computer’s projects, customers and settings are replaced by the folder’s (a safety backup is stored first).'),
          h('li', {}, h('b', {}, 'Combine both'), ' — keep everything from both computers. Records that differ are treated as edits on both computers (the newer one is kept; projects get a conflict copy).')));
      mode = await modal({ title: 'The sync folder already has data', wide: true, body, actions: [{ label: 'Cancel', value: null }, { label: 'Combine both', value: 'merge' }, { label: 'Use the folder’s data', value: 'replaceLocal', kind: projectsHere ? 'danger' : 'primary' }] });
      if (!mode) return;
      if (mode === 'replaceLocal' && projectsHere) {
        const ok = await formDlg('Confirm', [{ key: 'w', label: 'Type REPLACE to confirm', required: true }], { ok: 'Replace this computer’s data', intro: `The ${projectsHere} project(s) on this computer that are not in the sync folder will be removed from this computer. A safety backup is kept in Settings → Storage.` });
        if (!ok || ok.w.trim().toUpperCase() !== 'REPLACE') { toast('Sync was not set up.', 'info'); return; }
      }
    } else if (!(await confirmDlg('Start syncing', `This computer’s data (${projectsHere} project(s)) will be copied into ${look.root}. On your other computer, choose the same folder in Settings → Storage → Set up sync.`, { ok: 'Start syncing' }))) return;
    if (!(await App.closeProject())) return;
    try {
      await b.connect(dir, name.deviceName);
      if (mode === 'replaceLocal') await engine().forget();
      const rep = await runNow({ manual: false, mode });
      if (!rep) throw new Error(S.error || 'The first sync did not complete.');
      await start();
      await alertDlg('Sync is on', h('div', {},
        h('p', {}, `${rep.pulled} record(s) received and ${rep.pushed} sent. From now on this computer syncs automatically every ${S.cfg.intervalMin || 2} minutes, when you save, and when you return to the window.`),
        h('p', { class: 'muted small' }, 'Each computer keeps its own sign-in (user accounts are not synced). Keep the cloud drive app running and signed in on both computers.')));
      App.go('dashboard');
    } catch (e) { errorDlg('Setting up sync', e, 'Check that the folder is writable and synced by your cloud drive.'); App.rerender(); }
  }

  async function card() {
    if (!available()) return null;
    const b = bridge();
    const cfg = S.cfg = await b.get();
    const card = (title, sub, ...kids) => h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', {}, title), sub ? h('small', { class: 'muted' }, sub) : null), ...kids);
    const intro = h('p', { class: 'muted small' }, 'Use the same projects on your Windows PC and your Mac. Choose a folder inside OneDrive, iCloud Drive, Dropbox or Google Drive that is synced to both computers, then choose the same folder on the other computer. Work done on one computer appears on the other within a few minutes. User accounts stay separate on each computer.');
    if (!cfg.enabled) {
      return card('Sync between computers', 'Off', intro,
        h('div', { class: 'row' }, btn('Set up sync…', () => setup().catch((e) => errorDlg('Setting up sync', e)), { kind: 'primary', icon: 'sync' })));
    }
    const st = await engine().status();
    let devices = [], devErr = null;
    try { devices = await b.devices(); } catch (e) { devErr = e.message; }
    const me = await deviceId();
    const others = devices.filter((d) => d.deviceId !== me);
    const lr = st.lastReport;
    return card('Sync between computers', 'On', intro,
      h('table', { class: 'kv' }, ...[
        ['Sync folder', cfg.root],
        ['This computer', cfg.deviceName],
        ['Other computers', devErr ? `Folder not available: ${devErr}` : others.length ? others.map((d) => `${d.deviceName || d.deviceId.slice(0, 8)} (${d.platform === 'darwin' ? 'macOS' : d.platform === 'win32' ? 'Windows' : d.platform}) — last sync ${fdate(d.lastSync, true)}`).join('; ') : 'None yet — set up sync on your other computer with this same folder'],
        ['Last sync', st.lastRun ? `${fdate(st.lastRun, true)}${lr ? ` — ${lr.pulled} received, ${lr.pushed} sent${lr.conflicts.length ? `, ${lr.conflicts.length} conflict(s)` : ''}` : ''}` : 'Not yet'],
        ['Automatic', `Every ${cfg.intervalMin} min, after each save and when you return to the window`],
      ].map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v)))),
      S.error ? h('p', { class: 'warn-box' }, icon('alert'), ' ', S.error) : null,
      st.history.some((r) => r.conflicts.length || r.rejected.length) ? h('details', {}, h('summary', {}, 'Recent conflicts and rejected files'),
        h('ul', {}, st.history.flatMap((r) => [...r.conflicts, ...r.rejected].map((x) => h('li', {}, `${fdate(r.at, true)} — ${x.store}: ${x.name ? `“${x.name}” — ` : ''}${x.what || x.reason}`))))) : null,
      h('div', { class: 'row' },
        btn('Sync now', async () => { await runNow({ manual: true }); App.rerender(); }, { kind: 'primary', icon: 'sync' }),
        btn('Open sync folder', () => b.openFolder(), { icon: 'folder' }),
        btn('Options…', async () => {
          const v = await formDlg('Sync options', [{ key: 'deviceName', label: 'Name of this computer', value: cfg.deviceName, required: true }, { key: 'intervalMin', label: 'Sync every (minutes)', value: String(cfg.intervalMin), type: 'number' }]);
          if (!v) return; await b.setOptions(v); await start(); App.rerender();
        }, { icon: 'settings' }),
        btn('Turn off sync', async () => {
          if (!(await confirmDlg('Turn off sync', 'This computer stops syncing. Its data stays here, and the sync folder keeps the data of the other computers. You can turn sync on again later with the same folder.', { ok: 'Turn off', danger: true }))) return;
          await b.disconnect(); stop(); S.cfg = await b.get(); paint(); App.rerender();
        }, { icon: 'x' })));
  }

  CL.syncUI = { badge, start, stop, runNow, soon, card, available };
})(globalThis);
