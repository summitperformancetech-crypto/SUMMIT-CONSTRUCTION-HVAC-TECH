-- SECTION 1 (internal gains gap-closure spec, supersedes the old planned
-- Phase 3): per-room internal gains with per-room-type ACCA defaults,
-- instead of the pre-existing flat whole-house occupant/appliance number
-- in lib/manualJ.ts.
--
-- room_type did not already exist on rooms - checked live via the REST API
-- before adding (rooms only has "level", which is floor/story, not room
-- purpose). Distinct from is_bedroom (added for Phase 2/ASHRAE 62.2
-- ventilation) - a room typed 'Bedroom' does not automatically set
-- is_bedroom, and vice versa. Flagged as a known overlap, not merged here
-- since neither this spec nor Phase 2 asked for that.
--
-- occupant_count/sensible_gain_override/latent_gain_override are all
-- nullable with no default: an unset room_type + no override means 0
-- internal gains for that room (explicit "not yet classified" state,
-- never a fabricated guess) - same posture as door_u_value/is_bedroom
-- before them.
alter table public.rooms
  add column if not exists room_type text,
  add column if not exists occupant_count integer,
  add column if not exists sensible_gain_override numeric,
  add column if not exists latent_gain_override numeric;

alter table public.rooms
  add constraint rooms_room_type_check
    check (room_type is null or room_type = any (array[
      'Bedroom', 'Living', 'Kitchen', 'Bath', 'Dining', 'Family',
      'Office', 'Garage', 'Utility', 'Hallway', 'Other'
    ]));

-- Per-room-type ACCA occupant/appliance defaults. Cross-checked against the
-- reference Manual J report in REFERENCE-DOCS (4308 Vivian Street) before
-- finalizing: that report only shows internal gains as one aggregate
-- cooling-sensible number per zone (5201 Btuh whole-house, no per-room or
-- per-category breakdown), so it can confirm the whole-house order of
-- magnitude (4-bedroom house => 5 occupants @ 230 Btuh sensible = 1150 of
-- the 5201 Btuh total, remainder plausibly appliances/electronics) but
-- cannot verify these per-room-type figures line by line - that
-- granularity isn't in the source document.
--
-- latent_btu_per_person corrected from the spec's 190 to 200 after
-- flagging the discrepancy: 190 did not match ACCA's commonly-cited Table
-- 6A figure, the pre-existing OCCUPANT_LATENT_BTUH_PER_PERSON=200 constant
-- already live in lib/manualJ.ts, or any other source checked - confirmed
-- with the user to use 200.
create table if not exists public.room_type_defaults (
  room_type text primary key,
  default_occupants integer not null,
  sensible_btu_per_person numeric not null,
  latent_btu_per_person numeric not null,
  appliance_sensible_btu numeric not null
);

alter table public.room_type_defaults enable row level security;

create policy "All authenticated users can view room type defaults"
on public.room_type_defaults
for select
using (auth.role() = 'authenticated');

insert into public.room_type_defaults
  (room_type, default_occupants, sensible_btu_per_person, latent_btu_per_person, appliance_sensible_btu)
values
  ('Bedroom', 2, 230, 200, 0),
  ('Living',  2, 230, 200, 0),
  ('Kitchen', 1, 230, 200, 1200),
  ('Bath',    0, 0,   0,   0),
  ('Dining',  2, 230, 200, 0),
  ('Family',  3, 230, 200, 0),
  ('Office',  1, 230, 200, 100),
  ('Garage',  0, 0,   0,   0),
  ('Utility', 0, 0,   0,   300),
  ('Hallway', 0, 0,   0,   0),
  ('Other',   1, 230, 200, 0)
on conflict (room_type) do update set
  default_occupants = excluded.default_occupants,
  sensible_btu_per_person = excluded.sensible_btu_per_person,
  latent_btu_per_person = excluded.latent_btu_per_person,
  appliance_sensible_btu = excluded.appliance_sensible_btu;
