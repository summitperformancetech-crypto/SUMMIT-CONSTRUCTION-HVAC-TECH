-- Fifth real furnace-platform batch for equipment_combustion_specs.
-- Real Installation Instructions for *DVM97* & *RVM97* Modulating Gas
-- Furnace (IOG-2045, 04/2024, Daikin Comfort Technologies
-- Manufacturing/Goodman/Amana - R-series cabinet tier, distinct from the
-- already-sourced *MVM97/*CVM97 M-series platform, migration
-- 20260827410000), read directly this session.
--
-- Covers only Amana ARVM970803BN and Goodman GRVM970803BN - this
-- document's own filter-sizing table (p.30) literally prints
-- "*RVM970803BN*" (wildcard standing for the brand letter), matching
-- these two catalog rows' "RVM970803BN" suffix exactly. Daikin's
-- DR97MC0803BN is deliberately NOT included - its model number does not
-- match this document's "*RVM97"/"*DVM97" wildcard convention (Daikin's
-- naming here uses a "97MC" suffix instead, as it does on the already-
-- confirmed M-series DM97MC0803BNA), and no document read this session
-- confirms which real platform DR97MC0803BN belongs to. Left unassigned
-- rather than guessed, same as the DR96TC0803BN gap disclosed in
-- migrations 20260828010000/20260828020000.
--
--   - Venting category: cover page states "(Type FSP CATEGORY IV Direct
--     or Non Direct Vent Air Furnace)", complies with ANSI Z21.47/
--     CSA-2.3.
--   - Clearances to combustibles (p.7, real tables, inches). *RVM97
--     (upflow): sides 0, rear 0, front 3, bottom C (wood floor only if
--     combustible), flue 0, top 1; Horizontal: sides 6, rear 0, front 3,
--     bottom C, flue 0, top 6. Real, notable difference from the
--     M-series platform's own clearance table (migration 20260827410000):
--     that document listed a distinct "Upflow Horizontal Alcove" position
--     with rear clearance 4in, while this R-series document's simple
--     "Horizontal" position lists rear clearance 0in - genuinely
--     different published clearance structures between the two cabinet
--     tiers, not reconciled or assumed equal.
--   - Gas supply (inlet) pressure (p.24, real table): Natural Gas Min
--     4.5in w.c. / Max 10.0in w.c.; Propane Min 11.0in w.c. / Max 13.0in
--     w.c.
--   - Gas manifold pressure (p.40, real "Manifold Gas Pressure" table):
--     unlike the M-series document (which published only a single
--     High-Stage nominal/range figure since it called the valve
--     continuously modulating), this R-series document explicitly
--     publishes two real set points - Natural: 50% input nominal 0.9in
--     w.c., 100% input nominal 3.5in w.c., overall range 0.6-3.8in w.c.;
--     Propane: 50% input nominal 2.5in w.c., 100% input nominal 10.0in
--     w.c., overall range 2.2-10.3in w.c. Stored here as low/high fields
--     using the document's own 50%/100% nominal values, since this
--     platform's own manual chose to publish both rather than only a
--     high-fire figure.
do $$
declare
  v_amana_id uuid := 'a1c4ed72-af24-4467-b8b5-e1f9271a6434';
  v_goodman_id uuid := '8f505716-f701-4275-8ced-9d130191885d';
  v_source text := 'Installation Instructions for *DVM97* & *RVM97* Modulating Gas Furnace (IOG-2045, 04/2024, Daikin Comfort Technologies Manufacturing/Goodman/Amana - R-series cabinet tier) - cover page (Category IV), p.7 (*RVM97 clearances to combustibles table, upflow cabinet), p.24 (Inlet Gas Supply Pressure table), p.40 (Manifold Gas Pressure table, 50%/100% input nominal values). Covers only ARVM970803BN/GRVM970803BN (model number matches the manual''s own "*RVM970803BN" wildcard printed in its filter-sizing table, p.30); Daikin DR97MC0803BN deliberately not assigned - its model number does not match this manual''s wildcard convention and is not confirmed against this or any other platform read this session.';
  v_clearances jsonb := '{
    "upflow": {"sides": 0, "rear": 0, "front": 3, "bottom_note": "C - if placed on combustible floor, floor must be wood only", "flue": 0, "top": 1},
    "horizontal": {"sides": 6, "rear": 0, "front": 3, "bottom_note": "C - if placed on combustible floor, floor must be wood only", "flue": 0, "top": 6},
    "service_clearance_front_in": 24,
    "note": "Accessibility/service clearance takes precedence over the enclosure clearances above wherever it is greater. Real, distinct from the M-series *MVM97 platform''s clearance table, which lists a separate Upflow Horizontal Alcove position with 4in rear clearance not present in this R-series document."
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
      0.9, 3.5,
      2.5, 10.0,
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
