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
import {
  matchRoomBoxByPosition,
  fallbackRoomBox,
  routeZoneDucts,
  classifyPathSegments,
  type NormPoint,
  type NormBox,
  type SegmentClass,
} from "./ductPathGeometry";
import { computeSegmentsFromCorridorGraph, type CorridorGraph } from "./ductCorridorGraph";

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

// Parses a real printed architectural scale notation (e.g. `1/4" = 1'-0"`,
// `3/16"=1'-0"`, `1" = 1'-0"`) into the numerator/denominator
// pageScaleFromArchitecturalScale needs. Diagnosed 2026-08-26 against the
// real Schneider set: both A3.0 and A3.1's own title blocks print
// `1/4" = 1'-0""` directly (visually confirmed against the rendered
// page, not assumed) - this is a real fact printed on the drawing, exact
// by construction, not an AI-estimated one. Handles the plain-inch
// numerator form (`1" = 1'-0"`) and the fraction form (`1/4" = 1'-0"`);
// the RHS foot value can carry inches too (`1'-6"`) though every real
// architectural scale in practice is a whole number of feet.
export function parseArchitecturalScaleText(
  text: string,
): { numeratorInches: number; denominatorFeet: number } | null {
  const normalized = text.replace(/[′’']/g, "'").replace(/[″”]/g, '"');
  const match = normalized.match(
    /(\d+)(?:\s*\/\s*(\d+))?\s*"?\s*=\s*(\d+)\s*'-?\s*(\d+)?\s*"?/,
  );
  if (!match) return null;
  const numeratorWhole = Number(match[1]);
  const numeratorDenominator = match[2] ? Number(match[2]) : 1;
  if (numeratorDenominator === 0) return null;
  const numeratorInches = numeratorWhole / numeratorDenominator;
  const feet = Number(match[3]);
  const extraInches = match[4] ? Number(match[4]) : 0;
  const denominatorFeet = feet + extraInches / 12;
  if (numeratorInches <= 0 || denominatorFeet <= 0) return null;
  return { numeratorInches, denominatorFeet };
}

export type PageScaleResult = {
  feetPerPagePoint: number | null;
  sampleCount: number;
  outlierCount: number;
};

// Real entrypoint both routing call sites use: prefers the sheet's own
// printed scale notation (exact, see pageScaleFromArchitecturalScale's
// comment) whenever it's known, falling back to the AI-room-bounding-box
// median (derivePageScale) only when it isn't - most projects, until
// more extractions capture ExtractedSheet.printed_scale_text.
export function resolveSheetScale(
  printedScaleText: string | null | undefined,
  rooms: ScaleSampleRoom[],
  pageWidthPt: number,
  pageHeightPt: number,
): PageScaleResult & { source: "printed_scale" | "room_bounding_box_median" | "none" } {
  if (printedScaleText) {
    const parsed = parseArchitecturalScaleText(printedScaleText);
    if (parsed) {
      return {
        feetPerPagePoint: pageScaleFromArchitecturalScale(parsed.numeratorInches, parsed.denominatorFeet),
        sampleCount: 0,
        outlierCount: 0,
        source: "printed_scale",
      };
    }
  }
  const fallback = derivePageScale(rooms, pageWidthPt, pageHeightPt);
  return { ...fallback, source: fallback.feetPerPagePoint == null ? "none" : "room_bounding_box_median" };
}

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
  // Return-air plenum position - a real, independently-placed pin,
  // required alongside the AHU pin per direct instruction ("Make it a
  // required, resolvable pin per zone, same workflow as the AHU pin"),
  // never assumed to be co-located with it.
  return_position_x_norm: number | null;
  return_position_y_norm: number | null;
};

export type DuctRoutingGateStatus = {
  ready: boolean;
  unresolvedRoomIds: string[];
  unresolvedZoneIds: string[];
  unresolvedReturnZoneIds: string[];
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
  const unresolvedReturnZoneIds = relevantZones
    .filter((z) => z.return_position_x_norm == null || z.return_position_y_norm == null)
    .map((z) => z.id);

  return {
    ready:
      unresolvedRoomIds.length === 0 &&
      unresolvedZoneIds.length === 0 &&
      unresolvedReturnZoneIds.length === 0 &&
      relevantRooms.length > 0,
    unresolvedRoomIds,
    unresolvedZoneIds,
    unresolvedReturnZoneIds,
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
  kind: "room" | "ahu" | "return";
  label: string;
  xNorm: number;
  yNorm: number;
  zoneId: string;
  zoneName: string;
  trunkDiameterIn?: number | null;
  trunkCfm?: number | null;
  // Real per-diffuser pattern type tag (e.g. "4W", "SW") from a
  // duct_diffusers row, when a technician has entered one - see
  // getDiffuserSymbolSpec below. Undefined (not "1W") when no diffuser
  // record exists for this pin, so callers fall back to the same
  // one-way default they always used, rather than this field silently
  // asserting a pattern nobody actually specified.
  patternTagCode?: string;
};
export type LiveDuctRoutingRoute = {
  roomId: string;
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
  patternTagCode?: string;
};
export type LiveDuctRoutingSheet = {
  drawingId: string;
  pageNumber: number;
  pins: LiveDuctRoutingPin[];
  routes: LiveDuctRoutingRoute[];
  terminations: LiveDuctRoutingTermination[];
};
export type LiveDuctRoutingTermination = {
  terminationType: DuctTerminationRow["termination_type"];
  tag: string;
  xNorm: number;
  yNorm: number;
};

// -----------------------------------------------------------------------
// Per-sheet crop viewBox (fixes the "sheet 2 looks out of scale" bug)
// -----------------------------------------------------------------------

// Diagnosed 2026-08-26 against real Schneider data: the diagram's
// register/AHU/label symbols are fixed-size schematic marks (deliberately
// not true-to-scale, matching REFERENCE-DOCS/IMG_3916.JPG's own
// convention), drawn in the SAME "0-100 viewBox units = whole page"
// coordinate space every sheet shares. That's correct on a sheet where
// the floor plan fills most of the page (A3.0 - 2,350 SF on a 36x24in
// sheet), but Schneider's A3.1 (2nd floor, only 688 SF) draws its real
// floor plan into a small corner of the same full sheet, with a large
// blank door/window-schedule table above it - the underlying feet-per-
// pixel scale is identical on both sheets (verified: same printed
// "1/4"=1'-0"" title-block text, same physical page size), so the exact
// same fixed-size symbols end up looking dramatically oversized relative
// to the smaller drawing. The fix: crop/zoom each sheet's viewBox to a
// SQUARE region around that sheet's own real pin extents (with margin),
// then shrink every fixed-size symbol/label constant by the resulting
// zoomFactor so they render at their original absolute size - the floor
// plan gets bigger within the frame, symbols don't, so the ratio between
// them matches every other sheet again. Square (not a rect matching the
// content's own aspect) so the crop's px-per-x-unit vs. px-per-y-unit
// ratio is unchanged from the full 100x100 viewBox's own ratio - the
// container's existing aspect ratio (driven by the image's natural
// pixel size) keeps working without any new distortion.
export type SheetCropViewBox = { minX: number; minY: number; size: number; zoomFactor: number };

const SHEET_CROP_MARGIN_VIEWBOX_UNITS = 6;
// Never zoom in tighter than this - a sheet with only 1-2 pins clustered
// together (e.g. a single-room zone) shouldn't produce an absurd close-up
// with no surrounding context.
const SHEET_CROP_MIN_SIZE_VIEWBOX_UNITS = 35;

export function computeSheetCropViewBox(points: { xNorm: number; yNorm: number }[]): SheetCropViewBox {
  if (points.length === 0) return { minX: 0, minY: 0, size: 100, zoomFactor: 1 };
  const xs = points.map((p) => p.xNorm * 100);
  const ys = points.map((p) => p.yNorm * 100);
  const minXRaw = Math.min(...xs) - SHEET_CROP_MARGIN_VIEWBOX_UNITS;
  const maxXRaw = Math.max(...xs) + SHEET_CROP_MARGIN_VIEWBOX_UNITS;
  const minYRaw = Math.min(...ys) - SHEET_CROP_MARGIN_VIEWBOX_UNITS;
  const maxYRaw = Math.max(...ys) + SHEET_CROP_MARGIN_VIEWBOX_UNITS;
  const size = Math.min(100, Math.max(SHEET_CROP_MIN_SIZE_VIEWBOX_UNITS, maxXRaw - minXRaw, maxYRaw - minYRaw));
  const centerX = (minXRaw + maxXRaw) / 2;
  const centerY = (minYRaw + maxYRaw) / 2;
  const minX = Math.min(Math.max(centerX - size / 2, 0), 100 - size);
  const minY = Math.min(Math.max(centerY - size / 2, 0), 100 - size);
  return { minX, minY, size, zoomFactor: 100 / size };
}

export function buildLiveDuctRoutingIllustration(
  rooms: RoomRow[],
  zones: ZoneRow[],
  ductRuns: DuctRunRow[],
  sizedByRunId: Map<string, Pick<DuctSizingResult, "diameterIn" | "cfm">>,
  requiredCfmByRoom: Map<string, number | null>,
  ductDiffusers: DuctDiffuserRow[] = [],
  ductTerminations: DuctTerminationRow[] = [],
): LiveDuctRoutingSheet[] {
  const bySheet = new Map<string, LiveDuctRoutingSheet>();
  const diffusersByRoom = new Map<string, DuctDiffuserRow[]>();
  for (const d of ductDiffusers) {
    if (!d.room_id) continue;
    const list = diffusersByRoom.get(d.room_id) ?? [];
    list.push(d);
    diffusersByRoom.set(d.room_id, list);
  }

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
      sheet = {
        drawingId: zone.ahu_position_source_drawing_id,
        pageNumber: zone.ahu_position_source_page_number,
        pins: [],
        routes: [],
        terminations: ductTerminations
          .filter(
            (t) =>
              t.position_x_norm != null &&
              t.position_y_norm != null &&
              t.position_source_drawing_id === zone.ahu_position_source_drawing_id &&
              t.position_source_page_number === zone.ahu_position_source_page_number,
          )
          .map((t) => ({
            terminationType: t.termination_type,
            tag: DUCT_TERMINATION_TYPE_TAGS[t.termination_type],
            xNorm: t.position_x_norm!,
            yNorm: t.position_y_norm!,
          })),
      };
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
      // Return-air plenum - a real, independently-placed pin (see the
      // migration's own comment), only drawn when it's actually resolved
      // on this same sheet as the AHU. Never assumed co-located.
      if (
        zone.return_position_x_norm != null &&
        zone.return_position_y_norm != null &&
        zone.return_position_source_drawing_id === zone.ahu_position_source_drawing_id &&
        zone.return_position_source_page_number === zone.ahu_position_source_page_number
      ) {
        sheet.pins.push({
          kind: "return",
          label: `${zone.name} (Return)`,
          xNorm: zone.return_position_x_norm,
          yNorm: zone.return_position_y_norm,
          zoneId: zone.id,
          zoneName: zone.name,
        });
      }
    }

    for (const room of zoneRooms) {
      if (room.position_x_norm === zone.ahu_position_x_norm && room.position_y_norm === zone.ahu_position_y_norm) {
        continue;
      }
      if (room.position_x_norm === zone.return_position_x_norm && room.position_y_norm === zone.return_position_y_norm) {
        continue;
      }
      const roomDiffusers = diffusersByRoom.get(room.id) ?? [];
      const supplyDiffusers = roomDiffusers.filter((d) => d.airflow_direction === "supply");
      const extraDiffusers = roomDiffusers.filter((d) => d !== supplyDiffusers[0]);
      const primarySupply = supplyDiffusers[0];
      const primaryTagCode = primarySupply ? DIFFUSER_PATTERN_TAG_CODES[primarySupply.pattern_type] : undefined;
      const drawDefaultSupplyPin = roomDiffusers.length === 0 || primarySupply != null;

      if (drawDefaultSupplyPin) {
        sheet.pins.push({
          kind: "room",
          label: room.name,
          xNorm: room.position_x_norm!,
          yNorm: room.position_y_norm!,
          zoneId: zone.id,
          zoneName: zone.name,
          patternTagCode: primaryTagCode,
        });
        const run = ductRuns.find((r) => r.run_type === "branch" && r.room_id === room.id);
        const sized = run ? sizedByRunId.get(run.id) : undefined;
        const persistedCfm = run && run.cfm > 0 ? run.cfm : null;
        sheet.routes.push({
          roomId: room.id,
          roomName: room.name,
          fromXNorm: zone.ahu_position_x_norm,
          fromYNorm: zone.ahu_position_y_norm,
          toXNorm: room.position_x_norm!,
          toYNorm: room.position_y_norm!,
          lengthFt: run?.length_ft ?? null,
          diameterIn: primarySupply?.round_diameter_in ?? sized?.diameterIn ?? run?.calculated_diameter_in ?? null,
          cfm: primarySupply?.cfm ?? sized?.cfm ?? persistedCfm ?? requiredCfmByRoom.get(room.id) ?? null,
          zoneId: zone.id,
          zoneName: zone.name,
          patternTagCode: primaryTagCode,
        });
      }

      for (const extra of extraDiffusers) {
        const tagCode = DIFFUSER_PATTERN_TAG_CODES[extra.pattern_type];
        const xNorm = extra.position_x_norm ?? room.position_x_norm!;
        const yNorm = extra.position_y_norm ?? room.position_y_norm!;
        sheet.pins.push({
          kind: extra.airflow_direction === "return" ? "return" : "room",
          label: `${room.name} (${extra.pattern_type === "return_grille" ? "additional return" : "additional supply"})`,
          xNorm,
          yNorm,
          zoneId: zone.id,
          zoneName: zone.name,
          patternTagCode: tagCode,
        });
        if (extra.airflow_direction === "supply") {
          sheet.routes.push({
            roomId: room.id,
            roomName: room.name,
            fromXNorm: zone.ahu_position_x_norm,
            fromYNorm: zone.ahu_position_y_norm,
            toXNorm: xNorm,
            toYNorm: yNorm,
            lengthFt: null,
            diameterIn: extra.round_diameter_in,
            cfm: extra.cfm,
            zoneId: zone.id,
            zoneName: zone.name,
            patternTagCode: tagCode,
          });
        }
      }
    }
  }
  return [...bySheet.values()];
}

