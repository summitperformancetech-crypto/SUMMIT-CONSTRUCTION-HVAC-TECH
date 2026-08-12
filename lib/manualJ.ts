import { DUCT_UNCONDITIONED_LOCATIONS, type DuctLocation } from "./constants/ductLocations";

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
  // Section 2 gap-closure spec. duct_location is one of the 7 values in
  // migration 20260810210059_add_ducts.sql's check constraint; anything
  // else (including null) is treated as "no data yet" - see
  // DUCT_UNCONDITIONED_LOCATIONS below.
  duct_location: string | null;
  duct_insulation_r_value: number | null;
  // Section 4 gap-closure spec. Null means "no zone assigned" - grouped
  // into a synthetic "Unassigned" zone at calc time (see computeManualJ)
  // rather than silently dropped, but every conditioned room always counts
  // in wholeHouse regardless of zone assignment.
  zone_id: string | null;
};

export type ManualJZone = {
  id: string;
  name: string;
  ahu_label: string | null;
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
  // Duct gain/loss (Section 2), already included in heatingBtuh/
  // coolingSensibleBtuh/coolingLatentBtuh above.
  ductHeatingBtuh: number;
  ductCoolingSensibleBtuh: number;
  ductCoolingLatentBtuh: number;
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
  ductHeatingBtuh: number;
  ductCoolingSensibleBtuh: number;
  ductCoolingLatentBtuh: number;
};

// Section 4: same shape as WholeHouseLoadResult (a zone is computed exactly
// like the whole house used to be, just scoped to a room subset), labeled
// with which zone it is. zoneId is null only for the synthetic "Unassigned"
// bucket, never for a real zone.
export type ZoneLoadResult = WholeHouseLoadResult & {
  zoneId: string | null;
  zoneName: string;
};

