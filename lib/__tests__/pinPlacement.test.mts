// proposeRoomPins / proposeMechanicalPins - the AI duct-routing pin
// proposals (pipeline stage 9). Must not depend on lib/pdfRoomGeometry.ts.
// Run via `npm test` (Vitest).
import { describe, it, expect } from "vitest";
import { proposeRoomPin, proposeRoomPins, proposeMechanicalPins, type PinDrawingInput } from "../pinPlacement";

const drawingWith = (rooms: unknown[]): PinDrawingInput => ({
  id: "drawing-1",
  extraction_status: "completed",
  floor_plan_page_number: 3,
  extracted_data: {
    sheets: [{ name: "A2.0", page_number: 3 }],
    rooms,
  } as unknown as PinDrawingInput["extracted_data"],
});

describe("proposeRoomPin", () => {
  it("returns the already-confirmed position untouched", () => {
    const pin = proposeRoomPin(
      { id: "r1", name: "Kitchen", zone_id: "z1", floor_area_sqft: 200, position_x_norm: 0.42, position_y_norm: 0.61 },
      [],
    );
    expect(pin.confidence).toBe("confirmed");
    expect(pin).toMatchObject({ xNorm: 0.42, yNorm: 0.61 });
  });

  it("uses the extraction bounding-box centre when no confirmed position exists", () => {
    const drawings = [
      drawingWith([
        {
          name: "Kitchen",
          source_sheet: "A2.0",
          room_position: { x_norm: 0.2, y_norm: 0.4, width_norm: 0.2, height_norm: 0.1, unresolved: true, reason: null },
        },
      ]),
    ];
    const pin = proposeRoomPin(
      { id: "r1", name: "Kitchen", zone_id: "z1", floor_area_sqft: 200, position_x_norm: null, position_y_norm: null },
      drawings,
    );
    expect(pin.confidence).toBe("extraction");
    expect(pin.xNorm).toBeCloseTo(0.3);
    expect(pin.yNorm).toBeCloseTo(0.45);
    expect(pin.drawingId).toBe("drawing-1");
    expect(pin.pageNumber).toBe(3);
  });

  it("falls back to page centre, flagged, when the room can't be located", () => {
    const pin = proposeRoomPin(
      { id: "r1", name: "Nook", zone_id: "z1", floor_area_sqft: 60, position_x_norm: null, position_y_norm: null },
      [drawingWith([])],
    );
    expect(pin.confidence).toBe("fallback");
    expect(pin).toMatchObject({ xNorm: 0.5, yNorm: 0.5 });
    expect(pin.reason).toContain("Nook");
  });
});

describe("proposeRoomPins", () => {
  it("skips rooms with no zone or no floor area", () => {
    const out = proposeRoomPins(
      [
        { id: "r1", name: "A", zone_id: "z1", floor_area_sqft: 100, position_x_norm: 0.1, position_y_norm: 0.1 },
        { id: "r2", name: "B", zone_id: null, floor_area_sqft: 100, position_x_norm: null, position_y_norm: null },
        { id: "r3", name: "C", zone_id: "z1", floor_area_sqft: null, position_x_norm: null, position_y_norm: null },
      ],
      [],
    );
    expect(Object.keys(out)).toEqual(["r1"]);
  });
});

describe("proposeMechanicalPins", () => {
  it("places AHU/return/condenser near the zone's room centroid, all flagged", () => {
    const rooms = [
      { id: "r1", name: "A", zone_id: "z1", floor_area_sqft: 100, position_x_norm: 0.2, position_y_norm: 0.2 },
      { id: "r2", name: "B", zone_id: "z1", floor_area_sqft: 100, position_x_norm: 0.4, position_y_norm: 0.4 },
    ];
    const pins = proposeMechanicalPins("z1", rooms, []);
    expect(pins.ahu.confidence).toBe("fallback");
    expect(pins.ahu.xNorm).toBeCloseTo(0.3);
    expect(pins.ahu.yNorm).toBeCloseTo(0.3);
    // return + condenser are offset off the AHU so they render distinctly
    expect(pins.return.xNorm).not.toBeCloseTo(pins.ahu.xNorm);
    expect(pins.condenser.yNorm).toBeGreaterThan(pins.ahu.yNorm);
  });

  it("falls back to page centre when the zone has no located rooms", () => {
    const pins = proposeMechanicalPins("z1", [], []);
    expect(pins.ahu).toMatchObject({ xNorm: 0.5, yNorm: 0.5 });
  });
});
