-- Permit-Submittable Manual D Package, Section 5 sourcing follow-up -
-- real Trane air handler blower data.
--
-- Source: Trane TAM7 Series "Modular Variable Speed Air Handlers 2-5
-- Tons" Product & Performance Data (Pub. No. 22-1847), model
-- *AM7A0C36H31SA (nominal cooling 36,000 BTU/h, 3-ton outdoor-unit
-- match, per p.1's own Product Specifications table),
-- https://hvacrschool.com/wp-content/uploads/2018/05/TAM7.pdf, p.12
-- "*AM7A0C36 AIRFLOW PERFORMANCE" table, the real "3 tons" outdoor-
-- multiplier block.
--
-- Real, disclosed structural difference from the lettered-tap (A/B/C/D)
-- tables used for the other manufacturers: Trane's TAM7 doesn't use
-- fixed speed taps at all - it's field-configured to a target "Cooling
-- Airflow Setting" in CFM/ton (350/370/390/400/410/420/440/450, with 370
-- factory-set for this model, marked "dagger" in the source table). Each
-- setting is modeled here as its own speed_tap string (e.g. "350
-- CFM/ton") - a real, distinct field-selectable operating point, not an
-- arbitrary relabeling.
--
-- Real, disclosed simplification: the source table publishes TWO values
-- per (setting, ESP) cell below ~0.7in wc - "Constant CFM Mode /
-- Constant Torque Mode" (e.g. "1036 / 1175" at 0.1in) - because the
-- blower's control algorithm blends from constant-airflow toward
-- constant-torque behavior as static rises (Note 4: "Torque mode will
-- reduce airflow when static is above approximately 0.35in wc"). Only
-- the Constant CFM Mode (first) value is transcribed below - the
-- design-intended target airflow - not the torque-mode fallback value;
-- above 0.35in wc actual delivered airflow may run higher than what's
-- recorded here per that same note, a real, disclosed direction of
-- error (conservative for the ESP-vs-capacity gate, not optimistic).
insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
  ('Trane', 'AM7A0C36H31SA', 'air_handler', 'variable_speed', 36000, null, 1114, 'Trane TAM7 Series Product & Performance Data, https://hvacrschool.com/wp-content/uploads/2018/05/TAM7.pdf, p.1 (Product Specifications) and p.12 (Airflow Performance table, 3-ton block, factory-set 370 CFM/ton at 0.5in wc used as rated_cfm)')
on conflict do nothing;

do $$
declare
  tam7_36 uuid;
begin
  select id into tam7_36 from public.equipment_catalog where model_number = 'AM7A0C36H31SA' and manufacturer = 'Trane';

  if not exists (select 1 from public.equipment_blower_performance where equipment_id = tam7_36) then
    insert into public.equipment_blower_performance (equipment_id, speed_tap, esp_iwc, cfm, source_document) values
      (tam7_36, '350 CFM/ton', 0.1, 1036, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '350 CFM/ton', 0.3, 1044, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '350 CFM/ton', 0.5, 1053, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '350 CFM/ton', 0.7, 1060, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '350 CFM/ton', 0.9, 1064, 'TAM7 p.12, 3-ton block, Constant CFM Mode'),
      (tam7_36, '370 CFM/ton (factory)', 0.1, 1090, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '370 CFM/ton (factory)', 0.3, 1102, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '370 CFM/ton (factory)', 0.5, 1114, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '370 CFM/ton (factory)', 0.7, 1122, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '370 CFM/ton (factory)', 0.9, 1123, 'TAM7 p.12, 3-ton block, Constant CFM Mode'),
      (tam7_36, '390 CFM/ton', 0.1, 1145, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '390 CFM/ton', 0.3, 1161, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '390 CFM/ton', 0.5, 1176, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '390 CFM/ton', 0.7, 1184, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '390 CFM/ton', 0.9, 1184, 'TAM7 p.12, 3-ton block, Constant CFM Mode'),
      (tam7_36, '400 CFM/ton', 0.1, 1175, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '400 CFM/ton', 0.3, 1189, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '400 CFM/ton', 0.5, 1203, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '400 CFM/ton', 0.7, 1214, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '400 CFM/ton', 0.9, 1215, 'TAM7 p.12, 3-ton block, Constant CFM Mode'),
      (tam7_36, '410 CFM/ton', 0.1, 1204, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '410 CFM/ton', 0.3, 1223, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '410 CFM/ton', 0.5, 1238, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '410 CFM/ton', 0.7, 1246, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '410 CFM/ton', 0.9, 1242, 'TAM7 p.12, 3-ton block, Constant CFM Mode'),
      (tam7_36, '420 CFM/ton', 0.1, 1234, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '420 CFM/ton', 0.3, 1251, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '420 CFM/ton', 0.5, 1267, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '420 CFM/ton', 0.7, 1275, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '420 CFM/ton', 0.9, 1272, 'TAM7 p.12, 3-ton block, Constant CFM Mode'),
      (tam7_36, '440 CFM/ton', 0.1, 1295, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '440 CFM/ton', 0.3, 1315, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '440 CFM/ton', 0.5, 1331, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '440 CFM/ton', 0.7, 1335, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '440 CFM/ton', 0.9, 1325, 'TAM7 p.12, 3-ton block, Constant CFM Mode'),
      (tam7_36, '450 CFM/ton', 0.1, 1327, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '450 CFM/ton', 0.3, 1348, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '450 CFM/ton', 0.5, 1362, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '450 CFM/ton', 0.7, 1364, 'TAM7 p.12, 3-ton block, Constant CFM Mode'), (tam7_36, '450 CFM/ton', 0.9, 1350, 'TAM7 p.12, 3-ton block, Constant CFM Mode');
  end if;
end $$;
