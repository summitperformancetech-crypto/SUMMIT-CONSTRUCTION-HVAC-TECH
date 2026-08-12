-- Data Integrity Addendum, Section 2: idle-project staleness banner.
--
-- Part A - updated_at tracking on every reference table the app reads
-- live for an unfinalized project's calculations. climate_zone_reference
-- already has an updated_at column (pre-existing prototype table) but no
-- trigger keeping it current on UPDATE - added here too, retroactively,
-- so staleness detection works regardless of how a row gets edited (app
-- code, admin UI, or a raw SQL fix), not only through one specific write
-- path.
--
-- equipment_performance_points and room_type_defaults have no surrogate
-- id/created_at columns at all (checked live via `select=*` before writing
-- this) - updated_at is simply added as a new column on each.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.equipment_catalog
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists equipment_catalog_set_updated_at on public.equipment_catalog;
create trigger equipment_catalog_set_updated_at
  before update on public.equipment_catalog
  for each row execute function public.set_updated_at();

alter table public.equipment_performance_points
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists equipment_performance_points_set_updated_at on public.equipment_performance_points;
create trigger equipment_performance_points_set_updated_at
  before update on public.equipment_performance_points
  for each row execute function public.set_updated_at();

alter table public.duct_sizing_tables
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists duct_sizing_tables_set_updated_at on public.duct_sizing_tables;
create trigger duct_sizing_tables_set_updated_at
  before update on public.duct_sizing_tables
  for each row execute function public.set_updated_at();

alter table public.room_type_defaults
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists room_type_defaults_set_updated_at on public.room_type_defaults;
create trigger room_type_defaults_set_updated_at
  before update on public.room_type_defaults
  for each row execute function public.set_updated_at();

alter table public.climate_zone_reference
  add column if not exists updated_at timestamptz not null default now();
drop trigger if exists climate_zone_reference_set_updated_at on public.climate_zone_reference;
create trigger climate_zone_reference_set_updated_at
  before update on public.climate_zone_reference
  for each row execute function public.set_updated_at();

-- Part B - dismissal audit log, same append-only "latest row per key wins"
-- philosophy as field_resolutions (20260810195313_add_field_resolutions.sql).
-- A dismissal is scoped to (project_id, reference_table): dismissing the
-- "equipment catalog updated" banner line only suppresses that one line for
-- that one project, and only until the table changes again after the
-- dismissal (dismissed_at compared against the table's own updated_at at
-- read time - see lib/staleness.ts) - a fresh update always resurfaces the
-- banner even if a previous staleness event on the same table was already
-- dismissed.
create table if not exists public.staleness_banner_dismissals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  reference_table text not null,
  dismissed_by uuid not null references public.profiles(id) on delete restrict,
  dismissed_at timestamptz not null default now()
);

create index if not exists staleness_banner_dismissals_lookup_idx
  on public.staleness_banner_dismissals (project_id, reference_table, dismissed_at desc);

alter table public.staleness_banner_dismissals enable row level security;

create policy "Access staleness_banner_dismissals via project access"
on public.staleness_banner_dismissals
for all
using (
  exists (
    select 1 from public.projects
    where projects.id = staleness_banner_dismissals.project_id
      and projects.org_id = public.get_my_org_id()
      and (
        public.get_my_role() = any (array['admin', 'estimator'])
        or projects.created_by = auth.uid()
      )
  )
);
