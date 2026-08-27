// Direct unit tests for lib/installPackage.ts - the Recommended Install
// Package generator (Catalog Expansion spec, Section 5). Uses the real
// Daikin DZ4SEA3610A/AMST36CU1400A pairing already seeded in
// supabase/migrations/20260827090000/100000 as representative real
// equipment shapes (ids are placeholders here since this is a pure-
// function unit test, not a DB test - the real ids are exercised by the
// scratch live-verification script against Schneider, not here).
import { describe, it, expect } from "vitest";
import { computeInstallPackage, requiredHeatKitKw, type InstallPackageInputs } from "../installPackage";
import type { EquipmentCatalogEntry } from "../manualS";

const outdoorUnit: EquipmentCatalogEntry = {
  id: "outdoor-1",
  manufacturer: "Daikin",
  modelNumber: "DZ4SEA3610A",
  equipmentType: "heat_pump",
  stageType: "single",
  nominalCoolingCapacityBtu: 36000,
  nominalHeatingCapacityBtu: 36000,
  ratedCfm: 1150,
  sourceDocument: "SS-DZ4SE",
};

const indoorUnit: EquipmentCatalogEntry = {
  id: "indoor-1",
  manufacturer: "Daikin",
  modelNumber: "AMST36CU1400A",
  equipmentType: "coil",
  stageType: "single",
  nominalCoolingCapacityBtu: 36000,
  nominalHeatingCapacityBtu: null,
  ratedCfm: 1150,
  sourceDocument: "SS-DZ4SE",
};

function baseInputs(overrides: Partial<InstallPackageInputs> = {}): InstallPackageInputs {
  return {
    zoneId: "zone-1",
    zoneName: "Zone 1",
    outdoorUnit,
    indoorUnit,
    coilMatchIndoorUnitIds: [indoorUnit.id],
    electricalSpecByEquipmentId: new Map([
      [outdoorUnit.id, { equipmentId: outdoorUnit.id, voltagePhase: "208/230/1", minCircuitAmpacity: 21, maxOvercurrentProtection: 35 }],
    ]),
    linesetSpecByEquipmentId: new Map([
      [outdoorUnit.id, { equipmentId: outdoorUnit.id, liquidLineDiameterIn: 0.375, vaporLineDiameterIn: 0.875, maxEquivalentLengthFt: null, lengthDerateNotes: null }],
    ]),
    heatKitOptionsForIndoorUnit: [],
    filterSpecByEquipmentId: new Map(),
    supplementalHeatDeficitBtuh: null,
    requiredCfm: 1150,
    lineSetLengthFt: null,
    diffusers: [],
    ductMaterialDefault: null,
    terminations: [],
    ...overrides,
  };
}

describe("requiredHeatKitKw", () => {
  it("converts a real Btu/h deficit to kW at the standard 3412 Btu/h per kW", () => {
    expect(requiredHeatKitKw(3412)).toBe(1);
    expect(requiredHeatKitKw(17060)).toBe(5);
  });
});

describe("computeInstallPackage - coil matching (step 1)", () => {
  it("resolves a real certified pairing", () => {
    const pkg = computeInstallPackage(baseInputs());
    const item = pkg.lineItems.find((l) => l.category === "coil_matching")!;
    expect(item.status).toBe("resolved");
    expect(pkg.uncertifiedPairing).toBe(false);
  });

  it("flags an uncertified pairing as a hard flag, not silently passed", () => {
    const pkg = computeInstallPackage(baseInputs({ coilMatchIndoorUnitIds: [] }));
    const item = pkg.lineItems.find((l) => l.category === "coil_matching")!;
    expect(item.status).toBe("flagged");
    expect(pkg.uncertifiedPairing).toBe(true);
  });

  it("reports unresolved when either unit isn't selected yet", () => {
    const pkg = computeInstallPackage(baseInputs({ indoorUnit: null }));
    const item = pkg.lineItems.find((l) => l.category === "coil_matching")!;
    expect(item.status).toBe("unresolved");
  });
});

describe("computeInstallPackage - refrigerant lineset (step 3)", () => {
  it("is unresolved when the real run length isn't known yet (no condenser pin)", () => {
    const pkg = computeInstallPackage(baseInputs({ lineSetLengthFt: null }));
    const item = pkg.lineItems.find((l) => l.category === "refrigerant_lineset")!;
    expect(item.status).toBe("unresolved");
  });

  it("resolves when the real run length is within the manufacturer's max", () => {
    const pkg = computeInstallPackage(
      baseInputs({
        lineSetLengthFt: 40,
        linesetSpecByEquipmentId: new Map([
          [outdoorUnit.id, { equipmentId: outdoorUnit.id, liquidLineDiameterIn: 0.375, vaporLineDiameterIn: 0.875, maxEquivalentLengthFt: 80, lengthDerateNotes: null }],
        ]),
      }),
    );
    const item = pkg.lineItems.find((l) => l.category === "refrigerant_lineset")!;
    expect(item.status).toBe("resolved");
  });

  it("flags a real run length that exceeds the manufacturer's real max", () => {
    const pkg = computeInstallPackage(
      baseInputs({
        lineSetLengthFt: 95,
        linesetSpecByEquipmentId: new Map([
          [outdoorUnit.id, { equipmentId: outdoorUnit.id, liquidLineDiameterIn: 0.375, vaporLineDiameterIn: 0.875, maxEquivalentLengthFt: 80, lengthDerateNotes: "Real derate note" }],
        ]),
      }),
    );
    const item = pkg.lineItems.find((l) => l.category === "refrigerant_lineset")!;
    expect(item.status).toBe("flagged");
    expect(item.detail).toBe("Real derate note");
  });
});

