import { NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { createClient } from "@/lib/supabase/server";
import { getReportData, type ReportData } from "@/lib/reportData";
import { renderInternalReportHtml, renderClientScopeOfWorkHtml } from "@/lib/reportTemplates";

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
  let body: { projectId?: string; type?: "internal" | "client" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { projectId, type } = body;
  if (!projectId || (type !== "internal" && type !== "client")) {
    return NextResponse.json(
      { error: "projectId and type ('internal' | 'client') are required" },
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

  const html =
    type === "internal" ? renderInternalReportHtml(reportData) : renderClientScopeOfWorkHtml(reportData);

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

    const fileNameSuffix = type === "internal" ? "internal-engineering-report" : "scope-of-work";
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
