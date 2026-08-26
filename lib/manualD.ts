import type { RoomLoadResult } from "./manualJ";

// Data Integrity Addendum, Section 3 - a new Manual D COMPLIANCE check
// (insulation R-value vs. current code minimum), deliberately separate
// from sizeDuctRun/computeManualD above: duct sizing (diameter/friction
// rate) math is pure aerodynamics and is unaffected by insulation R-value,
// so it needs no change. This only flags a run whose associated room has
// BOTH a specified duct_insulation_r_value AND a location with a known
// code minimum, and the former is below the latter - a room with no
// entered R-value yet is "not specified", not "non-compliant", so it's
// never flagged (same "null means no data, don't guess" convention
// ductRScaleFactor in lib/manualJ.ts already uses). Trunk runs (and any
// branch run with no room_id) have no single room to resolve a
// location/R-value from - this app's schema doesn't model per-trunk-run
// insulation, so trunk runs are always skipped, never flagged.
export type DuctInsulationComplianceResult = {
  runId: string;
  belowCodeMinimum: boolean;
  minRValue: number | null;
  actualRValue: number | null;
};

export function checkDuctInsulationCompliance(
  ductRuns: DuctRunInput[],
  roomsById: ReadonlyMap<string, { duct_location: string | null; duct_insulation_r_value: number | null }>,
  codeMinimumsByLocation: ReadonlyMap<string, number>,
): Map<string, DuctInsulationComplianceResult> {
  const result = new Map<string, DuctInsulationComplianceResult>();
  for (const run of ductRuns) {
    if (run.runType !== "branch" || !run.roomId) continue;
    const room = roomsById.get(run.roomId);
    const location = room?.duct_location ?? null;
    const actualRValue = room?.duct_insulation_r_value ?? null;
    const minRValue = location != null ? (codeMinimumsByLocation.get(location) ?? null) : null;
    const belowCodeMinimum = actualRValue != null && minRValue != null && actualRValue < minRValue;
    result.set(run.id, { runId: run.id, belowCodeMinimum, minRValue, actualRValue });
  }
  return result;
}

export type DuctSizingTableRow = {
  frictionRate: number;
  diameterIn: number;
  cfm: number;
  velocityFpm: number;
};

export type DuctRunInput = {
  id: string;
  zoneId: string | null;
  runType: "trunk" | "branch";
  roomId: string | null;
  lengthFt: number;
  fittingEquivalentLengthFt: number;
  ductShape: "round" | "rectangular";
  // Rectangular-only: a tech-chosen target height, typically constrained by
  // the framing cavity the duct has to fit in. Width is then solved for via
  // the Huebscher equivalent-diameter equation so the run carries the same
  // CFM at the same friction rate as the round-duct result. Ignored for
  // round runs.
  targetHeightIn: number | null;
};

export type DuctSizingResult = {
  runId: string;
  cfm: number;
  // The friction rate actually used - snapped to the nearest rate tabulated
  // in duct_sizing_tables (see lib/constants below), not necessarily the
  // zone's raw computed value.
  frictionRate: number;
  ductShape: "round" | "rectangular";
  diameterIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  velocityFpm: number;
  velocityWarning: string | null;
  // Set when required CFM exceeds every duct size in the reference table at
  // this friction rate - the largest tabulated size is returned anyway
  // (best available), flagged so a tech knows to add a parallel run or
  // increase static pressure budget rather than trusting an undersized
  // number silently.
  exceedsTableRange: boolean;
  // Permit-package auditable trail (Section 3): length_ft +
  // fitting_equivalent_length_ft, and this run's own real pressure drop
  // at the friction rate actually used (frictionRate * totalEffectiveLengthFt
  // / 100) - not a new calculation, just the same two numbers every other
  // field on this result already depends on, surfaced and persisted so a
  // reviewer can see the full chain per segment rather than only the
  // final diameter.
  totalEffectiveLengthFt: number;
  pressureDropIwc: number;
};

// ACCA Manual D's noise-driven velocity guidance (also independently
// corroborated by ASHRAE-derived duct design references, e.g. CED
// Engineering's "HVAC - How to Size and Design Ducts" M06-048, which gives
// this exact pair twice: "the air velocity in the main duct should be
// limited to 1,500 fpm and the velocity through the branch ducts should be
// less than 800 fpm"). Applied here as trunk/branch respectively.
export const TRUNK_MAX_VELOCITY_FPM = 1500;
export const BRANCH_MAX_VELOCITY_FPM = 800;

