# Gate 2 — Data Model, Migration and Rollback

Status: **awaiting approval**. The migration code (`js/migrate.js`) and its tests exist, but it is **not wired into the app**. No stored data has been touched.

Decisions from Gate 1: offline browser app with IndexedDB · local accounts (hashed passwords, no encryption) · cities seeded, design values entered by the user · engine items E5/E7 become options with the current default.

---

## 1. Storage

- **Database:** browser IndexedDB, name `coldload`, schema version `2`. It holds hundreds or thousands of projects and indexed queries, and works offline from `file://` in Edge/Chrome.
- **What stays outside the database:** backup, project package, report and export files, which you save wherever you choose.
- **Where the data physically lives:** the Edge/Chrome user profile on this PC. The Settings → Storage page shows this, plus the database size and the last backup date. It reminds you to back up because clearing browser data would delete the database.
- **Persistence request:** the app calls `navigator.storage.persist()` so the browser does not evict the data under disk pressure. The result is shown in Settings.

## 2. Schema v2

All IDs are UUID v4. Times are ISO-8601 UTC. The engine's internal units stay SI; unit conversion happens only in the UI and report.

| Store | Key | Fields | Indexes |
|---|---|---|---|
| `meta` | key | `schemaVersion`, `appVersion`, `createdAt`, `migrations[]` (history), `installId` | — |
| `users` | id | `username`, `displayName`, `email`, `role` (admin, engineer), `pw {algo:'PBKDF2-SHA256', iterations:310000, salt, hash}`, `createdAt`, `lastLoginAt`, `prefs {theme, units, dateFormat, autosaveSec}` | `username` (unique) |
| `sessions` | id | `userId`, `createdAt`, `expiresAt`, `remember` | `userId` |
| `companies` | id | `name`, `logo` (data URL, ≤ 1 MB), `address`, `phone`, `email`, `web`, `isDefault` | `name` |
| `customers` | id | `name`, `logo`, `address`, `contact`, `phone`, `email`, `notes`, `createdAt/By` | `name` |
| `projects` | id | `projectNo`, `name`, `companyId`, `customerId`, `endUser`, `consultant`, `contractor`, `site`, `country`, `city`, `climateId`, `status`, `type`, `tags[]`, `notes`, `createdAt/By`, `modifiedAt/By`, `currentRevId`, `working {data, baseRevId, dirty, savedAt}`, `vent {templateId, templateVersion, snapshot, overrides{}}`, `archived`, `deletedAt`, `migratedFrom` | `projectNo`, `customerId`, `status`, `modifiedAt`, `archived` |
| `revisions` | id | `projectId`, `rev` ("00", "01"…), `seq`, `createdAt/By`, `description`, **`data`** (engine input dataset), `dataVersion`, `engineVersion`, `results` (per-room kW and totals at the time of saving), `review {prepared, checked, approved: {name, date}, status}`, `locked` | `projectId`, `[projectId+seq]` |
| `templates` | id | `kind` (`machineryVent`, `designCriteria`, `assumptions`), `name`, `version` (integer, bumped on every edit), `data`, `modifiedAt/By` | `kind` |
| `climate` | id | `region`, `country`, `state`, `city`, `lat`, `lon`, `elevation`, `db04`, `db1`, `mcwb04`, `mcwb1`, `db996`, `source`, `edition`, `status` (seed / user-entered / verified) | `[region+country+state]`, `city` |
| `references` | id | `name`, `number`, `edition`, `clause`, `clauseVerified`, `topic`, `application`, `source`, `notes`, `classification` (code-required / recommended practice / assumption / user input) | `topic` |
| `attachments` | id | `projectId`, `name`, `mime`, `size`, `blob`, `addedAt/By`, `note` | `projectId` |
| `settings` | key | general, units, reports (footer, numbering pattern), statuses list, storage info | — |
| `safetyBackups` | id | `createdAt`, `reason` (pre-restore, pre-migration), `payload` (compressed full backup); the last 5 are kept | `createdAt` |
| `auditLog` | id | `at`, `userId`, `action`, `entity`, `entityId`, `summary` | `entityId`, `at` |

**Company → Customer → Project → Site → System → Calculation → Revision → Report**, mapped onto the stores:
- Company and customer are records.
- Project holds the site fields.
- A project's calculation (`data`) contains the rooms (refrigeration systems are grouped by SST level, as today) and the machinery rooms.
- Revisions are snapshots. Reports are generated from a revision.

## 3. Save, working copy and revisions

- **Working copy:** `project.working.data` is what you edit. The status indicator reads *Unsaved changes* → *Saving…* → *Saved*.
  - **Save** writes the working copy.
  - **Auto-save** writes it every *n* seconds (Settings; off by default).
  - Closing the tab with unsaved changes shows the browser's leave-page warning.
- **Save revision:** freezes the working copy into a new `revisions` record ("01", "02"…) with a change description, user, date, engine version and a results snapshot. Revisions are never overwritten.
- **Issued revisions** (status Issued/Approved) are `locked`. To change one, you create a new revision.
- **Save As:**
  - *as new revision* of the same project, or
  - *as new project* (new Project ID; the source is recorded).
