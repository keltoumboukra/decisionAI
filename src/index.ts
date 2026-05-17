import { Worker } from "@notionhq/workers";
import { j } from "@notionhq/workers/schema-builder";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import { fetchProfileText, fetchIntakeRow, queryPendingRow, createRecommendationPage, updateIntakeRow, recommendationToBlocks, type Env } from "./notion.js";
import { fetchExternalData } from "./external.js";

const worker = new Worker();
export default worker;

function extractUUID(input: string): string | null {
  const match = input.replace(/-/g, "").match(/[0-9a-f]{32}/i);
  return match ? match[0] : null;
}

function makeEnv(): Env {
  return {
    NOTION_TOKEN: process.env.API_TOKEN!,
    PROFILE_PAGE_ID: process.env.PROFILE_PAGE_ID!,
    INTAKE_DATABASE_ID: process.env.INTAKE_DATABASE_ID!,
  };
}

// Managed Notion database synced from GitHub
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
    },
  },
});

// Pulls public repos for keltoumboukra every 6 hours
worker.sync("githubSync", {
  database: githubDb,
  schedule: "6h",
  mode: "replace",
  execute: async () => {
    const res = await fetch(
      "https://api.github.com/users/keltoumboukra/repos?sort=pushed&per_page=15&type=owner",
      { headers: { "User-Agent": "DecideAI-Worker" } }
    );
    const repos: any[] = await res.json();
    const changes = repos
      .filter((r) => !r.fork)
      .map((r) => ({
        type: "upsert" as const,
        key: String(r.id),
        upstreamUpdatedAt: r.pushed_at ?? undefined,
        properties: {
          Name: Builder.title(r.name),
          "Repo ID": Builder.richText(String(r.id)),
          Language: Builder.richText(r.language ?? ""),
          URL: Builder.url(r.html_url),
          "Last Pushed": Builder.date(r.pushed_at ? r.pushed_at.slice(0, 10) : "2000-01-01"),
          Description: Builder.richText(r.description ?? ""),
          Stars: Builder.number(r.stargazers_count ?? 0),
        },
      }));
    return { changes, hasMore: false };
  },
});

// Returns a short GitHub summary to enrich decision context
async function fetchGitHubSummary(): Promise<string> {
  try {
    const res = await fetch(
      "https://api.github.com/users/keltoumboukra/repos?sort=pushed&per_page=8&type=owner",
      { headers: { "User-Agent": "DecideAI-Worker" } }
    );
    if (!res.ok) return "";
    const repos: any[] = await res.json();
    const lines = repos
      .filter((r) => !r.fork)
      .map((r) => {
        const lang = r.language ? ` (${r.language})` : "";
        const stars = r.stargazers_count > 0 ? ` ★${r.stargazers_count}` : "";
        return `- ${r.name}${lang}${stars}: ${r.description ?? ""}`;
      });
    return lines.length > 0 ? `GitHub repos (recent activity):\n${lines.join("\n")}` : "";
  } catch {
    return "";
  }
}

worker.tool("fetchDecisionContext", {
  title: "Fetch Decision Context",
  description: "Returns all data needed to reason about a decision: the intake row fields (title, options, criteria, decision type, urgency), the user profile text, and external data relevant to the decision type.",
  schema: j.object({
    pageId: j.string().describe("Notion page ID of the decision intake row"),
  }),
  outputSchema: j.object({
    pageId: j.string(),
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
    const uuid = extractUUID(pageId);
    const row = uuid
      ? { ...(await fetchIntakeRow(uuid, env)), pageId: uuid }
      : await queryPendingRow(env);
    const [profile, externalData, githubSummary] = await Promise.all([
      fetchProfileText(env),
      fetchExternalData(row.decisionType, row.options),
      fetchGitHubSummary(),
    ]);
    const combinedExternal = [externalData, githubSummary].filter(Boolean).join("\n\n");
    return { ...row, profile, externalData: combinedExternal };
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
    const uuid = extractUUID(pageId) ?? (await queryPendingRow(env)).pageId;
    const blocks = recommendationToBlocks(recommendation);
    const { url } = await createRecommendationPage(title, blocks, env, uuid);
    await updateIntakeRow(uuid, url, env);
    return { url };
  },
});
