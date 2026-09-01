-- Strict in-order pipeline + explicit finalization (FIX-PIPELINE).
--
-- Two nullable columns and a non-destructive backfill. No data is
-- dropped; existing in-flight projects simply re-flow through the new
-- guided stages on next load - computePipelineState (lib/pipeline.ts)
-- derives their current stage from their existing data.
--
-- 1. projects.finalized_at - set only by POST /api/projects/[id]/finalize,
--    which runs the full pipeline gate server-side and freezes
--    calculation_snapshots v1 in the same request. This is now the ONLY
--    path that freezes a first snapshot; POST /api/reports returns 409 if
--    finalized_at is null (see app/api/reports/route.ts).
--
-- 2. zones.equipment_selection_source - so stage 11's exit gate can
--    require that a zone's equipment pick has actually been confirmed or
--    overridden by a human, not left sitting at the AI's proposal.
--      'ai_proposed'     - written by the auto-propose step (rankEquipment[0])
--      'human_confirmed' - the technician Accepted the AI pick
--      'human_override'  - the technician chose a different unit (reason
--                          captured in zones.equipment_selection_notes)

alter table public.projects
  add column if not exists finalized_at timestamptz;

comment on column public.projects.finalized_at is
  'Set by POST /api/projects/[id]/finalize when the full pipeline gate passes and calculation_snapshots v1 is frozen. NULL = not finalized; POST /api/reports refuses to render (409) while NULL. The only implicit-freeze path was removed - see SUMMIT-BUILD-SEQUENCE.md.';

alter table public.zones
  add column if not exists equipment_selection_source text
    check (equipment_selection_source is null
      or equipment_selection_source = any (array['ai_proposed', 'human_confirmed', 'human_override']));

comment on column public.zones.equipment_selection_source is
  'How zones.selected_equipment_id got its value: ai_proposed (auto rankEquipment[0]), human_confirmed (technician Accepted the AI pick), human_override (technician chose a different unit). Stage 11 exit gate requires this NOT be null/ai_proposed.';

-- Backfill 1: any project that already has a calculation_snapshots row was
-- finalized under the old implicit-freeze behavior - keep it finalized, at
-- the moment its first snapshot was frozen.
update public.projects p
set finalized_at = s.created_at
from (
  select project_id, min(created_at) as created_at
  from public.calculation_snapshots
  group by project_id
) s
where s.project_id = p.id
  and p.finalized_at is null;

-- Backfill 2: any zone that already has a selected_equipment_id got it from
-- a human clicking "Select" in the old equipment UI - mark it confirmed so
-- existing finalized projects don't regress to "AI pick not confirmed".
update public.zones
set equipment_selection_source = 'human_confirmed'
where selected_equipment_id is not null
  and equipment_selection_source is null;
