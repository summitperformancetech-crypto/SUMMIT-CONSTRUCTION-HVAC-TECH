"use client";

// FIX-PIPELINE: the residential project workspace is now a strict in-order
// guided stepper. One screen, a numbered rail, stage N locked until stage
// N-1's exit gate is met. Back is always allowed; Next is gated. Every
// stage component calls refreshPipeline() after a successful write, so the
// one shared PipelineState recomputes and downstream stages re-gate with no
// page reload. See /SUMMIT-BUILD-SEQUENCE.md and lib/pipeline.ts.

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ConfirmClimateButton } from "@/components/confirm-climate-button";
import { BuildingOrientationGate } from "@/components/building-orientation-gate";
import { DrawingsSection } from "@/components/drawings-section";
import {
  ManualJWorkflow,
  type ManualJWorkflowHandle,
  type RoomRow,
  type ZoneRow,
} from "@/components/manual-j-workflow";
import {
  MakeupAirSection,
  type ExhaustSourceRow,
  type MakeupAirCatalogOption,
  type ExhaustFanCatalogOption,
  type ExhaustRoomLookup,
} from "@/components/makeup-air-section";
import { GenerateReportsButton, type SnapshotStatus } from "@/components/generate-reports-button";
import { ReportSignOffSection, type ReportSignOffRow } from "@/components/report-sign-off-section";
import { StalenessBanner } from "@/components/staleness-banner";
import type { StaleItem } from "@/lib/staleness";
import { PipelineProvider, usePipeline } from "@/components/pipeline/pipeline-provider";
import { PipelineRail } from "@/components/pipeline/pipeline-rail";
import { ProposalPanel } from "@/components/pipeline/proposal-panel";
import { FinalizePanel } from "@/components/pipeline/finalize-panel";
import { PIPELINE_STAGES, type PipelineStage, type PipelineState } from "@/lib/pipeline";
import { isCardinalCompass } from "@/lib/constants/compass";
import type { DuctRunRow } from "@/components/duct-design-section";
import type { DuctDiffuserRow, AhuInstallationDetailRow, DuctTerminationRow } from "@/lib/ductRouting";
import type { ManualJEnvelope, RoomTypeDefault } from "@/lib/manualJ";
import type { DuctSizingTableRow } from "@/lib/manualD";
import type { EquipmentCatalogEntry, PerformancePoint } from "@/lib/manualS";
import type { DrawingRow } from "@/lib/drawingExtraction";
import type { DehumidificationSystemRow, DehumidificationDuctRunRow } from "@/components/dehumidification-section";
import type { DehumidifierCatalogOption } from "@/lib/dehumidification";
import type { BlowerPerformancePoint } from "@/lib/manualD";
import type { FieldResolution } from "@/lib/fieldResolutions";
import type { Compass8 } from "@/lib/constants/compass";
import type { HvacSystemConfiguration } from "@/components/system-configuration-section";

