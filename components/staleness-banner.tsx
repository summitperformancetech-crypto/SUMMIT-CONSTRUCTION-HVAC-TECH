"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { StalenessKey } from "@/lib/staleness";

// Data Integrity Addendum, Section 2 - visibility only, never blocks work
// (this project is still unfinalized and correctly keeps pulling live
// reference data, same as before this addendum - see page.tsx for the
// "no snapshot yet" gate that decides whether this renders at all).
// Dismissing a line logs an audit row (staleness_banner_dismissals, same
// append-only philosophy as field_resolutions) and removes it from view
// until that specific table changes again.
export function StalenessBanner({
  projectId,
  initialStaleItems,
}: {
  projectId: string;
  initialStaleItems: { key: StalenessKey; message: string }[];
}) {
  const [items, setItems] = useState(initialStaleItems);
  const [dismissing, setDismissing] = useState<StalenessKey | null>(null);

  async function handleDismiss(key: StalenessKey) {
    setDismissing(key);
    const supabase = createClient();
    const { error } = await supabase
      .from("staleness_banner_dismissals")
      .insert({ project_id: projectId, reference_table: key });
    setDismissing(null);
    if (error) return;
    setItems((prev) => prev.filter((item) => item.key !== key));
  }

  if (items.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {items.map((item) => (
        <div
          key={item.key}
          className="flex items-start justify-between gap-4 rounded-lg border border-brand-gold/50 bg-brand-gold-base/10 px-4 py-3 text-sm text-brand-silver-highlight"
        >
          <span>{item.message}</span>
          <button
            onClick={() => handleDismiss(item.key)}
            disabled={dismissing === item.key}
            className="shrink-0 text-xs text-brand-grey-text transition hover:text-brand-gold-hover disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
