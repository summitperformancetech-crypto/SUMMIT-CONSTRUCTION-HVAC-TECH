-- Standalone whole-house dehumidification, per explicit user instruction:
-- a dehumidification system that is genuinely separate from the primary
-- HVAC system, with its own supply/return ducting and hardware - not a
-- coil-integrated add-on and not just a note on the main system.
--
-- Real, sourced methodology (primary manufacturer spec sheets read
-- directly this session, plus corroborated secondary HVAC-industry
-- sizing guidance - see lib/dehumidification.ts's module comment for the
-- full citation trail):
--   - Sizing basis: ACCA Manual S's own approach is to pull the summer
--     latent gain straight from a Manual J load calc and match a
--     dehumidifier's rated pints/day capacity to it - this app already
--     computes real per-room coolingLatentBtuh (lib/manualJ.ts), so no
--     new load-calc math is needed, only a unit conversion
--     (Btuh -> pints/day, see lib/dehumidification.ts).
--   - Rating conditions: every manufacturer publishes a pints/day figure
--     at 80F/60%RH (the legacy AHAM point); some (Aprilaire) also
--     publish a second figure at 73F/60%RH (the DOE test point, closer
--     to a typical ~75F indoor design condition). A specific numeric
--     derating factor between rated and as-installed capacity is
--     sometimes cited informally, but as of this session's research
--     ACCA's own official Manual S guidance for this had not been
--     finalized/published with a citable table (an HVAC-training-industry
--     technical article on the topic explicitly says so) - so Summit
--     does NOT bake in an invented percentage. It surfaces the real
--     published number closest to design conditions instead (see
--     equipment_dehumidifier_specs.rated_pints_per_day_73_60 below).
--   - Real installation topologies (Aprilaire E100 spec sheet, form
--     962/316361, page 2, "Installation Options"): main-return-to-main-
--     return, dedicated-return-to-main-supply-or-return, dedicated
--     supply/return grilles fully independent of the home's HVAC
--     ductwork (the case this feature is specifically about), and
--     main-return-to-main-supply. All four are real, cited, and modeled
--     - Summit does not assume away the tie-in cases just because this
--     feature's driving request is about the fully independent one.

-- Step 1 - equipment_catalog gets a new equipment type. Real product
-- shape: fixed-capacity ducted whole-house dehumidifiers with a
-- published pints/day rating and a real blower CFM-vs-ESP curve (same
-- generic equipment_blower_performance table already used for air
-- handlers - that table's schema was never actually restricted to
-- equipment_type = 'air_handler', so it's reused here rather than
-- duplicated).
alter table public.equipment_catalog
  drop constraint if exists equipment_catalog_equipment_type_check;
alter table public.equipment_catalog
  add constraint equipment_catalog_equipment_type_check
    check (equipment_type = any (array['split_ac', 'heat_pump', 'furnace', 'package_unit', 'air_handler', 'coil', 'makeup_air_unit', 'exhaust_fan', 'dehumidifier']));

-- Step 2 - real dehumidifier-specific specs, same 1:1 side-table pattern
-- as equipment_exhaust_fan_specs / equipment_makeup_air_specs.
create table if not exists public.equipment_dehumidifier_specs (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment_catalog(id) on delete cascade,
  -- Real, near-universally published legacy AHAM rating point - every
  -- ducted whole-house unit checked this session publishes this one.
  rated_pints_per_day_80_60 numeric not null,
  -- Real DOE test-condition rating point, when the manufacturer
  -- publishes it (Aprilaire does; Santa Fe's own data sheet read this
  -- session did not) - null means "not published," never estimated from
  -- the 80/60 figure by an invented percentage.
  rated_pints_per_day_73_60 numeric,
  -- Real duct collar sizes. Some units (Santa Fe Ultra98) have a second,
  -- smaller inlet dedicated to a separate fresh-air-ventilation function
  -- distinct from the main return-air inlet - secondary_inlet_duct_
  -- diameter_in is null for units (Aprilaire E100) with only one inlet.
  inlet_duct_diameter_in numeric,
  secondary_inlet_duct_diameter_in numeric,
  outlet_duct_diameter_in numeric not null,
  drain_connection_spec text not null,
  has_backdraft_damper boolean not null,
  refrigerant_type text,
  coverage_sqft numeric,
  coverage_cuft numeric,
  operating_temp_min_f numeric,
  operating_temp_max_f numeric,
  source_document text not null,
  unique (equipment_id)
);