type ProjectWorkspaceProps = {
  projectId: string;
  initialPipelineState: PipelineState;
  initialClimateConfirmed: boolean;
  initialEnvelope: ManualJEnvelope;
  initialAtticInsulationType: string | null;
  initialFoundationType: string | null;
  initialWindowType: string | null;
  initialWindowCount: number | null;
  initialNoVentedAtticOrCrawlspace: boolean;
  initialRooms: RoomRow[];
  initialDrawings: DrawingRow[];
  initialFieldResolutions: FieldResolution[];
  winterDesignTempF: number | null;
  summerDesignTempF: number | null;
  roomTypeDefaults: RoomTypeDefault[];
  initialZones: ZoneRow[];
  initialAvailableStaticPressureIwc: number | null;
  initialSupplyAirTempF: number | null;
  initialBlowerTespIwc: number | null;
  initialEvaporatorCoilLossIwc: number | null;
  initialAirFilterLossIwc: number | null;
  initialGrillesRegistersLossIwc: number | null;
  initialDuctRuns: DuctRunRow[];
  initialDuctDiffusers: DuctDiffuserRow[];
  initialAhuInstallationDetails: AhuInstallationDetailRow[];
  initialDuctTerminations: DuctTerminationRow[];
  ductSizingTable: DuctSizingTableRow[];
  summerCoincidentWetbulbF: number | null;
  equipmentCatalog: EquipmentCatalogEntry[];
  equipmentPerformancePoints: PerformancePoint[];
  preferredEquipmentIds: ReadonlySet<string>;
  exclusiveEquipmentIds: ReadonlySet<string>;
  ductInsulationCodeMinimums: { duct_location: string; min_r_value: number }[];
  initialBuildingFrontFaces: Compass8 | null;
  initialPreferredManufacturer: string | null;
  initialSystemConfiguration: HvacSystemConfiguration;
  userRole: string;
  initialDehumidificationSystems: DehumidificationSystemRow[];
  initialDehumidificationDuctRuns: DehumidificationDuctRunRow[];
  dehumidifierCatalogOptions: DehumidifierCatalogOption[];
  dehumidifierBlowerPerformancePoints: BlowerPerformancePoint[];
  // Ventilation stage (moved in from app/dashboard/[id]/page.tsx).
  initialExhaustSources: ExhaustSourceRow[];
  makeupAirCatalogOptions: MakeupAirCatalogOption[];
  initialSelectedMakeupAirEquipmentId: string | null;
  exhaustFanCatalogOptions: ExhaustFanCatalogOption[];
  exhaustRoomLookup: ExhaustRoomLookup[];
  // Finalize / Reports stage (moved in from page.tsx).
  initialSnapshot: SnapshotStatus | null;
  initialSignOffs: ReportSignOffRow[];
  initialStaleItems: StaleItem[];
};

export function ProjectWorkspace(props: ProjectWorkspaceProps) {
  return (
    <PipelineProvider projectId={props.projectId} initialState={props.initialPipelineState}>
      <StepperShell {...props} />
    </PipelineProvider>
  );
}

