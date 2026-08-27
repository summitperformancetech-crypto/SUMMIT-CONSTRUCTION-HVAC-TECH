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
import type { ExtractedRoom, DrawingRow } from "@/lib/drawingExtraction";
import { DuctRoutingCanvas } from "@/components/duct-routing-canvas";
import { getDuctRoutingGateStatus } from "@/lib/ductRouting";
import type { CorridorGraph } from "@/lib/ductCorridorGraph";
import { normalizeDuctLocation, buildCodeMinimumsByLocation } from "@/lib/constants/ductLocations";
import { normalizeRoomNameForMatch } from "@/lib/fieldResolutions";
import { inferRoomTypeFromName, computeLocalExhaustRequirement } from "@/lib/localExhaust";
import {
  RoomForm,
  EMPTY_ROOM_FORM,
  ROOM_LEVEL_OPTIONS,
  UNASSIGNED_ZONE,
  type RoomFormValues,
} from "@/components/room-form";
import { DuctDesignSection, type DuctRunRow } from "@/components/duct-design-section";
import type { DuctDiffuserRow, AhuInstallationDetailRow, DuctTerminationRow } from "@/lib/ductRouting";
import type { DuctSizingTableRow } from "@/lib/manualD";
import { EquipmentSelectionSection } from "@/components/equipment-selection-section";
import type { EquipmentCatalogEntry, PerformancePoint } from "@/lib/manualS";
import { BuildingOrientationSection } from "@/components/building-orientation-section";
import { PreferredManufacturerSection } from "@/components/preferred-manufacturer-section";
import {
  SystemConfigurationSection,
  type HvacSystemConfiguration,
} from "@/components/system-configuration-section";
import type { Compass8 } from "@/lib/constants/compass";
import { mutateOrQueue } from "@/lib/offlineMutation";

export type RoomRow = ManualJRoom & {
  project_id: string;
  level: string;
  // Provenance for duct_location/duct_insulation_r_value - not consumed by
  // computeManualJ (hence not on ManualJRoom itself), only by the
  // dirty-tracking in formToRoomPayload below.
  duct_source: string | null;
  duct_confidence: number | null;
  // Building-orientation-driven wall auto-population (see
  // lib/orientation.ts) - drawing-relative wall lengths, only ever
  // populated when the compass wall_north/south/east/west_len_ft fields
  // above are null. Not consumed by computeManualJ (hence not on
  // ManualJRoom itself, same reasoning as duct_source above) - only read
  // by the orientation transform, which writes the real compass fields
  // computeManualJ does read.
  wall_front_len_ft: number | null;
  wall_rear_len_ft: number | null;
  wall_left_len_ft: number | null;
  wall_right_len_ft: number | null;
  // Window-area counterpart to wall_front/rear/left/right_len_ft above,
  // same reasoning (see migration
  // 20260813030300_add_window_drawing_relative_area.sql) - not consumed by
  // computeManualJ (window_north/south/east/west_area_sqft on ManualJRoom
  // are what it reads), only populated when the compass window fields are
  // null.
  window_front_area_sqft: number | null;
  window_rear_area_sqft: number | null;
  window_left_area_sqft: number | null;
  window_right_area_sqft: number | null;
  // Duct-routing pin placement (auto Manual D run length feature) - the
  // tech-confirmed final position, distinct from the AI-suggested
  // room_position living inside drawings.extracted_data. Only ever
  // written once a human has confirmed or moved a pin - see
  // components/duct-routing-canvas.tsx and lib/ductRouting.ts.
  position_x_norm: number | null;
  position_y_norm: number | null;
  position_source_drawing_id: string | null;
  position_source_page_number: number | null;
};

// SUMMIT-REPORT-STANDARD.md Section 5.3 - equipment selection is per
// zone/AHU, not project-wide (see zones.selected_equipment_id). Not
// added to lib/manualJ.ts's ManualJZone itself - that's the pure calc
// engine's grouping type, shared with contexts that have no reason to
// know about equipment selection.
export type ZoneRow = ManualJZone & {
  selected_equipment_id: string | null;
  // Permit-Submittable Manual D Package, Section 5 - a zone's real
  // selected air handler, independent of the outdoor unit above.
  selected_air_handler_equipment_id: string | null;
  equipment_selection_notes: string | null;
  // AHU/mechanical-equipment position - always tech-placed from scratch
  // (never AI-suggested, see lib/ductRouting.ts's module comment for why),
  // confirmed via the same pin-placement canvas as room positions.
  ahu_position_x_norm: number | null;
  ahu_position_y_norm: number | null;
  ahu_position_source_drawing_id: string | null;
  ahu_position_source_page_number: number | null;
  // Return-air plenum position - a real, independently-placed pin, same
  // tech-confirmed workflow as the AHU pin above, never assumed to be
  // co-located with it (see components/duct-routing-canvas.tsx).
  return_position_x_norm: number | null;
  return_position_y_norm: number | null;
  return_position_source_drawing_id: string | null;
  return_position_source_page_number: number | null;
  // Outdoor unit/condenser position - a real, independently-placed pin,
  // same tech-confirmed workflow as the AHU/return pins above. Needed by
  // the Recommended Install Package generator to compute a real
  // refrigerant line-set length (see lib/reportImages.ts).
  condenser_position_x_norm: number | null;
  condenser_position_y_norm: number | null;
  condenser_position_source_drawing_id: string | null;
  condenser_position_source_page_number: number | null;
  // Real, human-digitized corridor topology (lib/ductCorridorGraph.ts) -
  // the routing source of truth for this zone when present, per direct
  // instruction. See that module's own comment for the full shape and
  // why computed room-box-avoidance routing is only ever a fallback.
  corridor_graph: CorridorGraph | null;
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
  no_vented_attic_or_crawlspace: boolean;
};

