// Direct unit tests for lib/reportData.ts's buildDuctRoutingIllustrations
// - the report-page data builder for the auto Manual D run-length
// feature. Pure function, no DB/Puppeteer involved (image rendering is
// deliberately deferred to lib/reportImages.ts, tested separately by
// nature of needing a real browser - see that file's module comment).
import { describe, it, expect } from "vitest";
import { buildDuctRoutingIllustrations } from "../reportData";
import type { RoomRow, ZoneRow } from "@/components/manual-j-workflow";
import type { DuctRunRow } from "@/components/duct-design-section";
import type { DuctSizingResult } from "../manualD";
import type { DuctDiffuserRow } from "../ductRouting";

function makeDiffuser(overrides: Partial<DuctDiffuserRow>): DuctDiffuserRow {
  return {
    id: "diffuser-1",
    project_id: "project-1",
    zone_id: "zone-1",
    room_id: "room-1",
    airflow_direction: "supply",
    pattern_type: "four_way",
    duct_size: null,
    round_diameter_in: 8,
    cfm: 120,
    mounting_height_aff_in: null,
    manufacturer: null,
    model: null,
    description: null,
    position_x_norm: null,
    position_y_norm: null,
    position_source_drawing_id: null,
    position_source_page_number: null,
    source: "manual",
    ...overrides,
  };
}

function makeRoom(overrides: Partial<RoomRow>): RoomRow {
  return {
    id: "room-1",
    project_id: "project-1",
    name: "Bedroom",
    level: "bottom_floor",
    floor_area_sqft: 150,
    ceiling_height_ft: 9,
    ceiling_exposed: false,
    floor_exposed: false,
    is_conditioned: true,
    is_bedroom: true,
    room_type: "Bedroom",
    occupant_count: null,
    sensible_gain_override: null,
    latent_gain_override: null,
    duct_location: null,
    duct_insulation_r_value: null,
    duct_source: null,
    duct_confidence: null,
    zone_id: "zone-1",
    wall_north_len_ft: null,
    wall_south_len_ft: null,
    wall_east_len_ft: null,
    wall_west_len_ft: null,
    wall_north_exposure_type: "exterior",
    wall_south_exposure_type: "exterior",
    wall_east_exposure_type: "exterior",
    wall_west_exposure_type: "exterior",
    wall_front_len_ft: null,
    wall_rear_len_ft: null,
    wall_left_len_ft: null,
    wall_right_len_ft: null,
    window_north_area_sqft: null,
    window_south_area_sqft: null,
    window_east_area_sqft: null,
    window_west_area_sqft: null,
    window_front_area_sqft: null,
    window_rear_area_sqft: null,
    window_left_area_sqft: null,
    window_right_area_sqft: null,
    door_count: null,
    position_x_norm: null,
    position_y_norm: null,
    position_source_drawing_id: null,
    position_source_page_number: null,
    ...overrides,
  };
}

function makeZone(overrides: Partial<ZoneRow>): ZoneRow {
  return {
    id: "zone-1",
    name: "Zone 1",
    ahu_label: null,
    selected_equipment_id: null,
    selected_air_handler_equipment_id: null,
    equipment_selection_notes: null,
    ahu_position_x_norm: null,
    ahu_position_y_norm: null,
    ahu_position_source_drawing_id: null,
    ahu_position_source_page_number: null,
    return_position_x_norm: null,
    return_position_y_norm: null,
    return_position_source_drawing_id: null,
    return_position_source_page_number: null,
    corridor_graph: null,
    ...overrides,
  };
}

