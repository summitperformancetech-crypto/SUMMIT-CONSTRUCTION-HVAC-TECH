"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  evaluateEquipment,
  rankEquipment,
  type EquipmentCatalogEntry,
  type EquipmentEvaluation,
  type PerformancePoint,
} from "@/lib/manualS";

export type EquipmentCatalogDbRow = {
  id: string;
  manufacturer: string;
  model_number: string;
  equipment_type: EquipmentCatalogEntry["equipmentType"];
  stage_type: EquipmentCatalogEntry["stageType"];
  nominal_cooling_capacity_btu: number | null;
  nominal_heating_capacity_btu: number | null;
  rated_cfm: number | null;
  source_document: string;
};

export type EquipmentPerformancePointDbRow = {
  equipment_id: string;
  mode: "cooling" | "heating";
  outdoor_temp_f: number;
  indoor_entering_temp_f: number;
  indoor_entering_wetbulb_f: number | null;
  sensible_capacity_btu: number;
  total_capacity_btu: number;
  input_power_kw: number;
};

export const EQUIPMENT_CATALOG_COLUMNS =
  "id, manufacturer, model_number, equipment_type, stage_type, nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm, source_document";
export const EQUIPMENT_PERFORMANCE_POINT_COLUMNS =
  "equipment_id, mode, outdoor_temp_f, indoor_entering_temp_f, indoor_entering_wetbulb_f, sensible_capacity_btu, total_capacity_btu, input_power_kw";

const STAGE_LABEL: Record<EquipmentCatalogEntry["stageType"], string> = {
  single: "Single-stage",
  two_stage: "Two-stage",
  variable_speed: "Variable-speed",
};

const TYPE_LABEL: Record<EquipmentCatalogEntry["equipmentType"], string> = {
  split_ac: "Split AC",
  heat_pump: "Heat Pump",
  furnace: "Furnace",
  package_unit: "Package Unit",
};

const DEFAULT_VISIBLE_COUNT = 3;

