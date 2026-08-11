// Single source of truth for the duct_location enum. Previously this list
// was hardcoded independently in three places (lib/manualJ.ts's
// DUCT_UNCONDITIONED_LOCATIONS, room-form.tsx's DUCT_LOCATION_OPTIONS, and
// the rooms_duct_location_check DB constraint) which had already drifted
// once (the AI extraction prompt used its own lowercase examples that
// matched none of them - see EXTRACTION_PROMPT in lib/drawingExtraction.ts
// and normalizeDuctLocation below). Changing the set of valid locations now
// means: edit DUCT_LOCATION_VALUES/LABELS/UNCONDITIONED here, then write a
// new migration updating rooms_duct_location_check
// (supabase/migrations/20260810210059_add_ducts.sql) to match - the two
// are not auto-synced, since Postgres check constraints can't read a TS
// file, but this is now the only place the *application* needs to change.
export const DUCT_LOCATION_VALUES = [
  "Attic-Unconditioned",
  "Attic-Conditioned",
  "Crawlspace",
  "Basement-Conditioned",
  "Basement-Unconditioned",
  "Conditioned-Space",
  "Exterior-Wall",
] as const;

export type DuctLocation = (typeof DUCT_LOCATION_VALUES)[number];

export const DUCT_LOCATION_LABELS: Record<DuctLocation, string> = {
  "Attic-Unconditioned": "Attic (unconditioned)",
  "Attic-Conditioned": "Attic (conditioned/sealed)",
  Crawlspace: "Crawlspace",
  "Basement-Conditioned": "Basement (conditioned)",
  "Basement-Unconditioned": "Basement (unconditioned)",
  "Conditioned-Space": "Conditioned space",
  "Exterior-Wall": "Exterior wall",
};

export const DUCT_LOCATION_OPTIONS: ReadonlyArray<{ value: DuctLocation; label: string }> =
  DUCT_LOCATION_VALUES.map((value) => ({ value, label: DUCT_LOCATION_LABELS[value] }));

// Locations whose ducts run outside the conditioned envelope, i.e. subject
// to the duct gain/loss term in lib/manualJ.ts's ductRScaleFactor.
// Conditioned-space and conditioned-attic/basement ducts sit inside the
// thermal envelope and contribute no separate duct loss.
export const DUCT_UNCONDITIONED_LOCATIONS = new Set<DuctLocation>([
  "Attic-Unconditioned",
  "Crawlspace",
  "Basement-Unconditioned",
  "Exterior-Wall",
]);

function isDuctLocation(value: string): value is DuctLocation {
  return (DUCT_LOCATION_VALUES as readonly string[]).includes(value);
}

// Safety net for AI-extracted duct_location values, which come from a
// model's free-text read of a drawing rather than a constrained input -
// even with the prompt now listing exact enum values (see
// EXTRACTION_PROMPT), a model can still drift back to a natural-language
// guess like "attic" or "crawl space". Anything that survives this as
// unmapped is dropped to null rather than sent to the DB, where it would
// violate rooms_duct_location_check and fail the entire insert batch
// (see Phase 2 code review item #1/#2 - a bad enum value from one room
// used to silently kill room creation for every room in the batch).
const DUCT_LOCATION_ALIASES: Record<string, DuctLocation> = {
  attic: "Attic-Unconditioned",
  "unconditioned attic": "Attic-Unconditioned",
  "vented attic": "Attic-Unconditioned",
  "conditioned attic": "Attic-Conditioned",
  "sealed attic": "Attic-Conditioned",
  "crawl space": "Crawlspace",
  crawlspace: "Crawlspace",
  basement: "Basement-Unconditioned",
  "unconditioned basement": "Basement-Unconditioned",
  "conditioned basement": "Basement-Conditioned",
  "conditioned space": "Conditioned-Space",
  interior: "Conditioned-Space",
  "living space": "Conditioned-Space",
  "exterior wall": "Exterior-Wall",
  "in wall": "Exterior-Wall",
};

export function normalizeDuctLocation(raw: string | null | undefined): DuctLocation | null {
  if (!raw) return null;
  if (isDuctLocation(raw)) return raw;
  return DUCT_LOCATION_ALIASES[raw.trim().toLowerCase()] ?? null;
}
