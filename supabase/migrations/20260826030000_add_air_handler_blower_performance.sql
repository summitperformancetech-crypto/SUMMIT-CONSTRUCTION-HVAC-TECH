-- Permit-Submittable Manual D Package, Section 5 (ESP-vs-equipment-
-- capacity gate). Diagnostic finding: equipment_catalog had zero rated-
-- ESP/blower-performance data for ANY unit, and every existing row is an
-- OUTDOOR unit (heat pump/condenser) - blower performance is a property
-- of the INDOOR air handler/furnace, which this schema didn't model as
-- its own equipment line at all. This migration adds that line.
alter table public.equipment_catalog
  drop constraint equipment_catalog_equipment_type_check;
alter table public.equipment_catalog
  add constraint equipment_catalog_equipment_type_check
    check (equipment_type = any (array['split_ac', 'heat_pump', 'furnace', 'package_unit', 'air_handler']));

-- Real airflow-vs-external-static-pressure table, one row per (equipment,
-- speed_tap, esp_iwc) point - the same shape every ECM air handler
-- manufacturer publishes in its own product specification sheet. Multiple
-- speed taps (A/B/C/D or similar) exist because the airflow blower speed
-- is field-selected at install to match the design CFM - the gate needs
-- the OEM curve for the tap actually selected, not just one number.
create table if not exists public.equipment_blower_performance (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment_catalog(id) on delete cascade,
  speed_tap text not null,
  esp_iwc numeric not null,
  cfm numeric not null,
  source_document text not null
);

alter table public.equipment_blower_performance enable row level security;
create policy "equipment_blower_performance_select" on public.equipment_blower_performance
  for select to authenticated using (true);

-- A zone's real selected air handler, independent of its selected
-- outdoor unit (zones.selected_equipment_id) - one physical air handler
-- model is commonly matched to a range of outdoor tonnages by the
-- manufacturer's own published match-up tables, so this is not inferred
-- from the outdoor unit, it is its own real selection a tech makes.
alter table public.zones
  add column if not exists selected_air_handler_equipment_id uuid references public.equipment_catalog(id);

-- Real Goodman AVPTC series air handler airflow data - SS-GAVPTC
-- Specification Sheet (apps.goodmanmfg.com/brochures/files/
-- 5c9b9d4518cddSS-GAVPTC.pdf), page 5-6, "Airflow Data" table. Every
-- (model, speed_tap, esp) triple below is a real value transcribed
-- directly from that table - not estimated, not interpolated at seed
-- time (interpolation happens at query time against these real points).
insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
  ('Goodman', 'AVPTC25B14B', 'air_handler', 'variable_speed', 24000, null, 1085, 'Goodman SS-GAVPTC Specification Sheet, https://apps.goodmanmfg.com/brochures/files/5c9b9d4518cddSS-GAVPTC.pdf, p.3 (nominal ratings) and p.5 (Airflow Data table)'),
  ('Goodman', 'AVPTC37B14B', 'air_handler', 'variable_speed', 36000, null, 1085, 'Goodman SS-GAVPTC Specification Sheet, https://apps.goodmanmfg.com/brochures/files/5c9b9d4518cddSS-GAVPTC.pdf, p.3 (nominal ratings) and p.5 (Airflow Data table)'),
  ('Goodman', 'AVPTC37C14B', 'air_handler', 'variable_speed', 36000, null, 1315, 'Goodman SS-GAVPTC Specification Sheet, https://apps.goodmanmfg.com/brochures/files/5c9b9d4518cddSS-GAVPTC.pdf, p.3 (nominal ratings) and p.5 (Airflow Data table)')
on conflict do nothing;

-- Airflow Data table rows (esp 0.1-0.9 iwc, High speed range only - the
-- range actually used for cooling design per the same document's own
-- "350-450 CFM per ton" duct-sizing guidance elsewhere in the AVPTC
-- literature). Low-range/heating-tap rows were not transcribed this pass
-- - scoped, disclosed follow-up, not silently claimed complete.
do $$
declare
  ah25 uuid;
  ah37b uuid;
  ah37c uuid;
