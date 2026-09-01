// AI-proposal Accept / Override tracking.
//
// FIX-PIPELINE decision: "Full auto-propose + review." The AI proposes
// everything it can (room set, zoning, duct pins, duct design, equipment,
// ventilation drafts); the technician's only job is to Accept each proposal
// in one click, or Override it with a written reason. This module is the
// bookkeeping layer for that - it deliberately reuses the existing
// `field_resolutions` append-only audit table (same one the UNRESOLVED
// drawing-field workflow uses) rather than inventing a parallel table, so
// every Accept/Override is already dated, attributed, and reason-logged by
// the schema that exists.
//
// A proposal is addressed by a stable key. Project-level proposals (the
// room set, zoning, the Manual D design, the ventilation review) are keyed
// against the projects row with a `proposal:<name>` field name. Per-record
// proposals (one duct-routing pin per room/zone, one equipment pick per
// zone) reuse the key the relevant subsystem already writes:
//   - room pin      -> field_resolutions(table_name='rooms',  record_id=<roomId>, field_name='position')
//   - zone AHU pin   -> field_resolutions(table_name='zones',  record_id=<zoneId>, field_name='ahu_position')
//   - zone return pin -> field_resolutions(table_name='zones', record_id=<zoneId>, field_name='return_position')
//   - zone condenser -> field_resolutions(table_name='zones',  record_id=<zoneId>, field_name='condenser_position')
//   - zone equipment -> zones.equipment_selection_source column (not a
//     field_resolutions row - the column already records ai_proposed /
//     human_confirmed / human_override directly).
//
// `computePipelineState` (lib/pipeline.ts) is the only consumer that
// matters: a stage whose exit gate involves a proposal stays incomplete
// until that proposal is no longer pending, and the whole project cannot
// be Finalized while `outstandingProposals > 0`.

import { resolutionKey, type FieldResolution } from "./fieldResolutions";

// The four project-level proposal names. Per-record proposals (pins,
// equipment) are not in this list - see the module comment.
export const PROPOSAL_NAMES = {
  rooms: "rooms",
  zoning: "zoning",
  ductDesign: "duct_design",
  ventilation: "ventilation",
} as const;

export type ProposalName = (typeof PROPOSAL_NAMES)[keyof typeof PROPOSAL_NAMES];

// Stable key for a project-level proposal. `projects` / `<projectId>` /
// `proposal:<name>` - the same (table_name, record_id, field_name) triple
// `resolutionKey` builds everywhere else, so `resolvedKeys` sets assembled
// once from a project's field_resolutions work for these unchanged.
export function proposalKey(projectId: string, name: ProposalName): string {
  return resolutionKey("projects", projectId, `proposal:${name}`);
}

export type ProposalStatus = "pending" | "accepted" | "overridden";

// Status of one project-level proposal, from the project's full resolution
// history. "pending" = never Accepted or Overridden. Uses the newest row
// for the key (field_resolutions is append-only).
export function proposalStatus(
  resolutions: FieldResolution[],
  projectId: string,
  name: ProposalName,
): ProposalStatus {
  const key = proposalKey(projectId, name);
  let newest: FieldResolution | null = null;
  for (const r of resolutions) {
    if (resolutionKey(r.table_name, r.record_id, r.field_name) !== key) continue;
    if (!newest || new Date(r.resolved_at) > new Date(newest.resolved_at)) newest = r;
  }
  if (!newest) return "pending";
  return newest.resolution_type === "overridden" ? "overridden" : "accepted";
}

// Cheap variant for callers that already collapsed their resolutions into a
// key Set (the pipeline does this once). Can only distinguish
// pending vs. resolved - which is all the gates need.
export function proposalResolved(resolvedKeys: ReadonlySet<string>, key: string): boolean {
  return resolvedKeys.has(key);
}

// One Accept/Override the technician still owes before the project can be
// Finalized. `label` is what the stepper shows in the outstanding list.
export type OutstandingProposal = {
  key: string;
  stage: string;
  label: string;
};

