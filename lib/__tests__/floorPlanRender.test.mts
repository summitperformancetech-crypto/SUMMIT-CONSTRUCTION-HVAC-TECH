// Direct unit test for lib/floorPlanRender.ts's getEffectivePageSize -
// diagnosed 2026-08-25 against a real drawing (Schneider's construction
// set) whose pages carry a /Rotate 270 flag: pdf-lib's raw getSize()
// reports pre-rotation MediaBox dimensions, not what's actually
// rendered/viewed, which silently fed the wrong page dimensions into
// lib/ductRouting.ts's real-world scale derivation. renderPdfPageToPngDataUri
// itself needs a real browser (see that file's own module comment) so
// isn't unit-tested here - this covers the pure dimension logic only.
import { describe, it, expect } from "vitest";
import { getEffectivePageSize } from "../floorPlanRender";

function page(width: number, height: number, angle: number) {
  return { getSize: () => ({ width, height }), getRotation: () => ({ angle }) };
}

describe("getEffectivePageSize", () => {
  it("returns raw dimensions unchanged for an unrotated page", () => {
    expect(getEffectivePageSize(page(2592, 1728, 0))).toEqual({ width: 2592, height: 1728 });
  });

  it("swaps width/height for a 270-degree rotated page (the real Schneider case)", () => {
    // Raw MediaBox is portrait (1728x2592); rotated 270 degrees, the page
    // actually renders/views landscape (2592x1728) - same as the real
    // drawing this was diagnosed against.
    expect(getEffectivePageSize(page(1728, 2592, 270))).toEqual({ width: 2592, height: 1728 });
  });

  it("swaps width/height for a 90-degree rotated page", () => {
    expect(getEffectivePageSize(page(1728, 2592, 90))).toEqual({ width: 2592, height: 1728 });
  });

  it("does not swap for a 180-degree rotated page (same aspect ratio either way)", () => {
    expect(getEffectivePageSize(page(2592, 1728, 180))).toEqual({ width: 2592, height: 1728 });
  });

  it("normalizes a negative rotation angle before checking", () => {
    expect(getEffectivePageSize(page(1728, 2592, -90))).toEqual({ width: 2592, height: 1728 });
  });
});
