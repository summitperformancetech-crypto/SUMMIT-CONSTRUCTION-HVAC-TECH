// Industrial module: a generalized process-load framework, not
// per-industry hardcoded formulas. A zone's total load is its normal
// commercial envelope + ventilation load (lib/manualN.ts, reused
// directly - an industrial building still has walls, a roof, and
// outdoor-air requirements) PLUS whatever process_loads rows a tech has
// entered for it. The only "formulas" here are the two the original spec
// explicitly calls out (makeup air CFM->Btuh, cleanroom ACH->CFM) - every
// other process load is a direct field-measured or manufacturer-spec
// number entered as-is, never derived, because a specific oven or exhaust
// hood's real load comes from its own spec sheet or a field measurement,
// not a generic formula this app could invent.

import {
  computeCommercialZoneBlockLoad,
  type CommercialOccupancyDefault,
  type CommercialZoneInput,
  type CommercialZoneLoadResult,
} from "./manualN";

export type ProcessLoadType =
  | "process_sensible"
  | "process_latent"
  | "makeup_air"
  | "exhaust"
  | "cleanroom_ach";

export type ProcessLoadSource = "field_measured" | "manufacturer_spec" | "engineering_estimate";

export type ProcessLoad = {
  id: string;
  zoneId: string | null;
  loadType: ProcessLoadType;
  description: string;
  sensibleBtuHr: number | null;
  latentBtuHr: number | null;
  cfm: number | null;
  achRequired: number | null;
  source: ProcessLoadSource;
};

export type ResolvedProcessLoad = {
  processLoad: ProcessLoad;
  sensibleBtuHr: number;
  latentBtuHr: number;
  // How the sensible/latent numbers above were obtained - lets the UI
  // show "as entered" vs "derived from CFM" so a tech can tell which
  // numbers are their own data and which this app computed.
  derivation: "direct" | "derived_from_cfm" | "derived_from_ach";
};

const SENSIBLE_AIR_FACTOR = 1.08;
// Same fixed-fraction latent approximation used throughout this app
// (lib/manualJ.ts's INFILTRATION_LATENT_FACTOR, lib/manualN.ts's
// VENTILATION_LATENT_FRACTION_OF_SENSIBLE) in the absence of real
// humidity-ratio inputs - reused here for the same reason, not
// re-derived.
const LATENT_FRACTION_OF_SENSIBLE = 0.3;

function n(value: number | null | undefined): number {
  return value ?? 0;
}

// Resolves one process_loads row to a sensible/latent Btuh contribution.
// A tech's own directly-entered sensible_btu_hr/latent_btu_hr always wins
// when present, regardless of load_type - that's real data (a field
// measurement or a spec sheet number) and this function's job is to fill
// the gap only when that direct number isn't available yet.
export function resolveProcessLoad(
  load: ProcessLoad,
  outdoorDesignTempF: number,
  indoorDesignTempF: number,
  zoneVolumeCuft: number | null,
): ResolvedProcessLoad {
  if (load.sensibleBtuHr != null || load.latentBtuHr != null) {
    return {
      processLoad: load,
      sensibleBtuHr: n(load.sensibleBtuHr),
      latentBtuHr: n(load.latentBtuHr),
      derivation: "direct",
    };
  }

  const deltaT = Math.abs(outdoorDesignTempF - indoorDesignTempF);

  if (load.loadType === "cleanroom_ach" && load.achRequired != null && zoneVolumeCuft) {
    // ach_required x room_volume / 60 min/hr - the spec's own formula.
    const cfm = (load.achRequired * zoneVolumeCuft) / 60;
    const sensibleBtuHr = SENSIBLE_AIR_FACTOR * cfm * deltaT;
    return {
      processLoad: load,
      sensibleBtuHr,
      latentBtuHr: sensibleBtuHr * LATENT_FRACTION_OF_SENSIBLE,
      derivation: "derived_from_ach",
    };
  }

  if ((load.loadType === "makeup_air" || load.loadType === "exhaust") && load.cfm != null) {
    const sensibleBtuHr = SENSIBLE_AIR_FACTOR * load.cfm * deltaT;
    return {
      processLoad: load,
      sensibleBtuHr,
      latentBtuHr: sensibleBtuHr * LATENT_FRACTION_OF_SENSIBLE,
      derivation: "derived_from_cfm",
    };
  }

  // No direct numbers and nothing derivable (e.g. a process_sensible row
  // with neither sensible_btu_hr nor a CFM to derive from) - zero
  // contribution rather than guessing.
  return { processLoad: load, sensibleBtuHr: 0, latentBtuHr: 0, derivation: "direct" };
}