alter table public.equipment_dehumidifier_specs enable row level security;
create policy "equipment_dehumidifier_specs_select" on public.equipment_dehumidifier_specs
  for select to authenticated using (true);

-- Step 3 - real Santa Fe Ultra98 and Aprilaire E100 rows, both read
-- directly from primary manufacturer spec sheets this session.
do $$
declare
  v_santafe_id uuid;
  v_aprilaire_id uuid;
begin
  insert into public.equipment_catalog (
    manufacturer, model_number, equipment_type, stage_type,
    nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm,
    source_document
  ) values (
    'Santa Fe', 'Ultra98', 'dehumidifier', 'single',
    null, null, 320,
    'Santa Fe Ultra98 Data Sheet (santa-fe-products.com), rev. 05/2021, read directly 2026-08-27'
  )
  returning id into v_santafe_id;

  insert into public.equipment_dehumidifier_specs (
    equipment_id, rated_pints_per_day_80_60, rated_pints_per_day_73_60,
    inlet_duct_diameter_in, secondary_inlet_duct_diameter_in, outlet_duct_diameter_in,
    drain_connection_spec, has_backdraft_damper, refrigerant_type,
    coverage_sqft, coverage_cuft, operating_temp_min_f, operating_temp_max_f,
    source_document
  ) values (
    v_santafe_id, 98, null,
    10, 6, 10,
    '3/4" threaded female NPT', false, 'R410A (per this data sheet edition, rev. 05/2021; a newer production run has been observed marketed under R454B elsewhere - not reconciled against a primary source this session, disclosed rather than guessed)',
    2300, 23000, 49, 95,
    'Santa Fe Ultra98 Data Sheet (santa-fe-products.com), rev. 05/2021 - "Duct Connections: 6" Round Inlet, 10" Round Inlet, 10" Round Outlet" (6" inlet is the separate fresh-air-ventilation connection, not the main return-air inlet). Backdraft damper not stated on this data sheet - left false (unconfirmed, not "no damper").'
  );

  insert into public.equipment_blower_performance (equipment_id, speed_tap, esp_iwc, cfm, source_document) values
    (v_santafe_id, 'single', 0.0, 320, 'Santa Fe Ultra98 Data Sheet, rev. 05/2021 - "Blower: 320 CFM @ 0.0" WG"'),
    (v_santafe_id, 'single', 0.2, 297, 'Santa Fe Ultra98 Data Sheet, rev. 05/2021 - "297 CFM @ 0.2" WG"'),
    (v_santafe_id, 'single', 0.4, 215, 'Santa Fe Ultra98 Data Sheet, rev. 05/2021 - "215 CFM @ 0.4" WG"');

  insert into public.equipment_catalog (
    manufacturer, model_number, equipment_type, stage_type,
    nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm,
    source_document
  ) values (
    'Aprilaire', 'E100', 'dehumidifier', 'single',
    null, null, 280,
    'AprilAire Model E100 Dehumidifier Specification Sheet, Form No. 962/316361, (c) 2023 AprilAire, read directly 2026-08-27'
  )
  returning id into v_aprilaire_id;

  insert into public.equipment_dehumidifier_specs (
    equipment_id, rated_pints_per_day_80_60, rated_pints_per_day_73_60,
    inlet_duct_diameter_in, secondary_inlet_duct_diameter_in, outlet_duct_diameter_in,
    drain_connection_spec, has_backdraft_damper, refrigerant_type,
    coverage_sqft, coverage_cuft, operating_temp_min_f, operating_temp_max_f,
    source_document
  ) values (
    v_aprilaire_id, 100, 85,
    10, null, 10,
    '3/4" MNPT threaded, barbed fitting included', true, 'R410A',
    null, null, 50, 104,
    'AprilAire Model E100 Dehumidifier Specification Sheet, Form No. 962/316361 - "Capacity @ 80F/60%RH: 100 ppd, @ 73F/60%RH: 85 ppd"; "10" diameter inlet/outlet duct collars"; "Backdraft damper at outlet" (explicit); "3/4in MNPT Threaded drain connection with threaded barbed fitting included". No coverage sq.ft./cu.ft. figure published on this data sheet - left null rather than reusing Santa Fe''s figure for a different product.'
  );

  insert into public.equipment_blower_performance (equipment_id, speed_tap, esp_iwc, cfm, source_document) values
    (v_aprilaire_id, 'single', 0.0, 280, 'AprilAire E100 Spec Sheet - "0.0" w.c.: 280 CFM"'),
    (v_aprilaire_id, 'single', 0.2, 245, 'AprilAire E100 Spec Sheet - "0.2" w.c.: 245 CFM"'),
    (v_aprilaire_id, 'single', 0.4, 210, 'AprilAire E100 Spec Sheet - "0.4" w.c.: 210 CFM"');
