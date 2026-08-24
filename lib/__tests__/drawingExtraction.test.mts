// Diagnosed 2026-08-23 against real data (Kinsela, a real production
// project): window area kept coming back null even after a full review
// pass because it was only ever mentioned inside a room's single bundled
// "reason" prose string, resolved by one Accept/Override that never
// touched the actual window_*_area_sqft columns - unlike duct_location/
// duct_insulation_r_value, which already had their own individually-
// resolvable unresolved item. This file tests the fix: a new "windows"
// field on ExtractedRoom, given the same treatment.
import { describe, it, expect } from "vitest";
import {
  collectUnresolvedItems,
  deriveFloorAreaFromPageDimensions,
  type DrawingExtraction,
  type ExtractedEnvelope,
  type ExtractedRoom,
  type ExtractedField,
} from "../drawingExtraction";

function resolvedField<T>(value: T | null = null): ExtractedField<T> {
  return { value, unresolved: false };
}

function emptyEnvelope(): ExtractedEnvelope {
  return {
    wall_insulation_r_value: resolvedField(),
    ceiling_insulation_r_value: resolvedField(),
    floor_insulation_r_value: resolvedField(),
    window_type: resolvedField(),
    window_count: resolvedField(),
    foundation_type: resolvedField(),
    ceiling_height_ft: resolvedField(),
    attic_construction_type: resolvedField(),
    exterior_wall_stud_size: resolvedField(),
    exterior_wall_stud_spacing_in: resolvedField(),
    exterior_wall_sheathing: resolvedField(),
    exterior_wall_exterior_finish: resolvedField(),
    duct_insulation_spec: resolvedField(),
    duct_minimum_diameter_in: resolvedField(),
    hvac_equipment_location: resolvedField(),
  };
}

function baseRoom(overrides: Partial<ExtractedRoom> = {}): ExtractedRoom {
  return {
    name: "Room",
    floor_area_sqft: 150,
    wall_north_len_ft: 12,
    wall_south_len_ft: 12,
    wall_east_len_ft: 12,
    wall_west_len_ft: 12,
    wall_front_len_ft: null,
    wall_rear_len_ft: null,
    wall_left_len_ft: null,
    wall_right_len_ft: null,
    wall_page_horizontal_len_ft: null,
    wall_page_vertical_len_ft: null,
    window_north_area_sqft: null,
    window_south_area_sqft: null,
    window_east_area_sqft: null,
    window_west_area_sqft: null,
    window_front_area_sqft: null,
    window_rear_area_sqft: null,
    window_left_area_sqft: null,
    window_right_area_sqft: null,
    window_count: null,
    windows: resolvedField(false),
    door_count: 1,
    unresolved: false,
    reason: null,
    duct_location: resolvedField(),
    duct_insulation_r_value: resolvedField(),
    duct_source: null,
    duct_confidence: null,
    ceiling_height_ft: null,
    ceiling_height_ft_elevation_derived: null,
    room_label_text: null,
    source_sheet: null,
    ...overrides,
  };
}

function baseExtraction(rooms: ExtractedRoom[]): DrawingExtraction {
  return {
    orientation: { detected: true, description: "north arrow on A1.1" },
    building_envelope: emptyEnvelope(),
    rooms,
  };
}

describe("collectUnresolvedItems - windows field", () => {
  it("does not flag a room with windows confirmed absent (interior closet)", () => {
    const extraction = baseExtraction([
      baseRoom({ name: "Closet", windows: { value: false, unresolved: false } }),
    ]);
    expect(collectUnresolvedItems(extraction)).toEqual([]);
  });

  it("flags a room where windows were detected but area is still unresolved - the Kinsela pattern", () => {
    const extraction = baseExtraction([
      baseRoom({
        name: "Kitchen",
        windows: {
          value: true,
          unresolved: true,
          reason: "window visible on west wall, no height reference to size it",
        },
      }),
    ]);
    const items = collectUnresolvedItems(extraction);
    expect(items).toContainEqual(
      expect.stringContaining("room[0].windows:Kitchen - window visible on west wall"),
    );
  });

  it("flags a room where window presence itself couldn't be determined", () => {
    const extraction = baseExtraction([
      baseRoom({
        name: "Great Room",
        windows: { value: null, unresolved: true, reason: "room boundary partially obscured" },
      }),
    ]);
    const items = collectUnresolvedItems(extraction);
    expect(items.some((i) => i.startsWith("room[0].windows:Great Room"))).toBe(true);
  });

  it("tracks windows as its own item, independent of the room's general unresolved/reason", () => {
    // A room can be otherwise fully resolved (real floor area, real walls)
    // while still having its window status unresolved - this is exactly
    // the case the old bundled-reason approach couldn't represent: there
    // was nowhere to flag "windows still need review" once the room's
    // single top-level reason had already been used for something else.
    const extraction = baseExtraction([
      baseRoom({
        name: "Bedroom",
        unresolved: false,
        reason: null,
        windows: { value: true, unresolved: true, reason: "window sizes not confirmed from schedule" },
      }),
    ]);
    const items = collectUnresolvedItems(extraction);
    expect(items).toHaveLength(1);
    expect(items[0]).toContain("room[0].windows:Bedroom");
  });

  it("does not require the windows field to exist on historical extractions (optional chaining)", () => {
    const room = baseRoom({ name: "Old Room" });
    // Simulate data extracted before this field existed.
    delete (room as { windows?: unknown }).windows;
    const extraction = baseExtraction([room]);
    expect(() => collectUnresolvedItems(extraction)).not.toThrow();
    expect(collectUnresolvedItems(extraction)).toEqual([]);
  });
});

