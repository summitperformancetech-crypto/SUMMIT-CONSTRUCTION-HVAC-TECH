export type WallExposureType = "exterior" | "adjacent_unconditioned" | "adjacent_conditioned";

export type AtticConstructionType = "sealed_conditioned" | "vented_unconditioned";

export type ManualJRoom = {
  id: string;
  name: string;
  floor_area_sqft: number | null;
  ceiling_height_ft: number | null;
  ceiling_exposed: boolean;
  floor_exposed: boolean;
  is_conditioned: boolean;
  wall_north_len_ft: number | null;
  wall_south_len_ft: number | null;
  wall_east_len_ft: number | null;
  wall_west_len_ft: number | null;
  wall_north_exposure_type: WallExposureType;
  wall_south_exposure_type: WallExposureType;
  wall_east_exposure_type: WallExposureType;
  wall_west_exposure_type: WallExposureType;
  window_north_area_sqft: number | null;
  window_south_area_sqft: number | null;
  window_east_area_sqft: number | null;
  window_west_area_sqft: number | null;
  door_count: number | null;
};

export type ManualJEnvelope = {
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
};

export type RoomLoadResult = {
  roomId: string;
  roomName: string;
  heatingBtuh: number;
  coolingSensibleBtuh: number;
  coolingLatentBtuh: number;
  coolingTotalBtuh: number;
};

export type WholeHouseLoadResult = {
  heatingBtuh: number;
  coolingSensibleBtuh: number;
  coolingLatentBtuh: number;
  coolingTotalBtuh: number;
};

export type ManualJResult = {
  rooms: RoomLoadResult[];
  wholeHouse: WholeHouseLoadResult;
};

// Standard residential door, unspecified by the room record.
const DOOR_AREA_SQFT = 20;
const APPLIANCE_LOAD_BTUH = 1200;
const OCCUPANT_SENSIBLE_BTUH_PER_PERSON = 230;
const OCCUPANT_LATENT_BTUH_PER_PERSON = 200;
const SOLAR_GAIN_BTUH_PER_SQFT = 150;
const INFILTRATION_SENSIBLE_FACTOR = 1.08;
const NATURAL_ACH_DIVISOR = 20;
const INFILTRATION_LATENT_FACTOR = 0.3;

// APPROXIMATION, not the certified ACCA Manual J 8th Edition procedure.
//
// The real Manual J 8 method for a partition adjacent to a buffer space
// (garage, unconditioned attic, etc.) computes that space's own effective
// temperature from its own heat balance - its own exterior wall/roof area,
// construction, and infiltration - which this app does not model (it would
// require treating every unconditioned space as its own mini load-calc
// zone). ACCA's actual table values for this are in the paywalled Manual J
// manual and were not available to verify here.
//
// What's implemented instead is the reduced-delta-T convention proposed for
// this feature: a partition adjacent to unconditioned space sees half the
// full indoor-to-outdoor design delta-T, rather than the full exterior
// delta-T. This is a common simplification in the HVAC industry, but it is
// a simplification - treat results across adjacent_unconditioned partitions
// and sealed-attic ceilings as approximate, and prefer a full Manual J tool
// for anything load-critical.
const BUFFER_DELTA_T_FACTOR = 0.5;

function n(value: number | null | undefined): number {
  return value ?? 0;
}

type Direction = "north" | "south" | "east" | "west";
const DIRECTIONS: Direction[] = ["north", "south", "east", "west"];

function wallLenFt(room: ManualJRoom, dir: Direction): number {
  return n(room[`wall_${dir}_len_ft` as const]);
}

function wallExposure(room: ManualJRoom, dir: Direction): WallExposureType {
  return room[`wall_${dir}_exposure_type` as const];
}

function windowAreaFt(room: ManualJRoom, dir: Direction): number {
  return n(room[`window_${dir}_area_sqft` as const]);
}

// Delta-T multiplier for a given wall/window/ceiling exposure. Full for a
// true exterior surface, zero for a partition between two conditioned
// spaces (same design temp on both sides, no net load), buffered for
// adjacent unconditioned space (see BUFFER_DELTA_T_FACTOR above).
function exposureFactor(exposure: WallExposureType): number {
  switch (exposure) {
    case "exterior":
      return 1;
    case "adjacent_unconditioned":
      return BUFFER_DELTA_T_FACTOR;
    case "adjacent_conditioned":
      return 0;
  }
}

