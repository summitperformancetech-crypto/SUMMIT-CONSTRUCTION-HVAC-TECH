-- Fourth real furnace-platform batch for equipment_combustion_specs.
-- Real Installation Instructions for *R9T96 & *D9T96 Two-Stage Gas
-- Furnaces (IOG-2038B, 12/2024, Daikin Comfort Technologies
-- Manufacturing/Goodman/Amana - shared platform), read directly this
-- session.
--
-- Covers only the two equipment_catalog rows whose exact model number is
-- literally printed in this manual's own vent-pipe-length table (p.18:
-- "*R9T960803BN"): Amana AR9T960803BN and Goodman GR9T960803BN. Daikin's
-- DR96TC0803BN is deliberately NOT included here either (see the sibling
-- 20260828010000 migration's comment) - its model number does not match
-- this manual's brand-wildcard convention and is not confirmed against
-- either the single-stage or two-stage 96% platform; this remains a real,
-- disclosed gap rather than a guess made either way.
--
--   - Venting category: cover page states "(Type FSP CATEGORY IV Direct
--     or Non Direct Vent Air Furnace)", complies with ANSI Z21.47/
--     CSA-2.3.
--   - Clearances to combustibles (p.7, real "*R9T96" table, upflow
--     cabinet, inches): Upflow - sides 0, rear 0, front 3, bottom C (wood
--     floor only if combustible), flue 0, top 1; Horizontal - sides 6,
--     rear 0, front 3, bottom C, flue 0, top 6 - numerically identical to
--     the single-stage *R9S96 platform's own real clearances (confirmed
--     independently from this unit's own document, not assumed from the
--     sibling single-stage platform).
--   - Gas supply (inlet) pressure (p.29, real table): Natural Gas Min
--     4.5in w.c. / Max 10.0in w.c.; Propane Min 11.0in w.c. / Max 13.0in
--     w.c.
--   - Gas manifold pressure (p.35, real "Manifold Gas Pressure Chart"):
--     Natural range 3.2-3.8in w.c., nominal 3.5in w.c.; Propane range
--     9.7-10.3in w.c., nominal 10.0in w.c. Real, notable fact specific to
--     this two-stage platform: despite having a genuine two-stage gas
--     valve (White-Rodgers 36J54) with separate LO/HI adjustment towers,
--     the manual's own startup procedure (p.35, steps 6-10) directs the
--     installer to target this SAME single Range/Nominal table for BOTH
--     the low-stage ("R"+"W1") and high-stage ("R"+"W1"+"W2") adjustment -
--     i.e. low-fire and high-fire manifold pressure share the same real
--     published target, with staging achieved through burner/orifice
--     count rather than a lower low-stage manifold pressure. Stored here
--     as identical low/high values per the document, not left as only a
--     "high" figure, since the manual explicitly re-uses the table for
--     both stages rather than omitting a low-stage value.
do $$
declare
  v_amana_id uuid := '57901d1b-dcae-447b-a366-b3aa91194296';
  v_goodman_id uuid := '02ee6c97-1b15-42ec-9770-90b3dde79393';
  v_source text := 'Installation Instructions for *R9T96 & *D9T96 Two-Stage Gas Furnaces (IOG-2038B, 12/2024, Daikin Comfort Technologies Manufacturing/Goodman/Amana - shared OEM platform) - cover page (Category IV), p.7 (*R9T96 clearances to combustibles table, upflow cabinet), p.29 (Inlet Gas Supply Pressure table), p.35 (Manifold Gas Pressure Chart - the same single Range/Nominal table is explicitly used for both low-stage and high-stage adjustment per the manual''s own startup procedure). Covers only AR9T960803BN/GR9T960803BN (model number literally printed in the manual''s vent-pipe-length table, p.18); Daikin DR96TC0803BN deliberately not assigned - see sibling migration 20260828010000.';
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
      3.5, 3.5,
      10.0, 10.0,
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
