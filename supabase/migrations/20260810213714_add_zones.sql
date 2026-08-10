-- SECTION 4 (gap-closure spec): Multi-Zone / Multi-AHU Room Assignment.
--
-- Design decisions made without stopping to ask (per this session's
-- updated rules - documented here for review instead):
--
-- 1. Table is named `zones`, not `hvac_zones` - matches the spec's literal
--    naming. Checked live first: neither `zones` nor `hvac_zones` exists
--    (the original bundled migration that would have created `hvac_zones`
--    was never applied - confirmed at the start of tonight's session), so
--    there's no collision or migration debt to reconcile.
--
-- 2. "Auto-create one default Zone 1 at creation time" is implemented as a
--    DB trigger on projects, not app code in app/dashboard/new/page.tsx.
--    Project creation today is a plain client-side
--    supabase.from('projects').insert(...) call - app-code-only logic
--    would silently stop working the moment any other insert path exists
--    (a future API route, an admin script, a bulk import). A trigger
--    holds the invariant regardless of insert path, which is what "going
--    forward, every new project" actually requires.
--
-- 3. zone_id on rooms is `on delete set null`, not cascade - deleting a
--    zone should unassign its rooms, not delete them (matches the
--    original abandoned hvac_zones draft's same choice, and how
--    "adjacent unconditioned room" references already behave elsewhere
--    in this schema - a referenced record going away doesn't destroy
--    the room that pointed to it).
create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  ahu_label text,
  created_at timestamp with time zone not null default now()
);

alter table public.zones enable row level security;

-- Mirrors the exact "Access X via project access" pattern used by rooms,
-- drawings, and field_resolutions (checked live before writing this).
create policy "Access zones via project access"
on public.zones
for all
using (
  exists (
    select 1 from public.projects
    where projects.id = zones.project_id
      and projects.org_id = public.get_my_org_id()
      and (
        public.get_my_role() = any (array['admin', 'estimator'])
        or projects.created_by = auth.uid()
      )
  )
);

alter table public.rooms
  add column if not exists zone_id uuid references public.zones(id) on delete set null;

-- SECURITY DEFINER (with search_path pinned, standard hardening against
-- search_path hijacking) so this succeeds regardless of the inserting
-- role's own zones-table permissions - it should always work as a system
-- invariant, not something that can silently fail for some future caller.
create or replace function public.create_default_zone_for_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.zones (project_id, name)
  values (new.id, 'Zone 1');
  return new;
end;
$$;

drop trigger if exists trg_create_default_zone on public.projects;
create trigger trg_create_default_zone
  after insert on public.projects
  for each row
  execute function public.create_default_zone_for_project();

-- Backfill for existing projects (CROSSWAY DEMO, Jose Dominguez, and any
-- future existing project this migration runs against): give each one a
-- default Zone 1 and assign every currently-unassigned room to it, so the
-- whole-project total stays identical to before this migration - it's
-- now just attributable to one zone instead of implicitly "no zone."
do $$
declare
  proj record;
  new_zone_id uuid;
begin
  for proj in select id from public.projects loop
    insert into public.zones (project_id, name)
    values (proj.id, 'Zone 1')
    returning id into new_zone_id;

    update public.rooms
    set zone_id = new_zone_id
    where project_id = proj.id and zone_id is null;
  end loop;
end $$;
