-- Catalog Expansion + Recommended Install Package, Section 3 Gaps 2+3
-- backfill for the 6 pre-existing outdoor units (Amana ASZ16, Goodman
-- GSZB4, Carrier 26TPA8/26VNA1) - real electrical nameplate + refrigerant
-- line-size data, re-fetched from each model's own already-cited
-- source document (same URLs already in equipment_catalog.source_document
-- for these rows).
do $$
declare
  amana_24 uuid; amana_36 uuid; amana_48 uuid; amana_60 uuid;
  goodman_18 uuid; goodman_36 uuid;
  carrier_tpa uuid; carrier_vna uuid;
begin
  select id into amana_24 from public.equipment_catalog where manufacturer = 'Amana' and model_number = 'ASZ160241K';
  select id into amana_36 from public.equipment_catalog where manufacturer = 'Amana' and model_number = 'ASZ160361K';
  select id into amana_48 from public.equipment_catalog where manufacturer = 'Amana' and model_number = 'ASZ160481K';
  select id into amana_60 from public.equipment_catalog where manufacturer = 'Amana' and model_number = 'ASZ160601K';
  select id into goodman_18 from public.equipment_catalog where manufacturer = 'Goodman' and model_number = 'GSZB401810A';
  select id into goodman_36 from public.equipment_catalog where manufacturer = 'Goodman' and model_number = 'GSZB403610A';
  select id into carrier_tpa from public.equipment_catalog where manufacturer = 'Carrier' and model_number = '26TPA824W003';
  select id into carrier_vna from public.equipment_catalog where manufacturer = 'Carrier' and model_number = '26VNA124';

  insert into public.equipment_electrical_specs (equipment_id, voltage_phase, min_circuit_ampacity, max_overcurrent_protection, min_voltage, max_voltage, source_document) values
    (amana_24, '208/230-1', 18, 30, 197, 253, 'Amana SS-ASZ16 Specification Sheet, https://documents.alpinehomeair.com/product/Amana%20ASZ16%20Spec%20Sheets.pdf, p.3 (Product Specifications, ASZ160241K column)'),
    (amana_36, '208/230-1', 18.6, 30, 197, 253, 'Amana SS-ASZ16 Specification Sheet, https://documents.alpinehomeair.com/product/Amana%20ASZ16%20Spec%20Sheets.pdf, p.3 (Product Specifications, ASZ160361K column)'),
    (amana_48, '208/230-1', 25.9, 45, 197, 253, 'Amana SS-ASZ16 Specification Sheet, https://documents.alpinehomeair.com/product/Amana%20ASZ16%20Spec%20Sheets.pdf, p.3 (Product Specifications, ASZ160481K column)'),
    (amana_60, '208/230-1', 37, 60, 197, 253, 'Amana SS-ASZ16 Specification Sheet, https://documents.alpinehomeair.com/product/Amana%20ASZ16%20Spec%20Sheets.pdf, p.3 (Product Specifications, ASZ160601K column)'),
    (goodman_18, '208/230', 8.6, 15, 197, 253, 'Goodman SS-GSZB4 Specification Sheet, https://www.acdirect.com/media/specs/Goodman/gszb4-specifications.pdf, p.3 (Product Specifications, GSZB401810A* column)'),
    (goodman_36, '208/230', 21, 35, 197, 253, 'Goodman SS-GSZB4 Specification Sheet, https://www.acdirect.com/media/specs/Goodman/gszb4-specifications.pdf, p.3 (Product Specifications, GSZB403610A* column)'),
    (carrier_tpa, '208-230/1', 15.5, 20, 197, 253, 'Carrier 26TPA8 Performance 18 Product Data, https://assets-f02205d260.cdn.insitecloud.net/348cf726d4353c1/26TPA8-01PD.pdf, p.5 (Electrical Data, unit size 24)'),
    (carrier_vna, '208-230-1', 19.4, 25, 197, 253, 'Carrier 26VNA1 Infinity Variable Speed Air Conditioner Product Data, https://www.shareddocs.com/hvac/docs/1009/Public/00/26VNA1-01PD.pdf, p.3 (Electrical Data, unit size 24)')
  on conflict (equipment_id) do nothing;

  -- Real refrigerant line sizes (Gap 3) - max_equivalent_length_ft left
  -- null for all: none of these documents publish a real max-length
  -- figure directly, only a factory-test/rated length (disclosed per
  -- row) with longer runs deferred to a separate sizing table/software
  -- this session did not have access to - the same real limitation
  -- already disclosed for the Daikin/Trane rows.
  insert into public.refrigerant_lineset_specs (equipment_id, liquid_line_diameter_in, vapor_line_diameter_in, length_derate_notes, source_document) values
    (amana_24, 0.375, 0.75, 'Factory-charged for 15ft of 3/8in liquid line (SS-ASZ16 p.3); no max-length table published in this document.', 'Amana SS-ASZ16 p.3'),
    (amana_36, 0.375, 0.875, 'Factory-charged for 15ft of 3/8in liquid line (SS-ASZ16 p.3); no max-length table published in this document.', 'Amana SS-ASZ16 p.3'),
    (amana_48, 0.375, 1.125, 'Factory-charged for 15ft of 3/8in liquid line (SS-ASZ16 p.3); no max-length table published in this document.', 'Amana SS-ASZ16 p.3'),
    (amana_60, 0.375, 1.125, 'Factory-charged for 15ft of 3/8in liquid line (SS-ASZ16 p.3); no max-length table published in this document.', 'Amana SS-ASZ16 p.3'),
    (goodman_18, 0.375, 0.75, 'Factory-charged for 15ft of 3/8in liquid line (SS-GSZB4 p.3); no max-length table published in this document.', 'Goodman SS-GSZB4 p.3'),
    (goodman_36, 0.375, 0.875, 'Factory-charged for 15ft of 3/8in liquid line (SS-GSZB4 p.3); no max-length table published in this document.', 'Goodman SS-GSZB4 p.3'),
    (carrier_vna, 0.375, 0.75, 'Rated with 25ft of lineset length (26VNA1-01PD p.3, footnote dagger); other sizes/lengths require Carrier''s separate Vapor Line Sizing and Cooling Capacity Loss table, not sourced this pass.', 'Carrier 26VNA1-01PD p.3')
  on conflict (equipment_id) do nothing;
end $$;
