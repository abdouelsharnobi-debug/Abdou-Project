/* Application shell: boot, authentication, routing, action bar, project session, search. */
(function (root) {
  'use strict';
  const CL = root.CL;
  const { h, icon, btn, toast, modal, confirmDlg, errorDlg, formDlg, alertDlg, fmt, fdate, esc } = CL.ui;
  const LEGACY_KEY = 'coldload-pro-project-v1';
  const SESSION_KEY = 'cl-session';

  const App = {
    store: null, repo: null, auth: null, backup: null, user: null, session: null, settings: null,
    views: {}, route: { name: 'dashboard', params: [] }, open: null, ui: {}, cache: { projects: null },
  };
  CL.App = App;

  const ls = {
    get(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { /* unavailable */ } },
    del(k) { try { root.localStorage.removeItem(k); } catch (e) { /* unavailable */ } },
  };
  const ss = {
    get(k) { try { return root.sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { root.sessionStorage.setItem(k, v); } catch (e) { /* unavailable */ } },
    del(k) { try { root.sessionStorage.removeItem(k); } catch (e) { /* unavailable */ } },
  };
  App.ls = ls;

  /* ---------- boot ---------- */
  async function boot() {
    const rootEl = document.getElementById('app');
    rootEl.innerHTML = '';
    rootEl.append(h('div', { class: 'boot' }, icon('snow', 36), h('p', {}, 'Starting ColdLoad Pro…')));
    try {
      try { App.store = await CL.db.IDBAdapter.open(); }
      catch (e) {
        App.store = new CL.db.MemoryAdapter();
        App.storageWarning = `${root.desktop ? 'Application' : 'Browser'} database unavailable (${e.message}). Data will NOT be kept after closing — use Backup to save your work.`;
      }
      CL.plant = (data) => root.HLFreeze.calcPlant(data, CL.productsTab.PRODUCTS);
      const deps = { calc: root.HLCalc, model: root.HLModel, migrate: root.HLMigrate, version: CL.version, plant: CL.plant };
      App.repo = CL.repo.createRepo(App.store, deps);
      App.repo.setUserProvider(() => (App.user ? App.user.displayName || App.user.username : 'system'));
      App.auth = CL.auth.createAuth(App.store);
      App.backup = CL.backup.createBackup(App.store, { version: CL.version, repo: App.repo, migrate: root.HLMigrate });
      await App.repo.init({ seedClimate: CL.climate.seedRecords(), seedReferences: CL.refs.REFERENCES });
      try { if (navigator.storage && navigator.storage.persist) App.persisted = await navigator.storage.persist(); } catch (e) { App.persisted = false; }
      await loadSettings();
      const sid = ls.get(SESSION_KEY) || ss.get(SESSION_KEY);
      const s = sid ? await App.auth.resume(sid) : null;
      if (s) await afterSignIn(s, true);
      else if (!(await App.auth.hasUsers())) renderSetup();
      else renderLogin();
    } catch (e) {
      rootEl.innerHTML = '';
      rootEl.append(h('div', { class: 'boot' }, h('h2', {}, 'ColdLoad Pro could not start'), h('p', {}, e.message), h('pre', { class: 'diag' }, e.stack || '')));
    }
  }

  async function loadSettings() {
    App.settings = await App.repo.getSettings();
    const prefs = (App.user && App.user.prefs) || {};
    const g = { ...App.settings.general, ...prefs };
    CL.units.set({ system: g.units || 'SI', power: g.powerUnit || 'kW' });
    CL.ui.setDateFormat(g.dateFormat || 'YYYY-MM-DD');
    applyTheme(g.theme || 'system');
  }
  function applyTheme(t) {
    const el = document.documentElement;
    if (t === 'light' || t === 'dark') el.setAttribute('data-theme', t); else el.removeAttribute('data-theme');
  }
  App.applyTheme = applyTheme;
  App.reloadSettings = loadSettings;

  /* ---------- authentication screens ---------- */
  async function brandBlock() {
    const cos = await App.repo.listCompanies();
    const co = cos.find((c) => c.isDefault) || cos[0] || {};
    return h('div', { class: 'auth-brand' },
      co.logo ? h('img', { src: co.logo, alt: '', class: 'auth-logo' }) : h('div', { class: 'auth-mark' }, icon('snow', 34)),
      h('h1', {}, 'ColdLoad Pro'), h('p', {}, 'Industrial refrigeration heat-load engineering'),
      co.name && co.name !== 'My Company' ? h('p', { class: 'auth-co' }, co.name) : null);
  }

  function pwInput(id, autocomplete) {
    const inp = h('input', { type: 'password', id, autocomplete, required: true });
    const tg = h('button', { type: 'button', class: 'iconbtn eye', 'aria-label': 'Show password', onclick: () => {
      const show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
      tg.replaceChildren(icon(show ? 'eyeoff' : 'eye')); tg.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    } }, icon('eye'));
    return h('span', { class: 'pw' }, inp, tg);
  }

  async function renderLogin(msg) {
    const rootEl = document.getElementById('app');
    const err = h('p', { class: 'form-err', role: 'alert' }, msg || '');
    const form = h('form', { class: 'auth-form', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      const b = form.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Signing in…';
      try {
        const s = await App.auth.signIn(form.querySelector('#u').value, form.querySelector('#p').value, form.querySelector('#rem').checked);
        await afterSignIn(s);
      } catch (x) { err.textContent = x.message; b.disabled = false; b.textContent = 'Sign in'; }
    } },
    h('h2', {}, 'Sign in'),
    h('label', { class: 'field wide' }, h('span', { class: 'lbl' }, 'Username or email'), h('input', { id: 'u', autocomplete: 'username', required: true })),
    h('label', { class: 'field wide' }, h('span', { class: 'lbl' }, 'Password'), pwInput('p', 'current-password')),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'rem' }), ' Keep me signed in on this computer (14 days)'),
    err, h('button', { type: 'submit', class: 'btn primary block' }, 'Sign in'),
    h('p', { class: 'muted small' }, 'Local account on this computer. Passwords are stored as salted PBKDF2 hashes; stored project data is not encrypted.'));
    rootEl.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'auth-card' }, await brandBlock(), form), versionFoot()));
    form.querySelector('#u').focus();
  }

  async function renderSetup() {
    const rootEl = document.getElementById('app');
    const err = h('p', { class: 'form-err', role: 'alert' });
    const legacy = ls.get(LEGACY_KEY);
    const form = h('form', { class: 'auth-form', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      const v = (id) => form.querySelector('#' + id).value;
      if (v('p1') !== v('p2')) { err.textContent = 'Passwords do not match.'; return; }
      try {
        await App.auth.createUser({ username: v('u'), displayName: v('n'), email: v('e'), password: v('p1'), role: 'admin' });
        if (v('co').trim()) { const cos = await App.repo.listCompanies(); const co = cos.find((c) => c.isDefault) || cos[0]; await App.repo.saveCompany({ ...co, name: v('co').trim() }); }
        const s = await App.auth.signIn(v('u'), v('p1'), false);
        await afterSignIn(s);
      } catch (x) { err.textContent = x.message; }
    } },
    h('h2', {}, 'Create the administrator account'),
    h('p', { class: 'muted small' }, 'First start on this computer. There is no default password.'),
    h('label', { class: 'field wide' }, h('span', { class: 'lbl' }, 'Full name'), h('input', { id: 'n', required: true, autocomplete: 'name' })),
    h('label', { class: 'field wide' }, h('span', { class: 'lbl' }, 'Username'), h('input', { id: 'u', required: true, autocomplete: 'username' })),
    h('label', { class: 'field wide' }, h('span', { class: 'lbl' }, 'Email (optional)'), h('input', { id: 'e', type: 'email', autocomplete: 'email' })),
    h('label', { class: 'field wide' }, h('span', { class: 'lbl' }, 'Password (min. 8 characters, letters and numbers)'), pwInput('p1', 'new-password')),
    h('label', { class: 'field wide' }, h('span', { class: 'lbl' }, 'Confirm password'), pwInput('p2', 'new-password')),
    h('label', { class: 'field wide' }, h('span', { class: 'lbl' }, 'Company name (optional; shown on reports)'), h('input', { id: 'co' })),
    legacy ? h('p', { class: 'note-box' }, icon('info'), ' A project from the previous version was found in this browser. It will be migrated into the new database after you sign in; the original copy is kept.') : null,
    err, h('button', { type: 'submit', class: 'btn primary block' }, 'Create account and continue'));
    rootEl.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'auth-card' }, await brandBlock(), form), versionFoot()));
  }
  const versionFoot = () => h('p', { class: 'auth-foot' }, `${CL.version.APP_NAME} ${CL.version.APP_VERSION} · calculation engine ${CL.version.ENGINE_VERSION}`);

  async function afterSignIn({ session, user }, resumed) {
    App.session = session; App.user = user;
    if (session.remember) ls.set(SESSION_KEY, session.id); else { ss.set(SESSION_KEY, session.id); ls.del(SESSION_KEY); }
    await loadSettings();
    renderShell();
    await maybeMigrateLegacy();
    window.addEventListener('hashchange', onRoute);
    if (!location.hash || location.hash === '#/' || location.hash === '#') location.hash = '#/dashboard'; else onRoute();
    CL.guidePanel.restore();
    CL.projectActions.autoBackupIfDue();
    if (!resumed) toast(`Signed in as ${user.displayName}`);
  }

  async function maybeMigrateLegacy() {
    const raw = ls.get(LEGACY_KEY);
    if (!raw) return;
    const meta = await App.store.get('meta', 'schema');
    if ((meta.migrations || []).some((m) => m.source === 'localStorage')) return;
    let v1; try { v1 = JSON.parse(raw); } catch (e) { await alertDlg('Previous project not migrated', 'The project stored by the previous version is unreadable. It has been left untouched.'); return; }
    const res = await App.repo.migrateLegacy(v1, 'localStorage');
    if (!res.ok) { await alertDlg('Previous project not migrated', h('div', {}, h('p', {}, 'The project from the previous version failed validation and was left untouched:'), h('ul', {}, res.errors.map((e) => h('li', {}, e))))); return; }
    App.cache.projects = null;
    await modal({ title: 'Project migrated', body: h('div', {},
      h('p', {}, `“${res.project.name}” from the previous version is now project ${res.project.projectNo}, revision 00.`),
      h('table', { class: 'kv' }, h('tr', {}, h('th', {}, 'Total load before'), h('td', {}, fmt(res.before, 2) + ' kW')), h('tr', {}, h('th', {}, 'Total load after'), h('td', {}, fmt(res.after, 2) + ' kW'))),
      h('p', { class: 'muted small' }, 'A safety backup was stored and the original copy in this browser was not deleted (rollback: open the legacy app).')),
      actions: [{ label: 'Open project', value: 'open', kind: 'primary' }, { label: 'Later', value: false }] }).then((v) => { if (v === 'open') App.go(`project/${res.project.id}/details`); });
  }

  async function signOut() {
    if (!(await App.closeProject())) return;
    await App.auth.signOut(App.session && App.session.id);
    ls.del(SESSION_KEY); ss.del(SESSION_KEY);
    App.user = null; App.session = null;
    window.removeEventListener('hashchange', onRoute);
    history.replaceState(null, '', location.pathname);
    renderLogin('You have been signed out.');
  }
  App.signOut = signOut;

  /* ---------- shell ---------- */
  const NAV = [
    ['dashboard', 'Dashboard', 'home'], ['documents', 'Document Center', 'docs'], ['customers', 'Customers', 'users'],
    ['standards', 'Standards & references', 'book'], ['settings', 'Settings', 'settings'], ['help', 'Help & knowledge', 'help'],
  ];

  function renderShell() {
    const rootEl = document.getElementById('app');
    const search = h('input', { id: 'gsearch', type: 'search', placeholder: 'Search projects, customers, sites…  (Ctrl+K)', autocomplete: 'off', 'aria-label': 'Global search', oninput: (e) => showSearch(e.target.value), onkeydown: searchKeys, onfocus: (e) => { if (e.target.value) showSearch(e.target.value); } });
    const header = h('header', { class: 'top' },
      h('a', { class: 'brand', href: '#/dashboard' }, h('span', { class: 'mark' }, icon('snow', 20)), h('span', {}, h('b', {}, 'ColdLoad Pro'), h('small', {}, 'Heat-load engineering'))),
      h('div', { class: 'gsearch' }, icon('search'), search, h('div', { id: 'gresults', class: 'gresults', hidden: true })),
      h('div', { class: 'top-right' },
        h('span', { id: 'savestate', class: 'savestate none' }, 'No project open'),
        h('button', { class: 'iconbtn', title: 'Toggle light / dark theme', 'aria-label': 'Toggle theme', onclick: toggleTheme }, icon('moon')),
        userMenu()));
    const bar = actionBar();
    const nav = h('nav', { class: 'side', 'aria-label': 'Main' },
      NAV.map(([k, l, ic]) => h('a', { href: `#/${k}`, class: 'nav', 'data-nav': k }, icon(ic, 18), h('span', {}, l))),
      h('div', { id: 'nav-project' }),
      h('div', { class: 'side-foot' }, `${CL.version.APP_NAME} ${CL.version.APP_VERSION}`, h('br'), `Engine ${CL.version.ENGINE_VERSION}`));
    const banner = App.storageWarning ? h('div', { class: 'banner err' }, icon('alert'), App.storageWarning) : null;
    rootEl.replaceChildren(...[header, bar, banner, h('div', { class: 'body' }, nav, h('main', { id: 'view', tabindex: '-1' }))].filter(Boolean));
    if (!document.getElementById('report')) document.body.append(h('div', { id: 'report', class: 'report-print' }));
    document.addEventListener('keydown', globalKeys);
    window.addEventListener('beforeunload', (e) => { if (App.open && App.open.dirty) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('mousedown', (e) => { if (!e.target.closest('.gsearch')) hideSearch(); if (!e.target.closest('.menu')) document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); });
  }

  function userMenu() {
    const u = App.user;
    return menu(h('span', { class: 'avatar' }, (u.displayName || u.username).split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase()), [
      { label: `${u.displayName} (${u.role})`, disabled: true },
      { label: 'Profile & security', icon: 'user', run: () => App.go('settings/security') },
      { label: 'Change password', icon: 'lock', run: changePasswordDlg },
      { sep: true }, { label: 'Sign out', icon: 'logout', run: signOut },
    ], { cls: 'usermenu', title: 'User menu' });
  }

  function menu(trigger, items, opt = {}) {
    const m = h('div', { class: 'menu ' + (opt.cls || '') });
    const list = h('div', { class: 'menu-list', role: 'menu' });
    const tb = h('button', { type: 'button', class: opt.btnClass || 'iconbtn', title: opt.title || null, 'aria-haspopup': 'menu', onclick: (e) => { e.stopPropagation(); document.querySelectorAll('.menu.open').forEach((x) => x !== m && x.classList.remove('open')); m.classList.toggle('open'); renderItems(); } }, trigger);
    function renderItems() {
      list.replaceChildren(...(typeof items === 'function' ? items() : items).map((it) => it.sep ? h('hr') :
        h('button', { type: 'button', role: 'menuitem', class: 'menu-item', disabled: it.disabled || null, title: it.hint || null, onclick: () => { m.classList.remove('open'); it.run && it.run(); } }, it.icon ? icon(it.icon) : h('span', { class: 'ic' }), h('span', {}, it.label), it.hint && it.disabled ? h('small', {}, it.hint) : null)));
    }
    m.append(tb, list);
    return m;
  }
  App.menu = menu;

  function actionBar() {
    const needP = () => !App.open;
    const a = (label, ic, run, opt = {}) => btn(label, run, { icon: ic, kind: 'bar', act: opt.act, title: opt.title });
    const exportMenu = menu(h('span', { class: 'barlbl' }, icon('export'), h('span', {}, 'Export'), icon('down', 12)), () => [
      root.desktop
        ? { label: 'PDF report (.pdf)', icon: 'print', run: () => CL.projectActions.exportPdf(), disabled: needP(), hint: 'Open a project first' }
        : { label: 'PDF report (print → Save as PDF)', icon: 'print', run: () => CL.projectActions.print(), disabled: needP(), hint: 'Open a project first' },
      { label: 'Excel workbook (.xlsx)', icon: 'grid', run: () => CL.projectActions.exportXlsx(), disabled: needP(), hint: 'Open a project first' },
      { label: 'CSV load data (.csv)', icon: 'list', run: () => CL.projectActions.exportCsv(), disabled: needP(), hint: 'Open a project first' },
      { label: 'Project package (.json)', icon: 'file', run: () => CL.projectActions.exportPackage(), disabled: needP(), hint: 'Open a project first' },
      { label: 'Legacy v1 project file (.json)', icon: 'file', run: () => CL.projectActions.exportV1(), disabled: needP(), hint: 'Open a project first' },
    ], { btnClass: 'btn bar', title: 'Export the open project' });
    return h('div', { class: 'actionbar', role: 'toolbar', 'aria-label': 'Actions' },
      a('New', 'plus', () => CL.projectActions.newProject(), { title: 'New project (Ctrl+Alt+N)' }),
      menu(h('span', { class: 'barlbl' }, icon('folder'), h('span', {}, 'Open'), icon('down', 12)), () => [
        { label: 'Document Center', icon: 'docs', run: () => App.go('documents') },
        ...recentItems(),
        { sep: true }, { label: 'Open / import file…', icon: 'restore', run: () => CL.projectActions.restoreFromFile() },
      ], { btnClass: 'btn bar', title: 'Open a project' }),
      a('Save', 'save', () => App.save(), { act: 'save', title: 'Save (Ctrl+S)' }),
      a('Save As', 'saveas', () => CL.projectActions.saveAs(), { act: 'saveas', title: 'Save as new revision or new project' }),
      h('span', { class: 'sepv' }),
      a('Undo', 'undo', () => App.undo(), { act: 'undo', title: 'Undo (Ctrl+Z)' }),
      a('Redo', 'redo', () => App.redo(), { act: 'redo', title: 'Redo (Ctrl+Y)' }),
      h('span', { class: 'sepv' }),
      a('Backup', 'backup', () => CL.projectActions.backupDlg(), { title: 'Back up projects or the full database' }),
      a('Restore', 'restore', () => CL.projectActions.restoreFromFile(), { title: 'Restore from a backup file' }),
      exportMenu,
      a('Print', 'print', () => CL.projectActions.print(), { act: 'print', title: 'Print report (Ctrl+P)' }),
      h('span', { class: 'grow' }),
      a('Guide', 'book', () => CL.guidePanel.toggle(), { act: 'guide', title: 'Reference guide for the current screen (F1)' }),
      a('Settings', 'settings', () => App.go('settings')),
      a('Help', 'help', () => App.go('help')));
  }

  function recentItems() {
    const rec = ((App.user && App.user.prefs && App.user.prefs.recent) || []).slice(0, 6);
    const list = (App.cache.projects || []);
    return rec.map((id) => list.find((p) => p.id === id && !p.deletedAt)).filter(Boolean).map((p) => ({ label: `${p.projectNo} · ${p.name}`, icon: 'file', run: () => App.go(`project/${p.id}/details`) }));
  }

  function updateBar() {
    const o = App.open;
    const q = (a) => document.querySelector(`.actionbar [data-act="${a}"]`);
    if (!q('save')) return;
    q('save').disabled = !o || !o.dirty || o.readonly;
    q('saveas').disabled = !o;
    q('undo').disabled = !o || !o.undo.length;
    q('redo').disabled = !o || !o.redo.length;
    q('print').disabled = !o;
    const st = document.getElementById('savestate');
    if (st) {
      const state = !o ? 'none' : o.saving ? 'saving' : o.dirty ? 'dirty' : 'saved';
      st.className = 'savestate ' + state;
      st.replaceChildren(...(state === 'none' ? ['No project open'] : [icon(state === 'saved' ? 'check' : state === 'saving' ? 'save' : 'edit', 14), state === 'saved' ? `Saved ${o.savedAt ? fdate(o.savedAt, true).slice(-5) : ''}` : state === 'saving' ? 'Saving…' : 'Unsaved changes']));
    }
    const np = document.getElementById('nav-project');
    if (np) np.replaceChildren(...(o ? [h('div', { class: 'nav-sec' }, 'Open project'),
      h('a', { href: `#/project/${o.id}/details`, class: 'nav proj', 'data-nav': 'project' }, icon('file', 18), h('span', {}, h('b', {}, o.rec.projectNo), h('small', {}, o.rec.name)))] : []));
  }
  App.updateBar = updateBar;

  function toggleTheme() {
    const el = document.documentElement;
    const cur = el.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    App.auth.updateProfile(App.user.id, { prefs: { theme: next } }).then((u) => { App.user = u; });
  }

  async function changePasswordDlg() {
    const v = await formDlg('Change password', [
      { key: 'old', label: 'Current password', type: 'password', required: true, autocomplete: 'current-password' },
      { key: 'n1', label: 'New password', type: 'password', required: true, hint: 'At least 8 characters with letters and numbers', autocomplete: 'new-password' },
      { key: 'n2', label: 'Confirm new password', type: 'password', required: true, autocomplete: 'new-password' },
    ], { ok: 'Change password' });
    if (!v) return;
    if (v.n1 !== v.n2) { toast('New passwords do not match.', 'err'); return; }
    try {
      await App.auth.changePassword(App.user.id, v.old, v.n1);
      await alertDlg('Password changed', 'Your password was changed and all sessions were signed out. Please sign in again.');
      ls.del(SESSION_KEY); ss.del(SESSION_KEY); App.user = null;
      window.removeEventListener('hashchange', onRoute);
      renderLogin();
    } catch (e) { toast(e.message, 'err', 5000); }
  }
  App.changePasswordDlg = changePasswordDlg;

  /* ---------- routing ---------- */
  App.go = (path) => { if (location.hash === '#/' + path) onRoute(); else location.hash = '#/' + path; };

  async function onRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const name = parts[0] || 'dashboard';
    if (App.open && !(name === 'project' && parts[1] === App.open.id)) {
      if (!(await App.closeProject())) { history.replaceState(null, '', `#/project/${App.open.id}/${App.route.params[1] || 'details'}`); return; }
    }
    App.route = { name, params: parts.slice(1) };
    document.querySelectorAll('.side [data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
    const bodyEl = document.querySelector('#app > .body');
    if (bodyEl) bodyEl.classList.toggle('compact', name === 'project');
    const view = document.getElementById('view');
    const fn = App.views[name] || App.views.dashboard;
    try {
      const node = await fn(App.route.params);
      if (App.route.name !== name) return;
      view.replaceChildren(node);
      view.scrollTop = 0;
    } catch (e) {
      view.replaceChildren(h('div', { class: 'page' }, h('h2', {}, 'This page could not be shown'), h('p', {}, e.message)));
      errorDlg('Opening the page', e, 'Go back to the Dashboard. If the problem persists, restore the latest backup.');
    }
    updateBar();
    if (CL.guidePanel) CL.guidePanel.update();
  }
  App.rerender = onRoute;

  /* ---------- project session ---------- */
  App.projects = async (force) => {
    if (!App.cache.projects || force) App.cache.projects = await App.repo.listProjects({ includeArchived: true, includeDeleted: true });
    return App.cache.projects;
  };

  App.openProject = async (id) => {
    if (App.open && App.open.id === id) return App.open;
    const rec = await App.repo.getProject(id);
    if (!rec || rec.deletedAt) throw new Error('This project does not exist or is in the Trash.');
    App.open = { id, rec, data: JSON.parse(JSON.stringify(rec.working.data)), dirty: false, undo: [], redo: [], savedAt: rec.working.savedAt, snapAt: 0 };
    const recent = [id, ...(((App.user.prefs || {}).recent) || []).filter((x) => x !== id)].slice(0, 10);
    App.auth.updateProfile(App.user.id, { prefs: { recent } }).then((u) => { App.user = u; });
    setupAutosave();
    return App.open;
  };

  /** Resolve: true = closed, false = user cancelled. */
  App.closeProject = async () => {
    const o = App.open;
    if (!o) return true;
    if (o.dirty) {
      const v = await modal({ title: 'Unsaved changes', body: h('p', {}, `“${o.rec.name}” has unsaved changes.`), actions: [
        { label: 'Cancel', value: 'cancel' }, { label: 'Discard changes', value: 'discard', kind: 'danger' }, { label: 'Save', value: 'save', kind: 'primary' }] });
      if (v === 'save') { if (!(await App.save())) return false; }
      else if (v !== 'discard') return false;
    }
    clearInterval(App.autosaveTimer);
    App.open = null; App.pendingMeta = null; updateBar();
    return true;
  };

  function snapshot() { return JSON.stringify(App.open.data); }

  /** Call BEFORE mutating project data is not needed: fields mutate then call changed(). */
  App.changed = (rerender) => {
    const o = App.open; if (!o) return;
    const now = Date.now();
    if (!o.last) o.last = JSON.stringify(o.rec.working.data);
    if (now - o.snapAt > 700) { o.undo.push(o.last); if (o.undo.length > 100) o.undo.shift(); o.redo = []; }
    o.snapAt = now; o.last = snapshot();
    o.dirty = true;
    updateBar();
    if (App.onDataChange) App.onDataChange(rerender);
  };
  App.undo = () => {
    const o = App.open; if (!o || !o.undo.length) return;
    o.redo.push(snapshot()); o.data = JSON.parse(o.undo.pop()); o.last = snapshot(); o.snapAt = 0; o.dirty = true;
    updateBar(); onRoute(); toast('Undone', 'info', 1500);
  };
  App.redo = () => {
    const o = App.open; if (!o || !o.redo.length) return;
    o.undo.push(snapshot()); o.data = JSON.parse(o.redo.pop()); o.last = snapshot(); o.snapAt = 0; o.dirty = true;
    updateBar(); onRoute(); toast('Redone', 'info', 1500);
  };

  App.save = async () => {
    const o = App.open; if (!o || !o.dirty) return true;
    o.saving = true; updateBar();
    try {
      o.rec = await App.repo.saveWorking(o.id, o.data, App.pendingMeta ? App.pendingMeta : undefined);
      App.pendingMeta = null;
      o.dirty = false; o.savedAt = o.rec.working.savedAt; o.last = snapshot();
      App.cache.projects = null;
      return true;
    } catch (e) { errorDlg('Saving the project', e, 'Your changes are still on screen. Create a Backup of the database and try again.'); return false; }
    finally { o.saving = false; updateBar(); }
  };

  function setupAutosave() {
    clearInterval(App.autosaveTimer);
    const sec = +((App.user.prefs || {}).autosaveSec ?? App.settings.general.autosaveSec) || 0;
    if (sec > 0) App.autosaveTimer = setInterval(() => { if (App.open && App.open.dirty && !App.open.saving) App.save(); }, sec * 1000);
  }
  App.setupAutosave = setupAutosave;

  /* ---------- keyboard ---------- */
  function globalKeys(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); App.save(); }
    else if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); document.getElementById('gsearch').focus(); }
    else if (mod && e.key.toLowerCase() === 'p' && App.open) { e.preventDefault(); CL.projectActions.print(); }
    else if (mod && e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); CL.projectActions.newProject(); }
    else if (e.key === 'F1') { e.preventDefault(); CL.guidePanel.toggle(); }
    else if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && !isTextTarget(e)) { e.preventDefault(); App.undo(); }
    else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && !isTextTarget(e)) { e.preventDefault(); App.redo(); }
  }
  const isTextTarget = (e) => /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox';

  /* ---------- global search ---------- */
  let hits = [], hitIx = 0;
  async function showSearch(q) {
    const box = document.getElementById('gresults');
    q = q.trim().toLowerCase();
    if (!q) { hideSearch(); return; }
    const [projects, customers] = await Promise.all([App.projects(), App.repo.listCustomers()]);
    const cmap = Object.fromEntries(customers.map((c) => [c.id, c.name]));
    const terms = q.split(/\s+/);
    const score = (hay) => terms.every((t) => hay.includes(t));
    hits = [];
    for (const p of projects) {
      const hay = [p.projectNo, p.name, cmap[p.customerId], p.site, p.city, p.country, p.createdBy, p.modifiedBy, p.status, p.type, p.notes, p.endUser, p.consultant, p.contractor, ...(p.working.data.rooms || []).map((r) => r.name)].join(' ').toLowerCase();
      if (score(hay)) hits.push({ kind: p.deletedAt ? 'Trash' : 'Project', title: `${p.projectNo} · ${p.name}`, sub: [cmap[p.customerId], p.site, p.status].filter(Boolean).join(' · '), go: p.deletedAt ? 'documents/trash' : `project/${p.id}/details` });
    }
    for (const c of customers) if (score([c.name, c.address, c.contact, c.email].join(' ').toLowerCase())) hits.push({ kind: 'Customer', title: c.name, sub: c.address || '', go: `customers/${c.id}` });
    hits = hits.slice(0, 12); hitIx = 0;
    box.hidden = false;
    box.replaceChildren(...(hits.length ? hits.map((x, i) => h('button', { type: 'button', class: 'ghit' + (i === 0 ? ' sel' : ''), onmousedown: (e) => { e.preventDefault(); pick(i); } },
      h('span', { class: 'gkind' }, x.kind), h('span', {}, h('b', {}, x.title), h('small', {}, x.sub)))) : [h('p', { class: 'muted pad' }, 'No matches.')]));
  }
  function pick(i) { const x = hits[i]; if (!x) return; hideSearch(); document.getElementById('gsearch').value = ''; App.go(x.go); }
  function hideSearch() { const b = document.getElementById('gresults'); if (b) b.hidden = true; }
  function searchKeys(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); hitIx = (hitIx + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % Math.max(1, hits.length);
      document.querySelectorAll('.ghit').forEach((b, i) => b.classList.toggle('sel', i === hitIx));
    } else if (e.key === 'Enter') { e.preventDefault(); pick(hitIx); } else if (e.key === 'Escape') { hideSearch(); e.target.blur(); }
  }

  /* ---------- global error handling ---------- */
  root.addEventListener('unhandledrejection', (e) => { e.preventDefault(); errorDlg('The last action', e.reason, 'Try again. If it keeps happening, create a backup and reload the application.'); });
  root.addEventListener('error', (e) => { if (e.error) errorDlg('The last action', e.error, 'Reload the application. Your saved data is not affected.'); });

  App.boot = boot;
  App.esc = esc;
})(globalThis);