export type IndustrialZoneLoadResult = CommercialZoneLoadResult & {
  processLoads: ResolvedProcessLoad[];
  processSensibleBtuh: number;
  processLatentBtuh: number;
  totalHeatingBtuh: number;
  totalCoolingSensibleBtuh: number;
  totalCoolingLatentBtuh: number;
  totalCoolingBtuh: number;
};

export function computeIndustrialZoneLoad(
  zone: CommercialZoneInput,
  occupancyDefaults: CommercialOccupancyDefault[],
  processLoads: ProcessLoad[],
  winterOutdoorDesignF: number,
  summerOutdoorDesignF: number,
  indoorDesignHeatingF: number,
  indoorDesignCoolingF: number,
): IndustrialZoneLoadResult {
  const blockLoad = computeCommercialZoneBlockLoad(
    zone,
    occupancyDefaults,
    winterOutdoorDesignF,
    summerOutdoorDesignF,
    indoorDesignHeatingF,
    indoorDesignCoolingF,
  );

  const zoneVolumeCuft =
    zone.floorAreaSqft != null && zone.ceilingHeightFt != null
      ? zone.floorAreaSqft * zone.ceilingHeightFt
      : null;

  const zoneProcessLoads = processLoads.filter((p) => p.zoneId === zone.id);
  // Cooling process load uses the summer design condition (worst case for
  // makeup-air/cleanroom CFM terms); heating reuses the same resolved
  // sensible number computed against summer deltaT is NOT reused for
  // heating - resolved twice, once per season, since deltaT differs.
  const resolvedCooling = zoneProcessLoads.map((p) =>
    resolveProcessLoad(p, summerOutdoorDesignF, indoorDesignCoolingF, zoneVolumeCuft),
  );
  const resolvedHeating = zoneProcessLoads.map((p) =>
    resolveProcessLoad(p, winterOutdoorDesignF, indoorDesignHeatingF, zoneVolumeCuft),
  );

  const processSensibleBtuh = resolvedCooling.reduce((sum, r) => sum + r.sensibleBtuHr, 0);
  const processLatentBtuh = resolvedCooling.reduce((sum, r) => sum + r.latentBtuHr, 0);
  const processHeatingBtuh = resolvedHeating.reduce((sum, r) => sum + r.sensibleBtuHr, 0);

  return {
    ...blockLoad,
    processLoads: resolvedCooling,
    processSensibleBtuh,
    processLatentBtuh,
    totalHeatingBtuh: blockLoad.heatingBtuh + processHeatingBtuh,
    totalCoolingSensibleBtuh: blockLoad.coolingSensibleBtuh + processSensibleBtuh,
    totalCoolingLatentBtuh: blockLoad.coolingLatentBtuh + processLatentBtuh,
    totalCoolingBtuh:
      blockLoad.coolingSensibleBtuh + processSensibleBtuh + blockLoad.coolingLatentBtuh + processLatentBtuh,
  };
}

export function computeIndustrialBuildingLoad(
  zones: CommercialZoneInput[],
  occupancyDefaults: CommercialOccupancyDefault[],
  processLoads: ProcessLoad[],
  winterOutdoorDesignF: number,
  summerOutdoorDesignF: number,
  indoorDesignHeatingF: number,
  indoorDesignCoolingF: number,
): IndustrialZoneLoadResult[] {
  return zones.map((zone) =>
    computeIndustrialZoneLoad(
      zone,
      occupancyDefaults,
      processLoads,
      winterOutdoorDesignF,
      summerOutdoorDesignF,
      indoorDesignHeatingF,
      indoorDesignCoolingF,
    ),
  );
}
