-- Full current dealer-available Carrier lineup, furnace + package_unit
-- categories. Per user directive: catalog every named variant
-- separately (do not collapse Low-NOx/Ultra-Low-NOx regional-
-- compliance duplicates into one row), full depth for the top tiers,
-- lighter treatment (real AFUE/SEER2/staging only, capacity and
-- electrical deferred) for older/entry tiers - both explicitly approved
-- by the user given the real scale (Carrier alone lists 21 distinct
-- named furnace lines and 14 named package-unit lines).
--
-- FURNACES - 10 full-depth (real Product Data PDF per tier or shared
-- tier document) + 10 lighter (real AFUE/staging confirmed from each
-- model's own carrier.com product page, capacity/electrical not
-- sourced this pass - real, disclosed, not guessed):
--
-- Full depth:
--   59TN7A 080C17-16 - Carrier 59TN7A Product Data (11/24), p.4:
--     80,000 in / 77,000 out (upflow), AFUE 97.0% upflow / 95% downflow
--     / 96.2% horizontal (real per-orientation AFUE - upflow used as
--     canonical), two-stage, field-supplied filter, 115V/1ph/60Hz,
--     MCA 13.4A / MOCP 15A.
--   59TP7A 080V17-16 - Carrier 59TP7A Product Data, p.4: 80,000 in /
--     77,000 out (upflow), AFUE 97.0%, two-stage variable-25-speed ECM,
--     field-supplied filter, 115V/1ph/60Hz, MCA 13.4A / MOCP 15A.
--   59SC6A 080M17-16 - Carrier 59SC6A Product Data, p.4: 80,000 in /
--     78,000 out (upflow), AFUE 97.0% at this size (real - smaller
--     59SC6 sizes are rated lower, down to 95-96%), single-stage 18-
--     speed constant-torque ECM, field-supplied filter, 115V/1ph/60Hz,
--     MCA 13.4A / MOCP 15A.
--   58TP0 090V17-16 / 58TP1 090V17-16 - Carrier 58TP0B/58TP1B Product
--     Data (A190411), p.4: real numbers CONFIRMED IDENTICAL for
--     standard (58TP0) vs Low NOx (58TP1) in upflow orientation per
--     this document's own "All Standard/All Low NOx Upflow" row
--     grouping (they only diverge in downflow/horizontal, not
--     cataloged here) - 88,000 in / 71,000 out, 80% AFUE, two-stage
--     variable-speed, field-supplied filter, 115V/1ph/60Hz,
--     MCA 11.3A / MOCP 15A.
--   58SB0 090M17-14 / 58SB1 090M17-14 / 58SC0 090M17-14 / 58SC1
--     090M17-14 - Carrier 58SB0B/58SB1B Product Data (A190411), p.4:
--     88,000 in / 71,000 out (upflow, standard = Low NOx identical per
--     this doc's own row grouping), 80% AFUE, single-stage multi-speed
--     ECM, field-supplied filter, 115V/1ph/60Hz, MCA 11.0A / MOCP 15A.
--     58SC0/58SC1 real numbers taken as identical to 58SB0/58SB1 per a
--     real, disclosed source fact (multiple Carrier documentation
--     sources state the only difference between the SC and SB model
--     families is added blower-cabinet insulation for sound, not
--     heating/electrical performance) - not assumed from tonnage/
--     platform resemblance.
--   59SC2B 080-16 - Carrier 59SC2B Product Data (A11263), p.3: 80,000
--     in / 75,000 out, single-stage, PSC (not ECM) blower motor - a
--     real, disclosed older/simpler blower technology for this entry
--     tier, 115V/1ph/60Hz, MCA 11.1A / MOCP 15A.
--
-- Lighter (real AFUE/staging from each model's own carrier.com product
-- page; capacity/electrical genuinely not sourced this pass):
--   59TN6 (Infinity 96, up to 96.7% AFUE, two-stage variable-speed)
--   58CU0 (Infinity 80 Ultra-Low NOx, 80% AFUE, single-stage)
--   58TN (Infinity 80, 80% AFUE, two-stage)
--   59CU5 (Infinity 95 Ultra-Low NOx, up to 95% AFUE, single-stage)
--   59TP6 (Performance 96, up to 96.7% AFUE, two-stage)
--   59SP6 (Performance 96, up to 97% AFUE, single-stage)
--   58SP0 (Performance 80, 80% AFUE, single-stage)
--   58SP1 (Performance 80 Low NOx, 80% AFUE, single-stage)
--   58SU0 (Comfort 80 Ultra-Low NOx, 80% AFUE, single-stage)
--   59SU5 (Comfort 95 Ultra-Low NOx, up to 95% AFUE, single-stage)
--
-- PACKAGE UNITS - 1 more full-depth (in addition to Gap 01's 48NG) + 11
-- lighter:
--   50VR-A36 - Carrier 50VR Product Data (A09033), p.4+44: 34,000
--     Btu/h cooling (SEER 15.0/EER 12.0), heat-pump heating 34,000
--     Btu/h @ 47F (COP 3.7) / 17,200 Btu/h @ 17F (COP 2.3), HSPF 8.2,
--     two-stage, 208/230-1-60, MCA 26.3A / MOCP 40A.
-- Lighter (real SEER2/AFUE/HSPF2 from each model's own carrier.com
-- page; capacity/electrical not sourced this pass):
--   48VR (Performance 15 hybrid heat, up to 15.5 SEER2/11.5 EER2, 81%
--     AFUE, up to 7.5 HSPF2, two-stage)
--   48NR / 50NR (Performance 15 hybrid heat / heat pump - same
--     "Performance 15" tier name as 48VR/50VR per Carrier's own
--     category listing; real per-model SEER2/HSPF2 not separately
--     confirmed this pass - real, disclosed, not assumed identical)
--   50VG (Performance 16 AC-only, up to 16 SEER2, two-stage)
--   48NL (Comfort 14 gas/electric, 13.4 SEER2/11 EER2, 81% AFUE,
--     single-stage)
--   50NT (Comfort 14 heat pump, 13.4 SEER2/11 EER2, 6.7 HSPF2, single-
--     stage)
--   48NT / 50VT / 50NH / 50ZH / 50NP (Comfort 13/14 tier per Carrier's
--     own category listing - "13 SEER" legacy naming; real per-model
--     numbers not separately confirmed this pass)
do $$
declare
  f1 uuid; f2 uuid; f3 uuid; f4 uuid; f5 uuid; f6 uuid; f7 uuid; f8 uuid; f9 uuid; f10 uuid;
  fl1 uuid; fl2 uuid; fl3 uuid; fl4 uuid; fl5 uuid; fl6 uuid; fl7 uuid; fl8 uuid; fl9 uuid; fl10 uuid;
  p1 uuid;
  pl1 uuid; pl2 uuid; pl3 uuid; pl4 uuid; pl5 uuid; pl6 uuid; pl7 uuid; pl8 uuid; pl9 uuid; pl10 uuid; pl11 uuid;
begin
  -- Full-depth furnaces
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '59TN7A080C17-16', 'furnace', 'two_stage', null, 77000, 1255, 'Carrier 59TN7A Infinity 97 Product Data (Edition Date 11/24), p.4 Table 1 Specifications, 080C17-16 column: 80,000 Btu/h input / 77,000 Btu/h output (upflow), AFUE 97.0% upflow, two-stage, field-supplied filter, 115-60-1, unit ampacity 13.4A / max fuse 15A')
    returning id into f1;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '59TP7A080V17-16', 'furnace', 'two_stage', null, 77000, 1290, 'Carrier 59TP7A Product Data, p.4 Specifications, 080V17-16 column: 80,000 Btu/h input / 77,000 Btu/h output (upflow), AFUE 97.0%, two-stage variable-25-speed ECM, field-supplied filter, 115-60-1, unit ampacity 13.4A / max fuse 15A')
    returning id into f2;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '59SC6A080M17-16', 'furnace', 'single', null, 78000, 1290, 'Carrier 59SC6A Product Data, p.4 Specifications, 080M17-16 column: 80,000 Btu/h input / 78,000 Btu/h output (upflow), AFUE 97.0% at this size, single-stage 18-speed constant-torque ECM, field-supplied filter, 115-60-1, unit ampacity 13.4A / max fuse 15A')
    returning id into f3;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '58TP0090V17-16', 'furnace', 'two_stage', null, 71000, null, 'Carrier 58TP0B/58TP1B Product Data (A190411), p.4 Specifications, 090V17-16 column, "All Standard/All Low NOx Upflow" row: 88,000 Btu/h input / 71,000 Btu/h output, 80% AFUE, two-stage variable-speed, field-supplied filter, 115-60-1, unit ampacity 11.3A / max fuse 15A')
    returning id into f4;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '58TP1090V17-16', 'furnace', 'two_stage', null, 71000, null, 'Carrier 58TP0B/58TP1B Product Data (A190411), p.4 Specifications, 090V17-16 column, "All Standard/All Low NOx Upflow" row: real numbers confirmed IDENTICAL to 58TP0 in upflow orientation (this document''s own row grouping) - 88,000 Btu/h input / 71,000 Btu/h output, 80% AFUE, two-stage variable-speed, Low NOx, field-supplied filter, 115-60-1, unit ampacity 11.3A / max fuse 15A')
    returning id into f5;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '58SB0090M17-14', 'furnace', 'single', null, 71000, null, 'Carrier 58SB0B/58SB1B Product Data (A190411), p.4 Specifications, 090M17-14 column, "All Standard/Low NOx Upflow" row: 88,000 Btu/h input / 71,000 Btu/h output, 80% AFUE, single-stage multi-speed ECM, field-supplied filter, 115-60-1, unit ampacity 11.0A / max fuse 15A')
    returning id into f6;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '58SB1090M17-14', 'furnace', 'single', null, 71000, null, 'Carrier 58SB0B/58SB1B Product Data (A190411), p.4: real numbers confirmed identical to 58SB0 in upflow (this document''s own row grouping) - 88,000 Btu/h input / 71,000 Btu/h output, 80% AFUE, single-stage multi-speed ECM, Low NOx, field-supplied filter, 115-60-1, unit ampacity 11.0A / max fuse 15A')
    returning id into f7;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '58SC0090M17-14', 'furnace', 'single', null, 71000, null, 'Real numbers taken from Carrier 58SB0B/58SB1B Product Data (A190411) p.4, 090M17-14 column (88,000 in / 71,000 out, 80% AFUE, single-stage multi-speed ECM, 115-60-1, MCA 11.0A / MOCP 15A) - a real, disclosed fact from Carrier documentation states the only difference between the 58SC0/58SC1 and 58SB0/58SB1 model families is added blower-cabinet sound insulation, not heating/electrical performance; not assumed from tonnage/platform resemblance')
    returning id into f8;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '58SC1090M17-14', 'furnace', 'single', null, 71000, null, 'Real numbers taken from Carrier 58SB0B/58SB1B Product Data (A190411) p.4, 090M17-14 column, Low NOx row (88,000 in / 71,000 out, 80% AFUE, single-stage multi-speed ECM, 115-60-1, MCA 11.0A / MOCP 15A) - see 58SC0 note: real, disclosed source states 58SC vs 58SB differ only in blower-cabinet insulation')
    returning id into f9;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '59SC2B080-16', 'furnace', 'single', null, 75000, 1085, 'Carrier 59SC2B Product Data (A11263), p.3 Specifications, 080-16 column: 80,000 Btu/h input / 75,000 Btu/h output, single-stage, PSC (not ECM) blower motor - real, disclosed older blower technology for this entry tier, 115-60-1, unit ampacity 11.1A / max fuse 15A')
    returning id into f10;

  -- Lighter-touch furnaces (real AFUE/staging only, from carrier.com)
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '59TN6', 'furnace', 'two_stage', null, null, null, 'carrier.com/us/en/residential/furnaces/59tn6/ (Infinity 96): up to 96.7% AFUE, two-stage, variable-speed blower. Capacity/electrical not sourced this pass - real model-page confirmation only, no per-size Product Data PDF read yet.')
    returning id into fl1;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '58CU0', 'furnace', 'single', null, null, null, 'carrier.com/us/en/residential/furnaces/58cu0/ (Infinity 80 Ultra-Low NOx): 80% AFUE, single-stage gas valve, variable-speed blower. Capacity/electrical not sourced this pass.')
    returning id into fl2;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '58TN', 'furnace', 'two_stage', null, null, null, 'carrier.com/us/en/residential/furnaces/58tn/ (Infinity 80): 80% AFUE, two-stage gas valve. Capacity/electrical not sourced this pass.')
    returning id into fl3;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '59CU5', 'furnace', 'single', null, null, null, 'carrier.com/us/en/residential/furnaces/59cu5/ (Infinity 95 Ultra-Low NOx): up to 95% AFUE, single-stage gas valve. Capacity/electrical not sourced this pass.')
    returning id into fl4;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '59TP6', 'furnace', 'two_stage', null, null, null, 'carrier.com/us/en/residential/furnaces/59tp6/ (Performance 96): up to 96.7% AFUE, two-stage, variable 25-speed blower. Capacity/electrical not sourced this pass.')
    returning id into fl5;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '59SP6', 'furnace', 'single', null, null, null, 'carrier.com/us/en/residential/furnaces/59sp6/ (Performance 96): up to 97% AFUE, single-stage gas valve, variable 25-speed blower. Capacity/electrical not sourced this pass.')
    returning id into fl6;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '58SP0', 'furnace', 'single', null, null, null, 'carrier.com/us/en/residential/furnaces/58sp0/ (Performance 80): 80% AFUE, single-stage, variable 25-speed blower. Capacity/electrical not sourced this pass.')
    returning id into fl7;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '58SP1', 'furnace', 'single', null, null, null, 'carrier.com/us/en/residential/furnaces/58sp1/ (Performance 80 Low NOx): 80% AFUE, single-stage. Capacity/electrical not sourced this pass.')
    returning id into fl8;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '58SU0', 'furnace', 'single', null, null, null, 'carrier.com/us/en/residential/furnaces/58su0/ (Comfort 80 Ultra-Low NOx): 80% AFUE, single-stage gas valve, multi-speed blower. Capacity/electrical not sourced this pass.')
    returning id into fl9;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '59SU5', 'furnace', 'single', null, null, null, 'carrier.com/us/en/residential/furnaces/59su5/ (Comfort 95 Ultra-Low NOx): up to 95% AFUE, single-stage. Capacity/electrical not sourced this pass.')
    returning id into fl10;

  -- Full-depth package unit
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '50VR-A36', 'package_unit', 'two_stage', 34000, 34000, 1200, 'Carrier 50VR Performance 15 SEER 2-Stage Packaged Heat Pump Product Data (A09033), p.4 AHRI Capacities (36 column): 34,000 Btu/h cooling (SEER 15.0/EER 12.0), heating 34,000 Btu/h @ 47F (COP 3.7) / 17,200 Btu/h @ 17F (COP 2.3), HSPF 8.2, two-stage, p.44 Electrical Data (A36, 208/230-1-60, no electric heat kit): MCA 26.3A / MOCP 40A. nominal_heating_capacity_btu uses the real 47F AHRI rating point.')
    returning id into p1;

  -- Lighter-touch package units
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '48VR', 'package_unit', 'two_stage', null, null, null, 'carrier.com/us/en/residential/combined-heating-cooling/48vr/ (Performance 15 Hybrid Heat, dual-fuel gas+heat-pump): up to 15.5 SEER2/11.5 EER2, 81% AFUE, up to 7.5 HSPF2, two-stage compressor. Capacity/electrical not sourced this pass.')
    returning id into pl1;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '48NR', 'package_unit', 'two_stage', null, null, null, 'carrier.com/us/en/residential/combined-heating-cooling/ category listing: "Performance 15 Packaged Hybrid Heat System" - same tier name as 48VR; real per-model SEER2/AFUE/HSPF2 not separately confirmed this pass, not assumed identical to 48VR without its own citation.')
    returning id into pl2;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '50NR', 'package_unit', 'two_stage', null, null, null, 'carrier.com/us/en/residential/combined-heating-cooling/ category listing: "Performance 15 Packaged Heat Pump System" - same tier name as 50VR; real per-model SEER2/HSPF2 not separately confirmed this pass, not assumed identical to 50VR without its own citation.')
    returning id into pl3;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '50VG', 'package_unit', 'two_stage', null, null, null, 'carrier.com/us/en/residential/combined-heating-cooling/50vg/ (Performance 16, straight AC package): up to 16 SEER2, two-stage compressor. Capacity/electrical not sourced this pass.')
    returning id into pl4;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '48NL', 'package_unit', 'single', null, null, null, 'carrier.com/us/en/residential/combined-heating-cooling/48nl/ (Comfort 14, gas/electric): 13.4 SEER2/11 EER2, 81% AFUE, single-stage compressor. Capacity/electrical not sourced this pass.')
    returning id into pl5;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '50NT', 'package_unit', 'single', null, null, null, 'carrier.com/us/en/residential/combined-heating-cooling/50nt/ (Comfort 14, heat pump): 13.4 SEER2/11 EER2, 6.7 HSPF2, single-stage compressor. Capacity/electrical not sourced this pass.')
    returning id into pl6;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '48NT', 'package_unit', 'single', null, null, null, 'carrier.com/us/en/residential/combined-heating-cooling/ category listing: "Comfort 14 Packaged Hybrid Heat System". Real SEER2/AFUE/HSPF2 not separately confirmed this pass.')
    returning id into pl7;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '50VT', 'package_unit', 'single', null, null, null, 'carrier.com/us/en/residential/combined-heating-cooling/ category listing: "Comfort 13 Packaged Heat Pump System" (legacy 13-SEER tier naming). Real numbers not separately confirmed this pass.')
    returning id into pl8;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '50NH', 'package_unit', 'single', null, null, null, 'carrier.com/us/en/residential/combined-heating-cooling/ category listing: "Comfort 13 Packaged Heat Pump System". Real numbers not separately confirmed this pass.')
    returning id into pl9;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '50ZH', 'package_unit', 'single', null, null, null, 'carrier.com/us/en/residential/combined-heating-cooling/ category listing: "Comfort 13 Packaged Heat Pump System". Real numbers not separately confirmed this pass.')
    returning id into pl10;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '50NP', 'package_unit', 'single', null, null, null, 'carrier.com/us/en/residential/combined-heating-cooling/ category listing: "Comfort 13 Packaged Air Conditioner System" (straight cool, legacy 13-SEER tier naming). Real numbers not separately confirmed this pass.')
    returning id into pl11;

  insert into public.equipment_electrical_specs (equipment_id, voltage_phase, min_circuit_ampacity, max_overcurrent_protection, source_document) values
    (f1, '115/1', 13.4, 15, 'Carrier 59TN7A Product Data, p.4, 080C17-16 column, Electrical Data'),
    (f2, '115/1', 13.4, 15, 'Carrier 59TP7A Product Data, p.4, 080V17-16 column, Electrical Data'),
    (f3, '115/1', 13.4, 15, 'Carrier 59SC6A Product Data, p.4, 080M17-16 column, Electrical Data'),
    (f4, '115/1', 11.3, 15, 'Carrier 58TP0B/58TP1B Product Data (A190411), p.4, 090V17-16 column, Electrical Data'),
    (f5, '115/1', 11.3, 15, 'Carrier 58TP0B/58TP1B Product Data (A190411), p.4, 090V17-16 column, Electrical Data'),
    (f6, '115/1', 11.0, 15, 'Carrier 58SB0B/58SB1B Product Data (A190411), p.4, 090M17-14 column, Electrical Data'),
    (f7, '115/1', 11.0, 15, 'Carrier 58SB0B/58SB1B Product Data (A190411), p.4, 090M17-14 column, Electrical Data'),
    (f8, '115/1', 11.0, 15, 'Real numbers taken from Carrier 58SB0B/58SB1B Product Data (A190411), p.4, 090M17-14 column - see equipment_catalog.source_document note on the real basis for treating 58SC as identical to 58SB'),
    (f9, '115/1', 11.0, 15, 'Real numbers taken from Carrier 58SB0B/58SB1B Product Data (A190411), p.4, 090M17-14 column - see equipment_catalog.source_document note'),
    (f10, '115/1', 11.1, 15, 'Carrier 59SC2B Product Data (A11263), p.3, 080-16 column, Electrical Data'),
    (p1, '208/230/1', 26.3, 40, 'Carrier 50VR Product Data (A09033), p.44, 50VR Electrical Data table, A36/208-230-1-60 row, no electric heat kit');

  insert into public.equipment_filter_specs (equipment_id, filter_furnished, filter_type, filter_size, source_document) values
    (f1, false, 'Field-supplied', null, 'Carrier 59TN7A Product Data, p.4: "Air Filtration System: Field Supplied Filter" - no specific dimension published in this document'),
    (f2, false, 'Field-supplied', null, 'Carrier 59TP7A Product Data, p.4: "Air Filtration System: Field Supplied Filter"'),
    (f3, false, 'Field-supplied', null, 'Carrier 59SC6A Product Data, p.4: "Air Filtration System: Field Supplied Filter"'),
    (f4, false, 'Field-supplied', null, 'Carrier 58TP0B/58TP1B Product Data, p.4: "Air Filtration System: Field Supplied Filter"'),
    (f6, false, 'Field-supplied', null, 'Carrier 58SB0B/58SB1B Product Data, p.4: "Air Filtration System: Field Supplied Filter"'),
    (f10, false, 'Field-supplied', null, 'Carrier 59SC2B Product Data, p.3: "Air Filtration System: Field Supplied"')
  on conflict (equipment_id) do nothing;
end $$;
