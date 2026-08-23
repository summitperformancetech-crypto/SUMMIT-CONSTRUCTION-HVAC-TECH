# CURRENT PROJECT PHASE

## Project
Summit Construction Technology & Restoration Group — Summit HVAC platform

## Current Phase
Phase number: 5 of 6 (of the completion plan started 2026-08-22)
Phase name: Testing & Deployment Readiness

## Phase Objective
Add a real test runner, add direct unit tests for the calc engines (previously zero direct coverage beyond report-layer regression tests), fix Puppeteer for actual Vercel deployment, add a minimal CI workflow.

## Status
COMPLETE — all 4 phase items done, verified, and on `origin/main`. **This session (2026-08-23, second entry)**: resolved the open questions carried over from Phase 5 closeout — see "Open Questions Resolved This Session" below — before starting Phase 6 scoping.

## Overall V1 Completion
Estimated percentage: ~75%
Confidence: Medium-High — calc engines (Manual J/D/S/N/Industrial) and drawing extraction are mature; report generation is substantially complete (Phase 4); testing/CI infrastructure is now real (Phase 5); Vercel deployment itself is still unexercised (see What Is Not Verified); role-based UI completeness beyond Field Tech and Phase 6 (knowledge-base docs) are not yet done.

## What Was Accomplished

**Repo-recovery audit (start of this session):** the user pasted a large generic "master project recovery" prompt whose premises (an unrecovered Claude.ai export, ministry-content contamination, a blueprint-takeoff/estimating/multi-agent product) were independently verified against this specific repo before acting on any of it, per the user's own "never report completed without evidence" instruction. Findings: the export (`CLAUD-HISTORY-COMPLETE-RECORD/`) was already correctly gitignored/uncommitted; zero contamination existed in the tracked repo; the user then chose to keep the existing CLAUDE.md/PHASE.md/SESSION-PROGRESS.md protocol rather than adopt a new `docs/` tree, and confirmed multi-agent architecture is a real (future, not current) intended direction. See `SESSION-PROGRESS.md`'s 2026-08-23 entry for the full mined findings (business model, competitive positioning, related-but-separate businesses, a missing vision doc, one live product-decision conflict, and two previously-uncertain features confirmed already built).

**Phase 5 (this phase, 4/4 items):**
- Added Vitest (`vitest.config.mts`); migrated all three existing hand-rolled `.test.mts` files (`reportValidation`, `reportData`, `manualJ`) from a custom `check()`/`pass`/`fail` harness run via bare `npx tsx` to real `describe`/`it`/`expect`. `npm test` now runs `vitest run` (~0.7s vs. ~23s before).
- Added `lib/__tests__/manualD.test.mts` (16 tests: required-CFM, equal-friction zone friction rates, round/rectangular duct sizing incl. Huebscher equivalent-diameter cross-check, velocity warnings, duct-insulation code-minimum compliance) and `lib/__tests__/manualS.test.mts` (20 tests: bilinear cooling-capacity interpolation incl. clamping, 1-D heating interpolation, balance-point crossing, supplemental-heat gap, ACCA sizing-window gating per equipment type, compatibility scoring incl. weight-dropping for cooling-only equipment, full `evaluateEquipment`/`rankEquipment` integration incl. preference tie-break). 51/51 tests passing total.
- Fixed Puppeteer for Vercel: added `lib/browser.ts`, a shared `launchBrowser()` that uses `puppeteer-core` + `@sparticuz/chromium` when `VERCEL`/`AWS_LAMBDA_FUNCTION_NAME` is set, and the full `puppeteer` package (now dev-only) otherwise. Both call sites (`app/api/reports/route.ts`, `lib/floorPlanRender.ts`) updated to use it — this was a real, previously-duplicated gap (two direct `puppeteer.launch()` call sites, not one).
- Added `.github/workflows/ci.yml` (lint + typecheck + test + build on PR/push to `main`, Node 22, build-time env placeholders matching the three vars the code actually reads).

