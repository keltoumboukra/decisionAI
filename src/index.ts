import { Worker } from "@notionhq/workers";
import { fetchProfileText, fetchIntakeRow, createRecommendationPage, updateIntakeRow, recommendationToBlocks, type Env } from "./notion.js";
import { callNotionAI } from "./notionai.js";
import { fetchExternalData } from "./external.js";

const worker = new Worker();
export default worker;

worker.webhook("onDecisionIntake", {
  title: "Decision Intake",
  description: "Triggered when a new row is added to the Decision Intake database. Fetches external data, calls Notion AI, and writes a structured recommendation page.",
  execute: async (events) => {
    const env: Env = {
      NOTION_TOKEN: process.env.NOTION_TOKEN!,
      PROFILE_PAGE_ID: process.env.PROFILE_PAGE_ID!,
      INTAKE_DATABASE_ID: process.env.INTAKE_DATABASE_ID!,
    };

    for (const event of events) {
      const body = event.body as any;
      const pageId: string | undefined =
        body?.entity?.id ?? body?.data?.page_id ?? body?.page_id;

      if (!pageId) {
        console.warn("[DecideAI] No page ID found in webhook payload:", JSON.stringify(body));
        continue;
      }

      console.log(`[DecideAI] Processing intake row: ${pageId}`);

      try {
        const [row, profile] = await Promise.all([
          fetchIntakeRow(pageId, env),
          fetchProfileText(env),
        ]);

        console.log(`[DecideAI] Decision: "${row.title}" | Type: ${row.decisionType}`);

        const externalData = await fetchExternalData(row.decisionType, row.options);
        const recommendation = await callNotionAI(
          { profile, title: row.title, options: row.options, criteria: row.criteria, externalData, decisionType: row.decisionType },
          env
        );

        const blocks = recommendationToBlocks(recommendation);
        const { url: newPageUrl } = await createRecommendationPage(row.title, blocks, env, pageId);
        console.log(`[DecideAI] Recommendation page created: ${newPageUrl}`);

        await updateIntakeRow(pageId, newPageUrl, env);
        console.log(`[DecideAI] Done — Status=Done, Output Page linked`);
      } catch (err: any) {
        console.error(`[DecideAI] Error processing ${pageId}:`, err.message);
      }
    }
  },
});
