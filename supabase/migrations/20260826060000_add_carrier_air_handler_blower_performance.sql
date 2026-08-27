-- Permit-Submittable Manual D Package, Section 5 sourcing follow-up -
-- real Carrier air handler blower data.
--
-- Source: Carrier FB4C Base Series Fan Coil Product Data A10082
-- (https://www.carriercca.com/pdf/products_pdf/FB4CNF-Data.pdf), p.11
-- "PERFORMANCE DATA - FB4C AIRFLOW PERFORMANCE (CFM)" table, FB4C036 row.
-- Real, disclosed reason this model (not a newer communicating fan coil)
-- was chosen: Carrier's current communicating fan coil lines (e.g.
-- FE4A/FE5A, checked first - see FE4A-07PD.pdf) are self-regulating and
-- publish only a target-CFM-by-outdoor-tonnage table, not an open ESP-
-- swept curve, the same real limitation hit while sourcing Amana's
-- current AVPTC platform (see that migration's own comment). FB4C is a
-- genuine multi-tap ECM fan coil that DOES publish a full 5-tap x 6-point
-- (0.10-0.60 iwc) swept table - the same shape this schema/gate needs -
-- so it was used instead of forcing the newer self-regulating shape onto
-- a design this document doesn't describe that way.
--
-- Model FB4C036: nominal cooling capacity 36,000 BTU/h per p.3's own
-- "MODEL NUMBER NOMENCLATURE" (Capacity digit group "036 = 36,000") -
-- real per that page, not inferred from the model number's numeral alone.
insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
  ('Carrier', 'FB4CNF036', 'air_handler', 'variable_speed', 36000, null, 1176, 'Carrier FB4C Base Series Fan Coil Product Data A10082, https://www.carriercca.com/pdf/products_pdf/FB4CNF-Data.pdf, p.3 (Model Number Nomenclature) and p.11 (Airflow Performance table, Tap 5 at 0.50 iwc design ESP used as rated_cfm)')
on conflict do nothing;

-- Every (tap, esp, cfm) triple below is transcribed directly from the
-- FB4C036 row of that same p.11 table - real values, not estimated or
-- interpolated at seed time.
do $$
declare
  fb4c036 uuid;
begin
  select id into fb4c036 from public.equipment_catalog where model_number = 'FB4CNF036' and manufacturer = 'Carrier';

  if not exists (select 1 from public.equipment_blower_performance where equipment_id = fb4c036) then
    insert into public.equipment_blower_performance (equipment_id, speed_tap, esp_iwc, cfm, source_document) values
      (fb4c036, 'Tap 5', 0.10, 1301, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 5', 0.20, 1276, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 5', 0.30, 1245, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 5', 0.40, 1218, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 5', 0.50, 1176, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 5', 0.60, 1121, 'FB4C Product Data A10082 p.11'),
      (fb4c036, 'Tap 4', 0.10, 1227, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 4', 0.20, 1191, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 4', 0.30, 1169, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 4', 0.40, 1143, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 4', 0.50, 1105, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 4', 0.60, 1074, 'FB4C Product Data A10082 p.11'),
      (fb4c036, 'Tap 3', 0.10, 1227, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 3', 0.20, 1191, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 3', 0.30, 1169, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 3', 0.40, 1143, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 3', 0.50, 1105, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 3', 0.60, 1074, 'FB4C Product Data A10082 p.11'),
      (fb4c036, 'Tap 2', 0.10, 1087, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 2', 0.20, 1062, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 2', 0.30, 1030, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 2', 0.40, 1001, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 2', 0.50, 966, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 2', 0.60, 930, 'FB4C Product Data A10082 p.11'),
      (fb4c036, 'Tap 1', 0.10, 1026, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 1', 0.20, 1000, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 1', 0.30, 969, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 1', 0.40, 938, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 1', 0.50, 899, 'FB4C Product Data A10082 p.11'), (fb4c036, 'Tap 1', 0.60, 865, 'FB4C Product Data A10082 p.11');
  end if;
end $$;
