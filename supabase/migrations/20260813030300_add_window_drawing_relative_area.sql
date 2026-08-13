-- Window-area counterpart to migration 20260812094002_add_building_orientation.sql.
--
-- That migration gave rooms drawing-relative WALL lengths
-- (wall_front/rear/left/right_len_ft) for the no-true-north case, alongside
-- the compass wall_north/south/east/west_len_ft columns Manual J actually
-- reads. Window area needs the identical split: rooms already has compass
-- window_north/south/east/west_area_sqft (consumed directly by
-- computeManualJ's solar-gain calc, see lib/manualJ.ts), but nothing to
-- hold a window-area estimate when a drawing has no orientation marker -
-- which forced extraction to leave window area unfilled in exactly the same
-- case wall length used to.
--
-- These 4 columns are raw drawing-relative data only (same role as
-- wall_front/rear/left/right_len_ft) - not consumed by computeManualJ
-- directly. Rotating them into the compass window_* columns via
-- lib/orientation.ts's transform (as BuildingOrientationSection already
-- does for walls) is a deliberate follow-up, not part of this migration.
alter table public.rooms
  add column if not exists window_front_area_sqft numeric,
  add column if not exists window_rear_area_sqft numeric,
  add column if not exists window_left_area_sqft numeric,
  add column if not exists window_right_area_sqft numeric;
