-- Add 'sport' as a first-class entity_type for traditional/folk sports, martial
-- arts, games and racing events (Kabaddi, Kalaripayattu, Mallakhamba, Jallikattu,
-- Vallam Kali boat races, ...). Like the other cultural types it anchors to a
-- region/destination rather than a lat/lng, dedupes and carries sourced claims
-- the same way. Idempotent: drop + re-add the check.
alter table points_of_interest drop constraint if exists points_of_interest_entity_type_check;
alter table points_of_interest add constraint points_of_interest_entity_type_check
  check (entity_type = any (array[
    'poi', 'activity',
    'art_form', 'performing_art', 'craft', 'festival', 'cuisine', 'dish', 'sport', 'cultural'
  ]));
