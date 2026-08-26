// Real orthogonal, room-avoiding duct routing - built 2026-08-25 to
// replace the previous home-run (straight diagonal AHU-to-register) illustration
// with an actual routed network: trunk down a corridor, branches peeling
// off at right angles, matching real Manual D drafting practice (see the
// 4 reference sheets the user supplied - a Wrightsoft/AutoCAD-style
// diagram with orthogonal trunk-and-branch geometry, not a star pattern).
//
// Pure geometry/graph code, no Supabase or Next.js imports - shared by
// both the live client diagram (components/duct-routing-diagram.tsx) and
// the PDF report (lib/reportHtmlV2.ts via lib/reportData.ts), same
// client/server-boundary convention already used elsewhere in this
// module (see buildLiveDuctRoutingIllustration's own comment below).
//
// Real, disclosed approximation, not fabrication: this app has no true
// wall-vector/corridor-centerline data (extraction only ever produced
// axis-aligned room bounding boxes, not room polygons or door
// locations). Obstacle avoidance here treats each room as an axis-
// aligned rectangle and searches for paths through the open space
// between those rectangles - which is a real, geometrically honest model
// of "the ductwork can't run through this room's interior," genuinely
// different from (and correct where) the previous star-pattern was not,
// even though it isn't a full wall/door-aware CAD routing engine.

export type NormPoint = { xNorm: number; yNorm: number };
export type NormBox = { xNorm: number; yNorm: number; widthNorm: number; heightNorm: number };

// -----------------------------------------------------------------------
// Matching a room's real (tech-confirmed) pin to its AI-extracted
// bounding box by NEAREST POSITION, not name.
// -----------------------------------------------------------------------
//
// Diagnosed 2026-08-25 against real Schneider data: several rooms were
// renamed during field resolution (e.g. "Bedroom 2"/"Bedroom 5" swapped,
// a "Bathroom 3"/"Bathroom 4" off-by-one - see the project memory file
// drawing_reading_technique_playbook.md and this project's own git
// history for the full incident) - the CORRECTED name in the `rooms`
// table no longer matches the name still attached to that room's
// bounding box in the original extraction. Matching by name would
// silently apply the WRONG box to a corrected room. Matching by nearest
// centroid distance instead is robust to exactly this failure mode,
// verified against real Schneider data: every genuinely-corresponding
// box matched at distance 0.000, while a box whose position was itself
// hand-corrected (no longer matching ANY real extracted box) matched
// only at a large distance (~0.25) - clearly distinguishable from a real
// match with the threshold below.
const ROOM_BOX_MATCH_MAX_DISTANCE_NORM = 0.08;

// Used when no extracted box reliably corresponds to a room's real pin
// (either none was extracted, or the nearest one is farther than the
// threshold above - e.g. a hand-corrected position with no matching
// extraction). A synthetic square centered on the room's own real pin -
// clearly an approximation (disclosed here, not silently assumed
// elsewhere), but still lets routing treat the room as SOME real
// obstacle rather than either crashing or, worse, silently treating it
// as open space a duct could cut through.
const FALLBACK_ROOM_BOX_HALF_SIZE_NORM = 0.045;

export function matchRoomBoxByPosition(
  pin: NormPoint,
  candidates: NormBox[],
): NormBox | null {
  let best: NormBox | null = null;
  let bestDistance = Infinity;
  for (const box of candidates) {
    const cx = box.xNorm + box.widthNorm / 2;
    const cy = box.yNorm + box.heightNorm / 2;
    const distance = Math.hypot(cx - pin.xNorm, cy - pin.yNorm);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = box;
    }
  }
  if (best == null || bestDistance > ROOM_BOX_MATCH_MAX_DISTANCE_NORM) return null;
  return best;
}

export function fallbackRoomBox(pin: NormPoint): NormBox {
  return {
    xNorm: pin.xNorm - FALLBACK_ROOM_BOX_HALF_SIZE_NORM,
    yNorm: pin.yNorm - FALLBACK_ROOM_BOX_HALF_SIZE_NORM,
    widthNorm: FALLBACK_ROOM_BOX_HALF_SIZE_NORM * 2,
    heightNorm: FALLBACK_ROOM_BOX_HALF_SIZE_NORM * 2,
  };
}

// -----------------------------------------------------------------------
// Occupancy grid + orthogonal A* pathfinding
// -----------------------------------------------------------------------
//
// The grid is built in NORMALIZED page space but with row/column counts
// scaled to the sheet's real aspect ratio (from pageWidthFt/pageHeightFt,
// already derived elsewhere via lib/ductRouting.ts's derivePageScale/
// pageScaleFromArchitecturalScale) so a grid "step" is roughly the same
// real-world distance in both directions - without this, a landscape
// sheet's routing would be biased toward needless horizontal zig-zag or
// vertical stretching relative to true distance.
const GRID_COLUMNS = 160;

