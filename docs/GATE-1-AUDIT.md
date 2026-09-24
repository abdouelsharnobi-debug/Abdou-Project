# Gate 1 — Audit of ColdLoad Pro v1.0 and Redesign Plan

Status: **awaiting approval**. Nothing has been changed in the engine, data or UI. The only additions are a regression baseline and this report.

Audited commit: `ba583ba` (branch `claude/new-session-w3wiw4`).

---

## 1. Current architecture

| Layer | File | Lines | Role | Separated from UI? |
|---|---|---|---|---|
| Psychrometrics | `js/psychro.js` | 56 | ASHRAE Hyland–Wexler p_ws, W, h, v, ρ, altitude pressure | Yes, pure functions |
| Reference data | `js/data.js` | 175 | Insulation k, film coefficients, sun effect, door protection E, packaging c_p, 37 commodities, room presets, Dossat air-change table, usage factors, refrigerants | Yes |
| Heat-load engine | `js/calc.js` | 327 | `calcRoom`, `calcProject` and the component functions | Yes, pure functions |
| Machinery-room ventilation engine | `js/vent.js` | 171 | `calcMachineryRoom` for 6 code bases | Yes, pure functions |
| Model factories | `js/model.js` | 97 | `newProject`, `newRoom`, `newProduct`, `newDoor`, example project | Yes |
| UI | `js/app.js` | 662 | Hand-written DOM rendering, form binding, views, report HTML | **Mixed**: report and results formatting live here |
| Styles | `css/style.css` | 212 | Light/dark tokens, layout, print CSS | — |
| Shell | `index.html` | 62 | Loads scripts in order | — |
| Build | `tools/build.js` | — | Inlines everything into `dist/ColdLoadPro.html` | — |
| Tests | `tests/*.test.js` | — | 7 benchmark tests plus 21 regression tests (new) | — |

**Runtime:** a static HTML/JS app with no dependencies. It runs from `file://` in Chrome or Edge, fully offline.

**Engine/UI separation:** already good. The engine modules are pure and run in Node. The UI only reads `calcRoom()` output. The target architecture keeps this and makes it stricter (see §7).

## 2. Current calculation methodology (engine v1.0)

Loads are accumulated as energy per day (kWh/day). Capacity = Σ × (1 + safety) ÷ run hours.

| Component | Current formula | Reference basis |
|---|---|---|
| Transmission | Q = U·A·(T_o + sun − T_i); U = 1/(1/h_i + L/k + 1/h_o + R_extra); h_i 9.4, h_o 34 (outdoor) or 9.4 (adjacent), no outer film to ground | Stoecker; ASHRAE Refrigeration "Refrigerated-Facility Loads" (sun-effect table) |
| Product | m·[c_pa(T₁−T_f) + h_if + c_pb(T_f−T₂)], Siebel c_pa = 3.35x_w+0.84, c_pb = 1.26x_w+0.84, h_if = 334x_w; × 24/pull-down; ÷ CRF | Dossat; ASHRAE "Thermal Properties of Foods" |
| Packaging | m_pack·c_p·(T₁−T₂) × 24/pull-down | Dossat / Stoecker |
| Respiration | stored t × W/t × 24 h | Dossat; ASHRAE |
| Door infiltration | Gosney–Olama q = 0.221·A·Δh·ρ_r·(1−ρ_i/ρ_r)^½·(gH)^½·F_m; × open h/day × D_f × (1−E) | Stoecker; ASHRAE |
| Air-change infiltration | V·n·Δh / v_out, where n = Dossat table × usage, or 70/√V·f per day, or 35/√V·fn per hour × 24, or manual | Dossat; your heat-load workbook |
| Ventilation air | ṁ(h_out − h_in) × hours | Psychrometrics |
| People | (272 − 6t) W × n × h | ASHRAE; matches Dossat's table |
| Lights / forklifts / other | W or kW × hours | — |
| Evaporator fans | % of all other loads, or kW × h | Workbook practice |
| Defrost | kW × cycles × min/60 × fraction to room | Stoecker / ASHRAE guidance |
| Machinery-room ventilation | IIAR 2-2008 Add. A: normal = max(20 ACH, q/(1.08ΔT) to 104 °F), emergency 30 ACH; older IIAR 2 / IMC / ASHRAE 15 / CMC: 100√G cfm, 0.5 cfm/ft², 20 cfm/person | Formulas taken from the IIAR Machinery Room Ventilation Analysis Tool you supplied |

Independent benchmark checks already pass: p_ws vs ASHRAE tables, the 100 mm PU panel U = 0.21 (matches your workbook table), the Siebel beef case, the freezer transmission hand calculation, 30 ACH and 100√G.

## 3. Current data structure and storage

