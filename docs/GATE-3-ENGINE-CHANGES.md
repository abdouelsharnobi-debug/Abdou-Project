# Gate 3 — Proposed Calculation-Engine Changes

Status: **awaiting approval. Nothing below has been implemented.** Engine 1.0.0 (`js/psychro.js`, `data.js`, `calc.js`, `vent.js`) is byte-identical to the audited version and hash-locked by `tests/engine-lock.test.js`.

Based on your Gate 1 decision (D3), every result-changing item is proposed as an **option whose default is the current behaviour**. With defaults, all 21 regression baseline cases must give identical numbers. Approved items would become **engine 1.1.0** and input dataset **1.1** (additive optional fields only; old projects load unchanged).

Example numbers come from a scratch prototype run against the current engine. The chiller example is the standard `Chilled store` preset: 20 × 15 × 8 m at +2 °C, beef 10 t/day from +10 °C, 35 °C / 45 % outdoor air, run time 18 h, safety factor 10 %.

---

## Already handled without an engine change (information only)

- **E1: silent clamps.** Run time (1–24 h), pull-down (1–24 h) and CRF (≤ 1) are still limited inside the engine. The validation layer now reports each case as an **ERROR** stating the value the engine would use (codes R07, M07, M09). Nothing is silent any more, and results are unchanged.
  - **Recommendation:** keep the engine as is.
- **E2, E3, E8, E9** (negative dimensions, blank temperature, IIAR edition vs refrigerant, air-change table extrapolation) are handled the same way as validation messages (R02, R03, V02, X05).

## Items requiring approval

### G3-1 (E4): fan allowance on a negative base

| | |
|---|---|
| Current | `Q_fans = fanPct × (transmission + product + infiltration + internal)`, which can be negative |
| Proposed | `Q_fans = fanPct × max(0, base)` |
| Reference | Physical logic: fan motor heat cannot be negative. No code reference. |
| Example | All surfaces adjacent to −10 °C, no other loads: base −75.7 kWh/day → fans **−6.06** now vs **0** proposed |
| Impact | Only rooms whose net base load is ≤ 0. Those rooms already raise ERROR X03, and no baseline case is affected. This is a correction rather than an option. |

### G3-2 (E5): product load when the pull-down time is shorter than the run time

| | |
|---|---|
| Current (default) | `Q_product,capacity = m·q × (24 / t_pull) × (1+SF) / t_run` (Koldpro-style 24-h equivalent, then ÷ run time) |
| Proposed option "rate over pull-down" | `Q_product,capacity = m·q × (1+SF) / min(t_pull, t_run)`, i.e. product heat removed at a constant rate over the pull-down time, never slower than the run time allows |
| Reference | ASHRAE Handbook—Refrigeration, "Refrigerated-Facility Loads" (product load as heat removed over the pull-down period) and Stoecker, *Industrial Refrigeration Handbook*. **Chapter and edition to be confirmed from your copies.** |
| Example | Chiller, 12 h pull-down: product Q = 72.27 kWh/day. Product contribution is **8.83 kW now** vs **6.62 kW proposed**; room capacity **25.10 → 22.89 kW (−8.8 %)** |
| Example | 24 h pull-down (the default): **identical**, because min(24, 18) = 18 gives Q/18 in both methods (20.23 kW) |
| Impact | The option changes results only when the pull-down time is shorter than 24 h, and it gives a lower load than the current method. The fan allowance stays on the daily-energy basis. Selectable per room; default = current. |

### G3-3 (E7): credit for heat loss to colder surroundings

| | |
|---|---|
| Current (default) | A surface next to a colder space gives a negative load that reduces the total |
| Proposed option "no credit" | `Q_surface = max(0, U·A·ΔT)`, so heat loss is not credited |
| Reference | Conservative design practice (the adjacent room may be off, defrosting or at a higher temperature). No code requirement. |
| Example | Chiller with one 15 × 8 m wall next to a −25 °C freezer: credit −16.34 kWh/day. Capacity **17.81 kW now** vs **18.89 kW with no credit (+6.1 %)** |
| Impact | Selectable per project (Design criteria). Default = current. Warning X02 already reports every credited surface. |

### G3-4 (E6): product specific-heat and latent-heat overrides

| | |
|---|---|
| Current | c_pa = 3.35·x_w + 0.84; c_pb = 1.26·x_w + 0.84; h_if = 334·x_w (Siebel; latent heat assumes all water freezes) |
| Proposed | Optional fields per product: c_p above freezing, c_p below freezing, latent heat. Blank = Siebel values (current). |
| Reference | ASHRAE Handbook—Refrigeration, "Thermal Properties of Foods" (tabulated values / manufacturer data) |
| Example | Beef 72 %: Siebel h_if = 240.5 kJ/kg. An entered value (e.g. 233 kJ/kg from a data sheet) would be used instead, and shown as an override in the assumptions register. |
| Impact | None unless the engineer enters a value. |

### G3-5 (E10): respiration heat of incoming produce

| | |
|---|---|
| Current | `Q_resp = stored [t] × w [W/t] × 24 / 1000` (stored produce only) |
| Proposed | Add optional `w_in` [W/t] for incoming produce at its mean pull-down temperature: `Q_resp,in = m_in [t/day] × w_in × 24 / 1000`. Blank = 0 (current). |
| Reference | Your *Heat_Load_Calc* workbook ("Heat of respiration: New in / Existing") and Dossat. Incoming produce respires faster while it is still warm. |
| Example | Apples, 60 t/day intake at w_in = 30 W/t: +43.2 kWh/day (+2.4 kW at 18 h run, before safety) |
| Impact | None unless a value is entered. |

## Regression and verification plan (after approval)

1. Implement only the approved items and bump `ENGINE_VERSION` to 1.1.0.
2. Run all 21 baseline cases with default options. They must equal `baseline-v1.json` exactly (**CURRENT vs NEW = identical**).
3. Add new cases for each option, compared with the hand calculations above: 22.89 kW, 18.89 kW, fans 0, +43.2 kWh/day.
4. Record `baseline-v1.1.json`. Reports print "engine 1.1.0". Revisions saved with engine 1.0.0 keep their recorded results.
5. Update the engine hash lock.

## Your decision

Please reply with the items you approve, for example:

- **"Approve G3-1 to G3-5"**;
- **"Approve G3-1, G3-4, G3-5; reject G3-2, G3-3"**;
- or **"No engine changes"**. The application is complete on engine 1.0.0 either way; I would then proceed to the Gate 4 QA audit.
