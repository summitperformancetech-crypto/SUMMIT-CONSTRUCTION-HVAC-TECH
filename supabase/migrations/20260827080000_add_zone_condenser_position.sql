-- Catalog Expansion + Recommended Install Package - prerequisite flagged
-- in the diagnostic report, not one of the original 9 gaps but load-
-- bearing for Section 5 step 3 (line-set length sizing): neither the
-- outdoor unit/condenser position nor any AHU-to-outdoor-unit distance
-- was modeled anywhere - only the AHU pin (20260825090000) and the
-- return-air plenum pin (20260826000000) exist per zone. Same real,
-- independently-placed pin workflow as those two, not assumed to be a
-- fixed offset from the AHU.
alter table public.zones
  add column if not exists condenser_position_x_norm numeric,
  add column if not exists condenser_position_y_norm numeric,
  add column if not exists condenser_position_source_drawing_id uuid references public.drawings(id) on delete set null,
  add column if not exists condenser_position_source_page_number integer;
