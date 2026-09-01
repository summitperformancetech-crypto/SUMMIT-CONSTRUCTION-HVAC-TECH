import type { SupabaseClient } from "@supabase/supabase-js";
import { COMPASS_8_VALUES, isCardinalCompass, type Compass8 } from "./constants/compass";
import { roomHasUnresolvedWallOrientation } from "./fieldResolutions";
import type { DrawingExtraction } from "./drawingExtraction";

// Convention (must match EXTRACTION_PROMPT in lib/drawingExtraction.ts and
// every UI label exactly, or a tech reading one and the model reading the
// other will silently disagree about which wall is "left"): "left" and
// "right" are the tech's own left and right hand while STANDING OUTSIDE,
// FACING THE FRONT ENTRY (i.e. facing the building, about to walk in) -
// not the occupant's left/right while exiting.
//
// Derivation (worked once here so the formula below isn't "trust me"):
// if the building's front faces compass bearing F (the front facade's
// outward normal - "front faces West" means the door looks out toward
// the West), a person standing outside and facing the entry is facing
// the OPPOSITE bearing, F+180 (they're looking back toward the house,
// which is the same bearing as the rear of the house from the front).
// Standard navigation convention: turning to your left from facing
// bearing T points you toward T-90; turning right points you toward
// T+90. Substituting T = F+180:
//   left  = (F+180) - 90 = F + 90
//   right = (F+180) + 90 = F + 270  (equivalently F - 90)
//   rear  = F + 180
// Verified against the concrete case this feature was built for: front
// faces West (270 deg) -> rear = East (90 deg), left = North (0 deg),
// right = South (180 deg) - then independently spot-checked against 5+
// real rooms on the actual Kinsela drawing pages before trusting it
// project-wide (see the commit this file was introduced in for that
// verification).
const COMPASS_STEP_DEGREES = 45;
const STEPS_PER_90_DEGREES = 90 / COMPASS_STEP_DEGREES; // = 2
const STEPS_PER_180_DEGREES = 180 / COMPASS_STEP_DEGREES; // = 4

function rotate(from: Compass8, steps: number): Compass8 {
  const index = COMPASS_8_VALUES.indexOf(from);
  const rotatedIndex = (index + steps + COMPASS_8_VALUES.length * 100) % COMPASS_8_VALUES.length;
  return COMPASS_8_VALUES[rotatedIndex];
}

export type ResolvedOrientation = {
  front: Compass8;
  rear: Compass8;
  left: Compass8;
  right: Compass8;
};

export function resolveOrientation(buildingFrontFaces: Compass8): ResolvedOrientation {
  return {
    front: buildingFrontFaces,
    rear: rotate(buildingFrontFaces, STEPS_PER_180_DEGREES),
    left: rotate(buildingFrontFaces, STEPS_PER_90_DEGREES),
    right: rotate(buildingFrontFaces, -STEPS_PER_90_DEGREES),
  };
}

// A cardinal front (N/E/S/W) always rotates to 3 other cardinal points
// (90/180 degrees is an even number of 45-degree steps, so cardinal stays
// cardinal and intercardinal stays intercardinal - they never mix). Only
// a cardinal-front selection can be written to the room schema, since
// wallLenFt/wallExposure in lib/manualJ.ts (and the rooms.wall_north/
// south/east/west_len_ft columns they read) only support the 4 cardinal
// directions - a pre-existing constraint of the Manual J solar-gain
// model. An intercardinal front (NE/SE/SW/NW) is offered in the UI
// because real buildings do face those directions, but resolves to
// directions this schema has no column for - callers must check this
// before attempting to apply the transform, and surface a clear message
// rather than silently rounding (which would misattribute a wall's
// solar-gain direction).
export function isTransformApplicable(buildingFrontFaces: Compass8): boolean {
  return isCardinalCompass(buildingFrontFaces);
}

export type DrawingRelativeWalls = {
  wall_front_len_ft: number | null;
  wall_rear_len_ft: number | null;
  wall_left_len_ft: number | null;
  wall_right_len_ft: number | null;
};

export type CardinalWalls = {
  wall_north_len_ft: number | null;
  wall_south_len_ft: number | null;
  wall_east_len_ft: number | null;
  wall_west_len_ft: number | null;
};

const CARDINAL_FIELD_BY_DIRECTION: Record<"N" | "E" | "S" | "W", keyof CardinalWalls> = {
  N: "wall_north_len_ft",
  E: "wall_east_len_ft",
  S: "wall_south_len_ft",
  W: "wall_west_len_ft",
};

