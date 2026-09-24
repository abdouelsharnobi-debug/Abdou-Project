/*
 * Regression cases for the calculation engine. Each case builds a project with the
 * current model factories so the recorded baseline reflects engine v1.0 behaviour.
 */
const M = require('../js/model.js');
const D = require('../js/data.js');
const V = require('../js/vent.js');

function roomCase(type, mutate) {
  const p = M.newProject();
  p.design = { ...p.design, ambientDB: 35, ambientRH: 45, altitude: 0, groundTemp: 10 };
  const r = M.newRoom(type);
  if (mutate) mutate(r, p);
  p.rooms = [r];
  return p;
}

const cases = {
  example_project: () => M.exampleProject(),
  cold_room_chiller: () => roomCase('chiller'),
  fruit_store_respiration: () => roomCase('produce', (r) => {
    r.products = [{ ...M.newProduct(1), productId: 'apples', mass: 20000, tIn: 20, tOut: 1, stored: 300000 }];
  }),
  freezer_store: () => roomCase('freezer'),
  blast_freezer_freezing: () => roomCase('blast', (r) => {
    r.dims = { L: 8, W: 6, H: 5 };
    r.products = [{ ...M.newProduct(-35), productId: 'poultry', mass: 20000, tIn: 5, tOut: -18, pullDown: 12 }];
    r.doors[0].passages = 6;
  }),
  processing_room_people: () => roomCase('processing', (r) => {
    r.internal = { ...r.internal, people: 40, peopleHours: 16, lightsWm2: 15, lightsHours: 16, otherKW: 25, otherHours: 16 };
    r.ventilation = { m3h: 2000, hours: 16 };
  }),
  ripening_room_ventilation: () => roomCase('ripening', (r) => {
    r.products = [{ ...M.newProduct(14), productId: 'bananas', mass: 20000, tIn: 20, tOut: 14, stored: 20000 }];
    r.ventilation = { m3h: 150, hours: 24 };
  }),
  anteroom_door_heavy: () => roomCase('anteroom', (r) => {
    r.doors = [{ ...M.newDoor(), passages: 400, openSec: 25, standMin: 120, protection: 'none' }];
  }),
  airchange_store: () => roomCase('chiller', (r) => { r.infMethod = 'airchange'; r.airChange.method = 'store'; }),
  airchange_dock: () => roomCase('anteroom', (r) => { r.infMethod = 'airchange'; r.airChange.method = 'dock'; r.airChange.fn = 2; }),
  airchange_dossat_small: () => roomCase('chiller', (r) => {
    r.dims = { L: 5, W: 4, H: 3 }; r.infMethod = 'airchange'; r.airChange.method = 'dossat'; r.airChange.usage = 'heavy';
  }),
  fans_kw_defrost: () => roomCase('freezer', (r) => {
    r.equipment = { ...r.equipment, fanMode: 'kw', fanKW: 12, fanHours: 22, defrostKW: 80, defrostPerDay: 4, defrostMin: 25, defrostFrac: 40 };
  }),
  sun_and_adjacent: () => roomCase('chiller', (r) => {
    r.surfaces.forEach((s) => { if (s.adj === 'ambient') s.sun = 'dark'; });
    r.surfaces[1].adj = 'custom'; r.surfaces[1].tAdj = 5;
  }),
};

const ventCases = Object.fromEntries(Object.keys(V.codes).map((code) => [
  `vent_${code}`, () => ({ ...V.newMachineryRoom(), code }),
]));
ventCases.vent_nodetector_basement = () => ({ ...V.newMachineryRoom(), code: 'iiar2_1999', detector: 'no', basement: 'yes' });
ventCases.vent_hot_climate = () => ({ ...V.newMachineryRoom(), toaC: 46, tsaC: 46 });

module.exports = { cases, ventCases, D };