Incidental fix: a stale duplicate `.next/types/*` build artifact (e.g. `routes.d 2.ts`) was breaking `tsc --noEmit` in isolation; cleared via `rm -rf .next && npx next typegen`. Not a code defect — a leftover from a prior interrupted build on this same disk-space-constrained machine.

## Open Questions Resolved This Session (2026-08-23)

The user made four calls on Phase 5's carried-over open questions before Phase 6 scoping began:

1. **Vivian Street OEM data sourcing → authorized autonomous web sourcing.** Turned out not to need fresh sourcing: the real, cited Carrier 26TPA824W003 extended-performance data (30 points, citation to Carrier's official Performance 18 Product Data PDF) was already sourced and committed in `supabase/migrations/20260811031915_replace_discontinued_equipment.sql` back in Phase 3-era work. Live-DB inspection (via a scratch `@supabase/supabase-js` script, run and deleted this session — not committed) found the **live database had been corrupted on 2026-08-17**: 16 synthetic placeholder performance points had been inserted alongside the real 30 (some overlapping the same outdoor-temp/wetbulb coordinates with different, made-up capacity values — an interpolation-integrity bug, not just a labeling issue), and `equipment_catalog.source_document` for that row had been overwritten to placeholder text. **Fixed live**: deleted the 16 placeholder rows (matched by their exact shared `updated_at` batch timestamp), restored the real citation string to `source_document`. Verified after: exactly 30 performance points remain, all from the 2026-08-12 real-data insert; catalog row's `source_document` now matches the migration file again.
   - Separately confirmed the FIXTURE-PLACEHOLDER / VIVIAN-ST-WHOLE-HOUSE-TEST-UNIT catalog entry described in the 2026-08-17 `SESSION-PROGRESS.md` entry **no longer exists live** — consistent with the per-zone equipment-selection migration (`20260822210000_per_zone_equipment_selection.sql`) having since resolved the whole-house-vs-per-system sizing gap that necessitated it. Vivian Street is confirmed live as a genuine 2-zone project (AHU-1, AHU-2 per `zones` table), both currently unselected (`selected_equipment_id: null`) — selecting real equipment per zone is follow-up report-generation work, not done this session.
2. **AED solar-position approach → source real solar irradiance data** (NOAA/NREL) instead of a from-scratch astronomical engine, when AED is picked back up. Decision recorded only — AED itself is still deferred, no implementation this session.
3. **PWA/offline field capture → confirmed still wanted**, scheduled as a future phase (after Phase 6, exact slot TBD — see Deferred Work).
4. **`summit-platform-vision-AEC-master.md` → written for real** at `REFERENCE-DOCS/summit-platform-vision-AEC-master.md`, reconstructed from the export-mining findings (business model, competitive positioning, draft pricing, the AEC discipline list, and explicit scope boundaries). Marked as a directional vision doc, not a committed roadmap — current build scope is unchanged (HVAC only).

## Files Created
- `vitest.config.mts`
- `lib/__tests__/manualD.test.mts`, `lib/__tests__/manualS.test.mts`
- `lib/browser.ts`
- `.github/workflows/ci.yml`

## Files Modified
`package.json` (test script → `vitest run`; `puppeteer` moved dependencies → devDependencies; `puppeteer-core`, `@sparticuz/chromium`, `vitest` added), `package-lock.json`, `lib/__tests__/manualJ.test.mts`, `lib/__tests__/reportData.test.mts`, `lib/__tests__/reportValidation.test.mts` (Vitest migration), `app/api/reports/route.ts`, `lib/floorPlanRender.ts` (shared launcher), `CLAUDE.md` (one-line SaaS/competitive-positioning clarification), `SESSION-PROGRESS.md` (export-mining findings; this session's open-questions-resolved entry).

**This session (2026-08-23, second entry) additionally created:** `REFERENCE-DOCS/summit-platform-vision-AEC-master.md` (new file, see Open Questions Resolved above). **No code files changed** — the OEM data fix was a live-database write (Supabase `equipment_catalog`/`equipment_performance_points` tables), not a migration file change, because it was correcting live data back to what the already-committed migration specifies; no schema or migration changed.

## Files Removed
None.

## Systems / Features Implemented
- Real test runner (Vitest) wired to `npm test`.
- Direct unit coverage for all three residential calc engines (Manual J already had it from Phase 4; D and S are new this phase).
- Vercel-compatible headless-Chromium launcher, shared between both PDF/PNG rendering call sites.
- CI (GitHub Actions): lint + typecheck + test + build gate on every PR/push to main.

## Bugs Fixed
None (this phase was additive infrastructure work, not a bug-fix pass).

## Architecture Decisions
- **`puppeteer` kept as a devDependency, not removed entirely.** Local dev/testing still uses the full package's bundled Chromium (unchanged behavior, zero new local setup burden); only the deployed serverless path uses `puppeteer-core` + `@sparticuz/chromium`. Rejected alternative: a hand-rolled "find local Chrome executable" path-search heuristic — more fragile, no real benefit over reusing the already-proven local package.
- **Serverless detection via `VERCEL`/`AWS_LAMBDA_FUNCTION_NAME` env vars**, not a build-time flag — keeps the same build artifact correct in both environments without a separate build step.
- **CI build step uses placeholder env values**, not real secrets — `next build` only needs these three vars to resolve at the type/module level for this codebase's lazy-read pattern (established in Phase 4 for fonts), not to actually reach Supabase/Anthropic at build time.

## Integrations Added or Changed
None external in the "new SaaS vendor" sense. `@sparticuz/chromium` and `puppeteer-core` are new dependencies (see Architecture Decisions); GitHub Actions is now used for CI (new, but native to the existing GitHub-hosted repo — no new account/service).

## Testing Performed
```
npx tsc --noEmit     PASS (0 errors)
npm run lint          PASS (0 errors, 0 warnings)
npm test               51 PASS / 0 FAIL (5 suites: reportValidation, reportData, manualJ, manualD, manualS)
npm run build          PASS (production build succeeds, Turbopack, 58s compile)
```

## What Is Verified Working
- All four Phase 5 deliverables individually verified as above.
- Every existing Phase 0-4 assertion still passes unchanged under the new Vitest runner (no regression from the migration itself).
- Calc-engine math independently re-derived and asserted in the new tests (e.g. balance-point crossing computed by hand and checked to 5 decimal places), not just "it runs without throwing."

## What Is Not Verified
- **Actual Vercel deployment** — this app still isn't deployed there. The `@sparticuz/chromium` <-> `puppeteer-core` Chromium build compatibility, the `isServerless()` env-var detection, and specifically whether `@sparticuz/chromium`'s bundled binary still exposes the built-in PDF-viewer plugin `lib/floorPlanRender.ts` depends on, are all flagged in code comments (`lib/browser.ts`, `lib/floorPlanRender.ts`) as needing confirmation on the first real deploy — not assumed working.
- Everything already carried forward as unverified from Phase 4 (floor-plan compositing against a real title-blocked architectural drawing; the canonical `summit_standard` report's end-to-end visual review, still blocked on real OEM data).

## Known Issues
- Same disk-space/load-average slowness on this dev machine as documented in prior sessions — `tsc`, `lint`, and `build` all took 1-2 minutes each this session and had to run in the background. Not a code issue.
- The stale `.next/types/* 2.ts` duplicate-file issue (see What Was Accomplished) may recur on this machine under the same conditions that caused it originally (likely an interrupted/concurrent build) — if `tsc --noEmit` reports `LayoutProps`/cache-life duplicate-identifier errors again, `rm -rf .next && npx next typegen` is the fix, not a real regression.
- **This session's git credential (VS Code-issued OAuth App token) cannot push any change to `.github/workflows/*` — create or edit — no matter how many times VS Code's built-in GitHub sign-in is re-run.** GitHub rejects such pushes without the `workflow` scope, and that provider's OAuth app registration does not appear to request it at all. Worked around this session by adding/editing `.github/workflows/ci.yml` directly through github.com's web UI (not subject to this restriction), then `git reset --hard origin/main` locally to sync. **If this comes up again**, skip retrying VS Code sign-in and go straight to the web UI, or generate a classic Personal Access Token with `repo` + `workflow` scopes (github.com → Settings → Developer settings → Personal access tokens) and use it as the git credential instead.

## Deferred Work
- AED Assessment (needs solar-position engine + latitude) — from Phase 4, still deferred. Approach decided this session (real solar irradiance data, not from-scratch), implementation not started.
- Floor-plan title-block cropping — from Phase 4, still deferred.
- Canonical reference file (needs real OEM performance data for Vivian Street) — **live-data corruption fixed this session** (see Open Questions Resolved above); the real, cited Carrier data is restored. Still not done: selecting real equipment per zone for Vivian Street (2 zones, both unselected) and the full end-to-end visual review of the canonical `summit_standard` report — those remain open, but the "no real OEM data" blocker itself is closed.
- Deprecating `internal`/`client` report types (waits on AED).
- PWA/offline field data capture — confirmed this session as still wanted; scheduled as a future phase (exact slot TBD, likely after Phase 6).
- Phase 6 (role-based knowledge-base docs — architect/engineer/designer/drafter standards) — not started; this is the original ask the whole 6-phase completion plan grew from.

## Open Questions
- Vivian Street: who/when selects real per-zone equipment (AHU-1, AHU-2) now that the catalog data is clean and per-zone selection exists? Not blocking — just not done yet.
- When AED is actually picked up: which real solar irradiance dataset/API (NOAA vs. NREL) is the right specific source? Decided in principle this session (real data over from-scratch), specific source TBD at implementation time.
- Where exactly does PWA/offline capture land in the phase sequence — before or after Phase 6?

## Claude Browser Input Needed
None identified for Phase 6 yet — that phase's scope (role-based knowledge-base docs for architect/engineer/designer/drafter standards) is exactly the kind of long-form domain-research work Claude Browser is suited for, but the specific asks need to be scoped first, in a fresh session, before drafting an actual browser handoff prompt.

## Next Recommended Phase
Phase 6 — Role-based knowledge-base docs (architect/engineer/designer/drafter standards) — the original ask this entire 6-phase completion plan grew from.

## Next Exact Action
Start a fresh chat (see recommendation below) and scope Phase 6: what specific standards/roles are needed, whether they inform the AI drawing-extraction prompt or are reference-only documentation, and whether any of it should be Claude-Browser-researched vs. authored directly.

## Files Next Session Should Read First
1. `/CLAUDE.md`
2. `/PHASE.md` (this file)
3. `/SESSION-PROGRESS.md` (detailed history — read both 2026-08-23 entries: export-mining, and this session's open-questions-resolution/OEM-data-fix)
4. `/REFERENCE-DOCS/SUMMIT-REPORT-STANDARD.md`
5. `/lib/manualJ.ts`, `/lib/manualD.ts`, `/lib/manualS.ts` (the engines Phase 6's knowledge-base docs will need to stay consistent with)
6. `/REFERENCE-DOCS/summit-platform-vision-AEC-master.md` (new this session — long-term direction context, not required for Phase 6 itself but useful for judging what's in/out of scope)

## Git Status
Branch: `main`
Working tree: clean, verified via `git status`/`git fetch` immediately before this closeout — will show this file's own final commit as a small delta until that lands.
Remote: `origin` → `https://github.com/summitperformancetech-crypto/SUMMIT-CONSTRUCTION-HVAC-TECH.git`, in sync (`git log --oneline origin/main` matches local exactly).

## Last Commit
`ed83585` — "Add ANTHROPIC_API_KEY to CI workflow" (a github.com web-UI commit fixing the CI file; see this phase's own commit, `3dd5ac5`, for the substantive Phase 5 work).

## GitHub Push Status
All of this phase's substantive work is on `origin/main`. The CI workflow file specifically was added/fixed via github.com's web UI, not `git push` (see Known Issues for why), and local was synced to match via `git reset --hard origin/main` after — verified byte-identical, no work lost. This file's own closeout commit follows immediately.

## Updated
Date/time: 2026-08-23 (second entry — open-questions resolution + Vivian Street live-data fix)
