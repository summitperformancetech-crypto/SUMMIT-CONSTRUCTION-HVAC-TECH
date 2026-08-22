"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { COMPASS_8_OPTIONS, isCardinalCompass, type Compass8 } from "@/lib/constants/compass";

// Building-orientation-confirmed-before-extraction (2026-08-15). Previously
// building_front_faces was only ever confirmed AFTER extraction, via
// BuildingOrientationSection inside ManualJWorkflow - which gates the
// post-hoc "Save & Auto-Fill Walls" transform for rooms that already
// exist, but does nothing for the extraction call itself (the model still
// had to guess per room which wall was "front," the exact swap problem
// this session spent a long time diagnosing and only partially fixing
// after the fact). This is that same confirmation, moved earlier and
// required BEFORE a drawing can be uploaded at all - see
// components/project-workspace.tsx, which now gates DrawingsSection on
// this being set, and app/api/drawings/extract/route.ts, which reads the
// confirmed value and passes it into the extraction prompt as known,
// given context instead of something the model infers or guesses.
//
// Deliberately minimal compared to BuildingOrientationSection - there are
// no rooms yet at this point in a first-time project's flow (extraction
// hasn't run), so the auto-fill-existing-rooms machinery that component
// owns doesn't apply here. BuildingOrientationSection is NOT removed -
// it's still needed for re-extractions and any room that still ends up
// with unconverted drawing-relative wall data.
export function BuildingOrientationGate({
  projectId,
  initialBuildingFrontFaces,
  onConfirmed,
}: {
  projectId: string;
  initialBuildingFrontFaces: Compass8 | null;
  onConfirmed: (value: Compass8) => void;
}) {
  const [frontFaces, setFrontFaces] = useState<Compass8 | "">(initialBuildingFrontFaces ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!frontFaces) {
      setError("Choose a direction first.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("projects")
      .update({ building_front_faces: frontFaces })
      .eq("id", projectId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onConfirmed(frontFaces);
  }

  if (initialBuildingFrontFaces) {
    return (
      <div className="mb-6 flex items-center gap-2 rounded-md border border-brand-success/40 bg-brand-success/10 px-3 py-2 text-sm font-medium text-brand-success">
        Building orientation confirmed: front elevation faces {initialBuildingFrontFaces}.
      </div>
    );
  }

  return (
    <section className="mb-6 rounded-lg border border-brand-gold bg-brand-gold-base/15 p-6">
      <h2 className="mb-2 text-lg font-semibold text-brand-gold">Confirm Building Orientation</h2>
      <p className="mb-4 text-sm text-brand-silver-highlight">
        Before uploading drawings, confirm which compass direction the front exterior elevation
        faces. This is given to the AI extraction as a known, confirmed fact - not something it
        has to detect or guess per room - so front/rear/left/right wall assignment doesn&apos;t
        depend on the model correctly identifying the front entry from the drawing alone.
      </p>
      <p className="mb-4 text-xs text-brand-grey-text">
        &ldquo;Front&rdquo; is the direction a person standing outside, facing the main entry
        door, is looking - i.e. which way the front of the house looks out toward the street.
        Only the 4 cardinal directions (N/E/S/W) can be used here; an intercardinal choice (NE,
        SE, SW, NW) will be saved but can&apos;t be given to the extraction as a compass fact,
        since the room schema itself only supports N/E/S/W.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-grey-text">
            Front entry faces
          </label>
          <select
            value={frontFaces}
            onChange={(e) => setFrontFaces(e.target.value as Compass8 | "")}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
          >
            <option value="">— Select —</option>
            {COMPASS_8_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.value})
                {!isCardinalCompass(opt.value) ? " — not usable by extraction" : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleConfirm}
          disabled={saving || !frontFaces}
          className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
        >
          {saving ? "Confirming…" : "Confirm Orientation"}
        </button>
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
