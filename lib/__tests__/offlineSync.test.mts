import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { syncPendingMutations } from "../offlineSync";
import { enqueueMutation, getPendingMutations, getPendingCount, clearAllMutations } from "../offlineQueue";
import type { SupabaseClient } from "@supabase/supabase-js";

beforeEach(async () => {
  await clearAllMutations();
});

// Records every call it receives (in order) so tests can assert replay
// ordering, and lets each call succeed or fail per a supplied map.
function fakeClient(shouldFail: (table: string, payload: unknown) => string | null, calls: string[]): SupabaseClient {
  const chain = (table: string) => ({
    insert: (payload: Record<string, unknown>) => {
      calls.push(`insert:${table}:${JSON.stringify(payload)}`);
      const err = shouldFail(table, payload);
      return Promise.resolve({ error: err ? { message: err } : null });
    },
    update: (payload: Record<string, unknown>) => ({
      eq: (_col: string, value: string) => {
        calls.push(`update:${table}:${value}:${JSON.stringify(payload)}`);
        const err = shouldFail(table, payload);
        return Promise.resolve({ error: err ? { message: err } : null });
      },
    }),
    delete: () => ({
      eq: (_col: string, value: string) => {
        calls.push(`delete:${table}:${value}`);
        const err = shouldFail(table, null);
        return Promise.resolve({ error: err ? { message: err } : null });
      },
    }),
  });
  return { from: (table: string) => chain(table) } as unknown as SupabaseClient;
}

describe("syncPendingMutations", () => {
  it("returns zero synced/failed when nothing is queued", async () => {
    const client = fakeClient(() => null, []);
    const summary = await syncPendingMutations(client);
    expect(summary).toEqual({ synced: 0, failed: 0 });
  });

  it("replays a queued update against the real client and removes it from the queue on success", async () => {
    await enqueueMutation({
      table: "rooms",
      operation: "update",
      payload: { floor_area_sqft: 150 },
      match: { column: "id", value: "room-1" },
    });
    const calls: string[] = [];
    const client = fakeClient(() => null, calls);
    const summary = await syncPendingMutations(client);

    expect(summary).toEqual({ synced: 1, failed: 0 });
    expect(calls).toEqual(['update:rooms:room-1:{"floor_area_sqft":150}']);
    expect(await getPendingCount()).toBe(0);
  });

  it("replays mutations in creation order, not queued order reversed or parallel", async () => {
    await enqueueMutation({ table: "rooms", operation: "insert", payload: { name: "A" }, match: null });
    await enqueueMutation({ table: "rooms", operation: "insert", payload: { name: "B" }, match: null });
    await enqueueMutation({ table: "rooms", operation: "insert", payload: { name: "C" }, match: null });

    const calls: string[] = [];
    const client = fakeClient(() => null, calls);
    await syncPendingMutations(client);

    expect(calls).toEqual([
      'insert:rooms:{"name":"A"}',
      'insert:rooms:{"name":"B"}',
      'insert:rooms:{"name":"C"}',
    ]);
  });

  it("marks a failed mutation with the real error and keeps it in the queue for retry, without blocking the rest", async () => {
    await enqueueMutation({
      table: "rooms",
      operation: "update",
      payload: { floor_area_sqft: -5 },
      match: { column: "id", value: "room-1" },
    });
    await enqueueMutation({
      table: "rooms",
      operation: "update",
      payload: { floor_area_sqft: 150 },
      match: { column: "id", value: "room-2" },
    });

    const client = fakeClient(
      (_table, payload) =>
        (payload as { floor_area_sqft: number }).floor_area_sqft < 0 ? "check constraint violated" : null,
      [],
    );
    const summary = await syncPendingMutations(client);

    expect(summary).toEqual({ synced: 1, failed: 1 });
    const remaining = await getPendingMutations();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe("failed");
    expect(remaining[0].errorMessage).toBe("check constraint violated");
  });
});
