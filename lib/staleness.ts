// Data Integrity Addendum, Section 2: idle-project staleness banner logic.
// Pure function, no data fetching - page.tsx does the querying, this just
// decides which (if any) banner lines to show given the raw timestamps.
//
// Table buckets, matching the addendum's own mapping exactly:
// - equipment_catalog + equipment_performance_points are treated as ONE
//   bucket ("equipment") since both feed Manual S and the addendum's own
//   spec describes them with a single message.
// - climate is scoped to the specific climate_zone_reference row this
//   project actually uses (matched by state/county elsewhere in page.tsx),
//   not every row in the table - an unrelated state's climate data
//   changing shouldn't flag a project it has nothing to do with.
export const STALENESS_MESSAGES = {
  equipment:
    "Equipment catalog updated since you started this project — review Manual S selections before finalizing.",
  duct_sizing: "Duct sizing reference data updated — review Manual D before finalizing.",
  climate: "Climate design data updated — review Manual J before finalizing.",
  room_defaults: "Room defaults updated — review Manual J before finalizing.",
  duct_insulation_code_minimums:
    "Duct insulation code minimums updated — review Manual J duct-loss defaults and Manual D compliance flags before finalizing.",
} as const;

export type StalenessKey = keyof typeof STALENESS_MESSAGES;

export type StaleItem = { key: StalenessKey; message: string };

export function computeStaleItems(
  projectCreatedAt: string,
  tableUpdatedAt: Record<StalenessKey, string | null>,
  dismissals: { reference_table: string; dismissed_at: string }[],
): StaleItem[] {
  const latestDismissalByTable = new Map<string, number>();
  for (const d of dismissals) {
    const t = new Date(d.dismissed_at).getTime();
    const existing = latestDismissalByTable.get(d.reference_table);
    if (existing == null || t > existing) latestDismissalByTable.set(d.reference_table, t);
  }

  const projectStart = new Date(projectCreatedAt).getTime();
  const result: StaleItem[] = [];
  for (const key of Object.keys(STALENESS_MESSAGES) as StalenessKey[]) {
    const updatedAt = tableUpdatedAt[key];
    if (!updatedAt) continue;
    const updatedTime = new Date(updatedAt).getTime();
    if (updatedTime <= projectStart) continue;
    const dismissedAt = latestDismissalByTable.get(key);
    // A dismissal only suppresses the staleness event it was dismissed
    // for - if the table changed again after the dismissal, that's a new
    // event and resurfaces the banner, per the addendum's instruction.
    if (dismissedAt != null && dismissedAt >= updatedTime) continue;
    result.push({ key, message: STALENESS_MESSAGES[key] });
  }
  return result;
}
