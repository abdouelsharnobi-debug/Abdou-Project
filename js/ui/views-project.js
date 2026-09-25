/* Project workspace: header + stepper, ① Project Details, ③ Review & Report. (② Detailed Design in views-design.js) */
(function (root) {
  'use strict';
  const CL = root.CL, App = CL.App;
  const { h, icon, btn, toast, modal, confirmDlg, errorDlg, formDlg, alertDlg, fmt, fdate, field, fileToDataUrl, readFile, saveFile, esc } = CL.ui;
  const U = CL.units, D = root.HLData, C = root.HLCalc, V = root.HLVent;
  const pw = (kW) => `${fmt(U.pw(kW), U.pwDigits())} ${U.pwLabel()}`;

  const STEPS = [['details', 'Project Details', 'file'], ['design', 'Detailed Design', 'edit'], ['report', 'Review & Report', 'docs']];

  App.views.project = async (params) => {
    const [id, step = 'details', ...rest] = params;
    const o = await App.openProject(id);
    if (!o.meta) o.meta = Object.fromEntries(App.repo.META_FIELDS.map((k) => [k, o.rec[k]]));
    const host = h('div', { class: 'page project' });
    const draw = async () => {
      const msgs = CL.validate.validateProject(o.data, C, D, V);
      const cnt = CL.validate.count(msgs);
      const revs = await App.repo.listRevisions(o.id);
      const customers = await App.repo.listCustomers();
      const cust = customers.find((c) => c.id === o.meta.customerId);
      const last = revs[revs.length - 1];
      const stepState = (k) => (k === step ? 'active' : STEPS.findIndex((s) => s[0] === k) < STEPS.findIndex((s) => s[0] === step) ? 'done' : '');
      const head = h('div', { class: 'phead' },
        h('div', { class: 'ph-l' }, h('div', { class: 'ph-t' }, h('h1', {}, o.meta.name), CL.viewsMain.statusChip(o.meta.status), o.readonly ? h('span', { class: 'chip st-locked' }, icon('lock', 12), 'read-only') : null),
          h('div', { class: 'ph-m' }, h('span', { class: 'mono' }, o.meta.projectNo), cust ? h('span', {}, cust.name) : null, o.meta.site ? h('span', {}, o.meta.site) : null,
            h('span', {}, last ? `Rev ${last.rev} (${last.review.status})` : 'No revision saved'), h('span', { class: 'mono muted', title: 'Internal Project ID' }, 'ID ' + o.id.slice(0, 8)))),
        h('div', { class: 'ph-r' },
          h('button', { class: 'vbadges', onclick: () => App.go(`project/${o.id}/report/validation`), title: 'Validation messages' },
            h('span', { class: 'badge err' + (cnt.error ? '' : ' zero') }, icon('error', 13), cnt.error), h('span', { class: 'badge warn' + (cnt.warning ? '' : ' zero') }, icon('alert', 13), cnt.warning), h('span', { class: 'badge info' }, icon('info', 13), cnt.info)),
          h('div', { class: 'ph-total' }, h('small', {}, 'Design load'), h('b', { id: 'ph-total' }, pw(CL.plant(o.data).totalKW))),
          btn('Save revision', () => CL.projectActions.saveRevision(), { icon: 'layers', kind: 'primary', small: true })));
      const stepper = h('ol', { class: 'stepper' }, STEPS.map(([k, l, ic], i) => h('li', { class: stepState(k) },
        h('a', { href: `#/project/${o.id}/${k}` }, h('span', { class: 'st-n' }, stepState(k) === 'done' ? icon('check', 18) : icon(ic, 18)), h('span', { class: 'st-l' }, h('small', {}, `Step ${i + 1}`), l)))));
      const body = step === 'design' ? await CL.design.render(o, rest) : step === 'report' ? await renderReport(o, rest[0] || 'results', msgs, revs) : await renderDetails(o);
      host.replaceChildren(head, stepper, body);
    };
    App.onDataChange = (rerender) => {
      const t = document.getElementById('ph-total');
      if (t) try { t.textContent = pw(CL.plant(o.data).totalKW); } catch (e) { t.textContent = '–'; }
      if (rerender) draw();
      else if (CL.design.refresh) CL.design.refresh(o);
    };
    await draw();
    App.redrawProject = draw;
    return host;
  };

  /* ---------------- ① Project Details ---------------- */
  const sec = (title, sub, ...kids) => h('details', { class: 'card sect', open: true }, h('summary', {}, h('h3', {}, title), sub ? h('small', { class: 'muted' }, sub) : null), h('div', { class: 'sect-b' }, ...kids));
  CL.sect = sec;

  async function renderDetails(o) {
    const m = o.meta, d = o.data.design;
    const onMeta = (rerender) => { App.pendingMeta = m; App.changed(rerender); };
    const onData = (rerender) => App.changed(rerender);
    const [customers, companies, climate] = await Promise.all([App.repo.listCustomers(), App.repo.listCompanies(), App.repo.listClimate()]);
    const statuses = App.settings.statuses || CL.repo.DEFAULT_STATUSES;
    const f = (obj, k, label, opt, cb) => field(obj, k, label, opt, cb);

    const info = sec('Project information', 'Identification and parties',
      h('div', { class: 'grid' },
        f(m, 'name', 'Project name', { type: 'text', wide: true }, onMeta),
        f(m, 'projectNo', 'Project number', { type: 'text' }, onMeta),
        f(m, 'status', 'Project status', { type: 'select', options: statuses.map((s) => [s, s]) }, onMeta),
        f(m, 'type', 'Project type', { type: 'select', options: [['', '—'], ...CL.projectActions.projectTypes(m.type).map((x) => [x, x])] }, onMeta),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Customer'), h('span', { class: 'ctl' },
          h('select', { onchange: async (e) => { if (e.target.value === '__new') { const c = await formDlg('New customer', [{ key: 'name', label: 'Customer name', required: true }, { key: 'address', label: 'Address', type: 'textarea' }]); if (c) { m.customerId = (await App.repo.saveCustomer(c)).id; onMeta(true); } else e.target.value = m.customerId || ''; } else { m.customerId = e.target.value || null; onMeta(); } } },
            h('option', { value: '' }, '— none —'), h('option', { value: '__new' }, '+ New customer…'), customers.sort((a, b) => a.name.localeCompare(b.name)).map((c) => h('option', { value: c.id, selected: c.id === m.customerId || null }, c.name))))),
        f(m, 'companyId', 'Company (report branding)', { type: 'select', options: companies.map((c) => [c.id, c.name + (c.isDefault ? ' (default)' : '')]) }, onMeta),
        f(m, 'endUser', 'End user', { type: 'text' }, onMeta), f(m, 'consultant', 'Consultant', { type: 'text' }, onMeta), f(m, 'contractor', 'Contractor', { type: 'text' }, onMeta),
        f(m, 'site', 'Site', { type: 'text' }, onMeta),
        f(m, 'notes', 'Project notes', { type: 'textarea', wide: true }, onMeta)),
      h('p', { class: 'muted small' }, `Created ${fdate(o.rec.createdAt, true)} by ${o.rec.createdBy} · Modified ${fdate(o.rec.modifiedAt, true)} by ${o.rec.modifiedBy} · Project ID ${o.id}`));

    const city = cityPicker(o, climate, onData, onMeta);

    const crit = sec('Design criteria', 'Outdoor conditions and project defaults',
      h('div', { class: 'grid' },
        f(d, 'ambientDB', 'Outdoor design dry-bulb', { kind: 'temp', tip: 'ambientDB' }, onData),
        f(d, 'ambientRH', 'Coincident relative humidity', { unit: '%', tip: 'ambientRH' }, onData),
        f(d, 'altitude', 'Site altitude', { kind: 'len', tip: 'altitude' }, onData),
        f(d, 'groundTemp', 'Ground / under-floor temperature', { kind: 'temp', tip: 'groundTemp' }, onData),
        f(d, 'safetyFactor', 'Default safety factor (new rooms)', { unit: '%', tip: 'safetyFactor' }, onData),
        f(d, 'refrigerant', 'Refrigerant / system', { type: 'select', options: D.refrigerants.map((r) => [r, r]) }, onData),
        f(d, 'heatLossCredit', 'Heat loss to colder surroundings', { type: 'select', tip: 'heatLossCredit', options: [['credit', 'Credit (reduces load) — default'], ['none', 'No credit (conservative)']] }, onData)),
      h('p', { class: 'muted small' }, 'Weather basis: ', h('b', {}, d.climateSource || 'entered by user (no city selected)')),
      String(d.refrigerant).startsWith('R717') ? h('div', { class: 'note-box' }, icon('info'), ' Ammonia system: machinery room design to ANSI/IIAR 2 (edition in force). Use Step 2 → Machinery room for ventilation rates.') : null);

    return h('div', { class: 'stage' }, info, city, crit,
      h('div', { class: 'stepnav' }, h('span'), btn('Continue to Detailed Design', () => App.go(`project/${o.id}/design`), { kind: 'primary', icon: 'chevron' })));
  }

  function cityPicker(o, climate, onData, onMeta) {
    const d = o.data.design;
    const st = App.ui.city = App.ui.city || {};
    const cur = climate.find((c) => c.id === d.climateId);
    if (cur && !st.touched) Object.assign(st, { region: cur.region, country: cur.country, state: cur.state });
    const regions = CL.climate.REGIONS;
    const col = (title, items, selected, onPick) => h('div', { class: 'cp-col' }, h('div', { class: 'cp-h' }, title),
      h('div', { class: 'cp-list', role: 'listbox', 'aria-label': title }, items.length ? items.map((it) => h('button', { type: 'button', role: 'option', class: 'cp-it' + (it === selected ? ' sel' : ''), 'aria-selected': it === selected ? 'true' : 'false', onclick: () => onPick(it) }, it)) : h('span', { class: 'muted small pad' }, '—')));
    const box = h('div');
    const basisSel = { basis: st.basis || '04' };
    function draw() {
      const countries = [...new Set(climate.filter((c) => c.region === st.region).map((c) => c.country))].sort();
      const states = [...new Set(climate.filter((c) => c.region === st.region && c.country === st.country).map((c) => c.state))].sort();
      const cities = climate.filter((c) => c.region === st.region && c.country === st.country && (states.length <= 1 || c.state === st.state)).sort((a, b) => a.city.localeCompare(b.city));
      const selCity = climate.find((c) => c.id === d.climateId);
      box.replaceChildren(
        h('div', { class: 'cpicker' },
          col('Region', regions, st.region, (v) => { Object.assign(st, { region: v, country: null, state: null, touched: true }); draw(); }),
          col('Country', countries, st.country, (v) => { Object.assign(st, { country: v, state: null, touched: true }); const ss = [...new Set(climate.filter((c) => c.country === v).map((c) => c.state))]; if (ss.length === 1) st.state = ss[0]; draw(); }),
          col('State / province', states.length > 1 ? states : states.filter((s) => s !== '—'), st.state, (v) => { st.state = v; st.touched = true; draw(); }),
          col('City', cities.map((c) => c.city), selCity && selCity.region === st.region && selCity.country === st.country ? selCity.city : null, (v) => apply(cities.find((c) => c.city === v)))),
        selCity ? cityCard(selCity) : h('p', { class: 'muted small' }, 'Select a city to fill the outdoor design conditions, or enter them directly under Design criteria.'));
    }
    function cityCard(c) {
      const has = c.db04 !== '' && c.db04 != null;
      return h('div', { class: 'citycard' },
        h('div', {}, h('b', {}, `${c.city}, ${c.country}`), h('small', { class: 'muted' }, ` ${c.state !== '—' ? c.state + ' · ' : ''}${fmt(c.lat, 2)}°, ${fmt(c.lon, 2)}° · elevation ${fmt(c.elevation, 0)} m`), h('span', { class: 'chip ' + (c.status === 'seed' ? 'st-draft' : 'st-approved') + ' sm' }, c.status === 'seed' ? 'seed data — verify' : c.status)),
        has ? h('div', { class: 'cc-vals' },
          h('span', {}, `0.4 %: ${fmt(c.db04, 1)} °C DB / ${fmt(c.mcwb04, 1)} °C MCWB`), c.db1 !== '' ? h('span', {}, `1 %: ${fmt(c.db1, 1)} °C DB / ${fmt(c.mcwb1, 1)} °C MCWB`) : null,
          h('span', { class: 'muted small' }, `Source: ${c.source || 'user-entered'} ${c.edition || ''}`),
          h('label', { class: 'field inline' }, h('span', { class: 'lbl' }, 'Design basis'), h('select', { onchange: (e) => { st.basis = e.target.value; apply(c); } }, [['04', '0.4 % annual'], ['1', '1 % annual']].map(([v, l]) => h('option', { value: v, selected: (st.basis || '04') === v || null, disabled: v === '1' && c.db1 === '' ? true : null }, l)))))
          : h('div', { class: 'warn-box' }, icon('alert'), ' Design temperatures for this city are not in the library yet. Enter them once from your ASHRAE climatic data (they are then reused on every project):',
            h('div', { class: 'grid tight' }, ...cityFields(c)),
            btn('Save to city library and apply', async () => { if (!(c.db04 !== '' && c.mcwb04 !== '')) { toast('Enter at least the 0.4 % DB and MCWB.', 'warn'); return; } c.status = 'user-entered'; const saved = await App.repo.saveClimate(c); climate.splice(climate.findIndex((x) => x.id === c.id), 1, saved); apply(saved); toast('City saved to library'); }, { kind: 'primary', small: true, icon: 'save' })));
    }
    function cityFields(c) {
      return [['db04', '0.4 % DB [°C]'], ['mcwb04', '0.4 % MCWB [°C]'], ['db1', '1 % DB [°C]'], ['mcwb1', '1 % MCWB [°C]'], ['source', 'Source (e.g. ASHRAE HoF)', 'text'], ['edition', 'Edition / year', 'text']]
        .map(([k, l, t]) => field(c, k, l, { type: t || 'number' }));
    }
    function apply(c) {
      if (!c) return;
      d.climateId = c.id;
      o.meta.city = c.city; o.meta.country = c.country;
      App.pendingMeta = o.meta;
      if (c.elevation !== '' && c.elevation != null) d.altitude = +c.elevation;
      const b = st.basis === '1' && c.db1 !== '' ? '1' : '04';
      const db = b === '1' ? c.db1 : c.db04, wb = b === '1' ? c.mcwb1 : c.mcwb04;
      if (db !== '' && db != null) {
        d.ambientDB = +db;
        if (wb !== '' && wb != null) d.ambientRH = +CL.climate.rhFromWB(+db, +wb, root.Psychro.pressure(+d.altitude || 0), root.Psychro).toFixed(1);
        d.climateSource = `${c.city}, ${c.country} — ${b === '1' ? '1 %' : '0.4 %'} DB ${fmt(+db, 1)} °C / MCWB ${fmt(+wb, 1)} °C (${c.source || 'city library, user-entered'} ${c.edition || ''})`.trim();
        toast(`Design conditions set from ${c.city}`, 'ok', 2500);
      } else {
        d.climateSource = `${c.city}, ${c.country} — design temperatures entered manually`;
      }
      App.changed(true);
    }
    draw();
    return sec('City selection', 'Region → Country → State → City', box);
  }

  /* ---------------- ③ Review & Report ---------------- */
  const RTABS = [['validation', 'Validation', 'alert'], ['results', 'Results', 'chart'], ['assumptions', 'Assumptions', 'list'], ['review', 'Revisions & review', 'layers'], ['output', 'Report & export', 'print'], ['attachments', 'Attachments', 'clip']];

  async function renderReport(o, tab, msgs, revs) {
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, RTABS.map(([k, l, ic]) => h('a', { href: `#/project/${o.id}/report/${k}`, role: 'tab', class: 'tab' + (tab === k ? ' active' : ''), 'aria-selected': tab === k ? 'true' : 'false' }, icon(ic, 15), l,
      k === 'validation' && CL.validate.count(msgs).error ? h('span', { class: 'badge err sm' }, CL.validate.count(msgs).error) : null)));
    const body = { validation: () => validationTab(o, msgs), results: () => resultsTab(o), assumptions: () => assumptionsTab(o), review: () => reviewTab(o, revs), output: () => outputTab(o, revs), attachments: () => attachTab(o) }[tab] || (() => resultsTab(o));
    return h('div', { class: 'stage' }, tabs, await body());
  }

  function validationTab(o, msgs) {
    const lv = [['error', 'Errors', 'error', 'Calculation cannot be relied on until resolved.'], ['warning', 'Warnings', 'alert', 'Calculation proceeds; review these inputs.'], ['info', 'Information', 'info', 'Engineering guidance.']];
    const link = (m) => {
      if (m.roomId) return `project/${o.id}/design/room/${m.roomId}/${m.tab || 'general'}`;
      if (m.mr != null) return `project/${o.id}/design/machinery/${m.mr}`;
      if (m.tunnel != null) return `project/${o.id}/design/tunnel/${m.tunnel}`;
      return `project/${o.id}/details`;
    };
    return h('div', {}, lv.map(([k, l, ic, sub]) => {
      const list = msgs.filter((m) => m.level === k);
      return h('section', { class: 'card vsec ' + k }, h('div', { class: 'card-h' }, h('h3', {}, icon(ic), ` ${l} (${list.length})`), h('small', { class: 'muted' }, sub)),
        list.length ? h('div', { class: 'list' }, list.map((m) => h('button', { class: 'lrow vrow', onclick: () => App.go(link(m)) }, h('span', { class: 'code mono' }, m.code), h('span', { class: 'lmain' }, h('b', {}, m.room || 'Project'), h('small', {}, m.msg)), icon('chevron')))) : h('p', { class: 'muted' }, 'None.'));
    }), h('p', { class: 'muted small' }, 'Validation never changes your inputs. Where the calculation engine would limit a value (e.g. run time > 24 h), the error states the value the engine would use.'));
  }

  function resultsTab(o) {
    const pr = CL.plant(o.data);
    const keys = pr.rooms.length ? pr.rooms[0].res.breakdown.map((b) => [b.key, b.label]) : [];
    const tot = (k) => pr.rooms.reduce((a, { res }) => a + res.breakdown.find((b) => b.key === k).kWh, 0);
    const sub = pr.rooms.reduce((a, x) => a + x.res.subtotal, 0);
    const allowance = pr.rooms.reduce((a, x) => a + x.res.safetyKWh, 0);
    const maxK = Math.max(1, ...keys.map(([k]) => tot(k)));
    const mr = (o.data.machinery || []).map((m) => ({ m, r: V.calcMachineryRoom(m) }));
    return h('div', {},
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi hero' }, h('span', { class: 'kpi-l' }, 'Final design refrigeration load'), h('b', {}, pw(pr.totalKW)), h('small', {}, `${fmt(pr.totalKW, 1)} kW · ${fmt(pr.totalKW / 3.51685, 1)} TR · ${fmt(pr.totalKW * 3412.14, 0)} Btu/h`)),
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-l' }, 'Calculated load (Σ)'), h('b', {}, `${fmt(sub, 0)} kWh/day`), h('small', {}, `${pr.rooms.length} room(s)${pr.tunnels.length ? ` + ${pr.tunnels.length} tunnel(s) at ${fmt(pr.tunnelKW, 1)} kW` : ''}`)),
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-l' }, 'Safety / design allowance'), h('b', {}, `${fmt(allowance, 0)} kWh/day`), h('small', {}, sub ? `${fmt(allowance / sub * 100, 1)} % of Σ` : '')),
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-l' }, 'Suction levels'), h('b', {}, pr.levels.length), h('small', {}, pr.levels.map((l) => `${fmt(l.sst, 0)} °C`).join(' · ')))),
      h('div', { class: 'grid2' },
        h('section', { class: 'card' }, h('h3', {}, 'Load contribution (all rooms)'),
          h('div', { class: 'hbars' }, keys.filter(([k]) => tot(k) > 0.05).map(([k, l]) => h('div', { class: 'hbar' }, h('span', { class: 'hb-l' }, l), h('span', { class: 'hb-t' }, h('span', { class: 'hb-f c-' + k, style: { width: `${Math.max(1, tot(k) / maxK * 100)}%` } })), h('span', { class: 'hb-v' }, `${fmt(tot(k) / sub * 100, 1)} %`))))),
        h('section', { class: 'card' }, h('h3', {}, 'Compressor load per suction level'),
          h('div', { class: 'tablewrap' }, h('table', { class: 'rtable' }, h('thead', {}, h('tr', {}, h('th', {}, 'SST'), h('th', {}, 'Rooms / tunnels'), h('th', { class: 'num' }, U.pwLabel()))),
            h('tbody', {}, pr.levels.map((l) => h('tr', {}, h('td', {}, `${fmt(l.sst, 0)} °C`), h('td', {}, l.rooms.join(', ')), h('td', { class: 'num strong' }, fmt(U.pw(l.kW), U.pwDigits()))))))),
          h('p', { class: 'muted small' }, 'Add suction-line heat gain, liquid-pump heat and diversity as appropriate when sizing compressors.'))),
      h('section', { class: 'card' }, h('h3', {}, 'Load summary [kWh/day]'), h('div', { class: 'tablewrap' }, h('table', { class: 'rtable' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Component'), pr.rooms.map(({ room }) => h('th', { class: 'num' }, h('a', { href: `#/project/${o.id}/design/room/${room.id}/results` }, room.name))), h('th', { class: 'num' }, 'Total'), h('th', { class: 'num' }, 'Share'))),
        h('tbody', {}, keys.map(([k, l]) => h('tr', {}, h('td', {}, l), pr.rooms.map(({ res }) => h('td', { class: 'num' }, fmt(res.breakdown.find((b) => b.key === k).kWh, 0))), h('td', { class: 'num strong' }, fmt(tot(k), 0)), h('td', { class: 'num' }, sub ? `${fmt(tot(k) / sub * 100, 1)} %` : '–')))),
        h('tfoot', {},
          h('tr', {}, h('td', {}, 'Total calculated load'), pr.rooms.map(({ res }) => h('td', { class: 'num' }, fmt(res.subtotal, 0))), h('td', { class: 'num' }, fmt(sub, 0)), h('td')),
          h('tr', {}, h('td', {}, 'Safety / design allowance'), pr.rooms.map(({ res }) => h('td', { class: 'num' }, `${fmt(res.safetyKWh, 0)} (${fmt(res.safety, 0)} %)`)), h('td', { class: 'num' }, fmt(allowance, 0)), h('td')),
          h('tr', {}, h('td', {}, 'Run time [h/day]'), pr.rooms.map(({ res }) => h('td', { class: 'num' }, fmt(res.runHours, 0))), h('td'), h('td')),
          h('tr', { class: 'grand' }, h('td', {}, `Final design load [${U.pwLabel()}]`), pr.rooms.map(({ res }) => h('td', { class: 'num' }, fmt(U.pw(res.capacity), U.pwDigits()))), h('td', { class: 'num' }, fmt(U.pw(pr.roomsKW), U.pwDigits())), h('td')))))),
      pr.tunnels.length ? h('section', { class: 'card' }, h('h3', {}, 'Tunnel / blast freezers'), h('div', { class: 'tablewrap' }, h('table', { class: 'rtable' },
        h('thead', {}, h('tr', {}, ['Tunnel', 'Product', 'Air [°C]', 'Freezing time [h]', 'Product flow [kg/h]', 'q [kJ/kg]', 'SST [°C]', `Capacity [${U.pwLabel()}]`].map((t, i) => h('th', { class: i > 1 ? 'num' : '' }, t)))),
        h('tbody', {}, pr.tunnels.map(({ tunnel: t, res: r }, i) => h('tr', {}, h('td', {}, h('a', { href: `#/project/${o.id}/design/tunnel/${i}` }, t.name)), h('td', {}, r.props.name), h('td', { class: 'num' }, fmt(+t.Tm, 1)),
          h('td', { class: 'num' }, `${fmt(r.tFreeze, 1)} (${t.timeBasis})`), h('td', { class: 'num' }, fmt(r.mdot, 0)), h('td', { class: 'num' }, fmt(r.q, 1)), h('td', { class: 'num' }, fmt(r.sst, 0)), h('td', { class: 'num strong' }, fmt(U.pw(r.capacity), U.pwDigits())))))))) : null,
      mr.length ? h('section', { class: 'card' }, h('h3', {}, 'Machinery room ventilation'), h('div', { class: 'tablewrap' }, h('table', { class: 'rtable' }, h('thead', {}, h('tr', {}, ['Room', 'Code', 'Normal', 'Continuous', 'Emergency', 'Heat'].map((t, i) => h('th', { class: i > 1 ? 'num' : '' }, t)))),
        h('tbody', {}, mr.map(({ m, r }) => h('tr', {}, h('td', {}, m.name), h('td', {}, r.codeName), ...['normal', 'continuous', 'emergency'].map((k) => h('td', { class: 'num' }, `${fmt(U.toDisplay('flow', r[k].design.m3h), 0)} ${U.label('flow')}`)), h('td', { class: 'num' }, `${fmt(r.heatKW, 1)} kW`))))))) : null);
  }

  function assumptionsTab(o) {
    const list = CL.explain.assumptions(o.data, D, root.HLModel);
    const kinds = { default: ['Default', 'st-draft'], database: ['Database', 'st-in-progress'], user: ['User-selected', 'st-under-review'], override: ['Overridden', 'st-issued'], note: ['Engineering note', 'st-approved'] };
    o.data.assumptions = o.data.assumptions || [];
    return h('div', {},
      h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', {}, 'Engineering assumptions register'), btn('Add engineering note', async () => {
        const v = await formDlg('Engineering note / assumption', [{ key: 'scope', label: 'Scope (project or room)', value: 'Project' }, { key: 'item', label: 'Assumption', required: true }, { key: 'value', label: 'Value / statement', type: 'textarea', required: true }, { key: 'basis', label: 'Basis / source' }]);
        if (!v) return; o.data.assumptions.push(v); App.changed(true);
      }, { icon: 'plus', small: true })),
      h('p', { class: 'muted small' }, 'Generated from the inputs: defaults, database values, user selections and overrides. Engineering notes you add are stored with the calculation and printed in the report.'),
      h('div', { class: 'tablewrap' }, h('table', { class: 'rtable' }, h('thead', {}, h('tr', {}, ['Scope', 'Item', 'Value', 'Type', 'Basis', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, list.map((a) => { const ni = a.kind === 'note' ? o.data.assumptions.findIndex((x) => x.item === a.item && x.value === a.value) : -1; return h('tr', {}, h('td', {}, a.scope), h('td', {}, a.item), h('td', {}, a.value), h('td', {}, h('span', { class: 'chip sm ' + (kinds[a.kind] || [])[1] }, (kinds[a.kind] || [a.kind])[0])), h('td', { class: 'muted' }, a.basis), h('td', {}, ni >= 0 ? btn('', () => { o.data.assumptions.splice(ni, 1); App.changed(true); }, { small: true, icon: 'trash', kind: 'ghost-danger', title: 'Remove note' }) : null)); }))))));
  }

  async function reviewTab(o, revs) {
    const last = revs[revs.length - 1];
    const review = last ? JSON.parse(JSON.stringify(last.review)) : null;
    const reviewStatuses = ['Draft', 'Under Review', 'Checked', 'Approved', 'Issued'];
    return h('div', {},
      h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', {}, 'Revisions'), btn('Save new revision', () => CL.projectActions.saveRevision(), { icon: 'layers', kind: 'primary', small: true })),
        revs.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'rtable' }, h('thead', {}, h('tr', {}, ['Rev', 'Date', 'By', 'Description', 'Status', 'Engine', `Load [${U.pwLabel()}]`, ''].map((t, i) => h('th', { class: i === 6 ? 'num' : '' }, t)))),
          h('tbody', {}, [...revs].reverse().map((r) => h('tr', {}, h('td', { class: 'mono strong' }, r.rev, r.locked ? icon('lock', 12) : null), h('td', {}, fdate(r.createdAt, true)), h('td', {}, r.createdBy), h('td', {}, r.description), h('td', {}, CL.viewsMain.statusChip(r.review.status)), h('td', { class: 'mono' }, r.engineVersion),
            h('td', { class: 'num' }, r.results && Number.isFinite(r.results.totalKW) ? fmt(U.pw(r.results.totalKW), U.pwDigits()) : '–'),
            h('td', { class: 'acts' }, btn('', () => CL.projectActions.print(r), { small: true, icon: 'print', title: `Print report of Rev ${r.rev}` }), btn('', () => CL.projectActions.exportXlsx(r), { small: true, icon: 'grid', title: `Excel of Rev ${r.rev}` }),
              btn('Restore', async () => {
                if (!(await confirmDlg(`Restore Rev ${r.rev}`, `Replace the working copy with revision ${r.rev}? All revisions are kept. ${o.dirty ? 'Your unsaved changes will be lost.' : ''}`, { ok: 'Restore as working copy', danger: o.dirty }))) return;
                o.rec = await App.repo.restoreRevision(o.id, r.id); o.data = JSON.parse(JSON.stringify(o.rec.working.data)); o.dirty = false; o.undo = []; o.redo = []; o.last = null; App.cache.projects = null;
                toast(`Working copy restored from Rev ${r.rev}`); App.updateBar(); App.redrawProject();
              }, { small: true, icon: 'restore' }))))))) : h('p', { class: 'muted' }, 'No revisions yet. “Save new revision” freezes the current inputs and results as Rev 00.')),
      last ? h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', {}, `Engineering review — Rev ${last.rev}`), last.locked ? h('span', { class: 'chip st-locked' }, icon('lock', 12), `${last.review.status} — locked`) : null),
        h('div', { class: 'review' }, ['prepared', 'checked', 'approved'].map((k) => h('div', { class: 'rv' }, h('h4', {}, k[0].toUpperCase() + k.slice(1) + ' by'),
          field(review[k], 'name', 'Name', { type: 'text', readonly: last.locked }), field(review[k], 'date', 'Date', { type: 'date', readonly: last.locked })))),
        h('div', { class: 'grid' }, field(review, 'status', 'Review status', { type: 'select', options: reviewStatuses.map((s) => [s, s]), readonly: last.locked, hint: 'Approved or Issued locks the revision.' })),
        last.locked ? null : btn('Save review', async () => {
          if (['Approved', 'Issued'].includes(review.status)) {
            const errs = CL.validate.count(CL.validate.validateProject(last.data, C, D, V)).error;
            if (errs && !(await confirmDlg('Validation errors', `Rev ${last.rev} has ${errs} validation error(s). Setting it to ${review.status} is not recommended. Continue?`, { ok: `Set ${review.status}`, danger: true }))) return;
            if (!(await confirmDlg('Lock revision', `${review.status} locks Rev ${last.rev}; later changes need a new revision. Continue?`, { ok: 'Lock revision' }))) return;
          }
          try { await App.repo.updateReview(last.id, review); toast('Review saved'); App.redrawProject(); } catch (e) { toast(e.message, 'err'); }
        }, { kind: 'primary', icon: 'save' }),
        h('p', { class: 'muted small' }, 'Internal engineering review only. An internal approval status does not imply approval by any authority having jurisdiction.')) : null);
  }

  async function outputTab(o, revs) {
    const pick = { rev: revs.length ? revs[revs.length - 1].id : '' };
    const revOf = () => revs.find((r) => r.id === pick.rev) || null;
    const preview = h('div', { class: 'rep-preview' });
    const drawPreview = async () => { const ctx = await CL.projectActions.ctxFor(o, revOf()); preview.innerHTML = CL.report.buildReport(ctx); };
    const out = h('div', {},
      h('section', { class: 'card' }, h('h3', {}, 'Generate report and exports'),
        h('div', { class: 'grid' }, h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Source'), h('select', { onchange: (e) => { pick.rev = e.target.value; drawPreview(); } },
          h('option', { value: '' }, 'Working copy (not a revision)'), [...revs].reverse().map((r) => h('option', { value: r.id, selected: r.id === pick.rev || null }, `Rev ${r.rev} — ${r.review.status} — ${fdate(r.createdAt)}`))))),
        h('div', { class: 'outgrid' },
          root.desktop
            ? outCard('PDF engineering report', 'Saves an A4 PDF directly (cover, contents, page numbers, traceability) and offers to open it.', 'print', () => CL.projectActions.exportPdf(revOf()))
            : outCard('PDF engineering report', 'Opens the print dialog — choose “Save as PDF” or a printer. Includes cover, contents, page numbers and traceability.', 'print', () => CL.projectActions.print(revOf())),
          root.desktop ? outCard('Print', 'Send the report to a printer.', 'print', () => CL.projectActions.print(revOf())) : null,
          outCard('Excel workbook (.xlsx)', 'Project, load summary, transmission, product, infiltration, ventilation, assumptions, validation and input data sheets.', 'grid', () => CL.projectActions.exportXlsx(revOf())),
          outCard('CSV load data (.csv)', 'Structured component loads per room for spreadsheets or databases.', 'list', () => CL.projectActions.exportCsv(revOf())),
          outCard('Project package (.json)', 'The project with all revisions and attachments, for transfer to another computer.', 'file', () => CL.projectActions.exportPackage())),
        h('p', { class: 'muted small' }, root.desktop ? 'Files are saved where you choose; “Open” starts the default application for the file type (PDF viewer, Excel…). ColdLoad Pro has no other integration with those applications.' : 'Files are saved to the folder you choose (or your Downloads folder). Your computer opens them with the default application for the file type — PDF viewer, Excel, etc. ColdLoad Pro has no direct integration with other applications.')),
      h('section', { class: 'card' }, h('h3', {}, 'Report preview'), preview));
    await drawPreview();
    return out;
  }
  const outCard = (t, x, ic, run) => h('button', { class: 'outcard', onclick: run }, icon(ic, 22), h('b', {}, t), h('small', {}, x));

  async function attachTab(o) {
    const list = await App.repo.listAttachments(o.id);
    const human = (n) => (n > 1048576 ? `${fmt(n / 1048576, 1)} MB` : `${fmt(n / 1024, 0)} kB`);
    return h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', {}, `Attachments (${list.length})`), btn('Add file', async () => {
      const f = await readFile('*/*'); if (!f) return;
      try { await App.repo.addAttachment(o.id, { name: f.name, mime: f.type, size: f.size, dataUrl: await fileToDataUrl(f) }); toast('File attached'); App.redrawProject(); } catch (e) { toast(e.message, 'err'); }
    }, { icon: 'clip', kind: 'primary', small: true })),
    h('p', { class: 'muted small' }, 'Drawings, data sheets, customer correspondence. Stored with the project (max 15 MB each) and included in project packages and backups.'),
    list.length ? h('table', { class: 'rtable' }, h('thead', {}, h('tr', {}, ['File', 'Size', 'Added', 'By', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, list.map((a) => h('tr', {}, h('td', {}, a.name), h('td', {}, human(a.size)), h('td', {}, fdate(a.addedAt, true)), h('td', {}, a.addedBy),
        h('td', { class: 'acts' }, btn('Open / save', async () => { const b = await (await fetch(a.dataUrl)).blob(); await saveFile(a.name, b, a.mime); }, { small: true, icon: 'backup' }),
          btn('', async () => { if (await confirmDlg('Remove attachment', `Remove “${a.name}” from this project?`, { ok: 'Remove', danger: true })) { await App.repo.removeAttachment(a.id); App.redrawProject(); } }, { small: true, icon: 'trash', kind: 'ghost-danger', title: 'Remove' })))))) : h('p', { class: 'muted' }, 'No attachments.'));
  }
})(globalThis);
