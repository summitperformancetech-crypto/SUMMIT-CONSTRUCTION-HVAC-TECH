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
import type { ReportData, ZoneEquipmentSelection } from "../reportData";
import type { RoomRow } from "../../components/manual-j-workflow";
import type { ManualJEnvelope, ManualJZone, RoomLoadResult, WholeHouseLoadResult } from "../manualJ";
import type { DuctRunRow } from "../../components/duct-design-section";
import type { DuctSizingResult } from "../manualD";
import type { EquipmentEvaluation } from "../manualS";

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
      hvac_system_configuration: "independent_per_zone",
    },
    climateZone: null,
    generatedAt: new Date().toISOString(),
    snapshot: null,
    floorPlanImageDataUri: null,
    residential: {
      envelope: {} as ManualJEnvelope,
      manualJ: { rooms: [emptyRoomLoad()], zones: [], wholeHouse: emptyWholeHouse() },
      ductSchedule: [],
      aed: [],
      ductRoutingIllustration: [],
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
        hvac_system_configuration: "independent_per_zone",
      },
      climateZone: null,
      generatedAt: new Date().toISOString(),
      snapshot: null,
    floorPlanImageDataUri: null,
      residential: null,
      commercial: { blockLoad: null, industrialLoad: null },
      fieldResolutions: [],
    };
    const status = getReportGenerationGateStatus(data, [], new Set());
    expect(status.blockers.some((b) => b.code === "data_incomplete")).toBe(false);
  });
});

// Gate condition 3, "single_system_zoned" grouping (diagnosed 2026-08-25
// against real Schneider project data): a project can share one physical
// unit across multiple zones through dampers (see components/system-
// configuration-section.tsx and lib/reportData.ts's own
// "single_system_zoned" branch, which already evaluates/selects
// equipment against the zones' SUMMED load). The compatibility check has
// to match that - validate the group's summed branch CFM against the
// shared unit once, not each zone's own CFM against the whole unit.
function ductRun(overrides: Partial<DuctRunRow> = {}): DuctRunRow {
  return {
    id: "run1",
    project_id: "p1",
    zone_id: "z1",
    run_type: "branch",
    room_id: "r1",
    length_ft: 20,
    fitting_equivalent_length_ft: 15,
    duct_shape: "round",
    target_height_in: null,
    material: "flex",
    cfm: 0,
    friction_rate: 0.08,
    velocity_fpm: 0,
    calculated_diameter_in: null,
    calculated_width_in: null,
    calculated_height_in: null,
    ...overrides,
  };
}

function equipmentEvaluation(id: string, ratedCfm: number): EquipmentEvaluation {
  return {
    equipment: {
      id,
      manufacturer: "Amana",
      modelNumber: "ASZ160481K",
      equipmentType: "heat_pump",
      stageType: "single",
      nominalCoolingCapacityBtu: 47000,
      nominalHeatingCapacityBtu: 47000,
      ratedCfm,
      sourceDocument: "test",
    },
    coolingCapacityAtDesign: null,
    coolingPercentOfLoad: null,
    withinCoolingWindow: true,
    heatingCapacityAtDesign: null,
    heatingPercentOfLoad: null,
    withinHeatingWindow: true,
    balancePointF: null,
    supplementalHeatBtuh: null,
    supplementalHeatKw: null,
  } as EquipmentEvaluation;
}

function zoneEquipmentSelection(zoneId: string, evaluation: EquipmentEvaluation): ZoneEquipmentSelection {
  return {
    zoneId,
    equipmentEvaluations: [evaluation],
    selectedEquipment: evaluation,
    equipmentSelectionNotes: null,
  };
}

function baseReportDataWithDuctDesign(overrides: {
  hvacSystemConfiguration: "independent_per_zone" | "single_system_zoned";
  zones: ManualJZone[];
  ductRuns: DuctRunRow[];
  ductSchedule: DuctSizingResult[];
  zoneEquipment: ZoneEquipmentSelection[];
}): ReportData {
  const data = baseReportData([
    room({ id: "r1", zone_id: "z1" }),
    room({ id: "r2", zone_id: "z2" }),
  ]);
  data.project.hvac_system_configuration = overrides.hvacSystemConfiguration;
  data.residential!.zones = overrides.zones;
  data.residential!.ductRuns = overrides.ductRuns;
  data.residential!.ductSchedule = overrides.ductSchedule;
  data.residential!.zoneEquipment = overrides.zoneEquipment;
  return data;
}

