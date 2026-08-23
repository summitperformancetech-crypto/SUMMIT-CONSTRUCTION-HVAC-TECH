-- Base schema capture: organizations, profiles, and the two RLS helper
-- functions every later migration's RLS policies depend on
-- (get_my_org_id, get_my_role). This predates the tracked migration
-- history in this repo -- it was created directly against Supabase
-- (dashboard/SQL editor) before migrations were adopted for schema
-- changes, so no local .sql file previously existed for it. This
-- migration captures the live production shape as introspected via
-- information_schema/pg_policies/pg_proc, so a fresh Supabase project
-- can reproduce the same schema from `supabase db reset` alone.
--
-- Note: there is no database trigger creating a `profiles` row on
-- `auth.users` signup (confirmed absent live). New users are added to
-- `profiles` by an admin (via the "Admins can insert profiles in their
-- org" policy below) or via a service-role script for the very first
-- org/admin, since RLS blocks a user with no profile yet from creating
-- their own.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  license_number text,
  logo_data_uri text
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  role text not null check (role = any (array['field_tech', 'estimator', 'admin'])),
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;

create function public.get_my_org_id()
returns uuid
language sql
stable security definer
as $$
  select org_id from profiles where id = auth.uid()
$$;

create function public.get_my_role()
returns text
language sql
stable security definer
as $$
  select role from profiles where id = auth.uid()
$$;

create policy "Users can view their own org"
  on public.organizations for select
  using (id = get_my_org_id());

create policy "Admins can update their own org"
  on public.organizations for update
  using (id = get_my_org_id() and get_my_role() = 'admin')
  with check (id = get_my_org_id() and get_my_role() = 'admin');

create policy "Users can view profiles in their org"
  on public.profiles for select
  using (org_id = get_my_org_id());

create policy "Admins can insert profiles in their org"
  on public.profiles for insert
  with check (org_id = get_my_org_id() and get_my_role() = 'admin');

create policy "Admins can update profiles in their org"
  on public.profiles for update
  using (org_id = get_my_org_id() and get_my_role() = 'admin');

create policy "Admins can delete profiles in their org"
  on public.profiles for delete
  using (org_id = get_my_org_id() and get_my_role() = 'admin');
