import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getReportData } from "@/lib/reportData";
import { attachFrozenImages } from "@/lib/reportImages";
import { buildPipelineInput } from "@/lib/pipelineInput";
import { computePipelineState, PIPELINE_STAGES, PIPELINE_STAGE_LABEL } from "@/lib/pipeline";

// Data Integrity Addendum, Section 1, point 5: legitimate corrections to an
// already-finalized project must be an explicit user action that creates a
// new, separately-dated snapshot version with a visible reason logged -
// never a silent recalculation triggered by a background reference-data
// update. This is that explicit action - always computes fresh live data
// and always requires a non-empty reason. It does not render a PDF itself;
// the next Generate Reports call (app/api/reports/route.ts) picks up this
// new latest version automatically.
export async function POST(request: Request) {
  let body: { projectId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { projectId, reason } = body;
  if (!projectId || !reason || reason.trim().length === 0) {
    return NextResponse.json(
      { error: "projectId and a non-empty reason are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: latest } = await supabase
    .from("calculation_snapshots")
    .select("version")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();

  if (!latest) {
    return NextResponse.json(
      { error: "This project has no existing snapshot to revise - Finalize the project first." },
      { status: 400 },
    );
  }

  // FIX-PIPELINE: a revision re-freezes calculation from live data, so it
  // must re-clear the same gate a first Finalize does - a legitimate
  // correction still has to leave the project in a fully valid state.
  const pipelineInput = await buildPipelineInput(supabase, projectId);
  if (!pipelineInput) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const state = computePipelineState(pipelineInput);
  if (!state.canFinalize) {
    const blockers: string[] = [];
    for (const stage of PIPELINE_STAGES) {
      for (const b of state.stages[stage].blockers) blockers.push(`${PIPELINE_STAGE_LABEL[stage]}: ${b}`);
    }
    for (const p of state.outstandingProposalList) blockers.push(`Unreviewed AI proposal: ${p.label}`);
    return NextResponse.json(
      { error: "Project is not in a valid state to revise.", blockers },
      { status: 422 },
    );
  }

  const freshData = await getReportData(supabase, projectId);
  if (!freshData) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  // Re-render/re-freeze the Floor Plan and duct-routing images for this
  // new version too - see lib/reportImages.ts's module comment. A
  // revision might be happening specifically BECAUSE a pin moved or a
  // drawing was replaced, so the new version's images must reflect
  // current state, not carry the old version's frozen ones forward.
  const fresh = await attachFrozenImages(supabase, projectId, freshData);

  const { data: inserted, error } = await supabase
    .from("calculation_snapshots")
    .insert({
      project_id: projectId,
      version: latest.version + 1,
      snapshot_data: fresh,
      reason: reason.trim(),
      created_by: user.id,
    })
    .select("version, created_at")
    .single<{ version: number; created_at: string }>();

  if (error || !inserted) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create revision" },
      { status: 500 },
    );
  }

  return NextResponse.json({ version: inserted.version, createdAt: inserted.created_at });
}
