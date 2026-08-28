"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  computeLatentLoadPintsPerDay,
  dehumidifierCandidatesFor,
  bestAvailableRatedPintsPerDay,
  INSTALLATION_TOPOLOGY_LABEL,
  type DehumidificationInstallationTopology,
  type DehumidifierCatalogOption,
} from "@/lib/dehumidification";
import {
  computeZoneFrictionRates,
  sizeDuctRun,
  interpolateBlowerCfmAtEsp,
  type DuctRunInput,
  type DuctSizingTableRow,
  type BlowerPerformancePoint,
} from "@/lib/manualD";
import type { RoomLoadResult } from "@/lib/manualJ";

export type DehumidificationRoomLookup = {
  id: string;
  name: string;
};

export type DehumidificationSystemRow = {
  id: string;
  name: string;
  installationTopology: DehumidificationInstallationTopology;
  selectedEquipmentId: string | null;
  availableStaticPressureIwc: number | null;
  notes: string | null;
  roomIds: string[];
};

export type DehumidificationDuctRunRow = {
  id: string;
  dehumidificationSystemId: string;
  runType: "supply" | "return";
  lengthFt: number;
  fittingEquivalentLengthFt: number;
  ductShape: "round" | "rectangular";
  targetHeightIn: number | null;
  material: "flex" | "sheet_metal" | "fiberboard";
};

export const DEHUMIDIFICATION_SYSTEM_COLUMNS =
  "id, name, installation_topology, selected_equipment_id, available_static_pressure_iwc, notes";
export const DEHUMIDIFICATION_DUCT_RUN_COLUMNS =
  "id, dehumidification_system_id, run_type, length_ft, fitting_equivalent_length_ft, duct_shape, target_height_in, material";

const MATERIAL_OPTIONS = [
  { value: "flex", label: "Flex" },
  { value: "sheet_metal", label: "Sheet metal" },
  { value: "fiberboard", label: "Fiberboard" },
] as const;

