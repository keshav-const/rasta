-- Rasta API product schema: world-extensibility + developer accounts/keys/billing/usage.
-- Additive + idempotent (IF NOT EXISTS) so it's safe to re-run.

-- 1. World-extensibility: tag every destination with a country (default India for the current graph).
alter table destinations add column if not exists country text not null default 'India';
create index if not exists idx_destinations_country on destinations (country);

-- 2. Developer API keys (hashed; the raw key is shown once at creation).
create table if not exists api_keys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'default',
  key_hash    text not null unique,          -- sha256(raw key)
  key_prefix  text not null,                 -- e.g. "rsk_live_ab12" for dashboard display
  scopes      text[] not null default '{}',
  last_used_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_api_keys_user on api_keys (user_id);

-- 3. Subscription / plan per developer (free default; pro/enterprise via Razorpay).
create table if not exists subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null unique references auth.users (id) on delete cascade,
  plan                     text not null default 'free' check (plan in ('free','pro','enterprise')),
  status                   text not null default 'active',
  razorpay_customer_id     text,
  razorpay_subscription_id text,
  current_period_end       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists idx_subscriptions_user on subscriptions (user_id);

-- 4. Per-key daily usage counters (dashboard + simple analytics).
create table if not exists api_usage (
  id          bigint generated always as identity primary key,
  api_key_id  uuid not null references api_keys (id) on delete cascade,
  day         date not null default current_date,
  requests    bigint not null default 0,
  unique (api_key_id, day)
);
create index if not exists idx_api_usage_key_day on api_usage (api_key_id, day);
