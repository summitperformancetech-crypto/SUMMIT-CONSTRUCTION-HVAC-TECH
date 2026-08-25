import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { renderPdfPageToPngDataUri, getEffectivePageSize } from "@/lib/floorPlanRender";

// Renders a specific page of an uploaded drawing to a PNG data URI, for
// the duct-routing pin-placement canvas (components/duct-routing-canvas.tsx)
// - reuses the exact same renderer the Floor Plan report page already
// uses (lib/floorPlanRender.ts), so a pin placed on the canvas lines up
// pixel-for-pixel with the same image the report later composites, and a
// normalized (0-1) coordinate means the same thing in both places. Runs
// through the caller's own session (RLS via createClient(), same
// existing "Access drawings via project access" policy every other
// drawing read in this app already goes through) - no service-role
// bypass, matches every other authenticated route in this app.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: drawingId } = await params;
  const { searchParams } = new URL(request.url);
  const pageParam = searchParams.get("page");
  const pageNumber = pageParam ? Number(pageParam) : 1;
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: "A valid page number is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: drawing, error: drawingError } = await supabase
    .from("drawings")
    .select("id, file_path, file_type, file_name")
    .eq("id", drawingId)
    .maybeSingle<{ id: string; file_path: string; file_type: "pdf" | "image"; file_name: string }>();

  if (drawingError || !drawing) {
    return NextResponse.json({ error: "Drawing not found" }, { status: 404 });
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("drawings")
    .download(drawing.file_path);
  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: "Could not download the file" }, { status: 500 });
  }
  const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());

  try {
    if (drawing.file_type === "pdf") {
      // Real PDF page-point dimensions - the same physical unit
      // lib/floorPlanRender.ts's own PDF_VIEWER_DPI conversion (96 CSS px
      // per 72pt) is built on, and what lib/ductRouting.ts's
      // derivePageScale needs to turn a normalized pin coordinate into a
      // real feet distance. Read directly from the PDF itself, not
      // guessed from the rendered image's pixel size (which is capped by
      // MAX_VIEWPORT_DIMENSION for an oversized sheet and would silently
      // misstate scale if used instead). getEffectivePageSize (not raw
      // getSize()) - see its own comment in lib/floorPlanRender.ts for why:
      // a rotated page's raw MediaBox dimensions don't match what's
      // actually rendered/viewed.
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const pageIndex = pageNumber - 1;
      if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) {
        return NextResponse.json(
          { error: `Page ${pageNumber} does not exist in this PDF (it has ${pdfDoc.getPageCount()} pages).` },
          { status: 400 },
        );
      }
      const { width: pageWidthPt, height: pageHeightPt } = getEffectivePageSize(pdfDoc.getPage(pageIndex));
      const dataUri = await renderPdfPageToPngDataUri(fileBuffer, pageNumber);
      return NextResponse.json({ dataUri, pageWidthPt, pageHeightPt });
    }
    const dataUri = `data:${fileBlob.type || "image/png"};base64,${fileBuffer.toString("base64")}`;
    return NextResponse.json({ dataUri, pageWidthPt: null, pageHeightPt: null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to render page" },
      { status: 500 },
    );
  }
}
