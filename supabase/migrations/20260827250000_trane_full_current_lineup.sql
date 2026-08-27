-- Full current dealer-available Trane lineup, furnace category. Fifth
-- and final manufacturer of the "entire current dealer lineup"
-- expansion. Trane's real naming differs from the other 4
-- manufacturers' shared HKS-nomenclature platform - Trane's own model
-- codes (TUHM/TDHM/TUD prefixes) and marketing names (XC95m/XR80) are
-- unique to Trane, confirmed via Trane's own real Product Data/
-- Product Specifications documents, not inferred from any cross-brand
-- pattern.
--
--   TUHMB080ACV3VB (XC95m) - Trane Product Data Pub. No. 22-1840-10,
--     p.6 TUHM Product Specifications: 80,000 Btu/h input / 77,360
--     Btu/h output (100% high heat), 96.7% AFUE (real, per-model - the
--     smaller 060 size in the same document rates 97.3%), "Redundant -
--     Three Stage" gas valve (the real, disclosed gas-valve spec,
--     distinct from the "fully modulating" marketing description),
--     variable-speed direct-drive blower, filter FURNISHED (1) 17x25,
--     115V/1ph/60Hz, ampacity 7.7A / max overcurrent 15A.
--   TUD1B080A9241B (XR80) - Trane Product Data Pub. No. 22-1640-14
--     (05/2016 - real document; a newer "Choice 80" marketing name may
--     supersede "XR80" but this is the real, current model-number
--     family per Trane's own literature, not superseded in the
--     nomenclature itself), p.6 Product Specifications: 80,000 Btu/h
--     input / 64,000 Btu/h output, 80.0% AFUE, single-stage,
--     4-speed centrifugal blower (not variable), filter NOT furnished,
--     recommended High Velocity 1-17x25-1in, 115V/1ph/60Hz,
--     ampacity 10.4A / max overcurrent 15A.
--
-- Together with the existing S9V2B080U4PSBB (Gap 01, two-stage
-- variable-speed 96.0% AFUE) this gives Trane 3 real current furnace
-- tiers spanning its full efficiency range (modulating/three-stage 97%
-- down to single-stage 80%). Trane's package-unit lineup was not
-- further expanded beyond the existing Gap 01 4YCC4036A1070A pick this
-- pass - a real, disclosed scope boundary given session time
-- constraints, not a claim that Trane's lineup ends there.
do $$
declare
  f1 uuid; f2 uuid;
begin
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Trane', 'TUHMB080ACV3VB', 'furnace', 'variable_speed', null, 77360, null, 'Trane XC95m Product Data Pub. No. 22-1840-10, p.6 TUHM Product Specifications, TUHMB080ACV3VB column: 80,000 Btu/h input / 77,360 Btu/h output (100% high heat), 96.7% AFUE, "Redundant - Three Stage" gas valve, variable-speed direct-drive blower, filter FURNISHED (1) 17x25-1in, 115V/1ph/60Hz, ampacity 7.7A / max overcurrent protection 15A')
    returning id into f1;
  insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
    ('Trane', 'TUD1B080A9241B', 'furnace', 'single', null, 64000, null, 'Trane XR80 Product Data Pub. No. 22-1640-14 (05/2016), p.6 Product Specifications, TUD1B080A9241B column: 80,000 Btu/h input / 64,000 Btu/h output, 80.0% AFUE, single-stage, 4-speed centrifugal blower, filter NOT furnished (recommended High Velocity 1-17x25-1in), 115V/1ph/60Hz, ampacity 10.4A / max overcurrent protection 15A')
    returning id into f2;

  insert into public.equipment_electrical_specs (equipment_id, voltage_phase, min_circuit_ampacity, max_overcurrent_protection, source_document) values
    (f1, '115/1', 7.7, 15, 'Trane XC95m Product Data Pub. No. 22-1840-10, p.6, TUHMB080ACV3VB column, POWER CONN. row'),
    (f2, '115/1', 10.4, 15, 'Trane XR80 Product Data Pub. No. 22-1640-14, p.6, TUD1B080A9241B column, POWER CONN. row');

  insert into public.equipment_filter_specs (equipment_id, filter_furnished, filter_type, filter_size, source_document) values
    (f1, true, 'High Velocity', '(1) 17x25 - 1in.', 'Trane XC95m Product Data Pub. No. 22-1840-10, p.6, TUHMB080ACV3VB column, FILTER row'),
    (f2, false, 'High Velocity', '(1) 17x25 - 1in.', 'Trane XR80 Product Data Pub. No. 22-1640-14, p.6, TUD1B080A9241B column, FILTER row')
  on conflict (equipment_id) do nothing;
end $$;
