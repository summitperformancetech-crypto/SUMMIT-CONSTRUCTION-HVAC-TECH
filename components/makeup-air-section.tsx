"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { evaluateMakeupAirBalance, type ExhaustSourceType, type MakeupAirUnitSpec } from "@/lib/makeupAir";

export type ExhaustSourceRow = {
  id: string;
  roomId: string | null;
  sourceType: ExhaustSourceType;
  description: string | null;
  ratedCfm: number;
};

export type MakeupAirCatalogOption = {
  equipmentId: string;
  manufacturer: string;
  modelNumber: string;
  category: MakeupAirUnitSpec["category"];
  ductDiameterIn: number | null;
  minRatedCfm: number | null;
  maxRatedCfm: number | null;
  controlType: string;
};

const SOURCE_TYPE_LABEL: Record<ExhaustSourceType, string> = {
  kitchen_range_hood: "Kitchen Range Hood",
  bathroom_exhaust_fan: "Bathroom/Utility Exhaust Fan",
  clothes_dryer: "Clothes Dryer",
  general_exhaust_fan: "General Exhaust Fan",
  industrial_process_exhaust: "Industrial Process Exhaust",
  other: "Other",
};

const STATUS_TEXT_CLASS: Record<string, string> = {
  resolved: "text-brand-success",
  flagged: "text-red-400",
  not_applicable: "text-brand-grey-text",
};

const STATUS_LABEL: Record<string, string> = {
  resolved: "Resolved",
  flagged: "Flagged",
  not_applicable: "Not Applicable",
};

function optionLabel(option: MakeupAirCatalogOption): string {
  const range =
    option.minRatedCfm != null && option.maxRatedCfm != null
      ? `${option.minRatedCfm}-${option.maxRatedCfm} cfm`
      : option.ductDiameterIn != null
        ? `${option.ductDiameterIn}" duct`
        : "cfm not published";
  return `${option.manufacturer} ${option.modelNumber} (${range})`;
}

