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
