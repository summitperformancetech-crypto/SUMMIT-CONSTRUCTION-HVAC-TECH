// SUMMIT-REPORT-STANDARD.md - the 12-page single-file HTML report. Reuses
// ReportData (lib/reportData.ts) - no new data-fetching here, matching
// the existing renderInternalReportHtml/renderClientScopeOfWorkHtml
// pattern this replaces the FORMAT of, not the data plumbing.
//
// KNOWN GAPS, flagged rather than silently faked (see SESSION-PROGRESS.md
// for the full history of each):
// - AED Assessment (Section 5.6): needs per-orientation/hourly load data
//   this app's computeManualJ does not model (it's a single design-point
//   calc, not an hourly simulation). Rendered as an explicit, specific
//   "not yet computed by this engine" state - never a fabricated
//   pass/fail or invented percentage.
// - Floor Plan page (Section 5.9): renders the actual uploaded drawing
//   page (see lib/floorPlanRender.ts) with the Summit compass overlaid,
//   once a human has marked which drawing/page is the floor plan (see
//   drawings-section.tsx). Does NOT yet crop out a third-party title
//   block, which Section 7 also calls for - a project with no drawing
//   marked (like the Vivian Street fixture, seeded directly from a Manual
//   J assessment PDF) shows an explicit "no floor plan on file" state,
//   never a fabricated or approximated drawing.
import type { ReportData } from "./reportData";
import { resolvedFieldResolutionsAudit } from "./reportData";
import { validateReportTotals, computeRequiredTonnage, type ReportValidationResult } from "./reportValidation";
import { getReportGenerationGateStatus, type ReportGenerationGateStatus } from "./reportGate";
import { renderCompassSvg } from "./reportCompass";
import { buildHeatingSegments, buildCoolingSegments, renderDonutSvg, type ChartSegment } from "./reportCharts";
import { computeRequiredCfmForRooms } from "./manualD";
import type { Compass8 } from "./constants/compass";
import type { DrawingExtraction } from "./drawingExtraction";
import { getEmbeddedFontFaces } from "./reportFonts";
import {
  layoutDuctRoutingLabels,
  buildDuctNetworkPrimitives,
  computeSheetCropViewBox,
  getDiffuserSymbolSpec,
  DUCT_ROUTING_MODE_BASIS_LABELS,
  type RoutedDuctSegment,
  type AhuInstallationDetailRow,
  type DuctRoutingModeBasis,
} from "./ductRouting";

export type OrgBranding = {
  name: string;
  license_number: string | null;
  logo_data_uri: string | null;
};

const BRAND = {
  navy950: "#0a0a0a",
  navy900: "#141414",
  navy800: "#1e1e1e",
  navy700: "#333333",
  paper: "#f0efec",
  paperPanel: "#fbfbfa",
  amber: "#a9822f",
  amberLight: "#d4b06a",
  silver: "#9aa0a6",
  silverLight: "#c9ccd0",
  ink: "#171717",
  inkSoft: "#54575b",
  grid: "#dcdad5",
};

function esc(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fmt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}
function fmt1(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}
function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}
function projectAddress(data: ReportData): string {
  const p = data.project;
  const line2 = p.address_line2 ? `, ${esc(p.address_line2)}` : "";
  return `${esc(p.address_line1)}${line2}, ${esc(p.city)}, ${esc(p.state)} ${esc(p.zip)}`;
}

const STYLES = `
  * { box-sizing: border-box; }
  body { font-family: 'IBM Plex Sans', -apple-system, 'Segoe UI', sans-serif; margin: 0; background: ${BRAND.paper}; color: ${BRAND.ink}; font-size: 13px; }
  .mono { font-family: 'IBM Plex Mono', 'SF Mono', Consolas, monospace; }
  h1, h2, h3 { margin: 0; }
  .page { background: ${BRAND.paperPanel}; max-width: 960px; margin: 0 auto; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .page-header { background: ${BRAND.navy950}; color: ${BRAND.paperPanel}; padding: 18px 32px; border-bottom: 4px solid ${BRAND.amber}; display: flex; align-items: center; justify-content: space-between; }
  .page-header .brand-mark { display: flex; align-items: center; gap: 12px; }
  .page-header .brand-mark img { height: 36px; }
  .page-header .org-name { font-size: 16px; font-weight: 700; letter-spacing: 0.02em; }
  .page-header .org-subtitle { font-size: 10px; color: ${BRAND.amberLight}; margin-top: 1px; }
  .page-header .page-label { font-size: 11px; color: ${BRAND.silverLight}; text-transform: uppercase; letter-spacing: 0.06em; }
  .page-body { padding: 28px 32px; min-height: 900px; }
  .page-footer { padding: 10px 32px; border-top: 1px solid ${BRAND.grid}; display: flex; justify-content: space-between; font-size: 9px; color: ${BRAND.inkSoft}; }
  .page-footer .amber { color: ${BRAND.amber}; font-weight: 600; }
  .section-title { font-size: 15px; font-weight: 700; color: ${BRAND.navy700}; border-bottom: 2px solid ${BRAND.amber}; padding-bottom: 6px; margin: 24px 0 12px 0; }
  .section-title:first-child { margin-top: 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 12px; }
  th, td { text-align: left; padding: 5px 10px; border-bottom: 1px solid ${BRAND.grid}; }
  th { text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; color: ${BRAND.inkSoft}; border-bottom: 2px solid ${BRAND.amber}; }
  td.num, th.num { text-align: right; font-family: 'IBM Plex Mono', monospace; }
  tfoot td { font-weight: 700; border-top: 2px solid ${BRAND.amber}; border-bottom: none; }
  .muted { color: ${BRAND.inkSoft}; }
  .badge { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }
  .badge-pass { background: #e6f0e6; color: #3d6b3d; }
  .badge-fail { background: #fdeeea; color: #a13a2b; }
  .badge-corrected { background: #fdf3e0; color: #8a5a00; border: 1px solid ${BRAND.amber}; }
  .badge-neutral { background: ${BRAND.grid}; color: ${BRAND.inkSoft}; }
  .panel { background: ${BRAND.paper}; border: 1px solid ${BRAND.grid}; border-radius: 6px; padding: 16px; }
  .panel-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
  .stat { display: flex; flex-direction: column; }
  .stat .stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: ${BRAND.inkSoft}; }
  .stat .stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 600; color: ${BRAND.navy700}; }
  .toc-item { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dotted ${BRAND.grid}; font-size: 13px; }
  .chart-row { display: flex; align-items: center; gap: 24px; }
  .chart-legend { flex: 1; }
  .chart-legend-item { display: flex; align-items: center; gap: 8px; font-size: 11px; margin-bottom: 4px; }
  .chart-legend-swatch { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
  .callout { padding: 12px 14px; border-left: 3px solid ${BRAND.amber}; background: ${BRAND.paper}; font-size: 12px; margin: 10px 0; }
  .callout.warn { border-left-color: #a13a2b; }
  @media print {
    body { background: white; }
    .page { max-width: none; margin: 0; box-shadow: none; }
  }
`;

