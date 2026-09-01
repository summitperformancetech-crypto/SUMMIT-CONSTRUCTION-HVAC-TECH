// computePipelineState - the single source of truth for stage ordering /
// gating in the residential pipeline. These tests cover every stage
// predicate, every adjacent-pair lock/unlock transition, the "sections
// communicate" recompute, and canFinalize vs. outstanding proposals. Run
// via `npm test` (Vitest).
import { describe, it, expect } from "vitest";
import {
  computePipelineState,
  projectExitGate,
  climateExitGate,
  orientationExitGate,
  drawingsExitGate,
  fieldReviewExitGate,
  roomsEnvelopeExitGate,
  zonesExitGate,
  manualJExitGate,
  ductPinsExitGate,
  manualDExitGate,
  equipmentExitGate,
  ventilationExitGate,
  finalizeExitGate,
  PIPELINE_STAGES,
  type PipelineInput,
  type PipelineStage,
} from "../pipeline";
import { resolutionKey, type FieldResolution } from "../fieldResolutions";
import { proposalKey, PROPOSAL_NAMES } from "../aiProposals";
import type { ManualJResult, ZoneLoadResult } from "../manualJ";

const PID = "proj-1";
const Z1 = "zone-1";

function res(table: string, recordId: string, field: string): FieldResolution {
  return {
    id: `${table}-${recordId}-${field}`,
    project_id: PID,
    table_name: table,
    record_id: recordId,
    field_name: field,
    ai_extracted_value: null,
    final_value: "x",
    resolution_type: "accepted",
    override_reason: null,
    resolved_by: "user-1",
    resolved_at: "2026-09-01T00:00:00.000Z",
  };
}

function proposalRes(name: (typeof PROPOSAL_NAMES)[keyof typeof PROPOSAL_NAMES]): FieldResolution {
  return res("projects", PID, `proposal:${name}`);
}

function zoneLoad(zoneId: string | null, name: string, cooling: number, heating: number): ZoneLoadResult {
  const zero = {
    coolingSensibleBtuh: cooling * 0.75,
    coolingLatentBtuh: cooling * 0.25,
    wallsHeatingBtuh: 0,
    wallsCoolingBtuh: 0,
    glazingHeatingBtuh: 0,
    glazingCoolingBtuh: 0,
    ceilingsHeatingBtuh: 0,
    ceilingsCoolingBtuh: 0,
    floorsHeatingBtuh: 0,
    floorsCoolingBtuh: 0,
    infiltrationHeatingBtuh: 0,
    infiltrationCoolingSensibleBtuh: 0,
    infiltrationCoolingLatentBtuh: 0,
    doorHeatingBtuh: 0,
    doorCoolingBtuh: 0,
    ventilationCfm: 0,
    ventilationHeatingBtuh: 0,
    ventilationCoolingSensibleBtuh: 0,
    ventilationCoolingLatentBtuh: 0,
    internalGainsSensibleBtuh: 0,
    internalGainsLatentBtuh: 0,
    ductHeatingBtuh: 0,
    ductCoolingSensibleBtuh: 0,
    ductCoolingLatentBtuh: 0,
  };
  return {
    zoneId,
    zoneName: name,
    heatingBtuh: heating,
    coolingTotalBtuh: cooling,
    ...zero,
  };
}

function manualJ(): ManualJResult {
  return {
    rooms: [],
    zones: [zoneLoad(Z1, "Whole House", 24000, 30000)],
    wholeHouse: { ...zoneLoad(null, "Whole House", 24000, 30000) } as ManualJResult["wholeHouse"],
  };
}

