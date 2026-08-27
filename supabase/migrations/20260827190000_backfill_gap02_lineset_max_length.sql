-- Catalog Expansion + Recommended Install Package, Gap 02 - one more
-- real sourcing attempt for refrigerant_lineset_specs.max_equivalent_
-- length_ft on the rows that had it null (Trane's 2 rows already had a
-- real value of 80ft from an earlier pass and are untouched here;
-- Carrier 26TPA824W003 has no refrigerant_lineset_specs row at all,
-- which is a deeper gap than "missing this one field" and is out of
-- scope for this pass).
--
-- Amana ASZ160241K/361K/481K/601K, Goodman GSZB401810A/403610A, Daikin
-- DZ4SEA2410A/3610A/4810A: all three brands' shared platform is
-- explicitly governed by "TP-107 Long Line Set Application R-410A"
-- (Goodman Manufacturing Company, L.P. - footer cites both
-- goodmanmfg.com and amana-hac.com) - and confirmed as Daikin DZ4SE's
-- own authoritative reference too: Daikin's own installation manual
-- (P/N IOD-4038D, "refer to TP-107 Long Line Set Application R-410A")
-- names this exact document for line lengths beyond 79ft, so it is a
-- real, applicable source for all three brands, not an inferred
-- cross-brand borrow.
--
-- TP-107 Section 1, item 7: "Maximum equivalent length of line set is:
-- a. 250 feet for single stage units with scroll or reciprocating
-- compressors. b. 150 feet for single stage units with rotary
-- compressors. c. 150 feet for two stage units." Compressor type/stage
-- read from each model's own real Product Specifications table (not
-- assumed uniform across a product line):
--   Amana SS-ASZ16 (8/20) p.1: "High-efficiency scroll compressor" -
--     standard feature across the whole ASZ16 line, all 4 catalog
--     models -> 241K/361K/481K (single stage) = 250ft;
--     601K (two stage) = 150ft (stage type overrides compressor type
--     per TP-107's own rule c).
--   Goodman SS-GSZB4 (10/22) p.3 Product Specifications, "Type" row:
--     GSZB401810A* = Rotary -> 150ft. GSZB403610A* = Scroll -> 250ft.
--     (Real, model-specific - NOT assumed uniform: the smaller 1.5/2-ton
--     GSZB4 models are genuinely Rotary while 3-ton+ are Scroll, per
--     this document's own table.)
--   Daikin SS-DZ4SE (www.daikincomfort.com) p.3 Product Specifications,
--     "Type" row: ALL of DZ4SEA1810A*-A6010A* = Scroll, including the
--     2410A that shares a tonnage code with Goodman's Rotary 02410A* -
--     a real, confirmed cross-brand difference despite the shared
--     tonnage-code naming convention, not assumed identical to
--     Goodman's platform. DZ4SEA2410A/3610A/4810A are all single
--     stage + Scroll -> 250ft each.
--
-- Carrier 26VNA124: its own Product Data (26VNA1-01PD.pdf p.4,
-- "Maximum Line Lengths for Air Conditioner Applications", "Units on
-- equal level" row) states MAXIMUM EQUIVALENT LENGTH = 200 ft directly
-- - a model-specific real number, used in preference to the generic
-- Residential Piping and Long Line Guideline's 250ft table for 3/8"
-- AC/HP lines (the model's own Product Data is the more specific real
-- source and takes precedence).
do $$
declare
  amana_241 uuid;
  amana_361 uuid;
  amana_481 uuid;
  amana_601 uuid;
  goodman_1810 uuid;
  goodman_3610 uuid;
  daikin_2410 uuid;
  daikin_3610 uuid;
  daikin_4810 uuid;
  carrier_vna1 uuid;
begin
  select id into amana_241 from public.equipment_catalog where manufacturer = 'Amana' and model_number = 'ASZ160241K';
  select id into amana_361 from public.equipment_catalog where manufacturer = 'Amana' and model_number = 'ASZ160361K';
  select id into amana_481 from public.equipment_catalog where manufacturer = 'Amana' and model_number = 'ASZ160481K';
  select id into amana_601 from public.equipment_catalog where manufacturer = 'Amana' and model_number = 'ASZ160601K';
  select id into goodman_1810 from public.equipment_catalog where manufacturer = 'Goodman' and model_number = 'GSZB401810A';
  select id into goodman_3610 from public.equipment_catalog where manufacturer = 'Goodman' and model_number = 'GSZB403610A';
  select id into daikin_2410 from public.equipment_catalog where manufacturer = 'Daikin' and model_number = 'DZ4SEA2410A';
  select id into daikin_3610 from public.equipment_catalog where manufacturer = 'Daikin' and model_number = 'DZ4SEA3610A';
  select id into daikin_4810 from public.equipment_catalog where manufacturer = 'Daikin' and model_number = 'DZ4SEA4810A';
  select id into carrier_vna1 from public.equipment_catalog where manufacturer = 'Carrier' and model_number = '26VNA124';

  update public.refrigerant_lineset_specs set max_equivalent_length_ft = 250,
    length_derate_notes = 'Single stage, scroll compressor (Amana SS-ASZ16 8/20 p.1: "High-efficiency scroll compressor"). Max equivalent length per TP-107 Long Line Set Application R-410A (Goodman/Amana, 2015-2017/2020), Section 1 item 7a: 250ft for single stage scroll/reciprocating compressors.'
    where equipment_id = amana_241;
  update public.refrigerant_lineset_specs set max_equivalent_length_ft = 250,
    length_derate_notes = 'Single stage, scroll compressor (Amana SS-ASZ16 8/20 p.1: "High-efficiency scroll compressor"). Max equivalent length per TP-107 Long Line Set Application R-410A, Section 1 item 7a: 250ft for single stage scroll/reciprocating compressors.'
    where equipment_id = amana_361;
  update public.refrigerant_lineset_specs set max_equivalent_length_ft = 250,
    length_derate_notes = 'Single stage, scroll compressor (Amana SS-ASZ16 8/20 p.1: "High-efficiency scroll compressor"). Max equivalent length per TP-107 Long Line Set Application R-410A, Section 1 item 7a: 250ft for single stage scroll/reciprocating compressors.'
    where equipment_id = amana_481;
  update public.refrigerant_lineset_specs set max_equivalent_length_ft = 150,
    length_derate_notes = 'Two stage unit (this catalog row''s own stage_type). Max equivalent length per TP-107 Long Line Set Application R-410A, Section 1 item 7c: 150ft for two stage units, regardless of compressor type.'
    where equipment_id = amana_601;
  update public.refrigerant_lineset_specs set max_equivalent_length_ft = 150,
    length_derate_notes = 'Single stage, ROTARY compressor - real, model-specific (Goodman SS-GSZB4 10/22 p.3 Product Specifications, "Type" row for GSZB401810A*: Rotary - the two smallest GSZB4 sizes are genuinely rotary, not scroll like the rest of the line). Max equivalent length per TP-107 Long Line Set Application R-410A, Section 1 item 7b: 150ft for single stage rotary compressors.'
    where equipment_id = goodman_1810;
  update public.refrigerant_lineset_specs set max_equivalent_length_ft = 250,
    length_derate_notes = 'Single stage, scroll compressor (Goodman SS-GSZB4 10/22 p.3 Product Specifications, "Type" row for GSZB403610A*: Scroll). Max equivalent length per TP-107 Long Line Set Application R-410A, Section 1 item 7a: 250ft for single stage scroll/reciprocating compressors.'
    where equipment_id = goodman_3610;
  update public.refrigerant_lineset_specs set max_equivalent_length_ft = 250,
    length_derate_notes = 'Single stage, scroll compressor (Daikin SS-DZ4SE, www.daikincomfort.com, p.3 Product Specifications, "Type" row for DZ4SEA2410A*: Scroll - confirmed real per-model, NOT assumed identical to Goodman''s same-tonnage-code GSZB402410A*, which is Rotary). Max equivalent length per TP-107 Long Line Set Application R-410A, Section 1 item 7a: 250ft for single stage scroll compressors - TP-107 is Daikin DZ4SE''s own cited authoritative long-line reference (Daikin installation manual P/N IOD-4038D: "refer to TP-107 Long Line Set Application R-410A" for runs over 79ft).'
    where equipment_id = daikin_2410;
  update public.refrigerant_lineset_specs set max_equivalent_length_ft = 250,
    length_derate_notes = 'Single stage, scroll compressor (Daikin SS-DZ4SE p.3 Product Specifications, "Type" row for DZ4SEA3610A*: Scroll). Max equivalent length per TP-107 Long Line Set Application R-410A, Section 1 item 7a: 250ft - TP-107 is Daikin DZ4SE''s own cited authoritative long-line reference (installation manual P/N IOD-4038D).'
    where equipment_id = daikin_3610;
  update public.refrigerant_lineset_specs set max_equivalent_length_ft = 250,
    length_derate_notes = 'Single stage, scroll compressor (Daikin SS-DZ4SE p.3 Product Specifications, "Type" row for DZ4SEA4810A*: Scroll). Max equivalent length per TP-107 Long Line Set Application R-410A, Section 1 item 7a: 250ft - TP-107 is Daikin DZ4SE''s own cited authoritative long-line reference (installation manual P/N IOD-4038D).'
    where equipment_id = daikin_4810;
  update public.refrigerant_lineset_specs set max_equivalent_length_ft = 200,
    length_derate_notes = 'Carrier 26VNA1 Infinity Variable Speed Air Conditioner Product Data (26VNA1-01PD.pdf), p.4 "Maximum Line Lengths for Air Conditioner Applications", "Units on equal level" row: Maximum Equivalent Length = 200ft (this unit''s own model-specific figure, used in preference to the generic Residential Piping and Long Line Guideline''s 250ft table for 3/8in AC/HP lines).'
    where equipment_id = carrier_vna1;
end $$;