describe("buildDuctRoutingIllustrations", () => {
  it("returns empty when no zone has a resolved AHU pin", () => {
    const rooms = [makeRoom({})];
    const zones = [makeZone({})];
    expect(buildDuctRoutingIllustrations(rooms, zones, [], [], new Map())).toEqual([]);
  });

  it("builds one sheet with an AHU pin and one room pin, matched by drawing+page", () => {
    const rooms = [
      makeRoom({
        id: "room-1",
        position_x_norm: 0.3,
        position_y_norm: 0.4,
        position_source_drawing_id: "drawing-1",
        position_source_page_number: 2,
      }),
    ];
    const zones = [
      makeZone({
        ahu_position_x_norm: 0.5,
        ahu_position_y_norm: 0.5,
        ahu_position_source_drawing_id: "drawing-1",
        ahu_position_source_page_number: 2,
      }),
    ];
    const ductRuns: DuctRunRow[] = [
      {
        id: "run-1",
        project_id: "project-1",
        zone_id: "zone-1",
        run_type: "branch",
        room_id: "room-1",
        length_ft: 22,
        fitting_equivalent_length_ft: 15,
        duct_shape: "round",
        target_height_in: null,
        material: "flex",
        cfm: 100,
        friction_rate: 0.08,
        velocity_fpm: 500,
        calculated_diameter_in: 6,
        calculated_width_in: null,
        calculated_height_in: null,
        total_effective_length_ft: 37,
        pressure_drop_iwc: 0.0296,
        has_balancing_damper: false,
      },
    ];
    const ductSchedule: DuctSizingResult[] = [
      {
        runId: "run-1",
        cfm: 100,
        frictionRate: 0.08,
        ductShape: "round",
        diameterIn: 6,
        widthIn: null,
        heightIn: null,
        velocityFpm: 500,
        velocityWarning: null,
        exceedsTableRange: false,
        totalEffectiveLengthFt: 37,
        pressureDropIwc: 0.0296,
      },
    ];

    const result = buildDuctRoutingIllustrations(rooms, zones, ductRuns, ductSchedule, new Map());
    expect(result).toHaveLength(1);
    expect(result[0].drawingId).toBe("drawing-1");
    expect(result[0].pageNumber).toBe(2);
    expect(result[0].pins).toHaveLength(2);
    expect(result[0].pins.find((p) => p.kind === "ahu")?.xNorm).toBe(0.5);
    expect(result[0].pins.find((p) => p.kind === "room")?.label).toBe("Bedroom");
    expect(result[0].routes).toHaveLength(1);
    expect(result[0].routes[0].lengthFt).toBe(22);
    expect(result[0].routes[0].diameterIn).toBe(6);
    expect(result[0].routes[0].cfm).toBe(100);
    // zoneId/zoneName on every pin and route - what the report's schematic
    // page uses for per-zone color coding (lib/reportHtmlV2.ts).
    expect(result[0].pins.every((p) => p.zoneId === "zone-1" && p.zoneName === "Zone 1")).toBe(true);
    expect(result[0].routes[0].zoneId).toBe("zone-1");
    expect(result[0].routes[0].zoneName).toBe("Zone 1");
  });

  it("attaches the zone's real trunk size/CFM to the AHU pin, not a fabricated backbone", () => {
    const rooms = [
      makeRoom({
        id: "room-1",
        position_x_norm: 0.3,
        position_y_norm: 0.4,
        position_source_drawing_id: "drawing-1",
        position_source_page_number: 2,
      }),
    ];
    const zones = [
      makeZone({
        ahu_position_x_norm: 0.5,
        ahu_position_y_norm: 0.5,
        ahu_position_source_drawing_id: "drawing-1",
        ahu_position_source_page_number: 2,
      }),
    ];
    const ductRuns: DuctRunRow[] = [
      {
        id: "trunk-1",
        project_id: "project-1",
        zone_id: "zone-1",
        run_type: "trunk",
        room_id: null,
        length_ft: 30,
        fitting_equivalent_length_ft: 0,
        duct_shape: "round",
        target_height_in: null,
        material: "sheet_metal",
        cfm: 0,
        friction_rate: 0,
        velocity_fpm: 0,
        calculated_diameter_in: null,
        calculated_width_in: null,
        calculated_height_in: null,
        total_effective_length_ft: 30,
        pressure_drop_iwc: 0.024,
        has_balancing_damper: false,
      },
    ];
    const ductSchedule: DuctSizingResult[] = [
      {
        runId: "trunk-1",
        cfm: 400,
        frictionRate: 0.08,
        ductShape: "round",
        diameterIn: 14,
        widthIn: null,
        heightIn: null,
        velocityFpm: 700,
        velocityWarning: null,
        exceedsTableRange: false,
        totalEffectiveLengthFt: 30,
        pressureDropIwc: 0.024,
      },
    ];
    const result = buildDuctRoutingIllustrations(rooms, zones, ductRuns, ductSchedule, new Map());
    const ahuPin = result[0].pins.find((p) => p.kind === "ahu");
    expect(ahuPin?.trunkDiameterIn).toBe(14);
    expect(ahuPin?.trunkCfm).toBe(400);
  });

  it("falls back to the zone's summed room CFM for the trunk stub when no static-pressure-sized trunk exists yet", () => {
    const rooms = [
      makeRoom({
        id: "room-1",
        position_x_norm: 0.3,
        position_y_norm: 0.4,
        position_source_drawing_id: "drawing-1",
        position_source_page_number: 2,
      }),
    ];
    const zones = [
      makeZone({
        ahu_position_x_norm: 0.5,
        ahu_position_y_norm: 0.5,
        ahu_position_source_drawing_id: "drawing-1",
        ahu_position_source_page_number: 2,
      }),
    ];
    const result = buildDuctRoutingIllustrations(rooms, zones, [], [], new Map([["room-1", 180]]));
    const ahuPin = result[0].pins.find((p) => p.kind === "ahu");
    expect(ahuPin?.trunkDiameterIn).toBeNull();
    expect(ahuPin?.trunkCfm).toBe(180);
  });

  it("excludes the room the AHU pin itself sits in - no overlapping register at the same spot", () => {
    const rooms = [
      makeRoom({
        id: "utility-room",
        name: "Utility Room",
        position_x_norm: 0.655,
        position_y_norm: 0.445,
        position_source_drawing_id: "drawing-1",
        position_source_page_number: 6,
      }),
      makeRoom({
        id: "bedroom",
        name: "Bedroom",
        position_x_norm: 0.3,
        position_y_norm: 0.4,
        position_source_drawing_id: "drawing-1",
        position_source_page_number: 6,
      }),
    ];
    const zones = [
      makeZone({
        ahu_position_x_norm: 0.655,
        ahu_position_y_norm: 0.445,
        ahu_position_source_drawing_id: "drawing-1",
        ahu_position_source_page_number: 6,
      }),
    ];
    const result = buildDuctRoutingIllustrations(rooms, zones, [], [], new Map());
    // 1 AHU pin + 1 real register pin (Bedroom) - Utility Room, which
    // shares the AHU's exact position, gets no pin/route of its own.
    expect(result[0].pins).toHaveLength(2);
    expect(result[0].pins.some((p) => p.kind === "room" && p.label === "Utility Room")).toBe(false);
    expect(result[0].pins.some((p) => p.kind === "room" && p.label === "Bedroom")).toBe(true);
    expect(result[0].routes).toHaveLength(1);
    expect(result[0].routes[0].roomName).toBe("Bedroom");
  });

  it("excludes a room pinned on a different sheet than its zone's AHU", () => {
    const rooms = [
      makeRoom({
        id: "room-1",
        position_x_norm: 0.3,
        position_y_norm: 0.4,
        position_source_drawing_id: "drawing-1",
        position_source_page_number: 3, // different page than the AHU below
      }),
    ];
    const zones = [
      makeZone({
        ahu_position_x_norm: 0.5,
        ahu_position_y_norm: 0.5,
        ahu_position_source_drawing_id: "drawing-1",
        ahu_position_source_page_number: 2,
      }),
    ];
    expect(buildDuctRoutingIllustrations(rooms, zones, [], [], new Map())).toEqual([]);
  });

  it("leaves lengthFt/diameterIn null when no matching duct run exists yet, but still shows CFM from the independent fallback map", () => {
    const rooms = [
      makeRoom({
        id: "room-1",
        position_x_norm: 0.3,
        position_y_norm: 0.4,
        position_source_drawing_id: "drawing-1",
        position_source_page_number: 2,
      }),
    ];
    const zones = [
      makeZone({
        ahu_position_x_norm: 0.5,
        ahu_position_y_norm: 0.5,
        ahu_position_source_drawing_id: "drawing-1",
        ahu_position_source_page_number: 2,
      }),
    ];
    const result = buildDuctRoutingIllustrations(rooms, zones, [], [], new Map([["room-1", 145]]));
    expect(result[0].routes[0].lengthFt).toBeNull();
    expect(result[0].routes[0].diameterIn).toBeNull();
    expect(result[0].routes[0].cfm).toBe(145);
  });

  describe("real duct_diffusers data (Manual D Schematic Diagram Generator, Section 2)", () => {
    const rooms = [
      makeRoom({
        id: "room-1",
        position_x_norm: 0.3,
        position_y_norm: 0.4,
        position_source_drawing_id: "drawing-1",
        position_source_page_number: 2,
      }),
    ];
    const zones = [
      makeZone({
        ahu_position_x_norm: 0.5,
        ahu_position_y_norm: 0.5,
        ahu_position_source_drawing_id: "drawing-1",
        ahu_position_source_page_number: 2,
      }),
    ];

    it("carries a room's real pattern type onto its pin and route instead of the undefined (one-way) default", () => {
      const diffusers = [makeDiffuser({ pattern_type: "four_way", round_diameter_in: 8, cfm: 130 })];
      const result = buildDuctRoutingIllustrations(rooms, zones, [], [], new Map(), diffusers);
      const roomPin = result[0].pins.find((p) => p.kind === "room");
      expect(roomPin?.patternTagCode).toBe("4W");
      expect(result[0].routes[0].patternTagCode).toBe("4W");
      expect(result[0].routes[0].diameterIn).toBe(8);
      expect(result[0].routes[0].cfm).toBe(130);
    });

    it("leaves patternTagCode undefined (falls back to the pre-existing default) when a room has no duct_diffusers row", () => {
      const result = buildDuctRoutingIllustrations(rooms, zones, [], [], new Map(), []);
      const roomPin = result[0].pins.find((p) => p.kind === "room");
      expect(roomPin?.patternTagCode).toBeUndefined();
      expect(result[0].routes[0].patternTagCode).toBeUndefined();
    });

    it("renders a second supply diffuser in the same room as its own extra pin+route, not merged into the first", () => {
      const diffusers = [
        makeDiffuser({ id: "d1", pattern_type: "four_way", cfm: 100 }),
        makeDiffuser({ id: "d2", pattern_type: "linear_slot", cfm: 60, position_x_norm: 0.31, position_y_norm: 0.41 }),
      ];
      const result = buildDuctRoutingIllustrations(rooms, zones, [], [], new Map(), diffusers);
      const roomPins = result[0].pins.filter((p) => p.kind === "room");
      expect(roomPins).toHaveLength(2);
      expect(roomPins.map((p) => p.patternTagCode).sort()).toEqual(["4W", "LS"]);
      const supplyRoutes = result[0].routes.filter((r) => r.roomId === "room-1");
      expect(supplyRoutes).toHaveLength(2);
    });

    it("does not draw the generic default supply pin for a room whose only diffuser is a return grille", () => {
      const diffusers = [makeDiffuser({ airflow_direction: "return", pattern_type: "return_grille", cfm: -100 })];
      const result = buildDuctRoutingIllustrations(rooms, zones, [], [], new Map(), diffusers);
      const roomKindPins = result[0].pins.filter((p) => p.kind === "room");
      expect(roomKindPins).toHaveLength(0);
      const returnPins = result[0].pins.filter((p) => p.kind === "return");
      expect(returnPins).toHaveLength(1);
      expect(returnPins[0].patternTagCode).toBe("RA");
      // A return-only diffuser shouldn't fabricate a supply route either.
      expect(result[0].routes.filter((r) => r.roomId === "room-1")).toHaveLength(0);
    });

    it("uses a diffuser's own explicit position when set, instead of the room's single pin position", () => {
      const diffusers = [
        makeDiffuser({ pattern_type: "sidewall", position_x_norm: 0.35, position_y_norm: 0.42 }),
        makeDiffuser({ id: "d2", airflow_direction: "return", pattern_type: "return_grille", position_x_norm: 0.28, position_y_norm: 0.38, cfm: -80 }),
      ];
      const result = buildDuctRoutingIllustrations(rooms, zones, [], [], new Map(), diffusers);
      // Primary supply diffuser drives the room's own pin/route position
      // (still the room's coordinate, per the existing one-pin-per-room
      // shape) - only the SECOND (extra) diffuser gets its own explicit
      // position, since it isn't the one driving the default pin.
      const returnPin = result[0].pins.find((p) => p.kind === "return");
      expect(returnPin?.xNorm).toBe(0.28);
      expect(returnPin?.yNorm).toBe(0.38);
    });
  });
});
