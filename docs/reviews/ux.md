# Wave 4 — Reviewer 3: UX and accessibility

**Scope:** Report only (no product code changes). Sources: `docs/UX.md`, `docs/PERSONAS.md`, `docs/prompts/WAVE_4.md` (Reviewer 3), `lib/ui/labels.ts`, shell and primary screens, `docs/phase9-screenshots/lighthouse-report.json`, and Lighthouse script `scripts/phase9-lighthouse.ts`.

---

## Lighthouse automation (feasibility and results)

**What ran in-repo:** `scripts/phase9-lighthouse.ts` writes `docs/phase9-screenshots/lighthouse-report.json` after a production build, authenticated Playwright load, and Lighthouse CLI (`--only-categories=accessibility,performance`, desktop preset). This reviewer did **not** re-run Lighthouse in this session; findings below use the **committed report** and code review.

**Recorded scores (`docs/phase9-screenshots/lighthouse-report.json`, generated `2026-11-06`):** accessibility **100** and performance **100** for **UNC Charlotte** and **Demo** orgs on **Overview** (`/`), **Campaign dashboard** (`/campaigns/.../dashboard`), and **Budget** (`/budget`). The filtered audit list in the report is **empty** (no failing a11y audits in those runs).

**Gap vs WAVE_4.md:** Reviewer 3 asks for Lighthouse in **both themes** on **all ten** primary screens. The script covers **three** URLs × **two** orgs only and does not vary theme. **Residual risk:** other destinations (Prompts, Answers, Citations, Gaps, Strategy, Site audit, Settings) and an alternate theme are **unverified** by the stored artifact; keyboard/screen-reader issues can still exist where automated audits score well.

---

## 1. Six leadership/operator journeys (conceptual + copy/code)

Cross-audience themes: navigation labels sometimes **diverge from the UX sitemap** (“Visibility” vs Campaign dashboard; “Answers” vs Answer Explorer). Leadership relies on the same shell; several controls look actionable but do nothing (see high-severity findings).

| Journey | Intended flow (docs/UX.md §6) | What the UI suggests in code/copy | Confusion / dead ends / jargon |
|--------|-------------------------------|-----------------------------------|--------------------------------|
| **1 — Onboard site, see audit** | Site Audit → Add site → … → audit | AppShell **Site audit** → `/sites` → **redirects** to `/audit` (`app/sites/page.tsx`). UX contract lists `/sites`, onboarding `/sites/new`. | **Route mismatch:** operators following the spec land on a redirect, not a dedicated `/sites` hub or `/sites/new` onboarding URL. Crawl/progress copy not reviewed line-by-line here; audit UI shows technical `rule_id` / snake_case in places (see Audit finding below). |
| **2 — Import/generate, review, freeze prompts** | Review queue, approve, freeze with immutable hash | `app/campaigns/[id]/prompts/page.tsx`: strong operator copy; table shows **`persona_key`** raw (e.g. `undergrad`), **QID**, filters with `true/false` placeholders. Subtitle uses an **em dash**. | **Jargon:** database persona keys and provenance columns read as internal schema. **Leadership** sees read-only messaging (good). Freeze/version/hash UI not validated in this pass beyond prompts list. |
| **3 — Estimate, approve, run, review scan** | Estimator → approval → run → dashboard | Campaign **Visibility** → `dashboard`. Empty state points to freeze + run scan. No top-level nav item named “Scans” or “Run scan” in `AppShell`. | **Discoverability:** scan/estimate flow is not mirrored as a primary nav destination; operators may rely on campaign context or deep links. Partial scan messaging on Overview is clear (`PartialDataNotice`). |
| **4 — Lost prompt → published recommendation** | Gaps, evidence, correlation disclaimer | `gaps/page.tsx`: subtitle states **correlation, not proven cause** (aligned). Cards use human `leverLabel` when present. | Lower risk on this page; detail routes not exhaustively reviewed. |
| **5 — Strategy report** | Topic inputs, connectors, scored plan | `strategy/page.tsx`: `item.leverType` shown as a **Badge** raw; factors label “demand”, “gap”, “effort”; **FAFSA** and calendar copy. | **Raw lever types** (e.g. `on_page`) may appear if API returns keys. Acronyms (**FAFSA**) appear without expansion on first use. |
| **6 — Leadership review and export** | Overview headlines, Budget, PDF | Overview KPIs + `HowMeasured`; Budget **Export one-page PDF**; demo banner via `DemoBanner`. | Budget vendor note references **COMPETITOR_MATRIX** / **PROVIDER** doc ids (internal). Shell **Alerts** / **Download** non-functional (high). |

---

## 2. UI copy scan: raw keys, snake_case, em dashes, acronyms

### Raw / snake_case exposed to users

