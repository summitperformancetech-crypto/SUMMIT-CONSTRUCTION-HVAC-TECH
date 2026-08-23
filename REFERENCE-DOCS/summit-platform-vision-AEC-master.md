# Summit Platform Vision — AEC Master

**Status:** Vision document. Nothing in this file is scheduled, funded, or in progress. It exists so future scoping decisions (e.g. Phase 6 and beyond) can be checked against a stated long-term direction instead of being improvised per-session. Reconstructed 2026-08-23 from findings mined out of the user's exported Claude.ai conversation history (see `SESSION-PROGRESS.md`'s 2026-08-23 entry) — a past session described this file as filed; it never actually existed in this repo until now. Treat everything below as directional, not committed.

---

## 1. What Summit is today vs. what this document is about

Summit (see `CLAUDE.md`) is, today, an HVAC-only platform: Manual J/D/S residential, Manual N commercial, and an industrial process-load module, with AI-assisted drawing extraction and a branded report pipeline. That scope is not changing as a result of this document — **current build scope remains Manual J/D/S (plus N/Industrial)**, and this file does not authorize expanding drawing-extraction prompts or calculation engines beyond HVAC.

This document exists to record a longer-term direction that was discussed in past planning but deliberately excluded from active build scope: extending the same underlying platform — org-scoped multi-tenant data model, field-tech/estimator/admin roles, AI drawing extraction with a human-review gate, audit-trail-first workflow — to other trades' analysis beyond HVAC.

## 2. Business model context (from `CLAUDE.md` and past planning)

Summit is built for eventual multi-tenant SaaS sale to other HVAC contracting organizations nationwide, not only for Summit Construction Technology & Restoration Group's own internal use. The org-scoped RLS model already reflects this design intent.

Draft pricing (a past planning artifact, not implemented anywhere in code — captured here so it isn't lost, not because it's current):

| Tier | Price | Notes |
|---|---|---|
| Preview | Free | Capped |
| Starter | $129/mo | |
| Pro | $299/mo | |
| Enterprise | $799+/mo | |

+2 months free on annual billing, all paid tiers.

**Competitive positioning:** Wrightsoft Right-Suite Universal is the ACCA-recognized market leader but desktop-only, forcing a second site visit for field techs. AutoHVAC is the closest philosophical competitor (AI blueprint extraction) but is a black box with no audit trail and is not ACCA-certified. Summit's core differentiator is the UNRESOLVED field-review workflow and audit trail — visible on every generated report, not just present in the database — not raw calculation speed. Any AEC expansion below should preserve this differentiator as the throughline, not just add trades for coverage's sake.

## 3. The AEC expansion direction

The long-term idea, as described in past planning, is a single platform where a field tech's site visit and drawing upload can drive load/sizing analysis across multiple disciplines, each gated by the same UNRESOLVED-review pattern Summit already uses for HVAC:

- **Structural** — basic load-path / framing sanity checks relevant to a restoration or renovation scope (Summit's domain includes historical restoration, where structural context is often adjacent to HVAC retrofit work).
- **Electrical** — service/panel capacity implications of new HVAC equipment (a real adjacency: heat pump and electrification retrofits routinely trigger electrical panel questions).
- **Plumbing** — relevant primarily where HVAC intersects it (condensate routing, hydronic systems, humidification/dehumidification water supply).
- **Fire safety** — code-adjacent checks relevant to commercial/industrial HVAC scope (damper requirements, smoke control interaction).
- **Civil** — site-level context (drainage, grading) relevant to outdoor equipment placement and commercial site work.
- **Accessibility (ADA)** — relevant to Summit's commercial and historical-restoration project types, where equipment placement and controls must meet accessibility requirements.

None of these are HVAC-adjacent conveniences bolted onto the existing engines — each would need its own genuine calculation/reference logic, its own reviewer role considerations, and its own UNRESOLVED-field taxonomy, mirroring how `lib/manualJ.ts` / `manualD.ts` / `manualS.ts` are genuinely implemented rather than stubbed. This is explicitly **not** "teach the HVAC drawing-extraction prompt to also notice a beam" — it's a peer set of modules alongside HVAC, sharing the platform's org/role/audit-trail infrastructure.

## 4. Why this is out of current scope, explicitly

- The three-tier role model (Field Tech / Estimator / Admin) and the org-scoped RLS model were designed generally enough to support this, but no schema, UI, or calculation work for any non-HVAC discipline exists today, and none should be started without a dedicated scoping pass per discipline (each is its own domain with its own standards body, the way ACCA Manual J/D/S is for HVAC).
- Summit's core differentiator (audit trail, UNRESOLVED workflow) is proven in HVAC first. Diluting build effort across disciplines before HVAC is fully mature (see `PHASE.md` for current V1 completion status) would risk shipping multiple shallow modules instead of one deep, defensible one.
- Phase 6 (role-based knowledge-base docs — architect/engineer/designer/drafter standards, the original ask that started the current 6-phase completion plan) is itself HVAC-scoped reference documentation, not a step toward this expansion — don't conflate the two when scoping Phase 6.

## 5. How to use this document

- When scoping any future phase, check whether it's extending HVAC depth (in scope, business as usual) or platform breadth toward another discipline (this document — needs its own dedicated scoping session, business-model validation, and almost certainly a fresh calculation-engine build comparable in effort to Manual J/D/S).
- This file should be updated, not left stale, if/when the business actually decides to pursue any discipline above — replace the relevant bullet in §3 with a real scope (target discipline, calculation standard to follow, MVP feature set) rather than adding implementation notes here piecemeal.
