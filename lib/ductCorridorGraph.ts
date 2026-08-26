// Real, human-digitized corridor topology - the source of truth for duct
// routing geometry whenever a zone has one, per direct instruction: "use
// the routing graph as the source of truth for corridor topology - don't
// compute routing paths independently." This is categorically better
// data than lib/ductPathGeometry.ts's computed room-box-avoidance
// routing (which only ever approximates real corridors from AI-extracted
// room bounding boxes) - a person read the actual construction set and
// recorded which rooms really share a hallway/chase and where the trunk
// really runs. lib/ductRouting.ts's computeSheetDuctRouting prefers this
// whenever zones.corridor_graph is set, falling back to the computed
// router only when it isn't (most projects, since this data has to be
// hand-digitized - there's no automated way to produce it yet).
//
// Real, disclosed limitation: this pure module only turns a graph into
// renderable segments - it does not verify the graph's own accuracy
// against the drawing (that's the digitizer's job, exactly like a tech
// confirming an AI-suggested pin). A malformed or miscalibrated graph
// will draw wrong lines just as confidently as a correct one; the
// calibration step below at least keeps it internally consistent with
// this project's own already-confirmed room pins, but doesn't re-verify
// the source drawing itself.
import type { NormPoint, SegmentClass } from "./ductPathGeometry";
import type { RoutedDuctSegment } from "./ductRouting";

export type CorridorGraphNode = { id: string; x: number; y: number };
export type CorridorGraphRoom = { id: string; name: string; x: number; y: number };
export type CorridorGraphAhu = { id: string; x: number; y: number; note?: string };
export type CorridorGraphEdge = { from: string; to: string; type: "trunk" | "branch" };
export type CorridorGraph = {
  ahu: CorridorGraphAhu;
  rooms: CorridorGraphRoom[];
  corridor_nodes: CorridorGraphNode[];
  edges: CorridorGraphEdge[];
};

