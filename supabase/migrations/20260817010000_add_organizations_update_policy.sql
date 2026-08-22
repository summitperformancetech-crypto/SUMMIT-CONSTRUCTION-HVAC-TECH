-- SUMMIT-REPORT-STANDARD.md Section 4: org branding (name, license,
-- logo) must be settable by the org, not hardcoded. organizations
-- currently has only a SELECT policy ("Users can view their own org") -
-- no UPDATE policy at all, which would silently fail (RLS-blocked, not
-- a visible error) the branding settings form this checkpoint adds.
-- Admin-only, matching the same admin-gating pattern the equipment
-- preferences settings page already uses (app/dashboard/settings/equipment/page.tsx).
create policy "Admins can update their own org"
on public.organizations
for update
using (id = public.get_my_org_id() and public.get_my_role() = 'admin')
with check (id = public.get_my_org_id() and public.get_my_role() = 'admin');
