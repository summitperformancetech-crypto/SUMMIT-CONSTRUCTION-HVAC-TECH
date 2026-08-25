# CURRENT PROJECT PHASE

## Project
Summit Construction Technology & Restoration Group — Summit HVAC platform

## Current Phase
Phase number: 7 (post-6-phase-plan software completion push) — started 2026-08-24, same session as the KHAWAJA MAMOON drawing-reading deep dive that preceded it.
Phase name: Close the "finish the software" gap list — role UI, AED, offline/PWA, multi-tenant, deploy (in that order, deploy explicitly last, per direct user instruction).

## Phase Objective
User asked directly: "where are you with finishing the software," then, after a 5-item gap list was presented (role UI, AED, PWA/offline, multi-tenant, deploy), said to go through all 5 "with undisrupted intent to finish this software," reordering so local build-out happens before any deployment. Scope for AED/PWA/multi-tenant was clarified via direct questions rather than assumed: real analytical solar model for AED (not a fabricated shortcut, not a live external API this app has no key for), full offline data entry with sync for PWA (not just installability), real self-serve signup + billing for multi-tenant (needs real business input, see Open Questions).

## Status
**Items 1-3 of 5 are done, verified, committed, and pushed this session:**

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
