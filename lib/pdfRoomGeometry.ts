// Recovers TRUE room geometry from a CAD-exported PDF floor-plan page,
// instead of asking a vision model to eyeball a bounding box.
//
// Diagnosed 2026-08-31 against Schneider: the plan sheets carry no text
// layer for room labels or dimensions (all outlined vector geometry), so
// every room name and position was an OCR / visual estimate - room names
// came out wrong ("BEDROOM #2" stored as "Bedroom 3", "HALLWAY" as
// "WALLHALL") and positions/shapes were axis-aligned bounding boxes whose
// centre is not inside an L-shaped room. But the page IS a vector export:
// ~11,600 real path constructions, ~40,000 line segments, in a coordinate
// system that maps exactly to lib/floorPlanRender.ts's 96px/72pt render.
// This module parses that geometry, isolates the wall lines, and
// flood-fills each room into a real polygon.
//
// Server-only: pulls in pdfjs and does heavy raster compute. Never import
// from a "use client" module.
//
// STATUS (2026-08-31): first working pass. Not yet wired into the
// extraction pipeline or the diagram. Verified against Schneider A3.0:
//   - parsePageSegments: exact - 40,046 segments, 1:1 with the real
//     Chromium render (lib/floorPlanRender.ts). Solid.
//   - classifyWallSegments / connected-component barrier: good. Drops
//     furniture, fixtures, text, dimension marks.
//   - bridgeDoorGaps + flood fill + regionToPolygon + poleOfInaccessibility:
//     ~10-11 of 15 rooms reconstruct as correct polygons with an
//     inside pin, INCLUDING the L-shaped garage (which a bounding box
//     can never represent). Known remaining gaps:
//       * open-plan spaces (kitchen open to hallway/living with no
//         wall between) flood-merge - genuinely one connected space;
//         needs a "great room" grouping or a soft cabinet-line
//         boundary.
//       * tiny rooms (pantry, stair landing) whose seed lands on a
//         shelf/tread line trap the fill - needs the real label
//         centroid as the seed + a wider nearest-open-cell search.
//   - seeds are hand-picked in the harness. Production needs
//     findTextLabelAnchors (cluster the vector glyph geometry -> each
//     room label's centroid, guaranteed inside its room) which also
//     feeds the Bug 1 name re-read.
// Next: label-anchor extraction, then wiring (schema rooms.polygon,
// extract route, ductPathGeometry polygon obstacle, ductRouting seed
// from pin, renderers, computeSheetCropViewBox from polygon extents).
import { createRequire } from "node:module";

// pdfjs-dist ships an ESM build; load it through require.resolve so the
// exact legacy entry resolves the same way in dev and on the server
// bundle (this matches lib/pdfTextExtraction.ts's own approach).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsPromise: Promise<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    const req = createRequire(import.meta.url);
    pdfjsPromise = import(req.resolve("pdfjs-dist/legacy/build/pdf.mjs"));
  }
  return pdfjsPromise;
}

// A single straight line segment in normalized [0,1] page space, with the
// stroke width (in device px at the page's own render scale) and the
// greyscale value of its stroke colour (0 = black wall, ~0.64 = the grey
// Schneider uses for some fixtures/furniture).
export type NormSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  widthPx: number;
  gray: number;
};

export type ParsedPage = {
  segments: NormSegment[];
  widthPt: number;
  heightPt: number;
  /** device px the page renders at (matches lib/floorPlanRender.ts). */
  renderWidthPx: number;
  renderHeightPx: number;
};

const PDF_VIEWER_DPI = 96;

