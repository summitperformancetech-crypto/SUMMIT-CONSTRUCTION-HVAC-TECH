"use client";

import { useEffect, useState } from "react";
import {
  layoutDuctRoutingLabels,
  computeSheetDuctRouting,
  buildDuctNetworkPrimitives,
  type LiveDuctRoutingSheet,
  type RoutedDuctSegment,
} from "@/lib/ductRouting";
import type { RoomRow, ZoneRow } from "@/components/manual-j-workflow";
import type { DrawingRow } from "@/lib/drawingExtraction";

// Live, in-app rendering of the exact same Manual D duct schematic the
// PDF report produces (lib/reportHtmlV2.ts's renderDuctRoutingPage) -
// same colors, same symbols, same legend - so a tech can see this
// directly in the project workspace without generating/downloading a
// PDF. Ported to real JSX/SVG rather than sharing string-template
// functions across the server/client boundary (same convention this
// codebase already uses elsewhere - see duct-design-section.tsx's
// DUCT_RUN_COLUMNS comment for why runtime values aren't shared that
// way here).
//
// Rebuilt 2026-08-25 against 4 real Wrightsoft/AutoCAD reference sheets
// the user supplied: real orthogonal trunk-and-branch routing (via
// lib/ductPathGeometry.ts/lib/ductRouting.ts's computeSheetDuctRouting),
// not a straight-line home-run star pattern - see that module's own
// comments for the full routing algorithm and its honestly-disclosed
// limits (axis-aligned room-box obstacle avoidance from real extracted
// geometry, not full wall/door-vector CAD routing).
const SUPPLY_COLOR = "#c0392b";
const RETURN_COLOR = "#2f8f4f";
const SYMBOL_INK = "#1c2b3a";
const PAPER = "#f0efec";

// Real line-weight hierarchy (SVG stroke-width in the diagram's own 0-100
// viewBox units) - trunk visibly heavier than branch, branch heavier than
// an individual run-out to one diffuser.
const SEGMENT_WIDTH: Record<RoutedDuctSegment["cls"], number> = {
  trunk: 1.1,
  branch: 0.7,
  runout: 0.42,
};

// Soft, distinct per-zone background tints (first floor vs. second floor,
// etc.) - low-opacity so the underlying floor plan linework stays
// legible, per the reference sheets' own zone-color-coding convention.
const ZONE_TINTS = ["#fde68a", "#93c5fd", "#86efac", "#f9a8d4", "#c4b5fd", "#fca5a5"];

function zoneTintColor(zoneId: string, zoneIdsInOrder: string[]): string {
  const index = zoneIdsInOrder.indexOf(zoneId);
  return ZONE_TINTS[index % ZONE_TINTS.length];
}

