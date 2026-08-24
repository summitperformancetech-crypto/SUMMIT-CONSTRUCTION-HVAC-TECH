// Verifies lib/solarPosition.ts against known astronomical facts, not
// just "it runs" - the whole AED assessment depends on this being real
// solar geometry, so each assertion here checks the math against a
// hand-computable reference (Cooper's equation is documented accurate to
// about 1 degree, so tolerances below reflect that, not a guess).
import { describe, it, expect } from "vitest";
import { solarDeclinationDeg, solarPosition, dayOfYearForMonth } from "../solarPosition";

describe("solarDeclinationDeg", () => {
  it("is close to +23.45 degrees at the summer solstice (day 172, June 21)", () => {
    expect(solarDeclinationDeg(172)).toBeGreaterThan(23);
    expect(solarDeclinationDeg(172)).toBeLessThan(23.45);
  });

  it("is close to -23.45 degrees at the winter solstice (day 355, Dec 21)", () => {
    expect(solarDeclinationDeg(355)).toBeLessThan(-23);
    expect(solarDeclinationDeg(355)).toBeGreaterThan(-23.45);
  });

  it("is close to 0 degrees at the spring equinox (day 80, ~March 21)", () => {
    expect(Math.abs(solarDeclinationDeg(80))).toBeLessThan(1.5);
  });
});

describe("solarPosition", () => {
  it("puts the sun due south (azimuth 180) at solar noon for a mid-latitude northern location", () => {
    const pos = solarPosition(30, dayOfYearForMonth(7, 21), 12);
    expect(pos.azimuthDeg).toBeCloseTo(180, 0);
  });

  it("matches altitude = 90 - |lat - decl| at solar noon on the summer solstice, lat 30N", () => {
    const pos = solarPosition(30, 172, 12);
    // declination is not exactly 23.45 (Cooper's approximation) - allow 1 deg
    expect(pos.altitudeDeg).toBeGreaterThan(90 - Math.abs(30 - 23.45) - 1);
    expect(pos.altitudeDeg).toBeLessThan(90 - Math.abs(30 - 23.45) + 1);
  });

  it("matches altitude = 90 - lat - decl at solar noon on the winter solstice, lat 30N", () => {
    const pos = solarPosition(30, 355, 12);
    expect(pos.altitudeDeg).toBeGreaterThan(90 - 30 - 23.45 - 1);
    expect(pos.altitudeDeg).toBeLessThan(90 - 30 - 23.45 + 1);
  });

  it("matches altitude close to 90 - lat at solar noon on an equinox, lat 30N", () => {
    const pos = solarPosition(30, 80, 12);
    expect(pos.altitudeDeg).toBeGreaterThan(90 - 30 - 1.5);
    expect(pos.altitudeDeg).toBeLessThan(90 - 30 + 1.5);
  });

  it("puts the sun directly overhead (~90 deg altitude) at the equator on an equinox", () => {
    const pos = solarPosition(0, 80, 12);
    expect(pos.altitudeDeg).toBeGreaterThan(88);
  });

  it("has the sun below the horizon at solar hour 0 (midnight) at mid-latitude", () => {
    const pos = solarPosition(35, 172, 0);
    expect(pos.altitudeDeg).toBeLessThan(0);
  });

  it("puts the sun in the east before solar noon and west after, on the same day", () => {
    const morning = solarPosition(35, dayOfYearForMonth(7, 21), 9);
    const afternoon = solarPosition(35, dayOfYearForMonth(7, 21), 15);
    expect(morning.azimuthDeg).toBeLessThan(180);
    expect(afternoon.azimuthDeg).toBeGreaterThan(180);
  });
});

describe("dayOfYearForMonth", () => {
  it("returns 1 for January 1", () => {
    expect(dayOfYearForMonth(1, 1)).toBe(1);
  });
  it("returns 172 for June 21", () => {
    expect(dayOfYearForMonth(6, 21)).toBe(172);
  });
  it("returns 202 for July 21", () => {
    expect(dayOfYearForMonth(7, 21)).toBe(202);
  });
});
