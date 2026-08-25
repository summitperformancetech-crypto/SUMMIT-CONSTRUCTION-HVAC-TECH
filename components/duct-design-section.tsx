"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  computeManualD,
  computeRequiredCfmForRooms,
  checkDuctInsulationCompliance,
  type DuctRunInput,
  type DuctSizingTableRow,
} from "@/lib/manualD";
import type { RoomLoadResult, ManualJZone } from "@/lib/manualJ";
import type { RoomRow } from "@/components/manual-j-workflow";

export type DuctRunRow = {
  id: string;
  project_id: string;
  zone_id: string | null;
  run_type: "trunk" | "branch";
  room_id: string | null;
  length_ft: number;
  fitting_equivalent_length_ft: number;
  duct_shape: "round" | "rectangular";
  target_height_in: number | null;
  material: "flex" | "sheet_metal" | "fiberboard";
  // Last-computed snapshot, written alongside the input fields whenever a
  // run is saved - used by reporting (Phase 7) so a schedule can be read
  // without recomputing. The UI itself never trusts this for display; it
  // always shows a fresh computeManualD() result from current inputs (same
  // "never persist Manual J's own results" pattern the rest of this app
  // already uses), so a stale snapshot from before some other room's load
  // changed never shows up as wrong on screen - only in an as-of-last-save
  // export.
  cfm: number;
  friction_rate: number;
  velocity_fpm: number;
  calculated_diameter_in: number | null;
  calculated_width_in: number | null;
  calculated_height_in: number | null;
};

export const DUCT_RUN_COLUMNS =
  "id, project_id, zone_id, run_type, room_id, length_ft, fitting_equivalent_length_ft, duct_shape, target_height_in, material, cfm, friction_rate, velocity_fpm, calculated_diameter_in, calculated_width_in, calculated_height_in";

const MATERIAL_OPTIONS = [
  { value: "flex", label: "Flex" },
  { value: "sheet_metal", label: "Sheet metal" },
  { value: "fiberboard", label: "Fiberboard" },
] as const;

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString();
}

function toDuctRunInput(run: DuctRunRow): DuctRunInput {
  return {
    id: run.id,
    zoneId: run.zone_id,
    runType: run.run_type,
    roomId: run.room_id,
    lengthFt: run.length_ft,
    fittingEquivalentLengthFt: run.fitting_equivalent_length_ft,
    ductShape: run.duct_shape,
    targetHeightIn: run.target_height_in,
  };
}

type RunFormValues = {
  run_type: "trunk" | "branch";
  room_id: string;
  zone_id: string;
  length_ft: string;
  fitting_equivalent_length_ft: string;
  duct_shape: "round" | "rectangular";
  target_height_in: string;
  material: "flex" | "sheet_metal" | "fiberboard";
};

const EMPTY_RUN_FORM: RunFormValues = {
  run_type: "branch",
  room_id: "",
  zone_id: "",
  length_ft: "",
  fitting_equivalent_length_ft: "0",
  duct_shape: "round",
  target_height_in: "",
  material: "flex",
};

