import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPipelineInput } from "@/lib/pipelineInput";
import {
  computePipelineState,
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABEL,
} from "@/lib/pipeline";

// FIX-PIPELINE: kept for parity / external callers, but it now delegates to
// the one state machine (computePipelineState). "Can generate a report" ==
// "the project can be Finalized" under the new model - you cannot render a
// report until the project is Finalized, and you cannot Finalize until
// every stage gate is green and every AI proposal is resolved. The guided
// stepper reads pipeline state from context and does not call this route.
export async function POST(request: Request) {
  let body: { projectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { projectId } = body;
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const input = await buildPipelineInput(supabase, projectId);
  if (!input) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const state = computePipelineState(input);
  const blockers: { label: string; detail: string }[] = [];
  for (const stage of PIPELINE_STAGES) {
    if (stage === "finalize") continue;
    for (const b of state.stages[stage].blockers) {
      blockers.push({ label: PIPELINE_STAGE_LABEL[stage], detail: b });
    }
  }
  for (const p of state.outstandingProposalList) {
    blockers.push({ label: "Unreviewed AI proposal", detail: p.label });
  }

  return NextResponse.json({ canGenerate: state.finalized, canFinalize: state.canFinalize, blockers, state });
}
