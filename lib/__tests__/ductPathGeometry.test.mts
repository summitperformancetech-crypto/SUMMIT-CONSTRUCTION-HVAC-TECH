// Real orthogonal, room-avoiding routing engine - see lib/ductPathGeometry.ts's
// module comment for the full reasoning (built 2026-08-25 to replace the
// star-pattern illustration with real trunk-and-branch geometry).
import { describe, it, expect } from "vitest";
import {
  matchRoomBoxByPosition,
  fallbackRoomBox,
  buildOccupancyGrid,
  findOrthogonalPath,
  simplifyOrthogonalPath,
  routeZoneDucts,
  classifyUsageCount,
  classifyPathSegments,
  type NormBox,
  type NormPoint,
} from "../ductPathGeometry";

describe("matchRoomBoxByPosition", () => {
  it("matches the nearest box by centroid distance, not name", () => {
    const candidates: NormBox[] = [
      { xNorm: 0.48, yNorm: 0.3, widthNorm: 0.12, heightNorm: 0.12 }, // centroid (0.54, 0.36)
      { xNorm: 0.48, yNorm: 0.6, widthNorm: 0.12, heightNorm: 0.12 }, // centroid (0.54, 0.66)
    ];
    const pin: NormPoint = { xNorm: 0.54, yNorm: 0.36 };
    expect(matchRoomBoxByPosition(pin, candidates)).toEqual(candidates[0]);
  });

  it("resolves a real Schneider-style name swap via position, not the (wrong) name", () => {
    // "Bedroom 5" in the corrected rooms table sits exactly where the
    // extraction (still) calls "Bedroom 2" - matching by name would pick
    // the wrong box entirely; matching by position gets it right.
    const bedroom2Box: NormBox = { xNorm: 0.48, yNorm: 0.3, widthNorm: 0.12, heightNorm: 0.12 };
    const correctedBedroom5Pin: NormPoint = { xNorm: 0.54, yNorm: 0.36 };
    expect(matchRoomBoxByPosition(correctedBedroom5Pin, [bedroom2Box])).toEqual(bedroom2Box);
  });

  it("returns null when the nearest box is too far to be a real match (real Schneider case: hand-corrected position)", () => {
    // "Unfinished Attic"'s position was hand-corrected after extraction -
    // no extracted box corresponds to it anymore.
    const staleAtticBox: NormBox = { xNorm: 0.6, yNorm: 0.3, widthNorm: 0.14, heightNorm: 0.16 };
    const correctedPin: NormPoint = { xNorm: 0.763, yNorm: 0.773 };
    expect(matchRoomBoxByPosition(correctedPin, [staleAtticBox])).toBeNull();
  });

  it("returns null with no candidates", () => {
    expect(matchRoomBoxByPosition({ xNorm: 0.5, yNorm: 0.5 }, [])).toBeNull();
  });
});

describe("fallbackRoomBox", () => {
  it("returns a small box centered on the pin", () => {
    const box = fallbackRoomBox({ xNorm: 0.5, yNorm: 0.5 });
    const cx = box.xNorm + box.widthNorm / 2;
    const cy = box.yNorm + box.heightNorm / 2;
    expect(cx).toBeCloseTo(0.5);
    expect(cy).toBeCloseTo(0.5);
    expect(box.widthNorm).toBeGreaterThan(0);
    expect(box.heightNorm).toBeGreaterThan(0);
  });
});

describe("buildOccupancyGrid", () => {
  it("marks cells inside an obstacle box as occupied", () => {
    const grid = buildOccupancyGrid([{ xNorm: 0.4, yNorm: 0.4, widthNorm: 0.2, heightNorm: 0.2 }], 40, 40);
    const centerCol = Math.round(0.5 * grid.cols);
    const centerRow = Math.round(0.5 * grid.rows);
    expect(grid.occupied[centerRow][centerCol]).toBe(true);
  });

  it("leaves cells outside every obstacle unoccupied", () => {
    const grid = buildOccupancyGrid([{ xNorm: 0.4, yNorm: 0.4, widthNorm: 0.2, heightNorm: 0.2 }], 40, 40);
    const col = Math.round(0.05 * grid.cols);
    const row = Math.round(0.05 * grid.rows);
    expect(grid.occupied[row][col]).toBe(false);
  });

  it("scales row count to the sheet's real aspect ratio", () => {
    const wide = buildOccupancyGrid([], 80, 40); // 2:1 landscape
    expect(wide.rows).toBeCloseTo(wide.cols / 2, 0);
  });
});