export function DuctDesignSection({
  projectId,
  rooms,
  zones,
  roomResults,
  indoorCoolingDesignTempF,
  initialAvailableStaticPressureIwc,
  initialSupplyAirTempF,
  initialDuctRuns,
  ductSizingTable,
  ductInsulationCodeMinimums,
}: {
  projectId: string;
  rooms: RoomRow[];
  zones: ManualJZone[];
  roomResults: RoomLoadResult[];
  indoorCoolingDesignTempF: number;
  initialAvailableStaticPressureIwc: number | null;
  initialSupplyAirTempF: number | null;
  initialDuctRuns: DuctRunRow[];
  ductSizingTable: DuctSizingTableRow[];
  // Data Integrity Addendum, Section 3 - duct_location -> current code
  // minimum R-value, for the compliance badge below. Plain array (not the
  // Map lib/manualD.ts's checkDuctInsulationCompliance ultimately wants)
  // since props cross a server/client boundary that only survives plain
  // JSON-shaped values.
  ductInsulationCodeMinimums: { duct_location: string; min_r_value: number }[];
}) {
  const [staticPressureForm, setStaticPressureForm] = useState(
    initialAvailableStaticPressureIwc?.toString() ?? "",
  );
  const [supplyAirTempForm, setSupplyAirTempForm] = useState(
    initialSupplyAirTempF?.toString() ?? "",
  );
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [ductRuns, setDuctRuns] = useState<DuctRunRow[]>(initialDuctRuns);
  const [showAddForm, setShowAddForm] = useState(false);
  const [runForm, setRunForm] = useState<RunFormValues>(EMPTY_RUN_FORM);
  const [runError, setRunError] = useState<string | null>(null);
  const [runSaving, setRunSaving] = useState(false);

  const availableStaticPressureIwc = toNullableNumber(staticPressureForm);
  const supplyAirTempF = toNullableNumber(supplyAirTempForm);

  const requiredCfmByRoom = useMemo(
    () => computeRequiredCfmForRooms(roomResults, supplyAirTempF, indoorCoolingDesignTempF),
    [roomResults, supplyAirTempF, indoorCoolingDesignTempF],
  );

  const ductRunInputs: DuctRunInput[] = useMemo(
    () => ductRuns.map(toDuctRunInput),
    [ductRuns],
  );

  const results = useMemo(
    () =>
      computeManualD(ductRunInputs, requiredCfmByRoom, availableStaticPressureIwc, ductSizingTable),
    [ductRunInputs, requiredCfmByRoom, availableStaticPressureIwc, ductSizingTable],
  );
  const resultByRunId = useMemo(() => new Map(results.map((r) => [r.runId, r])), [results]);

  // Data Integrity Addendum, Section 3 - Manual D compliance check, purely
  // additive to the sizing results above (see lib/manualD.ts's
  // checkDuctInsulationCompliance comment for why this is kept separate
  // from computeManualD/sizeDuctRun rather than folded in).
  const roomsById = useMemo(
    () =>
      new Map(
        rooms.map((r) => [
          r.id,
          { duct_location: r.duct_location, duct_insulation_r_value: r.duct_insulation_r_value },
        ]),
      ),
    [rooms],
  );
  const codeMinimumsByLocation = useMemo(
    () => new Map(ductInsulationCodeMinimums.map((r) => [r.duct_location, r.min_r_value])),
    [ductInsulationCodeMinimums],
  );
  const complianceByRunId = useMemo(
    () => checkDuctInsulationCompliance(ductRunInputs, roomsById, codeMinimumsByLocation),
    [ductRunInputs, roomsById, codeMinimumsByLocation],
  );

  function roomName(roomId: string | null): string {
    if (!roomId) return "—";
    return rooms.find((r) => r.id === roomId)?.name ?? "Unknown room";
  }

  function zoneName(zoneId: string | null): string {
    if (!zoneId) return "Unassigned";
    return zones.find((z) => z.id === zoneId)?.name ?? "Unknown zone";
  }

  async function persistRunSnapshot(runId: string, supabase: ReturnType<typeof createClient>) {
    const result = resultByRunId.get(runId);
    if (!result) return;
    await supabase
      .from("duct_runs")
      .update({
        cfm: result.cfm,
        friction_rate: result.frictionRate,
        velocity_fpm: result.velocityFpm,
        calculated_diameter_in: result.diameterIn,
        calculated_width_in: result.widthIn,
        calculated_height_in: result.heightIn,
      })
      .eq("id", runId);
  }

  // Wrapped in try/catch, not just an `error`-on-result check - a genuine
  // network-level failure can reject the underlying fetch before
  // postgrest-js has a response to wrap, which surfaces as a thrown
  // exception rather than a resolved {error}. Uncaught inside an async
  // onClick handler, that's a silent, console-only unhandled rejection
  // with the saving flag stuck true - same failure shape already found
  // and fixed on the Zones page's add/rename/delete handlers.
  async function handleSaveSettings() {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("projects")
        .update({
          available_static_pressure_iwc: availableStaticPressureIwc,
          supply_air_temp_f: supplyAirTempF,
        })
        .eq("id", projectId);
      if (error) {
        setSettingsError(error.message);
        return;
      }
      // Every run's cfm/friction depends on these two settings - refresh
      // every stored snapshot, not just newly-added runs, so exported
      // reports never lag behind a static-pressure or supply-temp change.
      await Promise.all(ductRuns.map((run) => persistRunSnapshot(run.id, supabase)));
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : "Failed to save duct settings - check your connection and try again.",
      );
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleAddRun() {
    setRunSaving(true);
    setRunError(null);
    try {
      const supabase = createClient();

      const payload = {
        project_id: projectId,
        run_type: runForm.run_type,
        room_id: runForm.run_type === "branch" ? runForm.room_id || null : null,
        zone_id: runForm.zone_id || null,
        length_ft: toNullableNumber(runForm.length_ft) ?? 0,
        fitting_equivalent_length_ft: toNullableNumber(runForm.fitting_equivalent_length_ft) ?? 0,
        duct_shape: runForm.duct_shape,
        target_height_in:
          runForm.duct_shape === "rectangular" ? toNullableNumber(runForm.target_height_in) : null,
        material: runForm.material,
        // Placeholder - overwritten immediately below once the row (and
        // therefore its id) exists and computeManualD can size it for real.
        cfm: 0,
        friction_rate: 0,
        velocity_fpm: 0,
        calculated_diameter_in: null,
        calculated_width_in: null,
        calculated_height_in: null,
      };

      const { data, error } = await supabase
        .from("duct_runs")
        .insert(payload)
        .select(DUCT_RUN_COLUMNS)
        .single<DuctRunRow>();

      if (error || !data) {
        setRunError(error?.message ?? "Failed to create duct run.");
        return;
      }

      // Compute and persist the real snapshot immediately rather than
      // leaving the placeholder zeros in place until the next Settings
      // save - inline (not via the ductRuns/results state, which won't
      // include this row until the setDuctRuns below re-renders).
      const inputs = [...ductRuns, data].map(toDuctRunInput);
      const freshResults = computeManualD(
        inputs,
        requiredCfmByRoom,
        availableStaticPressureIwc,
        ductSizingTable,
      );
      const newResult = freshResults.find((r) => r.runId === data.id);
      let savedRow = data;
      if (newResult) {
        const { data: updated } = await supabase
          .from("duct_runs")
          .update({
            cfm: newResult.cfm,
            friction_rate: newResult.frictionRate,
            velocity_fpm: newResult.velocityFpm,
            calculated_diameter_in: newResult.diameterIn,
            calculated_width_in: newResult.widthIn,
            calculated_height_in: newResult.heightIn,
          })
          .eq("id", data.id)
          .select(DUCT_RUN_COLUMNS)
          .single<DuctRunRow>();
        if (updated) savedRow = updated;
      }

      setDuctRuns((prev) => [...prev, savedRow]);
      setShowAddForm(false);
      setRunForm(EMPTY_RUN_FORM);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Failed to create duct run - check your connection and try again.");
    } finally {
      setRunSaving(false);
    }
  }

  async function handleDeleteRun(id: string) {
    if (!window.confirm("Delete this duct run?")) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from("duct_runs").delete().eq("id", id);
      if (error) {
        setRunError(error.message);
        return;
      }
      setDuctRuns((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Failed to delete duct run - check your connection and try again.");
    }
  }

  const readyToSize = availableStaticPressureIwc != null && supplyAirTempF != null;

  return (
    <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
      <h2 className="mb-4 text-lg font-semibold text-brand-gold">Duct Design (Manual D)</h2>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-grey-text">
            Available static pressure (in.wc)
          </label>
          <input
            type="number"
            step="any"
            value={staticPressureForm}
            onChange={(e) => setStaticPressureForm(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-grey-text">
            Supply air temperature (°F)
          </label>
          <input
            type="number"
            step="any"
            value={supplyAirTempForm}
            onChange={(e) => setSupplyAirTempForm(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
          />
        </div>
      </div>
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={handleSaveSettings}
          disabled={settingsSaving}
          className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
        >
          {settingsSaving ? "Saving…" : "Save Duct Design Settings"}
        </button>
        {settingsError && (
          <span className="text-sm text-red-400" role="alert">
            {settingsError}
          </span>
        )}
      </div>

      {!readyToSize && (
        <p className="mb-4 rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-3 text-sm text-brand-grey-text">
          Enter and save available static pressure and supply air temperature above before
          adding duct runs - both are required to compute required CFM and friction rate.
        </p>
      )}

      {readyToSize && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-brand-silver-highlight">Duct Runs</h3>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover"
              >
                Add Duct Run
              </button>
            )}
          </div>

          {runError && (
            <p className="mb-4 text-sm text-red-400" role="alert">
              {runError}
            </p>
          )}

          {showAddForm && (
            <div className="mb-4 space-y-3 rounded-lg border border-brand-gold/50 bg-zinc-900 p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <SelectField
                  label="Run type"
                  value={runForm.run_type}
                  onChange={(v) =>
                    setRunForm((prev) => ({ ...prev, run_type: v as "trunk" | "branch" }))
                  }
                  options={[
                    { value: "branch", label: "Branch" },
                    { value: "trunk", label: "Trunk" },
                  ]}
                />
                <SelectField
                  label="Zone"
                  value={runForm.zone_id}
                  onChange={(v) => setRunForm((prev) => ({ ...prev, zone_id: v }))}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...zones.map((z) => ({ value: z.id, label: z.name })),
                  ]}
                />
                {runForm.run_type === "branch" && (
                  <SelectField
                    label="Room"
                    value={runForm.room_id}
                    onChange={(v) => setRunForm((prev) => ({ ...prev, room_id: v }))}
                    options={[
                      { value: "", label: "— Select room —" },
                      ...rooms
                        .filter((r) => r.is_conditioned)
                        .map((r) => ({ value: r.id, label: r.name })),
                    ]}
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumberField
                  label="Length (ft)"
                  value={runForm.length_ft}
                  onChange={(v) => setRunForm((prev) => ({ ...prev, length_ft: v }))}
                />
                <NumberField
                  label="Fitting equiv. length (ft)"
                  value={runForm.fitting_equivalent_length_ft}
                  onChange={(v) =>
                    setRunForm((prev) => ({ ...prev, fitting_equivalent_length_ft: v }))
                  }
                />
                <SelectField
                  label="Shape"
                  value={runForm.duct_shape}
                  onChange={(v) =>
                    setRunForm((prev) => ({ ...prev, duct_shape: v as "round" | "rectangular" }))
                  }
                  options={[
                    { value: "round", label: "Round" },
                    { value: "rectangular", label: "Rectangular" },
                  ]}
                />
                {runForm.duct_shape === "rectangular" && (
                  <NumberField
                    label="Target height (in)"
                    value={runForm.target_height_in}
                    onChange={(v) => setRunForm((prev) => ({ ...prev, target_height_in: v }))}
                  />
                )}
                <SelectField
                  label="Material"
                  value={runForm.material}
                  onChange={(v) =>
                    setRunForm((prev) => ({
                      ...prev,
                      material: v as "flex" | "sheet_metal" | "fiberboard",
                    }))
                  }
                  options={MATERIAL_OPTIONS as unknown as { value: string; label: string }[]}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleAddRun}
                  disabled={
                    runSaving ||
                    (runForm.run_type === "branch" && runForm.room_id === "") ||
                    toNullableNumber(runForm.length_ft) == null
                  }
                  className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
                >
                  {runSaving ? "Saving…" : "Save Run"}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setRunForm(EMPTY_RUN_FORM);
                  }}
                  className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-brand-silver transition hover:border-brand-gold-hover"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {ductRuns.length === 0 && !showAddForm ? (
            <p className="rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-6 text-center text-sm text-brand-grey-text">
              No duct runs yet. Add trunk and branch runs to generate a duct schedule.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-gold/50 text-left text-xs uppercase tracking-wide text-brand-grey-text">
                    <th className="py-2 pr-4">Run</th>
                    <th className="py-2 pr-4">Zone</th>
                    <th className="py-2 pr-4 text-right">CFM</th>
                    <th className="py-2 pr-4 text-right">Friction rate</th>
                    <th className="py-2 pr-4 text-right">Size</th>
                    <th className="py-2 pr-4 text-right">Velocity</th>
                    <th className="py-2 pr-4">Insulation</th>
                    <th className="py-2 pr-4">Material</th>
                    <th className="py-2 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {ductRuns.map((run) => {
                    const result = resultByRunId.get(run.id);
                    return (
                      <tr key={run.id} className="border-b border-zinc-900">
                        <td className="py-2 pr-4 text-brand-silver-highlight">
                          {run.run_type === "trunk" ? "Trunk" : `Branch — ${roomName(run.room_id)}`}
                        </td>
                        <td className="py-2 pr-4 text-brand-silver">{zoneName(run.zone_id)}</td>
                        <td className="py-2 pr-4 text-right text-brand-silver">
                          {result ? fmt(result.cfm) : "—"}
                        </td>
                        <td className="py-2 pr-4 text-right text-brand-silver">
                          {result ? result.frictionRate.toFixed(2) : "—"}
                        </td>
                        <td className="py-2 pr-4 text-right text-brand-silver">
                          {result
                            ? result.ductShape === "round"
                              ? `${result.diameterIn}" round`
                              : `${result.widthIn?.toFixed(1)}" x ${result.heightIn}" rect`
                            : "—"}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <span
                            className={
                              result?.velocityWarning ? "text-red-400" : "text-brand-silver"
                            }
                          >
                            {result ? `${fmt(result.velocityFpm)} fpm` : "—"}
                          </span>
                          {result?.velocityWarning && (
                            <span
                              className="ml-2 rounded-full border border-red-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-400"
                              title={result.velocityWarning}
                            >
                              Over limit
                            </span>
                          )}
                          {result?.exceedsTableRange && (
                            <span
                              className="ml-2 rounded-full border border-brand-gold-base bg-brand-gold-base/25 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-gold-hover"
                              title="Required CFM exceeds the largest duct size in the reference table at this friction rate"
                            >
                              Oversized load
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-brand-silver">
                          {(() => {
                            const compliance = complianceByRunId.get(run.id);
                            if (!compliance || compliance.actualRValue == null) return "—";
                            return (
                              <>
                                {`R-${compliance.actualRValue}`}
                                {compliance.belowCodeMinimum && (
                                  <span
                                    className="ml-2 rounded-full border border-red-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-400"
                                    title={`Below the current${compliance.minRValue != null ? ` R-${compliance.minRValue}` : ""} code minimum for this duct's location`}
                                  >
                                    Below code min
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </td>
                        <td className="py-2 pr-4 text-brand-silver">
                          {MATERIAL_OPTIONS.find((m) => m.value === run.material)?.label}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <button
                            onClick={() => handleDeleteRun(run.id)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-brand-grey-text">{label}</label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-brand-grey-text">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
