-- Summit Report Standard (REFERENCE-DOCS/SUMMIT-REPORT-STANDARD.md), Section
-- 4: "Org identity (name, license #, logo) pulls from the contractor's
-- account/org profile - never hardcoded, never left as a bracketed
-- placeholder in a shipped report." organizations currently only has
-- (id, name, created_at) - no license or logo. Both nullable: a real
-- license number and logo are values this app cannot fabricate (a
-- fabricated HVAC contractor license number on a generated report would be
-- a real misrepresentation, not just a placeholder) - see
-- components/org-branding-settings.tsx for how the report-generation gate
-- surfaces "not yet configured" rather than rendering a blank or fake value.
alter table public.organizations
  add column if not exists license_number text,
  add column if not exists logo_data_uri text;

comment on column public.organizations.license_number is
  'Contractor license number shown on every generated report footer/cover per SUMMIT-REPORT-STANDARD.md Section 4. Null until the org admin enters a real one - never fabricated.';
comment on column public.organizations.logo_data_uri is
  'Org logo as a self-contained base64 data: URI (matches the report''s single-file HTML output requirement, Section 2 - no external asset dependencies). Null until uploaded.';
