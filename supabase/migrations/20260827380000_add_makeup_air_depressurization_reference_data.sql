-- Real, safety-critical reference data that a prior session's own
-- migration comment (20260827270000_add_makeup_air_tracking.sql)
-- explicitly said it had found in the Broan Automatic Make-Up Air
-- Damper Application Guide (04-17-13, 99044565B) - "a BPI
-- depressurization-limit table by combustion-appliance type, and an
-- IECC-climate-zone table capping makeup-air flow as a % of furnace
-- airflow" - but never actually stored anywhere in the schema. Read the
-- real document again directly this session and closing that gap.
--
-- Global reference data (not project-scoped), same category as
-- duct_insulation_code_minimums/climate_zone_reference - these are real
-- published facts, not a contractor's preference.

-- Real Building Performance Institute (BPI) maximum acceptable home
-- depressurization limits, by combustion-appliance situation, exactly
-- as published in the Broan guide's own "Design depressurization limit"
-- definition (p.6). Lower values are more conservative - a natural-draft
-- water heater with no other combustion appliance sharing its vent
-- backdrafts far more easily than a sealed-combustion appliance.
create table if not exists public.makeup_air_depressurization_limits (
  id uuid primary key default gen_random_uuid(),
  combustion_appliance_category text not null unique,
  max_depressurization_pa numeric not null,
  max_depressurization_iwc numeric not null,
  display_order integer not null,
  source text not null
);

alter table public.makeup_air_depressurization_limits enable row level security;
create policy "makeup_air_depressurization_limits_select" on public.makeup_air_depressurization_limits
  for select to authenticated using (true);

insert into public.makeup_air_depressurization_limits
  (combustion_appliance_category, max_depressurization_pa, max_depressurization_iwc, display_order, source)
values
  ('Orphan natural draft water heater (including outside chimneys)', 2, 0.008, 1,
    'Broan Automatic Make-Up Air Damper Application Guide (04-17-13, 99044565B), p.6, "Design depressurization limit" - BPI recommendation. 1 Pa = 0.004 in w.g. per the same document.'),
  ('Natural draft boiler or furnace commonly vented with water heater', 3, 0.012, 2,
    'Broan Automatic Make-Up Air Damper Application Guide (04-17-13, 99044565B), p.6.'),
  ('Natural draft boiler/furnace with vent damper commonly vented with water heater; individually vented natural draft boiler, furnace, or water heater; or mechanically assisted draft boiler/furnace commonly vented with water heater', 5, 0.020, 3,
    'Broan Automatic Make-Up Air Damper Application Guide (04-17-13, 99044565B), p.6.'),
  ('Mechanically assisted draft boiler or furnace alone, or fan-assisted domestic hot water alone', 15, 0.060, 4,
    'Broan Automatic Make-Up Air Damper Application Guide (04-17-13, 99044565B), p.6.'),
  ('Chimney-top draft inducer, high static pressure flame retention head oil burner, or direct-vented/sealed combustion appliances', 50, 0.200, 5,
    'Broan Automatic Make-Up Air Damper Application Guide (04-17-13, 99044565B), p.6.')
on conflict (combustion_appliance_category) do nothing;

-- Real IECC climate-zone table capping outdoor make-up air flow as a
-- percentage of total furnace/air-handler CFM when the make-up air duct
-- ties into the return side of a central duct system - a rule of thumb
-- to avoid delivering return air cold enough to trip a furnace's high-
-- limit/rollout safety or cause coil icing, exactly as published in the
-- same guide (p.15). Colder climate zones get a tighter cap because
-- outdoor air is colder relative to the same design return temperature.
create table if not exists public.makeup_air_climate_zone_flow_caps (
  id uuid primary key default gen_random_uuid(),
  iecc_climate_zone integer not null unique,
  max_pct_of_furnace_airflow numeric,
  source text not null
);

alter table public.makeup_air_climate_zone_flow_caps enable row level security;
create policy "makeup_air_climate_zone_flow_caps_select" on public.makeup_air_climate_zone_flow_caps
  for select to authenticated using (true);

insert into public.makeup_air_climate_zone_flow_caps (iecc_climate_zone, max_pct_of_furnace_airflow, source) values
  (1, null, 'Broan Automatic Make-Up Air Damper Application Guide (04-17-13, 99044565B), p.15, "Climatic Considerations for Outdoor Air (OA) Ducts Connected to Central Duct Systems" table - Zone 1: "No limit."'),
  (2, 40, 'Broan Automatic Make-Up Air Damper Application Guide (04-17-13, 99044565B), p.15.'),
  (3, 30, 'Broan Automatic Make-Up Air Damper Application Guide (04-17-13, 99044565B), p.15.'),
  (4, 25, 'Broan Automatic Make-Up Air Damper Application Guide (04-17-13, 99044565B), p.15.'),
  (5, 20, 'Broan Automatic Make-Up Air Damper Application Guide (04-17-13, 99044565B), p.15.'),
  (6, 15, 'Broan Automatic Make-Up Air Damper Application Guide (04-17-13, 99044565B), p.15.')
on conflict (iecc_climate_zone) do nothing;

comment on table public.makeup_air_depressurization_limits is
  'Real BPI-recommended maximum home depressurization limits by combustion-appliance situation, from Broan''s own Application Guide (a document already read once this session, whose own tables were never previously stored - see 20260827270000''s header comment). Not yet wired into a project-level check - a project would need a real, tech-confirmed combustion-appliance category and a real field-measured depressurization reading to evaluate against this; both are real, separate data-capture gaps beyond just storing the reference table.';

comment on table public.makeup_air_climate_zone_flow_caps is
  'Real IECC-climate-zone rule of thumb capping outdoor make-up air flow (as % of furnace airflow) when a make-up air damper ties into the return side of a central duct system, to avoid delivering return air too cold for the furnace''s design minimum return temperature (Broan cites ~60F as a common OEM minimum). Not yet wired into a project-level check - see equipment_makeup_air_specs/exhaust_sources for the real makeup-air-unit-vs-exhaust-load balance check this would complement.';
