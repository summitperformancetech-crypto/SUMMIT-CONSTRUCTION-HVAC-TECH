"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { ManualJZone, RoomTypeDefault } from "@/lib/manualJ";

export type RoomFormValues = {
  name: string;
  level: string;
  floor_area_sqft: string;
  ceiling_height_ft: string;
  ceiling_exposed: boolean;
  floor_exposed: boolean;
  is_conditioned: boolean;
  is_bedroom: boolean;
  zone_id: string;
  room_type: string;
  occupant_count: string;
  sensible_gain_override: string;
  latent_gain_override: string;
  duct_location: string;
  duct_insulation_r_value: string;
  wall_north_len_ft: string;
  wall_south_len_ft: string;
  wall_east_len_ft: string;
  wall_west_len_ft: string;
  wall_north_exposure_type: string;
  wall_south_exposure_type: string;
  wall_east_exposure_type: string;
  wall_west_exposure_type: string;
  window_north_area_sqft: string;
  window_south_area_sqft: string;
  window_east_area_sqft: string;
  window_west_area_sqft: string;
  door_count: string;
};

export const ROOM_LEVEL_OPTIONS = [
  { value: "single_story", label: "Single story" },
  { value: "bottom_floor", label: "Bottom floor" },
  { value: "middle_floor", label: "Middle floor" },
  { value: "top_floor", label: "Top floor" },
  { value: "walkout_basement", label: "Walkout basement" },
] as const;

export const ROOM_TYPE_OPTIONS = [
  { value: "", label: "—" },
  { value: "Bedroom", label: "Bedroom" },
  { value: "Living", label: "Living" },
  { value: "Kitchen", label: "Kitchen" },
  { value: "Bath", label: "Bath" },
  { value: "Dining", label: "Dining" },
  { value: "Family", label: "Family" },
  { value: "Office", label: "Office" },
  { value: "Garage", label: "Garage" },
  { value: "Utility", label: "Utility" },
  { value: "Hallway", label: "Hallway" },
  { value: "Other", label: "Other" },
] as const;

export const DUCT_LOCATION_OPTIONS = [
  { value: "", label: "—" },
  { value: "Attic-Unconditioned", label: "Attic (unconditioned)" },
  { value: "Attic-Conditioned", label: "Attic (conditioned/sealed)" },
  { value: "Crawlspace", label: "Crawlspace" },
  { value: "Basement-Conditioned", label: "Basement (conditioned)" },
  { value: "Basement-Unconditioned", label: "Basement (unconditioned)" },
  { value: "Conditioned-Space", label: "Conditioned space" },
  { value: "Exterior-Wall", label: "Exterior wall" },
] as const;

export const WALL_EXPOSURE_OPTIONS = [
  { value: "exterior", label: "Exterior (outside air)" },
  { value: "adjacent_unconditioned", label: "Adjacent to unconditioned space" },
  { value: "adjacent_conditioned", label: "Adjacent to conditioned space (interior partition)" },
] as const;

export const EMPTY_ROOM_FORM: RoomFormValues = {
  name: "",
  level: "single_story",
  floor_area_sqft: "",
  ceiling_height_ft: "8",
  ceiling_exposed: false,
  floor_exposed: false,
  is_conditioned: true,
  is_bedroom: false,
  zone_id: "",
  room_type: "",
  occupant_count: "",
  sensible_gain_override: "",
  latent_gain_override: "",
  duct_location: "",
  duct_insulation_r_value: "",
  wall_north_len_ft: "",
  wall_south_len_ft: "",
  wall_east_len_ft: "",
  wall_west_len_ft: "",
  wall_north_exposure_type: "exterior",
  wall_south_exposure_type: "exterior",
  wall_east_exposure_type: "exterior",
  wall_west_exposure_type: "exterior",
  window_north_area_sqft: "",
  window_south_area_sqft: "",
  window_east_area_sqft: "",
  window_west_area_sqft: "",
  door_count: "0",
};

