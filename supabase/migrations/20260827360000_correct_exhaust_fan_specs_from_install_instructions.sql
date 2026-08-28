-- First real batch of the standing full-documentation-sourcing pass
-- (see memory: every equipment_catalog row needs its full doc set, not
-- just a spec sheet/product page - triggered by the dehumidifier max-ESP
-- miss). These two exhaust fan rows were originally sourced from a
-- product page/marketing page and left has_backdraft_damper/hvi_
-- certified as unconfirmed. Their real installation instructions and/or
-- spec sheet (separate documents, read directly this session) settle
-- both facts.
--
--   - Broan Models 504 & 505 Installation Instructions (Broan-NuTone
--     LLC, doc 99042342N): "The Model 505 uses 8" diameter ductwork and
--     has a built-in damper."
--   - Broan Models 504 & 505 Specification Sheet (Broan, doc 02K
--     1102498B): "Model 505 (8" model) has built-in backdraft damper"
--     and "All air and sound ratings shall be certified by HVI"
--     (explicit HVI-2100 CERTIFIED badge shown for this exact family).
--     Both facts confirmed real, not carried over from a differently-
--     sized sibling model.
--   - Panasonic WhisperFit DC FV-0511VF1 Specification Submittal Data
--     (IAQ21021ST-r4): "(HVI-Certified Data)" heading directly over the
--     full performance table, "certified by the Home Ventilating
--     Institute (HVI)" in the architectural spec text, and real exact
--     sone figures per Pick-A-Flow speed at the HVI 0.1 in. w.g. test
--     condition: <0.3 (50 cfm), <0.3 (80 cfm), 0.8 (110 cfm). The
--     110 cfm/0.8 sone figure is used here as sone_rating (the rated-
--     max-speed value, matching this schema's existing convention of
--     using max_rated_cfm as the headline number for Pick-A-Flow
--     products) rather than a range this single numeric column can't
--     represent - the real per-speed breakdown is preserved in this
--     comment and the row's own source_document for anyone who needs
--     the 50/80 cfm figures specifically.
update public.equipment_exhaust_fan_specs
set has_backdraft_damper = true,
    hvi_certified = true,
    source_document = 'Broan Models 504 & 505 Installation Instructions (99042342N) - "The Model 505 uses 8 in. diameter ductwork and has a built-in damper"; Broan Models 504 & 505 Specification Sheet (02K 1102498B) - "Model 505 (8 in. model) has built-in backdraft damper", "All air and sound ratings shall be certified by HVI" (HVI-2100 Certified badge shown). Both read directly this session, superseding the original product-page-only source which left these unconfirmed.'
where equipment_id = (select id from public.equipment_catalog where manufacturer = 'Broan' and model_number = '505');

update public.equipment_exhaust_fan_specs
set hvi_certified = true,
    sone_rating = 0.8,
    source_document = 'Panasonic WhisperFit DC FV-0511VF1 Specification Submittal Data (IAQ21021ST-r4) - "(HVI-Certified Data)" table heading, "certified by the Home Ventilating Institute (HVI)" in architectural spec text. Real per-speed sone at 0.1in.w.g. (HVI test condition): <0.3 (50 cfm), <0.3 (80 cfm), 0.8 (110 cfm) - 0.8 (the rated-max-speed figure) used here since sone_rating is single-valued; the full per-speed breakdown is in this comment for reference. Superseding the original product-page-only source, which left these unconfirmed.'
where equipment_id = (select id from public.equipment_catalog where manufacturer = 'Panasonic' and model_number = 'FV-0511VF1');
