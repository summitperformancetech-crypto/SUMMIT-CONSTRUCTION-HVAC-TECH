// Server-only data aggregation for report generation (Phase 7). Pulls
// together everything both report templates need from a single project -
// Manual J/N load results, Manual D duct schedule, Manual S equipment
// evaluation, and the field-resolution audit trail - by calling the same
// pure calc-engine functions the UI already uses, not duplicating any
// calculation logic.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeManualJ,
  type AtticConstructionType,
  type ManualJEnvelope,
  type ManualJResult,
  type ManualJZone,
  type RoomTypeDefault,
} from "./manualJ";
import type { RoomRow } from "@/components/manual-j-workflow";
import {
  computeManualD,
  computeRequiredCfmForRooms,
  checkDuctInsulationCompliance,
  type DuctSizingResult,
  type DuctSizingTableRow,
  type DuctInsulationComplianceResult,
} from "./manualD";
import { buildCodeMinimumsByLocation } from "./constants/ductLocations";
import type { DuctRunRow } from "@/components/duct-design-section";
import {
  evaluateEquipment,
  rankEquipment,
  type EquipmentCatalogEntry,
  type EquipmentEvaluation,
  type PerformancePoint,
} from "./manualS";
import {
  computeCommercialBlockLoad,
  type CommercialOccupancyDefault,
  type CommercialZoneInput,
  type CommercialBlockLoadResult,
} from "./manualN";
import {
  computeIndustrialBuildingLoad,
  type IndustrialZoneLoadResult,
  type ProcessLoad,
} from "./manualIndustrial";
import { latestResolutions, type FieldResolution } from "./fieldResolutions";

export type ReportProject = {
  id: string;
  name: string;
  project_type: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
};

export type ReportClimateZone = {
  county: string;
  iecc_zone: string;
  winter_design_temp_f: number;
  summer_design_temp_f: number;
  summer_coincident_wetbulb_f: number;
};

export type ReportData = {
  project: ReportProject;
  climateZone: ReportClimateZone | null;
  generatedAt: string;
  // Data Integrity Addendum, Section 1: null when this ReportData was just
  // freshly computed from live tables and hasn't been written to
  // calculation_snapshots yet (the normal state for every caller of
  // getReportData() itself, since snapshotting is the report route's job,
  // not this aggregation function's - see app/api/reports/route.ts). Once
  // a project has a snapshot, route.ts loads snapshot_data (this exact
  // shape, previously stored) and fills this field in before rendering,
  // so the templates can show "data frozen as of <date>, v<n>" instead of
  // silently implying every PDF reflects live data.
  snapshot: { version: number; createdAt: string; reason: string | null } | null;
  residential: {
    envelope: ManualJEnvelope;
    manualJ: ManualJResult;
    ductSchedule: DuctSizingResult[];
    ductRuns: DuctRunRow[];
    rooms: RoomRow[];
    zones: ManualJZone[];
    equipmentEvaluations: EquipmentEvaluation[];
    selectedEquipment: EquipmentEvaluation | null;
    equipmentSelectionNotes: string | null;
    // Data Integrity Addendum, Section 3 - one entry per branch run with a
    // resolvable room/location (see checkDuctInsulationCompliance in
    // lib/manualD.ts for why trunk runs are never included).
    ductInsulationCompliance: DuctInsulationComplianceResult[];
  } | null;
  commercial: {
    blockLoad: CommercialBlockLoadResult | null;
    industrialLoad: IndustrialZoneLoadResult[] | null;
  } | null;
  fieldResolutions: FieldResolution[];
};

