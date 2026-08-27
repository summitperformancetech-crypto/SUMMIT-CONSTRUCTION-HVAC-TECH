# SUMMIT — CATALOG EXPANSION + RECOMMENDED INSTALL PACKAGE
## Build Specification for Claude Code

**Context:** Summit's equipment catalog currently has 18 rows across 5 manufacturers (Amana, Carrier, Daikin, Goodman, Trane) — 6 outdoor units, 8 air handlers, 0 furnaces, 0 package units. This was audited against source OEM PDFs and 9 concrete gaps were identified (listed in Section 1). This spec closes those gaps, expands catalog depth to the top 7 products per manufacturer per component category, and builds the Recommended Install Package generator that turns a Manual S compatibility match into a complete, purchasable bill of materials.

Local repo: `/Users/JohnHarper/Documents/summit-hvac/`. Supabase project `kvwkllmujtkulnryoaur`. Standing dev protocol applies throughout (Section 7).

---

## 0. WHY THIS MATTERS — THE STANDARD

Summit's brand promise is precision competitors can't match. A "Manual S equipment selection" that stops at outdoor-unit-to-indoor-unit compatibility scoring is incomplete — a contractor still has to guess at line-set sizing, heat kit compatibility, filter specs, and electrical requirements themselves, which is exactly the kind of unverified guesswork Summit exists to eliminate. The Recommended Install Package closes that gap: every component a crew needs to complete the physical install, assembled automatically from real catalog data, with the same UNRESOLVED-when-data-is-missing discipline that governs the rest of Summit — never a silently invented BOM line.

---

## 1. CONFIRMED GAPS TO CLOSE (from prior catalog audit)

1. Zero furnace or package-unit catalog entries
2. Electrical nameplate data (MCA, MOCP/breaker size) not stored, despite being on every source PDF
3. No refrigerant line-set sizing / max equivalent length data
4. No coil-matching table (which indoor coil pairs with which outdoor unit/tonnage) — several existing rows already flag this as an open caveat in their CFM notes
5. Heat-kit/electric-heat compatibility tables were sourced from the same OEM PDFs already on file but never transcribed into the schema
6. Filter specs not captured
7. Diffuser/duct-material org-default tables exist structurally but have 0 rows — no real purchasable brand/SKU tied to them yet
8. No project has AHU installation detail filled in (plenum size, line sizes, condensate routing, damper types)
9. Daikin and Trane each have an air handler but no outdoor unit — incomplete brand pairs

---

## 2. CATALOG DEPTH TARGET

For every manufacturer in the catalog, source and store:
- **Top 7 outdoor units** (condensers/heat pumps) spanning the manufacturer's common residential/light-commercial tonnage range (typically 1.5–5 ton, but pull the manufacturer's own published lineup rather than assuming a fixed tonnage list — some lines skip tonnages, some go to 6 ton residential)
- **Top 7 indoor components** — air handlers AND coils AND furnaces where the manufacturer publishes them as separate SKUs (a manufacturer with a furnace line and a separate cased-coil line needs both represented, not just air handlers)

"Top 7" = the manufacturer's current, actively published mainstream residential/light-commercial models — not discontinued models, not the full catalog. Source from the manufacturer's own current AHRI-certified performance data sheets, the same standard already used for the existing 18 rows.

**Immediate priority within this target:** close the Daikin and Trane outdoor-unit gaps first (Section 1, item 9) — those two brands currently can't complete a same-brand system pairing at all, which is a harder failure than "only 4 of 7 Amana outdoor units sourced."

**Manufacturer set:** confirm with John whether to expand beyond the current 5 (Amana, Carrier, Daikin, Goodman, Trane) to include other nationwide-relevant brands (e.g. Lennox, Rheem, Bryant, York, Mitsubishi for ductless/mini-split scope) now, or complete the current 5 to full depth first. Default assumption for this build: complete the current 5 to full depth and full data richness (Sections 3–4) before adding new manufacturers — depth before breadth, since an incomplete BOM on 5 brands is a worse user experience than missing a 6th brand entirely.

---

## 3. SCHEMA ADDITIONS — CLOSING GAPS 1–8

### `furnace_units` / extend equipment table with `equipment_category` enum
Add `furnace` and `package_unit` as first-class categories alongside outdoor_unit/air_handler/coil, not a bolt-on table, so they participate in the same compatibility-scoring and package-assembly logic as everything else. Package units (self-contained outdoor+indoor in one cabinet) need a distinct handling path in the package generator (Section 5) since they don't pair with a separate indoor component at all.

