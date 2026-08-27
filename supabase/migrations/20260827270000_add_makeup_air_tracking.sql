-- Makeup air workstream (data + real enforcement check, per user decision).
--
-- Real problem this solves: any mechanical system that exhausts air to
-- the exterior of the building envelope (a kitchen range hood, a bath/
-- utility exhaust fan, a clothes dryer, an industrial process exhaust
-- hood) pulls the building toward negative pressure. Makeup air
-- equipment supplies real outdoor replacement air to counteract this.
-- Real, cited code/engineering basis (not invented):
--   - IRC M1503.6 (2018/2021 IRC): a kitchen range hood exhausting more
--     than 400 cfm must have a mechanical or passive makeup-air system
--     that starts and operates simultaneously with the exhaust system.
--   - ASHRAE 62.2 Section 6.4: limits the net exhaust flow from a home's
--     two largest exhaust appliances (or requires makeup air) when the
--     home has a natural-draft-vented or solid-fuel-burning appliance
--     within its pressure boundary.
--   - Broan-NuTone's own "Automatic Make-Up Air Damper Application
--     Guide" (04-17-13) confirms the 400 cfm figure and adds a BPI
--     depressurization-limit table by combustion-appliance type, and an
--     IECC-climate-zone table capping makeup-air flow as a % of furnace
--     airflow when ducted into a return trunk.
--   - Greenheck's "Direct Gas-Fired Make-Up Air Models DG and DGX"
--     catalog (March 2018) and NFPA 96 clearance requirements for
--     combination kitchen supply/exhaust packages.
-- Sourced from primary manufacturer documents read directly this
-- session (Broan application guide PDF, Greenheck DG/DGX catalog PDF,
-- Fantech MUAS product page) - never a regex/text-pattern guess.

-- Step 1 - equipment_catalog gets a new equipment type for makeup air
-- equipment. Real product shapes differ sharply by tier:
--   - Residential dampers/fan-powered systems (Broan, Fantech) are real,
--     fixed, named SKUs, but neither manufacturer publishes a single
--     fixed CFM rating per SKU - Broan's own guide says sizing is done
--     via their engineering tool (duct diameter, static pressure, home
--     leakage rate), and Fantech's MUAS product page does not publish a
--     max CFM at all. rated_cfm stays null for these rows - null means
--     "not published," never a fabricated number.
--   - Commercial/industrial tempered units (Greenheck DG/DGX) are real
--     named housing-size models with a real published CFM range and a
--     real published max heating capacity - these get populated ranges.
alter table public.equipment_catalog
  drop constraint if exists equipment_catalog_equipment_type_check;
alter table public.equipment_catalog
  add constraint equipment_catalog_equipment_type_check
    check (equipment_type = any (array['split_ac', 'heat_pump', 'furnace', 'package_unit', 'air_handler', 'coil', 'makeup_air_unit']));

