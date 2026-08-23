// Shared headless-Chromium launcher for the two call sites that need one:
// app/api/reports/route.ts (report HTML -> PDF) and lib/floorPlanRender.ts
// (floor-plan PDF page -> PNG). Historically both imported the full
// `puppeteer` package directly, which bundles its own Chromium download -
// works out of the box locally, but too large for a standard Vercel
// serverless function bundle (flagged as a known gap since before this
// module existed). `puppeteer-core` + `@sparticuz/chromium` is the
// standard fix for serverless, but `@sparticuz/chromium`'s bundled binary
// is Linux-only (built for AWS Lambda's Amazon Linux runtime, which is
// also what Vercel's Node serverless functions run on) - it does not run
// on a local macOS/Windows dev machine. So this launcher branches: the
// full `puppeteer` package (still a devDependency, unchanged local
// behavior) for local dev, `puppeteer-core` + `@sparticuz/chromium` for
// the deployed serverless environment.
import type { Browser } from "puppeteer-core";

// Not yet verified against a real Vercel deployment (this app isn't
// deployed there yet) - the @sparticuz/chromium <-> puppeteer-core Chromium
// build compatibility, and the isServerless() detection below, should be
// confirmed on the first actual Vercel deploy.
function isServerless(): boolean {
  return Boolean(process.env.VERCEL) || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export async function launchBrowser(): Promise<Browser> {
  if (isServerless()) {
    const [{ default: chromium }, { default: puppeteerCore }] = await Promise.all([
      import("@sparticuz/chromium"),
      import("puppeteer-core"),
    ]);
    return puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const { default: puppeteer } = await import("puppeteer");
  // puppeteer's own Browser type is structurally identical to
  // puppeteer-core's for everything this app uses (newPage/pdf/close) -
  // both wrap the same underlying protocol client.
  return puppeteer.launch() as unknown as Promise<Browser>;
}
