// Builds the (envelope, rooms) pair that ManualJWorkflow.applyExtractedData
// consumes, from a completed drawing's extraction overlaid with any human
// field-resolution overrides. FIX-PIPELINE stage 6 runs this automatically
// on entry (no "Apply to Form" button) - previously this logic lived only
// inside components/drawings-section.tsx's handleApply. Pure.

import type { DrawingRow, ExtractedRoom } from "./drawingExtraction";
import { latestResolutions, resolutionKey, type FieldResolution } from "./fieldResolutions";
import type { ExtractableEnvelopeFields } from "@/components/manual-j-workflow";

export function buildEnvelopeAndRoomsForApply(
  drawing: Pick<DrawingRow, "id" | "extracted_data">,
  resolutions: FieldResolution[],
  projectId: string,
): { envelope: ExtractableEnvelopeFields; rooms: ExtractedRoom[] } | null {
  const data = drawing.extracted_data;
  if (!data) return null;

  const map = latestResolutions(resolutions);
  const envNum = (field: string, raw: number | null): number | null => {
    const r = map.get(resolutionKey("projects", projectId, field));
    if (!r?.final_value) return raw;
    const n = Number(r.final_value);
    return Number.isFinite(n) ? n : raw;
  };
  const envStr = (field: string, raw: string | null): string | null => {
    const r = map.get(resolutionKey("projects", projectId, field));
    return r?.final_value ?? raw;
  };

  const e = data.building_envelope;
  const envelope: ExtractableEnvelopeFields = {
    wall_insulation_r_value: envNum("wall_insulation_r_value", e.wall_insulation_r_value.value),
    ceiling_insulation_r_value: envNum("ceiling_insulation_r_value", e.ceiling_insulation_r_value.value),
    floor_insulation_r_value: envNum("floor_insulation_r_value", e.floor_insulation_r_value.value),
    foundation_type: envStr("foundation_type", e.foundation_type.value),
    window_type: envStr("window_type", e.window_type.value),
    window_count: envNum("window_count", e.window_count.value),
    ceiling_height_ft: envNum("ceiling_height_ft", e.ceiling_height_ft.value),
    attic_construction_type: envStr("attic_construction_type", e.attic_construction_type.value),
  };

  const rooms = data.rooms.map((room, index) => {
    const loc = map.get(resolutionKey("drawings", drawing.id, `room[${index}].duct_location`));
    const rval = map.get(resolutionKey("drawings", drawing.id, `room[${index}].duct_insulation_r_value`));
    if (!loc && !rval) return room;
    return {
      ...room,
      duct_location: loc ? { value: loc.final_value, unresolved: false } : room.duct_location,
      duct_insulation_r_value: rval
        ? { value: rval.final_value != null ? Number(rval.final_value) : null, unresolved: false }
        : room.duct_insulation_r_value,
    };
  });

  return { envelope, rooms };
}