export type ManualJResult = {
  rooms: RoomLoadResult[];
  zones: ZoneLoadResult[];
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

// R-value of 0 is real data - an uninsulated wall/ceiling/floor/duct - and
// must compute a UA/duct-loss much higher than an insulated assembly, not
// zero. But UA = area / R is undefined (Infinity) exactly at R=0, and the
// linear R8/R duct scaling below blows up the same way. Clamp every R-value
// denominator to this practical floor - roughly the resistance of bare
// framing/sheathing plus boundary air films, i.e. the lowest R a real
// building assembly has even with zero added insulation - before dividing,
// so R=0 yields a large, finite, non-zero load instead of Infinity/NaN.
// null/undefined (no data entered yet) is handled separately by each caller
// and must still short-circuit to 0, not fall through to this floor.
const MIN_R_VALUE = 0.5;

// APPROXIMATION, not the certified ACCA Manual J 8th Edition duct-loss
// procedure. The spec's suggested formula (supply CFM x 1.1 x delta-T x
// duct loss factor) isn't implementable here: this app has no supply-CFM
// or duct-surface-area model (that's normally a Manual D/equipment-sizing
// output, and this app has no Manual S/equipment-sizing feature at all).
//
// Instead these factors are reverse-engineered from the one real data
// point available - the reference report at REFERENCE-DOCS/ (Houston-area,
// zone 2A, R-8 ducts in an unconditioned attic). Its "Ducts" line is a
// first-pass component alongside Walls/Glazing/Doors/etc (not a post-
// equipment-sizing adjustment), so this is applied the same way, per room,
// as a percentage of that room's own (envelope + infiltration) subtotal -
// the same base the reference report's own "Structure + Infiltration"
// figures represent:
//   heating:          6452 / (32629 + 8510)  = 0.1568
//   cooling sensible: 4673 / (29801 + 1922)  = 0.1473
//   cooling latent:   2506 / 3091 (infiltration latent only, since that's
//                     this app's only other latent source at the room
//                     level) = 0.8107 - notably higher than the sensible
//                     ratio, consistent with the report's duct figure
//                     bundling both conduction loss AND duct-leakage gain
//                     (leakage carries latent load the way infiltration
//                     does; this app has no separate duct-leakage-CFM
//                     model, so it's folded into this one factor).
// Scaled linearly by (R8 / actual R) for other insulation levels - a
// simplification (real duct loss also depends on location-specific
// effective temperature, e.g. attic vs. crawlspace vs. basement have very
// different real design temps, which this does not model - every
// "unconditioned" location below uses the same factor).
const DUCT_INSULATION_R_BASELINE = 8;
const DUCT_LOSS_FACTOR_HEATING_R8 = 0.1568;
const DUCT_GAIN_FACTOR_COOLING_SENSIBLE_R8 = 0.1473;
const DUCT_GAIN_FACTOR_COOLING_LATENT_R8 = 0.8107;

// Locations where ducts are assumed exposed to non-conditioned-space
// temperatures. Attic-Conditioned/Basement-Conditioned/Conditioned-Space
// (and null/unset) are treated as 0 duct loss - ducts fully inside the
// conditioned envelope, or no data yet.
//
// Data Integrity Addendum, Section 3: when a room has no measured
// duct_insulation_r_value, this used to silently mean "0 duct loss" -
// treating an unmeasured duct as if it doesn't exist. That's wrong: an
// unmeasured duct still has SOME insulation (code requires at least a
// minimum), so the honest default is "assume it meets the current code
// minimum for its location", not "assume no duct". codeMinimumsByLocation
// (from duct_insulation_code_minimums, see lib/reportData.ts/page.tsx for
// how it's fetched) supplies that default; a location with no seeded
// minimum still falls back to 0 (can't assume a number that doesn't
// exist).
function ductRScaleFactor(
  room: ManualJRoom,
  codeMinimumsByLocation: ReadonlyMap<string, number>,
): number {
  // room.duct_location is a plain string at the type level (it comes from
  // the DB via ManualJRoom, not the narrower DuctLocation type) even
  // though the check constraint guarantees it's one of the enum values -
  // Set<DuctLocation>.has() needs the cast for that same reason.
  if (
    !room.duct_location ||
    !DUCT_UNCONDITIONED_LOCATIONS.has(room.duct_location as DuctLocation)
  )
    return 0;
  const r = room.duct_insulation_r_value ?? codeMinimumsByLocation.get(room.duct_location) ?? null;
  // Still null after the code-minimum fallback means genuinely no data
  // available anywhere (no measured value AND no seeded minimum for this
  // location) - skip (0 duct loss) rather than guess. A literal 0 (or any
  // value below the practical floor) is real measured data - a bare/
  // uninsulated duct - and must scale toward the highest loss, not 0. See
  // MIN_R_VALUE above for why the denominator is clamped instead of used
  // raw.
  if (r == null) return 0;
  return DUCT_INSULATION_R_BASELINE / Math.max(r, MIN_R_VALUE);
}

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
  codeMinimumsByLocation: ReadonlyMap<string, number>,
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

    // A literal R=0 (uninsulated wall) is real data, not "no data" - only
    // null/undefined skips this term. See MIN_R_VALUE above for the
    // divide-by-zero floor.
    const wallUA =
      envelope.wall_insulation_r_value != null
        ? netWallAreaSqft / Math.max(envelope.wall_insulation_r_value, MIN_R_VALUE)
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
  // Same null-vs-0 distinction as wallUA above: R=0 is a real uninsulated
  // ceiling/floor, not missing data.
  const ceilingUA =
    room.ceiling_exposed && envelope.ceiling_insulation_r_value != null
      ? n(room.floor_area_sqft) / Math.max(envelope.ceiling_insulation_r_value, MIN_R_VALUE)
      : 0;
  envelopeHeatingBtuh += ceilingUA * heatingDeltaT * atticFactor;
  envelopeCoolingBtuh += ceilingUA * coolingDeltaT * atticFactor;

  const floorUA =
    room.floor_exposed && envelope.floor_insulation_r_value != null
      ? n(room.floor_area_sqft) / Math.max(envelope.floor_insulation_r_value, MIN_R_VALUE)
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

  // Duct gain/loss (Section 2): a percentage of this room's own envelope +
  // infiltration subtotal - see DUCT_LOSS_FACTOR_HEATING_R8 etc. above for
  // the derivation. Computed from envelope/infiltration BEFORE internal
  // gains are added (internal gains aren't structure/infiltration load,
  // and the reference report's own "Structure + Infiltration" base for
  // Ducts excludes its "Internal gains" line too).
  const ductScale = ductRScaleFactor(room, codeMinimumsByLocation);
  const ductHeatingBtuh =
    ductScale * DUCT_LOSS_FACTOR_HEATING_R8 * (envelopeHeatingBtuh + infiltrationHeatingBtuh);
  const ductCoolingSensibleBtuh =
    ductScale *
    DUCT_GAIN_FACTOR_COOLING_SENSIBLE_R8 *
    (envelopeCoolingBtuh + infiltrationCoolingSensibleBtuh + solarGainBtuh);
  const ductCoolingLatentBtuh =
    ductScale * DUCT_GAIN_FACTOR_COOLING_LATENT_R8 * infiltrationCoolingLatentBtuh;

  const heatingBtuh = envelopeHeatingBtuh + infiltrationHeatingBtuh + ductHeatingBtuh;
  const coolingSensibleBtuh =
    envelopeCoolingBtuh +
    infiltrationCoolingSensibleBtuh +
    solarGainBtuh +
    internalGains.sensibleBtuh +
    ductCoolingSensibleBtuh;
  const coolingLatentBtuh =
    infiltrationCoolingLatentBtuh + internalGains.latentBtuh + ductCoolingLatentBtuh;

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
    ductHeatingBtuh,
    ductCoolingSensibleBtuh,
    ductCoolingLatentBtuh,
  };
}

