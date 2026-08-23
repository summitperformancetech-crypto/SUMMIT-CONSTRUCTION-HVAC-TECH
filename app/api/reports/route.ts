import { NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { createClient } from "@/lib/supabase/server";
import { getReportData, type ReportData } from "@/lib/reportData";
import { renderInternalReportHtml, renderClientScopeOfWorkHtml } from "@/lib/reportTemplates";
import { renderSummitReportHtml, type OrgBranding } from "@/lib/reportHtmlV2";
import { getReportGenerationGateStatus } from "@/lib/reportGate";
import { resolutionKey, type FieldResolution } from "@/lib/fieldResolutions";
import type { DrawingExtraction } from "@/lib/drawingExtraction";
import type { Compass8 } from "@/lib/constants/compass";
import { renderPdfPageToPngDataUri } from "@/lib/floorPlanRender";

type SnapshotRow = { version: number; snapshot_data: ReportData; reason: string | null; created_at: string };

// Data Integrity Addendum, Section 1: the first Generate Reports call for a
// project freezes a calculation_snapshots row (version 1) and every PDF
// after that - for that project - is rendered from the frozen snapshot_data,
// never live tables again, so updating equipment_catalog/climate_zone_
// reference/duct_sizing_tables/room_type_defaults/duct_insulation_code_
// minimums later can't silently change a report already delivered to a
// client or code official. A project only gets a NEW snapshot version via
// the explicit, reason-required app/api/reports/revise/route.ts action -
// never automatically here.
async function getOrCreateSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  userId: string,
): Promise<{ reportData: ReportData; snapshot: { version: number; createdAt: string; reason: string | null } } | null> {
  const { data: existing } = await supabase
    .from("calculation_snapshots")
    .select("version, snapshot_data, reason, created_at")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<SnapshotRow>();

  if (existing) {
    return {
      reportData: existing.snapshot_data,
      snapshot: { version: existing.version, createdAt: existing.created_at, reason: existing.reason },
    };
  }

  const fresh = await getReportData(supabase, projectId);
  if (!fresh) return null;

  const { data: inserted, error } = await supabase
    .from("calculation_snapshots")
    .insert({ project_id: projectId, version: 1, snapshot_data: fresh, created_by: userId })
    .select("version, created_at")
    .single<{ version: number; created_at: string }>();

  if (error || !inserted) {
    // Two near-simultaneous first-ever Generate Reports calls for the same
    // project (two techs clicking around the same time, or a slow request
    // a client gave up on but the server kept processing) can both pass
    // the "no existing snapshot" check above before either commits its
    // insert - the unique(project_id, version) constraint then rejects the
    // second one. That's not a real failure: version 1 now exists either
    // way, just written by the other request. Re-select and use it rather
    // than surfacing a 500 to a caller who did nothing wrong.
    if (error?.code === "23505") {
      const { data: raceWinner } = await supabase
        .from("calculation_snapshots")
        .select("version, snapshot_data, reason, created_at")
        .eq("project_id", projectId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle<SnapshotRow>();
      if (raceWinner) {
        return {
          reportData: raceWinner.snapshot_data,
          snapshot: {
            version: raceWinner.version,
            createdAt: raceWinner.created_at,
            reason: raceWinner.reason,
          },
        };
      }
    }
    throw new Error(`Failed to create calculation snapshot: ${error?.message ?? "unknown error"}`);
  }

  return {
    reportData: fresh,
    snapshot: { version: inserted.version, createdAt: inserted.created_at, reason: null },
  };
}

// Puppeteer here is the full package (bundles its own Chromium, works
// out of the box for local dev per CLAUDE.md's planned
// "PDF/report generation: Puppeteer via serverless function" architecture).
// Deploying this route to Vercel's serverless environment will need
// puppeteer-core + @sparticuz/chromium(-min) instead - the full Chromium
// binary this package downloads is too large for a standard Vercel
// function bundle. Flagged here rather than solved now since this app
// isn't deployed yet (see CLAUDE.md "Current Status: Early setup phase").
export async function POST(request: Request) {
  let body: { projectId?: string; type?: "internal" | "client" | "summit_standard" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { projectId, type } = body;
  if (!projectId || (type !== "internal" && type !== "client" && type !== "summit_standard")) {
    return NextResponse.json(
      { error: "projectId and type ('internal' | 'client' | 'summit_standard') are required" },
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

  // SUMMIT-REPORT-STANDARD.md Section 3/8: the gate must run BEFORE
  // snapshotting for the new report type specifically - "First report
  // generation is also the trigger for snapshotting... this is exactly
  // why generation must wait until everything is genuinely final:
  // freezing early would freeze an incomplete project." Scoped to
  // summit_standard only - the pre-existing internal/client report types
  // are unchanged, no new gate imposed on flows that already worked.
  if (type === "summit_standard") {
    const gateData = await getReportData(supabase, projectId);
    if (!gateData) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const [{ data: drawings }, { data: resolutions }] = await Promise.all([
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
    const resolvedKeys = new Set(
      (resolutions ?? []).map((r) => resolutionKey(r.table_name, r.record_id, r.field_name)),
    );
    const gate = getReportGenerationGateStatus(gateData, drawings ?? [], resolvedKeys);
    if (!gate.canGenerate) {
      return NextResponse.json({ error: "Report is not ready to generate", blockers: gate.blockers }, { status: 422 });
    }
  }

  // getOrCreateSnapshot's own queries all run through this same
  // user-session client, so the existing project-ownership/org-role RLS
  // policies gate access exactly as they do everywhere else in the app - a
  // user who can't see this project can't generate a report for it either.
  let result;
  try {
    result = await getOrCreateSnapshot(supabase, projectId, user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to finalize calculation snapshot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!result) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  // The PDF-generation timestamp is always "now" (this is a fresh render,
  // possibly of already-frozen data) - only the underlying figures are
  // ever frozen, not the rendered file's own generation time. See
  // renderInternalReportHtml/renderClientScopeOfWorkHtml for how the two
  // dates (generated vs. data-frozen-as-of) are shown separately.
  const reportData: ReportData = { ...result.reportData, generatedAt: new Date().toISOString(), snapshot: result.snapshot };

  let html: string;
  if (type === "internal") {
    html = renderInternalReportHtml(reportData);
  } else if (type === "client") {
    html = renderClientScopeOfWorkHtml(reportData);
  } else {
    const [{ data: project }, { data: drawings }] = await Promise.all([
      supabase
        .from("projects")
        .select("org_id, building_front_faces")
        .eq("id", projectId)
        .single<{ org_id: string; building_front_faces: Compass8 | null }>(),
      supabase
        .from("drawings")
        .select("id, extraction_status, extracted_data, file_path, file_type, floor_plan_page_number")
        .eq("project_id", projectId)
        .returns<
          {
            id: string;
            extraction_status: string;
            extracted_data: DrawingExtraction | null;
            file_path: string;
            file_type: "pdf" | "image";
            floor_plan_page_number: number | null;
          }[]
        >(),
    ]);
    const { data: org } = project
      ? await supabase
          .from("organizations")
          .select("name, license_number, logo_data_uri")
          .eq("id", project.org_id)
          .single<OrgBranding>()
      : { data: null };
    const orgBranding: OrgBranding = org ?? { name: "Summit", license_number: null, logo_data_uri: null };

    // SUMMIT-REPORT-STANDARD.md Section 5.9 - the drawing a human marked as
    // the floor plan (see drawings-section.tsx's "Use as report floor
    // plan" control), if any. Rendering failures here (a corrupted upload,
    // an out-of-range page number someone entered before the file was
    // replaced) must not block the rest of the report - they surface as
    // the existing "no floor plan" state rather than a 500.
    const floorPlanDrawing = drawings?.find((d) => d.floor_plan_page_number != null) ?? null;
    let floorPlanImageDataUri: string | null = null;
    if (floorPlanDrawing) {
      try {
        const { data: fileBlob, error: downloadError } = await supabase.storage
          .from("drawings")
          .download(floorPlanDrawing.file_path);
        if (downloadError || !fileBlob) throw new Error(downloadError?.message ?? "download failed");
        const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());
        floorPlanImageDataUri =
          floorPlanDrawing.file_type === "pdf"
            ? await renderPdfPageToPngDataUri(fileBuffer, floorPlanDrawing.floor_plan_page_number!)
            : `data:${fileBlob.type || "image/png"};base64,${fileBuffer.toString("base64")}`;
      } catch (err) {
        console.error("Floor plan render failed:", err instanceof Error ? err.message : err);
      }
    }

    html = renderSummitReportHtml(
      reportData,
      orgBranding,
      project?.building_front_faces ?? null,
      drawings ?? [],
      floorPlanImageDataUri,
    );
  }

  let browser;
  try {
    browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({
      format: "letter",
      printBackground: true,
      margin: { top: "0", bottom: "0.4in", left: "0", right: "0" },
    });

    const fileNameSuffix =
      type === "internal" ? "internal-engineering-report" : type === "client" ? "scope-of-work" : "load-calculation-report";
    const fileName = `${reportData.project.name.replace(/[^a-z0-9]+/gi, "-")}-${fileNameSuffix}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await browser?.close();
  }
}
