-- Real gap found and closed: the original dehumidifier catalog migration
-- (20260827330000) sourced only each unit's DATA SHEET, which stops at
-- 0.4" w.c. for both cataloged units. Their actual INSTALLATION
-- INSTRUCTIONS (a separate document, read directly this session) each
-- publish a real, explicit maximum design external static pressure -
-- an install ceiling distinct from (and higher than) the data sheet's
-- last tested curve point - plus, for the Aprilaire E100, a 4th real
-- blower curve point at that ceiling that the data sheet omits.
--
--   - AprilAire E080/E100 Dehumidifier Installation Instructions
--     (10015109 B2209062B, (c)2021 Aprilaire), p.3 SPECIFICATIONS table:
--     footnote "*Maximum design external static pressure" against
--     0.4"w.c. for E080 and 0.6"w.c. for E100 - also gives a real 4th
--     airflow point for the E100 the data sheet never published: 175 cfm
--     @ 0.6" w.c. Repeated verbatim multiple times elsewhere in the same
--     document ("the external static pressure of the HVAC system must
--     not exceed 0.4"w.c. for the E080 and 0.6"w.c. for the E100").
--   - Santa Fe/Ultra-Aire 98H Installation Instructions (TS-893 3/13/15,
--     Therma-Stor LLC), p.10: "CAUTION! DO NOT CONNECT WITH A STATIC
--     PRESSURE GREATER THAN OR EQUAL TO +0.5 WG." - explicit, real,
--     capitalized install ceiling.
--
-- This is exactly the kind of real, sourced number this app's UI should
-- surface as guidance next to the "available static pressure" field for
-- a dehumidification system's own duct run, rather than leaving that
-- field with no basis for a tech to judge against.
alter table public.equipment_dehumidifier_specs
  add column if not exists max_design_external_static_pressure_iwc numeric;

update public.equipment_dehumidifier_specs
set max_design_external_static_pressure_iwc = 0.6
where equipment_id = (select id from public.equipment_catalog where manufacturer = 'Aprilaire' and model_number = 'E100');

update public.equipment_dehumidifier_specs
set max_design_external_static_pressure_iwc = 0.5
where equipment_id = (select id from public.equipment_catalog where manufacturer = 'Santa Fe' and model_number = 'Ultra98');

comment on column public.equipment_dehumidifier_specs.max_design_external_static_pressure_iwc is
  'Real, manufacturer-published maximum design external static pressure from the unit''s own installation instructions (a distinct, higher ceiling than the data sheet''s last tested curve point) - never exceed this when specifying a dehumidification_systems.available_static_pressure_iwc value for this equipment.';

-- Real, previously-missing 4th airflow point for the Aprilaire E100 -
-- the data sheet (used to seed 20260827330000) only published 3 points
-- (0.0/0.2/0.4"wc); the installation instructions' own SPECIFICATIONS
-- table adds a 4th real point at the unit's actual design-ESP ceiling.
insert into public.equipment_blower_performance (equipment_id, speed_tap, esp_iwc, cfm, source_document)
select id, 'single', 0.6, 175,
  'AprilAire E080/E100 Dehumidifier Installation Instructions (10015109 B2209062B, (c)2021 Aprilaire), p.3 SPECIFICATIONS table - "0.6* w.c.: 175 CFM" (E100 column), *Maximum design external static pressure.'
from public.equipment_catalog
where manufacturer = 'Aprilaire' and model_number = 'E100'
on conflict do nothing;
