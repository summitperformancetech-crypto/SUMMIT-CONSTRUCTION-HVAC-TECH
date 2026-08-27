// Direct unit tests for lib/manualS.ts - equipment selection (bilinear OEM
// performance interpolation, ACCA sizing windows, heat-pump balance point,
// compatibility scoring) had zero direct coverage before this file. Run
// via `npm test` (Vitest).
import { describe, it, expect } from "vitest";
import {
  interpolateCoolingCapacity,
  interpolateHeatingCapacity,
  computeBalancePointF,
  computeSupplementalHeatBtuh,
  isCompatible,
  computeCompatibilityScore,
  evaluateEquipment,
  rankEquipment,
  selectTopEquipmentByManufacturer,
  PREFERRED_MANUFACTURER_RESULT_COUNT,
  MANUFACTURER_FALLBACK_RESULT_COUNT,
  AC_COOLING_MIN_FRACTION,
  AC_COOLING_MAX_FRACTION,
  type PerformancePoint,
  type EquipmentCatalogEntry,
  type EquipmentEvaluation,
} from "../manualS";

function equipment(overrides: Partial<EquipmentCatalogEntry>): EquipmentCatalogEntry {
  return {
    id: "eq1",
    manufacturer: "Carrier",
    modelNumber: "24TEST",
    equipmentType: "split_ac",
    stageType: "single",
    nominalCoolingCapacityBtu: null,
    nominalHeatingCapacityBtu: null,
    ratedCfm: null,
    sourceDocument: "test fixture",
    directVentCapable: null,
    ...overrides,
  };
}

// A regular 2x2 grid of cooling points - outdoor temp {95,105} x entering
// wetbulb {63,67} - lets a midpoint query be checked as a plain average
// without re-implementing bilinear interpolation in the test itself.
const coolingGrid: PerformancePoint[] = [
  { equipmentId: "eq1", mode: "cooling", outdoorTempF: 95, indoorEnteringTempF: 75, indoorEnteringWetbulbF: 63, sensibleCapacityBtu: 27000, totalCapacityBtu: 36000, inputPowerKw: 3.5 },
  { equipmentId: "eq1", mode: "cooling", outdoorTempF: 105, indoorEnteringTempF: 75, indoorEnteringWetbulbF: 63, sensibleCapacityBtu: 25500, totalCapacityBtu: 34000, inputPowerKw: 3.8 },
  { equipmentId: "eq1", mode: "cooling", outdoorTempF: 95, indoorEnteringTempF: 75, indoorEnteringWetbulbF: 67, sensibleCapacityBtu: 26000, totalCapacityBtu: 37000, inputPowerKw: 3.6 },
  { equipmentId: "eq1", mode: "cooling", outdoorTempF: 105, indoorEnteringTempF: 75, indoorEnteringWetbulbF: 67, sensibleCapacityBtu: 24500, totalCapacityBtu: 35000, inputPowerKw: 3.9 },
];

describe("interpolateCoolingCapacity", () => {
  it("returns the exact tabulated value at a real grid point", () => {
    const result = interpolateCoolingCapacity(coolingGrid, 95, 63);
    expect(result?.totalCapacityBtu).toBe(36000);
    expect(result?.clamped).toBe(false);
  });

  it("bilinearly interpolates at the midpoint of a regular grid to the plain average of all four corners", () => {
    const result = interpolateCoolingCapacity(coolingGrid, 100, 65);
    expect(result?.totalCapacityBtu).toBeCloseTo((36000 + 34000 + 37000 + 35000) / 4, 5);
    expect(result?.clamped).toBe(false);
  });

  it("clamps to the nearest edge rather than extrapolating past the published data", () => {
    const result = interpolateCoolingCapacity(coolingGrid, 110, 63);
    // outdoorTempF above the max tabulated (105) - x brackets to (105,105),
    // so the result should match the 105F/63F corner exactly, not a
    // linear projection past it.
    expect(result?.totalCapacityBtu).toBe(34000);
    expect(result?.clamped).toBe(true);
  });

  it("returns null when no cooling points exist", () => {
    expect(interpolateCoolingCapacity([], 95, 63)).toBeNull();
  });
});

