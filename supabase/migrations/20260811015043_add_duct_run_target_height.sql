-- Missed in the initial Manual D migration (20260811014540_add_manual_d.sql):
-- a rectangular run's width is solved from a tech-chosen target height (the
-- framing cavity it has to fit in) via the Huebscher equivalent-diameter
-- equation in lib/manualD.ts - there was no column to store that choice.
alter table public.duct_runs
  add column if not exists target_height_in numeric;
