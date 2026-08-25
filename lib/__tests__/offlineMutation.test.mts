import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mutateOrQueue, isNetworkError } from "../offlineMutation";
import { getPendingCount, clearAllMutations } from "../offlineQueue";
import type { SupabaseClient } from "@supabase/supabase-js";

const originalOnLine = Object.getOwnPropertyDescriptor(navigator, "onLine");

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

beforeEach(async () => {
  await clearAllMutations();
});

afterEach(() => {
  if (originalOnLine) Object.defineProperty(navigator, "onLine", originalOnLine);
});

// Minimal fake matching only the .from(table).insert/update/delete chain
// shape mutateOrQueue actually calls - not a real SupabaseClient.
function fakeClient(behavior: { error: { message: string } | null } | (() => never)): SupabaseClient {
  const respond = () => (typeof behavior === "function" ? behavior() : Promise.resolve(behavior));
  const chain = {
    insert: respond,
    update: () => chain,
    delete: () => chain,
    eq: respond,
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

describe("isNetworkError", () => {
  it("recognizes a browser fetch network failure", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });
  it("does not treat an unrelated TypeError as a network error", () => {
    expect(isNetworkError(new TypeError("Cannot read properties of undefined"))).toBe(false);
  });
  it("does not treat a plain Error as a network error", () => {
    expect(isNetworkError(new Error("Failed to fetch"))).toBe(false);
  });
});

describe("mutateOrQueue", () => {
  it("writes directly and reports queued:false when online and the write succeeds", async () => {
    setOnline(true);
    const client = fakeClient({ error: null });
    const result = await mutateOrQueue(client, {
      table: "rooms",
      operation: "update",
      payload: { floor_area_sqft: 150 },
      match: { column: "id", value: "room-1" },
    });
    expect(result).toEqual({ error: null, queued: false });
    expect(await getPendingCount()).toBe(0);
  });

  it("surfaces a real server-side rejection immediately rather than queueing it", async () => {
    setOnline(true);
    const client = fakeClient({ error: { message: "new row violates row-level security policy" } });
    const result = await mutateOrQueue(client, {
      table: "rooms",
      operation: "insert",
      payload: { name: "New Room" },
      match: null,
    });
    expect(result.error).toBe("new row violates row-level security policy");
    expect(result.queued).toBe(false);
    expect(await getPendingCount()).toBe(0);
  });

  it("queues the mutation without attempting the network when known offline", async () => {
    setOnline(false);
    const client = fakeClient(() => {
      throw new Error("should never be called while offline");
    });
    const result = await mutateOrQueue(client, {
      table: "rooms",
      operation: "update",
      payload: { floor_area_sqft: 200 },
      match: { column: "id", value: "room-1" },
    });
    expect(result).toEqual({ error: null, queued: true });
    expect(await getPendingCount()).toBe(1);
  });

  it("queues the mutation when a genuine network error is thrown while nominally online", async () => {
    setOnline(true);
    const client = fakeClient(() => {
      throw new TypeError("Failed to fetch");
    });
    const result = await mutateOrQueue(client, {
      table: "rooms",
      operation: "delete",
      payload: null,
      match: { column: "id", value: "room-1" },
    });
    expect(result).toEqual({ error: null, queued: true });
    expect(await getPendingCount()).toBe(1);
  });
});
