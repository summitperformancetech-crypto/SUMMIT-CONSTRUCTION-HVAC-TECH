// Real local persistence for a write made with no signal - the actual
// substance of "offline field data capture," not the service worker
// (public/sw.js), which only handles already-visited pages/assets. A
// queued row here is a genuine pending Supabase mutation, replayed by
// lib/offlineSync.ts once the device is back online.
import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "summit-offline";
const DB_VERSION = 1;
const STORE_NAME = "pending_mutations";

export type MutationOperation = "insert" | "update" | "delete";

export type PendingMutation = {
  id: number;
  table: string;
  operation: MutationOperation;
  payload: Record<string, unknown> | null; // null for delete
  // The .eq() column/value this mutation targets - update/delete need
  // this to know WHICH row; insert has none (a new row has no match yet).
  match: { column: string; value: string } | null;
  createdAt: string;
  status: "pending" | "failed";
  errorMessage: string | null;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        store.createIndex("createdAt", "createdAt");
      },
    });
  }
  return dbPromise;
}

export async function enqueueMutation(input: {
  table: string;
  operation: MutationOperation;
  payload: Record<string, unknown> | null;
  match: { column: string; value: string } | null;
}): Promise<number> {
  const db = await getDb();
  const record: Omit<PendingMutation, "id"> = {
    ...input,
    createdAt: new Date().toISOString(),
    status: "pending",
    errorMessage: null,
  };
  // autoIncrement + keyPath "id" (see the store's upgrade() definition
  // above) guarantees this is always a real number at runtime - idb's
  // own return type is the broader IDBValidKey since it can't express
  // that guarantee generically.
  const key = await db.add(STORE_NAME, record as PendingMutation);
  return key as number;
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex(STORE_NAME, "createdAt");
  return all as PendingMutation[];
}

export async function getPendingCount(): Promise<number> {
  const db = await getDb();
  return db.count(STORE_NAME);
}

export async function removeMutation(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

export async function markMutationFailed(id: number, errorMessage: string): Promise<void> {
  const db = await getDb();
  const record = await db.get(STORE_NAME, id);
  if (!record) return;
  await db.put(STORE_NAME, { ...record, status: "failed", errorMessage });
}

// Discards every queued mutation without syncing it - a real, deliberate
// action (e.g. a tech choosing to abandon offline edits rather than
// retry a failed one), not just a test helper, though it's also what
// tests use between cases to reset queue state without tearing down and
// reopening the underlying IndexedDB connection (which lib/offlineQueue.ts
// caches as a module-level singleton - closing/reopening it between
// every test proved unreliable against fake-indexeddb's blocked-delete
// semantics; clearing the store's contents through the same open
// connection does not have that problem).
export async function clearAllMutations(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE_NAME);
}
