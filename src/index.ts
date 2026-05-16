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
      // Handle multiple Notion webhook payload shapes
      const pageId: string | undefined =
        body?.data?.id ??           // Notion automation: { data: { id: "..." } }
        body?.entity?.id ??         // Notion webhook API
        body?.data?.page_id ??      // generic
        body?.page_id ??            // direct POST
        body?.id;                   // fallback

      console.log("[DecideAI] Webhook body:", JSON.stringify(body));

      if (!pageId) {
        console.warn("[DecideAI] No page ID found in webhook payload:", JSON.stringify(body));
        continue;
      }

      console.log(`[DecideAI] Processing intake row: ${pageId}`);

      try {
        // Parse row data from webhook payload directly (automation already sends full page)
        // Fall back to API fetch for direct POST / non-automation triggers
        let row: { title: string; options: string; criteria: string; decisionType: string; urgency: string };
        if (body?.data?.properties) {
          const props = body.data.properties;
          const getText = (p: any) => p?.rich_text?.map((t: any) => t.plain_text).join("") ?? "";
          const getTitle = (p: any) => p?.title?.map((t: any) => t.plain_text).join("") ?? "";
          const getSelect = (p: any) => p?.select?.name ?? "";
          row = {
            title: getTitle(props.Title),
            options: getText(props.Options),
            criteria: getText(props["My Criteria"]),
            decisionType: getSelect(props["Decision Type"]),
            urgency: getSelect(props.Urgency),
          };
        } else {
          row = await fetchIntakeRow(pageId, env);
        }

        // Skip rows that aren't ready yet (automation fires on creation, before user fills fields)
        if (!row.title || !row.decisionType) {
          console.warn(`[DecideAI] Skipping incomplete row ${pageId} — title="${row.title}" type="${row.decisionType}". Set Status → Pending to trigger when ready.`);
          continue;
        }

        const profile = await fetchProfileText(env);

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
