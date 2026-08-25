// SUMMIT-REPORT-STANDARD.md Section 5.9 / 7 - the Floor Plan page must
// show the actual source drawing, never regenerated geometry. This
// renders one page of an uploaded PDF drawing to a PNG image so it can be
// embedded (as a base64 data URI) into the self-contained report HTML.
//
// SIMPLIFICATION, flagged not hidden: this renders the full page as-is -
// it does NOT crop out a competitor (e.g. Wrightsoft) title block, which
// Section 7 calls for. Building that would need either a human-driven
// crop-selection UI or automated title-block detection; both were
// deferred as a separate, larger effort. What's here is still 100% the
// real source drawing page, never approximated - just not yet cropped.
//
// Technique: Chromium's built-in PDF viewer (bundled with headless
// Chromium regardless of which launcher provides it - see lib/browser.ts)
// renders a PDF page natively when navigated to a file:// URL with a
// #page=N fragment. Verified empirically that it renders at exactly 96 CSS
// px per 72pt page-point at 100% zoom (the #zoom=page-fit open parameter is
// silently ignored) - sizing the viewport to that exact conversion, with
// the toolbar/side-panel UI hidden via #toolbar=0&navpanes=0, produces a
// clean single-page screenshot with no viewer chrome and no peek of an
// adjacent page. A data: URL was tried first and failed (net::ERR_ABORTED
// - Chromium's PDF viewer does not reliably handle data: URLs the way it
// does file:// ones), which is why this writes to a temp file first.
// NOT YET VERIFIED against @sparticuz/chromium's serverless binary
// specifically (only against the full local `puppeteer` package's bundled
// Chromium) - the PDF-viewer plugin is standard headless Chromium
// behavior, not something @sparticuz/chromium's build strips, but this is
// flagged for confirmation on the first real Vercel deploy alongside
// lib/browser.ts's own unverified-serverless note.
import { launchBrowser } from "./browser";
import { PDFDocument } from "pdf-lib";
import { writeFile, rm, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const PDF_VIEWER_DPI = 96;
// Chromium's own practical viewport ceiling - a page larger than this
// (e.g. an oversized architectural E-size sheet) gets capped rather than
// producing a viewport Chromium may refuse or render unreliably.
const MAX_VIEWPORT_DIMENSION = 4000;

// Diagnosed 2026-08-25 against a real drawing (Schneider's construction
// set, an E-size sheet exported with a /Rotate 270 page flag): pdf-lib's
// own getSize() returns the RAW pre-rotation MediaBox dimensions, not
// what a viewer actually displays - for this file getSize() reported
// {width:1728, height:2592} (portrait) while Chromium's PDF viewer (and
// every human who opens this file) renders it landscape at 2592x1728.
// Same rotation-metadata gotcha already documented elsewhere in this
// codebase for this exact PDF library class (see
// lib/drawingExtraction.ts's Kinsela note on pre-rotation coordinates).
// Getting this wrong here doesn't just crop the screenshot - it silently
// feeds the WRONG page dimensions to anything computing a real-world
// scale from this render (lib/ductRouting.ts's derivePageScale), so it's
// corrected once, centrally, rather than trusted raw at each call site.
export function getEffectivePageSize(page: { getSize: () => { width: number; height: number }; getRotation: () => { angle: number } }): {
  width: number;
  height: number;
} {
  const raw = page.getSize();
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  return angle === 90 || angle === 270 ? { width: raw.height, height: raw.width } : raw;
}

export async function renderPdfPageToPngDataUri(pdfBytes: Buffer, pageNumber: number): Promise<string> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageIndex = pageNumber - 1;
  if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) {
    throw new Error(`Page ${pageNumber} does not exist in this PDF (it has ${pdfDoc.getPageCount()} pages).`);
  }
  const { width, height } = getEffectivePageSize(pdfDoc.getPage(pageIndex));
  const viewportWidth = Math.min(Math.round((width / 72) * PDF_VIEWER_DPI), MAX_VIEWPORT_DIMENSION);
  const viewportHeight = Math.min(Math.round((height / 72) * PDF_VIEWER_DPI), MAX_VIEWPORT_DIMENSION);

  const tmpDir = await mkdtemp(join(tmpdir(), "summit-floorplan-"));
  const tmpPdfPath = join(tmpDir, "drawing.pdf");
  await writeFile(tmpPdfPath, pdfBytes);

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: viewportWidth, height: viewportHeight });
    await page.goto(`file://${tmpPdfPath}#toolbar=0&navpanes=0&page=${pageNumber}`, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    // The PDF viewer's own render pass isn't covered by "networkidle0"
    // (it's plugin-internal rendering, not a network event) - a short
    // fixed wait is the same accommodation Puppeteer users commonly need
    // for this viewer; verified empirically to be enough for a full page
    // to finish drawing.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const screenshotBase64 = await page.screenshot({ encoding: "base64" });
    return `data:image/png;base64,${screenshotBase64}`;
  } finally {
    await browser?.close();
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
