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
import { computeSheetDuctRouting, type RoutedDuctSegment } from "./ductRouting";
import type { ReportData } from "./reportData";
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

          return {
            ...sheet,
            imageDataUri: await renderPage(sheet.drawingId, sheet.pageNumber),
            routedSegments,
          };
        }),
      )
    : [];

  return {
    ...reportData,
    floorPlanImageDataUri,
    residential: reportData.residential
      ? { ...reportData.residential, ductRoutingIllustration }
      : reportData.residential,
  };
}
