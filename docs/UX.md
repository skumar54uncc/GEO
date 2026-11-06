# Wave 0/1 UX specification

Status: production UX contract for Wave 0 planning and Wave 1 shell/contracts. Later phases implement the screens in the order required by `docs/SPEC.md`: 6, 4, 7, 8, then 9.

## 1. Product principles

- Two audiences use one product: **Operator** for the content and platform teams, and **Leadership** for read-only review.
- Every fixture-backed screen displays the exact persistent banner **“DEMO DATA, not real results”** directly below the global header. The same exact text appears in the header of every demo PDF and in the first row and metadata of every demo CSV. It is never shortened, hidden, dismissed, or replaced by color alone.
- “Charlotte” by itself means the city. The product uses “UNC Charlotte” or the confirmed institution name for the university.
- UI, API search, API parametric, SERP-provider, and manual series remain separate. Chat-engine and Google-surface indexes remain separate.
- Branded prompts remain a separate series. A model change is an annotation, not a silent continuation.
- Plain-language labels lead; technical definitions remain available through “How this is measured.”
- Unknown provider capability, price, model build, or region behavior is displayed as **unknown**, with the date and a link or instruction for verifying it.
- API tokens are deferred because the local pilot does not need them. Settings may show a disabled explanatory row, but Wave 0/1 does not add token management.

## 2. Production sitemap

The authenticated production shell has ten primary destinations. Onboarding is a focused flow under Site Audit rather than an eleventh primary destination.

1. **Overview** — `/overview`
2. **Campaigns** — `/campaigns`; campaign detail at `/campaigns/[campaignId]`
3. **Prompts** — `/campaigns/[campaignId]/prompts`
4. **Answer Explorer** — `/campaigns/[campaignId]/answers`
5. **Citations & Off-site** — `/campaigns/[campaignId]/citations`
6. **Gaps & Recommendations** — `/campaigns/[campaignId]/gaps`
7. **Strategy** — `/campaigns/[campaignId]/strategy`
8. **Site Audit** — `/sites`; onboarding at `/sites/new`, audit detail at `/sites/[siteId]/audit`
9. **Budget & Funding** — `/budget`
10. **Settings** — `/settings`

Unauthenticated routes are `/login` and the local session-expired return path. Exports are actions from their owning screens, not primary navigation destinations.

Existing `/`, `/analyze`, `/capture`, `/capture/test`, `/config`, `/demand`, `/recommend`, `/serpapi`, `/bots`, and `/settings/providers` experiences are removed from production navigation when replacements exist. If retained temporarily for migration or verification, each page begins with **“Legacy, not METRICS.md compliant”**, links to its replacement, and cannot be used in leadership exports. Unknown or newly discovered legacy routes follow the same rule.

## 3. Roles and permissions

“Operator” is a product audience, not a new database role. It comprises `admin` and `editor`; Leadership maps to `viewer`. Every API and job enforces organization scope and the underlying role. Hiding a button is not authorization.

| Capability | Operator — admin | Operator — editor | Leadership — viewer |
|---|---|---|---|
| View dashboards, answers, citations, audit, gaps, strategy, and budget | Yes | Yes | Yes |
| Export approved PDF or CSV | Yes | Yes | Yes |
| Create or edit campaigns, prompts, personas, and recommendations | Yes | Yes | No |
| Approve prompts and freeze a prompt set | Yes | Yes | No |
| Estimate a scan | Yes | Yes | No |
| Approve spend, run or retry a paid scan, or change caps | Yes | No | No |
| Start fixture-only scans | Yes | Yes | No |
| Publish or dismiss a recommendation | Yes | Yes | No |
| Configure providers and schedules | Yes | No | No |
| Manage users and roles | Yes | No | No |
| Acknowledge operational alerts | Yes | Yes | No |

Viewer controls are absent or clearly disabled with “Leadership access is read-only”; the UI does not invite an action that will fail. Exports include the viewer’s organization and the applied filters but never raw provider payloads or full cited-page text.

## 4. Application shell and context

### Global shell

