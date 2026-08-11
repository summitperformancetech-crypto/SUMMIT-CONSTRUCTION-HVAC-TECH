// Commercial block load (ASHRAE/Manual N style), per-zone peak calc - the
// default sizing mode per project decision (8760-hour simulation is a
// separate upgrade path, see manualNSimulation.ts, reusing these same
// zone inputs).

export type CommercialZoneInput = {
  id: string;
  name: string;
  occupancyType: string | null;
  floorAreaSqft: number | null;
  // Not used by the block-load calc itself (which is purely UA x deltaT +
  // per-sqft internal gains, no volume term) - carried here because
  // lib/manualIndustrial.ts needs zone volume (floorAreaSqft x
  // ceilingHeightFt) for cleanroom ACH->CFM, and it's simpler to have one
  // zone input shape than a separate industrial-only variant.
  ceilingHeightFt: number | null;
  occupantDensityPer1000Sqft: number | null;
  lightingLoadWPerSqft: number | null;
  equipmentLoadWPerSqft: number | null;
  exteriorWallAreaSqft: number | null;
  roofAreaSqft: number | null;
  wallUValue: number | null;
  roofUValue: number | null;
  windowAreaSqft: number | null;
  windowUValue: number | null;
  windowShgc: number | null;
};

export type CommercialOccupancyDefault = {
  occupancyType: string;
  defaultOccupantDensityPer1000Sqft: number | null;
  defaultVentilationRpCfmPerPerson: number | null;
  defaultVentilationRaCfmPerSqft: number;
  defaultLightingWPerSqft: number;
  defaultEquipmentWPerSqft: number;
};

export type CommercialZoneLoadResult = {
  zoneId: string;
  zoneName: string;
  occupantCount: number;
  envelopeHeatingBtuh: number;
  envelopeCoolingSensibleBtuh: number;
  solarGainBtuh: number;
  lightingBtuh: number;
  equipmentBtuh: number;
  occupantSensibleBtuh: number;
  occupantLatentBtuh: number;
  ventilationCfm: number;
  ventilationHeatingBtuh: number;
  ventilationCoolingSensibleBtuh: number;
  ventilationCoolingLatentBtuh: number;
  heatingBtuh: number;
  coolingSensibleBtuh: number;
  coolingLatentBtuh: number;
  coolingTotalBtuh: number;
};

// W -> Btuh.
const WATTS_TO_BTUH = 3.412;
// 1 lb dry air per 13.33 ft3 * 60 min/hr * 0.24 Btu/lb-F standard air
// sensible factor - the same 1.08 constant used throughout lib/manualJ.ts
// for ventilation/infiltration sensible load, reused here for consistency
// (it's a physical constant of standard air, not residential-specific).
const SENSIBLE_AIR_FACTOR = 1.08;
// A proper latent ventilation load needs a humidity-ratio difference
// (grains of moisture per lb of air), not a dry-bulb deltaT - this app
// doesn't collect outdoor/indoor humidity ratio inputs for any project
// type yet. lib/manualJ.ts works around the same missing input for
// residential by expressing ventilation latent load as a fixed fraction
// of the sensible term instead (INFILTRATION_LATENT_FACTOR = 0.3) -
// reused here verbatim for consistency, not re-derived.
const VENTILATION_LATENT_FRACTION_OF_SENSIBLE = 0.3;

// Same ACCA Table 6A-derived per-person sensible/latent figures already
// used for residential internal gains (see room_type_defaults,
// migration 20260810193033_add_internal_gains_room_type.sql) - office/
// light-commercial activity level is comparable to the residential
// "living/office" assumption those figures were validated against, so
// reused rather than re-sourced.
const OCCUPANT_SENSIBLE_BTUH_PER_PERSON = 230;
const OCCUPANT_LATENT_BTUH_PER_PERSON = 200;

// Peak solar gain per sqft of window, reused directly from
// lib/manualJ.ts's SOLAR_GAIN_BTUH_PER_SQFT (150) rather than a
// commercial-specific orientation/month lookup. The ACCA Manual N
// spec calls for a proper "solar heat gain factor by orientation and
// month for peak design day" table (ASHRAE Fundamentals Ch.14/27), which
// was actively researched for this module - real ASHRAE daily-total SHGF
// data by latitude/month/orientation was located (Dartmouth ENGS 44
// course reproduction of the ASHRAE Handbook of Fundamentals table), but
// its dense multi-column PDF layout could not be parsed into per-value
// numbers with enough confidence to cite as precise ASHRAE figures - a
// mis-parsed run of digits presented as an ASHRAE citation would be worse
// than an honest simplification. Flagged here as a real, documented gap
// (not silently guessed) for a future session to close with a cleaner
// source or manual transcription, not a permanent design decision.
const SOLAR_GAIN_BTUH_PER_SQFT = 150;

function n(value: number | null | undefined): number {
  return value ?? 0;
}

function resolveOccupantDensity(
  zone: CommercialZoneInput,
  occDefault: CommercialOccupancyDefault | undefined,
): number {
  return zone.occupantDensityPer1000Sqft ?? occDefault?.defaultOccupantDensityPer1000Sqft ?? 0;
}

function resolveLightingWPerSqft(
  zone: CommercialZoneInput,
  occDefault: CommercialOccupancyDefault | undefined,
): number {
  return zone.lightingLoadWPerSqft ?? occDefault?.defaultLightingWPerSqft ?? 0;
}

function resolveEquipmentWPerSqft(
  zone: CommercialZoneInput,
  occDefault: CommercialOccupancyDefault | undefined,
): number {
  return zone.equipmentLoadWPerSqft ?? occDefault?.defaultEquipmentWPerSqft ?? 0;
}

