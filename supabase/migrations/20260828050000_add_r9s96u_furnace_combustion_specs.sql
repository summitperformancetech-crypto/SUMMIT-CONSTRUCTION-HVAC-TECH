-- Seventh real furnace-platform batch for equipment_combustion_specs.
-- Real Installation Instructions for *R9S96*U Ultra Low NOx Gas Furnace
-- (IOG-2040C, 01/2025, Daikin Comfort Technologies Manufacturing/
-- Goodman/Amana), read directly this session.
--
-- Covers Amana AR9S96-U0805CU and Goodman GR9S96-U0805CU - the model
-- number "*R9S960805CU" is literally printed in the manual's own
-- high-altitude derate table (p.23, Table 5) and airflow tables (p.42),
-- confirming the match. No Daikin ULN variant exists in this catalog.
--
--   - Real, notable distinguishing facts about this platform, genuinely
--     different from the standard (non-ULN) *R9S96 platform already
--     sourced (migration 20260828010000): this unit is explicitly
--     California-only ("designed to meet the NOx requirement of 14Ng/J
--     maximum as required by the South Coast Air Quality Management
--     District and the San Joaquin Valley Air Pollution Control
--     District... intended for installation in those districts only"),
--     is natural-gas ONLY with no propane conversion offered at all
--     ("This unit is not approved for use with gases other than Natural
--     Gas" - confirmed by the complete absence of any propane row in
--     this manual's own Inlet Gas Supply Pressure table, p.23, Table 4,
--     unlike every other furnace platform sourced this session), and
--     uses a sealed premix burner design (p.37) rather than the standard
--     platform's burner. Propane fields intentionally left NULL here -
--     a real "does not exist" fact, not an unconfirmed gap.
--   - Venting category: cover page states "(Type FSP CATEGORY IV Direct
--     or Non Direct Vent Air Furnace)", complies with ANSI Z21.47/
--     CSA-2.3.
--   - Clearances to combustibles (p.6, real "*R9S96" table, inches):
--     Upflow - sides 0, rear 0, front 3, bottom C (wood floor only if
--     combustible), flue 0, top 1; Horizontal - sides 6, rear 0, front 3,
--     bottom C, flue 0, top 6 - numerically identical to the standard
--     *R9S96 platform's own clearances (same cabinet), independently
--     confirmed from this unit's own document.
--   - Gas supply (inlet) pressure (p.23, real Table 4): Natural Gas Min
--     4.5in w.c. / Max 10.0in w.c. - identical range to every other
--     platform checked this session, independently confirmed again.
--   - Gas manifold pressure (p.31, real "Manifold Gas Pressure" Table 8):
--     Natural range 2.8-3.2in w.c., nominal 3.0in w.c. - a real, GENUINELY
--     DIFFERENT (lower, narrower) target than the standard *R9S96
--     platform's 3.2-3.8in w.c./3.5in w.c. nominal - attributable to this
--     platform's distinct ultra-low-NOx premix burner design, not
--     reconciled or assumed equal despite the shared cabinet/clearances.
--   - Real, additional high-altitude data disclosed but NOT stored (no
--     schema column for altitude-specific manifold pressure): at 5000ft,
--     manifold pressure derates to 2.5in w.c.; at 7500ft, 2.4in w.c.
--     (p.23, Table 5) - a real fact worth knowing for high-altitude
--     installs, left out of this row since the schema only models
--     sea-level/standard-altitude manifold pressure.
do $$
declare
  v_amana_id uuid := 'ca6dbaaf-0635-4f27-a221-636a0f8e0d23';
  v_goodman_id uuid := '861710e9-30eb-4e33-a6f6-101252d75ead';
  v_source text := 'Installation Instructions for *R9S96*U Ultra Low NOx Gas Furnace (IOG-2040C, 01/2025, Daikin Comfort Technologies Manufacturing/Goodman/Amana) - cover page (Category IV), p.2 (natural-gas-only, California South Coast AQMD/San Joaquin Valley APCD 14Ng/J NOx requirement), p.6 (*R9S96 clearances to combustibles table), p.23 (Table 4, Inlet Gas Supply Pressure - no propane row exists in this table, confirming natural-gas-only), p.31 (Table 8, Manifold Gas Pressure - real, lower/narrower target than the standard non-ULN *R9S96 platform). Model number confirmed via literal "*R9S960805CU" print in Table 5 (p.23) and the airflow tables (p.42). No propane data - this unit has no propane variant.';
  v_clearances jsonb := '{
    "upflow": {"sides": 0, "rear": 0, "front": 3, "bottom_note": "C - if placed on combustible floor, floor must be wood only", "flue": 0, "top": 1},
    "horizontal": {"sides": 6, "rear": 0, "front": 3, "bottom_note": "C - if placed on combustible floor, floor must be wood only", "flue": 0, "top": 6},
    "service_clearance_front_in": 24,
    "note": "Accessibility/service clearance takes precedence over the enclosure clearances above wherever it is greater. Natural-gas-only Ultra Low NOx platform (California South Coast AQMD/San Joaquin Valley APCD only) - no propane conversion exists for this unit."
  }'::jsonb;
  v_equipment_id uuid;
begin
  foreach v_equipment_id in array array[v_amana_id, v_goodman_id]
  loop
    insert into public.equipment_combustion_specs (
      equipment_id, venting_category,
      manifold_pressure_natural_gas_high_iwc,
      natural_gas_supply_pressure_min_iwc, natural_gas_supply_pressure_max_iwc,
      clearances_in, source_document
    ) values (
      v_equipment_id, 'IV',
      3.0,
      4.5, 10.0,
      v_clearances, v_source
    )
    on conflict (equipment_id) do update set
      venting_category = excluded.venting_category,
      manifold_pressure_natural_gas_high_iwc = excluded.manifold_pressure_natural_gas_high_iwc,
      natural_gas_supply_pressure_min_iwc = excluded.natural_gas_supply_pressure_min_iwc,
      natural_gas_supply_pressure_max_iwc = excluded.natural_gas_supply_pressure_max_iwc,
      clearances_in = excluded.clearances_in,
      source_document = excluded.source_document;
  end loop;
end $$;
