-- Catalog Expansion + Recommended Install Package, Section 3 Gaps 5+6
-- backfill for Carrier FB4CNF036 - real filter spec and real electric
-- heat-kit options, both from the same FB4C Base Series Product Data
-- A10082 document already cited for this row's blower data
-- (https://www.carriercca.com/pdf/products_pdf/FB4CNF-Data.pdf).
do $$
declare
  fb4c036 uuid;
begin
  select id into fb4c036 from public.equipment_catalog where manufacturer = 'Carrier' and model_number = 'FB4CNF036';

  -- p.10 PHYSICAL DATA: "*Filter must be field-supplied for FB4C units"
  -- (filter_furnished = false, a real disclosed fact, not an omission);
  -- p.17 Accessories table's real Filter Kit / Filter Rack Kit part
  -- numbers for the 025/030/036 size group this model belongs to.
  insert into public.equipment_filter_specs (equipment_id, filter_furnished, filter_type, filter_size, source_document) values
    (fb4c036, false, 'Field-supplied media filter (accessory kit KFAFK0212MED / rack KFAFR0201FRM for 025,030,036 sizes)', '19-7/8in (505mm)', 'FB4C Product Data A10082, p.10 (PHYSICAL DATA, FILTER row) and p.17 (Accessories, item 7/11)')
  on conflict (equipment_id) do nothing;

  -- p.16 ACCESSORY ELECTRIC HEATER ELECTRICAL DATA - 3 real, single-
  -- phase 208/230V kW options applicable to the 018-036 fan-coil size
  -- group FB4CNF036 belongs to (p.16's own airflow-table note: "2
  -- element heater sizes 018 through 036"). minimum_airflow_cfm left
  -- null - this document gives real heater amperage/wire-size data but
  -- does not publish a discrete minimum-CFM-per-kit figure the way
  -- some other manufacturers' literature does (seen, but not sourced
  -- this pass, on Carrier's own FE4A/FE5A communicating fan coil line).
  insert into public.equipment_heat_kit_compatibility (equipment_id, heat_kit_kw, heat_kit_model, source_document) values
    (fb4c036, 5, 'KFCEH0501N051', 'FB4C Product Data A10082, p.16 (Accessory Electric Heater Electrical Data)'),
    (fb4c036, 10, 'KFCEH0901N10', 'FB4C Product Data A10082, p.16 (Accessory Electric Heater Electrical Data)'),
    (fb4c036, 15, 'KFCEH3001F15', 'FB4C Product Data A10082, p.16 (Accessory Electric Heater Electrical Data)');
end $$;
