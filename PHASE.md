# CURRENT PROJECT PHASE

## Project
Summit Construction Technology & Restoration Group — Summit HVAC platform

## Current Phase
Phase number: 5 of 6 (of the completion plan started 2026-08-22)
Phase name: Testing & Deployment Readiness

## Phase Objective
Add a real test runner, add direct unit tests for the calc engines (previously zero direct coverage beyond report-layer regression tests), fix Puppeteer for actual Vercel deployment, add a minimal CI workflow.

## Status
COMPLETE WITH ONE FOLLOW-UP — 3 of 4 phase items pushed to `origin/main`; the CI workflow file (`.github/workflows/ci.yml`) is written and correct but not yet on GitHub — see Known Issues.

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

## Files Created
- `vitest.config.mts`
- `lib/__tests__/manualD.test.mts`, `lib/__tests__/manualS.test.mts`
- `lib/browser.ts`
- `.github/workflows/ci.yml`

## Files Modified
`package.json` (test script → `vitest run`; `puppeteer` moved dependencies → devDependencies; `puppeteer-core`, `@sparticuz/chromium`, `vitest` added), `package-lock.json`, `lib/__tests__/manualJ.test.mts`, `lib/__tests__/reportData.test.mts`, `lib/__tests__/reportValidation.test.mts` (Vitest migration), `app/api/reports/route.ts`, `lib/floorPlanRender.ts` (shared launcher), `CLAUDE.md` (one-line SaaS/competitive-positioning clarification), `SESSION-PROGRESS.md` (export-mining findings).

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
- **`.github/workflows/ci.yml` exists locally (committed in git history) but is not yet on `origin/main`.** GitHub rejects pushes that add/modify files under `.github/workflows/` from this repo's cached git credential (a VS Code-issued OAuth App token) unless it carries the `workflow` scope, and re-authenticating through VS Code's built-in GitHub sign-in twice this session did not add that scope — VS Code's built-in GitHub Authentication provider's OAuth app registration does not appear to request `workflow` at all, regardless of how many times it's re-authorized. The rest of this phase's commit was split out and pushed successfully; only the CI file is affected. **Fix options for a future session:** (a) add the file directly via github.com's web UI (Add file → Create new file → paste `.github/workflows/ci.yml`'s content — the web UI isn't subject to this OAuth scope restriction), or (b) generate a classic Personal Access Token with `repo` + `workflow` scopes at github.com → Settings → Developer settings → Personal access tokens, and use it as the git credential instead of the VS Code-issued one.

## Deferred Work
- AED Assessment (needs solar-position engine + latitude) — from Phase 4, still deferred.
- Floor-plan title-block cropping — from Phase 4, still deferred.
- Canonical reference file (needs real OEM performance data for Vivian Street) — from Phase 4, still blocked. **Live tension, not yet resolved**: a past planning session's explicit instruction was to source real reference data from the web autonomously rather than treat gaps as blockers; Phase 4 instead left this blocked pending the user's own sourcing. Surfaced in `SESSION-PROGRESS.md`, not silently decided either way.
- Deprecating `internal`/`client` report types (waits on AED).
- PWA/offline field data capture — confirmed via this session's export-mining as originally planned, never built. Not scheduled; flagged for a future product-priority call.
- `REFERENCE-DOCS/summit-platform-vision-AEC-master.md` — described in past planning as filed, confirmed via full git-history search this session to not actually exist anywhere in this repo. Not reconstructed from a conversation summary; flagged for the user to decide whether it's worth writing for real.
- Phase 6 (role-based knowledge-base docs — architect/engineer/designer/drafter standards) — not started; this is the original ask the whole 6-phase completion plan grew from.

## Open Questions
- Who will source the real Carrier extended performance data for the Vivian Street AHUs (needed to unblock the canonical reference file)? — carried over from Phase 4.
- When AED is picked back up: is a from-scratch solar-position engine still the right call, or should real solar irradiance data be sourced instead? — carried over from Phase 4.
- Does the OEM-data-sourcing conflict above get resolved by (a) the user manually sourcing Vivian Street's real Carrier data, or (b) a future session being authorized to source it autonomously from the web as originally instructed?
- Is PWA/offline field capture still wanted, and if so, at what phase?
- Is `summit-platform-vision-AEC-master.md` worth reconstructing (from the conversation-summary description) as a real document, or was it always aspirational and fine to leave unwritten?

## Claude Browser Input Needed
None identified for Phase 6 yet — that phase's scope (role-based knowledge-base docs for architect/engineer/designer/drafter standards) is exactly the kind of long-form domain-research work Claude Browser is suited for, but the specific asks need to be scoped first, in a fresh session, before drafting an actual browser handoff prompt.

## Next Recommended Phase
Phase 6 — Role-based knowledge-base docs (architect/engineer/designer/drafter standards) — the original ask this entire 6-phase completion plan grew from.

## Next Exact Action
Start a fresh chat (see recommendation below) and scope Phase 6: what specific standards/roles are needed, whether they inform the AI drawing-extraction prompt or are reference-only documentation, and whether any of it should be Claude-Browser-researched vs. authored directly.

## Files Next Session Should Read First
1. `/CLAUDE.md`
2. `/PHASE.md` (this file)
3. `/SESSION-PROGRESS.md` (detailed history — read the 2026-08-23 export-mining entry specifically for business/product context not summarized elsewhere)
4. `/REFERENCE-DOCS/SUMMIT-REPORT-STANDARD.md`
5. `/lib/manualJ.ts`, `/lib/manualD.ts`, `/lib/manualS.ts` (the engines Phase 6's knowledge-base docs will need to stay consistent with)

## Git Status
Branch: `main`
Working tree: clean as of this file's last update (see below) — will have uncommitted changes for this closeout commit until it lands.
Remote: `origin` → `https://github.com/summitperformancetech-crypto/SUMMIT-CONSTRUCTION-HVAC-TECH.git`, up to date as of session start.

## Last Commit
`ec5ba1b` — "docs: add PHASE.md and a phase-closeout/fresh-chat protocol" (pre-session; this phase's own commit follows immediately).

## GitHub Push Status
This phase's commit(s) will be pushed immediately after this file is saved.

## Updated
Date/time: 2026-08-23
