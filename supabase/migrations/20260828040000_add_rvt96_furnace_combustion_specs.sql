-- Sixth real furnace-platform batch for equipment_combustion_specs.
-- Real Installation Instructions for *DVT96* & *RVT96* Two-Stage Gas
-- Furnace (IOG-2044, 03/2024, Daikin Comfort Technologies
-- Manufacturing/Goodman/Amana - variable-speed R-series cabinet tier),
-- read directly this session.
--
-- Covers Amana ARVT960803BN and Goodman GRVT960803BN. No Daikin sibling
-- exists in this catalog for this tier (unlike the other platforms this
-- session, there is no "DRVT..." row to consider or exclude).
--
--   - Venting category: cover page states "(Type FSP CATEGORY IV Direct
--     or Non Direct Vent Air Furnace)", complies with ANSI Z21.47/
--     CSA-2.3.
--   - Clearances to combustibles (p.7, real "*RVT96" table, upflow
--     cabinet, inches): Upflow - sides 0, rear 0, front 3, bottom C
--     (wood floor only if combustible), flue 0, top 1; Horizontal -
--     sides 6, rear 0, front 3, bottom C, flue 0, top 6 - numerically
--     identical to the non-variable-speed *R9T96 platform's own real
--     clearances (same cabinet generation), confirmed independently from
--     this unit's own document.
--   - Gas supply (inlet) pressure (p.24, real table): Natural Gas Min
--     4.5in w.c. / Max 10.0in w.c.; Propane Min 11.0in w.c. / Max 13.0in
--     w.c.
--   - Gas manifold pressure (p.40, real "Manifold Gas Pressure" table).
--     Real, notable finding: unlike the sibling non-variable-speed
--     *R9T96 platform (migration 20260828020000), whose own startup
--     procedure reused ONE target table for both low and high stage,
--     this variable-speed platform's own White-Rodgers 36J54 two-stage
--     valve has genuinely DIFFERENT published low-stage and high-stage
--     manifold pressure targets: Natural Low Stage range 1.6-2.2in w.c.
--     nominal 1.9in w.c., High Stage range 3.2-3.8in w.c. nominal 3.5in
--     w.c.; Propane Low Stage range 5.7-6.3in w.c. nominal 6.0in w.c.,
--     High Stage range 9.7-10.3in w.c. nominal 10.0in w.c. A real,
--     disclosed distinction between two nominally similar "two-stage
--     96% AFUE" platforms (AR9T96 vs ARVT96), not assumed identical.
do $$
declare
  v_amana_id uuid := 'e9de41f8-2920-4b75-b021-50e58bd056fa';
  v_goodman_id uuid := '89126311-526a-4b14-b054-435168789b24';
  v_source text := 'Installation Instructions for *DVT96* & *RVT96* Two-Stage Gas Furnace (IOG-2044, 03/2024, Daikin Comfort Technologies Manufacturing/Goodman/Amana - variable-speed R-series cabinet tier) - cover page (Category IV), p.7 (*RVT96 clearances to combustibles table, upflow cabinet), p.24 (Inlet Gas Supply Pressure table), p.40 (Manifold Gas Pressure table - genuinely distinct low-stage and high-stage targets, unlike the sibling non-variable-speed *R9T96 platform''s shared single target).';
  v_clearances jsonb := '{
    "upflow": {"sides": 0, "rear": 0, "front": 3, "bottom_note": "C - if placed on combustible floor, floor must be wood only", "flue": 0, "top": 1},
    "horizontal": {"sides": 6, "rear": 0, "front": 3, "bottom_note": "C - if placed on combustible floor, floor must be wood only", "flue": 0, "top": 6},
    "service_clearance_front_in": 24,
    "note": "Accessibility/service clearance takes precedence over the enclosure clearances above wherever it is greater."
  }'::jsonb;
  v_equipment_id uuid;
begin
  foreach v_equipment_id in array array[v_amana_id, v_goodman_id]
  loop
    insert into public.equipment_combustion_specs (
      equipment_id, venting_category,
      manifold_pressure_natural_gas_low_iwc, manifold_pressure_natural_gas_high_iwc,
      manifold_pressure_propane_low_iwc, manifold_pressure_propane_high_iwc,
      natural_gas_supply_pressure_min_iwc, natural_gas_supply_pressure_max_iwc,
      propane_supply_pressure_min_iwc, propane_supply_pressure_max_iwc,
      clearances_in, source_document
    ) values (
      v_equipment_id, 'IV',
      1.9, 3.5,
      6.0, 10.0,
      4.5, 10.0,
      11.0, 13.0,
      v_clearances, v_source
    )
    on conflict (equipment_id) do update set
      venting_category = excluded.venting_category,
      manifold_pressure_natural_gas_low_iwc = excluded.manifold_pressure_natural_gas_low_iwc,
      manifold_pressure_natural_gas_high_iwc = excluded.manifold_pressure_natural_gas_high_iwc,
      manifold_pressure_propane_low_iwc = excluded.manifold_pressure_propane_low_iwc,
      manifold_pressure_propane_high_iwc = excluded.manifold_pressure_propane_high_iwc,
      natural_gas_supply_pressure_min_iwc = excluded.natural_gas_supply_pressure_min_iwc,
      natural_gas_supply_pressure_max_iwc = excluded.natural_gas_supply_pressure_max_iwc,
      propane_supply_pressure_min_iwc = excluded.propane_supply_pressure_min_iwc,
      propane_supply_pressure_max_iwc = excluded.propane_supply_pressure_max_iwc,
      clearances_in = excluded.clearances_in,
      source_document = excluded.source_document;
  end loop;
end $$;
