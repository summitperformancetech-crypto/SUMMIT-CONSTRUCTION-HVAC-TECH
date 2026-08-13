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
  type DrawingExtraction,
} from "@/lib/drawingExtraction";

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
    .select("id, file_name, file_path, file_type")
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

  let rawText: string;
  let stopReason: string | null;
  let outputTokens: number | undefined;
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      // Room-dense drawings (20+ rooms - real, not hypothetical: a 26-room
      // architectural set hit this exact ceiling and got cut off mid-JSON
      // at the previous 4096 limit, diagnosed 2026-08-12 by reproducing
      // the API call directly and inspecting stop_reason) need more output
      // budget than a small single-family floor plan. 8192 gave ~40%
      // headroom over what that drawing actually needed (4872 tokens) -
      // but that was against the schema BEFORE STEP 3/4 added 8 window-area
      // fields per room plus 1 envelope field. Re-diagnosed 2026-08-13 the
      // same way: the same 25-room Kinsela set hit the (still-8192) ceiling
      // again, truncating mid-response at room 22/25 (~369 tokens/room
      // under the new schema, extrapolating to ~9500 tokens for all 25).
      // 16000 kept the same ~40%-headroom philosophy over that estimate -
      // then Phase 2 (sheet provenance, schedules, HVAC equipment/zoning,
      // water heaters, ~30 new keys across 15 building_envelope fields)
      // hit the SAME ceiling a third time, this time truncating with only
      // ~285 tokens of output left (measured directly: 44609 chars at
      // 16000 tokens = ~2.79 chars/token, and the response cut off inside
      // the next-to-last array with just square_footage_summary,
      // water_heaters, and closing braces remaining) - real need is
      // ~16285 tokens, which the usual ~40% headroom would put at ~22800.
      //
      // That number is NOT usable, though: the Anthropic SDK enforces a
      // hard ceiling on non-streaming requests - it refuses above 21333
      // (`(60min * maxTokens) / 128000 <= 10min`, see
      // node_modules/@anthropic-ai/sdk/src/client.ts's
      // calculateNonstreamingTimeout) and throws before the request is
      // even sent, not a slow response, an immediate client-side error.
      // Confirmed by hitting it directly at max_tokens: 24000 while
      // diagnosing this. 20000 is a deliberately conservative value under
      // that ceiling (~23% headroom over the measured need, not the usual
      // ~40%) - not a final answer. This app will keep adding extractable
      // categories, and headroom this tight will need revisiting via
      // actual streaming support (the SDK's own suggested fix), not
      // another number bump - flagged to the user rather than guessed at
      // silently. Cost/latency is billed on tokens actually generated,
      // not this ceiling, so there's no downside to unused headroom on
      // smaller drawings, right up until the ceiling itself.
      max_tokens: 20000,
      messages: [
        {
          role: "user",
          content: [
            isPdf
              ? {
                  type: "document",
                  source: { type: "base64", media_type: "application/pdf", data: base64 },
                }
              : {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: imageMediaType!,
                    data: base64,
                  },
                },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

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

  const unresolvedItems = collectUnresolvedItems(extraction);

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
    })
    .eq("id", drawingId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ extraction, unresolvedItems });
}
