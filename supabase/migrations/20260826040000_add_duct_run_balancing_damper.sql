-- Permit-Submittable Manual D Package, Section 4 - "balancing damper
-- required on every branch." Real, technician-entered per-branch fact
-- (has a damper actually been installed at this take-off), not inferred
-- from geometry the way take-off spacing/reduction checks are - a
-- damper's physical presence isn't something any drawing or corridor
-- graph in this app currently documents.
alter table public.duct_runs
  add column if not exists has_balancing_damper boolean not null default false;
