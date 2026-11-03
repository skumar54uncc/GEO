# Phase 4 prompt: Personas and prompt generation

Paste `docs/prompts/MASTER_CONTEXT.md`, then this file. Fresh chat, plan mode. Phases 3, 5, and 6 must be merged.

Goal: prompts that sound like real people asking AI about a campaign topic, backed by demand evidence, reviewed by a human before anything runs.

## Build

1. **Persona library** (org_id null): prospective first year student, transfer student, grad applicant, international student, parent, adult learner, employer, research partner, donor, journalist, policymaker. Each with goal, background, region, vocabulary level, typical questions. Custom personas per org. Screen copy: "A persona changes how the prompt is written, not who is logged in."
2. **Demand first** (`demand.fetch`), stored in `demand_signals` with raw payloads, all through the cost guard:
   - Google Trends: official Trends API if access exists, else SerpAPI Trends engine. Never scraped. Interest over time, by region, related and rising queries.
   - Keyword volume: Keyword Planner or DataForSEO, labeled with the source and whether it is a range or modeled.
   - PAA, autocomplete, related searches from SERP data.
   - Search Console queries (`connectors.sync`, needs property access).
   - Exa: how the topic is discussed on the web, with Reddit and forum questions.
3. **Seasonality calendar.** `seasonal_events` seeded with admissions, aid, orientation, term start, and commencement dates (the user confirms; source URL required).
4. **Generator** (`prompts.generate`). Per persona and intent (discovery, comparison, evaluation, decision), conversational long form prompts like real AI questions, not keyword strings. Each prompt tagged with persona, intent, funnel stage, branded, provenance (paa, web_query, fanout, synthesized, custom), and the demand evidence ids behind it. Demand text is passed to the model as delimited data.
5. **Dedupe** with embeddings (cosine threshold configurable), and against prompts already in the campaign.
6. **Review queue.** Approve, edit, reject, bulk actions, filter by persona, intent, branded, provenance. Add custom prompts. Shows the evidence behind each prompt. Live counter of branded share; warns under 70% unbranded. Only approved prompts can be frozen.

## Tests

Demand adapters on fixtures. Provenance and evidence present on every generated prompt. Dedupe threshold on fixture pairs. Branded detection uses aliases (and "Charlotte" alone is not branded for the university). Freeze refuses unapproved prompts.

## Do not

Present any demand number as "AI search volume". Run unapproved prompts. Let the generator approve or judge.

## Verification gate

1. Typecheck, lint, tests pass.
2. Generate prompts for a new campaign (for example "AI and Data Science"): paste counts by persona, intent, branded share, and provenance, plus 10 sample prompts with their evidence.
3. Review, freeze, and confirm the frozen set hash.
4. Existing pages still load.