begin
  select id into ah25 from public.equipment_catalog where model_number = 'AVPTC25B14B' and manufacturer = 'Goodman';
  select id into ah37b from public.equipment_catalog where model_number = 'AVPTC37B14B' and manufacturer = 'Goodman';
  select id into ah37c from public.equipment_catalog where model_number = 'AVPTC37C14B' and manufacturer = 'Goodman';

  if not exists (select 1 from public.equipment_blower_performance where equipment_id = ah25) then
    insert into public.equipment_blower_performance (equipment_id, speed_tap, esp_iwc, cfm, source_document) values
      (ah25, 'A', 0.1, 670, 'SS-GAVPTC p.5'), (ah25, 'A', 0.2, 660, 'SS-GAVPTC p.5'), (ah25, 'A', 0.3, 650, 'SS-GAVPTC p.5'), (ah25, 'A', 0.4, 650, 'SS-GAVPTC p.5'), (ah25, 'A', 0.5, 655, 'SS-GAVPTC p.5'), (ah25, 'A', 0.6, 645, 'SS-GAVPTC p.5'), (ah25, 'A', 0.7, 640, 'SS-GAVPTC p.5'), (ah25, 'A', 0.8, 635, 'SS-GAVPTC p.5'), (ah25, 'A', 0.9, 625, 'SS-GAVPTC p.5'),
      (ah25, 'B', 0.1, 870, 'SS-GAVPTC p.5'), (ah25, 'B', 0.2, 865, 'SS-GAVPTC p.5'), (ah25, 'B', 0.3, 855, 'SS-GAVPTC p.5'), (ah25, 'B', 0.4, 850, 'SS-GAVPTC p.5'), (ah25, 'B', 0.5, 840, 'SS-GAVPTC p.5'), (ah25, 'B', 0.6, 840, 'SS-GAVPTC p.5'), (ah25, 'B', 0.7, 840, 'SS-GAVPTC p.5'), (ah25, 'B', 0.8, 830, 'SS-GAVPTC p.5'), (ah25, 'B', 0.9, 835, 'SS-GAVPTC p.5'),
      (ah25, 'C', 0.1, 1000, 'SS-GAVPTC p.5'), (ah25, 'C', 0.2, 990, 'SS-GAVPTC p.5'), (ah25, 'C', 0.3, 980, 'SS-GAVPTC p.5'), (ah25, 'C', 0.4, 975, 'SS-GAVPTC p.5'), (ah25, 'C', 0.5, 965, 'SS-GAVPTC p.5'), (ah25, 'C', 0.6, 965, 'SS-GAVPTC p.5'), (ah25, 'C', 0.7, 955, 'SS-GAVPTC p.5'), (ah25, 'C', 0.8, 955, 'SS-GAVPTC p.5'), (ah25, 'C', 0.9, 945, 'SS-GAVPTC p.5'),
      (ah25, 'D', 0.1, 1105, 'SS-GAVPTC p.5'), (ah25, 'D', 0.2, 1095, 'SS-GAVPTC p.5'), (ah25, 'D', 0.3, 1085, 'SS-GAVPTC p.5'), (ah25, 'D', 0.4, 1075, 'SS-GAVPTC p.5'), (ah25, 'D', 0.5, 1065, 'SS-GAVPTC p.5'), (ah25, 'D', 0.6, 1055, 'SS-GAVPTC p.5'), (ah25, 'D', 0.7, 1050, 'SS-GAVPTC p.5'), (ah25, 'D', 0.8, 1040, 'SS-GAVPTC p.5'), (ah25, 'D', 0.9, 1030, 'SS-GAVPTC p.5');
  end if;

  if not exists (select 1 from public.equipment_blower_performance where equipment_id = ah37b) then
    insert into public.equipment_blower_performance (equipment_id, speed_tap, esp_iwc, cfm, source_document) values
      (ah37b, 'A', 0.1, 615, 'SS-GAVPTC p.5'), (ah37b, 'A', 0.2, 620, 'SS-GAVPTC p.5'), (ah37b, 'A', 0.3, 610, 'SS-GAVPTC p.5'), (ah37b, 'A', 0.4, 605, 'SS-GAVPTC p.5'), (ah37b, 'A', 0.5, 610, 'SS-GAVPTC p.5'), (ah37b, 'A', 0.6, 615, 'SS-GAVPTC p.5'), (ah37b, 'A', 0.7, 615, 'SS-GAVPTC p.5'), (ah37b, 'A', 0.8, 620, 'SS-GAVPTC p.5'), (ah37b, 'A', 0.9, 625, 'SS-GAVPTC p.5'),
      (ah37b, 'B', 0.1, 790, 'SS-GAVPTC p.5'), (ah37b, 'B', 0.2, 795, 'SS-GAVPTC p.5'), (ah37b, 'B', 0.3, 795, 'SS-GAVPTC p.5'), (ah37b, 'B', 0.4, 795, 'SS-GAVPTC p.5'), (ah37b, 'B', 0.5, 795, 'SS-GAVPTC p.5'), (ah37b, 'B', 0.6, 790, 'SS-GAVPTC p.5'), (ah37b, 'B', 0.7, 800, 'SS-GAVPTC p.5'), (ah37b, 'B', 0.8, 795, 'SS-GAVPTC p.5'), (ah37b, 'B', 0.9, 785, 'SS-GAVPTC p.5'),
      (ah37b, 'C', 0.1, 925, 'SS-GAVPTC p.5'), (ah37b, 'C', 0.2, 930, 'SS-GAVPTC p.5'), (ah37b, 'C', 0.3, 930, 'SS-GAVPTC p.5'), (ah37b, 'C', 0.4, 925, 'SS-GAVPTC p.5'), (ah37b, 'C', 0.5, 925, 'SS-GAVPTC p.5'), (ah37b, 'C', 0.6, 920, 'SS-GAVPTC p.5'), (ah37b, 'C', 0.7, 915, 'SS-GAVPTC p.5'), (ah37b, 'C', 0.8, 910, 'SS-GAVPTC p.5'), (ah37b, 'C', 0.9, 905, 'SS-GAVPTC p.5'),
      (ah37b, 'D', 0.1, 1085, 'SS-GAVPTC p.5'), (ah37b, 'D', 0.2, 1085, 'SS-GAVPTC p.5'), (ah37b, 'D', 0.3, 1085, 'SS-GAVPTC p.5'), (ah37b, 'D', 0.4, 1080, 'SS-GAVPTC p.5'), (ah37b, 'D', 0.5, 1080, 'SS-GAVPTC p.5'), (ah37b, 'D', 0.6, 1075, 'SS-GAVPTC p.5'), (ah37b, 'D', 0.7, 1070, 'SS-GAVPTC p.5'), (ah37b, 'D', 0.8, 1065, 'SS-GAVPTC p.5'), (ah37b, 'D', 0.9, 1060, 'SS-GAVPTC p.5');
  end if;

  if not exists (select 1 from public.equipment_blower_performance where equipment_id = ah37c) then
    insert into public.equipment_blower_performance (equipment_id, speed_tap, esp_iwc, cfm, source_document) values
      (ah37c, 'A', 0.1, 885, 'SS-GAVPTC p.5'), (ah37c, 'A', 0.2, 880, 'SS-GAVPTC p.5'), (ah37c, 'A', 0.3, 880, 'SS-GAVPTC p.5'), (ah37c, 'A', 0.4, 860, 'SS-GAVPTC p.5'), (ah37c, 'A', 0.5, 850, 'SS-GAVPTC p.5'), (ah37c, 'A', 0.6, 840, 'SS-GAVPTC p.5'), (ah37c, 'A', 0.7, 830, 'SS-GAVPTC p.5'), (ah37c, 'A', 0.8, 820, 'SS-GAVPTC p.5'), (ah37c, 'A', 0.9, 830, 'SS-GAVPTC p.5'),
      (ah37c, 'B', 0.1, 1055, 'SS-GAVPTC p.5'), (ah37c, 'B', 0.2, 1055, 'SS-GAVPTC p.5'), (ah37c, 'B', 0.3, 1055, 'SS-GAVPTC p.5'), (ah37c, 'B', 0.4, 1040, 'SS-GAVPTC p.5'), (ah37c, 'B', 0.5, 1030, 'SS-GAVPTC p.5'), (ah37c, 'B', 0.6, 1015, 'SS-GAVPTC p.5'), (ah37c, 'B', 0.7, 1005, 'SS-GAVPTC p.5'), (ah37c, 'B', 0.8, 995, 'SS-GAVPTC p.5'), (ah37c, 'B', 0.9, 985, 'SS-GAVPTC p.5'),
      (ah37c, 'C', 0.1, 1275, 'SS-GAVPTC p.5'), (ah37c, 'C', 0.2, 1270, 'SS-GAVPTC p.5'), (ah37c, 'C', 0.3, 1265, 'SS-GAVPTC p.5'), (ah37c, 'C', 0.4, 1260, 'SS-GAVPTC p.5'), (ah37c, 'C', 0.5, 1250, 'SS-GAVPTC p.5'), (ah37c, 'C', 0.6, 1240, 'SS-GAVPTC p.5'), (ah37c, 'C', 0.7, 1230, 'SS-GAVPTC p.5'), (ah37c, 'C', 0.8, 1215, 'SS-GAVPTC p.5'), (ah37c, 'C', 0.9, 1205, 'SS-GAVPTC p.5'),
      (ah37c, 'D', 0.1, 1365, 'SS-GAVPTC p.5'), (ah37c, 'D', 0.2, 1360, 'SS-GAVPTC p.5'), (ah37c, 'D', 0.3, 1360, 'SS-GAVPTC p.5'), (ah37c, 'D', 0.4, 1330, 'SS-GAVPTC p.5'), (ah37c, 'D', 0.5, 1300, 'SS-GAVPTC p.5'), (ah37c, 'D', 0.6, 1290, 'SS-GAVPTC p.5'), (ah37c, 'D', 0.7, 1280, 'SS-GAVPTC p.5'), (ah37c, 'D', 0.8, 1270, 'SS-GAVPTC p.5'), (ah37c, 'D', 0.9, 1255, 'SS-GAVPTC p.5');
  end if;
end $$;
