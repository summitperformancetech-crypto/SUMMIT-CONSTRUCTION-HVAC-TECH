// AI zoning proposal - stage 7 of the residential pipeline.
//
// FIX-PIPELINE: the technician confirms or edits this; they never build
// zoning from scratch. The heuristic is deliberately simple and fully
// disclosed (it is a *proposal*, one Accept/Override away from final):
//
//   - One zone per distinct building level in use (bottom / middle / top /
//     walkout basement). A two-story house proposes an upstairs zone and a
//     downstairs zone, each with its own air handler - the common real
//     split.
//   - A single-level house (every conditioned room on the same level, or
//     all "single_story") under ~2500 sqft of conditioned floor area
//     proposes ONE zone - one system, no damper zoning.
//   - A single-level house at or above ~2500 sqft still proposes one zone
//     by level, but is flagged in `rationale` so the technician knows a
//     manual split may be worth considering.
//
// Pure. No Supabase, no I/O. `proposeZoning` maps every conditioned room to
// a proposed zone index; the caller persists the zones and the assignment.

import type { ManualJResult } from "./manualJ";

export type ZoningRoomInput = {
  id: string;
  name: string;
  level: string;
  floor_area_sqft: number | null;
  is_conditioned: boolean;
  zone_id: string | null;
};

export type ProposedZone = {
  name: string;
  ahu_label: string | null;
};

export type ZoningProposal = {
  zones: ProposedZone[];
  // roomId -> index into `zones`. Only conditioned rooms appear.
  roomZoneMap: Record<string, number>;
  rationale: string;
};

const SINGLE_ZONE_MAX_SQFT = 2500;

const LEVEL_ORDER = ["walkout_basement", "bottom_floor", "single_story", "middle_floor", "top_floor"] as const;

const LEVEL_ZONE_NAME: Record<string, string> = {
  walkout_basement: "Basement",
  bottom_floor: "Downstairs",
  single_story: "Main",
  middle_floor: "Middle Floor",
  top_floor: "Upstairs",
};

function levelLabel(level: string): string {
  return LEVEL_ZONE_NAME[level] ?? level.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function sortLevels(levels: string[]): string[] {
  return [...levels].sort((a, b) => {
    const ia = LEVEL_ORDER.indexOf(a as (typeof LEVEL_ORDER)[number]);
    const ib = LEVEL_ORDER.indexOf(b as (typeof LEVEL_ORDER)[number]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

export function proposeZoning(
  rooms: ZoningRoomInput[],
  manualJ: ManualJResult | null = null,
): ZoningProposal {
  const conditioned = rooms.filter((r) => r.is_conditioned);
  if (conditioned.length === 0) {
    return { zones: [], roomZoneMap: {}, rationale: "No conditioned rooms to zone yet." };
  }

  const levelsInUse = sortLevels(Array.from(new Set(conditioned.map((r) => r.level || "single_story"))));
  const totalSqft = conditioned.reduce((s, r) => s + (r.floor_area_sqft ?? 0), 0);
  const totalCoolingBtuh = manualJ?.wholeHouse.coolingTotalBtuh ?? 0;
  // A very large cooling load on a single level reinforces "consider a
  // manual split" - a single air handler past ~5 tons is unusual
  // residentially. Advisory only; it never changes the zone COUNT.
  const largeSingleLevelLoad = levelsInUse.length <= 1 && totalCoolingBtuh > 60000;

  // Single-level, small house -> one zone.
  if (levelsInUse.length <= 1 && totalSqft > 0 && totalSqft < SINGLE_ZONE_MAX_SQFT) {
    const roomZoneMap: Record<string, number> = {};
    for (const r of conditioned) roomZoneMap[r.id] = 0;
    return {
      zones: [{ name: "Whole House", ahu_label: "AHU-1" }],
      roomZoneMap,
      rationale: `Single level, ${Math.round(totalSqft)} sqft conditioned - one system, no damper zoning.`,
    };
  }

  // One zone per level in use.
  const zones: ProposedZone[] = levelsInUse.map((level, idx) => ({
    name: `${levelLabel(level)}`,
    ahu_label: `AHU-${idx + 1}`,
  }));
  const levelToIndex = new Map(levelsInUse.map((level, idx) => [level, idx]));
  const roomZoneMap: Record<string, number> = {};
  for (const r of conditioned) {
    roomZoneMap[r.id] = levelToIndex.get(r.level || "single_story") ?? 0;
  }

  let rationale: string;
  if (levelsInUse.length > 1) {
    rationale = `${levelsInUse.length} building levels in use - one zone (and one air handler) per level.`;
  } else {
    rationale = `Single level, ${Math.round(totalSqft)} sqft conditioned (at or above ${SINGLE_ZONE_MAX_SQFT} sqft)${
      largeSingleLevelLoad ? ` and a ${Math.round(totalCoolingBtuh).toLocaleString()} Btuh cooling load` : ""
    } - proposed as one zone; a manual split may be worth considering.`;
  }

  return { zones, roomZoneMap, rationale };
}