### `equipment_electrical_specs`
Per catalog model: `mca` (minimum circuit ampacity), `mocp` (max overcurrent protection / breaker size), `voltage_phase` (e.g. "208-230/1"), `disconnect_size_required`, sourced verbatim from the OEM nameplate/spec sheet table, never estimated.

### `refrigerant_lineset_specs`
Per outdoor unit model (or per tonnage where the OEM publishes by tonnage rather than model): `liquid_line_diameter`, `vapor_line_diameter`, `max_equivalent_length_ft`, `max_elevation_change_ft`, `line-set-length-derate-notes` (many OEMs derate capacity past a length threshold — capture the breakpoints, not just a single max).

### `coil_matching`
Junction table: `outdoor_unit_id` ↔ `compatible_coil_or_ahu_id`, sourced from the manufacturer's own published combination/match-up charts (AHRI-certified combinations specifically — not "same tonnage therefore compatible," since manufacturers publish exact certified pairs and Summit's compatibility scoring should be checking against that certified list, not inferring it).

### `heat_kit_compatibility`
Per air handler model: compatible heat kit kW options, sourced from the same OEM PDFs already on file per the audit note (these were sourced but never transcribed — check `/mnt/user-data` or wherever the source PDFs currently live before re-sourcing from scratch).

### `filter_specs`
Per air handler/furnace: filter size(s), MERV rating range supported, filter type (media/1-inch/etc.), rack location.

### `diffuser_hardware_catalog` / `duct_material_catalog`
Populate the existing org-default tables (built in the prior diagram spec, currently 0 rows) with real purchasable manufacturer/model rows — e.g. actual Airguide, Hart & Cooley, Titus, Metal-Fab, Imperial, CertainTeed, Johns Manville SKUs — so the org-level default dropdown has real options to select from instead of an empty structural placeholder. This is a separate, smaller sourcing pass from the equipment catalog above; do not conflate diffuser/duct hardware sourcing with outdoor/indoor unit sourcing in the same commit.

### `ahu_installation_detail` completion
Already exists per the prior diagram spec but is unpopulated on every project including the Schneider benchmark. This should now populate automatically as a byproduct of the Recommended Install Package generator (Section 5) rather than requiring separate manual entry — the package generator has all the data needed (plenum/line-set sizing from the matched equipment, condensate routing from AHU placement) to fill it.

---

## 4. SOURCING METHOD

For each new catalog row, same discipline as the existing 18: pull from the manufacturer's own current, publicly published AHRI-certified extended performance data sheet and nameplate/electrical spec sheet — not third-party aggregator sites, not distributor listings, not AI-estimated values. Every field in Sections 3 must be traceable to a specific source document per Summit's standing data-traceability principle (what the fact is, which document, when captured, why it matters). Where a manufacturer does not publish a given field publicly (rare, but happens with some line-set derate tables), mark it UNRESOLVED at the catalog level rather than estimating — this propagates correctly into package assembly (Section 5) as a flagged gap rather than a silent guess.

---

## 5. RECOMMENDED INSTALL PACKAGE GENERATOR

This is the core new capability. Given a project that has completed Manual J (room loads) and has a Manual S compatibility match selected (outdoor unit + indoor unit, scored 0–100%), generate a complete package:

**Inputs:** selected outdoor unit, selected indoor unit/coil/air handler, project's Manual D duct/diffuser data (already generated per the diagram spec), project's electric-heat requirement (from Manual J heating load vs. equipment heating capacity — flag if a heat kit is needed), project's line-set run length (from AHU-to-outdoor-unit distance, ideally pulled from the same room/plan geometry used for Manual D routing, or entered directly if not yet modeled).

**Package assembly logic, in order:**
1. Verify the outdoor/indoor pairing against `coil_matching` — if not an AHRI-certified combination, this is a hard flag, not a soft warning, since an uncertified combination changes the equipment's certified capacity and is exactly the kind of gap the diagram/report gate should catch.
2. Pull electrical requirements (`equipment_electrical_specs`) for both outdoor and indoor units — package includes required breaker sizes and disconnect specs for the electrical contractor's reference.
3. Size the line set from `refrigerant_lineset_specs` against the actual run length — flag if the run exceeds the manufacturer's max-length or derate threshold for this model.
4. Determine heat kit need/size from Manual J heating load vs. equipment output; select from `heat_kit_compatibility` for the chosen air handler.
5. Pull filter spec from `filter_specs`.
6. Pull diffuser and duct material selections from the project's existing Manual D diagram data (already resolved per-room) and the org's `diffuser_hardware_catalog`/`duct_material_catalog` defaults — the package should not re-ask for this, it should inherit what Manual D already established.
7. Include termination hardware (ODA filter/grille, exhaust hood, dryer vent back-draft damper) per `building_terminations` from the diagram spec, sourced the same way.
8. Compute an overall **package completeness/compatibility score** — not just the equipment compatibility score from Manual S, but a full-package score reflecting whether every line item above resolved cleanly or has an UNRESOLVED/flagged gap. A 98%-compatible equipment match with an unresolved line-set length flag should not present as a clean "ready to install" package.

