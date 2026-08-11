-- SECTION 2 (gap-closure spec): duct location + insulation R-value, with
-- AI-extraction attempt and climate/construction-based fallback defaults.
--
-- Design decisions made reconciling the spec against this app's actual
-- architecture (flagged, not silently guessed):
--
-- 1. Fields live on rooms directly, not a new room_ducts table. The spec
--    called a separate table "recommended... for multi-zone", but this app
--    has no zone / multiple-duct-run modeling yet (Phase 5 was deferred) -
--    building a table for a scenario that doesn't exist would be
--    speculative. One duct profile per room, matching how every other
--    room-level field in this schema already works.
--
-- 2. projects.foundation_type is new here, not part of the spec's literal
--    field list - but the spec's own fallback logic needs "is this room
--    over a crawlspace?" as a signal, and foundation_type is already
--    extracted by the AI pipeline (lib/drawingExtraction.ts) but was never
--    wired to any real column - flagged as a real gap during Section 3's
--    review, closed here because Section 2 is the first place that
--    actually needs it.
--
-- 3. duct_insulation_r_value default of 8 for Attic-Unconditioned: current
--    IECC 2021 SS403.3.1 actually sets the zone-1/2 attic minimum at R-6
--    (R-8 applies to zones 3-8, and Killeen/Houston is zone 2A) - verified
--    via web search before writing this. R-8 was kept anyway per explicit
--    user confirmation, since it matches the one real reference report in
--    this repo (REFERENCE-DOCS), which uses R-8 for that same zone-2A
--    project (exceeding, not violating, the zone's actual code minimum).
--    Crawlspace default of R-6 matches both the spec and verified IECC
--    (uniform R-6 for crawlspace/basement/garage regardless of zone).
--
-- rooms_duct_location_check below is mirrored in application code at
-- lib/constants/ductLocations.ts (DUCT_LOCATION_VALUES) - that file is now
-- the single source of truth for the app side (previously this list was
-- duplicated independently in lib/manualJ.ts and room-form.tsx and had
-- already drifted once). Changing the valid set means updating that file
-- AND writing a new migration to alter this constraint to match - the two
-- don't auto-sync.
alter table public.rooms
  add column if not exists duct_location text,
  add column if not exists duct_insulation_r_value numeric,
  add column if not exists duct_source text,
  add column if not exists duct_confidence numeric;

alter table public.rooms
  add constraint rooms_duct_location_check
    check (duct_location is null or duct_location = any (array[
      'Attic-Unconditioned', 'Attic-Conditioned', 'Crawlspace',
      'Basement-Conditioned', 'Basement-Unconditioned',
      'Conditioned-Space', 'Exterior-Wall'
    ])),
  add constraint rooms_duct_source_check
    check (duct_source is null or duct_source = any (array['ai_extracted', 'manual', 'default'])),
  add constraint rooms_duct_confidence_check
    check (duct_confidence is null or (duct_confidence >= 0 and duct_confidence <= 1));

alter table public.projects
  add column if not exists foundation_type text;
