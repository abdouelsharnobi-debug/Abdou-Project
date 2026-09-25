/* Export benchmark inputs + reference data for the independent Python check. */
const fs = require('fs');
const path = require('path');
const D = require('../js/data.js');
const M = require('../js/model.js');
const { cases } = require('../tests/baseline-cases.js');

const extra = {
  chilling_room_pulldown_12h: () => { const p = cases.cold_room_chiller(); p.rooms[0].products[0].pullDown = 12; return p; },
  chilling_room_rate_basis: () => { const p = cases.cold_room_chiller(); p.rooms[0].products[0].pullDown = 12; p.rooms[0].productBasis = 'pulldown'; return p; },
  no_credit_adjacent_freezer: () => { const p = cases.cold_room_chiller(); const s = p.rooms[0].surfaces[1]; s.adj = 'custom'; s.tAdj = -25; p.design.heatLossCredit = 'none'; return p; },
  product_props_and_intake_resp: () => { const p = cases.fruit_store_respiration(); Object.assign(p.rooms[0].products[0], { cpA: 3.7, hLat: 280, respIn: 30 }); return p; },
};
const all = { ...cases, ...extra };
const out = { data: { insulation: D.insulation, film: D.film, sunEffect: D.sunEffect, doorProtection: D.doorProtection, packaging: D.packaging, products: D.products, airChanges: D.airChanges, usageFactors: D.usageFactors, roomTypes: D.roomTypes }, cases: {} };
for (const [k, f] of Object.entries(all)) out.cases[k] = f();
fs.writeFileSync(path.join(__dirname, '..', 'tests', 'fixtures', 'benchmark-inputs.json'), JSON.stringify(out));
console.log('exported', Object.keys(out.cases).length, 'cases');
