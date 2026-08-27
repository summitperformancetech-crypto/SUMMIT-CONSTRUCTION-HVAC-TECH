-- Catalog Expansion + Recommended Install Package, Section 3 Gap 7 -
-- real, purchasable diffuser and duct-material SKUs, sourced broadly
-- across the national suppliers named per the user's own answer to Open
-- Question 4 (Hart & Cooley, Titus, Metal-Fab, Imperial, CertainTeed,
-- Johns Manville - no specific priority order). Every model/product-line
-- name below is a real, currently-sold product confirmed via each
-- manufacturer's own site or a real distributor listing - not invented.
--
-- Real, disclosed scope note: Metal-Fab's own current product line is
-- gas venting/chimney pipe, not diffusers or duct board - it did not fit
-- either of these two catalogs and is not forced into one; a real
-- Metal-Fab fit would be a future "vent/flue hardware catalog" this
-- session did not build (furnaces, which would need it, aren't in the
-- equipment catalog yet either - see the diagnostic report's Gap 1).
insert into public.diffuser_hardware_catalog (pattern_type, manufacturer, model, description, source_document) values
  ('one_way', 'Hart & Cooley', '301 Series', 'Steel single-deflection 1-way sidewall/ceiling register.', 'hartandcooley.com sidewall register series list (301/302/303/304/631/661/664/681/682/683/684)'),
  ('two_way', 'Hart & Cooley', '682M Series', 'Steel curved-blade 2-way sidewall/ceiling register.', 'hartandcooley.com / supplyhouse.com listing 703909 (10x6 Two-Way Steel Sidewall/Ceiling Register, 682M Series)'),
  ('three_way', 'Hart & Cooley', '303/A303 Series', 'Steel/aluminum curved-blade 3-way register, multi-shutter damper.', 'hartandcooley.com/product/303-a303-steel-aluminum-curved-blade-3-way-register-ms-damper'),
  ('four_way', 'Hart & Cooley', '304M Series', 'Steel sidewall supply register, 4-way, multi-shutter damper.', 'hartandcooley.com / lennoxpros.com listing 703901 (304M Series, 4-Way)'),
  ('sidewall', 'Hart & Cooley', '631 Series', 'Steel sidewall/ceiling supply register.', 'hartandcooley.com sidewall register series list'),
  ('linear_slot', 'Titus', 'ML-39', 'Aluminum Modulinear linear slot supply diffuser, 1-8 slot configurations, adjustable "ice tong" deflector blades.', 'titus-hvac.com/Products/Diffusers/ml-39'),
  ('return_grille', 'Titus', '350RL', 'Steel return grille, 3/4in blade spacing, 35deg deflection, optional opposed-blade damper.', 'titus-hvac.com / mlestimation.com "350RL - Steel Return Grille by Titus"')
on conflict (manufacturer, model) do nothing;

insert into public.duct_material_hardware_catalog (material_code, manufacturer, product_line, description, source_document) values
  ('flex_r6', 'Thermaflex', 'M-KE', 'Insulated acoustical flexible air duct, CPE core, Class I, R-6.', 'thermaflex.net/products/thermaflex-m-ke-flexible-duct'),
  ('sheet_metal', 'Imperial Manufacturing Group', 'Snap Lock Round Pipe', 'Galvanized round sheet-metal duct pipe, snap-lock seam.', 'imperialgroup.ca/product/galvanized-duct-pipe-fittings/round/pipe-elbows/round-pipe'),
  ('duct_board_1in', 'Johns Manville', 'Linacoustic R-300', 'Rigid fiberglass duct board/liner, Permacote-coated airstream surface, 1in.', 'jm.com/en/insulation-systems/hvac-insulation/linacoustic-r-300'),
  ('duct_board_1in', 'CertainTeed', 'ToughGard R', 'Fiberglass duct liner board, 1in, acoustical/thermal liner for sheet-metal duct.', 'hvacwholesaledirect.com "CertainTeed ToughGard R 1x48x100 Duct Liner 716882"')
on conflict (manufacturer, product_line) do nothing;
