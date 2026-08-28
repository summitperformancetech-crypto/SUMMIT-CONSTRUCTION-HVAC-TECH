-- Second real furnace-platform batch for equipment_combustion_specs.
-- Real Installation Instructions for *R9S80 & *D9S80* Gas Furnace
-- (IOG-2035B, 12/2024, Daikin Comfort Technologies Manufacturing/
-- Goodman/Amana - shared platform for Amana AR9S80 0803B, Daikin
-- DR80TC 0803B, Goodman GR9S80 0803B), read directly this session.
--
-- This also independently confirms the Goodman GR9S800803B row, which
-- a prior session had left disclosed as "NOT independently verified -
-- inferred from the Amana platform match" (Goodman's own document
-- hadn't been read). That gap is now closed with a real, direct read.
--
--   - Venting category: cover page states "CATEGORY I" explicitly, and
--     the body text repeats "this furnace must be Category I vented.
--     Do not vent using Category III venting."
--   - Clearances to combustibles (p.7, real table, closet/upflow
--     installation, inches): sides 1, front 3, back 0, top (plenum) 1;
--     vent pipe clearance to combustibles 6 using a single-wall
--     connector or 1 using a B-1 vent. Real, genuinely DIFFERENT from
--     the modulating *MVM97/*CVM97 platform's own clearances (0 sides)
--     - not assumed identical across platforms within the same brand
--     family.
--   - Gas supply (inlet) pressure (p.12, real table): Natural Gas Min
--     4.5in w.c. / Max 10.0in w.c.; Propane Min 11.0in w.c. / Max
--     13.0in w.c. - numerically identical to the modulating platform's
--     own published range, independently confirmed here rather than
--     assumed.
--   - Gas manifold pressure (p.21, real table, single-stage - one
--     value, not high/low): Natural range 3.2-3.8in w.c., nominal
--     3.5in w.c.; Propane range 9.7-10.3in w.c., nominal 10.0in w.c. -
--     the propane RANGE is genuinely narrower than the modulating
--     platform's 9.5-10.5in w.c. range (both real, not reconciled).
do $$
declare
  v_amana_id uuid := '3687b34e-3b72-44a1-8bff-ea2c7c3340d0';
  v_daikin_id uuid := '96b95959-301a-44c0-9063-31d3a7650194';
  v_goodman_id uuid := 'f4ec4e3b-60ec-4581-96fa-f633bc41fc4c';
  v_source text := 'Installation Instructions for *R9S80 & *D9S80* Gas Furnace (IOG-2035B, 12/2024, Daikin Comfort Technologies Manufacturing/Goodman/Amana - shared OEM platform) - cover page (CATEGORY I), p.7 (clearances to combustibles table, closet/upflow installation), p.12 (Inlet Gas Supply Pressure table), p.21 (Manifold Gas Pressure table, single-stage).';
  v_clearances jsonb := '{
    "upflow_closet": {"sides": 1, "front": 3, "back": 0, "top_plenum": 1},
    "vent_pipe_clearance_to_combustibles_single_wall_in": 6,
    "vent_pipe_clearance_to_combustibles_b1_vent_in": 1,
    "service_clearance_front_in": 24,
    "note": "Accessibility clearance, where greater, takes precedence over minimum fire protection clearance."
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
      v_equipment_id, 'I',
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
