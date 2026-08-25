"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PREFERRED_MANUFACTURER_RESULT_COUNT } from "@/lib/manualS";

// Manufacturer options come from the manufacturer list already loaded for
// the equipment catalog (see ManualJWorkflow) - a DISTINCT over live
// equipment_catalog rows, never a hardcoded list. A new manufacturer
// becomes selectable here the instant its catalog rows are seeded, no
// code change needed (see supabase/migrations/20260825060000_add_preferred_manufacturer.sql).
export function PreferredManufacturerSection({
  projectId,
  manufacturers,
  initialPreferredManufacturer,
  onSaved,
}: {
  projectId: string;
  manufacturers: string[];
  initialPreferredManufacturer: string | null;
  onSaved: (manufacturer: string | null) => void;
}) {
  const [selected, setSelected] = useState(initialPreferredManufacturer ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(value: string) {
    setSelected(value);
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("projects")
      .update({ preferred_manufacturer: value || null })
      .eq("id", projectId);
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    onSaved(value || null);
  }

  return (
    <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
      <h2 className="mb-2 text-lg font-semibold text-brand-gold">Preferred Manufacturer</h2>
      <p className="mb-4 text-xs text-brand-grey-text">
        Manual S surfaces this manufacturer&apos;s top {PREFERRED_MANUFACTURER_RESULT_COUNT} most
        compatible models first for every
        zone below. Compatibility scores are never affected by this choice - it only changes
        which results are shown. If the preferred manufacturer has no compatible matches for a
        zone, its top matches across all manufacturers are shown instead, with a clear note.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-grey-text">
            Preferred manufacturer
          </label>
          <select
            value={selected}
            disabled={saving}
            onChange={(e) => handleChange(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold disabled:opacity-50"
          >
            <option value="">No preference - show top matches across all manufacturers</option>
            {manufacturers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        {saving && <span className="text-xs text-brand-grey-text">Saving…</span>}
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          Failed to save preferred manufacturer: {error}
        </p>
      )}
    </section>
  );
}
