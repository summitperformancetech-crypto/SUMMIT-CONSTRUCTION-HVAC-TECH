import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectWorkspace } from "@/components/project-workspace";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { GenerateReportsButton, type SnapshotStatus } from "@/components/generate-reports-button";
import { ReportSignOffSection, type ReportSignOffRow } from "@/components/report-sign-off-section";
import { StalenessBanner } from "@/components/staleness-banner";
import type { RoomRow, ZoneRow } from "@/components/manual-j-workflow";
import type {
  AtticConstructionType,
  ManualJEnvelope,
  RoomTypeDefault,
} from "@/lib/manualJ";
import { DRAWING_COLUMNS, type DrawingRow } from "@/lib/drawingExtraction";
import type { DuctRunRow } from "@/components/duct-design-section";
import type { DehumidificationSystemRow, DehumidificationDuctRunRow } from "@/components/dehumidification-section";
import type { DehumidifierCatalogOption } from "@/lib/dehumidification";
import type { BlowerPerformancePoint } from "@/lib/manualD";
import type { DuctDiffuserRow, AhuInstallationDetailRow, DuctTerminationRow } from "@/lib/ductRouting";
import type { DuctSizingTableRow } from "@/lib/manualD";
import type { EquipmentCatalogEntry, PerformancePoint } from "@/lib/manualS";
import { CommercialWorkflow, type CommercialZoneRow } from "@/components/commercial-workflow";
import type { CommercialOccupancyDefault } from "@/lib/manualN";
import type { HourlyTemperaturePoint } from "@/lib/manualNSimulation";
import { resolveCounty } from "@/lib/countyLookup";
import {
  countUnresolvedFields,
  resolutionKey,
  FIELD_RESOLUTION_COLUMNS,
  type FieldResolution,
} from "@/lib/fieldResolutions";
import { computeStaleItems, type StaleItem } from "@/lib/staleness";
import type { Compass8 } from "@/lib/constants/compass";
import type { HvacSystemConfiguration } from "@/components/system-configuration-section";
import type {
  ExhaustSourceRow,
  MakeupAirCatalogOption,
  ExhaustFanCatalogOption,
  ExhaustRoomLookup,
} from "@/components/makeup-air-section";
import { buildPipelineInput } from "@/lib/pipelineInput";
import { computePipelineState } from "@/lib/pipeline";

type Project = {
  id: string;
  name: string;
  project_type: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  climate_confirmed: boolean;
  created_by: string;
  // Data Integrity Addendum, Section 2 - the "project's start" marker the
  // staleness banner compares reference-table updated_at values against.
  created_at: string;
  wall_insulation_r_value: number | null;
  ceiling_insulation_r_value: number | null;
  floor_insulation_r_value: number | null;
  window_u_value: number | null;
  window_shgc: number | null;
  door_u_value: number | null;
  ach50: number | null;
  indoor_design_temp_heating_f: number;
  indoor_design_temp_cooling_f: number;
  occupants: number;
  attic_construction_type: AtticConstructionType;
  attic_insulation_type: string | null;
  foundation_type: string | null;
  window_type: string | null;
  window_count: number | null;
  available_static_pressure_iwc: number | null;
  supply_air_temp_f: number | null;
  blower_tesp_iwc: number | null;
  evaporator_coil_loss_iwc: number | null;
  air_filter_loss_iwc: number | null;
  grilles_registers_loss_iwc: number | null;
  building_front_faces: Compass8 | null;
  preferred_manufacturer: string | null;
  hvac_system_configuration: HvacSystemConfiguration;
  no_vented_attic_or_crawlspace: boolean;
  selected_makeup_air_equipment_id: string | null;
};

type DuctSizingTableDbRow = {
  friction_rate: number;
  diameter_in: number;
  cfm: number;
  velocity_fpm: number;
};

type EquipmentCatalogDbRow = {
  id: string;
  manufacturer: string;
  model_number: string;
  equipment_type: EquipmentCatalogEntry["equipmentType"];
  stage_type: EquipmentCatalogEntry["stageType"];
  nominal_cooling_capacity_btu: number | null;
  nominal_heating_capacity_btu: number | null;
  rated_cfm: number | null;
  source_document: string;
  direct_vent_capable: boolean | null;
};

type EquipmentOrgPreferenceDbRow = {
  equipment_id: string;
  is_preferred: boolean;
  is_exclusive: boolean;
};

type EquipmentPerformancePointDbRow = {
  equipment_id: string;
  mode: "cooling" | "heating";
  outdoor_temp_f: number;
  indoor_entering_temp_f: number;
  indoor_entering_wetbulb_f: number | null;
  sensible_capacity_btu: number;
  total_capacity_btu: number;
  input_power_kw: number;
};

type ExhaustSourceDbRow = {
  id: string;
  room_id: string | null;
  source_type: ExhaustSourceRow["sourceType"];
  description: string | null;
  rated_cfm: number;
  basis: ExhaustSourceRow["basis"];
  review_status: ExhaustSourceRow["reviewStatus"];
  code_citation: string | null;
  selected_equipment_id: string | null;
};

type ExhaustFanSpecDbRow = {
  equipment_id: string;
  fan_category: "bathroom" | "kitchen_range_hood" | "kitchen_downdraft" | "multi_purpose";
  min_rated_cfm: number;
  max_rated_cfm: number;
  sone_rating: number | null;
  hvi_certified: boolean;
  has_backdraft_damper: boolean;
};

type MakeupAirSpecDbRow = {
  equipment_id: string;
  category: "residential_damper" | "residential_fan_powered" | "commercial_tempered";
  duct_diameter_in: number | null;
  min_rated_cfm: number | null;
  max_rated_cfm: number | null;
  heating_fuel_type: "gas" | "electric" | "none";
  max_heating_capacity_btu: number | null;
  control_type: string;
  cooling_capable: boolean;
  min_cooling_tons: number | null;
  max_cooling_tons: number | null;
};

type EquipmentDehumidifierSpecDbRow = {
  equipment_id: string;
  rated_pints_per_day_80_60: number;
  rated_pints_per_day_73_60: number | null;
  inlet_duct_diameter_in: number | null;
  secondary_inlet_duct_diameter_in: number | null;
  outlet_duct_diameter_in: number;
  drain_connection_spec: string;
  has_backdraft_damper: boolean;
  max_design_external_static_pressure_iwc: number | null;
};

