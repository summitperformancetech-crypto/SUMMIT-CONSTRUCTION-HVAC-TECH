-- PHASE 3: Manual D (duct sizing). Sizes ducts from Manual J room loads plus
-- a static-pressure budget, using the ACCA-equal-friction method.
--
-- projects.available_static_pressure_iwc / supply_air_temp_f: design inputs
-- a tech enters once per project. supply_air_temp_f, combined with a room's
-- own indoor design cooling temp (already on the project), gives the
-- supply-to-room delta-T used to convert a room's sensible load into a
-- required CFM (see lib/manualD.ts).
--
-- rooms.required_cfm: NOT a Postgres generated column - it depends on the
-- full Manual J calc chain (room sensible load, which itself depends on
-- envelope/zone data joined in application code), not columns available to
-- a DB-level expression. Computed in lib/manualD.ts and written back the
-- same way duct_location/duct_insulation_r_value already are.
alter table public.projects
  add column if not exists available_static_pressure_iwc numeric,
  add column if not exists supply_air_temp_f numeric;

alter table public.rooms
  add column if not exists required_cfm numeric;

-- One row per duct run (trunk or branch). room_id is null for a trunk run
-- (it doesn't terminate at one room); a branch run's room_id is the room it
-- feeds. zone_id groups runs the same way rooms are already grouped by zone
-- for Manual J - a duct system is designed per air handler/zone, not
-- per-house, once zones exist.
create table if not exists public.duct_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete set null,
  run_type text not null check (run_type = any (array['trunk', 'branch'])),
  room_id uuid references public.rooms(id) on delete set null,
  length_ft numeric not null default 0,
  fitting_equivalent_length_ft numeric not null default 0,
  cfm numeric not null,
  friction_rate numeric not null,
  duct_shape text not null check (duct_shape = any (array['round', 'rectangular'])),
  calculated_diameter_in numeric,
  calculated_width_in numeric,
  calculated_height_in numeric,
  velocity_fpm numeric not null,
  material text not null check (material = any (array['flex', 'sheet_metal', 'fiberboard'])),
  created_at timestamptz not null default now()
);

alter table public.duct_runs enable row level security;

create policy "duct_runs_select" on public.duct_runs for select
  to authenticated using (true);
create policy "duct_runs_insert" on public.duct_runs for insert
  to authenticated with check (true);
create policy "duct_runs_update" on public.duct_runs for update
  to authenticated using (true);
create policy "duct_runs_delete" on public.duct_runs for delete
  to authenticated using (true);

