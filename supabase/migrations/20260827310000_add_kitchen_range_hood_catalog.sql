-- Real kitchen range hood/blower products - the disclosed gap from
-- migration 20260827280000 (that migration deliberately left kitchen
-- range hood PRODUCTS uncatalogued, noting real hood CFM sizing is
-- driven by the cooking appliance's own Btu output, not room
-- dimensions, and that the product category is large/varied). This pass
-- adds a real, representative set spanning the CFM range that matters
-- for the two real code checks that actually gate on range hood CFM:
-- IRC Table M1507.3's 150 cfm kitchen-exhaust minimum, and IRC M1503.5's
-- 400 cfm makeup-air trigger.
--
-- fan_category = 'kitchen_range_hood', distinct from 'bathroom' - never
-- cross-matched in components/makeup-air-section.tsx's candidate filter.
-- A general ventilation/bath fan, however high its CFM, is not a legal
-- or safe substitute for real grease-duty-rated range hood equipment;
-- this distinction is enforced by fan_category, not just CFM.
do $$
declare
  v_id uuid;
  v_model record;
begin
  for v_model in
    select * from (values
      ('Broan-NuTone', 'PM400SS', 450::numeric, 450::numeric, false, true,
        'Broan-NuTone PM400SS product page (broan-nutone.com), read 2026-08-27 - "450 Max Blower CFM," "Damper Included: No" (explicit - this insert does NOT ship with a backdraft damper; a separate wall-cap damper per IRC M1503.1 is required), "HVI Certified: Yes," duct 3-1/4in x 10in or 6in round.'),
      ('Broan', 'RHVB600SSV', 600::numeric, 600::numeric, false, true,
        'Broan Select (RHVB600SSV) range hood ventilator, retailer listings (Wurth Baer Supply, Ferguson), read 2026-08-27 - "HVI certified 600 CFM on High with an 8 in. round duct, or 580 CFM with a 3-1/4 x 10 in. duct." Code-Ready Technology (CRT) lets the field-configured CFM be set to 600/400/300 at install. Backdraft damper not stated in the listings checked - left false (unconfirmed).'),
      ('Zephyr', 'CBI-600A', 600::numeric, 600::numeric, false, false,
        'Zephyr CBI-600A internal blower, Home Depot/Lowe''s retailer listing titles ("Zephyr Quiet 600 CFM Internal Blower for Range Hood"), read 2026-08-27. A blower component, not a complete hood - backdraft damper and HVI certification not confirmed for this specific model.')
    ) as t(manufacturer, model_number, min_cfm, max_cfm, damper, hvi, source_doc)
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
      v_id, 'kitchen_range_hood', v_model.min_cfm, v_model.max_cfm, null,
      v_model.hvi, v_model.damper, null, v_model.source_doc
    );
  end loop;
end $$;
