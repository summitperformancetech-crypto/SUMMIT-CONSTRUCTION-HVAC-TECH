"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type DiffuserDefaultRow = {
  patternType: string;
  tagCode: string;
  description: string;
  manufacturer: string;
  model: string | null;
};

export type DuctMaterialDefaultRow = {
  materialCode: string;
  displayName: string;
  manufacturer: string;
  productLine: string | null;
};

function SavableTextField({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      type="text"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold disabled:opacity-50"
    />
  );
}

export function DuctHardwareDefaultsSettings({
  orgId,
  initialDiffuserRows,
  initialMaterialRows,
}: {
  orgId: string;
  initialDiffuserRows: DiffuserDefaultRow[];
  initialMaterialRows: DuctMaterialDefaultRow[];
}) {
  const [diffuserRows, setDiffuserRows] = useState(initialDiffuserRows);
  const [materialRows, setMaterialRows] = useState(initialMaterialRows);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveDiffuser(patternType: string, field: "manufacturer" | "model", value: string) {
    const current = diffuserRows.find((r) => r.patternType === patternType);
    if (!current) return;
    const next = { ...current, [field]: field === "model" ? value || null : value };
    setSavingKey(`diffuser:${patternType}`);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("diffuser_org_defaults").upsert(
      {
        org_id: orgId,
        pattern_type: patternType,
        manufacturer: next.manufacturer,
        model: next.model,
      },
      { onConflict: "org_id,pattern_type" },
    );
    setSavingKey(null);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setDiffuserRows((prev) => prev.map((r) => (r.patternType === patternType ? next : r)));
  }

  async function saveMaterial(materialCode: string, field: "manufacturer" | "productLine", value: string) {
    const current = materialRows.find((r) => r.materialCode === materialCode);
    if (!current) return;
    const next = { ...current, [field]: field === "productLine" ? value || null : value };
    setSavingKey(`material:${materialCode}`);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("duct_material_org_defaults").upsert(
      {
        org_id: orgId,
        material_code: materialCode,
        manufacturer: next.manufacturer,
        product_line: next.productLine,
      },
      { onConflict: "org_id,material_code" },
    );
    setSavingKey(null);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setMaterialRows((prev) => prev.map((r) => (r.materialCode === materialCode ? next : r)));
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-md border border-red-800 bg-zinc-900 px-4 py-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-brand-gold/50 bg-brand-bg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-gold/50 text-left text-xs uppercase tracking-wide text-brand-grey-text">
              <th className="px-4 py-3">Diffuser Pattern</th>
              <th className="px-4 py-3">Manufacturer</th>
              <th className="px-4 py-3">Model</th>
            </tr>
          </thead>
          <tbody>
            {diffuserRows.map((row) => (
              <tr key={row.patternType} className="border-b border-zinc-900">
                <td className="px-4 py-3 text-brand-silver-highlight">
                  <div>{row.description.split(" - ")[0]}</div>
                  <div className="text-xs text-brand-grey-text">Tag {row.tagCode}</div>
                </td>
                <td className="px-4 py-3">
                  <SavableTextField
                    value={row.manufacturer}
                    disabled={savingKey === `diffuser:${row.patternType}`}
                    onCommit={(v) => saveDiffuser(row.patternType, "manufacturer", v)}
                  />
                </td>
                <td className="px-4 py-3">
                  <SavableTextField
                    value={row.model ?? ""}
                    disabled={savingKey === `diffuser:${row.patternType}`}
                    onCommit={(v) => saveDiffuser(row.patternType, "model", v)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-brand-grey-text">
          Applied when the install package generator specs a diffuser of this pattern type and no
          project-specific selection has been made.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-brand-gold/50 bg-brand-bg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-gold/50 text-left text-xs uppercase tracking-wide text-brand-grey-text">
              <th className="px-4 py-3">Duct Material</th>
              <th className="px-4 py-3">Manufacturer</th>
              <th className="px-4 py-3">Product Line</th>
            </tr>
          </thead>
          <tbody>
            {materialRows.map((row) => (
              <tr key={row.materialCode} className="border-b border-zinc-900">
                <td className="px-4 py-3 text-brand-silver-highlight">{row.displayName}</td>
                <td className="px-4 py-3">
                  <SavableTextField
                    value={row.manufacturer}
                    disabled={savingKey === `material:${row.materialCode}`}
                    onCommit={(v) => saveMaterial(row.materialCode, "manufacturer", v)}
                  />
                </td>
                <td className="px-4 py-3">
                  <SavableTextField
                    value={row.productLine ?? ""}
                    disabled={savingKey === `material:${row.materialCode}`}
                    onCommit={(v) => saveMaterial(row.materialCode, "productLine", v)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-brand-grey-text">
          Applied when the install package generator specs duct of this material/insulation tier
          and no project-specific selection has been made.
        </p>
      </div>
    </div>
  );
}
