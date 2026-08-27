-- Catalog Expansion + Recommended Install Package, Section 3, Gap 6 -
-- real per-model filter data (furnished or not, type, size, quantity,
-- thickness, recommended MERV range) - distinct from
-- ahu_installation_detail.filter_backed_return_specs, which is a
-- project-level "what's actually installed" jsonb blob with no defined
-- shape; this is the OEM's own reference spec per model.
create table if not exists public.equipment_filter_specs (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment_catalog(id) on delete cascade,
  filter_furnished boolean not null,
  filter_type text,
  filter_size text,
  filter_quantity integer,
  filter_thickness_in numeric,
  merv_rating_recommended text,
  source_document text not null,
  unique (equipment_id)
);

alter table public.equipment_filter_specs enable row level security;
create policy "equipment_filter_specs_select" on public.equipment_filter_specs
  for select to authenticated using (true);
