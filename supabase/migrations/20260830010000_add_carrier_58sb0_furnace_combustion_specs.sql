-- Eighth real furnace-platform batch for equipment_combustion_specs, and
-- the first Carrier furnace platform in this sweep. Resolves the
-- previously-disclosed blocker on Carrier's 58SB0/58SB1 platform (see
-- 20260828050000's trailing "Remaining furnace work" note and the
-- project memory standing-full-documentation-sourcing-requirement
-- progress log).
--
-- BLOCKER RESOLVED - motor code "M":
--   The equipment_catalog model numbers 58SB0090M17-14 / 58SB1090M17-14
--   use motor-type position code "M". A prior session could only locate
--   the older 58SB0A revision's Installation Instructions (58SB0A-04SI),
--   whose model-number nomenclature (drawing A190041) defines the
--   motor-type position as C / E / V only (E = Fixed-Speeds Constant
--   Torque (FCT) ECM) with NO "M" code - an unconfirmed match, left
--   unsourced rather than guessed.
--   The current 58SB0B/58SB1B Product Data (A190411, drawing A220581)
--   - the exact document already cited on these two equipment_catalog
--   rows - defines the motor-type position as:
--       C = Constant Airflow Variable-Speed (VCA) ECM
--       V = Variable-Speed (VCT) PWM
--       M = Multi 18-Speed Constant Torque (MCT) ECM
--   So "M" is a real, current Carrier motor-type code on the 58SB0B
--   revision; the 58SB0B revision re-labelled this position relative to
--   the superseded 58SB0A ("E"). 58SB0090M17-14 is a 58SB0B-platform
--   furnace (Comfort 80, single-stage, 80% AFUE, non-condensing, MCT ECM
--   blower). The 58SB0B/58SB1B Installation Instructions (58SB0B-01SI,
--   read directly this session) are the correct combustion-safety source
--   and are titled for both 58SB0B (standard) and 58SB1B (Low NOx), so
--   both equipment_catalog rows are directly sourced here, not inferred
--   from a sibling.
--
-- Real facts sourced (58SB0B-01SI Installation Instructions + 58SB0B
-- Product Data A190411, both read directly, page cites below):
--   - Venting category: Category I fan-assisted. SI p.4 INTRODUCTION,
--     verbatim: "This 4-way multipoise Category I fan-assisted furnace
--     is CSA design-certified." (80% AFUE non-condensing, may be common-
--     vented with other Category I appliances and used with Type B-1
--     vent - PD p.3.)
--   - Clearances to combustibles (SI Fig. 2 / PD "CLEARANCES", label
--     drawing A220231, furnace rating-plate label 336996-101 REV. F).
--     Real, notable platform difference from the Amana/Goodman furnaces
--     already in this table: the label states "Clearance arrows do not
--     change with furnace orientation", i.e. ONE set of values covers
--     upflow, downflow and horizontal (no separate larger horizontal /
--     alcove enclosure table). Values, inches: top/plenum 1, back
--     (rear) 0, sides 0, front 3, bottom 0. Bottom 0 is for
--     non-combustible floors only (dagger note); combustible flooring
--     only when installed on accessory Combustible Floor Base
--     KGASB0201ALL or a manufacturer cased evaporator coil / coil
--     casing (SI p.4 item 13). Alcove/closet installation requires 18
--     in. front clearance (circle-slash note). Separate 24 in. minimum
--     front service clearance ("SERVICE" arrow). Vent connector
--     clearance to combustibles: single-wall vent 6 in.; Type B-1 vent
--     1 in.
--   - Gas supply (inlet) pressure, NATURAL GAS (PD A190411 pp.4-5 GAS
--     CONTROLS table, "Min./Max. inlet pressure (in.w.c.)"): min 4.5,
--     max 13.6. SI p.14 additionally caps any inlet test pressure at
--     the gas-valve-stamped 0.5 psig (14 in. w.c.). Gas valve is a
--     WhiteRodgers redundant single-stage valve; factory orifice #43;
--     silicon-nitride hot-surface ignition.
--   - Gas manifold pressure, NATURAL GAS (SI p.33 step 3 NOTE,
--     verbatim: "DO NOT set manifold pressure less than 3.2-in. w.c. or
--     more than 3.8-in. w.c. for natural gas at sea level."). SI p.33
--     EXAMPLE 1 worked point: 3.7 in. w.c. with the factory #43 orifice
--     at 1000 Btu/cu-ft heating value and 0.62 specific gravity. Stored
--     as a 3.2 / 3.8 low/high range (single-stage valve - one physical
--     regulator target, expressed by the manual as a range, not a
--     separate low-fire figure); the 3.7 example point is recorded in
--     source_document rather than invented as a single "nominal".
--
-- GENUINE DISCLOSED GAP - propane:
--   Neither the 58SB0B Product Data nor the 58SB0B Installation
--   Instructions publishes a propane manifold pressure or a propane gas
--   supply-pressure range. This platform ships configured for natural
--   gas; propane operation requires the separate factory-authorised
--   Natural-to-Propane conversion kit AGAGC8NPS01B (non-condensing 80%
--   furnaces, listed in the PD A190411 accessory table as
--   "AGAGC8NPS01B*"), and those values live in that kit's own
--   Installation Instructions, which could not be obtained from a
--   primary source this pass. Propane fields are therefore left NULL
--   with this disclosure (null/unconfirmed beats a guess) rather than
--   carried over from a different manufacturer's platform. Whoever
--   continues the Carrier furnace sweep should source AGAGC8NPS01B (or
--   the -01C revision) to fill propane_supply_pressure_* and
--   manifold_pressure_propane_* for every Carrier 58-series 80% furnace
--   platform at once.
do $$
declare
  v_source text := 'Carrier 58SB0B/58SB1B Installation, Start-Up, Operating and Service and Maintenance Instructions (58SB0B-01SI) + 58SB0B/58SB1B Product Data (A190411, 58SB0B-01PD), both read directly. Venting category: SI p.4 INTRODUCTION ("This 4-way multipoise Category I fan-assisted furnace is CSA design-certified"). Clearances: SI Fig. 2 / PD "CLEARANCES" (label drawing A220231, rating-plate label 336996-101 REV. F) - "Clearance arrows do not change with furnace orientation", one table for upflow/downflow/horizontal; SI p.4 item 13 for the combustible-floor base condition (accessory KGASB0201ALL or cased coil). Natural gas supply (inlet) pressure: PD A190411 pp.4-5 GAS CONTROLS table (min 4.5 / max 13.6 in. w.c.; WhiteRodgers redundant single-stage valve, factory orifice #43). Natural gas manifold pressure: SI p.33 step 3 NOTE ("DO NOT set manifold pressure less than 3.2-in. w.c. or more than 3.8-in. w.c. for natural gas at sea level"); SI p.33 EXAMPLE 1 worked point 3.7 in. w.c. with the factory #43 orifice at 1000 Btu/cu-ft / 0.62 s.g. Motor code "M" = Multi 18-Speed Constant Torque (MCT) ECM per PD A190411 model-number nomenclature (drawing A220581) - resolves the prior "58SB0A had no M code" blocker (58SB0A is the superseded revision, motor position C/E/V only). Propane manifold and supply pressure not published in either the Product Data or the Installation Instructions - propane operation requires the separate factory kit AGAGC8NPS01B (listed in PD A190411 accessory table); those fields left NULL and disclosed rather than guessed.';
  v_clearances jsonb := '{
    "all_orientations": {"top": 1, "rear": 0, "sides": 0, "front": 3, "bottom": 0},
    "orientation_note": "Label states clearance arrows do not change with furnace orientation - the single set of values above applies to upflow, downflow and horizontal (no separate horizontal/alcove enclosure table on this platform).",
    "bottom_note": "0 in. for non-combustible floors only; combustible flooring permitted only when installed on accessory Combustible Floor Base KGASB0201ALL or on a manufacturer cased evaporator coil / coil casing (SI p.4 item 13).",
    "alcove_front_in": 18,
    "service_clearance_front_in": 24,
    "vent_connector_single_wall_in": 6,
    "vent_connector_type_b1_in": 1,
    "note": "Accessibility/service clearance (24 in. front) takes precedence over the enclosure clearances above wherever it is greater."
  }'::jsonb;
  v_equipment_id uuid;
  v_model text;
