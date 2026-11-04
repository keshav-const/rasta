-- Widen points_of_interest.entity_type to admit CULTURAL entities (art forms,
-- performing arts, crafts, folk/traditional festivals, cuisines) alongside
-- physical places. These anchor to a region/destination rather than a lat/lng
-- but otherwise match, dedupe and carry sourced claims exactly like a POI.
-- "cultural" is a generic catch-all the extractor LLM emits for an unlabeled
-- tradition or a community/tribe. Idempotent: drop + re-add the check.
alter table points_of_interest drop constraint if exists points_of_interest_entity_type_check;
alter table points_of_interest add constraint points_of_interest_entity_type_check
  check (entity_type = any (array[
    'poi', 'activity',
    'art_form', 'performing_art', 'craft', 'festival', 'cuisine', 'dish', 'cultural'
  ]));
