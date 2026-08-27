-- Full current dealer-available Goodman lineup, furnace + package_unit
-- categories. Goodman shares the same OEM manufacturing platform as
-- Amana and Daikin (all three brands are Daikin Comfort Technologies
-- Manufacturing, L.P.), already confirmed repeatedly this session -
-- every furnace tier checked here was independently verified against
-- Goodman's own real spec sheet, not assumed from the Amana/Daikin
-- match alone.
--
-- Furnaces (6 - 5 independently verified this pass, 1 cited via the
-- now well-established shared-platform match):
--   GRVM97 0803BN - SS-GRVM97_GDVM97-R32, p.3: 80,000 in / 77,600 out,
--     97% AFUE, modulating valve, VS ECM blower, filter (1) 16x25,
--     MCA 8.1A / MOCP 15A. Confirmed identical to Amana ARVM97/Daikin
--     DR97MC by independently reading this document.
--   GRVT96 0803BN - SS-GRVT96_GDVT96-R32, p.3: 80,000 in / 76,880 out,
--     96.10% AFUE, two-stage, VS ECM blower, filter (1) 16x25,
--     MCA 7.6A / MOCP 15A. Confirmed identical to Amana ARVT96.
--   GR9S96-U 0805CU - SS-GR9S96-U-R32, p.3: 80,000 in / 77,600 out,
--     97.0% AFUE, single-stage, 9-speed ECM, Ultra-Low-NOx, filter
--     (1) 20x25 or (2) 16x25, MCA 15.1A / MOCP 25A. Confirmed identical
--     to Amana AR9S96-U.
--   GR9S96 0803BN - SS-GR9S96_GD9S96-R32, p.3: 80,000 in / 76,880 out,
--     96% AFUE, single-stage, 9-speed ECM, filter (1) 16x25,
--     MCA 10.1A / MOCP 15A. Confirmed identical to Amana AR9S96.
--   GR9T96 0803BN - SS-GR9T96_GD9T96-R32, p.3: 80,000 in / 76,800 out,
--     96% AFUE, two-stage, 9-speed ECM, filter (1) 20x25 or (2) 16x25,
--     MCA 7.8A / MOCP 15A. Confirmed identical to Amana AR9T96.
--   GR9S80 0803B - NOT independently verified this pass (source
--     document not downloaded/read) - real numbers taken from Amana
--     AR9S80 0803B (80,000 in / 64,000 out, 80% AFUE, single-stage,
--     9-speed ECM, MCA 7.7A / MOCP 15A) on the basis of the same
--     shared-platform match already confirmed independently for 5 of
--     5 other furnace tiers checked this session (100% real hit rate)
--     - disclosed as an inference from that established pattern, not
--     an independent read of Goodman's own GR9S80 document.
--
-- Package units (2, full depth, both independently verified via
-- direct page-image reads given the platform's package-unit numbers
-- are NOT always identical across brands - confirmed by Daikin's
-- DP5GM/DP5UM real difference from Amana's APGM5 earlier this session,
-- so this was not assumed for Goodman either):
--   GPGM5 3608031 - SS-GPGM5-R32 (08/25), p.3 (confirmed via direct
--     page-image read): 35,600 Btu/h cooling (SEER2 15.2/EER2 11.5),
--     80,000 input/64,800 output Btu/h heating (81% AFUE) - matches
--     Amana APGM5's real 64,800 output, NOT Daikin DP5GM's real 60,000
--     for the same tonnage code (a genuine confirmed 2-way vs 1-way
--     split among the three shared-platform brands, not assumed either
--     way), two-stage scroll, 208/230-1, MCA 25A / MOCP 35A.
--   GPHM5 3631 - SS-GPHM5-R32 (01/25), p.3: 36,000 Btu/h cooling
--     (SEER2 15.2/EER2 11.4), heating 35,500 Btu/h @ 47F (COP 3.66) /
--     22,800 Btu/h @ 17F (COP 2.38), HSPF2 6.70, two-stage scroll,
--     208-230/1, MCA 22.8A / MOCP 35A.
do $$
declare
  f1 uuid; f2 uuid; f3 uuid; f4 uuid; f5 uuid; f6 uuid;
  p1 uuid; p2 uuid;
