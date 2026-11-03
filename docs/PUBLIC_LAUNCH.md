# Public launch path (later, not now)

Today the platform runs on one Mac for UNC Charlotte only (ARCHITECTURE section 12). This file lists what changes if it is offered to other universities. Nothing here is built until Shailesh decides to go public.

## 1. Already done for this (from Phase 1)

- `organizations`, `memberships`, roles, and org scoping in the repository layer.
- `audit_log` on every write.
- Raw data content addressed and immutable.
- Cost guard and `provider_accounts` per provider.

## 2. Hosting

| Piece | Local today | Public option | Notes |
|---|---|---|---|
| Postgres with pgvector | Docker on this Mac | Managed Postgres with pgvector (for example Neon, Supabase, AWS RDS, Cloud SQL) | Pricing unknown until chosen. Point-in-time recovery required |
| App | `next dev` on 127.0.0.1 | Vercel or a container host | Long jobs never in route handlers |
| Worker | `npm run worker` | A long running container (Fly, Render, ECS, Cloud Run jobs) | pg-boss needs a persistent process |
| Raw files | `data/raw/` | Object storage (S3, R2, GCS) with the same sha256 keys | Write once, versioning on |
| Secrets | `.env.local` | The host's secret manager | Rotate provider keys per environment |

## 3. Tenant isolation

- Postgres row level security on every org owned table, keyed by `org_id` from the session, in addition to the repository layer.
- Separate provider budgets per org. One tenant cannot spend another's budget.
- Shared caches only for public data (`cited_pages`). Draws, prompts, and recommendations never shared.
- Per tenant export and delete.

## 4. Identity

- SAML or OIDC SSO (university IdPs, InCommon). Magic link as fallback.
- SCIM provisioning for larger customers.
- MFA for admins.

## 5. Trust and policy

- Subprocessor list (every provider in `docs/PROVIDERS.md`).
- Data retention per table, configurable per tenant.
- A written statement: customer prompts and answers are never used to train models.
- Collection method published per engine and runner (our honesty advantage).
- Terms review for every provider for resale or multi tenant use.
- Accessibility statement (WCAG 2.1 AA), which universities will ask for.
- Path to SOC 2 Type II: policies, access reviews, logging, vendor reviews, then an audit. Months of work and an auditor fee (unknown, get quotes).

## 6. Billing

- Price by draws, the same unit as the cost model in ARCHITECTURE section 8. Show the draw budget on the plan, as the honest vendors do.
- UI runners and API runners priced separately.
- Stripe or university procurement invoicing.

## 7. Operations

- Error tracking and uptime monitoring.
- Per tenant canary and alerting.
- Backups tested by restore monthly.
- Incident process and a status page.
