# Backlog (post-v1)

Anything that is not required for the six gates in `docs/V1_EXIT.md` lands here. Do not expand v1 scope from this list without an explicit decision.

## Code freeze (`v1.0-rc1`)

**Effective from tag `v1.0-rc1`:** only **bug fixes** land on `main`. New features, refactors, and nice-to-haves go in this file until the Energy pilot ends.

**Frozen until pilot ends (bug fixes only):**
- Capture: `lib/capture/`
- Judging: `lib/judge/`
- Metrics: `lib/metrics/`

Confirm with `git diff v1.0-rc1 -- lib/capture lib/judge lib/metrics` before any pilot-facing change.

## Deferred to v1.1 (recorded decisions)

| COVERAGE | Item | Reason | Decided | By |
|----------|------|--------|--------|-----|
| 17 | Variants as prompts | Out of v1 scope; ship after pilot | 2026-11-09 | Shailesh |
| 21 | nearestPage / preregister (B8) | Out of v1 scope; ship after pilot | 2026-11-09 | Shailesh |

## Wave 7 audit → V1_1 (hardening deferrals)

| ID | Item | Reason | Decided | By |
|----|------|--------|--------|-----|
| — | Metrics must never mix judge models within one series. A judge model change starts a new series. | Bake-off / judge retirement; each `judge_runs` row already stores `judge_model` | 2026-11-10 | Shailesh |
| F02 | Boot-time zod env schema | Nice to have, not a bug | 2026-11-10 | Shailesh |
| F04 | Non-default Postgres password in compose | DB loopback-only; existing volume password unchanged by compose edit | 2026-11-10 | Shailesh |
| F07 | Server-side viewer metric redaction | Localhost single-user guardrail, not a security hole mid-freeze | 2026-11-10 | Shailesh |
| F08 | Org-scope `model-events` | Catalog is global today; defer isolation | 2026-11-10 | Shailesh |
| F10 | Gate `demand/connections` admin-only | Optional hardening | 2026-11-10 | Shailesh |
| F19 | Structured worker logs | Observability hygiene | 2026-11-10 | Shailesh |
| — | `provider_cache` for site sources (`lib/site/providerCall.ts`) has no TTL and no `scanId` | Site audit provider rows never refresh on their own; UI should show the fetch date | 2026-11-10 | Shailesh |

## Ideas

| Idea | Notes | Added |
|------|-------|-------|
| SMTP / Graph delivery of scheduled leadership PDF | Deferred; schedules UI exists without email | 2026-11-09 |
| Three-layer RBAC (beyond Leadership / Operator) | Row 22 closed with role landing; deeper layers remain optional | 2026-11-09 |
| Intent × engine matrix on Overview | COVERAGE row 14 done on Visibility | 2026-11-09 |
| Multi-region campaign runs | COVERAGE row 8 / P2 B3 | 2026-11-09 |
| Production Fireworks keys for live prompt generation | Code path + cost guard shipped; fixture remains when not connected | 2026-11-09 |
| Peer-average SoV benchmark on KPI cards | Promoted into **P2 B4** (closes COVERAGE row 23 with Competitors + intent×engine matrix) | 2026-11-09 |

## How to add

1. One row per idea.
2. Name any external dependency (funding, keys, content-team approval).
3. Do not start implementation from this file while v1 gates are open unless the owner promotes the item into a numbered phase prompt.
