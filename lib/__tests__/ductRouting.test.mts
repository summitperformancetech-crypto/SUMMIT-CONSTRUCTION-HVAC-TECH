// Direct unit tests for lib/ductRouting.ts - the auto Manual D run
// length/fitting feature built from real, sourced ACCA Manual D Appendix
// 3 data (see the project memory file
// acca_manual_d_fitting_equivalent_lengths.md for the sourcing).
import { describe, it, expect } from "vitest";
import {
  convertEquivalentLength,
  derivePageScale,
  computeManhattanDistanceFt,
  countManhattanTurns,
  computeRoutedBranchRun,
  getDuctRoutingGateStatus,
  findAiSuggestedPosition,
  resolveRoomPositionSource,
  ROUND_ELBOW_EL_REFERENCE_FT,
  BRANCH_TAKEOFF_EL_REFERENCE_FT,
  EL_REFERENCE_VELOCITY_FPM,
  EL_REFERENCE_FRICTION_RATE_IWC_PER_100FT,
} from "../ductRouting";
import type { ExtractedRoom, DrawingRow } from "../drawingExtraction";

describe("convertEquivalentLength", () => {
  it("matches the ACCA Manual D Appendix 3 worked example (65ft @ 900Fpm/0.08 -> 700Fpm/0.12, standard rounds to 26)", () => {
    // Straight from the standard's own Section A3-3 example. The standard
    // states the rounded result as "26 Feet" - the precise value is
    // 26.21, confirming the formula (not the standard's own rounding) is
    // what this test should hold to.
    expect(convertEquivalentLength(65, 700, 0.12)).toBeCloseTo(26.21, 1);
  });

  it("returns the reference value unchanged at reference conditions", () => {
    expect(
      convertEquivalentLength(
        ROUND_ELBOW_EL_REFERENCE_FT,
        EL_REFERENCE_VELOCITY_FPM,
        EL_REFERENCE_FRICTION_RATE_IWC_PER_100FT,
      ),
    ).toBeCloseTo(ROUND_ELBOW_EL_REFERENCE_FT, 5);
  });
});

describe("derivePageScale", () => {
  it("derives a consistent scale from a room whose width and height both agree", () => {
    // A room drawn 0.1 x 0.1 (normalized) on a 1000x800pt page, with real
    // dimensions 10ft x 8ft, implies feetPerPagePoint = 10/(0.1*1000) =
    // 0.1 from width, and 8/(0.1*800) = 0.1 from height - consistent.
    const result = derivePageScale(
      [{ wallPageHorizontalLenFt: 10, wallPageVerticalLenFt: 8, widthNorm: 0.1, heightNorm: 0.1 }],
      1000,
      800,
    );
    expect(result.feetPerPagePoint).toBeCloseTo(0.1, 5);
    expect(result.sampleCount).toBe(1);
    expect(result.outlierCount).toBe(0);
  });

  it("takes the median across multiple agreeing rooms", () => {
    const result = derivePageScale(
      [
        { wallPageHorizontalLenFt: 10, wallPageVerticalLenFt: 8, widthNorm: 0.1, heightNorm: 0.1 },
        { wallPageHorizontalLenFt: 12, wallPageVerticalLenFt: 9.6, widthNorm: 0.12, heightNorm: 0.12 },
      ],
      1000,
      800,
    );
    expect(result.feetPerPagePoint).toBeCloseTo(0.1, 5);
    expect(result.sampleCount).toBe(2);
  });

  it("excludes a room whose width- and height-implied scales disagree sharply", () => {
    const result = derivePageScale(
      [
        { wallPageHorizontalLenFt: 10, wallPageVerticalLenFt: 8, widthNorm: 0.1, heightNorm: 0.1 },
        // width implies 0.1, height implies 0.3 (misread bounding box) - disagreement > 35%.
        { wallPageHorizontalLenFt: 10, wallPageVerticalLenFt: 24, widthNorm: 0.1, heightNorm: 0.1 },
      ],
      1000,
      800,
    );
    expect(result.sampleCount).toBe(1);
    expect(result.outlierCount).toBe(1);
    expect(result.feetPerPagePoint).toBeCloseTo(0.1, 5);
  });

  it("returns null when no room has both a real dimension and a position", () => {
    const result = derivePageScale(
      [{ wallPageHorizontalLenFt: null, wallPageVerticalLenFt: null, widthNorm: 0.1, heightNorm: 0.1 }],
      1000,
      800,
    );
    expect(result.feetPerPagePoint).toBeNull();
    expect(result.sampleCount).toBe(0);
  });
});

