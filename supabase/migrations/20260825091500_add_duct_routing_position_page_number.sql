-- Follow-up to 20260825090000_add_duct_routing_positions.sql: a
-- normalized (x_norm, y_norm) is only meaningful relative to one specific
-- PAGE of a drawing, not just the drawing as a whole - a single uploaded
-- PDF can carry multiple floor-plan sheets (e.g. a main floor and a
-- second-level plan, each its own page). position_source_drawing_id
-- alone was insufficient; adding the page number alongside it.
alter table public.rooms
  add column if not exists position_source_page_number integer;

alter table public.zones
  add column if not exists ahu_position_source_page_number integer;
