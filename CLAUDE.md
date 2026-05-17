# DecideAI — Claude Context

## What this project is
An autonomous decision agent for the Notion Developer Platform Hackathon (May 2026).
When a user sets a row's Status to "Pending" in the Decision Intake database, a **Notion Custom Agent** triggers, calls two Worker tools to fetch context and write the result, and produces a structured recommendation sub-page — powered by Notion AI (using Notion credits).

A `worker.sync()` job also runs every 6 hours, pulling the user's public GitHub repos into a managed Notion database ("GitHub Activity") and appending a GitHub summary to the decision context.

## Architecture

```
Notion Database (Status → Pending)
        ↓  [database property trigger on Custom Agent]
Notion Custom Agent  ← AI reasoning here (Notion credits consumed)
        ↓
  call fetchDecisionContext(pageId)   ← worker.tool()
  returns: title, options, criteria, decisionType, urgency,
           profile, externalData (API data + GitHub summary)
        ↓
  Agent reasons with AI, produces structured recommendation markdown
        ↓
  call writeRecommendation(pageId, title, recommendation)  ← worker.tool()
  creates sub-page, sets Status=Done, links Output Page

── scheduled, independent ──────────────────────────────────────
  worker.sync("githubSync") runs every 6h
  → fetches public repos from GitHub API (no auth)
  → upserts rows in "GitHub Activity" managed Notion database
    (Name, Repo ID, Language, URL, Last Pushed, Description, Stars, Last Synced)
```

## Worker capabilities (3 total)

| Capability | SDK primitive | Schedule |
|------------|--------------|----------|
| `fetchDecisionContext` | `worker.tool()` | On-demand (called by Custom Agent) |
| `writeRecommendation` | `worker.tool()` | On-demand (called by Custom Agent) |
| `githubSync` | `worker.sync()` | Every 6h, replace mode |

The `githubActivity` database is declared with `worker.database()` and managed automatically by Notion.

## Stack
- **Notion Workers** (Beta) — serverless TypeScript runtime, deployed via `ntn` CLI
- **`@notionhq/workers` SDK** — `Worker` class, `worker.tool()`, `worker.sync()`, `worker.database()`
- **`@notionhq/workers/builder`** — `Builder.title()`, `Builder.richText()`, `Builder.url()`, `Builder.date()`, `Builder.dateTime()`, `Builder.number()`
- **`@notionhq/workers/schema`** — `Schema.title()`, `Schema.richText()`, `Schema.url()`, `Schema.date()`, `Schema.number()`
- **Notion Custom Agent** — AI reasoning layer, triggers on Status → Pending, consumes Notion credits
- **Notion REST API** v1 (2022-06-28)
- TypeScript: `module: nodenext`, `rootDir: ./src`, `outDir: ./dist`

## Key IDs
- Worker ID: `019e32f4-8c16-7f69-b92b-3cc2d5c2393f`
- Workspace ID: `a9aa3075-26cc-4b1b-8f13-b0a60c653508`
- Intake database ID: `eb7d63de47b54c3ca56fe44d61ec9e12`
- Profile page ID: `3622b9f2d52a8099ad72d84902ff2f0f`

## Env vars
The `NOTION_` prefix is reserved by the Workers runtime — cannot be set manually.
- `API_TOKEN` — user's Notion integration token (set via `ntn workers env set`)
- `PROFILE_PAGE_ID` — ID of the user's "My Profile" page
- `INTAKE_DATABASE_ID` — ID of the Decision Intake database
- Local `.env` file has `NOTION_TOKEN=...` for `test.js` only (not committed)

In `src/index.ts`, `process.env.API_TOKEN` is mapped to `env.NOTION_TOKEN` internally via `makeEnv()`.

## Database properties (Decision Intake)
- `Title` (title)
- `Options` (rich_text)
- `My Criteria` (rich_text)
- `Decision Type` (select: Purchase / Tech / Travel / Career / Food)
- `Urgency` (select: This month / No rush / etc.)
- `Status` (select: Pending → Done / Error)
- `Output Page` (url, set by writeRecommendation tool)

## GitHub Activity database (managed by worker.database())
- `Name` (title)
- `Repo ID` (rich_text, primary key)
- `Language` (rich_text)
- `URL` (url)
- `Last Pushed` (date)
- `Description` (rich_text)
- `Stars` (number)
- `Last Synced` (date — datetime of the sync run that last updated this row)

