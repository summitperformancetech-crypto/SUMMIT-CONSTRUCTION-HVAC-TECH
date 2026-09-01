"use client";

// Stage 13 - Review & Finalize. Renders the full pipeline checklist from
// the shared state and the single "Finalize Project" button. FIX-PIPELINE:
// this is the ONLY path that freezes calculation_snapshots v1 - no report
// download ever freezes implicitly. Once finalized, the report/sign-off
// controls (passed as `children`) become active.

import { useState } from "react";
import { PIPELINE_STAGES, PIPELINE_STAGE_LABEL } from "@/lib/pipeline";
import { usePipeline } from "@/components/pipeline/pipeline-provider";

export function FinalizePanel({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const { state, refreshPipeline } = usePipeline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);

  async function handleFinalize() {
    setBusy(true);
    setError(null);
    setBlockers([]);
    try {
      const res = await fetch(`/api/projects/${projectId}/finalize`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Failed to finalize.");
        setBlockers(body.blockers ?? []);
        return;
      }
      await refreshPipeline();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finalize.");
    } finally {
      setBusy(false);
    }
  }

  const incomplete = PIPELINE_STAGES.filter((s) => s !== "finalize" && !state.stages[s].exitGateMet);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
        <h2 className="mb-4 text-lg font-semibold text-brand-gold">Review &amp; Finalize</h2>

        <ul className="flex flex-col gap-2">
          {PIPELINE_STAGES.filter((s) => s !== "finalize").map((s) => {
            const st = state.stages[s];
            return (
              <li key={s} className="flex items-start gap-2 text-sm">
                <span aria-hidden className={st.exitGateMet ? "text-brand-success" : "text-brand-gold"}>
                  {st.exitGateMet ? "✓" : "•"}
                </span>
                <span className="text-brand-silver-highlight">
                  <span className="font-medium">{PIPELINE_STAGE_LABEL[s]}</span>
                  {!st.exitGateMet && st.blockers.length > 0 && (
                    <span className="text-brand-grey-text"> — {st.blockers.join("; ")}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>

        {state.outstandingProposals > 0 && (
          <div className="mt-4 rounded-md border border-brand-gold/50 bg-brand-gold-base/10 p-3">
            <p className="text-sm font-semibold text-brand-gold">
              {state.outstandingProposals} AI proposal{state.outstandingProposals === 1 ? "" : "s"} still need review:
            </p>
            <ul className="mt-1 list-inside list-disc text-xs text-brand-silver-highlight">
              {state.outstandingProposalList.map((p) => (
                <li key={p.key}>{p.label}</li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
        {blockers.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-xs text-red-400">
            {blockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}

        <div className="mt-5">
          {state.finalized ? (
            <p className="flex items-center gap-2 text-sm text-brand-success">
              <span aria-hidden>✓</span> Project finalized. Calculations are frozen; use a revision to change them.
            </p>
          ) : (
            <button
              onClick={handleFinalize}
              disabled={busy || !state.canFinalize}
              title={!state.canFinalize ? `${incomplete.length} stage(s) still incomplete` : undefined}
              className="rounded-md bg-brand-gold px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Finalizing…" : "Finalize Project"}
            </button>
          )}
        </div>
      </section>

      <div className={state.finalized ? "" : "pointer-events-none opacity-40"}>{children}</div>
    </div>
  );
}
