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
};

export type ExtractedRoom = {
  name: string;
  floor_area_sqft: number | null;
  wall_north_len_ft: number | null;
  wall_south_len_ft: number | null;
  wall_east_len_ft: number | null;
  wall_west_len_ft: number | null;
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

export type DrawingRow = {
  id: string;
  file_name: string;
  file_type: DrawingFileType;
  extraction_status: DrawingExtractionStatus;
  extracted_data: DrawingExtraction | null;
  unresolved_items: string[] | null;
  applied_to_field_data: boolean;
};

export const DRAWING_COLUMNS =
  "id, file_name, file_type, extraction_status, extracted_data, unresolved_items, applied_to_field_data";

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
    "foundation_type": { "value": string | null, "unresolved": boolean }
  },
  "rooms": [
    {
      "name": string,
      "floor_area_sqft": number | null,
      "wall_north_len_ft": number | null,
      "wall_south_len_ft": number | null,
      "wall_east_len_ft": number | null,
      "wall_west_len_ft": number | null,
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

STEP 1 — Orientation. Before estimating any room geometry, look specifically for a north arrow or another explicit orientation indicator (e.g. elevations labeled "North Elevation", "South Elevation", a compass rose, a site plan with a labeled north). Set "orientation.detected" to whether you found one, and "orientation.description" to a short note of what you found (e.g. "north arrow near title block") or null if none.

STEP 2 — Room geometry, conditioned on Step 1:
- If orientation WAS detected: estimate each room's wall_north_len_ft / wall_south_len_ft / wall_east_len_ft / wall_west_len_ft from the drawing's geometry relative to that orientation, and estimate door_count from the room's drawn openings.
- If orientation was NOT detected: set wall_north_len_ft, wall_south_len_ft, wall_east_len_ft, and wall_west_len_ft to null for every room. Do not guess which side of a room faces which compass direction — an incorrect guess here silently corrupts solar gain calculations downstream. Set that room's "unresolved" to true and "reason" to exactly "no orientation marker - exposure cannot be determined".
- door_count does not depend on orientation and should still be estimated from the drawing's geometry (openings on room walls) even when orientation is not detected.

STEP 3 — Duct routing, per room. Most floor plans do NOT show ductwork - only attempt this when you can actually see duct runs, supply/return grille symbols, a mechanical/section drawing, or an explicit duct callout for that room's area. If you can see it: set "duct_location" to your best read of where that room's duct run is (e.g. "attic", "crawlspace", "conditioned space"), "duct_insulation_r_value" only if an R-value is actually labeled near the ductwork, "duct_confidence" to a 0-1 estimate of how sure you are, and "duct_location.unresolved"/"duct_insulation_r_value.unresolved" to true (a human still needs to confirm this — it's an AI read, not a certainty either way). If you cannot see duct routing for a room (the common case), leave "duct_location", "duct_insulation_r_value", and "duct_confidence" all null — do not guess. A server-side fallback fills a construction-based default afterward; that is not your job.

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
      // The model's own JSON output never sets duct_source (it isn't part
      // of what we ask it to return) - this is where that provenance tag
      // actually gets assigned, based on whether the model found something.
      if (room.duct_location?.value) {
        return { ...room, duct_source: "ai_extracted" as const };
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
