// Permit-Submittable Manual D Package, Section 4 - real Extended Plenum /
// Reducing Trunk system-design rules, checked against real geometry, not
// rendered as if the rules were satisfied by construction.
//
// Source of truth: zones.corridor_graph (lib/ductCorridorGraph.ts) - real,
// human-digitized trunk/branch topology, coordinates in real feet in the
// digitizer's own building-relative origin, BEFORE the affine calibration
// that module applies for rendering. Lengths and take-off positions
// computed here use those raw feet coordinates directly - calibrating to
// page-normalized space first would risk introducing anisotropic scale
// error into a real-feet measurement that doesn't need it.
//
// Real, disclosed limitation: this only runs for a zone that actually has
// a corridor_graph. Most projects don't (it has to be hand-digitized -
// see that module's own comment) - those zones report `determinable:
// false` here, never a fabricated topology guessed from the computed
// room-box-avoidance router, which has no real notion of "where along the
// trunk" a branch attaches.
//
// The specific numeric thresholds below (24ft/48ft single/double-plenum
// limit, 15-20ft reduction step, 8in default trunk height, 4x max
// width:height, 24in/12in end clearances, 4ft/1.5x post-reduction
// clearance, damper-per-branch) were supplied directly as the governing
// design rules for this build - not independently re-derived from the
// ACCA Manual D text itself, which this codebase has not had direct
// access to beyond the previously-sourced Appendix 3 equivalent-length
// values and the real friction/velocity data already cited in
// lib/manualD.ts.
import type { CorridorGraph } from "./ductCorridorGraph";
import type { NormPoint } from "./ductPathGeometry";

export const EXTENDED_PLENUM_MAX_SINGLE_RUN_FT = 24;
export const EXTENDED_PLENUM_MAX_DOUBLE_RUN_FT = 48;
export const TRUNK_REDUCTION_STEP_MIN_FT = 15;
export const TRUNK_REDUCTION_STEP_MAX_FT = 20;
// Midpoint of the stated 15-20ft range, used as a single disclosed
// spacing constant for placing reduction points - same "state one number
// from a range rather than a second hidden input" approach already used
// for ESP_GATE_SAFETY_FACTOR_PERCENT in lib/manualD.ts.
export const TRUNK_REDUCTION_STEP_FT = 17.5;
export const TRUNK_DEFAULT_HEIGHT_IN = 8;
export const TRUNK_MAX_WIDTH_TO_HEIGHT_RATIO = 4;
export const TAKEOFF_MIN_CLEARANCE_FROM_PLENUM_END_IN = 24;
export const TAKEOFF_MIN_CLEARANCE_FROM_TRUNK_TERMINAL_END_IN = 12;
export const TAKEOFF_MIN_CLEARANCE_AFTER_REDUCTION_FT = 4;
export const TAKEOFF_MIN_CLEARANCE_AFTER_REDUCTION_DUCT_MULTIPLE = 1.5;

export type TrunkArm = {
  // Node ids from the AHU outward to this arm's terminal (leaf) end,
  // AHU id included as the first entry.
  nodeIds: string[];
  // Same length as nodeIds - cumulative real feet from the AHU to each
  // node in the sequence (cumulativeDistanceFt[0] is always 0).
  cumulativeDistanceFt: number[];
  totalLengthFt: number;
};

// Real Euclidean distance in the graph's own real-feet coordinate space.
function realDist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Walks the TRUNK-typed edges of the graph outward from the AHU node,
// producing one TrunkArm per real branch of the trunk backbone (a
// "double plenum" configuration is exactly two arms leaving the AHU/
// plenum node in different directions; "single run" is one arm). Real
// graph traversal, not an assumption about how many arms exist - a
// three-way plenum (rare, but real) would produce three arms here.
export function extractTrunkArms(graph: CorridorGraph): TrunkArm[] {
  const pointById = new Map<string, { x: number; y: number }>();
  pointById.set(graph.ahu.id, { x: graph.ahu.x, y: graph.ahu.y });
  for (const node of graph.corridor_nodes) pointById.set(node.id, { x: node.x, y: node.y });

  const trunkEdges = graph.edges.filter((e) => e.type === "trunk");
  const adjacency = new Map<string, string[]>();
  for (const edge of trunkEdges) {
    if (!pointById.has(edge.from) || !pointById.has(edge.to)) continue;
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from)!.push(edge.to);
    adjacency.get(edge.to)!.push(edge.from);
  }

  const arms: TrunkArm[] = [];
  const visited = new Set<string>([graph.ahu.id]);

  // DFS from the AHU along each real trunk edge; an "arm" ends at a node
  // with no further unvisited trunk neighbor (a real leaf), or continues
  // straight through single-neighbor chains (the common case: a trunk
  // made of several shorter digitized segments in a row is still one arm).
  function walk(path: string[], distances: number[]) {
    const current = path[path.length - 1];
    const neighbors = (adjacency.get(current) ?? []).filter((n) => !visited.has(n));
    if (neighbors.length === 0) {
      if (path.length > 1) arms.push({ nodeIds: [...path], cumulativeDistanceFt: [...distances], totalLengthFt: distances[distances.length - 1] });
      return;
    }
    for (const next of neighbors) {
      visited.add(next);
      const segFt = realDist(pointById.get(current)!, pointById.get(next)!);
      walk([...path, next], [...distances, distances[distances.length - 1] + segFt]);
    }
  }
  walk([graph.ahu.id], [0]);
  return arms;
}

