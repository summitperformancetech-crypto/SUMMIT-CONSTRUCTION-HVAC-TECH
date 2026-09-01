"use client";

// PipelineProvider - the one shared pipeline state on the client.
//
// FIX-PIPELINE: this is what makes the sections communicate. Every stage
// component calls `refreshPipeline()` immediately after any successful
// write; that re-fetches GET /api/projects/[id]/pipeline-state (which runs
// buildPipelineInput -> computePipelineState server-side) and updates
// context. A blocker fixed in stage N flips stage N+1 to available in the
// same recompute, with no page reload. No component computes its own
// readiness - they all read `state` from here.

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { PipelineState } from "@/lib/pipeline";

type PipelineContextValue = {
  state: PipelineState;
  refreshing: boolean;
  error: string | null;
  refreshPipeline: () => Promise<void>;
};

const PipelineContext = createContext<PipelineContextValue | null>(null);

export function usePipeline(): PipelineContextValue {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error("usePipeline must be used inside <PipelineProvider>");
  return ctx;
}

export function PipelineProvider({
  projectId,
  initialState,
  children,
}: {
  projectId: string;
  initialState: PipelineState;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<PipelineState>(initialState);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const refreshPipeline = useCallback(async () => {
    if (inflight.current) return inflight.current;
    setRefreshing(true);
    setError(null);
    const run = (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/pipeline-state`, { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.state) {
          setError(body?.error ?? "Failed to refresh pipeline status.");
          return;
        }
        setState(body.state as PipelineState);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to refresh pipeline status.");
      } finally {
        setRefreshing(false);
        inflight.current = null;
      }
    })();
    inflight.current = run;
    return run;
  }, [projectId]);

  return (
    <PipelineContext.Provider value={{ state, refreshing, error, refreshPipeline }}>
      {children}
    </PipelineContext.Provider>
  );
}
