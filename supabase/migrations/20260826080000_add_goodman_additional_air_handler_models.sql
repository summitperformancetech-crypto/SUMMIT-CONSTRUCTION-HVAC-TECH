-- Permit-Submittable Manual D Package, Section 5 sourcing follow-up -
-- two additional real Goodman AVPTC models beyond the 25B14B/37B14B/
-- 37C14B already seeded in 20260826030000, per direct instruction to
-- source Amana/Carrier/Daikin/Goodman(additional)/Trane blower data.
--
-- Source: same Goodman SS-GAVPTC Specification Sheet already cited
-- (https://apps.goodmanmfg.com/brochures/files/5c9b9d4518cddSS-GAVPTC.pdf),
-- p.3 (Product Specifications) and p.5 (Airflow Data table) - re-fetched
-- and re-transcribed directly from the live document for these two
-- additional models, not inferred from the ones already in the DB.
--
-- AVPTC35B14B*: nominal cooling 28,000 BTU/h (p.3) - a real, previously-
-- unrepresented capacity tier (the existing 3 seeded models cover only
-- 24,000/36,000/36,000).
-- AVPTC37D14B*: nominal cooling 36,000 BTU/h with the largest blower in
-- the line (10-5/8"x10-5/8", vs. 8" width on 37B14B/37C14B) - a real,
-- distinct high-static-capacity option manufacturers publish for the
-- same nominal tonnage.
insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
  ('Goodman', 'AVPTC35B14B', 'air_handler', 'variable_speed', 28000, null, 1020, 'Goodman SS-GAVPTC Specification Sheet, https://apps.goodmanmfg.com/brochures/files/5c9b9d4518cddSS-GAVPTC.pdf, p.3 (nominal ratings) and p.5 (Airflow Data table)'),
  ('Goodman', 'AVPTC37D14B', 'air_handler', 'variable_speed', 36000, null, 1375, 'Goodman SS-GAVPTC Specification Sheet, https://apps.goodmanmfg.com/brochures/files/5c9b9d4518cddSS-GAVPTC.pdf, p.3 (nominal ratings) and p.5 (Airflow Data table)')
on conflict do nothing;

do $$
declare
  ah35b uuid;
  ah37d uuid;
begin
  select id into ah35b from public.equipment_catalog where model_number = 'AVPTC35B14B' and manufacturer = 'Goodman';
  select id into ah37d from public.equipment_catalog where model_number = 'AVPTC37D14B' and manufacturer = 'Goodman';

  if not exists (select 1 from public.equipment_blower_performance where equipment_id = ah35b) then
    insert into public.equipment_blower_performance (equipment_id, speed_tap, esp_iwc, cfm, source_document) values
      (ah35b, 'A', 0.1, 645, 'SS-GAVPTC p.5'), (ah35b, 'A', 0.2, 630, 'SS-GAVPTC p.5'), (ah35b, 'A', 0.3, 645, 'SS-GAVPTC p.5'), (ah35b, 'A', 0.4, 645, 'SS-GAVPTC p.5'), (ah35b, 'A', 0.5, 635, 'SS-GAVPTC p.5'), (ah35b, 'A', 0.6, 630, 'SS-GAVPTC p.5'), (ah35b, 'A', 0.7, 630, 'SS-GAVPTC p.5'), (ah35b, 'A', 0.8, 635, 'SS-GAVPTC p.5'), (ah35b, 'A', 0.9, 635, 'SS-GAVPTC p.5'),
      (ah35b, 'B', 0.1, 900, 'SS-GAVPTC p.5'), (ah35b, 'B', 0.2, 875, 'SS-GAVPTC p.5'), (ah35b, 'B', 0.3, 870, 'SS-GAVPTC p.5'), (ah35b, 'B', 0.4, 870, 'SS-GAVPTC p.5'), (ah35b, 'B', 0.5, 870, 'SS-GAVPTC p.5'), (ah35b, 'B', 0.6, 870, 'SS-GAVPTC p.5'), (ah35b, 'B', 0.7, 865, 'SS-GAVPTC p.5'), (ah35b, 'B', 0.8, 855, 'SS-GAVPTC p.5'), (ah35b, 'B', 0.9, 845, 'SS-GAVPTC p.5'),
      (ah35b, 'C', 0.1, 1030, 'SS-GAVPTC p.5'), (ah35b, 'C', 0.2, 1015, 'SS-GAVPTC p.5'), (ah35b, 'C', 0.3, 1005, 'SS-GAVPTC p.5'), (ah35b, 'C', 0.4, 995, 'SS-GAVPTC p.5'), (ah35b, 'C', 0.5, 990, 'SS-GAVPTC p.5'), (ah35b, 'C', 0.6, 985, 'SS-GAVPTC p.5'), (ah35b, 'C', 0.7, 990, 'SS-GAVPTC p.5'), (ah35b, 'C', 0.8, 990, 'SS-GAVPTC p.5'), (ah35b, 'C', 0.9, 980, 'SS-GAVPTC p.5'),
      (ah35b, 'D', 0.1, 1075, 'SS-GAVPTC p.5'), (ah35b, 'D', 0.2, 1060, 'SS-GAVPTC p.5'), (ah35b, 'D', 0.3, 1045, 'SS-GAVPTC p.5'), (ah35b, 'D', 0.4, 1035, 'SS-GAVPTC p.5'), (ah35b, 'D', 0.5, 1030, 'SS-GAVPTC p.5'), (ah35b, 'D', 0.6, 1025, 'SS-GAVPTC p.5'), (ah35b, 'D', 0.7, 1020, 'SS-GAVPTC p.5'), (ah35b, 'D', 0.8, 1020, 'SS-GAVPTC p.5'), (ah35b, 'D', 0.9, 1015, 'SS-GAVPTC p.5');
  end if;

  if not exists (select 1 from public.equipment_blower_performance where equipment_id = ah37d) then
    insert into public.equipment_blower_performance (equipment_id, speed_tap, esp_iwc, cfm, source_document) values
      (ah37d, 'A', 0.1, 910, 'SS-GAVPTC p.5'), (ah37d, 'A', 0.2, 905, 'SS-GAVPTC p.5'), (ah37d, 'A', 0.3, 900, 'SS-GAVPTC p.5'), (ah37d, 'A', 0.4, 870, 'SS-GAVPTC p.5'), (ah37d, 'A', 0.5, 870, 'SS-GAVPTC p.5'), (ah37d, 'A', 0.6, 860, 'SS-GAVPTC p.5'), (ah37d, 'A', 0.7, 855, 'SS-GAVPTC p.5'), (ah37d, 'A', 0.8, 845, 'SS-GAVPTC p.5'), (ah37d, 'A', 0.9, 845, 'SS-GAVPTC p.5'),
      (ah37d, 'B', 0.1, 1085, 'SS-GAVPTC p.5'), (ah37d, 'B', 0.2, 1080, 'SS-GAVPTC p.5'), (ah37d, 'B', 0.3, 1080, 'SS-GAVPTC p.5'), (ah37d, 'B', 0.4, 1060, 'SS-GAVPTC p.5'), (ah37d, 'B', 0.5, 1060, 'SS-GAVPTC p.5'), (ah37d, 'B', 0.6, 1055, 'SS-GAVPTC p.5'), (ah37d, 'B', 0.7, 1045, 'SS-GAVPTC p.5'), (ah37d, 'B', 0.8, 1035, 'SS-GAVPTC p.5'), (ah37d, 'B', 0.9, 1020, 'SS-GAVPTC p.5'),
      (ah37d, 'C', 0.1, 1230, 'SS-GAVPTC p.5'), (ah37d, 'C', 0.2, 1225, 'SS-GAVPTC p.5'), (ah37d, 'C', 0.3, 1225, 'SS-GAVPTC p.5'), (ah37d, 'C', 0.4, 1205, 'SS-GAVPTC p.5'), (ah37d, 'C', 0.5, 1205, 'SS-GAVPTC p.5'), (ah37d, 'C', 0.6, 1200, 'SS-GAVPTC p.5'), (ah37d, 'C', 0.7, 1190, 'SS-GAVPTC p.5'), (ah37d, 'C', 0.8, 1185, 'SS-GAVPTC p.5'), (ah37d, 'C', 0.9, 1180, 'SS-GAVPTC p.5'),
      (ah37d, 'D', 0.1, 1405, 'SS-GAVPTC p.5'), (ah37d, 'D', 0.2, 1405, 'SS-GAVPTC p.5'), (ah37d, 'D', 0.3, 1405, 'SS-GAVPTC p.5'), (ah37d, 'D', 0.4, 1370, 'SS-GAVPTC p.5'), (ah37d, 'D', 0.5, 1365, 'SS-GAVPTC p.5'), (ah37d, 'D', 0.6, 1355, 'SS-GAVPTC p.5'), (ah37d, 'D', 0.7, 1345, 'SS-GAVPTC p.5'), (ah37d, 'D', 0.8, 1335, 'SS-GAVPTC p.5'), (ah37d, 'D', 0.9, 1330, 'SS-GAVPTC p.5');
  end if;
end $$;
