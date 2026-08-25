"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  computeManualD,
  computeRequiredCfmForRooms,
  checkDuctInsulationCompliance,
  computeAvailableStaticPressure,
  estimateCoolingSupplyAirTempF,
  computeZoneFrictionRates,
  sizeDuctRun,
  type DuctRunInput,
  type DuctSizingResult,
  type DuctSizingTableRow,
} from "@/lib/manualD";
import {
  derivePageScale,
  computeRoutedBranchRun,
  getDuctRoutingGateStatus,
  buildLiveDuctRoutingIllustration,
  type ScaleSampleRoom,
} from "@/lib/ductRouting";
import { DuctRoutingDiagram } from "@/components/duct-routing-diagram";
import type { RoomLoadResult } from "@/lib/manualJ";
import type { RoomRow, ZoneRow } from "@/components/manual-j-workflow";
import type { DrawingRow } from "@/lib/drawingExtraction";

export type DuctRunRow = {
  id: string;
  project_id: string;
  zone_id: string | null;
  run_type: "trunk" | "branch";
  room_id: string | null;
  length_ft: number;
  fitting_equivalent_length_ft: number;
  duct_shape: "round" | "rectangular";
  target_height_in: number | null;
  material: "flex" | "sheet_metal" | "fiberboard";
  // Last-computed snapshot, written alongside the input fields whenever a
  // run is saved - used by reporting (Phase 7) so a schedule can be read
  // without recomputing. The UI itself never trusts this for display; it
  // always shows a fresh computeManualD() result from current inputs (same
  // "never persist Manual J's own results" pattern the rest of this app
  // already uses), so a stale snapshot from before some other room's load
  // changed never shows up as wrong on screen - only in an as-of-last-save
  // export.
  cfm: number;
  friction_rate: number;
  velocity_fpm: number;
  calculated_diameter_in: number | null;
  calculated_width_in: number | null;
  calculated_height_in: number | null;
};

export const DUCT_RUN_COLUMNS =
  "id, project_id, zone_id, run_type, room_id, length_ft, fitting_equivalent_length_ft, duct_shape, target_height_in, material, cfm, friction_rate, velocity_fpm, calculated_diameter_in, calculated_width_in, calculated_height_in";

const MATERIAL_OPTIONS = [
  { value: "flex", label: "Flex" },
  { value: "sheet_metal", label: "Sheet metal" },
  { value: "fiberboard", label: "Fiberboard" },
] as const;

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmt(value: number): string {
  return Math.round(value).toLocaleString();
}

function toDuctRunInput(run: DuctRunRow): DuctRunInput {
  return {
    id: run.id,
    zoneId: run.zone_id,
    runType: run.run_type,
    roomId: run.room_id,
    lengthFt: run.length_ft,
    fittingEquivalentLengthFt: run.fitting_equivalent_length_ft,
    ductShape: run.duct_shape,
    targetHeightIn: run.target_height_in,
  };
}

type RunFormValues = {
  run_type: "trunk" | "branch";
  room_id: string;
  zone_id: string;
  length_ft: string;
  fitting_equivalent_length_ft: string;
  duct_shape: "round" | "rectangular";
  target_height_in: string;
  material: "flex" | "sheet_metal" | "fiberboard";
};

const EMPTY_RUN_FORM: RunFormValues = {
  run_type: "branch",
  room_id: "",
  zone_id: "",
  length_ft: "",
  fitting_equivalent_length_ft: "0",
  duct_shape: "round",
  target_height_in: "",
  material: "flex",
};

