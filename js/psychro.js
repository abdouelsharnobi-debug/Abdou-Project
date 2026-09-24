/*
 * Psychrometric properties of moist air (SI).
 * Equations: ASHRAE Handbook—Fundamentals, Ch. 1 "Psychrometrics"
 * (Hyland–Wexler saturation pressure, ideal-gas moist-air relations).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.Psychro = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Saturation vapour pressure [kPa] over ice (t < 0 °C) or liquid water (t ≥ 0 °C). */
  function pws(t) {
    const T = t + 273.15;
    let ln;
    if (t < 0) {
      ln = -5.6745359e3 / T + 6.3925247 - 9.677843e-3 * T + 6.2215701e-7 * T * T +
        2.0747825e-9 * T ** 3 - 9.484024e-13 * T ** 4 + 4.1635019 * Math.log(T);
    } else {
      ln = -5.8002206e3 / T + 1.3914993 - 4.8640239e-2 * T + 4.1764768e-5 * T * T -
        1.4452093e-8 * T ** 3 + 6.5459673 * Math.log(T);
    }
    return Math.exp(ln) / 1000;
  }

  /** Standard atmospheric pressure [kPa] at altitude z [m]. */
  function pressure(z) {
    return 101.325 * Math.pow(1 - 2.25577e-5 * (z || 0), 5.2559);
  }

  /** Humidity ratio [kg/kg dry air]. */
  function humRatio(t, rh, p) {
    const pw = Math.max(0, Math.min(100, rh)) / 100 * pws(t);
    return 0.621945 * pw / (p - pw);
  }

  /** Specific enthalpy [kJ/kg dry air]. */
  function enthalpy(t, W) {
    return 1.006 * t + W * (2501 + 1.86 * t);
  }

  /** Specific volume [m³/kg dry air]. */
  function specVol(t, W, p) {
    return 0.287042 * (t + 273.15) * (1 + 1.607858 * W) / p;
  }

  /** Full state of moist air at dry bulb t [°C], relative humidity rh [%], pressure p [kPa]. */
  function state(t, rh, p) {
    const W = humRatio(t, rh, p);
    const v = specVol(t, W, p);
    return { t, rh, p, W, h: enthalpy(t, W), v, rho: (1 + W) / v };
  }

  return { pws, pressure, humRatio, enthalpy, specVol, state };
});
