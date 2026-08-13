"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { COMPASS_8_OPTIONS, isCardinalCompass, type Compass8 } from "@/lib/constants/compass";
import { resolveOrientation, isTransformApplicable, applyOrientationToRoom } from "@/lib/orientation";
import { ROOM_COLUMNS, type RoomRow } from "@/components/manual-j-workflow";
import {
  FIELD_RESOLUTION_COLUMNS,
  resolutionKey,
  roomHasUnresolvedWallOrientation,
  type FieldResolution,
} from "@/lib/fieldResolutions";
import type { DrawingExtraction } from "@/lib/drawingExtraction";

// Building-orientation-driven wall auto-population, Parts 2-3. A room with
// drawing-relative wall data (wall_front/rear/left/right_len_ft - filled
// by extraction when no north-arrow marker exists, see
// lib/drawingExtraction.ts) but no compass data yet is "pending" - this
// section is both the always-available project-level orientation control
// and (when rooms are actually pending) a prominent banner prompting the
// tech to resolve it in one action, per Part 3's explicit "don't leave it
// as silent per-room gaps" instruction.
function roomHasDrawingRelativeData(room: RoomRow): boolean {
  return (
    room.wall_front_len_ft != null ||
    room.wall_rear_len_ft != null ||
    room.wall_left_len_ft != null ||
    room.wall_right_len_ft != null
  );
}

function roomHasCompassData(room: RoomRow): boolean {
  return (
    room.wall_north_len_ft != null ||
    room.wall_south_len_ft != null ||
    room.wall_east_len_ft != null ||
    room.wall_west_len_ft != null
  );
}

