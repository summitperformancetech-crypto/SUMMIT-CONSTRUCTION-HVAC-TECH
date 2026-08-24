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

  it("covers construction-assembly/framing callouts relevant to ceiling height and duct routing", () => {
    expect(block).toContain("CONSTRUCTION ASSEMBLY");
    expect(block).toMatch(/KNEE WALL/);
    expect(block).toMatch(/R-38 BLOWN INSULATION/);
  });

  it("covers schedule-table reading conventions", () => {
    expect(block).toContain("SCHEDULE TABLES");
    expect(block).toMatch(/MARK column/);
    expect(block).toMatch(/not a per-room count/);
  });

  it("covers mechanical-plan-specific conventions", () => {
    expect(block).toContain("MECHANICAL (HVAC) PLAN CONVENTIONS");
    expect(block).toMatch(/thermostat/i);
    expect(block).toMatch(/single-line/);
  });

  it("covers structural-sheet literacy for recognizing out-of-scope content", () => {
    expect(block).toContain("STRUCTURAL SHEET LITERACY");
    expect(block).toMatch(/out of scope/);
    expect(block).toMatch(/JOISTS @ 16/);
  });

  it("covers electrical-sheet literacy, including the HVAC-relevant exception", () => {
    expect(block).toContain("ELECTRICAL SHEET LITERACY");
    expect(block).toMatch(/disconnect switch/);
    expect(block).toMatch(/never the electrical circuit\/panel design itself/);
  });
});

describe("buildExtractionPrompt", () => {
  it("includes the AEC knowledge base block regardless of orientation state", () => {
    expect(buildExtractionPrompt(null)).toContain("AEC DRAWING LITERACY REFERENCE");
  });
});
