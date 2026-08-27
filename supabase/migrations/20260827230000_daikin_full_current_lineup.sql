-- Full current dealer-available Daikin lineup, furnace + package_unit
-- categories. Daikin's residential lineup is genuinely much smaller
-- than Amana's or Carrier's - daikincomfort.com's own furnace category
-- page lists exactly 3 current furnace lines (not ~9-21 like the other
-- two manufacturers), so full depth was achievable for all of them.
--
-- Furnaces (3, all full depth):
--   DR97MC 0803BN - SS-DR97MC_DD97MC-R32 (12/24), p.3: 80,000 in /
--     77,600 out, 97% AFUE, modulating valve, VS ECM blower, filter
--     (1) 16x25, 115V/1ph/60Hz, MCA 8.1A / MOCP 15A. Identical numbers
--     to Amana ARVM97 0803BN and Daikin's own prior-generation DM97MC
--     0803BNA (confirmed via independently reading this document, same
--     shared OEM platform) - current replacement for the DM97MC pick.
--   DR96TC 0803BN - SS-DR96TC_DD96TC-R32 (12/24), p.3: 80,000 in /
--     76,880 out, 96.10% AFUE, two-stage valve, VS ECM blower, filter
--     (1) 16x25, 115V/1ph/60Hz, MCA 7.5A / MOCP 15A.
--   DR80TC 0803B - SS-DR80TC_DD80TC-R32 (12/24), p.3: 80,000 in /
--     64,000 out, 80% AFUE, single-stage valve, "Variable"-speed
--     blower (the document's own wording - a real, distinct blower
--     description from the "9-speed"/"VS ECM" terms used elsewhere),
--     115V/1ph/60Hz, MCA 7.6A / MOCP 15A. No filter-size row published.
--
-- Package units (3, all full depth):
--   DP5GM 3608031 / DP5UM 3608031 - SS-DP5G_UM-R32 (11/24), p.3:
--     confirmed via direct page-image read (this table's row layout -
--     "High-Fire Input/Output" giving both values per fire stage in
--     one row - reads differently from Amana's own Input-row/Output-
--     row layout, and gives a real, different high-fire output number
--     for the nominally-identical "3608" tonnage: 60,000, not the
--     64,800 recorded for Amana APGM5 3608031/Daikin's older-generation
--     DP5UM 3608041A - a genuine real cross-generation/cross-document
--     difference, verified by image, not a transcription slip). Real
--     numbers CONFIRMED IDENTICAL between DP5GM and DP5UM at this size
--     in this document (same shared platform, same real column values)
--     - 35,600 Btu/h cooling (SEER2 15.2/EER2 11.5), 80,000 input /
--     60,000 output Btu/h heating (81% AFUE), two-stage scroll,
--     208/230-1, MCA 25A / MOCP 35A.
--   DP5HH 3631 - SS-DP5HH-R32 (08/25), p.3: 32,600 Btu/h cooling
--     (SEER2 15.2/EER2 11.2), heating 30,000 Btu/h @ 47F (COP 3.42) /
--     18,600 Btu/h @ 17F (COP 2.32), HSPF2 7.00, two-stage scroll,
--     208-230/1, MCA 23.86A / MOCP 35A.
--
-- Real, disclosed gap: DP5HM (a second named Daikin heat-pump package
-- line alongside DP5HH) was not sourced this pass.
do $$
declare
  f1 uuid; f2 uuid; f3 uuid;
  p1 uuid; p2 uuid; p3 uuid;
