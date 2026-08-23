-- Phase 3 of the completion plan: Field Tech = data entry only. Field
-- Techs can create/edit projects, rooms, envelope data, and drawings/
-- extraction, but cannot select equipment (Manual S) or generate/finalize
-- reports. Two separate mechanisms are needed because these live at
-- different granularities:
--
-- 1. Report generation/finalization = inserting a calculation_snapshots
--    row (see app/api/reports/route.ts's getOrCreateSnapshot and
--    app/api/reports/revise/route.ts - both just INSERT through the
--    user-session client, relying entirely on this policy). This is a
--    whole-row action, so a normal RLS policy tightening is sufficient:
--    drop the "OR projects.created_by = auth.uid()" fallback that
--    let a Field Tech finalize/revise their own project's report.
--    Read/download access to an *already-finalized* report is left as-is
--    (the select policy, unchanged) - viewing a frozen, already-approved
--    PDF is not the same action as creating or revising one.
--
-- 2. Equipment selection = the selected_equipment_id/equipment_selection_
--    notes columns on the otherwise-broadly-writable `projects` row (Field
--    Techs need to write many other columns on that same row - envelope
--    data, address, etc). Postgres RLS is row-level, not column-level, so
--    this can't be expressed as a policy; a BEFORE UPDATE trigger checks
--    just those two columns and rejects the write for non-admin/estimator
--    roles, leaving every other column's writability untouched.

drop policy if exists "Access calculation_snapshots via project access (insert)" on public.calculation_snapshots;

create policy "Only admin/estimator can finalize or revise reports"
on public.calculation_snapshots
for insert
with check (
  exists (
    select 1 from public.projects
    where projects.id = calculation_snapshots.project_id
      and projects.org_id = public.get_my_org_id()
      and public.get_my_role() = any (array['admin', 'estimator'])
  )
);

create function public.enforce_equipment_selection_role()
returns trigger
language plpgsql
security definer
as $$
begin
  if (new.selected_equipment_id is distinct from old.selected_equipment_id
      or new.equipment_selection_notes is distinct from old.equipment_selection_notes)
     and public.get_my_role() not in ('admin', 'estimator') then
    raise exception 'Only admin or estimator roles can select equipment for a project';
  end if;
  return new;
end;
$$;

create trigger enforce_equipment_selection_role_trigger
before update on public.projects
for each row
execute function public.enforce_equipment_selection_role();
