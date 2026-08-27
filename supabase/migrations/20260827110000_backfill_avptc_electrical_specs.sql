-- Catalog Expansion + Recommended Install Package, Section 3 Gap 2
-- backfill - real electrical nameplate data for the AVPTC-family air
-- handlers already in the catalog (Amana/Goodman/Daikin, all sharing the
-- same physical platform). Every value below is the exact same "Product
-- Specifications" table already read directly from each brand's own
-- Specification Sheet earlier this session while sourcing blower data
-- (SS-AAVPTC p.3, SS-GAVPTC p.3, SS-DVPTC p.3) - re-used from that
-- verbatim read, not re-estimated.
do $$
declare
  amana_37b uuid; amana_37c uuid;
  goodman_25b uuid; goodman_35b uuid; goodman_37b uuid; goodman_37c uuid; goodman_37d uuid;
  daikin_37c uuid;
begin
  select id into amana_37b from public.equipment_catalog where manufacturer = 'Amana' and model_number = 'AVPTC37B14B';
  select id into amana_37c from public.equipment_catalog where manufacturer = 'Amana' and model_number = 'AVPTC37C14B';
  select id into goodman_25b from public.equipment_catalog where manufacturer = 'Goodman' and model_number = 'AVPTC25B14B';
  select id into goodman_35b from public.equipment_catalog where manufacturer = 'Goodman' and model_number = 'AVPTC35B14B';
  select id into goodman_37b from public.equipment_catalog where manufacturer = 'Goodman' and model_number = 'AVPTC37B14B';
  select id into goodman_37c from public.equipment_catalog where manufacturer = 'Goodman' and model_number = 'AVPTC37C14B';
  select id into goodman_37d from public.equipment_catalog where manufacturer = 'Goodman' and model_number = 'AVPTC37D14B';
  select id into daikin_37c from public.equipment_catalog where manufacturer = 'Daikin' and model_number = 'DV37PTCC14A';

  insert into public.equipment_electrical_specs (equipment_id, voltage_phase, min_circuit_ampacity, max_overcurrent_protection, min_voltage, max_voltage, source_document) values
    (amana_37b, '208/240', 6.5, 15, 197, 253, 'Amana SS-AAVPTC Specification Sheet (rev. 3/21), p.3 (Product Specifications, AVPTC37B14B* column)'),
    (amana_37c, '208/240', 6.5, 15, 197, 253, 'Amana SS-AAVPTC Specification Sheet (rev. 3/21), p.3 (Product Specifications, AVPTC37C14B* column)'),
    (goodman_25b, '208/240', 4.9, 15, 197, 253, 'Goodman SS-GAVPTC Specification Sheet, p.3 (Product Specifications, AVPTC25B14B* column)'),
    (goodman_35b, '208/240', 4.9, 15, 197, 253, 'Goodman SS-GAVPTC Specification Sheet, p.3 (Product Specifications, AVPTC35B14B* column)'),
    (goodman_37b, '208/240', 6.5, 15, 197, 253, 'Goodman SS-GAVPTC Specification Sheet, p.3 (Product Specifications, AVPTC37B14B* column)'),
    (goodman_37c, '208/240', 6.5, 15, 197, 253, 'Goodman SS-GAVPTC Specification Sheet, p.3 (Product Specifications, AVPTC37C14B* column)'),
    (goodman_37d, '208/240', 6.5, 15, 197, 253, 'Goodman SS-GAVPTC Specification Sheet, p.3 (Product Specifications, AVPTC37D14B* column)'),
    (daikin_37c, '208/240', 6.5, 15, 197, 253, 'Daikin SS-DVPTC Specification Sheet (rev. 05/22), p.3 (Product Specifications, DV37PTCC14A* column)')
  on conflict (equipment_id) do nothing;
end $$;
