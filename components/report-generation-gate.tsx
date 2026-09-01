"use client";

// FIX-PIPELINE: the readiness checklist for report generation. It now
// mirrors the one pipeline state machine - "can generate" == "project is
// finalized", and the blocker list is the set of stage gates / unreviewed
// AI proposals still standing (from GET-equivalent POST /api/reports/gate-
// status, which delegates to computePipelineState). The guided stepper's
// FinalizePanel shows the same checklist from context; this component is
// kept for the non-guided (commercial) report button.
import { useEffect, useState } from "react";

type Blocker = { label: string; detail: string };

export function ReportGenerationGate({
  projectId,
  onReady,
}: {
  projectId: string;
  // Called once the gate status is known, so a parent (e.g. the actual
  // "Generate Report" button) can enable/disable itself.
  onReady: (ready: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
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
        <span aria-hidden>✓</span> Ready - project is finalized.
      </p>
    );
  }
  return (
    <div className="rounded-md border border-brand-gold/50 bg-brand-gold-base/10 p-4">
      <p className="mb-2 text-sm font-semibold text-brand-gold">
        {blockers.length} item{blockers.length === 1 ? "" : "s"} before this project can be finalized:
      </p>
      <ul className="flex flex-col gap-2">
        {blockers.map((b, i) => (
          <li key={i} className="text-sm text-brand-silver-highlight">
            <span className="font-medium text-brand-gold">{b.label}:</span> {b.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
