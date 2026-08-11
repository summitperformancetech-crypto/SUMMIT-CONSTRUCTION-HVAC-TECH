"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ConfirmClimateButton({
  projectId,
  initialConfirmed,
  onConfirmed,
}: {
  projectId: string;
  initialConfirmed: boolean;
  onConfirmed?: () => void;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("projects")
      .update({ climate_confirmed: true })
      .eq("id", projectId);

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setConfirmed(true);
    onConfirmed?.();
    router.refresh();
  }

  if (confirmed) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-brand-success/40 bg-brand-success/10 px-3 py-2 text-sm font-medium text-brand-success">
        Climate data confirmed
      </span>
    );
  }

  return (
    <div>
      <button
        onClick={handleConfirm}
        disabled={loading}
        className="rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
      >
        {loading ? "Confirming…" : "Confirm Climate Data"}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
