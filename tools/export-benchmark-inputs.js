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
const F = require('../js/freeze.js');
const LIB = require('../js/core/products-tab.js');
const tunnelCase = (mut) => { const p = M.newProject(); const t = F.newTunnel(); mut(t, p); p.tunnels = [t]; return p; };
const tunnels = {
  tunnel_batch_poultry_slab: () => tunnelCase(() => {}),
  tunnel_batch_fish_cylinder_plank: () => tunnelCase((t) => { t.shape = 'cylinder'; t.D = 0.08; t.timeBasis = 'plank'; t.product.libId = LIB.PRODUCTS.find((x) => x.name.startsWith('Cod')).id; t.Tm = -40; t.trolleyKg = 1500; t.peak = 1.2; }),
  tunnel_continuous_peas_sphere: () => tunnelCase((t) => { t.mode = 'continuous'; t.shape = 'sphere'; t.D = 0.009; t.hAir = 60; t.Rpack = 0; t.throughput = 3000; t.product.libId = LIB.PRODUCTS.find((x) => x.name.startsWith('Peas')).id; t.Ti = 10; t.Tc = -18; t.belt = { area: 1.5, h: 0.3, tAdj: 12, rhAdj: 70, E: 0.4 }; t.lossMethod = 'factor'; t.fanKW = 55; }),
  tunnel_entered_time_overrides: () => tunnelCase((t) => { t.timeBasis = 'entered'; t.tDesign = 14; t.product.Tf = -2.2; t.product.cpA = 3.5; t.product.hLat = 250; t.T2 = -20; }),
};
const all = { ...cases, ...extra, ...tunnels };
const out = { lib: LIB.PRODUCTS, data: { insulation: D.insulation, film: D.film, sunEffect: D.sunEffect, doorProtection: D.doorProtection, packaging: D.packaging, products: D.products, airChanges: D.airChanges, usageFactors: D.usageFactors, roomTypes: D.roomTypes }, cases: {} };
for (const [k, f] of Object.entries(all)) out.cases[k] = f();
fs.writeFileSync(path.join(__dirname, '..', 'tests', 'fixtures', 'benchmark-inputs.json'), JSON.stringify(out));
console.log('exported', Object.keys(out.cases).length, 'cases');