// ACCA Manual D - Available Static Pressure (ASP). Ported from a reference
// acca_airflow_sizing.py the user supplied (2026-08-25) - same formula,
// adapted to this file's null/error-return convention (this app never
// throws on user-input validation, see settingsError in
// duct-design-section.tsx) instead of raising exceptions.
//
// ASP = TESP - (evaporator coil + air filter + grilles/registers losses).
// TESP is the selected equipment's blower-rated total external static
// pressure at the design CFM, from its own OEM spec/installation data -
// never a generic 0.5" assumption when real OEM data exists. Device
// losses are per-installation, user-supplied values (they vary by model
// and airflow), never hardcoded. ASP is the residual pressure budget left
// for the ductwork itself - the figure computeZoneFrictionRates above
// actually uses to derive friction rate.
export type DevicePressureLosses = {
  evaporatorCoilIwc: number;
  airFilterIwc: number;
  grillesRegistersIwc: number;
};

// -----------------------------------------------------------------------
// Permit-Submittable Manual D Package, Section 5 - ESP vs. equipment
// rated capacity. Real per-model airflow-vs-external-static-pressure data
// (equipment_blower_performance table, e.g. Goodman SS-GAVPTC's own
// published "Airflow Data" table) - linear interpolation over ESP within
// one speed tap, the correct method for a manufacturer curve sampled at
// discrete pressure points (same "real points, interpolate between them,
// never extrapolate past the table" principle as interpolateCoolingCapacity
// in lib/manualS.ts, just 1-D here since speed tap is a discrete field
// selection, not an interpolation axis).
// -----------------------------------------------------------------------
export type BlowerPerformancePoint = {
  equipmentId: string;
  speedTap: string;
  espIwc: number;
  cfm: number;
};

export function interpolateBlowerCfmAtEsp(
  points: BlowerPerformancePoint[],
  speedTap: string,
  espIwc: number,
): number | null {
  const tapPoints = points.filter((p) => p.speedTap === speedTap).sort((a, b) => a.espIwc - b.espIwc);
  if (tapPoints.length === 0) return null;
  if (espIwc <= tapPoints[0].espIwc) return tapPoints[0].cfm;
  if (espIwc >= tapPoints[tapPoints.length - 1].espIwc) return tapPoints[tapPoints.length - 1].cfm;
  for (let i = 0; i < tapPoints.length - 1; i++) {
    const lo = tapPoints[i];
    const hi = tapPoints[i + 1];
    if (espIwc >= lo.espIwc && espIwc <= hi.espIwc) {
      const t = hi.espIwc === lo.espIwc ? 0 : (espIwc - lo.espIwc) / (hi.espIwc - lo.espIwc);
      return lo.cfm + (hi.cfm - lo.cfm) * t;
    }
  }
  return null;
}

// Picks the real speed tap whose mid-pressure (0.5 iwc, a representative
// residential design-ESP point) airflow is closest to the zone's required
// CFM - the same "adjust the speed tap to match installation
// requirements" selection the manufacturer's own install literature
// describes an installer doing by hand (see Goodman AVPTC installation
// instructions p.14). An automated stand-in for that real field step, not
// a fabricated rating.
export function selectBlowerSpeedTap(points: BlowerPerformancePoint[], requiredCfm: number): string | null {
  const taps = [...new Set(points.map((p) => p.speedTap))];
  if (taps.length === 0) return null;
  let best: { tap: string; diff: number } | null = null;
  for (const tap of taps) {
    const cfmAtMidEsp = interpolateBlowerCfmAtEsp(points, tap, 0.5);
    if (cfmAtMidEsp == null) continue;
    const diff = Math.abs(cfmAtMidEsp - requiredCfm);
    if (best == null || diff < best.diff) best = { tap, diff };
  }
  return best?.tap ?? null;
}

export const ESP_GATE_SAFETY_FACTOR_PERCENT = 12.5;

export type EspCapacityCheckResult = {
  determinable: boolean;
  requiredCfm: number;
  requiredCfmWithSafetyFactor: number;
  blowerTespIwc: number | null;
  speedTap: string | null;
  deliverableCfmAtTesp: number | null;
  safetyFactorPercent: number;
  passes: boolean | null;
};

