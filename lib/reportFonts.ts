// SUMMIT-REPORT-STANDARD.md Section 2 - the report must be a single
// self-contained HTML file, no external dependencies. Fonts were
// previously declared by name only (system-font fallback), which meant a
// system without IBM Plex installed rendered a different typeface than
// intended - not a self-containment gap exactly (no network fetch was
// ever required), but not a fully faithful render either. This embeds the
// real font files as base64 data URIs.
//
// Files in lib/fonts/ are vendored (not read from node_modules at
// runtime) directly from the @fontsource/ibm-plex-sans and
// @fontsource/ibm-plex-mono npm packages - just the four weights this
// report's own CSS actually declares (Sans 400/600/700, Mono 400/600),
// not the full family, to keep the embedded payload small. IBM Plex is
// SIL Open Font License 1.1 licensed (see lib/fonts/LICENSE-IBM-PLEX.txt)
// - free to embed/redistribute.
import { readFileSync } from "fs";
import { join } from "path";

// DEPLOYMENT RISK, flagged alongside the existing Puppeteer/Vercel gap in
// app/api/reports/route.ts: Next.js's serverless output file tracing
// needs to detect this fs.readFileSync(join(__dirname, ...)) pattern at
// build time to bundle lib/fonts/*.woff2 into the deployed function.
// Works in local dev (this file resolves relative to the actual source
// tree); not yet verified against an actual Vercel deployment - if the
// fonts silently fall back to system fonts in production, check the
// build's file-tracing output for lib/fonts/ first.
const FONT_DIR = join(__dirname, "fonts");

function fontFaceDataUri(fileName: string): string {
  const bytes = readFileSync(join(FONT_DIR, fileName));
  return `data:font/woff2;base64,${bytes.toString("base64")}`;
}

// Computed once per process (module-level, not per-request) - the font
// files never change at runtime, so there's no reason to re-read and
// re-encode them on every report generation.
export const EMBEDDED_FONT_FACES = `
  @font-face { font-family: 'IBM Plex Sans'; font-weight: 400; font-style: normal; src: url('${fontFaceDataUri("ibm-plex-sans-400.woff2")}') format('woff2'); }
  @font-face { font-family: 'IBM Plex Sans'; font-weight: 600; font-style: normal; src: url('${fontFaceDataUri("ibm-plex-sans-600.woff2")}') format('woff2'); }
  @font-face { font-family: 'IBM Plex Sans'; font-weight: 700; font-style: normal; src: url('${fontFaceDataUri("ibm-plex-sans-700.woff2")}') format('woff2'); }
  @font-face { font-family: 'IBM Plex Mono'; font-weight: 400; font-style: normal; src: url('${fontFaceDataUri("ibm-plex-mono-400.woff2")}') format('woff2'); }
  @font-face { font-family: 'IBM Plex Mono'; font-weight: 600; font-style: normal; src: url('${fontFaceDataUri("ibm-plex-mono-600.woff2")}') format('woff2'); }
`;
