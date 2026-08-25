"use client";

import { useEffect, useState } from "react";
import type { LiveDuctRoutingSheet } from "@/lib/ductRouting";

// Live, in-app rendering of the exact same Manual D duct schematic the
// PDF report produces (lib/reportHtmlV2.ts's renderDuctRoutingPage) -
// same colors, same symbols, same legend - so a tech can see this
// directly in the project workspace without generating/downloading a
// PDF. Ported to real JSX/SVG rather than sharing string-template
// functions across the server/client boundary (same convention this
// codebase already uses elsewhere - see duct-design-section.tsx's
// DUCT_RUN_COLUMNS comment for why runtime values aren't shared that
// way here).
const SUPPLY_COLOR = "#c0392b";
const RETURN_COLOR = "#2f8f4f";
const SYMBOL_INK = "#1c2b3a";
const PAPER = "#f0efec";

export function DuctRoutingDiagram({ sheets }: { sheets: LiveDuctRoutingSheet[] }) {
  const [images, setImages] = useState<Map<string, string>>(new Map());
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
        const [drawingId, pageNumber] = key.split(":");
        const res = await fetch(`/api/drawings/${drawingId}/page-image?page=${pageNumber}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load page image");
        return [key, body.dataUri as string] as const;
      }),
    )
      .then((pairs) => {
        if (cancelled) return;
        setImages((prev) => {
          const next = new Map(prev);
          for (const [key, dataUri] of pairs) next.set(key, dataUri);
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

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      {sheets.map((sheet, sheetIndex) => {
        const imageDataUri = images.get(`${sheet.drawingId}:${sheet.pageNumber}`);
        if (!imageDataUri) {
          return (
            <p key={sheetIndex} className="text-sm text-brand-grey-text">
              {loading ? "Rendering floor plan…" : "This sheet's source image could not be loaded."}
            </p>
          );
        }

        const routeLines = sheet.routes.map((route, i) => {
          const x1 = route.fromXNorm * 100;
          const y1 = route.fromYNorm * 100;
          const x2 = route.toXNorm * 100;
          const y2 = route.toYNorm * 100;
          const straight = Math.abs(x1 - x2) < 0.2 || Math.abs(y1 - y2) < 0.2;
          const points = straight ? `${x1},${y1} ${x2},${y2}` : `${x1},${y1} ${x1},${y2} ${x2},${y2}`;
          return <polyline key={i} points={points} fill="none" stroke={SUPPLY_COLOR} strokeWidth={0.55} strokeLinecap="round" />;
        });

        const runLabels = sheet.routes.map((route, i) => {
          const sizeText = route.diameterIn ? `${route.diameterIn}"⌀` : null;
          const cfmText = route.cfm != null ? `${Math.round(route.cfm)} cfm` : null;
          const text = [sizeText, cfmText].filter(Boolean).join(" / ");
          if (!text) return null;
          const t = i % 2 === 0 ? 0.4 : 0.6;
          const lx = route.fromXNorm + (route.toXNorm - route.fromXNorm) * t;
          const ly = route.fromYNorm + (route.toYNorm - route.fromYNorm) * t;
          return (
            <text
              key={i}
              x={lx * 100}
              y={ly * 100}
              dy={-0.6}
              fontSize={1.6}
              fontWeight={700}
              fill={SUPPLY_COLOR}
              textAnchor="middle"
              style={{ paintOrder: "stroke", stroke: PAPER, strokeWidth: 0.6, strokeLinejoin: "round" }}
            >
              {text}
            </text>
          );
        });

        const roomLabels = sheet.pins
          .filter((p) => p.kind === "room")
          .map((pin, i) => (
            <text
              key={i}
              x={pin.xNorm * 100}
              y={pin.yNorm * 100}
              dx={2.4}
              dy={-2.2}
              fontSize={1.7}
              fontWeight={600}
              fill="#1f3a5f"
              style={{ paintOrder: "stroke", stroke: PAPER, strokeWidth: 0.6, strokeLinejoin: "round" }}
            >
              {pin.label}
            </text>
          ));

        const pinIcons = sheet.pins.map((pin, i) => {
          const cx = pin.xNorm * 100;
          const cy = pin.yNorm * 100;
          if (pin.kind === "ahu") {
            const trunkText = [pin.trunkDiameterIn ? `${pin.trunkDiameterIn}"⌀` : null, pin.trunkCfm != null ? `${Math.round(pin.trunkCfm)} cfm` : null]
              .filter(Boolean)
              .join(" / ");
            return (
              <g key={i} transform={`translate(${cx} ${cy})`}>
                <line x1={0} y1={0} x2={-4.5} y2={0} stroke={SUPPLY_COLOR} strokeWidth={0.7} strokeLinecap="round" />
                {trunkText && (
                  <text x={-2.3} y={-0.9} fontSize={1.5} fontWeight={700} textAnchor="middle" fill={SUPPLY_COLOR} style={{ paintOrder: "stroke", stroke: PAPER, strokeWidth: 0.6 }}>
                    {trunkText}
                  </text>
                )}
                <rect x={2} y={2.6} width={2.6} height={2.6} fill={RETURN_COLOR} stroke={PAPER} strokeWidth={0.25} />
                <line x1={2} y1={2.6} x2={4.6} y2={5.2} stroke={PAPER} strokeWidth={0.2} />
                <line x1={4.6} y1={2.6} x2={2} y2={5.2} stroke={PAPER} strokeWidth={0.2} />
                <rect x={-2.2} y={-2.2} width={4.4} height={4.4} fill={SYMBOL_INK} stroke={PAPER} strokeWidth={0.3} />
                <text x={0} y={0.7} fontSize={1.5} fontWeight={700} textAnchor="middle" fill={PAPER}>
                  AHU
                </text>
              </g>
            );
          }
          return (
            <g key={i} transform={`translate(${cx} ${cy})`}>
              <circle r={1.5} fill={PAPER} stroke={SYMBOL_INK} strokeWidth={0.4} />
              <line x1={-1.2} y1={-1.2} x2={1.2} y2={1.2} stroke={SYMBOL_INK} strokeWidth={0.28} />
              <line x1={-1.2} y1={1.2} x2={1.2} y2={-1.2} stroke={SYMBOL_INK} strokeWidth={0.28} />
            </g>
          );
        });

        return (
          <div key={sheetIndex}>
            {sheets.length > 1 && (
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-brand-grey-text">Sheet {sheetIndex + 1}</p>
            )}
            <div className="relative inline-block max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageDataUri}
                alt="Duct routing sheet"
                className="block max-w-full border border-brand-gold/50"
                style={{ filter: "grayscale(1) brightness(1.55) contrast(0.82)" }}
              />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                {routeLines}
                {pinIcons}
                {runLabels}
                {roomLabels}
              </svg>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-5 rounded-md border border-brand-gold/50 bg-zinc-900/50 px-4 py-3 text-xs text-brand-grey-text">
        <strong className="text-brand-silver-highlight">Legend</strong>
        <span className="flex items-center gap-1.5">
          <svg width={20} height={6}>
            <line x1={1} y1={3} x2={19} y2={3} stroke={SUPPLY_COLOR} strokeWidth={2} />
          </svg>
          Supply duct (size / CFM on the run)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={14} height={14}>
            <rect x={2} y={2} width={10} height={10} fill={RETURN_COLOR} />
          </svg>
          Return air (single central return)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={14} height={14}>
            <rect x={1} y={1} width={12} height={12} fill={SYMBOL_INK} />
          </svg>
          AHU / mechanical equipment
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={14} height={14}>
            <circle cx={7} cy={7} r={5} fill={PAPER} stroke={SYMBOL_INK} strokeWidth={1.2} />
          </svg>
          Supply register (one-way)
        </span>
      </div>
    </div>
  );
}