// Real gate, not a checkbox: confirms the SELECTED air handler's own
// published blower curve can actually deliver the zone's required
// airflow at the project's assumed TESP, with a safety margin applied to
// the required CFM side (per the user's own stated 10-15% range -
// 12.5%, the midpoint, used as a single disclosed constant rather than a
// second undocumented input). Genuinely not determinable (never a
// fabricated pass) until a zone has both a selected air handler with
// real blower_performance rows AND a project blower_tesp_iwc value.
export function checkEspVsEquipmentCapacity(
  requiredCfm: number,
  blowerTespIwc: number | null,
  blowerPoints: BlowerPerformancePoint[],
): EspCapacityCheckResult {
  const requiredCfmWithSafetyFactor = requiredCfm * (1 + ESP_GATE_SAFETY_FACTOR_PERCENT / 100);
  const speedTap = selectBlowerSpeedTap(blowerPoints, requiredCfm);

  if (blowerTespIwc == null || speedTap == null) {
    return {
      determinable: false,
      requiredCfm,
      requiredCfmWithSafetyFactor,
      blowerTespIwc,
      speedTap,
      deliverableCfmAtTesp: null,
      safetyFactorPercent: ESP_GATE_SAFETY_FACTOR_PERCENT,
      passes: null,
    };
  }

  const deliverableCfmAtTesp = interpolateBlowerCfmAtEsp(blowerPoints, speedTap, blowerTespIwc);
  return {
    determinable: deliverableCfmAtTesp != null,
    requiredCfm,
    requiredCfmWithSafetyFactor,
    blowerTespIwc,
    speedTap,
    deliverableCfmAtTesp,
    safetyFactorPercent: ESP_GATE_SAFETY_FACTOR_PERCENT,
    passes: deliverableCfmAtTesp != null ? deliverableCfmAtTesp >= requiredCfmWithSafetyFactor : null,
  };
}

export type AvailableStaticPressureResult = {
  availableStaticPressureIwc: number | null;
  totalDeviceLossesIwc: number;
  error: string | null;
};

export function computeAvailableStaticPressure(
  totalExternalStaticPressureIwc: number,
  deviceLosses: DevicePressureLosses,
): AvailableStaticPressureResult {
  const totalDeviceLossesIwc =
    deviceLosses.evaporatorCoilIwc + deviceLosses.airFilterIwc + deviceLosses.grillesRegistersIwc;

  if (totalExternalStaticPressureIwc <= 0) {
    return {
      availableStaticPressureIwc: null,
      totalDeviceLossesIwc,
      error: "Total external static pressure must be greater than zero.",
    };
  }
  if (totalDeviceLossesIwc >= totalExternalStaticPressureIwc) {
    return {
      availableStaticPressureIwc: null,
      totalDeviceLossesIwc,
      error: `Device losses (${totalDeviceLossesIwc.toFixed(3)}" w.c.) meet or exceed total external static pressure (${totalExternalStaticPressureIwc.toFixed(3)}" w.c.) - this indicates a data error (wrong TESP for this unit, or losses pulled at the wrong CFM), not a valid design.`,
    };
  }
  return {
    availableStaticPressureIwc: Math.round((totalExternalStaticPressureIwc - totalDeviceLossesIwc) * 10000) / 10000,
    totalDeviceLossesIwc,
    error: null,
  };
}

// ACCA Manual J/S - Supply Air Temperature (SAT) rule-of-thumb estimates
// (20F cooling split, 30F heat pump / 50F furnace heating rise). These are
// ACCA-standard defaults for CFM sizing used when the selected equipment's
// OEM extended performance data doesn't publish an actual leaving air
// temperature at design conditions - which is the case for every unit
// currently in equipment_catalog (see PerformancePoint in lib/manualS.ts:
// capacity and input power are tracked per condition, leaving air temp is
// not). Real OEM LAT should supersede this estimate once that data is
// sourced for a given unit, same "estimate until real data exists"
// convention as ductRScaleFactor's code-minimum fallback in manualJ.ts.
export type SatHeatingSystemType = "heat_pump" | "furnace";

export function estimateCoolingSupplyAirTempF(indoorCoolingDesignTempF: number): number {
  return Math.round((indoorCoolingDesignTempF - 20) * 100) / 100;
}

