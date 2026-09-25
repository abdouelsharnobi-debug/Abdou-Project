/*
 * Blast-freezer / freezing-tunnel calculation — freezing engine 1.0.0.
 * Separate from the locked heat-load engine (calc.js); it reuses psychro.js and the
 * calc.js helpers surfaceU() and doorOpenLoad() without changing them.
 *
 * 1. Freezing time
 *    Plank:  t = ρ_f·L / (T_f − T_m) · (P·D/h + R·D²/k_f)
 *    Pham (1986, as presented in ASHRAE Handbook—Refrigeration, "Cooling and Freezing
 *    Times of Foods"):  t = d/(E·h) · (ΔH₁/ΔT₁ + ΔH₂/ΔT₂) · (1 + Bi/2),  Bi = h·d/k_f
 *      ΔH₁ = ρ_u·c_u·(T_i − T_fm)   ΔH₂ = ρ_f·[L + c_f·(T_fm − T_c)]
 *      ΔT₁ = (T_i + T_fm)/2 − T_m    ΔT₂ = T_fm − T_m    T_fm = 1.8 + 0.263·T_c + 0.105·T_m
 *    Shapes: slab (P ½, R ⅛, E 1), infinite cylinder (¼, 1/16, 2), sphere (1/6, 1/24, 3).
 *    h = effective surface coefficient: 1 / (1/h_air + R_packaging).
 * 2. Tunnel refrigeration load (continuous-flow method of the user's heat-load workbook):
 *    ṁ = batch / freezing time (batch) or throughput (continuous);
 *    Q_product = ṁ·[c₁(t₁ − t_f) + h_if + c₂(t_f − t₂)]; plus packaging/trays/trolleys,
 *    fans, transmission, door/belt-opening infiltration, lights, other, defrost;
 *    loss & safety: Q ÷ (1 − x) (workbook) or Q × (1 + x).
 */
