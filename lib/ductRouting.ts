// Auto Manual D run length/fitting computation from tech-confirmed pin
// positions on the actual floor plan page - see the ACCA Manual D
// Appendix 3 sourcing done 2026-08-25 (persisted in this project's
// memory system, not recalled from training) for where every constant
// below comes from. Building this out was an explicit, direct user
// instruction: real duct lengths and fittings, not manual entry, driven
// by real geometry, never a guessed number standing in for one.
//
// Scope decision, stated plainly: AHU/mechanical equipment position is
// ALWAYS tech-placed from scratch on the pin canvas, never AI-suggested.
// Mechanical closets/attic accesses are rarely labeled as reliably as
// named rooms are on a floor plan, so asking the extraction model to
// guess one would produce a low-confidence pin needing heavy caveating
// anyway - simpler and more honest to just never suggest one.

import type { ExtractedRoom, DrawingRow } from "./drawingExtraction";
import type { RoomRow, ZoneRow } from "@/components/manual-j-workflow";
import type { DuctRunRow } from "@/components/duct-design-section";
import type { DuctSizingResult } from "./manualD";

// -----------------------------------------------------------------------
// ACCA Manual D, Third Edition v2.00 (2013), Appendix 3 "Fitting
// Equivalent Lengths" - real, cited values. See the project memory file
// acca_manual_d_fitting_equivalent_lengths.md for the full sourcing
// (visually verified against the actual standard, not recalled).
// -----------------------------------------------------------------------

// Table 8A, "Round and Oval Elbow EL Values" - smooth (1-piece) round
// elbow at R/D = 1.0, the standard residential fitting. Reference
// condition: 900 Fpm supply velocity, 0.08 IWC per 100 ft friction rate.
export const ROUND_ELBOW_EL_REFERENCE_FT = 15;

// Group 3, fittings 3A/3I, "Full radius takeoff" - a branch leaving a
// trunk. Same reference condition as above.
export const BRANCH_TAKEOFF_EL_REFERENCE_FT = 15;

export const EL_REFERENCE_VELOCITY_FPM = 900;
export const EL_REFERENCE_FRICTION_RATE_IWC_PER_100FT = 0.08;

// Appendix 3, Section A3-3 - the standard's own OPTIONAL refinement
// (Appendix 4 in the source document exists specifically for "other
// scenarios"; using the reference-condition EL directly, as this module
// does everywhere else, is the standard's own normal/expected usage, not
// a shortcut). Exported for any future caller that wants to refine a
// specific run's fitting length against its own actually-computed
// velocity/friction rate - not applied automatically here because doing
// so for the zone-wide target friction rate specifically would be
// circular (fitting length -> effective length -> friction rate ->
// fitting length), and real Manual D practice treats reference-condition
// EL as sufficiently accurate for typical residential systems.
export function convertEquivalentLength(
  elReferenceFt: number,
  actualVelocityFpm: number,
  actualFrictionRateIwcPer100Ft: number,
): number {
  return (
    elReferenceFt *
    Math.pow(actualVelocityFpm / EL_REFERENCE_VELOCITY_FPM, 2) *
    (EL_REFERENCE_FRICTION_RATE_IWC_PER_100FT / actualFrictionRateIwcPer100Ft)
  );
}

// -----------------------------------------------------------------------
// Per-sheet scale derivation
// -----------------------------------------------------------------------

// A room whose real page-relative dimensions (wall_page_horizontal_len_ft/
// wall_page_vertical_len_ft, from real printed dimension lines - see
// lib/drawingExtraction.ts) AND AI-estimated on-page bounding box
// (room_position.width_norm/height_norm) are BOTH known gives two
// independent implied real-feet-per-PDF-point scale estimates (one from
// each axis) - a PDF page's own point unit is physically uniform in x and
// y (an architectural sheet is drawn at one consistent scale), so both
// axes should imply the same real-world scale. Pooling every room's
// estimates and taking the median is robust to any single room's
// bounding-box read being off; a room whose own two axis estimates
// disagree sharply with each other is itself a signal that room's
// bounding box read poorly, and is excluded as an outlier rather than
// silently pulling the page-wide scale off.
export type ScaleSampleRoom = {
  wallPageHorizontalLenFt: number | null;
  wallPageVerticalLenFt: number | null;
  widthNorm: number | null;
  heightNorm: number | null;
};

