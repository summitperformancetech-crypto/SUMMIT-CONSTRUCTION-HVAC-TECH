import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  EXTRACTION_PROMPT,
  collectUnresolvedItems,
  applyDuctFallbackDefaults,
  flagWaterHeaterLoadRisk,
  flagRoomCeilingHeightConflicts,
  flagWindowScheduleForVerification,
  verifyEnvelopeConflictDisclaimers,
  flagCeilingInsulationRValueConflicts,
  roomsNeedingCeilingHeightFollowUp,
  sheetsNeedingInsulationCalloutFollowUp,
  buildFollowUpPrompt,
  mergeFollowUpResponse,
  type DrawingExtraction,
  type FollowUpResponse,
} from "@/lib/drawingExtraction";

// Real, measured: a full extraction call against a dense 13-sheet set
// took 222.5s (diagnosed 2026-08-14 verifying the switch to streaming
// below). Serverless platforms enforce their OWN function-execution
// timeout independent of the Anthropic SDK's now-removed non-streaming
// ceiling - Vercel's unconfigured default varies by plan tier (as low as
// 10s on Hobby) and would kill this route mid-stream long before a call
// like that finishes. 300s is a reasonable, common ceiling for a
// long-running AI call, but this repo has no vercel.json or other
// config indicating the actual plan tier in use - flagged rather than
// assumed: confirm this project's Vercel plan allows a 300s function
// duration (Hobby does not; Pro does with this explicit opt-in;
// Enterprise can go higher) and adjust if not.
export const maxDuration = 300;

type SupportedImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const IMAGE_MEDIA_TYPE_BY_EXTENSION: Record<string, SupportedImageMediaType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

// drawings.file_type only ever stores the literal 'pdf' or 'image' — the
// concrete image format has to be recovered from the uploaded file's name.
function imageMediaTypeFromFileName(fileName: string): SupportedImageMediaType | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension ? (IMAGE_MEDIA_TYPE_BY_EXTENSION[extension] ?? null) : null;
}

function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