// -----------------------------------------------------------------------
// Label layout with real collision avoidance - shared by both the live
// in-app diagram (components/duct-routing-diagram.tsx) and the PDF report
// (lib/reportHtmlV2.ts's renderDuctRoutingPage), so a fix here fixes both
// at once instead of drifting out of sync the way the two inline
// label-positioning implementations previously did.
//
// Root cause of the "impossible to read" complaint (diagnosed 2026-08-25
// against a real rendered screenshot of Schneider's own diagram, not
// guessed): every run's size/CFM label was placed at a fixed 40%/65%
// point along its own line, with NO check against any other label. Rooms
// clustered close together on the real floor plan (a real, unavoidable
// fact of the drawing - e.g. Kitchen/Bathroom 2/Hallway/Mud Room/Stairs
// around one AHU) produced several routes whose 40%/65% points landed
// within a couple of viewBox units of each other, printing multiple
// numbers directly on top of each other. Widening the diagram's on-page
// container (the prior fix) does nothing for this - the labels overlap
// in the diagram's own coordinate space, at any render width.
//
// Fix: (1) move each run's label to sit at its own register (the room
// end), directly answering the original "mark the CFM information at the
// register" instruction and naturally spreading labels out spatially
// since registers themselves are spread across the floor plan; (2) run a
// real, bounded greedy vertical decluttering pass across every label on
// a sheet (room names, run values, and the AHU trunk label together) so
// any pair that still overlaps after (1) gets pushed apart instead of
// silently drawn on top of each other.
// -----------------------------------------------------------------------

