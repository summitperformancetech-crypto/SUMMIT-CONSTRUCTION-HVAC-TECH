# CURRENT PROJECT PHASE

## Project
Summit Construction Technology & Restoration Group — Summit HVAC platform

## Current Phase
Phase number: 8 — Strict in-order pipeline + full auto-propose/review (residential). Started 2026-09-01.
Phase name: Fix the order of operations. One guided stepper, every stage gated on the previous stage's exit gate, one human orientation confirmation, everything else an AI proposal the technician Accepts or Overrides, an explicit Finalize as the only snapshot-freeze path.

## Phase Objective
User halted all feature work for a forensic audit of Summit's *actual* order of operations (`PIPELINE-SEQUENCE-AUDIT.md`), which found: orientation confirmation built twice (S3 gate + S7b section), the first report of *any* type silently freezing a snapshot while only `summit_standard` was gated, `/api/reports/revise` freezing a new version with no gate, a one-shot readiness checklist that goes stale in-session, sections that don't communicate, and steps that unlock on a prerequisite being *started* rather than *complete*. User then asked for a full fix ("fix it all... DONT GIVE ME A PRODUCT WITH IT INCOMPLETE") with four decisions locked: **guided stepper**, **full auto-propose + review**, **explicit Finalize action**, **residential only**. Implementation prompt: `FIX-PIPELINE-PROMPT.md`. Canonical spec: `SUMMIT-BUILD-SEQUENCE.md`.

## Status
**Phase 8 — built this session (see SESSION-PROGRESS.md for the full detail):**

- `lib/pipeline.ts` — the one pure `computePipelineState(input): PipelineState`. 13 ordered stages, each with a named exit-gate predicate; strict-order guarantee (stage N `locked` unless every prior exit gate is `true`); `canFinalize` false while `outstandingProposals > 0`. `lib/pipelineInput.ts` (`buildPipelineInput`) assembles the bundle server-side from `getReportData` + a few extra queries so the pipeline's view never drifts from the report gate / frozen snapshot.
- `lib/aiProposals.ts` — Accept/Override on the existing `field_resolutions` table (`proposal:*` namespace); `listOutstandingProposals`.
- `lib/zoning.ts` (`proposeZoning`), `lib/pinPlacement.ts` (`proposeRoomPins`/`proposeMechanicalPins`, does **not** import `lib/pdfRoomGeometry.ts`), `lib/dehumidification.ts` (`proposeDehumidification`), `lib/extractionApply.ts` (`buildEnvelopeAndRoomsForApply`).
- Orientation dedup: `applyOrientationTransform` extracted into `lib/orientation.ts` and run automatically at the end of `applyExtractedData` (stage-6 auto-apply, no button). `components/building-orientation-section.tsx` **deleted**. `grep -rn "building_front_faces" components/` → exactly one writer: `building-orientation-gate.tsx` (stage 3).
- New routes: `app/api/projects/[id]/pipeline-state` (GET) and `app/api/projects/[id]/finalize` (POST — the only first-snapshot freeze path, runs the full gate). `app/api/reports/route.ts` no longer freezes anything → `409` until finalized. `app/api/reports/revise/route.ts` re-runs the full gate. `gate-status` route delegates to `computePipelineState`.
- Migration `20260901000000_add_pipeline_finalization.sql` — `projects.finalized_at`, `zones.equipment_selection_source`, non-destructive backfill (existing snapshotted projects stay finalized; existing equipment picks → `human_confirmed`).
- Client: `components/pipeline/` (`pipeline-provider`, `pipeline-rail`, `proposal-panel`, `finalize-panel`). `components/project-workspace.tsx` rewritten as the guided stepper (rail + one stage body at a time + Back/Next gated by the exit gate). `ManualJWorkflow` renders only the viewed stage's sections and exposes `autoApplyExtraction` / `autoProposeZoning` / `confirmAllPins` / `acceptAiEquipment` handle methods that run against its own live state. `MakeupAirSection` / `GenerateReportsButton` / `ReportSignOffSection` / `StalenessBanner` moved into the Ventilation and Finalize stages. Every stage write calls `refreshPipeline()`.

**Verification:** `npx tsc --noEmit` clean; `npm run lint` clean; `npm test` — 30 files / 428 tests green, +55 new (`pipeline`, `zoning`, `pinPlacement`, `orientationTransform`, `proposeDehumidification`); `npm run build` — see SESSION-PROGRESS. Live end-to-end run: see SESSION-PROGRESS (migration + click-through).

**Out of scope / untouched:** `lib/pdfRoomGeometry.ts` (paused vector-geometry experiment — uncommitted, not built on); commercial/industrial (`components/commercial-workflow.tsx`).

---

## Prior phase — Phase 7 (context, superseded as the live tracker)

Phase name: Close the "finish the software" gap list — role UI, AED, offline/PWA, multi-tenant, deploy.

**Items 1-3 of 5 done, verified, committed, and pushed:**

