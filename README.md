# Scout

**Scouting what AI says about us.** Local measurement instrument for how AI answer engines describe an institution (default org: UNC Charlotte), and why. Campaigns each own their prompts, engines, regions, and personas.

This is not a marketing page. Correctness first. The archive of raw answers, raw judge JSON, and raw provider JSON is the asset, and it is immutable. Brand assets live in `public/brand/`.

Plan and rules: `docs/SPEC.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`. Phase prompts: `docs/prompts/`. Changes: `docs/CHANGELOG.md`.

## Stack

Next.js 14 App Router, TypeScript, Tailwind, shadcn-style UI, Recharts. Postgres 16 with pgvector (local), Drizzle ORM, pg-boss worker. Fireworks for the judge. SerpAPI for Google AI Overview, organic results, PAA, related searches.

Everything runs on this machine. The app and Postgres listen on 127.0.0.1 only.

## Setup (macOS, no admin rights needed)

1. Node 20: any install works (this Mac uses `~/.local/node`; add `~/.local/node/bin` to PATH).
2. Postgres: [Postgres.app](https://postgresapp.com) with PostgreSQL 16 (includes pgvector). Open it and click Initialize. Docker users can run `docker compose up -d` instead.
3. Configure and start:

```bash
cp .env.example .env.local      # then fill FIREWORKS_API_KEY, JUDGE_MODEL, CONTENT_MODEL, SERPAPI_API_KEY
npm install
npm run db:up                   # creates the database, checks pgvector, applies migrations
npm run migrate:sqlite          # dry run: shows what would move from data/tracker.db
npm run migrate:sqlite -- --apply
npm run dev                     # http://127.0.0.1:3000
npm run worker                  # in a second terminal: background jobs
```

Sign in with your email. The first person to sign in becomes admin; later people start as viewer. Change roles with `npm run user:role -- someone@charlotte.edu editor`. Set `ALLOWED_LOGIN_DOMAINS=charlotte.edu` to restrict sign in.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | App on 127.0.0.1:3000 |
| `npm run worker` | pg-boss worker (`health.ping`, hourly `schedule.tick`) |
| `npm run worker:ping` | Sends a health ping and waits for the worker to process it |
| `npm run db:backup` | `pg_dump` into `backups/` (also copy `data/raw/`) |
| `npm run db:restore -- <file> [db]` | Restore a dump, optionally into another local database |
| `npm run typecheck` / `npm run lint` / `npm test` | Checks. Tests use `TEST_DATABASE_URL`, which is wiped on every run |

## Non-negotiables

- Never fake engine answers. Every answer records its runner (UI provider, SERP provider, API with search, API without browsing, manual paste) and fidelity.
- Stored answers, raw payloads, frozen prompt sets, and the audit log cannot be changed: application code refuses and Postgres triggers reject it. Re-saving a captured run with different text returns 409.
- “Charlotte” alone is the city and does not count as the university.
- Every rate shows its denominator and a 95% interval. Consistency sits beside visibility.
- Paid calls go through the cost guard: estimate first, refuse over cap or balance, cache by full parameters, no retry loops. One bad call never crashes a batch.

## Data

Postgres database `geo` (local). Large raw payloads in `data/raw/` named by sha256. The original SQLite file `data/tracker.db` is kept untouched as the migration source. Nothing in `data/`, `backups/`, or `.env.local` is committed.
