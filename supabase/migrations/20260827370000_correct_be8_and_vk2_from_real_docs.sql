-- Second batch of the exhaust-fan sweep (see 20260827360000 for the
-- first). Real spec sheets/submittal data, read directly this session.
--
--   - Broan-NuTone BE6 Specification Sheet (42F 1114923C) and BE8
--     Specification Sheet (42G 1112585C): both state "Non-metallic
--     damper/duct connector shall be included" - identical language on
--     the shared Roomside Series housing/duct-connector platform.
--   - Panasonic WhisperGreen Select brochure (VF18952SS): HVI-2100
--     Certified badge shown for the full WhisperGreen Select line
--     including FV-0511VK2, with real per-speed sone data at the 0.1"
--     w.g. HVI test condition: <0.3 (50 cfm), <0.3 (80 cfm), 0.8 (110
--     cfm). NOTE: unlike the WhisperFit DC line (FV-0511VF1, corrected
--     20260827360000), this WhisperGreen Select brochure does NOT state
--     a built-in backdraft damper for FV-0511VK2 - it only mentions a
--     separately-sold Ceiling Radiation Damper (a different, fire-rated
--     device, not a backdraft damper). has_backdraft_damper is left
--     false/unconfirmed here deliberately - a different product
--     generation's real spec, not assumed from the sibling line.
update public.equipment_exhaust_fan_specs
set has_backdraft_damper = true,
    source_document = 'Broan-NuTone BE6 Specification Sheet (42F 1114923C) - "Non-metallic damper/duct connector shall be included." Superseding the original product-page-only source, which left this unconfirmed.'
where equipment_id = (select id from public.equipment_catalog where manufacturer = 'Broan-NuTone' and model_number = 'BE6');

update public.equipment_exhaust_fan_specs
set has_backdraft_damper = true,
    source_document = 'Broan-NuTone BE8 Specification Sheet (42G 1112585C) - "Non-metallic damper/duct connector shall be included." Same Roomside Series housing/duct-connector platform as BE6. Superseding the original product-page-only source, which left this unconfirmed.'
where equipment_id = (select id from public.equipment_catalog where manufacturer = 'Broan-NuTone' and model_number = 'BE8');

update public.equipment_exhaust_fan_specs
set hvi_certified = true,
    sone_rating = 0.8,
    source_document = 'Panasonic WhisperGreen Select brochure (VF18952SS) - HVI-2100 Certified badge shown for the FV-0511VK2 base fan; real per-speed sone at 0.1in.w.g. (HVI test condition): <0.3 (50 cfm), <0.3 (80 cfm), 0.8 (110 cfm) - 0.8 used here (rated-max-speed convention). This brochure does NOT state a built-in backdraft damper for this model (only a separately-sold Ceiling Radiation Damper, PC-RD05C5, a different fire-rated device) - has_backdraft_damper deliberately left unconfirmed, not assumed from the sibling WhisperFit DC line.'
where equipment_id = (select id from public.equipment_catalog where manufacturer = 'Panasonic' and model_number = 'FV-0511VK2');