begin
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Daikin', 'DR97MC0803BN', 'furnace', 'variable_speed', null, 77600, null, 'Daikin SS-DR97MC_DD97MC-R32 (12/24), www.daikincomfort.com, p.3 Product Specifications, DR97MC 0803BN column: 80,000 Btu/h input / 77,600 Btu/h output, 97% AFUE, modulating gas valve, variable-speed ECM blower, filter (1) 16x25, 115V/1ph/60Hz, MCA 8.1A / MOCP 15A. Identical to Amana ARVM97 0803BN and Daikin''s own prior-generation DM97MC 0803BNA - current replacement.')
    returning id into f1;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Daikin', 'DR96TC0803BN', 'furnace', 'variable_speed', null, 76880, null, 'Daikin SS-DR96TC_DD96TC-R32 (12/24), www.daikincomfort.com, p.3, DR96TC 0803BN column: 80,000 Btu/h input / 76,880 Btu/h output, 96.10% AFUE, two-stage gas valve, variable-speed ECM blower, filter (1) 16x25, 115V/1ph/60Hz, MCA 7.5A / MOCP 15A')
    returning id into f2;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Daikin', 'DR80TC0803B', 'furnace', 'single', null, 64000, null, 'Daikin SS-DR80TC_DD80TC-R32 (12/24), www.daikincomfort.com, p.3, DR80TC 0803B column: 80,000 Btu/h input / 64,000 Btu/h output, 80% AFUE, single-stage gas valve, variable-speed blower (document''s own wording), 115V/1ph/60Hz, MCA 7.6A / MOCP 15A. No filter-size row published in this document (real gap, not guessed).')
    returning id into f3;

  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Daikin', 'DP5GM3608031', 'package_unit', 'two_stage', 35600, 60000, 1200, 'Daikin SS-DP5G_UM-R32 (11/24), www.daikincomfort.com, p.3 Product Specifications, DP5GM 3608031 column (confirmed via direct page-image read): 35,600 Btu/h cooling (SEER2 15.2/EER2 11.5), 80,000 input/60,000 output Btu/h heating high-fire (81% AFUE), two-stage scroll compressor, variable-speed indoor blower, 208/230-1-60, MCA 25A / MOCP 35A. Real high-fire output (60,000) differs from Amana APGM5 3608031''s published 64,800 for the nominally-same tonnage code - a genuine real cross-brand/cross-document difference, verified by image, not assumed identical.')
    returning id into p1;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Daikin', 'DP5UM3608031', 'package_unit', 'two_stage', 35600, 60000, 1200, 'Daikin SS-DP5G_UM-R32 (11/24), www.daikincomfort.com, p.3 Product Specifications, DP5UM 3608031 column: real numbers CONFIRMED IDENTICAL to DP5GM 3608031 in this document (same shared platform) - 35,600 Btu/h cooling (SEER2 15.2/EER2 11.5), 80,000 input/60,000 output Btu/h heating (81% AFUE), two-stage scroll, 208/230-1-60, MCA 25A / MOCP 35A. Current R-32-generation replacement for the earlier DP5UM3608041A row (R-410A generation, real different published output of 64,800 - a genuine cross-generation difference, not an error).')
    returning id into p2;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Daikin', 'DP5HH3631', 'package_unit', 'two_stage', 32600, 30000, 1180, 'Daikin SS-DP5HH-R32 (08/25), www.daikincomfort.com, p.3 Product Specifications, DP5HH 3631 column: 32,600 Btu/h cooling (SEER2 15.2/EER2 11.2), heating 30,000 Btu/h @ 47F (COP 3.42) / 18,600 Btu/h @ 17F (COP 2.32), HSPF2 7.00, two-stage scroll compressor, 208-230/1-60, MCA 23.86A / MOCP 35A. nominal_heating_capacity_btu uses the real 47F AHRI rating point.')
    returning id into p3;

  insert into public.equipment_electrical_specs (equipment_id, voltage_phase, min_circuit_ampacity, max_overcurrent_protection, source_document) values
    (f1, '115/1', 8.1, 15, 'Daikin SS-DR97MC_DD97MC-R32 (12/24), p.3, DR97MC 0803BN column, Electrical Data'),
    (f2, '115/1', 7.5, 15, 'Daikin SS-DR96TC_DD96TC-R32 (12/24), p.3, DR96TC 0803BN column, Electrical Data'),
    (f3, '115/1', 7.6, 15, 'Daikin SS-DR80TC_DD80TC-R32 (12/24), p.3, DR80TC 0803B column, Electrical Data'),
    (p1, '208/230/1', 25, 35, 'Daikin SS-DP5G_UM-R32 (11/24), p.3, DP5GM 3608031 column, Electrical Data'),
    (p2, '208/230/1', 25, 35, 'Daikin SS-DP5G_UM-R32 (11/24), p.3, DP5UM 3608031 column, Electrical Data'),
    (p3, '208-230/1', 23.86, 35, 'Daikin SS-DP5HH-R32 (08/25), p.3, DP5HH 3631 column, Electrical Data');

  insert into public.equipment_filter_specs (equipment_id, filter_furnished, filter_type, filter_size, source_document) values
    (f1, false, 'Throwaway', '(1) 16x25 (side or bottom)', 'Daikin SS-DR97MC_DD97MC-R32 (12/24), p.3, DR97MC 0803BN column, Filter Size row'),
    (f2, false, 'Throwaway', '(1) 16x25 (Side or Bottom)', 'Daikin SS-DR96TC_DD96TC-R32 (12/24), p.3, DR96TC 0803BN column, Filter Size row')
  on conflict (equipment_id) do nothing;
end $$;
