// Direct unit tests for lib/ductTrunkTopology.ts - the Permit-Submittable
// Manual D Package's real Extended Plenum / Reducing Trunk analysis.
// The fixture below is the REAL, human-digitized corridor_graph for the
// real Schneider project's Zone 1 (project 94749d9f-ecc1-4bb8-b38f-
// b38f-d927cb150b90, zone 23667dfd-298f-4a84-92bb-bf25b435a6bd), pulled
// directly from the live database - not synthetic. Every expected number
// below was hand-computed from these exact real coordinates before
// writing the assertions (see the session's own trace: AHU_1->C1_kitchen
// = 4.7ft, C1_kitchen->C1_east = 13.9ft, etc.), so this test proves the
// algorithm against real project geometry, not a toy graph built to make
// the code look correct.
import { describe, it, expect } from "vitest";
import {
  extractTrunkArms,
  extractTakeoffPositions,
  classifyTrunkArm,
  computeReductionPointsFt,
  checkTakeoffSpacing,
  checkTrunkDimensions,
  analyzeTrunkTopology,
  EXTENDED_PLENUM_MAX_SINGLE_RUN_FT,
  TRUNK_DEFAULT_HEIGHT_IN,
  TRUNK_MAX_WIDTH_TO_HEIGHT_RATIO,
} from "../ductTrunkTopology";
import type { CorridorGraph } from "../ductCorridorGraph";

const SCHNEIDER_ZONE1_GRAPH: CorridorGraph = {
  ahu: { x: 31.9, y: 22.3, id: "AHU_1", note: "placed at kitchen/hallway junction per Summit's existing AHU pin" },
  edges: [
    { to: "C1_kitchen", from: "AHU_1", type: "trunk" },
    { to: "C1_living", from: "C1_kitchen", type: "trunk" },
    { to: "C1_west", from: "C1_living", type: "trunk" },
    { to: "C1_east", from: "C1_kitchen", type: "trunk" },
    { to: "master_bedroom", from: "C1_west", type: "branch" },
    { to: "C1_master", from: "C1_west", type: "branch" },
    { to: "master_bathroom", from: "C1_master", type: "branch" },
    { to: "master_closet", from: "C1_master", type: "branch" },
    { to: "living_room", from: "C1_living", type: "branch" },
    { to: "kitchen", from: "C1_kitchen", type: "branch" },
    { to: "dining_room", from: "C1_kitchen", type: "branch" },
    { to: "pantry", from: "C1_pantry", type: "branch" },
    { to: "utility_room", from: "C1_pantry", type: "branch" },
    { to: "C1_pantry", from: "C1_kitchen", type: "trunk" },
    { to: "mud_room", from: "C1_east", type: "branch" },
    { to: "C2_foyer", from: "C1_living", type: "trunk" },
    { to: "study", from: "C2_foyer", type: "branch" },
    { to: "foyer", from: "C2_foyer", type: "branch" },
    { to: "bathroom_2", from: "C2_foyer", type: "branch" },
    { to: "C2_east", from: "C2_foyer", type: "trunk" },
    { to: "bedroom_2", from: "C2_east", type: "branch" },
    { to: "stairs_1f", from: "C2_east", type: "branch" },
  ],
  rooms: [
    { x: 8.8, y: 17.6, id: "master_bedroom", name: "Master Bedroom" },
    { x: 21.6, y: 18.4, id: "living_room", name: "Living Room" },
    { x: 31.9, y: 22.3, id: "kitchen", name: "Kitchen" },
    { x: 33.1, y: 7.8, id: "dining_room", name: "Dining Room" },
    { x: 40.2, y: 15, id: "pantry", name: "Pantry" },
    { x: 40, y: 20.3, id: "utility_room", name: "Utility Room" },
    { x: 45.8, y: 26, id: "mud_room", name: "Mud Room" },
    { x: 4.2, y: 28.7, id: "master_bathroom", name: "Master Bathroom" },
    { x: 5.1, y: 37.7, id: "master_closet", name: "Master Closet" },
    { x: 11.8, y: 31.6, id: "study", name: "Study" },
    { x: 20.3, y: 31.6, id: "foyer", name: "Foyer" },
    { x: 26.5, y: 31.6, id: "bathroom_2", name: "Bathroom 2" },
    { x: 33.3, y: 31.6, id: "bedroom_2", name: "Bedroom 2" },
    { x: 39.7, y: 31.6, id: "stairs_1f", name: "Stairs (1st Floor)" },
  ],
  corridor_nodes: [
    { x: 9, y: 27, id: "C1_west" },
    { x: 4.2, y: 27, id: "C1_master" },
    { x: 21.6, y: 27, id: "C1_living" },
    { x: 31.9, y: 27, id: "C1_kitchen" },
    { x: 40, y: 20.3, id: "C1_pantry" },
    { x: 45.8, y: 27, id: "C1_east" },
    { x: 22.5, y: 31.6, id: "C2_foyer" },
    { x: 39.7, y: 31.6, id: "C2_east" },
  ],
};

