-- Fills the remaining real Greenheck make-up air product families
-- disclosed as gaps in migration 20260827270000's Captive-Aire comment
-- and this session's own research: Model IGX (Indirect Gas-Configurable),
-- Model VSU (Direct Gas-Vertical), Model TSU (Direct Gas-Industrial),
-- Model MSX (Modular Supply, non-gas), Model TSF (non-tempered).
--
-- Sourced from two primary Greenheck catalog PDFs read directly this
-- session (both August 2025 editions):
--   - "Modular Make-Up Air Unit Model MSX" (00.TAP.1029 R8 8-2025)
--   - "Direct Gas-Fired Make-Up Air Models DGX, TSU and VSU"
--     (00.TAP.1046 R5 8-2025)
-- plus the IGX catalog read earlier this session
-- (content.greenheck.com/.../IGX_catalog.pdf, dated March 2026) and the
-- TSF product page (greenheck.com/products/air-conditioning/make-up-air/
-- non-tempered-make-up-air-units/tsf, read 2026-08-27 via WebFetch).
--
-- Naming correction: a prior session's disclosed-gap note referred to
-- the non-tempered model as "MSF." The current primary source's own URL
-- slug and product-page title confirm the real, current model code is
-- TSF, not MSF - "MSF" was a recording error from that earlier session,
-- not a real alternate name or a since-renamed product.

-- Step 1 - widen heating_fuel_type and control_type to real values these
-- new product families need. MSX supports hot water, steam, or electric
-- heat (customer-configured per order) - none of the existing
-- 'gas'/'electric'/'none' values describe that honestly, so a new
-- 'hydronic_steam_or_electric' value is added rather than forcing MSX
-- into 'electric' (which would hide that hot water/steam are equally
-- real, published options). IGX is indirect-gas-fired, a genuinely
-- different combustion arrangement from DGX/VSU/TSU's direct-gas
-- design (a heat exchanger keeps combustion products out of the supply
-- airstream) - reusing 'constant_volume_or_vav_gas_fired' would blur
-- that real distinction, so a separate control_type value is added.
-- MSX's coil-based heating/cooling and TSF's heat-free VAV/CV operation
-- each get their own real, distinct control_type value for the same
-- reason.
alter table public.equipment_makeup_air_specs
  drop constraint if exists equipment_makeup_air_specs_category_check;
alter table public.equipment_makeup_air_specs
  add constraint equipment_makeup_air_specs_category_check
    check (category = any (array['residential_damper', 'residential_fan_powered', 'commercial_tempered', 'commercial_untempered']));

alter table public.equipment_makeup_air_specs
  drop constraint if exists equipment_makeup_air_specs_heating_fuel_type_check;
alter table public.equipment_makeup_air_specs
  add constraint equipment_makeup_air_specs_heating_fuel_type_check
    check (heating_fuel_type = any (array['gas', 'electric', 'none', 'hydronic_steam_or_electric']));

alter table public.equipment_makeup_air_specs
  drop constraint if exists equipment_makeup_air_specs_control_type_check;
alter table public.equipment_makeup_air_specs
  add constraint equipment_makeup_air_specs_control_type_check
    check (control_type = any (array[
      'interlocked_powerline',
      'interlocked_direct_wired',
      'interlocked_pressure_switch',
      'interlocked_slave',
      'barometric_passive',
      'proportional_fan_powered',
      'constant_volume_or_vav_gas_fired',
      'constant_volume_or_vav_indirect_gas_fired',
      'coil_based_heating_cooling',
      'constant_volume_or_vav_untempered'
    ]));

do $$
declare
  v_id uuid;
  v_model record;
