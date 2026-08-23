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

const FONT_DIR = join(__dirname, "fonts");

function fontFaceDataUri(fileName: string): string {
  const bytes = readFileSync(join(FONT_DIR, fileName));
  return `data:font/woff2;base64,${bytes.toString("base64")}`;
}

// Lazy + memoized, NOT a module-level constant - confirmed via a real
// `npm run build` that Next.js evaluates API route modules during its
// build-time "collecting page data" pass in a context where __dirname
// resolves to a virtualized path (seen literally as /ROOT/lib/fonts/...)
// that the real font files don't exist at yet. Reading the files inside
// a function instead means disk access only happens the first time an
// actual request renders a report (real runtime, real __dirname), never
// during that build-time pass - this fixed a real build failure, not a
// hypothetical one.
let cached: string | null = null;

export function getEmbeddedFontFaces(): string {
  if (cached) return cached;
  cached = `
  @font-face { font-family: 'IBM Plex Sans'; font-weight: 400; font-style: normal; src: url('${fontFaceDataUri("ibm-plex-sans-400.woff2")}') format('woff2'); }
  @font-face { font-family: 'IBM Plex Sans'; font-weight: 600; font-style: normal; src: url('${fontFaceDataUri("ibm-plex-sans-600.woff2")}') format('woff2'); }
  @font-face { font-family: 'IBM Plex Sans'; font-weight: 700; font-style: normal; src: url('${fontFaceDataUri("ibm-plex-sans-700.woff2")}') format('woff2'); }
  @font-face { font-family: 'IBM Plex Mono'; font-weight: 400; font-style: normal; src: url('${fontFaceDataUri("ibm-plex-mono-400.woff2")}') format('woff2'); }
  @font-face { font-family: 'IBM Plex Mono'; font-weight: 600; font-style: normal; src: url('${fontFaceDataUri("ibm-plex-mono-600.woff2")}') format('woff2'); }
`;
  return cached;
}
