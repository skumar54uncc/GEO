# Changelog

## 2026-11-03: Planning docs for Phases 1 to 9

Docs only. No application code changed.

Added:
- `docs/ROADMAP.md`: objectives with acceptance tests, vendor gaps we target, feature list per phase, UI rules, model roles, verification gates, risks.
- `docs/PROVIDERS.md`: provider table and budget carried over from a 2026-10-21 research pass, with [V]/[E] tags. Added Bright Data and Keyword Planner rows (unknown price). Local SERP marked experimental.
- `docs/PUBLIC_LAUNCH.md`: path to a multi tenant public version.
- `docs/prompts/MASTER_CONTEXT.md` and `docs/prompts/PHASE_2.md` to `PHASE_9.md`.
- `docs/prompts/LOCAL_SERP.md` (written for the openserp fork) and `docs/prompts/LOCAL_MODELS.md`.

Changed:
- `docs/prompts/PHASE_1.md` upgraded: local only binding, backup and restore, raw store with file backing, `audit_log`, sessions, CI, verification gate.
- `docs/ARCHITECTURE.md`: new tables (`bot_hits`, `entity_checks`, `seasonal_events`, `search_console_queries`, `ai_referral_traffic`, `serp_snapshots`, `alerts`, `audit_log`, `sessions`), raw payload file storage, sentiment span on `judge_runs`, owner and publish by on strategy items, first mention rate, branded series kept separate, local SERP rules, new job queues, section 12 decisions, section 13 security, section 14 local first data policy.
- `docs/SPEC.md`: thin UI per phase, added features per phase, McNemar instead of a two proportion test, verification gate in the definition of done.

Reconciled with an earlier draft spec: kept McNemar and cluster bootstrap (the draft's two proportion test and Wilson on draws overstate precision for paired, correlated data), kept 5 runners including api_parametric, kept table names from ARCHITECTURE, kept 20 calibration prompts. Took from the draft: master context block, journalist, donor, research partner personas, Keyword Planner and Bright Data candidates, first mention rate, owner and publish by date, dashboard parts.

Unverified:
- Every price in `docs/PROVIDERS.md` (last checked 2026-10-21). Phase 3 rechecks.
- Whether a UI capture provider exists for Perplexity.
- Whether the local SERP service can pass parity. Its own logs show heavy blocking.

Pending (needs a non markdown edit):
- `.gitignore`: add `SerpAPI/`, `backups/`, `data/raw/`.
