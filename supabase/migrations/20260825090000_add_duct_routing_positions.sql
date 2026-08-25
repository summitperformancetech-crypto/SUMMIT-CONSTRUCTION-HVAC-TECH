-- Duct-routing pin placement (auto Manual D run length feature). Resolved
-- (tech-confirmed-or-moved) positions, distinct from the AI-suggested
-- room_position living inside drawings.extracted_data - these are the
-- values lib/ductRouting.ts actually computes real run lengths from, only
-- ever written once a human has confirmed or moved a pin (see
-- field_resolutions: table_name='rooms'|'zones', field_name='position'/
-- 'ahu_position'). position_source_drawing_id ties the normalized
-- x/y_norm coordinates to the specific drawing (and, via that drawing's
-- extracted_data.sheets[].page_number, the specific page) they're
-- relative to - a normalized coordinate is meaningless without knowing
-- which rendered page it was placed against.
alter table public.rooms
  add column if not exists position_x_norm numeric,
  add column if not exists position_y_norm numeric,
  add column if not exists position_source_drawing_id uuid references public.drawings(id) on delete set null;

-- AHU/mechanical-equipment position is always tech-placed from scratch,
-- never AI-suggested (mechanical closets/attic accesses are rarely
-- labeled as reliably as rooms are on a floor plan) - see
-- lib/ductRouting.ts and the ACCA Manual D fitting-length memory this
-- feature was built against.
alter table public.zones
  add column if not exists ahu_position_x_norm numeric,
  add column if not exists ahu_position_y_norm numeric,
  add column if not exists ahu_position_source_drawing_id uuid references public.drawings(id) on delete set null;
