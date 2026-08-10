-- SECTION 3 (gap-closure spec): UNRESOLVED field review workflow.
-- Prerequisite for Section 2 (ducts) per the spec's stated order.
--
-- Design decisions made where the spec's schema (given as a description,
-- not literal DDL) had to be reconciled against how AI extraction actually
-- works in this app - flagged here rather than guessed silently:
--
-- 1. table_name/record_id for the two kinds of UNRESOLVED badge that exist
--    today (see lib/drawingExtraction.ts + components/drawings-section.tsx):
--      a) building_envelope fields (wall/ceiling/floor R-value, window_type,
--         window_count, foundation_type) -> table_name='projects',
--         record_id=projects.id. This is the real target table, though only
--         3 of these 6 fields (the R-values) are actually ever copied to a
--         projects column by "Apply to Form" today - window_type/count and
--         foundation_type are extracted and displayed but were never wired
--         to any persisted column, a pre-existing gap in the extraction
--         pipeline, not something this migration fixes.
--      b) per-room unresolved flags -> table_name='drawings',
--         record_id=drawings.id, field_name='room[<index>]' (matching the
--         exact string format collectUnresolvedItems already produces).
--         NOT table_name='rooms': an extracted room has no stable, reliable
--         mapping to a real rooms.id - room records are only created once,
--         conditionally (only if the project had zero rooms when "Apply to
--         Form" ran - see applyExtractedData in manual-j-workflow.tsx), and
--         a drawing can be re-reviewed after that point with no surviving
--         index->room correspondence. Resolving "this extraction's
--         ambiguity about room N" is a property of the drawing record, not
--         a hypothetical rooms row.
--
-- 2. No CHECK constraint on table_name - kept as a free label since which
--    tables this can point to may grow (e.g. once Section 2/ducts adds its
--    own AI-assisted fields), unlike resolution_type below which is a
--    real fixed enum.
--
-- 3. resolved_by references public.profiles(id), not auth.users(id)
--    directly - matches the exact pattern already used by
--    drawings.uploaded_by (checked live before writing this).
--
-- 4. No unique constraint on (table_name, record_id, field_name): this is
--    an append-only audit trail per the spec's own framing ("this is the
--    audit trail"), not a single mutable status row - re-resolving a field
--    (e.g. after a correction) adds a new row rather than overwriting
--    history. "Current" status for a field is the most recent row for that
--    (project_id, table_name, record_id, field_name) tuple.
create table if not exists public.field_resolutions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  field_name text not null,
  ai_extracted_value text,
  final_value text,
  resolution_type text not null check (resolution_type = any (array['accepted', 'overridden'])),
  -- Belt-and-suspenders: the spec asks for this to be enforced at the
  -- application level (and the UI does), but a DB constraint costs nothing
  -- and prevents bad rows from any future write path that isn't the UI.
  override_reason text,
  constraint field_resolutions_override_reason_required
    check (resolution_type <> 'overridden' or (override_reason is not null and length(trim(override_reason)) > 0)),
  resolved_by uuid not null references public.profiles(id) on delete restrict,
  resolved_at timestamp with time zone not null default now()
);

create index if not exists field_resolutions_lookup_idx
  on public.field_resolutions (project_id, table_name, record_id, field_name, resolved_at desc);

alter table public.field_resolutions enable row level security;

-- Mirrors the exact "Access X via project access" pattern used by
-- hvac_zones and rooms (checked live before writing this).
create policy "Access field resolutions via project access"
on public.field_resolutions
for all
using (
  exists (
    select 1 from public.projects
    where projects.id = field_resolutions.project_id
      and projects.org_id = public.get_my_org_id()
      and (
        public.get_my_role() = any (array['admin', 'estimator'])
        or projects.created_by = auth.uid()
      )
  )
);
