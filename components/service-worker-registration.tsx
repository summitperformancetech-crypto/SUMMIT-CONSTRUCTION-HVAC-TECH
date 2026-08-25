"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Best-effort - a failed registration means no offline page
      // caching, not a broken app. lib/offlineQueue.ts's write queue
      // works independently of this (it's plain IndexedDB from the main
      // thread, not something the service worker mediates).
    });
  }, []);

  return null;
}
