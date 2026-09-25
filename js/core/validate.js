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
    const add = (level, code, msg, loc = {}) => out.push({ level, code, msg, scope: loc.roomId ? 'room' : loc.mr != null ? 'machinery' : 'project', ...loc });
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
        const credit = res.transmission.items.filter((s) => s.kW < 0);
        if (credit.length) add('warning', 'X02', `Heat loss to colder surroundings is credited (${credit.map((s) => s.label).join(', ')}): ${res.transmission.items.filter((s) => s.kW < 0).reduce((a, s) => a + s.kWh, 0).toFixed(1)} kWh/day reduces the load. Confirm the adjacent space is always colder.`, loc('transmission'));
        if (res.subtotal <= 0) add('error', 'X03', 'Net calculated load is zero or negative; check adjacent temperatures and inputs.', loc('results'));
        if (res.equipment.fans < 0) add('error', 'X04', 'Fan allowance became negative because the base load is negative.', loc('internal'));
        if (res.infiltration.airChange && res.infiltration.airChange.extrapolated) add('warning', 'X05', `Room volume ${res.volume.toFixed(0)} m³ is outside the Dossat air-change table (≤ 2 832 m³); value extrapolated. Prefer the door-opening method.`, loc('infiltration'));
        const [lo, hi] = res.kcalRange;
        if (res.kcalM3Day > 2 * hi) add('warning', 'X06', `Room load excluding product is ${res.kcalM3Day.toFixed(0)} kcal/m³·day, well above the typical ${lo}–${hi}. Check inputs for an unusually high load.`, loc('results'));
        if (res.loadDensity > 300) add('warning', 'X07', `Load density ${res.loadDensity.toFixed(0)} W/m³ is very high.`, loc('results'));
      }
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
