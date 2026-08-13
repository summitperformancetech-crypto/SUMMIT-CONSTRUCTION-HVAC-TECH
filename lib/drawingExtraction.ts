import { DUCT_LOCATION_VALUES, normalizeDuctLocation } from "./constants/ductLocations";

export type ExtractedField<T> = {
  value: T | null;
  unresolved: boolean;
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
};

export type ExtractedOrientation = {
  detected: boolean;
  description: string | null;
};

export type DrawingExtraction = {
  orientation: ExtractedOrientation;
  building_envelope: ExtractedEnvelope;
  rooms: ExtractedRoom[];
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
export const EXTRACTION_PROMPT = `You are reviewing an architectural or HVAC drawing (floor plan, elevation, or spec sheet) to help populate a Manual J residential load calculation.

Respond with STRICT JSON only — no markdown code fences, no commentary, nothing outside the JSON object. Match this exact shape:

{
  "orientation": {
    "detected": boolean,
    "description": string | null
  },
  "building_envelope": {
    "wall_insulation_r_value": { "value": number | null, "unresolved": boolean },
    "ceiling_insulation_r_value": { "value": number | null, "unresolved": boolean },
    "floor_insulation_r_value": { "value": number | null, "unresolved": boolean },
    "window_type": { "value": string | null, "unresolved": boolean },
    "window_count": { "value": number | null, "unresolved": boolean },
    "foundation_type": { "value": string | null, "unresolved": boolean },
    "ceiling_height_ft": { "value": number | null, "unresolved": boolean }
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
      "unresolved": boolean,
      "reason": string | null,
      "duct_location": { "value": string | null, "unresolved": boolean },
      "duct_insulation_r_value": { "value": number | null, "unresolved": boolean },
      "duct_confidence": number | null
    }
  ]
}

STEP 1 — Orientation. Before estimating any room geometry, look specifically for a north arrow, a compass rose, a site plan with a labeled north, or elevation sheets explicitly labeled by TRUE COMPASS DIRECTION (e.g. "North Elevation", "South Elevation"). Only these count as orientation detected. Elevation sheets labeled by RELATIVE position only — "Front Elevation", "Rear Elevation", "Left Elevation", "Right Elevation" (as this Kinsela-style sheet set uses) — do NOT establish true compass direction and must NOT be treated as orientation detected, even though they tell you the building's relative layout. Do not infer true north from which side faces the street, where the porch is, or any other indirect cue — these are not reliable and have caused incorrect compass inferences before. Set "orientation.detected" to whether you found a TRUE COMPASS marker as defined above (not a relative one), and "orientation.description" to a short note of what you found (e.g. "north arrow near title block") or null if none.

STEP 2 — Room geometry, conditioned on Step 1:
- If orientation WAS detected: estimate each room's wall_north_len_ft / wall_south_len_ft / wall_east_len_ft / wall_west_len_ft from the drawing's geometry relative to that orientation, and estimate door_count from the room's drawn openings. Leave wall_front_len_ft, wall_rear_len_ft, wall_left_len_ft, and wall_right_len_ft null in this case — they exist only for the no-orientation case below.
- If orientation was NOT detected, do BOTH (a) and (b) below for every room — they are two separate instructions, not alternatives:
  (a) Set wall_north_len_ft, wall_south_len_ft, wall_east_len_ft, and wall_west_len_ft to null. Do not guess which side of a room faces which TRUE COMPASS direction — an incorrect guess here silently corrupts solar gain calculations downstream.
  (b) REQUIRED, not optional: estimate wall_front_len_ft / wall_rear_len_ft / wall_left_len_ft / wall_right_len_ft for every room whose wall layout is visible in the floor plan. Only leave one of these four fields null when that room genuinely has no wall on that particular side (e.g. an interior room bordered by other rooms on 3 sides) or its position truly cannot be determined from anything in this sheet set — not out of general caution.
  Convention for front/rear/left/right (must be followed exactly, the whole feature depends on this): imagine a person standing OUTSIDE the building, FACING the front entry door (looking at the house, about to walk in — not exiting it). "Front" = the wall containing or facing the main entry, as seen by that person. "Rear" = the opposite wall. "Left" = the side on that person's left hand. "Right" = the side on that person's right hand.
  The four LENGTH values are ordinary floor-plan geometry — read them the same confident way you'd read wall_north_len_ft in the orientation-detected case. WHICH wall you call "front," however, is a genuine guess whenever there is no true-north marker (that's exactly why this branch exists) — a "FRONT ELEVATION" label or an obvious main entry only tells you which facade the drawing's own author called the front, not which physical wall is actually the front by any confirmable standard. Do not treat that identification as confident just because a label exists. Every room where you fill any of these four fields is unresolved for this reason, in addition to any other reason it may already have: set "unresolved": true and include, verbatim, the sentence "front/rear/left/right wall assignment is a guess pending confirmation of which elevation is the true front entry - could be swapped with left/right" in "reason" (append it after a " · " separator if the room already has a different reason for something else, e.g. an illegible label — do not replace that other reason, add to it). This is not a substitute for true compass exposure either way — a human still resolves that via the project's building orientation selector, same as before, but now also still needs to confirm the front-entry axis itself before that selector's rotation can be trusted.
- door_count does not depend on orientation and should still be estimated from the drawing's geometry (openings on room walls) even when orientation is not detected.

STEP 3 — Window area, per room, same north/south/east/west vs. front/rear/left/right split as STEP 2, governed by the SAME orientation-detected/not-detected branch (do not re-decide it here). This is a much harder read than wall length — most floor plans mark a window opening as a gap in the wall line with a width, but not a height, so only fill a side's window area when you can combine an actual opening on that room's wall (visible in the floor plan) with an actual height reference for that opening (a window schedule entry, a labeled window size like "3068" i.e. 3'-0" x 6'-8", or a spec note) - width times height. If a room clearly has a window on a given side but you have no way to size it, leave that side null rather than assume a typical size - this is the same "don't guess" standard as duct routing (STEP 5) and R-values, not an exception to it. It is expected and fine for most or all window area fields to come back null when a drawing doesn't include a window schedule or labeled sizes; a false area is worse than a missing one, since it would silently misstate solar gain rather than leave it visibly unresolved. When you do fill any window area for a room, set that room's "unresolved" to true with "reason" noting it's an AI-estimated window area pending confirmation (unless the room is already unresolved for another reason, in which case leave the existing reason as-is).

STEP 4 — Ceiling height, building-wide (not per room). Look for a plate height or ceiling height labeled on a wall section, a building section, an elevation, or a general note (e.g. "9'-0" PLATE HT.", "8' CEILINGS TYP."). Set "building_envelope.ceiling_height_ft" to that value only if it is actually labeled — do not infer a typical residential height. If the drawing labels different heights per story, use the ground-floor/primary living-area figure and set "unresolved": true (a per-room exception like a vaulted great room or a raised second-floor ceiling still needs a human's manual correction on that specific room - this field is only ever a starting default for rooms that don't already have one).

STEP 5 — Duct routing, per room. Most floor plans do NOT show ductwork - only attempt this when you can actually see duct runs, supply/return grille symbols, a mechanical/section drawing, or an explicit duct callout for that room's area. If you can see it: set "duct_location" to EXACTLY ONE of these values (case-sensitive, no other text): ${DUCT_LOCATION_VALUES.map((v) => `"${v}"`).join(", ")} — use "Attic-Unconditioned" for a plain vented attic, "Attic-Conditioned" for a sealed/spray-foamed attic, "Basement-Unconditioned"/"Basement-Conditioned" the same way, "Conditioned-Space" for ducts run inside living space (e.g. a dropped soffit or interior chase), and "Exterior-Wall" for ducts run in an exterior wall cavity. Also set "duct_insulation_r_value" only if an R-value is actually labeled near the ductwork, "duct_confidence" to a 0-1 estimate of how sure you are, and "duct_location.unresolved"/"duct_insulation_r_value.unresolved" to true (a human still needs to confirm this — it's an AI read, not a certainty either way). If you cannot see duct routing for a room (the common case), leave "duct_location", "duct_insulation_r_value", and "duct_confidence" all null — do not guess, and never output a location outside the exact list above. A server-side fallback fills a construction-based default afterward; that is not your job.

Other rules:
- Only fill an insulation R-value if it is visibly labeled on the drawing (e.g. "R-19 batt", "R-38 ceiling"). Do not infer a code-minimum or typical value — leave it null instead.
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
