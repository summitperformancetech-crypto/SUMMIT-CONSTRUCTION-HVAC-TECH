import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPipelineInput } from "@/lib/pipelineInput";
import { computePipelineState, PIPELINE_STAGES, PIPELINE_STAGE_LABEL } from "@/lib/pipeline";
import { getReportData, type ReportData } from "@/lib/reportData";
import { attachFrozenImages } from "@/lib/reportImages";

// FIX-PIPELINE: the ONLY path that freezes a first calculation_snapshots
// row. POST /api/reports no longer creates one - it returns 409 until this
// route has run. Revisions (POST /api/reports/revise) create vN+1 and
// re-run the same gate.
//
// Idempotent: a project already finalized returns its existing v1 instead
// of erroring or double-freezing.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const input = await buildPipelineInput(supabase, id);
  if (!input) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const state = computePipelineState(input);

  if (state.finalized && input.latestSnapshotVersion != null) {
    return NextResponse.json({
      finalized: true,
      alreadyFinalized: true,
      version: input.latestSnapshotVersion,
    });
  }

  if (!state.canFinalize) {
    return NextResponse.json(
      { error: "Project is not ready to finalize.", blockers: collectBlockers(state) },
      { status: 422 },
    );
  }

  const freshData = await getReportData(supabase, id);
  if (!freshData) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const frozen: ReportData = await attachFrozenImages(supabase, id, freshData);

  const { data: inserted, error } = await supabase
    .from("calculation_snapshots")
    .insert({ project_id: id, version: 1, snapshot_data: frozen, created_by: user.id })
    .select("version, created_at")
    .single<{ version: number; created_at: string }>();

  let version = inserted?.version ?? null;
  if (error) {
    // Two near-simultaneous Finalize clicks - the unique(project_id,
    // version) constraint rejects the second. v1 exists either way.
    if (error.code === "23505") {
      const { data: raceWinner } = await supabase
        .from("calculation_snapshots")
        .select("version")
        .eq("project_id", id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle<{ version: number }>();
      version = raceWinner?.version ?? 1;
    } else {
      return NextResponse.json(
        { error: `Failed to freeze calculation snapshot: ${error.message}` },
        { status: 500 },
      );
    }
  }

  const { error: finalizeError } = await supabase
    .from("projects")
    .update({ finalized_at: new Date().toISOString() })
    .eq("id", id);
  if (finalizeError) {
    return NextResponse.json(
      { error: `Snapshot frozen but failed to mark project finalized: ${finalizeError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ finalized: true, version: version ?? 1 });
}

function collectBlockers(state: ReturnType<typeof computePipelineState>): string[] {
  const out: string[] = [];
  for (const stage of PIPELINE_STAGES) {
    for (const b of state.stages[stage].blockers) {
      out.push(`${PIPELINE_STAGE_LABEL[stage]}: ${b}`);
    }
  }
  for (const p of state.outstandingProposalList) {
    out.push(`Unreviewed AI proposal: ${p.label}`);
  }
  return out;
}
