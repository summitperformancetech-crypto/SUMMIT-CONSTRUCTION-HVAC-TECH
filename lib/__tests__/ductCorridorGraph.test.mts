// Real, human-digitized corridor topology as the routing source of
// truth - see lib/ductCorridorGraph.ts's module comment for the full
// reasoning (built 2026-08-25 per direct instruction after the user
// supplied a real digitized graph for the Schneider project).
import { describe, it, expect } from "vitest";
import {
  fitCorridorGraphCalibration,
  applyCorridorGraphCalibration,
  buildSegmentsFromCorridorGraph,
  computeSegmentsFromCorridorGraph,
  type CorridorGraph,
  type CorridorGraphRoom,
  type AffineCalibration,
} from "../ductCorridorGraph";

describe("fitCorridorGraphCalibration", () => {
  it("derives an exact scale/offset from real matched anchor rooms", () => {
    // A simple, exactly-linear relationship: xNorm = 0.02*feetX + 0.05,
    // yNorm = 0.025*feetY + 0.1 - three anchors is enough to prove the
    // fit recovers it exactly (no noise in this synthetic case).
    const graphRooms: CorridorGraphRoom[] = [
      { id: "a", name: "Kitchen", x: 10, y: 10 },
      { id: "b", name: "Living Room", x: 20, y: 20 },
      { id: "c", name: "Bedroom", x: 30, y: 40 },
    ];
    const summitRooms = [
      { name: "Kitchen", xNorm: 0.25, yNorm: 0.35 },
      { name: "Living Room", xNorm: 0.45, yNorm: 0.6 },
      { name: "Bedroom", xNorm: 0.65, yNorm: 1.1 },
    ];
    const calibration = fitCorridorGraphCalibration(graphRooms, summitRooms);
    expect(calibration).not.toBeNull();
    expect(calibration!.scaleX).toBeCloseTo(0.02);
    expect(calibration!.offsetX).toBeCloseTo(0.05);
    expect(calibration!.scaleY).toBeCloseTo(0.025);
    expect(calibration!.offsetY).toBeCloseTo(0.1);
  });

  it("matches rooms by normalized name, ignoring case/spacing", () => {
    const graphRooms: CorridorGraphRoom[] = [
      { id: "a", name: "master  bedroom", x: 0, y: 0 },
      { id: "b", name: "MASTER BATHROOM", x: 10, y: 10 },
    ];
    const summitRooms = [
      { name: "Master Bedroom", xNorm: 0.1, yNorm: 0.1 },
      { name: "Master Bathroom", xNorm: 0.3, yNorm: 0.3 },
    ];
    const calibration = fitCorridorGraphCalibration(graphRooms, summitRooms);
    expect(calibration).not.toBeNull();
  });

  it("ignores a graph room with no matching Summit room", () => {
    const graphRooms: CorridorGraphRoom[] = [
      { id: "a", name: "Kitchen", x: 10, y: 10 },
      { id: "b", name: "Nonexistent Room", x: 999, y: 999 },
      { id: "c", name: "Living Room", x: 20, y: 20 },
    ];
    const summitRooms = [
      { name: "Kitchen", xNorm: 0.2, yNorm: 0.2 },
      { name: "Living Room", xNorm: 0.4, yNorm: 0.4 },
    ];
    const calibration = fitCorridorGraphCalibration(graphRooms, summitRooms);
    // A calibration built only from the 2 real matches, not skewed by
    // the 999,999 outlier that never should have counted.
    expect(calibration).not.toBeNull();
    expect(calibration!.scaleX).toBeCloseTo(0.02);
  });

  it("returns null with fewer than 2 real anchor matches", () => {
    const graphRooms: CorridorGraphRoom[] = [{ id: "a", name: "Kitchen", x: 10, y: 10 }];
    const summitRooms = [{ name: "Kitchen", xNorm: 0.2, yNorm: 0.2 }];
    expect(fitCorridorGraphCalibration(graphRooms, summitRooms)).toBeNull();
  });

  it("returns null with zero anchor matches", () => {
    const graphRooms: CorridorGraphRoom[] = [{ id: "a", name: "Nowhere", x: 10, y: 10 }];
    const summitRooms = [{ name: "Kitchen", xNorm: 0.2, yNorm: 0.2 }];
    expect(fitCorridorGraphCalibration(graphRooms, summitRooms)).toBeNull();
  });
});

describe("applyCorridorGraphCalibration", () => {
  it("applies the affine transform correctly", () => {
    const calibration: AffineCalibration = { scaleX: 0.02, offsetX: 0.05, scaleY: 0.025, offsetY: 0.1 };
    const result = applyCorridorGraphCalibration({ x: 10, y: 10 }, calibration);
    expect(result.xNorm).toBeCloseTo(0.25);
    expect(result.yNorm).toBeCloseTo(0.35);
  });
});

