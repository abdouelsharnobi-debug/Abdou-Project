# ColdLoad Pro

A web app for calculating heat loads in **industrial refrigeration** design: cold stores, freezers, blast freezers, fruit and vegetable stores, ripening rooms, anterooms and docks. It also sizes **machinery-room ventilation to IIAR 2**. The workflow is tab-by-tab, like Copeland Koldpro "detailed": Room → Transmission → Product → Infiltration → Internal & equipment → Results.

It runs completely offline in any modern browser. There is nothing to install and no server.

## Install / launch on a Windows PC

1. Download `dist/ColdLoadPro.html` and `dist/Launch ColdLoad Pro.bat` into the same folder (for example `C:\ColdLoadPro`).
2. Double-click **Launch ColdLoad Pro.bat**. The app opens in its own window using Microsoft Edge or Google Chrome.
   Or just double-click `ColdLoadPro.html` to open it in your default browser.
3. Optional: right-click the `.bat` → *Send to → Desktop (create shortcut)*.

Your project is saved automatically in the browser. Use **Save** / **Open** to keep projects as `.coldload.json` files, and **Report / PDF** to print or save the calculation report.

## Features

- Multi-room projects with a **plant summary** grouped by saturated suction temperature (SST).
- **Transmission**: U-value from the insulation material and thickness (PUR/PIR, XPS, EPS, mineral wool, cellular glass, cork), with ASHRAE sun-effect allowance, adjacent spaces and a ground/heated slab.
- **Product**: a database of about 37 commodities. It covers chilling, freezing and frozen tempering (Siebel specific heats and latent heat), pull-down time, Dossat's chilling rate factor, packaging, and heat of respiration.
- **Infiltration**, by either
  - the door-opening method (Gosney & Olama with Dₜ, D_f and protection effectiveness E: strip curtains, air curtains, vestibules), or
  - the air-change method: Dossat's table × usage factor, 70/√V × f (storage rooms), 35/√V × fn per hour (docks), or a manual value.
- Mechanical ventilation / fresh air; people (272 − 6t W); lighting; forklifts; other equipment; evaporator fans (% or kW); and defrost heat.
- **Results**: kWh/day breakdown, safety factor, run time → capacity in kW / TR / Btu/h / kcal/h, suggested evaporator TD and SST, frost load. Also rule-of-thumb checks (kcal/m³·day, air-cooler surface from K and LMTD).
- **Machinery-room ventilation**: normal, continuous and emergency rates per IIAR 2-2008 Add. A, IIAR 2-1999/1992, IMC, ASHRAE 15 and UMC/CMC. Includes motor and envelope heat, an installed-fan compliance check, and the IIAR detection/fan requirements checklist.

## Method and references

- W. F. Stoecker, *Industrial Refrigeration Handbook*: refrigeration load calculation.
- R. J. Dossat, *Principles of Refrigeration*: cooling-load calculations and air-change tables.
- ASHRAE Handbook—Refrigeration: *Refrigerated-Facility Loads*, *Thermal Properties of Foods*.
- ASHRAE Handbook—Fundamentals: *Psychrometrics*.
- ANSI/IIAR 2 and the IIAR *Machinery Room Ventilation Analysis Tool*; IIAR 9 and IIAR 4/5/6/7 design notes.

The formulas are listed in the app under **Method & standards**. Database values are typical. Always confirm the basis of design (product data, design weather, code edition in force) for each project.

## Development

```
npm test         # unit tests (node --test), no dependencies
npm run build    # bundles everything into dist/ColdLoadPro.html
```

Source: `index.html`, `css/style.css`, and `js/` (`psychro.js`, `data.js`, `calc.js`, `vent.js`, `model.js`, `app.js`).
