-- Phase 4 of the completion plan / SUMMIT-REPORT-STANDARD.md Section 5.3
-- ("one panel per AHU/zone"): equipment selection moves from
-- projects.selected_equipment_id (one selection for the whole project,
-- a known gap flagged in lib/reportGate.ts's own comments since it was
-- built) to zones.selected_equipment_id (one per system/AHU).
--
-- Data migration: only copied when unambiguous - a project with exactly
-- one zone (the common case; every project gets an auto-created "Zone 1"
-- per migration 20260810213714_add_zones.sql, and most never add a
-- second) gets its existing selection carried over to that zone. A
-- project with zero or multiple zones is left for a human to re-select
-- per zone, rather than guessing which zone a single project-wide
-- selection was "really" for.
alter table public.zones
  add column if not exists selected_equipment_id uuid references public.equipment_catalog(id),
  add column if not exists equipment_selection_notes text;

update public.zones z
set selected_equipment_id = p.selected_equipment_id,
    equipment_selection_notes = p.equipment_selection_notes
from public.projects p
where z.project_id = p.id
  and p.selected_equipment_id is not null
  and (select count(*) from public.zones z2 where z2.project_id = p.id) = 1;

-- Move the Phase 3 role-gate trigger (20260822190000_restrict_field_tech_
-- equipment_and_reports.sql) from projects to zones - the function body
-- only references NEW/OLD.selected_equipment_id and
-- NEW/OLD.equipment_selection_notes generically, so it works unchanged
-- against its new table, just re-attached.
drop trigger if exists enforce_equipment_selection_role_trigger on public.projects;

create trigger enforce_equipment_selection_role_trigger
before update on public.zones
for each row
execute function public.enforce_equipment_selection_role();

alter table public.projects
  drop column if exists selected_equipment_id,
  drop column if exists equipment_selection_notes;
