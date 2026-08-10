-- PHASE 1: Doors as a distinct load component. door_u_value lives on
-- projects (not rooms) to stay consistent with every other envelope U/R
-- value in this schema (wall_insulation_r_value, window_u_value, etc. are
-- all project-level uniform assumptions applied to every room). door_count
-- already exists on rooms.
--
-- Default 0.35 Btuh/(hr-ft2-F): within the 0.20-0.40 "typical insulated
-- door" range given for this feature, and consistent with a real ACCA
-- Manual J report reviewed for this work, where reverse-calculating the
-- Doors heating row (648 Btuh / 34 F design TD / ~49.5 sqft door area)
-- implies an as-modeled door U-value of ~0.385. Still a chosen default, not
-- a measured value for any specific door product - flagged.
alter table public.projects
  add column if not exists door_u_value numeric not null default 0.35;

-- PHASE 2: ASHRAE 62.2 fresh-air ventilation needs a bedroom count per the
-- standard's Nbr term. Rather than a single manual project-level number,
-- track it per room (is_bedroom) so it can later be summed per zone
-- (Phase 5) - a real ACCA report reviewed for this work computes
-- ventilation CFM per AHU/zone using that zone's own bedroom count, then
-- sums zones for the whole-house figure, not a single whole-house formula.
alter table public.rooms
  add column if not exists is_bedroom boolean not null default false;

-- PHASE 4: Duct system fields, project-level (one duct system profile per
-- project - this app does not yet model different duct runs per zone).
alter table public.projects
  add column if not exists duct_location text,
  add column if not exists duct_insulation_r_value numeric,
  add column if not exists duct_leakage_class text;

alter table public.projects
  add constraint projects_duct_location_check
    check (duct_location is null or duct_location = any (array['attic', 'crawlspace', 'conditioned_space', 'other'])),
  add constraint projects_duct_leakage_class_check
    check (duct_leakage_class is null or duct_leakage_class = any (array['tight', 'average', 'leaky']));

-- PHASE 7: Project elevation and latitude. Nullable, no default - populated
-- via real geocoding/elevation lookups at project-detail render time, never
-- fabricated; left null if a lookup fails so the UI can prompt for manual
-- entry rather than show a fake number.
alter table public.projects
  add column if not exists elevation_ft numeric,
  add column if not exists latitude numeric;

-- PHASE 5: Multi-zone / AHU assignment. Rooms with zone_id null are treated
-- as belonging to a single implicit whole-house zone - existing projects
-- with no zones created keep computing exactly one whole-house total, no
-- behavior change.
create table if not exists public.hvac_zones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now()
);

alter table public.hvac_zones enable row level security;

create policy "Access zones via project access"
on public.hvac_zones
for all
using (
  exists (
    select 1 from public.projects
    where projects.id = hvac_zones.project_id
      and projects.org_id = public.get_my_org_id()
      and (
        public.get_my_role() = any (array['admin', 'estimator'])
        or projects.created_by = auth.uid()
      )
  )
);

alter table public.rooms
  add column if not exists zone_id uuid references public.hvac_zones(id) on delete set null;