**Output:** a structured BOM (equipment, electrical, refrigerant, heat kit, filter, ductwork/diffuser hardware, terminations) tied to the project, each line item referencing its source catalog row, with any UNRESOLVED items surfaced exactly like the rest of Summit's UNRESOLVED workflow — visible, actionable, never hidden. This BOM becomes part of the frozen project snapshot on first report generation, same as every other calc output.

**What this explicitly is not:** a generic "here are some compatible parts" list. It's a single recommended path — the reduce-guessing, reduce-errors promise — with the underlying scoring transparent enough that a contractor can see why each component was chosen and swap any line item (which should re-run the compatibility/completeness score against the swap, not silently accept it).

---

## 6. UI

- Catalog browse: manufacturer → category (outdoor/indoor/furnace/package) → model, each row showing the now-complete spec set (capacity curve, electrical, line-set limits, coil matches, heat kit options, filter spec) rather than today's partial view.
- Package review screen: the assembled BOM, package completeness score prominently displayed, each line item expandable to its source spec sheet reference, swap capability per line item with live re-scoring.
- Org equipment-defaults settings: extend to let orgs set preferred diffuser/duct-material brands from the now-populated `diffuser_hardware_catalog`/`duct_material_catalog` (this closes the loop with the manufacturer-preference dropdown already on the roadmap).

---

## 7. CLAUDE CODE EXECUTION PROTOCOL (embed exactly)

1. **Migrate** — schema for Sections 3 (all six additions), scoped as separate migrations per table so a failure in one doesn't block the others.
2. **Verify via REST API** — confirm every new table/column against the live schema before writing logic against it.
3. **Source data** — furnace/package units, electrical nameplate data, line-set specs, coil-matching tables, heat-kit tables, filter specs, diffuser/duct hardware catalog, and the Daikin/Trane outdoor-unit gap, each as its own sourcing pass with source-document citation per row. Do not batch unrelated manufacturers' sourcing into one commit — batch by data category instead (e.g., "electrical nameplate data for all 18 existing rows" as one unit of work) so partial completion is still verifiable.
4. **Implement package-generator logic** — Section 5, in the stated order, with the completeness-scoring step last since it depends on every prior step's output.
5. **Update UI** — catalog browse improvements, package review screen, org defaults extension.
6. **Test** — against the Schneider project (or another project with a completed Manual J/S) as acceptance benchmark: generate a full install package and confirm every BOM category in Section 5 is populated or explicitly UNRESOLVED with a clear reason, never silently blank.
7. **Commit** — batched by logical unit per step 3/4/5, accurate messages, no component touched twice across separate commits.
8. **Stop and report.**

No code changes before a diagnostic report confirming current schema state for each of the 9 gap items is returned. Investigate first, build second.

---

## 8. OPEN QUESTIONS FOR JOHN (not blockers — defaults stated above)

1. Manufacturer set: complete current 5 brands to full depth first, or expand to additional brands (Lennox, Rheem, Bryant, York, Mitsubishi/ductless) in parallel? Default above: depth first.
2. Line-set run length input: should this pull from planned Manual D/plan-geometry work (AHU-to-outdoor-unit distance modeled from the floor plan), or is manual entry acceptable for now until that geometry exists project-wide?
3. Should an uncertified (non-AHRI-matched) outdoor/indoor pairing be a hard block on package generation, or a strong warning the contractor can override with a documented reason (consistent with the accept/override-with-reason pattern used elsewhere in Summit)? Default above treats it as a hard flag but the spec doesn't yet say block-vs-override — worth deciding explicitly since it affects the UI.
4. Diffuser/duct hardware catalog sourcing — any preferred brands to prioritize first based on what your own crews actually install, or source broadly across major national suppliers (Hart & Cooley, Titus, Metal-Fab, Imperial, CertainTeed, Johns Manville) without a specific priority order?
