import { DUCT_LOCATION_VALUES, normalizeDuctLocation } from "./constants/ductLocations";

// Phase 3, item 3 (uncertainty classification). Richer than the single
// "unresolved" boolean this sits alongside - "unresolved" answers "does
// a human need to act on this," "certainty" answers "why, in what way."
// Scoped deliberately to ExtractedField<T> only (all 15
// building_envelope fields + the 2 per-room duct fields) - not extended
// to ExtractedRoom's own unresolved/reason (which bundles several
// different facts under one flag - a single certainty value there would
// be ambiguous about which fact it describes) or ExtractedWaterHeater
// (its own unresolved/reason, not ExtractedField<T>-typed). A natural
// follow-up once this proves useful on the fields where it applies
// cleanly, not forced in everywhere at once.
//
// Expected pairing (stated explicitly in EXTRACTION_PROMPT so this isn't
// two independent judgment calls that can drift out of sync):
// "documented"/"calculated" typically pair with unresolved: false;
// "inferred"/"assumed"/"unverified"/"conflict" always pair with
// unresolved: true.
export type ExtractedFieldCertainty =
  | "documented"
  | "calculated"
  | "inferred"
  | "assumed"
  | "unverified"
  | "conflict";

export type ExtractedField<T> = {
  value: T | null;
  unresolved: boolean;
  // Optional, unlike ExtractedRoom's reason (always present there) - most
  // envelope fields are unresolved for the generic "not confidently
  // labeled" reason the UI already implies, not worth a sentence every
  // time. Exists for the cases that do need one: e.g. a value disputed
  // across multiple sheets, where "unresolved: true" alone gives a human
  // reviewer no way to tell WHY without independently re-deriving what I
  // already found. Populated directly by the extraction prompt as of
  // Phase 3 (the source authority and dimensional reconciliation
  // hierarchies both require it when applied) - also still written
  // directly by code when a specific conflict is diagnosed and corrected
  // post-hoc (see flagCeilingInsulationRValueConflicts).
  reason?: string | null;
  // See ExtractedFieldCertainty above. Optional for the same reason
  // source_sheet is - historical extractions from before this phase
  // genuinely don't have it.
  certainty?: ExtractedFieldCertainty | null;
};

export type ExtractedEnvelope = {
  wall_insulation_r_value: ExtractedField<number>;
  ceiling_insulation_r_value: ExtractedField<number>;
  floor_insulation_r_value: ExtractedField<number>;
  window_type: ExtractedField<string>;
  window_count: ExtractedField<number>;
  foundation_type: ExtractedField<string>;
  // One building-wide plate height, not a per-room extraction - a floor
  // plan set rarely labels ceiling height per room (vaults/trays are the
  // exception, and remain a manual room-form correction), but a wall
  // section or elevation sheet commonly labels one figure for the whole
  // house/story. Applied downstream to every room that doesn't already
  // have a ceiling_height_ft (see applyExtractedData in
  // manual-j-workflow.tsx) - never overwrites a tech's per-room entry,
  // unlike the unconditional overwrite wall/duct data gets, since a vault
  // or drop ceiling is exactly the kind of per-room exception a human is
  // likely to have hand-corrected.
  ceiling_height_ft: ExtractedField<number>;
  // Phase 2. Applied - wired to the existing projects.attic_construction_type
  // column (same enum this app's manual entry form already uses), which
  // feeds computeManualJ's attic-loss branch directly. Was previously
  // manual-only despite the extraction pipeline already inferring vented
  // vs. sealed for other purposes (duct-location defaults) - this closes
  // that gap. Inferred from ridge/soffit vent callouts (vented) or
  // spray-foam-at-roof-deck callouts (sealed) on an elevation or wall-
  // section sheet, not assumed.
  attic_construction_type: ExtractedField<"vented_unconditioned" | "sealed_conditioned">;
  // Phase 2, items 1 (wall assembly). Reference-only for now, same status
  // window_type/window_count already have - extracted and shown in the
  // review panel, but not copied to any project field or consumed by
  // computeManualJ. The whole-wall U-factor calc these four fields would
  // eventually feed (accounting for framing factor, not just nominal batt
  // R-value) doesn't exist yet; deliberately not guessing its shape by
  // adding project columns ahead of that design. For the PRIMARY exterior
  // wall type specifically - a house with mixed 2x4/2x6 framing still has
  // one dominant exterior assembly, which is what Manual J's envelope
  // model actually needs.
  exterior_wall_stud_size: ExtractedField<string>;
  exterior_wall_stud_spacing_in: ExtractedField<number>;
  exterior_wall_sheathing: ExtractedField<string>;
  exterior_wall_exterior_finish: ExtractedField<string>;
  // Phase 2, item 10. Cross-check only, never applied anywhere - lets a
  // human confirm the per-room duct_insulation_r_value fallback default
  // (see DUCT_FALLBACK_R_VALUE below) against what the mechanical plan's
  // own HVAC notes actually specify for this project, rather than trusting
  // the fallback blind. Feeds Manual D indirectly, as a sanity check, not
  // a direct input.
  duct_insulation_spec: ExtractedField<string>;
  duct_minimum_diameter_in: ExtractedField<number>;
  // Phase 2, item 11. Cross-check only - confirms (or contradicts) the
  // attic-routing assumption baked into DUCT_FALLBACK_LOCATION below.
  // A short description (e.g. "attic-routed"), not a structured location
  // per unit - the mechanical plan rarely gives more than that for
  // Manual J/D purposes.
  hvac_equipment_location: ExtractedField<string>;
};

export type ExtractedRoom = {
  name: string;
  floor_area_sqft: number | null;
  wall_north_len_ft: number | null;
  wall_south_len_ft: number | null;
  wall_east_len_ft: number | null;
  wall_west_len_ft: number | null;
  // Building-orientation-driven wall auto-population: real, drawable
  // wall-position data even when no true-north marker exists on the
  // drawing - see EXTRACTION_PROMPT STEP 2's "standing outside facing the
  // front entry" convention (must match lib/orientation.ts's transform
  // exactly) and migration 20260812094002_add_building_orientation.sql.
  // Only ever populated when the compass fields above are null (the
  // no-orientation-detected case) - never both at once for the same room.
  wall_front_len_ft: number | null;
  wall_rear_len_ft: number | null;
  wall_left_len_ft: number | null;
  wall_right_len_ft: number | null;
  // Diagnosed 2026-08-16 against Kinsela, known-orientation case
  // specifically (see KnownBuildingOrientation below): asking the model
  // to derive AND state which compass pair a room's page-horizontal vs
  // page-vertical dimension belongs to - a rotation computation - failed
  // three rounds in a row in three different ways (freehand per-room
  // reasoning was inconsistent; a stated-once-per-sheet "rule sentence"
  // was self-consistent but inverted). The common thread: rotation
  // arithmetic is exactly the kind of thing code does deterministically
  // and correctly every time, and the model kept getting it wrong even
  // when explicitly told to treat it as a lookup rather than fresh
  // reasoning. These two fields are the model's actual remaining job in
  // that case - a plain VISUAL read of which of a room's two printed
  // dimensions runs left-right vs top-to-bottom on the page, zero
  // compass judgment involved - and computeCompassWallLengthsFromPageAxes
  // below (not the model) converts them into wall_north/south/east/
  // west_len_ft above, using ExtractedSheet.frontAnchorPageEdge and the
  // confirmed KnownBuildingOrientation. Only ever populated in the
  // known-orientation case; left null otherwise (mirrors the
  // wall_front/rear/left/right split above - always present on the
  // type, branch-specific in practice).
  wall_page_horizontal_len_ft: number | null;
  wall_page_vertical_len_ft: number | null;
  // Same compass/drawing-relative split as the wall_* fields above, same
  // reason (STEP 2 below), applied to window glazing area instead of wall
  // length - see migration 20260813030300_add_window_drawing_relative_area.sql.
  // Only ever populated when a window opening is actually visible on this
  // room's wall in the floor plan AND a height reference (schedule, spec
  // note) lets the model turn that opening into an area - see STEP 4's
  // "don't guess" rule, same standard as duct routing.
  window_north_area_sqft: number | null;
  window_south_area_sqft: number | null;
  window_east_area_sqft: number | null;
  window_west_area_sqft: number | null;
  window_front_area_sqft: number | null;
  window_rear_area_sqft: number | null;
  window_left_area_sqft: number | null;
  window_right_area_sqft: number | null;
  window_count: number | null;
  // Diagnosed 2026-08-23: the fields above (window_count, window_*_area_sqft)
  // and STEP 4's "don't guess" rule correctly leave window AREA null very
  // often (most floor plans have no window schedule/labeled sizes) - but
  // that null was structurally indistinguishable from "this room genuinely
  // has no windows," and the only place window uncertainty ever showed up
  // was buried inside the room's single bundled "reason" string alongside
  // unrelated facts (floor area, wall-orientation guesses), resolved by one
  // Accept/Override that never touched window_*_area_sqft at all - a real
  // room could end up "resolved" with every window field still null. This
  // mirrors duct_location/duct_insulation_r_value below exactly (the same
  // "give it its own resolvable field instead of burying it in prose"
  // pattern, already proven out for ducts) rather than inventing a new
  // mechanism. value: true = the model found visual evidence of a window
  // opening on at least one side of this room (area may still be
  // unresolved separately - see STEP 4); false = the model positively
  // confirmed no window openings are drawn on any side (a real signal now,
  // not an absence of one); null = couldn't tell either way. unresolved
  // should be true whenever value is null OR true-with-area-still-missing;
  // false only when value is a confirmed true-with-area or a confirmed
  // false with no visible ambiguity.
  windows: ExtractedField<boolean>;
  door_count: number | null;
  unresolved: boolean;
  reason: string | null;
  // Section 2 gap-closure spec. Filled by the model when duct routing is
  // visibly drawn (rare - most floor plans don't show ductwork); otherwise
  // left null here and filled by applyDuctFallbackDefaults below. Always
  // ends up marked unresolved (either by the model or by the fallback) -
  // see the extraction prompt: an AI guess or a construction-based default
  // are equally "not yet confirmed by a human" from an audit-trail
  // standpoint.
  duct_location: ExtractedField<string>;
  duct_insulation_r_value: ExtractedField<number>;
  duct_source: "ai_extracted" | "default" | null;
  duct_confidence: number | null;
  // Phase 2, item 3. Overrides ExtractedEnvelope.ceiling_height_ft's
  // building-wide default for THIS specific named room - only filled when
  // a cross-section, elevation, or the floor plan itself ties an explicit
  // height to this room that differs from the general figure (e.g.
  // "Bonus Room 9' ceiling" vs. a 10' main-floor default). Feeds
  // computeManualJ's per-room wall-area and volume calc directly, same
  // consumer as the building-wide default - see applyExtractedData in
  // manual-j-workflow.tsx, which will need to prefer this over the
  // envelope default when both exist. For a vaulted/sloped ceiling, this
  // is a plate-height approximation, not a true average - use the room's
  // own unresolved/reason (not a separate mechanism) to flag that, same
  // as any other AI estimate pending human confirmation.
  ceiling_height_ft: number | null;
  // Diagnosed 2026-08-14 against Kinsela's 3-Car Garage: the floor plan's
  // own room label ("10' CEILING") and an elevation's ceiling-elevation
  // callout ("CEILG GARAGE: +9'-0"", relative to the building's 0'-0"
  // datum) can describe the SAME room's ceiling height two structurally
  // different ways that don't actually agree - and asking the model to
  // notice that disagreement in prose failed twice in a row. This field
  // captures the SECOND candidate as its own number - ceiling elevation
  // minus that room's floor elevation relative to the same datum (a real
  // step-down/up, e.g. "4" STEP UP INTO HOUSE" on the foundation plan,
  // not assumed to be zero) - only when an elevation/section sheet
  // actually gives enough to compute it. flagRoomCeilingHeightConflicts
  // below then diffs this against ceiling_height_ft deterministically -
  // the model no longer has to correctly notice and narrate the
  // conflict itself, only supply both raw numbers when it has them.
  ceiling_height_ft_elevation_derived: number | null;
  // Diagnosed 2026-08-14: even after ceiling_height_ft_elevation_derived
  // above existed specifically to be diffed against ceiling_height_ft,
  // the model still didn't reliably report the floor plan's OWN room
  // label into ceiling_height_ft when it disagreed with the elevation -
  // on Kinsela's garage, it reported 9 into BOTH fields, silently
  // dropping the floor plan's real "10' CEILING" text. "Did the model
  // correctly notice and structure this" is exactly the kind of judgment
  // that's proven unreliable elsewhere in this file (see
  // flagWindowScheduleForVerification). This field sidesteps that by
  // asking for something far easier to get right: copy the room's
  // printed label text verbatim, no interpretation required.
  // extractCeilingHeightFromLabelText below then regexes it in code for
  // an explicit "N' CEILING"-shaped pattern, independent of whatever the
  // model decided to put in the structured ceiling_height_ft field -
  // turning "did the model notice the conflict" into "does the code
  // correctly parse text it can already see," the same reframing STEP 1's
  // sheet inventory already applies to source-of-truth tracking.
  room_label_text: string | null;
  // Phase 2 standing requirement (where a fact came from). Which sheet
  // this room's data was actually read from - useful when a project has
  // multiple floor-plan sheets (Kinsela has two: A1.1 main floor, A1.2
  // bonus room/second level) and a room name alone doesn't disambiguate.
  source_sheet: string | null;
};

