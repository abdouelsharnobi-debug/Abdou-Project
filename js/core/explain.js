/*
 * Calculation transparency and the engineering assumptions register.
 * Builds audit-ready explanations from engine inputs and outputs (SI, the engine's internal
 * units). Nothing here recalculates loads differently from the engine: values shown are the
 * engine's own intermediate results.
 */
(function (root) {
  'use strict';
  const f = (v, d = 2) => (Number.isFinite(v) ? (+v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');

  function explainRoom(room, res, project, D) {
    const blocks = [];
    const Ti = +room.cond.T;
    blocks.push({
      id: 'transmission', title: 'Transmission load', ref: 'ashrae-loads',
      formula: 'Q = U · A · ΔT,   U = 1 / (1/hᵢ + L/k + 1/hₒ + R_extra),   ΔT = T_out (+ sun effect) − T_room',
      table: {
        head: ['Surface', 'A [m²]', 'U [W/m²K]', 'T_out [°C]', 'ΔT [K]', 'Q [kW]', 'Q [kWh/day]'],
        rows: res.transmission.items.map((s) => [s.label, f(s.A, 1), f(s.U, 3), f(s.To, 1), f(s.dT, 1), f(s.kW, 3), f(s.kWh, 1)]),
      },
      notes: [`hᵢ = ${D.film.inside} W/m²K; hₒ = ${D.film.outside} W/m²K outdoors, ${D.film.adjacent} W/m²K to adjacent spaces, none to ground.`, `T_room = ${f(Ti, 1)} °C.`,
        res.heatLossCredit === 'none' ? 'Project option: heat loss to colder surroundings is not credited (Q = max(0, U·A·ΔT)).' : 'Heat loss to colder surroundings is credited (negative loads reduce the total).',
        ...res.transmission.items.filter((s) => s.notCredited).map((s) => `${s.label}: ${f(s.rawKW, 3)} kW not credited.`)],
      result: [res.transmission.kWh, 'kWh/day'],
    });

    const pr = res.product;
    blocks.push({
      id: 'product', title: 'Product, packaging and respiration', ref: 'ashrae-foods',
      formula: 'q = c_pa(T₁ − T_f) + h_if + c_pb(T_f − T₂);  c_pa = 3.35·x_w + 0.84,  c_pb = 1.26·x_w + 0.84,  h_if = 334·x_w [kJ/kg] (unless entered);  Q = m·q/3600 × 24/t_pull ÷ CRF;  Q_pack = m_pack·c_p·ΔT/3600 × 24/t_pull;  Q_resp = (stored[t] × w + intake[t/day] × w_in) × 24/1000',
      table: {
        head: ['Product', 'm [kg/day]', 'T₁→T₂ [°C]', 'T_f [°C]', 'c_pa / c_pb [kJ/kg·K]', 'h_if [kJ/kg]', 'q [kJ/kg]', 't_pull [h]', 'CRF', 'Product [kWh/day]', 'Pack. [kWh/day]', 'Resp. [kWh/day]'],
        rows: pr.items.map((p) => [p.label, f(p.mass, 0), `${f(p.T1, 1)} → ${f(p.T2, 1)}`, f(p.Tf, 1), `${f(p.props.cpAbove, 2)} / ${f(p.props.cpBelow, 2)}`, f(p.props.latent, 1), f(p.qkg, 1), f(p.pull, 1), f(p.crf, 2), f(p.kWhProduct, 1), f(p.kWhPack, 1), f(p.kWhResp, 1)]),
      },
      notes: ['Specific and latent heats from water content (Siebel; latent heat assumes all water freezes) unless entered values are shown as overridden.',
        ...pr.items.filter((p) => Object.keys(p.overridden || {}).length).map((p) => `${p.label}: entered ${Object.keys(p.overridden).map((k) => ({ cpAbove: 'c_pa', cpBelow: 'c_pb', latent: 'h_if' }[k])).join(', ')}.`),
        ...pr.items.filter((p) => p.kWhRespIn > 0).map((p) => `${p.label}: incoming-produce respiration ${f(p.kWhRespIn, 1)} kWh/day included.`),
        res.productBasis === 'pulldown'
          ? `Capacity basis “rate over pull-down”: product heat Q_day × (1 + SF) / min(t_pull, t_run) — adjustment ${f(res.productRateAdjKW, 3)} kW relative to the daily basis.`
          : 'Capacity basis “daily”: load concentrated into the pull-down time, expressed per 24 h, then divided by run time with the other loads.'],
      result: [pr.kWh, 'kWh/day'],
    });

    const inf = res.infiltration;
    if (inf.airChange) {
      const a = inf.airChange;
      blocks.push({
        id: 'infiltration', title: 'Infiltration — air-change method', ref: room.airChange && room.airChange.method === 'dossat' ? 'dossat' : 'workbook-ac',
        formula: 'Q = V · n · (h_out − h_room) / v_out / 3600',
        table: { head: ['Quantity', 'Value', 'Unit'], rows: [
          ['Room volume V', f(res.volume, 1), 'm³'], ['Air changes n', f(a.n, 3), 'per day'], ['Basis', a.basis, ''],
          ['h_out', f(a.outside.h, 2), 'kJ/kg dry air'], ['h_room', f(inf.inside.h, 2), 'kJ/kg dry air'], ['v_out', f(a.outside.v, 4), 'm³/kg dry air'],
          ['Moisture load', f(a.moisture, 2), 'kg/day']] },
        notes: a.extrapolated ? ['Volume outside the tabulated range — value extrapolated.'] : [],
        result: [a.kWh, 'kWh/day'],
      });
    } else {
      blocks.push({
        id: 'infiltration', title: 'Door infiltration — Gosney & Olama', ref: 'gosney-olama',
        formula: 'q = 0.221 · A · (h_i − h_r) · ρ_r · (1 − ρ_i/ρ_r)^0.5 · (g·H)^0.5 · F_m,  F_m = [2/(1 + (ρ_r/ρ_i)^(1/3))]^1.5;  Q = q · t_open · D_f · (1 − E)',
        table: {
          head: ['Door', 'A [m²]', 'h_i / h_r [kJ/kg]', 'ρ_i / ρ_r [kg/m³]', 'q open [kW]', 't_open [h/day]', 'D_f', 'E', 'Q [kWh/day]', 'Moisture [kg/day]'],
          rows: inf.items.map((d) => [d.label, f(d.A, 2), `${f(d.outside.h, 1)} / ${f(inf.inside.h, 1)}`, `${f(d.outside.rho, 3)} / ${f(inf.inside.rho, 3)}`, f(d.qOpen, 2), f(d.openH, 3), f(d.Df, 2), f(d.E, 2), f(d.kWh, 1), f(d.moisture, 2)]),
        },
        notes: ['t_open = (passages × open–close time + 60 × minutes standing open) / 3600.', 'Air properties at site pressure (ASHRAE psychrometric equations).'],
        result: [inf.kWhDoors, 'kWh/day'],
      });
    }
    if (inf.vent.kWh > 0) blocks.push({ id: 'ventilation', title: 'Mechanical ventilation air', ref: 'ashrae-psychro', formula: 'Q = (V̇ / v_out) · (h_out − h_room) × hours', table: { head: ['Quantity', 'Value', 'Unit'], rows: [['Outdoor air', f(+room.ventilation.m3h, 0), 'm³/h'], ['Operation', f(+room.ventilation.hours, 1), 'h/day'], ['Moisture', f(inf.vent.moisture, 2), 'kg/day']] }, notes: [], result: [inf.vent.kWh, 'kWh/day'] });

    const it = res.internal, i = room.internal || {};
    const floorA = (+room.dims.L || 0) * (+room.dims.W || 0);
    blocks.push({
      id: 'internal', title: 'Internal loads', ref: 'ashrae-loads',
      formula: 'People: n · (272 − 6·t) W · h;  Lighting: W/m² · A_floor · h;  Forklifts: n · kW · h;  Other: kW · h',
      table: { head: ['Item', 'Inputs', 'Q [kWh/day]'], rows: [
        ['People', `${+i.people || 0} × ${f(it.perPerson, 0)} W × ${+i.peopleHours || 0} h`, f(it.people, 1)],
        ['Lighting', `${+i.lightsWm2 || 0} W/m² × ${f(floorA, 0)} m² × ${+i.lightsHours || 0} h`, f(it.lights, 1)],
        ['Forklifts', `${+i.forklifts || 0} × ${+i.forkliftKW || 0} kW × ${+i.forkliftHours || 0} h`, f(it.forklifts, 1)],
        ['Other equipment', `${+i.otherKW || 0} kW × ${+i.otherHours || 0} h`, f(it.other, 1)]] },
      notes: [], result: [it.kWh, 'kWh/day'],
    });
    const e = room.equipment || {};
    blocks.push({
      id: 'equipment', title: 'Evaporator fans and defrost', ref: 'ashrae-loads',
      formula: e.fanMode === 'kw' ? 'Fans: kW · h;  Defrost: kW · cycles · min/60 · fraction to room' : 'Fans: % × (transmission + product + infiltration + internal);  Defrost: kW · cycles · min/60 · fraction to room',
      table: { head: ['Item', 'Inputs', 'Q [kWh/day]'], rows: [
        ['Fans', e.fanMode === 'kw' ? `${+e.fanKW || 0} kW × ${+e.fanHours || 0} h` : `${+e.fanPct || 0} % of base load`, f(res.equipment.fans, 1)],
        ['Defrost', `${+e.defrostKW || 0} kW × ${+e.defrostPerDay || 0} × ${+e.defrostMin || 0} min × ${+e.defrostFrac || 0} %`, f(res.equipment.defrost, 1)]] },
      notes: [], result: [res.equipment.kWh, 'kWh/day'],
    });
    blocks.push({
      id: 'total', title: 'Design refrigeration capacity', ref: 'ashrae-loads',
      formula: res.productBasis === 'pulldown' ? 'Q_design = Σ loads × (1 + safety) ÷ run time + product pull-down rate adjustment' : 'Q_design = Σ loads × (1 + safety) ÷ run time',
      table: { head: ['Quantity', 'Value', 'Unit'], rows: [
        ['Σ loads (subtotal)', f(res.subtotal, 1), 'kWh/day'], ['Safety / design allowance', `${f(res.safety, 0)} % = ${f(res.safetyKWh, 1)}`, 'kWh/day'],
        ['Total', f(res.total, 1), 'kWh/day'], ['Run time', f(res.runHours, 1), 'h/day'], ['Total ÷ run time', f(res.total / res.runHours, 2), 'kW'],
        ...(res.productBasis === 'pulldown' ? [['Product pull-down rate adjustment', f(res.productRateAdjKW, 3), 'kW']] : []),
        ['Design capacity', f(res.capacity, 2), 'kW'],
        ['Evaporator TD / SST', `${f(res.TD, 1)} K / ${f(res.sst, 1)} °C`, '']] },
      notes: [], result: [res.capacity, 'kW'],
    });
    return blocks;
  }

  /** Transparency for a tunnel / blast freezer (freezing engine). */
  function explainTunnel(t, r) {
    const fz = r.freezing, p = r.props;
    return [
      { id: 'ftime', title: 'Freezing time', ref: 'ashrae-freezing',
        formula: 'Plank: t = ρ_f·L/(T_f − T_m)·(P·D/h + R·D²/k_f).   Pham: t = d/(E·h)·(ΔH₁/ΔT₁ + ΔH₂/ΔT₂)·(1 + Bi/2);  T_fm = 1.8 + 0.263·T_c + 0.105·T_m;  h = 1/(1/h_air + R_pack)',
        table: { head: ['Quantity', 'Value', 'Unit'], rows: [
          ['Shape (P, R, E)', `${fz.shape.name} (${f(fz.shape.P, 3)}, ${f(fz.shape.R, 4)}, ${fz.shape.E})`, ''], ['D / d', `${f(+t.D, 3)} / ${f(fz.d, 3)}`, 'm'],
          ['h_air → h_eff', `${f(+t.hAir, 1)} → ${f(fz.hEff, 2)}`, 'W/m²K'], ['k_f, ρ_u, ρ_f', `${f(p.kF, 2)}, ${f(p.rhoU, 0)}, ${f(p.rhoF, 0)}`, 'W/mK, kg/m³'],
          ['Biot number h·d/k_f', f(fz.Bi, 3), '–'], ['T_i / T_f / T_c / T_m', `${f(+t.Ti, 1)} / ${f(p.Tf, 1)} / ${f(+t.Tc, 1)} / ${f(+t.Tm, 1)}`, '°C'],
          ['T_fm (mean freezing temperature)', f(fz.Tfm, 2), '°C'], ['ΔH₁ / ΔH₂', `${f(fz.dH1 / 1e6, 2)} / ${f(fz.dH2 / 1e6, 2)}`, 'MJ/m³'],
          ['ΔT₁ / ΔT₂', `${f(fz.dT1, 2)} / ${f(fz.dT2, 2)}`, 'K'], ['Plank freezing time', f(fz.plankH, 2), 'h'], ['Pham freezing time', f(fz.phamH, 2), 'h'],
          ['Design basis', t.timeBasis === 'entered' ? `entered ${t.tDesign} h` : t.timeBasis === 'plank' ? 'Plank' : 'Pham', ''] ] },
        notes: ['Plank ignores pre-cooling above and sub-cooling below the freezing point, so it underestimates the time; Pham includes both.'], result: [r.tFreeze, 'h'] },
      { id: 'fproduct', title: 'Product load (continuous-flow method)', ref: 'workbook-freezing',
        formula: 'ṁ = batch / t_freeze (batch) or throughput (continuous);  Q = ṁ·[c₁(t₁ − t_f) + h_if + c₂(t_f − t₂)]/3600 × load factor',
        table: { head: ['Quantity', 'Value', 'Unit'], rows: [
          ['Product', `${p.name} (${p.source})`, ''], ['c₁ / c₂ / h_if', `${f(p.cpA, 3)} / ${f(p.cpB, 3)} / ${f(p.hLat, 1)}`, 'kJ/kg·K, kJ/kg'],
          ['t₁ → t₂ (t_f)', `${f(r.T1, 1)} → ${f(r.T2, 1)} (${f(p.Tf, 1)})`, '°C'], ['Heat removed q', f(r.q, 1), 'kJ/kg'], ['Product flow ṁ', f(r.mdot, 1), 'kg/h'],
          ['Above freezing / latent / below freezing', `${f(r.parts.qAbove, 2)} / ${f(r.parts.qLatent, 2)} / ${f(r.parts.qBelow, 2)}`, 'kW'], ['Load distribution factor', f(r.peak, 2), '–']] },
        notes: [], result: [r.breakdown[0].kW, 'kW'] },
      { id: 'fother', title: 'Other tunnel loads', ref: 'ashrae-loads',
        formula: 'Packaging m·c_p·ΔT; trays/trolleys per batch; transmission U·A·ΔT; infiltration Gosney–Olama × open time × D_f 0.8 × (1 − E); fans, lights, other, defrost as entered',
        table: { head: ['Item', 'Value', 'Unit'], rows: [
          ...r.breakdown.slice(1).map((b) => [b.label, f(b.kW, 2), 'kW']),
          ['Walls + ceiling area / U', `${f(r.aWalls, 1)} m² / ${f(r.Uw, 3)}`, 'W/m²K'], ['Floor area / U', `${f(r.aFloor, 1)} m² / ${f(r.Uf, 3)}`, 'W/m²K'],
          ...r.doors.map((d) => [d.name, `q open ${f(d.qOpen, 1)} kW${d.openH != null ? `, ${f(d.openH, 3)} h/cycle` : ''}, E ${f(d.E, 2)}`, ''])] },
        notes: [], result: [r.subtotal - r.breakdown[0].kW, 'kW'] },
      { id: 'ftotal', title: 'Tunnel design refrigeration capacity', ref: 'workbook-freezing',
        formula: t.lossMethod === 'factor' ? 'Q_design = Σ loads × (1 + x)' : 'Q_design = Σ loads ÷ (1 − x)  (workbook loss & safety method)',
        table: { head: ['Quantity', 'Value', 'Unit'], rows: [
          ['Σ loads', f(r.subtotal, 2), 'kW'], ['Loss & safety', `${f(+t.lossPct, 0)} % → ${f(r.allowance, 2)}`, 'kW'], ['Design capacity', f(r.total, 2), 'kW'],
          ['Air temperature / TD / SST', `${f(+t.Tm, 1)} / ${f(r.TD, 1)} / ${f(r.sst, 1)}`, '°C, K, °C'], ['Air volume for ΔT_air', `${f(r.airflow, 0)} (ΔT ${f(+t.airDT, 1)} K)`, 'm³/h'],
          ['Specific energy', `${f(r.kJperKg, 0)} kJ/kg (${f(r.kJperKg / 4.186, 0)} kcal/kg)`, ''], ['Throughput', `${f(r.perDayKg, 0)} kg/day`, '']] },
        notes: [], result: [r.total, 'kW'] },
    ];
  }

  /**
   * Assumptions register: default / database / user-selected / user-overridden.
   * kind: 'default' | 'database' | 'user' | 'override' | 'note'
   */
  function assumptions(data, D, M) {
    const out = [];
    const add = (scope, item, value, kind, basis) => out.push({ scope, item, value, kind, basis: basis || '' });
    const dd = M.newProject().design;
    add('Project', 'Outdoor design condition', `${data.design.ambientDB} °C / ${data.design.ambientRH} % RH, ${data.design.altitude || 0} m`, (data.design.ambientDB === dd.ambientDB && data.design.ambientRH === dd.ambientRH) ? 'default' : 'user', data.design.climateSource || 'Entered by user');
    add('Project', 'Ground temperature', `${data.design.groundTemp} °C`, data.design.groundTemp === dd.groundTemp ? 'default' : 'user', 'Floor on ground / heated slab');
    add('Method', 'Surface film coefficients', `hᵢ ${D.film.inside}, hₒ ${D.film.outside} (outdoor), ${D.film.adjacent} (adjacent) W/m²K`, 'default', 'Still air inside; wind outside');
    add('Method', 'Product properties', 'Siebel equations from water content; latent heat assumes all water freezes', 'default', 'ASHRAE Thermal Properties of Foods');
    add('Method', 'Heat loss to colder surroundings', data.design.heatLossCredit === 'none' ? 'Not credited (surfaces to colder spaces = 0)' : 'Credited (reduces load)', data.design.heatLossCredit === 'none' ? 'user' : 'default', 'Project option (Gate 3 G3-3)');
    add('Method', 'Occupancy heat', '272 − 6·t W per person', 'default', 'ASHRAE / Dossat');
    for (const r of data.rooms || []) {
      const preset = D.roomTypes[r.type] || {};
      const sc = r.name;
      add(sc, 'Run time', `${r.runHours} h/day`, r.runHours === preset.runHours ? 'default' : 'user', 'Preset for ' + (preset.name || r.type));
      add(sc, 'Evaporator TD', `${r.TD} K`, r.TD === preset.TD ? 'default' : 'user', '');
      add(sc, 'Safety factor', `${r.safety} %`, +r.safety === +(data.design.safetyFactor) ? 'default' : 'user', '');
      add(sc, 'Product load capacity basis', r.productBasis === 'pulldown' ? 'Rate over pull-down: Q/min(t_pull, t_run)' : 'Daily: Q × 24/t_pull ÷ run time', r.productBasis === 'pulldown' ? 'user' : 'default', 'Room option (Gate 3 G3-2)');
      for (const s of r.surfaces || []) {
        if (s.uOverride !== '' && s.uOverride != null) add(sc, `${s.label} U-value`, `${s.uOverride} W/m²K`, 'override', 'U-value override');
        if (s.areaOverride !== '' && s.areaOverride != null) add(sc, `${s.label} area`, `${s.areaOverride} m²`, 'override', 'Area override');
        if (s.adj === 'ambient' && s.sun && s.sun !== 'none') add(sc, `${s.label} sun effect`, `${s.sun} surface`, 'user', 'Sun-effect allowance');
      }
      for (const p of r.products || []) {
        const ref = D.products.find((x) => x.id === p.productId) || {};
        add(sc, `${ref.name || 'Product'} water content`, `${p.xw !== '' && p.xw != null ? p.xw : ref.xw} %`, p.xw !== '' && p.xw != null ? 'override' : 'database', 'Product database (typical)');
        add(sc, `${ref.name || 'Product'} freezing point`, `${p.Tf !== '' && p.Tf != null ? p.Tf : ref.Tf} °C`, p.Tf !== '' && p.Tf != null ? 'override' : 'database', 'Product database (typical)');
        for (const [k, lbl, u] of [['cpA', 'c_p above freezing', 'kJ/kg·K'], ['cpB', 'c_p below freezing', 'kJ/kg·K'], ['hLat', 'latent heat', 'kJ/kg']]) if (+p[k] > 0) add(sc, `${ref.name || 'Product'} ${lbl}`, `${p[k]} ${u}`, 'override', 'Entered product data (replaces Siebel)');
        if (+p.respIn > 0) add(sc, `${ref.name || 'Product'} respiration of intake`, `${p.respIn} W/t`, 'user', 'Incoming produce at mean pull-down temperature');
        if (ref.resp > 0 || +p.resp > 0) add(sc, `${ref.name || 'Product'} respiration`, `${p.resp !== '' && p.resp != null ? p.resp : ref.resp} W/t`, p.resp !== '' && p.resp != null ? 'override' : 'database', 'Product database (typical)');
        const pk = D.packaging[p.packType] || {};
        add(sc, 'Packaging', `${p.packPct} % ${pk.name || ''} (c_p ${pk.cp})`, 'user', '');
      }
      if (r.infMethod === 'airchange') add(sc, 'Infiltration method', `Air change (${(r.airChange || {}).method})`, 'user', '');
      else for (const d of r.doors || []) {
        const prot = D.doorProtection[d.protection] || {};
        add(sc, `${d.name || 'Door'} protection`, d.protection === 'custom' ? `E = ${d.E}` : `${prot.name} (E = ${prot.E})`, d.protection === 'custom' ? 'override' : 'default', 'Door protection effectiveness');
        add(sc, `${d.name || 'Door'} flow factor D_f`, d.Df !== '' && d.Df != null ? String(d.Df) : 'auto (0.8 / 1.1)', d.Df !== '' && d.Df != null ? 'override' : 'default', '');
      }
      const e = r.equipment || {};
      add(sc, 'Evaporator fans', e.fanMode === 'kw' ? `${e.fanKW} kW × ${e.fanHours} h` : `${e.fanPct} % allowance`, e.fanMode === 'kw' ? 'user' : 'default', e.fanMode === 'kw' ? 'Selected equipment' : 'Estimate before coil selection');
      if (+e.defrostKW > 0) add(sc, 'Defrost heat to room', `${e.defrostFrac} %`, 'user', '');
    }
    for (const t of data.tunnels || []) {
      add(t.name, 'Freezing-time basis', t.timeBasis === 'entered' ? `Entered ${t.tDesign} h` : t.timeBasis === 'plank' ? 'Plank equation' : 'Pham method (ASHRAE)', t.timeBasis === 'pham' ? 'default' : 'user', 'Tunnel option');
      add(t.name, 'Surface coefficient / packaging resistance', `${t.hAir} W/m²K / ${t.Rpack} m²K/W`, 'user', 'From air velocity, supplier or ASHRAE data');
      add(t.name, 'Frozen product k / ρ', `${t.product.kF} W/mK / ${t.product.rhoF} kg/m³`, 'user', 'Typical values — verify (ASHRAE Thermal Properties of Foods)');
      if (+t.peak !== 1) add(t.name, 'Load distribution factor', String(t.peak), 'user', 'Non-uniform heat release during batch freezing');
      add(t.name, 'Loss & safety', `${t.lossPct} % (${t.lossMethod === 'factor' ? 'Q × (1 + x)' : 'Q ÷ (1 − x)'})`, t.lossMethod === 'factor' ? 'user' : 'default', 'Workbook method');
      for (const k of ['Tf', 'cpA', 'cpB', 'hLat']) if (t.product[k] !== '' && t.product[k] != null) add(t.name, `Product ${k}`, String(t.product[k]), 'override', 'Entered (replaces library value)');
    }
    for (const a of data.assumptions || []) add(a.scope || 'Project', a.item || 'Engineering note', a.value || '', 'note', a.basis || '');
    return out;
  }

  const api = { explainRoom, explainTunnel, assumptions };
  root.CL = root.CL || {};
  root.CL.explain = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
