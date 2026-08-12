-- Data Integrity Addendum, Section 3: duct insulation code-minimum
-- tracking - a distinct data type from duct_sizing_tables (pure duct
-- diameter/friction-rate aerodynamics, unrelated to insulation R-value).
--
-- One row per unconditioned duct_location (matches
-- lib/constants/ductLocations.ts's DUCT_UNCONDITIONED_LOCATIONS - the only
-- locations lib/manualJ.ts's duct-loss term and this table's Manual D
-- compliance check ever apply to; Conditioned-Space/Attic-Conditioned/
-- Basement-Conditioned ducts sit inside the thermal envelope and have no
-- code-mandated insulation-vs-conditioned-space minimum). unique(
-- duct_location) since this represents the CURRENT minimum per location,
-- not a history - "current" is what both the Manual J default-fill and
-- the Manual D compliance flag need; a jurisdiction/edition change is an
-- UPDATE to the existing row (which bumps updated_at via the trigger
-- below, correctly resurfacing the Section 2 staleness banner), not a new
-- row.
--
-- Seed values: 2021 IECC R403.3.1 (residential) - "Supply and return ducts
-- in attics shall be insulated to a minimum of R-8... ducts in other
-- portions of the building shall be insulated to not less than R-6" (for
-- ducts >=3in diameter; a slightly lower minimum applies below 3in - R-6
-- attic / R-4.2 other - not modeled separately here, a documented
-- simplification since this app has no duct-diameter-tier concept at the
-- code-minimum level). Cross-checked stable across the 2015/2018/2021
-- IECC cycles via a second independent source before seeding, per the
-- master spec's no-fabricated-data rule. This is the seeded DEFAULT, not
-- necessarily the exact edition Texas (or any other state) has locally
-- adopted - code_edition_or_source exists specifically so a tech/admin can
-- see what's currently seeded and update it if their local jurisdiction's
-- adopted edition differs.
create table if not exists public.duct_insulation_code_minimums (
  id uuid primary key default gen_random_uuid(),
  duct_location text not null
    check (duct_location = any (array[
      'Attic-Unconditioned', 'Attic-Conditioned', 'Crawlspace',
      'Basement-Conditioned', 'Basement-Unconditioned', 'Conditioned-Space',
      'Exterior-Wall'
    ])),
  min_r_value numeric not null,
  code_edition_or_source text not null,
  effective_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (duct_location)
);

drop trigger if exists duct_insulation_code_minimums_set_updated_at on public.duct_insulation_code_minimums;
create trigger duct_insulation_code_minimums_set_updated_at
  before update on public.duct_insulation_code_minimums
  for each row execute function public.set_updated_at();

alter table public.duct_insulation_code_minimums enable row level security;

-- Global reference data, same read-only-to-authenticated pattern as
-- equipment_catalog/duct_sizing_tables/room_type_defaults (admin-managed
-- via migrations/service role, not a per-project or per-org table).
create policy "duct_insulation_code_minimums_select" on public.duct_insulation_code_minimums for select
  to authenticated using (true);

insert into public.duct_insulation_code_minimums (duct_location, min_r_value, code_edition_or_source, effective_date) values
  ('Attic-Unconditioned', 8, '2021 IECC R403.3.1 (ducts >=3in diameter in unconditioned attics)', '2021-01-01'),
  ('Crawlspace', 6, '2021 IECC R403.3.1 (ducts >=3in diameter, unconditioned spaces outside attic)', '2021-01-01'),
  ('Basement-Unconditioned', 6, '2021 IECC R403.3.1 (ducts >=3in diameter, unconditioned spaces outside attic)', '2021-01-01'),
  ('Exterior-Wall', 6, '2021 IECC R403.3.1 (ducts >=3in diameter, unconditioned spaces outside attic)', '2021-01-01')
on conflict (duct_location) do nothing;