const heatingCurve: PerformancePoint[] = [
  { equipmentId: "eq1", mode: "heating", outdoorTempF: 5, indoorEnteringTempF: 70, indoorEnteringWetbulbF: null, sensibleCapacityBtu: 20000, totalCapacityBtu: 20000, inputPowerKw: 3.0 },
  { equipmentId: "eq1", mode: "heating", outdoorTempF: 17, indoorEnteringTempF: 70, indoorEnteringWetbulbF: null, sensibleCapacityBtu: 24000, totalCapacityBtu: 24000, inputPowerKw: 3.2 },
  { equipmentId: "eq1", mode: "heating", outdoorTempF: 47, indoorEnteringTempF: 70, indoorEnteringWetbulbF: null, sensibleCapacityBtu: 40000, totalCapacityBtu: 40000, inputPowerKw: 4.0 },
];

describe("interpolateHeatingCapacity", () => {
  it("linearly interpolates between the two bracketing outdoor-temp points", () => {
    const result = interpolateHeatingCapacity(heatingCurve, 32);
    expect(result?.totalCapacityBtu).toBeCloseTo(32000, 5);
    expect(result?.clamped).toBe(false);
  });

  it("clamps below the lowest tabulated outdoor temp", () => {
    const result = interpolateHeatingCapacity(heatingCurve, -10);
    expect(result?.totalCapacityBtu).toBe(20000);
    expect(result?.clamped).toBe(true);
  });
});

describe("computeBalancePointF", () => {
  it("finds the outdoor temp where interpolated capacity crosses the heating load", () => {
    // Between 17F (24000 Btuh) and 47F (40000 Btuh), crossing a 30000 Btuh
    // load: t = (30000-24000)/(40000-24000) = 0.375 -> 17 + 30*0.375 = 28.25.
    const balancePoint = computeBalancePointF(heatingCurve, 30000);
    expect(balancePoint).toBeCloseTo(28.25, 5);
  });

  it("returns null when capacity meets the load across the entire published range", () => {
    expect(computeBalancePointF(heatingCurve, 10000)).toBeNull();
  });

  it("returns null with fewer than two heating points", () => {
    expect(computeBalancePointF([heatingCurve[0]], 30000)).toBeNull();
  });
});

describe("computeSupplementalHeatBtuh", () => {
  it("returns the gap between the load and derated capacity at design conditions", () => {
    expect(computeSupplementalHeatBtuh(heatingCurve, 5, 30000)).toBeCloseTo(10000, 5);
  });

  it("returns zero when the heat pump alone covers the load at design conditions", () => {
    expect(computeSupplementalHeatBtuh(heatingCurve, 47, 30000)).toBe(0);
  });
});

describe("isCompatible", () => {
  it("gates a furnace on the heating window only, ignoring cooling", () => {
    expect(isCompatible({ equipment: equipment({ equipmentType: "furnace" }), withinCoolingWindow: false, withinHeatingWindow: true })).toBe(true);
    expect(isCompatible({ equipment: equipment({ equipmentType: "furnace" }), withinCoolingWindow: true, withinHeatingWindow: false })).toBe(false);
  });

  it("gates AC/heat_pump/package_unit on the cooling window, ignoring heating", () => {
    for (const equipmentType of ["split_ac", "heat_pump", "package_unit"] as const) {
      expect(isCompatible({ equipment: equipment({ equipmentType }), withinCoolingWindow: true, withinHeatingWindow: false })).toBe(true);
      expect(isCompatible({ equipment: equipment({ equipmentType }), withinCoolingWindow: false, withinHeatingWindow: true })).toBe(false);
    }
  });
});

describe("computeCompatibilityScore", () => {
  it("scores a perfectly-matched furnace (100% cooling n/a, 100% heating, variable-speed) at 1.0", () => {
    const score = computeCompatibilityScore({
      equipment: equipment({ equipmentType: "furnace", stageType: "variable_speed" }),
      coolingPercentOfLoad: 1,
      heatingPercentOfLoad: 1,
      supplementalHeatBtuh: null,
      manualJHeatingBtuh: 30000,
    });
    expect(score).toBeCloseTo(1, 5);
  });

  it("drops the heating factor (not a penalty) for cooling-only equipment and reweights", () => {
    // split_ac with no heating pairing at all: coolingFit=1 (weight 0.45),
    // stagingFit=0.6 for "single" (weight 0.25), heating dropped entirely.
    const score = computeCompatibilityScore({
      equipment: equipment({ equipmentType: "split_ac", stageType: "single" }),
      coolingPercentOfLoad: 1,
      heatingPercentOfLoad: null,
      supplementalHeatBtuh: null,
      manualJHeatingBtuh: 0,
    });
    expect(score).toBeCloseTo((1 * 0.45 + 0.6 * 0.25) / (0.45 + 0.25), 5);
  });

  it("rewards a heat pump needing less supplemental heat at design conditions", () => {
    const noSupplementalScore = computeCompatibilityScore({
      equipment: equipment({ equipmentType: "heat_pump", stageType: "single" }),
      coolingPercentOfLoad: 1,
      heatingPercentOfLoad: null,
      supplementalHeatBtuh: 0,
      manualJHeatingBtuh: 30000,
    });
    const heavySupplementalScore = computeCompatibilityScore({
      equipment: equipment({ equipmentType: "heat_pump", stageType: "single" }),
      coolingPercentOfLoad: 1,
      heatingPercentOfLoad: null,
      supplementalHeatBtuh: 20000,
      manualJHeatingBtuh: 30000,
    });
    expect(noSupplementalScore).toBeGreaterThan(heavySupplementalScore);
  });
});

