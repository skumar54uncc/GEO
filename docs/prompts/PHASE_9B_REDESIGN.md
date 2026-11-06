# Phase 9B: Scout redesign

Files in this bundle:
- `inputs/design/scout-overview-v2.png`: the target design. **Match it.**
- `inputs/design/scout-overview-v2.html`: the same design as code. Use it as the spec for exact colors, spacing, radii and type.
- `inputs/design/reference-dashboard.png`: the original inspiration. Layout only.
- `public/brand/`: the Scout logo set (binoculars).

`inputs/` is gitignored. Never commit it.

Paste everything below the line into a fresh Cursor chat in plan mode, using your strongest model.

---

Read `.cursor/rules/geo.mdc`, `docs/SPEC.md`, `docs/UX.md`, `docs/METRICS.md`, `docs/PERSONAS.md` and `lib/ui/labels.ts`. Then open `inputs/design/scout-overview-v2.png` and read `inputs/design/scout-overview-v2.html` in full.

**Goal:** rebrand as **Scout** ("Scouting what AI says about us") and rebuild the app shell and every screen to match the v2 design: its layout, colors, spacing, icons and polish, with purposeful animation.

**Hard rules:**
- The UI computes nothing new. Every number comes from `lib/metrics/` and the existing APIs. The mockup numbers are illustrative only.
- Keep every existing honesty element: n, intervals, runner and fidelity labels, low-n rules, the DEMO banner, legacy labels, HowMeasured panels and RBAC.
- All existing tests keep passing.
- Do not copy anything from the reference screenshot's brand (name, logo, icons, text). It's layout inspiration only.

## 1. Design system (from the v2 HTML)

**Palette.** The base is neutral white and gray. Charlotte Green is an accent, not the main color.

| Token | Value | Use |
|---|---|---|
| `--bg-app` | #E9EEF3 | Outside the window |
| `--bg-page` | #FAFBFC | Main content area |
| `--bg-card` | #FFFFFF | Cards, header |
| `--bg-sidebar` | gradient #FFFFFF to #F8F4F1 | Sidebar |
| `--border` | #EEF0F3 | Card and table borders |
| `--border-input` | #E5E7EB | Inputs, buttons |
| `--text` | #111827 | Primary text |
| `--text-muted` | #6B7280 | Secondary text |
| `--chart` | #3B82F6, gradient fill #93B8FB to #DCE8FE | Chart bars and lines |
| `--brand` | #005035 (Charlotte Green) | Logo, active nav icon, "That's us" rows, focus ring |
| `--brand-accent` | #A49665 (Niner Gold) | Logo only, and decorative graphics. **Never text** |
| `--ink-button` | #111827 | Dark buttons (Open budget), selected engine chip |

**KPI icon tiles** (tile background and icon color):
- blue #EAF1FF / #2F6BFF
- green #EAF7EE / #1E9E57
- amber #FFF6E5 / #E09500
- purple #F3ECFF / #8B5CF6

**Intent pills:**
- Comparison: blue #EAF1FF / #2F5FD0
- Discovery: green #EAF7EE / #16804A
- Evaluation: amber #FFF6E5 / #A16207
- Decision: purple #F3ECFF / #6D3FC7

**Status badges** are always icon plus text:
- Significant gain: #EAF7EE / #16804A with an up chevron
- Within noise: #F3F4F6 / #4B5563 with ≈
- Needs review or decline: #FDECEC / #B42318
- Alert dots: green #1E9E57, red #E5484D, amber #F0A500

**Shape and type:**
- Card radius 16px, inputs and buttons 10 to 11px, pills 999px.
- Shadows are very soft (`0 1px 2px rgba(15,23,42,.03)`). The window shadow is `0 20px 50px rgba(15,23,42,.10)`.
- Font: Inter, with tabular-nums on all numbers.
- Sizes: page title 22px/700, card titles 17px/600, KPI values 27px/700, body 13.5 to 14px, captions 11.5 to 12.5px.
- Spacing on an 8px rhythm, 14px gaps between cards, 26px page gutters.

**Icons:** use `lucide-react` only, at a 1.8 stroke and 18 to 20px in the nav. Match the mockup: House, BarChart3, MessageSquare, List, Users, Link, ShieldCheck, Lightbulb, Globe, Wallet, SlidersHorizontal, CircleHelp, Bell, Calendar, Download, Layers, Trophy, FileText, PieChart, ShieldAlert, PanelLeft, Search, Info, ChevronDown and Sparkles. No emojis anywhere.

Put every value in `globals.css` and the tailwind config as tokens, with no raw hex in components. Define dark tokens that pass contrast, but light stays the default.

## 2. Brand
- Sidebar header: the binoculars mark with "Scout" in brand green and the tagline in muted text below it, as in the mockup. Logo files are in `public/brand/`.
- Login page and PDF exports: `logo.svg`.
- Favicon: `favicon.svg`.
- Page titles: "<Page> · Scout".
- Update the README and UX.md.

