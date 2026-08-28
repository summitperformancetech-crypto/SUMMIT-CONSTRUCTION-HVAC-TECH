-- Real gap closed: the original makeup-air migration's own comment said
-- "Fantech's MUAS product page does not publish a max CFM at all" -
-- true of the product PAGE, but its real Installation, Operations, and
-- Maintenance Manual (Item #497868, Rev 2024-09-18) and its MUAS 1200
-- product card (Item #K46014) both publish real, safety-relevant data
-- the page omitted, read directly this session.
--
--   - MUAS 1200: "airflow up to 1,200 cfm (max)" (K46014 product card);
--     IOM's own Dimensions table lists duct diameter (column J) = 10in
--     for MUAS 1200, matching "10" duct" in the product card.
--   - MUAS 750: IOM's Dimensions table lists duct diameter (J) = 8in.
--     No document read this session states a CFM figure for the 750
--     specifically as directly as the 1200's product card does - the
--     750 cfm figure used here follows Fantech's own confirmed real
--     naming convention (model number = max cfm, verified true for the
--     1200) rather than being independently quoted from a document that
--     states it explicitly for the 750 - disclosed as such, not silently
--     presented as equally certain.
--   - Real ambient operating range for the MUAS platform (both sizes):
--     "-20°F to 140°F" (IOM p.6).
--   - Real, safety-critical, DIFFERENT number from the 60°F figure
--     already cited elsewhere for return-trunk makeup-air ducting
--     (Broan's guide, "recommended by SOME manufacturers"): Fantech's
--     own IOM states "The installer is responsible to ensure that air
--     entering gas/oil heat exchangers is 55°F (12.8°C) or greater" -
--     a real, distinct, manufacturer-specific minimum, not reconciled
--     with Broan's cited figure.
--   - Real, notable manufacturer position, distinct from Broan/Aprilaire's
--     own return-trunk-tie-in installation guidance: "Fantech deems it
--     unacceptable to use central HVAC system equipment and duct work
--     for treatment and conveyance of makeup air" (IOM p.3) - disclosed
--     here rather than silently treated as compatible with the other
--     manufacturers' recommended approach.
--   - MUAS 8 and MUAS 10 are NOT covered by this correction - the real
--     IOM read this session only documents "MUAS 750" and "MUAS 1200"
--     by name; whether "MUAS 8"/"MUAS 10" are the same physical
--     products under an older duct-diameter-based naming convention or
--     genuinely different SKUs was not resolved this session - left
--     with their original null values rather than guessed.

alter table public.equipment_makeup_air_specs
  add column if not exists operating_temp_min_f numeric,
  add column if not exists operating_temp_max_f numeric;

comment on column public.equipment_makeup_air_specs.operating_temp_min_f is
  'Real, manufacturer-published minimum ambient operating temperature for the unit itself (not the minimum entering-air temperature at a downstream heat exchanger, a separate real constraint - see source_document for units where that is also documented).';

update public.equipment_makeup_air_specs
set duct_diameter_in = 8,
    max_rated_cfm = 750,
    operating_temp_min_f = -20,
    operating_temp_max_f = 140,
    source_document = 'Fantech MUAS Series Installation, Operations, and Maintenance Manual (Item #497868, Rev 2024-09-18) - Dimensions table (p.5, duct diameter J=8in for MUAS 750); "Recommended ambient operating temperature range for the MUAS is -20F to 140F" (p.6); real cfm figure follows Fantech''s own model-number-equals-max-cfm convention (independently confirmed for the sibling MUAS 1200 in its own product card, K46014, "airflow up to 1,200 cfm (max)"), not independently stated for the 750 in a document read this session. Real, safety-critical minimum entering-air temperature at a gas/oil heat exchanger for this platform: 55F (12.8C) per the same IOM p.6 - a different, more specific number than the ~60F figure cited elsewhere (Broan''s guide) for other manufacturers'' equipment, not reconciled. Fantech''s own IOM (p.3) states it "deems it unacceptable to use central HVAC system equipment and duct work for treatment and conveyance of makeup air" - a real, distinct manufacturer position from the return-trunk-tie-in approach described in other manufacturers'' literature.'
where equipment_id = (select id from public.equipment_catalog where manufacturer = 'Fantech' and model_number = 'MUAS 750');

update public.equipment_makeup_air_specs
set duct_diameter_in = 10,
    max_rated_cfm = 1200,
    operating_temp_min_f = -20,
    operating_temp_max_f = 140,
    source_document = 'Fantech MUAS Series Installation, Operations, and Maintenance Manual (Item #497868, Rev 2024-09-18) - Dimensions table (p.5, duct diameter J=10in for MUAS 1200); "Recommended ambient operating temperature range for the MUAS is -20F to 140F" (p.6). MUAS 1200 Makeup Air System product card (Item #K46014, shop.fantech.net) - "airflow up to 1,200 cfm (max)," "10 in. duct." Real, safety-critical minimum entering-air temperature at a gas/oil heat exchanger for this platform: 55F (12.8C) per the IOM p.6 - a different, more specific number than the ~60F figure cited elsewhere (Broan''s guide) for other manufacturers'' equipment, not reconciled. Fantech''s own IOM (p.3) states it "deems it unacceptable to use central HVAC system equipment and duct work for treatment and conveyance of makeup air" - a real, distinct manufacturer position from the return-trunk-tie-in approach described in other manufacturers'' literature.'
where equipment_id = (select id from public.equipment_catalog where manufacturer = 'Fantech' and model_number = 'MUAS 1200');
