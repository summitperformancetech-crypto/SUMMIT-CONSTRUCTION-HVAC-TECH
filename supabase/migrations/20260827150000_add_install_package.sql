-- Catalog Expansion + Recommended Install Package, Section 5 - the core
-- new capability: a real, per-zone bill of materials assembled from the
-- catalog data closed in the prior migrations, not a generic "here are
-- some compatible parts" list. One row per zone (a zone is this app's
-- existing "one system/AHU" unit - see zones.selected_equipment_id/
-- selected_air_handler_equipment_id), frozen at generation time exactly
-- like a report snapshot - regenerating re-computes fresh rather than
-- mutating history, so a past package stays inspectable even if the
-- catalog changes later.
create table if not exists public.install_packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  -- Section 5 step 8 - the FULL package score (every line item resolved
  -- cleanly), never just the Manual S equipment-compatibility score.
  completeness_percent numeric not null,
  -- Section 5 step 1 / Open Question 3's answer: an uncertified outdoor+
  -- indoor pairing is a real flag, not a hard block - a tech can proceed
  -- with a documented, explicit acknowledgement that releases Summit of
  -- liability for that specific decision, the same accept/override-with-
  -- reason pattern already used elsewhere in this app (e.g. duct-
  -- routing-canvas pin overrides). Null until acknowledged.
  uncertified_pairing_acknowledged_by uuid references auth.users(id),
  uncertified_pairing_acknowledged_at timestamptz,
  uncertified_pairing_acknowledgement_note text,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id),
  unique (zone_id)
);

alter table public.install_packages enable row level security;
create policy "Access install_packages via project access"
on public.install_packages for all using (
  exists (
    select 1 from public.projects
    where projects.id = install_packages.project_id
      and projects.org_id = public.get_my_org_id()
      and (public.get_my_role() = any (array['admin', 'estimator']) or projects.created_by = auth.uid())
  )
);

-- One row per real BOM line item - Section 5's own output spec: "each
-- line item referencing its source catalog row, with any UNRESOLVED
-- items surfaced exactly like the rest of Summit's UNRESOLVED workflow -
-- visible, actionable, never hidden."
create table if not exists public.install_package_line_items (
  id uuid primary key default gen_random_uuid(),
  install_package_id uuid not null references public.install_packages(id) on delete cascade,
  category text not null
    check (category = any (array['coil_matching', 'electrical', 'refrigerant_lineset', 'heat_kit', 'filter', 'diffuser', 'duct_material', 'termination'])),
  status text not null check (status = any (array['resolved', 'unresolved', 'flagged'])),
  summary text not null,
  detail text not null,
  source_equipment_id uuid references public.equipment_catalog(id),
  sort_order integer not null default 0
);

alter table public.install_package_line_items enable row level security;
create policy "Access install_package_line_items via project access"
on public.install_package_line_items for all using (
  exists (
    select 1 from public.install_packages
    join public.projects on projects.id = install_packages.project_id
    where install_packages.id = install_package_line_items.install_package_id
      and projects.org_id = public.get_my_org_id()
      and (public.get_my_role() = any (array['admin', 'estimator']) or projects.created_by = auth.uid())
  )
);
