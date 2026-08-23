# Summit

## Project

Summit is a branded multi-user cloud platform for Summit Construction Technology & Restoration Group, a commercial / high-end residential / historical restoration HVAC company.

## Purpose

A web application that lets field technicians, estimators, and admins collect HVAC project data (residential, commercial, industrial) and generate accurate load calculations following ACCA Manual J, Manual D, and Manual S, using auto-detected climate zone and NOAA/ASHRAE design temperatures based on project address.

Built for eventual multi-tenant SaaS sale to other HVAC contracting organizations nationwide, not only Summit's own internal use — the org-scoped RLS model already reflects this. Core differentiator vs. competitors (Wrightsoft, AutoHVAC, Cool Calc, Elite RHVAC): the UNRESOLVED field-review workflow and audit trail, not raw calculation speed.

## Roles

Three-tier role hierarchy:

- Field Tech
- Estimator
- Admin

## Brand

- **Palette:** Black / silver / bronze-gold
- **Taglines:**
  - "Restore. Protect. Perform."
  - "Built on Integrity. Engineered for Excellence."

## Current Status

Active production build, not a prototype. The calculation engines are genuinely implemented (not stubbed) and wired end-to-end from database → UI → PDF report:

- `lib/manualJ.ts` — full Manual J residential load calc (room-by-room, ASHRAE 62.2 ventilation, duct gain/loss, zones)
- `lib/manualD.ts` — Manual D duct sizing (equal-friction method, round + rectangular)
- `lib/manualS.ts` — Manual S equipment selection (bilinear OEM performance interpolation, ACCA sizing windows, heat-pump balance point)
- `lib/manualN.ts` / `lib/manualNSimulation.ts` — commercial block load + 8760-hour NOAA-data simulation
- `lib/manualIndustrial.ts` — industrial process-load module (makeup air, exhaust, cleanroom ACH)
- `app/api/drawings/extract/route.ts` + `lib/drawingExtraction.ts` — AI-based drawing extraction (Claude, streaming), with a human-review gate for known model failure modes
- `app/api/reports/route.ts` + `lib/reportHtmlV2.ts` — branded PDF report generation per `REFERENCE-DOCS/SUMMIT-REPORT-STANDARD.md`

See `SESSION-PROGRESS.md` for the detailed session-by-session build log, and `REFERENCE-DOCS/SUMMIT-REPORT-STANDARD.md` for the report-format specification.

## Development Protocol

The repository is permanent project memory; a Claude conversation is temporary working context. `PHASE.md` (repo root) is the live tracker for the current phase — read it first in any new session. `SESSION-PROGRESS.md` is the detailed chronological history; this file is the stable overview. Don't create parallel memory files (PROJECT_STATUS.md, DECISIONS.md, etc.) — extend these three instead.

At the end of every substantial phase or workstream, before considering it done: verify each original objective was actually met (not assumed), run lint/typecheck/tests/build and record real results, fix issues clearly in scope, update `PHASE.md` and this file if architecture changed, check `git status`/diff for secrets, and commit + push a real checkpoint. Then explicitly state whether to continue the current chat or start a fresh one — same workstream continuing normally means continue; a materially different next phase beginning, or the conversation having accumulated a lot of history, means recommend a fresh chat and write out the next-session starter prompt (what was just finished, current state, next objective, exact files to read first) so the new session doesn't need this conversation's history to pick up cleanly.

Small fixes (a typo, one config value, one isolated bug) don't need any of this — it's for genuine phase/workstream boundaries.

## Planned Architecture

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) |
| Database | Supabase (Postgres) |
| Auth & roles | Supabase Auth with Row Level Security |
| File storage | Supabase Storage |
| Server-side compute | Supabase Edge Functions (for AI-based drawing extraction) |
| Hosting | Vercel |
| Version control | GitHub |
| PDF/report generation | Puppeteer via serverless function |
