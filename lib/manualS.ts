export type EquipmentType = "split_ac" | "heat_pump" | "furnace" | "package_unit";
export type StageType = "single" | "two_stage" | "variable_speed";

export type EquipmentCatalogEntry = {
  id: string;
  manufacturer: string;
  modelNumber: string;
  equipmentType: EquipmentType;
  stageType: StageType;
  // Reference only, never used for sizing - see lib/manualS.ts module
  // comment and the migration this table came from.
  nominalCoolingCapacityBtu: number | null;
  nominalHeatingCapacityBtu: number | null;
  ratedCfm: number | null;
  sourceDocument: string;
};

export type PerformancePoint = {
  equipmentId: string;
  mode: "cooling" | "heating";
  outdoorTempF: number;
  indoorEnteringTempF: number;
  indoorEnteringWetbulbF: number | null;
  sensibleCapacityBtu: number;
  totalCapacityBtu: number;
  inputPowerKw: number;
};

export type CapacityAtConditions = {
  totalCapacityBtu: number;
  sensibleCapacityBtu: number;
  inputPowerKw: number;
  // True when the requested condition fell outside the published data
  // range and had to be clamped to the nearest edge rather than
  // interpolated - manufacturers explicitly warn against extrapolating
  // (e.g. Carrier 24VNA6 Product Data p.17: "Extrapolation is not an
  // acceptable practice"), so this is a clamp, never a linear projection
  // past the real data.
  clamped: boolean;
};

// ACCA Manual S sizing windows, expressed as a fraction of the Manual J
// design load. Source: https://www.load-calculations.com/what-is-acca-manual-s-.html
// (an ACCA-Manual-S-focused reference), cross-checked against Manual S
// coverage in https://media.iccsafe.org/news/eNews/2009v6n8/hvac.pdf:
//   - AC (straight cooling): 95-115% of Design Total Heat Gain.
//   - Heat pump cooling: 100-125% of Design Total Heat Gain, unless a
//     larger size is dictated by the heating equipment selection.
//   - Furnace heating: 100-140% of Design Total Heat Loss.
// Heat pump heating has no simple percentage window - it's governed by
// balance point + supplemental heat instead (see computeBalancePoint /
// computeSupplementalHeatBtuh below).
export const AC_COOLING_MIN_FRACTION = 0.95;
export const AC_COOLING_MAX_FRACTION = 1.15;
export const HEAT_PUMP_COOLING_MIN_FRACTION = 1.0;
export const HEAT_PUMP_COOLING_MAX_FRACTION = 1.25;
export const FURNACE_HEATING_MIN_FRACTION = 1.0;
export const FURNACE_HEATING_MAX_FRACTION = 1.4;

