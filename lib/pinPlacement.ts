// AI duct-routing pin proposals - stage 9 of the residential pipeline.
//
// FIX-PIPELINE: every pin is pre-placed by the AI; the technician confirms
// ("Accept") or drags-and-overrides each one. This module produces the
// starting coordinates. It is pure and MUST NOT import lib/pdfRoomGeometry.ts
// (the paused vector-geometry experiment) - room pins come from, in order:
//
//   1. the room's already-confirmed position (rooms.position_x_norm/y_norm)
//      - nothing to propose, it's done;
//   2. the extraction's own room_position bounding box centre
//      (resolveRoomPositionSource, lib/ductRouting.ts) - a real visual read
//      of the page;
//   3. the drawing centre, flagged low-confidence - so a pin still exists
//      to confirm rather than a silent gap.
//
// AHU / return / condenser pins are never AI-read from the drawing (there
// is no marker for "where the installer will put the air handler"): they
// are placed heuristically near the centroid of the zone's rooms, offset so
// the three don't stack, and always flagged low-confidence.

import { resolveRoomPositionSource } from "./ductRouting";
import type { DrawingRow } from "./drawingExtraction";

export type PinRoomInput = {
  id: string;
  name: string;
  zone_id: string | null;
  floor_area_sqft: number | null;
  position_x_norm: number | null;
  position_y_norm: number | null;
};

export type PinDrawingInput = Pick<DrawingRow, "id" | "extraction_status" | "extracted_data" | "floor_plan_page_number">;

export type ProposedPin = {
  xNorm: number;
  yNorm: number;
  drawingId: string | null;
  pageNumber: number | null;
  // "confirmed"  - already placed by a human, nothing to do
  // "extraction" - a real visual read of the page, needs one-click Accept
  // "fallback"   - a guess (drawing centre / zone centroid), needs a look
  confidence: "confirmed" | "extraction" | "fallback";
  reason: string | null;
};

function floorPlanPage(drawings: PinDrawingInput[]): { drawingId: string; pageNumber: number } | null {
  const fp = drawings.find((d) => d.floor_plan_page_number != null && d.extraction_status === "completed");
  if (!fp || fp.floor_plan_page_number == null) return null;
  return { drawingId: fp.id, pageNumber: fp.floor_plan_page_number };
}

export function proposeRoomPin(room: PinRoomInput, drawings: PinDrawingInput[]): ProposedPin {
  if (room.position_x_norm != null && room.position_y_norm != null) {
    return {
      xNorm: room.position_x_norm,
      yNorm: room.position_y_norm,
      drawingId: null,
      pageNumber: null,
      confidence: "confirmed",
      reason: null,
    };
  }

  const source = resolveRoomPositionSource(room.name, drawings);
  if (source && source.position.x_norm != null && source.position.y_norm != null) {
    const cx = source.position.x_norm + (source.position.width_norm ?? 0) / 2;
    const cy = source.position.y_norm + (source.position.height_norm ?? 0) / 2;
    return {
      xNorm: clamp01(cx),
      yNorm: clamp01(cy),
      drawingId: source.drawingId,
      pageNumber: source.pageNumber,
      confidence: "extraction",
      reason: source.position.reason,
    };
  }

  const fp = floorPlanPage(drawings);
  return {
    xNorm: 0.5,
    yNorm: 0.5,
    drawingId: fp?.drawingId ?? null,
    pageNumber: fp?.pageNumber ?? null,
    confidence: "fallback",
    reason: `No page position could be read for "${room.name}" - placed at page centre, drag to the real location.`,
  };
}

export function proposeRoomPins(
  rooms: PinRoomInput[],
  drawings: PinDrawingInput[],
): Record<string, ProposedPin> {
  const out: Record<string, ProposedPin> = {};
  for (const r of rooms) {
    if (r.zone_id == null || (r.floor_area_sqft ?? 0) <= 0) continue;
    out[r.id] = proposeRoomPin(r, drawings);
  }
  return out;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Centroid of a zone's already-known room pins (confirmed or extraction),
// falling back to the page centre. The three mechanical pins are offset off
// that centroid so they render distinctly.
function zoneCentroid(
  zoneId: string,
  rooms: PinRoomInput[],
  proposedRoomPins: Record<string, ProposedPin>,
): { x: number; y: number } {
  const pts: Array<{ x: number; y: number }> = [];
  for (const r of rooms) {
    if (r.zone_id !== zoneId) continue;
    const pin = proposedRoomPins[r.id];
    if (pin && pin.confidence !== "fallback") pts.push({ x: pin.xNorm, y: pin.yNorm });
  }
  if (pts.length === 0) return { x: 0.5, y: 0.5 };
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

export function proposeMechanicalPins(
  zoneId: string,
  rooms: PinRoomInput[],
  drawings: PinDrawingInput[],
  proposedRoomPins: Record<string, ProposedPin> = proposeRoomPins(rooms, drawings),
): { ahu: ProposedPin; return: ProposedPin; condenser: ProposedPin } {
  const c = zoneCentroid(zoneId, rooms, proposedRoomPins);
  const fp = floorPlanPage(drawings);
  const base = {
    drawingId: fp?.drawingId ?? null,
    pageNumber: fp?.pageNumber ?? null,
    confidence: "fallback" as const,
  };
  return {
    ahu: { ...base, xNorm: clamp01(c.x), yNorm: clamp01(c.y), reason: "Heuristic: centre of this zone's rooms. Confirm or drag to the real air-handler location." },
    return: { ...base, xNorm: clamp01(c.x - 0.04), yNorm: clamp01(c.y + 0.04), reason: "Heuristic: near the air handler. Confirm or drag to the real return-air location." },
    condenser: { ...base, xNorm: clamp01(c.x + 0.06), yNorm: clamp01(Math.min(0.95, c.y + 0.12)), reason: "Heuristic: offset toward an exterior wall. Confirm or drag to the real condenser location." },
  };
}
