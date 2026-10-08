# UNC Charlotte Energy AI Visibility Tracker

Local measurement instrument for how often and how prominently UNC Charlotte appears in AI answers about energy, and why.

This is not a marketing page. Correctness first. The archive of raw answers, raw judge JSON, and raw SerpAPI JSON is the asset.

## Stack

Next.js 14 App Router, TypeScript, Tailwind, Recharts. SQLite via `better-sqlite3` (JSON file store if the native module fails). Fireworks (OpenAI-compatible) for the judge. SerpAPI for Google AI Overview, organic results, PAA, and related searches.

## Setup

```bash
cp .env.example .env.local
# Set FIREWORKS_API_KEY, JUDGE_MODEL (exact dated Fireworks ID), CONTENT_MODEL, SERPAPI_API_KEY
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`JUDGE_MODEL` should be the exact dated ID from the Fireworks dashboard. Recommended: DeepSeek V4 Pro.

## MVP path (1–6)

1. Data layer seeds 50 prompts plus alias / competitor / subtopic / asset lists.
2. SerpAPI credit guard and cache: estimate before every batch, refuse over cap or balance, cache by full parameter set, `no_cache=false`, no retry loops.
3. Google AIO two-step fetch, back to back per prompt, plus organic diagnostic from the same first call.
4. Manual capture for ChatGPT, Gemini, Claude, Perplexity (3 runs each, location note required).
5. Judge JSON contract with one repair call; Analyze screen for hand-check / override.
6. Dashboard: visibility with Wilson 95% CI and denominator, share of voice, visibility by surface, run consistency, gap matrix, cited domains, competitor leaderboard, organic-versus-AI table.

## Non-negotiables

- Do not fake the four chat assistants. They are paste-only.
- Google AIO is location-pinned to the United States. Manual runs carry a location note (default Charlotte NC, incognito). The dashboard states the difference.
- “Charlotte” alone is the city and does not count as the university.
- Every rate shows its denominator. Consistency sits beside visibility.
- One bad judge or SerpAPI call never crashes a batch.

## Data

SQLite file: `data/tracker.db` (gitignored). JSON fallback: `data/store.json`.
