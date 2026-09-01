# SUMMIT-BUILD-SEQUENCE.md — canonical residential pipeline spec

**Status:** authoritative. `lib/pipeline.ts` is the executable form of this
document. They must not drift — every pipeline change updates both, in the
same commit.

## The rule

The residential project workflow is a **strict in-order guided stepper**.
There are thirteen ordered stages. A stage is `locked` unless **every prior
stage's exit gate is `true`**. Exactly one pure function —
`computePipelineState(input: PipelineInput): PipelineState` — decides stage
status. Every consumer reads from it and none computes its own readiness:

- the stepper navigation (`components/pipeline/PipelineStepper.tsx`)
- each stage component's disabled / "Next" state
- the project-header pipeline badge
- `GET /api/projects/[id]/pipeline-state`
- `POST /api/projects/[id]/finalize`
- `POST /api/reports` and `POST /api/reports/revise` (defense-in-depth)
- `lib/reportGate.ts` (`getReportGenerationGateStatus` is now a thin adapter
  over `computePipelineState(...).stages.finalize`)

## Automation model

**Full auto-propose + review.** The AI proposes everything it can. Each
proposal is one-click **Accept** or **Override-with-reason** (recorded in
the existing `field_resolutions` audit table via `lib/aiProposals.ts`). The
technician's only from-scratch inputs are:

1. address / name / type (at project creation)
2. **the one** building-orientation compass confirmation (stage 3)
3. resolving UNRESOLVED extraction flags (stage 5)
4. the licensed sign-off (stage 16, parallel)

Everything else is an Accept or an Override.

`computePipelineState(...).canFinalize` is `false` while
`outstandingProposals > 0`, regardless of the individual stage gates.

## The ordered stages

| # | Stage (`PipelineStage`) | Human action | AI / automatic | Exit gate (unlocks next) |
|---|---|---|---|---|
| 1 | `project` | Address, name, type at creation | — | Row exists; `project_type === 'residential'` |
| 2 | `climate` | Confirm once | Auto-resolve county + design temps from address | `climate_confirmed === true` **and** a `climate_zone_reference` row with `winter_design_temp_f`, `summer_design_temp_f`, and `summer_coincident_wetbulb_f` |
| 3 | `orientation` | **Pick the front-facing compass direction — ONE TIME. The only manual orientation step in the app.** | — | `building_front_faces` set **and** cardinal (N/E/S/W). Intercardinal is allowed only with a recorded acknowledgement (`field_resolutions` `projects/<id>/orientation_intercardinal_ack`) that per-room compass walls will be entered by hand. |
| 4 | `drawings` | Upload file(s); mark exactly one floor-plan page | Extraction runs automatically per file on upload (`app/api/drawings/extract/route.ts`, unchanged) | Every drawing `extraction_status === 'completed'`; exactly one drawing has `floor_plan_page_number` set |
| 5 | `field_review` | Accept / Override every UNRESOLVED flag | — | `countUnresolvedFields(...) === 0` |
| 6 | `rooms_envelope` | Review the AI room set + envelope; edit; **Accept** | On entry: auto-apply the extraction (rooms created, blank envelope fields filled — no "Apply to Form" button); auto-run `applyOrientationTransform`; auto-draft local-exhaust `exhaust_sources` for bath/kitchen rooms | ≥1 conditioned room; `checkDataCompleteness(rooms)` clean (every room has floor area; whole-house glazing non-zero); `proposal:rooms` Accepted or Overridden |
| 7 | `zones` | Confirm the AI zoning or edit it | `proposeZoning(rooms, manualJResult)` — one zone per building level; a single small (<2500 sqft) single-level house = one zone; every conditioned room assigned | Every conditioned room has a `zone_id`; `proposal:zoning` Accepted or Overridden |
| 8 | `manual_j` | Read-only (go back to fix inputs) | `computeManualJ` — always live | Non-null result; every zone-with-rooms has `coolingTotalBtuh > 0` |
| 9 | `duct_pins` | Confirm or drag each AI-placed pin; "Confirm all" available | `proposeRoomPins` / `proposeMechanicalPins` (`lib/pinPlacement.ts`) — one pin per conditioned room from `rooms.position_*` / extraction `room_position` centre; one AHU + return + condenser pin per zone (heuristic). **Does not import `lib/pdfRoomGeometry.ts`.** | Every conditioned room (with a zone + floor area) has a resolved pin; every zone-in-use has resolved AHU / return / condenser pins (position column set or `field_resolutions` row) |
| 10 | `manual_d` | Review; Accept | Auto: derive ASP from selected equipment or documented defaults; auto-generate `duct_runs` from pins; propose diffusers, terminations, AHU install detail | Every conditioned room has a branch `duct_run`; per-zone branch CFM vs. selected equipment rated CFM within 15% (grouped by shared unit for `single_system_zoned`); `proposal:duct_design` Accepted or Overridden |
| 11 | `equipment` | Accept the AI pick per zone, or choose a different unit with a reason | Per zone (or one combined panel for `single_system_zoned`): write `rankEquipment(...)[0]` as the selection with `zones.equipment_selection_source = 'ai_proposed'` | Every zone-with-rooms has a `selected_equipment_id` whose evaluation has make/model + interpolated capacity at this project's design conditions; `equipment_selection_source` is `human_confirmed` or `human_override` (never left `ai_proposed`) |
| 12 | `ventilation` | Confirm drafts | `proposeExhaustSources` (bath/kitchen IRC minimums); `proposeMakeupAir` if exhaust exceeds threshold; `proposeDehumidification` from Manual J latent load | No `exhaust_source` left `pending_review`; `proposal:ventilation` Accepted or Overridden (a project with genuinely no exhaust/makeup-air/dehumidification is allowed — the *review* is gated, not the existence) |
| 13 | `finalize` | Read the checklist; click **Finalize Project** | The checklist is `computePipelineState` rendered; Finalize runs the gate server-side and freezes v1 | `projects.finalized_at` set; `calculation_snapshots` v1 exists |

