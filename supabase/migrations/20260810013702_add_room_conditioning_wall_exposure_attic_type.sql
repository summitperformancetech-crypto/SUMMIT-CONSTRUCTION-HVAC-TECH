-- Room conditioning status: unconditioned rooms (garages, unconditioned
-- attics, etc.) are excluded from whole-house Manual J totals but remain as
-- records for wall-adjacency reference. Defaults to true so existing rooms'
-- calc behavior is unchanged.
alter table public.rooms
  add column if not exists is_conditioned boolean not null default true;

-- Per-direction wall exposure type. Defaults to 'exterior' so existing rooms
-- keep their current full-delta-T calc behavior unchanged after this
-- migration. 'adjacent_conditioned' walls contribute zero load (same design
-- temp on both sides); 'adjacent_unconditioned' walls use a reduced buffer
-- delta-T in lib/manualJ.ts (see that file for the approximation this uses
-- and why).
alter table public.rooms
  add column if not exists wall_north_exposure_type text not null default 'exterior',
  add column if not exists wall_south_exposure_type text not null default 'exterior',
  add column if not exists wall_east_exposure_type text not null default 'exterior',
  add column if not exists wall_west_exposure_type text not null default 'exterior';

alter table public.rooms
  add constraint rooms_wall_north_exposure_type_check
    check (wall_north_exposure_type = any (array['exterior', 'adjacent_unconditioned', 'adjacent_conditioned'])),
  add constraint rooms_wall_south_exposure_type_check
    check (wall_south_exposure_type = any (array['exterior', 'adjacent_unconditioned', 'adjacent_conditioned'])),
  add constraint rooms_wall_east_exposure_type_check
    check (wall_east_exposure_type = any (array['exterior', 'adjacent_unconditioned', 'adjacent_conditioned'])),
  add constraint rooms_wall_west_exposure_type_check
    check (wall_west_exposure_type = any (array['exterior', 'adjacent_unconditioned', 'adjacent_conditioned']));

-- Attic construction type, project-level. Defaults to 'vented_unconditioned'
-- (the traditional approach) so existing projects' ceiling calc behavior is
-- unchanged - ceiling_insulation_r_value continues to apply at full delta-T
-- exactly as before. 'sealed_conditioned' attics use the same buffer
-- delta-T treatment as adjacent_unconditioned walls (see lib/manualJ.ts).
alter table public.projects
  add column if not exists attic_construction_type text not null default 'vented_unconditioned',
  add column if not exists attic_insulation_type text;

alter table public.projects
  add constraint projects_attic_construction_type_check
    check (attic_construction_type = any (array['sealed_conditioned', 'vented_unconditioned'])),
  add constraint projects_attic_insulation_type_check
    check (attic_insulation_type is null or attic_insulation_type = any (array['fiberglass', 'cellulose', 'mineral_wool', 'other']));
