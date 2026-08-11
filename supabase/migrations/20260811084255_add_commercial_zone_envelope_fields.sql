-- Missed in the initial commercial migration: wall_construction_type/
-- roof_construction_type (already added) are descriptive labels for
-- reporting, but the block-load UA calc in lib/manualN.ts needs actual
-- numeric U-values and areas to multiply, not a text description to
-- parse. Rather than build a construction-type-to-U-value lookup table
-- in this pass (a real reference table Summit would want populated with
-- their own actual wall/roof assemblies, not a generic guess), these are
-- direct numeric inputs a tech enters or defaults, same pattern
-- residential's wall_insulation_r_value already uses. Window fields
-- mirror the residential envelope's window_u_value/window_shgc for solar
-- gain, at zone (not per-room) granularity to match block load's
-- coarser-than-Manual-J-room level of detail.
alter table public.zones
  add column if not exists exterior_wall_area_sqft numeric,
  add column if not exists roof_area_sqft numeric,
  add column if not exists wall_u_value numeric,
  add column if not exists roof_u_value numeric,
  add column if not exists window_area_sqft numeric,
  add column if not exists window_u_value numeric,
  add column if not exists window_shgc numeric;