begin
  for v_model in
    select * from (values
      -- Model IGX (Indirect Gas-Configurable) - "Indirect Gas Make-Up
      -- Air Models IGX" catalog, March 2026, read directly this session.
      -- Real overall product-line max: up to 15,000 cfm, up to
      -- 1,200,000 Btu/hr heating, 81% thermal efficiency, up to 8:1
      -- staged / 16:1 modulating turndown. Unlike DG/DGX, this catalog's
      -- Dimensional Data & Weights table (housing sizes H12/H22/H32)
      -- gives only weights and heights, not a per-housing-size CFM/Btu
      -- breakdown - so this is cataloged as ONE product-level row
      -- (model_number 'IGX', not split by housing size) rather than
      -- inventing a per-housing split the manufacturer doesn't publish.
      ('IGX', null::numeric, 15000::numeric, 'gas'::text, 1200000::numeric,
        'constant_volume_or_vav_indirect_gas_fired'::text, false, null::numeric, null::numeric,
        'commercial_tempered'::text,
        'Greenheck Indirect Gas Make-Up Air Models IGX catalog, March 2026 - product-level max only; per-housing (H12/H22/H32) CFM/Btu breakdown not published in this catalog, unlike DG/DGX.'),

      -- Model VSU (Direct Gas-Vertical) - "Direct Gas-Fired Make-Up Air
      -- Models DGX, TSU and VSU" catalog (00.TAP.1046 R5 8-2025), page
      -- 11 "VSU Dimensional Data" table - real per-housing-size CFM
      -- ranges, same pattern as DG/DGX. Heating (up to 7,000 mbh, 92%
      -- thermal efficiency, 25:1 turndown) is the catalog's stated
      -- product-level max for both VSU and TSU (page 3), applied
      -- uniformly across housing rows - not broken out per size in the
      -- public catalog, same disclosed approach as DG/DGX's heating
      -- figure. Note: page 3's prose separately states an overall
      -- "800 - 64,000 cfm" range for VSU, which is inconsistent with
      -- VSU-20's own dimensional-table minimum of 2,500 cfm - both are
      -- real numbers printed in the same document; the per-housing
      -- dimensional-table figures are used here as the more specific,
      -- size-tied values.
      ('VSU-20', 2500, 6500, 'gas', 7000000, 'constant_volume_or_vav_gas_fired', false, null, null, 'commercial_tempered',
        'Greenheck Direct Gas-Fired Make-Up Air Models DGX, TSU and VSU catalog (00.TAP.1046 R5 8-2025), p.11 VSU Dimensional Data table.'),
      ('VSU-30', 6000, 12000, 'gas', 7000000, 'constant_volume_or_vav_gas_fired', false, null, null, 'commercial_tempered',
        'Greenheck Direct Gas-Fired Make-Up Air Models DGX, TSU and VSU catalog (00.TAP.1046 R5 8-2025), p.11 VSU Dimensional Data table.'),
      ('VSU-40', 14000, 28000, 'gas', 7000000, 'constant_volume_or_vav_gas_fired', false, null, null, 'commercial_tempered',
        'Greenheck Direct Gas-Fired Make-Up Air Models DGX, TSU and VSU catalog (00.TAP.1046 R5 8-2025), p.11 VSU Dimensional Data table.'),
      ('VSU-50', 32000, 60000, 'gas', 7000000, 'constant_volume_or_vav_gas_fired', false, null, null, 'commercial_tempered',
        'Greenheck Direct Gas-Fired Make-Up Air Models DGX, TSU and VSU catalog (00.TAP.1046 R5 8-2025), p.11 VSU Dimensional Data table.'),

      -- Model TSU (Direct Gas-Industrial) - same catalog, page 12 "TSU
      -- and DG Dimensional Data" table lists only one named housing,
      -- TSU-50, at 32,000-60,000 cfm - used here as the more specific,
      -- dimensional-table-tied figure. Page 3's prose separately states
      -- "33,000 - 64,000 cfm" for the TSU model line overall - a
      -- second real but slightly different number in the same document,
      -- not silently reconciled; both are disclosed rather than picking
      -- one as simply wrong.
      ('TSU-50', 32000, 60000, 'gas', 7000000, 'constant_volume_or_vav_gas_fired', false, null, null, 'commercial_tempered',
        'Greenheck Direct Gas-Fired Make-Up Air Models DGX, TSU and VSU catalog (00.TAP.1046 R5 8-2025), p.12 dimensional table (32,000-60,000 cfm); p.3 prose separately states 33,000-64,000 cfm for the TSU line - both real, not reconciled.'),

      -- Model MSX (Modular Supply) - "Modular Make-Up Air Unit Model
      -- MSX" catalog (00.TAP.1029 R8 8-2025). Real stated max airflow:
      -- up to 48,000 cfm, 4 in. wg (p.2). No explicit base-unit minimum
      -- cfm is published in this catalog - the "800 cfm" figure that
      -- appears (p.6) belongs specifically to the Packaged DX Cooling
      -- accessory's stated performance range (800-9,000 cfm, 3-16 tons),
      -- not the base unit's airflow floor, so min_rated_cfm is left
      -- null rather than reusing that narrower accessory figure as if
      -- it were the whole unit's minimum. Heating is hot water, steam,
      -- or electric (up to 218 kW = ~744,000 Btu/hr, a real unit
      -- conversion of the catalog's stated kW figure) - customer
      -- configured, no gas option, hence 'hydronic_steam_or_electric'.
      -- Cooling capable (chilled water, evaporative, or packaged DX);
      -- cooling tons uses the catalog's broader stated "3-16 tons of
      -- cooling" (p.6) - a narrower "3-5 ton, single phase only" subset
      -- is also stated in the same table and is not the figure used
      -- here.
      ('MSX', null, 48000, 'hydronic_steam_or_electric', 744047, 'coil_based_heating_cooling', true, 3, 16, 'commercial_tempered',
        'Greenheck Modular Make-Up Air Unit Model MSX catalog (00.TAP.1029 R8 8-2025), p.2 (48,000 cfm max, 4 in. wg) and p.6 (218 kW electric heat max, converted to ~744,047 Btu/hr; 3-16 tons cooling capacity).'),

      -- Model TSF (non-tempered) - greenheck.com TSF product page
      -- (.../make-up-air/non-tempered-make-up-air-units/tsf), read
      -- 2026-08-27. No heat source at all ('none') - a plain
      -- constant-volume-or-VAV outdoor-air supply unit. A prior
      -- session's disclosed-gap note referred to this model as "MSF";
      -- this primary source's URL slug and page title confirm the real
      -- current model code is TSF, correcting that earlier record.
      ('TSF', 33000, 64000, 'none', null, 'constant_volume_or_vav_untempered', false, null, null, 'commercial_untempered',
        'Greenheck TSF Non-Tempered Make-Up Air Unit product page (greenheck.com), read 2026-08-27 - 33,000-64,000 cfm, up to 3 in. wg static pressure. No housing-size breakdown published on this page.')
    ) as t(model_number, min_cfm, max_cfm, fuel, max_btu, control, cooling, min_tons, max_tons, category, source_doc)
  loop
    insert into public.equipment_catalog (
      manufacturer, model_number, equipment_type, stage_type,
      nominal_cooling_capacity_btu, nominal_heating_capacity_btu, rated_cfm,
      source_document
    ) values (
      'Greenheck', v_model.model_number, 'makeup_air_unit', 'single',
      null, null, null,
      v_model.source_doc
    )
    returning id into v_id;

    insert into public.equipment_makeup_air_specs (
      equipment_id, category, duct_diameter_in, min_rated_cfm, max_rated_cfm,
      heating_fuel_type, max_heating_capacity_btu, control_type,
      cooling_capable, min_cooling_tons, max_cooling_tons, source_document
    ) values (
      v_id, v_model.category, null, v_model.min_cfm, v_model.max_cfm,
      v_model.fuel, v_model.max_btu, v_model.control,
      v_model.cooling, v_model.min_tons, v_model.max_tons,
      v_model.source_doc
    );
  end loop;
end $$;
