-- Real equipment selection for a local exhaust source, code-gated: a
-- bathroom_exhaust_fan/kitchen_range_hood exhaust_sources row can be tied
-- to a real equipment_catalog row. Unlike HVAC equipment selection
-- (Manual S ranks compatible candidates but a human still picks from the
-- full compatible list), the UI for this selection (components/makeup-
-- air-section.tsx) filters HARD to only equipment whose real published
-- CFM meets or exceeds the room's real IRC-computed requirement
-- (lib/localExhaust.ts) - never a softer "ranked but still pickable"
-- list, per explicit user instruction.
alter table public.exhaust_sources
  add column if not exists selected_equipment_id uuid references public.equipment_catalog(id);

comment on column public.exhaust_sources.selected_equipment_id is
  'Real equipment_catalog row (equipment_type = exhaust_fan) selected to satisfy this exhaust source. When set, rated_cfm/basis should reflect that real product''s own published cfm (basis = manufacturer_spec), not the code-minimum draft value. UI must only offer equipment whose real cfm meets or exceeds the room''s IRC-computed requirement - a hard filter, not a ranking.';