export type RoutingGrid = {
  cols: number;
  rows: number;
  // true = blocked (inside some room's box, with a small margin so a
  // route can still hug just outside a wall). Indexed [row][col].
  occupied: boolean[][];
};

function insetBox(box: NormBox, insetNorm: number): NormBox {
  return {
    xNorm: box.xNorm + insetNorm,
    yNorm: box.yNorm + insetNorm,
    widthNorm: Math.max(0, box.widthNorm - insetNorm * 2),
    heightNorm: Math.max(0, box.heightNorm - insetNorm * 2),
  };
}

export function buildOccupancyGrid(
  obstacles: NormBox[],
  pageWidthFt: number,
  pageHeightFt: number,
): RoutingGrid {
  const cols = GRID_COLUMNS;
  const rows = Math.max(8, Math.round(GRID_COLUMNS * (pageHeightFt / pageWidthFt)));
  const occupied: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
  // Half a grid cell of clearance so a corridor-hugging route isn't
  // blocked by its own destination room's wall line sitting exactly on a
  // cell boundary.
  const insetNorm = (0.5 / cols) * 1.4;
  for (const raw of obstacles) {
    const box = insetBox(raw, insetNorm);
    if (box.widthNorm <= 0 || box.heightNorm <= 0) continue;
    const c0 = Math.max(0, Math.floor(box.xNorm * cols));
    const c1 = Math.min(cols - 1, Math.ceil((box.xNorm + box.widthNorm) * cols));
    const r0 = Math.max(0, Math.floor(box.yNorm * rows));
    const r1 = Math.min(rows - 1, Math.ceil((box.yNorm + box.heightNorm) * rows));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        occupied[r][c] = true;
      }
    }
  }
  return { cols, rows, occupied };
}

function clearRegion(grid: RoutingGrid, box: NormBox) {
  const c0 = Math.max(0, Math.floor(box.xNorm * grid.cols));
  const c1 = Math.min(grid.cols - 1, Math.ceil((box.xNorm + box.widthNorm) * grid.cols));
  const r0 = Math.max(0, Math.floor(box.yNorm * grid.rows));
  const r1 = Math.min(grid.rows - 1, Math.ceil((box.yNorm + box.heightNorm) * grid.rows));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      grid.occupied[r][c] = false;
    }
  }
}

export type GridPoint = { col: number; row: number };

function toGridPoint(p: NormPoint, grid: RoutingGrid): GridPoint {
  return {
    col: Math.min(grid.cols - 1, Math.max(0, Math.round(p.xNorm * grid.cols))),
    row: Math.min(grid.rows - 1, Math.max(0, Math.round(p.yNorm * grid.rows))),
  };
}

function toNormPoint(p: GridPoint, grid: RoutingGrid): NormPoint {
  return { xNorm: p.col / grid.cols, yNorm: p.row / grid.rows };
}

// Orthogonal (4-directional) A*, biased toward straight runs (a turn
// penalty) and toward reusing cells earlier branches already used (a
// reuse discount) so independently-shortest-pathed rooms naturally
// converge onto a shared trunk instead of each carving its own parallel
// corridor one cell over - the same practical heuristic real duct
// designers use (route new branches off the existing trunk rather than
// re-running a parallel main).
const TURN_PENALTY = 3;
const REUSE_DISCOUNT = 0.35;

type PathNode = { p: GridPoint; dir: number; g: number; f: number; parentKey: string | null };

// Real binary min-heap keyed by f-score, with lazy deletion (a cheaper,
// standard alternative to true decrease-key: pushing an improved node
// again rather than mutating its old heap position, and skipping a
// popped entry whose g no longer matches the current best known g for
// that key - see the staleness check where this is used below).
// Diagnosed 2026-08-26 via a real test timeout under full-suite load:
// the previous open set was a plain Map scanned linearly every
// iteration to find the minimum f, making the whole search O(n^2) - for
// a genuinely unreachable target (the exact case that has to explore
// nearly the full grid before concluding no path exists) that blew past
// a 5s test timeout. This is O(log n) per push/pop instead.
class MinHeap {
  private items: { f: number; key: string; node: PathNode }[] = [];

  push(entry: { f: number; key: string; node: PathNode }) {
    this.items.push(entry);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].f <= this.items[i].f) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop(): { f: number; key: string; node: PathNode } | undefined {
    const top = this.items[0];
    if (top == null) return undefined;
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      const n = this.items.length;
      for (;;) {
        const left = i * 2 + 1;
        const right = i * 2 + 2;
        let smallest = i;
        if (left < n && this.items[left].f < this.items[smallest].f) smallest = left;
        if (right < n && this.items[right].f < this.items[smallest].f) smallest = right;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
        i = smallest;
      }
    }
    return top;
  }

  get size() {
    return this.items.length;
  }
}