function StepperShell(props: ProjectWorkspaceProps) {
  const { projectId } = props;
  const { state, refreshPipeline, refreshing, error: pipelineError } = usePipeline();
  const [viewStage, setViewStage] = useState<PipelineStage>(props.initialPipelineState.currentStage);
  const manualJRef = useRef<ManualJWorkflowHandle>(null);
  const [climateConfirmed, setClimateConfirmed] = useState(props.initialClimateConfirmed);
  const [buildingFrontFaces, setBuildingFrontFaces] = useState(props.initialBuildingFrontFaces);
  const [autoBusy, setAutoBusy] = useState<string | null>(null);
  const [autoError, setAutoError] = useState<string | null>(null);
  const autoRan = useRef<Record<string, boolean>>({});
  // Latch: once the pipeline reaches Rooms & Envelope, keep the one
  // ManualJWorkflow instance mounted for the rest of the session so its
  // rooms/zones state survives navigating back to an earlier stage - even
  // if an earlier gate is briefly re-opened (e.g. a drawing is deleted).
  const [manualJMounted, setManualJMounted] = useState(
    props.initialPipelineState.stages.rooms_envelope.entryGateMet,
  );
  useEffect(() => {
    // Deliberate one-time monotonic latch: flips false->true exactly once,
    // the first time Rooms & Envelope unlocks, and never fires again. This
    // is not the cascading-render pattern the rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.stages.rooms_envelope.entryGateMet && !manualJMounted) setManualJMounted(true);
  }, [state.stages.rooms_envelope.entryGateMet, manualJMounted]);

  const stageIdx = PIPELINE_STAGES.indexOf(viewStage);
  const prevStage = stageIdx > 0 ? PIPELINE_STAGES[stageIdx - 1] : null;
  const nextStage = stageIdx < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[stageIdx + 1] : null;
  const current = state.stages[viewStage];

  // Once the project is Finalized (POST /api/projects/[id]/finalize, which
  // refreshes pipeline state) the report/sign-off controls must activate
  // without a page reload, even though the server-rendered initialSnapshot
  // was null at load. Synthesize a v1 status from pipeline state.
  const effectiveSnapshot =
    props.initialSnapshot ??
    (state.finalized ? { version: 1, createdAt: new Date().toISOString(), reason: null } : null);

  async function runAuto(key: string, label: string, fn: () => Promise<{ error: string | null }> | undefined) {
    setAutoBusy(label);
    setAutoError(null);
    try {
      const res = await fn();
      if (res?.error) setAutoError(res.error);
    } catch (e) {
      setAutoError(e instanceof Error ? e.message : "Automatic step failed.");
    } finally {
      setAutoBusy(null);
      await refreshPipeline();
      void key;
    }
  }

  // Auto-propose on entry. `status === "available"` means the stage has
  // been unlocked but no work has happened yet - the moment to run the AI.
  useEffect(() => {
    if (viewStage === "rooms_envelope" && current.status === "available" && !autoRan.current.rooms_envelope) {
      autoRan.current.rooms_envelope = true;
      runAuto("rooms_envelope", "Applying the AI extraction…", () => manualJRef.current?.autoApplyExtraction());
    }
    if (viewStage === "zones" && current.status === "available" && !autoRan.current.zones) {
      autoRan.current.zones = true;
      runAuto("zones", "Proposing zoning…", () => manualJRef.current?.autoProposeZoning());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewStage, current.status]);

  const manualJProps = {
    projectId,
    initialEnvelope: props.initialEnvelope,
    initialAtticInsulationType: props.initialAtticInsulationType,
    initialFoundationType: props.initialFoundationType,
    initialWindowType: props.initialWindowType,
    initialWindowCount: props.initialWindowCount,
    initialNoVentedAtticOrCrawlspace: props.initialNoVentedAtticOrCrawlspace,
    initialRooms: props.initialRooms,
    winterDesignTempF: props.winterDesignTempF,
    summerDesignTempF: props.summerDesignTempF,
    roomTypeDefaults: props.roomTypeDefaults,
    initialZones: props.initialZones,
    initialAvailableStaticPressureIwc: props.initialAvailableStaticPressureIwc,
    initialSupplyAirTempF: props.initialSupplyAirTempF,
    initialBlowerTespIwc: props.initialBlowerTespIwc,
    initialEvaporatorCoilLossIwc: props.initialEvaporatorCoilLossIwc,
    initialAirFilterLossIwc: props.initialAirFilterLossIwc,
    initialGrillesRegistersLossIwc: props.initialGrillesRegistersLossIwc,
    initialDuctRuns: props.initialDuctRuns,
    initialDuctDiffusers: props.initialDuctDiffusers,
    initialAhuInstallationDetails: props.initialAhuInstallationDetails,
    initialDuctTerminations: props.initialDuctTerminations,
    ductSizingTable: props.ductSizingTable,
    summerCoincidentWetbulbF: props.summerCoincidentWetbulbF,
    equipmentCatalog: props.equipmentCatalog,
    equipmentPerformancePoints: props.equipmentPerformancePoints,
    preferredEquipmentIds: props.preferredEquipmentIds,
    exclusiveEquipmentIds: props.exclusiveEquipmentIds,
    ductInsulationCodeMinimums: props.ductInsulationCodeMinimums,
    initialBuildingFrontFaces: buildingFrontFaces,
    initialDrawings: props.initialDrawings,
    initialPreferredManufacturer: props.initialPreferredManufacturer,
    initialSystemConfiguration: props.initialSystemConfiguration,
    userRole: props.userRole,
    initialDehumidificationSystems: props.initialDehumidificationSystems,
    initialDehumidificationDuctRuns: props.initialDehumidificationDuctRuns,
    dehumidifierCatalogOptions: props.dehumidifierCatalogOptions,
    dehumidifierBlowerPerformancePoints: props.dehumidifierBlowerPerformancePoints,
  };

  return (
    <div className="space-y-6">
      <PipelineRail viewStage={viewStage} onNavigate={setViewStage} />
      {pipelineError && (
        <p className="text-xs text-red-400" role="alert">
          {pipelineError}
        </p>
      )}

      <div className="space-y-6">
        {viewStage === "project" && <ProjectStageBody props={props} />}

        {viewStage === "climate" && (
          <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
            <h2 className="mb-3 text-lg font-semibold text-brand-gold">Confirm Climate Data</h2>
            <p className="mb-4 text-sm text-brand-grey-text">
              County and NOAA/ASHRAE design temperatures are auto-resolved from the project
              address. Confirm them once to unlock the rest of the pipeline.
            </p>
            <ConfirmClimateButton
              projectId={projectId}
              initialConfirmed={climateConfirmed}
              onConfirmed={() => {
                setClimateConfirmed(true);
                void refreshPipeline();
              }}
            />
          </section>
        )}

        {viewStage === "orientation" && (
          <>
            <BuildingOrientationGate
              projectId={projectId}
              initialBuildingFrontFaces={buildingFrontFaces}
              onConfirmed={(v) => {
                setBuildingFrontFaces(v);
                void refreshPipeline();
              }}
            />
            {buildingFrontFaces && !isCardinalCompass(buildingFrontFaces) && (
              <IntercardinalAck projectId={projectId} facing={buildingFrontFaces} />
            )}
          </>
        )}

        {(viewStage === "drawings" || viewStage === "field_review") && (
          <>
            {viewStage === "field_review" && (
              <p className="rounded-md border border-brand-gold/50 bg-brand-gold-base/10 p-3 text-sm text-brand-gold">
                Accept or Override every flagged field below. The pipeline won&apos;t advance
                while any AI-extracted field is still unresolved.
              </p>
            )}
            <DrawingsSection
              projectId={projectId}
              initialDrawings={props.initialDrawings}
              initialFieldResolutions={props.initialFieldResolutions}
              buildingFrontFaces={buildingFrontFaces}
              onMutate={refreshPipeline}
              onApply={(envelope, rooms) =>
                manualJRef.current?.applyExtractedData(envelope, rooms) ??
                Promise.resolve({
                  appliedEnvelope: false,
                  roomsCreated: 0,
                  roomsUpdated: 0,
                  error: null,
                  unmatchedRoomNotes: [],
                })
              }
            />
          </>
        )}

        {/* Manual J family - one instance, kept mounted, renders only the
            currently-viewed stage's sections (pipelineStage). */}
        {manualJMounted && (
          <ManualJWorkflow
            ref={manualJRef}
            pipelineStage={viewStage}
            onPipelineMutate={refreshPipeline}
            {...manualJProps}
          />
        )}

        {viewStage === "manual_j" && (
          <p className="text-sm text-brand-grey-text">
            Manual J is always live. If a number looks wrong, go back and fix the room or
            envelope input that drives it - there is nothing to confirm here.
          </p>
        )}

        {viewStage === "rooms_envelope" && (
          <>
            {autoBusy && <p className="text-sm text-brand-grey-text">{autoBusy}</p>}
            {autoError && (
              <p className="text-sm text-red-400" role="alert">
                {autoError}
              </p>
            )}
            <ProposalPanel
              projectId={projectId}
              proposalName="rooms"
              title="AI-proposed room set + envelope"
              description="The extraction was applied automatically: rooms created, blank envelope fields filled, compass walls rotated, bath/kitchen exhaust drafted. Review the rooms and envelope above, edit anything wrong, then Accept - or Override with a reason."
            />
          </>
        )}

        {viewStage === "zones" && (
          <>
            {autoBusy && <p className="text-sm text-brand-grey-text">{autoBusy}</p>}
            {autoError && (
              <p className="text-sm text-red-400" role="alert">
                {autoError}
              </p>
            )}
            <button
              onClick={() => runAuto("zones", "Proposing zoning…", () => manualJRef.current?.autoProposeZoning())}
              className="rounded-md border border-brand-gold px-4 py-2 text-sm font-semibold text-brand-gold transition hover:bg-brand-gold/10"
            >
              Re-run AI zoning proposal
            </button>
            <ProposalPanel
              projectId={projectId}
              proposalName="zoning"
              title="AI-proposed zoning"
              description="One zone per building level (a small single-level house = one zone); every conditioned room assigned. Edit the zones or reassign rooms above, then Accept - or Override with a reason."
            />
          </>
        )}

        {viewStage === "duct_pins" && (
          <>
            {autoBusy && <p className="text-sm text-brand-grey-text">{autoBusy}</p>}
            {autoError && (
              <p className="text-sm text-red-400" role="alert">
                {autoError}
              </p>
            )}
            <div className="rounded-lg border border-brand-gold bg-brand-gold-base/10 p-5">
              <h3 className="text-sm font-semibold text-brand-gold">Duct-routing pins</h3>
              <p className="mt-1 text-xs text-brand-grey-text">
                Each pin is pre-placed from the extraction (room centres) or a heuristic
                (AHU / return / condenser). Drag any that are wrong on the canvas above, or
                accept them all at once.
              </p>
              <button
                onClick={() =>
                  runAuto("pins", "Placing all AI-suggested pins…", async () => {
                    const r = await manualJRef.current?.confirmAllPins();
                    return r ? { error: r.error } : { error: null };
                  })
                }
                className="mt-3 rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover"
              >
                Confirm all AI-suggested pins
              </button>
            </div>
          </>
        )}

        {viewStage === "manual_d" && (
          <ProposalPanel
            projectId={projectId}
            proposalName="duct_design"
            title="AI-proposed Manual D duct design"
            description="Generate the duct runs from the confirmed pins (button in the Duct Design section above), review the schedule and per-zone CFM compatibility, then Accept - or Override with a reason."
          />
        )}

        {viewStage === "equipment" && (
          <>
            {autoBusy && <p className="text-sm text-brand-grey-text">{autoBusy}</p>}
            {autoError && (
              <p className="text-sm text-red-400" role="alert">
                {autoError}
              </p>
            )}
            <div className="rounded-lg border border-brand-gold bg-brand-gold-base/10 p-5">
              <h3 className="text-sm font-semibold text-brand-gold">Equipment (Manual S)</h3>
              <p className="mt-1 text-xs text-brand-grey-text">
                Accept the top-ranked compatible unit for every zone, or pick a different one
                (with a reason) in the panels above. A zone is not done while its pick is
                still the raw AI proposal.
              </p>
              <button
                onClick={() =>
                  runAuto("equipment", "Accepting AI equipment recommendations…", async () => {
                    const r = await manualJRef.current?.acceptAiEquipment();
                    return r ? { error: r.error } : { error: null };
                  })
                }
                className="mt-3 rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover"
              >
                Accept AI recommendation for all zones
              </button>
            </div>
          </>
        )}

        {viewStage === "ventilation" && (
          <>
            <MakeupAirSection
              projectId={projectId}
              initialExhaustSources={props.initialExhaustSources}
              catalogOptions={props.makeupAirCatalogOptions}
              initialSelectedMakeupAirEquipmentId={props.initialSelectedMakeupAirEquipmentId}
              exhaustFanCatalogOptions={props.exhaustFanCatalogOptions}
              rooms={props.exhaustRoomLookup}
              onMutate={refreshPipeline}
            />
            <ProposalPanel
              projectId={projectId}
              proposalName="ventilation"
              title="Ventilation & dehumidification review"
              description="Confirm the drafted local-exhaust sources, makeup-air need, and dehumidification recommendation above. A project that genuinely needs none is fine - the review is what's gated, not the existence."
            />
          </>
        )}

        {viewStage === "finalize" && (
          <FinalizePanel projectId={projectId}>
            <div className="space-y-6">
              <StalenessBanner projectId={projectId} initialStaleItems={props.initialStaleItems} />
              <GenerateReportsButton
                projectId={projectId}
                initialSnapshot={effectiveSnapshot}
                userRole={props.userRole}
              />
              <ReportSignOffSection
                projectId={projectId}
                latestSnapshot={effectiveSnapshot}
                initialSignOffs={props.initialSignOffs}
                userRole={props.userRole}
              />
            </div>
          </FinalizePanel>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-brand-gold/30 pt-4">
        <button
          onClick={() => prevStage && setViewStage(prevStage)}
          disabled={!prevStage}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-brand-silver transition hover:border-brand-gold-hover disabled:opacity-40"
        >
          ← Back
        </button>
        <span className="text-xs text-brand-grey-text">
          {refreshing ? "checking…" : current.exitGateMet ? "Stage complete" : `${current.blockers.length} item(s) left`}
        </span>
        <button
          onClick={async () => {
            await refreshPipeline();
            if (nextStage) setViewStage(nextStage);
          }}
          disabled={!nextStage || !current.exitGateMet}
          title={!current.exitGateMet ? current.blockers.join("; ") : undefined}
          className="rounded-md bg-brand-gold px-5 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function ProjectStageBody({ props }: { props: ProjectWorkspaceProps }) {
  const { state } = usePipeline();
  return (
    <section className="rounded-lg border border-brand-gold/50 bg-brand-bg p-6">
      <h2 className="mb-3 text-lg font-semibold text-brand-gold">Project</h2>
      <p className="text-sm text-brand-grey-text">
        This residential project is created. The guided pipeline below walks through every
        step from here to a finalized, report-ready calculation - one stage at a time, no
        skipping.
      </p>
      {!state.stages.project.exitGateMet && (
        <ul className="mt-3 list-inside list-disc text-sm text-red-400">
          {state.stages.project.blockers.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-brand-grey-text">Role: {props.userRole}</p>
    </section>
  );
}

function IntercardinalAck({ projectId, facing }: { projectId: string; facing: Compass8 }) {
  const { state, refreshPipeline } = usePipeline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acked = state.stages.orientation.exitGateMet;

  async function ack() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be signed in.");
      setBusy(false);
      return;
    }
    const { error: insertError } = await supabase.from("field_resolutions").insert({
      project_id: projectId,
      table_name: "projects",
      record_id: projectId,
      field_name: "orientation_intercardinal_ack",
      ai_extracted_value: null,
      final_value: facing,
      resolution_type: "accepted",
      override_reason: `Building genuinely faces ${facing}; per-room compass wall data will be entered by hand.`,
      resolved_by: user.id,
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    await refreshPipeline();
  }

  if (acked) return null;
  return (
    <section className="rounded-lg border border-brand-gold bg-brand-gold-base/10 p-5">
      <h3 className="text-sm font-semibold text-brand-gold">Intercardinal orientation</h3>
      <p className="mt-1 text-xs text-brand-grey-text">
        You picked {facing}. The Manual J room schema only has N/E/S/W wall columns, so the
        automatic wall rotation can&apos;t run for this building - each room&apos;s compass
        walls will have to be entered by hand. Acknowledge to proceed.
      </p>
      <button
        onClick={ack}
        disabled={busy}
        className="mt-3 rounded-md bg-brand-gold px-4 py-2 text-sm font-semibold text-black transition hover:bg-brand-gold-hover disabled:opacity-50"
      >
        {busy ? "Saving…" : "I understand - proceed"}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
