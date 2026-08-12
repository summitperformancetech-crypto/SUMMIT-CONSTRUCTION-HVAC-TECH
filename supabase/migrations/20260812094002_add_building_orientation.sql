-- Building-orientation-driven wall auto-population.
--
-- Problem: when a drawing has no true-north marker, extraction previously
-- left every room's compass wall length blank - correct (guessing a
-- compass direction would silently corrupt solar gain calc), but it meant
-- 100% manual per-room entry even though the drawing itself unambiguously
-- shows each room's position relative to the building's own front/rear/
-- left/right, as drawn on the page. That drawing-relative geometry is
-- real, extractable data - it just isn't tied to true north yet.
--
-- Fix, two parts:
-- 1. rooms gets 4 new columns capturing drawing-relative wall lengths
--    (front/rear/left/right, as drawn - see EXTRACTION_PROMPT in
--    lib/drawingExtraction.ts for the exact "tech standing outside facing
--    the entry" convention), alongside (not replacing) the existing
--    compass wall_north/south/east/west_len_ft columns those calc engines
--    already read.
-- 2. projects gets one field, building_front_faces - an 8-point compass
--    selection the tech makes ONCE per project. lib/orientation.ts's
--    transform then converts every room's front/rear/left/right into the
--    correct wall_north/south/east/west values in one action, without
--    needing an actual north-arrow marker on the drawing at all.
--
-- 8-point (not 4-point) because a real building's front commonly faces an
-- intercardinal direction (a corner lot, an angled street) - see
-- lib/orientation.ts's own comment for why the transform's WRITE target
-- is still cardinal-only (wallLenFt/wallExposure in lib/manualJ.ts are
-- hardcoded to the 4 cardinal directions - a pre-existing constraint of
-- the Manual J solar-gain model this feature doesn't change), and what
-- happens when an intercardinal selection is made.
alter table public.rooms
  add column if not exists wall_front_len_ft numeric,
  add column if not exists wall_rear_len_ft numeric,
  add column if not exists wall_left_len_ft numeric,
  add column if not exists wall_right_len_ft numeric;

alter table public.projects
  add column if not exists building_front_faces text
    check (building_front_faces is null or building_front_faces = any (array['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']));
