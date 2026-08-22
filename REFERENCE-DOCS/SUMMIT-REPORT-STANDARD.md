# Summit Report Generation Standard

**Status:** Minimum baseline — every generated project report (residential, and later commercial/industrial) must meet or exceed this. Nothing below this bar ships. Expanding beyond it (new sections, new manuals) is fine; falling short of it is not.

**Reference build:** `REFERENCE-DOCS/summit-report-4308-vivian-street.html` — the Vivian Street report is the canonical example. When in doubt about layout, spacing, or tone, match that file exactly.

---

## 1. Purpose

Every project, on demand, must be able to generate a client-facing report that:
1. Presents Manual J / D / S results in Summit's own branded format — never a reprint or lookalike of Wrightsoft, Elite, or any competitor layout.
2. Makes Summit's audit-trail differentiator visible on the page, not just present in the database.
3. Is internally self-consistent — every subtotal is verified against its components before the report is allowed to render.

## 2. Output format

- Single self-contained HTML file (inline CSS, base64-embedded images — no external asset dependencies). This matches the reference build and keeps the report portable and viewable offline.
- Print-ready: each page section is a `.page` div sized for print with `page-break-after: always` under `@media print`.
- PDF export is a later wrapper (via headless print-to-PDF) around this same HTML — do not build a parallel PDF-only path.

## 3. Generation gate — when a report is allowed to exist

A report is a **finished deliverable**, not a work-in-progress export. It may only be generated once a project is fully resolved. The "Generate Report" action must be disabled (not just warned-against) until every one of these is true:

