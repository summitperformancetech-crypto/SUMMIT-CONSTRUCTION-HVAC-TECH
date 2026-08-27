-- Catalog Expansion + Recommended Install Package, Section 3, Gap 2 -
-- real electrical nameplate data. Diagnostic finding: every OEM spec
-- sheet already sourced for blower/capacity data (Amana, Goodman,
-- Trane) publishes Min Circuit Ampacity, Max Overcurrent Protection
-- (breaker size), and voltage range right next to the tables already
-- transcribed - none of it was captured. One row per equipment_id, the
-- unit's own baseline nameplate rating "without supplemental heat
-- installed" (the exact qualifier every source document itself uses) -
-- a heat kit's own effect on MCA/MOCP is a real, separate, per-kit fact
-- captured in equipment_heat_kit_compatibility instead, not merged in
-- here as a second, ambiguous row per equipment.
create table if not exists public.equipment_electrical_specs (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment_catalog(id) on delete cascade,
  voltage_phase text not null,
  min_circuit_ampacity numeric not null,
  max_overcurrent_protection numeric not null,
  disconnect_size_amps numeric,
  min_voltage numeric,
  max_voltage numeric,
  source_document text not null,
  unique (equipment_id)
);

alter table public.equipment_electrical_specs enable row level security;
create policy "equipment_electrical_specs_select" on public.equipment_electrical_specs
  for select to authenticated using (true);