### Terminal / parallel (not part of the strict chain)

| # | Stage | Notes |
|---|---|---|
| 14 | Reports | Download internal / client / summit-standard; version history. All render from frozen `snapshot_data`. Disabled until `pipelineState.finalized`. |
| 15 | Revision | "Create New Revision" + reason → re-runs the full gate → freezes vN+1. |
| 16 | Sign-off | Licensed reviewer attests; attaches `report_sign_offs` to a specific frozen version; rendered on the PDF. |

## Hard invariants

1. **Every stage gates the next.** `stages[N]` is `locked` unless every
   prior exit gate is `true`; `available`/`in_progress` the instant the last
   prior gate flips.
2. **No dead ends.** Every non-terminal stage has a "Next" that unlocks the
   following stage. Terminals are Reports and Sign-off only.
3. **One orientation confirmation, human, once.** `grep -rn
   "building_front_faces" components/` shows exactly one component that
   *writes* it: `components/building-orientation-gate.tsx`. Everything else
   reads it.
4. **Sections communicate.** Every stage component calls `refreshPipeline()`
   after any successful write; `computePipelineState` re-runs on the fresh
   bundle; a blocker fixed in stage N flips stage N+1 with no page reload.
5. **Finalize is the only freeze path.** `grep -rn "calculation_snapshots"
   app/api/` shows inserts only in `finalize/route.ts` and
   `revise/route.ts`. `POST /api/reports` never inserts one — it returns
   `409` if the project is not finalized.
6. **Every AI proposal is Accepted or Overridden before Finalize.**
   `canFinalize` is `false` while `outstandingProposals > 0`.
7. **This document matches `lib/pipeline.ts` stage-for-stage.**

## Migration

`supabase/migrations/20260901000000_add_pipeline_finalization.sql`:

- `projects.finalized_at timestamptz` (nullable).
- `zones.equipment_selection_source text` (nullable; `ai_proposed` |
  `human_confirmed` | `human_override`).
- Backfill: any project with a `calculation_snapshots` row →
  `finalized_at = that snapshot's created_at`; any zone with a
  `selected_equipment_id` → `equipment_selection_source = 'human_confirmed'`
  (it was a human pick under the old UI). No destructive changes.