export type ExtractedOrientation = {
  detected: boolean;
  description: string | null;
};

// Phase 3, item 2 (source authority hierarchy) - formalizes what was a
// binary hasReferenceOnlyDisclaimer flag into the real 3-tier hierarchy
// documents actually carry: a sealed/issued-for-construction sheet is
// more authoritative than an ordinary undesignated sheet, which is in
// turn more authoritative than one explicitly marked reference-only.
// "sealed_construction_document" requires actual evidence (a visible
// seal/stamp graphic, or explicit "ISSUED FOR CONSTRUCTION"-type
// language) - not inferred from a sheet merely looking detailed or
// official. Most sheets on a typical residential set (Kinsela included)
// will land on "unknown", which is the deliberately conservative
// default - see EXTRACTION_PROMPT's STEP 1 and "Other rules" for exactly
// how this drives conflict resolution.
export type ExtractedSheetSourceAuthority = "sealed_construction_document" | "reference_only" | "unknown";

// Phase 2 standing requirement (where a fact came from, and a check on
// whether it should be trusted at face value). Every sheet the model
// actually reviewed, by its title-block name/number - not just a source
// tag for individual facts (ExtractedField.source_sheet /
// ExtractedRoom.source_sheet reference these names), but also a built-in
// completeness signal: if this list doesn't match what a drawing set's
// own index/cover-sheet says it should contain, that's visible, not
// silent.
export type ExtractedSheet = {
  name: string;
  sourceAuthority: ExtractedSheetSourceAuthority;
  // Diagnosed 2026-08-14 against ceiling_insulation_r_value: giving the
  // model a sheets[]-vs-reason cross-check (verifyEnvelopeConflictDisclaimers
  // below) still didn't catch the real conflict, because the model's own
  // "reason" text simply never named the relevant peer sheet (A1.3) at
  // all - a lookup against sheets[] can only re-verify a sheet the reason
  // text actually mentions, not surface one it omitted. Same reframing as
  // room_label_text/extractCeilingHeightFromLabelText above: instead of
  // trusting the model's own narrative about which sheets disagree, ask
  // for a plain, mechanical per-sheet transcription (does THIS sheet have
  // a ceiling/attic/roof insulation R-value callout, and if so what does
  // it literally say) and let code build the comparison from that raw
  // data - see flagCeilingInsulationRValueConflicts below.
  ceiling_insulation_callout_text: string | null;
  // Phase 3, item 4 (version/revision awareness). The most recent
  // revision date/number printed in this sheet's own revision block or
  // title block (e.g. "REV 2 03/15/2026", "REVISION 3"), copied verbatim
  // - or null if the sheet shows no revision marking at all (the common
  // case for a set with no post-issuance changes). A plain per-sheet
  // transcription, same discipline as ceiling_insulation_callout_text
  // above - not a judgment about whether the set is current, just
  // reporting what's actually printed so DrawingExtraction.revisionConcern
  // below has real evidence to reason from instead of a vague impression.
  revisionDate: string | null;
  // A short note when this sheet shows a revision cloud (a hand-drawn or
  // printed cloud/bubble outlining a changed area), a "SUPERSEDED" or
  // "VOID" stamp, or any other visible indicator that this sheet's
  // content was changed after initial issuance - e.g. "revision cloud
  // around garage dimensions, no revision date visible nearby". Null
  // when the sheet shows no such indicator.
  revisionNote: string | null;
  // Diagnosed 2026-08-16 (see ExtractedRoom.wall_page_horizontal_len_ft's
  // comment for the full history): the ONLY thing the model still does
  // toward compass-orienting a room's walls, for the known-orientation
  // case, on a floor-plan sheet - locate the front entry/porch on THIS
  // sheet and report which page edge it's drawn at. A plain visual
  // observation (which edge of the printed sheet the anchor touches),
  // not a rotation computation - computeCompassWallLengthsFromPageAxes
  // below does the actual rotation math from this plus
  // KnownBuildingOrientation, deterministically. Any narrative
  // justification (e.g. confirming a second-floor sheet's rotation by
  // matching its stairwell/outline against the main floor plan) belongs
  // in "orientation.description" for human audit only - code never reads
  // that text, only this enum. Null when this sheet isn't a floor-plan
  // sheet, when the anchor isn't visible on it and its rotation can't be
  // confirmed by such alignment either, or whenever orientation wasn't
  // confirmed for this project at all. A null value alone is the
  // complete, actionable signal - no separate reason field needed here:
  // every room whose source_sheet points at a sheet with a null
  // frontAnchorPageEdge gets its compass wall fields left null too, by
  // computeCompassWallLengthsFromPageAxes below.
  frontAnchorPageEdge: "top" | "bottom" | "left" | "right" | null;
};

// Phase 2, item 6. Transcribed verbatim from the drawing's own window
// schedule table - reference-only, not applied anywhere. This is
// deliberately NOT yet correlated to which room uses which mark (that
// would need mark callouts on the floor plan itself, unverified as of
// this phase) - capturing the schedule table is step one; per-room/
// per-direction window area via mark correlation is a distinct, larger
// follow-up, not built here.
//
// unresolved/reason exist here for a different reason than everywhere
// else in this file: diagnosed 2026-08-14 against Kinsela's actual
// window schedule (a 12-row table, marks A-M) - across three extraction
// runs, per-row transcription (size/quantity/description, and initially
// even the mark format itself) was measurably unreliable on this dense a
// table, including one run that invented a sheet reference ("A4.0")
// nowhere in the source document. flagWindowScheduleForVerification below
// force-sets every entry's unresolved to true UNCONDITIONALLY,
// independent of the model's own confidence - this isn't a per-entry
// judgment call the model makes (contrast every other unresolved/reason
// pair in this file, which the MODEL decides); it's a standing, blanket
// low-confidence-by-construction status for this entire category, on
// every project, until table-transcription accuracy is separately proven
// reliable. Not applied to ExtractedDoorScheduleEntry below - the door
// schedule hasn't shown the same failure pattern, so it isn't tarred with
// the same blanket distrust without its own evidence.
export type ExtractedWindowScheduleEntry = {
  mark: string;
  size: string | null;
  description: string | null;
  quantity: number | null;
  unresolved: boolean;
  reason: string | null;
};

// Phase 2, item 7. Same shape and same reference-only status as the
// window schedule, kept as a separate type/array rather than a shared
// one - it's a semantically distinct schedule on the drawing (door marks
// and window marks aren't in the same namespace), and secondary in
// Manual J/D/S relevance (door type mainly affects infiltration/U-factor
// differentiation, e.g. an exterior glass-iron door vs. an interior
// masonite door - not currently consumed either).
export type ExtractedDoorScheduleEntry = {
  mark: string;
  size: string | null;
  description: string | null;
  quantity: number | null;
};

// Phase 2, item 8. Cross-check only, for Manual S: the original
// designer's own equipment assumption (tonnage/BTU per labeled unit),
// compared against whatever this app's own equipment-selection workflow
// computes - a large mismatch is a signal to double check the load calc,
// not something this data overrides. Kept as a SEPARATE array from
// ExtractedHvacZoningEntry below rather than merged, even though both
// come from the same mechanical-plan table and share the same unit
// `label` - equipment is reference-only forever (an original designer's
// tonnage guess isn't a fact to apply), while zoning (which sqft a unit
// serves) is a real candidate for future consumption informing how this
// app's own zones get grouped. Keeping the schema boundary in place now
// means that distinction doesn't have to be carved out of a merged
// structure later.
export type ExtractedHvacEquipmentEntry = {
  label: string;
  equipment_type: string | null;
  tonnage: number | null;
  cooling_btu: number | null;
  heating_type: string | null;
};

// Phase 2, item 9. Direct input (not yet consumed) - the original
// designer's own HVAC zone split (e.g. "Unit A serves 2005 sqft"). Not
// wired into this app's own zones concept in this phase - that's a
// behavioral decision (auto-creating/suggesting zones) distinct from
// capturing the fact, and not built here without being asked for
// explicitly.
export type ExtractedHvacZoningEntry = {
  label: string;
  serves_sqft: number | null;
};

// Phase 2, item 13. Cross-check only - lets a human compare this against
// the sum of extracted room floor areas without doing the arithmetic by
// hand. Transcribed from the drawing's own printed summary table (Main
// Living, porches, garage, etc.) when present.
export type ExtractedSquareFootageEntry = {
  label: string;
  sqft: number | null;
};

// Phase 2, item 12 (water heater) - narrowed from a flat cross-check to a
// conditional risk flag per direct instruction, generalized to work on
// any project nationwide, not tuned to what happens to be negligible on
// Kinsela specifically. See flagWaterHeaterLoadRisk below for the actual
// rule - this type only captures the raw, unjudged facts.
export type ExtractedWaterHeaterType =
  | "electric"
  | "gas-tankless"
  | "gas-tank"
  | "atmospheric-vent"
  | "power-vent"
  | "other";

export type ExtractedWaterHeaterLocation =
  | "conditioned-space"
  | "attic"
  | "garage"
  | "outside"
  | "other";

export type ExtractedWaterHeater = {
  type: ExtractedWaterHeaterType | null;
  fuel: string | null;
  location: ExtractedWaterHeaterLocation | null;
  unresolved: boolean;
  reason: string | null;
};

export type DrawingExtraction = {
  orientation: ExtractedOrientation;
  building_envelope: ExtractedEnvelope;
  rooms: ExtractedRoom[];
  // Phase 2 new top-level arrays. Optional, unlike rooms/building_envelope
  // above (which every extraction, old or new, already has) - extractions
  // stored before this phase genuinely don't have these keys at all, not
  // even as empty arrays, so treating them as always-present would be a
  // type-level lie about historical data. Any code reading these on a
  // DrawingExtraction that might be old (i.e. anything other than a
  // freshly-parsed API response) must default with `?? []`.
  sheets?: ExtractedSheet[];
  window_schedule?: ExtractedWindowScheduleEntry[];
  door_schedule?: ExtractedDoorScheduleEntry[];
  hvac_equipment?: ExtractedHvacEquipmentEntry[];
  hvac_zoning?: ExtractedHvacZoningEntry[];
  square_footage_summary?: ExtractedSquareFootageEntry[];
  water_heaters?: ExtractedWaterHeater[];
  // Phase 3, item 4 (version/revision awareness). Document-level,
  // conditional trigger only - same pattern as flagWaterHeaterLoadRisk's
  // "conditional risk flag, not a routine flat cross-check" design, not
  // something filled in by default on every project. Populated ONLY when
  // there's a specific, articulable reason (drawn from the per-sheet
  // revisionDate/revisionNote evidence in "sheets" above) to suspect the
  // uploaded set is not the latest revision - e.g. a general note or
  // sheet index references a change the actual plan doesn't show, or
  // sheets in the same set carry inconsistent revision dates suggesting
  // a stale mix. Most drawing sets will never trigger this - a clean set
  // with no revision markings at all is the normal, unremarkable case
  // and should leave this null, not prompt a guess.
  revisionConcern?: string | null;
};

export type DrawingExtractionStatus = "pending" | "completed" | "failed";

// The DB column only accepts these two literal values — the real MIME type
// lives on the storage object and the file_name extension, not here.
export type DrawingFileType = "pdf" | "image";

// Diagnostic detail persisted on a failed extraction (see app/api/drawings/
// extract/route.ts) - stop_reason distinguishes a truncated response
// (max_tokens ceiling hit mid-JSON) from a genuinely malformed one; the
// full raw_response is kept so a future failure never again requires
// manually reproducing the API call outside the app to see what actually
// happened.
export type DrawingExtractionError = {
  stop_reason: string | null;
  output_tokens: number | null;
  raw_response: string;
  diagnosed_at: string;
};

// Single source of truth for this exact sentence - EXTRACTION_PROMPT below
// asks the model to emit it verbatim, and
// lib/fieldResolutions.ts's roomHasUnresolvedWallOrientation matches
// against it to gate BuildingOrientationSection's auto-fill transform.
// Keeping these in sync as one string, rather than two copies, is the
// whole point - the gate is only as good as its ability to recognize the
// exact reason it's looking for.
export const WALL_ORIENTATION_UNRESOLVED_REASON =
  "front/rear/left/right wall assignment is a guess pending confirmation of which elevation is the true front entry - could be swapped with left/right";