export function findOrthogonalPath(
  grid: RoutingGrid,
  startPoint: NormPoint,
  goalPoint: NormPoint,
  reusedCells: Set<string> | null,
): NormPoint[] | null {
  const start = toGridPoint(startPoint, grid);
  const goal = toGridPoint(goalPoint, grid);
  const key = (p: GridPoint) => `${p.col},${p.row}`;
  // The start cell is never occupancy-checked (expansion always begins
  // from it regardless), and the neighbor-expansion loop below explicitly
  // allows stepping onto the goal cell even if it's occupied (`!isGoal`) -
  // so a start/goal that happens to sit on a nominally "occupied" cell
  // (can happen right at grid-resolution boundaries) still works without
  // needing its own special-case here.

  const heuristic = (p: GridPoint) => Math.abs(p.col - goal.col) + Math.abs(p.row - goal.row);
  const dirs: Array<{ dc: number; dr: number }> = [
    { dc: 1, dr: 0 },
    { dc: -1, dr: 0 },
    { dc: 0, dr: 1 },
    { dc: 0, dr: -1 },
  ];

  const heap = new MinHeap();
  const closed = new Set<string>();
  const nodeByKey = new Map<string, PathNode>();
  const startNode: PathNode = { p: start, dir: -1, g: 0, f: heuristic(start), parentKey: null };
  const startKey = `${key(start)}|-1`;
  nodeByKey.set(startKey, startNode);
  heap.push({ f: startNode.f, key: startKey, node: startNode });

  let iterations = 0;
  const MAX_ITERATIONS = grid.cols * grid.rows * 4;

  while (heap.size > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    const popped = heap.pop();
    if (!popped) break;
    const { key: currentKey, node: current } = popped;
    if (closed.has(currentKey)) continue;
    // A stale heap entry: a better g for this same key was found and
    // pushed again after this entry, so this one is outdated - skip it
    // rather than reprocessing (the lazy-deletion half of this scheme).
    const best = nodeByKey.get(currentKey);
    if (best && best.g < current.g) continue;
    closed.add(currentKey);

    if (current.p.col === goal.col && current.p.row === goal.row) {
      const path: GridPoint[] = [];
      let cursor: PathNode | null = current;
      while (cursor) {
        path.push(cursor.p);
        cursor = cursor.parentKey ? nodeByKey.get(cursor.parentKey) ?? null : null;
      }
      path.reverse();
      return path.map((p) => toNormPoint(p, grid));
    }

    for (let dirIndex = 0; dirIndex < dirs.length; dirIndex++) {
      const { dc, dr } = dirs[dirIndex];
      const next: GridPoint = { col: current.p.col + dc, row: current.p.row + dr };
      if (next.col < 0 || next.col >= grid.cols || next.row < 0 || next.row >= grid.rows) continue;
      const isGoal = next.col === goal.col && next.row === goal.row;
      const isStart = next.col === start.col && next.row === start.row;
      if (grid.occupied[next.row][next.col] && !isGoal && !isStart) continue;

      const nextKey = `${key(next)}|${dirIndex}`;
      if (closed.has(nextKey)) continue;

      let stepCost = 1;
      if (current.dir !== -1 && current.dir !== dirIndex) stepCost += TURN_PENALTY;
      if (reusedCells?.has(key(next))) stepCost *= REUSE_DISCOUNT;

      const g = current.g + stepCost;
      const existing = nodeByKey.get(nextKey);
      if (existing && existing.g <= g) continue;

      const node: PathNode = { p: next, dir: dirIndex, g, f: g + heuristic(next), parentKey: currentKey };
      nodeByKey.set(nextKey, node);
      heap.push({ f: node.f, key: nextKey, node });
    }
  }
  return null;
}

// Collapses consecutive collinear points into a single segment -
// converts a raw grid-step path (one point per cell) into a real
// polyline with only as many vertices as there are actual turns.
export function simplifyOrthogonalPath(points: NormPoint[]): NormPoint[] {
  if (points.length <= 2) return points;
  const result: NormPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    const sameXDirection = Math.sign(curr.xNorm - prev.xNorm) === Math.sign(next.xNorm - curr.xNorm);
    const sameYDirection = Math.sign(curr.yNorm - prev.yNorm) === Math.sign(next.yNorm - curr.yNorm);
    const isVerticalRun = curr.xNorm === prev.xNorm && next.xNorm === curr.xNorm;
    const isHorizontalRun = curr.yNorm === prev.yNorm && next.yNorm === curr.yNorm;
    if ((isVerticalRun && sameYDirection) || (isHorizontalRun && sameXDirection)) {
      continue; // curr is a mid-run point, not a real turn - drop it
    }
    result.push(curr);
  }
  result.push(points[points.length - 1]);
  return result;
}

