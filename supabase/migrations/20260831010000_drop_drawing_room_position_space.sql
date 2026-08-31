-- Reverts migration 20260830020000 (drawings.room_position_space), which
-- backed an approach that was tried and abandoned on 2026-08-31: having
-- the extraction model re-estimate room bounding boxes against the app's
-- own page render. Verified against Schneider that a vision-model
-- fraction-of-page estimate is not accurate enough for pin placement in
-- any raster. The real fix (in progress) recovers true room polygons from
-- the PDF's vector wall geometry instead - it does not use this column.
-- The column was applied to the live DB but never populated or read by
-- committed code.
alter table public.drawings drop column if exists room_position_space;