type EquipmentBlowerPerformanceDbRow = {
  equipment_id: string;
  speed_tap: string;
  esp_iwc: number;
  cfm: number;
};

type DehumidificationSystemDbRow = {
  id: string;
  name: string;
  installation_topology: DehumidificationSystemRow["installationTopology"];
  selected_equipment_id: string | null;
  available_static_pressure_iwc: number | null;
  notes: string | null;
};

type DehumidificationSystemRoomDbRow = {
  dehumidification_system_id: string;
  room_id: string;
};

// Duplicated from equipment-selection-section.tsx rather than imported -
// same "use client" runtime-value-across-the-boundary issue documented on
// DUCT_RUN_COLUMNS above.
const EQUIPMENT_CATALOG_COLUMNS =
  "id, manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document, direct_vent_capable";
const EQUIPMENT_PERFORMANCE_POINT_COLUMNS =
  "equipment_id, mode, outdoor_temp_f, indoor_entering_temp_f, indoor_entering_wetbulb_f, sensible_capacity_btu, total_capacity_btu, input_power_kw";
const EXHAUST_SOURCE_COLUMNS =
  "id, room_id, source_type, description, rated_cfm, basis, review_status, code_citation, selected_equipment_id";
const MAKEUP_AIR_SPEC_COLUMNS =
  "equipment_id, category, duct_diameter_in, min_rated_cfm, max_rated_cfm, heating_fuel_type, max_heating_capacity_btu, control_type, cooling_capable, min_cooling_tons, max_cooling_tons";
const EXHAUST_FAN_SPEC_COLUMNS =
  "equipment_id, fan_category, min_rated_cfm, max_rated_cfm, sone_rating, hvi_certified, has_backdraft_damper";
const EQUIPMENT_DEHUMIDIFIER_SPEC_COLUMNS =
  "equipment_id, rated_pints_per_day_80_60, rated_pints_per_day_73_60, inlet_duct_diameter_in, secondary_inlet_duct_diameter_in, outlet_duct_diameter_in, drain_connection_spec, has_backdraft_damper, max_design_external_static_pressure_iwc";
const EQUIPMENT_BLOWER_PERFORMANCE_COLUMNS = "equipment_id, speed_tap, esp_iwc, cfm";
// Duplicated from dehumidification-section.tsx rather than imported -
// same runtime-value-across-the-"use client"-boundary reason as every
// other *_COLUMNS constant in this file (see the DUCT_RUN_COLUMNS
// comment below).
const DEHUMIDIFICATION_SYSTEM_COLUMNS =
  "id, name, installation_topology, selected_equipment_id, available_static_pressure_iwc, notes";

const ROOM_COLUMNS =
  "id, project_id, name, level, floor_area_sqft, ceiling_height_ft, ceiling_exposed, floor_exposed, is_conditioned, is_bedroom, room_type, occupant_count, sensible_gain_override, latent_gain_override, duct_location, duct_insulation_r_value, duct_source, duct_confidence, zone_id, wall_north_len_ft, wall_south_len_ft, wall_east_len_ft, wall_west_len_ft, wall_front_len_ft, wall_rear_len_ft, wall_left_len_ft, wall_right_len_ft, wall_north_exposure_type, wall_south_exposure_type, wall_east_exposure_type, wall_west_exposure_type, window_north_area_sqft, window_south_area_sqft, window_east_area_sqft, window_west_area_sqft, door_count, position_x_norm, position_y_norm, position_source_drawing_id, position_source_page_number";

const ZONE_COLUMNS =
  "id, project_id, name, ahu_label, created_at, selected_equipment_id, selected_air_handler_equipment_id, equipment_selection_notes, ahu_position_x_norm, ahu_position_y_norm, ahu_position_source_drawing_id, ahu_position_source_page_number, return_position_x_norm, return_position_y_norm, return_position_source_drawing_id, return_position_source_page_number, corridor_graph";

// Duplicated from duct-design-section.tsx's own DUCT_RUN_COLUMNS rather
// than imported - that file is a "use client" module, and importing a
// runtime value (not just a type) from a client component into this
// server component turns it into a client-reference object instead of the
// actual string, which broke Supabase's query builder (it calls
// .split(",") on the select string internally) with a
// "(intermediate value)....split is not a function" error at request
// time. Same reason ROOM_COLUMNS/ZONE_COLUMNS above are already
// independently duplicated in manual-j-workflow.tsx rather than shared -
// `import type` across that boundary is fine (erased at compile time),
// runtime values are not.
const DUCT_RUN_COLUMNS =
  "id, project_id, zone_id, dehumidification_system_id, run_type, room_id, length_ft, fitting_equivalent_length_ft, duct_shape, target_height_in, material, cfm, friction_rate, velocity_fpm, calculated_diameter_in, calculated_width_in, calculated_height_in, total_effective_length_ft, pressure_drop_iwc, has_balancing_damper";
const DUCT_DIFFUSER_COLUMNS =
  "id, project_id, zone_id, room_id, airflow_direction, pattern_type, duct_size, round_diameter_in, cfm, mounting_height_aff_in, manufacturer, model, description, position_x_norm, position_y_norm, position_source_drawing_id, position_source_page_number, source";
const AHU_INSTALLATION_DETAIL_COLUMNS =
  "id, project_id, zone_id, plenum_size, supply_takeoff_sizes, fresh_air_duct_size, oda_termination_id, refrigerant_vapor_line_in, refrigerant_liquid_line_in, condensate_routing_note, return_platform_construction, return_platform_insulation_r, filter_backed_return_specs, damper_types";
const DUCT_TERMINATION_COLUMNS =
  "id, project_id, zone_id, termination_type, duct_size, hood_manufacturer, hood_model, screen_or_backdraft_spec, position_x_norm, position_y_norm, position_source_drawing_id, position_source_page_number";