begin
  foreach v_model in array array['58SB0090M17-14', '58SB1090M17-14']
  loop
    select id into v_equipment_id
    from public.equipment_catalog
    where manufacturer = 'Carrier' and model_number = v_model and equipment_type = 'furnace';

    if v_equipment_id is null then
      raise exception 'equipment_catalog row not found for Carrier % (furnace)', v_model;
    end if;

    insert into public.equipment_combustion_specs (
      equipment_id, venting_category,
      manifold_pressure_natural_gas_low_iwc, manifold_pressure_natural_gas_high_iwc,
      manifold_pressure_propane_low_iwc, manifold_pressure_propane_high_iwc,
      natural_gas_supply_pressure_min_iwc, natural_gas_supply_pressure_max_iwc,
      propane_supply_pressure_min_iwc, propane_supply_pressure_max_iwc,
      clearances_in, source_document
    ) values (
      v_equipment_id, 'I',
      3.2, 3.8,
      null, null,
      4.5, 13.6,
      null, null,
      v_clearances, v_source
    )
    on conflict (equipment_id) do update set
      venting_category = excluded.venting_category,
      manifold_pressure_natural_gas_low_iwc = excluded.manifold_pressure_natural_gas_low_iwc,
      manifold_pressure_natural_gas_high_iwc = excluded.manifold_pressure_natural_gas_high_iwc,
      manifold_pressure_propane_low_iwc = excluded.manifold_pressure_propane_low_iwc,
      manifold_pressure_propane_high_iwc = excluded.manifold_pressure_propane_high_iwc,
      natural_gas_supply_pressure_min_iwc = excluded.natural_gas_supply_pressure_min_iwc,
      natural_gas_supply_pressure_max_iwc = excluded.natural_gas_supply_pressure_max_iwc,
      propane_supply_pressure_min_iwc = excluded.propane_supply_pressure_min_iwc,
      propane_supply_pressure_max_iwc = excluded.propane_supply_pressure_max_iwc,
      clearances_in = excluded.clearances_in,
      source_document = excluded.source_document;
  end loop;
end $$;
