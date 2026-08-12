// Single source of truth for the 8-point compass values used by
// projects.building_front_faces (see migration
// 20260812094002_add_building_orientation.sql) and lib/orientation.ts's
// front/rear/left/right transform. Values are stored in clockwise order
// starting at North - every direction is exactly 45 degrees from its
// neighbors, which is what makes the +/-90/180 degree transform in
// lib/orientation.ts a plain array-index rotation rather than real
// trigonometry.
export const COMPASS_8_VALUES = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export type Compass8 = (typeof COMPASS_8_VALUES)[number];

export const COMPASS_8_LABELS: Record<Compass8, string> = {
  N: "North",
  NE: "Northeast",
  E: "East",
  SE: "Southeast",
  S: "South",
  SW: "Southwest",
  W: "West",
  NW: "Northwest",
};

export const COMPASS_8_OPTIONS: ReadonlyArray<{ value: Compass8; label: string }> =
  COMPASS_8_VALUES.map((value) => ({ value, label: COMPASS_8_LABELS[value] }));

// The 4 cardinal directions are the only ones lib/manualJ.ts's wallLenFt/
// wallExposure (and the rooms.wall_north/south/east/west_len_ft columns
// they read) actually support - a pre-existing constraint of the Manual J
// solar-gain model, not something this feature changes. Used to decide
// whether an 8-point rotation result can actually be written to a room.
export const CARDINAL_COMPASS_VALUES = new Set<Compass8>(["N", "E", "S", "W"]);

export function isCardinalCompass(value: Compass8): value is "N" | "E" | "S" | "W" {
  return CARDINAL_COMPASS_VALUES.has(value);
}
