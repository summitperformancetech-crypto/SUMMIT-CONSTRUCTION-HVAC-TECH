import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectWorkspace } from "@/components/project-workspace";
import type { RoomRow } from "@/components/manual-j-workflow";
import type {
  AtticConstructionType,
  ManualJEnvelope,
  ManualJZone,
  RoomTypeDefault,
} from "@/lib/manualJ";
import { DRAWING_COLUMNS, type DrawingRow } from "@/lib/drawingExtraction";
import type { DuctRunRow } from "@/components/duct-design-section";
import type { DuctSizingTableRow } from "@/lib/manualD";
import type { EquipmentCatalogEntry, PerformancePoint } from "@/lib/manualS";
import { resolveCounty } from "@/lib/countyLookup";
import {
  countUnresolvedFields,
  resolutionKey,
  FIELD_RESOLUTION_COLUMNS,
  type FieldResolution,
} from "@/lib/fieldResolutions";

type Project = {
  id: string;
  name: string;
  project_type: string;
  address_line1: string;
  city: string;
  state: string;
  zip: string;
  climate_confirmed: boolean;
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
  selected_equipment_id: string | null;
  equipment_selection_notes: string | null;
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

// Duplicated from equipment-selection-section.tsx rather than imported -
// same "use client" runtime-value-across-the-boundary issue documented on
// DUCT_RUN_COLUMNS above.
const EQUIPMENT_CATALOG_COLUMNS =
  "id, manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document";
const EQUIPMENT_PERFORMANCE_POINT_COLUMNS =
  "equipment_id, mode, outdoor_temp_f, indoor_entering_temp_f, indoor_entering_wetbulb_f, sensible_capacity_btu, total_capacity_btu, input_power_kw";

const ROOM_COLUMNS =
  "id, project_id, name, level, floor_area_sqft, ceiling_height_ft, ceiling_exposed, floor_exposed, is_conditioned, is_bedroom, room_type, occupant_count, sensible_gain_override, latent_gain_override, duct_location, duct_insulation_r_value, duct_source, duct_confidence, zone_id, wall_north_len_ft, wall_south_len_ft, wall_east_len_ft, wall_west_len_ft, wall_north_exposure_type, wall_south_exposure_type, wall_east_exposure_type, wall_west_exposure_type, window_north_area_sqft, window_south_area_sqft, window_east_area_sqft, window_west_area_sqft, door_count";

const ZONE_COLUMNS = "id, project_id, name, ahu_label, created_at";

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
  "id, project_id, zone_id, run_type, room_id, length_ft, fitting_equivalent_length_ft, duct_shape, target_height_in, material, cfm, friction_rate, velocity_fpm, calculated_diameter_in, calculated_width_in, calculated_height_in";

type ClimateZoneReference = {
  state: string;
  county: string;
  iecc_zone: string;
  winter_design_temp_f: number;
  summer_design_temp_f: number;
  summer_coincident_wetbulb_f: number;
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
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle<{ org_id: string }>();

  const { data: project, error } = await supabase
    .from("projects")
    .select(
      "id, name, project_type, address_line1, city, state, zip, climate_confirmed, wall_insulation_r_value, ceiling_insulation_r_value, floor_insulation_r_value, window_u_value, window_shgc, door_u_value, ach50, indoor_design_temp_heating_f, indoor_design_temp_cooling_f, occupants, attic_construction_type, attic_insulation_type, foundation_type, window_type, window_count, available_static_pressure_iwc, supply_air_temp_f, selected_equipment_id, equipment_selection_notes",
    )
    .eq("id", id)
    .maybeSingle<Project>();

  if (error || !project) {
    notFound();
  }

  const resolvedCounty = await resolveCounty({
    addressLine1: project.address_line1,
    city: project.city,
    state: project.state,
    zip: project.zip,
  });

  let climateZoneQuery = supabase
    .from("climate_zone_reference")
    .select(
      "state, county, iecc_zone, winter_design_temp_f, summer_design_temp_f, summer_coincident_wetbulb_f",
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

  // Independent of each other (and of the climate zone lookup above) - no
  // reason to wait on each round trip serially.
  const [
    { data: rooms },
    { data: drawings },
    { data: zones },
    { data: roomTypeDefaults },
    { data: fieldResolutions },
    { data: ductRuns },
    { data: ductSizingRows },
    { data: equipmentCatalogRows },
    { data: equipmentPerformancePointRows },
    { data: equipmentPreferenceRows },
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
      .returns<ManualJZone[]>(),
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

      <ProjectWorkspace
        projectId={project.id}
        initialClimateConfirmed={project.climate_confirmed}
        initialEnvelope={envelope}
        initialAtticInsulationType={project.attic_insulation_type}
        initialFoundationType={project.foundation_type}
        initialWindowType={project.window_type}
        initialWindowCount={project.window_count}
        initialRooms={rooms ?? []}
        initialDrawings={drawings ?? []}
        winterDesignTempF={climateZone?.winter_design_temp_f ?? null}
        summerDesignTempF={climateZone?.summer_design_temp_f ?? null}
        roomTypeDefaults={roomTypeDefaults ?? []}
        initialFieldResolutions={fieldResolutions ?? []}
        initialZones={zones ?? []}
        initialAvailableStaticPressureIwc={project.available_static_pressure_iwc}
        initialSupplyAirTempF={project.supply_air_temp_f}
        initialDuctRuns={ductRuns ?? []}
        ductSizingTable={ductSizingTable}
        summerCoincidentWetbulbF={climateZone?.summer_coincident_wetbulb_f ?? null}
        equipmentCatalog={equipmentCatalog}
        equipmentPerformancePoints={equipmentPerformancePoints}
        initialSelectedEquipmentId={project.selected_equipment_id}
        initialEquipmentSelectionNotes={project.equipment_selection_notes}
        preferredEquipmentIds={preferredEquipmentIds}
        exclusiveEquipmentIds={exclusiveEquipmentIds}
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
