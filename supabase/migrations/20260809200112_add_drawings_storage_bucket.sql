-- Storage bucket for uploaded architectural drawings (PDF/image), plus RLS
-- matching the existing project-based access pattern used by rooms/drawings.
-- Objects are stored under a `${project_id}/...` path so the policy below
-- can resolve the owning project from the object path.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'drawings',
  'drawings',
  false,
  26214400, -- 25 MB
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

create policy "Access drawings via project access"
on storage.objects
for all
using (
  bucket_id = 'drawings'
  and exists (
    select 1 from public.projects
    where projects.id = (storage.foldername(objects.name))[1]::uuid
      and projects.org_id = public.get_my_org_id()
      and (
        public.get_my_role() = any (array['admin', 'estimator'])
        or projects.created_by = auth.uid()
      )
  )
);
