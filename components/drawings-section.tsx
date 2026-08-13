"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ACCEPTED_DRAWING_MIME_TYPES,
  DRAWING_COLUMNS,
  type DrawingRow,
  type ExtractedRoom,
} from "@/lib/drawingExtraction";
import {
  latestResolutions,
  resolutionKey,
  type FieldResolution,
} from "@/lib/fieldResolutions";
import { FieldResolutionBadge } from "@/components/field-resolution-badge";
import type {
  ApplyExtractedDataResult,
  ExtractableEnvelopeFields,
} from "@/components/manual-j-workflow";

const STATUS_LABEL: Record<DrawingRow["extraction_status"], string> = {
  pending: "Processing…",
  completed: "Extracted",
  failed: "Failed",
};

const STATUS_CLASS: Record<DrawingRow["extraction_status"], string> = {
  pending: "border-brand-gold-base bg-brand-gold-base/25 text-brand-gold-hover",
  completed: "border-brand-success/40 text-brand-success",
  failed: "border-red-800 text-red-400",
};

export function DrawingsSection({
  projectId,
  initialDrawings,
  initialFieldResolutions,
  onApply,
}: {
  projectId: string;
  initialDrawings: DrawingRow[];
  initialFieldResolutions: FieldResolution[];
  onApply: (
    envelope: ExtractableEnvelopeFields,
    rooms: ExtractedRoom[],
  ) => Promise<ApplyExtractedDataResult>;
}) {
  const [drawings, setDrawings] = useState<DrawingRow[]>(initialDrawings);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [applyMessageIsError, setApplyMessageIsError] = useState(false);
  const [resolutions, setResolutions] = useState<FieldResolution[]>(initialFieldResolutions);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resolutionMap = useMemo(() => latestResolutions(resolutions), [resolutions]);

  function handleResolved(resolution: FieldResolution) {
    setResolutions((prev) => [...prev, resolution]);
  }

  const reviewingDrawing = drawings.find((d) => d.id === reviewingId) ?? null;

  async function uploadOne(file: File) {
    if (!ACCEPTED_DRAWING_MIME_TYPES.includes(file.type)) {
      setUploadError(`${file.name}: only PDF and image files are accepted.`);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUploadError("You must be signed in to upload.");
      return;
    }

    const path = `${projectId}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage
      .from("drawings")
      .upload(path, file, { contentType: file.type });
    if (uploadErr) {
      setUploadError(`${file.name}: ${uploadErr.message}`);
      return;
    }

    const { data: row, error: insertErr } = await supabase
      .from("drawings")
      .insert({
        project_id: projectId,
        uploaded_by: user.id,
        file_name: file.name,
        file_path: path,
        // The drawings.file_type column only accepts the literal 'pdf' or
        // 'image' — the real MIME type stays on the storage object itself.
        file_type: file.type === "application/pdf" ? "pdf" : "image",
        extraction_status: "pending",
      })
      .select(DRAWING_COLUMNS)
      .single<DrawingRow>();

    if (insertErr || !row) {
      setUploadError(`${file.name}: ${insertErr?.message ?? "Upload failed."}`);
      return;
    }

    setDrawings((prev) => [row, ...prev]);

    try {
      const res = await fetch("/api/drawings/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drawingId: row.id }),
      });
      const json = await res.json();

      if (!res.ok) {
        setDrawings((prev) =>
          prev.map((d) => (d.id === row.id ? { ...d, extraction_status: "failed" } : d)),
        );
        setUploadError(`${file.name}: ${json.error ?? "Extraction failed."}`);
        return;
      }

      setDrawings((prev) =>
        prev.map((d) =>
          d.id === row.id
            ? {
                ...d,
                extraction_status: "completed",
                extracted_data: json.extraction,
                unresolved_items: json.unresolvedItems,
              }
            : d,
        ),
      );
      setReviewingId(row.id);
    } catch {
      setDrawings((prev) =>
        prev.map((d) => (d.id === row.id ? { ...d, extraction_status: "failed" } : d)),
      );
      setUploadError(`${file.name}: extraction request failed.`);
    }
  }

  async function handleFiles(files: FileList | File[]) {
    setUploadError(null);
    setUploading(true);
    for (const file of Array.from(files)) {
      await uploadOne(file);
    }
    setUploading(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  // Prefers a resolved final_value over the raw AI-extracted value when one
  // exists (Section 3 data-integrity requirement) - e.g. a tech overrode a
  // misread "R-19" to the correct "R-13" via the Unresolved badge before
  // clicking Apply. Falls back to the raw extracted value when unresolved,
  // same as before Section 3 existed.
  function resolvedEnvelopeNumber(fieldName: string, rawValue: number | null): number | null {
    const resolution = resolutionMap.get(resolutionKey("projects", projectId, fieldName));
    if (!resolution?.final_value) return rawValue;
    const parsed = Number(resolution.final_value);
    return Number.isFinite(parsed) ? parsed : rawValue;
  }

  function resolvedEnvelopeString(fieldName: string, rawValue: string | null): string | null {
    const resolution = resolutionMap.get(resolutionKey("projects", projectId, fieldName));
    return resolution?.final_value ?? rawValue;
  }

  // Same "prefer the human-resolved value" rule as resolvedEnvelopeNumber/
  // resolvedEnvelopeString above, applied to a room's per-drawing duct
  // fields (table_name="drawings", field_name="room[<index>].duct_*" - see
  // migration 20260810195313_add_field_resolutions.sql). Without this,
  // clicking "Accept"/"Override" on a duct Unresolved badge only recorded
  // an audit row and never changed what "Apply to Form" actually sends
  // through to the room record.
  function resolvedRoom(drawingId: string, index: number, room: ExtractedRoom): ExtractedRoom {
    const locResolution = resolutionMap.get(
      resolutionKey("drawings", drawingId, `room[${index}].duct_location`),
    );
    const rResolution = resolutionMap.get(
      resolutionKey("drawings", drawingId, `room[${index}].duct_insulation_r_value`),
    );
    if (!locResolution && !rResolution) return room;
    return {
      ...room,
      duct_location: locResolution
        ? { value: locResolution.final_value, unresolved: false }
        : room.duct_location,
      duct_insulation_r_value: rResolution
        ? {
            value: rResolution.final_value != null ? Number(rResolution.final_value) : null,
            unresolved: false,
          }
        : room.duct_insulation_r_value,
    };
  }

  async function handleApply(drawing: DrawingRow) {
    if (!drawing.extracted_data) return;
    setApplying(true);
    setApplyMessage(null);
    setApplyMessageIsError(false);

    const envelope: ExtractableEnvelopeFields = {
      wall_insulation_r_value: resolvedEnvelopeNumber(
        "wall_insulation_r_value",
        drawing.extracted_data.building_envelope.wall_insulation_r_value.value,
      ),
      ceiling_insulation_r_value: resolvedEnvelopeNumber(
        "ceiling_insulation_r_value",
        drawing.extracted_data.building_envelope.ceiling_insulation_r_value.value,
      ),
      floor_insulation_r_value: resolvedEnvelopeNumber(
        "floor_insulation_r_value",
        drawing.extracted_data.building_envelope.floor_insulation_r_value.value,
      ),
      foundation_type: resolvedEnvelopeString(
        "foundation_type",
        drawing.extracted_data.building_envelope.foundation_type.value,
      ),
      window_type: resolvedEnvelopeString(
        "window_type",
        drawing.extracted_data.building_envelope.window_type.value,
      ),
      window_count: resolvedEnvelopeNumber(
        "window_count",
        drawing.extracted_data.building_envelope.window_count.value,
      ),
      // Unlike its siblings above, this has no projects column - it's a
      // building-wide default broadcast to rooms lacking one, not saved via
      // handleSaveEnvelope. See ExtractedEnvelope.ceiling_height_ft.
      ceiling_height_ft: resolvedEnvelopeNumber(
        "ceiling_height_ft",
        drawing.extracted_data.building_envelope.ceiling_height_ft.value,
      ),
    };

    const resolvedRooms = drawing.extracted_data.rooms.map((room, index) =>
      resolvedRoom(drawing.id, index, room),
    );
    const result = await onApply(envelope, resolvedRooms);

    // applied_to_field_data only drives the button's label below - it must
    // not gate whether the button can be clicked, since onApply's
    // insert-vs-update branch already decides independently (based on
    // whether rooms exist yet) whether re-running is safe.
    if (!result.error) {
      const supabase = createClient();
      await supabase
        .from("drawings")
        .update({ applied_to_field_data: true })
        .eq("id", drawing.id);

      setDrawings((prev) =>
        prev.map((d) => (d.id === drawing.id ? { ...d, applied_to_field_data: true } : d)),
      );
    }

    if (result.error) {
      setApplyMessageIsError(true);
      setApplyMessage(`Apply failed — ${result.error}`);
    } else {
      const parts: string[] = [];
      if (result.appliedEnvelope) parts.push("filled blank Building Envelope fields");
      if (result.roomsCreated > 0) parts.push(`created ${result.roomsCreated} room(s)`);
      // Covers duct and/or drawing-relative wall data (building-
      // orientation-driven wall auto-population) - a room can be updated
      // for either, both, or neither.
      if (result.roomsUpdated > 0) parts.push(`updated ${result.roomsUpdated} existing room(s)`);
      const unmatchedNote =
        result.unmatchedRoomNotes.length > 0
          ? ` ${result.unmatchedRoomNotes.length} room(s) need manual review: ${result.unmatchedRoomNotes.join("; ")}`
          : "";
      setApplyMessage(
        (parts.length > 0
          ? `Applied: ${parts.join(", ")}.`
          : "Nothing to apply — Building Envelope fields were already filled, rooms already exist, and no duct or wall data matched an existing room by name.") +
          unmatchedNote,
      );
    }
    setApplying(false);
  }

  return (
    <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
      <h2 className="mb-4 text-lg font-semibold text-brand-gold">Drawings</h2>

      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
          dragActive
            ? "border-brand-gold bg-brand-gold/15"
            : "border-zinc-700 bg-zinc-900 hover:border-brand-gold-hover"
        }`}
      >
        <p className="text-sm font-medium text-brand-silver-highlight">
          {uploading ? "Uploading…" : "Drag and drop a drawing here, or click to browse"}
        </p>
        <p className="mt-1 text-xs text-brand-grey-text">PDF or image files</p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_DRAWING_MIME_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFiles(e.target.files);
            }
            e.target.value = "";
          }}
        />
      </div>

      {uploadError && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {uploadError}
        </p>
      )}

      {drawings.length > 0 && (
        <ul className="mt-4 space-y-2">
          {drawings.map((drawing) => (
            <li
              key={drawing.id}
              className="flex items-center justify-between rounded-md border border-brand-gold/50 bg-zinc-900 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-brand-silver-highlight">{drawing.file_name}</p>
                {drawing.applied_to_field_data && (
                  <p className="text-xs text-brand-success">Applied to form</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_CLASS[drawing.extraction_status]}`}
                  title={
                    drawing.extraction_status === "failed" && drawing.extraction_error
                      ? drawing.extraction_error.stop_reason === "max_tokens"
                        ? `This drawing has too much content for the model to fully describe in one response (used all ${drawing.extraction_error.output_tokens} output tokens).`
                        : `Extraction failed (stop_reason: ${drawing.extraction_error.stop_reason ?? "unknown"}).`
                      : undefined
                  }
                >
                  {STATUS_LABEL[drawing.extraction_status]}
                </span>
                {drawing.extraction_status === "completed" && (
                  <button
                    onClick={() =>
                      setReviewingId((current) => (current === drawing.id ? null : drawing.id))
                    }
                    className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-brand-silver transition hover:border-brand-gold-hover hover:text-brand-gold-hover"
                  >
                    {reviewingId === drawing.id ? "Hide" : "Review"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {reviewingDrawing?.extracted_data && (
        <ReviewPanel
          projectId={projectId}
          drawing={reviewingDrawing}
          applying={applying}
          applyMessage={applyMessage}
          applyMessageIsError={applyMessageIsError}
          onApply={() => handleApply(reviewingDrawing)}
          resolutionMap={resolutionMap}
          onResolved={handleResolved}
        />
      )}
    </section>
  );
}

function ReviewPanel({
  projectId,
  drawing,
  applying,
  applyMessage,
  applyMessageIsError,
  onApply,
  resolutionMap,
  onResolved,
}: {
  projectId: string;
  drawing: DrawingRow;
  applying: boolean;
  applyMessage: string | null;
  applyMessageIsError: boolean;
  onApply: () => void;
  resolutionMap: Map<string, FieldResolution>;
  onResolved: (resolution: FieldResolution) => void;
}) {
  const data = drawing.extracted_data!;
  const envelope = data.building_envelope;
  const orientation = data.orientation;

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-brand-gold/50 bg-zinc-900 p-4">
      <div
        className={`rounded-md border px-3 py-2 text-xs ${
          orientation?.detected
            ? "border-brand-success/40 bg-brand-success/10 text-brand-success"
            : "border-brand-gold/50 bg-brand-gold/10 text-brand-gold"
        }`}
      >
        {orientation?.detected ? (
          <>
            <span className="font-semibold">Orientation detected.</span>{" "}
            {orientation.description ?? "Room wall exposure was estimated from the drawing."}
          </>
        ) : (
          <>
            <span className="font-semibold">No orientation marker found.</span> Room wall
            exposure (N/S/E/W) was left blank rather than guessed — enter it manually if needed.
          </>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand-gold">Building Envelope</h3>
        <dl className="space-y-2 text-sm">
          <FieldRow
            label="Wall insulation (R)"
            field={envelope.wall_insulation_r_value}
            projectId={projectId}
            fieldName="wall_insulation_r_value"
            resolutionMap={resolutionMap}
            onResolved={onResolved}
          />
          <FieldRow
            label="Ceiling insulation (R)"
            field={envelope.ceiling_insulation_r_value}
            projectId={projectId}
            fieldName="ceiling_insulation_r_value"
            resolutionMap={resolutionMap}
            onResolved={onResolved}
          />
          <FieldRow
            label="Floor insulation (R)"
            field={envelope.floor_insulation_r_value}
            projectId={projectId}
            fieldName="floor_insulation_r_value"
            resolutionMap={resolutionMap}
            onResolved={onResolved}
          />
          <FieldRow
            label="Window type"
            field={envelope.window_type}
            projectId={projectId}
            fieldName="window_type"
            resolutionMap={resolutionMap}
            onResolved={onResolved}
          />
          <FieldRow
            label="Window count"
            field={envelope.window_count}
            projectId={projectId}
            fieldName="window_count"
            resolutionMap={resolutionMap}
            onResolved={onResolved}
          />
          <FieldRow
            label="Foundation type"
            field={envelope.foundation_type}
            projectId={projectId}
            fieldName="foundation_type"
            resolutionMap={resolutionMap}
            onResolved={onResolved}
          />
        </dl>
        <p className="mt-2 text-xs text-brand-grey-text">
          Window type and window count are extracted and shown here for reference, but — unlike
          the three R-values and foundation type above — are not currently copied to any project
          field by &quot;Apply to Form&quot;. Resolving them here creates an audit record but
          does not yet change any other value in the app. Foundation type is now copied on Apply
          (Section 2), but isn&apos;t yet consumed by the load calculation itself.
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-brand-gold">
          Rooms ({data.rooms.length})
        </h3>
        {data.rooms.length === 0 ? (
          <p className="text-sm text-brand-grey-text">No rooms detected.</p>
        ) : (
          <ul className="space-y-2">
            {data.rooms.map((room, index) => (
              <li
                key={index}
                className="rounded-md border border-brand-gold/50 bg-brand-bg px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-brand-silver-highlight">{room.name}</span>
                  {room.unresolved && (
                    <FieldResolutionBadge
                      projectId={projectId}
                      tableName="drawings"
                      recordId={drawing.id}
                      fieldName={`room[${index}]`}
                      aiExtractedValue={room.reason}
                      resolution={resolutionMap.get(
                        resolutionKey("drawings", drawing.id, `room[${index}]`),
                      )}
                      onResolved={onResolved}
                    />
                  )}
                </div>
                <p className="mt-1 text-xs text-brand-grey-text">
                  {room.floor_area_sqft != null ? `${room.floor_area_sqft} sqft` : "area unknown"}
                  {" · "}
                  {room.door_count != null ? `${room.door_count} door(s)` : "doors unknown"}
                  {" · "}
                  {room.window_count != null
                    ? `${room.window_count} window(s) (count only, no area)`
                    : "windows unknown"}
                </p>
                {room.unresolved && room.reason && (
                  <p className="mt-1 text-xs text-brand-gold">{room.reason}</p>
                )}
                <div className="mt-2 flex items-center gap-2 border-t border-brand-gold/50 pt-2">
                  <span className="text-xs text-brand-grey-text">
                    Ducts: {room.duct_location?.value ?? "—"}
                    {room.duct_insulation_r_value?.value != null &&
                      ` (R-${room.duct_insulation_r_value.value})`}
                    {room.duct_source === "default" && " · construction-based default"}
                    {room.duct_source === "ai_extracted" && " · read from drawing"}
                  </span>
                  {room.duct_location?.unresolved && (
                    <FieldResolutionBadge
                      projectId={projectId}
                      tableName="drawings"
                      recordId={drawing.id}
                      fieldName={`room[${index}].duct_location`}
                      aiExtractedValue={room.duct_location.value}
                      resolution={resolutionMap.get(
                        resolutionKey("drawings", drawing.id, `room[${index}].duct_location`),
                      )}
                      onResolved={onResolved}
                    />
                  )}
                  {room.duct_insulation_r_value?.unresolved && (
                    <FieldResolutionBadge
                      projectId={projectId}
                      tableName="drawings"
                      recordId={drawing.id}
                      fieldName={`room[${index}].duct_insulation_r_value`}
                      aiExtractedValue={
                        room.duct_insulation_r_value.value != null
                          ? String(room.duct_insulation_r_value.value)
                          : null
                      }
                      resolution={resolutionMap.get(
                        resolutionKey(
                          "drawings",
                          drawing.id,
                          `room[${index}].duct_insulation_r_value`,
                        ),
                      )}
                      onResolved={onResolved}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-md border border-brand-gold/50 bg-brand-gold/10 px-3 py-3 text-xs text-brand-gold">
        <p className="font-semibold">Always entered manually — never auto-extracted:</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>ACH50 (infiltration)</li>
          <li>Occupants</li>
          <li>Indoor design temperatures (heating &amp; cooling)</li>
        </ul>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onApply}
          disabled={applying}
          className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
        >
          {applying
            ? "Applying…"
            : drawing.applied_to_field_data
              ? "Re-Apply / Update Form"
              : "Apply to Form"}
        </button>
        {applyMessage && (
          <span
            className={`text-sm ${applyMessageIsError ? "text-red-400" : "text-brand-silver"}`}
            role={applyMessageIsError ? "alert" : undefined}
          >
            {applyMessage}
          </span>
        )}
      </div>
    </div>
  );
}

function FieldRow({
  label,
  field,
  projectId,
  fieldName,
  resolutionMap,
  onResolved,
}: {
  label: string;
  field: { value: string | number | null; unresolved: boolean; reason?: string | null };
  projectId: string;
  fieldName: string;
  resolutionMap: Map<string, FieldResolution>;
  onResolved: (resolution: FieldResolution) => void;
}) {
  return (
    <div className="border-b border-brand-gold/50 pb-2">
      <div className="flex items-center justify-between gap-4">
        <dt className="text-brand-grey-text">{label}</dt>
        <dd className="flex items-center gap-2 text-right font-medium text-brand-silver-highlight">
          {field.value ?? "—"}
          {field.unresolved && (
            <FieldResolutionBadge
              projectId={projectId}
              tableName="projects"
              recordId={projectId}
              fieldName={fieldName}
              aiExtractedValue={field.value != null ? String(field.value) : null}
              resolution={resolutionMap.get(resolutionKey("projects", projectId, fieldName))}
              onResolved={onResolved}
            />
          )}
        </dd>
      </div>
      {field.unresolved && field.reason && (
        <p className="mt-1 text-right text-xs text-brand-gold">{field.reason}</p>
      )}
    </div>
  );
}
