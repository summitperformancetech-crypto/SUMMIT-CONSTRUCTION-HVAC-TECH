-- Permit-Submittable Manual D Package, Section 3 (auditable per-segment
-- calculation trail) and Section 7 (licensed sign-off gate).
--
-- total_effective_length_ft/pressure_drop_iwc are NOT new inputs - they
-- are the same length_ft + fitting_equivalent_length_ft and
-- frictionRate * totalEffectiveLengthFt/100 math lib/manualD.ts's
-- sizeDuctRun already performs every time it sizes a run, just never
-- persisted as their own queryable columns before now. Written back the
-- same way calculated_diameter_in/velocity_fpm already are (see
-- components/duct-design-section.tsx's persistRunSnapshot) - a real
-- computed-and-stored audit record per segment, not a new calculation.
alter table public.duct_runs
  add column if not exists total_effective_length_ft numeric,
  add column if not exists pressure_drop_iwc numeric;

-- Licensed sign-off gate. One row per project (a project can be re-signed
-- if the design changes materially after a prior sign-off - superseded
-- rows are kept, not deleted, for a real audit history). Deliberately
-- NOT a boolean on projects - a signature needs a name, a license
-- number, and a timestamp to mean anything; "signed: true" with no
-- attribution would be worse than no gate at all.
create table if not exists public.report_sign_offs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  calculation_snapshot_version integer not null,
  reviewer_name text not null,
  reviewer_license_number text not null,
  reviewer_license_type text,
  signed_by uuid not null references auth.users(id),
  signed_at timestamptz not null default now(),
  superseded_at timestamptz,
  superseded_reason text,
  created_at timestamptz not null default now()
);

alter table public.report_sign_offs enable row level security;

-- Same "Access via project access" pattern as every other project-scoped
-- table - see rooms/zones/duct_diffusers policies. Insert restricted to
-- admin/estimator (the roles this app already treats as authorized to
-- finalize project data), matching the role split used for
-- equipment_org_preferences' admin-only write.
create policy "Access report_sign_offs via project access"
on public.report_sign_offs for select using (
  exists (
    select 1 from public.projects
    where projects.id = report_sign_offs.project_id
      and projects.org_id = public.get_my_org_id()
  )
);
create policy "Create report_sign_offs via project access"
on public.report_sign_offs for insert with check (
  exists (
    select 1 from public.projects
    where projects.id = report_sign_offs.project_id
      and projects.org_id = public.get_my_org_id()
      and (public.get_my_role() = any (array['admin', 'estimator']) or projects.created_by = auth.uid())
  )
);
