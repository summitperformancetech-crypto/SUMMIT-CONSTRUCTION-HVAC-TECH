# Summit

## Project

Summit is a branded multi-user cloud platform for Summit Construction Technology & Restoration Group, a commercial / high-end residential / historical restoration HVAC company.

## Purpose

A web application that lets field technicians, estimators, and admins collect HVAC project data (residential, commercial, industrial) and generate accurate load calculations following ACCA Manual J, Manual D, and Manual S, using auto-detected climate zone and NOAA/ASHRAE design temperatures based on project address.

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
