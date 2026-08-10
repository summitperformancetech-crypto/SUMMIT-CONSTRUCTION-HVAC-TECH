import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectWorkspace } from "@/components/project-workspace";
import type { RoomRow } from "@/components/manual-j-workflow";
import type { AtticConstructionType, ManualJEnvelope } from "@/lib/manualJ";
import { DRAWING_COLUMNS, type DrawingRow } from "@/lib/drawingExtraction";
import { resolveCounty } from "@/lib/countyLookup";

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
  ach50: number | null;
  indoor_design_temp_heating_f: number;
  indoor_design_temp_cooling_f: number;
  occupants: number;
  attic_construction_type: AtticConstructionType;
  attic_insulation_type: string | null;
};

const ROOM_COLUMNS =
  "id, project_id, name, level, floor_area_sqft, ceiling_height_ft, ceiling_exposed, floor_exposed, is_conditioned, wall_north_len_ft, wall_south_len_ft, wall_east_len_ft, wall_west_len_ft, wall_north_exposure_type, wall_south_exposure_type, wall_east_exposure_type, wall_west_exposure_type, window_north_area_sqft, window_south_area_sqft, window_east_area_sqft, window_west_area_sqft, door_count";

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

  const { data: project, error } = await supabase
    .from("projects")
    .select(
      "id, name, project_type, address_line1, city, state, zip, climate_confirmed, wall_insulation_r_value, ceiling_insulation_r_value, floor_insulation_r_value, window_u_value, window_shgc, ach50, indoor_design_temp_heating_f, indoor_design_temp_cooling_f, occupants, attic_construction_type, attic_insulation_type",
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

  const { data: rooms } = await supabase
    .from("rooms")
    .select(ROOM_COLUMNS)
    .eq("project_id", project.id)
    .order("created_at", { ascending: true })
    .returns<RoomRow[]>();

  const { data: drawings } = await supabase
    .from("drawings")
    .select(DRAWING_COLUMNS)
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .returns<DrawingRow[]>();

  const envelope: ManualJEnvelope = {
    wall_insulation_r_value: project.wall_insulation_r_value,
    ceiling_insulation_r_value: project.ceiling_insulation_r_value,
    floor_insulation_r_value: project.floor_insulation_r_value,
    window_u_value: project.window_u_value,
    window_shgc: project.window_shgc,
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
        className="mb-6 inline-block text-sm text-zinc-400 transition hover:text-zinc-100"
      >
        ← Back to projects
      </Link>

      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-950 p-6">
        <div className="mb-4 flex items-start justify-between">
          <h1 className="text-xl font-semibold text-zinc-100">{project.name}</h1>
          <span className="rounded-full border border-amber-500/40 px-3 py-1 text-xs font-medium text-amber-500">
            {PROJECT_TYPE_LABEL[project.project_type] ?? project.project_type}
          </span>
        </div>
        <p className="text-sm text-zinc-400">
          {project.address_line1}, {project.city}, {project.state}{" "}
          {project.zip}
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-950 p-6">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
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
          <p className="text-sm text-zinc-400">
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
        initialRooms={rooms ?? []}
        initialDrawings={drawings ?? []}
        winterDesignTempF={climateZone?.winter_design_temp_f ?? null}
        summerDesignTempF={climateZone?.summer_design_temp_f ?? null}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-zinc-800 pb-2">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="text-right font-medium text-zinc-100">{value}</dd>
    </div>
  );
}