// Duplicated from commercial-workflow.tsx rather than imported - same
// "use client" runtime-value-across-the-boundary issue documented on
// DUCT_RUN_COLUMNS above.
const COMMERCIAL_ZONE_COLUMNS =
  "id, project_id, name, ahu_label, occupancy_type, floor_area_sqft, ceiling_height_ft, occupant_density_per_1000sqft, lighting_load_w_per_sqft, equipment_load_w_per_sqft, exterior_wall_area_sqft, roof_area_sqft, wall_u_value, roof_u_value, window_area_sqft, window_u_value, window_shgc, cleanroom_class";

// Duplicated from commercial-workflow.tsx rather than imported - same
// "use client" runtime-value-across-the-boundary issue documented on
// DUCT_RUN_COLUMNS above.
const PROCESS_LOAD_COLUMNS =
  "id, project_id, zone_id, load_type, description, sensible_btu_hr, latent_btu_hr, cfm, ach_required, source, notes";

type ProcessLoadRow = {
  id: string;
  project_id: string;
  zone_id: string | null;
  load_type: "process_sensible" | "process_latent" | "makeup_air" | "exhaust" | "cleanroom_ach";
  description: string;
  sensible_btu_hr: number | null;
  latent_btu_hr: number | null;
  cfm: number | null;
  ach_required: number | null;
  source: "field_measured" | "manufacturer_spec" | "engineering_estimate";
  notes: string | null;
};

type CommercialZoneDbRow = {
  id: string;
  project_id: string;
  name: string;
  ahu_label: string | null;
  occupancy_type: string | null;
  floor_area_sqft: number | null;
  ceiling_height_ft: number | null;
  cleanroom_class: string | null;
  occupant_density_per_1000sqft: number | null;
  lighting_load_w_per_sqft: number | null;
  equipment_load_w_per_sqft: number | null;
  exterior_wall_area_sqft: number | null;
  roof_area_sqft: number | null;
  wall_u_value: number | null;
  roof_u_value: number | null;
  window_area_sqft: number | null;
  window_u_value: number | null;
  window_shgc: number | null;
};

type CommercialOccupancyDefaultDbRow = {
  occupancy_type: string;
  default_occupant_density_per_1000sqft: number | null;
  default_ventilation_rp_cfm_per_person: number | null;
  default_ventilation_ra_cfm_per_sqft: number;
  default_lighting_w_per_sqft: number;
  default_equipment_w_per_sqft: number;
};

type ClimateZoneReference = {
  state: string;
  county: string;
  iecc_zone: string;
  winter_design_temp_f: number;
  summer_design_temp_f: number;
  summer_coincident_wetbulb_f: number;
  updated_at: string;
};

