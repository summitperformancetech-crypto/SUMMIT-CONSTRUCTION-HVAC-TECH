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
  // ASHRAE 62.2 Nbr term - see ASHRAE_622_BEDROOM_FACTOR below. Summed
  // across the whole house (not per-room) until Phase 5 zones exist.
  is_bedroom: boolean;
  // Internal gains (Section 1 gap-closure spec). room_type is distinct
  // from is_bedroom above - a room typed 'Bedroom' does not automatically
  // set is_bedroom, they're tracked independently (see migration
  // 20260810193033_add_internal_gains_room_type.sql). occupant_count
  // overrides room_type_defaults.default_occupants when set; the two gain
  // overrides bypass the room_type/occupant calculation entirely.
  room_type: string | null;
  occupant_count: number | null;
  sensible_gain_override: number | null;
  latent_gain_override: number | null;
};

export type RoomTypeDefault = {
  room_type: string;
  default_occupants: number;
  sensible_btu_per_person: number;
  latent_btu_per_person: number;
  appliance_sensible_btu: number;
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
  // No longer used by computeManualJ as of the Section 1 internal-gains
  // rework - internal gains are now a real per-room line item (occupant
  // count + room_type defaults on ManualJRoom), not a flat whole-house
  // occupants*230+1200 number. Field/column kept for backward
  // compatibility with existing saved projects; the UI flags it as unused.
  occupants: number;
  attic_construction_type: AtticConstructionType;
  // Project-level uniform assumption, same pattern as window_u_value. The
  // projects.door_u_value column is `not null default 0.35`, so this is
  // always a real number once read from the DB - see DOOR_U_VALUE_DEFAULT
  // below for why 0.35 was chosen, and n() for the defensive fallback if a
  // caller passes an envelope built by hand without it set.
  door_u_value: number | null;
};

export type RoomLoadResult = {
  roomId: string;
  roomName: string;
  heatingBtuh: number;
  coolingSensibleBtuh: number;
  coolingLatentBtuh: number;
  coolingTotalBtuh: number;
  // Doors' own share of heatingBtuh/coolingSensibleBtuh, broken out for
  // reporting. Already included in the totals above, not additional on top.
  doorHeatingBtuh: number;
  doorCoolingBtuh: number;
  // Internal gains (occupants + appliances), cooling-only, already included
  // in coolingSensibleBtuh/coolingLatentBtuh above.
  internalGainsSensibleBtuh: number;
  internalGainsLatentBtuh: number;
};

export type WholeHouseLoadResult = {
  heatingBtuh: number;
  coolingSensibleBtuh: number;
  coolingLatentBtuh: number;
  coolingTotalBtuh: number;
  doorHeatingBtuh: number;
  doorCoolingBtuh: number;
  // ASHRAE 62.2 mechanical ventilation, whole-house only (see
  // ASHRAE_622_AREA_FACTOR/ASHRAE_622_BEDROOM_FACTOR). Already included in
  // heatingBtuh/coolingSensibleBtuh/coolingLatentBtuh above, broken out here
  // for reporting the same way doors are.
  ventilationCfm: number;
  ventilationHeatingBtuh: number;
  ventilationCoolingSensibleBtuh: number;
  ventilationCoolingLatentBtuh: number;
  internalGainsSensibleBtuh: number;
  internalGainsLatentBtuh: number;
};

export type ManualJResult = {
  rooms: RoomLoadResult[];
  wholeHouse: WholeHouseLoadResult;
};

// Standard residential door, unspecified by the room record.
const DOOR_AREA_SQFT = 20;
// Fallback only for envelopes built by hand without door_u_value set (the DB
// column itself is `not null default 0.35`, so real project reads always
// have a value). Within the 0.20-0.40 "typical insulated door" range; see
// migration 20260810141452_add_door_u_value.sql for the reference-report
// derivation of ~0.385.
const DOOR_U_VALUE_DEFAULT = 0.35;
const SOLAR_GAIN_BTUH_PER_SQFT = 150;
const INFILTRATION_SENSIBLE_FACTOR = 1.08;
const NATURAL_ACH_DIVISOR = 20;
const INFILTRATION_LATENT_FACTOR = 0.3;

// ASHRAE 62.2 total mechanical ventilation rate: Qtot = 0.03*Afloor +
// 7.5*(Nbr+1), the widely-published core formula (Afloor in conditioned
// sqft, Nbr = bedroom count). Deliberately NOT the full standard: real
// ASHRAE 62.2 also allows an "infiltration credit" that reduces required
// mechanical CFM based on the home's measured/estimated natural
// infiltration, weather factor, and normalized leakage - that credit
// differs across 62.2 editions (2010/2013/2016/2019) and needs inputs this
// app does not model. What's implemented is the uncredited Qtot, i.e. a
// conservative (higher-than-necessary) ventilation CFM - see migration
// 20260810190611_add_is_bedroom.sql.
const ASHRAE_622_AREA_FACTOR = 0.03;
const ASHRAE_622_BEDROOM_FACTOR = 7.5;

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

