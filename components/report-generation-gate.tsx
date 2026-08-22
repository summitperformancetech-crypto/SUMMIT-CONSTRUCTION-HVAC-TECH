"use client";

// SUMMIT-REPORT-STANDARD.md Section 3: "The 'Generate Report' action must
// be disabled (not just warned-against) until every one of these is
// true... the correct product behavior is to show the user what's
// blocking generation (a checklist of the above), not to render a report
// with gaps, placeholders, or a 'TBD' equipment section." This component
// is that checklist - it calls app/api/reports/gate-status, a thin
// server route wrapping the SAME lib/reportGate.ts function the actual
// render path uses, so the UI can never claim "ready" when generation
// would actually fail, or vice versa. Fetched via the API route (not
// getReportData directly) so the calc engine it pulls in
// (computeManualJ/computeManualD/evaluateEquipment) stays server-side,
// out of the client bundle.
import { useEffect, useState } from "react";
import type { ReportGenerationBlocker } from "@/lib/reportGate";

const BLOCKER_LABELS: Record<ReportGenerationBlocker["code"], string> = {
  unresolved_fields: "Unresolved fields",
  equipment_incomplete: "Equipment selection",
  duct_design_incomplete: "Duct design",
  totals_invalid: "Calculation totals",
};

export function ReportGenerationGate({
  projectId,
  onReady,
}: {
  projectId: string;
  // Called once the gate status is known, so a parent (e.g. the actual
  // "Generate Report" button) can enable/disable itself - this component
  // owns the checklist display, not the download action itself.
  onReady: (ready: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [blockers, setBlockers] = useState<ReportGenerationBlocker[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/reports/gate-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Failed to check report generation status.");
          setLoading(false);
          onReady(false);
          return;
        }
        setBlockers(body.blockers ?? []);
        setLoading(false);
        onReady(body.canGenerate === true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to check report generation status.");
        setLoading(false);
        onReady(false);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (loading) {
    return <p className="text-sm text-brand-grey-text">Checking report readiness…</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-red-400" role="alert">
        {error}
      </p>
    );
  }
  if (blockers.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-brand-success">
        <span aria-hidden>✓</span> Ready to generate - all Section 3 gate conditions met.
      </p>
    );
  }
  return (
    <div className="rounded-md border border-brand-gold/50 bg-brand-gold-base/10 p-4">
      <p className="mb-2 text-sm font-semibold text-brand-gold">
        {blockers.length} thing{blockers.length === 1 ? "" : "s"} blocking report generation:
      </p>
      <ul className="flex flex-col gap-2">
        {blockers.map((b, i) => (
          <li key={i} className="text-sm text-brand-silver-highlight">
            <span className="font-medium text-brand-gold">{BLOCKER_LABELS[b.code]}:</span> {b.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
