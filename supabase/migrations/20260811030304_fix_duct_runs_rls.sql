-- Security fix: duct_runs (added in 20260811014540_add_manual_d.sql) was
-- given `to authenticated using (true)` policies - open to ANY
-- authenticated user regardless of org, unlike every other project-scoped
-- table in this schema. rooms/zones/drawings/field_resolutions all gate
-- access through the owning project's org_id and role (see "Access rooms
-- via project access" etc. - a live policy this migration only discovered
-- by inspecting pg_policies directly, since the org/profiles/get_my_org_id/
-- get_my_role setup predates this repo's migration history and isn't
-- captured in any local .sql file). duct_runs must follow the same
-- pattern - fixed here rather than left as a real cross-org data leak.
drop policy if exists "duct_runs_select" on public.duct_runs;
drop policy if exists "duct_runs_insert" on public.duct_runs;
drop policy if exists "duct_runs_update" on public.duct_runs;
drop policy if exists "duct_runs_delete" on public.duct_runs;

create policy "Access duct_runs via project access" on public.duct_runs
  for all
  using (
    exists (
      select 1 from public.projects
      where projects.id = duct_runs.project_id
        and projects.org_id = public.get_my_org_id()
        and (
          public.get_my_role() = any (array['admin', 'estimator'])
          or projects.created_by = auth.uid()
        )
    )
  );
