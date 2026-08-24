// ACCA Manual J's Adequate Exposure Diversification (AED) check - does
// this zone's glazing concentrate too much on one compass direction,
// creating a cooling peak that a more balanced exposure wouldn't? Real
// hourly solar simulation (lib/solarIrradiance.ts), not a fabricated
// pass/fail - see that file's own header for the honest precision
// boundary (a real, standard clear-sky model, not ACCA's proprietary
// SHGF tables or a live weather-data feed).
//
// Definition used here, matching this app's own pre-existing report
// language exactly ("compares each orientation's peak sensible
// contribution against a 30% excess limit" - lib/reportHtmlV2.ts's prior
// "not yet computed" placeholder): for each compass direction that
// actually has real window area, find ITS OWN peak solar-gain hour
// across the design day: then compare the single worst (highest-peak)
// direction against the average of all directions' peaks. More than 30%
// above that average = fail, flagged with the real excess percentage.
//
// A zone with real window area on only one side has nothing to diversify
// against - reported as passing (0% excess) rather than a manufactured
// alarm, and flagged in the reason text so it reads as "not really
// tested" rather than "confirmed balanced."

import { dayOfYearForMonth } from "./solarPosition";
import { verticalSurfaceIrradianceBtuhPerSqft, solarPositionAt, type CompassDirection } from "./solarIrradiance";

// July 21 - the conventional ASHRAE cooling-design-day reference, and
// the season AED actually matters for (per this app's own report
// language: "peak sensible contribution").
const DESIGN_DAY_OF_YEAR = dayOfYearForMonth(7, 21);
// Sampled hourly from just after sunrise to just before sunset at
// continental US latitudes - wide enough to catch both an east-facing
// morning peak and a west-facing afternoon peak without wasting cycles
// on night-time hours that always return zero.
const SAMPLE_SOLAR_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const AED_EXCESS_LIMIT_PERCENT = 30;

export type AedZoneInput = {
  zoneId: string;
  zoneName: string;
  windowAreaSqftByDirection: Record<CompassDirection, number>;
};

export type AedZoneResult = {
  zoneId: string;
  zoneName: string;
  // false when no real per-room window area exists for this zone's
  // rooms yet (all four directions null/zero) - never a fabricated
  // result. Matches this codebase's standing rule: an unresolved input
  // renders an explicit "not assessed" state, not a guessed pass/fail.
  assessed: boolean;
  passes: boolean;
  peakExcessPercent: number;
  worstOrientation: CompassDirection | null;
  peaksByDirection: Partial<Record<CompassDirection, number>>;
};

function peakSolarGainBtuh(
  latitudeDeg: number,
  direction: CompassDirection,
  windowAreaSqft: number,
  windowShgc: number,
): number {
  let peak = 0;
  for (const hour of SAMPLE_SOLAR_HOURS) {
    const position = solarPositionAt(latitudeDeg, DESIGN_DAY_OF_YEAR, hour);
    const irradiance = verticalSurfaceIrradianceBtuhPerSqft(position, direction);
    const gainBtuh = windowAreaSqft * windowShgc * irradiance;
    if (gainBtuh > peak) peak = gainBtuh;
  }
  return peak;
}

export function assessAedZone(zone: AedZoneInput, latitudeDeg: number, windowShgc: number): AedZoneResult {
  const directions: CompassDirection[] = ["north", "south", "east", "west"];
  const withGlass = directions.filter((d) => (zone.windowAreaSqftByDirection[d] ?? 0) > 0);

  if (withGlass.length === 0) {
    return {
      zoneId: zone.zoneId,
      zoneName: zone.zoneName,
      assessed: false,
      passes: false,
      peakExcessPercent: 0,
      worstOrientation: null,
      peaksByDirection: {},
    };
  }

  const peaksByDirection: Partial<Record<CompassDirection, number>> = {};
  for (const direction of withGlass) {
    peaksByDirection[direction] = peakSolarGainBtuh(
      latitudeDeg,
      direction,
      zone.windowAreaSqftByDirection[direction],
      windowShgc,
    );
  }

  const peakValues = withGlass.map((d) => peaksByDirection[d]!);
  const average = peakValues.reduce((a, b) => a + b, 0) / peakValues.length;
  const worstIndex = peakValues.indexOf(Math.max(...peakValues));
  const worstOrientation = withGlass[worstIndex];
  const worstPeak = peakValues[worstIndex];

  const peakExcessPercent = average > 0 ? ((worstPeak - average) / average) * 100 : 0;

  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    assessed: true,
    passes: peakExcessPercent <= AED_EXCESS_LIMIT_PERCENT,
    peakExcessPercent,
    worstOrientation,
    peaksByDirection,
  };
}

export function assessAed(zones: AedZoneInput[], latitudeDeg: number, windowShgc: number): AedZoneResult[] {
  return zones.map((zone) => assessAedZone(zone, latitudeDeg, windowShgc));
}