export function DuctRoutingDiagram({
  sheets,
  rooms,
  zones,
  drawings,
}: {
  sheets: LiveDuctRoutingSheet[];
  rooms: RoomRow[];
  zones: ZoneRow[];
  drawings: DrawingRow[];
}) {
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [routing, setRouting] = useState<Map<string, Map<string, RoutedDuctSegment[]>>>(new Map());
  const [routingNotice, setRoutingNotice] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const keys = sheets.map((s) => `${s.drawingId}:${s.pageNumber}`);
    const missing = keys.filter((k) => !images.has(k));
    if (missing.length === 0) return;

    setLoading(true);
    setError(null);
    Promise.all(
      missing.map(async (key) => {
        const [drawingId, pageNumberStr] = key.split(":");
        const pageNumber = Number(pageNumberStr);
        const res = await fetch(`/api/drawings/${drawingId}/page-image?page=${pageNumber}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load page image");

        const sheet = sheets.find((s) => s.drawingId === drawingId && s.pageNumber === pageNumber)!;
        let routedForSheet: Map<string, RoutedDuctSegment[]> | null = null;
        let notice: string | null = null;
        if (body.pageWidthPt != null && body.pageHeightPt != null) {
          const drawing = drawings.find((d) => d.id === drawingId);
          const roomsOnSheet = rooms
            .filter(
              (r) =>
                r.position_source_drawing_id === drawingId &&
                r.position_source_page_number === pageNumber &&
                r.position_x_norm != null &&
                r.position_y_norm != null,
            )
            .map((r) => ({ id: r.id, name: r.name, xNorm: r.position_x_norm!, yNorm: r.position_y_norm! }));
          const zoneIdsOnSheet = [...new Set(sheet.pins.filter((p) => p.kind === "ahu").map((p) => p.zoneId))];
          const zonesOnSheet = zoneIdsOnSheet
            .map((zoneId) => {
              const ahuPin = sheet.pins.find((p) => p.kind === "ahu" && p.zoneId === zoneId);
              if (!ahuPin) return null;
              const ahuOwnRoom = rooms.find(
                (r) => r.zone_id === zoneId && r.position_x_norm === ahuPin.xNorm && r.position_y_norm === ahuPin.yNorm,
              );
              return {
                id: zoneId,
                ahuPoint: { xNorm: ahuPin.xNorm, yNorm: ahuPin.yNorm },
                ahuOwnRoomId: ahuOwnRoom?.id ?? null,
                targetRoomIds: sheet.routes.filter((r) => r.zoneId === zoneId).map((r) => r.roomId),
                corridorGraph: zones.find((z) => z.id === zoneId)?.corridor_graph ?? null,
              };
            })
            .filter((z): z is NonNullable<typeof z> => z != null);

          routedForSheet = computeSheetDuctRouting(
            drawing?.extracted_data ?? null,
            pageNumber,
            body.pageWidthPt,
            body.pageHeightPt,
            roomsOnSheet,
            zonesOnSheet,
          );
          if (routedForSheet == null) {
            notice =
              "Couldn't derive a real-world scale for this sheet (no room has both a known printed dimension and a placed pin) - showing pins without routed duct lines.";
          }
        }

        return { key, dataUri: body.dataUri as string, routedForSheet, notice };
      }),
    )
      .then((results) => {
        if (cancelled) return;
        setImages((prev) => {
          const next = new Map(prev);
          for (const r of results) next.set(r.key, r.dataUri);
          return next;
        });
        setRouting((prev) => {
          const next = new Map(prev);
          for (const r of results) if (r.routedForSheet) next.set(r.key, r.routedForSheet);
          return next;
        });
        setRoutingNotice((prev) => {
          const next = new Map(prev);
          for (const r of results) if (r.notice) next.set(r.key, r.notice);
          return next;
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load floor plan image");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets.map((s) => `${s.drawingId}:${s.pageNumber}`).join(",")]);

  if (sheets.length === 0) {
    return (
      <p className="rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-6 text-center text-sm text-brand-grey-text">
        No duct-routing pins have been resolved yet. Once every relevant room and zone AHU pin is
        confirmed in the Duct Routing Pins section above, the real schematic diagram renders here.
      </p>
    );
  }

  const allZoneIds = [...new Set(sheets.flatMap((s) => s.pins.map((p) => p.zoneId)))];

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      {sheets.map((sheet, sheetIndex) => {
        const key = `${sheet.drawingId}:${sheet.pageNumber}`;
        const imageDataUri = images.get(key);
        if (!imageDataUri) {
          return (
            <p key={sheetIndex} className="text-sm text-brand-grey-text">
              {loading ? "Rendering floor plan…" : "This sheet's source image could not be loaded."}
            </p>
          );
        }

        const routedByRoomId = routing.get(key);
        const notice = routingNotice.get(key);
        const allSegments = routedByRoomId ? [...routedByRoomId.values()].flat() : [];
        const primitives = buildDuctNetworkPrimitives(allSegments);

        const sheetZoneIds = [...new Set(sheet.pins.map((p) => p.zoneId))];
        const zoneTint = sheetZoneIds.length === 1 ? zoneTintColor(sheetZoneIds[0], allZoneIds) : null;

        // Flex vs. metal duct texture (REFERENCE-DOCS/IMG_3916.JPG's "A/C
        // DUCT SPECIFICATIONS" key: a ribbed/coil texture means flexible
        // duct, a plain line means rigid metal). Keyed off the segment's
        // trunk/branch classification, not a per-run material lookup -
        // once branches/run-outs merge into a shared trunk network
        // (buildDuctNetworkPrimitives), a single rendered segment can be
        // shared by runs with different real materials, so there's no
        // single real material left to trace back per segment. Trunk =
        // solid (metal is the near-universal real convention for a
        // rigid trunk backbone); branch/run-out = ribbed dashes (flex is
        // the near-universal real convention for a branch run to a
        // register) - this is also literally Summit's own existing
        // default (components/duct-design-section.tsx's
        // handleAutoGenerateFromPins inserts trunk rows as
        // material:"sheet_metal", branch rows default to "flex" in the
        // Add Duct Run form) - a disclosed classification-based
        // approximation, not a fabricated one.
        const routeLines = primitives.segments.map((seg, i) => (
          <line
            key={i}
            x1={seg.fromXNorm * 100}
            y1={seg.fromYNorm * 100}
            x2={seg.toXNorm * 100}
            y2={seg.toYNorm * 100}
            stroke={SUPPLY_COLOR}
            strokeWidth={SEGMENT_WIDTH[seg.cls]}
            strokeLinecap="round"
            strokeDasharray={seg.cls === "trunk" ? undefined : "0.55,0.4"}
          />
        ));

        // Real fitting symbols at real graph junctions (see
        // buildDuctNetworkPrimitives) - a filled circle at a 90-degree
        // elbow, a filled square at a branch takeoff (3-way tee),
        // matching the reference sheets' own fitting convention rather
        // than just two lines crossing with no symbol at all.
        const elbowSymbols = primitives.elbows.map((p, i) => (
          <circle key={`elbow-${i}`} cx={p.xNorm * 100} cy={p.yNorm * 100} r={0.4} fill={SUPPLY_COLOR} />
        ));
        const teeSymbols = primitives.tees.map((p, i) => (
          <rect
            key={`tee-${i}`}
            x={p.xNorm * 100 - 0.5}
            y={p.yNorm * 100 - 0.5}
            width={1}
            height={1}
            fill={SYMBOL_INK}
            stroke={PAPER}
            strokeWidth={0.15}
          />
        ));

        const labels = layoutDuctRoutingLabels(sheet).map((label, i) => {
          const style =
            label.kind === "room"
              ? { fontSize: 1.7, fontWeight: 600, fill: "#1f3a5f" }
              : { fontSize: label.kind === "trunk" ? 1.5 : 1.6, fontWeight: 700, fill: SUPPLY_COLOR };
          const leaderDistance = Math.hypot(label.x - label.anchorX, label.y - label.anchorY);
          const showLeader = leaderDistance > 3.5;
          const leader = showLeader && (
            <line
              x1={label.anchorX}
              y1={label.anchorY}
              x2={label.textAnchor === "middle" ? label.x : label.x - 0.6}
              y2={label.y - style.fontSize * 0.35}
              stroke={style.fill}
              strokeWidth={0.18}
              strokeDasharray="0.6,0.5"
            />
          );

          // Real register callout: a circled type code beside a stacked
          // size-over-CFM block with a divider line - matches
          // REFERENCE-DOCS/IMG_3916.JPG's "STANDARD AIR DISTRIBUTION"
          // key exactly, not an inline "size / cfm" string.
          if (label.kind === "run" && label.secondaryText != null) {
            const fontSize = 1.5;
            const lineGap = fontSize * 1.25;
            const dividerWidth = Math.max(label.text.length, label.secondaryText.length) * fontSize * 0.62;
            const circleCx = label.x - 1.9;
            const circleCy = label.y + lineGap / 2 - fontSize * 0.32;
            return (
              <g key={i}>
                {leader}
                <circle cx={circleCx} cy={circleCy} r={0.95} fill={PAPER} stroke={SUPPLY_COLOR} strokeWidth={0.22} />
                <text x={circleCx} y={circleCy + 0.4} fontSize={1} fontWeight={700} fill={SUPPLY_COLOR} textAnchor="middle">
                  {label.typeCode}
                </text>
                <text
                  x={label.x}
                  y={label.y}
                  fontSize={fontSize}
                  fontWeight={700}
                  fill={SUPPLY_COLOR}
                  textAnchor="start"
                  style={{ paintOrder: "stroke", stroke: PAPER, strokeWidth: 0.6, strokeLinejoin: "round" }}
                >
                  {label.text}
                </text>
                <line
                  x1={label.x}
                  y1={label.y + fontSize * 0.32}
                  x2={label.x + dividerWidth}
                  y2={label.y + fontSize * 0.32}
                  stroke={SUPPLY_COLOR}
                  strokeWidth={0.15}
                />
                <text
                  x={label.x}
                  y={label.y + lineGap}
                  fontSize={fontSize}
                  fontWeight={700}
                  fill={SUPPLY_COLOR}
                  textAnchor="start"
                  style={{ paintOrder: "stroke", stroke: PAPER, strokeWidth: 0.6, strokeLinejoin: "round" }}
                >
                  {label.secondaryText}
                </text>
              </g>
            );
          }

          return (
            <g key={i}>
              {leader}
              <text
                x={label.x}
                y={label.y}
                fontSize={style.fontSize}
                fontWeight={style.fontWeight}
                fill={style.fill}
                textAnchor={label.textAnchor}
                textDecoration={label.kind === "room" ? "underline" : undefined}
                style={{ paintOrder: "stroke", stroke: PAPER, strokeWidth: 0.6, strokeLinejoin: "round" }}
              >
                {label.text}
              </text>
            </g>
          );
        });

        // Register/return symbols per REFERENCE-DOCS/IMG_3916.JPG's real
        // legend: supply = red SQUARE + X with a one-way throw tick
        // (Summit has no real per-register throw-pattern data, so
        // one-way - matching the "1W" callout - is the honest default,
        // not a guessed 2/3/4-way claim); return = green OUTLINED
        // square with a single diagonal, not a filled swatch.
        const pinIcons = sheet.pins.map((pin, i) => {
          const cx = pin.xNorm * 100;
          const cy = pin.yNorm * 100;
          if (pin.kind === "ahu") {
            return (
              <g key={i} transform={`translate(${cx} ${cy})`}>
                <line x1={0} y1={0} x2={-4.5} y2={0} stroke={SUPPLY_COLOR} strokeWidth={0.7} strokeLinecap="round" />
                <rect x={-2.2} y={-2.2} width={4.4} height={4.4} fill={SYMBOL_INK} stroke={PAPER} strokeWidth={0.3} />
                <line x1={-1.6} y1={1.6} x2={-0.3} y2={0.3} stroke={PAPER} strokeWidth={0.18} opacity={0.55} />
                <line x1={-0.3} y1={1.6} x2={1.6} y2={-0.3} stroke={PAPER} strokeWidth={0.18} opacity={0.55} />
                <line x1={-1.6} y1={-0.3} x2={0.3} y2={-1.6} stroke={PAPER} strokeWidth={0.18} opacity={0.55} />
                <text x={0} y={0.7} fontSize={1.5} fontWeight={700} textAnchor="middle" fill={PAPER}>
                  AHU
                </text>
              </g>
            );
          }
          if (pin.kind === "return") {
            // A real, independently-placed pin (not assumed co-located
            // with the AHU) - green outlined square with a single
            // diagonal, per REFERENCE-DOCS/IMG_3916.JPG's real return-air
            // grille legend, sized and labeled as its own piece of
            // equipment rather than a small attached swatch.
            return (
              <g key={i} transform={`translate(${cx} ${cy})`}>
                <rect x={-2.2} y={-2.2} width={4.4} height={4.4} fill={PAPER} stroke={RETURN_COLOR} strokeWidth={0.35} />
                <line x1={-1.6} y1={1.6} x2={1.6} y2={-1.6} stroke={RETURN_COLOR} strokeWidth={0.28} />
                <text x={0} y={0.7} fontSize={1.4} fontWeight={700} textAnchor="middle" fill={RETURN_COLOR}>
                  RA
                </text>
              </g>
            );
          }
          return (
            <g key={i} transform={`translate(${cx} ${cy})`}>
              <rect x={-1.3} y={-1.3} width={2.6} height={2.6} fill={PAPER} stroke={SUPPLY_COLOR} strokeWidth={0.32} />
              <line x1={-1.05} y1={-1.05} x2={1.05} y2={1.05} stroke={SUPPLY_COLOR} strokeWidth={0.26} />
              <line x1={-1.05} y1={1.05} x2={1.05} y2={-1.05} stroke={SUPPLY_COLOR} strokeWidth={0.26} />
              <line x1={0} y1={-1.3} x2={0} y2={-2.1} stroke={SUPPLY_COLOR} strokeWidth={0.26} strokeLinecap="round" />
            </g>
          );
        });

        return (
          <div key={sheetIndex}>
            {sheets.length > 1 && (
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-brand-grey-text">Sheet {sheetIndex + 1}</p>
            )}
            {notice && <p className="mb-2 text-xs text-amber-400">{notice}</p>}
            <div className="relative inline-block max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageDataUri}
                alt="Duct routing sheet"
                className="block max-w-full border border-brand-gold/50"
                style={{ filter: "grayscale(1) brightness(1.55) contrast(0.82)" }}
              />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                {zoneTint && <rect x={0} y={0} width={100} height={100} fill={zoneTint} opacity={0.22} />}
                {routeLines}
                {elbowSymbols}
                {teeSymbols}
                {pinIcons}
                {labels}
              </svg>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-5 rounded-md border border-brand-gold/50 bg-zinc-900/50 px-4 py-3 text-xs text-brand-grey-text">
        <strong className="text-brand-silver-highlight">Legend</strong>
        <span className="flex items-center gap-1.5">
          <svg width={20} height={6}>
            <line x1={1} y1={3} x2={19} y2={3} stroke={SUPPLY_COLOR} strokeWidth={3} />
          </svg>
          Trunk (metal)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={20} height={6}>
            <line x1={1} y1={3} x2={19} y2={3} stroke={SUPPLY_COLOR} strokeWidth={1.8} strokeDasharray="2.5,2" />
          </svg>
          Branch (flex)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={20} height={6}>
            <line x1={1} y1={3} x2={19} y2={3} stroke={SUPPLY_COLOR} strokeWidth={1} strokeDasharray="2.5,2" />
          </svg>
          Run-out (flex)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={14} height={14}>
            <rect x={2} y={2} width={10} height={10} fill={PAPER} stroke={RETURN_COLOR} strokeWidth={1.4} />
            <line x1={2} y1={12} x2={12} y2={2} stroke={RETURN_COLOR} strokeWidth={1} />
          </svg>
          Return air grille
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={14} height={14}>
            <rect x={1} y={1} width={12} height={12} fill={SYMBOL_INK} />
          </svg>
          AHU / mechanical equipment
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={14} height={14}>
            <rect x={2} y={2} width={10} height={10} fill={PAPER} stroke={SUPPLY_COLOR} strokeWidth={1.4} />
            <line x1={2} y1={2} x2={12} y2={12} stroke={SUPPLY_COLOR} strokeWidth={1} />
            <line x1={2} y1={12} x2={12} y2={2} stroke={SUPPLY_COLOR} strokeWidth={1} />
          </svg>
          Supply register (one-way)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={14} height={14}>
            <rect x={4} y={4} width={6} height={6} fill={SYMBOL_INK} />
          </svg>
          Branch takeoff (tee)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={22} height={14}>
            <circle cx={7} cy={7} r={4.2} fill="none" stroke={SUPPLY_COLOR} strokeWidth={1} />
            <text x={7} y={9.5} fontSize={5} fontWeight={700} textAnchor="middle" fill={SUPPLY_COLOR}>
              1W
            </text>
            <text x={16} y={6} fontSize={4.2} fontWeight={700} fill={SUPPLY_COLOR}>
              6&quot;⌀
            </text>
            <line x1={12} y1={7} x2={20} y2={7} stroke={SUPPLY_COLOR} strokeWidth={0.6} />
            <text x={16} y={13} fontSize={4.2} fontWeight={700} fill={SUPPLY_COLOR}>
              80
            </text>
          </svg>
          Register callout (type / size / CFM)
        </span>
      </div>
    </div>
  );
}
