/*
 * Central unit system. Engine data is always stored in SI; conversion happens only when
 * values are displayed or typed. Quantity kinds are referenced by name from the UI.
 */
(function (root) {
  'use strict';
  const F = (c) => c * 9 / 5 + 32, C = (f) => (f - 32) * 5 / 9;

  // kind: [SI label, IP label, toIP(si), toSI(ip)]
  const KINDS = {
    temp: ['°C', '°F', F, C],
    dT: ['K', '°F', (x) => x * 1.8, (x) => x / 1.8],
    len: ['m', 'ft', (x) => x * 3.28084, (x) => x / 3.28084],
    mm: ['mm', 'in', (x) => x / 25.4, (x) => x * 25.4],
    area: ['m²', 'ft²', (x) => x * 10.7639, (x) => x / 10.7639],
    vol: ['m³', 'ft³', (x) => x * 35.3147, (x) => x / 35.3147],
    mass: ['kg', 'lb', (x) => x * 2.20462, (x) => x / 2.20462],
    massDay: ['kg/day', 'lb/day', (x) => x * 2.20462, (x) => x / 2.20462],
    massRate: ['kg/h', 'lb/h', (x) => x * 2.20462, (x) => x / 2.20462],
    flow: ['m³/h', 'cfm', (x) => x / 1.699011, (x) => x * 1.699011],
    U: ['W/m²K', 'Btu/h·ft²·°F', (x) => x / 5.678263, (x) => x * 5.678263],
    Wm2: ['W/m²', 'W/ft²', (x) => x / 10.7639, (x) => x * 10.7639],
    cp: ['kJ/kg·K', 'Btu/lb·°F', (x) => x / 4.1868, (x) => x * 4.1868],
    kJkg: ['kJ/kg', 'Btu/lb', (x) => x / 2.326, (x) => x * 2.326],
    Rval: ['m²K/W', 'h·ft²·°F/Btu', (x) => x * 5.678263, (x) => x / 5.678263],
  };

  // Power units are chosen independently of SI/IP.
  const POWER = {
    kW: { label: 'kW', f: 1, d: 1 },
    TR: { label: 'TR', f: 1 / 3.51685, d: 1 },
    Btuh: { label: 'Btu/h', f: 3412.14, d: 0 },
    kcalh: { label: 'kcal/h', f: 859.845, d: 0 },
  };

  let system = 'SI', power = 'kW';

  function set(opts) { if (opts.system) system = opts.system; if (opts.power && POWER[opts.power]) power = opts.power; }
  const get = () => ({ system, power });
  const label = (kind) => (KINDS[kind] ? KINDS[kind][system === 'IP' ? 1 : 0] : kind || '');
  function toDisplay(kind, v) {
    if (v === '' || v == null || !Number.isFinite(+v) || !KINDS[kind] || system === 'SI') return v;
    return +KINDS[kind][2](+v).toPrecision(12);
  }
  function fromDisplay(kind, v) {
    if (v === '' || v == null || !Number.isFinite(+v) || !KINDS[kind] || system === 'SI') return v;
    return +KINDS[kind][3](+v).toPrecision(12);
  }
  const pw = (kW) => kW * POWER[power].f;
  const pwLabel = () => POWER[power].label;
  const pwDigits = () => POWER[power].d;

  const api = { KINDS, POWER, set, get, label, toDisplay, fromDisplay, pw, pwLabel, pwDigits };
  root.CL = root.CL || {};
  root.CL.units = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
