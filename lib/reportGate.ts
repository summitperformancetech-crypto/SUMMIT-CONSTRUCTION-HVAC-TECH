// SUMMIT-REPORT-STANDARD.md Section 3 - the report generation gate. "The
// 'Generate Report' action must be disabled (not just warned-against)
// until every one of these is true" - this module is what a UI component
// calls to decide that, and what it shows while blocked (a checklist, not
// a single pass/fail toggle - see ReportGenerationGateStatus.blockers).
import type { ReportData } from "./reportData";
import type { DrawingExtraction } from "./drawingExtraction";
import { countUnresolvedFields } from "./fieldResolutions";
import { validateReportTotals } from "./reportValidation";

export type ReportGenerationBlocker = {
  code: "unresolved_fields" | "equipment_incomplete" | "duct_design_incomplete" | "totals_invalid";
  label: string;
  detail: string;
};

export type ReportGenerationGateStatus = {
  canGenerate: boolean;
  blockers: ReportGenerationBlocker[];
};

// Reasonable engineering tolerance for "does the duct design actually
// serve the selected equipment's airflow" - the standard doesn't specify
// a number, so this is a judgment call, flagged as such rather than
// presented as if it came from the standard itself.
const CFM_COMPATIBILITY_TOLERANCE = 0.15;

export function getReportGenerationGateStatus(
  data: ReportData,
  drawings: Array<{ id: string; extraction_status: string; extracted_data: DrawingExtraction | null }>,
  resolvedKeys: Set<string>,
): ReportGenerationGateStatus {
  const blockers: ReportGenerationBlocker[] = [];

  // Gate condition 1: "All UNRESOLVED fields are Accepted or
  // Overridden-with-reason - none outstanding, anywhere in the project."
  const unresolvedCount = countUnresolvedFields(drawings, resolvedKeys, data.project.id);
  if (unresolvedCount > 0) {
    blockers.push({
      code: "unresolved_fields",
      label: "Unresolved fields outstanding",
      detail: `${unresolvedCount} AI-extracted field${unresolvedCount === 1 ? "" : "s"} still need${unresolvedCount === 1 ? "s" : ""} to be Accepted or Overridden before a report can be generated.`,
    });
  }

  if (data.residential) {
    const { selectedEquipment, ductSchedule, ductRuns, rooms } = data.residential;

    // Gate condition 2: "Manual S equipment selection is complete for
    // every system (make/model/AHRI ref, selected against OEM extended
    // performance data at this project's actual design conditions - not
    // a placeholder or 'TBD' equipment block)."
    //
    // KNOWN GAP, not silently papered over: this schema has exactly one
    // selected-equipment field per PROJECT (projects.selected_equipment_id),
    // not one per system/zone. The standard's own Section 5.3 calls for a
    // full equipment spec "one panel per AHU/zone" - true per-system
    // tracking would need a real schema change (e.g. equipment_id on
    // zones, or a join table), not built here. This check validates what
    // the schema actually supports today: one real, fully-specified
    // selection, evaluated against real interpolated capacity at this
    // project's design conditions (not a nameplate/nominal figure).
    if (!selectedEquipment) {
      blockers.push({
        code: "equipment_incomplete",
        label: "Equipment selection incomplete",
        detail: "No equipment has been selected for this project yet (Manual S).",
      });
    } else if (
      !selectedEquipment.equipment.manufacturer ||
      !selectedEquipment.equipment.modelNumber ||
      selectedEquipment.coolingCapacityAtDesign == null
    ) {
      blockers.push({
        code: "equipment_incomplete",
        label: "Equipment selection incomplete",
        detail:
          "Selected equipment is missing make/model, or has no interpolated capacity at this project's actual design conditions (a placeholder/incomplete selection).",
      });
    }

    // Gate condition 3: "Manual D duct design is complete and compatible
    // with the selected equipment's CFM."
    const conditionedRooms = rooms.filter((r) => r.is_conditioned);
    if (conditionedRooms.length > 0) {
      if (ductSchedule.length === 0) {
        blockers.push({
          code: "duct_design_incomplete",
          label: "Duct design incomplete",
          detail: "No duct runs have been designed for this project yet (Manual D).",
        });
      } else {
        const branchRunsByRoomId = new Map(
          ductRuns.filter((r) => r.run_type === "branch" && r.room_id).map((r) => [r.room_id as string, r]),
        );
        const roomsWithoutBranch = conditionedRooms.filter((r) => !branchRunsByRoomId.has(r.id));
        if (roomsWithoutBranch.length > 0) {
          blockers.push({
            code: "duct_design_incomplete",
            label: "Duct design incomplete",
            detail: `${roomsWithoutBranch.length} conditioned room${roomsWithoutBranch.length === 1 ? "" : "s"} (${roomsWithoutBranch.map((r) => r.name).join(", ")}) have no branch duct run.`,
          });
        }

        if (selectedEquipment?.equipment.ratedCfm != null) {
          const runIdToCfm = new Map(ductSchedule.map((d) => [d.runId, d.cfm]));
          const totalBranchCfm = ductRuns
            .filter((r) => r.run_type === "branch")
            .reduce((sum, r) => sum + (runIdToCfm.get(r.id) ?? 0), 0);
          const ratedCfm = selectedEquipment.equipment.ratedCfm;
          const deviation = Math.abs(totalBranchCfm - ratedCfm) / ratedCfm;
          if (deviation > CFM_COMPATIBILITY_TOLERANCE) {
            blockers.push({
              code: "duct_design_incomplete",
              label: "Duct design incompatible with selected equipment",
              detail: `Total branch duct CFM (${Math.round(totalBranchCfm)}) differs from the selected equipment's rated airflow (${ratedCfm}) by more than ${Math.round(CFM_COMPATIBILITY_TOLERANCE * 100)}%.`,
            });
          }
        }
      }
    }
  }

  // Gate condition 4: "validateReportTotals (§6) passes with zero
  // unresolved discrepancies."
  const validation = validateReportTotals(data);
  if (!validation.passed) {
    blockers.push({
      code: "totals_invalid",
      label: "Calculation totals do not cross-foot",
      detail: `${validation.discrepancies.length} discrepanc${validation.discrepancies.length === 1 ? "y" : "ies"} found between reported totals and their components - must be corrected in the underlying project data before a report can be generated.`,
    });
  }

  return { canGenerate: blockers.length === 0, blockers };
}