export type DrawingRow = {
  id: string;
  file_name: string;
  file_type: DrawingFileType;
  extraction_status: DrawingExtractionStatus;
  extracted_data: DrawingExtraction | null;
  unresolved_items: string[] | null;
  applied_to_field_data: boolean;
  extraction_error: DrawingExtractionError | null;
  // SUMMIT-REPORT-STANDARD.md Section 5.9 - which page of this drawing (if
  // any) is the floor plan sheet to composite into the report. Null means
  // "not the floor plan drawing" - at most one drawing per project should
  // have this set (enforced in the app layer when setting it, not a DB
  // constraint).
  floor_plan_page_number: number | null;
};

export const DRAWING_COLUMNS =
  "id, file_name, file_type, extraction_status, extracted_data, unresolved_items, applied_to_field_data, extraction_error, floor_plan_page_number";

export const ACCEPTED_DRAWING_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
];

// Building-orientation-confirmed-before-extraction (moved earlier in the
// pipeline, diagnosed/built 2026-08-15): the project's technician now
// confirms building_front_faces BEFORE a drawing can even be uploaded
// (see components/building-orientation-gate.tsx), instead of after
// extraction the way it worked previously. When that confirmation
// exists and is a cardinal direction (the only kind the room schema's
// wall_north/south/east/west_len_ft columns can represent - see
// lib/constants/compass.ts's isCardinalCompass), route.ts resolves it
// via lib/orientation.ts's resolveOrientation() and passes it into
// buildExtractionPrompt below as GIVEN, CONFIRMED context - not
// something STEP 2 detects or STEP 3 guesses per room anymore for that
// run. This is deliberately narrow: it changes STEP 2/3's own text when
// present, nothing else in this file - see buildExtractionPrompt's own
// comment for exactly what does and doesn't change.
export type KnownBuildingOrientation = {
  front: "N" | "E" | "S" | "W";
  rear: "N" | "E" | "S" | "W";
  left: "N" | "E" | "S" | "W";
  right: "N" | "E" | "S" | "W";
};

function buildOrientationStep2(known: KnownBuildingOrientation | null): string {
  if (!known) {
    return `STEP 2 — Orientation. Look specifically for a north arrow, a compass rose, a site plan with a labeled north, or elevation sheets explicitly labeled by TRUE COMPASS DIRECTION (e.g. "North Elevation", "South Elevation"). Only these count as orientation detected. Elevation sheets labeled by RELATIVE position only — "Front Elevation", "Rear Elevation", "Left Elevation", "Right Elevation" (as this Kinsela-style sheet set uses) — do NOT establish true compass direction and must NOT be treated as orientation detected, even though they tell you the building's relative layout. Do not infer true north from which side faces the street, where the porch is, or any other indirect cue — these are not reliable and have caused incorrect compass inferences before. Set "orientation.detected" to whether you found a TRUE COMPASS marker as defined above (not a relative one), and "orientation.description" to a short note of what you found (e.g. "north arrow near title block") or null if none.`;
  }
  return `STEP 2 — Orientation: ALREADY CONFIRMED, do not detect or guess it. The project's technician has confirmed the building's true compass orientation directly - not inferred from this drawing: the front exterior elevation faces ${known.front}. Following the same "person standing outside facing the front entry" convention used elsewhere in this prompt, this means the rear elevation faces ${known.rear}; the side to that person's left hand faces ${known.left}; the side to their right hand faces ${known.right}. Treat this exactly as if a true compass marker were found on the drawing - do not re-derive it, do not second-guess it against an elevation sheet's own "FRONT ELEVATION"/"REAR ELEVATION"/etc. labels (those name that sheet's own relative view, not a compass direction, and are not more authoritative than this already-confirmed fact), and do not look for a north arrow. Set "orientation.detected": true, and "orientation.description" to note this was confirmed by the project's technician (the building orientation setting), not found on the drawing itself - e.g. "Compass orientation supplied by technician: front faces ${known.front}."`;
}

function buildOrientationStep3Branch(known: KnownBuildingOrientation | null): string {
  if (!known) {
    return `- If orientation WAS detected: estimate each room's wall_north_len_ft / wall_south_len_ft / wall_east_len_ft / wall_west_len_ft from the drawing's geometry relative to that orientation, and estimate door_count from the room's drawn openings. Leave wall_front_len_ft, wall_rear_len_ft, wall_left_len_ft, and wall_right_len_ft null in this case — they exist only for the no-orientation case below.
- If orientation was NOT detected, do BOTH (a) and (b) below for every room — they are two separate instructions, not alternatives:
  (a) Set wall_north_len_ft, wall_south_len_ft, wall_east_len_ft, and wall_west_len_ft to null. Do not guess which side of a room faces which TRUE COMPASS direction — an incorrect guess here silently corrupts solar gain calculations downstream.
  (b) REQUIRED, not optional: estimate wall_front_len_ft / wall_rear_len_ft / wall_left_len_ft / wall_right_len_ft for every room whose wall layout is visible in the floor plan. Only leave one of these four fields null when that room genuinely has no wall on that particular side (e.g. an interior room bordered by other rooms on 3 sides) or its position truly cannot be determined from anything in this sheet set — not out of general caution.
  Convention for front/rear/left/right (must be followed exactly, the whole feature depends on this): imagine a person standing OUTSIDE the building, FACING the front entry door (looking at the house, about to walk in — not exiting it). "Front" = the wall containing or facing the main entry, as seen by that person. "Rear" = the opposite wall. "Left" = the side on that person's left hand. "Right" = the side on that person's right hand.
  The four LENGTH values are ordinary floor-plan geometry — read them the same confident way you'd read wall_north_len_ft in the orientation-detected case. WHICH wall you call "front," however, is a genuine guess whenever there is no true-north marker (that's exactly why this branch exists) — an obvious main entry on the floor plan itself only tells you which facade this floor plan's own layout suggests is the front, not which physical wall is actually the front by any confirmable standard. Do not treat that identification as confident just because a label exists. Every room where you fill any of these four fields is unresolved for this reason, in addition to any other reason it may already have: set "unresolved": true and include, verbatim, the sentence "${WALL_ORIENTATION_UNRESOLVED_REASON}" in "reason" (append it after a " · " separator if the room already has a different reason for something else, e.g. an illegible label — do not replace that other reason, add to it). This is not a substitute for true compass exposure either way — a human still resolves that via the project's building orientation selector, same as before, but now also still needs to confirm the front-entry axis itself before that selector's rotation can be trusted.`;
  }
  return `- Orientation is known (see STEP 2 above - this is the "orientation WAS detected" case, treat it identically).
  This branch previously asked you to derive AND state a rotation rule (converting "which page edge is the front entry at" into "which compass pair does a page-horizontal vs page-vertical dimension belong to") - that rotation computation has now failed three rounds in a row in three different ways, even when explicitly framed as a lookup rather than fresh reasoning. Rotation arithmetic is exactly the kind of thing code gets right deterministically every time, so it has been moved out of your job entirely. Your job in this branch is now ONLY the two plain VISUAL observations below - zero compass reasoning, zero rotation math, zero deriving or stating any wall-length rule. A separate, deterministic step (not you) converts your two observations into wall_north_len_ft / wall_south_len_ft / wall_east_len_ft / wall_west_len_ft afterward.
  OBSERVATION A (ONCE per floor-plan sheet, before working any room drawn on it - not per room): locate the front exterior elevation/entry ON THE FLOOR PLAN ITSELF - a covered entry porch, the main entry door, a "FRONT PORCH"-style label, or similar visible feature - NOT from an elevation sheet's title (elevation sheet titles like "FRONT ELEVATION" describe that sheet's own view, not a compass direction, and have caused incorrect swaps before when treated as if they were the same thing). Then report WHICH PAGE EDGE it's drawn at - top, bottom, left, or right - in that sheet's own "frontAnchorPageEdge" field (in "sheets"). This is a plain visual observation (which edge of the printed sheet the porch/entry touches), nothing more - do not convert it to a compass direction, do not derive a wall-length rule from it, do not write anything about North/South/East/West in connection with this observation anywhere. If you find it useful for a human reader, you may still separately note in "orientation.description" which sheet the anchor was found on and which edge - but "frontAnchorPageEdge" is the field that actually gets used, and it takes only the four literal values "top"/"bottom"/"left"/"right".
  If the front anchor cannot be located on a given floor-plan sheet at all (not visible - e.g. a second-floor plan with no view of the ground-floor entry), check whether that sheet's rotation can still be confirmed by matching grid lines, wall alignment, or the overall building outline against a sheet where the anchor IS visible - if so, use the SAME page edge that sheet's anchor would fall on, and say so in "orientation.description" (e.g. "A1.2's building outline and stairwell align with A1.1, so treated as the same page rotation"). If it genuinely cannot be determined either way, leave that sheet's "frontAnchorPageEdge" null and do not guess - every room whose "source_sheet" points at a sheet with a null "frontAnchorPageEdge" will automatically get null compass wall fields, so nothing further is needed from you for those rooms.
  OBSERVATION B (PER ROOM): a room's printed dimensions give you two numbers (e.g. a label reading "13' X 14'", or two separate dimension lines). Report which one is measured running PAGE-HORIZONTAL (left-right on the sheet) into "wall_page_horizontal_len_ft", and which one is measured running PAGE-VERTICAL (top-to-bottom on the sheet) into "wall_page_vertical_len_ft" - this is a direct visual read of that room's own dimension lines/label (which number's extension lines run left-right vs top-to-bottom), not a compass determination and not a name for either field - just report the two numbers into the field matching their own drawn orientation on the page. Cite which is which briefly in "reason" (e.g. "13' runs page-horizontal, 14' runs page-vertical, per this room's own dimension lines") so a human reviewer can check your visual read without needing to also check any compass logic. Leave wall_north_len_ft, wall_south_len_ft, wall_east_len_ft, and wall_west_len_ft in this room entirely null yourself - do not compute or guess at them; that conversion happens downstream, not here.
  REQUIRED, not optional: two SEPARATE null-permissions, each independently scoped - do not let uncertainty in one suppress a result in the other:
  (a) OBSERVATION A failure (the anchor's page edge could not be determined for this sheet, per the fallback above) - "wall_page_horizontal_len_ft" and "wall_page_vertical_len_ft" may both be left null for every room on that sheet, since there is nothing to convert them into either way. This is the only condition that justifies leaving both null for a room.
  (b) OBSERVATION B difficulty (the anchor IS known, but this room's own two numbers, or which one runs horizontal vs vertical, are hard to read precisely) - this is NOT the same failure as (a) and must NOT use the same null-escape. Give your best estimate per the dimensional reconciliation hierarchy defined in "Other rules" below (a room's own printed "W x D" label, or even a scaled/geometric estimate off the general plan, is an acceptable, expected source - not a reason to omit the field), and set the room "unresolved": true with "reason" noting the value is approximate/estimated (append after the existing reason, don't replace it, if one is already there). Only leave one individual side's length null within an otherwise-resolved room when that side genuinely has no wall of its own there (e.g. open to an adjoining room) - never merely because the number was hard to read.
  Estimate door_count from the room's drawn openings. Leave wall_front_len_ft, wall_rear_len_ft, wall_left_len_ft, and wall_right_len_ft null - they exist only for the no-orientation case, which does not apply here since orientation is already known.`;
}

// Standing reminder for the WHOLE reading pass, not scoped to STEP 2/3 -
// spliced into the opening framing paragraph, before STEP 1 even begins,
// so the confirmed orientation is available context for every page the
// model reads (elevation sheets, wall sections, etc.), not something it
// only sees once it reaches the wall-orientation step deep into the
// prompt. Returns "" when null so buildExtractionPrompt's null-case
// output stays byte-for-byte identical to the prior static prompt (see
// its own comment) - the leading/trailing newlines below are what give
// the known-case text proper blank-line paragraph spacing once spliced
// in; they intentionally produce nothing when empty.
function buildOrientationPreamble(known: KnownBuildingOrientation | null): string {
  if (!known) return "";
  return `
Building orientation is already confirmed for this ENTIRE review, not just for the wall-orientation step below: the front exterior elevation faces ${known.front} - therefore the rear faces ${known.rear}, the left side (as seen by a person standing outside, facing the front entry) faces ${known.left}, and the right side faces ${known.right}. Treat this as established ground truth on every page you read, from here through the end of this document - never something to re-derive, second-guess, or infer independently from any single page's own content. In particular, an elevation sheet's own title ("FRONT ELEVATION", "REAR ELEVATION", "LEFT ELEVATION", "RIGHT ELEVATION", etc.) names that sheet's own relative view, not a compass direction - it must never be read as overriding, re-establishing, or casting doubt on this already-confirmed fact, no matter what sheet you're on or what step of this prompt you're currently working through. See STEP 2 and STEP 3 below for exactly how this applies to individual rooms' walls.
`;
}