// Maps one room's drawing-relative lengths onto the 4 cardinal fields
// Manual J actually reads, given an already-resolved (cardinal-only)
// orientation. Only overwrites a cardinal field when the room actually
// has data for the corresponding drawing-relative side - a room with,
// say, no wall_right_len_ft (never captured, or this room has no
// exterior wall on that side) leaves the target cardinal field
// untouched rather than writing null over something a tech may have
// already entered by hand.
export function applyOrientationToRoom(
  walls: DrawingRelativeWalls,
  orientation: { front: "N" | "E" | "S" | "W"; rear: "N" | "E" | "S" | "W"; left: "N" | "E" | "S" | "W"; right: "N" | "E" | "S" | "W" },
): Partial<CardinalWalls> {
  const result: Partial<CardinalWalls> = {};
  const pairs: [number | null, "N" | "E" | "S" | "W"][] = [
    [walls.wall_front_len_ft, orientation.front],
    [walls.wall_rear_len_ft, orientation.rear],
    [walls.wall_left_len_ft, orientation.left],
    [walls.wall_right_len_ft, orientation.right],
  ];
  for (const [value, direction] of pairs) {
    if (value == null) continue;
    result[CARDINAL_FIELD_BY_DIRECTION[direction]] = value;
  }
  return result;
}

// FIX-PIPELINE: the one place the drawing-relative -> compass wall
// rotation runs. Previously this lived inside
// components/building-orientation-section.tsx's "Save & Auto-Fill Walls"
// button handler - a second orientation surface the technician had to
// find and click. It is now called automatically:
//   - by the Rooms & Envelope stage's auto-apply, right after rooms are
//     created from the extraction and their wall-orientation UNRESOLVED
//     flags are cleared, and
//   - again whenever a wall-orientation field_resolution is added in
//     Field Review.
// No button. `building_front_faces` itself is written in exactly one
// place by a human (the stage-3 orientation gate) - this function only
// reads it and rotates room walls.
//
// A room whose extraction still has an unresolved wall-orientation flag
// (see roomHasUnresolvedWallOrientation) is left untouched and its name
// returned in `blockedRoomNames` - its front/rear/left/right data must
// not be trusted into the compass fields until a human confirms the
// front-entry guess. An intercardinal `buildingFrontFaces` returns
// `applicable: false` and changes nothing (the room schema has no column
// for a NE/SE/SW/NW wall - see isTransformApplicable).
export type OrientationTransformRoom = DrawingRelativeWalls & { id: string; name: string };

export type OrientationTransformResult<T> = {
  applicable: boolean;
  updated: T[];
  blockedRoomNames: string[];
  skippedNoData: number;
  errors: string[];
};

export async function applyOrientationTransform<T = Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  projectId: string,
  rooms: OrientationTransformRoom[],
  buildingFrontFaces: Compass8 | null,
  resolvedKeys: ReadonlySet<string>,
  roomSelectColumns = "*",
): Promise<OrientationTransformResult<T>> {
  if (!buildingFrontFaces || !isTransformApplicable(buildingFrontFaces)) {
    return { applicable: false, updated: [], blockedRoomNames: [], skippedNoData: 0, errors: [] };
  }

  const orientation = resolveOrientation(buildingFrontFaces) as {
    front: "N" | "E" | "S" | "W";
    rear: "N" | "E" | "S" | "W";
    left: "N" | "E" | "S" | "W";
    right: "N" | "E" | "S" | "W";
  };

  const { data: drawingsData } = await supabase
    .from("drawings")
    .select("id, extraction_status, extracted_data")
    .eq("project_id", projectId)
    .returns<{ id: string; extraction_status: string; extracted_data: DrawingExtraction | null }[]>();
  const drawings = drawingsData ?? [];

  const updated: T[] = [];
  const blockedRoomNames: string[] = [];
  const errors: string[] = [];
  let skippedNoData = 0;

  for (const room of rooms) {
    if (roomHasUnresolvedWallOrientation(room.name, drawings, resolvedKeys as Set<string>)) {
      blockedRoomNames.push(room.name);
      continue;
    }
    const cardinalUpdate = applyOrientationToRoom(room, orientation);
    if (Object.keys(cardinalUpdate).length === 0) {
      if (
        room.wall_front_len_ft != null ||
        room.wall_rear_len_ft != null ||
        room.wall_left_len_ft != null ||
        room.wall_right_len_ft != null
      ) {
        skippedNoData += 1;
      }
      continue;
    }
    const { data, error } = await supabase
      .from("rooms")
      .update(cardinalUpdate)
      .eq("id", room.id)
      .select(roomSelectColumns)
      .single();
    if (error) errors.push(`${room.name}: ${error.message}`);
    else if (data) updated.push(data as T);
  }

  return { applicable: true, updated, blockedRoomNames, skippedNoData, errors };
}
