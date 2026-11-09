-- Enable trigram search on entity names so the API's q= can do typo-tolerant,
-- RANKED fuzzy matching (similarity/%) instead of plain ILIKE substring. The GIN
-- index makes both the % operator and similarity() fast. Idempotent.
create extension if not exists pg_trgm;
create index if not exists idx_poi_name_trgm
  on points_of_interest using gin (name gin_trgm_ops);
