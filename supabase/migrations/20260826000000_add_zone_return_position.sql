-- Return-air plenum position - a real, independently-placed pin per
-- zone, same workflow as the AHU pin (components/duct-routing-canvas.tsx),
-- not assumed to be co-located with the AHU. Previously the diagram drew
-- a return-air swatch directly attached to the AHU icon with no real
-- position of its own - per direct instruction, the return plenum needs
-- to be a required, resolvable pin like the AHU is, not an assumption.
alter table public.zones
  add column if not exists return_position_x_norm numeric,
  add column if not exists return_position_y_norm numeric,
  add column if not exists return_position_source_drawing_id uuid references public.drawings(id) on delete set null,
  add column if not exists return_position_source_page_number integer;
