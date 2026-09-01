# IMPLEMENTATION PROMPT — Strict In-Order Pipeline + Full Auto-Propose/Review (Residential)

Paste this whole file as the task for a fresh session. It is self-contained; you do
not need prior chat history. Read the files named in **Context** first.

---

## Context — read these before writing any code

1. `/CLAUDE.md` — project overview + Development Protocol (follow it: update `PHASE.md` /
   `SESSION-PROGRESS.md`, run the full verification suite, commit + push real checkpoints).
2. `/PIPELINE-SEQUENCE-AUDIT.md` — the forensic trace of the current residential pipeline
   (S0–S16) and the eight flagged problems (Findings A–H). **This prompt exists to fix
   every one of them.**
3. `/REFERENCE-DOCS/SUMMIT-REPORT-STANDARD.md` §3 — the current report-generation gate
   conditions. They stay; they get moved into one shared state machine and enforced
   everywhere, not just on the first `summit_standard` download.
4. Current pipeline code surface: `app/dashboard/[id]/page.tsx`, `components/project-workspace.tsx`,
   `components/manual-j-workflow.tsx`, `components/building-orientation-gate.tsx`,
   `components/building-orientation-section.tsx`, `components/drawings-section.tsx`,
   `components/duct-design-section.tsx`, `components/duct-routing-canvas.tsx`,
   `components/equipment-selection-section.tsx`, `components/generate-reports-button.tsx`,
   `components/report-generation-gate.tsx`, `lib/reportGate.ts`, `lib/reportData.ts`,
   `lib/orientation.ts`, `lib/fieldResolutions.ts`, `app/api/reports/route.ts`,
   `app/api/reports/revise/route.ts`, `app/api/reports/gate-status/route.ts`,
   `app/api/drawings/extract/route.ts`.

**Out of scope, do not touch:** the uncommitted changes in `lib/pdfRoomGeometry.ts`
(a paused vector-geometry experiment). Leave them in the working tree or `git stash`
them — do not build on them, do not commit them. Commercial / industrial
(`components/commercial-workflow.tsx`) is a separate branch and is **not** part of this
pass; the new stepper must detect a non-residential project and render the existing
`CommercialWorkflow` unchanged with a visible "Commercial pipeline not yet migrated to
the guided flow" note.

---

## Decisions already made (do not re-litigate)

| Question | Decision |
|---|---|
| UI enforcement | **Guided stepper.** One screen, numbered progress rail, stage N locked until stage N-1 is verified complete. Back always allowed, Next gated. No skipping, no dead ends. |
| Automation scope | **Full auto-propose + review.** AI proposes everything it can (rooms, envelope, zoning, duct pin locations, duct design, equipment selection per zone, exhaust/dehumidification drafts). Each proposal is one-click **Accept** or **Override-with-reason** (recorded via the existing `field_resolutions` audit mechanism). The human's only from-scratch inputs: address (at creation), the **one** orientation confirmation, resolving UNRESOLVED extraction flags, and the licensed sign-off. |
| Finalization | **Explicit Finalize action.** A "Finalize Project" button runs the full gate and freezes `calculation_snapshots` v1. **No report download ever freezes implicitly.** All report types require an existing snapshot. Revisions re-run the gate. |
| Scope | **Residential only** this pass. |

---

## The rule you are implementing

Create `/SUMMIT-BUILD-SEQUENCE.md` as the canonical, versioned spec for the residential
pipeline. It defines the ordered stages below, and for **each** stage: its purpose, what
it reads, what it writes, its **entry gate** (what must be true to unlock it) and its
**exit gate** (what must be true to leave it / unlock the next). The code
(`lib/pipeline.ts`, below) is the executable form of this document; they must not drift.
Every future pipeline change updates both.

### The ordered stages (residential)

