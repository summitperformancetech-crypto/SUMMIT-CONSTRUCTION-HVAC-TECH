// SUMMIT-REPORT-STANDARD.md Section 7 - "component breakdown (walls/
// glazing/doors/ceilings/floors/infiltration/ducts/ventilation/internal
// gains) as both a table and a donut chart... Chart segments must be
// computed from actual component percentages - never illustrative/
// placeholder values."
//
// All nine categories, each a real accumulator on RoomLoadResult/
// ZoneLoadResult/WholeHouseLoadResult (see lib/manualJ.ts's computeRoom) -
// never illustrative/placeholder segments.
import type { ZoneLoadResult, WholeHouseLoadResult } from "./manualJ";

export type ChartSegment = {
  label: string;
  valueBtuh: number;
  percent: number;
  color: string;
};

const SEGMENT_COLORS = {
  walls: "#333333", // navy-700
  glazing: "#5b8fb0", // slate blue - visually distinct from ducts' amber
  doors: "#9aa0a6", // silver
  ceilings: "#6b6b6b", // mid-grey, adjacent to walls but distinguishable
  floors: "#4a4a4a", // darker grey, adjacent to walls but distinguishable
  infiltration: "#7d6a4f", // muted bronze, between walls and ducts
  ducts: "#a9822f", // amber
  ventilation: "#d4b06a", // amber-light
  internalGains: "#c9ccd0", // silver-light
};

type LoadTotals = Pick<
  WholeHouseLoadResult | ZoneLoadResult,
  | "heatingBtuh"
  | "coolingSensibleBtuh"
  | "coolingLatentBtuh"
  | "wallsHeatingBtuh"
  | "wallsCoolingBtuh"
  | "glazingHeatingBtuh"
  | "glazingCoolingBtuh"
  | "ceilingsHeatingBtuh"
  | "ceilingsCoolingBtuh"
  | "floorsHeatingBtuh"
  | "floorsCoolingBtuh"
  | "infiltrationHeatingBtuh"
  | "infiltrationCoolingSensibleBtuh"
  | "infiltrationCoolingLatentBtuh"
  | "doorHeatingBtuh"
  | "doorCoolingBtuh"
  | "ductHeatingBtuh"
  | "ductCoolingSensibleBtuh"
  | "ductCoolingLatentBtuh"
  | "ventilationHeatingBtuh"
  | "ventilationCoolingSensibleBtuh"
  | "ventilationCoolingLatentBtuh"
  | "internalGainsSensibleBtuh"
  | "internalGainsLatentBtuh"
>;

function buildSegments(total: number, parts: { label: string; value: number; color: string }[]): ChartSegment[] {
  if (total <= 0) return [];
  return parts
    .filter((p) => p.value > 0.5) // drop negligible/zero slices rather than render a sliver
    .map((p) => ({ label: p.label, valueBtuh: p.value, percent: p.value / total, color: p.color }));
}

export function buildHeatingSegments(totals: LoadTotals): ChartSegment[] {
  return buildSegments(totals.heatingBtuh, [
    { label: "Walls", value: totals.wallsHeatingBtuh, color: SEGMENT_COLORS.walls },
    { label: "Glazing", value: totals.glazingHeatingBtuh, color: SEGMENT_COLORS.glazing },
    { label: "Doors", value: totals.doorHeatingBtuh, color: SEGMENT_COLORS.doors },
    { label: "Ceilings", value: totals.ceilingsHeatingBtuh, color: SEGMENT_COLORS.ceilings },
    { label: "Floors", value: totals.floorsHeatingBtuh, color: SEGMENT_COLORS.floors },
    { label: "Infiltration", value: totals.infiltrationHeatingBtuh, color: SEGMENT_COLORS.infiltration },
    { label: "Ducts", value: totals.ductHeatingBtuh, color: SEGMENT_COLORS.ducts },
    { label: "Ventilation", value: totals.ventilationHeatingBtuh, color: SEGMENT_COLORS.ventilation },
  ]);
}

export function buildCoolingSegments(totals: LoadTotals): ChartSegment[] {
  const total = totals.coolingSensibleBtuh + totals.coolingLatentBtuh;
  const ducts = totals.ductCoolingSensibleBtuh + totals.ductCoolingLatentBtuh;
  const ventilation = totals.ventilationCoolingSensibleBtuh + totals.ventilationCoolingLatentBtuh;
  const internalGains = totals.internalGainsSensibleBtuh + totals.internalGainsLatentBtuh;
  return buildSegments(total, [
    { label: "Walls", value: totals.wallsCoolingBtuh, color: SEGMENT_COLORS.walls },
    { label: "Glazing", value: totals.glazingCoolingBtuh, color: SEGMENT_COLORS.glazing },
    { label: "Doors", value: totals.doorCoolingBtuh, color: SEGMENT_COLORS.doors },
    { label: "Ceilings", value: totals.ceilingsCoolingBtuh, color: SEGMENT_COLORS.ceilings },
    { label: "Floors", value: totals.floorsCoolingBtuh, color: SEGMENT_COLORS.floors },
    {
      label: "Infiltration",
      value: totals.infiltrationCoolingSensibleBtuh + totals.infiltrationCoolingLatentBtuh,
      color: SEGMENT_COLORS.infiltration,
    },
    { label: "Ducts", value: ducts, color: SEGMENT_COLORS.ducts },
    { label: "Ventilation", value: ventilation, color: SEGMENT_COLORS.ventilation },
    { label: "Internal Gains", value: internalGains, color: SEGMENT_COLORS.internalGains },
  ]);
}

// Renders segments as a self-contained inline SVG donut (no charting
// library - keeps the report a single self-contained HTML file per
// Section 2). Segments computed by buildHeatingSegments/buildCoolingSegments
// above - this function only draws whatever real percentages it's given.
export function renderDonutSvg(segments: ChartSegment[], size = 160): string {
  if (segments.length === 0) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.4}" fill="none" stroke="#dcdad5" stroke-width="${size * 0.16}" /></svg>`;
  }
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.4;
  const strokeWidth = size * 0.16;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const arcs = segments
    .map((seg) => {
      const dash = seg.percent * circumference;
      const gap = circumference - dash;
      const circle = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${strokeWidth}" stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})" />`;
      offset += dash;
      return circle;
    })
    .join("\n");

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${arcs}</svg>`;
}