// Diagnosed 2026-08-25 against real data (Schneider's construction set):
// derivePageScale's room-bounding-box median produced a page ~1.4-1.5x
// too large (125ft/83ft computed vs. the real 85ft/58'-10" printed on
// the sheet's own overall dimension strings) - a real, measurable AI
// bounding-box precision limit, not a code bug (the median/outlier logic
// itself checked out correctly by hand). Almost every architectural
// sheet prints its own scale directly in the title block (e.g. "1/4" =
// 1'-0""), which is authoritative and unaffected by that imprecision -
// prefer this whenever it's known. A PDF page's points are a real
// physical unit (72pt = 1 printed inch) for any page that represents
// its true plotted size (true of every architectural sheet this app
// handles - Chromium's own PDF viewer, which lib/floorPlanRender.ts
// renders through, does not rescale pages), so converting a stated
// architectural scale straight to feet-per-page-point is exact, not
// estimated.
export function pageScaleFromArchitecturalScale(
  numeratorInches: number,
  denominatorFeet: number,
): number {
  return denominatorFeet / (numeratorInches * 72);
}

export type PageScaleResult = {
  feetPerPagePoint: number | null;
  sampleCount: number;
  outlierCount: number;
};

// A room's own two axis-implied scales disagreeing by more than this
// fraction flags it as an unreliable bounding-box read for scale
// purposes (still fine to use for pin placement itself - only excluded
// from scale derivation).
const SCALE_OUTLIER_DISAGREEMENT_FRACTION = 0.35;

export function derivePageScale(
  rooms: ScaleSampleRoom[],
  pageWidthPt: number,
  pageHeightPt: number,
): PageScaleResult {
  const perRoomEstimates: number[] = [];
  let outlierCount = 0;

  for (const room of rooms) {
    const fromWidth =
      room.wallPageHorizontalLenFt != null && room.widthNorm != null && room.widthNorm > 0
        ? room.wallPageHorizontalLenFt / (room.widthNorm * pageWidthPt)
        : null;
    const fromHeight =
      room.wallPageVerticalLenFt != null && room.heightNorm != null && room.heightNorm > 0
        ? room.wallPageVerticalLenFt / (room.heightNorm * pageHeightPt)
        : null;

    if (fromWidth != null && fromHeight != null) {
      const disagreement = Math.abs(fromWidth - fromHeight) / Math.max(fromWidth, fromHeight);
      if (disagreement > SCALE_OUTLIER_DISAGREEMENT_FRACTION) {
        outlierCount += 1;
        continue;
      }
      perRoomEstimates.push((fromWidth + fromHeight) / 2);
    } else if (fromWidth != null) {
      perRoomEstimates.push(fromWidth);
    } else if (fromHeight != null) {
      perRoomEstimates.push(fromHeight);
    }
  }

  if (perRoomEstimates.length === 0) {
    return { feetPerPagePoint: null, sampleCount: 0, outlierCount };
  }

  const sorted = [...perRoomEstimates].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return { feetPerPagePoint: median, sampleCount: perRoomEstimates.length, outlierCount };
}

// -----------------------------------------------------------------------
// Routed run length from two resolved (tech-confirmed) pin positions
// -----------------------------------------------------------------------

export type ResolvedPin = { xNorm: number; yNorm: number };

// Manhattan (not straight-line) distance - ductwork runs along framing,
// not diagonally through it, so this matches how a run is actually
// installed far better than Euclidean distance would.
const MANHATTAN_ZERO_LEG_EPSILON = 0.002; // ~0.2% of page extent

