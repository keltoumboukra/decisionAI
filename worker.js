import {
  fetchProfileText,
  fetchIntakeRow,
  createRecommendationPage,
  updateIntakeRow,
  recommendationToBlocks,
} from "./notion.js";
import { callNotionAI } from "./notionai.js";
import { fetchExternalData } from "./external.js";

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    // Support multiple webhook payload shapes from Notion
    const pageId = body?.entity?.id ?? body?.data?.page_id ?? body?.page_id;
    if (!pageId) {
      return new Response("Missing page ID in webhook payload", { status: 400 });
    }

    console.log(`[DecideAI] Processing intake row: ${pageId}`);

    try {
      const [row, profile] = await Promise.all([
        fetchIntakeRow(pageId, env),
        fetchProfileText(env),
      ]);

      console.log(`[DecideAI] Decision: "${row.title}" | Type: ${row.decisionType}`);

      const externalData = await fetchExternalData(row.decisionType, row.options);
      console.log(`[DecideAI] External data fetched for type: ${row.decisionType}`);

      const recommendation = await callNotionAI(
        { profile, title: row.title, options: row.options, criteria: row.criteria, externalData },
        env
      );

      const blocks = recommendationToBlocks(recommendation);
      const { url: newPageUrl } = await createRecommendationPage(row.title, blocks, env);
      console.log(`[DecideAI] Recommendation page created: ${newPageUrl}`);

      await updateIntakeRow(pageId, newPageUrl, env);
      console.log(`[DecideAI] Intake row updated — status=Done`);

      return new Response(JSON.stringify({ success: true, page: newPageUrl }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      // Log full recommendation to console so it is never lost
      console.error("[DecideAI] Worker error:", err.message);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
