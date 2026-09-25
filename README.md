# ColdLoad Pro 2

ColdLoad Pro is a company-neutral engineering application for **industrial refrigeration heat-load calculation** and **machinery-room ventilation (IIAR 2)**. It covers:

- multi-customer projects with revision control;
- engineering validation, tips, an assumptions register and calculation transparency;
- PDF, Excel and CSV reports;
- backup and restore.

It runs **offline in Microsoft Edge or Google Chrome**. There is nothing to install and no server. Data is stored in the browser's database (IndexedDB) on your PC.

## Windows desktop version (recommended)

ColdLoad Pro is also packaged as a Windows desktop application (64-bit Windows 10/11). It runs the same calculation engine as the browser version, and the results are identical.

| File | Use |
|---|---|
| `ColdLoad-Pro-Setup-2.0.0.exe` | Installer, per user, no administrator rights needed. Adds Start-menu and desktop shortcuts and an uninstaller. You can choose the install folder. |
| `ColdLoad-Pro-Portable-2.0.0.exe` | Single file that runs without installing, e.g. from a USB drive. |

**Unsigned installers:** the exe files are not code-signed, so Windows SmartScreen shows "Windows protected your PC". Click **More info → Run anyway**.

What the desktop version adds:

- **Data folder:** projects are stored in `%APPDATA%\ColdLoad Pro`, not in a browser profile. Open it from **File → Open data folder**.
- **Automatic daily backup** to `Documents\ColdLoad Pro\Backups` when the app starts (at most once a day). The folder, on/off and how many backups to keep are set in Settings → Storage. Each file is written to a temporary name, then renamed.
- **Native Save dialogs** for PDF, Excel, CSV and JSON. The PDF is written directly as A4 with page numbers, with no print dialog. After an export, **Open** and **Show in folder** are offered.
- **Security:** its own window with a sandboxed page. External links open in your default browser.
- **Log:** `%APPDATA%\ColdLoad Pro\logs\main.log`, for support.

**Moving data from the browser version:** in the browser version, choose **Backup** and save the full backup file. In the desktop app, choose Settings → Storage → **Restore** and pick that file.

To build the installers yourself, see `desktop/README.md`.

## Browser version (no install)

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

- **Tunnel / blast freezers** (Step ②): freezing time by Plank and Pham (ASHRAE) for slabs, cylinders and spheres; tunnel load by the continuous-flow method of the heat-load workbook; tabulated product library (113 products, imported from the workbook); tunnel capacity added to the plant total at its suction level.
- **Reference guide** (F1 or **Guide**): a side panel with method, formulas, inputs to watch, checks and references for the current screen. It stays open while you work.
- **Document Center:** search, filters, sorting, paging, duplicate, archive, export, Trash.
- **Customers**, **Standards & references**, **Settings** and **Help**.

## Architecture

| Layer | Files | Notes |
|---|---|---|
| Calculation engine 1.1.0 | `js/psychro.js`, `js/data.js`, `js/calc.js`, `js/vent.js` | Gate 3 items G3-1 to G3-5 (approved), all defaulting to 1.0.0 behaviour. The file hashes are locked by `tests/engine-lock.test.js`. `docs/GATE-3-REGRESSION.md` compares CURRENT and NEW results. |
| Freezing engine 1.0.0 | `js/freeze.js`, `js/core/products-tab.js` | Plank / Pham freezing time, tunnel loads, plant totals. Separate module, hash-locked by `tests/freeze.test.js`; reuses the heat-load engine helpers without changing them. |
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
cd desktop && npm install && npm run dist:win   # Windows installers in desktop/release/
```
