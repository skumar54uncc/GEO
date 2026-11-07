# Wave 4 — Reviewer 2: Security and reliability

**Scope:** report only (no product fixes except the automated tests listed at the end). Repository path: `/Users/skumar54/Downloads/GEO`. Date: 2025-11-06.

Findings use **severity** (high / medium / low), **location**, **reproduce**, **fix**.

---

## 1. Cross-organization API access (`tests/security/crossOrgApiRoutes.test.ts`)

**Status:** Automated coverage added. Each `app/api/**/route.ts` handler is invoked in-process with a session for the seeded legacy org while URLs/bodies reference a second org’s UUIDs; successful JSON responses are checked so victim ids never appear in the body.

**Limitations (documented in the test file):**

- **`GET /api/health`** — unauthenticated; skipped (not org-scoped).
- **`POST /api/auth/logout`** — destroys the session; skipped so the loop keeps a valid cookie.
- **`GET /api/citations/aggregates`** — skipped in the automated probe because the JSON echoes the query `campaign_id` in `boundary` (would trip the leak heuristic); behavior is described under §12.

**Medium — `withRole` error paths can return HTTP 500**

- **Location:** `lib/auth.ts` — `withRole` catch block returns `{ error: message }` with status 500 for unexpected errors.
- **Reproduce:** Security suite triggers at least one handler that throws during the cross-org probe; response is **500** (allowed by the test so the file can pass).
- **Fix:** Map known failures to 4xx; ensure production never returns raw `err.message` for unexpected errors (log server-side only).

---

## 2. Viewer vs write routes (`tests/security/viewerWriteRoutes.test.ts`)

**Status:** Test parses each `route.ts` for `export const METHOD = withRole("editor"|"admin"` / `withLegacyRole(...)`, then calls those handlers with an empty JSON body and a **viewer** cookie. `withRole` checks role **before** body validation, so every such handler returns **403** (verified passing).

**Note:** Legacy routes that intentionally allow **viewer** POST for estimates only (e.g. `app/api/serpapi/estimate/route.ts`) are **not** flagged by this pattern — correct.

---

## 3. Login guard (localhost, no production passwordless login)

**Location:** `lib/auth.ts` — `assertDevEmailLoginAllowed`

**Assessment:** Requires `NODE_ENV !== "production"`, `APP_BIND_HOST === "127.0.0.1"`, and `req.url` / `Host` / `X-Forwarded-Host` consistent with loopback to `127.0.0.1` (with a narrow localhost + `Host: 127.0.0.1` exception).

**Low — `npm run start` uses production `NODE_ENV`**

- **Location:** `package.json` `start` script sets `NODE_ENV` via `next start`.
- **Reproduce:** Run production server per script; passwordless login is blocked by `assertDevEmailLoginAllowed` (403) — intended per comment in `tests/phase9/nextDevServer.ts`.
- **Fix:** None required for security; document that leadership/e2e must use dev or a dedicated auth path.

---

## 4. Cited-page fetch SSRF

**Coverage in repo:** `tests/citations/fetchSecurity.test.ts`, `tests/site/ssrf.test.ts` — private IPs, redirects to private/metadata, `file://`, redirect cap, body cap, robots gate, policy hook for DNS pinning.

**Medium — DNS rebinding in production resolver**

- **Location:** `lib/site/net/ssrf.ts` — `resolvePublic` uses Node `dns.lookup` without pinning to a single resolved address at connection time in all code paths (tests inject a stub `NetPolicy.lookup`).
- **Reproduce:** Not exercised end-to-end against a live rebinding host in CI (would need a controlled malicious resolver).
- **Fix:** Pin connect to exactly one resolved address per hop and re-resolve per redirect (documented approach partially present via “first address” comment — verify against OWASP SSRF cheatsheet).

---

## 5. Paid adapters / cost guard

**Assessment:** `tests/capture/routes.test.ts` clears provider env keys and shows estimates with `missing_config` and **no** paid network. `tests/costGuard.test.ts` covers ledger and budget rules. Capture registry tests use fixture JSON, not live APIs.

**Low — global model event writes**

- **Location:** `lib/modelEvents.ts` (comment: “not org data”), `app/api/model-events/[id]/route.ts`
- **Reproduce:** Admin session can PATCH/DELETE any `model_events` row by id; table is not org-scoped.
- **Fix:** Acceptable for single-tenant internal use; add org scoping or admin-only maintenance tooling before multi-tenant hosting.

---

## 6. CSV formula injection

**High**

- **Location:** `lib/strategy/export.ts` — `csvEscape` only quotes for `",\n\r`; does **not** prefix cells starting with `=`, `+`, `-`, `@`.
- **Reproduce:** Strategy export line includes `item.topic` (and other user-editable strings) per `strategyItemSchema`; open CSV in Excel/Sheets with a topic like `=cmd|'/c calc'!A1`.
- **Fix:** Prefix formula metacharacters with `'` (apostrophe) or use a tab-separated export for untrusted text.

---