type Mat = [number, number, number, number, number, number];
const matMul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const matApply = (m: Mat, x: number, y: number): [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

// Parse every stroked/filled path on one page into flat line segments,
// in normalized [0,1] page space (page rotation already applied, so this
// lines up 1:1 with the rendered PNG). Bezier curves are flattened to
// their endpoint chord - fine for wall/room reconstruction, which only
// cares about straight partition lines.
export async function parsePageSegments(pdfBuffer: Buffer, pageNumber: number): Promise<ParsedPage> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 }); // rotation-applied
    const widthPt = viewport.width;
    const heightPt = viewport.height;
    const renderWidthPx = Math.round((widthPt / 72) * PDF_VIEWER_DPI);
    const renderHeightPx = Math.round((heightPt / 72) * PDF_VIEWER_DPI);

    const ops = await page.getOperatorList();
    const OPS = pdfjs.OPS;

    let ctm: Mat = [...(viewport.transform as Mat)];
    const stack: Mat[] = [];
    let lineWidth = 1;
    let strokeGray = 0;

    const rawSegs: { p: [number, number][]; w: number; gray: number }[] = [];

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === OPS.save) {
        stack.push([...ctm]);
      } else if (fn === OPS.restore) {
        ctm = stack.pop() ?? ctm;
      } else if (fn === OPS.transform) {
        ctm = matMul(ctm, args as Mat);
      } else if (fn === OPS.setLineWidth) {
        lineWidth = args[0] as number;
      } else if (fn === OPS.setStrokeRGBColor) {
        // args is a CSS colour string like "#a3a3a3"
        const hex = String(args[0]).replace("#", "");
        if (hex.length === 6) {
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          strokeGray = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        }
      } else if (fn === OPS.constructPath) {
        // args: [ paintOp:number, packedSubpaths: Array<{[i]:number}>, minMax:Float32Array ]
        const packedList = args[1] as Array<Record<number, number>>;
        // effective device-space stroke width for this path
        const scale = Math.hypot(ctm[0], ctm[1]);
        const widthPx = Math.max(0.1, lineWidth * scale);
        for (const packed of packedList) {
          const keys = Object.keys(packed).map(Number).sort((a, b) => a - b);
          const buf = keys.map((k) => packed[k]);
          let j = 0;
          let cur: [number, number] | null = null;
          let start: [number, number] | null = null;
          const pts: [number, number][] = [];
          while (j < buf.length) {
            const cmd = buf[j++];
            if (cmd === 0) {
              // moveTo -> new subpath; flush the current run
              if (pts.length >= 2) rawSegs.push({ p: [...pts], w: widthPx, gray: strokeGray });
              pts.length = 0;
              cur = matApply(ctm, buf[j], buf[j + 1]);
              j += 2;
              start = cur;
              pts.push(cur);
            } else if (cmd === 1) {
              cur = matApply(ctm, buf[j], buf[j + 1]);
              j += 2;
              pts.push(cur);
            } else if (cmd === 2) {
              // bezier: 2 control points + endpoint; take endpoint only
              j += 4;
              cur = matApply(ctm, buf[j], buf[j + 1]);
              j += 2;
              pts.push(cur);
            } else if (cmd === 3) {
              if (start) pts.push(start);
              cur = start;
            } else {
              j++; // unknown token - skip one value defensively
            }
          }
          if (pts.length >= 2) rawSegs.push({ p: [...pts], w: widthPx, gray: strokeGray });
        }
      }
    }

    // Explode polylines to individual segments, normalize to [0,1].
    const segments: NormSegment[] = [];
    for (const { p, w, gray } of rawSegs) {
      for (let k = 0; k + 1 < p.length; k++) {
        const [ax, ay] = p[k];
        const [bx, by] = p[k + 1];
        segments.push({
          x1: ax / widthPt,
          y1: ay / heightPt,
          x2: bx / widthPt,
          y2: by / heightPt,
          widthPx: w,
          gray,
        });
      }
    }

    return { segments, widthPt, heightPt, renderWidthPx, renderHeightPx };
  } finally {
    await doc.destroy();
  }
}

// -----------------------------------------------------------------------
// Wall isolation
// -----------------------------------------------------------------------

export type WallClassifyOptions = {
  /** stroke greyscale at/above this is treated as non-structural (grey
   *  fixtures, furniture, light hatching) and dropped. Schneider draws
   *  walls pure black and uses ~0.64 grey elsewhere. */
  maxGray?: number;
  /** shortest segment (fraction of page diagonal) kept as a wall. Filters
   *  glyph strokes, dimension ticks, hatch dashes. */
  minLenFrac?: number;
};

const PAGE_DIAG = Math.SQRT2;

