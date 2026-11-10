-- API keys for the Khoj API product layer (M2). We store only the SHA-256 hash of
-- each key, never the raw key — so a DB leak can't be used to call the API. The
-- plan on the key drives rate limits + feature gates in the Go service. owner_email
-- is a stopgap until M3 wires real user accounts (Supabase Auth); later the plan
-- moves to the user/subscription and keys inherit it.
--
-- An earlier scaffold may already have created api_keys (with user_id/scopes), so
-- this is written idempotently: create if absent, then add any missing columns.
create table if not exists api_keys (
    id          uuid primary key default gen_random_uuid(),
    name        text not null default '',
    key_hash    text not null unique,              -- sha256(raw key), hex
    key_prefix  text not null default '',          -- first chars, for UI display only
    plan        text not null default 'free',
    owner_email text,
    created_at   timestamptz not null default now(),
    last_used_at timestamptz,
    revoked_at   timestamptz                        -- null = active
);

alter table api_keys add column if not exists plan text not null default 'free';
alter table api_keys add column if not exists owner_email text;
-- The old scaffold made user_id NOT NULL, but real accounts don't land until M3.
-- Allow keys without a user for now (keys carry their own plan).
alter table api_keys alter column user_id drop not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'api_keys_plan_check') then
    alter table api_keys add constraint api_keys_plan_check
      check (plan in ('free', 'pro', 'enterprise'));
  end if;
end $$;

create index if not exists idx_api_keys_hash on api_keys(key_hash) where revoked_at is null;
