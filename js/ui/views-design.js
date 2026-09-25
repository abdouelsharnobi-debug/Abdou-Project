/* Step ② Detailed Design: room list, room editor (all v1 inputs), live results, machinery rooms. */
(function (root) {
  'use strict';
  const CL = root.CL, App = CL.App;
  const { h, icon, btn, toast, modal, confirmDlg, formDlg, fmt, field } = CL.ui;
  const U = CL.units, D = root.HLData, C = root.HLCalc, M = root.HLModel, V = root.HLVent, T = CL.venttpl;
  const pw = (kW) => `${fmt(U.pw(kW), U.pwDigits())} ${U.pwLabel()}`;
  const sect = (...a) => CL.sect(...a);
  const grid = (...k) => h('div', { class: 'grid' }, ...k);
  const kv = (k, v) => h('div', { class: 'kv' }, h('span', {}, k), v);
  const COLORS = ['transmission', 'product', 'packaging', 'respiration', 'infiltration', 'ventilation', 'people', 'lights', 'forklifts', 'other', 'fans', 'defrost'];

  const TABS = [['general', 'Room & criteria'], ['transmission', 'Envelope'], ['product', 'Product'], ['infiltration', 'Infiltration'], ['internal', 'Internal & equipment'], ['results', 'Calculation & results']];

  /** Output bound to a path of the room result, or a function(res). */
  function out(path, d = 1, kind, suffix) {
    return h('span', { class: 'out', 'data-out': path, 'data-fmt': d, 'data-kind': kind || '', 'data-suffix': suffix || '' });
  }
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

  const ch = (rerender) => App.changed(rerender);
  const F = (obj, key, label, opt = {}) => field(obj, key, label, opt, ch);
  const cell = (obj, key, opt) => { const f = F(obj, key, '', opt); f.classList.add('incell'); return f; };

  async function render(o, rest) {
    const data = o.data;
    let [mode, id, tab] = rest;
    if (!mode) { mode = data.rooms.length ? 'room' : (data.machinery || []).length ? 'machinery' : 'none'; id = mode === 'room' ? data.rooms[0].id : '0'; }
    const room = mode === 'room' ? data.rooms.find((r) => r.id === id) || data.rooms[0] : null;
    if (mode === 'room' && !room) mode = 'none';
    tab = tab || App.ui.roomTab || 'general';
    if (mode === 'room') App.ui.roomTab = tab;
    const mi = mode === 'machinery' ? Math.min(+id || 0, (data.machinery || []).length - 1) : -1;
    const ti = mode === 'tunnel' ? Math.min(+id || 0, (data.tunnels || []).length - 1) : -1;

    const list = roomList(o, mode === 'room' && room ? room.id : null, mi, ti);
    let main, live = null;
    if (mode === 'room' && room) {
      const tabs = h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([k, l], i) => h('a', { role: 'tab', href: `#/project/${o.id}/design/room/${room.id}/${k}`, class: 'tab' + (tab === k ? ' active' : ''), 'aria-selected': tab === k ? 'true' : 'false', 'data-tab': k }, h('span', { class: 'tn' }, i + 1), l, h('span', { class: 'tdot' }))));
      const body = { general: tabGeneral, transmission: tabTransmission, product: tabProduct, infiltration: tabInfiltration, internal: tabInternal, results: tabResults }[tab] || tabGeneral;
      const idx = TABS.findIndex(([k]) => k === tab);
      main = h('div', { class: 'editor', 'data-room': room.id },
        h('div', { class: 'ed-head' }, h('h2', {}, room.name), h('div', {},
          btn('Duplicate', () => duplicateRoom(o, room), { small: true, icon: 'copy' }),
          btn('Delete', () => deleteRoom(o, room), { small: true, icon: 'trash', kind: 'ghost-danger' }))),
        tabs, h('div', { class: 'msgstrip', id: 'msgstrip' }), body(room, o),
        h('div', { class: 'stepnav' },
          idx > 0 ? btn('← ' + TABS[idx - 1][1], () => App.go(`project/${o.id}/design/room/${room.id}/${TABS[idx - 1][0]}`)) : h('span'),
          idx < TABS.length - 1 ? btn(TABS[idx + 1][1] + ' →', () => App.go(`project/${o.id}/design/room/${room.id}/${TABS[idx + 1][0]}`), { kind: 'primary' }) : btn('Continue to Review & Report →', () => App.go(`project/${o.id}/report/results`), { kind: 'primary' })));
      live = h('aside', { class: 'live', id: 'live' });
    } else if (mode === 'tunnel' && ti >= 0) {
      main = tunnelEditor(o, ti);
      live = h('aside', { class: 'live', id: 'live' });
    } else if (mode === 'machinery' && mi >= 0) {
      main = await machineryEditor(o, mi);
      live = h('aside', { class: 'live', id: 'live' });
    } else {
      main = h('div', { class: 'editor empty' }, h('p', {}, 'No rooms yet. Add the first refrigerated room, a tunnel / blast freezer or a machinery room.'),
        h('div', { class: 'qa' }, Object.entries(D.roomTypes).map(([k, t]) => btn(t.name, () => addRoom(o, k), { icon: 'plus' })), btn('Tunnel / blast freezer', () => addTunnel(o), { icon: 'snow' })));
    }
    const wrap = h('div', { class: 'design' }, list, main, live);
    setTimeout(() => refresh(o), 0);
    return wrap;
  }

  function roomList(o, roomId, mi, ti) {
    const data = o.data;
    let pr; try { pr = CL.plant(data); } catch (e) { pr = { rooms: [], tunnels: [] }; }
    const addMenu = App.menu(h('span', { class: 'barlbl' }, icon('plus'), h('span', {}, 'Add room'), icon('down', 12)),
      Object.entries(D.roomTypes).map(([k, t]) => ({ label: t.name, run: () => addRoom(o, k) })), { btnClass: 'btn secondary sm' });
    return h('aside', { class: 'roomlist' },
      h('div', { class: 'rl-h' }, h('h4', {}, `Rooms (${data.rooms.length})`), addMenu),
      h('div', { class: 'rl' }, data.rooms.map((r, i) => {
        const res = pr.rooms[i] && pr.rooms[i].res;
        return h('a', { href: `#/project/${o.id}/design/room/${r.id}/${App.ui.roomTab || 'general'}`, class: 'rl-it' + (r.id === roomId ? ' active' : ''), 'data-rid': r.id },
          h('span', { class: 'tchip ' + (+r.cond.T < 0 ? 'cold' : 'cool') }, `${fmt(U.toDisplay('temp', +r.cond.T), 0)}°`),
          h('span', { class: 'rl-n' }, r.name), h('span', { class: 'rl-k', 'data-rkw': r.id }, res ? fmt(U.pw(res.capacity), U.pwDigits()) : '–'),
          h('span', { class: 'rl-mv' }, i > 0 ? h('button', { class: 'iconbtn xs', title: 'Move up', 'aria-label': 'Move up', onclick: (e) => { e.preventDefault(); move(o, i, -1); } }, '▲') : null));
      })),
      h('div', { class: 'rl-h' }, h('h4', {}, `Tunnel / blast freezers (${(data.tunnels || []).length})`), btn('', () => addTunnel(o), { small: true, icon: 'plus', title: 'Add tunnel / blast freezer' })),
      h('div', { class: 'rl' }, (data.tunnels || []).map((t, i) => {
        const tr = (pr.tunnels || [])[i];
        return h('a', { href: `#/project/${o.id}/design/tunnel/${i}`, class: 'rl-it' + (i === ti ? ' active' : '') },
          h('span', { class: 'tchip tn' }, icon('snow', 13)), h('span', { class: 'rl-n' }, t.name), h('span', { class: 'rl-k', 'data-tkw': i }, tr && Number.isFinite(tr.res.capacity) ? fmt(U.pw(tr.res.capacity), U.pwDigits()) : '–'));
      })),
      h('div', { class: 'rl-h' }, h('h4', {}, `Machinery rooms (${(data.machinery || []).length})`), btn('', () => addMachinery(o), { small: true, icon: 'plus', title: 'Add machinery room' })),
      h('div', { class: 'rl' }, (data.machinery || []).map((m, i) => h('a', { href: `#/project/${o.id}/design/machinery/${i}`, class: 'rl-it' + (i === mi ? ' active' : '') },
        h('span', { class: 'tchip mr' }, icon('fan', 13)), h('span', { class: 'rl-n' }, m.name), m.tpl ? h('span', { class: 'rl-k', title: 'Linked to common standard' }, icon('layers', 12)) : null))),
      h('p', { class: 'rl-total' }, 'Plant total ', h('b', { id: 'rl-total' }, pr.totalKW != null ? pw(pr.totalKW) : '–')));
  }

  async function addRoom(o, type) {
    const r = M.newRoom(type, `${(D.roomTypes[type].name || 'Room').split(' (')[0]} ${o.data.rooms.length + 1}`);
    r.safety = o.data.design.safetyFactor;
    o.data.rooms.push(r); App.changed();
    App.go(`project/${o.id}/design/room/${r.id}/general`);
  }
  function duplicateRoom(o, r) {
    const c = JSON.parse(JSON.stringify(r)); c.id = M.uid(); c.name = `${r.name} (copy)`;
    o.data.rooms.splice(o.data.rooms.indexOf(r) + 1, 0, c); App.changed();
    App.go(`project/${o.id}/design/room/${c.id}/general`);
  }
  async function deleteRoom(o, r) {
    if (!(await confirmDlg('Delete room', `Delete “${r.name}” and all its inputs? You can undo this (Ctrl+Z) until you leave the project.`, { ok: 'Delete room', danger: true }))) return;
    o.data.rooms.splice(o.data.rooms.indexOf(r), 1); App.changed();
    App.go(`project/${o.id}/design`);
  }
  function move(o, i, d) { const a = o.data.rooms; [a[i + d], a[i]] = [a[i], a[i + d]]; App.changed(true); }
  function addTunnel(o) {
    o.data.tunnels = o.data.tunnels || [];
    const t = root.HLFreeze.newTunnel(`Blast freezer BF-${String(o.data.tunnels.length + 1).padStart(2, '0')}`);
    t.groundT = o.data.design.groundTemp;
    o.data.tunnels.push(t); App.changed();
    App.go(`project/${o.id}/design/tunnel/${o.data.tunnels.length - 1}`);
  }
  function addMachinery(o) {
    o.data.machinery = o.data.machinery || [];
    const m = V.newMachineryRoom(); m.name = `Machinery room ${o.data.machinery.length + 1}`;
    o.data.machinery.push(m); App.changed();
    App.go(`project/${o.id}/design/machinery/${o.data.machinery.length - 1}`);
  }

  /* ---------------- room tabs ---------------- */
  function tabGeneral(r, o) {
    return h('div', {},
      sect('Room identification', null, grid(
        F(r, 'name', 'Room name / tag', { type: 'text', wide: true, onSet: () => { const e = document.querySelector('.ed-head h2'); if (e) e.textContent = r.name; const l = document.querySelector(`[data-rid="${r.id}"] .rl-n`); if (l) l.textContent = r.name; } }),
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Application'), h('span', { class: 'ctl' }, h('select', { onchange: async (e) => {
          const v = e.target.value, t = D.roomTypes[v];
          r.type = v;
          if (await confirmDlg('Apply typical conditions', `Apply typical ${t.name} values to this room? This sets temperature ${t.T} °C, RH ${t.RH} %, run time ${t.runHours} h, TD ${t.TD} K and typical insulation — it overwrites those inputs (undo with Ctrl+Z).`, { ok: 'Apply typical values', cancel: 'Change application only' })) {
            Object.assign(r.cond, { T: t.T, RH: t.RH }); r.runHours = t.runHours; r.TD = t.TD; r.surfaces = M.newSurfaces(t.T);
          }
          App.changed(true);
        } }, Object.entries(D.roomTypes).map(([k, v]) => h('option', { value: k, selected: r.type === k || null }, v.name))))))),
      sect('Dimensions (internal)', null, grid(
        F(r.dims, 'L', 'Length', { kind: 'len', tip: 'dims', id: 'L' }), F(r.dims, 'W', 'Width', { kind: 'len', tip: 'dims', id: 'W' }), F(r.dims, 'H', 'Height', { kind: 'len', tip: 'dims', id: 'H' }),
        h('div', { class: 'field ro' }, h('span', { class: 'lbl' }, 'Floor area · volume'), h('span', { class: 'ctl' }, h('span', {}, out('_floor', 0, 'area'), ' · ', out('volume', 0, 'vol')))))),
      sect('Room design conditions', null, grid(
        F(r.cond, 'T', 'Room design temperature', { kind: 'temp', tip: 'roomT', id: 'T' }),
        F(r.cond, 'RH', 'Relative humidity', { unit: '%', tip: 'roomRH', id: 'RH', hint: `Coil TD commonly used for this RH: ${D.recommendedTD(+r.cond.RH)} K` }),
        F(r, 'runHours', 'Compressor run time', { unit: 'h/day', tip: 'runHours', id: 'runHours' }),
        F(r, 'TD', 'Evaporator TD', { kind: 'dT', tip: 'TD', id: 'TD' }),
        F(r, 'safety', 'Safety / design allowance', { unit: '%', tip: 'safetyFactor', id: 'safety' }),
        F(r, 'sstOverride', 'Suction temperature override', { kind: 'temp', placeholder: 'auto', hint: 'Groups rooms per suction level', id: 'sstOverride' }))),
      sect('Air-cooler check (rule of thumb)', null, grid(
        F(r.evap = r.evap || { K: 25, lmtd: 7 }, 'K', 'Coil K-value', { kind: 'U', tip: 'evapK' }), F(r.evap, 'lmtd', 'LMTD (estimated)', { kind: 'dT', tip: 'evapK' })),
        h('div', { class: 'outs' }, kv('Required cooling surface', out('coilArea', 0, 'area')), kv('Room load excluding product', out('kcalM3Day', 0, '', ' kcal/m³·day')))),
      sect('Notes', null, F(r, 'notes', 'Design notes / assumptions for this room', { type: 'textarea', wide: true })));
  }

  function tabTransmission(r, o) {
    const adjOpts = [['ambient', 'Outdoor'], ['custom', 'Adjacent space'], ['ground', 'Ground / slab']];
    const insOpts = Object.entries(D.insulation).map(([k, v]) => [k, k === 'NONE' ? 'None' : `${k} — k ${v.k}`]);
    const orientOpts = [['N', 'N'], ['E', 'E'], ['S', 'S'], ['W', 'W']];
    const sunOpts = [['none', 'None / shaded'], ['light', 'Light'], ['medium', 'Medium'], ['dark', 'Dark']];
    const rows = r.surfaces.map((s, i) => h('tr', {},
      h('th', {}, s.label),
      h('td', {}, cell(s, 'adj', { type: 'select', options: adjOpts, rerender: true })),
      h('td', {}, s.adj === 'ambient' ? h('span', { class: 'muted' }, 'design DB') : cell(s, 'tAdj', { kind: 'temp', placeholder: s.adj === 'ground' ? o.data.design.groundTemp : '' })),
      h('td', {}, cell(s, 'ins', { type: 'select', options: insOpts })),
      h('td', {}, cell(s, 'thk', { kind: 'mm' })),
      h('td', {}, s.adj === 'ambient' ? (s.key === 'ceiling' ? h('span', { class: 'muted' }, 'roof') : cell(s, 'orient', { type: 'select', options: orientOpts })) : h('span', { class: 'muted' }, '–')),
      h('td', {}, s.adj === 'ambient' ? cell(s, 'sun', { type: 'select', options: sunOpts }) : h('span', { class: 'muted' }, '–')),
      h('td', { class: 'num' }, out(`transmission.items.${i}.A`, 1, 'area')),
      h('td', { class: 'num' }, out(`transmission.items.${i}.U`, 3, 'U')),
      h('td', { class: 'num' }, out(`transmission.items.${i}.dT`, 1, 'dT')),
      h('td', { class: 'num strong' }, out(`transmission.items.${i}.kW`, 2, '', ' kW'))));
    return h('div', {},
      sect('Walls, ceiling and floor', `Typical PUR/PIR panel for ${r.cond.T} °C: ${D.typicalInsulation(+r.cond.T)} mm`,
        h('p', { class: 'help' }, 'U = 1 / (1/hᵢ + L/k + 1/hₒ). The sun-effect allowance is added to the outdoor design temperature for exposed surfaces. ', CL.ui.tip('insulation'), ' ', CL.ui.tip('adjacent'), ' ', CL.ui.tip('sun')),
        h('div', { class: 'tablewrap' }, h('table', { class: 'grid-table' },
          h('thead', {}, h('tr', {}, ['Surface', 'Adjacent to', `T adj. [${U.label('temp')}]`, 'Insulation', `Thickness [${U.label('mm')}]`, 'Orient.', 'Sun / colour', `A [${U.label('area')}]`, `U [${U.label('U')}]`, `ΔT [${U.label('dT')}]`, 'Load'].map((t) => h('th', {}, t)))),
          h('tbody', {}, rows),
          h('tfoot', {}, h('tr', {}, h('th', { colspan: 10 }, 'Transmission total'), h('td', { class: 'num strong' }, out('_trKW', 2, '', ' kW'))))))),
      h('details', { class: 'card sect' }, h('summary', {}, h('h3', {}, 'Advanced — area and U-value overrides'), h('small', { class: 'muted' }, 'Overrides are listed in the assumptions register')),
        h('div', { class: 'sect-b' }, grid(...r.surfaces.map((s) => F(s, 'areaOverride', `Area — ${s.label}`, { kind: 'area', placeholder: 'from dimensions' })),
          ...r.surfaces.map((s) => F(s, 'uOverride', `U-value — ${s.label}`, { kind: 'U', placeholder: 'calculated' })),
          F(r.surfaces.find((s) => s.key === 'floor') || {}, 'rExtra', 'Floor slab / screed extra R', { kind: 'Rval', hint: '150 mm concrete ≈ 0.1 m²K/W' })))));
  }

  function productOptions() {
    const groups = {};
    for (const p of D.products) (groups[p.group] = groups[p.group] || []).push([p.id, p.name]);
    return Object.entries(groups).map(([g, items]) => ({ group: g, items }));
  }

  function tabProduct(r) {
    const cards = r.products.map((p, i) => {
      const ref = D.products.find((x) => x.id === p.productId) || {};
      return sect(`Product ${i + 1}: ${p.name || ref.name || ''}`, null,
        grid(
          F(p, 'productId', 'Commodity', { type: 'select', options: productOptions(), rerender: true, tip: 'product', onSet: () => { p.xw = ''; p.Tf = ''; p.resp = ''; } }),
          F(p, 'name', 'Description', { type: 'text', placeholder: ref.name }),
          F(p, 'mass', 'Product intake', { kind: 'massDay', tip: 'mass' }),
          F(p, 'tIn', 'Entering product temperature', { kind: 'temp', tip: 'tIn' }),
          F(p, 'tOut', 'Final product temperature', { kind: 'temp', tip: 'tOut' }),
          F(p, 'pullDown', 'Pull-down / freezing time', { unit: 'h', tip: 'pullDown' }),
          F(p, 'xw', 'Water content', { unit: '%', placeholder: ref.xw, tip: 'xw', hint: 'Blank = database value' }),
          F(p, 'Tf', 'Initial freezing point', { kind: 'temp', placeholder: ref.Tf, tip: 'Tf', hint: 'Blank = database value' }),
          F(p, 'crf', 'Chilling rate factor', { placeholder: '1.0', tip: 'crf' }),
          F(p, 'packType', 'Packaging', { type: 'select', tip: 'packaging', options: Object.entries(D.packaging).map(([k, v]) => [k, `${v.name} (c_p ${v.cp})`]) }),
          F(p, 'packPct', 'Packaging mass', { unit: '% of product', tip: 'packaging' }),
          F(p, 'stored', 'Stored quantity (respiration)', { kind: 'mass', tip: 'stored' }),
          F(p, 'resp', 'Heat of respiration (stored)', { unit: 'W/t', placeholder: ref.resp || 0, tip: 'resp', hint: 'Blank = database value' }),
          F(p, 'respIn', 'Respiration of incoming produce', { unit: 'W/t', placeholder: 'not included', tip: 'respIn' })),
        h('details', { class: 'subadv' }, h('summary', {}, 'Entered product properties (optional — replace Siebel estimates)'),
          h('div', { class: 'grid' },
            F(p, 'cpA', 'c_p above freezing', { kind: 'cp', placeholder: 'Siebel', tip: 'propOverride' }),
            F(p, 'cpB', 'c_p below freezing', { kind: 'cp', placeholder: 'Siebel', tip: 'propOverride' }),
            F(p, 'hLat', 'Latent heat of fusion', { kind: 'kJkg', placeholder: 'Siebel', tip: 'propOverride' }))),
        h('div', { class: 'outs' },
          kv('c_p above freezing', out(`product.items.${i}.props.cpAbove`, 2, 'cp')),
          kv('c_p below freezing', out(`product.items.${i}.props.cpBelow`, 2, 'cp')),
          kv('Latent heat', out(`product.items.${i}.props.latent`, 1, 'kJkg')),
          kv('Heat removed', out(`product.items.${i}.qkg`, 1, 'kJkg')),
          kv('Product + packaging + respiration', out(`product.items.${i}.kWh`, 1, '', ' kWh/day'))),
        h('div', { class: 'cardfoot' }, btn('Remove product', () => { r.products.splice(i, 1); App.changed(true); }, { small: true, kind: 'ghost-danger', icon: 'trash' })));
    });
    return h('div', {},
      h('p', { class: 'help' }, 'Sensible heat above freezing, latent heat of fusion and sensible heat below freezing; specific heats from water content (Siebel) unless entered. Database values are typical — confirm with the product specification.'),
      h('div', { class: 'card pad-card' }, grid(F(r, 'productBasis', 'Product load capacity basis', { type: 'select', rerender: true, tip: 'productBasis', options: [['daily', 'Daily — Q × 24/pull-down ÷ run time (default)'], ['pulldown', 'Rate over pull-down — Q ÷ min(pull-down, run time)']] }))),
      cards.length ? cards : h('div', { class: 'card empty' }, h('p', { class: 'muted' }, 'No product load in this room.')),
      btn('Add product', () => { r.products.push(M.newProduct(+r.cond.T)); App.changed(true); }, { icon: 'plus' }));
  }

  function tabInfiltration(r) {
    const ac = r.airChange = r.airChange || { method: 'store', f: 1, fn: 1, nManual: 2, usage: 'average', adj: 'ambient', tAdj: 5, rhAdj: 75 };
    const methodSel = sect('Infiltration method', null, grid(F(r, 'infMethod', 'Calculation method', { type: 'select', rerender: true, wide: true, tip: 'infMethod', options: [
      ['doors', 'Door-opening method — Gosney & Olama (Stoecker / ASHRAE)'], ['airchange', 'Air-change method (Dossat / empirical air changes)']] })));
    const ventSec = sect('Mechanical ventilation / fresh air', null, grid(
      F(r.ventilation, 'm3h', 'Outdoor air', { kind: 'flow', tip: 'ventilation' }), F(r.ventilation, 'hours', 'Operation', { unit: 'h/day' })),
      h('div', { class: 'outs' }, kv('Ventilation load', out('infiltration.vent.kWh', 1, '', ' kWh/day'))));
    if (r.infMethod === 'airchange') {
      return h('div', {}, methodSel,
        sect('Air changes per day', null, grid(
          F(ac, 'method', 'Air-change basis', { type: 'select', rerender: true, wide: true, tip: 'acMethod', options: [
            ['store', 'Storage rooms, fresh / frozen goods: n = 70/√V × f  [per day]'], ['dock', 'Manipulation rooms / docks: n = 35/√V × fn  [per hour]'],
            ['dossat', 'Dossat table: average air changes per 24 h vs volume × usage factor'], ['manual', 'Manual air changes per day']] }),
          ac.method === 'store' ? F(ac, 'f', 'Correction factor f', { hint: '1.0 normal; > 1 for heavy traffic' }) : null,
          ac.method === 'dock' ? F(ac, 'fn', 'Factor fn (number of open doors)') : null,
          ac.method === 'dossat' ? F(ac, 'usage', 'Usage', { type: 'select', options: Object.entries(D.usageFactors).map(([k, v]) => [k, v.name]) }) : null,
          ac.method === 'manual' ? F(ac, 'nManual', 'Air changes', { unit: 'per day', hint: 'Recommended minimum 2' }) : null,
          F(ac, 'adj', 'Infiltrating air from', { type: 'select', rerender: true, options: [['ambient', 'Outdoor design air'], ['custom', 'Adjacent space']] }),
          ac.adj === 'custom' ? F(ac, 'tAdj', 'Adjacent temperature', { kind: 'temp' }) : null,
          ac.adj === 'custom' ? F(ac, 'rhAdj', 'Adjacent RH', { unit: '%' }) : null),
          h('div', { class: 'outs' }, kv('Air changes', out('infiltration.airChange.n', 2, '', ' /day')), kv('Infiltration load', out('infiltration.airChange.kWh', 1, '', ' kWh/day')), kv('Moisture (frost) load', out('infiltration.airChange.moisture', 1, 'massDay')))),
        ventSec);
    }
    const prot = Object.entries(D.doorProtection).map(([k, v]) => [k, v.name + (k === 'custom' ? '' : ` (E = ${v.E})`)]);
    const cards = r.doors.map((d, i) => sect(d.name || `Door ${i + 1}`, null,
      grid(
        F(d, 'name', 'Door / opening', { type: 'text' }),
        F(d, 'w', 'Width', { kind: 'len', tip: 'doorSize' }), F(d, 'h', 'Height', { kind: 'len', tip: 'doorSize' }),
        F(d, 'adj', 'Opens to', { type: 'select', rerender: true, options: [['ambient', 'Outdoor design air'], ['custom', 'Adjacent space']] }),
        d.adj === 'custom' ? F(d, 'tAdj', 'Adjacent temperature', { kind: 'temp' }) : null,
        d.adj === 'custom' ? F(d, 'rhAdj', 'Adjacent RH', { unit: '%' }) : null,
        F(d, 'passages', 'Door opening frequency', { unit: 'passages/day', tip: 'passages' }),
        F(d, 'openSec', 'Open–close time per passage', { unit: 's', tip: 'openSec', hint: '15–25 s typical for forklift doors' }),
        F(d, 'standMin', 'Time standing open', { unit: 'min/day', tip: 'standMin' }),
        F(d, 'protection', 'Door protection', { type: 'select', options: prot, rerender: true, tip: 'protection' }),
        d.protection === 'custom' ? F(d, 'E', 'Effectiveness E', { hint: '0 = none … 0.95' }) : null,
        F(d, 'Df', 'Doorway flow factor D_f', { placeholder: 'auto', tip: 'Df' })),
      h('div', { class: 'outs' },
        kv('Load with door fully open', out(`infiltration.items.${i}.qOpen`, 1, '', ' kW')), kv('Open time', out(`infiltration.items.${i}.openH`, 2, '', ' h/day')),
        kv('Infiltration load', out(`infiltration.items.${i}.kWh`, 1, '', ' kWh/day')), kv('Moisture (frost) load', out(`infiltration.items.${i}.moisture`, 1, 'massDay'))),
      h('div', { class: 'cardfoot' }, btn('Remove door', () => { r.doors.splice(i, 1); App.changed(true); }, { small: true, kind: 'ghost-danger', icon: 'trash' }))));
    return h('div', {}, methodSel,
      h('p', { class: 'help' }, 'q = 0.221·A·(hᵢ − hᵣ)·ρᵣ·(1 − ρᵢ/ρᵣ)^0.5·(g·H)^0.5·Fm, then qₜ = q·Dₜ·D_f·(1 − E). Air properties at site pressure.'),
      cards, btn('Add door', () => { r.doors.push(M.newDoor()); App.changed(true); }, { icon: 'plus' }), ventSec);
  }

  function tabInternal(r) {
    const i = r.internal, e = r.equipment;
    return h('div', {},
      sect('People', null, grid(F(i, 'people', 'Number of people', { tip: 'people' }), F(i, 'peopleHours', 'Occupancy', { unit: 'h/day' })),
        h('div', { class: 'outs' }, kv('Heat per person (272 − 6·t)', out('internal.perPerson', 0, '', ' W')), kv('People load', out('internal.people', 1, '', ' kWh/day')))),
      sect('Lighting', null, grid(F(i, 'lightsWm2', 'Lighting power density', { kind: 'Wm2', tip: 'lights', hint: 'LED high-bay ≈ 5–10 W/m²' }), F(i, 'lightsHours', 'Operation', { unit: 'h/day' })),
        h('div', { class: 'outs' }, kv('Lighting load', out('internal.lights', 1, '', ' kWh/day')))),
      sect('Motors, material handling & equipment', null, grid(
        F(i, 'forklifts', 'Forklifts / reach trucks', { tip: 'forklifts' }), F(i, 'forkliftKW', 'Power per truck', { unit: 'kW' }), F(i, 'forkliftHours', 'Operation', { unit: 'h/day' }),
        F(i, 'otherKW', 'Other equipment / motors in room', { unit: 'kW', tip: 'other' }), F(i, 'otherHours', 'Operation', { unit: 'h/day' })),
        h('div', { class: 'outs' }, kv('Forklifts', out('internal.forklifts', 1, '', ' kWh/day')), kv('Other equipment', out('internal.other', 1, '', ' kWh/day')))),
      sect('Evaporator fans', null, grid(
        F(e, 'fanMode', 'Method', { type: 'select', rerender: true, tip: 'fans', options: [['pct', 'Estimate as % of load'], ['kw', 'Specified motor power']] }),
        e.fanMode === 'kw' ? F(e, 'fanKW', 'Total fan motor power', { unit: 'kW' }) : F(e, 'fanPct', 'Fan heat allowance', { unit: '%', hint: 'Typically 5–10 % before coil selection' }),
        e.fanMode === 'kw' ? F(e, 'fanHours', 'Operation', { unit: 'h/day' }) : null),
        h('div', { class: 'outs' }, kv('Fan load', out('equipment.fans', 1, '', ' kWh/day')))),
      sect('Defrost', null, grid(
        F(e, 'defrostKW', 'Defrost heat input', { unit: 'kW', tip: 'defrost', hint: 'Electric heater or hot-gas equivalent; 0 for off-cycle' }),
        F(e, 'defrostPerDay', 'Defrosts', { unit: 'per day' }), F(e, 'defrostMin', 'Duration', { unit: 'min' }),
        F(e, 'defrostFrac', 'Heat released to room', { unit: '%', hint: 'Typically 30–50 % of defrost heat' })),
        h('div', { class: 'outs' }, kv('Defrost load', out('equipment.defrost', 1, '', ' kWh/day')))));
  }

  function tabResults() { return h('div', { id: 'room-results' }); }

  function roomResults(r, res, o) {
    const rows = res.breakdown.map((b) => h('tr', { class: Math.abs(b.kWh) < 0.05 ? 'zero' : null }, h('td', {}, h('span', { class: 'sw c-' + b.key }), b.label), h('td', { class: 'num' }, fmt(b.kWh, 1)), h('td', { class: 'num' }, fmt(b.kWh / 24, 2)), h('td', { class: 'num' }, res.subtotal ? `${fmt(b.kWh / res.subtotal * 100, 1)} %` : '–')));
    const blocks = CL.explain.explainRoom(r, res, o.data, D);
    return h('div', {},
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi hero' }, h('span', { class: 'kpi-l' }, 'Final design refrigeration load'), h('b', {}, pw(res.capacity)), h('small', {}, `${fmt(res.capacity, 2)} kW · ${fmt(res.capacity / 3.51685, 2)} TR · ${fmt(res.capacity * 3412.14, 0)} Btu/h · ${fmt(res.capacity * 859.845, 0)} kcal/h`)),
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-l' }, 'Total load incl. allowance'), h('b', {}, `${fmt(res.total, 0)} kWh/day`), h('small', {}, `run time ${fmt(res.runHours, 0)} h/day`)),
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-l' }, 'Suggested SST'), h('b', {}, `${fmt(U.toDisplay('temp', res.sst), 1)} ${U.label('temp')}`), h('small', {}, `TD ${fmt(res.TD, 1)} K at ${fmt(+r.cond.RH, 0)} % RH`)),
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-l' }, 'Load density · frost'), h('b', {}, `${fmt(res.loadDensity, 1)} W/m³`), h('small', {}, `frost ${fmt(res.frostKgDay, 1)} kg/day`))),
      h('section', { class: 'card' }, h('h3', {}, 'Load summary'),
        h('table', { class: 'rtable' }, h('thead', {}, h('tr', {}, h('th', {}, 'Component'), h('th', { class: 'num' }, 'kWh/day'), h('th', { class: 'num' }, 'avg kW'), h('th', { class: 'num' }, 'Share'))),
          h('tbody', {}, rows),
          h('tfoot', {},
            h('tr', {}, h('td', {}, 'Total calculated load'), h('td', { class: 'num' }, fmt(res.subtotal, 1)), h('td', { class: 'num' }, fmt(res.subtotal / 24, 2)), h('td')),
            h('tr', {}, h('td', {}, `Safety / design allowance (${fmt(res.safety, 0)} %)`), h('td', { class: 'num' }, fmt(res.safetyKWh, 1)), h('td'), h('td')),
            h('tr', {}, h('td', {}, 'Total incl. allowance'), h('td', { class: 'num' }, fmt(res.total, 1)), h('td'), h('td')),
            res.productBasis === 'pulldown' ? h('tr', {}, h('td', {}, 'Product pull-down rate adjustment'), h('td', { class: 'num', colspan: 2 }, `${fmt(res.productRateAdjKW, 2)} kW`), h('td')) : null,
            h('tr', { class: 'grand' }, h('td', {}, res.productBasis === 'pulldown' ? `Final design load = total ÷ ${fmt(res.runHours, 0)} h + adjustment` : `Final design load = total ÷ ${fmt(res.runHours, 0)} h`), h('td', { class: 'num', colspan: 2 }, pw(res.capacity)), h('td')))),
        h('p', { class: 'muted small' }, `Rule of thumb: room load excluding product ${fmt(res.kcalM3Day, 0)} kcal/m³·day (typical ${res.volume <= 2000 ? '200–400 up to 2 000 m³' : '≈ 200 above 2 000 m³'})${res.coilArea ? ` · air-cooler surface ≈ ${fmt(res.coilArea, 0)} m²` : ''}.`)),
      h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', {}, 'Calculation transparency'), h('small', { class: 'muted' }, 'Inputs → method → intermediate values → result (SI, engine units)')),
        blocks.map((b, i) => h('details', { class: 'calc', open: i === 0 || null },
          h('summary', {}, h('b', {}, b.title), h('span', { class: 'calc-res' }, `${fmt(b.result[0], 2)} ${b.result[1]}`)),
          h('div', { class: 'formula' }, b.formula),
          h('div', { class: 'tablewrap' }, h('table', { class: 'rtable compact' }, h('thead', {}, h('tr', {}, b.table.head.map((x, j) => h('th', { class: j ? 'num' : '' }, x)))), h('tbody', {}, b.table.rows.map((row) => h('tr', {}, row.map((c, j) => h('td', { class: j ? 'num' : '' }, c))))))),
          b.notes.map((n) => h('p', { class: 'muted small' }, n)),
          b.ref ? h('p', { class: 'small' }, 'Reference: ', (CL.refs.REFERENCES.find((x) => x.id === b.ref) || {}).name || b.ref) : null))));
  }

  /* ---------------- refresh (no re-render) ---------------- */
  function refresh(o) {
    if (!App.open || App.open !== o || App.route.name !== 'project' || App.route.params[1] !== 'design') return;
    const ed = document.querySelector('.editor[data-room]');
    let pr; try { pr = CL.plant(o.data); } catch (e) { return; }
    for (const { room, res } of pr.rooms) { const k = document.querySelector(`[data-rkw="${room.id}"]`); if (k) k.textContent = fmt(U.pw(res.capacity), U.pwDigits()); }
    const tot = document.getElementById('rl-total'); if (tot) tot.textContent = pw(pr.totalKW);
    for (const [i, x] of (pr.tunnels || []).entries()) { const k = document.querySelector(`[data-tkw="${i}"]`); if (k) k.textContent = Number.isFinite(x.res.capacity) ? fmt(U.pw(x.res.capacity), U.pwDigits()) : '–'; }
    const msgs = CL.validate.validateProject(o.data, C, D, V);
    if (ed) {
      const r = o.data.rooms.find((x) => x.id === ed.dataset.room);
      if (!r) return;
      const res = pr.rooms.find((x) => x.room === r).res;
      res._floor = (+r.dims.L || 0) * (+r.dims.W || 0);
      res._trKW = res.transmission.items.reduce((a, s) => a + s.kW, 0);
      document.querySelectorAll('#view [data-out]').forEach((el) => {
        const v = getPath(res, el.dataset.out);
        const kind = el.dataset.kind;
        el.textContent = fmt(kind ? U.toDisplay(kind, v) : v, +el.dataset.fmt) + (kind ? ' ' + U.label(kind) : el.dataset.suffix);
      });
      const rr = document.getElementById('room-results'); if (rr) rr.replaceChildren(roomResults(r, res, o));
      const mine = msgs.filter((m) => m.roomId === r.id);
      const tab = App.ui.roomTab;
      document.querySelectorAll('.tabs [data-tab]').forEach((t) => {
        const lv = mine.filter((m) => m.tab === t.dataset.tab);
        t.classList.toggle('t-err', lv.some((m) => m.level === 'error')); t.classList.toggle('t-warn', !lv.some((m) => m.level === 'error') && lv.some((m) => m.level === 'warning'));
      });
      const strip = document.getElementById('msgstrip');
      const here = mine.filter((m) => m.tab === tab || (tab === 'results' && m.tab === 'results'));
      if (strip) strip.replaceChildren(...here.map((m) => h('div', { class: 'msg ' + m.level }, icon(m.level === 'error' ? 'error' : m.level === 'warning' ? 'alert' : 'info', 14), h('span', {}, h('b', {}, m.level.toUpperCase() + ' '), m.msg))));
      document.querySelectorAll('#view .field[data-f]').forEach((f) => f.classList.remove('has-err', 'has-warn'));
      for (const m of here) if (m.field) { const f = document.querySelector(`#view .field[data-f="${m.field}"]`); if (f) f.classList.add(m.level === 'error' ? 'has-err' : m.level === 'warning' ? 'has-warn' : 'x'); }
      drawLive(r, res, mine);
    } else if (document.querySelector('.editor[data-tn]')) {
      const ti = +document.querySelector('.editor[data-tn]').dataset.tn;
      const t = o.data.tunnels[ti]; if (!t) return;
      const tr = (pr.tunnels || [])[ti]; if (!tr) return;
      const res = tr.res;
      for (const [i, x] of (pr.tunnels || []).entries()) { const k = document.querySelector(`[data-tkw="${i}"]`); if (k) k.textContent = Number.isFinite(x.res.capacity) ? fmt(U.pw(x.res.capacity), U.pwDigits()) : '–'; }
      document.querySelectorAll('#view [data-out]').forEach((el) => {
        const v = getPath(res, el.dataset.out), kind = el.dataset.kind;
        el.textContent = fmt(kind ? U.toDisplay(kind, v) : v, +el.dataset.fmt) + (kind ? ' ' + U.label(kind) : el.dataset.suffix);
      });
      const box = document.getElementById('tn-results'); if (box) box.replaceChildren(tunnelResults(t, res));
      const mine = msgs.filter((m) => m.tunnel === ti);
      const strip = document.getElementById('msgstrip');
      if (strip) strip.replaceChildren(...mine.map((m) => h('div', { class: 'msg ' + m.level }, icon(m.level === 'error' ? 'error' : m.level === 'warning' ? 'alert' : 'info', 14), h('span', {}, h('b', {}, m.level.toUpperCase() + ' '), m.msg))));
      document.querySelectorAll('#view .field[data-f]').forEach((f) => f.classList.remove('has-err', 'has-warn'));
      for (const m of mine) if (m.field) { const f = document.querySelector(`#view .field[data-f="${m.field}"]`); if (f) f.classList.add(m.level === 'error' ? 'has-err' : m.level === 'warning' ? 'has-warn' : 'x'); }
      const el = document.getElementById('live');
      if (el) {
        const c = CL.validate.count(mine);
        const max = Math.max(1e-9, ...res.breakdown.map((b) => b.kW));
        el.replaceChildren(h('div', { class: 'live-in' }, h('span', { class: 'kpi-l' }, 'Design capacity — ', t.name), h('b', { class: 'big' }, Number.isFinite(res.capacity) ? pw(res.capacity) : '–'),
          h('small', {}, `${fmt(res.capacity, 1)} kW · ${fmt(res.capacity / 3.51685, 1)} TR`),
          h('div', { class: 'chips' }, h('span', {}, `Freezing ${fmt(res.tFreeze, 1)} h`), h('span', {}, `${fmt(res.mdot, 0)} kg/h`), h('span', {}, `SST ${fmt(U.toDisplay('temp', res.sst), 0)} ${U.label('temp')}`)),
          h('div', { class: 'live-v' }, h('span', { class: 'badge err' + (c.error ? '' : ' zero') }, icon('error', 12), c.error), h('span', { class: 'badge warn' + (c.warning ? '' : ' zero') }, icon('alert', 12), c.warning), h('span', { class: 'badge info' }, icon('info', 12), c.info)),
          h('ul', { class: 'bars' }, res.breakdown.filter((b) => b.kW > 0.005).map((b) => h('li', {}, h('div', { class: 'bl' }, h('span', {}, b.label), h('span', {}, `${fmt(b.kW / res.subtotal * 100, 0)} %`)), h('div', { class: 'track' }, h('div', { class: 'fill tn-' + b.key, style: { width: `${Math.max(1, b.kW / max * 100)}%` } })))))));
      }
    } else {
      const me = document.querySelector('.editor[data-mr]');
      if (me) { const mi = +me.dataset.mr; const m = o.data.machinery[mi]; const box = document.getElementById('mr-results'); if (box && m) box.replaceChildren(machineryResults(m)); drawLiveMr(m, msgs.filter((x) => x.mr === mi)); const st = document.getElementById('mr-status'); if (st && m.tpl) st.replaceChildren(statusTable(m)); }
    }
  }

  function drawLive(r, res, mine) {
    const el = document.getElementById('live'); if (!el) return;
    const max = Math.max(1, ...res.breakdown.map((b) => b.kWh));
    const c = CL.validate.count(mine);
    el.replaceChildren(h('div', { class: 'live-in' },
      h('span', { class: 'kpi-l' }, 'Design load — ', r.name), h('b', { class: 'big' }, pw(res.capacity)),
      h('small', {}, `${fmt(res.capacity, 1)} kW · ${fmt(res.capacity / 3.51685, 1)} TR`),
      h('div', { class: 'chips' }, h('span', {}, `SST ${fmt(U.toDisplay('temp', res.sst), 1)} ${U.label('temp')}`), h('span', {}, `${fmt(res.total, 0)} kWh/day`), h('span', {}, `${fmt(res.runHours, 0)} h run`)),
      h('div', { class: 'live-v' }, h('span', { class: 'badge err' + (c.error ? '' : ' zero') }, icon('error', 12), c.error), h('span', { class: 'badge warn' + (c.warning ? '' : ' zero') }, icon('alert', 12), c.warning), h('span', { class: 'badge info' }, icon('info', 12), c.info)),
      h('ul', { class: 'bars' }, res.breakdown.filter((b) => b.kWh > 0.05).map((b) => h('li', {}, h('div', { class: 'bl' }, h('span', {}, b.label), h('span', {}, `${fmt(b.kWh / res.subtotal * 100, 0)} %`)), h('div', { class: 'track' }, h('div', { class: 'fill c-' + b.key, style: { width: `${Math.max(1, b.kWh / max * 100)}%` } })))))));
  }

  /* ---------------- machinery rooms ---------------- */
  async function machineryEditor(o, mi) {
    const m = o.data.machinery[mi];
    const tpls = await App.repo.listTemplates('machineryVent');
    const cur = m.tpl ? tpls.find((t) => t.id === m.tpl.id) : null;
    const pend = cur ? T.pendingUpdate(m, cur) : null;
    const yn = [['yes', 'Yes'], ['no', 'No']];
    const colors = [['none', 'N/A'], ['light', 'Light'], ['medium', 'Medium'], ['dark', 'Dark']];
    const mark = (k) => (m.tpl && String(m.tpl.snapshot[k] ?? '') !== String(m[k] ?? '') ? ' ovr' : '');
    const FM = (k, label, opt = {}) => { const f = F(m, k, label, opt); if (mark(k)) f.classList.add('ovr'); return f; };

    const tplBox = sect('Common engineering standard', 'Reusable machinery-room design basis with project overrides',
      h('div', { class: 'grid' },
        h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Linked standard'), h('select', { onchange: async (e) => {
          const id = e.target.value;
          if (!id) { if (await confirmDlg('Unlink standard', 'Keep the current values but stop tracking the common standard?', { ok: 'Unlink' })) { T.unlink(m); App.changed(true); } else e.target.value = m.tpl.id; return; }
          const t = tpls.find((x) => x.id === id);
          if (await confirmDlg('Apply common standard', `Apply “${t.name}” (v${t.version}) to this machinery room? Code basis, detection, occupancy and weather fields take the standard values.`, { ok: 'Apply standard' })) { T.link(m, t); App.changed(true); } else e.target.value = m.tpl ? m.tpl.id : '';
        } }, h('option', { value: '' }, '— none (project-specific) —'), tpls.map((t) => h('option', { value: t.id, selected: m.tpl && m.tpl.id === t.id || null }, `${t.name} (v${t.version})`)))),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, ' '), btn('Save these values as a new common standard', async () => {
          const v = await formDlg('New common standard', [{ key: 'name', label: 'Standard name', required: true, value: 'Ammonia machinery room — IIAR 2' }]);
          if (!v) return; const t = await App.repo.saveTemplate(T.templateFromRoom(m, v.name)); T.link(m, t); App.changed(true); toast(`Standard “${t.name}” saved`);
        }, { small: true, icon: 'layers' }))),
      pend ? h('div', { class: 'warn-box' }, icon('alert'), ` The common standard “${cur.name}” was updated (v${pend.from} → v${pend.to}). This project has not been changed. Review:`,
        h('table', { class: 'rtable compact' }, h('thead', {}, h('tr', {}, ['Field', 'Old standard', 'New standard', 'Project value', 'Action on accept'].map((x) => h('th', {}, x)))),
          h('tbody', {}, pend.changes.map((c) => h('tr', {}, h('td', {}, c.label), h('td', {}, show(c.field, c.oldStandard)), h('td', {}, show(c.field, c.newStandard)), h('td', {}, show(c.field, c.project)), h('td', {}, c.overridden ? 'Keep project override' : 'Take new standard'))))),
        btn(`Accept standard v${pend.to}`, () => { T.acceptUpdate(m, cur); App.changed(true); toast('Standard update accepted'); }, { kind: 'primary', small: true })) : null,
      m.tpl ? h('div', { id: 'mr-status' }, statusTable(m)) : h('p', { class: 'muted small' }, 'Link a common standard to reuse the same design basis across projects. Project values can still be overridden; they are never changed silently when the standard changes.'));

    const envRows = m.surfaces.map((s) => h('tr', {}, h('th', {}, s.label), h('td', {}, cell(s, 'sunlit', { type: 'select', options: yn })), h('td', {}, cell(s, 'area', { kind: 'area' })), h('td', {}, cell(s, 'U', { kind: 'U' })), h('td', {}, cell(s, 'color', { type: 'select', options: colors }))));
    const motorRows = m.motors.map((mo, i) => h('tr', {}, h('td', {}, cell(mo, 'name', { type: 'text' })), h('td', {}, cell(mo, 'kW', {})), h('td', {}, cell(mo, 'eff', {})),
      h('td', {}, h('input', { type: 'checkbox', checked: mo.standby || null, 'aria-label': 'Standby', onchange: (e) => { mo.standby = e.target.checked; App.changed(); } })),
      h('td', {}, btn('', () => { m.motors.splice(i, 1); App.changed(true); }, { small: true, icon: 'x', kind: 'ghost-danger', title: 'Remove motor' }))));

    return h('div', { class: 'editor', 'data-mr': mi },
      h('div', { class: 'ed-head' }, h('h2', {}, m.name), h('div', {}, btn('Delete', async () => { if (await confirmDlg('Delete machinery room', `Delete “${m.name}”?`, { ok: 'Delete', danger: true })) { o.data.machinery.splice(mi, 1); App.changed(); App.go(`project/${o.id}/design`); } }, { small: true, icon: 'trash', kind: 'ghost-danger' }))),
      h('div', { class: 'msgstrip', id: 'msgstrip' }),
      tplBox,
      sect('Room and code basis', null, grid(
        F(m, 'name', 'Machinery room name', { type: 'text', onSet: () => { const e = document.querySelector('.ed-head h2'); if (e) e.textContent = m.name; } }),
        FM('code', 'Code / standard in force', { type: 'select', tip: 'mrCode', options: Object.entries(V.codes).map(([k, v]) => [k, v.name]) }),
        FM('refrigerant', 'Refrigerant', { type: 'select', options: [['ammonia', 'Ammonia (R717)'], ['other', 'Other (non-ammonia)']] }),
        F(m, 'L', 'Length', { kind: 'len' }), F(m, 'W', 'Width', { kind: 'len' }), F(m, 'H', 'Height', { kind: 'len' }),
        F(m, 'chargeKg', 'Refrigerant charge (largest system)', { kind: 'mass', tip: 'mrCharge' }),
        FM('occupants', 'Design occupancy', { unit: 'persons' }), FM('basement', 'Machinery room in a basement?', { type: 'select', options: yn }))),
      sect('Detection', null, grid(
        FM('detector', 'Detector activates ventilation & supervised alarm?', { type: 'select', options: yn }),
        FM('maxSetpoint', 'Maximum setpoint allowed by code', { unit: 'ppm', hint: 'IIAR 2-2008A: ≤ TLV-TWA (normal), ≤ 1000 ppm (emergency)' }),
        FM('setpoint', 'Setpoint activating ventilation', { unit: 'ppm' }))),
      sect('Weather', null, grid(FM('toaC', 'Outdoor design dry-bulb (1 %)', { kind: 'temp' }), FM('tsaC', 'Supply (make-up) air temperature', { kind: 'temp', tip: 'mrTsa' }))),
      sect('Sun-lit envelope', null, h('div', { class: 'tablewrap' }, h('table', { class: 'grid-table' }, h('thead', {}, h('tr', {}, ['Surface', 'Sun-lit?', `Area [${U.label('area')}]`, `U [${U.label('U')}]`, 'Colour'].map((t) => h('th', {}, t)))), h('tbody', {}, envRows)))),
      sect('Motors in the machinery room', 'Heat = shaft power × (1 − efficiency); standby machines excluded',
        h('div', { class: 'tablewrap' }, h('table', { class: 'grid-table' }, h('thead', {}, h('tr', {}, ['Equipment', 'Power [kW]', 'Efficiency [%]', 'Standby', ''].map((t) => h('th', {}, t)))), h('tbody', {}, motorRows))),
        btn('Add motor', () => { m.motors.push({ name: 'Motor', kW: 10, eff: 92, standby: false }); App.changed(true); }, { icon: 'plus', small: true })),
      sect('Installed ventilation (compliance check)', 'Optional', grid(
        F(m.installed, 'normal', 'Installed normal exhaust', { kind: 'flow' }), F(m.installed, 'continuous', 'Installed continuous exhaust', { kind: 'flow' }), F(m.installed, 'emergency', 'Installed emergency exhaust', { kind: 'flow' }))),
      h('section', { class: 'card' }, h('h3', {}, 'Required ventilation rates'), h('div', { id: 'mr-results' })));
  }

  const show = (field, v) => (field === 'code' ? (V.codes[v] || {}).name || String(v ?? '') : field === 'refrigerant' ? (v === 'ammonia' ? 'Ammonia (R717)' : 'Non-ammonia') : String(v ?? ''));
  function statusTable(m) {
    return h('table', { class: 'rtable compact' }, h('thead', {}, h('tr', {}, ['Parameter', 'Standard value', 'Project value', 'Status', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, T.status(m).map((s) => h('tr', { class: s.overridden ? 'ovr-row' : null }, h('td', {}, s.label), h('td', {}, show(s.field, s.standard)), h('td', {}, show(s.field, s.project)),
        h('td', {}, s.overridden ? h('span', { class: 'chip st-issued sm' }, 'Project override') : h('span', { class: 'chip st-approved sm' }, 'Standard')),
        h('td', {}, s.overridden ? btn('Reset to standard', () => { T.resetField(m, s.field); App.changed(true); }, { small: true }) : null)))));
  }

  function machineryResults(m) {
    const r = V.calcMachineryRoom(m);
    const fl = (x) => `${fmt(U.toDisplay('flow', x), 0)} ${U.label('flow')}`;
    const row = (label, x) => [h('tr', { class: 'grand' }, h('td', {}, label), h('td', {}, x.design.basis), h('td', { class: 'num' }, fl(x.design.m3h)), h('td', { class: 'num' }, fmt(x.design.ls, 0)), h('td', { class: 'num' }, fmt(x.design.ach, 1)),
      h('td', {}, x.ok == null ? '' : x.ok ? h('span', { class: 'pass' }, '✔ installed OK') : h('span', { class: 'fail' }, '✘ insufficient'))),
    ...x.rows.map((rw) => h('tr', {}, h('td'), h('td', { class: 'muted' }, rw.basis), h('td', { class: 'num' }, Number.isFinite(rw.m3h) ? fl(rw.m3h) : 'n/a'), h('td', { class: 'num' }, Number.isFinite(rw.ls) ? fmt(rw.ls, 0) : ''), h('td', { class: 'num' }, Number.isFinite(rw.ach) ? fmt(rw.ach, 1) : ''), h('td')))];
    return h('div', {},
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi hero' }, h('span', { class: 'kpi-l' }, 'Emergency ventilation'), h('b', {}, fl(r.emergency.design.m3h)), h('small', {}, `${fmt(r.emergency.design.cfm, 0)} cfm · ${fmt(r.emergency.design.ach, 1)} ACH`)),
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-l' }, 'Normal ventilation'), h('b', {}, fl(r.normal.design.m3h)), h('small', {}, `${fmt(r.normal.design.ach, 1)} ACH`)),
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-l' }, 'Continuous ventilation'), h('b', {}, fl(r.continuous.design.m3h)), h('small', {}, `${fmt(r.continuous.design.ach, 1)} ACH`)),
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-l' }, 'Room heat load'), h('b', {}, `${fmt(r.heatKW, 1)} kW`), h('small', {}, `motors ${fmt(r.motorKW, 1)} · envelope ${fmt(r.envKW, 1)} kW`))),
      h('p', { class: 'muted small' }, `${r.codeName} · ${fmt(r.areaM2, 0)} m², ${fmt(r.volM3, 0)} m³ · max room temperature ${fmt(r.tmrC, 1)} °C`),
      h('div', { class: 'tablewrap' }, h('table', { class: 'rtable' }, h('thead', {}, h('tr', {}, ['Mode', 'Basis', 'Rate', 'L/s', 'ACH', ''].map((t) => h('th', {}, t)))), h('tbody', {}, row('Normal', r.normal), row('Continuous', r.continuous), row('Emergency', r.emergency)))),
      h('h4', {}, 'Design requirements & checks'), h('ul', { class: 'notes' }, r.checks.map((c) => h('li', {}, c))),
      h('p', { class: 'muted small' }, 'Clause references: see Standards & references (IIAR 2-2008 Addendum A §13.2–13.3, verified from the supplied IIAR tool).'));
  }

  function drawLiveMr(m, mine) {
    const el = document.getElementById('live'); if (!el) return;
    const r = V.calcMachineryRoom(m); const c = CL.validate.count(mine);
    el.replaceChildren(h('div', { class: 'live-in' }, h('span', { class: 'kpi-l' }, 'Emergency ventilation'), h('b', { class: 'big' }, `${fmt(U.toDisplay('flow', r.emergency.design.m3h), 0)} ${U.label('flow')}`),
      h('small', {}, `${fmt(r.emergency.design.ach, 1)} ACH · ${r.codeName}`),
      h('div', { class: 'live-v' }, h('span', { class: 'badge err' + (c.error ? '' : ' zero') }, icon('error', 12), c.error), h('span', { class: 'badge warn' + (c.warning ? '' : ' zero') }, icon('alert', 12), c.warning)),
      mine.map((x) => h('div', { class: 'msg ' + x.level }, x.msg))));
  }

  /* ---------------- tunnel / blast freezer ---------------- */
  function libOptions() {
    const groups = {};
    for (const p of CL.productsTab.PRODUCTS) (groups[p.group] = groups[p.group] || []).push([p.id, p.name]);
    return [{ group: 'Entered values', items: [['', '— enter properties below —']] }, ...Object.entries(groups).map(([g, items]) => ({ group: g, items }))];
  }

  function tunnelEditor(o, ti) {
    const t = o.data.tunnels[ti];
    const F2 = (obj, key, label, opt = {}) => F(obj, key, label, { id: key, ...opt });
    const batch = t.mode !== 'continuous';
    const ref = CL.productsTab.PRODUCTS.find((x) => x.id === t.product.libId);
    const insOpts = Object.entries(D.insulation).map(([k, v]) => [k, k === 'NONE' ? 'None' : `${k} — k ${v.k}`]);
    const prot = Object.entries(D.doorProtection).map(([k, v]) => [k, v.name + (k === 'custom' ? '' : ` (E = ${v.E})`)]);
    const doorCards = (t.doors || []).map((d, i) => h('div', { class: 'card sub' }, h('div', { class: 'grid' },
      F(d, 'name', 'Door', { type: 'text' }), F(d, 'w', 'Width', { kind: 'len' }), F(d, 'h', 'Height', { kind: 'len' }),
      F(d, 'openPerCycle', 'Openings per cycle'), F(d, 'openSec', 'Open time per opening', { unit: 's' }),
      F(d, 'tAdj', 'Adjacent temperature', { kind: 'temp' }), F(d, 'rhAdj', 'Adjacent RH', { unit: '%' }),
      F(d, 'protection', 'Protection', { type: 'select', options: prot, rerender: true }), d.protection === 'custom' ? F(d, 'E', 'Effectiveness E') : null),
      h('div', { class: 'outs' }, kv('Door load', out(`doors.${i}.kW`, 2, '', ' kW'))),
      h('div', { class: 'cardfoot' }, btn('Remove door', () => { t.doors.splice(i, 1); App.changed(true); }, { small: true, kind: 'ghost-danger', icon: 'trash' }))));
    return h('div', { class: 'editor', 'data-tn': ti },
      h('div', { class: 'ed-head' }, h('h2', {}, t.name), h('div', {},
        btn('Reference guide', () => CL.guidePanel.open(), { small: true, icon: 'book' }),
        btn('Duplicate', () => { const c = JSON.parse(JSON.stringify(t)); c.id = M.uid(); c.name = `${t.name} (copy)`; o.data.tunnels.splice(ti + 1, 0, c); App.changed(); App.go(`project/${o.id}/design/tunnel/${ti + 1}`); }, { small: true, icon: 'copy' }),
        btn('Delete', async () => { if (await confirmDlg('Delete tunnel', `Delete “${t.name}”? You can undo this (Ctrl+Z) until you leave the project.`, { ok: 'Delete', danger: true })) { o.data.tunnels.splice(ti, 1); App.changed(); App.go(`project/${o.id}/design`); } }, { small: true, icon: 'trash', kind: 'ghost-danger' }))),
      h('div', { class: 'msgstrip', id: 'msgstrip' }),
      sect('Tunnel identification', 'Blast freezer, freezing tunnel, spiral or belt freezer', grid(
        F2(t, 'name', 'Tunnel name / tag', { type: 'text', onSet: () => { const e = document.querySelector('.ed-head h2'); if (e) e.textContent = t.name; } }),
        F2(t, 'mode', 'Tunnel type', { type: 'select', rerender: true, tip: 'fzMode', options: [['batch', 'Batch (trolleys / pallets / racks)'], ['continuous', 'Continuous (belt / spiral)']] }),
        F2(t, 'sstOverride', 'Suction temperature override', { kind: 'temp', placeholder: 'auto' }),
        F2(t, 'notes', 'Notes', { type: 'textarea', wide: true }))),
      sect('Product', ref && ref.storage ? `Library storage data: ${ref.storage}` : 'Tabulated properties from your heat-load workbook', grid(
        F2(t.product, 'libId', 'Product (tabulated library)', { type: 'select', options: libOptions(), rerender: true, tip: 'fzProduct', wide: true, onSet: () => { for (const k of ['Tf', 'cpA', 'cpB', 'hLat']) t.product[k] = ''; } }),
        F2(t.product, 'name', 'Description', { type: 'text', placeholder: ref ? ref.name : '' }),
        F2(t.product, 'Tf', 'Initial freezing point', { kind: 'temp', placeholder: ref ? ref.Tf : '', tip: 'Tf' }),
        F2(t.product, 'cpA', 'c₁ specific heat above freezing', { kind: 'cp', placeholder: ref ? ref.cpA : '', tip: 'propOverride' }),
        F2(t.product, 'cpB', 'c₂ specific heat below freezing', { kind: 'cp', placeholder: ref ? ref.cpB : '', tip: 'propOverride' }),
        F2(t.product, 'hLat', 'Latent heat h_if', { kind: 'kJkg', placeholder: ref ? ref.hLat : '', tip: 'propOverride' }),
        F2(t.product, 'kF', 'Frozen thermal conductivity', { unit: 'W/m·K', tip: 'kF' }),
        F2(t.product, 'rhoU', 'Density unfrozen', { unit: 'kg/m³', tip: 'kF' }),
        F2(t.product, 'rhoF', 'Density frozen', { unit: 'kg/m³', tip: 'kF' })),
        h('p', { class: 'muted small' }, 'Blank fields use the library value (shown in grey). Library: ', CL.productsTab.SOURCE, '.')),
      sect('Geometry & freezing conditions', null, grid(
        F2(t, 'shape', 'Product shape', { type: 'select', tip: 'fzShape', options: Object.entries(root.HLFreeze.SHAPES).map(([k, v]) => [k, v.name]) }),
        F2(t, 'D', 'Thickness / diameter D', { kind: 'len', tip: 'fzShape' }),
        F2(t, 'hAir', 'Surface coefficient h_air', { kind: 'U', tip: 'hAir' }),
        F2(t, 'Rpack', 'Packaging / air-gap resistance', { kind: 'Rval', tip: 'Rpack' }),
        F2(t, 'Tm', 'Tunnel air temperature', { kind: 'temp', tip: 'Tm' }),
        F2(t, 'Ti', 'Product inlet temperature t₁', { kind: 'temp', tip: 'tIn' }),
        F2(t, 'Tc', 'Final centre temperature', { kind: 'temp', tip: 'Tc' }),
        F2(t, 'T2', 'Final average temperature t₂', { kind: 'temp', placeholder: t.Tc, tip: 'T2' })),
        h('div', { class: 'outs' }, kv('Effective h', out('freezing.hEff', 2, 'U')), kv('Biot number', out('freezing.Bi', 2)), kv('T_fm', out('freezing.Tfm', 2, 'temp')),
          kv('Freezing time — Plank', out('freezing.plankH', 2, '', ' h')), kv('Freezing time — Pham', out('freezing.phamH', 2, '', ' h')))),
      sect('Freezing time & throughput', null, grid(
        F2(t, 'timeBasis', 'Freezing-time basis for the load', { type: 'select', rerender: true, tip: 'timeBasis', options: [['pham', 'Calculated — Pham (ASHRAE, recommended)'], ['plank', 'Calculated — Plank'], ['entered', 'Entered design time (tests / supplier)']] }),
        t.timeBasis === 'entered' ? F2(t, 'tDesign', 'Design freezing time', { unit: 'h' }) : null,
        batch ? F2(t, 'batchKg', 'Batch mass', { kind: 'mass', tip: 'fzMode' }) : F2(t, 'throughput', 'Product throughput', { kind: 'massRate', tip: 'fzMode' }),
        batch ? F2(t, 'loadH', 'Loading / unloading time per cycle', { unit: 'h' }) : null,
        F2(t, 'peak', 'Load distribution factor', { tip: 'peak', hint: '1.0 = average load over the freezing time' }),
        F2(t, 'packPct', 'Packaging mass', { unit: '% of product', tip: 'packaging' }), F2(t, 'packCp', 'Packaging c_p', { kind: 'cp' }),
        batch ? F2(t, 'trolleyKg', 'Trays / trolleys / racks per batch', { kind: 'mass' }) : null, batch ? F2(t, 'trolleyCp', 'Trolley material c_p', { kind: 'cp', hint: 'Steel ≈ 0.5, aluminium ≈ 0.9' }) : null),
        h('div', { class: 'outs' }, kv('Design freezing time', out('tFreeze', 2, '', ' h')), kv('Product flow', out('mdot', 0, 'massRate')), kv('Heat removed', out('q', 1, 'kJkg')),
          batch ? kv('Cycle time', out('cycleH', 2, '', ' h')) : null, kv('Throughput', out('perDayKg', 0, 'massDay')))),
      sect('Tunnel envelope', null, grid(
        F2(t.dims, 'L', 'Length', { kind: 'len' }), F2(t.dims, 'W', 'Width', { kind: 'len' }), F2(t.dims, 'H', 'Height', { kind: 'len' }),
        F2(t, 'ins', 'Wall / ceiling insulation', { type: 'select', options: insOpts }), F2(t, 'thk', 'Thickness', { kind: 'mm' }), F2(t, 'tSur', 'Surrounding temperature', { kind: 'temp' }),
        F2(t, 'floorIns', 'Floor insulation', { type: 'select', options: insOpts }), F2(t, 'floorThk', 'Floor insulation thickness', { kind: 'mm' }), F2(t, 'groundT', 'Ground / slab temperature', { kind: 'temp', tip: 'groundTemp' })),
        h('div', { class: 'outs' }, kv('Transmission', out('breakdown.3.kW', 2, '', ' kW')))),
      batch
        ? sect('Doors (per freezing cycle)', 'Gosney–Olama with D_f 0.8', doorCards, btn('Add door', () => { t.doors.push({ name: 'Door', w: 2.5, h: 3, openPerCycle: 2, openSec: 60, protection: 'none', E: 0, tAdj: 5, rhAdj: 75 }); App.changed(true); }, { icon: 'plus', small: true }))
        : sect('Belt inlet / outlet openings (continuous)', 'Continuously open areas', grid(
          F2(t.belt, 'area', 'Total open area', { kind: 'area' }), F2(t.belt, 'h', 'Opening height', { kind: 'len' }), F2(t.belt, 'tAdj', 'Adjacent temperature', { kind: 'temp' }), F2(t.belt, 'rhAdj', 'Adjacent RH', { unit: '%' }), F2(t.belt, 'E', 'Curtain effectiveness E')),
          h('div', { class: 'outs' }, kv('Opening load', out('breakdown.4.kW', 2, '', ' kW')))),
      sect('Fans, lighting & equipment', 'Power released inside the tunnel during freezing', grid(
        F2(t, 'fanKW', 'Evaporator / circulation fan motors', { unit: 'kW', tip: 'fans' }), F2(t, 'lightsKW', 'Lighting', { unit: 'kW' }),
        F2(t, 'otherKW', 'Other equipment (belt drive…)', { unit: 'kW' }), F2(t, 'defrostKW', 'Defrost heat during freezing (average)', { unit: 'kW', tip: 'defrost' }))),
      sect('Allowance & evaporator', null, grid(
        F2(t, 'lossPct', 'Loss & safety allowance', { unit: '%', tip: 'lossPct' }),
        F2(t, 'lossMethod', 'Allowance method', { type: 'select', tip: 'lossPct', options: [['divide', 'Q ÷ (1 − x) — workbook method'], ['factor', 'Q × (1 + x)']] }),
        F2(t, 'TD', 'Evaporator TD (air − SST)', { kind: 'dT', tip: 'TD' }), F2(t, 'airDT', 'Air temperature rise across product', { kind: 'dT', tip: 'airDT' }))),
      h('section', { class: 'card' }, h('h3', {}, 'Tunnel results & calculation'), h('div', { id: 'tn-results' })),
      h('div', { class: 'stepnav' }, h('span'), btn('Continue to Review & Report →', () => App.go(`project/${o.id}/report/results`), { kind: 'primary' })));
  }

  function tunnelResults(t, r) {
    const blocks = CL.explain.explainTunnel(t, r);
    return h('div', {},
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi hero' }, h('span', { class: 'kpi-l' }, 'Tunnel design capacity'), h('b', {}, Number.isFinite(r.capacity) ? pw(r.capacity) : '–'), h('small', {}, `${fmt(r.capacity, 2)} kW · ${fmt(r.capacity / 3.51685, 2)} TR · SST ${fmt(r.sst, 0)} °C`)),
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-l' }, 'Freezing time'), h('b', {}, `${fmt(r.tFreeze, 1)} h`), h('small', {}, `Pham ${fmt(r.freezing.phamH, 1)} h · Plank ${fmt(r.freezing.plankH, 1)} h`)),
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-l' }, 'Product flow'), h('b', {}, `${fmt(U.toDisplay('massRate', r.mdot), 0)} ${U.label('massRate')}`), h('small', {}, `${fmt(U.toDisplay('massDay', r.perDayKg), 0)} ${U.label('massDay')}`)),
        h('div', { class: 'kpi' }, h('span', { class: 'kpi-l' }, 'Specific energy · air volume'), h('b', {}, `${fmt(r.kJperKg, 0)} kJ/kg`), h('small', {}, `${fmt(r.kJperKg / 4.186, 0)} kcal/kg · ${fmt(U.toDisplay('flow', r.airflow), 0)} ${U.label('flow')}`))),
      h('div', { class: 'tablewrap' }, h('table', { class: 'rtable' }, h('thead', {}, h('tr', {}, h('th', {}, 'Load component'), h('th', { class: 'num' }, 'kW'), h('th', { class: 'num' }, 'Share'))),
        h('tbody', {}, r.breakdown.map((b) => h('tr', { class: Math.abs(b.kW) < 0.005 ? 'zero' : null }, h('td', {}, b.label), h('td', { class: 'num' }, fmt(b.kW, 2)), h('td', { class: 'num' }, r.subtotal ? `${fmt(b.kW / r.subtotal * 100, 1)} %` : '–')))),
        h('tfoot', {}, h('tr', {}, h('td', {}, 'Σ loads'), h('td', { class: 'num' }, fmt(r.subtotal, 2)), h('td')),
          h('tr', {}, h('td', {}, `Loss & safety ${fmt(+t.lossPct, 0)} % (${t.lossMethod === 'factor' ? '× (1 + x)' : '÷ (1 − x)'})`), h('td', { class: 'num' }, fmt(r.allowance, 2)), h('td')),
          h('tr', { class: 'grand' }, h('td', {}, 'Design capacity'), h('td', { class: 'num' }, pw(r.capacity)), h('td'))))),
      h('h4', {}, 'Calculation transparency'),
      blocks.map((b, i) => h('details', { class: 'calc', open: i === 0 || null },
        h('summary', {}, h('b', {}, b.title), h('span', { class: 'calc-res' }, `${fmt(b.result[0], 2)} ${b.result[1]}`)),
        h('div', { class: 'formula' }, b.formula),
        h('div', { class: 'tablewrap' }, h('table', { class: 'rtable compact' }, h('thead', {}, h('tr', {}, b.table.head.map((x, j) => h('th', { class: j ? 'num' : '' }, x)))), h('tbody', {}, b.table.rows.map((row) => h('tr', {}, row.map((c, j) => h('td', { class: j ? 'num' : '' }, c))))))),
        b.notes.map((n) => h('p', { class: 'muted small' }, n)),
        b.ref ? h('p', { class: 'small' }, 'Reference: ', (CL.refs.REFERENCES.find((x) => x.id === b.ref) || {}).name || b.ref) : null)));
  }

  CL.design = { render, refresh };
})(globalThis);
