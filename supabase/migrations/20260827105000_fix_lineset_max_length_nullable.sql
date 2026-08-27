-- Corrects 20260827030000: max_equivalent_length_ft was declared not
-- null, but real sourcing immediately hit a case (Daikin DZ4SE) where
-- the manufacturer's Product Specifications table only publishes a
-- factory-rated line length, deferring true max-length/derate figures to
-- a separate document not sourced this pass - the null-means-unknown
-- convention this project uses everywhere else requires this to be
-- nullable, not a guessed number.
alter table public.refrigerant_lineset_specs
  alter column max_equivalent_length_ft drop not null;