end $$;

-- Step 4 - a project's real standalone dehumidification system(s).
-- Project-scoped, NOT zone-scoped: per the driving request, this is a
-- system genuinely separate from the primary HVAC system/zones, so it
-- gets its own top-level table rather than being forced into the
-- zones/AHU model that already represents the primary system.
create table if not exists public.dehumidification_systems (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  installation_topology text not null
    check (installation_topology = any (array[
      'dedicated_grilles',                       -- fully independent supply/return, no tie-in to HVAC ductwork
      'return_to_return',                         -- pulls from and discharges to the main system's return duct only
      'return_to_supply',                         -- pulls from the main return, discharges to the main supply plenum
      'dedicated_return_to_supply_or_return'      -- dedicated return grille, discharges into supply plenum or return
    ])),
  selected_equipment_id uuid references public.equipment_catalog(id),
  -- Real, tech-entered static-pressure budget for THIS unit's own duct
  -- run - independent of projects.available_static_pressure_iwc, which
  -- is the main air handler's budget and has no bearing on a standalone
  -- dehumidifier's own short duct run.
  available_static_pressure_iwc numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dehumidification_systems enable row level security;
create policy "Access dehumidification_systems via project access"
on public.dehumidification_systems for all using (
  exists (
    select 1 from public.projects
    where projects.id = dehumidification_systems.project_id
      and projects.org_id = public.get_my_org_id()
      and (
        public.get_my_role() = any (array['admin', 'estimator'])
        or projects.created_by = auth.uid()
      )
  )
);

-- Step 5 - which real rooms a dehumidification system covers. A system
-- may serve a subset of a project's rooms (e.g. just a basement) - this
-- is what the latent-load-to-pints/day requirement is computed from
-- (sum of those rooms' real Manual J coolingLatentBtuh).
create table if not exists public.dehumidification_system_rooms (
  id uuid primary key default gen_random_uuid(),
  dehumidification_system_id uuid not null references public.dehumidification_systems(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  unique (dehumidification_system_id, room_id)
);

alter table public.dehumidification_system_rooms enable row level security;
create policy "Access dehumidification_system_rooms via project access"
on public.dehumidification_system_rooms for all using (
  exists (
    select 1 from public.dehumidification_systems ds
    join public.projects on projects.id = ds.project_id
    where ds.id = dehumidification_system_rooms.dehumidification_system_id
      and projects.org_id = public.get_my_org_id()
      and (
        public.get_my_role() = any (array['admin', 'estimator'])
        or projects.created_by = auth.uid()
      )
  )
);

-- Step 6 - "its own supply and return ducting": widen duct_runs (the
-- real Manual D equal-friction sizing table) with an alternate parent.
-- zone_id was already nullable (on delete set null) with zero existing
-- rows relying on it being null (verified live before writing this), so
-- this is safe to pair with a strict "exactly one parent" check -
-- unlike zone_id, dehumidification_system_id use is new, so there is no
-- existing-data migration to reconcile.
alter table public.duct_runs
  add column if not exists dehumidification_system_id uuid references public.dehumidification_systems(id) on delete cascade;

alter table public.duct_runs
  drop constraint if exists duct_runs_exactly_one_parent;
alter table public.duct_runs
  add constraint duct_runs_exactly_one_parent
    check (num_nonnulls(zone_id, dehumidification_system_id) = 1);

comment on column public.duct_runs.dehumidification_system_id is
  'Alternate parent to zone_id for a standalone dehumidification system''s own dedicated supply/return duct run - sized by the same equal-friction Manual D engine (lib/manualD.ts), driven by that system''s own selected equipment''s blower CFM-vs-ESP curve (equipment_blower_performance) rather than the primary system''s air handler. Exactly one of zone_id/dehumidification_system_id is set, never both, never neither.';
