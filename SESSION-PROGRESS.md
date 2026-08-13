# Session Progress — Ceiling Height & Window Area wiring

Scope (per user, this pass only): add `ceiling_height_ft` and window area as
real fields flowing extraction -> Apply to Form -> `rooms` table, both INSERT
and UPDATE branches. Do NOT touch the floor-area UPDATE-branch gap. Do NOT
overwrite existing wall-length/R-value data on Kinsela until traced. Do not
regress duct defaults or calculation snapshotting.

## Status: investigating

- 2026-08-12 21:40 — Started. Read `lib/orientation.ts` and
  `components/building-orientation-section.tsx` to understand the existing
  front/rear/left/right -> north/south/east/west rotation mechanism (the
  "Save & Auto-Fill Walls" button), so window area can mirror it rather than
  duplicate it.
- 2026-08-12 21:40 — Confirmed via the *current* Kinsela extracted_data:
  this drawing's extraction has `wall_front/rear/left/right_len_ft` AND
  `wall_north/south/east/west_len_ft` **all null** for every room (no
  orientation detected, and the model didn't fill the front/rear fallback
  either). This means re-running Apply to Form on Kinsela today is a
  guaranteed no-op on wall-length fields (`hasWallData` false for every
  room) — safe with respect to the user's "don't overwrite provenance-
  unclear wall data" instruction. The real DB wall values on Kinsela's rooms
  must predate this extracted_data; origin not yet fully traced (rooms table
  has no `updated_at` column to check). Will re-verify this empirically
  (dry run) before executing any real write during this pass, and will not
  touch wall-length or duct fields at all in this pass' code changes.
- 2026-08-12 21:55 — Design decided: `ceiling_height_ft` will be a single
  building-wide value extracted at `building_envelope` level (mirroring
  `wall_insulation_r_value`'s pattern) and broadcast to every room that
  doesn't already have one — not a per-room AI extraction (too fragile to
  correlate). Window area mirrors the existing wall-length precedent
  exactly: compass fields (`window_north/south/east/west_area_sqft`,
  already exist, already consumed by `computeManualJ`) when orientation is
  detected, drawing-relative fields (`window_front/rear/left/right_area_sqft`,
  new) when it isn't. Deliberately NOT extending
  `BuildingOrientationSection` to rotate window fields in this pass (out of
  the requested scope) — flagged as a follow-up. On Kinsela specifically
  (no orientation detected), this means only the front/rear/left/right
  window fields will actually populate this round.
- 2026-08-12 21:58 — Migration `20260813030300_add_window_drawing_relative_area.sql`
  written and applied directly to the live DB (`rooms` table) via `pg` +
  `SUPABASE_DB_URL`: adds `window_front/rear/left/right_area_sqft`. Verified
  via `information_schema.columns` — present. `ceiling_height_ft` and
  `window_north/south/east/west_area_sqft` already existed pre-session (no
  migration needed for those).
- 2026-08-12 22:00 — Starting code changes: `lib/drawingExtraction.ts`
  (schema + prompt), `components/drawings-section.tsx` (handleApply
  mapping), `components/manual-j-workflow.tsx` (INSERT/UPDATE payloads).
- 2026-08-12 22:20 — Code changes complete:
  - `lib/drawingExtraction.ts`: added `ceiling_height_ft` to
    `ExtractedEnvelope` (building-wide default, STEP 4 in the prompt); added
    8 window-area fields to `ExtractedRoom` (compass + drawing-relative,
    mirroring the wall-length split exactly, STEP 3 in the prompt).
    `collectUnresolvedItems` needed no changes (both loops are already
    generic over keys/room.unresolved).
  - `components/drawings-section.tsx`: `handleApply` now resolves
    `ceiling_height_ft` into the envelope object passed to `onApply`
    (same `resolvedEnvelopeNumber` pattern as the R-values).
  - `components/manual-j-workflow.tsx`: `ExtractableEnvelopeFields` gained
    `ceiling_height_ft` (explicitly NOT a projects column - documented
    inline); `RoomRow` gained the 4 new drawing-relative window columns;
    `ROOM_COLUMNS` updated. INSERT payload now writes real
    `ceiling_height_ft`/window values instead of hardcoded `null`. UPDATE
    (existing-rooms) branch: added `hasWindowData` (mirrors `hasWallData`)
    and `hasCeilingHeightFill` (fill-only-if-target-is-null, deliberately
    more conservative than wall/duct's unconditional overwrite, since a
    per-room ceiling height is more likely to be a hand-corrected
    exception). Restructured the loop so room-name matching happens before
    the "any data to apply?" skip check, since ceiling-height fill needs to
    know the matched room's current value to decide relevance.
    `floorAreaMismatch`'s guard now covers window data too (was wall-only).
- 2026-08-12 22:22 — `npx tsc --noEmit`: clean, no errors.
- 2026-08-12 22:22 — Next: verify a real extraction run picks up the new
  prompt fields, then verify Apply to Form writes/persists them on Kinsela,
  without touching wall-length/duct fields (still expected to be a no-op
  per the 21:40 finding above - will re-confirm empirically).
- 2026-08-12 22:30 — Backed up the live `drawings` row for Kinsela
  (`.scratch-drawing-backup.json`, gitignored/local only) before doing
  anything that touches `extracted_data`. Kicked off a real extraction call
  (`npx tsx .scratch-verify-extraction.mts`) against the actual Kinsela PDF,
  using the exact production `EXTRACTION_PROMPT`/`applyDuctFallbackDefaults`
  imported from `lib/drawingExtraction.ts` (same model/params as
  `app/api/drawings/extract/route.ts`) — writes to a local JSON file only,
  not to the DB yet, so the result can be reviewed before deciding whether
  to apply it.
