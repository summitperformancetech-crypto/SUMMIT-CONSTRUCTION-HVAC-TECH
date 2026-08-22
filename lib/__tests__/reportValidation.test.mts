// SUMMIT-REPORT-STANDARD.md Section 6: "Implement this as a standalone
// validateReportTotals(project) function, unit-tested against the Vivian
// Street numbers (including the deliberately-seeded latent discrepancy)
// so the bug it caught can never regress silently." This project has no
// test runner configured (no jest/vitest anywhere in package.json) - run
// directly with `npx tsx lib/__tests__/reportValidation.test.mts`. Kept
// as a permanent, checked-in file (not a scratch script deleted after
// use, unlike most ad hoc verification elsewhere in this codebase's
// history) specifically because the standard calls out persistence as
// the point - Case 2 below is the actual historical bug, not a
// hypothetical.
import { validateReportTotals, computeRequiredTonnage } from "../reportValidation";
import type { ReportData } from "../reportData";
import type { RoomLoadResult, ZoneLoadResult, WholeHouseLoadResult } from "../manualJ";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(cond ? "PASS" : "FAIL", label, cond ? "" : detail ?? "");
  if (cond) pass++;
  else fail++;
}

function room(overrides: Partial<RoomLoadResult>): RoomLoadResult {
  return {
    roomId: "r1",
    roomName: "Room",
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
    ...overrides,
  };
}

function zone(overrides: Partial<ZoneLoadResult>): ZoneLoadResult {
  return {
    zoneId: "z1",
    zoneName: "Zone",
    heatingBtuh: 0,
    coolingSensibleBtuh: 0,
    coolingLatentBtuh: 0,
    coolingTotalBtuh: 0,
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
    ...overrides,
  };
}

function wholeHouse(overrides: Partial<WholeHouseLoadResult>): WholeHouseLoadResult {
  return {
    heatingBtuh: 0,
    coolingSensibleBtuh: 0,
    coolingLatentBtuh: 0,
    coolingTotalBtuh: 0,
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
    ...overrides,
  };
}

function baseReportData(residential: NonNullable<ReportData["residential"]>): ReportData {
  return {
    project: { id: "p1", name: "Test", project_type: "residential", address_line1: "1 Main St", address_line2: null, city: "Austin", state: "TX", zip: "78701" },
    climateZone: null,
    generatedAt: new Date().toISOString(),
    snapshot: null,
    residential,
    commercial: null,
    fieldResolutions: [],
  };
}

// --- Case 1: internally consistent data -> zero discrepancies ---
{
  const r1 = room({ roomId: "r1", heatingBtuh: 1000, coolingSensibleBtuh: 800, coolingLatentBtuh: 200, ductCoolingLatentBtuh: 20 });
  const r2 = room({ roomId: "r2", heatingBtuh: 500, coolingSensibleBtuh: 400, coolingLatentBtuh: 100, ductCoolingLatentBtuh: 10 });
  const z1 = zone({
    zoneId: "z1", zoneName: "AHU-1",
    heatingBtuh: 1500 + 50, coolingSensibleBtuh: 1200 + 30, coolingLatentBtuh: 300 + 9,
    ventilationHeatingBtuh: 50, ventilationCoolingSensibleBtuh: 30, ventilationCoolingLatentBtuh: 9,
  });
  const wh = wholeHouse({ heatingBtuh: z1.heatingBtuh, coolingSensibleBtuh: z1.coolingSensibleBtuh, coolingLatentBtuh: z1.coolingLatentBtuh });

  const data = baseReportData({
    envelope: {} as any,
    manualJ: { rooms: [r1, r2], zones: [z1], wholeHouse: wh },
    ductSchedule: [], ductRuns: [], rooms: [{ id: "r1", zone_id: "z1" } as any, { id: "r2", zone_id: "z1" } as any],
    zones: [], equipmentEvaluations: [], selectedEquipment: null, equipmentSelectionNotes: null,
    ductInsulationCompliance: [],
  });

  const result = validateReportTotals(data);
  check("consistent data passes with zero discrepancies", result.passed && result.discrepancies.length === 0,
    JSON.stringify(result.discrepancies));
}

