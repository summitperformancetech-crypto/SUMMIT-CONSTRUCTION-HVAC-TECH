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
import { renderPdfPageToPngDataUri } from "./floorPlanRender";
import type { ReportData } from "./reportData";

type DrawingImageSource = {
  id: string;
  file_path: string;
  file_type: "pdf" | "image";
  floor_plan_page_number: number | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function attachFrozenImages(
  supabase: SupabaseClient<any>,
  projectId: string,
  reportData: ReportData,
): Promise<ReportData> {
  const { data: drawings } = await supabase
    .from("drawings")
    .select("id, file_path, file_type, floor_plan_page_number")
    .eq("project_id", projectId)
    .returns<DrawingImageSource[]>();

  if (!drawings || drawings.length === 0) return reportData;

  // Cache by (drawingId, pageNumber) - the floor plan page and a
  // duct-routing sheet very often coincide, and re-launching a browser
  // to render the identical page twice would be pure waste.
  const renderedByKey = new Map<string, string>();

  async function renderPage(drawingId: string, pageNumber: number): Promise<string | null> {
    const key = `${drawingId}:${pageNumber}`;
    const cached = renderedByKey.get(key);
    if (cached) return cached;

    const drawing = drawings!.find((d) => d.id === drawingId);
    if (!drawing) return null;
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("drawings")
      .download(drawing.file_path);
    if (downloadError || !fileBlob) return null;
    const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());

    try {
      const dataUri =
        drawing.file_type === "pdf"
          ? await renderPdfPageToPngDataUri(fileBuffer, pageNumber)
          : `data:${fileBlob.type || "image/png"};base64,${fileBuffer.toString("base64")}`;
      renderedByKey.set(key, dataUri);
      return dataUri;
    } catch (err) {
      console.error("Frozen image render failed:", err instanceof Error ? err.message : err);
      return null;
    }
  }

  const floorPlanDrawing = drawings.find((d) => d.floor_plan_page_number != null);
  const floorPlanImageDataUri = floorPlanDrawing
    ? await renderPage(floorPlanDrawing.id, floorPlanDrawing.floor_plan_page_number!)
    : null;

  const ductRoutingIllustration = reportData.residential
    ? await Promise.all(
        reportData.residential.ductRoutingIllustration.map(async (sheet) => ({
          ...sheet,
          imageDataUri: await renderPage(sheet.drawingId, sheet.pageNumber),
        })),
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
