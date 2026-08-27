// Attaches the actually-rendered images a ReportData needs (the Floor
// Plan page's source drawing, and each duct-routing sheet's background
// image) - the one piece getReportData (lib/reportData.ts) deliberately
// never computes itself, since it launches a real headless-Chromium
// browser (via lib/floorPlanRender.ts's renderPdfPageToPngDataUri) and
// getReportData is also called from the lightweight gate-status route on
// every page load, where that cost would be a real regression.
//
// Data Integrity Addendum, Section 1: called ONLY at snapshot-creation
// time (app/api/reports/route.ts's getOrCreateSnapshot, and
// app/api/reports/revise/route.ts) - the rendered images become part of
// the frozen calculation_snapshots.snapshot_data, exactly like every
// other figure in the report, so re-rendering an OLD version's PDF never
// picks up a drawing that was replaced or re-marked after that version
// was generated. Before this existed, the Floor Plan image was
// re-fetched LIVE on every PDF render regardless of which snapshot
// version was being viewed - a real, disclosed gap this closes.
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { renderPdfPageToPngDataUri, getEffectivePageSize } from "./floorPlanRender";
import { computeSheetDuctRouting, computeRealDistanceBetweenPinsFt, type RoutedDuctSegment } from "./ductRouting";
import { applyRealLineSetLength, type LinesetSpec } from "./installPackage";
import type { EquipmentCatalogEntry } from "./manualS";
import { fitCorridorGraphCalibration, resolveCorridorNodePositions, mapGraphRoomIdsToRealRoomIds } from "./ductCorridorGraph";
import {
  extractTrunkArms,
  extractTakeoffPositions,
  checkTakeoffSpacing,
  placePointAlongArm,
  computeDownstreamCfmAtDistance,
  computeReductionPointsFt,
  remapTakeoffPositionsToRealRoomIds,
  type TrunkArm,
} from "./ductTrunkTopology";
import type { ReportData, DuctRoutingIllustrationReducer } from "./reportData";
import type { DrawingExtraction } from "./drawingExtraction";

