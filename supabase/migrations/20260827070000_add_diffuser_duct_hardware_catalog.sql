-- Catalog Expansion + Recommended Install Package, Section 3, Gap 7 -
-- real, purchasable diffuser and duct-material SKUs. Diagnostic finding:
-- diffuser_org_defaults/duct_material_org_defaults (added in
-- 20260826010000) are per-org FREE-TEXT preference rows with no backing
-- catalog - there was no shared reference table of real manufacturer
-- SKUs for an org to actually choose from, the same gap equipment_catalog
-- already solves for HVAC units. These two new tables are that catalog;
-- the existing org_defaults tables get an added, nullable FK to it
-- (`catalog_id`) so an org can pick a real cataloged SKU going forward
-- while the existing free-text manufacturer/model fields keep working
-- unchanged for anything not yet in the catalog - purely additive, no
-- existing org default is invalidated.
create table if not exists public.diffuser_hardware_catalog (
  id uuid primary key default gen_random_uuid(),
  pattern_type text not null references public.duct_diffuser_pattern_types(code),
  manufacturer text not null,
  model text not null,
  description text,
  source_document text not null,
  created_at timestamptz not null default now(),
  unique (manufacturer, model)
);

alter table public.diffuser_hardware_catalog enable row level security;
create policy "diffuser_hardware_catalog_select" on public.diffuser_hardware_catalog
  for select to authenticated using (true);

create table if not exists public.duct_material_hardware_catalog (
  id uuid primary key default gen_random_uuid(),
  material_code text not null references public.duct_material_specs(code),
  manufacturer text not null,
  product_line text not null,
  description text,
  source_document text not null,
  created_at timestamptz not null default now(),
  unique (manufacturer, product_line)
);

alter table public.duct_material_hardware_catalog enable row level security;
create policy "duct_material_hardware_catalog_select" on public.duct_material_hardware_catalog
  for select to authenticated using (true);

alter table public.diffuser_org_defaults
  add column if not exists catalog_id uuid references public.diffuser_hardware_catalog(id);
alter table public.duct_material_org_defaults
  add column if not exists catalog_id uuid references public.duct_material_hardware_catalog(id);
