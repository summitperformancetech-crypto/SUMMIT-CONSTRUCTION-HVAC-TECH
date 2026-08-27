-- Catalog Expansion + Recommended Install Package, Gap 05 - org-level
-- diffuser/duct-material defaults were previously all-blank (zero rows
-- in diffuser_org_defaults/duct_material_org_defaults for every org,
-- including Summit itself) - the settings UI to edit them didn't exist
-- either. This seeds a real, sensible platform default per pattern
-- type / material code for every existing org, non-destructively
-- (on conflict do nothing - an org that has already set its own real
-- preference keeps it).
--
-- These are brand/product-line preferences, not physical specs the way
-- Gap 03/04's kW ratings or filter sizes are - there is no single
-- "correct" answer the way an OEM combination chart has one, so a
-- reasonable, real, widely-distributed national manufacturer per
-- category is a legitimate default, expected to be overridden per org
-- via the new settings UI (app/dashboard/settings/duct-hardware).
--
-- Diffusers: Titus is a real, major national diffuser/grille
-- manufacturer (already cited as an industry-reference brand in this
-- project's own duct_diffuser_pattern_types.source column, alongside
-- Krueger/Price) and makes product lines across every pattern type
-- here (ceiling diffusers, sidewall registers, linear slot, return
-- grilles), so one consistent brand default across all 7 pattern types
-- is defensible rather than an arbitrary per-type brand split.
--
-- Duct materials: Thermaflex for the 3 flexible-duct R-value tiers
-- (already cited alongside Atco in duct_material_specs.source as a
-- real flex-duct manufacturer). Sheet metal has no real "manufacturer"
-- the way a packaged product does - it's shop-fabricated galvanized
-- steel per SMACNA standards, not a purchased branded line - so its
-- default records that fact rather than inventing a brand. Duct board:
-- Johns Manville, a real major NAIMA-member fibrous-glass duct board
-- manufacturer (NAIMA itself, cited in duct_material_specs.source, is
-- a trade association, not a product manufacturer).
insert into public.diffuser_org_defaults (org_id, pattern_type, manufacturer, description)
select o.id, pt.code, 'Titus', 'Platform default - override per organization in Settings > Duct Hardware Defaults'
from public.organizations o
cross join public.duct_diffuser_pattern_types pt
on conflict (org_id, pattern_type) do nothing;

insert into public.duct_material_org_defaults (org_id, material_code, manufacturer, description)
select o.id, m.code,
  case m.category
    when 'flexible' then 'Thermaflex'
    when 'duct_board' then 'Johns Manville'
    else 'Field-fabricated'
  end,
  case m.category
    when 'sheet_metal' then 'Shop-fabricated galvanized sheet steel per ANSI/SMACNA 006 - not a purchased branded product'
    else 'Platform default - override per organization in Settings > Duct Hardware Defaults'
  end
from public.organizations o
cross join public.duct_material_specs m
on conflict (org_id, material_code) do nothing;
