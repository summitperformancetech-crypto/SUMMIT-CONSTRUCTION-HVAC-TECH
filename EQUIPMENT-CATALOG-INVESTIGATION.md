# Equipment Catalog Investigation — Why Only 4 Units Show

Investigated 2026-08-25. No code changed — read-only investigation per request.

## Answer: (a) — pure seeding/scope problem, not a filtering bug, not org-scoping

`equipment_catalog` genuinely contains exactly 4 rows, confirmed by a direct
service-role query against the live database (bypasses RLS entirely, so this
is not a permissions artifact):

| Manufacturer | Model | Type | Stage | Nominal Cooling | Nominal Heating | Rated CFM |
|---|---|---|---|---|---|---|
| Carrier | 26TPA824W003 | split_ac | two_stage | 24,000 Btuh | — | 800 |
| Carrier | 26VNA124 | split_ac | variable_speed | 24,000 Btuh | — | 770 |
| Goodman | GSZB401810A | heat_pump | single | 18,000 Btuh | 22,000 Btuh | 615 |
| Goodman | GSZB403610A | heat_pump | single | 36,000 Btuh | 44,000 Btuh | 1,150 |

Every row is backed by real, cited manufacturer expanded-performance-data
PDFs (41 performance points for each Goodman unit, 30/28 for the two
Carriers) — this was a deliberate, quality-over-quantity seed, not
placeholder data, but it was never expanded beyond the original 4 rows.

## How I confirmed this (ruling out (b) and (c))

**1. Table history.** Only two migrations ever write to `equipment_catalog`:
- `20260811022434_add_manual_s.sql` — original seed, 4 rows (2 Goodman GSZ14-series, 2 Carrier 24-series)
- `20260811031915_replace_discontinued_equipment.sql` — deletes those 4 (discontinued, pre-R-454B models) and inserts the 4 current rows shown above

No other migration inserts into this table. Grepped every migration that
even mentions `equipment_catalog` (7 total) — the other 5 only reference it
via foreign key or in a comment.

**2. RLS.** Exactly one policy has ever existed on this table:
`equipment_catalog_select ... for select to authenticated using (true)` —
unconditional, defined once, never altered. There is no `is_active`,
`in_production`, or similar status column on the table at all. A
service-role connection (which bypasses RLS) returned the same 4 rows,
which rules out RLS hiding anything.

**3. Org-scoping.** `equipment_catalog` itself has **no `org_id` column** —
it's explicitly a shared/global reference table, same as `climate_zone_reference`
and `duct_sizing_tables`. The only org-scoped table nearby is
`equipment_org_preferences` (added in `20260811030638_add_equipment_org_preferences.sql`),
which just flags `is_preferred`/`is_exclusive` per org for *ranking* —
confirmed in `lib/manualS.ts`'s own comment: "Purely a display/ranking
tie-break input... never touches `compatibilityScore`." It has 0 rows
currently for any org, and even if populated, it can't hide a catalog row —
it only annotates one. This isn't the cause.

## Confirmed: both features read the identical, unfiltered table

| Call site | File | Filter applied |
|---|---|---|
| Equipment Preferences page | `app/dashboard/settings/equipment/page.tsx:57-62` | None — `select(...).order("manufacturer")` |
| Manual S data load | `app/dashboard/[id]/page.tsx:558-561` | None — comment reads "Global reference data, not project-scoped" |
| Report generation | `lib/reportData.ts:358-360` | None |

All three are plain, unconditional `select` calls against the same table.
There is no divergence to reconcile — whatever is fixed for one is fixed for
all three automatically.

## Secondary finding worth flagging: coverage gaps beyond just row count

Even setting aside the total count, the 4 rows leave real gaps in the
`equipment_type`/`stage_type` matrix the schema itself defines
(`equipment_type` check constraint allows `split_ac | heat_pump | furnace | package_unit`;
`stage_type` allows `single | two_stage | variable_speed`):

- **Zero `furnace` rows.** Both Carrier units are cooling-only (`nominal_heating_capacity_btu` is `null`) — a standard split-system furnace+AC pairing (extremely common) currently has no furnace half to select.
- **Zero `package_unit` rows.** Relevant for Summit's commercial/industrial Manual N/industrial calcs, not just residential Manual S.
- **Narrow tonnage band.** Nominal cooling capacities on hand are 18,000 / 24,000 / 24,000 / 36,000 Btuh (1.5–3 ton). Nothing below 1.5 ton (additions, small units) or above 3 ton (larger homes — KHAWAJA MAMOON and Schneider-scale projects plausibly need 3–5+ ton, possibly across multiple zones). Manual S's `compatibilityScore` has little to work with outside that band.
- **Single-manufacturer-per-category.** No same-tonnage alternative to compare within a category (e.g., only one 2-ton two-stage option, no competing brand at the same size).

## What it would take to expand — scoped, not built

Three viable paths, increasing in effort:

1. **Manual entry (fastest, matches current data-quality bar).** Same
   pattern as the existing two migrations: find a manufacturer's real
   expanded/extended performance-data PDF (not just an AHRI single-point
   spec sheet — `lib/manualS.ts` requires the full outdoor-temp ×
   entering-condition curve), transcribe it into an
   `equipment_catalog` + `equipment_performance_points` insert migration,
   cite the source PDF per row (existing convention). Each unit is
   realistically 30–80 performance-point rows once both modes are covered.
   Scales linearly with time spent sourcing/transcribing; no code changes
   needed — the schema and both read paths already handle arbitrary catalog
   size.

2. **CSV import tooling.** Only worth building if the transcription volume
   becomes the bottleneck (e.g., committing to a real multi-manufacturer,
   multi-tonnage catalog covering 40+ units). Would need: a defined CSV
   schema matching `equipment_catalog` + `equipment_performance_points`,
   an admin-only upload UI or script, and validation (unit consistency,
   duplicate model numbers, orphaned performance points). Real, scoped
   follow-up work — not started.

3. **Manufacturer API / automated spec-sheet ingestion.** Highest effort,
   likely not worth it: most manufacturers (Carrier, Goodman, Trane, etc.)
   don't expose a public API for expanded performance data — it's
   published as PDF product-data sheets, the same source path #1 already
   uses. This would mean building a PDF-parsing pipeline (via
   `lib/drawingExtraction.ts`'s existing Claude-based extraction pattern,
   plausibly reusable) with the same "human review gate for known failure
   modes" standard the drawing extraction already holds itself to — real
   scope, but disproportionate unless catalog growth becomes an ongoing,
   frequent task rather than a one-time expansion.

**Recommendation for scoping the next conversation**: start with path 1
(manual entry) for whatever specific manufacturers/tonnages Summit actually
quotes most often in the field — that's a business question (which brands
does Summit actually install?), not a technical one, and should drive which
units get sourced first rather than filling the matrix arbitrarily.

## Files touched by this investigation

None. Read-only: grepped/read migrations and the 4 call sites above, ran
one read-only service-role query against the live database. No edits, no
new migrations.