export function estimateHeatingSupplyAirTempF(
  indoorHeatingDesignTempF: number,
  heatingSystemType: SatHeatingSystemType,
): number {
  const rise = heatingSystemType === "heat_pump" ? 30 : 50;
  return Math.round((indoorHeatingDesignTempF + rise) * 100) / 100;
}

// Room sensible cooling load -> required supply CFM, via the standard
// sensible heat equation solved for airflow: Btuh = 1.08 * cfm * deltaT.
// deltaT is supply air temp below the room's own indoor design cooling
// temp - the room can't be cooled by air that isn't colder than its target
// temperature, so a non-positive deltaT has no valid answer (returns null
// rather than a negative/Infinite CFM).
export function computeRequiredCfm(
  coolingSensibleBtuh: number,
  supplyAirTempF: number,
  roomIndoorCoolingTempF: number,
): number | null {
  const deltaT = roomIndoorCoolingTempF - supplyAirTempF;
  if (deltaT <= 0) return null;
  return coolingSensibleBtuh / (1.08 * deltaT);
}

export function computeRequiredCfmForRooms(
  roomResults: RoomLoadResult[],
  supplyAirTempF: number | null,
  roomIndoorCoolingTempF: number,
): Map<string, number | null> {
  const result = new Map<string, number | null>();
  for (const room of roomResults) {
    result.set(
      room.roomId,
      supplyAirTempF == null
        ? null
        : computeRequiredCfm(room.coolingSensibleBtuh, supplyAirTempF, roomIndoorCoolingTempF),
    );
  }
  return result;
}

// Equal-friction method: one friction rate applies to every run in a given
// zone/system, derived from that zone's longest (most resistant) path -
// see lib/constants comment in the migration for why total effective
// length is length_ft + fitting_equivalent_length_ft summed per run, then
// maxed across the zone rather than summed across runs (a zone's runs are
// parallel paths off the trunk, not one continuous length).
export function computeZoneFrictionRates(
  ductRuns: DuctRunInput[],
  availableStaticPressureIwc: number | null,
): Map<string | null, number | null> {
  const result = new Map<string | null, number | null>();
  if (availableStaticPressureIwc == null || availableStaticPressureIwc <= 0) {
    for (const run of ductRuns) result.set(run.zoneId, null);
    return result;
  }

  const longestByZone = new Map<string | null, number>();
  for (const run of ductRuns) {
    const effectiveLength = run.lengthFt + run.fittingEquivalentLengthFt;
    const current = longestByZone.get(run.zoneId) ?? 0;
    if (effectiveLength > current) longestByZone.set(run.zoneId, effectiveLength);
  }

  for (const [zoneId, longestFt] of longestByZone) {
    result.set(
      zoneId,
      longestFt > 0 ? availableStaticPressureIwc / (longestFt / 100) : null,
    );
  }
  return result;
}

function nearestTabulatedFrictionRate(target: number, table: DuctSizingTableRow[]): number {
  const rates = [...new Set(table.map((r) => r.frictionRate))];
  return rates.reduce((closest, rate) =>
    Math.abs(rate - target) < Math.abs(closest - target) ? rate : closest,
  );
}

function lookupRoundDuct(
  cfm: number,
  targetFrictionRate: number,
  table: DuctSizingTableRow[],
): { row: DuctSizingTableRow; exceedsTableRange: boolean } {
  const frictionRate = nearestTabulatedFrictionRate(targetFrictionRate, table);
  const rows = table
    .filter((r) => r.frictionRate === frictionRate)
    .sort((a, b) => a.diameterIn - b.diameterIn);

  const fit = rows.find((r) => r.cfm >= cfm);
  if (fit) return { row: fit, exceedsTableRange: false };

  // Nothing in the table carries this much air at this friction rate -
  // return the largest available size rather than nothing, flagged.
  const largest = rows[rows.length - 1];
  return { row: largest, exceedsTableRange: true };
}

// Huebscher (1948) equivalent-diameter equation, the ASHRAE-standard
// rectangular/round duct equivalence - see migration
// 20260811014540_add_manual_d.sql for the cross-checked derivation.
// De = 1.30 * (a*b)^0.625 / (a+b)^0.25
function huebscherEquivalentDiameter(widthIn: number, heightIn: number): number {
  return (1.3 * Math.pow(widthIn * heightIn, 0.625)) / Math.pow(widthIn + heightIn, 0.25);
}

