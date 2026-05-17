# DecideAI

An autonomous decision agent built on Notion Workers and Notion AI.

Submit any decision to the Notion intake form — buying a car, choosing a city, picking a phone — and the agent automatically fetches external data, reads your personal profile, and writes a structured recommendation directly into Notion.

No chatbot. No back-and-forth. No extra API costs beyond your Notion Business plan. Just a clear answer.

Built at the Notion Developer Platform Hackathon, May 2026.

---

## How it works

1. Fill in a row in the **Decision Intake** database (title, options, criteria, decision type)
2. Set **Status → Pending** to trigger the agent
3. The Worker reads your row and your **My Profile** page
4. It fetches relevant external data based on decision type
5. It calls **Notion AI** to reason over everything
6. A structured recommendation page appears inside the row within ~15 seconds

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

### 4. Deploy

```bash
npm install
npm run build
ntn workers deploy
```

### 5. Wire up the automation

In your Decision Intake database:
- Click **Automate** → create automation
- Trigger: **"Status is set to Pending"**
- Action: **Send webhook** → paste the worker webhook URL from `ntn workers webhooks list`
- Content: check **"Select all existing properties"**

---

## Decision types and external data sources

| Type | External API |
|------|-------------|
| Purchase | NHTSA vehicle safety / cost-of-ownership context |
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

Run the full pipeline against a real Notion row:
```bash
node test.js <intake-page-id>
```

The page ID is in the Notion URL when you open the row.

---

## Example

```
Title:         Should I get a dog?
Options:       Adopt a rescue, Buy from breeder, Foster first
My Criteria:   I travel often, small apartment, budget under $500
Decision Type: Purchase
Urgency:       No rush
```

Set **Status → Pending**. A recommendation sub-page appears inside that row within 15 seconds.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Status stays **Pending** | Worker not deployed or automation not configured | Run `ntn workers deploy` and verify the automation trigger |
| Status flips to **Error** | Pipeline failed mid-run | Check logs: `ntn workers runs list <worker-id>` → `ntn workers runs logs <run-id>` |
| Output Page is empty | Worker ran but page creation failed | Same as above — check logs for the specific error |
| Profile text missing | Integration lacks access to My Profile page | Share the profile page with your integration in Notion settings |
