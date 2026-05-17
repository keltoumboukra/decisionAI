# DecideAI

An autonomous decision agent built on the Notion Developer Platform.

Submit any decision to the Notion intake form — buying a car, choosing a city, picking a phone — and a Notion Custom Agent automatically fetches external data, reads your personal profile, and writes a structured recommendation directly into Notion using Notion AI.

No chatbot. No back-and-forth. No extra API costs beyond your Notion Business plan credits. Just a clear answer.

Built at the Notion Developer Platform Hackathon, May 2026.

---

## How it works

1. Fill in a row in the **Decision Intake** database (title, options, criteria, decision type)
2. Set **Status → Pending** to trigger the agent
3. A **Notion Custom Agent** fires automatically (database property trigger)
4. The agent calls the `fetchDecisionContext` Worker tool — which fetches your intake row, your **My Profile** page, and external data for the decision type
5. The Custom Agent reasons over everything with **Notion AI** (Notion credits are consumed here)
6. The agent calls the `writeRecommendation` Worker tool — which creates a structured recommendation page inside the row and sets Status → Done

The two **Notion Workers** are the infrastructure layer. The Custom Agent is the AI orchestrator.

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

> Note: the `NOTION_` prefix is reserved by the Workers runtime. Use `API_TOKEN` for your integration token.

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

### 5. Create the Custom Agent in Notion

In Notion, create a new **Custom Agent** and configure it:

**Trigger:** Property updated → Decision Intake database → Status = Pending

**Tools:** Attach both Worker tools — `fetchDecisionContext` and `writeRecommendation` — from your deployed Worker.

**System prompt:**
```
You are DecideAI, a structured decision advisor inside Notion.

When triggered:
1. Call fetchDecisionContext with the page ID from the trigger
2. Reason carefully over the decision using the user's profile, their stated criteria, the options, and the external data provided
3. Produce a structured recommendation in this exact format:

## 🎯 Recommendation
[Single decisive sentence — pick one option]

## 📊 Options Compared
| Option | Pros | Cons | Fit Score /10 |
|--------|------|------|----------------|
[one row per option]

## 🔍 Key Insight
[One paragraph referencing the profile and external data]

## ⚠️ Watch out for
[One or two concrete risks]

## ✅ Next step
[One action to take in the next 48 hours]

4. Call writeRecommendation with the pageId, the decision title, and your full recommendation text.

Be direct and decisive. Never hedge excessively. Reference the user profile and external data in your reasoning.
```

---

## Decision types and external data sources

| Type | External API |
|------|-------------|
| Purchase | NHTSA vehicle safety / complaints data |
| Tech | Wikipedia search API |
| Travel | REST Countries API |
| Career | Remotive remote jobs API |
| Food | TheMealDB API |

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
Title:         Should I get a dog?
Options:       Adopt a rescue, Buy from breeder, Foster first
My Criteria:   I travel often, small apartment, budget under $500
Decision Type: Purchase
Urgency:       No rush
```

Set **Status → Pending**. The Custom Agent fires, reasons with Notion AI, and a recommendation sub-page appears inside that row within ~30 seconds.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Status stays **Pending** | Custom Agent not configured or trigger not set | Create the Custom Agent with the database property trigger |
| Status flips to **Error** | Worker tool threw an error | Check logs: `ntn workers runs list <worker-id>` → `ntn workers runs logs <run-id>` |
| Output Page is empty | `writeRecommendation` tool failed | Same as above — check Worker logs |
| Profile text missing | Integration lacks access to My Profile page | Share the profile page with your integration in Notion settings |
| No credits consumed | Custom Agent not running | Verify trigger is set to "Status = Pending" on the correct database |
