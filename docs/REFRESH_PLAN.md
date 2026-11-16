# JCA IREF new workspace: refresh plan and go-live gates

Owner decision (2026-11-16): refresh the copy once, before anyone relies on it. The original stays untouched and is the system of record until cut-over.

The same plan lives in the workspace on the page "Refresh Plan and Go-Live Gates".

## Why
The copy is a snapshot taken 2026-11-16 around 18:41 UTC. The original is live. One job (Gulf New Condenser, CR-REF00000154) was already closed in the original after the snapshot. Notion cannot sync two workspaces, so a refresh is a controlled rebuild plus verification.

## Go-live gates (all before the refresh)
1. HR access restricted on Head Count Manpower and the Hiring databases.
2. Owner spot-check of formulas on 10 jobs (Est.GP%, Job Progress %, invoice and VAT values) in copy vs original.
3. Templates, view filters and sorts reviewed by the owner.
4. Unaudited pages (Project Builder, Refrigeration Document Center, Customer and Project Document Center, Meeting, Hiring/MOM pages): decided, left out for now.
5. Cut-over decision (approved: one clean cut-over, original set read-only afterwards, never deleted).
6. A named owner per database.

## Runbook
0. Baseline from the original: row counts of six databases, job status breakdown, totals of Job Net Value / estimated cost / actual costs / manhours, number of jobs with files.
1. Duplicate the original root page into a new page. Keep the current copy as an archive until sign-off. Never edit the original.
2. Verify the duplicate before touching it: row counts, property-by-property schema comparison, totals, filled-field counts, status breakdown, file counts, relation targets, data source of each linked view. Any unexplained difference stops the refresh.
3. Re-apply additions in order:
   1. rename the page;
   2. add the Customer Link relation (two-way, reverse property "Jobs" on Customers Dashboard);
   3. add the 11 name-only customer records (see customer_mapping.json);
   4. link jobs to customers from the job's Customer Name using customer_mapping.json (page IDs change in a new duplicate, so never reuse old IDs); about 69 updates; re-read all jobs afterwards;
   5. re-create the six job views and the five START HERE live views;
   6. move the documentation pages from the archive into the new root.
4. Final verification: repeat step 2 checks; expect 802 linked / 28 unlinked / 830 total if no jobs were added; every difference from the original explained.
5. Sign-off by the owner; update the reconciliation report with date and counts; keep the old copy at least one month.

## Rules
- Jobs added or closed in the original after a refresh are not in the copy until the next refresh.
- If fewer than about 20 jobs differ, a patch is acceptable after a row-level comparison by Job No; otherwise a full refresh.
- Never move or edit anything in the original.

## Decisions recorded (owner, 2026-11-16)
1. Cut-over approach: one clean cut-over, approved. Refresh, freeze edits in the original during verification, switch the team, then make the original read-only (never delete it).
2. HR access and formula spot-check: acknowledged that these cannot be done with the available tools; a person must do them in Notion. Still needed: the names of the people who will do them.
3. Cleaning the original's data before the refresh: approved in principle. The assistant does not edit the original workspace, so any cleanup is done by the owner's team in the original. The owner already ruled that ASYS IR AM and All Sites stay unlinked and the 8 jobs with no customer stay as NA, so no cleanup is required. If the team still tidies them, do it before Step 0 (baseline).
4. Cut-over date: the owner will test the new workspace first, then set the date. No date until the owner's own testing is done.
5. Unaudited pages: left out for now. They stay in the original only. They can be added later; if so, they are audited first.

## Still open
1. Cut-over date, set by the owner after testing.
2. Names for restricting HR access, the formula spot-check, and an owner for each database.

## Status
The refresh has not been run. It runs after the gates above are true.
