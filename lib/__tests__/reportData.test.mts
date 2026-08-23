// Regression test for the county-scoping bug: lib/reportData.ts's
// getReportData() used to filter climate_zone_reference by `state` only
// (no county, no ORDER BY, .limit(1)), so any state with more than one
// county row returned an arbitrary county's design temps. Confirmed live:
// a Harris County, TX project got Anderson County's numbers instead. This
// project has no test runner configured - run directly with
// `npx tsx lib/__tests__/reportData.test.mts`.
import { getReportData } from "../reportData";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(cond ? "PASS" : "FAIL", label, cond ? "" : (detail ?? ""));
  if (cond) pass++;
  else fail++;
}

// resolveCounty() calls the live Census geocoder over the network. Stub
// global fetch so this test is deterministic and doesn't depend on
// network access - it returns a Census-geocoder-shaped response for the
// fixture address used below.
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () =>
  new Response(
    JSON.stringify({
      result: { addressMatches: [{ geographies: { Counties: [{ BASENAME: "Harris" }] } }] },
    }),
    { status: 200 },
  )) as typeof fetch;

// Minimal fake of the chainable Supabase query builder - just enough of
// .from().select().eq().order().limit().maybeSingle()/.returns() for
// getReportData()'s pre-branch queries (project, climate zone, field
// resolutions, code minimums). project_type is deliberately not
// "residential"/"commercial"/"industrial" so none of the heavier
// per-project-type query branches run - this test is scoped to the
// climate-zone resolution fix only.
function makeMockSupabase() {
  const climateRowsByCountyKey: Record<string, unknown[]> = {
    // Two counties in the same state - exactly the ambiguity the bug hit.
    "TX|Harris": [
      {
        county: "Harris",
        iecc_zone: "2A",
        winter_design_temp_f: 29,
        summer_design_temp_f: 97,
        summer_coincident_wetbulb_f: 78,
      },
    ],
    "TX|Anderson": [
      {
        county: "Anderson",
        iecc_zone: "3A",
        winter_design_temp_f: 24,
        summer_design_temp_f: 99,
        summer_coincident_wetbulb_f: 76,
      },
    ],
  };

  const projectRow = {
    id: "p1",
    name: "Test Project",
    project_type: "unknown",
    address_line1: "4308 Vivian St",
    address_line2: null,
    city: "Houston",
    state: "TX",
    zip: "77006",
    wall_insulation_r_value: null,
    ceiling_insulation_r_value: null,
    floor_insulation_r_value: null,
    window_u_value: null,
    window_shgc: null,
    door_u_value: null,
    ach50: null,
    indoor_design_temp_heating_f: null,
    indoor_design_temp_cooling_f: null,
    occupants: null,
    attic_construction_type: null,
    available_static_pressure_iwc: null,
    supply_air_temp_f: null,
    selected_equipment_id: null,
    equipment_selection_notes: null,
  };

  return {
    from(table: string) {
      const filters: Record<string, string> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select() {
          return builder;
        },
        eq(col: string, val: string) {
          filters[col] = val;
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(table === "projects" ? { data: projectRow, error: null } : { data: null, error: null });
        },
        returns() {
          if (table === "climate_zone_reference") {
            const key = `${filters.state ?? ""}|${filters.county ?? ""}`;
            return Promise.resolve({ data: climateRowsByCountyKey[key] ?? [], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  };
}

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reportData = await getReportData(makeMockSupabase() as any, "p1");

  check(
    "resolves the correct county's climate zone, not an arbitrary one",
    reportData?.climateZone?.county === "Harris",
    `got ${JSON.stringify(reportData?.climateZone)}`,
  );
  check(
    "uses the correct county's design temps (29F/97F), not another county's (24F/99F)",
    reportData?.climateZone?.winter_design_temp_f === 29 && reportData?.climateZone?.summer_design_temp_f === 97,
    `got ${JSON.stringify(reportData?.climateZone)}`,
  );

  globalThis.fetch = originalFetch;

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
