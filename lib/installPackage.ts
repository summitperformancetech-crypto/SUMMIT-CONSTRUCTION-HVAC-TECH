// Catalog Expansion + Recommended Install Package, Section 5 - the core
// new capability: turns a Manual S compatibility match into a complete,
// purchasable bill of materials, not just an outdoor-to-indoor
// compatibility score. Every line item below is either resolved from
// real catalog data (equipment_electrical_specs, refrigerant_lineset_
// specs, equipment_coil_matching, equipment_heat_kit_compatibility,
// equipment_filter_specs - see the migrations that built them) or
// explicitly marked unresolved/flagged - never a silently invented BOM
// line, per this project's standing discipline.
import type { EquipmentCatalogEntry } from "./manualS";
import type { DuctDiffuserRow, DuctTerminationRow } from "./ductRouting";

export type InstallPackageLineItemCategory =
  | "coil_matching"
  | "electrical"
  | "refrigerant_lineset"
  | "heat_kit"
  | "filter"
  | "diffuser"
  | "duct_material"
  | "termination";

export type InstallPackageLineItemStatus = "resolved" | "unresolved" | "flagged";

export type InstallPackageLineItem = {
  category: InstallPackageLineItemCategory;
  status: InstallPackageLineItemStatus;
  summary: string;
  detail: string;
  sourceEquipmentId: string | null;
};

export type InstallPackage = {
  zoneId: string;
  zoneName: string;
  lineItems: InstallPackageLineItem[];
  // Section 5 step 8 - the FULL package score: resolvedCount /
  // totalLineItems, where a 'flagged' item (e.g. an uncertified coil
  // pairing) counts the same as 'unresolved' toward incompleteness. This
  // is deliberately never the Manual S equipment-compatibility score -
  // see this module's own header comment and the spec's own worked
  // example (a 98%-compatible match with an unresolved line-set length
  // must not present as "ready to install").
  completenessPercent: number;
  uncertifiedPairing: boolean;
};

export type ElectricalSpec = {
  equipmentId: string;
  voltagePhase: string;
  minCircuitAmpacity: number;
  maxOvercurrentProtection: number;
};

export type LinesetSpec = {
  equipmentId: string;
  liquidLineDiameterIn: number;
  vaporLineDiameterIn: number;
  maxEquivalentLengthFt: number | null;
  lengthDerateNotes: string | null;
};

export type HeatKitOption = {
  equipmentId: string;
  heatKitKw: number;
  heatKitModel: string | null;
  minimumAirflowCfm: number | null;
};

export type FilterSpec = {
  equipmentId: string;
  filterFurnished: boolean;
  filterType: string | null;
  filterSize: string | null;
  mervRatingRecommended: string | null;
};

export type InstallPackageInputs = {
  zoneId: string;
  zoneName: string;
  outdoorUnit: EquipmentCatalogEntry | null;
  indoorUnit: EquipmentCatalogEntry | null;
  // Real equipment_coil_matching rows for the outdoor unit in question -
  // caller filters, this module just checks membership.
  coilMatchIndoorUnitIds: string[];
  electricalSpecByEquipmentId: Map<string, ElectricalSpec>;
  linesetSpecByEquipmentId: Map<string, LinesetSpec>;
  heatKitOptionsForIndoorUnit: HeatKitOption[];
  filterSpecByEquipmentId: Map<string, FilterSpec>;
  // Real deficit the outdoor unit alone can't cover at winter design
  // conditions, in Btu/h - 0 or null when no supplemental heat is
  // needed. Computed by the caller (lib/reportData.ts), which already
  // has the Manual J heating load and Manual S capacity-at-design
  // interpolation this module deliberately does not duplicate.
  supplementalHeatDeficitBtuh: number | null;
  requiredCfm: number;
  // Real distance between the AHU pin and the condenser/outdoor-unit
  // pin, in feet - null when either pin isn't placed yet or the two
  // pins aren't on a sheet with a resolvable real scale (see
  // zones.condenser_position_* and lib/ductRouting.ts's
  // resolveSheetScale). Never estimated.
  lineSetLengthFt: number | null;
  diffusers: DuctDiffuserRow[];
  ductMaterialDefault: { manufacturer: string; productLine: string } | null;
  terminations: DuctTerminationRow[];
};