describe("evaluateEquipment", () => {
  it("evaluates a straight AC against the cooling window using the design summer conditions", () => {
    const evaluation = evaluateEquipment(
      equipment({ equipmentType: "split_ac" }),
      coolingGrid,
      36000 / 1.05, // manualJCoolingTotalBtuh chosen so coolingPercentOfLoad lands at 1.05
      0,
      95,
      63,
      17,
    );
    expect(evaluation.coolingPercentOfLoad).toBeCloseTo(1.05, 5);
    expect(evaluation.withinCoolingWindow).toBe(true);
    expect(evaluation.compatibilityScore).not.toBeNull();
  });

  it("flags out-of-window cooling capacity as incompatible with a null score", () => {
    const evaluation = evaluateEquipment(
      equipment({ equipmentType: "split_ac" }),
      coolingGrid,
      36000 / 2, // grossly oversized relative to load -> outside 95-115% window
      0,
      95,
      63,
      17,
    );
    expect(evaluation.withinCoolingWindow).toBe(false);
    expect(evaluation.compatibilityScore).toBeNull();
  });

  it("computes balance point and supplemental heat for a heat pump using the winter design temp", () => {
    const evaluation = evaluateEquipment(
      equipment({ equipmentType: "heat_pump" }),
      [...coolingGrid, ...heatingCurve],
      36000 / 1.05,
      30000,
      95,
      63,
      5,
    );
    expect(evaluation.balancePointF).toBeCloseTo(28.25, 5);
    expect(evaluation.supplementalHeatBtuh).toBeCloseTo(10000, 5);
    expect(evaluation.withinHeatingWindow).toBe(false); // needs supplemental heat at design temp
  });
});

describe("rankEquipment", () => {
  function evalWith(overrides: Partial<EquipmentEvaluation>): EquipmentEvaluation {
    return {
      equipment: equipment({}),
      coolingCapacityAtDesign: null,
      coolingPercentOfLoad: 1,
      withinCoolingWindow: true,
      heatingCapacityAtDesign: null,
      heatingPercentOfLoad: null,
      withinHeatingWindow: false,
      balancePointF: null,
      supplementalHeatBtuh: null,
      supplementalHeatKw: null,
      compatibilityScore: 0.5,
      ...overrides,
    };
  }

  it("filters out equipment that failed the hard ACCA window gate", () => {
    const compatible = evalWith({ equipment: equipment({ id: "compatible" }), withinCoolingWindow: true, compatibilityScore: 0.5 });
    const incompatible = evalWith({ equipment: equipment({ id: "incompatible" }), withinCoolingWindow: false, compatibilityScore: 0.9 });
    const ranked = rankEquipment([compatible, incompatible]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].equipment.id).toBe("compatible");
  });

  it("sorts by compatibility score, highest first", () => {
    const low = evalWith({ equipment: equipment({ id: "low" }), compatibilityScore: 0.4 });
    const high = evalWith({ equipment: equipment({ id: "high" }), compatibilityScore: 0.9 });
    const ranked = rankEquipment([low, high]);
    expect(ranked.map((r) => r.equipment.id)).toEqual(["high", "low"]);
  });

  it("lets a preferred line win a tie-break within the near-equal score threshold, but never override a genuinely better score", () => {
    const preferred = evalWith({ equipment: equipment({ id: "preferred" }), compatibilityScore: 0.80 });
    const nonPreferredClose = evalWith({ equipment: equipment({ id: "close" }), compatibilityScore: 0.82 });
    const nonPreferredBetter = evalWith({ equipment: equipment({ id: "better" }), compatibilityScore: 0.95 });

    const ranked = rankEquipment([preferred, nonPreferredClose, nonPreferredBetter], new Set(["preferred"]));
    // "better" is far outside the tie-break threshold, so it still wins
    // outright; "preferred" only needs to beat "close" (within threshold).
    expect(ranked.map((r) => r.equipment.id)).toEqual(["better", "preferred", "close"]);
  });
});