// Solves for the rectangular width that reproduces a target equivalent
// diameter at a fixed height, via bisection - huebscherEquivalentDiameter
// is monotonically increasing in width for a fixed height, so this always
// converges. Widths are bounded to a generous 1-300in range; a target this
// function can't reach within that range (implausible for any real
// residential/light-commercial duct) returns the range's upper bound.
function solveRectangularWidth(targetDiameterIn: number, heightIn: number): number {
  let lo = 1;
  let hi = 300;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const de = huebscherEquivalentDiameter(mid, heightIn);
    if (de < targetDiameterIn) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function sizeDuctRun(
  run: DuctRunInput,
  cfm: number,
  zoneFrictionRate: number,
  table: DuctSizingTableRow[],
): DuctSizingResult {
  const { row, exceedsTableRange } = lookupRoundDuct(cfm, zoneFrictionRate, table);
  const maxVelocity = run.runType === "trunk" ? TRUNK_MAX_VELOCITY_FPM : BRANCH_MAX_VELOCITY_FPM;

  let diameterIn: number | null = row.diameterIn;
  let widthIn: number | null = null;
  let heightIn: number | null = null;
  let velocityFpm = row.velocityFpm;

  if (run.ductShape === "rectangular") {
    // Fall back to a reasonable default height (8in, a common duct-cavity
    // constraint) if the tech hasn't specified one yet, so a run still
    // gets a usable preview size before every field is filled in.
    heightIn = run.targetHeightIn ?? 8;
    widthIn = solveRectangularWidth(row.diameterIn, heightIn);
    diameterIn = null;
    const areaSqft = (widthIn * heightIn) / 144;
    velocityFpm = cfm / areaSqft;
  }

  const velocityWarning =
    velocityFpm > maxVelocity
      ? `${Math.round(velocityFpm)} fpm exceeds the ${maxVelocity} fpm ${run.runType} limit`
      : null;

  const totalEffectiveLengthFt = run.lengthFt + run.fittingEquivalentLengthFt;

  return {
    runId: run.id,
    cfm,
    frictionRate: row.frictionRate,
    ductShape: run.ductShape,
    diameterIn,
    widthIn,
    heightIn,
    velocityFpm,
    velocityWarning,
    exceedsTableRange,
    totalEffectiveLengthFt,
    // row.frictionRate (iwc per 100ft) is the ACTUAL tabulated rate used
    // to size this run - not the zone's raw target rate - so the
    // pressure drop reported here is the real number this run's own
    // diameter was sized to deliver, not a target that got rounded away.
    pressureDropIwc: (row.frictionRate * totalEffectiveLengthFt) / 100,
  };
}

// Full duct schedule for a project: one result per run. A branch run's CFM
// is its target room's required_cfm; a trunk run's CFM is the sum of every
// branch's required_cfm in the same zone (this app models one trunk per
// zone feeding that zone's branches, not a multi-level trunk/sub-trunk
// hierarchy - flagged here rather than silently assuming a topology this
// schema doesn't actually capture).
export function computeManualD(
  ductRuns: DuctRunInput[],
  requiredCfmByRoom: Map<string, number | null>,
  availableStaticPressureIwc: number | null,
  table: DuctSizingTableRow[],
): DuctSizingResult[] {
  const frictionRateByZone = computeZoneFrictionRates(ductRuns, availableStaticPressureIwc);

  const branchCfmByZone = new Map<string | null, number>();
  for (const run of ductRuns) {
    if (run.runType !== "branch" || !run.roomId) continue;
    const cfm = requiredCfmByRoom.get(run.roomId) ?? 0;
    branchCfmByZone.set(run.zoneId, (branchCfmByZone.get(run.zoneId) ?? 0) + (cfm ?? 0));
  }

  const results: DuctSizingResult[] = [];
  for (const run of ductRuns) {
    const frictionRate = frictionRateByZone.get(run.zoneId);
    if (frictionRate == null || table.length === 0) continue;

    const cfm =
      run.runType === "trunk"
        ? (branchCfmByZone.get(run.zoneId) ?? 0)
        : run.roomId
          ? (requiredCfmByRoom.get(run.roomId) ?? 0)
          : 0;
    if (cfm <= 0) continue;

    results.push(sizeDuctRun(run, cfm, frictionRate, table));
  }
  return results;
}
