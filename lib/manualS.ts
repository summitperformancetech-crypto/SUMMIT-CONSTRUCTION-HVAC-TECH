// air_handler: a real equipment_catalog entry type with no independent
// cooling/heating capacity of its own - selectable per zone for the
// Permit-Submittable Manual D Package's ESP-vs-capacity gate (see
// lib/manualD.ts's checkEspVsEquipmentCapacity), explicitly excluded
// from rankEquipment's candidate pool wherever that pool is built.
//
// coil: same non-capacity-bearing treatment, same exclusion - a cased
// coil's real capacity only exists as part of a certified outdoor-unit +
// coil COMBINATION (see equipment_coil_matching), never as a standalone
// rating.
export type EquipmentType = "split_ac" | "heat_pump" | "furnace" | "package_unit" | "air_handler" | "coil";
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
  // 0-1 (render as a percent). Only ever computed for equipment that
  // already passed the hard ACCA sizing-window gate (see isCompatible
  // below) - this is a "how good is this compatible match" score, not a
  // second opinion on compatibility itself. null for equipment that failed
  // the gate; those never reach the UI anyway (filterCompatible below
  // drops them before scoring is even useful).
  compatibilityScore: number | null;
};

// Equipment must clear the ACCA sizing window (see AC/HEAT_PUMP/FURNACE_*
// _FRACTION above) before it is "compatible" at all - this is a hard gate,
// not an input a low score can override. AC/heat_pump/package_unit are
// gated on the cooling window (they're primarily cooling equipment,
// selected first on cooling capacity); furnace is gated on the heating
// window. Heat pump heating deliberately has NO hard gate here - per ACCA
// Manual S, a heat pump needing supplemental/strip heat below its balance
// point is expected, normal design in most US climates, not a
// disqualification (see computeBalancePointF/computeSupplementalHeatBtuh).
export function isCompatible(evaluation: {
  equipment: EquipmentCatalogEntry;
  withinCoolingWindow: boolean;
  withinHeatingWindow: boolean;
}): boolean {
  if (evaluation.equipment.equipmentType === "furnace") {
    return evaluation.withinHeatingWindow;
  }
  return evaluation.withinCoolingWindow;
}

// More modulation stages give better part-load comfort, humidity control,
// and cycling behavior - a well-established residential HVAC design
// preference (and part of why ACCA's own current Manual S addendum treats
// variable-capacity equipment's low-stage behavior as a real sizing
// factor - see the 80%-of-heat-loss minimum-stage rule referenced in this
// module's ACCA sizing window comment above). Not itself an ACCA
// pass/fail limit, just a scoring input, so expressed as a soft 0-1 scale
// rather than a gate.
const STAGE_TYPE_SCORE: Record<StageType, number> = {
  single: 0.6,
  two_stage: 0.85,
  variable_speed: 1.0,
};

// Compatibility score (0-1, rendered as a percent in the UI) for equipment
// that has ALREADY cleared the hard ACCA window gate (isCompatible) -
// this ranks "how good" among compatible options, it does not decide
// compatibility itself. Weighted average of:
//   - 45% cooling fit: how close interpolated capacity at design
//     conditions sits to exactly 100% of the Manual J load (not just
//     "inside the window" - closer to matched, not oversized, is better
//     practice even within an ACCA-legal range).
//   - 30% heating fit: for a furnace, the same closeness-to-100% logic
//     against the heating window. For a heat pump, there's no percentage
//     target - instead this rewards a LOW supplemental-heat requirement
//     at design conditions (a heat pump that covers more of the load on
//     its own, i.e. a lower balance point relative to design temp, scores
//     higher). For equipment with no heating pairing at all (cooling-only
//     data), this factor is dropped and the other two are reweighted to
//     still sum to 1 - it's genuinely not applicable, not a penalty.
//   - 25% staging fit: STAGE_TYPE_SCORE above.
export function computeCompatibilityScore(evaluation: {
  equipment: EquipmentCatalogEntry;
  coolingPercentOfLoad: number | null;
  heatingPercentOfLoad: number | null;
  supplementalHeatBtuh: number | null;
  manualJHeatingBtuh: number;
}): number {
  const equipmentType = evaluation.equipment.equipmentType;
  const [coolingMin, coolingMax] =
    equipmentType === "heat_pump"
      ? [HEAT_PUMP_COOLING_MIN_FRACTION, HEAT_PUMP_COOLING_MAX_FRACTION]
      : [AC_COOLING_MIN_FRACTION, AC_COOLING_MAX_FRACTION];
  const coolingHalfWidth = Math.max(1 - coolingMin, coolingMax - 1);
  const coolingFit =
    evaluation.coolingPercentOfLoad != null
      ? clamp01(1 - Math.abs(evaluation.coolingPercentOfLoad - 1) / coolingHalfWidth)
      : null;

  let heatingFit: number | null = null;
  if (equipmentType === "furnace" && evaluation.heatingPercentOfLoad != null) {
    const halfWidth = Math.max(
      1 - FURNACE_HEATING_MIN_FRACTION,
      FURNACE_HEATING_MAX_FRACTION - 1,
    );
    heatingFit = clamp01(1 - Math.abs(evaluation.heatingPercentOfLoad - 1) / halfWidth);
  } else if (
    equipmentType === "heat_pump" &&
    evaluation.supplementalHeatBtuh != null &&
    evaluation.manualJHeatingBtuh > 0
  ) {
    // supplementalHeatBtuh is the gap at design conditions (see
    // computeSupplementalHeatBtuh) - express it as a fraction of the
    // heating load and reward heat pumps that need less of it. >=50%
    // reliance on strip heat at design conditions scores 0 on this factor
    // specifically - still a usable, ACCA-compliant system in a cold
    // climate, just not a strong match on this one criterion.
    const supplementalFraction = evaluation.supplementalHeatBtuh / evaluation.manualJHeatingBtuh;
    heatingFit = clamp01(1 - 2 * supplementalFraction);
  }

  const stagingFit = STAGE_TYPE_SCORE[evaluation.equipment.stageType];

  const terms: Array<{ value: number; weight: number }> = [];
  if (coolingFit != null) terms.push({ value: coolingFit, weight: 0.45 });
  if (heatingFit != null) terms.push({ value: heatingFit, weight: 0.3 });
  terms.push({ value: stagingFit, weight: 0.25 });

  const totalWeight = terms.reduce((sum, t) => sum + t.weight, 0);
  const weightedSum = terms.reduce((sum, t) => sum + t.value * t.weight, 0);
  return totalWeight > 0 ? weightedSum / totalWeight : stagingFit;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

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

  const compatible = isCompatible({ equipment, withinCoolingWindow, withinHeatingWindow });
  const compatibilityScore = compatible
    ? computeCompatibilityScore({
        equipment,
        coolingPercentOfLoad,
        heatingPercentOfLoad,
        supplementalHeatBtuh,
        manualJHeatingBtuh,
      })
    : null;

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
    compatibilityScore,
  };
}

