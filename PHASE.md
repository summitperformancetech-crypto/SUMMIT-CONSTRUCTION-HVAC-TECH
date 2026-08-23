# CURRENT PROJECT PHASE

## Project
Summit Construction Technology & Restoration Group — Summit HVAC platform

## Current Phase
Phase number: 4 of 6 (of the completion plan started 2026-08-22)
Phase name: Complete the Summit Report Standard

## Phase Objective
Close the gaps `lib/reportHtmlV2.ts`'s own header comments and `lib/reportGate.ts`'s comments already named against `REFERENCE-DOCS/SUMMIT-REPORT-STANDARD.md`: AED Assessment, full 9-category Building Analysis charts, floor-plan compositing, embedded report fonts, and per-system (not project-wide) equipment selection.

## Status
COMPLETED WITH FOLLOW-UP REQUIRED — 4 of 7 phase items done and verified; 2 explicitly deferred/blocked by user decision (not oversights); 1 held pending another deferred item.

## Overall V1 Completion
Estimated percentage: ~70%
Confidence: Medium — the calculation engines (Manual J/D/S/N/Industrial) and drawing-extraction pipeline are mature and were already production-grade before this phase; report generation is now substantially complete; deployment-readiness (Phase 5) and role-based UI completeness beyond Field Tech are not yet done.

## What Was Accomplished

This phase completion plan spans Phases 0–4 of a 6-phase plan, all done in one continuous session on 2026-08-22/23:

**Phase 0 — Foundation Sync:** The base schema (`organizations`, `profiles`, `get_my_org_id()`, `get_my_role()`) existed live in Supabase but was never captured in a tracked migration — this was very likely the "lost files" the user suspected at the start of the session. Reconstructed it via live-DB introspection into `supabase/migrations/20260809180000_base_schema_organizations_profiles.sql`, reconciled migration tracking for all 31 migrations, updated `CLAUDE.md`/`README.md` off stale "early setup" language, added `supabase/config.toml`.

