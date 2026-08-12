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
  type ManualJZone,
  type RoomTypeDefault,
  type WallExposureType,
} from "@/lib/manualJ";
import type { ExtractedRoom } from "@/lib/drawingExtraction";
import { normalizeDuctLocation, buildCodeMinimumsByLocation } from "@/lib/constants/ductLocations";
import {
  RoomForm,
  EMPTY_ROOM_FORM,
  ROOM_LEVEL_OPTIONS,
  UNASSIGNED_ZONE,
  type RoomFormValues,
} from "@/components/room-form";
import { DuctDesignSection, type DuctRunRow } from "@/components/duct-design-section";
import type { DuctSizingTableRow } from "@/lib/manualD";
import { EquipmentSelectionSection } from "@/components/equipment-selection-section";
import type { EquipmentCatalogEntry, PerformancePoint } from "@/lib/manualS";

export type RoomRow = ManualJRoom & {
  project_id: string;
  level: string;
  // Provenance for duct_location/duct_insulation_r_value - not consumed by
  // computeManualJ (hence not on ManualJRoom itself), only by the
  // dirty-tracking in formToRoomPayload below.
  duct_source: string | null;
  duct_confidence: number | null;
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
  door_u_value: string;
  ach50: string;
  indoor_design_temp_heating_f: string;
  indoor_design_temp_cooling_f: string;
  occupants: string;
  attic_construction_type: string;
  attic_insulation_type: string;
  foundation_type: string;
  window_type: string;
  window_count: string;
};

const ROOM_COLUMNS =
  "id, project_id, name, level, floor_area_sqft, ceiling_height_ft, ceiling_exposed, floor_exposed, is_conditioned, is_bedroom, room_type, occupant_count, sensible_gain_override, latent_gain_override, duct_location, duct_insulation_r_value, duct_source, duct_confidence, zone_id, wall_north_len_ft, wall_south_len_ft, wall_east_len_ft, wall_west_len_ft, wall_north_exposure_type, wall_south_exposure_type, wall_east_exposure_type, wall_west_exposure_type, window_north_area_sqft, window_south_area_sqft, window_east_area_sqft, window_west_area_sqft, door_count";

const ZONE_COLUMNS = "id, project_id, name, ahu_label, created_at";

// The only Building Envelope fields a drawing extraction is allowed to fill.
// ACH50, occupants, and indoor design temps are never populated from a drawing.
// foundation_type/window_type/window_count aren't consumed by
// ManualJEnvelope/computeManualJ (see migrations 20260810210059_add_ducts.sql
// and 20260811005233_add_window_type_count.sql) - carried here only so
// "Apply to Form" can fill them the same way as the R-values.
export type ExtractableEnvelopeFields = {
  wall_insulation_r_value: number | null;
  ceiling_insulation_r_value: number | null;
  floor_insulation_r_value: number | null;
  foundation_type: string | null;
  window_type: string | null;
  window_count: number | null;
};

export type ApplyExtractedDataResult = {
  appliedEnvelope: boolean;
  roomsCreated: number;
  roomsUpdated: number;
  // Set when the room-insert (or a duct write-through update) batch
  // actually failed at the DB - distinct from roomsCreated/roomsUpdated
  // both being 0 because there was genuinely nothing new to apply. Without
  // this, a failed insert (e.g. a bad duct_location enum value tripping
  // rooms_duct_location_check) looked identical in the UI to "already
  // up to date".
  error: string | null;
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
  foundationType: string | null,
  windowType: string | null,
  windowCount: number | null,
): EnvelopeFormValues {
  return {
    wall_insulation_r_value: envelope.wall_insulation_r_value?.toString() ?? "",
    ceiling_insulation_r_value:
      envelope.ceiling_insulation_r_value?.toString() ?? "",
    floor_insulation_r_value: envelope.floor_insulation_r_value?.toString() ?? "",
    window_u_value: envelope.window_u_value?.toString() ?? "",
    window_shgc: envelope.window_shgc?.toString() ?? "",
    door_u_value: envelope.door_u_value?.toString() ?? "",
    ach50: envelope.ach50?.toString() ?? "",
    indoor_design_temp_heating_f: envelope.indoor_design_temp_heating_f.toString(),
    indoor_design_temp_cooling_f: envelope.indoor_design_temp_cooling_f.toString(),
    occupants: envelope.occupants.toString(),
    attic_construction_type: envelope.attic_construction_type,
    attic_insulation_type: atticInsulationType ?? "",
    foundation_type: foundationType ?? "",
    window_type: windowType ?? "",
    window_count: windowCount?.toString() ?? "",
  };
}