// Fields the model is permitted to fill on Building Envelope. ACH50, occupants,
// and indoor design temps are deliberately excluded from the extraction prompt
// and schema below — those must always be entered by a human.
//
// knownOrientation (see KnownBuildingOrientation above): when provided,
// changes the opening preamble (via buildOrientationPreamble below, a
// standing reminder for the ENTIRE reading pass, not just one step) plus
// STEP 2 and STEP 3's orientation-branch text (via the two helpers
// above). Every other STEP, the "Other rules" conflict/certainty/
// dimensional-hierarchy sections, the JSON shape, and STEP 4's
// window-area split (which already just says "governed by the SAME
// orientation-detected/not-detected branch as STEP 3" without
// hardcoding which one) are untouched either way. When null (the
// previous, still-default behavior for any caller that hasn't confirmed
// orientation), the output is byte-for-byte identical to the prior
// static EXTRACTION_PROMPT.
export function buildExtractionPrompt(knownOrientation: KnownBuildingOrientation | null = null): string {
  return `You are reviewing a complete architectural drawing set - floor plans, elevations, cross sections, foundation plan, roof plan, electrical/mechanical/plumbing plans, schedules, cover sheet, and construction details - to help populate ACCA Manual J residential load calculations, Manual D duct design, and Manual S equipment selection.
${buildOrientationPreamble(knownOrientation)}
This document may have many pages of very different types. Review EVERY page before responding. Do not skip a page, or treat its content as irrelevant, because of what its sheet type usually contains - relevant facts have been found on pages a first guess would rule out (a cover sheet's general materials note, a wall-section detail between structural sheets, a mechanical plan's HVAC notes).

Reading discipline: read this drawing set as a structured technical document, not as plain text to OCR top-to-bottom. Recognize and use the symbolic structure professionals use to navigate it: keynote tags (a circled or boxed number/letter that references a keynote legend printed elsewhere on the sheet or set - look up what the legend entry actually says rather than treating the bare tag itself as the fact); grid lines (lettered/numbered reference lines used to pinpoint a location precisely - use them to confirm you're looking at the same physical location when cross-referencing between sheets, e.g. matching a detail callout back to where it applies on the floor plan); and section/detail callout markers (a circle or hexagon containing a detail number and a sheet reference, e.g. "4/A3.0", meaning "see detail 4 on sheet A3.0 for a closer, more precise view of this"). When you follow such a marker to find a value, that value came from a more precise, more authoritative source than a general overview plan - prefer it over a same-fact value read from a general plan, and note in "reason" that it came from a detail/section reference (e.g. "per detail 4/A3.0") so a human reviewer can see why it was preferred.

Explicitly out of scope - do not extract, calculate, or reason about any of the following, even when they appear on a sheet you are otherwise reading for HVAC-relevant content (e.g. ignore a structural beam callout printed on the same sheet as a duct routing note): structural load calculations or member sizing; electrical service/panel sizing; plumbing fixture-unit sizing; fire-rating, egress, or life-safety analysis; civil/site/grading work; accessibility (ADA) compliance. These are separate licensure and liability domains, not part of this task. If a sheet's primary content is one of these domains (e.g. a structural framing plan), still review it for any HVAC-relevant facts it may incidentally carry (an insulation callout, a duct chase note) - just don't report on, compute, or flag anything about the excluded domain itself.

Respond with STRICT JSON only — no markdown code fences, no commentary, nothing outside the JSON object. Match this exact shape:

{
  "orientation": {
    "detected": boolean,
    "description": string | null
  },
  "sheets": [
    { "name": string, "sourceAuthority": "sealed_construction_document" | "reference_only" | "unknown", "ceiling_insulation_callout_text": string | null, "revisionDate": string | null, "revisionNote": string | null, "frontAnchorPageEdge": "top" | "bottom" | "left" | "right" | null }
  ],
  "building_envelope": {
    "wall_insulation_r_value": { "value": number | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
    "ceiling_insulation_r_value": { "value": number | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
    "floor_insulation_r_value": { "value": number | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
    "window_type": { "value": string | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
    "window_count": { "value": number | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
    "foundation_type": { "value": string | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
    "ceiling_height_ft": { "value": number | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
    "attic_construction_type": { "value": "vented_unconditioned" | "sealed_conditioned" | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
    "exterior_wall_stud_size": { "value": string | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
    "exterior_wall_stud_spacing_in": { "value": number | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
    "exterior_wall_sheathing": { "value": string | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
    "exterior_wall_exterior_finish": { "value": string | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
    "duct_insulation_spec": { "value": string | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
    "duct_minimum_diameter_in": { "value": number | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
    "hvac_equipment_location": { "value": string | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null }
  },
  "rooms": [
    {
      "name": string,
      "floor_area_sqft": number | null,
      "wall_north_len_ft": number | null,
      "wall_south_len_ft": number | null,
      "wall_east_len_ft": number | null,
      "wall_west_len_ft": number | null,
      "wall_front_len_ft": number | null,
      "wall_rear_len_ft": number | null,
      "wall_left_len_ft": number | null,
      "wall_right_len_ft": number | null,
      "wall_page_horizontal_len_ft": number | null,
      "wall_page_vertical_len_ft": number | null,
      "window_north_area_sqft": number | null,
      "window_south_area_sqft": number | null,
      "window_east_area_sqft": number | null,
      "window_west_area_sqft": number | null,
      "window_front_area_sqft": number | null,
      "window_rear_area_sqft": number | null,
      "window_left_area_sqft": number | null,
      "window_right_area_sqft": number | null,
      "window_count": number | null,
      "windows": { "value": boolean | null, "unresolved": boolean, "reason": string | null, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
      "door_count": number | null,
      "ceiling_height_ft": number | null,
      "ceiling_height_ft_elevation_derived": number | null,
      "room_label_text": string | null,
      "source_sheet": string | null,
      "unresolved": boolean,
      "reason": string | null,
      "duct_location": { "value": string | null, "unresolved": boolean, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
      "duct_insulation_r_value": { "value": number | null, "unresolved": boolean, "certainty": "documented" | "calculated" | "inferred" | "assumed" | "unverified" | "conflict" | null },
      "duct_confidence": number | null
    }
  ],
  "window_schedule": [
    { "mark": string, "size": string | null, "description": string | null, "quantity": number | null }
  ],
  "door_schedule": [
    { "mark": string, "size": string | null, "description": string | null, "quantity": number | null }
  ],
  "hvac_equipment": [
    { "label": string, "equipment_type": string | null, "tonnage": number | null, "cooling_btu": number | null, "heating_type": string | null }
  ],
  "hvac_zoning": [
    { "label": string, "serves_sqft": number | null }
  ],
  "square_footage_summary": [
    { "label": string, "sqft": number | null }
  ],
  "water_heaters": [
    { "type": "electric" | "gas-tankless" | "gas-tank" | "atmospheric-vent" | "power-vent" | "other" | null, "fuel": string | null, "location": "conditioned-space" | "attic" | "garage" | "outside" | "other" | null, "unresolved": boolean, "reason": string | null }
  ],
  "revisionConcern": string | null
}

STEP 1 — Sheet inventory. Before extracting any specific field, note every sheet you actually reviewed. For each, add one entry to "sheets": "name" exactly as printed in its title block (e.g. "A1.1", "REF-2", "C.S"); "sourceAuthority" - exactly one of "sealed_construction_document", "reference_only", "unknown", determined in this order: first, set "reference_only" if the sheet carries language stating its content is "for reference only" or "may not correspond with the other sheets in this set" (or equivalent). Otherwise, set "sealed_construction_document" ONLY if the sheet shows an actual professional (engineer/architect) seal or stamp graphic, or explicit issuance language such as "ISSUED FOR CONSTRUCTION" or "APPROVED FOR CONSTRUCTION" - do not infer this from a sheet simply looking detailed, official, or complete; most sheets in a typical residential set will NOT qualify, and that's the expected, normal outcome, not a gap. Otherwise (the common case), set "unknown". This is a real authority hierarchy for resolving conflicts between sheets (sealed_construction_document > unknown > reference_only), not a cosmetic label - see "Other rules" below for exactly how it's used. Also set "ceiling_insulation_callout_text": the verbatim text of any note printed ON THIS SPECIFIC SHEET stating a ceiling, attic, or roof insulation R-value (e.g. "R-30 MIN. INSULATION", "R-38 (MIN.) INSULATION AT CEILING/ROOF") - copied exactly as printed, or null if this sheet has no such callout. This is a plain per-sheet transcription, not a judgment about which sheet is correct - report what THIS sheet says even if you already know another sheet says something different; a downstream check compares every sheet's own callout independently, so withholding or reconciling them yourself here defeats the purpose. Also set "revisionDate": the most recent revision date or revision number, copied verbatim, but ONLY from an actual revision-specific marking - a revision table/block (often literally labeled "REVISIONS", with rows like "REV | DATE | DESCRIPTION"), a numbered revision triangle or tag near a specific change, or equivalent - e.g. "REV 2 03/15/2026". Do NOT use the sheet's ordinary issue date, plot date, or "DATE:" field in the title block for this - that field exists on every sheet regardless of whether anything was ever revised, and is a different fact (when the set was first issued, not evidence of a later change). Leave "revisionDate" null whenever there is no distinct revision-specific marking, even though the sheet obviously still has an ordinary issue date - this is the normal, expected case for a set with no post-issuance changes, not a gap to explain. And "revisionNote": a short note if this sheet shows a revision cloud (a hand-drawn or printed cloud/bubble outlining a changed area), a "SUPERSEDED" or "VOID" stamp, or any other visible sign the content was changed after initial issuance - null if none. This list isn't just a record: every "source_sheet" you fill in below must name one of these exact sheets.

${buildOrientationStep2(knownOrientation)}

STEP 3 — Room geometry, conditioned on Step 2:
${buildOrientationStep3Branch(knownOrientation)}
- door_count does not depend on orientation and should still be estimated from the drawing's geometry (openings on room walls) even when orientation is not detected.
- For every room, set "source_sheet" to the floor-plan sheet (from your STEP 1 inventory) its geometry actually came from - useful when a project has more than one floor-plan sheet (e.g. a main floor and a second-level/bonus-room plan).
- For every room, also set "room_label_text" to ALL text printed on or near that room on the floor plan, copied verbatim - concatenate every distinct piece you find with " / " between them: the room name, its printed dimensions (e.g. "24'-10\" X 37'-4\""), and any ceiling height callout for that room (e.g. "10' CEILING") if one appears anywhere near the room, even when it sits as its own separate label a short distance from the room name rather than directly overlapping it (e.g. "3-CAR GARAGE / 10' CEILING / 24'-10\" X 37'-4\""). Do NOT report just the room name alone when other text - dimensions, a ceiling height label - is also printed near that room; a bare room name here silently discards information a downstream check depends on to catch ceiling-height conflicts, so treat this as a completeness requirement, not a best-effort summary. This is a plain transcription task, not a judgment call: do not summarize, interpret, or decide part of it is unimportant to omit; leave it null only if the room genuinely has no printed text of its own at all.

STEP 4 — Window area, per room, same north/south/east/west vs. front/rear/left/right split as STEP 3, governed by the SAME orientation-detected/not-detected branch (do not re-decide it here). This is a much harder read than wall length — most floor plans mark a window opening as a gap in the wall line with a width, but not a height, so only fill a side's window area when you can combine an actual opening on that room's wall (visible in the floor plan) with an actual height reference for that opening (a window schedule entry, a labeled window size like "3068" i.e. 3'-0" x 6'-8", or a spec note) - width times height. If a room clearly has a window on a given side but you have no way to size it, leave that side null rather than assume a typical size - this is the same "don't guess" standard as duct routing (STEP 8) and R-values, not an exception to it. It is expected and fine for most or all window area fields to come back null when a drawing doesn't include a window schedule or labeled sizes; a false area is worse than a missing one, since it would silently misstate solar gain rather than leave it visibly unresolved. When you do fill any window area for a room, set that room's "unresolved" to true with "reason" noting it's an AI-estimated window area pending confirmation (unless the room is already unresolved for another reason, in which case leave the existing reason as-is).

Also set this room's "windows" field, separately from the area fields above and from this room's own top-level "unresolved"/"reason" - this is a distinct, individually-resolvable fact, not a summary of the area work you just did: "value": true if you can see at least one window opening drawn on any side of this room in the floor plan (regardless of whether you could size it), "value": false if you specifically looked and this room has no window openings drawn on any side (a real, positive room type like an interior closet, hallway, or windowless bath - not a default), "value": null if the room's boundary or wall lines aren't clear enough in this sheet set to tell either way. Set "unresolved": false ONLY when "value" is false (confirmed no windows) or when "value" is true AND every side's window area was actually filled in above (not left null); set "unresolved": true in every other case - value is true but some/all area is still null, or value is null. Set "reason" whenever "unresolved" is true, naming specifically what's missing (e.g. "window visible on north wall, no height reference to size it" or "room boundary partially obscured by a callout, can't confirm any side is windowless"). Do not skip this field or leave it at its default - every room needs an explicit judgment here, the same standard as duct_location in STEP 8.

STEP 5 — Ceiling height. Two levels:
- Building-wide default: look for a plate height or ceiling height labeled on a wall section, a building section, an elevation, or a general note (e.g. "9'-0" PLATE HT.", "8' CEILINGS TYP."). Set "building_envelope.ceiling_height_ft" to that value only if it is actually labeled — do not infer a typical residential height. If the drawing labels different heights per story, use the ground-floor/primary living-area figure and set "unresolved": true.
- Per-room override, independent of the above: if the floor plan itself directly labels a SPECIFIC NAMED ROOM with its own ceiling height (e.g. "10' CEILING" printed on that room, a bonus room, garage, or vaulted room) that differs from the general figure, set that room's own "ceiling_height_ft" to that value - this overrides the building-wide default for that room only. For a vaulted or sloped ceiling, use the wall plate height as an approximation (not a true average), and set that room's "unresolved": true with "reason" noting the ceiling is vaulted and the height is an approximation (append after existing reason text, don't replace it). Leave a room's own "ceiling_height_ft" null when nothing room-specific is labeled on the floor plan - the building-wide default covers it downstream.
- Separately, elevation-derived candidate: if an elevation or section sheet gives a ceiling-elevation callout tied to a specific named room (e.g. "CEILG GARAGE: +9'-0"") AND that same sheet (or the foundation plan) gives enough to determine that room's floor elevation relative to the same datum (the building's "FIN. FLOOR ELEV: 0'-0"" reference, adjusted for any explicit step-up/step-down noted for that room - do not assume the step is zero, and do not assume it's some other value either; only use a step you can actually find labeled), compute ceiling elevation minus room floor elevation and set that room's "ceiling_height_ft_elevation_derived" to the result. Leave it null whenever this can't actually be computed from labeled numbers - do not estimate it from the floor-plan label instead, that defeats the purpose of having two independent candidates. Do not try to reconcile this against "ceiling_height_ft" yourself, and do not skip setting "ceiling_height_ft" just because this second value exists or disagrees with it - report both raw values; reconciling them is handled automatically downstream, not by you.

STEP 6 — Exterior wall assembly, building-wide. Look for a wall-section detail, a typical wall section, or a general materials note (often on a cover sheet or construction-details sheet) describing the PRIMARY exterior wall construction - the assembly most of the building's exterior walls actually use, not a single interior partition. Only fill a field when it is explicitly labeled: "exterior_wall_stud_size" (e.g. "2x6"), "exterior_wall_stud_spacing_in" (e.g. 16, from "16" O.C."), "exterior_wall_sheathing" (e.g. "1/2\" OSB"), "exterior_wall_exterior_finish" (e.g. "brick veneer", or multiple materials if the drawing shows a mix, e.g. "brick veneer, Hardie board and batten"). A house can have more than one exterior wall assembly (e.g. R-13 2x4 walls in addition to R-19 2x6 walls) - describe the DOMINANT one; do not average or invent a blend.

STEP 7 — Attic construction type, building-wide. Determine vented vs. sealed from what's actually drawn: continuous ridge vents, soffit vents, or gable vents shown on an elevation or roof plan mean "vented_unconditioned"; spray foam applied at the roof deck (rather than at the ceiling plane), or an explicit "sealed"/"conditioned attic" label, means "sealed_conditioned". Set "unresolved": true if you're inferring this from an indirect cue (e.g. insulation type alone) rather than an explicit vent or sealed callout.

STEP 8 — Duct routing, per room. Most floor plans do NOT show ductwork - only attempt this when you can actually see duct runs, supply/return grille symbols, a mechanical/section drawing, or an explicit duct callout for that room's area. If you can see it: set "duct_location" to EXACTLY ONE of these values (case-sensitive, no other text): ${DUCT_LOCATION_VALUES.map((v) => `"${v}"`).join(", ")} — use "Attic-Unconditioned" for a plain vented attic, "Attic-Conditioned" for a sealed/spray-foamed attic, "Basement-Unconditioned"/"Basement-Conditioned" the same way, "Conditioned-Space" for ducts run inside living space (e.g. a dropped soffit or interior chase), and "Exterior-Wall" for ducts run in an exterior wall cavity. Also set "duct_insulation_r_value" only if an R-value is actually labeled near the ductwork, "duct_confidence" to a 0-1 estimate of how sure you are, and "duct_location.unresolved"/"duct_insulation_r_value.unresolved" to true (a human still needs to confirm this — it's an AI read, not a certainty either way). If you cannot see duct routing for a room (the common case), leave "duct_location", "duct_insulation_r_value", and "duct_confidence" all null — do not guess, and never output a location outside the exact list above. A server-side fallback fills a construction-based default afterward; that is not your job.

STEP 9 — Duct specification, document-level (distinct from the per-room fields in STEP 8 - this is a general spec note, not tied to any one room). From the mechanical plan's HVAC notes, if present: "duct_insulation_spec" (e.g. "2\" fiberglass insulation"), "duct_minimum_diameter_in" (e.g. 8, from a note like "MIN. DUCT SIZE 8\" DIAMETER"). This is a cross-check value only, used to sanity-check the app's own duct-insulation default - only fill it if the mechanical plan states it explicitly.

STEP 10 — HVAC equipment and zoning, from the mechanical plan's HVAC notes. If the plan lists individual units by a label (e.g. "A/C Unit 'A'", "Unit B"), add one entry per unit to BOTH "hvac_equipment" and "hvac_zoning", using the SAME "label" in both (e.g. "A") so they can be matched up later. In "hvac_equipment": "equipment_type" (e.g. "A/C condensing unit + gas furnace"), "tonnage", "cooling_btu", "heating_type" (e.g. "gas furnace") - only what's explicitly stated. In "hvac_zoning": "serves_sqft" if the plan states which square footage that unit serves (e.g. "Unit A serves 2005 SQ FT") - leave null if not stated. This is a cross-check against the app's own equipment selection, not something to compute or infer. If the plan explicitly disclaims the HVAC layout as schematic or non-final, still record what's shown - that disclaimer doesn't mean skip it, it means the human reviewing this cross-check should weigh it accordingly.

STEP 11 — HVAC equipment location, document-level. A short description of where air handlers and condensing units are located or routed (e.g. "attic-routed", "air handlers in attic, condensers roof-mounted") - used only as a cross-check against the per-room duct-routing default from STEP 8. Set "hvac_equipment_location".

STEP 12 — Window schedule. If the drawing set includes a window schedule table, transcribe it verbatim into "window_schedule": one entry per row, with "mark", "size" (as printed, e.g. "3'0\" X 7'0\""), "description", and "quantity". Read the MARK column of THIS specific table and transcribe exactly what character is printed for each row - window schedule marks are conventionally LETTERS (A, B, C..., typically skipping "I" to avoid confusion with the numeral "1"), while a DOOR SCHEDULE elsewhere on the same sheet conventionally uses NUMBERS (1, 2, 3...) - these are two different tables with two different marking conventions on the same page, and neither the door schedule's numbering nor any other numbered callout on the sheet (room reference circles, detail markers) belongs in the window schedule's mark column. If a description references another sheet (e.g. "SEE SHEET A2.0"), transcribe that reference exactly as printed, character by character - never substitute, round, or "correct" a sheet number to one that looks more familiar from your STEP 1 inventory, even if the printed one seems unexpected; report it exactly as drawn, not as a guess. Do not invent a mark that isn't in the table, and do not attempt to determine which room uses which mark - that correlation is not part of this extraction.

STEP 13 — Door schedule. Same treatment as STEP 12, into "door_schedule", if a door schedule table is present.

STEP 14 — Square footage summary. If the drawing set includes its own printed summary table of square footage by area (e.g. "Main Living", "Front Porch", "3-Car Garage", "Total"), transcribe it into "square_footage_summary": one entry per row, with "label" (as printed) and "sqft". This is a cross-check against summed room floor areas, not a value applied anywhere.

STEP 15 — Water heater(s). For each water heater shown (there may be more than one), add an entry to "water_heaters" with: "type" - exactly one of "electric", "gas-tankless", "gas-tank", "atmospheric-vent", "power-vent", "other" (use the venting method if that's what's labeled, e.g. "atmospheric-vent", rather than guessing a specific product type); "fuel" (e.g. "natural gas", "electric", "propane"); "location" - exactly one of "conditioned-space", "attic", "garage", "outside", "other", based on where it's actually drawn or labeled, not assumed. Only fill a field when confidently determinable; if the type or location genuinely can't be determined, leave it null and set that entry's "unresolved": true with a "reason" explaining what's missing. Do NOT attempt to judge whether this water heater matters for the load calculation - that judgment happens automatically, downstream, from the type/location facts you provide here. Your job is only to report what's actually drawn, not to compute significance.

Other rules:
- Only fill an insulation R-value if it is visibly labeled on the drawing (e.g. "R-19 batt", "R-38 ceiling"). Do not infer a code-minimum or typical value — leave it null instead.
- Provenance: for every building_envelope field, and for every room's "source_sheet" (STEP 3) and per-room "ceiling_height_ft" override (STEP 5), set "source_sheet" to the sheet (from your STEP 1 inventory) the value actually came from.
- Conflicts across sheets (building_envelope fields only - a room's own ceiling height has its own dedicated two-candidate mechanism in STEP 5, do not also apply this section to "ceiling_height_ft"/"ceiling_height_ft_elevation_derived", that would be redundant effort covering the same ground twice). Governed by the source authority hierarchy from STEP 1: sealed_construction_document > unknown > reference_only. Four cases, handled differently:
  - Single-sourced from a reference_only sheet: if a fact's ONLY source is a sheet you marked "sourceAuthority": "reference_only" in STEP 1, with no other sheet mentioning it at all, mark it unresolved regardless of how clearly labeled it looks there, with a reason noting it's single-sourced from a reference-only sheet.
  - reference_only sheet vs. a higher-tier sheet (a real hierarchy, not a guess): if the ONLY disagreement on a fact is between a reference_only sheet and a sheet that is "unknown" or "sealed_construction_document", the higher-tier sheet's value may be used - the source documents themselves flagged the reference_only sheet as less authoritative, so preferring the other isn't arbitrary. Still record the reference_only sheet's differing value in "reason". Before applying this hierarchy, you MUST check whether the reference_only sheet's value ALSO appears, independently, on some OTHER sheet that isn't reference_only - a value is not "just the reference_only sheet's value" merely because that's where you happened to notice it first. If it does turn up on another non-reference_only sheet too, this is actually the peer-conflict case below, not this one, even though a reference_only sheet is also involved.
  - sealed_construction_document vs. unknown (same hierarchy, one tier up): if the ONLY disagreement on a fact is between a sheet marked "sealed_construction_document" and a sheet marked "unknown", the sealed sheet's value may be used - it's the more authoritative source by explicit evidence (a seal or issuance language), not a guess. Still record the "unknown" sheet's differing value in "reason". This case will be rare in practice, since most sheets land on "unknown" - do not force a sheet into "sealed_construction_document" just to make this case apply.
  - Peer conflict - two or more sheets AT THE SAME TIER (both sealed_construction_document, or both unknown) disagree with each other: this is the case that must NOT be silently resolved, because there is no principled way to prefer one equally-authoritative source over another. Leave "value" null and set "unresolved": true, with "reason" stating BOTH (or all) values found and which sheet each came from. The goal is for a human, ideally someone who can field-verify on site, to make the final call - not for the system to guess and hide the disagreement behind one confident-looking number.
- Dimensional reconciliation hierarchy (orthogonal to the source authority hierarchy above - that one is about WHICH SHEET a value is on, this one is about WHAT KIND of dimension it is, independent of sheet). When two sources give a different number for the same measurement, prefer in this order: (1) a written dimension - an explicit number with its own dimension/extension lines directly labeling that exact span; (2) a detail dimension - a written dimension found specifically within a detail or section callout view (see "Reading discipline" above - this is exactly the kind of value following a detail marker gets you); (3) a schedule dimension - a value from a schedule table (window schedule, door schedule, square footage summary); (4) a general plan dimension - a written overall/summary dimension on a general overview sheet, less precise than a detail but still an explicit printed number; (5) a scaled/geometric estimate - reading a room's approximate proportions directly off the drawing at its stated scale, the last resort, used only when nothing higher on this list exists for that measurement. This isn't a new field to fill - it's the same kind of estimate STEP 3 already asks for when a wall's length isn't explicitly dimensioned; this hierarchy just tells you which candidate wins when more than one is available for the same measurement. When you resolve a conflict this way, state in "reason" which tier won and why (e.g. "written dimension 12'-6\" on the floor plan preferred over the general summary total, which implied ~13'"), same discipline as the source authority hierarchy's reason requirement. The two hierarchies can both apply to the same fact - when they point in different directions (e.g. a higher-tier dimension sits on a lower-authority sheet), treat it as a genuine conflict and lean toward leaving it unresolved with both readings reported, rather than picking one hierarchy to arbitrarily break the tie.
- Certainty classification ("certainty", on every building_envelope field and each room's "duct_location"/"duct_insulation_r_value" - richer than "unresolved" alone, which only says whether a human needs to act, not why). Set it to exactly one of:
  - "documented": an explicit, clearly-printed number or callout directly labels this value (e.g. "R-38 BLOWN INSULATION" printed on the drawing) - a written or detail dimension per the hierarchy above, or an unambiguous callout. Typically pairs with "unresolved": false.
  - "calculated": derived via arithmetic from other documented values on the drawing (e.g. floor area computed from two documented room dimensions). Typically pairs with "unresolved": false, unless one of the inputs it depends on is itself uncertain.
  - "inferred": determined from an indirect cue rather than an explicit label (e.g. attic_construction_type read from a vent symbol rather than an explicit "vented" callout - see STEP 7). Always pairs with "unresolved": true.
  - "assumed": no usable evidence exists in the drawing at all for this value. The model itself should rarely if ever set this - "don't guess" already means leaving a field null instead of assuming a code-minimum or typical value (see "Other rules" above on insulation R-values). This value exists primarily for values a downstream process fills with a construction-based default when the drawing shows nothing - always pairs with "unresolved": true.
  - "unverified": you found a plausible value but have real doubt about it (illegible text, an ambiguous symbol, single-sourced with nothing to cross-check against) - not a clean conflict between two clear sources, just genuine uncertainty about the one source you have. Always pairs with "unresolved": true.
  - "conflict": two or more sources disagree and could not be reconciled by the source authority or dimensional reconciliation hierarchies above (the peer-conflict case in either hierarchy). Always pairs with "unresolved": true, and "value" is typically null.
  Leave "certainty" null only if you are not confident classifying it into one of these six - do not force a fit.
- window_count and door_count are simple counts, not areas.
- Set "unresolved": true on the building envelope object, or on any individual room, whenever the drawing is ambiguous, illegible, or you are guessing rather than reading a clearly labeled figure. Whenever you set "unresolved": true on a room, always fill "reason" with a short, specific explanation a field technician can act on (e.g. "no orientation marker - exposure cannot be determined", "room label illegible", "floor area not dimensioned"). Leave "reason" null only when "unresolved" is false.
- Do not invent room names if none are labeled — use a generic label like "Room 1" and mark it unresolved with an appropriate reason.
- Revision concern ("revisionConcern", document-level, conditional): after reviewing every sheet's "revisionDate"/"revisionNote" from STEP 1, set this ONLY when you have a SPECIFIC, articulable reason to suspect the uploaded set is not the latest revision - e.g. a general note, sheet index, or one sheet's own revision block references a change (a room addition, a dimension change, a note explicitly saying "see rev. 3") that the actual plan sheets in THIS upload do not show; or sheets in the same set carry meaningfully inconsistent revision dates suggesting a stale mix rather than a single coherent issuance. State specifically what you found and why it's concerning. Leave this null in the ordinary case - a clean set with consistent or no revision markings at all is normal and unremarkable, not evidence of a problem; do not speculate or flag this "just in case."
- Never include ACH50, occupant count, or indoor design temperatures anywhere in your output. Those values are never extracted from drawings and must always be entered manually by the estimator.
- Output ONLY the JSON object described above.`;
}