**Phase 1 — Critical Correctness Fix:** `lib/reportData.ts`'s climate-zone lookup filtered by `state` only, returning an arbitrary county's design temps for any state with more than one county row (confirmed live: a Harris County, TX project got Anderson County's numbers). Fixed to match the working pattern already used on the project page. Deleted a fabricated `FIXTURE-PLACEHOLDER` equipment row from the live, shared `equipment_catalog` table.

**Phase 2 — Security Audit:** Audited RLS policies on all 23 public tables. No leaks found beyond the already-fixed `duct_runs` incident from prior work.

**Phase 3 — Role Model:** Enforced "Field Tech = data entry only" (no equipment selection, no report finalization) at both the RLS/trigger layer and the UI layer.

**Phase 4 — Report Standard (this phase, 4/7 items):**
- 9-category Building Analysis charts (walls/glazing/doors/ceilings/floors/infiltration/ducts/ventilation/internal gains), splitting `lib/manualJ.ts`'s combined envelope accumulator.
- Floor-plan compositing: real uploaded PDF page rendered via headless Chromium + Summit compass overlay (`lib/floorPlanRender.ts`), with a human-driven "which page is the floor plan" control. Does not crop out third-party title blocks — a documented simplification.
- Embedded real IBM Plex fonts (base64, `lib/fonts/`) — found and fixed a real production-build failure this introduced (see Known Issues → resolved).
- Per-system equipment selection: moved from `projects.selected_equipment_id` (one selection for the whole project) to `zones.selected_equipment_id` (one per AHU/zone), per `SUMMIT-REPORT-STANDARD.md` §5.3.

## Files Created
- `supabase/migrations/20260809180000_base_schema_organizations_profiles.sql`
- `supabase/migrations/20260822190000_restrict_field_tech_equipment_and_reports.sql`
- `supabase/migrations/20260822200000_add_drawing_floor_plan_page.sql`
- `supabase/migrations/20260822210000_per_zone_equipment_selection.sql`
- `lib/floorPlanRender.ts`, `lib/reportFonts.ts`, `lib/fonts/*.woff2` + `LICENSE-IBM-PLEX.txt`
- `lib/__tests__/reportData.test.mts`, `lib/__tests__/manualJ.test.mts`
- `PHASE.md` (this file)

## Files Modified
Core: `lib/manualJ.ts`, `lib/reportData.ts`, `lib/reportGate.ts`, `lib/reportHtmlV2.ts`, `lib/reportTemplates.ts`, `lib/reportCharts.ts`, `lib/drawingExtraction.ts`. UI: `app/dashboard/[id]/page.tsx`, `components/manual-j-workflow.tsx`, `components/project-workspace.tsx`, `components/equipment-selection-section.tsx`, `components/generate-reports-button.tsx`, `components/drawings-section.tsx`. Docs: `CLAUDE.md`, `README.md`, `REFERENCE-DOCS/SUMMIT-REPORT-STANDARD.md`. Full detail in git log (14 commits, `c00f2b1` through `1b30f6c`).

## Files Removed
None (one live DB row deleted — `FIXTURE-PLACEHOLDER` equipment catalog entry and its 16 performance points — not a file).

## Systems / Features Implemented
- County-scoped climate-zone resolution in report generation (was state-only).
- Field Tech role enforcement (RLS + trigger + UI).
- 9-category Manual J load component breakdown.
- Floor-plan-in-report compositing pipeline (PDF page → PNG via Chromium, no new native-binding deps).
- Base64-embedded report fonts.
- Per-zone equipment selection (schema + full UI/report-renderer plumbing).

## Bugs Fixed
- Climate-zone county bug (Phase 1, affected every generated report).
- `duct_runs`-style RLS leak: audited, confirmed not repeated elsewhere.
- Production build failure from font-embedding module reading files at build-analysis time instead of request time (found via `npm run build`, fixed same session — see Known Issues, now resolved).
- 6 pre-existing `@typescript-eslint/no-explicit-any` lint errors in `lib/__tests__/reportValidation.test.mts`, fixed while doing this phase's closeout (project now lints clean, 0 errors).

## Architecture Decisions
- **AED Assessment deferred.** A methodologically real version needs a from-scratch solar-position/clear-sky-irradiance sub-engine (public-domain astronomy) plus project latitude — not a reuse of existing NOAA hourly-temperature data, which can't detect an orientation-driven excursion at all. User decision: defer as its own focused effort rather than ship a check that would trivially always pass.
- **Floor-plan title-block cropping deferred.** Full page renders as uploaded; cropping needs either a human crop-selection UI or automated detection. User decision: ship the simpler version now.
- **Canonical reference file blocked.** The report gate correctly requires real equipment selected for both Vivian Street AHU zones before generating anything; the reference PDF only has nameplate specs, not the OEM extended performance data Manual S needs. User decision: leave blocked until real performance data is sourced, rather than recreate a fabricated placeholder.
- **Deprecating `internal`/`client` report types is on hold** until AED ships (removing the fallback formats while Summit Standard still has an acknowledged gap would leave no complete option).
- **Font files are vendored into `lib/fonts/`**, not read from `node_modules` at runtime, and font loading is lazy/memoized (not module-top-level) — required to survive Next.js's build-time module evaluation.
- **This documentation protocol itself** (`PHASE.md` + this `CLAUDE.md` section) — established this session per explicit user instruction, superseding no prior system (none existed).

## Integrations Added or Changed
None external. Puppeteer (already a dependency) is now also used for floor-plan PDF-page rendering, not just report-to-PDF.

## Testing Performed
```
npx tsc --noEmit     PASS (0 errors)
npm run lint          PASS (0 errors, 0 warnings)
npm test              13 PASS / 0 FAIL (3 suites: reportValidation, reportData, manualJ)
npm run build          PASS (production build succeeds)
```
Plus, for every DB-touching change this session: verified against the live Supabase database directly — RLS/trigger behavior confirmed via rolled-back test transactions (real `field_tech`/`estimator` profiles, real role impersonation via `SET LOCAL ROLE`), and `getReportData`/`getReportGenerationGateStatus` run end-to-end against the real Vivian Street fixture project.

## What Is Verified Working
- Climate-zone county resolution (regression test + manual verification).
- Field Tech restrictions on both `projects` (Phase 3) and `zones` (Phase 4) — rolled-back transaction tests.
- 9-category load split sums back to original totals (regression test).
- Floor-plan PDF-page rendering (manual verification against a real PDF, visually inspected).
- Font embedding (manual verification of build + rendered output).
- Per-zone equipment evaluation against real Vivian Street data (2 zones, evaluated independently).
- Production build succeeds end-to-end.

## What Is Not Verified
- Actual Vercel deployment (Puppeteer-on-Vercel needs `puppeteer-core` + `@sparticuz/chromium` per `app/api/reports/route.ts`'s own comment — not yet done; this was a known gap before this session, not introduced by it).
- Floor-plan compositing against a real architectural drawing with a title block (only tested against a Manual J report PDF, since that's the only PDF asset in `REFERENCE-DOCS/`).
- The canonical `summit_standard` report has not been visually reviewed end-to-end since Phase 4 started (blocked on real equipment data — see above).

## Known Issues
- `SUPABASE_DB_URL`/service-role scripts in this session used `pg` as a scratch dependency (`npm install --no-save pg`) — not a project dependency, doesn't affect the app, but worth knowing if a future session sees it appear/disappear from `node_modules`.
- The dev machine's disk was observed at 98% capacity / load average 5+ during this session (same pattern documented earlier in `SESSION-PROGRESS.md`) — caused some slow `tsc`/`eslint` runs, not a code issue, but worth a heads-up if build tools seem unusually slow.

## Deferred Work
- AED Assessment (needs solar-position engine + latitude).
- Floor-plan title-block cropping.
- Canonical reference file (needs real OEM performance data for Vivian Street).
- Deprecating `internal`/`client` report types (waits on AED).
- Phase 5 (real test framework, Vercel/Puppeteer production fix, CI) and Phase 6 (role-based knowledge-base docs) — not started.

## Open Questions
- Who will source the real Carrier extended performance data for the Vivian Street AHUs (needed to unblock the canonical reference file)?
- When AED is picked back up: is a from-scratch solar-position engine still the right call, or should real solar irradiance data be sourced instead?

## Claude Browser Input Needed
None identified for the next phase (Phase 5 is test/deployment infrastructure work, doable directly in this environment).

## Next Recommended Phase
Phase 5 — Testing & Deployment Readiness: add a real test runner (Vitest), add unit tests for the calc engines (currently zero direct coverage beyond the report-validation regression tests), fix Puppeteer for Vercel (`puppeteer-core` + `@sparticuz/chromium`), add a minimal CI workflow.

## Next Exact Action
Add Vitest, migrate the three existing `npx tsx`-run test files to run under it via `npm test`, then add direct unit tests for `lib/manualJ.ts`, `lib/manualD.ts`, `lib/manualS.ts`.

## Files Next Session Should Read First
1. `/CLAUDE.md`
2. `/PHASE.md` (this file)
3. `/SESSION-PROGRESS.md` (detailed history, if deeper context on a specific past decision is needed)
4. `/REFERENCE-DOCS/SUMMIT-REPORT-STANDARD.md`
5. `/lib/reportGate.ts`, `/lib/reportData.ts` (current report-generation state)
6. `/package.json` (current scripts/dependencies)

## Git Status
Branch: `main`
Working tree: clean as of this file's last update (see below) — will have uncommitted changes for `CLAUDE.md`/`PHASE.md` until the closeout commit lands.
Remote: `origin` → `https://github.com/summitperformancetech-crypto/SUMMIT-CONSTRUCTION-HVAC-TECH.git`, up to date.

## Last Commit
`1b30f6c` — "feat: move equipment selection from project-wide to per-zone/AHU"

## GitHub Push Status
All 14 commits from this session are pushed to `origin/main`. This closeout's own commit (this file + `CLAUDE.md`) will follow immediately.

## Updated
Date/time: 2026-08-23