export function computeCommercialZoneBlockLoad(
  zone: CommercialZoneInput,
  occupancyDefaults: CommercialOccupancyDefault[],
  winterOutdoorDesignF: number,
  summerOutdoorDesignF: number,
  indoorDesignHeatingF: number,
  indoorDesignCoolingF: number,
): CommercialZoneLoadResult {
  const occDefault = occupancyDefaults.find((d) => d.occupancyType === zone.occupancyType);
  const floorArea = n(zone.floorAreaSqft);

  const occupantDensity = resolveOccupantDensity(zone, occDefault);
  const occupantCount = (occupantDensity * floorArea) / 1000;

  const heatingDeltaT = indoorDesignHeatingF - winterOutdoorDesignF;
  const coolingDeltaT = summerOutdoorDesignF - indoorDesignCoolingF;

  const wallUA = n(zone.exteriorWallAreaSqft) * n(zone.wallUValue);
  const roofUA = n(zone.roofAreaSqft) * n(zone.roofUValue);
  const windowUA = n(zone.windowAreaSqft) * n(zone.windowUValue);
  const envelopeUA = wallUA + roofUA + windowUA;

  const envelopeHeatingBtuh = envelopeUA * heatingDeltaT;
  const envelopeCoolingSensibleBtuh = envelopeUA * coolingDeltaT;

  const solarGainBtuh = n(zone.windowAreaSqft) * n(zone.windowShgc) * SOLAR_GAIN_BTUH_PER_SQFT;

  const lightingWPerSqft = resolveLightingWPerSqft(zone, occDefault);
  const equipmentWPerSqft = resolveEquipmentWPerSqft(zone, occDefault);
  const lightingBtuh = lightingWPerSqft * floorArea * WATTS_TO_BTUH;
  const equipmentBtuh = equipmentWPerSqft * floorArea * WATTS_TO_BTUH;

  const occupantSensibleBtuh = occupantCount * OCCUPANT_SENSIBLE_BTUH_PER_PERSON;
  const occupantLatentBtuh = occupantCount * OCCUPANT_LATENT_BTUH_PER_PERSON;

  // ASHRAE 62.1 Ventilation Rate Procedure: Vbz = Rp * Pz + Ra * Az.
  const rp = occDefault?.defaultVentilationRpCfmPerPerson ?? 0;
  const ra = occDefault?.defaultVentilationRaCfmPerSqft ?? 0;
  const ventilationCfm = rp * occupantCount + ra * floorArea;

  const ventilationHeatingBtuh = SENSIBLE_AIR_FACTOR * ventilationCfm * heatingDeltaT;
  const ventilationCoolingSensibleBtuh = SENSIBLE_AIR_FACTOR * ventilationCfm * coolingDeltaT;
  const ventilationCoolingLatentBtuh =
    ventilationCoolingSensibleBtuh * VENTILATION_LATENT_FRACTION_OF_SENSIBLE;

  const heatingBtuh = envelopeHeatingBtuh + ventilationHeatingBtuh;
  const coolingSensibleBtuh =
    envelopeCoolingSensibleBtuh +
    solarGainBtuh +
    lightingBtuh +
    equipmentBtuh +
    occupantSensibleBtuh +
    ventilationCoolingSensibleBtuh;
  const coolingLatentBtuh = occupantLatentBtuh + ventilationCoolingLatentBtuh;

  return {
    zoneId: zone.id,
    zoneName: zone.name,
    occupantCount,
    envelopeHeatingBtuh,
    envelopeCoolingSensibleBtuh,
    solarGainBtuh,
    lightingBtuh,
    equipmentBtuh,
    occupantSensibleBtuh,
    occupantLatentBtuh,
    ventilationCfm,
    ventilationHeatingBtuh,
    ventilationCoolingSensibleBtuh,
    ventilationCoolingLatentBtuh,
    heatingBtuh,
    coolingSensibleBtuh,
    coolingLatentBtuh,
    coolingTotalBtuh: coolingSensibleBtuh + coolingLatentBtuh,
  };
}

export type CommercialBlockLoadResult = {
  zones: CommercialZoneLoadResult[];
  building: {
    heatingBtuh: number;
    coolingSensibleBtuh: number;
    coolingLatentBtuh: number;
    coolingTotalBtuh: number;
  };
};

export function computeCommercialBlockLoad(
  zones: CommercialZoneInput[],
  occupancyDefaults: CommercialOccupancyDefault[],
  winterOutdoorDesignF: number,
  summerOutdoorDesignF: number,
  indoorDesignHeatingF: number,
  indoorDesignCoolingF: number,
): CommercialBlockLoadResult {
  const zoneResults = zones.map((zone) =>
    computeCommercialZoneBlockLoad(
      zone,
      occupancyDefaults,
      winterOutdoorDesignF,
      summerOutdoorDesignF,
      indoorDesignHeatingF,
      indoorDesignCoolingF,
    ),
  );

  const building = zoneResults.reduce(
    (acc, z) => ({
      heatingBtuh: acc.heatingBtuh + z.heatingBtuh,
      coolingSensibleBtuh: acc.coolingSensibleBtuh + z.coolingSensibleBtuh,
      coolingLatentBtuh: acc.coolingLatentBtuh + z.coolingLatentBtuh,
      coolingTotalBtuh: acc.coolingTotalBtuh + z.coolingTotalBtuh,
    }),
    { heatingBtuh: 0, coolingSensibleBtuh: 0, coolingLatentBtuh: 0, coolingTotalBtuh: 0 },
  );

  return { zones: zoneResults, building };
}
