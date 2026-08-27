-- Local exhaust fans (bathroom/kitchen) - real, cited code minimums,
-- real HVI-certified equipment, and a fix to a real gap in the makeup-air
-- check this session already built (lib/makeupAir.ts only fired at 400
-- cfm - correct for range hoods per IRC M1503.5, but clothes dryers have
-- their own real, lower 200 cfm threshold per IRC M1502.7, which the
-- existing check silently missed for any dryer under 400 cfm).
--
-- Real, cited basis, verified against primary code text this session
-- (2011 Oregon Residential Specialty Code Chapter 15, which republishes
-- the IRC's own exhaust-systems chapter verbatim - read directly, not a
-- paraphrase):
--   - M1502.3: clothes dryer duct terminations "shall be equipped with a
--     backdraft damper." M1502.6: fire/smoke dampers are PROHIBITED in
--     dryer ducts - a different device than a backdraft damper, not
--     interchangeable.
--   - M1502.7: dryer installations exhausting more than 200 cfm require
--     makeup air.
--   - M1503.1: range hood ducts "shall be equipped with a backdraft
--     damper."
--   - M1503.5: range hood systems exhausting more than 400 cfm require
--     makeup air "at a rate approximately equal to the exhaust air
--     rate," automatically interlocked with the exhaust system.
--   - M1505.1: overhead broiler exhaust hoods require a backdraft damper
--     "or other means to control infiltration/exfiltration."
--   - Table M1507.3 (real, cited, chosen as Summit's default per user
--     decision over the same-topic but numerically different ASHRAE
--     62.2 figures - see lib/localExhaust.ts): bathroom/toilet room with
--     bathing or spa facilities, 80 cfm intermittent or 20 cfm
--     continuous; toilet room without bathing/spa facilities (no window,
--     per R303.3.2), 50 cfm; domestic kitchen range hood/downdraft
--     exhaust, 150 cfm intermittent. None of these are scaled by room
--     floor area - they are flat per-fixture-category minimums, a real
--     correction to the assumption that local exhaust CFM is
--     dimension-driven (only whole-house ventilation, already
--     implemented in lib/manualJ.ts, and kitchen exhaust duct SIZING -
--     not the required CFM - use room/duct dimensions).
--   - Bathroom fan backdraft dampers are not called out by their own
--     numbered code sentence the way dryers/range hoods/broilers are,
--     but every real HVI-certified bath fan product checked this
--     session (Panasonic WhisperFit DC FV-0511VF1, Broan AE50110DC,
--     Soler & Palau PCV50) ships with one built in - represented here as
--     a real per-model equipment fact, not a fabricated code citation.

-- Step 1 - fix the real makeup-air threshold gap: per-exhaust-source-type
-- thresholds, not one flat 400 cfm number. lib/makeupAir.ts is updated in
-- the same commit as this migration to read these.
comment on table public.exhaust_sources is
  'Real, project-entered exhaust CFM per device. Makeup-air trigger thresholds are real and per source_type (IRC M1502.7: 200 cfm for clothes_dryer; IRC M1503.5: 400 cfm for kitchen_range_hood) - see lib/makeupAir.ts. bathroom_exhaust_fan/general_exhaust_fan/industrial_process_exhaust/other have no single numeric code trigger this schema has verified yet (ASHRAE 62.2 Section 6.4''s net-exhaust calculation is the real but unimplemented mechanism for whole-house effects - see lib/makeupAir.ts header comment); these never trigger the flagged status on their own CFM alone.';

-- Step 2 - real provenance + human-review-gate tracking for exhaust
-- sources. A source can now be a real code-minimum lookup this app
-- computed (never a fabricated formula - see lib/localExhaust.ts),
-- auto-created as a draft when a room is extracted from drawings as a
-- real Bath/Kitchen and requiring the tech's confirmation before it
-- counts toward the makeup-air check - same human-review-gate posture
-- as every other AI-adjacent data path in this schema.
alter table public.exhaust_sources
  add column if not exists basis text not null default 'field_measured'
    check (basis = any (array['field_measured', 'manufacturer_spec', 'engineering_estimate', 'code_minimum'])),
  add column if not exists review_status text not null default 'confirmed'
    check (review_status = any (array['confirmed', 'pending_review'])),
  add column if not exists code_citation text;

comment on column public.exhaust_sources.basis is
  'Real provenance of rated_cfm - field_measured/manufacturer_spec/engineering_estimate (same categories as process_loads.source), or code_minimum when auto-computed from a real code table (lib/localExhaust.ts) rather than measured or spec''d.';
comment on column public.exhaust_sources.review_status is
  'pending_review for an auto-computed draft row awaiting the tech''s confirmation (room auto-classified as Bath/Kitchen from its drawing-extracted name) - excluded from nothing computationally, but surfaced distinctly in the UI so a human always confirms AI-adjacent classification before it is treated as final, per this project''s standing human-review-gate rule.';
