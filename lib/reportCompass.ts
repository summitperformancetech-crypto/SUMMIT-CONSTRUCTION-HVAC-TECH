// SUMMIT-REPORT-STANDARD.md Section 7 - Summit's own compass diagram,
// never a competitor's graphic. A fixed compass ring (N always at top,
// standard orientation) with a rotating two-tone needle: the amber tip
// points at whatever direction the confirmed front entry actually faces
// (the visual anchor - NOT always literal south), the silver tip points
// 180° opposite. N/S/E/W ring labels are always in their normal fixed
// positions regardless of needle rotation - only the needle rotates.
import type { Compass8 } from "./constants/compass";

const COMPASS_DEGREES: Record<Compass8, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
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

export type CompassRenderOptions = {
  size?: number;
  frontFaces: Compass8 | null;
};

// Renders the fixed ring + rotating needle as a self-contained inline SVG
// string (no external assets, per Section 2). When frontFaces is null (no
// confirmed orientation), the needle is omitted entirely and a neutral
// "not yet confirmed" ring is drawn instead - a report must never imply a
// confirmed direction it doesn't actually have.
export function renderCompassSvg({ size = 220, frontFaces }: CompassRenderOptions): string {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.46;
  const innerR = size * 0.32;
  const needleR = size * 0.4;

  const ringLabels = `
    <text x="${cx}" y="${cy - outerR - 6}" text-anchor="middle" font-family="'IBM Plex Sans',sans-serif" font-size="${size * 0.09}" font-weight="700" fill="${BRAND.ink}">N</text>
    <text x="${cx}" y="${cy + outerR + size * 0.13}" text-anchor="middle" font-family="'IBM Plex Sans',sans-serif" font-size="${size * 0.09}" font-weight="700" fill="${BRAND.amber}">S</text>
    <text x="${cx + outerR + size * 0.1}" y="${cy + size * 0.03}" text-anchor="middle" font-family="'IBM Plex Sans',sans-serif" font-size="${size * 0.08}" font-weight="500" fill="${BRAND.inkSoft}">E</text>
    <text x="${cx - outerR - size * 0.1}" y="${cy + size * 0.03}" text-anchor="middle" font-family="'IBM Plex Sans',sans-serif" font-size="${size * 0.08}" font-weight="500" fill="${BRAND.inkSoft}">W</text>
  `;

  const rings = `
    <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="none" stroke="${BRAND.navy700}" stroke-width="2" />
    <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="none" stroke="${BRAND.grid}" stroke-width="1" />
  `;

  if (!frontFaces) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      ${rings}
      ${ringLabels}
      <text x="${cx}" y="${cy + size * 0.02}" text-anchor="middle" font-family="'IBM Plex Sans',sans-serif" font-size="${size * 0.06}" fill="${BRAND.inkSoft}">Orientation</text>
      <text x="${cx}" y="${cy + size * 0.11}" text-anchor="middle" font-family="'IBM Plex Sans',sans-serif" font-size="${size * 0.06}" fill="${BRAND.inkSoft}">not yet confirmed</text>
    </svg>`;
  }

  const frontDeg = COMPASS_DEGREES[frontFaces];
  const rearDeg = (frontDeg + 180) % 360;
  // SVG angle 0 = pointing right (east); compass 0deg = north (up) - the
  // standard -90 offset converts compass bearing to SVG angle.
  const toXY = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const frontTip = toXY(frontDeg, needleR);
  const rearTip = toXY(rearDeg, needleR);

  const needle = `
    <line x1="${cx}" y1="${cy}" x2="${frontTip.x.toFixed(2)}" y2="${frontTip.y.toFixed(2)}" stroke="${BRAND.amber}" stroke-width="${size * 0.02}" stroke-linecap="round" />
    <line x1="${cx}" y1="${cy}" x2="${rearTip.x.toFixed(2)}" y2="${rearTip.y.toFixed(2)}" stroke="${BRAND.silver}" stroke-width="${size * 0.02}" stroke-linecap="round" />
    <circle cx="${cx}" cy="${cy}" r="${size * 0.025}" fill="${BRAND.navy700}" />
  `;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${rings}
    ${needle}
    ${ringLabels}
  </svg>`;
}