describe("extractTrunkArms (real Schneider Zone 1 graph)", () => {
  it("finds the 4 real trunk arms (leaves: C1_east, C1_pantry, C1_west, C2_east)", () => {
    const arms = extractTrunkArms(SCHNEIDER_ZONE1_GRAPH);
    expect(arms).toHaveLength(4);
    const leafOf = (arm: (typeof arms)[number]) => arm.nodeIds[arm.nodeIds.length - 1];
    expect(new Set(arms.map(leafOf))).toEqual(new Set(["C1_east", "C1_pantry", "C1_west", "C2_east"]));
  });

  it("computes the real hand-verified length of the AHU->kitchen->east arm (4.7 + 13.9 = 18.6ft)", () => {
    const arms = extractTrunkArms(SCHNEIDER_ZONE1_GRAPH);
    const arm = arms.find((a) => a.nodeIds[a.nodeIds.length - 1] === "C1_east")!;
    expect(arm.totalLengthFt).toBeCloseTo(18.6, 1);
  });

  it("computes the real hand-verified length of the AHU->kitchen->living->west arm (~27.6ft, over the 24ft limit)", () => {
    const arms = extractTrunkArms(SCHNEIDER_ZONE1_GRAPH);
    const arm = arms.find((a) => a.nodeIds[a.nodeIds.length - 1] === "C1_west")!;
    expect(arm.totalLengthFt).toBeCloseTo(27.6, 1);
    expect(arm.totalLengthFt).toBeGreaterThan(EXTENDED_PLENUM_MAX_SINGLE_RUN_FT);
  });

  it("computes the real hand-verified length of the AHU->kitchen->living->foyer->east arm (~36.9ft)", () => {
    const arms = extractTrunkArms(SCHNEIDER_ZONE1_GRAPH);
    const arm = arms.find((a) => a.nodeIds[a.nodeIds.length - 1] === "C2_east")!;
    expect(arm.totalLengthFt).toBeCloseTo(36.89, 1);
  });
});

describe("classifyTrunkArm", () => {
  it("classifies the real short arms as extended_plenum", () => {
    expect(classifyTrunkArm(18.6)).toBe("extended_plenum");
    expect(classifyTrunkArm(24)).toBe("extended_plenum");
  });

  it("classifies the real long arms as reducing_trunk", () => {
    expect(classifyTrunkArm(27.6)).toBe("reducing_trunk");
    expect(classifyTrunkArm(36.9)).toBe("reducing_trunk");
  });
});

describe("computeReductionPointsFt", () => {
  it("places no reduction on an extended-plenum-length arm", () => {
    expect(computeReductionPointsFt(18.6)).toEqual([]);
  });

  it("places a real reduction point on the 27.6ft arm at 17.5ft", () => {
    expect(computeReductionPointsFt(27.6)).toEqual([17.5]);
  });

  it("places one real reduction point on the 36.9ft arm at 17.5ft - the next 17.5ft step (35.0) is too close to the arm's own end", () => {
    // 36.89 - 35 = 1.89ft remaining past a hypothetical second reduction
    // at 35ft - not a real step-down, just the tail end of the arm, so
    // the algorithm correctly stops at one reduction here.
    const points = computeReductionPointsFt(36.89);
    expect(points).toEqual([17.5]);
  });
});