- 2026-08-12 22:40 — **First real extraction attempt FAILED**:
  `SyntaxError: Unterminated string in JSON at position 22959`. This looks
  like the exact `max_tokens` truncation bug fixed in commit e3292cc, now
  possibly reintroduced: the 8 new window-area fields I added per room
  substantially grew the per-room JSON, and `max_tokens: 8192` in
  `app/api/drawings/extract/route.ts` was tuned against the OLD (smaller)
  schema's measured usage. Re-running with raw-response capture (before
  JSON.parse) to confirm `stop_reason` and measure actual token usage
  before deciding on a new `max_tokens` value. Have NOT written anything to
  the `drawings` table yet - the Kinsela drawing's real extracted_data is
  untouched.
- 2026-08-13 22:45 — **Confirmed**: `stop_reason: max_tokens`,
  `output_tokens: 8192` (hit the cap exactly). Raw response cut off mid-way
  through room 22 of 25 (`"window_south_area_sq` truncated). Diagnosis:
  `max_tokens: 8192` in `app/api/drawings/extract/route.ts` was tuned
  against the pre-window-area schema; the 8 new window-area fields per room
  regressed the exact bug fixed in commit e3292cc.
  - Math: 8192 tokens covered ~21.5/25 rooms => ~369 tokens/room under the
    new schema => ~9500 tokens needed for all 25 rooms.
  - **Fix applied**: raised `max_tokens` to 16000 in
    `app/api/drawings/extract/route.ts` (~40% headroom over the ~9500
    estimate, same headroom philosophy as the original fix) and updated
    the route's inline comment with the real numbers. Re-running the
    verification extraction now with the corrected limit.
- 2026-08-13 22:55 — **Second extraction attempt SUCCEEDED**: `stop_reason:
  end_turn`, `output_tokens: 9938` (well under the new 16000 cap, matches
  the ~9500 estimate). `building_envelope.ceiling_height_ft` extracted a
  real value: **10 (ft), unresolved: true**. Window area: genuinely **all
  null** across all 26 rooms - the model correctly declined to guess (no
  window schedule with legible dimensions found on this sheet set,
  consistent with STEP 3's "don't guess" instruction working as intended).
  Wrote this extraction to `drawings.extracted_data` (same effect as a real
  Extract click).
- 2026-08-13 23:00 — **STOPPED before executing Apply, per instruction.**
  Dry-ran the room-matching/update logic (no writes) against Kinsela's real
  25 rooms. Findings:
  - This extraction run produced somewhat different room names than the
    stored ones (AI non-determinism: "Dining"->"Dining Room",
    "Laundry"->"Laundry Room", new "Bedroom 3" found, etc.) - 19/26 rooms
    still match by exact name, 7 don't (existing `unmatchedRoomNotes`
    mechanism would report them, unchanged behavior, not a problem).
  - **Of the 19 matches, 8 rooms have wall_front/rear/left/right data in
    this new extraction that DIFFERS from what's already in the DB** -
    front/rear appear swapped with left/right vs. the stored values (e.g.
    Kitchen: DB has front=13/rear=13/left=21.75/right=21.75, new
    extraction has front=21.75/rear=21.75/left=13/right=13). Running the
    real (unchanged) wall-update logic would silently overwrite this data,
    since it always overwrites when `hasWallData` is true - no "already
    has a value" guard (same pre-existing behavior duct data has always
    had). Kitchen, Foyer, Home Office, Bedroom 2, Mud Room, Hidden Pantry,
    Bath 3, 3-Car Garage, Rear Porch affected.
  - **Not executing this write.** Per instruction: "If Apply-to-Form would
    overwrite those specific fields on existing rooms, flag it and stop
    before executing." Flagging now, reporting to user before doing
    anything further with wall data specifically.
  - `ceiling_height_ft` fill is unaffected by this finding - every matched
    room's `ceiling_height_ft` is currently null in the DB, so there is
    zero overwrite risk there. Proceeding to verify that piece in
    isolation from the wall-data question, via a scoped write that touches
    only `ceiling_height_ft` (not the shared duct/wall/window update path).
- 2026-08-13 23:05 — **Ceiling height verified live on Kinsela, end to
  end**: scoped write (real RLS-scoped session, magic-link auth as the real
  project user) filled `ceiling_height_ft=10` on 19/25 rooms (the 19 that
  name-matched this extraction run; the other 6 kept their names from the
  earlier extraction and didn't match - expected, same
  `unmatchedRoomNotes`-covered situation as any other re-extraction).
  Independently re-verified via the service-role client (separate query,
  separate credential path) - confirms real persistence, not a
  session-cache artifact. Extracting: yes. Mapped: yes. Written: yes.
  Persisted: yes, confirmed live.
- 2026-08-13 23:05 — `npx tsc --noEmit`: clean after all changes
  (schema/prompt, `ExtractableEnvelopeFields`, `RoomRow`, `ROOM_COLUMNS`,
  INSERT/UPDATE payloads, `max_tokens` fix).

## Status: PAUSED — reporting back per instruction, not proceeding further

Two things need your decision before I continue:

1. **Wall-length overwrite risk (the flagged item).** Not resolved, not
   executed. The 8 affected rooms' existing wall_front/rear/left/right
   values are untouched in the DB right now.
2. **Window area has no real non-null data to verify against** on this
   drawing (no window schedule was legible to the model). The write/read
   code path is implemented, type-checks, and structurally mirrors the
   now-verified ceiling-height and original wall-length precedents, but
   has not been proven against real non-null data end-to-end the way
   ceiling height has.

Not touching floor-area UPDATE-branch gap or provenance cleanup yet, per
instruction, pending your read on the above.
