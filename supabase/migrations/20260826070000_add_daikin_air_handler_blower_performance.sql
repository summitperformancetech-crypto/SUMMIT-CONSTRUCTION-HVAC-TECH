-- Permit-Submittable Manual D Package, Section 5 sourcing follow-up -
-- real Daikin air handler blower data.
--
-- Source: Daikin SS-DVPTC Specification Sheet (rev. 05/22, supersedes
-- 03/21), https://cdn.daikincloud.io/PIM/Assets/Documents/SS-DVPTC.pdf -
-- Daikin's own DVPTC air handler line (the same physical platform family
-- as Goodman's AVPTC and Amana's AVPTC, all three brands owned by
-- Daikin, but this is Daikin's own separately-published, Daikin-branded
-- document - not copied from the Goodman/Amana entries already seeded).
-- Model DV37PTCC14A*: nominal cooling 36,000 BTU/h, "CFM (High range)"
-- 1315/870 (p.3 Product Specifications) - real per that page.
--
-- Unlike the current-generation Amana AVPTC platform (see that
-- migration's own comment - self-regulating, no open ESP curve
-- published), this DVPTC document DOES publish a real 4-tap (A/B/C/D) x
-- 9-point (0.1-0.9 iwc) swept "Airflow Data" table (p.5) - the "High"
-- row set per tap is the real cooling-mode airflow used here ("Low" rows
-- are a reduced-airflow/humidistat mode per that page's own note and are
-- out of scope for this design-CFM gate, not silently merged in).
insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
  ('Daikin', 'DV37PTCC14A', 'air_handler', 'variable_speed', 36000, null, 1315, 'Daikin SS-DVPTC Specification Sheet (rev. 05/22), https://cdn.daikincloud.io/PIM/Assets/Documents/SS-DVPTC.pdf, p.3 (Product Specifications, CFM High range) and p.5 (Airflow Data table, DV37PTCC14A* High rows)')
on conflict do nothing;

do $$
declare
  dv37c uuid;
begin
  select id into dv37c from public.equipment_catalog where model_number = 'DV37PTCC14A' and manufacturer = 'Daikin';

  if not exists (select 1 from public.equipment_blower_performance where equipment_id = dv37c) then
    insert into public.equipment_blower_performance (equipment_id, speed_tap, esp_iwc, cfm, source_document) values
      (dv37c, 'A', 0.1, 885, 'SS-DVPTC p.5'), (dv37c, 'A', 0.2, 880, 'SS-DVPTC p.5'), (dv37c, 'A', 0.3, 880, 'SS-DVPTC p.5'), (dv37c, 'A', 0.4, 860, 'SS-DVPTC p.5'), (dv37c, 'A', 0.5, 850, 'SS-DVPTC p.5'), (dv37c, 'A', 0.6, 840, 'SS-DVPTC p.5'), (dv37c, 'A', 0.7, 830, 'SS-DVPTC p.5'), (dv37c, 'A', 0.8, 820, 'SS-DVPTC p.5'), (dv37c, 'A', 0.9, 830, 'SS-DVPTC p.5'),
      (dv37c, 'B', 0.1, 1055, 'SS-DVPTC p.5'), (dv37c, 'B', 0.2, 1055, 'SS-DVPTC p.5'), (dv37c, 'B', 0.3, 1055, 'SS-DVPTC p.5'), (dv37c, 'B', 0.4, 1040, 'SS-DVPTC p.5'), (dv37c, 'B', 0.5, 1030, 'SS-DVPTC p.5'), (dv37c, 'B', 0.6, 1015, 'SS-DVPTC p.5'), (dv37c, 'B', 0.7, 1005, 'SS-DVPTC p.5'), (dv37c, 'B', 0.8, 995, 'SS-DVPTC p.5'), (dv37c, 'B', 0.9, 985, 'SS-DVPTC p.5'),
      (dv37c, 'C', 0.1, 1275, 'SS-DVPTC p.5'), (dv37c, 'C', 0.2, 1270, 'SS-DVPTC p.5'), (dv37c, 'C', 0.3, 1265, 'SS-DVPTC p.5'), (dv37c, 'C', 0.4, 1260, 'SS-DVPTC p.5'), (dv37c, 'C', 0.5, 1250, 'SS-DVPTC p.5'), (dv37c, 'C', 0.6, 1240, 'SS-DVPTC p.5'), (dv37c, 'C', 0.7, 1230, 'SS-DVPTC p.5'), (dv37c, 'C', 0.8, 1215, 'SS-DVPTC p.5'), (dv37c, 'C', 0.9, 1205, 'SS-DVPTC p.5'),
      (dv37c, 'D', 0.1, 1365, 'SS-DVPTC p.5'), (dv37c, 'D', 0.2, 1360, 'SS-DVPTC p.5'), (dv37c, 'D', 0.3, 1360, 'SS-DVPTC p.5'), (dv37c, 'D', 0.4, 1330, 'SS-DVPTC p.5'), (dv37c, 'D', 0.5, 1300, 'SS-DVPTC p.5'), (dv37c, 'D', 0.6, 1290, 'SS-DVPTC p.5'), (dv37c, 'D', 0.7, 1280, 'SS-DVPTC p.5'), (dv37c, 'D', 0.8, 1270, 'SS-DVPTC p.5'), (dv37c, 'D', 0.9, 1255, 'SS-DVPTC p.5');
  end if;
end $$;