```text
Skip to main content
┌──────────────────────────────────────────────────────────────────────┐
│ [Organization mark] GEO  [Organization ▾] [Campaign ▾]   [?] [User]│
├──────────────┬───────────────────────────────────────────────────────┤
│ Overview     │ [DEMO DATA, not real results — when demo org]        │
│ Campaigns    │ Breadcrumbs                         Page actions      │
│ Prompts      │ Page title and plain-language purpose                │
│ Answers      │ Date / scan / runner context                          │
│ Citations    │ Main content                                         │
│ Gaps         │                                                       │
│ Strategy     │                                                       │
│ Site Audit   │                                                       │
│ Budget       │                                                       │
│ Settings     │                                                       │
└──────────────┴───────────────────────────────────────────────────────┘
```

- The left navigation collapses to a labeled menu at narrow widths. It preserves keyboard order and does not rely on icons alone.
- The selected destination uses text, weight, and a visible indicator, not color alone.
- The user menu shows name, role in plain language, sign out, and session status.
- The page header owns exports, create actions, and “How this is measured”; global context does not move when data loads.

### Organization switcher

- Shows only organizations in the current user’s memberships, with the current role beside each.
- Switching clears campaign, scan, site, and filter context before fetching the destination organization.
- Demo University always carries a **Demo** tag; after switching to it, every screen gets the exact demo banner.
- A leadership user cannot discover organizations outside their memberships through search, URLs, exports, or error detail.

### Campaign switcher

- Appears on campaign-scoped destinations and shows active campaigns first, then draft and archived groups.
- Displays campaign name, topic, status, and organization. It never silently falls back to a campaign from another organization.
- “All campaigns” is allowed only where aggregation is defined, such as Overview. Metrics are not pooled across prompt-set versions, runners, or indexes.
- No campaign state offers “Create campaign” to viewers. Operators get a direct create action.
- Deep links restore campaign context if authorized; otherwise they show a scoped not-found state.

## 5. Personas and stable semantic mapping

The higher-education library exposes these 11 names exactly as the product taxonomy in `docs/SPEC.md`:

1. Prospective first year
2. Transfer
3. Grad applicant
4. International
5. Parent
6. Adult learner
7. Employer
8. Research partner
9. Donor
10. Journalist
11. Policymaker

A persona changes how a prompt is written; it does not reproduce a real person’s account history. This explanation appears in the persona picker and prompt review help.

The five existing content-team seeded records retain their current database IDs and stable `key` values. Wave 1 adds semantic presentation mapping; it does not delete, merge, re-key, or recreate them:

| Existing seeded key | Existing name | Library semantic presentation |
|---|---|---|
| `undergrad` | Undergraduate prospect | Prospective first year |
| `grad` | Graduate prospect | Grad applicant |
| `business_partner` | Business partner | Employer — partnership goal |
| `research_partner` | Research partner | Research partner |
| `business_leader` | Business leader (hiring interns) | Employer — hiring goal |

Legacy imported audience records also keep their IDs and `legacy_key`: `undergrad` → Prospective first year; `grad` → Grad applicant; `industry` → Employer or industry partner; `hel` → Higher ed leader; `government` → Government or policy staff. These migration labels remain available for historical data and are not presented as additional library personas.

## 6. Exact six end-to-end journeys

### Journey 1 — Onboard a site and see its audit

1. An Operator chooses Site Audit → Add site and enters the root URL.
2. The product discovers hosts from robots.txt, sitemaps, links, and certificate transparency, showing source and failures.
3. The Operator includes or excludes hosts, confirms the institution name and aliases, and reviews suggested entities and peers.
4. The product crawls politely, with progress by host and failed pages retained as evidence.
5. The completed audit opens, filtered by host and severity, with evidence strength and “why this matters.”

### Journey 2 — Import or generate, review, approve, and freeze prompts

1. An Operator selects a campaign and imports prompts or starts evidence-backed generation.
2. Demand source, persona, intent, funnel stage, branded status, and near-duplicate warnings appear in the review queue.
3. The Operator edits, approves, or rejects prompts and reviews persona variants.
4. The product summarizes approved core and persona counts; the Operator names and freezes the set.
5. The confirmation displays version, immutable hash, item count, date, and actor. Later edits create a new version.

### Journey 3 — Estimate, approve, run, and review a scan

1. An Operator chooses a frozen prompt set, engines, runners, regions, and draw count.
2. The estimator shows expected calls, known cost, unknown prices, caps, and the exact series that will be created.
3. An admin approves spend; fixture runs may be approved by an editor. No paid call starts before approval and the cost guard.
4. The scan runs with per-provider progress; errors become error observations and do not crash the batch.
5. Complete or partial results roll up, and the campaign dashboard opens with dates, denominators, intervals, runner, and fidelity.

