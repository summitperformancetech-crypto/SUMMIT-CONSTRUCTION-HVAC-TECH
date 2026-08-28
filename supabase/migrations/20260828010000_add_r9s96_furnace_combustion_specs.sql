-- Third real furnace-platform batch for equipment_combustion_specs.
-- Real Installation Instructions for *R9S96/*D9S96 & *R9S92 Single-Stage
-- Gas Furnace (IOG-2037B, 12/2024, Daikin Comfort Technologies
-- Manufacturing/Goodman/Amana - shared platform), read directly this
-- session.
--
-- Covers only the two equipment_catalog rows whose exact model number is
-- literally printed in this manual's own pipe-sizing table (p.13:
-- "R9S960803BN - add 20' of 2" pipe for upflow position"): Amana
-- AR9S960803BN and Goodman GR9S960803BN. Daikin's DR96TC0803BN is
-- deliberately NOT included here - this manual's own brand-wildcard
-- convention (confirmed across the modulating and R9S80 platforms
-- already sourced) is "*R9S96" standing in for each brand's own R-cabinet
-- prefix (AR9S96/GR9S96/presumably DR9S96), and "DR96TC" does not match
-- that pattern or appear anywhere in this document - so it is left
-- unassigned rather than guessed onto either the single-stage or
-- two-stage 96% platform.
--
--   - Venting category: cover page states "(Type FSP CATEGORY IV Direct
--     or Non Direct Vent Air Furnace)", complies with ANSI Z21.47/
--     CSA-2.3 (96% AFUE condensing, consistent with the Category I->IV
--     AFUE correlation already observed on every platform checked this
--     session, but confirmed here from this unit's own cover page, not
--     inferred from AFUE alone).
--   - Clearances to combustibles (p.7, real table, inches). The upflow
--     ("*R9S96 & *R9S92") table: Upflow - sides 0, rear 0, front 3,
--     bottom C (wood floor only if combustible), flue 0, top 1;
--     Horizontal - sides 6, rear 0, front 3, bottom C, flue 0, top 6.
--     (The manual's separate "*D9S96" downflow-cabinet clearance table on
--     the same page is not relevant to AR9S960803BN/GR9S960803BN, which
--     are upflow "R" cabinets.) Plus the same real, separate 24in minimum
--     service clearance in front, taking precedence when greater.
--   - Gas supply (inlet) pressure (p.28, real table): Natural Gas Min
--     4.5in w.c. / Max 10.0in w.c.; Propane Min 11.0in w.c. / Max 13.0in
--     w.c. - independently confirmed again from this unit's own document,
--     numerically identical to every other Amana/Daikin/Goodman furnace
--     platform checked so far this session, but re-verified per-platform
--     rather than assumed.
--   - Gas manifold pressure (p.38, real "Manifold Gas Pressure" table,
--     single-stage - one real value per fuel, not high/low): Natural
--     range 3.2-3.8in w.c., nominal 3.5in w.c.; Propane range 9.7-10.3in
--     w.c., nominal 10.0in w.c.
do $$
declare
  v_amana_id uuid := '632a480b-0abf-483e-aa6a-21f13fbe981a';
  v_goodman_id uuid := '5cfc2e68-bc97-49fc-be96-bcf8cd18b994';
  v_source text := 'Installation Instructions for *R9S96/*D9S96 & *R9S92 Single-Stage Gas Furnace (IOG-2037B, 12/2024, Daikin Comfort Technologies Manufacturing/Goodman/Amana - shared OEM platform) - cover page (Category IV), p.7 (*R9S96 & *R9S92 clearances to combustibles table, upflow cabinet), p.28 (Inlet Gas Supply Pressure table), p.38 (Manifold Gas Pressure table, single-stage). Covers only AR9S960803BN/GR9S960803BN (model number literally printed in the manual''s pipe-sizing table, p.13); Daikin DR96TC0803BN deliberately not assigned - its model number does not match this manual''s brand-wildcard convention and is not confirmed against either the single-stage or two-stage 96% platform.';
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