export function collectUnresolvedItems(extraction: DrawingExtraction): string[] {
  const items: string[] = [];

  if (!extraction.orientation?.detected) {
    items.push(
      "orientation: no north arrow or orientation indicator found on drawing - room wall exposure left blank",
    );
  }

  const envelope = extraction.building_envelope;
  (Object.keys(envelope) as (keyof ExtractedEnvelope)[]).forEach((key) => {
    if (envelope[key]?.unresolved) items.push(`building_envelope.${key}`);
  });

  extraction.rooms.forEach((room, index) => {
    if (room.unresolved) {
      const label = `room[${index}]:${room.name || "unnamed"}`;
      items.push(room.reason ? `${label} - ${room.reason}` : label);
    }
    if (room.duct_location?.unresolved) {
      items.push(`room[${index}].duct_location:${room.name || "unnamed"}`);
    }
    if (room.duct_insulation_r_value?.unresolved) {
      items.push(`room[${index}].duct_insulation_r_value:${room.name || "unnamed"}`);
    }
    if (room.windows?.unresolved) {
      const label = `room[${index}].windows:${room.name || "unnamed"}`;
      items.push(room.windows.reason ? `${label} - ${room.windows.reason}` : label);
    }
  });

  // `?? []` here (unlike rooms/building_envelope above, which every
  // extraction already has): this function is only ever called on a
  // freshly-parsed API response in practice (see route.ts), which will
  // always have this key once EXTRACTION_PROMPT asks for it - but the
  // type is optional for historical data's sake (see DrawingExtraction),
  // and this function shouldn't silently start assuming a caller only
  // ever hands it fresh data.
  (extraction.water_heaters ?? []).forEach((wh, index) => {
    if (wh.unresolved) {
      const label = `water_heaters[${index}]:${wh.type ?? "unspecified type"}`;
      items.push(wh.reason ? `${label} - ${wh.reason}` : label);
    }
  });

  // One summary item, not one per row: every window_schedule entry is
  // unconditionally unresolved by construction (see
  // flagWindowScheduleForVerification), so N near-identical per-row items
  // here would just be noise - unlike rooms/water_heaters above, where
  // unresolved is a genuine per-item judgment worth surfacing
  // individually, this is a single standing category-level caveat.
  const windowScheduleEntries = extraction.window_schedule ?? [];
  if (windowScheduleEntries.length > 0) {
    items.push(
      `window_schedule: ${windowScheduleEntries.length} entries need verification against the source drawing - table-transcription accuracy not yet proven reliable`,
    );
  }

  // Phase 3, item 4. Conditional by construction (see EXTRACTION_PROMPT's
  // "Other rules") - the model only ever populates this when it found
  // specific evidence of a possible stale revision, so its mere presence
  // here (not a count, since there's only ever one) is itself the signal.
  if (extraction.revisionConcern) {
    items.push(`revision concern: ${extraction.revisionConcern}`);
  }

  return items;
}

