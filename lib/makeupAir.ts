// Makeup air balance: any mechanical system that exhausts air to the
// exterior of the building envelope (kitchen range hood, bathroom/
// utility exhaust fan, clothes dryer, industrial process exhaust) pulls
// the building toward negative pressure. Real, cited code basis, verified
// against primary code text this session (2011 Oregon Residential
// Specialty Code Chapter 15, which republishes the IRC's own
// exhaust-systems chapter verbatim - read directly, not a paraphrase):
//   - IRC M1503.5 (range hoods): exhaust hood systems capable of
//     exhausting more than 400 cfm require makeup air "at a rate
//     approximately equal to the exhaust air rate," automatically
//     interlocked with the exhaust system. (Commonly cited as M1503.6 in
//     2018/2021-cycle editions - the exact sub-number shifts between
//     code cycles as sections are inserted; both refer to the same real
//     400 cfm range-hood requirement, not two different rules.)
//   - IRC M1502.7 (clothes dryers): installations exhausting more than
//     200 cfm require makeup air - a real, separate, LOWER threshold
//     than range hoods. A ~200+ cfm dryer with no makeup air is a real
//     code violation this module must catch on its own, not only when a
//     range hood happens to also be present.
// Per-source-type thresholds below (MAKEUP_AIR_TRIGGER_CFM_BY_SOURCE_TYPE)
// reflect this real distinction - a single flat 400 cfm threshold across
// every source_type would silently miss the real 200 cfm dryer trigger.
//
// This module checks these real, cited numeric triggers - it does NOT
// attempt to reproduce ASHRAE 62.2 Section 6.4's full net-exhaust/
// infiltration-credit calculation (which limits the two largest exhaust
// appliances' combined flow when a natural-draft/solid-fuel combustion
// appliance is present), since that real formula needs inputs
// (blower-door ACH50 at the design depressurization limit, combustion-air
// opening area) this schema doesn't collect for this purpose - encoding a
// partial version of it would misrepresent an approximation as the real
// standard. bathroom_exhaust_fan/general_exhaust_fan/industrial_process_
// exhaust/other have no single numeric code trigger verified yet and
// never flag on CFM alone. See
// supabase/migrations/20260827270000_add_makeup_air_tracking.sql and
// 20260827280000_add_local_exhaust_fan_tracking.sql for the sourcing
// (Broan-NuTone's own "Automatic Make-Up Air Damper Application Guide,"
// 04-17-13, independently confirms the 400 cfm range-hood figure).

export type ExhaustSourceType =
  | "kitchen_range_hood"
  | "bathroom_exhaust_fan"
  | "clothes_dryer"
  | "general_exhaust_fan"
  | "industrial_process_exhaust"
  | "other";

export type ExhaustSource = {
  id: string;
  roomId: string | null;
  sourceType: ExhaustSourceType;
  description: string | null;
  ratedCfm: number;
};

export type MakeupAirUnitSpec = {
  category: "residential_damper" | "residential_fan_powered" | "commercial_tempered";
  minRatedCfm: number | null;
  maxRatedCfm: number | null;
};

// Real, per-source-type makeup-air trigger thresholds (IRC M1503.5 for
// range hoods, M1502.7 for clothes dryers). A source_type with no entry
// here has no single numeric code trigger this schema has verified -
// never flags on CFM alone (see module header).
export const MAKEUP_AIR_TRIGGER_CFM_BY_SOURCE_TYPE: Partial<Record<ExhaustSourceType, number>> = {
  kitchen_range_hood: 400,
  clothes_dryer: 200,
};

// Kept for backward compatibility with anything reading the old flat
// threshold - equal to the range-hood trigger, the original real number
// this constant was sourced from.
export const RESIDENTIAL_MAKEUP_AIR_TRIGGER_CFM = MAKEUP_AIR_TRIGGER_CFM_BY_SOURCE_TYPE.kitchen_range_hood!;

export type MakeupAirBalanceResult = {
  totalExhaustCfm: number;
  largestSingleSourceCfm: number;
  status: "resolved" | "flagged" | "not_applicable";
  summary: string;
  detail: string;
};

