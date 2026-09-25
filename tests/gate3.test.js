/*
 * Gate 3 (engine 1.1.0) — approved items G3-1 … G3-5, checked against the independent
 * hand calculations in docs/GATE-3-ENGINE-CHANGES.md. Defaults must reproduce engine 1.0.0
 * exactly (see regression.test.js, which is unchanged).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');
const M = require('../js/model.js');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
function chiller() {
  const p = M.newProject(); p.design.ambientDB = 35; p.design.ambientRH = 45;
  const r = M.newRoom('chiller'); p.rooms = [r];
  return [p, r];
}

test('G3-1: fan allowance is never negative', () => {
  const [p, r] = chiller();
  r.surfaces.forEach((s) => { s.adj = 'custom'; s.tAdj = -10; }); r.products = []; r.doors = []; r.internal = {};
  const x = C.calcRoom(r, p);
  assert.ok(x.subtotal < 0);
  assert.equal(x.equipment.fans, 0);
});

test('G3-2: product rate over pull-down — 12 h case 25.10 → 22.89 kW; 24 h unchanged', () => {
  const [p, r] = chiller();
  r.products[0].pullDown = 12;
  const cur = C.calcRoom(r, p).capacity;
  close(cur, 25.099, 0.001, 'daily basis (default)');
  r.productBasis = 'pulldown';
  const x = C.calcRoom(r, p);
  close(x.capacity, 22.891, 0.001, 'pull-down basis');
  const it = x.product.items[0];
  close(x.productRateAdjKW, it.kWhDay * 1.1 / 12 - it.kWhProduct * 1.1 / 18, 1e-9, 'adjustment');
  r.products[0].pullDown = 24;
  close(C.calcRoom(r, p).capacity, 20.231, 0.001, '24 h pull-down, pull-down basis');
  r.productBasis = 'daily';
  close(C.calcRoom(r, p).capacity, 20.231, 0.001, '24 h pull-down, daily basis');
});

test('G3-3: no credit for heat loss — 17.81 → 18.89 kW', () => {
  const [p, r] = chiller();
  r.surfaces[1].adj = 'custom'; r.surfaces[1].tAdj = -25;
  close(C.calcRoom(r, p).capacity, 17.813, 0.001, 'credit (default)');
  p.design.heatLossCredit = 'none';
  const x = C.calcRoom(r, p);
  close(x.capacity, 18.891, 0.001, 'no credit');
  const s = x.transmission.items[1];
  assert.equal(s.kW, 0); assert.ok(s.rawKW < 0); assert.ok(s.notCredited);
});

test('G3-4: entered c_p and latent heat replace Siebel values', () => {
  const [p, r] = chiller();
  const pr = r.products[0]; pr.tIn = 10; pr.tOut = -18; pr.Tf = -1.7; pr.xw = 72; r.cond.T = -18;
  const base = C.calcRoom(r, p).product.items[0];
  close(base.props.latent, 240.48, 0.01, 'Siebel');
  pr.hLat = 233; pr.cpA = 3.2; pr.cpB = 1.7;
  const x = C.calcRoom(r, p).product.items[0];
  close(x.qkg, 3.2 * 11.7 + 233 + 1.7 * 16.3, 1e-9, 'q with overrides');
  assert.deepEqual(x.overridden, { cpAbove: true, cpBelow: true, latent: true });
});

test('G3-5: incoming-produce respiration — 60 t/day × 30 W/t = 43.2 kWh/day', () => {
  const p = M.exampleProject();
  const r = p.rooms[1];
  const before = C.calcRoom(r, p).product.kWhResp;
  r.products[0].respIn = 30;
  const x = C.calcRoom(r, p);
  close(x.product.kWhResp - before, 43.2, 1e-9, 'added respiration');
  close(x.product.items[0].kWhRespIn, 43.2, 1e-9, 'item');
});

test('defaults: options absent ⇒ identical to engine 1.0.0 on the example project', () => {
  const p = M.exampleProject();
  const base = require('./fixtures/baseline-v1.json').rooms.example_project;
  p.rooms.forEach((r, i) => assert.equal(+C.calcRoom(r, p).capacity.toPrecision(10), base[i].capacity));
});

test('validation of Gate 3 fields', () => {
  const { validateProject } = require('../js/core/validate.js');
  const D = require('../js/data.js'), V = require('../js/vent.js');
  const [p, r] = chiller();
  r.products[0].hLat = -5; r.products[0].respIn = -1;
  const codes = validateProject(p, C, D, V).map((m) => m.code);
  assert.ok(codes.includes('M15') && codes.includes('M17'));
  const [q, s] = chiller(); s.surfaces[1].adj = 'custom'; s.surfaces[1].tAdj = -25; q.design.heatLossCredit = 'none';
  const qc = validateProject(q, C, D, V).map((m) => m.code);
  assert.ok(qc.includes('X08') && !qc.includes('X02'));
});