export type DuctRoutingLayoutPin = {
  // "return" pins fall through layoutDuctRoutingLabels' else-branch
  // harmlessly (it only ever produces a label from trunkDiameterIn/
  // trunkCfm, which a return pin never sets) - the return-plenum's own
  // small identifying tag is baked directly into its symbol in each
  // renderer instead, same as the AHU's "AHU" text, not routed through
  // the collision system.
  kind: "room" | "ahu" | "return";
  label: string;
  xNorm: number;
  yNorm: number;
  trunkDiameterIn?: number | null;
  trunkCfm?: number | null;
  patternTagCode?: string;
};
export type DuctRoutingLayoutRoute = {
  toXNorm: number;
  toYNorm: number;
  diameterIn: number | null;
  cfm: number | null;
  patternTagCode?: string;
};
export type DuctRoutingLayoutSheet = {
  pins: DuctRoutingLayoutPin[];
  routes: DuctRoutingLayoutRoute[];
};

export type DuctRoutingLabel = {
  kind: "room" | "run" | "trunk";
  x: number;
  y: number;
  text: string;
  textAnchor: "start" | "middle";
  // The label's natural (pre-decluttering) anchor point - equal to x/y
  // unless the greedy pass had to push it to clear a collision. Callers
  // draw a short leader line from anchorX/anchorY to x/y whenever they
  // differ meaningfully, per the real drafting convention the reference
  // sheets use for dense clusters of diffuser callouts.
  anchorX: number;
  anchorY: number;
  // Set only for kind "run" - the real Wrightsoft/industry-standard
  // register callout (see REFERENCE-DOCS/IMG_3916.JPG's "STANDARD AIR
  // DISTRIBUTION" key) is a circled type code beside a two-row stacked
  // SIZE-over-CFM block with a divider, not one inline "size / cfm"
  // string. `text` carries the size line, `secondaryText` the CFM line,
  // `typeCode` the circled prefix - renderers draw all three as one
  // callout group. Pulled from the route's own real duct_diffusers
  // pattern type when a technician has entered one (see
  // getDiffuserSymbolSpec below); falls back to DEFAULT_REGISTER_TYPE_CODE
  // ("1W") only when no diffuser record exists for that room yet - the
  // same honest default this app always used before diffuser pattern
  // types were tracked, never a fabricated multi-way claim.
  secondaryText?: string;
  typeCode?: string;
};

// Fallback only - used when a room has no real duct_diffusers row yet
// (pre-existing projects, or a room not yet walked in the diffuser
// entry UI). One-way is the least presumptive default: it's a subset of
// what a 2/3/4-way symbol implies, never overstates throw coverage.
const DEFAULT_REGISTER_TYPE_CODE = "1W";

// -----------------------------------------------------------------------
// Diffuser symbol geometry, by real ACCA Manual D / industry-standard tag
// code (see the duct_diffuser_pattern_types migration for sourcing).
// Renderers (lib/reportHtmlV2.ts, components/duct-routing-diagram.tsx)
// use this shared spec so both draw the identical symbol for a given
// pattern type instead of two independently-hand-tuned versions
// drifting apart - same principle as buildDuctNetworkPrimitives/
// layoutDuctRoutingLabels above.
// -----------------------------------------------------------------------
export type DiffuserSymbolSpec = {
  // "square" = standard ceiling diffuser body (1/2/3/4-way, return);
  // "wide_rect" = sidewall register (wider than tall, wall-mounted);
  // "bar" = linear slot diffuser (long, narrow).
  bodyShape: "square" | "wide_rect" | "bar";
  // Throw-direction tick marks, in degrees measured from the body's
  // right edge going counterclockwise (0 = right/east, 90 = up/north,
  // etc.) - one tick per direction the diffuser actually throws air,
  // matching the real 1/2/3/4-way classification (a 3-way diffuser has
  // ticks on 3 of its 4 sides, the missing one facing the wall/
  // obstruction it's mounted against).
  tickAngles: number[];
};