const ROOM_COLUMNS =
  "id, project_id, name, level, floor_area_sqft, ceiling_height_ft, ceiling_exposed, floor_exposed, is_conditioned, is_bedroom, room_type, occupant_count, sensible_gain_override, latent_gain_override, duct_location, duct_insulation_r_value, duct_source, duct_confidence, zone_id, wall_north_len_ft, wall_south_len_ft, wall_east_len_ft, wall_west_len_ft, wall_north_exposure_type, wall_south_exposure_type, wall_east_exposure_type, wall_west_exposure_type, window_north_area_sqft, window_south_area_sqft, window_east_area_sqft, window_west_area_sqft, door_count";
const ZONE_COLUMNS = "id, project_id, name, ahu_label, created_at";
const DUCT_RUN_COLUMNS =
  "id, project_id, zone_id, run_type, room_id, length_ft, fitting_equivalent_length_ft, duct_shape, target_height_in, material, cfm, friction_rate, velocity_fpm, calculated_diameter_in, calculated_width_in, calculated_height_in";
const COMMERCIAL_ZONE_COLUMNS =
  "id, project_id, name, ahu_label, occupancy_type, floor_area_sqft, ceiling_height_ft, occupant_density_per_1000sqft, lighting_load_w_per_sqft, equipment_load_w_per_sqft, exterior_wall_area_sqft, roof_area_sqft, wall_u_value, roof_u_value, window_area_sqft, window_u_value, window_shgc, cleanroom_class";
const EQUIPMENT_CATALOG_COLUMNS =
  "id, manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document";
const EQUIPMENT_PERFORMANCE_POINT_COLUMNS =
  "equipment_id, mode, outdoor_temp_f, indoor_entering_temp_f, indoor_entering_wetbulb_f, sensible_capacity_btu, total_capacity_btu, input_power_kw";
const PROCESS_LOAD_COLUMNS =
  "id, project_id, zone_id, load_type, description, sensible_btu_hr, latent_btu_hr, cfm, ach_required, source, notes";
