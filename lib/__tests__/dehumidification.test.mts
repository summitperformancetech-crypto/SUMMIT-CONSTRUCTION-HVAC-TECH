// Direct unit tests for lib/dehumidification.ts - the real Btuh-to-
// pints/day conversion and hard-filtered dehumidifier candidate list.
// Run via `npm test` (Vitest).
import { describe, it, expect } from "vitest";
import {
  computeLatentLoadPintsPerDay,
  bestAvailableRatedPintsPerDay,
  dehumidifierCandidatesFor,
  proposeDehumidification,
  STANDALONE_DEHUMIDIFICATION_PINTS_PER_DAY,
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
    maxDesignExternalStaticPressureIwc: 0.6,
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
    maxDesignExternalStaticPressureIwc: 0.5,
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
      maxDesignExternalStaticPressureIwc: 0.6,
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
      maxDesignExternalStaticPressureIwc: 0.5,
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

describe("proposeDehumidification (pipeline stage 12)", () => {
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
      maxDesignExternalStaticPressureIwc: 0.6,
    },
  ];

  it("recommends a standalone dehumidifier and lists candidates when latent load is high", () => {
    // 2000 Btuh -> ~45.5 pints/day, well over the threshold
    const p = proposeDehumidification({ wholeHouse: { coolingLatentBtuh: 2000 } }, options);
    expect(p.recommendStandalone).toBe(true);
    expect(p.requiredPintsPerDay).toBeGreaterThan(STANDALONE_DEHUMIDIFICATION_PINTS_PER_DAY);
    expect(p.candidates.map((c) => c.equipmentId)).toEqual(["a"]);
  });

  it("does not recommend a standalone unit for a low latent load, and is explicit about why", () => {
    // 400 Btuh -> ~9 pints/day, under the threshold
    const p = proposeDehumidification({ wholeHouse: { coolingLatentBtuh: 400 } }, options);
    expect(p.recommendStandalone).toBe(false);
    expect(p.candidates).toEqual([]);
    expect(p.rationale.toLowerCase()).toContain("adequate");
  });

  it("handles a null Manual J result without throwing", () => {
    const p = proposeDehumidification(null, options);
    expect(p.latentLoadBtuh).toBe(0);
    expect(p.recommendStandalone).toBe(false);
  });
});