const DIFFUSER_SYMBOL_SPECS: Record<string, DiffuserSymbolSpec> = {
  "1W": { bodyShape: "square", tickAngles: [0] },
  "2W": { bodyShape: "square", tickAngles: [0, 180] },
  "3W": { bodyShape: "square", tickAngles: [0, 90, 270] },
  "4W": { bodyShape: "square", tickAngles: [0, 90, 180, 270] },
  SW: { bodyShape: "wide_rect", tickAngles: [0] },
  LS: { bodyShape: "bar", tickAngles: [] },
};

export function getDiffuserSymbolSpec(tagCode: string | undefined): DiffuserSymbolSpec {
  return DIFFUSER_SYMBOL_SPECS[tagCode ?? DEFAULT_REGISTER_TYPE_CODE] ?? DIFFUSER_SYMBOL_SPECS[DEFAULT_REGISTER_TYPE_CODE];
}

// Mirrors duct_diffuser_pattern_types' seeded rows (see the
// 20260826010000 migration) - same "two places kept in sync by hand"
// pattern already used for rooms_duct_location_check /
// lib/constants/ductLocations.ts's DUCT_LOCATION_VALUES. Kept as a plain
// map instead of a live query so report generation doesn't pay an extra
// roundtrip for a fixed, rarely-changing 7-row reference set - changing
// the pattern-type set means updating both places.
export const DIFFUSER_PATTERN_TAG_CODES: Record<string, string> = {
  one_way: "1W",
  two_way: "2W",
  three_way: "3W",
  four_way: "4W",
  sidewall: "SW",
  linear_slot: "LS",
  return_grille: "RA",
};

// UI dropdown options mirroring the same seeded rows - see the "two
// places kept in sync by hand" note on DIFFUSER_PATTERN_TAG_CODES above.
export const DIFFUSER_PATTERN_OPTIONS: {
  code: string;
  tagCode: string;
  label: string;
  airflowDirection: "supply" | "return";
}[] = [
  { code: "one_way", tagCode: "1W", label: "One-way throw", airflowDirection: "supply" },
  { code: "two_way", tagCode: "2W", label: "Two-way throw", airflowDirection: "supply" },
  { code: "three_way", tagCode: "3W", label: "Three-way throw", airflowDirection: "supply" },
  { code: "four_way", tagCode: "4W", label: "Four-way throw", airflowDirection: "supply" },
  { code: "sidewall", tagCode: "SW", label: "Sidewall register", airflowDirection: "supply" },
  { code: "linear_slot", tagCode: "LS", label: "Linear slot", airflowDirection: "supply" },
  { code: "return_grille", tagCode: "RA", label: "Return air grille", airflowDirection: "return" },
];

// One row per physical diffuser/grille (duct_diffusers table) - a real,
// project-entered record, distinct from and finer-grained than
// duct_runs (which sizes the duct feeding a room, not the register
// itself). Multiple rows can share a room_id (e.g. two supply registers
// in a great room), or a zone_id with no room_id at all (a hallway
// central return not tied to one named room).
export type DuctDiffuserRow = {
  id: string;
  project_id: string;
  zone_id: string;
  room_id: string | null;
  airflow_direction: "supply" | "return";
  pattern_type: string;
  duct_size: string | null;
  round_diameter_in: number | null;
  cfm: number;
  mounting_height_aff_in: number | null;
  manufacturer: string | null;
  model: string | null;
  description: string | null;
  position_x_norm: number | null;
  position_y_norm: number | null;
  position_source_drawing_id: string | null;
  position_source_page_number: number | null;
  source: "ai_extracted" | "manual";
};

// -----------------------------------------------------------------------
// Return-air CFM balance (Permit-Submittable Manual D Package, Section 4)
// - real supply-vs-return airflow comparison per zone, computed only from
// actual entered duct_diffusers rows. Genuinely NOT determinable (not
// "balanced: false") when a zone has no real return diffuser data yet -
// this app has no independent per-zone return-CFM source otherwise (a
// zone's single return pin carries a position, not an airflow value), so
// fabricating a pass/fail here would be a fabricated number, not a
// derived one.
// -----------------------------------------------------------------------
export type ReturnAirBalanceResult = {
  zoneId: string;
  zoneName: string;
  supplyCfm: number | null;
  returnCfm: number | null;
  percentDifference: number | null;
  // Within RETURN_BALANCE_TOLERANCE_PERCENT of each other. null when not
  // determinable.
  balanced: boolean | null;
  determinable: boolean;
};

// No single ACCA Manual D clause states one universal numeric return-
// balance tolerance - this is a commonly used HVAC testing-and-balancing
// rule of thumb (within ~10% of design airflow), applied here as a
// disclosed, stated assumption, not quoted as literal Manual D text.
export const RETURN_BALANCE_TOLERANCE_PERCENT = 10;

export function checkReturnAirBalance(
  zoneId: string,
  zoneName: string,
  diffusers: DuctDiffuserRow[],
): ReturnAirBalanceResult {
  const zoneDiffusers = diffusers.filter((d) => d.zone_id === zoneId);
  const supplyRows = zoneDiffusers.filter((d) => d.airflow_direction === "supply");
  const returnRows = zoneDiffusers.filter((d) => d.airflow_direction === "return");

  if (supplyRows.length === 0 || returnRows.length === 0) {
    const supplyCfm = supplyRows.length > 0 ? supplyRows.reduce((s, d) => s + d.cfm, 0) : null;
    return { zoneId, zoneName, supplyCfm, returnCfm: null, percentDifference: null, balanced: null, determinable: false };
  }

  const supplyCfm = supplyRows.reduce((s, d) => s + d.cfm, 0);
  const returnCfm = returnRows.reduce((s, d) => s + d.cfm, 0);
  const percentDifference = supplyCfm > 0 ? (Math.abs(supplyCfm - returnCfm) / supplyCfm) * 100 : null;

  return {
    zoneId,
    zoneName,
    supplyCfm,
    returnCfm,
    percentDifference,
    balanced: percentDifference != null ? percentDifference <= RETURN_BALANCE_TOLERANCE_PERCENT : null,
    determinable: percentDifference != null,
  };
}

