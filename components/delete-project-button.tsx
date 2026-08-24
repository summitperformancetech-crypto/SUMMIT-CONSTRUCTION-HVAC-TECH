"use client";

// No project-lifecycle action existed anywhere in the app before this -
// a project could be created but never removed. Scoped to admin only,
// matching every other org-lifecycle action (team, branding, equipment
// preferences) already gated the same way.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${projectName}"? This permanently removes the project and everything in it - rooms, drawings, zones, reports. This can't be undone.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("projects").delete().eq("id", projectId);
    setDeleting(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="text-xs text-red-400 underline decoration-dotted hover:text-red-300 disabled:opacity-50"
      >
        {deleting ? "Deleting…" : "Delete project"}
      </button>
      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
