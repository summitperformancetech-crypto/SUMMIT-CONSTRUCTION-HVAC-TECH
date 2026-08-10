import type { DrawingExtraction } from "@/lib/drawingExtraction";

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