describe("computeManhattanDistanceFt", () => {
  it("sums the horizontal and vertical real-feet legs, not a straight line", () => {
    // page is 40ft wide x 30ft tall; points 0.25 apart in x, 0.5 apart in y.
    const dist = computeManhattanDistanceFt({ xNorm: 0.1, yNorm: 0.1 }, { xNorm: 0.35, yNorm: 0.6 }, 40, 30);
    // dx = 0.25*40 = 10ft, dy = 0.5*30 = 15ft, total = 25ft (not sqrt(10^2+15^2)).
    expect(dist).toBeCloseTo(25, 5);
  });
});

describe("countManhattanTurns", () => {
  it("returns 0 for a straight horizontal run", () => {
    expect(countManhattanTurns({ xNorm: 0.1, yNorm: 0.5 }, { xNorm: 0.4, yNorm: 0.5 })).toBe(0);
  });

  it("returns 0 for a straight vertical run", () => {
    expect(countManhattanTurns({ xNorm: 0.5, yNorm: 0.1 }, { xNorm: 0.5, yNorm: 0.4 })).toBe(0);
  });

  it("returns 1 for a run needing both a horizontal and vertical leg", () => {
    expect(countManhattanTurns({ xNorm: 0.1, yNorm: 0.1 }, { xNorm: 0.4, yNorm: 0.4 })).toBe(1);
  });
});

describe("computeRoutedBranchRun", () => {
  it("combines real length with a takeoff-plus-one-elbow fitting length for a diagonal run", () => {
    const result = computeRoutedBranchRun({ xNorm: 0.1, yNorm: 0.1 }, { xNorm: 0.35, yNorm: 0.6 }, 40, 30);
    expect(result.lengthFt).toBeCloseTo(25, 5);
    expect(result.turnCount).toBe(1);
    expect(result.fittingEquivalentLengthFt).toBeCloseTo(
      BRANCH_TAKEOFF_EL_REFERENCE_FT + ROUND_ELBOW_EL_REFERENCE_FT,
      5,
    );
  });

  it("charges only the takeoff, no elbow, for a straight run", () => {
    const result = computeRoutedBranchRun({ xNorm: 0.1, yNorm: 0.5 }, { xNorm: 0.4, yNorm: 0.5 }, 40, 30);
    expect(result.turnCount).toBe(0);
    expect(result.fittingEquivalentLengthFt).toBeCloseTo(BRANCH_TAKEOFF_EL_REFERENCE_FT, 5);
  });
});

describe("getDuctRoutingGateStatus", () => {
  const zones = [{ id: "z1", name: "Zone 1", ahu_position_x_norm: 0.5, ahu_position_y_norm: 0.5 }];

  it("is ready when every relevant room and zone has a resolved position", () => {
    const rooms = [
      { id: "r1", name: "Bedroom", zone_id: "z1", floor_area_sqft: 150, position_x_norm: 0.2, position_y_norm: 0.2 },
    ];
    const status = getDuctRoutingGateStatus(rooms, zones);
    expect(status.ready).toBe(true);
    expect(status.unresolvedRoomIds).toEqual([]);
    expect(status.unresolvedZoneIds).toEqual([]);
  });

  it("is not ready when a relevant room is missing a position", () => {
    const rooms = [
      { id: "r1", name: "Bedroom", zone_id: "z1", floor_area_sqft: 150, position_x_norm: null, position_y_norm: null },
    ];
    const status = getDuctRoutingGateStatus(rooms, zones);
    expect(status.ready).toBe(false);
    expect(status.unresolvedRoomIds).toEqual(["r1"]);
  });

  it("is not ready when a zone in use is missing its AHU position", () => {
    const rooms = [
      { id: "r1", name: "Bedroom", zone_id: "z1", floor_area_sqft: 150, position_x_norm: 0.2, position_y_norm: 0.2 },
    ];
    const unresolvedZones = [{ id: "z1", name: "Zone 1", ahu_position_x_norm: null, ahu_position_y_norm: null }];
    const status = getDuctRoutingGateStatus(rooms, unresolvedZones);
    expect(status.ready).toBe(false);
    expect(status.unresolvedZoneIds).toEqual(["z1"]);
  });

  it("ignores rooms with no zone assignment or no floor area (not part of duct routing)", () => {
    const rooms = [
      { id: "r1", name: "Porch", zone_id: null, floor_area_sqft: 70, position_x_norm: null, position_y_norm: null },
      { id: "r2", name: "Attic", zone_id: "z1", floor_area_sqft: null, position_x_norm: null, position_y_norm: null },
    ];
    const status = getDuctRoutingGateStatus(rooms, zones);
    expect(status.unresolvedRoomIds).toEqual([]);
    // No relevant rooms at all -> not "ready" (nothing to route), but no unresolved items either.
    expect(status.ready).toBe(false);
  });
});