describe("buildSegmentsFromCorridorGraph", () => {
  const calibration: AffineCalibration = { scaleX: 0.01, offsetX: 0, scaleY: 0.01, offsetY: 0 };

  it("converts every edge to a normalized segment, preserving trunk/branch type", () => {
    const graph: CorridorGraph = {
      ahu: { id: "AHU_1", x: 30, y: 20 },
      rooms: [{ id: "kitchen", name: "Kitchen", x: 30, y: 20 }],
      corridor_nodes: [{ id: "C1", x: 20, y: 20 }],
      edges: [
        { from: "AHU_1", to: "C1", type: "trunk" },
        { from: "C1", to: "kitchen", type: "branch" },
      ],
    };
    const segments = buildSegmentsFromCorridorGraph(graph, calibration);
    expect(segments).toHaveLength(2);
    expect(segments[0].cls).toBe("trunk");
    expect(segments[1].cls).toBe("branch");
    expect(segments[0].fromXNorm).toBeCloseTo(0.3);
    expect(segments[0].fromYNorm).toBeCloseTo(0.2);
  });

  // Real Schneider case: some of the digitized graph's own edges aren't
  // perfectly axis-aligned (e.g. C3_landing -> bedroom_3, off by 8.9ft
  // in x AND 6.3ft in y) - "strictly horizontal or vertical" is a hard
  // requirement, so a genuinely diagonal edge must still render as a
  // real right-angle elbow, never the raw diagonal.
  it("splits a genuinely diagonal edge into a real right-angle elbow instead of drawing a diagonal", () => {
    const graph: CorridorGraph = {
      ahu: { id: "AHU_1", x: 0, y: 0 },
      rooms: [{ id: "bedroom_3", name: "Bedroom 3", x: 50, y: 40 }],
      corridor_nodes: [{ id: "C1", x: 10, y: 0 }],
      edges: [{ from: "C1", to: "bedroom_3", type: "branch" }],
    };
    const calibration: AffineCalibration = { scaleX: 0.01, offsetX: 0, scaleY: 0.01, offsetY: 0 };
    const segments = buildSegmentsFromCorridorGraph(graph, calibration);
    expect(segments).toHaveLength(2);
    for (const seg of segments) {
      const dx = Math.abs(seg.toXNorm - seg.fromXNorm);
      const dy = Math.abs(seg.toYNorm - seg.fromYNorm);
      expect(dx < 1e-9 || dy < 1e-9).toBe(true);
    }
    // Both halves keep the edge's own real classification.
    expect(segments.every((s) => s.cls === "branch")).toBe(true);
    // The elbow connects the two halves (end of first = start of second).
    expect(segments[0].toXNorm).toBeCloseTo(segments[1].fromXNorm);
    expect(segments[0].toYNorm).toBeCloseTo(segments[1].fromYNorm);
  });

  it("draws a single straight segment when the offset is within digitizing tolerance", () => {
    const graph: CorridorGraph = {
      ahu: { id: "AHU_1", x: 0, y: 0 },
      rooms: [{ id: "kitchen", name: "Kitchen", x: 10, y: 0.1 }], // 0.1ft off, real-world "noise"
      corridor_nodes: [],
      edges: [{ from: "AHU_1", to: "kitchen", type: "trunk" }],
    };
    const calibration: AffineCalibration = { scaleX: 0.01, offsetX: 0, scaleY: 0.01, offsetY: 0 };
    const segments = buildSegmentsFromCorridorGraph(graph, calibration);
    expect(segments).toHaveLength(1);
  });

  it("skips an edge that references an undefined node id instead of fabricating a position", () => {
    const graph: CorridorGraph = {
      ahu: { id: "AHU_1", x: 30, y: 20 },
      rooms: [],
      corridor_nodes: [],
      edges: [{ from: "AHU_1", to: "nonexistent_node", type: "trunk" }],
    };
    const segments = buildSegmentsFromCorridorGraph(graph, calibration);
    expect(segments).toHaveLength(0);
  });
});

describe("computeSegmentsFromCorridorGraph - end to end", () => {
  it("produces real segments when calibration succeeds", () => {
    const graph: CorridorGraph = {
      ahu: { id: "AHU_1", x: 30, y: 20 },
      rooms: [
        { id: "kitchen", name: "Kitchen", x: 30, y: 20 },
        { id: "living_room", name: "Living Room", x: 20, y: 20 },
      ],
      corridor_nodes: [],
      edges: [{ from: "AHU_1", to: "living_room", type: "trunk" }],
    };
    const summitRooms = [
      { name: "Kitchen", xNorm: 0.3, yNorm: 0.2 },
      { name: "Living Room", xNorm: 0.2, yNorm: 0.2 },
    ];
    const segments = computeSegmentsFromCorridorGraph(graph, summitRooms);
    expect(segments).not.toBeNull();
    expect(segments).toHaveLength(1);
  });

  it("returns null when the graph's rooms can't be reconciled with this project's own pins", () => {
    const graph: CorridorGraph = {
      ahu: { id: "AHU_1", x: 30, y: 20 },
      rooms: [{ id: "kitchen", name: "Kitchen", x: 30, y: 20 }],
      corridor_nodes: [],
      edges: [],
    };
    const segments = computeSegmentsFromCorridorGraph(graph, []);
    expect(segments).toBeNull();
  });
});