| Severity | Location | Issue |
|----------|----------|--------|
| **High** | `app/campaigns/[id]/prompts/page.tsx` (Persona column ~L309) | Table shows **`persona_key`** values (e.g. `first_year_in_state`) instead of **`personaTaxonomyLabel`** from `lib/ui/labels.ts`. Conflicts with comment in `labels.ts`: leadership-facing surfaces should not surface raw keys. |
| **Medium** | `components/HowMeasured.tsx` (~L44–L47) | Expanded panel prints **`(technical id: {runner})`** — exposes `ui_provider`, `api_search`, etc. Spec says technical definitions stay in this panel; still a **raw key** on-screen and may confuse Leadership. |
| **Medium** | `app/campaigns/[id]/citations/page.tsx` (~L114–L115, ~L149–150) | **PartialDataNotice** shows **`Index: chat`** or **`google`** without plain-language expansion. **Source types** list uses **`font-mono`** **`sourceClass`** raw tokens. |
| **Medium** | `app/campaigns/[id]/strategy/page.tsx` (~L150) | **`leverType`** rendered in a Badge — often a raw contract key (e.g. `on_page`). |
| **Low** | `app/page.tsx` (Overview alerts ~L728–739) | Alert **kind** is shown with underscores replaced by spaces; kinds may still read as internal codes. |
| **Low** | `app/audit/page.tsx` (`DetailList` ~L44–48) | Finding **detail** renders **snake_case** keys as labels for operators debugging; acceptable for technical audit but dense. |

### Em dashes (—) in user-visible copy

Examples (UX spec discourages em dash overuse in some org style guides; flag for consistency):

- `app/settings/page.tsx` — Settings subtitle uses em dash.
- `app/campaigns/[id]/prompts/page.tsx` — Page subtitle uses em dash after “Prompt review”.
- `app/page.tsx` — em dash in **Activity** tile when citation count displays **"—"** as placeholder (~L723).

### Unexplained or heavy acronyms

- **Budget:** “DataForSEO” is vendor-specific (may be fine with context). References **COMPETITOR_MATRIX §5** and **PROVIDERS.md** — **internal doc identifiers** on a leadership-facing page (`app/budget/page.tsx` ~L242–244).
- **Strategy:** **FAFSA** and other calendar terms without glossary (`app/campaigns/[id]/strategy/page.tsx` ~L136–137).
- **Citations:** **Index: chat / google** without spelling out “chat-engine index vs Google AI surfaces” inline (see above).

---

## 3. Accessibility and responsive behavior (AppShell, Overview, Budget)

### Keyboard and focus

