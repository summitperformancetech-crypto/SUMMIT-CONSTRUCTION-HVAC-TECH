-- Catalog Expansion + Recommended Install Package, Gap 04 - real filter
-- spec and real electric heat-kit options for the 9 air handlers that
-- were missing this data (Carrier FB4CNF036 already had it, backfilled
-- in 20260827130000). Same sourcing discipline: only the manufacturer's
-- own published numbers, cited per row with page references. Where a
-- real source document doesn't unambiguously cover a specific model or
-- field, that field is left null rather than inferred/guessed.
--
-- Amana AVPTC37B14B/37C14B: Amana SS-AAVPTC (3/21, supersedes 1/21),
--   www.amana-hac.com. Heat kit model/kW from p.8 (Heat Kit Data, "AVPTC
--   37B14B*"/"AVPTC37C14B*" sections). Minimum airflow from p.14
--   (Electric Heat Airflow Table): AVPTC37B14B* is left null because
--   that table's column headers for the B-cabinet group are duplicated/
--   ambiguous in Amana's own printed document (the "AVPTC29B14" column
--   label is repeated three times across the wrapped header with no way
--   to disambiguate which repeat, if any, is meant to also cover
--   37B14B) - a real document defect, not a data gap we can fill by
--   inference. AVPTC37C14B* uses the real, unambiguous
--   "AVPTC37C14/AVPTC39C14" column.
--
-- Daikin DV37PTCC14A: Daikin SS-DVPTC (05/22, supersedes 03/21),
--   www.daikincomfort.com. Heat kit model/kW from p.11 (Heat Kit Data,
--   "DV37PTCC14A" section - printed as "DV37PTCC14AC" where the
--   trailing C is a footnote-reference glyph, not part of the model
--   number; confirmed against p.3's Product Specifications "DV37
--   PTCC14A*" naming). Minimum airflow from p.7 (Dipswitch Settings &
--   Electric Heat Airflow), real unambiguous "DV37 PTCC14" column.
--
-- Goodman AVPTC25B14B/35B14B/37B14B/37C14B/37D14B: Goodman SS-GAVPTC
--   (3/19, supersedes 1/19), www.goodmanmfg.com. Heat kit model/kW from
--   pp.8,10,11 (Heat Kit Data). AVPTC35B14B* has no heat-kit-model
--   section in Goodman's own document at all (the section skips from
--   "AVPTC33C14B*" straight to "AVPTC35C14B*" on p.9 - a real gap in
--   Goodman's own literature for this specific B-chassis model) so its
--   rows are inserted with heat_kit_model left null; its real kW/airflow
--   pairing is still sourced from p.7's unambiguous "AVPTC35B14" column,
--   which does exist. Minimum airflow for the other 4 models from p.7
--   (Electric Heat Airflow & Dipswitch Settings), each with its own
--   explicit, unambiguous column. Filter chassis/part/size from p.18
--   (Accessories, Filters table); filter_furnished is a real inference
--   from the document's own structure (filters are listed only under
--   "Accessories", i.e. not standard equipment), not an explicit
--   furnished/not-furnished sentence - disclosed as such per row.
--   Filter thickness (1in) is not stated in Goodman's own Accessories
--   table; it is filled in only because Daikin's SS-DVPTC states "1""
--   for the identical part numbers (ALFH16201E/ALFH1912201E/
--   ALFH20231E - same physical OEM part, confirmed by exact part-number
--   match, not inferred from platform/tonnage resemblance).
--
-- Trane AM7A0C36H31SA: Trane/American Standard "Hyperion - Field
--   Reference Data - TAM7" (ManualsLib doc id 1663128, p.2 Product
--   Specifications and p.16 Heater Attribute Data), which explicitly
--   covers "*AM7A0C36H31SA" (cross-checked against the closely related
--   spec sheet 22-1847-06 for the "H31SC" revision, which independently
--   published the identical filter size/refrigerant/dimension/weight
--   numbers - strong real-world confirmation these are the same
--   physical cabinet across running-change suffixes). Heat kit kW/model
--   from the 240V column of p.16's Heater Attribute Data table (BAYEV
--   series - a different OEM heater-kit family than the HKS-series
--   used by the Amana/Daikin/Goodman shared platform). Trane's Field
--   Reference Data document does not publish a minimum-heating-airflow-
--   per-heat-kit table the way the HKS-platform manufacturers do, so
--   minimum_airflow_cfm is left null for every Trane row - a genuine
--   sourcing gap, not an oversight.
do $$
declare
  amana_37b uuid;
  amana_37c uuid;
  daikin_37c uuid;
  goodman_25b uuid;
  goodman_35b uuid;
  goodman_37b uuid;
  goodman_37c uuid;
  goodman_37d uuid;
  trane_36 uuid;
