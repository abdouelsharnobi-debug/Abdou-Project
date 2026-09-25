/* Settings centre, Standards & references library, Help & knowledge centre. */
(function (root) {
  'use strict';
  const CL = root.CL, App = CL.App;
  const { h, icon, btn, toast, modal, confirmDlg, formDlg, alertDlg, fmt, fdate, field, fileToDataUrl, readFile, saveFile, errorDlg } = CL.ui;
  const D = root.HLData;

  const SECTIONS = [['general', 'General'], ['company', 'Company'], ['customers', 'Customer & project defaults'], ['engineering', 'Engineering'], ['climate', 'City library'], ['standards', 'Standards / references'], ['reports', 'Reports'], ['storage', 'Storage & backup'], ['security', 'Security & users'], ['about', 'About']];

  App.views.settings = async (params) => {
    const sec = params[0] || 'general';
    const nav = h('nav', { class: 'subnav' }, SECTIONS.map(([k, l]) => h('a', { href: `#/settings/${k}`, class: k === sec ? 'active' : '' }, l)));
    const body = await ({ general, company, customers: projDefaults, engineering, climate, standards: standardsSec, reports, storage, security, about }[sec] || general)();
    return h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Settings'), h('p', { class: 'muted' }, 'Application, branding, engineering defaults, storage and security.'))),
      h('div', { class: 'settings' }, nav, h('div', { class: 'set-body' }, body)));
  };

  const card = (title, sub, ...kids) => h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', {}, title), sub ? h('small', { class: 'muted' }, sub) : null), ...kids);
  const saveBtn = (label, run) => btn(label || 'Save', async () => { try { await run(); toast('Saved'); } catch (e) { toast(e.message, 'err', 5000); } }, { kind: 'primary', icon: 'save' });

  async function general() {
    const g = { ...App.settings.general, ...(App.user.prefs || {}) };
    return card('General', 'Personal preferences (stored with your user account)',
      h('div', { class: 'grid' },
        field(g, 'language', 'Language', { type: 'select', options: [['en', 'English']], hint: 'Additional languages are not yet available.' }),
        field(g, 'theme', 'Theme', { type: 'select', options: [['system', 'Follow Windows setting'], ['light', 'Light'], ['dark', 'Dark']] }),
        field(g, 'units', 'Unit system', { type: 'select', options: [['SI', 'SI / Metric (°C, m, kg, m³/h)'], ['IP', 'Imperial / IP (°F, ft, lb, cfm)']], hint: 'Data is always stored in SI; conversion is for display and entry only.' }),
        field(g, 'powerUnit', 'Refrigeration load unit', { type: 'select', options: Object.entries(CL.units.POWER).map(([k, v]) => [k, v.label]) }),
        field(g, 'dateFormat', 'Date format', { type: 'select', options: [['YYYY-MM-DD', '2026-09-25'], ['DD/MM/YYYY', '25/09/2026'], ['MM/DD/YYYY', '09/25/2026']] }),
        field(g, 'autosaveSec', 'Auto-save', { type: 'select', options: [['0', 'Off (manual save)'], ['30', 'Every 30 s'], ['60', 'Every minute'], ['300', 'Every 5 minutes']] })),
      saveBtn('Save preferences', async () => {
        App.user = await App.auth.updateProfile(App.user.id, { prefs: { theme: g.theme, units: g.units, powerUnit: g.powerUnit, dateFormat: g.dateFormat, autosaveSec: +g.autosaveSec, language: g.language } });
        await App.reloadSettings(); App.setupAutosave(); App.rerender();
      }));
  }

  async function company() {
    const cos = await App.repo.listCompanies();
    return h('div', {}, cos.map((c0) => {
      const c = { ...c0 };
      return card(c.name + (c.isDefault ? ' (default)' : ''), 'Shown on the login screen and report cover pages',
        h('div', { class: 'logo-edit' }, c.logo ? h('img', { src: c.logo, alt: 'Company logo' }) : h('div', { class: 'logo-ph' }, 'No logo'),
          h('div', {}, btn('Upload logo', async () => { const f = await readFile('image/png,image/jpeg,image/svg+xml,image/webp'); if (!f) return; if (f.size > 1048576) { toast('Logo must be under 1 MB.', 'err'); return; } c.logo = await fileToDataUrl(f); await App.repo.saveCompany(c); App.rerender(); }, { small: true, icon: 'restore' }),
            c.logo ? btn('Remove logo', async () => { c.logo = ''; await App.repo.saveCompany(c); App.rerender(); }, { small: true }) : null)),
        h('div', { class: 'grid' }, [['name', 'Company name'], ['phone', 'Phone'], ['email', 'Email'], ['web', 'Website']].map(([k, l]) => field(c, k, l, { type: 'text' })), field(c, 'address', 'Address', { type: 'textarea', wide: true })),
        h('div', { class: 'row' }, saveBtn('Save company', () => App.repo.saveCompany(c).then(() => App.rerender())),
          c.isDefault ? null : btn('Make default', async () => { await App.repo.saveCompany({ ...c, isDefault: true }); App.rerender(); }, { small: true }),
          cos.length > 1 ? btn('Delete', async () => { if (await confirmDlg('Delete company', `Delete “${c.name}”?`, { ok: 'Delete', danger: true })) { try { await App.repo.removeCompany(c.id); App.rerender(); } catch (e) { toast(e.message, 'err', 5000); } } }, { small: true, kind: 'ghost-danger', icon: 'trash' }) : null));
    }), btn('Add company', async () => { const v = await formDlg('New company', [{ key: 'name', label: 'Company name', required: true }]); if (v) { await App.repo.saveCompany(v); App.rerender(); } }, { icon: 'plus' }));
  }

  async function projDefaults() {
    const s = { ...(App.settings.projectDefaults || {}) };
    const customers = await App.repo.listCustomers();
    const statuses = [...(App.settings.statuses || CL.repo.DEFAULT_STATUSES)];
    const st = { list: statuses.join('\n') };
    return h('div', {},
      card('Customer & project defaults', 'Used when creating new projects', h('div', { class: 'grid' },
        field(s, 'customerId', 'Default customer', { type: 'select', options: [['', '— none —'], ...customers.map((c) => [c.id, c.name])] }),
        field(s, 'type', 'Default project type', { type: 'text' })),
        saveBtn('Save defaults', () => App.repo.setSetting('projectDefaults', s).then(App.reloadSettings)),
        h('p', { class: 'muted small' }, 'Manage customers, logos and contacts under ', h('a', { href: '#/customers' }, 'Customers'), '.')),
      card('Project statuses', 'One per line, in lifecycle order', field(st, 'list', 'Statuses', { type: 'textarea', rows: 8, wide: true, hint: 'Default: Draft, In Progress, Calculation Complete, Under Review, Approved, Issued, Archived. Existing projects keep their status text.' }),
        saveBtn('Save statuses', async () => { const list = st.list.split('\n').map((x) => x.trim()).filter(Boolean); if (!list.length) throw new Error('At least one status is required.'); await App.repo.setSetting('statuses', list); await App.reloadSettings(); })));
  }

  async function engineering() {
    const e = { ...App.settings.engineering };
    const tpls = await App.repo.listTemplates('machineryVent');
    return h('div', {},
      card('Default design parameters', 'Applied to new projects only — existing projects are never changed', h('div', { class: 'grid' },
        field(e, 'ambientDB', 'Outdoor design dry-bulb', { kind: 'temp', tip: 'ambientDB' }), field(e, 'ambientRH', 'Coincident RH', { unit: '%' }),
        field(e, 'altitude', 'Altitude', { kind: 'len' }), field(e, 'groundTemp', 'Ground temperature', { kind: 'temp', tip: 'groundTemp' }),
        field(e, 'safetyFactor', 'Safety factor', { unit: '%', tip: 'safetyFactor' }), field(e, 'refrigerant', 'Refrigerant', { type: 'select', options: D.refrigerants.map((r) => [r, r]) })),
        saveBtn('Save defaults', async () => { await App.repo.setSetting('engineering', e); await App.reloadSettings(); })),
      card('Common machinery-room ventilation standards', 'Reusable design bases; projects link to them and may override values',
        tpls.length ? h('table', { class: 'rtable' }, h('thead', {}, h('tr', {}, ['Name', 'Version', 'Code', 'Refrigerant', 'Setpoints', 'Supply air', 'Modified', ''].map((x) => h('th', {}, x)))),
          h('tbody', {}, tpls.map((t) => h('tr', {}, h('td', {}, t.name), h('td', {}, 'v' + t.version), h('td', {}, (root.HLVent.codes[t.data.code] || {}).name || t.data.code), h('td', {}, t.data.refrigerant), h('td', {}, `${t.data.setpoint} / max ${t.data.maxSetpoint} ppm`), h('td', {}, `${t.data.tsaC} °C`), h('td', {}, fdate(t.modifiedAt)),
            h('td', { class: 'acts' }, btn('Edit', () => editTemplate(t), { small: true, icon: 'edit' }), btn('', async () => { if (await confirmDlg('Delete standard', `Delete “${t.name}”? Linked projects keep their values (their snapshot) but will no longer receive updates.`, { ok: 'Delete', danger: true })) { await App.repo.removeTemplate(t.id); App.rerender(); } }, { small: true, icon: 'trash', kind: 'ghost-danger' })))))) : h('p', { class: 'muted' }, 'No standards yet. Create one here or from a project machinery room (“Save these values as a new common standard”).'),
        btn('New standard', () => editTemplate({ kind: 'machineryVent', name: 'Ammonia machinery room — IIAR 2', data: CL.venttpl.templateFromRoom(root.HLVent.newMachineryRoom()).data }), { icon: 'plus' }),
        h('p', { class: 'muted small' }, 'Editing a standard creates a new version. Linked projects show “standard updated — review” and change only when the engineer accepts; project overrides are kept.')));
  }

  async function editTemplate(t) {
    const d = { ...t.data };
    const yn = [['yes', 'Yes'], ['no', 'No']];
    const body = h('div', { class: 'grid' },
      field(t, 'name', 'Standard name', { type: 'text', wide: true }),
      field(d, 'code', 'Code basis', { type: 'select', options: Object.entries(root.HLVent.codes).map(([k, v]) => [k, v.name]) }),
      field(d, 'refrigerant', 'Refrigerant', { type: 'select', options: [['ammonia', 'Ammonia (R717)'], ['other', 'Other']] }),
      field(d, 'detector', 'Detector activates ventilation', { type: 'select', options: yn }), field(d, 'maxSetpoint', 'Max. setpoint', { unit: 'ppm' }), field(d, 'setpoint', 'Setpoint', { unit: 'ppm' }),
      field(d, 'basement', 'Basement', { type: 'select', options: yn }), field(d, 'occupants', 'Design occupancy'),
      field(d, 'toaC', 'Outdoor design DB', { kind: 'temp' }), field(d, 'tsaC', 'Supply air', { kind: 'temp' }));
    const ok = await modal({ title: t.id ? `Edit standard (new version v${t.version + 1})` : 'New standard', wide: true, body, actions: [{ label: 'Cancel', value: false }, { label: 'Save standard', value: true, kind: 'primary' }] });
    if (!ok) return;
    try { await App.repo.saveTemplate({ ...t, data: d }); toast('Standard saved'); App.rerender(); } catch (e) { toast(e.message, 'err'); }
  }

  async function climate() {
    const list = (await App.repo.listClimate()).sort((a, b) => (a.region + a.country + a.city).localeCompare(b.region + b.country + b.city));
    const st = App.ui.climF = App.ui.climF || { q: '' };
    const tb = h('div');
    const draw = () => {
      const q = st.q.toLowerCase();
      const rows = list.filter((c) => !q || [c.region, c.country, c.state, c.city].join(' ').toLowerCase().includes(q)).slice(0, 300);
      tb.replaceChildren(h('div', { class: 'tablewrap' }, h('table', { class: 'rtable compact' }, h('thead', {}, h('tr', {}, ['Region', 'Country', 'State', 'City', 'Elev. [m]', '0.4 % DB', '0.4 % MCWB', '1 % DB', '1 % MCWB', 'Source', 'Status', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.map((c) => h('tr', {}, h('td', {}, c.region), h('td', {}, c.country), h('td', {}, c.state), h('td', {}, c.city), h('td', { class: 'num' }, fmt(c.elevation, 0)),
          ...['db04', 'mcwb04', 'db1', 'mcwb1'].map((k) => h('td', { class: 'num' }, c[k] === '' || c[k] == null ? '—' : fmt(c[k], 1))), h('td', {}, [c.source, c.edition].filter(Boolean).join(' ') || '—'),
          h('td', {}, h('span', { class: 'chip sm ' + (c.status === 'seed' ? 'st-draft' : 'st-approved') }, c.status)), h('td', {}, btn('Edit', () => editCity(c), { small: true, icon: 'edit' }))))))),
      rows.length === 300 ? h('p', { class: 'muted small' }, 'Showing the first 300 matches — refine the search.') : null);
    };
    draw();
    return card('City library', `${list.length} cities · design temperatures entered by you`,
      h('p', { class: 'muted small' }, 'Seed rows contain names, approximate coordinates and elevation only. Enter design dry-bulb and mean coincident wet-bulb from your licensed ASHRAE climatic data (or company weather list); values are reused on every project. ASHRAE design values are not included with the application.'),
      h('div', { class: 'row' }, h('input', { type: 'search', placeholder: 'Filter cities…', value: st.q, oninput: (e) => { st.q = e.target.value; draw(); } }),
        btn('Add city', () => editCity({ region: 'Mid-East', country: '', state: '—', city: '', lat: '', lon: '', elevation: '', db04: '', mcwb04: '', db1: '', mcwb1: '', db996: '', source: '', edition: '', status: 'user-entered' }), { small: true, icon: 'plus' }),
        btn('Import CSV', importCsv, { small: true, icon: 'restore' }), btn('CSV template', () => saveFile('ColdLoad_city_library_template.csv', CL.xlsx.csv([CSV_COLS, ['Mid-East', 'Saudi Arabia', 'Riyadh', 'Riyadh', 24.71, 46.68, 610, '', '', '', '', '', 'ASHRAE Handbook—Fundamentals', '(edition)']]), 'text/csv'), { small: true, icon: 'backup' })),
      tb);
  }
  const CSV_COLS = ['region', 'country', 'state', 'city', 'lat', 'lon', 'elevation', 'db04', 'mcwb04', 'db1', 'mcwb1', 'db996', 'source', 'edition'];

  async function editCity(c0) {
    const c = { ...c0 };
    const body = h('div', { class: 'grid' },
      field(c, 'region', 'Region', { type: 'select', options: CL.climate.REGIONS.map((r) => [r, r]) }), field(c, 'country', 'Country', { type: 'text' }), field(c, 'state', 'State / province', { type: 'text' }), field(c, 'city', 'City', { type: 'text' }),
      field(c, 'lat', 'Latitude [°]'), field(c, 'lon', 'Longitude [°]'), field(c, 'elevation', 'Elevation [m]'),
      field(c, 'db04', '0.4 % design DB [°C]'), field(c, 'mcwb04', '0.4 % MCWB [°C]'), field(c, 'db1', '1 % design DB [°C]'), field(c, 'mcwb1', '1 % MCWB [°C]'), field(c, 'db996', '99.6 % heating DB [°C]'),
      field(c, 'source', 'Source', { type: 'text' }), field(c, 'edition', 'Edition / year', { type: 'text' }));
    const ok = await modal({ title: c.id ? `Edit ${c0.city}` : 'Add city', wide: true, body, actions: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, kind: 'primary' }] });
    if (!ok) return;
    if (!String(c.city).trim() || !String(c.country).trim()) { toast('Country and city are required.', 'err'); return; }
    if (!c.id) c.id = `user:${c.country}:${c.state}:${c.city}`.toLowerCase().replace(/\s+/g, '-');
    await App.repo.saveClimate(c); toast('City saved'); App.rerender();
  }

  async function importCsv() {
    const f = await readFile('.csv,text/csv'); if (!f) return;
    const text = (await f.text()).replace(/^﻿/, '');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const split = (l) => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',' || ch === ';') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
    const head = split(lines[0]).map((x) => x.toLowerCase());
    const miss = ['region', 'country', 'city'].filter((k) => !head.includes(k));
    if (miss.length) { errorDlg('Importing cities', new Error(`The CSV is missing required column(s): ${miss.join(', ')}.`), 'Download the CSV template and use its header row.'); return; }
    const numK = ['lat', 'lon', 'elevation', 'db04', 'mcwb04', 'db1', 'mcwb1', 'db996'];
    const existing = await App.repo.listClimate();
    const rows = [], bad = [];
    lines.slice(1).forEach((l, i) => {
      const v = split(l); const r = {};
      head.forEach((k, j) => { if (CSV_COLS.includes(k)) r[k] = v[j] ?? ''; });
      for (const k of numK) if (r[k] !== undefined && r[k] !== '') { if (!Number.isFinite(+r[k])) { bad.push(`Row ${i + 2}: ${k} “${r[k]}” is not a number`); return; } r[k] = +r[k]; }
      if (!CL.climate.REGIONS.includes(r.region)) { bad.push(`Row ${i + 2}: unknown region “${r.region}”`); return; }
      if (!r.city || !r.country) { bad.push(`Row ${i + 2}: country and city are required`); return; }
      r.state = r.state || '—';
      const match = existing.find((c) => c.country.toLowerCase() === r.country.toLowerCase() && c.city.toLowerCase() === r.city.toLowerCase() && (c.state || '—') === r.state);
      rows.push({ ...(match || {}), ...r, id: match ? match.id : `user:${r.country}:${r.state}:${r.city}`.toLowerCase().replace(/\s+/g, '-') });
    });
    const ok = await modal({ title: 'Import cities', body: h('div', {}, h('p', {}, `${rows.length} valid row(s) — ${rows.filter((r) => existing.some((c) => c.id === r.id)).length} update existing cities.`), bad.length ? h('div', { class: 'warn-box' }, h('b', {}, `${bad.length} row(s) skipped:`), h('ul', {}, bad.slice(0, 12).map((b) => h('li', {}, b)))) : null),
      actions: [{ label: 'Cancel', value: false }, { label: `Import ${rows.length}`, value: true, kind: 'primary' }] });
    if (!ok) return;
    for (const r of rows) await App.repo.saveClimate(r);
    toast(`${rows.length} cities imported`); App.rerender();
  }

  async function standardsSec() { return standardsView(true); }
  App.views.standards = () => h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Standards & references'), h('p', { class: 'muted' }, 'Engineering reference register used for tips, reports and traceability.'))), standardsView(false));

  function standardsView(editable) {
    const box = h('div');
    const CLS = CL.refs.CLASS_LABEL;
    (async () => {
      const refs = (await App.repo.listReferences()).sort((a, b) => (a.topic + a.name).localeCompare(b.topic + b.name));
      const groups = {}; for (const r of refs) (groups[r.topic] = groups[r.topic] || []).push(r);
      box.replaceChildren(
        h('div', { class: 'legend' }, Object.entries(CLS).map(([k, v]) => h('span', { class: 'chip sm cls-' + k }, v)),
          h('span', { class: 'muted small' }, 'Clause numbers are shown only where verified from a supplied document; others are marked “to be verified”.')),
        ...Object.entries(groups).map(([topic, list]) => card(topic, `${list.length} reference(s)`, h('div', { class: 'tablewrap' }, h('table', { class: 'rtable' },
          h('thead', {}, h('tr', {}, ['Reference', 'Number', 'Edition', 'Clause', 'Application', 'Classification', 'Source / notes', editable ? '' : null].filter((x) => x !== null).map((x) => h('th', {}, x)))),
          h('tbody', {}, list.map((r) => h('tr', {}, h('td', {}, h('b', {}, r.name)), h('td', {}, r.number), h('td', {}, r.edition),
            h('td', {}, r.clause ? [r.clause, r.clauseVerified ? h('span', { class: 'chip sm st-approved' }, 'verified') : h('span', { class: 'chip sm st-draft' }, 'unverified')] : '—'),
            h('td', {}, r.application), h('td', {}, h('span', { class: 'chip sm cls-' + r.classification }, CLS[r.classification] || r.classification)), h('td', { class: 'muted small' }, [r.source, r.notes].filter(Boolean).join(' — ')),
            editable ? h('td', {}, btn('Edit', () => editRef(r), { small: true, icon: 'edit' })) : null))))))),
        editable ? btn('Add reference', () => editRef({ name: '', number: '', edition: '', clause: '', clauseVerified: false, topic: 'Heat load method', application: '', source: '', notes: '', classification: 'practice', userDefined: true }), { icon: 'plus' }) : null);
    })();
    return box;
  }

  async function editRef(r0) {
    const r = { ...r0, clauseVerified: r0.clauseVerified ? 'yes' : 'no' };
    const body = h('div', { class: 'grid' },
      field(r, 'name', 'Standard / reference name', { type: 'text', wide: true }), field(r, 'number', 'Standard number', { type: 'text' }), field(r, 'edition', 'Edition / year', { type: 'text' }),
      field(r, 'clause', 'Section / clause', { type: 'text' }), field(r, 'clauseVerified', 'Clause verified against the document?', { type: 'select', options: [['no', 'No — to be verified'], ['yes', 'Yes — verified']] }),
      field(r, 'topic', 'Topic', { type: 'text' }), field(r, 'classification', 'Classification', { type: 'select', options: Object.entries(CL.refs.CLASS_LABEL) }),
      field(r, 'application', 'Application', { type: 'textarea', wide: true }), field(r, 'source', 'Source / document', { type: 'text', wide: true }), field(r, 'notes', 'Notes', { type: 'textarea', wide: true }));
    const v = await modal({ title: r0.id ? 'Edit reference' : 'Add reference', wide: true, body, actions: [r0.id && r0.userDefined ? { label: 'Delete', value: 'del', kind: 'danger' } : null, { label: 'Cancel', value: false }, { label: 'Save', value: true, kind: 'primary' }].filter(Boolean) });
    if (v === 'del') { if (await confirmDlg('Delete reference', `Delete “${r0.name}”?`, { ok: 'Delete', danger: true })) { await App.repo.removeReference(r0.id); App.rerender(); } return; }
    if (!v) return;
    if (!String(r.name).trim()) { toast('Name is required.', 'err'); return; }
    await App.repo.saveReference({ ...r, clauseVerified: r.clauseVerified === 'yes' }); toast('Reference saved'); App.rerender();
  }

  async function reports() {
    const s = { ...App.settings.reports };
    return card('Reports', 'Cover page, footer and document numbering', h('div', { class: 'grid' },
      field(s, 'calcTitle', 'Calculation title (cover page)', { type: 'text', wide: true }),
      field(s, 'numbering', 'Project numbering pattern', { type: 'text', hint: '{YYYY} = year, {####} = sequence (e.g. PRJ-{YYYY}-{####}, HL-{###})' }),
      field(s, 'showCompanyLogo', 'Company logo on cover', { type: 'select', options: [['true', 'Show'], ['false', 'Hide']] }),
      field(s, 'showCustomerLogo', 'Customer logo on cover', { type: 'select', options: [['true', 'Show'], ['false', 'Hide']] }),
      field(s, 'footer', 'Page footer text', { type: 'textarea', wide: true, hint: 'Printed at the bottom of every page with the document number, revision and page numbers.' })),
    saveBtn('Save report settings', async () => { s.showCompanyLogo = String(s.showCompanyLogo) !== 'false'; s.showCustomerLogo = String(s.showCustomerLogo) !== 'false'; await App.repo.setSetting('reports', s); await App.reloadSettings(); }),
    h('p', { class: 'muted small' }, 'Report format: A4 portrait, printed to PDF through the browser print dialog (“Save as PDF”). Document number = project number + “-HL-R” + revision.'));
  }

  async function storage() {
    const est = await App.store.estimate();
    const safety = await App.backup.listSafety();
    const lb = App.settings.lastBackup;
    return h('div', {},
      card('Database', 'Where your data is stored', h('table', { class: 'kv' },
        ...[['Storage', App.store.kind === 'indexeddb' ? 'Browser database (IndexedDB “coldload”, schema v2) in this Windows user’s Edge/Chrome profile' : 'Temporary memory only — NOT persistent'],
          ['Persistent storage', App.persisted ? 'Granted — the browser will not clear it automatically' : 'Not granted — the browser may clear data under low disk space. Back up regularly.'],
          ['Space used', est ? `${fmt(est.usage / 1048576, 1)} MB of ${fmt(est.quota / 1073741824, 1)} GB available` : 'Unknown'],
          ['Last backup', lb ? `${fdate(lb.at, true)} (${lb.scope}, ${lb.projects} project(s))` : 'Never'],
          ['Backup location', 'Chosen by you each time (Save dialog) — e.g. a network drive or synced folder']].map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v)))),
        h('p', { class: 'warn-box' }, icon('alert'), ' Clearing browsing data for this file/site in Edge or Chrome deletes the database. Keep regular full backups.'),
        h('div', { class: 'row' }, btn('Full backup now', () => CL.projectActions.backupProjects(null, 'full'), { kind: 'primary', icon: 'backup' }), btn('Restore from file', () => CL.projectActions.restoreFromFile(), { icon: 'restore' }))),
      card('Automatic safety backups', 'Created before every restore and migration; the last 5 are kept',
        safety.length ? h('table', { class: 'rtable' }, h('thead', {}, h('tr', {}, ['Created', 'Reason', 'Size', ''].map((x) => h('th', {}, x)))),
          h('tbody', {}, safety.map((s) => h('tr', {}, h('td', {}, fdate(s.createdAt, true)), h('td', {}, s.reason), h('td', {}, `${fmt(s.size / 1024, 0)} kB`),
            h('td', { class: 'acts' }, btn('Download', async () => { const p = await App.backup.getSafety(s.id); await saveFile(`ColdLoad_safety_${s.createdAt.slice(0, 16).replace(/[:T]/g, '-')}.json`, JSON.stringify(p), 'application/json'); }, { small: true, icon: 'backup' })))))) : h('p', { class: 'muted' }, 'None yet.')));
  }

  async function security() {
    const users = await App.auth.listUsers();
    const me = { displayName: App.user.displayName, email: App.user.email };
    return h('div', {},
      card('Your profile', `${App.user.username} · ${App.user.role}`, h('div', { class: 'grid' }, field(me, 'displayName', 'Display name (used as Prepared by / Modified by)', { type: 'text' }), field(me, 'email', 'Email', { type: 'text' })),
        h('div', { class: 'row' }, saveBtn('Save profile', async () => { App.user = await App.auth.updateProfile(App.user.id, me); }), btn('Change password', () => App.changePasswordDlg(), { icon: 'lock' }), btn('Sign out', () => App.signOut(), { icon: 'logout' }))),
      card('Users on this computer', App.user.role === 'admin' ? 'Administrators can add users' : 'Only administrators can add users',
        h('table', { class: 'rtable' }, h('thead', {}, h('tr', {}, ['Username', 'Name', 'Role', 'Created', 'Last sign-in'].map((x) => h('th', {}, x)))),
          h('tbody', {}, users.map((u) => h('tr', {}, h('td', {}, u.username), h('td', {}, u.displayName), h('td', {}, u.role), h('td', {}, fdate(u.createdAt)), h('td', {}, fdate(u.lastLoginAt, true)))))),
        App.user.role === 'admin' ? btn('Add user', async () => {
          const v = await formDlg('Add user', [{ key: 'displayName', label: 'Full name', required: true }, { key: 'username', label: 'Username', required: true }, { key: 'email', label: 'Email' }, { key: 'role', label: 'Role', type: 'select', options: [['engineer', 'Engineer'], ['admin', 'Administrator']] }, { key: 'password', label: 'Initial password', type: 'password', required: true, hint: 'The user should change it after first sign-in.', autocomplete: 'new-password' }]);
          if (!v) return; try { await App.auth.createUser(v); toast('User added'); App.rerender(); } catch (e) { toast(e.message, 'err', 5000); }
        }, { icon: 'plus' }) : null),
      card('Security model', null, h('ul', { class: 'notes' },
        h('li', {}, 'Local accounts on this computer. Passwords are stored only as salted PBKDF2-SHA256 hashes (310 000 iterations); no default password exists.'),
        h('li', {}, 'Sessions expire after 12 hours, or 14 days with “Keep me signed in”. Changing the password signs out all sessions.'),
        h('li', {}, 'This controls access to the application. Stored project data is not encrypted; anyone with access to this Windows account and browser developer tools could read it.'),
        h('li', {}, 'Imported and restored files are validated (format, version, checksum, structure) and treated as data only — nothing in them is executed.'))));
  }

  async function about() {
    const V = CL.version;
    return card('About', null, h('table', { class: 'kv' }, ...[['Application', `${V.APP_NAME} ${V.APP_VERSION}`], ['Calculation engine', `${V.ENGINE_VERSION} (psychro.js, data.js, calc.js, vent.js)`], ['Input dataset version', V.INPUT_DATA_VERSION], ['Database schema', V.SCHEMA_VERSION],
      ['Method', 'Stoecker, Industrial Refrigeration Handbook · Dossat, Principles of Refrigeration · ASHRAE Handbook—Refrigeration (Refrigerated-Facility Loads) · IIAR machinery-room ventilation tool']].map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, String(v))))),
      h('p', { class: 'muted small' }, 'Company-neutral: branding, customers, numbering and statuses are configurable. The previous version remains available as the legacy single-file app.'));
  }

  /* ---------------- Help & knowledge ---------------- */
  const HELP = [
    ['start', 'How to use the application', [
      ['Workflow', 'Sign in → Dashboard → create or open a project → ① Project Details (customer, site, city, design criteria) → ② Detailed Design (rooms, machinery rooms) → ③ Review & Report (validation, results, assumptions, revisions & review, report/export).'],
      ['Saving', 'Edits are held in the working copy and shown as “Unsaved changes” until you press Save (Ctrl+S) or auto-save runs (Settings → General). Save revision freezes the inputs and results as Rev 00, 01… Revisions are never overwritten.'],
      ['Undo / Redo', 'Ctrl+Z / Ctrl+Y undo and redo edits in the open project (outside text boxes). History is cleared when the project is closed.'],
      ['Reference guide', 'Press F1 or the Guide button in the action bar to open a side panel with the method, formulas, inputs to watch, checks and references for the screen you are working on. It stays open while you type and follows the current step and tab; you can also pin a topic.'],
      ['Search', 'Ctrl+K searches project names and numbers, customers, sites, engineers, notes, statuses and room names. Partial words match.']]],
    ['projects', 'Project creation guide', [
      ['New project', 'Action bar → New. Enter the project name, number (auto-numbered), customer, type and site. Each project gets a unique internal Project ID.'],
      ['Customers', 'Create customers with logo and contacts under Customers, or directly in the New Project dialog. Several projects per customer are supported; projects never overwrite each other.'],
      ['City selection', 'Choose Region → Country → State → City. If the city library has design temperatures, the outdoor design dry-bulb, humidity and altitude are filled in and the source is recorded. Otherwise enter the values once — they are stored for future projects.'],
      ['Rooms', 'Add rooms from typical presets (chiller, fruit store, freezer, blast freezer, anteroom, processing, ripening). Presets are starting points only — review every input.']]],
    ['method', 'Calculation methodology', [
      ['Basis', 'Loads are summed as energy per 24 h and divided by the compressor run time: Q_design = Σ loads × (1 + safety) ÷ run time. This is the method of Stoecker, Dossat and the ASHRAE Handbook—Refrigeration.'],
      ['Transmission', 'Q = U·A·ΔT with U = 1/(1/hᵢ + L/k + 1/hₒ). Sun effect is added to the outdoor temperature of exposed surfaces. Floors use the ground/heated-slab temperature.'],
      ['Product', 'Sensible heat above freezing + latent heat + sensible heat below freezing, with specific heats from water content (Siebel), expressed per 24 h as Q × 24 / pull-down time. Packaging and heat of respiration (stored produce and, optionally, incoming produce) are added. Entered c_p / latent-heat values replace the Siebel estimates. Room option “rate over pull-down” takes the product heat at Q / min(pull-down, run time) instead.'],
      ['Options (engine 1.1.0)', 'Heat loss to colder surroundings can be credited (default) or not credited (conservative) — Design criteria. The evaporator-fan allowance is never negative. All options default to the engine 1.0.0 behaviour; see docs/GATE-3-ENGINE-CHANGES.md.'],
      ['Infiltration', 'Door method (Gosney & Olama): q = 0.221·A·Δh·ρ·√(1−ρᵢ/ρᵣ)·√(gH)·Fm × open time × D_f × (1 − E). Air-change method: V × n × Δh with n from Dossat’s table or empirical 70/√V, 35/√V formulas.'],
      ['Internal & equipment', 'People 272 − 6t W/person; lighting W/m² × area × hours; forklifts and equipment kW × hours; evaporator fans as % allowance or motor kW; defrost heat × fraction released to the room.'],
      ['Tunnel / blast freezers', 'Step ② → Tunnel / blast freezers. Freezing time by Plank (latent heat only) and by Pham’s method as given in ASHRAE (includes pre-cooling and sub-cooling) for slabs/cartons, cylinders and spheres, with h_eff = 1/(1/h_air + R_packaging). The refrigeration load follows the continuous-flow method of your heat-load workbook: ṁ = batch ÷ freezing time (or belt throughput), Q = ṁ·[c₁(t₁ − t_f) + h_if + c₂(t_f − t₂)], plus packaging, trolleys, transmission, door or belt-opening infiltration, fans, lighting, equipment and defrost; loss & safety Q ÷ (1 − x). Product properties come from the tabulated library imported from the workbook (113 products). Tunnel capacities are added to the plant total at their suction level. Open the Reference guide (F1) while working for formulas, inputs and checks.'],
      ['Machinery room', 'Normal, continuous and emergency ventilation per the selected code, following the IIAR Machinery Room Ventilation Analysis Tool (IIAR 2-2008 Addendum A: emergency 30 ACH; normal = max of 20 ACH or 40 °C temperature limit).'],
      ['Transparency', 'In ② → Calculation & results, every load shows its formula, inputs, intermediate values and result. The same is printed in the report.']]],
    ['inputs', 'Input definitions', Object.values(CL.refs.TIPS).map((t) => [t.t, t.x + (t.r ? ` Typical: ${t.r}.` : '')])],
    ['terms', 'Engineering terminology', [
      ['SST', 'Saturated suction temperature — evaporating temperature; room temperature minus evaporator TD.'], ['TD', 'Temperature difference between room air entering the coil and the evaporating temperature.'],
      ['TR', 'Ton of refrigeration = 3.517 kW = 12 000 Btu/h.'], ['MCWB', 'Mean coincident wet-bulb temperature at the design dry-bulb.'], ['ACH', 'Air changes per hour.'],
      ['Pull-down time', 'Time allowed to cool product to its final temperature.'], ['Run time', 'Hours per day the refrigeration plant runs to remove the daily load.'], ['Safety factor', 'Design allowance added to the calculated load for uncertainty.'],
      ['Frost load', 'Water vapour entering with infiltration air that deposits on the coils as frost.'], ['CRF', 'Chilling rate factor (Dossat) for fast chilling of warm product.']]],
    ['standards', 'Standards / reference information', [['Reference register', 'See Standards & references in the navigation. Each entry records name, number, edition, clause (only where verified), application, source and classification: required/code-based, recommended practice, application assumption, or user-defined.'],
      ['Verification', 'Only IIAR 2-2008 Addendum A clauses reproduced in the supplied IIAR ventilation tool are marked verified. Confirm editions adopted in your jurisdiction and add them under Settings → Standards.'],
      ['Approvals', 'Internal review statuses (Checked, Approved, Issued) are engineering workflow only and do not imply approval by an authority having jurisdiction.']]],
    ['trouble', 'Troubleshooting', [
      ['Validation errors', 'Open ③ → Validation; click a message to jump to the input. Errors mean the result must not be relied on; the engine’s behaviour for the entered value is stated.'],
      ['“Browser database unavailable”', 'Private/InPrivate windows or blocked site data prevent storage. Open the application in a normal window. Until then, use Backup to keep your work.'],
      ['Restore refused', 'The file failed validation (damaged, modified or from a newer version). Nothing was changed. Use another backup or update the application.'],
      ['Report layout', 'Use Chrome or Edge, A4, “Save as PDF”, margins Default, and enable “Background graphics” for coloured headers.']]],
    ['faq', 'FAQ', [
      ['Where is my data?', 'In this Windows user’s browser profile (IndexedDB). Back it up to a network or cloud folder from Settings → Storage or the action bar.'],
      ['Can two engineers share projects?', 'Each PC has its own database. Share projects by exporting a project package (.json) and importing it on the other PC, or restore a shared backup.'],
      ['Did results change from the previous version?', 'No, not with default options. Engine 1.1.0 adds approved optional methods; with defaults every recorded baseline case is identical to engine 1.0.0, and migrated projects show identical totals. Revisions keep the results and engine version recorded when they were saved.'],
      ['Are ASHRAE weather data included?', 'No — they are licensed. Enter design values into the city library from your own copy, or import a CSV.']]],
  ];

  App.views.help = async (params) => {
    const sec = params[0] || 'start';
    const cur = HELP.find((x) => x[0] === sec) || HELP[0];
    return h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Help & knowledge centre'), h('p', { class: 'muted' }, 'Using the application and understanding the calculations.'))),
      h('div', { class: 'settings' }, h('nav', { class: 'subnav' }, HELP.map(([k, l]) => h('a', { href: `#/help/${k}`, class: k === cur[0] ? 'active' : '' }, l))),
        h('div', { class: 'set-body' }, card(cur[1], null, h('dl', { class: 'helpdl' }, cur[2].map(([t, x]) => [h('dt', {}, t), h('dd', {}, x)]))))));
  };
})(globalThis);