// -----------------------------------------------------------------------
// Zone-wide routing: one path per room, sharing a trunk where their
// paths naturally overlap.
// -----------------------------------------------------------------------

export type RoutingTarget = { id: string; point: NormPoint };

export type RoutedZonePath = {
  targetId: string;
  points: NormPoint[]; // simplified polyline, AHU -> register
};

export type RoutedZone = {
  paths: RoutedZonePath[];
  // How many different targets' paths use each grid cell - the basis for
  // trunk/branch/run-out line-weight classification at render time.
  cellUsage: Map<string, number>;
  cols: number;
  rows: number;
};

// Room boxes for every room actually on the sheet (not just the ones
// this zone serves) are real obstacles regardless of which zone they
// belong to - a duct physically cannot cut through another zone's room
// either.
export function routeZoneDucts(
  ahuPoint: NormPoint,
  ahuOwnBox: NormBox,
  targets: RoutingTarget[],
  targetBoxes: Map<string, NormBox>,
  allObstacles: NormBox[],
  pageWidthFt: number,
  pageHeightFt: number,
): RoutedZone {
  const baseGrid = buildOccupancyGrid(allObstacles, pageWidthFt, pageHeightFt);

  // Longer real-distance runs first - lets the "spine" of the network get
  // laid down before shorter branches, which then naturally discount
  // onto it via the reuse bias instead of the spine discounting onto a
  // short branch that happened to be computed first.
  const ordered = [...targets].sort((a, b) => {
    const da = Math.hypot(a.point.xNorm - ahuPoint.xNorm, a.point.yNorm - ahuPoint.yNorm);
    const db = Math.hypot(b.point.xNorm - ahuPoint.xNorm, b.point.yNorm - ahuPoint.yNorm);
    return db - da;
  });

  const cellKey = (p: NormPoint) => {
    const col = Math.min(baseGrid.cols - 1, Math.max(0, Math.round(p.xNorm * baseGrid.cols)));
    const row = Math.min(baseGrid.rows - 1, Math.max(0, Math.round(p.yNorm * baseGrid.rows)));
    return `${col},${row}`;
  };

  const reusedCells = new Set<string>();
  const cellUsage = new Map<string, number>();
  const paths: RoutedZonePath[] = [];

  for (const target of ordered) {
    const grid = buildOccupancyGrid(allObstacles, pageWidthFt, pageHeightFt);
    clearRegion(grid, ahuOwnBox);
    const targetBox = targetBoxes.get(target.id);
    if (targetBox) clearRegion(grid, targetBox);

    const raw = findOrthogonalPath(grid, ahuPoint, target.point, reusedCells);
    if (!raw) continue; // genuinely unreachable at this grid resolution - skipped, not faked

    for (const p of raw) {
      const k = cellKey(p);
      reusedCells.add(k);
      cellUsage.set(k, (cellUsage.get(k) ?? 0) + 1);
    }
    paths.push({ targetId: target.id, points: simplifyOrthogonalPath(raw) });
  }

  return { paths, cellUsage, cols: baseGrid.cols, rows: baseGrid.rows };
}

// -----------------------------------------------------------------------
// Classifying each rendered segment as trunk / branch / run-out, based on
// how many targets' raw paths actually used the grid cells it spans -
// this is what gives the diagram real line-weight hierarchy instead of
// uniform strokes.
// -----------------------------------------------------------------------

export type SegmentClass = "trunk" | "branch" | "runout";

export function classifyUsageCount(count: number, totalTargets: number): SegmentClass {
  if (totalTargets <= 1) return "runout";
  if (count >= Math.max(3, Math.ceil(totalTargets * 0.5))) return "trunk";
  if (count >= 2) return "branch";
  return "runout";
}

// Splits a simplified polyline into per-segment classifications by
// sampling the underlying grid usage at each segment's midpoint (a
// simplified segment is, by construction, a single straight run where
// usage-count classification is constant along its length in the
// overwhelming majority of real cases - see simplifyOrthogonalPath).
export type ClassifiedSegment = {
  from: NormPoint;
  to: NormPoint;
  cls: SegmentClass;
};

export function classifyPathSegments(
  points: NormPoint[],
  cellUsage: Map<string, number>,
  cols: number,
  rows: number,
  totalTargets: number,
): ClassifiedSegment[] {
  const segments: ClassifiedSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const midX = (from.xNorm + to.xNorm) / 2;
    const midY = (from.yNorm + to.yNorm) / 2;
    const col = Math.min(cols - 1, Math.max(0, Math.round(midX * cols)));
    const row = Math.min(rows - 1, Math.max(0, Math.round(midY * rows)));
    const count = cellUsage.get(`${col},${row}`) ?? 1;
    segments.push({ from, to, cls: classifyUsageCount(count, totalTargets) });
  }
  return segments;
}
