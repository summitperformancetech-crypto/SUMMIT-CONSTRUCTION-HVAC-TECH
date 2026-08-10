"use client";

import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  computeManualJ,
  type AtticConstructionType,
  type ManualJEnvelope,
  type ManualJRoom,
  type WallExposureType,
} from "@/lib/manualJ";
import type { ExtractedRoom } from "@/lib/drawingExtraction";
import {
  RoomForm,
  EMPTY_ROOM_FORM,
  ROOM_LEVEL_OPTIONS,
  type RoomFormValues,
} from "@/components/room-form";

export type RoomRow = ManualJRoom & {
  project_id: string;
  level: string;
};

const ATTIC_CONSTRUCTION_OPTIONS = [
  { value: "vented_unconditioned", label: "Vented / Unconditioned (insulation at ceiling plane)" },
  { value: "sealed_conditioned", label: "Sealed / Conditioned (spray foam at roof deck)" },
] as const;

const ATTIC_INSULATION_OPTIONS = [
  { value: "", label: "—" },
  { value: "fiberglass", label: "Fiberglass" },
  { value: "cellulose", label: "Cellulose" },
  { value: "mineral_wool", label: "Mineral wool" },
  { value: "other", label: "Other" },
] as const;

type EnvelopeFormValues = {
  wall_insulation_r_value: string;
  ceiling_insulation_r_value: string;
  floor_insulation_r_value: string;
  window_u_value: string;
  window_shgc: string;
  ach50: string;
  indoor_design_temp_heating_f: string;
  indoor_design_temp_cooling_f: string;
  occupants: string;
  attic_construction_type: string;
  attic_insulation_type: string;
};

const ROOM_COLUMNS =
  "id, project_id, name, level, floor_area_sqft, ceiling_height_ft, ceiling_exposed, floor_exposed, is_conditioned, wall_north_len_ft, wall_south_len_ft, wall_east_len_ft, wall_west_len_ft, wall_north_exposure_type, wall_south_exposure_type, wall_east_exposure_type, wall_west_exposure_type, window_north_area_sqft, window_south_area_sqft, window_east_area_sqft, window_west_area_sqft, door_count";

// The only Building Envelope fields a drawing extraction is allowed to fill.
// ACH50, occupants, and indoor design temps are never populated from a drawing.
export type ExtractableEnvelopeFields = {
  wall_insulation_r_value: number | null;
  ceiling_insulation_r_value: number | null;
  floor_insulation_r_value: number | null;
};

export type ApplyExtractedDataResult = {
  appliedEnvelope: boolean;
  roomsCreated: number;
};

export type ManualJWorkflowHandle = {
  applyExtractedData: (
    envelope: ExtractableEnvelopeFields,
    extractedRooms: ExtractedRoom[],
  ) => Promise<ApplyExtractedDataResult>;
};

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function envelopeToForm(
  envelope: ManualJEnvelope,
  atticInsulationType: string | null,
): EnvelopeFormValues {
  return {
    wall_insulation_r_value: envelope.wall_insulation_r_value?.toString() ?? "",
    ceiling_insulation_r_value:
      envelope.ceiling_insulation_r_value?.toString() ?? "",
    floor_insulation_r_value: envelope.floor_insulation_r_value?.toString() ?? "",
    window_u_value: envelope.window_u_value?.toString() ?? "",
    window_shgc: envelope.window_shgc?.toString() ?? "",
    ach50: envelope.ach50?.toString() ?? "",
    indoor_design_temp_heating_f: envelope.indoor_design_temp_heating_f.toString(),
    indoor_design_temp_cooling_f: envelope.indoor_design_temp_cooling_f.toString(),
    occupants: envelope.occupants.toString(),
    attic_construction_type: envelope.attic_construction_type,
    attic_insulation_type: atticInsulationType ?? "",
  };
}

