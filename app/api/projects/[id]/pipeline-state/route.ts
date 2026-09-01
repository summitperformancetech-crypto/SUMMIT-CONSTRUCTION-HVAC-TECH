import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPipelineInput } from "@/lib/pipelineInput";
import { computePipelineState } from "@/lib/pipeline";

// The single readiness endpoint. buildPipelineInput -> computePipelineState
// -> JSON. Every stage component in the guided stepper re-fetches this
// after any successful write (via PipelineProvider.refreshPipeline), which
// is what makes the sections communicate: one shared state, recomputed on
// every mutation, no page reloads. Auth + RLS via the user session, exactly
// like every other route in this app.
export async function GET(
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

  return NextResponse.json({ state: computePipelineState(input) });
}
