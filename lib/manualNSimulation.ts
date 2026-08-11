// 8760-hour bin-method simulation - the upgrade path over block load mode
// (lib/manualN.ts), reusing the exact same zone/occupancy-default inputs.
// Iterates a full year of real hourly outdoor temperatures (see migration
// 20260811100729_add_climate_hourly_normals.sql for the NOAA data source)
// and evaluates each zone's load at every hour, rather than only at the
// single design-day extreme.
//
// Scope limitation, documented rather than silently assumed: this
// iterates load with occupancy/lighting/equipment gains held CONSTANT at
// their full design value for every one of the 8760 hours, and solar
// gain held at the same flat peak factor block load uses (see
// SOLAR_GAIN_BTUH_PER_SQFT in lib/manualN.ts) rather than varying by time
// of day. A full hourly model would need real occupancy schedules
// (occupied/unoccupied by hour, day-of-week) and hour-by-hour solar
// position - genuinely out of scope for this pass. What this DOES give
// real, non-fabricated value on is the temperature-driven half of the
// load (envelope + ventilation), which is exactly what varies hour to
// hour and is what a real annual hourly temperature record can actually
// inform - that's why simulation mode still adds real value over block
// load's single design point, even with constant internal gains.

import type { CommercialOccupancyDefault, CommercialZoneInput } from "./manualN";

export type HourlyTemperaturePoint = {
  month: number;
  day: number;
  hour: number;
  tempF: number;
};

export type LoadDurationPoint = {
  rank: number; // 1 = peak hour of the year
  loadBtuh: number;
};

export type ZoneSimulationResult = {
  zoneId: string;
  zoneName: string;
  peakCoolingBtuh: number;
  peakCoolingHour: HourlyTemperaturePoint | null;
  peakHeatingBtuh: number;
  peakHeatingHour: HourlyTemperaturePoint | null;
  // Sum of hourly load values across the year - a Btu-hour proxy for
  // annual thermal load, NOT electrical energy (kWh) - that conversion
  // needs equipment efficiency/COP data (see lib/manualS.ts's
  // equipment_performance_points), which isn't wired to zones here.
  annualCoolingLoadBtuHours: number;
  annualHeatingLoadBtuHours: number;
  coolingLoadDurationCurve: LoadDurationPoint[];
};

const SENSIBLE_AIR_FACTOR = 1.08;
const OCCUPANT_SENSIBLE_BTUH_PER_PERSON = 230;
const SOLAR_GAIN_BTUH_PER_SQFT = 150;
const WATTS_TO_BTUH = 3.412;

function n(value: number | null | undefined): number {
  return value ?? 0;
}

// Sensible-only, matching computeCommercialZoneBlockLoad's cooling
// sensible term (latent isn't meaningfully hour-varying under the
// constant-internal-gains assumption above, so it's left to block load
// mode rather than duplicated here).
function hourlyZoneCoolingSensibleBtuh(
  zone: CommercialZoneInput,
  occDefault: CommercialOccupancyDefault | undefined,
  outdoorTempF: number,
  indoorDesignCoolingF: number,
): number {
  const floorArea = n(zone.floorAreaSqft);
  const occupantDensity = zone.occupantDensityPer1000Sqft ?? occDefault?.defaultOccupantDensityPer1000Sqft ?? 0;
  const occupantCount = (occupantDensity * floorArea) / 1000;
  const lightingWPerSqft = zone.lightingLoadWPerSqft ?? occDefault?.defaultLightingWPerSqft ?? 0;
  const equipmentWPerSqft = zone.equipmentLoadWPerSqft ?? occDefault?.defaultEquipmentWPerSqft ?? 0;
  const ra = occDefault?.defaultVentilationRaCfmPerSqft ?? 0;
  const rp = occDefault?.defaultVentilationRpCfmPerPerson ?? 0;
  const ventilationCfm = rp * occupantCount + ra * floorArea;

  const envelopeUA =
    n(zone.exteriorWallAreaSqft) * n(zone.wallUValue) +
    n(zone.roofAreaSqft) * n(zone.roofUValue) +
    n(zone.windowAreaSqft) * n(zone.windowUValue);

  const deltaT = outdoorTempF - indoorDesignCoolingF;
  const envelopeBtuh = envelopeUA * deltaT;
  const ventilationBtuh = SENSIBLE_AIR_FACTOR * ventilationCfm * deltaT;
  const solarGainBtuh = n(zone.windowAreaSqft) * n(zone.windowShgc) * SOLAR_GAIN_BTUH_PER_SQFT;
  const lightingBtuh = lightingWPerSqft * floorArea * WATTS_TO_BTUH;
  const equipmentBtuh = equipmentWPerSqft * floorArea * WATTS_TO_BTUH;
  const occupantSensibleBtuh = occupantCount * OCCUPANT_SENSIBLE_BTUH_PER_PERSON;

  return envelopeBtuh + ventilationBtuh + solarGainBtuh + lightingBtuh + equipmentBtuh + occupantSensibleBtuh;
}

