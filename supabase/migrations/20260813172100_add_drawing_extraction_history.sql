-- Phase 2 data-integrity requirement: every extracted fact needs a clear
-- who/what/when/where/why. Who/what/where were already covered (accept/
-- override audit trail, typed fields, source_sheet on ExtractedField<T>).
-- "When" had a real gap: re-extraction overwrites drawings.extracted_data
-- wholesale, so a prior run's facts - and any timestamp on them - are gone
-- with no trail. This bit directly, in-session: an earlier extraction run's
-- raw JSON was already overwritten by the time it needed to be compared
-- against a fresh one, and there was no way to recover it.
--
-- Two parts:
-- 1. drawings.extraction_completed_at - a denormalized "latest" pointer,
--    set in the same code path as the history insert below, so common
--    reads ("when was this last extracted") don't need a join.
-- 2. drawing_extraction_history - the actual trail. Every successful
--    extraction (app/api/drawings/extract/route.ts) inserts a row here in
--    addition to updating drawings, so a later "what did the previous
--    extraction actually say" question always has an answer.
--
-- project_id is denormalized onto this table directly (not resolved via a
-- join through drawings) to match the existing field_resolutions RLS
-- pattern exactly - same shape, same access-control functions, same
-- fallback logic, not a new pattern invented for this table.
alter table public.drawings
  add column if not exists extraction_completed_at timestamptz;

create table public.drawing_extraction_history (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references public.drawings(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  extracted_data jsonb not null,
  unresolved_items text[],
  extraction_completed_at timestamptz not null default now()
);

create index on public.drawing_extraction_history (drawing_id, extraction_completed_at desc);

alter table public.drawing_extraction_history enable row level security;

create policy "Access drawing extraction history via project access"
on public.drawing_extraction_history
for all
using (
  exists (
    select 1 from public.projects
    where projects.id = drawing_extraction_history.project_id
      and projects.org_id = public.get_my_org_id()
      and (
        public.get_my_role() = any (array['admin', 'estimator'])
        or projects.created_by = auth.uid()
      )
  )
);
