import type { RoomLoadResult } from "./manualJ";

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
};

// ACCA Manual D's noise-driven velocity guidance (also independently
// corroborated by ASHRAE-derived duct design references, e.g. CED
// Engineering's "HVAC - How to Size and Design Ducts" M06-048, which gives
// this exact pair twice: "the air velocity in the main duct should be
// limited to 1,500 fpm and the velocity through the branch ducts should be
// less than 800 fpm"). Applied here as trunk/branch respectively.
export const TRUNK_MAX_VELOCITY_FPM = 1500;
export const BRANCH_MAX_VELOCITY_FPM = 800;

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
