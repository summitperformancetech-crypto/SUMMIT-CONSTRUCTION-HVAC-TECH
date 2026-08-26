"use client";

// Permit-Submittable Manual D Package, Section 7 - the licensed sign-off
// gate, built into the workflow (not just the report output). A sign-off
// only ever attaches to a specific, already-frozen calculation_snapshots
// version - you cannot sign off live/unfrozen data, since "reviewed and
// approved" has to mean a specific, unchanging set of numbers was
// reviewed. See lib/reportHtmlV2.ts's renderSignOffBanner for how this
// shows up (or doesn't) on every page of the generated PDF.
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SnapshotStatus } from "@/components/generate-reports-button";

export type ReportSignOffRow = {
  id: string;
  calculation_snapshot_version: number;
  reviewer_name: string;
  reviewer_license_number: string;
  reviewer_license_type: string | null;
  signed_at: string;
};

export function ReportSignOffSection({
  projectId,
  latestSnapshot,
  initialSignOffs,
  userRole,
}: {
  projectId: string;
  latestSnapshot: SnapshotStatus | null;
  initialSignOffs: ReportSignOffRow[];
  userRole: string;
}) {
  const [signOffs, setSignOffs] = useState<ReportSignOffRow[]>(initialSignOffs);
  const [reviewerName, setReviewerName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseType, setLicenseType] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSignOff = userRole === "admin" || userRole === "estimator";
  const activeSignOff = latestSnapshot
    ? signOffs.find((s) => s.calculation_snapshot_version === latestSnapshot.version)
    : null;

  async function handleSignOff() {
    if (!latestSnapshot) return;
    setSaving(true);
    setError(null);
    try {
      if (!reviewerName.trim() || !licenseNumber.trim()) {
        setError("Reviewer name and license number are both required.");
        return;
      }
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("You must be signed in.");
        return;
      }
      const { data, error: insertError } = await supabase
        .from("report_sign_offs")
        .insert({
          project_id: projectId,
          calculation_snapshot_version: latestSnapshot.version,
          reviewer_name: reviewerName.trim(),
          reviewer_license_number: licenseNumber.trim(),
          reviewer_license_type: licenseType.trim() || null,
          signed_by: user.id,
        })
        .select("id, calculation_snapshot_version, reviewer_name, reviewer_license_number, reviewer_license_type, signed_at")
        .single<ReportSignOffRow>();
      if (insertError || !data) {
        setError(insertError?.message ?? "Failed to record sign-off.");
        return;
      }
      setSignOffs((prev) => [...prev, data]);
      setReviewerName("");
      setLicenseNumber("");
      setLicenseType("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record sign-off - check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
      <h2 className="mb-2 text-lg font-semibold text-brand-gold">Licensed Review &amp; Sign-Off</h2>
      <p className="mb-4 text-xs text-brand-grey-text">
        This package is not permit-ready until a licensed reviewer signs off here against the current report
        version. An unsigned report always renders with a visible DRAFT banner on every page - regardless of how
        many automated design checks it passed.
      </p>

      {!latestSnapshot ? (
        <p className="text-sm text-brand-grey-text">Generate a report first - sign-off attaches to a specific frozen version.</p>
      ) : activeSignOff ? (
        <div className="rounded-md border border-green-700 bg-green-950/30 p-4 text-sm">
          <p className="font-semibold text-green-400">Reviewed and approved for v{activeSignOff.calculation_snapshot_version}</p>
          <p className="mt-1 text-brand-grey-text">
            {activeSignOff.reviewer_name}, License #{activeSignOff.reviewer_license_number}
            {activeSignOff.reviewer_license_type ? ` (${activeSignOff.reviewer_license_type})` : ""} —{" "}
            {new Date(activeSignOff.signed_at).toLocaleString()}
          </p>
        </div>
      ) : canSignOff ? (
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-xs text-amber-400">
            Current report is v{latestSnapshot.version} and has not been signed off yet.
          </p>
          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-grey-text">Reviewer name</label>
              <input
                type="text"
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-grey-text">License number</label>
              <input
                type="text"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-grey-text">License type (e.g. TACLB)</label>
              <input
                type="text"
                value={licenseType}
                onChange={(e) => setLicenseType(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
              />
            </div>
          </div>
          <button
            onClick={handleSignOff}
            disabled={saving || !reviewerName.trim() || !licenseNumber.trim()}
            className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
          >
            {saving ? "Recording..." : `Sign & Approve v${latestSnapshot.version}`}
          </button>
        </div>
      ) : (
        <p className="text-sm text-brand-grey-text">Only an admin or estimator can record a sign-off.</p>
      )}

      {signOffs.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase text-brand-grey-text">Sign-off history</h3>
          <ul className="space-y-1 text-xs text-brand-grey-text">
            {signOffs
              .slice()
              .sort((a, b) => b.calculation_snapshot_version - a.calculation_snapshot_version)
              .map((s) => (
                <li key={s.id}>
                  v{s.calculation_snapshot_version} — {s.reviewer_name}, License #{s.reviewer_license_number} —{" "}
                  {new Date(s.signed_at).toLocaleDateString()}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
