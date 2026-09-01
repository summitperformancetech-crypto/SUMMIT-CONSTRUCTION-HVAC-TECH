"use client";

// The numbered progress rail for the guided residential pipeline. Reads
// live status from PipelineProvider - a stage the technician can open is
// anything not `locked`; the current stage is highlighted. Clicking an
// unlocked stage navigates to it (Back is always allowed; Next is gated by
// the stepper).

import { PIPELINE_STAGES, PIPELINE_STAGE_LABEL, type PipelineStage } from "@/lib/pipeline";
import { usePipeline } from "@/components/pipeline/pipeline-provider";

const STATUS_DOT: Record<string, string> = {
  complete: "bg-brand-success border-brand-success",
  in_progress: "bg-brand-gold border-brand-gold",
  available: "bg-transparent border-brand-gold",
  locked: "bg-transparent border-zinc-700",
};

export function PipelineRail({
  viewStage,
  onNavigate,
}: {
  viewStage: PipelineStage;
  onNavigate: (stage: PipelineStage) => void;
}) {
  const { state, refreshing } = usePipeline();

  return (
    <nav aria-label="Pipeline progress" className="rounded-lg border border-brand-gold/50 bg-brand-bg p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-brand-gold">Project pipeline</h2>
        <span className="text-[10px] text-brand-grey-text">
          {refreshing ? "refreshing…" : `${countComplete(state)} / ${PIPELINE_STAGES.length} stages complete`}
        </span>
      </div>
      <ol className="flex flex-col gap-1">
        {PIPELINE_STAGES.map((stage, i) => {
          const st = state.stages[stage];
          const isView = stage === viewStage;
          const clickable = st.status !== "locked";
          return (
            <li key={stage}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onNavigate(stage)}
                aria-current={isView ? "step" : undefined}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition ${
                  isView ? "bg-brand-gold-base/15" : "hover:bg-zinc-900"
                } ${clickable ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${STATUS_DOT[st.status]} ${
                    st.status === "complete" ? "text-black" : "text-brand-silver"
                  }`}
                >
                  {st.status === "complete" ? "✓" : i + 1}
                </span>
                <span className={isView ? "font-medium text-brand-gold" : "text-brand-silver-highlight"}>
                  {PIPELINE_STAGE_LABEL[stage]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function countComplete(state: ReturnType<typeof usePipeline>["state"]): number {
  return PIPELINE_STAGES.filter((s) => state.stages[s].status === "complete").length;
}
