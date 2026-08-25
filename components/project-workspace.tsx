"use client";

import { useRef, useState } from "react";
import { ConfirmClimateButton } from "@/components/confirm-climate-button";
import { BuildingOrientationGate } from "@/components/building-orientation-gate";
import { DrawingsSection } from "@/components/drawings-section";
import {
  ManualJWorkflow,
  type ManualJWorkflowHandle,
  type RoomRow,
  type ZoneRow,
} from "@/components/manual-j-workflow";
import type { DuctRunRow } from "@/components/duct-design-section";
import type { ManualJEnvelope, RoomTypeDefault } from "@/lib/manualJ";
import type { DuctSizingTableRow } from "@/lib/manualD";
import type { EquipmentCatalogEntry, PerformancePoint } from "@/lib/manualS";
import type { DrawingRow } from "@/lib/drawingExtraction";
import type { FieldResolution } from "@/lib/fieldResolutions";
import type { Compass8 } from "@/lib/constants/compass";
import type { HvacSystemConfiguration } from "@/components/system-configuration-section";

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
  initialBlowerTespIwc,
  initialEvaporatorCoilLossIwc,
  initialAirFilterLossIwc,
  initialGrillesRegistersLossIwc,
  initialDuctRuns,
  ductSizingTable,
  summerCoincidentWetbulbF,
  equipmentCatalog,
  equipmentPerformancePoints,
  preferredEquipmentIds,
  exclusiveEquipmentIds,
  ductInsulationCodeMinimums,
  initialBuildingFrontFaces,
  initialPreferredManufacturer,
  initialSystemConfiguration,
  userRole,
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
  initialZones: ZoneRow[];
  initialAvailableStaticPressureIwc: number | null;
  initialSupplyAirTempF: number | null;
  initialBlowerTespIwc: number | null;
  initialEvaporatorCoilLossIwc: number | null;
  initialAirFilterLossIwc: number | null;
  initialGrillesRegistersLossIwc: number | null;
  initialDuctRuns: DuctRunRow[];
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
}) {
  const [climateConfirmed, setClimateConfirmed] = useState(initialClimateConfirmed);
  const [buildingFrontFaces, setBuildingFrontFaces] = useState(initialBuildingFrontFaces);
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

      {/* Building-orientation-confirmed-before-extraction (2026-08-15):
          this gate must clear before DrawingsSection even renders - a
          drawing can't be uploaded (and therefore extraction can't run)
          until the front-elevation compass direction is confirmed, so
          app/api/drawings/extract/route.ts always has it available to
          give the model as known context, never something to guess per
          room. BuildingOrientationSection (still rendered further down,
          inside ManualJWorkflow) is unchanged - it remains the mechanism
          for re-running the auto-fill transform on existing rooms, and
          for changing the confirmed direction later. */}
      {climateConfirmed && (
        <div className="mb-6">
          <BuildingOrientationGate
            projectId={projectId}
            initialBuildingFrontFaces={buildingFrontFaces}
            onConfirmed={setBuildingFrontFaces}
          />
        </div>
      )}

      {climateConfirmed && buildingFrontFaces && (
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
        initialBlowerTespIwc={initialBlowerTespIwc}
        initialEvaporatorCoilLossIwc={initialEvaporatorCoilLossIwc}
        initialAirFilterLossIwc={initialAirFilterLossIwc}
        initialGrillesRegistersLossIwc={initialGrillesRegistersLossIwc}
        initialDuctRuns={initialDuctRuns}
        ductSizingTable={ductSizingTable}
        summerCoincidentWetbulbF={summerCoincidentWetbulbF}
        equipmentCatalog={equipmentCatalog}
        equipmentPerformancePoints={equipmentPerformancePoints}
        preferredEquipmentIds={preferredEquipmentIds}
        exclusiveEquipmentIds={exclusiveEquipmentIds}
        ductInsulationCodeMinimums={ductInsulationCodeMinimums}
        initialBuildingFrontFaces={buildingFrontFaces}
        initialPreferredManufacturer={initialPreferredManufacturer}
        initialSystemConfiguration={initialSystemConfiguration}
        userRole={userRole}
      />
    </>
  );
}
