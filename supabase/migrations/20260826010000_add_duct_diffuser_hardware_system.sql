-- Manual D Schematic Diagram Generator, Section 2 (schema). Prior state
-- (see PHASE.md's Manual D addenda) modeled exactly one supply-diffuser
-- shape per room (implicit in duct_runs, always drawn as a one-way
-- register) and one central return per zone - a real, disclosed
-- simplification, not a bug, but a hard floor below industry reality:
-- real projects use 2/3/4-way, sidewall, and linear-slot diffusers, and
-- real installs have per-room or per-branch return grilles, physical
-- AHU plenum/takeoff/refrigerant/condensate detail, and non-diffuser
-- terminations (exhaust fan, dryer vent, ODA intake, condensate
-- discharge) that never appeared in this app's data model at all.
--
-- Everything new here is additive and falls back to the prior behavior
-- when absent - existing projects (e.g. Schneider) have zero rows in any
-- of these new tables today and keep rendering exactly as before until a
-- technician adds real diffuser/AHU-detail records.

-- ---------------------------------------------------------------------
-- Reference data: industry-standard diffuser pattern types and duct
-- material specs. Global, not org-scoped (same category as
-- climate_zone_reference/duct_insulation_code_minimums) - these are
-- physical/code facts, not a contractor's brand preference. Real,
-- cited sources only - no fabricated numbers.
-- ---------------------------------------------------------------------
create table if not exists public.duct_diffuser_pattern_types (
  code text primary key,
  tag_code text not null,
  airflow_direction text not null check (airflow_direction = any (array['supply', 'return'])),
  description text not null,
  source text not null
);

alter table public.duct_diffuser_pattern_types enable row level security;
create policy "duct_diffuser_pattern_types_select" on public.duct_diffuser_pattern_types
  for select to authenticated using (true);

-- Throw-pattern classification and tag-code convention (circled type
-- code, e.g. "1W"/"4W") are standard industry usage - ACCA Manual D's
-- own terminal-device treatment and every major diffuser manufacturer
-- (Titus, Krueger, Price) classify supply diffusers by directional
-- throw count; this app's existing register callout format (circled
-- code + size + CFM, matched against REFERENCE-DOCS/IMG_3916.JPG, a
-- real field-set drawing) already uses this exact convention for
-- one-way - this just completes the set it always implied.
insert into public.duct_diffuser_pattern_types (code, tag_code, airflow_direction, description, source) values
  ('one_way', '1W', 'supply', 'One-way throw supply diffuser - single directional blade set, used against a wall/obstruction on 3 sides.', 'ACCA Manual D terminal device throw-pattern convention; industry-standard diffuser classification (Titus/Krueger/Price catalogs)'),
  ('two_way', '2W', 'supply', 'Two-way (opposed or corner) throw supply diffuser.', 'ACCA Manual D terminal device throw-pattern convention; industry-standard diffuser classification'),
  ('three_way', '3W', 'supply', 'Three-way throw supply diffuser - used near a wall with open space on 3 sides.', 'ACCA Manual D terminal device throw-pattern convention; industry-standard diffuser classification'),
  ('four_way', '4W', 'supply', 'Four-way throw supply diffuser - center-of-room ceiling mount, open on all 4 sides.', 'ACCA Manual D terminal device throw-pattern convention; industry-standard diffuser classification'),
  ('sidewall', 'SW', 'supply', 'Sidewall supply register - horizontal throw along a wall or ceiling perimeter.', 'Industry-standard diffuser classification (Titus/Krueger/Price catalogs)'),
  ('linear_slot', 'LS', 'supply', 'Linear slot diffuser - continuous narrow supply outlet, typically at a perimeter or soffit.', 'Industry-standard diffuser classification (Titus/Krueger/Price catalogs)'),
  ('return_grille', 'RA', 'return', 'Return air grille - filter-backed or open, ducted or central-return.', 'Industry-standard HVAC terminology')
on conflict (code) do nothing;

create table if not exists public.duct_material_specs (
  code text primary key,
  display_name text not null,
  category text not null check (category = any (array['flexible', 'sheet_metal', 'duct_board'])),
  insulation_r_value numeric,
  source text not null
);

alter table public.duct_material_specs enable row level security;
create policy "duct_material_specs_select" on public.duct_material_specs
  for select to authenticated using (true);

