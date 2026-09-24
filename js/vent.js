/*
 * Refrigeration machinery-room ventilation rates.
 *
 * Follows the rules summarised in the IIAR "Machinery Room Ventilation Analysis Tool":
 *  - ANSI/IIAR 2-2008 Addendum A (2010) §13.3: normal = max(20 ACH, temperature control to
 *    40 °C / 104 °F with 1 % ASHRAE design inlet air); emergency = 30 ACH (gross volume);
 *    single-fan failure must still leave ≥ 20 ACH; detectors at ≤ TLV-TWA (normal) and
 *    ≤ 1000 ppm (emergency).
 *  - IIAR 2-1999 / 1992, IMC, ASHRAE 15, UMC/CMC variants for older or non-ammonia rooms.
 * Rates are evaluated in IP units exactly as the code formulas are written (cfm, lb, ft²,
 * Btu/h, °F) and reported in SI.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.HLVent = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const num = (v, d = 0) => (Number.isFinite(+v) && v !== '' && v !== null ? +v : d);
  const FT = 3.28084, FT2 = FT * FT, FT3 = FT2 * FT, LB = 2.20462, BTUH_PER_KW = 3412.14;
  const CFM_TO_M3H = 1.699011, CFM_TO_LS = 0.471947;
  const cToF = (c) => c * 9 / 5 + 32;

  const codes = {
    iiar2_2010: { name: 'ANSI/IIAR 2-2008 Addendum A (2010–)', ammoniaOnly: true },
    iiar2_1999: { name: 'IIAR 2 (1999–2009)', ammoniaOnly: true },
    iiar2_1992: { name: 'IIAR 2 (1992–1998)', ammoniaOnly: true },
    imc2012: { name: 'International Mechanical Code (2012–)' },
    ashrae15: { name: 'ASHRAE 15 (2001–)' },
    cmc: { name: 'UMC / CMC (1994–)' },
  };

  /** Solar allowance [°F] used by the tool (roof, E/W walls, S wall; N = 0). */
  const solarF = {
    roof: { none: 0, light: 8, medium: 15, dark: 20 },
    E: { none: 0, light: 4, medium: 6, dark: 8 },
    W: { none: 0, light: 4, medium: 6, dark: 8 },
    S: { none: 0, light: 2, medium: 4, dark: 5 },
    N: { none: 0, light: 0, medium: 0, dark: 0 },
  };

  function newMachineryRoom() {
    return {
      name: 'Engine room ER-01', code: 'iiar2_2010', refrigerant: 'ammonia',
      L: 30, W: 15, H: 7, chargeKg: 8000, occupants: 2,
      detector: 'yes', maxSetpoint: 25, setpoint: 25, basement: 'no',
      toaC: 38, tsaC: 38,
      surfaces: [
        { key: 'roof', label: 'Roof', sunlit: 'yes', area: 450, U: 0.35, color: 'medium' },
        { key: 'E', label: 'East wall', sunlit: 'no', area: 105, U: 0.45, color: 'medium' },
        { key: 'S', label: 'South wall', sunlit: 'yes', area: 210, U: 0.45, color: 'medium' },
        { key: 'W', label: 'West wall', sunlit: 'yes', area: 105, U: 0.45, color: 'medium' },
      ],
      motors: [
        { name: 'Screw compressor C-1', kW: 315, eff: 95, standby: false },
        { name: 'Screw compressor C-2', kW: 315, eff: 95, standby: false },
        { name: 'Screw compressor C-3 (standby)', kW: 315, eff: 95, standby: true },
        { name: 'NH₃ pumps', kW: 15, eff: 88, standby: false },
      ],
      installed: { normal: '', continuous: '', emergency: '' }, // m³/h
    };
  }

  function calcMachineryRoom(m) {
    const areaM2 = num(m.L) * num(m.W);
    const volM3 = areaM2 * num(m.H);
    const area = areaM2 * FT2, vol = volM3 * FT3, G = num(m.chargeKg) * LB;
    const toaF = cToF(num(m.toaC)), tsaF = cToF(num(m.tsaC));
    const code = codes[m.code] ? m.code : 'iiar2_2010';
    const tmrF = (code === 'iiar2_2010' || code === 'cmc') ? 104 : Math.min(122, tsaF + 18);

    // Envelope gain of sun-lit surfaces (IP, as in the tool): U·A·(Toa + solar − Tmr) ≥ 0
    const env = (m.surfaces || []).map((s) => {
      if (s.sunlit !== 'yes') return { label: s.label, kW: 0 };
      const U = num(s.U) / 5.678, A = num(s.area) * FT2;
      const sol = (solarF[s.key] || solarF.N)[s.color] || 0;
      const btuh = Math.max(0, U * A * (toaF + sol - tmrF));
      return { label: s.label, kW: btuh / BTUH_PER_KW };
    });
    const envKW = env.reduce((a, s) => a + s.kW, 0);
    const motorKW = (m.motors || []).filter((x) => !x.standby)
      .reduce((a, x) => a + num(x.kW) * (1 - num(x.eff, 100) / 100), 0);
    const heatKW = envKW + motorKW;
    const btuh = heatKW * BTUH_PER_KW;

    const noDet = m.detector === 'no' || num(m.setpoint) > num(m.maxSetpoint);
    const basement = m.basement === 'yes';
    const ach = (n) => vol * n / 60;
    const tempCtl = (dT) => (dT > 0 ? btuh / 1.08 / dT : Infinity);
    const rows = { normal: [], continuous: [], emergency: [] };
    const pick = (list) => list.filter((r) => Number.isFinite(r.cfm)).reduce((a, r) => (r.cfm > a.cfm ? r : a), { cfm: 0, basis: '—' });
    const ammonia = m.refrigerant === 'ammonia';

    let emergency;
    switch (code) {
      case 'iiar2_2010':
        rows.normal.push({ basis: 'Temperature control to 40 °C (104 °F)', cfm: tempCtl(104 - tsaF) }, { basis: '20 ACH', cfm: ach(20) });
        rows.emergency.push({ basis: '30 ACH (one air change every 2 min)', cfm: ach(30) });
        emergency = pick(rows.emergency);
        rows.continuous.push({ basis: 'No detector / setpoint above max → emergency rate', cfm: noDet ? emergency.cfm : 0 });
        break;
      case 'iiar2_1999':
      case 'iiar2_1992':
        rows.normal.push({ basis: 'Temperature control, 10 K (18 °F) rise', cfm: tempCtl(18) });
        rows.emergency.push({ basis: 'Refrigerant charge: 100·√G (cfm, lb)', cfm: 100 * Math.sqrt(G) });
        if (code === 'iiar2_1999') rows.emergency.push({ basis: 'Room volume × 0.2 cfm/ft³ (12 ACH)', cfm: vol * 0.2 });
        emergency = pick(rows.emergency);
        rows.continuous.push({ basis: 'No detector / setpoint above max → emergency rate', cfm: noDet ? emergency.cfm : 0 },
          { basis: 'Machinery room in basement → emergency rate', cfm: basement ? emergency.cfm : 0 },
          { basis: '0.5 cfm/ft² (2.54 L/s·m²)', cfm: 0.5 * area });
        break;
      case 'imc2012':
      case 'ashrae15': {
        if (code === 'ashrae15') {
          const a = tempCtl(18), b = tempCtl(122 - tsaF);
          rows.normal.push({ basis: tsaF >= 104 ? 'Limit to 50 °C (122 °F)' : '10 K (18 °F) rise', cfm: tsaF >= 104 ? Math.max(a, b) : Math.min(a, b) });
        } else rows.normal.push({ basis: 'Temperature control, 10 K (18 °F) rise when occupied', cfm: tempCtl(18) });
        rows.emergency.push(code === 'imc2012' && ammonia
          ? { basis: 'Ammonia: 30 ACH', cfm: ach(30) }
          : { basis: 'Refrigerant charge: 100·√G (cfm, lb)', cfm: 100 * Math.sqrt(G) });
        emergency = pick(rows.emergency);
        rows.continuous.push({ basis: 'No detector / setpoint above max → emergency rate', cfm: noDet ? emergency.cfm : 0 },
          { basis: '20 cfm/person (9.4 L/s·person) when occupied', cfm: 20 * num(m.occupants) },
          { basis: '0.5 cfm/ft² (2.54 L/s·m²) when occupied', cfm: 0.5 * area });
        break;
      }
      case 'cmc':
      default:
        rows.normal.push({ basis: 'Temperature control to 40 °C (104 °F)', cfm: tempCtl(104 - tsaF) });
        rows.emergency.push({ basis: 'Refrigerant charge: 100·√G (cfm, lb)', cfm: 100 * Math.sqrt(G) });
        emergency = pick(rows.emergency);
        rows.continuous.push({ basis: 'No detector / setpoint above max → emergency rate', cfm: noDet ? emergency.cfm : 0 },
          { basis: '0.5 cfm/ft² (2.54 L/s·m²)', cfm: 0.5 * area });
        break;
    }

    const toSI = (r) => ({ ...r, m3h: r.cfm * CFM_TO_M3H, ls: r.cfm * CFM_TO_LS, ach: vol > 0 ? r.cfm * 60 / vol : 0 });
    const result = {};
    for (const mode of ['normal', 'continuous', 'emergency']) {
      rows[mode] = rows[mode].map(toSI);
      const d = toSI(pick(rows[mode]));
      const inst = num(m.installed && m.installed[mode]);
      result[mode] = { rows: rows[mode], design: d, installed: inst, ok: inst > 0 ? inst >= d.m3h - 0.5 : null };
    }

    const checks = [];
    if (ammonia) {
      checks.push('At least two ammonia detectors: one at ≤ TLV-TWA (25 ppm) to start normal ventilation at full design capacity and alarm; one at ≤ 1000 ppm to start emergency ventilation (IIAR 2).');
      checks.push('Alarm to a monitored location; visual and audible alarms inside the machinery room and outside each entrance.');
      checks.push('Failure of any single fan must not reduce total ventilation below 20 ACH.');
      checks.push('Exhaust fans discharge vertically upward at ≥ 12.7 m/s (2500 fpm) with non-sparking blades.');
      checks.push('Make-up air keeps the room negative, not more than 62 Pa (0.25 in. w.c.).');
      checks.push('Ventilation operable manually as well as by detectors and thermostat; emergency ventilation switch outside the principal entrance.');
    }
    if (rows.normal.some((r) => !Number.isFinite(r.cfm))) {
      checks.unshift('⚠ Supply air is at or above the 40 °C room limit, so temperature control by ventilation alone is not possible: provide room cooling or electrical equipment rated above 40 °C (IIAR 2 exception).');
    }
    if (code === 'iiar2_2010' && tsaF > 99) {
      checks.unshift('Ambient design above 37.2 °C (99 °F): IIAR 2 permits the emergency ventilation system to supplement normal ventilation during extreme conditions.');
    }
    if (noDet) checks.unshift('⚠ No detector, or setpoint above the allowed maximum: continuous ventilation at the emergency rate is required.');

    return {
      code, codeName: codes[code].name, areaM2, volM3, tmrC: (tmrF - 32) * 5 / 9,
      env, envKW, motorKW, heatKW, ...result, checks,
    };
  }

  return { codes, newMachineryRoom, calcMachineryRoom, CFM_TO_M3H };
});