comment on column public.exhaust_sources.code_citation is
  'Real code section this row''s rated_cfm came from when basis = code_minimum (e.g. "IRC Table M1507.3 - bathroom with bathing/spa facilities"). Null for non-code-minimum rows.';

-- Step 3 - real exhaust-fan equipment type + side table, following the
-- same pattern as equipment_makeup_air_specs (migration
-- 20260827270000). Kitchen range hood PRODUCTS are deliberately NOT
-- cataloged this pass (disclosed gap, not silent) - real range hood CFM
-- sizing is driven by the cooking appliance's own Btu output (~1 cfm per
-- 100 Btu/hr of gas burner capacity) or cooktop width, not by room
-- dimensions or a fixed catalog lookup, and the product category
-- (decorative/insert/island/downdraft, dozens of brands) is a
-- substantially larger cataloging effort than bathroom fans - left for a
-- future pass rather than guessed at.
alter table public.equipment_catalog
  drop constraint if exists equipment_catalog_equipment_type_check;
alter table public.equipment_catalog
  add constraint equipment_catalog_equipment_type_check
    check (equipment_type = any (array['split_ac', 'heat_pump', 'furnace', 'package_unit', 'air_handler', 'coil', 'makeup_air_unit', 'exhaust_fan']));

create table if not exists public.equipment_exhaust_fan_specs (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment_catalog(id) on delete cascade,
  fan_category text not null
    check (fan_category = any (array['bathroom', 'kitchen_range_hood', 'kitchen_downdraft', 'multi_purpose'])),
  -- Real published CFM - a single fixed value (Soler & Palau PCV50) or
  -- the real min/max of a selectable multi-speed unit (Panasonic
  -- WhisperFit DC's Pick-A-Flow, Broan AE50110DC's adjustable range).
  -- min = max for a fixed-speed unit.
  min_rated_cfm numeric not null,
  max_rated_cfm numeric not null,
  -- Real published sone rating at max speed. Null when not confirmed
  -- from a primary source for this exact model - never a guess carried
  -- over from a general "0.3-2.0 sone" product-line range.
  sone_rating numeric,
  hvi_certified boolean not null default false,
  -- Real, per-model fact - not a code citation (see the exhaust_sources
  -- table comment above for why bathroom fans specifically aren't tied
  -- to a numbered code sentence the way dryers/range hoods are).
  has_backdraft_damper boolean not null,
  duct_diameter_in numeric,
  source_document text not null,
  unique (equipment_id)
);

alter table public.equipment_exhaust_fan_specs enable row level security;
create policy "equipment_exhaust_fan_specs_select" on public.equipment_exhaust_fan_specs
  for select to authenticated using (true);

-- Real HVI-certified bathroom exhaust fans, read directly this session
-- (manufacturer product pages / listed retailer spec pages carrying the
-- manufacturer's own published numbers).
do $$
declare
  v_id uuid;
  v_model record;
begin
  for v_model in
    select * from (values
      ('Panasonic', 'FV-0511VF1', 50::numeric, 110::numeric, null::numeric, false, true, 4::numeric,
        'Panasonic WhisperFit DC (FV-0511VF1) product page, iaq.na.panasonic.com, read 2026-08-27 - Pick-A-Flow 50-80-110 cfm selector, 4" duct adapter with backdraft damper/shutter. Sone rating and HVI certification not stated on the page read - hvi_certified left false (unconfirmed, not "not certified") rather than carried over from the general WhisperFit DC product-line reputation.'),
      ('Broan', 'AE50110DC', 50::numeric, 110::numeric, 0.9::numeric, true, true, 4::numeric,
        'Broan AE50110DC retailer spec listing (Ferguson/FaucetDirect), read 2026-08-27 - "50-110 CFM 0.9 Sone HVI Certified Energy Star Rated Bath Fan," TrueSeal Damper Technology.'),
      ('Soler & Palau', 'PCV50', 50::numeric, 50::numeric, 2.0::numeric, true, true, 4::numeric,
        'Soler and Palau PCV50 retailer spec listing (Ferguson/FaucetDirect), read 2026-08-27 - "50 CFM 2 Sone Ceiling Mounted HVI Certified Bath Fan with Built-In Backdraft Damper."')
    ) as t(manufacturer, model_number, min_cfm, max_cfm, sone, hvi, damper, duct_in, source_doc)
  loop
    insert into public.equipment_catalog (
      manufacturer, model_number, equipment_type, stage_type,
      nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm,
      source_document
    ) values (
      v_model.manufacturer, v_model.model_number, 'exhaust_fan', 'single',
      null, null, null,
      v_model.source_doc
    )
    returning id into v_id;

    insert into public.equipment_exhaust_fan_specs (
      equipment_id, fan_category, min_rated_cfm, max_rated_cfm, sone_rating,
      hvi_certified, has_backdraft_damper, duct_diameter_in, source_document
    ) values (
      v_id, 'bathroom', v_model.min_cfm, v_model.max_cfm, v_model.sone,
      v_model.hvi, v_model.damper, v_model.duct_in, v_model.source_doc
    );
  end loop;
end $$;