describe("findOrthogonalPath", () => {
  it("finds a direct orthogonal path in open space", () => {
    const grid = buildOccupancyGrid([], 40, 40);
    const path = findOrthogonalPath(grid, { xNorm: 0.1, yNorm: 0.1 }, { xNorm: 0.1, yNorm: 0.9 }, null);
    expect(path).not.toBeNull();
    // Every step must be axis-aligned (real ductwork never moves diagonally).
    for (let i = 1; i < path!.length; i++) {
      const dx = Math.abs(path![i].xNorm - path![i - 1].xNorm);
      const dy = Math.abs(path![i].yNorm - path![i - 1].yNorm);
      expect(dx === 0 || dy === 0).toBe(true);
    }
  });

  it("routes AROUND an obstacle rather than through it", () => {
    const obstacle: NormBox = { xNorm: 0.3, yNorm: 0.1, widthNorm: 0.4, heightNorm: 0.8 };
    const grid = buildOccupancyGrid([obstacle], 40, 40);
    const path = findOrthogonalPath(grid, { xNorm: 0.1, yNorm: 0.5 }, { xNorm: 0.9, yNorm: 0.5 }, null);
    expect(path).not.toBeNull();
    const cutsThroughObstacle = path!.some(
      (p) =>
        p.xNorm > obstacle.xNorm + 0.02 &&
        p.xNorm < obstacle.xNorm + obstacle.widthNorm - 0.02 &&
        p.yNorm > obstacle.yNorm + 0.02 &&
        p.yNorm < obstacle.yNorm + obstacle.heightNorm - 0.02,
    );
    expect(cutsThroughObstacle).toBe(false);
  });

  it("still reaches a goal that is itself an occupied cell (the single-cell goal exemption)", () => {
    // findOrthogonalPath itself only exempts the exact goal CELL, not a
    // whole room it belongs to - clearing a full destination room ahead
    // of time is routeZoneDucts's job (see its own "shares a trunk" test
    // below, which exercises a goal deep inside its own room end to end).
    // Directly flips one cell occupied (rather than sizing an obstacle
    // box to land on exactly one grid cell) to isolate exactly the
    // exemption this function is responsible for.
    const grid = buildOccupancyGrid([], 40, 40);
    const goal: NormPoint = { xNorm: 0.5, yNorm: 0.5 };
    const col = Math.round(goal.xNorm * grid.cols);
    const row = Math.round(goal.yNorm * grid.rows);
    grid.occupied[row][col] = true;
    const path = findOrthogonalPath(grid, { xNorm: 0.1, yNorm: 0.5 }, goal, null);
    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).toEqual(goal);
  });

  it("returns null when the goal is genuinely unreachable (sealed off on all sides)", () => {
    const walls: NormBox[] = [
      { xNorm: 0.39, yNorm: 0.3, widthNorm: 0.02, heightNorm: 0.4 },
      { xNorm: 0.59, yNorm: 0.3, widthNorm: 0.02, heightNorm: 0.4 },
      { xNorm: 0.39, yNorm: 0.29, widthNorm: 0.22, heightNorm: 0.02 },
      { xNorm: 0.39, yNorm: 0.69, widthNorm: 0.22, heightNorm: 0.02 },
    ];
    const grid = buildOccupancyGrid(walls, 40, 40);
    const path = findOrthogonalPath(grid, { xNorm: 0.05, yNorm: 0.05 }, { xNorm: 0.5, yNorm: 0.5 }, null);
    expect(path).toBeNull();
  });
});

describe("simplifyOrthogonalPath", () => {
  it("collapses a straight run of grid steps into two endpoints", () => {
    const points: NormPoint[] = [
      { xNorm: 0, yNorm: 0 },
      { xNorm: 0.1, yNorm: 0 },
      { xNorm: 0.2, yNorm: 0 },
      { xNorm: 0.3, yNorm: 0 },
    ];
    expect(simplifyOrthogonalPath(points)).toEqual([points[0], points[3]]);
  });

  it("keeps a vertex at a real turn", () => {
    const points: NormPoint[] = [
      { xNorm: 0, yNorm: 0 },
      { xNorm: 0.1, yNorm: 0 },
      { xNorm: 0.1, yNorm: 0.1 },
      { xNorm: 0.1, yNorm: 0.2 },
    ];
    const simplified = simplifyOrthogonalPath(points);
    expect(simplified).toEqual([points[0], points[1], points[3]]);
  });
});

