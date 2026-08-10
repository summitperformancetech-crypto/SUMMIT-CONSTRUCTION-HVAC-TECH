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
      "reason": string | null
    }
  ]
}

STEP 1 — Orientation. Before estimating any room geometry, look specifically for a north arrow or another explicit orientation indicator (e.g. elevations labeled "North Elevation", "South Elevation", a compass rose, a site plan with a labeled north). Set "orientation.detected" to whether you found one, and "orientation.description" to a short note of what you found (e.g. "north arrow near title block") or null if none.

STEP 2 — Room geometry, conditioned on Step 1:
- If orientation WAS detected: estimate each room's wall_north_len_ft / wall_south_len_ft / wall_east_len_ft / wall_west_len_ft from the drawing's geometry relative to that orientation, and estimate door_count from the room's drawn openings.
- If orientation was NOT detected: set wall_north_len_ft, wall_south_len_ft, wall_east_len_ft, and wall_west_len_ft to null for every room. Do not guess which side of a room faces which compass direction — an incorrect guess here silently corrupts solar gain calculations downstream. Set that room's "unresolved" to true and "reason" to exactly "no orientation marker - exposure cannot be determined".
- door_count does not depend on orientation and should still be estimated from the drawing's geometry (openings on room walls) even when orientation is not detected.

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
  });

  return items;
}