// A PipelineInput where every stage's exit gate passes - a fully finalized
// project. Individual tests clone this and knock out one thing.
function fullInput(): PipelineInput {
  return {
    project: {
      id: PID,
      project_type: "residential",
      climate_confirmed: true,
      building_front_faces: "N",
      hvac_system_configuration: "single_system",
      finalized_at: "2026-09-01T00:00:00.000Z",
    },
    climateZone: {
      winter_design_temp_f: 12,
      summer_design_temp_f: 95,
      summer_coincident_wetbulb_f: 74,
    },
    rooms: [
      room("room-1", "Living Room"),
      room("room-2", "Bedroom"),
    ],
    zones: [
      {
        id: Z1,
        name: "Whole House",
        selected_equipment_id: "equip-1",
        equipment_selection_source: "human_confirmed",
        ahu_position_x_norm: 0.5,
        ahu_position_y_norm: 0.5,
        return_position_x_norm: 0.4,
        return_position_y_norm: 0.5,
        condenser_position_x_norm: 0.6,
        condenser_position_y_norm: 0.7,
      },
    ],
    drawings: [
      {
        id: "drawing-1",
        extraction_status: "completed",
        extracted_data: { building_envelope: {}, rooms: [] } as unknown as PipelineInput["drawings"][number]["extracted_data"],
        floor_plan_page_number: 6,
      },
    ],
    fieldResolutions: [
      proposalRes(PROPOSAL_NAMES.rooms),
      proposalRes(PROPOSAL_NAMES.zoning),
      proposalRes(PROPOSAL_NAMES.ductDesign),
      proposalRes(PROPOSAL_NAMES.ventilation),
    ],
    ductRuns: [
      { id: "run-1", run_type: "branch", room_id: "room-1", zone_id: Z1, cfm: 400 },
      { id: "run-2", run_type: "branch", room_id: "room-2", zone_id: Z1, cfm: 400 },
      { id: "trunk-1", run_type: "trunk", room_id: null, zone_id: Z1, cfm: 800 },
    ],
    exhaustSources: [],
    zoneEquipment: [
      {
        zoneId: Z1,
        selectedEquipment: {
          equipmentId: "equip-1",
          manufacturer: "Carrier",
          modelNumber: "24ABC6",
          ratedCfm: 800,
          coolingCapacityAtDesignBtuh: 24000,
        },
      },
    ],
    manualJ: manualJ(),
    makeupAirRequired: false,
    latestSnapshotVersion: 1,
  };
}

function room(id: string, name: string): PipelineInput["rooms"][number] {
  return {
    id,
    name,
    is_conditioned: true,
    floor_area_sqft: 200,
    zone_id: Z1,
    position_x_norm: 0.3,
    position_y_norm: 0.3,
    wall_north_len_ft: 12,
    wall_south_len_ft: 12,
    wall_east_len_ft: 16,
    wall_west_len_ft: 16,
    window_north_area_sqft: 0,
    window_south_area_sqft: 15,
    window_east_area_sqft: 0,
    window_west_area_sqft: 0,
  };
}

function clone(i: PipelineInput): PipelineInput {
  return JSON.parse(JSON.stringify(i));
}

describe("computePipelineState - fully valid project", () => {
  it("every stage is complete and the project is finalized", () => {
    const state = computePipelineState(fullInput());
    for (const stage of PIPELINE_STAGES) {
      expect(state.stages[stage].status, `${stage} should be complete`).toBe("complete");
      expect(state.stages[stage].exitGateMet, `${stage} exit gate`).toBe(true);
      expect(state.stages[stage].blockers, `${stage} blockers`).toEqual([]);
    }
    expect(state.currentStage).toBe("finalize");
    expect(state.canFinalize).toBe(true);
    expect(state.finalized).toBe(true);
    expect(state.outstandingProposals).toBe(0);
  });
});