export type TakeoffPosition = {
  roomId: string;
  armIndex: number;
  distanceFromAhuFt: number;
  distanceFromArmEndFt: number;
};

// For each real BRANCH edge (a take-off, corridor node -> room), finds
// which trunk arm its corridor-node end belongs to and its real distance
// along that arm from the AHU - the figure every spacing rule below
// needs. A branch attached to a node that isn't on any trunk arm (e.g. a
// malformed graph) is simply omitted, not guessed at.
export function extractTakeoffPositions(graph: CorridorGraph, arms: TrunkArm[]): TakeoffPosition[] {
  const armIndexByNode = new Map<string, { armIndex: number; distanceFt: number }>();
  arms.forEach((arm, armIndex) => {
    arm.nodeIds.forEach((nodeId, i) => {
      // A node already claimed by an earlier arm (shared start of a
      // shared sub-path before arms diverge) keeps its first assignment.
      if (!armIndexByNode.has(nodeId)) armIndexByNode.set(nodeId, { armIndex, distanceFt: arm.cumulativeDistanceFt[i] });
    });
  });

  const roomIds = new Set(graph.rooms.map((r) => r.id));
  const positions: TakeoffPosition[] = [];
  for (const edge of graph.edges.filter((e) => e.type === "branch")) {
    const trunkNodeId = roomIds.has(edge.to) ? edge.from : roomIds.has(edge.from) ? edge.to : null;
    const roomId = roomIds.has(edge.to) ? edge.to : roomIds.has(edge.from) ? edge.from : null;
    if (!trunkNodeId || !roomId) continue;
    const armInfo = armIndexByNode.get(trunkNodeId);
    if (!armInfo) continue;
    const arm = arms[armInfo.armIndex];
    positions.push({
      roomId,
      armIndex: armInfo.armIndex,
      distanceFromAhuFt: armInfo.distanceFt,
      distanceFromArmEndFt: arm.totalLengthFt - armInfo.distanceFt,
    });
  }
  return positions;
}

export type TrunkTopologyClass = "extended_plenum" | "reducing_trunk";

export function classifyTrunkArm(totalLengthFt: number): TrunkTopologyClass {
  return totalLengthFt <= EXTENDED_PLENUM_MAX_SINGLE_RUN_FT ? "extended_plenum" : "reducing_trunk";
}

// Real, evenly-spaced reduction points along a reducing-trunk arm, one
// every TRUNK_REDUCTION_STEP_FT starting from the AHU, stopping short of
// the arm's own terminal end (a reduction exactly at the last few feet
// of an arm isn't a real step-down, it's just the end).
export function computeReductionPointsFt(armLengthFt: number): number[] {
  if (armLengthFt <= EXTENDED_PLENUM_MAX_SINGLE_RUN_FT) return [];
  const points: number[] = [];
  for (let d = TRUNK_REDUCTION_STEP_FT; d < armLengthFt - TRUNK_REDUCTION_STEP_MIN_FT / 2; d += TRUNK_REDUCTION_STEP_FT) {
    points.push(d);
  }
  return points;
}

export type TakeoffSpacingViolation = {
  roomId: string;
  reason: "too_close_to_plenum_end" | "too_close_to_trunk_terminal_end" | "too_close_to_reduction";
  detail: string;
};