begin
  select id into amana_37b from public.equipment_catalog where manufacturer = 'Amana' and model_number = 'AVPTC37B14B';
  select id into amana_37c from public.equipment_catalog where manufacturer = 'Amana' and model_number = 'AVPTC37C14B';
  select id into daikin_37c from public.equipment_catalog where manufacturer = 'Daikin' and model_number = 'DV37PTCC14A';
  select id into goodman_25b from public.equipment_catalog where manufacturer = 'Goodman' and model_number = 'AVPTC25B14B';
  select id into goodman_35b from public.equipment_catalog where manufacturer = 'Goodman' and model_number = 'AVPTC35B14B';
  select id into goodman_37b from public.equipment_catalog where manufacturer = 'Goodman' and model_number = 'AVPTC37B14B';
  select id into goodman_37c from public.equipment_catalog where manufacturer = 'Goodman' and model_number = 'AVPTC37C14B';
  select id into goodman_37d from public.equipment_catalog where manufacturer = 'Goodman' and model_number = 'AVPTC37D14B';
  select id into trane_36 from public.equipment_catalog where manufacturer = 'Trane' and model_number = 'AM7A0C36H31SA';

  -- ===== Amana AVPTC37B14B =====
  insert into public.equipment_filter_specs (equipment_id, filter_furnished, filter_type, filter_size, filter_thickness_in, source_document) values
    (amana_37b, false, 'Throwaway', '22 X 20', 1, 'Amana SS-AAVPTC (3/21), p.3 Product Specifications, AVPTC37B14B* column (FILTER row)')
  on conflict (equipment_id) do nothing;

  insert into public.equipment_heat_kit_compatibility (equipment_id, heat_kit_kw, heat_kit_model, minimum_airflow_cfm, source_document) values
    (amana_37b, 4.80, 'HKSX05XC', null, 'Amana SS-AAVPTC (3/21), p.8 Heat Kit Data (AVPTC37B14B* section); minimum_airflow_cfm not sourced - p.14 Electric Heat Airflow Table column headers for this cabinet group are duplicated/ambiguous in the source document'),
    (amana_37b, 6.00, 'HKSX06XC', null, 'Amana SS-AAVPTC (3/21), p.8 Heat Kit Data (AVPTC37B14B* section); minimum_airflow_cfm not sourced - see note above'),
    (amana_37b, 8.00, 'HKSX08XC', null, 'Amana SS-AAVPTC (3/21), p.8 Heat Kit Data (AVPTC37B14B* section); minimum_airflow_cfm not sourced - see note above'),
    (amana_37b, 9.60, 'HKSX10XC', null, 'Amana SS-AAVPTC (3/21), p.8 Heat Kit Data (AVPTC37B14B* section); minimum_airflow_cfm not sourced - see note above'),
    (amana_37b, 14.40, 'HKSC15XA', null, 'Amana SS-AAVPTC (3/21), p.8 Heat Kit Data (AVPTC37B14B* section); minimum_airflow_cfm not sourced - see note above');

  -- ===== Amana AVPTC37C14B =====
  insert into public.equipment_filter_specs (equipment_id, filter_furnished, filter_type, filter_size, filter_thickness_in, source_document) values
    (amana_37c, false, 'Throwaway', '22 X 20', 1, 'Amana SS-AAVPTC (3/21), p.3 Product Specifications, AVPTC37C14B* column (FILTER row)')
  on conflict (equipment_id) do nothing;

  insert into public.equipment_heat_kit_compatibility (equipment_id, heat_kit_kw, heat_kit_model, minimum_airflow_cfm, source_document) values
    (amana_37c, 4.80, 'HKSX05XC', 700, 'Amana SS-AAVPTC (3/21), p.8-9 Heat Kit Data (AVPTC37C14B* section) + p.14 Electric Heat Airflow Table, AVPTC37C14/AVPTC39C14 column'),
    (amana_37c, 6.00, 'HKSX06XC', 770, 'Amana SS-AAVPTC (3/21), p.8-9 Heat Kit Data (AVPTC37C14B* section) + p.14 Electric Heat Airflow Table, AVPTC37C14/AVPTC39C14 column'),
    (amana_37c, 8.00, 'HKSX08XC', 880, 'Amana SS-AAVPTC (3/21), p.8-9 Heat Kit Data (AVPTC37C14B* section) + p.14 Electric Heat Airflow Table, AVPTC37C14/AVPTC39C14 column'),
    (amana_37c, 9.60, 'HKSX10XC', 970, 'Amana SS-AAVPTC (3/21), p.8-9 Heat Kit Data (AVPTC37C14B* section) + p.14 Electric Heat Airflow Table, AVPTC37C14/AVPTC39C14 column'),
    (amana_37c, 14.40, 'HKSC15XA', 1090, 'Amana SS-AAVPTC (3/21), p.8-9 Heat Kit Data (AVPTC37C14B* section) + p.14 Electric Heat Airflow Table, AVPTC37C14/AVPTC39C14 column'),
    (amana_37c, 19.20, 'HKSC19CA', 1280, 'Amana SS-AAVPTC (3/21), p.8-9 Heat Kit Data (AVPTC37C14B* section) + p.14 Electric Heat Airflow Table, AVPTC37C14/AVPTC39C14 column');

  -- ===== Daikin DV37PTCC14A =====
  insert into public.equipment_filter_specs (equipment_id, filter_furnished, filter_type, filter_size, filter_thickness_in, source_document) values
    (daikin_37c, false, 'Permanent', '19.5 X 20 (ALFH1912201E, C chassis)', 1, 'Daikin SS-DVPTC (05/22), p.18 Accessories, "Permanent 1" Filters" table, Chassis C row')
  on conflict (equipment_id) do nothing;

  insert into public.equipment_heat_kit_compatibility (equipment_id, heat_kit_kw, heat_kit_model, minimum_airflow_cfm, source_document) values
    (daikin_37c, 4.80, 'HKSX05XC', 850, 'Daikin SS-DVPTC (05/22), p.11 Heat Kit Data (DV37PTCC14A section) + p.7 Dipswitch Settings & Electric Heat Airflow, DV37 PTCC14 column'),
    (daikin_37c, 6.00, 'HKSX06XC', 900, 'Daikin SS-DVPTC (05/22), p.11 Heat Kit Data (DV37PTCC14A section) + p.7 Dipswitch Settings & Electric Heat Airflow, DV37 PTCC14 column'),
    (daikin_37c, 8.00, 'HKSX08XC', 1000, 'Daikin SS-DVPTC (05/22), p.11 Heat Kit Data (DV37PTCC14A section) + p.7 Dipswitch Settings & Electric Heat Airflow, DV37 PTCC14 column'),
    (daikin_37c, 9.60, 'HKSX10XC', 1170, 'Daikin SS-DVPTC (05/22), p.11 Heat Kit Data (DV37PTCC14A section) + p.7 Dipswitch Settings & Electric Heat Airflow, DV37 PTCC14 column'),
    (daikin_37c, 14.40, 'HKSC15XA', 1345, 'Daikin SS-DVPTC (05/22), p.11 Heat Kit Data (DV37PTCC14A section) + p.7 Dipswitch Settings & Electric Heat Airflow, DV37 PTCC14 column'),
    (daikin_37c, 19.20, 'HKSC19CA', 1345, 'Daikin SS-DVPTC (05/22), p.11 Heat Kit Data (DV37PTCC14A section) + p.7 Dipswitch Settings & Electric Heat Airflow, DV37 PTCC14 column');

  -- ===== Goodman AVPTC25B14B =====
  insert into public.equipment_filter_specs (equipment_id, filter_furnished, filter_type, filter_size, filter_thickness_in, source_document) values
    (goodman_25b, false, 'Throwaway', '16.0 X 20.0 (ALFH16201E, B chassis)', 1, 'Goodman SS-GAVPTC (3/19), p.18 Accessories/Filters table, Chassis B row (filter_furnished inferred from placement under Accessories, not an explicit statement; thickness confirmed via Daikin SS-DVPTC p.18, identical part number ALFH16201E)')
  on conflict (equipment_id) do nothing;

  insert into public.equipment_heat_kit_compatibility (equipment_id, heat_kit_kw, heat_kit_model, minimum_airflow_cfm, source_document) values
    (goodman_25b, 4.50, 'HKSX05XC', 650, 'Goodman SS-GAVPTC (3/19), p.8 Heat Kit Data (AVPTC25B14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC25B14 column'),
    (goodman_25b, 6.00, 'HKSX06XC', 700, 'Goodman SS-GAVPTC (3/19), p.8 Heat Kit Data (AVPTC25B14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC25B14 column'),
    (goodman_25b, 8.00, 'HKSX08XC', 800, 'Goodman SS-GAVPTC (3/19), p.8 Heat Kit Data (AVPTC25B14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC25B14 column'),
    (goodman_25b, 9.60, 'HKSX10XC', 850, 'Goodman SS-GAVPTC (3/19), p.8 Heat Kit Data (AVPTC25B14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC25B14 column'),
    (goodman_25b, 14.40, 'HKSC15XA', 875, 'Goodman SS-GAVPTC (3/19), p.8 Heat Kit Data (AVPTC25B14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC25B14 column');

  -- ===== Goodman AVPTC35B14B =====
  -- No heat-kit-model section for this exact model in Goodman's own
  -- Heat Kit Data pages (skips AVPTC33C14B* -> AVPTC35C14B*), so
  -- heat_kit_model is left null; kW/airflow pairing is still real,
  -- from the Electric Heat Airflow table's own unambiguous AVPTC35B14
  -- column.
  insert into public.equipment_filter_specs (equipment_id, filter_furnished, filter_type, filter_size, filter_thickness_in, source_document) values
    (goodman_35b, false, 'Throwaway', '16.0 X 20.0 (ALFH16201E, B chassis)', 1, 'Goodman SS-GAVPTC (3/19), p.18 Accessories/Filters table, Chassis B row (filter_furnished inferred from placement under Accessories, not an explicit statement; thickness confirmed via Daikin SS-DVPTC p.18, identical part number ALFH16201E)')
  on conflict (equipment_id) do nothing;

  insert into public.equipment_heat_kit_compatibility (equipment_id, heat_kit_kw, heat_kit_model, minimum_airflow_cfm, source_document) values
    (goodman_35b, 3.00, null, 550, 'Goodman SS-GAVPTC (3/19), p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC35B14 column; heat_kit_model not sourced - Goodman''s own Heat Kit Data section (pp.8-15) has no row for AVPTC35B14B*, only for the adjacent AVPTC33C14B*/AVPTC35C14B*'),
    (goodman_35b, 4.50, null, 660, 'Goodman SS-GAVPTC (3/19), p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC35B14 column; heat_kit_model not sourced - see note above'),
    (goodman_35b, 6.00, null, 700, 'Goodman SS-GAVPTC (3/19), p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC35B14 column; heat_kit_model not sourced - see note above'),
    (goodman_35b, 8.00, null, 800, 'Goodman SS-GAVPTC (3/19), p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC35B14 column; heat_kit_model not sourced - see note above'),
    (goodman_35b, 9.60, null, 875, 'Goodman SS-GAVPTC (3/19), p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC35B14 column; heat_kit_model not sourced - see note above'),
    (goodman_35b, 14.40, null, 875, 'Goodman SS-GAVPTC (3/19), p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC35B14 column; heat_kit_model not sourced - see note above');

  -- ===== Goodman AVPTC37B14B =====
  insert into public.equipment_filter_specs (equipment_id, filter_furnished, filter_type, filter_size, filter_thickness_in, source_document) values
    (goodman_37b, false, 'Throwaway', '16.0 X 20.0 (ALFH16201E, B chassis)', 1, 'Goodman SS-GAVPTC (3/19), p.18 Accessories/Filters table, Chassis B row (filter_furnished inferred from placement under Accessories, not an explicit statement; thickness confirmed via Daikin SS-DVPTC p.18, identical part number ALFH16201E)')
  on conflict (equipment_id) do nothing;

  insert into public.equipment_heat_kit_compatibility (equipment_id, heat_kit_kw, heat_kit_model, minimum_airflow_cfm, source_document) values
    (goodman_37b, 3.00, 'HKSX03XC', 550, 'Goodman SS-GAVPTC (3/19), p.10 Heat Kit Data (AVPTC37B14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37B14 column'),
    (goodman_37b, 4.50, 'HKSX05XC', 650, 'Goodman SS-GAVPTC (3/19), p.10 Heat Kit Data (AVPTC37B14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37B14 column'),
    (goodman_37b, 6.00, 'HKSX06XC', 700, 'Goodman SS-GAVPTC (3/19), p.10 Heat Kit Data (AVPTC37B14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37B14 column'),
    (goodman_37b, 8.00, 'HKSX08XC', 800, 'Goodman SS-GAVPTC (3/19), p.10 Heat Kit Data (AVPTC37B14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37B14 column'),
    (goodman_37b, 9.60, 'HKSX10XC', 875, 'Goodman SS-GAVPTC (3/19), p.10 Heat Kit Data (AVPTC37B14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37B14 column'),
    (goodman_37b, 14.40, 'HKSC15XA', 1050, 'Goodman SS-GAVPTC (3/19), p.10 Heat Kit Data (AVPTC37B14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37B14 column');

  -- ===== Goodman AVPTC37C14B =====
  insert into public.equipment_filter_specs (equipment_id, filter_furnished, filter_type, filter_size, filter_thickness_in, source_document) values
    (goodman_37c, false, 'Throwaway', '19.5 X 20.0 (ALFH1912201E, C chassis)', 1, 'Goodman SS-GAVPTC (3/19), p.18 Accessories/Filters table, Chassis C row (filter_furnished inferred from placement under Accessories, not an explicit statement; thickness confirmed via Daikin SS-DVPTC p.18, identical part number ALFH1912201E)')
  on conflict (equipment_id) do nothing;

  insert into public.equipment_heat_kit_compatibility (equipment_id, heat_kit_kw, heat_kit_model, minimum_airflow_cfm, source_document) values
    (goodman_37c, 4.50, 'HKSX05XC', 850, 'Goodman SS-GAVPTC (3/19), p.10 Heat Kit Data (AVPTC37C14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37C14 column'),
    (goodman_37c, 6.00, 'HKSX06XC', 900, 'Goodman SS-GAVPTC (3/19), p.10 Heat Kit Data (AVPTC37C14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37C14 column'),
    (goodman_37c, 8.00, 'HKSX08XC', 1000, 'Goodman SS-GAVPTC (3/19), p.10 Heat Kit Data (AVPTC37C14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37C14 column'),
    (goodman_37c, 9.60, 'HKSX10XC', 1170, 'Goodman SS-GAVPTC (3/19), p.10 Heat Kit Data (AVPTC37C14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37C14 column'),
    (goodman_37c, 14.40, 'HKSC15XA', 1345, 'Goodman SS-GAVPTC (3/19), p.10 Heat Kit Data (AVPTC37C14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37C14 column'),
    (goodman_37c, 19.20, 'HKSC19CA', 1345, 'Goodman SS-GAVPTC (3/19), p.10 Heat Kit Data (AVPTC37C14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37C14 column');

  -- ===== Goodman AVPTC37D14B =====
  insert into public.equipment_filter_specs (equipment_id, filter_furnished, filter_type, filter_size, filter_thickness_in, source_document) values
    (goodman_37d, false, 'Throwaway', '23.0 X 20.0 (ALFH20231E, D chassis)', 1, 'Goodman SS-GAVPTC (3/19), p.18 Accessories/Filters table, Chassis D row (filter_furnished inferred from placement under Accessories, not an explicit statement; thickness confirmed via Daikin SS-DVPTC p.18, identical part number ALFH20231E)')
  on conflict (equipment_id) do nothing;

  insert into public.equipment_heat_kit_compatibility (equipment_id, heat_kit_kw, heat_kit_model, minimum_airflow_cfm, source_document) values
    (goodman_37d, 4.50, 'HKSX05XC', 1240, 'Goodman SS-GAVPTC (3/19), p.11 Heat Kit Data (AVPTC37D14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37D14 column'),
    (goodman_37d, 6.00, 'HKSX06XC', 1240, 'Goodman SS-GAVPTC (3/19), p.11 Heat Kit Data (AVPTC37D14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37D14 column'),
    (goodman_37d, 8.00, 'HKSX08XC', 1240, 'Goodman SS-GAVPTC (3/19), p.11 Heat Kit Data (AVPTC37D14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37D14 column'),
    (goodman_37d, 9.60, 'HKSX10XC', 1240, 'Goodman SS-GAVPTC (3/19), p.11 Heat Kit Data (AVPTC37D14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37D14 column'),
    (goodman_37d, 14.40, 'HKSC15XA', 1520, 'Goodman SS-GAVPTC (3/19), p.11 Heat Kit Data (AVPTC37D14B* section) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37D14 column'),
    (goodman_37d, 19.20, 'HKSC20DA', 1520, 'Goodman SS-GAVPTC (3/19), p.11 Heat Kit Data (AVPTC37D14B* section, "20" designator = 19.2kW w/170F limit per nomenclature p.2) + p.7 Electric Heat Airflow & Dipswitch Settings, AVPTC37D14 column, "20" row');

  -- ===== Trane AM7A0C36H31SA =====
  insert into public.equipment_filter_specs (equipment_id, filter_furnished, filter_type, filter_size, filter_thickness_in, source_document) values
    (trane_36, false, 'Throwaway', '22 X 20', 1, 'Trane/American Standard "Hyperion - Field Reference Data - TAM7" (ManualsLib doc 1663128), p.2 Product Specifications, *AM7A0C36H31SA column (FILTER row); cross-checked against Trane spec sheet 22-1847-06 (H31SC revision), which independently publishes the identical size/refrigerant/dimension/weight data')
  on conflict (equipment_id) do nothing;

  insert into public.equipment_heat_kit_compatibility (equipment_id, heat_kit_kw, heat_kit_model, minimum_airflow_cfm, source_document) values
    (trane_36, 4.80, 'BAYEVAC05++1', null, 'Trane "Hyperion - Field Reference Data - TAM7" (ManualsLib doc 1663128), p.16 Heater Attribute Data, *AM7A0C36H31SA section, 240 Volt column; minimum_airflow_cfm not published in this document (no heater-vs-CFM table for this model line)'),
    (trane_36, 7.68, 'BAYEVAC08++1', null, 'Trane "Hyperion - Field Reference Data - TAM7" (ManualsLib doc 1663128), p.16 Heater Attribute Data, *AM7A0C36H31SA section, 240 Volt column; minimum_airflow_cfm not published - see note above'),
    (trane_36, 9.60, 'BAYEVAC10++1', null, 'Trane "Hyperion - Field Reference Data - TAM7" (ManualsLib doc 1663128), p.16 Heater Attribute Data, *AM7A0C36H31SA section, 240 Volt column; minimum_airflow_cfm not published - see note above'),
    (trane_36, 14.40, 'BAYEVBC15LG3', null, 'Trane "Hyperion - Field Reference Data - TAM7" (ManualsLib doc 1663128), p.16 Heater Attribute Data, *AM7A0C36H31SA section, 240 Volt column; minimum_airflow_cfm not published - see note above'),
    (trane_36, 19.20, 'BAYEVBC20BK1', null, 'Trane "Hyperion - Field Reference Data - TAM7" (ManualsLib doc 1663128), p.16 Heater Attribute Data, *AM7A0C36H31SA section, 240 Volt column, Circuit 1 (9.60kW) + Circuit 2 (9.60kW) totaled; minimum_airflow_cfm not published - see note above');
end $$;
