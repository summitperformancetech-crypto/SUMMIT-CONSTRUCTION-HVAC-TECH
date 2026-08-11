-- Lets a contracting org flag equipment_catalog lines they carry
-- preferentially or distribute exclusively. Purely a display/ranking
-- tie-break input (see rankEquipment's preferredEquipmentIds parameter in
-- lib/manualS.ts) - never touches compatibilityScore itself, which stays
-- a physics-based number derived only from Manual J load + OEM
-- performance data, not sales relationships.
create table if not exists public.equipment_org_preferences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  equipment_id uuid not null references public.equipment_catalog(id) on delete cascade,
  is_preferred boolean not null default false,
  is_exclusive boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, equipment_id)
);

alter table public.equipment_org_preferences enable row level security;

-- Same split as the profiles table: any org member can see the org's
-- preferences (a field tech should see why a unit is flagged "Preferred"
-- in Manual S results), only admins can change them.
create policy "Users can view their org's equipment preferences"
  on public.equipment_org_preferences
  for select
  using (org_id = public.get_my_org_id());

create policy "Admins can manage their org's equipment preferences"
  on public.equipment_org_preferences
  for all
  using (org_id = public.get_my_org_id() and public.get_my_role() = 'admin')
  with check (org_id = public.get_my_org_id() and public.get_my_role() = 'admin');