describe("stage exit predicates", () => {
  const rk = new Set<string>();

  it("project: rejects non-residential", () => {
    const i = clone(fullInput());
    i.project.project_type = "commercial";
    expect(projectExitGate(i).met).toBe(false);
  });

  it("climate: needs confirmation AND all three design temps", () => {
    const i = clone(fullInput());
    i.project.climate_confirmed = false;
    expect(climateExitGate(i).met).toBe(false);
    const j = clone(fullInput());
    j.climateZone!.summer_coincident_wetbulb_f = null;
    expect(climateExitGate(j).met).toBe(false);
  });

  it("orientation: needs a cardinal direction, or an intercardinal acknowledgement", () => {
    const none = clone(fullInput());
    none.project.building_front_faces = null;
    expect(orientationExitGate(none, rk).met).toBe(false);

    const inter = clone(fullInput());
    inter.project.building_front_faces = "NE";
    expect(orientationExitGate(inter, new Set()).met).toBe(false);
    const ackKey = resolutionKey("projects", PID, "orientation_intercardinal_ack");
    expect(orientationExitGate(inter, new Set([ackKey])).met).toBe(true);
  });

  it("drawings: every drawing completed AND exactly one floor-plan page", () => {
    const none = clone(fullInput());
    none.drawings = [];
    expect(drawingsExitGate(none).met).toBe(false);

    const pending = clone(fullInput());
    pending.drawings[0].extraction_status = "pending";
    expect(drawingsExitGate(pending).met).toBe(false);

    const noFp = clone(fullInput());
    noFp.drawings[0].floor_plan_page_number = null;
    expect(drawingsExitGate(noFp).met).toBe(false);

    const twoFp = clone(fullInput());
    twoFp.drawings.push({ ...twoFp.drawings[0], id: "drawing-2" });
    expect(drawingsExitGate(twoFp).met).toBe(false);
  });

  it("field_review: any unresolved extraction field blocks", () => {
    const i = clone(fullInput());
    i.drawings[0].extracted_data = {
      building_envelope: {},
      rooms: [{ name: "Kitchen", unresolved: true, reason: "guessed" }],
    } as unknown as PipelineInput["drawings"][number]["extracted_data"];
    expect(fieldReviewExitGate(i, new Set()).met).toBe(false);
  });

  it("rooms_envelope: needs conditioned rooms, floor areas, glazing, and the accepted proposal", () => {
    const noRooms = clone(fullInput());
    noRooms.rooms = [];
    expect(roomsEnvelopeExitGate(noRooms, new Set()).met).toBe(false);

    const noArea = clone(fullInput());
    noArea.rooms[0].floor_area_sqft = null;
    expect(roomsEnvelopeExitGate(noArea, keySet(noArea)).met).toBe(false);

    const noGlazing = clone(fullInput());
    for (const r of noGlazing.rooms) r.window_south_area_sqft = 0;
    expect(roomsEnvelopeExitGate(noGlazing, keySet(noGlazing)).met).toBe(false);

    const proposalPending = clone(fullInput());
    proposalPending.fieldResolutions = proposalPending.fieldResolutions.filter(
      (r) => r.field_name !== `proposal:${PROPOSAL_NAMES.rooms}`,
    );
    expect(roomsEnvelopeExitGate(proposalPending, keySet(proposalPending)).met).toBe(false);
  });

  it("zones: every conditioned room zoned, and the accepted proposal", () => {
    const unzoned = clone(fullInput());
    unzoned.rooms[0].zone_id = null;
    expect(zonesExitGate(unzoned, keySet(unzoned)).met).toBe(false);

    const proposalPending = clone(fullInput());
    proposalPending.fieldResolutions = proposalPending.fieldResolutions.filter(
      (r) => r.field_name !== `proposal:${PROPOSAL_NAMES.zoning}`,
    );
    expect(zonesExitGate(proposalPending, keySet(proposalPending)).met).toBe(false);
  });

  it("manual_j: needs a result and non-zero cooling per zone-with-rooms", () => {
    const noResult = clone(fullInput());
    noResult.manualJ = null;
    expect(manualJExitGate(noResult).met).toBe(false);

    const zeroLoad = clone(fullInput());
    zeroLoad.manualJ!.zones[0].coolingTotalBtuh = 0;
    expect(manualJExitGate(zeroLoad).met).toBe(false);
  });

  it("duct_pins: every conditioned room pin + zone AHU/return/condenser pins", () => {
    const noRoomPin = clone(fullInput());
    noRoomPin.rooms[0].position_x_norm = null;
    noRoomPin.rooms[0].position_y_norm = null;
    expect(ductPinsExitGate(noRoomPin, new Set()).met).toBe(false);

    const noAhu = clone(fullInput());
    noAhu.zones[0].ahu_position_x_norm = null;
    expect(ductPinsExitGate(noAhu, new Set()).met).toBe(false);

    // a field_resolutions 'position' row counts even without the column set
    const viaResolution = clone(fullInput());
    viaResolution.rooms[0].position_x_norm = null;
    viaResolution.rooms[0].position_y_norm = null;
    const rkPins = new Set([resolutionKey("rooms", "room-1", "position")]);
    expect(ductPinsExitGate(viaResolution, rkPins).met).toBe(true);
  });

  it("manual_d: branch run per room + CFM within 15% + accepted proposal", () => {
    const missingBranch = clone(fullInput());
    missingBranch.ductRuns = missingBranch.ductRuns.filter((r) => r.room_id !== "room-2");
    expect(manualDExitGate(missingBranch, keySet(missingBranch)).met).toBe(false);

    const cfmMismatch = clone(fullInput());
    cfmMismatch.ductRuns.find((r) => r.id === "run-1")!.cfm = 900;
    expect(manualDExitGate(cfmMismatch, keySet(cfmMismatch)).met).toBe(false);

    const proposalPending = clone(fullInput());
    proposalPending.fieldResolutions = proposalPending.fieldResolutions.filter(
      (r) => r.field_name !== `proposal:${PROPOSAL_NAMES.ductDesign}`,
    );
    expect(manualDExitGate(proposalPending, keySet(proposalPending)).met).toBe(false);
  });

  it("equipment: selection present, complete, and human-confirmed (not ai_proposed)", () => {
    const none = clone(fullInput());
    none.zoneEquipment[0].selectedEquipment = null;
    expect(equipmentExitGate(none).met).toBe(false);

    const stillAi = clone(fullInput());
    stillAi.zones[0].equipment_selection_source = "ai_proposed";
    expect(equipmentExitGate(stillAi).met).toBe(false);

    const incomplete = clone(fullInput());
    incomplete.zoneEquipment[0].selectedEquipment!.coolingCapacityAtDesignBtuh = null;
    expect(equipmentExitGate(incomplete).met).toBe(false);
  });

  it("ventilation: no pending drafts + confirmed review", () => {
    const pendingDraft = clone(fullInput());
    pendingDraft.exhaustSources = [{ id: "ex-1", review_status: "pending_review" }];
    expect(ventilationExitGate(pendingDraft, keySet(pendingDraft)).met).toBe(false);

    const notReviewed = clone(fullInput());
    notReviewed.fieldResolutions = notReviewed.fieldResolutions.filter(
      (r) => r.field_name !== `proposal:${PROPOSAL_NAMES.ventilation}`,
    );
    expect(ventilationExitGate(notReviewed, keySet(notReviewed)).met).toBe(false);
  });

  it("finalize: needs finalized_at and a snapshot", () => {
    const notFinal = clone(fullInput());
    notFinal.project.finalized_at = null;
    expect(finalizeExitGate(notFinal).met).toBe(false);

    const noSnap = clone(fullInput());
    noSnap.latestSnapshotVersion = null;
    expect(finalizeExitGate(noSnap).met).toBe(false);
  });
});

