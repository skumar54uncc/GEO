# Pilot runbook (operator)

Live pilot for **Energy** content-team **core** prompts only: **30** neutral prompts, **6** primary engines, **3** draws each, **Charlotte** region → about **540** AI answers (plus **6** canary draws, one per engine route). This is also **V1 gate 5** after funding approval. Companion: **`docs/HANDOVER.md`**.

**Code freeze:** tag **`v1.0-rc1`**. Only bug fixes on `main` until the pilot ends; new work → `docs/BACKLOG.md`. Capture / judge / metrics trees stay unchanged from the tag except bug fixes (`git diff v1.0-rc1 -- lib/capture lib/judge lib/metrics`).

**Upper estimate (verified in repo):** `estimateContentTeamSeries` / `buildFundingPage` use `primaryRouteUsdPerDrawByProvider()` and `providerShareForPrompts(30, …)` → **$12.888** upper for 30 prompts (display **$12.89**). Source: `lib/contentTeam/estimate.ts`, `lib/budget/funding.ts`, `lib/budget/providers.ts`. Prices verified on **2026-11-03** per `docs/PROVIDERS.md`.

**Stop-loss (automatic):** `STOP_LOSS_CONFIG` in `lib/contracts/stopLoss.ts` — pause if **>20%** of the **first 60** draws are `error` or `blocked`, or if actual cost exceeds estimate by **>25%**.

---

## Before the run

1. **DataForSEO balance** — Account should have at least **$50** available (public minimum top-up; see `DATAFORSEO_MIN_TOPUP_USD` in `lib/budget/funding.ts`). Confirm credits in the provider dashboard; align **monthly** and **per-scan** caps on the Budget / Settings screens with leadership’s approved numbers (`lib/capture/accounts.ts` defaults are starting points only).
2. **Prompt set** — Content team has approved the **30 Energy core** neutrals. In Scout: Campaign **Energy** → Prompts → confirm status **approved** (no draft-only pilot).
3. **Freeze `energy-core-v1`** — After approval, freeze **core only** with label `energy-core-v1`. Record the prompt-set **SHA-256** shown in the UI: `(fill after freeze)`.
4. **No other scan** — Do not start another paid scan or schedule tick until this pilot finishes or is explicitly paused.
5. **Backup** — Run `npm run db:backup` and confirm a fresh dump under your backup location (see `docs/ARCHITECTURE.md` § hosting).
6. **Worker + app** — In separate terminals from the project root (ensure `node`, `npm`, and Postgres client tools are on `PATH`):
   - `npm run worker`
   - `npm run dev` (bind **127.0.0.1** only; open `http://127.0.0.1:3000`, not `localhost`)
7. **Keep the Mac awake** — `caffeinate -dimsu` for the expected run duration.
8. **Canary** — Leave **canary enabled** on the scan (default). A failed canary **drops that engine route** for the scan; do not ignore canary failure alerts.
9. **Rehearse on fixtures (optional)** — `npm run pilot:rehearse` on **Demo University** (no paid calls). Fix anything that fails before live spend.

---

## Run (estimate → approve → worker)

### UI path (preferred)

1. Sign in as **operator** (editor/admin) on the **UNC Charlotte** org (not Demo University).
2. **Campaigns** → **Energy**.
3. **New scan** / batch capture:
   - **Prompt set:** `energy-core-v1` (frozen).
   - **Prompts:** all **30** core items from that set (not persona variants).
   - **Region:** Charlotte.
   - **Engines:** all **6** primary routes (ChatGPT, Gemini, Perplexity, Claude, Google AI Overview, Google AI Mode — primary providers per `lib/capture/registry.ts`).
   - **Draws per prompt:** **3**.
   - **Canary:** on.
4. **Estimate** — Review the breakdown on the estimate screen and on **Budget & Funding**. Total upper should match **`buildFundingPage` → `pilot.usdUpper`** (~**$12.89** for 30 prompts). Note **stop-loss** text on the Budget page (20% / 60 draws, 25% cost).
5. **Approve** — Confirm only if refusals are empty and the total matches what you intend to spend. Approval is logged; the scan moves to **running**.
6. **Worker** — Ensure `npm run worker` is running so `scan.run` jobs process. Watch worker logs for `[scan]` lines and `[canary]` results.
7. **While running** — On the scan detail / capture UI, watch per-engine progress. Open **Alerts** if the scan **pauses** (stop-loss).