function formToEnvelope(form: EnvelopeFormValues): ManualJEnvelope {
  return {
    wall_insulation_r_value: toNullableNumber(form.wall_insulation_r_value),
    ceiling_insulation_r_value: toNullableNumber(form.ceiling_insulation_r_value),
    floor_insulation_r_value: toNullableNumber(form.floor_insulation_r_value),
    window_u_value: toNullableNumber(form.window_u_value),
    window_shgc: toNullableNumber(form.window_shgc),
    ach50: toNullableNumber(form.ach50),
    indoor_design_temp_heating_f: toNumber(form.indoor_design_temp_heating_f, 70),
    indoor_design_temp_cooling_f: toNumber(form.indoor_design_temp_cooling_f, 75),
    occupants: Math.max(0, Math.round(toNumber(form.occupants, 2))),
    attic_construction_type: form.attic_construction_type as AtticConstructionType,
  };
}

function roomToForm(room: RoomRow): RoomFormValues {
  return {
    name: room.name,
    level: room.level,
    floor_area_sqft: room.floor_area_sqft?.toString() ?? "",
    ceiling_height_ft: room.ceiling_height_ft?.toString() ?? "",
    ceiling_exposed: room.ceiling_exposed,
    floor_exposed: room.floor_exposed,
    is_conditioned: room.is_conditioned,
    wall_north_len_ft: room.wall_north_len_ft?.toString() ?? "",
    wall_south_len_ft: room.wall_south_len_ft?.toString() ?? "",
    wall_east_len_ft: room.wall_east_len_ft?.toString() ?? "",
    wall_west_len_ft: room.wall_west_len_ft?.toString() ?? "",
    wall_north_exposure_type: room.wall_north_exposure_type,
    wall_south_exposure_type: room.wall_south_exposure_type,
    wall_east_exposure_type: room.wall_east_exposure_type,
    wall_west_exposure_type: room.wall_west_exposure_type,
    window_north_area_sqft: room.window_north_area_sqft?.toString() ?? "",
    window_south_area_sqft: room.window_south_area_sqft?.toString() ?? "",
    window_east_area_sqft: room.window_east_area_sqft?.toString() ?? "",
    window_west_area_sqft: room.window_west_area_sqft?.toString() ?? "",
    door_count: (room.door_count ?? 0).toString(),
  };
}

function formToRoomPayload(values: RoomFormValues) {
  return {
    name: values.name,
    level: values.level,
    floor_area_sqft: toNullableNumber(values.floor_area_sqft),
    ceiling_height_ft: toNullableNumber(values.ceiling_height_ft),
    ceiling_exposed: values.ceiling_exposed,
    floor_exposed: values.floor_exposed,
    is_conditioned: values.is_conditioned,
    wall_north_len_ft: toNullableNumber(values.wall_north_len_ft),
    wall_south_len_ft: toNullableNumber(values.wall_south_len_ft),
    wall_east_len_ft: toNullableNumber(values.wall_east_len_ft),
    wall_west_len_ft: toNullableNumber(values.wall_west_len_ft),
    wall_north_exposure_type: values.wall_north_exposure_type as WallExposureType,
    wall_south_exposure_type: values.wall_south_exposure_type as WallExposureType,
    wall_east_exposure_type: values.wall_east_exposure_type as WallExposureType,
    wall_west_exposure_type: values.wall_west_exposure_type as WallExposureType,
    window_north_area_sqft: toNullableNumber(values.window_north_area_sqft),
    window_south_area_sqft: toNullableNumber(values.window_south_area_sqft),
    window_east_area_sqft: toNullableNumber(values.window_east_area_sqft),
    window_west_area_sqft: toNullableNumber(values.window_west_area_sqft),
    door_count: toNullableNumber(values.door_count) ?? 0,
  };
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString();
}

function levelLabel(level: string): string {
  return ROOM_LEVEL_OPTIONS.find((option) => option.value === level)?.label ?? level;
}

export const ManualJWorkflow = forwardRef<
  ManualJWorkflowHandle,
  {
    projectId: string;
    initialEnvelope: ManualJEnvelope;
    initialRooms: RoomRow[];
    initialAtticInsulationType: string | null;
    winterDesignTempF: number | null;
    summerDesignTempF: number | null;
  }