describe("classifyUsageCount", () => {
  it("classifies a cell used by every target as trunk", () => {
    expect(classifyUsageCount(5, 5)).toBe("trunk");
  });
  it("classifies a cell used by a minority (but more than one) target as branch", () => {
    expect(classifyUsageCount(2, 10)).toBe("branch");
  });
  it("classifies a cell used by exactly one target as a run-out", () => {
    expect(classifyUsageCount(1, 10)).toBe("runout");
  });
  it("classifies everything as a run-out when there's only one target total", () => {
    expect(classifyUsageCount(1, 1)).toBe("runout");
  });
});

describe("routeZoneDucts - end to end", () => {
  it("routes every target and produces a shared trunk for rooms in the same direction from the AHU", () => {
    // A simple corridor layout: AHU in a utility closet on the left, two
    // bedrooms further right along the same hallway - both should share
    // most of their path before splitting off into their own room.
    const ahuBox: NormBox = { xNorm: 0.05, yNorm: 0.45, widthNorm: 0.1, heightNorm: 0.1 };
    const bedroomA: NormBox = { xNorm: 0.6, yNorm: 0.1, widthNorm: 0.2, heightNorm: 0.2 };
    const bedroomB: NormBox = { xNorm: 0.6, yNorm: 0.7, widthNorm: 0.2, heightNorm: 0.2 };
    const targets = [
      { id: "a", point: { xNorm: 0.7, yNorm: 0.2 } },
      { id: "b", point: { xNorm: 0.7, yNorm: 0.8 } },
    ];
    const targetBoxes = new Map([
      ["a", bedroomA],
      ["b", bedroomB],
    ]);
    const routed = routeZoneDucts(
      { xNorm: 0.1, yNorm: 0.5 },
      ahuBox,
      targets,
      targetBoxes,
      [ahuBox, bedroomA, bedroomB],
      40,
      40,
    );
    expect(routed.paths).toHaveLength(2);
    for (const path of routed.paths) {
      // No diagonal jumps anywhere in the simplified output either.
      for (let i = 1; i < path.points.length; i++) {
        const dx = Math.abs(path.points[i].xNorm - path.points[i - 1].xNorm);
        const dy = Math.abs(path.points[i].yNorm - path.points[i - 1].yNorm);
        expect(dx === 0 || dy === 0).toBe(true);
      }
    }
    // At least one cell was used by both targets - a real shared trunk,
    // not two fully independent parallel paths.
    const sharedCells = [...routed.cellUsage.values()].filter((count) => count >= 2);
    expect(sharedCells.length).toBeGreaterThan(0);
  });

  it("skips a target that is genuinely unreachable instead of fabricating a path", () => {
    // No targetBox is registered for "sealed" below, so routeZoneDucts's
    // clearRegion never runs for it and these walls stay fully intact as
    // obstacles - a real ring fully enclosing the target point with no
    // gap and no overlap with anything that gets cleared.
    const ahuBox: NormBox = { xNorm: 0.05, yNorm: 0.45, widthNorm: 0.1, heightNorm: 0.1 };
    const walls: NormBox[] = [
      { xNorm: 0.39, yNorm: 0.29, widthNorm: 0.22, heightNorm: 0.02 },
      { xNorm: 0.39, yNorm: 0.69, widthNorm: 0.22, heightNorm: 0.02 },
      { xNorm: 0.38, yNorm: 0.3, widthNorm: 0.02, heightNorm: 0.4 },
      { xNorm: 0.6, yNorm: 0.3, widthNorm: 0.02, heightNorm: 0.4 },
    ];
    const targets = [{ id: "sealed", point: { xNorm: 0.5, yNorm: 0.5 } }];
    const routed = routeZoneDucts(
      { xNorm: 0.1, yNorm: 0.5 },
      ahuBox,
      targets,
      new Map(),
      [ahuBox, ...walls],
      40,
      40,
    );
    expect(routed.paths).toHaveLength(0);
  });
});

describe("classifyPathSegments", () => {
  it("assigns classifications consistent with the underlying cell usage", () => {
    const points: NormPoint[] = [
      { xNorm: 0, yNorm: 0.5 },
      { xNorm: 0.5, yNorm: 0.5 },
    ];
    const cellUsage = new Map<string, number>();
    // Every cell along y=0.5 row heavily used (simulate a real trunk).
    const cols = 40;
    const rows = 40;
    const row = Math.round(0.5 * rows);
    for (let col = 0; col <= 20; col++) cellUsage.set(`${col},${row}`, 5);
    const segments = classifyPathSegments(points, cellUsage, cols, rows, 5);
    expect(segments).toHaveLength(1);
    expect(segments[0].cls).toBe("trunk");
  });
});
