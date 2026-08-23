// Diagnosed 2026-08-23 against two real cases in the same session: the
// Vivian Street fixture (2 hand-seeded aggregate rooms, all-null windows)
// and Kinsela, a real already-extracted-and-applied production project (25
// real rooms, all-null windows despite a fully "resolved" review pass).
// Both silently computed zero glazing load with no warning anywhere in the
// pipeline - this is the regression test for that class of bug.
import { describe, it, expect } from "vitest";
import { checkDataCompleteness, type RoomGeometryInput } from "../dataCompleteness";

function room(overrides: Partial<RoomGeometryInput>): RoomGeometryInput {
  return {
    id: "r1",
    name: "Room",
    is_conditioned: true,
    floor_area_sqft: 150,
    wall_north_len_ft: 12,
    wall_south_len_ft: 12,
    wall_east_len_ft: 12,
    wall_west_len_ft: 12,
    window_north_area_sqft: 15,
    window_south_area_sqft: null,
    window_east_area_sqft: null,
    window_west_area_sqft: null,
    ...overrides,
  };
}

describe("checkDataCompleteness", () => {
  it("returns no warnings for a fully-populated, realistic house", () => {
    const rooms = [
      room({ id: "r1", name: "Living Room", window_north_area_sqft: 20 }),
      room({ id: "r2", name: "Closet", window_north_area_sqft: null, window_south_area_sqft: null }),
    ];
    expect(checkDataCompleteness(rooms)).toEqual([]);
  });

  it("flags a room with no floor area recorded", () => {
    // Only room in the house, with no confirmed floor area anywhere -
    // totalConditionedFloorAreaSqft is 0, so the whole-house zero-glazing
    // check correctly does NOT also fire (nothing to compare "zero
    // windows" against yet - see the next test for that check firing on a
    // house with real floor area).
    const rooms = [room({ id: "r1", name: "Bath 4", floor_area_sqft: null })];
    const warnings = checkDataCompleteness(rooms);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ scope: "room", roomId: "r1", roomName: "Bath 4" });
    expect(warnings[0].reason).toMatch(/no floor area/i);
  });

  it("does not flag missing walls/windows for an unconditioned room (e.g. garage, porch)", () => {
    const rooms = [
      room({
        id: "r1",
        name: "Garage",
        is_conditioned: false,
        floor_area_sqft: null,
        wall_north_len_ft: null,
        wall_south_len_ft: null,
        wall_east_len_ft: null,
        wall_west_len_ft: null,
        window_north_area_sqft: null,
      }),
      room({ id: "r2", name: "Living Room" }),
    ];
    expect(checkDataCompleteness(rooms)).toEqual([]);
  });

  it("flags a room with floor area but no wall lengths at all", () => {
    const rooms = [
      room({
        id: "r1",
        name: "Mud Room",
        floor_area_sqft: 80,
        wall_north_len_ft: null,
        wall_south_len_ft: null,
        wall_east_len_ft: null,
        wall_west_len_ft: null,
      }),
    ];
    const warnings = checkDataCompleteness(rooms);
    const roomWarning = warnings.find((w) => w.scope === "room");
    expect(roomWarning?.reason).toMatch(/no wall lengths/i);
  });

  it("does NOT flag an individual windowless room when other rooms have real window area (e.g. a real closet)", () => {
    const rooms = [
      room({ id: "r1", name: "Living Room", window_north_area_sqft: 20 }),
      room({
        id: "r2",
        name: "Walk-In Closet",
        window_north_area_sqft: null,
        window_south_area_sqft: null,
        window_east_area_sqft: null,
        window_west_area_sqft: null,
      }),
    ];
    expect(checkDataCompleteness(rooms)).toEqual([]);
  });

  it("flags the whole house when every room has zero window area - the Vivian Street / Kinsela pattern", () => {
    const rooms = [
      room({ id: "r1", name: "Living Room", window_north_area_sqft: null }),
      room({ id: "r2", name: "Bedroom", window_north_area_sqft: null }),
    ];
    const warnings = checkDataCompleteness(rooms);
    const wholeHouseWarning = warnings.find((w) => w.scope === "wholeHouse");
    expect(wholeHouseWarning).toBeDefined();
    expect(wholeHouseWarning?.reason).toMatch(/glazing area across all rooms is exactly zero/i);
  });

  it("does not fire the whole-house glazing check when there is no conditioned floor area at all", () => {
    const rooms = [
      room({
        id: "r1",
        name: "Empty Shell",
        is_conditioned: false,
        floor_area_sqft: null,
        window_north_area_sqft: null,
      }),
    ];
    expect(checkDataCompleteness(rooms)).toEqual([]);
  });
});