export async function POST(request: Request) {
  let body: { drawingId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { drawingId } = body;
  if (!drawingId) {
    return NextResponse.json({ error: "drawingId is required" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // This select and every write below run through the user's own session,
  // so the existing RLS policies (project ownership / org role) apply as-is.
  const { data: drawing, error: drawingError } = await supabase
    .from("drawings")
    .select("id, project_id, file_name, file_path, file_type")
    .eq("id", drawingId)
    .maybeSingle();

  if (drawingError || !drawing) {
    return NextResponse.json({ error: "Drawing not found" }, { status: 404 });
  }

  const isPdf = drawing.file_type === "pdf";
  const imageMediaType = isPdf ? null : imageMediaTypeFromFileName(drawing.file_name);

  if (!isPdf && !imageMediaType) {
    await supabase
      .from("drawings")
      .update({ extraction_status: "failed" })
      .eq("id", drawingId);
    return NextResponse.json(
      {
        error:
          "This file type isn't supported for AI extraction. Upload a PDF, PNG, JPEG, GIF, or WEBP.",
      },
      { status: 422 },
    );
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("drawings")
    .download(drawing.file_path);

  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: "Could not download the file" }, { status: 500 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server" },
      { status: 500 },
    );
  }

  const base64 = Buffer.from(await fileBlob.arrayBuffer()).toString("base64");
  const anthropic = new Anthropic({ apiKey });

  // Built once, reused for both the main extraction call and the
  // conditional follow-up call below - both need the same document/image
  // attached, just a different text prompt alongside it.
  const documentContentBlock = isPdf
    ? ({
        type: "document" as const,
        source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 },
      })
    : ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: imageMediaType!,
          data: base64,
        },
      });

  let rawText: string;
  let stopReason: string | null;
  let outputTokens: number | undefined;
  try {
    // History of this max_tokens value, kept for context on why streaming
    // was the eventual fix rather than another number bump: 4096 -> 8192
    // (26-room set truncated, diagnosed 2026-08-12) -> 16000 (Kinsela
    // truncated again at room 22/25, diagnosed 2026-08-13) -> 20000 then
    // 21000 (Phase 3's sourceAuthority/revision fields pushed real need to
    // 19935 measured tokens, diagnosed 2026-08-14) - each bump chased the
    // schema's growth against a shrinking margin under the Anthropic SDK's
    // non-streaming hard ceiling (refuses `max_tokens` above 21333 per
    // `(60min * maxTokens) / 128000 <= 10min`, see
    // node_modules/@anthropic-ai/sdk/src/client.ts's
    // calculateNonstreamingTimeout - a client-side error before the
    // request is even sent). That ceiling is specific to non-streaming
    // requests; it does not apply here. Streaming was the SDK's own
    // suggested fix all along (flagged, not silently deferred, across
    // three prior diagnoses) - item 3 (uncertainty classification,
    // touching all 15 building_envelope fields) was the point where
    // deferring it further stopped being viable. 32000 is a generously
    // safe value well above the ~40%-headroom philosophy over the
    // ~20000-token real need measured so far - not the model's hard
    // output ceiling, just no longer worth tuning tightly now that
    // hitting it fails soft (a real max_tokens stop_reason, handled below
    // as before) rather than a client-side throw before the request is
    // even sent.
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 32000,
      messages: [
        {
          role: "user",
          content: [documentContentBlock, { type: "text", text: EXTRACTION_PROMPT }],
        },
      ],
    });

    const message = await stream.finalMessage();
    const textBlock = message.content.find((block) => block.type === "text");
    rawText = textBlock && "text" in textBlock ? textBlock.text : "";
    stopReason = message.stop_reason;
    outputTokens = message.usage?.output_tokens;
  } catch (err) {
    await supabase
      .from("drawings")
      .update({ extraction_status: "failed" })
      .eq("id", drawingId);
    const message = err instanceof Error ? err.message : "Anthropic API request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let extraction: DrawingExtraction;
  try {
    extraction = JSON.parse(stripJsonFences(rawText));
  } catch {
    // Persist what actually happened (this used to be discarded entirely,
    // making a real failure - a drawing hitting the max_tokens ceiling -
    // undiagnosable without manually reproducing the exact API call
    // outside the app). stop_reason distinguishes "ran out of output
    // budget mid-response" (max_tokens) from a genuinely malformed
    // response (any other stop_reason) - these need different fixes and
    // shouldn't share one generic message.
    const truncated = stopReason === "max_tokens";
    await supabase
      .from("drawings")
      .update({
        extraction_status: "failed",
        extraction_error: {
          stop_reason: stopReason,
          output_tokens: outputTokens ?? null,
          raw_response: rawText,
          diagnosed_at: new Date().toISOString(),
        },
      })
      .eq("id", drawingId);
    return NextResponse.json(
      {
        error: truncated
          ? "This drawing has too much content for the model to fully describe in one response - contact support, this needs a larger output limit or a smaller upload."
          : "The model did not return valid JSON",
      },
      { status: 502 },
    );
  }

  // Section 2: most drawings don't show ductwork, so this fills a
  // construction-based default for any room the model left blank - see
  // applyDuctFallbackDefaults for why it's a uniform default rather than
  // branching per room by foundation type.
  extraction = applyDuctFallbackDefaults(extraction);
  // Phase 2 deterministic post-processing - each covers a case where
  // asking the model to get a judgment right in prose proved unreliable,
  // so code decides instead. Order doesn't matter between these three;
  // each only touches its own slice of the extraction (water_heaters,
  // rooms, window_schedule respectively) and none read a field another
  // one writes.
  extraction = flagWaterHeaterLoadRisk(extraction);
  extraction = flagRoomCeilingHeightConflicts(extraction);
  extraction = flagWindowScheduleForVerification(extraction);
  extraction = verifyEnvelopeConflictDisclaimers(extraction);
  extraction = flagCeilingInsulationRValueConflicts(extraction);

  // Diagnosed 2026-08-14: two mechanical-transcription fixes
  // (room_label_text, ceiling_insulation_callout_text - see their
  // comments in lib/drawingExtraction.ts) still didn't reliably surface
  // certain facts across four real extraction runs, regardless of prompt
  // wording, all within one 15-step pass over the whole document. This
  // targeted follow-up only fires when the two detection functions below
  // find the SPECIFIC silent-gap pattern already diagnosed - never a
  // blanket re-ask - and sends a second, much smaller, single-purpose
  // prompt over the same document, asking only about the specific rooms/
  // sheets identified. A real second look with far less competing for
  // the model's attention than the first pass, not another reword of it.
  //
  // Best-effort: if this call fails or returns malformed JSON, the
  // extraction that already succeeded above is not discarded - the first
  // pass's own honest unresolved/reason flags already cover a human
  // reviewer either way, so a failed follow-up just means proceeding
  // without the extra data, not a failed extraction.
  const roomFollowUpTargets = roomsNeedingCeilingHeightFollowUp(extraction);
  const sheetFollowUpTargets = sheetsNeedingInsulationCalloutFollowUp(extraction);
  if (roomFollowUpTargets.length > 0 || sheetFollowUpTargets.length > 0) {
    try {
      const followUpMessage = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        // A handful of short strings, nowhere near the main call's
        // ceiling - see that call's own max_tokens comment for the SDK's
        // hard non-streaming limit this stays well under.
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: [
              documentContentBlock,
              { type: "text", text: buildFollowUpPrompt(roomFollowUpTargets, sheetFollowUpTargets) },
            ],
          },
        ],
      });
      const followUpTextBlock = followUpMessage.content.find((block) => block.type === "text");
      const followUpRawText = followUpTextBlock && "text" in followUpTextBlock ? followUpTextBlock.text : "";
      const followUpResponse: FollowUpResponse = JSON.parse(stripJsonFences(followUpRawText));
      extraction = mergeFollowUpResponse(extraction, followUpResponse);
      // Re-run both diff checks now that the merge may have filled in
      // previously-missing room_label_text / sheet callout text - both
      // are idempotency-guarded (see their own comments) so re-running
      // them on rooms/sheets the follow-up didn't touch is a no-op, not
      // a duplicated flag.
      extraction = flagRoomCeilingHeightConflicts(extraction);
      extraction = flagCeilingInsulationRValueConflicts(extraction);
    } catch {
      // Swallow deliberately - see comment above this block.
    }
  }

  const unresolvedItems = collectUnresolvedItems(extraction);
  // Shared between the drawings update and the history insert below so
  // both rows agree on exactly when this extraction completed, rather
  // than two independent now() calls a few milliseconds apart.
  const extractionCompletedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("drawings")
    .update({
      extracted_data: extraction,
      unresolved_items: unresolvedItems,
      extraction_status: "completed",
      // A retry that succeeds after a previous failure should stop
      // showing that stale error - extraction_error is only ever written
      // on failure above, so it has to be explicitly cleared here.
      extraction_error: null,
      extraction_completed_at: extractionCompletedAt,
    })
    .eq("id", drawingId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Phase 2 data-integrity requirement (see migration
  // 20260813172100_add_drawing_extraction_history.sql): the drawings row
  // above is overwritten wholesale on every re-extraction, so without
  // this a prior run's facts - and when they were captured - are gone
  // with nothing to compare a fresh run against. A second, separate
  // write from the one above, not a transaction (accepted tradeoff,
  // consistent with this codebase's current reliability bar) - a failure
  // here doesn't undo the successful extraction the user is waiting on,
  // it only means this one run is missing from the audit trail, so it's
  // logged rather than surfaced as a failed request.
  const { error: historyError } = await supabase.from("drawing_extraction_history").insert({
    drawing_id: drawingId,
    project_id: drawing.project_id,
    extracted_data: extraction,
    unresolved_items: unresolvedItems,
    extraction_completed_at: extractionCompletedAt,
  });
  if (historyError) {
    console.error("drawing_extraction_history insert failed", drawingId, historyError.message);
  }

  return NextResponse.json({ extraction, unresolvedItems });
}
