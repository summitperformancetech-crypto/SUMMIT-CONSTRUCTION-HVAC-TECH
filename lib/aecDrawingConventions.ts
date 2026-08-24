// Phase 6, item 1 (2026-08-23): standard AEC (architecture/engineering/
// construction) drawing-literacy reference the model can consult on
// every extraction, independent of any specific document. This is
// general professional convention - sheet numbering, abbreviations,
// dimensioning practice, symbol meanings - not project-specific data,
// so unlike lib/pdfTextExtraction.ts (which reads one document's own
// text) this is a static block included on every call.
//
// Why this exists: this session's own manual drawing-reading work
// (Kinsela) repeatedly leaned on exactly this kind of literacy -
// recognizing "9'-10" X 9'5"" as a room's clear/finished dimension vs.
// a "16'-8"" callout as an out-to-out framing dimension, recognizing
// sheet A1.1 vs A3.0 by number alone when a title was ambiguous,
// expanding "RD/SHELF" and "DBL RD/S" correctly. The existing "Reading
// discipline" paragraph in buildExtractionPrompt below already covers
// keynotes/grid lines/detail callouts; this fills the adjacent gaps
// (sheet numbering, abbreviations, dimension-type discrimination,
// common symbols) that generic "read carefully" instructions don't by
// themselves supply.
//
// Scoped deliberately: this is standard, widely-taught, non-
// proprietary industry convention (the kind covered in any
// construction-documents/drafting curriculum, AIA/CSI practice, or a
// basic blueprint-reading reference) - not a specific manufacturer's
// or jurisdiction's proprietary standard, and not a substitute for the
// per-project facts (KnownBuildingOrientation, the PDF's own text
// layer) the rest of this file already supplies. Real variation exists
// office-to-office (see the caveats inline below) - stated as such,
// not as rigid rules the model should override real drawing evidence
// with.
export function buildAecKnowledgeBaseBlock(): string {
  return `AEC DRAWING LITERACY REFERENCE - standard professional convention, not specific to this document. Use it to read faster and more accurately; where anything on the actual drawing conflicts with a convention below, the actual drawing always wins - these are common patterns, not universal rules every office follows.

SHEET NUMBERING (discipline prefix + sequence - use this to infer a sheet's likely content even when its title is missing, cut off, or ambiguous):
- C = Civil/site. L = Landscape. S = Structural. A = Architectural. ID = Interior Design. M = Mechanical (HVAC). E = Electrical. P = Plumbing. FP = Fire Protection.
- Within Architectural (the "A" series), a common sequence - real offices vary, treat as a pattern not a guarantee: A0.x cover sheet/general notes/code summary; A1.x floor plans (often A1.0 foundation, A1.1 main floor, A1.2+ additional levels); A2.x either roof plan or elevations depending on office convention; A3.x elevations or sections/details; A4.x+ interior elevations, schedules, or details. A dedicated "electrical plan," "plumbing plan," or "mechanical plan" sheet is sometimes numbered within the A-series (e.g. A2.x) on smaller residential sets rather than getting its own M/E/P prefix - don't assume a mechanical note only appears on an M-series sheet.
- A sheet's number is a hint for WHERE to look for a given kind of fact, never a reason to skip reading a sheet whose number doesn't match the fact you're looking for - the existing "review every page" instruction still governs.

DIMENSION TYPES - the single most common source of a wrong room-size reading. A room can legitimately have TWO different printed numbers describing what looks like "its size":
- CLEAR/FINISHED dimension: face-of-finish to face-of-finish (drywall to drywall) - the room's actual usable interior size. This is usually what belongs in floor_area_sqft/wall lengths for a Manual J room.
- OUT-TO-OUT / FRAMING dimension: face-of-stud to face-of-stud, or overall masonry width, measured on an exterior wall run or the whole building footprint - LARGER than the clear dimension by the wall thickness on each side (commonly 4-6" per wall for standard framing, more for masonry/brick veneer). A dimension string running along an exterior wall, or a large overall building-width/depth number in a title-block area, is often this type, not a single room's clear size.
- When a room shows two similar-but-different numbers nearby (e.g. a room-label box giving "15'-8" X 17'-10"" and a nearby wall run showing "16'-8""), prefer the number printed directly in or under the room's own name label as the clear dimension - that is the one Manual J needs. Don't average, round, or silently pick whichever number is more convenient.
- A single quote/apostrophe mark denotes feet, a double quote mark denotes inches (5'-6" = five feet six inches). A dimension with no inches shown after the feet mark (e.g. 15') means an even number of feet, not a truncated or missing value.

COMMON ABBREVIATIONS seen on residential/light-commercial architectural sheets (not exhaustive - if something abbreviated isn't in this list, reason about it from context rather than guessing at an unfamiliar expansion):
CLG / CEIL'G = ceiling. CLR = clear. TYP = typical. V.I.F. = verify in field. N.I.C. = not in contract. EQ = equal (equally spaced, not a dimension). O.C. = on center. FIN = finish/finished. ELEV / EL = elevation. WIC = walk-in closet. RD/SHELF or RD/S = clothes rod and shelf. DBL = double. CNTR = counter. CAB = cabinet. HDR = header. STL = steel. CONC = concrete. REINF = reinforced. GALV = galvanized. GYP BD = gypsum board (drywall). INSUL = insulation. MFR = manufacturer. (E) or EXIST = existing. (N) = new. DN / UP = stairs going down / up (direction is FROM the level the plan is drawn on). W/ = with. W/O = without.

COMMON SYMBOLS AND MARKS:
- A door is drawn as a line (the door leaf) with a quarter-circle arc showing its swing path - the arc's pivot point is the hinge side, the arc's far edge shows how far the door swings into the room.
- A window in plan view is a break in the wall line with one or more thin parallel lines across the opening (representing the glass/frame) - width of the break approximates the window's rough opening width; window HEIGHT is essentially never shown in plan view and must come from an elevation, a window schedule, or a labeled sill/head height - never infer height from the plan alone.
- Wall hatching/fill patterns distinguish construction type: a dense diagonal or brick-pattern hatch commonly indicates masonry/brick veneer; a lighter or unhatched double line commonly indicates wood/metal stud framing; a solid dark/filled wall commonly indicates concrete or CMU. Exact patterns vary by office - use it as a supporting signal alongside any explicit wall-type note or keynote, not as the sole source of truth.
- A small circle or triangle with a number, often near a dimension or detail, is typically a revision mark - check for a revision cloud/note nearby explaining what changed, since a revised dimension supersedes an unrevised one drawn elsewhere in the set.
- North arrows and graphic scale bars, when present, are usually near the sheet's title block or on the primary plan of that sheet - useful for confirming orientation independent of a project's already-confirmed building_front_faces, but never a reason to override that already-confirmed fact (see the orientation section above).`;
}