// Real spacing checks against a real take-off position - every distance
// compared here came from extractTakeoffPositions/extractTrunkArms, not
// an assumption.
export function checkTakeoffSpacing(
  positions: TakeoffPosition[],
  arms: TrunkArm[],
  // Real duct diameter at each take-off, in - needed for the "1.5x
  // greater duct dimension" alternative to the flat 4ft post-reduction
  // clearance. Missing (not yet sized) entries fall back to the flat 4ft
  // figure only - never a fabricated diameter.
  ductDiameterInByRoomId: Map<string, number | null>,
): TakeoffSpacingViolation[] {
  const violations: TakeoffSpacingViolation[] = [];
  for (const pos of positions) {
    const arm = arms[pos.armIndex];
    const plenumClearanceFt = TAKEOFF_MIN_CLEARANCE_FROM_PLENUM_END_IN / 12;
    if (pos.distanceFromAhuFt < plenumClearanceFt) {
      violations.push({
        roomId: pos.roomId,
        reason: "too_close_to_plenum_end",
        detail: `${(pos.distanceFromAhuFt * 12).toFixed(1)}" from the plenum end - minimum is ${TAKEOFF_MIN_CLEARANCE_FROM_PLENUM_END_IN}"`,
      });
    }
    const terminalClearanceFt = TAKEOFF_MIN_CLEARANCE_FROM_TRUNK_TERMINAL_END_IN / 12;
    if (pos.distanceFromArmEndFt < terminalClearanceFt) {
      violations.push({
        roomId: pos.roomId,
        reason: "too_close_to_trunk_terminal_end",
        detail: `${(pos.distanceFromArmEndFt * 12).toFixed(1)}" from the trunk's terminal end - minimum is ${TAKEOFF_MIN_CLEARANCE_FROM_TRUNK_TERMINAL_END_IN}"`,
      });
    }
    const reductionPoints = computeReductionPointsFt(arm.totalLengthFt);
    const diameterIn = ductDiameterInByRoomId.get(pos.roomId) ?? null;
    const requiredClearanceFt = Math.max(
      TAKEOFF_MIN_CLEARANCE_AFTER_REDUCTION_FT,
      diameterIn != null ? (diameterIn * TAKEOFF_MIN_CLEARANCE_AFTER_REDUCTION_DUCT_MULTIPLE) / 12 : 0,
    );
    for (const reductionFt of reductionPoints) {
      if (Math.abs(pos.distanceFromAhuFt - reductionFt) < requiredClearanceFt && pos.distanceFromAhuFt >= reductionFt) {
        violations.push({
          roomId: pos.roomId,
          reason: "too_close_to_reduction",
          detail: `${(pos.distanceFromAhuFt - reductionFt).toFixed(1)}ft downstream of a reduction at ${reductionFt.toFixed(1)}ft - minimum is ${requiredClearanceFt.toFixed(1)}ft`,
        });
      }
    }
  }
  return violations;
}

export function checkTrunkDimensions(heightIn: number | null, widthIn: number | null): { pass: boolean; detail: string } | null {
  if (heightIn == null || widthIn == null) return null;
  const heightOk = Math.abs(heightIn - TRUNK_DEFAULT_HEIGHT_IN) < 0.01 || heightIn >= TRUNK_DEFAULT_HEIGHT_IN;
  const ratioOk = widthIn / heightIn <= TRUNK_MAX_WIDTH_TO_HEIGHT_RATIO;
  const pass = heightOk && ratioOk;
  const detail = pass
    ? `${widthIn}"x${heightIn}" - within the ${TRUNK_MAX_WIDTH_TO_HEIGHT_RATIO}x width:height limit`
    : !ratioOk
      ? `${widthIn}"x${heightIn}" exceeds the ${TRUNK_MAX_WIDTH_TO_HEIGHT_RATIO}x width:height limit`
      : `${widthIn}"x${heightIn}" - height below the ${TRUNK_DEFAULT_HEIGHT_IN}" default`;
  return { pass, detail };
}

// Real page position at a given real distance along an arm - linear
// interpolation between the two calibrated node positions bracketing
// that distance. An affine calibration preserves ratios along a line, so
// interpolating the already-calibrated (normalized) endpoints gives the
// identical result as calibrating an interpolated feet-space point would
// - this just reuses positions the caller already has, from
// lib/ductCorridorGraph.ts's resolveCorridorNodePositions.
export function placePointAlongArm(arm: TrunkArm, distanceFt: number, positionById: Map<string, NormPoint>): NormPoint | null {
  for (let i = 0; i < arm.nodeIds.length - 1; i++) {
    const d0 = arm.cumulativeDistanceFt[i];
    const d1 = arm.cumulativeDistanceFt[i + 1];
    if (distanceFt >= d0 && distanceFt <= d1) {
      const p0 = positionById.get(arm.nodeIds[i]);
      const p1 = positionById.get(arm.nodeIds[i + 1]);
      if (!p0 || !p1) return null;
      const t = d1 === d0 ? 0 : (distanceFt - d0) / (d1 - d0);
      return { xNorm: p0.xNorm + (p1.xNorm - p0.xNorm) * t, yNorm: p0.yNorm + (p1.yNorm - p0.yNorm) * t };
    }
  }
  return null;
}