function fmt(value: number): string {
  return Math.round(value).toLocaleString();
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function EquipmentSelectionSection({
  zoneId,
  zoneName,
  catalog,
  performancePoints,
  manualJCoolingTotalBtuh,
  manualJHeatingBtuh,
  summerOutdoorDesignF,
  summerCoincidentWetbulbF,
  winterOutdoorDesignF,
  initialSelectedEquipmentId,
  initialEquipmentSelectionNotes,
  preferredEquipmentIds,
  exclusiveEquipmentIds,
  userRole,
}: {
  // SUMMIT-REPORT-STANDARD.md Section 5.3 - one panel per AHU/zone, so
  // this writes to zones.selected_equipment_id, not projects.
  zoneId: string;
  zoneName: string;
  catalog: EquipmentCatalogEntry[];
  performancePoints: PerformancePoint[];
  manualJCoolingTotalBtuh: number;
  manualJHeatingBtuh: number;
  summerOutdoorDesignF: number;
  summerCoincidentWetbulbF: number;
  winterOutdoorDesignF: number;
  initialSelectedEquipmentId: string | null;
  initialEquipmentSelectionNotes: string | null;
  preferredEquipmentIds: ReadonlySet<string>;
  exclusiveEquipmentIds: ReadonlySet<string>;
  // Field Tech = data entry only: equipment selection is Estimator/Admin
  // only. The real boundary is the zones.selected_equipment_id trigger
  // (see 20260822190000_restrict_field_tech_equipment_and_reports.sql,
  // moved onto zones by 20260822210000_per_zone_equipment_selection.sql);
  // this just disables the action in the UI rather than letting a Field
  // Tech hit a raw database error.
  userRole: string;
}) {
  const canSelectEquipment = userRole === "admin" || userRole === "estimator";
  const [selectedEquipmentId, setSelectedEquipmentId] = useState(initialSelectedEquipmentId);
  const [notes, setNotes] = useState(initialEquipmentSelectionNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const pointsByEquipment = useMemo(() => {
    const map = new Map<string, PerformancePoint[]>();
    for (const p of performancePoints) {
      if (!map.has(p.equipmentId)) map.set(p.equipmentId, []);
      map.get(p.equipmentId)!.push(p);
    }
    return map;
  }, [performancePoints]);

  // rankEquipment both filters to ONLY compatible equipment (cleared the
  // hard ACCA sizing-window gate - see isCompatible in lib/manualS.ts) and
  // sorts by compatibilityScore, with preferred/exclusive lines only
  // breaking ties/near-ties. Equipment outside the window never reaches
  // this array at all, by design - there is no "show it anyway, ranked
  // low" path.
  const ranked = useMemo(() => {
    const evals: EquipmentEvaluation[] = catalog.map((equipment) =>
      evaluateEquipment(
        equipment,
        pointsByEquipment.get(equipment.id) ?? [],
        manualJCoolingTotalBtuh,
        manualJHeatingBtuh,
        summerOutdoorDesignF,
        summerCoincidentWetbulbF,
        winterOutdoorDesignF,
      ),
    );
    const preferredOrExclusive = new Set([...preferredEquipmentIds, ...exclusiveEquipmentIds]);
    return rankEquipment(evals, preferredOrExclusive);
  }, [
    catalog,
    pointsByEquipment,
    manualJCoolingTotalBtuh,
    manualJHeatingBtuh,
    summerOutdoorDesignF,
    summerCoincidentWetbulbF,
    winterOutdoorDesignF,
    preferredEquipmentIds,
    exclusiveEquipmentIds,
  ]);

  const visible = showAll ? ranked : ranked.slice(0, DEFAULT_VISIBLE_COUNT);
  const hiddenCount = ranked.length - visible.length;

  async function handleSelect(equipmentId: string) {
    setError(null);
    setSaving(true);
    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("zones")
      .update({ selected_equipment_id: equipmentId, equipment_selection_notes: notes || null })
      .eq("id", zoneId);
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setSelectedEquipmentId(equipmentId);
  }

  return (
    <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
      <h2 className="mb-2 text-lg font-semibold text-brand-gold">Equipment Selection (Manual S) — {zoneName}</h2>
      {!canSelectEquipment && (
        <p className="mb-4 text-xs text-brand-grey-text">
          Read-only — only an Estimator or Admin can select equipment for this project.
        </p>
      )}
      <p className="mb-4 text-xs text-brand-grey-text">
        Capacity shown below is interpolated from each unit&apos;s OEM extended performance data at
        this project&apos;s actual design conditions ({summerOutdoorDesignF}°F / {summerCoincidentWetbulbF}°F
        wb cooling, {winterOutdoorDesignF}°F heating) - never the AHRI 210/240 nameplate rating.
        Nominal capacity is shown separately, clearly labeled, for reference only. Only equipment
        that clears the ACCA Manual S sizing window is shown at all; the compatibility score
        ranks how good a match among those, and is never affected by your org&apos;s preferred/
        exclusive lines - those only break ties in display order.
      </p>

      {error && (
        <p className="mb-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {ranked.length === 0 && (
        <p className="rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-6 text-center text-sm text-brand-grey-text">
          No catalog equipment falls within the ACCA Manual S sizing window for this
          project&apos;s Manual J load at its design conditions.
        </p>
      )}

      <div className="space-y-3">
        {visible.map((evaluation) => {
          const isSelected = evaluation.equipment.id === selectedEquipmentId;
          const isExpanded = expandedId === evaluation.equipment.id;
          const isPreferred = preferredEquipmentIds.has(evaluation.equipment.id);
          const isExclusive = exclusiveEquipmentIds.has(evaluation.equipment.id);
          return (
            <div
              key={evaluation.equipment.id}
              className={`rounded-lg border p-4 ${
                isSelected ? "border-brand-gold bg-brand-gold/10" : "border-zinc-800 bg-zinc-900"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-brand-silver-highlight">
                    {evaluation.equipment.manufacturer} {evaluation.equipment.modelNumber}
                    {isSelected && (
                      <span className="ml-2 rounded-full border border-brand-gold bg-brand-gold/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-gold">
                        Selected
                      </span>
                    )}
                    {isExclusive && (
                      <span className="ml-2 rounded-full border border-brand-gold-base bg-brand-gold-base/25 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-gold-hover">
                        Exclusive line
                      </span>
                    )}
                    {!isExclusive && isPreferred && (
                      <span className="ml-2 rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-silver">
                        Preferred
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-brand-grey-text">
                    {TYPE_LABEL[evaluation.equipment.equipmentType]} ·{" "}
                    {STAGE_LABEL[evaluation.equipment.stageType]} · Nominal (AHRI, reference only):{" "}
                    {evaluation.equipment.nominalCoolingCapacityBtu != null
                      ? `${fmt(evaluation.equipment.nominalCoolingCapacityBtu)} Btuh cooling`
                      : "—"}
                    {evaluation.equipment.nominalHeatingCapacityBtu != null &&
                      ` / ${fmt(evaluation.equipment.nominalHeatingCapacityBtu)} Btuh heating`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-brand-success">
                    {evaluation.compatibilityScore != null ? pct(evaluation.compatibilityScore) : "—"}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-brand-grey-text">
                    compatibility
                  </p>
                  <p className="mt-1 text-xs text-brand-grey-text">
                    {evaluation.coolingPercentOfLoad != null
                      ? `${pct(evaluation.coolingPercentOfLoad)} of cooling load`
                      : "—"}
                  </p>
                  <p className="text-xs text-brand-grey-text">
                    {evaluation.coolingCapacityAtDesign
                      ? `${fmt(evaluation.coolingCapacityAtDesign.totalCapacityBtu)} Btuh at design`
                      : "No interpolated capacity available"}
                  </p>
                </div>
              </div>

              {evaluation.equipment.equipmentType === "heat_pump" && (
                <p className="mt-2 text-xs text-brand-grey-text">
                  {evaluation.balancePointF != null
                    ? `Balance point: ${evaluation.balancePointF.toFixed(1)}°F`
                    : "Balance point below coldest published data point"}
                  {evaluation.supplementalHeatBtuh != null && evaluation.supplementalHeatBtuh > 0 && (
                    <span className="ml-2 rounded-full border border-brand-gold-base bg-brand-gold-base/25 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-gold-hover">
                      {fmt(evaluation.supplementalHeatBtuh)} Btuh (
                      {evaluation.supplementalHeatKw?.toFixed(1)} kW) supplemental heat needed at
                      design
                    </span>
                  )}
                </p>
              )}

              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() =>
                    setExpandedId((current) =>
                      current === evaluation.equipment.id ? null : evaluation.equipment.id,
                    )
                  }
                  className="text-xs text-brand-silver underline decoration-dotted hover:text-brand-gold-hover"
                >
                  {isExpanded ? "Hide capacity curve" : "Show capacity curve"}
                </button>
                {canSelectEquipment && (
                  <button
                    onClick={() => handleSelect(evaluation.equipment.id)}
                    disabled={saving}
                    className="rounded-md bg-brand-gold px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
                  >
                    {isSelected ? "Re-save selection" : "Select this equipment"}
                  </button>
                )}
              </div>

              {isExpanded && (
                <div className="mt-3 overflow-x-auto rounded-md border border-zinc-800 bg-brand-bg p-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-brand-grey-text">
                        <th className="pr-3">Outdoor °F</th>
                        <th className="pr-3">Entering wb °F</th>
                        <th className="pr-3 text-right">Total Btuh</th>
                        <th className="pr-3 text-right">Sensible Btuh</th>
                        <th className="text-right">kW</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pointsByEquipment.get(evaluation.equipment.id) ?? [])
                        .filter((p) => p.mode === "cooling")
                        .sort((a, b) => a.outdoorTempF - b.outdoorTempF)
                        .map((p, i) => (
                          <tr key={i} className="text-brand-silver">
                            <td className="pr-3">{p.outdoorTempF}</td>
                            <td className="pr-3">{p.indoorEnteringWetbulbF}</td>
                            <td className="pr-3 text-right">{fmt(p.totalCapacityBtu)}</td>
                            <td className="pr-3 text-right">{fmt(p.sensibleCapacityBtu)}</td>
                            <td className="text-right">{p.inputPowerKw.toFixed(2)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[10px] text-brand-grey-text">
                    Source: {evaluation.equipment.sourceDocument}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!showAll && hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 text-sm text-brand-silver underline decoration-dotted hover:text-brand-gold-hover"
        >
          See all {ranked.length} compatible models ({hiddenCount} more)
        </button>
      )}
      {showAll && ranked.length > DEFAULT_VISIBLE_COUNT && (
        <button
          onClick={() => setShowAll(false)}
          className="mt-3 text-sm text-brand-silver underline decoration-dotted hover:text-brand-gold-hover"
        >
          Show top {DEFAULT_VISIBLE_COUNT} only
        </button>
      )}

      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-brand-grey-text">
          Equipment selection notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          disabled={!canSelectEquipment}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </section>
  );
}