type DrawingImageSource = {
  id: string;
  file_path: string;
  file_type: "pdf" | "image";
  floor_plan_page_number: number | null;
  extracted_data: DrawingExtraction | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function attachFrozenImages(
  supabase: SupabaseClient<any>,
  projectId: string,
  reportData: ReportData,
): Promise<ReportData> {
  const { data: drawings } = await supabase
    .from("drawings")
    .select("id, file_path, file_type, floor_plan_page_number, extracted_data")
    .eq("project_id", projectId)
    .returns<DrawingImageSource[]>();

  if (!drawings || drawings.length === 0) return reportData;

  // Cache by (drawingId, pageNumber) - the floor plan page and a
  // duct-routing sheet very often coincide, and re-launching a browser
  // to render the identical page twice would be pure waste.
  const renderedByKey = new Map<string, string>();
  const fileByDrawingId = new Map<string, { buffer: Buffer; contentType: string }>();

  async function downloadDrawing(drawingId: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const cached = fileByDrawingId.get(drawingId);
    if (cached) return cached;
    const drawing = drawings!.find((d) => d.id === drawingId);
    if (!drawing) return null;
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("drawings")
      .download(drawing.file_path);
    if (downloadError || !fileBlob) return null;
    const result = { buffer: Buffer.from(await fileBlob.arrayBuffer()), contentType: fileBlob.type || "image/png" };
    fileByDrawingId.set(drawingId, result);
    return result;
  }

  async function renderPage(drawingId: string, pageNumber: number): Promise<string | null> {
    const key = `${drawingId}:${pageNumber}`;
    const cached = renderedByKey.get(key);
    if (cached) return cached;

    const drawing = drawings!.find((d) => d.id === drawingId);
    if (!drawing) return null;
    const file = await downloadDrawing(drawingId);
    if (!file) return null;

    try {
      const dataUri =
        drawing.file_type === "pdf"
          ? await renderPdfPageToPngDataUri(file.buffer, pageNumber)
          : `data:${file.contentType};base64,${file.buffer.toString("base64")}`;
      renderedByKey.set(key, dataUri);
      return dataUri;
    } catch (err) {
      console.error("Frozen image render failed:", err instanceof Error ? err.message : err);
      return null;
    }
  }

  // Real page dimensions (PDF points) for a duct-routing sheet - needed
  // by computeSheetDuctRouting for real-world scale, same
  // getEffectivePageSize rotation-aware read app/api/drawings/[id]/
  // page-image/route.ts already uses for the live pin canvas.
  async function pageDimensions(drawingId: string, pageNumber: number): Promise<{ widthPt: number; heightPt: number } | null> {
    const drawing = drawings!.find((d) => d.id === drawingId);
    if (!drawing || drawing.file_type !== "pdf") return null;
    const file = await downloadDrawing(drawingId);
    if (!file) return null;
    try {
      const pdfDoc = await PDFDocument.load(file.buffer);
      const pageIndex = pageNumber - 1;
      if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) return null;
      const { width, height } = getEffectivePageSize(pdfDoc.getPage(pageIndex));
      return { widthPt: width, heightPt: height };
    } catch (err) {
      console.error("Page dimension read failed:", err instanceof Error ? err.message : err);
      return null;
    }
  }

  const floorPlanDrawing = drawings.find((d) => d.floor_plan_page_number != null);
  const floorPlanImageDataUri = floorPlanDrawing
    ? await renderPage(floorPlanDrawing.id, floorPlanDrawing.floor_plan_page_number!)
    : null;

  const residentialRooms = reportData.residential?.rooms ?? [];
  const residentialZones = reportData.residential?.zones ?? [];

  // Catalog Expansion + Recommended Install Package, Section 5 gap - the
  // condenser/outdoor-unit pin has real page dimensions available here
  // (Puppeteer/pdf-lib, not lib/reportData.ts's cheap pass), so the real
  // AHU-to-condenser refrigerant line-set length is computed in this
  // pass and patched into installPackagesByZone below.
  const lineSetLengthFtByZoneId = new Map<string, number>();

  const ductRoutingIllustration = reportData.residential
    ? await Promise.all(
        reportData.residential.ductRoutingIllustration.map(async (sheet) => {
          const drawing = drawings!.find((d) => d.id === sheet.drawingId);
          const dims = await pageDimensions(sheet.drawingId, sheet.pageNumber);

          let routedSegments: RoutedDuctSegment[] | null = null;
          if (dims) {
            const roomsOnSheet = residentialRooms
              .filter(
                (r) =>
                  r.position_source_drawing_id === sheet.drawingId &&
                  r.position_source_page_number === sheet.pageNumber &&
                  r.position_x_norm != null &&
                  r.position_y_norm != null,
              )
              .map((r) => ({ id: r.id, name: r.name, xNorm: r.position_x_norm!, yNorm: r.position_y_norm! }));
            const zoneIdsOnSheet = [...new Set(sheet.pins.filter((p) => p.kind === "ahu").map((p) => p.zoneId))];
            const zonesOnSheet = zoneIdsOnSheet
              .map((zoneId) => {
                const ahuPin = sheet.pins.find((p) => p.kind === "ahu" && p.zoneId === zoneId);
                if (!ahuPin) return null;
                const ahuOwnRoom = residentialRooms.find(
                  (r) => r.zone_id === zoneId && r.position_x_norm === ahuPin.xNorm && r.position_y_norm === ahuPin.yNorm,
                );
                return {
                  id: zoneId,
                  ahuPoint: { xNorm: ahuPin.xNorm, yNorm: ahuPin.yNorm },
                  ahuOwnRoomId: ahuOwnRoom?.id ?? null,
                  targetRoomIds: sheet.routes.filter((r) => r.zoneId === zoneId).map((r) => r.roomId),
                  corridorGraph: residentialZones.find((z) => z.id === zoneId)?.corridor_graph ?? null,
                };
              })
              .filter((z): z is NonNullable<typeof z> => z != null);

            const routedByRoomId = computeSheetDuctRouting(
              drawing?.extracted_data ?? null,
              sheet.pageNumber,
              dims.widthPt,
              dims.heightPt,
              roomsOnSheet,
              zonesOnSheet,
            );
            routedSegments = routedByRoomId ? [...routedByRoomId.values()].flat() : null;
          }

          // Permit-Submittable Manual D Package, Section 4 rendering
          // follow-up: real tapered-reducer markers and take-off
          // spacing-violation flags, computed only for a zone with a
          // real corridor_graph on THIS sheet - same real calibration
          // fit (fitCorridorGraphCalibration) computeSheetDuctRouting
          // itself uses internally, refit here since that function
          // doesn't expose it. A zone using the computed room-box-
          // avoidance router (no corridor_graph) gets none of this - see
          // lib/ductTrunkTopology.ts's own comment for why that source
          // isn't precise enough for a real position-along-trunk figure.
          const reducers: DuctRoutingIllustrationReducer[] = [];
          const takeoffViolationRoomIds = new Set<string>();
          if (dims) {
            const roomsOnSheetForTopology = residentialRooms
              .filter(
                (r) =>
                  r.position_source_drawing_id === sheet.drawingId &&
                  r.position_source_page_number === sheet.pageNumber &&
                  r.position_x_norm != null &&
                  r.position_y_norm != null,
              )
              .map((r) => ({ id: r.id, name: r.name, xNorm: r.position_x_norm!, yNorm: r.position_y_norm! }));
            const zoneIdsOnSheet = [...new Set(sheet.pins.filter((p) => p.kind === "ahu").map((p) => p.zoneId))];
            const cfmByRoomId = new Map(sheet.routes.map((r) => [r.roomId, r.cfm ?? 0]));

            for (const zoneId of zoneIdsOnSheet) {
              const zone = residentialZones.find((z) => z.id === zoneId);
              const graph = zone?.corridor_graph;
              if (!graph) continue;
              const ahuPin = sheet.pins.find((p) => p.kind === "ahu" && p.zoneId === zoneId);
              const calibration = fitCorridorGraphCalibration(graph.rooms, roomsOnSheetForTopology);
              if (!calibration) continue;
              const positionById = resolveCorridorNodePositions(
                graph,
                calibration,
                ahuPin ? { xNorm: ahuPin.xNorm, yNorm: ahuPin.yNorm } : null,
              );

              const arms: TrunkArm[] = extractTrunkArms(graph);
              // The graph's own room ids are human-readable slugs in the
              // digitizer's space, not this app's real room UUIDs (see
              // lib/ductCorridorGraph.ts's mapGraphRoomIdsToRealRoomIds) -
              // bridged by name here so cfmByRoomId (keyed by the real
              // UUID sheet.routes itself uses) and the violation-flag set
              // (compared against sheet.routes' real UUID below) actually
              // match instead of silently missing every lookup.
              const roomIdMap = mapGraphRoomIdsToRealRoomIds(graph, roomsOnSheetForTopology);
              const positions = remapTakeoffPositionsToRealRoomIds(extractTakeoffPositions(graph, arms), roomIdMap);
              // Diameter data isn't available in this rendering pass (it
              // lives in the separately-computed Manual D schedule) -
              // the flat 4ft post-reduction clearance is used here
              // rather than the greater-of-4ft-or-1.5x-diameter figure,
              // a disclosed simplification for the diagram markers only;
              // the Design Check Summary's own table uses the real
              // per-run diameter when computing this same check.
              const violations = checkTakeoffSpacing(positions, arms, new Map());
              for (const v of violations) takeoffViolationRoomIds.add(v.roomId);

              arms.forEach((arm, armIndex) => {
                for (const step of computeReductionPointsFt(arm.totalLengthFt)) {
                  const point = placePointAlongArm(arm, step, positionById);
                  if (!point) continue;
                  const downstreamCfm = computeDownstreamCfmAtDistance(positions, armIndex, step, cfmByRoomId);
                  reducers.push({ xNorm: point.xNorm, yNorm: point.yNorm, downstreamCfm, zoneId, zoneName: zone!.name });
                }
              });
            }
          }

          // Real refrigerant line-set length - only computable once a
          // real scale exists for this sheet (same "don't guess" gate as
          // routedSegments above) and both the AHU and condenser pins
          // are resolved on it.
          if (dims) {
            const ahuPinsOnSheet = sheet.pins.filter((p) => p.kind === "ahu");
            const condenserPinsOnSheet = sheet.pins.filter((p) => p.kind === "condenser");
            for (const condenserPin of condenserPinsOnSheet) {
              const ahuPin = ahuPinsOnSheet.find((p) => p.zoneId === condenserPin.zoneId);
              if (!ahuPin) continue;
              const distanceFt = computeRealDistanceBetweenPinsFt(
                drawing?.extracted_data ?? null,
                sheet.pageNumber,
                dims.widthPt,
                dims.heightPt,
                { xNorm: ahuPin.xNorm, yNorm: ahuPin.yNorm },
                { xNorm: condenserPin.xNorm, yNorm: condenserPin.yNorm },
              );
              if (distanceFt != null) lineSetLengthFtByZoneId.set(condenserPin.zoneId, distanceFt);
            }
          }

          return {
            ...sheet,
            imageDataUri: await renderPage(sheet.drawingId, sheet.pageNumber),
            routedSegments,
            reducers,
            takeoffViolationRoomIds: [...takeoffViolationRoomIds],
          };
        }),
      )
    : [];

  // Patch every affected zone's install package with the real, now-known
  // line-set length - the only piece of computeInstallPackage's output
  // that depends on real page dimensions this file has and
  // lib/reportData.ts's cheap pass never does.
  let installPackagesByZone = reportData.residential?.installPackagesByZone ?? [];
  if (reportData.residential && lineSetLengthFtByZoneId.size > 0) {
    const outdoorEquipmentIds = [
      ...new Set(
        reportData.residential.zones
          .filter((z) => lineSetLengthFtByZoneId.has(z.id) && z.selected_equipment_id != null)
          .map((z) => z.selected_equipment_id as string),
      ),
    ];
    if (outdoorEquipmentIds.length > 0) {
      const [{ data: equipRows }, { data: linesetRows }] = await Promise.all([
        supabase
          .from("equipment_catalog")
          .select("id, manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document")
          .in("id", outdoorEquipmentIds)
          .returns<
            {
              id: string;
              manufacturer: string;
              model_number: string;
              equipment_type: EquipmentCatalogEntry["equipmentType"];
              stage_type: EquipmentCatalogEntry["stageType"];
              nominal_cooling_capacity_btu: number | null;
              nominal_heating_capacity_btu: number | null;
              rated_cfm: number | null;
              source_document: string;
            }[]
          >(),
        supabase
          .from("refrigerant_lineset_specs")
          .select("equipment_id, liquid_line_diameter_in, vapor_line_diameter_in, max_equivalent_length_ft, length_derate_notes")
          .in("equipment_id", outdoorEquipmentIds)
          .returns<{ equipment_id: string; liquid_line_diameter_in: number; vapor_line_diameter_in: number; max_equivalent_length_ft: number | null; length_derate_notes: string | null }[]>(),
      ]);
      const equipById = new Map<string, EquipmentCatalogEntry>(
        (equipRows ?? []).map((r) => [
          r.id,
          {
            id: r.id,
            manufacturer: r.manufacturer,
            modelNumber: r.model_number,
            equipmentType: r.equipment_type,
            stageType: r.stage_type,
            nominalCoolingCapacityBtu: r.nominal_cooling_capacity_btu,
            nominalHeatingCapacityBtu: r.nominal_heating_capacity_btu,
            ratedCfm: r.rated_cfm,
            sourceDocument: r.source_document,
          },
        ]),
      );
      const linesetByEquip = new Map<string, LinesetSpec>(
        (linesetRows ?? []).map((r) => [
          r.equipment_id,
          {
            equipmentId: r.equipment_id,
            liquidLineDiameterIn: r.liquid_line_diameter_in,
            vaporLineDiameterIn: r.vapor_line_diameter_in,
            maxEquivalentLengthFt: r.max_equivalent_length_ft,
            lengthDerateNotes: r.length_derate_notes,
          },
        ]),
      );

      installPackagesByZone = installPackagesByZone.map((pkg) => {
        const lineSetLengthFt = lineSetLengthFtByZoneId.get(pkg.zoneId);
        const zone = reportData.residential!.zones.find((z) => z.id === pkg.zoneId);
        const outdoorUnit = zone?.selected_equipment_id ? equipById.get(zone.selected_equipment_id) : null;
        if (lineSetLengthFt == null || !outdoorUnit) return pkg;
        return applyRealLineSetLength(pkg, outdoorUnit, linesetByEquip.get(outdoorUnit.id) ?? null, lineSetLengthFt);
      });
    }
  }

  return {
    ...reportData,
    floorPlanImageDataUri,
    residential: reportData.residential
      ? { ...reportData.residential, ductRoutingIllustration, installPackagesByZone }
      : reportData.residential,
  };
}