function normalizeRoomName(s: string): string {
  return s
    .replace(/#/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// -----------------------------------------------------------------------
// Calibration: the graph's coordinates are real feet in the DIGITIZER'S
// OWN building-relative origin (per its own documentation - "origin at
// approx NW corner of each floor's exterior wall"), not this app's
// page-normalized [0,1] space, and there's no guarantee those two
// origins/scales/any print margin already line up. Rather than assume
// they do (or ask for yet another manual alignment step), this fits a
// simple per-axis affine transform (xNorm = scaleX*feetX + offsetX, and
// the same for Y) using every room the graph and this project's own
// already-confirmed pins BOTH have, matched by name - the exact same
// real, tech-verified anchor points this app already trusts for
// everything else. With Schneider's real data this is 16 anchor rooms on
// sheet 1 and 7 on sheet 2 - a well-determined ordinary least-squares
// fit, not a 2-point guess.
// -----------------------------------------------------------------------

export type AffineCalibration = { scaleX: number; offsetX: number; scaleY: number; offsetY: number };

function fitAxis(pairs: { input: number; output: number }[]): { scale: number; offset: number } {
  const n = pairs.length;
  const sumIn = pairs.reduce((s, p) => s + p.input, 0);
  const sumOut = pairs.reduce((s, p) => s + p.output, 0);
  const sumInOut = pairs.reduce((s, p) => s + p.input * p.output, 0);
  const sumInIn = pairs.reduce((s, p) => s + p.input * p.input, 0);
  const denominator = n * sumInIn - sumIn * sumIn;
  if (Math.abs(denominator) < 1e-9) {
    // Degenerate (every anchor at the same feet-coordinate on this axis)
    // - can't fit a real scale, fall back to a zero-scale offset-only
    // mapping centered on the mean so it at least doesn't crash.
    return { scale: 0, offset: sumOut / n };
  }
  const scale = (n * sumInOut - sumIn * sumOut) / denominator;
  const offset = (sumOut - scale * sumIn) / n;
  return { scale, offset };
}

export function fitCorridorGraphCalibration(
  graphRooms: CorridorGraphRoom[],
  summitRoomsOnSheet: { name: string; xNorm: number; yNorm: number }[],
): AffineCalibration | null {
  const summitByName = new Map(summitRoomsOnSheet.map((r) => [normalizeRoomName(r.name), r]));
  const pairs = graphRooms
    .map((gr) => {
      const match = summitByName.get(normalizeRoomName(gr.name));
      return match ? { fx: gr.x, fy: gr.y, nx: match.xNorm, ny: match.yNorm } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p != null);

  // Two independent anchors minimum for a real per-axis fit (one point
  // only constrains an offset, not a scale) - below that, the graph's
  // coordinate system can't be honestly reconciled with this project's
  // own, so this returns null rather than drawing a guessed-scale
  // network.
  if (pairs.length < 2) return null;

  const xFit = fitAxis(pairs.map((p) => ({ input: p.fx, output: p.nx })));
  const yFit = fitAxis(pairs.map((p) => ({ input: p.fy, output: p.ny })));
  return { scaleX: xFit.scale, offsetX: xFit.offset, scaleY: yFit.scale, offsetY: yFit.offset };
}

export function applyCorridorGraphCalibration(point: { x: number; y: number }, calibration: AffineCalibration): NormPoint {
  return {
    xNorm: calibration.scaleX * point.x + calibration.offsetX,
    yNorm: calibration.scaleY * point.y + calibration.offsetY,
  };
}

// -----------------------------------------------------------------------
// Graph -> renderable segments. Every edge the graph declares is drawn,
// classified by the graph's own "type" field directly (trunk/branch) -
// no usage-count heuristic needed the way the computed router requires
// one, since a human already recorded which segments are real trunk vs.
// real branch.
// -----------------------------------------------------------------------

// Below this normalized gap, a mismatch between two connected nodes'
// off-axis coordinate is treated as digitizing noise (the graph's own
// documentation states "+/-1ft, treat as a solid scaffold... not
// survey-grade") and drawn as a single straight segment exactly like a
// perfectly-aligned one; above it, the edge is genuinely diagonal in the
// source data and gets split into a real right-angle elbow instead -
// "strictly horizontal or vertical, 90-degree turns... never a direct
// diagonal line" is a hard requirement, not a preference, so this never
// draws the raw diagonal even when the graph's own coordinates would
// produce one.
const EDGE_ALIGNMENT_TOLERANCE_NORM = 0.006;

export function buildSegmentsFromCorridorGraph(
  graph: CorridorGraph,
  calibration: AffineCalibration,
  // The zone's own real, technician-confirmed AHU pin
  // (zones.ahu_position_x_norm/y_norm) - always preferred over the
  // graph's own "ahu" coordinate when known. The digitized file's own
  // AHU point is a rough placement estimate, not a confirmed reading
  // (its own text says so directly: Zone 1's says "per Summit's
  // existing AHU pin" - i.e. defer to it - and Zone 2's says "NEEDS
  // PLACEMENT in Summit per your pin list... suggested near stair
  // landing"). Diagnosed 2026-08-26 against real Schneider data: the
  // graph's calibrated AHU point landed ~19ft from the real confirmed
  // pin on Zone 1 (inside the Kitchen instead of the real Utility Room)
  // and inside the stairwell instead of the real Unfinished Attic on
  // Zone 2 - the AHU icon (drawn from the real pin) and the trunk
  // network's own start point (drawn from the graph) were visibly
  // disconnected, which is what the real "duct runs look wrong"
  // complaint was actually seeing.
  realAhuPoint: NormPoint | null,
): RoutedDuctSegment[] {
  const positionById = new Map<string, NormPoint>();
  positionById.set(graph.ahu.id, realAhuPoint ?? applyCorridorGraphCalibration(graph.ahu, calibration));
  for (const room of graph.rooms) positionById.set(room.id, applyCorridorGraphCalibration(room, calibration));
  for (const node of graph.corridor_nodes) positionById.set(node.id, applyCorridorGraphCalibration(node, calibration));

  const segments: RoutedDuctSegment[] = [];
  for (const edge of graph.edges) {
    const from = positionById.get(edge.from);
    const to = positionById.get(edge.to);
    // A real data-integrity gap (an edge references a node id the graph
    // itself never defines) - skipped, not fabricated a position for.
    if (!from || !to) continue;
    const cls: SegmentClass = edge.type;

    const dx = Math.abs(to.xNorm - from.xNorm);
    const dy = Math.abs(to.yNorm - from.yNorm);
    if (dx < EDGE_ALIGNMENT_TOLERANCE_NORM || dy < EDGE_ALIGNMENT_TOLERANCE_NORM) {
      segments.push({ fromXNorm: from.xNorm, fromYNorm: from.yNorm, toXNorm: to.xNorm, toYNorm: to.yNorm, cls });
    } else {
      // Vertical-then-horizontal elbow - the same Manhattan convention
      // this app already used for any two-point run whose ends weren't
      // axis-aligned, before this feature existed. The graph doesn't
      // specify which of the two possible elbow directions the real
      // corridor takes for a genuinely diagonal edge; this is a
      // consistent, disclosed default, not a verified path.
      const elbow: NormPoint = { xNorm: from.xNorm, yNorm: to.yNorm };
      segments.push({ fromXNorm: from.xNorm, fromYNorm: from.yNorm, toXNorm: elbow.xNorm, toYNorm: elbow.yNorm, cls });
      segments.push({ fromXNorm: elbow.xNorm, fromYNorm: elbow.yNorm, toXNorm: to.xNorm, toYNorm: to.yNorm, cls });
    }
  }
  return segments;
}

// Single entrypoint: attempts a real calibrated graph-based network,
// returns null if calibration isn't possible (too few name-matched
// anchor rooms) so the caller can fall back to computed routing rather
// than drawing a guessed-scale network.
export function computeSegmentsFromCorridorGraph(
  graph: CorridorGraph,
  summitRoomsOnSheet: { name: string; xNorm: number; yNorm: number }[],
  realAhuPoint: NormPoint | null,
): RoutedDuctSegment[] | null {
  const calibration = fitCorridorGraphCalibration(graph.rooms, summitRoomsOnSheet);
  if (!calibration) return null;
  return buildSegmentsFromCorridorGraph(graph, calibration, realAhuPoint);
}
