// Real, cited local-exhaust requirements for bathrooms and kitchens -
// IRC Table M1507.3, chosen as Summit's default per user decision over
// the numerically different ASHRAE 62.2 figures (bathroom 50 cfm
// intermittent/20 continuous; kitchen 100 cfm range hood/300 cfm or 5 ACH
// non-hood - a real, different standard, not interchangeable with IRC's
// own numbers below). Verified against primary code text this session
// (2011 Oregon Residential Specialty Code Chapter 15, which republishes
// the IRC's own exhaust-systems chapter verbatim - read directly, not a
// paraphrase).
//
// None of these numbers are scaled by room floor area - they are flat
// per-fixture-category minimums. Room dimensions matter for duct SIZING
// (Table M1507.4, not implemented here) and for whole-house ventilation
// (lib/manualJ.ts's existing ASHRAE 62.2 Qtot calc), never for the local
// exhaust CFM requirement itself. Real range hood product CFM sizing is
// separately driven by the cooking appliance's own Btu output (~1 cfm
// per 100 Btu/hr of gas burner capacity) or cooktop width, not by room
// dimensions either - see the note returned for Kitchen below.
//
// Local exhaust is intermittent by design and is NOT added as a
// continuous Btuh heat-loss/gain term in lib/manualJ.ts - ACCA/ASHRAE
// methodology doesn't treat intermittent local exhaust as a continuous
// design-day load. What it correctly feeds is the makeup-air balance
// check (lib/makeupAir.ts) via a real exhaust_sources row.

export const IRC_BATHROOM_WITH_FIXTURE_INTERMITTENT_CFM = 80;
export const IRC_BATHROOM_CONTINUOUS_CFM = 20;
export const IRC_TOILET_ROOM_ONLY_CFM = 50;
export const IRC_KITCHEN_RANGE_HOOD_INTERMITTENT_CFM = 150;

export type LocalExhaustRequirement = {
  requiredCfm: number;
  codeCitation: string;
  note: string;
};

// Real, deterministic name-based classification - never part of the AI
// drawing-extraction call itself (see lib/drawingExtraction.ts), applied
// only when a room's room_type is still null, and never overwrites a
// human-set value.
export function inferRoomTypeFromName(name: string | null): "Bath" | "Kitchen" | null {
  if (!name) return null;
  const normalized = name.toLowerCase();
  if (/\bkitchen\b/.test(normalized)) return "Kitchen";
  if (/\bbath|\bpowder\b|water\s*closet|\bwc\b/.test(normalized)) return "Bath";
  return null;
}

// "Powder"/"half bath"/"water closet" naming is a real, reliable signal
// for the lower toilet-room-only rate (no bathing/spa fixture); every
// other Bath-classified name is treated as the higher bathing-fixture
// rate - never under-specified when the name doesn't clearly say
// otherwise.
export function isToiletRoomOnly(name: string | null): boolean {
  if (!name) return false;
  const normalized = name.toLowerCase();
  return /powder|half[\s-]?bath|water\s*closet|\bwc\b/.test(normalized);
}

export function computeLocalExhaustRequirement(
  roomType: string | null,
  roomName: string | null,
): LocalExhaustRequirement | null {
  if (roomType === "Bath") {
    if (isToiletRoomOnly(roomName)) {
      return {
        requiredCfm: IRC_TOILET_ROOM_ONLY_CFM,
        codeCitation: "IRC Table M1507.3 - toilet room without bathing or spa facilities",
        note: "Flat minimum, not scaled by room floor area.",
      };
    }
    return {
      requiredCfm: IRC_BATHROOM_WITH_FIXTURE_INTERMITTENT_CFM,
      codeCitation: "IRC Table M1507.3 - room with bathing or spa facilities (intermittent)",
      note: `Or ${IRC_BATHROOM_CONTINUOUS_CFM} cfm if run continuously. Flat minimum, not scaled by room floor area.`,
    };
  }
  if (roomType === "Kitchen") {
    return {
      requiredCfm: IRC_KITCHEN_RANGE_HOOD_INTERMITTENT_CFM,
      codeCitation: "IRC Table M1507.3 - range hood/downdraft exhaust (intermittent)",
      note:
        "Flat code minimum for the exhaust system, not the room. Real range hood product CFM sizing is separately driven by the cooking appliance's own Btu output (about 1 cfm per 100 Btu/hr of gas burner capacity) or cooktop width - not room dimensions, and range hood products are not yet catalogued in equipment_catalog (a disclosed gap, not a silent one).",
    };
  }
  return null;
}