function keySet(i: PipelineInput): Set<string> {
  return new Set(i.fieldResolutions.map((r) => resolutionKey(r.table_name, r.record_id, r.field_name)));
}

describe("strict in-order gating - every stage gates the next", () => {
  // For each non-terminal stage, break exactly that stage's exit gate and
  // assert the immediately following stage is locked; then repair it and
  // assert the following stage is no longer locked.
  const breakers: Partial<Record<PipelineStage, (i: PipelineInput) => void>> = {
    project: (i) => {
      i.project.project_type = "commercial";
    },
    climate: (i) => {
      i.project.climate_confirmed = false;
    },
    orientation: (i) => {
      i.project.building_front_faces = null;
    },
    drawings: (i) => {
      i.drawings[0].floor_plan_page_number = null;
    },
    field_review: (i) => {
      i.drawings[0].extracted_data = {
        building_envelope: {},
        rooms: [{ name: "X", unresolved: true, reason: null }],
      } as unknown as PipelineInput["drawings"][number]["extracted_data"];
    },
    rooms_envelope: (i) => {
      i.rooms[0].floor_area_sqft = null;
    },
    zones: (i) => {
      i.rooms[0].zone_id = null;
    },
    manual_j: (i) => {
      i.manualJ!.zones[0].coolingTotalBtuh = 0;
    },
    duct_pins: (i) => {
      i.rooms[0].position_x_norm = null;
      i.rooms[0].position_y_norm = null;
    },
    manual_d: (i) => {
      i.ductRuns = i.ductRuns.filter((r) => r.room_id !== "room-1");
    },
    equipment: (i) => {
      i.zones[0].equipment_selection_source = "ai_proposed";
    },
    ventilation: (i) => {
      i.exhaustSources = [{ id: "ex-1", review_status: "pending_review" }];
    },
  };

  const stageList = PIPELINE_STAGES.filter((s) => s !== "finalize");
  for (let idx = 0; idx < stageList.length; idx++) {
    const stage = stageList[idx];
    const next = PIPELINE_STAGES[PIPELINE_STAGES.indexOf(stage) + 1];
    it(`${stage} incomplete -> ${next} is locked; ${stage} complete -> ${next} unlocks`, () => {
      const broken = clone(fullInput());
      broken.project.finalized_at = null;
      broken.latestSnapshotVersion = null;
      breakers[stage]!(broken);
      const brokenState = computePipelineState(broken);
      expect(brokenState.stages[stage].exitGateMet).toBe(false);
      expect(brokenState.stages[next].status).toBe("locked");
      expect(brokenState.stages[next].entryGateMet).toBe(false);

      const fixed = clone(fullInput());
      fixed.project.finalized_at = null;
      fixed.latestSnapshotVersion = null;
      const fixedState = computePipelineState(fixed);
      expect(fixedState.stages[stage].exitGateMet).toBe(true);
      expect(fixedState.stages[next].status).not.toBe("locked");
      expect(fixedState.stages[next].entryGateMet).toBe(true);
    });
  }
});