// One row per AHU/zone (ahu_installation_detail table) - real physical
// install detail beyond duct sizing: plenum, takeoffs, fresh air/ODA,
// refrigerant lines, condensate routing, return platform, dampers. Every
// field nullable - a tech enters what's actually known; nothing here is
// ever inferred or defaulted, per this app's standing null-means-unknown
// convention (see the 20260826010000 migration's own comments for the
// real, cited code minimums a UI should surface as help text next to
// condensate_routing_note/damper_types, never as a fabricated pass/fail).
// -----------------------------------------------------------------------
// Duct-routing basis (attic/truss vs. crawlspace vs. basement vs.
// exposed-ceiling routing space) - derived from data this app already
// captures per project, never a new question asked of the technician.
// Every room's real duct_location (already read off the drawing/entered
// by a tech - see lib/constants/ductLocations.ts) is the direct, sourced
// signal for where that room's own duct actually runs; the project-level
// foundation_type/attic_construction_type are the fallback only when no
// room has duct_location set yet. This does not yet change the computed
// routing geometry itself (lib/ductPathGeometry.ts's box-avoidance is
// foundation-agnostic) - it's a real, sourced disclosure surfaced next to
// the diagram, not a construction-type-aware router rewrite.
// -----------------------------------------------------------------------
export type DuctRoutingModeBasis = "attic" | "crawlspace" | "basement" | "exposed_ceiling" | "mixed" | "unknown";

const ATTIC_LOCATIONS = new Set(["Attic-Unconditioned", "Attic-Conditioned"]);
const CRAWLSPACE_LOCATIONS = new Set(["Crawlspace"]);
const BASEMENT_LOCATIONS = new Set(["Basement-Conditioned", "Basement-Unconditioned"]);

export function deriveDuctRoutingModeBasis(
  roomDuctLocations: Array<string | null | undefined>,
  foundationType: string | null | undefined,
  atticConstructionType: string | null | undefined,
): { basis: DuctRoutingModeBasis; source: "room_duct_location" | "project_fallback" | "unknown" } {
  const counts = new Map<DuctRoutingModeBasis, number>();
  for (const loc of roomDuctLocations) {
    if (!loc) continue;
    if (ATTIC_LOCATIONS.has(loc)) counts.set("attic", (counts.get("attic") ?? 0) + 1);
    else if (CRAWLSPACE_LOCATIONS.has(loc)) counts.set("crawlspace", (counts.get("crawlspace") ?? 0) + 1);
    else if (BASEMENT_LOCATIONS.has(loc)) counts.set("basement", (counts.get("basement") ?? 0) + 1);
  }
  if (counts.size > 0) {
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [topBasis, topCount] = sorted[0];
    // A real, genuine mix (e.g. a slab main floor with an attic-routed
    // second floor) is reported as "mixed" rather than silently picking
    // the majority and hiding the rest - both are real facts about the
    // building, not noise to average away.
    const basis = sorted.length > 1 && sorted[1][1] > 0 && sorted[1][1] >= topCount * 0.34 ? "mixed" : topBasis;
    return { basis, source: "room_duct_location" };
  }

  const foundation = foundationType?.toLowerCase() ?? "";
  if (foundation.includes("crawlspace")) return { basis: "crawlspace", source: "project_fallback" };
  if (foundation.includes("basement")) return { basis: "basement", source: "project_fallback" };
  if (foundation.includes("slab")) {
    // A slab foundation has no under-floor routing space - ducts run
    // either through the attic (if one exists) or an exposed/dropped
    // ceiling grid (common in commercial and some single-story
    // residential construction) - atticConstructionType is the real,
    // already-captured signal for which.
    return atticConstructionType ? { basis: "attic", source: "project_fallback" } : { basis: "exposed_ceiling", source: "project_fallback" };
  }
  return { basis: "unknown", source: "unknown" };
}

export const DUCT_ROUTING_MODE_BASIS_LABELS: Record<DuctRoutingModeBasis, string> = {
  attic: "Attic / truss space",
  crawlspace: "Crawlspace / sub-floor",
  basement: "Basement",
  exposed_ceiling: "Exposed / dropped ceiling grid",
  mixed: "Mixed (varies by room/level)",
  unknown: "Not yet determinable from entered data",
};

// One row per non-diffuser airflow termination (duct_terminations table) -
// exhaust fan, dryer vent, ODA intake, condensate discharge. Real,
// technician-entered; position is optional (a termination can be logged
// without a plotted point, e.g. before the sheet has been walked) - it
// only appears on the plan once position_x_norm/y_norm and the matching
// drawing/page are set, same "only render what's actually resolved"
// convention as every other pin type.
export type DuctTerminationRow = {
  id: string;
  project_id: string;
  zone_id: string | null;
  termination_type: "exhaust_fan" | "dryer_vent" | "oda_intake" | "condensate_discharge";
  duct_size: string | null;
  hood_manufacturer: string | null;
  hood_model: string | null;
  screen_or_backdraft_spec: string | null;
  position_x_norm: number | null;
  position_y_norm: number | null;
  position_source_drawing_id: string | null;
  position_source_page_number: number | null;
};

export const DUCT_TERMINATION_TYPE_LABELS: Record<DuctTerminationRow["termination_type"], string> = {
  exhaust_fan: "Exhaust Fan",
  dryer_vent: "Dryer Vent",
  oda_intake: "Outdoor Air Intake",
  condensate_discharge: "Condensate Discharge",
};

// Short tag drawn inside each termination's plan symbol.
export const DUCT_TERMINATION_TYPE_TAGS: Record<DuctTerminationRow["termination_type"], string> = {
  exhaust_fan: "EF",
  dryer_vent: "DV",
  oda_intake: "OA",
  condensate_discharge: "CD",
};

export type AhuInstallationDetailRow = {
  id: string;
  project_id: string;
  zone_id: string;
  plenum_size: string | null;
  supply_takeoff_sizes: string[] | null;
  fresh_air_duct_size: string | null;
  oda_termination_id: string | null;
  refrigerant_vapor_line_in: number | null;
  refrigerant_liquid_line_in: number | null;
  condensate_routing_note: string | null;
  return_platform_construction: string | null;
  return_platform_insulation_r: number | null;
  filter_backed_return_specs: string[] | null;
  damper_types: string[] | null;
};

export function formatDuctSizeCfm(diameterIn: number | null | undefined, cfm: number | null | undefined): string {
  const sizeText = diameterIn ? `${diameterIn}"⌀` : null;
  const cfmText = cfm != null ? `${Math.round(cfm)} cfm` : null;
  return [sizeText, cfmText].filter(Boolean).join(" / ");
}

