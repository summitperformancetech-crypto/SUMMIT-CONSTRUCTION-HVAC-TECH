"use client";

import { useState, type FormEvent, type ReactNode } from "react";

export type RoomFormValues = {
  name: string;
  level: string;
  floor_area_sqft: string;
  ceiling_height_ft: string;
  ceiling_exposed: boolean;
  floor_exposed: boolean;
  is_conditioned: boolean;
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
}: {
  initialValues: RoomFormValues;
  onSubmit: (values: RoomFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [values, setValues] = useState(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
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
      </div>
      {!values.is_conditioned && (
        <p className="text-xs text-zinc-500">
          Unconditioned rooms (garages, unconditioned attics, etc.) are excluded from
          whole-house Manual J totals but stay in the room list so other rooms can
          reference them as adjacent unconditioned space.
        </p>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-zinc-300">
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
        <legend className="mb-2 text-sm font-medium text-zinc-300">
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
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50"
        >
          {saving ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500";

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
    <div className="space-y-1.5 rounded-md border border-zinc-800 bg-zinc-950 p-2">
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
    <label className="flex items-center gap-2 text-sm text-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-amber-500"
      />
      {label}
    </label>
  );
}

function FieldWrap({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-400">
        {label}
      </label>
      {children}
    </div>
  );
}
