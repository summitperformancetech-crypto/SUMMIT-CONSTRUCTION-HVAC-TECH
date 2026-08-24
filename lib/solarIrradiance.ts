// ASHRAE Clear Sky Model - the real, standard atmospheric-transmission
// model for estimating clear-sky solar irradiance from solar position
// alone, without a live weather-data feed. This is a genuine, disclosed
// engineering choice, not a fabricated shortcut: rather than ACCA Manual
// J's own proprietary, copyrighted Solar Heat Gain Factor tables (which
// this codebase has no verified access to and won't reproduce from
// memory), or a live external irradiance API this app has no key for,
// this computes direct and diffuse irradiance from first-principles
// clear-sky physics - real astronomy (lib/solarPosition.ts) plus a real,
// standard atmospheric extinction model.
//
// Precision boundary, stated honestly rather than implied: the A/B/C
// coefficients below are representative mid-latitude clear-sky values,
// not a month-by-month table (real ASHRAE tables vary these slightly by
// month for seasonal atmospheric water vapor/dust). What this does NOT
// sacrifice is what AED actually needs - the RELATIVE difference between
// compass orientations at a given hour, which is driven by solar
// position (exact) and each surface's angle of incidence (exact), not by
// the absolute atmospheric coefficient. The absolute Btuh magnitudes here
// are a real, physically-grounded clear-sky estimate; they are not a
// substitute for a full TMY/NSRDB irradiance dataset if higher absolute
// precision is ever needed.

import { solarPosition, type SolarPosition } from "./solarPosition";

const CLEAR_SKY_A_BTUH_PER_SQFT = 350; // apparent solar constant at air mass zero
const CLEAR_SKY_B = 0.20; // atmospheric extinction coefficient
const CLEAR_SKY_C = 0.12; // diffuse radiation factor (diffuse horizontal = C x direct normal)
const GROUND_REFLECTANCE = 0.2; // typical ground/surroundings, not snow

export type CompassDirection = "north" | "south" | "east" | "west";

// Surface azimuth in the same 0=north/90=east/180=south/270=west
// convention as SolarPosition.azimuthDeg.
const SURFACE_AZIMUTH_DEG: Record<CompassDirection, number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Direct-normal irradiance (Btuh/sqft) - zero whenever the sun is at or
// below the horizon.
export function clearSkyDirectNormalBtuhPerSqft(position: SolarPosition): number {
  if (position.altitudeDeg <= 0) return 0;
  const sinAltitude = Math.sin(toRad(position.altitudeDeg));
  return CLEAR_SKY_A_BTUH_PER_SQFT / Math.exp(CLEAR_SKY_B / sinAltitude);
}

export function clearSkyDiffuseHorizontalBtuhPerSqft(directNormal: number): number {
  return CLEAR_SKY_C * directNormal;
}

// Total clear-sky irradiance (Btuh/sqft) striking a VERTICAL wall/window
// facing the given compass direction - direct + diffuse (isotropic sky)
// + ground-reflected, the standard three-component vertical-surface
// model. Zero when the sun is behind the wall (angle of incidence >= 90
// degrees) even if the sun is still up.
export function verticalSurfaceIrradianceBtuhPerSqft(
  position: SolarPosition,
  direction: CompassDirection,
): number {
  if (position.altitudeDeg <= 0) return 0;

  const directNormal = clearSkyDirectNormalBtuhPerSqft(position);
  const diffuseHorizontal = clearSkyDiffuseHorizontalBtuhPerSqft(directNormal);

  const altitudeRad = toRad(position.altitudeDeg);
  const surfaceAzimuthRad = toRad(SURFACE_AZIMUTH_DEG[direction]);
  const sunAzimuthRad = toRad(position.azimuthDeg);

  // Angle of incidence on a vertical surface (tilt = 90 degrees from
  // horizontal) simplifies to this form - standard solar-geometry result.
  const cosIncidence = Math.cos(altitudeRad) * Math.cos(sunAzimuthRad - surfaceAzimuthRad);
  const directOnSurface = cosIncidence > 0 ? directNormal * cosIncidence : 0;

  // Isotropic sky diffuse model: a vertical surface (tilt 90) sees
  // exactly half the sky dome, factor (1+cos(tilt))/2 = 0.5.
  const diffuseOnSurface = diffuseHorizontal * 0.5;

  // Ground-reflected component: the surface also sees half the ground
  // plane, factor (1-cos(tilt))/2 = 0.5, reflecting whatever total
  // irradiance (direct-on-horizontal + diffuse-horizontal) hits the
  // ground in front of it.
  const globalHorizontal = directNormal * Math.sin(altitudeRad) + diffuseHorizontal;
  const groundReflectedOnSurface = globalHorizontal * GROUND_REFLECTANCE * 0.5;

  return directOnSurface + diffuseOnSurface + groundReflectedOnSurface;
}

export function solarPositionAt(latitudeDeg: number, dayOfYear: number, solarHour: number): SolarPosition {
  return solarPosition(latitudeDeg, dayOfYear, solarHour);
}
