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
    equipment_selection_notes: null,
    ahu_position_x_norm: null,
    ahu_position_y_norm: null,
    ahu_position_source_drawing_id: null,
    ahu_position_source_page_number: null,
    ...overrides,
  };
}

describe("buildDuctRoutingIllustrations", () => {
  it("returns empty when no zone has a resolved AHU pin", () => {
    const rooms = [makeRoom({})];
    const zones = [makeZone({})];
    expect(buildDuctRoutingIllustrations(rooms, zones, [], [])).toEqual([]);
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
      },
    ];

    const result = buildDuctRoutingIllustrations(rooms, zones, ductRuns, ductSchedule);
    expect(result).toHaveLength(1);
    expect(result[0].drawingId).toBe("drawing-1");
    expect(result[0].pageNumber).toBe(2);
    expect(result[0].pins).toHaveLength(2);
    expect(result[0].pins.find((p) => p.kind === "ahu")?.xNorm).toBe(0.5);
    expect(result[0].pins.find((p) => p.kind === "room")?.label).toBe("Bedroom");
    expect(result[0].routes).toHaveLength(1);
    expect(result[0].routes[0].lengthFt).toBe(22);
    expect(result[0].routes[0].diameterIn).toBe(6);
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
    expect(buildDuctRoutingIllustrations(rooms, zones, [], [])).toEqual([]);
  });

  it("leaves lengthFt/diameterIn null when no matching duct run exists yet", () => {
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
    const result = buildDuctRoutingIllustrations(rooms, zones, [], []);
    expect(result[0].routes[0].lengthFt).toBeNull();
    expect(result[0].routes[0].diameterIn).toBeNull();
  });
});