1. **Role UI (Estimator/Admin) — done.** Investigated the real architecture before building (the 3-tier role model, RLS policies, and per-role permission gating were already fully built — Estimator was already functionally complete). Real gaps closed: team management (invite/role-change/remove, admin-only, with a last-admin-lockout guard), project deletion (didn't exist for any role), a settings page with no nav link. New: `/api/team/invite`, `/dashboard/settings/team`, `/auth/set-password`, `components/team-management-section.tsx`, `components/delete-project-button.tsx`. Migration: `profiles.email`. Commit `105d5d4`.
2. **AED (Adequate Exposure Diversification) — done.** Was rendering an honest "not yet computed" placeholder since an earlier session (needs per-orientation hourly solar data the design-point calc engine doesn't model). Built real solar-position astronomy (`lib/solarPosition.ts`, NOAA Solar Calculator equations, verified against known reference facts) + a real ASHRAE Clear Sky irradiance model (`lib/solarIrradiance.ts`, honest about its own precision boundary) + the actual 30%-excess diversification test (`lib/aedAssessment.ts`). Wired into `getReportData`/`reportHtmlV2.ts` — real per-zone pass/fail and peak-excess-by-orientation when a real geocode (`resolveLatLong`, same free Census geocoder `resolveCounty` already used) and a real `project.window_shgc` both exist; explicit "not assessed" otherwise, never a fabricated number. Live-verified against KHAWAJA MAMOON's real window data: physically sensible result (north beat west on total Btuh despite far lower irradiance per sqft, because this house has far more north-facing glass area — a real finding, not an artifact). 25 new tests. Commit `c856655`.
3. **PWA/offline — infrastructure done, wired into ONE real mutation path, not full app coverage yet (honest gap, see below).** Hand-rolled service worker (`public/sw.js` — next-pwa/serwist have known Turbopack gaps on Next 16) for runtime page/asset caching + a real manifest with real icons generated from the actual Summit logo. The actual substance: `lib/offlineQueue.ts` (IndexedDB write queue via `idb`), `lib/offlineMutation.ts` (`mutateOrQueue` — distinguishes genuine network failure from a real server-side rejection, only queues the former), `lib/offlineSync.ts` (ordered replay on reconnect, per-mutation success/failure), `lib/useOfflineSync.ts` + `components/offline-status-banner.tsx` (online/offline UI, mounted in the dashboard layout). Wired into `manual-j-workflow.tsx`'s `handleUpdateRoom` (real field-data-entry path) as the proof case. 16 new tests against real IndexedDB behavior (`fake-indexeddb`). Commit `da94548`.

**Items 4-5 not started — item 4 is genuinely blocked on business input, item 5 is explicitly deferred by the user until local build-out is done:**

4. **Multi-tenant self-serve signup + billing — blocked on real business decisions.** The data model already supports multi-tenancy (org-scoped RLS, confirmed this session while building team management). What's missing is a public signup flow + a payment provider + real pricing/plan/trial decisions — see Open Questions.
5. **Deploy to Vercel — explicitly deferred by the user** ("finish building the software locally first, then deploy, as you were told") until items 1-4 are further along.

**Verification standard held throughout**: every item above got `tsc --noEmit` clean, full test suite clean (0 regressions, real growth: 96 → 121 → 137 tests across the three commits), lint clean, and a real production build, not just "the new tests pass." AED and the offline queue additionally got live/real-data verification beyond static checks (AED against KHAWAJA MAMOON's real geocode+window data; offline queue against real IndexedDB via `fake-indexeddb`, not a mocked-out version of the module itself).

## Overall V1 Completion
Estimated percentage: ~80% (up from ~75% at the last checkpoint — three real, shipped capability gaps closed this session, not just confidence-raising validation work).
Confidence: Medium-High. Calc engines + AED + drawing extraction + report generation + role permissions are mature and real-data-verified. Offline capability is real but partial (one mutation path, not the whole app). Multi-tenant packaging and actual deployment are the two largest remaining gaps toward a genuinely "finished," sellable product.

## What Was Accomplished
See Status above for the full detail per item — not duplicated here. In brief: `lib/solarPosition.ts`, `lib/solarIrradiance.ts`, `lib/aedAssessment.ts` (AED); `lib/offlineQueue.ts`, `lib/offlineMutation.ts`, `lib/offlineSync.ts`, `lib/useOfflineSync.ts`, `public/sw.js`, `public/manifest.json` (offline/PWA); `app/api/team/invite/route.ts`, `app/dashboard/settings/team/`, `app/auth/set-password/`, `components/team-management-section.tsx`, `components/delete-project-button.tsx` (roles). New devDependencies: `pg`/`@types/pg` (migration scripts), `idb` (offline queue), `fake-indexeddb` (test-only).

## Files Created
`lib/solarPosition.ts`, `lib/solarIrradiance.ts`, `lib/aedAssessment.ts` + their 3 test files; `lib/offlineQueue.ts`, `lib/offlineMutation.ts`, `lib/offlineSync.ts`, `lib/useOfflineSync.ts` + their 3 test files; `public/sw.js`, `public/manifest.json`, `public/icon-192.png`, `public/icon-512.png`; `components/service-worker-registration.tsx`, `components/offline-status-banner.tsx`, `components/team-management-section.tsx`, `components/delete-project-button.tsx`; `app/api/team/invite/route.ts`, `app/dashboard/settings/team/page.tsx`, `app/auth/set-password/page.tsx`; `supabase/migrations/20260824190000_add_profiles_email.sql`.

## Files Modified
`lib/countyLookup.ts` (`resolveLatLong` added), `lib/reportData.ts` (AED wiring), `lib/reportHtmlV2.ts` (real AED rendering), `lib/__tests__/reportGate.test.mts` + `reportValidation.test.mts` (new required `aed` field on the `ReportData` fixture), `app/dashboard/layout.tsx` (Team/Branding nav links, offline banner), `app/dashboard/[id]/page.tsx` (delete-project wiring), `app/layout.tsx` (manifest, service worker registration), `components/manual-j-workflow.tsx` (offline-aware `handleUpdateRoom`), `package.json`/`package-lock.json`.

## Files Removed
None.

## Systems / Features Implemented
See Status above — this session's three shipped items each get their full technical detail there, not duplicated.

## Bugs Fixed
- **This session's own test infrastructure**: `lib/offlineQueue.ts`'s module-level cached IndexedDB connection caused `beforeEach`'s `indexedDB.deleteDatabase` to hang/timeout across test cases (a real, diagnosed bug in the test setup, not the production module) — fixed by adding a real `clearAllMutations()` export (also a legitimate production feature — a tech discarding queued offline edits) and using it instead of tearing down the database between tests.
- **AED's `window_shgc` fallback**: initially defaulted a missing SHGC to a plausible-looking 0.3 rather than treating it as "can't compute this" — caught and fixed before shipping, since it contradicted `computeManualJ`'s own established "null means assume zero, never guess" convention for the same field.
- **`lib/reportHtmlV2.ts`'s orphaned branding settings page**: had no nav link anywhere in the app (found while adding the Team nav link) — fixed alongside the role-UI work.

## Architecture Decisions
- **Hand-rolled service worker, not next-pwa/serwist** — documented Turbopack compatibility gaps in the community plugins as of Next.js 16 (this app's active bundler); a plain, transparent, directly-verifiable static file was judged more reliable than an opaque plugin with uncertain support.
- **AED uses a real analytical clear-sky model, not ACCA's proprietary SHGF tables or a live external weather API** — direct user choice among three presented options, avoiding both an unverifiable-from-memory copy of copyrighted tables and a new external API-key dependency this app doesn't have.
- **Offline queue uses IndexedDB via `idb`, not localStorage** — mutations can include structured payloads and need indexed lookup/ordering; `idb` is a ~1KB promise wrapper around the browser-native API, not a heavier state-management dependency.
- **`mutateOrQueue` checks `navigator.onLine` AND catches genuine fetch-level `TypeError`s** — a real server-side rejection (RLS violation, constraint failure) must never be silently queued for an identical, doomed retry; only a genuine connectivity failure queues.

## Integrations Added or Changed
None external in the new-vendor sense. `idb` and `fake-indexeddb` are new npm dependencies (client-side library and a test-only polyfill respectively), not new services.

## Testing Performed
```
npx tsc --noEmit     PASS (0 errors) — re-run after every commit this session
npm run lint          PASS (0 errors, 0 warnings) — re-run after every commit this session
npm test               137 PASS / 0 FAIL (16 suites; grew from 96 at session start:
                        +25 AED/solar tests, +16 offline-infrastructure tests)
npm run build           PASS (production build clean, all 3 commits)
```
Beyond static checks: AED live-verified against KHAWAJA MAMOON's real geocoded address + real per-room window data (physically sensible, non-fabricated result). Offline queue tested against real IndexedDB behavior via `fake-indexeddb`, not a mocked-out queue module.

## What Is Verified Working
Everything listed in Status above, to the standard described in Testing Performed. All three of this session's shipped items are additive - re-ran the full existing suite after each and confirmed zero regressions, not just that the new tests pass.

## What Is Not Verified
- **Actual Vercel deployment** — still never exercised (see PHASE.md history — this has been an open item across multiple sessions). Explicitly deferred by the user until local build-out is further along.
- **Offline write queue beyond the one proven path** — `mutateOrQueue`/the queue/sync engine are real and tested, but only `manual-j-workflow.tsx`'s room updates actually use them. Every other mutation site in the app (ducts, drawings, equipment selection, zones, commercial workflow, building orientation, team management, project deletion) still writes directly and has NOT been touched — a real, disclosed gap, not silently claimed as covered.
- **Service worker's real-world offline behavior** — logically sound (stale-while-revalidate, never touches Supabase calls or non-GET requests) but not manually exercised in an actual browser with devtools' offline throttling yet.
- Everything already carried forward as unverified from earlier phases (canonical `summit_standard` report's full visual review, floor-plan title-block cropping).

## Known Issues
- Same disk-space/load-average slowness on this dev machine as documented in prior sessions — `tsc`/`lint`/`test`/`build` all took meaningfully longer than their "warm" times at points this session (one `npm test` run hit 222s instead of the usual ~1-2s; lint hit its own documented up-to-30-minute slow-disk pattern twice). Confirmed each time via `ps` (near-zero accrued CPU time despite long wall-clock elapsed) that this is disk I/O contention, not a real hang — same diagnosis as prior sessions, not a new issue.
- The `.next/types` staleness issue (`rm -rf .next` without a following `npx next typegen` breaks `tsc --noEmit` with a `LayoutProps`-not-found error) recurred once this session — same known fix, not a regression.

## Deferred Work
- **Extend the offline write queue to every other mutation site** — the infrastructure and pattern are real and tested; applying `mutateOrQueue` to ducts/drawings/equipment/zones/commercial/orientation/team/delete is real, separate follow-up work.
- **Multi-tenant self-serve signup + billing** — blocked on business input (pricing, trial length, payment provider). See Open Questions.
- **Vercel deployment** — deferred by direct user instruction until items above are further along.
- Everything carried forward from Phase 6's own Deferred Work that's still genuinely open: AED's own further refinement if a real TMY/NSRDB irradiance data source is ever wanted for higher absolute precision (current implementation is a real, disclosed representative-coefficient clear-sky model, not month-by-month); floor-plan title-block cropping; the canonical `summit_standard` report's full end-to-end visual review.

## Open Questions
- **Multi-tenant billing — needs direct user input before any real code can be written**: which payment provider (Stripe is the natural default for a Next.js app but not assumed), what plan tiers/pricing, trial length, whether org creation should be fully self-serve or still involve a manual approval step for the first version.
- Whether/when to extend the offline queue beyond the one proven mutation path — same pattern, just needs the same treatment applied file by file; not blocked, just not yet done.

## Claude Browser Input Needed
None.

## Next Recommended Phase
Multi-tenant billing/signup is the next item in the user's own stated order (item 4 of 5), but is genuinely blocked pending the business decisions in Open Questions above. Two honest paths forward: (a) get those decisions and build real signup+billing, or (b) skip ahead to extending offline-queue coverage to more mutation sites (unblocked, well-scoped, incremental) while waiting on the billing decisions.

## Next Exact Action
Report this checkpoint to the user (3 of 5 items shipped and verified this session), surface the specific business-decision blocker on item 4, and offer to start the local dev server so they can test a new project end-to-end right now, per their own stated goal ("I want to be able to see for myself that the software is working properly").

## Files Next Session Should Read First
1. `/CLAUDE.md`
2. `/PHASE.md` (this file)
3. `/SESSION-PROGRESS.md` (this session's detailed entry, appended after the seventeenth-entry closeout)
4. `/lib/aedAssessment.ts`, `/lib/offlineMutation.ts`, `/components/team-management-section.tsx` — the three new capabilities' real entry points

## Git Status
Branch: `main`. Working tree: will be clean once this closeout commit lands. Remote: `origin`, in sync (0 ahead/0 behind after each of this session's 3 pushes).

## Last Commit
`da94548` — "feat: add PWA shell + real offline write queue with sync", on top of `c856655` (AED) and `105d5d4` (role UI/team management). All pushed to `origin/main` directly.

## GitHub Push Status
All of this session's code work is on `origin/main`, pushed and verified after each of the 3 commits.

## Updated
Date/time: 2026-08-24 (Phase 7, first session — role UI, AED, and offline/PWA infrastructure shipped and verified; multi-tenant billing blocked on business input; deploy explicitly deferred by the user)

---

## Addendum (2026-08-25): Equipment catalog expansion + Preferred Manufacturer

Separate workstream from the Phase 7 gap list above, same phase window. User reported the Equipment Preferences page showing only 4 units across 2 manufacturers; asked for investigation first (see `EQUIPMENT-CATALOG-INVESTIGATION.md`), then real Amana data plus a full "Preferred Manufacturer" feature, "done tonight."

**Investigation (no code changed)**: confirmed via a service-role query (bypasses RLS) that `equipment_catalog` genuinely had only 4 rows — a seeding gap, not a filtering/RLS/org-scoping bug. All 3 read sites (Equipment Preferences page, Manual S data load, report generation) run identical unfiltered queries against the same global (non-org-scoped) table. Zero Amana rows existed; user was told explicitly and asked whether to source real data or proceed manufacturer-agnostic.

**User's answer**: source Amana for real ("whatever you need to get the OEM data sheets"), build the rest of the feature generically for however many manufacturers have real data - not fabricate coverage for all "top 10" manufacturers to hit a deadline. That tradeoff was stated back to the user before starting.

**Shipped, real, verified:**
1. **Amana added to the catalog with real OEM data** — sourced Amana's own published SS-ASZ16 Expanded Cooling/Heating Data PDF (`documents.alpinehomeair.com`), downloaded, parsed programmatically (PyMuPDF text extraction + a structural parser matching the document's own repeating outdoor-temp × entering-wetbulb grid — not hand-transcribed, to avoid transcription error at this volume), spot-checked against the raw extracted text. 4 models across the full ASZ16 tonnage range (2/3/4/5-ton, single/two-stage), 254 real performance points. Migration: `20260825050000_add_amana_equipment_catalog.sql`. Honestly disclosed data-quality note in the migration itself: the document's own expanded-data tables are published at a specific test airflow that runs below the AHRI-certified airflow shown for a newer coil pairing elsewhere in the same document — real data, just not the identical airflow as that one headline AHRI number.
2. **NOT sourced this session** (disclosed, not silently skipped): the other ~9 "top manufacturers" (Trane, Lennox, Rheem, Ruud, American Standard, York, Bryant, Daikin, Mitsubishi). Same sourcing/parsing/verification treatment needed per manufacturer - real, scoped follow-up work, not a batch fabrication.
3. **`projects.preferred_manufacturer`** — new nullable text column, no FK/enum (dropdown populated from `DISTINCT manufacturer` on the live catalog, never hardcoded — a new manufacturer becomes selectable the moment its catalog rows exist). Migration: `20260825060000_add_preferred_manufacturer.sql`.
4. **`lib/manualS.ts`: `selectTopEquipmentByManufacturer`** — new function, deliberately separate from the existing org-level `preferredEquipmentIds` tie-break in `rankEquipment`. Filters `rankEquipment`'s already-scored output to the preferred manufacturer's top 5; falls back to the top 3 across all manufacturers (with an explicit `usedFallback` flag the UI must surface, never silently substitute) when the preferred manufacturer has zero compatible matches. Never touches `compatibilityScore` itself. 4 new unit tests, plus a live verification script run against the real catalog + Schneider project (not just fixtures) confirming manufacturer filtering, cross-manufacturer fallback, and the no-preference baseline all produce correct results with real Manual S evaluations.
5. **UI**: `components/preferred-manufacturer-section.tsx` (new project-level dropdown, modeled on the existing `BuildingOrientationSection` pattern), wired through `ManualJWorkflow` → each zone's `EquipmentSelectionSection` (which now shows the manufacturer-filtered top 5, a clear fallback banner when triggered, and an updated "See all" / "show top N" toggle that accounts for the manufacturer-narrowed count). `components/equipment-preferences-settings.tsx` got a manufacturer filter dropdown, also populated dynamically from the loaded rows, no hardcoding.

**Verification**: `tsc --noEmit` clean, full test suite 141/141 passing (0 regressions, +4 from this session), production build clean (`next build`, Turbopack). `eslint` CLI hung in this environment both times it was invoked (near-zero accrued CPU over 15-20+ min wall-clock each time, confirmed via `ps` - matches this session's already-documented disk/load slowness pattern, not a code issue) - not completed, disclosed rather than claimed. Live-tested against the real Schneider project (`94749d9f-ecc1-4bb8-b38f-d927cb150b90`): set `preferred_manufacturer` to Amana, ran the real selection logic against the real catalog at two different load levels, confirmed correct manufacturer-filtered results, correct fallback when a manufacturer not in the catalog (Trane) was requested, and correct no-preference baseline — then reset the test value back to null afterward (was verification-only, not a change the user asked to persist).

---

## Addendum (2026-08-25, later same day): System Configuration + Manual D ASP/SAT calculator + auto duct-routing pins

Separate workstream, same phase window. Three sequential user requests, each investigated before building:

**1. System Configuration (single-system-zoned vs. independent-per-zone)**: investigated a consultant-relayed question about Zone 2 showing zero compatible equipment (confirmed real - genuinely too small for every catalog unit, not a bug) and the balance-point/compatibility-score formulas (confirmed correct, one disclosed simplification in `computeBalancePointF`'s flat-threshold vs. a true sloped heat-loss line). User chose "single system zoned with dampers" for Schneider plus a general reusable toggle for future projects. Built `hvac_system_configuration` (`projects` column), `components/system-configuration-section.tsx`, generalized `EquipmentSelectionSection` (`zoneId` → `zoneIds: string[]`), matching combined-load branch in both the live UI and `lib/reportData.ts`. Verified live: Zone 1 and Zone 2 now show the identical fitting Amana unit at 116% of the combined load, where Zone 2 alone had zero. Commit `3d54e10`.

**2. Manual D Available Static Pressure / Supply Air Temp calculator**: user asked why Duct Design was empty - confirmed a genuine data gap (0 `duct_runs` rows, both settings null), not a bug. User then pasted a reference `acca_airflow_sizing.py` and asked for the real methodology, not manual guessing. Built `computeAvailableStaticPressure`/`estimateCoolingSupplyAirTempF`/`estimateHeatingSupplyAirTempF` in `lib/manualD.ts`, a calculator panel in `duct-design-section.tsx` (TESP + 3 device losses → computed ASP), new `projects` columns for the raw inputs. Set Schneider's `supply_air_temp_f` to a real derived 55°F; left TESP/losses unset (genuinely unknown - no indoor air handler blower data in the catalog). Commit `23b4cce`.

**3. Full auto duct-routing feature (this addendum's main scope) - user's explicit instruction: "build the entire thing out to completion accurately... uninterrupted... highest level of precision."** Two-part original ask: (a) auto-compute real plenum/duct/run-length/fitting sizing, (b) a duct-routing illustration reusing the actual floor plan drawing as a report page. Investigated first (Phase 1, reported to user, signed off before building): confirmed `lib/floorPlanRender.ts` already renders a real PDF page to an image at a precise, verified scale (96px/72pt), already used for the report's Floor Plan page; confirmed `calculation_snapshots`/`/api/reports/revise` already implement real report versioning; found and disclosed a genuine gap - the Floor Plan image was fetched live on every render regardless of snapshot version, never frozen. User then said to also source (not guess) the real ACCA Manual D Appendix 3 fitting-equivalent-length data before building - see the persistent memory file `acca_manual_d_fitting_equivalent_lengths.md` for the full sourcing (downloaded and visually verified the actual ANSI/ACCA Manual D standard, not recalled from training).

**Shipped, real, verified:**
- **Extraction**: `ExtractedRoom.room_position` (AI-suggested bounding box, normalized 0-1, always `unresolved: true`) and `ExtractedSheet.page_number` (sheet name → PDF page number, needed to render the right image) added to `lib/drawingExtraction.ts`'s prompt/schema/types, backward-compatible (optional field, historical extractions unaffected).
- **`lib/ductRouting.ts`** (new, 19 tests + 4 more for `resolveRoomPositionSource`): real ACCA Manual D Appendix 3 constants (`ROUND_ELBOW_EL_REFERENCE_FT = 15`, `BRANCH_TAKEOFF_EL_REFERENCE_FT = 15`, both cited/sourced) and the exact velocity/friction conversion formula; `derivePageScale` (median real-feet-per-page-point across rooms with both a known printed dimension and a placed pin, with outlier exclusion); `computeManhattanDistanceFt`/`countManhattanTurns`/`computeRoutedBranchRun` (real routed length + fitting length, not guessed); `getDuctRoutingGateStatus` (deliberately separate from `lib/reportGate.ts` - gates only the auto-length computation, never general report generation).
- **Schema**: `rooms.position_x_norm/position_y_norm/position_source_drawing_id/position_source_page_number`, `zones.ahu_position_x_norm/ahu_position_y_norm/ahu_position_source_drawing_id/ahu_position_source_page_number` (3 migrations). AHU position is always tech-placed from scratch, never AI-suggested (mechanical closets are rarely labeled as reliably as named rooms) - a deliberate, disclosed scope decision, not an oversight.
- **`app/api/drawings/[id]/page-image/route.ts`** (new): renders any drawing page on demand for the pin canvas, reusing `renderPdfPageToPngDataUri`, also returning real PDF page-point dimensions (via `pdf-lib`) for scale derivation.
- **`components/duct-routing-canvas.tsx`** (new): drag-to-place/confirm pin UI over the real rendered drawing page. Confirming an AI-suggested pin as-is writes `field_resolutions` with `resolution_type: 'accepted'`; moving one requires a reason and writes `'overridden'` - the exact same generic audit mechanism (`table_name`/`field_name`/`ai_extracted_value`/`final_value`) every other extracted field in this app already uses, no new resolution mechanism invented.
- **Auto-generate in `duct-design-section.tsx`**: once every relevant room+zone pin is resolved, computes real routed lengths/fittings and upserts `duct_runs` rows. Plenum sizing deliberately NOT modeled as a `duct_runs` row (a plenum is velocity-sized at total zone CFM, not length/friction-sized like a real trunk/branch) - reuses `sizeDuctRun` directly with the zone's own derived friction rate, shown as its own read-only line. Trunk length uses the longest branch as a disclosed, conservative (never-under-sizing) stand-in for the trunk's own real backbone length - real ACCA Group 9 (Supply Trunk Junction Fittings) values were not sourced with the same visual-verification rigor as the branch/elbow values used elsewhere, so no trunk fitting-length default was invented.
- **Report**: new Duct Routing page (`lib/reportHtmlV2.ts`'s `renderDuctRoutingPage`, inline SVG pin+route overlay on the real drawing image, same technique already used for the compass overlay) - report is now 12 pages, `SUMMIT-REPORT-STANDARD.md` updated (new §7a, renumbered page list, new acceptance criteria). `lib/reportData.ts`'s `buildDuctRoutingIllustrations` builds the pin/route data purely from already-resolved positions and already-computed duct sizing - no new geometry computed at report time.
- **Closed the frozen-image gap found during investigation**: new `lib/reportImages.ts`'s `attachFrozenImages` renders and freezes the Floor Plan + Duct Routing images into `calculation_snapshots.snapshot_data` at snapshot-creation time (`getOrCreateSnapshot` and `/api/reports/revise`) - deliberately NOT inside `getReportData` itself, since that cheap aggregation function is also called by the lightweight gate-status route on every page load, where launching Puppeteer on every call would be a real regression. `app/api/reports/route.ts` now reads the image straight off `reportData` instead of live-fetching.
- **"View previous version" access point** (didn't exist before, despite `calculation_snapshots` already being real and immutable): new `app/api/reports/versions/route.ts` (GET, lists all versions) + a version-history dropdown in `components/generate-reports-button.tsx`, downloading a specific past version's exact frozen PDF via a new optional `version` param on the existing `POST /api/reports`.

**Verification**: `tsc --noEmit` clean throughout (checked after every major slice, not just at the end). Full suite grew 170 → 174 (23 new tests for `lib/ductRouting.ts`, 4 for `lib/reportData.ts`'s `buildDuctRoutingIllustrations`), 0 regressions. Production build clean. **Live-verified against real Schneider data, not just fixtures**: ran the real report pipeline end-to-end (confirmed no crash, correct empty-state "no pins resolved yet" rendering, since Schneider's extraction predates this feature and has no room positions yet); ran the real pin-save write path through an actual authenticated session (magic-link + `verifyOtp`, not service-role) against a real room and zone - confirmed `rooms`/`zones` updates and the `field_resolutions` insert all succeed under real RLS, and `getDuctRoutingGateStatus` correctly reflects the change - then cleaned up the test writes, leaving Schneider's real data untouched.

**Honest, disclosed limitations, not silently glossed over**: (1) Schneider itself has no drawing extraction with room positions yet (extraction predates this feature) - a real pin-placement walkthrough on a live project was not performed this session, only the write path was verified directly. (2) Trunk fitting-equivalent-length uses 0 as a placeholder (see above) pending real Group 9 sourcing. (3) An image-type (non-PDF) drawing upload has no real page-point dimensions, so auto-length isn't available for image uploads - PDF only. (4) Cross-level runs (a room pinned on a different sheet than its zone's AHU) are skipped, not guessed at - a 2D page distance across two different sheets isn't a real measurement.

---

## Addendum (2026-08-25/26): Manual D visual fidelity rework + 16 room-position corrections

Full detail in SESSION-PROGRESS.md's matching dated entry, not duplicated here. Summary: user rejected the duct-routing diagram's visual quality against a real target standard (`REFERENCE-DOCS/IMG_3916.JPG`), then authorized a full rendering-fidelity rework plus a required return-air plenum pin. Shipped: real printed-scale-notation parsing (`parseArchitecturalScaleText`/`resolveSheetScale`, exact 24px/ft vs. ~15% error from the old bounding-box estimate); return-air plenum as a first-class per-zone pin (new `zones.return_position_*` columns, same audited pin-canvas workflow as the AHU pin); pin canvas redesigned to small SVG crosshair markers; register/duct-texture/callout/label rendering matched to the target standard in both `duct-routing-diagram.tsx` and `reportHtmlV2.ts`. While running the user's own acceptance test (spot-check named rooms' pins against real walls), found and fixed 16 of 26 rooms' `position_x_norm/y_norm` genuinely mispositioned by prior AI extraction (outside the building, on walls, or inside the adjacent room) - re-read directly against the full-resolution rendered sheet, visually verified per room, corrected via the standard disclosed `field_resolutions` mechanism. Two corrections were caught as still-wrong by the user on first review and re-derived at 2x zoom against the drawing's actual wall lines. `tsc`/full suite (250/250)/production build all clean; final result live-verified via a real `/api/reports/revise` + `/api/reports` call (calculation snapshot v2), not a mockup.

Committed `71a7ac8`. User then found the live output still wrong three more times in a row after that commit - full detail in SESSION-PROGRESS.md's "Round 2"/"Round 3" entries, summary here:

- **Round 2 (commit `9cf1475`)**: Sheet 2 (A3.1, 2nd floor, 688 SF) draws its real floor plan into a small corner of the same full 36x24in sheet A3.0's 2,350 SF plan fills almost entirely - the underlying scale was identical and correct on both sheets, but fixed-size schematic symbols looked oversized next to Sheet 2's smaller drawing. Fixed with a new `computeSheetCropViewBox` (`lib/ductRouting.ts`) that crops/zooms each sheet's own viewBox to its real pin extents, shrinking every fixed-size symbol constant by the zoom factor so absolute size is preserved.
- **Round 3 (commit `c8d4b43`)**, two bugs caught together: (a) room-name text labels ("MASTER BEDROOM" etc.) were being drawn, directly contradicting an explicit earlier instruction in this same session to rely on the PDF's own printed labels - that instruction was lost during the Round 1 rebuild; deleted the room-label-generation code. (b) The user's own suspicion that "the file that was uploaded that determined the coordinates" was the issue was correct: the real, human-digitized `duct routing graph.json` the user supplied explicitly documents its own AHU coordinate as an unconfirmed estimate ("NEEDS PLACEMENT in Summit per your pin list... suggested near stair landing"), but the code was using it as-is for the duct trunk's start point anyway - up to 19ft from the real, technician-confirmed AHU pin, landing inside the wrong room on both zones. Fixed by threading the real confirmed AHU point through as an override in `lib/ductCorridorGraph.ts`.
- Verification for both: `tsc`/full suite (255/255, then 258/258)/build clean, each verified against a freshly regenerated real PDF (snapshots v3, v4) via `/api/reports/revise` + `/api/reports`, not just static checks. One real infrastructure hiccup during Round 3 verification: the long-running dev server got stuck mid-recompile under this machine's documented disk I/O contention (confirmed via a standalone `vitest` run of the same pipeline succeeding cleanly, proving the code itself was fine) - required a dev-server restart, disclosed to the user (anyone with the app open needed to refresh).

**Status at end of session: still not resolved.** After Round 3's fixes were shown, the user said "i am still not satisfied with the look of the diagram" with no further specifics, then asked for a handoff to a new chat. Unlike Rounds 1-3 (each a specific, provable, locatable bug), this remaining dissatisfaction has no concrete complaint attached yet. **The new session's very first move must be getting itemized, specific feedback from the user** (a fresh gap list against the reference standard, or a marked-up screenshot, the way Round 1 started) - not guessing and changing code speculatively.

---

## Addendum (2026-08-26): Permit-Submittable Manual D Package — full rebuild, 10 commits

Full detail in SESSION-PROGRESS.md's matching dated entry, not duplicated here. Summary: rather than the itemized diagram feedback the prior handoff asked for, the user issued a full 8-section rebuild spec for the entire Manual D pipeline (master ACCA Manual D grounding, real-sourced calc tables with no fabrication, full auditable per-segment calc chain, real Extended-Plenum/Reducing-Trunk system-design rules, an ESP-vs-equipment-capacity hard gate, a full permit-package report output, a licensed-reviewer sign-off gate, and 3-project independent validation). Direct instruction mid-session when gaps were first flagged as blockers: **"If there is information that you need in order to do your job, then source it... tell me what exactly you need from a licensed contractor"** — source real data actively, name precisely what's genuinely missing. Vivian Street was later explicitly dropped from the validation requirement (Manual J only) once its real source PDFs were confirmed to contain zero Manual D content.

**Shipped and committed, oldest first**: `1fe5756` (real diffuser/duct-material/termination reference schema, UL 181/NAIMA-cited), `e458ec8` (real per-diffuser pattern types), `55b3ed3` (AHU install-detail UI + report section), `a262b2e` (derive routing-mode basis from real data, no redundant question), `cc9c40f` (duct terminations UI + plan rendering), `2e6f473` (the permit-package spine: audit trail, 3 new report pages, `report_sign_offs` sign-off gate), `b0cac64` (real ESP-vs-equipment-capacity gate + real Goodman blower data), `72d6d28` (real trunk-topology analysis on the real corridor_graph), `26e8ea5` (real reducer/violation markers on the diagram — caught and fixed a real graph-slug-vs-real-room-UUID id-mismatch bug during live verification, in the same commit), `0fa473d` (real blower data for Amana/Carrier/Daikin/Trane + 2 more Goodman models, each with a disclosed real structural difference from the OEM's own documents, e.g. Amana's newer self-regulating platform has no open ESP curve to source).

**Verification**: `tsc --noEmit`/full suite/production build clean after every commit (324/324 tests at this checkpoint, up from 258). Live-verified against the real Schneider project via temporary scratch scripts (always deleted after use) at multiple points — this is what caught the id-mismatch bug in `26e8ea5` before it shipped silently broken.

**Genuinely open, not silently dropped**: Section 8's 3rd-party validation still has no real project with an independently-computed Manual D schedule to check against. The "Schneider Manual D Set" Artifact (published earlier this session per the user's "see progress as it happens" requirement) was not redeployed after the later commits. The prior session's "diagram still doesn't look right" complaint was superseded by the rebuild spec, not explicitly re-confirmed as resolved.

## Current Status As Of This Session's End (supersedes the "Git Status"/"Last Commit" fields above, which are stale from Phase 7's original base entry)

**Git**: branch `main`, working tree clean except pre-existing untracked reference files (see below). **NOT pushed to `origin/main`** - `main` is 30+ commits ahead of `origin/main`. Never push without being asked first.

**Last 3 commits** (newest first): `0fa473d` (real Amana/Carrier/Daikin/Trane blower data + 2 more Goodman models), `26e8ea5` (real reducer/violation diagram markers + a real id-bridge bug caught and fixed), `72d6d28` (real trunk-topology analysis).

**Untracked files intentionally left alone, not yet resolved**:
- `REFERENCE-DOCS/IMG_3933.HEIC`, `IMG_3934.HEIC`, `IMG_3935.HEIC` - the user's own before-screenshots from an earlier session, not referenced by any code, never committed.
- `manual D duct design diagram  /` (note: literal double space before the trailing `/` in the real directory name - use `ls` or Python `os.listdir`, not a typed path, to reference it) - a stray folder in the project root with loose JPGs. Never asked about; leave alone unless the user requests cleanup.

**Live app state**: Schneider project (`94749d9f-ecc1-4bb8-b38f-d927cb150b90`) has not had a fresh report snapshot generated since the `26e8ea5`/`0fa473d` commits landed (both were verified via temporary scratch scripts against live data, not a full `/api/reports` regeneration) - the next session generating a real snapshot to confirm the full rendered PDF reflects everything shipped this session is real, useful follow-up, not yet done.

**The actual open item**: continue down the permit-package spec's remaining sections (3-project validation sourcing, Artifact redeploy) or return to direct user feedback on the diagram's visual quality now that reducers/violations/trunk topology are real - whichever the user directs next.

## Addendum (2026-08-27): Catalog Expansion + Recommended Install Package

Full detail in SESSION-PROGRESS.md's matching dated entry. Summary: the user asked for a visual audit of the equipment catalog, which surfaced 9 real gaps (published as an artifact) — then issued a full build spec to close them, expand catalog depth, and build a new "Recommended Install Package" generator (a real BOM from a Manual S match, not just a compatibility score). Explicit instruction: "continue to completion... source whatever you need... uninterrupted."

**Shipped and committed (7 commits)**: schema for 6 new gap categories (electrical, refrigerant lineset, coil-matching, heat-kit, filter specs, a real diffuser/duct-material hardware catalog) plus a `coil` equipment type and a `condenser_position` pin prerequisite; real Daikin (3 heat pumps + 3 matched coils, full 41-point performance curves) and Trane (2 heat pumps, real electrical/lineset, honestly zero performance points since Trane's residential literature doesn't publish an extended curve) outdoor units, closing the "Daikin/Trane have no outdoor unit" gap; electrical/lineset/filter/heat-kit backfill for all 18 pre-existing rows; 7 real diffuser SKUs (Hart & Cooley, Titus) and 4 real duct-material SKUs (Thermaflex, Imperial, Johns Manville, CertainTeed); and the install-package generator itself (`lib/installPackage.ts`, a real 8-step BOM assembly, 12 new unit tests, wired into `getReportData` and a new report page), live-verified against real Schneider data.

**Verification note**: partway through the install-package commit, this machine hit a severe, sustained environmental slowdown - `tsc --noEmit` and the full `vitest` suite each took 10-70x their normal runtime, and a `next build` was still mid-compile after 15+ minutes at commit time, so that commit landed without a confirmed clean build. Once the environment recovered, the build completed and correctly surfaced one real, expected issue - `reportGate.test.mts`/`reportValidation.test.mts` needed the new `installPackagesByZone` field added to their hand-built fixtures, the same fixture-drift pattern this session hit repeatedly elsewhere - fixed in the very next commit (`aa8edde`). **Now genuinely confirmed clean**: `next build`'s TypeScript step completed in ~3s, full suite 336/336 passing (23 test files, up from 324).

**Genuinely open, not silently dropped**: full "top 7 per manufacturer" catalog depth (only 3 Daikin/2 Trane/0 additional Amana-Carrier-Goodman models added this pass); the condenser-position pin has no placement UI yet (blocks real line-set-length checks for every project); org-level diffuser/duct-material defaults are still 0 rows everywhere (blocks duct-material inheritance in the install package); the interactive install-package review/swap-and-rescore UI and the org equipment-defaults settings extension (Section 6) were not built.

## Addendum (2026-08-27/28): Standing Equipment-Documentation Sourcing Sweep — Furnace Combustion Safety (7 platforms)

Full detail in SESSION-PROGRESS.md's matching dated entry. Separate standing workstream (not part of the Phase 7 gap list above), triggered by an all-caps user directive after a real dehumidifier max-ESP miss: **"SCRAPE everything about every model of product ever put into summit... YOU DO NOT SHORTCUT... source every bit of detailed information"** — every `equipment_catalog` row must be checked against its FULL real documentation set (installation instructions/IOM, not just a spec sheet), permanently, going forward. Persisted as memory `standing_full_documentation_sourcing_requirement.md`. Sequencing directive: safety-relevant gaps first, then the rest.

**Closed out, safety-first order**: exhaust fans (HVI/backdraft-damper corrections, 2 disclosed non-findings), makeup-air units (real BPI depressurization + IECC flow-cap reference tables, real Fantech MUAS CFM/temp data with a disclosed distinct 55°F minimum and a disclosed manufacturer disagreement over ducting makeup air through central HVAC), then a new `equipment_combustion_specs` schema (venting category, manifold pressure, gas supply pressure by fuel, structured clearances) and 7 real Amana/Daikin/Goodman furnace platforms sourced one real Installation Instructions manual at a time — every identifiable platform in that brand family in this catalog. Two Daikin rows (`DR96TC0803BN`, `DR97MC0803BN`) deliberately left unassigned — don't match either sourced manual's wildcard convention, not guessed.

**Started, not finished**: Carrier's 58SB0/58SB1 platform — a real motor-code mismatch (catalog says "M", the sourced manual is the "E"/ECM revision) and a clearances table that's a graphic, not extractable text, both left as disclosed gaps rather than guessed. Full Carrier lineup (~10 platforms) and Trane (3 platforms) not started.

**A real process-tooling lesson from this session, worth remembering going forward**: a `tsc --noEmit 2>&1 | tail -40` run showed real `TS6053: File not found` errors for 10 core lib files (manualJ.ts, manualD.ts, manualS.ts, etc.) next to `[exited with code 0]` — investigated immediately rather than dismissed. The files all genuinely exist (confirmed via `ls -la`); the errors were a transient filesystem glitch under the same severe system-load pattern documented across multiple prior sessions, and the "exit code 0" was `tail`'s exit code, not `tsc`'s — a classic pipe-masking bug. Re-running with output redirected to a file and the exit code captured directly (`cmd > file 2>&1; echo $?`) confirmed a genuinely clean result. **Never trust an exit code read after a pipe** — capture `$?` immediately after the command that matters, or redirect instead of piping.

**Git/push status update (supersedes every "not pushed"/"NOT pushed to origin/main" note anywhere above in this file — those are now historical, not current)**: the user gave a new standing instruction this session — **"push everything to GITHUB that we have done as well as anything we do moving forward"** — explicitly superseding this project's prior default of never pushing without being asked, for this and all future work. All 70 outstanding local commits (this sourcing sweep plus everything from every Phase 7 addendum above that had never been pushed) were pushed. `git push origin main` timed out twice under the same system load before a longer-timeout background run succeeded. **Confirmed**: `origin/main` is in sync with local `main` at `c05de4c`. Going forward, every commit should be followed by a push — no need to ask again.

Next action: get direction on whether to continue the furnace-platform sweep (Carrier motor-code question first, then the rest of Carrier and Trane) or pivot to one of Phase 7's own open items (condenser pin UI, org hardware defaults, multi-tenant billing, etc.) — both are real, valid next steps and the choice is the user's.

## Addendum (2026-08-30): Standing Sourcing Sweep — Carrier 58SB0/58SB1 furnace combustion safety

Full detail in SESSION-PROGRESS.md's matching dated entry. Continuation of the standing full-documentation sourcing sweep; user directed resolving the Carrier 58SB0 blocker first.

**Blocker resolved.** The "motor code M vs. E" mismatch was a revision artifact: the prior session had only the superseded **58SB0A** Installation Instructions (nomenclature: motor position C/E/V, no "M"). The current **58SB0B/58SB1B Product Data (A190411)** — already cited on the catalog rows — defines **M = Multi 18-Speed Constant Torque (MCT) ECM**. `58SB0090M17-14` is a valid, current 58SB0B model number; no `equipment_catalog` change needed.

**Sourced** (new migration `20260830010000`, from `58SB0B-01SI` Installation Instructions + `58SB0B` Product Data A190411, both read directly, covering both the standard `58SB0090M17-14` and Low-NOx `58SB1090M17-14` rows): Category I fan-assisted; clearances-to-combustibles (label A220231 — one orientation-independent table: top 1 / back 0 / sides 0 / front 3 / bottom 0 in., alcove front 18, service front 24, vent connector single-wall 6 / B-1 1); natural-gas supply pressure 4.5–13.6 in. w.c.; natural-gas manifold pressure 3.2–3.8 in. w.c. (worked example 3.7 with #43 orifice).

**Disclosed gap**: propane manifold + supply pressure are not published in either Carrier document — they live in the separate factory conversion kit **AGAGC8NPS01B**, not obtainable from a primary source this pass. Those fields left NULL with an explicit in-migration disclosure rather than guessed or borrowed from another manufacturer's platform.

**Still open**: rest of Carrier furnaces (~9 platforms), full Trane lineup (3), the two unresolved Daikin rows, and the heat_pump / package_unit / air_handler / coil / split_ac categories (no full-doc pass yet).

## Addendum (2026-08-31): Manual D duct-routing pin coordinates — root-cause + vector-geometry subsystem started

Full detail in SESSION-PROGRESS.md's matching dated entry. User directive: stop patching, root-cause the pin-placement bug (pins land outside their rooms on the rendered diagram) and make Summit generate **correct** coordinates.

**Diagnosed (evidence against Schneider, not assumed):**
- **Bug 1 — room identity.** `extracted_data.rooms[].name` are vision-OCR misreads. Drawing reads "BEDROOM #2" / "BATHROOM #2" / "HALLWAY"; Summit stored "Bedroom 3" / "Bathroom 3" / "Wallhall". Causes: (a) the extraction prompt has **no instruction for the `name` field** (STEP 3 covers `room_label_text`/`room_position`/walls, never "transcribe the printed label exactly"); (b) the plan sheets have **no text layer** — A3.0 has 15 text objects, all title-block; every room label is outlined vector geometry, so it's pure OCR; (c) `pdfTextBlock` ground-truth is empty for these sheets so nothing catches the misread; (d) zero `field_resolutions` touch `name` — misreads flowed straight through.
- **Bug 2 — room shape.** `room_position` is a 4-number axis-aligned bounding box at every stage (`drawingExtraction.ts:762`/`:798`, `ductPathGeometry.ts:16`/`:65`). The bbox centre of the garage / stairs / any L-shaped room is not inside the room — an independent cause of pins-outside-rooms.
- **Three AI-estimation attempts** (raw-PDF raster, full-sheet fractions, tight-crop + labelled grid) each capped out at *roughly* right, never *correct*. Abandoned.

**Chosen fix (user picked "A"): recover true geometry from the PDF vector data.** The plan sheets are CAD vector exports — ~40,000 real wall segments in a coordinate system that maps 1:1 to `lib/floorPlanRender.ts`'s render.

**Shipped this session (WIP, commit `be1c2e6`): `lib/pdfRoomGeometry.ts`** — `parsePageSegments` (pdfjs operator-list → line segments, pixel-exact), connected-component wall isolation, surgical door-gap bridging, flood-fill → marching-squares contour → RDP-simplified polygon, pin at pole-of-inaccessibility. Verified against Schneider A3.0: **~10-11 of 15 rooms reconstruct as correct polygons with an inside pin, including the L-shaped garage.** Known gaps (in the module header): open-plan spaces flood-merge; tiny rooms whose seed hits a shelf/tread line trap.

**Not done — remaining subsystem work (multi-day):**
1. `findTextLabelAnchors` — cluster the vector glyph geometry → each room label's centroid (guaranteed inside its room) as the flood seed; same pass feeds a high-zoom per-label re-read to fix Bug 1 names.
2. Add an explicit `name` rule to the extraction prompt.
3. Schema: `rooms.polygon jsonb` + `polygon_source`.
4. Wiring: extraction route runs the geometry pass for PDF floor-plan sheets; `ductPathGeometry` uses the polygon as the routing obstacle; `resolveRoomPositionSource` seeds from the polygon pin; `computeSheetCropViewBox` crops to polygon extents (auto-robust to outliers); renderers can draw the polygon.
5. Open-plan handling (kitchen/hallway/living as one connected space) and tiny-room seed robustness.
6. Schneider re-run → regenerate diagram → user review (acceptance test: every name matches the drawing incl. "Bedroom #2"; polygon not rectangle for those + garage + stairs; every pin inside its correct, correctly-labelled room).

**Also this session:** reverted migration `20260830020000` (`drawings.room_position_space`, backed the abandoned approach) via `20260831010000`, applied live. Moved the two Schneider debug reference images to `reference/`.
