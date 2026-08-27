-- Catalog Expansion + Recommended Install Package, Section 3, Gap 4 -
-- real AHRI-certified outdoor-unit + indoor-coil/air-handler
-- combinations. Diagnostic finding: several existing rows' own
-- source_document already disclose the real caveat this closes - a
-- recorded CFM/capacity is for ONE specific coil pairing, and a
-- different (newer/cased) coil for the same outdoor unit is separately
-- AHRI-certified with different numbers. "Same tonnage therefore
-- compatible" is explicitly NOT the standard here - only a real,
-- manufacturer-published certified combination is recorded.
--
-- Recommended Install Package generator (Section 5, step 1): a selected
-- outdoor+indoor pairing with no row here is a hard flag, not a silent
-- pass - an uncertified combination has a different, unverified real
-- capacity, not just "probably fine."
create table if not exists public.equipment_coil_matching (
  id uuid primary key default gen_random_uuid(),
  outdoor_unit_id uuid not null references public.equipment_catalog(id) on delete cascade,
  indoor_unit_id uuid not null references public.equipment_catalog(id) on delete cascade,
  ahri_reference_number text,
  source_document text not null,
  unique (outdoor_unit_id, indoor_unit_id)
);

alter table public.equipment_coil_matching enable row level security;
create policy "equipment_coil_matching_select" on public.equipment_coil_matching
  for select to authenticated using (true);
