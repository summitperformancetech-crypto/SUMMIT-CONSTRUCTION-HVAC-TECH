-- Catalog Expansion + Recommended Install Package, Gap 9 (highest
-- priority per spec) - real Daikin and Trane outdoor units. Diagnostic
-- finding: both brands previously had exactly 1 catalog row each (an
-- air handler only), so neither could complete a same-brand system
-- pairing.
--
-- DAIKIN - Source: Daikin SS-DZ4SE Specification Sheet,
-- https://cdn.daikincloud.io/PIM/Assets/Documents/SS-DZ4SE.pdf (DZ4SE
-- single-stage split heat pump line, 7 real published tonnages 1.5-5
-- ton). 3 of the 7 fully sourced this pass (2/3/4-ton, spanning the
-- range without transcribing all 7 in one sitting - real, disclosed
-- partial depth, not claimed complete): p.3 (Product Specifications -
-- nominal capacity, MCA, MOCP, voltage, refrigerant line sizes, factory
-- charge at 15ft liquid line), p.6/10/14 (Cooling Data header - the
-- exact real AHRI-certified outdoor+indoor coil combination for each
-- tonnage, used directly for equipment_coil_matching below rather than
-- inferred from "same tonnage").
--
-- Real disclosed limitation: p.3's line-size table is only rated for a
-- 25ft factory line set ("Line sizes denoted for 25' line sets..." -
-- footnote 1); the real max-length/lift figures live in a separate "Long
-- Line Set Applications guide" this session did not have access to -
-- max_equivalent_length_ft/max_elevation_change_ft are left null rather
-- than guessed.
insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
  ('Daikin', 'DZ4SEA2410A', 'heat_pump', 'single', 24000, 24000, 750, 'Daikin SS-DZ4SE Specification Sheet (rev. 09/24), https://cdn.daikincloud.io/PIM/Assets/Documents/SS-DZ4SE.pdf, p.3 (Product Specifications) and p.6 (Cooling Data)'),
  ('Daikin', 'DZ4SEA3610A', 'heat_pump', 'single', 36000, 36000, 1150, 'Daikin SS-DZ4SE Specification Sheet (rev. 09/24), https://cdn.daikincloud.io/PIM/Assets/Documents/SS-DZ4SE.pdf, p.3 (Product Specifications) and p.10 (Cooling Data)'),
  ('Daikin', 'DZ4SEA4810A', 'heat_pump', 'single', 48000, 48000, 1460, 'Daikin SS-DZ4SE Specification Sheet (rev. 09/24), https://cdn.daikincloud.io/PIM/Assets/Documents/SS-DZ4SE.pdf, p.3 (Product Specifications) and p.14 (Cooling Data)'),
  -- Real matched indoor cased coils - a 'coil' row (no independent
  -- capacity - see 20260827010000), capacity shown mirrors its certified
  -- outdoor-unit pairing per the same combination header this row's
  -- coil_matching entry is sourced from.
  ('Daikin', 'AMST24BU1400A', 'coil', 'single', 24000, null, 750, 'Daikin SS-DZ4SE Specification Sheet (rev. 09/24), https://cdn.daikincloud.io/PIM/Assets/Documents/SS-DZ4SE.pdf, p.6 (Cooling Data header: DZ4SEA2410A*+AMST24BU1400A*)'),
  ('Daikin', 'AMST36CU1400A', 'coil', 'single', 36000, null, 1150, 'Daikin SS-DZ4SE Specification Sheet (rev. 09/24), https://cdn.daikincloud.io/PIM/Assets/Documents/SS-DZ4SE.pdf, p.10 (Cooling Data header: DZ4SEA3610A*+AMST36CU1400A*)'),
  ('Daikin', 'AMST48CU1400A', 'coil', 'single', 48000, null, 1460, 'Daikin SS-DZ4SE Specification Sheet (rev. 09/24), https://cdn.daikincloud.io/PIM/Assets/Documents/SS-DZ4SE.pdf, p.14 (Cooling Data header: DZ4SEA4810A*+AMST48CU1400A*)')
on conflict do nothing;

-- TRANE - Source: Trane XR15 (4TWR5) Product Data, PUB. NO. 22-1832-10,
-- https://americancoolingandheating.com/wp-content/uploads/2012/06/22-1832-10.pdf,
-- p.4 (Product Specifications: electrical + refrigerant line size) and
-- p.4 footnote 3 (standard line length 80ft, standard lift 60ft).
--
-- Real, disclosed limitation, checked directly (not assumed): Trane's
-- residential Product Data literature - checked across XR15 (both the
-- 2012 and 2020 revisions) and the prior-generation XR14 - does NOT
-- publish an open outdoor-temp-swept extended capacity table the way
-- Goodman/Amana/Daikin's literature does; Trane's residential line
-- defers extended performance to its dealer-only TRACE selection
-- software, which this session has no access to. Zero
-- equipment_performance_points rows are inserted for these two models -
-- lib/manualS.ts's interpolateCoolingCapacity returns null with no
-- points, so these rows correctly never rank as a Manual S candidate
-- (verified safe, not a crash risk) until real extended data is sourced.
-- They exist here for real electrical/lineset reference and future
-- pairing, not as a Manual S-ready selection - a genuinely open,
-- disclosed gap, not silently presented as complete.
insert into public.equipment_catalog (manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document) values
  ('Trane', '4TWR5024G1', 'heat_pump', 'single', 24000, null, null, 'Trane XR15 (4TWR5) Product Data, PUB. NO. 22-1832-10, https://americancoolingandheating.com/wp-content/uploads/2012/06/22-1832-10.pdf, p.4 (Product Specifications). No extended/expanded performance curve published in Trane residential Product Data literature - equipment_performance_points intentionally empty, see migration comment.'),
  ('Trane', '4TWR5036G1', 'heat_pump', 'single', 36000, null, null, 'Trane XR15 (4TWR5) Product Data, PUB. NO. 22-1832-10, https://americancoolingandheating.com/wp-content/uploads/2012/06/22-1832-10.pdf, p.4 (Product Specifications). No extended/expanded performance curve published in Trane residential Product Data literature - equipment_performance_points intentionally empty, see migration comment.')
on conflict do nothing;
