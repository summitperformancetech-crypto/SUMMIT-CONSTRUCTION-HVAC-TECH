"use client";

import { useState } from "react";
import { ReportGenerationGate } from "@/components/report-generation-gate";

export type SnapshotStatus = { version: number; createdAt: string; reason: string | null };

async function downloadReport(
  projectId: string,
  type: "internal" | "client" | "summit_standard",
  version?: number,
) {
  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, type, ...(version != null ? { version } : {}) }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Report generation failed" }));
    throw new Error(body.error ?? "Report generation failed");
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="(.+)"/);
  const fileName = match?.[1] ?? `${type}${version != null ? `-v${version}` : ""}-report.pdf`;

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
  userRole,
}: {
  projectId: string;
  // Data Integrity Addendum, Section 1 - null means this project has no
  // calculation_snapshots row yet (still unfinalized, live data). The
  // first report download freezes one; see app/api/reports/route.ts.
  initialSnapshot: SnapshotStatus | null;
  // Field Tech = data entry only: cannot finalize (first-ever generate) or
  // revise a report. Downloading an already-finalized report is still
  // allowed - that's a read of frozen data, not a finalize/revise action.
  // The real boundary is the calculation_snapshots INSERT policy (see
  // 20260822190000_restrict_field_tech_equipment_and_reports.sql); this
  // just avoids surfacing a raw RLS error to a Field Tech who clicks it.
  userRole: string;
}) {
  const [generating, setGenerating] = useState<"internal" | "client" | "summit_standard" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [revising, setRevising] = useState(false);
  const [summitStandardReady, setSummitStandardReady] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<SnapshotStatus[] | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [downloadingVersion, setDownloadingVersion] = useState<number | null>(null);
  const canFinalizeOrRevise = userRole === "admin" || userRole === "estimator";
  // FIX-PIPELINE: reports render only from a frozen snapshot, and a
  // snapshot only exists once the project has been Finalized (POST
  // /api/projects/[id]/finalize). No download ever freezes one.
  const generateDisabled = generating !== null || !snapshot;

  async function handleGenerate(type: "internal" | "client" | "summit_standard") {
    setGenerating(type);
    setError(null);
    try {
      await downloadReport(projectId, type);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed");
    } finally {
      setGenerating(null);
    }
  }

  async function handleToggleVersionHistory() {
    const opening = !versionHistoryOpen;
    setVersionHistoryOpen(opening);
    if (opening && versions == null) {
      setVersionsLoading(true);
      try {
        const res = await fetch(`/api/reports/versions?projectId=${projectId}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load version history");
        setVersions(body.versions);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load version history");
      } finally {
        setVersionsLoading(false);
      }
    }
  }

  async function handleDownloadVersion(version: number) {
    setDownloadingVersion(version);
    setError(null);
    try {
      await downloadReport(projectId, "summit_standard", version);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed");
    } finally {
      setDownloadingVersion(null);
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
          disabled={generateDisabled}
          title={!snapshot ? "Finalize the project first" : undefined}
          className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
        >
          {generating === "internal" ? "Generating…" : "Internal Engineering Report"}
        </button>
        <button
          onClick={() => handleGenerate("client")}
          disabled={generateDisabled}
          title={!snapshot ? "Finalize the project first" : undefined}
          className="rounded-md border border-brand-gold px-4 py-2 text-sm font-semibold text-brand-gold transition hover:bg-brand-gold/10 disabled:opacity-50"
        >
          {generating === "client" ? "Generating…" : "Client Scope of Work"}
        </button>
        {snapshot && canFinalizeOrRevise && (
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
          : "Not yet finalized — use the Finalize Project button above. Reports cannot be generated until the project is finalized; the freeze happens there, never on a download."}
      </p>

      <div className="mt-6 border-t border-brand-gold/30 pt-5">
        <h3 className="mb-1 text-sm font-semibold text-brand-gold">
          Summit Report Standard (SUMMIT-REPORT-STANDARD.md)
        </h3>
        <p className="mb-3 text-xs text-brand-grey-text">
          The full 12-page branded client report - cover, per-system summaries, load short
          forms, building analysis, orientation, floor plan, duct routing, and the automated QA
          audit trail. Cannot generate until every Section 3 gate condition below is met.
        </p>
        <ReportGenerationGate projectId={projectId} onReady={setSummitStandardReady} />
        <button
          onClick={() => handleGenerate("summit_standard")}
          disabled={generating !== null || !summitStandardReady || !snapshot}
          title={!snapshot ? "Finalize the project first" : undefined}
          className="mt-3 rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating === "summit_standard" ? "Generating…" : "Generate Summit Standard Report"}
        </button>

        {snapshot && (
          <div className="mt-4">
            <button
              onClick={handleToggleVersionHistory}
              className="text-xs text-brand-grey-text underline decoration-dotted transition hover:text-brand-gold-hover"
            >
              {versionHistoryOpen ? "Hide" : "View"} version history
            </button>
            {versionHistoryOpen && (
              <div className="mt-2 rounded-md border border-zinc-700 bg-zinc-900/50 p-3">
                {versionsLoading && <p className="text-xs text-brand-grey-text">Loading…</p>}
                {versions && versions.length === 0 && (
                  <p className="text-xs text-brand-grey-text">No versions found.</p>
                )}
                {versions && versions.length > 0 && (
                  <ul className="space-y-1">
                    {versions.map((v) => (
                      <li key={v.version} className="flex items-center justify-between text-xs">
                        <span className="text-brand-silver-highlight">
                          v{v.version} — {new Date(v.createdAt).toLocaleString()}
                          {v.reason ? ` — ${v.reason}` : ""}
                        </span>
                        <button
                          onClick={() => handleDownloadVersion(v.version)}
                          disabled={downloadingVersion === v.version}
                          className="rounded-md border border-brand-gold/50 px-2 py-0.5 text-brand-gold hover:border-brand-gold disabled:opacity-50"
                        >
                          {downloadingVersion === v.version ? "Downloading…" : "Download this version"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[10px] text-brand-grey-text">
                  Every version is the exact data frozen at the time it was generated - downloading an
                  older version never reflects later edits or revisions.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
