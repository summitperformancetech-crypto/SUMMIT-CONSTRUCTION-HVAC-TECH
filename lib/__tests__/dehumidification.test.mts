// Direct unit tests for lib/dehumidification.ts - the real Btuh-to-
// pints/day conversion and hard-filtered dehumidifier candidate list.
// Run via `npm test` (Vitest).
import { describe, it, expect } from "vitest";
import {
  computeLatentLoadPintsPerDay,
  bestAvailableRatedPintsPerDay,
  dehumidifierCandidatesFor,
  BTU_PER_PINT_OF_WATER,
  type DehumidifierCatalogOption,
} from "../dehumidification";

describe("computeLatentLoadPintsPerDay", () => {
  it("converts a real Manual J latent Btuh figure into pints/day", () => {
    // 3868 Btuh is the worked example this session's research cross-
    // checked across independent sources: 3868 / 1054 = ~3.67 pints/hr,
    // x 24 = ~88 pints/day.
    expect(computeLatentLoadPintsPerDay(3868)).toBeCloseTo((3868 / BTU_PER_PINT_OF_WATER) * 24, 5);
    expect(computeLatentLoadPintsPerDay(3868)).toBeCloseTo(88.08, 1);
  });

  it("returns 0 for a zero latent load", () => {
    expect(computeLatentLoadPintsPerDay(0)).toBe(0);
  });
});

describe("bestAvailableRatedPintsPerDay", () => {
  const aprilaireE100: DehumidifierCatalogOption = {
    equipmentId: "a",
    manufacturer: "Aprilaire",
    modelNumber: "E100",
    ratedPintsPerDay80_60: 100,
    ratedPintsPerDay73_60: 85,
    inletDuctDiameterIn: 10,
    secondaryInletDuctDiameterIn: null,
    outletDuctDiameterIn: 10,
    drainConnectionSpec: '3/4" MNPT',
    hasBackdraftDamper: true,
  };

  const santaFeUltra98: DehumidifierCatalogOption = {
    equipmentId: "b",
    manufacturer: "Santa Fe",
    modelNumber: "Ultra98",
    ratedPintsPerDay80_60: 98,
    ratedPintsPerDay73_60: null,
    inletDuctDiameterIn: 10,
    secondaryInletDuctDiameterIn: 6,
    outletDuctDiameterIn: 10,
    drainConnectionSpec: '3/4" NPT',
    hasBackdraftDamper: false,
  };

  it("prefers the real 73/60 DOE point when the manufacturer publishes it", () => {
    expect(bestAvailableRatedPintsPerDay(aprilaireE100)).toBe(85);
  });

  it("falls back to the 80/60 point when 73/60 isn't published, never estimating one", () => {
    expect(bestAvailableRatedPintsPerDay(santaFeUltra98)).toBe(98);
  });
});

describe("dehumidifierCandidatesFor", () => {
  const options: DehumidifierCatalogOption[] = [
    {
      equipmentId: "a",
      manufacturer: "Aprilaire",
      modelNumber: "E100",
      ratedPintsPerDay80_60: 100,
      ratedPintsPerDay73_60: 85,
      inletDuctDiameterIn: 10,
      secondaryInletDuctDiameterIn: null,
      outletDuctDiameterIn: 10,
      drainConnectionSpec: '3/4" MNPT',
      hasBackdraftDamper: true,
    },
    {
      equipmentId: "b",
      manufacturer: "Santa Fe",
      modelNumber: "Ultra98",
      ratedPintsPerDay80_60: 98,
      ratedPintsPerDay73_60: null,
      inletDuctDiameterIn: 10,
      secondaryInletDuctDiameterIn: 6,
      outletDuctDiameterIn: 10,
      drainConnectionSpec: '3/4" NPT',
      hasBackdraftDamper: false,
    },
  ];

  it("excludes equipment whose best real rated capacity falls short of the requirement", () => {
    // Aprilaire's best-available figure is 85 (73/60 point) - a 90
    // pints/day requirement should exclude it even though its 80/60
    // nameplate (100) would clear that bar.
    const candidates = dehumidifierCandidatesFor(90, options);
    expect(candidates.map((c) => c.equipmentId)).toEqual(["b"]);
  });

  it("includes equipment whose best real rated capacity meets the requirement exactly", () => {
    const candidates = dehumidifierCandidatesFor(85, options);
    expect(candidates.map((c) => c.equipmentId).sort()).toEqual(["a", "b"]);
  });

  it("returns an empty list when nothing cataloged meets the requirement", () => {
    expect(dehumidifierCandidatesFor(200, options)).toEqual([]);
  });
});
