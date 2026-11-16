# JCA IREF – Phase 1 Forensic Audit (Checkpoint 1)
Date: 2026-11-16 · Mode: READ-ONLY (no write calls were made to Notion)
Source: "OPS-Master Database JCA IREF AMS CR Business" (page id 2f508fd9-f0d5-810a-bbb5-e3b2e411be74, locked, shared)

## 1. Distinct data sources (5 real tables + 1 vacancy table)
| # | Data source | Rows | Props | Notes |
|---|---|---|---|---|
| 1 | AMS (jobs) `2f508fd9-…-81e4` | 830 (created 2026-01-27 → 2026-11-12) | ~78 | Shown on the page through 6 linked views: JCA IREF Business, Daily Tracking-Follow Up, Site Execution Progress, Jobs Dashboard For My Team, AMS, Pull Through 2025. 18 formulas, 71 distinct customers, 10 job types, 229 rows with empty Job No |
| 2 | Head Count Manpower `2f508fd9-…-81a4` | 75 (34 On Duty, 11 Resigned, 5 Terminated, 7 Transferred, 18 blank status) | 17 | Contains salary, Iqama no., nationality → HR-confidential |
| 3 | Monthly Manhours `2f508fd9-…-81d9` | 185 | 11 | Only true relation in the workspace: Name → Head Count; rollups SSD#, Customer-Project |
| 4 | Customers Dashboard `30308fd9-…-80ea` | 68 | 8 | Contacts/addresses; "Customer Name" is a select (68 options), not a relation |
| 5 | OMC Projects Board `2fb08fd9-…-805e` | 9 | 6 | Contract value, manpower obligations, 2 formulas; 5 views (4 donut charts) |
| 6 | IREF Hiring Tracker `2f908fd9-…-808b` | 140 | 18 | Nested under Hiring@KSA > Master Database; 1 template |
| 7 | Empty Vacancies `40b08fd9-…-804d` | not counted yet | 14 | Nested under Hiring > MOM With HR > MOM Tracker |

Other top-level private pages (not yet audited): Project Builder from Business Plan, Refrigeration Document Center, Customer & Project Document Center, Meeting.

## 2. Key structural findings
1. **One mega-table.** Jobs, procurement, finance, ops follow-up and PT (pull-through) all live in AMS. Procurement is embedded as per-vendor columns (Danfoss PR#/Subject, BAC PR#/subject, Hermetic, WITT, Alfa Luve, Dubai, JCI STO#, Local/Foreign orders, Sub-contractor PO). No PR/PO/GRN/GI/POD tables.
2. **Almost no relations.** Only Manhours→Head Count. Job No, Customer Name, PT ID, PR#s are *select* properties (597 / 79 / 85 options), so nothing is traceable by relation and typos create duplicate "masters".
3. **Duplicate customer masters:** Customer Name select in AMS (79 options) vs Customers Dashboard (68 options) vs "Customer-Project Name" select in Head Count.
4. **Missing identifiers:** 229 of 830 jobs have no Job No. Manhours "Job #" includes placeholders ("No Active Job#", "xxxxxxxxxxxxxxxxxxx").
5. **No source data exists for:** equipment/asset register, plants, contracts register (only OMC Board totals + Contracts End Date in AMS), inventory/warehouse, suppliers, invoices/collections beyond invoice-due-date fields, HSE, document control, maintenance strategy/MTBF/MTTR. These modules cannot be populated without fabricating data.
6. Dirty options: Head Count Grades/Positions contain "0"; Hiring "Interviewers" is a multi-select with combined values ("El Sharnobi,Hamouda…"); SSD# is a select with 58 options.
7. Sensitive data: salary package, Iqama numbers (Head Count) → needs restricted placement in the new design.

## 3. Not yet verified (will be done before migration sign-off)
- Formula source code (18 in AMS, 2 in OMC, 4 in Manhours/Head Count/Hiring) – only property names read.
- Buttons/automations, page permissions/sharing, row-level page bodies and attachments (Job Files, Recommendation File, Applicant Files).
- Per-view filters/sorts for the 6 AMS views (partly read).
- Empty Vacancies row count; the 4 other top-level pages.

## 4. Migration feasibility (tool capabilities)
- Notion MCP cannot create a *new Notion workspace* or teamspace. Closest safe equivalent: a new separate top-level page "JCA IREF | ENTERPRISE OPERATIONS & BUSINESS MANAGEMENT" in the same workspace (private by default). Real workspace-level separation must be done by the user in Notion settings.
- Safest copy path: `notion-duplicate-page` on the source page (read-only on the source) → then verify that relations/rollups/formulas/views were remapped to the *copies*, not the originals. If remap fails, fall back to create-database + batched row inserts (830+185+140+75+68+9 rows; files cannot be assumed to copy).
- Risk to check first: linked views must point at duplicated data sources, never the originals.

## 5. Proposed implementation order
1. Duplicate source → "staging copy" under new root; validate counts/schema/relations vs this inventory.
2. Add new modules as *new* databases only where source data exists (Customers, Jobs, Manpower, Hiring) and normalize: Customers master + relation from Jobs; Job register relation from Manhours; PR/PO register extracted from AMS vendor columns (copy, not move).
3. Executive homepage with KPI cards only for KPIs computable from real data (jobs value, GP%, open/overdue follow-ups, manpower, hiring); others stay "no data source" rather than invented.
4. Reconciliation report, governance matrix, KPI dictionary.