// Section 2 gap-closure spec: "many floor plans don't show ductwork" (the
// model is instructed to leave duct_location null rather than guess in
// that case - see EXTRACTION_PROMPT STEP 3). This fills a
// construction-based default for any room the model left blank, always
// marked unresolved (a default is still not human-confirmed).
//
// Deliberately uniform across every room (Attic-Unconditioned, R-8) rather
// than branching per room by foundation type: this app has no reliable
// per-room "is this room under an unconditioned attic vs. over a
// crawlspace" signal at extraction time (rooms don't have their own
// extracted ceiling/foundation classification, and a home's foundation
// type doesn't reliably determine duct routing per room - a crawlspace
// foundation doesn't preclude attic-routed trunk lines). R-8 was
// confirmed by the user despite current IECC 2021 SS403.3.1 technically
// setting the zone-1/2 attic minimum at R-6 - see migration
// 20260810210059_add_ducts.sql for the full reasoning. This is a narrower
// fallback than the original spec's location-branching description -
// flagged here rather than silently building a per-room signal that
// doesn't actually exist in this pipeline.
// Diagnosed 2026-08-16 against Kinsela, known-orientation case (see
// ExtractedRoom.wall_page_horizontal_len_ft's comment for the full
// three-round history): converting "which page edge is the front
// anchor at" into "which compass pair does a page-horizontal vs
// page-vertical room dimension belong to" is pure rotation arithmetic,
// and asking the model to do that conversion - even framed explicitly
// as a fixed lookup rather than fresh reasoning - produced a
// self-consistent but INVERTED result across every room in the one
// real run that tried it. This function does that conversion instead,
// in code, from ExtractedSheet.frontAnchorPageEdge (the model's one
// remaining visual observation, once per sheet) and each room's
// wall_page_horizontal_len_ft / wall_page_vertical_len_ft (the model's
// other remaining visual observation, once per room) - the ONLY thing
// that ever writes wall_north/south/east/west_len_ft in the
// known-orientation case. Any value the model wrote directly into those
// four fields itself is unconditionally overwritten here, never
// trusted or merged - the whole point of this split is that the
// rotation math no longer comes from freehand model output at all.
//
// Geometry: a wall drawn as a horizontal line segment on the page (a
// room's top or bottom wall, as drawn) spans that room's page-horizontal
// extent, so its length equals the room's page-horizontal dimension -
// regardless of which compass direction that wall actually faces. That
// wall faces whichever compass direction occupies the page-top/
// page-bottom edges. Front and rear are always a compass-opposite pair
// (180° apart), and so are left and right - and opposite compass
// directions always land on opposite page edges under a pure rotation
// (never a mirror) - so {front,rear} occupies EITHER {page-top,
// page-bottom} OR {page-left,page-right} as a whole pair, never split
// across both, and {left,right} occupies whichever pair {front,rear}
// doesn't. Which of those two pairs is actually {north,south} vs.
// {east,west} depends only on which compass letter "front" is - this
// function checks that directly (known.front) rather than assuming
// front/rear is always the east/west pair, since that's specific to
// Kinsela (front=W) and would be wrong for a future project whose front
// faces north or south.
export function computeCompassWallLengthsFromPageAxes(
  extraction: DrawingExtraction,
  known: KnownBuildingOrientation,
): DrawingExtraction {
  const sheetAnchorEdge = new Map(
    (extraction.sheets ?? []).map((sheet) => [sheet.name, sheet.frontAnchorPageEdge] as const),
  );
  const frontRearIsNorthSouth = known.front === "N" || known.front === "S";

  const rooms = extraction.rooms.map((room) => {
    const anchorEdge = room.source_sheet ? sheetAnchorEdge.get(room.source_sheet) : undefined;
    if (!anchorEdge) {
      // The model's OBSERVATION A failed for this room's sheet (or the
      // room has no source_sheet at all) - nothing to convert, no
      // compass fields to compute. See ExtractedSheet.frontAnchorPageEdge's
      // comment: a null value here is the complete signal, by design.
      return {
        ...room,
        wall_north_len_ft: null,
        wall_south_len_ft: null,
        wall_east_len_ft: null,
        wall_west_len_ft: null,
      };
    }

    const frontRearAtTopBottom = anchorEdge === "top" || anchorEdge === "bottom";
    const frontRearLen = frontRearAtTopBottom
      ? room.wall_page_horizontal_len_ft
      : room.wall_page_vertical_len_ft;
    const leftRightLen = frontRearAtTopBottom
      ? room.wall_page_vertical_len_ft
      : room.wall_page_horizontal_len_ft;

    const northSouthLen = frontRearIsNorthSouth ? frontRearLen : leftRightLen;
    const eastWestLen = frontRearIsNorthSouth ? leftRightLen : frontRearLen;

    return {
      ...room,
      wall_north_len_ft: northSouthLen,
      wall_south_len_ft: northSouthLen,
      wall_east_len_ft: eastWestLen,
      wall_west_len_ft: eastWestLen,
    };
  });

  return { ...extraction, rooms };
}

const DUCT_FALLBACK_LOCATION = "Attic-Unconditioned";
const DUCT_FALLBACK_R_VALUE = 8;

export function applyDuctFallbackDefaults(extraction: DrawingExtraction): DrawingExtraction {
  return {
    ...extraction,
    rooms: extraction.rooms.map((room) => {
      // Safety net: even with EXTRACTION_PROMPT now listing exact enum
      // values, the model's duct_location is still free-text-derived and
      // can drift back to something like "attic" instead of
      // "Attic-Unconditioned". Normalizing (or dropping to null if
      // unmappable) here means a bad value never reaches the DB, where it
      // would trip rooms_duct_location_check and fail the whole room-
      // insert batch, not just this one room's duct field.
      const normalizedLocation = normalizeDuctLocation(room.duct_location?.value);
      // The model's own JSON output never sets duct_source (it isn't part
      // of what we ask it to return) - this is where that provenance tag
      // actually gets assigned, based on whether the model found something.
      if (normalizedLocation) {
        return {
          ...room,
          duct_location: { ...room.duct_location, value: normalizedLocation },
          duct_source: "ai_extracted" as const,
        };
      }
      return {
        ...room,
        // certainty: "assumed" here is exactly the case that value exists
        // for (see EXTRACTION_PROMPT's certainty classification bullet) -
        // no drawing evidence at all, filled from a construction-based
        // default. The model itself is instructed never to set "assumed"
        // on its own output; this is where it actually gets applied.
        duct_location: { value: DUCT_FALLBACK_LOCATION, unresolved: true, certainty: "assumed" },
        duct_insulation_r_value: { value: DUCT_FALLBACK_R_VALUE, unresolved: true, certainty: "assumed" },
        duct_source: "default" as const,
        duct_confidence: null,
      };
    }),
  };
}

