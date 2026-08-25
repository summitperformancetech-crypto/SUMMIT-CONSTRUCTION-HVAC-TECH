"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type HvacSystemConfiguration = "independent_per_zone" | "single_system_zoned";

const OPTIONS: { value: HvacSystemConfiguration; label: string; description: string }[] = [
  {
    value: "independent_per_zone",
    label: "Independent system per zone",
    description:
      "One equipment panel per zone, each sized to that zone's own load. Simpler to balance; some zones (especially a small upstairs load) may not have a catalog unit that fits.",
  },
  {
    value: "single_system_zoned",
    label: "Single system, zoned with dampers",
    description:
      "One combined equipment panel sized to every zone's summed load, served through zone dampers. Lets one right-sized system cover a zone too small for its own dedicated unit - harder to balance than independent systems, a real tradeoff some contractors prefer to avoid.",
  },
];

// Project-level, not per-zone - a real design decision (ducted+dampers vs.
// independent systems, e.g. a mini-split for a small zone) that the app
// can't infer from load numbers alone. Changing it changes how
// EquipmentSelectionSection panels are grouped in ManualJWorkflow's
// equipmentPanels - see that useMemo for the combined-load derivation.
export function SystemConfigurationSection({
  projectId,
  initialSystemConfiguration,
  onSaved,
}: {
  projectId: string;
  initialSystemConfiguration: HvacSystemConfiguration;
  onSaved: (value: HvacSystemConfiguration) => void;
}) {
  const [selected, setSelected] = useState<HvacSystemConfiguration>(initialSystemConfiguration);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(value: HvacSystemConfiguration) {
    setSelected(value);
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: saveError } = await supabase
        .from("projects")
        .update({ hvac_system_configuration: value })
        .eq("id", projectId);
      if (saveError) {
        setError(saveError.message);
        return;
      }
      onSaved(value);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save system configuration - check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
      <h2 className="mb-2 text-lg font-semibold text-brand-gold">System Configuration</h2>
      <p className="mb-4 text-xs text-brand-grey-text">
        How is this project&apos;s HVAC actually laid out? This changes how equipment is grouped for
        selection below - Manual D duct design stays per-zone either way.
      </p>
      <div className="space-y-2">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
              selected === opt.value
                ? "border-brand-gold bg-brand-gold/10"
                : "border-zinc-700 bg-zinc-900 hover:border-brand-gold-hover"
            } ${saving ? "opacity-50" : ""}`}
          >
            <input
              type="radio"
              name="hvac_system_configuration"
              value={opt.value}
              checked={selected === opt.value}
              disabled={saving}
              onChange={() => handleChange(opt.value)}
              className="mt-1 accent-brand-gold"
            />
            <div>
              <p className="text-sm font-medium text-brand-silver-highlight">{opt.label}</p>
              <p className="text-xs text-brand-grey-text">{opt.description}</p>
            </div>
          </label>
        ))}
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          Failed to save system configuration: {error}
        </p>
      )}
    </section>
  );
}
