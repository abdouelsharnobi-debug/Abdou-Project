/*
 * Heat-load calculation engine for refrigerated rooms.
 *
 * Method: W. F. Stoecker, Industrial Refrigeration Handbook; R. J. Dossat, Principles of
 * Refrigeration; ASHRAE Handbook—Refrigeration, "Refrigerated-Facility Loads". All component loads are accumulated as
 * energy per 24 h [kWh/day]; required refrigeration capacity = (Σ loads × (1 + safety)) / run time.
 *
 *  1. Transmission      Q = U·A·(To + sun − Ti)
 *  2. Product           sensible above freezing + latent + sensible below freezing (Siebel)
 *                       + respiration + packaging, scaled to the pull-down time
 *  3. Infiltration      Gosney & Olama door-infiltration equation with Dt, Df, E factors
 *                       (Stoecker / ASHRAE), or the air-change method (Dossat)
 *     Ventilation       ṁ·(h_out − h_in) for mechanical fresh air
 *  4. Internal          people (272 − 6·t W/person), lights, forklifts, other equipment
 *  5. Equipment         evaporator fans, defrost heat released to the room
 *
 * Engine 1.1.0 (Gate 3, approved): G3-1 fan allowance never negative; G3-2 optional product
 * "rate over pull-down" capacity basis; G3-3 optional no credit for heat loss to colder
 * surroundings; G3-4 optional c_p / latent-heat overrides; G3-5 optional respiration of
 * incoming produce. All options default to the 1.0.0 behaviour.
 */
