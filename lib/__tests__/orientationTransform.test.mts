// applyOrientationTransform - the single place the drawing-relative ->
// compass wall rotation runs (pipeline stage 6 auto-apply, and on every
// wall-orientation resolution in Field Review). Previously this was a
// second manual "Save & Auto-Fill Walls" button. Run via `npm test`.
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyOrientationTransform, type OrientationTransformRoom } from "../orientation";
import { WALL_ORIENTATION_UNRESOLVED_REASON } from "../drawingExtraction";
import { resolutionKey } from "../fieldResolutions";

// Minimal fake: one completed drawing whose extraction is provided by the
// test, and a rooms table whose update() echoes the payload back.
function fakeClient(extractionRooms: unknown[], roomUpdates: Record<string, unknown>[]): SupabaseClient {
  return {
    from(table: string) {
      if (table === "drawings") {
        return {
          select: () => ({
            eq: () => ({
              returns: () =>
                Promise.resolve({
                  data: [
                    { id: "drawing-1", extraction_status: "completed", extracted_data: { rooms: extractionRooms } },
                  ],
                }),
            }),
          }),
        };
      }
      // rooms
      return {
        update: (payload: Record<string, unknown>) => ({
          eq: (_c: string, id: string) => ({
            select: () => ({
              single: () => {
                const row = { id, ...payload };
                roomUpdates.push(row);
                return Promise.resolve({ data: row, error: null });
              },
            }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

function room(id: string, name: string): OrientationTransformRoom {
  return {
    id,
    name,
    wall_front_len_ft: 20,
    wall_rear_len_ft: 20,
    wall_left_len_ft: 10,
    wall_right_len_ft: 10,
  };
}

describe("applyOrientationTransform", () => {
  it("rotates front/rear/left/right onto the cardinal fields for a cardinal front", async () => {
    const updates: Record<string, unknown>[] = [];
    const client = fakeClient([], updates);
    // front faces West -> front=W, rear=E, left=N, right=S (see lib/orientation.ts derivation)
    const result = await applyOrientationTransform(client, "proj-1", [room("r1", "Living")], "W", new Set());
    expect(result.applicable).toBe(true);
    expect(result.blockedRoomNames).toEqual([]);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      wall_west_len_ft: 20, // front
      wall_east_len_ft: 20, // rear
      wall_north_len_ft: 10, // left
      wall_south_len_ft: 10, // right
    });
  });

  it("is a no-op for an intercardinal front (schema has no NE/SE/SW/NW column)", async () => {
    const updates: Record<string, unknown>[] = [];
    const result = await applyOrientationTransform(fakeClient([], updates), "proj-1", [room("r1", "Living")], "NE", new Set());
    expect(result.applicable).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("skips a room whose extraction still has an unresolved wall-orientation flag", async () => {
    const updates: Record<string, unknown>[] = [];
    const client = fakeClient(
      [{ name: "Living", unresolved: true, reason: WALL_ORIENTATION_UNRESOLVED_REASON }],
      updates,
    );
    const result = await applyOrientationTransform(client, "proj-1", [room("r1", "Living")], "N", new Set());
    expect(result.blockedRoomNames).toEqual(["Living"]);
    expect(updates).toHaveLength(0);
  });

  it("proceeds once that room's wall-orientation flag has a resolution row", async () => {
    const updates: Record<string, unknown>[] = [];
    const client = fakeClient(
      [{ name: "Living", unresolved: true, reason: WALL_ORIENTATION_UNRESOLVED_REASON }],
      updates,
    );
    const rk = new Set([resolutionKey("drawings", "drawing-1", "room[0]")]);
    const result = await applyOrientationTransform(client, "proj-1", [room("r1", "Living")], "N", rk);
    expect(result.blockedRoomNames).toEqual([]);
    expect(updates).toHaveLength(1);
  });
});
