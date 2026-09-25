/* Dashboard, Document Center and Customers views. */
(function (root) {
  'use strict';
  const CL = root.CL, App = CL.App;
  const { h, icon, btn, toast, modal, confirmDlg, errorDlg, formDlg, fmt, fdate, fileToDataUrl, readFile } = CL.ui;
  const U = CL.units;
  const pw = (kW) => `${fmt(U.pw(kW), U.pwDigits())} ${U.pwLabel()}`;
  const ACTIVE = ['In Progress', 'Calculation Complete', 'Under Review'];
  const DONE = ['Approved', 'Issued'];

  const warnCache = new Map();
  function projectWarnings(p) {
    const key = p.id + p.modifiedAt;
    if (!warnCache.has(key)) {
      let msgs = [];
      try { msgs = CL.validate.validateProject(p.working.data, root.HLCalc, root.HLData, root.HLVent); } catch (e) { msgs = [{ level: 'error', msg: e.message }]; }
      warnCache.set(key, CL.validate.count(msgs));
    }
    return warnCache.get(key);
  }

  const statusChip = (s) => h('span', { class: 'chip st-' + String(s || '').toLowerCase().replace(/\s+/g, '-') }, s || '—');

  /* ---------------- Dashboard ---------------- */
  App.views.dashboard = async () => {
    const all = (await App.projects(true)).filter((p) => !p.deletedAt);
    const customers = await App.repo.listCustomers();
    const cmap = Object.fromEntries(customers.map((c) => [c.id, c.name]));
    const live = all.filter((p) => !p.archived && p.status !== 'Archived');
    const kpi = (label, value, sub, ic, go) => h('button', { class: 'kpi', onclick: go ? () => App.go(go) : null }, h('span', { class: 'kpi-ic' }, icon(ic, 20)), h('span', { class: 'kpi-l' }, label), h('b', {}, value), sub ? h('small', {}, sub) : null);
    const totalKW = live.reduce((a, p) => a + ((p.summary && p.summary.totalKW) || 0), 0);
    const byType = {};
    for (const p of live) for (const r of (p.summary && p.summary.rooms) || []) {
      const t = (root.HLData.roomTypes[r.type] || {}).name || r.type || 'Other';
      byType[t] = (byType[t] || 0) + (r.kW || 0);
    }
    const typeRows = Object.entries(byType).sort((a, b) => b[1] - a[1]);
    const maxT = Math.max(1, ...typeRows.map((x) => x[1]));
    const recentIds = ((App.user.prefs || {}).recent || []);
    const recent = recentIds.map((id) => all.find((p) => p.id === id)).filter(Boolean).slice(0, 6);
    const modified = [...all].sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1)).slice(0, 6);
    const warnList = live.map((p) => ({ p, c: projectWarnings(p) })).filter((x) => x.c.error || x.c.warning).sort((a, b) => b.c.error - a.c.error || b.c.warning - a.c.warning).slice(0, 8);
    const lastB = App.settings.lastBackup;
    const daysSince = lastB && lastB.at ? Math.floor((Date.now() - new Date(lastB.at)) / 864e5) : null;

    const projRow = (p) => h('button', { class: 'lrow', onclick: () => App.go(`project/${p.id}/details`) },
      h('span', { class: 'lmain' }, h('b', {}, p.name), h('small', {}, [p.projectNo, cmap[p.customerId], p.site].filter(Boolean).join(' · '))),
      statusChip(p.status), h('span', { class: 'lnum' }, p.summary && Number.isFinite(p.summary.totalKW) ? pw(p.summary.totalKW) : '–'), h('span', { class: 'ldate' }, fdate(p.modifiedAt)));

    return h('div', { class: 'page dash' },
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, `Welcome, ${App.user.displayName.split(' ')[0]}`), h('p', { class: 'muted' }, `${all.length} project(s) · ${customers.length} customer(s)`)),
        h('div', { class: 'qa' },
          btn('New Project', () => CL.projectActions.newProject(), { kind: 'primary', icon: 'plus' }),
          btn('Open Project', () => App.go('documents'), { icon: 'folder' }),
          btn('Document Center', () => App.go('documents'), { icon: 'docs' }),
          btn('Backup', () => CL.projectActions.backupDlg(), { icon: 'backup' }),
          btn('Restore', () => CL.projectActions.restoreFromFile(), { icon: 'restore' }),
          btn('Settings', () => App.go('settings'), { icon: 'settings' }))),
      daysSince == null || daysSince > 7 ? h('div', { class: 'banner warn' }, icon('alert'), daysSince == null ? 'No backup has been made yet. Project data lives in this browser profile — create a full backup regularly.' : `Last full/project backup was ${daysSince} days ago.`, btn('Back up now', () => CL.projectActions.backupDlg(), { small: true })) : null,
      h('div', { class: 'kpis' },
        kpi('Total projects', all.length, `${all.filter((p) => p.archived).length} archived`, 'docs', 'documents'),
        kpi('Active', all.filter((p) => ACTIVE.includes(p.status) && !p.archived).length, ACTIVE.join(' · '), 'chart', 'documents'),
        kpi('Completed', all.filter((p) => DONE.includes(p.status)).length, 'Approved · Issued', 'check', 'documents'),
        kpi('Draft', all.filter((p) => p.status === 'Draft' && !p.archived).length, 'Not yet in progress', 'edit', 'documents'),
        kpi('Total refrigeration load', pw(totalKW), `${live.length} live project(s), saved working copies`, 'snow')),
      h('div', { class: 'grid2' },
        h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', {}, 'Recently opened'), h('a', { href: '#/documents' }, 'All projects')),
          recent.length ? h('div', { class: 'list' }, recent.map(projRow)) : h('p', { class: 'muted' }, 'Projects you open appear here.')),
        h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', {}, 'Recently modified'), h('a', { href: '#/documents' }, 'Document Center')),
          modified.length ? h('div', { class: 'list' }, modified.map(projRow)) : h('div', { class: 'empty' }, h('p', {}, 'No projects yet.'), btn('Create the first project', () => CL.projectActions.newProject(), { kind: 'primary', icon: 'plus' }))),
        h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', {}, 'Load by application'), h('small', { class: 'muted' }, 'Design capacity, live projects')),
          typeRows.length ? h('div', { class: 'hbars' }, typeRows.map(([t, kW]) => h('div', { class: 'hbar' }, h('span', { class: 'hb-l' }, t), h('span', { class: 'hb-t' }, h('span', { class: 'hb-f', style: { width: `${Math.max(1.5, kW / maxT * 100)}%` } })), h('span', { class: 'hb-v' }, pw(kW))))) : h('p', { class: 'muted' }, 'No calculated rooms yet.')),
        h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', {}, 'Warnings requiring attention'), h('small', { class: 'muted' }, 'Validation of saved working copies')),
          warnList.length ? h('div', { class: 'list' }, warnList.map(({ p, c }) => h('button', { class: 'lrow', onclick: () => App.go(`project/${p.id}/report/validation`) },
            h('span', { class: 'lmain' }, h('b', {}, p.name), h('small', {}, p.projectNo)),
            c.error ? h('span', { class: 'badge err' }, icon('error', 13), `${c.error} error${c.error > 1 ? 's' : ''}`) : null,
            c.warning ? h('span', { class: 'badge warn' }, icon('alert', 13), `${c.warning} warning${c.warning > 1 ? 's' : ''}`) : null))) : h('p', { class: 'muted' }, 'No open errors or warnings.'))));
  };

  /* ---------------- Document Center ---------------- */
  const DC = { q: '', customer: '', status: '', type: '', engineer: '', site: '', from: '', to: '', rev: '', archived: false, sort: 'modifiedAt', dir: -1, page: 0, size: 50, sel: new Set() };

  App.views.documents = async (params) => {
    const trash = params[0] === 'trash';
    const [projects, customers] = await Promise.all([App.projects(true), App.repo.listCustomers()]);
    const cmap = Object.fromEntries(customers.map((c) => [c.id, c.name]));
    const revCount = {};
    const revs = await App.store.all('revisions');
    const lastRev = {};
    for (const r of revs) { revCount[r.projectId] = (revCount[r.projectId] || 0) + 1; if (!lastRev[r.projectId] || r.seq > lastRev[r.projectId].seq) lastRev[r.projectId] = r; }
    const rows = projects.filter((p) => (trash ? p.deletedAt : !p.deletedAt)).map((p) => ({
      p, customer: cmap[p.customerId] || '', rev: lastRev[p.id] ? lastRev[p.id].rev : '—', revs: revCount[p.id] || 0,
      kW: p.summary && Number.isFinite(p.summary.totalKW) ? p.summary.totalKW : null,
      hay: [p.projectNo, p.name, cmap[p.customerId], p.site, p.city, p.country, p.createdBy, p.modifiedBy, p.status, p.type, p.notes, p.endUser, p.consultant, p.contractor].join(' ').toLowerCase(),
    }));
    const statuses = App.settings.statuses || CL.repo.DEFAULT_STATUSES;
    const engineers = [...new Set(projects.map((p) => p.createdBy).filter(Boolean))].sort();
    const types = [...new Set(projects.map((p) => p.type).filter(Boolean))].sort();

    const tableBox = h('div', { class: 'dc-table' });
    const countBox = h('span', { class: 'muted' });
    const bulk = h('div', { class: 'bulk' });

    const cols = [
      ['projectNo', 'Project no.'], ['name', 'Project'], ['customer', 'Customer'], ['site', 'Site'], ['status', 'Status'], ['rev', 'Rev'],
      ['createdBy', 'Engineer'], ['type', 'Type'], ['kW', `Load [${U.pwLabel()}]`], ['modifiedAt', 'Modified'], ['createdAt', 'Created'],
    ];
    const val = (r, k) => (k === 'customer' ? r.customer : k === 'rev' ? r.rev : k === 'kW' ? r.kW : r.p[k]);

    function filtered() {
      const terms = DC.q.toLowerCase().split(/\s+/).filter(Boolean);
      return rows.filter((r) => (trash || DC.archived || !r.p.archived)
        && terms.every((t) => r.hay.includes(t))
        && (!DC.customer || r.p.customerId === DC.customer) && (!DC.status || r.p.status === DC.status)
        && (!DC.type || r.p.type === DC.type) && (!DC.engineer || r.p.createdBy === DC.engineer)
        && (!DC.site || [r.p.site, r.p.city, r.p.country].join(' ').toLowerCase().includes(DC.site.toLowerCase()))
        && (!DC.rev || (DC.rev === 'none' ? r.revs === 0 : r.rev === DC.rev.padStart(2, '0')))
        && (!DC.from || r.p.modifiedAt.slice(0, 10) >= DC.from) && (!DC.to || r.p.modifiedAt.slice(0, 10) <= DC.to))
        .sort((a, b) => { const x = val(a, DC.sort), y = val(b, DC.sort); return (x == null ? -1 : y == null ? 1 : typeof x === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * DC.dir; });
    }

    function draw() {
      const list = filtered();
      const pages = Math.max(1, Math.ceil(list.length / DC.size));
      DC.page = Math.min(DC.page, pages - 1);
      const pageRows = list.slice(DC.page * DC.size, (DC.page + 1) * DC.size);
      countBox.textContent = `${list.length} of ${rows.length} project(s)`;
      const allSel = pageRows.length && pageRows.every((r) => DC.sel.has(r.p.id));
      const head = h('tr', {}, h('th', { class: 'cb' }, h('input', { type: 'checkbox', 'aria-label': 'Select page', checked: allSel || null, onchange: (e) => { pageRows.forEach((r) => e.target.checked ? DC.sel.add(r.p.id) : DC.sel.delete(r.p.id)); draw(); } })),
        cols.map(([k, l]) => h('th', { class: (k === 'kW' ? 'num ' : '') + 'sortable' + (DC.sort === k ? ' sorted' : ''), onclick: () => { DC.dir = DC.sort === k ? -DC.dir : (k.endsWith('At') || k === 'kW' ? -1 : 1); DC.sort = k; draw(); }, 'aria-sort': DC.sort === k ? (DC.dir > 0 ? 'ascending' : 'descending') : null }, l, DC.sort === k ? (DC.dir > 0 ? ' ▲' : ' ▼') : '')),
        h('th', {}, 'Actions'));
      const body = pageRows.map((r) => h('tr', { class: r.p.archived ? 'archived' : null, ondblclick: () => !trash && App.go(`project/${r.p.id}/details`) },
        h('td', { class: 'cb' }, h('input', { type: 'checkbox', 'aria-label': 'Select', checked: DC.sel.has(r.p.id) || null, onchange: (e) => { e.target.checked ? DC.sel.add(r.p.id) : DC.sel.delete(r.p.id); drawBulk(); } })),
        h('td', { class: 'mono' }, r.p.projectNo), h('td', {}, trash ? h('b', {}, r.p.name) : h('a', { href: `#/project/${r.p.id}/details` }, r.p.name), r.p.archived ? h('span', { class: 'chip st-archived sm' }, 'archived') : null),
        h('td', {}, r.customer || '—'), h('td', {}, [r.p.site, r.p.city].filter(Boolean).join(', ') || '—'), h('td', {}, statusChip(r.p.status)),
        h('td', { class: 'mono' }, r.rev), h('td', {}, r.p.createdBy || '—'), h('td', {}, r.p.type || '—'),
        h('td', { class: 'num' }, r.kW == null ? '–' : fmt(U.pw(r.kW), U.pwDigits())), h('td', {}, fdate(r.p.modifiedAt)), h('td', {}, fdate(r.p.createdAt)),
        h('td', { class: 'acts' }, trash ? [
          btn('Restore', async () => { await App.repo.untrashProject(r.p.id); App.cache.projects = null; toast('Project restored from Trash'); App.rerender(); }, { small: true, icon: 'restore' }),
          btn('Delete permanently', () => purge(r.p), { small: true, kind: 'danger', icon: 'trash' }),
        ] : [
          btn('', () => App.go(`project/${r.p.id}/details`), { small: true, icon: 'folder', title: 'Open' }),
          btn('', () => duplicate(r.p), { small: true, icon: 'copy', title: 'Duplicate' }),
          btn('', async () => { await App.repo.setArchived(r.p.id, !r.p.archived); App.cache.projects = null; toast(r.p.archived ? 'Unarchived' : 'Archived'); App.rerender(); }, { small: true, icon: 'archive', title: r.p.archived ? 'Unarchive' : 'Archive' }),
          btn('', () => CL.projectActions.backupProjects([r.p.id], 'project'), { small: true, icon: 'export', title: 'Export project package' }),
          btn('', () => trashIt(r.p), { small: true, icon: 'trash', title: 'Delete (move to Trash)', kind: 'ghost-danger' }),
        ])));
      const pager = h('div', { class: 'pager' },
        btn('‹ Prev', () => { DC.page--; draw(); }, { small: true, disabled: DC.page === 0 }),
        h('span', {}, `Page ${DC.page + 1} of ${pages}`),
        btn('Next ›', () => { DC.page++; draw(); }, { small: true, disabled: DC.page >= pages - 1 }),
        h('select', { 'aria-label': 'Rows per page', onchange: (e) => { DC.size = +e.target.value; DC.page = 0; draw(); } }, [25, 50, 100, 250].map((n) => h('option', { value: n, selected: DC.size === n || null }, `${n} / page`))));
      tableBox.replaceChildren(list.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'dtable' }, h('thead', {}, head), h('tbody', {}, body))) : h('div', { class: 'empty' }, h('p', {}, trash ? 'Trash is empty.' : rows.length ? 'No projects match the filters.' : 'No projects yet.'), !trash && !rows.length ? btn('New Project', () => CL.projectActions.newProject(), { kind: 'primary', icon: 'plus' }) : null), list.length > DC.size ? pager : null);
      drawBulk();
    }
    function drawBulk() {
      const n = DC.sel.size;
      bulk.replaceChildren(...(n ? [h('span', {}, `${n} selected`), btn('Backup selected', () => CL.projectActions.backupProjects([...DC.sel], 'selected'), { small: true, icon: 'backup' }), btn('Clear', () => { DC.sel.clear(); draw(); }, { small: true })] : []));
    }
    async function duplicate(p) {
      const no = await App.repo.nextProjectNo();
      const f = await formDlg('Duplicate project', [{ key: 'name', label: 'New project name', value: `${p.name} (copy)`, required: true }, { key: 'projectNo', label: 'Project number', value: no, required: true }]);
      if (!f) return;
      const c = await App.repo.saveAsProject(p.id, f); App.cache.projects = null; toast(`Duplicated as ${c.projectNo}`); App.rerender();
    }
    async function trashIt(p) {
      if (!(await confirmDlg('Delete project', `Move “${p.name}” (${p.projectNo}) to the Trash? It can be restored from the Trash until it is deleted permanently.`, { ok: 'Move to Trash', danger: true }))) return;
      await App.repo.trashProject(p.id); App.cache.projects = null; DC.sel.delete(p.id); toast('Moved to Trash'); App.rerender();
    }
    async function purge(p) {
      const f = await formDlg('Delete permanently', [{ key: 'w', label: `Type the project number (${p.projectNo}) to confirm`, required: true }], { ok: 'Delete permanently', intro: 'This removes the project, all revisions and attachments. It cannot be undone — consider a backup first.' });
      if (!f) return;
      if (f.w.trim() !== p.projectNo) { toast('Project number did not match. Nothing deleted.', 'warn'); return; }
      await App.repo.purgeProject(p.id); App.cache.projects = null; toast('Project deleted permanently'); App.rerender();
    }

    const sel = (key, label, opts) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), h('select', { onchange: (e) => { DC[key] = e.target.value; DC.page = 0; draw(); } }, h('option', { value: '' }, 'All'), opts.map(([v, l]) => h('option', { value: v, selected: DC[key] === v || null }, l))));
    const inp = (key, label, type = 'text', ph) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), h('input', { type, value: DC[key], placeholder: ph || null, oninput: (e) => { DC[key] = e.target.value; DC.page = 0; draw(); } }));

    const view = h('div', { class: 'page' },
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, trash ? 'Trash' : 'Document Center'), h('p', { class: 'muted' }, trash ? 'Deleted projects. Restore or delete permanently.' : 'All customers and projects. Double-click a row to open.')),
        h('div', { class: 'qa' }, trash ? btn('Back to Document Center', () => App.go('documents'), { icon: 'docs' }) : [
          btn('New Project', () => CL.projectActions.newProject(), { kind: 'primary', icon: 'plus' }),
          btn('Import / Restore', () => CL.projectActions.restoreFromFile(), { icon: 'restore' }),
          btn(`Trash (${projects.filter((p) => p.deletedAt).length})`, () => App.go('documents/trash'), { icon: 'trash' })])),
      h('section', { class: 'card filters' },
        h('div', { class: 'filter-grid' },
          h('label', { class: 'field grow2' }, h('span', { class: 'lbl' }, 'Search'), h('input', { type: 'search', value: DC.q, placeholder: 'Name, number, customer, site, engineer, notes…', oninput: (e) => { DC.q = e.target.value; DC.page = 0; draw(); } })),
          sel('customer', 'Customer', customers.sort((a, b) => a.name.localeCompare(b.name)).map((c) => [c.id, c.name])),
          sel('status', 'Status', statuses.map((s) => [s, s])),
          sel('type', 'Project type', types.map((t) => [t, t])),
          sel('engineer', 'Engineer', engineers.map((t) => [t, t])),
          inp('site', 'Site / city'), inp('rev', 'Revision', 'text', 'e.g. 02 or none'),
          inp('from', 'Modified from', 'date'), inp('to', 'Modified to', 'date'),
          trash ? null : h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: DC.archived || null, onchange: (e) => { DC.archived = e.target.checked; draw(); } }), ' Show archived')),
        h('div', { class: 'filter-foot' }, countBox, bulk, btn('Reset filters', () => { Object.assign(DC, { q: '', customer: '', status: '', type: '', engineer: '', site: '', from: '', to: '', rev: '', archived: false }); App.rerender(); }, { small: true }))),
      tableBox);
    draw();
    return view;
  };

  /* ---------------- Customers ---------------- */
  App.views.customers = async (params) => {
    const customers = (await App.repo.listCustomers()).sort((a, b) => a.name.localeCompare(b.name));
    const projects = (await App.projects()).filter((p) => !p.deletedAt);
    const count = (id) => projects.filter((p) => p.customerId === id).length;
    const selId = params[0] || (customers[0] || {}).id;
    const cur = customers.find((c) => c.id === selId);
    const edit = cur ? { ...cur } : null;

    const editor = edit ? h('section', { class: 'card' },
      h('div', { class: 'card-h' }, h('h3', {}, edit.name), h('div', {},
        btn('Save customer', async () => { try { await App.repo.saveCustomer(edit); toast('Customer saved'); App.rerender(); } catch (e) { toast(e.message, 'err'); } }, { kind: 'primary', icon: 'save', small: true }),
        btn('Delete', async () => { if (!(await confirmDlg('Delete customer', `Delete “${edit.name}”?`, { ok: 'Delete', danger: true }))) return; try { await App.repo.removeCustomer(edit.id); toast('Customer deleted'); App.go('customers'); } catch (e) { toast(e.message, 'err', 5000); } }, { small: true, kind: 'ghost-danger', icon: 'trash' }))),
      h('div', { class: 'logo-edit' }, edit.logo ? h('img', { src: edit.logo, alt: 'Customer logo' }) : h('div', { class: 'logo-ph' }, 'No logo'),
        h('div', {}, btn('Upload logo', async () => { const f = await readFile('image/png,image/jpeg,image/svg+xml,image/webp'); if (!f) return; if (f.size > 1024 * 1024) { toast('Logo must be under 1 MB.', 'err'); return; } edit.logo = await fileToDataUrl(f); await App.repo.saveCustomer(edit); App.rerender(); }, { small: true, icon: 'restore' }),
          edit.logo ? btn('Remove logo', async () => { edit.logo = ''; await App.repo.saveCustomer(edit); App.rerender(); }, { small: true }) : null, h('p', { class: 'hint' }, 'PNG, JPG, SVG or WebP, max 1 MB. Printed on report cover pages.'))),
      h('div', { class: 'grid' }, ['name', 'contact', 'phone', 'email'].map((k) => CL.ui.field(edit, k, { name: 'Customer name', contact: 'Contact person', phone: 'Phone', email: 'Email' }[k], { type: 'text' })),
        CL.ui.field(edit, 'address', 'Address', { type: 'textarea', wide: true }), CL.ui.field(edit, 'notes', 'Notes', { type: 'textarea', wide: true })),
      h('h4', {}, `Projects (${count(edit.id)})`),
      h('div', { class: 'list' }, projects.filter((p) => p.customerId === edit.id).map((p) => h('button', { class: 'lrow', onclick: () => App.go(`project/${p.id}/details`) }, h('span', { class: 'lmain' }, h('b', {}, p.name), h('small', {}, p.projectNo)), statusChip(p.status), h('span', { class: 'ldate' }, fdate(p.modifiedAt)))))) : h('section', { class: 'card empty' }, h('p', {}, 'No customers yet.'));

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Customers'), h('p', { class: 'muted' }, 'Customer names, logos and contacts used on project reports.')),
        h('div', { class: 'qa' }, btn('New customer', async () => { const v = await formDlg('New customer', [{ key: 'name', label: 'Customer name', required: true }, { key: 'contact', label: 'Contact person' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Address', type: 'textarea' }]); if (!v) return; const c = await App.repo.saveCustomer(v); App.go(`customers/${c.id}`); }, { kind: 'primary', icon: 'plus' }))),
      h('div', { class: 'split' },
        h('section', { class: 'card listcol' }, customers.map((c) => h('a', { href: `#/customers/${c.id}`, class: 'lrow' + (c.id === selId ? ' active' : '') }, h('span', { class: 'lmain' }, h('b', {}, c.name), h('small', {}, `${count(c.id)} project(s)`))))),
        editor));
  };

  CL.viewsMain = { statusChip, projectWarnings };
})(globalThis);
