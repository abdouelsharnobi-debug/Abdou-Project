/* Project / room factories and the bundled example project. */
(function (root, factory) {
  const req = typeof require === 'function';
  const mod = factory(root.HLData || (req && require('./data.js')), root.HLVent || (req && require('./vent.js')));
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.HLModel = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D, V) {
  'use strict';

  const uid = () => Math.random().toString(36).slice(2, 10);

  function newSurfaces(T) {
    const thk = D.typicalInsulation(T);
    const wall = (key, label, orient) => ({ key, label, adj: 'ambient', tAdj: 25, ins: 'PUR', thk, sun: 'none', orient, areaOverride: '', uOverride: '', rExtra: 0 });
    return [
      wall('wall1', 'Wall 1 (length)', 'N'),
      wall('wall2', 'Wall 2 (width)', 'E'),
      wall('wall3', 'Wall 3 (length)', 'S'),
      wall('wall4', 'Wall 4 (width)', 'W'),
      { ...wall('ceiling', 'Ceiling / roof', 'roof') },
      { key: 'floor', label: 'Floor', adj: 'ground', tAdj: '', ins: 'XPS', thk: T < 0 ? 150 : (T < 8 ? 100 : 0), sun: 'none', orient: 'N', areaOverride: '', uOverride: '', rExtra: 0.1 },
    ];
  }

  function newProduct(T) {
    return { id: uid(), productId: 'beef_lean', name: '', xw: '', Tf: '', mass: 10000, tIn: T < 0 ? -12 : 10, tOut: T, pullDown: 24, crf: 1, packType: 'cardboard', packPct: 5, stored: 0, resp: '' };
  }

  function newDoor() {
    return { id: uid(), name: 'Door', w: 2.4, h: 3.0, adj: 'ambient', tAdj: 5, rhAdj: 75, passages: 60, openSec: 20, standMin: 10, Df: '', protection: 'strip', E: 0.85 };
  }

  function newRoom(type = 'chiller', name) {
    const t = D.roomTypes[type] || D.roomTypes.custom;
    return {
      id: uid(),
      name: name || t.name.split(' (')[0],
      type,
      dims: { L: 20, W: 15, H: 8 },
      cond: { T: t.T, RH: t.RH },
      runHours: t.runHours,
      TD: t.TD,
      safety: 10,
      sstOverride: '',
      surfaces: newSurfaces(t.T),
      products: [newProduct(t.T)],
      infMethod: 'doors',
      doors: [newDoor()],
      airChange: { method: 'store', f: 1, fn: 1, nManual: 2, usage: 'average', adj: 'ambient', tAdj: 5, rhAdj: 75 },
      evap: { K: 25, lmtd: 7 },
      ventilation: { m3h: 0, hours: 24 },
      internal: { people: 2, peopleHours: 8, lightsWm2: 8, lightsHours: 12, forklifts: 1, forkliftKW: 6, forkliftHours: 4, otherKW: 0, otherHours: 0 },
      equipment: { fanMode: 'pct', fanPct: 8, fanKW: 0, fanHours: 24, defrostKW: 0, defrostPerDay: 4, defrostMin: 30, defrostFrac: 30 },
      notes: '',
    };
  }

  function newProject() {
    return {
      version: 1,
      info: { name: 'New cold store project', client: '', location: '', engineer: '', date: new Date().toISOString().slice(0, 10), rev: 'A' },
      design: { ambientDB: 35, ambientRH: 45, altitude: 0, groundTemp: 10, safetyFactor: 10, refrigerant: D.refrigerants[0] },
      rooms: [],
      machinery: [],
    };
  }

  function exampleProject() {
    const p = newProject();
    p.info = { ...p.info, name: 'Example — Food distribution centre', client: 'Demo client', location: 'Cairo, Egypt', engineer: '' };
    p.design = { ...p.design, ambientDB: 38, ambientRH: 35, altitude: 75, groundTemp: 12 };

    const fz = newRoom('freezer', 'Frozen store FS-01');
    fz.dims = { L: 40, W: 25, H: 11 };
    fz.products = [{ ...newProduct(-25), productId: 'poultry', mass: 40000, tIn: -15, tOut: -25 }];
    fz.doors = [{ ...newDoor(), name: 'Dock door to anteroom', adj: 'custom', tAdj: 5, rhAdj: 75, passages: 150, openSec: 15, standMin: 0, protection: 'strip' }];
    fz.internal = { ...fz.internal, people: 2, forklifts: 2, forkliftKW: 7, forkliftHours: 12 };
    fz.equipment = { ...fz.equipment, defrostKW: 60, defrostPerDay: 3, defrostMin: 30, defrostFrac: 30 };

    const ch = newRoom('produce', 'Fruit store CS-01');
    ch.dims = { L: 30, W: 20, H: 9 };
    ch.products = [{ ...newProduct(1), productId: 'apples', mass: 60000, tIn: 22, tOut: 1, pullDown: 24, crf: 1, packType: 'wood', packPct: 10, stored: 800000 }];
    ch.doors = [{ ...newDoor(), name: 'Loading door', adj: 'custom', tAdj: 8, rhAdj: 70, passages: 80 }];

    const ar = newRoom('anteroom', 'Anteroom / dock AR-01');
    ar.dims = { L: 40, W: 10, H: 7 };
    ar.products = [];
    ar.doors = [{ ...newDoor(), name: 'Dock levellers ×6 (sealed)', w: 2.8, h: 3.0, passages: 120, openSec: 30, standMin: 60, protection: 'custom', E: 0.9 }];
    ar.internal = { ...ar.internal, people: 8, peopleHours: 16, forklifts: 3, forkliftHours: 12 };

    p.rooms = [fz, ch, ar];
    p.machinery = [V.newMachineryRoom()];
    return p;
  }

  return { uid, newRoom, newProduct, newDoor, newSurfaces, newProject, exampleProject };
});
