/*
 * Independent benchmark (Gate 4 QA/QC): the JavaScript engine is compared component by
 * component with a separate Python implementation (tools/benchmark_independent.py) written
 * directly from the published formulas. Tolerance 0.01 % (floating-point only).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');
const inputs = require('./fixtures/benchmark-inputs.json');
const expected = require('./fixtures/benchmark-expected.json');

const KEYS = ['transmission', 'product', 'packaging', 'respiration', 'infiltration', 'ventilation', 'people', 'lights', 'forklifts', 'other', 'fans', 'defrost'];
const ok = (a, b) => Math.abs(a - b) <= Math.max(1e-6, 1e-4 * Math.abs(b));

for (const [name, proj] of Object.entries(inputs.cases)) {
  test(`independent benchmark: ${name}`, () => {
    proj.rooms.forEach((room, i) => {
      const res = C.calcRoom(room, proj), exp = expected[name][i];
      for (const k of KEYS) {
        const v = res.breakdown.find((b) => b.key === k).kWh;
        assert.ok(ok(v, exp[k]), `${name}/${room.name} ${k}: engine ${v} vs independent ${exp[k]}`);
      }
      for (const k of ['subtotal', 'total', 'capacity']) assert.ok(ok(res[k], exp[k]), `${name}/${room.name} ${k}: engine ${res[k]} vs independent ${exp[k]}`);
    });
  });
}
