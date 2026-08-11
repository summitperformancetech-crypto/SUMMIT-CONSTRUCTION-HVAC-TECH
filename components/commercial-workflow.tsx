"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  computeCommercialBlockLoad,
  type CommercialOccupancyDefault,
  type CommercialZoneInput,
} from "@/lib/manualN";
import {
  simulateCommercialBuilding,
  type HourlyTemperaturePoint,
  type ZoneSimulationResult,
} from "@/lib/manualNSimulation";

export type CommercialZoneRow = CommercialZoneInput & {
  project_id: string;
  ahu_label: string | null;
};

export const COMMERCIAL_ZONE_COLUMNS =
  "id, project_id, name, ahu_label, occupancy_type, floor_area_sqft, occupant_density_per_1000sqft, lighting_load_w_per_sqft, equipment_load_w_per_sqft, exterior_wall_area_sqft, roof_area_sqft, wall_u_value, roof_u_value, window_area_sqft, window_u_value, window_shgc";

type ZoneFormValues = {
  name: string;
  ahu_label: string;
  occupancy_type: string;
  floor_area_sqft: string;
  occupant_density_per_1000sqft: string;
  lighting_load_w_per_sqft: string;
  equipment_load_w_per_sqft: string;
  exterior_wall_area_sqft: string;
  roof_area_sqft: string;
  wall_u_value: string;
  roof_u_value: string;
  window_area_sqft: string;
  window_u_value: string;
  window_shgc: string;
};

const EMPTY_ZONE_FORM: ZoneFormValues = {
  name: "",
  ahu_label: "",
  occupancy_type: "",
  floor_area_sqft: "",
  occupant_density_per_1000sqft: "",
  lighting_load_w_per_sqft: "",
  equipment_load_w_per_sqft: "",
  exterior_wall_area_sqft: "",
  roof_area_sqft: "",
  wall_u_value: "",
  roof_u_value: "",
  window_area_sqft: "",
  window_u_value: "",
  window_shgc: "",
};

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString();
}

function formToPayload(values: ZoneFormValues) {
  return {
    name: values.name,
    ahu_label: toNullableString(values.ahu_label),
    occupancy_type: toNullableString(values.occupancy_type),
    floor_area_sqft: toNullableNumber(values.floor_area_sqft),
    occupant_density_per_1000sqft: toNullableNumber(values.occupant_density_per_1000sqft),
    lighting_load_w_per_sqft: toNullableNumber(values.lighting_load_w_per_sqft),
    equipment_load_w_per_sqft: toNullableNumber(values.equipment_load_w_per_sqft),
    exterior_wall_area_sqft: toNullableNumber(values.exterior_wall_area_sqft),
    roof_area_sqft: toNullableNumber(values.roof_area_sqft),
    wall_u_value: toNullableNumber(values.wall_u_value),
    roof_u_value: toNullableNumber(values.roof_u_value),
    window_area_sqft: toNullableNumber(values.window_area_sqft),
    window_u_value: toNullableNumber(values.window_u_value),
    window_shgc: toNullableNumber(values.window_shgc),
  };
}

function zoneToInput(zone: CommercialZoneRow): CommercialZoneInput {
  return {
    id: zone.id,
    name: zone.name,
    occupancyType: zone.occupancyType,
    floorAreaSqft: zone.floorAreaSqft,
    occupantDensityPer1000Sqft: zone.occupantDensityPer1000Sqft,
    lightingLoadWPerSqft: zone.lightingLoadWPerSqft,
    equipmentLoadWPerSqft: zone.equipmentLoadWPerSqft,
    exteriorWallAreaSqft: zone.exteriorWallAreaSqft,
    roofAreaSqft: zone.roofAreaSqft,
    wallUValue: zone.wallUValue,
    roofUValue: zone.roofUValue,
    windowAreaSqft: zone.windowAreaSqft,
    windowUValue: zone.windowUValue,
    windowShgc: zone.windowShgc,
  };
}