function hourlyZoneHeatingBtuh(
  zone: CommercialZoneInput,
  occDefault: CommercialOccupancyDefault | undefined,
  outdoorTempF: number,
  indoorDesignHeatingF: number,
): number {
  const floorArea = n(zone.floorAreaSqft);
  const occupantDensity = zone.occupantDensityPer1000Sqft ?? occDefault?.defaultOccupantDensityPer1000Sqft ?? 0;
  const occupantCount = (occupantDensity * floorArea) / 1000;
  const ra = occDefault?.defaultVentilationRaCfmPerSqft ?? 0;
  const rp = occDefault?.defaultVentilationRpCfmPerPerson ?? 0;
  const ventilationCfm = rp * occupantCount + ra * floorArea;

  const envelopeUA =
    n(zone.exteriorWallAreaSqft) * n(zone.wallUValue) +
    n(zone.roofAreaSqft) * n(zone.roofUValue) +
    n(zone.windowAreaSqft) * n(zone.windowUValue);

  const deltaT = indoorDesignHeatingF - outdoorTempF;
  if (deltaT <= 0) return 0;
  const envelopeBtuh = envelopeUA * deltaT;
  const ventilationBtuh = SENSIBLE_AIR_FACTOR * ventilationCfm * deltaT;
  // Internal gains (people, lights, equipment) offset heating load in a
  // real building - deliberately NOT subtracted here, matching block
  // load's own conservative convention of sizing heating off envelope +
  // ventilation only (see lib/manualJ.ts, which does the same for
  // residential heating).
  return envelopeBtuh + ventilationBtuh;
}

export function simulateCommercialZone(
  zone: CommercialZoneInput,
  occupancyDefaults: CommercialOccupancyDefault[],
  hourlyTemps: HourlyTemperaturePoint[],
  indoorDesignHeatingF: number,
  indoorDesignCoolingF: number,
): ZoneSimulationResult {
  const occDefault = occupancyDefaults.find((d) => d.occupancyType === zone.occupancyType);

  let peakCoolingBtuh = -Infinity;
  let peakCoolingHour: HourlyTemperaturePoint | null = null;
  let peakHeatingBtuh = -Infinity;
  let peakHeatingHour: HourlyTemperaturePoint | null = null;
  let annualCoolingLoadBtuHours = 0;
  let annualHeatingLoadBtuHours = 0;
  const coolingLoads: number[] = [];

  for (const hourPoint of hourlyTemps) {
    const coolingBtuh = hourlyZoneCoolingSensibleBtuh(
      zone,
      occDefault,
      hourPoint.tempF,
      indoorDesignCoolingF,
    );
    const heatingBtuh = hourlyZoneHeatingBtuh(zone, occDefault, hourPoint.tempF, indoorDesignHeatingF);

    if (coolingBtuh > 0) {
      annualCoolingLoadBtuHours += coolingBtuh;
      coolingLoads.push(coolingBtuh);
    }
    if (coolingBtuh > peakCoolingBtuh) {
      peakCoolingBtuh = coolingBtuh;
      peakCoolingHour = hourPoint;
    }

    if (heatingBtuh > 0) annualHeatingLoadBtuHours += heatingBtuh;
    if (heatingBtuh > peakHeatingBtuh) {
      peakHeatingBtuh = heatingBtuh;
      peakHeatingHour = hourPoint;
    }
  }

  const coolingLoadDurationCurve: LoadDurationPoint[] = coolingLoads
    .sort((a, b) => b - a)
    .map((loadBtuh, i) => ({ rank: i + 1, loadBtuh }));

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    peakCoolingBtuh: Math.max(peakCoolingBtuh, 0),
    peakCoolingHour,
    peakHeatingBtuh: Math.max(peakHeatingBtuh, 0),
    peakHeatingHour,
    annualCoolingLoadBtuHours,
    annualHeatingLoadBtuHours,
    coolingLoadDurationCurve,
  };
}

export function simulateCommercialBuilding(
  zones: CommercialZoneInput[],
  occupancyDefaults: CommercialOccupancyDefault[],
  hourlyTemps: HourlyTemperaturePoint[],
  indoorDesignHeatingF: number,
  indoorDesignCoolingF: number,
): ZoneSimulationResult[] {
  return zones.map((zone) =>
    simulateCommercialZone(zone, occupancyDefaults, hourlyTemps, indoorDesignHeatingF, indoorDesignCoolingF),
  );
}
