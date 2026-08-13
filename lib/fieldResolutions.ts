import { WALL_ORIENTATION_UNRESOLVED_REASON, type DrawingExtraction } from "@/lib/drawingExtraction";

export type FieldResolution = {
  id: string;
  project_id: string;
  table_name: string;
  record_id: string;
  field_name: string;
  ai_extracted_value: string | null;
  final_value: string | null;
  resolution_type: "accepted" | "overridden";
  override_reason: string | null;
  resolved_by: string;
  resolved_at: string;
};

export const FIELD_RESOLUTION_COLUMNS =
  "id, project_id, table_name, record_id, field_name, ai_extracted_value, final_value, resolution_type, override_reason, resolved_by, resolved_at";

export function resolutionKey(tableName: string, recordId: string, fieldName: string): string {
  return `${tableName}:${recordId}:${fieldName}`;
}

// Resolutions are an append-only audit trail (see migration
// 20260810195313_add_field_resolutions.sql) - "current" status for a field
// is its most recent row.
export function latestResolutions(resolutions: FieldResolution[]): Map<string, FieldResolution> {
  const map = new Map<string, FieldResolution>();
  for (const r of resolutions) {
    const key = resolutionKey(r.table_name, r.record_id, r.field_name);
    const existing = map.get(key);
    if (!existing || new Date(r.resolved_at) > new Date(existing.resolved_at)) {
      map.set(key, r);
    }
  }
  return map;
}

// table_name='projects' for building_envelope fields, table_name='drawings'
// with field_name='room[<index>]' for per-room flags - see the migration
// comment for why rooms.id isn't used (no stable index->room mapping).
export function countUnresolvedFields(
  drawings: Array<{
    id: string;
    extraction_status: string;
    extracted_data: DrawingExtraction | null;
  }>,
  resolvedKeys: Set<string>,
  projectId: string,
): number {
  let count = 0;
  for (const drawing of drawings) {
    if (drawing.extraction_status !== "completed" || !drawing.extracted_data) continue;

    const envelope = drawing.extracted_data.building_envelope;
    (Object.keys(envelope) as (keyof typeof envelope)[]).forEach((key) => {
      if (envelope[key]?.unresolved && !resolvedKeys.has(resolutionKey("projects", projectId, key))) {
        count += 1;
      }
    });

    drawing.extracted_data.rooms.forEach((room, index) => {
      if (
        room.unresolved &&
        !resolvedKeys.has(resolutionKey("drawings", drawing.id, `room[${index}]`))
      ) {
        count += 1;
      }
      if (
        room.duct_location?.unresolved &&
        !resolvedKeys.has(resolutionKey("drawings", drawing.id, `room[${index}].duct_location`))
      ) {
        count += 1;
      }
      if (
        room.duct_insulation_r_value?.unresolved &&
        !resolvedKeys.has(
          resolutionKey("drawings", drawing.id, `room[${index}].duct_insulation_r_value`),
        )
      ) {
        count += 1;
      }
    });
  }
  return count;
}

// Re-extracting onto a project that already has rooms matches purely by
// name (see the "existing rooms" branch of applyExtractedData in
// components/manual-j-workflow.tsx) - two independent extraction passes
// over the same drawing can format an otherwise-identical room name
// slightly differently (seen in practice: "Bedroom 2" vs. "Bedroom #2").
// Stripping "#" and collapsing whitespace isn't a guess about WHICH room
// something is - "#2" and "2" are the same number regardless of drawing -
// it just avoids flagging predictable formatting noise as an unmatched
// room a human has to review for no reason. Genuine name differences (a
// room renamed, split, or newly found) still fail to match and get
// reported, unchanged. Shared here (rather than duplicated) since
// BuildingOrientationSection's gate below needs the exact same matching
// rule applyExtractedData uses, or the two could disagree about which
// extracted room a given rooms-table row corresponds to.
export function normalizeRoomNameForMatch(name: string): string {
  return name.replace(/#/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Gates BuildingOrientationSection's "Save & Auto-Fill Walls" transform,
// per room: a room's front/rear/left/right data must not be rotated into
// the compass fields Manual J reads until a human has confirmed (via the
// room's existing Unresolved badge, same Accept/Override flow duct fields
// use) that the extraction's front-entry guess is actually correct - see
// WALL_ORIENTATION_UNRESOLVED_REASON and the swap this was built to catch
// (diagnosed 2026-08-13 against Kinsela: two independent extraction runs
// of the identical drawing produced a clean 90-degree swap between the
// front/rear and left/right axes for 6 of 9 compared rooms).
//
// There is no stable room-id -> extraction-index link (same reason
// applyExtractedData matches by name, not id), so this checks every
// completed drawing's extraction for a name match, and blocks if ANY
// match is still unresolved specifically for this reason and lacks a
// field_resolutions row. A room with no matching extraction at all (e.g.
// hand-added, never touched by any drawing) is never blocked - there is
// nothing to confirm.
export function roomHasUnresolvedWallOrientation(
  roomName: string,
  drawings: Array<{
    id: string;
    extraction_status: string;
    extracted_data: DrawingExtraction | null;
  }>,
  resolvedKeys: Set<string>,
): boolean {
  const key = normalizeRoomNameForMatch(roomName);
  for (const drawing of drawings) {
    if (drawing.extraction_status !== "completed" || !drawing.extracted_data) continue;
    for (const [index, room] of drawing.extracted_data.rooms.entries()) {
      if (normalizeRoomNameForMatch(room.name) !== key) continue;
      if (!room.unresolved || !room.reason?.includes(WALL_ORIENTATION_UNRESOLVED_REASON)) continue;
      if (!resolvedKeys.has(resolutionKey("drawings", drawing.id, `room[${index}]`))) {
        return true;
      }
    }
  }
  return false;
}