// Phase 2, item 12 (water heater). Deterministic, not left to the model's
// judgment at generation time - same reasoning as
// applyDuctFallbackDefaults above: a boolean over two categorical values
// should never be a coin flip when code can get it right every time.
//
// Water heaters generally have zero/negligible Manual J impact - electric
// units, sealed-combustion/power-vent gas units, and anything outside the
// conditioned envelope don't meaningfully affect sensible/latent load.
// The one combination with a real (if small) contribution is an
// atmospheric-vent or standard-tank gas unit INSIDE conditioned space -
// standby jacket heat loss and combustion moisture. This must generalize
// across every project, not assume the negligible case by default the
// way it would be tempting to after seeing it on Kinsela (both water
// heaters there are gas-tankless, in the attic - outside this rule's
// trigger condition entirely, which is the correct outcome for that
// project, not a special case carved out for it).
const WATER_HEATER_RISK_TYPES = new Set<ExtractedWaterHeaterType>(["gas-tank", "atmospheric-vent"]);

export function flagWaterHeaterLoadRisk(extraction: DrawingExtraction): DrawingExtraction {
  return {
    ...extraction,
    water_heaters: (extraction.water_heaters ?? []).map((wh) => {
      const risky =
        wh.type != null &&
        WATER_HEATER_RISK_TYPES.has(wh.type) &&
        wh.location === "conditioned-space";
      if (!risky) return wh;
      return {
        ...wh,
        unresolved: true,
        reason: `${wh.type} water heater in conditioned space - potential minor internal sensible/latent gain from standby jacket loss and combustion moisture. Consider a small internal gain allowance.`,
      };
    }),
  };
}

// Diagnosed 2026-08-14 against Kinsela's 3-Car Garage: the floor plan's own
// room label (10' CEILING) and an elevation's ceiling-elevation callout
// (CEILG GARAGE: +9'-0", which only reconciles to ~9'-4" once the real 4"
// step-down from the foundation plan is applied - not 10') can disagree by
// a real, non-trivial amount for the same room. Prompt-only fixes asking
// the model to notice and narrate this failed twice in a row - same
// reasoning as flagWaterHeaterLoadRisk above: a numeric comparison should
// never depend on the model getting the narration right when code can
// just diff the two numbers it already asked for (see
// ceiling_height_ft_elevation_derived's own comment on ExtractedRoom).
//
// A tolerance, not exact equality, because architectural dimensions round
// to the nearest labeled increment on two independently-drawn sheets - a
// 9'-6" vs 10' difference from ordinary rounding shouldn't trip this, but
// a 9' vs 10' difference (Kinsela's actual case) should. 0.5 ft (6") is
// generous enough to absorb that rounding without absorbing a real
// foot-scale disagreement.
const CEILING_HEIGHT_CONFLICT_TOLERANCE_FT = 0.5;

// Diagnosed 2026-08-14, same day as the function above: giving the model
// a dedicated ceiling_height_ft_elevation_derived field to diff against
// wasn't enough on its own - on a second real run, it reported the SAME
// number (9) into both ceiling_height_ft and ceiling_height_ft_elevation_
// derived, silently dropping the floor plan's actual "10' CEILING" text
// rather than reporting it as the independent structured value it was
// asked for. "Did the model correctly notice and structure this" is
// exactly the kind of judgment this file has learned not to trust (see
// flagWindowScheduleForVerification's comment on the same theme) - so
// instead of asking again, this regexes the raw room_label_text the
// model was asked to copy verbatim (a much easier task: transcribe, don't
// interpret) for an explicit "N' CEILING"-shaped pattern. Tolerates the
// common real-world abbreviations (CEILING, CEIL'G, CLG) and an inches
// component ("10'-0\" CEILING") without capturing it - this app's
// ceiling_height_ft column is a plain number, not a feet+inches pair.
// Returns null, not a guess, when no such pattern is found - a room with
// no ceiling text, or only a "VAULTED CEILING" note with no leading
// number, correctly yields no candidate rather than a fabricated one.
const CEILING_HEIGHT_LABEL_PATTERN = /(\d+(?:\.\d+)?)'(?:-\d+"?)?\s*(?:CEILING|CEIL'?G|CLG)\.?\b/i;

