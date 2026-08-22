// SUMMIT-REPORT-STANDARD.md Section 6 - mandatory validation before a
// report is allowed to render. This module is the single source of truth
// for "do these numbers actually cross-foot" - the report template reads
// its output rather than re-deriving any of this itself, so there is
// exactly one place this arithmetic lives (the standard's own bug class -
// a whole-house summary that silently dropped ventilation latent - was a
// duplication problem: the number that rendered wasn't the number that was
// actually summed from its own components).
//
// Deliberately checks whatever ReportData is passed in (live-computed OR
// loaded from a calculation_snapshots row) rather than re-running
// computeManualJ - live data is tautologically self-consistent by
// construction (see lib/manualJ.ts's own reduce logic), so the case that
// actually matters is a SNAPSHOT: frozen JSON that could have been
// captured by an older code path, hand-edited, or otherwise drifted from
// what a correct summation of its own component fields would produce.
import type { ReportData } from "./reportData";
import type { WholeHouseLoadResult, ZoneLoadResult, RoomLoadResult } from "./manualJ";

export type ReportValidationDiscrepancy = {
  scope: "zone" | "wholeHouse";
  zoneId: string | null;
  zoneName: string | null;
  field: "heatingBtuh" | "coolingSensibleBtuh" | "coolingLatentBtuh";
  label: string;
  storedValue: number;
  correctedValue: number;
  reason: string;
};

export type ReportValidationResult = {
  passed: boolean;
  discrepancies: ReportValidationDiscrepancy[];
};

// Float summation of many rooms can differ from the stored total by a
// fraction of a Btuh - not a real discrepancy, just IEEE 754 addition
// order. Anything past this is a genuine mismatch, not rounding noise.
const TOLERANCE_BTUH = 0.5;

function pushIfMismatch(
  out: ReportValidationDiscrepancy[],
  scope: "zone" | "wholeHouse",
  zoneId: string | null,
  zoneName: string | null,
  field: ReportValidationDiscrepancy["field"],
  label: string,
  storedValue: number,
  correctedValue: number,
  reason: string,
) {
  if (Math.abs(storedValue - correctedValue) > TOLERANCE_BTUH) {
    out.push({ scope, zoneId, zoneName, field, label, storedValue, correctedValue, reason });
  }
}

// Mirrors computeManualJ's own room->zone grouping exactly (lib/manualJ.ts:
// a room's zone_id counts only if it matches a real zone in the zones
// list; otherwise it falls into the synthetic "Unassigned" bucket) - this
// validator must group rooms the identical way the engine that produced
// the numbers did, or it will manufacture false discrepancies of its own.
function groupRoomsByZone(
  rooms: { id: string; zone_id: string | null }[],
  zones: { zoneId: string | null }[],
): Map<string | null, string[]> {
  const zoneIds = new Set(zones.map((z) => z.zoneId).filter((id): id is string => id !== null));
  const groups = new Map<string | null, string[]>();
  for (const room of rooms) {
    const key = room.zone_id && zoneIds.has(room.zone_id) ? room.zone_id : null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(room.id);
  }
  return groups;
}

function sumField(rooms: RoomLoadResult[], roomIds: Set<string>, field: keyof RoomLoadResult): number {
  return rooms
    .filter((r) => roomIds.has(r.roomId))
    .reduce((sum, r) => sum + (r[field] as number), 0);
}

