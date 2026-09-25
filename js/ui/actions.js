/* Project-level actions shared by the action bar and views. */
(function (root) {
  'use strict';
  const CL = root.CL, App = CL.App;
  const { h, icon, toast, modal, confirmDlg, errorDlg, formDlg, alertDlg, fmt, fdate, saveFile, readFile, slug } = CL.ui;

  async function ctxFor(o, revision) {
    const [companies, customers, revisions, refs] = await Promise.all([App.repo.listCompanies(), App.repo.listCustomers(), App.repo.listRevisions(o.id), App.repo.listReferences()]);
    const rec = o.rec, data = revision ? revision.data : o.data;
    return {
      project: { ...rec, ...(o.meta || {}) }, data, revision: revision || null, revisions,
      company: companies.find((c) => c.id === ((o.meta || {}).companyId || rec.companyId)) || companies.find((c) => c.isDefault) || {},
      customer: customers.find((c) => c.id === ((o.meta || {}).customerId || rec.customerId)) || {},
      user: App.user, settings: App.settings, messages: CL.validate.validateProject(data, root.HLCalc, root.HLData, root.HLVent),
      refs: refs.sort((a, b) => a.name.localeCompare(b.name)), version: CL.version, calc: root.HLCalc, vent: root.HLVent,
      explain: CL.explain, D: root.HLData, M: root.HLModel, venttpl: CL.venttpl, units: CL.units, plant: CL.plant,
    };
  }

  const needOpen = () => { if (!App.open) { toast('Open a project first.', 'warn'); return true; } return false; };
  const afterExport = (res, what) => {
    if (!res.saved) return;
    if (res.desktop && res.path) {
      toast(`${what} saved: ${res.name}`, 'ok', 12000, [{ label: 'Open', run: () => root.desktop.openPath(res.path).catch((e) => toast(`The file could not be opened: ${e.message}`, 'err')) }, { label: 'Show in folder', run: () => root.desktop.showInFolder(res.path) }]);
      return;
    }
    toast(res.picker ? `${what} saved as “${res.name}”. Open it from that folder; your computer uses the default application for this file type.` : `${what} downloaded as “${res.name}”. Open it from your browser's downloads; your computer opens it with the default application.`, 'ok', 6500);
  };

  const PROJECT_TYPES = ['Cold store', 'Freezer store', 'Distribution centre', 'Food processing', 'Fruit & vegetable', 'Blast freezing', 'Meat / poultry', 'Dairy', 'Other'];
  const projectTypes = (extra) => (extra && !PROJECT_TYPES.includes(extra) ? [extra, ...PROJECT_TYPES] : PROJECT_TYPES);

  async function newProject() {
    const customers = (await App.repo.listCustomers()).sort((a, b) => a.name.localeCompare(b.name));
    const no = await App.repo.nextProjectNo();
    const def = App.settings.projectDefaults || {};
    const v = await formDlg('New project', [
      { key: 'name', label: 'Project name', required: true },
      { key: 'projectNo', label: 'Project number', value: no, required: true, hint: 'Auto-numbered from Settings → Reports; you may change it.' },
      { key: 'customerId', label: 'Customer', type: 'select', value: def.customerId || '', options: [['', '— none —'], ['__new', '+ New customer…'], ...customers.map((c) => [c.id, c.name])] },
      { key: 'type', label: 'Project type', type: 'select', value: def.type || '', options: [['', '—'], ...projectTypes(def.type).map((x) => [x, x])] },
      { key: 'site', label: 'Site' },
    ], { ok: 'Create project' });
    if (!v) return;
    if (!(await App.closeProject())) return;
    try {
      if (v.customerId === '__new') {
        const c = await formDlg('New customer', [{ key: 'name', label: 'Customer name', required: true }, { key: 'address', label: 'Address', type: 'textarea' }]);
        if (!c) return;
        v.customerId = (await App.repo.saveCustomer(c)).id;
      }
      if ((await App.projects(true)).some((p) => p.projectNo === v.projectNo.trim())) { toast(`Project number ${v.projectNo} already exists.`, 'err'); return; }
      const p = await App.repo.createProject({ name: v.name.trim(), projectNo: v.projectNo.trim(), customerId: v.customerId || null, type: v.type, site: v.site });
      App.cache.projects = null;
      toast(`Project ${p.projectNo} created`);
      App.go(`project/${p.id}/details`);
    } catch (e) { errorDlg('Creating the project', e); }
  }

  async function saveAs() {
    if (needOpen()) return;
    const o = App.open;
    const v = await modal({ title: 'Save As', body: h('div', { class: 'choice' },
      h('p', {}, 'Choose how to save a copy of the current working state:'),
      h('ul', {}, h('li', {}, h('b', {}, 'New revision'), ' — freezes the current state as the next revision of this project (history is kept).'), h('li', {}, h('b', {}, 'New project'), ' — creates a separate project with a new Project ID and number.'))),
    actions: [{ label: 'Cancel', value: null }, { label: 'New project', value: 'project' }, { label: 'New revision', value: 'rev', kind: 'primary' }] });
    if (v === 'rev') return saveRevision();
    if (v === 'project') {
      const no = await App.repo.nextProjectNo();
      const f = await formDlg('Save as new project', [{ key: 'name', label: 'Project name', value: `${o.rec.name} (copy)`, required: true }, { key: 'projectNo', label: 'Project number', value: no, required: true }]);
      if (!f) return;
      if (o.dirty && !(await App.save())) return;
      const p = await App.repo.saveAsProject(o.id, f);
      App.cache.projects = null; await App.closeProject();
      toast(`Saved as ${p.projectNo}`); App.go(`project/${p.id}/details`);
    }
  }

  async function saveRevision() {
    if (needOpen()) return;
    const o = App.open;
    const msgs = CL.validate.validateProject(o.data, root.HLCalc, root.HLData, root.HLVent);
    const errs = msgs.filter((m) => m.level === 'error').length;
    const revs = await App.repo.listRevisions(o.id);
    const next = String(revs.length ? revs[revs.length - 1].seq + 1 : 0).padStart(2, '0');
    const f = await formDlg(`Save revision ${next}`, [{ key: 'description', label: 'Change description', type: 'textarea', required: true, hint: 'What changed and why (printed in the revision history).' }],
      { ok: `Save Rev ${next}`, intro: errs ? `⚠ ${errs} validation error(s) are open. The revision will be saved but must not be issued.` : 'The revision stores the full input data, results and the calculation engine version.' });
    if (!f) return;
    if (o.dirty && !(await App.save())) return;
    try {
      const r = await App.repo.saveRevision(o.id, f.description, o.data);
      o.rec = await App.repo.getProject(o.id); App.cache.projects = null;
      toast(`Revision ${r.rev} saved`); App.updateBar(); App.rerender();
    } catch (e) { errorDlg('Saving the revision', e); }
  }

  async function print(revision, { pdf } = {}) {
    if (needOpen()) return;
    const ctx = await ctxFor(App.open, revision);
    const el = document.getElementById('report');
    el.innerHTML = CL.report.buildReport(ctx);
    const meta = el.querySelector('.rep-meta');
    document.documentElement.style.setProperty('--rep-meta', JSON.stringify(meta.dataset.meta));
    document.documentElement.style.setProperty('--rep-footer', JSON.stringify(meta.dataset.footer.slice(0, 120)));
    const oldTitle = document.title;
    document.title = el.querySelector('.rep').dataset.doc;
    const done = () => { document.title = oldTitle; window.removeEventListener('afterprint', done); };
    if (pdf && root.desktop) {
      try {
        const res = await root.desktop.printToPDF(`${document.title}.pdf`);
        afterExport({ ...res, desktop: true }, 'PDF report');
      } catch (e) { errorDlg('Creating the PDF', e, 'Check that the target folder is writable and the file is not open in another program.'); }
      finally { done(); }
      return;
    }
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  }
  const exportPdf = (revision) => print(revision, { pdf: true });

  async function exportXlsx(revision) {
    if (needOpen()) return;
    const ctx = await ctxFor(App.open, revision);
    const bytes = CL.xlsx.workbook(CL.report.exportSheets(ctx), { title: `${ctx.project.name} heat load`, creator: App.user.displayName, description: `${CL.version.APP_NAME} ${CL.version.APP_VERSION}, engine ${CL.version.ENGINE_VERSION}` });
    afterExport(await saveFile(`${slug(ctx.project.projectNo)}_${slug(ctx.project.name)}_R${revision ? revision.rev : 'WIP'}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'Excel workbook');
  }
  async function exportCsv(revision) {
    if (needOpen()) return;
    const ctx = await ctxFor(App.open, revision);
    afterExport(await saveFile(`${slug(ctx.project.projectNo)}_loads_R${revision ? revision.rev : 'WIP'}.csv`, CL.xlsx.csv(CL.report.csvRows(ctx)), 'text/csv'), 'CSV file');
  }
  async function exportPackage() {
    if (needOpen()) return;
    if (App.open.dirty && !(await confirmDlg('Unsaved changes', 'The package contains the last saved state. Save now first?', { ok: 'Save and export' }))) return;
    if (App.open.dirty && !(await App.save())) return;
    const pkg = await App.backup.build({ scope: 'project', projectIds: [App.open.id], user: App.user.displayName });
    afterExport(await saveFile(`${slug(App.open.rec.projectNo)}_${slug(App.open.rec.name)}.coldload-project.json`, JSON.stringify(pkg, null, 1), 'application/json'), 'Project package');
  }
  async function exportV1() {
    if (needOpen()) return;
    afterExport(await saveFile(`${slug(App.open.rec.name)}.coldload.json`, JSON.stringify(root.HLMigrate.toV1({ data: App.open.data }), null, 2), 'application/json'), 'Legacy v1 file');
  }

  async function backupDlg() {
    const v = await modal({ title: 'Backup', body: h('div', {},
      h('p', {}, 'Backups are checksummed JSON files you store wherever you choose (network drive, cloud folder, USB). User accounts and passwords are not included.'),
      h('ul', {}, h('li', {}, h('b', {}, 'Current project'), ' — the open project with all revisions and attachments.'), h('li', {}, h('b', {}, 'Selected projects'), ' — choose in the Document Center (tick boxes → Backup selected).'), h('li', {}, h('b', {}, 'Full database'), ' — every company, customer, project, revision, template, city, reference and setting.'))),
    actions: [{ label: 'Cancel', value: null }, { label: 'Selected projects…', value: 'sel' }, { label: 'Current project', value: 'cur' }, { label: 'Full database', value: 'full', kind: 'primary' }] });
    if (!v) return;
    if (v === 'sel') { App.go('documents'); toast('Tick the projects to back up, then choose “Backup selected”.', 'info', 5000); return; }
    if (v === 'cur') { if (needOpen()) return; if (App.open.dirty && !(await App.save())) return; return backupProjects([App.open.id], 'project'); }
    return backupProjects(null, 'full');
  }

  async function backupProjects(ids, scope) {
    try {
      const b = await App.backup.build({ scope: scope || 'selected', projectIds: ids, user: App.user.displayName });
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const res = await saveFile(`ColdLoad_${scope === 'full' ? 'full-backup' : `${b.counts.projects}-projects`}_${stamp}.coldload-backup.json`, JSON.stringify(b), 'application/json');
      if (res.saved) {
        await App.repo.setSetting('lastBackup', { at: b.createdAt, scope, projects: b.counts.projects });
        App.settings = await App.repo.getSettings();
        toast(`Backup saved: ${b.counts.projects} project(s), ${b.counts.revisions} revision(s).`, 'ok', 5000);
      }
    } catch (e) { errorDlg('Creating the backup', e, 'Check free disk space and try again.'); }
  }

  async function restoreFromFile() {
    const file = await readFile('.json,application/json');
    if (!file) return;
    let obj;
    try { obj = JSON.parse(await file.text()); } catch (e) { errorDlg('Reading the file', new Error(`“${file.name}” is not a valid ColdLoad backup, project or v1 file (not readable JSON).`), 'Choose a file exported by ColdLoad Pro.'); return; }
    const v = await App.backup.validate(obj);
    if (!v.ok) { errorDlg('Validating the file', Object.assign(new Error(`“${file.name}” failed validation. Nothing was changed.`), { details: v.errors }), 'Use an undamaged backup file.'); return; }
    if (v.legacyV1) {
      if (!(await confirmDlg('Import previous-version project', `“${(obj.info && obj.info.name) || file.name}” is a ColdLoad v1 project. It will be imported as a new project (revision 00) — nothing existing is overwritten.`, { ok: 'Import' }))) return;
      const r = await App.backup.restore(obj, { user: App.user.displayName });
      App.cache.projects = null; toast('Project imported'); App.go(`project/${r.projectIds[0]}/details`); return;
    }
    const conf = await App.backup.conflicts(obj);
    const i = v.info, c = i.counts || {};
    const mode = await modal({ title: 'Restore from backup', wide: true, body: h('div', {},
      h('table', { class: 'kv' }, ...[['File', file.name], ['Type', i.format === 'coldload-project' ? 'Project package' : 'Backup (' + i.scope + ')'], ['Backup date', fdate(i.createdAt, true)], ['Created by', i.createdBy || '—'], ['Application', `${i.appVersion} (engine ${i.engineVersion})`],
        ['Contents', `${c.projects || 0} project(s), ${c.revisions || 0} revision(s), ${c.customers || 0} customer(s), ${c.attachments || 0} attachment(s)`],
        ['Already present here', `${conf.projects} project(s), ${conf.customers} customer(s)`]].map(([k, x]) => h('tr', {}, h('th', {}, k), h('td', {}, x)))),
      v.warnings.map((w) => h('p', { class: 'warn-box' }, icon('alert'), ' ', w)),
      h('p', {}, 'Choose how to restore. A safety backup of the current database is created automatically first.'),
      h('ul', {}, h('li', {}, h('b', {}, 'Add missing only'), ' — keep everything that already exists; add records that are not present.'),
        h('li', {}, h('b', {}, 'Add as copies'), ' — projects that already exist are imported as separate “restored copy” projects.'),
        h('li', {}, h('b', {}, 'Replace everything'), ' — delete ALL current projects, customers and settings and load the backup.'))),
    actions: [{ label: 'Cancel', value: null }, { label: 'Replace everything…', value: 'replace', kind: 'danger' }, { label: 'Add as copies', value: 'copy' }, { label: 'Add missing only', value: 'skip', kind: 'primary' }] });
    if (!mode) return;
    if (mode === 'replace') {
      const ok = await formDlg('Confirm replace', [{ key: 'w', label: 'Type REPLACE to confirm', required: true }], { ok: 'Replace all data', intro: 'All current data will be replaced. A safety backup is kept in Settings → Storage.' });
      if (!ok || ok.w.trim().toUpperCase() !== 'REPLACE') { toast('Restore cancelled.', 'info'); return; }
    }
    if (!(await App.closeProject())) return;
    try {
      const r = await App.backup.restore(obj, { mode, user: App.user.displayName });
      App.cache.projects = null; App.settings = await App.repo.getSettings();
      await alertDlg('Restore complete', `Imported ${r.imported.projects} project(s), ${r.imported.revisions} revision(s), ${r.imported.customers} customer(s). Safety backup: ${fdate(r.safety.createdAt, true)} (Settings → Storage).`);
      App.go('documents');
    } catch (e) { errorDlg('Restoring the backup', e, 'Nothing was changed. The safety backup (if created) is in Settings → Storage.'); }
  }

  /** Desktop: write a full backup into the configured backup folder (auto = daily automatic). */
  async function backupToFolder(auto) {
    if (!root.desktop) return null;
    const b = await App.backup.build({ scope: 'full', user: App.user ? App.user.displayName : 'system' });
    const r = await root.desktop.writeBackup(JSON.stringify(b), !!auto);
    await App.repo.setSetting('lastBackup', { at: b.createdAt, scope: auto ? 'full (automatic)' : 'full (folder)', projects: b.counts.projects, path: r.path });
    App.settings = await App.repo.getSettings();
    return r;
  }
  async function autoBackupIfDue() {
    if (!root.desktop) return;
    try {
      const info = await root.desktop.info();
      if (!info.autoBackup) return;
      if (info.lastAutoBackup && Date.now() - new Date(info.lastAutoBackup) < 20 * 3600e3) return;
      const r = await backupToFolder(true);
      if (r) toast(`Automatic backup saved to ${r.dir}`, 'info', 5000);
    } catch (e) { toast(`Automatic backup failed: ${e.message}`, 'err', 8000); }
  }

  CL.projectActions = { backupToFolder, autoBackupIfDue, exportPdf, projectTypes, newProject, saveAs, saveRevision, print, exportXlsx, exportCsv, exportPackage, exportV1, backupDlg, backupProjects, restoreFromFile, ctxFor };
})(globalThis);
