import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfPageTexts, formatPdfTextForPrompt } from "../pdfTextExtraction";

async function buildTestPdf(pageTexts: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pageTexts) {
    const page = doc.addPage([400, 400]);
    if (text) {
      page.drawText(text, { x: 20, y: 300, size: 14, font });
    }
  }
  return Buffer.from(await doc.save());
}

describe("extractPdfPageTexts", () => {
  it("returns one entry per page, in page order, with the real embedded text", async () => {
    const pdf = await buildTestPdf(["MASTER BEDROOM 15-8 X 17-10", "LAUNDRY 9-10 X 9-5"]);
    const pages = await extractPdfPageTexts(pdf);
    expect(pages).toHaveLength(2);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[0].text).toContain("MASTER BEDROOM");
    expect(pages[1].pageNumber).toBe(2);
    expect(pages[1].text).toContain("LAUNDRY");
  });

  it("returns an empty-text entry for a page with no text, not a thrown error", async () => {
    const pdf = await buildTestPdf(["ROOM A", ""]);
    const pages = await extractPdfPageTexts(pdf);
    expect(pages).toHaveLength(2);
    expect(pages[1].text.trim()).toBe("");
  });

  it("returns an empty array, not a throw, for a buffer that isn't a valid PDF", async () => {
    const pages = await extractPdfPageTexts(Buffer.from("not a pdf"));
    expect(pages).toEqual([]);
  });
});

describe("formatPdfTextForPrompt", () => {
  it("returns null when there are no pages", () => {
    expect(formatPdfTextForPrompt([])).toBeNull();
  });

  it("returns null when every page's text is blank or whitespace-only", () => {
    expect(
      formatPdfTextForPrompt([
        { pageNumber: 1, text: "" },
        { pageNumber: 2, text: "   \n  " },
      ]),
    ).toBeNull();
  });

  it("includes real page text and labels it with the correct page number", () => {
    const result = formatPdfTextForPrompt([{ pageNumber: 3, text: "MASTER CLOSET 15' X 14'" }]);
    expect(result).not.toBeNull();
    expect(result).toContain("Page 3");
    expect(result).toContain("MASTER CLOSET 15' X 14'");
  });

  it("filters out blank pages but keeps non-blank ones from the same document", () => {
    const result = formatPdfTextForPrompt([
      { pageNumber: 1, text: "" },
      { pageNumber: 2, text: "HIDDEN GUN CLOSET 4'3\" X 6'4\"" },
      { pageNumber: 3, text: "   " },
    ]);
    expect(result).not.toBeNull();
    expect(result).toContain("Page 2");
    expect(result).not.toContain("Page 1");
    expect(result).not.toContain("Page 3");
  });

  it("warns the model this text has no layout/position information", () => {
    const result = formatPdfTextForPrompt([{ pageNumber: 1, text: "SOME TEXT" }]);
    expect(result).toMatch(/no layout or position information/i);
  });
});
