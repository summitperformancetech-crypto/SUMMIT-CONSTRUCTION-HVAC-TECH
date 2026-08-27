-- Full current dealer-available Amana lineup, furnace + package_unit
-- categories (per user directive: entire product line currently
-- available to a dealer, full ancillary-data depth). Real, current
-- (2024-2025 "R-32" generation literature) model numbers and specs
-- from amana-hac.com's own spec sheets - NOT the older R-410A-era
-- naming (AMVM97/APGM5 3608041A) already in the catalog from Gap 01,
-- which this supersedes as the current top-modulating-furnace /
-- top-package-gas-electric pick but is left in place (real prior data,
-- not destroyed - both may still be dealer-orderable during the
-- refrigerant-generation transition).
--
-- R/D orientation pairs (e.g. ARVM97 upflow vs ADVM97 downflow) share
-- one spec table per source document and are the same physical
-- product - only the upflow/multipoise (R) variant is cataloged, not
-- duplicated. Ultra-Low-NOx (-U) regional-compliance variants are
-- cataloged separately only where their real published numbers
-- (AR9S96-U) differ from the non-U version - confirmed by reading both
-- documents, not assumed identical.
--
-- Furnaces: 6 real current tiers sourced (of ~9-12 real tiers Amana
-- currently lists across the 80%/90%+ categories) - AR9T80, ARVT80,
-- and ARVS80-U were not obtainable this pass (distributor spec-sheet
-- hosts returned 403/warranty-only documents, not the real product
-- spec table) and remain a genuine, disclosed sourcing gap, not
-- guessed. stage_type follows this catalog's existing furnace
-- convention (Gap 01): 'variable_speed' only when the blower is a
-- true continuously-variable ECM ("VS ECM" in the source document);
-- otherwise reflects the real gas-valve staging (single/two_stage) for
-- furnaces with a fixed-tap ("9 Speed") blower.
--
--   ARVM97 0803BN - SS-ARVM97_ADVM97-R32 (12/24), p.3: 80,000 in /
--     77,600 out, 97% AFUE, modulating valve, VS ECM blower, filter
--     (1) 16x25, MCA 8.1A / MOCP 15A. Current replacement for the
--     Gap 01 AMVM97 pick.
--   ARVT96 0803BN - SS-ARVT96_ADVT96-R32 (12/24), p.3: 80,000 in /
--     76,880 out, 96.1% AFUE, two-stage valve, VS ECM blower, filter
--     (1) 16x25, MCA 7.6A / MOCP 15A.
--   AR9S96-U 0805CU - SS-AR9S96-U-R32 (10/24), p.3: 80,000 in / 77,600
--     out, 97.0% AFUE, single-stage valve, 9-speed ECM blower (Ultra-
--     Low-NOx), filter (1) 20x25 or (2) 16x25, MCA 15.1A / MOCP 25A.
--   AR9S96 0803BN - SS-AR9S96_AD9S96-R32, p.3: 80,000 in / 76,880 out,
--     96% AFUE, single-stage valve, 9-speed ECM blower (standard, non-
--     ULN - real, confirmed different numbers than AR9S96-U above),
--     filter (1) 16x25, MCA 10.1A / MOCP 15A.
--   AR9T96 0803BN - SS-AR9T96_AD9T96-R32 (05/25), p.3: 80,000 in /
--     76,800 out, 96% AFUE, two-stage valve, 9-speed ECM blower,
--     filter (1) 20x25 or (2) 16x25, MCA 7.8A / MOCP 15A.
--   AR9S80 0803B - SS-AR9S80_AD9S80-R32 (08/24), p.3: 80,000 in /
--     64,000 out, 80% AFUE, single-stage valve, 9-speed ECM blower,
--     MCA 7.7A / MOCP 15A. No filter-size row published in this
--     document's Product Specifications table (real gap - the 90%+
--     tier docs list it, this 80% one doesn't).
--
-- Package units: 3 real current tiers sourced (of ~5 Amana currently
-- lists: APGM5/APGM3 gas-electric, APHM5/APHM3 heat pump, APCH3 AC-
-- only) - APHM3, APCH3, and the Ultra-Low-NOx APUM3 variant were not
-- sourced this pass, a genuine disclosed gap. stage_type follows this
-- catalog's existing package-unit convention (Gap 01): compressor
-- staging, not blower type. No filter-size data found in either
-- document's main tables (both only list a downflow filter-rack
-- accessory kit, not a standard filter dimension) - real gap, not
-- guessed.
--
--   APGM5 3608031 - SS-APGM5-R32 (08/25), p.3: 35,600 Btu/h cooling
--     (SEER2 15.2/EER2 11.5), 80,000 input/64,800 output heating (81%
--     AFUE), two-stage scroll, 208/230-1, MCA 25A / MOCP 35A. Current
--     replacement for the Gap 01 APGM5 3608041A pick.
--   APGM3 3606041 - SS-APGM3 (08/22), p.3: 34,200 Btu/h cooling (SEER2
--     13.4/EER2 10.6), 60,000 input/48,600 output heating (81% AFUE),
--     single-stage scroll, 208/230-1, MCA 22.8A / MOCP 35A.
--   APHM5 3631 - SS-APHM5-R32 (08/25), p.3: 36,000 Btu/h cooling
--     (SEER2 15.2/EER2 11.4), 35,400 Btu/h heating output @ 47°F
--     (COP 3.6, 22,000 Btu/h @ 17°F, HSPF2 6.80), two-stage scroll,
--     208-230/1, MCA 22.8A / MOCP 35A.
do $$
declare
  f1 uuid; f2 uuid; f3 uuid; f4 uuid; f5 uuid; f6 uuid;
  p1 uuid; p2 uuid; p3 uuid;
