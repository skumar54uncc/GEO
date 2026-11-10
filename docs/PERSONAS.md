# Personas

A persona is **who is asking**. What they want (hiring versus partnering, cost versus research) already comes from the question and the campaign pillar. Personas change prompt wording; they do not reproduce a real person’s account history.

## Structure

| Layer | Purpose |
|---|---|
| **Persona group** (7) | Dashboard and report rows. Enough answers to mean something. |
| **Persona** (20 menu + 2 retained general) | Prompt voice and openings. Campaigns pick a subset. |

Dashboards report by **persona group** by default. A **specific persona** appears as its own row only when that cell has **30 or more** valid draws. Ten prompts per persona (±18 points) is too noisy for a dashboard row.

## Rules

1. **Openings never name the brand or any alias** (including UNC Charlotte, UNCC, Charlotte as the university). That would tilt the model and inflate the score. “North Carolina” is fine.
2. **Each campaign picks 3 to 5 personas**, not all 20. The library is the menu, not the order.
3. **Existing content-team IDs stay.** `undergrad`, `grad`, `business_partner`, `research_partner`, and `business_leader` keep their database IDs. The 459 imported prompts are unchanged (test).
4. **Business leaders and potential partners are one persona.** `business_partner` is the selectable canonical key. `business_leader` is a legacy alias of the same persona (same group, same metrics meaning). Do not split hiring vs partnering into two personas.

## Embedding dedupe

Near-duplicate detection uses cosine similarity on prompt embeddings.

| Constant | Value | Location |
|---|---|---|
| **Default cosine threshold** | **0.92** | `DEFAULT_COSINE_THRESHOLD` in `lib/prompts/embeddings.ts` |

A candidate at or above the threshold is flagged for the reviewer as **similar to: \<matched prompt\>**. Near-duplicates are **never silently dropped** — they stay in the approval queue with that note (including custom prompts). When the local embedder is unavailable, status is `disabled` and every candidate is kept without similarity flags.

## Groups and personas

| Group | Persona key | Label | What they look for | Example opening |
|---|---|---|---|---|
| Prospective students | `first_year_in_state` | First year, in state | Programs, cost, outcomes | “I’m a high school senior in North Carolina choosing a college.” |
| Prospective students | `first_year_out_of_state` | First year, out of state | Reputation, value, location | “I’m a high school senior from out of state looking at colleges in the Southeast.” |
| Prospective students | `transfer` | Transfer | Credit transfer, pathways | “I’m a community college student planning to transfer to a four-year university.” |
| Prospective students | `masters_applicant` | Master’s applicant | Program fit, career outcomes | “I’m looking for a master’s program.” |
| Prospective students | `doctoral_applicant` | Doctoral applicant | Research strength, funding | “I’m looking for a PhD program with strong research funding.” |
| Prospective students | `international` | International | Visa support, rankings, cost | “I’m an international student looking at universities in the US.” |
| Prospective students | `adult_learner` | Adult learner | Part-time, online, flexibility | “I’m a working professional looking for a part-time or online degree.” |
| Prospective students | `military_veteran` | Military / veteran | GI Bill, veteran services | “I’m a veteran looking to use my GI Bill benefits.” |
| Families & advisors | `parent` | Parent | Safety, cost, outcomes | “I’m a parent helping my child choose a college.” |
| Families & advisors | `school_counselor` | School counselor | Fit for different students | “I’m a high school counselor advising students on colleges.” |
| Business leaders & partners | `business_partner` | Business leader / potential partner | Talent, internships, R&D partnerships | “I’m a business leader looking to hire talent or partner with a university.” |
| Research | `research_partner` | Research partner | Expertise, labs, collaboration | “I lead a research team looking for a university research partner.” |
| Research | `funding_agency` | Funding agency | Track record, capacity | “I’m a program officer evaluating universities for research grants.” |
| Government & policy | `state_policymaker` | State policymaker | NC workforce, state ROI, in-state students | “I work for a North Carolina state legislator.” |
| Government & policy | `federal_policymaker` | Federal policymaker | Federal research funding, national priorities | “I work for a member of Congress.” |
| Government & policy | `local_economic_development` | Local and economic development | Talent pipeline, regional impact | “I work in local economic development.” |
| Media | `local_reporter` | Local reporter | Local experts, story angles | “I’m a reporter covering news in North Carolina.” |
| Media | `trade_national_reporter` | Trade / national reporter | Experts in AI, energy, higher ed | “I’m a reporter covering higher education and technology.” |
| Supporters | `donor` | Donor | Impact, programs to fund | “I’m a philanthropist looking for a university program to support.” |
| Supporters | `alumni` | Alumni | Engagement, pride, giving | “I’m an alum looking to stay involved with a university.” |

## Retained general personas (imported prompts)

These stay inside **Prospective students**. They are general voices for historical imports, not replacements for the specific first-year or graduate rows above.

| Key | Label | Example opening |
|---|---|---|
| `undergrad` | Undergraduate prospect (general) | “I’m a high school senior choosing a college.” |
| `grad` | Graduate prospect (general) | “I’m looking for a graduate program.” |

## Legacy alias

| Key | Maps to | Notes |
|---|---|---|
| `business_leader` | `business_partner` | Same group and metrics meaning. ID preserved for imported prompts. |

## Campaign subset example

Energy might use: doctoral applicant, research partner, business partner, state policymaker, federal policymaker.