describe("findAiSuggestedPosition", () => {
  const baseRoom: ExtractedRoom = {
    name: "Bedroom #2",
    floor_area_sqft: 150,
    wall_north_len_ft: null,
    wall_south_len_ft: null,
    wall_east_len_ft: null,
    wall_west_len_ft: null,
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
    windows: { value: null, unresolved: true, reason: null, certainty: null },
    door_count: null,
    unresolved: false,
    reason: null,
    duct_location: { value: null, unresolved: true, certainty: null },
    duct_insulation_r_value: { value: null, unresolved: true, certainty: null },
    duct_source: null,
    duct_confidence: null,
    ceiling_height_ft: null,
    ceiling_height_ft_elevation_derived: null,
    room_label_text: null,
    source_sheet: "A1.1",
    room_position: { x_norm: 0.2, y_norm: 0.3, width_norm: 0.1, height_norm: 0.1, unresolved: true, reason: null },
  };

  it("matches by name, normalizing # and whitespace the same way the rest of the app does", () => {
    const found = findAiSuggestedPosition("Bedroom 2", [baseRoom]);
    expect(found?.x_norm).toBe(0.2);
  });

  it("returns null when no room matches", () => {
    expect(findAiSuggestedPosition("Kitchen", [baseRoom])).toBeNull();
  });

  it("returns null when the matched room has no room_position", () => {
    const noPosition: ExtractedRoom = { ...baseRoom, room_position: undefined };
    expect(findAiSuggestedPosition("Bedroom 2", [noPosition])).toBeNull();
  });
});

describe("resolveRoomPositionSource", () => {
  const room: ExtractedRoom = {
    name: "Kitchen",
    floor_area_sqft: 200,
    wall_north_len_ft: null,
    wall_south_len_ft: null,
    wall_east_len_ft: null,
    wall_west_len_ft: null,
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
    windows: { value: null, unresolved: true, reason: null, certainty: null },
    door_count: null,
    unresolved: false,
    reason: null,
    duct_location: { value: null, unresolved: true, certainty: null },
    duct_insulation_r_value: { value: null, unresolved: true, certainty: null },
    duct_source: null,
    duct_confidence: null,
    ceiling_height_ft: null,
    ceiling_height_ft_elevation_derived: null,
    room_label_text: null,
    source_sheet: "A1.1",
    room_position: { x_norm: 0.4, y_norm: 0.5, width_norm: 0.1, height_norm: 0.1, unresolved: true, reason: null },
  };

  const drawing: Pick<DrawingRow, "id" | "extraction_status" | "extracted_data"> = {
    id: "drawing-1",
    extraction_status: "completed",
    extracted_data: {
      orientation: { detected: false, description: null },
      building_envelope: {} as never,
      rooms: [room],
      sheets: [
        {
          name: "A1.1",
          sourceAuthority: "unknown",
          ceiling_insulation_callout_text: null,
          revisionDate: null,
          revisionNote: null,
          frontAnchorPageEdge: null,
          page_number: 3,
        },
      ],
    },
  };

  it("resolves a room's drawing id and page number by cross-referencing sheets[]", () => {
    const result = resolveRoomPositionSource("Kitchen", [drawing]);
    expect(result?.drawingId).toBe("drawing-1");
    expect(result?.pageNumber).toBe(3);
    expect(result?.position.x_norm).toBe(0.4);
  });

  it("returns null when the sheet has no known page_number", () => {
    const noPageNumber = {
      ...drawing,
      extracted_data: {
        ...drawing.extracted_data!,
        sheets: [{ ...drawing.extracted_data!.sheets![0], page_number: null }],
      },
    };
    expect(resolveRoomPositionSource("Kitchen", [noPageNumber])).toBeNull();
  });

  it("returns null when no drawing has a matching room", () => {
    expect(resolveRoomPositionSource("Bathroom", [drawing])).toBeNull();
  });

  it("skips a drawing that hasn't completed extraction", () => {
    const pending = { ...drawing, extraction_status: "pending" as const };
    expect(resolveRoomPositionSource("Kitchen", [pending])).toBeNull();
  });
});