## Custom Agent setup (do this once in Notion UI)

**Trigger:** Property updated → Decision Intake database → Status = Pending

**Tools:** Attach both Worker tools: `fetchDecisionContext` and `writeRecommendation`

**System prompt:**
```
You are DecideAI, a structured decision advisor inside Notion.

When triggered:
1. Call fetchDecisionContext — pass any page reference you have as pageId (a URL, ID, or page name all work). The tool returns the decision data along with a pageId field.
2. Reason carefully over the decision using the user's profile, their stated criteria, the options, and the external data provided.
3. Produce a structured recommendation in EXACTLY this format — use pipe-separated markdown for the table, not HTML:

## 🎯 Recommendation
[Single decisive sentence — pick one option]

## 📊 Options Compared
| Option | Pros | Cons | Fit Score /10 |
|--------|------|------|----------------|
| Option A | strength | weakness | 8 |
| Option B | strength | weakness | 6 |

## 🔍 Key Insight
[One paragraph referencing the profile and external data]

## ⚠️ Watch out for
[One or two concrete risks]

## ✅ Next step
[One action to take in the next 48 hours]

4. Call writeRecommendation — use the pageId returned by fetchDecisionContext (not the original trigger reference), the decision title, and your full recommendation text.

Be direct and decisive. Never hedge excessively. Reference the user profile and external data in your reasoning.
IMPORTANT: The table must use pipe characters (|) only. Do not use HTML tags. Do not use <table>, <tr>, or <td>.
```

## File layout
```
src/
  index.ts      — worker entry point: 2 tools + 1 sync + database declaration
  notion.ts     — Notion API helpers (fetchIntakeRow, createRecommendationPage, etc.)
  external.ts   — fetchExternalData (routes by decision type)
notion.js       — plain JS copy of notion.ts (used by test.js)
external.js     — plain JS copy of external.ts (used by test.js)
test.js         — local tool test: simulates both tool calls against real Notion
worker.js       — legacy Cloudflare-style handler (not used for deployment)
workers.json    — auto-generated by ntn deploy (worker + workspace IDs)
```

## Deploy & run
```bash
npm run build                    # compile src → dist
ntn workers deploy               # deploy to Notion Workers
node test.js <page-id>           # simulate tool calls locally against real Notion
```

## Check worker runs & logs
```bash
ntn workers runs list 019e32f4-8c16-7f69-b92b-3cc2d5c2393f
ntn workers runs logs <run-id>
```

## ntn CLI location
`~/.local/bin/ntn` (added to PATH via shell profile)

## External data sources (per decision type)
| Type | API |
|------|-----|
| Purchase | NHTSA complaints API |
| Tech | Wikipedia search API |
| Travel | REST Countries API |
| Career | Remotive remote jobs API |
| Food | TheMealDB API |
| All | GitHub public repos (recent activity, no auth) |

## What's working
- Worker deployed with 3 capabilities: `fetchDecisionContext`, `writeRecommendation`, `githubSync` ✅
- Custom Agent (DecideAI) created, trigger set to Status = Pending on Decision Intake ✅
- Agent calls both tools, reasons with Notion AI, Notion credits consumed ✅
- Recommendation created as sub-page inside intake row with proper Notion table blocks ✅
- Status flips to Done on success, Error on failure ✅
- Profile page text fetched and passed to Custom Agent for personalisation ✅
- External data fetched per decision type ✅
- `fetchDecisionContext` handles any page reference format (UUID, URL, page mention) ✅
- Falls back to querying the DB for most recent Pending row if no valid ID extracted ✅
- GitHub repos fetched and appended to externalData in every fetchDecisionContext call ✅
- `worker.sync()` syncs public GitHub repos to managed Notion database every 6h ✅
- `worker.database()` declares GitHub Activity DB with schema (Name, Language, URL, Stars, Last Synced…) ✅
- Last Synced timestamp written to each row on every sync run ✅

## Test case
```
Title: Should I get a dog
Options: Adopt a rescue, Buy from breeder, Foster first
My Criteria: I travel often, small apartment, budget under $500
Decision Type: Purchase
Urgency: No rush
```
Set Status → Pending to trigger. Custom Agent should run, call both tools, and produce a recommendation sub-page.
