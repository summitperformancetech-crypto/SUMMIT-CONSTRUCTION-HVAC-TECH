const CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/geographies/address";

type CensusGeocoderResponse = {
  result?: {
    addressMatches?: Array<{
      geographies?: {
        Counties?: Array<{ BASENAME?: string }>;
      };
    }>;
  };
};

// Resolves a US street address to its county name (e.g. "Bell") via the
// Census Bureau's free public geocoder. Returns null on any failure so
// callers can fall back to a coarser match rather than block the page.
export async function resolveCounty({
  addressLine1,
  city,
  state,
  zip,
}: {
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
}): Promise<string | null> {
  const params = new URLSearchParams({
    street: addressLine1,
    city,
    state,
    zip,
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
    const county = data.result?.addressMatches?.[0]?.geographies?.Counties?.[0]?.BASENAME;
    return county ?? null;
  } catch {
    return null;
  }
}
