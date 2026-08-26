"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveRoomPositionSource } from "@/lib/ductRouting";
import type { DrawingRow } from "@/lib/drawingExtraction";
import type { RoomRow, ZoneRow } from "@/components/manual-j-workflow";

// Pin-placement canvas for the auto Manual D run-length feature. A tech
// confirms or drags a pin for each conditioned room (AI-suggested first
// draft when the extraction found one, see lib/ductRouting.ts's
// resolveRoomPositionSource) and one pin per zone's AHU/mechanical
// equipment (always placed from scratch - see lib/ductRouting.ts's
// module comment for why). Moving a pin away from its AI-suggested
// starting point requires a reason, mirroring the existing Accept/
// Override pattern FieldResolutionBadge already uses everywhere else in
// this app (lib/fieldResolutions.ts) - reused directly here (same table,
// same resolution_type/override_reason shape) rather than inventing a
// second audit mechanism.

type SheetOption = { drawingId: string; pageNumber: number; label: string };

type PinKind = "room" | "zone" | "return";

type PinState = {
  key: string;
  kind: PinKind;
  id: string;
  label: string;
  drawingId: string;
  pageNumber: number;
  xNorm: number;
  yNorm: number;
  startXNorm: number;
  startYNorm: number;
  resolved: boolean;
  hasAiSuggestion: boolean;
};