| Severity | Location | Issue | Reproduce | Fix (for implementers) |
|----------|----------|--------|-----------|-------------------------|
| **High** | `components/AppShell.tsx` (~L527–546) | **Alerts** and **Download** header controls are `<button>` elements with **no navigation or click handler** — keyboard users activate controls that perform **no action** (dead end). | Tab to Alerts/Download in header after login; activate with Enter/Space. | Wire to real flows, or use `disabled` + explanation, or remove until implemented. |
| **Medium** | `components/AppShell.tsx` (~L319–323) | When sidebar is **icon rail**, an **extra** `sr-only` “Expand sidebar” control sits beside the visible expand control — may duplicate focus stops for screen-reader users. | Collapse rail (viewport &lt; 1280px), Tab through sidebar header. | Keep one focusable expand control; ensure single concise name. |
| **Medium** | `app/page.tsx` — Overview “Questions” `<table>` (~L610+) | Table has `<thead>` but **no `<caption>`** (unlike Budget/Settings tables that use `sr-only` captions). | Inspect Overview with screen reader: table may be announced without purpose. | Add visually hidden or visible caption. |
| **Low** | `components/AppShell.tsx` | **/** focus shortcut focuses search (`scout-search`); when sidebar collapsed to icons, search is **not in the DOM** (`!iconRail` guard) — shortcut may appear broken in that layout. | At &lt;1280px with icon rail, press `/`. | When search is hidden, move focus to expand control or show in-header search on narrow layouts. |

### Screen reader and semantics

- **Overview** exposes a **screen-reader-only** “Engine rates table” (`app/page.tsx` ~L755–782) duplicating KPI data — positive pattern for chart/card regions.
- **Budget** tables use **`caption className="sr-only"`** — good.
- **HowMeasured** toggle: `aria-expanded` / `aria-controls` — good.
- **Alert row “open”** (`app/page.tsx` ~L742–745): status text is static “open” with a color dot — may not reflect real alert status if data is stubbed.

### Reduced motion

- `app/globals.css`: **`prefers-reduced-motion`** disables skeleton shimmer and scout-rise/hover transitions — good.
- `components/scout/primitives.tsx`: **Framer Motion** uses **`useReducedMotion()`** for `ScoutCard`, `Segmented`, `CountUp` — good alignment with spec.

### Tablet / narrow desktop (1024–1279px)

- `AppShell`: below **1024px** sidebar is **drawer**; below **1280px** rail becomes **icon-only**. Campaign-scoped links still point to `/campaigns` when no campaign is selected — possible extra navigation steps.
- Horizontal **scroll** on Overview **Questions** table (`overflow-x-auto`) — expected for data tables; verify **reflow** at 320px per spec (not fully exercised here).

---

## 4. Empty, loading, partial, and error states (main screens)

| Screen | Loading | Empty | Error | Partial | Notes |
|--------|---------|-------|-------|---------|-------|
| **Overview** (`app/page.tsx`) | `LoadingState` | No campaigns; no judged answers for surface | `ErrorState` | `PartialDataNotice` for unjudged / in-progress | Solid coverage. |
| **Budget** (`app/budget/page.tsx`) | `LoadingState` | Pilot prompts = 0 (`EmptyState`) | `ErrorState` | Cap warnings (`role="status"`) | Good. Vendor comparison imports **internal doc** labels. |
| **AppShell** (`components/AppShell.tsx`) | Full-page “Loading your organization…” | N/A | Fetch failures throw; may show generic error path | Budget fetch fail → spend bars empty (silent) | **Low:** failed `/api/budget` in shell leaves account card without spend bars; no user-facing error. |
| **Citations** | `LoadingState` | No citations for selection | `ErrorState` | Partial notice always when data | Partial notice always shows even when complete — slightly noisy. |
| **Prompts** | `LoadingState` | No prompts for filters | `ErrorState` (can show alongside table after load) | Dedupe / unbranded warnings | Error can persist in banner when table repopulates — acceptable. |
| **Gaps** | `LoadingState` | No recommendations | `ErrorState` | N/A | OK. |
| **Strategy** | `LoadingState` | No reports | `ErrorState` | Unscored list | OK. |
| **Settings** | `LoadingState` | Empty provider list | `ErrorState` | N/A | Link to **`/settings/providers`** may conflict with “legacy” routing rules in `docs/UX.md` — verify navigation policy. |

---

## 5. Consolidated findings (severity · file · line · reproduce · fix)

1. **High — Non-functional header actions** — `components/AppShell.tsx` ~L527–546 — After login, focus **Alerts** and **Download** and activate; nothing happens. — Implement behavior, disable with explanation, or remove.

2. **High — Persona keys in Prompts table** — `app/campaigns/[id]/prompts/page.tsx` ~L309 (Persona column) — Open Prompts for a campaign with persona prompts; column shows **`first_year_in_state`**-style keys. — Map through `personaTaxonomyLabel()` / group labels per `docs/PERSONAS.md`.

3. **Medium — Raw runner id in disclosure** — `components/HowMeasured.tsx` ~L44–47 — Open “How this is measured” on any screen using it. — Consider moving technical ids to a “Developer details” sub-panel or show only on editor/admin role.

4. **Medium — Citations: index and sourceClass jargon** — `app/campaigns/[id]/citations/page.tsx` ~L114–116, ~L149–150 — Select any engine with data; notice “Index: chat” and monospace source classes. — Use plain language for index; map `sourceClass` to labels.

5. **Medium — Strategy: raw `leverType`** — `app/campaigns/[id]/strategy/page.tsx` ~L150 — Open Strategy with a report whose items include raw lever keys. — Reuse gaps lever label helper (`lib/gaps/display.ts` pattern).

6. **Medium — Budget: internal doc references** — `app/budget/page.tsx` ~L242–244 — Open Budget → Vendor comparison. — Replace **COMPETITOR_MATRIX** / **PROVIDERS.md** with user-facing “how we verified prices” copy and external links only.

7. **Medium — Overview Questions table lacks caption** — `app/page.tsx` ~L610+ — Screen reader traverses table. — Add `<caption className="sr-only">…</caption>`.

8. **Medium — Site audit route vs UX sitemap** — `app/sites/page.tsx` (redirect), `components/AppShell.tsx` `/sites` — Click **Site audit** expecting `/sites` hub per `docs/UX.md` §2. — Align routes with spec or add copy explaining redirect to `/audit`.

9. **Low — Em dashes in prominent subtitles** — `app/settings/page.tsx` ~68; `app/campaigns/[id]/prompts/page.tsx` ~170 — Visual copy audit. — Standardize on en dash, colon, or parentheses per editorial rules.

10. **Low — Shell budget fetch fails silently** — `components/AppShell.tsx` ~L159–175 — Simulate `/api/budget` failure; sidebar spend bars disappear without message. — Optional lightweight error or “Spend unavailable”.

11. **Low — `/` search shortcut when rail collapsed** — `components/AppShell.tsx` ~L182–187, ~L327–340 — Narrow viewport, icon rail, press `/`. — Focus management fallback.

12. **Low — Overview Activity em dash placeholder** — `app/page.tsx` ~L723 — When approximate citations are falsy, shows **—**. — Prefer “unknown” or “0” with explanation per product voice.

---

## 6. Positive observations (brief)

- **Labels module** (`lib/ui/labels.ts`) defines **plain-language** maps for runners, fidelity, and engines; **Citations** dropdowns use `runnerPlain`/`enginePlain` appropriately.
- **Reduced-motion** handling is implemented in both **CSS** and **Framer** usages for core primitives.
- **Skip link** (`AppShell` ~L446–448) and **landmark** `main id="main-content"` support skip navigation.
- **Committed Lighthouse** accessibility scores for Overview/Dashboard/Budget are **100** in the recorded run (with scope limits noted above).

---

*End of Reviewer 3 report.*
