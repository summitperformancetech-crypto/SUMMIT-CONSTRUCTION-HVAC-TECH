-- Catalog Expansion + Recommended Install Package, Section 3, Gap 3 -
-- real, per-model refrigerant line-set sizing/length limits. Diagnostic
-- finding: ahu_installation_detail.refrigerant_vapor_line_in/
-- refrigerant_liquid_line_in record what a tech actually installed on a
-- real project - there was no catalog-level source of truth for what
-- diameters/max length/max lift a given outdoor unit's own installation
-- instructions actually specify, the fact the Recommended Install
-- Package generator (Section 5) needs to size and flag against.
create table if not exists public.refrigerant_lineset_specs (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment_catalog(id) on delete cascade,
  liquid_line_diameter_in numeric not null,
  vapor_line_diameter_in numeric not null,
  -- Nullable, not "not null" - some OEMs (e.g. Daikin's DZ4SE line)
  -- publish only a factory-rated line length in their Product
  -- Specifications table and defer the real max-length/derate figures to
  -- a separate long-line-set application guide; recording an unsourced
  -- number here would violate this project's standing null-means-
  -- unknown convention.
  max_equivalent_length_ft numeric,
  max_elevation_change_ft numeric,
  -- Free text, not a structured breakpoint table - manufacturers publish
  -- this as prose/a small table with real percentage-derate figures at
  -- specific length thresholds; captured verbatim per Section 4's
  -- traceability standard rather than reduced to a lossy single number.
  length_derate_notes text,
  source_document text not null,
  unique (equipment_id)
);

alter table public.refrigerant_lineset_specs enable row level security;
create policy "refrigerant_lineset_specs_select" on public.refrigerant_lineset_specs
  for select to authenticated using (true);
