-- Real, human-digitized corridor topology (trunk/branch nodes and edges
-- read directly off the actual construction set, not AI-inferred and not
-- computed obstacle-avoidance) - the source of truth for duct routing
-- geometry when it's available for a zone, per direct instruction: "use
-- the routing graph as the source of truth for corridor topology - don't
-- compute routing paths independently." lib/ductCorridorGraph.ts
-- consumes this; falls back to lib/ductPathGeometry.ts's computed
-- room-box-avoidance routing when a zone has none (most projects, since
-- this data has to be hand-digitized against the real drawing - there's
-- no automated way to produce it yet).
--
-- Shape (see lib/ductCorridorGraph.ts's CorridorGraph type): one JSON
-- object per zone with ahu/rooms/corridor_nodes/edges, coordinates in
-- real feet (the digitizer's own building-relative origin, NOT this
-- app's page-normalized space) - lib/ductCorridorGraph.ts calibrates
-- feet -> normalized using this zone's own already-confirmed room pins
-- as anchor points, rather than assuming the digitized origin lines up
-- with the rendered page's origin.
alter table public.zones
  add column if not exists corridor_graph jsonb;