function emptyLoadResult(): WholeHouseLoadResult {
  return {
    heatingBtuh: 0,
    coolingSensibleBtuh: 0,
    coolingLatentBtuh: 0,
    coolingTotalBtuh: 0,
    doorHeatingBtuh: 0,
    doorCoolingBtuh: 0,
    internalGainsSensibleBtuh: 0,
    internalGainsLatentBtuh: 0,
    ductHeatingBtuh: 0,
    ductCoolingSensibleBtuh: 0,
    ductCoolingLatentBtuh: 0,
    ventilationCfm: 0,
    ventilationHeatingBtuh: 0,
    ventilationCoolingSensibleBtuh: 0,
    ventilationCoolingLatentBtuh: 0,
  };
}

function sumRoomResults(roomResults: RoomLoadResult[]): WholeHouseLoadResult {
  return roomResults.reduce<WholeHouseLoadResult>(
    (totals, room) => ({
      ...totals,
      heatingBtuh: totals.heatingBtuh + room.heatingBtuh,
      coolingSensibleBtuh: totals.coolingSensibleBtuh + room.coolingSensibleBtuh,
      coolingLatentBtuh: totals.coolingLatentBtuh + room.coolingLatentBtuh,
      coolingTotalBtuh: totals.coolingTotalBtuh + room.coolingTotalBtuh,
      doorHeatingBtuh: totals.doorHeatingBtuh + room.doorHeatingBtuh,
      doorCoolingBtuh: totals.doorCoolingBtuh + room.doorCoolingBtuh,
      internalGainsSensibleBtuh: totals.internalGainsSensibleBtuh + room.internalGainsSensibleBtuh,
      internalGainsLatentBtuh: totals.internalGainsLatentBtuh + room.internalGainsLatentBtuh,
      ductHeatingBtuh: totals.ductHeatingBtuh + room.ductHeatingBtuh,
      ductCoolingSensibleBtuh: totals.ductCoolingSensibleBtuh + room.ductCoolingSensibleBtuh,
      ductCoolingLatentBtuh: totals.ductCoolingLatentBtuh + room.ductCoolingLatentBtuh,
    }),
    emptyLoadResult(),
  );
}