- **Storage:** one project only, as JSON in `localStorage['coldload-pro-project-v1']`. Autosaved on every keystroke. Manual Save/Open as a `.coldload.json` download.
- **Schema (v1):**
  - `project`: `{ version: 1, info{name, client, location, engineer, date, rev}, design{ambientDB, ambientRH, altitude, groundTemp, safetyFactor, refrigerant}, rooms[], machinery[] }`
  - `room`: `{ id, name, type, dims{L,W,H}, cond{T,RH}, runHours, TD, safety, sstOverride, surfaces[6], products[], infMethod, doors[], airChange{}, evap{}, ventilation{}, internal{}, equipment{}, notes }`
  - `machinery`: `{ name, code, refrigerant, L, W, H, chargeKg, occupants, detector, maxSetpoint, setpoint, basement, toaC, tsaC, surfaces[4], motors[], installed{} }`
- There is no project ID, no customer/company entity, no revision history, no users and no attachments.

## 4. Existing features (all to be kept)

Multi-room project; room presets; 6-surface transmission with overrides; product database with overrides; two infiltration methods; ventilation air; internal and equipment loads; live results panel; results tab with detail tables; plant summary grouped by SST; machinery-room ventilation (6 code bases, compliance check, checklist); Method & Standards page; print/PDF report; JSON save/open; example project; light/dark mode; responsive layout; single-file build; Windows launcher.

## 5. Limitations found (evidence-based)

### 5a. Engineering / validation — **these go to Gate 3**

| # | Finding | Evidence (reproduced) | Violates |
|---|---|---|---|
| E1 | Inputs are **silently clamped**: run hours to 1–24, pull-down to 1–24 h, CRF to ≤ 1 | `runHours=30` → 24; `runHours=0` → 1; `pullDown=0` → 1; `crf=1.5` → 1 | §12 "never silently correct" |
| E2 | Negative dimensions are accepted | L = −20 m → volume −2400 m³, capacity 0.4 kW | §12 |
| E3 | Blank room temperature is treated as 0 °C | `T=''` → SST −6 °C | §12 |
| E4 | Fan % is applied to a **negative** base when the room loses heat | All surfaces adjacent to −10 °C → fans −6.1 kWh/day, total −90 kWh/day | Engineering logic |
| E5 | Product load is scaled by 24/pull-down **and then** divided by run hours. This matches the Koldpro convention but overstates the pull-down rate by 24/run-hours compared with the ASHRAE "rate over pull-down time" approach | Chiller, 12 h pull-down: product adds 8.83 kW now vs 6.62 kW on a rate basis; room 25.10 vs 22.89 kW | Method choice; must be disclosed |
| E6 | Latent heat is Siebel 334·x_w (assumes all water freezes). ASHRAE notes this overestimates latent heat. No field exists to enter c_p / latent from a product data sheet | Beef 72 %: h_if = 240.5 kJ/kg | §9 (product c_p/latent inputs required) |
| E7 | Heat **loss** to colder adjacent spaces is credited (negative load). Many designers do not take this credit, because the adjacent room may be off or warm | Chiller with one wall to −25 °C: credit −16.3 kWh/day; capacity 17.81 kW vs ≈ 18.9 kW without credit | Conservative-practice question |
| E8 | IIAR 2 editions can be selected for a non-ammonia refrigerant without warning | vent.js `ammoniaOnly` flag is never checked | §12 |
| E9 | Dossat table extrapolation above 2 832 m³ is flagged only in the results text, not as a warning | — | §12 |
| E10 | Respiration counts stored product only; there is no separate rate for incoming warm product (your workbook has "new in" and "existing") | — | Accuracy (enhancement) |

**No formula errors were found** in the transmission, Gosney–Olama, psychrometric, people, Siebel or IIAR ventilation implementations. E1–E4 and E8–E9 are validation defects. E5–E7 and E10 are method choices that need your decision.

### 5b. Product, UX and data safety

| # | Finding |
|---|---|
| U1 | Only one project can exist; **New/Example overwrite it** (after a `confirm()`). No customers, IDs, revisions or document centre |
| U2 | Every keystroke writes to storage; there is no Saved/Unsaved state, no Save As, and no warning before closing |
| U3 | No validation layer, warnings register, assumptions register or calculation-transparency view |
| U4 | Native `alert`/`confirm` dialogs; errors are shown raw (e.g. "Could not open file: Unexpected token…") |
| U5 | Opened JSON is validated only by `Array.isArray(rooms)`; there is no schema check, version migration or safety backup |
| U6 | Report is browser print only: no cover page, page numbers, traceability block, revision history or sign-off block |
| U7 | No units system: SI input only, and TR/Btu/h/kcal/h appear only in results |
| U8 | No login, settings centre, company/customer branding, search, statuses or review workflow |
| U9 | No Excel/CSV export |
| U10 | Company-specific wording appears in labels ("JCI heat load program", "JCI/Sabroe practice"). It must become neutral: "empirical storage-room formula (70/√V)" |

