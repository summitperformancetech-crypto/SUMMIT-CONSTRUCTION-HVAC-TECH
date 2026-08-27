-- Broaden the bathroom exhaust fan catalog beyond the initial 3
-- representative models (migration 20260827280000) - real, sourced
-- directly from manufacturer product pages this session, spanning real
-- CFM tiers 50-200 across 4 distinct real brand labels.
--
-- Not marked multi_purpose/kitchen-usable at any CFM: a general
-- ventilation/bath fan, however high its CFM, is not a legal or safe
-- substitute for a real range hood in a kitchen - kitchen exhaust must
-- be grease-duty rated equipment (IRC M1503), a genuinely different
-- product category, not yet cataloged (see this session's kitchen
-- range hood migration). Cataloging a 200 cfm bath fan as kitchen-
-- capable here would be a real safety-relevant mistake, not just an
-- inventory gap.
do $$
declare
  v_id uuid;
  v_model record;
begin
  for v_model in
    select * from (values
      ('Broan-NuTone', 'BE6', 60::numeric, 60::numeric, 0.9::numeric, true, false, 4::numeric,
        'Broan-NuTone BE6 product page (broan-nutone.com), read 2026-08-27 - "60 CFM, 0.9 Sones," HVI certified. Backdraft damper not confirmed on this page - left false (unconfirmed, not "no damper").'),
      ('Broan-NuTone', 'BE8', 80::numeric, 80::numeric, 1.5::numeric, true, false, 4::numeric,
        'Broan-NuTone BE8 product page (broan-nutone.com), read 2026-08-27 - "80 CFM, 1.5 Sones," HVI certified. Backdraft damper not confirmed on this page.'),
      ('NuTone', 'AER110K', 110::numeric, 110::numeric, 1.0::numeric, true, true, 4::numeric,
        'NuTone AER110K product page (broan-nutone.com), read 2026-08-27 - "110 CFM, 1.0 Sones," HVI-2100 certified, "4 in. duct connector with damper" (explicit backdraft damper).'),
      ('Broan', '505', 200::numeric, 200::numeric, 8.5::numeric, false, false, 8::numeric,
        'Broan 505 (8-Inch Vertical Discharge Fan) product page (broan-nutone.com), read 2026-08-27 - "200 CFM, 8.5 Sones," 8 in. duct. Backdraft damper and HVI certification not stated on this page - both left false (unconfirmed).'),
      ('Panasonic', 'FV-0511VK2', 50::numeric, 110::numeric, null::numeric, false, false, 4::numeric,
        'Panasonic WhisperGreen Select (FV-0511VK2) product page (iaq.na.panasonic.com), read 2026-08-27 - Pick-A-Flow 50/80/110 cfm selectable, "< 0.3 sones" at all three speeds (real max-sone number not isolatable from that range - left null rather than reporting an upper bound as if it were the rated figure). Page mentions a separate FlexDamper ceiling-radiation-damper accessory (PC-RD06C6) - a different device from a backdraft damper, not counted as one. HVI certification not stated on this page.')
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
