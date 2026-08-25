// Real IndexedDB behavior via fake-indexeddb (the standard polyfill for
// testing IndexedDB code outside a browser), not a mocked-out version of
// lib/offlineQueue.ts itself - this is the actual queue a field tech's
// offline write goes through.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  enqueueMutation,
  getPendingMutations,
  getPendingCount,
  removeMutation,
  markMutationFailed,
  clearAllMutations,
} from "../offlineQueue";

// Clears queue contents through the module's own (cached, singleton)
// connection between tests, rather than deleting/reopening the
// underlying IndexedDB database - see clearAllMutations's own comment.
beforeEach(async () => {
  await clearAllMutations();
});

describe("offlineQueue", () => {
  it("starts with zero pending mutations", async () => {
    expect(await getPendingCount()).toBe(0);
  });

  it("enqueues a mutation and it shows up in getPendingMutations", async () => {
    await enqueueMutation({
      table: "rooms",
      operation: "update",
      payload: { floor_area_sqft: 150 },
      match: { column: "id", value: "room-1" },
    });
    const pending = await getPendingMutations();
    expect(pending).toHaveLength(1);
    expect(pending[0].table).toBe("rooms");
    expect(pending[0].operation).toBe("update");
    expect(pending[0].status).toBe("pending");
  });

  it("returns mutations in creation order", async () => {
    await enqueueMutation({ table: "rooms", operation: "insert", payload: { name: "A" }, match: null });
    await enqueueMutation({ table: "rooms", operation: "insert", payload: { name: "B" }, match: null });
    const pending = await getPendingMutations();
    expect(pending.map((m) => (m.payload as { name: string }).name)).toEqual(["A", "B"]);
  });

  it("removes a mutation after it syncs successfully", async () => {
    const id = await enqueueMutation({
      table: "rooms",
      operation: "delete",
      payload: null,
      match: { column: "id", value: "room-1" },
    });
    expect(await getPendingCount()).toBe(1);
    await removeMutation(id);
    expect(await getPendingCount()).toBe(0);
  });

  it("marks a mutation failed with an error message rather than deleting it", async () => {
    const id = await enqueueMutation({
      table: "rooms",
      operation: "update",
      payload: { floor_area_sqft: 150 },
      match: { column: "id", value: "room-1" },
    });
    await markMutationFailed(id, "row-level security violation");
    const pending = await getPendingMutations();
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe("failed");
    expect(pending[0].errorMessage).toBe("row-level security violation");
  });
});
