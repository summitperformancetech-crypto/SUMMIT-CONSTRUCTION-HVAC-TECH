-- Real technical requirement: a non-condensing (below ~90% AFUE)
-- furnace draws its combustion air from the surrounding space via a
-- draft hood or induced-draft opening (ANSI Z21.47 Category I venting)
-- - it depends on that space being vented to outdoors. A spray-foam
-- sealed attic (roof-deck foam, no ridge/soffit vents) and an
-- encapsulated crawlspace (sealed, conditioned, no foundation vents)
-- are exactly the buffer spaces that traditionally supplied that air -
-- once they're sealed, a Category I furnace installed in or drawing
-- from one has nowhere left to pull safe combustion air from (real
-- risk: improper combustion, backdrafting, CO). A condensing (90%+
-- AFUE) furnace is Category IV and can be installed sealed-combustion/
-- direct-vent (2-pipe), drawing combustion air through its own
-- dedicated intake straight from outdoors - fully decoupled from the
-- building's air boundary. This is a real, standard HVAC venting-
-- category distinction (ANSI Z21.47/CSA 2.3), not a project-specific
-- inference.
--
-- projects.no_vented_attic_or_crawlspace: a real, explicitly-set
-- project attribute (not inferred from attic_construction_type alone -
-- a project could have a sealed attic but a still-vented crawlspace,
-- or vice versa; this flag means neither is available). Defaults to
-- false so no existing project's equipment selection is retroactively
-- flagged.
alter table public.projects
  add column if not exists no_vented_attic_or_crawlspace boolean not null default false;

comment on column public.projects.no_vented_attic_or_crawlspace is
  'Spray-foam/unvented attic AND encapsulated crawlspace - no outside-vented buffer space available for a Category I furnace to source combustion air from. When true, the install package generator flags any selected furnace/package-unit with a real gas-fired heat section that is not direct_vent_capable.';

-- equipment_catalog.direct_vent_capable: real, sourced per row -
-- true/false only for equipment with a real gas-fired combustion
-- appliance (every furnace row, and the package_unit rows that are
-- gas/electric or dual-fuel hybrid units); null for every row with no
-- combustion appliance at all (heat_pump, split_ac, air_handler, coil,
-- and the heat-pump-only or AC-only package_unit rows) - "combustion
-- air source" simply doesn't apply to electric-only equipment, so null
-- here means not applicable, not false.
--
-- Backfilled below with the exact real AFUE this session's own
-- sourcing established per row (see the Amana/Carrier/Daikin/Goodman/
-- Trane full-lineup migration commits) - not a regex guess against
-- free-text citations: AFUE >= 90% (condensing, Category IV) = true;
-- AFUE < 90% (non-condensing, Category I, single atmospheric/induced-
-- draft vent, no published 2-pipe option) = false.
alter table public.equipment_catalog
  add column if not exists direct_vent_capable boolean;

comment on column public.equipment_catalog.direct_vent_capable is
  'True if the manufacturer''s own spec sheet publishes a sealed-combustion/direct-vent (2-pipe, outdoor combustion air) installation option for this real AFUE tier - true for every condensing 90%+ AFUE furnace/gas-package unit checked this session, false for every non-condensing ~80-81% AFUE one. Null where there is no combustion appliance at all (heat pump, split AC, air handler, coil, or a heat-pump-only/AC-only package unit).';

update public.equipment_catalog set direct_vent_capable = v.dvc
from (values
  -- Furnaces, AFUE >= 90% (condensing, Category IV, direct-vent capable)
  ('Amana', 'AR9S96-U0805CU', true),
  ('Amana', 'AR9S960803BN', true),
  ('Amana', 'AMVM970803BNB', true),
  ('Amana', 'AR9T960803BN', true),
  ('Amana', 'ARVM970803BN', true),
  ('Amana', 'ARVT960803BN', true),
  ('Carrier', '59SP6', true),
  ('Carrier', '59MN7A080-14', true),
  ('Carrier', '59SC2B080-16', true),
  ('Carrier', '59TN6', true),
  ('Carrier', '59CU5', true),
  ('Carrier', '59TP6', true),
  ('Carrier', '59SU5', true),
  ('Carrier', '59TN7A080C17-16', true),
  ('Carrier', '59TP7A080V17-16', true),
  ('Carrier', '59SC6A080M17-16', true),
  ('Daikin', 'DM97MC0803BNA', true),
  ('Daikin', 'DR96TC0803BN', true),
  ('Daikin', 'DR97MC0803BN', true),
  ('Goodman', 'GR9S960803BN', true),
  ('Goodman', 'GR9T960803BN', true),
  ('Goodman', 'GRVM970803BN', true),
  ('Goodman', 'GMVM970803BNB', true),
  ('Goodman', 'GRVT960803BN', true),
  ('Goodman', 'GR9S96-U0805CU', true),
  ('Trane', 'TUHMB080ACV3VB', true),
  ('Trane', 'S9V2B080U4PSBB', true),
  -- Furnaces, AFUE < 90% (non-condensing, Category I, not direct-vent capable)
  ('Amana', 'AR9S800803B', false),
  ('Carrier', '58SB0090M17-14', false),
  ('Carrier', '58SB1090M17-14', false),
  ('Carrier', '58SC0090M17-14', false),
  ('Carrier', '58SC1090M17-14', false),
  ('Carrier', '58CU0', false),
  ('Carrier', '58TN', false),
  ('Carrier', '58SP0', false),
  ('Carrier', '58SP1', false),
  ('Carrier', '58SU0', false),
  ('Carrier', '58TP0090V17-16', false),
  ('Carrier', '58TP1090V17-16', false),
  ('Daikin', 'DR80TC0803B', false),
  ('Goodman', 'GR9S800803B', false),
  ('Trane', 'TUD1B080A9241B', false),
  -- Package units WITH a real gas-fired heat section (gas/electric or
  -- dual-fuel hybrid) - all real ~81% AFUE, non-condensing
  ('Amana', 'APGM53608031', false),
  ('Amana', 'APGM33606041', false),
  ('Amana', 'APGM53608041A', false),
  ('Carrier', '48NG-B360903', false),
  ('Carrier', '48NL', false),
  ('Carrier', '48VR', false),
  ('Carrier', '48NR', false),
  ('Carrier', '48NT', false),
  ('Daikin', 'DP5GM3608031', false),
  ('Daikin', 'DP5UM3608031', false),
  ('Daikin', 'DP5UM3608041A', false),
  ('Goodman', 'GPGM53608031', false),
  ('Goodman', 'GPGM53608041AA', false),
  ('Trane', '4YCC4036A1070A', false)
) as v(manufacturer, model_number, dvc)
where equipment_catalog.manufacturer = v.manufacturer
  and equipment_catalog.model_number = v.model_number;

-- Heat-pump-only / AC-only package units left explicitly null (no
-- combustion appliance, not applicable) - already the column default,
-- listed here only as a record of which rows were deliberately
-- excluded from the update above, not overlooked: Amana APHM53631,
-- Carrier 50VR-A36/50VG/50NT/50NR/50VT/50NH/50ZH/50NP, Daikin
-- DP5HH3631, Goodman GPHM53631.
