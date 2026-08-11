"use client";

import { useRef, useState } from "react";
import { ConfirmClimateButton } from "@/components/confirm-climate-button";
import { DrawingsSection } from "@/components/drawings-section";
import {
  ManualJWorkflow,
  type ManualJWorkflowHandle,
  type RoomRow,
} from "@/components/manual-j-workflow";
import type { ManualJEnvelope, ManualJZone, RoomTypeDefault } from "@/lib/manualJ";
import type { DrawingRow } from "@/lib/drawingExtraction";
import type { FieldResolution } from "@/lib/fieldResolutions";

export function ProjectWorkspace({
  projectId,
  initialClimateConfirmed,
  initialEnvelope,
  initialAtticInsulationType,
  initialFoundationType,
  initialWindowType,
  initialWindowCount,
  initialRooms,
  initialDrawings,
  initialFieldResolutions,
  winterDesignTempF,
  summerDesignTempF,
  roomTypeDefaults,
  initialZones,
}: {
  projectId: string;
  initialClimateConfirmed: boolean;
  initialEnvelope: ManualJEnvelope;
  initialAtticInsulationType: string | null;
  initialFoundationType: string | null;
  initialWindowType: string | null;
  initialWindowCount: number | null;
  initialRooms: RoomRow[];
  initialDrawings: DrawingRow[];
  initialFieldResolutions: FieldResolution[];
  winterDesignTempF: number | null;
  summerDesignTempF: number | null;
  roomTypeDefaults: RoomTypeDefault[];
  initialZones: ManualJZone[];
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
            initialFieldResolutions={initialFieldResolutions}
            onApply={(envelope, rooms) =>
              manualJRef.current?.applyExtractedData(envelope, rooms) ??
              Promise.resolve({ appliedEnvelope: false, roomsCreated: 0, roomsUpdated: 0, error: null })
            }
          />
        </div>
      )}

      <ManualJWorkflow
        ref={manualJRef}
        projectId={projectId}
        initialEnvelope={initialEnvelope}
        initialAtticInsulationType={initialAtticInsulationType}
        initialFoundationType={initialFoundationType}
        initialWindowType={initialWindowType}
        initialWindowCount={initialWindowCount}
        initialRooms={initialRooms}
        winterDesignTempF={winterDesignTempF}
        summerDesignTempF={summerDesignTempF}
        roomTypeDefaults={roomTypeDefaults}
        initialZones={initialZones}
      />
    </>
  );
}
