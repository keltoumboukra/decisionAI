// Local tool test — simulates what the Custom Agent does when it calls the two Worker tools.
// Usage: node test.js <intake-page-id>
//
// Reads env vars from a local .env file automatically.
// Step 1: calls fetchDecisionContext (fetches row + profile + external data)
// Step 2: prints the data bundle the Custom Agent would receive
// Step 3: writes a sample recommendation to Notion via writeRecommendation

import { readFileSync } from "fs";
import {
  fetchProfileText,
  fetchIntakeRow,
  createRecommendationPage,
  updateIntakeRow,
  recommendationToBlocks,
} from "./notion.js";
import { fetchExternalData } from "./external.js";

// Load .env file without any npm dependencies
try {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) {
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      if (key && !process.env[key]) process.env[key] = val;
    }
  }
} catch { /* .env is optional */ }

const env = {
  NOTION_TOKEN: process.env.NOTION_TOKEN,
  PROFILE_PAGE_ID: process.env.PROFILE_PAGE_ID,
  INTAKE_DATABASE_ID: process.env.INTAKE_DATABASE_ID,
};

const pageId = process.argv[2];
if (!pageId) {
  console.error("Usage: node test.js <intake-page-id>");
  console.error("  Find the page ID in the Notion URL when you open the intake row.");
  process.exit(1);
}

console.log(`\n[DecideAI] Simulating Custom Agent tool calls for page: ${pageId}\n`);

try {
  // --- Simulate fetchDecisionContext ---
  console.log("1/3  fetchDecisionContext: fetching row + profile + external data...");
  const [row, profile] = await Promise.all([
    fetchIntakeRow(pageId, env),
    fetchProfileText(env),
  ]);
  const externalData = await fetchExternalData(row.decisionType, row.options);

  const context = { ...row, profile, externalData };

  console.log("\n     Context bundle returned to Custom Agent:");
  console.log(`     Title:         ${context.title}`);
  console.log(`     Options:       ${context.options}`);
  console.log(`     Criteria:      ${context.criteria}`);
  console.log(`     Decision type: ${context.decisionType}`);
  console.log(`     Urgency:       ${context.urgency}`);
  console.log(`     Profile:       ${context.profile.length} chars`);
  console.log(`     External data: ${context.externalData.slice(0, 120)}${context.externalData.length > 120 ? "..." : ""}`);

  console.log("\n2/3  (In production: Custom Agent receives the above and produces a recommendation using Notion AI)");
  console.log("     Using a sample recommendation for this local test...\n");

  // Sample recommendation — the Custom Agent would generate this with real AI
  const sampleRecommendation = `## 🎯 Recommendation
Go with **${row.options.split(/[,/]/)[0].trim()}** — it best fits your stated criteria.

## 📊 Options Compared
| Option | Pros | Cons | Fit Score /10 |
|--------|------|------|----------------|
${row.options.split(/[,/]/).map((o, i) => `| ${o.trim()} | Strengths to evaluate | Trade-offs to consider | ${8 - i} |`).join("\n")}

## 🔍 Key Insight
Based on your profile and criteria (${row.criteria}), the first option aligns most closely with your stated priorities. The external data supports this choice.

## ⚠️ Watch out for
Verify all assumptions before committing. What seems obvious on paper may look different in practice.

## ✅ Next step
Research the top option in detail over the next 48 hours and make a go/no-go call.`;

  // --- Simulate writeRecommendation ---
  console.log("3/3  writeRecommendation: creating sub-page and updating row...");
  const blocks = recommendationToBlocks(sampleRecommendation);
  const { url } = await createRecommendationPage(row.title, blocks, env, pageId);
  await updateIntakeRow(pageId, url, env);
  console.log(`     Created: ${url}`);

  console.log("\n[DecideAI] Done. Open your Notion database to see the result.");
  console.log("           In production, the recommendation is written by the Custom Agent using Notion AI.\n");
} catch (err) {
  console.error("\n[DecideAI] Error:", err.message);
  process.exit(1);
}
