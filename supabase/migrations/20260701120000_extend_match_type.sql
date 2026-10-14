-- Stage 6 resolution produces two match_type values beyond the spec's original
-- enum: 'new' (created a new canonical POI) and 'review' (queued for manual review).
-- Extend the CHECK constraint to allow them.

alter table entity_resolution_log
    drop constraint if exists entity_resolution_log_match_type_check;

alter table entity_resolution_log
    add constraint entity_resolution_log_match_type_check
    check (match_type in (
        'exact', 'fuzzy', 'alias', 'places_api', 'manual', 'discarded', 'new', 'review'
    ));
