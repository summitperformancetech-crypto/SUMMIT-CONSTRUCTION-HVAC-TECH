"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import { getPendingCount } from "./offlineQueue";
import { syncPendingMutations } from "./offlineSync";

export type OfflineSyncState = {
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  syncNow: () => Promise<void>;
};

// Single source of truth for "am I online, and do I have unsynced field
// data" - mounted once (components/offline-status-banner.tsx) so every
// page shares the same state rather than each maintaining its own poll.
export function useOfflineSync(): OfflineSyncState {
  // Lazy initializer, not a setState call inside the effect below - this
  // is the "read the real value once on mount" case the effect used to
  // handle by calling setIsOnline synchronously, which triggers an
  // avoidable extra render (react-hooks/set-state-in-effect).
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      setPendingCount(await getPendingCount());
    } catch {
      // IndexedDB unavailable (e.g. private-browsing restrictions in
      // some browsers) - pending count just can't be shown; the direct
      // online-path write in lib/offlineMutation.ts still works fine.
    }
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const supabase = createClient();
      await syncPendingMutations(supabase);
    } finally {
      setSyncing(false);
      await refreshPendingCount();
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    // Legitimate initial-data-fetch-on-mount, not the synchronous-setState
    // anti-pattern this lint rule targets - refreshPendingCount's own
    // setPendingCount call happens after a real await (reading
    // IndexedDB), it just isn't visible to the rule's static analysis
    // through the function call boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshPendingCount();

    function handleOnline() {
      setIsOnline(true);
      syncNow();
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshPendingCount, syncNow]);

  return { isOnline, pendingCount, syncing, syncNow };
}
