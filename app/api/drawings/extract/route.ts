import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  EXTRACTION_PROMPT,
  collectUnresolvedItems,
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
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
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
    await supabase
      .from("drawings")
      .update({ extraction_status: "failed" })
      .eq("id", drawingId);
    return NextResponse.json(
      { error: "The model did not return valid JSON" },
      { status: 502 },
    );
  }

  const unresolvedItems = collectUnresolvedItems(extraction);

  const { error: updateError } = await supabase
    .from("drawings")
    .update({
      extracted_data: extraction,
      unresolved_items: unresolvedItems,
      extraction_status: "completed",
    })
    .eq("id", drawingId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ extraction, unresolvedItems });
}
