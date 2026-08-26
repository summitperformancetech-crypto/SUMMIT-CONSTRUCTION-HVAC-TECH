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
  // Always starts true (never navigator.onLine) - diagnosed 2026-08-26
  // via a real hydration-mismatch error: the server has no `navigator`
  // and always renders as online, but the OLD lazy initializer here read
  // the real navigator.onLine value synchronously during the client's
  // FIRST render (hydration itself, not after it) - if the browser
  // happened to report offline at that instant (headless Chrome/
  // Puppeteer reports this by default, with no real network interface to
  // track), the client's first paint disagreed with the server's and
  // React discarded the whole tree. Starting both server and client at
  // the same fixed value guarantees the first paint always matches; the
  // real value is read exactly once in the mount effect below instead,
  // safely after hydration has already completed.
  const [isOnline, setIsOnline] = useState(true);
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

    // Corrects the initial always-true guess with the real value, now
    // that we're safely past hydration (see the isOnline useState
    // comment above) - synchronizing React state with a browser API
    // unavailable during SSR can't happen any earlier than this.
    if (!navigator.onLine) {
      setIsOnline(false);
    }

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
