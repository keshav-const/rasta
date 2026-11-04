-- Hold authoritative statistics (e.g. government tourist-visit counts) per
-- destination, as a flexible JSON blob so the API can expose verified numbers
-- without a column per metric. Idempotent.
alter table destinations add column if not exists stats jsonb not null default '{}'::jsonb;