(function (root, factory) {
  const nodeReq = typeof require === 'function';
  const mod = factory(root.Psychro || (nodeReq && require('./psychro.js')),
    root.HLData || (nodeReq && require('./data.js')));
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.HLCalc = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Psychro, D) {
  'use strict';

  const G = 9.81;
  const num = (v, d = 0) => (Number.isFinite(+v) && v !== '' && v !== null ? +v : d);

  /* ---------- 1. Transmission ---------- */

  function surfaceArea(room, s) {
    if (num(s.areaOverride) > 0) return num(s.areaOverride);
    const { L, W, H } = room.dims;
    switch (s.key) {
      case 'wall1': case 'wall3': return num(L) * num(H);
      case 'wall2': case 'wall4': return num(W) * num(H);
      default: return num(L) * num(W); // ceiling, floor
    }
  }

  function surfaceU(s) {
    if (num(s.uOverride) > 0) return num(s.uOverride);
    const ins = D.insulation[s.ins] || D.insulation.PUR;
    const thk = num(s.thk) / 1000;
    const rIns = s.ins === 'NONE' ? 0 : thk / ins.k;
    const rOut = s.adj === 'ground' ? 0 : 1 / (s.adj === 'ambient' ? D.film.outside : D.film.adjacent);
    const rExtra = num(s.rExtra); // concrete slab, render, etc. [m²K/W]
    return 1 / (1 / D.film.inside + rIns + rOut + rExtra);
  }

  function surfaceOutsideT(s, project) {
    const d = project.design;
    if (s.adj === 'ambient') {
      const sun = (D.sunEffect[s.sun] || D.sunEffect.none);
      const orient = s.key === 'ceiling' ? 'roof' : (s.orient || 'N');
      return num(d.ambientDB) + (sun[orient] || 0);
    }
    if (s.adj === 'ground') return num(s.tAdj, num(d.groundTemp, 10));
    return num(s.tAdj);
  }

  function transmission(room, project) {
    const Ti = num(room.cond.T);
    const noCredit = (project.design || {}).heatLossCredit === 'none'; // G3-3
    const items = room.surfaces.map((s) => {
      const A = surfaceArea(room, s);
      const U = surfaceU(s);
      const To = surfaceOutsideT(s, project);
      const dT = To - Ti;
      const raw = U * A * dT / 1000;
      const kW = noCredit ? Math.max(0, raw) : raw;
      return { label: s.label, A, U, To, dT, kW, kWh: kW * 24, rawKW: raw, notCredited: noCredit && raw < 0 };
    });
    return { items, kWh: sum(items, 'kWh') };
  }

  /* ---------- 2. Product ---------- */

  /** Siebel-type properties from water content (ASHRAE "Thermal Properties of Foods"). */
  function productProps(xwPct) {
    const xw = num(xwPct) / 100;
    return { cpAbove: 3.35 * xw + 0.84, cpBelow: 1.26 * xw + 0.84, latent: 334 * xw };
  }

  /** Heat removed per kg [kJ/kg] cooling from T1 to T2 with initial freezing point Tf. */
  function productHeatPerKg(T1, T2, Tf, props) {
    if (T2 >= T1) return 0;
    if (T2 >= Tf) return props.cpAbove * (T1 - T2); // chilling only
    if (T1 > Tf) return props.cpAbove * (T1 - Tf) + props.latent + props.cpBelow * (Tf - T2); // freezing
    return props.cpBelow * (T1 - T2); // frozen product tempering down
  }

  function product(room) {
    const items = [];
    for (const p of room.products || []) {
      const ref = D.products.find((x) => x.id === p.productId) || {};
      const xw = num(p.xw, ref.xw);
      const Tf = num(p.Tf, ref.Tf);
      const props = productProps(xw);
      // G3-4: user-entered properties replace the Siebel values
      const overridden = {};
      for (const [k, f] of [['cpAbove', 'cpA'], ['cpBelow', 'cpB'], ['latent', 'hLat']]) {
        if (num(p[f]) > 0) { props[k] = num(p[f]); overridden[k] = true; }
      }
      const T1 = num(p.tIn), T2 = num(p.tOut, room.cond.T);
      const qkg = productHeatPerKg(T1, T2, Tf, props);
      const pull = Math.max(1, Math.min(24, num(p.pullDown, 24)));
      const factor = 24 / pull; // load concentrated into pull-down period, expressed per 24 h
      const mass = num(p.mass);
      const crf = num(p.crf) > 0 ? Math.min(1, num(p.crf)) : 1; // Dossat chilling rate factor
      const kWhDay = mass * qkg / 3600 / crf; // daily heat removal [kWh/day]
      const sensLatent = kWhDay * factor;

      const pk = D.packaging[p.packType] || D.packaging.cardboard;
      const packMass = mass * num(p.packPct) / 100;
      const pack = packMass * pk.cp * Math.max(0, T1 - T2) / 3600 * factor;

      const respStored = num(p.stored) / 1000 * num(p.resp, ref.resp || 0) * 24 / 1000; // W/t → kWh/day
      const respIn = mass / 1000 * num(p.respIn) * 24 / 1000; // G3-5: incoming produce
      const resp = respStored + respIn;

      items.push({
        label: p.name || ref.name || 'Product', mass, T1, T2, Tf, qkg, pull, props, crf, overridden,
        kWhDay, kWhProduct: sensLatent, kWhPack: pack, kWhResp: resp, kWhRespStored: respStored, kWhRespIn: respIn,
        kWh: sensLatent + pack + resp,
      });
    }
    return {
      items,
      kWhProduct: sum(items, 'kWhProduct'),
      kWhPack: sum(items, 'kWhPack'),
      kWhResp: sum(items, 'kWhResp'),
      kWh: sum(items, 'kWh'),
    };
  }

  /* ---------- 3. Infiltration & ventilation ---------- */

  /** Gosney & Olama sensible+latent refrigeration load of a fully open door [kW]. */
  function doorOpenLoad(A, H, inside, outside) {
    const ri = outside.rho, rr = inside.rho;
    const dh = outside.h - inside.h;
    if (ri >= rr || dh <= 0) return { q: 0, mdot: 0 };
    const Fm = Math.pow(2 / (1 + Math.pow(rr / ri, 1 / 3)), 1.5);
    const q = 0.221 * A * dh * rr * Math.sqrt(1 - ri / rr) * Math.sqrt(G * H) * Fm;
    return { q, mdot: q / dh }; // mdot: dry-air exchange [kg/s] while fully open
  }

  /**
   * Dossat air-change table lookup: log–log interpolation; beyond 100 000 ft³ (2 832 m³)
   * the last segment is extrapolated (flagged), where the door method is preferred.
   */
  function airChangesPerDay(volumeM3, belowFreezing) {
    const V = volumeM3 * 35.3147; // ft³
    const t = D.airChanges, col = belowFreezing ? 2 : 1;
    let i = t.findIndex((r) => r[0] >= V);
    const extrapolated = i === -1 || i === 0 && V < t[0][0];
    if (i === -1) i = t.length - 1;
    if (i === 0) i = 1;
    const [v0, v1] = [t[i - 1][0], t[i][0]], [a0, a1] = [t[i - 1][col], t[i][col]];
    const k = Math.log(a1 / a0) / Math.log(v1 / v0);
    return { n: a0 * Math.pow(Math.max(V, 1) / v0, k), extrapolated };
  }

  function infiltration(room, project) {
    const p = Psychro.pressure(num(project.design.altitude));
    const inside = Psychro.state(num(room.cond.T), num(room.cond.RH), p);
    const items = [];
    let airChange = null;
    if (room.infMethod === 'airchange') {
      const ac = room.airChange || {};
      const out = ac.adj === 'custom'
        ? Psychro.state(num(ac.tAdj), num(ac.rhAdj), p)
        : Psychro.state(num(project.design.ambientDB), num(project.design.ambientRH), p);
      const V = num(room.dims.L) * num(room.dims.W) * num(room.dims.H);
      const tab = airChangesPerDay(V, num(room.cond.T) < 0);
      const uf = (D.usageFactors[ac.usage] || D.usageFactors.average).f;
      const sq = Math.sqrt(Math.max(V, 1));
      let n, basis;
      switch (ac.method) {
        case 'store': // cold store for fresh/frozen goods: 70/√V per day × f (empirical industry practice)
          n = 70 / sq * num(ac.f, 1); basis = `70/√V × f (f = ${num(ac.f, 1)})`; break;
        case 'dock': // manipulation rooms / docks: 35/√V per hour × fn open doors
          n = 35 / sq * 24 * num(ac.fn, 1); basis = `35/√V per h × 24 × fn (fn = ${num(ac.fn, 1)})`; break;
        case 'manual':
          n = num(ac.nManual, 2); basis = 'Manual'; break;
        default:
          n = tab.n * uf; basis = `Dossat table × usage ${uf}`;
      }
      const mda = V * n / out.v; // kg dry air/day (volume measured at outside-air state)
      airChange = {
        n, basis, nTable: tab.n, usage: uf, extrapolated: tab.extrapolated && (ac.method || 'dossat') === 'dossat',
        kWh: Math.max(0, mda * (out.h - inside.h)) / 3600,
        moisture: Math.max(0, mda * (out.W - inside.W)), outside: out,
      };
    }
    for (const d of room.infMethod === 'airchange' ? [] : room.doors || []) {
      const out = d.adj === 'ambient'
        ? Psychro.state(num(project.design.ambientDB), num(project.design.ambientRH), p)
        : Psychro.state(num(d.tAdj), num(d.rhAdj), p);
      const A = num(d.w) * num(d.h);
      const { q, mdot } = doorOpenLoad(A, num(d.h), inside, out);
      const openH = (num(d.passages) * num(d.openSec) + 60 * num(d.standMin)) / 3600; // h/day
      const dT = out.t - inside.t;
      const Df = num(d.Df) > 0 ? num(d.Df) : (dT > 11 ? 0.8 : 1.1);
      const prot = D.doorProtection[d.protection] || D.doorProtection.none;
      const E = d.protection === 'custom' ? num(d.E) : prot.E;
      const k = openH * Df * (1 - E);
      items.push({
        label: d.name || 'Door', A, qOpen: q, openH, Df, E,
        kWh: q * k, moisture: mdot * (out.W - inside.W) * 3600 * k, // kg water/day
        outside: out,
      });
    }

    // Mechanical ventilation / fresh air (e.g. ripening rooms, occupied processing areas)
    let vent = { kWh: 0, moisture: 0 };
    const V = num(room.ventilation && room.ventilation.m3h);
    if (V > 0) {
      const out = Psychro.state(num(project.design.ambientDB), num(project.design.ambientRH), p);
      const mdot = V / 3600 / out.v;
      const hrs = num(room.ventilation.hours, 24);
      vent = {
        kWh: Math.max(0, mdot * (out.h - inside.h)) * hrs,
        moisture: Math.max(0, mdot * (out.W - inside.W)) * 3600 * hrs,
      };
    }
    const doorsKWh = airChange ? airChange.kWh : sum(items, 'kWh');
    const doorsMoist = airChange ? airChange.moisture : sum(items, 'moisture');
    return {
      items, inside, vent, airChange,
      kWhDoors: doorsKWh,
      kWh: doorsKWh + vent.kWh,
      moisture: doorsMoist + vent.moisture,
    };
  }

  /* ---------- 4 & 5. Internal and equipment loads ---------- */

  function internal(room) {
    const i = room.internal || {};
    const T = num(room.cond.T);
    const floorA = num(room.dims.L) * num(room.dims.W);
    const perPerson = 272 - 6 * T; // W, ASHRAE heat equivalent of occupancy
    const people = num(i.people) * perPerson * num(i.peopleHours) / 1000;
    const lights = num(i.lightsWm2) * floorA * num(i.lightsHours) / 1000;
    const forklifts = num(i.forklifts) * num(i.forkliftKW) * num(i.forkliftHours);
    const other = num(i.otherKW) * num(i.otherHours);
    return { perPerson, people, lights, forklifts, other, kWh: people + lights + forklifts + other };
  }

  function equipment(room, baseKWh) {
    const e = room.equipment || {};
    let fans;
    if (e.fanMode === 'kw') fans = num(e.fanKW) * num(e.fanHours, 24);
    else fans = Math.max(0, baseKWh) * num(e.fanPct, 5) / 100; // G3-1
    const defrost = num(e.defrostKW) * num(e.defrostPerDay) * num(e.defrostMin) / 60 * num(e.defrostFrac, 30) / 100;
    return { fans, defrost, kWh: fans + defrost };
  }

  /* ---------- Room total ---------- */

  function calcRoom(room, project) {
    const tr = transmission(room, project);
    const pr = product(room);
    const inf = infiltration(room, project);
    const int = internal(room);
    const base = tr.kWh + pr.kWh + inf.kWh + int.kWh;
    const eq = equipment(room, base);
    const subtotal = base + eq.kWh;
    const sf = num(room.safety, num(project.design.safetyFactor, 10));
    const total = subtotal * (1 + sf / 100);
    const runHours = Math.max(1, Math.min(24, num(room.runHours, 18)));
    // G3-2: optional "rate over pull-down" basis for the product (sensible + latent) load:
    // Q·(1+SF)/min(t_pull, t_run) instead of Q·24/t_pull·(1+SF)/t_run. Other loads unchanged.
    const productBasis = room.productBasis === 'pulldown' ? 'pulldown' : 'daily';
    let productRateAdjKW = 0;
    if (productBasis === 'pulldown') {
      for (const it of pr.items) productRateAdjKW += it.kWhDay * (1 + sf / 100) / Math.min(it.pull, runHours) - it.kWhProduct * (1 + sf / 100) / runHours;
    }
    const capacity = total / runHours + productRateAdjKW; // kW
    const TD = num(room.TD, D.recommendedTD(num(room.cond.RH)));
    const sst = num(room.cond.T) - TD;
    const volume = num(room.dims.L) * num(room.dims.W) * num(room.dims.H);

    const breakdown = [
      { key: 'transmission', label: 'Transmission', kWh: tr.kWh },
      { key: 'product', label: 'Product', kWh: pr.kWhProduct },
      { key: 'packaging', label: 'Packaging', kWh: pr.kWhPack },
      { key: 'respiration', label: 'Respiration', kWh: pr.kWhResp },
      { key: 'infiltration', label: inf.airChange ? 'Infiltration (air change)' : 'Door infiltration', kWh: inf.kWhDoors },
      { key: 'ventilation', label: 'Ventilation air', kWh: inf.vent.kWh },
      { key: 'people', label: 'People', kWh: int.people },
      { key: 'lights', label: 'Lighting', kWh: int.lights },
      { key: 'forklifts', label: 'Forklifts', kWh: int.forklifts },
      { key: 'other', label: 'Other equipment', kWh: int.other },
      { key: 'fans', label: 'Evaporator fans', kWh: eq.fans },
      { key: 'defrost', label: 'Defrost heat', kWh: eq.defrost },
    ];

    // Rule-of-thumb check (empirical industry practice): room load excl. product cooling,
    // kcal/(m³·day) — normal 200–400 up to 2000 m³, ≈ 200 above.
    const roomOnly = total - pr.kWhProduct * (1 + sf / 100);
    const kcalM3Day = volume > 0 ? roomOnly * 859.845 / volume : 0;
    const evap = room.evap || {};
    const coilArea = num(evap.K) > 0 && num(evap.lmtd) > 0 ? capacity * 1000 / (num(evap.K) * num(evap.lmtd)) : 0;

    return {
      kcalM3Day, kcalRange: volume <= 2000 ? [200, 400] : [150, 250], coilArea,
      transmission: tr, product: pr, infiltration: inf, internal: int, equipment: eq,
      breakdown, subtotal, safety: sf, safetyKWh: total - subtotal, total, runHours,
      capacity, productBasis, productRateAdjKW, heatLossCredit: (project.design || {}).heatLossCredit === 'none' ? 'none' : 'credit',
      TD, sst, volume,
      loadDensity: volume > 0 ? capacity * 1000 / volume : 0, // W/m³
      frostKgDay: inf.moisture,
    };
  }

  /** Plant summary grouped by saturated suction temperature. */
  function calcProject(project) {
    const rooms = project.rooms.map((r) => ({ room: r, res: calcRoom(r, project) }));
    const groups = {};
    for (const { room, res } of rooms) {
      const sst = room.sstOverride !== '' && room.sstOverride != null && Number.isFinite(+room.sstOverride)
        ? +room.sstOverride : Math.round(res.sst);
      (groups[sst] = groups[sst] || { sst, rooms: [], kW: 0 }).rooms.push(room.name);
      groups[sst].kW += res.capacity;
    }
    const levels = Object.values(groups).sort((a, b) => b.sst - a.sst);
    return { rooms, levels, totalKW: sum(rooms.map((r) => r.res), 'capacity') };
  }

  function sum(arr, k) { return arr.reduce((a, x) => a + (x[k] || 0), 0); }

  const units = {
    toTR: (kW) => kW / 3.51685,
    toBtuh: (kW) => kW * 3412.14,
    toKcalh: (kW) => kW * 859.845,
  };

  return {
    calcRoom, calcProject, transmission, product, infiltration, internal, equipment,
    surfaceU, surfaceArea, airChangesPerDay, productProps, productHeatPerKg, doorOpenLoad, units,
  };
});