describe("computeInstallPackage - heat kit (step 4)", () => {
  it("does not add a heat-kit line item when no supplemental heat is needed", () => {
    const pkg = computeInstallPackage(baseInputs({ supplementalHeatDeficitBtuh: null }));
    expect(pkg.lineItems.find((l) => l.category === "heat_kit")).toBeUndefined();
  });

  it("selects the smallest real heat kit that covers the real deficit and its own minimum airflow", () => {
    const pkg = computeInstallPackage(
      baseInputs({
        supplementalHeatDeficitBtuh: 15000,
        requiredCfm: 1150,
        heatKitOptionsForIndoorUnit: [
          { equipmentId: indoorUnit.id, heatKitKw: 3, heatKitModel: "3kW", minimumAirflowCfm: null },
          { equipmentId: indoorUnit.id, heatKitKw: 5, heatKitModel: "5kW", minimumAirflowCfm: 800 },
          { equipmentId: indoorUnit.id, heatKitKw: 10, heatKitModel: "10kW", minimumAirflowCfm: 2000 },
        ],
      }),
    );
    const item = pkg.lineItems.find((l) => l.category === "heat_kit")!;
    // 15000 Btu/h needs >= 4.4kW - the 3kW kit doesn't cover it even
    // though its airflow requirement is trivially met; the 5kW kit does
    // and its 800cfm minimum is met by the real 1150cfm available; the
    // 10kW kit's 2000cfm minimum is NOT met by 1150cfm, so it must not
    // be chosen even though it's real and covers the deficit.
    expect(item.status).toBe("resolved");
    expect(item.summary).toContain("5kW");
  });

  it("is unresolved when no cataloged kit meets both the real deficit and its own minimum airflow", () => {
    const pkg = computeInstallPackage(
      baseInputs({
        supplementalHeatDeficitBtuh: 15000,
        requiredCfm: 500,
        heatKitOptionsForIndoorUnit: [{ equipmentId: indoorUnit.id, heatKitKw: 5, heatKitModel: "5kW", minimumAirflowCfm: 800 }],
      }),
    );
    const item = pkg.lineItems.find((l) => l.category === "heat_kit")!;
    expect(item.status).toBe("unresolved");
  });
});

describe("computeInstallPackage - completeness score (step 8)", () => {
  it("counts a flagged item as incomplete, same as unresolved - never a clean-looking score with a real flag present", () => {
    const pkg = computeInstallPackage(baseInputs({ coilMatchIndoorUnitIds: [] }));
    const flaggedItem = pkg.lineItems.find((l) => l.category === "coil_matching")!;
    expect(flaggedItem.status).toBe("flagged");
    expect(pkg.completenessPercent).toBeLessThan(100);
  });

  it("reaches 100% only when every real line item resolves cleanly", () => {
    const pkg = computeInstallPackage(
      baseInputs({
        lineSetLengthFt: 40,
        linesetSpecByEquipmentId: new Map([
          [outdoorUnit.id, { equipmentId: outdoorUnit.id, liquidLineDiameterIn: 0.375, vaporLineDiameterIn: 0.875, maxEquivalentLengthFt: 80, lengthDerateNotes: null }],
        ]),
        electricalSpecByEquipmentId: new Map([
          [outdoorUnit.id, { equipmentId: outdoorUnit.id, voltagePhase: "208/230/1", minCircuitAmpacity: 21, maxOvercurrentProtection: 35 }],
          [indoorUnit.id, { equipmentId: indoorUnit.id, voltagePhase: "208/230", minCircuitAmpacity: 6.5, maxOvercurrentProtection: 15 }],
        ]),
        filterSpecByEquipmentId: new Map([
          [indoorUnit.id, { equipmentId: indoorUnit.id, filterFurnished: true, filterType: "media", filterSize: "16x20x1", mervRatingRecommended: "8" }],
        ]),
        ductMaterialDefault: { manufacturer: "Johns Manville", productLine: "Linacoustic R-300" },
        diffusers: [
          { id: "d1", project_id: "p1", zone_id: "zone-1", room_id: null, airflow_direction: "supply", pattern_type: "four_way", duct_size: null, round_diameter_in: 6, cfm: 100, mounting_height_aff_in: null, manufacturer: null, model: null, description: null, position_x_norm: null, position_y_norm: null, position_source_drawing_id: null, position_source_page_number: null, source: "manual" },
        ],
        terminations: [
          { id: "t1", project_id: "p1", zone_id: "zone-1", termination_type: "condensate_discharge", duct_size: null, hood_manufacturer: null, hood_model: null, screen_or_backdraft_spec: null, position_x_norm: null, position_y_norm: null, position_source_drawing_id: null, position_source_page_number: null },
        ],
      }),
    );
    expect(pkg.completenessPercent).toBe(100);
    expect(pkg.lineItems.every((l) => l.status === "resolved")).toBe(true);
  });
});