- All UNRESOLVED fields are Accepted or Overridden-with-reason — none outstanding, anywhere in the project.
- Manual S equipment selection is complete for every system (make/model/AHRI ref, selected against OEM extended performance data at this project's actual design conditions — not a placeholder or "TBD" equipment block).
- Manual D duct design is complete and compatible with the selected equipment's CFM.
- `validateReportTotals` (§6) passes with zero unresolved discrepancies — anything it corrects must be corrected in the underlying project data, not just patched in the rendered output.

There is no partial, draft, or "preview" report state. If a project isn't ready, the correct product behavior is to show the user what's blocking generation (a checklist of the above), not to render a report with gaps, placeholders, or a "TBD" equipment section. First report generation is also the trigger for snapshotting (§8) — this is exactly why generation must wait until everything is genuinely final: snapshotting freezes the calculation inputs, so freezing early would freeze an incomplete project.

## 4. Branding — non-negotiable tokens

Pull these from the existing worksheet templates (`manual-j-worksheet.html`, etc.) — do not reinvent:

```
--navy-950:#0a0a0a   --navy-900:#141414   --navy-800:#1e1e1e   --navy-700:#333333
--paper:#f0efec      --paper-panel:#fbfbfa
--amber:#a9822f      --amber-light:#d4b06a
--silver:#9aa0a6     --silver-light:#c9ccd0
--ink:#171717        --ink-soft:#54575b   --grid:#dcdad5
Fonts: IBM Plex Sans (body/display), IBM Plex Mono (labels, data, mono figures)
```

- Header on every page: brand mark (actual org logo, not a placeholder) + org name + subtitle, on `--navy-950`, with the amber accent bar beneath.
- Footer on every page: project address / section label (left), "Calculated per ACCA Manual J, 8th Ed. — Summit Load Engine v[X]" (right, amber-light).
- Org identity (name, license #, logo) pulls from the contractor's account/org profile — never hardcoded, never left as a bracketed placeholder in a shipped report.

## 5. Required page set (minimum)

In order:

1. **Cover** — job address, client name(s), prepared-by (org name + license, from account profile), weather station, elevation/latitude, design temps, conditioned area, climate zone confirmation badge (IECC zone, confirmed-before-calculation state), table of contents.
2. **Project Summary — Entire House** — design conditions, heating summary, cooling summary (sensible + latent, itemized by structure/ducts/vent), equipment capacity requirement with method noted (0.70 SHR convention), infiltration method.
3. **Project Summary — per system** (one panel per AHU/zone) — same breakdown, plus full equipment spec (make/model/AHRI ref/efficiency/airflow). Equipment is always selected by this point — see §3, Generation Gate.
4. **Load Short Form — Entire House** — system rollup table with full arithmetic chain visible (structure → vent → RSM-adjusted sensible → latent → totals).
5. **Load Short Form — per system, room-level detail** — every room's area, heating/cooling load, heating/cooling airflow. Include any field-verified overrides as a visible note block (source: site visit vs. plan).
6. **AED Assessment** — pass/fail per system against the 30% ACCA limit, with the peak-excess percentage shown.
7. **Building Analysis — per system** — component breakdown (walls/glazing/doors/ceilings/floors/infiltration/ducts/ventilation/internal gains) as both a table and a donut chart, heating and cooling separately. Chart segments must be computed from actual component percentages — never illustrative/placeholder values.
8. **Building Orientation** — compass diagram (Summit style, see §7) + front-door-faces value + orientation source + verification method + confirmation-gate badge.
9. **Floor Plan — per level** — the actual extracted/uploaded drawing, cropped to remove any competitor title block, with the Summit compass overlaid (§7). Never a redrawn or approximated floor plan — always the source drawing.
10. **Extraction status / field reference** — per-level room confirmation count (confirmed / total), plus any field-verified overrides with reason.
11. **Audit Trail & QA Certification** — the automated cross-foot validation table (see §6) and a correction log for anything the engine adjusted, with before/after values and reason. This page is the core differentiator and must never be omitted.

## 6. Mandatory validation before render

The report generator must run these checks and fail closed (block rendering, surface an error) or flag-and-annotate (render with a visible `QA CORRECTED` badge) rather than silently trusting stored totals:

- Room-level loads sum to their AHU/system subtotal (heating and cooling sensible, independently).
- System subtotals sum to the whole-house total (heating and cooling sensible, independently).
- Latent load components (structure + ducts + ventilation) sum to the reported latent equipment total, at both the system and whole-house rollup level. **This is the exact bug class found in the Vivian Street report** — a whole-house summary that silently dropped the ventilation latent contribution. Any discrepancy here must render with a `QA CORRECTED` flag and log the correction on the Audit Trail page with before/after values and a plain-language reason.
- Equipment tonnage = sensible load ÷ 0.70 (or the org-configured target SHR), and the displayed tonnage must match this computation, not a stored value that could drift from it.
- Every UNRESOLVED field must gate report finalization per the existing UNRESOLVED workflow spec — a report cannot render with unresolved fields silently defaulted.

Implement this as a standalone `validateReportTotals(project)` function, unit-tested against the Vivian Street numbers (including the deliberately-seeded latent discrepancy) so the bug it caught can never regress silently.

## 7. Building orientation & floor plans

- Compass diagram must always use Summit's own style, never a competitor's compass graphic: outer circle (navy stroke), inner concentric guide circle (light grid stroke), silver north needle, **amber** south needle (the amber needle direction is the visual anchor — it should point at whatever direction the front entry actually faces, not always literal south), N/S/E/W labels (N bold black, S bold amber, E/W soft gray).
- Compass direction is captured and confirmed as a Step-3 gate (immediately after drawing upload, before any extraction run) and injected into the extraction prompt as ground truth — never left for the AI to infer per-sheet. This gate's confirmation state is what the cover-page and orientation-page badges display.
- Floor plan images: use the actual uploaded/extracted drawing page, cropped to remove any third-party (e.g., Wrightsoft) title block or branding, with the compass rose replaced using the method above. Never regenerate the floor plan geometry from room dimension data — the source drawing is authoritative per the drawing-authority principle.

## 8. Acceptance criteria (definition of done)

A report generator implementation is complete when, for the Vivian Street project used as the test fixture:

- [ ] The "Generate Report" action is disabled with a blocking checklist (not a warning toast) until every §3 gate condition is met.
- [ ] All 12 sections in §5 render with real project data, no placeholder or "TBD" text remaining anywhere in output.
- [ ] `validateReportTotals` catches the seeded latent-load discrepancy and renders the `QA CORRECTED` badge + Audit Trail log entry, matching the reference build's numbers exactly (7,843 corrected from 5,597).
- [ ] Org branding (logo, name, license) pulls from the account profile, not hardcoded.
- [ ] Floor plans show the Summit compass, not the source drawing's original compass.
- [ ] Output is a single self-contained HTML file, opens correctly with no external dependencies, and prints cleanly to PDF via browser print.
- [ ] Report generation is available on demand from the project view for any project with a finalized calculation (i.e., first-generation triggers snapshotting per the existing snapshot principle).

## 9. Explicitly out of scope for this baseline

- Commercial/industrial module sections (Manual N, etc.) — add as new page types later, additive only.
- ACCA "Powered by Manual J" certification formatting requirements — separate, later-stage spec.
- Multi-language / localization.

These are future extensions of this standard, not blockers to shipping it.
