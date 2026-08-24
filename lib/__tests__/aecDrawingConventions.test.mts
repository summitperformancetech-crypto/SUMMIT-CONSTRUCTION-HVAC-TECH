import { describe, it, expect } from "vitest";
import { buildAecKnowledgeBaseBlock } from "../aecDrawingConventions";
import { buildExtractionPrompt } from "../drawingExtraction";

describe("buildAecKnowledgeBaseBlock", () => {
  const block = buildAecKnowledgeBaseBlock();

  it("is a non-empty, deterministic string with no arguments", () => {
    expect(typeof block).toBe("string");
    expect(block.length).toBeGreaterThan(500);
    expect(buildAecKnowledgeBaseBlock()).toBe(block);
  });

  it("covers sheet numbering conventions", () => {
    expect(block).toContain("SHEET NUMBERING");
    expect(block).toMatch(/A1\.1/);
  });

  it("covers the clear-vs-out-to-out dimension distinction that caused a real misread this session", () => {
    expect(block).toMatch(/CLEAR\/FINISHED/i);
    expect(block).toMatch(/OUT-TO-OUT/i);
  });

  it("covers common abbreviations actually seen on real drawings this session", () => {
    expect(block).toContain("WIC");
    expect(block).toContain("RD/SHELF");
    expect(block).toContain("V.I.F.");
  });

  it("covers door/window symbol conventions", () => {
    expect(block).toMatch(/swing/i);
    expect(block).toMatch(/window/i);
  });

  it("does not claim to override real drawing evidence", () => {
    expect(block).toMatch(/actual drawing always wins/i);
  });
});

describe("buildExtractionPrompt", () => {
  it("includes the AEC knowledge base block regardless of orientation state", () => {
    expect(buildExtractionPrompt(null)).toContain("AEC DRAWING LITERACY REFERENCE");
  });
});