## 3. App shell (exactly as the mockup)
**Sidebar (270px):**
- The collapse button.
- A search box with the "/" shortcut. It searches prompts, answers and recommendations.
- Nav groups:
  - **Insight & performance:** Overview, Visibility, Answers, Prompts, Competitors
  - **Content intelligence:** Citations, Gaps & recommendations, Strategy, Site audit
  - **Settings:** Budget, Settings, How we measure
- The active item gets a gray pill (#F1F2F4) with its icon in brand green. Only one item is active at a time.
- The bottom account card shows the org mark, org name and role, plus spend-versus-cap bars per active provider (DataForSEO in amber, judge in blue) with exact dollars, and a dark "Open budget" button.
- Below 1280px it collapses to icons. Below 1024px it becomes a drawer.

**Header:**
- A greeting with the first name, and the subtitle "Here is what AI said about <org> in the latest scan".
- On the right: the campaign switcher (Layers icon), the alerts bell with a red dot, a scan selector (Calendar icon, scans on the same prompt set only), and a download button.

The DEMO banner sits directly under the header for demo orgs, at full width.

## 4. Overview (match v2 exactly; data from the APIs)
1. **Engine chips.** The selected chip is dark ink. Next to them is the collection-method label for the selected engine. The KPIs are per engine and runner, never blended.
2. **Four KPI cards:** Prompts won, Citation rate, Share of voice and Accuracy issues.
   - Each has its colored tile, the value, a range and n line, and a status badge.
   - **A green up badge appears only when McNemar is significant.** Otherwise show "≈ within noise". No green or red arrows for noise. No blended "visibility index".
   - A cell under the n threshold shows "Too few answers (n=…)".
3. **"AI search visibility" chart:**
   - Gradient columns per scan for the selected engine, with a 3px top line and a 95% range whisker on each column.
   - Model event flags in amber.
   - A "Latest scan" box at the top right.
   - Footer: the legend with n, and the prompt set hash pill.
   - Tabs or a toggle between chat engines and Google surfaces, plus a table view for accessibility.
4. **"Top engine by prompts won":**
   - The best engine's "x of n" in large type.
   - A gradient track from 0 to n, with the handle at x and the 95% range shown as an outlined segment.
   - Below it, "Most mentioned institutions" (share of voice within the index) with initial-avatar tiles. Our row is in brand green and says "That's us".
5. **Questions table:**
   - Segmented tabs: All, Lost, Won.
   - Filters: search, audience and intent.
   - Columns: Question (with the audience below it in muted text and a Users icon), Named by (signal bars plus "k of 6 engines"), Last scan, and Intent pill.
   - The signal bars have 3 levels with color and fill, plus text, so color is never the only signal.
   - Branded and location-biased prompts are hidden by default, with a labeled toggle.
   - A row opens Answer Explorer. Virtualize at 50+ rows.
6. **Activity panel:**
   - Three stat tiles with round colored icons: AI answers checked, engines tracked, citations found. Each links to its page.
   - "Recent alerts" with colored dots and relative times: significant change, lost cluster, budget 80% or 100%, stalled scan, error rate.

Leadership (viewer) gets the same view, read-only.

## 5. Every other screen
Restyle all screens to the same system:
- Visibility (campaign dashboard)
- Answers
- Prompts
- Competitors
- Citations
- Gaps & recommendations
- Strategy
- Site audit
- Budget
- Settings
- How we measure
- Login and onboarding

Use the same cards, table header style (gray rounded header row), pills, badges, filters, segmented tabs and empty, loading and error states. Keep every existing data rule and label.

## 6. Motion
Use `motion` (Framer Motion) or CSS. Animate only transform and opacity.
- Cards enter with an 8px rise and fade over 450ms, using a soft ease-out curve, staggered 50ms.
- Chart columns grow from the baseline over 500ms, staggered 60ms. Whiskers fade in after them.
- KPI numbers count up once on first load (600ms). Switching scan or engine crossfades the values over 200ms.
- Hovered cards lift 2px with a slightly stronger shadow over 150ms. Hovered rows get a subtle background change.
- Segmented tabs and engine chips get a sliding active indicator (layout animation) and 150ms press feedback.
- Skeletons on every async block. Sidebar collapse is a 200ms transform.
- No looping animation.
- `prefers-reduced-motion` turns everything off and shows final states instantly. Test it.

## 7. Acceptance
- [ ] Overview at 1440px matches `scout-overview-v2.png` side by side (layout, colors, spacing, icons). Include a screenshot comparison.
- [ ] Works at 1024px and 768px. No horizontal page scroll.
- [ ] No raw hex in components (lint or test). Gold is never used as text.
- [ ] No number is computed outside `lib/metrics` (test). No blended score. No positive delta styling without significance (test with a within-noise fixture).
- [ ] Lighthouse accessibility at least 95 and performance at least 90 on Overview, Visibility and Budget, in both orgs.
- [ ] Keyboard-only run of the 6 journeys passes, with a visible brand-green focus ring.
- [ ] Reduced-motion test passes.
- [ ] Full suite, typecheck, lint, Playwright and CI are all green. Nothing under `inputs/` is committed.

Report with screenshots (gitignored): Overview for both orgs, Visibility, Answers, Gaps, Budget, Overview at tablet width, and Overview in dark mode. Then stop. Do not start Wave 4.