-- Step 2 - real category-specific makeup-air specs, side table following
-- the same 1:1 equipment_electrical_specs/equipment_filter_specs pattern
-- (not merged into equipment_catalog's generic columns, which are
-- single-value "nominal" fields elsewhere in this schema - makeup air
-- equipment's real CFM/heating-capacity data is a RANGE for the
-- commercial tier, not a single nameplate number).
create table if not exists public.equipment_makeup_air_specs (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment_catalog(id) on delete cascade,
  -- Real product tier - determines which of the columns below are
  -- populated vs. legitimately null (see column comments).
  category text not null
    check (category = any (array['residential_damper', 'residential_fan_powered', 'commercial_tempered'])),
  -- Real for fixed-duct residential products (Broan dampers ship in
  -- 4"/6"/8"/10" sizes; Fantech MUAS in 8"/10"). Null for Greenheck's
  -- CFM-range commercial series, which is duct-size-agnostic in the
  -- manufacturer's own published literature.
  duct_diameter_in numeric,
  -- Real published range for commercial_tempered rows (Greenheck's own
  -- per-housing-size dimensional data table). Null for residential rows
  -- where neither manufacturer publishes a fixed CFM number - see the
  -- equipment_catalog comment above. Never a value estimated by reading
  -- pixel positions off a performance chart.
  min_rated_cfm numeric,
  max_rated_cfm numeric,
  heating_fuel_type text not null
    check (heating_fuel_type = any (array['gas', 'electric', 'none'])),
  -- Real published max for commercial_tempered rows. Null when
  -- heating_fuel_type = 'none' (a pure damper/relief device has no
  -- heating section at all - "not applicable," never zero).
  max_heating_capacity_btu numeric,
  -- Real, sourced control/interlock behavior - the actual distinguishing
  -- fact between otherwise-similar-looking rows in this category.
  control_type text not null
    check (control_type = any (array[
      'interlocked_powerline',      -- Broan LinkLogic (SMD*)
      'interlocked_direct_wired',   -- Broan Direct-Wired (MD*T)
      'interlocked_pressure_switch',-- Broan Universal (MD*TU)
      'interlocked_slave',          -- Broan Slave (MD*S) - paired with another primary damper
      'barometric_passive',         -- Broan BD4/BD6 - opens under negative pressure only, no electrical interlock
      'proportional_fan_powered',   -- Fantech MUAS - EC-motor fan proportionally matched to exhaust rate
      'constant_volume_or_vav_gas_fired' -- Greenheck DG/DGX - tempered, constant-volume or VAV, real gas-fired heat
    ])),
  cooling_capable boolean not null default false,
  -- Real per-housing-size Packaged DX cooling range, Greenheck DGX only
  -- (H12/H22/H32 - the DGX catalog's own PDX section does not extend
  -- this option to H35/H38/H42, so those rows keep cooling_capable
  -- false and these null).
  min_cooling_tons numeric,
  max_cooling_tons numeric,
  source_document text not null,
  unique (equipment_id)
);

alter table public.equipment_makeup_air_specs enable row level security;
create policy "equipment_makeup_air_specs_select" on public.equipment_makeup_air_specs
  for select to authenticated using (true);

-- Step 3 - real, sourced Broan (14 SKUs) + Fantech (4 SKUs) + Greenheck
-- (9 real housing-size rows across DG/DGX) rows. Explicit per-model
-- inserts, not a generated loop, so every real fact here is traceable to
-- the primary document it came from.