export const ROOM_COLUMNS =
  "id, project_id, name, level, floor_area_sqft, ceiling_height_ft, ceiling_exposed, floor_exposed, is_conditioned, is_bedroom, room_type, occupant_count, sensible_gain_override, latent_gain_override, duct_location, duct_insulation_r_value, duct_source, duct_confidence, zone_id, wall_north_len_ft, wall_south_len_ft, wall_east_len_ft, wall_west_len_ft, wall_front_len_ft, wall_rear_len_ft, wall_left_len_ft, wall_right_len_ft, wall_north_exposure_type, wall_south_exposure_type, wall_east_exposure_type, wall_west_exposure_type, window_north_area_sqft, window_south_area_sqft, window_east_area_sqft, window_west_area_sqft, window_front_area_sqft, window_rear_area_sqft, window_left_area_sqft, window_right_area_sqft, door_count, position_x_norm, position_y_norm, position_source_drawing_id, position_source_page_number";

const ZONE_COLUMNS =
  "id, project_id, name, ahu_label, created_at, selected_equipment_id, selected_air_handler_equipment_id, equipment_selection_notes, ahu_position_x_norm, ahu_position_y_norm, ahu_position_source_drawing_id, ahu_position_source_page_number, return_position_x_norm, return_position_y_norm, return_position_source_drawing_id, return_position_source_page_number, condenser_position_x_norm, condenser_position_y_norm, condenser_position_source_drawing_id, condenser_position_source_page_number, corridor_graph";

// Diagnosed 2026-08-23 against real data (Kinsela): a room this drawing
// genuinely shows (e.g. a wet bar, a second hallway) that doesn't match
// any EXISTING room by name during re-extraction reconciliation was being
// silently discarded - worse, discarded with no signal at all whenever it
// also had no duct/wall/window data to report missing. The fix is that a
// zero-name-match room isn't an error case to skip, it's a genuinely new
// room the drawing revealed that this project doesn't have yet - it
// should be created, the same way every room is on a brand-new project's
// first apply. Shared by both call sites below so the two paths can't
// drift out of sync with each other.
function buildRoomInsertPayload(
  room: ExtractedRoom,
  projectId: string,
  zoneId: string | null,
  envelopeCeilingHeightFt: number | null,
) {
  return {
    project_id: projectId,
    name: room.name || "Untitled room",
    level: "single_story",
    zone_id: zoneId,
    floor_area_sqft: room.floor_area_sqft,
    ceiling_height_ft: envelopeCeilingHeightFt,
    ceiling_exposed: false,
    floor_exposed: false,
    is_bedroom: false,
    // Real, deterministic name-based classification (lib/localExhaust.ts)
    // - never invented by the AI extraction call itself, and never
    // overwrites a human-set value since this only runs at insert time,
    // when there is no existing value to overwrite yet.
    room_type: inferRoomTypeFromName(room.name),
    occupant_count: null,
    sensible_gain_override: null,
    latent_gain_override: null,
    duct_location: normalizeDuctLocation(room.duct_location?.value),
    duct_insulation_r_value: room.duct_insulation_r_value?.value ?? null,
    duct_source: room.duct_source ?? null,
    duct_confidence: room.duct_confidence ?? null,
    wall_north_len_ft: room.wall_north_len_ft,
    wall_south_len_ft: room.wall_south_len_ft,
    wall_east_len_ft: room.wall_east_len_ft,
    wall_west_len_ft: room.wall_west_len_ft,
    wall_front_len_ft: room.wall_front_len_ft,
    wall_rear_len_ft: room.wall_rear_len_ft,
    wall_left_len_ft: room.wall_left_len_ft,
    wall_right_len_ft: room.wall_right_len_ft,
    window_north_area_sqft: room.window_north_area_sqft,
    window_south_area_sqft: room.window_south_area_sqft,
    window_east_area_sqft: room.window_east_area_sqft,
    window_west_area_sqft: room.window_west_area_sqft,
    window_front_area_sqft: room.window_front_area_sqft,
    window_rear_area_sqft: room.window_rear_area_sqft,
    window_left_area_sqft: room.window_left_area_sqft,
    window_right_area_sqft: room.window_right_area_sqft,
    door_count: room.door_count ?? 0,
  };
}

