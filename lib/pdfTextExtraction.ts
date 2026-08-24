import { PDFParse } from "pdf-parse";

// Diagnosed 2026-08-14 (see roomsNeedingCeilingHeightFollowUp's own
// comment in drawingExtraction.ts): a narrow, single-purpose follow-up
// call that re-asks the model to look more carefully at a specific
// sheet/room does NOT reliably recover a fact the first pass's vision
// reading missed - on Kinsela, directly asked whether a sheet has a
// ceiling-insulation callout, the model still said no on a page
// independently confirmed (via PyMuPDF's plain page.get_text(), not
// AI) to contain "R-38 BLOWN INSULATION" verbatim. That diagnosis
// flagged, but did not build, the actual fix: most real architectural
// PDFs (anything CAD-exported, as opposed to a scanned raster image)
// carry a genuine embedded text layer that can be read byte-accurately
// by a deterministic parser - no vision, no OCR, no chance of a misread
// digit. This module does exactly that read, so route.ts can hand the
// model that ground truth directly alongside the visual document,
// rather than asking it to look harder at the same pixels a second
// time.
//
// This is deliberately NOT a replacement extraction path (no attempt
// here to parse dimensions, room names, or any structured fact out of
// this text - that would duplicate and risk drifting from the real
// schema-aware extraction logic in drawingExtraction.ts). It only
// supplies raw, page-ordered text as an additional, clearly-labeled
// input the model can cross-reference against what it reads visually -
// see formatPdfTextForPrompt's own instructions to the model on how to
// use it and its real limits (no layout/position information, and page
// order here is document order, not necessarily sheet number order).
export type PdfPageText = { pageNumber: number; text: string };

// pdf-parse's current major (2.x, not the older 1.1.x line) pinned
// deliberately: confirmed directly (not assumed) that 1.1.4's bundled
// pdfjs-dist - quite old - throws "bad XRef entry" on a spec-valid,
// freshly-generated pdf-lib PDF, a real robustness gap for a fix meant
// to work on every drawing ever uploaded, not just the specific ones
// tested so far. 2.x bundles a current pdfjs-dist (5.x) that parsed
// both that same fixture AND a real CAD-exported drawing (Kinsela's)
// cleanly. Its added image/table extraction depends on a native
// binary (@napi-rs/canvas) - confirmed directly that getText() (all
// this module calls) does not invoke it, so that dependency is never
// touched by this code path. The package's own README additionally
// lists Vercel/Netlify/Lambda/Cloudflare Workers as supported
// deployment targets - relevant given this project's serverless
// deploy target (see PHASE.md's "What Is Not Verified").
//
// Returns one entry per page, in document page order (not necessarily
// sheet-number order - a set can be paginated differently than its
// sheets are numbered). Returns an empty array, never throws, when the
// PDF has no extractable text layer at all (a scanned/rasterized
// drawing) or genuinely can't be parsed - callers fall back to
// vision-only reading in that case, exactly the pre-existing behavior
// before this module existed.
export async function extractPdfPageTexts(buffer: Buffer): Promise<PdfPageText[]> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.pages.map((page) => ({ pageNumber: page.num, text: page.text }));
  } catch {
    return [];
  } finally {
    await parser.destroy();
  }
}

// Builds the supplementary prompt block, or null when there's nothing
// worth sending (no pages, or every page's text is blank/whitespace -
// the scanned-drawing case). Deliberately explicit about this text's
// real limits (no layout/position, unreliable page-to-sheet ordering)
// so the model treats it as a cross-reference aid, not a replacement
// for actually looking at the drawing - a hallucinated room/sheet
// match from garbled, position-free text would be a worse outcome than
// the honest "unresolved" this is meant to reduce.
export function formatPdfTextForPrompt(pages: PdfPageText[]): string | null {
  const nonEmpty = pages.filter((p) => p.text.trim().length > 0);
  if (nonEmpty.length === 0) return null;

  const body = nonEmpty
    .map((p) => `--- Page ${p.pageNumber} (raw embedded text, deterministically extracted) ---\n${p.text.trim()}`)
    .join("\n\n");

  return [
    `SUPPLEMENTARY DATA: the exact text embedded in this PDF's own vector layer, extracted by a deterministic parser - NOT vision, NOT OCR. Wherever a piece of text below genuinely corresponds to a printed value on the drawing, it is character-accurate, unlike anything read visually from a small or crowded label. Use it to CONFIRM or FIND printed values (room dimensions, ceiling heights, insulation callouts, schedule entries, notes) you might otherwise be tempted to mark unresolved.`,
    `Real limits of this text, so you use it correctly: it has NO layout or position information - words from a dimension string, a room label, and an unrelated nearby note can all run together out of visual reading order, on one line or split across many. Page numbers below are this PDF's raw page order, which is not guaranteed to match the sheet numbering printed on each sheet (e.g. page 3 is not necessarily sheet "A1.2"). You still need the visual document to know WHICH room or sheet a given fragment of text actually belongs to, and to confirm it isn't superseded, crossed out, or from a legend rather than the live drawing. Cross-reference both together before concluding a fact is genuinely unavailable.`,
    `If a room's real dimensions, or a callout you need, appear ANYWHERE in this text but you did not find them visually on that room's primary sheet, search this text for the room's name (or a unique nearby detail - a fixture, a cabinet callout, an adjacent room name) before marking the field unresolved - the same way an architect would check every sheet in a set, not just the one a room's outline happens to sit on.`,
    body,
  ].join("\n\n");
}
