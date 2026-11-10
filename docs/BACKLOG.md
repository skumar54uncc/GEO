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
