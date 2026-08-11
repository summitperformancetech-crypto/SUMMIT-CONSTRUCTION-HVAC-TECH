-- PHASE 4: Manual S (equipment selection).
--
-- Non-negotiable ACCA Manual S rule this schema enforces structurally, not
-- just by convention: equipment must be selected on OEM extended
-- performance data AT ACTUAL DESIGN CONDITIONS, never on AHRI 210/240
-- single-rating-point nameplate data (80F db/67F wb indoor, 95F db outdoor
-- cooling; 70F db indoor, 47F db outdoor heating). Selecting off nameplate
-- tonnage alone is the single most common real-world HVAC sizing error.
-- equipment_catalog below stores nominal_cooling/heating_capacity_btu as
-- REFERENCE ONLY (comment says so explicitly) - there is no single
-- "select by this number" field. The only capacity data actually usable
-- for sizing lives in equipment_performance_points, a real curve across
-- outdoor temp x entering conditions that lib/manualS.ts interpolates,
-- never a lookup on one nameplate value.
create table if not exists public.equipment_catalog (
  id uuid primary key default gen_random_uuid(),
  manufacturer text not null,
  model_number text not null,
  equipment_type text not null
    check (equipment_type = any (array['split_ac', 'heat_pump', 'furnace', 'package_unit'])),
  stage_type text not null
    check (stage_type = any (array['single', 'two_stage', 'variable_speed'])),
  -- Reference only - AHRI-adjacent nominal figures for catalog browsing/
  -- display. Never read by lib/manualS.ts's selection/interpolation logic.
  nominal_cooling_capacity_btu numeric,
  nominal_heating_capacity_btu numeric,
  rated_cfm numeric,
  source_document text not null,
  created_at timestamptz not null default now()
);

alter table public.equipment_catalog enable row level security;
create policy "equipment_catalog_select" on public.equipment_catalog for select
  to authenticated using (true);

-- One row per published (mode, outdoor_temp, entering_temp[, entering
-- wetbulb]) data point from a manufacturer's engineering/product-data
-- document - the actual expanded/extended performance table, not AHRI's
-- single rating point. indoor_entering_wetbulb_f is null for heating rows
-- (heating capacity tables are keyed on outdoor temp only, at a fixed
-- indoor dry bulb - see any source_document below).
create table if not exists public.equipment_performance_points (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment_catalog(id) on delete cascade,
  mode text not null check (mode = any (array['cooling', 'heating'])),
  outdoor_temp_f numeric not null,
  indoor_entering_temp_f numeric not null,
  indoor_entering_wetbulb_f numeric,
  sensible_capacity_btu numeric not null,
  total_capacity_btu numeric not null,
  input_power_kw numeric not null
);

alter table public.equipment_performance_points enable row level security;
create policy "equipment_performance_points_select" on public.equipment_performance_points for select
  to authenticated using (true);

alter table public.projects
  add column if not exists selected_equipment_id uuid references public.equipment_catalog(id),
  add column if not exists equipment_selection_notes text;

-- Equipment catalog seed data. Every performance point below is
-- transcribed directly from a real manufacturer engineering/product-data
-- PDF (downloaded and parsed programmatically, cross-checked row-by-row
-- against the source text before insertion here) - none of it is
-- estimated, interpolated ahead of time, or invented. Per-row citations
-- are in equipment_catalog.source_document; summary:
--   - Goodman GSZ140181K (1.5 ton) and GSZ140361K (3 ton), single-stage
--     heat pumps: SS-GSZ14 Expanded Cooling Data + Expanded Heating Data,
--     https://documents.alpinehomeair.com/product/Goodman%20GSZ14%20Spec%20Sheet.pdf
--   - Carrier 24ACB724A031 (2 ton), two-stage AC, high-stage curve:
--     24ACB7-11PD.pdf, https://www.shareddocs.com/hvac/docs/1009/Public/05/24ACB7-11PD.pdf
--   - Carrier 24VNA660-30 (5 ton), variable-speed AC, maximum-demand curve:
--     24VNA6-02PD.pdf, https://www.shareddocs.com/hvac/docs/1009/Public/0F/24VNA6-02PD.pdf
-- Two brands, not the three the spec asked for as a stretch goal - a third
-- brand's public PDFs either lacked a true multi-condition expanded table
-- (only single AHRI-point data, e.g. an older Trane R-22 unit checked
-- during sourcing) or weren't worth the time tradeoff once single-stage,
-- two-stage, AND variable-speed were already covered with real data across
-- two brands. No placeholder rows were seeded - every row here is real.
-- equipment_catalog seed rows
with catalog_ids as (
  insert into public.equipment_catalog
    (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document)
  values
    ('Goodman', 'GSZ140181K', 'heat_pump', 'single', 18000, 18000, 610, 'Goodman SS-GSZ14 Expanded Cooling/Heating Data, https://documents.alpinehomeair.com/product/Goodman%20GSZ14%20Spec%20Sheet.pdf p.4 (cooling), p.28 (heating)'),
    ('Goodman', 'GSZ140361K', 'heat_pump', 'single', 36000, 36000, 1200, 'Goodman SS-GSZ14 Expanded Cooling/Heating Data, https://documents.alpinehomeair.com/product/Goodman%20GSZ14%20Spec%20Sheet.pdf p.16 (cooling), p.29 (heating)'),
    ('Carrier', '24ACB724A031', 'split_ac', 'two_stage', 25000, null, 700, 'Carrier 24ACB7 Performance 17 2-Stage Air Conditioner Product Data, https://www.shareddocs.com/hvac/docs/1009/Public/05/24ACB7-11PD.pdf, p.10 (High stage detailed cooling capacities, 700 CFM row), p.9 (AHRI rating/model)'),
    ('Carrier', '24VNA660-30', 'split_ac', 'variable_speed', 60000, null, 1500, 'Carrier 24VNA6 Product Data (Infinity variable-speed), https://www.shareddocs.com/hvac/docs/1009/Public/0F/24VNA6-02PD.pdf, p.17 (Detailed Cooling Capacities - Cooling Efficiency Mode, Maximum Demand, EDB=80F). Maximum-demand (full capacity) curve only - the source also publishes Median/Minimum demand curves for this variable-speed unit that are not loaded here.')
  returning id, model_number
)
insert into public.equipment_performance_points
  (equipment_id, mode, outdoor_temp_f, indoor_entering_temp_f, indoor_entering_wetbulb_f, sensible_capacity_btu, total_capacity_btu, input_power_kw)
