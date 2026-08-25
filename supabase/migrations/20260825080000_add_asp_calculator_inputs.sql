-- Raw inputs behind projects.available_static_pressure_iwc, so that value
-- has an auditable derivation instead of being a bare typed-in number.
-- ASP = blower_tesp_iwc - (evaporator_coil_loss_iwc + air_filter_loss_iwc
-- + grilles_registers_loss_iwc), per ACCA Manual D - see
-- computeAvailableStaticPressure in lib/manualD.ts. All four are
-- optional: a tech can still type available_static_pressure_iwc directly
-- (e.g. from a prior Manual D worksheet) without ever filling these in -
-- they exist to support the calculator, not to gate the existing field.
alter table public.projects
  add column if not exists blower_tesp_iwc numeric,
  add column if not exists evaporator_coil_loss_iwc numeric,
  add column if not exists air_filter_loss_iwc numeric,
  add column if not exists grilles_registers_loss_iwc numeric;
