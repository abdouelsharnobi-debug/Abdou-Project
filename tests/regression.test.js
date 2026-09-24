/* Engine regression: current results must equal the recorded v1.0 baseline. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');
const V = require('../js/vent.js');
const baseline = require('./fixtures/baseline-v1.json');
const { cases, ventCases } = require('./baseline-cases.js');
const { snapshotRoom, snapshotVent } = require('./snapshot.js');

for (const [k, f] of Object.entries(cases)) {
  test(`room regression: ${k}`, () => {
    const p = f();
    assert.deepEqual(p.rooms.map((r) => snapshotRoom(r, C.calcRoom(r, p))), baseline.rooms[k]);
  });
}
for (const [k, f] of Object.entries(ventCases)) {
  test(`ventilation regression: ${k}`, () => assert.deepEqual(snapshotVent(V.calcMachineryRoom(f())), baseline.vent[k]));
}
