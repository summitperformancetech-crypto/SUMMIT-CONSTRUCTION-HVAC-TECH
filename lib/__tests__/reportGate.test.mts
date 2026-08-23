// Gate condition 5 (SUMMIT-REPORT-STANDARD.md §3, added 2026-08-23):
// checkDataCompleteness (lib/dataCompleteness.ts) is now a hard block on
// report generation, same fail-closed pattern as validateReportTotals -
// diagnosed against real production data (Kinsela) where a project could
// pass every other gate condition while several rooms had no floor area
// at all. Only this new condition is tested here in isolation (via
// blockers.some(...)), not the full gate - the other conditions are
// pre-existing and untested elsewhere; not this change's responsibility
// to backfill.
import { describe, it, expect } from "vitest";
import { getReportGenerationGateStatus } from "../reportGate";
import type { ReportData } from "../reportData";
import type { RoomRow } from "../../components/manual-j-workflow";
import type { ManualJEnvelope, RoomLoadResult, WholeHouseLoadResult } from "../manualJ";

function room(overrides: Partial<RoomRow> = {}): RoomRow {
  return {
    id: "r1",
    project_id: "p1",
    name: "Room",
    level: "single_story",
    floor_area_sqft: 150,
    ceiling_height_ft: 9,
    ceiling_exposed: false,
    floor_exposed: false,
    is_conditioned: true,
    is_bedroom: false,
    room_type: null,
    occupant_count: null,
    sensible_gain_override: null,
    latent_gain_override: null,
    duct_location: null,
    duct_insulation_r_value: null,
    duct_source: null,
    duct_confidence: null,
    zone_id: null,
    wall_north_len_ft: 12,
    wall_south_len_ft: 12,
    wall_east_len_ft: 12,
    wall_west_len_ft: 12,
    wall_front_len_ft: null,
    wall_rear_len_ft: null,
    wall_left_len_ft: null,
    wall_right_len_ft: null,
    wall_north_exposure_type: "exterior",
    wall_south_exposure_type: "exterior",
    wall_east_exposure_type: "exterior",
    wall_west_exposure_type: "exterior",
    window_north_area_sqft: 15,
    window_south_area_sqft: null,
    window_east_area_sqft: null,
    window_west_area_sqft: null,
    window_front_area_sqft: null,
    window_rear_area_sqft: null,
    window_left_area_sqft: null,
    window_right_area_sqft: null,
    door_count: 1,
    ...overrides,
  } as RoomRow;
}

const emptyRoomLoad = (): RoomLoadResult => ({
  roomId: "r1",
  roomName: "Room",
  heatingBtuh: 0,
  coolingSensibleBtuh: 0,
  coolingLatentBtuh: 0,
  coolingTotalBtuh: 0,
  wallsHeatingBtuh: 0,
  wallsCoolingBtuh: 0,
  glazingHeatingBtuh: 0,
  glazingCoolingBtuh: 0,
  ceilingsHeatingBtuh: 0,
  ceilingsCoolingBtuh: 0,
  floorsHeatingBtuh: 0,
  floorsCoolingBtuh: 0,
  infiltrationHeatingBtuh: 0,
  infiltrationCoolingSensibleBtuh: 0,
  infiltrationCoolingLatentBtuh: 0,
  doorHeatingBtuh: 0,
  doorCoolingBtuh: 0,
  internalGainsSensibleBtuh: 0,
  internalGainsLatentBtuh: 0,
  ductHeatingBtuh: 0,
  ductCoolingSensibleBtuh: 0,
  ductCoolingLatentBtuh: 0,
});

const emptyWholeHouse = (): WholeHouseLoadResult => ({
  heatingBtuh: 0,
  coolingSensibleBtuh: 0,
  coolingLatentBtuh: 0,
  coolingTotalBtuh: 0,
  wallsHeatingBtuh: 0,
  wallsCoolingBtuh: 0,
  glazingHeatingBtuh: 0,
  glazingCoolingBtuh: 0,
  ceilingsHeatingBtuh: 0,
  ceilingsCoolingBtuh: 0,
  floorsHeatingBtuh: 0,
  floorsCoolingBtuh: 0,
  infiltrationHeatingBtuh: 0,
  infiltrationCoolingSensibleBtuh: 0,
  infiltrationCoolingLatentBtuh: 0,
  doorHeatingBtuh: 0,
  doorCoolingBtuh: 0,
  ventilationCfm: 0,
  ventilationHeatingBtuh: 0,
  ventilationCoolingSensibleBtuh: 0,
  ventilationCoolingLatentBtuh: 0,
  internalGainsSensibleBtuh: 0,
  internalGainsLatentBtuh: 0,
  ductHeatingBtuh: 0,
  ductCoolingSensibleBtuh: 0,
  ductCoolingLatentBtuh: 0,
});

function baseReportData(rooms: RoomRow[]): ReportData {
  return {
    project: {
      id: "p1",
      name: "Test",
      project_type: "residential",
      address_line1: "1 Main St",
      address_line2: null,
      city: "Austin",
      state: "TX",
      zip: "78701",
    },
    climateZone: null,
    generatedAt: new Date().toISOString(),
    snapshot: null,
    residential: {
      envelope: {} as ManualJEnvelope,
      manualJ: { rooms: [emptyRoomLoad()], zones: [], wholeHouse: emptyWholeHouse() },
      ductSchedule: [],
      ductRuns: [],
      rooms,
      zones: [],
      zoneEquipment: [],
      ductInsulationCompliance: [],
    },
    commercial: null,
    fieldResolutions: [],
  };
}

describe("getReportGenerationGateStatus - data completeness gate", () => {
  it("does not block generation when room data is complete", () => {
    const data = baseReportData([room()]);
    const status = getReportGenerationGateStatus(data, [], new Set());
    expect(status.blockers.some((b) => b.code === "data_incomplete")).toBe(false);
  });

  it("blocks generation when a room has no floor area recorded", () => {
    const data = baseReportData([room({ id: "r1", name: "Bath 4", floor_area_sqft: null })]);
    const status = getReportGenerationGateStatus(data, [], new Set());
    const blocker = status.blockers.find((b) => b.code === "data_incomplete");
    expect(blocker).toBeDefined();
    expect(blocker?.label).toContain("Bath 4");
    expect(status.canGenerate).toBe(false);
  });

  it("blocks generation when the whole house has zero glazing despite real floor area", () => {
    const data = baseReportData([
      room({ id: "r1", name: "Living Room", window_north_area_sqft: null }),
    ]);
    const status = getReportGenerationGateStatus(data, [], new Set());
    const blocker = status.blockers.find((b) => b.code === "data_incomplete");
    expect(blocker).toBeDefined();
    expect(blocker?.label).toBe("Incomplete project data");
    expect(blocker?.detail).toMatch(/glazing area/i);
  });

  it("does not run the completeness check for a commercial-only project (no residential data)", () => {
    const data: ReportData = {
      project: {
        id: "p1",
        name: "Test",
        project_type: "commercial",
        address_line1: "1 Main St",
        address_line2: null,
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
      climateZone: null,
      generatedAt: new Date().toISOString(),
      snapshot: null,
      residential: null,
      commercial: { blockLoad: null, industrialLoad: null },
      fieldResolutions: [],
    };
    const status = getReportGenerationGateStatus(data, [], new Set());
    expect(status.blockers.some((b) => b.code === "data_incomplete")).toBe(false);
  });
});
