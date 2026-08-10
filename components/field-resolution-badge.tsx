"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FIELD_RESOLUTION_COLUMNS, type FieldResolution } from "@/lib/fieldResolutions";

export function FieldResolutionBadge({
  projectId,
  tableName,
  recordId,
  fieldName,
  aiExtractedValue,
  resolution,
  onResolved,
}: {
  projectId: string;
  tableName: string;
  recordId: string;
  fieldName: string;
  aiExtractedValue: string | null;
  resolution: FieldResolution | undefined;
  onResolved: (resolution: FieldResolution) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftValue, setDraftValue] = useState(aiExtractedValue ?? "");
  const [overrideReason, setOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already resolved: RESOLVED badge, visually distinct accepted vs
  // overridden (the audit trail needs to be visible at a glance).
  if (resolution) {
    const accepted = resolution.resolution_type === "accepted";
    return (
      <span
        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
          accepted
            ? "border-emerald-600/40 text-emerald-400"
            : "border-sky-500/40 text-sky-400"
        }`}
        title={
          accepted
            ? "Resolved: AI-extracted value accepted as-is"
            : `Resolved: overridden — ${resolution.override_reason}`
        }
      >
        {accepted ? "Resolved" : "Resolved (overridden)"}
      </span>
    );
  }

  // A null/empty AI value means extraction found nothing usable (e.g. no
  // R-value was labeled on the drawing) - that's a hard failure, not a
  // low-confidence guess, so "Accept AI Value" must not be offered. Only
  // manual entry via Override is valid here.
  const hasAiValue = aiExtractedValue != null && aiExtractedValue.trim() !== "";
  const valueDiffers = draftValue.trim() !== (aiExtractedValue ?? "").trim();

  async function save(type: "accepted" | "overridden") {
    setError(null);
    if (type === "overridden" && overrideReason.trim() === "") {
      setError("An override reason is required.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be signed in.");
      setSaving(false);
      return;
    }
    const { data, error: insertError } = await supabase
      .from("field_resolutions")
      .insert({
        project_id: projectId,
        table_name: tableName,
        record_id: recordId,
        field_name: fieldName,
        ai_extracted_value: aiExtractedValue,
        final_value: type === "accepted" ? aiExtractedValue : draftValue,
        resolution_type: type,
        override_reason: type === "overridden" ? overrideReason.trim() : null,
        resolved_by: user.id,
      })
      .select(FIELD_RESOLUTION_COLUMNS)
      .single<FieldResolution>();
    setSaving(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Failed to save.");
      return;
    }
    onResolved(data);
    setOpen(false);
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-500 transition hover:border-amber-400 hover:bg-amber-500/10"
      >
        Unresolved
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-10 w-72 space-y-3 rounded-md border border-zinc-700 bg-zinc-900 p-3 text-left shadow-lg">
          <div>
            <p className="text-xs text-zinc-400">AI-extracted value</p>
            <p className="text-sm text-zinc-100">
              {hasAiValue ? aiExtractedValue : "(none — extraction found no usable value)"}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Value</label>
            <input
              type="text"
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-amber-500"
            />
          </div>
          {valueDiffers && (
            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                Override reason (required)
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-amber-500"
              />
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || !hasAiValue}
              onClick={() => save("accepted")}
              title={!hasAiValue ? "No AI value was extracted — enter one manually and use Override" : undefined}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-amber-400 disabled:opacity-40"
            >
              Accept AI Value
            </button>
            <button
              type="button"
              disabled={saving || !valueDiffers}
              onClick={() => save("overridden")}
              title={!valueDiffers ? "Edit the value above to enable Override" : undefined}
              className="rounded-md border border-sky-500/50 px-3 py-1.5 text-xs font-semibold text-sky-400 transition hover:bg-sky-500/10 disabled:opacity-40"
            >
              Override
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