function catalogOptionLabel(option: DehumidifierCatalogOption): string {
  const rated = bestAvailableRatedPintsPerDay(option);
  const point = option.ratedPintsPerDay73_60 != null ? "73F/60%RH" : "80F/60%RH";
  return `${option.manufacturer} ${option.modelNumber} (${rated} ppd @ ${point}, ${option.outletDuctDiameterIn}" duct)`;
}

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function DehumidificationSection({
  projectId,
  rooms,
  roomResults,
  initialSystems,
  initialDuctRuns,
  catalogOptions,
  blowerPerformancePoints,
  ductSizingTable,
}: {
  projectId: string;
  rooms: DehumidificationRoomLookup[];
  roomResults: RoomLoadResult[];
  initialSystems: DehumidificationSystemRow[];
  initialDuctRuns: DehumidificationDuctRunRow[];
  catalogOptions: DehumidifierCatalogOption[];
  blowerPerformancePoints: BlowerPerformancePoint[];
  ductSizingTable: DuctSizingTableRow[];
}) {
  const [systems, setSystems] = useState(initialSystems);
  const [ductRuns, setDuctRuns] = useState(initialDuctRuns);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingSystemId, setSavingSystemId] = useState<string | null>(null);
  const [savingRunId, setSavingRunId] = useState<string | null>(null);

  const latentBtuhByRoomId = useMemo(() => new Map(roomResults.map((r) => [r.roomId, r.coolingLatentBtuh])), [roomResults]);

  // Recompute this system's real duct sizing and persist the snapshot
  // fields (cfm, friction_rate, velocity_fpm, calculated_*, total_
  // effective_length_ft, pressure_drop_iwc) back to duct_runs - same
  // "recompute and re-save on every input change" convention as
  // duct-design-section.tsx's persistRunSnapshot/handleAddRun (the
  // live UI never trusts these columns for display, but they still need
  // to be real and current for any future export that reads duct_runs
  // directly, same rationale as the main system's own duct schedule).
  async function persistSizingForSystem(
    system: DehumidificationSystemRow,
    runsForSystem: DehumidificationDuctRunRow[],
    supabase: ReturnType<typeof createClient>,
  ) {
    const selectedOption = system.selectedEquipmentId
      ? catalogOptions.find((o) => o.equipmentId === system.selectedEquipmentId) ?? null
      : null;
    if (!selectedOption || system.availableStaticPressureIwc == null) return;
    const selectedBlowerPoints = blowerPerformancePoints.filter((p) => p.equipmentId === selectedOption.equipmentId);
    const cfm = interpolateBlowerCfmAtEsp(selectedBlowerPoints, "single", system.availableStaticPressureIwc);
    if (cfm == null) return;

    const ductRunInputs: DuctRunInput[] = runsForSystem.map((r) => ({
      id: r.id,
      zoneId: system.id,
      runType: "branch",
      roomId: null,
      lengthFt: r.lengthFt,
      fittingEquivalentLengthFt: r.fittingEquivalentLengthFt,
      ductShape: r.ductShape,
      targetHeightIn: r.targetHeightIn,
    }));
    const frictionRate = computeZoneFrictionRates(ductRunInputs, system.availableStaticPressureIwc).get(system.id) ?? null;
    if (frictionRate == null) return;

    await Promise.all(
      ductRunInputs.map(async (input) => {
        const sizing = sizeDuctRun(input, cfm, frictionRate, ductSizingTable);
        await supabase
          .from("duct_runs")
          .update({
            cfm: sizing.cfm,
            friction_rate: sizing.frictionRate,
            velocity_fpm: sizing.velocityFpm,
            calculated_diameter_in: sizing.diameterIn,
            calculated_width_in: sizing.widthIn,
            calculated_height_in: sizing.heightIn,
            total_effective_length_ft: sizing.totalEffectiveLengthFt,
            pressure_drop_iwc: sizing.pressureDropIwc,
          })
          .eq("id", input.id);
      }),
    );
  }

  async function handleAddSystem() {
    if (!newName.trim()) {
      setError("Give the dehumidification system a name (e.g. \"Basement Dehumidifier\").");
      return;
    }
    setAdding(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("dehumidification_systems")
      .insert({ project_id: projectId, name: newName.trim(), installation_topology: "dedicated_grilles" })
      .select(DEHUMIDIFICATION_SYSTEM_COLUMNS)
      .single();
    setAdding(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Failed to add dehumidification system.");
      return;
    }
    setSystems((prev) => [
      ...prev,
      {
        id: data.id,
        name: data.name,
        installationTopology: data.installation_topology,
        selectedEquipmentId: data.selected_equipment_id,
        availableStaticPressureIwc: data.available_static_pressure_iwc,
        notes: data.notes,
        roomIds: [],
      },
    ]);
    setNewName("");
  }

  async function handleRemoveSystem(id: string) {
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("dehumidification_systems").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setSystems((prev) => prev.filter((s) => s.id !== id));
    setDuctRuns((prev) => prev.filter((r) => r.dehumidificationSystemId !== id));
  }

  async function handleUpdateSystem(id: string, patch: Record<string, unknown>, localPatch: Partial<DehumidificationSystemRow>) {
    setError(null);
    setSavingSystemId(id);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("dehumidification_systems").update(patch).eq("id", id);
    setSavingSystemId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSystems((prev) => prev.map((s) => (s.id === id ? { ...s, ...localPatch } : s)));
    // Every run's cfm/friction depends on the system's own static-
    // pressure budget and selected equipment - refresh every stored
    // snapshot for this system whenever either changes, same reason
    // duct-design-section.tsx refreshes every run on a project-level
    // settings save.
    if ("available_static_pressure_iwc" in patch || "selected_equipment_id" in patch) {
      const updatedSystem = { ...systems.find((s) => s.id === id)!, ...localPatch };
      const runsForSystem = ductRuns.filter((r) => r.dehumidificationSystemId === id);
      await persistSizingForSystem(updatedSystem, runsForSystem, supabase);
    }
  }

  async function handleToggleRoom(system: DehumidificationSystemRow, roomId: string) {
    setError(null);
    const supabase = createClient();
    const isAssigned = system.roomIds.includes(roomId);
    if (isAssigned) {
      const { error: deleteError } = await supabase
        .from("dehumidification_system_rooms")
        .delete()
        .eq("dehumidification_system_id", system.id)
        .eq("room_id", roomId);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      setSystems((prev) =>
        prev.map((s) => (s.id === system.id ? { ...s, roomIds: s.roomIds.filter((id) => id !== roomId) } : s)),
      );
    } else {
      const { error: insertError } = await supabase
        .from("dehumidification_system_rooms")
        .insert({ dehumidification_system_id: system.id, room_id: roomId });
      if (insertError) {
        setError(insertError.message);
        return;
      }
      setSystems((prev) =>
        prev.map((s) => (s.id === system.id ? { ...s, roomIds: [...s.roomIds, roomId] } : s)),
      );
    }
  }

  async function handleAddDuctRun(systemId: string, runType: "supply" | "return") {
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("duct_runs")
      .insert({
        project_id: projectId,
        dehumidification_system_id: systemId,
        run_type: runType,
        length_ft: 10,
        fitting_equivalent_length_ft: 0,
        duct_shape: "round",
        material: "flex",
        // cfm/friction_rate/velocity_fpm are recomputed live below and
        // re-saved on every edit - these placeholder values are only to
        // satisfy the not-null insert; never trusted for display (same
        // convention as duct-design-section.tsx's own snapshot fields).
        cfm: 0,
        friction_rate: 0,
        velocity_fpm: 0,
      })
      .select(DEHUMIDIFICATION_DUCT_RUN_COLUMNS)
      .single();
    if (insertError || !data) {
      setError(insertError?.message ?? "Failed to add duct run.");
      return;
    }
    const newRun: DehumidificationDuctRunRow = {
      id: data.id,
      dehumidificationSystemId: data.dehumidification_system_id,
      runType: data.run_type,
      lengthFt: data.length_ft,
      fittingEquivalentLengthFt: data.fitting_equivalent_length_ft,
      ductShape: data.duct_shape,
      targetHeightIn: data.target_height_in,
      material: data.material,
    };
    setDuctRuns((prev) => [...prev, newRun]);
    const system = systems.find((s) => s.id === systemId);
    if (system) {
      const runsForSystem = [...ductRuns.filter((r) => r.dehumidificationSystemId === systemId), newRun];
      await persistSizingForSystem(system, runsForSystem, supabase);
    }
  }

  async function handleUpdateDuctRun(id: string, patch: Record<string, unknown>, localPatch: Partial<DehumidificationDuctRunRow>) {
    setError(null);
    setSavingRunId(id);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("duct_runs").update(patch).eq("id", id);
    setSavingRunId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    const updatedRuns = ductRuns.map((r) => (r.id === id ? { ...r, ...localPatch } : r));
    setDuctRuns(updatedRuns);
    const changedRun = updatedRuns.find((r) => r.id === id);
    const system = changedRun ? systems.find((s) => s.id === changedRun.dehumidificationSystemId) : undefined;
    if (system && changedRun) {
      const runsForSystem = updatedRuns.filter((r) => r.dehumidificationSystemId === system.id);
      await persistSizingForSystem(system, runsForSystem, supabase);
    }
  }

  async function handleRemoveDuctRun(id: string) {
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("duct_runs").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setDuctRuns((prev) => prev.filter((r) => r.id !== id));
  }

  function renderSystem(system: DehumidificationSystemRow) {
    const requiredLatentBtuh = system.roomIds.reduce((sum, roomId) => sum + (latentBtuhByRoomId.get(roomId) ?? 0), 0);
    const requiredPintsPerDay = computeLatentLoadPintsPerDay(requiredLatentBtuh);
    const candidates = dehumidifierCandidatesFor(requiredPintsPerDay, catalogOptions);
    const selectedOption = system.selectedEquipmentId
      ? catalogOptions.find((o) => o.equipmentId === system.selectedEquipmentId) ?? null
      : null;
    const selectedBlowerPoints = selectedOption
      ? blowerPerformancePoints.filter((p) => p.equipmentId === selectedOption.equipmentId)
      : [];
    const availableCfm =
      selectedOption && system.availableStaticPressureIwc != null
        ? interpolateBlowerCfmAtEsp(selectedBlowerPoints, "single", system.availableStaticPressureIwc)
        : null;

    const systemDuctRuns = ductRuns.filter((r) => r.dehumidificationSystemId === system.id);
    const ductRunInputs: DuctRunInput[] = systemDuctRuns.map((r) => ({
      id: r.id,
      zoneId: system.id,
      runType: "branch",
      roomId: null,
      lengthFt: r.lengthFt,
      fittingEquivalentLengthFt: r.fittingEquivalentLengthFt,
      ductShape: r.ductShape,
      targetHeightIn: r.targetHeightIn,
    }));
    const frictionRateBySystem = computeZoneFrictionRates(ductRunInputs, system.availableStaticPressureIwc);
    const frictionRate = frictionRateBySystem.get(system.id) ?? null;

    return (
      <div key={system.id} className="mb-4 rounded-md border border-zinc-800 bg-black/20 p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-brand-silver-highlight">{system.name}</p>
          <button
            type="button"
            onClick={() => handleRemoveSystem(system.id)}
            className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-400 transition hover:border-red-700 hover:text-red-300"
          >
            Remove
          </button>
        </div>

        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-grey-text">Installation topology</label>
            <select
              value={system.installationTopology}
              onChange={(e) =>
                handleUpdateSystem(
                  system.id,
                  { installation_topology: e.target.value },
                  { installationTopology: e.target.value as DehumidificationInstallationTopology },
                )
              }
              disabled={savingSystemId === system.id}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold disabled:opacity-50"
            >
              {(Object.keys(INSTALLATION_TOPOLOGY_LABEL) as DehumidificationInstallationTopology[]).map((key) => (
                <option key={key} value={key}>
                  {INSTALLATION_TOPOLOGY_LABEL[key]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-grey-text">
              Available static pressure for this unit&apos;s own duct run (in. w.c.)
            </label>
            <input
              type="number"
              step="0.01"
              value={system.availableStaticPressureIwc ?? ""}
              onChange={(e) =>
                handleUpdateSystem(
                  system.id,
                  { available_static_pressure_iwc: toNullableNumber(e.target.value) },
                  { availableStaticPressureIwc: toNullableNumber(e.target.value) },
                )
              }
              disabled={savingSystemId === system.id}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold disabled:opacity-50"
            />
          </div>
        </div>

        <div className="mb-3">
          <p className="mb-1 text-xs font-medium text-brand-grey-text">Rooms covered by this system</p>
          <div className="flex flex-wrap gap-2">
            {rooms.map((room) => {
              const checked = system.roomIds.includes(room.id);
              return (
                <label
                  key={room.id}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                    checked
                      ? "border-brand-gold bg-brand-gold/10 text-brand-gold"
                      : "border-zinc-700 text-brand-grey-text"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggleRoom(system, room.id)}
                    className="mr-1 align-middle"
                  />
                  {room.name}
                </label>
              );
            })}
          </div>
        </div>

        <div className="mb-3 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2">
          <p className="text-sm text-brand-silver-highlight">
            Real Manual J latent load for the {system.roomIds.length} covered room{system.roomIds.length === 1 ? "" : "s"}:{" "}
            {Math.round(requiredLatentBtuh).toLocaleString()} Btuh
          </p>
          <p className="text-xs text-brand-grey-text">
            = {requiredPintsPerDay.toFixed(1)} pints/day required (1054 Btu/pint conversion). Only equipment whose best
            available real published rating (73F/60%RH when published, else 80F/60%RH) meets or exceeds this is
            selectable.
          </p>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-brand-grey-text">Selected dehumidifier</label>
          <select
            value={system.selectedEquipmentId ?? ""}
            onChange={(e) =>
              handleUpdateSystem(
                system.id,
                { selected_equipment_id: e.target.value || null },
                { selectedEquipmentId: e.target.value || null },
              )
            }
            disabled={savingSystemId === system.id}
            className="w-full max-w-xl rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold disabled:opacity-50"
          >
            <option value="">
              {candidates.length === 0 ? "No cataloged unit meets this requirement yet" : "None selected"}
            </option>
            {candidates.map((c) => (
              <option key={c.equipmentId} value={c.equipmentId}>
                {catalogOptionLabel(c)}
              </option>
            ))}
          </select>
          {selectedOption && (
            <p className="mt-1 text-xs text-brand-grey-text">
              Duct connections: {selectedOption.inletDuctDiameterIn ?? "?"}" inlet
              {selectedOption.secondaryInletDuctDiameterIn != null
                ? ` (+ ${selectedOption.secondaryInletDuctDiameterIn}" ventilation inlet)`
                : ""}
              , {selectedOption.outletDuctDiameterIn}" outlet · Drain: {selectedOption.drainConnectionSpec} ·{" "}
              {selectedOption.hasBackdraftDamper ? "has backdraft damper" : "backdraft damper not confirmed"}
              {availableCfm != null && <> · delivers ~{Math.round(availableCfm)} cfm at the entered static pressure</>}
            </p>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-brand-grey-text">
            Dedicated supply/return ducting (equal-friction sized against this unit&apos;s own blower curve)
          </p>
          {systemDuctRuns.length === 0 && (
            <p className="mb-2 text-xs text-brand-grey-text">No duct runs entered yet.</p>
          )}
          {systemDuctRuns.map((run) => {
            const cfm =
              availableCfm ??
              (system.availableStaticPressureIwc == null ? null : interpolateBlowerCfmAtEsp(selectedBlowerPoints, "single", system.availableStaticPressureIwc));
            const sizing =
              cfm != null && frictionRate != null
                ? sizeDuctRun(
                    { id: run.id, zoneId: system.id, runType: "branch", roomId: null, lengthFt: run.lengthFt, fittingEquivalentLengthFt: run.fittingEquivalentLengthFt, ductShape: run.ductShape, targetHeightIn: run.targetHeightIn },
                    cfm,
                    frictionRate,
                    ductSizingTable,
                  )
                : null;
            return (
              <div key={run.id} className="mb-2 flex flex-wrap items-end gap-2 rounded-md border border-zinc-800 bg-black/20 p-2">
                <span className="rounded bg-zinc-800 px-2 py-1 text-xs uppercase text-brand-grey-text">{run.runType}</span>
                <div>
                  <label className="block text-[10px] text-brand-grey-text">Length (ft)</label>
                  <input
                    type="number"
                    value={run.lengthFt}
                    onChange={(e) =>
                      handleUpdateDuctRun(run.id, { length_ft: Number(e.target.value) || 0 }, { lengthFt: Number(e.target.value) || 0 })
                    }
                    disabled={savingRunId === run.id}
                    className="w-20 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-brand-silver-highlight outline-none focus:border-brand-gold disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-brand-grey-text">Fitting EL (ft)</label>
                  <input
                    type="number"
                    value={run.fittingEquivalentLengthFt}
                    onChange={(e) =>
                      handleUpdateDuctRun(
                        run.id,
                        { fitting_equivalent_length_ft: Number(e.target.value) || 0 },
                        { fittingEquivalentLengthFt: Number(e.target.value) || 0 },
                      )
                    }
                    disabled={savingRunId === run.id}
                    className="w-20 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-brand-silver-highlight outline-none focus:border-brand-gold disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-brand-grey-text">Material</label>
                  <select
                    value={run.material}
                    onChange={(e) => handleUpdateDuctRun(run.id, { material: e.target.value }, { material: e.target.value as DehumidificationDuctRunRow["material"] })}
                    disabled={savingRunId === run.id}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-brand-silver-highlight outline-none focus:border-brand-gold disabled:opacity-50"
                  >
                    {MATERIAL_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 text-xs text-brand-grey-text">
                  {sizing ? (
                    <>
                      {sizing.diameterIn != null ? `${sizing.diameterIn.toFixed(1)}" round` : `${sizing.widthIn?.toFixed(1)}"x${sizing.heightIn?.toFixed(1)}" rect`}{" "}
                      @ {Math.round(sizing.velocityFpm)} fpm{sizing.velocityWarning ? ` - ${sizing.velocityWarning}` : ""}
                    </>
                  ) : (
                    "Enter available static pressure and select equipment to size this run."
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveDuctRun(run.id)}
                  className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-400 transition hover:border-red-700 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            );
          })}
          <div className="flex gap-2">
            {(["supply", "return"] as const)
              .filter((type) => !systemDuctRuns.some((r) => r.runType === type))
              .map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleAddDuctRun(system.id, type)}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-brand-silver-highlight transition hover:border-brand-gold"
                >
                  + Add {type} run
                </button>
              ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
      <h2 className="mb-1 text-lg font-semibold text-brand-gold">Standalone Dehumidification</h2>
      <p className="mb-4 text-xs text-brand-grey-text">
        A dehumidification system separate from the primary HVAC system, with its own equipment and its own dedicated
        supply/return ducting. Sized from this project&apos;s real Manual J latent load for the rooms it covers
        (ACCA Manual S&apos;s own latent-load-based sizing approach), converted to pints/day.
      </p>

      {error && (
        <p className="mb-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {systems.length > 0 ? (
        systems.map(renderSystem)
      ) : (
        <p className="mb-4 rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-4 text-center text-sm text-brand-grey-text">
          No standalone dehumidification systems yet.
        </p>
      )}

      <div className="flex items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-grey-text">System name</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Basement Dehumidifier"
            className="w-64 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
          />
        </div>
        <button
          type="button"
          onClick={handleAddSystem}
          disabled={adding}
          className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add System"}
        </button>
      </div>
    </section>
  );
}
