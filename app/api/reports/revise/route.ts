import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getReportData } from "@/lib/reportData";

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
      { error: "This project has no existing snapshot to revise - use Generate Reports first." },
      { status: 400 },
    );
  }

  const fresh = await getReportData(supabase, projectId);
  if (!fresh) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

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
