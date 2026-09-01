"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { evaluateMakeupAirBalance, type ExhaustSourceType, type MakeupAirUnitSpec } from "@/lib/makeupAir";
import { computeLocalExhaustRequirement, type LocalExhaustRequirement } from "@/lib/localExhaust";

export type ExhaustSourceRow = {
  id: string;
  roomId: string | null;
  sourceType: ExhaustSourceType;
  description: string | null;
  ratedCfm: number;
  basis: "field_measured" | "manufacturer_spec" | "engineering_estimate" | "code_minimum";
  reviewStatus: "confirmed" | "pending_review";
  codeCitation: string | null;
  selectedEquipmentId: string | null;
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

export type ExhaustFanCatalogOption = {
  equipmentId: string;
  manufacturer: string;
  modelNumber: string;
  fanCategory: "bathroom" | "kitchen_range_hood" | "kitchen_downdraft" | "multi_purpose";
  minRatedCfm: number;
  maxRatedCfm: number;
  soneRating: number | null;
  hviCertified: boolean;
  hasBackdraftDamper: boolean;
};

export type ExhaustRoomLookup = {
  id: string;
  name: string;
  roomType: string | null;
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

// Real fixture-category compatibility - a bathroom fan is never offered
// for a kitchen exhaust source and vice versa. multi_purpose (rated and
// certified for either use) is the only category valid for both.
const FAN_CATEGORIES_BY_SOURCE_TYPE: Partial<Record<ExhaustSourceType, ExhaustFanCatalogOption["fanCategory"][]>> = {
  bathroom_exhaust_fan: ["bathroom", "multi_purpose"],
  kitchen_range_hood: ["kitchen_range_hood", "kitchen_downdraft", "multi_purpose"],
};

const EXHAUST_SOURCE_SELECT_COLUMNS =
  "id, room_id, source_type, description, rated_cfm, basis, review_status, code_citation, selected_equipment_id";

function optionLabel(option: MakeupAirCatalogOption): string {
  const range =
    option.minRatedCfm != null && option.maxRatedCfm != null
      ? `${option.minRatedCfm}-${option.maxRatedCfm} cfm`
      : option.ductDiameterIn != null
        ? `${option.ductDiameterIn}" duct`
        : "cfm not published";
  return `${option.manufacturer} ${option.modelNumber} (${range})`;
}

function fanOptionLabel(option: ExhaustFanCatalogOption): string {
  const cfm = option.minRatedCfm === option.maxRatedCfm ? `${option.maxRatedCfm} cfm` : `${option.minRatedCfm}-${option.maxRatedCfm} cfm`;
  const sone = option.soneRating != null ? `, ${option.soneRating} sone` : "";
  return `${option.manufacturer} ${option.modelNumber} (${cfm}${sone})`;
}

// Real code-gated candidate list for one exhaust source: only equipment
// of the matching real fixture category AND whose real published max
// CFM meets or exceeds the room's real IRC-computed requirement - a hard
// filter, never a softer ranking that still lets an undersized or
// wrong-category fan be picked.
function fanCandidatesFor(
  source: ExhaustSourceRow,
  rooms: ExhaustRoomLookup[],
  exhaustFanCatalogOptions: ExhaustFanCatalogOption[],
): { requirement: LocalExhaustRequirement | null; candidates: ExhaustFanCatalogOption[] } {
  const allowedCategories = FAN_CATEGORIES_BY_SOURCE_TYPE[source.sourceType];
  if (!allowedCategories) return { requirement: null, candidates: [] };
  const room = source.roomId ? rooms.find((r) => r.id === source.roomId) : undefined;
  const requirement = room ? computeLocalExhaustRequirement(room.roomType, room.name) : null;
  if (!requirement) return { requirement: null, candidates: [] };
  const candidates = exhaustFanCatalogOptions.filter(
    (o) => allowedCategories.includes(o.fanCategory) && o.maxRatedCfm >= requirement.requiredCfm,
  );
  return { requirement, candidates };
}

export function MakeupAirSection({
  projectId,
  initialExhaustSources,
  catalogOptions,
  initialSelectedMakeupAirEquipmentId,
  exhaustFanCatalogOptions,
  rooms,
  onMutate,
}: {
  projectId: string;
  initialExhaustSources: ExhaustSourceRow[];
  catalogOptions: MakeupAirCatalogOption[];
  initialSelectedMakeupAirEquipmentId: string | null;
  exhaustFanCatalogOptions: ExhaustFanCatalogOption[];
  rooms: ExhaustRoomLookup[];
  // FIX-PIPELINE: called after any change (an exhaust source added /
  // confirmed / removed, a makeup-air unit picked) so the guided stepper
  // re-fetches shared pipeline state - the ventilation stage gates on no
  // exhaust source being left pending_review.
  onMutate?: () => void;
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
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [savingFanId, setSavingFanId] = useState<string | null>(null);

  const selectedUnit = useMemo(() => catalogOptions.find((o) => o.equipmentId === selectedId) ?? null, [catalogOptions, selectedId]);

  // Only confirmed sources count toward the check - a pending_review row
  // is a real, IRC-cited draft this app auto-computed from a room's
  // classified type (lib/localExhaust.ts), but per the standing human-
  // review-gate rule it isn't treated as final until a tech confirms it.
  // Same filter lib/reportData.ts applies at report-generation time, so
  // this live preview can never disagree with what the PDF shows.
  const confirmedSources = useMemo(() => sources.filter((s) => s.reviewStatus === "confirmed"), [sources]);
  const pendingSources = useMemo(() => sources.filter((s) => s.reviewStatus === "pending_review"), [sources]);

  const result = useMemo(
    () =>
      evaluateMakeupAirBalance(
        confirmedSources.map((s) => ({ id: s.id, roomId: s.roomId, sourceType: s.sourceType, description: s.description, ratedCfm: s.ratedCfm })),
        selectedUnit
          ? { category: selectedUnit.category, minRatedCfm: selectedUnit.minRatedCfm, maxRatedCfm: selectedUnit.maxRatedCfm }
          : null,
      ),
    [confirmedSources, selectedUnit],
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
      .select(EXHAUST_SOURCE_SELECT_COLUMNS)
      .single();
    setAdding(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Failed to add exhaust source.");
      return;
    }
    setSources((prev) => [
      ...prev,
      {
        id: data.id,
        roomId: data.room_id,
        sourceType: data.source_type,
        description: data.description,
        ratedCfm: data.rated_cfm,
        basis: data.basis,
        reviewStatus: data.review_status,
        codeCitation: data.code_citation,
        selectedEquipmentId: data.selected_equipment_id,
      },
    ]);
    setNewDescription("");
    setNewCfm("");
    onMutate?.();
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
    onMutate?.();
  }

  async function handleConfirmSource(id: string) {
    setError(null);
    setConfirmingId(id);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("exhaust_sources").update({ review_status: "confirmed" }).eq("id", id);
    setConfirmingId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, reviewStatus: "confirmed" } : s)));
    onMutate?.();
  }

  async function handleSelectFan(sourceId: string, equipmentId: string, candidates: ExhaustFanCatalogOption[]) {
    setError(null);
    if (!equipmentId) {
      setSavingFanId(sourceId);
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("exhaust_sources")
        .update({ selected_equipment_id: null })
        .eq("id", sourceId);
      setSavingFanId(null);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, selectedEquipmentId: null } : s)));
      return;
    }
    const fan = candidates.find((c) => c.equipmentId === equipmentId);
    if (!fan) return;
    setSavingFanId(sourceId);
    const supabase = createClient();
    // Once a real fan is selected, this source's rated_cfm becomes that
    // real product's own published max CFM (basis: manufacturer_spec) -
    // it replaces the code-minimum draft value, it doesn't just record a
    // pick alongside it.
    const { error: updateError } = await supabase
      .from("exhaust_sources")
      .update({ selected_equipment_id: fan.equipmentId, rated_cfm: fan.maxRatedCfm, basis: "manufacturer_spec" })
      .eq("id", sourceId);
    setSavingFanId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSources((prev) =>
      prev.map((s) => (s.id === sourceId ? { ...s, selectedEquipmentId: fan.equipmentId, ratedCfm: fan.maxRatedCfm, basis: "manufacturer_spec" } : s)),
    );
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
      return;
    }
    onMutate?.();
  }

  function renderFanSelection(source: ExhaustSourceRow) {
    const { requirement, candidates } = fanCandidatesFor(source, rooms, exhaustFanCatalogOptions);
    if (!requirement) return null;
    const selectedFan = source.selectedEquipmentId
      ? exhaustFanCatalogOptions.find((o) => o.equipmentId === source.selectedEquipmentId) ?? null
      : null;
    return (
      <div className="mt-2 rounded-md border border-zinc-800 bg-black/20 px-3 py-2">
        <p className="text-xs text-brand-grey-text">
          Room requires {requirement.requiredCfm} cfm ({requirement.codeCitation}). Only equipment meeting or exceeding
          this is selectable.
        </p>
        <select
          value={source.selectedEquipmentId ?? ""}
          onChange={(e) => handleSelectFan(source.id, e.target.value, candidates)}
          disabled={savingFanId === source.id}
          className="mt-1 w-full max-w-md rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-brand-silver-highlight outline-none focus:border-brand-gold disabled:opacity-50"
        >
          <option value="">
            {candidates.length === 0 ? "No cataloged equipment meets this requirement yet" : "None selected"}
          </option>
          {candidates.map((c) => (
            <option key={c.equipmentId} value={c.equipmentId}>
              {fanOptionLabel(c)}
            </option>
          ))}
        </select>
        {selectedFan && (
          <p className="mt-1 text-xs text-brand-grey-text">
            {selectedFan.hviCertified ? "HVI certified" : "HVI certification not confirmed"} ·{" "}
            {selectedFan.hasBackdraftDamper ? "has backdraft damper" : "backdraft damper not confirmed"}
          </p>
        )}
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
      <h2 className="mb-1 text-lg font-semibold text-brand-gold">Makeup Air Balance</h2>
      <p className="mb-4 text-xs text-brand-grey-text">
        Any range hood, bath/utility exhaust fan, dryer, or process exhaust that vents to the exterior pulls the
        building toward negative pressure. Checked against the real IRC makeup-air triggers - 400 cfm for range hoods
        (M1503.5), 200 cfm for clothes dryers (M1502.7).
      </p>

      {error && (
        <p className="mb-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {pendingSources.length > 0 && (
        <div className="mb-4 rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-brand-gold">
            Auto-computed from room type - confirm before it counts toward the check
          </p>
          {pendingSources.map((s) => (
            <div key={s.id} className="mb-2 border-t border-zinc-800 pt-2 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-brand-silver-highlight">
                    {SOURCE_TYPE_LABEL[s.sourceType]} - {s.ratedCfm} cfm
                  </p>
                  <p className="text-xs text-brand-grey-text">{s.codeCitation ?? s.description}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleConfirmSource(s.id)}
                    disabled={confirmingId === s.id}
                    className="rounded-md bg-brand-gold px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
                  >
                    {confirmingId === s.id ? "Confirming…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveSource(s.id)}
                    className="rounded-md border border-red-900 px-3 py-1.5 text-xs text-red-400 transition hover:border-red-700 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {renderFanSelection(s)}
            </div>
          ))}
        </div>
      )}

      {confirmedSources.length > 0 ? (
        <div className="mb-4">
          {confirmedSources.map((s) => (
            <div key={s.id} className="border-t border-zinc-800 py-2 first:border-t-0 text-brand-silver-highlight">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm">
                    {SOURCE_TYPE_LABEL[s.sourceType]} <span className="text-brand-grey-text">- {s.description ?? "no description"}</span>
                  </p>
                </div>
                <p className="text-sm">{s.ratedCfm} cfm</p>
                <button
                  type="button"
                  onClick={() => handleRemoveSource(s.id)}
                  className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-400 transition hover:border-red-700 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
              {renderFanSelection(s)}
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-4 text-center text-sm text-brand-grey-text">
          No confirmed exhaust sources yet.
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
