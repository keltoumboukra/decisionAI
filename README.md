# DecideAI

An autonomous decision agent built on Notion Workers and Notion AI.

Submit any decision to the Notion intake form — buying a car, choosing a city,
picking a phone — and the agent automatically fetches external data, reads your
personal profile, and writes a structured recommendation directly into Notion.
No chatbot. No back-and-forth. No extra API costs. Just a clear answer.

Built at the Notion Developer Platform Hackathon, May 2026.

---

## Setup

### 1. Install the ntn CLI

```bash
curl -fsSL https://ntn.dev | bash
```

### 2. Set environment variables

```bash
ntn env set NOTION_TOKEN=<your_notion_token>
ntn env set NOTION_PROFILE_PAGE_ID=<your_profile_page_id>
ntn env set NOTION_INTAKE_DATABASE_ID=<your_intake_database_id>
```

### 3. Deploy

```bash
ntn deploy
```

### 4. Wire up the webhook

In your Notion workspace, point the Decision Intake database webhook to the deployed Worker URL.

---

## How it works

1. A new row is added to the **Decision Intake** database
2. Notion fires a POST webhook to this Worker
3. The Worker reads the row (title, options, criteria, decision type) and your **My Profile** page
4. It fetches relevant external data based on decision type (vehicle data, job listings, country info, etc.)
5. It calls the **Notion AI API** to reason over all inputs using your Notion credits
6. A structured recommendation page is created in Notion and linked back to the intake row

---

## Decision Types and external data sources

| Type | External API |
|------|-------------|
| Purchase | NHTSA vehicle database |
| Tech | Wikipedia search API |
| Travel | REST Countries API |
| Career | Remotive remote jobs API |
| Food | TheMealDB API |
| Default | Profile + criteria only |

---

## Test case

```
Title: Should I buy a car?
Options: Buy new / Buy used / Keep using public transport
My Criteria: Budget $12,000, live in San Francisco, work from home 3 days a week
Decision Type: Purchase
Urgency: This month
```

Expected: a structured recommendation page appears in Notion within 15–20 seconds.
