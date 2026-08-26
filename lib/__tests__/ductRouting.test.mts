// Direct unit tests for lib/ductRouting.ts - the auto Manual D run
// length/fitting feature built from real, sourced ACCA Manual D Appendix
// 3 data (see the project memory file
// acca_manual_d_fitting_equivalent_lengths.md for the sourcing).
import { describe, it, expect } from "vitest";
import {
  convertEquivalentLength,
  pageScaleFromArchitecturalScale,
  derivePageScale,
  computeManhattanDistanceFt,
  countManhattanTurns,
  computeRoutedBranchRun,
  getDuctRoutingGateStatus,
  findAiSuggestedPosition,
  resolveRoomPositionSource,
  layoutDuctRoutingLabels,
  formatDuctSizeCfm,
  computeSheetDuctRouting,
  buildDuctNetworkPrimitives,
  parseArchitecturalScaleText,
  resolveSheetScale,
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

describe("pageScaleFromArchitecturalScale", () => {
  it("converts a real printed scale (1/4\" = 1'-0\") on a true-size sheet to feet-per-page-point", () => {
    // A 36x24in (2592x1728pt) sheet at 1/4"=1' represents a real 144ft x
    // 96ft area - verified this session against Schneider's actual
    // construction set (both floor plan sheets print this exact scale).
    const feetPerPt = pageScaleFromArchitecturalScale(0.25, 1);
    expect(feetPerPt * 2592).toBeCloseTo(144, 5);
    expect(feetPerPt * 1728).toBeCloseTo(96, 5);
  });

  it("converts 1/8\" = 1'-0\" (a common smaller scale) correctly", () => {
    const feetPerPt = pageScaleFromArchitecturalScale(0.125, 1);
    expect(feetPerPt * 72).toBeCloseTo(8, 5); // 1 printed inch = 8ft at 1/8"=1'
  });
});

describe("parseArchitecturalScaleText", () => {
  it("parses the real Schneider title-block text exactly (1/4\" = 1'-0\")", () => {
    // Visually confirmed against the actual rendered A3.0 and A3.1 title
    // blocks this session, not assumed.
    expect(parseArchitecturalScaleText('1/4" = 1\'-0"')).toEqual({ numeratorInches: 0.25, denominatorFeet: 1 });
  });

  it("parses without spaces around the equals sign", () => {
    expect(parseArchitecturalScaleText('3/16"=1\'-0"')).toEqual({ numeratorInches: 0.1875, denominatorFeet: 1 });
  });

  it("parses a whole-inch numerator (no fraction)", () => {
    expect(parseArchitecturalScaleText('1" = 1\'-0"')).toEqual({ numeratorInches: 1, denominatorFeet: 1 });
  });

  it("parses curly/smart quote variants", () => {
    expect(parseArchitecturalScaleText("1/4″ = 1′-0″")).toEqual({ numeratorInches: 0.25, denominatorFeet: 1 });
  });

  it("returns null for text with no real scale pattern", () => {
    expect(parseArchitecturalScaleText("NOT TO SCALE")).toBeNull();
    expect(parseArchitecturalScaleText("")).toBeNull();
  });
});

describe("resolveSheetScale", () => {
  it("prefers the printed scale over the room-bounding-box median when both are available", () => {
    const roomsImplyingADifferentScale = [
      { wallPageHorizontalLenFt: 999, wallPageVerticalLenFt: 999, widthNorm: 0.1, heightNorm: 0.1 },
    ];
    const result = resolveSheetScale('1/4" = 1\'-0"', roomsImplyingADifferentScale, 2592, 1728);
    expect(result.source).toBe("printed_scale");
    expect(result.feetPerPagePoint).toBeCloseTo(pageScaleFromArchitecturalScale(0.25, 1), 10);
  });

  it("falls back to the room-bounding-box median when no printed scale is known", () => {
    const rooms = [{ wallPageHorizontalLenFt: 10, wallPageVerticalLenFt: 8, widthNorm: 0.1, heightNorm: 0.1 }];
    const result = resolveSheetScale(null, rooms, 1000, 800);
    expect(result.source).toBe("room_bounding_box_median");
    expect(result.feetPerPagePoint).toBeCloseTo(0.1, 10);
  });

  it("falls back to the room-bounding-box median when the printed text can't be parsed", () => {
    const rooms = [{ wallPageHorizontalLenFt: 10, wallPageVerticalLenFt: 8, widthNorm: 0.1, heightNorm: 0.1 }];
    const result = resolveSheetScale("NOT TO SCALE", rooms, 1000, 800);
    expect(result.source).toBe("room_bounding_box_median");
  });

  it("reports 'none' when neither a printed scale nor real room samples are available", () => {
    const result = resolveSheetScale(null, [], 1000, 800);
    expect(result.source).toBe("none");
    expect(result.feetPerPagePoint).toBeNull();
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
  const zones = [
    {
      id: "z1",
      name: "Zone 1",
      ahu_position_x_norm: 0.5,
      ahu_position_y_norm: 0.5,
      return_position_x_norm: 0.55,
      return_position_y_norm: 0.55,
    },
  ];

  it("is ready when every relevant room and zone has a resolved position (AHU and return both)", () => {
    const rooms = [
      { id: "r1", name: "Bedroom", zone_id: "z1", floor_area_sqft: 150, position_x_norm: 0.2, position_y_norm: 0.2 },
    ];
    const status = getDuctRoutingGateStatus(rooms, zones);
    expect(status.ready).toBe(true);
    expect(status.unresolvedRoomIds).toEqual([]);
    expect(status.unresolvedZoneIds).toEqual([]);
    expect(status.unresolvedReturnZoneIds).toEqual([]);
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
    const unresolvedZones = [
      { id: "z1", name: "Zone 1", ahu_position_x_norm: null, ahu_position_y_norm: null, return_position_x_norm: 0.55, return_position_y_norm: 0.55 },
    ];
    const status = getDuctRoutingGateStatus(rooms, unresolvedZones);
    expect(status.ready).toBe(false);
    expect(status.unresolvedZoneIds).toEqual(["z1"]);
  });

  // Per direct instruction: the return-air plenum pin is required, same
  // workflow as the AHU pin - a zone missing only its return position
  // must block the gate exactly like a missing AHU position does.
  it("is not ready when a zone in use is missing its return-plenum position", () => {
    const rooms = [
      { id: "r1", name: "Bedroom", zone_id: "z1", floor_area_sqft: 150, position_x_norm: 0.2, position_y_norm: 0.2 },
    ];
    const unresolvedZones = [
      { id: "z1", name: "Zone 1", ahu_position_x_norm: 0.5, ahu_position_y_norm: 0.5, return_position_x_norm: null, return_position_y_norm: null },
    ];
    const status = getDuctRoutingGateStatus(rooms, unresolvedZones);
    expect(status.ready).toBe(false);
    expect(status.unresolvedReturnZoneIds).toEqual(["z1"]);
    expect(status.unresolvedZoneIds).toEqual([]); // AHU itself is resolved - only the return is the gap
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
          printed_scale_text: null,
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

describe("formatDuctSizeCfm", () => {
  it("joins size and CFM when both are known", () => {
    expect(formatDuctSizeCfm(7, 200)).toBe('7"⌀ / 200 cfm');
  });
  it("rounds CFM", () => {
    expect(formatDuctSizeCfm(7, 199.6)).toBe('7"⌀ / 200 cfm');
  });
  it("falls back to just size when CFM is unknown", () => {
    expect(formatDuctSizeCfm(7, null)).toBe('7"⌀');
  });
  it("falls back to just CFM when size is unknown", () => {
    expect(formatDuctSizeCfm(null, 200)).toBe("200 cfm");
  });
  it("returns empty string when neither is known", () => {
    expect(formatDuctSizeCfm(null, null)).toBe("");
  });
});

describe("layoutDuctRoutingLabels", () => {
  it("leaves well-separated labels at their natural anchor position", () => {
    const labels = layoutDuctRoutingLabels({
      pins: [
        { kind: "room", label: "Kitchen", xNorm: 0.1, yNorm: 0.1 },
        { kind: "room", label: "Bedroom 5", xNorm: 0.9, yNorm: 0.9 },
      ],
      routes: [],
    });
    expect(labels).toHaveLength(2);
    // Room labels render uppercase (see REFERENCE-DOCS/IMG_3916.JPG's
    // real room-label convention).
    const kitchen = labels.find((l) => l.text === "KITCHEN")!;
    const bedroom = labels.find((l) => l.text === "BEDROOM 5")!;
    expect(kitchen.x).toBeCloseTo(0.1 * 100 + 2.4);
    expect(kitchen.y).toBeCloseTo(0.1 * 100 - 2.2);
    expect(bedroom.x).toBeCloseTo(0.9 * 100 + 2.4);
    expect(bedroom.y).toBeCloseTo(0.9 * 100 - 2.2);
  });

  // Root cause of the real "impossible to read" complaint (diagnosed
  // 2026-08-25 against Schneider's actual dense room cluster) - two
  // labels landing on essentially the same point must not be drawn on
  // top of each other.
  it("pushes a colliding label away from an earlier one instead of stacking them", () => {
    const labels = layoutDuctRoutingLabels({
      pins: [
        { kind: "room", label: "Kitchen", xNorm: 0.5, yNorm: 0.5 },
        { kind: "room", label: "Bathroom 2", xNorm: 0.5, yNorm: 0.5 },
      ],
      routes: [],
    });
    expect(labels).toHaveLength(2);
    const [first, second] = labels;
    const collided = Math.abs(first.x - second.x) < 0.01 && Math.abs(first.y - second.y) < 0.01;
    expect(collided).toBe(false);
  });

  it("anchors a run's size/CFM label at the register end, not the line midpoint", () => {
    const labels = layoutDuctRoutingLabels({
      pins: [
        { kind: "ahu", label: "Zone 1 (AHU)", xNorm: 0.2, yNorm: 0.2 },
        { kind: "room", label: "Dining Room", xNorm: 0.8, yNorm: 0.2 },
      ],
      routes: [{ toXNorm: 0.8, toYNorm: 0.2, diameterIn: 7, cfm: 200 }],
    });
    const runLabel = labels.find((l) => l.kind === "run")!;
    // Real Wrightsoft/industry-standard register callout: circled type
    // code + stacked size-over-CFM (see REFERENCE-DOCS/IMG_3916.JPG),
    // not one inline string.
    expect(runLabel.typeCode).toBe("1W");
    expect(runLabel.text).toBe('7"⌀');
    expect(runLabel.secondaryText).toBe("200");
    expect(runLabel.x).toBeCloseTo(0.8 * 100 + 2.4);
    expect(runLabel.y).toBeCloseTo(0.2 * 100 + 2.6);
    // Leader-line anchor points at the TRUE register location, not the
    // label's own offset position - a leader line drawn from anchorX/Y to
    // x/y therefore points back at the real register, not at empty space
    // near it.
    expect(runLabel.anchorX).toBeCloseTo(0.8 * 100);
    expect(runLabel.anchorY).toBeCloseTo(0.2 * 100);
  });

  it("leaves anchorX/anchorY equal to the natural (undisplaced) position when nothing collided", () => {
    const labels = layoutDuctRoutingLabels({
      pins: [{ kind: "room", label: "Kitchen", xNorm: 0.1, yNorm: 0.1 }],
      routes: [],
    });
    const label = labels[0];
    // The room label's own natural offset is +2.4/-2.2 from the pin -
    // when undisplaced, the leader line target (anchorX/Y, the true pin)
    // and the label's own drawn position (x/y) are close enough that a
    // renderer can skip drawing a leader line at all (direct adjacency).
    const distance = Math.hypot(label.x - label.anchorX, label.y - label.anchorY);
    expect(distance).toBeLessThan(4);
  });

  it("a label pushed to clear a collision keeps its anchor at the true feature point, not the pushed position", () => {
    const labels = layoutDuctRoutingLabels({
      pins: [
        { kind: "room", label: "Kitchen", xNorm: 0.5, yNorm: 0.5 },
        { kind: "room", label: "Bathroom 2", xNorm: 0.5, yNorm: 0.5 },
      ],
      routes: [],
    });
    const pushed = labels.find((l) => Math.abs(l.y - l.anchorY) > 0.5 || Math.abs(l.x - l.anchorX) > 0.5);
    expect(pushed).toBeDefined();
    // Anchor still points at the real pin (50, 50), regardless of where
    // decluttering moved the label text itself.
    expect(pushed!.anchorX).toBeCloseTo(50);
    expect(pushed!.anchorY).toBeCloseTo(50);
  });

  it("omits a run label entirely when neither size nor CFM is known yet", () => {
    const labels = layoutDuctRoutingLabels({
      pins: [{ kind: "ahu", label: "Zone 1 (AHU)", xNorm: 0.2, yNorm: 0.2 }],
      routes: [{ toXNorm: 0.8, toYNorm: 0.2, diameterIn: null, cfm: null }],
    });
    expect(labels.some((l) => l.kind === "run")).toBe(false);
  });

  it("includes a trunk label at the AHU only when trunk size/CFM is known", () => {
    const withTrunk = layoutDuctRoutingLabels({
      pins: [{ kind: "ahu", label: "Zone 1 (AHU)", xNorm: 0.2, yNorm: 0.2, trunkDiameterIn: 14, trunkCfm: 1149 }],
      routes: [],
    });
    expect(withTrunk.some((l) => l.kind === "trunk" && l.text === '14"⌀ / 1149 cfm')).toBe(true);

    const withoutTrunk = layoutDuctRoutingLabels({
      pins: [{ kind: "ahu", label: "Zone 1 (AHU)", xNorm: 0.2, yNorm: 0.2 }],
      routes: [],
    });
    expect(withoutTrunk.some((l) => l.kind === "trunk")).toBe(false);
  });
});

describe("computeSheetDuctRouting - end to end orchestration", () => {
  function makeExtractedRoom(overrides: Partial<ExtractedRoom>): ExtractedRoom {
    return {
      name: "Room",
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
      room_position: null,
      ...overrides,
    };
  }

  // A real, printed 40ft-wide sheet: a utility closet (AHU) on the left,
  // two bedrooms further along a shared corridor - both known dimensions
  // (so derivePageScale can resolve a real scale) and known bounding
  // boxes (so routing has real geometry to avoid).
  const extractedData = {
    rooms: [
      makeExtractedRoom({
        name: "Utility",
        wall_page_horizontal_len_ft: 4,
        room_position: { x_norm: 0.05, y_norm: 0.45, width_norm: 0.1, height_norm: 0.1, unresolved: false, reason: null },
      }),
      makeExtractedRoom({
        name: "Bedroom A",
        wall_page_horizontal_len_ft: 8,
        room_position: { x_norm: 0.6, y_norm: 0.1, width_norm: 0.2, height_norm: 0.2, unresolved: false, reason: null },
      }),
      makeExtractedRoom({
        name: "Bedroom B",
        wall_page_horizontal_len_ft: 8,
        room_position: { x_norm: 0.6, y_norm: 0.7, width_norm: 0.2, height_norm: 0.2, unresolved: false, reason: null },
      }),
    ],
    sheets: [{ name: "A1.1", page_number: 3 }],
  };

  const roomsOnSheet = [
    { id: "utility", name: "Utility", xNorm: 0.1, yNorm: 0.5 },
    { id: "bedroomA", name: "Bedroom A", xNorm: 0.7, yNorm: 0.2 },
    { id: "bedroomB", name: "Bedroom B", xNorm: 0.7, yNorm: 0.8 },
  ];

  it("routes every target room with real orthogonal geometry", () => {
    const result = computeSheetDuctRouting(extractedData, 3, 400, 400, roomsOnSheet, [
      {
        id: "zone1",
        ahuPoint: { xNorm: 0.1, yNorm: 0.5 },
        ahuOwnRoomId: "utility",
        targetRoomIds: ["bedroomA", "bedroomB"],
        corridorGraph: null,
      },
    ]);
    expect(result).not.toBeNull();
    expect(result!.get("bedroomA")).toBeDefined();
    expect(result!.get("bedroomB")).toBeDefined();
    for (const segments of result!.values()) {
      for (const seg of segments!) {
        const dx = Math.abs(seg.toXNorm - seg.fromXNorm);
        const dy = Math.abs(seg.toYNorm - seg.fromYNorm);
        // Every segment axis-aligned - no diagonal star-pattern lines.
        expect(dx < 1e-6 || dy < 1e-6).toBe(true);
      }
    }
  });

  it("returns null when no real scale can be derived for the sheet (no known printed dimension)", () => {
    const noScaleData = {
      rooms: extractedData.rooms.map((r) => ({ ...r, wall_page_horizontal_len_ft: null })),
      sheets: extractedData.sheets,
    };
    const result = computeSheetDuctRouting(noScaleData, 3, 400, 400, roomsOnSheet, [
      { id: "zone1", ahuPoint: { xNorm: 0.1, yNorm: 0.5 }, ahuOwnRoomId: "utility", targetRoomIds: ["bedroomA"], corridorGraph: null },
    ]);
    expect(result).toBeNull();
  });

  // Per direct instruction: "use the routing graph as the source of
  // truth for corridor topology - don't compute routing paths
  // independently." A zone with a real corridor graph must use it, not
  // the computed A* router, even when the computed router's own scale
  // derivation would have failed - the graph doesn't need that scale at
  // all (it calibrates against this project's own room pins directly).
  it("prefers a zone's real corridor graph over computed routing, even when computed-routing scale derivation would fail", () => {
    const graph = {
      ahu: { id: "AHU_1", x: 10, y: 50 },
      rooms: [
        { id: "utility", name: "Utility", x: 10, y: 50 },
        { id: "bedroomA", name: "Bedroom A", x: 70, y: 20 },
      ],
      corridor_nodes: [],
      edges: [{ from: "AHU_1", to: "bedroomA", type: "trunk" as const }],
    };
    const noScaleData = {
      rooms: extractedData.rooms.map((r) => ({ ...r, wall_page_horizontal_len_ft: null })),
      sheets: extractedData.sheets,
    };
    const result = computeSheetDuctRouting(noScaleData, 3, 400, 400, roomsOnSheet, [
      { id: "zone1", ahuPoint: { xNorm: 0.1, yNorm: 0.5 }, ahuOwnRoomId: "utility", targetRoomIds: ["bedroomA"], corridorGraph: graph },
    ]);
    expect(result).not.toBeNull();
    const segments = [...result!.values()].flat();
    // AHU_1(10,50) -> bedroomA(70,20) isn't axis-aligned - split into a
    // real right-angle elbow (2 segments) rather than a diagonal, same
    // as any other genuinely diagonal graph edge (see
    // ductCorridorGraph.test.mts for that behavior in isolation).
    expect(segments).toHaveLength(2);
    expect(segments.every((s) => s.cls === "trunk")).toBe(true);
  });

  it("falls back to computed routing for a zone whose graph calibration fails, without affecting a sibling zone's real graph", () => {
    const uncalibratableGraph = {
      ahu: { id: "AHU_X", x: 999, y: 999 },
      rooms: [{ id: "nowhere", name: "Nowhere Real", x: 999, y: 999 }],
      corridor_nodes: [],
      edges: [],
    };
    const result = computeSheetDuctRouting(extractedData, 3, 400, 400, roomsOnSheet, [
      { id: "zone1", ahuPoint: { xNorm: 0.1, yNorm: 0.5 }, ahuOwnRoomId: "utility", targetRoomIds: ["bedroomA"], corridorGraph: uncalibratableGraph },
    ]);
    // Falls through to the computed router (real geometry from
    // extractedData is available) rather than returning null just
    // because the graph itself couldn't be calibrated.
    expect(result).not.toBeNull();
    expect(result!.get("bedroomA")).toBeDefined();
  });
});

describe("buildDuctNetworkPrimitives", () => {
  it("dedupes a segment shared by two rooms' paths into a single drawn segment, keeping the higher classification", () => {
    const primitives = buildDuctNetworkPrimitives([
      { fromXNorm: 0, fromYNorm: 0, toXNorm: 1, toYNorm: 0, cls: "trunk" },
      { fromXNorm: 1, fromYNorm: 0, toXNorm: 0, toYNorm: 0, cls: "branch" }, // same physical segment, reversed
    ]);
    expect(primitives.segments).toHaveLength(1);
    expect(primitives.segments[0].cls).toBe("trunk");
  });

  it("places a tee at a real 3-way branch junction", () => {
    const primitives = buildDuctNetworkPrimitives([
      { fromXNorm: 0, fromYNorm: 0.5, toXNorm: 0.5, toYNorm: 0.5, cls: "trunk" }, // trunk approaches from the left
      { fromXNorm: 0.5, fromYNorm: 0.5, toXNorm: 1, toYNorm: 0.5, cls: "trunk" }, // trunk continues right
      { fromXNorm: 0.5, fromYNorm: 0.5, toXNorm: 0.5, toYNorm: 1, cls: "branch" }, // branch peels off downward
    ]);
    expect(primitives.tees).toHaveLength(1);
    expect(primitives.tees[0]).toEqual({ xNorm: 0.5, yNorm: 0.5 });
    expect(primitives.elbows).toHaveLength(0);
  });

  it("places an elbow at a real 90-degree turn, not a tee", () => {
    const primitives = buildDuctNetworkPrimitives([
      { fromXNorm: 0, fromYNorm: 0, toXNorm: 0.5, toYNorm: 0, cls: "runout" },
      { fromXNorm: 0.5, fromYNorm: 0, toXNorm: 0.5, toYNorm: 0.5, cls: "runout" },
    ]);
    expect(primitives.elbows).toHaveLength(1);
    expect(primitives.elbows[0]).toEqual({ xNorm: 0.5, yNorm: 0 });
    expect(primitives.tees).toHaveLength(0);
  });

  it("places no fitting symbol at a straight pass-through point", () => {
    const primitives = buildDuctNetworkPrimitives([
      { fromXNorm: 0, fromYNorm: 0, toXNorm: 0.5, toYNorm: 0, cls: "trunk" },
      { fromXNorm: 0.5, fromYNorm: 0, toXNorm: 1, toYNorm: 0, cls: "trunk" },
    ]);
    expect(primitives.elbows).toHaveLength(0);
    expect(primitives.tees).toHaveLength(0);
  });
});