// room_type is a free-typed nullable text column (see migration
// 20260810193033) - an unrecognized or unset room_type intentionally
// yields undefined here, which computeRoom treats as 0 internal gains
// (explicit "not yet classified" state) rather than guessing a default.
function findRoomTypeDefault(
  roomType: string | null,
  roomTypeDefaults: RoomTypeDefault[],
): RoomTypeDefault | undefined {
  if (!roomType) return undefined;
  return roomTypeDefaults.find((d) => d.room_type === roomType);
}

// sensible_gain_override and latent_gain_override are independent - one can
// be set without the other, in which case the unset side still falls back
// to the room_type/occupant_count calculation rather than becoming 0.
function computeInternalGains(
  room: ManualJRoom,
  roomTypeDefaults: RoomTypeDefault[],
): { sensibleBtuh: number; latentBtuh: number } {
  const typeDefault = findRoomTypeDefault(room.room_type, roomTypeDefaults);
  const occupants = room.occupant_count ?? typeDefault?.default_occupants ?? 0;

  const sensibleBtuh =
    room.sensible_gain_override != null
      ? room.sensible_gain_override
      : typeDefault
        ? occupants * typeDefault.sensible_btu_per_person + typeDefault.appliance_sensible_btu
        : 0;

  const latentBtuh =
    room.latent_gain_override != null
      ? room.latent_gain_override
      : typeDefault
        ? occupants * typeDefault.latent_btu_per_person
        : 0;

  return { sensibleBtuh, latentBtuh };
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
  roomTypeDefaults: RoomTypeDefault[],
): RoomLoadResult {
  const heatingDeltaT = envelope.indoor_design_temp_heating_f - winterOutdoorF;
  const coolingDeltaT = summerOutdoorF - envelope.indoor_design_temp_cooling_f;

  const totalWallLenFt = DIRECTIONS.reduce((sum, dir) => sum + wallLenFt(room, dir), 0);
  const totalDoorAreaSqft = n(room.door_count) * DOOR_AREA_SQFT;
  const doorUValue = envelope.door_u_value ?? DOOR_U_VALUE_DEFAULT;

  let envelopeHeatingBtuh = 0;
  let envelopeCoolingBtuh = 0;
  let solarGainBtuh = 0;
  let doorHeatingBtuh = 0;
  let doorCoolingBtuh = 0;

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
    // each direction's share of total wall length. Still netted out of the
    // wall area below (a door isn't wall), but now also gets its own U x A x
    // delta-T term - see doorUA - using that same direction's exposure
    // factor, instead of silently disappearing into the wall calculation.
    const doorAreaShare =
      totalWallLenFt > 0 ? totalDoorAreaSqft * (lenFt / totalWallLenFt) : 0;
    const netWallAreaSqft = Math.max(grossWallAreaSqft - windowArea - doorAreaShare, 0);

    const wallUA = envelope.wall_insulation_r_value
      ? netWallAreaSqft / envelope.wall_insulation_r_value
      : 0;
    const windowUA = windowArea * n(envelope.window_u_value);
    const doorUA = doorAreaShare * doorUValue;

    envelopeHeatingBtuh += (wallUA + windowUA) * heatingDeltaT * factor;
    envelopeCoolingBtuh += (wallUA + windowUA) * coolingDeltaT * factor;

    const doorHeatingForDir = doorUA * heatingDeltaT * factor;
    const doorCoolingForDir = doorUA * coolingDeltaT * factor;
    doorHeatingBtuh += doorHeatingForDir;
    doorCoolingBtuh += doorCoolingForDir;
    envelopeHeatingBtuh += doorHeatingForDir;
    envelopeCoolingBtuh += doorCoolingForDir;

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

  // Internal gains (Section 1 gap-closure spec): a real per-room additive
  // line item, cooling load only - same convention as infiltration/doors
  // above, and matches the reference Manual J report (REFERENCE-DOCS),
  // which shows "Internal gains" only in the Cooling breakdown, never
  // Heating.
  const internalGains = computeInternalGains(room, roomTypeDefaults);

  const heatingBtuh = envelopeHeatingBtuh + infiltrationHeatingBtuh;
  const coolingSensibleBtuh =
    envelopeCoolingBtuh +
    infiltrationCoolingSensibleBtuh +
    solarGainBtuh +
    internalGains.sensibleBtuh;
  const coolingLatentBtuh = infiltrationCoolingLatentBtuh + internalGains.latentBtuh;

  return {
    roomId: room.id,
    roomName: room.name,
    heatingBtuh,
    coolingSensibleBtuh,
    coolingLatentBtuh,
    coolingTotalBtuh: coolingSensibleBtuh + coolingLatentBtuh,
    doorHeatingBtuh,
    doorCoolingBtuh,
    internalGainsSensibleBtuh: internalGains.sensibleBtuh,
    internalGainsLatentBtuh: internalGains.latentBtuh,
  };
}

