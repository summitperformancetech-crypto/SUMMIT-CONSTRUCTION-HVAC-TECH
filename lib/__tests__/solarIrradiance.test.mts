import { describe, it, expect } from "vitest";
import {
  clearSkyDirectNormalBtuhPerSqft,
  clearSkyDiffuseHorizontalBtuhPerSqft,
  verticalSurfaceIrradianceBtuhPerSqft,
  solarPositionAt,
} from "../solarIrradiance";
import { dayOfYearForMonth } from "../solarPosition";

const JULY_21 = dayOfYearForMonth(7, 21);
const JAN_21 = dayOfYearForMonth(1, 21);

describe("clearSkyDirectNormalBtuhPerSqft", () => {
  it("is zero when the sun is below the horizon", () => {
    expect(clearSkyDirectNormalBtuhPerSqft({ altitudeDeg: -5, azimuthDeg: 180 })).toBe(0);
  });

  it("is positive and increases with solar altitude", () => {
    const low = clearSkyDirectNormalBtuhPerSqft({ altitudeDeg: 10, azimuthDeg: 180 });
    const high = clearSkyDirectNormalBtuhPerSqft({ altitudeDeg: 80, azimuthDeg: 180 });
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low);
  });
});

describe("clearSkyDiffuseHorizontalBtuhPerSqft", () => {
  it("is a fixed fraction of direct normal", () => {
    expect(clearSkyDiffuseHorizontalBtuhPerSqft(200)).toBeCloseTo(24, 0);
  });
});

describe("verticalSurfaceIrradianceBtuhPerSqft", () => {
  it("is zero at night regardless of direction", () => {
    const nightPosition = { altitudeDeg: -10, azimuthDeg: 180 };
    for (const dir of ["north", "south", "east", "west"] as const) {
      expect(verticalSurfaceIrradianceBtuhPerSqft(nightPosition, dir)).toBe(0);
    }
  });

  it("gives a north wall far less irradiance than a south wall at solar noon, mid-latitude US, in winter", () => {
    const position = solarPositionAt(35, JAN_21, 12);
    const north = verticalSurfaceIrradianceBtuhPerSqft(position, "north");
    const south = verticalSurfaceIrradianceBtuhPerSqft(position, "south");
    // North gets diffuse+ground-reflected only (no direct - sun is due
    // south of a mid-latitude US location at solar noon year-round);
    // south gets strong direct gain from the low winter sun angle.
    expect(south).toBeGreaterThan(north * 3);
  });

  it("gives an east wall its highest gain in the morning and a west wall its highest gain in the afternoon", () => {
    const morning = solarPositionAt(35, JULY_21, 9);
    const afternoon = solarPositionAt(35, JULY_21, 15);

    const eastMorning = verticalSurfaceIrradianceBtuhPerSqft(morning, "east");
    const eastAfternoon = verticalSurfaceIrradianceBtuhPerSqft(afternoon, "east");
    expect(eastMorning).toBeGreaterThan(eastAfternoon);

    const westMorning = verticalSurfaceIrradianceBtuhPerSqft(morning, "west");
    const westAfternoon = verticalSurfaceIrradianceBtuhPerSqft(afternoon, "west");
    expect(westAfternoon).toBeGreaterThan(westMorning);
  });

  it("never returns a negative value", () => {
    for (let hour = 0; hour <= 24; hour += 1) {
      const position = solarPositionAt(35, JULY_21, hour);
      for (const dir of ["north", "south", "east", "west"] as const) {
        expect(verticalSurfaceIrradianceBtuhPerSqft(position, dir)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