export function validateReportTotals(data: ReportData): ReportValidationResult {
  const discrepancies: ReportValidationDiscrepancy[] = [];

  if (data.residential) {
    const { manualJ, rooms } = data.residential;
    const roomGroups = groupRoomsByZone(
      rooms.map((r) => ({ id: r.id, zone_id: r.zone_id })),
      manualJ.zones,
    );

    // Section 6, bullet 1 (room -> zone) and bullet 3 (latent components ->
    // zone latent total), combined: each zone's reported total must equal
    // its own rooms' sum plus its own ventilation contribution - the exact
    // formula computeManualJ uses to build it in the first place.
    for (const zone of manualJ.zones) {
      const roomIds = new Set(roomGroups.get(zone.zoneId) ?? []);
      const roomHeating = sumField(manualJ.rooms, roomIds, "heatingBtuh");
      const roomCoolingSensible = sumField(manualJ.rooms, roomIds, "coolingSensibleBtuh");
      const roomCoolingLatent = sumField(manualJ.rooms, roomIds, "coolingLatentBtuh");
      const roomDuctLatent = sumField(manualJ.rooms, roomIds, "ductCoolingLatentBtuh");
      const structureLatent = roomCoolingLatent - roomDuctLatent;

      pushIfMismatch(
        discrepancies,
        "zone",
        zone.zoneId,
        zone.zoneName,
        "heatingBtuh",
        `${zone.zoneName} heating`,
        zone.heatingBtuh,
        roomHeating + zone.ventilationHeatingBtuh,
        `Room-level heating loads (${roomHeating.toFixed(0)}) + ventilation (${zone.ventilationHeatingBtuh.toFixed(0)}) do not sum to this system's reported heating total.`,
      );
      pushIfMismatch(
        discrepancies,
        "zone",
        zone.zoneId,
        zone.zoneName,
        "coolingSensibleBtuh",
        `${zone.zoneName} cooling sensible`,
        zone.coolingSensibleBtuh,
        roomCoolingSensible + zone.ventilationCoolingSensibleBtuh,
        `Room-level cooling sensible loads (${roomCoolingSensible.toFixed(0)}) + ventilation (${zone.ventilationCoolingSensibleBtuh.toFixed(0)}) do not sum to this system's reported cooling sensible total.`,
      );
      pushIfMismatch(
        discrepancies,
        "zone",
        zone.zoneId,
        zone.zoneName,
        "coolingLatentBtuh",
        `${zone.zoneName} cooling latent`,
        zone.coolingLatentBtuh,
        structureLatent + roomDuctLatent + zone.ventilationCoolingLatentBtuh,
        `Latent load components - structure (${structureLatent.toFixed(0)}) + ducts (${roomDuctLatent.toFixed(0)}) + ventilation (${zone.ventilationCoolingLatentBtuh.toFixed(0)}) = ${(structureLatent + roomDuctLatent + zone.ventilationCoolingLatentBtuh).toFixed(0)} - do not match this system's reported latent equipment total of ${zone.coolingLatentBtuh.toFixed(0)}.`,
      );
    }

    // Section 6, bullet 2 (zone -> whole-house) and bullet 3 (repeated at
    // whole-house rollup level) - the exact bug class the standard names:
    // "a whole-house summary that silently dropped the ventilation latent
    // contribution" is caught here specifically, since it's a
    // zones-sum-correctly-but-whole-house-total-doesn't-match-the-zones
    // shape of error, not a per-zone one.
    const zoneSum = manualJ.zones.reduce<Pick<WholeHouseLoadResult, "heatingBtuh" | "coolingSensibleBtuh" | "coolingLatentBtuh">>(
      (totals, zone: ZoneLoadResult) => ({
        heatingBtuh: totals.heatingBtuh + zone.heatingBtuh,
        coolingSensibleBtuh: totals.coolingSensibleBtuh + zone.coolingSensibleBtuh,
        coolingLatentBtuh: totals.coolingLatentBtuh + zone.coolingLatentBtuh,
      }),
      { heatingBtuh: 0, coolingSensibleBtuh: 0, coolingLatentBtuh: 0 },
    );

    pushIfMismatch(
      discrepancies,
      "wholeHouse",
      null,
      null,
      "heatingBtuh",
      "Whole-house heating",
      manualJ.wholeHouse.heatingBtuh,
      zoneSum.heatingBtuh,
      `System subtotals (${zoneSum.heatingBtuh.toFixed(0)}) do not sum to the reported whole-house heating total.`,
    );
    pushIfMismatch(
      discrepancies,
      "wholeHouse",
      null,
      null,
      "coolingSensibleBtuh",
      "Whole-house cooling sensible",
      manualJ.wholeHouse.coolingSensibleBtuh,
      zoneSum.coolingSensibleBtuh,
      `System subtotals (${zoneSum.coolingSensibleBtuh.toFixed(0)}) do not sum to the reported whole-house cooling sensible total.`,
    );
    pushIfMismatch(
      discrepancies,
      "wholeHouse",
      null,
      null,
      "coolingLatentBtuh",
      "Whole-house cooling latent",
      manualJ.wholeHouse.coolingLatentBtuh,
      zoneSum.coolingLatentBtuh,
      `System subtotals (${zoneSum.coolingLatentBtuh.toFixed(0)}) do not sum to the reported whole-house latent equipment total of ${manualJ.wholeHouse.coolingLatentBtuh.toFixed(0)}.`,
    );
  }

  return { passed: discrepancies.length === 0, discrepancies };
}

// Section 6, bullet 4: "Equipment tonnage = sensible load ÷ 0.70 (or the
// org-configured target SHR), and the displayed tonnage must match this
// computation, not a stored value that could drift from it." There is no
// separate stored tonnage field anywhere in this schema for a value to
// drift FROM - the fix here is structural, not a drift check: this is the
// only function that computes displayed tonnage, and the report template
// must call it at render time rather than reading equipment.nominal*CapacityBtu
// (a manufacturer nameplate spec, not a sizing target) or a cached figure.
export function computeRequiredTonnage(sensibleLoadBtuh: number, targetShr: number = 0.7): number {
  return sensibleLoadBtuh / targetShr / 12000;
}
