-- Project-level "Preferred Manufacturer" for Manual S equipment
-- selection. Deliberately free text with NO check constraint/FK against
-- equipment_catalog.manufacturer - the dropdown that populates this is
-- built from DISTINCT manufacturer values in that table at render time
-- (never hardcoded), so a new manufacturer becomes selectable the moment
-- a migration seeds its catalog rows, no schema change needed here.
-- Null means "no preference" - Manual S shows its normal top-3
-- highest-compatibility results across all manufacturers, unchanged.
alter table public.projects
  add column if not exists preferred_manufacturer text;
