"use client";

import { useOfflineSync } from "@/lib/useOfflineSync";

// Mounted once in the dashboard layout - visible on every page a field
// tech actually works in. Silent (renders nothing) in the common case
// (online, nothing pending) so it never adds noise to a normal session.
export function OfflineStatusBanner() {
  const { isOnline, pendingCount, syncing, syncNow } = useOfflineSync();

  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      className={`border-b px-6 py-2 text-center text-xs font-medium ${
        isOnline ? "border-brand-gold/50 bg-brand-gold-base/10 text-brand-gold-hover" : "border-red-900 bg-red-950 text-red-300"
      }`}
    >
      {!isOnline && (
        <span>
          Offline{pendingCount > 0 ? ` — ${pendingCount} change${pendingCount === 1 ? "" : "s"} will sync when you're back online` : ""}
        </span>
      )}
      {isOnline && pendingCount > 0 && (
        <span>
          {syncing ? "Syncing…" : `${pendingCount} offline change${pendingCount === 1 ? "" : "s"} waiting to sync.`}{" "}
          {!syncing && (
            <button onClick={syncNow} className="underline decoration-dotted hover:text-brand-gold">
              Sync now
            </button>
          )}
        </span>
      )}
    </div>
  );
}
