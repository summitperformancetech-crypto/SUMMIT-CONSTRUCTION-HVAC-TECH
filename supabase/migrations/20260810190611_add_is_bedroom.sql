-- PHASE 2 ONLY: ASHRAE 62.2 fresh-air ventilation needs a bedroom count per
-- the standard's Nbr term. Rather than a single manual project-level
-- number, track it per room (is_bedroom) so it can later be summed per
-- zone (Phase 5) - a real ACCA report reviewed for this work computes
-- ventilation CFM per AHU/zone using that zone's own bedroom count, then
-- sums zones for the whole-house figure, not a single whole-house formula.
--
-- Until Phase 5 (zones) exists, lib/manualJ.ts sums is_bedroom and
-- conditioned floor area across the whole house and applies ASHRAE 62.2's
-- Qtot = 0.03*Afloor + 7.5*(Nbr+1) formula once, without the infiltration
-- credit term (that credit is version-dependent on the 62.2 edition and
-- requires weather/normalized-leakage inputs this app does not model) -
-- flagged as an approximation, same posture as door_u_value and the
-- adjacent-unconditioned buffer delta-T.
--
-- This is the bedroom-count-only slice of the original bundled
-- 20260810034611_add_doors_ventilation_ducts_zones_fields.sql migration,
-- split out the same way 20260810141452_add_door_u_value.sql was for doors.
alter table public.rooms
  add column if not exists is_bedroom boolean not null default false;
