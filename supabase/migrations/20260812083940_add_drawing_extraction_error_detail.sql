-- Diagnostic gap fix: a failed extraction (JSON.parse failure on the
-- model's response) previously discarded the raw response text entirely,
-- only recording extraction_status='failed'. This made a real failure
-- (Kinsela's 14-sheet drawing hitting the 4096-token output cap mid-JSON,
-- diagnosed 2026-08-12 by manually reproducing the exact API call outside
-- the app since there was nothing to inspect otherwise) undiagnosable
-- without exactly that kind of manual reproduction. Stores enough to
-- diagnose the next failure from the DB alone: what the model actually
-- returned, why generation stopped, and how much output budget was used.
alter table public.drawings
  add column if not exists extraction_error jsonb;