| # | Stage | Human action | AI / automatic | Exit gate (unlocks next) |
|---|---|---|---|---|
| 1 | **Project** | Address, name, type (at creation) | — | Row exists, `project_type === 'residential'` |
| 2 | **Climate** | Confirm once | Auto-resolve county + design temps from address (geocoder + `climate_zone_reference`) | `climate_confirmed === true` **and** a `climate_zone_reference` row with `winter/summer_design_temp_f` and `summer_coincident_wetbulb_f` exists |
| 3 | **Orientation** | **Pick front-facing compass direction — ONE TIME. This is the only manual orientation step in the entire app.** | — | `building_front_faces` set **and** cardinal (N/E/S/W). If the tech genuinely needs an intercardinal building, they must acknowledge that per-room compass wall data will be entered by hand — record that acknowledgement; then it may pass. |
| 4 | **Drawings** | Upload file(s); mark exactly one floor-plan page | Extraction runs automatically per file on upload (unchanged pipeline in `app/api/drawings/extract/route.ts`) | Every uploaded drawing has `extraction_status === 'completed'`; exactly one drawing has `floor_plan_page_number` set |
| 5 | **Field Review** | Accept / Override every UNRESOLVED flag | — | `countUnresolvedFields(...) === 0` |
| 6 | **Rooms & Envelope** | Review the AI-proposed room set + envelope; edit if needed; **Accept** | On entry: auto-apply the extraction (rooms created, blank envelope fields filled — no "Apply to Form" button). Auto-run the wall-orientation rotation transform (from stage 3's direction). Auto-draft local-exhaust `exhaust_sources` for bath/kitchen rooms. | ≥1 conditioned room; every room has `floor_area_sqft`; whole-house glazing non-zero (reuse `checkDataCompleteness`); the room-set proposal is Accepted or Overridden |
| 7 | **Zones** | Confirm the AI-proposed zoning or edit it | `proposeZoning(rooms, manualJResult)` — default heuristic: one zone per building level; a single small (<~2500 sqft) single-level house = one zone. Assign every conditioned room to a zone. | Every conditioned room has a `zone_id`; the zoning proposal is Accepted or Overridden |
| 8 | **Manual J** | (read-only — go back to fix inputs if wrong) | `computeManualJ` — always live | Non-null result; every zone with rooms has `coolingTotalBtuh > 0` |
| 9 | **Duct Routing Pins** | Confirm or drag each AI-placed pin; "Confirm all" available | `proposeRoomPins(rooms, floorPlanDrawing)` pre-places one pin per conditioned room (from `room_position` centre / extraction data — **not** dependent on the paused polygon work) and one AHU + one return + one condenser pin per zone (heuristic placement). | Every conditioned room + every zone AHU/return/condenser pin is resolved (has a `field_resolutions` `accepted`/`overridden` row) |
| 10 | **Manual D** | Review; Accept | Auto: derive ASP inputs from the (stage-11) selected equipment or documented defaults; auto-generate `duct_runs` from pins (existing `handleAutoGenerateFromPins` logic, now automatic on entry); `proposeDiffusers` per room; propose terminations + AHU install detail. | Every conditioned room has a branch `duct_run`; per-zone branch CFM vs. selected equipment rated CFM within 15% (existing `reportGate.ts` logic, grouped by shared unit for `single_system_zoned`); the duct-design proposal is Accepted or Overridden |
| 11 | **Equipment (Manual S)** | Accept the AI pick per zone, or choose a different unit with a reason | Per zone (or one combined panel for `single_system_zoned`): write `rankEquipment(...)[0]` — the top-ranked compatible unit, preferred-manufacturer-aware — as the selection with `equipment_selection_source = 'ai_proposed'`. | Every zone-with-rooms has a `selected_equipment_id` whose evaluation has make/model + interpolated capacity at this project's design conditions; the selection is Accepted or Overridden (never left `ai_proposed`) |
| 12 | **Ventilation & Dehumidification** | Confirm drafts | `proposeExhaustSources` (bath/kitchen IRC minimums — already exists), `proposeMakeupAir` if exhaust exceeds the threshold, `proposeDehumidification` from Manual J latent load. | Every draft `exhaust_source` / makeup-air / dehumidification proposal is Accepted or Overridden (a project with genuinely none is allowed — the *review* is what's gated, not the existence) |
| 13 | **Review & Finalize** | Read the full checklist; click **Finalize Project** | The checklist is `computePipelineState` rendered; Finalize runs the gate server-side and freezes v1 | `finalized_at` set; `calculation_snapshots` v1 exists |
| 14 | **Reports** | Download internal / client / summit-standard; view version history | All render from frozen `snapshot_data` | — (terminal) |
| 15 | **Revision** (re-enters at 13) | Click "Create New Revision", give a reason | Re-runs the full gate; freezes vN+1 | New snapshot version exists |
| 16 | **Sign-off** (parallel to 14) | Licensed reviewer attests | Attaches `report_sign_offs` to a specific frozen version; rendered on the PDF | — |

**Strict-order guarantee:** a stage is `locked` unless every prior stage's exit gate is
`true`. There is exactly one function that decides this (`computePipelineState`), and
every consumer — the stepper nav, each stage component's disabled state, the header
badge, `/api/reports/*`, the Finalize route — reads from it. No component computes its
own readiness.

---

## Architecture to build

### 1. `lib/pipeline.ts` — the single source of truth (pure, fully unit-tested)

```ts
export const PIPELINE_STAGES = [
  "project","climate","orientation","drawings","field_review","rooms_envelope",
  "zones","manual_j","duct_pins","manual_d","equipment","ventilation","finalize",
] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];

export type StageStatus = "locked" | "available" | "in_progress" | "complete";

export type StageState = {
  stage: PipelineStage;
  status: StageStatus;
  blockers: string[];          // human-readable, specific ("Kitchen has no floor area")
  entryGateMet: boolean;
  exitGateMet: boolean;
};

export type PipelineState = {
  stages: Record<PipelineStage, StageState>;
  currentStage: PipelineStage;  // first non-complete stage
  canFinalize: boolean;
  finalized: boolean;
  outstandingProposals: number; // AiProposals not yet Accepted/Overridden
};

// ONE pure function. Input = a plain data bundle (see PipelineInput), no Supabase client.
export function computePipelineState(input: PipelineInput): PipelineState;
```

- `PipelineInput` is a plain object: project row, rooms, zones, drawings (+extracted_data),
  field_resolutions, duct_runs, duct_diffusers, zone equipment evaluations, manualJ result,
  ai_proposals, latestSnapshot. Assemble it once (server) from the queries
  `app/dashboard/[id]/page.tsx` already runs, plus a helper `buildPipelineInput(supabase, projectId)`.
- Each stage's entry gate = "all prior exit gates met". Each exit gate = a predicate over
  `PipelineInput` implementing the table above. Keep each predicate a small named function
  (`climateExitGate(input)`, etc.) so tests target them directly.
- `lib/reportGate.ts`'s `getReportGenerationGateStatus` becomes a thin adapter:
  `computePipelineState(input).stages.finalize` → `{ canGenerate, blockers }`. Do not
  duplicate its logic; move each check into the corresponding stage predicate.

### 2. `lib/aiProposals.ts` — the Accept/Override pattern

- Reuse `field_resolutions` — do **not** invent a new table. A proposal is identified by
  `resolutionKey(tableName, recordId, fieldName)` with a `field_name` namespace like
  `proposal:zoning`, `proposal:equipment[<zoneId>]`, `proposal:room_pin[<roomId>]`,
  `proposal:duct_design`, `proposal:rooms`, `proposal:diffusers`, `proposal:exhaust`.
- `type AiProposal<T> = { key: string; proposed: T; provenance: string; status: "pending" | "accepted" | "overridden"; finalValue: T | null; reason: string | null }`.
- Helpers: `proposalStatus(resolvedKeys, key)`, `countOutstandingProposals(input)`,
  `acceptProposal(...)` / `overrideProposal(...)` (thin wrappers over the existing
  `field_resolutions` insert). An **Override** requires a non-empty reason, exactly like
  the current `FieldResolutionBadge` override.
- A stage's exit gate that involves a proposal checks `proposalStatus(...) !== "pending"`.

### 3. New proposal generators (pure where possible)

- `lib/zoning.ts` → `proposeZoning(rooms, manualJResult): { zones: {name,ahu_label}[], roomZoneMap: Record<roomId, zoneIndex> }`.
- `lib/pinPlacement.ts` → `proposeRoomPins(rooms, drawing)`, `proposeAhuPin(zone, rooms, drawing)`,
  `proposeReturnPin`, `proposeCondenserPin`. Use `rooms.position_x_norm/y_norm` when present,
  else the extraction's `room_position` bbox centre, else the drawing centre with the pin
  flagged low-confidence. **Must not import `lib/pdfRoomGeometry.ts`.**
- Equipment: the proposal is literally `rankEquipment(evaluations)[0]` per zone — reuse
  `lib/manualS.ts` and `selectTopEquipmentByManufacturer`. No new ranking logic.
- `lib/dehumidification.ts` already has the pieces for a dehumidification proposal from
  latent load — wire a `proposeDehumidification(manualJResult, rooms)` around it.
- Local-exhaust drafting (`createDraftLocalExhaustSources`) already exists — call it from
  the Rooms stage's auto-apply instead of from `applyExtractedData`.

### 4. Orientation deduplication

- Keep `components/building-orientation-gate.tsx` as the **stage 3** component — this is
  the one and only human orientation confirmation. Tidy its copy.
- **Delete the confirmation UI from `components/building-orientation-section.tsx`.**
  Extract its wall-rotation logic into `lib/orientation.ts`:
  `export async function applyOrientationTransform(supabase, projectId, rooms, buildingFrontFaces, resolvedKeys): Promise<{ updated: RoomRow[]; blocked: string[] }>`
  (the existing `isTransformApplicable` → `resolveOrientation` → per-room
  `roomHasUnresolvedWallOrientation` guard → `applyOrientationToRoom` → `rooms.update` loop).
- Call `applyOrientationTransform` **automatically** as part of the Rooms & Envelope
  stage's auto-apply (after rooms exist and their wall-orientation flags are resolved) and
  again automatically whenever a wall-orientation `field_resolution` is added in Field
  Review. No button.
- The per-drawing ReviewPanel "Orientation detected / not found" box: keep as read-only
  info, reword to "Compass orientation supplied by technician: front faces {X}" (it is
  always known now).
- Net: `building_front_faces` is written in exactly one place by a human (stage 3);
  everything downstream reads it.

### 5. Client wiring — `components/pipeline/`

- `PipelineProvider.tsx` — React context holding the current `PipelineState` + the raw
  data bundle. Exposes `refreshPipeline()` which re-fetches from
  `GET /api/projects/[id]/pipeline-state` (new thin route: `buildPipelineInput` →
  `computePipelineState` → JSON) and updates context. **Every stage component calls
  `refreshPipeline()` immediately after any successful write.** This is what makes
  sections communicate — one shared state, recomputed on every mutation, no reloads.
- `PipelineStepper.tsx` — the numbered rail + the active stage's body. Renders stage N's
  component only when `stages[N].status !== "locked"`; shows locked stages greyed with
  their blocker list; "Next" enabled only when `stages[current].exitGateMet`.
- One wrapper per stage (`climate-stage.tsx`, `orientation-stage.tsx`, …) that renders the
  **existing** section component (`ConfirmClimateButton`, `BuildingOrientationGate`,
  `DrawingsSection`, the split-out pieces of `ManualJWorkflow`, `DuctDesignSection`,
  `DuctRoutingCanvas`, `EquipmentSelectionSection`, `MakeupAirSection`,
  `DehumidificationSection`) inside the stepper frame, with an "Accept AI proposal" /
  "Override" affordance where the stage has a proposal, and a "Next" button bound to the
  exit gate.
- `components/project-workspace.tsx` → becomes `<PipelineProvider><PipelineStepper/></PipelineProvider>`
  for residential; renders `CommercialWorkflow` unchanged otherwise.
- `components/manual-j-workflow.tsx` → break its 1,900-line render into the stage bodies
  (Rooms & Envelope, Zones, Manual J read-only, Manual D, Equipment). Keep the calc memos.
  Remove the `<BuildingOrientationSection>` render. "Apply to Form" is gone (auto-apply).
- `components/report-generation-gate.tsx` → delete its own `useEffect` fetch; read
  `PipelineState` from context.
- `components/generate-reports-button.tsx` → split into:
  - **Finalize stage:** the checklist (from context) + a "Finalize Project" button →
    `POST /api/projects/[id]/finalize`.
  - **Reports stage:** the three download buttons + version history, all disabled until
    `pipelineState.finalized`.
- `app/dashboard/[id]/page.tsx` → fetch the bundle once, hand it to `PipelineProvider`.
  Move `MakeupAirSection` (currently rendered above `ProjectWorkspace` — out of order) and
  `ReportSignOffSection` and `StalenessBanner` into their correct stages.

### 6. Server routes

- **New** `app/api/projects/[id]/pipeline-state/route.ts` (GET) — `buildPipelineInput` →
  `computePipelineState` → JSON. Auth + RLS via the user session as everywhere else.
- **New** `app/api/projects/[id]/finalize/route.ts` (POST) — `computePipelineState`; if
  `!canFinalize` → `422 { blockers }`. Else `getReportData` + `attachFrozenImages` →
  insert `calculation_snapshots` v1 → set `projects.finalized_at = now()`. Idempotent
  (a project already finalized returns its existing v1).
- `app/api/reports/route.ts` — **remove the snapshot auto-create branch** from
  `getOrCreateSnapshot`. If no snapshot exists → `409 { error: "Project not finalized —
  click Finalize Project first." }`. Keep the gate re-check as defense-in-depth for all
  three types (cheap: `computePipelineState`), but the primary enforcement is now "must be
  finalized".
- `app/api/reports/revise/route.ts` — before inserting vN+1, run `computePipelineState`;
  `422 { blockers }` if `!canFinalize`.
- `app/api/reports/gate-status/route.ts` — return the full `PipelineState` (keep the
  route; the client no longer calls it directly but keep it for parity / external use, or
  fold it into the new `pipeline-state` route and delete this one — your call, just don't
  leave two routes doing the same thing).

### 7. Migration

`supabase/migrations/<ts>_add_pipeline_finalization.sql`:
- `projects.finalized_at timestamptz` (nullable).
- `zones.equipment_selection_source text` (nullable; `'ai_proposed'` | `'human_confirmed'` |
  `'human_override'`) — so stage 11's exit gate can require it not be `ai_proposed`.
- Backfill: any project that already has a `calculation_snapshots` row →
  `finalized_at = that snapshot's created_at` (existing finalized projects stay finalized).
  Any zone with a `selected_equipment_id` today → `equipment_selection_source = 'human_confirmed'`
  (it was a human pick under the old UI).
- No destructive changes. Existing in-flight projects simply re-flow through the new gates
  on next load — `computePipelineState` derives their current stage from their data.

---

## Hard requirements ("don't give me a product with it incomplete")

1. **Every stage gates the next.** Write a test per adjacent pair proving stage N+1 is
   `locked` while stage N's exit gate is false, and `available` the instant it flips.
2. **No dead ends.** Every stage either has a Next that unlocks the following stage, or is
   a documented terminal (Reports, Sign-off). No component renders a button that does
   nothing, and no stage can be reached that has no way forward. Grep for and remove every
   now-orphaned handler (`applyExtractedData`'s "Apply" path, `BuildingOrientationSection`'s
   `handleApply`, `report-generation-gate.tsx`'s fetch, the auto-snapshot branch).
3. **One orientation confirmation, human, once.** After this change, `grep -rn
   "building_front_faces" components/` shows exactly one component writing it
   (`building-orientation-gate.tsx`). Every other reference is a read.
4. **Sections communicate.** Prove it: a test (or a scripted live run) where resolving the
   last blocker in stage 10 flips stage 11 to `available` in the same `PipelineState`
   recompute with no page reload.
5. **Finalize is the only freeze path.** `grep -rn "calculation_snapshots" app/api/` shows
   inserts only in `finalize/route.ts` and `revise/route.ts`. `/api/reports/route.ts` never
   inserts one.
6. **Every AI proposal is Accepted or Overridden before Finalize.** `computePipelineState`
   `.canFinalize` is false while `outstandingProposals > 0`. Test it.
7. **`SUMMIT-BUILD-SEQUENCE.md` exists**, matches `lib/pipeline.ts` stage-for-stage, and is
   referenced from `CLAUDE.md`.
8. Verification, per `CLAUDE.md` Development Protocol — all of:
   - `npx tsc --noEmit` clean
   - `npm run lint` clean
   - `npm test` — full suite green, with real new coverage for `computePipelineState`
     (every stage predicate + every adjacent-pair transition), `proposeZoning`,
     `proposeRoomPins`, `applyOrientationTransform`, the finalize route's gate.
   - `npm run build` — clean production build
   - **A real end-to-end run** on a fresh residential project against the live dev server:
     create → climate → orientation (once) → upload a real drawing → resolve UNRESOLVED →
     accept rooms → accept zoning → pins → accept duct design → accept equipment → accept
     ventilation → Finalize → download the summit-standard PDF → create a revision. Confirm
     each stage was locked until the prior one completed, the orientation question appeared
     exactly once, and the final PDF is complete. Record the result (not "should work").
9. Update `PHASE.md` and `SESSION-PROGRESS.md`. Commit in reviewable slices (pipeline
   core + tests → orientation dedup → stage components → finalize/report routes →
   migration + backfill → e2e verification), push each per the standing push instruction.

## If you get stuck / find a real decision

The project owner is available — ask. Specifically flag (don't guess) if: a proposal
generator needs real engineering data that isn't in the catalog; the zoning heuristic is
ambiguous for a real project; or an existing project's data can't be cleanly mapped to a
stage by `computePipelineState`.

---

## Definition of done

A field tech opens a new residential project and is walked through one screen, one stage
at a time, unable to skip or stall. They confirm the building's orientation exactly once.
Everything else is an AI proposal they Accept or Override with a reason. They cannot
Finalize until every proposal is resolved and every gate is green. They cannot download a
report until the project is Finalized. A revision re-checks everything. No section is a
dead end; every section's state is visible to every other section through one shared
pipeline state.