export function computeManualJ(
  rooms: ManualJRoom[],
  envelope: ManualJEnvelope,
  winterOutdoorF: number,
  summerOutdoorF: number,
  roomTypeDefaults: RoomTypeDefault[],
): ManualJResult {
  // Unconditioned rooms (garages, unconditioned attics, etc.) have no HVAC
  // load target - Manual J doesn't size equipment or registers for them.
  // They stay in the Rooms list/DB as records (so other rooms' walls can
  // reference them as "adjacent unconditioned space"), but are excluded
  // here from both the per-room results and the whole-house totals.
  const conditionedRooms = rooms.filter((room) => room.is_conditioned);

  const roomResults = conditionedRooms.map((room) =>
    computeRoom(room, envelope, winterOutdoorF, summerOutdoorF, roomTypeDefaults),
  );

  const wholeHouse = roomResults.reduce<WholeHouseLoadResult>(
    (totals, room) => ({
      heatingBtuh: totals.heatingBtuh + room.heatingBtuh,
      coolingSensibleBtuh: totals.coolingSensibleBtuh + room.coolingSensibleBtuh,
      coolingLatentBtuh: totals.coolingLatentBtuh + room.coolingLatentBtuh,
      coolingTotalBtuh: totals.coolingTotalBtuh + room.coolingTotalBtuh,
      doorHeatingBtuh: totals.doorHeatingBtuh + room.doorHeatingBtuh,
      doorCoolingBtuh: totals.doorCoolingBtuh + room.doorCoolingBtuh,
      internalGainsSensibleBtuh: totals.internalGainsSensibleBtuh + room.internalGainsSensibleBtuh,
      internalGainsLatentBtuh: totals.internalGainsLatentBtuh + room.internalGainsLatentBtuh,
      ventilationCfm: 0,
      ventilationHeatingBtuh: 0,
      ventilationCoolingSensibleBtuh: 0,
      ventilationCoolingLatentBtuh: 0,
    }),
    {
      heatingBtuh: 0,
      coolingSensibleBtuh: 0,
      coolingLatentBtuh: 0,
      coolingTotalBtuh: 0,
      doorHeatingBtuh: 0,
      doorCoolingBtuh: 0,
      internalGainsSensibleBtuh: 0,
      internalGainsLatentBtuh: 0,
      ventilationCfm: 0,
      ventilationHeatingBtuh: 0,
      ventilationCoolingSensibleBtuh: 0,
      ventilationCoolingLatentBtuh: 0,
    },
  );

  // ASHRAE 62.2 mechanical ventilation, whole-house (Nbr and Afloor summed
  // across conditioned rooms - see ASHRAE_622_AREA_FACTOR above and
  // migration 20260810190611_add_is_bedroom.sql). Uses the same
  // sensible/latent conversion as infiltration for consistency.
  const heatingDeltaT = envelope.indoor_design_temp_heating_f - winterOutdoorF;
  const coolingDeltaT = summerOutdoorF - envelope.indoor_design_temp_cooling_f;
  const totalBedrooms = conditionedRooms.reduce(
    (sum, room) => sum + (room.is_bedroom ? 1 : 0),
    0,
  );
  const totalConditionedFloorAreaSqft = conditionedRooms.reduce(
    (sum, room) => sum + n(room.floor_area_sqft),
    0,
  );
  const ventilationCfm =
    ASHRAE_622_AREA_FACTOR * totalConditionedFloorAreaSqft +
    ASHRAE_622_BEDROOM_FACTOR * (totalBedrooms + 1);
  const ventilationHeatingBtuh = INFILTRATION_SENSIBLE_FACTOR * ventilationCfm * heatingDeltaT;
  const ventilationCoolingSensibleBtuh =
    INFILTRATION_SENSIBLE_FACTOR * ventilationCfm * coolingDeltaT;
  const ventilationCoolingLatentBtuh =
    ventilationCoolingSensibleBtuh * INFILTRATION_LATENT_FACTOR;

  wholeHouse.ventilationCfm = ventilationCfm;
  wholeHouse.ventilationHeatingBtuh = ventilationHeatingBtuh;
  wholeHouse.ventilationCoolingSensibleBtuh = ventilationCoolingSensibleBtuh;
  wholeHouse.ventilationCoolingLatentBtuh = ventilationCoolingLatentBtuh;
  wholeHouse.heatingBtuh += ventilationHeatingBtuh;
  wholeHouse.coolingSensibleBtuh += ventilationCoolingSensibleBtuh;
  wholeHouse.coolingLatentBtuh += ventilationCoolingLatentBtuh;

  wholeHouse.coolingTotalBtuh =
    wholeHouse.coolingSensibleBtuh + wholeHouse.coolingLatentBtuh;

  return { rooms: roomResults, wholeHouse };
}
