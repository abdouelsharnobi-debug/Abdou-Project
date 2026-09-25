/*
 * In-app Reference guide: context-sensitive engineering guidance shown in a side panel
 * while working. Topics are keyed by screen / tab. Each topic: purpose, method (formulas),
 * inputs to watch, checks, and reference ids (see refs.js).
 */
(function (root) {
  'use strict';
  const T = {
    general: { title: 'Working with ColdLoad Pro', purpose: 'Projects follow three steps: ① Project Details → ② Detailed Design → ③ Review & Report. Save often (Ctrl+S); freeze important states as revisions.',
      method: ['Refrigeration capacity = Σ daily loads × (1 + safety) ÷ run time for rooms; tunnels are sized on the load rate during freezing.', 'All calculations run in SI; units are converted only for display.'],
      inputs: ['Design weather: use the site climatic design values (city library).', 'Product data: database values are typical — confirm with the product specification.'],
      checks: ['Resolve every ERROR before issuing; review WARNINGS.', 'Check the assumptions register before issue.'], refs: ['ashrae-loads', 'stoecker', 'dossat'] },
    details: { title: 'Project details & design criteria', purpose: 'Identify the project and set the outdoor design conditions used by every room, tunnel and machinery room.',
      method: ['Outdoor air enthalpy and density come from the design dry-bulb and coincident humidity (ASHRAE psychrometrics) at the site pressure (altitude).'],
      inputs: ['Select Region → Country → State → City to fill DB, humidity and altitude from the city library.', 'Heat-loss credit option: “no credit” is conservative when adjacent rooms can be off.'],
      checks: ['Design DB within the site’s climatic range.', 'Ground temperature = heater set-point for heated slabs.'], refs: ['ashrae-climate', 'ashrae-psychro'] },
    'room-general': { title: 'Room & design criteria', purpose: 'Define the room size, the temperature and humidity to hold, and how many hours per day the plant runs to remove the daily load.',
      method: ['Capacity = total daily load ÷ run time.', 'Evaporator TD = room air − saturated suction; SST = room T − TD.'],
      inputs: ['Run time 16–18 h (coolers, off-cycle defrost), 18–20 h (freezers).', 'High-RH produce rooms need a small TD (≈ 4–6 K).'],
      checks: ['Run time ≤ 24 h (engine limits larger values — shown as ERROR).'], refs: ['ashrae-loads'] },
    'room-transmission': { title: 'Envelope — transmission', purpose: 'Heat conducted through walls, ceiling and floor.',
      method: ['Q = U·A·(T_out + sun − T_room);  U = 1/(1/hᵢ + L/k + 1/hₒ + R_extra).'],
      inputs: ['Insulation k: PUR/PIR 0.022, XPS 0.030, EPS 0.036, mineral wool 0.040 W/mK.', 'Sun effect only for surfaces exposed to the sun.'],
      checks: ['Surfaces next to colder rooms reduce the load unless “no credit” is selected.', 'Freezers need under-floor heating against frost heave.'], refs: ['ashrae-loads', 'stoecker'] },
    'room-product': { title: 'Product load', purpose: 'Heat removed to cool (and freeze) the product brought in, its packaging, and respiration of living produce.',
      method: ['q = c_pa(T₁ − T_f) + h_if + c_pb(T_f − T₂);  Siebel: c_pa = 3.35x_w + 0.84, c_pb = 1.26x_w + 0.84, h_if = 334x_w.', 'Daily basis: Q × 24/pull-down; optional “rate over pull-down”: Q ÷ min(pull-down, run time).'],
      inputs: ['For freezing in a dedicated tunnel use the Tunnel / blast freezer module, not a storage room.'],
      checks: ['Final temperature not below room temperature.', 'Respiration only for living produce.'], refs: ['ashrae-foods', 'dossat'] },
    'room-infiltration': { title: 'Infiltration', purpose: 'Warm moist air entering through doors (door method) or by empirical air changes.',
      method: ['Gosney & Olama: q = 0.221·A·Δh·ρ·√(1 − ρᵢ/ρᵣ)·√(gH)·Fm; Q = q × open time × D_f × (1 − E).', 'Air-change: Q = V·n·Δh.'],
      inputs: ['Door passages per day from the logistics plan (pallets in/out).', 'Protection effectiveness drops when strip curtains are damaged.'],
      checks: ['Door open > 12 h/day → consider rapid-roll doors or a vestibule.', 'Dossat table valid up to 2 832 m³.'], refs: ['gosney-olama', 'dossat', 'workbook-ac'] },
    'room-internal': { title: 'Internal & equipment loads', purpose: 'People, lighting, forklifts, equipment, evaporator fans and defrost heat released in the room.',
      method: ['People 272 − 6·t W/person; lighting W/m² × A × h; fans % allowance or motor kW × h; defrost kW × cycles × duration × fraction.'],
      inputs: ['Replace the fan % allowance with actual motor power after coil selection.'], checks: ['Fan allowance 5–10 % before selection.'], refs: ['ashrae-loads'] },
    'room-results': { title: 'Results & transparency', purpose: 'Load summary and the full calculation trail for audit.',
      method: ['Open each block to see the formula, inputs and intermediate values.'], inputs: [],
      checks: ['Rule of thumb: room load excluding product 200–400 kcal/m³·day (≤ 2 000 m³).'], refs: ['ashrae-loads'] },
    tunnel: { title: 'Tunnel / blast freezer', purpose: 'Predict the freezing time of the product and size the refrigeration capacity of the freezing tunnel during freezing.',
      method: [
        'Freezing time — Plank: t = ρ_f·L/(T_f − T_m)·(P·D/h + R·D²/k_f); slab P ½ R ⅛, cylinder ¼ 1/16, sphere 1/6 1/24.',
        'Freezing time — Pham (ASHRAE): t = d/(E·h)·(ΔH₁/ΔT₁ + ΔH₂/ΔT₂)·(1 + Bi/2), T_fm = 1.8 + 0.263·T_c + 0.105·T_m, d = D/2, E = 1/2/3.',
        'Effective h = 1/(1/h_air + R_packaging).',
        'Product flow ṁ = batch ÷ freezing time (batch) or throughput (continuous).',
        'Q_product = ṁ·[c₁(t₁ − t_f) + h_if + c₂(t_f − t₂)] — the continuous-flow method of your workbook.',
        'Q_design = Σ loads ÷ (1 − x) (workbook) or × (1 + x); SST = air temperature − TD; air volume = Q/(ρ·c_p·ΔT_air).'],
      inputs: [
        'D = carton thickness in the direction of heat flow (or diameter).',
        'h_air rises with air velocity over the product — use the supplier’s value or ASHRAE data; add carton/air-gap resistance.',
        'Frozen conductivity and densities: typical defaults are shown — use product data where available.',
        'Tabulated product properties come from your workbook; some freezing points are listed above 0 °C and must be corrected.'],
      checks: [
        'Air temperature below the product freezing point; centre temperature above the air temperature.',
        'Entered design time not shorter than the calculated (Pham) time.',
        'Plank < Pham: Plank ignores pre-cooling and sub-cooling.',
        'Batch freezing releases heat faster at the start — consider a load distribution factor > 1.0 or the supplier’s load curve.',
        'Fan motors inside the air stream add their full power to the load.'],
      refs: ['ashrae-freezing', 'plank', 'workbook-freezing', 'ashrae-foods', 'stoecker'] },
    machinery: { title: 'Machinery-room ventilation', purpose: 'Normal, continuous and emergency ventilation of the refrigeration machinery room under the selected code.',
      method: ['IIAR 2-2008A: emergency 30 ACH; normal = max(20 ACH, temperature limit 40 °C with 1 % design inlet air); ≥ 20 ACH after single-fan failure.', 'Older codes: 100·√G cfm, 0.5 cfm/ft², 20 cfm/person.'],
      inputs: ['Use a common standard for recurring design bases; override per project where required.'],
      checks: ['Two detectors (TLV-TWA and ≤ 1000 ppm).', 'Exhaust ≥ 12.7 m/s vertical, non-sparking; room negative ≤ 62 Pa.'], refs: ['iiar2a-13.3.9.1', 'iiar2a-13.3.8.1', 'iiar2a-13.3.2', 'iiar2a-13.2.3', 'iiar-mrvt'] },
    report: { title: 'Review & report', purpose: 'Validate, review, freeze a revision and issue the report and exports.',
      method: ['Reports recalculate with the current engine and print the engine version used by the revision.'],
      inputs: ['Enter Prepared / Checked / Approved; Approved or Issued locks the revision.'],
      checks: ['No open ERRORs before issue.', 'Internal approval is not regulatory approval.'], refs: [] },
  };

  function forRoute(route, ui) {
    const [id, step, mode] = route.params || [];
    if (route.name !== 'project') return T.general;
    if (step === 'details' || !step) return T.details;
    if (step === 'report') return T.report;
    if (mode === 'tunnel') return T.tunnel;
    if (mode === 'machinery') return T.machinery;
    return T[`room-${(ui && ui.roomTab) || 'general'}`] || T['room-general'];
  }

  const api = { TOPICS: T, forRoute };
  root.CL = root.CL || {};
  root.CL.guide = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