export function computeManhattanDistanceFt(
  a: ResolvedPin,
  b: ResolvedPin,
  pageWidthFt: number,
  pageHeightFt: number,
): number {
  const dxFt = Math.abs(a.xNorm - b.xNorm) * pageWidthFt;
  const dyFt = Math.abs(a.yNorm - b.yNorm) * pageHeightFt;
  return dxFt + dyFt;
}

// A Manhattan (right-angle) path between two points implies exactly one
// 90-degree turn, unless the two points already share an axis (a
// perfectly straight run needs none).
export function countManhattanTurns(a: ResolvedPin, b: ResolvedPin): number {
  const dxNorm = Math.abs(a.xNorm - b.xNorm);
  const dyNorm = Math.abs(a.yNorm - b.yNorm);
  if (dxNorm < MANHATTAN_ZERO_LEG_EPSILON || dyNorm < MANHATTAN_ZERO_LEG_EPSILON) return 0;
  return 1;
}

export type RoutedRunResult = {
  lengthFt: number;
  fittingEquivalentLengthFt: number;
  turnCount: number;
};

// The real, tech-editable output this feature exists to produce: a
// physical length (from real pin geometry, never guessed) and a fitting
// equivalent length (branch takeoff off the trunk, plus one elbow per
// Manhattan turn - both real ACCA Appendix 3 reference-condition values,
// see the constants above). This is a starting value, not a silent
// final one - it populates duct_runs.length_ft/fitting_equivalent_length_ft
// exactly like a manually-entered run would, fully editable afterward
// through the existing Duct Design form.
export function computeRoutedBranchRun(
  ahuPin: ResolvedPin,
  roomPin: ResolvedPin,
  pageWidthFt: number,
  pageHeightFt: number,
): RoutedRunResult {
  const lengthFt = computeManhattanDistanceFt(ahuPin, roomPin, pageWidthFt, pageHeightFt);
  const turnCount = countManhattanTurns(ahuPin, roomPin);
  const fittingEquivalentLengthFt =
    BRANCH_TAKEOFF_EL_REFERENCE_FT + turnCount * ROUND_ELBOW_EL_REFERENCE_FT;
  return { lengthFt, fittingEquivalentLengthFt, turnCount };
}

// -----------------------------------------------------------------------
// Gate status - which rooms/zones still need a pin resolved before the
// auto-length feature can run. Deliberately separate from
// lib/reportGate.ts's report-generation gate: pin resolution only blocks
// the auto-routing calculation itself, never general report generation -
// a project can still do Manual D via manual run entry regardless of
// whether this feature has been used.
// -----------------------------------------------------------------------

export type DuctRoutingRoomInput = {
  id: string;
  name: string;
  zone_id: string | null;
  floor_area_sqft: number | null;
  position_x_norm: number | null;
  position_y_norm: number | null;
};

export type DuctRoutingZoneInput = {
  id: string;
  name: string;
  ahu_position_x_norm: number | null;
  ahu_position_y_norm: number | null;
};

export type DuctRoutingGateStatus = {
  ready: boolean;
  unresolvedRoomIds: string[];
  unresolvedZoneIds: string[];
};

export function getDuctRoutingGateStatus(
  rooms: DuctRoutingRoomInput[],
  zones: DuctRoutingZoneInput[],
): DuctRoutingGateStatus {
  const relevantRooms = rooms.filter((r) => r.zone_id != null && r.floor_area_sqft != null && r.floor_area_sqft > 0);
  const zoneIdsInUse = new Set(relevantRooms.map((r) => r.zone_id));
  const relevantZones = zones.filter((z) => zoneIdsInUse.has(z.id));

  const unresolvedRoomIds = relevantRooms
    .filter((r) => r.position_x_norm == null || r.position_y_norm == null)
    .map((r) => r.id);
  const unresolvedZoneIds = relevantZones
    .filter((z) => z.ahu_position_x_norm == null || z.ahu_position_y_norm == null)
    .map((z) => z.id);

  return {
    ready: unresolvedRoomIds.length === 0 && unresolvedZoneIds.length === 0 && relevantRooms.length > 0,
    unresolvedRoomIds,
    unresolvedZoneIds,
  };
}