describe("getReportGenerationGateStatus - duct/equipment CFM compatibility", () => {
  it("independent_per_zone: blocks a zone whose own branch CFM deviates from its own equipment", () => {
    const data = baseReportDataWithDuctDesign({
      hvacSystemConfiguration: "independent_per_zone",
      zones: [{ id: "z1", name: "Zone 1", ahu_label: null }],
      ductRuns: [ductRun({ id: "run1", zone_id: "z1", room_id: "r1" })],
      ductSchedule: [{ runId: "run1", cfm: 348, frictionRate: 0.08, ductShape: "round", diameterIn: 6, widthIn: null, heightIn: null, velocityFpm: 900, velocityWarning: null, exceedsTableRange: false }],
      zoneEquipment: [zoneEquipmentSelection("z1", equipmentEvaluation("eq1", 1400))],
    });
    const status = getReportGenerationGateStatus(data, [], new Set());
    const blocker = status.blockers.find((b) => b.code === "duct_design_incomplete" && b.detail.includes("differs from"));
    expect(blocker).toBeDefined();
    expect(blocker?.detail).toContain("Zone 1");
  });

  it("single_system_zoned: does NOT block when two zones share one unit and their COMBINED branch CFM is within tolerance, even though each zone alone deviates wildly", () => {
    const data = baseReportDataWithDuctDesign({
      hvacSystemConfiguration: "single_system_zoned",
      zones: [
        { id: "z1", name: "Zone 1", ahu_label: null },
        { id: "z2", name: "Zone 2 - Upstairs AHU", ahu_label: "AHU-2" },
      ],
      ductRuns: [
        ductRun({ id: "run1", zone_id: "z1", room_id: "r1" }),
        ductRun({ id: "run2", zone_id: "z2", room_id: "r2" }),
      ],
      ductSchedule: [
        { runId: "run1", cfm: 1149, frictionRate: 0.08, ductShape: "round", diameterIn: 14, widthIn: null, heightIn: null, velocityFpm: 900, velocityWarning: null, exceedsTableRange: false },
        { runId: "run2", cfm: 348, frictionRate: 0.08, ductShape: "round", diameterIn: 9, widthIn: null, heightIn: null, velocityFpm: 900, velocityWarning: null, exceedsTableRange: false },
      ],
      // Real Schneider shape: both zones share the exact same equipment
      // record (1149 + 348 = 1497 vs. a 1400 CFM shared unit - 7% off,
      // well within tolerance combined; 348 alone against 1400 is a 75%
      // deviation, which is what falsely blocked before this fix).
      zoneEquipment: (() => {
        const evaluation = equipmentEvaluation("eq1", 1400);
        return [zoneEquipmentSelection("z1", evaluation), zoneEquipmentSelection("z2", evaluation)];
      })(),
    });
    const status = getReportGenerationGateStatus(data, [], new Set());
    const blocker = status.blockers.find((b) => b.code === "duct_design_incomplete" && b.detail.includes("differs from"));
    expect(blocker).toBeUndefined();
  });

  it("single_system_zoned: still blocks when the shared group's COMBINED branch CFM is actually out of tolerance", () => {
    const data = baseReportDataWithDuctDesign({
      hvacSystemConfiguration: "single_system_zoned",
      zones: [
        { id: "z1", name: "Zone 1", ahu_label: null },
        { id: "z2", name: "Zone 2 - Upstairs AHU", ahu_label: "AHU-2" },
      ],
      ductRuns: [
        ductRun({ id: "run1", zone_id: "z1", room_id: "r1" }),
        ductRun({ id: "run2", zone_id: "z2", room_id: "r2" }),
      ],
      ductSchedule: [
        { runId: "run1", cfm: 300, frictionRate: 0.08, ductShape: "round", diameterIn: 8, widthIn: null, heightIn: null, velocityFpm: 900, velocityWarning: null, exceedsTableRange: false },
        { runId: "run2", cfm: 200, frictionRate: 0.08, ductShape: "round", diameterIn: 6, widthIn: null, heightIn: null, velocityFpm: 900, velocityWarning: null, exceedsTableRange: false },
      ],
      zoneEquipment: (() => {
        const evaluation = equipmentEvaluation("eq1", 1400);
        return [zoneEquipmentSelection("z1", evaluation), zoneEquipmentSelection("z2", evaluation)];
      })(),
    });
    const status = getReportGenerationGateStatus(data, [], new Set());
    const blocker = status.blockers.find((b) => b.code === "duct_design_incomplete" && b.detail.includes("combined total branch duct CFM"));
    expect(blocker).toBeDefined();
    expect(blocker?.detail).toContain("Zone 1 + Zone 2 - Upstairs AHU");
  });
});
