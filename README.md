# DecideAI

An autonomous decision agent built on the Notion Developer Platform.

Submit any decision — from anywhere — and a Notion Custom Agent automatically gathers your personal context, reasons over your options with Notion AI, and writes a structured recommendation directly into Notion.

Two ways to trigger it:
- **Directly in Notion** — fill in the Decision Intake database and set Status → Pending
- **From anywhere** — run the **QuickDecisionAI** Shortcut on Mac or iPhone, answer 4 prompts, done

No chatbot. No back-and-forth. No extra API costs beyond your Notion Business plan credits. Just a clear answer.

Built at the Notion Developer Platform Hackathon, May 2026.

**[Watch the demo →](https://www.youtube.com/watch?v=LOax_8D7DYE)**

---

## How it works

### Path 1 — Notion intake form
1. Fill in a row in the **Decision Intake** database (title, options, criteria, decision type)
2. Set **Status → Pending**
3. The Custom Agent fires and runs the flow below

### Path 2 — QuickDecisionAI Shortcut
1. Run the **QuickDecisionAI** Shortcut (Mac or iPhone)
2. Answer 4 prompts: decision, options, criteria, type
3. The Shortcut POSTs to the `submitDecision` webhook
4. The Worker creates the intake row with Status → Pending
5. The Custom Agent fires automatically

### What the Custom Agent does (both paths)
1. Calls `fetchDecisionContext` — fetches the intake row, your profile page, GitHub repos, Apple Health stats, and relevant pages from your Notion workspace
2. Reasons over everything with **Notion AI** (Notion credits consumed here)
3. Calls `writeRecommendation` — creates a structured recommendation sub-page inside the intake row and sets Status → Done

The full flow takes ~30 seconds.

---

## Under the Hood — Notion Developer Platform primitives

DecideAI is built entirely on Notion's developer primitives. No external hosting, no third-party serverless functions.

### `worker.tool()` — Agent-callable tools

Tools are TypeScript functions exposed to the Custom Agent. The agent decides when to call them and what to pass.

**`fetchDecisionContext`**
Returns everything the agent needs to reason: the intake row fields, the user's profile page text, personal data from GitHub and Apple Health, and markdown snippets from relevant pages across the Notion workspace. All fetches run in parallel.

**`writeRecommendation`**
Takes the agent's markdown recommendation, converts it to Notion blocks (headings, tables, paragraphs), creates a sub-page inside the intake row, links it as the Output Page, and sets Status → Done.

```typescript
worker.tool("fetchDecisionContext", {
  schema: j.object({ pageId: j.string() }),
  execute: async ({ pageId }, context) => {
    // fetches intake row, profile, personal data sources, Notion workspace pages
    return { title, options, criteria, decisionType, urgency, profile, externalData };
  },
});
```

### `worker.sync()` — Scheduled data sync

Runs on a schedule, fetches upstream data, and upserts rows into a managed Notion database. No trigger needed — Notion runs it automatically.

**`githubSync`** — runs continuously (at maximum frequency allowed by Notion), fetches your public GitHub repos via the GitHub API, and upserts them into the **GitHub Activity** database. Uses `mode: "replace"` so deleted repos are cleaned up automatically.

```typescript
worker.sync("githubSync", {
  database: githubDb,
  schedule: "continuous",
  mode: "replace",
  execute: async () => {
    // fetches repos, returns upsert changes
    return { changes, hasMore: false };
  },
});
```

### `worker.database()` — Managed Notion database

Declares a Notion database schema in code. Notion creates the database on first deploy and migrates it automatically on schema changes. No manual database creation needed.

**`githubActivity`** — created automatically on first deploy. Populated by `githubSync`.

```typescript
const githubDb = worker.database("githubActivity", {
  type: "managed",
  initialTitle: "GitHub Activity",
  primaryKeyProperty: "Repo ID",
  schema: {
    properties: {
      Name: Schema.title(),
      "Repo ID": Schema.richText(),
      Language: Schema.richText(),
      URL: Schema.url(),
      "Last Pushed": Schema.date(),
      Description: Schema.richText(),
      Stars: Schema.number(),
      "Last Synced": Schema.date(),
    },
  },
});
```

### `worker.webhook()` — External trigger endpoint

Exposes an HTTPS endpoint that any service can POST to. The Worker processes the payload and acts on it — in this case, creating a new intake row to trigger the Custom Agent.

**`submitDecision`** — accepts `{ title, options, criteria, decisionType, urgency }` as JSON, creates the intake row with Status → Pending, and the Custom Agent fires automatically.

```typescript
worker.webhook("submitDecision", {
  execute: async (events) => {
    for (const event of events) {
      const { title, options, criteria, decisionType, urgency } = event.body;
      await createIntakeRow({ title, options, criteria, decisionType, urgency }, env);
    }
  },
});
```

Optional auth: set `WEBHOOK_SECRET` via `ntn workers env set` and send it as the `x-decidai-secret` header.

### Notion Custom Agent — AI reasoning layer

A Custom Agent in Notion is the orchestration layer. It:
- Triggers on a **database property change** (Status = Pending on the Decision Intake database)
- Has access to the Worker tools (`fetchDecisionContext`, `writeRecommendation`)
- Uses **Notion AI** (Notion credits) to reason over the data and produce the recommendation
- Follows a system prompt that enforces the output format

The Worker provides the data infrastructure. The Custom Agent provides the intelligence.

---

## QuickDecisionAI Shortcut

Trigger DecideAI from Mac or iPhone without opening Notion.

### Setup

Build the Shortcut manually in the Shortcuts app (Mac or iPhone):

| Step | Action | Config |
|------|--------|--------|
| 1 | Ask for Text | Prompt: `What's your decision?` |
| 2 | Set Variable | Name: `title` → Ask for Input |
| 3 | Ask for Text | Prompt: `Options (comma-separated)` |
| 4 | Set Variable | Name: `options` → Ask for Input |
| 5 | Ask for Text | Prompt: `Your criteria` |
| 6 | Set Variable | Name: `criteria` → Ask for Input |
| 7 | Ask for Text | Prompt: `Decision type: Tech, Career, Purchase, Travel, or Food` |
| 8 | Set Variable | Name: `decisionType` → Ask for Input |
| 9 | Get Contents of URL | See config below |
| 10 | Show Notification | `DecideAI is on it! Check Notion in ~30 seconds.` |

**Get Contents of URL config:**
- URL: your webhook URL (run `ntn workers webhooks list <worker-id>` to get it)
- Method: `POST`
- Request Body: `JSON`
- Keys: `title`, `options`, `criteria`, `decisionType` → their respective variables; `urgency` → text `No rush`

### How it works

```
QuickDecisionAI Shortcut
        ↓  [4 text prompts]
POST /webhooks/.../submitDecision
        ↓  [worker.webhook()]
Creates intake row (Status = Pending)
        ↓  [database property trigger]
Notion Custom Agent fires
        ↓  [Notion AI + worker.tool()]
Recommendation sub-page created
```

---

## Personal data sources

The Worker fetches personal context from a `personalDataSources` array in `src/index.ts`. Each entry is a `() => Promise<string>` function. Adding a new source is one line.

| Source | Status | What it provides |
|--------|--------|-----------------|
| GitHub API | Live | Public repos — name, language, stars, description |
| Apple Health | Mocked | Steps, calories, workouts, sleep, heart rate (last 7 days) |
| Notion workspace pages | Live | Pages matching decision keywords, fetched as markdown snippets |

To wire up Apple Health for real, use [Health Auto Export](https://www.healthexportapp.com/) to push a daily JSON summary to a URL, then replace the mock in `fetchAppleHealthSummary()` with a `fetch()` call.

---

## Setup

### 1. Install the ntn CLI

```bash
curl -fsSL https://ntn.dev | bash
```

### 2. Log in

```bash
ntn login
```

### 3. Set environment variables

> The `NOTION_` prefix is reserved by the Workers runtime. Use `API_TOKEN` for your integration token.

```bash
ntn workers env set API_TOKEN=<your_notion_integration_token>
ntn workers env set PROFILE_PAGE_ID=<your_profile_page_id>
ntn workers env set INTAKE_DATABASE_ID=<your_intake_database_id>
```

### 4. Deploy the Worker

```bash
npm install
npm run build
ntn workers deploy
```

On first deploy, Notion creates the **GitHub Activity** managed database and runs the initial sync. The `submitDecision` webhook URL is printed by:

```bash
ntn workers webhooks list <worker-id>
```

### 5. Create the Custom Agent in Notion

**Trigger:** Property updated → Decision Intake database → Status = Pending

**Tools:** Attach `fetchDecisionContext` and `writeRecommendation` from your deployed Worker.

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

4. Call writeRecommendation — use the pageId returned by fetchDecisionContext (not the original trigger reference), the decision title, your full recommendation text, and the sourcesUsed array returned by fetchDecisionContext.

Be direct and decisive. Never hedge excessively. Reference the user profile and external data in your reasoning.
IMPORTANT: The table must use pipe characters (|) only. Do not use HTML tags. Do not use <table>, <tr>, or <td>.
```

### 6. Build the QuickDecisionAI Shortcut

Follow the Shortcut setup steps in the [QuickDecisionAI Shortcut](#quickdecisionai-shortcut) section above.

---

## GitHub Activity database

Declared via `worker.database()`, populated by `worker.sync()` running continuously. Appears automatically in your workspace on first deploy.

| Column | Source |
|--------|--------|
| Name | Repo name |
| Repo ID | GitHub numeric ID (primary key) |
| Language | Primary language |
| URL | GitHub repo URL |
| Last Pushed | Date of last git push |
| Description | Repo description |
| Stars | Star count |
| Last Synced | Timestamp of the most recent sync run |

---

## Local testing

Create a `.env` file:
```
NOTION_TOKEN=<your_integration_token>
PROFILE_PAGE_ID=<your_profile_page_id>
INTAKE_DATABASE_ID=<your_intake_database_id>
```

Run the tool simulation against a real Notion row:
```bash
node test.js <intake-page-id>
```

This simulates what the Custom Agent does: calls `fetchDecisionContext`, prints the data bundle, then writes a sample recommendation via `writeRecommendation`. The page ID is in the Notion URL when you open the row.

---

## Example

```
Title:         Should I build my next side project in Rust?
Options:       Rust, Go, stick with Python
My Criteria:   Career growth, hiring market, I already know Python well
Decision Type: Tech
Urgency:       No rush
```

Set **Status → Pending** (or run the Shortcut). The Custom Agent fires, pulls your GitHub repos and Apple Health context, reasons with Notion AI, and a recommendation sub-page appears inside the row within ~30 seconds.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Status stays **Pending** | Custom Agent not configured or trigger not set | Create the Custom Agent with the database property trigger |
| Status flips to **Error** | Worker tool threw an error | Check logs: `ntn workers runs list <worker-id>` → `ntn workers runs logs <run-id>` |
| Output Page is empty | `writeRecommendation` tool failed | Same as above — check Worker logs |
| Profile text missing | Integration lacks access to My Profile page | Open the page in Notion → `...` menu → Connections → add your integration |
| No credits consumed | Custom Agent not running | Verify trigger is set to "Status = Pending" on the correct database |
| GitHub Activity database missing | First deploy didn't complete | Re-run `ntn workers deploy` |
| Shortcut POST fails | Wrong webhook URL | Run `ntn workers webhooks list <worker-id>` and update the URL in the Shortcut |
| Row created but agent doesn't fire | Webhook worked but Custom Agent trigger not set | Verify the Custom Agent trigger is Status = Pending on the Decision Intake database |
