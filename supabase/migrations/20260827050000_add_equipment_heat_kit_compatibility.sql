-- Catalog Expansion + Recommended Install Package, Section 3, Gap 5 -
-- real electric-heat-kit compatibility per air handler, each kit's real
-- kW option and the minimum airflow the OEM's own literature requires
-- for it (the same real "Heat Kit Data"/heater-matrix tables already
-- seen while sourcing blower data - see this migration's own diagnostic
-- report: the source PDFs were deleted per this project's standing
-- scratch-file discipline, so this data is re-sourced fresh here, not
-- recovered from a prior pass).
create table if not exists public.equipment_heat_kit_compatibility (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment_catalog(id) on delete cascade,
  heat_kit_kw numeric not null,
  heat_kit_model text,
  minimum_airflow_cfm numeric,
  source_document text not null
);

alter table public.equipment_heat_kit_compatibility enable row level security;
create policy "equipment_heat_kit_compatibility_select" on public.equipment_heat_kit_compatibility
  for select to authenticated using (true);
