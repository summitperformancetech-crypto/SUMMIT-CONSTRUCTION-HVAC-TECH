// Direct unit tests for lib/makeupAir.ts - the real, cited IRC M1503.6
// makeup-air balance check. Run via `npm test` (Vitest).
import { describe, it, expect } from "vitest";
import { evaluateMakeupAirBalance, RESIDENTIAL_MAKEUP_AIR_TRIGGER_CFM, type ExhaustSource, type MakeupAirUnitSpec } from "../makeupAir";

function source(overrides: Partial<ExhaustSource> = {}): ExhaustSource {
  return {
    id: "s1",
    roomId: null,
    sourceType: "kitchen_range_hood",
    description: null,
    ratedCfm: 300,
    ...overrides,
  };
}

describe("evaluateMakeupAirBalance", () => {
  it("is not_applicable when no exhaust sources are entered", () => {
    const result = evaluateMakeupAirBalance([], null);
    expect(result.status).toBe("not_applicable");
    expect(result.totalExhaustCfm).toBe(0);
  });

  it("resolves when the largest single source is at or below the real IRC M1503.6 400 cfm threshold", () => {
    const result = evaluateMakeupAirBalance([source({ ratedCfm: RESIDENTIAL_MAKEUP_AIR_TRIGGER_CFM })], null);
    expect(result.status).toBe("resolved");
    expect(result.largestSingleSourceCfm).toBe(400);
  });

  it("flags when the largest single source exceeds 400 cfm and no makeup-air unit is selected", () => {
    const result = evaluateMakeupAirBalance([source({ ratedCfm: 600 })], null);
    expect(result.status).toBe("flagged");
    expect(result.summary).toContain("no makeup-air unit is selected");
  });

  it("uses the largest single source for the trigger, not the sum, matching IRC M1503.6's per-hood language", () => {
    // Two real sources that individually stay under 400 cfm - the trigger
    // is per-hood, not a whole-house total (that's ASHRAE 62.2 Section
    // 6.4's separate, unimplemented net-exhaust calculation - see this
    // module's header comment).
    const result = evaluateMakeupAirBalance(
      [source({ id: "s1", ratedCfm: 250 }), source({ id: "s2", ratedCfm: 200, sourceType: "bathroom_exhaust_fan" })],
      null,
    );
    expect(result.totalExhaustCfm).toBe(450);
    expect(result.largestSingleSourceCfm).toBe(250);
    expect(result.status).toBe("resolved");
  });

  it("flags a commercial_tempered unit whose real published max CFM is undersized for the total exhaust load", () => {
    const unit: MakeupAirUnitSpec = { category: "commercial_tempered", minRatedCfm: 800, maxRatedCfm: 1000 };
    const result = evaluateMakeupAirBalance([source({ ratedCfm: 1500 })], unit);
    expect(result.status).toBe("flagged");
    expect(result.summary).toContain("undersized");
  });

  it("resolves a commercial_tempered unit whose real published max CFM covers the total exhaust load", () => {
    const unit: MakeupAirUnitSpec = { category: "commercial_tempered", minRatedCfm: 800, maxRatedCfm: 15000 };
    const result = evaluateMakeupAirBalance([source({ ratedCfm: 1500 })], unit);
    expect(result.status).toBe("resolved");
  });

  it("resolves a residential damper selection without a numeric CFM check, since none is published", () => {
    const unit: MakeupAirUnitSpec = { category: "residential_damper", minRatedCfm: null, maxRatedCfm: null };
    const result = evaluateMakeupAirBalance([source({ ratedCfm: 600 })], unit);
    expect(result.status).toBe("resolved");
    expect(result.detail).toContain("duct-diameter");
  });
});