function formToEnvelope(form: EnvelopeFormValues): ManualJEnvelope {
  return {
    wall_insulation_r_value: toNullableNumber(form.wall_insulation_r_value),
    ceiling_insulation_r_value: toNullableNumber(form.ceiling_insulation_r_value),
    floor_insulation_r_value: toNullableNumber(form.floor_insulation_r_value),
    window_u_value: toNullableNumber(form.window_u_value),
    window_shgc: toNullableNumber(form.window_shgc),
    door_u_value: toNullableNumber(form.door_u_value),
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
    is_bedroom: room.is_bedroom,
    zone_id: room.zone_id ?? UNASSIGNED_ZONE,
    room_type: room.room_type ?? "",
    occupant_count: room.occupant_count?.toString() ?? "",
    sensible_gain_override: room.sensible_gain_override?.toString() ?? "",
    latent_gain_override: room.latent_gain_override?.toString() ?? "",
    duct_location: room.duct_location ?? "",
    duct_insulation_r_value: room.duct_insulation_r_value?.toString() ?? "",
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

// originalDuct is only passed by handleUpdateRoom (an existing room being
// edited) - handleAddRoom has no prior duct state to compare against, so
// every duct value entered on a new room is inherently a fresh manual
// entry. When editing, if duct_location/duct_insulation_r_value come back
// out unchanged from what's already on the room, the room's existing
// duct_source (ai_extracted/default/manual/null) is preserved instead of
// being stomped to 'manual' - editing an unrelated field (e.g. floor
// area) must not silently erase AI-extraction provenance on fields the
// tech never touched.
function formToRoomPayload(
  values: RoomFormValues,
  originalDuct?: {
    duct_location: string | null;
    duct_insulation_r_value: number | null;
    duct_source: string | null;
  },
) {
  const zoneId =
    values.zone_id === UNASSIGNED_ZONE ? null : toNullableString(values.zone_id);
  const ductLocation = toNullableString(values.duct_location);
  const ductR = toNullableNumber(values.duct_insulation_r_value);
  const ductFieldsUnchanged =
    originalDuct != null &&
    ductLocation === originalDuct.duct_location &&
    ductR === originalDuct.duct_insulation_r_value;
  return {
    name: values.name,
    level: values.level,
    floor_area_sqft: toNullableNumber(values.floor_area_sqft),
    ceiling_height_ft: toNullableNumber(values.ceiling_height_ft),
    ceiling_exposed: values.ceiling_exposed,
    floor_exposed: values.floor_exposed,
    is_conditioned: values.is_conditioned,
    is_bedroom: values.is_bedroom,
    zone_id: zoneId,
    room_type: toNullableString(values.room_type),
    occupant_count: toNullableNumber(values.occupant_count),
    sensible_gain_override: toNullableNumber(values.sensible_gain_override),
    latent_gain_override: toNullableNumber(values.latent_gain_override),
    duct_location: ductLocation,
    duct_insulation_r_value: ductR,
    duct_source: ductFieldsUnchanged
      ? originalDuct!.duct_source
      : ductLocation
        ? "manual"
        : null,
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
    initialFoundationType: string | null;
    initialWindowType: string | null;
    initialWindowCount: number | null;
    winterDesignTempF: number | null;
    summerDesignTempF: number | null;
    roomTypeDefaults: RoomTypeDefault[];
    initialZones: ManualJZone[];
    initialAvailableStaticPressureIwc: number | null;
    initialSupplyAirTempF: number | null;
    initialDuctRuns: DuctRunRow[];
    ductSizingTable: DuctSizingTableRow[];
    summerCoincidentWetbulbF: number | null;
    equipmentCatalog: EquipmentCatalogEntry[];
    equipmentPerformancePoints: PerformancePoint[];
    initialSelectedEquipmentId: string | null;
    initialEquipmentSelectionNotes: string | null;
    preferredEquipmentIds: ReadonlySet<string>;
    exclusiveEquipmentIds: ReadonlySet<string>;
    ductInsulationCodeMinimums: { duct_location: string; min_r_value: number }[];
  }
>(function ManualJWorkflow(
  {
    projectId,
    initialEnvelope,
    initialRooms,
    initialAtticInsulationType,
    initialFoundationType,
    initialWindowType,
    initialWindowCount,
    winterDesignTempF,
    summerDesignTempF,
    roomTypeDefaults,
    initialZones,
    initialAvailableStaticPressureIwc,
    initialSupplyAirTempF,
    initialDuctRuns,
    ductSizingTable,
    summerCoincidentWetbulbF,
    equipmentCatalog,
    equipmentPerformancePoints,
    initialSelectedEquipmentId,
    initialEquipmentSelectionNotes,
    preferredEquipmentIds,
    exclusiveEquipmentIds,
    ductInsulationCodeMinimums,
  },
  ref,
) {
  const [envelopeForm, setEnvelopeForm] = useState(
    envelopeToForm(
      initialEnvelope,
      initialAtticInsulationType,
      initialFoundationType,
      initialWindowType,
      initialWindowCount,
    ),
  );
  const [envelopeSaving, setEnvelopeSaving] = useState(false);
  const [envelopeError, setEnvelopeError] = useState<string | null>(null);
  const [envelopeSaved, setEnvelopeSaved] = useState(false);

  const [rooms, setRooms] = useState<RoomRow[]>(initialRooms);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const roomsSectionRef = useRef<HTMLDivElement>(null);

  const [zones, setZones] = useState<ManualJZone[]>(initialZones);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneAhuLabel, setNewZoneAhuLabel] = useState("");
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [zoneSaving, setZoneSaving] = useState(false);

  const envelope = useMemo(() => formToEnvelope(envelopeForm), [envelopeForm]);
  const unconditionedRooms = useMemo(
    () => rooms.filter((room) => !room.is_conditioned),
    [rooms],
  );

  const canCalculate = winterDesignTempF != null && summerDesignTempF != null;

  const codeMinimumsByLocation = useMemo(
    () => buildCodeMinimumsByLocation(ductInsulationCodeMinimums),
    [ductInsulationCodeMinimums],
  );

  const results = useMemo(() => {
    if (!canCalculate) return null;
    return computeManualJ(
      rooms,
      envelope,
      winterDesignTempF!,
      summerDesignTempF!,
      roomTypeDefaults,
      zones,
      codeMinimumsByLocation,
    );
  }, [
    rooms,
    envelope,
    winterDesignTempF,
    summerDesignTempF,
    canCalculate,
    roomTypeDefaults,
    zones,
    codeMinimumsByLocation,
  ]);

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
        foundation_type: toNullableString(envelopeForm.foundation_type),
        window_type: toNullableString(envelopeForm.window_type),
        window_count: toNullableNumber(envelopeForm.window_count),
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
    const payload = formToRoomPayload(values);
    // New rooms default to the project's first zone only when the Zone
    // dropdown was never touched (values.zone_id still EMPTY_ROOM_FORM's
    // ""). An explicit "Unassigned" choice is UNASSIGNED_ZONE, not "" -
    // formToRoomPayload already turns that into a real null, so checking
    // payload.zone_id here would incorrectly catch both cases the same
    // way the old bug did. Checking the pre-conversion values.zone_id is
    // what actually distinguishes them.
    if (values.zone_id === "" && zones.length > 0) {
      payload.zone_id = zones[0].id;
    }
    const { data, error } = await supabase
      .from("rooms")
      .insert({ ...payload, project_id: projectId })
      .select(ROOM_COLUMNS)
      .single<RoomRow>();
    if (error) throw new Error(error.message);
    setRooms((prev) => [...prev, data]);
    setShowAddForm(false);
  }

  async function handleQuickZoneChange(roomId: string, zoneId: string) {
    setListError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("rooms")
      .update({ zone_id: zoneId || null })
      .eq("id", roomId)
      .select(ROOM_COLUMNS)
      .single<RoomRow>();
    if (error) {
      setListError(error.message);
      return;
    }
    setRooms((prev) => prev.map((room) => (room.id === roomId ? data : room)));
  }

  async function handleAddZone() {
    if (newZoneName.trim() === "") return;
    setZoneSaving(true);
    setZoneError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("zones")
      .insert({
        project_id: projectId,
        name: newZoneName.trim(),
        ahu_label: toNullableString(newZoneAhuLabel),
      })
      .select(ZONE_COLUMNS)
      .single<ManualJZone>();
    setZoneSaving(false);
    if (error) {
      setZoneError(error.message);
      return;
    }
    setZones((prev) => [...prev, data]);
    setNewZoneName("");
    setNewZoneAhuLabel("");
  }

  async function handleRenameZone(zoneId: string, name: string, ahuLabel: string) {
    setZoneError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("zones")
      .update({ name, ahu_label: toNullableString(ahuLabel) })
      .eq("id", zoneId)
      .select(ZONE_COLUMNS)
      .single<ManualJZone>();
    if (error) {
      setZoneError(error.message);
      return;
    }
    setZones((prev) => prev.map((zone) => (zone.id === zoneId ? data : zone)));
  }

  async function handleDeleteZone(zoneId: string) {
    const roomsInZone = rooms.filter((room) => room.zone_id === zoneId).length;
    const confirmMsg =
      roomsInZone > 0
        ? `Delete this zone? ${roomsInZone} room(s) currently assigned to it will become Unassigned, not deleted.`
        : "Delete this zone?";
    if (!window.confirm(confirmMsg)) return;
    setZoneError(null);
    const supabase = createClient();
    const { error } = await supabase.from("zones").delete().eq("id", zoneId);
    if (error) {
      setZoneError(error.message);
      return;
    }
    setZones((prev) => prev.filter((zone) => zone.id !== zoneId));
    // zone_id on rooms is `on delete set null` at the DB level, but the
    // client-side rooms state won't know that happened without a refetch -
    // update it locally so the UI (and the next calc) reflects it
    // immediately rather than showing a stale zone assignment.
    setRooms((prev) =>
      prev.map((room) => (room.zone_id === zoneId ? { ...room, zone_id: null } : room)),
    );
  }

  async function handleUpdateRoom(id: string, values: RoomFormValues) {
    const supabase = createClient();
    const original = rooms.find((room) => room.id === id);
    const payload = formToRoomPayload(
      values,
      original
        ? {
            duct_location: original.duct_location,
            duct_insulation_r_value: original.duct_insulation_r_value,
            duct_source: original.duct_source,
          }
        : undefined,
    );
    const { data, error } = await supabase
      .from("rooms")
      .update(payload)
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
            "foundation_type",
            "window_type",
            "window_count",
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
      let roomsUpdated = 0;
      let applyError: string | null = null;
      if (rooms.length === 0 && extractedRooms.length > 0) {
        const supabase = createClient();
        // Rooms created from a drawing extraction default to the project's
        // first zone too, same as rooms added one at a time via
        // handleAddRoom.
        const defaultZoneId = zones.length > 0 ? zones[0].id : null;
        const payloads = extractedRooms.map((room) => ({
          project_id: projectId,
          name: room.name || "Untitled room",
          level: "single_story",
          zone_id: defaultZoneId,
          floor_area_sqft: room.floor_area_sqft,
          ceiling_height_ft: null,
          ceiling_exposed: false,
          floor_exposed: false,
          // Bedroom status/room type/occupants are never inferred from a
          // drawing extraction, same as indoor design temps - a tech
          // confirms them.
          is_bedroom: false,
          room_type: null,
          occupant_count: null,
          sensible_gain_override: null,
          latent_gain_override: null,
          // normalizeDuctLocation is a last defensive layer: the server
          // route already runs it (see applyDuctFallbackDefaults), but a
          // human can also free-type an override value in the Unresolved
          // badge (see FieldResolutionBadge) that reaches here via
          // drawings-section.tsx's resolvedRoom - that text field isn't
          // constrained to the enum at all. A value this can't map is
          // dropped to null rather than sent to the DB, where it would
          // fail rooms_duct_location_check for every room in this batch.
          duct_location: normalizeDuctLocation(room.duct_location?.value),
          duct_insulation_r_value: room.duct_insulation_r_value?.value ?? null,
          duct_source: room.duct_source ?? null,
          duct_confidence: room.duct_confidence ?? null,
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

        if (error) {
          applyError = `Failed to create rooms: ${error.message}`;
        } else if (data) {
          setRooms(data);
          roomsCreated = data.length;
        }
      } else if (extractedRooms.length > 0) {
        // Project already has rooms - don't duplicate them, but extracted
        // (or human-resolved, see drawings-section.tsx's handleApply) duct
        // data must still reach the actual room record, or the calc keeps
        // silently using whatever was there before (the bug this branch
        // fixes). Match by exact room name (case-insensitive): the only
        // correlation available, since a drawing extraction's room array
        // has no stable index->room-id mapping (see migration
        // 20260810195313_add_field_resolutions.sql). Skip a room whose name
        // is missing, unmatched, or ambiguous (shared by more than one
        // existing room) rather than guess which one it means.
        const supabase = createClient();
        const nameCounts = new Map<string, number>();
        for (const existing of rooms) {
          const key = existing.name.trim().toLowerCase();
          nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
        }

        const updatedRooms: RoomRow[] = [];
        const updateErrors: string[] = [];
        for (const extractedRoom of extractedRooms) {
          const rawDuctLocation = extractedRoom.duct_location?.value ?? null;
          // See the comment on the insert path above - same normalization,
          // same reason (this value can come from a free-typed Unresolved
          // override, not just the AI). Presence is judged on the raw
          // value so a room isn't skipped entirely just because its
          // location text was unmappable while its R-value is still good.
          const ductLocation = normalizeDuctLocation(rawDuctLocation);
          const ductR = extractedRoom.duct_insulation_r_value?.value ?? null;
          if (rawDuctLocation == null && ductR == null) continue;

          const key = extractedRoom.name?.trim().toLowerCase();
          if (!key || nameCounts.get(key) !== 1) continue;
          const target = rooms.find((r) => r.name.trim().toLowerCase() === key);
          if (!target) continue;

          const { data, error } = await supabase
            .from("rooms")
            .update({
              duct_location: ductLocation,
              duct_insulation_r_value: ductR,
              duct_source: extractedRoom.duct_source ?? null,
              duct_confidence: extractedRoom.duct_confidence ?? null,
            })
            .eq("id", target.id)
            .select(ROOM_COLUMNS)
            .single<RoomRow>();

          if (error) {
            updateErrors.push(`${target.name}: ${error.message}`);
          } else if (data) {
            updatedRooms.push(data);
            roomsUpdated += 1;
          }
        }
        if (updateErrors.length > 0) {
          applyError = `Failed to update duct data on ${updateErrors.length} room(s): ${updateErrors.join("; ")}`;
        }

        if (updatedRooms.length > 0) {
          setRooms((prev) =>
            prev.map((r) => updatedRooms.find((u) => u.id === r.id) ?? r),
          );
        }
      }

      requestAnimationFrame(() => {
        roomsSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });

      return { appliedEnvelope, roomsCreated, roomsUpdated, error: applyError };
    },
  }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
        <h2 className="mb-4 text-lg font-semibold text-brand-gold">
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
            label="Door U-value"
            value={envelopeForm.door_u_value}
            onChange={(v) => updateEnvelopeField("door_u_value", v)}
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
            label="Occupants (unused)"
            value={envelopeForm.occupants}
            onChange={(v) => updateEnvelopeField("occupants", v)}
          />
          <EnvelopeTextField
            label="Foundation type"
            value={envelopeForm.foundation_type}
            onChange={(v) => updateEnvelopeField("foundation_type", v)}
          />
          <EnvelopeTextField
            label="Window type"
            value={envelopeForm.window_type}
            onChange={(v) => updateEnvelopeField("window_type", v)}
          />
          <EnvelopeField
            label="Window count"
            value={envelopeForm.window_count}
            onChange={(v) => updateEnvelopeField("window_count", v)}
          />
        </div>
        <p className="mt-2 text-xs text-brand-grey-text">
          &quot;Occupants&quot; above no longer feeds the load calculation — internal gains
          are now computed per room from Room Type + Occupants on each room below. This
          field is kept only for older saved data.
        </p>

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
          <p className="mt-2 text-xs text-brand-grey-text">
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
            className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
          >
            {envelopeSaving ? "Saving…" : "Save Envelope"}
          </button>
          {envelopeSaved && (
            <span className="text-sm text-brand-success">Saved.</span>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
        <h2 className="mb-4 text-lg font-semibold text-brand-gold">Zones</h2>

        {zoneError && (
          <p className="mb-4 text-sm text-red-400" role="alert">
            {zoneError}
          </p>
        )}

        {zones.length === 0 ? (
          <p className="mb-4 rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-4 text-center text-sm text-brand-grey-text">
            No zones yet.
          </p>
        ) : (
          <ul className="mb-4 space-y-2">
            {zones.map((zone) => (
              <ZoneRow
                key={zone.id}
                zone={zone}
                roomCount={rooms.filter((room) => room.zone_id === zone.id).length}
                onRename={(name, ahuLabel) => handleRenameZone(zone.id, name, ahuLabel)}
                onDelete={() => handleDeleteZone(zone.id)}
              />
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-grey-text">Zone name</label>
            <input
              type="text"
              placeholder="Zone 2 - Upstairs AHU"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              className="w-56 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-grey-text">
              AHU label (optional)
            </label>
            <input
              type="text"
              placeholder="AHU-2"
              value={newZoneAhuLabel}
              onChange={(e) => setNewZoneAhuLabel(e.target.value)}
              className="w-32 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
            />
          </div>
          <button
            onClick={handleAddZone}
            disabled={zoneSaving || newZoneName.trim() === ""}
            className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
          >
            {zoneSaving ? "Adding…" : "Add Zone"}
          </button>
        </div>
      </section>

      <section
        ref={roomsSectionRef}
        className="scroll-mt-6 rounded-lg border border-brand-gold/50 bg-brand-bg p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-gold">Rooms</h2>
          {!showAddForm && (
            <button
              onClick={() => {
                setShowAddForm(true);
                setEditingRoomId(null);
              }}
              className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover"
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
              roomTypeDefaults={roomTypeDefaults}
              zones={zones}
            />
          </div>
        )}

        {rooms.length === 0 && !showAddForm && (
          <p className="rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-6 text-center text-sm text-brand-grey-text">
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
                    roomTypeDefaults={roomTypeDefaults}
                    zones={zones}
                  />
                </li>
              ) : (
                <li
                  key={room.id}
                  className="flex items-center justify-between rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-3"
                >
                  <div>
                    <p className="flex items-center gap-2 font-medium text-brand-silver-highlight">
                      {room.name}
                      {!room.is_conditioned && (
                        <span className="rounded-full border border-zinc-600 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-grey-text">
                          Unconditioned
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-brand-grey-text">
                      {levelLabel(room.level)} · {room.floor_area_sqft ?? "—"} sqft
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={room.zone_id ?? ""}
                      onChange={(e) => handleQuickZoneChange(room.id, e.target.value)}
                      className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-brand-silver outline-none focus:border-brand-gold"
                    >
                      <option value="">Unassigned</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        setEditingRoomId(room.id);
                        setShowAddForm(false);
                      }}
                      className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-brand-silver transition hover:border-brand-gold-hover hover:text-brand-gold-hover"
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

      <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
        <h2 className="mb-4 text-lg font-semibold text-brand-gold">
          Manual J Results
        </h2>

        {!canCalculate && (
          <p className="text-sm text-brand-grey-text">
            Confirm climate data above before running the load calculation.
          </p>
        )}

        {canCalculate && rooms.length === 0 && (
          <p className="text-sm text-brand-grey-text">
            Add at least one room to see load results.
          </p>
        )}

        {canCalculate && unconditionedRooms.length > 0 && (
          <p className="mb-3 text-xs text-brand-grey-text">
            {unconditionedRooms.length} unconditioned room(s) excluded from totals:{" "}
            {unconditionedRooms.map((r) => r.name).join(", ")}
          </p>
        )}

        {canCalculate && results && rooms.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-gold/50 text-left text-xs uppercase tracking-wide text-brand-grey-text">
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
                    <td className="py-2 pr-4 text-brand-silver-highlight">{room.roomName}</td>
                    <td className="py-2 pr-4 text-right text-brand-silver">
                      {fmt(room.heatingBtuh)}
                    </td>
                    <td className="py-2 pr-4 text-right text-brand-silver">
                      {fmt(room.coolingSensibleBtuh)}
                    </td>
                    <td className="py-2 pr-4 text-right text-brand-silver">
                      {fmt(room.coolingLatentBtuh)}
                    </td>
                    <td className="py-2 text-right text-brand-silver">
                      {fmt(room.coolingTotalBtuh)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold text-brand-gold">
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
            <p className="mt-3 text-xs text-brand-grey-text">
              Of which, doors: {fmt(results.wholeHouse.doorHeatingBtuh)} Btuh heating /{" "}
              {fmt(results.wholeHouse.doorCoolingBtuh)} Btuh cooling (already included in
              the totals above, at U-value {envelopeForm.door_u_value || "0.35 (default)"}).
            </p>
            <p className="mt-1 text-xs text-brand-grey-text">
              Of which, ASHRAE 62.2 ventilation: {fmt(results.wholeHouse.ventilationCfm)} CFM
              → {fmt(results.wholeHouse.ventilationHeatingBtuh)} Btuh heating /{" "}
              {fmt(results.wholeHouse.ventilationCoolingSensibleBtuh)} Btuh cooling sensible /{" "}
              {fmt(results.wholeHouse.ventilationCoolingLatentBtuh)} Btuh cooling latent
              (already included in the totals above; uncredited for infiltration — see
              lib/manualJ.ts).
            </p>
            <p className="mt-1 text-xs text-brand-grey-text">
              Of which, internal gains (occupants + appliances):{" "}
              {fmt(results.wholeHouse.internalGainsSensibleBtuh)} Btuh cooling sensible /{" "}
              {fmt(results.wholeHouse.internalGainsLatentBtuh)} Btuh cooling latent (already
              included in the totals above; heating unaffected, per-room breakdown on each
              room below).
            </p>
          </div>
        )}
      </section>

      {canCalculate && results && results.zones.length > 0 && (
        <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
          <h2 className="mb-4 text-lg font-semibold text-brand-gold">Zone Summary</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brand-gold/50 text-left text-xs uppercase tracking-wide text-brand-grey-text">
                  <th className="py-2 pr-4">Zone</th>
                  <th className="py-2 pr-4 text-right">Heating BTU/hr</th>
                  <th className="py-2 pr-4 text-right">Cooling Sensible</th>
                  <th className="py-2 pr-4 text-right">Cooling Latent</th>
                  <th className="py-2 text-right">Cooling Total</th>
                </tr>
              </thead>
              <tbody>
                {results.zones.map((zone) => (
                  <tr key={zone.zoneId ?? "unassigned"} className="border-b border-zinc-900">
                    <td className="py-2 pr-4 text-brand-silver-highlight">
                      {zone.zoneName}
                      {zone.zoneId === null && (
                        <span className="ml-2 rounded-full border border-brand-gold-base bg-brand-gold-base/25 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-gold-hover">
                          No zone assigned
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right text-brand-silver">{fmt(zone.heatingBtuh)}</td>
                    <td className="py-2 pr-4 text-right text-brand-silver">
                      {fmt(zone.coolingSensibleBtuh)}
                    </td>
                    <td className="py-2 pr-4 text-right text-brand-silver">
                      {fmt(zone.coolingLatentBtuh)}
                    </td>
                    <td className="py-2 text-right text-brand-silver">{fmt(zone.coolingTotalBtuh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-brand-grey-text">
            Each zone&apos;s ventilation (ASHRAE 62.2) is computed from that zone&apos;s own bedroom
            count and floor area, then summed for the whole-project total above — matching
            how the reference report computes ventilation per AHU rather than once for the
            whole house.
          </p>
        </section>
      )}

      {canCalculate && results && rooms.length > 0 && zones.length > 0 && (
        <DuctDesignSection
          projectId={projectId}
          rooms={rooms}
          zones={zones}
          roomResults={results.rooms}
          indoorCoolingDesignTempF={envelope.indoor_design_temp_cooling_f}
          initialAvailableStaticPressureIwc={initialAvailableStaticPressureIwc}
          initialSupplyAirTempF={initialSupplyAirTempF}
          initialDuctRuns={initialDuctRuns}
          ductSizingTable={ductSizingTable}
          ductInsulationCodeMinimums={ductInsulationCodeMinimums}
        />
      )}

      {canCalculate &&
        results &&
        winterDesignTempF != null &&
        summerDesignTempF != null &&
        summerCoincidentWetbulbF != null && (
          <EquipmentSelectionSection
            projectId={projectId}
            catalog={equipmentCatalog}
            performancePoints={equipmentPerformancePoints}
            manualJCoolingTotalBtuh={results.wholeHouse.coolingTotalBtuh}
            manualJHeatingBtuh={results.wholeHouse.heatingBtuh}
            summerOutdoorDesignF={summerDesignTempF}
            summerCoincidentWetbulbF={summerCoincidentWetbulbF}
            winterOutdoorDesignF={winterDesignTempF}
            initialSelectedEquipmentId={initialSelectedEquipmentId}
            initialEquipmentSelectionNotes={initialEquipmentSelectionNotes}
            preferredEquipmentIds={preferredEquipmentIds}
            exclusiveEquipmentIds={exclusiveEquipmentIds}
          />
        )}
      {canCalculate &&
        results &&
        winterDesignTempF != null &&
        summerDesignTempF != null &&
        summerCoincidentWetbulbF == null && (
          <p className="rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-3 text-sm text-brand-grey-text">
            Equipment Selection (Manual S) needs a summer coincident wet-bulb design temperature,
            which isn&apos;t in climate_zone_reference for this project&apos;s location yet.
          </p>
        )}
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
      <label className="mb-1 block text-xs font-medium text-brand-grey-text">
        {label}
      </label>
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

function EnvelopeTextField({
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
      <label className="mb-1 block text-xs font-medium text-brand-grey-text">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
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

function ZoneRow({
  zone,
  roomCount,
  onRename,
  onDelete,
}: {
  zone: ManualJZone;
  roomCount: number;
  onRename: (name: string, ahuLabel: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(zone.name);
  const [ahuLabel, setAhuLabel] = useState(zone.ahu_label ?? "");

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-48 rounded-md border border-zinc-700 bg-brand-bg px-2 py-1.5 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
        />
        <input
          type="text"
          placeholder="AHU label"
          value={ahuLabel}
          onChange={(e) => setAhuLabel(e.target.value)}
          className="w-28 rounded-md border border-zinc-700 bg-brand-bg px-2 py-1.5 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
        />
        <button
          onClick={() => {
            onRename(name, ahuLabel);
            setEditing(false);
          }}
          disabled={name.trim() === ""}
          className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={() => {
            setName(zone.name);
            setAhuLabel(zone.ahu_label ?? "");
            setEditing(false);
          }}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-brand-silver transition hover:border-brand-gold-hover"
        >
          Cancel
        </button>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-3">
      <div>
        <p className="font-medium text-brand-silver-highlight">
          {zone.name}
          {zone.ahu_label && <span className="ml-2 text-sm text-brand-grey-text">({zone.ahu_label})</span>}
        </p>
        <p className="text-sm text-brand-grey-text">
          {roomCount} room{roomCount === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setEditing(true)}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-brand-silver transition hover:border-brand-gold-hover hover:text-brand-gold-hover"
        >
          Rename
        </button>
        <button
          onClick={onDelete}
          className="rounded-md border border-red-900 px-3 py-1.5 text-sm text-red-400 transition hover:border-red-700 hover:text-red-300"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