// Filters to ONLY compatible equipment (passed the hard ACCA window gate -
// see isCompatible) and ranks by compatibilityScore, highest first.
// preferredEquipmentIds (an org's equipment_org_preferences with
// is_preferred=true) only breaks ties/near-ties - within
// TIE_BREAK_SCORE_THRESHOLD of each other, a preferred line sorts first,
// but a non-preferred unit with a genuinely better score still wins.
// Preference never touches compatibilityScore itself, so the displayed
// percent always stays a physics-based, honest number - preference only
// ever affects display ORDER among near-equal scores.
const TIE_BREAK_SCORE_THRESHOLD = 0.03;

export function rankEquipment(
  evaluations: EquipmentEvaluation[],
  preferredEquipmentIds: ReadonlySet<string> = new Set(),
): EquipmentEvaluation[] {
  return evaluations
    .filter((e) => isCompatible(e))
    .sort((a, b) => {
      const aScore = a.compatibilityScore ?? 0;
      const bScore = b.compatibilityScore ?? 0;
      if (Math.abs(aScore - bScore) <= TIE_BREAK_SCORE_THRESHOLD) {
        const aPreferred = preferredEquipmentIds.has(a.equipment.id);
        const bPreferred = preferredEquipmentIds.has(b.equipment.id);
        if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
      }
      return bScore - aScore;
    });
}

// Project-level "Preferred Manufacturer" (projects.preferred_manufacturer)
// - a completely separate concern from the org-level preferredEquipmentIds
// tie-break above. That one nudges display ORDER among near-equal scores
// within the full compatible list; this one narrows WHICH manufacturer's
// results get shown by default. Neither ever touches compatibilityScore -
// `ranked` here is expected to already be rankEquipment's output (hard-
// gate-filtered, score-sorted), this function only slices/filters it.
export type ManufacturerSelectionResult = {
  results: EquipmentEvaluation[];
  // true when the preferred manufacturer had zero compatible matches and
  // `results` fell back to the top matches across all manufacturers - the
  // caller must surface this explicitly (never silently substitute), per
  // the rule that a manufacturer preference can narrow results but must
  // never hide the fact that it found nothing.
  usedFallback: boolean;
};

export const PREFERRED_MANUFACTURER_RESULT_COUNT = 5;
export const MANUFACTURER_FALLBACK_RESULT_COUNT = 3;

export function selectTopEquipmentByManufacturer(
  ranked: EquipmentEvaluation[],
  preferredManufacturer: string | null,
): ManufacturerSelectionResult {
  if (!preferredManufacturer) {
    return { results: ranked.slice(0, PREFERRED_MANUFACTURER_RESULT_COUNT), usedFallback: false };
  }
  const fromPreferred = ranked.filter((e) => e.equipment.manufacturer === preferredManufacturer);
  if (fromPreferred.length > 0) {
    return { results: fromPreferred.slice(0, PREFERRED_MANUFACTURER_RESULT_COUNT), usedFallback: false };
  }
  return { results: ranked.slice(0, MANUFACTURER_FALLBACK_RESULT_COUNT), usedFallback: true };
}