select v.equipment_id, v.mode, v.outdoor_temp_f, v.indoor_entering_temp_f, v.indoor_entering_wetbulb_f, v.sensible_capacity_btu, v.total_capacity_btu, v.input_power_kw
from (values
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 65, 75, 59, 14924, 18200, 1.06),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 75, 75, 59, 18000, 18000, 1.18),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 85, 75, 59, 17500, 17500, 1.31),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 95, 75, 59, 16700, 16700, 1.45),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 105, 75, 59, 15700, 15700, 1.61),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 115, 75, 59, 14800, 14800, 1.8),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 65, 75, 63, 13616, 18400, 1.06),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 75, 75, 63, 13650, 18200, 1.18),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 85, 75, 63, 13884, 17800, 1.31),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 95, 75, 63, 13600, 17000, 1.45),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 105, 75, 63, 13120, 16000, 1.61),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 115, 75, 63, 15100, 15100, 1.8),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 65, 75, 67, 11340, 18900, 1.06),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 75, 75, 67, 11468, 18800, 1.18),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 85, 75, 67, 11712, 18300, 1.31),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 95, 75, 67, 11550, 17500, 1.45),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 105, 75, 67, 11220, 16500, 1.61),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 115, 75, 67, 11388, 15600, 1.8),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 65, 75, 71, 9108, 19800, 1.07),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 75, 75, 71, 9016, 19600, 1.19),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 85, 75, 71, 9359, 19100, 1.32),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 95, 75, 71, 9333, 18300, 1.46),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 105, 75, 71, 9169, 17300, 1.62),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'cooling', 115, 75, 71, 9512, 16400, 1.8),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 65, 70, null, 23710, 23710, 1.51),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 60, 70, null, 22110, 22110, 1.48),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 55, 70, null, 20540, 20540, 1.45),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 50, 70, null, 18990, 18990, 1.42),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 47, 70, null, 18000, 18000, 1.4),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 45, 70, null, 17250, 17250, 1.39),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 40, 70, null, 15370, 15370, 1.36),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 35, 70, null, 13650, 13650, 1.33),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 30, 70, null, 12250, 12250, 1.3),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 25, 70, null, 11210, 11210, 1.27),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 20, 70, null, 10420, 10420, 1.24),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 17, 70, null, 10000, 10000, 1.22),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 15, 70, null, 9470, 9470, 1.21),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 10, 70, null, 8130, 8130, 1.18),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 5, 70, null, 6800, 6800, 1.15),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', 0, 70, null, 5470, 5470, 1.12),
  ((select id from catalog_ids where model_number = 'GSZ140181K'), 'heating', -5, 70, null, 4130, 4130, 1.09),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 65, 75, 59, 29889, 36900, 2.18),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 75, 75, 59, 29565, 36500, 2.44),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 85, 75, 59, 35600, 35600, 2.74),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 95, 75, 59, 34000, 34000, 3.06),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 105, 75, 59, 32000, 32000, 3.42),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 115, 75, 59, 30200, 30200, 3.84),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 65, 75, 63, 27302, 37400, 2.18),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 75, 75, 63, 27380, 37000, 2.44),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 85, 75, 63, 27436, 36100, 2.74),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 95, 75, 63, 26910, 34500, 3.06),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 105, 75, 63, 26000, 32500, 3.42),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 115, 75, 63, 30700, 30700, 3.84),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 65, 75, 67, 23040, 38400, 2.17),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 75, 75, 67, 23241, 38100, 2.44),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 85, 75, 67, 23436, 37200, 2.73),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 95, 75, 67, 23140, 35600, 3.05),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 105, 75, 67, 22512, 33600, 3.41),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 115, 75, 67, 22896, 31800, 3.83),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 65, 75, 71, 18446, 40100, 2.19),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 75, 75, 71, 18659, 39700, 2.46),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 85, 75, 71, 19012, 38800, 2.75),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 95, 75, 71, 18972, 37200, 3.07),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 105, 75, 71, 18656, 35200, 3.43),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'cooling', 115, 75, 71, 19372, 33400, 3.85),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 65, 70, null, 42720, 42720, 2.81),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 60, 70, null, 39940, 39940, 2.76),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 55, 70, null, 37210, 37210, 2.71),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 50, 70, null, 34520, 34520, 2.66),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 47, 70, null, 32800, 32800, 2.63),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 45, 70, null, 31520, 31520, 2.61),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 40, 70, null, 28280, 28280, 2.56),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 35, 70, null, 25300, 25300, 2.5),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 30, 70, null, 22870, 22870, 2.45),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 25, 70, null, 21060, 21060, 2.4),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 20, 70, null, 19720, 19720, 2.35),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 17, 70, null, 19000, 19000, 2.32),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 15, 70, null, 18080, 18080, 2.3),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 10, 70, null, 15780, 15780, 2.25),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 5, 70, null, 13480, 13480, 2.2),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', 0, 70, null, 11180, 11180, 2.15),
  ((select id from catalog_ids where model_number = 'GSZ140361K'), 'heating', -5, 70, null, 8880, 8880, 2.1),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 75, 80, 57, 23590, 23590, 1.66),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 85, 80, 57, 22780, 22780, 1.81),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 95, 80, 57, 21890, 21890, 1.99),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 105, 80, 57, 20920, 20920, 2.21),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 115, 80, 57, 19890, 19890, 2.46),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 125, 80, 57, 18790, 18790, 2.75),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 75, 80, 62, 22000, 24520, 1.66),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 85, 80, 62, 21510, 23500, 1.82),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 95, 80, 62, 20980, 22380, 2.0),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 105, 80, 62, 20420, 21190, 2.21),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 115, 80, 62, 19030, 20370, 2.46),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 125, 80, 62, 18820, 18820, 2.75),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 75, 80, 67, 18580, 26950, 1.68),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 85, 80, 67, 18090, 25790, 1.83),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 95, 80, 67, 17570, 24560, 2.01),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 105, 80, 67, 17020, 23240, 2.22),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 115, 80, 67, 16450, 21840, 2.47),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 125, 80, 67, 15860, 20380, 2.76),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 75, 80, 72, 15120, 29700, 1.69),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 85, 80, 72, 14630, 28430, 1.84),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 95, 80, 72, 14120, 27080, 2.02),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 105, 80, 72, 13570, 25630, 2.23),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 115, 80, 72, 13010, 24110, 2.48),
  ((select id from catalog_ids where model_number = '24ACB724A031'), 'cooling', 125, 80, 72, 12430, 22510, 2.78),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 65, 80, 57, 53920, 53920, 2.97),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 75, 80, 57, 52190, 52190, 3.34),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 85, 80, 57, 50410, 50410, 3.76),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 95, 80, 57, 50640, 50640, 4.35),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 105, 80, 57, 49790, 49790, 5.0),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 115, 80, 57, 47430, 47430, 5.67),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 125, 80, 57, 44830, 44830, 6.26),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 65, 80, 63, 47750, 57550, 2.94),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 75, 80, 63, 46750, 55440, 3.33),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 85, 80, 63, 45710, 53190, 3.76),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 95, 80, 63, 46630, 53110, 4.35),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 105, 80, 63, 47160, 50050, 4.99),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 115, 80, 63, 47540, 47540, 5.67),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 125, 80, 63, 43530, 43530, 6.22),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 65, 80, 67, 41810, 61870, 2.93),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 75, 80, 67, 40990, 59970, 3.35),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 85, 80, 67, 39940, 57530, 3.78),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 95, 80, 67, 40640, 57500, 4.38),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 105, 80, 67, 40980, 54730, 5.02),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 115, 80, 67, 41660, 49810, 5.67),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 125, 80, 67, 39720, 44620, 6.23),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 65, 80, 72, 34430, 68280, 2.96),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 75, 80, 72, 33450, 65800, 3.35),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 85, 80, 72, 32450, 63200, 3.79),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 95, 80, 72, 32790, 63130, 4.39),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 105, 80, 72, 32780, 60220, 5.05),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 115, 80, 72, 31800, 54800, 5.71),
  ((select id from catalog_ids where model_number = '24VNA660-30'), 'cooling', 125, 80, 72, 29470, 48120, 6.23)
) as v(equipment_id, mode, outdoor_temp_f, indoor_entering_temp_f, indoor_entering_wetbulb_f, sensible_capacity_btu, total_capacity_btu, input_power_kw);