// The actual call site helper - a field-data-entry component calls
// mutateOrQueue instead of supabase.from(table).insert/update/delete
// directly. Distinguishes "genuinely no network" (queue it, retry later)
// from "the network worked but the server rejected it" (a real RLS
// violation, a check-constraint failure, a validation error) - only the
// first case is safe to silently defer. Silently queuing a real
// rejection would mean it fails again, identically, the next time it
// syncs, with the tech having no idea their data was never actually
// accepted the first time either.
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueMutation, type MutationOperation } from "./offlineQueue";

export type MutateResult = {
  error: string | null;
  queued: boolean;
};

export function isNetworkError(error: unknown): boolean {
  // Browser fetch throws a TypeError with this message on a genuine
  // network failure (offline, DNS failure, connection refused) - not on
  // an HTTP error response, which fetch resolves normally and Supabase
  // surfaces as a real {error} object instead of throwing.
  return error instanceof TypeError && /fetch/i.test(error.message);
}

export async function mutateOrQueue(
  supabase: SupabaseClient,
  input: {
    table: string;
    operation: MutationOperation;
    payload: Record<string, unknown> | null;
    match: { column: string; value: string } | null;
  },
): Promise<MutateResult> {
  // navigator.onLine is a real, if imperfect, signal (true doesn't
  // guarantee actual connectivity, but false reliably means "don't
  // bother trying") - checking it first avoids a slow, doomed fetch
  // timeout on every write while genuinely offline.
  const knownOffline = typeof navigator !== "undefined" && navigator.onLine === false;

  if (!knownOffline) {
    try {
      const table = supabase.from(input.table);
      let error: { message: string } | null = null;

      if (input.operation === "insert") {
        ({ error } = await table.insert(input.payload!));
      } else if (input.operation === "update") {
        ({ error } = await table.update(input.payload!).eq(input.match!.column, input.match!.value));
      } else {
        ({ error } = await table.delete().eq(input.match!.column, input.match!.value));
      }

      if (!error) return { error: null, queued: false };
      // A real server-side rejection (RLS, constraint, validation) -
      // surface it immediately, never queue it for a doomed retry.
      return { error: error.message, queued: false };
    } catch (err) {
      if (!isNetworkError(err)) {
        return { error: err instanceof Error ? err.message : "Unknown error", queued: false };
      }
      // Fall through to queueing below - a genuine network failure.
    }
  }

  await enqueueMutation(input);
  return { error: null, queued: true };
}
