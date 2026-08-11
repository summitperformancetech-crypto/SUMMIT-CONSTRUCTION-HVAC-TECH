-- Phase 2 code review item #6: window_type and window_count were already
-- part of the drawing-extraction schema (ExtractedEnvelope in
-- lib/drawingExtraction.ts) and shown in the review panel as UNRESOLVED
-- fields a tech can Accept/Override - but unlike wall/ceiling/floor R-value
-- and foundation_type (same extraction batch), there were no real columns
-- for either to land on. Accepting one only wrote a field_resolutions audit
-- row that nothing ever read back. Same pattern as foundation_type's
-- column (see migration 20260810210059_add_ducts.sql) - project-level, not
-- per-room, since the extraction only reports one building_envelope object
-- per drawing, not per-room window data.
alter table public.projects
  add column if not exists window_type text,
  add column if not exists window_count integer;
