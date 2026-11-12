-- Billing subscriptions (M4). One row per Razorpay subscription a user starts.
-- The user's EFFECTIVE plan = the plan of their latest active subscription, else 'free'.
-- The Go API doesn't read this table — it reads api_keys.plan; on a billing event we
-- just stamp the user's keys' plan column (see web/lib/billing.ts applyPlanToKeys).
create table if not exists subscriptions (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null,                     -- auth.users id
    plan          text not null default 'pro',       -- 'pro' | 'enterprise'
    status        text not null default 'created',   -- created|authenticated|active|halted|cancelled|completed|expired
    razorpay_subscription_id text unique,            -- sub_xxx
    current_period_end       timestamptz,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create index if not exists idx_subscriptions_user on subscriptions(user_id);
create index if not exists idx_subscriptions_rzp  on subscriptions(razorpay_subscription_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_plan_check') then
    alter table subscriptions add constraint subscriptions_plan_check check (plan in ('pro','enterprise'));
  end if;
end $$;
