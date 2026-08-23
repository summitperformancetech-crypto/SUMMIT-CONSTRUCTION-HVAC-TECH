-- SUMMIT-REPORT-STANDARD.md Section 5.9 / 7 - the Floor Plan page must
-- show the actual source drawing, never regenerated geometry. There was
-- previously no way to say which drawing/page IS the floor plan sheet for
-- a project (a drawing set can have many pages - cover sheet, elevations,
-- details), so the report page rendered an honest "not yet wired" state
-- regardless of whether a usable drawing existed. This lets a human
-- (estimator/admin, matching the report-generation role gate) mark one
-- page of one uploaded drawing as the floor plan to composite into the
-- report - nullable, one project effectively has one active floor plan
-- page at a time (enforced in the app layer, not a DB constraint, same
-- pattern as selected_equipment_id being project-wide today).
alter table public.drawings
  add column if not exists floor_plan_page_number integer check (floor_plan_page_number > 0);