-- Flex duct R-value tiers: UL 181 Class 1 air duct product line, the
-- three ratings actually sold/labeled by every major manufacturer
-- (Thermaflex, Atco). Duct board R-value-per-inch: NAIMA's own
-- published fibrous-glass duct board standard (AH119/AH136,
-- insulationinstitute.org), R-4.3/inch, giving exact 1"/1.5"/2" values.
-- Sheet metal carries no inherent R-value of its own - its code-minimum
-- external wrap comes from the location it runs through, already
-- modeled by duct_insulation_code_minimums (keyed by duct_location, 2021
-- IECC R403.3.1) - deliberately NOT duplicated here to avoid two tables
-- disagreeing about the same fact.
insert into public.duct_material_specs (code, display_name, category, insulation_r_value, source) values
  ('flex_r4_2', 'Flexible duct, R-4.2', 'flexible', 4.2, 'UL 181 Class 1 air duct - standard insulated flex product tier (interior conditioned space use)'),
  ('flex_r6', 'Flexible duct, R-6', 'flexible', 6.0, 'UL 181 Class 1 air duct - standard insulated flex product tier (attic/crawlspace, moderate climate)'),
  ('flex_r8', 'Flexible duct, R-8', 'flexible', 8.0, 'UL 181 Class 1 air duct - standard insulated flex product tier (cold climate zones / attic runs, 2-in. insulation layer)'),
  ('sheet_metal', 'Sheet metal (galvanized)', 'sheet_metal', null, 'ANSI/SMACNA 006 HVAC Duct Construction Standards - Metal and Flexible; external insulation R-value per duct_insulation_code_minimums for the run''s duct_location, not an inherent material property'),
  ('duct_board_1in', 'Fiberglass duct board, 1" (R-4.3)', 'duct_board', 4.3, 'NAIMA Fibrous Glass Duct Construction Standards (AH119/AH136), R-4.3 at 75F per inch'),
  ('duct_board_1_5in', 'Fiberglass duct board, 1.5" (R-6.5)', 'duct_board', 6.5, 'NAIMA Fibrous Glass Duct Construction Standards (AH119/AH136), R-4.3/in x 1.5in'),
  ('duct_board_2in', 'Fiberglass duct board, 2" (R-8.7)', 'duct_board', 8.7, 'NAIMA Fibrous Glass Duct Construction Standards (AH119/AH136), R-4.3/in x 2in')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Org-level hardware defaults - same free-text, no-FK-to-a-catalog
-- pattern as projects.preferred_manufacturer (there is no national
-- diffuser/duct-material catalog the way equipment_catalog exists for
-- AHU/condenser units), scoped per pattern type / material so an org
-- can carry different brands for a 4-way ceiling diffuser vs. a
-- linear slot, or for flex vs. duct board. Read-all/admin-write mirrors
-- equipment_org_preferences exactly.
-- ---------------------------------------------------------------------
create table if not exists public.diffuser_org_defaults (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  pattern_type text not null references public.duct_diffuser_pattern_types(code),
  manufacturer text not null,
  model text,
  description text,
  created_at timestamptz not null default now(),
  unique (org_id, pattern_type)
);

alter table public.diffuser_org_defaults enable row level security;
create policy "diffuser_org_defaults_select" on public.diffuser_org_defaults
  for select using (org_id = public.get_my_org_id());
create policy "diffuser_org_defaults_admin" on public.diffuser_org_defaults
  for all using (org_id = public.get_my_org_id() and public.get_my_role() = 'admin')
  with check (org_id = public.get_my_org_id() and public.get_my_role() = 'admin');

create table if not exists public.duct_material_org_defaults (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  material_code text not null references public.duct_material_specs(code),
  manufacturer text not null,
  product_line text,
  description text,
  created_at timestamptz not null default now(),
  unique (org_id, material_code)
);

alter table public.duct_material_org_defaults enable row level security;
create policy "duct_material_org_defaults_select" on public.duct_material_org_defaults
  for select using (org_id = public.get_my_org_id());
create policy "duct_material_org_defaults_admin" on public.duct_material_org_defaults
  for all using (org_id = public.get_my_org_id() and public.get_my_role() = 'admin')
  with check (org_id = public.get_my_org_id() and public.get_my_role() = 'admin');

create table if not exists public.termination_hood_org_defaults (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  termination_type text not null check (termination_type = any (array['exhaust_fan', 'dryer_vent', 'oda_intake', 'condensate_discharge'])),
  manufacturer text not null,
  model text,
  description text,
  created_at timestamptz not null default now(),
  unique (org_id, termination_type)
);

