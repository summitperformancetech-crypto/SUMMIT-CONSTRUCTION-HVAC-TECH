-- Permit-Submittable Manual D Package, Section 5 sourcing follow-up -
-- real Amana air handler blower data (per direct instruction to source
-- Amana/Carrier/Daikin/Goodman/Trane blower data, following the same
-- real-OEM-document discipline already used for Goodman's AVPTC line).
--
-- Source: Amana SS-AAVPTC Specification Sheet, rev. 3/21
-- (https://cdn.daikincloud.io/PIM/Assets/Documents/SS-AAVPTC.pdf) - a
-- current, Daikin-hosted copy of Amana's own published spec sheet for its
-- Multi-Position, Variable-Speed, ECM-Based AVPTC air handler line.
--
-- Real, disclosed difference from the Goodman AVPTC data already seeded:
-- this current-generation AVPTC platform does NOT publish an open ESP-
-- swept CFM curve the way the Goodman SS-GAVPTC table does. Per the
-- document's own p.5 "Airflow Data" notes, the ECM blower is self-
-- regulating - "provides constant CFM over a wide range of static
-- pressure conditions" - targeting a fixed High/Low Stage CFM by
-- selected tonnage, with "Recommended external static pressures ... 0.1 -
-- 0.5 in. wc (0.6 in. wc and above not recommended)" (p.5, Note 3). This
-- is modeled honestly below as two points holding the SAME real published
-- CFM at the recommended range's endpoints (0.1 and 0.5 iwc) rather than
-- fabricating a swept curve this document does not contain -
-- lib/manualD.ts's interpolateBlowerCfmAtEsp already clamps to the
-- nearest endpoint outside a tap's point range, which correctly reflects
-- "holds its target CFM within the recommended window" for this design,
-- but a real TESP above 0.6 iwc for this model is a genuine out-of-
-- manufacturer-range condition the gate cannot currently flag as such
-- (a disclosed limitation, not silently treated as passing).
--
-- Models: AVPTC37B14B* and AVPTC37C14B* (p.3 Product Specifications:
-- both nominal 36,000 BTU/h cooling), commanded to the identical 3-ton
-- target airflow per p.5's combined Airflow Data table for
-- AVPTC31C14B*/35B14B*/37B14B*/37C14B* - real per that table's own
-- structure (these four models share one blower/cabinet platform,
-- differentiated by coil rather than blower), not an assumption.
insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
  ('Amana', 'AVPTC37B14B', 'air_handler', 'variable_speed', 36000, null, 1200, 'Amana SS-AAVPTC Specification Sheet (rev. 3/21), https://cdn.daikincloud.io/PIM/Assets/Documents/SS-AAVPTC.pdf, p.3 (Product Specifications) and p.5 (Airflow Data, 3-ton row)'),
  ('Amana', 'AVPTC37C14B', 'air_handler', 'variable_speed', 36000, null, 1200, 'Amana SS-AAVPTC Specification Sheet (rev. 3/21), https://cdn.daikincloud.io/PIM/Assets/Documents/SS-AAVPTC.pdf, p.3 (Product Specifications) and p.5 (Airflow Data, 3-ton row)')
on conflict do nothing;

do $$
declare
  ah37b uuid;
  ah37c uuid;
begin
  select id into ah37b from public.equipment_catalog where model_number = 'AVPTC37B14B' and manufacturer = 'Amana';
  select id into ah37c from public.equipment_catalog where model_number = 'AVPTC37C14B' and manufacturer = 'Amana';

  if not exists (select 1 from public.equipment_blower_performance where equipment_id = ah37b) then
    insert into public.equipment_blower_performance (equipment_id, speed_tap, esp_iwc, cfm, source_document) values
      (ah37b, 'High', 0.1, 1200, 'SS-AAVPTC p.5, 3-ton row, High Stage CFM - self-regulating, constant across 0.1-0.5 iwc recommended range'),
      (ah37b, 'High', 0.5, 1200, 'SS-AAVPTC p.5, 3-ton row, High Stage CFM - self-regulating, constant across 0.1-0.5 iwc recommended range'),
      (ah37b, 'Low', 0.1, 804, 'SS-AAVPTC p.5, 3-ton row, Default Low Stage CFM - self-regulating, constant across 0.1-0.5 iwc recommended range'),
      (ah37b, 'Low', 0.5, 804, 'SS-AAVPTC p.5, 3-ton row, Default Low Stage CFM - self-regulating, constant across 0.1-0.5 iwc recommended range');
  end if;

  if not exists (select 1 from public.equipment_blower_performance where equipment_id = ah37c) then
    insert into public.equipment_blower_performance (equipment_id, speed_tap, esp_iwc, cfm, source_document) values
      (ah37c, 'High', 0.1, 1200, 'SS-AAVPTC p.5, 3-ton row, High Stage CFM - self-regulating, constant across 0.1-0.5 iwc recommended range'),
      (ah37c, 'High', 0.5, 1200, 'SS-AAVPTC p.5, 3-ton row, High Stage CFM - self-regulating, constant across 0.1-0.5 iwc recommended range'),
      (ah37c, 'Low', 0.1, 804, 'SS-AAVPTC p.5, 3-ton row, Default Low Stage CFM - self-regulating, constant across 0.1-0.5 iwc recommended range'),
      (ah37c, 'Low', 0.5, 804, 'SS-AAVPTC p.5, 3-ton row, Default Low Stage CFM - self-regulating, constant across 0.1-0.5 iwc recommended range');
  end if;
end $$;
