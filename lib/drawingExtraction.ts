import { DUCT_LOCATION_VALUES, normalizeDuctLocation } from "./constants/ductLocations";

export type ExtractedField<T> = {
  value: T | null;
  unresolved: boolean;
  // Optional, unlike ExtractedRoom's reason (always present there) - most
  // envelope fields are unresolved for the generic "not confidently
  // labeled" reason the UI already implies, not worth a sentence every
  // time. Exists for the cases that do need one: e.g. a value disputed
  // across multiple sheets, where "unresolved: true" alone gives a human
  // reviewer no way to tell WHY without independently re-deriving what I
  // already found. Not populated by the extraction prompt today - written
  // directly when a specific conflict is diagnosed (see Kinsela's
  // ceiling_insulation_r_value, 2026-08-14).
  reason?: string | null;
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

// Phase 2 standing requirement (where a fact came from, and a check on
// whether it should be trusted at face value). Every sheet the model
// actually reviewed, by its title-block name/number - not just a source
// tag for individual facts (ExtractedField.source_sheet /
// ExtractedRoom.source_sheet reference these names), but also a built-in
// completeness signal: if this list doesn't match what a drawing set's
// own index/cover-sheet says it should contain, that's visible, not
// silent. hasReferenceOnlyDisclaimer flags sheets carrying language like
// "for reference only... may not correspond with the other sheets" (seen
// verbatim on Kinsela's REF-1/REF-2) - a fact sourced ONLY from such a
// sheet, with no corroboration elsewhere, must not be presented at face
// value (see the conflict-handling rule in EXTRACTION_PROMPT).
export type ExtractedSheet = {
  name: string;
  hasReferenceOnlyDisclaimer: boolean;
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
};

export const DRAWING_COLUMNS =
  "id, file_name, file_type, extraction_status, extracted_data, unresolved_items, applied_to_field_data, extraction_error";

export const ACCEPTED_DRAWING_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
];