// Keep only segments that plausibly belong to the wall network: dark,
// long enough, and axis-aligned OR clearly part of a longer straight run.
// Non-orthogonal walls (angled bays) survive via the collinear-run test.
export function classifyWallSegments(segments: NormSegment[], opts: WallClassifyOptions = {}): NormSegment[] {
  const maxGray = opts.maxGray ?? 0.4;
  const minLen = (opts.minLenFrac ?? 0.012) * PAGE_DIAG;

  const dark = segments.filter((s) => s.gray <= maxGray);

  // Index dark segments by orientation + offset so we can measure how
  // much total collinear length each one participates in.
  const byLine = new Map<string, NormSegment[]>();
  const lineKey = (s: NormSegment) => {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const ang = Math.atan2(dy, dx);
    // fold to [0, PI) so a segment and its reverse share a key
    const a = ((ang % Math.PI) + Math.PI) % Math.PI;
    const aBucket = Math.round(a / (Math.PI / 180)); // 1-degree buckets
    // perpendicular distance of the line from origin
    const len = Math.hypot(dx, dy) || 1e-9;
    const nx = -dy / len;
    const ny = dx / len;
    const off = Math.round((s.x1 * nx + s.y1 * ny) / 0.004); // ~0.4% page buckets
    return `${aBucket}:${off}`;
  };
  for (const s of dark) {
    const k = lineKey(s);
    const arr = byLine.get(k);
    if (arr) arr.push(s);
    else byLine.set(k, [s]);
  }

  const kept: NormSegment[] = [];
  for (const s of dark) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const dx = Math.abs(s.x2 - s.x1);
    const dy = Math.abs(s.y2 - s.y1);
    const axisAligned = dx < 0.0025 || dy < 0.0025;
    const collinearTotal = (byLine.get(lineKey(s)) ?? []).reduce(
      (sum, o) => sum + Math.hypot(o.x2 - o.x1, o.y2 - o.y1),
      0,
    );
    if (len >= minLen && (axisAligned || collinearTotal >= minLen * 3)) {
      kept.push(s);
    }
  }
  return kept;
}

// -----------------------------------------------------------------------
// Room reconstruction by flood fill
// -----------------------------------------------------------------------

export type ReconstructedRoom = {
  /** closed polygon, [x_norm, y_norm] verts (page space). */
  polygon: [number, number][];
  /** a point guaranteed inside the polygon (pole of inaccessibility) -
   *  what a pin should snap to. */
  pin: [number, number];
  /** filled area as a fraction of the whole page. */
  areaFrac: number;
  /** true if the fill escaped its room (hit the area cap) - do not trust. */
  leaked: boolean;
};

export type ReconstructOptions = {
  /** raster cell size in device px. Smaller = more faithful, slower. */
  cellPx?: number;
  /** wall lines are thickened by this many cells before filling, to close
   *  doorway gaps so a fill doesn't leak room-to-room. */
  wallDilateCells?: number;
  /** a fill covering more than this fraction of the page is treated as
   *  leaked. */
  leakAreaFrac?: number;
  /** connected components smaller than this fraction of the page are
   *  dropped as furniture/fixtures/text before flood fill. */
  componentMinFrac?: number;
};

type Grid = { w: number; h: number; blocked: Uint8Array; cellPx: number; pageW: number; pageH: number };

function dilateMask(mask: Uint8Array, w: number, h: number, cells: number): Uint8Array {
  let cur = mask;
  for (let d = 0; d < cells; d++) {
    const next = cur.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!cur[y * w + x]) continue;
        if (x > 0) next[y * w + x - 1] = 1;
        if (x < w - 1) next[y * w + x + 1] = 1;
        if (y > 0) next[(y - 1) * w + x] = 1;
        if (y < h - 1) next[(y + 1) * w + x] = 1;
      }
    }
    cur = next;
  }
  return cur;
}

function erodeMask(mask: Uint8Array, w: number, h: number, cells: number): Uint8Array {
  let cur = mask;
  for (let d = 0; d < cells; d++) {
    const next = cur.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!cur[y * w + x]) continue;
        if (
          (x > 0 && !cur[y * w + x - 1]) ||
          (x < w - 1 && !cur[y * w + x + 1]) ||
          (y > 0 && !cur[(y - 1) * w + x]) ||
          (y < h - 1 && !cur[(y + 1) * w + x]) ||
          x === 0 ||
          x === w - 1 ||
          y === 0 ||
          y === h - 1
        ) {
          next[y * w + x] = 0;
        }
      }
    }
    cur = next;
  }
  return cur;
}

