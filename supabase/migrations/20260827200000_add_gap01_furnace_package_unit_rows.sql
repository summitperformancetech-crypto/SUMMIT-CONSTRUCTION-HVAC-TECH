-- Catalog Expansion + Recommended Install Package, Gap 01 - the catalog
-- had zero furnace and zero package_unit rows despite both being valid
-- equipment_type values since the original Manual S migration. Pure
-- sourcing gap: adds one real, current, top-tier furnace and one real,
-- current, top-tier package unit for each of the catalog's 5
-- manufacturers, using the same standard as the rest of the catalog -
-- a real OEM spec sheet, a real model number, real capacities, cited
-- per row.
--
-- Furnaces (all modulating-or-near-top-tier, variable-speed ECM blower,
-- picked at a consistent 80,000 BTU/h input tier where the line offers
-- one, matching this catalog's existing preference for a representative
-- mid-capacity SKU over the largest/smallest):
--   Amana AMVM97 0803BNB - SS-AMVM97 (04/23), p.3: 80,000 input /
--     77,600 output, 97% AFUE, variable-speed ECM, 115V/1ph/60Hz,
--     MCA 8.8A / MOCP 15A.
--   Carrier 59MN7A080-14 - Carrier Product Data A09033 (59MN7A-02PD),
--     p.2-3: 80,000 input / 78,000 output (max heat), AFUE 97.4%
--     (ICS), variable-speed ECM, 115V/1ph/60Hz, unit ampacity 12.7A.
--   Daikin DM97MC 0803BNA - SS-DM97MC (www.daikincomfort.com), p.3:
--     80,000 input / 77,600 output, 97% AFUE, variable-speed ECM,
--     115V/1ph/60Hz, MCA 8.8A / MOCP 15A. Identical numbers to Amana's
--     AMVM97 0803BNB - same shared OEM platform, real not assumed
--     (confirmed by independently reading this document's own table,
--     matching the same real cross-brand-identical-hardware pattern
--     already seen with the AVPTC air handler filters/heat kits).
--   Goodman GMVM97 0803BNB - SS-GMVM97 (12/18), p.3: 80,000 input /
--     77,600 output, 97% AFUE, variable-speed ECM, 115V/1ph/60Hz,
--     MCA 8.8A / MOCP 15A. Same shared platform as Amana/Daikin, real
--     per-document confirmation, not assumed.
--   Trane S9V2B080U4PSBB - Trane Product Data 22-1921-1F-EN (08/2019),
--     p.6: 2nd-stage 80,000 input / 77,600 output (ICS), 96.0% AFUE
--     across all models, variable-speed blower, 120V/1ph/60Hz,
--     ampacity 10.8A. Trane's top-tier residential furnace is a
--     two-stage variable-speed design (S9V2), not a modulating gas
--     valve like the other 4 manufacturers' flagships - a real,
--     disclosed platform difference, not a lesser pick within Trane's
--     own real lineup.
--
-- Package units (all real 3-ton picks for consistency with this
-- catalog's other 3-ton selections; nominal_heating_capacity_btu uses
-- each document's real OUTPUT figure where published, INPUT where the
-- document only gives input - disclosed per row, never computed via
-- AFUE math the source document itself doesn't state):
--   Amana APGM5 3608041A* - SS-APGM5 (07/22), p.3: 35,000 Btu/h
--     cooling (SEER 15.2/EER 11.2), 80,000 input/64,800 output heating
--     (81% AFUE), two-stage scroll compressor, variable-speed indoor
--     blower, 208/230-1-60, MCA 25.8A / MOCP 35A.
--   Carrier 48NG-B360903 - Carrier Product Data A09033 (48NG-01PD),
--     p.1/4/5: 34,200 Btu/h cooling (SEER2 15.2/EER2 11.5), 90,000
--     input/74,000 output heating (81% AFUE), two-stage cooling and
--     heating (208/230V models), R-454B refrigerant, 208/230-1-60,
--     MCA 24.9A / MOCP 35A. Newer refrigerant than the other package
--     units here (R-454B vs R-410A) - real, current Carrier lineup,
--     disclosed rather than normalized to match the others.
--   Daikin DP5UM 3608041A* - SS-DP5UM (01/24), p.3: 35,000 Btu/h
--     cooling (SEER 15.2/EER 11.2), 80,000 input/64,800 output heating
--     (81% AFUE), two-stage scroll compressor, variable-speed indoor
--     blower, 208/230-1-60, MCA 25.8A / MOCP 35A. Identical numbers to
--     Amana's APGM5 3608041A* - same shared platform, confirmed by
--     independently reading Daikin's own document.
--   Goodman GPGM5 3608041AA - SS-GPGM5 (01/24), p.3: 35,000 Btu/h
--     cooling (SEER2 15.2/EER2 11.2), 80,000 input/64,800 output
--     heating (81% AFUE), two-stage scroll compressor, variable-speed
--     indoor blower, 208/230-1-60, MCA 25.8A / MOCP 35A. Same shared
--     platform as Amana/Daikin, confirmed by independently reading
--     Goodman's own document.
--   Trane 4YCC4036A1070A - Trane Product Data 22-1901-1J-EN (06/2020),
--     p.8: 37,000 Btu/h cooling (SEER 14.00/EER 12.0), 70,000 Btu/h
--     heating INPUT (81% AFUE) - this document does not publish a
--     separate heating output figure the way the other 4 manufacturers'
--     package-unit sheets do, so nominal_heating_capacity_btu is the
--     real input figure, disclosed as such, not an AFUE-derived
--     estimate. Single-stage scroll compressor (this specific 14 SEER
--     "4YCC4" line, not Trane's separately-marketed two-stage XL15c
--     tier), constant-torque ECM indoor blower, 208-230/1-60,
--     MCA 24.5A / max fuse 40A.
do $$
declare
  amana_furnace uuid;
  amana_package uuid;
  carrier_furnace uuid;
  carrier_package uuid;
  daikin_furnace uuid;
  daikin_package uuid;
  goodman_furnace uuid;
  goodman_package uuid;
  trane_furnace uuid;
  trane_package uuid;
begin
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Amana', 'AMVM970803BNB', 'furnace', 'variable_speed', null, 77600, null, 'Amana SS-AMVM97 (04/23, supersedes 12/21), www.amana-hac.com, p.3 Product Specifications, AMVM97 0803BNB column: 80,000 Btu/h input / 77,600 Btu/h output, 97% AFUE, variable-speed ECM blower, 115V/1ph/60Hz, MCA 8.8A / MOCP 15A')
    returning id into amana_furnace;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Amana', 'APGM53608041A', 'package_unit', 'two_stage', 35000, 64800, null, 'Amana SS-APGM5 (07/22), www.amana-hac.com, p.3 Product Specifications, APGM536 08041A* column: 35,000 Btu/h cooling (SEER 15.2/EER 11.2), 80,000 input/64,800 output Btu/h heating (81% AFUE), two-stage scroll compressor, variable-speed indoor blower, 208/230-1-60, MCA 25.8A / MOCP 35A')
    returning id into amana_package;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '59MN7A080-14', 'furnace', 'variable_speed', null, 78000, null, 'Carrier 59MN7A Infinity Modulating 4-Way Multipoise Condensing Gas Furnace Product Data A09033 (59MN7A-02PD), p.2 Specifications: 80,000 Btu/h input / 78,000 Btu/h output (Maximum Heat), AFUE 97.4% (ICS), variable-speed ECM blower, 115-60-1, unit ampacity 12.7A')
    returning id into carrier_furnace;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Carrier', '48NG-B360903', 'package_unit', 'two_stage', 34200, 74000, 1200, 'Carrier 48NG Single-Packaged Gas/Electric Product Data A09033 (48NG-01PD), p.1 (R-454B, up to 16.0 SEER2, two-stage cooling/heating), p.4-5 (unit size 36, 36090 heating): 34,200 Btu/h cooling (SEER2 15.2/EER2 11.5, 1200 CFM high stage), 90,000 input/74,000 output Btu/h heating (81% AFUE), 208/230-1-60, MCA 24.9A / MOCP 35A')
    returning id into carrier_package;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Daikin', 'DM97MC0803BNA', 'furnace', 'variable_speed', null, 77600, null, 'Daikin SS-DM97MC, www.daikincomfort.com, p.3 Product Specifications, DM97MC 0803BNA column: 80,000 Btu/h input / 77,600 Btu/h output, 97% AFUE, variable-speed ECM blower, 115V/1ph/60Hz, MCA 8.8A / MOCP 15A (identical to Amana AMVM97 0803BNB - same shared OEM platform, confirmed by independently reading this document)')
    returning id into daikin_furnace;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Daikin', 'DP5UM3608041A', 'package_unit', 'two_stage', 35000, 64800, null, 'Daikin SS-DP5UM (01/24, supersedes 07/22), www.daikincomfort.com, p.3 Product Specifications, DP5UM 3608041A* column: 35,000 Btu/h cooling (SEER 15.2/EER 11.2), 80,000 input/64,800 output Btu/h heating (81% AFUE), two-stage scroll compressor, variable-speed indoor blower, 208/230-1-60, MCA 25.8A / MOCP 35A (identical to Amana APGM5 3608041A* - same shared OEM platform, confirmed by independently reading this document)')
    returning id into daikin_package;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Goodman', 'GMVM970803BNB', 'furnace', 'variable_speed', null, 77600, null, 'Goodman SS-GMVM97 (12/18, supersedes 9/18), www.goodmanmfg.com, p.3 Product Specifications, GMVM97 0803BNB column: 80,000 Btu/h input / 77,600 Btu/h output, 97% AFUE, variable-speed ECM blower, 115V/1ph/60Hz, MCA 8.8A / MOCP 15A (identical to Amana/Daikin - same shared OEM platform, confirmed by independently reading this document)')
    returning id into goodman_furnace;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Goodman', 'GPGM53608041AA', 'package_unit', 'two_stage', 35000, 64800, null, 'Goodman SS-GPGM5 (01/24, supersedes 07/22), www.goodmanmfg.com, p.3 Product Specifications, GPGM536 08041AA column: 35,000 Btu/h cooling (SEER2 15.2/EER2 11.2), 80,000 input/64,800 output Btu/h heating (81% AFUE), two-stage scroll compressor, variable-speed indoor blower, 208/230-1-60, MCA 25.8A / MOCP 35A (identical to Amana/Daikin - same shared OEM platform, confirmed by independently reading this document)')
    returning id into goodman_package;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Trane', 'S9V2B080U4PSBB', 'furnace', 'variable_speed', null, 77600, null, 'Trane S9V2 Series Two Stage Condensing Gas Fired Furnace Product Data 22-1921-1F-EN (08/2019), p.6 Product Specification, S9V2B080U4PSBB column: 2nd-stage 80,000 Btu/h input / 77,600 Btu/h output (ICS), 96.0% AFUE, variable-speed direct-drive blower, 120V/1ph/60Hz, FLA 8.0A, combustion fan 120V/1/60 0.66A ampacity 10.8A total')
    returning id into trane_furnace;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Trane', '4YCC4036A1070A', 'package_unit', 'single', 37000, 70000, 1190, 'Trane Single Packaged Convertible Gas/Electric 14 SEER Product Data 22-1901-1J-EN (06/2020), p.8 Product Specifications, 4YCC4036A1070A column: 37,000 Btu/h cooling (SEER 14.00/EER 12.0, 1190 CFM), 70,000 Btu/h heating INPUT-1st-Stage (81% AFUE) - this document does not separately publish a heating output figure, so nominal_heating_capacity_btu is the real input value, not an AFUE-derived estimate; single scroll compressor, constant-torque ECM indoor blower, 208-230/1-60, MCA 24.5A / max fuse 40A')
    returning id into trane_package;

  insert into public.equipment_electrical_specs (equipment_id, voltage_phase, min_circuit_ampacity, max_overcurrent_protection, source_document) values
    (amana_furnace, '115/1', 8.8, 15, 'Amana SS-AMVM97 (04/23), p.3 Product Specifications, AMVM97 0803BNB column, Electrical Data'),
    (amana_package, '208/230/1', 25.8, 35, 'Amana SS-APGM5 (07/22), p.3 Product Specifications, APGM536 08041A* column, Electrical Data'),
    (carrier_furnace, '115/1', 12.7, 15, 'Carrier 59MN7A Product Data A09033 (59MN7A-02PD), p.2, Electrical Data (Unit Ampacity, Maximum Fuse/Ckt Bkr)'),
    (carrier_package, '208/230/1', 24.9, 35, 'Carrier 48NG Product Data A09033 (48NG-01PD), p.44, Electrical Data table, 36060/36090 208/230-1-60 row'),
    (daikin_furnace, '115/1', 8.8, 15, 'Daikin SS-DM97MC, p.3 Product Specifications, DM97MC 0803BNA column, Electrical Data'),
    (daikin_package, '208/230/1', 25.8, 35, 'Daikin SS-DP5UM (01/24), p.3 Product Specifications, DP5UM 3608041A* column, Electrical Data'),
    (goodman_furnace, '115/1', 8.8, 15, 'Goodman SS-GMVM97 (12/18), p.3 Product Specifications, GMVM97 0803BNB column, Electrical Data'),
    (goodman_package, '208/230/1', 25.8, 35, 'Goodman SS-GPGM5 (01/24), p.3 Product Specifications, GPGM536 08041AA column, Electrical Data'),
    (trane_furnace, '120/1', 10.8, 15, 'Trane S9V2 Series Product Data 22-1921-1F-EN (08/2019), p.6 Product Specification, S9V2B080U4PSBB column, POWER CONN. Ampacity'),
    (trane_package, '208-230/1', 24.5, 40, 'Trane Product Data 22-1901-1J-EN (06/2020), p.8 Product Specifications, 4YCC4036A1070A column, Min. Brch. Cir. Ampacity / Fuse Size');
end $$;