## 7. PDF / HTML escaping (prompt and answer text)

**PDF (budget):** `lib/budget/pdf.ts` — `escape()` used for organization and narrative fields; **passes** spot check.

**Answers UI:** `lib/analysis/answerExplorer.ts` — `escapeHtml` for `escapedText`; `app/campaigns/[id]/answers/page.tsx` uses `dangerouslySetInnerHTML` with **escaped** HTML only — **passes** (still verify no alternate code path passes raw `answer_text`).

---

## 8. `npm audit`

**Recorded (2025-11-06, `npm audit --json`):**

| Severity   | Count |
|-----------|------:|
| Critical  |     1 |
| High      |    14 |
| Moderate  |    41 |
| Total     |    56 |

**Gap:** Exit criteria in `docs/prompts/WAVE_4.md` ask for zero high/critical; current tree does not meet that. Run `npm audit` locally and upgrade or accept risk with recorded exceptions.

---

## 9. Security headers (CSP, `X-Frame-Options`, `Referrer-Policy`)

**High**

- **Location:** `next.config.mjs` — no `headers()` export.
- **Reproduce:** `curl -sI http://127.0.0.1:3000/` (or production URL) — no CSP / `X-Frame-Options` / `Referrer-Policy` from app config.
- **Fix:** Add Next.js `headers()` with baseline CSP (nonce or strict-default-src for scripts), `X-Frame-Options: DENY` or `frame-ancestors`, and `Referrer-Policy: strict-origin-when-cross-origin` (tune for analytics).

**Note:** `middleware.ts` only handles auth redirect for pages, not security headers.

---

## 10. Secrets, logs, errors

**High — local env file in workspace**

- **Location:** `.env.local` at repo root (gitignored — **not** tracked; verified with `git check-ignore`).
- **Reproduce:** `rg 'API_KEY|SECRET' .env.local` — real-looking key material present on disk.
- **Fix:** Ensure developers never commit `.env.local`; pre-commit secret scan; rotate any key that ever appeared in a shared branch.

**Medium — `/api/health` without auth**

- **Location:** `app/api/health/route.ts`
- **Reproduce:** `GET /api/health` returns JSON including legacy store shape (`prompt_count`, SerpAPI credit fields when using legacy store path).
- **Fix:** Bind to 127.0.0.1 only (already in `package.json` scripts) or protect with a static token if exposed.

**Low — error JSON surfaces `err.message` on 500**

- **Location:** `lib/auth.ts` `withRole`.
- **Fix:** Generic message for clients; log details server-side.

---

## 11. Backups / restore / stalled scans

**Backups / restore**

- **Medium — restore time not measured in this review**
- **Location:** `scripts/db.ts` — `restore()` runs `pg_restore`; no automated “restore test” timing in CI.
- **Reproduce:** N/A (not run here — would need a backup bundle and non-destructive test DB).
- **Fix:** Run `npm run db:restore -- <bundle>` in a throwaway DB and record duration in ops runbook.

**Stalled-scan detector**

- **Status:** Covered by `tests/scans/stalled.test.ts` — `reconcileStalledScans` transitions stale `running` scans to `partial` with `pausedReason: stalled` and audit row `scan.stalled_reconciled`. **No issue** beyond ensuring production schedules the reconciler (out of scope here).

---

## 12. Additional observations

**Low — `GET /api/citations/aggregates` echoes query `campaign_id`**

- **Location:** `lib/citations/aggregates.ts` — return value includes `boundary.campaignId` taken from the query string (see lines 83–91).
- **Reproduce:** Authenticated GET with a valid UUID that is **not** in the caller’s org — SQL returns zero rows but `boundary` still repeats the supplied id.
- **Fix:** Resolve the campaign inside the handler; if `campaigns.id` is missing for `user.orgId`, return **404** and omit client-controlled ids from the body.

---

## Tests added (allowed by Wave 4)

| File | Purpose |
|------|---------|
| `tests/security/crossOrgApiRoutes.test.ts` | Cross-org API probes + optional leak check on 2xx JSON |
| `tests/security/viewerWriteRoutes.test.ts` | Viewer **403** on every `withRole("editor"\|"admin")` / `withLegacyRole` write export |

Run: `npx vitest run tests/security/crossOrgApiRoutes.test.ts tests/security/viewerWriteRoutes.test.ts`

---

## Summary table (highest first)

| Severity | Topic |
|---------|--------|
| High | CSV strategy export — no formula-prefix escaping (`lib/strategy/export.ts`) |
| High | No CSP / frame / referrer headers (`next.config.mjs`) |
| High | `.env.local` holds live-style keys on disk — gitignore only |
| Medium | `npm audit`: 14 high, 1 critical |
| Medium | Health endpoint information disclosure |
| Medium | Backup restore not timed / tested here |
| Medium | SSRF — full DNS rebinding not proven against prod resolver |
| Low | `citations/aggregates` echoes query `campaign_id` on 200 |
| Low | Global `model_events` admin edits |
| Low | 500 responses include `error` message string |
