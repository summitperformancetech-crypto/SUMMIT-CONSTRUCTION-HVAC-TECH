-- Catalog Expansion + Recommended Install Package, Section 3 - a real
-- indoor cased-coil SKU (paired with an outdoor unit, distinct from an
-- air handler) has nowhere to live today. Diagnostic finding: several
-- existing rows' own source_document already flag the real coil-pairing
-- caveat (the recorded CFM is for one specific coil, a different/newer
-- cased coil for the same outdoor unit rates differently) - there was no
-- way to represent that second coil as its own catalog row at all.
--
-- Same non-capacity-bearing treatment as 'air_handler' (see that type's
-- own comment below and lib/manualS.ts) - a coil has no independent
-- performance rating of its own; its real capacity only exists as part
-- of a certified outdoor-unit + coil COMBINATION (see
-- equipment_coil_matching, added separately). Excluded from equipment-
-- ranking pools at the same two call sites 'air_handler' already is.
alter table public.equipment_catalog
  drop constraint equipment_catalog_equipment_type_check;
alter table public.equipment_catalog
  add constraint equipment_catalog_equipment_type_check
    check (equipment_type = any (array['split_ac', 'heat_pump', 'furnace', 'package_unit', 'air_handler', 'coil']));