describe("collectUnresolvedItems - floor area and wall lengths", () => {
  it("flags a room with no floor area recorded, independent of the room's general reason", () => {
    const extraction = baseExtraction([
      baseRoom({
        name: "Bath 4",
        floor_area_sqft: null,
        wall_north_len_ft: null,
        wall_south_len_ft: null,
        wall_east_len_ft: null,
        wall_west_len_ft: null,
      }),
    ]);
    const items = collectUnresolvedItems(extraction);
    expect(items).toContainEqual("room[0].floor_area:Bath 4");
    // No separate "walls" item when floor area itself is already missing -
    // mirrors lib/dataCompleteness.ts's own nesting, avoids double-flagging
    // the same underlying "we know nothing about this room" gap twice.
    expect(items.some((i) => i.startsWith("room[0].walls"))).toBe(false);
  });

  it("flags a room with floor area but no wall lengths on any side (compass or drawing-relative)", () => {
    const extraction = baseExtraction([
      baseRoom({
        name: "Mud Room",
        floor_area_sqft: 80,
        wall_north_len_ft: null,
        wall_south_len_ft: null,
        wall_east_len_ft: null,
        wall_west_len_ft: null,
        wall_front_len_ft: null,
        wall_rear_len_ft: null,
        wall_left_len_ft: null,
        wall_right_len_ft: null,
      }),
    ]);
    const items = collectUnresolvedItems(extraction);
    expect(items).toContainEqual("room[0].walls:Mud Room");
    expect(items.some((i) => i.startsWith("room[0].floor_area"))).toBe(false);
  });

  it("does not flag a room with real floor area and real wall data", () => {
    const extraction = baseExtraction([
      baseRoom({ name: "Kitchen", floor_area_sqft: 200, wall_north_len_ft: 15 }),
    ]);
    const items = collectUnresolvedItems(extraction);
    expect(items.some((i) => i.startsWith("room[0].floor_area") || i.startsWith("room[0].walls"))).toBe(
      false,
    );
  });

  it("accepts drawing-relative wall lengths (front/rear/left/right) as satisfying the walls check, not just compass", () => {
    const extraction = baseExtraction([
      baseRoom({
        name: "Study",
        floor_area_sqft: 120,
        wall_north_len_ft: null,
        wall_south_len_ft: null,
        wall_east_len_ft: null,
        wall_west_len_ft: null,
        wall_front_len_ft: 10,
        wall_rear_len_ft: 10,
        wall_left_len_ft: 12,
        wall_right_len_ft: 12,
      }),
    ]);
    const items = collectUnresolvedItems(extraction);
    expect(items.some((i) => i.startsWith("room[0].walls"))).toBe(false);
  });
});

// Diagnosed 2026-08-24 via a live extraction re-run against Kinsela's
// real drawing: the model reliably finds both of a room's page-axis
// dimensions but doesn't reliably also multiply them into
// floor_area_sqft. See deriveFloorAreaFromPageDimensions's own comment
// in drawingExtraction.ts for the full diagnosis.
describe("deriveFloorAreaFromPageDimensions", () => {
  it("computes floor_area_sqft from both page dimensions when it is null", () => {
    const extraction = baseExtraction([
      baseRoom({
        name: "Laundry",
        floor_area_sqft: null,
        wall_page_horizontal_len_ft: 9.83,
        wall_page_vertical_len_ft: 9.42,
      }),
    ]);
    const result = deriveFloorAreaFromPageDimensions(extraction);
    expect(result.rooms[0].floor_area_sqft).toBeCloseTo(92.6, 1);
  });

  it("does not overwrite an already-present floor_area_sqft even if the product would differ", () => {
    const extraction = baseExtraction([
      baseRoom({
        name: "Bonus Room",
        floor_area_sqft: 732,
        wall_page_horizontal_len_ft: 38.33,
        wall_page_vertical_len_ft: 31.42,
      }),
    ]);
    const result = deriveFloorAreaFromPageDimensions(extraction);
    expect(result.rooms[0].floor_area_sqft).toBe(732);
  });

  it("leaves floor_area_sqft null when only one page dimension is known", () => {
    const extraction = baseExtraction([
      baseRoom({
        name: "Mud Room",
        floor_area_sqft: null,
        wall_page_horizontal_len_ft: 5.83,
        wall_page_vertical_len_ft: null,
      }),
    ]);
    const result = deriveFloorAreaFromPageDimensions(extraction);
    expect(result.rooms[0].floor_area_sqft).toBeNull();
  });

  it("leaves floor_area_sqft null when neither page dimension is known", () => {
    const extraction = baseExtraction([
      baseRoom({ name: "Hidden Gun Closet", floor_area_sqft: null }),
    ]);
    const result = deriveFloorAreaFromPageDimensions(extraction);
    expect(result.rooms[0].floor_area_sqft).toBeNull();
  });

  it("a room whose floor area it derives no longer triggers the room[N].floor_area unresolved item", () => {
    const extraction = deriveFloorAreaFromPageDimensions(
      baseExtraction([
        baseRoom({
          name: "Master Bath",
          floor_area_sqft: null,
          wall_page_horizontal_len_ft: 18.83,
          wall_page_vertical_len_ft: 11.33,
        }),
      ]),
    );
    const items = collectUnresolvedItems(extraction);
    expect(items.some((i) => i.startsWith("room[0].floor_area"))).toBe(false);
  });
});