-- Round-duct equal-friction reference data (ACCA Manual D's Table 5 is
-- built on this same relationship). ACCA's own published table is a
-- proprietary chart this app has no license to reproduce verbatim, so
-- rather than fabricate numbers or guess-digitize a chart image, these
-- rows are computed from the standard ASHRAE Fundamentals round-duct
-- friction correlation for galvanized steel duct carrying standard air
-- (0.075 lb/ft3):
--
--   friction_rate (in.wc/100ft) = 0.109136 * cfm^1.9 / diameter_in^5.02
--
-- This is the documented equal-friction relationship ACCA Manual D /
-- ASHRAE ductulator tables are themselves generated from (see e.g.
-- https://www.engineersedge.com and multiple ductulator-calculator
-- vendors that cite the same constant). It was independently
-- cross-checked against four worked (cfm, diameter, friction) examples
-- published in CED Engineering's PE-continuing-education course
-- "HVAC - How to Size and Design Ducts" (M06-048,
-- https://www.cedengineering.com/userfiles/M06-048%20-%20HVAC%20-%20How%20to%20Size%20and%20Design%20Ducts%20-%20US.pdf,
-- pages 24 and 28): (400cfm,10in,0.09), (600cfm,10in,0.20),
-- (1000cfm,14in,~0.09), (20000cfm,34in,0.30) - the formula's predicted
-- friction rate at each point was within the source's own rounding
-- ("approximately") in every case. velocity_fpm = cfm / duct
-- cross-sectional area, a direct physical relation, not a fitted value.
--
-- Rectangular-equivalent sizing (Manual D's Table 7) is deliberately NOT
-- a static table here - a rectangular run's dimensions are a 2D choice
-- constrained by real framing (an installer picks a height that fits the
-- joist/soffit cavity, then needs the matching width), which a fixed
-- table of arbitrary aspect ratios can't usefully serve. Instead
-- lib/manualD.ts computes it on demand from the same round-duct result
-- via the Huebscher equivalent-diameter equation (De = 1.30 *
-- (a*b)^0.625 / (a+b)^0.25 - Huebscher 1948, the ASHRAE-standard
-- rectangular/round equivalence used by every duct sizing tool,
-- cross-checked here against a second worked example in the same CED
-- source: a 16x51in rectangular duct given as equivalent to a 30in round
-- duct - the formula reproduces 30.0in from those inputs exactly).
create table if not exists public.duct_sizing_tables (
  id uuid primary key default gen_random_uuid(),
  duct_type text not null check (duct_type = any (array['round'])),
  friction_rate numeric not null,
  diameter_in numeric not null,
  cfm numeric not null,
  velocity_fpm numeric not null,
  source text not null default 'ASHRAE Fundamentals round-duct friction correlation (0.109136*cfm^1.9/d^5.02), cross-checked against CED Engineering M06-048 worked examples - see migration comment'
);

alter table public.duct_sizing_tables enable row level security;
create policy "duct_sizing_tables_select" on public.duct_sizing_tables for select
  to authenticated using (true);

insert into public.duct_sizing_tables (duct_type, friction_rate, diameter_in, cfm, velocity_fpm) values
    ('round', 0.05, 4, 25.8, 296),
    ('round', 0.05, 5, 46.6, 342),
    ('round', 0.05, 6, 75.4, 384),
    ('round', 0.05, 7, 113.3, 424),
    ('round', 0.05, 8, 161.3, 462),
    ('round', 0.05, 9, 220.2, 498),
    ('round', 0.05, 10, 290.9, 533),
    ('round', 0.05, 12, 470.9, 600),
    ('round', 0.05, 14, 707.6, 662),
    ('round', 0.05, 16, 1006.9, 721),
    ('round', 0.05, 18, 1374.5, 778),
    ('round', 0.05, 20, 1815.7, 832),
    ('round', 0.05, 22, 2335.6, 885),
    ('round', 0.05, 24, 2939.3, 936),
    ('round', 0.05, 26, 3631.5, 985),
    ('round', 0.05, 28, 4417.0, 1033),
    ('round', 0.05, 30, 5300.2, 1080),
    ('round', 0.05, 32, 6285.6, 1125),
    ('round', 0.05, 34, 7377.5, 1170),
    ('round', 0.05, 36, 8580.2, 1214),
    ('round', 0.08, 4, 33.1, 379),
    ('round', 0.08, 5, 59.7, 438),
    ('round', 0.08, 6, 96.6, 492),
    ('round', 0.08, 7, 145.2, 543),
    ('round', 0.08, 8, 206.6, 592),
    ('round', 0.08, 9, 282.0, 638),
    ('round', 0.08, 10, 372.5, 683),
    ('round', 0.08, 12, 603.0, 768),
    ('round', 0.08, 14, 906.2, 848),
    ('round', 0.08, 16, 1289.5, 924),
    ('round', 0.08, 18, 1760.2, 996),
    ('round', 0.08, 20, 2325.3, 1066),
    ('round', 0.08, 22, 2991.1, 1133),
    ('round', 0.08, 24, 3764.2, 1198),
    ('round', 0.08, 26, 4650.7, 1261),
    ('round', 0.08, 28, 5656.6, 1323),
    ('round', 0.08, 30, 6787.7, 1383),
    ('round', 0.08, 32, 8049.6, 1441),
    ('round', 0.08, 34, 9448.0, 1498),
    ('round', 0.08, 36, 10988.2, 1555),
    ('round', 0.1, 4, 37.2, 426),
    ('round', 0.1, 5, 67.1, 492),
    ('round', 0.1, 6, 108.6, 553),
    ('round', 0.1, 7, 163.3, 611),
    ('round', 0.1, 8, 232.3, 666),
    ('round', 0.1, 9, 317.1, 718),
    ('round', 0.1, 10, 418.9, 768),
    ('round', 0.1, 12, 678.2, 863),
    ('round', 0.1, 14, 1019.1, 953),
    ('round', 0.1, 16, 1450.2, 1039),
    ('round', 0.1, 18, 1979.6, 1120),
    ('round', 0.1, 20, 2615.0, 1199),
    ('round', 0.1, 22, 3363.9, 1274),
    ('round', 0.1, 24, 4233.3, 1348),
    ('round', 0.1, 26, 5230.3, 1419),
    ('round', 0.1, 28, 6361.5, 1488),
    ('round', 0.1, 30, 7633.6, 1555),
    ('round', 0.1, 32, 9052.8, 1621),
    ('round', 0.1, 34, 10625.4, 1685),
    ('round', 0.1, 36, 12357.5, 1748),
    ('round', 0.12, 4, 41.0, 469),
    ('round', 0.12, 5, 73.9, 542),
    ('round', 0.12, 6, 119.6, 609),
    ('round', 0.12, 7, 179.7, 672),
    ('round', 0.12, 8, 255.7, 733),
    ('round', 0.12, 9, 349.1, 790),
    ('round', 0.12, 10, 461.1, 845),
    ('round', 0.12, 12, 746.5, 950),
    ('round', 0.12, 14, 1121.7, 1049),
    ('round', 0.12, 16, 1596.3, 1143),
    ('round', 0.12, 18, 2179.0, 1233),
    ('round', 0.12, 20, 2878.4, 1319),
    ('round', 0.12, 22, 3702.7, 1403),
    ('round', 0.12, 24, 4659.7, 1483),
    ('round', 0.12, 26, 5757.0, 1561),
    ('round', 0.12, 28, 7002.2, 1638),
    ('round', 0.12, 30, 8402.4, 1712),
    ('round', 0.12, 32, 9964.5, 1784),
    ('round', 0.12, 34, 11695.5, 1855),
    ('round', 0.12, 36, 13602.1, 1924),
    ('round', 0.15, 4, 46.1, 528),
    ('round', 0.15, 5, 83.1, 609),
    ('round', 0.15, 6, 134.5, 685),
    ('round', 0.15, 7, 202.1, 756),
    ('round', 0.15, 8, 287.6, 824),
    ('round', 0.15, 9, 392.6, 889),
    ('round', 0.15, 10, 518.6, 951),
    ('round', 0.15, 12, 839.5, 1069),
    ('round', 0.15, 14, 1261.5, 1180),
    ('round', 0.15, 16, 1795.2, 1286),
    ('round', 0.15, 18, 2450.5, 1387),
    ('round', 0.15, 20, 3237.1, 1484),
    ('round', 0.15, 22, 4164.1, 1577),
    ('round', 0.15, 24, 5240.3, 1668),
    ('round', 0.15, 26, 6474.5, 1756),
    ('round', 0.15, 28, 7874.8, 1842),
    ('round', 0.15, 30, 9449.4, 1925),
    ('round', 0.15, 32, 11206.3, 2006),
    ('round', 0.15, 34, 13153.0, 2086),
    ('round', 0.15, 36, 15297.2, 2164)
on conflict do nothing;