// Coordinates are in the same 0-100 viewBox units the diagram's SVG
// already renders in (xNorm/yNorm * 100).
const LABEL_ROW_HEIGHT = 1.9;
const LABEL_MAX_PUSH_ROWS = 15;
const LABEL_PADDING = 0.3;
// Rough per-character width at font-size 1 (viewBox units), for the bold
// sans-serif this diagram uses - deliberately approximate (real glyph
// widths vary by character), sized to be conservative enough to catch
// real overlaps without needing full text-measurement, which isn't
// available in either the server (string-built SVG) or client render path.
// Diagnosed 2026-08-26 against a real rendered screenshot: room labels
// are now uppercase (REFERENCE-DOCS/IMG_3916.JPG's convention) -
// uppercase glyphs render measurably wider than the same character count
// in mixed case (no narrow lowercase letters like i/l/r/t pulling the
// average down), so the OLD factor (tuned against mixed-case text)
// under-estimated real uppercase width and let a genuine overlap
// ("Master Bedroom"/"Living Room" running together) through undetected.
// Bumped for every label kind, not just room - a run/trunk label's
// mostly-numeric text isn't hurt by a slightly more conservative
// estimate, and a single shared constant is one real number to keep
// correct instead of a per-kind guess.
const CHAR_WIDTH_FACTOR = 0.68;
// A run label's circled type-code badge sits ~2.85 to ~0.95 units left
// of its text anchor (see the renderers' circleCx = label.x - 1.9, r =
// 0.95) - this is that same span, reserved in the collision box.
const RUN_LABEL_BADGE_WIDTH = 2.85;

type LabelBox = { x0: number; x1: number; y0: number; y1: number };

