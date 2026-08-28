-- First real batch of the equipment_combustion_specs sourcing pass (see
-- 20260827400000 for the schema). Real Installation Instructions for
-- *MVM97 & *CVM97 Modulating Gas Furnace (IOG-2007, 08/14, Goodman
-- Manufacturing Company - shared platform for Amana AMVM97 0803BNB,
-- Daikin DM97MC 0803BNA, Goodman GMVM97 0803BNB, already independently
-- confirmed identical for capacity/electrical in this schema), read
-- directly this session.
--
--   - Venting category: cover page states "(Type FSP CATEGORY IV Direct
--     or Non Direct Vent Air Furnace)", complies with ANSI Z21.47/
--     CSA-2.3.
--   - Clearances to combustibles (p.8, real table, inches): Upflow -
--     front 3, sides 0, rear 0, top 1, flue 0 (floor must be wood only
--     if combustible). Upflow Horizontal Alcove - front 6, sides 0,
--     rear 4, top 0. Counterflow - sides 0, rear 0, front 3, top 1, flue
--     0 (bottom: non-combustible floor only, subbase required for
--     combustible). Counterflow Horizontal - sides 6, rear 0, front 3,
--     top 6, flue 0. Plus a real, separate 24in. minimum service
--     clearance in front, in all cases, taking precedence when greater.
--   - Gas supply (inlet) pressure (p.28, real table): Natural Gas Min
--     4.5in w.c. / Max 10.0in w.c.; Propane Min 11.0in w.c. / Max
--     13.0in w.c.
--   - Gas manifold pressure (p.38, real table, High Stage - this valve
--     modulates continuously rather than stepping between two fixed
--     manifold pressures, so only one real nominal/range figure is
--     published, not a separate low-stage value): Natural 3.2-3.8in
--     w.c., nominal 3.5in w.c.; Propane 9.5-10.5in w.c., nominal 10.0in
--     w.c. (At light-off specifically, the furnace fires at 80% of max
--     input with manifold pressure 1.8-2.5in w.c. natural / 5.8-6.8in
--     w.c. propane, before modulating up - a real, distinct ignition-
--     point figure, not stored here since the schema's high/low fields
--     are for steady-state staged operation.)
do $$
declare
  v_amana_id uuid := 'b527cfcd-fc51-46f6-9cfc-9bd1835438c8';
  v_daikin_id uuid := 'ba87f3ed-acb5-4d2a-99b5-5e05b7e25889';
  v_goodman_id uuid := '2c5605a2-b03a-4ad6-8f8d-cae937756ef8';
  v_source text := 'Installation Instructions for *MVM97 & *CVM97 Modulating Gas Furnace (IOG-2007, 08/14, Goodman Manufacturing Company - shared OEM platform for Amana/Daikin/Goodman) - cover page (Category IV), p.8 (clearances to combustibles table), p.28 (Inlet Gas Supply Pressure table), p.38 (Manifold Gas Pressure table, High Stage - a modulating valve, so only one real nominal figure is published, not a separate low-stage value).';
  v_clearances jsonb := '{
    "upflow": {"front": 3, "sides": 0, "rear": 0, "top": 1, "flue": 0},
    "upflow_horizontal_alcove": {"front": 6, "sides": 0, "rear": 4, "top": 0, "flue": 0},
    "counterflow": {"sides": 0, "rear": 0, "front": 3, "top": 1, "flue": 0, "bottom_note": "non-combustible floor only, or use an accessory subbase over combustible floor"},
    "counterflow_horizontal": {"sides": 6, "rear": 0, "front": 3, "top": 6, "flue": 0},
    "service_clearance_front_in": 24,
    "note": "Accessibility/service clearance takes precedence over the enclosure clearances above wherever it is greater."
  }'::jsonb;
  v_equipment_id uuid;
begin
  foreach v_equipment_id in array array[v_amana_id, v_daikin_id, v_goodman_id]
  loop
    insert into public.equipment_combustion_specs (
      equipment_id, venting_category,
      manifold_pressure_natural_gas_high_iwc, manifold_pressure_propane_high_iwc,
      natural_gas_supply_pressure_min_iwc, natural_gas_supply_pressure_max_iwc,
      propane_supply_pressure_min_iwc, propane_supply_pressure_max_iwc,
      clearances_in, source_document
    ) values (
      v_equipment_id, 'IV',
      3.5, 10.0,
      4.5, 10.0,
      11.0, 13.0,
      v_clearances, v_source
    )
    on conflict (equipment_id) do update set
      venting_category = excluded.venting_category,
      manifold_pressure_natural_gas_high_iwc = excluded.manifold_pressure_natural_gas_high_iwc,
      manifold_pressure_propane_high_iwc = excluded.manifold_pressure_propane_high_iwc,
      natural_gas_supply_pressure_min_iwc = excluded.natural_gas_supply_pressure_min_iwc,
      natural_gas_supply_pressure_max_iwc = excluded.natural_gas_supply_pressure_max_iwc,
      propane_supply_pressure_min_iwc = excluded.propane_supply_pressure_min_iwc,
      propane_supply_pressure_max_iwc = excluded.propane_supply_pressure_max_iwc,
      clearances_in = excluded.clearances_in,
      source_document = excluded.source_document;
  end loop;
end $$;
