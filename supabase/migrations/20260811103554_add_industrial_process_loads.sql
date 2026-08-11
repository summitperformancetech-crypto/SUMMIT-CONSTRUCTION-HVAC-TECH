-- PHASE 6: Industrial module - a generalized, extensible process-load
-- framework rather than hardcoded per-industry logic. Industrial loads
-- (process cooling/heating, paint-booth/welding makeup air and exhaust,
-- cleanroom ACH) vary too much to hardcode formulas for without seeing
-- real project types - what's actually needed is a clean way for a tech
-- to enter field-measured or manufacturer-spec loads directly (a specific
-- oven, a specific exhaust hood), same data-driven philosophy the rest of
-- this schema already uses (zones, room_type_defaults, etc. are all data,
-- not hardcoded per-case branches).
--
-- Industrial projects reuse the same zones table commercial projects use
-- (already has envelope/ventilation columns from
-- 20260811080124_add_commercial_manual_n.sql and
-- 20260811084255_add_commercial_zone_envelope_fields.sql) rather than a
-- parallel table - an industrial building still has walls, a roof, and
-- outdoor-air requirements, so lib/manualIndustrial.ts reuses
-- lib/manualN.ts's envelope/ventilation calc directly and only adds the
-- process_loads summation on top.
alter table public.zones
  add column if not exists cleanroom_class text;

create table if not exists public.process_loads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete set null,
  load_type text not null
    check (load_type = any (array['process_sensible', 'process_latent', 'makeup_air', 'exhaust', 'cleanroom_ach'])),
  description text not null,
  sensible_btu_hr numeric,
  latent_btu_hr numeric,
  cfm numeric,
  ach_required numeric,
  source text not null
    check (source = any (array['field_measured', 'manufacturer_spec', 'engineering_estimate'])),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.process_loads enable row level security;

-- Same "access via project access" pattern as rooms/zones/drawings/
-- duct_runs (see migration 20260811030304_fix_duct_runs_rls.sql for why
-- this specific pattern matters - a to-authenticated-using-true policy on
-- a project-scoped table is a real cross-org data leak, not a shortcut).
create policy "Access process_loads via project access" on public.process_loads
  for all
  using (
    exists (
      select 1 from public.projects
      where projects.id = process_loads.project_id
        and projects.org_id = public.get_my_org_id()
        and (
          public.get_my_role() = any (array['admin', 'estimator'])
          or projects.created_by = auth.uid()
        )
    )
  );
