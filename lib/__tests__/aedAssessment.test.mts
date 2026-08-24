import { describe, it, expect } from "vitest";
import { assessAedZone, type AedZoneInput } from "../aedAssessment";

const LATITUDE_MID_US = 35;
const TYPICAL_SHGC = 0.3;

describe("assessAedZone", () => {
  it("is not assessed when the zone has no real window area on any side", () => {
    const zone: AedZoneInput = {
      zoneId: "z1",
      zoneName: "Zone 1",
      windowAreaSqftByDirection: { north: 0, south: 0, east: 0, west: 0 },
    };
    const result = assessAedZone(zone, LATITUDE_MID_US, TYPICAL_SHGC);
    expect(result.assessed).toBe(false);
  });

  it("passes with 0% excess when only one direction has real window area (nothing to diversify against)", () => {
    const zone: AedZoneInput = {
      zoneId: "z1",
      zoneName: "Zone 1",
      windowAreaSqftByDirection: { north: 0, south: 0, east: 0, west: 40 },
    };
    const result = assessAedZone(zone, LATITUDE_MID_US, TYPICAL_SHGC);
    expect(result.assessed).toBe(true);
    expect(result.peakExcessPercent).toBe(0);
    expect(result.passes).toBe(true);
    expect(result.worstOrientation).toBe("west");
  });

  it("fails with a real excess percentage when glass is heavily concentrated on one side", () => {
    const zone: AedZoneInput = {
      zoneId: "z1",
      zoneName: "Concentrated West",
      windowAreaSqftByDirection: { north: 5, south: 5, east: 5, west: 100 },
    };
    const result = assessAedZone(zone, LATITUDE_MID_US, TYPICAL_SHGC);
    expect(result.assessed).toBe(true);
    expect(result.peakExcessPercent).toBeGreaterThan(30);
    expect(result.passes).toBe(false);
    expect(result.worstOrientation).toBe("west");
  });

  it("reports the same worst orientation as the direction with the highest computed peak", () => {
    const zone: AedZoneInput = {
      zoneId: "z1",
      zoneName: "Mixed",
      windowAreaSqftByDirection: { north: 20, south: 60, east: 30, west: 90 },
    };
    const result = assessAedZone(zone, LATITUDE_MID_US, TYPICAL_SHGC);
    const entries = Object.entries(result.peaksByDirection) as [string, number][];
    const maxEntry = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(result.worstOrientation).toBe(maxEntry[0]);
  });

  it("never produces a negative excess percentage", () => {
    const zone: AedZoneInput = {
      zoneId: "z1",
      zoneName: "Even",
      windowAreaSqftByDirection: { north: 30, south: 30, east: 30, west: 30 },
    };
    const result = assessAedZone(zone, LATITUDE_MID_US, TYPICAL_SHGC);
    expect(result.peakExcessPercent).toBeGreaterThanOrEqual(0);
  });
});
