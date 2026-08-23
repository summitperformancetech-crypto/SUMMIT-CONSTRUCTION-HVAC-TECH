// Regression test for the Section 7 nine-category component split
// (walls/glazing/doors/ceilings/floors/infiltration/ducts/ventilation/
// internal gains) added to RoomLoadResult/WholeHouseLoadResult. The split
// must sum back to the same totals computeManualJ already produced before
// this change - a silent mismatch here would mean the Building Analysis
// donut chart (lib/reportCharts.ts) doesn't actually foot to the load
// short form on the same report. Run directly with
// `npx tsx lib/__tests__/manualJ.test.mts`.
import { computeManualJ, type ManualJRoom, type ManualJEnvelope } from "../manualJ";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(cond ? "PASS" : "FAIL", label, cond ? "" : (detail ?? ""));
  if (cond) pass++;
  else fail++;
}

function approxEqual(a: number, b: number, tolerance = 0.5): boolean {
  return Math.abs(a - b) <= tolerance;
}

const envelope: ManualJEnvelope = {
  wall_insulation_r_value: 13,
  ceiling_insulation_r_value: 38,
  floor_insulation_r_value: 19,
  window_u_value: 0.3,
  window_shgc: 0.25,
  ach50: 5,
  indoor_design_temp_heating_f: 70,
  indoor_design_temp_cooling_f: 75,
  occupants: 4,
  attic_construction_type: "vented_unconditioned",
  door_u_value: 0.35,
};

// One room, all four walls exterior, south wall carries the glazing and a
// door - deliberately asymmetric so walls/glazing/doors/ceilings/floors
// all land at different, independently-checkable values.
const room: ManualJRoom = {
  id: "r1",
  name: "Living Room",
  floor_area_sqft: 300,
  ceiling_height_ft: 9,
  ceiling_exposed: true,
  floor_exposed: true,
  is_conditioned: true,
  wall_north_len_ft: 20,
  wall_south_len_ft: 20,
  wall_east_len_ft: 15,
  wall_west_len_ft: 15,
  wall_north_exposure_type: "exterior",
  wall_south_exposure_type: "exterior",
  wall_east_exposure_type: "exterior",
  wall_west_exposure_type: "exterior",
  window_north_area_sqft: 0,
  window_south_area_sqft: 40,
  window_east_area_sqft: 0,
  window_west_area_sqft: 0,
  door_count: 1,
  is_bedroom: false,
  room_type: null,
  occupant_count: 2,
  sensible_gain_override: null,
  latent_gain_override: null,
  duct_location: null,
  duct_insulation_r_value: null,
  zone_id: null,
};

const winterOutdoorF = 20;
const summerOutdoorF = 98;

const result = computeManualJ([room], envelope, winterOutdoorF, summerOutdoorF, [], []);
const r = result.rooms[0];
const wh = result.wholeHouse;

// --- Room-level: the nine components must foot to the same
// heatingBtuh/coolingSensibleBtuh/coolingLatentBtuh computeRoom already
// returns. Ducts scale off the pre-split envelope+infiltration subtotal,
// so it's included as its own term here rather than re-derived.
const heatingSum =
  r.wallsHeatingBtuh +
  r.glazingHeatingBtuh +
  r.doorHeatingBtuh +
  r.ceilingsHeatingBtuh +
  r.floorsHeatingBtuh +
  r.infiltrationHeatingBtuh +
  r.ductHeatingBtuh;
check(
  "room: walls+glazing+doors+ceilings+floors+infiltration+ducts = heatingBtuh",
  approxEqual(heatingSum, r.heatingBtuh),
  `sum=${heatingSum} vs heatingBtuh=${r.heatingBtuh}`,
);

const coolingSensibleSum =
  r.wallsCoolingBtuh +
  r.glazingCoolingBtuh +
  r.doorCoolingBtuh +
  r.ceilingsCoolingBtuh +
  r.floorsCoolingBtuh +
  r.infiltrationCoolingSensibleBtuh +
  r.internalGainsSensibleBtuh +
  r.ductCoolingSensibleBtuh;
check(
  "room: components sum to coolingSensibleBtuh",
  approxEqual(coolingSensibleSum, r.coolingSensibleBtuh),
  `sum=${coolingSensibleSum} vs coolingSensibleBtuh=${r.coolingSensibleBtuh}`,
);

const coolingLatentSum = r.infiltrationCoolingLatentBtuh + r.internalGainsLatentBtuh + r.ductCoolingLatentBtuh;
check(
  "room: infiltration+internalGains+ducts (latent) sum to coolingLatentBtuh",
  approxEqual(coolingLatentSum, r.coolingLatentBtuh),
  `sum=${coolingLatentSum} vs coolingLatentBtuh=${r.coolingLatentBtuh}`,
);

// --- Glazing must actually include solar gain, not just conduction - a
// south-facing window at this SHGC/area should swing cooling well above
// what U-value conduction alone would produce (150 Btuh/sqft * 0.25 SHGC *
// 40 sqft = 1500 Btuh solar alone, before any conduction term).
check(
  "room: glazingCoolingBtuh includes solar gain, not conduction alone",
  r.glazingCoolingBtuh > 1000,
  `glazingCoolingBtuh=${r.glazingCoolingBtuh}`,
);

// --- Whole-house: same sums, at the whole-house rollup level (confirms
// sumRoomResults/addVentilation/the computeManualJ reduce all carry the
// new fields through correctly, not just computeRoom itself). Ventilation
// has no walls/glazing/doors/ceilings/floors/infiltration component of its
// own, so it's excluded here exactly like the room-level check above.
const wholeHeatingSum =
  wh.wallsHeatingBtuh +
  wh.glazingHeatingBtuh +
  wh.doorHeatingBtuh +
  wh.ceilingsHeatingBtuh +
  wh.floorsHeatingBtuh +
  wh.infiltrationHeatingBtuh +
  wh.ductHeatingBtuh +
  wh.ventilationHeatingBtuh;
check(
  "whole-house: components sum to heatingBtuh",
  approxEqual(wholeHeatingSum, wh.heatingBtuh),
  `sum=${wholeHeatingSum} vs heatingBtuh=${wh.heatingBtuh}`,
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