// --- Case 2: Vivian Street - seeded whole-house latent bug (7,843 <- 5,597) ---
{
  // AHU-1: sensible 15,803 / latent 2,706 (per REFERENCE-DOCS/MJS - 4308 Vivian Street.pdf)
  const r1 = room({ roomId: "r1", heatingBtuh: 12000, coolingSensibleBtuh: 15803, coolingLatentBtuh: 2706, ductCoolingLatentBtuh: 200 });
  const z1 = zone({
    zoneId: "ahu1", zoneName: "AHU-1 (1st Floor)",
    heatingBtuh: 12000, coolingSensibleBtuh: 15803, coolingLatentBtuh: 2706,
    ventilationCfm: 24,
  });
  // AHU-2: sensible 20,954 / latent 5,137
  const r2 = room({ roomId: "r2", heatingBtuh: 16000, coolingSensibleBtuh: 20954, coolingLatentBtuh: 5137, ductCoolingLatentBtuh: 300 });
  const z2 = zone({
    zoneId: "ahu2", zoneName: "AHU-2 (2nd Floor)",
    heatingBtuh: 16000, coolingSensibleBtuh: 20954, coolingLatentBtuh: 5137,
    ventilationCfm: 60,
  });
  // Correct whole-house latent = 2706 + 5137 = 7843. Seed the historical bug:
  // the stored/reported whole-house total is 5,597 (dropped ~2,246 of
  // ventilation-latent contribution somewhere upstream of this rollup).
  const wh = wholeHouse({
    heatingBtuh: 28000,
    coolingSensibleBtuh: 15803 + 20954,
    coolingLatentBtuh: 5597, // WRONG - correct is 7843
  });

  const data = baseReportData({
    envelope: {} as any,
    manualJ: { rooms: [r1, r2], zones: [z1, z2], wholeHouse: wh },
    ductSchedule: [], ductRuns: [],
    rooms: [{ id: "r1", zone_id: "ahu1" } as any, { id: "r2", zone_id: "ahu2" } as any],
    zones: [], equipmentEvaluations: [], selectedEquipment: null, equipmentSelectionNotes: null,
    ductInsulationCompliance: [],
  });

  const result = validateReportTotals(data);
  check("Vivian Street seeded bug is caught", !result.passed, "expected passed=false");
  const wholeHouseLatentDiscrepancy = result.discrepancies.find(
    (d) => d.scope === "wholeHouse" && d.field === "coolingLatentBtuh",
  );
  check(
    "discrepancy found with corrected value 7843, stored 5597",
    wholeHouseLatentDiscrepancy?.correctedValue === 7843 && wholeHouseLatentDiscrepancy?.storedValue === 5597,
    JSON.stringify(wholeHouseLatentDiscrepancy),
  );
  // No other discrepancies should fire - zones themselves are internally
  // consistent (each zone's own rooms+ventilation sum to that zone's own
  // total); only the whole-house rollup is wrong. Zone-level ventilation
  // is 0 here deliberately so each zone's own room-sum equals its own
  // reported total exactly.
  check(
    "exactly one discrepancy (whole-house latent only)",
    result.discrepancies.length === 1,
    JSON.stringify(result.discrepancies),
  );
}

// --- Case 3: computeRequiredTonnage ---
{
  const tons = computeRequiredTonnage(36000, 0.7);
  check("computeRequiredTonnage(36000, 0.70) = 4.286 tons", Math.abs(tons - 36000 / 0.7 / 12000) < 0.001);
  const defaultTons = computeRequiredTonnage(25200);
  check("computeRequiredTonnage default SHR 0.70", Math.abs(defaultTons - 3) < 0.001, `got ${defaultTons}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
