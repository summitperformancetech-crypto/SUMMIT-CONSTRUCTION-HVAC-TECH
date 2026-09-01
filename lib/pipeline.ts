// The Summit residential pipeline - single source of truth.
//
// This module is the executable form of /SUMMIT-BUILD-SEQUENCE.md. The doc
// and this file must not drift: every stage below has an entry gate ("what
// must be true to unlock it" = every prior stage's exit gate) and an exit
// gate ("what must be true to leave it / unlock the next"). Exactly one
// function - `computePipelineState` - decides stage status, and every
// consumer (the stepper nav, each stage component's disabled state, the
// header badge, /api/reports/*, the Finalize route, lib/reportGate.ts)
// reads from it. No component computes its own readiness.
//
// It is pure: input is a plain data bundle (see PipelineInput), no Supabase
// client, no I/O. `buildPipelineInput` (lib/pipelineInput.ts) assembles the
// bundle server-side; tests drive `computePipelineState` directly.

import { isCardinalCompass, type Compass8 } from "./constants/compass";
import { countUnresolvedFields, resolutionKey, type FieldResolution } from "./fieldResolutions";
import { checkDataCompleteness } from "./dataCompleteness";
import {
  listOutstandingProposals,
  proposalKey,
  proposalResolved,
  PROPOSAL_NAMES,
  type OutstandingProposal,
} from "./aiProposals";
import type { DrawingExtraction } from "./drawingExtraction";
import type { ManualJResult } from "./manualJ";

