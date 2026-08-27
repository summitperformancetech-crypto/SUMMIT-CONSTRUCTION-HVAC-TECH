// Direct unit tests for lib/makeupAir.ts - the real, cited IRC M1503.5
// (range hoods, 400 cfm) and M1502.7 (clothes dryers, 200 cfm)
// per-source-type makeup-air balance check. Run via `npm test` (Vitest).
import { describe, it, expect } from "vitest";
import {
  evaluateMakeupAirBalance,
  RESIDENTIAL_MAKEUP_AIR_TRIGGER_CFM,
  MAKEUP_AIR_TRIGGER_CFM_BY_SOURCE_TYPE,
  type ExhaustSource,
  type MakeupAirUnitSpec,
} from "../makeupAir";

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

  it("flags a clothes dryer over the real, lower 200 cfm IRC M1502.7 threshold even though it's well under a range hood's 400 cfm trigger", () => {
    // Real gap this test exists to catch: a flat 400 cfm threshold across
    // every source_type would silently miss a ~250 cfm dryer, which IRC
    // M1502.7 already requires makeup air for at 200 cfm.
    const result = evaluateMakeupAirBalance([source({ sourceType: "clothes_dryer", ratedCfm: 250 })], null);
    expect(result.status).toBe("flagged");
    expect(result.summary).toContain("200 cfm");
    expect(result.summary).toContain("M1502.7");
  });

  it("resolves a clothes dryer at or below its own real 200 cfm threshold", () => {
    const result = evaluateMakeupAirBalance(
      [source({ sourceType: "clothes_dryer", ratedCfm: MAKEUP_AIR_TRIGGER_CFM_BY_SOURCE_TYPE.clothes_dryer! })],
      null,
    );
    expect(result.status).toBe("resolved");
  });

  it("does not flag a bathroom exhaust fan on CFM alone, since no single numeric code trigger has been verified for that source type", () => {
    const result = evaluateMakeupAirBalance([source({ sourceType: "bathroom_exhaust_fan", ratedCfm: 5000 })], null);
    expect(result.status).toBe("resolved");
  });
});