### Journey 4 — Turn a lost prompt into a published recommendation

1. An Operator opens a prompt not won from Gaps.
2. The detail shows answer evidence, cited winners, fan-out rank evidence, and the closest owned page.
3. The Operator reviews a recommendation whose every item links to evidence and carries **“Correlation, not proven cause.”**
4. The Operator sets owner, lever type, target prompts, baseline scan, and status.
5. The recommendation moves to published; the next scan on the same prompt-set version reports lift or within noise against the pre-registered targets.

### Journey 5 — Generate a strategy report for a new topic

1. An Operator enters a topic, audience, region, seasonal date, and campaign.
2. The product shows connected and not-connected demand sources before generation.
3. The Operator reviews demand, sampled visibility, existing site supply, and evidence gaps.
4. The writer produces a prioritized plan with persona, prompt cluster, format, headline terms, FAQs, owner, and publish-by date.
5. The Operator saves the report; unsupported ideas are blocked rather than presented without evidence.

### Journey 6 — Leadership reviews and exports

1. A Leadership user signs in and lands on Overview for their organization.
2. They see plain-language campaign headlines, change labels, the three largest gaps, and current actions.
3. “How this is measured” explains answers checked, source, fidelity, sample size, interval, and date without requiring statistical jargon.
4. They open Budget & Funding, inspect pilot and steady-state estimates and verified dates, and cannot edit any value.
5. They export the one-page PDF. Demo exports display **“DEMO DATA, not real results”**; all exports preserve metric context and exclude raw/full text.

## 7. Text wireframes for all ten screens

Every wireframe inherits the global shell, switchers, demo banner rule, and page states in section 9.

### 1. Overview

```text
Overview                                      [Export PDF] [Export CSV]
What changed in AI answers about our campaigns
[Campaign: All ▾] [Date range ▾]

[Campaign card]
Energy
Prompts won: 41 of 100 (95% interval 32–51)
ChatGPT · UI provider · high fidelity · checked Nov 3, 2026
Change: within noise                         [How this is measured]

Three biggest opportunities        What we are doing
1. [plain-language gap]             [owner · status · due date]
2. ...

Alerts needing attention | Data quality and low-sample notes
```

Leadership copy:
- “Prompts won” means “UNC Charlotte appeared in most repeated answers for that prompt.”
- “Within noise” means “The measured change is not yet clear enough to call an improvement or decline.”
- “Too few answers checked” replaces an unexplained low-n badge.

### 2. Campaigns

```text
Campaigns                                                [New campaign]
[Search] [Status ▾] [Owner ▾]

Name        Topic        Status   Latest scan   Prompts won       Action
Energy      Energy       Active   Nov 3, 2026   41 of 100 (...)   [Open]

Campaign detail
[Dashboard] [Scans] [Regions] [Schedule]
Headline cards by engine and runner
Trend on same frozen set | Engine × persona heatmap
Region comparison | Share of voice within one index
Model event annotations | Open recommendations
```

Heatmap cells below 30 valid answers are greyed and say “Too few answers checked.” Different frozen prompt-set versions cannot be compared.

### 3. Prompts

```text
Prompts: Energy                               [Import] [Generate prompts]
[Review queue] [Approved] [Rejected] [Frozen sets]
[Persona ▾] [Intent ▾] [Branded ▾] [Evidence source ▾] [Search]

□ Prompt text
  Persona · intent · stage · branded/unbranded · provenance
  Demand evidence [open] · Near duplicate of [prompt]
  [Edit] [Approve] [Reject]

Approved: 84 core, 33 persona variants
[Freeze set] → label, item count, version, SHA-256, immutable warning
```

The freeze dialog says: “Freezing creates an immutable measurement set. Editing later creates a new version.”

### 4. Answer Explorer

```text
Answer Explorer
[Scan ▾] [Engine ▾] [Runner ▾] [Region ▾] [Persona ▾] [Prompt ▾]
[Mentioned: Any ▾] [View: single | 3 draws | runner comparison]

Prompt and capture date
[Engine] [Runner] [Fidelity] [Region honored] [Model build]

Escaped answer text with brand and competitor highlights

Citations in answer order       Claims and checks
1. URL · source class           Claim · supported/contradicted/unverifiable
   title / H1 / H2s             linked fact

Fan-out queries                 [Open immutable raw payload]
```

