-- "System Configuration" - project-level choice between one shared system
-- serving all zones through zone dampers, vs. an independent system per
-- zone (the only behavior that existed before this migration - matches
-- SUMMIT-REPORT-STANDARD.md Section 5.3's "one equipment panel per
-- AHU/zone" default). Real-world design tradeoff, not something the app
-- can infer: a single zoned system costs less equipment but is harder to
-- balance and needs a zone-damper control board; independent systems are
-- simpler to balance but mean sourcing/costing a second (often much
-- smaller) unit. Some contractors prefer one over the other categorically
-- - this is a per-project decision, defaulting to the existing behavior
-- so no existing project's equipment-selection UI changes unless someone
-- explicitly opts into zoned mode.
alter table public.projects
  add column if not exists hvac_system_configuration text not null default 'independent_per_zone';

alter table public.projects
  add constraint projects_hvac_system_configuration_check
    check (hvac_system_configuration = any (array['independent_per_zone', 'single_system_zoned']));