// Keep only "wall-like" connected components of a black-pixel mask: the
// wall network is one huge connected component; furniture, fixtures,
// text, and dimension marks are small isolated blobs. Anything smaller
// than minFrac of the total pixel count is dropped.
function keepLargeComponents(mask: Uint8Array, w: number, h: number, minFrac: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const seen = new Uint8Array(w * h);
  const minCount = Math.floor(w * h * minFrac);
  const stackX = new Int32Array(w * h);
  const stackY = new Int32Array(w * h);
  for (let y0 = 0; y0 < h; y0++) {
    for (let x0 = 0; x0 < w; x0++) {
      const i0 = y0 * w + x0;
      if (!mask[i0] || seen[i0]) continue;
      let top = 0;
      stackX[top] = x0;
      stackY[top] = y0;
      top++;
      seen[i0] = 1;
      const cells: number[] = [];
      while (top > 0) {
        top--;
        const x = stackX[top];
        const y = stackY[top];
        cells.push(y * w + x);
        const nb = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ];
        for (const [nx, ny] of nb) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (mask[ni] && !seen[ni]) {
            seen[ni] = 1;
            stackX[top] = nx;
            stackY[top] = ny;
            top++;
          }
        }
      }
      if (cells.length >= minCount) {
        for (const c of cells) out[c] = 1;
      }
    }
  }
  return out;
}

// Bridge doorway gaps SURGICALLY, not with a blind morphological close:
// a door is a short break in an otherwise-continuous wall line, so it
// shows up as two near-collinear segment endpoints a door-width apart
// with clear space between them. Emit a synthetic segment spanning only
// that gap. This does not weld parallel room-dividing walls together the
// way a big close radius does.
function bridgeDoorGaps(segs: NormSegment[], gapMinFrac: number, gapMaxFrac: number): NormSegment[] {
  const bridges: NormSegment[] = [];
  // Only axis-aligned segments participate (the overwhelming majority of
  // interior walls); an angled wall's door is rare and can stay a nudge.
  const horiz: NormSegment[] = [];
  const vert: NormSegment[] = [];
  for (const s of segs) {
    const dx = Math.abs(s.x2 - s.x1);
    const dy = Math.abs(s.y2 - s.y1);
    if (dy < 0.0015 && dx > 0.01) horiz.push(s);
    else if (dx < 0.0015 && dy > 0.01) vert.push(s);
  }
  const tryAxis = (list: NormSegment[], axis: "h" | "v") => {
    // group by the shared (constant) coordinate, bucketed
    const groups = new Map<number, { lo: number; hi: number; c: number }[]>();
    for (const s of list) {
      const cst = axis === "h" ? (s.y1 + s.y2) / 2 : (s.x1 + s.x2) / 2;
      const key = Math.round(cst / 0.003);
      const lo = axis === "h" ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2);
      const hi = axis === "h" ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2);
      const arr = groups.get(key) ?? [];
      arr.push({ lo, hi, c: cst });
      groups.set(key, arr);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => a.lo - b.lo);
      for (let i = 0; i + 1 < arr.length; i++) {
        const gap = arr[i + 1].lo - arr[i].hi;
        if (gap >= gapMinFrac && gap <= gapMaxFrac) {
          const c = (arr[i].c + arr[i + 1].c) / 2;
          if (axis === "h") {
            bridges.push({ x1: arr[i].hi, y1: c, x2: arr[i + 1].lo, y2: c, widthPx: 2, gray: 0 });
          } else {
            bridges.push({ x1: c, y1: arr[i].hi, x2: c, y2: arr[i + 1].lo, widthPx: 2, gray: 0 });
          }
        }
      }
    }
  };
  tryAxis(horiz, "h");
  tryAxis(vert, "v");
  return bridges;
}

