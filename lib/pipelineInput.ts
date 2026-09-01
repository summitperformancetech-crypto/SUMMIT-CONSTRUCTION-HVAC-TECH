// buildPipelineInput - assembles the plain bundle computePipelineState
// (lib/pipeline.ts) consumes, server-side, from the live tables.
//
// It leans on getReportData for the heavy derived pieces (computeManualJ,
// per-zone rankEquipment) so the pipeline's view of "is this ready" can
// never drift from what the report gate and the frozen snapshot see - that
// consistency is the whole point of having one state machine. The few
// fields getReportData doesn't return (finalized_at, climate_confirmed,
// building_front_faces, per-zone equipment_selection_source, drawing
// extraction_status, exhaust_sources review_status) are fetched alongside.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getReportData } from "./reportData";
import { FIELD_RESOLUTION_COLUMNS, type FieldResolution } from "./fieldResolutions";
import type { DrawingExtraction } from "./drawingExtraction";
import type { Compass8 } from "./constants/compass";
import type { PipelineInput } from "./pipeline";

export async function buildPipelineInput(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  projectId: string,
): Promise<PipelineInput | null> {
  const data = await getReportData(supabase, projectId);
  if (!data) return null;

  const { data: proj } = await supabase
    .from("projects")
    .select(
      "id, project_type, climate_confirmed, building_front_faces, hvac_system_configuration, finalized_at",
    )
    .eq("id", projectId)
    .maybeSingle<{
      id: string;
      project_type: string;
      climate_confirmed: boolean;
      building_front_faces: Compass8 | null;
      hvac_system_configuration: string;
      finalized_at: string | null;
    }>();
  if (!proj) return null;

  const [
    { data: drawings },
    { data: resolutions },
    { data: exhaustSources },
    { data: zoneSources },
    { data: latestSnapshot },
  ] = await Promise.all([
    supabase
      .from("drawings")
      .select("id, extraction_status, extracted_data, floor_plan_page_number")
      .eq("project_id", projectId)
      .returns<
        {
          id: string;
          extraction_status: string;
          extracted_data: DrawingExtraction | null;
          floor_plan_page_number: number | null;
        }[]
      >(),
    supabase
      .from("field_resolutions")
      .select(FIELD_RESOLUTION_COLUMNS)
      .eq("project_id", projectId)
      .returns<FieldResolution[]>(),
    supabase
      .from("exhaust_sources")
      .select("id, review_status")
      .eq("project_id", projectId)
      .returns<{ id: string; review_status: string }[]>(),
    supabase
      .from("zones")
      .select("id, equipment_selection_source")
      .eq("project_id", projectId)
      .returns<{ id: string; equipment_selection_source: string | null }[]>(),
    supabase
      .from("calculation_snapshots")
      .select("version")
      .eq("project_id", projectId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle<{ version: number }>(),
  ]);

  const res = data.residential;
  const equipSourceByZoneId = new Map(
    (zoneSources ?? []).map((z) => [z.id, z.equipment_selection_source]),
  );

  return {
    project: {
      id: proj.id,
      project_type: proj.project_type,
      climate_confirmed: proj.climate_confirmed,
      building_front_faces: proj.building_front_faces,
      hvac_system_configuration: proj.hvac_system_configuration,
      finalized_at: proj.finalized_at ?? null,
    },
    climateZone: data.climateZone
      ? {
          winter_design_temp_f: data.climateZone.winter_design_temp_f ?? null,
          summer_design_temp_f: data.climateZone.summer_design_temp_f ?? null,
          summer_coincident_wetbulb_f: data.climateZone.summer_coincident_wetbulb_f ?? null,
        }
      : null,
    rooms: (res?.rooms ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      is_conditioned: r.is_conditioned,
      floor_area_sqft: r.floor_area_sqft,
      zone_id: r.zone_id,
      position_x_norm: r.position_x_norm,
      position_y_norm: r.position_y_norm,
      wall_north_len_ft: r.wall_north_len_ft,
      wall_south_len_ft: r.wall_south_len_ft,
      wall_east_len_ft: r.wall_east_len_ft,
      wall_west_len_ft: r.wall_west_len_ft,
      window_north_area_sqft: r.window_north_area_sqft,
      window_south_area_sqft: r.window_south_area_sqft,
      window_east_area_sqft: r.window_east_area_sqft,
      window_west_area_sqft: r.window_west_area_sqft,
    })),
    zones: (res?.zones ?? []).map((z) => ({
      id: z.id,
      name: z.name,
      selected_equipment_id: z.selected_equipment_id,
      equipment_selection_source: equipSourceByZoneId.get(z.id) ?? null,
      ahu_position_x_norm: z.ahu_position_x_norm,
      ahu_position_y_norm: z.ahu_position_y_norm,
      return_position_x_norm: z.return_position_x_norm,
      return_position_y_norm: z.return_position_y_norm,
      condenser_position_x_norm: z.condenser_position_x_norm,
      condenser_position_y_norm: z.condenser_position_y_norm,
    })),
    drawings: (drawings ?? []).map((d) => ({
      id: d.id,
      extraction_status: d.extraction_status,
      extracted_data: d.extracted_data,
      floor_plan_page_number: d.floor_plan_page_number,
    })),
    fieldResolutions: resolutions ?? [],
    ductRuns: (res?.ductRuns ?? []).map((r) => ({
      id: r.id,
      run_type: r.run_type,
      room_id: r.room_id,
      zone_id: r.zone_id,
      cfm: r.cfm,
    })),
    exhaustSources: (exhaustSources ?? []).map((s) => ({ id: s.id, review_status: s.review_status })),
    zoneEquipment: (res?.zoneEquipment ?? []).map((ze) => ({
      zoneId: ze.zoneId,
      selectedEquipment: ze.selectedEquipment
        ? {
            equipmentId: ze.selectedEquipment.equipment.id,
            manufacturer: ze.selectedEquipment.equipment.manufacturer,
            modelNumber: ze.selectedEquipment.equipment.modelNumber,
            ratedCfm: ze.selectedEquipment.equipment.ratedCfm,
            coolingCapacityAtDesignBtuh:
              ze.selectedEquipment.coolingCapacityAtDesign?.totalCapacityBtu ?? null,
          }
        : null,
    })),
    manualJ: res?.manualJ ?? null,
    makeupAirRequired: data.makeupAir?.status === "flagged",
    latestSnapshotVersion: latestSnapshot?.version ?? null,
  };
}
