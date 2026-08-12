-- Data Integrity Addendum, Section 1: calculation snapshotting. Once a
-- project's first PDF report is generated, the exact resolved numbers used
-- (Manual J/D/S/N results, equipment capacity, duct sizes, climate design
-- temps, code minimums applied - literally everything lib/reportData.ts's
-- getReportData() aggregates) are frozen into this table and never
-- recomputed from the live reference tables again for that project's
-- reports, even after equipment_catalog/climate_zone_reference/
-- duct_sizing_tables/room_type_defaults/duct_insulation_code_minimums are
-- later updated. This is the fix for the addendum's core problem: without
-- it, updating shared reference data could silently change the numbers on
-- a project already delivered to a client or code official.
--
-- Design decisions:
-- 1. snapshot_data stores the real resolved ReportData JSON (see
--    lib/reportData.ts), not references to the live tables - this is what
--    makes it immune to later reference-data edits. Every value in that
--    type is a plain string/number/null/array/object (no Map/undefined),
--    so it round-trips through jsonb cleanly.
-- 2. version + reason: an append-only history, not a single mutable row.
--    version 1 is created automatically the first time Generate Reports
--    runs (reason null - that's finalization, not a "revision"). version
--    2+ only via an explicit "Create New Revision" action with a required
--    reason (see app/api/reports/revise/route.ts) - never a silent
--    background recalculation, per the addendum's explicit instruction.
-- 3. No update/delete policy - snapshots are immutable once written,
--    matching field_resolutions' append-only audit-trail philosophy (see
--    20260810195313_add_field_resolutions.sql).
-- 4. created_by references public.profiles(id), not auth.users(id) -
--    matches the exact pattern field_resolutions.resolved_by already uses.
create table if not exists public.calculation_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version > 0),
  snapshot_data jsonb not null,
  reason text,
  constraint calculation_snapshots_reason_required_after_v1
    check (version = 1 or (reason is not null and length(trim(reason)) > 0)),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

-- Covers "give me the latest snapshot for this project" - the only lookup
-- the app ever does (app/api/reports/route.ts, app/api/reports/revise/
-- route.ts, and the page.tsx status display).
create index if not exists calculation_snapshots_latest_idx
  on public.calculation_snapshots (project_id, version desc);

alter table public.calculation_snapshots enable row level security;

-- Same "Access X via project access" pattern as field_resolutions/
-- process_loads/duct_runs (post-fix) - checked live before writing this.
create policy "Access calculation_snapshots via project access (select)"
on public.calculation_snapshots
for select
using (
  exists (
    select 1 from public.projects
    where projects.id = calculation_snapshots.project_id
      and projects.org_id = public.get_my_org_id()
      and (
        public.get_my_role() = any (array['admin', 'estimator'])
        or projects.created_by = auth.uid()
      )
  )
);

create policy "Access calculation_snapshots via project access (insert)"
on public.calculation_snapshots
for insert
with check (
  exists (
    select 1 from public.projects
    where projects.id = calculation_snapshots.project_id
      and projects.org_id = public.get_my_org_id()
      and (
        public.get_my_role() = any (array['admin', 'estimator'])
        or projects.created_by = auth.uid()
      )
  )
);