// Build the flood-fill barrier grid from ALL dark geometry:
//  1. rasterize every dark segment to a black-pixel mask
//  2. keep only large connected components (the wall network) - drops
//     furniture / fixtures / text / dimension marks
//  3. bridge doorway gaps surgically (see bridgeDoorGaps)
//  4. a light morphological close only for 1px hairline breaks
function buildBarrierGrid(
  parsed: ParsedPage,
  darkSegments: NormSegment[],
  cellPx: number,
  closeCells: number,
  componentMinFrac: number,
): Grid {
  const rw = parsed.renderWidthPx;
  const rh = parsed.renderHeightPx;
  const w = Math.max(1, Math.ceil(rw / cellPx));
  const h = Math.max(1, Math.ceil(rh / cellPx));
  const rasterInto = (mask: Uint8Array, list: NormSegment[]) => {
    for (const s of list) {
      const ax = (s.x1 * rw) / cellPx;
      const ay = (s.y1 * rh) / cellPx;
      const bx = (s.x2 * rw) / cellPx;
      const by = (s.y2 * rh) / cellPx;
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const gx = Math.round(ax + (bx - ax) * t);
        const gy = Math.round(ay + (by - ay) * t);
        if (gx >= 0 && gy >= 0 && gx < w && gy < h) mask[gy * w + gx] = 1;
      }
    }
  };

  const raw = new Uint8Array(w * h);
  rasterInto(raw, darkSegments);
  const network = keepLargeComponents(raw, w, h, componentMinFrac);

  // door bridging is measured against the network segments (not raw) so
  // furniture edges can't create phantom "wall gaps"
  const netSegs = darkSegments.filter((s) => {
    const gx = Math.round((((s.x1 + s.x2) / 2) * rw) / cellPx);
    const gy = Math.round((((s.y1 + s.y2) / 2) * rh) / cellPx);
    return gx >= 0 && gy >= 0 && gx < w && gy < h && network[gy * w + gx] === 1;
  });
  const bridges = bridgeDoorGaps(netSegs, 0.006, 0.02);

  const barrier = network.slice();
  rasterInto(barrier, bridges);
  const closed = closeCells > 0 ? erodeMask(dilateMask(barrier, w, h, closeCells), w, h, closeCells) : barrier;
  for (let i = 0; i < w * h; i++) if (barrier[i]) closed[i] = 1;
  return { w, h, blocked: closed, cellPx, pageW: rw, pageH: rh };
}

function nearestOpenCell(grid: Grid, gx: number, gy: number, maxR = 24): [number, number] | null {
  if (gx >= 0 && gy >= 0 && gx < grid.w && gy < grid.h && !grid.blocked[gy * grid.w + gx]) return [gx, gy];
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = gx + dx;
        const y = gy + dy;
        if (x >= 0 && y >= 0 && x < grid.w && y < grid.h && !grid.blocked[y * grid.w + x]) return [x, y];
      }
    }
  }
  return null;
}

function floodFrom(grid: Grid, sx: number, sy: number, leakCells: number): { region: Uint8Array; count: number; leaked: boolean } {
  const { w, h, blocked } = grid;
  const region = new Uint8Array(w * h);
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  qx[tail] = sx;
  qy[tail] = sy;
  tail++;
  region[sy * w + sx] = 1;
  let count = 0;
  let leaked = false;
  while (head < tail) {
    const x = qx[head];
    const y = qy[head];
    head++;
    count++;
    if (count > leakCells) {
      leaked = true;
      break;
    }
    const push = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
      const idx = ny * w + nx;
      if (region[idx] || blocked[idx]) return;
      region[idx] = 1;
      qx[tail] = nx;
      qy[tail] = ny;
      tail++;
    };
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return { region, count, leaked };
}

// Marching-squares contour of a filled region -> a single outer polygon
// (largest ring), simplified. Coordinates returned in normalized page
// space.
function regionToPolygon(region: Uint8Array, grid: Grid): [number, number][] {
  const { w, h, cellPx, pageW, pageH } = grid;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && region[y * w + x] === 1;

  // find a boundary start cell
  let sx = -1;
  let sy = -1;
  for (let y = 0; y < h && sy < 0; y++) {
    for (let x = 0; x < w; x++) {
      if (inside(x, y)) {
        sx = x;
        sy = y;
        break;
      }
    }
  }
  if (sx < 0) return [];

  // Moore-neighbour boundary trace on the cell grid
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  const path: [number, number][] = [];
  let cx = sx;
  let cy = sy;
  let dir = 3; // came from "up"
  const maxSteps = w * h * 4;
  let steps = 0;
  do {
    path.push([cx, cy]);
    let found = false;
    for (let i = 0; i < 4; i++) {
      const nd = (dir + 3 + i) % 4; // start turning left
      const nx = cx + dirs[nd][0];
      const ny = cy + dirs[nd][1];
      if (inside(nx, ny)) {
        cx = nx;
        cy = ny;
        dir = nd;
        found = true;
        break;
      }
    }
    if (!found) break;
    steps++;
  } while ((cx !== sx || cy !== sy) && steps < maxSteps);

  // cell coords -> normalized page coords (+0.5 to hit cell centre)
  const norm: [number, number][] = path.map(([x, y]) => [
    ((x + 0.5) * cellPx) / pageW,
    ((y + 0.5) * cellPx) / pageH,
  ]);
  return simplifyPolygon(norm, 0.004);
}

