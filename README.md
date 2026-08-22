# Summit

Cloud platform for Summit Construction Technology & Restoration Group: field techs, estimators, and admins collect HVAC project data and generate ACCA Manual J / Manual D / Manual S load calculations, using auto-detected climate zone and NOAA/ASHRAE design temperatures. See [CLAUDE.md](./CLAUDE.md) for project purpose, roles, and architecture.

## Getting Started

1. Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from your Supabase project settings
   - `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_DB_URL` — service-role key and direct DB connection string (server-side only, never expose to the client)
   - `ANTHROPIC_API_KEY` — used by `app/api/drawings/extract/route.ts` for AI-based drawing extraction

2. Install dependencies and run the dev server:

   ```bash
   npm install
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

3. Database schema lives in `supabase/migrations/`. Apply against a Supabase project with the Supabase CLI:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

## Tests

```bash
npm test
```

Regression tests live under `lib/__tests__/`. `lib/__tests__/reportValidation.test.mts` reproduces a real historical report-generation bug (a silently-dropped ventilation-latent contribution) to guard against regressions.

## Architecture

See the "Planned Architecture" table in [CLAUDE.md](./CLAUDE.md). Report format is specified in [REFERENCE-DOCS/SUMMIT-REPORT-STANDARD.md](./REFERENCE-DOCS/SUMMIT-REPORT-STANDARD.md).
