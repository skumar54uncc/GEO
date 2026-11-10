# Handover — Scout / GEO (`v1.0-rc1`)

Product: in-house AI search visibility for **UNC Charlotte**. Tag **`v1.0-rc1`** is the pilot code freeze. **V1 exit:** see `docs/V1_EXIT.md` — gates **1–4 done**; **5–6** blocked on funding and leadership review.

## Code freeze

From **`v1.0-rc1`**: only **bug fixes** on `main`. Everything else → `docs/BACKLOG.md`.

Until the Energy pilot ends, treat these as frozen (bug fixes only):

| Area | Path |
|------|------|
| Capture | `lib/capture/` |
| Judging | `lib/judge/` |
| Metrics | `lib/metrics/` |

Check drift: `git diff v1.0-rc1 -- lib/capture lib/judge lib/metrics`

## How to start (local)

1. Postgres up (`npm run db:up` / compose as in README). `DATABASE_URL` in `.env`.
2. `APP_BIND_HOST=127.0.0.1` (set by `npm run dev` / `start` scripts).
3. Open **`http://127.0.0.1:3000`** (preferred). If Chrome rewrites the URL to `localhost`, sign-in still works — the app only binds loopback (`APP_BIND_HOST=127.0.0.1`).
4. Separate terminal: `npm run worker`.
5. Sign in with an email that has membership on **UNC Charlotte** (operator = editor/admin). Never pilot on Demo University for paid spend.

## Freeze `energy-core-v1`

1. UNC Charlotte org → Campaign **Energy** → **Prompts**.
2. Content team has approved the **30** core neutrals (no draft-only pilot).
3. Freeze **core only** with label **`energy-core-v1`**.
4. Record the prompt-set **SHA-256** shown in the UI into the pilot worksheet and `docs/PILOT_RUNBOOK.md` placeholder.
5. Do not edit prompts after freeze; edits start a new set.

## Estimate → approve → run

Full operator steps: **`docs/PILOT_RUNBOOK.md`**. Short form:

1. New scan on Energy: prompt set `energy-core-v1`, **30** prompts, Charlotte region, **6** primary engines, **3** draws, canary **on**.
2. **Estimate** — confirm upper ~**$12.89** (see runbook / Budget & Funding).
3. **Approve** only if refusals are empty and spend matches intent (logged).
4. Keep **`npm run worker`** running; watch `[scan]` / `[canary]` / Alerts.
5. Stop-loss auto-pauses (>20% errors in first 60 draws, or cost >125% of estimate).

## 20-answer hand check (gate 5)

After the paid pilot scan completes:

1. In Answer Explorer, sample **20** answers across engines (note `drawId`, engine, runner, fidelity).
2. For each: confirm dashboard mention / citation / list-position / sentiment match the stored answer + judge (do not re-judge by eye against a different model).
3. Spot-check **3** raw payloads per engine route used.
4. Record pass/fail in the pilot worksheet; mismatches are bugs (fix on `main` only if they are true defects).

Also see runbook gold-label (**50**) and cited-page (**20**) checks in `docs/PILOT_RUNBOOK.md` / `docs/EVALS.md`.

## If a scan fails or pauses

| Situation | What to do |
|-----------|------------|
| **Stop-loss pause** | Record `scanId`, `pausedReason`, alerts. Do **not** auto-retry paid draws. Investigate provider / budget; resume or abandon only with explicit operator decision. |
| **Canary failure** | That engine route is dropped for the scan. Fix canary cause before re-including the engine. |
| **Worker died** | Restart `npm run worker`; do not re-approve a finished batch. Check job queue / scan status. |
| **Provider outage** | Pause; error draws stay immutable. Re-run only as a **new** scan after freeze/estimate if leadership approves extra spend. |
| **Wrong org / demo data** | Stop. Demo University is fixtures only — never treat as UNC numbers. |

## Key docs

| Doc | Use |
|-----|-----|
| `docs/PILOT_RUNBOOK.md` | Full pilot checklist, stop-loss, rehearsal |
| `docs/V1_EXIT.md` | Gate status (**V1: x of 6**) |
| `docs/COVERAGE.md` | Feature coverage + Gate 3 evidence |
| `docs/BACKLOG.md` | Post-freeze work + v1.1 deferrals |
| `docs/PROVIDERS.md` | Prices / providers (do not invent numbers) |
| `docs/PUBLIC_LAUNCH.md` | Real auth when leaving 127.0.0.1 |