// ASHRAE 62.2 mechanical ventilation, computed per group (zone) rather than
// once whole-house - see the Section 4 migration comment and
// ASHRAE_622_AREA_FACTOR above. This matches the reference report, which
// computes ventilation per AHU (24 CFM AHU1 + 60 CFM AHU2 = 84 CFM
// whole-house - not a single whole-house Nbr/Afloor formula). The "+1"
// occupancy floor in the formula is NOT linearly distributable across
// zones (each zone's own calc adds its own +1), so summing per-zone
// figures is not the same as one whole-house formula in general - it's
// only identical when there's exactly one zone, which is why this change
// doesn't move any existing project's total (every current project has
// exactly one zone, from the Section 4 migration's backfill).
function addVentilation(
  totals: WholeHouseLoadResult,
  groupRooms: ManualJRoom[],
  envelope: ManualJEnvelope,
  winterOutdoorF: number,
  summerOutdoorF: number,
): WholeHouseLoadResult {
  const heatingDeltaT = envelope.indoor_design_temp_heating_f - winterOutdoorF;
  const coolingDeltaT = summerOutdoorF - envelope.indoor_design_temp_cooling_f;
  const bedrooms = groupRooms.reduce((sum, room) => sum + (room.is_bedroom ? 1 : 0), 0);
  const floorAreaSqft = groupRooms.reduce((sum, room) => sum + n(room.floor_area_sqft), 0);

  const ventilationCfm =
    ASHRAE_622_AREA_FACTOR * floorAreaSqft + ASHRAE_622_BEDROOM_FACTOR * (bedrooms + 1);
  const ventilationHeatingBtuh = INFILTRATION_SENSIBLE_FACTOR * ventilationCfm * heatingDeltaT;
  const ventilationCoolingSensibleBtuh =
    INFILTRATION_SENSIBLE_FACTOR * ventilationCfm * coolingDeltaT;
  const ventilationCoolingLatentBtuh =
    ventilationCoolingSensibleBtuh * INFILTRATION_LATENT_FACTOR;

  const coolingSensibleBtuh = totals.coolingSensibleBtuh + ventilationCoolingSensibleBtuh;
  const coolingLatentBtuh = totals.coolingLatentBtuh + ventilationCoolingLatentBtuh;

  return {
    ...totals,
    ventilationCfm,
    ventilationHeatingBtuh,
    ventilationCoolingSensibleBtuh,
    ventilationCoolingLatentBtuh,
    heatingBtuh: totals.heatingBtuh + ventilationHeatingBtuh,
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
  roomTypeDefaults: RoomTypeDefault[],
  zones: ManualJZone[] = [],
  // Data Integrity Addendum, Section 3 - duct_location -> current code
  // minimum R-value (from duct_insulation_code_minimums), used as the
  // duct-loss default when a room has no measured duct_insulation_r_value.
  // Defaults to empty (old "0 duct loss when unmeasured" behavior) so any
  // caller that genuinely has no code-minimum data available still gets a
  // safe, defined result rather than a crash - every real caller in this
  // app passes the live table's contents (see reportData.ts/page.tsx).
  codeMinimumsByLocation: ReadonlyMap<string, number> = new Map(),
): ManualJResult {
  // Unconditioned rooms (garages, unconditioned attics, etc.) have no HVAC
  // load target - Manual J doesn't size equipment or registers for them.
  // They stay in the Rooms list/DB as records (so other rooms' walls can
  // reference them as "adjacent unconditioned space"), but are excluded
  // here from both the per-room results and the whole-house totals.
  const conditionedRooms = rooms.filter((room) => room.is_conditioned);

  const roomResults = conditionedRooms.map((room) =>
    computeRoom(
      room,
      envelope,
      winterOutdoorF,
      summerOutdoorF,
      roomTypeDefaults,
      codeMinimumsByLocation,
    ),
  );

  // Group conditioned rooms (and their matching results - same array order
  // as conditionedRooms) by zone_id. A room whose zone_id is null, or
  // points at a zone not in the zones list (e.g. a stale reference), falls
  // into a synthetic "Unassigned" bucket instead of being dropped from
  // zone-level reporting - it still always counts toward wholeHouse either
  // way, since wholeHouse is defined as the sum of every group below.
  const zoneIds = new Set(zones.map((zone) => zone.id));
  const groups = new Map<string | null, { rooms: ManualJRoom[]; results: RoomLoadResult[] }>();
  conditionedRooms.forEach((room, index) => {
    const key = room.zone_id && zoneIds.has(room.zone_id) ? room.zone_id : null;
    if (!groups.has(key)) groups.set(key, { rooms: [], results: [] });
    const group = groups.get(key)!;
    group.rooms.push(room);
    group.results.push(roomResults[index]);
  });

  const zoneResults: ZoneLoadResult[] = zones.map((zone) => {
    const group = groups.get(zone.id);
    // A zone with no rooms assigned yet must contribute nothing, not the
    // ASHRAE 62.2 formula's "+1" occupancy floor (7.5 CFM) applied to zero
    // rooms - a tech creating "Zone 2" and not yet assigning rooms to it
    // must not silently inflate the whole-project total. Caught by the
    // Section 4 test suite: an empty zone in the zones list was adding a
    // phantom +7.5 CFM before this guard.
    if (!group || group.rooms.length === 0) {
      return { ...emptyLoadResult(), zoneId: zone.id, zoneName: zone.name };
    }
    const base = sumRoomResults(group.results);
    const withVentilation = addVentilation(
      base,
      group.rooms,
      envelope,
      winterOutdoorF,
      summerOutdoorF,
    );
    return { ...withVentilation, zoneId: zone.id, zoneName: zone.name };
  });

  const unassignedGroup = groups.get(null);
  if (unassignedGroup) {
    const base = sumRoomResults(unassignedGroup.results);
    const withVentilation = addVentilation(
      base,
      unassignedGroup.rooms,
      envelope,
      winterOutdoorF,
      summerOutdoorF,
    );
    zoneResults.push({ ...withVentilation, zoneId: null, zoneName: "Unassigned" });
  }

  const wholeHouse = zoneResults.reduce<WholeHouseLoadResult>(
    (totals, zone) => ({
      heatingBtuh: totals.heatingBtuh + zone.heatingBtuh,
      coolingSensibleBtuh: totals.coolingSensibleBtuh + zone.coolingSensibleBtuh,
      coolingLatentBtuh: totals.coolingLatentBtuh + zone.coolingLatentBtuh,
      coolingTotalBtuh: totals.coolingTotalBtuh + zone.coolingTotalBtuh,
      doorHeatingBtuh: totals.doorHeatingBtuh + zone.doorHeatingBtuh,
      doorCoolingBtuh: totals.doorCoolingBtuh + zone.doorCoolingBtuh,
      internalGainsSensibleBtuh: totals.internalGainsSensibleBtuh + zone.internalGainsSensibleBtuh,
      internalGainsLatentBtuh: totals.internalGainsLatentBtuh + zone.internalGainsLatentBtuh,
      ductHeatingBtuh: totals.ductHeatingBtuh + zone.ductHeatingBtuh,
      ductCoolingSensibleBtuh: totals.ductCoolingSensibleBtuh + zone.ductCoolingSensibleBtuh,
      ductCoolingLatentBtuh: totals.ductCoolingLatentBtuh + zone.ductCoolingLatentBtuh,
      ventilationCfm: totals.ventilationCfm + zone.ventilationCfm,
      ventilationHeatingBtuh: totals.ventilationHeatingBtuh + zone.ventilationHeatingBtuh,
      ventilationCoolingSensibleBtuh:
        totals.ventilationCoolingSensibleBtuh + zone.ventilationCoolingSensibleBtuh,
      ventilationCoolingLatentBtuh:
        totals.ventilationCoolingLatentBtuh + zone.ventilationCoolingLatentBtuh,
    }),
    emptyLoadResult(),
  );

  return { rooms: roomResults, zones: zoneResults, wholeHouse };
}