function computeRoom(
  room: ManualJRoom,
  envelope: ManualJEnvelope,
  winterOutdoorF: number,
  summerOutdoorF: number,
): RoomLoadResult {
  const heatingDeltaT = envelope.indoor_design_temp_heating_f - winterOutdoorF;
  const coolingDeltaT = summerOutdoorF - envelope.indoor_design_temp_cooling_f;

  const totalWallLenFt = DIRECTIONS.reduce((sum, dir) => sum + wallLenFt(room, dir), 0);
  const totalDoorAreaSqft = n(room.door_count) * DOOR_AREA_SQFT;

  let envelopeHeatingBtuh = 0;
  let envelopeCoolingBtuh = 0;
  let solarGainBtuh = 0;

  // Each compass direction is its own wall + window segment with its own
  // exposure type, since a room can have (for example) an exterior wall on
  // one side and an interior partition to a conditioned room on another.
  for (const dir of DIRECTIONS) {
    const lenFt = wallLenFt(room, dir);
    const exposure = wallExposure(room, dir);
    const factor = exposureFactor(exposure);

    const grossWallAreaSqft = lenFt * n(room.ceiling_height_ft);
    const windowArea = windowAreaFt(room, dir);
    // Doors aren't tracked per-direction (the room only stores one total
    // door_count), so their area is allocated across walls in proportion to
    // each direction's share of total wall length. Same as before this
    // feature, door area is only netted out of the wall - it doesn't add
    // its own heat-loss term.
    const doorAreaShare =
      totalWallLenFt > 0 ? totalDoorAreaSqft * (lenFt / totalWallLenFt) : 0;
    const netWallAreaSqft = Math.max(grossWallAreaSqft - windowArea - doorAreaShare, 0);

    const wallUA = envelope.wall_insulation_r_value
      ? netWallAreaSqft / envelope.wall_insulation_r_value
      : 0;
    const windowUA = windowArea * n(envelope.window_u_value);

    envelopeHeatingBtuh += (wallUA + windowUA) * heatingDeltaT * factor;
    envelopeCoolingBtuh += (wallUA + windowUA) * coolingDeltaT * factor;

    // Solar gain only applies to windows actually exposed to outdoor sun -
    // a window into an unconditioned garage or another room isn't.
    if (exposure === "exterior") {
      solarGainBtuh += windowArea * n(envelope.window_shgc) * SOLAR_GAIN_BTUH_PER_SQFT;
    }
  }

  // A sealed/conditioned attic (spray foam at the roof deck) makes the attic
  // itself a semi-conditioned buffer space rather than full outdoor
  // exposure at the ceiling plane, so it gets the same buffer treatment as
  // an adjacent_unconditioned wall. A vented/unconditioned attic keeps the
  // original full-delta-T behavior.
  const atticFactor =
    envelope.attic_construction_type === "sealed_conditioned" ? BUFFER_DELTA_T_FACTOR : 1;
  const ceilingUA =
    room.ceiling_exposed && envelope.ceiling_insulation_r_value
      ? n(room.floor_area_sqft) / envelope.ceiling_insulation_r_value
      : 0;
  envelopeHeatingBtuh += ceilingUA * heatingDeltaT * atticFactor;
  envelopeCoolingBtuh += ceilingUA * coolingDeltaT * atticFactor;

  const floorUA =
    room.floor_exposed && envelope.floor_insulation_r_value
      ? n(room.floor_area_sqft) / envelope.floor_insulation_r_value
      : 0;
  envelopeHeatingBtuh += floorUA * heatingDeltaT;
  envelopeCoolingBtuh += floorUA * coolingDeltaT;

  const volumeCuft = n(room.floor_area_sqft) * n(room.ceiling_height_ft);
  const naturalAch = n(envelope.ach50) / NATURAL_ACH_DIVISOR;
  const infiltrationCfm = (naturalAch * volumeCuft) / 60;
  const infiltrationHeatingBtuh =
    INFILTRATION_SENSIBLE_FACTOR * infiltrationCfm * heatingDeltaT;
  const infiltrationCoolingSensibleBtuh =
    INFILTRATION_SENSIBLE_FACTOR * infiltrationCfm * coolingDeltaT;
  const infiltrationCoolingLatentBtuh =
    infiltrationCoolingSensibleBtuh * INFILTRATION_LATENT_FACTOR;

  const heatingBtuh = envelopeHeatingBtuh + infiltrationHeatingBtuh;
  const coolingSensibleBtuh =
    envelopeCoolingBtuh + infiltrationCoolingSensibleBtuh + solarGainBtuh;
  const coolingLatentBtuh = infiltrationCoolingLatentBtuh;

  return {
    roomId: room.id,
    roomName: room.name,
    heatingBtuh,
    coolingSensibleBtuh,
    coolingLatentBtuh,
    coolingTotalBtuh: coolingSensibleBtuh + coolingLatentBtuh,
  };
}

export function computeManualJ(
  rooms: ManualJRoom[],
  envelope: ManualJEnvelope,
  winterOutdoorF: number,
  summerOutdoorF: number,
): ManualJResult {
  // Unconditioned rooms (garages, unconditioned attics, etc.) have no HVAC
  // load target - Manual J doesn't size equipment or registers for them.
  // They stay in the Rooms list/DB as records (so other rooms' walls can
  // reference them as "adjacent unconditioned space"), but are excluded
  // here from both the per-room results and the whole-house totals.
  const conditionedRooms = rooms.filter((room) => room.is_conditioned);

  const roomResults = conditionedRooms.map((room) =>
    computeRoom(room, envelope, winterOutdoorF, summerOutdoorF),
  );

  const wholeHouse = roomResults.reduce<WholeHouseLoadResult>(
    (totals, room) => ({
      heatingBtuh: totals.heatingBtuh + room.heatingBtuh,
      coolingSensibleBtuh: totals.coolingSensibleBtuh + room.coolingSensibleBtuh,
      coolingLatentBtuh: totals.coolingLatentBtuh + room.coolingLatentBtuh,
      coolingTotalBtuh: totals.coolingTotalBtuh + room.coolingTotalBtuh,
    }),
    { heatingBtuh: 0, coolingSensibleBtuh: 0, coolingLatentBtuh: 0, coolingTotalBtuh: 0 },
  );

  // Internal gains apply once for the whole house, cooling load only.
  wholeHouse.coolingSensibleBtuh +=
    envelope.occupants * OCCUPANT_SENSIBLE_BTUH_PER_PERSON + APPLIANCE_LOAD_BTUH;
  wholeHouse.coolingLatentBtuh +=
    envelope.occupants * OCCUPANT_LATENT_BTUH_PER_PERSON;
  wholeHouse.coolingTotalBtuh =
    wholeHouse.coolingSensibleBtuh + wholeHouse.coolingLatentBtuh;

  return { rooms: roomResults, wholeHouse };
}
