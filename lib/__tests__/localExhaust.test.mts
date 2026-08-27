// Direct unit tests for lib/localExhaust.ts - the real, cited IRC Table
// M1507.3 local-exhaust CFM requirements and name-based room-type
// inference. Run via `npm test` (Vitest).
import { describe, it, expect } from "vitest";
import {
  inferRoomTypeFromName,
  isToiletRoomOnly,
  computeLocalExhaustRequirement,
  IRC_BATHROOM_WITH_FIXTURE_INTERMITTENT_CFM,
  IRC_TOILET_ROOM_ONLY_CFM,
  IRC_KITCHEN_RANGE_HOOD_INTERMITTENT_CFM,
} from "../localExhaust";

describe("inferRoomTypeFromName", () => {
  it("returns null for a null/empty name", () => {
    expect(inferRoomTypeFromName(null)).toBeNull();
    expect(inferRoomTypeFromName("")).toBeNull();
  });

  it("infers Kitchen from a real drawing-extracted kitchen room name", () => {
    expect(inferRoomTypeFromName("Kitchen")).toBe("Kitchen");
    expect(inferRoomTypeFromName("Kitchen / Breakfast Nook")).toBe("Kitchen");
  });

  it("infers Bath from real drawing-extracted bath room names", () => {
    expect(inferRoomTypeFromName("Bath 2")).toBe("Bath");
    expect(inferRoomTypeFromName("Master Bath")).toBe("Bath");
    expect(inferRoomTypeFromName("Powder Room")).toBe("Bath");
    expect(inferRoomTypeFromName("Water Closet")).toBe("Bath");
  });

  it("does not misclassify an unrelated room name", () => {
    expect(inferRoomTypeFromName("Living Room")).toBeNull();
    expect(inferRoomTypeFromName("Wet Bar")).toBeNull();
  });
});

describe("isToiletRoomOnly", () => {
  it("recognizes powder room / half bath / water closet naming", () => {
    expect(isToiletRoomOnly("Powder Room")).toBe(true);
    expect(isToiletRoomOnly("Half Bath")).toBe(true);
    expect(isToiletRoomOnly("Water Closet")).toBe(true);
  });

  it("does not treat a real bathing-fixture room as toilet-room-only", () => {
    expect(isToiletRoomOnly("Master Bath")).toBe(false);
    expect(isToiletRoomOnly("Bath 2")).toBe(false);
  });
});

describe("computeLocalExhaustRequirement", () => {
  it("returns the real 80 cfm IRC bathing-fixture rate for a plain Bath room", () => {
    const result = computeLocalExhaustRequirement("Bath", "Bath 2");
    expect(result?.requiredCfm).toBe(IRC_BATHROOM_WITH_FIXTURE_INTERMITTENT_CFM);
    expect(result?.codeCitation).toContain("M1507.3");
  });

  it("returns the real, lower 50 cfm IRC toilet-room-only rate for a powder room", () => {
    const result = computeLocalExhaustRequirement("Bath", "Powder Room");
    expect(result?.requiredCfm).toBe(IRC_TOILET_ROOM_ONLY_CFM);
  });

  it("returns the real 150 cfm IRC range-hood rate for Kitchen, with the room-dimension disclosure", () => {
    const result = computeLocalExhaustRequirement("Kitchen", "Kitchen");
    expect(result?.requiredCfm).toBe(IRC_KITCHEN_RANGE_HOOD_INTERMITTENT_CFM);
    expect(result?.note).toContain("not room dimensions");
  });

  it("returns null for a room type this module has no real requirement for", () => {
    expect(computeLocalExhaustRequirement("Bedroom", "Bedroom 1")).toBeNull();
    expect(computeLocalExhaustRequirement(null, "Untitled room")).toBeNull();
  });
});