### API / CLI (equivalent)

- Plan via `POST /api/capture/batch` with `prompt_set_id`, `draws: 3`, `canary: true`, Charlotte `region_ids` (see `batchSpec` in `lib/capture/service.ts`).
- Approve via the scan approve route after verifying `estimate.totalUsd`.
- Or use patterns from `scripts/dry-run.ts` for a **3-prompt** dry run only; the **pilot** uses the full frozen set of **30**, not `DRY_RUN_SHAPE`.

### Payload audit (during / after)

- For each **prompt × engine**, expect **3** `draws` rows (immutable).
- **Claude** and **Perplexity** primary routes are **medium-fidelity API search** (`api_search` via DataForSEO). Confirm `search_used = true` on scored draws (`lib/metrics/load.ts` excludes `api_search` without it).

---

## Stop conditions

| Trigger | Behavior |
|--------|----------|
| **Stop-loss: errors** | After **60** draws observed, if **>12** are `error` or `blocked`, scan → **`paused`**, alert `provider_error_rate`, audit `scan.stop_loss_paused`. |
| **Stop-loss: cost** | If **actual** spend exceeds **125%** of **estimated** total, scan → **`paused`**, alert `budget_threshold`. |
| **Manual** | Operator pauses from UI, kills worker, or revokes approval path. Do not auto-retry paid draws. |
| **Canary failure** | Route removed for this scan; investigate before re-running that engine. |

If paused, record `scanId`, `pausedReason`, and alert payloads before resume or abandon. Do **not** auto-retry paid draws. Canary failures drop that engine for the scan — fix before re-including. Worker crash → restart `npm run worker` without re-approving a completed batch. Wrong org / Demo University → stop; demo is never UNC pilot data. See also `docs/HANDOVER.md`.

---

## After the run

1. **20-answer hand check (gate 5)** — Sample **20** Answer Explorer rows across engines. Confirm mention / citation / list position / sentiment match the stored answer + judge (same runner/fidelity series — never average). Log `drawId` pass/fail in the pilot worksheet.
2. **Payloads** — Spot-check **3** raw payloads per **prompt × engine** (Answer Explorer → raw payload link). Confirm runner, fidelity, and region metadata match the plan.
3. **`search_used`** — SQL or Answers filter: Claude / Perplexity draws used for metrics should have `search_used = true`.
4. **Rollup stability** — Run metrics twice; results must match except `rolledAt`:
   - Worker does this on `metrics.rollup` automatically.
   - Operator check: `npx tsx scripts/audit-metrics.ts` on **test** DB shape, or rehearsal script’s rollup compare for fixtures.
5. **Audit metrics on pilot scan** — For the real pilot `scanId`, compare dashboard numbers to a recomputation policy your stats reviewer signs off (Wave 4 `scripts/audit-metrics.ts` pattern).
6. **Cost vs estimate** — Budget page: `cost_ledger` / scan actual vs `estimate.totalUsd` (target within stop-loss band).
7. **Gold labels** — Pull **50** random draws: **Settings → Gold-label sample**, or  
   `npx tsx scripts/export-gold-label-sample.ts --scanId <pilot-scan-uuid>`  
   Hand-label in your worksheet; store in `gold_labels` when labeling UI exists.
8. **Cited pages** — Per `docs/EVALS.md`, hand-check **20** cited pages from this scan (source class, listicle, schema, freshness).
9. **Leadership exports** — Overview + Visibility leadership PDF (`/api/campaigns/[id]/leadership-pdf`), **Budget & Funding** PDF (`/api/budget/pdf`), gap/strategy exports as needed. Label real UNC Charlotte data with scan date and **n**; never export Demo University without the demo banner.

---

## Rehearsal (fixtures only)

```bash
npm run pilot:rehearse              # happy path on Demo University
npm run pilot:rehearse -- --fault=errors25
npm run pilot:rehearse -- --fault=cost30
npm run pilot:rehearse -- --fault=kill-mid
npm run pilot:rehearse -- --fault=sleep
```

Requires `DATABASE_URL` (use `--test-db` only if you intentionally point at the test database). Optional `--fresh-demo` resets Demo University via `seedFullDemoOrg`.

Freeze label used in rehearsal: **`demo-energy-core-v1-rehearsal`** (not the live `energy-core-v1`).
