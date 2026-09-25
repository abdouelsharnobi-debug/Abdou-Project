/*
 * Engineering report (print/PDF HTML) and structured exports (XLSX sheets, CSV rows).
 * ctx = { project, data, revision?, revisions[], company, customer, user, settings,
 *         messages[], refs[], version, calc, vent, explain, D, M, units }
 */
(function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f = (v, d = 1) => (Number.isFinite(v) ? (+v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');
  const img = (src, cls) => (src && /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/.test(src) ? `<img class="${cls}" src="${src}" alt="">` : '');

  function computeAll(ctx) {
    const { data, calc, vent } = ctx;
    const pr = calc.calcProject(data);
    const mr = (data.machinery || []).map((m) => ({ m, r: vent.calcMachineryRoom(m) }));
    return { pr, mr };
  }

  // Right-align a column only when every body cell in it is numeric.
  const isNum = (c) => /^[\s]*[-–−+]?[\d][\d.,\s]*(\s?(%|kW|kWh\/day|TR|m³\/h|°C|\(.*\)))?\s*$|^[\s]*[–-][\s]*$/.test(String(c).replace(/<[^>]+>/g, ''));
  const table = (head, rows, cls = 'rtable') => {
    const numCol = head.map((_, i) => i > 0 && rows.length > 0 && rows.every((r) => r[i] == null || r[i] === '' || isNum(r[i])));
    return `<table class="${cls}"><thead><tr>${head.map((h, i) => `<th${numCol[i] ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${numCol[i] ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };

  function buildReport(ctx) {
    const { project: P, data, revision, revisions = [], company = {}, customer = {}, user = {}, settings = {}, messages = [], refs = [], version: V, explain, D, M, units: U } = ctx;
    const { pr, mr } = computeAll(ctx);
    const rs = settings.reports || {};
    const title = rs.calcTitle || 'Refrigeration Heat Load Calculation';
    const rev = revision ? revision.rev : 'WIP';
    const now = new Date();
    const pw = (kW) => `${f(kW, 1)} kW${U && U.get().power !== 'kW' ? ` (${f(U.pw(kW), U.pwDigits())} ${U.pwLabel()})` : ''}`;
    const docNo = `${P.projectNo || P.id.slice(0, 8)}-HL-R${rev}`;
    const status = revision ? revision.review.status : 'Working copy (not a revision)';
    const errors = messages.filter((m) => m.level === 'error'), warns = messages.filter((m) => m.level === 'warning');

    const trace = [
      ['Document number', esc(docNo)], ['Project ID', esc(P.id)], ['Revision', esc(rev)], ['Revision status', esc(status)],
      ['Calculation date', esc((revision ? revision.createdAt : now.toISOString()).replace('T', ' ').slice(0, 16) + ' UTC')],
      ['Prepared by (user)', esc(revision ? revision.createdBy : (user.displayName || user.username || ''))],
      ['Application version', esc(`${V.APP_NAME} ${V.APP_VERSION}`)],
      ['Calculation engine version', esc(revision && revision.engineVersion && revision.engineVersion !== V.ENGINE_VERSION ? `${V.ENGINE_VERSION} (this report) — revision recorded with engine ${revision.engineVersion}` : V.ENGINE_VERSION)],
      ['Input dataset version', esc(revision ? revision.dataVersion : V.INPUT_DATA_VERSION)],
      ['Validation at print', `${errors.length} error(s), ${warns.length} warning(s)`],
    ];

    const sections = [];
    const sec = (id, h, body) => sections.push({ id, h, body });

    sec('info', 'Project information', `<table class="kvt">${[
      ['Project name', P.name], ['Project number', P.projectNo], ['Customer', customer.name], ['End user', P.endUser], ['Consultant', P.consultant],
      ['Contractor', P.contractor], ['Site', P.site], ['City / country', [P.city, P.country].filter(Boolean).join(', ')], ['Project type', P.type],
      ['Status', P.status], ['Created', `${(P.createdAt || '').slice(0, 10)} by ${P.createdBy || ''}`], ['Modified', `${(P.modifiedAt || '').slice(0, 10)} by ${P.modifiedBy || ''}`],
    ].map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v || '—')}</td></tr>`).join('')}</table>${P.notes ? `<p>${esc(P.notes)}</p>` : ''}`);

    const d = data.design;
    sec('criteria', 'Design criteria', `<table class="kvt">${[
      ['Outdoor design dry-bulb', `${f(+d.ambientDB, 1)} °C`], ['Coincident relative humidity', `${f(+d.ambientRH, 0)} %`], ['Site altitude', `${f(+d.altitude || 0, 0)} m`],
      ['Ground / under-floor temperature', `${f(+d.groundTemp, 1)} °C`], ['Default safety factor', `${f(+d.safetyFactor, 0)} %`], ['Refrigerant / system', d.refrigerant],
      ['Weather data source', d.climateSource || 'Entered by user'],
      ['Heat loss to colder surroundings', d.heatLossCredit === 'none' ? 'Not credited (conservative)' : 'Credited'],
    ].map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
    ${table(['Room', 'Application', 'L×W×H [m]', 'T [°C]', 'RH [%]', 'Run [h/day]', 'TD [K]', 'Safety [%]'], data.rooms.map((r) => [esc(r.name), esc((D.roomTypes[r.type] || {}).name || r.type), `${f(+r.dims.L, 1)} × ${f(+r.dims.W, 1)} × ${f(+r.dims.H, 1)}`, f(+r.cond.T, 1), f(+r.cond.RH, 0), f(+r.runHours, 0), f(+r.TD, 1), f(+r.safety, 0)]))}`);

    const asm = explain.assumptions(data, D, M);
    const kindLabel = { default: 'Default', database: 'Database', user: 'User-selected', override: 'Overridden', note: 'Engineering note' };
    sec('assumptions', 'Engineering assumptions', table(['Scope', 'Item', 'Value', 'Type', 'Basis'], asm.map((a) => [esc(a.scope), esc(a.item), esc(a.value), esc(kindLabel[a.kind] || a.kind), esc(a.basis)])));

    sec('inputs', 'Input data', data.rooms.map((r) => {
      const surf = table(['Surface', 'Adjacent', 'T adj [°C]', 'Insulation', 'Thk [mm]', 'Sun', 'Area ovr', 'U ovr'], r.surfaces.map((s) => [esc(s.label), esc(s.adj), esc(s.adj === 'ambient' ? 'design DB' : s.tAdj), esc(s.ins), esc(s.thk), esc(s.adj === 'ambient' ? s.sun : '—'), esc(s.areaOverride || '—'), esc(s.uOverride || '—')]));
      const prod = r.products.length ? table(['Product', 'kg/day', 'T in → out [°C]', 'Pull-down [h]', 'x_w [%]', 'T_f [°C]', 'Pack.', 'Stored [kg]', 'Resp. [W/t]'], r.products.map((p) => { const ref = D.products.find((x) => x.id === p.productId) || {}; return [esc(p.name || ref.name), f(+p.mass, 0), `${esc(p.tIn)} → ${esc(p.tOut)}`, esc(p.pullDown), esc(p.xw !== '' ? p.xw : ref.xw), esc(p.Tf !== '' ? p.Tf : ref.Tf), `${esc(p.packPct)} % ${esc(p.packType)}`, f(+p.stored || 0, 0), esc(p.resp !== '' ? p.resp : ref.resp)]; })) : '<p class="muted">No product.</p>';
      const inf = r.infMethod === 'airchange' ? `<p>Infiltration: air-change method (${esc(r.airChange.method)}).</p>` : (r.doors.length ? table(['Door', 'W×H [m]', 'Opens to', 'Passages/day', 'Open–close [s]', 'Stand open [min/day]', 'Protection', 'D_f'], r.doors.map((x) => [esc(x.name), `${esc(x.w)} × ${esc(x.h)}`, esc(x.adj === 'ambient' ? 'Outdoor' : `${x.tAdj} °C / ${x.rhAdj} %`), esc(x.passages), esc(x.openSec), esc(x.standMin), esc(x.protection === 'custom' ? `E=${x.E}` : x.protection), esc(x.Df || 'auto')])) : '<p class="muted">No doors.</p>');
      const i = r.internal, e = r.equipment;
      const intl = `<p>People ${esc(i.people)} × ${esc(i.peopleHours)} h · Lighting ${esc(i.lightsWm2)} W/m² × ${esc(i.lightsHours)} h · Forklifts ${esc(i.forklifts)} × ${esc(i.forkliftKW)} kW × ${esc(i.forkliftHours)} h · Other ${esc(i.otherKW)} kW × ${esc(i.otherHours)} h · Fans ${e.fanMode === 'kw' ? `${esc(e.fanKW)} kW × ${esc(e.fanHours)} h` : `${esc(e.fanPct)} %`} · Defrost ${esc(e.defrostKW)} kW × ${esc(e.defrostPerDay)} × ${esc(e.defrostMin)} min × ${esc(e.defrostFrac)} % · Ventilation ${esc(r.ventilation.m3h)} m³/h × ${esc(r.ventilation.hours)} h</p>`;
      return `<h3>${esc(r.name)}</h3><h4>Envelope</h4>${surf}<h4>Product</h4>${prod}<h4>Infiltration</h4>${inf}<h4>Internal &amp; equipment</h4>${intl}${r.notes ? `<p><b>Notes:</b> ${esc(r.notes)}</p>` : ''}`;
    }).join(''));

    sec('detail', 'Detailed heat load calculations', `<p class="muted">Values in SI (the calculation engine's internal units).</p>` + pr.rooms.map(({ room: r, res }) => {
      const blocks = explain.explainRoom(r, res, data, D);
      return `<h3>${esc(r.name)}</h3>` + blocks.map((b) => `<div class="calc"><h4>${esc(b.title)}</h4><p class="formula">${esc(b.formula)}</p>${table(b.table.head, b.table.rows.map((row) => row.map(esc)))}${b.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')}<p class="res">Result: <b>${f(b.result[0], 2)} ${esc(b.result[1])}</b></p></div>`).join('');
    }).join(''));

    const keys = ['transmission', 'product', 'packaging', 'respiration', 'infiltration', 'ventilation', 'people', 'lights', 'forklifts', 'other', 'fans', 'defrost'];
    const labels = { transmission: 'Transmission', product: 'Product', packaging: 'Packaging', respiration: 'Respiration', infiltration: 'Infiltration', ventilation: 'Ventilation air', people: 'People', lights: 'Lighting', forklifts: 'Motors / forklifts', other: 'Equipment', fans: 'Fans', defrost: 'Defrost' };
    const sumRow = (k) => pr.rooms.reduce((a, { res }) => a + (res.breakdown.find((b) => b.key === k) || {}).kWh, 0);
    const sub = pr.rooms.reduce((a, x) => a + x.res.subtotal, 0);
    sec('summary', 'Load summary', table(['Load component', ...pr.rooms.map((x) => x.room.name), 'Total [kWh/day]', 'Share'],
      [...keys.map((k) => [labels[k], ...pr.rooms.map(({ res }) => f((res.breakdown.find((b) => b.key === k) || {}).kWh, 0)), f(sumRow(k), 0), sub ? f(sumRow(k) / sub * 100, 1) + ' %' : '–']),
        ['<b>Calculated load (Σ)</b>', ...pr.rooms.map(({ res }) => `<b>${f(res.subtotal, 0)}</b>`), `<b>${f(sub, 0)}</b>`, '100 %']]));
    sec('allowances', 'Design allowances', table(['Room', 'Σ loads [kWh/day]', 'Safety [%]', 'Allowance [kWh/day]', 'Total [kWh/day]', 'Run time [h/day]', 'Product basis', 'Pull-down adj. [kW]'], pr.rooms.map(({ room: r, res }) => [esc(r.name), f(res.subtotal, 0), f(res.safety, 0), f(res.safetyKWh, 0), f(res.total, 0), f(res.runHours, 0), res.productBasis === 'pulldown' ? 'rate over pull-down' : 'daily', res.productBasis === 'pulldown' ? f(res.productRateAdjKW, 2) : '–'])));
    sec('final', 'Final refrigeration load', `${table(['Room', 'T [°C]', 'SST [°C]', 'Design capacity'], pr.rooms.map(({ room: r, res }) => [esc(r.name), f(+r.cond.T, 1), f(r.sstOverride !== '' && r.sstOverride != null ? +r.sstOverride : Math.round(res.sst), 0), `<b>${pw(res.capacity)}</b>`]))}
      ${table(['Suction level', 'Rooms', 'Capacity'], pr.levels.map((l) => [`${f(l.sst, 0)} °C`, esc(l.rooms.join(', ')), `<b>${pw(l.kW)}</b>`]))}
      <div class="final">Total design refrigeration load: <b>${pw(pr.totalKW)}</b></div>`);

    if (mr.length) sec('machinery', 'Machinery room ventilation', mr.map(({ m, r }) => `<h3>${esc(m.name)} — ${esc(r.codeName)}</h3>${m.tpl ? `<p class="muted">Common standard: ${esc(m.tpl.name)} v${esc(m.tpl.version)}; overridden fields: ${esc(ctx.venttpl.status(m).filter((x) => x.overridden).map((x) => x.label).join(', ') || 'none')}</p>` : ''}
      ${table(['Mode', 'Basis', 'm³/h', 'L/s', 'cfm', 'ACH'], ['normal', 'continuous', 'emergency'].map((k) => [k[0].toUpperCase() + k.slice(1), esc(r[k].design.basis), f(r[k].design.m3h, 0), f(r[k].design.ls, 0), f(r[k].design.cfm, 0), f(r[k].design.ach, 1)]))}
      <p>Room heat: ${f(r.heatKW, 1)} kW (motors ${f(r.motorKW, 1)}, envelope ${f(r.envKW, 1)}); volume ${f(r.volM3, 0)} m³.</p><ul>${r.checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`).join(''));

    sec('notes', 'Engineering notes and validation', `${messages.length ? table(['Level', 'Location', 'Message'], messages.map((m) => [m.level.toUpperCase(), esc(m.room || (m.scope === 'project' ? 'Project' : '')), esc(m.msg)])) : '<p>No validation messages.</p>'}
      ${(data.rooms || []).filter((r) => r.notes).map((r) => `<p><b>${esc(r.name)}:</b> ${esc(r.notes)}</p>`).join('')}`);

    const CL = { code: 'Required / code-based', practice: 'Recommended practice', assumption: 'Application assumption', user: 'User-defined' };
    sec('refs', 'Standards and references', `${table(['Reference', 'Edition', 'Clause', 'Classification', 'Application'], refs.map((r) => [esc(r.name), esc(r.edition), esc(r.clause ? `${r.clause}${r.clauseVerified ? '' : ' (unverified)'}` : '—'), esc(CL[r.classification] || r.classification), esc(r.application)]))}
      <p class="note">Clause numbers are listed only where verified from a supplied document. An internal approval status does not constitute regulatory approval.</p>`);

    sec('revisions', 'Revision history', revisions.length ? table(['Rev', 'Date', 'By', 'Description', 'Status', 'Total load'], revisions.map((r) => [esc(r.rev), esc(r.createdAt.slice(0, 10)), esc(r.createdBy), esc(r.description), esc(r.review.status), r.results && Number.isFinite(r.results.totalKW) ? pw(r.results.totalKW) : '–'])) : '<p>No saved revisions yet (working copy).</p>');

    const rv = revision ? revision.review : { prepared: {}, checked: {}, approved: {} };
    sec('signoff', 'Prepared / Checked / Approved', `<table class="sign"><tr><th></th><th>Name</th><th>Date</th><th>Signature</th></tr>${['prepared', 'checked', 'approved'].map((k) => `<tr><th>${k[0].toUpperCase() + k.slice(1)}</th><td>${esc((rv[k] || {}).name || '')}</td><td>${esc((rv[k] || {}).date || '')}</td><td></td></tr>`).join('')}</table>
      <p class="note">Review status reflects internal engineering review only and does not imply approval by any authority having jurisdiction.</p>`);

    const toc = sections.map((s, i) => `<li><span>${i + 1}.</span> ${esc(s.h)}</li>`).join('');
    const footer = esc(rs.footer || '');
    const meta = `${esc(docNo)} · Rev ${esc(rev)} · ${esc(V.APP_NAME)} ${esc(V.APP_VERSION)} / engine ${esc(V.ENGINE_VERSION)}`;

    return `<div class="rep" data-doc="${esc(docNo)}">
      <section class="cover">
        <div class="logos">${rs.showCompanyLogo !== false ? img(company.logo, 'logo') : ''}<span></span>${rs.showCustomerLogo !== false ? img(customer.logo, 'logo') : ''}</div>
        <div class="cover-co">${esc(company.name || '')}</div>
        <h1>${esc(title)}</h1>
        <div class="cover-p">${esc(P.name)}</div>
        <table class="kvt cover-t">${[['Project number', P.projectNo], ['Customer', customer.name], ['Site', [P.site, P.city, P.country].filter(Boolean).join(', ')], ['Revision', rev], ['Date', (revision ? revision.createdAt : now.toISOString()).slice(0, 10)], ['Document number', docNo]].map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v || '—')}</td></tr>`).join('')}</table>
        <h4>Traceability</h4><table class="kvt trace">${trace.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table>
        ${errors.length ? `<p class="bad">This calculation has ${errors.length} unresolved validation error(s). Results must not be issued.</p>` : ''}
        <div class="cover-foot">${esc(company.address || '')} ${company.phone ? '· ' + esc(company.phone) : ''} ${company.email ? '· ' + esc(company.email) : ''} ${company.web ? '· ' + esc(company.web) : ''}</div>
      </section>
      <section class="toc"><h2>Contents</h2><ol>${toc}</ol></section>
      ${sections.map((s, i) => `<section class="sec" id="rep-${s.id}"><h2>${i + 1}. ${esc(s.h)}</h2>${s.body}</section>`).join('')}
      <div class="rep-meta" data-meta="${meta}" data-footer="${footer}"></div>
    </div>`;
  }

  function exportSheets(ctx) {
    const { project: P, data, revision, version: V, explain, D, M } = ctx;
    const { pr, mr } = computeAll(ctx);
    const B = (v) => ({ v, b: true });
    const info = [[B('Project'), P.name], [B('Project number'), P.projectNo], [B('Project ID'), P.id], [B('Customer'), (ctx.customer || {}).name || ''], [B('Site'), P.site], [B('Revision'), revision ? revision.rev : 'WIP'],
      [B('Application'), `${V.APP_NAME} ${V.APP_VERSION}`], [B('Engine version'), V.ENGINE_VERSION], [B('Input dataset version'), revision ? revision.dataVersion : V.INPUT_DATA_VERSION], [B('Exported'), new Date().toISOString()],
      [], [B('Outdoor design DB [°C]'), +data.design.ambientDB], [B('Outdoor RH [%]'), +data.design.ambientRH], [B('Altitude [m]'), +data.design.altitude || 0], [B('Ground temperature [°C]'), +data.design.groundTemp]];
    const keys = pr.rooms.length ? pr.rooms[0].res.breakdown.map((b) => b.key) : [];
    const lbl = pr.rooms.length ? pr.rooms[0].res.breakdown.map((b) => b.label) : [];
    const summary = [[B('Room'), B('T [°C]'), B('RH [%]'), B('Volume [m³]'), ...lbl.map((l) => B(`${l} [kWh/day]`)), B('Subtotal [kWh/day]'), B('Safety [%]'), B('Total [kWh/day]'), B('Run time [h]'), B('Capacity [kW]'), B('Capacity [TR]'), B('SST [°C]')],
      ...pr.rooms.map(({ room: r, res }) => [r.name, +r.cond.T, +r.cond.RH, { v: res.volume, n: '0' }, ...keys.map((k) => ({ v: res.breakdown.find((b) => b.key === k).kWh, n: '0.0' })), { v: res.subtotal, n: '0.0' }, res.safety, { v: res.total, n: '0.0' }, res.runHours, { v: res.capacity, n: '0.00' }, { v: res.capacity / 3.51685, n: '0.00' }, { v: res.sst, n: '0.0' }]),
      [B('TOTAL'), '', '', '', ...keys.map(() => ''), '', '', '', '', { v: pr.totalKW, n: '0.00', b: true }, { v: pr.totalKW / 3.51685, n: '0.00' }]];
    const trans = [[B('Room'), B('Surface'), B('A [m²]'), B('U [W/m²K]'), B('T out [°C]'), B('ΔT [K]'), B('Q [kW]'), B('Q [kWh/day]')],
      ...pr.rooms.flatMap(({ room: r, res }) => res.transmission.items.map((s) => [r.name, s.label, { v: s.A, n: '0.0' }, { v: s.U, n: '0.000' }, { v: s.To, n: '0.0' }, { v: s.dT, n: '0.0' }, { v: s.kW, n: '0.000' }, { v: s.kWh, n: '0.0' }]))];
    const prod = [[B('Room'), B('Product'), B('kg/day'), B('T in [°C]'), B('T out [°C]'), B('T_f [°C]'), B('q [kJ/kg]'), B('Pull-down [h]'), B('Product [kWh/day]'), B('Packaging [kWh/day]'), B('Respiration [kWh/day]')],
      ...pr.rooms.flatMap(({ room: r, res }) => res.product.items.map((p) => [r.name, p.label, p.mass, p.T1, p.T2, p.Tf, { v: p.qkg, n: '0.0' }, p.pull, { v: p.kWhProduct, n: '0.0' }, { v: p.kWhPack, n: '0.0' }, { v: p.kWhResp, n: '0.0' }]))];
    const inf = [[B('Room'), B('Door / method'), B('A [m²]'), B('q open [kW]'), B('Open [h/day]'), B('D_f'), B('E'), B('Q [kWh/day]'), B('Moisture [kg/day]')],
      ...pr.rooms.flatMap(({ room: r, res }) => res.infiltration.airChange
        ? [[r.name, `Air change: ${res.infiltration.airChange.basis}`, '', '', '', '', '', { v: res.infiltration.airChange.kWh, n: '0.0' }, { v: res.infiltration.airChange.moisture, n: '0.00' }]]
        : res.infiltration.items.map((d) => [r.name, d.label, { v: d.A, n: '0.00' }, { v: d.qOpen, n: '0.00' }, { v: d.openH, n: '0.000' }, d.Df, d.E, { v: d.kWh, n: '0.0' }, { v: d.moisture, n: '0.00' }]))];
    const vent = [[B('Machinery room'), B('Code'), B('Normal [m³/h]'), B('Continuous [m³/h]'), B('Emergency [m³/h]'), B('Emergency ACH'), B('Heat [kW]')],
      ...mr.map(({ m, r }) => [m.name, r.codeName, { v: r.normal.design.m3h, n: '0' }, { v: r.continuous.design.m3h, n: '0' }, { v: r.emergency.design.m3h, n: '0' }, { v: r.emergency.design.ach, n: '0.0' }, { v: r.heatKW, n: '0.0' }])];
    const asm = [[B('Scope'), B('Item'), B('Value'), B('Type'), B('Basis')], ...explain.assumptions(data, D, M).map((a) => [a.scope, a.item, a.value, a.kind, a.basis])];
    const msgs = [[B('Level'), B('Code'), B('Location'), B('Message')], ...(ctx.messages || []).map((m) => [m.level, m.code, m.room || m.scope, m.msg])];
    return [
      { name: 'Project', cols: [28, 50], rows: info },
      { name: 'Load summary', cols: [28, 8, 8, 12, ...keys.map(() => 14), 14, 10, 14, 10, 14, 14, 10], rows: summary },
      { name: 'Transmission', cols: [24, 22, 10, 10, 10, 10, 10, 12], rows: trans },
      { name: 'Product', cols: [24, 26, 10, 10, 10, 10, 10, 12, 14, 14, 14], rows: prod },
      { name: 'Infiltration', cols: [24, 32, 10, 12, 12, 8, 8, 12, 14], rows: inf },
      { name: 'Machinery ventilation', cols: [28, 36, 14, 16, 16, 14, 10], rows: vent },
      { name: 'Assumptions', cols: [22, 34, 40, 14, 36], rows: asm },
      { name: 'Validation', cols: [10, 8, 24, 90], rows: msgs },
      { name: 'Input data (JSON)', cols: [120], rows: [[B('Engine input dataset (for traceability)')], [JSON.stringify(data)]] },
    ];
  }

  function csvRows(ctx) {
    const { pr } = computeAll(ctx);
    const head = ['project_id', 'project_no', 'revision', 'room', 'component', 'kwh_per_day', 'room_capacity_kw', 'engine_version'];
    const rev = ctx.revision ? ctx.revision.rev : 'WIP';
    const rows = [head];
    for (const { room: r, res } of pr.rooms) {
      for (const b of res.breakdown) rows.push([ctx.project.id, ctx.project.projectNo, rev, r.name, b.label, +b.kWh.toFixed(3), +res.capacity.toFixed(3), ctx.version.ENGINE_VERSION]);
      rows.push([ctx.project.id, ctx.project.projectNo, rev, r.name, 'Safety allowance', +res.safetyKWh.toFixed(3), +res.capacity.toFixed(3), ctx.version.ENGINE_VERSION]);
    }
    return rows;
  }

  const api = { buildReport, exportSheets, csvRows };
  root.CL = root.CL || {};
  root.CL.report = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