Highlights use labels and patterns in addition to color. Raw payload access is permission checked and never included in leadership export.

### 5. Citations & Off-site

```text
Citations & Off-site
[Scan ▾] [Engine ▾] [Runner ▾] [Date ▾]

Top cited domains                Source types
domain · citation count · n      owned/editorial/ranking/reference/gov/UGC

Our pages cited                  Prompts citing each page
URL · n · engines                [open prompt list]

Off-site mentions and sentiment (separate outcome series)
Us vs selected peers · source · date · n
```

Charts never combine chat and Google indexes or different runners. Sentiment points link to their supporting sentence.

### 6. Gaps & Recommendations

```text
Gaps & Recommendations
[Campaign ▾] [Scan ▾] [Engine ▾] [Runner ▾] [Persona ▾] [Status ▾]

Lost prompt | cited pages n | closest page | recommendation status

Gap detail
What cited winners share [evidence cohort and n]
Headline terms: term · cited n/N · owned n/N · lift
Content types · FAQs · freshness · sources
Closest owned page: URL · similarity / No matching page exists

Recommendation
[lever type] [owner] [evidence grade] “Correlation, not proven cause.”
Action items, each with [evidence rows]
Target prompts · baseline scan · prompt-set hash
[Open] → [In progress] → [Published] / [Dismissed]
```

Phase 7 computes or displays a cohort trait or term only when both the cited-winner cohort and the closest-owned-page cohort contain at least 10 unique cited or owned pages, respectively. Below that threshold it says “Not enough pages for a comparison.” Every term shows `n` for the cited cohort and `n` for the owned cohort, never only a percentage or lift. Every card uses the exact label **“Correlation, not proven cause.”**

### 7. Strategy

```text
Strategy                                      [New topic report]
[Topic] [Persona ▾] [Region ▾] [Seasonal event/date] [Continue]

Inputs and connection status
Demand | sampled AI answers | current site pages | gap evidence

Prioritized plan
Priority · audience · prompt cluster · format · evidence score
Headline terms · FAQs with sources · owner · publish by
[Open evidence] [Save report]
```

Unavailable connectors say “Not connected; this source was not used,” not zero. The recommendation writer is identified separately from the visibility judge.

### 8. Site Audit

```text
Site Audit                                                   [Add site]
[Site ▾] [Host ▾] [Severity ▾] [Evidence strength ▾]

Last crawl · pages checked · failed pages · identifying User-Agent
Crawl progress by host / completed summary

Finding                         Severity   Strength   Pages   Action
AI crawler access ...           High       Strong     12      [Review]

Finding detail
Why this matters | observed evidence | affected URLs | suggested owner
Entity consistency | Bot log summary | PageSpeed summary
```

Onboarding steps are Root URL → Discovered hosts → Confirm identity → Peers → Crawl → Audit. Discovery and crawl failures remain visible and retryable without deleting earlier evidence.

### 9. Budget & Funding

```text
Budget & Funding                                      [Export one-page PDF]
[Pilot estimate] [Steady-state estimate] [Spend and caps]

Pilot: campaign scope · prompts · engines · draws · regions
Known estimated cost $… | Unknown-price items … | verified date
Monthly steady state: core biweekly + persona cadence × 3 campaigns

Provider         Method      Price / unknown    Verified date   Source
Spend to date    Monthly cap Per-scan cap       Remaining

Vendor comparison (dated source material)
Stop-loss: error/blocked threshold | estimate-overrun threshold
```

All estimates come from the estimator, never hand-entered display values. Unknown cost is not treated as zero. Leadership sees “estimated provider cost” and “actual spend recorded,” with assumptions.

### 10. Settings

```text
Settings
[Providers] [Budgets] [Schedules] [Evaluation quality] [Users & roles]

Providers: connection state · supported method · last verified
API tokens: Deferred — the local pilot does not need them
Budgets: monthly and per-scan caps
Schedules: cadence · frozen set · next run · approval state
Evaluation quality: metric · agreement · n · target · last run
Users: name · email · Operator/Leadership · database role
```

Editors see read-only provider, budget, and user panels. Viewers see read-only settings needed to understand measurement, not secret fields.

## 8. Measurement and export contract

