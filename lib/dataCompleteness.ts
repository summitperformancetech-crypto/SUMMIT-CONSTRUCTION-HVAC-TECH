// Diagnosed 2026-08-23 comparing Summit's computed output against real
// projects (both a real ground-truth PDF and real, already-extracted-and-
// applied production data): a room with no floor area, no wall lengths, or
// no window area anywhere in the house computes to a silent zero-Btuh
// contribution in computeManualJ - indistinguishable, in the output alone,
// from a real room/house that genuinely has that little load. This module
// is a separate concern from reportValidation.ts's cross-footing checks
// (do the numbers sum correctly) - this checks whether the INPUT data was
// ever complete enough to trust in the first place.
//
// Deliberately NOT wired into any report-generation gate or UI here - only
// two of the checks below (missing floor area, missing all wall lengths)
// are unambiguous enough to assert as pure functions; per-room window-area
// absence is not (an interior closet or hallway legitimately having zero
// windows looks identical, per room, to one that just hasn't been measured
// yet - there is no room-level "confirmed windowless" signal in the schema
// today). The whole-house zero-glazing check below sidesteps that ambiguity
// by only firing when NO room in the entire house has any recorded window
// area - real houses essentially always have windows somewhere, so this has
// effectively no false-positive risk while still catching exactly the
// pattern found on both the Vivian Street fixture and a real, already-
// applied production project (Kinsela) this same session.
export type RoomGeometryInput = {
  id: string;
  name: string;
  is_conditioned: boolean;
  floor_area_sqft: number | null;
  wall_north_len_ft: number | null;
  wall_south_len_ft: number | null;
  wall_east_len_ft: number | null;
  wall_west_len_ft: number | null;
  window_north_area_sqft: number | null;
  window_south_area_sqft: number | null;
  window_east_area_sqft: number | null;
  window_west_area_sqft: number | null;
};

export type DataCompletenessWarning = {
  scope: "room" | "wholeHouse";
  roomId: string | null;
  roomName: string | null;
  reason: string;
};

export function checkDataCompleteness(rooms: RoomGeometryInput[]): DataCompletenessWarning[] {
  const warnings: DataCompletenessWarning[] = [];
  let totalConditionedFloorAreaSqft = 0;
  let totalWindowAreaSqft = 0;

  for (const room of rooms) {
    if (!room.is_conditioned) continue;

    if (room.floor_area_sqft == null) {
      warnings.push({
        scope: "room",
        roomId: room.id,
        roomName: room.name,
        reason:
          "No floor area recorded - this room is silently contributing zero load to every total, not a genuinely tiny room.",
      });
    } else {
      totalConditionedFloorAreaSqft += room.floor_area_sqft;

      const hasAnyWall = [
        room.wall_north_len_ft,
        room.wall_south_len_ft,
        room.wall_east_len_ft,
        room.wall_west_len_ft,
      ].some((v) => v != null);
      if (!hasAnyWall) {
        warnings.push({
          scope: "room",
          roomId: room.id,
          roomName: room.name,
          reason:
            "Floor area is recorded but no wall lengths are - wall, glazing, and infiltration loads for this room are computing as zero.",
        });
      }
    }

    for (const v of [
      room.window_north_area_sqft,
      room.window_south_area_sqft,
      room.window_east_area_sqft,
      room.window_west_area_sqft,
    ]) {
      if (v != null) totalWindowAreaSqft += v;
    }
  }

  if (totalConditionedFloorAreaSqft > 0 && totalWindowAreaSqft === 0) {
    warnings.push({
      scope: "wholeHouse",
      roomId: null,
      roomName: null,
      reason: `Total glazing area across all rooms is exactly zero despite ${totalConditionedFloorAreaSqft.toFixed(0)} sqft of conditioned floor area - real houses essentially always have some windows. Glazing load (often the largest single heating/cooling component) is computing as zero for the whole project.`,
    });
  }

  return warnings;
}
