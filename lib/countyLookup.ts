const CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/geographies/address";

type CensusGeocoderResponse = {
  result?: {
    addressMatches?: Array<{
      coordinates?: { x?: number; y?: number }; // x = longitude, y = latitude
      geographies?: {
        Counties?: Array<{ BASENAME?: string }>;
      };
    }>;
  };
};

async function geocode(address: {
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
}): Promise<CensusGeocoderResponse["result"] | null> {
  const params = new URLSearchParams({
    street: address.addressLine1,
    city: address.city,
    state: address.state,
    zip: address.zip,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    format: "json",
  });

  try {
    const res = await fetch(`${CENSUS_GEOCODER_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data: CensusGeocoderResponse = await res.json();
    return data.result ?? null;
  } catch {
    return null;
  }
}

// Resolves a US street address to its county name (e.g. "Bell") via the
// Census Bureau's free public geocoder. Returns null on any failure so
// callers can fall back to a coarser match rather than block the page.
export async function resolveCounty(address: {
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
}): Promise<string | null> {
  const result = await geocode(address);
  const county = result?.addressMatches?.[0]?.geographies?.Counties?.[0]?.BASENAME;
  return county ?? null;
}

// Same free geocoder as resolveCounty (a separate call, not a shared one
// - the two are used from different call sites at different times and
// combining them would mean every county-only caller also pays for a
// coordinate lookup it doesn't need). Real geocoded coordinates for the
// project's actual address - this is what makes AED's solar-position
// math (lib/solarPosition.ts) a real calculation for THIS house rather
// than a generic climate-zone centroid. Returns null on any failure,
// same fallback contract as resolveCounty - callers must render an
// honest "not assessed" state, never a guessed location.
export async function resolveLatLong(address: {
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
}): Promise<{ latitude: number; longitude: number } | null> {
  const result = await geocode(address);
  const coords = result?.addressMatches?.[0]?.coordinates;
  if (coords?.y == null || coords?.x == null) return null;
  return { latitude: coords.y, longitude: coords.x };
}
