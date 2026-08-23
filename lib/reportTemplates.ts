// HTML templates for the two Phase 7 report outputs, rendered to PDF by
// Puppeteer in app/api/reports/route.ts. Both are generated from the
// exact same ReportData (lib/reportData.ts) - only the rendering differs,
// per the spec's "do not duplicate data entry, only the rendering
// differs" instruction.
import type { ReportData } from "./reportData";
import { resolvedFieldResolutionsAudit } from "./reportData";

const BRAND = {
  bg: "#080808",
  gold: "#a67c52",
  goldHover: "#c99a6b",
  goldBase: "#8d6e4a",
  greyText: "#6b6b6b",
};

function fmt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

function esc(value: string | null | undefined): string {
  if (value == null) return "";
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function projectAddress(data: ReportData): string {
  const p = data.project;
  const line2 = p.address_line2 ? `, ${esc(p.address_line2)}` : "";
  return `${esc(p.address_line1)}${line2}, ${esc(p.city)}, ${esc(p.state)} ${esc(p.zip)}`;
}

const PROJECT_TYPE_LABEL: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  industrial: "Industrial",
};

const BASE_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; color: #1a1a1a; font-size: 11px; }
  h1, h2, h3 { margin: 0 0 8px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #ddd; }
  th { text-transform: uppercase; font-size: 9px; letter-spacing: 0.04em; color: ${BRAND.greyText}; border-bottom: 2px solid ${BRAND.gold}; }
  td.num, th.num { text-align: right; }
  tfoot td { font-weight: 600; border-top: 2px solid ${BRAND.gold}; border-bottom: none; }
  section { margin: 0 24px 20px 24px; page-break-inside: avoid; }
  .section-title { font-size: 14px; font-weight: 700; color: ${BRAND.goldBase}; border-bottom: 2px solid ${BRAND.gold}; padding-bottom: 4px; margin-bottom: 10px; }
  .muted { color: ${BRAND.greyText}; }
  .badge { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.03em; }
  .badge-accepted { background: #e6f0e6; color: #3d6b3d; }
  .badge-overridden { background: #fdeeea; color: #a13a2b; }
`;

function htmlShell(title: string, headerHtml: string, bodyHtml: string, footerHtml: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>${BASE_STYLES}</style>
</head>
<body>
${headerHtml}
${bodyHtml}
${footerHtml}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Internal engineering report - full detail, for the file / code officials.
// ---------------------------------------------------------------------------
export function renderInternalReportHtml(data: ReportData): string {
  // Data Integrity Addendum, Section 1: "Generated" is always this PDF
  // file's own render time; "Data frozen as of" is when the underlying
  // figures were snapshotted (calculation_snapshots) and stays fixed
  // across every future regeneration until an explicit revision - see
  // app/api/reports/route.ts. data.snapshot is only ever null if this
  // ReportData somehow reached the template without going through that
  // route (shouldn't happen in practice, but not asserted away).
  const snapshotLine = data.snapshot
    ? `Data frozen as of ${new Date(data.snapshot.createdAt).toLocaleString()} (v${data.snapshot.version}${data.snapshot.reason ? ` — ${esc(data.snapshot.reason)}` : ""})`
    : "Data not yet snapshotted";
  const header = `
    <div style="padding:16px 24px;border-bottom:3px solid ${BRAND.gold};">
      <h1 style="font-size:18px;">${esc(data.project.name)}</h1>
      <p class="muted">${projectAddress(data)} · ${PROJECT_TYPE_LABEL[data.project.project_type] ?? data.project.project_type} · Internal Engineering Report · Generated ${new Date(data.generatedAt).toLocaleString()}</p>
      <p class="muted">${snapshotLine}</p>
    </div>
  `;

  const climateSection = `
    <section>
      <div class="section-title">Climate Zone / Design Conditions</div>
      ${
        data.climateZone
          ? `<table>
              <tr><td>County</td><td class="num">${esc(data.climateZone.county)}</td></tr>
              <tr><td>IECC Zone</td><td class="num">${esc(data.climateZone.iecc_zone)}</td></tr>
              <tr><td>Winter Design Temp</td><td class="num">${data.climateZone.winter_design_temp_f}°F</td></tr>
              <tr><td>Summer Design Temp</td><td class="num">${data.climateZone.summer_design_temp_f}°F</td></tr>
              <tr><td>Summer Coincident Wet Bulb</td><td class="num">${data.climateZone.summer_coincident_wetbulb_f ?? "—"}°F</td></tr>
            </table>
            <p class="muted">Source: climate_zone_reference (county-level ACCA/RESNET-derived design conditions).</p>`
          : `<p class="muted">No climate zone data on file for this project's location.</p>`
      }
    </section>
  `;

  let residentialSections = "";
  if (data.residential) {
    const {
      manualJ,
      ductSchedule,
      ductRuns,
      rooms,
      zoneEquipment,
      ductInsulationCompliance,
    } = data.residential;
    const roomNameById = new Map(rooms.map((r) => [r.id, r.name]));
    const ductRunById = new Map(ductRuns.map((r) => [r.id, r]));
    const complianceByRunId = new Map(ductInsulationCompliance.map((c) => [c.runId, c]));
    function ductRunLabel(runId: string): string {
      const run = ductRunById.get(runId);
      if (!run) return runId;
      if (run.run_type === "trunk") return "Trunk";
      const roomName = run.room_id ? roomNameById.get(run.room_id) : null;
      return `Branch — ${roomName ?? "Unknown room"}`;
    }

    const roomRows = manualJ.rooms
      .map(
        (r) => `<tr>
          <td>${esc(r.roomName)}</td>
          <td class="num">${fmt(r.heatingBtuh)}</td>
          <td class="num">${fmt(r.coolingSensibleBtuh)}</td>
          <td class="num">${fmt(r.coolingLatentBtuh)}</td>
          <td class="num">${fmt(r.coolingTotalBtuh)}</td>
        </tr>`,
      )
      .join("");

    const zoneRows = manualJ.zones
      .map(
        (z) => `<tr>
          <td>${esc(z.zoneName)}${z.zoneId === null ? ' <span class="muted">(unassigned)</span>' : ""}</td>
          <td class="num">${fmt(z.heatingBtuh)}</td>
          <td class="num">${fmt(z.coolingSensibleBtuh)}</td>
          <td class="num">${fmt(z.coolingLatentBtuh)}</td>
          <td class="num">${fmt(z.coolingTotalBtuh)}</td>
        </tr>`,
      )
      .join("");

    residentialSections += `
      <section>
        <div class="section-title">Manual J — Room-by-Room Load Detail</div>
        <table>
          <thead><tr><th>Room</th><th class="num">Heating Btu/hr</th><th class="num">Cooling Sensible</th><th class="num">Cooling Latent</th><th class="num">Cooling Total</th></tr></thead>
          <tbody>${roomRows}</tbody>
          <tfoot><tr><td>Whole House</td><td class="num">${fmt(manualJ.wholeHouse.heatingBtuh)}</td><td class="num">${fmt(manualJ.wholeHouse.coolingSensibleBtuh)}</td><td class="num">${fmt(manualJ.wholeHouse.coolingLatentBtuh)}</td><td class="num">${fmt(manualJ.wholeHouse.coolingTotalBtuh)}</td></tr></tfoot>
        </table>
        <p class="muted">Doors: ${fmt(manualJ.wholeHouse.doorHeatingBtuh)} Btu/hr heating / ${fmt(manualJ.wholeHouse.doorCoolingBtuh)} Btu/hr cooling (included above). ASHRAE 62.2 ventilation: ${fmt(manualJ.wholeHouse.ventilationCfm)} CFM, ${fmt(manualJ.wholeHouse.ventilationHeatingBtuh)} Btu/hr heating / ${fmt(manualJ.wholeHouse.ventilationCoolingSensibleBtuh + manualJ.wholeHouse.ventilationCoolingLatentBtuh)} Btu/hr cooling (included above).</p>
      </section>

      ${
        manualJ.zones.length > 0
          ? `<section>
              <div class="section-title">Zone Summary</div>
              <table>
                <thead><tr><th>Zone</th><th class="num">Heating Btu/hr</th><th class="num">Cooling Sensible</th><th class="num">Cooling Latent</th><th class="num">Cooling Total</th></tr></thead>
                <tbody>${zoneRows}</tbody>
              </table>
            </section>`
          : ""
      }

      ${
        ductSchedule.length > 0
          ? `<section>
              <div class="section-title">Manual D — Duct Schedule</div>
              <table>
                <thead><tr><th>Run</th><th class="num">CFM</th><th class="num">Friction Rate</th><th>Size</th><th class="num">Velocity (fpm)</th><th>Insulation</th></tr></thead>
                <tbody>${ductSchedule
                  .map((d) => {
                    const compliance = complianceByRunId.get(d.runId);
                    const insulationCell = compliance
                      ? compliance.actualRValue != null
                        ? `R-${compliance.actualRValue}${compliance.belowCodeMinimum ? ` <span class="badge badge-overridden" title="Below the current ${compliance.minRValue != null ? `R-${compliance.minRValue}` : ""} code minimum for this duct's location">below code min</span>` : ""}`
                        : "—"
                      : "—";
                    return `<tr>
                      <td>${esc(ductRunLabel(d.runId))}</td>
                      <td class="num">${fmt(d.cfm)}</td>
                      <td class="num">${d.frictionRate.toFixed(2)}</td>
                      <td>${d.ductShape === "round" ? `${d.diameterIn}" round` : `${d.widthIn?.toFixed(1)}" × ${d.heightIn}" rect`}</td>
                      <td class="num">${fmt(d.velocityFpm)}${d.velocityWarning ? ` <span class="badge badge-overridden">over limit</span>` : ""}</td>
                      <td>${insulationCell}</td>
                    </tr>`;
                  })
                  .join("")}</tbody>
              </table>
            </section>`
          : ""
      }

      <section>
        <div class="section-title">Manual S — Equipment Selection</div>
        ${
          zoneEquipment.length > 0
            ? zoneEquipment
                .map((ze) => {
                  const zoneName = manualJ.zones.find((z) => z.zoneId === ze.zoneId)?.zoneName ?? "Zone";
                  const eq = ze.selectedEquipment;
                  return `<div style="margin-bottom:12px;">
                    <p><strong>${esc(zoneName)}</strong></p>
                    ${
                      eq
                        ? `<table>
                            <tr><td>Selected equipment</td><td class="num">${esc(eq.equipment.manufacturer)} ${esc(eq.equipment.modelNumber)}</td></tr>
                            <tr><td>Interpolated capacity at design conditions</td><td class="num">${fmt(eq.coolingCapacityAtDesign?.totalCapacityBtu)} Btu/hr (${eq.coolingPercentOfLoad != null ? `${Math.round(eq.coolingPercentOfLoad * 100)}%` : "—"} of this zone's Manual J cooling load)</td></tr>
                            <tr><td>Nominal / AHRI capacity (reference only — NOT used for sizing)</td><td class="num">${fmt(eq.equipment.nominalCoolingCapacityBtu)} Btu/hr</td></tr>
                            <tr><td>Compatibility score</td><td class="num">${eq.compatibilityScore != null ? `${Math.round(eq.compatibilityScore * 100)}%` : "—"}</td></tr>
                            ${eq.balancePointF != null ? `<tr><td>Balance point</td><td class="num">${eq.balancePointF.toFixed(1)}°F</td></tr>` : ""}
                            ${eq.supplementalHeatBtuh ? `<tr><td>Supplemental heat required at design</td><td class="num">${fmt(eq.supplementalHeatBtuh)} Btu/hr</td></tr>` : ""}
                          </table>
                          ${ze.equipmentSelectionNotes ? `<p><strong>Selection notes:</strong> ${esc(ze.equipmentSelectionNotes)}</p>` : ""}`
                        : `<p class="muted">No equipment selected yet for this zone.</p>`
                    }
                  </div>`;
                })
                .join("")
            : `<p class="muted">No equipment selected yet for this project.</p>`
        }
        <p class="muted">Capacity shown above is interpolated from OEM extended performance data at this project's actual design conditions, never AHRI 210/240 nameplate rating, per ACCA Manual S.</p>
      </section>
    `;
  }

  let commercialSections = "";
  if (data.commercial) {
    const { blockLoad, industrialLoad } = data.commercial;
    if (blockLoad) {
      commercialSections = `
        <section>
          <div class="section-title">Manual N — Zone Block Load Detail</div>
          <table>
            <thead><tr><th>Zone</th><th class="num">Heating Btu/hr</th><th class="num">Cooling Sensible</th><th class="num">Cooling Latent</th><th class="num">Cooling Total</th></tr></thead>
            <tbody>${blockLoad.zones
              .map(
                (z) => `<tr><td>${esc(z.zoneName)}</td><td class="num">${fmt(z.heatingBtuh)}</td><td class="num">${fmt(z.coolingSensibleBtuh)}</td><td class="num">${fmt(z.coolingLatentBtuh)}</td><td class="num">${fmt(z.coolingTotalBtuh)}</td></tr>`,
              )
              .join("")}</tbody>
            <tfoot><tr><td>Building Total</td><td class="num">${fmt(blockLoad.building.heatingBtuh)}</td><td class="num">${fmt(blockLoad.building.coolingSensibleBtuh)}</td><td class="num">${fmt(blockLoad.building.coolingLatentBtuh)}</td><td class="num">${fmt(blockLoad.building.coolingTotalBtuh)}</td></tr></tfoot>
          </table>
        </section>
      `;
    } else if (industrialLoad) {
      commercialSections = `
        <section>
          <div class="section-title">Manual N + Process Loads — Zone Detail</div>
          <table>
            <thead><tr><th>Zone</th><th class="num">Envelope+Vent Heating</th><th class="num">Envelope+Vent Cooling</th><th class="num">Process Sensible</th><th class="num">Process Latent</th><th class="num">Total Cooling</th></tr></thead>
            <tbody>${industrialLoad
              .map(
                (z) => `<tr>
                  <td>${esc(z.zoneName)}</td>
                  <td class="num">${fmt(z.heatingBtuh)}</td>
                  <td class="num">${fmt(z.coolingSensibleBtuh + z.coolingLatentBtuh)}</td>
                  <td class="num">${fmt(z.processSensibleBtuh)}</td>
                  <td class="num">${fmt(z.processLatentBtuh)}</td>
                  <td class="num">${fmt(z.totalCoolingBtuh)}</td>
                </tr>
                ${z.processLoads
                  .map(
                    (p) =>
                      `<tr><td colspan="6" class="muted" style="padding-left:20px;">• ${esc(p.processLoad.description)} (${p.processLoad.loadType}, ${p.processLoad.source}) — ${fmt(p.sensibleBtuHr)} Btu/hr sensible / ${fmt(p.latentBtuHr)} Btu/hr latent [${p.derivation}]</td></tr>`,
                  )
                  .join("")}`,
              )
              .join("")}</tbody>
          </table>
        </section>
      `;
    }
  }

  const auditRows = resolvedFieldResolutionsAudit(data.fieldResolutions);
  const auditSection = `
    <section>
      <div class="section-title">UNRESOLVED Field Resolution Audit Trail</div>
      ${
        auditRows.length > 0
          ? `<table>
              <thead><tr><th>Field</th><th>AI Extracted</th><th>Final Value</th><th>Status</th><th>Reason</th><th>Resolved</th></tr></thead>
              <tbody>${auditRows
                .map(
                  (r) => `<tr>
                    <td>${esc(r.table_name)}.${esc(r.field_name)}</td>
                    <td>${esc(r.ai_extracted_value) || "—"}</td>
                    <td>${esc(r.final_value) || "—"}</td>
                    <td><span class="badge ${r.resolution_type === "accepted" ? "badge-accepted" : "badge-overridden"}">${r.resolution_type}</span></td>
                    <td>${esc(r.override_reason) || "—"}</td>
                    <td class="muted">${new Date(r.resolved_at).toLocaleDateString()}</td>
                  </tr>`,
                )
                .join("")}</tbody>
            </table>`
          : `<p class="muted">No AI-extracted fields have required human resolution on this project.</p>`
      }
    </section>
  `;

  const footer = `
    <div style="padding:12px 24px;border-top:1px solid #ddd;">
      <p class="muted">Summit Construction Technology &amp; Restoration Group — Internal Engineering Report. Not for distribution to the client.</p>
    </div>
  `;

  return htmlShell(
    `${data.project.name} — Internal Engineering Report`,
    header,
    climateSection + residentialSections + commercialSections + auditSection,
    footer,
  );
}

// ---------------------------------------------------------------------------
// Client-facing scope of work - plain language, branded, no audit detail.
// ---------------------------------------------------------------------------
export function renderClientScopeOfWorkHtml(data: ReportData): string {
  const header = `
    <div style="background:${BRAND.bg};color:${BRAND.gold};padding:28px 32px;">
      <div style="font-size:22px;font-weight:700;letter-spacing:0.04em;">SUMMIT</div>
      <div style="font-size:11px;color:${BRAND.goldHover};margin-top:2px;">Restore. Protect. Perform.</div>
      <div style="margin-top:18px;color:#e5e5e5;font-size:16px;">${esc(data.project.name)} — Scope of Work</div>
      <div style="color:#a5a5a5;font-size:11px;">${projectAddress(data)}</div>
    </div>
  `;

  let systemDescription = "No system design details are available for this project yet.";
  let roomSummary = "";
  let ductSummary = "";

  if (data.residential) {
    const { manualJ, zoneEquipment, ductSchedule, ductRuns } = data.residential;
    const tons = manualJ.wholeHouse.coolingTotalBtuh / 12000;
    const selectedEquipmentList = zoneEquipment
      .map((ze) => ze.selectedEquipment)
      .filter((eq): eq is NonNullable<typeof eq> => eq != null);
    // Plain language only below - no raw Btu/hr figures or engineering
    // jargon in the client-facing document (see this function's own
    // header comment / the Phase 7 spec). Tonnage is the one figure kept,
    // since "X tons of cooling" is standard plain-English HVAC sizing
    // language homeowners are already used to seeing on quotes. Equipment
    // selection is now per system/zone (Section 5.3), so a multi-system
    // home gets a short list rather than one single-system sentence.
    if (selectedEquipmentList.length === 0) {
      systemDescription = `Your home's heating and cooling system will be sized specifically to its actual needs —
         approximately ${tons.toFixed(1)} tons of cooling capacity — based on a detailed room-by-room
         analysis of your home's construction, insulation, windows, and layout.`;
    } else if (selectedEquipmentList.length === 1) {
      const eq = selectedEquipmentList[0];
      systemDescription = `Your home will be served by a ${esc(eq.equipment.manufacturer)} ${esc(eq.equipment.modelNumber)}
         (${eq.equipment.equipmentType === "heat_pump" ? "heat pump" : "air conditioning system"}),
         sized specifically to your home's actual heating and cooling needs — approximately
         ${tons.toFixed(1)} tons of cooling capacity — rather than a generic estimate.`;
    } else {
      const items = selectedEquipmentList
        .map((eq) => `${esc(eq.equipment.manufacturer)} ${esc(eq.equipment.modelNumber)}`)
        .join(", ");
      systemDescription = `Your home will be served by ${selectedEquipmentList.length} separate systems (${items}),
         each sized specifically to the actual heating and cooling needs of the area it serves —
         approximately ${tons.toFixed(1)} tons of cooling capacity combined — rather than a generic estimate.`;
    }

    roomSummary = `
      <table>
        <thead><tr><th>Room</th></tr></thead>
        <tbody>${manualJ.rooms.map((r) => `<tr><td>${esc(r.roomName)}</td></tr>`).join("")}</tbody>
      </table>
    `;

    const branchCount = ductRuns.filter((r) => r.run_type === "branch").length;
    if (ductSchedule.length > 0 && branchCount > 0) {
      ductSummary = `<p>New supply ducts will be sized to code for each room shown above, with ${branchCount}
        duct run${branchCount === 1 ? "" : "s"} designed to deliver the right amount of conditioned air
        to every space — not oversized, not undersized.</p>`;
    }
  } else if (data.commercial) {
    // blockLoad and industrialLoad have different zone result shapes
    // (IndustrialZoneLoadResult extends CommercialZoneLoadResult with
    // process-load fields) - normalized to {zoneName, totalCoolingBtuh}
    // up front rather than trying to discriminate the union inline below.
    const zones: { zoneName: string; totalCoolingBtuh: number }[] = data.commercial.blockLoad
      ? data.commercial.blockLoad.zones.map((z) => ({ zoneName: z.zoneName, totalCoolingBtuh: z.coolingTotalBtuh }))
      : (data.commercial.industrialLoad ?? []).map((z) => ({
          zoneName: z.zoneName,
          totalCoolingBtuh: z.totalCoolingBtuh,
        }));
    const totalCooling = zones.reduce((sum, z) => sum + z.totalCoolingBtuh, 0);
    systemDescription = `Your facility's heating and cooling system will be sized to its actual needs —
      approximately ${(totalCooling / 12000).toFixed(1)} tons of cooling capacity across
      ${zones.length} zone${zones.length === 1 ? "" : "s"} — based on a detailed analysis of your
      building's construction, occupancy, and equipment.`;
    roomSummary = `
      <table>
        <thead><tr><th>Zone</th></tr></thead>
        <tbody>${zones.map((z) => `<tr><td>${esc(z.zoneName)}</td></tr>`).join("")}</tbody>
      </table>
    `;
  }

  const body = `
    <section style="margin-top:20px;">
      <div class="section-title">System Overview</div>
      <p>${systemDescription}</p>
    </section>
    <section>
      <div class="section-title">${data.residential ? "Room-by-Room" : "Zone-by-Zone"} Summary</div>
      ${roomSummary}
    </section>
    ${ductSummary ? `<section><div class="section-title">Ductwork</div>${ductSummary}</section>` : ""}
  `;

  const footer = `
    <div style="background:${BRAND.bg};color:${BRAND.goldHover};padding:20px 32px;margin-top:20px;">
      <div style="font-size:12px;">Built on Integrity. Engineered for Excellence.</div>
      <div style="font-size:10px;color:#8a8a8a;margin-top:4px;">Summit Construction Technology &amp; Restoration Group</div>
    </div>
  `;

  return htmlShell(`${data.project.name} — Scope of Work`, header, body, footer);
}