describe("sections communicate - one recompute, no reload", () => {
  it("resolving the last Manual D blocker flips Equipment from locked to actionable in the same recompute", () => {
    const i = clone(fullInput());
    i.project.finalized_at = null;
    i.latestSnapshotVersion = null;
    i.zones[0].equipment_selection_source = null; // equipment not done either, but that's stage 11
    // break manual_d: drop the duct-design proposal acceptance
    i.fieldResolutions = i.fieldResolutions.filter(
      (r) => r.field_name !== `proposal:${PROPOSAL_NAMES.ductDesign}`,
    );

    const before = computePipelineState(i);
    expect(before.stages.manual_d.exitGateMet).toBe(false);
    expect(before.stages.equipment.status).toBe("locked");

    // the technician Accepts the duct-design proposal - a single new row
    i.fieldResolutions.push(proposalRes(PROPOSAL_NAMES.ductDesign));
    const after = computePipelineState(i);
    expect(after.stages.manual_d.exitGateMet).toBe(true);
    expect(after.stages.equipment.status).not.toBe("locked");
    expect(after.stages.equipment.entryGateMet).toBe(true);
  });
});

describe("canFinalize vs. outstanding proposals", () => {
  it("is false while any AI proposal is unreviewed, even if every stage predicate passes", () => {
    const i = clone(fullInput());
    // Every stage exit gate still passes for ventilation because there are
    // no pending drafts, but remove the ventilation review acceptance:
    i.fieldResolutions = i.fieldResolutions.filter(
      (r) => r.field_name !== `proposal:${PROPOSAL_NAMES.ventilation}`,
    );
    const state = computePipelineState(i);
    expect(state.outstandingProposals).toBeGreaterThan(0);
    expect(state.canFinalize).toBe(false);
  });

  it("outstandingProposalList names the room-pin and equipment proposals when those are unresolved", () => {
    const i = clone(fullInput());
    i.project.finalized_at = null;
    i.latestSnapshotVersion = null;
    i.rooms[0].position_x_norm = null;
    i.rooms[0].position_y_norm = null;
    i.zones[0].equipment_selection_source = null;
    const state = computePipelineState(i);
    const labels = state.outstandingProposalList.map((p) => p.label);
    expect(labels.some((l) => l.includes("Duct-routing pin"))).toBe(true);
    expect(labels.some((l) => l.includes("Equipment pick"))).toBe(true);
  });
});

describe("proposeKey helper stays aligned with resolutionKey", () => {
  it("proposalKey composes the same triple resolutionKey does", () => {
    expect(proposalKey(PID, PROPOSAL_NAMES.rooms)).toBe(
      resolutionKey("projects", PID, "proposal:rooms"),
    );
  });
});