const PROJECT_TYPE_LABEL: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", user.id)
    .maybeSingle<{ org_id: string; role: string }>();
  // Field Tech = data entry only (Phase 3 of the completion plan): no
  // equipment selection, no report generation/finalization. Defaults to
  // the least-privileged role if a profile row is somehow missing, rather
  // than defaulting open - the RLS policies/trigger added alongside this
  // (20260822190000_restrict_field_tech_equipment_and_reports.sql) are
  // the real enforcement boundary; this is UI-layer mirroring only.
  const userRole = profile?.role ?? "field_tech";
  // Mirrors the "Delete projects based on role" RLS policy exactly
  // (admin/estimator can delete any project in the org; a field tech
  // can only delete a project they created themselves) - UI-layer
  // mirroring only, same as userRole above; RLS is the real boundary.

  const { data: project, error } = await supabase
    .from("projects")
    .select(
      "id, name, project_type, address_line1, city, state, zip, climate_confirmed, created_by, created_at, wall_insulation_r_value, ceiling_insulation_r_value, floor_insulation_r_value, window_u_value, window_shgc, door_u_value, ach50, indoor_design_temp_heating_f, indoor_design_temp_cooling_f, occupants, attic_construction_type, attic_insulation_type, foundation_type, window_type, window_count, available_static_pressure_iwc, supply_air_temp_f, blower_tesp_iwc, evaporator_coil_loss_iwc, air_filter_loss_iwc, grilles_registers_loss_iwc, building_front_faces, preferred_manufacturer, hvac_system_configuration, no_vented_attic_or_crawlspace, selected_makeup_air_equipment_id",
    )
    .eq("id", id)
    .maybeSingle<Project>();

  if (error || !project) {
    notFound();
  }

  const canDelete =
    userRole === "admin" || userRole === "estimator" || project.created_by === user.id;

  const resolvedCounty = await resolveCounty({
    addressLine1: project.address_line1,
    city: project.city,
    state: project.state,
    zip: project.zip,
  });

  let climateZoneQuery = supabase
    .from("climate_zone_reference")
    .select(
      "state, county, iecc_zone, winter_design_temp_f, summer_design_temp_f, summer_coincident_wetbulb_f, updated_at",
    )
    .eq("state", project.state);

  // Only scope by county when we could actually resolve one — a resolved
  // county with no matching row should surface as "no data for this county"
  // rather than silently falling back to some other county's design temps.
  if (resolvedCounty) {
    climateZoneQuery = climateZoneQuery.eq("county", resolvedCounty);
  }

  const { data: climateZoneRows } = await climateZoneQuery
    .limit(1)
    .returns<ClimateZoneReference[]>();

  const climateZone = climateZoneRows?.[0] ?? null;

  // Data Integrity Addendum, Section 1 - drives both the GenerateReports-
  // Button status line and (via its presence/absence) whether the Section
  // 2 staleness banner is even relevant (a finalized project's live-table
  // changes no longer matter to its reports).
  const { data: latestSnapshotRow } = await supabase
    .from("calculation_snapshots")
    .select("version, created_at, reason")
    .eq("project_id", project.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number; created_at: string; reason: string | null }>();
  const latestSnapshot: SnapshotStatus | null = latestSnapshotRow
    ? { version: latestSnapshotRow.version, createdAt: latestSnapshotRow.created_at, reason: latestSnapshotRow.reason }
    : null;

  // Permit-Submittable Manual D Package, Section 7 - non-superseded
  // sign-offs, same "small, cheap, project-scoped" fetch as
  // latestSnapshotRow above.
  const { data: signOffRows } = await supabase
    .from("report_sign_offs")
    .select("id, calculation_snapshot_version, reviewer_name, reviewer_license_number, reviewer_license_type, signed_at")
    .eq("project_id", project.id)
    .is("superseded_at", null)
    .returns<ReportSignOffRow[]>();

  let staleItems: StaleItem[] = [];
  if (!latestSnapshot) {
    const [
      { data: equipmentCatalogLatest },
      { data: equipmentPointsLatest },
      { data: ductSizingLatest },
      { data: roomDefaultsLatest },
      { data: codeMinimumsLatest },
      { data: dismissals },
    ] = await Promise.all([
      supabase
        .from("equipment_catalog")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ updated_at: string }>(),
      supabase
        .from("equipment_performance_points")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ updated_at: string }>(),
      supabase
        .from("duct_sizing_tables")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ updated_at: string }>(),
      supabase
        .from("room_type_defaults")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ updated_at: string }>(),
      supabase
        .from("duct_insulation_code_minimums")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ updated_at: string }>(),
      supabase
        .from("staleness_banner_dismissals")
        .select("reference_table, dismissed_at")
        .eq("project_id", project.id)
        .returns<{ reference_table: string; dismissed_at: string }[]>(),
    ]);

    const equipmentLatest = [equipmentCatalogLatest?.updated_at, equipmentPointsLatest?.updated_at]
      .filter((v): v is string => v != null)
      .sort()
      .at(-1);

    staleItems = computeStaleItems(
      project.created_at,
      {
        equipment: equipmentLatest ?? null,
        duct_sizing: ductSizingLatest?.updated_at ?? null,
        climate: climateZone?.updated_at ?? null,
        room_defaults: roomDefaultsLatest?.updated_at ?? null,
        duct_insulation_code_minimums: codeMinimumsLatest?.updated_at ?? null,
      },
      dismissals ?? [],
    );
  }

  if (project.project_type === "commercial" || project.project_type === "industrial") {
    const [
      { data: commercialZones },
      { data: occupancyDefaultRows },
      { data: stationMap },
      { data: processLoadRows },
    ] = await Promise.all([
      supabase
        .from("zones")
        .select(COMMERCIAL_ZONE_COLUMNS)
        .eq("project_id", project.id)
        .order("created_at", { ascending: true })
        .returns<CommercialZoneDbRow[]>(),
      supabase
        .from("commercial_occupancy_defaults")
        .select(
          "occupancy_type, default_occupant_density_per_1000sqft, default_ventilation_rp_cfm_per_person, default_ventilation_ra_cfm_per_sqft, default_lighting_w_per_sqft, default_equipment_w_per_sqft",
        )
        .returns<CommercialOccupancyDefaultDbRow[]>(),
      resolvedCounty
        ? supabase
            .from("climate_station_county_map")
            .select("station_id, climate_stations(station_name)")
            .eq("state", project.state)
            .eq("county", resolvedCounty)
            .maybeSingle<{ station_id: string; climate_stations: { station_name: string } | null }>()
        : Promise.resolve({ data: null }),
      project.project_type === "industrial"
        ? supabase
            .from("process_loads")
            .select(PROCESS_LOAD_COLUMNS)
            .eq("project_id", project.id)
            .order("created_at", { ascending: true })
            .returns<ProcessLoadRow[]>()
        : Promise.resolve({ data: [] as ProcessLoadRow[] }),
    ]);

    let hourlyTemps: HourlyTemperaturePoint[] = [];
    if (stationMap) {
      const { data: hourlyRows } = await supabase
        .from("climate_hourly_normals")
        .select("month, day, hour, temp_f")
        .eq("station_id", stationMap.station_id)
        .returns<{ month: number; day: number; hour: number; temp_f: number }[]>();
      hourlyTemps = (hourlyRows ?? []).map((r) => ({
        month: r.month,
        day: r.day,
        hour: r.hour,
        tempF: r.temp_f,
      }));
    }

    const occupancyDefaults: CommercialOccupancyDefault[] = (occupancyDefaultRows ?? []).map((r) => ({
      occupancyType: r.occupancy_type,
      defaultOccupantDensityPer1000Sqft: r.default_occupant_density_per_1000sqft,
      defaultVentilationRpCfmPerPerson: r.default_ventilation_rp_cfm_per_person,
      defaultVentilationRaCfmPerSqft: r.default_ventilation_ra_cfm_per_sqft,
      defaultLightingWPerSqft: r.default_lighting_w_per_sqft,
      defaultEquipmentWPerSqft: r.default_equipment_w_per_sqft,
    }));

    const commercialZoneInputs: CommercialZoneRow[] = (commercialZones ?? []).map((z) => ({
      id: z.id,
      project_id: z.project_id,
      name: z.name,
      ahu_label: z.ahu_label,
      occupancyType: z.occupancy_type,
      floorAreaSqft: z.floor_area_sqft,
      ceilingHeightFt: z.ceiling_height_ft,
      cleanroomClass: z.cleanroom_class,
      occupantDensityPer1000Sqft: z.occupant_density_per_1000sqft,
      lightingLoadWPerSqft: z.lighting_load_w_per_sqft,
      equipmentLoadWPerSqft: z.equipment_load_w_per_sqft,
      exteriorWallAreaSqft: z.exterior_wall_area_sqft,
      roofAreaSqft: z.roof_area_sqft,
      wallUValue: z.wall_u_value,
      roofUValue: z.roof_u_value,
      windowAreaSqft: z.window_area_sqft,
      windowUValue: z.window_u_value,
      windowShgc: z.window_shgc,
    }));

    return (
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard"
          className="mb-6 inline-block text-sm text-brand-grey-text transition hover:text-brand-gold-hover"
        >
          ← Back to projects
        </Link>

        <div className="mb-6 rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
          <div className="mb-4 flex items-start justify-between">
            <h1 className="text-xl font-semibold text-brand-gold">{project.name}</h1>
            <div className="flex flex-col items-end gap-2">
              <span className="rounded-full border border-brand-gold-base bg-brand-gold-base/25 px-3 py-1 text-xs font-medium text-brand-gold-hover">
                {PROJECT_TYPE_LABEL[project.project_type] ?? project.project_type}
              </span>
              {canDelete && <DeleteProjectButton projectId={project.id} projectName={project.name} />}
            </div>
          </div>
          <p className="text-sm text-brand-grey-text">
            {project.address_line1}, {project.city}, {project.state} {project.zip}
          </p>
        </div>

        <div className="mb-6 rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
          <h2 className="mb-4 text-lg font-semibold text-brand-gold">Climate Zone</h2>
          {climateZone ? (
            <dl className="space-y-3 text-sm">
              <Row label="County" value={climateZone.county} />
              <Row label="IECC Zone" value={climateZone.iecc_zone} />
              <Row label="Winter Design Temp" value={`${climateZone.winter_design_temp_f}°F`} />
              <Row label="Summer Design Temp" value={`${climateZone.summer_design_temp_f}°F`} />
            </dl>
          ) : (
            <p className="text-sm text-brand-grey-text">
              {resolvedCounty
                ? `No climate data found for ${resolvedCounty} County, ${project.state} yet.`
                : `No climate data found for this state yet.`}
            </p>
          )}
        </div>

        <StalenessBanner projectId={project.id} initialStaleItems={staleItems} />
        <GenerateReportsButton projectId={project.id} initialSnapshot={latestSnapshot} userRole={userRole} />
        <ReportSignOffSection
          projectId={project.id}
          latestSnapshot={latestSnapshot}
          initialSignOffs={signOffRows ?? []}
          userRole={userRole}
        />

        <CommercialWorkflow
          projectId={project.id}
          projectType={project.project_type as "commercial" | "industrial"}
          initialZones={commercialZoneInputs}
          occupancyDefaults={occupancyDefaults}
          initialProcessLoads={processLoadRows ?? []}
          winterDesignTempF={climateZone?.winter_design_temp_f ?? null}
          summerDesignTempF={climateZone?.summer_design_temp_f ?? null}
          indoorDesignHeatingF={project.indoor_design_temp_heating_f}
          indoorDesignCoolingF={project.indoor_design_temp_cooling_f}
          hourlyTemps={hourlyTemps}
          stationName={stationMap?.climate_stations?.station_name ?? null}
        />
      </div>
    );
  }

  // Independent of each other (and of the climate zone lookup above) - no
  // reason to wait on each round trip serially.
  const [
    { data: rooms },
    { data: drawings },
    { data: zones },
    { data: roomTypeDefaults },
    { data: fieldResolutions },
    { data: ductRuns },
    { data: ductDiffusers },
    { data: ahuInstallationDetails },
    { data: ductTerminations },
    { data: ductSizingRows },
    { data: equipmentCatalogRows },
    { data: equipmentPerformancePointRows },
    { data: equipmentPreferenceRows },
    { data: ductInsulationCodeMinimumRows },
    { data: exhaustSourceRows },
    { data: makeupAirSpecRows },
    { data: exhaustFanSpecRows },
    { data: dehumidifierSpecRows },
    { data: blowerPerformanceRows },
    { data: dehumidificationSystemRows },
  ] = await Promise.all([
    supabase
      .from("rooms")
      .select(ROOM_COLUMNS)
      .eq("project_id", project.id)
      .order("created_at", { ascending: true })
      .returns<RoomRow[]>(),
    supabase
      .from("drawings")
      .select(DRAWING_COLUMNS)
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .returns<DrawingRow[]>(),
    supabase
      .from("zones")
      .select(ZONE_COLUMNS)
      .eq("project_id", project.id)
      .order("created_at", { ascending: true })
      .returns<ZoneRow[]>(),
    supabase
      .from("room_type_defaults")
      .select(
        "room_type, default_occupants, sensible_btu_per_person, latent_btu_per_person, appliance_sensible_btu",
      )
      .returns<RoomTypeDefault[]>(),
    supabase
      .from("field_resolutions")
      .select(FIELD_RESOLUTION_COLUMNS)
      .eq("project_id", project.id)
      .returns<FieldResolution[]>(),
    supabase
      .from("duct_runs")
      .select(DUCT_RUN_COLUMNS)
      .eq("project_id", project.id)
      .order("created_at", { ascending: true })
      .returns<DuctRunRow[]>(),
    supabase
      .from("duct_diffusers")
      .select(DUCT_DIFFUSER_COLUMNS)
      .eq("project_id", project.id)
      .order("created_at", { ascending: true })
      .returns<DuctDiffuserRow[]>(),
    supabase
      .from("ahu_installation_detail")
      .select(AHU_INSTALLATION_DETAIL_COLUMNS)
      .eq("project_id", project.id)
      .returns<AhuInstallationDetailRow[]>(),
    supabase
      .from("duct_terminations")
      .select(DUCT_TERMINATION_COLUMNS)
      .eq("project_id", project.id)
      .returns<DuctTerminationRow[]>(),
    // Global reference data, not project-scoped - see migration
    // 20260811014540_add_manual_d.sql for how these rows were derived.
    supabase
      .from("duct_sizing_tables")
      .select("friction_rate, diameter_in, cfm, velocity_fpm")
      .eq("duct_type", "round")
      .returns<DuctSizingTableDbRow[]>(),
    // Global reference data, not project-scoped - see migration
    // 20260811022434_add_manual_s.sql for sourcing/citations.
    supabase
      .from("equipment_catalog")
      .select(EQUIPMENT_CATALOG_COLUMNS)
      .returns<EquipmentCatalogDbRow[]>(),
    supabase
      .from("equipment_performance_points")
      .select(EQUIPMENT_PERFORMANCE_POINT_COLUMNS)
      .returns<EquipmentPerformancePointDbRow[]>(),
    // Org-scoped, unlike the two global reference queries above - RLS
    // already restricts this to the caller's own org, but scoping the
    // query explicitly avoids depending on that alone. Skipped (empty
    // array) if the user has no profile row yet.
    profile
      ? supabase
          .from("equipment_org_preferences")
          .select("equipment_id, is_preferred, is_exclusive")
          .eq("org_id", profile.org_id)
          .returns<EquipmentOrgPreferenceDbRow[]>()
      : Promise.resolve({ data: [] as EquipmentOrgPreferenceDbRow[] }),
    // Global reference data, not project-scoped - Data Integrity Addendum,
    // Section 3 (see migration 20260811222500_add_duct_insulation_code_
    // minimums.sql for sourcing/citations).
    supabase
      .from("duct_insulation_code_minimums")
      .select("duct_location, min_r_value")
      .returns<{ duct_location: string; min_r_value: number }[]>(),
    supabase
      .from("exhaust_sources")
      .select(EXHAUST_SOURCE_COLUMNS)
      .eq("project_id", project.id)
      .order("created_at", { ascending: true })
      .returns<ExhaustSourceDbRow[]>(),
    // Global reference data, not project-scoped - one row per real
    // equipment_catalog row with equipment_type = 'makeup_air_unit' (see
    // migration 20260827270000_add_makeup_air_tracking.sql).
    supabase
      .from("equipment_makeup_air_specs")
      .select(MAKEUP_AIR_SPEC_COLUMNS)
      .returns<MakeupAirSpecDbRow[]>(),
    // Global reference data, not project-scoped - one row per real
    // equipment_catalog row with equipment_type = 'exhaust_fan' (see
    // migration 20260827280000_add_local_exhaust_fan_tracking.sql).
    supabase
      .from("equipment_exhaust_fan_specs")
      .select(EXHAUST_FAN_SPEC_COLUMNS)
      .returns<ExhaustFanSpecDbRow[]>(),
    // Global reference data, not project-scoped - one row per real
    // equipment_catalog row with equipment_type = 'dehumidifier' (see
    // migration 20260827330000_add_standalone_dehumidification.sql).
    supabase
      .from("equipment_dehumidifier_specs")
      .select(EQUIPMENT_DEHUMIDIFIER_SPEC_COLUMNS)
      .returns<EquipmentDehumidifierSpecDbRow[]>(),
    // Global reference data, not project-scoped - real per-model
    // airflow-vs-ESP curves (currently: Goodman AVPTC air handlers plus
    // the Santa Fe/Aprilaire dehumidifier rows added alongside this
    // feature). Small table, fetched unfiltered same as the other global
    // reference queries above.
    supabase
      .from("equipment_blower_performance")
      .select(EQUIPMENT_BLOWER_PERFORMANCE_COLUMNS)
      .returns<EquipmentBlowerPerformanceDbRow[]>(),
    supabase
      .from("dehumidification_systems")
      .select(DEHUMIDIFICATION_SYSTEM_COLUMNS)
      .eq("project_id", project.id)
      .order("created_at", { ascending: true })
      .returns<DehumidificationSystemDbRow[]>(),
  ]);

  const preferredEquipmentIds = new Set(
    (equipmentPreferenceRows ?? []).filter((r) => r.is_preferred).map((r) => r.equipment_id),
  );
  const exclusiveEquipmentIds = new Set(
    (equipmentPreferenceRows ?? []).filter((r) => r.is_exclusive).map((r) => r.equipment_id),
  );

  const equipmentCatalog: EquipmentCatalogEntry[] = (equipmentCatalogRows ?? []).map((r) => ({
    id: r.id,
    manufacturer: r.manufacturer,
    modelNumber: r.model_number,
    equipmentType: r.equipment_type,
    stageType: r.stage_type,
    nominalCoolingCapacityBtu: r.nominal_cooling_capacity_btu,
    nominalHeatingCapacityBtu: r.nominal_heating_capacity_btu,
    ratedCfm: r.rated_cfm,
    sourceDocument: r.source_document,
    directVentCapable: r.direct_vent_capable,
  }));

  const initialExhaustSources: ExhaustSourceRow[] = (exhaustSourceRows ?? []).map((r) => ({
    id: r.id,
    roomId: r.room_id,
    sourceType: r.source_type,
    description: r.description,
    ratedCfm: r.rated_cfm,
    basis: r.basis,
    reviewStatus: r.review_status,
    codeCitation: r.code_citation,
    selectedEquipmentId: r.selected_equipment_id,
  }));

  const makeupAirSpecByEquipmentId = new Map((makeupAirSpecRows ?? []).map((r) => [r.equipment_id, r]));
  const makeupAirCatalogOptions: MakeupAirCatalogOption[] = (equipmentCatalogRows ?? [])
    .filter((r) => r.equipment_type === "makeup_air_unit")
    .map((r) => {
      const spec = makeupAirSpecByEquipmentId.get(r.id);
      return {
        equipmentId: r.id,
        manufacturer: r.manufacturer,
        modelNumber: r.model_number,
        category: spec?.category ?? "residential_damper",
        ductDiameterIn: spec?.duct_diameter_in ?? null,
        minRatedCfm: spec?.min_rated_cfm ?? null,
        maxRatedCfm: spec?.max_rated_cfm ?? null,
        controlType: spec?.control_type ?? "",
      };
    });

  const exhaustFanSpecByEquipmentId = new Map((exhaustFanSpecRows ?? []).map((r) => [r.equipment_id, r]));
  const exhaustFanCatalogOptions: ExhaustFanCatalogOption[] = (equipmentCatalogRows ?? [])
    .filter((r) => r.equipment_type === "exhaust_fan")
    .flatMap((r) => {
      const spec = exhaustFanSpecByEquipmentId.get(r.id);
      if (!spec) return [];
      return [
        {
          equipmentId: r.id,
          manufacturer: r.manufacturer,
          modelNumber: r.model_number,
          fanCategory: spec.fan_category,
          minRatedCfm: spec.min_rated_cfm,
          maxRatedCfm: spec.max_rated_cfm,
          soneRating: spec.sone_rating,
          hviCertified: spec.hvi_certified,
          hasBackdraftDamper: spec.has_backdraft_damper,
        },
      ];
    });

  const roomLookupForExhaust: ExhaustRoomLookup[] = (rooms ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    roomType: r.room_type,
  }));

  const dehumidifierSpecByEquipmentId = new Map((dehumidifierSpecRows ?? []).map((r) => [r.equipment_id, r]));
  const dehumidifierCatalogOptions: DehumidifierCatalogOption[] = (equipmentCatalogRows ?? [])
    .filter((r) => r.equipment_type === "dehumidifier")
    .flatMap((r) => {
      const spec = dehumidifierSpecByEquipmentId.get(r.id);
      if (!spec) return [];
      return [
        {
          equipmentId: r.id,
          manufacturer: r.manufacturer,
          modelNumber: r.model_number,
          ratedPintsPerDay80_60: spec.rated_pints_per_day_80_60,
          ratedPintsPerDay73_60: spec.rated_pints_per_day_73_60,
          inletDuctDiameterIn: spec.inlet_duct_diameter_in,
          secondaryInletDuctDiameterIn: spec.secondary_inlet_duct_diameter_in,
          outletDuctDiameterIn: spec.outlet_duct_diameter_in,
          drainConnectionSpec: spec.drain_connection_spec,
          hasBackdraftDamper: spec.has_backdraft_damper,
          maxDesignExternalStaticPressureIwc: spec.max_design_external_static_pressure_iwc,
        },
      ];
    });

  const dehumidifierBlowerPerformancePoints: BlowerPerformancePoint[] = (blowerPerformanceRows ?? []).map((r) => ({
    equipmentId: r.equipment_id,
    speedTap: r.speed_tap,
    espIwc: r.esp_iwc,
    cfm: r.cfm,
  }));

  // Sequential, not part of the Promise.all above - which real
  // dehumidification systems exist for this project (and therefore
  // which ids to filter dehumidification_system_rooms by) isn't known
  // until the systems themselves are fetched. Cheap in practice: a
  // project has at most a handful of standalone dehumidification
  // systems.
  const dehumidificationSystemIds = (dehumidificationSystemRows ?? []).map((r) => r.id);
  const { data: dehumidificationSystemRoomRows } =
    dehumidificationSystemIds.length > 0
      ? await supabase
          .from("dehumidification_system_rooms")
          .select("dehumidification_system_id, room_id")
          .in("dehumidification_system_id", dehumidificationSystemIds)
          .returns<DehumidificationSystemRoomDbRow[]>()
      : { data: [] as DehumidificationSystemRoomDbRow[] };

  const roomIdsBySystemId = new Map<string, string[]>();
  for (const r of dehumidificationSystemRoomRows ?? []) {
    const existing = roomIdsBySystemId.get(r.dehumidification_system_id) ?? [];
    existing.push(r.room_id);
    roomIdsBySystemId.set(r.dehumidification_system_id, existing);
  }

  const initialDehumidificationSystems: DehumidificationSystemRow[] = (dehumidificationSystemRows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    installationTopology: r.installation_topology,
    selectedEquipmentId: r.selected_equipment_id,
    availableStaticPressureIwc: r.available_static_pressure_iwc,
    notes: r.notes,
    roomIds: roomIdsBySystemId.get(r.id) ?? [],
  }));

  // duct_runs is fetched once for the whole project (DUCT_RUN_COLUMNS
  // query above) and now carries two disjoint populations distinguished
  // by exactly one of zone_id/dehumidification_system_id being set (DB
  // constraint duct_runs_exactly_one_parent) - split here so
  // DuctDesignSection keeps receiving exactly the zone-parented rows it
  // always has, and the new dehumidification-system-parented rows go to
  // DehumidificationSection instead.
  const zoneDuctRuns = (ductRuns ?? []).filter((r) => r.dehumidification_system_id == null);
  const initialDehumidificationDuctRuns: DehumidificationDuctRunRow[] = (ductRuns ?? [])
    .filter((r): r is typeof r & { dehumidification_system_id: string } => r.dehumidification_system_id != null)
    .map((r) => ({
      id: r.id,
      dehumidificationSystemId: r.dehumidification_system_id,
      runType: r.run_type as "supply" | "return",
      lengthFt: r.length_ft,
      fittingEquivalentLengthFt: r.fitting_equivalent_length_ft,
      ductShape: r.duct_shape,
      targetHeightIn: r.target_height_in,
      material: r.material,
    }));

  const equipmentPerformancePoints: PerformancePoint[] = (equipmentPerformancePointRows ?? []).map(
    (r) => ({
      equipmentId: r.equipment_id,
      mode: r.mode,
      outdoorTempF: r.outdoor_temp_f,
      indoorEnteringTempF: r.indoor_entering_temp_f,
      indoorEnteringWetbulbF: r.indoor_entering_wetbulb_f,
      sensibleCapacityBtu: r.sensible_capacity_btu,
      totalCapacityBtu: r.total_capacity_btu,
      inputPowerKw: r.input_power_kw,
    }),
  );

  const ductSizingTable: DuctSizingTableRow[] = (ductSizingRows ?? []).map((r) => ({
    frictionRate: r.friction_rate,
    diameterIn: r.diameter_in,
    cfm: r.cfm,
    velocityFpm: r.velocity_fpm,
  }));

  // Count is computed at page-load time from the same drawings data already
  // fetched above - it will reflect newly-resolved fields on next
  // navigation/reload, not instantly within an open session (no real-time
  // subscription wired for this - not asked for, and this app has no
  // finalize/export feature yet to gate in real time anyway, see below).
  const resolvedKeys = new Set(
    (fieldResolutions ?? []).map((r) => resolutionKey(r.table_name, r.record_id, r.field_name)),
  );
  const unresolvedFieldCount = countUnresolvedFields(drawings ?? [], resolvedKeys, project.id);

  const envelope: ManualJEnvelope = {
    wall_insulation_r_value: project.wall_insulation_r_value,
    ceiling_insulation_r_value: project.ceiling_insulation_r_value,
    floor_insulation_r_value: project.floor_insulation_r_value,
    window_u_value: project.window_u_value,
    window_shgc: project.window_shgc,
    door_u_value: project.door_u_value,
    ach50: project.ach50,
    indoor_design_temp_heating_f: project.indoor_design_temp_heating_f,
    indoor_design_temp_cooling_f: project.indoor_design_temp_cooling_f,
    occupants: project.occupants,
    attic_construction_type: project.attic_construction_type,
  };

  // FIX-PIPELINE: the one shared pipeline state, computed server-side and
  // handed to PipelineProvider as the first-paint value. Every stage
  // component re-fetches GET /api/projects/[id]/pipeline-state after a
  // write, so this is only the starting snapshot.
  const pipelineInput = await buildPipelineInput(supabase, project.id);
  const pipelineState = pipelineInput
    ? computePipelineState(pipelineInput)
    : computePipelineState({
        project: {
          id: project.id,
          project_type: project.project_type,
          climate_confirmed: project.climate_confirmed,
          building_front_faces: project.building_front_faces,
          hvac_system_configuration: project.hvac_system_configuration,
          finalized_at: null,
        },
        climateZone: null,
        rooms: [],
        zones: [],
        drawings: [],
        fieldResolutions: [],
        ductRuns: [],
        exhaustSources: [],
        zoneEquipment: [],
        manualJ: null,
        makeupAirRequired: false,
        latestSnapshotVersion: null,
      });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard"
        className="mb-6 inline-block text-sm text-brand-grey-text transition hover:text-brand-gold-hover"
      >
        ← Back to projects
      </Link>

      <div className="mb-6 rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
        <div className="mb-4 flex items-start justify-between">
          <h1 className="text-xl font-semibold text-brand-gold">{project.name}</h1>
          <div className="flex items-center gap-2">
            {unresolvedFieldCount > 0 && (
              <span
                className="rounded-full border border-brand-gold-base bg-brand-gold-base/25 px-3 py-1 text-xs font-medium text-brand-gold-hover"
                title="AI-extracted fields awaiting review under Drawings below. No finalize/export feature exists yet to block on this — it's visibility only for now."
              >
                {unresolvedFieldCount} field{unresolvedFieldCount === 1 ? "" : "s"} need review
              </span>
            )}
            <span className="rounded-full border border-brand-gold-base bg-brand-gold-base/25 px-3 py-1 text-xs font-medium text-brand-gold-hover">
              {PROJECT_TYPE_LABEL[project.project_type] ?? project.project_type}
            </span>
            {canDelete && <DeleteProjectButton projectId={project.id} projectName={project.name} />}
          </div>
        </div>
        <p className="text-sm text-brand-grey-text">
          {project.address_line1}, {project.city}, {project.state}{" "}
          {project.zip}
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
        <h2 className="mb-4 text-lg font-semibold text-brand-gold">
          Climate Zone
        </h2>

        {climateZone ? (
          <dl className="space-y-3 text-sm">
            <Row label="County" value={climateZone.county} />
            <Row label="IECC Zone" value={climateZone.iecc_zone} />
            <Row
              label="Winter Design Temp"
              value={`${climateZone.winter_design_temp_f}°F`}
            />
            <Row
              label="Summer Design Temp"
              value={`${climateZone.summer_design_temp_f}°F`}
            />
          </dl>
        ) : (
          <p className="text-sm text-brand-grey-text">
            {resolvedCounty
              ? `No climate data found for ${resolvedCounty} County, ${project.state} yet.`
              : `No climate data found for this state yet.`}
          </p>
        )}
      </div>

      {/* FIX-PIPELINE: StalenessBanner, GenerateReportsButton,
          ReportSignOffSection and MakeupAirSection are no longer rendered
          standalone here - they live inside the guided stepper's
          Ventilation and Finalize stages so they gate in order like every
          other section. */}

      <ProjectWorkspace
        projectId={project.id}
        initialPipelineState={pipelineState}
        initialExhaustSources={initialExhaustSources}
        makeupAirCatalogOptions={makeupAirCatalogOptions}
        initialSelectedMakeupAirEquipmentId={project.selected_makeup_air_equipment_id}
        exhaustFanCatalogOptions={exhaustFanCatalogOptions}
        exhaustRoomLookup={roomLookupForExhaust}
        initialSnapshot={latestSnapshot}
        initialSignOffs={signOffRows ?? []}
        initialStaleItems={staleItems}
        initialClimateConfirmed={project.climate_confirmed}
        initialEnvelope={envelope}
        initialAtticInsulationType={project.attic_insulation_type}
        initialFoundationType={project.foundation_type}
        initialWindowType={project.window_type}
        initialWindowCount={project.window_count}
        initialNoVentedAtticOrCrawlspace={project.no_vented_attic_or_crawlspace}
        initialRooms={rooms ?? []}
        initialDrawings={drawings ?? []}
        winterDesignTempF={climateZone?.winter_design_temp_f ?? null}
        summerDesignTempF={climateZone?.summer_design_temp_f ?? null}
        roomTypeDefaults={roomTypeDefaults ?? []}
        initialFieldResolutions={fieldResolutions ?? []}
        initialZones={zones ?? []}
        initialAvailableStaticPressureIwc={project.available_static_pressure_iwc}
        initialSupplyAirTempF={project.supply_air_temp_f}
        initialBlowerTespIwc={project.blower_tesp_iwc}
        initialEvaporatorCoilLossIwc={project.evaporator_coil_loss_iwc}
        initialAirFilterLossIwc={project.air_filter_loss_iwc}
        initialGrillesRegistersLossIwc={project.grilles_registers_loss_iwc}
        initialDuctRuns={zoneDuctRuns}
        initialDuctDiffusers={ductDiffusers ?? []}
        initialAhuInstallationDetails={ahuInstallationDetails ?? []}
        initialDuctTerminations={ductTerminations ?? []}
        ductSizingTable={ductSizingTable}
        summerCoincidentWetbulbF={climateZone?.summer_coincident_wetbulb_f ?? null}
        equipmentCatalog={equipmentCatalog}
        equipmentPerformancePoints={equipmentPerformancePoints}
        preferredEquipmentIds={preferredEquipmentIds}
        exclusiveEquipmentIds={exclusiveEquipmentIds}
        ductInsulationCodeMinimums={ductInsulationCodeMinimumRows ?? []}
        initialBuildingFrontFaces={project.building_front_faces}
        initialPreferredManufacturer={project.preferred_manufacturer}
        initialSystemConfiguration={project.hvac_system_configuration}
        userRole={userRole}
        initialDehumidificationSystems={initialDehumidificationSystems}
        initialDehumidificationDuctRuns={initialDehumidificationDuctRuns}
        dehumidifierCatalogOptions={dehumidifierCatalogOptions}
        dehumidifierBlowerPerformancePoints={dehumidifierBlowerPerformancePoints}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-brand-gold/50 pb-2">
      <dt className="text-brand-grey-text">{label}</dt>
      <dd className="text-right font-medium text-brand-silver-highlight">{value}</dd>
    </div>
  );
}