function bracket(
  sortedValues: number[],
  target: number,
): { lo: number; hi: number; t: number; clamped: boolean } {
  const first = sortedValues[0];
  const last = sortedValues[sortedValues.length - 1];
  if (target <= first) return { lo: first, hi: first, t: 0, clamped: target < first };
  if (target >= last) return { lo: last, hi: last, t: 0, clamped: target > last };
  for (let i = 0; i < sortedValues.length - 1; i++) {
    const lo = sortedValues[i];
    const hi = sortedValues[i + 1];
    if (target >= lo && target <= hi) {
      return { lo, hi, t: hi === lo ? 0 : (target - lo) / (hi - lo), clamped: false };
    }
  }
  return { lo: first, hi: first, t: 0, clamped: false };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Bilinear interpolation over (outdoor temp x entering wet bulb) - the two
// dimensions manufacturer cooling capacity tables are actually keyed on
// (entering dry bulb is held fixed per published table; see e.g. the
// Goodman GSZ14 source's "IDB" column, one fixed value per table). Manual
// S requires interpolating "between the nearest outdoor-temp and
// entering-temp data points," not picking the single nearest point - this
// does that on a real rectangular grid drawn straight from the source
// tables (every outdoor-temp x wetbulb combination in the seeded data
// actually exists, so every bracket below always resolves to 4 real
// corner points).
export function interpolateCoolingCapacity(
  points: PerformancePoint[],
  outdoorTempF: number,
  enteringWetbulbF: number,
): CapacityAtConditions | null {
  const coolingPoints = points.filter((p) => p.mode === "cooling");
  if (coolingPoints.length === 0) return null;

  const xs = [...new Set(coolingPoints.map((p) => p.outdoorTempF))].sort((a, b) => a - b);
  const ys = [...new Set(coolingPoints.map((p) => p.indoorEnteringWetbulbF ?? NaN))].sort(
    (a, b) => a - b,
  );
  const x = bracket(xs, outdoorTempF);
  const y = bracket(ys, enteringWetbulbF);

  const find = (ot: number, wb: number) =>
    coolingPoints.find((p) => p.outdoorTempF === ot && p.indoorEnteringWetbulbF === wb);
  const p00 = find(x.lo, y.lo);
  const p10 = find(x.hi, y.lo);
  const p01 = find(x.lo, y.hi);
  const p11 = find(x.hi, y.hi);
  if (!p00 || !p10 || !p01 || !p11) return null;

  function bilerp(f: (p: PerformancePoint) => number): number {
    const top = lerp(f(p00!), f(p10!), x.t);
    const bottom = lerp(f(p01!), f(p11!), x.t);
    return lerp(top, bottom, y.t);
  }

  return {
    totalCapacityBtu: bilerp((p) => p.totalCapacityBtu),
    sensibleCapacityBtu: bilerp((p) => p.sensibleCapacityBtu),
    inputPowerKw: bilerp((p) => p.inputPowerKw),
    clamped: x.clamped || y.clamped,
  };
}

// Heating capacity tables are keyed on outdoor temp only (fixed indoor
// entering dry bulb per table, no wetbulb dimension - heating capacity
// doesn't depend on indoor humidity) - straight 1-D interpolation.
export function interpolateHeatingCapacity(
  points: PerformancePoint[],
  outdoorTempF: number,
): CapacityAtConditions | null {
  const heatingPoints = points.filter((p) => p.mode === "heating");
  if (heatingPoints.length === 0) return null;

  const xs = [...new Set(heatingPoints.map((p) => p.outdoorTempF))].sort((a, b) => a - b);
  const x = bracket(xs, outdoorTempF);
  const p0 = heatingPoints.find((p) => p.outdoorTempF === x.lo);
  const p1 = heatingPoints.find((p) => p.outdoorTempF === x.hi);
  if (!p0 || !p1) return null;

  return {
    totalCapacityBtu: lerp(p0.totalCapacityBtu, p1.totalCapacityBtu, x.t),
    sensibleCapacityBtu: lerp(p0.sensibleCapacityBtu, p1.sensibleCapacityBtu, x.t),
    inputPowerKw: lerp(p0.inputPowerKw, p1.inputPowerKw, x.t),
    clamped: x.clamped,
  };
}

// The outdoor temperature at which interpolated heating capacity exactly
// equals the heating load - below it, the heat pump alone can't keep up
// and supplemental (typically electric strip) heat has to make up the
// difference. Walks the real heating curve (monotonically increasing
// capacity with outdoor temp) looking for where it crosses the constant
// load line, interpolating between the two bracketing real points rather
// than assuming a shape. Returns null if the load is met (or exceeded)
// across the entire published range - i.e. no supplemental heat is ever
// needed within the data - or if the load exceeds capacity even at the
// warmest tabulated point (equipment fundamentally undersized for
// heating; the caller's heatingPercentOfLoad/withinHeatingWindow-style
// checks should already be flagging that case).
export function computeBalancePointF(
  points: PerformancePoint[],
  heatingLoadBtuh: number,
): number | null {
  const heatingPoints = points
    .filter((p) => p.mode === "heating")
    .sort((a, b) => a.outdoorTempF - b.outdoorTempF);
  if (heatingPoints.length < 2) return null;

  for (let i = 0; i < heatingPoints.length - 1; i++) {
    const lo = heatingPoints[i];
    const hi = heatingPoints[i + 1];
    const loDeficit = lo.totalCapacityBtu - heatingLoadBtuh;
    const hiDeficit = hi.totalCapacityBtu - heatingLoadBtuh;
    if (loDeficit <= 0 && hiDeficit >= 0) {
      if (hiDeficit === loDeficit) return lo.outdoorTempF;
      const t = -loDeficit / (hiDeficit - loDeficit);
      return lerp(lo.outdoorTempF, hi.outdoorTempF, t);
    }
  }
  return null;
}

// Gap between the heating load and the heat pump's own (derated) capacity
// specifically AT DESIGN CONDITIONS - per ACCA Manual S, supplemental heat
// is sized to this gap, not to cover 100% of the load on its own (the heat
// pump keeps contributing its derated share even at design temp).
export function computeSupplementalHeatBtuh(
  points: PerformancePoint[],
  winterOutdoorDesignF: number,
  heatingLoadBtuh: number,
): number | null {
  const capacity = interpolateHeatingCapacity(points, winterOutdoorDesignF);
  if (!capacity) return null;
  return Math.max(0, heatingLoadBtuh - capacity.totalCapacityBtu);
}

export type EquipmentEvaluation = {
  equipment: EquipmentCatalogEntry;
  coolingCapacityAtDesign: CapacityAtConditions | null;
  coolingPercentOfLoad: number | null;
  withinCoolingWindow: boolean;
  heatingCapacityAtDesign: CapacityAtConditions | null;
  heatingPercentOfLoad: number | null;
  withinHeatingWindow: boolean;
  balancePointF: number | null;
  supplementalHeatBtuh: number | null;
  supplementalHeatKw: number | null;
};

export function evaluateEquipment(
  equipment: EquipmentCatalogEntry,
  performancePoints: PerformancePoint[],
  manualJCoolingTotalBtuh: number,
  manualJHeatingBtuh: number,
  summerOutdoorDesignF: number,
  summerCoincidentWetbulbF: number,
  winterOutdoorDesignF: number,
): EquipmentEvaluation {
  const coolingCapacityAtDesign = interpolateCoolingCapacity(
    performancePoints,
    summerOutdoorDesignF,
    summerCoincidentWetbulbF,
  );
  const coolingPercentOfLoad =
    coolingCapacityAtDesign && manualJCoolingTotalBtuh > 0
      ? coolingCapacityAtDesign.totalCapacityBtu / manualJCoolingTotalBtuh
      : null;
  const [coolingMin, coolingMax] =
    equipment.equipmentType === "heat_pump"
      ? [HEAT_PUMP_COOLING_MIN_FRACTION, HEAT_PUMP_COOLING_MAX_FRACTION]
      : [AC_COOLING_MIN_FRACTION, AC_COOLING_MAX_FRACTION];
  const withinCoolingWindow =
    coolingPercentOfLoad != null &&
    coolingPercentOfLoad >= coolingMin &&
    coolingPercentOfLoad <= coolingMax;

  let heatingCapacityAtDesign: CapacityAtConditions | null = null;
  let heatingPercentOfLoad: number | null = null;
  let withinHeatingWindow = false;
  let balancePointF: number | null = null;
  let supplementalHeatBtuh: number | null = null;
  let supplementalHeatKw: number | null = null;

  const hasHeatingData = performancePoints.some((p) => p.mode === "heating");
  if (hasHeatingData && manualJHeatingBtuh > 0) {
    heatingCapacityAtDesign = interpolateHeatingCapacity(performancePoints, winterOutdoorDesignF);
    heatingPercentOfLoad = heatingCapacityAtDesign
      ? heatingCapacityAtDesign.totalCapacityBtu / manualJHeatingBtuh
      : null;

    if (equipment.equipmentType === "furnace") {
      withinHeatingWindow =
        heatingPercentOfLoad != null &&
        heatingPercentOfLoad >= FURNACE_HEATING_MIN_FRACTION &&
        heatingPercentOfLoad <= FURNACE_HEATING_MAX_FRACTION;
    } else if (equipment.equipmentType === "heat_pump") {
      // No simple percentage window for heat pump heating - balance point
      // + supplemental heat is the actual ACCA Manual S methodology.
      // "Within window" here means no supplemental heat is needed at
      // design conditions (the heat pump alone covers the load).
      balancePointF = computeBalancePointF(performancePoints, manualJHeatingBtuh);
      supplementalHeatBtuh = computeSupplementalHeatBtuh(
        performancePoints,
        winterOutdoorDesignF,
        manualJHeatingBtuh,
      );
      supplementalHeatKw = supplementalHeatBtuh != null ? supplementalHeatBtuh / 3412 : null;
      withinHeatingWindow = supplementalHeatBtuh === 0;
    }
  }

  return {
    equipment,
    coolingCapacityAtDesign,
    coolingPercentOfLoad,
    withinCoolingWindow,
    heatingCapacityAtDesign,
    heatingPercentOfLoad,
    withinHeatingWindow,
    balancePointF,
    supplementalHeatBtuh,
    supplementalHeatKw,
  };
}

// Ranked by closeness to a "just right" cooling match (100% of load) -
// equipment outside the ACCA window still appears (so a tech can see why
// it was excluded and, per the required-reason override workflow, choose
// it anyway) but sorts after every equipment that's actually in-window.
export function rankEquipment(evaluations: EquipmentEvaluation[]): EquipmentEvaluation[] {
  return [...evaluations].sort((a, b) => {
    if (a.withinCoolingWindow !== b.withinCoolingWindow) {
      return a.withinCoolingWindow ? -1 : 1;
    }
    const aDist = a.coolingPercentOfLoad != null ? Math.abs(a.coolingPercentOfLoad - 1) : Infinity;
    const bDist = b.coolingPercentOfLoad != null ? Math.abs(b.coolingPercentOfLoad - 1) : Infinity;
    return aDist - bDist;
  });
}
