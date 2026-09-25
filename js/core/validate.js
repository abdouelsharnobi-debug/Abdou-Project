/*
 * Engineering validation. Reads inputs and engine results; never modifies either.
 * Levels: 'error' (calculation cannot be relied on / cannot proceed), 'warning' (review
 * input), 'info' (guidance). Each message: { level, code, scope, roomId?, tab?, field?, msg }.
 * Where the v1 engine silently clamps a value, an ERROR states what the engine would use.
 */
(function (root) {
  'use strict';
  const blank = (v) => v === '' || v == null || (typeof v === 'number' && !Number.isFinite(v));
  const n = (v) => +v;

  function validateProject(data, calc, D, V) {
    const out = [];
    const add = (level, code, msg, loc = {}) => out.push({ level, code, msg, scope: loc.roomId ? 'room' : loc.mr != null ? 'machinery' : loc.tunnel != null ? 'tunnel' : 'project', ...loc });
    const d = data.design || {};

    if (blank(d.ambientDB)) add('error', 'P01', 'Outdoor design dry-bulb temperature is missing.', { tab: 'criteria', field: 'ambientDB' });
    else if (n(d.ambientDB) < -40 || n(d.ambientDB) > 60) add('warning', 'P02', `Outdoor design dry-bulb ${d.ambientDB} °C is outside the usual −40…60 °C range.`, { tab: 'criteria', field: 'ambientDB' });
    if (blank(d.ambientRH)) add('error', 'P03', 'Outdoor coincident relative humidity is missing.', { tab: 'criteria', field: 'ambientRH' });
    else if (n(d.ambientRH) < 0 || n(d.ambientRH) > 100) add('error', 'P04', 'Outdoor RH must be between 0 and 100 %.', { tab: 'criteria', field: 'ambientRH' });
    if (!blank(d.altitude) && (n(d.altitude) < -500 || n(d.altitude) > 5000)) add('warning', 'P05', `Site altitude ${d.altitude} m looks unusual.`, { tab: 'criteria', field: 'altitude' });
    if (blank(d.groundTemp)) add('warning', 'P06', 'Ground temperature is blank; 10 °C is used for floors on ground.', { tab: 'criteria', field: 'groundTemp' });
    if (!(data.rooms || []).length) add('info', 'P07', 'No rooms have been added yet.', { tab: 'rooms' });

    for (const r of data.rooms || []) {
      const loc = (tab, field) => ({ roomId: r.id, room: r.name, tab, field });
      const T = r.cond && r.cond.T, RH = r.cond && r.cond.RH;
      const dims = r.dims || {};
      for (const k of ['L', 'W', 'H']) {
        if (blank(dims[k])) add('error', 'R01', `${label(k)} is missing.`, loc('general', k));
        else if (n(dims[k]) <= 0) add('error', 'R02', `${label(k)} must be greater than zero (entered ${dims[k]} m).`, loc('general', k));
      }
      if (blank(T)) add('error', 'R03', 'Room design temperature is missing (the engine would use 0 °C).', loc('general', 'T'));
      else if (n(T) < -60 || n(T) > 30) add('warning', 'R04', `Room temperature ${T} °C is outside the usual −60…30 °C range.`, loc('general', 'T'));
      if (blank(RH)) add('error', 'R05', 'Room relative humidity is missing.', loc('general', 'RH'));
      else if (n(RH) < 0 || n(RH) > 100) add('error', 'R06', 'Room RH must be between 0 and 100 %.', loc('general', 'RH'));
      if (blank(r.runHours) || n(r.runHours) <= 0 || n(r.runHours) > 24) add('error', 'R07', `Run time must be > 0 and ≤ 24 h/day (entered "${r.runHours}"; the engine would use ${Math.max(1, Math.min(24, n(r.runHours) || 18))} h).`, loc('general', 'runHours'));
      else if (n(r.runHours) < 12 || n(r.runHours) > 22) add('warning', 'R08', `Run time ${r.runHours} h/day is unusual; typical is 16–20 h to allow defrost.`, loc('general', 'runHours'));
      if (!blank(r.TD) && n(r.TD) <= 0) add('error', 'R09', 'Evaporator TD must be greater than zero.', loc('general', 'TD'));
      else if (!blank(r.TD) && n(r.TD) > 15) add('warning', 'R10', `Evaporator TD ${r.TD} K is large; expect low room humidity and product weight loss.`, loc('general', 'TD'));
      else if (!blank(r.TD) && !blank(RH) && n(RH) >= 90 && n(r.TD) > 6) add('warning', 'R11', `TD ${r.TD} K is high for ${RH} % RH; high-RH rooms normally use 4–6 K.`, loc('general', 'TD'));
      if (!blank(r.safety) && n(r.safety) < 0) add('error', 'R12', 'Safety factor cannot be negative.', loc('general', 'safety'));
      else if (!blank(r.safety) && n(r.safety) > 30) add('warning', 'R13', `Safety factor ${r.safety} % is high; check it is not duplicating other allowances.`, loc('general', 'safety'));

      for (const s of r.surfaces || []) {
        if (!blank(s.areaOverride) && n(s.areaOverride) < 0) add('error', 'T01', `${s.label}: area override cannot be negative.`, loc('transmission'));
        if (!blank(s.uOverride) && n(s.uOverride) < 0) add('error', 'T02', `${s.label}: U-value override cannot be negative.`, loc('transmission'));
        if (blank(s.uOverride) && (s.ins === 'NONE' || !(n(s.thk) > 0))) {
          add(s.key === 'floor' && n(T) > 5 ? 'info' : 'warning', 'T03', `${s.label}: no insulation entered.`, loc('transmission'));
        }
        if (s.adj !== 'ambient' && s.adj !== 'ground' && blank(s.tAdj)) add('error', 'T04', `${s.label}: adjacent space temperature is missing.`, loc('transmission'));
      }
      if (n(T) < 0) add('info', 'T05', 'Room below 0 °C: provide under-floor heating/ventilation against frost heave and set the ground temperature to the heater set-point.', loc('transmission'));

      if (!(r.products || []).length && ['chiller', 'produce', 'freezer', 'blast', 'ripening'].includes(r.type)) add('warning', 'M01', 'No product load entered for a storage/processing room.', loc('product'));
      for (const [i, p] of (r.products || []).entries()) {
        const pl = `Product ${i + 1}`;
        const ref = D.products.find((x) => x.id === p.productId) || {};
        if (blank(p.mass) || n(p.mass) < 0) add('error', 'M02', `${pl}: product quantity is missing or negative.`, loc('product'));
        else if (n(p.mass) === 0) add('warning', 'M03', `${pl}: product quantity is zero, so no product load is calculated.`, loc('product'));
        if (blank(p.tIn)) add('error', 'M04', `${pl}: entering temperature is missing (the engine would use 0 °C).`, loc('product'));
        if (!blank(p.tOut) && !blank(T) && n(p.tOut) < n(T)) add('warning', 'M05', `${pl}: final temperature ${p.tOut} °C is below the room temperature ${T} °C, which cannot be reached by room air.`, loc('product'));
        if (!blank(p.tIn) && !blank(p.tOut) && n(p.tIn) <= n(p.tOut)) add('warning', 'M06', `${pl}: entering temperature is not above the final temperature, so no product load results.`, loc('product'));
        if (!blank(p.pullDown) && (n(p.pullDown) <= 0 || n(p.pullDown) > 24)) add('error', 'M07', `${pl}: pull-down time must be > 0 and ≤ 24 h (entered ${p.pullDown}; the engine would use ${Math.max(1, Math.min(24, n(p.pullDown)))} h).`, loc('product'));
        else if (!blank(p.pullDown) && n(p.pullDown) < 1) add('warning', 'M08', `${pl}: pull-down time under 1 h.`, loc('product'));
        if (!blank(p.crf) && (n(p.crf) <= 0 || n(p.crf) > 1)) add('error', 'M09', `${pl}: chilling rate factor must be > 0 and ≤ 1 (the engine would use 1.0).`, loc('product'));
        if (!blank(p.xw) && (n(p.xw) < 0 || n(p.xw) > 100)) add('error', 'M10', `${pl}: water content must be 0–100 %.`, loc('product'));
        if (p.productId === 'custom' && blank(p.xw)) add('warning', 'M11', `${pl}: custom product uses placeholder water content ${ref.xw} %. Enter product data.`, loc('product'));
        if (n(p.stored) > 0 && !(n(blank(p.resp) ? ref.resp : p.resp) > 0)) add('info', 'M12', `${pl}: stored quantity entered but heat of respiration is zero for this commodity.`, loc('product'));
        if (ref.resp > 0 && !(n(p.stored) > 0)) add('info', 'M13', `${pl}: ${ref.name} respires; enter the stored quantity to include heat of respiration.`, loc('product'));
        if (!blank(p.packPct) && n(p.packPct) < 0) add('error', 'M14', `${pl}: packaging mass cannot be negative.`, loc('product'));
        for (const [k, lbl] of [['cpA', 'specific heat above freezing'], ['cpB', 'specific heat below freezing'], ['hLat', 'latent heat']]) {
          if (!blank(p[k]) && !(n(p[k]) > 0)) add('error', 'M15', `${pl}: entered ${lbl} must be greater than zero (blank = Siebel value).`, loc('product'));
        }
        if (!blank(p.cpA) && !blank(p.cpB) && n(p.cpB) > n(p.cpA)) add('warning', 'M16', `${pl}: specific heat below freezing is higher than above freezing; check the data.`, loc('product'));
        if (!blank(p.respIn) && n(p.respIn) < 0) add('error', 'M17', `${pl}: incoming-produce respiration cannot be negative.`, loc('product'));
        if (r.productBasis === 'pulldown' && !blank(p.pullDown) && n(p.pullDown) < n(r.runHours)) add('info', 'M18', `${pl}: product load taken at the pull-down rate (${p.pullDown} h), not spread over the ${r.runHours} h run time.`, loc('product'));
      }

      if (r.infMethod === 'airchange') {
        const ac = r.airChange || {};
        if (ac.method === 'manual' && !(n(ac.nManual) >= 2)) add('warning', 'I01', 'Manual air changes below the recommended minimum of 2 per day.', loc('infiltration'));
        if (ac.adj === 'custom' && (blank(ac.tAdj) || blank(ac.rhAdj))) add('error', 'I02', 'Adjacent space temperature/RH for infiltrating air is missing.', loc('infiltration'));
      } else {
        if (!(r.doors || []).length) add('warning', 'I03', 'No doors entered: door infiltration load is zero.', loc('infiltration'));
        for (const [i, d] of (r.doors || []).entries()) {
          const dl = d.name || `Door ${i + 1}`;
          if (!(n(d.w) > 0) || !(n(d.h) > 0)) add('error', 'I04', `${dl}: door width and height must be greater than zero.`, loc('infiltration'));
          if (n(d.passages) < 0 || n(d.openSec) < 0 || n(d.standMin) < 0) add('error', 'I05', `${dl}: door usage values cannot be negative.`, loc('infiltration'));
          const openH = (n(d.passages) * n(d.openSec) + 60 * n(d.standMin)) / 3600;
          if (openH > 24) add('error', 'I06', `${dl}: door open time ${openH.toFixed(1)} h/day exceeds 24 h.`, loc('infiltration'));
          else if (openH > 12) add('warning', 'I07', `${dl}: door open ${openH.toFixed(1)} h/day; consider a rapid-roll door or vestibule.`, loc('infiltration'));
          if (d.protection === 'custom' && (blank(d.E) || n(d.E) < 0 || n(d.E) > 1)) add('error', 'I08', `${dl}: protection effectiveness E must be between 0 and 1.`, loc('infiltration'));
          if (d.adj === 'custom' && (blank(d.tAdj) || blank(d.rhAdj))) add('error', 'I09', `${dl}: adjacent space temperature/RH is missing.`, loc('infiltration'));
          if (!blank(d.Df) && n(d.Df) <= 0) add('error', 'I10', `${dl}: doorway flow factor must be positive.`, loc('infiltration'));
        }
      }
      const i = r.internal || {}, e = r.equipment || {};
      for (const k of ['people', 'peopleHours', 'lightsWm2', 'lightsHours', 'forklifts', 'forkliftKW', 'forkliftHours', 'otherKW', 'otherHours']) if (n(i[k]) < 0) add('error', 'N01', `Internal load value "${k}" cannot be negative.`, loc('internal'));
      for (const k of ['peopleHours', 'lightsHours', 'forkliftHours', 'otherHours']) if (n(i[k]) > 24) add('error', 'N02', `Operating hours "${k}" exceed 24 h/day.`, loc('internal'));
      if (e.fanMode !== 'kw' && n(e.fanPct) > 20) add('warning', 'N03', `Fan allowance ${e.fanPct} % is high; typical 5–10 % before coil selection.`, loc('internal'));
      if (e.fanMode === 'kw' && n(e.fanHours) > 24) add('error', 'N04', 'Fan operating hours exceed 24 h/day.', loc('internal'));
      if (n(e.defrostFrac) < 0 || n(e.defrostFrac) > 100) add('error', 'N05', 'Defrost heat to room must be 0–100 %.', loc('internal'));
      if (n(T) < 0 && !(n(e.defrostKW) > 0)) add('info', 'N06', 'Room below 0 °C with no defrost heat entered.', loc('internal'));

      // Result-based checks (only if inputs are sane enough to calculate)
      if (!out.some((m) => m.roomId === r.id && m.level === 'error')) {
        let res;
        try { res = calc.calcRoom(r, data); } catch (err) { add('error', 'X01', `Calculation failed: ${err.message}`, loc('results')); continue; }
        const nc = res.transmission.items.filter((s) => s.notCredited);
        if (nc.length) add('info', 'X08', `Heat loss not credited (project option): ${nc.map((s) => s.label).join(', ')} counted as zero instead of ${nc.reduce((a, s) => a + s.rawKW * 24, 0).toFixed(1)} kWh/day.`, loc('transmission'));
        const credit = res.transmission.items.filter((s) => s.kW < 0);
        if (credit.length) add('warning', 'X02', `Heat loss to colder surroundings is credited (${credit.map((s) => s.label).join(', ')}): ${res.transmission.items.filter((s) => s.kW < 0).reduce((a, s) => a + s.kWh, 0).toFixed(1)} kWh/day reduces the load. Confirm the adjacent space is always colder, or select “no credit” under Design criteria.`, loc('transmission'));
        if (res.subtotal <= 0) add('error', 'X03', 'Net calculated load is zero or negative; check adjacent temperatures and inputs.', loc('results'));
        if (res.equipment.fans < 0) add('error', 'X04', 'Fan allowance became negative because the base load is negative.', loc('internal'));
        if (res.infiltration.airChange && res.infiltration.airChange.extrapolated) add('warning', 'X05', `Room volume ${res.volume.toFixed(0)} m³ is outside the Dossat air-change table (≤ 2 832 m³); value extrapolated. Prefer the door-opening method.`, loc('infiltration'));
        const [lo, hi] = res.kcalRange;
        if (res.kcalM3Day > 2 * hi) add('warning', 'X06', `Room load excluding product is ${res.kcalM3Day.toFixed(0)} kcal/m³·day, well above the typical ${lo}–${hi}. Check inputs for an unusually high load.`, loc('results'));
        if (res.loadDensity > 300) add('warning', 'X07', `Load density ${res.loadDensity.toFixed(0)} W/m³ is very high.`, loc('results'));
      }
    }

    // Tunnel / blast freezers (freezing engine)
    const FZ = root.HLFreeze || (typeof require === 'function' && require('../freeze.js'));
    const LIB = (root.CL && root.CL.productsTab) || (typeof require === 'function' && require('./products-tab.js'));
    for (const [ti, t] of (data.tunnels || []).entries()) {
      const loc = { tunnel: ti, room: t.name, tab: 'tunnel' };
      const batch = t.mode !== 'continuous';
      if (batch && !(n(t.batchKg) > 0)) add('error', 'F01', 'Batch mass must be greater than zero.', { ...loc, field: 'batchKg' });
      if (!batch && !(n(t.throughput) > 0)) add('error', 'F01', 'Product throughput must be greater than zero.', { ...loc, field: 'throughput' });
      if (!(n(t.D) > 0)) add('error', 'F02', 'Product thickness / diameter must be greater than zero.', { ...loc, field: 'D' });
      if (!(n(t.hAir) > 0)) add('error', 'F03', 'Surface heat-transfer coefficient must be greater than zero.', { ...loc, field: 'hAir' });
      if (n(t.Rpack) < 0) add('error', 'F03', 'Packaging resistance cannot be negative.', { ...loc, field: 'Rpack' });
      const pr = FZ.props(t, LIB.PRODUCTS);
      if (!(pr.kF > 0) || !(pr.rhoF > 0) || !(pr.rhoU > 0)) add('error', 'F04', 'Frozen conductivity and densities must be greater than zero.', loc);
      if (!(pr.cpA > 0) || !(pr.cpB > 0) || !(pr.hLat > 0)) add('error', 'F09', 'Product specific heats and latent heat are required (select a library product or enter them).', loc);
      if (pr.source === 'library' && pr.ref.Tf > 0 && (t.product.Tf === '' || t.product.Tf == null)) add('warning', 'F08', `Library freezing point for “${pr.ref.name}” is +${pr.ref.Tf} °C (as tabulated in the workbook) — foods freeze below 0 °C. Enter the correct initial freezing point.`, { ...loc, field: 'Tf' });
      if (n(t.Tm) >= pr.Tf) add('error', 'F05', `Air temperature ${t.Tm} °C must be below the product freezing point ${pr.Tf} °C.`, { ...loc, field: 'Tm' });
      if (n(t.Tc) <= n(t.Tm)) add('error', 'F06', 'Final centre temperature must be above the air temperature (it can only approach it).', { ...loc, field: 'Tc' });
      else if (n(t.Tc) >= pr.Tf) add('warning', 'F07', 'Final centre temperature is not below the freezing point — the product centre is not frozen.', { ...loc, field: 'Tc' });
      if (n(t.Ti) <= pr.Tf) add('info', 'F16', 'Product enters already frozen — only sensible cooling below freezing is calculated.', { ...loc, field: 'Ti' });
      if (t.lossMethod !== 'factor' && n(t.lossPct) >= 100) add('error', 'F13', 'Loss & safety must be below 100 % with the Q ÷ (1 − x) method.', { ...loc, field: 'lossPct' });
      if (n(t.peak, 1) < 1) add('warning', 'F15', 'Load distribution factor below 1.0 reduces the product load below its average.', { ...loc, field: 'peak' });
      try {
        const r = FZ.calcTunnel(t, data, LIB.PRODUCTS);
        if (r.freezing.valid && t.timeBasis === 'entered') {
          if (!(n(t.tDesign) > 0)) add('error', 'F10', 'Enter the design freezing time or select a calculated basis.', { ...loc, field: 'tDesign' });
          else if (n(t.tDesign) < r.freezing.phamH) add('warning', 'F10', `Design freezing time ${t.tDesign} h is shorter than the calculated time ${r.freezing.phamH.toFixed(1)} h (Pham): the product may not reach ${t.Tc} °C at the centre.`, { ...loc, field: 'tDesign' });
        }
        if (t.timeBasis === 'plank') add('info', 'F11', `Plank's equation ignores pre-cooling and sub-cooling; it gives ${r.freezing.plankH.toFixed(1)} h vs ${r.freezing.phamH.toFixed(1)} h by Pham's method.`, { ...loc, field: 'timeBasis' });
        if (r.freezing.valid && r.freezing.Bi > 20) add('info', 'F12', `Biot number ${r.freezing.Bi.toFixed(1)}: freezing is controlled by internal conduction; more air velocity gives little benefit.`, loc);
      } catch (err) { add('error', 'F99', `Freezing calculation failed: ${err.message}`, loc); }
    }

    for (const [mi, m] of (data.machinery || []).entries()) {
      const loc = { mr: mi, room: m.name, tab: 'machinery' };
      for (const k of ['L', 'W', 'H']) if (!(n(m[k]) > 0)) add('error', 'V01', `Machinery room ${label(k).toLowerCase()} must be greater than zero.`, loc);
      const code = V.codes[m.code];
      if (code && code.ammoniaOnly && m.refrigerant !== 'ammonia') add('warning', 'V02', `${code.name} applies to ammonia systems, but the refrigerant is set to non-ammonia.`, loc);
      if (!(n(m.chargeKg) > 0)) add('warning', 'V03', 'Refrigerant charge is zero or missing.', loc);
      if (m.detector === 'yes' && n(m.setpoint) > n(m.maxSetpoint)) add('warning', 'V04', 'Detector setpoint exceeds the maximum allowed; continuous ventilation at the emergency rate is required.', loc);
      try {
        const r = V.calcMachineryRoom(m);
        for (const mode of ['normal', 'continuous', 'emergency']) if (r[mode].ok === false) add('warning', 'V05', `Installed ${mode} ventilation is below the required rate.`, loc);
      } catch (err) { add('error', 'V06', `Ventilation calculation failed: ${err.message}`, loc); }
    }
    return out;
  }

  function label(k) { return { L: 'Length', W: 'Width', H: 'Height' }[k] || k; }
  const count = (list) => list.reduce((a, m) => (a[m.level]++, a), { error: 0, warning: 0, info: 0 });

  const api = { validateProject, count };
  root.CL = root.CL || {};
  root.CL.validate = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