- **Reopen:** any earlier revision can be opened read-only, or restored as the working copy (this does not delete the later revisions).

## 4. Machinery-room ventilation: common standard and project override

- A **template** (`templates.kind = machineryVent`) holds the common design basis: code edition, detector setpoints, supply-air basis, typical motors and so on. It has an integer `version`.
- A project that uses a template stores:
  - `templateId`;
  - `templateVersion`;
  - a **snapshot** of the template values at the time it was linked;
  - `overrides{}` (only the fields the engineer changed).
- **Effective value** = override if present, otherwise the snapshot. The UI shows three columns: **Standard value · Project value · Override status**.
- **When the template changes:** projects are **not changed**. Each linked project shows "Standard updated (v3 → v4), review changes". The engineer sees a field-by-field diff and accepts the update or keeps the old values. Overrides are never replaced, and results change only after the engineer accepts.

## 5. Migration (v1 → v2)

**Sources:**
1. the current browser project in `localStorage['coldload-pro-project-v1']`;
2. any `.coldload.json` file you open later. It is migrated on import, not overwritten.

**Steps (first start of v2):**
1. Read the v1 payload and run the **structural validation** (`validateV1`: required blocks, list types, version). The file is data only and is never executed. If validation fails, the app does not migrate. It shows the reasons and keeps v1 untouched.
2. Write a **safety backup** of the v1 payload to `safetyBackups` (reason: pre-migration).
3. Run `migrateV1Project`:
   - `info.client` → customer (found by name case-insensitively, or created);
   - `info.name` → project name;
   - `info.location` → site;
   - `info.engineer` → Prepared by;
   - `info.date` → created date;
   - `info.rev` → recorded as the legacy revision label;
   - the **entire v1 payload becomes revision "00" `data` and the working copy, unchanged**.
4. Record `meta.migrations += {from:1, to:2, at, source, projectId}`.
5. Show a migration summary: project, rooms, total kW **before** and **after** (must be identical).

**Company record:** a neutral "My Company" placeholder is created for you to edit in Settings. No company name is hard-coded.

**Evidence** (`tests/migrate.test.js`, all passing):
- all 13 regression projects migrate with a **byte-identical payload and identical capacities**;
- the rollback export equals the original;
- customer find-or-create works;
- 200 migrations give 200 unique IDs;
- malformed files are rejected with readable reasons;
- script-like text stays inert data.

## 6. Backward compatibility

- The engine continues to read the **v1 dataset format** (`dataVersion 1`). New optional engine inputs (c_p/latent overrides, incoming-product respiration, E5/E7 method options) are **additive**. A missing field means current behaviour, and the dataset version becomes `1.1`.
- v2 can **export any revision as a v1 `.coldload.json`**, openable by the current app.
- The current v1 app is kept as `dist/legacy/ColdLoadPro-v1.html`.

## 7. Rollback strategy

| Situation | Rollback |
|---|---|
| Migration fails partway | IndexedDB writes happen in **one transaction**, so nothing is committed; v1 stays active |
| You want the old app back | The v1 localStorage key is **never deleted**; open `dist/legacy/ColdLoadPro-v1.html` and it loads exactly as before |
| A project goes wrong after migration | Restore any revision, or restore from the pre-migration safety backup |
| Corrupt import or restore file | Validation (format, version, SHA-256 checksum, record schema) runs before anything is written |

## 8. Backup and project package format

```jsonc
{
  "format": "coldload-backup",        // or "coldload-project" for one project package
  "formatVersion": 1,
  "appVersion": "2.0.0", "engineVersion": "1.0.0", "schemaVersion": 2,
  "createdAt": "…", "createdBy": "…",
  "scope": "full" | "selected" | "project",
  "counts": { "projects": 12, "revisions": 40, "customers": 5, "attachments": 3 },
  "sha256": "…",                        // of the canonical payload
  "payload": { "companies": [], "customers": [], "projects": [], "revisions": [],
               "templates": [], "climate": [], "references": [], "attachments": [], "settings": [] }
}
```

- User accounts and password hashes are **excluded** from backups by default.
- **Restore** shows the date, app version, project count and conflicts (existing IDs). You then choose:
  - *Merge*: skip existing, or keep both as copies;
  - *Replace all*: requires typing a confirmation word.
- An automatic safety backup is always written first.

## 9. City database (Region → Country → State → City)

- Regions exactly as in Koldpro: Africa · Asia · Europe · Mid-East · North & Central America · South America · South West Pacific.
- The seed list has names, coordinates and elevation, with status `seed`. **Design temperatures are left blank.** You enter them once from your ASHRAE data; after that they are marked `user-entered` and reused by every project.
- Selecting a city fills the project's outdoor design values. Editing those values on a project is recorded as an override, which the report shows.

## 10. Local security model

- Passwords: PBKDF2-SHA256 (WebCrypto), 310 000 iterations, 16-byte random salt. **Plain-text passwords are never stored.**
- The first run creates the admin account through a setup screen; there is no default password. Sessions have an expiry; "Remember me" uses a 14-day session token.
- This controls access to the app on this PC. **It is not data encryption.** Anyone with access to the Windows account and the browser developer tools can read the stored data. The app states this in Settings → Security.