export function MakeupAirSection({
  projectId,
  initialExhaustSources,
  catalogOptions,
  initialSelectedMakeupAirEquipmentId,
}: {
  projectId: string;
  initialExhaustSources: ExhaustSourceRow[];
  catalogOptions: MakeupAirCatalogOption[];
  initialSelectedMakeupAirEquipmentId: string | null;
}) {
  // Unlike HVAC equipment selection (Manual S - see equipment-selection-
  // section.tsx's canSelectEquipment), there's no admin/estimator-only
  // restriction on entering exhaust sources or picking a makeup-air
  // unit - this is plain project data entry (real field-measured/
  // manufacturer-spec CFM numbers), same as room dimensions or
  // process_loads, which this codebase's own convention leaves open to
  // every role. RLS on exhaust_sources (admin/estimator OR the
  // project's own creator) is the real boundary, not a client-side gate.
  const [sources, setSources] = useState(initialExhaustSources);
  const [selectedId, setSelectedId] = useState(initialSelectedMakeupAirEquipmentId);
  const [savingSelection, setSavingSelection] = useState(false);
  const [newSourceType, setNewSourceType] = useState<ExhaustSourceType>("kitchen_range_hood");
  const [newDescription, setNewDescription] = useState("");
  const [newCfm, setNewCfm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const selectedUnit = useMemo(() => catalogOptions.find((o) => o.equipmentId === selectedId) ?? null, [catalogOptions, selectedId]);

  // Same real function lib/reportData.ts calls at report-generation time -
  // this preview can never disagree with what the PDF shows, by
  // construction.
  const result = useMemo(
    () =>
      evaluateMakeupAirBalance(
        sources.map((s) => ({ id: s.id, roomId: s.roomId, sourceType: s.sourceType, description: s.description, ratedCfm: s.ratedCfm })),
        selectedUnit
          ? { category: selectedUnit.category, minRatedCfm: selectedUnit.minRatedCfm, maxRatedCfm: selectedUnit.maxRatedCfm }
          : null,
      ),
    [sources, selectedUnit],
  );

  async function handleAddSource() {
    const cfm = Number(newCfm);
    if (!Number.isFinite(cfm) || cfm <= 0) {
      setError("Enter a real, positive CFM value - field-measured or from the exhaust device's own spec sheet.");
      return;
    }
    setAdding(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("exhaust_sources")
      .insert({ project_id: projectId, source_type: newSourceType, description: newDescription || null, rated_cfm: cfm })
      .select("id, room_id, source_type, description, rated_cfm")
      .single();
    setAdding(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Failed to add exhaust source.");
      return;
    }
    setSources((prev) => [
      ...prev,
      { id: data.id, roomId: data.room_id, sourceType: data.source_type, description: data.description, ratedCfm: data.rated_cfm },
    ]);
    setNewDescription("");
    setNewCfm("");
  }

  async function handleRemoveSource(id: string) {
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("exhaust_sources").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleSelectUnit(equipmentId: string) {
    const nextId = equipmentId || null;
    setSelectedId(nextId);
    setSavingSelection(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("projects")
      .update({ selected_makeup_air_equipment_id: nextId })
      .eq("id", projectId);
    setSavingSelection(false);
    if (updateError) {
      setError(updateError.message);
    }
  }

  return (
    <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
      <h2 className="mb-1 text-lg font-semibold text-brand-gold">Makeup Air Balance</h2>
      <p className="mb-4 text-xs text-brand-grey-text">
        Any range hood, bath/utility exhaust fan, dryer, or process exhaust that vents to the exterior pulls the
        building toward negative pressure. Enter each real exhaust source's rated CFM below - this is checked against
        IRC M1503.6&apos;s 400 cfm makeup-air trigger.
      </p>

      {error && (
        <p className="mb-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {sources.length > 0 ? (
        <table className="mb-4 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-brand-grey-text">
              <th className="pb-2">Source</th>
              <th className="pb-2">Description</th>
              <th className="pb-2 text-right">CFM</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-t border-zinc-800 text-brand-silver-highlight">
                <td className="py-2">{SOURCE_TYPE_LABEL[s.sourceType]}</td>
                <td className="py-2 text-brand-grey-text">{s.description ?? "—"}</td>
                <td className="py-2 text-right">{s.ratedCfm}</td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleRemoveSource(s.id)}
                    className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-400 transition hover:border-red-700 hover:text-red-300"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mb-4 rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-4 text-center text-sm text-brand-grey-text">
          No exhaust sources entered yet.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-grey-text">Source type</label>
            <select
              value={newSourceType}
              onChange={(e) => setNewSourceType(e.target.value as ExhaustSourceType)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
            >
              {(Object.keys(SOURCE_TYPE_LABEL) as ExhaustSourceType[]).map((key) => (
                <option key={key} value={key}>
                  {SOURCE_TYPE_LABEL[key]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-grey-text">Description (optional)</label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="e.g. Range hood over island cooktop"
              className="w-64 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-grey-text">Rated CFM</label>
            <input
              type="number"
              min="1"
              value={newCfm}
              onChange={(e) => setNewCfm(e.target.value)}
              className="w-28 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
            />
          </div>
          <button
            type="button"
            onClick={handleAddSource}
            disabled={adding}
            className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
          >
          {adding ? "Adding…" : "Add Source"}
        </button>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-brand-grey-text">Selected makeup-air equipment (optional)</label>
        <select
          value={selectedId ?? ""}
          onChange={(e) => handleSelectUnit(e.target.value)}
          disabled={savingSelection}
          className="w-full max-w-xl rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold disabled:opacity-50"
        >
          <option value="">None selected</option>
          {catalogOptions.map((option) => (
            <option key={option.equipmentId} value={option.equipmentId}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3">
        <p className={`text-sm font-semibold ${STATUS_TEXT_CLASS[result.status] ?? "text-brand-silver-highlight"}`}>
          {STATUS_LABEL[result.status] ?? result.status}
        </p>
        <p className="mt-1 text-sm text-brand-silver-highlight">{result.summary}</p>
        <p className="mt-1 text-xs text-brand-grey-text">{result.detail}</p>
      </div>
    </section>
  );
}