begin
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Amana', 'ARVM970803BN', 'furnace', 'variable_speed', null, 77600, null, 'Amana SS-ARVM97_ADVM97-R32 (12/24), www.amana-hac.com, p.3 Product Specifications, ARVM97 0803BN column: 80,000 Btu/h input / 77,600 Btu/h output, 97% AFUE, modulating gas valve, variable-speed ECM blower, filter (1) 16x25, 115V/1ph/60Hz, MCA 8.1A / MOCP 15A')
    returning id into f1;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Amana', 'ARVT960803BN', 'furnace', 'variable_speed', null, 76880, null, 'Amana SS-ARVT96_ADVT96-R32 (12/24), www.amana-hac.com, p.3 Product Specifications, ARVT96 0803BN column: 80,000 Btu/h input / 76,880 Btu/h output, 96.1% AFUE, two-stage gas valve, variable-speed ECM blower, filter (1) 16x25, 115V/1ph/60Hz, MCA 7.6A / MOCP 15A')
    returning id into f2;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Amana', 'AR9S96-U0805CU', 'furnace', 'single', null, 77600, null, 'Amana SS-AR9S96-U-R32 (10/24, supersedes 09/24), www.amana-hac.com, p.3 AR9S96-U Specifications, AR9S96 0805CU column: 80,000 Btu/h input / 77,600 Btu/h output, 97.0% AFUE, single-stage gas valve, 9-speed ECM blower, Ultra-Low-NOx, filter (1) 20x25 or (2) 16x25, 115V/1ph/60Hz, MCA 15.1A / MOCP 25A')
    returning id into f3;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Amana', 'AR9S960803BN', 'furnace', 'single', null, 76880, null, 'Amana SS-AR9S96_AD9S96-R32, www.amana-hac.com, p.3 AR9S96 Product Specifications, AR9S96 0803BN column: 80,000 Btu/h input / 76,880 Btu/h output, 96% AFUE, single-stage gas valve, 9-speed ECM blower (standard, non-ULN - real numbers confirmed different from AR9S96-U), filter (1) 16x25, 115V/1ph/60Hz, MCA 10.1A / MOCP 15A')
    returning id into f4;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Amana', 'AR9T960803BN', 'furnace', 'two_stage', null, 76800, null, 'Amana SS-AR9T96_AD9T96-R32 (05/25), www.amana-hac.com, p.3 Product Specifications, AR9T96 0803BN column: 80,000 Btu/h input / 76,800 Btu/h output, 96% AFUE, two-stage gas valve, 9-speed ECM blower, filter (1) 20x25 or (2) 16x25, 115V/1ph/60Hz, MCA 7.8A / MOCP 15A')
    returning id into f5;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Amana', 'AR9S800803B', 'furnace', 'single', null, 64000, null, 'Amana SS-AR9S80_AD9S80-R32 (08/24), www.amana-hac.com, p.3 Product Specifications, AR9S80 0803B column: 80,000 Btu/h input / 64,000 Btu/h output, 80% AFUE, single-stage gas valve, 9-speed ECM blower, 115V/1ph/60Hz, MCA 7.7A / MOCP 15A. No filter-size row published in this document (real gap, not guessed)')
    returning id into f6;

  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Amana', 'APGM53608031', 'package_unit', 'two_stage', 35600, 64800, 1200, 'Amana SS-APGM5-R32 (08/25), www.amana-hac.com, p.3 Product Specifications, APGM5 3608031 column: 35,600 Btu/h cooling (SEER2 15.2/EER2 11.5), 80,000 input/64,800 output Btu/h heating (81% AFUE), two-stage scroll compressor, variable-speed indoor blower, 208/230-1-60, MCA 25A / MOCP 35A. Current replacement for the Gap 01 APGM5 3608041A pick.')
    returning id into p1;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Amana', 'APGM33606041', 'package_unit', 'single', 34200, 48600, 1200, 'Amana SS-APGM3 (08/22), www.amana-hac.com, p.3 Product Specifications, APGM3 3606041 column: 34,200 Btu/h cooling (SEER2 13.4/EER2 10.6), 60,000 input/48,600 output Btu/h heating (81% AFUE), single-stage scroll compressor, 208/230-1-60, MCA 22.8A / MOCP 35A')
    returning id into p2;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Amana', 'APHM53631', 'package_unit', 'two_stage', 36000, 35400, 1200, 'Amana SS-APHM5-R32 (08/25), www.amana-hac.com, p.3 Product Specifications, APHM5 3631 column: 36,000 Btu/h cooling (SEER2 15.2/EER2 11.4), heating output 35,400 Btu/h @ 47F (COP 3.6) / 22,000 Btu/h @ 17F (COP 2.26), HSPF2 6.80, two-stage scroll compressor, 208-230/1-60, MCA 22.8A / MOCP 35A. nominal_heating_capacity_btu uses the real 47F rating point (ACCA/AHRI standard heat-pump heating reference), not a gas-furnace AFUE-style figure.')
    returning id into p3;

  insert into public.equipment_electrical_specs (equipment_id, voltage_phase, min_circuit_ampacity, max_overcurrent_protection, source_document) values
    (f1, '115/1', 8.1, 15, 'Amana SS-ARVM97_ADVM97-R32 (12/24), p.3, ARVM97 0803BN column, Electrical Data'),
    (f2, '115/1', 7.6, 15, 'Amana SS-ARVT96_ADVT96-R32 (12/24), p.3, ARVT96 0803BN column, Electrical Data'),
    (f3, '115/1', 15.1, 25, 'Amana SS-AR9S96-U-R32 (10/24), p.3, AR9S96 0805CU column, Electrical Data'),
    (f4, '115/1', 10.1, 15, 'Amana SS-AR9S96_AD9S96-R32, p.3, AR9S96 0803BN column, Electrical Data'),
    (f5, '115/1', 7.8, 15, 'Amana SS-AR9T96_AD9T96-R32 (05/25), p.3, AR9T96 0803BN column, Electrical Data'),
    (f6, '115/1', 7.7, 15, 'Amana SS-AR9S80_AD9S80-R32 (08/24), p.3, AR9S80 0803B column, Electrical Data'),
    (p1, '208/230/1', 25, 35, 'Amana SS-APGM5-R32 (08/25), p.3, APGM5 3608031 column, Electrical Data'),
    (p2, '208/230/1', 22.8, 35, 'Amana SS-APGM3 (08/22), p.3, APGM3 3606041 column, Electrical Data'),
    (p3, '208-230/1', 22.8, 35, 'Amana SS-APHM5-R32 (08/25), p.3, APHM5 3631 column, Electrical Data');

  insert into public.equipment_filter_specs (equipment_id, filter_furnished, filter_type, filter_size, source_document) values
    (f1, false, 'Throwaway', '(1) 16x25 (side or bottom)', 'Amana SS-ARVM97_ADVM97-R32 (12/24), p.3 Product Specifications, ARVM97 0803BN column, Filter Size row'),
    (f2, false, 'Throwaway', '(1) 16x25 (side or bottom)', 'Amana SS-ARVT96_ADVT96-R32 (12/24), p.3 Product Specifications, ARVT96 0803BN column, Filter Size row'),
    (f3, false, 'Throwaway', '(1) 20x25 (bottom) or (2) 16x25 (side)', 'Amana SS-AR9S96-U-R32 (10/24), p.3, AR9S96 0805CU column, Filter Size row'),
    (f4, false, 'Throwaway', '(1) 16x25 (side or bottom)', 'Amana SS-AR9S96_AD9S96-R32, p.3, AR9S96 0803BN column, Filter Size row'),
    (f5, false, 'Throwaway', '(1) 20x25 (bottom) or (2) 16x25 (side)', 'Amana SS-AR9T96_AD9T96-R32 (05/25), p.3, AR9T96 0803BN column, Filter Size row')
  on conflict (equipment_id) do nothing;
end $$;
