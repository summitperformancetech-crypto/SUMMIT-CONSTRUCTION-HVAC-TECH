"use client";

import { useRef, useState } from "react";
import { ConfirmClimateButton } from "@/components/confirm-climate-button";
import { DrawingsSection } from "@/components/drawings-section";
import {
  ManualJWorkflow,
  type ManualJWorkflowHandle,
  type RoomRow,
} from "@/components/manual-j-workflow";
import type { DuctRunRow } from "@/components/duct-design-section";
import type { ManualJEnvelope, ManualJZone, RoomTypeDefault } from "@/lib/manualJ";
import type { DuctSizingTableRow } from "@/lib/manualD";
import type { EquipmentCatalogEntry, PerformancePoint } from "@/lib/manualS";
import type { DrawingRow } from "@/lib/drawingExtraction";
import type { FieldResolution } from "@/lib/fieldResolutions";
import type { Compass8 } from "@/lib/constants/compass";

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
  initialAvailableStaticPressureIwc,
  initialSupplyAirTempF,
  initialDuctRuns,
  ductSizingTable,
  summerCoincidentWetbulbF,
  equipmentCatalog,
  equipmentPerformancePoints,
  initialSelectedEquipmentId,
  initialEquipmentSelectionNotes,
  preferredEquipmentIds,
  exclusiveEquipmentIds,
  ductInsulationCodeMinimums,
  initialBuildingFrontFaces,
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
  initialAvailableStaticPressureIwc: number | null;
  initialSupplyAirTempF: number | null;
  initialDuctRuns: DuctRunRow[];
  ductSizingTable: DuctSizingTableRow[];
  summerCoincidentWetbulbF: number | null;
  equipmentCatalog: EquipmentCatalogEntry[];
  equipmentPerformancePoints: PerformancePoint[];
  initialSelectedEquipmentId: string | null;
  initialEquipmentSelectionNotes: string | null;
  preferredEquipmentIds: ReadonlySet<string>;
  exclusiveEquipmentIds: ReadonlySet<string>;
  ductInsulationCodeMinimums: { duct_location: string; min_r_value: number }[];
  initialBuildingFrontFaces: Compass8 | null;
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
              Promise.resolve({
                appliedEnvelope: false,
                roomsCreated: 0,
                roomsUpdated: 0,
                error: null,
                unmatchedRoomNotes: [],
              })
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
        initialAvailableStaticPressureIwc={initialAvailableStaticPressureIwc}
        initialSupplyAirTempF={initialSupplyAirTempF}
        initialDuctRuns={initialDuctRuns}
        ductSizingTable={ductSizingTable}
        summerCoincidentWetbulbF={summerCoincidentWetbulbF}
        equipmentCatalog={equipmentCatalog}
        equipmentPerformancePoints={equipmentPerformancePoints}
        initialSelectedEquipmentId={initialSelectedEquipmentId}
        initialEquipmentSelectionNotes={initialEquipmentSelectionNotes}
        preferredEquipmentIds={preferredEquipmentIds}
        exclusiveEquipmentIds={exclusiveEquipmentIds}
        ductInsulationCodeMinimums={ductInsulationCodeMinimums}
        initialBuildingFrontFaces={initialBuildingFrontFaces}
      />
    </>
  );
}