function estimateBox(
  x: number,
  y: number,
  text: string,
  fontSize: number,
  textAnchor: "start" | "middle",
  rows: 1 | 2 = 1,
): LabelBox {
  const width = text.length * fontSize * CHAR_WIDTH_FACTOR;
  const height = fontSize * 1.15 * rows;
  const x0 = textAnchor === "middle" ? x - width / 2 : x;
  const x1 = x0 + width;
  return { x0: x0 - LABEL_PADDING, x1: x1 + LABEL_PADDING, y0: y - height / 2 - LABEL_PADDING, y1: y + height / 2 + LABEL_PADDING };
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

export function layoutDuctRoutingLabels(sheet: DuctRoutingLayoutSheet): DuctRoutingLabel[] {
  type Candidate = {
    kind: DuctRoutingLabel["kind"];
    x: number;
    y: number;
    text: string;
    secondaryText?: string;
    typeCode?: string;
    fontSize: number;
    textAnchor: "start" | "middle";
    // Two-row stacked box (kind "run" register callouts) is roughly
    // twice a single line's height plus the divider - estimateBox needs
    // to know this to size the collision box correctly instead of
    // treating a stacked callout as if it were one line tall.
    rows: 1 | 2;
    // The real feature (register/AHU/room pin) this label describes - the
    // leader-line endpoint, distinct from the label's own natural offset
    // position above.
    featureX: number;
    featureY: number;
  };
  const candidates: Candidate[] = [];

  for (const pin of sheet.pins) {
    // Deliberately no room-name label here - the user's own explicit
    // instruction was to draw ONLY supply/branch lines, registers,
    // callouts, AHU, and the return-air plenum symbol, relying on the
    // source PDF's own printed room labels rather than drawing a second,
    // invented set on top of it. (A prior rebuild this session added
    // uppercase/underlined room labels matching REFERENCE-DOCS/
    // IMG_3916.JPG's convention without noticing this contradicted that
    // instruction - caught via direct user review of the live output,
    // not by re-reading the original spec.)
    if (pin.kind === "ahu" || pin.kind === "return") {
      const trunkText = formatDuctSizeCfm(pin.trunkDiameterIn, pin.trunkCfm);
      if (trunkText) {
        const fx = pin.xNorm * 100;
        const fy = pin.yNorm * 100;
        candidates.push({ kind: "trunk", x: fx - 2.3, y: fy - 0.9, text: trunkText, fontSize: 1.5, textAnchor: "middle", rows: 1, featureX: fx, featureY: fy });
      }
    }
  }

  for (const route of sheet.routes) {
    const sizeText = route.diameterIn ? `${route.diameterIn}"⌀` : null;
    const cfmText = route.cfm != null ? `${Math.round(route.cfm)}` : null;
    if (!sizeText && !cfmText) continue;
    // Anchored at the register end (not the line's midpoint) - this is
    // what "mark the CFM information at the register" means literally,
    // and it's what spreads these labels apart spatially in the first
    // place, since registers are spread across the real floor plan.
    // Offset below-right of the pin, mirroring the room-name label's
    // above-right offset, so a register's own two lines of text (name,
    // then size/CFM) stack rather than collide with each other before
    // the cross-register pass even runs.
    const fx = route.toXNorm * 100;
    const fy = route.toYNorm * 100;
    candidates.push({
      kind: "run",
      x: fx + 2.4,
      y: fy + 2.6,
      text: sizeText ?? "",
      secondaryText: cfmText ?? undefined,
      typeCode: route.patternTagCode ?? DEFAULT_REGISTER_TYPE_CODE,
      fontSize: 1.5,
      textAnchor: "start",
      rows: sizeText && cfmText ? 2 : 1,
      featureX: fx,
      featureY: fy,
    });
  }

  // Greedy vertical decluttering: process top-to-bottom, push each new
  // label straight down (bounded) until it clears every label already
  // placed. Deterministic, terminates in bounded steps, and keeps every
  // label close to the register/pin it describes rather than letting it
  // drift arbitrarily far away.
  const sorted = [...candidates].sort((a, b) => a.y - b.y);
  const placed: LabelBox[] = [];
  const results: DuctRoutingLabel[] = [];

  for (const candidate of sorted) {
    const widestLine = Math.max(candidate.text.length, candidate.secondaryText?.length ?? 0);
    let y = candidate.y;
    for (let row = 0; row < LABEL_MAX_PUSH_ROWS; row++) {
      const box = estimateBox(candidate.x, y, "x".repeat(widestLine), candidate.fontSize, candidate.textAnchor, candidate.rows);
      // Run labels also draw a circled type-code badge to the LEFT of
      // the stacked text (see the renderers) - estimateBox only knows
      // about the text itself, so extend the box's own left edge to
      // reserve real room for the badge too, rather than letting
      // another label's collision box overlap where the badge actually
      // gets drawn.
      if (candidate.kind === "run") box.x0 -= RUN_LABEL_BADGE_WIDTH;
      if (!placed.some((p) => boxesOverlap(box, p))) {
        placed.push(box);
        break;
      }
      if (row === LABEL_MAX_PUSH_ROWS - 1) {
        // Genuinely can't clear every neighbor within the row budget (an
        // extremely dense cluster) - place it anyway rather than push it
        // off the sheet; a small residual overlap here beats either an
        // infinite loop or a label flung far from its own register.
        placed.push(box);
        break;
      }
      y += LABEL_ROW_HEIGHT;
    }
    results.push({
      kind: candidate.kind,
      x: candidate.x,
      y,
      text: candidate.text,
      secondaryText: candidate.secondaryText,
      typeCode: candidate.typeCode,
      textAnchor: candidate.textAnchor,
      anchorX: candidate.featureX,
      anchorY: candidate.featureY,
    });
  }

  return results;
}

// -----------------------------------------------------------------------
// Real orthogonal, room-avoiding routing orchestration - the actual
// pathfinding lives in lib/ductPathGeometry.ts (pure, no domain types);
// this is the glue that resolves each room's real geometry (via
// nearest-position box matching, never by name - see that module's
// comment for why) and calls it. Shared by both the live client diagram
// (components/duct-routing-diagram.tsx, which has real page dimensions
// once its own async page-image fetch resolves) and the PDF report
// (lib/reportImages.ts's attachFrozenImages, which has real page
// dimensions once it renders the source PDF page) - same client/server
// split this module already uses elsewhere (see this file's own header
// comment), except here the shared PURE algorithm itself lives in one
// place and only the "when do we know the real page size" orchestration
// differs by side.
export function resolveRoomBox(pin: NormPoint, extractedBoxesOnPage: NormBox[]): NormBox {
  return matchRoomBoxByPosition(pin, extractedBoxesOnPage) ?? fallbackRoomBox(pin);
}

export type SheetRoomForBoxResolution = { id: string; name: string; xNorm: number; yNorm: number };

// One box per room actually on this sheet/page, regardless of which zone
// it belongs to - every room is a real physical obstacle no matter which
// AHU serves it.
export function resolveSheetRoomBoxes(
  roomsOnSheet: SheetRoomForBoxResolution[],
  extractedBoxesOnPage: NormBox[],
): Map<string, NormBox> {
  const map = new Map<string, NormBox>();
  for (const room of roomsOnSheet) {
    map.set(room.id, resolveRoomBox({ xNorm: room.xNorm, yNorm: room.yNorm }, extractedBoxesOnPage));
  }
  return map;
}

export type RoutedDuctSegment = {
  fromXNorm: number;
  fromYNorm: number;
  toXNorm: number;
  toYNorm: number;
  cls: SegmentClass;
};

export function routeSheetDucts(
  ahuPoint: NormPoint,
  ahuBox: NormBox,
  targets: { roomId: string; point: NormPoint }[],
  targetBoxes: Map<string, NormBox>,
  allRoomBoxesOnSheet: NormBox[],
  pageWidthFt: number,
  pageHeightFt: number,
): Map<string, RoutedDuctSegment[]> {
  const routed = routeZoneDucts(
    ahuPoint,
    ahuBox,
    targets.map((t) => ({ id: t.roomId, point: t.point })),
    targetBoxes,
    allRoomBoxesOnSheet,
    pageWidthFt,
    pageHeightFt,
  );
  const result = new Map<string, RoutedDuctSegment[]>();
  for (const path of routed.paths) {
    const segments = classifyPathSegments(path.points, routed.cellUsage, routed.cols, routed.rows, routed.paths.length);
    result.set(
      path.targetId,
      segments.map((s) => ({
        fromXNorm: s.from.xNorm,
        fromYNorm: s.from.yNorm,
        toXNorm: s.to.xNorm,
        toYNorm: s.to.yNorm,
        cls: s.cls,
      })),
    );
  }
  return result;
}

export function extractedRoomBoxesForPage(
  extractedRooms: ExtractedRoom[],
  sheetName: string,
): NormBox[] {
  return extractedRooms
    .filter((r) => r.source_sheet === sheetName)
    .map((r) => r.room_position)
    .filter(
      (p): p is NonNullable<ExtractedRoom["room_position"]> & { x_norm: number; y_norm: number; width_norm: number; height_norm: number } =>
        p != null && p.x_norm != null && p.y_norm != null && p.width_norm != null && p.height_norm != null,
    )
    .map((p) => ({ xNorm: p.x_norm, yNorm: p.y_norm, widthNorm: p.width_norm, heightNorm: p.height_norm }));
}

// Single entrypoint both the live client diagram and the PDF report call
// once they each have real page dimensions (in PDF points) for a sheet -
// resolves real room geometry (position-matched, see resolveRoomBox) and
// runs the real routing for every zone whose AHU sits on this sheet, in
// one pass so all zones on a shared sheet see each other's rooms as real
// obstacles too. Returns null when no real-world scale could be derived
// for this sheet (same "don't guess" gate handleAutoGenerateFromPins
// already uses for the exact same reason) - callers fall back to showing
// pins/registers without routed lines rather than a fabricated distance.
export function computeSheetDuctRouting(
  extractedData: {
    rooms: ExtractedRoom[];
    sheets?: { name: string; page_number: number | null; printed_scale_text?: string | null }[];
  } | null,
  pageNumber: number,
  pageWidthPt: number,
  pageHeightPt: number,
  roomsOnSheet: SheetRoomForBoxResolution[],
  zonesOnSheet: {
    id: string;
    ahuPoint: NormPoint;
    ahuOwnRoomId: string | null;
    targetRoomIds: string[];
    // Real, human-digitized corridor topology (lib/ductCorridorGraph.ts)
    // - the source of truth for this zone's routing when present, per
    // direct instruction, never combined with or overridden by the
    // computed room-box-avoidance router below. Falls back to that
    // computed router only when null or when its own calibration fails
    // (too few of the graph's rooms match this project's own confirmed
    // pins by name - see fitCorridorGraphCalibration).
    corridorGraph: CorridorGraph | null;
  }[],
): Map<string, RoutedDuctSegment[]> | null {
  const extractedRooms = extractedData?.rooms ?? [];
  const matchedSheet = extractedData?.sheets?.find((s) => s.page_number === pageNumber) ?? null;
  const sheetName = matchedSheet?.name ?? null;
  const printedScaleText = matchedSheet?.printed_scale_text ?? null;
  const roomById = new Map(roomsOnSheet.map((r) => [r.id, r]));

  const result = new Map<string, RoutedDuctSegment[]>();
  const zonesNeedingComputedRouting: typeof zonesOnSheet = [];

  for (const zone of zonesOnSheet) {
    if (zone.corridorGraph) {
      const graphSegments = computeSegmentsFromCorridorGraph(
        zone.corridorGraph,
        roomsOnSheet.map((r) => ({ name: r.name, xNorm: r.xNorm, yNorm: r.yNorm })),
        zone.ahuPoint,
      );
      if (graphSegments) {
        // The graph draws its own whole network at once, not one path
        // per target room - stored under a single synthetic key per
        // zone. Every real caller immediately flattens this map's
        // values() into one segment list anyway (see
        // buildDuctNetworkPrimitives), so the key itself carries no
        // meaning beyond keeping this zone's segments out of any other
        // zone's.
        result.set(`__corridor_graph__:${zone.id}`, graphSegments);
        continue;
      }
    }
    zonesNeedingComputedRouting.push(zone);
  }

  if (zonesNeedingComputedRouting.length === 0) return result;

  // Only derive the AI-based scale/obstacle geometry the computed router
  // needs if at least one zone actually still needs it - a zone with a
  // real corridor graph should never be blocked by an unrelated zone's
  // (or its own graph's) scale-derivation trouble, and shouldn't force
  // this extra work when it's not needed either.
  const scaleSampleRooms: ScaleSampleRoom[] = (sheetName != null ? extractedRooms.filter((er) => er.source_sheet === sheetName) : []).map(
    (er) => ({
      wallPageHorizontalLenFt: er.wall_page_horizontal_len_ft,
      wallPageVerticalLenFt: er.wall_page_vertical_len_ft,
      widthNorm: er.room_position?.width_norm ?? null,
      heightNorm: er.room_position?.height_norm ?? null,
    }),
  );
  const scale = resolveSheetScale(printedScaleText, scaleSampleRooms, pageWidthPt, pageHeightPt);
  if (scale.feetPerPagePoint == null) return result.size > 0 ? result : null;
  const pageWidthFt = scale.feetPerPagePoint * pageWidthPt;
  const pageHeightFt = scale.feetPerPagePoint * pageHeightPt;

  const extractedBoxes = sheetName != null ? extractedRoomBoxesForPage(extractedRooms, sheetName) : [];
  const roomBoxes = resolveSheetRoomBoxes(roomsOnSheet, extractedBoxes);
  const allBoxes = [...roomBoxes.values()];

  for (const zone of zonesNeedingComputedRouting) {
    const ahuBox = (zone.ahuOwnRoomId ? roomBoxes.get(zone.ahuOwnRoomId) : null) ?? fallbackRoomBox(zone.ahuPoint);
    const targets = zone.targetRoomIds
      .map((id) => {
        const room = roomById.get(id);
        return room ? { roomId: id, point: { xNorm: room.xNorm, yNorm: room.yNorm } } : null;
      })
      .filter((t): t is { roomId: string; point: NormPoint } => t != null);
    const routed = routeSheetDucts(zone.ahuPoint, ahuBox, targets, roomBoxes, allBoxes, pageWidthFt, pageHeightFt);
    for (const [roomId, segments] of routed) result.set(roomId, segments);
  }
  return result;
}

// -----------------------------------------------------------------------
// Raw routed segments -> real drafting primitives: a deduped segment set
// (the same shared trunk cell can appear once per room whose path used
// it - collapsed to a single drawn line, keeping the HIGHEST-hierarchy
// classification whenever the same physical run got two different
// classifications from two different rooms' paths) plus real elbow/tee
// fitting positions derived from actual vertex degree in the network -
// not guessed, not "wherever two lines happen to cross," an honest graph
// read of where runs actually join. Shared by both renderers so a fix
// here fixes both at once, same pattern as layoutDuctRoutingLabels.
// -----------------------------------------------------------------------

export type DuctNetworkPrimitives = {
  segments: RoutedDuctSegment[];
  elbows: NormPoint[];
  tees: NormPoint[];
};

const CLASS_RANK: Record<SegmentClass, number> = { trunk: 3, branch: 2, runout: 1 };

export function buildDuctNetworkPrimitives(allSegments: RoutedDuctSegment[]): DuctNetworkPrimitives {
  const round = (n: number) => Math.round(n * 10000) / 10000;
  const segKey = (s: RoutedDuctSegment) => {
    const a = `${round(s.fromXNorm)},${round(s.fromYNorm)}`;
    const b = `${round(s.toXNorm)},${round(s.toYNorm)}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  };
  const bestByKey = new Map<string, RoutedDuctSegment>();
  for (const seg of allSegments) {
    const key = segKey(seg);
    const existing = bestByKey.get(key);
    if (!existing || CLASS_RANK[seg.cls] > CLASS_RANK[existing.cls]) bestByKey.set(key, seg);
  }
  const segments = [...bestByKey.values()];

  type VertexEntry = { point: NormPoint; dirs: Set<string> };
  const adjacency = new Map<string, VertexEntry>();
  const pointKey = (x: number, y: number) => `${round(x)},${round(y)}`;
  const addVertex = (x: number, y: number, dir: string) => {
    const key = pointKey(x, y);
    let entry = adjacency.get(key);
    if (!entry) {
      entry = { point: { xNorm: x, yNorm: y }, dirs: new Set() };
      adjacency.set(key, entry);
    }
    entry.dirs.add(dir);
  };
  const OPPOSITE: Record<string, string> = { up: "down", down: "up", left: "right", right: "left" };
  for (const seg of segments) {
    const dx = seg.toXNorm - seg.fromXNorm;
    const dy = seg.toYNorm - seg.fromYNorm;
    const dir = dx === 0 ? (dy > 0 ? "down" : "up") : dx > 0 ? "right" : "left";
    addVertex(seg.fromXNorm, seg.fromYNorm, dir);
    addVertex(seg.toXNorm, seg.toYNorm, OPPOSITE[dir]);
  }

  const elbows: NormPoint[] = [];
  const tees: NormPoint[] = [];
  for (const entry of adjacency.values()) {
    const degree = entry.dirs.size;
    if (degree >= 3) {
      tees.push(entry.point);
    } else if (degree === 2) {
      const [a, b] = [...entry.dirs];
      const isStraightThrough = OPPOSITE[a] === b;
      if (!isStraightThrough) elbows.push(entry.point);
    }
  }
  return { segments, elbows, tees };
}
