// Local pipeline test — no Workers runtime needed.
// Usage: node test.js <intake-page-id>
//
// Reads env vars from a local .env file automatically.
// The full pipeline runs: fetch row → fetch profile → external data → AI (fallback) → write page → update row.

import { readFileSync } from "fs";
import {
  fetchProfileText,
  fetchIntakeRow,
  createRecommendationPage,
  updateIntakeRow,
  recommendationToBlocks,
} from "./notion.js";
import { callNotionAI } from "./notionai.js";
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
  NOTION_PROFILE_PAGE_ID: process.env.NOTION_PROFILE_PAGE_ID,
  NOTION_INTAKE_DATABASE_ID: process.env.NOTION_INTAKE_DATABASE_ID,
};

const pageId = process.argv[2];
if (!pageId) {
  console.error("Usage: node test.js <intake-page-id>");
  console.error("  Find the page ID in the Notion URL when you open the intake row.");
  process.exit(1);
}

console.log(`\n[DecideAI] Running pipeline for page: ${pageId}\n`);

try {
  console.log("1/5  Fetching intake row + profile...");
  const [row, profile] = await Promise.all([
    fetchIntakeRow(pageId, env),
    fetchProfileText(env),
  ]);
  console.log(`     Title:         ${row.title}`);
  console.log(`     Options:       ${row.options}`);
  console.log(`     Criteria:      ${row.criteria}`);
  console.log(`     Decision type: ${row.decisionType}`);
  console.log(`     Profile:       ${profile.length} chars loaded`);

  console.log("\n2/5  Fetching external data...");
  const externalData = await fetchExternalData(row.decisionType, row.options);
  console.log(`     ${externalData.slice(0, 120)}${externalData.length > 120 ? "..." : ""}`);

  console.log("\n3/5  Calling Notion AI (fallback expected until Business plan activates)...");
  const recommendation = await callNotionAI(
    { profile, title: row.title, options: row.options, criteria: row.criteria, externalData, decisionType: row.decisionType },
    env
  );
  console.log("\n     --- RECOMMENDATION PREVIEW (first 600 chars) ---");
  console.log(recommendation.slice(0, 600));
  if (recommendation.length > 600) console.log("     ...");

  console.log("\n4/5  Writing recommendation page to Notion...");
  const blocks = recommendationToBlocks(recommendation);
  const { url } = await createRecommendationPage(row.title, blocks, env, pageId);
  console.log(`     Created: ${url}`);

  console.log("\n5/5  Updating intake row (Status → Done, Output Page linked)...");
  await updateIntakeRow(pageId, url, env);

  console.log("\n[DecideAI] Done. Open your Notion database to see the result.\n");
} catch (err) {
  console.error("\n[DecideAI] Error:", err.message);
  process.exit(1);
}
