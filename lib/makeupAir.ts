// Makeup air balance: any mechanical system that exhausts air to the
// exterior of the building envelope (kitchen range hood, bathroom/
// utility exhaust fan, clothes dryer, industrial process exhaust) pulls
// the building toward negative pressure. Real, cited code basis:
//   - IRC M1503.6 (2018/2021 IRC): a kitchen range hood exhausting more
//     than 400 cfm must have a mechanical or passive makeup-air system
//     that starts and operates simultaneously with the exhaust system.
// This module checks that single, clean, citable numeric trigger against
// real project-entered exhaust CFM - it does NOT attempt to reproduce
// ASHRAE 62.2 Section 6.4's full net-exhaust/infiltration-credit
// calculation (which limits the two largest exhaust appliances' combined
// flow when a natural-draft/solid-fuel combustion appliance is present),
// since that real formula needs inputs (blower-door ACH50 at the design
// depressurization limit, combustion-air opening area) this schema
// doesn't collect for this purpose - encoding a partial version of it
// would misrepresent an approximation as the real standard. See
// supabase/migrations/20260827270000_add_makeup_air_tracking.sql for the
// sourcing (Broan-NuTone's own "Automatic Make-Up Air Damper Application
// Guide," 04-17-13, independently confirms the 400 cfm figure).

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

// IRC M1503.6 - real, cited numeric threshold (2018/2021 IRC language): a
// single range hood exhausting more than this CFM must have makeup air.
// Independently confirmed in Broan-NuTone's own "Automatic Make-Up Air
// Damper Application Guide" (04-17-13), Section 5 and FAQ #3.
export const RESIDENTIAL_MAKEUP_AIR_TRIGGER_CFM = 400;

export type MakeupAirBalanceResult = {
  totalExhaustCfm: number;
  largestSingleSourceCfm: number;
  status: "resolved" | "flagged" | "not_applicable";
  summary: string;
  detail: string;
};

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

  const triggered = largestSingleSourceCfm > RESIDENTIAL_MAKEUP_AIR_TRIGGER_CFM;

  if (!triggered) {
    return {
      totalExhaustCfm,
      largestSingleSourceCfm,
      status: "resolved",
      summary: `Largest single exhaust source is ${largestSingleSourceCfm} cfm, below the ${RESIDENTIAL_MAKEUP_AIR_TRIGGER_CFM} cfm IRC M1503.6 makeup-air threshold.`,
      detail: "No code-mandated makeup air system is triggered by this project's real, entered exhaust sources.",
    };
  }

  if (!selectedUnit) {
    return {
      totalExhaustCfm,
      largestSingleSourceCfm,
      status: "flagged",
      summary: `Largest single exhaust source is ${largestSingleSourceCfm} cfm, exceeding the ${RESIDENTIAL_MAKEUP_AIR_TRIGGER_CFM} cfm IRC M1503.6 threshold, but no makeup-air unit is selected for this project.`,
      detail:
        "IRC M1503.6 requires a mechanical or passive makeup-air system that starts and operates simultaneously with the exhaust system. Select a real makeup-air unit from the catalog.",
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
    summary: `A makeup-air unit is selected for this project (largest single exhaust source ${largestSingleSourceCfm} cfm exceeds the ${RESIDENTIAL_MAKEUP_AIR_TRIGGER_CFM} cfm IRC threshold).`,
    detail:
      "Residential dampers/fan-powered makeup-air systems (Broan, Fantech) don't publish a fixed CFM rating - size per the manufacturer's own duct-diameter/system-design guidance, not a CFM lookup.",
  };
}