// Fields the model is permitted to fill on Building Envelope. ACH50, occupants,
// and indoor design temps are deliberately excluded from the extraction prompt
// and schema below — those must always be entered by a human.
export const EXTRACTION_PROMPT = `You are reviewing a complete architectural drawing set - floor plans, elevations, cross sections, foundation plan, roof plan, electrical/mechanical/plumbing plans, schedules, cover sheet, and construction details - to help populate ACCA Manual J residential load calculations, Manual D duct design, and Manual S equipment selection.

This document may have many pages of very different types. Review EVERY page before responding. Do not skip a page, or treat its content as irrelevant, because of what its sheet type usually contains - relevant facts have been found on pages a first guess would rule out (a cover sheet's general materials note, a wall-section detail between structural sheets, a mechanical plan's HVAC notes).

Respond with STRICT JSON only — no markdown code fences, no commentary, nothing outside the JSON object. Match this exact shape:

{
  "orientation": {
    "detected": boolean,
    "description": string | null
  },
  "sheets": [
    { "name": string, "hasReferenceOnlyDisclaimer": boolean }
  ],
  "building_envelope": {
    "wall_insulation_r_value": { "value": number | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null },
    "ceiling_insulation_r_value": { "value": number | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null },
    "floor_insulation_r_value": { "value": number | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null },
    "window_type": { "value": string | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null },
    "window_count": { "value": number | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null },
    "foundation_type": { "value": string | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null },
    "ceiling_height_ft": { "value": number | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null },
    "attic_construction_type": { "value": "vented_unconditioned" | "sealed_conditioned" | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null },
    "exterior_wall_stud_size": { "value": string | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null },
    "exterior_wall_stud_spacing_in": { "value": number | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null },
    "exterior_wall_sheathing": { "value": string | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null },
    "exterior_wall_exterior_finish": { "value": string | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null },
    "duct_insulation_spec": { "value": string | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null },
    "duct_minimum_diameter_in": { "value": number | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null },
    "hvac_equipment_location": { "value": string | null, "unresolved": boolean, "reason": string | null, "source_sheet": string | null }
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
      "window_north_area_sqft": number | null,
      "window_south_area_sqft": number | null,
      "window_east_area_sqft": number | null,
      "window_west_area_sqft": number | null,
      "window_front_area_sqft": number | null,
      "window_rear_area_sqft": number | null,
      "window_left_area_sqft": number | null,
      "window_right_area_sqft": number | null,
      "window_count": number | null,
      "door_count": number | null,
      "ceiling_height_ft": number | null,
      "ceiling_height_ft_elevation_derived": number | null,
      "source_sheet": string | null,
      "unresolved": boolean,
      "reason": string | null,
      "duct_location": { "value": string | null, "unresolved": boolean },
      "duct_insulation_r_value": { "value": number | null, "unresolved": boolean },
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
  ]
}

STEP 1 — Sheet inventory. Before extracting any specific field, note every sheet you actually reviewed. For each, add one entry to "sheets": "name" exactly as printed in its title block (e.g. "A1.1", "REF-2", "C.S"), and "hasReferenceOnlyDisclaimer": true if that sheet carries language stating its content is "for reference only" or "may not correspond with the other sheets in this set" (or equivalent) - false otherwise. This list isn't just a record: every "source_sheet" you fill in below must name one of these exact sheets.

STEP 2 — Orientation. Look specifically for a north arrow, a compass rose, a site plan with a labeled north, or elevation sheets explicitly labeled by TRUE COMPASS DIRECTION (e.g. "North Elevation", "South Elevation"). Only these count as orientation detected. Elevation sheets labeled by RELATIVE position only — "Front Elevation", "Rear Elevation", "Left Elevation", "Right Elevation" (as this Kinsela-style sheet set uses) — do NOT establish true compass direction and must NOT be treated as orientation detected, even though they tell you the building's relative layout. Do not infer true north from which side faces the street, where the porch is, or any other indirect cue — these are not reliable and have caused incorrect compass inferences before. Set "orientation.detected" to whether you found a TRUE COMPASS marker as defined above (not a relative one), and "orientation.description" to a short note of what you found (e.g. "north arrow near title block") or null if none.

STEP 3 — Room geometry, conditioned on Step 2:
- If orientation WAS detected: estimate each room's wall_north_len_ft / wall_south_len_ft / wall_east_len_ft / wall_west_len_ft from the drawing's geometry relative to that orientation, and estimate door_count from the room's drawn openings. Leave wall_front_len_ft, wall_rear_len_ft, wall_left_len_ft, and wall_right_len_ft null in this case — they exist only for the no-orientation case below.
- If orientation was NOT detected, do BOTH (a) and (b) below for every room — they are two separate instructions, not alternatives:
  (a) Set wall_north_len_ft, wall_south_len_ft, wall_east_len_ft, and wall_west_len_ft to null. Do not guess which side of a room faces which TRUE COMPASS direction — an incorrect guess here silently corrupts solar gain calculations downstream.
  (b) REQUIRED, not optional: estimate wall_front_len_ft / wall_rear_len_ft / wall_left_len_ft / wall_right_len_ft for every room whose wall layout is visible in the floor plan. Only leave one of these four fields null when that room genuinely has no wall on that particular side (e.g. an interior room bordered by other rooms on 3 sides) or its position truly cannot be determined from anything in this sheet set — not out of general caution.
  Convention for front/rear/left/right (must be followed exactly, the whole feature depends on this): imagine a person standing OUTSIDE the building, FACING the front entry door (looking at the house, about to walk in — not exiting it). "Front" = the wall containing or facing the main entry, as seen by that person. "Rear" = the opposite wall. "Left" = the side on that person's left hand. "Right" = the side on that person's right hand.
  The four LENGTH values are ordinary floor-plan geometry — read them the same confident way you'd read wall_north_len_ft in the orientation-detected case. WHICH wall you call "front," however, is a genuine guess whenever there is no true-north marker (that's exactly why this branch exists) — a "FRONT ELEVATION" label or an obvious main entry only tells you which facade the drawing's own author called the front, not which physical wall is actually the front by any confirmable standard. Do not treat that identification as confident just because a label exists. Every room where you fill any of these four fields is unresolved for this reason, in addition to any other reason it may already have: set "unresolved": true and include, verbatim, the sentence "${WALL_ORIENTATION_UNRESOLVED_REASON}" in "reason" (append it after a " · " separator if the room already has a different reason for something else, e.g. an illegible label — do not replace that other reason, add to it). This is not a substitute for true compass exposure either way — a human still resolves that via the project's building orientation selector, same as before, but now also still needs to confirm the front-entry axis itself before that selector's rotation can be trusted.
- door_count does not depend on orientation and should still be estimated from the drawing's geometry (openings on room walls) even when orientation is not detected.
- For every room, set "source_sheet" to the floor-plan sheet (from your STEP 1 inventory) its geometry actually came from - useful when a project has more than one floor-plan sheet (e.g. a main floor and a second-level/bonus-room plan).

STEP 4 — Window area, per room, same north/south/east/west vs. front/rear/left/right split as STEP 3, governed by the SAME orientation-detected/not-detected branch (do not re-decide it here). This is a much harder read than wall length — most floor plans mark a window opening as a gap in the wall line with a width, but not a height, so only fill a side's window area when you can combine an actual opening on that room's wall (visible in the floor plan) with an actual height reference for that opening (a window schedule entry, a labeled window size like "3068" i.e. 3'-0" x 6'-8", or a spec note) - width times height. If a room clearly has a window on a given side but you have no way to size it, leave that side null rather than assume a typical size - this is the same "don't guess" standard as duct routing (STEP 8) and R-values, not an exception to it. It is expected and fine for most or all window area fields to come back null when a drawing doesn't include a window schedule or labeled sizes; a false area is worse than a missing one, since it would silently misstate solar gain rather than leave it visibly unresolved. When you do fill any window area for a room, set that room's "unresolved" to true with "reason" noting it's an AI-estimated window area pending confirmation (unless the room is already unresolved for another reason, in which case leave the existing reason as-is).

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
- Conflicts across sheets (building_envelope fields only - a room's own ceiling height has its own dedicated two-candidate mechanism in STEP 5, do not also apply this section to "ceiling_height_ft"/"ceiling_height_ft_elevation_derived", that would be redundant effort covering the same ground twice). Three cases, handled differently:
  - Single-sourced from a reference-only sheet: if a fact's ONLY source is a sheet you marked "hasReferenceOnlyDisclaimer": true in STEP 1, with no other sheet mentioning it at all, mark it unresolved regardless of how clearly labeled it looks there, with a reason noting it's single-sourced from a reference-only sheet.
  - Disclaimed sheet vs. non-disclaimed sheet (a real hierarchy, not a guess): if the ONLY disagreement on a fact is between a reference-only sheet and a sheet that isn't reference-only, the non-disclaimed sheet's value may be used - the source documents themselves flagged one sheet as less authoritative, so preferring the other isn't arbitrary. Still record the disclaimed sheet's differing value in "reason". Before applying this hierarchy, you MUST check whether the reference-only sheet's value ALSO appears, independently, on some OTHER non-disclaimed sheet - a value is not "just the disclaimed sheet's value" merely because that's where you happened to notice it first. If it does turn up on another non-disclaimed sheet too, this is actually the peer-conflict case below, not this one, even though a disclaimed sheet is also involved.
  - Peer conflict - two or more NON-disclaimed sheets disagree with each other: this is the case that must NOT be silently resolved, because there is no principled way to prefer one equally-authoritative source over another. Leave "value" null and set "unresolved": true, with "reason" stating BOTH (or all) values found and which sheet each came from. The goal is for a human, ideally someone who can field-verify on site, to make the final call - not for the system to guess and hide the disagreement behind one confident-looking number.
- window_count and door_count are simple counts, not areas.
- Set "unresolved": true on the building envelope object, or on any individual room, whenever the drawing is ambiguous, illegible, or you are guessing rather than reading a clearly labeled figure. Whenever you set "unresolved": true on a room, always fill "reason" with a short, specific explanation a field technician can act on (e.g. "no orientation marker - exposure cannot be determined", "room label illegible", "floor area not dimensioned"). Leave "reason" null only when "unresolved" is false.
- Do not invent room names if none are labeled — use a generic label like "Room 1" and mark it unresolved with an appropriate reason.
- Never include ACH50, occupant count, or indoor design temperatures anywhere in your output. Those values are never extracted from drawings and must always be entered manually by the estimator.
- Output ONLY the JSON object described above.`;

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
        duct_location: { value: DUCT_FALLBACK_LOCATION, unresolved: true },
        duct_insulation_r_value: { value: DUCT_FALLBACK_R_VALUE, unresolved: true },
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

export function flagRoomCeilingHeightConflicts(extraction: DrawingExtraction): DrawingExtraction {
  return {
    ...extraction,
    rooms: extraction.rooms.map((room) => {
      if (room.ceiling_height_ft == null || room.ceiling_height_ft_elevation_derived == null) {
        return room;
      }
      const diff = Math.abs(room.ceiling_height_ft - room.ceiling_height_ft_elevation_derived);
      if (diff <= CEILING_HEIGHT_CONFLICT_TOLERANCE_FT) return room;
      const conflictReason = `ceiling_height_ft conflict: floor plan labels this room ${room.ceiling_height_ft}' but the elevation-derived calculation gives ${room.ceiling_height_ft_elevation_derived}' - a ${diff.toFixed(1)}' disagreement between two independent, non-disclaimed sources. Not auto-resolved - field-verify on site.`;
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