export function DuctDesignSection({
  projectId,
  rooms,
  zones,
  drawings,
  roomResults,
  indoorCoolingDesignTempF,
  initialAvailableStaticPressureIwc,
  initialSupplyAirTempF,
  initialBlowerTespIwc,
  initialEvaporatorCoilLossIwc,
  initialAirFilterLossIwc,
  initialGrillesRegistersLossIwc,
  initialDuctRuns,
  ductSizingTable,
  ductInsulationCodeMinimums,
}: {
  projectId: string;
  rooms: RoomRow[];
  zones: ZoneRow[];
  drawings: DrawingRow[];
  roomResults: RoomLoadResult[];
  indoorCoolingDesignTempF: number;
  initialAvailableStaticPressureIwc: number | null;
  initialSupplyAirTempF: number | null;
  initialBlowerTespIwc: number | null;
  initialEvaporatorCoilLossIwc: number | null;
  initialAirFilterLossIwc: number | null;
  initialGrillesRegistersLossIwc: number | null;
  initialDuctRuns: DuctRunRow[];
  ductSizingTable: DuctSizingTableRow[];
  // Data Integrity Addendum, Section 3 - duct_location -> current code
  // minimum R-value, for the compliance badge below. Plain array (not the
  // Map lib/manualD.ts's checkDuctInsulationCompliance ultimately wants)
  // since props cross a server/client boundary that only survives plain
  // JSON-shaped values.
  ductInsulationCodeMinimums: { duct_location: string; min_r_value: number }[];
}) {
  const [staticPressureForm, setStaticPressureForm] = useState(
    initialAvailableStaticPressureIwc?.toString() ?? "",
  );
  const [supplyAirTempForm, setSupplyAirTempForm] = useState(
    initialSupplyAirTempF?.toString() ?? "",
  );
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // ACCA Manual D Available Static Pressure calculator - optional inputs
  // that derive staticPressureForm instead of the tech typing that number
  // in directly. See computeAvailableStaticPressure in lib/manualD.ts for
  // why TESP and device losses are kept as separate, sourced inputs
  // rather than one opaque number.
  const [tespForm, setTespForm] = useState(initialBlowerTespIwc?.toString() ?? "");
  const [evapCoilLossForm, setEvapCoilLossForm] = useState(
    initialEvaporatorCoilLossIwc?.toString() ?? "",
  );
  const [airFilterLossForm, setAirFilterLossForm] = useState(
    initialAirFilterLossIwc?.toString() ?? "",
  );
  const [grillesLossForm, setGrillesLossForm] = useState(
    initialGrillesRegistersLossIwc?.toString() ?? "",
  );

  const tespIwc = toNullableNumber(tespForm);
  const evapCoilLossIwc = toNullableNumber(evapCoilLossForm);
  const airFilterLossIwc = toNullableNumber(airFilterLossForm);
  const grillesLossIwc = toNullableNumber(grillesLossForm);

  const aspCalculatorResult = useMemo(() => {
    if (
      tespIwc == null ||
      evapCoilLossIwc == null ||
      airFilterLossIwc == null ||
      grillesLossIwc == null
    ) {
      return null;
    }
    return computeAvailableStaticPressure(tespIwc, {
      evaporatorCoilIwc: evapCoilLossIwc,
      airFilterIwc: airFilterLossIwc,
      grillesRegistersIwc: grillesLossIwc,
    });
  }, [tespIwc, evapCoilLossIwc, airFilterLossIwc, grillesLossIwc]);

  const estimatedCoolingSupplyAirTempF = estimateCoolingSupplyAirTempF(indoorCoolingDesignTempF);

  const [ductRuns, setDuctRuns] = useState<DuctRunRow[]>(initialDuctRuns);
  const [showAddForm, setShowAddForm] = useState(false);
  const [runForm, setRunForm] = useState<RunFormValues>(EMPTY_RUN_FORM);
  const [runError, setRunError] = useState<string | null>(null);
  const [runSaving, setRunSaving] = useState(false);

  const availableStaticPressureIwc = toNullableNumber(staticPressureForm);
  const supplyAirTempF = toNullableNumber(supplyAirTempForm);

  const requiredCfmByRoom = useMemo(
    () => computeRequiredCfmForRooms(roomResults, supplyAirTempF, indoorCoolingDesignTempF),
    [roomResults, supplyAirTempF, indoorCoolingDesignTempF],
  );

  const ductRunInputs: DuctRunInput[] = useMemo(
    () => ductRuns.map(toDuctRunInput),
    [ductRuns],
  );

  const results = useMemo(
    () =>
      computeManualD(ductRunInputs, requiredCfmByRoom, availableStaticPressureIwc, ductSizingTable),
    [ductRunInputs, requiredCfmByRoom, availableStaticPressureIwc, ductSizingTable],
  );
  const resultByRunId = useMemo(() => new Map(results.map((r) => [r.runId, r])), [results]);

  // Data Integrity Addendum, Section 3 - Manual D compliance check, purely
  // additive to the sizing results above (see lib/manualD.ts's
  // checkDuctInsulationCompliance comment for why this is kept separate
  // from computeManualD/sizeDuctRun rather than folded in).
  const roomsById = useMemo(
    () =>
      new Map(
        rooms.map((r) => [
          r.id,
          { duct_location: r.duct_location, duct_insulation_r_value: r.duct_insulation_r_value },
        ]),
      ),
    [rooms],
  );
  const codeMinimumsByLocation = useMemo(
    () => new Map(ductInsulationCodeMinimums.map((r) => [r.duct_location, r.min_r_value])),
    [ductInsulationCodeMinimums],
  );
  const complianceByRunId = useMemo(
    () => checkDuctInsulationCompliance(ductRunInputs, roomsById, codeMinimumsByLocation),
    [ductRunInputs, roomsById, codeMinimumsByLocation],
  );

  // Plenum sizing - a plenum is a short transition box sized by velocity
  // at the zone's total combined CFM, not by friction rate over a real
  // physical length the way a trunk/branch run is - so it's deliberately
  // NOT modeled as its own duct_runs row (which would need an arbitrary
  // length/fitting value to size against). Reuses sizeDuctRun directly
  // with a synthetic zero-length "trunk" input (lengthFt/
  // fittingEquivalentLengthFt aren't read by sizeDuctRun itself - see its
  // signature in lib/manualD.ts - only the already-resolved friction rate
  // and cfm matter), at each zone's own already-computed friction rate.
  const zoneFrictionRates = useMemo(
    () => computeZoneFrictionRates(ductRunInputs, availableStaticPressureIwc),
    [ductRunInputs, availableStaticPressureIwc],
  );
  const plenumByZone = useMemo(() => {
    const map = new Map<string, DuctSizingResult | null>();
    for (const zone of zones) {
      const zoneCfm = rooms
        .filter((r) => r.zone_id === zone.id)
        .reduce((sum, r) => sum + (requiredCfmByRoom.get(r.id) ?? 0), 0);
      const frictionRate = zoneFrictionRates.get(zone.id) ?? null;
      if (zoneCfm <= 0 || frictionRate == null || ductSizingTable.length === 0) {
        map.set(zone.id, null);
        continue;
      }
      map.set(
        zone.id,
        sizeDuctRun(
          {
            id: `plenum-${zone.id}`,
            zoneId: zone.id,
            runType: "trunk",
            roomId: null,
            lengthFt: 0,
            fittingEquivalentLengthFt: 0,
            ductShape: "round",
            targetHeightIn: null,
          },
          zoneCfm,
          frictionRate,
          ductSizingTable,
        ),
      );
    }
    return map;
  }, [zones, rooms, requiredCfmByRoom, zoneFrictionRates, ductSizingTable]);

  // Auto Manual D run-length feature (built 2026-08-25, real sourced ACCA
  // Manual D Appendix 3 data - see the project memory file
  // acca_manual_d_fitting_equivalent_lengths.md). Gate is separate from
  // lib/reportGate.ts's report-generation gate on purpose - pin
  // resolution only blocks THIS auto-length computation, never general
  // report generation, so a project can keep using manual run entry
  // regardless of whether this feature has been used.
  const ductRoutingGate = useMemo(
    () =>
      getDuctRoutingGateStatus(
        rooms.map((r) => ({
          id: r.id,
          name: r.name,
          zone_id: r.zone_id,
          floor_area_sqft: r.floor_area_sqft,
          position_x_norm: r.position_x_norm,
          position_y_norm: r.position_y_norm,
        })),
        zones.map((z) => ({
          id: z.id,
          name: z.name,
          ahu_position_x_norm: z.ahu_position_x_norm,
          ahu_position_y_norm: z.ahu_position_y_norm,
        })),
      ),
    [rooms, zones],
  );

  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoGenerateError, setAutoGenerateError] = useState<string | null>(null);
  const [autoGenerateNotice, setAutoGenerateNotice] = useState<string | null>(null);

  // For each zone with a resolved AHU pin, computes real Manhattan
  // run lengths (from lib/ductRouting.ts, using the real per-sheet scale
  // derived from rooms whose printed dimensions AND placed pins are both
  // known) for every room pinned on the SAME sheet as that zone's AHU,
  // and upserts one branch duct_runs row per room. Rooms pinned on a
  // DIFFERENT sheet than their zone's AHU (a different level) are
  // skipped, not guessed at - a 2D page distance across two different
  // sheets isn't a real measurement.
  //
  // TRUNK SIMPLIFICATION, disclosed not hidden: one trunk run per zone is
  // also created/updated, using the longest branch's routed length as a
  // conservative (never-under-sized) stand-in for the trunk's own real
  // backbone length, with fitting_equivalent_length_ft left at 0 - real
  // ACCA Group 9 (Supply Trunk Junction Fittings) values were not
  // sourced with the same visual-verification rigor as the branch
  // takeoff/elbow values this feature uses elsewhere, so this
  // deliberately does not invent one. A tech should review and, if
  // needed, add real trunk fitting length manually via the form below.
  async function handleAutoGenerateFromPins() {
    if (!ductRoutingGate.ready) return;
    setAutoGenerating(true);
    setAutoGenerateError(null);
    setAutoGenerateNotice(null);
    try {
      const supabase = createClient();
      const pageDimsCache = new Map<string, { pageWidthPt: number; pageHeightPt: number }>();
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const zone of zones) {
        if (
          zone.ahu_position_x_norm == null ||
          zone.ahu_position_y_norm == null ||
          !zone.ahu_position_source_drawing_id ||
          zone.ahu_position_source_page_number == null
        ) {
          continue;
        }
        const ahuDrawingId = zone.ahu_position_source_drawing_id;
        const ahuPageNumber = zone.ahu_position_source_page_number;

        const zoneRooms = rooms.filter(
          (r) =>
            r.zone_id === zone.id &&
            r.position_x_norm != null &&
            r.position_y_norm != null &&
            r.position_source_drawing_id === ahuDrawingId &&
            r.position_source_page_number === ahuPageNumber,
        );
        const skippedInZone = rooms.filter(
          (r) =>
            r.zone_id === zone.id &&
            r.position_x_norm != null &&
            (r.position_source_drawing_id !== ahuDrawingId || r.position_source_page_number !== ahuPageNumber),
        );
        skipped += skippedInZone.length;
        if (zoneRooms.length === 0) continue;

        const pageKey = `${ahuDrawingId}:${ahuPageNumber}`;
        let pageDims = pageDimsCache.get(pageKey);
        if (!pageDims) {
          const res = await fetch(`/api/drawings/${ahuDrawingId}/page-image?page=${ahuPageNumber}`);
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? "Failed to load page dimensions");
          if (body.pageWidthPt == null || body.pageHeightPt == null) {
            throw new Error(
              `Zone ${zone.name}: this drawing has no real page dimensions (not a PDF) - auto-length isn't available for image uploads.`,
            );
          }
          pageDims = { pageWidthPt: body.pageWidthPt, pageHeightPt: body.pageHeightPt };
          pageDimsCache.set(pageKey, pageDims);
        }

        const drawing = drawings.find((d) => d.id === ahuDrawingId);
        const extractedRooms = drawing?.extracted_data?.rooms ?? [];
        const sheets = drawing?.extracted_data?.sheets ?? [];
        const scaleSampleRooms: ScaleSampleRoom[] = extractedRooms
          .filter((er) => sheets.find((s) => s.name === er.source_sheet)?.page_number === ahuPageNumber)
          .map((er) => ({
            wallPageHorizontalLenFt: er.wall_page_horizontal_len_ft,
            wallPageVerticalLenFt: er.wall_page_vertical_len_ft,
            widthNorm: er.room_position?.width_norm ?? null,
            heightNorm: er.room_position?.height_norm ?? null,
          }));
        const scale = derivePageScale(scaleSampleRooms, pageDims.pageWidthPt, pageDims.pageHeightPt);
        if (scale.feetPerPagePoint == null) {
          setAutoGenerateError(
            (prev) =>
              prev ??
              `Zone ${zone.name}: couldn't derive a real-world scale for this sheet (no room has both a known printed dimension and a placed pin) - skipped.`,
          );
          continue;
        }
        const pageWidthFt = scale.feetPerPagePoint * pageDims.pageWidthPt;
        const pageHeightFt = scale.feetPerPagePoint * pageDims.pageHeightPt;
        const ahuPin = { xNorm: zone.ahu_position_x_norm, yNorm: zone.ahu_position_y_norm };
        let maxLengthFt = 0;

        for (const room of zoneRooms) {
          const roomPin = { xNorm: room.position_x_norm!, yNorm: room.position_y_norm! };
          const routed = computeRoutedBranchRun(ahuPin, roomPin, pageWidthFt, pageHeightFt);
          maxLengthFt = Math.max(maxLengthFt, routed.lengthFt);

          const existing = ductRuns.find((r) => r.run_type === "branch" && r.room_id === room.id);
          if (existing) {
            const { error } = await supabase
              .from("duct_runs")
              .update({ length_ft: routed.lengthFt, fitting_equivalent_length_ft: routed.fittingEquivalentLengthFt })
              .eq("id", existing.id);
            if (error) throw new Error(error.message);
            setDuctRuns((prev) =>
              prev.map((r) =>
                r.id === existing.id
                  ? { ...r, length_ft: routed.lengthFt, fitting_equivalent_length_ft: routed.fittingEquivalentLengthFt }
                  : r,
              ),
            );
            updated += 1;
          } else {
            const { data, error } = await supabase
              .from("duct_runs")
              .insert({
                project_id: projectId,
                run_type: "branch",
                room_id: room.id,
                zone_id: zone.id,
                length_ft: routed.lengthFt,
                fitting_equivalent_length_ft: routed.fittingEquivalentLengthFt,
                duct_shape: "round",
                target_height_in: null,
                material: "flex",
                cfm: 0,
                friction_rate: 0,
                velocity_fpm: 0,
                calculated_diameter_in: null,
                calculated_width_in: null,
                calculated_height_in: null,
              })
              .select(DUCT_RUN_COLUMNS)
              .single<DuctRunRow>();
            if (error || !data) throw new Error(error?.message ?? "Failed to create run");
            setDuctRuns((prev) => [...prev, data]);
            created += 1;
          }
        }

        const existingTrunk = ductRuns.find((r) => r.run_type === "trunk" && r.zone_id === zone.id);
        if (existingTrunk) {
          const { error } = await supabase
            .from("duct_runs")
            .update({ length_ft: maxLengthFt })
            .eq("id", existingTrunk.id);
          if (error) throw new Error(error.message);
          setDuctRuns((prev) => prev.map((r) => (r.id === existingTrunk.id ? { ...r, length_ft: maxLengthFt } : r)));
        } else {
          const { data, error } = await supabase
            .from("duct_runs")
            .insert({
              project_id: projectId,
              run_type: "trunk",
              room_id: null,
              zone_id: zone.id,
              length_ft: maxLengthFt,
              fitting_equivalent_length_ft: 0,
              duct_shape: "round",
              target_height_in: null,
              material: "sheet_metal",
              cfm: 0,
              friction_rate: 0,
              velocity_fpm: 0,
              calculated_diameter_in: null,
              calculated_width_in: null,
              calculated_height_in: null,
            })
            .select(DUCT_RUN_COLUMNS)
            .single<DuctRunRow>();
          if (error || !data) throw new Error(error?.message ?? "Failed to create trunk run");
          setDuctRuns((prev) => [...prev, data]);
        }
      }

      setAutoGenerateNotice(
        `Auto-generated ${created} new run(s), updated ${updated} existing run(s) from resolved pins.` +
          (skipped > 0 ? ` ${skipped} room(s) pinned on a different sheet than their zone's AHU were skipped.` : ""),
      );
    } catch (err) {
      setAutoGenerateError(
        err instanceof Error ? err.message : "Failed to auto-generate runs - check your connection and try again.",
      );
    } finally {
      setAutoGenerating(false);
    }
  }

  function roomName(roomId: string | null): string {
    if (!roomId) return "—";
    return rooms.find((r) => r.id === roomId)?.name ?? "Unknown room";
  }

  function zoneName(zoneId: string | null): string {
    if (!zoneId) return "Unassigned";
    return zones.find((z) => z.id === zoneId)?.name ?? "Unknown zone";
  }

  async function persistRunSnapshot(runId: string, supabase: ReturnType<typeof createClient>) {
    const result = resultByRunId.get(runId);
    if (!result) return;
    await supabase
      .from("duct_runs")
      .update({
        cfm: result.cfm,
        friction_rate: result.frictionRate,
        velocity_fpm: result.velocityFpm,
        calculated_diameter_in: result.diameterIn,
        calculated_width_in: result.widthIn,
        calculated_height_in: result.heightIn,
      })
      .eq("id", runId);
  }

  // Wrapped in try/catch, not just an `error`-on-result check - a genuine
  // network-level failure can reject the underlying fetch before
  // postgrest-js has a response to wrap, which surfaces as a thrown
  // exception rather than a resolved {error}. Uncaught inside an async
  // onClick handler, that's a silent, console-only unhandled rejection
  // with the saving flag stuck true - same failure shape already found
  // and fixed on the Zones page's add/rename/delete handlers.
  async function handleSaveSettings() {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("projects")
        .update({
          available_static_pressure_iwc: availableStaticPressureIwc,
          supply_air_temp_f: supplyAirTempF,
          blower_tesp_iwc: tespIwc,
          evaporator_coil_loss_iwc: evapCoilLossIwc,
          air_filter_loss_iwc: airFilterLossIwc,
          grilles_registers_loss_iwc: grillesLossIwc,
        })
        .eq("id", projectId);
      if (error) {
        setSettingsError(error.message);
        return;
      }
      // Every run's cfm/friction depends on these two settings - refresh
      // every stored snapshot, not just newly-added runs, so exported
      // reports never lag behind a static-pressure or supply-temp change.
      await Promise.all(ductRuns.map((run) => persistRunSnapshot(run.id, supabase)));
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : "Failed to save duct settings - check your connection and try again.",
      );
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleAddRun() {
    setRunSaving(true);
    setRunError(null);
    try {
      const supabase = createClient();

      const payload = {
        project_id: projectId,
        run_type: runForm.run_type,
        room_id: runForm.run_type === "branch" ? runForm.room_id || null : null,
        zone_id: runForm.zone_id || null,
        length_ft: toNullableNumber(runForm.length_ft) ?? 0,
        fitting_equivalent_length_ft: toNullableNumber(runForm.fitting_equivalent_length_ft) ?? 0,
        duct_shape: runForm.duct_shape,
        target_height_in:
          runForm.duct_shape === "rectangular" ? toNullableNumber(runForm.target_height_in) : null,
        material: runForm.material,
        // Placeholder - overwritten immediately below once the row (and
        // therefore its id) exists and computeManualD can size it for real.
        cfm: 0,
        friction_rate: 0,
        velocity_fpm: 0,
        calculated_diameter_in: null,
        calculated_width_in: null,
        calculated_height_in: null,
      };

      const { data, error } = await supabase
        .from("duct_runs")
        .insert(payload)
        .select(DUCT_RUN_COLUMNS)
        .single<DuctRunRow>();

      if (error || !data) {
        setRunError(error?.message ?? "Failed to create duct run.");
        return;
      }

      // Compute and persist the real snapshot immediately rather than
      // leaving the placeholder zeros in place until the next Settings
      // save - inline (not via the ductRuns/results state, which won't
      // include this row until the setDuctRuns below re-renders).
      const inputs = [...ductRuns, data].map(toDuctRunInput);
      const freshResults = computeManualD(
        inputs,
        requiredCfmByRoom,
        availableStaticPressureIwc,
        ductSizingTable,
      );
      const newResult = freshResults.find((r) => r.runId === data.id);
      let savedRow = data;
      if (newResult) {
        const { data: updated } = await supabase
          .from("duct_runs")
          .update({
            cfm: newResult.cfm,
            friction_rate: newResult.frictionRate,
            velocity_fpm: newResult.velocityFpm,
            calculated_diameter_in: newResult.diameterIn,
            calculated_width_in: newResult.widthIn,
            calculated_height_in: newResult.heightIn,
          })
          .eq("id", data.id)
          .select(DUCT_RUN_COLUMNS)
          .single<DuctRunRow>();
        if (updated) savedRow = updated;
      }

      setDuctRuns((prev) => [...prev, savedRow]);
      setShowAddForm(false);
      setRunForm(EMPTY_RUN_FORM);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Failed to create duct run - check your connection and try again.");
    } finally {
      setRunSaving(false);
    }
  }

  async function handleDeleteRun(id: string) {
    if (!window.confirm("Delete this duct run?")) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.from("duct_runs").delete().eq("id", id);
      if (error) {
        setRunError(error.message);
        return;
      }
      setDuctRuns((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Failed to delete duct run - check your connection and try again.");
    }
  }

  const readyToSize = availableStaticPressureIwc != null && supplyAirTempF != null;

  // The live, in-app version of the exact same schematic the PDF report
  // produces - built from the same resolved pin positions, the same
  // requiredCfmByRoom CFM (independent of static pressure - see the CFM
  // fallback comment on the table below), and resultByRunId when static-
  // pressure sizing has run. No PDF generation required to see it.
  const liveIllustrationSheets = useMemo(
    () => buildLiveDuctRoutingIllustration(rooms, zones, ductRuns, resultByRunId, requiredCfmByRoom),
    [rooms, zones, ductRuns, resultByRunId, requiredCfmByRoom],
  );

  return (
    <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
      <h2 className="mb-4 text-lg font-semibold text-brand-gold">Duct Design (Manual D)</h2>

      {/* Breaks out of the dashboard's max-w-3xl content column (the
          actual floor plan sheet is a real architectural E-size drawing
          full of fine dimension text - squeezed into a 768px column, the
          duct-size/CFM overlay becomes genuinely illegible, which is
          exactly what this fixes: a wider, still-centered box, not a
          smaller/simplified image). */}
      <div className="relative left-1/2 right-1/2 -mx-[50vw] mb-6 w-screen">
        <div className="mx-auto max-w-6xl rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-brand-grey-text">
            Duct Routing Diagram
          </p>
          <DuctRoutingDiagram sheets={liveIllustrationSheets} />
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-brand-grey-text">
          Auto-generate from Duct Routing Pins
        </p>
        {ductRoutingGate.ready ? (
          <button
            onClick={handleAutoGenerateFromPins}
            disabled={autoGenerating}
            className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
          >
            {autoGenerating ? "Computing real run lengths…" : "Auto-generate branch/trunk runs from pins"}
          </button>
        ) : (
          <p className="text-sm text-brand-grey-text">
            {ductRoutingGate.unresolvedRoomIds.length + ductRoutingGate.unresolvedZoneIds.length > 0
              ? `${ductRoutingGate.unresolvedRoomIds.length} room(s) and ${ductRoutingGate.unresolvedZoneIds.length} zone AHU(s) still need a resolved pin in the Duct Routing Pins section above before real run lengths can be computed.`
              : "Place and resolve pins in the Duct Routing Pins section above to auto-generate real run lengths."}
          </p>
        )}
        {autoGenerateNotice && <p className="mt-2 text-sm text-brand-success">{autoGenerateNotice}</p>}
        {autoGenerateError && (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {autoGenerateError}
          </p>
        )}
        <p className="mt-3 text-xs text-brand-grey-text">
          Lengths come from the real routed (Manhattan) distance between each room&apos;s pin and its zone&apos;s
          AHU pin on the actual drawing, using that sheet&apos;s own real scale. Fitting lengths use ACCA Manual
          D Appendix 3 reference values (a full-radius branch takeoff, plus one elbow per turn). Trunk length
          uses the longest branch as a conservative stand-in for the trunk&apos;s own backbone length - review
          and adjust below if you know the real distance.
        </p>
      </div>

      {zones.some((z) => plenumByZone.get(z.id)) && (
        <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-brand-grey-text">
            Plenum sizing (by zone total CFM, not a duct run)
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {zones.map((zone) => {
              const plenum = plenumByZone.get(zone.id);
              if (!plenum) return null;
              return (
                <div key={zone.id} className="text-sm text-brand-silver-highlight">
                  <span className="text-brand-grey-text">{zone.name}: </span>
                  {plenum.diameterIn ? `${plenum.diameterIn}" round` : "—"} at {fmt(plenum.cfm)} CFM,{" "}
                  {Math.round(plenum.velocityFpm)} fpm
                  {plenum.velocityWarning && <span className="text-amber-400"> — {plenum.velocityWarning}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-brand-grey-text">
          Available Static Pressure calculator (optional)
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField label="Blower TESP (in.wc)" value={tespForm} onChange={setTespForm} />
          <NumberField
            label="Evaporator coil loss (in.wc)"
            value={evapCoilLossForm}
            onChange={setEvapCoilLossForm}
          />
          <NumberField
            label="Air filter loss (in.wc)"
            value={airFilterLossForm}
            onChange={setAirFilterLossForm}
          />
          <NumberField
            label="Grilles/registers loss (in.wc)"
            value={grillesLossForm}
            onChange={setGrillesLossForm}
          />
        </div>
        {aspCalculatorResult && (
          <div className="mt-3 flex items-center gap-3">
            {aspCalculatorResult.error ? (
              <span className="text-sm text-red-400" role="alert">
                {aspCalculatorResult.error}
              </span>
            ) : (
              <>
                <span className="text-sm text-brand-silver-highlight">
                  ASP = {aspCalculatorResult.availableStaticPressureIwc?.toFixed(3)}&quot; w.c.
                </span>
                <button
                  onClick={() =>
                    setStaticPressureForm(
                      aspCalculatorResult.availableStaticPressureIwc?.toString() ?? "",
                    )
                  }
                  className="rounded-md border border-brand-gold/50 px-3 py-1 text-xs font-semibold text-brand-gold transition hover:border-brand-gold"
                >
                  Apply to Available Static Pressure
                </button>
              </>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-brand-grey-text">
          TESP must come from the selected equipment&apos;s own OEM blower/installation
          data at design CFM, and device losses are per-installation - none of these are
          filled automatically.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-grey-text">
            Available static pressure (in.wc)
          </label>
          <input
            type="number"
            step="any"
            value={staticPressureForm}
            onChange={(e) => setStaticPressureForm(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-grey-text">
            Supply air temperature (°F)
          </label>
          <input
            type="number"
            step="any"
            value={supplyAirTempForm}
            onChange={(e) => setSupplyAirTempForm(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
          />
          <button
            onClick={() => setSupplyAirTempForm(estimatedCoolingSupplyAirTempF.toString())}
            className="mt-1 text-xs text-brand-gold underline decoration-dotted underline-offset-2 hover:text-brand-gold-hover"
          >
            Estimate ({estimatedCoolingSupplyAirTempF}°F, ACCA 20°F cooling split - supersede
            with OEM leaving air temp once known)
          </button>
        </div>
      </div>
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={handleSaveSettings}
          disabled={settingsSaving}
          className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
        >
          {settingsSaving ? "Saving…" : "Save Duct Design Settings"}
        </button>
        {settingsError && (
          <span className="text-sm text-red-400" role="alert">
            {settingsError}
          </span>
        )}
      </div>

      {!readyToSize && (
        <p className="mb-4 rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-3 text-sm text-brand-grey-text">
          Supply air temperature is set, so required CFM is already shown below. Enter and save
          available static pressure above too to also compute friction rate, duct size, and
          velocity - those three columns need it, CFM does not.
        </p>
      )}

      <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-brand-silver-highlight">Duct Runs</h3>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover"
              >
                Add Duct Run
              </button>
            )}
          </div>

          {runError && (
            <p className="mb-4 text-sm text-red-400" role="alert">
              {runError}
            </p>
          )}

          {showAddForm && (
            <div className="mb-4 space-y-3 rounded-lg border border-brand-gold/50 bg-zinc-900 p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <SelectField
                  label="Run type"
                  value={runForm.run_type}
                  onChange={(v) =>
                    setRunForm((prev) => ({ ...prev, run_type: v as "trunk" | "branch" }))
                  }
                  options={[
                    { value: "branch", label: "Branch" },
                    { value: "trunk", label: "Trunk" },
                  ]}
                />
                <SelectField
                  label="Zone"
                  value={runForm.zone_id}
                  onChange={(v) => setRunForm((prev) => ({ ...prev, zone_id: v }))}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...zones.map((z) => ({ value: z.id, label: z.name })),
                  ]}
                />
                {runForm.run_type === "branch" && (
                  <SelectField
                    label="Room"
                    value={runForm.room_id}
                    onChange={(v) => setRunForm((prev) => ({ ...prev, room_id: v }))}
                    options={[
                      { value: "", label: "— Select room —" },
                      ...rooms
                        .filter((r) => r.is_conditioned)
                        .map((r) => ({ value: r.id, label: r.name })),
                    ]}
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumberField
                  label="Length (ft)"
                  value={runForm.length_ft}
                  onChange={(v) => setRunForm((prev) => ({ ...prev, length_ft: v }))}
                />
                <NumberField
                  label="Fitting equiv. length (ft)"
                  value={runForm.fitting_equivalent_length_ft}
                  onChange={(v) =>
                    setRunForm((prev) => ({ ...prev, fitting_equivalent_length_ft: v }))
                  }
                />
                <SelectField
                  label="Shape"
                  value={runForm.duct_shape}
                  onChange={(v) =>
                    setRunForm((prev) => ({ ...prev, duct_shape: v as "round" | "rectangular" }))
                  }
                  options={[
                    { value: "round", label: "Round" },
                    { value: "rectangular", label: "Rectangular" },
                  ]}
                />
                {runForm.duct_shape === "rectangular" && (
                  <NumberField
                    label="Target height (in)"
                    value={runForm.target_height_in}
                    onChange={(v) => setRunForm((prev) => ({ ...prev, target_height_in: v }))}
                  />
                )}
                <SelectField
                  label="Material"
                  value={runForm.material}
                  onChange={(v) =>
                    setRunForm((prev) => ({
                      ...prev,
                      material: v as "flex" | "sheet_metal" | "fiberboard",
                    }))
                  }
                  options={MATERIAL_OPTIONS as unknown as { value: string; label: string }[]}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleAddRun}
                  disabled={
                    runSaving ||
                    (runForm.run_type === "branch" && runForm.room_id === "") ||
                    toNullableNumber(runForm.length_ft) == null
                  }
                  className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
                >
                  {runSaving ? "Saving…" : "Save Run"}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setRunForm(EMPTY_RUN_FORM);
                  }}
                  className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-brand-silver transition hover:border-brand-gold-hover"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {ductRuns.length === 0 && !showAddForm ? (
            <p className="rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-6 text-center text-sm text-brand-grey-text">
              No duct runs yet. Add trunk and branch runs to generate a duct schedule.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-gold/50 text-left text-xs uppercase tracking-wide text-brand-grey-text">
                    <th className="py-2 pr-4">Run</th>
                    <th className="py-2 pr-4">Zone</th>
                    <th className="py-2 pr-4 text-right">CFM</th>
                    <th className="py-2 pr-4 text-right">Friction rate</th>
                    <th className="py-2 pr-4 text-right">Size</th>
                    <th className="py-2 pr-4 text-right">Velocity</th>
                    <th className="py-2 pr-4">Insulation</th>
                    <th className="py-2 pr-4">Material</th>
                    <th className="py-2 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {ductRuns.map((run) => {
                    const result = resultByRunId.get(run.id);
                    // CFM only needs the room's real sensible cooling load
                    // + supply air temp (computeRequiredCfmForRooms) - it
                    // does NOT need available static pressure the way
                    // friction rate/size/velocity do. Falling back to the
                    // already-computed requiredCfmByRoom here (same
                    // decoupling already shipped for the report
                    // illustration, lib/reportData.ts's
                    // buildDuctRoutingIllustrations) means a project like
                    // Schneider - real supply air temp set, TESP/static
                    // pressure genuinely still unknown - shows real CFM
                    // instead of a blank table.
                    // Trunk runs have no single room_id - fall back to
                    // that zone's summed room CFM (same real inputs,
                    // just aggregated) instead of leaving it blank.
                    const fallbackCfm =
                      run.room_id != null
                        ? requiredCfmByRoom.get(run.room_id)
                        : rooms
                            .filter((r) => r.zone_id === run.zone_id)
                            .reduce((sum, r) => sum + (requiredCfmByRoom.get(r.id) ?? 0), 0) || null;
                    const displayCfm = result?.cfm ?? fallbackCfm;
                    return (
                      <tr key={run.id} className="border-b border-zinc-900">
                        <td className="py-2 pr-4 text-brand-silver-highlight">
                          {run.run_type === "trunk" ? "Trunk" : `Branch — ${roomName(run.room_id)}`}
                        </td>
                        <td className="py-2 pr-4 text-brand-silver">{zoneName(run.zone_id)}</td>
                        <td className="py-2 pr-4 text-right text-brand-silver">
                          {displayCfm != null ? fmt(displayCfm) : "—"}
                        </td>
                        <td className="py-2 pr-4 text-right text-brand-silver">
                          {result ? result.frictionRate.toFixed(2) : "—"}
                        </td>
                        <td className="py-2 pr-4 text-right text-brand-silver">
                          {result
                            ? result.ductShape === "round"
                              ? `${result.diameterIn}" round`
                              : `${result.widthIn?.toFixed(1)}" x ${result.heightIn}" rect`
                            : "—"}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <span
                            className={
                              result?.velocityWarning ? "text-red-400" : "text-brand-silver"
                            }
                          >
                            {result ? `${fmt(result.velocityFpm)} fpm` : "—"}
                          </span>
                          {result?.velocityWarning && (
                            <span
                              className="ml-2 rounded-full border border-red-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-400"
                              title={result.velocityWarning}
                            >
                              Over limit
                            </span>
                          )}
                          {result?.exceedsTableRange && (
                            <span
                              className="ml-2 rounded-full border border-brand-gold-base bg-brand-gold-base/25 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-gold-hover"
                              title="Required CFM exceeds the largest duct size in the reference table at this friction rate"
                            >
                              Oversized load
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-brand-silver">
                          {(() => {
                            const compliance = complianceByRunId.get(run.id);
                            if (!compliance || compliance.actualRValue == null) return "—";
                            return (
                              <>
                                {`R-${compliance.actualRValue}`}
                                {compliance.belowCodeMinimum && (
                                  <span
                                    className="ml-2 rounded-full border border-red-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-400"
                                    title={`Below the current${compliance.minRValue != null ? ` R-${compliance.minRValue}` : ""} code minimum for this duct's location`}
                                  >
                                    Below code min
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </td>
                        <td className="py-2 pr-4 text-brand-silver">
                          {MATERIAL_OPTIONS.find((m) => m.value === run.material)?.label}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <button
                            onClick={() => handleDeleteRun(run.id)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-brand-grey-text">{label}</label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-brand-grey-text">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
