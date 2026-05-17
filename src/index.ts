import { Worker } from "@notionhq/workers";
import type { CapabilityContext } from "@notionhq/workers";
import { j } from "@notionhq/workers/schema-builder";
import * as Builder from "@notionhq/workers/builder";
import * as Schema from "@notionhq/workers/schema";
import { fetchProfileText, fetchIntakeRow, queryPendingRow, createRecommendationPage, updateIntakeRow, recommendationToBlocks, type Env } from "./notion.js";

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
      "Last Synced": Schema.date(),
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
    const syncedAt = new Date().toISOString();
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
          "Last Synced": Builder.dateTime(syncedAt),
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

// Mocked — replace with real fetch from Health Auto Export or a Notion page once wired up
async function fetchAppleHealthSummary(): Promise<string> {
  return `Apple Health (last 7 days):
- Daily steps avg: 8,432 (goal: 10,000)
- Active calories avg: 480 kcal/day
- Workout sessions: 4 (2× strength training, 1× run, 1× yoga)
- Avg sleep: 7h 12m
- Resting heart rate: 58 bpm`;
}

// Add more personal data sources here — each returns a formatted string summary
const personalDataSources: Array<() => Promise<string>> = [
  fetchGitHubSummary,
  fetchAppleHealthSummary,
];

// Searches the Notion workspace for pages related to the decision query,
// returns their content as markdown snippets for the agent to reason over.
async function fetchRelevantNotionPages(
  query: string,
  skipPageId: string,
  context: CapabilityContext
): Promise<string> {
  try {
    const searchRes = await context.notion.search({
      query,
      filter: { property: "object", value: "page" },
      sort: { timestamp: "last_edited_time", direction: "descending" },
      page_size: 5,
    });

    const skipNorm = skipPageId.replace(/-/g, "");
    const pages = searchRes.results
      .filter((p: any) => p.id?.replace(/-/g, "") !== skipNorm)
      .slice(0, 4);

    if (pages.length === 0) return "";

    const snippets = await Promise.all(
      pages.map(async (page: any) => {
        try {
          const md = await context.notion.pages.retrieveMarkdown({ page_id: page.id });
          const titleProp = page.properties?.title ?? page.properties?.Name;
          const title = titleProp?.title?.map((t: any) => t.plain_text).join("") ?? page.id;
          const content = md.markdown.slice(0, 500);
          return `### ${title}\n${content}${md.markdown.length > 500 ? "..." : ""}`;
        } catch {
          return null;
        }
      })
    );

    const valid = snippets.filter(Boolean) as string[];
    return valid.length > 0 ? `Relevant Notion pages:\n\n${valid.join("\n\n")}` : "";
  } catch {
    return "";
  }
}

worker.tool("fetchDecisionContext", {
  title: "Fetch Decision Context",
  description: "Returns all data needed to reason about a decision: the intake row fields (title, options, criteria, decision type, urgency), the user profile text, external API data, GitHub activity, and content from relevant Notion pages in the workspace.",
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
  execute: async ({ pageId }, context) => {
    const env = makeEnv();
    const uuid = extractUUID(pageId);
    const row = uuid
      ? { ...(await fetchIntakeRow(uuid, env)), pageId: uuid }
      : await queryPendingRow(env);
    const searchQuery = `${row.title} ${row.options} ${row.decisionType}`;
    const [profile, notionPages, sourceResults] = await Promise.all([
      fetchProfileText(env),
      fetchRelevantNotionPages(searchQuery, row.pageId, context),
      Promise.all(personalDataSources.map(fn => fn())),
    ]);
    const combinedExternal = [...sourceResults, notionPages].filter(Boolean).join("\n\n");
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
