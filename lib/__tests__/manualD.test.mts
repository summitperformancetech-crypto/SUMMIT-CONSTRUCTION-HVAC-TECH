// Direct unit tests for lib/manualD.ts - the equal-friction duct-sizing
// engine had zero direct coverage before this file; the existing
// reportValidation/reportData/manualJ tests only exercise it indirectly
// (or not at all). Run via `npm test` (Vitest).
import { describe, it, expect } from "vitest";
import {
  computeRequiredCfm,
  computeRequiredCfmForRooms,
  computeZoneFrictionRates,
  sizeDuctRun,
  computeManualD,
  checkDuctInsulationCompliance,
  computeAvailableStaticPressure,
  estimateCoolingSupplyAirTempF,
  estimateHeatingSupplyAirTempF,
  TRUNK_MAX_VELOCITY_FPM,
  BRANCH_MAX_VELOCITY_FPM,
  type DuctSizingTableRow,
  type DuctRunInput,
} from "../manualD";
import type { RoomLoadResult } from "../manualJ";

describe("computeAvailableStaticPressure", () => {
  it("subtracts device losses from TESP", () => {
    const result = computeAvailableStaticPressure(0.5, {
      evaporatorCoilIwc: 0.18,
      airFilterIwc: 0.1,
      grillesRegistersIwc: 0.05,
    });
    expect(result.error).toBeNull();
    expect(result.totalDeviceLossesIwc).toBeCloseTo(0.33, 5);
    expect(result.availableStaticPressureIwc).toBeCloseTo(0.17, 5);
  });

  it("rejects a non-positive TESP", () => {
    const result = computeAvailableStaticPressure(0, {
      evaporatorCoilIwc: 0.1,
      airFilterIwc: 0.05,
      grillesRegistersIwc: 0.02,
    });
    expect(result.availableStaticPressureIwc).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("rejects device losses that meet or exceed TESP", () => {
    const result = computeAvailableStaticPressure(0.3, {
      evaporatorCoilIwc: 0.2,
      airFilterIwc: 0.1,
      grillesRegistersIwc: 0.05,
    });
    expect(result.availableStaticPressureIwc).toBeNull();
    expect(result.error).toMatch(/meet or exceed/);
  });
});

describe("estimateCoolingSupplyAirTempF", () => {
  it("applies the ACCA-standard 20F cooling split", () => {
    expect(estimateCoolingSupplyAirTempF(75)).toBe(55);
  });
});

describe("estimateHeatingSupplyAirTempF", () => {
  it("applies a 30F rise for a heat pump", () => {
    expect(estimateHeatingSupplyAirTempF(70, "heat_pump")).toBe(100);
  });

  it("applies a 50F rise for a furnace", () => {
    expect(estimateHeatingSupplyAirTempF(70, "furnace")).toBe(120);
  });
});

describe("computeRequiredCfm", () => {
  it("solves Btuh = 1.08 * cfm * deltaT for cfm", () => {
    // 10800 Btuh at a 20F deltaT (75F room, 55F supply) -> 500 cfm.
    expect(computeRequiredCfm(10800, 55, 75)).toBeCloseTo(500, 5);
  });

  it("returns null when supply air isn't colder than the room target (deltaT <= 0)", () => {
    expect(computeRequiredCfm(10800, 75, 75)).toBeNull();
    expect(computeRequiredCfm(10800, 80, 75)).toBeNull();
  });
});

describe("computeRequiredCfmForRooms", () => {
  it("returns null for every room when supplyAirTempF is null", () => {
    const rooms = [{ roomId: "r1", coolingSensibleBtuh: 10800 } as RoomLoadResult];
    const result = computeRequiredCfmForRooms(rooms, null, 75);
    expect(result.get("r1")).toBeNull();
  });

  it("computes per-room cfm keyed by roomId", () => {
    const rooms = [
      { roomId: "r1", coolingSensibleBtuh: 10800 } as RoomLoadResult,
      { roomId: "r2", coolingSensibleBtuh: 5400 } as RoomLoadResult,
    ];
    const result = computeRequiredCfmForRooms(rooms, 55, 75);
    expect(result.get("r1")).toBeCloseTo(500, 5);
    expect(result.get("r2")).toBeCloseTo(250, 5);
  });
});

function makeRun(overrides: Partial<DuctRunInput>): DuctRunInput {
  return {
    id: "run1",
    zoneId: "z1",
    runType: "branch",
    roomId: "r1",
    lengthFt: 0,
    fittingEquivalentLengthFt: 0,
    ductShape: "round",
    targetHeightIn: null,
    ...overrides,
  };
}

describe("computeZoneFrictionRates", () => {
  it("returns null for every run when no static pressure budget is set", () => {
    const runs = [makeRun({ zoneId: "z1" })];
    const result = computeZoneFrictionRates(runs, null);
    expect(result.get("z1")).toBeNull();
  });

  it("derives friction rate from the zone's longest (most resistant) path, not summed across runs", () => {
    // Two parallel branches in the same zone: 30ft+5ft=35ft and 10ft+2ft=12ft.
    // The longest (35ft) governs the zone's friction rate, not the sum.
    const runs = [
      makeRun({ id: "b1", zoneId: "z1", lengthFt: 30, fittingEquivalentLengthFt: 5 }),
      makeRun({ id: "b2", zoneId: "z1", lengthFt: 10, fittingEquivalentLengthFt: 2 }),
    ];
    const result = computeZoneFrictionRates(runs, 0.35);
    // availableStaticPressureIwc / (longestFt / 100) = 0.35 / (35/100) = 1.0
    expect(result.get("z1")).toBeCloseTo(1.0, 5);
  });

  it("computes friction rates independently per zone", () => {
    const runs = [
      makeRun({ id: "b1", zoneId: "z1", lengthFt: 40, fittingEquivalentLengthFt: 10 }),
      makeRun({ id: "b2", zoneId: "z2", lengthFt: 90, fittingEquivalentLengthFt: 10 }),
    ];
    const result = computeZoneFrictionRates(runs, 0.5);
    expect(result.get("z1")).toBeCloseTo(0.5 / (50 / 100), 5);
    expect(result.get("z2")).toBeCloseTo(0.5 / (100 / 100), 5);
  });
});

const table: DuctSizingTableRow[] = [
  { frictionRate: 0.1, diameterIn: 3, cfm: 40, velocityFpm: 900 },
  { frictionRate: 0.1, diameterIn: 4, cfm: 90, velocityFpm: 573 },
  { frictionRate: 0.1, diameterIn: 6, cfm: 200, velocityFpm: 764 },
  { frictionRate: 0.1, diameterIn: 8, cfm: 350, velocityFpm: 859 },
];

describe("sizeDuctRun", () => {
  it("picks the smallest tabulated diameter that carries the required cfm", () => {
    const result = sizeDuctRun(makeRun({ runType: "branch" }), 150, 0.1, table);
    expect(result.diameterIn).toBe(6);
    expect(result.exceedsTableRange).toBe(false);
  });

  it("flags exceedsTableRange and returns the largest size when cfm exceeds every tabulated row", () => {
    const result = sizeDuctRun(makeRun({ runType: "trunk" }), 1000, 0.1, table);
    expect(result.exceedsTableRange).toBe(true);
    expect(result.diameterIn).toBe(8);
  });

  it("warns when velocity exceeds the branch limit but not when it exceeds only the (higher) trunk limit", () => {
    // The 3in/40cfm row is tabulated at 900 fpm - over the 800 fpm branch
    // limit but under the 1500 fpm trunk limit.
    const branchResult = sizeDuctRun(makeRun({ runType: "branch" }), 35, 0.1, table);
    expect(branchResult.diameterIn).toBe(3);
    expect(branchResult.velocityFpm).toBeGreaterThan(BRANCH_MAX_VELOCITY_FPM);
    expect(branchResult.velocityWarning).not.toBeNull();

    const trunkResult = sizeDuctRun(makeRun({ runType: "trunk" }), 35, 0.1, table);
    expect(trunkResult.velocityFpm).toBeLessThan(TRUNK_MAX_VELOCITY_FPM);
    expect(trunkResult.velocityWarning).toBeNull();
  });

  it("sizes a rectangular run to the same equivalent diameter as the round lookup, at the requested height", () => {
    const result = sizeDuctRun(
      makeRun({ runType: "branch", ductShape: "rectangular", targetHeightIn: 8 }),
      150,
      0.1,
      table,
    );
    expect(result.diameterIn).toBeNull();
    expect(result.heightIn).toBe(8);
    expect(result.widthIn).not.toBeNull();
    // De = 1.30 * (a*b)^0.625 / (a+b)^0.25 should reproduce the round
    // lookup's 6in diameter within the bisection solver's tolerance.
    const w = result.widthIn as number;
    const h = result.heightIn as number;
    const equivalentDiameter = (1.3 * Math.pow(w * h, 0.625)) / Math.pow(w + h, 0.25);
    expect(equivalentDiameter).toBeCloseTo(6, 2);
    // Velocity is recomputed from the actual rectangular area, not copied
    // from the round row's tabulated velocity.
    expect(result.velocityFpm).toBeCloseTo(150 / ((w * h) / 144), 5);
  });
});

describe("computeManualD", () => {
  it("sizes a trunk to the sum of its zone's branch cfm, and each branch to its own room's cfm", () => {
    const runs: DuctRunInput[] = [
      makeRun({ id: "trunk1", zoneId: "z1", runType: "trunk", roomId: null, lengthFt: 20, fittingEquivalentLengthFt: 5 }),
      makeRun({ id: "b1", zoneId: "z1", runType: "branch", roomId: "r1", lengthFt: 15, fittingEquivalentLengthFt: 2 }),
      makeRun({ id: "b2", zoneId: "z1", runType: "branch", roomId: "r2", lengthFt: 10, fittingEquivalentLengthFt: 2 }),
    ];
    const requiredCfmByRoom = new Map<string, number | null>([
      ["r1", 120],
      ["r2", 80],
    ]);

    const results = computeManualD(runs, requiredCfmByRoom, 0.3, table);
    const byId = new Map(results.map((r) => [r.runId, r]));

    expect(byId.get("b1")?.cfm).toBe(120);
    expect(byId.get("b2")?.cfm).toBe(80);
    expect(byId.get("trunk1")?.cfm).toBe(200);
  });

  it("skips runs with zero or unresolvable cfm rather than sizing a zero-cfm duct", () => {
    // lengthFt > 0 so the zone's friction rate resolves - this isolates
    // the cfm===0 skip path specifically, not an unresolved friction rate.
    const runs: DuctRunInput[] = [makeRun({ id: "b1", roomId: "r-missing", lengthFt: 10 })];
    const results = computeManualD(runs, new Map(), 0.3, table);
    expect(results).toHaveLength(0);
  });
});

describe("checkDuctInsulationCompliance", () => {
  const roomsById = new Map([
    ["r1", { duct_location: "attic", duct_insulation_r_value: 4 }],
    ["r2", { duct_location: "attic", duct_insulation_r_value: 8 }],
    ["r3", { duct_location: "attic", duct_insulation_r_value: null }],
    ["r4", { duct_location: null, duct_insulation_r_value: 4 }],
  ]);
  const codeMinimumsByLocation = new Map([["attic", 6]]);

  it("flags a run whose insulation is below the code minimum for its room's location", () => {
    const runs: DuctRunInput[] = [makeRun({ id: "b1", roomId: "r1" })];
    const result = checkDuctInsulationCompliance(runs, roomsById, codeMinimumsByLocation);
    expect(result.get("b1")).toEqual({ runId: "b1", belowCodeMinimum: true, minRValue: 6, actualRValue: 4 });
  });

  it("does not flag a run that meets or exceeds the code minimum", () => {
    const runs: DuctRunInput[] = [makeRun({ id: "b2", roomId: "r2" })];
    const result = checkDuctInsulationCompliance(runs, roomsById, codeMinimumsByLocation);
    expect(result.get("b2")?.belowCodeMinimum).toBe(false);
  });

  it("treats an unspecified R-value as 'not specified', never as non-compliant", () => {
    const runs: DuctRunInput[] = [makeRun({ id: "b3", roomId: "r3" })];
    const result = checkDuctInsulationCompliance(runs, roomsById, codeMinimumsByLocation);
    expect(result.get("b3")?.belowCodeMinimum).toBe(false);
  });

  it("skips trunk runs and branch runs with no room_id entirely (not present in the result)", () => {
    const runs: DuctRunInput[] = [
      makeRun({ id: "trunk1", runType: "trunk", roomId: null }),
      makeRun({ id: "b-no-room", runType: "branch", roomId: null }),
    ];
    const result = checkDuctInsulationCompliance(runs, roomsById, codeMinimumsByLocation);
    expect(result.has("trunk1")).toBe(false);
    expect(result.has("b-no-room")).toBe(false);
  });
});
