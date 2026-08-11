-- PHASE 5: Commercial module (Manual N / ASHRAE block load), block-load
-- mode as the default with an 8760-hour simulation upgrade path (Phase
-- 5.4/5.5, separate migrations/files).
--
-- Extends the existing zones table with nullable commercial-specific
-- columns rather than a parallel commercial_zones table - residential
-- already has the zone architecture built (zones -> rooms, one AHU per
-- zone), and a commercial project's "zone" is the same real-world concept
-- (one AHU/system serving one area), just with different internal-gain
-- and envelope inputs. All new columns are nullable/no-op for residential
-- projects.
alter table public.zones
  add column if not exists occupancy_type text,
  add column if not exists occupant_density_per_1000sqft numeric,
  add column if not exists lighting_load_w_per_sqft numeric,
  add column if not exists equipment_load_w_per_sqft numeric,
  add column if not exists wall_construction_type text,
  add column if not exists roof_construction_type text,
  add column if not exists floor_area_sqft numeric,
  add column if not exists ceiling_height_ft numeric;

-- Reference table: real ASHRAE 62.1-2007 Table 6-1 (ventilation rate
-- procedure) occupant density + ventilation defaults, and ASHRAE
-- 90.1-2007 Table 9.6.1 (SI edition) lighting power density converted
-- W/m^2 -> W/ft^2 (factor 0.09290). Equipment/plug load density has no
-- single codified ASHRAE table the way lighting does - default_equipment_w_sqft
-- is a representative value drawn from the cited real range in NREL/PNNL
-- commercial building prototype documentation (0.10-0.75 W/ft^2 across
-- building types) rather than a precise per-category standard figure;
-- flagged per-row below, not silently presented as equally precise.
--
-- Sources:
--   ASHRAE 62.1-2007 Table 6-1: occupant density (#/1000ft2), Rp (people
--     outdoor air rate, cfm/person), Ra (area outdoor air rate, cfm/ft2).
--   ASHRAE 90.1-2007 Table 9.6.1 (SI): lighting power density, W/m2,
--     converted here to W/ft2 (this is an older edition than the current
--     2019/2022 standard - LPDs have generally decreased since 2007 as
--     LED lighting became standard, so these read as slightly
--     conservative/high vs. current code-minimum design; flagged so a
--     future session can update to a newer edition's US-unit table).
--   Equipment/plug load: NREL "Plug and Process Loads Capacity and Power
--     Requirements Analysis" (docs.nrel.gov/docs/fy14osti/60266.pdf) and
--     PNNL commercial building prototype documentation, representative
--     values within their cited 0.10-0.75 W/ft2 range.
create table if not exists public.commercial_occupancy_defaults (
  occupancy_type text primary key,
  default_occupant_density_per_1000sqft numeric,
  default_ventilation_rp_cfm_per_person numeric,
  default_ventilation_ra_cfm_per_sqft numeric not null,
  default_lighting_w_per_sqft numeric not null,
  default_equipment_w_per_sqft numeric not null,
  source_document text not null
);

alter table public.commercial_occupancy_defaults enable row level security;
create policy "commercial_occupancy_defaults_select" on public.commercial_occupancy_defaults
  for select to authenticated using (true);

insert into public.commercial_occupancy_defaults
  (occupancy_type, default_occupant_density_per_1000sqft, default_ventilation_rp_cfm_per_person, default_ventilation_ra_cfm_per_sqft, default_lighting_w_per_sqft, default_equipment_w_per_sqft, source_document)
values
  ('Office', 5, 5, 0.06, 1.11, 1.00,
   'ASHRAE 62.1-2007 Table 6-1 (Office space) + ASHRAE 90.1-2007 Table 9.6.1 SI (Office-Enclosed/Open Plan, 12 W/m2 -> 1.11 W/ft2); equipment load per NREL fy14osti/60266 typical office range'),
  ('Retail', 15, 7.5, 0.12, 1.67, 0.75,
   'ASHRAE 62.1-2007 Table 6-1 (Retail Sales, except mall common areas) + ASHRAE 90.1-2007 Table 9.6.1 SI (Retail Sales Area, 18 W/m2 -> 1.67 W/ft2); equipment load representative of PNNL prototype retail range'),
  ('Restaurant', 70, 7.5, 0.18, 0.93, 0.75,
   'ASHRAE 62.1-2007 Table 6-1 (Restaurant dining rooms) + ASHRAE 90.1-2007 Table 9.6.1 SI (general Dining Area, 10 W/m2 -> 0.93 W/ft2 - the table also lists a higher 23 W/m2 "Family Dining" subcategory not used here); equipment load excludes kitchen (dining room only) - a real kitchen exhaust/makeup-air load is a separate process_loads-style entry, not a per-sqft default'),
  ('Classroom', 35, 10, 0.12, 1.39, 0.50,
   'ASHRAE 62.1-2007 Table 6-1 (Classrooms, age 9 plus) + ASHRAE 90.1-2007 Table 9.6.1 SI (Classroom/Lecture/Training, 15 W/m2 -> 1.39 W/ft2); equipment load representative of typical classroom AV/computing'),
  ('Warehouse', null, null, 0.06, 0.93, 0.25,
   'ASHRAE 62.1-2007 Table 6-1 (Warehouses) - occupant density and Rp are marked "variable, determine per actual occupancy" (note B) in the source table, not a fixed default, so left null here rather than guessed; Ra is a fixed default per the same table. Lighting per ASHRAE 90.1-2007 Table 9.6.1 SI (Warehouse Medium/Bulky Material Storage, 10 W/m2 -> 0.93 W/ft2). Equipment load at the low end of the PNNL prototype range'),
  ('Assembly', 100, 7.5, 0.06, 1.30, 0.25,
   'ASHRAE 62.1-2007 Table 6-1 (Multi-use assembly) + ASHRAE 90.1-2007 Table 9.6.1 SI lighting figure reused from Lobby (14 W/m2 -> 1.30 W/ft2) - no distinct "assembly" LPD row exists in that table, flagged as a substitution rather than a direct lookup'),
  ('Lobby', 10, 5, 0.06, 1.30, 0.25,
   'ASHRAE 62.1-2007 Table 6-1 (Main entry lobbies) + ASHRAE 90.1-2007 Table 9.6.1 SI (Lobby, 14 W/m2 -> 1.30 W/ft2)')
on conflict (occupancy_type) do nothing;
