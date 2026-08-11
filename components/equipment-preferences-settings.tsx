"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type EquipmentPreferenceRow = {
  equipmentId: string;
  manufacturer: string;
  modelNumber: string;
  equipmentType: string;
  isPreferred: boolean;
  isExclusive: boolean;
};

export function EquipmentPreferencesSettings({
  orgId,
  initialRows,
}: {
  orgId: string;
  initialRows: EquipmentPreferenceRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(equipmentId: string, field: "isPreferred" | "isExclusive") {
    const current = rows.find((r) => r.equipmentId === equipmentId);
    if (!current) return;
    const next = { ...current, [field]: !current[field] };
    setSavingId(equipmentId);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("equipment_org_preferences").upsert(
      {
        org_id: orgId,
        equipment_id: equipmentId,
        is_preferred: next.isPreferred,
        is_exclusive: next.isExclusive,
      },
      { onConflict: "org_id,equipment_id" },
    );
    setSavingId(null);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.equipmentId === equipmentId ? next : r)));
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-brand-gold/50 bg-brand-bg">
      {error && (
        <p className="border-b border-red-800 px-4 py-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brand-gold/50 text-left text-xs uppercase tracking-wide text-brand-grey-text">
            <th className="px-4 py-3">Equipment</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3 text-center">Preferred</th>
            <th className="px-4 py-3 text-center">Exclusive</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.equipmentId} className="border-b border-zinc-900">
              <td className="px-4 py-3 text-brand-silver-highlight">
                {row.manufacturer} {row.modelNumber}
              </td>
              <td className="px-4 py-3 text-brand-grey-text">{row.equipmentType}</td>
              <td className="px-4 py-3 text-center">
                <input
                  type="checkbox"
                  checked={row.isPreferred}
                  disabled={savingId === row.equipmentId}
                  onChange={() => toggle(row.equipmentId, "isPreferred")}
                  className="h-4 w-4 accent-brand-gold"
                />
              </td>
              <td className="px-4 py-3 text-center">
                <input
                  type="checkbox"
                  checked={row.isExclusive}
                  disabled={savingId === row.equipmentId}
                  onChange={() => toggle(row.equipmentId, "isExclusive")}
                  className="h-4 w-4 accent-brand-gold"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-brand-grey-text">
        Preferred/exclusive lines get a display-order boost on ties or near-ties in Manual S
        equipment selection results - they never change a unit&apos;s compatibility score, which
        stays based only on Manual J load and OEM performance data.
      </p>
    </div>
  );
}