export function BuildingOrientationSection({
  projectId,
  rooms,
  onRoomsUpdated,
  initialBuildingFrontFaces,
}: {
  projectId: string;
  rooms: RoomRow[];
  onRoomsUpdated: (updated: RoomRow[]) => void;
  initialBuildingFrontFaces: Compass8 | null;
}) {
  const [frontFaces, setFrontFaces] = useState<Compass8 | "">(initialBuildingFrontFaces ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);

  const pendingRooms = rooms.filter(
    (r) => roomHasDrawingRelativeData(r) && !roomHasCompassData(r),
  );

  async function handleApply() {
    if (!frontFaces) {
      setMessageIsError(true);
      setMessage("Choose a direction first.");
      return;
    }
    setSaving(true);
    setMessage(null);
    setMessageIsError(false);
    const supabase = createClient();

    const { error: projectError } = await supabase
      .from("projects")
      .update({ building_front_faces: frontFaces })
      .eq("id", projectId);
    if (projectError) {
      setSaving(false);
      setMessageIsError(true);
      setMessage(`Failed to save building orientation: ${projectError.message}`);
      return;
    }

    if (!isTransformApplicable(frontFaces)) {
      setSaving(false);
      setMessage(
        `Orientation saved. "${frontFaces}" is an intercardinal direction - wall auto-fill only writes to the four cardinal (N/S/E/W) fields Manual J uses, so it can't rotate wall data for this selection. Pick the nearest cardinal direction (N/E/S/W) to auto-fill walls, or enter each room's compass walls manually.`,
      );
      return;
    }

    const orientation = resolveOrientation(frontFaces);
    // Guaranteed cardinal by isTransformApplicable above - narrowed here
    // only because TypeScript can't infer that from the runtime check.
    const cardinalOrientation = orientation as {
      front: "N" | "E" | "S" | "W";
      rear: "N" | "E" | "S" | "W";
      left: "N" | "E" | "S" | "W";
      right: "N" | "E" | "S" | "W";
    };

    // Fetched fresh right here, not passed down as a prop, deliberately -
    // this gate only matters at the instant the transform is about to run,
    // and DrawingsSection (where a tech actually clicks Accept/Override on
    // a room's Unresolved badge) owns its own drawings/resolutions state
    // independently, several components away. A stale snapshot passed down
    // from a parent would risk still blocking a room the tech just resolved
    // in the same session, without a reload - worse than one extra query.
    const [{ data: drawingsData, error: drawingsError }, { data: resolutionsData, error: resolutionsError }] =
      await Promise.all([
        supabase
          .from("drawings")
          .select("id, extraction_status, extracted_data")
          .eq("project_id", projectId)
          .returns<{ id: string; extraction_status: string; extracted_data: DrawingExtraction | null }[]>(),
        supabase
          .from("field_resolutions")
          .select(FIELD_RESOLUTION_COLUMNS)
          .eq("project_id", projectId)
          .returns<FieldResolution[]>(),
      ]);
    if (drawingsError || resolutionsError) {
      setSaving(false);
      setMessageIsError(true);
      setMessage(
        `Orientation saved, but couldn't check wall-orientation confirmation status: ${
          drawingsError?.message ?? resolutionsError?.message
        }. Auto-fill not run - try again.`,
      );
      return;
    }
    const resolvedKeys = new Set(
      (resolutionsData ?? []).map((r) => resolutionKey(r.table_name, r.record_id, r.field_name)),
    );

    const updatedRooms: RoomRow[] = [];
    const errors: string[] = [];
    const blockedRooms: string[] = [];
    let skippedNoData = 0;
    for (const room of rooms) {
      if (roomHasUnresolvedWallOrientation(room.name, drawingsData ?? [], resolvedKeys)) {
        blockedRooms.push(room.name);
        continue;
      }
      const cardinalUpdate = applyOrientationToRoom(room, cardinalOrientation);
      if (Object.keys(cardinalUpdate).length === 0) {
        if (roomHasDrawingRelativeData(room)) skippedNoData += 1;
        continue;
      }
      const { data, error } = await supabase
        .from("rooms")
        .update(cardinalUpdate)
        .eq("id", room.id)
        .select(ROOM_COLUMNS)
        .single<RoomRow>();
      if (error) {
        errors.push(`${room.name}: ${error.message}`);
      } else if (data) {
        updatedRooms.push(data);
      }
    }

    if (updatedRooms.length > 0) onRoomsUpdated(updatedRooms);
    setSaving(false);
    const blockedSuffix =
      blockedRooms.length > 0
        ? ` ${blockedRooms.length} room(s) blocked - resolve wall orientation before auto-filling (open the drawing's review panel and Accept/Override the Unresolved badge on: ${blockedRooms.join(", ")}).`
        : "";
    if (errors.length > 0) {
      setMessageIsError(true);
      setMessage(
        `Updated ${updatedRooms.length} room(s), but failed on ${errors.length}: ${errors.join("; ")}${blockedSuffix}`,
      );
      return;
    }
    setMessageIsError(blockedRooms.length > 0);
    setMessage(
      `Building orientation set to ${frontFaces}. Auto-filled compass walls on ${updatedRooms.length} room(s)` +
        (skippedNoData > 0 ? ` (${skippedNoData} room(s) had no drawing-relative wall data to rotate).` : ".") +
        blockedSuffix,
    );
  }

  const showBanner = pendingRooms.length > 0 && !initialBuildingFrontFaces;

  return (
    <section
      className={`rounded-lg border p-6 ${
        showBanner
          ? "border-brand-gold bg-brand-gold-base/15"
          : "border-brand-gold/50 bg-brand-bg"
      }`}
    >
      <h2 className="mb-2 text-lg font-semibold text-brand-gold">Building Orientation</h2>
      {showBanner && (
        <p className="mb-4 text-sm text-brand-silver-highlight">
          This drawing has no orientation marker, so {pendingRooms.length} room
          {pendingRooms.length === 1 ? "" : "s"} {pendingRooms.length === 1 ? "has" : "have"} wall
          data captured relative to the building itself (front/rear/left/right) instead of true
          compass direction. Set the building&apos;s orientation once below to auto-fill
          North/South/East/West walls for all of them.
        </p>
      )}
      <p className="mb-4 text-xs text-brand-grey-text">
        Which compass direction does the front entry face? &ldquo;Front/rear/left/right&rdquo; on
        extracted rooms are defined as a tech&apos;s own left/right while standing outside, facing
        the front entry (looking at the house, about to walk in) — not the occupant&apos;s
        left/right while exiting.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-grey-text">
            Front entry faces
          </label>
          <select
            value={frontFaces}
            onChange={(e) => setFrontFaces(e.target.value as Compass8 | "")}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-brand-silver-highlight outline-none focus:border-brand-gold"
          >
            <option value="">— Select —</option>
            {COMPASS_8_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.value})
                {!isCardinalCompass(opt.value) ? " — not yet supported for auto-fill" : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleApply}
          disabled={saving || !frontFaces}
          className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
        >
          {saving ? "Applying…" : "Save & Auto-Fill Walls"}
        </button>
      </div>
      {message && (
        <p
          className={`mt-3 text-sm ${messageIsError ? "text-red-400" : "text-brand-silver"}`}
          role={messageIsError ? "alert" : undefined}
        >
          {message}
        </p>
      )}
    </section>
  );
}