export function DuctRoutingCanvas({
  projectId,
  rooms,
  zones,
  drawings,
  onRoomPositionSaved,
  onZonePositionSaved,
  onReturnPositionSaved,
}: {
  projectId: string;
  rooms: RoomRow[];
  zones: ZoneRow[];
  drawings: DrawingRow[];
  onRoomPositionSaved: (
    roomId: string,
    update: {
      position_x_norm: number;
      position_y_norm: number;
      position_source_drawing_id: string;
      position_source_page_number: number;
    },
  ) => void;
  onZonePositionSaved: (
    zoneId: string,
    update: {
      ahu_position_x_norm: number;
      ahu_position_y_norm: number;
      ahu_position_source_drawing_id: string;
      ahu_position_source_page_number: number;
    },
  ) => void;
  onReturnPositionSaved: (
    zoneId: string,
    update: {
      return_position_x_norm: number;
      return_position_y_norm: number;
      return_position_source_drawing_id: string;
      return_position_source_page_number: number;
    },
  ) => void;
}) {
  const relevantRooms = useMemo(
    () => rooms.filter((r) => r.zone_id != null && r.floor_area_sqft != null && r.floor_area_sqft > 0),
    [rooms],
  );
  const relevantZoneIds = useMemo(
    () => new Set(relevantRooms.map((r) => r.zone_id)),
    [relevantRooms],
  );
  const relevantZones = useMemo(() => zones.filter((z) => relevantZoneIds.has(z.id)), [zones, relevantZoneIds]);

  const sheetOptions = useMemo<SheetOption[]>(() => {
    const options: SheetOption[] = [];
    for (const drawing of drawings) {
      const sheets = drawing.extracted_data?.sheets ?? [];
      const extractedRooms = drawing.extracted_data?.rooms ?? [];
      // Only sheets that actually have a room's real geometry on them -
      // a floor plan, in other words. A 16-sheet construction set also
      // has a cover sheet, foundation plan, elevations, roof framing,
      // electrical plans, etc. - none of those are where a duct-routing
      // pin belongs, and listing all 16 in this dropdown just makes the
      // real floor-plan sheets harder to find.
      const sheetNamesWithRooms = new Set(extractedRooms.map((r) => r.source_sheet).filter((s): s is string => s != null));
      for (const sheet of sheets) {
        if (sheet.page_number == null) continue;
        if (!sheetNamesWithRooms.has(sheet.name)) continue;
        options.push({
          drawingId: drawing.id,
          pageNumber: sheet.page_number,
          label: `${drawing.file_name} — ${sheet.name} (p.${sheet.page_number})`,
        });
      }
      // Single-page image upload with no extracted sheet inventory at all
      // (extraction predates this feature, or is still pending) still
      // needs to be selectable so a tech can place pins on it manually -
      // there's no sheet-name filter to apply since there's no sheet
      // inventory to filter against.
      if (sheets.length === 0 && drawing.file_type === "image") {
        options.push({ drawingId: drawing.id, pageNumber: 1, label: `${drawing.file_name} (image)` });
      }
    }
    return options;
  }, [drawings]);

  // AI-suggested (or already-resolved) drawing/page per room - used both
  // to pick a sensible default selected sheet and to know which pins
  // belong on whichever sheet is currently shown.
  const roomAssignments = useMemo(() => {
    const map = new Map<
      string,
      { drawingId: string; pageNumber: number; xNorm: number; yNorm: number; resolved: boolean; hasAiSuggestion: boolean }
    >();
    for (const room of relevantRooms) {
      if (room.position_x_norm != null && room.position_y_norm != null && room.position_source_drawing_id && room.position_source_page_number != null) {
        map.set(room.id, {
          drawingId: room.position_source_drawing_id,
          pageNumber: room.position_source_page_number,
          xNorm: room.position_x_norm,
          yNorm: room.position_y_norm,
          resolved: true,
          hasAiSuggestion: true,
        });
        continue;
      }
      const source = resolveRoomPositionSource(room.name, drawings);
      if (source && source.position.x_norm != null && source.position.y_norm != null) {
        map.set(room.id, {
          drawingId: source.drawingId,
          pageNumber: source.pageNumber,
          xNorm: source.position.x_norm,
          yNorm: source.position.y_norm,
          resolved: false,
          hasAiSuggestion: true,
        });
      }
    }
    return map;
  }, [relevantRooms, drawings]);

  const [selectedSheet, setSelectedSheet] = useState<SheetOption | null>(null);

  useEffect(() => {
    if (selectedSheet || sheetOptions.length === 0) return;
    // Default to the report's marked floor plan page when one exists and
    // is in the option list; otherwise whichever sheet the most rooms are
    // already assigned to (most useful first view); otherwise the first
    // option.
    const floorPlanDrawing = drawings.find((d) => d.floor_plan_page_number != null);
    const floorPlanOption = floorPlanDrawing
      ? sheetOptions.find(
          (o) => o.drawingId === floorPlanDrawing.id && o.pageNumber === floorPlanDrawing.floor_plan_page_number,
        )
      : null;
    if (floorPlanOption) {
      setSelectedSheet(floorPlanOption);
      return;
    }
    const counts = new Map<string, number>();
    for (const assignment of roomAssignments.values()) {
      const k = `${assignment.drawingId}:${assignment.pageNumber}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let best: SheetOption = sheetOptions[0];
    let bestCount = -1;
    for (const option of sheetOptions) {
      const c = counts.get(`${option.drawingId}:${option.pageNumber}`) ?? 0;
      if (c > bestCount) {
        best = option;
        bestCount = c;
      }
    }
    setSelectedSheet(best);
  }, [selectedSheet, sheetOptions, drawings, roomAssignments]);

  const [pins, setPins] = useState<PinState[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imageState, setImageState] = useState<{ dataUri: string | null; loading: boolean; error: string | null }>({
    dataUri: null,
    loading: false,
    error: null,
  });

  // Rebuild the pin list whenever the selected sheet or underlying
  // room/zone data changes. Pins with no assignment to ANY sheet yet
  // (nothing AI-suggested, never resolved) simply don't appear until the
  // tech explicitly places one on the currently-viewed sheet (see
  // handlePlaceOnCurrentSheet below) - they show in the sidebar list as
  // "needs placement" instead.
  useEffect(() => {
    if (!selectedSheet) {
      setPins([]);
      return;
    }
    const next: PinState[] = [];
    for (const room of relevantRooms) {
      const assignment = roomAssignments.get(room.id);
      if (!assignment) continue;
      if (assignment.drawingId !== selectedSheet.drawingId || assignment.pageNumber !== selectedSheet.pageNumber) continue;
      next.push({
        key: `room:${room.id}`,
        kind: "room",
        id: room.id,
        label: room.name,
        drawingId: assignment.drawingId,
        pageNumber: assignment.pageNumber,
        xNorm: assignment.xNorm,
        yNorm: assignment.yNorm,
        startXNorm: assignment.xNorm,
        startYNorm: assignment.yNorm,
        resolved: assignment.resolved,
        hasAiSuggestion: assignment.hasAiSuggestion,
      });
    }
    for (const zone of relevantZones) {
      const resolved =
        zone.ahu_position_x_norm != null &&
        zone.ahu_position_y_norm != null &&
        zone.ahu_position_source_drawing_id === selectedSheet.drawingId &&
        zone.ahu_position_source_page_number === selectedSheet.pageNumber;
      if (!resolved) continue;
      next.push({
        key: `zone:${zone.id}`,
        kind: "zone",
        id: zone.id,
        label: `${zone.name} (AHU)`,
        drawingId: selectedSheet.drawingId,
        pageNumber: selectedSheet.pageNumber,
        xNorm: zone.ahu_position_x_norm!,
        yNorm: zone.ahu_position_y_norm!,
        startXNorm: zone.ahu_position_x_norm!,
        startYNorm: zone.ahu_position_y_norm!,
        resolved: true,
        hasAiSuggestion: false,
      });
    }
    // Return-air plenum position - a real, independently-placed pin per
    // zone, same required workflow as the AHU pin above (never assumed
    // to be co-located with it - see the migration's own comment).
    for (const zone of relevantZones) {
      const resolved =
        zone.return_position_x_norm != null &&
        zone.return_position_y_norm != null &&
        zone.return_position_source_drawing_id === selectedSheet.drawingId &&
        zone.return_position_source_page_number === selectedSheet.pageNumber;
      if (!resolved) continue;
      next.push({
        key: `return:${zone.id}`,
        kind: "return",
        id: zone.id,
        label: `${zone.name} (Return)`,
        drawingId: selectedSheet.drawingId,
        pageNumber: selectedSheet.pageNumber,
        xNorm: zone.return_position_x_norm!,
        yNorm: zone.return_position_y_norm!,
        startXNorm: zone.return_position_x_norm!,
        startYNorm: zone.return_position_y_norm!,
        resolved: true,
        hasAiSuggestion: false,
      });
    }
    setPins(next);
  }, [selectedSheet, relevantRooms, relevantZones, roomAssignments]);

  useEffect(() => {
    if (!selectedSheet) return;
    let cancelled = false;
    setImageState({ dataUri: null, loading: true, error: null });
    fetch(`/api/drawings/${selectedSheet.drawingId}/page-image?page=${selectedSheet.pageNumber}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load page image");
        return body as { dataUri: string };
      })
      .then((body) => {
        if (!cancelled) setImageState({ dataUri: body.dataUri, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setImageState({
            dataUri: null,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load page image",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSheet]);

  const imageContainerRef = useRef<HTMLDivElement>(null);
  const draggingKeyRef = useRef<string | null>(null);

  const handlePointerDown = useCallback((key: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    draggingKeyRef.current = key;
    setActiveKey(key);
    setSaveError(null);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const key = draggingKeyRef.current;
    if (!key || !imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const xNorm = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const yNorm = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setPins((prev) => prev.map((p) => (p.key === key ? { ...p, xNorm, yNorm } : p)));
  }, []);

  const handlePointerUp = useCallback(() => {
    draggingKeyRef.current = null;
  }, []);

  function handlePlaceOnCurrentSheet(kind: PinKind, id: string, label: string) {
    if (!selectedSheet) return;
    const key = `${kind}:${id}`;
    setPins((prev) => [
      ...prev.filter((p) => p.key !== key),
      {
        key,
        kind,
        id,
        label,
        drawingId: selectedSheet.drawingId,
        pageNumber: selectedSheet.pageNumber,
        xNorm: 0.5,
        yNorm: 0.5,
        startXNorm: 0.5,
        startYNorm: 0.5,
        resolved: false,
        hasAiSuggestion: false,
      },
    ]);
    setActiveKey(key);
  }

  const activePin = pins.find((p) => p.key === activeKey) ?? null;
  const activeMoved = activePin
    ? Math.abs(activePin.xNorm - activePin.startXNorm) > 0.001 || Math.abs(activePin.yNorm - activePin.startYNorm) > 0.001
    : false;

  async function handleSave(pin: PinState, resolutionType: "accepted" | "overridden") {
    if (resolutionType === "overridden" && reasonDraft.trim() === "") {
      setSaveError("A reason is required when moving a pin.");
      return;
    }
    setSavingKey(pin.key);
    setSaveError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setSaveError("You must be signed in.");
        return;
      }

      const finalValue = JSON.stringify({ x_norm: pin.xNorm, y_norm: pin.yNorm });
      const aiValue = pin.hasAiSuggestion ? JSON.stringify({ x_norm: pin.startXNorm, y_norm: pin.startYNorm }) : null;

      if (pin.kind === "room") {
        const { error: updateError } = await supabase
          .from("rooms")
          .update({
            position_x_norm: pin.xNorm,
            position_y_norm: pin.yNorm,
            position_source_drawing_id: pin.drawingId,
            position_source_page_number: pin.pageNumber,
          })
          .eq("id", pin.id);
        if (updateError) {
          setSaveError(updateError.message);
          return;
        }
        const { error: resolutionError } = await supabase.from("field_resolutions").insert({
          project_id: projectId,
          table_name: "rooms",
          record_id: pin.id,
          field_name: "position",
          ai_extracted_value: aiValue,
          final_value: finalValue,
          resolution_type: resolutionType,
          override_reason: resolutionType === "overridden" ? reasonDraft.trim() : null,
          resolved_by: user.id,
        });
        if (resolutionError) {
          setSaveError(resolutionError.message);
          return;
        }
        onRoomPositionSaved(pin.id, {
          position_x_norm: pin.xNorm,
          position_y_norm: pin.yNorm,
          position_source_drawing_id: pin.drawingId,
          position_source_page_number: pin.pageNumber,
        });
      } else if (pin.kind === "zone") {
        const { error: updateError } = await supabase
          .from("zones")
          .update({
            ahu_position_x_norm: pin.xNorm,
            ahu_position_y_norm: pin.yNorm,
            ahu_position_source_drawing_id: pin.drawingId,
            ahu_position_source_page_number: pin.pageNumber,
          })
          .eq("id", pin.id);
        if (updateError) {
          setSaveError(updateError.message);
          return;
        }
        const { error: resolutionError } = await supabase.from("field_resolutions").insert({
          project_id: projectId,
          table_name: "zones",
          record_id: pin.id,
          field_name: "ahu_position",
          ai_extracted_value: null,
          final_value: finalValue,
          resolution_type: "accepted",
          override_reason: null,
          resolved_by: user.id,
        });
        if (resolutionError) {
          setSaveError(resolutionError.message);
          return;
        }
        onZonePositionSaved(pin.id, {
          ahu_position_x_norm: pin.xNorm,
          ahu_position_y_norm: pin.yNorm,
          ahu_position_source_drawing_id: pin.drawingId,
          ahu_position_source_page_number: pin.pageNumber,
        });
      } else {
        const { error: updateError } = await supabase
          .from("zones")
          .update({
            return_position_x_norm: pin.xNorm,
            return_position_y_norm: pin.yNorm,
            return_position_source_drawing_id: pin.drawingId,
            return_position_source_page_number: pin.pageNumber,
          })
          .eq("id", pin.id);
        if (updateError) {
          setSaveError(updateError.message);
          return;
        }
        const { error: resolutionError } = await supabase.from("field_resolutions").insert({
          project_id: projectId,
          table_name: "zones",
          record_id: pin.id,
          field_name: "return_position",
          ai_extracted_value: null,
          final_value: finalValue,
          resolution_type: "accepted",
          override_reason: null,
          resolved_by: user.id,
        });
        if (resolutionError) {
          setSaveError(resolutionError.message);
          return;
        }
        onReturnPositionSaved(pin.id, {
          return_position_x_norm: pin.xNorm,
          return_position_y_norm: pin.yNorm,
          return_position_source_drawing_id: pin.drawingId,
          return_position_source_page_number: pin.pageNumber,
        });
      }
      setPins((prev) =>
        prev.map((p) => (p.key === pin.key ? { ...p, resolved: true, startXNorm: p.xNorm, startYNorm: p.yNorm } : p)),
      );
      setReasonDraft("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save position - check your connection and try again.");
    } finally {
      setSavingKey(null);
    }
  }

  const unplacedRooms = relevantRooms.filter((r) => !pins.some((p) => p.kind === "room" && p.id === r.id) && !roomAssignments.get(r.id));
  const unplacedOnOtherSheet = relevantRooms.filter((r) => {
    const assignment = roomAssignments.get(r.id);
    if (!assignment || !selectedSheet) return false;
    return assignment.drawingId !== selectedSheet.drawingId || assignment.pageNumber !== selectedSheet.pageNumber;
  });
  const unplacedZones = relevantZones.filter((z) => !pins.some((p) => p.kind === "zone" && p.id === z.id));
  const unplacedReturns = relevantZones.filter((z) => !pins.some((p) => p.kind === "return" && p.id === z.id));

  if (sheetOptions.length === 0) {
    return (
      <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
        <h2 className="mb-2 text-lg font-semibold text-brand-gold">Duct Routing Pins</h2>
        <p className="text-sm text-brand-grey-text">
          No drawing with a known page has been extracted yet. Upload and extract a floor plan drawing first
          (page numbers are read during extraction) before placing duct-routing pins.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
      <h2 className="mb-1 text-lg font-semibold text-brand-gold">Duct Routing Pins</h2>
      <p className="mb-4 text-sm text-brand-grey-text">
        Confirm or drag each room&apos;s pin, and place one AHU pin per zone. Moving a pin away from its
        AI-suggested spot requires a short reason. Once every relevant room and zone has a resolved pin, real
        run lengths can be computed from the actual routed distance on this drawing.
      </p>

      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-brand-grey-text">Sheet</label>
        <select
          value={selectedSheet ? `${selectedSheet.drawingId}:${selectedSheet.pageNumber}` : ""}
          onChange={(e) => {
            const [drawingId, pageNumber] = e.target.value.split(":");
            const option = sheetOptions.find((o) => o.drawingId === drawingId && o.pageNumber === Number(pageNumber));
            setSelectedSheet(option ?? null);
            setActiveKey(null);
          }}
          className="w-full max-w-xl rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
        >
          {sheetOptions.map((o) => (
            <option key={`${o.drawingId}:${o.pageNumber}`} value={`${o.drawingId}:${o.pageNumber}`}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div>
          {imageState.loading && <p className="text-sm text-brand-grey-text">Rendering page…</p>}
          {imageState.error && (
            <p className="text-sm text-red-400" role="alert">
              {imageState.error}
            </p>
          )}
          {imageState.dataUri && (
            <div
              ref={imageContainerRef}
              className="relative inline-block select-none"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageState.dataUri} alt="Floor plan sheet" className="block max-w-full border border-brand-gold/50" draggable={false} />
              {/* Small precise crosshair/dot markers, not pill-shaped name
                  bubbles - a pin needs to show exactly where its own
                  center sits on the real drawing, which a large label
                  badge obscures. Identification comes from the native
                  hover tooltip (title=) plus a small floating label that
                  only appears for the currently-active pin, not all of
                  them at once. */}
              {pins.map((pin) => {
                const isActive = pin.key === activeKey;
                const color = isActive
                  ? "#d4a94a" // brand gold
                  : pin.resolved
                    ? "#3ba55c" // brand success
                    : pin.hasAiSuggestion
                      ? "#38bdf8" // sky-400
                      : "#d4d4d8"; // zinc-300
                const size = isActive ? 20 : 13;
                return (
                  <button
                    key={pin.key}
                    type="button"
                    onPointerDown={handlePointerDown(pin.key)}
                    onClick={() => setActiveKey(pin.key)}
                    title={pin.label}
                    style={{ left: `${pin.xNorm * 100}%`, top: `${pin.yNorm * 100}%` }}
                    className="absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
                  >
                    <svg width={size} height={size} viewBox="0 0 14 14" className="block drop-shadow">
                      {pin.kind === "return" ? (
                        // Square, not circle - a distinct shape from every
                        // supply-side pin (room register, AHU), matching
                        // the routed diagram's own return-plenum symbol.
                        <rect x={2} y={2} width={10} height={10} fill={color} fillOpacity={0.28} stroke={color} strokeWidth={1.6} />
                      ) : (
                        <circle cx={7} cy={7} r={5} fill={color} fillOpacity={0.28} stroke={color} strokeWidth={1.6} />
                      )}
                      <line x1={7} y1={1.5} x2={7} y2={12.5} stroke={color} strokeWidth={1.3} />
                      <line x1={1.5} y1={7} x2={12.5} y2={7} stroke={color} strokeWidth={1.3} />
                    </svg>
                    {isActive && (
                      <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/85 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
                        {pin.kind === "zone" ? "AHU" : pin.label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {activePin && (
            <div className="rounded-md border border-brand-gold/50 bg-zinc-900 p-3">
              <p className="mb-2 text-sm font-semibold text-brand-silver-highlight">{activePin.label}</p>
              {activeMoved ? (
                <>
                  <label className="mb-1 block text-xs font-medium text-brand-grey-text">
                    Reason for moving this pin
                  </label>
                  <textarea
                    value={reasonDraft}
                    onChange={(e) => setReasonDraft(e.target.value)}
                    rows={2}
                    className="mb-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
                    placeholder="e.g. AI position was off - moved to match the actual printed room boundary"
                  />
                  <button
                    onClick={() => handleSave(activePin, "overridden")}
                    disabled={savingKey === activePin.key}
                    className="w-full rounded-md bg-brand-gold px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
                  >
                    {savingKey === activePin.key ? "Saving…" : "Save moved position"}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleSave(activePin, "accepted")}
                  disabled={savingKey === activePin.key || activePin.resolved}
                  className="w-full rounded-md bg-brand-gold px-3 py-1.5 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
                >
                  {activePin.resolved ? "Confirmed" : savingKey === activePin.key ? "Saving…" : "Confirm placement"}
                </button>
              )}
              {saveError && (
                <p className="mt-2 text-xs text-red-400" role="alert">
                  {saveError}
                </p>
              )}
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-grey-text">On this sheet</p>
            <ul className="space-y-1 text-sm">
              {pins.map((pin) => (
                <li key={pin.key} className="flex items-center justify-between">
                  <button onClick={() => setActiveKey(pin.key)} className="text-left text-brand-silver-highlight hover:text-brand-gold">
                    {pin.label}
                  </button>
                  <span className={pin.resolved ? "text-brand-success" : "text-brand-grey-text"}>
                    {pin.resolved ? "Resolved" : pin.hasAiSuggestion ? "AI suggested" : "Unplaced"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {(unplacedRooms.length > 0 || unplacedZones.length > 0 || unplacedReturns.length > 0) && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-grey-text">
                Needs placement on this sheet
              </p>
              <ul className="space-y-1 text-sm">
                {unplacedRooms.map((r) => (
                  <li key={r.id} className="flex items-center justify-between">
                    <span className="text-brand-grey-text">{r.name}</span>
                    <button
                      onClick={() => handlePlaceOnCurrentSheet("room", r.id, r.name)}
                      className="rounded-md border border-brand-gold/50 px-2 py-0.5 text-xs text-brand-gold hover:border-brand-gold"
                    >
                      Place here
                    </button>
                  </li>
                ))}
                {unplacedZones.map((z) => (
                  <li key={`zone-${z.id}`} className="flex items-center justify-between">
                    <span className="text-brand-grey-text">{z.name} (AHU)</span>
                    <button
                      onClick={() => handlePlaceOnCurrentSheet("zone", z.id, `${z.name} (AHU)`)}
                      className="rounded-md border border-brand-gold/50 px-2 py-0.5 text-xs text-brand-gold hover:border-brand-gold"
                    >
                      Place here
                    </button>
                  </li>
                ))}
                {unplacedReturns.map((z) => (
                  <li key={`return-${z.id}`} className="flex items-center justify-between">
                    <span className="text-brand-grey-text">{z.name} (Return)</span>
                    <button
                      onClick={() => handlePlaceOnCurrentSheet("return", z.id, `${z.name} (Return)`)}
                      className="rounded-md border border-brand-gold/50 px-2 py-0.5 text-xs text-brand-gold hover:border-brand-gold"
                    >
                      Place here
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {unplacedOnOtherSheet.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-grey-text">
                Assigned to a different sheet
              </p>
              <ul className="space-y-1 text-xs text-brand-grey-text">
                {unplacedOnOtherSheet.map((r) => (
                  <li key={r.id}>{r.name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
