// Regression test for the Section 7 nine-category component split
// (walls/glazing/doors/ceilings/floors/infiltration/ducts/ventilation/
// internal gains) added to RoomLoadResult/WholeHouseLoadResult. The split
// must sum back to the same totals computeManualJ already produced before
// this change - a silent mismatch here would mean the Building Analysis
// donut chart (lib/reportCharts.ts) doesn't actually foot to the load
// short form on the same report. Run via `npm test` (Vitest).
import { describe, it, expect } from "vitest";
import { computeManualJ, type ManualJRoom, type ManualJEnvelope } from "../manualJ";

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

describe("computeManualJ nine-category component split", () => {
  // Room-level: the nine components must foot to the same
  // heatingBtuh/coolingSensibleBtuh/coolingLatentBtuh computeRoom already
  // returns. Ducts scale off the pre-split envelope+infiltration subtotal,
  // so it's included as its own term here rather than re-derived.
  it("room: walls+glazing+doors+ceilings+floors+infiltration+ducts = heatingBtuh", () => {
    const heatingSum =
      r.wallsHeatingBtuh +
      r.glazingHeatingBtuh +
      r.doorHeatingBtuh +
      r.ceilingsHeatingBtuh +
      r.floorsHeatingBtuh +
      r.infiltrationHeatingBtuh +
      r.ductHeatingBtuh;
    expect(approxEqual(heatingSum, r.heatingBtuh)).toBe(true);
  });

  it("room: components sum to coolingSensibleBtuh", () => {
    const coolingSensibleSum =
      r.wallsCoolingBtuh +
      r.glazingCoolingBtuh +
      r.doorCoolingBtuh +
      r.ceilingsCoolingBtuh +
      r.floorsCoolingBtuh +
      r.infiltrationCoolingSensibleBtuh +
      r.internalGainsSensibleBtuh +
      r.ductCoolingSensibleBtuh;
    expect(approxEqual(coolingSensibleSum, r.coolingSensibleBtuh)).toBe(true);
  });

  it("room: infiltration+internalGains+ducts (latent) sum to coolingLatentBtuh", () => {
    const coolingLatentSum = r.infiltrationCoolingLatentBtuh + r.internalGainsLatentBtuh + r.ductCoolingLatentBtuh;
    expect(approxEqual(coolingLatentSum, r.coolingLatentBtuh)).toBe(true);
  });

  // Glazing must actually include solar gain, not just conduction - a
  // south-facing window at this SHGC/area should swing cooling well above
  // what U-value conduction alone would produce (150 Btuh/sqft * 0.25 SHGC *
  // 40 sqft = 1500 Btuh solar alone, before any conduction term).
  it("room: glazingCoolingBtuh includes solar gain, not conduction alone", () => {
    expect(r.glazingCoolingBtuh).toBeGreaterThan(1000);
  });

  // Whole-house: same sums, at the whole-house rollup level (confirms
  // sumRoomResults/addVentilation/the computeManualJ reduce all carry the
  // new fields through correctly, not just computeRoom itself). Ventilation
  // has no walls/glazing/doors/ceilings/floors/infiltration component of its
  // own, so it's excluded here exactly like the room-level check above.
  it("whole-house: components sum to heatingBtuh", () => {
    const wholeHeatingSum =
      wh.wallsHeatingBtuh +
      wh.glazingHeatingBtuh +
      wh.doorHeatingBtuh +
      wh.ceilingsHeatingBtuh +
      wh.floorsHeatingBtuh +
      wh.infiltrationHeatingBtuh +
      wh.ductHeatingBtuh +
      wh.ventilationHeatingBtuh;
    expect(approxEqual(wholeHeatingSum, wh.heatingBtuh)).toBe(true);
  });
});