const FIELD_RESOLUTION_COLUMNS =
  "id, project_id, table_name, record_id, field_name, ai_extracted_value, final_value, resolution_type, override_reason, resolved_by, resolved_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getReportData(supabase: SupabaseClient<any>, projectId: string): Promise<ReportData | null> {
  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, name, project_type, address_line1, address_line2, city, state, zip, wall_insulation_r_value, ceiling_insulation_r_value, floor_insulation_r_value, window_u_value, window_shgc, door_u_value, ach50, indoor_design_temp_heating_f, indoor_design_temp_cooling_f, occupants, attic_construction_type, available_static_pressure_iwc, supply_air_temp_f, selected_equipment_id, equipment_selection_notes",
    )
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return null;

  const { data: climateZoneRows } = await supabase
    .from("climate_zone_reference")
    .select("county, iecc_zone, winter_design_temp_f, summer_design_temp_f, summer_coincident_wetbulb_f")
    .eq("state", project.state)
    .limit(1)
    .returns<ReportClimateZone[]>();
  const climateZone = climateZoneRows?.[0] ?? null;

  const { data: fieldResolutions } = await supabase
    .from("field_resolutions")
    .select(FIELD_RESOLUTION_COLUMNS)
    .eq("project_id", projectId)
    .returns<FieldResolution[]>();

  // Data Integrity Addendum, Section 3 - global reference data, not
  // project-scoped (same pattern as duct_sizing_tables/equipment_catalog
  // above).
  const { data: codeMinimumRows } = await supabase
    .from("duct_insulation_code_minimums")
    .select("duct_location, min_r_value")
    .returns<{ duct_location: string; min_r_value: number }[]>();
  const codeMinimumsByLocation = buildCodeMinimumsByLocation(codeMinimumRows ?? []);

  let residential: ReportData["residential"] = null;
  let commercial: ReportData["commercial"] = null;

  if (project.project_type === "residential" && climateZone) {
    const [{ data: rooms }, { data: zones }, { data: roomTypeDefaults }, { data: ductRuns }] =
      await Promise.all([
        supabase
          .from("rooms")
          .select(ROOM_COLUMNS)
          .eq("project_id", projectId)
          .order("created_at", { ascending: true })
          .returns<RoomRow[]>(),
        supabase
          .from("zones")
          .select(ZONE_COLUMNS)
          .eq("project_id", projectId)
          .order("created_at", { ascending: true })
          .returns<ManualJZone[]>(),
        supabase
          .from("room_type_defaults")
          .select(
            "room_type, default_occupants, sensible_btu_per_person, latent_btu_per_person, appliance_sensible_btu",
          )
          .returns<RoomTypeDefault[]>(),
        supabase
          .from("duct_runs")
          .select(DUCT_RUN_COLUMNS)
          .eq("project_id", projectId)
          .order("created_at", { ascending: true })
          .returns<DuctRunRow[]>(),
      ]);

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
      attic_construction_type: project.attic_construction_type as AtticConstructionType,
    };

    const manualJ = computeManualJ(
      rooms ?? [],
      envelope,
      climateZone.winter_design_temp_f,
      climateZone.summer_design_temp_f,
      roomTypeDefaults ?? [],
      zones ?? [],
      codeMinimumsByLocation,
    );

    let ductSchedule: DuctSizingResult[] = [];
    if (ductRuns && ductRuns.length > 0 && project.available_static_pressure_iwc != null) {
      const supplyAirTempF = project.supply_air_temp_f;
      const requiredCfmByRoom = computeRequiredCfmForRooms(
        manualJ.rooms,
        supplyAirTempF,
        project.indoor_design_temp_cooling_f,
      );
      const { data: ductSizingRows } = await supabase
        .from("duct_sizing_tables")
        .select("friction_rate, diameter_in, cfm, velocity_fpm")
        .eq("duct_type", "round")
        .returns<{ friction_rate: number; diameter_in: number; cfm: number; velocity_fpm: number }[]>();
      const ductSizingTable: DuctSizingTableRow[] = (ductSizingRows ?? []).map((r) => ({
        frictionRate: r.friction_rate,
        diameterIn: r.diameter_in,
        cfm: r.cfm,
        velocityFpm: r.velocity_fpm,
      }));
      const ductRunInputs = ductRuns.map((r) => ({
        id: r.id,
        zoneId: r.zone_id,
        runType: r.run_type,
        roomId: r.room_id,
        lengthFt: r.length_ft,
        fittingEquivalentLengthFt: r.fitting_equivalent_length_ft,
        ductShape: r.duct_shape,
        targetHeightIn: r.target_height_in,
      }));
      ductSchedule = computeManualD(
        ductRunInputs,
        requiredCfmByRoom,
        project.available_static_pressure_iwc,
        ductSizingTable,
      );
    }

    let equipmentEvaluations: EquipmentEvaluation[] = [];
    if (climateZone.summer_coincident_wetbulb_f != null) {
      const [{ data: catalogRows }, { data: pointRows }] = await Promise.all([
        supabase.from("equipment_catalog").select(EQUIPMENT_CATALOG_COLUMNS).returns<
          {
            id: string;
            manufacturer: string;
            model_number: string;
            equipment_type: EquipmentCatalogEntry["equipmentType"];
            stage_type: EquipmentCatalogEntry["stageType"];
            nominal_cooling_capacity_btu: number | null;
            nominal_heating_capacity_btu: number | null;
            rated_cfm: number | null;
            source_document: string;
          }[]
        >(),
        supabase.from("equipment_performance_points").select(EQUIPMENT_PERFORMANCE_POINT_COLUMNS).returns<
          {
            equipment_id: string;
            mode: "cooling" | "heating";
            outdoor_temp_f: number;
            indoor_entering_temp_f: number;
            indoor_entering_wetbulb_f: number | null;
            sensible_capacity_btu: number;
            total_capacity_btu: number;
            input_power_kw: number;
          }[]
        >(),
      ]);
      const catalog: EquipmentCatalogEntry[] = (catalogRows ?? []).map((r) => ({
        id: r.id,
        manufacturer: r.manufacturer,
        modelNumber: r.model_number,
        equipmentType: r.equipment_type,
        stageType: r.stage_type,
        nominalCoolingCapacityBtu: r.nominal_cooling_capacity_btu,
        nominalHeatingCapacityBtu: r.nominal_heating_capacity_btu,
        ratedCfm: r.rated_cfm,
        sourceDocument: r.source_document,
      }));
      const points: PerformancePoint[] = (pointRows ?? []).map((r) => ({
        equipmentId: r.equipment_id,
        mode: r.mode,
        outdoorTempF: r.outdoor_temp_f,
        indoorEnteringTempF: r.indoor_entering_temp_f,
        indoorEnteringWetbulbF: r.indoor_entering_wetbulb_f,
        sensibleCapacityBtu: r.sensible_capacity_btu,
        totalCapacityBtu: r.total_capacity_btu,
        inputPowerKw: r.input_power_kw,
      }));
      const pointsByEquipment = new Map<string, PerformancePoint[]>();
      for (const p of points) {
        if (!pointsByEquipment.has(p.equipmentId)) pointsByEquipment.set(p.equipmentId, []);
        pointsByEquipment.get(p.equipmentId)!.push(p);
      }
      const evals = catalog.map((equipment) =>
        evaluateEquipment(
          equipment,
          pointsByEquipment.get(equipment.id) ?? [],
          manualJ.wholeHouse.coolingTotalBtuh,
          manualJ.wholeHouse.heatingBtuh,
          climateZone.summer_design_temp_f,
          climateZone.summer_coincident_wetbulb_f,
          climateZone.winter_design_temp_f,
        ),
      );
      equipmentEvaluations = rankEquipment(evals);
    }

    const selectedEquipment =
      equipmentEvaluations.find((e) => e.equipment.id === project.selected_equipment_id) ?? null;

    const roomsById = new Map(
      (rooms ?? []).map((r) => [
        r.id,
        { duct_location: r.duct_location, duct_insulation_r_value: r.duct_insulation_r_value },
      ]),
    );
    const ductInsulationCompliance = [
      ...checkDuctInsulationCompliance(
        (ductRuns ?? []).map((r) => ({
          id: r.id,
          zoneId: r.zone_id,
          runType: r.run_type,
          roomId: r.room_id,
          lengthFt: r.length_ft,
          fittingEquivalentLengthFt: r.fitting_equivalent_length_ft,
          ductShape: r.duct_shape,
          targetHeightIn: r.target_height_in,
        })),
        roomsById,
        codeMinimumsByLocation,
      ).values(),
    ];

    residential = {
      envelope,
      manualJ,
      ductSchedule,
      ductRuns: ductRuns ?? [],
      rooms: rooms ?? [],
      zones: zones ?? [],
      equipmentEvaluations,
      selectedEquipment,
      equipmentSelectionNotes: project.equipment_selection_notes,
      ductInsulationCompliance,
    };
  } else if (
    (project.project_type === "commercial" || project.project_type === "industrial") &&
    climateZone
  ) {
    const [{ data: commercialZoneRows }, { data: occupancyDefaultRows }, { data: processLoadRows }] =
      await Promise.all([
        supabase
          .from("zones")
          .select(COMMERCIAL_ZONE_COLUMNS)
          .eq("project_id", projectId)
          .order("created_at", { ascending: true })
          .returns<
            {
              id: string;
              project_id: string;
              name: string;
              ahu_label: string | null;
              occupancy_type: string | null;
              floor_area_sqft: number | null;
              ceiling_height_ft: number | null;
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
            }[]
          >(),
        supabase
          .from("commercial_occupancy_defaults")
          .select(
            "occupancy_type, default_occupant_density_per_1000sqft, default_ventilation_rp_cfm_per_person, default_ventilation_ra_cfm_per_sqft, default_lighting_w_per_sqft, default_equipment_w_per_sqft",
          )
          .returns<
            {
              occupancy_type: string;
              default_occupant_density_per_1000sqft: number | null;
              default_ventilation_rp_cfm_per_person: number | null;
              default_ventilation_ra_cfm_per_sqft: number;
              default_lighting_w_per_sqft: number;
              default_equipment_w_per_sqft: number;
            }[]
          >(),
        project.project_type === "industrial"
          ? supabase
              .from("process_loads")
              .select(PROCESS_LOAD_COLUMNS)
              .eq("project_id", projectId)
              .returns<
                {
                  id: string;
                  zone_id: string | null;
                  load_type: ProcessLoad["loadType"];
                  description: string;
                  sensible_btu_hr: number | null;
                  latent_btu_hr: number | null;
                  cfm: number | null;
                  ach_required: number | null;
                  source: ProcessLoad["source"];
                }[]
              >()
          : Promise.resolve({ data: [] }),
      ]);

    const occupancyDefaults: CommercialOccupancyDefault[] = (occupancyDefaultRows ?? []).map((r) => ({
      occupancyType: r.occupancy_type,
      defaultOccupantDensityPer1000Sqft: r.default_occupant_density_per_1000sqft,
      defaultVentilationRpCfmPerPerson: r.default_ventilation_rp_cfm_per_person,
      defaultVentilationRaCfmPerSqft: r.default_ventilation_ra_cfm_per_sqft,
      defaultLightingWPerSqft: r.default_lighting_w_per_sqft,
      defaultEquipmentWPerSqft: r.default_equipment_w_per_sqft,
    }));

    const zoneInputs: CommercialZoneInput[] = (commercialZoneRows ?? []).map((z) => ({
      id: z.id,
      name: z.name,
      occupancyType: z.occupancy_type,
      floorAreaSqft: z.floor_area_sqft,
      ceilingHeightFt: z.ceiling_height_ft,
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

    let blockLoad: CommercialBlockLoadResult | null = null;
    let industrialLoad: IndustrialZoneLoadResult[] | null = null;

    if (project.project_type === "industrial") {
      const processLoads: ProcessLoad[] = (processLoadRows ?? []).map((p) => ({
        id: p.id,
        zoneId: p.zone_id,
        loadType: p.load_type,
        description: p.description,
        sensibleBtuHr: p.sensible_btu_hr,
        latentBtuHr: p.latent_btu_hr,
        cfm: p.cfm,
        achRequired: p.ach_required,
        source: p.source,
      }));
      industrialLoad = computeIndustrialBuildingLoad(
        zoneInputs,
        occupancyDefaults,
        processLoads,
        climateZone.winter_design_temp_f,
        climateZone.summer_design_temp_f,
        project.indoor_design_temp_heating_f,
        project.indoor_design_temp_cooling_f,
      );
    } else {
      blockLoad = computeCommercialBlockLoad(
        zoneInputs,
        occupancyDefaults,
        climateZone.winter_design_temp_f,
        climateZone.summer_design_temp_f,
        project.indoor_design_temp_heating_f,
        project.indoor_design_temp_cooling_f,
      );
    }

    commercial = { blockLoad, industrialLoad };
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      project_type: project.project_type,
      address_line1: project.address_line1,
      address_line2: project.address_line2,
      city: project.city,
      state: project.state,
      zip: project.zip,
    },
    climateZone,
    generatedAt: new Date().toISOString(),
    snapshot: null,
    residential,
    commercial,
    fieldResolutions: fieldResolutions ?? [],
  };
}

export function resolvedFieldResolutionsAudit(fieldResolutions: FieldResolution[]) {
  return [...latestResolutions(fieldResolutions).values()].sort(
    (a, b) => new Date(b.resolved_at).getTime() - new Date(a.resolved_at).getTime(),
  );
}
