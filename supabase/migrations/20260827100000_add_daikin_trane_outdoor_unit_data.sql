-- Catalog Expansion + Recommended Install Package - real performance
-- points, electrical specs, refrigerant lineset specs, and coil-matching
-- for the Daikin/Trane rows added in 20260827090000. Every value below
-- transcribed directly from the same two source documents cited there -
-- see that migration's own comment for the real, disclosed scope limits
-- (3 of 7 Daikin tonnages, zero performance points for Trane).
do $$
declare
  dz24 uuid; dz36 uuid; dz48 uuid;
  amst24 uuid; amst36 uuid; amst48 uuid;
  tr24 uuid; tr36 uuid;
begin
  select id into dz24 from public.equipment_catalog where manufacturer = 'Daikin' and model_number = 'DZ4SEA2410A';
  select id into dz36 from public.equipment_catalog where manufacturer = 'Daikin' and model_number = 'DZ4SEA3610A';
  select id into dz48 from public.equipment_catalog where manufacturer = 'Daikin' and model_number = 'DZ4SEA4810A';
  select id into amst24 from public.equipment_catalog where manufacturer = 'Daikin' and model_number = 'AMST24BU1400A';
  select id into amst36 from public.equipment_catalog where manufacturer = 'Daikin' and model_number = 'AMST36CU1400A';
  select id into amst48 from public.equipment_catalog where manufacturer = 'Daikin' and model_number = 'AMST48CU1400A';
  select id into tr24 from public.equipment_catalog where manufacturer = 'Trane' and model_number = '4TWR5024G1';
  select id into tr36 from public.equipment_catalog where manufacturer = 'Trane' and model_number = '4TWR5036G1';

  -- ===== Real cooling performance points (75F IDB, middle real airflow
  -- setting, all 4 published EWB x 6 outdoor temps = 24 pts/model) =====
  if not exists (select 1 from public.equipment_performance_points where equipment_id = dz24 and mode = 'cooling') then
    insert into public.equipment_performance_points (equipment_id, mode, outdoor_temp_f, indoor_entering_temp_f, indoor_entering_wetbulb_f, sensible_capacity_btu, total_capacity_btu, input_power_kw) values
      (dz24,'cooling',65,75,59,17708,23300,1.36),(dz24,'cooling',65,75,63,16284,23600,1.36),(dz24,'cooling',65,75,67,13608,24300,1.36),(dz24,'cooling',65,75,71,10668,25400,1.37),
      (dz24,'cooling',75,75,59,17787,23100,1.52),(dz24,'cooling',75,75,63,16380,23400,1.52),(dz24,'cooling',75,75,67,13737,24100,1.52),(dz24,'cooling',75,75,71,10836,25200,1.53),
      (dz24,'cooling',85,75,59,22500,22500,1.71),(dz24,'cooling',85,75,63,16416,22800,1.70),(dz24,'cooling',85,75,67,13865,23500,1.70),(dz24,'cooling',85,75,71,11070,24600,1.71),
      (dz24,'cooling',95,75,59,21500,21500,1.90),(dz24,'cooling',95,75,63,16132,21800,1.90),(dz24,'cooling',95,75,67,14335,22500,1.90),(dz24,'cooling',95,75,71,11045,23500,1.91),
      (dz24,'cooling',105,75,59,20200,20200,2.12),(dz24,'cooling',105,75,63,15580,20500,2.12),(dz24,'cooling',105,75,67,13356,21200,2.12),(dz24,'cooling',105,75,71,10927,22300,2.13),
      (dz24,'cooling',115,75,59,19100,19100,2.38),(dz24,'cooling',115,75,63,15714,19400,2.38),(dz24,'cooling',115,75,67,13668,20100,2.37),(dz24,'cooling',115,75,71,11394,21100,2.39);
  end if;

  if not exists (select 1 from public.equipment_performance_points where equipment_id = dz36 and mode = 'cooling') then
    insert into public.equipment_performance_points (equipment_id, mode, outdoor_temp_f, indoor_entering_temp_f, indoor_entering_wetbulb_f, sensible_capacity_btu, total_capacity_btu, input_power_kw) values
      (dz36,'cooling',65,75,59,26980,35500,2.08),(dz36,'cooling',65,75,63,24840,36000,2.07),(dz36,'cooling',65,75,67,20720,37000,2.07),(dz36,'cooling',65,75,71,16212,38600,2.09),
      (dz36,'cooling',75,75,59,27104,35200,2.32),(dz36,'cooling',75,75,63,24990,35700,2.32),(dz36,'cooling',75,75,67,20919,36700,2.32),(dz36,'cooling',75,75,71,16469,38300,2.34),
      (dz36,'cooling',85,75,59,34300,34300,2.60),(dz36,'cooling',85,75,63,24984,34700,2.59),(dz36,'cooling',85,75,67,21122,35800,2.59),(dz36,'cooling',85,75,71,16830,37400,2.61),
      (dz36,'cooling',95,75,59,32700,32700,2.89),(dz36,'cooling',95,75,63,24568,33200,2.89),(dz36,'cooling',95,75,67,20862,34200,2.89),(dz36,'cooling',95,75,71,16826,35800,2.91),
      (dz36,'cooling',105,75,59,30800,30800,3.23),(dz36,'cooling',105,75,63,23788,31300,3.22),(dz36,'cooling',105,75,67,20349,32300,3.22),(dz36,'cooling',105,75,71,16611,33900,3.24),
      (dz36,'cooling',115,75,59,29000,29000,3.61),(dz36,'cooling',115,75,63,23895,29500,3.61),(dz36,'cooling',115,75,67,20740,30500,3.61),(dz36,'cooling',115,75,71,17334,32100,3.63);
  end if;

  if not exists (select 1 from public.equipment_performance_points where equipment_id = dz48 and mode = 'cooling') then
    insert into public.equipment_performance_points (equipment_id, mode, outdoor_temp_f, indoor_entering_temp_f, indoor_entering_wetbulb_f, sensible_capacity_btu, total_capacity_btu, input_power_kw) values
      (dz48,'cooling',65,75,59,36113,46900,2.73),(dz48,'cooling',65,75,63,33320,47600,2.73),(dz48,'cooling',65,75,67,27930,49000,2.73),(dz48,'cooling',65,75,71,21973,51100,2.75),
      (dz48,'cooling',75,75,59,36270,46500,3.06),(dz48,'cooling',75,75,63,33512,47200,3.06),(dz48,'cooling',75,75,67,27645,48500,3.06),(dz48,'cooling',75,75,71,22308,50700,3.08),
      (dz48,'cooling',85,75,59,45300,45300,3.43),(dz48,'cooling',85,75,63,33580,46000,3.43),(dz48,'cooling',85,75,67,28380,47300,3.42),(dz48,'cooling',85,75,71,22770,49500,3.45),
      (dz48,'cooling',95,75,59,43200,43200,3.83),(dz48,'cooling',95,75,63,32925,43900,3.83),(dz48,'cooling',95,75,67,28086,45300,3.82),(dz48,'cooling',95,75,71,22752,47400,3.84),
      (dz48,'cooling',105,75,59,40700,40700,4.27),(dz48,'cooling',105,75,63,31801,41300,4.27),(dz48,'cooling',105,75,67,27328,42700,4.26),(dz48,'cooling',105,75,71,22400,44800,4.29),
      (dz48,'cooling',115,75,59,38400,38400,4.79),(dz48,'cooling',115,75,63,31980,39000,4.79),(dz48,'cooling',115,75,67,27876,40400,4.78),(dz48,'cooling',115,75,71,23375,42500,4.81);
  end if;

  -- ===== Real heating performance points (17 outdoor temps, fixed 70F
  -- indoor dry bulb per AHRI 210/240 heating standard; sensible=total,
  -- no latent heating load) =====
  if not exists (select 1 from public.equipment_performance_points where equipment_id = dz24 and mode = 'heating') then
    insert into public.equipment_performance_points (equipment_id, mode, outdoor_temp_f, indoor_entering_temp_f, sensible_capacity_btu, total_capacity_btu, input_power_kw) values
      (dz24,'heating',65,70,28500,28500,2.0),(dz24,'heating',60,70,26700,26700,1.9),(dz24,'heating',55,70,24900,24900,1.9),(dz24,'heating',50,70,23100,23100,1.8),
      (dz24,'heating',47,70,22000,22000,1.8),(dz24,'heating',45,70,21200,21200,1.8),(dz24,'heating',40,70,19100,19100,1.7),(dz24,'heating',35,70,17100,17100,1.7),
      (dz24,'heating',30,70,15500,15500,1.6),(dz24,'heating',25,70,14300,14300,1.6),(dz24,'heating',20,70,13500,13500,1.6),(dz24,'heating',17,70,13000,13000,1.5),
      (dz24,'heating',15,70,12400,12400,1.5),(dz24,'heating',10,70,10900,10900,1.5),(dz24,'heating',5,70,9400,9400,1.4),(dz24,'heating',0,70,7900,7900,1.4),(dz24,'heating',-5,70,6400,6400,1.3);
  end if;

  if not exists (select 1 from public.equipment_performance_points where equipment_id = dz36 and mode = 'heating') then
    insert into public.equipment_performance_points (equipment_id, mode, outdoor_temp_f, indoor_entering_temp_f, sensible_capacity_btu, total_capacity_btu, input_power_kw) values
      (dz36,'heating',65,70,43800,43800,3.1),(dz36,'heating',60,70,41100,41100,3.1),(dz36,'heating',55,70,38600,38600,3.0),(dz36,'heating',50,70,36000,36000,2.9),
      (dz36,'heating',47,70,34400,34400,2.9),(dz36,'heating',45,70,33200,33200,2.9),(dz36,'heating',40,70,30300,30300,2.8),(dz36,'heating',35,70,27500,27500,2.7),
      (dz36,'heating',30,70,25200,25200,2.6),(dz36,'heating',25,70,23500,23500,2.6),(dz36,'heating',20,70,22300,22300,2.5),(dz36,'heating',17,70,21600,21600,2.4),
      (dz36,'heating',15,70,20700,20700,2.4),(dz36,'heating',10,70,18600,18600,2.3),(dz36,'heating',5,70,16500,16500,2.3),(dz36,'heating',0,70,14300,14300,2.2),(dz36,'heating',-5,70,12200,12200,2.1);
  end if;

  if not exists (select 1 from public.equipment_performance_points where equipment_id = dz48 and mode = 'heating') then
    insert into public.equipment_performance_points (equipment_id, mode, outdoor_temp_f, indoor_entering_temp_f, sensible_capacity_btu, total_capacity_btu, input_power_kw) values
      (dz48,'heating',65,70,59100,59100,3.9),(dz48,'heating',60,70,55400,55400,3.8),(dz48,'heating',55,70,51800,51800,3.7),(dz48,'heating',50,70,48300,48300,3.7),
      (dz48,'heating',47,70,46000,46000,3.6),(dz48,'heating',45,70,44400,44400,3.6),(dz48,'heating',40,70,40200,40200,3.6),(dz48,'heating',35,70,36200,36200,3.5),
      (dz48,'heating',30,70,33000,33000,3.4),(dz48,'heating',25,70,30700,30700,3.4),(dz48,'heating',20,70,28900,28900,3.3),(dz48,'heating',17,70,28000,28000,3.3),
      (dz48,'heating',15,70,26800,26800,3.3),(dz48,'heating',10,70,23800,23800,3.2),(dz48,'heating',5,70,20800,20800,3.1),(dz48,'heating',0,70,17800,17800,3.1),(dz48,'heating',-5,70,14800,14800,3.0);
  end if;

  -- ===== Electrical specs (Gap 2) - Daikin p.3, Trane p.4 =====
  insert into public.equipment_electrical_specs (equipment_id, voltage_phase, min_circuit_ampacity, max_overcurrent_protection, min_voltage, max_voltage, source_document) values
    (dz24, '208/230/1', 15.3, 25, 197, 253, 'SS-DZ4SE p.3'),
    (dz36, '208/230/1', 21, 35, 197, 253, 'SS-DZ4SE p.3'),
    (dz48, '208/230/1', 26.2, 45, 197, 253, 'SS-DZ4SE p.3'),
    (tr24, '208/230/1/60', 11, 15, null, null, 'Trane XR15 (4TWR5) Product Data 22-1832-10, p.4'),
    (tr36, '208/230/1/60', 18, 30, null, null, 'Trane XR15 (4TWR5) Product Data 22-1832-10, p.4')
  on conflict (equipment_id) do nothing;

  -- ===== Refrigerant lineset specs (Gap 3) =====
  insert into public.refrigerant_lineset_specs (equipment_id, liquid_line_diameter_in, vapor_line_diameter_in, max_equivalent_length_ft, length_derate_notes, source_document) values
    (dz24, 0.375, 0.75, null, 'Line sizes rated for a 25ft factory line set (SS-DZ4SE p.3, footnote 1). Longer runs require Daikin''s separate Long Line Set Applications guide - not sourced this pass, max length/lift left null rather than guessed.', 'SS-DZ4SE p.3'),
    (dz36, 0.375, 0.875, null, 'Line sizes rated for a 25ft factory line set (SS-DZ4SE p.3, footnote 1). Longer runs require Daikin''s separate Long Line Set Applications guide - not sourced this pass, max length/lift left null rather than guessed.', 'SS-DZ4SE p.3'),
    (dz48, 0.375, 1.125, null, 'Line sizes rated for a 25ft factory line set (SS-DZ4SE p.3, footnote 1). Longer runs require Daikin''s separate Long Line Set Applications guide - not sourced this pass, max length/lift left null rather than guessed.', 'SS-DZ4SE p.3'),
    (tr24, 0.375, 0.625, 80, 'Standard line length 80ft, standard lift 60ft (Trane 22-1832-10 p.4, footnote 3). Greater lengths/lifts require Trane refrigerant piping software Pub# 32-3312-0, not sourced this pass.', 'Trane XR15 (4TWR5) Product Data 22-1832-10, p.4'),
    (tr36, 0.375, 0.75, 80, 'Standard line length 80ft, standard lift 60ft (Trane 22-1832-10 p.4, footnote 3). Greater lengths/lifts require Trane refrigerant piping software Pub# 32-3312-0, not sourced this pass.', 'Trane XR15 (4TWR5) Product Data 22-1832-10, p.4')
  on conflict (equipment_id) do nothing;

  -- ===== Real AHRI-implied coil matching (Gap 4) - the exact
  -- outdoor+indoor combination each Cooling Data table header names =====
  insert into public.equipment_coil_matching (outdoor_unit_id, indoor_unit_id, source_document) values
    (dz24, amst24, 'SS-DZ4SE p.6, Cooling Data header: DZ4SEA2410A*+AMST24BU1400A*'),
    (dz36, amst36, 'SS-DZ4SE p.10, Cooling Data header: DZ4SEA3610A*+AMST36CU1400A*'),
    (dz48, amst48, 'SS-DZ4SE p.14, Cooling Data header: DZ4SEA4810A*+AMST48CU1400A*')
  on conflict (outdoor_unit_id, indoor_unit_id) do nothing;
end $$;
