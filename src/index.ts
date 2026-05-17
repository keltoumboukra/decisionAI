import { Worker } from "@notionhq/workers";
import { j } from "@notionhq/workers/schema-builder";
import { fetchProfileText, fetchIntakeRow, createRecommendationPage, updateIntakeRow, recommendationToBlocks, type Env } from "./notion.js";
import { fetchExternalData } from "./external.js";

const worker = new Worker();
export default worker;

function makeEnv(): Env {
  return {
    NOTION_TOKEN: process.env.API_TOKEN!,
    PROFILE_PAGE_ID: process.env.PROFILE_PAGE_ID!,
    INTAKE_DATABASE_ID: process.env.INTAKE_DATABASE_ID!,
  };
}

worker.tool("fetchDecisionContext", {
  title: "Fetch Decision Context",
  description: "Returns all data needed to reason about a decision: the intake row fields (title, options, criteria, decision type, urgency), the user profile text, and external data relevant to the decision type.",
  schema: j.object({
    pageId: j.string().describe("Notion page ID of the decision intake row"),
  }),
  outputSchema: j.object({
    title: j.string(),
    options: j.string(),
    criteria: j.string(),
    decisionType: j.string(),
    urgency: j.string(),
    profile: j.string(),
    externalData: j.string(),
  }),
  hints: { readOnlyHint: true },
  execute: async ({ pageId }) => {
    const env = makeEnv();
    const row = await fetchIntakeRow(pageId, env);
    const [profile, externalData] = await Promise.all([
      fetchProfileText(env),
      fetchExternalData(row.decisionType, row.options),
    ]);
    return { ...row, profile, externalData };
  },
});

worker.tool("writeRecommendation", {
  title: "Write Recommendation",
  description: "Creates a structured recommendation sub-page inside the decision intake row, links it as the Output Page, and sets Status to Done.",
  schema: j.object({
    pageId: j.string().describe("Notion page ID of the decision intake row"),
    title: j.string().describe("The decision title, used to name the sub-page"),
    recommendation: j.string().describe("Full recommendation in markdown (## headings, table, paragraphs)"),
  }),
  outputSchema: j.object({
    url: j.string().describe("URL of the created recommendation page"),
  }),
  execute: async ({ pageId, title, recommendation }) => {
    const env = makeEnv();
    const blocks = recommendationToBlocks(recommendation);
    const { url } = await createRecommendationPage(title, blocks, env, pageId);
    await updateIntakeRow(pageId, url, env);
    return { url };
  },
});