-- Broan Automatic Make-Up Air Damper - "Broan Automatic Make-Up Air
-- Damper Product Guide - 04-17-13" (99044565B), read directly this
-- session. Section 4: "Different Models" - LinkLogic (SMD*),
-- Direct-Wired (MD*T), Universal (MD*TU), Slave (MD*S), each in 6", 8",
-- 10" sizes (12 SKUs); Section 5: barometric BD4 (4") and BD6 (6").
do $$
declare
  v_id uuid;
  v_model record;
begin
  for v_model in
    select * from (values
      ('SMD6', 6, 'interlocked_powerline'),
      ('SMD8', 8, 'interlocked_powerline'),
      ('SMD10', 10, 'interlocked_powerline'),
      ('MD6T', 6, 'interlocked_direct_wired'),
      ('MD8T', 8, 'interlocked_direct_wired'),
      ('MD10T', 10, 'interlocked_direct_wired'),
      ('MD6TU', 6, 'interlocked_pressure_switch'),
      ('MD8TU', 8, 'interlocked_pressure_switch'),
      ('MD10TU', 10, 'interlocked_pressure_switch'),
      ('MD6S', 6, 'interlocked_slave'),
      ('MD8S', 8, 'interlocked_slave'),
      ('MD10S', 10, 'interlocked_slave'),
      ('BD4', 4, 'barometric_passive'),
      ('BD6', 6, 'barometric_passive')
    ) as t(model_number, duct_in, control)
  loop
    insert into public.equipment_catalog (
      manufacturer, model_number, equipment_type, stage_type,
      nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm,
      source_document
    ) values (
      'Broan', v_model.model_number, 'makeup_air_unit', 'single',
      null, null, null,
      'Broan Automatic Make-Up Air Damper Product Guide - 04-17-13 (99044565B)'
    )
    returning id into v_id;

    insert into public.equipment_makeup_air_specs (
      equipment_id, category, duct_diameter_in, min_rated_cfm, max_rated_cfm,
      heating_fuel_type, max_heating_capacity_btu, control_type,
      cooling_capable, min_cooling_tons, max_cooling_tons, source_document
    ) values (
      v_id, 'residential_damper', v_model.duct_in, null, null,
      'none', null, v_model.control,
      false, null, null,
      'Broan Automatic Make-Up Air Damper Product Guide - 04-17-13 (99044565B)'
    );
  end loop;
end $$;

-- Fantech MUAS (Makeup Air System) - fantech.net product page, read
-- directly this session (page did not publish a max CFM for any model -
-- rated_cfm stays null rather than repeating an unverified web-search
-- synthesis of "650/1600/2000 cfm" that this session could not confirm
-- against Fantech's own page).
do $$
declare
  v_id uuid;
  v_model record;
begin
  for v_model in
    select * from (values
      ('MUAS 8', 8),
      ('MUAS 10', 10),
      ('MUAS 750', null),
      ('MUAS 1200', null)
    ) as t(model_number, duct_in)
  loop
    insert into public.equipment_catalog (
      manufacturer, model_number, equipment_type, stage_type,
      nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm,
      source_document
    ) values (
      'Fantech', v_model.model_number, 'makeup_air_unit', 'single',
      null, null, null,
      'Fantech MUAS Makeup Air System product page (fantech.net), read 2026-08-27'
    )
    returning id into v_id;

    insert into public.equipment_makeup_air_specs (
      equipment_id, category, duct_diameter_in, min_rated_cfm, max_rated_cfm,
      heating_fuel_type, max_heating_capacity_btu, control_type,
      cooling_capable, min_cooling_tons, max_cooling_tons, source_document
    ) values (
      v_id, 'residential_fan_powered', v_model.duct_in, null, null,
      'none', null, 'proportional_fan_powered',
      false, null, null,
      'Fantech MUAS Makeup Air System product page (fantech.net), read 2026-08-27'
    );
  end loop;
end $$;

-- Greenheck Direct Gas-Fired Make-Up Air, Models DG and DGX - "Direct
-- Gas-Fired Make-Up Air Models DG and DGX" catalog, March 2018
-- (00.TAP.1016 R4 3-2018 RG), read directly this session. Real
-- per-housing-size CFM ranges from the catalog's own "Dimensional Data &
-- Weights" tables (pages 13-15); max heating capacity (1,600,000 Btu/hr
-- for DG, 4,800,000 Btu/hr for DGX) is the catalog's overall product
-- max, not broken out per housing size in the public brochure - applied
-- uniformly across that model's housing-size rows rather than inventing
-- a per-size split the manufacturer never published. Packaged DX cooling
-- tons are real, per-housing-size figures from the DGX "Model DGX with
-- Packaged DX Cooling" table (page 15) - only H12/H22/H32 are covered.
do $$
declare
  v_id uuid;
  v_model record;
begin
  for v_model in
    select * from (values
      ('DG-H10', 800::numeric, 3000::numeric, 1600000::numeric, false, null::numeric, null::numeric),
      ('DG-H20', 2600, 6500, 1600000, false, null, null),
      ('DG-H30', 6500, 15000, 1600000, false, null, null),
      ('DGX-H12', 800, 3000, 4800000, true, 2.5, 8),
      ('DGX-H22', 2600, 6500, 4800000, true, 7, 10),
      ('DGX-H32', 6500, 15000, 4800000, true, 10, 16),
      ('DGX-H35', 15000, 23000, 4800000, false, null, null),
      ('DGX-H38', 24000, 34000, 4800000, false, null, null),
      ('DGX-H42', 32000, 48000, 4800000, false, null, null)
    ) as t(model_number, min_cfm, max_cfm, max_btu, cooling, min_tons, max_tons)
  loop
    insert into public.equipment_catalog (
      manufacturer, model_number, equipment_type, stage_type,
      nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm,
      source_document
    ) values (
      'Greenheck', v_model.model_number, 'makeup_air_unit', 'single',
      null, null, null,
      'Greenheck Direct Gas-Fired Make-Up Air Models DG and DGX catalog, March 2018 (00.TAP.1016 R4 3-2018 RG)'
    )
    returning id into v_id;

    insert into public.equipment_makeup_air_specs (
      equipment_id, category, duct_diameter_in, min_rated_cfm, max_rated_cfm,
      heating_fuel_type, max_heating_capacity_btu, control_type,
      cooling_capable, min_cooling_tons, max_cooling_tons, source_document
    ) values (
      v_id, 'commercial_tempered', null, v_model.min_cfm, v_model.max_cfm,
      'gas', v_model.max_btu, 'constant_volume_or_vav_gas_fired',
      v_model.cooling, v_model.min_tons, v_model.max_tons,
      'Greenheck Direct Gas-Fired Make-Up Air Models DG and DGX catalog, March 2018 (00.TAP.1016 R4 3-2018 RG)'
    );
  end loop;
end $$;

-- Captive-Aire's direct-fired MUA line was deliberately NOT cataloged
-- here - the two primary Captive-Aire documents read this session (the
-- Standard/Modular Direct Fired Heater Installation, Operation, and
-- Maintenance Manual, and its start-up documentation form) confirmed
-- Captive-Aire's direct-fired units are configured per job from a
-- selection program rather than sold as a fixed published CFM/Btu-h
-- table the way Greenheck's DG/DGX housing sizes are (the IOM's own
-- start-up form has blank "Min. Btu/Hr" / "Max. Btu/Hr" fields to be
-- filled in per unit, not a published table). Cataloging it would have
-- required reading approximate values off a performance chart (Figure
-- 36's CFM-vs-pressure curves) rather than a real published number -
-- exactly the kind of guess this schema's null-over-fabrication
-- discipline exists to avoid. Revisit if a real Captive-Aire dimensional
-- spec sheet (analogous to Greenheck's) is found.

-- Step 4 - real exhaust sources per project. A tech enters the real,
-- field-measured or manufacturer-spec CFM for each exhaust device that
-- vents to the exterior of the building envelope (kitchen range hood,
-- bath/utility exhaust fan, clothes dryer, industrial process exhaust) -
-- never a formula-derived estimate, same "real number or null" rule
-- process_loads already applies to industrial exhaust/makeup-air rows.
create table if not exists public.exhaust_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  source_type text not null
    check (source_type = any (array['kitchen_range_hood', 'bathroom_exhaust_fan', 'clothes_dryer', 'general_exhaust_fan', 'industrial_process_exhaust', 'other'])),
  description text,
  rated_cfm numeric not null,
  created_at timestamptz not null default now()
);

alter table public.exhaust_sources enable row level security;

-- Same "access via project access" pattern as process_loads (see
-- migration 20260811103554_add_industrial_process_loads.sql and
-- 20260811030304_fix_duct_runs_rls.sql for why a to-authenticated-
-- using-true policy on a project-scoped table would be a real cross-org
-- data leak).
create policy "Access exhaust_sources via project access" on public.exhaust_sources
  for all
  using (
    exists (
      select 1 from public.projects
      where projects.id = exhaust_sources.project_id
        and projects.org_id = public.get_my_org_id()
        and (
          public.get_my_role() = any (array['admin', 'estimator'])
          or projects.created_by = auth.uid()
        )
    )
  );

-- Step 5 - the project's selected makeup-air equipment, if any. Unlike
-- HVAC equipment (zones.selected_equipment_id/selected_air_handler_
-- equipment_id, per-zone since 20260822210000_per_zone_equipment_
-- selection.sql), makeup-air balance is evaluated at the whole-building
-- level - a home's total exhaust load isn't tied to one HVAC zone - so
-- this lives on projects, not zones.
alter table public.projects
  add column if not exists selected_makeup_air_equipment_id uuid references public.equipment_catalog(id);

comment on column public.projects.selected_makeup_air_equipment_id is
  'Project-level makeup-air equipment selection (equipment_catalog.equipment_type = makeup_air_unit). Whole-building, not per-zone, because makeup-air balance depends on total exhaust load across the building, not one HVAC system.';
