"use client";

import { useState } from "react";

export type SnapshotStatus = { version: number; createdAt: string; reason: string | null };

async function downloadReport(projectId: string, type: "internal" | "client") {
  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, type }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Report generation failed" }));
    throw new Error(body.error ?? "Report generation failed");
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="(.+)"/);
  const fileName = match?.[1] ?? `${type}-report.pdf`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function createRevision(projectId: string, reason: string): Promise<SnapshotStatus> {
  const res = await fetch("/api/reports/revise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, reason }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Failed to create revision");
  return { version: body.version, createdAt: body.createdAt, reason };
}

export function GenerateReportsButton({
  projectId,
  initialSnapshot,
}: {
  projectId: string;
  // Data Integrity Addendum, Section 1 - null means this project has no
  // calculation_snapshots row yet (still unfinalized, live data). The
  // first report download freezes one; see app/api/reports/route.ts.
  initialSnapshot: SnapshotStatus | null;
}) {
  const [generating, setGenerating] = useState<"internal" | "client" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [revising, setRevising] = useState(false);

  async function handleGenerate(type: "internal" | "client") {
    setGenerating(type);
    setError(null);
    try {
      await downloadReport(projectId, type);
      // The first download of any type finalizes version 1 server-side -
      // reflect that in the status line immediately rather than only
      // after the next full page load.
      if (!snapshot) setSnapshot({ version: 1, createdAt: new Date().toISOString(), reason: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed");
    } finally {
      setGenerating(null);
    }
  }

  async function handleReviseClick() {
    const reason = window.prompt(
      "Reason for this revision (required - becomes part of the permanent audit trail):",
    );
    if (!reason || reason.trim().length === 0) return;
    setRevising(true);
    setError(null);
    try {
      const updated = await createRevision(projectId, reason.trim());
      setSnapshot(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create revision");
    } finally {
      setRevising(false);
    }
  }

  return (
    <section className="mb-6 rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
      <h2 className="mb-4 text-lg font-semibold text-brand-gold">Generate Reports</h2>
      {error && (
        <p className="mb-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => handleGenerate("internal")}
          disabled={generating !== null}
          className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
        >
          {generating === "internal" ? "Generating…" : "Internal Engineering Report"}
        </button>
        <button
          onClick={() => handleGenerate("client")}
          disabled={generating !== null}
          className="rounded-md border border-brand-gold px-4 py-2 text-sm font-semibold text-brand-gold transition hover:bg-brand-gold/10 disabled:opacity-50"
        >
          {generating === "client" ? "Generating…" : "Client Scope of Work"}
        </button>
        {snapshot && (
          <button
            onClick={handleReviseClick}
            disabled={revising}
            className="text-xs text-brand-grey-text underline decoration-dotted transition hover:text-brand-gold-hover disabled:opacity-50"
          >
            {revising ? "Creating revision…" : "Create New Revision"}
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-brand-grey-text">
        Both PDFs are generated from the same underlying project data - the internal report
        includes full load calculation detail and the AI-extraction audit trail; the client
        scope of work is plain-language and Summit-branded, with no internal detail.
      </p>
      <p className="mt-2 text-xs text-brand-grey-text">
        {snapshot
          ? `Finalized as of ${new Date(snapshot.createdAt).toLocaleString()} (v${snapshot.version}${snapshot.reason ? ` — ${snapshot.reason}` : ""}). Reports always reflect this frozen data, not live edits, until a new revision is created.`
          : "Not yet finalized — the first report you download freezes today's calculations. Later reference-data updates (new equipment models, corrected duct tables, etc.) will never silently change this project's reports once that happens."}
      </p>
    </section>
  );
}
