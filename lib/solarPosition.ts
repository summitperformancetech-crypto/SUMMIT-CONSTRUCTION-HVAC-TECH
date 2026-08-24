// Real solar-position astronomy (NOAA Solar Calculator's equations - the
// same standard formulas behind noaa.gov/goodies/sunrise, not invented
// here). Computed in LOCAL SOLAR TIME (hour angle from solar noon), not
// civil clock time - AED is a design-day analysis about hours-relative-
// to-solar-noon, not "what a wall clock reads," so this deliberately
// sidesteps timezone/DST entirely rather than adding a real error source
// (a wrong timezone would silently shift every orientation's computed
// peak hour) for a distinction the test doesn't actually need.

export type SolarPosition = {
  altitudeDeg: number; // 0 = horizon, 90 = straight overhead. Negative = below horizon (night).
  azimuthDeg: number; // 0 = north, 90 = east, 180 = south, 270 = west (compass bearing).
};

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

// Cooper's equation - a standard, widely-used approximation for solar
// declination accurate to within about 1 degree, more than sufficient
// for a design-day HVAC calculation (vs. a full multi-term Fourier
// series, which buys precision this application has no use for).
export function solarDeclinationDeg(dayOfYear: number): number {
  return 23.45 * Math.sin(toRad((360 / 365) * (284 + dayOfYear)));
}

// solarHour: 0-24, LOCAL SOLAR TIME (12.0 = solar noon, the sun's
// highest point that day at this longitude - not necessarily 12:00 on a
// clock).
export function solarPosition(latitudeDeg: number, dayOfYear: number, solarHour: number): SolarPosition {
  const declRad = toRad(solarDeclinationDeg(dayOfYear));
  const latRad = toRad(latitudeDeg);
  const hourAngleRad = toRad(15 * (solarHour - 12));

  const sinAltitude =
    Math.sin(declRad) * Math.sin(latRad) + Math.cos(declRad) * Math.cos(latRad) * Math.cos(hourAngleRad);
  const altitudeRad = Math.asin(Math.max(-1, Math.min(1, sinAltitude)));
  const altitudeDeg = toDeg(altitudeRad);

  if (altitudeDeg <= 0) {
    // Sun below the horizon - azimuth is meaningless at night, but a
    // caller checking altitudeDeg first (as every irradiance function
    // below does) never reaches here for a real calculation.
    return { altitudeDeg, azimuthDeg: 180 };
  }

  const cosAzimuth =
    (Math.sin(declRad) * Math.cos(latRad) - Math.cos(declRad) * Math.sin(latRad) * Math.cos(hourAngleRad)) /
    Math.cos(altitudeRad);
  const azimuthFromNorthRad = Math.acos(Math.max(-1, Math.min(1, cosAzimuth)));
  // acos alone can't distinguish morning (sun in the east) from
  // afternoon (sun in the west) - the hour angle's sign does: negative
  // hour angle = before solar noon = sun in the east.
  const azimuthDeg = hourAngleRad < 0 ? toDeg(azimuthFromNorthRad) : 360 - toDeg(azimuthFromNorthRad);

  return { altitudeDeg, azimuthDeg };
}

export function dayOfYearForMonth(month: number, day: number): number {
  const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let total = day;
  for (let m = 0; m < month - 1; m++) total += DAYS_IN_MONTH[m];
  return total;
}