export function extractCeilingHeightFromLabelText(text: string | null): number | null {
  if (!text) return null;
  const match = text.match(CEILING_HEIGHT_LABEL_PATTERN);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

const ROOM_CEILING_HEIGHT_CONFLICT_TAG = "ceiling_height_ft conflict:";

export function flagRoomCeilingHeightConflicts(extraction: DrawingExtraction): DrawingExtraction {
  return {
    ...extraction,
    rooms: extraction.rooms.map((room) => {
      // Idempotency guard: route.ts may run this twice (once before a
      // targeted follow-up call, once after merging its results back in)
      // - a room already flagged with this exact conflict on the first
      // pass shouldn't have the same reason appended to itself a second
      // time just because the function ran again.
      if (room.reason?.includes(ROOM_CEILING_HEIGHT_CONFLICT_TAG)) return room;
      // Prefer the regex-derived reading of the room's own raw label text
      // over the model's structured ceiling_height_ft - see
      // extractCeilingHeightFromLabelText's comment for why the
      // structured field alone isn't trusted as the "floor plan" side of
      // this comparison. Falls back to the structured field only when
      // there's no label text to parse or it didn't match - not because
      // the structured field is trusted, but because it's the only
      // candidate available at all in that case.
      const labelDerived = extractCeilingHeightFromLabelText(room.room_label_text);
      const floorPlanHeight = labelDerived ?? room.ceiling_height_ft;
      if (floorPlanHeight == null || room.ceiling_height_ft_elevation_derived == null) {
        return room;
      }
      const diff = Math.abs(floorPlanHeight - room.ceiling_height_ft_elevation_derived);
      if (diff <= CEILING_HEIGHT_CONFLICT_TOLERANCE_FT) return room;
      const sourceNote = labelDerived != null ? "room_label_text (regex-parsed)" : "ceiling_height_ft (model-structured, no label text to cross-check)";
      const conflictReason = `${ROOM_CEILING_HEIGHT_CONFLICT_TAG} floor plan (${sourceNote}) gives ${floorPlanHeight}' but the elevation-derived calculation gives ${room.ceiling_height_ft_elevation_derived}' - a ${diff.toFixed(1)}' disagreement between two independent, non-disclaimed sources. Not auto-resolved - field-verify on site.`;
      return {
        ...room,
        unresolved: true,
        reason: room.reason ? `${room.reason} · ${conflictReason}` : conflictReason,
      };
    }),
  };
}

// See ExtractedWindowScheduleEntry's comment for why this exists and why
// it's unconditional, unlike every other unresolved/reason pair in this
// file. Not asked for in EXTRACTION_PROMPT's JSON shape (the model isn't
// asked to self-assess this - there would be no point, since this
// overwrites whatever it said regardless) - this is the only place
// window_schedule entries' unresolved/reason ever get set.
const WINDOW_SCHEDULE_VERIFICATION_REASON =
  "Window schedule transcription accuracy has not been proven reliable on dense tables (diagnosed 2026-08-14) - verify mark, size, description, and quantity against the actual drawing before trusting this row.";

export function flagWindowScheduleForVerification(extraction: DrawingExtraction): DrawingExtraction {
  return {
    ...extraction,
    window_schedule: (extraction.window_schedule ?? []).map((entry) => ({
      ...entry,
      unresolved: true,
      reason: WINDOW_SCHEDULE_VERIFICATION_REASON,
    })),
  };
}

// Diagnosed 2026-08-14 against ceiling_insulation_r_value: across three
// consecutive real extraction runs, the model's OWN reasoning claimed
// "REF-2" was one of "two non-disclaimed sheets" in conflict - directly
// contradicting its own STEP 1 sheets[] entry marking REF-2
// reference_only, generated in the very same response. STEP 1 already
// produces exactly the ground truth needed to catch this: this
// cross-checks every sheet name an envelope field's "reason" mentions
// against sheets[]'s actual sourceAuthority for that sheet, instead of
// trusting whatever the reason text itself claims.
//
// Phase 3, item 2: sourceAuthority replaced the binary
// hasReferenceOnlyDisclaimer this check originally read, but this
// specific function's own logic is deliberately left unchanged in what
// it catches - "not reference_only" (i.e. sealed_construction_document
// OR unknown) is treated as one bucket, same as the old "false" reading
// of the boolean. A finer sealed-vs-unknown preference is now available
// to the model's own reasoning (see EXTRACTION_PROMPT's "Other rules"),
// producing richer "reason" text - but this deterministic safety net
// isn't extended to independently arbitrate that finer distinction yet,
// since there's no diagnosed real-world case (the way REF-2 was)
// showing it's actually needed. Adding unverified new deterministic
// behavior isn't free - only extend this once a real failure justifies
// it, same discipline as every other check in this file.
//
// Known, honest limitation: this can only re-verify sheets the reason
// text actually NAMES. On Kinsela specifically, the deeper problem
// wasn't a wrong claim about a named sheet - REF-2 really is
// reference_only, so re-checking that claim finds no discrepancy - it
// was that a THIRD, relevant sheet (A1.3, independently confirmed via
// exact text search to also state "R-38 BLOWN INSULATION") was never
// mentioned in the reasoning at all. A lookup against sheets[] cannot
// detect a sheet the model didn't bring up in the first place; it can
// only catch the case where the model mischaracterizes a sheet it DID
// cite (e.g. calling a reference_only sheet non-reference_only). That's
// still a real, useful, deterministic check - just not a complete
// substitute for independently re-scanning every sheet's own content,
// which is a larger change than this one.
export function verifyEnvelopeConflictDisclaimers(extraction: DrawingExtraction): DrawingExtraction {
  const sheetAuthority = new Map((extraction.sheets ?? []).map((s) => [s.name, s.sourceAuthority]));
  if (sheetAuthority.size === 0) return extraction;

  function check<T>(field: ExtractedField<T>): ExtractedField<T> {
    if (!field.reason) return field;
    const mentioned = [...sheetAuthority.keys()].filter((name) => field.reason!.includes(name));
    const nonDisclaimedMentioned = mentioned.filter((name) => sheetAuthority.get(name) !== "reference_only");
    const disclaimedMentioned = mentioned.filter((name) => sheetAuthority.get(name) === "reference_only");
    if (nonDisclaimedMentioned.length < 2) return field;
    // 2+ sheets that sheets[] itself confirms are NOT reference-only are
    // named in this reasoning together - by the peer-conflict rule this
    // shouldn't have been resolved to one value, regardless of what the
    // reason text concluded or whether it also (correctly or not) cited a
    // disclaimed sheet alongside them.
    const note = `[system check, from sheets[] - not the model's own claim] ${nonDisclaimedMentioned.join(" and ")} are confirmed NON-reference_only sheets both named in this reasoning${disclaimedMentioned.length > 0 ? ` (${disclaimedMentioned.join(", ")} is/are reference_only and doesn't change this)` : ""} - per the peer-conflict rule this should not have been resolved to one value; verify against the actual drawing rather than trusting "value" as shown.`;
    return {
      ...field,
      unresolved: true,
      reason: `${field.reason} · ${note}`,
    };
  }

  const envelope = extraction.building_envelope;
  const nextEnvelope = { ...envelope };
  (Object.keys(envelope) as (keyof ExtractedEnvelope)[]).forEach((key) => {
    (nextEnvelope as Record<string, ExtractedField<unknown>>)[key] = check(
      envelope[key] as ExtractedField<unknown>,
    );
  });

  return { ...extraction, building_envelope: nextEnvelope };
}

// Same simple "R-<number>" extraction for both "R-30" and "R30" spellings -
// the sheets actually seen so far use both. Deliberately not scoped to
// ceiling/attic/roof context in the regex itself; that scoping already
// happened when the model decided whether to populate
// ceiling_insulation_callout_text at all (see ExtractedSheet's comment) -
// this only has to pull the number out of text already known to be a
// ceiling/attic/roof callout.
const R_VALUE_CALLOUT_PATTERN = /R-?\s*(\d+(?:\.\d+)?)/i;

export function extractRValueFromCalloutText(text: string | null): number | null {
  if (!text) return null;
  const match = text.match(R_VALUE_CALLOUT_PATTERN);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

// Diagnosed 2026-08-14: verifyEnvelopeConflictDisclaimers above can only
// re-verify a sheet the model's own "reason" text actually names - on
// Kinsela's real ceiling_insulation_r_value conflict, the reason
// consistently named C.S and REF-2 but never A1.3, the actual non-
// disclaimed peer sheet that also states R-38 (confirmed independently via
// exact PDF text search). A sheets[]-vs-reason lookup structurally cannot
// catch an omission, only a mischaracterization - confirmed by testing
// verifyEnvelopeConflictDisclaimers against this exact real reason text
// and observing it correctly does NOT fire, because only one non-
// disclaimed sheet (C.S) is ever named.
//
// This closes that specific gap the same way flagRoomCeilingHeightConflicts
// closes the ceiling-height one: instead of trusting which sheets the
// model chose to narrate, build the comparison from
// ExtractedSheet.ceiling_insulation_callout_text - a plain per-sheet
// transcription the model fills in STEP 1, independent of and prior to
// whatever it later writes into building_envelope.ceiling_insulation_r_value's
// own reasoning. If 2+ DISTINCT values turn up among sheets sheets[]
// itself confirms are non-disclaimed, that's a genuine, code-verified peer
// conflict - per the same peer-conflict rule EXTRACTION_PROMPT already
// states, this corrects the field to value: null / unresolved: true
// rather than leaving whatever single value the model resolved it to,
// since that resolution is exactly what's being overridden. A disclaimed
// sheet's callout is recorded in the reason for context but never counted
// toward the conflict itself - a disclaimed sheet agreeing OR disagreeing
// doesn't change whether the non-disclaimed sheets conflict with each
// other.
const CEILING_R_VALUE_SYSTEM_CHECK_TAG = "[system check, from sheets[] ceiling_insulation_callout_text";

export function flagCeilingInsulationRValueConflicts(extraction: DrawingExtraction): DrawingExtraction {
  // Idempotency guard: route.ts may run this twice (once before a
  // targeted follow-up call, once after merging its results back in, to
  // pick up any newly-filled sheet callouts) - if this already corrected
  // the field on the first pass, don't re-run the correction and chain a
  // second, redundant note onto a reason that's already accurate.
  if (extraction.building_envelope.ceiling_insulation_r_value.reason?.includes(CEILING_R_VALUE_SYSTEM_CHECK_TAG)) {
    return extraction;
  }

  const sheets = extraction.sheets ?? [];
  const candidates = sheets
    .map((sheet) => ({
      name: sheet.name,
      // "not reference_only" is the same bucket the old boolean's
      // "false" reading covered (sealed_construction_document and
      // unknown both count) - see verifyEnvelopeConflictDisclaimers'
      // comment on why this function doesn't independently arbitrate
      // the finer sealed-vs-unknown distinction yet.
      disclaimed: sheet.sourceAuthority === "reference_only",
      value: extractRValueFromCalloutText(sheet.ceiling_insulation_callout_text),
    }))
    .filter((candidate): candidate is { name: string; disclaimed: boolean; value: number } => candidate.value != null);

  const nonDisclaimed = candidates.filter((c) => !c.disclaimed);
  const distinctNonDisclaimedValues = new Set(nonDisclaimed.map((c) => c.value));
  if (distinctNonDisclaimedValues.size < 2) return extraction;

  const disclaimedCandidates = candidates.filter((c) => c.disclaimed);
  const nonDisclaimedSummary = nonDisclaimed.map((c) => `${c.name}=R-${c.value}`).join(", ");
  const disclaimedSummary = disclaimedCandidates.map((c) => `${c.name}=R-${c.value}`).join(", ");

  const field = extraction.building_envelope.ceiling_insulation_r_value;
  const correctionNote = `${CEILING_R_VALUE_SYSTEM_CHECK_TAG} captured independently per sheet - not the model's own narrated reasoning] Deterministic per-sheet capture found ${distinctNonDisclaimedValues.size} disagreeing values among confirmed non-disclaimed sheets: ${nonDisclaimedSummary}${disclaimedSummary ? ` (also seen, disclaimed, informational only: ${disclaimedSummary})` : ""}. This is a genuine peer conflict per the peer-conflict rule and must not be resolved to one value - value corrected to null (model had resolved it to ${field.value ?? "null"}). Field-verify on site.`;

  return {
    ...extraction,
    building_envelope: {
      ...extraction.building_envelope,
      ceiling_insulation_r_value: {
        value: null,
        unresolved: true,
        reason: field.reason ? `${field.reason} · ${correctionNote}` : correctionNote,
      },
    },
  };
}

// Diagnosed 2026-08-14: two independent, mechanical-transcription fixes
// (room_label_text above, ceiling_insulation_callout_text above) both
// still failed to converge against Kinsela's real PDF - the model kept
// omitting the SAME two facts (the garage's floor-plan-labeled ceiling
// height, A1.3's insulation callout) across four separate real
// extraction runs, regardless of how the single-pass, 15-step, whole-
// document prompt phrased the ask. That points away from wording and
// toward attention/competition within one giant pass over a 13-page
// document asked to do fifteen different things at once.
//
// These two functions detect exactly that specific, narrow failure
// pattern in an already-parsed extraction (never a broad "let's re-ask
// everything" - see route.ts, which only fires a follow-up API call when
// one of these actually returns something) so a short, single-purpose
// follow-up call - the same document, a much smaller prompt asking about
// only the specific rooms/sheets identified here - gets a real second,
// higher-attention look, instead of another reword of the same crowded
// prompt.
//
// KNOWN, HONEST LIMITATION (confirmed 2026-08-14, not just suspected):
// this mechanism is correctly engineered and does what it was designed
// to do - fires only on the exact pattern above, asks a narrow single-
// purpose question, merges the answer back in - but real-world testing
// against Kinsela disproved the "competing instructions" hypothesis it
// was built on. Directly asked, with nothing else competing for
// attention, "does A1.3 have a ceiling/attic/roof insulation callout,"
// the model still answered null - on a page independently confirmed via
// PyMuPDF plain-text search (page.get_text(), not vision/AI) to contain
// "R-38 BLOWN INSULATION" verbatim. The garage follow-up likewise
// returned a different nearby note ("5/8\" TYPE X GYPSUM BOARD ON
// CEILING") instead of the floor plan's actual "10' CEILING" label. This
// is a genuine model misread on a narrowly-scoped, directly-targeted
// question, not a scoping/wording problem this file's usual pattern
// (turn a judgment call into a mechanical one) can fix by construction.
// The one real lead this surfaced: this specific PDF has a genuine
// embedded text layer (PyMuPDF's plain string search found both facts
// immediately), so a deterministic, non-AI extraction path (a PDF-text-
// parsing library run directly against the document, falling back to
// this AI-vision path only when a PDF has no text layer, e.g. a scanned
// drawing) is a real, likely-more-reliable fix for these two specific
// facts - not built here; flagged and left for a deliberate decision,
// since it's a new dependency and a materially different code path, not
// a small follow-on to this one. Kept as-is per explicit direction: this
// mechanism still correctly handles any future project/sheet where the
// model's targeted re-read DOES succeed, and Kinsela's two known-
// unconverged facts remain honestly flagged unresolved for a human
// either way - which was always the fallback, not a regression.
export type RoomCeilingHeightFollowUpTarget = { roomName: string; sourceSheet: string };

export function roomsNeedingCeilingHeightFollowUp(
  extraction: DrawingExtraction,
): RoomCeilingHeightFollowUpTarget[] {
  return extraction.rooms
    .filter((room) => {
      // The specific silent-collapse pattern: an elevation-derived
      // candidate exists, the room's own label text didn't yield a
      // regex-parseable ceiling height, AND the model's structured
      // ceiling_height_ft exactly matches the elevation-derived value -
      // the exact shape that lets flagRoomCeilingHeightConflicts find
      // "no conflict" even though the floor plan may say something else
      // entirely (Kinsela's garage: both read 9, even though "10'
      // CEILING" is genuinely printed on the floor plan). A room with NO
      // elevation-derived candidate at all has nothing to diff against
      // either way, so it's not a candidate for this specific follow-up.
      if (room.ceiling_height_ft_elevation_derived == null) return false;
      if (room.ceiling_height_ft !== room.ceiling_height_ft_elevation_derived) return false;
      if (extractCeilingHeightFromLabelText(room.room_label_text) != null) return false;
      return room.source_sheet != null;
    })
    .map((room) => ({ roomName: room.name, sourceSheet: room.source_sheet as string }));
}

export function sheetsNeedingInsulationCalloutFollowUp(extraction: DrawingExtraction): string[] {
  const sheets = extraction.sheets ?? [];
  // Only worth re-checking when there's already a reason to distrust the
  // first pass's completeness: at least one sheet DID report a ceiling
  // insulation callout (so this project has ceiling insulation info to
  // find at all) but the field ended up unresolved anyway (the model
  // itself wasn't confident it had the full picture). A clean, confident,
  // resolved extraction has no reason to spend a second API call
  // re-checking sheets that were silently irrelevant all along.
  const anyCalloutCaptured = sheets.some((s) => s.ceiling_insulation_callout_text != null);
  if (!anyCalloutCaptured) return [];
  if (!extraction.building_envelope.ceiling_insulation_r_value.unresolved) return [];
  return sheets
    .filter((s) => s.sourceAuthority !== "reference_only" && s.ceiling_insulation_callout_text == null)
    .map((s) => s.name);
}

// Builds the follow-up prompt from exactly the targets the two detection
// functions above identified - never a generic "review the whole
// document again," always scoped to the specific rooms/sheets already
// known to need a second look. Pure and unit-testable on its own,
// independent of the actual Anthropic call route.ts makes with this
// string.
export function buildFollowUpPrompt(
  roomTargets: RoomCeilingHeightFollowUpTarget[],
  sheetTargets: string[],
): string {
  const sections: string[] = [
    `You are re-examining the SAME architectural drawing set you were just shown, to answer a small number of narrow, specific follow-up questions your first pass may have missed. Respond with STRICT JSON only - no markdown fences, no commentary. Match this exact shape:\n{\n  "room_label_followups": [ { "room_name": string, "label_text": string | null } ],\n  "sheet_callout_followups": [ { "sheet_name": string, "callout_text": string | null } ]\n}`,
  ];

  if (roomTargets.length > 0) {
    sections.push(
      `For "room_label_followups": for each room below, go back to the floor plan sheet noted and look CAREFULLY at the area around that room's name for any OTHER printed text nearby - especially a ceiling height (e.g. "10' CEILING", "9' CLG.") - even if it's positioned as its own separate label a short distance away rather than directly touching the room name. Copy whatever you find verbatim into "label_text"; set it to null only if you're now confident there is truly no such text near that room.\nRooms to re-check:\n${roomTargets
        .map((t) => `- "${t.roomName}" on sheet ${t.sourceSheet}`)
        .join("\n")}`,
    );
  } else {
    sections.push(`"room_label_followups" should be an empty array - nothing to re-check.`);
  }

  if (sheetTargets.length > 0) {
    sections.push(
      `For "sheet_callout_followups": for each sheet below, look specifically for a note giving an R-value for CEILING, ATTIC, or ROOF insulation specifically (not wall or floor insulation). Copy the verbatim callout text into "callout_text" if you find one; set it to null only if that sheet genuinely has no such callout.\nSheets to re-check: ${sheetTargets.join(", ")}`,
    );
  } else {
    sections.push(`"sheet_callout_followups" should be an empty array - nothing to re-check.`);
  }

  sections.push(`Output ONLY the JSON object described above.`);
  return sections.join("\n\n");
}

export type RoomLabelFollowUpResult = { room_name: string; label_text: string | null };
export type SheetCalloutFollowUpResult = { sheet_name: string; callout_text: string | null };
export type FollowUpResponse = {
  room_label_followups?: RoomLabelFollowUpResult[];
  sheet_callout_followups?: SheetCalloutFollowUpResult[];
};

// Merges a follow-up response back into the original extraction. Matches
// by name (first occurrence) - acceptable here because the targets being
// merged back were themselves selected FROM this same extraction's own
// room/sheet names moments earlier, not arbitrary external input.
// Appends to existing room_label_text (doesn't replace it) since the
// first pass's text, even if incomplete, is still real and shouldn't be
// discarded; only merges in text genuinely new for that room. Overwrites
// a sheet's ceiling_insulation_callout_text only when it was null (the
// only case a sheet is ever selected as a target in the first place).
export function mergeFollowUpResponse(
  extraction: DrawingExtraction,
  followUp: FollowUpResponse,
): DrawingExtraction {
  const roomResults = followUp.room_label_followups ?? [];
  const sheetResults = followUp.sheet_callout_followups ?? [];

  const rooms = extraction.rooms.map((room) => {
    const match = roomResults.find((r) => r.room_name === room.name);
    if (!match || !match.label_text) return room;
    if (room.room_label_text && room.room_label_text.includes(match.label_text)) return room;
    return {
      ...room,
      room_label_text: room.room_label_text
        ? `${room.room_label_text} / ${match.label_text}`
        : match.label_text,
    };
  });

  const sheets = (extraction.sheets ?? []).map((sheet) => {
    const match = sheetResults.find((s) => s.sheet_name === sheet.name);
    if (!match || !match.callout_text || sheet.ceiling_insulation_callout_text != null) return sheet;
    return { ...sheet, ceiling_insulation_callout_text: match.callout_text };
  });

  return { ...extraction, rooms, sheets };
}