// Ramer-Douglas-Peucker on a closed ring.
function simplifyPolygon(pts: [number, number][], epsilon: number): [number, number][] {
  if (pts.length < 4) return pts;
  const rdp = (a: number, b: number, keep: boolean[]) => {
    let maxD = 0;
    let idx = -1;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const d = pointLineDist(px, py, ax, ay, bx, by);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > epsilon && idx > 0) {
      keep[idx] = true;
      rdp(a, idx, keep);
      rdp(idx, b, keep);
    }
  };
  const keep = new Array(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  rdp(0, pts.length - 1, keep);
  return pts.filter((_, i) => keep[i]);
}

function pointLineDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Pole of inaccessibility: the interior point furthest from any edge.
// Grid search then refine - good enough for a pin, no external dep.
function poleOfInaccessibility(polygon: [number, number][]): [number, number] {
  if (polygon.length < 3) return polygon[0] ?? [0.5, 0.5];
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const [x, y] of polygon) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  let best: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];
  let bestD = -1;
  const coarse = 40;
  for (let i = 1; i < coarse; i++) {
    for (let j = 1; j < coarse; j++) {
      const x = minX + ((maxX - minX) * i) / coarse;
      const y = minY + ((maxY - minY) * j) / coarse;
      if (!pointInPolygon(x, y, polygon)) continue;
      const d = distToPolygon(x, y, polygon);
      if (d > bestD) {
        bestD = d;
        best = [x, y];
      }
    }
  }
  // one refinement pass around the best coarse point
  const step = Math.max(maxX - minX, maxY - minY) / coarse;
  for (let i = -3; i <= 3; i++) {
    for (let j = -3; j <= 3; j++) {
      const x = best[0] + (i * step) / 3;
      const y = best[1] + (j * step) / 3;
      if (!pointInPolygon(x, y, polygon)) continue;
      const d = distToPolygon(x, y, polygon);
      if (d > bestD) {
        bestD = d;
        best = [x, y];
      }
    }
  }
  return best;
}

function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToPolygon(x: number, y: number, poly: [number, number][]): number {
  let min = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    min = Math.min(min, pointLineDist(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  }
  return min;
}

function polygonArea(poly: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return Math.abs(a) / 2;
}

export function reconstructRooms(
  parsed: ParsedPage,
  darkSegments: NormSegment[],
  seeds: { key: string; xNorm: number; yNorm: number }[],
  opts: ReconstructOptions = {},
): Map<string, ReconstructedRoom> {
  const cellPx = opts.cellPx ?? 3;
  const closeCells = opts.wallDilateCells ?? 5;
  const leakAreaFrac = opts.leakAreaFrac ?? 0.28;
  const componentMinFrac = opts.componentMinFrac ?? 0.004;

  const grid = buildBarrierGrid(parsed, darkSegments, cellPx, closeCells, componentMinFrac);
  const leakCells = Math.floor(grid.w * grid.h * leakAreaFrac);
  const totalCells = grid.w * grid.h;

  const out = new Map<string, ReconstructedRoom>();
  for (const seed of seeds) {
    const gx0 = Math.round((seed.xNorm * parsed.renderWidthPx) / cellPx);
    const gy0 = Math.round((seed.yNorm * parsed.renderHeightPx) / cellPx);
    const open = nearestOpenCell(grid, gx0, gy0);
    if (!open) continue;
    const { region, count, leaked } = floodFrom(grid, open[0], open[1], leakCells);
    const areaFrac = count / totalCells;
    const polygon = leaked ? [] : regionToPolygon(region, grid);
    const pin =
      polygon.length >= 3
        ? poleOfInaccessibility(polygon)
        : ([open[0] * cellPx / parsed.renderWidthPx, open[1] * cellPx / parsed.renderHeightPx] as [number, number]);
    out.set(seed.key, {
      polygon,
      pin,
      areaFrac: polygon.length >= 3 ? polygonArea(polygon) : areaFrac,
      leaked,
    });
  }
  return out;
}
