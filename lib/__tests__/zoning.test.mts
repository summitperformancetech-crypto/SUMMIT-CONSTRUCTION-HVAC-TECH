// proposeZoning - the AI zoning proposal (pipeline stage 7). Run via
// `npm test` (Vitest).
import { describe, it, expect } from "vitest";
import { proposeZoning, type ZoningRoomInput } from "../zoning";

function r(id: string, level: string, sqft: number, conditioned = true): ZoningRoomInput {
  return { id, name: id, level, floor_area_sqft: sqft, is_conditioned: conditioned, zone_id: null };
}

describe("proposeZoning", () => {
  it("proposes a single zone for a small single-level house", () => {
    const rooms = [r("a", "single_story", 400), r("b", "single_story", 500), r("c", "single_story", 600)];
    const p = proposeZoning(rooms);
    expect(p.zones).toHaveLength(1);
    expect(Object.values(p.roomZoneMap)).toEqual([0, 0, 0]);
  });

  it("proposes one zone per level for a two-story house", () => {
    const rooms = [
      r("a", "bottom_floor", 800),
      r("b", "bottom_floor", 700),
      r("c", "top_floor", 600),
      r("d", "top_floor", 500),
    ];
    const p = proposeZoning(rooms);
    expect(p.zones).toHaveLength(2);
    // bottom floor sorts before top floor
    expect(p.zones[0].name).toBe("Downstairs");
    expect(p.zones[1].name).toBe("Upstairs");
    expect(p.roomZoneMap["a"]).toBe(0);
    expect(p.roomZoneMap["c"]).toBe(1);
  });

  it("assigns every conditioned room to a zone and ignores unconditioned rooms", () => {
    const rooms = [
      r("a", "bottom_floor", 800),
      r("b", "top_floor", 600),
      r("garage", "bottom_floor", 400, false),
    ];
    const p = proposeZoning(rooms);
    expect(Object.keys(p.roomZoneMap).sort()).toEqual(["a", "b"]);
    for (const idx of Object.values(p.roomZoneMap)) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(p.zones.length);
    }
  });

  it("keeps a large single-level house as one zone but flags it in the rationale", () => {
    const rooms = [r("a", "single_story", 1600), r("b", "single_story", 1500)];
    const p = proposeZoning(rooms);
    expect(p.zones).toHaveLength(1);
    expect(p.rationale.toLowerCase()).toContain("manual split");
  });

  it("returns nothing to zone when there are no conditioned rooms", () => {
    expect(proposeZoning([r("garage", "single_story", 400, false)]).zones).toEqual([]);
  });
});
