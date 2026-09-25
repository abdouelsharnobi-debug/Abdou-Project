# ColdLoad Pro 2

ColdLoad Pro is a company-neutral engineering application for **industrial refrigeration heat-load calculation** and **machinery-room ventilation (IIAR 2)**. It covers:

- multi-customer projects with revision control;
- engineering validation, tips, an assumptions register and calculation transparency;
- PDF, Excel and CSV reports;
- backup and restore.

It runs **offline in Microsoft Edge or Google Chrome**. There is nothing to install and no server. Data is stored in the browser's database (IndexedDB) on your PC.

## Install / launch on Windows

1. Copy `dist/ColdLoadPro.html` and `dist/Launch ColdLoad Pro.bat` into one folder, e.g. `C:\ColdLoadPro`.
2. Double-click **Launch ColdLoad Pro.bat**. The app opens in its own window.
3. On first start, create the administrator account. There is no default password.
4. If a project from version 1 exists in the same browser, it is migrated automatically to Rev 00. The original copy is kept.

Always open the app from the same file location and the same browser, because the database belongs to that browser profile. Make regular full backups (**Backup** in the action bar, or Settings → Storage) to a network or cloud folder.

**Rollback:** `dist/legacy/ColdLoadPro-v1.html` is the previous version, unchanged. It still reads its original stored project.

## Workflow

Sign in → **Dashboard** → **New / Open project** → then three steps:

1. **① Project Details:** customer, parties, site, Region → Country → State → City selection, design criteria.
2. **② Detailed Design:** rooms (envelope, product, infiltration, internal and equipment loads, calculation and results) and machinery rooms (common standard plus project overrides).
3. **③ Review & Report:** validation, results, assumptions, revisions and review, report and export, attachments.

Also available:

- **Document Center:** search, filters, sorting, paging, duplicate, archive, export, Trash.
- **Customers**, **Standards & references**, **Settings** and **Help**.

## Architecture

| Layer | Files | Notes |
|---|---|---|
| Calculation engine 1.0.0 | `js/psychro.js`, `js/data.js`, `js/calc.js`, `js/vent.js` | Unchanged since the Gate 1 audit. The file hashes are locked by `tests/engine-lock.test.js`. |
| Model / migration | `js/model.js`, `js/migrate.js` | v1 dataset format kept as the engine input; v1 → v2 migration. |
| Services | `js/core/*.js` | IndexedDB storage, local accounts (PBKDF2), projects and revisions, backup/restore, templates, units, validation, transparency, references, city library, XLSX/CSV writer, report builder. |
| UI | `js/ui/*.js`, `css/app.css` | Plain DOM, no framework, light and dark themes. |

The data model, migration and rollback are described in `docs/GATE-2-DATA-MODEL.md`. The audit and design decisions are in `docs/GATE-1-AUDIT.md`.

## Method and references

- Stoecker, *Industrial Refrigeration Handbook*
- Dossat, *Principles of Refrigeration*
- ASHRAE Handbook—Refrigeration, *Refrigerated-Facility Loads* and *Thermal Properties of Foods*
- ASHRAE Handbook—Fundamentals, *Psychrometrics*
- IIAR *Machinery Room Ventilation Analysis Tool* (IIAR 2-2008 Addendum A §13.2–13.3)

Clause numbers are shown only where they were verified from a supplied document. ASHRAE climatic design values are licensed and are **not** included. Enter them once in the city library, or import them from CSV.

## Development

```
npm test        # unit, service, regression, migration, engine-lock and syntax tests (node --test)
npm run build   # bundles dist/ColdLoadPro.html and dist/legacy/ColdLoadPro-v1.html
```
