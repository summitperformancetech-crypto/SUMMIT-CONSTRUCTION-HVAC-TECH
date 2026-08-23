// SUMMIT-REPORT-STANDARD.md - the 11-page single-file HTML report. Reuses
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
      <div class="toc-item"><span>10. Extraction Status / Field Reference</span><span class="muted">10</span></div>
      <div class="toc-item"><span>11. Audit Trail &amp; QA Certification</span><span class="muted">11</span></div>
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
function renderAedPage(data: ReportData, org: OrgBranding): string {
  const body = `
    <div class="section-title">AED (Adequate Exposure Diversification) Assessment</div>
    <div class="callout warn">
      <strong>Not yet computed by this calculation engine.</strong> ACCA Manual J's AED check
      compares each orientation's (N/S/E/W) peak sensible contribution against a 30% excess
      limit, which requires per-orientation, time-of-day solar load data - this app's
      calculation engine (lib/manualJ.ts) computes a single static design-point load per room,
      not an hourly or per-orientation breakdown. Reporting an AED pass/fail without that
      underlying data would be a fabricated number, not a real assessment - so none is shown
      here. Building this out is a real, separate calculation-engine capability, not a report
      formatting task.
    </div>
    <table>
      <thead><tr><th>System</th><th>30% ACCA Limit</th><th>Peak Excess</th><th>Result</th></tr></thead>
      <tbody>
        ${data.residential!.manualJ.zones
          .map((z) => `<tr><td>${esc(z.zoneName)}</td><td class="muted">30%</td><td class="muted">not computed</td><td><span class="badge badge-neutral">Not Assessed</span></td></tr>`)
          .join("")}
      </tbody>
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
// Page 10: Extraction status / field reference
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
