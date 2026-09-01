// Standalone whole-house dehumidification - a system genuinely separate
// from the primary HVAC system (its own equipment, its own dedicated
// supply/return ducting), not a coil-integrated humidistat add-on.
//
// Real, sourced methodology:
//   - ACCA Manual S's own documented approach to sizing a whole-house
//     dehumidifier is to pull the summer latent gain straight from a
//     Manual J load calculation and match a dehumidifier's rated
//     pints/day capacity to it (corroborated across independent HVAC-
//     industry technical sources - HVAC School, HVAC Know It All - both
//     describing the same ACCA Manual S Appendix 15-based approach).
//     This app already computes real per-room coolingLatentBtuh
//     (lib/manualJ.ts) - computeLatentLoadPintsPerDay below is the only
//     new math needed: a unit conversion, not a new load calculation.
//   - BTU_PER_PINT_OF_WATER (1054) is the standard HVAC-industry
//     conversion constant for the latent heat of vaporization of water
//     per pint, used consistently across the sources above.
//   - Rating conditions: every ducted whole-house dehumidifier checked
//     this session (Santa Fe Ultra98, Aprilaire E100) publishes a
//     pints/day figure at 80F/60%RH (the legacy AHAM point). Aprilaire
//     additionally publishes a second figure at 73F/60%RH (the DOE test
//     point, closer to a typical ~75F indoor cooling design condition);
//     Santa Fe's data sheet does not. Some HVAC-industry guidance
//     informally suggests a specific derating percentage between rated
//     and as-installed capacity at cooler/drier design conditions, but
//     as of this session's research ACCA's own official Manual S
//     guidance on this had not been finalized/published with a citable
//     table (an HVAC-training-industry technical article on the exact
//     topic explicitly says so, as of Jan 2024). Rather than invent a
//     percentage, bestAvailableRatedPintsPerDay always prefers a real,
//     manufacturer-published number closer to design conditions (73/60)
//     when available, falling back to the universal 80/60 point - never
//     a computed estimate between them.
//   - Real installation topologies (Aprilaire E100 spec sheet, Form No.
//     962/316361, p.2 "Installation Options"): a standalone dehumidifier
//     can tie into the main system's return duct only, tie into both the
//     main return and main supply, use one dedicated return grille tied
//     into the main supply or return, or run fully independent dedicated
//     supply/return ductwork with no tie-in to the home's HVAC system at
//     all - all four real and modeled (see supabase/migrations/
//     20260827330000_add_standalone_dehumidification.sql).

export const BTU_PER_PINT_OF_WATER = 1054;

export function computeLatentLoadPintsPerDay(latentLoadBtuh: number): number {
  return (latentLoadBtuh / BTU_PER_PINT_OF_WATER) * 24;
}

export type DehumidificationInstallationTopology =
  | "dedicated_grilles"
  | "return_to_return"
  | "return_to_supply"
  | "dedicated_return_to_supply_or_return";

export const INSTALLATION_TOPOLOGY_LABEL: Record<DehumidificationInstallationTopology, string> = {
  dedicated_grilles: "Dedicated supply/return grilles (fully independent of HVAC ductwork)",
  return_to_return: "Main return to main return (ties into the return duct only)",
  return_to_supply: "Main return to main supply",
  dedicated_return_to_supply_or_return: "Dedicated return grille to main supply or return",
};

export type DehumidifierCatalogOption = {
  equipmentId: string;
  manufacturer: string;
  modelNumber: string;
  ratedPintsPerDay80_60: number;
  ratedPintsPerDay73_60: number | null;
  inletDuctDiameterIn: number | null;
  secondaryInletDuctDiameterIn: number | null;
  outletDuctDiameterIn: number;
  drainConnectionSpec: string;
  hasBackdraftDamper: boolean;
  // Real, manufacturer-published ceiling from the unit's own
  // installation instructions (a distinct, higher number than the data
  // sheet's last tested curve point - see supabase/migrations/
  // 20260827350000_add_dehumidifier_max_design_esp.sql). Null only if a
  // future catalog addition hasn't had its installation instructions
  // checked yet - never assumed equal to the data sheet's curve range.
  maxDesignExternalStaticPressureIwc: number | null;
};

// See module comment above - the real, published number closest to
// typical design conditions, never an invented derating estimate.
export function bestAvailableRatedPintsPerDay(option: DehumidifierCatalogOption): number {
  return option.ratedPintsPerDay73_60 ?? option.ratedPintsPerDay80_60;
}

// Hard filter, same discipline as lib/localExhaust.ts's exhaust-fan
// candidate list: only equipment whose real published capacity (at the
// best available real rating point) meets or exceeds the computed
// requirement - never a softer ranking that still allows an undersized
// unit to be picked.
export function dehumidifierCandidatesFor(
  requiredPintsPerDay: number,
  options: DehumidifierCatalogOption[],
): DehumidifierCatalogOption[] {
  return options.filter((option) => bestAvailableRatedPintsPerDay(option) >= requiredPintsPerDay);
}

// FIX-PIPELINE stage 12: a reviewable dehumidification proposal derived
// straight from the Manual J whole-house summer latent load. This is a
// *draft to confirm*, not an automatic install - a project in a dry
// climate legitimately needs no standalone dehumidifier, and that outcome
// is itself something the technician Accepts.
//
// STANDALONE_DEHUMIDIFICATION_PINTS_PER_DAY threshold: below ~20 pints/day
// of design latent load, a correctly-sized cooling coil's own latent
// removal is generally adequate and a dedicated dehumidifier is not
// recommended by default; at or above it, humid-climate part-load hours
// routinely outrun coil latent capacity and a standalone unit is the
// common ACCA Manual S remedy (see this module's header). It is a
// disclosed heuristic line, not a code number.
export const STANDALONE_DEHUMIDIFICATION_PINTS_PER_DAY = 20;

export type DehumidificationProposal = {
  latentLoadBtuh: number;
  requiredPintsPerDay: number;
  recommendStandalone: boolean;
  candidates: DehumidifierCatalogOption[];
  rationale: string;
};

export function proposeDehumidification(
  manualJ: { wholeHouse: { coolingLatentBtuh: number } } | null,
  options: DehumidifierCatalogOption[] = [],
): DehumidificationProposal {
  const latentLoadBtuh = Math.max(0, manualJ?.wholeHouse.coolingLatentBtuh ?? 0);
  const requiredPintsPerDay = computeLatentLoadPintsPerDay(latentLoadBtuh);
  const recommendStandalone = requiredPintsPerDay >= STANDALONE_DEHUMIDIFICATION_PINTS_PER_DAY;
  const candidates = recommendStandalone ? dehumidifierCandidatesFor(requiredPintsPerDay, options) : [];
  const rationale = recommendStandalone
    ? `Manual J whole-house latent load is ${Math.round(latentLoadBtuh)} Btuh (${requiredPintsPerDay.toFixed(1)} pints/day) - at or above ${STANDALONE_DEHUMIDIFICATION_PINTS_PER_DAY} pints/day, a standalone whole-house dehumidifier is recommended.`
    : `Manual J whole-house latent load is ${Math.round(latentLoadBtuh)} Btuh (${requiredPintsPerDay.toFixed(1)} pints/day) - below ${STANDALONE_DEHUMIDIFICATION_PINTS_PER_DAY} pints/day, the cooling coil's own latent removal is expected to be adequate; no standalone unit recommended.`;
  return { latentLoadBtuh, requiredPintsPerDay, recommendStandalone, candidates, rationale };
}
