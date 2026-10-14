# Supabase — Travel Intelligence Engine

Schema for the extraction pipeline (`pipeline-spec.md`). CLI-migration layout.

## Files

| File | What |
|------|------|
| `config.toml` | Local Supabase stack config |
| `migrations/20260630120000_init_schema.sql` | 12 tables, indexes, constraints, `updated_at` triggers |
| `seed.sql` | Delhi + Gurgaon destinations + core areas |

## Install CLI (not yet installed)

```powershell
scoop install supabase            # or:
npm install -g supabase           # or: winget install Supabase.CLI
```

## Apply

### Option A — local stack (Docker; you have it)
```powershell
cd C:\ts
supabase start                    # boots Postgres + Studio
supabase db reset                 # runs migrations, then seed.sql
# Studio: http://localhost:54323
```

### Option B — hosted project
```powershell
supabase link --project-ref <your-ref>
supabase db push                  # apply migrations
supabase db push --include-seed   # + seed (or run seed.sql in SQL Editor)
```

### Option C — no CLI
Paste `migrations/20260630120000_init_schema.sql` then `seed.sql` into the
Supabase dashboard SQL Editor, in that order.

## Schema map (FK order)

```
sources
destinations ──< areas
destinations ──< points_of_interest >── areas
points_of_interest ──< entity_evidence >── sources
points_of_interest ──< verification_data
points_of_interest ──< entity_aliases
sources ──< entity_resolution_log >── points_of_interest
sources ──< resolution_review_queue >── points_of_interest
users ──< user_entities >── points_of_interest
users ──< user_submissions >── sources
```

## Notes
- `gen_random_uuid()` = `pgcrypto`; `updated_at` auto-bumps via `moddatetime`.
- Closed-set columns use CHECK constraints (`status`, `stance`, `entity_type`,
  `match_type`, `verification_status`). Open lists (`poi_category`,
  `content_type`) left as free TEXT for extensibility per spec.
- `seed.sql` is idempotent (`on conflict do nothing`).
