-- A standalone dehumidification system's duct_runs rows (see
-- 20260827330000_add_standalone_dehumidification.sql) are real,
-- individually-sized supply and return connections, not a trunk feeding
-- multiple branches the way the primary system's duct_runs.run_type
-- ('trunk'/'branch') already models. Calling the dehumidifier's own
-- return-air pickup a "branch" would misrepresent what it actually is
-- (this app's own standing discipline against imprecise/invented
-- labeling) - so run_type is widened to add 'supply'/'return' as
-- additional real values, used only for dehumidification_system_id-
-- parented rows. Existing 'trunk'/'branch' rows and the primary system's
-- own vocabulary are unaffected.
alter table public.duct_runs
  drop constraint if exists duct_runs_run_type_check;
alter table public.duct_runs
  add constraint duct_runs_run_type_check
    check (run_type = any (array['trunk', 'branch', 'supply', 'return']));
