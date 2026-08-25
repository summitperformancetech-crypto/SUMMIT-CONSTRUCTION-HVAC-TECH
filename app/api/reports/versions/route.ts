import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Data Integrity Addendum, Section 1: calculation_snapshots rows are
// never deleted or mutated (see app/api/reports/route.ts's
// getOrCreateSnapshot and app/api/reports/revise/route.ts) - every past
// version genuinely still exists in the DB, but until this route nothing
// in the app ever listed or offered to view anything but the latest.
// This is that missing "view a previous version" access point.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
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

  const { data, error } = await supabase
    .from("calculation_snapshots")
    .select("version, created_at, reason")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .returns<{ version: number; created_at: string; reason: string | null }[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ versions: data ?? [] });
}