## 6. Regression baseline (established)

- `tests/fixtures/baseline-v1.json` records engine v1.0 results (every load component, every surface, product, door, air change, SST and capacity) for 13 room cases and 8 ventilation cases:
  - room cases: cold room, fruit store with respiration, freezer, blast freezer (freezing), processing room (people/lights/equipment/fresh air), ripening room, heavy-traffic anteroom, 3 air-change variants, fans kW + defrost, sun + adjacent, full example project;
  - ventilation cases: all 6 codes, no detector + basement, 46 °C climate.
- `tests/regression.test.js` fails on **any** numeric difference, so every future engine change must show *current vs new* and get an approved baseline update.
- `npm test`: 28/28 pass.

## 7. Proposed target architecture

```
┌────────────────────────── UI (views, components) ──────────────────────────┐
│ Login · Dashboard · Document Center · Project workspace · Settings · Help   │
│ uses: unit formatter · validation messages · dialogs/toasts · router        │
└──────────────┬──────────────────────────────────────┬───────────────────────┘
               │ commands (save, revise, export…)      │ read-only results
┌──────────────▼──────────────┐        ┌──────────────▼───────────────────────┐
│ Application services         │        │ Engine (pure, versioned, unchanged)  │
│ projects · revisions · auth  │──────▶ │ psychro · calc · vent · data         │
│ backup/restore · export      │        │ + validate.js (errors/warnings/info) │
│ migrations · audit trail     │        │ + trace.js (formula/inputs/results)  │
└──────────────┬──────────────┘        └──────────────────────────────────────┘
               │ repository interface
┌──────────────▼──────────────┐
│ Storage adapter: IndexedDB (browser) — swappable for a desktop file store   │
└─────────────────────────────┘
```

- The engine stays exactly as it is and gets an `ENGINE_VERSION`. Validation and traceability are **new, separate modules** that only read inputs and results.
- The report, Excel and CSV exporters become services that consume engine output. No formatting logic goes into the engine.
- Still no framework and no build-time dependencies. Plain ES modules are bundled into the single offline HTML file by the existing build script, and the Excel writer is a small in-house zip/XLSX writer, so it keeps working offline.

## 8. Proposed data model (preview only; formal approval at Gate 2)

`IndexedDB "coldload"` with object stores:

| Store | Key | Main fields | Indexes |
|---|---|---|---|
| `users` | id | username, displayName, pwHash (PBKDF2-SHA256, 310k iterations, salt), role, prefs | username |
| `companies` | id | name, logo (data URL), address, contact, web, email, phone | name |
| `customers` | id | companyId, name, logo, address, contact | name |
| `projects` | id (UUID) | projectNo, name, customerId, endUser, consultant, contractor, site, country, city, status, type, createdBy/At, modifiedBy/At, currentRev, notes, archived, **ventOverrides** | projectNo, customerId, status, modifiedAt |
| `revisions` | [projectId, rev] | rev (00, 01…), date, user, description, **data** (the full v1 project payload), resultsSnapshot, engineVersion, dataVersion, review {prepared, checked, approved: name/date/status} | projectId |
| `templates` | id | common machinery-room ventilation basis, default design criteria/assumptions | kind |
| `attachments` | id | projectId, name, mime, blob, size, addedAt | projectId |
| `settings` | key | general, units, reports, numbering, statuses | — |
| `backups` | id | automatic safety backups before restore/migration | createdAt |

**Backward compatibility:** the current v1 project JSON becomes the `data` payload of a revision **unchanged**. Migration of your current browser project (and of any `.coldload.json` file you open) creates Company → Customer (from `info.client`) → Project → Rev 00. A safety backup is written first. The original localStorage key is **left in place** as the rollback copy.

## 9. Proposed UI structure

- **Entry:** login (local accounts) → **Dashboard**: KPIs (projects by status, total load, load by application, warnings), recent and modified projects, quick actions.
- **Global shell:** left navigation (Dashboard, Document Center, Customers, Standards library, Settings, Help); top action bar (New · Open · Save · Save As · Undo · Redo · Backup · Restore · Export ▾ · Print · Settings · Help) with a Saved/Unsaved indicator; global search (Ctrl+K).
- **Guided flow (Koldpro-style, per your screenshot):** a 3-stage stepper across the top of every project: **① Project Details → ② Detailed Design → ③ Report Generation**. Each stage shows a completed / active / pending state and is blocked by validation ERRORs.
- **City selection (stage ①):** cascading **Region → Country → State/Province → City** lists that fill in the outdoor design dry bulb, coincident wet bulb/RH, altitude and suggested ground temperature. The filled values stay editable and are flagged as *user override* if changed. The source and edition of the weather data are printed in the report.
- **Project workspace:** header (project ID, number, revision, status, customer) and a workflow stepper: *Project info → Design criteria → Rooms (collapsible engineering sections with ⓘ tips) → Machinery room (common template + overrides) → Validation → Results → Review → Report*. The right panel shows the live load and the warnings count.
- **Calculation transparency:** every result row expands to *inputs → formula → intermediate values → result [unit] → reference*.
- **Document Center:** a paginated, virtualised table with search, filters (customer, project no, site, status, date, revision, engineer, type), sorting, and open/duplicate/archive/export/delete (with confirmation).
- **Settings centre:** general / company / customer defaults / engineering defaults / standards / reports / storage / security.
- **Help centre:** usage, methodology, input definitions, glossary, standards, troubleshooting, FAQ.

