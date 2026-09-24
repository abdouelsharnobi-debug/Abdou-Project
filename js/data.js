/*
 * Reference data for industrial refrigeration heat-load calculations.
 *
 * Sources (typical design values — always verify against the project basis of design):
 *  - ASHRAE Handbook—Refrigeration: "Refrigerated-Facility Loads", "Thermal Properties of Foods",
 *    "Commodity Storage Requirements", "Refrigerated-Facility Design".
 *  - W. F. Stoecker, Industrial Refrigeration Handbook (McGraw-Hill), refrigeration load chapter.
 *  - R. J. Dossat, Principles of Refrigeration — cooling load calculations (air-change method,
 *    product load, occupancy and miscellaneous loads).
 *  - ANSI/IIAR 2 & IIAR 9 for ammonia system design/safety notes shown in the report.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.HLData = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Thermal conductivity k [W/(m·K)] of common cold-store insulation. */
  const insulation = {
    PUR: { name: 'Polyurethane (PUR) panel', k: 0.022 },
    PIR: { name: 'Polyisocyanurate (PIR) panel', k: 0.022 },
    XPS: { name: 'Extruded polystyrene (XPS)', k: 0.030 },
    EPS: { name: 'Expanded polystyrene (EPS)', k: 0.036 },
    MW: { name: 'Mineral wool (fire-rated panel)', k: 0.040 },
    CG: { name: 'Cellular glass', k: 0.042 },
    CORK: { name: 'Cork board', k: 0.043 },
    NONE: { name: 'No insulation', k: 1 },
  };

  /** Surface film coefficients [W/(m²·K)] — still air inside, 24 km/h wind outside. */
  const film = { inside: 9.4, outside: 34, adjacent: 9.4 };

  /**
   * Sun-effect allowance [K] added to outdoor design temperature (ASHRAE Refrigeration,
   * "Refrigerated-Facility Loads", allowance for sun effect). Orientation is for the
   * northern hemisphere; swap N/S south of the equator.
   */
  const sunEffect = {
    none: { E: 0, S: 0, W: 0, N: 0, roof: 0 },
    light: { E: 3, S: 2, W: 3, N: 0, roof: 5 },
    medium: { E: 4, S: 3, W: 4, N: 0, roof: 9 },
    dark: { E: 5, S: 3, W: 5, N: 0, roof: 11 },
  };

  /** Door protection effectiveness E (ASHRAE: strip curtains 0.85–0.95 new, air curtains lower). */
  const doorProtection = {
    none: { name: 'None', E: 0 },
    strip: { name: 'PVC strip curtain', E: 0.85 },
    aircurtain: { name: 'Air curtain', E: 0.6 },
    vestibule: { name: 'Refrigerated vestibule / anteroom', E: 0.7 },
    custom: { name: 'Custom E', E: 0 },
  };

  /** Packaging / handling material specific heat [kJ/(kg·K)]. */
  const packaging = {
    cardboard: { name: 'Corrugated cardboard', cp: 1.34 },
    wood: { name: 'Wooden pallets / crates', cp: 2.5 },
    plastic: { name: 'Plastic crates / film (PE, PP)', cp: 1.9 },
    steel: { name: 'Steel trays / racks', cp: 0.5 },
    aluminium: { name: 'Aluminium trays', cp: 0.9 },
  };

  /**
   * Commodities: water content xw [%], initial freezing point Tf [°C],
   * respiration heat [W/t] at typical storage temperature (fresh produce only).
   * Specific heats and latent heat are derived with Siebel's equations (see calc.js).
   * Values after ASHRAE Handbook—Refrigeration "Thermal Properties of Foods" (typical).
   */
  const products = [
    // Meat & poultry
    { id: 'beef_carcass', group: 'Meat & poultry', name: 'Beef carcass', xw: 62, Tf: -2.2, resp: 0 },
    { id: 'beef_lean', group: 'Meat & poultry', name: 'Beef, lean cuts', xw: 72, Tf: -1.7, resp: 0 },
    { id: 'pork_carcass', group: 'Meat & poultry', name: 'Pork carcass', xw: 55, Tf: -2.2, resp: 0 },
    { id: 'lamb', group: 'Meat & poultry', name: 'Lamb / mutton', xw: 64, Tf: -1.9, resp: 0 },
    { id: 'poultry', group: 'Meat & poultry', name: 'Poultry (chicken, whole)', xw: 74, Tf: -2.8, resp: 0 },
    { id: 'sausage', group: 'Meat & poultry', name: 'Sausage / processed meat', xw: 56, Tf: -3.4, resp: 0 },
    // Fish
    { id: 'fish_lean', group: 'Fish & seafood', name: 'Fish, lean (cod, hake)', xw: 81, Tf: -2.2, resp: 0 },
    { id: 'fish_fatty', group: 'Fish & seafood', name: 'Fish, fatty (salmon, mackerel)', xw: 69, Tf: -2.2, resp: 0 },
    { id: 'shrimp', group: 'Fish & seafood', name: 'Shrimp', xw: 76, Tf: -2.2, resp: 0 },
    // Dairy & eggs
    { id: 'milk', group: 'Dairy & eggs', name: 'Milk, whole', xw: 88, Tf: -0.6, resp: 0 },
    { id: 'butter', group: 'Dairy & eggs', name: 'Butter', xw: 16, Tf: -2.0, resp: 0 },
    { id: 'cheese', group: 'Dairy & eggs', name: 'Cheese, cheddar', xw: 37, Tf: -12.9, resp: 0 },
    { id: 'icecream', group: 'Dairy & eggs', name: 'Ice cream', xw: 61, Tf: -5.6, resp: 0 },
    { id: 'eggs', group: 'Dairy & eggs', name: 'Eggs, in shell', xw: 66, Tf: -2.2, resp: 0 },
    // Fruit
    { id: 'apples', group: 'Fruit', name: 'Apples', xw: 84, Tf: -1.1, resp: 10 },
    { id: 'pears', group: 'Fruit', name: 'Pears', xw: 84, Tf: -1.6, resp: 10 },
    { id: 'oranges', group: 'Fruit', name: 'Oranges', xw: 87, Tf: -0.8, resp: 15 },
    { id: 'lemons', group: 'Fruit', name: 'Lemons', xw: 89, Tf: -1.4, resp: 20 },
    { id: 'bananas', group: 'Fruit', name: 'Bananas (13–14 °C)', xw: 75, Tf: -0.8, resp: 60 },
    { id: 'grapes', group: 'Fruit', name: 'Grapes', xw: 81, Tf: -2.1, resp: 5 },
    { id: 'strawberries', group: 'Fruit', name: 'Strawberries', xw: 91, Tf: -0.8, resp: 40 },
    { id: 'cherries', group: 'Fruit', name: 'Cherries, sweet', xw: 82, Tf: -1.8, resp: 12 },
    { id: 'peaches', group: 'Fruit', name: 'Peaches', xw: 89, Tf: -0.9, resp: 12 },
    { id: 'mangoes', group: 'Fruit', name: 'Mangoes (10–13 °C)', xw: 83, Tf: -0.9, resp: 40 },
    { id: 'dates', group: 'Fruit', name: 'Dates, semi-dry', xw: 20, Tf: -15.7, resp: 0 },
    // Vegetables
    { id: 'tomatoes', group: 'Vegetables', name: 'Tomatoes, ripe (10 °C)', xw: 94, Tf: -0.5, resp: 30 },
    { id: 'potatoes', group: 'Vegetables', name: 'Potatoes', xw: 79, Tf: -0.8, resp: 20 },
    { id: 'onions', group: 'Vegetables', name: 'Onions, dry', xw: 89, Tf: -0.9, resp: 8 },
    { id: 'carrots', group: 'Vegetables', name: 'Carrots', xw: 88, Tf: -1.4, resp: 30 },
    { id: 'cabbage', group: 'Vegetables', name: 'Cabbage', xw: 92, Tf: -0.9, resp: 15 },
    { id: 'lettuce', group: 'Vegetables', name: 'Lettuce', xw: 95, Tf: -0.2, resp: 40 },
    { id: 'broccoli', group: 'Vegetables', name: 'Broccoli', xw: 90, Tf: -0.6, resp: 70 },
    { id: 'mushrooms', group: 'Vegetables', name: 'Mushrooms', xw: 92, Tf: -0.9, resp: 80 },
    { id: 'frozen_veg', group: 'Vegetables', name: 'Vegetables for freezing (general)', xw: 90, Tf: -1.0, resp: 0 },
    // Other
    { id: 'beer', group: 'Other', name: 'Beer', xw: 90, Tf: -2.2, resp: 0 },
    { id: 'water', group: 'Other', name: 'Water / ice', xw: 100, Tf: 0, resp: 0 },
    { id: 'custom', group: 'Other', name: 'Custom product', xw: 75, Tf: -1.5, resp: 0 },
  ];

  /**
   * Room presets — temperature, RH, compressor run time and evaporator TD (typical practice;
   * ASHRAE: 16–18 h/day for coolers with off-cycle defrost, 18–20 h for freezers).
   */
  const roomTypes = {
    chiller: { name: 'Chilled store (0…+4 °C)', T: 2, RH: 85, runHours: 18, TD: 6 },
    produce: { name: 'Fruit & vegetable store (high RH)', T: 1, RH: 90, runHours: 18, TD: 4.5 },
    ripening: { name: 'Ripening room', T: 14, RH: 90, runHours: 18, TD: 5 },
    freezer: { name: 'Frozen store (−18…−30 °C)', T: -25, RH: 85, runHours: 20, TD: 7 },
    blast: { name: 'Blast freezer (−35…−40 °C)', T: -35, RH: 85, runHours: 20, TD: 8 },
    anteroom: { name: 'Anteroom / loading dock', T: 5, RH: 75, runHours: 18, TD: 8 },
    processing: { name: 'Processing / packing room', T: 10, RH: 70, runHours: 20, TD: 8 },
    custom: { name: 'Custom', T: 0, RH: 85, runHours: 18, TD: 6 },
  };

  /** Recommended evaporator TD [K] by room RH (common coil-selection practice, ASHRAE). */
  function recommendedTD(rh) {
    if (rh >= 90) return 4.5;
    if (rh >= 85) return 5.5;
    if (rh >= 80) return 6.5;
    if (rh >= 75) return 8;
    return 10;
  }

  /** Typical factory-panel PUR/PIR thickness [mm] by room temperature (industry practice). */
  function typicalInsulation(T) {
    if (T >= 5) return 80;
    if (T >= -5) return 100;
    if (T >= -18) return 150;
    if (T >= -28) return 175;
    return 200;
  }

  /**
   * Average air changes per 24 h due to door opening and infiltration vs room volume
   * (Dossat, Principles of Refrigeration; same data in ASHRAE). Volume in ft³ as tabulated;
   * [volume ft³, rooms above 0 °C, rooms below 0 °C]. Multiply by the usage factor.
   */
  const airChanges = [
    [200, 44.0, 33.5], [300, 34.5, 26.2], [400, 29.5, 22.5], [500, 26.0, 20.0], [600, 23.0, 18.0],
    [800, 20.0, 15.3], [1000, 17.5, 13.5], [1500, 14.0, 11.0], [2000, 12.0, 9.3], [3000, 9.5, 7.4],
    [4000, 8.2, 6.3], [5000, 7.2, 5.6], [6000, 6.5, 5.0], [8000, 5.5, 4.3], [10000, 4.9, 3.8],
    [15000, 3.9, 3.0], [20000, 3.5, 2.6], [25000, 3.0, 2.3], [30000, 2.7, 2.1], [40000, 2.3, 1.8],
    [50000, 2.0, 1.6], [75000, 1.6, 1.3], [100000, 1.4, 1.1],
  ];

  /** Usage factors applied to tabulated air changes (Dossat). */
  const usageFactors = {
    average: { name: 'Average usage', f: 1.0 },
    heavy: { name: 'Heavy usage (×2)', f: 2.0 },
    storage: { name: 'Long-term storage, light usage (×0.6)', f: 0.6 },
  };

  const refrigerants = ['R717 (Ammonia)', 'R744 (CO₂)', 'R717/R744 cascade', 'R507A', 'R448A', 'R449A', 'R404A', 'Glycol / brine secondary'];

  return {
    insulation, film, sunEffect, doorProtection, packaging, products, roomTypes,
    recommendedTD, typicalInsulation, refrigerants, airChanges, usageFactors,
  };
});