function triggeringSource(exhaustSources: ExhaustSource[]): ExhaustSource | null {
  let worst: { source: ExhaustSource; margin: number } | null = null;
  for (const source of exhaustSources) {
    const threshold = MAKEUP_AIR_TRIGGER_CFM_BY_SOURCE_TYPE[source.sourceType];
    if (threshold == null) continue;
    if (source.ratedCfm > threshold) {
      const margin = source.ratedCfm - threshold;
      if (!worst || margin > worst.margin) worst = { source, margin };
    }
  }
  return worst?.source ?? null;
}

export function evaluateMakeupAirBalance(
  exhaustSources: ExhaustSource[],
  selectedUnit: MakeupAirUnitSpec | null,
): MakeupAirBalanceResult {
  const totalExhaustCfm = exhaustSources.reduce((sum, s) => sum + s.ratedCfm, 0);
  const largestSingleSourceCfm = exhaustSources.reduce((max, s) => Math.max(max, s.ratedCfm), 0);

  if (exhaustSources.length === 0) {
    return {
      totalExhaustCfm: 0,
      largestSingleSourceCfm: 0,
      status: "not_applicable",
      summary: "No exhaust sources entered for this project.",
      detail:
        "Add kitchen range hoods, bath/utility exhaust fans, dryers, or process exhaust under Exhaust Sources to run the makeup-air check.",
    };
  }

  const trigger = triggeringSource(exhaustSources);

  if (!trigger) {
    return {
      totalExhaustCfm,
      largestSingleSourceCfm,
      status: "resolved",
      summary: `No exhaust source exceeds its real code makeup-air trigger (range hood 400 cfm per IRC M1503.5, clothes dryer 200 cfm per IRC M1502.7).`,
      detail: "No code-mandated makeup air system is triggered by this project's real, entered exhaust sources.",
    };
  }

  const triggerThreshold = MAKEUP_AIR_TRIGGER_CFM_BY_SOURCE_TYPE[trigger.sourceType]!;
  const triggerCitation = trigger.sourceType === "clothes_dryer" ? "IRC M1502.7" : "IRC M1503.5";

  if (!selectedUnit) {
    return {
      totalExhaustCfm,
      largestSingleSourceCfm,
      status: "flagged",
      summary: `${trigger.sourceType.replace(/_/g, " ")} exhausts ${trigger.ratedCfm} cfm, exceeding the ${triggerThreshold} cfm ${triggerCitation} makeup-air threshold, but no makeup-air unit is selected for this project.`,
      detail:
        `${triggerCitation} requires a makeup air system providing approximately the same CFM as the exhaust, automatically interlocked to start and operate simultaneously with the exhaust system. Select a real makeup-air unit from the catalog.`,
    };
  }

  if (selectedUnit.category === "commercial_tempered" && selectedUnit.maxRatedCfm != null) {
    const covered = selectedUnit.maxRatedCfm >= totalExhaustCfm;
    return {
      totalExhaustCfm,
      largestSingleSourceCfm,
      status: covered ? "resolved" : "flagged",
      summary: covered
        ? `Selected makeup-air unit's real published range (up to ${selectedUnit.maxRatedCfm} cfm) covers this project's total exhaust load (${totalExhaustCfm} cfm).`
        : `Selected makeup-air unit's real published max (${selectedUnit.maxRatedCfm} cfm) is less than this project's total exhaust load (${totalExhaustCfm} cfm) - undersized.`,
      detail: "Real published CFM range from equipment_makeup_air_specs, compared against the sum of this project's entered exhaust sources.",
    };
  }

  // Residential dampers/fan-powered systems (Broan/Fantech) don't
  // publish a fixed CFM number - Broan's own guidance sizes them by duct
  // diameter, not a CFM lookup. A real selection is treated as resolved;
  // this module has no real duct-diameter input to numerically verify
  // sizing against.
  return {
    totalExhaustCfm,
    largestSingleSourceCfm,
    status: "resolved",
    summary: `A makeup-air unit is selected for this project (${trigger.sourceType.replace(/_/g, " ")} at ${trigger.ratedCfm} cfm exceeds the ${triggerThreshold} cfm ${triggerCitation} threshold).`,
    detail:
      "Residential dampers/fan-powered makeup-air systems (Broan, Fantech) don't publish a fixed CFM rating - size per the manufacturer's own duct-diameter/system-design guidance, not a CFM lookup.",
  };
}