>(function ManualJWorkflow(
  {
    projectId,
    initialEnvelope,
    initialRooms,
    initialAtticInsulationType,
    winterDesignTempF,
    summerDesignTempF,
  },
  ref,
) {
  const [envelopeForm, setEnvelopeForm] = useState(
    envelopeToForm(initialEnvelope, initialAtticInsulationType),
  );
  const [envelopeSaving, setEnvelopeSaving] = useState(false);
  const [envelopeError, setEnvelopeError] = useState<string | null>(null);
  const [envelopeSaved, setEnvelopeSaved] = useState(false);

  const [rooms, setRooms] = useState<RoomRow[]>(initialRooms);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const roomsSectionRef = useRef<HTMLDivElement>(null);

  const envelope = useMemo(() => formToEnvelope(envelopeForm), [envelopeForm]);
  const unconditionedRooms = useMemo(
    () => rooms.filter((room) => !room.is_conditioned),
    [rooms],
  );

  const canCalculate = winterDesignTempF != null && summerDesignTempF != null;

  const results = useMemo(() => {
    if (!canCalculate) return null;
    return computeManualJ(rooms, envelope, winterDesignTempF!, summerDesignTempF!);
  }, [rooms, envelope, winterDesignTempF, summerDesignTempF, canCalculate]);

  function updateEnvelopeField<K extends keyof EnvelopeFormValues>(
    key: K,
    value: EnvelopeFormValues[K],
  ) {
    setEnvelopeForm((prev) => ({ ...prev, [key]: value }));
    setEnvelopeSaved(false);
  }

  async function handleSaveEnvelope() {
    setEnvelopeSaving(true);
    setEnvelopeError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("projects")
      .update({
        ...formToEnvelope(envelopeForm),
        attic_insulation_type: toNullableString(envelopeForm.attic_insulation_type),
      })
      .eq("id", projectId);
    setEnvelopeSaving(false);
    if (error) {
      setEnvelopeError(error.message);
      return;
    }
    setEnvelopeSaved(true);
  }

  async function handleAddRoom(values: RoomFormValues) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("rooms")
      .insert({ ...formToRoomPayload(values), project_id: projectId })
      .select(ROOM_COLUMNS)
      .single<RoomRow>();
    if (error) throw new Error(error.message);
    setRooms((prev) => [...prev, data]);
    setShowAddForm(false);
  }

  async function handleUpdateRoom(id: string, values: RoomFormValues) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("rooms")
      .update(formToRoomPayload(values))
      .eq("id", id)
      .select(ROOM_COLUMNS)
      .single<RoomRow>();
    if (error) throw new Error(error.message);
    setRooms((prev) => prev.map((room) => (room.id === id ? data : room)));
    setEditingRoomId(null);
  }

  async function handleDeleteRoom(id: string) {
    if (!window.confirm("Delete this room? This can't be undone.")) return;
    setListError(null);
    const supabase = createClient();
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) {
      setListError(error.message);
      return;
    }
    setRooms((prev) => prev.filter((room) => room.id !== id));
  }

  useImperativeHandle(ref, () => ({
    async applyExtractedData(extractedEnvelope, extractedRooms) {
      let appliedEnvelope = false;
      setEnvelopeForm((prev) => {
        const next = { ...prev };
        (
          [
            "wall_insulation_r_value",
            "ceiling_insulation_r_value",
            "floor_insulation_r_value",
          ] as const
        ).forEach((key) => {
          const extractedValue = extractedEnvelope[key];
          if (extractedValue != null && prev[key].trim() === "") {
            next[key] = String(extractedValue);
            appliedEnvelope = true;
          }
        });
        if (appliedEnvelope) setEnvelopeSaved(false);
        return next;
      });

      let roomsCreated = 0;
      if (rooms.length === 0 && extractedRooms.length > 0) {
        const supabase = createClient();
        const payloads = extractedRooms.map((room) => ({
          project_id: projectId,
          name: room.name || "Untitled room",
          level: "single_story",
          floor_area_sqft: room.floor_area_sqft,
          ceiling_height_ft: null,
          ceiling_exposed: false,
          floor_exposed: false,
          wall_north_len_ft: room.wall_north_len_ft,
          wall_south_len_ft: room.wall_south_len_ft,
          wall_east_len_ft: room.wall_east_len_ft,
          wall_west_len_ft: room.wall_west_len_ft,
          window_north_area_sqft: null,
          window_south_area_sqft: null,
          window_east_area_sqft: null,
          window_west_area_sqft: null,
          door_count: room.door_count ?? 0,
        }));

        const { data, error } = await supabase
          .from("rooms")
          .insert(payloads)
          .select(ROOM_COLUMNS)
          .returns<RoomRow[]>();

        if (!error && data) {
          setRooms(data);
          roomsCreated = data.length;
        }
      }

      requestAnimationFrame(() => {
        roomsSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });

      return { appliedEnvelope, roomsCreated };
    },
  }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Building Envelope
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <EnvelopeField
            label="Wall insulation (R)"
            value={envelopeForm.wall_insulation_r_value}
            onChange={(v) => updateEnvelopeField("wall_insulation_r_value", v)}
          />
          <EnvelopeField
            label="Ceiling insulation (R)"
            value={envelopeForm.ceiling_insulation_r_value}
            onChange={(v) => updateEnvelopeField("ceiling_insulation_r_value", v)}
          />
          <EnvelopeField
            label="Floor insulation (R)"
            value={envelopeForm.floor_insulation_r_value}
            onChange={(v) => updateEnvelopeField("floor_insulation_r_value", v)}
          />
          <EnvelopeField
            label="Window U-value"
            value={envelopeForm.window_u_value}
            onChange={(v) => updateEnvelopeField("window_u_value", v)}
          />
          <EnvelopeField
            label="Window SHGC"
            value={envelopeForm.window_shgc}
            onChange={(v) => updateEnvelopeField("window_shgc", v)}
          />
          <EnvelopeField
            label="ACH50 (infiltration)"
            value={envelopeForm.ach50}
            onChange={(v) => updateEnvelopeField("ach50", v)}
          />
          <EnvelopeField
            label="Indoor heating design (°F)"
            value={envelopeForm.indoor_design_temp_heating_f}
            onChange={(v) =>
              updateEnvelopeField("indoor_design_temp_heating_f", v)
            }
          />
          <EnvelopeField
            label="Indoor cooling design (°F)"
            value={envelopeForm.indoor_design_temp_cooling_f}
            onChange={(v) =>
              updateEnvelopeField("indoor_design_temp_cooling_f", v)
            }
          />
          <EnvelopeField
            label="Occupants"
            value={envelopeForm.occupants}
            onChange={(v) => updateEnvelopeField("occupants", v)}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <EnvelopeSelectField
            label="Attic construction"
            value={envelopeForm.attic_construction_type}
            onChange={(v) => updateEnvelopeField("attic_construction_type", v)}
            options={ATTIC_CONSTRUCTION_OPTIONS}
          />
          {envelopeForm.attic_construction_type === "vented_unconditioned" && (
            <EnvelopeSelectField
              label="Attic insulation type"
              value={envelopeForm.attic_insulation_type}
              onChange={(v) => updateEnvelopeField("attic_insulation_type", v)}
              options={ATTIC_INSULATION_OPTIONS}
            />
          )}
        </div>
        {envelopeForm.attic_construction_type === "sealed_conditioned" && (
          <p className="mt-2 text-xs text-zinc-500">
            Sealed attic: the ceiling plane is treated as a buffer space (reduced delta-T),
            not full outdoor exposure, using the same approximation as adjacent-unconditioned
            walls — see lib/manualJ.ts.
          </p>
        )}

        {envelopeError && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {envelopeError}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSaveEnvelope}
            disabled={envelopeSaving}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50"
          >
            {envelopeSaving ? "Saving…" : "Save Envelope"}
          </button>
          {envelopeSaved && (
            <span className="text-sm text-emerald-400">Saved.</span>
          )}
        </div>
      </section>

      <section
        ref={roomsSectionRef}
        className="scroll-mt-6 rounded-lg border border-zinc-800 bg-zinc-950 p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Rooms</h2>
          {!showAddForm && (
            <button
              onClick={() => {
                setShowAddForm(true);
                setEditingRoomId(null);
              }}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400"
            >
              Add Room
            </button>
          )}
        </div>

        {listError && (
          <p className="mb-4 text-sm text-red-400" role="alert">
            {listError}
          </p>
        )}

        {showAddForm && (
          <div className="mb-4">
            <RoomForm
              initialValues={EMPTY_ROOM_FORM}
              submitLabel="Add Room"
              onSubmit={handleAddRoom}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        )}

        {rooms.length === 0 && !showAddForm && (
          <p className="rounded-md border border-zinc-800 bg-zinc-900 px-4 py-6 text-center text-sm text-zinc-400">
            No rooms yet. Add your first room to start the load calculation.
          </p>
        )}

        {rooms.length > 0 && (
          <ul className="space-y-3">
            {rooms.map((room) =>
              editingRoomId === room.id ? (
                <li key={room.id}>
                  <RoomForm
                    initialValues={roomToForm(room)}
                    submitLabel="Save Room"
                    onSubmit={(values) => handleUpdateRoom(room.id, values)}
                    onCancel={() => setEditingRoomId(null)}
                  />
                </li>
              ) : (
                <li
                  key={room.id}
                  className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3"
                >
                  <div>
                    <p className="flex items-center gap-2 font-medium text-zinc-100">
                      {room.name}
                      {!room.is_conditioned && (
                        <span className="rounded-full border border-zinc-600 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                          Unconditioned
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-zinc-400">
                      {levelLabel(room.level)} · {room.floor_area_sqft ?? "—"} sqft
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingRoomId(room.id);
                        setShowAddForm(false);
                      }}
                      className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteRoom(room.id)}
                      className="rounded-md border border-red-900 px-3 py-1.5 text-sm text-red-400 transition hover:border-red-700 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          Manual J Results
        </h2>

        {!canCalculate && (
          <p className="text-sm text-zinc-400">
            Confirm climate data above before running the load calculation.
          </p>
        )}

        {canCalculate && rooms.length === 0 && (
          <p className="text-sm text-zinc-400">
            Add at least one room to see load results.
          </p>
        )}

        {canCalculate && unconditionedRooms.length > 0 && (
          <p className="mb-3 text-xs text-zinc-500">
            {unconditionedRooms.length} unconditioned room(s) excluded from totals:{" "}
            {unconditionedRooms.map((r) => r.name).join(", ")}
          </p>
        )}

        {canCalculate && results && rooms.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-4">Room</th>
                  <th className="py-2 pr-4 text-right">Heating BTU/hr</th>
                  <th className="py-2 pr-4 text-right">Cooling Sensible</th>
                  <th className="py-2 pr-4 text-right">Cooling Latent</th>
                  <th className="py-2 text-right">Cooling Total</th>
                </tr>
              </thead>
              <tbody>
                {results.rooms.map((room) => (
                  <tr key={room.roomId} className="border-b border-zinc-900">
                    <td className="py-2 pr-4 text-zinc-100">{room.roomName}</td>
                    <td className="py-2 pr-4 text-right text-zinc-300">
                      {fmt(room.heatingBtuh)}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-300">
                      {fmt(room.coolingSensibleBtuh)}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-300">
                      {fmt(room.coolingLatentBtuh)}
                    </td>
                    <td className="py-2 text-right text-zinc-300">
                      {fmt(room.coolingTotalBtuh)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold text-amber-500">
                  <td className="py-2 pr-4">Whole House Total</td>
                  <td className="py-2 pr-4 text-right">
                    {fmt(results.wholeHouse.heatingBtuh)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {fmt(results.wholeHouse.coolingSensibleBtuh)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {fmt(results.wholeHouse.coolingLatentBtuh)}
                  </td>
                  <td className="py-2 text-right">
                    {fmt(results.wholeHouse.coolingTotalBtuh)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
});

function EnvelopeField({
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
      <label className="mb-1 block text-xs font-medium text-zinc-400">
        {label}
      </label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
      />
    </div>
  );
}

function EnvelopeSelectField({
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
      <label className="mb-1 block text-xs font-medium text-zinc-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
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