### Required context on every metric

Every rate on screen, in PDF, and in CSV includes:

- numerator and denominator `n`;
- a 95% interval, or an explicit “interval not defined for this metric” where `METRICS.md` defines none;
- engine and index;
- runner;
- fidelity;
- capture or scan date;
- prompt-set version and hash where the metric compares prompts;
- branded or unbranded series;
- region and whether it was honored where relevant;
- the count and reason for exclusions when available.

Position reports its eligible `n` but no invented interval. Consistency reports `n` prompts. Accuracy reports `n` claims and its 95% Wilson interval. Every change between scans carries “significant improvement,” “significant decline,” or “within noise”; scans from different prompt-set versions are not compared.

### Plain-language measurement panel

The panel answers:

1. **What was checked?** “100 prompts and 298 valid AI answers.”
2. **Where did the answers come from?** Engine, runner, provider, and whether search ran.
3. **How closely does this match the user experience?** High, medium, or low fidelity with a one-sentence explanation.
4. **How certain is the number?** The 95% interval and a low-sample warning.
5. **When and where was it checked?** Capture date, region, and region-honored status.
6. **What was left out?** Errors, blocked, experimental, unjudged, search-not-used, or superseded attempts.

Use “AI answers checked” for draw count, “source used to collect the answer” for runner, and “how closely this method matches what a person sees” for fidelity.

### Export policy

- PDF and CSV reproduce active organization, campaign, scan, filters, generated date, timezone, and all required metric context.
- Demo exports carry the exact text **“DEMO DATA, not real results”** on every PDF page and in the first CSV row plus file metadata.
- Exports do not pool runners, indexes, branded status, prompt-set versions, or incompatible regions.
- Exports may contain answer excerpts, citation URLs, page title/H1/H2, derived page traits, and evidence-row IDs.
- Exports never contain provider raw payloads, credentials, session data, or the full text of crawled or cited pages.

## 9. Auth and data states

These patterns apply to every screen and preserve the global shell so users know where they are.

### Authentication and authorization

- **Signed out:** local email login, privacy note, and return destination. No application data is rendered before authorization.
- **Session expired:** “Your local session expired. Sign in again to continue.” Unsaved local form content may be restored only after the same user and organization are confirmed.
- **Forbidden:** “You do not have access to this organization or action.” Do not reveal whether a hidden resource exists.
- **Read-only:** leadership explanation appears near disabled editing areas; no mutation is attempted.

### Loading

- Render title, filters, and stable skeletons; announce loading with `aria-live="polite"`.
- Keep prior filtered data visible only when clearly marked “Updating.”
- Long jobs show completed/total work, current stage, start time, and a safe leave-page message. Do not invent percent completion when only stages are known.

### Empty

- **No organization data:** explain the first permitted action.
- **No campaign/site/scan:** link an Operator to create or onboard; tell Leadership that an Operator must prepare data.
- **No results for filters:** offer “Clear filters” without implying that collection failed.
- **Not connected:** name the unused source and the effect; never render zero.

### Error

- Give a plain-language summary, a stable incident/reference ID, last successful data date, and a safe retry when one exists.
- A failed provider call appears as an error observation. It does not remove successful observations or crash the batch.
- Never loop paid retries. “Retry failed answers” first returns to estimate and approval.
- Avoid exposing secrets, raw provider errors, filesystem paths, or data from another organization.

### Partial

- Use **Partial results** when some hosts, providers, draws, cited pages, or metrics failed.
- State completed `n`, expected `n`, failed/blocked `n`, affected series, and whether the displayed metric is provisional.
- Complete series remain usable; missing series are not estimated or silently filled.
- Exports repeat the partial label and failure counts.

### Screen-specific state requirements

| Screen | Empty | Error or partial |
|---|---|---|
| Overview | No completed scans; Operator link to campaign, Leadership explanation | Keep latest successful cards and date; isolate failed campaign cards |
| Campaigns | Create first campaign | A failed latest scan does not hide campaign history |
| Prompts | Import or generate prompts | Show rejected rows and import line errors separately; freeze remains blocked until valid |
| Answer Explorer | No valid answer for filters | Show error/blocked observations without fabricated answer text |
| Citations & Off-site | No citations captured / connector not connected | Show fetched, failed, robots-blocked, and pending counts |
| Gaps & Recommendations | No eligible lost prompts | “Not enough pages for a comparison” when either cohort has fewer than 10 pages |
| Strategy | No saved reports | List missing inputs; do not generate unsupported ideas |
| Site Audit | Add a site | Preserve completed hosts and list failed pages/hosts |
| Budget & Funding | No approved estimate or spend | Unknown prices remain unknown and are itemized |
| Settings | No providers/schedules/users beyond current user | Each connector or evaluation reports its own failure and last success |

