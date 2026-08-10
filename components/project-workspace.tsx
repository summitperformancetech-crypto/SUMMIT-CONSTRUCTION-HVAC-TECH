"use client";

import { useRef, useState } from "react";
import { ConfirmClimateButton } from "@/components/confirm-climate-button";
import { DrawingsSection } from "@/components/drawings-section";
import {
  ManualJWorkflow,
  type ManualJWorkflowHandle,
  type RoomRow,
} from "@/components/manual-j-workflow";
import type { ManualJEnvelope } from "@/lib/manualJ";
import type { DrawingRow } from "@/lib/drawingExtraction";

export function ProjectWorkspace({
  projectId,
  initialClimateConfirmed,
  initialEnvelope,
  initialAtticInsulationType,
  initialRooms,
  initialDrawings,
  winterDesignTempF,
  summerDesignTempF,
}: {
  projectId: string;
  initialClimateConfirmed: boolean;
  initialEnvelope: ManualJEnvelope;
  initialAtticInsulationType: string | null;
  initialRooms: RoomRow[];
  initialDrawings: DrawingRow[];
  winterDesignTempF: number | null;
  summerDesignTempF: number | null;
}) {
  const [climateConfirmed, setClimateConfirmed] = useState(initialClimateConfirmed);
  const manualJRef = useRef<ManualJWorkflowHandle>(null);

  return (
    <>
      <div className="mb-6">
        <ConfirmClimateButton
          projectId={projectId}
          initialConfirmed={initialClimateConfirmed}
          onConfirmed={() => setClimateConfirmed(true)}
        />
      </div>

      {climateConfirmed && (
        <div className="mb-6">
          <DrawingsSection
            projectId={projectId}
            initialDrawings={initialDrawings}
            onApply={(envelope, rooms) =>
              manualJRef.current?.applyExtractedData(envelope, rooms) ??
              Promise.resolve({ appliedEnvelope: false, roomsCreated: 0 })
            }
          />
        </div>
      )}

      <ManualJWorkflow
        ref={manualJRef}
        projectId={projectId}
        initialEnvelope={initialEnvelope}
        initialAtticInsulationType={initialAtticInsulationType}
        initialRooms={initialRooms}
        winterDesignTempF={winterDesignTempF}
        summerDesignTempF={summerDesignTempF}
      />
    </>
  );
}