// Real, IRC Table M1507.3-cited local-exhaust CFM draft for any newly
// created room room_type auto-classified as Bath/Kitchen (lib/
// localExhaust.ts) - inserted as a pending_review exhaust_sources row,
// never confirmed automatically, so it counts toward the makeup-air
// check (lib/makeupAir.ts) only once a human reviews it. Best-effort:
// failures here are logged, not surfaced as a blocking error, since the
// room itself was already created successfully - this is a helpful
// draft, not a required step.
async function createDraftLocalExhaustSources(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  newRooms: RoomRow[],
) {
  const payloads = newRooms.flatMap((room) => {
    const requirement = computeLocalExhaustRequirement(room.room_type, room.name);
    if (!requirement) return [];
    return [
      {
        project_id: projectId,
        room_id: room.id,
        source_type: room.room_type === "Kitchen" ? "kitchen_range_hood" : "bathroom_exhaust_fan",
        description: `Auto-computed from room type (${room.name}) - confirm before this counts toward the makeup-air check.`,
        rated_cfm: requirement.requiredCfm,
        basis: "code_minimum",
        review_status: "pending_review",
        code_citation: requirement.codeCitation,
      },
    ];
  });
  if (payloads.length === 0) return;
  const { error } = await supabase.from("exhaust_sources").insert(payloads);
  if (error) {
    console.error("Failed to draft local-exhaust sources for newly created rooms:", error.message);
  }
}

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
  // Unlike the fields above, this isn't a projects column - applyExtractedData
  // below uses it as a per-room default (see ExtractedEnvelope.ceiling_height_ft
  // in lib/drawingExtraction.ts), not as part of envelopeForm/handleSaveEnvelope.
  ceiling_height_ft: number | null;
  // Phase 2 Apply-to-Form wiring. Unlike the fields above, projects.
  // attic_construction_type is NOT NULL with a real default
  // ('vented_unconditioned') - there's no "empty string means never
  // entered" signal to gate on the way the fields above do, and this
  // value directly changes computeManualJ's attic-loss branch (a real
  // calculation input, not a cross-check). applyExtractedData below only
  // ever fills it on a brand-new project (zero rooms yet - the same
  // "nothing entered so far" signal this function already uses to decide
  // whether to bulk-insert rooms at all), never on an established
  // project where the current value - even if it happens to equal the
  // schema default - might be a human's real, confirmed choice.
  attic_construction_type: string | null;
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
  // Building-orientation-driven wall auto-population: re-extracting onto
  // a project that already has rooms matches by name (+ floor area for
  // wall data specifically, see below) rather than guessing - a room this
  // couldn't confidently match lands here with a human-readable reason,
  // instead of silently doing nothing.
  unmatchedRoomNotes: string[];
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

// Suggests, never forces, the next zone name - a real pre-filled value
// (not just a placeholder hint) so the "Add Zone" form visibly changes
// after a successful add rather than looking stuck on whatever was just
// submitted. Reads the highest "Zone N" number actually in use, so a
// zone renamed away from the default pattern doesn't confuse the count -
// falls back to zones.length + 1 only when NO zone matches the pattern
// at all (e.g. every zone has been custom-named), so the suggestion
// still keeps counting up rather than colliding back at "Zone 1".
function suggestNextZoneName(zones: { name: string }[]): string {
  let maxN = 0;
  let anyMatched = false;
  for (const zone of zones) {
    const match = zone.name.match(/^Zone (\d+)\b/);
    if (match) {
      anyMatched = true;
      const n = parseInt(match[1], 10);
      if (n > maxN) maxN = n;
    }
  }
  return `Zone ${anyMatched ? maxN + 1 : zones.length + 1}`;
}

