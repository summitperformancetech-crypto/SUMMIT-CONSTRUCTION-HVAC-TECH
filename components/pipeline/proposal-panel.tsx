"use client";

// The Accept / Override-with-reason control for one project-level AI
// proposal (rooms, zoning, duct design, ventilation). FIX-PIPELINE
// automation model: the AI has already produced the proposal; the
// technician's job is one click to Accept, or an Override with a written
// reason. Both are recorded in the existing field_resolutions audit table
// (table_name='projects', field_name='proposal:<name>'), exactly like the
// UNRESOLVED drawing-field workflow.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { proposalKey, type ProposalName } from "@/lib/aiProposals";
import { usePipeline } from "@/components/pipeline/pipeline-provider";

export function ProposalPanel({
  projectId,
  proposalName,
  title,
  description,
}: {
  projectId: string;
  proposalName: ProposalName;
  title: string;
  description: string;
}) {
  const { state, refreshPipeline } = usePipeline();
  const [busy, setBusy] = useState<"accept" | "override" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [reason, setReason] = useState("");

  const key = proposalKey(projectId, proposalName);
  const outstanding = state.outstandingProposalList.some((p) => p.key === key);

  async function record(type: "accepted" | "overridden", overrideReason: string | null) {
    setBusy(type === "accepted" ? "accept" : "override");
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be signed in.");
      setBusy(null);
      return;
    }
    const { error: insertError } = await supabase.from("field_resolutions").insert({
      project_id: projectId,
      table_name: "projects",
      record_id: projectId,
      field_name: `proposal:${proposalName}`,
      ai_extracted_value: null,
      final_value: type === "accepted" ? "accepted" : overrideReason,
      resolution_type: type,
      override_reason: type === "overridden" ? overrideReason : null,
      resolved_by: user.id,
    });
    setBusy(null);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setOverriding(false);
    setReason("");
    await refreshPipeline();
  }

  return (
    <section className="rounded-lg border border-brand-gold bg-brand-gold-base/10 p-5">
      <h3 className="text-sm font-semibold text-brand-gold">{title}</h3>
      <p className="mt-1 text-xs text-brand-grey-text">{description}</p>

      {!outstanding ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-brand-success">
          <span aria-hidden>✓</span> Reviewed - Accepted or Overridden.
        </p>
      ) : overriding ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you overriding the AI proposal? (required - part of the audit trail)"
            rows={3}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() => record("overridden", reason.trim())}
              disabled={busy != null || reason.trim() === ""}
              className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
            >
              {busy === "override" ? "Saving…" : "Save override"}
            </button>
            <button
              onClick={() => {
                setOverriding(false);
                setReason("");
              }}
              className="text-xs text-brand-grey-text underline decoration-dotted hover:text-brand-gold-hover"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => record("accepted", null)}
            disabled={busy != null}
            className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
          >
            {busy === "accept" ? "Saving…" : "Accept AI proposal"}
          </button>
          <button
            onClick={() => setOverriding(true)}
            className="rounded-md border border-brand-gold px-4 py-2 text-sm font-semibold text-brand-gold transition hover:bg-brand-gold/10"
          >
            Override with reason
          </button>
        </div>
      )}
      {error && (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
