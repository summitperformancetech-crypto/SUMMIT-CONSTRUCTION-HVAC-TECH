// Replays lib/offlineQueue.ts's pending mutations against the real
// Supabase client once back online - the other half of the offline
// write path. Runs mutations in creation order (a queued update to a
// row that was itself queued-inserted must replay after that insert,
// not before it - createdAt ordering is what guarantees that).
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPendingMutations, removeMutation, markMutationFailed, type PendingMutation } from "./offlineQueue";

export type SyncSummary = {
  synced: number;
  failed: number;
};

async function applyMutation(supabase: SupabaseClient, mutation: PendingMutation): Promise<{ error: string | null }> {
  const table = supabase.from(mutation.table);

  if (mutation.operation === "insert") {
    const { error } = await table.insert(mutation.payload!);
    return { error: error?.message ?? null };
  }
  if (mutation.operation === "update") {
    if (!mutation.match) return { error: "Missing match condition for queued update" };
    const { error } = await table.update(mutation.payload!).eq(mutation.match.column, mutation.match.value);
    return { error: error?.message ?? null };
  }
  // delete
  if (!mutation.match) return { error: "Missing match condition for queued delete" };
  const { error } = await table.delete().eq(mutation.match.column, mutation.match.value);
  return { error: error?.message ?? null };
}

export async function syncPendingMutations(supabase: SupabaseClient): Promise<SyncSummary> {
  const pending = await getPendingMutations();
  let synced = 0;
  let failed = 0;

  // Sequential, not Promise.all - order matters (see header comment),
  // and a real backend rejects out-of-order writes far more confusingly
  // than a slightly slower sequential replay does.
  for (const mutation of pending) {
    const { error } = await applyMutation(supabase, mutation);
    if (error) {
      await markMutationFailed(mutation.id, error);
      failed++;
    } else {
      await removeMutation(mutation.id);
      synced++;
    }
  }

  return { synced, failed };
}