alter table public.termination_hood_org_defaults enable row level security;
create policy "termination_hood_org_defaults_select" on public.termination_hood_org_defaults
  for select using (org_id = public.get_my_org_id());
create policy "termination_hood_org_defaults_admin" on public.termination_hood_org_defaults
  for all using (org_id = public.get_my_org_id() and public.get_my_role() = 'admin')
  with check (org_id = public.get_my_org_id() and public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------
-- Project data: real diffusers, terminations, and AHU installation
-- detail. RLS mirrors "Access X via project access" (rooms/zones) exactly.
-- ---------------------------------------------------------------------
create table if not exists public.duct_diffusers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  airflow_direction text not null check (airflow_direction = any (array['supply', 'return'])),
  pattern_type text not null references public.duct_diffuser_pattern_types(code),
  duct_size text,
  round_diameter_in numeric,
  cfm numeric not null,
  mounting_height_aff_in numeric,
  manufacturer text,
  model text,
  description text,
  position_x_norm numeric,
  position_y_norm numeric,
  position_source_drawing_id uuid references public.drawings(id) on delete set null,
  position_source_page_number integer,
  source text not null default 'manual' check (source = any (array['ai_extracted', 'manual'])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.duct_diffusers enable row level security;
create policy "Access duct_diffusers via project access"
on public.duct_diffusers for all using (
  exists (
    select 1 from public.projects
    where projects.id = duct_diffusers.project_id
      and projects.org_id = public.get_my_org_id()
      and (public.get_my_role() = any (array['admin', 'estimator']) or projects.created_by = auth.uid())
  )
);

create table if not exists public.duct_terminations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete set null,
  termination_type text not null check (termination_type = any (array['exhaust_fan', 'dryer_vent', 'oda_intake', 'condensate_discharge'])),
  duct_size text,
  hood_manufacturer text,
  hood_model text,
  screen_or_backdraft_spec text,
  position_x_norm numeric,
  position_y_norm numeric,
  position_source_drawing_id uuid references public.drawings(id) on delete set null,
  position_source_page_number integer,
  created_at timestamptz not null default now()
);

alter table public.duct_terminations enable row level security;
create policy "Access duct_terminations via project access"
on public.duct_terminations for all using (
  exists (
    select 1 from public.projects
    where projects.id = duct_terminations.project_id
      and projects.org_id = public.get_my_org_id()
      and (public.get_my_role() = any (array['admin', 'estimator']) or projects.created_by = auth.uid())
  )
);

-- One row per AHU (per zone, since this app already models "one AHU per
-- zone" via zones.ahu_label/ahu_position - see lib/ductRouting.ts). Every
-- field nullable: physical install detail a tech hasn't entered yet must
-- render as "not yet specified," never a fabricated default, matching
-- this app's standing null-means-unknown convention everywhere else
-- (computeManualJ, AED SHGC handling, etc).
create table if not exists public.ahu_installation_detail (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  plenum_size text,
  supply_takeoff_sizes jsonb,
  fresh_air_duct_size text,
  oda_termination_id uuid references public.duct_terminations(id) on delete set null,
  refrigerant_vapor_line_in numeric,
  refrigerant_liquid_line_in numeric,
  -- Free text, not a stored pass/fail - a tech's routing note. Real
  -- code minimum (IMC 307.2.1: min. 1/8in per 12in horizontal, 1%
  -- slope, "toward the point of disposal") is surfaced as UI help text
  -- next to this field, not computed against it - Summit has no way to
  -- verify an actual installed slope from a text note, and fabricating
  -- a compliance boolean from unstructured text would be worse than
  -- not claiming one.
  condensate_routing_note text,
  return_platform_construction text,
  return_platform_insulation_r numeric,
  filter_backed_return_specs jsonb,
  -- Array of {type: 'manual_balance'|'vad_normally_closed'|'back_draft', location_note: text}.
  -- IMC 608.1 (2021 ed.) requires a means to adjust air volume in
  -- branch distribution - manual balancing dampers are the baseline
  -- compliance method; VAD/back-draft are project-specific choices,
  -- never assumed.
  damper_types jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zone_id)
);

alter table public.ahu_installation_detail enable row level security;
create policy "Access ahu_installation_detail via project access"
on public.ahu_installation_detail for all using (
  exists (
    select 1 from public.projects
    where projects.id = ahu_installation_detail.project_id
      and projects.org_id = public.get_my_org_id()
      and (public.get_my_role() = any (array['admin', 'estimator']) or projects.created_by = auth.uid())
  )
);
