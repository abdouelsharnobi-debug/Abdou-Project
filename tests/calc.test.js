/* Unit tests: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/psychro.js');
const C = require('../js/calc.js');
const M = require('../js/model.js');
const V = require('../js/vent.js');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('psychrometrics match ASHRAE tables', () => {
  close(P.pws(20), 2.3392, 0.002, 'pws 20 °C');
  close(P.pws(-20), 0.10326, 0.0005, 'pws −20 °C over ice');
  close(P.pressure(0), 101.325, 1e-6, 'sea level');
  const s = P.state(35, 40, 101.325); // ≈ 0.0141 kg/kg, 71.4 kJ/kg
  close(s.W, 0.0141, 0.0003, 'W');
  close(s.h, 71.3, 0.6, 'h');
});

test('U-value of 100 mm PUR panel ≈ JCI table 0.21 W/m²K', () => {
  const U = C.surfaceU({ ins: 'PUR', thk: 100, adj: 'ambient' });
  close(U, 0.21, 0.01, 'U');
});

test('Siebel product heat: beef 72 % water from +10 to −18 °C', () => {
  const pr = C.productProps(72);
  close(pr.cpAbove, 3.252, 1e-3, 'cp above');
  close(pr.latent, 240.5, 0.1, 'latent');
  const q = C.productHeatPerKg(10, -18, -1.7, pr);
  // 3.252·11.7 + 240.48 + 1.747·16.3
  close(q, 3.252 * 11.7 + 240.48 + 1.7472 * 16.3, 0.1, 'q');
});

test('transmission load of example freezer ≈ hand calculation', () => {
  const p = M.exampleProject();
  const r = C.calcRoom(p.rooms[0], p);
  close(r.transmission.kWh, 625, 10, 'kWh/day');
  close(r.capacity, r.total / r.runHours, 1e-9, 'capacity');
});

test('Gosney–Olama load is zero with equal air states and grows with ΔT', () => {
  const s1 = P.state(0, 80, 101.325), s2 = P.state(30, 50, 101.325), s3 = P.state(-25, 80, 101.325);
  assert.equal(C.doorOpenLoad(6, 3, s1, s1).q, 0);
  assert.ok(C.doorOpenLoad(6, 3, s3, s2).q > C.doorOpenLoad(6, 3, s1, s2).q);
});

test('air change methods', () => {
  // Dossat table: 1000 ft³ → 17.5 (above 0 °C)
  close(C.airChangesPerDay(1000 / 35.3147, false).n, 17.5, 0.01, 'table point');
  const p = M.exampleProject(); const room = p.rooms[0];
  room.infMethod = 'airchange'; room.airChange.method = 'store';
  const V1 = room.dims.L * room.dims.W * room.dims.H;
  close(C.calcRoom(room, p).infiltration.airChange.n, 70 / Math.sqrt(V1), 1e-9, '70/√V');
});

test('IIAR 2-2008 Add. A machinery room rates', () => {
  const m = V.newMachineryRoom();
  const r = V.calcMachineryRoom(m);
  const vol = m.L * m.W * m.H;
  close(r.emergency.design.m3h, vol * 30, 1, '30 ACH');
  assert.ok(r.normal.design.m3h >= vol * 20 - 1, 'normal ≥ 20 ACH');
  m.code = 'iiar2_1992';
  close(V.calcMachineryRoom(m).emergency.design.cfm, 100 * Math.sqrt(m.chargeKg * 2.20462), 0.5, '100√G');
});
