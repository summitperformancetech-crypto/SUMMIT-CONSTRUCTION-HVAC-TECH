-- Real, previously-uncapturable gap: this schema has never had anywhere
-- to store the safety-relevant facts specific to gas-fired equipment
-- (furnaces, gas-fired package units) - venting category, gas manifold
-- pressure, gas supply (inlet) pressure range, and minimum clearances to
-- combustibles. Every existing furnace/package_unit row was sourced from
-- a real OEM "Product Data" or "Specification Sheet" document (a
-- reasonably complete engineering document, not a shallow marketing
-- sheet), but those documents' own "Specifications" tables (already
-- transcribed into equipment_catalog's generic capacity/electrical
-- columns) do not carry this data - it lives in the separate
-- Installation Instructions manual for each unit, which had not been
-- read for any of these rows before this migration. Per the standing
-- full-documentation-sourcing requirement (see project memory), this is
-- being closed by (1) adding real columns to hold this data, then (2)
-- reading real Installation Instructions manuals to populate them.
create table if not exists public.equipment_combustion_specs (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment_catalog(id) on delete cascade,
  -- Real ANSI Z21.47/NFPA 54 (National Fuel Gas Code) venting
  -- classification. Category I: non-positive vent pressure, non-
  -- condensing (standard atmospheric/induced-draft 80% AFUE units).
  -- Category II: non-positive vent pressure, condensing (rare in
  -- residential). Category III: positive vent pressure, non-condensing
  -- (rare in residential). Category IV: positive vent pressure,
  -- condensing (standard 90%+ AFUE sealed-combustion units, PVC/CPVC
  -- vented). Determines real, code-mandated vent material and routing -
  -- never inferred from AFUE alone without a real manufacturer
  -- statement, since the two properties (condensing vs not, positive vs
  -- non-positive vent pressure) are related but not strictly identical
  -- across every real product.
  venting_category text
    check (venting_category = any (array['I', 'II', 'III', 'IV'])),
  -- Real manifold pressure(s), in inches w.c., as published in the
  -- unit's Installation Instructions - not the data sheet, which
  -- typically omits this. Two-stage/modulating units publish a real
  -- low-fire and high-fire (or min/max) pressure rather than one value;
  -- single-stage units publish one. Nulled fields mean "not applicable
  -- to this unit's real staging," not unconfirmed.
  manifold_pressure_natural_gas_low_iwc numeric,
  manifold_pressure_natural_gas_high_iwc numeric,
  manifold_pressure_propane_low_iwc numeric,
  manifold_pressure_propane_high_iwc numeric,
  -- Real gas supply (inlet) pressure operating range the manufacturer
  -- requires at the unit's gas valve, in inches w.c. - a real,
  -- code-relevant fact (NFGC/IFGC require verifying supply pressure is
  -- within the appliance manufacturer's specified range) distinct from
  -- manifold pressure (which is downstream of the gas valve's own
  -- regulator). Split by fuel type - every real unit checked so far
  -- publishes a materially different, higher propane range than its
  -- natural gas range (e.g. 4.5-10.0 in w.c. natural vs. 11.0-13.0 in
  -- w.c. propane) - never assumed proportional or derived from one
  -- figure.
  natural_gas_supply_pressure_min_iwc numeric,
  natural_gas_supply_pressure_max_iwc numeric,
  propane_supply_pressure_min_iwc numeric,
  propane_supply_pressure_max_iwc numeric,
  -- Real minimum clearance-to-combustibles data, in inches, as a
  -- structured object rather than a fixed set of columns - real
  -- published clearance tables vary by installation orientation
  -- (upflow/downflow/horizontal), alcove vs. closet installation, and
  -- sometimes differ for service access vs. actual fire-safety minimum.
  -- Real keys used: front, rear, left, right, top, flue_connector,
  -- vent_connector, alcove (closet-front minimum, often larger than the
  -- bare unit's own front clearance) - only the keys a given unit's real
  -- manual actually publishes are populated; a real published "0" (many
  -- Category IV units are zero-clearance on sides/rear/top) is a real
  -- fact, never the same as an absent key.
  clearances_in jsonb,
  source_document text not null,
  unique (equipment_id)
);

alter table public.equipment_combustion_specs enable row level security;
create policy "equipment_combustion_specs_select" on public.equipment_combustion_specs
  for select to authenticated using (true);

comment on table public.equipment_combustion_specs is
  'Real, gas-code-relevant facts (ANSI Z21.47/NFPA 54 venting category, manifold pressure, gas supply pressure range, minimum clearances to combustibles) for equipment_catalog rows with equipment_type = furnace or package_unit (gas-fired). Sourced from each unit''s real Installation Instructions manual, a separate document from the Product Data/Specification Sheet already used for equipment_catalog''s capacity/electrical columns - that document does not publish this data. A null row (no equipment_combustion_specs entry at all) means not yet sourced, never assumed equivalent to another unit without an independent real citation, even across shared-OEM-platform siblings (Amana/Daikin/Goodman) - those brands have been independently confirmed identical for capacity/electrical in this schema, but venting/gas-pressure/clearance data has not yet been cross-checked the same way for every sibling.';