describe("selectTopEquipmentByManufacturer", () => {
  function evalWith(overrides: Partial<EquipmentEvaluation>): EquipmentEvaluation {
    return {
      equipment: equipment({}),
      coolingCapacityAtDesign: null,
      coolingPercentOfLoad: 1,
      withinCoolingWindow: true,
      heatingCapacityAtDesign: null,
      heatingPercentOfLoad: null,
      withinHeatingWindow: false,
      balancePointF: null,
      supplementalHeatBtuh: null,
      supplementalHeatKw: null,
      compatibilityScore: 0.5,
      ...overrides,
    };
  }

  // A ranked list (already score-sorted, as rankEquipment's output would
  // be) mixing two manufacturers, scores strictly descending overall.
  const ranked: EquipmentEvaluation[] = [
    evalWith({ equipment: equipment({ id: "carrier-1", manufacturer: "Carrier" }), compatibilityScore: 0.95 }),
    evalWith({ equipment: equipment({ id: "amana-1", manufacturer: "Amana" }), compatibilityScore: 0.9 }),
    evalWith({ equipment: equipment({ id: "carrier-2", manufacturer: "Carrier" }), compatibilityScore: 0.85 }),
    evalWith({ equipment: equipment({ id: "amana-2", manufacturer: "Amana" }), compatibilityScore: 0.8 }),
    evalWith({ equipment: equipment({ id: "goodman-1", manufacturer: "Goodman" }), compatibilityScore: 0.7 }),
  ];

  it("with no preferred manufacturer, returns the top N across all manufacturers unchanged", () => {
    const result = selectTopEquipmentByManufacturer(ranked, null);
    expect(result.usedFallback).toBe(false);
    expect(result.results.map((r) => r.equipment.id)).toEqual(
      ranked.slice(0, PREFERRED_MANUFACTURER_RESULT_COUNT).map((r) => r.equipment.id),
    );
  });

  it("filters to the preferred manufacturer's top matches, still score-ordered, without touching compatibilityScore", () => {
    const result = selectTopEquipmentByManufacturer(ranked, "Amana");
    expect(result.usedFallback).toBe(false);
    expect(result.results.map((r) => r.equipment.id)).toEqual(["amana-1", "amana-2"]);
    expect(result.results.map((r) => r.compatibilityScore)).toEqual([0.9, 0.8]);
  });

  it("falls back to the top matches across all manufacturers, and says so, when the preferred manufacturer has zero compatible matches", () => {
    const result = selectTopEquipmentByManufacturer(ranked, "Trane");
    expect(result.usedFallback).toBe(true);
    expect(result.results).toHaveLength(MANUFACTURER_FALLBACK_RESULT_COUNT);
    expect(result.results.map((r) => r.equipment.id)).toEqual(
      ranked.slice(0, MANUFACTURER_FALLBACK_RESULT_COUNT).map((r) => r.equipment.id),
    );
  });

  it("caps a preferred manufacturer's results at the top-N count even when it has more matches than that", () => {
    const manyCarrier: EquipmentEvaluation[] = Array.from({ length: 7 }, (_, i) =>
      evalWith({
        equipment: equipment({ id: `carrier-${i}`, manufacturer: "Carrier" }),
        compatibilityScore: 1 - i * 0.05,
      }),
    );
    const result = selectTopEquipmentByManufacturer(manyCarrier, "Carrier");
    expect(result.usedFallback).toBe(false);
    expect(result.results).toHaveLength(PREFERRED_MANUFACTURER_RESULT_COUNT);
    expect(result.results[0].equipment.id).toBe("carrier-0");
  });
});

describe("ACCA sizing window constants", () => {
  it("AC cooling window is 95-115% of design total heat gain", () => {
    expect(AC_COOLING_MIN_FRACTION).toBe(0.95);
    expect(AC_COOLING_MAX_FRACTION).toBe(1.15);
  });
});