export const PIPELINE_STAGES = [
  "project",
  "climate",
  "orientation",
  "drawings",
  "field_review",
  "rooms_envelope",
  "zones",
  "manual_j",
  "duct_pins",
  "manual_d",
  "equipment",
  "ventilation",
  "finalize",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABEL: Record<PipelineStage, string> = {
  project: "Project",
  climate: "Climate",
  orientation: "Orientation",
  drawings: "Drawings",
  field_review: "Field Review",
  rooms_envelope: "Rooms & Envelope",
  zones: "Zones",
  manual_j: "Manual J",
  duct_pins: "Duct Routing Pins",
  manual_d: "Manual D",
  equipment: "Equipment (Manual S)",
  ventilation: "Ventilation & Dehumidification",
  finalize: "Review & Finalize",
};

export type StageStatus = "locked" | "available" | "in_progress" | "complete";

export type StageState = {
  stage: PipelineStage;
  status: StageStatus;
  // Human-readable and specific ("Kitchen has no floor area"), ordered
  // most-actionable first. Empty when the stage's exit gate is met.
  blockers: string[];
  entryGateMet: boolean;
  exitGateMet: boolean;
};

export type PipelineState = {
  stages: Record<PipelineStage, StageState>;
  // First stage whose exit gate is not yet met. "finalize" when every
  // prior stage is complete (the project is ready to Finalize, or already
  // Finalized).
  currentStage: PipelineStage;
  canFinalize: boolean;
  finalized: boolean;
  outstandingProposals: number;
  outstandingProposalList: OutstandingProposal[];
};

// ---------------------------------------------------------------------------
// PipelineInput - the plain bundle. Deliberately its own minimal row types
// (not the heavy component/report types) so this stays a pure lib.
// ---------------------------------------------------------------------------

export type PipelineProjectInput = {
  id: string;
  project_type: string;
  climate_confirmed: boolean;
  building_front_faces: Compass8 | null;
  hvac_system_configuration: string;
  finalized_at: string | null;
};

export type PipelineClimateInput = {
  winter_design_temp_f: number | null;
  summer_design_temp_f: number | null;
  summer_coincident_wetbulb_f: number | null;
} | null;

export type PipelineRoomInput = {
  id: string;
  name: string;
  is_conditioned: boolean;
  floor_area_sqft: number | null;
  zone_id: string | null;
  position_x_norm: number | null;
  position_y_norm: number | null;
  wall_north_len_ft: number | null;
  wall_south_len_ft: number | null;
  wall_east_len_ft: number | null;
  wall_west_len_ft: number | null;
  window_north_area_sqft: number | null;
  window_south_area_sqft: number | null;
  window_east_area_sqft: number | null;
  window_west_area_sqft: number | null;
};

export type PipelineZoneInput = {
  id: string;
  name: string;
  selected_equipment_id: string | null;
  // 'ai_proposed' | 'human_confirmed' | 'human_override' | null
  equipment_selection_source: string | null;
  ahu_position_x_norm: number | null;
  ahu_position_y_norm: number | null;
  return_position_x_norm: number | null;
  return_position_y_norm: number | null;
  condenser_position_x_norm: number | null;
  condenser_position_y_norm: number | null;
};

export type PipelineDrawingInput = {
  id: string;
  extraction_status: string;
  extracted_data: DrawingExtraction | null;
  floor_plan_page_number: number | null;
};

export type PipelineDuctRunInput = {
  id: string;
  run_type: string;
  room_id: string | null;
  zone_id: string | null;
  cfm: number | null;
};

export type PipelineExhaustSourceInput = {
  id: string;
  review_status: string;
};

export type PipelineZoneEquipmentInput = {
  zoneId: string;
  selectedEquipment: {
    equipmentId: string;
    manufacturer: string | null;
    modelNumber: string | null;
    ratedCfm: number | null;
    coolingCapacityAtDesignBtuh: number | null;
  } | null;
};

export type PipelineInput = {
  project: PipelineProjectInput;
  climateZone: PipelineClimateInput;
  rooms: PipelineRoomInput[];
  zones: PipelineZoneInput[];
  drawings: PipelineDrawingInput[];
  fieldResolutions: FieldResolution[];
  ductRuns: PipelineDuctRunInput[];
  exhaustSources: PipelineExhaustSourceInput[];
  zoneEquipment: PipelineZoneEquipmentInput[];
  manualJ: ManualJResult | null;
  // True when the project's real exhaust load crosses the residential
  // makeup-air trigger (lib/makeupAir.ts) - drives whether the ventilation
  // stage must also show a makeup-air draft to review.
  makeupAirRequired: boolean;
  latestSnapshotVersion: number | null;
};

// ---------------------------------------------------------------------------
// Per-stage exit gates. Each is a small named predicate over PipelineInput
// so tests can target it directly. `rk` is the resolved-key Set (built once
// in computePipelineState).
// ---------------------------------------------------------------------------

type GateResult = { met: boolean; blockers: string[]; progressed: boolean };

const CFM_COMPATIBILITY_TOLERANCE = 0.15;

function conditionedRooms(i: PipelineInput): PipelineRoomInput[] {
  return i.rooms.filter((r) => r.is_conditioned);
}

function zonesWithConditionedRooms(i: PipelineInput): PipelineZoneInput[] {
  return i.zones.filter((z) => i.rooms.some((r) => r.zone_id === z.id && r.is_conditioned));
}

export function projectExitGate(i: PipelineInput): GateResult {
  const blockers: string[] = [];
  if (!i.project?.id) blockers.push("Project has not been created.");
  else if (i.project.project_type !== "residential")
    blockers.push("The guided pipeline currently supports residential projects only.");
  return { met: blockers.length === 0, blockers, progressed: !!i.project?.id };
}

export function climateExitGate(i: PipelineInput): GateResult {
  const blockers: string[] = [];
  if (!i.project.climate_confirmed) blockers.push("Climate data has not been confirmed.");
  const cz = i.climateZone;
  if (!cz || cz.winter_design_temp_f == null || cz.summer_design_temp_f == null)
    blockers.push("No NOAA/ASHRAE winter and summer design temperatures resolved for this address yet.");
  if (cz && cz.summer_coincident_wetbulb_f == null)
    blockers.push("Summer coincident wet-bulb design temperature is missing for this location (Manual S needs it).");
  return { met: blockers.length === 0, blockers, progressed: i.project.climate_confirmed || i.climateZone != null };
}

export function orientationExitGate(i: PipelineInput, rk: ReadonlySet<string>): GateResult {
  const blockers: string[] = [];
  const f = i.project.building_front_faces;
  if (!f) {
    blockers.push("Building front-facing compass direction has not been confirmed.");
  } else if (!isCardinalCompass(f)) {
    const ack = resolutionKey("projects", i.project.id, "orientation_intercardinal_ack");
    if (!rk.has(ack))
      blockers.push(
        `Front faces ${f} (intercardinal). Acknowledge that per-room compass wall data will be entered by hand for this building to proceed.`,
      );
  }
  return { met: blockers.length === 0, blockers, progressed: f != null };
}

export function drawingsExitGate(i: PipelineInput): GateResult {
  const blockers: string[] = [];
  if (i.drawings.length === 0) {
    blockers.push("No drawings uploaded.");
    return { met: false, blockers, progressed: false };
  }
  const notDone = i.drawings.filter((d) => d.extraction_status !== "completed");
  if (notDone.length > 0)
    blockers.push(`${notDone.length} drawing(s) are still extracting or have failed extraction.`);
  const floorPlans = i.drawings.filter((d) => d.floor_plan_page_number != null);
  if (floorPlans.length === 0) blockers.push("No drawing has been marked as the floor-plan page.");
  else if (floorPlans.length > 1)
    blockers.push("More than one drawing is marked as the floor-plan page - exactly one is required.");
  return { met: blockers.length === 0, blockers, progressed: true };
}

export function fieldReviewExitGate(i: PipelineInput, rk: ReadonlySet<string>): GateResult {
  const count = countUnresolvedFields(i.drawings, rk as Set<string>, i.project.id);
  return {
    met: count === 0,
    blockers:
      count > 0
        ? [`${count} AI-extracted field${count === 1 ? "" : "s"} still need${count === 1 ? "s" : ""} to be Accepted or Overridden.`]
        : [],
    progressed: true,
  };
}

export function roomsEnvelopeExitGate(i: PipelineInput, rk: ReadonlySet<string>): GateResult {
  const blockers: string[] = [];
  const cond = conditionedRooms(i);
  if (cond.length === 0) blockers.push("No conditioned rooms have been created yet.");
  for (const w of checkDataCompleteness(i.rooms)) {
    blockers.push(w.roomName ? `${w.roomName}: ${w.reason}` : w.reason);
  }
  const proposalPending = !proposalResolved(rk, proposalKey(i.project.id, PROPOSAL_NAMES.rooms));
  if (proposalPending) blockers.push("The AI-proposed room set has not been Accepted or Overridden.");
  return {
    met: blockers.length === 0,
    blockers,
    progressed: cond.length > 0,
  };
}

export function zonesExitGate(i: PipelineInput, rk: ReadonlySet<string>): GateResult {
  const blockers: string[] = [];
  const cond = conditionedRooms(i);
  if (i.zones.length === 0) blockers.push("No zones have been defined.");
  const zoneIds = new Set(i.zones.map((z) => z.id));
  const unzoned = cond.filter((r) => !r.zone_id || !zoneIds.has(r.zone_id));
  if (unzoned.length > 0)
    blockers.push(
      `${unzoned.length} conditioned room(s) are not assigned to a zone: ${unzoned.map((r) => r.name).join(", ")}.`,
    );
  const proposalPending = !proposalResolved(rk, proposalKey(i.project.id, PROPOSAL_NAMES.zoning));
  if (cond.length > 0 && proposalPending)
    blockers.push("The AI-proposed zoning has not been Accepted or Overridden.");
  return { met: blockers.length === 0, blockers, progressed: i.zones.length > 0 };
}

export function manualJExitGate(i: PipelineInput): GateResult {
  const blockers: string[] = [];
  if (!i.manualJ) {
    blockers.push("Manual J has not produced a result yet (needs confirmed climate and at least one room).");
    return { met: false, blockers, progressed: false };
  }
  for (const z of zonesWithConditionedRooms(i)) {
    const zl = i.manualJ.zones.find((zz) => zz.zoneId === z.id);
    if (!zl || zl.coolingTotalBtuh <= 0)
      blockers.push(`${z.name}: Manual J cooling load is computing as zero - check this zone's room inputs.`);
  }
  return { met: blockers.length === 0, blockers, progressed: true };
}

export function ductPinsExitGate(i: PipelineInput, rk: ReadonlySet<string>): GateResult {
  const blockers: string[] = [];
  const pinRooms = conditionedRooms(i).filter((r) => r.zone_id != null && (r.floor_area_sqft ?? 0) > 0);
  if (pinRooms.length === 0) {
    blockers.push("No conditioned rooms with a zone and a floor area to place duct-routing pins for.");
    return { met: false, blockers, progressed: false };
  }
  let placed = 0;
  for (const r of pinRooms) {
    const hasPos = r.position_x_norm != null && r.position_y_norm != null;
    const resolved = rk.has(resolutionKey("rooms", r.id, "position"));
    if (hasPos || resolved) placed += 1;
    else blockers.push(`${r.name}: duct-routing pin not confirmed.`);
  }
  const zonesInUse = i.zones.filter((z) => pinRooms.some((r) => r.zone_id === z.id));
  for (const z of zonesInUse) {
    if (z.ahu_position_x_norm == null && !rk.has(resolutionKey("zones", z.id, "ahu_position")))
      blockers.push(`${z.name}: AHU pin not confirmed.`);
    if (z.return_position_x_norm == null && !rk.has(resolutionKey("zones", z.id, "return_position")))
      blockers.push(`${z.name}: return-air pin not confirmed.`);
    if (z.condenser_position_x_norm == null && !rk.has(resolutionKey("zones", z.id, "condenser_position")))
      blockers.push(`${z.name}: condenser pin not confirmed.`);
  }
  return { met: blockers.length === 0, blockers, progressed: placed > 0 };
}

export function manualDExitGate(i: PipelineInput, rk: ReadonlySet<string>): GateResult {
  const blockers: string[] = [];
  const cond = conditionedRooms(i);
  const branchByRoom = new Map(
    i.ductRuns.filter((r) => r.run_type === "branch" && r.room_id).map((r) => [r.room_id as string, r]),
  );
  const missing = cond.filter((r) => !branchByRoom.has(r.id));
  if (cond.length > 0 && missing.length > 0)
    blockers.push(
      `${missing.length} conditioned room(s) have no branch duct run: ${missing.map((r) => r.name).join(", ")}.`,
    );

  const cfmById = new Map(i.ductRuns.map((r) => [r.id, r.cfm ?? 0]));
  const branchCfmForZone = (zoneId: string) =>
    i.ductRuns
      .filter((r) => r.run_type === "branch" && r.zone_id === zoneId)
      .reduce((sum, r) => sum + (cfmById.get(r.id) ?? 0), 0);

  const zwr = zonesWithConditionedRooms(i);
  if (i.project.hvac_system_configuration === "single_system_zoned") {
    const groups = new Map<string, { ratedCfm: number; names: string[]; total: number }>();
    for (const z of zwr) {
      const sel = i.zoneEquipment.find((e) => e.zoneId === z.id)?.selectedEquipment;
      if (!sel?.equipmentId || sel.ratedCfm == null) continue;
      const g = groups.get(sel.equipmentId) ?? { ratedCfm: sel.ratedCfm, names: [], total: 0 };
      g.names.push(z.name);
      g.total += branchCfmForZone(z.id);
      groups.set(sel.equipmentId, g);
    }
    for (const g of groups.values()) {
      if (Math.abs(g.total - g.ratedCfm) / g.ratedCfm > CFM_COMPATIBILITY_TOLERANCE)
        blockers.push(
          `${g.names.join(" + ")}: combined branch duct CFM (${Math.round(g.total)}) differs from the shared unit's rated airflow (${g.ratedCfm}) by more than ${Math.round(CFM_COMPATIBILITY_TOLERANCE * 100)}%.`,
        );
    }
  } else {
    for (const z of zwr) {
      const rated = i.zoneEquipment.find((e) => e.zoneId === z.id)?.selectedEquipment?.ratedCfm;
      if (rated == null) continue;
      const total = branchCfmForZone(z.id);
      if (Math.abs(total - rated) / rated > CFM_COMPATIBILITY_TOLERANCE)
        blockers.push(
          `${z.name}: total branch duct CFM (${Math.round(total)}) differs from its selected equipment's rated airflow (${rated}) by more than ${Math.round(CFM_COMPATIBILITY_TOLERANCE * 100)}%.`,
        );
    }
  }

  const proposalPending = !proposalResolved(rk, proposalKey(i.project.id, PROPOSAL_NAMES.ductDesign));
  if (cond.length > 0 && proposalPending)
    blockers.push("The Manual D duct-design proposal has not been Accepted or Overridden.");
  return {
    met: blockers.length === 0,
    blockers,
    progressed: branchByRoom.size > 0,
  };
}

export function equipmentExitGate(i: PipelineInput): GateResult {
  const blockers: string[] = [];
  const zwr = zonesWithConditionedRooms(i);
  let confirmed = 0;
  for (const z of zwr) {
    const sel = i.zoneEquipment.find((e) => e.zoneId === z.id)?.selectedEquipment ?? null;
    if (!sel) {
      blockers.push(`${z.name}: no equipment selected (Manual S).`);
      continue;
    }
    if (!sel.manufacturer || !sel.modelNumber || sel.coolingCapacityAtDesignBtuh == null) {
      blockers.push(
        `${z.name}: selected equipment is missing make/model, or has no interpolated capacity at this project's design conditions.`,
      );
    }
    if (z.equipment_selection_source == null || z.equipment_selection_source === "ai_proposed") {
      blockers.push(`${z.name}: the AI equipment pick has not been confirmed or overridden.`);
    } else {
      confirmed += 1;
    }
  }
  return { met: blockers.length === 0, blockers, progressed: confirmed > 0 };
}

export function ventilationExitGate(i: PipelineInput, rk: ReadonlySet<string>): GateResult {
  const blockers: string[] = [];
  const pending = i.exhaustSources.filter((s) => s.review_status === "pending_review");
  if (pending.length > 0)
    blockers.push(`${pending.length} draft exhaust source(s) are still pending review.`);
  const proposalPending = !proposalResolved(rk, proposalKey(i.project.id, PROPOSAL_NAMES.ventilation));
  if (conditionedRooms(i).length > 0 && proposalPending)
    blockers.push(
      i.makeupAirRequired
        ? "Ventilation, makeup-air, and dehumidification drafts have not been reviewed (Accept or Override)."
        : "Ventilation and dehumidification review has not been confirmed (Accept or Override).",
    );
  return { met: blockers.length === 0, blockers, progressed: true };
}

export function finalizeExitGate(i: PipelineInput): GateResult {
  const blockers: string[] = [];
  if (i.project.finalized_at == null) blockers.push("The project has not been Finalized.");
  if (i.latestSnapshotVersion == null) blockers.push("No calculation snapshot has been frozen.");
  return { met: blockers.length === 0, blockers, progressed: i.project.finalized_at != null };
}

const STAGE_GATES: Record<
  PipelineStage,
  (i: PipelineInput, rk: ReadonlySet<string>) => GateResult
> = {
  project: (i) => projectExitGate(i),
  climate: (i) => climateExitGate(i),
  orientation: (i, rk) => orientationExitGate(i, rk),
  drawings: (i) => drawingsExitGate(i),
  field_review: (i, rk) => fieldReviewExitGate(i, rk),
  rooms_envelope: (i, rk) => roomsEnvelopeExitGate(i, rk),
  zones: (i, rk) => zonesExitGate(i, rk),
  manual_j: (i) => manualJExitGate(i),
  duct_pins: (i, rk) => ductPinsExitGate(i, rk),
  manual_d: (i, rk) => manualDExitGate(i, rk),
  equipment: (i) => equipmentExitGate(i),
  ventilation: (i, rk) => ventilationExitGate(i, rk),
  finalize: (i) => finalizeExitGate(i),
};

// ---------------------------------------------------------------------------
// The one function.
// ---------------------------------------------------------------------------

export function computePipelineState(input: PipelineInput): PipelineState {
  const resolvedKeys = new Set(
    input.fieldResolutions.map((r) => resolutionKey(r.table_name, r.record_id, r.field_name)),
  );

  const stages = {} as Record<PipelineStage, StageState>;
  let priorExitMet = true;
  let currentStage: PipelineStage = "finalize";
  let currentFound = false;

  for (const stage of PIPELINE_STAGES) {
    const gate = STAGE_GATES[stage](input, resolvedKeys);
    const entryGateMet = priorExitMet;

    let status: StageStatus;
    if (!entryGateMet) status = "locked";
    else if (gate.met) status = "complete";
    else status = gate.progressed ? "in_progress" : "available";

    stages[stage] = {
      stage,
      status,
      blockers: entryGateMet ? gate.blockers : ["Finish the previous stage first."],
      entryGateMet,
      exitGateMet: gate.met,
    };

    if (entryGateMet && !gate.met && !currentFound) {
      currentStage = stage;
      currentFound = true;
    }
    priorExitMet = priorExitMet && gate.met;
  }

  const outstandingProposalList = listOutstandingProposals({
    project: { id: input.project.id },
    rooms: input.rooms,
    zones: input.zones,
    drawings: input.drawings,
    resolvedKeys,
  });

  const nonFinalize = PIPELINE_STAGES.filter((s) => s !== "finalize");
  const allPriorComplete = nonFinalize.every((s) => stages[s].exitGateMet);
  const canFinalize = allPriorComplete && outstandingProposalList.length === 0;

  return {
    stages,
    currentStage: currentFound ? currentStage : "finalize",
    canFinalize,
    finalized: input.project.finalized_at != null,
    outstandingProposals: outstandingProposalList.length,
    outstandingProposalList,
  };
}
