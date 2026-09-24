/* Record engine results for all regression cases → tests/fixtures/baseline-v1.json */
const fs = require('fs');
const path = require('path');
const C = require('../js/calc.js');
const V = require('../js/vent.js');
const { cases, ventCases } = require('../tests/baseline-cases.js');
const { snapshotRoom, snapshotVent } = require('../tests/snapshot.js');

const out = { engine: '1.0.0', recorded: new Date().toISOString(), rooms: {}, vent: {} };
for (const [k, f] of Object.entries(cases)) {
  const p = f();
  out.rooms[k] = p.rooms.map((r) => snapshotRoom(r, C.calcRoom(r, p)));
}
for (const [k, f] of Object.entries(ventCases)) out.vent[k] = snapshotVent(V.calcMachineryRoom(f()));
const file = path.join(__dirname, '..', 'tests', 'fixtures', 'baseline-v1.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log('Recorded', Object.keys(out.rooms).length, 'room cases and', Object.keys(out.vent).length, 'ventilation cases');