export function RoomForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
  roomTypeDefaults,
  zones,
}: {
  initialValues: RoomFormValues;
  onSubmit: (values: RoomFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  roomTypeDefaults: RoomTypeDefault[];
  zones: ManualJZone[];
}) {
  const [values, setValues] = useState(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors computeInternalGains in lib/manualJ.ts exactly, so this preview
  // always matches what the calc engine will actually produce.
  const typeDefault = roomTypeDefaults.find((d) => d.room_type === values.room_type);
  const previewOccupants =
    values.occupant_count.trim() !== ""
      ? Number(values.occupant_count)
      : (typeDefault?.default_occupants ?? 0);
  const computedSensible = typeDefault
    ? previewOccupants * typeDefault.sensible_btu_per_person + typeDefault.appliance_sensible_btu
    : 0;
  const computedLatent = typeDefault ? previewOccupants * typeDefault.latent_btu_per_person : 0;
  const sensibleOverrideSet = values.sensible_gain_override.trim() !== "";
  const latentOverrideSet = values.latent_gain_override.trim() !== "";
  const sensiblePreview = sensibleOverrideSet
    ? Number(values.sensible_gain_override)
    : computedSensible;
  const latentPreview = latentOverrideSet ? Number(values.latent_gain_override) : computedLatent;
  const sensibleSource = sensibleOverrideSet
    ? "Manual override"
    : typeDefault
      ? `Default for ${values.room_type}`
      : "No gains applied — set room type";
  const latentSource = latentOverrideSet
    ? "Manual override"
    : typeDefault
      ? `Default for ${values.room_type}`
      : "No gains applied — set room type";

  function update<K extends keyof RoomFormValues>(
    key: K,
    value: RoomFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-brand-gold/50 bg-zinc-900 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Room name"
          value={values.name}
          onChange={(v) => update("name", v)}
          required
        />
        <SelectField
          label="Level"
          value={values.level}
          onChange={(v) => update("level", v)}
          options={ROOM_LEVEL_OPTIONS}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Zone / AHU"
          value={values.zone_id}
          onChange={(v) => update("zone_id", v)}
          options={[
            { value: "", label: "Unassigned" },
            ...zones.map((zone) => ({
              value: zone.id,
              label: zone.ahu_label ? `${zone.name} (${zone.ahu_label})` : zone.name,
            })),
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Floor area (sqft)"
          value={values.floor_area_sqft}
          onChange={(v) => update("floor_area_sqft", v)}
        />
        <NumberField
          label="Ceiling height (ft)"
          value={values.ceiling_height_ft}
          onChange={(v) => update("ceiling_height_ft", v)}
        />
      </div>

      <div className="flex flex-wrap gap-6">
        <CheckboxField
          label="Ceiling exposed"
          checked={values.ceiling_exposed}
          onChange={(v) => update("ceiling_exposed", v)}
        />
        <CheckboxField
          label="Floor exposed"
          checked={values.floor_exposed}
          onChange={(v) => update("floor_exposed", v)}
        />
        <CheckboxField
          label="This space is conditioned (heated/cooled)"
          checked={values.is_conditioned}
          onChange={(v) => update("is_conditioned", v)}
        />
        <CheckboxField
          label="This room is a bedroom"
          checked={values.is_bedroom}
          onChange={(v) => update("is_bedroom", v)}
        />
      </div>
      {!values.is_conditioned && (
        <p className="text-xs text-brand-grey-text">
          Unconditioned rooms (garages, unconditioned attics, etc.) are excluded from
          whole-house Manual J totals but stay in the room list so other rooms can
          reference them as adjacent unconditioned space.
        </p>
      )}
      {values.is_conditioned && (
        <p className="text-xs text-brand-grey-text">
          Bedroom count feeds the ASHRAE 62.2 whole-house ventilation requirement
          (0.03 × conditioned floor area + 7.5 × (bedrooms + 1) CFM) — see the
          Ventilation line in Manual J Results.
        </p>
      )}

      <fieldset className="space-y-3 rounded-md border border-brand-gold/50 bg-brand-bg p-3">
        <legend className="px-1 text-sm font-medium text-brand-silver">Internal Gains</legend>
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Room type"
            value={values.room_type}
            onChange={(v) => update("room_type", v)}
            options={ROOM_TYPE_OPTIONS}
          />
          <NumberField
            label={`Occupants (default: ${typeDefault?.default_occupants ?? "—"})`}
            value={values.occupant_count}
            onChange={(v) => update("occupant_count", v)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Sensible gain override (Btuh)"
            value={values.sensible_gain_override}
            onChange={(v) => update("sensible_gain_override", v)}
          />
          <NumberField
            label="Latent gain override (Btuh)"
            value={values.latent_gain_override}
            onChange={(v) => update("latent_gain_override", v)}
          />
        </div>
        <p className="text-xs text-brand-grey-text">
          Sensible: <span className="text-brand-silver">{Math.round(sensiblePreview)} Btuh</span> (
          {sensibleSource}) · Latent:{" "}
          <span className="text-brand-silver">{Math.round(latentPreview)} Btuh</span> ({latentSource})
        </p>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border border-brand-gold/50 bg-brand-bg p-3">
        <legend className="px-1 text-sm font-medium text-brand-silver">Ducts</legend>
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Duct location"
            value={values.duct_location}
            onChange={(v) => update("duct_location", v)}
            options={DUCT_LOCATION_OPTIONS}
          />
          <NumberField
            label="Duct insulation (R)"
            value={values.duct_insulation_r_value}
            onChange={(v) => update("duct_insulation_r_value", v)}
          />
        </div>
        <p className="text-xs text-brand-grey-text">
          Saving this form always marks duct data as manually confirmed, overwriting any
          AI-extracted or construction-based default value.
        </p>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-brand-silver">
          Wall length and exposure by direction
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <WallDirectionField
            label="North"
            lengthValue={values.wall_north_len_ft}
            onLengthChange={(v) => update("wall_north_len_ft", v)}
            exposureValue={values.wall_north_exposure_type}
            onExposureChange={(v) => update("wall_north_exposure_type", v)}
          />
          <WallDirectionField
            label="South"
            lengthValue={values.wall_south_len_ft}
            onLengthChange={(v) => update("wall_south_len_ft", v)}
            exposureValue={values.wall_south_exposure_type}
            onExposureChange={(v) => update("wall_south_exposure_type", v)}
          />
          <WallDirectionField
            label="East"
            lengthValue={values.wall_east_len_ft}
            onLengthChange={(v) => update("wall_east_len_ft", v)}
            exposureValue={values.wall_east_exposure_type}
            onExposureChange={(v) => update("wall_east_exposure_type", v)}
          />
          <WallDirectionField
            label="West"
            lengthValue={values.wall_west_len_ft}
            onLengthChange={(v) => update("wall_west_len_ft", v)}
            exposureValue={values.wall_west_exposure_type}
            onExposureChange={(v) => update("wall_west_exposure_type", v)}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-brand-silver">
          Window area by exposure (sqft)
        </legend>
        <div className="grid grid-cols-4 gap-3">
          <NumberField
            label="North"
            value={values.window_north_area_sqft}
            onChange={(v) => update("window_north_area_sqft", v)}
          />
          <NumberField
            label="South"
            value={values.window_south_area_sqft}
            onChange={(v) => update("window_south_area_sqft", v)}
          />
          <NumberField
            label="East"
            value={values.window_east_area_sqft}
            onChange={(v) => update("window_east_area_sqft", v)}
          />
          <NumberField
            label="West"
            value={values.window_west_area_sqft}
            onChange={(v) => update("window_west_area_sqft", v)}
          />
        </div>
      </fieldset>

      <div className="w-32">
        <NumberField
          label="Door count"
          value={values.door_count}
          onChange={(v) => update("door_count", v)}
        />
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
        >
          {saving ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-brand-silver transition hover:border-brand-gold-hover hover:text-brand-gold-hover"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold";

function TextField({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <FieldWrap label={label}>
      <input
        type="text"
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </FieldWrap>
  );
}

function WallDirectionField({
  label,
  lengthValue,
  onLengthChange,
  exposureValue,
  onExposureChange,
}: {
  label: string;
  lengthValue: string;
  onLengthChange: (value: string) => void;
  exposureValue: string;
  onExposureChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5 rounded-md border border-brand-gold/50 bg-brand-bg p-2">
      <NumberField label={`${label} length (ft)`} value={lengthValue} onChange={onLengthChange} />
      <SelectField
        label={`${label} exposure`}
        value={exposureValue}
        onChange={onExposureChange}
        options={WALL_EXPOSURE_OPTIONS}
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
    <FieldWrap label={label}>
      <select
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrap>
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
    <FieldWrap label={label}>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </FieldWrap>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-brand-silver">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-brand-gold"
      />
      {label}
    </label>
  );
}

function FieldWrap({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-brand-grey-text">
        {label}
      </label>
      {children}
    </div>
  );
}
