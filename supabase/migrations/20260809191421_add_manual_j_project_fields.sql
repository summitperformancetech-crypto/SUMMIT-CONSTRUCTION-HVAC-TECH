-- Manual J residential load calculation inputs, stored at the project level.
alter table public.projects
  add column if not exists wall_insulation_r_value numeric,
  add column if not exists ceiling_insulation_r_value numeric,
  add column if not exists floor_insulation_r_value numeric,
  add column if not exists window_u_value numeric,
  add column if not exists window_shgc numeric,
  add column if not exists ach50 numeric,
  add column if not exists indoor_design_temp_heating_f numeric not null default 70,
  add column if not exists indoor_design_temp_cooling_f numeric not null default 75,
  add column if not exists occupants integer not null default 2;