## 10. Cited-page collection and evidence honesty

- Fetch cited pages with robots.txt respect, SSRF protection, redirect and body-size limits, polite per-host pacing, and an identifying User-Agent that includes a maintained contact URL. If contact configuration is missing, collection does not start.
- Fetch each new canonical URL once into `cited_pages`; failures and robots blocks are evidence states, not absent pages.
- Store page text only in the content-addressed local raw store on the pilot Mac. Treat it as untrusted data, never model instructions.
- Show and export only the minimum evidence needed: URL, status, dates, title, H1, H2s, word count, content type, schema/FAQ indicators, source class, derived terms, and evidence IDs.
- Never offer a full-text cited-page export. Never place full cited-page text in PDF or CSV. Authorized Operators may inspect a bounded escaped excerpt in the local UI when needed to validate evidence.
- Phase 7 comparisons require at least 10 unique pages in each cohort, report `n` per cohort and `n` for every term, and display **“Correlation, not proven cause.”** Associations do not become causal claims.

## 11. Brand and visual design

- Official primary green is `#005035`.
- Official gold is `#A49665`.
- Source: [UNC Charlotte official color palette](https://brand.charlotte.edu/visual-identity/color-palette/).
- Typography decisions must be checked against [UNC Charlotte official typography guidance](https://brand.charlotte.edu/visual-identity/typography/).
- The current application fonts are not claimed to be official UNC Charlotte fonts. Wave 1 uses accessible system fallbacks until approved font assets, licensing, loading behavior, and current brand guidance are verified.
- Organization theming is configuration, not UNC Charlotte hardcoding in shared components.
- Green and gold are brand accents, not the sole signal for status, comparison, highlighting, or focus.

## 12. Accessibility and quality targets

The product targets WCAG 2.2 AA for every production screen and export workflow.

- Full keyboard operation, visible focus, logical focus order, skip link, and no keyboard trap.
- Focus is not obscured by sticky shell elements; target sizes meet WCAG 2.2 requirements.
- Semantic landmarks, one descriptive `h1`, ordered headings, labeled controls, field-level errors, and status announcements.
- Text and meaningful graphics meet AA contrast; chart series use labels, shapes/patterns, and downloadable data, not color alone.
- Data tables have captions and associated headers. Heatmaps expose the same values and low-sample state in an accessible table.
- Answer highlights identify brand/competitor in text and assistive labels, not color alone.
- Motion respects `prefers-reduced-motion`; loading skeletons do not pulse indefinitely.
- Zoom to 200% and reflow at 320 CSS pixels without loss of content or two-dimensional scrolling except true data tables.
- Touch and pointer actions have keyboard equivalents; help is consistently located.
- PDFs are tagged with title, language, heading order, reading order, table headers, link text, and alt text.

Lighthouse accessibility targets:

- **Overview, Campaign dashboard, and Budget & Funding:** score at least 95 in the production-like automated gate.
- **Every other production screen:** score at least 90, with no known WCAG 2.2 A or AA blocker.
- Automated scores do not replace keyboard, screen-reader, zoom/reflow, contrast, and tagged-PDF checks.

## 13. Wave 1 acceptance contract

- The shell, navigation, organization switcher, campaign switcher, role-aware actions, auth states, and exact demo banner are implemented before later screen work depends on them.
- All ten destinations have stable route contracts and loading, empty, error, partial, and forbidden placeholders.
- The demo banner component is shared by HTML, PDF, and CSV exporters and is covered by automated tests.
- Metric presentation accepts `n`, interval, runner, fidelity, date, engine/index, and series dimensions as required fields; consumers cannot omit them accidentally.
- Legacy destinations are absent from production navigation and carry **“Legacy, not METRICS.md compliant”** if still directly reachable.
- Organization and campaign changes clear incompatible context and never leak cached data across organizations.
- No Wave 1 control stores or requests API tokens; the local-pilot deferral is explicit.