// -----------------------------------------------------------------------
// AI-suggested position lookup helper - matches a room row to its
// extraction's room_position by name, mirroring the exact matching rule
// lib/fieldResolutions.ts's normalizeRoomNameForMatch already uses
// elsewhere in this app, so this stays consistent with how every other
// AI-suggested-vs-applied comparison in Summit works.
// -----------------------------------------------------------------------

export function findAiSuggestedPosition(
  roomName: string,
  extractedRooms: ExtractedRoom[],
): ExtractedRoom["room_position"] | null {
  const normalize = (s: string) => s.replace(/#/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const key = normalize(roomName);
  const match = extractedRooms.find((r) => normalize(r.name) === key);
  return match?.room_position ?? null;
}

// Resolves a room's AI-suggested position AND which specific drawing/page
// it belongs to (a normalized coordinate is meaningless without knowing
// which rendered page it was read against) - a room's ExtractedRoom
// carries only a sheet NAME (source_sheet), so this cross-references that
// name against the same drawing's sheets[].page_number (see
// ExtractedSheet.page_number) to get an actual page to render. Scans
// every completed drawing on the project, not just one, since a room can
// in principle be matched on any of them.
export type RoomPositionSource = {
  drawingId: string;
  pageNumber: number;
  position: NonNullable<ExtractedRoom["room_position"]>;
};

export function resolveRoomPositionSource(
  roomName: string,
  drawings: Pick<DrawingRow, "id" | "extraction_status" | "extracted_data">[],
): RoomPositionSource | null {
  const normalize = (s: string) => s.replace(/#/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const key = normalize(roomName);

  for (const drawing of drawings) {
    if (drawing.extraction_status !== "completed" || !drawing.extracted_data) continue;
    const room = drawing.extracted_data.rooms.find((r) => normalize(r.name) === key);
    if (!room?.room_position) continue;
    const { x_norm, y_norm, width_norm, height_norm } = room.room_position;
    if (x_norm == null || y_norm == null) continue;

    const sheets = drawing.extracted_data.sheets ?? [];
    const sheet = sheets.find((s) => s.name === room.source_sheet);
    const pageNumber = sheet?.page_number ?? null;
    if (pageNumber == null) continue;

    return {
      drawingId: drawing.id,
      pageNumber,
      position: { x_norm, y_norm, width_norm, height_norm, unresolved: room.room_position.unresolved, reason: room.room_position.reason },
    };
  }
  return null;
}

// -----------------------------------------------------------------------
// Live illustration data - the exact same shape/logic as
// lib/reportData.ts's buildDuctRoutingIllustrations (server-only, reads
// from Supabase), duplicated here rather than imported so this stays
// usable from a "use client" component - same cross-boundary convention
// this codebase already uses everywhere else (see e.g. duct-design-
// section.tsx's own DUCT_RUN_COLUMNS comment). Lets the live project
// workspace render the identical diagram the report PDF does, from data
// already loaded on the page - no need to generate/download a PDF just
// to see it.
// -----------------------------------------------------------------------
export type LiveDuctRoutingPin = {
  kind: "room" | "ahu";
  label: string;
  xNorm: number;
  yNorm: number;
  zoneId: string;
  zoneName: string;
  trunkDiameterIn?: number | null;
  trunkCfm?: number | null;
};
export type LiveDuctRoutingRoute = {
  roomName: string;
  fromXNorm: number;
  fromYNorm: number;
  toXNorm: number;
  toYNorm: number;
  lengthFt: number | null;
  diameterIn: number | null;
  cfm: number | null;
  zoneId: string;
  zoneName: string;
};
export type LiveDuctRoutingSheet = {
  drawingId: string;
  pageNumber: number;
  pins: LiveDuctRoutingPin[];
  routes: LiveDuctRoutingRoute[];
};

export function buildLiveDuctRoutingIllustration(
  rooms: RoomRow[],
  zones: ZoneRow[],
  ductRuns: DuctRunRow[],
  sizedByRunId: Map<string, Pick<DuctSizingResult, "diameterIn" | "cfm">>,
  requiredCfmByRoom: Map<string, number | null>,
): LiveDuctRoutingSheet[] {
  const bySheet = new Map<string, LiveDuctRoutingSheet>();

  for (const zone of zones) {
    if (
      zone.ahu_position_x_norm == null ||
      zone.ahu_position_y_norm == null ||
      !zone.ahu_position_source_drawing_id ||
      zone.ahu_position_source_page_number == null
    ) {
      continue;
    }
    const zoneRooms = rooms.filter(
      (r) =>
        r.zone_id === zone.id &&
        r.position_x_norm != null &&
        r.position_y_norm != null &&
        r.position_source_drawing_id === zone.ahu_position_source_drawing_id &&
        r.position_source_page_number === zone.ahu_position_source_page_number,
    );
    if (zoneRooms.length === 0) continue;

    const sheetKey = `${zone.ahu_position_source_drawing_id}:${zone.ahu_position_source_page_number}`;
    let sheet = bySheet.get(sheetKey);
    if (!sheet) {
      sheet = { drawingId: zone.ahu_position_source_drawing_id, pageNumber: zone.ahu_position_source_page_number, pins: [], routes: [] };
      bySheet.set(sheetKey, sheet);
      const trunkRun = ductRuns.find((r) => r.run_type === "trunk" && r.zone_id === zone.id);
      const trunkSized = trunkRun ? sizedByRunId.get(trunkRun.id) : undefined;
      const trunkCfmFallback = zoneRooms.reduce((sum, r) => sum + (requiredCfmByRoom.get(r.id) ?? 0), 0);
      // duct_runs.cfm/friction_rate/etc. default to 0 (not null) at
      // insert time, before real sizing has ever run against them - 0 is
      // a placeholder here, not a real computed zero, so it's treated
      // the same as "not yet sized" rather than trusted as a value.
      const persistedTrunkCfm = trunkRun && trunkRun.cfm > 0 ? trunkRun.cfm : null;
      sheet.pins.push({
        kind: "ahu",
        label: `${zone.name} (AHU)`,
        xNorm: zone.ahu_position_x_norm,
        yNorm: zone.ahu_position_y_norm,
        trunkDiameterIn: trunkSized?.diameterIn ?? trunkRun?.calculated_diameter_in ?? null,
        trunkCfm: trunkSized?.cfm ?? persistedTrunkCfm ?? (trunkCfmFallback > 0 ? trunkCfmFallback : null),
        zoneId: zone.id,
        zoneName: zone.name,
      });
    }

    for (const room of zoneRooms) {
      if (room.position_x_norm === zone.ahu_position_x_norm && room.position_y_norm === zone.ahu_position_y_norm) {
        continue;
      }
      sheet.pins.push({
        kind: "room",
        label: room.name,
        xNorm: room.position_x_norm!,
        yNorm: room.position_y_norm!,
        zoneId: zone.id,
        zoneName: zone.name,
      });
      const run = ductRuns.find((r) => r.run_type === "branch" && r.room_id === room.id);
      const sized = run ? sizedByRunId.get(run.id) : undefined;
      const persistedCfm = run && run.cfm > 0 ? run.cfm : null;
      sheet.routes.push({
        roomName: room.name,
        fromXNorm: zone.ahu_position_x_norm,
        fromYNorm: zone.ahu_position_y_norm,
        toXNorm: room.position_x_norm!,
        toYNorm: room.position_y_norm!,
        lengthFt: run?.length_ft ?? null,
        diameterIn: sized?.diameterIn ?? run?.calculated_diameter_in ?? null,
        cfm: sized?.cfm ?? persistedCfm ?? requiredCfmByRoom.get(room.id) ?? null,
        zoneId: zone.id,
        zoneName: zone.name,
      });
    }
  }
  return [...bySheet.values()];
}
