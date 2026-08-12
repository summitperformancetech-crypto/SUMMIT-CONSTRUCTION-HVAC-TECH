import { NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { createClient } from "@/lib/supabase/server";
import { getReportData } from "@/lib/reportData";
import { renderInternalReportHtml, renderClientScopeOfWorkHtml } from "@/lib/reportTemplates";

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

  // getReportData's own queries all run through this same user-session
  // client, so the existing project-ownership/org-role RLS policies gate
  // access exactly as they do everywhere else in the app - a user who
  // can't see this project can't generate a report for it either.
  const reportData = await getReportData(supabase, projectId);
  if (!reportData) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

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
