import { NextResponse } from "next/server";
import { launchBrowser } from "@/lib/browser";
import { createClient } from "@/lib/supabase/server";
import { type ReportData } from "@/lib/reportData";
import { renderInternalReportHtml, renderClientScopeOfWorkHtml } from "@/lib/reportTemplates";
import { renderSummitReportHtml, type OrgBranding } from "@/lib/reportHtmlV2";
import { buildPipelineInput } from "@/lib/pipelineInput";
import { computePipelineState } from "@/lib/pipeline";
import type { DrawingExtraction } from "@/lib/drawingExtraction";
import type { Compass8 } from "@/lib/constants/compass";

type SnapshotRow = { version: number; snapshot_data: ReportData; reason: string | null; created_at: string };

// FIX-PIPELINE: this route NEVER freezes a snapshot. A first snapshot is
// frozen only by POST /api/projects/[id]/finalize (which runs the full
// pipeline gate first); subsequent versions only by POST
// /api/reports/revise. If a project has no snapshot yet, this route returns
// 409 - the technician must click Finalize Project. Every PDF renders from
// already-frozen snapshot_data, so updating reference data later can never
// silently change a delivered report.
async function getExistingSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<{ reportData: ReportData; snapshot: { version: number; createdAt: string; reason: string | null } } | null> {
  const { data: existing } = await supabase
    .from("calculation_snapshots")
    .select("version, snapshot_data, reason, created_at")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<SnapshotRow>();

  if (!existing) return null;
  return {
    reportData: existing.snapshot_data,
    snapshot: { version: existing.version, createdAt: existing.created_at, reason: existing.reason },
  };
}

// "View previous version" (Data Integrity Addendum, Section 1) - loads
// one specific already-existing snapshot version exactly as originally
// frozen, never creates one. A version that doesn't exist for this
// project (never generated, or a typo) returns null rather than falling
// back to latest - viewing "whatever's closest" instead of the version
// actually asked for would defeat the point of a version picker.
async function getSnapshotVersion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  version: number,
): Promise<{ reportData: ReportData; snapshot: { version: number; createdAt: string; reason: string | null } } | null> {
  const { data } = await supabase
    .from("calculation_snapshots")
    .select("version, snapshot_data, reason, created_at")
    .eq("project_id", projectId)
    .eq("version", version)
    .maybeSingle<SnapshotRow>();
  if (!data) return null;
  return {
    reportData: data.snapshot_data,
    snapshot: { version: data.version, createdAt: data.created_at, reason: data.reason },
  };
}

export async function POST(request: Request) {
  let body: { projectId?: string; type?: "internal" | "client" | "summit_standard"; version?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { projectId, type, version } = body;
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

  // FIX-PIPELINE: this route no longer freezes anything. A report can only
  // be rendered from an existing frozen snapshot, and a snapshot only
  // exists once the project has been Finalized (POST
  // /api/projects/[id]/finalize, which runs the full pipeline gate).
  // Defense-in-depth: recompute the pipeline state and refuse if the
  // project is not finalized, for all three report types - the primary
  // signal is "a snapshot exists", this catches the (post-migration
  // shouldn't-happen) case of a snapshot row without finalized_at.
  if (version == null) {
    const pipelineInput = await buildPipelineInput(supabase, projectId);
    if (!pipelineInput) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const state = computePipelineState(pipelineInput);
    if (!state.finalized || pipelineInput.latestSnapshotVersion == null) {
      return NextResponse.json(
        { error: "Project not finalized - click Finalize Project first.", blockers: state.stages.finalize.blockers },
        { status: 409 },
      );
    }
  }

  // All queries run through this same user-session client, so the existing
  // project-ownership/org-role RLS policies gate access exactly as they do
  // everywhere else - a user who can't see this project can't generate a
  // report for it either.
  let result;
  try {
    result =
      version != null
        ? await getSnapshotVersion(supabase, projectId, version)
        : await getExistingSnapshot(supabase, projectId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load calculation snapshot";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!result) {
    return NextResponse.json(
      version != null
        ? { error: `Version ${version} does not exist for this project` }
        : { error: "Project not finalized - click Finalize Project first." },
      { status: version != null ? 404 : 409 },
    );
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

    // Floor Plan / duct-routing images are read straight off reportData
    // now (frozen into snapshot_data at snapshot-creation time by
    // lib/reportImages.ts's attachFrozenImages) rather than re-fetched
    // live here on every render - see that module's comment for why: a
    // live re-fetch meant re-rendering an OLD version's PDF could pick up
    // a drawing that was replaced or re-marked after that version was
    // generated, silently defeating the whole point of versioning.
    html = renderSummitReportHtml(
      reportData,
      orgBranding,
      project?.building_front_faces ?? null,
      drawings ?? [],
      reportData.floorPlanImageDataUri,
    );
  }

  let browser;
  try {
    browser = await launchBrowser();
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
