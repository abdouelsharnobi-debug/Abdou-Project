/* ColdLoad Pro — UI layer. Plain DOM, no dependencies. */
(function () {
  'use strict';
  const D = window.HLData, C = window.HLCalc, M = window.HLModel;
  const STORE_KEY = 'coldload-pro-project-v1';

  const state = { project: load() || M.exampleProject(), view: 'room', roomId: null, tab: 'general' };
  if (!state.project.rooms.length) state.view = 'project';
  state.roomId = state.project.rooms[0] && state.project.rooms[0].id;

  /* ---------- persistence ---------- */
  function load() {
    try { const s = localStorage.getItem(STORE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state.project)); } catch (e) { /* storage unavailable */ }
  }

  /* ---------- helpers ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(c));
    return el;
  }
  const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');
  const room = () => state.project.rooms.find((r) => r.id === state.roomId);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /**
   * Bound form field. opt: {type, unit, options:[[v,l]], step, hint, rerender, placeholder, wide}
   */
  function field(obj, key, label, opt = {}) {
    const type = opt.type || 'number';
    let input;
    const onChange = (e) => {
      const raw = e.target.value;
      obj[key] = type === 'number' ? (raw === '' ? '' : +raw) : raw;
      if (opt.onSet) opt.onSet(obj[key]);
      changed(opt.rerender);
    };
    if (type === 'select') {
      input = h('select', { onchange: onChange });
      for (const o of opt.options) {
        if (o.group) {
          const g = h('optgroup', { label: o.group });
          for (const [v, l] of o.items) g.append(h('option', { value: v, selected: String(obj[key]) === String(v) }, l));
          input.append(g);
        } else input.append(h('option', { value: o[0], selected: String(obj[key]) === String(o[0]) }, o[1]));
      }
    } else if (type === 'textarea') {
      input = h('textarea', { rows: 3, oninput: onChange, placeholder: opt.placeholder });
      input.value = obj[key] || '';
    } else {
      input = h('input', {
        type, step: opt.step || 'any', min: opt.min, placeholder: opt.placeholder,
        value: obj[key] == null ? '' : obj[key], oninput: onChange,
        inputmode: type === 'number' ? 'decimal' : null,
      });
    }
    return h('label', { class: 'field' + (opt.wide ? ' wide' : '') },
      h('span', { class: 'lbl' }, label),
      h('span', { class: 'ctl' }, input, opt.unit ? h('span', { class: 'unit' }, opt.unit) : null),
      opt.hint ? h('span', { class: 'hint' }, opt.hint) : null);
  }

  /** Computed output bound to a path in the room result, refreshed on every change. */
  function out(path, d = 1, unit = '') {
    return h('span', { class: 'out', 'data-out': path, 'data-fmt': d, 'data-unit': unit });
  }
  function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }

  function changed(rerender) {
    save();
    if (rerender) renderMain();
    refresh();
  }

  /* ---------- sidebar ---------- */
  function renderSidebar() {
    const list = document.getElementById('roomList');
    list.innerHTML = '';
    const pr = C.calcProject(state.project);
    state.project.rooms.forEach((r, i) => {
      const res = pr.rooms[i].res;
      list.append(h('button', {
        class: 'navitem room' + (state.view === 'room' && state.roomId === r.id ? ' active' : ''),
        onclick: () => { state.view = 'room'; state.roomId = r.id; render(); },
      },
      h('span', { class: 'temp ' + (r.cond.T < 0 ? 'cold' : 'cool') }, fmt(+r.cond.T, 0) + '°'),
      h('span', { class: 'rname' }, r.name || 'Room'),
      h('span', { class: 'rkw' }, fmt(res.capacity, 0) + ' kW')));
    });
    document.querySelectorAll('.sidebar [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  }

  /* ---------- main views ---------- */
  function renderMain() {
    const main = document.getElementById('main');
    const scroll = main.scrollTop;
    main.innerHTML = '';
    if (state.view === 'project') main.append(viewProject());
    else if (state.view === 'summary') main.append(viewSummary());
    else if (state.view === 'method') main.append(viewMethod());
    else if (state.view === 'machinery') main.append(viewMachinery());
    else if (room()) main.append(viewRoom(room()));
    else main.append(viewProject());
    main.scrollTop = scroll;
  }

  function section(title, ...kids) {
    return h('section', { class: 'card' }, title ? h('h3', {}, title) : null, ...kids);
  }
  const grid = (...kids) => h('div', { class: 'grid' }, ...kids);

  function viewProject() {
    const p = state.project;
    return h('div', { class: 'view' },
      h('h2', {}, 'Project & design data'),
      section('Project information', grid(
        field(p.info, 'name', 'Project name', { type: 'text', wide: true, onSet: () => renderSidebar() }),
        field(p.info, 'client', 'Client', { type: 'text' }),
        field(p.info, 'location', 'Location', { type: 'text' }),
        field(p.info, 'engineer', 'Prepared by', { type: 'text' }),
        field(p.info, 'date', 'Date', { type: 'date' }),
        field(p.info, 'rev', 'Revision', { type: 'text' }))),
      section('Outdoor design conditions', grid(
        field(p.design, 'ambientDB', 'Design dry-bulb', { unit: '°C', hint: 'Use ASHRAE 0.4 % / 1 % cooling design DB for the site' }),
        field(p.design, 'ambientRH', 'Coincident RH', { unit: '%', hint: 'RH at design DB (from mean coincident wet-bulb)' }),
        field(p.design, 'altitude', 'Site altitude', { unit: 'm' }),
        field(p.design, 'groundTemp', 'Ground / under-floor temp.', { unit: '°C', hint: 'Heated slab: use heater set-point (≈ 10 °C)' }))),
      section('System', grid(
        field(p.design, 'safetyFactor', 'Default safety factor', { unit: '%', hint: 'Applied to new rooms; ASHRAE suggests ≈ 10 %' }),
        field(p.design, 'refrigerant', 'Refrigerant / system', { type: 'select', options: D.refrigerants.map((r) => [r, r]) }))),
      p.design.refrigerant.startsWith('R717') ? section('Ammonia design notes (IIAR)', h('ul', { class: 'notes' },
        h('li', {}, 'Design the closed-circuit ammonia system to ANSI/IIAR 2 (equipment, machinery rooms, ventilation, detection, relief).'),
        h('li', {}, 'Minimum safety criteria for existing systems: ANSI/IIAR 9. Installation: IIAR 4. Start-up: IIAR 5. Maintenance/inspection: IIAR 6. Operating procedures: IIAR 7.'),
        h('li', {}, 'Consider refrigerant charge minimisation and evaporator/ piping locations in occupied spaces when selecting equipment for these loads.'))) : null);
  }

  const TABS = [['general', '1 · Room'], ['transmission', '2 · Transmission'], ['product', '3 · Product'], ['infiltration', '4 · Infiltration'], ['internal', '5 · Internal & equipment'], ['results', '6 · Results']];

  function viewRoom(r) {
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([k, l]) => h('button', {
      class: 'tab' + (state.tab === k ? ' active' : ''), role: 'tab',
      onclick: () => { state.tab = k; renderMain(); refresh(); },
    }, l)));
    const body = { general: tabGeneral, transmission: tabTransmission, product: tabProduct, infiltration: tabInfiltration, internal: tabInternal, results: tabResults }[state.tab](r);
    const idx = TABS.findIndex(([k]) => k === state.tab);
    const nav = h('div', { class: 'stepnav' },
      idx > 0 ? h('button', { class: 'btn ghost', onclick: () => { state.tab = TABS[idx - 1][0]; renderMain(); refresh(); } }, '← ' + TABS[idx - 1][1].split('· ')[1]) : h('span'),
      idx < TABS.length - 1 ? h('button', { class: 'btn primary', onclick: () => { state.tab = TABS[idx + 1][0]; renderMain(); refresh(); } }, TABS[idx + 1][1].split('· ')[1] + ' →') : h('span'));
    return h('div', { class: 'view' },
      h('div', { class: 'roomhead' },
        h('h2', {}, r.name || 'Room'),
        h('div', { class: 'roomactions' },
          h('button', { class: 'mini', onclick: () => duplicateRoom(r) }, 'Duplicate'),
          h('button', { class: 'mini danger', onclick: () => deleteRoom(r) }, 'Delete'))),
      tabs, body, nav);
  }

  function tabGeneral(r) {
    return h('div', {},
      section('Room identification', grid(
        field(r, 'name', 'Room name / tag', { type: 'text', wide: true, onSet: () => { renderSidebar(); document.querySelector('.roomhead h2').textContent = r.name; } }),
        field(r, 'type', 'Application', {
          type: 'select', options: Object.entries(D.roomTypes).map(([k, v]) => [k, v.name]), rerender: true,
          onSet: (v) => {
            const t = D.roomTypes[v];
            if (confirm('Apply typical ' + t.name + ' conditions (temperature, RH, run time, TD, insulation)?')) {
              Object.assign(r.cond, { T: t.T, RH: t.RH });
              r.runHours = t.runHours; r.TD = t.TD;
              r.surfaces = M.newSurfaces(t.T);
            }
          },
        }))),
      section('Dimensions (internal)', grid(
        field(r.dims, 'L', 'Length', { unit: 'm' }),
        field(r.dims, 'W', 'Width', { unit: 'm' }),
        field(r.dims, 'H', 'Height', { unit: 'm' }),
        h('div', { class: 'field ro' }, h('span', { class: 'lbl' }, 'Floor area / volume'), h('span', { class: 'ctl' }, h('span', {}, out('_floor', 0, ' m²'), ' · ', out('volume', 0, ' m³')))))),
      section('Room design conditions', grid(
        field(r.cond, 'T', 'Room temperature', { unit: '°C', rerender: false }),
        field(r.cond, 'RH', 'Relative humidity', { unit: '%', hint: 'Recommended evaporator TD for this RH: ' + D.recommendedTD(+r.cond.RH) + ' K' }),
        field(r, 'runHours', 'Compressor run time', { unit: 'h/day', hint: 'Coolers 16–18 h, freezers 18–20 h (ASHRAE)' }),
        field(r, 'TD', 'Evaporator TD', { unit: 'K', hint: 'Room air − saturated suction' }),
        field(r, 'safety', 'Safety factor', { unit: '%' }),
        field(r, 'sstOverride', 'Suction temp. override', { unit: '°C', placeholder: 'auto', hint: 'Used to group rooms per suction level' }))),
      section('Air cooler check (rule of thumb)', grid(
        field(r.evap = r.evap || { K: 25, lmtd: 7 }, 'K', 'Coil K-value', { unit: 'W/m²K', hint: 'Finned air cooler, typ. 20–30' }),
        field(r.evap, 'lmtd', 'LMTD (estimated)', { unit: 'K' })),
        h('div', { class: 'outs' }, kv('Required cooling surface', out('coilArea', 0, ' m²')), kv('Room load excl. product', out('kcalM3Day', 0, ' kcal/m³·day')))),
      section('Notes', field(r, 'notes', 'Design notes / assumptions', { type: 'textarea', wide: true })));
  }

  function tabTransmission(r) {
    const adjOpts = [['ambient', 'Outdoor'], ['custom', 'Adjacent'], ['ground', 'Ground']];
    const insOpts = Object.entries(D.insulation).map(([k, v]) => [k, k === 'NONE' ? 'None' : k]);
    const orientOpts = [['N', 'N'], ['E', 'E'], ['S', 'S'], ['W', 'W']];
    const sunOpts = [['none', 'None'], ['light', 'Light'], ['medium', 'Med.'], ['dark', 'Dark']];
    const rows = r.surfaces.map((s, i) => h('tr', {},
      h('th', {}, s.label),
      h('td', {}, cell(s, 'adj', { type: 'select', options: adjOpts, rerender: true })),
      h('td', {}, s.adj === 'ambient' ? h('span', { class: 'muted' }, 'DB') : cell(s, 'tAdj', { placeholder: s.adj === 'ground' ? String(state.project.design.groundTemp) : '' })),
      h('td', {}, cell(s, 'ins', { type: 'select', options: insOpts })),
      h('td', {}, cell(s, 'thk', { step: 5 })),
      h('td', {}, s.adj === 'ambient' ? (s.key === 'ceiling' ? h('span', { class: 'muted' }, 'roof') : cell(s, 'orient', { type: 'select', options: orientOpts })) : h('span', { class: 'muted' }, '–')),
      h('td', {}, s.adj === 'ambient' ? cell(s, 'sun', { type: 'select', options: sunOpts }) : h('span', { class: 'muted' }, '–')),
      h('td', { class: 'num' }, out(`transmission.items.${i}.A`, 1)),
      h('td', { class: 'num' }, out(`transmission.items.${i}.U`, 3)),
      h('td', { class: 'num' }, out(`transmission.items.${i}.dT`, 1)),
      h('td', { class: 'num strong' }, out(`transmission.items.${i}.kW`, 2))));
    return h('div', {},
      section('Walls, ceiling and floor',
        h('p', { class: 'help' }, 'Insulation k [W/m·K]: PUR/PIR 0.022, XPS 0.030, EPS 0.036, MW mineral wool 0.040, CG cellular glass 0.042. U = 1 / (1/hᵢ + L/k + 1/hₒ). Sun-effect allowance (ASHRAE) is added to the outdoor design temperature for exposed surfaces. Typical PUR/PIR panel for ' + r.cond.T + ' °C: ' + D.typicalInsulation(+r.cond.T) + ' mm.'),
        h('div', { class: 'tablewrap' }, h('table', { class: 'grid-table' },
          h('thead', {}, h('tr', {}, ['Surface', 'Adjacent to', 'T adj. °C', 'Insulation', 'Thk mm', 'Orient.', 'Sun / colour', 'A m²', 'U W/m²K', 'ΔT K', 'Load kW'].map((t) => h('th', {}, t)))),
          h('tbody', {}, rows),
          h('tfoot', {}, h('tr', {}, h('th', { colspan: 10 }, 'Transmission total'), h('td', { class: 'num strong' }, out('_trKW', 2))))))),
      section('Advanced — area and U-value overrides', grid(...r.surfaces.map((s) => field(s, 'areaOverride', 'Area — ' + s.label, { unit: 'm²', placeholder: 'from dims', rerender: false })),
        ...r.surfaces.map((s) => field(s, 'uOverride', 'U override — ' + s.label, { unit: 'W/m²K', placeholder: 'calc' })),
        field(r.surfaces.find((s) => s.key === 'floor') || {}, 'rExtra', 'Floor slab/screed extra R', { unit: 'm²K/W', hint: '150 mm concrete ≈ 0.1' }))));
  }

  function cell(obj, key, opt) {
    const f = field(obj, key, '', opt);
    f.classList.add('incell');
    return f;
  }

  function productOptions() {
    const groups = {};
    for (const p of D.products) (groups[p.group] = groups[p.group] || []).push([p.id, p.name]);
    return Object.entries(groups).map(([g, items]) => ({ group: g, items }));
  }

  function tabProduct(r) {
    const cards = r.products.map((p, i) => {
      const ref = D.products.find((x) => x.id === p.productId) || {};
      return h('div', { class: 'card sub' },
        h('div', { class: 'cardhead' }, h('h4', {}, `Product ${i + 1}: ${p.name || ref.name || ''}`),
          h('button', { class: 'mini danger', onclick: () => { r.products.splice(i, 1); changed(true); } }, 'Remove')),
        grid(
          field(p, 'productId', 'Commodity', { type: 'select', options: productOptions(), rerender: true, onSet: () => { p.xw = ''; p.Tf = ''; p.resp = ''; } }),
          field(p, 'name', 'Description', { type: 'text', placeholder: ref.name }),
          field(p, 'xw', 'Water content', { unit: '%', placeholder: String(ref.xw) }),
          field(p, 'Tf', 'Initial freezing point', { unit: '°C', placeholder: String(ref.Tf) }),
          field(p, 'mass', 'Product intake', { unit: 'kg/day' }),
          field(p, 'tIn', 'Entering temperature', { unit: '°C' }),
          field(p, 'tOut', 'Final temperature', { unit: '°C' }),
          field(p, 'pullDown', 'Pull-down time', { unit: 'h', hint: 'Load is concentrated over this time (≤ 24 h)' }),
          field(p, 'crf', 'Chilling rate factor', { placeholder: '1.0', hint: 'Dossat CRF ≤ 1 for fast chilling of warm product; 1.0 otherwise' }),
          field(p, 'packType', 'Packaging', { type: 'select', options: Object.entries(D.packaging).map(([k, v]) => [k, `${v.name} (cp ${v.cp})`]) }),
          field(p, 'packPct', 'Packaging mass', { unit: '% of product' }),
          field(p, 'stored', 'Stored quantity (respiration)', { unit: 'kg', hint: 'Fresh produce only' }),
          field(p, 'resp', 'Heat of respiration', { unit: 'W/t', placeholder: String(ref.resp || 0) })),
        h('div', { class: 'outs' },
          kv('cp above freezing', out(`product.items.${i}.props.cpAbove`, 2, ' kJ/kg·K')),
          kv('cp below freezing', out(`product.items.${i}.props.cpBelow`, 2, ' kJ/kg·K')),
          kv('Latent heat', out(`product.items.${i}.props.latent`, 0, ' kJ/kg')),
          kv('Heat removed', out(`product.items.${i}.qkg`, 1, ' kJ/kg')),
          kv('Product + packaging + respiration', out(`product.items.${i}.kWh`, 0, ' kWh/day'))));
    });
    return h('div', {},
      section('Product load',
        h('p', { class: 'help' }, 'Sensible heat above freezing, latent heat of fusion and sensible heat below freezing; specific heats from water content (Siebel equations, ASHRAE "Thermal Properties of Foods"). Database values are typical — confirm with the product specification.'),
        cards.length ? cards : h('p', { class: 'muted' }, 'No product load in this room.'),
        h('button', { class: 'btn ghost', onclick: () => { r.products.push(M.newProduct(+r.cond.T)); changed(true); } }, '+ Add product')));
  }

  function kv(k, v) { return h('div', { class: 'kv' }, h('span', {}, k), v); }

  function tabInfiltration(r) {
    const prot = Object.entries(D.doorProtection).map(([k, v]) => [k, v.name + (k === 'custom' ? '' : ` (E = ${v.E})`)]);
    const cards = r.doors.map((d, i) => h('div', { class: 'card sub' },
      h('div', { class: 'cardhead' }, h('h4', {}, d.name || `Door ${i + 1}`),
        h('button', { class: 'mini danger', onclick: () => { r.doors.splice(i, 1); changed(true); } }, 'Remove')),
      grid(
        field(d, 'name', 'Door / opening', { type: 'text' }),
        field(d, 'w', 'Width', { unit: 'm' }),
        field(d, 'h', 'Height', { unit: 'm' }),
        field(d, 'adj', 'Opens to', { type: 'select', options: [['ambient', 'Outdoor design air'], ['custom', 'Adjacent space']], rerender: true }),
        d.adj === 'custom' ? field(d, 'tAdj', 'Adjacent temperature', { unit: '°C' }) : null,
        d.adj === 'custom' ? field(d, 'rhAdj', 'Adjacent RH', { unit: '%' }) : null,
        field(d, 'passages', 'Door passages', { unit: 'per day' }),
        field(d, 'openSec', 'Open–close time per passage', { unit: 's', hint: 'θp: 15–25 s typical forklift doors' }),
        field(d, 'standMin', 'Time standing open', { unit: 'min/day' }),
        field(d, 'protection', 'Door protection', { type: 'select', options: prot, rerender: true }),
        d.protection === 'custom' ? field(d, 'E', 'Effectiveness E', { hint: '0 = none … 0.95' }) : null,
        field(d, 'Df', 'Doorway flow factor Df', { placeholder: 'auto', hint: 'Auto: 0.8 (ΔT > 11 K) or 1.1' })),
      h('div', { class: 'outs' },
        kv('Load with door fully open', out(`infiltration.items.${i}.qOpen`, 1, ' kW')),
        kv('Open time', out(`infiltration.items.${i}.openH`, 2, ' h/day')),
        kv('Infiltration load', out(`infiltration.items.${i}.kWh`, 0, ' kWh/day')),
        kv('Moisture (frost) load', out(`infiltration.items.${i}.moisture`, 1, ' kg/day')))));
    const ac = r.airChange = r.airChange || { method: 'store', f: 1, fn: 1, nManual: 2, usage: 'average', adj: 'ambient', tAdj: 5, rhAdj: 75 };
    const methodSel = section('Infiltration method', grid(
      field(r, 'infMethod', 'Calculation method', { type: 'select', rerender: true, wide: true, options: [
        ['doors', 'Door-opening method — Gosney & Olama (Stoecker / ASHRAE)'],
        ['airchange', 'Air-change method (Dossat / JCI heat load program)']] })));
    if (r.infMethod === 'airchange') {
      return h('div', {}, methodSel,
        section('Air changes per day', grid(
          field(ac, 'method', 'Air-change basis', { type: 'select', rerender: true, wide: true, options: [
            ['store', 'Cold store, fresh / frozen goods: n = 70/√V × f  [per day]'],
            ['dock', 'Manipulation rooms / docks: n = 35/√V × fn  [per hour]'],
            ['dossat', 'Dossat table: average air changes per 24 h vs. volume × usage factor'],
            ['manual', 'Manual air changes per day (recommended minimum 2)']] }),
          ac.method === 'store' ? field(ac, 'f', 'Correction factor f', { hint: '1.0 normal; > 1 for heavy traffic' }) : null,
          ac.method === 'dock' ? field(ac, 'fn', 'Factor fn (number of open doors)') : null,
          ac.method === 'dossat' ? field(ac, 'usage', 'Usage', { type: 'select', options: Object.entries(D.usageFactors).map(([k, v]) => [k, v.name]) }) : null,
          ac.method === 'manual' ? field(ac, 'nManual', 'Air changes', { unit: 'per day' }) : null,
          field(ac, 'adj', 'Infiltrating air from', { type: 'select', rerender: true, options: [['ambient', 'Outdoor design air'], ['custom', 'Adjacent space']] }),
          ac.adj === 'custom' ? field(ac, 'tAdj', 'Adjacent temperature', { unit: '°C' }) : null,
          ac.adj === 'custom' ? field(ac, 'rhAdj', 'Adjacent RH', { unit: '%' }) : null),
          h('div', { class: 'outs' },
            kv('Air changes', out('infiltration.airChange.n', 2, ' /day')),
            kv('Infiltration load', out('infiltration.airChange.kWh', 0, ' kWh/day')),
            kv('Moisture (frost) load', out('infiltration.airChange.moisture', 1, ' kg/day'))),
          h('p', { class: 'help' }, 'Q = V · n · (h_out − h_in) / v_out. The Dossat table covers rooms up to 2 832 m³ (100 000 ft³); larger rooms are extrapolated — the door-opening method is preferred for large industrial rooms.')),
        ventSection(r));
    }
    return h('div', {}, methodSel,
      section('Door infiltration (Gosney & Olama)',
        h('p', { class: 'help' }, 'q = 0.221·A·(hᵢ − hᵣ)·ρᵣ·(1 − ρᵢ/ρᵣ)^0.5·(g·H)^0.5·Fm, then qₜ = q·Dₜ·Df·(1 − E). Air properties are calculated at the site pressure.'),
        cards, h('button', { class: 'btn ghost', onclick: () => { r.doors.push(M.newDoor()); changed(true); } }, '+ Add door')),
      ventSection(r));
  }

  function ventSection(r) {
    return section('Mechanical ventilation / fresh air', grid(
      field(r.ventilation, 'm3h', 'Outdoor air', { unit: 'm³/h', hint: 'Ripening rooms, CO₂ purge, occupied processing areas' }),
      field(r.ventilation, 'hours', 'Operation', { unit: 'h/day' })),
      h('div', { class: 'outs' }, kv('Ventilation load', out('infiltration.vent.kWh', 0, ' kWh/day'))));
  }

  function tabInternal(r) {
    const i = r.internal, e = r.equipment;
    return h('div', {},
      section('People', grid(
        field(i, 'people', 'Number of people'),
        field(i, 'peopleHours', 'Occupancy', { unit: 'h/day' })),
        h('div', { class: 'outs' }, kv('Heat per person (272 − 6·t)', out('internal.perPerson', 0, ' W')), kv('People load', out('internal.people', 1, ' kWh/day')))),
      section('Lighting', grid(
        field(i, 'lightsWm2', 'Lighting power density', { unit: 'W/m²', hint: 'LED high-bay ≈ 5–10 W/m²' }),
        field(i, 'lightsHours', 'Operation', { unit: 'h/day' })),
        h('div', { class: 'outs' }, kv('Lighting load', out('internal.lights', 1, ' kWh/day')))),
      section('Material handling & other equipment', grid(
        field(i, 'forklifts', 'Forklifts / reach trucks'),
        field(i, 'forkliftKW', 'Power per truck', { unit: 'kW' }),
        field(i, 'forkliftHours', 'Operation', { unit: 'h/day' }),
        field(i, 'otherKW', 'Other equipment (conveyors, heaters…)', { unit: 'kW' }),
        field(i, 'otherHours', 'Operation', { unit: 'h/day' })),
        h('div', { class: 'outs' }, kv('Forklifts', out('internal.forklifts', 1, ' kWh/day')), kv('Other', out('internal.other', 1, ' kWh/day')))),
      section('Evaporator fans', grid(
        field(e, 'fanMode', 'Method', { type: 'select', options: [['pct', 'Estimate as % of load'], ['kw', 'Specified motor power']], rerender: true }),
        e.fanMode === 'kw' ? field(e, 'fanKW', 'Total fan motor power', { unit: 'kW' }) : field(e, 'fanPct', 'Fan heat allowance', { unit: '%', hint: 'Typ. 5–10 % before coil selection' }),
        e.fanMode === 'kw' ? field(e, 'fanHours', 'Operation', { unit: 'h/day' }) : null),
        h('div', { class: 'outs' }, kv('Fan load', out('equipment.fans', 1, ' kWh/day')))),
      section('Defrost', grid(
        field(e, 'defrostKW', 'Defrost heat input', { unit: 'kW', hint: 'Electric heater kW or hot-gas equivalent; 0 for off-cycle' }),
        field(e, 'defrostPerDay', 'Defrosts', { unit: 'per day' }),
        field(e, 'defrostMin', 'Duration', { unit: 'min' }),
        field(e, 'defrostFrac', 'Heat released to room', { unit: '%', hint: 'Typ. 30–50 % of defrost heat' })),
        h('div', { class: 'outs' }, kv('Defrost load', out('equipment.defrost', 1, ' kWh/day')))));
  }

  function tabResults(r) {
    return h('div', {}, section('Calculation summary', h('div', { html: roomResultHTML(r, C.calcRoom(r, state.project)) })));
  }

  function roomResultHTML(r, res) {
    const rows = res.breakdown.filter((b) => Math.abs(b.kWh) > 0.05).map((b) =>
      `<tr><td>${b.label}</td><td class="num">${fmt(b.kWh, 0)}</td><td class="num">${fmt(b.kWh / 24, 2)}</td><td class="num">${fmt(res.subtotal ? b.kWh / res.subtotal * 100 : 0, 1)} %</td></tr>`).join('');
    const tr = res.transmission.items.map((s) => `<tr><td>${esc(s.label)}</td><td class="num">${fmt(s.A, 1)}</td><td class="num">${fmt(s.U, 3)}</td><td class="num">${fmt(s.To, 1)}</td><td class="num">${fmt(s.dT, 1)}</td><td class="num">${fmt(s.kW, 2)}</td></tr>`).join('');
    const pr = res.product.items.map((p) => `<tr><td>${esc(p.label)}</td><td class="num">${fmt(p.mass, 0)}</td><td class="num">${fmt(p.T1, 1)} → ${fmt(p.T2, 1)}</td><td class="num">${fmt(p.qkg, 1)}</td><td class="num">${fmt(p.pull, 0)}</td><td class="num">${fmt(p.kWh, 0)}</td></tr>`).join('');
    const dr = res.infiltration.items.map((d) => `<tr><td>${esc(d.label)}</td><td class="num">${fmt(d.A, 1)}</td><td class="num">${fmt(d.qOpen, 1)}</td><td class="num">${fmt(d.openH, 2)}</td><td class="num">${fmt(d.Df, 2)}</td><td class="num">${fmt(d.E, 2)}</td><td class="num">${fmt(d.kWh, 0)}</td></tr>`).join('');
    return `
      <div class="kpis">
        <div class="kpi main"><span>Required capacity</span><b>${fmt(res.capacity, 1)} kW</b><small>${fmt(C.units.toTR(res.capacity), 1)} TR · ${fmt(C.units.toBtuh(res.capacity), 0)} Btu/h · ${fmt(C.units.toKcalh(res.capacity), 0)} kcal/h</small></div>
        <div class="kpi"><span>Daily load incl. safety</span><b>${fmt(res.total, 0)} kWh/day</b><small>run time ${fmt(res.runHours, 0)} h/day</small></div>
        <div class="kpi"><span>Suggested SST</span><b>${fmt(res.sst, 1)} °C</b><small>TD ${fmt(res.TD, 1)} K at ${fmt(+r.cond.RH, 0)} % RH</small></div>
        <div class="kpi"><span>Load density</span><b>${fmt(res.loadDensity, 1)} W/m³</b><small>frost ${fmt(res.frostKgDay, 1)} kg/day</small></div>
      </div>
      <p class="meta">Rule-of-thumb check: room load excluding product = <b>${fmt(res.kcalM3Day, 0)} kcal/m³·day</b> (typical ${res.volume <= 2000 ? '200–400 for rooms up to 2 000 m³' : '≈ 200 for rooms above 2 000 m³'})${res.coilArea ? ` · air cooler surface ≈ <b>${fmt(res.coilArea, 0)} m²</b> at K = ${fmt(+r.evap.K, 0)} W/m²K, LMTD ${fmt(+r.evap.lmtd, 1)} K` : ''}${res.infiltration.airChange ? ` · infiltration by air change: ${fmt(res.infiltration.airChange.n, 2)} /day (${esc(res.infiltration.airChange.basis)})${res.infiltration.airChange.extrapolated ? ' — extrapolated beyond table' : ''}` : ''}</p>
      <p class="meta">${esc(r.name)} — ${fmt(+r.dims.L, 1)} × ${fmt(+r.dims.W, 1)} × ${fmt(+r.dims.H, 1)} m (${fmt(res.volume, 0)} m³) at ${fmt(+r.cond.T, 1)} °C / ${fmt(+r.cond.RH, 0)} % RH</p>
      <table class="rtable"><thead><tr><th>Load component</th><th class="num">kWh/day</th><th class="num">avg kW</th><th class="num">share</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td>Subtotal</td><td class="num">${fmt(res.subtotal, 0)}</td><td class="num">${fmt(res.subtotal / 24, 2)}</td><td></td></tr>
        <tr><td>Safety factor ${fmt(res.safety, 0)} %</td><td class="num">${fmt(res.safetyKWh, 0)}</td><td></td><td></td></tr>
        <tr class="grand"><td>Total refrigeration load</td><td class="num">${fmt(res.total, 0)}</td><td class="num"></td><td></td></tr>
        <tr class="grand"><td>Capacity = total ÷ ${fmt(res.runHours, 0)} h</td><td class="num" colspan="2">${fmt(res.capacity, 1)} kW</td><td></td></tr>
      </tfoot></table>
      <h4>Transmission</h4>
      <table class="rtable"><thead><tr><th>Surface</th><th class="num">A m²</th><th class="num">U W/m²K</th><th class="num">T out °C</th><th class="num">ΔT K</th><th class="num">kW</th></tr></thead><tbody>${tr}</tbody></table>
      ${pr ? `<h4>Product</h4><table class="rtable"><thead><tr><th>Product</th><th class="num">kg/day</th><th class="num">°C</th><th class="num">kJ/kg</th><th class="num">pull-down h</th><th class="num">kWh/day</th></tr></thead><tbody>${pr}</tbody></table>` : ''}
      ${dr ? `<h4>Door infiltration</h4><table class="rtable"><thead><tr><th>Door</th><th class="num">A m²</th><th class="num">q open kW</th><th class="num">open h/day</th><th class="num">Df</th><th class="num">E</th><th class="num">kWh/day</th></tr></thead><tbody>${dr}</tbody></table>` : ''}
      ${r.notes ? `<h4>Notes</h4><p>${esc(r.notes)}</p>` : ''}`;
  }

  /* ---------- machinery room ventilation (IIAR 2) ---------- */
  function viewMachinery() {
    const V = window.HLVent, p = state.project;
    p.machinery = p.machinery || [];
    if (!p.machinery.length) p.machinery.push(V.newMachineryRoom());
    state.mr = Math.min(state.mr || 0, p.machinery.length - 1);
    const m = p.machinery[state.mr];
    const yn = [['yes', 'Yes'], ['no', 'No']];
    const colors = [['none', 'N/A'], ['light', 'Light'], ['medium', 'Medium'], ['dark', 'Dark']];
    const tabs = h('div', { class: 'tabs' }, p.machinery.map((x, i) => h('button', { class: 'tab' + (i === state.mr ? ' active' : ''), onclick: () => { state.mr = i; renderMain(); refresh(); } }, x.name || `Machinery room ${i + 1}`)),
      h('button', { class: 'tab', onclick: () => { p.machinery.push(V.newMachineryRoom()); state.mr = p.machinery.length - 1; changed(true); } }, '+ Add'));
    const envRows = m.surfaces.map((sf) => h('tr', {}, h('th', {}, sf.label),
      h('td', {}, cell(sf, 'sunlit', { type: 'select', options: yn })), h('td', {}, cell(sf, 'area', {})),
      h('td', {}, cell(sf, 'U', {})), h('td', {}, cell(sf, 'color', { type: 'select', options: colors }))));
    const motorRows = m.motors.map((mo, i) => h('tr', {},
      h('td', {}, cell(mo, 'name', { type: 'text' })), h('td', {}, cell(mo, 'kW', {})), h('td', {}, cell(mo, 'eff', {})),
      h('td', {}, h('input', { type: 'checkbox', checked: mo.standby, onchange: (e) => { mo.standby = e.target.checked; changed(); } })),
      h('td', {}, h('button', { class: 'mini danger', onclick: () => { m.motors.splice(i, 1); changed(true); } }, '×'))));
    return h('div', { class: 'view' },
      h('div', { class: 'roomhead' }, h('h2', {}, 'Machinery room ventilation'),
        h('div', { class: 'roomactions' }, h('button', { class: 'mini danger', onclick: () => { if (confirm('Delete this machinery room?')) { p.machinery.splice(state.mr, 1); state.mr = 0; changed(true); } } }, 'Delete'))),
      h('p', { class: 'help' }, 'Normal (temperature control), continuous and emergency ventilation rates for refrigeration machinery rooms, per the code in force — following the IIAR Machinery Room Ventilation Analysis Tool.'),
      tabs,
      section('Room & code basis', grid(
        field(m, 'name', 'Machinery room name', { type: 'text', rerender: false }),
        field(m, 'code', 'Code / standard in force', { type: 'select', options: Object.entries(V.codes).map(([k, v]) => [k, v.name]) }),
        field(m, 'refrigerant', 'Refrigerant', { type: 'select', options: [['ammonia', 'Ammonia (R717)'], ['other', 'Other (non-ammonia)']] }),
        field(m, 'L', 'Length', { unit: 'm' }), field(m, 'W', 'Width', { unit: 'm' }), field(m, 'H', 'Height', { unit: 'm' }),
        field(m, 'chargeKg', 'Refrigerant charge (largest system)', { unit: 'kg' }),
        field(m, 'occupants', 'Design occupancy', { unit: 'persons' }),
        field(m, 'basement', 'Machinery room in a basement?', { type: 'select', options: yn }))),
      section('Detection', grid(
        field(m, 'detector', 'Detector activates ventilation & supervised alarm?', { type: 'select', options: yn }),
        field(m, 'maxSetpoint', 'Maximum setpoint allowed by code', { unit: 'ppm', hint: 'IIAR 2: ≤ TLV-TWA (25 ppm) normal; ≤ 1000 ppm emergency' }),
        field(m, 'setpoint', 'Setpoint activating ventilation', { unit: 'ppm' }))),
      section('Weather', grid(
        field(m, 'toaC', 'Outdoor design dry-bulb (1 % ASHRAE)', { unit: '°C' }),
        field(m, 'tsaC', 'Supply (make-up) air temperature', { unit: '°C' }))),
      section('Sun-lit envelope', h('div', { class: 'tablewrap' }, h('table', { class: 'grid-table' },
        h('thead', {}, h('tr', {}, ['Surface', 'Sun-lit?', 'Area m²', 'U W/m²K', 'Colour'].map((t) => h('th', {}, t)))), h('tbody', {}, envRows)))),
      section('Motors in the machinery room', h('p', { class: 'help' }, 'Heat to room = motor shaft power × (1 − efficiency). Standby machines are excluded.'),
        h('div', { class: 'tablewrap' }, h('table', { class: 'grid-table' },
          h('thead', {}, h('tr', {}, ['Equipment', 'Power kW', 'Efficiency %', 'Standby', ''].map((t) => h('th', {}, t)))), h('tbody', {}, motorRows))),
        h('button', { class: 'btn ghost', onclick: () => { m.motors.push({ name: 'Motor', kW: 10, eff: 92, standby: false }); changed(true); } }, '+ Add motor')),
      section('Installed ventilation (optional — for compliance check)', grid(
        field(m.installed, 'normal', 'Installed normal exhaust', { unit: 'm³/h' }),
        field(m.installed, 'continuous', 'Installed continuous exhaust', { unit: 'm³/h' }),
        field(m.installed, 'emergency', 'Installed emergency exhaust', { unit: 'm³/h' }))),
      section('Required ventilation rates', h('div', { id: 'mrResults' })));
  }

  function machineryResultHTML(m) {
    const r = window.HLVent.calcMachineryRoom(m);
    const modeRows = (label, x) => {
      const status = x.ok == null ? '' : (x.ok ? '<span class="pass">✔ installed OK</span>' : '<span class="fail">✘ installed insufficient</span>');
      return `<tr class="grand"><td>${label}</td><td>${esc(x.design.basis)}</td><td class="num">${fmt(x.design.m3h, 0)}</td><td class="num">${fmt(x.design.ls, 0)}</td><td class="num">${fmt(x.design.cfm, 0)}</td><td class="num">${fmt(x.design.ach, 1)}</td><td>${status}</td></tr>` +
        x.rows.map((rw) => `<tr><td></td><td class="muted">${esc(rw.basis)}</td><td class="num">${Number.isFinite(rw.m3h) ? fmt(rw.m3h, 0) : 'n/a'}</td><td class="num">${Number.isFinite(rw.ls) ? fmt(rw.ls, 0) : ''}</td><td class="num">${Number.isFinite(rw.cfm) ? fmt(rw.cfm, 0) : ''}</td><td class="num">${Number.isFinite(rw.ach) ? fmt(rw.ach, 1) : ''}</td><td></td></tr>`).join('');
    };
    return `
      <div class="kpis">
        <div class="kpi main"><span>Emergency ventilation</span><b>${fmt(r.emergency.design.m3h, 0)} m³/h</b><small>${fmt(r.emergency.design.cfm, 0)} cfm · ${fmt(r.emergency.design.ach, 1)} ACH</small></div>
        <div class="kpi"><span>Normal ventilation</span><b>${fmt(r.normal.design.m3h, 0)} m³/h</b><small>${fmt(r.normal.design.ach, 1)} ACH</small></div>
        <div class="kpi"><span>Continuous ventilation</span><b>${fmt(r.continuous.design.m3h, 0)} m³/h</b><small>${fmt(r.continuous.design.ach, 1)} ACH</small></div>
        <div class="kpi"><span>Room heat load</span><b>${fmt(r.heatKW, 1)} kW</b><small>motors ${fmt(r.motorKW, 1)} · envelope ${fmt(r.envKW, 1)} kW</small></div>
      </div>
      <p class="meta">${esc(m.name)} — ${esc(r.codeName)} · ${fmt(r.areaM2, 0)} m², ${fmt(r.volM3, 0)} m³ · max room temperature ${fmt(r.tmrC, 1)} °C</p>
      <div class="tablewrap"><table class="rtable"><thead><tr><th>Mode</th><th>Basis</th><th class="num">m³/h</th><th class="num">L/s</th><th class="num">cfm</th><th class="num">ACH</th><th></th></tr></thead><tbody>
      ${modeRows('Normal', r.normal)}${modeRows('Continuous', r.continuous)}${modeRows('Emergency', r.emergency)}
      </tbody></table></div>
      <h4>Design requirements & checks</h4><ul class="notes">${r.checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`;
  }

  function viewSummary() {
    const pr = C.calcProject(state.project);
    const rows = pr.rooms.map(({ room: r, res }) => h('tr', { class: 'click', onclick: () => { state.view = 'room'; state.roomId = r.id; state.tab = 'results'; render(); } },
      h('td', {}, r.name), h('td', { class: 'num' }, fmt(+r.cond.T, 1)), h('td', { class: 'num' }, fmt(res.volume, 0)),
      h('td', { class: 'num' }, fmt(res.total, 0)), h('td', { class: 'num' }, fmt(res.runHours, 0)),
      h('td', { class: 'num strong' }, fmt(res.capacity, 1)), h('td', { class: 'num' }, fmt(C.units.toTR(res.capacity), 1)),
      h('td', { class: 'num' }, fmt(r.sstOverride !== '' ? +r.sstOverride : Math.round(res.sst), 0))));
    const levels = pr.levels.map((l) => h('tr', {}, h('td', {}, fmt(l.sst, 0) + ' °C'), h('td', {}, l.rooms.join(', ')), h('td', { class: 'num strong' }, fmt(l.kW, 1)), h('td', { class: 'num' }, fmt(C.units.toTR(l.kW), 1))));
    return h('div', { class: 'view' },
      h('h2', {}, 'Plant summary'),
      section('Rooms', h('div', { class: 'tablewrap' }, h('table', { class: 'rtable' },
        h('thead', {}, h('tr', {}, ['Room', 'T °C', 'Vol m³', 'kWh/day', 'Run h', 'kW', 'TR', 'SST °C'].map((t, i) => h('th', { class: i ? 'num' : '' }, t)))),
        h('tbody', {}, rows),
        h('tfoot', {}, h('tr', { class: 'grand' }, h('td', { colspan: 5 }, 'Total connected refrigeration load'), h('td', { class: 'num' }, fmt(pr.totalKW, 1)), h('td', { class: 'num' }, fmt(C.units.toTR(pr.totalKW), 1)), h('td')))))),
      section('Compressor load per suction level', h('p', { class: 'help' }, 'Sum of room capacities at each saturated suction temperature, for compressor and pipe sizing. Add suction-line heat gain, pump heat (liquid overfeed) and a diversity factor as appropriate; for two-stage/cascade systems the high stage also absorbs the low-stage compressor heat.'),
        h('div', { class: 'tablewrap' }, h('table', { class: 'rtable' },
          h('thead', {}, h('tr', {}, h('th', {}, 'SST'), h('th', {}, 'Rooms'), h('th', { class: 'num' }, 'kW'), h('th', { class: 'num' }, 'TR'))),
          h('tbody', {}, levels)))));
  }

  function viewMethod() {
    return h('div', { class: 'view method', html: METHOD_HTML });
  }

  const METHOD_HTML = `
    <h2>Method &amp; standards</h2>
    <section class="card"><h3>Calculation basis</h3>
    <p>The refrigeration load follows the component method of the <b>ASHRAE Handbook—Refrigeration, chapter “Refrigerated-Facility Loads”</b>, which is the same approach presented in <b>Stoecker, <i>Industrial Refrigeration Handbook</i></b> and <b>Dossat, <i>Principles of Refrigeration</i></b>. Loads are summed as energy per 24 h and converted to equipment capacity using the compressor run time.</p>
    <ol>
      <li><b>Transmission</b> — Q = U·A·ΔT, U = 1/(1/hᵢ + ΣL/k + 1/hₒ), hᵢ = 9.4, hₒ = 34 W/m²K. Sun-effect allowance added for exposed walls/roofs. Floors use the ground/heated-slab temperature.</li>
      <li><b>Product</b> — Q = m·[c<sub>p,a</sub>(T₁−T<sub>f</sub>) + h<sub>if</sub> + c<sub>p,b</sub>(T<sub>f</sub>−T₂)], with Siebel’s c<sub>p,a</sub> = 3.35x<sub>w</sub>+0.84, c<sub>p,b</sub> = 1.26x<sub>w</sub>+0.84, h<sub>if</sub> = 334x<sub>w</sub> kJ/kg; expressed per 24 h as Q·24/pull-down time. Plus packaging sensible heat and heat of respiration for fresh produce.</li>
      <li><b>Infiltration</b> — Gosney &amp; Olama: q = 0.221·A·(hᵢ−hᵣ)·ρᵣ·(1−ρᵢ/ρᵣ)<sup>0.5</sup>·(gH)<sup>0.5</sup>·F<sub>m</sub>, F<sub>m</sub> = [2/(1+(ρᵣ/ρᵢ)<sup>1/3</sup>)]<sup>1.5</sup>; q<sub>t</sub> = q·D<sub>t</sub>·D<sub>f</sub>·(1−E). Moist-air properties from ASHRAE Fundamentals psychrometric equations at site pressure. Alternatively the <b>air-change method</b>: Q = V·n·Δh, with n from Dossat’s table (average air changes per 24 h vs. volume, × usage factor), 70/√V × f per day for storage rooms, 35/√V × fn per hour for docks/manipulation rooms, or a manual value.</li>
      <li><b>Internal</b> — people 272 − 6t W/person (matches Dossat’s occupancy table); lighting; forklifts and other equipment at their operating hours.</li>
      <li><b>Equipment related</b> — evaporator fan motor heat and the fraction of defrost heat released into the room.</li>
      <li><b>Capacity</b> — (Σ loads × (1 + safety factor)) ÷ run time (h/day).</li>
      <li><b>Machinery-room ventilation</b> — IIAR 2-2008 Add. A §13.3: normal = max(20 ACH, flow limiting the room to 40 °C with 1 % design inlet air, Q = q/(1.08·ΔT) cfm); emergency = 30 ACH; ≥ 20 ACH after single-fan failure. Older editions / other codes: 100·√G cfm (G in lb), 0.5 cfm/ft², 20 cfm/person.</li>
    </ol></section>
    <section class="card"><h3>Standards referenced</h3>
    <ul class="notes">
      <li><b>ASHRAE Handbook—Refrigeration</b>: Refrigerated-Facility Loads; Thermal Properties of Foods; Commodity Storage Requirements; Refrigerated-Facility Design.</li>
      <li><b>ASHRAE Handbook—Fundamentals</b>: Psychrometrics; Climatic Design Information (outdoor design conditions).</li>
      <li><b>Stoecker, W.F., Industrial Refrigeration Handbook</b> (McGraw-Hill).</li>
      <li><b>Dossat, R.J., Principles of Refrigeration</b> — cooling-load calculations, air-change tables, product and miscellaneous loads.</li>
      <li><b>IIAR Machinery Room Ventilation Analysis Tool</b> — normal/continuous/emergency ventilation rules per IIAR 2 edition, IMC, ASHRAE 15, UMC/CMC.</li>
      <li><b>ANSI/IIAR 2</b> — Standard for Safe Design of Closed-Circuit Ammonia Refrigeration Systems.</li>
      <li><b>ANSI/IIAR 9</b> — Minimum Safety Criteria for a Safe Ammonia Refrigeration System; <b>IIAR 4/5/6/7</b> for installation, start-up, inspection/maintenance and operating procedures.</li>
      <li><b>ASHRAE 15 / ISO 5149 / EN 378</b> — safety standards for halocarbon and CO₂ systems.</li>
    </ul>
    <p class="help">IIAR standards govern the safe design, installation and operation of ammonia systems; they do not prescribe a heat-load method. The load method above is the one used by IIAR-aligned practice and the IIAR/ASHRAE handbooks.</p></section>
    <section class="card"><h3>Good-practice checks</h3>
    <ul class="notes">
      <li>Rooms below 0 °C need under-floor heating or ventilation to prevent frost heave; set the ground temperature to the heater set-point.</li>
      <li>Place the vapour retarder on the warm side of the insulation; check panel joints and pipe penetrations.</li>
      <li>Select evaporator TD for the required RH; high-RH produce rooms need low TD (4–5 K).</li>
      <li>Use an anteroom/vestibule or rapid-roll doors for freezers with frequent traffic; the frost load shown helps size defrost frequency.</li>
      <li>Add suction-line heat gain, liquid pump heat and hot-gas defrost load when sizing compressors for each suction level.</li>
    </ul></section>`;

  /* ---------- live results panel ---------- */
  const COLORS = { transmission: '#2f6fdf', product: '#0f9d8a', packaging: '#6bbfb1', respiration: '#7cb342', infiltration: '#e6892d', ventilation: '#f2b35c', people: '#9c6ade', lights: '#c79bf2', forklifts: '#d64f6a', other: '#e8899b', fans: '#6d7a8c', defrost: '#9fb0c3' };

  function renderLive() {
    const panel = document.getElementById('liveResults');
    const r = room();
    if (state.view !== 'room' || !r) {
      const pr = C.calcProject(state.project);
      panel.innerHTML = `<div class="live"><span class="lbl">Plant total</span><b class="big">${fmt(pr.totalKW, 1)} kW</b><small>${fmt(C.units.toTR(pr.totalKW), 1)} TR · ${state.project.rooms.length} rooms</small>
        <ul class="levels">${pr.levels.map((l) => `<li><span>SST ${fmt(l.sst, 0)} °C</span><b>${fmt(l.kW, 1)} kW</b></li>`).join('')}</ul></div>`;
      return;
    }
    const res = C.calcRoom(r, state.project);
    const max = Math.max(...res.breakdown.map((b) => b.kWh), 1);
    panel.innerHTML = `<div class="live">
      <span class="lbl">Required capacity</span>
      <b class="big">${fmt(res.capacity, 1)} kW</b>
      <small>${fmt(C.units.toTR(res.capacity), 1)} TR · ${fmt(C.units.toBtuh(res.capacity) / 1000, 0)} kBtu/h</small>
      <div class="chips"><span>SST ${fmt(res.sst, 1)} °C</span><span>${fmt(res.total, 0)} kWh/day</span><span>${fmt(res.runHours, 0)} h run</span></div>
      <ul class="bars">${res.breakdown.filter((b) => b.kWh > 0.05).map((b) => `
        <li><div class="bl"><span>${b.label}</span><span>${fmt(b.kWh / res.subtotal * 100, 0)} %</span></div>
        <div class="track"><div class="fill" style="width:${Math.max(1, b.kWh / max * 100)}%;background:${COLORS[b.key]}"></div></div></li>`).join('')}
      </ul>
      <button class="btn ghost block" id="gotoResults">Full results →</button></div>`;
    panel.querySelector('#gotoResults').onclick = () => { state.tab = 'results'; renderMain(); refresh(); };
  }

  function refresh() {
    const r = room();
    if (state.view === 'room' && r) {
      const res = C.calcRoom(r, state.project);
      res._floor = (+r.dims.L || 0) * (+r.dims.W || 0);
      res._trKW = res.transmission.items.reduce((a, s) => a + s.kW, 0);
      document.querySelectorAll('#main [data-out]').forEach((el) => {
        el.textContent = fmt(getPath(res, el.dataset.out), +el.dataset.fmt) + (el.dataset.unit || '');
      });
      if (state.tab === 'results') { const s = document.querySelector('#main .card > div'); if (s) s.innerHTML = roomResultHTML(r, res); }
    }
    if (state.view === 'machinery') {
      const el = document.getElementById('mrResults');
      const m = (state.project.machinery || [])[state.mr || 0];
      if (el && m) el.innerHTML = machineryResultHTML(m);
    }
    renderLive();
    renderSidebar();
  }

  function render() { renderMain(); refresh(); }

  /* ---------- room actions ---------- */
  function addRoom() {
    const r = M.newRoom('chiller', 'Room ' + (state.project.rooms.length + 1));
    r.safety = state.project.design.safetyFactor;
    state.project.rooms.push(r);
    state.view = 'room'; state.roomId = r.id; state.tab = 'general';
    changed(true);
  }
  function duplicateRoom(r) {
    const c = JSON.parse(JSON.stringify(r));
    c.id = M.uid(); c.name = r.name + ' (copy)';
    state.project.rooms.splice(state.project.rooms.indexOf(r) + 1, 0, c);
    state.roomId = c.id;
    changed(true);
  }
  function deleteRoom(r) {
    if (!confirm(`Delete room "${r.name}"?`)) return;
    const rs = state.project.rooms;
    rs.splice(rs.indexOf(r), 1);
    state.roomId = rs[0] && rs[0].id;
    if (!rs.length) state.view = 'project';
    changed(true);
  }

  /* ---------- report ---------- */
  function buildReport() {
    const p = state.project, pr = C.calcProject(p);
    const i = p.info, d = p.design;
    document.getElementById('report').innerHTML = `
      <div class="rep-head"><h1>Refrigeration Heat Load Calculation</h1>
      <table class="rep-info"><tr><td>Project</td><td>${esc(i.name)}</td><td>Client</td><td>${esc(i.client)}</td></tr>
      <tr><td>Location</td><td>${esc(i.location)}</td><td>Prepared by</td><td>${esc(i.engineer)}</td></tr>
      <tr><td>Date</td><td>${esc(i.date)}</td><td>Revision</td><td>${esc(i.rev)}</td></tr>
      <tr><td>Outdoor design</td><td>${fmt(+d.ambientDB, 1)} °C DB / ${fmt(+d.ambientRH, 0)} % RH, ${fmt(+d.altitude, 0)} m</td><td>Refrigerant</td><td>${esc(d.refrigerant)}</td></tr></table>
      <p class="small">Method: ASHRAE Handbook—Refrigeration “Refrigerated-Facility Loads” / Stoecker Industrial Refrigeration Handbook. Ammonia systems to ANSI/IIAR 2.</p></div>
      <h2>Plant summary</h2>
      <table class="rtable"><thead><tr><th>Room</th><th class="num">T °C</th><th class="num">kWh/day</th><th class="num">kW</th><th class="num">TR</th><th class="num">SST °C</th></tr></thead><tbody>
      ${pr.rooms.map(({ room: r, res }) => `<tr><td>${esc(r.name)}</td><td class="num">${fmt(+r.cond.T, 1)}</td><td class="num">${fmt(res.total, 0)}</td><td class="num">${fmt(res.capacity, 1)}</td><td class="num">${fmt(C.units.toTR(res.capacity), 1)}</td><td class="num">${fmt(r.sstOverride !== '' ? +r.sstOverride : Math.round(res.sst), 0)}</td></tr>`).join('')}
      </tbody><tfoot><tr class="grand"><td colspan="3">Total</td><td class="num">${fmt(pr.totalKW, 1)}</td><td class="num">${fmt(C.units.toTR(pr.totalKW), 1)}</td><td></td></tr></tfoot></table>
      <table class="rtable"><thead><tr><th>Suction level</th><th>Rooms</th><th class="num">kW</th></tr></thead><tbody>
      ${pr.levels.map((l) => `<tr><td>${fmt(l.sst, 0)} °C</td><td>${esc(l.rooms.join(', '))}</td><td class="num">${fmt(l.kW, 1)}</td></tr>`).join('')}</tbody></table>
      ${pr.rooms.map(({ room: r, res }) => `<div class="rep-room"><h2>${esc(r.name)}</h2>${roomResultHTML(r, res)}</div>`).join('')}
      ${(p.machinery || []).map((m) => `<div class="rep-room"><h2>Machinery room ventilation — ${esc(m.name)}</h2>${machineryResultHTML(m)}</div>`).join('')}`;
  }

  /* ---------- wiring ---------- */
  document.querySelectorAll('.sidebar [data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; render(); }));
  document.getElementById('btnAddRoom').onclick = addRoom;
  document.getElementById('btnNew').onclick = () => {
    if (!confirm('Start a new empty project? Unsaved changes will be lost (use Save first).')) return;
    state.project = M.newProject(); state.view = 'project'; state.roomId = null; changed(true);
  };
  document.getElementById('btnExample').onclick = () => {
    if (!confirm('Replace the current project with the example project?')) return;
    state.project = M.exampleProject(); state.roomId = state.project.rooms[0].id; state.view = 'room'; state.tab = 'general'; changed(true);
  };
  document.getElementById('btnSave').onclick = () => {
    const blob = new Blob([JSON.stringify(state.project, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: (state.project.info.name || 'project').replace(/[^\w\-]+/g, '_') + '.coldload.json' });
    document.body.append(a); a.click(); a.remove();
  };
  document.getElementById('fileOpen').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => {
      const p = JSON.parse(t);
      if (!p || !Array.isArray(p.rooms)) throw new Error('Not a ColdLoad project file');
      state.project = p; state.roomId = p.rooms[0] && p.rooms[0].id; state.view = p.rooms.length ? 'room' : 'project'; state.tab = 'general';
      changed(true);
    }).catch((err) => alert('Could not open file: ' + err.message));
    e.target.value = '';
  };
  document.getElementById('btnReport').onclick = () => { buildReport(); window.print(); };
  window.addEventListener('beforeprint', buildReport);

  render();
})();
