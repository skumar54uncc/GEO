# V1 exit gates

Status line for every report: **V1: x of 6**.

A gate is green only when its evidence is recorded below (or linked). Gate 3 requires every COVERAGE row **done**, **partial with a named external blocker**, or **deferred to v1.1 by recorded decision**.

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | P1 done (schedules, generation UI, B7 subset + leadership PDF) | **done** | P1b–P1d + real `application/pdf` leadership export + cross-org tests. |
| 2 | P2 done (B1 Demand, B3 regions, B4 matrix + SoV trend, B9 library export) | **done** | B1–B4 + B9 (library CSV/PDF + How we measure Wave 6 links). COVERAGE 11 done. |
| 3 | Every COVERAGE row done, partial with named external blocker, or deferred to v1.1 | **done** | Rows 9/12/15/22/25 done; 18+19 partial (UNC web team GA4 + Search Console); 17+21 deferred 2026-11-09 (Shailesh). Evidence table in `docs/COVERAGE.md` Gate 3 re-audit |
| 4 | CI green, visual QA at 390/1024/1440 in both orgs, no overflow/overlap | **done** | Vitest **573/573**, Playwright journeys **7/7 ×3**, `tsc` clean, lint (pre-existing analyze warning only). Contact sheet `docs/phase9-screenshots/v1g4-*` (78 PNGs, both orgs × 13 screens × 390/1024/1440): **0** overflow, **0** overlap. Lighthouse a11y overview/visibility/answers/gaps/budget **100** |
| 5 | Paid pilot run (Energy core) + 20 answers hand-checked against dashboard numbers | **blocked** | Funding + prompt freeze approval |
| 6 | Leadership review of real UNC Charlotte numbers | **blocked** | Depends on gate 5 |

**V1: 4 of 6** (gates 1–4 done; 5–6 blocked on funding / leadership review). Tag: **`v1.0-rc1`**.

Update the status line and this table whenever a gate flips. New product ideas go in `docs/BACKLOG.md`, not into v1 scope.