// Everything the technician must still Accept or Override, given the
// project's current data. This is the authoritative list behind
// `PipelineState.outstandingProposals`. It intentionally only reports a
// proposal as outstanding once the project has advanced far enough for that
// proposal to exist at all (e.g. no zoning proposal is "outstanding" before
// any room exists).
export function listOutstandingProposals(input: {
  project: { id: string };
  rooms: Array<{ id: string; name: string; is_conditioned: boolean; zone_id: string | null; floor_area_sqft: number | null; position_x_norm: number | null; position_y_norm: number | null }>;
  zones: Array<{ id: string; name: string; equipment_selection_source: string | null; ahu_position_x_norm: number | null; ahu_position_y_norm: number | null; return_position_x_norm: number | null; return_position_y_norm: number | null; condenser_position_x_norm: number | null; condenser_position_y_norm: number | null }>;
  drawings: Array<{ extraction_status: string }>;
  resolvedKeys: ReadonlySet<string>;
}): OutstandingProposal[] {
  const { project, rooms, zones, drawings, resolvedKeys } = input;
  const out: OutstandingProposal[] = [];
  const conditioned = rooms.filter((r) => r.is_conditioned);
  const extractionDone = drawings.length > 0 && drawings.every((d) => d.extraction_status === "completed");

  if (extractionDone && !resolvedKeys.has(proposalKey(project.id, PROPOSAL_NAMES.rooms))) {
    out.push({ key: proposalKey(project.id, PROPOSAL_NAMES.rooms), stage: "rooms_envelope", label: "AI-proposed room set + envelope" });
  }
  if (conditioned.length > 0) {
    if (!resolvedKeys.has(proposalKey(project.id, PROPOSAL_NAMES.zoning))) {
      out.push({ key: proposalKey(project.id, PROPOSAL_NAMES.zoning), stage: "zones", label: "AI-proposed zoning" });
    }

    const pinRooms = conditioned.filter((r) => r.zone_id != null && (r.floor_area_sqft ?? 0) > 0);
    for (const r of pinRooms) {
      const hasPos = r.position_x_norm != null && r.position_y_norm != null;
      if (!hasPos && !resolvedKeys.has(resolutionKey("rooms", r.id, "position"))) {
        out.push({ key: resolutionKey("rooms", r.id, "position"), stage: "duct_pins", label: `Duct-routing pin: ${r.name}` });
      }
    }
    const zonesInUse = zones.filter((z) => pinRooms.some((r) => r.zone_id === z.id));
    for (const z of zonesInUse) {
      if (z.ahu_position_x_norm == null && !resolvedKeys.has(resolutionKey("zones", z.id, "ahu_position"))) {
        out.push({ key: resolutionKey("zones", z.id, "ahu_position"), stage: "duct_pins", label: `AHU pin: ${z.name}` });
      }
      if (z.return_position_x_norm == null && !resolvedKeys.has(resolutionKey("zones", z.id, "return_position"))) {
        out.push({ key: resolutionKey("zones", z.id, "return_position"), stage: "duct_pins", label: `Return-air pin: ${z.name}` });
      }
      if (z.condenser_position_x_norm == null && !resolvedKeys.has(resolutionKey("zones", z.id, "condenser_position"))) {
        out.push({ key: resolutionKey("zones", z.id, "condenser_position"), stage: "duct_pins", label: `Condenser pin: ${z.name}` });
      }
    }

    if (!resolvedKeys.has(proposalKey(project.id, PROPOSAL_NAMES.ductDesign))) {
      out.push({ key: proposalKey(project.id, PROPOSAL_NAMES.ductDesign), stage: "manual_d", label: "AI-proposed Manual D duct design" });
    }

    const zonesWithRooms = zones.filter((z) => conditioned.some((r) => r.zone_id === z.id));
    for (const z of zonesWithRooms) {
      if (z.equipment_selection_source == null || z.equipment_selection_source === "ai_proposed") {
        out.push({ key: `zones:${z.id}:equipment_selection_source`, stage: "equipment", label: `Equipment pick: ${z.name}` });
      }
    }

    if (!resolvedKeys.has(proposalKey(project.id, PROPOSAL_NAMES.ventilation))) {
      out.push({ key: proposalKey(project.id, PROPOSAL_NAMES.ventilation), stage: "ventilation", label: "Ventilation & dehumidification review" });
    }
  }
  return out;
}
