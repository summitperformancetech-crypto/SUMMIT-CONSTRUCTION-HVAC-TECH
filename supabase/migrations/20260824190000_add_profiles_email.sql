-- Team management (Admin role) needs to show member email addresses on
-- the roster without a service-role call on every page load. auth.users
-- isn't exposed to normal RLS-scoped queries, so email is denormalized
-- onto profiles instead - same pattern this schema already uses for
-- other display-only fields. Populated at invite time going forward;
-- backfilled once here for any profile that predates this column.
alter table public.profiles add column email text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;