export function CommercialWorkflow({
  projectId,
  initialZones,
  occupancyDefaults,
  winterDesignTempF,
  summerDesignTempF,
  indoorDesignHeatingF,
  indoorDesignCoolingF,
  hourlyTemps,
  stationName,
}: {
  projectId: string;
  initialZones: CommercialZoneRow[];
  occupancyDefaults: CommercialOccupancyDefault[];
  winterDesignTempF: number | null;
  summerDesignTempF: number | null;
  indoorDesignHeatingF: number;
  indoorDesignCoolingF: number;
  hourlyTemps: HourlyTemperaturePoint[];
  stationName: string | null;
}) {
  const [zones, setZones] = useState<CommercialZoneRow[]>(initialZones);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [form, setForm] = useState<ZoneFormValues>(EMPTY_ZONE_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"block" | "simulation">("block");

  const canCalculate = winterDesignTempF != null && summerDesignTempF != null;

  const zoneInputs: CommercialZoneInput[] = useMemo(() => zones.map(zoneToInput), [zones]);

  const blockLoad = useMemo(() => {
    if (!canCalculate) return null;
    return computeCommercialBlockLoad(
      zoneInputs,
      occupancyDefaults,
      winterDesignTempF!,
      summerDesignTempF!,
      indoorDesignHeatingF,
      indoorDesignCoolingF,
    );
  }, [
    zoneInputs,
    occupancyDefaults,
    winterDesignTempF,
    summerDesignTempF,
    indoorDesignHeatingF,
    indoorDesignCoolingF,
    canCalculate,
  ]);

  const simulation: ZoneSimulationResult[] | null = useMemo(() => {
    if (hourlyTemps.length === 0) return null;
    return simulateCommercialBuilding(
      zoneInputs,
      occupancyDefaults,
      hourlyTemps,
      indoorDesignHeatingF,
      indoorDesignCoolingF,
    );
  }, [zoneInputs, occupancyDefaults, hourlyTemps, indoorDesignHeatingF, indoorDesignCoolingF]);

  async function handleSaveZone() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = formToPayload(form);

    if (editingZoneId) {
      const { data, error: saveError } = await supabase
        .from("zones")
        .update(payload)
        .eq("id", editingZoneId)
        .select(COMMERCIAL_ZONE_COLUMNS)
        .single();
      setSaving(false);
      if (saveError) {
        setError(saveError.message);
        return;
      }
      setZones((prev) => prev.map((z) => (z.id === editingZoneId ? mapDbRow(data) : z)));
      setEditingZoneId(null);
    } else {
      const { data, error: saveError } = await supabase
        .from("zones")
        .insert({ ...payload, project_id: projectId })
        .select(COMMERCIAL_ZONE_COLUMNS)
        .single();
      setSaving(false);
      if (saveError) {
        setError(saveError.message);
        return;
      }
      setZones((prev) => [...prev, mapDbRow(data)]);
      setShowAddForm(false);
    }
    setForm(EMPTY_ZONE_FORM);
  }

  function mapDbRow(row: Record<string, unknown>): CommercialZoneRow {
    return {
      id: row.id as string,
      project_id: row.project_id as string,
      name: row.name as string,
      ahu_label: row.ahu_label as string | null,
      occupancyType: row.occupancy_type as string | null,
      floorAreaSqft: row.floor_area_sqft as number | null,
      occupantDensityPer1000Sqft: row.occupant_density_per_1000sqft as number | null,
      lightingLoadWPerSqft: row.lighting_load_w_per_sqft as number | null,
      equipmentLoadWPerSqft: row.equipment_load_w_per_sqft as number | null,
      exteriorWallAreaSqft: row.exterior_wall_area_sqft as number | null,
      roofAreaSqft: row.roof_area_sqft as number | null,
      wallUValue: row.wall_u_value as number | null,
      roofUValue: row.roof_u_value as number | null,
      windowAreaSqft: row.window_area_sqft as number | null,
      windowUValue: row.window_u_value as number | null,
      windowShgc: row.window_shgc as number | null,
    };
  }

  function startEdit(zone: CommercialZoneRow) {
    setEditingZoneId(zone.id);
    setShowAddForm(false);
    setForm({
      name: zone.name,
      ahu_label: zone.ahu_label ?? "",
      occupancy_type: zone.occupancyType ?? "",
      floor_area_sqft: zone.floorAreaSqft?.toString() ?? "",
      occupant_density_per_1000sqft: zone.occupantDensityPer1000Sqft?.toString() ?? "",
      lighting_load_w_per_sqft: zone.lightingLoadWPerSqft?.toString() ?? "",
      equipment_load_w_per_sqft: zone.equipmentLoadWPerSqft?.toString() ?? "",
      exterior_wall_area_sqft: zone.exteriorWallAreaSqft?.toString() ?? "",
      roof_area_sqft: zone.roofAreaSqft?.toString() ?? "",
      wall_u_value: zone.wallUValue?.toString() ?? "",
      roof_u_value: zone.roofUValue?.toString() ?? "",
      window_area_sqft: zone.windowAreaSqft?.toString() ?? "",
      window_u_value: zone.windowUValue?.toString() ?? "",
      window_shgc: zone.windowShgc?.toString() ?? "",
    });
  }

  async function handleDeleteZone(id: string) {
    if (!window.confirm("Delete this zone?")) return;
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("zones").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setZones((prev) => prev.filter((z) => z.id !== id));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-gold">Zones</h2>
          {!showAddForm && !editingZoneId && (
            <button
              onClick={() => {
                setShowAddForm(true);
                setForm(EMPTY_ZONE_FORM);
              }}
              className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover"
            >
              Add Zone
            </button>
          )}
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {(showAddForm || editingZoneId) && (
          <ZoneForm
            form={form}
            setForm={setForm}
            occupancyDefaults={occupancyDefaults}
            saving={saving}
            onSave={handleSaveZone}
            onCancel={() => {
              setShowAddForm(false);
              setEditingZoneId(null);
              setForm(EMPTY_ZONE_FORM);
            }}
          />
        )}

        {zones.length === 0 && !showAddForm ? (
          <p className="rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-6 text-center text-sm text-brand-grey-text">
            No zones yet. Add a zone for each area with distinct occupancy/envelope
            characteristics (e.g. one AHU per zone).
          </p>
        ) : (
          <ul className="space-y-2">
            {zones.map((zone) => (
              <li
                key={zone.id}
                className="flex items-center justify-between rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-brand-silver-highlight">
                    {zone.name}
                    {zone.ahu_label && (
                      <span className="ml-2 text-xs text-brand-grey-text">({zone.ahu_label})</span>
                    )}
                  </p>
                  <p className="text-xs text-brand-grey-text">
                    {zone.occupancyType ?? "No occupancy type"} ·{" "}
                    {zone.floorAreaSqft ? `${fmt(zone.floorAreaSqft)} sqft` : "no floor area"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(zone)}
                    className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-brand-silver transition hover:border-brand-gold-hover"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteZone(zone.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!canCalculate && (
        <p className="rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-4 text-sm text-brand-grey-text">
          Confirm climate zone data (winter/summer design temperatures) to compute loads.
        </p>
      )}

      {canCalculate && blockLoad && zones.length > 0 && (
        <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-brand-gold">Manual N Results</h2>
            <div className="flex rounded-md border border-brand-gold/50 text-xs">
              <button
                onClick={() => setView("block")}
                className={`px-3 py-1.5 ${view === "block" ? "bg-brand-gold text-black" : "text-brand-silver"}`}
              >
                Block Load
              </button>
              <button
                onClick={() => setView("simulation")}
                disabled={!simulation}
                className={`px-3 py-1.5 ${view === "simulation" ? "bg-brand-gold text-black" : "text-brand-silver"} disabled:opacity-40`}
              >
                Simulation
              </button>
            </div>
          </div>

          {view === "block" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-gold/50 text-left text-xs uppercase tracking-wide text-brand-grey-text">
                    <th className="py-2 pr-4">Zone</th>
                    <th className="py-2 pr-4 text-right">Heating Btu/hr</th>
                    <th className="py-2 pr-4 text-right">Cooling Sensible</th>
                    <th className="py-2 pr-4 text-right">Cooling Latent</th>
                    <th className="py-2 text-right">Cooling Total</th>
                  </tr>
                </thead>
                <tbody>
                  {blockLoad.zones.map((z) => (
                    <tr key={z.zoneId} className="border-b border-zinc-900">
                      <td className="py-2 pr-4 text-brand-silver-highlight">{z.zoneName}</td>
                      <td className="py-2 pr-4 text-right text-brand-silver">{fmt(z.heatingBtuh)}</td>
                      <td className="py-2 pr-4 text-right text-brand-silver">
                        {fmt(z.coolingSensibleBtuh)}
                      </td>
                      <td className="py-2 pr-4 text-right text-brand-silver">{fmt(z.coolingLatentBtuh)}</td>
                      <td className="py-2 text-right text-brand-silver">{fmt(z.coolingTotalBtuh)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold text-brand-gold">
                    <td className="py-2 pr-4">Building Total</td>
                    <td className="py-2 pr-4 text-right">{fmt(blockLoad.building.heatingBtuh)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(blockLoad.building.coolingSensibleBtuh)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(blockLoad.building.coolingLatentBtuh)}</td>
                    <td className="py-2 text-right">{fmt(blockLoad.building.coolingTotalBtuh)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {view === "simulation" && simulation && (
            <div className="space-y-4">
              <p className="text-xs text-brand-grey-text">
                8760-hour bin-method estimate using real hourly temperature normals from{" "}
                {stationName ?? "the matched weather station"}. Internal gains (occupants,
                lighting, equipment) are held constant at design value for every hour - see
                lib/manualNSimulation.ts for the documented scope of this simplification.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-brand-gold/50 text-left text-xs uppercase tracking-wide text-brand-grey-text">
                      <th className="py-2 pr-4">Zone</th>
                      <th className="py-2 pr-4 text-right">Peak Cooling</th>
                      <th className="py-2 pr-4 text-right">Peak Heating</th>
                      <th className="py-2 pr-4 text-right">Annual Cooling Load (Btu-hr)</th>
                      <th className="py-2 text-right">Annual Heating Load (Btu-hr)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.map((z) => (
                      <tr key={z.zoneId} className="border-b border-zinc-900">
                        <td className="py-2 pr-4 text-brand-silver-highlight">{z.zoneName}</td>
                        <td className="py-2 pr-4 text-right text-brand-silver">
                          {fmt(z.peakCoolingBtuh)}
                          {z.peakCoolingHour && (
                            <span className="ml-1 text-[10px] text-brand-grey-text">
                              ({z.peakCoolingHour.month}/{z.peakCoolingHour.day} {z.peakCoolingHour.hour}:00,{" "}
                              {z.peakCoolingHour.tempF}°F)
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right text-brand-silver">
                          {fmt(z.peakHeatingBtuh)}
                          {z.peakHeatingHour && (
                            <span className="ml-1 text-[10px] text-brand-grey-text">
                              ({z.peakHeatingHour.month}/{z.peakHeatingHour.day} {z.peakHeatingHour.hour}:00,{" "}
                              {z.peakHeatingHour.tempF}°F)
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right text-brand-silver">
                          {fmt(z.annualCoolingLoadBtuHours)}
                        </td>
                        <td className="py-2 text-right text-brand-silver">
                          {fmt(z.annualHeatingLoadBtuHours)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === "simulation" && !simulation && (
            <p className="rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-4 text-sm text-brand-grey-text">
              No hourly climate data available for this project&apos;s location yet - simulation
              mode is being rolled out station-by-station. Block load results above are fully
              usable regardless.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function ZoneForm({
  form,
  setForm,
  occupancyDefaults,
  saving,
  onSave,
  onCancel,
}: {
  form: ZoneFormValues;
  setForm: (updater: (prev: ZoneFormValues) => ZoneFormValues) => void;
  occupancyDefaults: CommercialOccupancyDefault[];
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  function update<K extends keyof ZoneFormValues>(key: K, value: ZoneFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const inputClass =
    "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold";

  return (
    <div className="mb-4 space-y-4 rounded-lg border border-brand-gold/50 bg-zinc-900 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Zone name">
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </Field>
        <Field label="AHU label">
          <input
            className={inputClass}
            value={form.ahu_label}
            onChange={(e) => update("ahu_label", e.target.value)}
          />
        </Field>
        <Field label="Occupancy type">
          <select
            className={inputClass}
            value={form.occupancy_type}
            onChange={(e) => update("occupancy_type", e.target.value)}
          >
            <option value="">—</option>
            {occupancyDefaults.map((d) => (
              <option key={d.occupancyType} value={d.occupancyType}>
                {d.occupancyType}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="rounded-md border border-zinc-800 p-3">
        <legend className="px-1 text-xs font-medium text-brand-grey-text">
          Floor area &amp; internal gain overrides (blank = use occupancy type default)
        </legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Floor area (sqft)">
            <input
              type="number"
              className={inputClass}
              value={form.floor_area_sqft}
              onChange={(e) => update("floor_area_sqft", e.target.value)}
            />
          </Field>
          <Field label="Occupant density (/1000sqft)">
            <input
              type="number"
              className={inputClass}
              value={form.occupant_density_per_1000sqft}
              onChange={(e) => update("occupant_density_per_1000sqft", e.target.value)}
            />
          </Field>
          <Field label="Lighting (W/sqft)">
            <input
              type="number"
              className={inputClass}
              value={form.lighting_load_w_per_sqft}
              onChange={(e) => update("lighting_load_w_per_sqft", e.target.value)}
            />
          </Field>
          <Field label="Equipment (W/sqft)">
            <input
              type="number"
              className={inputClass}
              value={form.equipment_load_w_per_sqft}
              onChange={(e) => update("equipment_load_w_per_sqft", e.target.value)}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-md border border-zinc-800 p-3">
        <legend className="px-1 text-xs font-medium text-brand-grey-text">Envelope</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Exterior wall area (sqft)">
            <input
              type="number"
              className={inputClass}
              value={form.exterior_wall_area_sqft}
              onChange={(e) => update("exterior_wall_area_sqft", e.target.value)}
            />
          </Field>
          <Field label="Wall U-value">
            <input
              type="number"
              step="any"
              className={inputClass}
              value={form.wall_u_value}
              onChange={(e) => update("wall_u_value", e.target.value)}
            />
          </Field>
          <Field label="Roof area (sqft)">
            <input
              type="number"
              className={inputClass}
              value={form.roof_area_sqft}
              onChange={(e) => update("roof_area_sqft", e.target.value)}
            />
          </Field>
          <Field label="Roof U-value">
            <input
              type="number"
              step="any"
              className={inputClass}
              value={form.roof_u_value}
              onChange={(e) => update("roof_u_value", e.target.value)}
            />
          </Field>
          <Field label="Window area (sqft)">
            <input
              type="number"
              className={inputClass}
              value={form.window_area_sqft}
              onChange={(e) => update("window_area_sqft", e.target.value)}
            />
          </Field>
          <Field label="Window U-value">
            <input
              type="number"
              step="any"
              className={inputClass}
              value={form.window_u_value}
              onChange={(e) => update("window_u_value", e.target.value)}
            />
          </Field>
          <Field label="Window SHGC">
            <input
              type="number"
              step="any"
              className={inputClass}
              value={form.window_shgc}
              onChange={(e) => update("window_shgc", e.target.value)}
            />
          </Field>
        </div>
      </fieldset>

      <div className="flex gap-3">
        <button
          onClick={onSave}
          disabled={saving || form.name.trim() === ""}
          className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Zone"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-brand-silver transition hover:border-brand-gold-hover"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-brand-grey-text">{label}</label>
      {children}
    </div>
  );
}