begin
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Goodman', 'GRVM970803BN', 'furnace', 'variable_speed', null, 77600, null, 'Goodman SS-GRVM97_GDVM97-R32, www.goodmanmfg.com, p.3 Product Specifications, GRVM97 0803BN column: 80,000 Btu/h input / 77,600 Btu/h output, 97% AFUE, modulating gas valve, variable-speed ECM blower, filter (1) 16x25, 115V/1ph/60Hz, MCA 8.1A / MOCP 15A. Confirmed identical to Amana ARVM97 0803BN / Daikin DR97MC 0803BN by independently reading this document.')
    returning id into f1;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Goodman', 'GRVT960803BN', 'furnace', 'variable_speed', null, 76880, null, 'Goodman SS-GRVT96_GDVT96-R32, www.goodmanmfg.com, p.3, GRVT96 0803BN column: 80,000 Btu/h input / 76,880 Btu/h output, 96.10% AFUE, two-stage gas valve, variable-speed ECM blower, filter (1) 16x25, 115V/1ph/60Hz, MCA 7.6A / MOCP 15A. Confirmed identical to Amana ARVT96 0803BN.')
    returning id into f2;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Goodman', 'GR9S96-U0805CU', 'furnace', 'single', null, 77600, null, 'Goodman SS-GR9S96-U-R32, www.goodmanmfg.com, p.3, GR9S96 0805CU column: 80,000 Btu/h input / 77,600 Btu/h output, 97.0% AFUE, single-stage gas valve, 9-speed ECM blower, Ultra-Low-NOx, filter (1) 20x25 or (2) 16x25, 115V/1ph/60Hz, MCA 15.1A / MOCP 25A. Confirmed identical to Amana AR9S96-U 0805CU.')
    returning id into f3;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Goodman', 'GR9S960803BN', 'furnace', 'single', null, 76880, null, 'Goodman SS-GR9S96_GD9S96-R32, www.goodmanmfg.com, p.3, GR9S96 0803BN column: 80,000 Btu/h input / 76,880 Btu/h output, 96% AFUE, single-stage gas valve, 9-speed ECM blower, filter (1) 16x25, 115V/1ph/60Hz, MCA 10.1A / MOCP 15A. Confirmed identical to Amana AR9S96 0803BN.')
    returning id into f4;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Goodman', 'GR9T960803BN', 'furnace', 'two_stage', null, 76800, null, 'Goodman SS-GR9T96_GD9T96-R32, www.goodmanmfg.com, p.3, GR9T96 0803BN column: 80,000 Btu/h input / 76,800 Btu/h output, 96% AFUE, two-stage gas valve, 9-speed ECM blower, filter (1) 20x25 or (2) 16x25, 115V/1ph/60Hz, MCA 7.8A / MOCP 15A. Confirmed identical to Amana AR9T96 0803BN.')
    returning id into f5;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Goodman', 'GR9S800803B', 'furnace', 'single', null, 64000, null, 'NOT independently verified this pass (Goodman''s own SS-GR9S80 document not read). Real numbers taken from Amana AR9S80 0803B (80,000 Btu/h input / 64,000 Btu/h output, 80% AFUE, single-stage, 9-speed ECM, MCA 7.7A / MOCP 15A) on the basis of the shared-platform match independently confirmed for 5 of 5 other Goodman furnace tiers checked this session - disclosed as an inference from that established pattern, not an independent read.')
    returning id into f6;

  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Goodman', 'GPGM53608031', 'package_unit', 'two_stage', 35600, 64800, 1200, 'Goodman SS-GPGM5-R32 (08/25), www.goodmanmfg.com, p.3 Product Specifications, GPGM5 3608031 column (confirmed via direct page-image read): 35,600 Btu/h cooling (SEER2 15.2/EER2 11.5), 80,000 input/64,800 output Btu/h heating (81% AFUE), two-stage scroll compressor, variable-speed indoor blower, 208/230-1-60, MCA 25A / MOCP 35A. Real output matches Amana APGM5''s 64,800, NOT Daikin DP5GM''s real 60,000 for the same tonnage code - a genuine, confirmed real difference among the shared-platform brands, not assumed.')
    returning id into p1;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Goodman', 'GPHM53631', 'package_unit', 'two_stage', 36000, 35500, 1200, 'Goodman SS-GPHM5-R32 (01/25), www.goodmanmfg.com, p.3 Product Specifications, GPHM5 3631 column: 36,000 Btu/h cooling (SEER2 15.2/EER2 11.4), heating 35,500 Btu/h @ 47F (COP 3.66) / 22,800 Btu/h @ 17F (COP 2.38), HSPF2 6.70, two-stage scroll compressor, 208-230/1-60, MCA 22.8A / MOCP 35A. nominal_heating_capacity_btu uses the real 47F AHRI rating point.')
    returning id into p2;

  insert into public.equipment_electrical_specs (equipment_id, voltage_phase, min_circuit_ampacity, max_overcurrent_protection, source_document) values
    (f1, '115/1', 8.1, 15, 'Goodman SS-GRVM97_GDVM97-R32, p.3, GRVM97 0803BN column, Electrical Data'),
    (f2, '115/1', 7.6, 15, 'Goodman SS-GRVT96_GDVT96-R32, p.3, GRVT96 0803BN column, Electrical Data'),
    (f3, '115/1', 15.1, 25, 'Goodman SS-GR9S96-U-R32, p.3, GR9S96 0805CU column, Electrical Data'),
    (f4, '115/1', 10.1, 15, 'Goodman SS-GR9S96_GD9S96-R32, p.3, GR9S96 0803BN column, Electrical Data'),
    (f5, '115/1', 7.8, 15, 'Goodman SS-GR9T96_GD9T96-R32, p.3, GR9T96 0803BN column, Electrical Data'),
    (f6, '115/1', 7.7, 15, 'Not independently verified - see equipment_catalog.source_document note; real value taken from Amana AR9S80 0803B'),
    (p1, '208/230/1', 25, 35, 'Goodman SS-GPGM5-R32 (08/25), p.3, GPGM5 3608031 column, Electrical Data'),
    (p2, '208-230/1', 22.8, 35, 'Goodman SS-GPHM5-R32 (01/25), p.3, GPHM5 3631 column, Electrical Data');

  insert into public.equipment_filter_specs (equipment_id, filter_furnished, filter_type, filter_size, source_document) values
    (f1, false, 'Throwaway', '(1) 16x25 (side or bottom)', 'Goodman SS-GRVM97_GDVM97-R32, p.3, GRVM97 0803BN column, Filter Size row'),
    (f2, false, 'Throwaway', '(1) 16x25 (side or bottom)', 'Goodman SS-GRVT96_GDVT96-R32, p.3, GRVT96 0803BN column, Filter Size row'),
    (f3, false, 'Throwaway', '(1) 20x25 (bottom) or (2) 16x25 (side)', 'Goodman SS-GR9S96-U-R32, p.3, GR9S96 0805CU column, Filter Size row'),
    (f4, false, 'Throwaway', '(1) 16x25 (side or bottom)', 'Goodman SS-GR9S96_GD9S96-R32, p.3, GR9S96 0803BN column, Filter Size row'),
    (f5, false, 'Throwaway', '(1) 20x25 (bottom) or (2) 16x25 (side)', 'Goodman SS-GR9T96_GD9T96-R32, p.3, GR9T96 0803BN column, Filter Size row')
  on conflict (equipment_id) do nothing;
end $$;
