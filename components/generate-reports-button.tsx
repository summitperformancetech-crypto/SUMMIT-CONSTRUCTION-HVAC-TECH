"use client";

import { useState } from "react";

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

export function GenerateReportsButton({ projectId }: { projectId: string }) {
  const [generating, setGenerating] = useState<"internal" | "client" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(type: "internal" | "client") {
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

  return (
    <section className="mb-6 rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
      <h2 className="mb-4 text-lg font-semibold text-brand-gold">Generate Reports</h2>
      {error && (
        <p className="mb-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
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
      </div>
      <p className="mt-3 text-xs text-brand-grey-text">
        Both PDFs are generated from the same underlying project data - the internal report
        includes full load calculation detail and the AI-extraction audit trail; the client
        scope of work is plain-language and Summit-branded, with no internal detail.
      </p>
    </section>
  );
}