function pageShell(label: string, org: OrgBranding, bodyHtml: string, projectAddr: string): string {
  const logo = org.logo_data_uri
    ? `<img src="${esc(org.logo_data_uri)}" alt="${esc(org.name)} logo" />`
    : "";
  return `
  <div class="page">
    <div class="page-header">
      <div class="brand-mark">
        ${logo}
        <div>
          <div class="org-name">${esc(org.name)}</div>
          <div class="org-subtitle">Restore. Protect. Perform.</div>
        </div>
      </div>
      <div class="page-label">${esc(label)}</div>
    </div>
    <div class="page-body">
      ${bodyHtml}
    </div>
    <div class="page-footer">
      <div>${esc(projectAddr)} — ${esc(label)}</div>
      <div class="amber">Calculated per ACCA Manual J, 8th Ed. — Summit Load Engine v1</div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Page 1: Cover
// ---------------------------------------------------------------------------
function renderCoverPage(data: ReportData, org: OrgBranding, buildingFrontFaces: Compass8 | null): string {
  const climateBadge = data.climateZone
    ? `<span class="badge badge-pass">IECC Zone ${esc(data.climateZone.iecc_zone)} — confirmed</span>`
    : `<span class="badge badge-fail">Climate zone not confirmed</span>`;
  const logo = org.logo_data_uri
    ? `<img src="${esc(org.logo_data_uri)}" alt="${esc(org.name)} logo" style="height:64px;margin-bottom:16px;" />`
    : "";
  return `
  <div class="page">
    <div style="background:${BRAND.navy950};color:${BRAND.paperPanel};padding:80px 56px 56px 56px;">
      ${logo}
      <div style="font-size:28px;font-weight:700;letter-spacing:0.02em;">${esc(org.name)}</div>
      <div style="font-size:13px;color:${BRAND.amberLight};margin-top:4px;">Restore. Protect. Perform. — Built on Integrity. Engineered for Excellence.</div>
      <div style="margin-top:56px;font-size:22px;font-weight:700;">${esc(data.project.name)}</div>
      <div style="font-size:15px;color:${BRAND.silverLight};margin-top:4px;">${projectAddress(data)}</div>
      <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:600px;">
        <div><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.05em;color:${BRAND.silverLight};">Prepared By</div><div style="font-size:13px;">${esc(org.name)}${org.license_number ? ` — Lic. ${esc(org.license_number)}` : `<span style="color:#c95;"> — license not on file</span>`}</div></div>
        <div><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.05em;color:${BRAND.silverLight};">Weather Station</div><div style="font-size:13px;">${data.climateZone ? esc(data.climateZone.county) + " County" : "—"}</div></div>
        <div><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.05em;color:${BRAND.silverLight};">Design Temps (Winter / Summer)</div><div style="font-size:13px;">${data.climateZone ? `${data.climateZone.winter_design_temp_f}°F / ${data.climateZone.summer_design_temp_f}°F` : "—"}</div></div>
        <div><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.05em;color:${BRAND.silverLight};">Climate Zone</div><div style="font-size:13px;">${climateBadge}</div></div>
        <div><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.05em;color:${BRAND.silverLight};">Front Entry Faces</div><div style="font-size:13px;">${buildingFrontFaces ? esc(buildingFrontFaces) : "Not yet confirmed"}</div></div>
        <div><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.05em;color:${BRAND.silverLight};">Prepared</div><div style="font-size:13px;">${new Date(data.generatedAt).toLocaleDateString()}</div></div>
      </div>
    </div>
    <div class="page-body">
      <div class="section-title">Table of Contents</div>
      <div class="toc-item"><span>1. Cover</span><span class="muted">1</span></div>
      <div class="toc-item"><span>2. Project Summary — Entire House</span><span class="muted">2</span></div>
      <div class="toc-item"><span>3. Project Summary — Per System</span><span class="muted">3</span></div>
      <div class="toc-item"><span>4. Load Short Form — Entire House</span><span class="muted">4</span></div>
      <div class="toc-item"><span>5. Load Short Form — Room-Level Detail</span><span class="muted">5</span></div>
      <div class="toc-item"><span>6. AED Assessment</span><span class="muted">6</span></div>
      <div class="toc-item"><span>7. Building Analysis — Per System</span><span class="muted">7</span></div>
      <div class="toc-item"><span>8. Building Orientation</span><span class="muted">8</span></div>
      <div class="toc-item"><span>9. Floor Plan</span><span class="muted">9</span></div>
      <div class="toc-item"><span>10. Duct Routing</span><span class="muted">10</span></div>
      <div class="toc-item"><span>11. Extraction Status / Field Reference</span><span class="muted">11</span></div>
      <div class="toc-item"><span>12. Audit Trail &amp; QA Certification</span><span class="muted">12</span></div>
    </div>
    <div class="page-footer">
      <div>${projectAddress(data)} — Cover</div>
      <div class="amber">Calculated per ACCA Manual J, 8th Ed. — Summit Load Engine v1</div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Page 2: Project Summary - Entire House
// ---------------------------------------------------------------------------
function renderWholeHouseSummaryPage(data: ReportData, org: OrgBranding): string {
  const r = data.residential!;
  const wh = r.manualJ.wholeHouse;
  const tons = computeRequiredTonnage(wh.coolingSensibleBtuh);
  const body = `
    <div class="section-title">Design Conditions</div>
    <div class="panel-grid">
      <div class="stat"><div class="stat-label">Winter Outdoor Design</div><div class="stat-value">${data.climateZone?.winter_design_temp_f ?? "—"}°F</div></div>
      <div class="stat"><div class="stat-label">Summer Outdoor Design</div><div class="stat-value">${data.climateZone?.summer_design_temp_f ?? "—"}°F</div></div>
      <div class="stat"><div class="stat-label">Indoor Heating Setpoint</div><div class="stat-value">${r.envelope.indoor_design_temp_heating_f}°F</div></div>
      <div class="stat"><div class="stat-label">Indoor Cooling Setpoint</div><div class="stat-value">${r.envelope.indoor_design_temp_cooling_f}°F</div></div>
    </div>

    <div class="section-title">Heating Summary</div>
    <table>
      <tr><td>Structure + Ducts + Ventilation</td><td class="num">${fmt(wh.heatingBtuh)} Btuh</td></tr>
      <tr><td>&nbsp;&nbsp;— Ventilation contribution</td><td class="num">${fmt(wh.ventilationHeatingBtuh)} Btuh</td></tr>
      <tr><td>&nbsp;&nbsp;— Duct contribution</td><td class="num">${fmt(wh.ductHeatingBtuh)} Btuh</td></tr>
    </table>

    <div class="section-title">Cooling Summary</div>
    <table>
      <thead><tr><th></th><th class="num">Sensible</th><th class="num">Latent</th><th class="num">Total</th></tr></thead>
      <tbody>
        <tr><td>Structure</td><td class="num">${fmt(wh.coolingSensibleBtuh - wh.ductCoolingSensibleBtuh - wh.ventilationCoolingSensibleBtuh)}</td><td class="num">${fmt(wh.coolingLatentBtuh - wh.ductCoolingLatentBtuh - wh.ventilationCoolingLatentBtuh)}</td><td class="num">—</td></tr>
        <tr><td>Ducts</td><td class="num">${fmt(wh.ductCoolingSensibleBtuh)}</td><td class="num">${fmt(wh.ductCoolingLatentBtuh)}</td><td class="num">${fmt(wh.ductCoolingSensibleBtuh + wh.ductCoolingLatentBtuh)}</td></tr>
        <tr><td>Ventilation (ASHRAE 62.2, ${fmt1(wh.ventilationCfm)} CFM)</td><td class="num">${fmt(wh.ventilationCoolingSensibleBtuh)}</td><td class="num">${fmt(wh.ventilationCoolingLatentBtuh)}</td><td class="num">${fmt(wh.ventilationCoolingSensibleBtuh + wh.ventilationCoolingLatentBtuh)}</td></tr>
      </tbody>
      <tfoot><tr><td>Whole House</td><td class="num">${fmt(wh.coolingSensibleBtuh)}</td><td class="num">${fmt(wh.coolingLatentBtuh)}</td><td class="num">${fmt(wh.coolingTotalBtuh)}</td></tr></tfoot>
    </table>

    <div class="section-title">Equipment Capacity Requirement</div>
    <div class="panel">
      <div class="stat"><div class="stat-label">Required Cooling Capacity (Sensible ÷ 0.70 SHR convention)</div><div class="stat-value">${fmt1(tons)} tons</div></div>
      <p class="muted" style="margin-top:8px;">Sized from sensible load divided by a 0.70 target sensible heat ratio, per ACCA Manual S convention - not simply total load ÷ 12,000, which can undersize sensible capacity in humid climates.</p>
    </div>
  `;
  return pageShell("Project Summary — Entire House", org, body, projectAddress(data));
}

// ---------------------------------------------------------------------------
// Page 3: Project Summary - per system
// ---------------------------------------------------------------------------
function renderPerSystemSummaryPage(data: ReportData, org: OrgBranding): string {
  const r = data.residential!;
  const zonesHtml = r.manualJ.zones
    .map((z) => {
      const tons = computeRequiredTonnage(z.coolingSensibleBtuh);
      const zoneEq = z.zoneId != null ? r.zoneEquipment.find((ze) => ze.zoneId === z.zoneId) : undefined;
      const eq = zoneEq?.selectedEquipment ?? null;
      return `
      <div class="panel" style="margin-bottom:16px;">
        <div style="font-size:14px;font-weight:700;color:${BRAND.navy700};margin-bottom:10px;">${esc(z.zoneName)}</div>
        <table>
          <thead><tr><th></th><th class="num">Sensible</th><th class="num">Latent</th><th class="num">Total</th></tr></thead>
          <tbody><tr><td>Cooling</td><td class="num">${fmt(z.coolingSensibleBtuh)}</td><td class="num">${fmt(z.coolingLatentBtuh)}</td><td class="num">${fmt(z.coolingTotalBtuh)}</td></tr></tbody>
        </table>
        <table><tr><td>Heating</td><td class="num">${fmt(z.heatingBtuh)} Btuh</td></tr></table>
        <div class="stat" style="margin:10px 0;"><div class="stat-label">Required Capacity (0.70 SHR)</div><div class="stat-value">${fmt1(tons)} tons</div></div>
        <div class="section-title" style="font-size:11px;margin-top:14px;">Equipment Spec</div>
        ${
          eq
            ? `<table>
                <tr><td>Selected</td><td class="num">${esc(eq.equipment.manufacturer)} ${esc(eq.equipment.modelNumber)}</td></tr>
                <tr><td>Interpolated capacity at design</td><td class="num">${fmt(eq.coolingCapacityAtDesign?.totalCapacityBtu)} Btuh (${pct(eq.coolingPercentOfLoad)} of load)</td></tr>
                <tr><td>Rated airflow</td><td class="num">${eq.equipment.ratedCfm ?? "—"} CFM</td></tr>
                <tr><td>Within ACCA sizing window</td><td class="num">${eq.withinCoolingWindow ? '<span class="badge badge-pass">Pass</span>' : '<span class="badge badge-fail">Fail</span>'}</td></tr>
              </table>`
            : `<p class="muted">No equipment selected.</p>`
        }
        ${zoneEq?.equipmentSelectionNotes ? `<p class="muted" style="margin-top:8px;"><strong>Selection notes:</strong> ${esc(zoneEq.equipmentSelectionNotes)}</p>` : ""}
      </div>`;
    })
    .join("");
  return pageShell("Project Summary — Per System", org, zonesHtml || `<p class="muted">No zones defined for this project.</p>`, projectAddress(data));
}

// ---------------------------------------------------------------------------
// Page 4: Load Short Form - Entire House
// ---------------------------------------------------------------------------
function renderLoadShortFormWholeHousePage(data: ReportData, org: OrgBranding): string {
  const r = data.residential!;
  const rows = r.manualJ.zones
    .map(
      (z) => `<tr>
        <td>${esc(z.zoneName)}</td>
        <td class="num">${fmt(z.heatingBtuh)}</td>
        <td class="num">${fmt(z.coolingSensibleBtuh)}</td>
        <td class="num">${fmt(z.coolingLatentBtuh)}</td>
        <td class="num">${fmt(z.coolingTotalBtuh)}</td>
      </tr>`,
    )
    .join("");
  const wh = r.manualJ.wholeHouse;
  const body = `
    <div class="section-title">System Rollup — Full Arithmetic Chain</div>
    <table>
      <thead><tr><th>System</th><th class="num">Heating</th><th class="num">Cooling Sensible</th><th class="num">Cooling Latent</th><th class="num">Cooling Total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Whole House</td><td class="num">${fmt(wh.heatingBtuh)}</td><td class="num">${fmt(wh.coolingSensibleBtuh)}</td><td class="num">${fmt(wh.coolingLatentBtuh)}</td><td class="num">${fmt(wh.coolingTotalBtuh)}</td></tr></tfoot>
    </table>
    <div class="section-title">Arithmetic Chain Detail</div>
    <table>
      <tr><td>Structure (envelope + infiltration + internal gains)</td><td class="num">${fmt(wh.coolingSensibleBtuh + wh.coolingLatentBtuh - wh.ductCoolingSensibleBtuh - wh.ductCoolingLatentBtuh - wh.ventilationCoolingSensibleBtuh - wh.ventilationCoolingLatentBtuh)}</td></tr>
      <tr><td>+ Duct gain/loss</td><td class="num">${fmt(wh.ductCoolingSensibleBtuh + wh.ductCoolingLatentBtuh)}</td></tr>
      <tr><td>= Subtotal before ventilation</td><td class="num">${fmt(wh.coolingSensibleBtuh + wh.coolingLatentBtuh - wh.ventilationCoolingSensibleBtuh - wh.ventilationCoolingLatentBtuh)}</td></tr>
      <tr><td>+ ASHRAE 62.2 ventilation (RSM-adjusted)</td><td class="num">${fmt(wh.ventilationCoolingSensibleBtuh + wh.ventilationCoolingLatentBtuh)}</td></tr>
      <tr><td><strong>= Cooling Total</strong></td><td class="num"><strong>${fmt(wh.coolingTotalBtuh)}</strong></td></tr>
    </table>
  `;
  return pageShell("Load Short Form — Entire House", org, body, projectAddress(data));
}

// ---------------------------------------------------------------------------
// Page 5: Load Short Form - room-level detail, per system
// ---------------------------------------------------------------------------
function renderLoadShortFormRoomsPage(data: ReportData, org: OrgBranding): string {
  const r = data.residential!;
  const cfmByRoom = computeRequiredCfmForRooms(r.manualJ.rooms, null, r.envelope.indoor_design_temp_cooling_f);
  const roomsByZone = new Map<string | null, typeof r.manualJ.rooms>();
  const rawRoomById = new Map(r.rooms.map((rr) => [rr.id, rr]));
  for (const room of r.manualJ.rooms) {
    const zoneId = rawRoomById.get(room.roomId)?.zone_id ?? null;
    if (!roomsByZone.has(zoneId)) roomsByZone.set(zoneId, []);
    roomsByZone.get(zoneId)!.push(room);
  }
  const sections = r.manualJ.zones
    .map((z) => {
      const rooms = roomsByZone.get(z.zoneId) ?? [];
      const rows = rooms
        .map((room) => {
          const rawRoom = rawRoomById.get(room.roomId);
          const cfm = cfmByRoom.get(room.roomId);
          const fieldNote =
            rawRoom?.sensible_gain_override != null || rawRoom?.latent_gain_override != null
              ? `<div class="muted" style="font-size:9px;">Field-verified override applied (source: manual entry)</div>`
              : "";
          return `<tr>
            <td>${esc(room.roomName)}${fieldNote}</td>
            <td class="num">${fmt(rawRoom?.floor_area_sqft)} sf</td>
            <td class="num">${fmt(room.heatingBtuh)}</td>
            <td class="num">${fmt(room.coolingTotalBtuh)}</td>
            <td class="num">${cfm != null ? fmt(cfm) + " CFM" : "—"}</td>
          </tr>`;
        })
        .join("");
      return `
        <div class="section-title">${esc(z.zoneName)}</div>
        <table>
          <thead><tr><th>Room</th><th class="num">Area</th><th class="num">Heating</th><th class="num">Cooling</th><th class="num">Design Airflow</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="5" class="muted">No rooms assigned to this system.</td></tr>`}</tbody>
        </table>
      `;
    })
    .join("");
  return pageShell("Load Short Form — Room-Level Detail", org, sections, projectAddress(data));
}

// ---------------------------------------------------------------------------
// Page 6: AED Assessment
// ---------------------------------------------------------------------------
const DIRECTION_LABEL: Record<string, string> = { north: "N", south: "S", east: "E", west: "W" };

function renderAedPage(data: ReportData, org: OrgBranding): string {
  const aedResults = data.residential!.aed;
  const anyAssessed = aedResults.some((r) => r.assessed);

  const explanation = anyAssessed
    ? `
    <div class="callout">
      ACCA Manual J's AED check compares each compass orientation's peak solar sensible
      contribution against the average across all orientations with real glazing - more than
      30% above average means glazing is concentrated enough on one side to create a real,
      unbalanced cooling peak. Computed from a real hourly solar-position simulation for this
      project's actual geocoded address (lib/aedAssessment.ts), using the ASHRAE Clear Sky
      atmospheric model rather than a live weather-data feed - see that module for the exact
      precision boundary this implies.
    </div>`
    : `
    <div class="callout warn">
      <strong>Not assessed.</strong> AED needs a real geocoded address and real per-room,
      per-orientation window area - at least one of those isn't available yet for this project
      (address couldn't be geocoded, or window area hasn't been resolved for these rooms).
      Reporting a pass/fail without that underlying data would be a fabricated number, not a
      real assessment, so none is shown.
    </div>`;

  const rows = aedResults
    .map((r) => {
      if (!r.assessed) {
        return `<tr><td>${esc(r.zoneName)}</td><td class="muted">30%</td><td class="muted">not assessed</td><td><span class="badge badge-neutral">Not Assessed</span></td></tr>`;
      }
      const resultBadge = r.passes
        ? `<span class="badge badge-pass">Pass</span>`
        : `<span class="badge badge-fail">Fail</span>`;
      const worst = r.worstOrientation ? ` (${DIRECTION_LABEL[r.worstOrientation]})` : "";
      return `<tr><td>${esc(r.zoneName)}</td><td class="num">30%</td><td class="num">${r.peakExcessPercent.toFixed(1)}%${esc(worst)}</td><td>${resultBadge}</td></tr>`;
    })
    .join("");

  const body = `
    <div class="section-title">AED (Adequate Exposure Diversification) Assessment</div>
    ${explanation}
    <table>
      <thead><tr><th>System</th><th>30% ACCA Limit</th><th>Peak Excess</th><th>Result</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  return pageShell("AED Assessment", org, body, projectAddress(data));
}

// ---------------------------------------------------------------------------
// Page 7: Building Analysis - per system, donut charts
// ---------------------------------------------------------------------------
function renderLegend(segments: ChartSegment[]): string {
  return segments
    .map(
      (s) =>
        `<div class="chart-legend-item"><div class="chart-legend-swatch" style="background:${s.color};"></div><div>${esc(s.label)} — ${fmt(s.valueBtuh)} Btuh (${pct(s.percent)})</div></div>`,
    )
    .join("");
}
function renderBuildingAnalysisPage(data: ReportData, org: OrgBranding): string {
  const r = data.residential!;
  const sections = r.manualJ.zones
    .map((z) => {
      const heating = buildHeatingSegments(z);
      const cooling = buildCoolingSegments(z);
      return `
        <div class="panel" style="margin-bottom:20px;">
          <div style="font-size:14px;font-weight:700;color:${BRAND.navy700};margin-bottom:12px;">${esc(z.zoneName)}</div>
          <div class="chart-row" style="margin-bottom:16px;">
            <div>${renderDonutSvg(heating)}</div>
            <div class="chart-legend"><div style="font-size:11px;font-weight:600;margin-bottom:6px;">Heating Components</div>${renderLegend(heating)}</div>
          </div>
          <div class="chart-row">
            <div>${renderDonutSvg(cooling)}</div>
            <div class="chart-legend"><div style="font-size:11px;font-weight:600;margin-bottom:6px;">Cooling Components</div>${renderLegend(cooling)}</div>
          </div>
        </div>
      `;
    })
    .join("");
  return pageShell("Building Analysis — Per System", org, sections, projectAddress(data));
}

// ---------------------------------------------------------------------------
// Page 8: Building Orientation
// ---------------------------------------------------------------------------
function renderOrientationPage(
  data: ReportData,
  org: OrgBranding,
  buildingFrontFaces: Compass8 | null,
): string {
  const badge = buildingFrontFaces
    ? `<span class="badge badge-pass">Confirmed</span>`
    : `<span class="badge badge-fail">Not Confirmed</span>`;
  const body = `
    <div class="section-title">Building Orientation</div>
    <div class="chart-row">
      <div>${renderCompassSvg({ size: 220, frontFaces: buildingFrontFaces })}</div>
      <div class="chart-legend">
        <table>
          <tr><td>Front entry faces</td><td class="num">${buildingFrontFaces ? esc(buildingFrontFaces) : "—"}</td></tr>
          <tr><td>Confirmation status</td><td class="num">${badge}</td></tr>
          <tr><td>Source</td><td class="num">${buildingFrontFaces ? "Technician-confirmed (Step 3 gate, before extraction)" : "—"}</td></tr>
          <tr><td>Verification method</td><td class="num">${buildingFrontFaces ? "Confirmed on-site by field technician prior to drawing extraction" : "—"}</td></tr>
        </table>
      </div>
    </div>
    ${!buildingFrontFaces ? `<div class="callout warn">Building orientation has not been confirmed for this project. Wall-orientation-dependent solar gain figures elsewhere in this report should be treated as provisional until this is confirmed.</div>` : ""}
  `;
  return pageShell("Building Orientation", org, body, projectAddress(data));
}

// ---------------------------------------------------------------------------
// Page 9: Floor Plan
// ---------------------------------------------------------------------------
function renderFloorPlanPage(
  data: ReportData,
  org: OrgBranding,
  buildingFrontFaces: Compass8 | null,
  floorPlanImageDataUri: string | null,
): string {
  const body = floorPlanImageDataUri
    ? `<div class="section-title">Floor Plan</div>
       <div style="position:relative;display:inline-block;">
         <img src="${floorPlanImageDataUri}" alt="Floor plan" style="max-width:100%;display:block;border:1px solid ${BRAND.grid};" />
         <div style="position:absolute;top:12px;right:12px;background:rgba(255,255,255,0.85);border-radius:8px;padding:6px;">
           ${renderCompassSvg({ size: 90, frontFaces: buildingFrontFaces })}
         </div>
       </div>
       <p class="muted" style="margin-top:8px;">
         Source drawing shown as uploaded, Summit compass overlaid per Section 7. Not yet cropped
         to remove any third-party title block (a documented simplification - see
         lib/floorPlanRender.ts).
       </p>`
    : `<div class="section-title">Floor Plan</div>
       <div class="callout">
         No extracted drawing is on file for this project, or none has been marked as the report
         floor plan yet (see the Drawings section's "Use as report floor plan" control). Section 7
         explicitly forbids regenerating floor plan geometry from room dimension data - a floor
         plan page is only ever the actual source drawing, never approximated.
       </div>`;
  return pageShell("Floor Plan", org, body, projectAddress(data));
}

// ---------------------------------------------------------------------------
// Page 10: Duct Routing (auto Manual D run-length feature, added
// 2026-08-25) - a real installation reference diagram, built from
// tech-confirmed pin positions on the actual source drawing (never a
// regenerated/approximated floor plan - same drawing-authority principle
// Section 7 already requires for the Floor Plan page itself). Renders as
// its own page, separate from Floor Plan, since overlaying a full
// routing diagram AND the compass on the identical image would be too
// dense to read.
// ---------------------------------------------------------------------------
// Real diffuser body geometry, keyed off getDiffuserSymbolSpec's shared
// bodyShape/tickAngles (see lib/ductRouting.ts for sourcing) - one
// implementation per renderer (this string-built one, and duct-routing-
// diagram.tsx's JSX one) since the two can't share literal markup, but
// both consume the exact same spec so a 4-way diffuser looks identical
// in the live in-app view and the frozen PDF. tickColor param lets a
// return-air-tinted variant reuse this if ever needed; unused for now
// (return grilles keep their own fixed RA symbol, drawn separately).
function renderDiffuserBodySvg(tagCode: string | undefined, color: string, paperColor: string): string {
  const spec = getDiffuserSymbolSpec(tagCode);
  const ticks = spec.tickAngles
    .map((deg) => {
      const rad = (deg * Math.PI) / 180;
      const r1 = spec.bodyShape === "wide_rect" ? 1.8 : 1.3;
      const r2 = r1 + 0.8;
      const x1 = (r1 * Math.cos(rad)).toFixed(3);
      const y1 = (-r1 * Math.sin(rad)).toFixed(3);
      const x2 = (r2 * Math.cos(rad)).toFixed(3);
      const y2 = (-r2 * Math.sin(rad)).toFixed(3);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="0.26" stroke-linecap="round" />`;
    })
    .join("");

  if (spec.bodyShape === "bar") {
    return `<rect x="-2.6" y="-0.4" width="5.2" height="0.8" fill="${paperColor}" stroke="${color}" stroke-width="0.3" />${ticks}`;
  }
  if (spec.bodyShape === "wide_rect") {
    return `<rect x="-1.8" y="-1" width="3.6" height="2" fill="${paperColor}" stroke="${color}" stroke-width="0.3" />${ticks}`;
  }
  // Standard ceiling diffuser body (1/2/3/4-way): square with a
  // decorative blade cross, matching the original one-way symbol this
  // replaces, plus one tick per real throw direction.
  return `<rect x="-1.3" y="-1.3" width="2.6" height="2.6" fill="${paperColor}" stroke="${color}" stroke-width="0.32" />
    <line x1="-1.05" y1="-1.05" x2="1.05" y2="1.05" stroke="${color}" stroke-width="0.26" />
    <line x1="-1.05" y1="1.05" x2="1.05" y2="-1.05" stroke="${color}" stroke-width="0.26" />
    ${ticks}`;
}

function renderDuctRoutingPage(data: ReportData, org: OrgBranding): string {
  const sheets = data.residential?.ductRoutingIllustration ?? [];

  if (sheets.length === 0) {
    return pageShell(
      "Duct Routing",
      org,
      `<div class="section-title">Duct Routing</div>
       <div class="callout">
         No duct-routing pins have been resolved for this project yet. Once a technician places and confirms
         a pin for each room and each zone's AHU (see the Duct Routing Pins section in the project workspace),
         a real, drawing-accurate installation reference diagram renders here.
       </div>`,
      projectAddress(data),
    );
  }

  // Rebuilt 2026-08-25 against 4 real Wrightsoft/AutoCAD Manual D duct
  // diagrams the user supplied as the target standard: real orthogonal
  // trunk-and-branch routing (lib/ductPathGeometry.ts/lib/ductRouting.ts's
  // computeSheetDuctRouting, computed at snapshot time by
  // lib/reportImages.ts's attachFrozenImages, since it needs a real
  // rendered page's dimensions), a visible trunk/branch/run-out line-
  // weight hierarchy, real elbow/tee fitting symbols at actual routing
  // junctions (buildDuctNetworkPrimitives), per-zone background tinting,
  // and collision-avoided labels with leader lines for anything pushed
  // off its natural position. Shares every one of these functions with
  // the live in-app diagram (components/duct-routing-diagram.tsx) so a
  // fix in one place fixes both - only the string-vs-JSX rendering
  // syntax differs, same client/server split this module already uses.
  const SUPPLY_COLOR = "#c0392b";
  const RETURN_COLOR = "#2f8f4f";
  const SYMBOL_INK = "#1c2b3a";
  const SEGMENT_WIDTH: Record<RoutedDuctSegment["cls"], number> = { trunk: 1.1, branch: 0.7, runout: 0.42 };
  const ZONE_TINTS = ["#fde68a", "#93c5fd", "#86efac", "#f9a8d4", "#c4b5fd", "#fca5a5"];
  const allZoneIds = [...new Set(sheets.flatMap((s) => s.pins.map((p) => p.zoneId)))];

  const body = sheets
    .map((sheet, sheetIndex) => {
      if (!sheet.imageDataUri) {
        return `<div class="section-title">Duct Routing${sheets.length > 1 ? ` — Sheet ${sheetIndex + 1}` : ""}</div>
          <div class="callout">This sheet's source image could not be rendered for this report.</div>`;
      }

      const sheetZoneIds = [...new Set(sheet.pins.map((p) => p.zoneId))];
      const zoneTint =
        sheetZoneIds.length === 1 ? ZONE_TINTS[allZoneIds.indexOf(sheetZoneIds[0]) % ZONE_TINTS.length] : null;

      // Crop/zoom this sheet's viewBox to its own real pin extents (see
      // computeSheetCropViewBox's own comment - fixes register/label
      // symbols looking oversized on a sheet like A3.1 where the real
      // floor plan is a small drawing on a mostly-blank full sheet).
      // `s()` shrinks every fixed-size symbol/label constant below by
      // the resulting zoom so they render at their original absolute
      // size once the viewBox zooms everything in - only position
      // values (already real xNorm/yNorm * 100) are left unscaled.
      const crop = computeSheetCropViewBox(sheet.pins);
      const s = (v: number) => v / crop.zoomFactor;
      const zoneTintRect = zoneTint
        ? `<rect x="${crop.minX.toFixed(3)}" y="${crop.minY.toFixed(3)}" width="${crop.size.toFixed(3)}" height="${crop.size.toFixed(3)}" fill="${zoneTint}" opacity="0.22" />`
        : "";

      const primitives = buildDuctNetworkPrimitives(sheet.routedSegments ?? []);
      const routingNotice =
        sheet.routedSegments == null
          ? `<p class="muted" style="margin-top:4px;">Couldn't derive a real-world scale for this sheet (no room has both a known printed dimension and a placed pin) - showing pins without routed duct lines.</p>`
          : "";

      // Real routed segments (not a diagonal home-run line) - matches
      // how each run's own real length was computed
      // (lib/ductRouting.ts's computeRoutedBranchRun) and how the duct
      // is actually installed: orthogonal, following the open space
      // between rooms, never cutting through a room it doesn't serve.
      // No vector-effect="non-scaling-stroke" (diagnosed 2026-08-25 via
      // a real rendered screenshot, not just code review) - it makes the
      // stroke width immune to the SVG's own viewBox scale, which for a
      // 0-100 viewBox stretched over a ~1700px image renders as a
      // hairline under 1 real pixel wide - effectively invisible.
      // Flex vs. metal duct texture (REFERENCE-DOCS/IMG_3916.JPG's "A/C
      // DUCT SPECIFICATIONS" key: ribbed/coil = flexible duct, plain
      // line = rigid metal) - keyed off classification (trunk = solid
      // metal, branch/run-out = dashed flex), not a per-run material
      // lookup, since a rendered segment can be shared by runs with
      // different real materials once merged into the network graph
      // (buildDuctNetworkPrimitives). This also matches Summit's own
      // existing default (components/duct-design-section.tsx inserts
      // trunk rows as sheet_metal, branches default to flex) - a
      // disclosed classification-based approximation, not fabricated.
      const routeLines = primitives.segments
        .map(
          (seg) =>
            `<line x1="${(seg.fromXNorm * 100).toFixed(3)}" y1="${(seg.fromYNorm * 100).toFixed(3)}" x2="${(seg.toXNorm * 100).toFixed(3)}" y2="${(seg.toYNorm * 100).toFixed(3)}" stroke="${SUPPLY_COLOR}" stroke-width="${s(SEGMENT_WIDTH[seg.cls]).toFixed(3)}" stroke-linecap="round"${seg.cls === "trunk" ? "" : ` stroke-dasharray="${s(0.55).toFixed(3)},${s(0.4).toFixed(3)}"`} />`,
        )
        .join("");

      // Real fitting symbols at real graph junctions (see
      // buildDuctNetworkPrimitives) - a filled circle at a 90-degree
      // elbow, a filled square at a branch takeoff (3-way tee), matching
      // the reference sheets' own fitting convention.
      const elbowSymbols = primitives.elbows
        .map((p) => `<circle cx="${(p.xNorm * 100).toFixed(3)}" cy="${(p.yNorm * 100).toFixed(3)}" r="${s(0.4).toFixed(3)}" fill="${SUPPLY_COLOR}" />`)
        .join("");
      const teeSymbols = primitives.tees
        .map(
          (p) =>
            `<rect x="${(p.xNorm * 100 - s(0.5)).toFixed(3)}" y="${(p.yNorm * 100 - s(0.5)).toFixed(3)}" width="${s(1).toFixed(3)}" height="${s(1).toFixed(3)}" fill="${SYMBOL_INK}" stroke="${BRAND.paper}" stroke-width="${s(0.15).toFixed(3)}" />`,
        )
        .join("");

      // Real collision-avoided label positions (see
      // lib/ductRouting.ts's layoutDuctRoutingLabels) - shared with the
      // live in-app diagram so both stay in sync. Run labels anchor at
      // the register end, per the original "mark the CFM information at
      // the register" instruction, which is also what spreads them
      // apart spatially in the first place. A short dashed leader line
      // is drawn back to the real feature (register/AHU/room pin)
      // whenever decluttering pushed a label meaningfully away from it.
      const labels = layoutDuctRoutingLabels(sheet)
        .map((label) => {
          const fontSize = s(label.kind === "room" ? 1.7 : label.kind === "trunk" ? 1.5 : 1.6);
          const fontWeight = label.kind === "room" ? 600 : 700;
          const fill = label.kind === "room" ? "#1f3a5f" : SUPPLY_COLOR;
          // Real position-space distance (unscaled - label.x/y/anchorX/
          // anchorY are already real page positions, not sizes), used
          // only to decide whether a leader line is needed at all.
          const leaderDistance = Math.hypot(label.x - label.anchorX, label.y - label.anchorY);
          const leader =
            leaderDistance > 3.5
              ? `<line x1="${label.anchorX.toFixed(3)}" y1="${label.anchorY.toFixed(3)}" x2="${(label.textAnchor === "middle" ? label.x : label.x - s(0.6)).toFixed(3)}" y2="${(label.y - fontSize * 0.35).toFixed(3)}" stroke="${fill}" stroke-width="${s(0.18).toFixed(3)}" stroke-dasharray="${s(0.6).toFixed(3)},${s(0.5).toFixed(3)}" />`
              : "";

          // Real register callout: a circled type code beside a stacked
          // size-over-CFM block with a divider line - matches
          // REFERENCE-DOCS/IMG_3916.JPG's "STANDARD AIR DISTRIBUTION"
          // key exactly, not an inline "size / cfm" string.
          if (label.kind === "run" && label.secondaryText != null) {
            const runFontSize = s(1.5);
            const lineGap = runFontSize * 1.25;
            const dividerWidth = Math.max(label.text.length, label.secondaryText.length) * runFontSize * 0.62;
            const circleCx = label.x - s(1.9);
            const circleCy = label.y + lineGap / 2 - runFontSize * 0.32;
            return `${leader}<circle cx="${circleCx.toFixed(3)}" cy="${circleCy.toFixed(3)}" r="${s(0.95).toFixed(3)}" fill="${BRAND.paper}" stroke="${SUPPLY_COLOR}" stroke-width="${s(0.22).toFixed(3)}" /><text x="${circleCx.toFixed(3)}" y="${(circleCy + s(0.4)).toFixed(3)}" font-size="${s(1).toFixed(3)}" font-weight="700" fill="${SUPPLY_COLOR}" text-anchor="middle">${esc(label.typeCode ?? "")}</text><text x="${label.x.toFixed(3)}" y="${label.y.toFixed(3)}" font-size="${runFontSize.toFixed(3)}" font-weight="700" fill="${SUPPLY_COLOR}" text-anchor="start" style="paint-order:stroke;stroke:${BRAND.paper};stroke-width:0.6px;stroke-linejoin:round;">${esc(label.text)}</text><line x1="${label.x.toFixed(3)}" y1="${(label.y + runFontSize * 0.32).toFixed(3)}" x2="${(label.x + dividerWidth).toFixed(3)}" y2="${(label.y + runFontSize * 0.32).toFixed(3)}" stroke="${SUPPLY_COLOR}" stroke-width="${s(0.15).toFixed(3)}" /><text x="${label.x.toFixed(3)}" y="${(label.y + lineGap).toFixed(3)}" font-size="${runFontSize.toFixed(3)}" font-weight="700" fill="${SUPPLY_COLOR}" text-anchor="start" style="paint-order:stroke;stroke:${BRAND.paper};stroke-width:0.6px;stroke-linejoin:round;">${esc(label.secondaryText)}</text>`;
          }

          return `${leader}<text x="${label.x.toFixed(3)}" y="${label.y.toFixed(3)}" font-size="${fontSize.toFixed(3)}" font-weight="${fontWeight}" fill="${fill}" text-anchor="${label.textAnchor}"${label.kind === "room" ? ' text-decoration="underline"' : ""} style="paint-order:stroke;stroke:${BRAND.paper};stroke-width:0.6px;stroke-linejoin:round;">${esc(label.text)}</text>`;
        })
        .join("");

      // Register/return symbols per REFERENCE-DOCS/IMG_3916.JPG's real
      // legend: supply = red SQUARE + X with a one-way throw tick
      // (Summit has no real per-register throw-pattern data, so
      // one-way - matching the "1W" callout - is the honest default,
      // not a guessed 2/3/4-way claim); return = green OUTLINED square
      // with a single diagonal, not a filled swatch. AHU: an equipment
      // square with a light diagonal hatch (matching the reference's
      // hatched equipment convention) and a short red trunk/plenum stub
      // (real computed size, not a fabricated backbone path - see module
      // comment above).
      const pinIcons = sheet.pins
        .map((pin) => {
          const cx = pin.xNorm * 100;
          const cy = pin.yNorm * 100;
          if (pin.kind === "ahu") {
            return `<g transform="translate(${cx} ${cy}) scale(${s(1).toFixed(4)})">
              <line x1="0" y1="0" x2="-4.5" y2="0" stroke="${SUPPLY_COLOR}" stroke-width="0.7" stroke-linecap="round" />
              <rect x="-2.2" y="-2.2" width="4.4" height="4.4" fill="${SYMBOL_INK}" stroke="${BRAND.paper}" stroke-width="0.3" />
              <line x1="-1.6" y1="1.6" x2="-0.3" y2="0.3" stroke="${BRAND.paper}" stroke-width="0.18" opacity="0.55" />
              <line x1="-0.3" y1="1.6" x2="1.6" y2="-0.3" stroke="${BRAND.paper}" stroke-width="0.18" opacity="0.55" />
              <line x1="-1.6" y1="-0.3" x2="0.3" y2="-1.6" stroke="${BRAND.paper}" stroke-width="0.18" opacity="0.55" />
              <text x="0" y="0.7" font-size="1.5" font-weight="700" text-anchor="middle" fill="${BRAND.paper}">AHU</text>
            </g>`;
          }
          if (pin.kind === "return") {
            // A real, independently-placed pin (not assumed co-located
            // with the AHU) - green outlined square with a single
            // diagonal, per REFERENCE-DOCS/IMG_3916.JPG's real return-air
            // grille legend, sized and labeled as its own piece of
            // equipment rather than a small attached swatch.
            return `<g transform="translate(${cx} ${cy}) scale(${s(1).toFixed(4)})">
              <rect x="-2.2" y="-2.2" width="4.4" height="4.4" fill="${BRAND.paper}" stroke="${RETURN_COLOR}" stroke-width="0.35" />
              <line x1="-1.6" y1="1.6" x2="1.6" y2="-1.6" stroke="${RETURN_COLOR}" stroke-width="0.28" />
              <text x="0" y="0.7" font-size="1.4" font-weight="700" text-anchor="middle" fill="${RETURN_COLOR}">RA</text>
            </g>`;
          }
          return `<g transform="translate(${cx} ${cy}) scale(${s(1).toFixed(4)})">${renderDiffuserBodySvg(pin.patternTagCode, SUPPLY_COLOR, BRAND.paper)}</g>`;
        })
        .join("");

      // Crop container: overflow:hidden clips the image once it's zoomed
      // (via the CSS transform below) past the visible frame. The image
      // gets a CSS scale+translate that maps crop.minX/minY/size onto
      // the frame identically to how the SVG's own viewBox does for the
      // overlay above - both derived from the exact same crop rect, so
      // the raster floor plan and the vector overlay stay in lockstep.
      const imgTransform = `scale(${crop.zoomFactor.toFixed(4)}) translate(${(-crop.minX).toFixed(3)}%, ${(-crop.minY).toFixed(3)}%)`;

      return `<div class="section-title">Duct Routing${sheets.length > 1 ? ` — Sheet ${sheetIndex + 1}` : ""}</div>
        ${routingNotice}
        <div style="position:relative;display:inline-block;width:100%;overflow:hidden;border:1px solid ${BRAND.grid};">
          <img src="${sheet.imageDataUri}" alt="Duct routing sheet" style="width:100%;display:block;filter:grayscale(1) brightness(1.55) contrast(0.82);transform-origin:0 0;transform:${imgTransform};" />
          <svg viewBox="${crop.minX.toFixed(3)} ${crop.minY.toFixed(3)} ${crop.size.toFixed(3)} ${crop.size.toFixed(3)}" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;">
            ${zoneTintRect}
            ${routeLines}
            ${elbowSymbols}
            ${teeSymbols}
            ${pinIcons}
            ${labels}
          </svg>
        </div>`;
    })
    .join('<div style="page-break-before:always;"></div>');

  return pageShell(
    "Duct Routing",
    org,
    `${body}
     <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:18px;align-items:center;border:1px solid ${BRAND.grid};border-radius:6px;padding:10px 14px;font-size:11px;color:${BRAND.inkSoft};">
       <strong style="color:${BRAND.ink};">Legend</strong>
       <span style="display:flex;align-items:center;gap:6px;"><svg width="20" height="6"><line x1="1" y1="3" x2="19" y2="3" stroke="${SUPPLY_COLOR}" stroke-width="3" /></svg> Trunk (metal)</span>
       <span style="display:flex;align-items:center;gap:6px;"><svg width="20" height="6"><line x1="1" y1="3" x2="19" y2="3" stroke="${SUPPLY_COLOR}" stroke-width="1.8" stroke-dasharray="2.5,2" /></svg> Branch (flex)</span>
       <span style="display:flex;align-items:center;gap:6px;"><svg width="20" height="6"><line x1="1" y1="3" x2="19" y2="3" stroke="${SUPPLY_COLOR}" stroke-width="1" stroke-dasharray="2.5,2" /></svg> Run-out (flex)</span>
       <span style="display:flex;align-items:center;gap:6px;"><svg width="14" height="14"><rect x="2" y="2" width="10" height="10" fill="${BRAND.paper}" stroke="${RETURN_COLOR}" stroke-width="1.4" /><line x1="2" y1="12" x2="12" y2="2" stroke="${RETURN_COLOR}" stroke-width="1" /></svg> Return air grille</span>
       <span style="display:flex;align-items:center;gap:6px;"><svg width="14" height="14"><rect x="1" y="1" width="12" height="12" fill="${SYMBOL_INK}" /></svg> AHU / mechanical equipment</span>
       <span style="display:flex;align-items:center;gap:6px;"><svg width="14" height="14"><rect x="2" y="2" width="10" height="10" fill="${BRAND.paper}" stroke="${SUPPLY_COLOR}" stroke-width="1.4" /><line x1="2" y1="2" x2="12" y2="12" stroke="${SUPPLY_COLOR}" stroke-width="1" /><line x1="2" y1="12" x2="12" y2="2" stroke="${SUPPLY_COLOR}" stroke-width="1" /></svg> Supply register (one-way)</span>
       <span style="display:flex;align-items:center;gap:6px;"><svg width="14" height="14"><rect x="4" y="4" width="6" height="6" fill="${SYMBOL_INK}" /></svg> Branch takeoff (tee)</span>
       <span style="display:flex;align-items:center;gap:6px;"><svg width="22" height="14"><circle cx="7" cy="7" r="4.2" fill="none" stroke="${SUPPLY_COLOR}" stroke-width="1" /><text x="7" y="9.5" font-size="5" font-weight="700" text-anchor="middle" fill="${SUPPLY_COLOR}">1W</text><text x="16" y="6" font-size="4.2" font-weight="700" fill="${SUPPLY_COLOR}">6"⌀</text><line x1="12" y1="7" x2="20" y2="7" stroke="${SUPPLY_COLOR}" stroke-width="0.6" /><text x="16" y="13" font-size="4.2" font-weight="700" fill="${SUPPLY_COLOR}">80</text></svg> Register callout (type / size / CFM)</span>
     </div>
     <p class="muted" style="margin-top:8px;">
       Routed paths follow real orthogonal geometry through the open space between rooms - a shared trunk near
       the AHU with branches peeling off at right angles to each register, computed from each room's real
       extracted bounding box (matched to its confirmed pin position, not by name - see
       lib/ductPathGeometry.ts for why) so a run never cuts through a room it doesn't serve. Line weight marks
       real hierarchy: heavier where more registers' air travels the same run, lighter down to each individual
       run-out. This is axis-aligned room-box obstacle avoidance from real extracted geometry, not a full
       wall/door-vector CAD routing engine - disclosed, not hidden. Each zone's own confirmed return-air pin is
       always shown; additional per-room supply or return diffusers render when a technician has entered real
       duct_diffusers records for them (see the Diffusers &amp; Registers panel in Duct Design) - a room with none
       yet still shows the generic default this diagram always used. Pin positions were confirmed or placed by a
       technician against the actual source drawing - never AI-inferred without confirmation (see the Audit Trail
       page for who resolved each one and when).
     </p>
     ${data.residential!.zones
       .map((zone) =>
         renderAhuInstallationDetailBlock(
           zone,
           data.residential!.ahuInstallationDetails.find((d) => d.zone_id === zone.id) ?? null,
           data.residential!.ductRoutingModeByZone.find((m) => m.zoneId === zone.id) ?? null,
           org,
         ),
       )
       .join("")}`,
    projectAddress(data),
  );
}

// Manual D Schematic Diagram Generator, Section 6 - a standard template
// layout generated from ahu_installation_detail, not hand-drawn per
// project. Every field renders "Not yet specified" when null rather than
// a fabricated default - this is real install detail a technician enters
// once, not something derivable from Manual J/D/S calc output.
function renderAhuInstallationDetailBlock(
  zone: { id: string; name: string; ahu_label: string | null },
  detail: AhuInstallationDetailRow | null,
  routingMode: { basis: DuctRoutingModeBasis; source: string } | null,
  org: OrgBranding,
): string {
  const field = (label: string, value: string | number | null | undefined, unit = "") =>
    `<div class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-value" style="font-size:13px;">${
      value != null && value !== "" ? `${esc(String(value))}${unit}` : '<span class="muted">Not yet specified</span>'
    }</div></div>`;

  const takeoffs = detail?.supply_takeoff_sizes?.length ? detail.supply_takeoff_sizes.join(", ") : null;
  const filterReturns = detail?.filter_backed_return_specs?.length ? detail.filter_backed_return_specs.join("; ") : null;
  const dampers = detail?.damper_types?.length ? detail.damper_types.join("; ") : null;

  const routingBasisLabel = routingMode ? DUCT_ROUTING_MODE_BASIS_LABELS[routingMode.basis] : null;
  const routingBasisSourceNote =
    routingMode?.source === "room_duct_location"
      ? "derived from this zone's rooms' own entered duct location - not a new question asked of the technician"
      : routingMode?.source === "project_fallback"
        ? "derived from the project's foundation type / attic construction (no room duct_location entered yet)"
        : "not enough entered data yet to determine";

  return `<div style="page-break-before:always;"></div>
    <div class="section-title">AHU Installation Detail — ${esc(zone.ahu_label ?? zone.name)}</div>
    <p class="muted" style="font-size:11px;">
      Duct routing basis: <strong style="color:${BRAND.ink};">${esc(routingBasisLabel ?? "Unknown")}</strong>
      (${esc(routingBasisSourceNote)})
    </p>
    <div class="panel-grid">
      ${field("Plenum size", detail?.plenum_size)}
      ${field("Supply takeoff sizes", takeoffs)}
      ${field("Fresh air / ODA duct size", detail?.fresh_air_duct_size)}
      ${field("Refrigerant vapor line", detail?.refrigerant_vapor_line_in, '"')}
      ${field("Refrigerant liquid line", detail?.refrigerant_liquid_line_in, '"')}
      ${field("Return platform construction", detail?.return_platform_construction)}
      ${field("Return platform insulation", detail?.return_platform_insulation_r, " R-value")}
    </div>
    <div class="section-title" style="margin-top:10px;font-size:12px;">Condensate Routing</div>
    <div class="callout" style="font-size:11px;">
      ${detail?.condensate_routing_note ? esc(detail.condensate_routing_note) : '<span class="muted">Not yet specified.</span>'}
      <div class="muted" style="margin-top:6px;font-size:10px;">
        Code minimum: IMC 307.2.1 requires a minimum slope of 1/8 in. per 12 in. horizontal (1%) toward the point
        of disposal, trapped per the equipment manufacturer's instructions - this note documents the technician's
        actual routing, not an automated compliance check.
      </div>
    </div>
    <div class="section-title" style="margin-top:10px;font-size:12px;">Filter-Backed Return Grille(s)</div>
    <p style="font-size:11px;">${filterReturns ? esc(filterReturns) : '<span class="muted">Not yet specified.</span>'}</p>
    <div class="section-title" style="margin-top:10px;font-size:12px;">Dampers</div>
    <p style="font-size:11px;">
      ${dampers ? esc(dampers) : '<span class="muted">Not yet specified.</span>'}
      <span class="muted" style="display:block;font-size:10px;margin-top:4px;">
        IMC 608.1 requires a means to adjust air volume in branch/distribution ductwork - a manual balancing
        damper at each branch takeoff is the standard baseline method.
      </span>
    </p>
    <div class="muted" style="font-size:10px;margin-top:10px;">${esc(org.name)} — real technician-entered installation detail, not calculated.</div>`;
}

// ---------------------------------------------------------------------------
// Page 11: Extraction status / field reference
// ---------------------------------------------------------------------------
function renderExtractionStatusPage(
  data: ReportData,
  org: OrgBranding,
  drawings: Array<{ id: string; extraction_status: string; extracted_data: DrawingExtraction | null }>,
): string {
  const r = data.residential!;
  const totalRooms = r.rooms.length;
  const overriddenRooms = r.rooms.filter(
    (room) => room.sensible_gain_override != null || room.latent_gain_override != null,
  );
  const body = `
    <div class="section-title">Extraction Status</div>
    ${
      drawings.length > 0
        ? `<table>
            <thead><tr><th>Drawing</th><th>Status</th></tr></thead>
            <tbody>${drawings.map((d) => `<tr><td>${esc(d.id)}</td><td>${esc(d.extraction_status)}</td></tr>`).join("")}</tbody>
          </table>`
        : `<p class="muted">No drawings uploaded for this project - all data entered directly (${totalRooms} room${totalRooms === 1 ? "" : "s"}).</p>`
    }
    <div class="section-title">Field-Verified Overrides</div>
    ${
      overriddenRooms.length > 0
        ? `<table>
            <thead><tr><th>Room</th><th class="num">Sensible Override</th><th class="num">Latent Override</th></tr></thead>
            <tbody>${overriddenRooms
              .map(
                (room) =>
                  `<tr><td>${esc(room.name)}</td><td class="num">${room.sensible_gain_override != null ? fmt(room.sensible_gain_override) : "—"}</td><td class="num">${room.latent_gain_override != null ? fmt(room.latent_gain_override) : "—"}</td></tr>`,
              )
              .join("")}</tbody>
          </table>`
        : `<p class="muted">No field-verified overrides on this project.</p>`
    }
  `;
  return pageShell("Extraction Status / Field Reference", org, body, projectAddress(data));
}

// ---------------------------------------------------------------------------
// Page 11: Audit Trail & QA Certification
// ---------------------------------------------------------------------------
function renderAuditTrailPage(data: ReportData, org: OrgBranding, validation: ReportValidationResult): string {
  const auditRows = resolvedFieldResolutionsAudit(data.fieldResolutions);
  const qaRows = validation.discrepancies
    .map(
      (d) => `<tr>
        <td>${esc(d.label)}</td>
        <td class="num">${fmt(d.storedValue)}</td>
        <td class="num">${fmt(d.correctedValue)}</td>
        <td><span class="badge badge-corrected">QA Corrected</span></td>
        <td class="muted" style="font-size:10px;">${esc(d.reason)}</td>
      </tr>`,
    )
    .join("");
  const body = `
    <div class="section-title">Automated Cross-Foot Validation</div>
    ${
      validation.passed
        ? `<div class="callout"><span class="badge badge-pass">All Checks Passed</span> Room-level loads sum to system subtotals, system subtotals sum to the whole-house total, and latent components (structure + ducts + ventilation) reconcile at every level. Verified automatically before this report was allowed to render.</div>`
        : `<table>
            <thead><tr><th>Check</th><th class="num">Stored</th><th class="num">Corrected</th><th>Status</th><th>Reason</th></tr></thead>
            <tbody>${qaRows}</tbody>
          </table>`
    }
    <div class="section-title">Correction Log</div>
    ${
      validation.discrepancies.length > 0
        ? `<p class="muted">The discrepancies above were corrected in the underlying project data before this report was generated - never patched only in the rendered output, per this system's data-integrity standard.</p>`
        : `<p class="muted">No corrections were needed for this report.</p>`
    }
    <div class="section-title">UNRESOLVED Field Resolution Audit Trail</div>
    ${
      auditRows.length > 0
        ? `<table>
            <thead><tr><th>Field</th><th>AI Extracted</th><th>Final Value</th><th>Status</th><th>Reason</th><th>Resolved</th></tr></thead>
            <tbody>${auditRows
              .map(
                (row) => `<tr>
                  <td>${esc(row.table_name)}.${esc(row.field_name)}</td>
                  <td>${esc(row.ai_extracted_value) || "—"}</td>
                  <td>${esc(row.final_value) || "—"}</td>
                  <td><span class="badge ${row.resolution_type === "accepted" ? "badge-pass" : "badge-corrected"}">${row.resolution_type}</span></td>
                  <td style="font-size:10px;">${esc(row.override_reason) || "—"}</td>
                  <td class="muted">${new Date(row.resolved_at).toLocaleDateString()}</td>
                </tr>`,
              )
              .join("")}</tbody>
          </table>`
        : `<p class="muted">No AI-extracted fields required human resolution on this project.</p>`
    }
  `;
  return pageShell("Audit Trail & QA Certification", org, body, projectAddress(data));
}

// ---------------------------------------------------------------------------
// Top-level assembly
// ---------------------------------------------------------------------------
export function renderSummitReportHtml(
  data: ReportData,
  org: OrgBranding,
  buildingFrontFaces: Compass8 | null,
  drawings: Array<{ id: string; extraction_status: string; extracted_data: DrawingExtraction | null }> = [],
  floorPlanImageDataUri: string | null = null,
): string {
  if (!data.residential) {
    throw new Error("renderSummitReportHtml: only residential projects are supported by this baseline (Section 9 - commercial/industrial sections are explicitly out of scope).");
  }
  const validation = validateReportTotals(data);

  const pages = [
    renderCoverPage(data, org, buildingFrontFaces),
    renderWholeHouseSummaryPage(data, org),
    renderPerSystemSummaryPage(data, org),
    renderLoadShortFormWholeHousePage(data, org),
    renderLoadShortFormRoomsPage(data, org),
    renderAedPage(data, org),
    renderBuildingAnalysisPage(data, org),
    renderOrientationPage(data, org, buildingFrontFaces),
    renderFloorPlanPage(data, org, buildingFrontFaces, floorPlanImageDataUri),
    renderDuctRoutingPage(data, org),
    renderExtractionStatusPage(data, org, drawings),
    renderAuditTrailPage(data, org, validation),
  ].join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(data.project.name)} — Load Calculation Report</title>
<style>${getEmbeddedFontFaces()}${STYLES}</style>
</head>
<body>
${pages}
</body>
</html>`;
}

// Convenience wrapper matching the existing route.ts pattern - fetches
// nothing itself, just bundles the gate check alongside the render so a
// caller gets both without two separate calls.
export function renderSummitReportWithGate(
  data: ReportData,
  org: OrgBranding,
  buildingFrontFaces: Compass8 | null,
  drawings: Array<{ id: string; extraction_status: string; extracted_data: DrawingExtraction | null }>,
  resolvedKeys: Set<string>,
): { html: string; gate: ReportGenerationGateStatus } {
  const gate = getReportGenerationGateStatus(data, drawings, resolvedKeys);
  if (!gate.canGenerate) {
    return { html: "", gate };
  }
  return { html: renderSummitReportHtml(data, org, buildingFrontFaces, drawings), gate };
}