## 10. Standards and reference framework

A reference register (`references.js`) stores: name, number, edition, clause (only where verified), topic, application, source, notes, and a classification (**Required/code**, **Recommended practice**, **Application assumption**, **User input**).

- **Clause-verified from your supplied IIAR tool:** IIAR 2-2008 Addendum A §13.2.1.1, 13.2.1.2, 13.2.3.1, 13.2.3.2, 13.3.1, 13.3.2, 13.3.3, 13.3.7.1, 13.3.7.2, 13.3.8.1–13.3.8.3, 13.3.9.1–13.3.9.2.
- **Everything else** (ASHRAE Handbook chapter titles, Stoecker, Dossat, EN 378, ISO 5149, IIAR 2-2021) is listed **without clause numbers** and marked "edition/clause to be verified by user" until you supply the documents.

## 10a. Climate / city database

- It is stored as its own reference table: `{region, country, state, city, lat, lon, elevation, DB 0.4 %, DB 1 %, MCWB, DB 99.6 % (winter), source, edition, verified}`.
- **ASHRAE Climatic Design Conditions are copyrighted.** I will not type design temperatures from memory and present them as ASHRAE values. Options (decision D4):
  - (a) **You import** your licensed data (ASHRAE Handbook CD / climate tool export, or a company weather list) through a CSV template.
  - (b) I seed the Region → Country → City lists (names, coordinates, elevation only), with design temperatures left blank for you to fill in once. They are then reused on every project.
  - (c) Both.
- Each value records a status: *verified source* / *user-entered*. Projects print it.

## 11. Migration risks

| Risk | Mitigation |
|---|---|
| Loss of the current browser project | Safety backup first; the v1 localStorage key is never deleted; a v1 file can still be opened |
| Engine result drift during refactor | The regression suite must stay green; any change needs a Gate 3 approval and a new baseline |
| IndexedDB unavailable (private mode, blocked storage) | Detect and fall back to a warning with file-based save only |
| Browser storage is not a real "storage location" | See decision D1 below |
| A local login is not real security | Stated clearly; optional encryption at rest (D2) |

## 12. Implementation phases

| Phase | Content | Gate |
|---|---|---|
| 1 | This audit + baseline | **Gate 1 (now)** |
| 2 | Architecture skeleton, schema, migration, rollback | **Gate 2** |
| 3 | Companies / customers / projects / revisions / IDs | — |
| 4 | App shell, dashboard, action bar, design system, dark/light | — |
| 5 | Validation engine, tips, assumptions register, references, transparency | **Gate 3** for E1–E10 |
| 6 | Document Center, search, statuses, review workflow | — |
| 7 | Save/Save As/autosave, undo/redo, backup/restore with validation | — |
| 8 | PDF report (cover, TOC, page numbers, traceability), XLSX, CSV, JSON package | — |
| 9 | Settings, branding, units system | — |
| 10 | QA/QC: benchmark and regression, functional, UI (Playwright), data integrity | **Gate 4** |

## 13. Decisions needed from you

- **D1 — Platform.** (a) Offline browser app with IndexedDB (recommended: no installation; data lives in the Edge/Chrome profile; backups are files you choose; "open with" works through your download folder and Windows file associations). (b) A Windows desktop app (Electron) with a real data folder and native Save/Open dialogs; about 100 MB and a larger build. (c) A shared server for a team, which needs hosting and real accounts.
- **D2 — Login.** Local accounts on this PC (hashed passwords; it restricts access but is not strong protection unless data encryption is also enabled). Options: with or without AES-GCM encryption of stored projects; a forgotten password then means lost data unless a recovery key is kept.
- **D3 — Engine items (Gate 3 preview).**
  - E1–E4, E8, E9: replace silent clamps with validation errors/warnings. **Results are unchanged for valid inputs** (proven by the regression suite).
  - E6: add optional c_p / latent override fields (blank = current Siebel values, no change).
  - E10: add incoming-product respiration (new optional input, default 0, no change).
  - E5 and E7 would change results, so I propose making them selectable options with the **current behaviour as default** until you decide.
- **D4 — Weather data source** for the city picker: see §10a.