// Real downstream CFM at a point on an arm - the sum of every real
// take-off beyond that distance (further from the AHU), from each
// take-off's own already-computed required CFM. Used to label a reducer
// with the real airflow the downstream (reduced) segment actually
// carries, rather than a fabricated or unlabeled size step.
export function computeDownstreamCfmAtDistance(
  positions: TakeoffPosition[],
  armIndex: number,
  distanceFt: number,
  cfmByRoomId: Map<string, number>,
): number {
  return positions
    .filter((p) => p.armIndex === armIndex && p.distanceFromAhuFt > distanceFt)
    .reduce((sum, p) => sum + (cfmByRoomId.get(p.roomId) ?? 0), 0);
}

export type ArmAnalysis = {
  armIndex: number;
  totalLengthFt: number;
  topology: TrunkTopologyClass;
  reductionPointsFt: number[];
};

export type TrunkTopologyAnalysis = {
  determinable: boolean;
  arms: ArmAnalysis[];
  combinedArmLengthFt: number | null;
  exceedsDoublePlenumLimit: boolean;
  takeoffSpacingViolations: TakeoffSpacingViolation[];
};

// Top-level real analysis for one zone's real corridor_graph. Returns
// determinable: false (never a guessed topology) when the zone has no
// corridor_graph at all - the only source of truth precise enough for
// take-off-position math.
// Remaps every position's roomId through a graph-slug -> real-room-UUID
// map (see lib/ductCorridorGraph.ts's mapGraphRoomIdsToRealRoomIds) - a
// position whose graph room has no real-room match is dropped, never left
// half-translated. Omitting the map (the default) leaves roomId in the
// graph's own id space, which is what every existing caller/test that
// predates this real-id bridge still expects.
export function remapTakeoffPositionsToRealRoomIds(
  positions: TakeoffPosition[],
  graphRoomIdToRealRoomId: Map<string, string>,
): TakeoffPosition[] {
  return positions
    .map((p) => {
      const realRoomId = graphRoomIdToRealRoomId.get(p.roomId);
      return realRoomId ? { ...p, roomId: realRoomId } : null;
    })
    .filter((p): p is TakeoffPosition => p != null);
}

export function analyzeTrunkTopology(
  graph: CorridorGraph | null,
  ductDiameterInByRoomId: Map<string, number | null>,
  // Real graph-room-slug -> real-room-UUID map, needed so
  // ductDiameterInByRoomId (keyed by this app's real room UUIDs) actually
  // matches a take-off position's roomId - without it, position.roomId
  // stays in the graph's own id space and every diameter lookup silently
  // misses. See lib/ductCorridorGraph.ts's mapGraphRoomIdsToRealRoomIds.
  graphRoomIdToRealRoomId?: Map<string, string>,
): TrunkTopologyAnalysis {
  if (!graph) {
    return { determinable: false, arms: [], combinedArmLengthFt: null, exceedsDoublePlenumLimit: false, takeoffSpacingViolations: [] };
  }
  const arms = extractTrunkArms(graph);
  if (arms.length === 0) {
    return { determinable: false, arms: [], combinedArmLengthFt: null, exceedsDoublePlenumLimit: false, takeoffSpacingViolations: [] };
  }
  const armAnalyses: ArmAnalysis[] = arms.map((arm, armIndex) => ({
    armIndex,
    totalLengthFt: arm.totalLengthFt,
    topology: classifyTrunkArm(arm.totalLengthFt),
    reductionPointsFt: computeReductionPointsFt(arm.totalLengthFt),
  }));
  const combinedArmLengthFt = arms.reduce((sum, a) => sum + a.totalLengthFt, 0);
  const rawPositions = extractTakeoffPositions(graph, arms);
  const positions = graphRoomIdToRealRoomId
    ? remapTakeoffPositionsToRealRoomIds(rawPositions, graphRoomIdToRealRoomId)
    : rawPositions;
  const takeoffSpacingViolations = checkTakeoffSpacing(positions, arms, ductDiameterInByRoomId);

  return {
    determinable: true,
    arms: armAnalyses,
    combinedArmLengthFt,
    exceedsDoublePlenumLimit: arms.length >= 2 && combinedArmLengthFt > EXTENDED_PLENUM_MAX_DOUBLE_RUN_FT,
    takeoffSpacingViolations,
  };
}