function equipmentLabel(equipment: EquipmentCatalogEntry): string {
  return `${equipment.manufacturer} ${equipment.modelNumber}`;
}

// Real minimum heat-kit kW for a given real deficit, per real 3412 Btu/h
// per kW - not a fabricated conversion, the standard electric-resistance
// heat figure ACCA/AHRI literature itself uses.
export function requiredHeatKitKw(supplementalHeatDeficitBtuh: number): number {
  return supplementalHeatDeficitBtuh / 3412;
}

export function computeInstallPackage(inputs: InstallPackageInputs): InstallPackage {
  const lineItems: InstallPackageLineItem[] = [];
  let uncertifiedPairing = false;

  // Step 1 - coil matching (Section 5, step 1: a hard flag, not a soft
  // warning, per the spec's own wording; Open Question 3's answer treats
  // it as a documented-override flag rather than a hard block, handled
  // at the UI/acknowledgement layer - see install_packages'
  // uncertified_pairing_acknowledged_* columns).
  if (!inputs.outdoorUnit || !inputs.indoorUnit) {
    lineItems.push({
      category: "coil_matching",
      status: "unresolved",
      summary: "Outdoor and indoor unit not both selected",
      detail: "This zone needs both an outdoor unit (zones.selected_equipment_id) and an indoor air handler/coil (zones.selected_air_handler_equipment_id) selected before a real coil-matching check can run.",
      sourceEquipmentId: null,
    });
  } else {
    const certified = inputs.coilMatchIndoorUnitIds.includes(inputs.indoorUnit.id);
    uncertifiedPairing = !certified;
    lineItems.push({
      category: "coil_matching",
      status: certified ? "resolved" : "flagged",
      summary: certified
        ? `${equipmentLabel(inputs.outdoorUnit)} + ${equipmentLabel(inputs.indoorUnit)} is a real AHRI-certified combination`
        : `${equipmentLabel(inputs.outdoorUnit)} + ${equipmentLabel(inputs.indoorUnit)} has no real certified combination on file`,
      detail: certified
        ? "Confirmed against equipment_coil_matching, sourced from the manufacturer's own published combination data."
        : "No row in equipment_coil_matching pairs these two exact models - either this combination genuinely isn't certified, or it hasn't been sourced into the catalog yet. An uncertified combination's real capacity is unverified, not just \"probably fine.\" Proceeding requires a documented acknowledgement (see this package's uncertified_pairing_acknowledged fields) that releases Summit of liability for that decision.",
      sourceEquipmentId: inputs.outdoorUnit.id,
    });
  }

  // Step 2 - electrical.
  for (const unit of [inputs.outdoorUnit, inputs.indoorUnit]) {
    if (!unit) continue;
    const spec = inputs.electricalSpecByEquipmentId.get(unit.id);
    lineItems.push({
      category: "electrical",
      status: spec ? "resolved" : "unresolved",
      summary: spec
        ? `${equipmentLabel(unit)}: ${spec.minCircuitAmpacity}A MCA, ${spec.maxOvercurrentProtection}A max breaker/fuse, ${spec.voltagePhase}`
        : `${equipmentLabel(unit)}: no electrical nameplate data on file`,
      detail: spec
        ? "Real MCA/MOCP/voltage from equipment_electrical_specs, sourced from the manufacturer's own Product Specifications table."
        : "This model has no equipment_electrical_specs row yet - not sourced, not fabricated.",
      sourceEquipmentId: unit.id,
    });
  }

  // Step 3 - refrigerant line-set sizing.
  if (inputs.outdoorUnit) {
    const lineset = inputs.linesetSpecByEquipmentId.get(inputs.outdoorUnit.id);
    if (!lineset) {
      lineItems.push({
        category: "refrigerant_lineset",
        status: "unresolved",
        summary: `${equipmentLabel(inputs.outdoorUnit)}: no refrigerant lineset data on file`,
        detail: "This model has no refrigerant_lineset_specs row yet - not sourced, not fabricated.",
        sourceEquipmentId: inputs.outdoorUnit.id,
      });
    } else if (inputs.lineSetLengthFt == null) {
      lineItems.push({
        category: "refrigerant_lineset",
        status: "unresolved",
        summary: `${equipmentLabel(inputs.outdoorUnit)}: liquid ${lineset.liquidLineDiameterIn}in / vapor ${lineset.vaporLineDiameterIn}in - real run length not yet known`,
        detail: "Line diameters are real, but the actual outdoor-unit-to-AHU run length can't be computed until the condenser/outdoor-unit position is pinned on the drawing (zones.condenser_position_*), the same way the AHU and return-air plenum are.",
        sourceEquipmentId: inputs.outdoorUnit.id,
      });
    } else if (lineset.maxEquivalentLengthFt != null && inputs.lineSetLengthFt > lineset.maxEquivalentLengthFt) {
      lineItems.push({
        category: "refrigerant_lineset",
        status: "flagged",
        summary: `${equipmentLabel(inputs.outdoorUnit)}: real run ${inputs.lineSetLengthFt.toFixed(1)}ft exceeds the manufacturer's ${lineset.maxEquivalentLengthFt}ft max`,
        detail: lineset.lengthDerateNotes ?? "Longer runs require the manufacturer's own long-line sizing guidance - a flat length limit was exceeded here.",
        sourceEquipmentId: inputs.outdoorUnit.id,
      });
    } else {
      lineItems.push({
        category: "refrigerant_lineset",
        status: "resolved",
        summary: `${equipmentLabel(inputs.outdoorUnit)}: liquid ${lineset.liquidLineDiameterIn}in / vapor ${lineset.vaporLineDiameterIn}in, real run ${inputs.lineSetLengthFt.toFixed(1)}ft`,
        detail:
          lineset.maxEquivalentLengthFt != null
            ? `Within the manufacturer's ${lineset.maxEquivalentLengthFt}ft max equivalent length.`
            : "No published max-length figure to check against for this model (a real, disclosed gap in the source document, not assumed unlimited) - real diameters and run length are confirmed.",
        sourceEquipmentId: inputs.outdoorUnit.id,
      });
    }
  }

  // Step 4 - heat kit.
  const deficit = inputs.supplementalHeatDeficitBtuh ?? 0;
  if (deficit > 0) {
    if (!inputs.indoorUnit) {
      lineItems.push({
        category: "heat_kit",
        status: "unresolved",
        summary: "Supplemental electric heat is needed but no indoor air handler is selected yet",
        detail: `Real Manual J/S deficit at design conditions: ${Math.round(deficit).toLocaleString()} Btu/h (${requiredHeatKitKw(deficit).toFixed(1)}kW minimum).`,
        sourceEquipmentId: null,
      });
    } else {
      const candidates = inputs.heatKitOptionsForIndoorUnit
        .filter((k) => k.heatKitKw * 3412 >= deficit)
        .filter((k) => k.minimumAirflowCfm == null || k.minimumAirflowCfm <= inputs.requiredCfm)
        .sort((a, b) => a.heatKitKw - b.heatKitKw);
      const chosen = candidates[0] ?? null;
      lineItems.push({
        category: "heat_kit",
        status: chosen ? "resolved" : "unresolved",
        summary: chosen
          ? `${equipmentLabel(inputs.indoorUnit)}: ${chosen.heatKitKw}kW heat kit${chosen.heatKitModel ? ` (${chosen.heatKitModel})` : ""} covers the real ${Math.round(deficit).toLocaleString()} Btu/h deficit`
          : `${equipmentLabel(inputs.indoorUnit)}: no cataloged heat kit covers the real ${Math.round(deficit).toLocaleString()} Btu/h deficit`,
        detail: chosen
          ? "Selected from equipment_heat_kit_compatibility - the smallest real kW option that both covers the deficit and meets its own minimum-airflow requirement (when published)."
          : "Either no equipment_heat_kit_compatibility rows exist for this model yet, or none published meets both the real kW and minimum-airflow requirement - not fabricated.",
        sourceEquipmentId: inputs.indoorUnit.id,
      });
    }
  }

  // Step 5 - filter.
  if (inputs.indoorUnit) {
    const filter = inputs.filterSpecByEquipmentId.get(inputs.indoorUnit.id);
    lineItems.push({
      category: "filter",
      status: filter ? "resolved" : "unresolved",
      summary: filter
        ? `${equipmentLabel(inputs.indoorUnit)}: ${filter.filterFurnished ? "factory-furnished" : "field-supplied"} filter, ${filter.filterSize ?? "size not on file"}`
        : `${equipmentLabel(inputs.indoorUnit)}: no filter spec on file`,
      detail: filter
        ? `Real spec from equipment_filter_specs.${filter.mervRatingRecommended ? ` Recommended MERV: ${filter.mervRatingRecommended}.` : ""}`
        : "This model has no equipment_filter_specs row yet - not sourced, not fabricated.",
      sourceEquipmentId: inputs.indoorUnit.id,
    });
  }

  // Step 6 - diffusers + duct material, inherited from the project's own
  // already-resolved Manual D diagram data, never re-asked here.
  lineItems.push({
    category: "diffuser",
    status: inputs.diffusers.length > 0 ? "resolved" : "unresolved",
    summary:
      inputs.diffusers.length > 0
        ? `${inputs.diffusers.length} real diffuser${inputs.diffusers.length === 1 ? "" : "s"} logged for this zone`
        : "No diffusers logged for this zone yet",
    detail:
      inputs.diffusers.length > 0
        ? "Inherited from the project's own duct_diffusers records - not re-asked here."
        : "This zone's duct_diffusers table has no rows yet.",
    sourceEquipmentId: null,
  });
  lineItems.push({
    category: "duct_material",
    status: inputs.ductMaterialDefault ? "resolved" : "unresolved",
    summary: inputs.ductMaterialDefault
      ? `${inputs.ductMaterialDefault.manufacturer} ${inputs.ductMaterialDefault.productLine}`
      : "No org default duct material selected",
    detail: inputs.ductMaterialDefault
      ? "From this org's duct_material_org_defaults, referencing a real cataloged product (duct_material_hardware_catalog)."
      : "No duct_material_org_defaults row exists for this org yet.",
    sourceEquipmentId: null,
  });

  // Step 7 - terminations.
  lineItems.push({
    category: "termination",
    status: inputs.terminations.length > 0 ? "resolved" : "unresolved",
    summary:
      inputs.terminations.length > 0
        ? `${inputs.terminations.length} real termination${inputs.terminations.length === 1 ? "" : "s"} logged for this zone`
        : "No termination hardware logged for this zone yet",
    detail:
      inputs.terminations.length > 0
        ? "Inherited from the project's own duct_terminations records."
        : "This zone's duct_terminations table has no rows yet - this may be correct (not every zone needs one) or simply not entered; not assumed either way.",
    sourceEquipmentId: null,
  });

  // Step 8 - completeness score. A 'flagged' item counts as incomplete,
  // same as 'unresolved' - see this module's own header comment.
  const resolvedCount = lineItems.filter((l) => l.status === "resolved").length;
  const completenessPercent = lineItems.length > 0 ? (resolvedCount / lineItems.length) * 100 : 0;

  return {
    zoneId: inputs.zoneId,
    zoneName: inputs.zoneName,
    lineItems,
    completenessPercent,
    uncertifiedPairing,
  };
}
