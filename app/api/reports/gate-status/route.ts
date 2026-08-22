import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getReportData } from "@/lib/reportData";
import { getReportGenerationGateStatus } from "@/lib/reportGate";
import { resolutionKey, type FieldResolution } from "@/lib/fieldResolutions";
import type { DrawingExtraction } from "@/lib/drawingExtraction";

// Small, server-side endpoint so components/report-generation-gate.tsx
// (a client component) doesn't have to import getReportData - and with
// it, the whole computeManualJ/computeManualD/evaluateEquipment calc
// engine - into the client bundle just to check readiness. Mirrors what
// app/api/reports/route.ts already does server-side for the actual
// render; this just returns the checklist, not a rendered report.
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

  const [data, { data: drawings }, { data: resolutions }] = await Promise.all([
    getReportData(supabase, projectId),
    supabase
      .from("drawings")
      .select("id, extraction_status, extracted_data")
      .eq("project_id", projectId)
      .returns<{ id: string; extraction_status: string; extracted_data: DrawingExtraction | null }[]>(),
    supabase
      .from("field_resolutions")
      .select(
        "id, project_id, table_name, record_id, field_name, ai_extracted_value, final_value, resolution_type, override_reason, resolved_by, resolved_at",
      )
      .eq("project_id", projectId)
      .returns<FieldResolution[]>(),
  ]);

  if (!data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const resolvedKeys = new Set(
    (resolutions ?? []).map((r) => resolutionKey(r.table_name, r.record_id, r.field_name)),
  );
  const status = getReportGenerationGateStatus(data, drawings ?? [], resolvedKeys);
  return NextResponse.json(status);
}
