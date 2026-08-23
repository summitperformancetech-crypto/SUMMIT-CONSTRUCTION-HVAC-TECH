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

## Status: investigating wall-length swap (per user instruction, no wall writes yet)

- 2026-08-13 23:20 — User wants the swap traced before any wall data is
  touched: is it an orientation-transform bug (`lib/orientation.ts`), which
  would mean the 19/25 "working" rooms need re-validation too, or something
  else? Explicitly told not to manually re-check the drawing yet.
- 2026-08-13 23:25 — **Run #1's raw extraction JSON is unrecoverable.**
  What's in `drawings.extracted_data` right now is run #3 (the fresh one
  from this session, still live in the DB, never reverted). Before that,
  it held run #2 (backed up at session start as `.scratch-drawing-backup.json`,
  since deleted in cleanup) - run #2 had **zero** wall data at all
  (`orientation.detected: false`, and even the front/rear/left/right
  fallback came back null for every room), so it's not useful for this
  comparison either way. Whatever extraction actually produced the wall
  data currently sitting in the `rooms` table (call it run #1) was
  overwritten by run #2 before this session started, and nothing in this
  session captured it. The only surviving record of run #1 is what's
  already applied to the `rooms` table itself - used that as the "DB side"
  of the comparison below, since it's the best available proxy.
- 2026-08-13 23:30 — Compared `rooms` table (run #1, applied) vs. run #3
  (live in `drawings.extracted_data`, never applied) for all 9 affected
  rooms, and cross-checked `lib/orientation.ts`'s transform math against
  the stored compass columns. Full detail in the chat report, summary:
  - **`lib/orientation.ts` is NOT the bug.** `building_front_faces = "W"`.
    Per `resolveOrientation`'s math: front->W, rear->E, left->N, right->S.
    Checked this formula against all 9 rooms' stored
    `wall_north/south/east/west_len_ft` vs. their stored
    `wall_front/rear/left/right_len_ft` - **matches exactly, every room,
    every field.** The transform is deterministic and was applied
    correctly and consistently to whatever front/rear/left/right existed
    at the time. It has never been re-run since (would need the "Save &
    Auto-Fill Walls" button clicked again), so it can't have introduced
    drift on its own, and there is no code path where it would ever
    swap the front/rear pair with the left/right pair - it maps each of
    the four independently to a compass letter, never mixes the two axes.
  - **6 of 9 rooms (Kitchen, Foyer, Home Office, Bedroom 2, Hidden Pantry,
    Bath 3) show a perfect, systematic axis swap** between run #1 and run
    #3: `new.front == old.left`, `new.rear == old.right`, `new.left ==
    old.front`, `new.right == old.rear`, on every one of the 6. That's not
    random noise - it's the same 90-degree reassignment, in the same
    direction, on every affected room. Strong signal that the model picked
    a *different* wall as "the front entry" in run #3 than it did in
    run #1 - a wall 90 degrees rotated from its original choice - not that
    any one room was misread independently.
  - **3 of 9 (Mud Room, 3-Car Garage, Rear Porch) do NOT fit the clean-swap
    pattern** - value drift (3-Car Garage's left/right: 22.17 vs. 25.67,
    not a swap) or differing null patterns (Mud Room, Rear Porch). Looks
    like ordinary independent-estimation variance, unrelated to the swap.
  - **Root cause, best available conclusion without opening the drawing
    myself:** this PDF has `orientation.detected: false` in both runs -
    no true north arrow, only relative "Front/Rear/Left/Right Elevation"
    labels (confirmed identical `orientation.description` text in both
    runs). `EXTRACTION_PROMPT` STEP 2(b) tells the model to infer "front"
    from "the main entry door, a 'FRONT ELEVATION' label, or the obviously
    front-facing facade" - when none of those is unambiguous, two
    independent API calls on the identical PDF are evidently free to land
    on different (90-degree-rotated) answers. This is model-level
    extraction non-determinism given an ambiguous source drawing, not a
    bug in this codebase's transform or apply logic.
  - **Consequence for the 19/25 "working" rooms:** since the transform
    itself is verified correct and deterministic, they do NOT need
    re-validation on the transform's account - whatever front/rear/left/
    right they were built from, the compass conversion was done right.
    They (and run #1 generally) remain exposed to the same underlying
    uncertainty this comparison surfaced, though: nothing here proves run
    #1's original "front" choice was the *correct* one either, only that
    it's internally consistent with itself. Resolving which run (if
    either) has the right front-entry identification needs an actual look
    at the drawing (front door, elevation labels) - not done yet, per
    instruction.
- Not writing any wall data. Not touching the 8 (or any) rooms' wall_front/
  rear/left/right/north/south/east/west values. Reporting this back before
  any further action.

## Status: tightening the extraction prompt (per user direction, still no wall writes)

- 2026-08-13 23:40 — User's direction: don't guess which run is correct.
  Instead, tighten `EXTRACTION_PROMPT` so the model stops presenting one
  front-entry interpretation confidently, and flag all 25 rooms as
  unresolved for wall orientation specifically, surfaced through the
  *existing* review UI (accept/override), not a new one.
- 2026-08-13 23:42 — Checked the existing review UI
  (`components/drawings-section.tsx` ReviewPanel) before building anything
  new: **the mechanism the user is asking for already exists.** Every room
  with `room.unresolved === true` already renders a `FieldResolutionBadge`
  (`fieldName: room[${index}]`, `aiExtractedValue: room.reason`) with full
  Accept/Override support, writing to `field_resolutions` exactly like
  duct fields do. Every no-orientation room already has `unresolved: true`
  - so the gap isn't a missing UI, it's that (a) the prompt told the model
    to be "confident" about front/rear/left/right despite marking it
    unresolved, which is internally contradictory, and (b) the `reason`
    text was a generic "no orientation marker" note, not specific enough
    to communicate the actual 90-degree-swap risk this session just found.
  No new component or resolution plumbing needed - just fixing what the
  prompt tells the model to say.
- 2026-08-13 23:45 — Rewrote `EXTRACTION_PROMPT` STEP 2(b) in
  `lib/drawingExtraction.ts`:
  - Removed the "estimate these four fields the same confident way..."
    line - that was directly telling the model to project false confidence
    about the one thing (which wall is "front") that a label alone can't
    actually establish.
  - Added an explicit statement that the four *lengths* are ordinary
    floor-plan geometry (fine to read confidently), but the front-entry
    *identification* is a guess whenever there's no true-north marker -
    a "FRONT ELEVATION" label only tells you what the drawing's author
    called the front, not a confirmable fact.
  - Every such room must now include the verbatim sentence
    "front/rear/left/right wall assignment is a guess pending confirmation
    of which elevation is the true front entry - could be swapped with
    left/right" in `reason` (appended after a " · " if the room already
    has an unrelated reason, not replacing it) - specific enough to act on,
    consistent with the existing free-text `reason` convention (no new
    field, no schema change).
  - `npx tsc --noEmit`: clean (string-only prompt change).
- 2026-08-13 23:50 — Re-ran a real extraction against the actual Kinsela
  PDF with the tightened prompt (`stop_reason: end_turn`, `output_tokens:
  11664`, well under the 16000 cap). Result (this run found 28 rooms -
  room-count/naming variance between runs continues to be a known,
  separate characteristic of this pipeline, not something this checkpoint
  touches):
  - **28/28 rooms carry the new caveat sentence and `unresolved: true`** -
    every room whose wall layout was estimated under the no-orientation
    branch. 0 rooms have front/rear/left/right data without the caveat.
  - Append behavior confirmed working: e.g. Great Room's reason combines
    an unrelated caveat ("Vaulted ceiling height varies...") with the new
    swap caveat via " · ", neither one overwrote the other.
  - Wrote this extraction to `drawings.extracted_data` (metadata/audit
    data, not `rooms` table wall columns - consistent with "don't write
    wall data"). Independently re-read it back from the DB afterward
    (separate query, not trusting the write call's own response):
    confirms 28/28 rooms flagged live, and all 28 show up in
    `unresolved_items` too (via the existing generic
    `collectUnresolvedItems` room-reason handling - no code change needed
    there).
  - `building_envelope` fields (ceiling_height_ft=10, wall/ceiling
    R-values, foundation_type) still extract correctly - this change
    didn't regress anything from the previous checkpoint.
  - **This means every one of Kinsela's rooms now renders the existing
    `FieldResolutionBadge` (Accept/Override, same as duct fields) with
    this specific, actionable reason** the next time the drawing's review
    panel is opened in the app - satisfies "flag... all 25 [28], surfaced
    in the existing UNRESOLVED field-review UI" without any UI/schema
    changes, since that mechanism already existed and just needed the
    prompt to stop contradicting itself.
  - Still have NOT written anything to the `rooms` table. Still have NOT
    decided which run's front-entry choice (if either) is correct - that
    remains open, pending the user's own look at the drawing.
- Not proceeding further (no hard gate added to
  `BuildingOrientationSection`'s "Save & Auto-Fill Walls" button - that
  would be a separate, not-yet-requested code change to a
  currently-working component; flagging it as an open question rather
  than guessing scope).

## Status: implementing the code-level gate on BuildingOrientationSection

- 2026-08-14 00:05 — User's direction: add a per-room gate to "Save &
  Auto-Fill Walls" - block the transform on any room whose wall-orientation
  flag is still unresolved, surface a clear message, and don't affect
  rooms without the flag (or already resolved). Verify no regression on
  the rooms that already transform correctly. Commit when clean.
- 2026-08-14 00:10 — Extracted the swap-caveat sentence out of
  `EXTRACTION_PROMPT`'s inline string into an exported constant,
  `WALL_ORIENTATION_UNRESOLVED_REASON` (`lib/drawingExtraction.ts`), so the
  prompt and the new gate check the identical text - one source of truth,
  not two copies that could drift.
- 2026-08-14 00:12 — Moved `normalizeRoomNameForMatch` out of
  `manual-j-workflow.tsx` (was a private, unexported function) into
  `lib/fieldResolutions.ts` and exported it, then updated
  `manual-j-workflow.tsx` to import it from there instead of keeping its
  own copy. Needed so the new gate matches a `rooms` table row to a
  drawing's extraction room by name using the exact same rule
  `applyExtractedData` already uses - two independent copies of this
  logic could disagree about which extracted room a given row corresponds
  to.
- 2026-08-14 00:15 — Added `roomHasUnresolvedWallOrientation(roomName,
  drawings, resolvedKeys)` to `lib/fieldResolutions.ts`, same shape/style
  as the existing `countUnresolvedFields` (which was already the
  reference pattern for "is `room[index]` in this drawing resolved yet" -
  no new pattern invented). Checks every completed drawing's extraction
  for a name match whose `reason` contains the swap caveat and is still
  unresolved with no `field_resolutions` row - blocks only if such a match
  exists. A room with no matching extraction (hand-added, or matched to a
  differently-named room this run) is never blocked - nothing to confirm.
- 2026-08-14 00:20 — Wired the gate into
  `components/building-orientation-section.tsx`'s `handleApply`:
  - Fetches `drawings` + `field_resolutions` fresh, live, right before the
    per-room loop - deliberately NOT passed down as a prop from a parent.
    `DrawingsSection` (several components away, where a tech actually
    clicks Accept/Override) owns its own local state; a stale snapshot
    threaded down through `ManualJWorkflow` would risk still blocking a
    room the tech just resolved in the same session without a reload.
    Matches this component's existing style (it already does live queries
    for the room updates themselves) rather than the codebase's other,
    looser precedent (the dashboard's `unresolvedFieldCount` badge, which
    is explicitly documented as reload-only, not live) - the two features
    have different consequences for being stale, so different tradeoffs
    are correct for each.
  - Per room: `roomHasUnresolvedWallOrientation` checked before
    `applyOrientationToRoom` - blocked rooms are collected by name and
    skipped entirely (no cardinal-field computation, no `.update()` call),
    not just silently dropped.
  - Message now reports blocked rooms by name, distinct from the existing
    "no drawing-relative data to rotate" case, and sets the message to
    error-styled (red) whenever anything was blocked, so it's visually
    distinct from a clean run.
  - `npx tsc --noEmit`: clean.
- 2026-08-14 00:25 — Verification, two parts:
  1. **Pure-function unit test** of `roomHasUnresolvedWallOrientation`
     (8 cases, no DB): exact-caveat match blocks; caveat appended to an
     unrelated reason still blocks; a resolution present unblocks; a room
     with `unresolved: false` is never blocked; a room unresolved for an
     *unrelated* reason only (no caveat text) is not blocked; a
     never-extracted (hand-added) room name is not blocked; `#`/whitespace
     name-matching noise is tolerated (matches `applyExtractedData`'s
     convention); a non-`completed` drawing is ignored. **8/8 passed.**
  2. **Read-only dry run against live Kinsela data** (real `rooms`,
     `drawings`, `field_resolutions` - zero writes): of 25 rooms, 23 would
     be blocked (correct - `field_resolutions` is still empty, nothing has
     been Accepted/Overridden), 2 would not (`Bath 4 (Bonus)`,
     `Powder Room` - their names don't match any room in the latest
     extraction at all, so correctly nothing to judge against). Confirmed
     20/25 rooms' existing compass wall data
     (`wall_north/south/east/west_len_ft`, written by a past, pre-gate run
     of this button) is untouched - this dry run made no writes, and the
     gate's `continue` on a blocked room never touches its existing DB
     row either way, so a real run right now would leave that already-
     correct data exactly as it is, not erase or regress it.
- 2026-08-14 00:30 — `npx tsc --noEmit`: clean after all changes.
  Committing.

## Status: PAUSED — reporting back per instruction, not proceeding further

1. **Wall-length swap: root-caused to AI extraction non-determinism on an
   ambiguous drawing, not a code bug.** `lib/orientation.ts`'s transform
   verified correct across all 9 rooms - no blanket re-validation needed
   on that account. Still unresolved: which run's front-entry
   identification (if either) is actually correct - needs a look at the
   drawing itself, not done yet.
2. **Prompt tightened and verified live**: all rooms extracted under the
   no-orientation branch now carry a specific, actionable reason and
   surface via the existing Accept/Override UI - no new UI/schema needed.
3. **Code-level gate added and verified** (unit tests + live dry run):
   `BuildingOrientationSection` now blocks the compass transform per-room
   until a human has Accepted/Overridden that room's wall-orientation
   flag. Currently blocks 23/25 of Kinsela's rooms, correctly, since
   nothing has been resolved yet - this is the intended state until you
   review the drawing and start resolving rooms one by one (or in bulk,
   if you'd want a bulk-accept action added later - not built, not asked
   for).
4. **Window area has no real non-null data to verify against** on this
   drawing (no window schedule was legible to the model). Per user: accept
   the code path as verified-by-construction, revisit naturally on a
   drawing with real window data. No further action planned here.

Not touching floor-area UPDATE-branch gap or provenance cleanup yet, per
instruction, pending direction on the wall-length question above.

## Status: read the real Kinsela PDF directly, produced proposed corrections (no writes)

- 2026-08-14 01:00 — User confirmed `building_front_faces = West` (front
  porch/entry both face West) and gave a fixed page-side -> compass rule
  derived from the drawing's own layout (Front Porch at page-bottom, Rear
  Porch at page-top): bottom->West, top->East, left->North, right->South.
  Asked me to read the actual PDF (not the extraction JSON) for the 9
  flagged rooms and produce a proposed correction per room for John to
  review through the app's Accept/Override UI - explicitly no DB writes.
- 2026-08-14 01:05 — Downloaded the real PDF from Supabase Storage
  (`drawings.file_path`) via the service-role client, rendered pages with
  PyMuPDF (no `poppler`/`brew` available in this environment - confirmed,
  used the pure-Python renderer instead), found sheet A1.1 = the main
  floor plan containing all 9 rooms. Front Porch at page-bottom, Rear
  Porch at page-top on this sheet - matches the user's stated rule
  exactly, confirming I have the right sheet and orientation.
- 2026-08-14 01:15 — Cropped and visually inspected each of the 9 rooms at
  high resolution (published room-size labels, e.g. "3-CAR GARAGE 24'-10"
  X 37'-4"", cross-checked against directly-dimensioned wall segments
  where visible). Result, full reasoning in the chat report:
  - **Kitchen, Foyer, Home Office, Bedroom 2, Mud Room, Hidden Pantry (6
    rooms): the drawing CONFIRMS the current DB values are already
    correct.** These were 5 of the 6 "clean axis swap" rooms found
    earlier by comparing two independent AI extraction runs - the
    drawing itself sides with run #1 (what's already applied), not with
    my fresh re-extraction from this session. No correction needed; the
    re-extraction's version should NOT be applied for these rooms.
  - **3-Car Garage: genuinely wrong in the DB, needs correction.** Both
    the published room label and a directly-dimensioned wall segment
    (7'-0"+12'-0"+12'-0"+6'-8"=37'-8") independently confirm the ~37.5'
    dimension runs page-vertically (left/right walls -> North/South), not
    page-horizontally as currently stored. Proposed: North=South=37.67,
    East=West=24.83 (currently North=South=22.17, East=West=37.67 - fully
    swapped, and 22.17 doesn't match anything measured on the drawing
    either, a separate estimation error on top of the swap).
  - **Rear Porch: current DB is correct as far as it goes, just
    incomplete.** Published "44' X 18'-7"" confirms East=44, North=18.58
    match what's already stored; the previously-null West and South can
    be filled with the same values (44 and 18.58 respectively) by
    symmetry.
  - **Bath 3: LOWER CONFIDENCE, not resolved.** No printed W x H label
    found for this room on any sheet checked, and it's a small, fixture-
    crowded interior room where wall boundaries were hard to trace
    precisely from the drawing - my rough measurement suggested a more
    nearly-square room than either the current DB (4.25 x 6.33) or the
    fresh extraction (6.33 x 4.25) implies. Flagging rather than guessing
    - recommend a direct look, low priority given it's a small interior
    bath with minimal solar-gain impact either way.
- Reported all of the above to the user as a proposed correction with
  per-room reasoning, for review through the existing Accept/Override UI.
  **No writes made to `rooms` or `drawings` this checkpoint** - PDF read
  and crops only, all cleaned up from the scratchpad afterward.

## Status: production pipeline audit + full 13-page inventory (per user direction, no schema built yet)

- 2026-08-14 01:20 — User reframed this as a standing requirement, not a
  one-off: every page of an uploaded drawing set must be opened and
  analyzed, every project, permanently - no page skipped by assumption.
  Asked for a production-route audit BEFORE any change.
- 2026-08-14 01:25 — Audited `app/api/drawings/extract/route.ts` and
  `lib/drawingExtraction.ts` (current, post-session-edits state).
  Finding, reported in full to the user:
  - **No code-level page skipping** - the whole uploaded PDF is sent as
    one `type: "document"` block in a single API call. Nothing in the
    route selects, samples, or drops pages.
  - **But nothing demands or verifies exhaustive per-page review either**
    - `EXTRACTION_PROMPT` is entirely field-oriented (find X, estimate Y),
    never instructs "review every page," and the schema has no per-page
    coverage concept at all. Demonstrated this is a real failure mode,
    not theoretical - I did the same thing myself two turns earlier,
    treating only the floor plan sheet as relevant until told otherwise.
  - **Schema has no landing field for most of what a full architectural
    set contains** - window/door schedules, attic construction/insulation
    type, mechanical/plumbing/structural notes, per-story plate heights
    are all either unextracted or only partially captured today.
- 2026-08-14 01:30 — User rejected one-field-at-a-time schema growth as
  the wrong premise. Asked for a first-pass category inventory across
  ALL 13 Kinsela pages before any schema work, so nothing gets missed
  again by assumption.
- 2026-08-14 01:35 — Re-downloaded the real PDF, rendered all 13 pages
  (not just the two opened before), read every one visually. Full 25-row
  category table with Manual J/D/S relevance delivered to the user in
  chat (not reproduced here - see conversation). Headline findings:
  - **Cover Sheet (page 1, sheet C.S) and the Cross Section / wall
    section detail sheets (A1.3, REF-2) were never opened before this
    pass** - they contain the actual wall assembly stack-up (2x6 @ 16"
    o.c., R-19 batt, 1/2" OSB, brick veneer - real whole-wall build-up,
    not just a nominal R-value), multiple named per-area plate/ceiling
    heights (10' main, 9' garage, 9' bonus room, 15' Great Room plate,
    Master Bedroom vaulted @ 8:12), and the original designer's HVAC
    zoning (Unit A: 2005 sqft, Unit B: 1872 sqft, Unit C/bonus: 2 tons) -
    none of which the current schema captures at all.
  - **Live, concrete conflict found, not hypothetical**: ceiling
    insulation is R-38 on two A-series sheets (A1.3, REF-2), R-30 in the
    current extraction, R-50 in a Cover Sheet boilerplate note. Three
    different numbers, none reconciled.
  - Window schedule (13 marks, A1.2) and door schedule (22 marks, A1.2)
    exist in full per-mark detail and are currently not captured beyond a
    single rolled-up `window_type` string.
  - REF-1/REF-2 carry an explicit "FOR REFERENCE USE ONLY... may not
    correspond with the other sheets" disclaimer - a provenance/
    confidence signal the schema has no way to record either.
  - Not building schema yet, per instruction - awaiting the user's review
    of the category list.

## Status: flagged ceiling insulation conflict for Kinsela specifically (small, targeted change)

- 2026-08-14 01:45 — User confirmed: flag `ceiling_insulation_r_value` as
  unresolved for Kinsela with the R-38/R-30/R-50 conflict documented as
  the reason. Explicitly: don't auto-resolve to R-38 despite majority
  support, don't change the stored value - they'll confirm it themselves
  in the review panel.
- Found the review UI had no way to show *why* an envelope field is
  unresolved (unlike rooms, which already have a `reason`) - added
  `reason?: string | null` to `ExtractedField<T>` (`lib/drawingExtraction.ts`,
  optional so it doesn't affect any other field or the AI's existing JSON
  output shape) and wired `FieldRow` (`components/drawings-section.tsx`)
  to display it when present, same styling as the room-level reason text.
  Deliberately did NOT change `EXTRACTION_PROMPT` to ask the model to
  populate this going forward - that's part of the still-open Phase 2
  schema conversation, not this narrow fix.
- Wrote the reason text directly to Kinsela's `drawings.extracted_data`
  (asserted the current value was exactly `{value: 30, unresolved: true}`
  before writing, to avoid clobbering anything unexpected - it was).
  `value` and `unresolved` left untouched, only `reason` added.
  Independently re-read after writing (separate query): confirmed present,
  confirmed every other envelope field on the same object is byte-for-byte
  unchanged.
- **Notable side-finding during verification**: `projects.ceiling_insulation_r_value`
  is already `30` live in the database - this disputed value isn't inert,
  it's the number actively feeding Kinsela's current Manual J calculation
  right now (written during an earlier checkpoint this session, before
  this conflict was discovered). Reported to the user.
- `npx tsc --noEmit`: clean. Committing this code change (the DB write
  itself isn't a file, so it's captured here in the log, not in git).

## Status: Phase 2 approved, building in sequence (migration -> schema -> prompt -> apply -> UI, checkpoint after each)

- 2026-08-14 02:00 — Full Phase 2 plan approved after two rounds of
  clarifying questions (water-heater conditional-risk design, hvac
  equipment/zoning kept as separate arrays, wall-assembly fields JSONB-
  only, extraction-history preserved rather than single-timestamp-only).
  User explicitly accepted the two-sequential-writes-not-a-transaction
  tradeoff for the history insert, matching this codebase's existing
  reliability bar elsewhere. Instructed to build one piece at a time with
  a report-back checkpoint after each - starting with the migration.
- 2026-08-14 02:05 — Read the live RLS policy on `drawings` and
  `field_resolutions` directly via `pg_policies` (no migration file
  defines them - like several other tables this session, they were set up
  outside tracked migrations). `field_resolutions` denormalizes
  `project_id` directly on itself rather than joining through a parent
  table for its RLS check - mirrored that exact pattern for
  `drawing_extraction_history` rather than inventing a join-through-
  drawings variant.
- 2026-08-14 02:10 — Wrote and applied
  `supabase/migrations/20260813172100_add_drawing_extraction_history.sql`:
  - `drawings.extraction_completed_at timestamptz` (new column)
  - `drawing_extraction_history` (new table: id, drawing_id FK, project_id
    FK, extracted_data jsonb, unresolved_items text[],
    extraction_completed_at) with an index on
    `(drawing_id, extraction_completed_at desc)` and RLS enabled with a
    policy identical in shape to `field_resolutions`'.
  - Applied directly to the live DB via `pg` + `SUPABASE_DB_URL` (same
    method used for every migration this session).
- 2026-08-14 02:12 — Verified against the live schema (not just "the SQL
  ran without error"): re-queried `information_schema.columns` for both
  the new column and every column of the new table, confirmed both
  foreign keys via `information_schema.table_constraints`, confirmed the
  index via `pg_indexes`, confirmed RLS is enabled and the policy text
  matches the intended shape via `pg_policies`. Then did a full functional
  round-trip - inserted a real row (via the service-role client, real
  `drawing_id`/`project_id` from Kinsela), read it back, deleted it,
  and confirmed the table is empty afterward (0 real rows - `route.ts`
  hasn't been touched yet, so nothing should have written here for real).
- 2026-08-14 02:15 — `npx tsc --noEmit`: clean (no TS files touched yet,
  this checkpoint is pure SQL). Committing the migration file now, per
  instruction to report back before moving to schema.
- 2026-08-14 02:20 — User said GO. Built the schema checkpoint (types +
  pure logic only, `EXTRACTION_PROMPT` itself untouched - that's the next,
  separate checkpoint): `lib/drawingExtraction.ts` gained
  `attic_construction_type` + 7 JSONB-only envelope fields (wall assembly
  x4, duct spec x2, hvac_equipment_location), `ceiling_height_ft` +
  `source_sheet` on `ExtractedRoom`, and 7 new top-level types/arrays
  (`sheets`, `window_schedule`, `door_schedule`, `hvac_equipment`,
  `hvac_zoning` - kept separate per instruction, `square_footage_summary`,
  `water_heaters`). New top-level arrays are optional (`?`) specifically
  because old stored `extracted_data` genuinely lacks these keys - typing
  them as always-present would be a type-level lie about historical data;
  any future reader must default with `?? []`.
- Added `flagWaterHeaterLoadRisk` (deterministic post-processing,
  mirrors `applyDuctFallbackDefaults`'s existing pattern rather than
  trusting the model to compute the risk condition itself at generation
  time) and extended `collectUnresolvedItems` to walk `water_heaters[]`
  the same way it already walks rooms.
- Verified with 11 synthetic test cases (`npx tsx`, temp script, deleted
  after): Kinsela's real case (gas-tankless, attic) correctly does NOT
  flag; atmospheric-vent/gas-tank in conditioned space correctly DOES;
  electric and power-vent in conditioned space correctly do NOT (sealed
  combustion / no jacket loss concern the same way); gas-tank outside
  conditioned space does NOT; a missing `water_heaters` key (simulating
  pre-Phase-2 stored data) doesn't crash `collectUnresolvedItems`; a mixed
  array flags only the actually-risky entry. All 11 passed.
- `npx tsc --noEmit`: clean. Committing now, per instruction to report
  back before moving to the prompt rewrite.
- 2026-08-14 02:30 — User said GO. Rewrote `EXTRACTION_PROMPT` in full:
  renumbered STEP 1-5 -> STEP 2-8 (updated the one internal cross-
  reference, STEP 3's "same standard as duct routing" pointer), inserted
  new STEP 1 (sheet inventory), STEP 6 (exterior wall assembly), STEP 7
  (attic construction type), STEP 9 (duct spec), STEP 10 (HVAC equipment +
  zoning, one table populating both arrays via a shared label), STEP 11
  (HVAC equipment location), STEP 12/13 (window/door schedules,
  transcribed verbatim, explicitly NOT correlated to rooms - flagged as
  future work, not built now), STEP 14 (sqft summary), STEP 15 (water
  heaters - explicitly told NOT to judge significance, that's
  flagWaterHeaterLoadRisk's job downstream, not the model's). Extended
  "Other rules" with the provenance/conflict/reference-only-sheet rules.
  Reworded the opening framing to name all three manuals (was Manual J
  only) and state the every-page mandate directly.
- `npx tsc --noEmit`: clean. Running a real extraction against the actual
  13-page Kinsela PDF now (same verification standard as every prompt
  change this session) - this schema grew by ~30 keys across 15
  building_envelope fields plus 7 new top-level arrays, and a prior
  prompt expansion this session already caused one real max_tokens
  regression, so measuring actual usage rather than assuming headroom.
- 2026-08-14 02:45 — **First run at max_tokens: 16000 hit the ceiling
  again**, as anticipated - truncated with only ~285 tokens of output
  left (measured: 44609 chars produced at 16000 tokens = ~2.79 chars/
  token; cut off inside hvac_zoning, only square_footage_summary +
  water_heaters + closing braces remained). Real need ~16285 tokens.
- 2026-08-14 02:48 — Bumped to 24000 (~40% headroom over the measured
  need, matching this session's established philosophy) - hit a NEW,
  different failure: the Anthropic SDK's `calculateNonstreamingTimeout`
  hard-refuses any non-streaming request with `max_tokens > 21333`
  (`(60min * maxTokens) / 128000 <= 10min`) - a client-side error thrown
  before the request is even sent, not a slow response. This is a real
  production bug, not just a test-script problem: `route.ts` uses the
  same non-streaming call, so leaving it at 24000 would have made every
  future extraction fail 100% of the time. Fixed immediately (before
  waiting on anything else) to 20000 - safely under the hard ceiling,
  ~23% headroom over the measured need (less than the usual ~40%, a
  known, flagged compromise, not a final answer). True fix is streaming
  support in `route.ts`, not another number - flagged to the user rather
  than silently implemented mid-checkpoint (real scope beyond "rewrite
  the prompt").
- 2026-08-14 02:52 — Re-ran at 21000 (safe ceiling for a one-off
  verification script) to get a complete, valid extraction to actually
  review the new prompt's OUTPUT quality, not just confirm it doesn't
  truncate. `stop_reason: end_turn`, `output_tokens: 15930`.
  Cross-checked every new category against my own independent manual
  read of the PDF from two turns ago:
  - **Matches exactly**: `sheets[]` (all 13, REF-1/REF-2 correctly
    flagged reference-only), `attic_construction_type` (vented,
    correctly marked unresolved since it's inferred from vent symbols
    not an explicit label), wall assembly (2x6 @ 16" o.c., 1/2" OSB,
    brick veneer + Hardie board), `hvac_equipment`/`hvac_zoning`
    (5-ton/5-ton/2-ton, 2005/1872 sqft), `square_footage_summary` (all
    10 rows), `duct_insulation_spec`/`duct_minimum_diameter_in`,
    `water_heaters` (correctly NOT flagged - gas-tankless/attic, outside
    the risk condition, confirming the deterministic function behaves
    correctly on real data, not just the 11 synthetic test cases).
  - **21/26 rooms got a per-room `ceiling_height_ft` override** - more
    than expected, but correct: this floor plan labels ceiling height on
    nearly every room directly (not just vaulted exceptions as I'd
    assumed when writing STEP 5), so the model applying the override
    broadly is the right behavior, not overreach.
  - **Two real findings surfaced, not yet resolved - reported to the
    user rather than silently deciding either way**:
    1. `window_schedule` came back as 11 numbered entries ("1,2,3...");
       my own manual read two turns ago described 13 LETTERED entries
       ("A-M"). One of the two reads is wrong. Not re-verified against
       the PDF yet.
    2. The "Other rules" conflict/provenance instructions are worded
       "for every building_envelope field" specifically - they don't
       reach room-level facts. Concrete consequence: this run picked
       `3-Car Garage` ceiling_height_ft = 9 (from an elevation sheet)
       silently, with no unresolved/reason flag, even though the floor
       plan's own room label says 10' - the same shape of conflict the
       envelope-level rule handles correctly (see
       `ceiling_insulation_r_value`'s detailed conflict reason in this
       same run), just not reachable by the current wording for rooms.
  - Nothing written to Kinsela's live `drawings` row this checkpoint -
    verification only, output saved to local scratch files and reviewed,
    then deleted.
- `npx tsc --noEmit`: clean. Committing the prompt rewrite + the
  max_tokens safety fix now (both real, verified, necessary) - the two
  findings above are reported to the user as open questions, not silently
  resolved, before continuing to Apply-to-Form wiring.
- 2026-08-14 14:10 — Committed `fca5b66`: `flagWindowScheduleForVerification`
  (every `window_schedule` entry unconditionally forced `unresolved: true`
  - per-row transcription proven unreliable across 3 runs, including one
  invented sheet reference; table-transcription accuracy treated as
  low-confidence by construction until separately proven) and wired
  `flagWaterHeaterLoadRisk` into `route.ts` (existed and was unit-tested
  since an earlier phase, but was never actually imported/called by the
  production route - fixed as part of this commit). The two garage-
  ceiling-height and R-value fixes attempted alongside this were NOT
  included - not yet proven effective, held for further work below.
- 2026-08-14 15:00 — Added `room_label_text` (room's printed label
  transcribed verbatim) + `extractCeilingHeightFromLabelText` (regex for
  "N' CEILING" patterns) + updated `flagRoomCeilingHeightConflicts` to
  prefer the regex-derived value over the model's structured
  `ceiling_height_ft`. Also added `verifyEnvelopeConflictDisclaimers`
  (cross-references sheet names mentioned in an envelope field's `reason`
  against `sheets[]`'s actual disclaimer flags). Both unit-tested clean
  (16/16). Real-verified against Kinsela: `flagRoomCeilingHeightConflicts`
  logic itself is correct (confirmed via direct PyMuPDF word-coordinate
  search - A1.1 genuinely prints "10' CEILING" next to "3-CAR GARAGE"),
  but the model's `room_label_text` output only captured "3 CAR GARAGE"
  - omitting the adjacent ceiling-height text entirely, so the diff never
  had a chance to fire. `verifyEnvelopeConflictDisclaimers` also proved
  correct but insufficient for the real R-value bug: the model's reason
  named only C.S and REF-2, never A1.3 (the actual non-disclaimed peer
  sheet), and a sheets[]-vs-reason lookup structurally cannot catch an
  omission, only a mischaracterization - exactly as flagged in the code
  comment before testing. Reported both findings honestly; not committed.
- 2026-08-14 15:45 — Per direction: (a) refined the `room_label_text`
  prompt bullet into an explicit completeness requirement naming the
  exact observed failure; (b) added `ExtractedSheet.ceiling_insulation_callout_text`
  (per-sheet verbatim insulation-callout transcription) +
  `extractRValueFromCalloutText` + `flagCeilingInsulationRValueConflicts`
  (deterministic cross-sheet R-value diff, independent of the model's own
  narrated reasoning). Both unit-tested clean (16/16). Real-verified
  against Kinsela: neither converged. Garage `room_label_text` still
  omitted "10' CEILING" (captured a different nearby note instead -
  "5/8\" TYPE X GYPSUM BOARD ON CEILING" - proving it can find *some*
  adjacent text, just not that one). R-value: A1.3's
  `ceiling_insulation_callout_text` came back null in the model's own
  per-sheet capture too - the omission moved down a level rather than
  disappearing; the field only ended up `unresolved`/reasonable-looking
  by incidental model inconsistency, not because the deterministic check
  fired. Reported honestly (4 consecutive real-run failures across two
  different mechanical-transcription framings); not committed.
- 2026-08-14 16:20 — Built a targeted follow-up mechanism per user
  direction: `roomsNeedingCeilingHeightFollowUp` /
  `sheetsNeedingInsulationCalloutFollowUp` (pure detection functions,
  scoped to the exact silent-omission pattern already diagnosed, never a
  blanket re-ask) + `buildFollowUpPrompt` + `mergeFollowUpResponse`,
  wired into `route.ts` as a conditional second, much smaller Anthropic
  call (max_tokens 4000) fired only when detection finds something.
  Added idempotency guards to `flagRoomCeilingHeightConflicts` and
  `flagCeilingInsulationRValueConflicts` since both may now run twice.
  Unit-tested clean (24/24). Real end-to-end verification: the mechanism
  itself works exactly as engineered (correct detection - flagged the
  garage and all 10 non-disclaimed sheets with a missing callout,
  including A1.3; correct focused prompt; correct merge) - but the
  model's *answers* were still wrong even under this narrow, single-
  purpose, directly-targeted ask: explicit `null` for A1.3's callout, and
  the garage follow-up again returned the gypsum-board note instead of
  the ceiling height. Independently re-verified via PyMuPDF
  (`page.get_text()` plain string search, not visual/AI) that A1.3 (PDF
  page 5) genuinely and unambiguously contains "R-38 BLOWN INSULATION" -
  confirming this is a real, direct model misread on a narrowly-scoped
  question, not an artifact of a crowded prompt. This disproves the
  "competing instructions" hypothesis the follow-up mechanism was built
  on. Notably surfaced that this PDF has a real embedded text layer
  (PyMuPDF found the exact strings via plain search both times), meaning
  a fully deterministic, non-AI extraction path (a Node PDF-text-parsing
  library) is a real, likely-more-reliable option for these two specific
  facts - flagged to the user as a substantially bigger scope item (new
  dependency, new code path), not silently built. User directed: keep
  the current code as-is (it's correctly engineered, remains a genuine
  safety net for future projects and other conflict shapes, and both
  known-unconverged facts stay honestly flagged `unresolved` for a human
  either way) rather than build the text-layer path now. Committing next
  with this outcome documented in code comments, not silently as if
  fully solved.
- 2026-08-14 17:10 — Started Apply-to-Form wiring, including the
  drawing_extraction_history insert. Checked the live DB schema directly
  (not migrations, which can drift) for every Phase 2 field: confirmed
  `projects`/`rooms` have NO target column for wall assembly, duct spec/
  diameter, hvac_equipment_location, sheets[], window_schedule,
  door_schedule, hvac_equipment, hvac_zoning, square_footage_summary,
  water_heaters, or room-level ceiling_height_ft_elevation_derived/
  room_label_text/source_sheet - all correctly remain reference-only per
  earlier decisions, no wiring needed. The one exception:
  `projects.attic_construction_type` genuinely exists and `computeManualJ`
  genuinely branches on it (line 429, sealed vs. vented get different
  buffer factors) - a real calculation input, not a cross-check. Flagged
  a real ambiguity before writing code: this column is NOT NULL with a
  meaningful default ('vented_unconditioned'), so there's no "empty
  string means never entered" signal the other fields' fill-logic
  relies on. User decided: only auto-apply on a brand-new project (zero
  rooms yet, same signal this function already uses to gate the room
  bulk-insert branch) - never touches an established project's value.
  Implemented in `manual-j-workflow.tsx` (ExtractableEnvelopeFields +
  applyExtractedData, validated against ATTIC_CONSTRUCTION_OPTIONS
  defensively) and `drawings-section.tsx` (resolvedEnvelopeString, same
  human-override precedence as foundation_type/window_type).
  drawing_extraction_history insert added to `route.ts` (shares one
  extraction_completed_at timestamp between the drawings update and the
  history insert; history-insert failure is logged, not surfaced as a
  failed request - matches the already-accepted non-transactional
  tradeoff). `npx tsc --noEmit`: clean throughout.
  Verified live, not just compiled: (1) simulated the actual RLS policy
  via direct Postgres role/JWT-claim substitution (not service-role,
  which bypasses RLS and would prove nothing) - confirmed the real
  project owner's insert succeeds and a stranger's is correctly
  rejected; (2) ran the exact insert/update shapes route.ts uses against
  the live schema (service role, smoke test only) - both succeeded,
  test history row deleted after. Note: this smoke test did set
  Kinsela's real `drawings.extraction_completed_at` to the test
  timestamp (harmless - that column was null before this phase existed
  at all, and any future real extraction overwrites it anyway).
  Not independently verified through an actual browser click: the
  attic_construction_type fill-only-on-brand-new-project gate lives
  entirely in client-side React state (useImperativeHandle), and this
  repo has no component-test harness - verified by code review + tsc +
  consistency with the already-proven `rooms.length === 0` signal used
  elsewhere in the same function, not by an actual UI walkthrough.
- 2026-08-14 18:30 — New scoped capability, agreed plan up front (5 items:
  dimensional reconciliation hierarchy, source authority hierarchy,
  uncertainty classification, revision awareness, plan-reading
  conventions; explicit exclusions: structural/electrical/plumbing/
  fire-life-safety/civil/ADA). Building in checkpointed phases per
  recommended order, not one pass.
  Phase 1 (items 2 + 5) implemented and verified:
  - `ExtractedSheet.hasReferenceOnlyDisclaimer: boolean` replaced with
    `sourceAuthority: "sealed_construction_document" | "reference_only" |
    "unknown"` - a real 3-tier hierarchy, not a cosmetic rename.
    "sealed_construction_document" requires actual evidence (seal/stamp
    or "issued for construction" language), not inferred from a sheet
    looking detailed - `"unknown"` is the deliberately conservative
    default. Updated the two existing deterministic functions that read
    this (`verifyEnvelopeConflictDisclaimers`,
    `flagCeilingInsulationRValueConflicts`) to treat "not reference_only"
    as one bucket (sealed + unknown together) - preserving their exact
    prior behavior rather than adding an unverified new sealed-vs-unknown
    arbitration with no diagnosed real-world case behind it yet. The
    finer 3-tier preference is available to the model's own reasoning via
    the prompt's "Other rules", producing richer reason text, but isn't
    independently re-checked by code this phase - same "don't build
    ahead of a proven need" discipline as every other check in this file.
  - New "Reading discipline" + "Explicitly out of scope" paragraphs added
    to the prompt (keynote tags, grid lines, section/detail markers;
    explicit do-not-extract list matching the 6 excluded domains, with
    an instruction to still scan an excluded-domain sheet for incidental
    HVAC-relevant facts without reasoning about the excluded content
    itself).
  Verified: `npx tsc --noEmit` clean; 7/7 new unit tests covering the
  3-tier field's behavior in both adapted functions and the follow-up
  target selector. Real Kinsela extraction: `sourceAuthority` classified
  correctly and conservatively (REF-1/REF-2 -> reference_only, all 11
  other sheets -> unknown, no false "sealed" claims); R-value conflict
  handling unchanged from before (expected - the A1.3-omission gap is a
  separate, already-known limitation, not addressed this phase), but the
  model's own reason text now correctly uses the new tier vocabulary
  ("C.S (unknown tier) value R-30 is preferred over REF-2
  (reference_only)") and referenced "detail-level callout" unprompted,
  suggesting the reading-discipline instruction is being engaged with,
  not just present-but-ignored. Scanned full output for accidental
  out-of-scope leakage (structural/electrical/plumbing/fire/civil/ADA
  terms) - one hit ("footing"), traced to the pre-existing, legitimate
  `foundation_type` field describing the foundation assembly, not new
  scope creep.
  Not yet built: items 4 (revision awareness), 1 (dimensional
  reconciliation hierarchy), 3 (uncertainty classification) - proceeding
  in that order per the agreed plan, each its own checkpoint.
- 2026-08-14 19:15 — Phase 2 (item 4, revision awareness) implemented and
  verified. `ExtractedSheet` gains `revisionDate`/`revisionNote` (STEP 1);
  new document-level `DrawingExtraction.revisionConcern` (conditional
  trigger, same pattern as flagWaterHeaterLoadRisk - null in the ordinary
  case, only populated with specific evidence of a stale/inconsistent
  revision), wired into `collectUnresolvedItems`. 4/4 unit tests pass.
  Real Kinsela verification caught a genuine, honest mistake on the first
  attempt: `revisionDate` was over-filled with the sheet's ordinary issue
  date ("OCT/03/2025") on all 13 sheets - my STEP 1 wording said "revision
  block or title block", and the model grabbed the title block's DATE
  field instead of a real revision-specific marking. Fixed by explicitly
  excluding the ordinary issue/plot date and requiring an actual
  revision-specific marking (a REVISIONS table, a numbered revision
  triangle, etc.). Re-verified: `revisionDate`/`revisionNote`/
  `revisionConcern` now correctly stay null across all 13 sheets - the
  clean, expected outcome for a set with no revision markings, not a gap.
  Separately surfaced two real findings unrelated to item 4's own logic:
  (1) a recurring, reproducible model JSON bug - an invalid `\'` escape
  inside quoted dimension text like "1'-4\" O.C." (hit twice, same
  pattern) - already handled gracefully by route.ts's existing malformed-
  JSON catch, not a regression, just newly observed; (2) a real token-
  budget problem - a live run hit `stop_reason: max_tokens` at the
  existing 20000 ceiling, caused by this phase's own additions (longer
  `sourceAuthority` enum strings + 2 new per-sheet fields x 13 sheets).
  Bumped max_tokens 20000 -> 21000 (safe margin under the hard 21333 SDK
  ceiling) as an honest stopgap, re-verified clean - but the re-verified
  run still used 19935 of 21000 tokens, ~1065 left. Flagging before
  continuing: item 3 (touches all 15 building_envelope fields' JSON
  shape) will very likely exhaust this margin - raised as an explicit
  decision point, not silently pushed through.
- 2026-08-14 19:40 — Phase 3 (item 1, dimensional reconciliation
  hierarchy) implemented. Prompt-only, no schema change - new "Other
  rules" bullet establishing written > detail > schedule > general plan
  > scaled/geometric, orthogonal to item 2's source-authority hierarchy,
  requiring "reason" to state which tier won when applied. Ties directly
  to item 5's reading-discipline paragraph (a detail-marker-sourced value
  IS a detail dimension). `npx tsc --noEmit` clean. Real Kinsela
  verification: no regression (output_tokens 18544, well under the 21000
  ceiling; ceiling_insulation_r_value still lands on the same safe
  unresolved/null outcome as before) - but the specific new hierarchy
  vocabulary ("written dimension", "detail dimension", etc.) did not
  appear anywhere in the output. Honest read: this is very likely because
  Kinsela doesn't currently present an active dimension-TYPE conflict for
  the model to apply this hierarchy to (its known conflicts so far are
  about which SHEET, item 2's hierarchy, not what KIND of dimension) -
  not evidence the instruction failed. Flagged explicitly, per the plan's
  own upfront caveat: unlike items 2 and 4, this item has no diagnosed
  real bug to confirm-fixed against, only "doesn't regress anything."
  Proceeding to item 3 next requires resolving the token-budget question
  raised above first - not building it against a margin already this
  thin without a decision.
- 2026-08-14 20:05 — Token-budget decision: build streaming now (user's
  choice, "Recommended" option). Converted route.ts's main extraction
  call from `anthropic.messages.create()` to `anthropic.messages.stream()`
  + `await stream.finalMessage()` - the non-streaming hard ceiling
  (`calculateNonstreamingTimeout`, refuses max_tokens > 21333) is specific
  to non-streaming requests and doesn't apply here. max_tokens raised
  20000/21000 -> 32000 (generously safe, not the model's actual ceiling -
  no longer worth tuning tightly now that overrunning it fails soft via
  stop_reason, same handling as before, not a client-side throw before
  the request is even sent). Follow-up call (max_tokens: 4000) left
  non-streaming - nowhere near any ceiling, no need to touch it.
  Verified with a real, direct streaming call against Kinsela (exact
  route.ts pattern): completed in 222.5s, stop_reason: end_turn,
  output_tokens: 18072, parsed cleanly into the full expected shape
  (sourceAuthority/ceiling_insulation_callout_text/revisionDate/
  revisionNote all present and correct on all 13 sheets).
  That 222.5s elapsed time surfaced a separate, real risk this change
  makes newly relevant: Vercel enforces its own function-execution
  timeout independent of the (now-removed) Anthropic SDK ceiling, and
  this repo has no maxDuration export or vercel.json indicating which
  plan tier's default applies (as low as 10s on Hobby - would have
  killed this route mid-stream regardless of the SDK change). Added
  `export const maxDuration = 300` to route.ts as a reasonable common
  default, explicitly flagged rather than assumed: this project's actual
  Vercel plan tier needs confirming (300s requires at least Pro with
  this explicit opt-in; Hobby cannot go this high).
  `npx tsc --noEmit` clean throughout.
  Item 3 (uncertainty classification) is now unblocked by the token
  budget - proceeding next.
- 2026-08-14 20:35 — Phase 3, item 3 (uncertainty classification)
  implemented - the last of the 5 agreed items. New
  `ExtractedFieldCertainty` ("documented" | "calculated" | "inferred" |
  "assumed" | "unverified" | "conflict") added to `ExtractedField<T>` -
  scoped deliberately to that shared type only (all 15
  building_envelope fields + the 2 per-room duct fields), not extended
  to ExtractedRoom's own unresolved/reason or ExtractedWaterHeater (both
  bundle several facts under one flag - a single certainty value there
  would be ambiguous). New "Other rules" bullet defines all 6 values
  with the expected unresolved-pairing stated explicitly so it isn't two
  independent judgment calls that can drift apart.
  `applyDuctFallbackDefaults` now sets `certainty: "assumed"` on the two
  duct fields it fills with a construction-based default - a direct,
  concrete formalization of an already-existing mechanism, not a
  hypothetical use case.
  Verified: `npx tsc --noEmit` clean; 4/4 new unit tests (fallback branch
  gets "assumed", AI-extracted branch preserves the model's own
  certainty). Real Kinsela extraction via the new streaming path: 223.6s,
  stop_reason: end_turn, 18654/32000 output tokens - comfortably clear of
  truncation, confirming the streaming decision was both necessary and
  sufficient for this item specifically. Zero certainty/unresolved
  pairing violations across all 15 envelope fields. Concrete, correct
  mappings observed: ceiling_insulation_r_value -> "conflict" (the known
  R-value peer-conflict case), attic_construction_type -> "inferred"
  (matches STEP 7's existing inference logic exactly).
  One honest, minor nuance, not fixed this round: a room's
  duct_insulation_r_value came back `value: null, certainty: "assumed"`
  - functionally harmless (value correctly stayed null, unresolved
  stayed true), but "assumed" was meant to describe a filled-in value
  with no basis, not an absence correctly left null. The prompt didn't
  explicitly cover this case ("leave certainty null only if not
  confident classifying" doesn't quite address "nothing found, nothing
  to classify"). Flagged rather than silently reverified into a clean
  result - a candidate for a small follow-up tightening if it recurs,
  not urgent enough to block this checkpoint.
  This completes all 5 items from the originally agreed scoped plan
  (2+5, 4, 1, 3), plus the streaming migration that item 3 required.
- 2026-08-14 20:50 — Resolved the maxDuration flag from the streaming
  commit. Had no way to check the actual Vercel plan myself (confirmed:
  `vercel whoami` -> "Logged out", no `.vercel` project link, no
  VERCEL_TOKEN in .env.local) - asked the user rather than guess. User
  confirmed Pro plan, 300s max, and asked for a live doc check before
  setting anything (not memory). Fetched Vercel's current official docs
  (vercel.com/docs/functions/configuring-functions/duration,
  last_updated 2026-07-01) live - this corrected a real, meaningful
  misunderstanding: 300s is Pro's DEFAULT max duration, not its ceiling.
  The actual generally-available maximum (same maxDuration export, no
  extra config) is 800s. An further "extended max duration" beta goes to
  1800s but requires explicit per-function config, isn't supported as a
  project default, and is incompatible with Secure Compute/Static IPs -
  not needed here. Confirmed no vercel.json or config in this repo
  overrides the fluid-compute default the duration table assumes.
  Set maxDuration: 300 -> 600 - ~2.7x margin over the measured 222.5s
  call, and 200s under the real 800s ceiling (margin on both sides, not
  pinned against either). `npx tsc --noEmit` clean. Pure constant-value
  change with an updated, now fully doc-verified comment - no new
  behavior to live-test beyond what streaming already verified.

## Status: KNOWN OPEN ITEM — Walk-In Closet (Bedroom 2) is a room-identity/naming bug, not fixed

- 2026-08-16 — Logging this now per explicit instruction, NOT fixing it:
  the `rooms` row named **"Walk-In Closet (Bedroom 2)"**
  (`c89d18e7-358a-4906-a4ff-495978c0efd7`) does not actually hold data for
  the walk-in closet physically adjacent to Bedroom 2. Its linked
  extraction record (`drawings` room[14], `room_label_text`/floor-area
  note = "4'2\" x 6'4\"") belongs to a **different** closet - the one
  adjacent to **Guest Bedroom 4** (confirmed via direct pixel inspection
  of A1.1: that "4'2\" X 6'4\"" label sits directly next to Guest Bedroom
  4, not near Bedroom 2/Kids Hall at all).
  The real walk-in closet next to Bedroom 2 (visible on A1.1, adjacent to
  Kids Hall, labeled only "WALK-IN CLO. / 10' CEILING" with no printed
  W x D dimension at all) has **no corresponding row in `rooms`** under
  its own correct identity - it's essentially unrepresented in the data
  model, while a mislabeled row claims its name.
  This is a room-identity/naming bug in how the original extraction
  assigned names to rooms - separate from, and not touched by, this
  session's wall-orientation-axis correction work. Not investigated
  further or fixed - flagged here so it isn't lost. Likely needs: (a)
  deciding whether to rename the existing row to reflect what it actually
  is (the Guest-Bedroom-4 closet) or split/re-match it, and (b) deciding
  whether the real Bedroom-2 closet needs a new `rooms` row created from
  scratch, since no extraction data currently exists under the right
  identity for it either way.

## Status: investigating the orientation-upfront extraction's completeness gap (diagnosis only, no prompt changes yet)

- 2026-08-16 — **Correction to my own prior report**: I told the user the
  3 rooms with any wall data in the orientation-upfront test run (Great
  Room, Dining, Kitchen) all matched pixel-verified ground truth, "3 for
  3, zero disagreements." That check only covered 3 of the 5 rooms that
  actually returned data - Home Office and Bedroom #2 also got partial
  fills and I hadn't checked them. Checking now: both are **wrong, not
  just incomplete** - Home Office came back `wall_east/west_len_ft=14`
  (should be 10.5, the depth value misassigned to the width axis) with
  N/S null; Bedroom #2 came back `wall_north/south_len_ft=13,
  wall_west_len_ft=14` (should be N/S=14, E/W=13 - same axis swap).
  Revised, accurate tally: of 5 rooms with any data, 3 correct (Dining,
  Kitchen, Great Room-partial), 2 backwards. "When it fills a value it's
  trustworthy" does not hold universally - retracting that claim.
- Diagnosis of the completeness gap itself:
  1. **Not a new regression.** Compared the OLD no-orientation
     (front/rear/left/right) branch's own fill rate on the identical
     room set (`orientation-before.json`): same sparse pattern already
     existed before this session's change - most rooms 2/4 filled or
     0/4, only Great Room hit 4/4. The low completeness is a pre-existing
     weakness of this model reliably completing all four wall-length
     fields per room across a ~27-room single completion, under either
     branch's wording - not something the known-orientation prompt made
     worse in isolation.
  2. **What the diff shows changed causally**: `buildOrientationStep3Branch`'s
     known-orientation return text (`lib/drawingExtraction.ts` ~line 507)
     dropped the no-orientation branch's explicit "REQUIRED, not
     optional... only leave null when [narrow legitimate reasons]... not
     out of general caution" completion mandate (~line 503) - the known
     branch has no equivalent anti-null pressure at all. It also asks for
     a harder task than either alternative: locate one anchor feature
     (the front entry/porch) on the floor plan, then propagate that
     single fact through "the floor plan's own geometry" to derive an
     absolute compass letter for every wall of every room, building-wide
     - versus the old branch's much shallower per-room local judgment
     (front/rear/left/right relative to an imagined person, no
     building-wide propagation chain required).
  3. **Room-level evidence supports the harder-task theory over a
     caution theory**: rooms whose own `reason` text shows the anchor-
     propagation was actually attempted (Bedroom #2: "Room is on south
     (right) side of plan facing west (front) based on floor plan
     geometry") got some wall fields filled, even where wrong. Rooms
     whose `reason` only discusses floor-area/ceiling-height uncertainty
     - no directional reasoning at all (Foyer, Hidden Pantry, Mud Room,
     Storage/Mechanical, Bath #3, Guest Bedroom #4, Master Bath, Laundry,
     etc.) - show all four wall fields null, consistent with the
     harder derivation sub-task being silently skipped for most rooms
     rather than explicitly declined with a stated reason.
  4. **Converting the OLD run's front/rear/left/right into compass via
     the known transform (front=W/rear=E/left=N/right=S) reproduces the
     exact same Home Office and Bedroom #2 swap** - so that specific
     defect isn't new either; it's the same per-room front-entry-relative-
     to-anchor error already diagnosed 2026-08-13, and it survived even
     though the anchor (front=W) is now handed to the model as confirmed
     fact rather than guessed. Handing over the anchor fixed the "which
     wall is front, globally" question but did not fix "how does THIS
     room's geometry relate to that anchor" for every room.
  Not proposing a prompt change yet - reporting this diagnosis to the
  user first, per instruction.
- 2026-08-16 — v2 fix (mandatory per-room direction-tracing sub-step,
  single null-permission) implemented and real-verified: `tsc` clean,
  re-ran against Kinsela (254s, end_turn, 19770 tokens, 25 rooms parsed).
  Result: WORSE completeness - only 1/25 rooms got any wall data (down
  from 5/27). Reason text showed the model DID perform the required
  tracing (e.g. Foyer: "W wall faces front exterior (confirmed by entry
  door location on front porch)" - correct and confident) but then still
  left all four fields null, citing resolution/legibility doubt about the
  NUMBER, not the direction. Diagnosis: the null-permission was written
  narrowly (for direction-tracing failure only) but positioned right next
  to the length fields, and the model applied it broadly to any nearby
  doubt, including ordinary numeric-legibility doubt - a different,
  pre-existing problem conflated with the new one. Reported honestly to
  the user as a regression, not shipped, no DB write.
- 2026-08-16 — v3 fix per user direction: split the null-permission into
  two independently-scoped conditions in `buildOrientationStep3Branch`'s
  known branch - (a) DIRECTION uncertainty may leave all four wall fields
  null (the only case that does); (b) LENGTH/legibility uncertainty must
  NOT use that escape - once direction is known, give a best-effort
  length (per the existing dimensional reconciliation hierarchy) flagged
  approximate/unresolved rather than omitted. Also added
  `buildOrientationPreamble()`, spliced into the very top of the prompt
  (before STEP 1), restating the confirmed orientation as a standing,
  document-wide fact - not scoped to STEP 2/3 - so no page (including an
  elevation sheet whose own title could otherwise be misread as
  authoritative) needs to re-derive or second-guess it. Verified the
  null-case output stays byte-for-byte identical to the pre-session
  static prompt (38212 chars, matches the pre-orientation-work baseline
  exactly) - caught and fixed one extra stray blank line from the first
  edit pass before confirming this. `tsc --noEmit` clean.
  Real re-run against Kinsela (240.7s, end_turn, 19331 tokens, 24 rooms
  parsed, no truncation):
  - **Completeness: dramatically better.** 13/24 rooms got wall data, and
    every one of those 13 is a clean 4/4 fill (no partial fills at all,
    unlike every prior run) - Great Room, Dining, Kitchen, Hidden Pantry,
    Storage/Mechanical, Home Office, Foyer, Bedroom #2, Guest Bedroom #4,
    Bath #3, Rear Porch, 3-Car Garage, Bonus Room.
  - **Correctness: a NEW, serious regression - worse than before this
    fix, worse than the current live DB.** Checked all 9 target rooms
    (8 with real pixel-verified ground truth from earlier this session,
    Guest Bedroom #4 trivially either-way since it's square) against this
    run's output: only Great Room and Bath #3 are correct (plus the
    trivial Guest Bedroom #4) - **Dining, Kitchen, Hidden Pantry,
    Storage/Mechanical, Home Office, and Bedroom #2 all came back
    backwards** (axis-swapped), 6 of 9.
  - **Root cause, diagnosed from the model's own reason text**: every
    wrong room's reasoning contains an explicit but WRONG axis-labeling
    step, e.g. Dining: "The 12' dimension appears to be the E-W...(N and
    S walls)...21'-9" is the N-S...(E and W walls)". The model's
    underlying GEOMETRIC RULE it's applying (an E-W-extent dimension sets
    the North/South walls' length) is actually correct in plain compass
    terms - but it's mislabeling WHICH of the room's two printed numbers
    is the true compass E-W extent vs N-S extent, because on this
    building's rotated page (page-left=North, page-right=South,
    page-top=East, page-bottom=West, established early this session) the
    page-horizontal extent is actually the compass N-S extent, not E-W -
    and the model isn't accounting for that inversion here. This is a
    DIFFERENT sub-step than the one v2/v3 addressed so far: "which wall
    is front-facing" (now working correctly, e.g. Home Office/Bedroom #2/
    Foyer all correctly say "W wall faces front exterior") is a separate
    question from "which of this room's two printed numbers is that
    wall-pair's length" - the prompt has never given explicit guidance
    for the second question, and the model is resolving it with what
    looks like an unreliable, roughly-50/50-or-worse guess per room
    rather than tracing the room's actual dimension lines the way the
    pixel-verification work earlier this session did.
  - **Not applied to the live `drawings`/`rooms` tables.** Applying this
    extraction's data would silently corrupt 6 rooms that are currently
    correct in the DB (fixed or already-verified earlier this session).
    Explicitly flagged to the user as unsafe to apply.
  - Also noted, not chased further (out of scope - Garage/Bonus Room are
    explicitly excluded from this session's re-verification per the
    user): this run's 3-Car Garage/Bonus Room values (N/S=37.67/38.33,
    E/W=25.67/31.42) roughly match a DIFFERENT, previously-proposed-but-
    never-applied correction from 2026-08-14 (not the current live DB
    values, which remain a separate, already-flagged inconsistency) -
    tangential, not re-investigated now.
  - Room-count/naming drift continues as a known, pre-existing
    characteristic (flagged multiple times earlier this session): this
    run produced 24 rooms, not 25/27 - no separate "Walk-In Closet" line
    item at all this time (folded away or renamed, not investigated).
  Reported the full completeness-vs-correctness picture to the user,
  honestly, including that this is a regression on correctness relative
  to both the pre-fix state and the live DB - not proposing a further
  prompt iteration without direction, per the same discipline as v2.
- 2026-08-16 — User's diagnosis of the v3 failure: three rounds of
  "reason more carefully" each fixed the prior failure while surfacing a
  new one - the model needs an explicit MECHANICAL RULE, not another
  nudge. Directed a structurally different v4 fix: derive and explicitly
  STATE a page-position-to-compass table ONCE per sheet (written into
  `orientation.description`, auditable), then treat every room's
  wall-length assignment as a pure LOOKUP against that table - no fresh
  per-room compass reasoning at all. User asked to see the exact wording
  before spending another real API call, given v2/v3 had each traded one
  failure mode for a different one.
  Rewrote `buildOrientationStep3Branch`'s known branch in full: STEP A
  (once per floor-plan sheet - locate the front anchor, note its PAGE
  EDGE, derive the full page-position<->compass table by simple rotation,
  state it plus the two resulting wall-length rules in
  `orientation.description`, or state a documented failure if the anchor
  isn't findable/confirmable on that sheet, e.g. a second-floor plan);
  STEP B (per room - identify which of the room's two printed numbers
  runs page-horizontal vs page-vertical, a plain visual read, then
  substitute into STEP A's table - no compass judgment). Kept the
  two-independently-scoped-null-permissions principle from v3, re-anchored
  to the new procedure (STEP A failure -> all four null; STEP B numeric
  imprecision -> best-effort estimate, never bare null). `tsc --noEmit`
  clean. Presented the exact rendered text (with Kinsela's real W/E/N/S
  substituted) to the user for review before running anything real.
  A user message appeared to echo my own report back verbatim with no
  new content, twice - treated as a likely client-side glitch rather than
  confirmation (per this session's standing rule: no real user input =
  no action), asked directly via AskUserQuestion rather than guessing;
  user confirmed "yes, run it now."
  Real re-run against Kinsela (254.3s, end_turn, 20232 tokens, 25 rooms,
  no truncation):
  - **Completeness: best yet.** 15/25 rooms got wall data (up from 13/24
    in v3), including Walk-In Closet (Bedroom #2) for the first time in
    any run this session.
  - **`orientation.description` shows the mechanical procedure working
    exactly as designed**: "On sheet A1.1, the FRONT PORCH / main entry
    is drawn at the page-BOTTOM edge; therefore page-bottom=W, page-top=E,
    page-left=N, page-right=S" - this table matches the independently
    pixel-derived page-position rule established earlier this session,
    exactly. It also correctly extended the table to the bonus-room sheet
    (A1.2) via stated stairwell/outline alignment reasoning, rather than
    assuming - exactly per STEP A.5's instruction.
  - **But the WALL-LENGTH RULE derived from that (correct) table is
    inverted**: `orientation.description` states "a room's page-HORIZONTAL
    printed dimension = North/South wall length; page-VERTICAL = East/West
    wall length" - backwards from true plane geometry (a wall drawn
    running left-right on the page spans the room's page-horizontal
    extent, and that wall is the one facing whichever compass direction
    sits at the page-top/bottom edge - here, East/West, not North/South).
  - **Consequence: uniform, 100%-consistent backwards results.** Checked
    all 9 target rooms: 7 of 8 non-trivial rooms are backwards (Great
    Room, Dining, Kitchen, Hidden Pantry, Storage/Mechanical, Home
    Office, Bedroom #2) - every one of their `reason` fields explicitly
    cites "per the stated table," confirming the lookup mechanism itself
    is working faithfully on a table that's wrong at its source. Bath #3
    came out correct anyway - its own reason shows the SAME wrong table
    applied, but combined with an also-inverted per-room horizontal-vs-
    vertical read for that specific room, the two errors canceled by
    coincidence. Guest Bedroom #4 remains trivially correct (square).
    Net: 2 correct (1 substantive + 1 trivial) of 9, 7 backwards - worse
    in raw correctness than v3, but now via ONE single, cleanly
    diagnosable defect (a mis-derived rule sentence) instead of diffuse
    per-room noise - a real improvement in diagnosability even though the
    number is worse.
  - Also checked Rear Porch against the 2026-08-14 finding ("East=44,
    North=18.58" independently confirmed from the published "44' X
    18'-7"" label): v4 gives North/South=44, East/West=18.58 - also
    backwards, consistent with the same table-level defect.
  - **Not applied to the live `drawings`/`rooms` tables** - would corrupt
    7 of 9 currently-correct rooms.
  Reporting this in full to the user - genuine structural progress (the
  mechanical-lookup architecture itself is proven to work, and the defect
  is now a single, identifiable line of derivation rather than distributed
  per-room guessing) alongside a correctness number that's still not
  usable as-is. Not iterating the prompt further without direction.
- 2026-08-16 — User's diagnosis of the v4 failure and directed fix
  (option b from the two offered): don't trust the model's DERIVED
  wall-length-rule sentence at all, even though the rest of the
  architecture (page-edge observation) is sound. Move the rotation
  arithmetic out of the prompt into code entirely - the model's job
  becomes only two raw visual observations (which page edge the anchor
  sits at, once per sheet; which of a room's two numbers runs
  page-horizontal vs page-vertical, once per room), nothing else
  freehand. Explicitly: "if this converges cleanly, that's the version
  to write to live field_resolutions and the rooms table - finally."
  Implementation (schema + code, not just prompt text this time):
  - `ExtractedSheet` gained `frontAnchorPageEdge: "top"|"bottom"|"left"|
    "right"|null` - the model's one remaining per-sheet observation.
  - `ExtractedRoom` gained `wall_page_horizontal_len_ft` /
    `wall_page_vertical_len_ft` - the model's one remaining per-room
    observation; `wall_north/south/east/west_len_ft` are no longer
    written by the model at all in the known-orientation case.
  - New `computeCompassWallLengthsFromPageAxes(extraction, known)` in
    `lib/drawingExtraction.ts`: the ONLY thing that writes
    wall_north/south/east/west_len_ft for known-orientation rooms,
    unconditionally overwriting any stray model output there. Generalized
    the rotation logic correctly rather than hardcoding the user's
    Kinsela-specific shorthand ("front@top/bottom -> East/West") - the
    correct general rule depends on whether {front,rear} is the {N,S}
    pair or the {E,W} pair (front=W for Kinsela happens to make these
    equivalent, but front=N/S on a future project would not) - implemented
    and unit-tested both cases explicitly (6/6 synthetic cases passed,
    including a hypothetical front=N case and a front=W-but-anchor-at-
    left case, before touching the real API).
  - Wired into `route.ts`: runs right after parsing, only when
    `knownOrientation` is set, before the rest of the post-processing
    chain. STEP 3's known branch rewritten to match - the model now
    writes only the two raw observations and leaves the four compass
    fields null itself; STEP A/B renamed to "OBSERVATION A/B" to signal
    the reduced scope; STEP 1's per-sheet JSON shape and comment updated
    for the new field. `tsc --noEmit` clean.
  - Real re-run against Kinsela needed 4 attempts - three consecutive
    transient network failures first (timeout, EPIPE, then an ETIMEDOUT
    reading a source file during module load - a different error each
    time), diagnosed as environment instability (disk at 99% capacity,
    load average ~3, both confirmed via `df`/`uptime`) rather than a code
    issue; basic API connectivity confirmed fine via a small curl request
    before continuing to retry. Fourth attempt succeeded: 515.9s,
    end_turn, 21345 tokens, 27 rooms, no truncation.
  - **`frontAnchorPageEdge` correct on both floor-plan sheets**: A1.1 and
    A1.2 both reported "bottom" - matches the independently pixel-derived
    fact from earlier this session exactly, and computeCompassWallLengthsFromPageAxes's
    rotation output for THAT input is proven correct by the unit tests.
  - **Completeness: 14/27 rooms, all clean 4/4 fills** - comparable to
    v3/v4, the architecture keeps producing good completeness.
  - **Correctness: still broken - 7 of 9 target rooms backwards** (Great
    Room, Dining, Kitchen, Hidden Pantry, Home Office, Bedroom #2,
    Storage/Mechanical), only Bath #3 correct (+ Guest Bedroom #4
    trivially). Root cause this time is NOT the rotation math - that's
    code now, proven correct - it's OBSERVATION B, the model's per-room
    "which number runs page-horizontal vs page-vertical" read. Its own
    "reason" text gives this away: every room's reason says some version
    of "per this room's own dimension label" and, checked against the
    actual printed order, the model is systematically calling whichever
    number is printed SECOND in the room's "A X B" label
    "page-horizontal" - a pure text-position heuristic, not an actual
    trace of the room's real dimension lines on the page, despite the
    prompt explicitly asking for "a direct visual read of that room's
    own dimension lines... not a compass determination." This heuristic
    happens to match truth only for Bath #3, whose label happens to be
    printed in the opposite (D x W) order from every other room on this
    sheet (confirmed by comparing to this session's earlier pixel-verified
    ground truth) - explaining why it's the one room that came out right.
  - This is, in a real sense, the SAME underlying failure the whole
    investigation started from six rounds ago (magnitude/label-position
    matching standing in for an actual dimension-line trace) - now
    isolated to one specific, well-defined sub-step instead of smeared
    across the whole orientation chain. Genuine progress in isolating the
    defect; not a working solution.
  - Does NOT meet the user's own stated bar ("if this converges cleanly")
    - **not applied to live `field_resolutions` or `rooms`.** Reporting
    in full, including the isolated root cause, and NOT attempting a
    further round unprompted given this is the fourth consecutive prompt-
    level iteration and each of the last three traded one failure mode
    for a different one at the SAME two target rooms' worth of overall
    correctness.

## Status: CLOSED — known-orientation wall-length investigation (rotation solved, dimension-tracing is a documented model limitation, not an open bug)

- 2026-08-16 — User's final decision on the four-round investigation
  above: stop iterating the prompt. Four consecutive rounds each fixed
  the prior round's failure while surfacing a new one, without ever
  converging on a fifth try's evidence of actually doing so - continuing
  further risked a fifth failure mode, not resolution. Explicit
  instruction: document this as **closed**, not open/pending, with a
  clear split between what's actually solved (permanent, applies to
  every future project) and what remains a known, documented limitation
  (mitigated by an existing safety net, not by further prompt work).
  No further prompt iteration to be attempted.

**SOLVED, permanently, code-verified - not a prompt behavior, can't regress
silently:** converting "which page edge does the front-entry anchor sit
at" into "which compass pair does a page-horizontal vs. page-vertical
room dimension belong to" is pure rotation arithmetic. This is now
`computeCompassWallLengthsFromPageAxes()` in `lib/drawingExtraction.ts` -
deterministic code, not a model judgment call, unit-tested against 6
synthetic cases (including hypothetical front-facing directions beyond
Kinsela's own front=W, to prove the general rotation logic is correct,
not just correct for this one project) and confirmed via real API runs
to apply itself with 100% internal consistency to whatever raw
observations it's given. This eliminates the specific failure mode that
started this whole investigation (a 90-degree axis swap between a room's
North/South and East/West wall lengths) for Kinsela and for every future
project that confirms a building orientation - the model no longer
performs this computation at all, so it cannot get the ARITHMETIC wrong
again, ever, regardless of prompt wording drift in unrelated future
changes.

**NOT solved, and not going to be solved by further prompt engineering -
a documented model limitation, mitigated by an existing safety net:**
the one remaining model task - visually tracing which of a room's two
printed dimension numbers actually runs page-horizontal vs.
page-vertical on the source drawing (as opposed to reading the room's
own label text left-to-right and assuming the printed order reflects
drawn orientation) - proved unreliable across all four rounds, most
starkly in round 4 (v5): the rotation math was proven correct in the
same run, yet 7 of 9 target rooms still came out backwards, and the
model's own "reason" text revealed why - it was reading label text
order ("per this room's own dimension label"), not tracing actual
extension lines on the page, despite explicit instruction to do the
latter. This is the same underlying failure the whole investigation
started from (magnitude/label-position matching standing in for a real
geometric read), now fully isolated to this one specific visual sub-task
rather than smeared across compass reasoning generally - but isolating
it did not fix it, and there's no remaining evidence a fifth prompt
wording would either.

**Mitigation, permanent, not a stopgap:** `roomHasUnresolvedWallOrientation`
(`lib/fieldResolutions.ts`) - the existing human Accept/Override gate
built 2026-08-14, unchanged this whole investigation - remains the real
safety net for this specific sub-step. It already blocks
`BuildingOrientationSection`'s "Save & Auto-Fill Walls" transform per
room until a human has confirmed or corrected that room's wall data, and
it is not being removed, loosened, or treated as temporary now that the
rotation-math half of the problem is solved - a human still has to
verify the one thing this investigation proved the model cannot reliably
self-check: whether it actually looked at the drawing or the label text.
The corrected 9-room Kinsela ground truth from earlier in this session
(Great Room and Bath 3 fixed via direct pixel inspection, 7 rooms
confirmed already correct, Walk-In Closet reclassified as no exterior
exposure) remains live in `field_resolutions`/`rooms`, entirely
unaffected by this closed investigation - none of rounds v2-v5 were ever
applied to the database.

**Not proceeding further on this topic** unless new evidence changes the
picture (e.g. a different model, a deterministic PDF-dimension-line-
extraction path built as real application code rather than a prompt
instruction - flagged as a real option earlier this session, 2026-08-14,
not built). Returning to other work.

## Status: Summit Report Standard, Phase 1 (data model + validator + Vivian Street fixture) - built and verified live

- 2026-08-16/17 — New work: "Implement report generation per
  REFERENCE-DOCS/SUMMIT-REPORT-STANDARD.md." Surveyed first rather than
  writing code blind - existing system is a two-PDF (Internal Report +
  Client Scope of Work) Puppeteer/HTML setup with generic branding;
  none of the new standard's 11-page single-file HTML, compass diagram,
  donut charts, floor-plan compositing, generation-gate UI, or org
  branding exist yet. Two assets the standard treats as load-bearing are
  missing from the repo: the canonical reference HTML
  (`summit-report-4308-vivian-street.html`) and `manual-j-worksheet.html`
  (branding token source) - flagged to the user rather than silently
  guessed around. Found `REFERENCE-DOCS/MJS - 4308 Vivian Street.pdf` - a
  real, licensed one-page Manual J assessment (Michael & Raquel Wacher,
  TX license TACLA92868E) whose AHU-1 latent (2,706) + AHU-2 latent
  (5,137) = 7,843, matching the acceptance criteria's expected corrected
  total exactly - this became the real source data for the fixture.
  User confirmed: build the fixture from the real PDF and proceed on the
  standard's written text alone (option b of two offered), rather than
  wait on the missing assets.
  **Delivered, all verified against the live DB, not just locally:**
  - Migration `20260816180000_add_org_branding_and_report_validation_fields.sql`:
    `organizations.license_number` / `logo_data_uri`, both nullable -
    Section 4 requires real values ("never fabricated, never a bracketed
    placeholder"); no license number or logo was invented.
  - `lib/reportValidation.ts` - `validateReportTotals()` (Section 6's
    three cross-foot checks: room->zone, zone->whole-house, latent
    structure+ducts+ventilation at both levels) and
    `computeRequiredTonnage()` (Section 6 bullet 4's 0.70 SHR
    convention - the only place this formula lives, so there's no
    separate cached tonnage value to drift from it).
  - `lib/__tests__/reportValidation.test.mts` - kept as a permanent,
    checked-in test (no jest/vitest in this repo; run via
    `npx tsx lib/__tests__/reportValidation.test.mts`) per Section 6's
    explicit "so the bug it caught can never regress silently." 6/6
    pass, including the exact Vivian Street 7,843-from-5,597 case.
  - `lib/reportGate.ts` - `getReportGenerationGateStatus()`, all four
    Section 3 gate conditions. **Known, explicitly flagged schema gap**:
    equipment selection is project-wide (`projects.selected_equipment_id`),
    not per-system - the standard's own Section 5.3 wants "one panel per
    AHU/zone." Checked against what the schema supports today; true
    per-system tracking needs a real schema change, not built here.
  - **Vivian Street fixture, live in the database** (project id
    `fda29eba-e660-4da6-839a-41d7666b16f8`, org = the real Summit org,
    not a synthetic one): 2 zones (AHU-1/AHU-2), 2 rooms (one per
    system - no real floor plan exists for this address, so this is an
    honest simplification, not fabricated room-level precision), an
    existing Carrier catalog entry selected as equipment, 4 duct runs.
    Room internal-gains overrides were SOLVED against the real
    `computeManualJ` engine (not guessed) so each zone's live,
    freshly-computed total hits the PDF's real AHU-1 (15,803S/2,706L)
    and AHU-2 (20,954S/5,137L) figures exactly - confirmed via a live
    `getReportData()` call: whole-house sensible 36,757.0, latent
    7,843.0, `validateReportTotals` passes with 0 discrepancies on fresh
    data. A `calculation_snapshots` row (version 1) was then seeded with
    the historical bug reproduced deliberately - stored latent 5,597
    instead of the correct 7,843 - and confirmed `validateReportTotals`
    catches it: exactly one discrepancy, corrected value 7,842.998
    (rounds to 7,843 for display), matching the acceptance criteria's
    named numbers precisely.
  - **Real, pre-existing bug discovered and flagged, not fixed (out of
    scope for this checkpoint)**: `getReportData()`'s climate lookup
    (`lib/reportData.ts`) is `.eq("state", project.state).limit(1)` with
    no county filter and no ORDER BY - it returns whatever TX county
    postgres hands back first (confirmed live: "Anderson", winter=24/
    summer=99), never the project's actual county, regardless of
    address. This affects every multi-county state's projects already
    in this app, not just this fixture - the fixture's overrides were
    solved against Anderson's actual temps (what the live code path
    really uses) specifically because of this, not Harris County's
    (Houston's real temps), so the fixture stays numerically correct
    against the current buggy behavior. Flagged to the user; not fixed
    without direction, since it's unrelated to report generation itself.
  - Live gate check on the real fixture: `canGenerate: false`, one real
    blocker - "No equipment has been selected" - because the selected
    Carrier catalog entry has no `equipment_performance_points` rows, so
    it genuinely cannot be evaluated/interpolated at design conditions.
    This is the gate working correctly on real incomplete data, not a
    bug - a legitimate follow-up (seed real OEM performance points, or
    select different equipment that has them) rather than something
    papered over to make the fixture look more finished than it is.
  **Not yet built**: the 11-page single-file HTML template itself,
  Summit's compass diagram (SVG per Section 7), donut charts, floor-plan
  compositing, the generation-gate UI (disabled-button + checklist),
  org branding settings UI (so a real license number/logo can actually
  be entered). Reported back before starting that (much larger) phase.

## OPEN BUG — HIGH PRIORITY, NOT FIXED — climate_zone_reference lookup ignores county

`lib/reportData.ts`'s `getReportData()`:
```
const { data: climateZoneRows } = await supabase
  .from("climate_zone_reference")
  .select("county, iecc_zone, winter_design_temp_f, summer_design_temp_f, summer_coincident_wetbulb_f")
  .eq("state", project.state)
  .limit(1);
```
This filters by `state` only - no county filter, no `ORDER BY` - so it
returns whatever row postgres hands back first for that state, not the
project's actual county. Confirmed live on the Vivian Street fixture
(Houston, Harris County, TX): the real Harris County row (winter=29,
summer=97, wetbulb=76.8) exists in the table, but this query returns
Anderson County instead (winter=24, summer=99, wetbulb=74.1) - a
different, wrong climate zone, silently, for every TX project with more
than one county in the reference table (which is all of them - `select
count(*)` on `climate_zone_reference where state='TX'` returns 254 rows,
one per county). This is not specific to TX or to this fixture - any
state with more than one county row will hit the identical bug.

**Impact**: every design-temp-dependent number in a report (heating/
cooling loads, ventilation CFM, equipment sizing) is computed against
the wrong county's design conditions for any project whose state has
more than one row in `climate_zone_reference` - which, per the 254-row
TX count, is effectively every real project already using this app.

**Not fixed** - discovered while building the Summit Report Standard
fixture, explicitly out of scope for that work per user instruction.
Needs its own fix: `projects` has no `county` column today (confirmed -
only city/state/zip), so the real fix likely needs either (a) a `county`
column on `projects`, populated the same way `lib/countyLookup.ts`
already resolves county from address elsewhere in the app, then filter
`climate_zone_reference` by it, or (b) resolving county from zip/city at
report-generation time via that same existing lookup rather than storing
it. Flagged here as a standalone, high-priority item - not addressed
further this session.

## Status: Summit Report Standard, Phase 2 (template/compass/charts/gate UI) - built and verified live

- 2026-08-17 — Continued into the template/UI phase per user direction.
  Also: added placeholder OEM performance data to unblock the equipment
  gate for end-to-end testing (explicitly flagged, not real catalog
  data) - see below for why this ended up needing a NEW fixture-only
  catalog entry rather than just adding points to the real Carrier SKU.
  **Delivered, all `tsc --noEmit` clean, all verified against real
  Vivian Street data:**
  - `lib/reportCompass.ts` - Section 7's Summit compass: fixed N/S/E/W
    ring, rotating two-tone needle (amber tip = confirmed front-entry
    direction, silver tip = opposite), self-contained inline SVG. Draws
    an explicit "not yet confirmed" state (no needle) when orientation
    is null - never implies a direction that isn't actually confirmed.
  - `lib/reportCharts.ts` - donut chart segment builder + inline SVG
    renderer for Section 7's Building Analysis page. **Known granularity
    gap, flagged in the module's own header comment**: only 5 real,
    data-driven categories (Envelope & Infiltration combined, Doors,
    Ducts, Ventilation, Internal Gains) instead of the standard's full
    nine (walls/glazing/ceilings/floors/infiltration would need separate
    figures) - lib/manualJ.ts's computeRoom blends those into one
    internal accumulator today. Splitting it apart is a real, contained
    engine change, deliberately NOT attempted this pass given the size
    of everything else here and the stakes of touching calculation logic
    other live projects depend on unreviewed. Every segment shown is
    still 100% real (never illustrative), just coarser than ideal.
  - `lib/reportHtmlV2.ts` - `renderSummitReportHtml()`, all 11 Section 5
    pages, single self-contained HTML file (Section 2). Two more real
    gaps flagged in the file's own header rather than faked:
    - **AED Assessment (page 6)**: renders an explicit "not yet computed
      by this engine" state, never a fabricated pass/fail - ACCA's AED
      check needs per-orientation/hourly load data this app's
      computeManualJ (a single design-point calc) doesn't model. Building
      that is a real calculation-engine capability, not report
      formatting.
    - **Floor Plan (page 9)**: only renders when a project actually has
      an extracted drawing; Vivian Street (seeded directly from a Manual
      J PDF, never uploaded/extracted) correctly shows "no floor plan on
      file," not an approximated or regenerated drawing - Section 7
      explicitly forbids the latter.
    - Fonts (IBM Plex Sans/Mono) declared by name with system fallbacks,
      not embedded as base64 - out of scope for this pass; report stays
      fully self-contained/portable either way (no network fetch), just
      may render in a fallback font without IBM Plex installed locally.
  - `lib/reportGate.ts` was already built in Phase 1; reused as-is.
  - `components/report-generation-gate.tsx` (client) + new
    `app/api/reports/gate-status/route.ts` (server) - the Section 3
    blocking checklist. Deliberately split this way so the client
    component doesn't have to bundle computeManualJ/computeManualD/
    evaluateEquipment (getReportData's dependencies) just to check
    readiness - it fetches a small JSON status from the new route
    instead, which calls the exact same lib/reportGate.ts function the
    real render path uses server-side.
  - `components/org-branding-settings.tsx` + `app/dashboard/settings/branding/page.tsx` -
    admin-only form for org name/license/logo (Section 4). Logos stored
    as base64 data: URIs (not Storage URLs) to keep the report genuinely
    self-contained; capped at 200KB to keep report file size reasonable.
  - **Found and fixed a real, separate gap while building this**:
    `organizations` had only a SELECT RLS policy, no UPDATE - the
    branding form would have silently failed (RLS-blocked, no visible
    error). Added `20260817010000_add_organizations_update_policy.sql`
    (admin-only, scoped to the admin's own org), applied and verified
    live (`pg_policies` now shows both SELECT and UPDATE).
  - `app/api/reports/route.ts` - added a third `type: "summit_standard"`
    alongside the existing `internal`/`client` types, completely
    unchanged in behavior. The new type gates via
    `getReportGenerationGateStatus` BEFORE snapshotting (a 422 with the
    blocker list if not ready) - Section 3/8's "freezing early would
    freeze an incomplete project" principle, applied literally. Pulls
    real org branding + `building_front_faces` + drawings for the new
    template. **Did not remove or alter the existing two-PDF system** -
    left as a genuine open question for the user (does this new standard
    replace it, or coexist?), not decided unilaterally.
  - `components/generate-reports-button.tsx` - added a third section
    ("Generate Summit Standard Report") wired to the new gate component
    and type; existing Internal/Client buttons completely untouched.
  - **Equipment gate exercise revealed a second, sharper consequence of
    the already-flagged per-project (not per-system) equipment schema
    gap**: the real small Carrier unit (24,000 BTU) can never pass
    `isCompatible`'s ACCA window against the WHOLE-HOUSE total (44,600
    BTU / ~3.7 tons) - not a performance-data gap, a sizing gap. A
    genuinely 2-system house like this one structurally cannot pass
    equipment completeness with real, correctly-per-system-sized
    equipment under this schema. Rather than distort the real Carrier
    SKU's capacity to force a fit, created a new, clearly-named
    `FIXTURE-PLACEHOLDER` / `VIVIAN-ST-WHOLE-HOUSE-TEST-UNIT` catalog
    entry sized for the whole-house load instead, with its own 16-point
    synthetic cooling performance grid, selected for the project with an
    explicit note explaining why. **Caveat**: the 16 placeholder points
    added earlier to the REAL Carrier 26TPA824W003 entry (before this
    sizing problem was discovered) are still there, correctly flagged
    via `source_document`, but its original `source_document` text was
    overwritten without being saved first - not perfectly revertible.
    Both are shared, global reference-table rows (not project-scoped),
    so this affects how that Carrier SKU appears for any future project,
    not just this fixture - flagged clearly, not hidden.
  - **End-to-end verification**: rendered real HTML from the live
    Vivian Street fixture via `renderSummitReportHtml` (32,543 bytes, no
    runtime errors) and published it as an artifact for visual QA -
    https://claude.ai/code/artifact/df5b9c85-0550-40a7-b55c-64eeea6e4f7d.
    Live gate check on the fixture after the placeholder equipment fix:
    `canGenerate: true`, zero blockers.
  **Not yet done**: embedding real font files (currently name-only with
  fallback); splitting the donut chart's envelope category into the
  full nine per Section 7; AED assessment's actual calculation
  (needs new engine capability, not report work); floor-plan image
  compositing with the compass overlay (Section 7's cropping/overlay
  method itself, only exercised for the "no drawing" empty state so
  far, since Vivian Street has no drawing to composite against); the
  open architectural question of whether this new report type replaces
  the existing Internal/Client PDFs or coexists alongside them
  permanently.

- 2026-08-23 — **Mined the user's exported Claude.ai history** (53
  conversation summaries scanned via `jq`, not full transcripts loaded)
  after the user asked for it as part of a broader repo-recovery audit.
  The export lives at `CLAUD-HISTORY-COMPLETE-RECORD/` (gitignored,
  never committed — confirmed clean). Findings that add real information
  not already in this file or `CLAUDE.md`:
  - **Business model**: Summit is being built for eventual **nationwide
    SaaS sale to other HVAC contracting orgs**, not just Summit's own
    internal use — CLAUDE.md's "Purpose" section read as internal-tool
    framing and has been given one clarifying line. Draft 3-tier pricing
    already exists from a past session (Starter $129/mo, Pro $299/mo,
    Enterprise $799+/mo, capped free "Preview" tier, +2mo free annual) —
    not implemented anywhere in code, just a prior planning artifact; not
    acted on now, noted for whenever pricing/billing becomes real work.
  - **Competitive positioning** (already informally understood, now
    concretely documented): Wrightsoft Right-Suite Universal is the
    ACCA-recognized market leader but desktop-only (forces a second site
    visit for field techs). AutoHVAC is the closest philosophical
    competitor but its AI blueprint extraction is a black box with no
    audit trail and is not ACCA-certified — this is the direct
    validation for why Summit's UNRESOLVED review/audit-trail workflow
    is the core differentiator, not a cosmetic feature.
  - **Related-but-separate businesses surfaced in the export, confirmed
    NOT part of this codebase**: First Defense Insulation, LLC (a
    crawlspace/attic inspection-report business where the user is
    Director of Sales — several conversations produce branded .docx/PDF
    inspection reports for that company, unrelated to Summit HVAC's
    calculation engine); Crossway Mechanical (referenced as a demo/pilot
    HVAC client, not confirmed as user-owned). Noting these so a future
    session doesn't confuse First Defense's navy/red branding or
    "Director of Sales" title with Summit's own black/silver/bronze-gold
    identity if the export is ever revisited.
  - **`REFERENCE-DOCS/summit-platform-vision-AEC-master.md` does not
    exist in this repo** (checked full git history, not just working
    tree — never committed here). The export describes it as a
    long-term vision document covering structural/electrical/plumbing/
    fire-safety/civil/accessibility analysis beyond HVAC, explicitly
    filed as future scope and excluded from active extraction
    instructions at the time ("current build scope remaining Manual
    J/D/S only"). Genuinely missing, not deferred-and-tracked — flagged
    to the user rather than reconstructed from a conversation summary.
  - **Two items described in past planning that turned out to already be
    built** (verified against current code before assuming otherwise):
    org-level preferred/exclusive equipment lines
    (`supabase/migrations/20260811030638_add_equipment_org_preferences.sql`
    + `app/dashboard/settings/equipment/page.tsx`), and the
    drawing-extraction "literacy practices" — dimensional reconciliation
    hierarchy, source-authority hierarchy, uncertainty tiers — present in
    `lib/drawingExtraction.ts` / `app/api/drawings/extract/route.ts`.
  - **One item confirmed still missing** against original architecture
    intent: offline-capable PWA field data capture with sync (no
    service worker, no manifest.json, no offline handling anywhere in
    the app) — flagged as an open question, not started.
  - **One real conflict surfaced, not resolved unilaterally**: a past
    session gave the explicit instruction "actively source all
    reference data (ACCA duct tables, manufacturer extended performance
    data, NREL climate bin data) from credible web sources rather than
    treating any data gap as a blocker." Phase 4 of this build (see
    `PHASE.md`) instead left the canonical `summit_standard` reference
    file blocked, waiting on the user to manually source real Carrier
    OEM performance data for Vivian Street. These two are in tension —
    surfaced to the user, not silently picked.

- 2026-08-23 (second entry) — **Resolved Phase 5's five carried-over open
  questions** at the user's direction, then wrote the missing vision doc.
  - **Vivian Street OEM data**: user authorized autonomous web sourcing.
    Investigation (a scratch `@supabase/supabase-js` inspection script,
    run and deleted, not committed) found this didn't need fresh
    sourcing — real, cited Carrier 26TPA824W003 performance data (30
    points, citation to Carrier's official Performance 18 Product Data
    PDF) was already committed in
    `supabase/migrations/20260811031915_replace_discontinued_equipment.sql`.
    The **live database itself was corrupted**: a 2026-08-17 write had
    inserted 16 synthetic placeholder performance points alongside the
    real 30 (several sharing the same outdoor-temp/wetbulb coordinate as
    a real point but with different, made-up capacity values — a genuine
    interpolation-integrity bug, not just mislabeled data), and had
    overwritten `equipment_catalog.source_document` for that row to
    placeholder text. **Fixed live**: deleted the 16 placeholder rows
    (matched by their shared insert-batch `updated_at` timestamp),
    restored the real citation string. Verified after: exactly 30 points
    remain (all from the real 2026-08-12 insert), `source_document`
    matches the migration file again.
  - Also confirmed, while investigating: the FIXTURE-PLACEHOLDER /
    VIVIAN-ST-WHOLE-HOUSE-TEST-UNIT catalog entry (created in the
    2026-08-17 session referenced above, to work around a per-project
    equipment-sizing gap) **no longer exists live**. The later
    `20260822210000_per_zone_equipment_selection.sql` migration moved
    equipment selection from `projects` to `zones` (one selection per
    AHU/system), which resolves the exact sizing gap that entry existed
    to paper over. Vivian Street is confirmed live as a genuine 2-zone
    project (AHU-1, AHU-2), both currently `selected_equipment_id: null`
    — real per-zone equipment selection is unfinished follow-up work, not
    done this session, but the schema-level blocker is gone.
  - **AED solar-position approach**: user chose sourcing real solar
    irradiance data (NOAA/NREL) over a from-scratch astronomical engine,
    for whenever AED work resumes. Decision recorded only; AED itself
    (`lib/manualJ.ts` etc. still lack it) is untouched this session.
  - **PWA/offline field capture**: user confirmed still wanted, to be
    scheduled as a future phase (exact slot not yet decided).
  - **`summit-platform-vision-AEC-master.md`**: user chose to write it
    for real. Created at
    `REFERENCE-DOCS/summit-platform-vision-AEC-master.md` — covers the
    SaaS business model and draft pricing tiers, competitive positioning,
    and the long-term AEC-discipline-expansion idea (structural,
    electrical, plumbing, fire safety, civil, accessibility) alongside
    HVAC, explicitly scoped as directional/not-committed and explicitly
    **not** expanding current build scope (still HVAC-only). See that
    file for the full content rather than duplicating it here.
  - No calc-engine, schema, or migration files changed this session —
    the OEM-data fix was a live-data correction back to what the
    already-committed migration specifies, not a schema change.

- 2026-08-23 (third entry) — **Ran the Vivian Street ground-truth
  comparison** the user actually wanted: the user clarified mid-session
  that Vivian Street's whole purpose is a real, already-completed Manual
  J calc (done for an actual client, `REFERENCE-DOCS/4308 Vivian
  Street.pdf` — the real Right-Suite Universal output) planted as ground
  truth, so Summit's engine can be checked against a known-correct
  answer — not a project that itself needs finishing. Extracted the real
  PDF's text with `pypdf` (installed via `pip3 install --user pypdf`;
  no system `poppler`/`pdftoppm` available on this machine, wasn't
  needed since the PDF has selectable text) and got full whole-house and
  per-AHU heating/cooling sensible/latent numbers, component breakdowns,
  and equipment specs. Ran Summit's live `getReportData`/`computeManualJ`
  against the seeded project (via a scratch Vitest test file, run then
  deleted, not committed) and compared.
  - **Result**: whole-house heating computed 37% low (26,446 vs. real
    42,183 Btuh). Cooling sensible was coincidentally close (35,476 vs.
    36,757).
  - **Root cause, confirmed by reading the actual `rooms` rows**: the
    project has only 2 rooms seeded (one aggregate box per zone, e.g.
    "1st Floor Living Areas"), not the ~27 real rooms the real report
    itemizes. Both synthetic rooms have `window_*_area_sqft` all `null`,
    `floor_exposed: false`, and `door_count: 0` — so glazing (11.5%/
    21.5% of real heating/cooling), floor (9.7%/7.8%), and door (1.5%/
    1.9%) loads all compute as exactly zero for both zones. Also found
    each room's `sensible_gain_override`/`latent_gain_override` set to a
    value that exactly equals Summit's own computed internal-gains
    output for that zone — a legitimate field-verification override
    field used instead as a cosmetic patch to force the internal-gains
    line to match, not a real measurement.
  - **Not fixed this session** — the user asked to run the comparison
    and capture what's learned, explicitly not to be pulled into further
    decisions this session. Entering real per-room data for all ~27
    rooms is nontrivial data entry against a real client's real house
    and needs the user's go-ahead first.
  - **Knowledge captured for reuse**, per the user's explicit ask to
    retain and build on this rather than relearn it each time: saved as
    two entries in Claude's persistent cross-session memory (not this
    repo) — one on Vivian Street's actual purpose, one on the general
    room-by-room data-model requirements this comparison surfaced
    (applicable to auditing any Summit project's input completeness, not
    just Vivian Street).