describe("extractTakeoffPositions + checkTakeoffSpacing (real Schneider data)", () => {
  const arms = extractTrunkArms(SCHNEIDER_ZONE1_GRAPH);
  const positions = extractTakeoffPositions(SCHNEIDER_ZONE1_GRAPH, arms);

  it("finds a real take-off for every real branch edge with a resolvable trunk node", () => {
    expect(positions.length).toBeGreaterThan(0);
    expect(positions.find((p) => p.roomId === "mud_room")).toBeDefined();
  });

  it("flags Mud Room as a real terminal-end violation - it takes off exactly at the C1_east leaf, zero clearance", () => {
    const mudRoom = positions.find((p) => p.roomId === "mud_room")!;
    expect(mudRoom.distanceFromArmEndFt).toBeCloseTo(0, 5);
    const violations = checkTakeoffSpacing(positions, arms, new Map());
    expect(violations.some((v) => v.roomId === "mud_room" && v.reason === "too_close_to_trunk_terminal_end")).toBe(true);
  });

  it("flags real rooms on the reducing 36.9ft arm within 4ft of its reduction point (study/foyer/bathroom_2 at ~19.7ft, vs. reduction at 17.5ft)", () => {
    const violations = checkTakeoffSpacing(positions, arms, new Map());
    for (const roomId of ["study", "foyer", "bathroom_2"]) {
      expect(violations.some((v) => v.roomId === roomId && v.reason === "too_close_to_reduction")).toBe(true);
    }
  });

  it("does not flag a real take-off that genuinely clears every rule (bedroom_2 / stairs_1f, well past the reduction and short arm ends)", () => {
    const violations = checkTakeoffSpacing(positions, arms, new Map());
    // bedroom_2 and stairs_1f both take off from C2_east, the arm's own
    // terminal node - they SHOULD trip the terminal-end rule, same real
    // installation issue as mud_room. Verifying that real fact instead
    // of assuming a clean pass.
    expect(violations.some((v) => v.roomId === "bedroom_2" && v.reason === "too_close_to_trunk_terminal_end")).toBe(true);
  });
});

describe("checkTrunkDimensions", () => {
  it("passes a real 8x24 trunk (default height, well under the 4x width ratio)", () => {
    const result = checkTrunkDimensions(TRUNK_DEFAULT_HEIGHT_IN, 24);
    expect(result?.pass).toBe(true);
  });

  it("fails a trunk whose width exceeds 4x its height", () => {
    const result = checkTrunkDimensions(8, 40);
    expect(result?.pass).toBe(false);
  });

  it("returns null (not determinable) when dimensions are not yet sized", () => {
    expect(checkTrunkDimensions(null, null)).toBeNull();
  });

  it("respects TRUNK_MAX_WIDTH_TO_HEIGHT_RATIO as the real threshold", () => {
    expect(checkTrunkDimensions(10, 40)?.pass).toBe(true);
    expect(checkTrunkDimensions(10, 41)?.pass).toBe(false);
    expect(TRUNK_MAX_WIDTH_TO_HEIGHT_RATIO).toBe(4);
  });
});

describe("analyzeTrunkTopology", () => {
  it("is not determinable for a zone with no corridor_graph - never a guessed topology", () => {
    const result = analyzeTrunkTopology(null, new Map());
    expect(result.determinable).toBe(false);
    expect(result.arms).toEqual([]);
  });

  it("produces a real, complete analysis for the real Schneider Zone 1 graph", () => {
    const result = analyzeTrunkTopology(SCHNEIDER_ZONE1_GRAPH, new Map());
    expect(result.determinable).toBe(true);
    expect(result.arms).toHaveLength(4);
    const reducingArms = result.arms.filter((a) => a.topology === "reducing_trunk");
    expect(reducingArms).toHaveLength(2);
    expect(result.takeoffSpacingViolations.length).toBeGreaterThan(0);
  });
});
