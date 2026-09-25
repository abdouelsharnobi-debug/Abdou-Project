/* Freezing engine 1.0.0: hand calculations, validation, plant totals, lock. */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const F = require('../js/freeze.js');
const C = require('../js/calc.js');
const D = require('../js/data.js');
const M = require('../js/model.js');
const V = require('../js/vent.js');
const LIB = require('../js/core/products-tab.js');
const { validateProject } = require('../js/core/validate.js');
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('library imported from the workbook (kcal → kJ with 4.186)', () => {
  assert.equal(LIB.PRODUCTS.length, 113);
  const p = LIB.PRODUCTS.find((x) => x.name === 'Poultry, fresh');
  assert.deepEqual([p.Tf, p.cpA, p.cpB, p.hLat], [-1, 3.349, 1.8, 247]); // 0.80 / 0.43 / 59 kcal × 4.186
});

test('Plank: slab example by hand', () => {
  // 0.10 m slab, h 20 W/m²K + 0.01 m²K/W, k_f 1.4, ρ_f 1000, L 247 kJ/kg, T_f −1, T_m −35
  const t = F.newTunnel();
  const r = F.calcTunnel(t, M.newProject(), LIB.PRODUCTS);
  const h = 1 / (1 / 20 + 0.01);
  const plank = 1000 * 247000 / (-1 + 35) * (0.5 * 0.1 / h + 0.125 * 0.01 / 1.4) / 3600;
  close(r.freezing.plankH, plank, 1e-9, 'Plank');
  close(r.freezing.plankH, 7.86, 0.01, 'Plank ≈ 7.86 h');
});

test('Pham: slab example by hand (≈ 11.5 h)', () => {
  const r = F.calcTunnel(F.newTunnel(), M.newProject(), LIB.PRODUCTS);
  const h = 1 / (1 / 20 + 0.01), d = 0.05, Tfm = 1.8 + 0.263 * -18 + 0.105 * -35;
  const dH1 = 1050 * 3349 * (5 - Tfm), dH2 = 1000 * (247000 + 1800 * (Tfm + 18));
  const dT1 = (5 + Tfm) / 2 + 35, dT2 = Tfm + 35, Bi = h * d / 1.4;
  const t = d / (1 * h) * (dH1 / dT1 + dH2 / dT2) * (1 + Bi / 2) / 3600;
  close(r.freezing.phamH, t, 1e-9, 'Pham');
  close(r.freezing.phamH, 11.48, 0.01, 'Pham ≈ 11.48 h');
  // Plank and Pham agree in form: sphere/cylinder factors
  const s = F.calcTunnel({ ...F.newTunnel(), shape: 'sphere' }, M.newProject(), LIB.PRODUCTS);
  assert.ok(s.freezing.phamH < r.freezing.phamH / 2.5, 'sphere freezes ~3× faster than slab of same D');
});

test('workbook continuous-flow load and Q ÷ (1 − x)', () => {
  const r = F.calcTunnel(F.newTunnel(), M.newProject(), LIB.PRODUCTS);
  const q = 3.349 * (5 + 1) + 247 + 1.8 * (-1 + 18);
  close(r.q, q, 1e-9, 'q');
  const mdot = 10000 / r.tFreeze;
  close(r.mdot, mdot, 1e-9, 'ṁ');
  close(r.breakdown[0].kW, mdot * q / 3600, 1e-9, 'Q product');
  close(r.total, r.subtotal / 0.9, 1e-9, 'loss ÷ (1 − x)');
  const f2 = F.calcTunnel({ ...F.newTunnel(), lossMethod: 'factor' }, M.newProject(), LIB.PRODUCTS);
  close(f2.total, f2.subtotal * 1.1, 1e-9, 'loss × (1 + x)');
  const cont = F.calcTunnel({ ...F.newTunnel(), mode: 'continuous', throughput: 2000, belt: { area: 1.2, h: 0.4, tAdj: 10, rhAdj: 70, E: 0.5 } }, M.newProject(), LIB.PRODUCTS);
  close(cont.mdot, 2000, 0, 'continuous throughput'); assert.ok(cont.breakdown[4].kW > 0, 'belt infiltration');
  const ent = F.calcTunnel({ ...F.newTunnel(), timeBasis: 'entered', tDesign: 8 }, M.newProject(), LIB.PRODUCTS);
  close(ent.mdot, 1250, 1e-9, 'entered time 8 h');
});

test('validation of tunnels', () => {
  const p = M.newProject(); const t = F.newTunnel();
  p.tunnels = [t];
  assert.equal(validateProject(p, C, D, V).filter((m) => m.tunnel === 0 && m.level === 'error').length, 0, 'default tunnel has no errors');
  const bad = { ...F.newTunnel(), Tm: 0, Tc: -40, batchKg: 0, D: 0, timeBasis: 'entered', tDesign: 2 };
  p.tunnels = [bad];
  const codes = validateProject(p, C, D, V).filter((m) => m.tunnel === 0).map((m) => m.code);
  for (const c of ['F01', 'F02', 'F05', 'F06']) assert.ok(codes.includes(c), c);
  const fish = { ...F.newTunnel(), product: { ...F.newTunnel().product, libId: LIB.PRODUCTS.find((x) => x.name === 'Fish, fresh').id } };
  p.tunnels = [fish];
  assert.ok(validateProject(p, C, D, V).some((m) => m.code === 'F08'), 'tabulated freezing point above 0 °C is flagged');
  const short = { ...F.newTunnel(), timeBasis: 'entered', tDesign: 5 };
  p.tunnels = [short];
  assert.ok(validateProject(p, C, D, V).some((m) => m.code === 'F10'), 'design time shorter than Pham');
});

test('plant totals: rooms unchanged, tunnels added to their suction level', () => {
  const p = M.exampleProject();
  const rooms = C.calcProject(p);
  const noTunnel = F.calcPlant(p, LIB.PRODUCTS);
  assert.equal(noTunnel.totalKW, rooms.totalKW);
  p.tunnels = [F.newTunnel()];
  const pl = F.calcPlant(p, LIB.PRODUCTS);
  close(pl.totalKW, rooms.totalKW + pl.tunnels[0].res.capacity, 1e-9, 'total');
  const lvl = pl.levels.find((l) => l.sst === Math.round(pl.tunnels[0].res.sst));
  assert.ok(lvl.rooms.includes(p.tunnels[0].name));
});

test('freezing engine 1.0.0 file is locked', () => {
  const lock = require('./fixtures/freeze-1.0.0.sha256.json');
  assert.equal(F.VERSION, '1.0.0');
  for (const [f, hsh] of Object.entries(lock)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', f))).digest('hex'), hsh, `${f} changed — bump the freezing engine version`);
});