(function (root, factory) {
  const req = typeof require === 'function';
  const mod = factory(root.Psychro || (req && require('./psychro.js')), root.HLCalc || (req && require('./calc.js')), root.HLData || (req && require('./data.js')));
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.HLFreeze = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Psychro, C, D) {
  'use strict';
  const VERSION = '1.0.0';
  const num = (v, d = 0) => (Number.isFinite(+v) && v !== '' && v !== null && v !== undefined ? +v : d);

  const SHAPES = {
    slab: { name: 'Slab / carton (D = thickness)', P: 1 / 2, R: 1 / 8, E: 1 },
    cylinder: { name: 'Infinite cylinder (D = diameter)', P: 1 / 4, R: 1 / 16, E: 2 },
    sphere: { name: 'Sphere (D = diameter)', P: 1 / 6, R: 1 / 24, E: 3 },
  };

  function newTunnel(name) {
    return {
      id: Math.random().toString(36).slice(2, 10), name: name || 'Blast freezer BF-01', mode: 'batch',
      product: { libId: 'wb089', name: '', Tf: '', cpA: '', cpB: '', hLat: '', rhoU: 1050, rhoF: 1000, kF: 1.4 },
      shape: 'slab', D: 0.10, hAir: 20, Rpack: 0.01, Tm: -35, Ti: 5, Tc: -18, T2: '',
      timeBasis: 'pham', tDesign: '', batchKg: 10000, loadH: 1, throughput: 1000,
      packPct: 5, packCp: 1.34, trolleyKg: 0, trolleyCp: 0.5, peak: 1.0,
      dims: { L: 12, W: 6, H: 4 }, ins: 'PUR', thk: 200, tSur: 5, groundT: 10, floorIns: 'XPS', floorThk: 150,
      doors: [{ name: 'Loading door', w: 3, h: 3.5, openPerCycle: 2, openSec: 120, protection: 'none', E: 0, tAdj: 5, rhAdj: 75 }],
      belt: { area: 0, h: 0.5, tAdj: 5, rhAdj: 75, E: 0 },
      fanKW: 30, lightsKW: 0.5, otherKW: 0, defrostKW: 0,
      lossPct: 10, lossMethod: 'divide', TD: 7, airDT: 3, sstOverride: '', notes: '',
    };
  }

  /** Product properties: tabulated library entry, overridden by any entered value. */
  function props(t, lib) {
    const p = t.product || {};
    const ref = (lib || []).find((x) => x.id === p.libId) || {};
    const pick = (k) => (p[k] === '' || p[k] == null ? ref[k] : +p[k]);
    return {
      name: p.name || ref.name || 'Product', group: ref.group || '', Tf: num(pick('Tf'), -1),
      cpA: num(pick('cpA')), cpB: num(pick('cpB')), hLat: num(pick('hLat')),
      rhoU: num(p.rhoU, 1050), rhoF: num(p.rhoF, 1000), kF: num(p.kF, 1.4), ref,
      source: Object.keys(ref).length ? 'library' : 'entered',
    };
  }

  function freezingTime(t, pr) {
    const s = SHAPES[t.shape] || SHAPES.slab;
    const Dm = num(t.D), hEff = 1 / (1 / Math.max(1e-9, num(t.hAir)) + num(t.Rpack));
    const Tm = num(t.Tm), Ti = num(t.Ti), Tc = num(t.Tc), Tf = pr.Tf;
    const d = Dm / 2;
    const L = pr.hLat * 1000, cu = pr.cpA * 1000, cf = pr.cpB * 1000;
    const plankS = pr.rhoF * L / (Tf - Tm) * (s.P * Dm / hEff + s.R * Dm * Dm / pr.kF);
    const Tfm = 1.8 + 0.263 * Tc + 0.105 * Tm;
    const dH1 = pr.rhoU * cu * (Ti - Tfm), dH2 = pr.rhoF * (L + cf * (Tfm - Tc));
    const dT1 = (Ti + Tfm) / 2 - Tm, dT2 = Tfm - Tm;
    const Bi = hEff * d / pr.kF;
    const phamS = d / (s.E * hEff) * (Math.max(0, dH1) / dT1 + dH2 / dT2) * (1 + Bi / 2);
    return {
      shape: s, hEff, d, Bi, Tfm, dH1, dH2, dT1, dT2,
      plankH: plankS / 3600, phamH: phamS / 3600,
      valid: Dm > 0 && hEff > 0 && pr.kF > 0 && Tf > Tm && Tfm > Tm && dT1 > 0,
    };
  }

  function heatPerKg(T1, T2, pr) {
    if (T2 >= T1) return 0;
    if (T2 >= pr.Tf) return pr.cpA * (T1 - T2);
    if (T1 > pr.Tf) return pr.cpA * (T1 - pr.Tf) + pr.hLat + pr.cpB * (pr.Tf - T2);
    return pr.cpB * (T1 - T2);
  }

  function calcTunnel(t, project, lib) {
    const des = (project && project.design) || {};
    const pr = props(t, lib);
    const ft = freezingTime(t, pr);
    const tFreeze = t.timeBasis === 'plank' ? ft.plankH : t.timeBasis === 'entered' ? num(t.tDesign) : ft.phamH;
    const T1 = num(t.Ti), T2 = t.T2 === '' || t.T2 == null ? num(t.Tc) : num(t.T2);
    const q = heatPerKg(T1, T2, pr); // kJ/kg
    const batch = t.mode !== 'continuous';
    const mdot = batch ? (tFreeze > 0 ? num(t.batchKg) / tFreeze : 0) : num(t.throughput); // kg/h
    const peak = num(t.peak, 1) > 0 ? num(t.peak, 1) : 1;
    const qAbove = T1 > pr.Tf ? mdot * pr.cpA * (T1 - Math.max(pr.Tf, T2)) / 3600 : 0;
    const qLatent = T2 < pr.Tf && T1 > pr.Tf ? mdot * pr.hLat / 3600 : 0;
    const qBelow = T2 < pr.Tf ? mdot * pr.cpB * (Math.min(pr.Tf, T1) - T2) / 3600 : 0;
    const product = (qAbove + qLatent + qBelow) * peak;
    const dT = Math.max(0, T1 - T2);
    const packaging = mdot * num(t.packPct) / 100 * num(t.packCp, 1.34) * dT / 3600 * peak;
    const trolleys = batch && tFreeze > 0 ? num(t.trolleyKg) * num(t.trolleyCp, 0.5) * dT / (tFreeze * 3600) : 0;

    // Envelope: walls + ceiling to surroundings, floor to ground
    const { L, W, H } = t.dims || {};
    const aWalls = 2 * (num(L) + num(W)) * num(H) + num(L) * num(W), aFloor = num(L) * num(W);
    const Uw = C.surfaceU({ ins: t.ins, thk: t.thk, adj: 'custom' });
    const Uf = C.surfaceU({ ins: t.floorIns, thk: t.floorThk, adj: 'ground', rExtra: 0.1 });
    const Tm = num(t.Tm);
    const transmission = (Uw * aWalls * (num(t.tSur) - Tm) + Uf * aFloor * (num(t.groundT, num(des.groundTemp, 10)) - Tm)) / 1000;

    // Infiltration: batch doors (per cycle) or continuous belt openings
    const p = Psychro.pressure(num(des.altitude));
    const inside = Psychro.state(Tm, 90, p);
    let infiltration = 0; const doors = [];
    if (batch) {
      for (const dr of t.doors || []) {
        const out = Psychro.state(num(dr.tAdj), num(dr.rhAdj), p);
        const { q: qOpen } = C.doorOpenLoad(num(dr.w) * num(dr.h), num(dr.h), inside, out);
        const openH = num(dr.openPerCycle) * num(dr.openSec) / 3600;
        const E = dr.protection === 'custom' ? num(dr.E) : ((D.doorProtection[dr.protection] || D.doorProtection.none).E);
        const kW = tFreeze > 0 ? qOpen * openH * 0.8 * (1 - E) / tFreeze : 0;
        doors.push({ name: dr.name, qOpen, openH, E, kW }); infiltration += kW;
      }
    } else if (num(t.belt && t.belt.area) > 0) {
      const b = t.belt, out = Psychro.state(num(b.tAdj), num(b.rhAdj), p);
      const { q: qOpen } = C.doorOpenLoad(num(b.area), num(b.h), inside, out);
      infiltration = qOpen * 0.8 * (1 - num(b.E));
      doors.push({ name: 'Belt inlet/outlet openings (continuous)', qOpen, openH: null, E: num(b.E), kW: infiltration });
    }
    const fans = num(t.fanKW), lights = num(t.lightsKW), other = num(t.otherKW), defrost = num(t.defrostKW);
    const subtotal = product + packaging + trolleys + transmission + infiltration + fans + lights + other + defrost;
    const x = num(t.lossPct) / 100;
    const total = t.lossMethod === 'factor' ? subtotal * (1 + x) : (x < 1 ? subtotal / (1 - x) : NaN);
    const TD = num(t.TD, 7), sst = Tm - TD;
    const air = Psychro.state(Tm, 90, p);
    const cpAir = 1.006 + 1.86 * air.W;
    const airflow = num(t.airDT) > 0 ? total / (air.rho * cpAir * num(t.airDT)) * 3600 : 0; // m³/h
    const cycleH = tFreeze + (batch ? num(t.loadH) : 0);
    const perDayKg = batch ? (cycleH > 0 ? num(t.batchKg) * 24 / cycleH : 0) : mdot * 24;
    const breakdown = [
      { key: 'product', label: 'Product (sensible + latent)', kW: product },
      { key: 'packaging', label: 'Packaging', kW: packaging },
      { key: 'trolleys', label: 'Trays / trolleys / racks', kW: trolleys },
      { key: 'transmission', label: 'Transmission', kW: transmission },
      { key: 'infiltration', label: batch ? 'Door infiltration' : 'Belt-opening infiltration', kW: infiltration },
      { key: 'fans', label: 'Fans', kW: fans },
      { key: 'lights', label: 'Lighting', kW: lights },
      { key: 'other', label: 'Other equipment', kW: other },
      { key: 'defrost', label: 'Defrost heat', kW: defrost },
    ];
    return {
      version: VERSION, props: pr, freezing: ft, tFreeze, T1, T2, q, mdot, peak,
      parts: { qAbove: qAbove * peak, qLatent: qLatent * peak, qBelow: qBelow * peak },
      aWalls, aFloor, Uw, Uf, doors, breakdown, subtotal, allowance: total - subtotal, total, capacity: total,
      TD, sst, airflow, cycleH, perDayKg,
      kJperKg: mdot > 0 ? total * 3600 / mdot : 0, dailyKWh: total * (batch ? Math.min(24, (24 / Math.max(cycleH, 1e-9)) * tFreeze) : 24),
    };
  }

  /** Whole-plant load: rooms (engine 1.1.0, unchanged) + tunnels, grouped by suction level. */
  function calcPlant(data, lib) {
    const pr = C.calcProject(data);
    const tunnels = (data.tunnels || []).map((t) => ({ tunnel: t, res: calcTunnel(t, data, lib) }));
    const groups = {};
    for (const l of pr.levels) groups[l.sst] = { sst: l.sst, rooms: [...l.rooms], kW: l.kW };
    for (const { tunnel: t, res } of tunnels) {
      const sst = t.sstOverride !== '' && t.sstOverride != null && Number.isFinite(+t.sstOverride) ? +t.sstOverride : Math.round(res.sst);
      (groups[sst] = groups[sst] || { sst, rooms: [], kW: 0 }).rooms.push(t.name);
      groups[sst].kW += Number.isFinite(res.capacity) ? res.capacity : 0;
    }
    const tunnelKW = tunnels.reduce((a, x) => a + (Number.isFinite(x.res.capacity) ? x.res.capacity : 0), 0);
    return { rooms: pr.rooms, tunnels, levels: Object.values(groups).sort((a, b) => b.sst - a.sst), roomsKW: pr.totalKW, tunnelKW, totalKW: pr.totalKW + tunnelKW };
  }

  return { VERSION, SHAPES, newTunnel, props, freezingTime, heatPerKg, calcTunnel, calcPlant };
});