function envelopeToForm(
  envelope: ManualJEnvelope,
  atticInsulationType: string | null,
  foundationType: string | null,
  windowType: string | null,
  windowCount: number | null,
  noVentedAtticOrCrawlspace: boolean,
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
    no_vented_attic_or_crawlspace: noVentedAtticOrCrawlspace,
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
    initialNoVentedAtticOrCrawlspace: boolean;
    winterDesignTempF: number | null;
    summerDesignTempF: number | null;
    roomTypeDefaults: RoomTypeDefault[];
    initialZones: ZoneRow[];
    initialAvailableStaticPressureIwc: number | null;
    initialSupplyAirTempF: number | null;
    initialBlowerTespIwc: number | null;
    initialEvaporatorCoilLossIwc: number | null;
    initialAirFilterLossIwc: number | null;
    initialGrillesRegistersLossIwc: number | null;
    initialDuctRuns: DuctRunRow[];
    initialDuctDiffusers: DuctDiffuserRow[];
    initialAhuInstallationDetails: AhuInstallationDetailRow[];
    initialDuctTerminations: DuctTerminationRow[];
    ductSizingTable: DuctSizingTableRow[];
    summerCoincidentWetbulbF: number | null;
    equipmentCatalog: EquipmentCatalogEntry[];
    equipmentPerformancePoints: PerformancePoint[];
    preferredEquipmentIds: ReadonlySet<string>;
    exclusiveEquipmentIds: ReadonlySet<string>;
    ductInsulationCodeMinimums: { duct_location: string; min_r_value: number }[];
    initialBuildingFrontFaces: Compass8 | null;
    initialDrawings: DrawingRow[];
    initialPreferredManufacturer: string | null;
    initialSystemConfiguration: HvacSystemConfiguration;
    userRole: string;
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
    initialNoVentedAtticOrCrawlspace,
    winterDesignTempF,
    summerDesignTempF,
    roomTypeDefaults,
    initialZones,
    initialAvailableStaticPressureIwc,
    initialSupplyAirTempF,
    initialBlowerTespIwc,
    initialEvaporatorCoilLossIwc,
    initialAirFilterLossIwc,
    initialGrillesRegistersLossIwc,
    initialDuctRuns,
    initialDuctDiffusers,
    initialAhuInstallationDetails,
    initialDuctTerminations,
    ductSizingTable,
    summerCoincidentWetbulbF,
    equipmentCatalog,
    equipmentPerformancePoints,
    preferredEquipmentIds,
    exclusiveEquipmentIds,
    ductInsulationCodeMinimums,
    initialBuildingFrontFaces,
    initialDrawings,
    initialPreferredManufacturer,
    initialSystemConfiguration,
    userRole,
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
      initialNoVentedAtticOrCrawlspace,
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

  const [preferredManufacturer, setPreferredManufacturer] = useState(initialPreferredManufacturer);
  const [systemConfiguration, setSystemConfiguration] = useState(initialSystemConfiguration);
  const manufacturers = useMemo(
    () => Array.from(new Set(equipmentCatalog.map((e) => e.manufacturer))).sort(),
    [equipmentCatalog],
  );

  const [zones, setZones] = useState<ZoneRow[]>(initialZones);
  const [newZoneName, setNewZoneName] = useState(() => suggestNextZoneName(initialZones));
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

  // One equipment-selection panel per real zone (SUMMIT-REPORT-STANDARD.md
  // Section 5.3's default), OR - when this project is configured as
  // "single_system_zoned" - ONE combined panel covering every real zone's
  // SUMMED load, since one physical system genuinely serves all of them
  // through zone dampers and sizing it against any single zone's own
  // (often much smaller) load would be wrong. A zone with no rooms
  // assigned (zero cooling load) is skipped either way - matches
  // computeManualJ's own "empty zone contributes nothing" guard, nothing
  // to size equipment against.
  const equipmentPanels = useMemo(() => {
    if (!results) return [];
    const realZones = zones
      .map((zone) => ({ zone, zoneLoad: results.zones.find((z) => z.zoneId === zone.id) ?? null }))
      .filter(
        (entry): entry is { zone: ZoneRow; zoneLoad: NonNullable<typeof entry.zoneLoad> } =>
          entry.zoneLoad != null && entry.zoneLoad.coolingTotalBtuh > 0,
      );
    if (realZones.length === 0) return [];

    if (systemConfiguration === "single_system_zoned") {
      // If the zones don't already agree (e.g. right after switching from
      // independent mode, each zone still carries its own old selection),
      // don't guess which one wins - start the combined panel unselected
      // rather than silently picking one zone's leftover value.
      const allAgree = realZones.every(
        (entry) => entry.zone.selected_equipment_id === realZones[0].zone.selected_equipment_id,
      );
      return [
        {
          key: "combined-system",
          zoneIds: realZones.map((entry) => entry.zone.id),
          zoneName: `Whole House (${realZones.map((entry) => entry.zone.name).join(" + ")})`,
          manualJCoolingTotalBtuh: realZones.reduce((sum, entry) => sum + entry.zoneLoad.coolingTotalBtuh, 0),
          manualJHeatingBtuh: realZones.reduce((sum, entry) => sum + entry.zoneLoad.heatingBtuh, 0),
          initialSelectedEquipmentId: allAgree ? realZones[0].zone.selected_equipment_id : null,
          initialSelectedAirHandlerId: allAgree ? realZones[0].zone.selected_air_handler_equipment_id : null,
          initialEquipmentSelectionNotes: allAgree ? realZones[0].zone.equipment_selection_notes : null,
        },
      ];
    }

    return realZones.map((entry) => ({
      key: entry.zone.id,
      zoneIds: [entry.zone.id],
      zoneName: entry.zone.name,
      manualJCoolingTotalBtuh: entry.zoneLoad.coolingTotalBtuh,
      manualJHeatingBtuh: entry.zoneLoad.heatingBtuh,
      initialSelectedEquipmentId: entry.zone.selected_equipment_id,
      initialSelectedAirHandlerId: entry.zone.selected_air_handler_equipment_id,
      initialEquipmentSelectionNotes: entry.zone.equipment_selection_notes,
    }));
  }, [results, zones, systemConfiguration]);

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
        no_vented_attic_or_crawlspace: envelopeForm.no_vented_attic_or_crawlspace,
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

  // All three zone handlers below wrap their Supabase call in try/catch -
  // not just check `error` on the resolved result. A genuine network-level
  // failure (DNS, connection refused, a blocked request) can reject the
  // underlying fetch before postgrest-js has a response to wrap into
  // {data, error}, which surfaces as a THROWN exception, not a resolved
  // {error} value. Uncaught inside an async onClick handler, that's an
  // unhandled promise rejection - invisible to the user (console-only),
  // and since it happens on the line that would have called
  // setZoneSaving(false), the button stays stuck on "Adding..." with no
  // visible error at all. Exactly the silent-failure shape this was
  // written to close off.
  async function handleAddZone() {
    if (newZoneName.trim() === "") return;
    setZoneSaving(true);
    setZoneError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("zones")
        .insert({
          project_id: projectId,
          name: newZoneName.trim(),
          ahu_label: toNullableString(newZoneAhuLabel),
        })
        .select(ZONE_COLUMNS)
        .single<ZoneRow>();
      if (error) {
        setZoneError(error.message);
        return;
      }
      const updatedZones = [...zones, data];
      setZones(updatedZones);
      // Suggest the NEXT name (not just clear to empty) - a real,
      // different value in the field makes it obvious the form actually
      // reset, rather than looking identical to what was just submitted
      // (a static placeholder matching a just-typed value is exactly how
      // this looked "stuck" before).
      setNewZoneName(suggestNextZoneName(updatedZones));
      setNewZoneAhuLabel("");
    } catch (err) {
      setZoneError(err instanceof Error ? err.message : "Failed to add zone - check your connection and try again.");
    } finally {
      setZoneSaving(false);
    }
  }

  async function handleRenameZone(zoneId: string, name: string, ahuLabel: string) {
    setZoneError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("zones")
        .update({ name, ahu_label: toNullableString(ahuLabel) })
        .eq("id", zoneId)
        .select(ZONE_COLUMNS)
        .single<ZoneRow>();
      if (error) {
        setZoneError(error.message);
        return;
      }
      setZones((prev) => prev.map((zone) => (zone.id === zoneId ? data : zone)));
    } catch (err) {
      setZoneError(err instanceof Error ? err.message : "Failed to rename zone - check your connection and try again.");
    }
  }

  async function handleDeleteZone(zoneId: string) {
    const roomsInZone = rooms.filter((room) => room.zone_id === zoneId).length;
    const confirmMsg =
      roomsInZone > 0
        ? `Delete this zone? ${roomsInZone} room(s) currently assigned to it will become Unassigned, not deleted.`
        : "Delete this zone?";
    if (!window.confirm(confirmMsg)) return;
    setZoneError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("zones").delete().eq("id", zoneId);
      if (error) {
        setZoneError(error.message);
        return;
      }
      setZones((prev) => prev.filter((zone) => zone.id !== zoneId));
    } catch (err) {
      setZoneError(err instanceof Error ? err.message : "Failed to delete zone - check your connection and try again.");
      return;
    }
    // zone_id on rooms is `on delete set null` at the DB level, but the
    // client-side rooms state won't know that happened without a refetch -
    // update it locally so the UI (and the next calc) reflects it
    // immediately rather than showing a stale zone assignment. Only
    // reached on a genuine success (the catch above returns early).
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

    // Real offline field-data-entry path: a field tech editing a room
    // with no signal gets an optimistic local update immediately (rooms
    // has no server-computed columns beyond what's in payload, so
    // merging locally is a faithful preview of the real row) and the
    // write itself queues in IndexedDB (lib/offlineQueue.ts) rather than
    // being lost - synced automatically the next time the device is
    // back online (lib/useOfflineSync.ts, mounted in the dashboard layout).
    const result = await mutateOrQueue(supabase, {
      table: "rooms",
      operation: "update",
      payload,
      match: { column: "id", value: id },
    });

    if (result.error) throw new Error(result.error);

    if (result.queued) {
      setRooms((prev) =>
        prev.map((room) => (room.id === id ? ({ ...room, ...payload } as RoomRow) : room)),
      );
      setEditingRoomId(null);
      return;
    }

    const { data, error } = await supabase
      .from("rooms")
      .select(ROOM_COLUMNS)
      .eq("id", id)
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
        // Brand-new-project gate only (see ExtractableEnvelopeFields'
        // comment on attic_construction_type) - a project with any rooms
        // already isn't "nothing entered so far," so its current
        // attic_construction_type is left alone regardless of what it
        // happens to be set to. Validated against the same two values
        // ATTIC_CONSTRUCTION_OPTIONS offers in the dropdown, defensively
        // - a garbled model value should never reach the form as if it
        // were a real selectable option.
        if (
          rooms.length === 0 &&
          extractedEnvelope.attic_construction_type != null &&
          ATTIC_CONSTRUCTION_OPTIONS.some((o) => o.value === extractedEnvelope.attic_construction_type)
        ) {
          next.attic_construction_type = extractedEnvelope.attic_construction_type;
          appliedEnvelope = true;
        }
        if (appliedEnvelope) setEnvelopeSaved(false);
        return next;
      });

      let roomsCreated = 0;
      let roomsUpdated = 0;
      const unmatchedRoomNotes: string[] = [];
      let applyError: string | null = null;
      // Every room newly created by this extraction pass, across both
      // branches below - used once at the end to auto-draft a real,
      // IRC-cited local-exhaust CFM requirement (lib/localExhaust.ts) for
      // any room room_type auto-classified as Bath/Kitchen, as a
      // pending_review exhaust_sources row the tech must still confirm
      // before it counts toward the makeup-air check.
      let allCreatedRooms: RoomRow[] = [];
      if (rooms.length === 0 && extractedRooms.length > 0) {
        const supabase = createClient();
        // Rooms created from a drawing extraction default to the project's
        // first zone too, same as rooms added one at a time via
        // handleAddRoom.
        const defaultZoneId = zones.length > 0 ? zones[0].id : null;
        const payloads = extractedRooms.map((room) =>
          buildRoomInsertPayload(room, projectId, defaultZoneId, extractedEnvelope.ceiling_height_ft),
        );

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
          allCreatedRooms = data;
        }
      } else if (extractedRooms.length > 0) {
        // Project already has rooms - don't duplicate them, but extracted
        // (or human-resolved, see drawings-section.tsx's handleApply) duct
        // and wall data must still reach the actual room record, or the
        // calc keeps silently using whatever was there before (the bug
        // this branch originally fixed for ducts, now also covers
        // building-orientation-driven wall auto-population). Match by
        // exact room name (case-insensitive): the only correlation
        // available, since a drawing extraction's room array has no
        // stable index->room-id mapping (see migration
        // 20260810195313_add_field_resolutions.sql). Skip (and report,
        // rather than silently drop) a room whose name is missing,
        // ambiguous (shared by more than one existing room), or - for
        // wall data specifically, per the same "don't guess" standard -
        // whose re-extracted floor area doesn't reasonably match the
        // existing room's, since a name match alone isn't proof it's the
        // same physical room across two independent extraction passes.
        const supabase = createClient();
        const nameCounts = new Map<string, number>();
        for (const existing of rooms) {
          const key = normalizeRoomNameForMatch(existing.name);
          nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
        }

        // Small rounding differences between two independent extraction
        // passes reading the same drawing are expected and not a sign of
        // a mismatched room; anything beyond this is treated as "probably
        // not the same room" rather than trusted.
        const FLOOR_AREA_MISMATCH_TOLERANCE_SQFT = 15;

        const updatedRooms: RoomRow[] = [];
        const createdRooms: RoomRow[] = [];
        const updateErrors: string[] = [];
        for (const extractedRoom of extractedRooms) {
          const key = extractedRoom.name ? normalizeRoomNameForMatch(extractedRoom.name) : "";
          const matchCount = key ? (nameCounts.get(key) ?? 0) : 0;

          // Diagnosed 2026-08-23 against real data (Kinsela): a room this
          // pass' extraction shows that matches NO existing room by name
          // is a genuinely new room the drawing revealed - "Wet Bar" -
          // not an error case to skip. The old code below only ever
          // updated an existing room; a zero-match room fell through to
          // the ambiguous-name skip path (or, worse, was discarded with
          // no note at all whenever it also had no duct/wall/window data
          // to report missing - see hasDuctData/hasWallData/hasWindowData
          // below, which used to gate reaching that skip path in the
          // first place). Create it exactly like the initial bulk-insert
          // does, regardless of whether it also carries duct/wall/window
          // data - even a name-and-floor-area-only room is real
          // information that was being silently thrown away here.
          if (key && matchCount === 0) {
            const defaultZoneId = zones.length > 0 ? zones[0].id : null;
            const payload = buildRoomInsertPayload(
              extractedRoom,
              projectId,
              defaultZoneId,
              extractedEnvelope.ceiling_height_ft,
            );
            const { data, error } = await supabase
              .from("rooms")
              .insert(payload)
              .select(ROOM_COLUMNS)
              .single<RoomRow>();
            if (error) {
              updateErrors.push(`${extractedRoom.name || "unnamed room"} (new room): ${error.message}`);
            } else if (data) {
              createdRooms.push(data);
              roomsCreated += 1;
            }
            continue;
          }

          const rawDuctLocation = extractedRoom.duct_location?.value ?? null;
          // See the comment on the insert path above - same normalization,
          // same reason (this value can come from a free-typed Unresolved
          // override, not just the AI). Presence is judged on the raw
          // value so a room isn't skipped entirely just because its
          // location text was unmappable while its R-value is still good.
          const ductLocation = normalizeDuctLocation(rawDuctLocation);
          const ductR = extractedRoom.duct_insulation_r_value?.value ?? null;
          const hasDuctData = rawDuctLocation != null || ductR != null;
          const hasWallData =
            extractedRoom.wall_front_len_ft != null ||
            extractedRoom.wall_rear_len_ft != null ||
            extractedRoom.wall_left_len_ft != null ||
            extractedRoom.wall_right_len_ft != null;
          const hasWindowData =
            extractedRoom.window_north_area_sqft != null ||
            extractedRoom.window_south_area_sqft != null ||
            extractedRoom.window_east_area_sqft != null ||
            extractedRoom.window_west_area_sqft != null ||
            extractedRoom.window_front_area_sqft != null ||
            extractedRoom.window_rear_area_sqft != null ||
            extractedRoom.window_left_area_sqft != null ||
            extractedRoom.window_right_area_sqft != null;

          // key/matchCount already computed above (needed there to decide
          // whether this room is a new-room-create case before reaching
          // this point at all). matchCount === 0 already `continue`d, so
          // by construction this is either a real single match (1) or a
          // genuinely ambiguous/nameless one (0 with no key, or 2+).
          const target =
            key && matchCount === 1
              ? rooms.find((r) => normalizeRoomNameForMatch(r.name) === key)
              : undefined;

          // Only ever a fill-if-empty default (see the INSERT branch's
          // comment on ceiling_height_ft) - never overwrites a room's
          // already-entered value, unlike duct/wall/window above, since a
          // vaulted or dropped ceiling is exactly the kind of per-room
          // exception a tech is likely to have hand-corrected.
          const hasCeilingHeightFill =
            extractedEnvelope.ceiling_height_ft != null &&
            target != null &&
            target.ceiling_height_ft == null;

          if (!hasDuctData && !hasWallData && !hasWindowData && !hasCeilingHeightFill) continue;

          if (!key || matchCount > 1) {
            if (extractedRoom.name) {
              unmatchedRoomNotes.push(
                key
                  ? `"${extractedRoom.name}" - name matches more than one existing room, skipped (ambiguous - review manually)`
                  : `"${extractedRoom.name}" - room has no name, skipped`,
              );
            }
            continue;
          }
          if (!target) continue;

          const floorAreaMismatch =
            (hasWallData || hasWindowData) &&
            extractedRoom.floor_area_sqft != null &&
            target.floor_area_sqft != null &&
            Math.abs(extractedRoom.floor_area_sqft - target.floor_area_sqft) >
              FLOOR_AREA_MISMATCH_TOLERANCE_SQFT;
          if (floorAreaMismatch) {
            unmatchedRoomNotes.push(
              `"${target.name}" - name matched, but floor area differs (existing ${target.floor_area_sqft} sqft vs. re-extracted ${extractedRoom.floor_area_sqft} sqft) - wall/window data not applied, review manually`,
            );
          }

          // Only ever include a field group when this pass actually has
          // data for it - matches the pre-existing duct behavior (never
          // null out a room's existing duct data just because this
          // extraction pass didn't see any) and extends the same
          // invariant to wall data.
          const updatePayload: Record<string, unknown> = {};
          if (hasDuctData) {
            updatePayload.duct_location = ductLocation;
            updatePayload.duct_insulation_r_value = ductR;
            updatePayload.duct_source = extractedRoom.duct_source ?? null;
            updatePayload.duct_confidence = extractedRoom.duct_confidence ?? null;
          }
          if (hasWallData && !floorAreaMismatch) {
            updatePayload.wall_front_len_ft = extractedRoom.wall_front_len_ft;
            updatePayload.wall_rear_len_ft = extractedRoom.wall_rear_len_ft;
            updatePayload.wall_left_len_ft = extractedRoom.wall_left_len_ft;
            updatePayload.wall_right_len_ft = extractedRoom.wall_right_len_ft;
          }
          if (hasWindowData && !floorAreaMismatch) {
            updatePayload.window_north_area_sqft = extractedRoom.window_north_area_sqft;
            updatePayload.window_south_area_sqft = extractedRoom.window_south_area_sqft;
            updatePayload.window_east_area_sqft = extractedRoom.window_east_area_sqft;
            updatePayload.window_west_area_sqft = extractedRoom.window_west_area_sqft;
            updatePayload.window_front_area_sqft = extractedRoom.window_front_area_sqft;
            updatePayload.window_rear_area_sqft = extractedRoom.window_rear_area_sqft;
            updatePayload.window_left_area_sqft = extractedRoom.window_left_area_sqft;
            updatePayload.window_right_area_sqft = extractedRoom.window_right_area_sqft;
          }
          if (hasCeilingHeightFill && !floorAreaMismatch) {
            updatePayload.ceiling_height_ft = extractedEnvelope.ceiling_height_ft;
          }
          if (Object.keys(updatePayload).length === 0) continue;

          const { data, error } = await supabase
            .from("rooms")
            .update(updatePayload)
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
          applyError = `Failed to update/create ${updateErrors.length} room(s): ${updateErrors.join("; ")}`;
        }

        if (updatedRooms.length > 0 || createdRooms.length > 0) {
          setRooms((prev) => [
            ...prev.map((r) => updatedRooms.find((u) => u.id === r.id) ?? r),
            ...createdRooms,
          ]);
        }
        allCreatedRooms = createdRooms;
      }

      if (allCreatedRooms.length > 0) {
        await createDraftLocalExhaustSources(createClient(), projectId, allCreatedRooms);
      }

      requestAnimationFrame(() => {
        roomsSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });

      return { appliedEnvelope, roomsCreated, roomsUpdated, error: applyError, unmatchedRoomNotes };
    },
  }));

  return (
    <div className="space-y-6">
      <BuildingOrientationSection
        projectId={projectId}
        rooms={rooms}
        onRoomsUpdated={(updated) =>
          setRooms((prev) => prev.map((r) => updated.find((u) => u.id === r.id) ?? r))
        }
        initialBuildingFrontFaces={initialBuildingFrontFaces}
      />

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

        <div className="mt-4 flex items-start gap-2">
          <input
            id="no-vented-attic-or-crawlspace"
            type="checkbox"
            checked={envelopeForm.no_vented_attic_or_crawlspace}
            onChange={(e) => updateEnvelopeField("no_vented_attic_or_crawlspace", e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand-gold"
          />
          <label htmlFor="no-vented-attic-or-crawlspace" className="text-xs text-brand-grey-text">
            No vented attic or crawlspace available (spray-foam sealed attic + encapsulated
            crawlspace) — a non-condensing furnace has no outside-vented space to draw
            combustion air from. The install package will flag any selected furnace/package
            unit that isn&apos;t sealed-combustion/direct-vent capable.
          </label>
        </div>

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
              placeholder="e.g. Zone 2 - Upstairs AHU"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-56 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-brand-grey-text">
              AHU label (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. AHU-2"
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
        <div className="mb-6">
          <DuctRoutingCanvas
            projectId={projectId}
            rooms={rooms}
            zones={zones}
            drawings={initialDrawings}
            onRoomPositionSaved={(roomId, update) =>
              setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, ...update } : r)))
            }
            onZonePositionSaved={(zoneId, update) =>
              setZones((prev) => prev.map((z) => (z.id === zoneId ? { ...z, ...update } : z)))
            }
            onReturnPositionSaved={(zoneId, update) =>
              setZones((prev) => prev.map((z) => (z.id === zoneId ? { ...z, ...update } : z)))
            }
            onCondenserPositionSaved={(zoneId, update) =>
              setZones((prev) => prev.map((z) => (z.id === zoneId ? { ...z, ...update } : z)))
            }
          />
        </div>
      )}

      {canCalculate && results && rooms.length > 0 && zones.length > 0 && (
        <DuctDesignSection
          projectId={projectId}
          rooms={rooms}
          zones={zones}
          drawings={initialDrawings}
          roomResults={results.rooms}
          indoorCoolingDesignTempF={envelope.indoor_design_temp_cooling_f}
          initialAvailableStaticPressureIwc={initialAvailableStaticPressureIwc}
          initialSupplyAirTempF={initialSupplyAirTempF}
          initialBlowerTespIwc={initialBlowerTespIwc}
          initialEvaporatorCoilLossIwc={initialEvaporatorCoilLossIwc}
          initialAirFilterLossIwc={initialAirFilterLossIwc}
          initialGrillesRegistersLossIwc={initialGrillesRegistersLossIwc}
          initialDuctRuns={initialDuctRuns}
          initialDuctDiffusers={initialDuctDiffusers}
          initialAhuInstallationDetails={initialAhuInstallationDetails}
          initialDuctTerminations={initialDuctTerminations}
          ductSizingTable={ductSizingTable}
          ductInsulationCodeMinimums={ductInsulationCodeMinimums}
        />
      )}

      {canCalculate && results && manufacturers.length > 0 && (
        <PreferredManufacturerSection
          projectId={projectId}
          manufacturers={manufacturers}
          initialPreferredManufacturer={preferredManufacturer}
          onSaved={setPreferredManufacturer}
        />
      )}

      {canCalculate && results && zones.length > 1 && (
        <SystemConfigurationSection
          projectId={projectId}
          initialSystemConfiguration={systemConfiguration}
          onSaved={setSystemConfiguration}
        />
      )}

      {canCalculate &&
        results &&
        winterDesignTempF != null &&
        summerDesignTempF != null &&
        summerCoincidentWetbulbF != null &&
        // SUMMIT-REPORT-STANDARD.md Section 5.3 - one equipment panel per
        // AHU/zone by default, each evaluated against that zone's own
        // load. When this project is configured "single_system_zoned",
        // equipmentPanels collapses this to one combined panel evaluated
        // against every real zone's summed load instead (one physical
        // system genuinely serves all of them through zone dampers) - see
        // the equipmentPanels useMemo above for the full derivation.
        equipmentPanels.map((panel) => (
          <EquipmentSelectionSection
            key={panel.key}
            zoneIds={panel.zoneIds}
            zoneName={panel.zoneName}
            catalog={equipmentCatalog}
            performancePoints={equipmentPerformancePoints}
            manualJCoolingTotalBtuh={panel.manualJCoolingTotalBtuh}
            manualJHeatingBtuh={panel.manualJHeatingBtuh}
            summerOutdoorDesignF={summerDesignTempF}
            summerCoincidentWetbulbF={summerCoincidentWetbulbF}
            winterOutdoorDesignF={winterDesignTempF}
            initialSelectedEquipmentId={panel.initialSelectedEquipmentId}
            initialSelectedAirHandlerId={panel.initialSelectedAirHandlerId}
            initialEquipmentSelectionNotes={panel.initialEquipmentSelectionNotes}
            preferredEquipmentIds={preferredEquipmentIds}
            exclusiveEquipmentIds={exclusiveEquipmentIds}
            preferredManufacturer={preferredManufacturer}
            userRole={userRole}
          />
        ))}
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
