const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function headers(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

export async function fetchProfileText(env) {
  const res = await fetch(`${NOTION_API}/blocks/${env.NOTION_PROFILE_PAGE_ID}/children`, {
    headers: headers(env.NOTION_TOKEN),
  });
  const data = await res.json();
  if (!data.results) return "";
  return data.results
    .filter(b => ["paragraph", "bulleted_list_item", "numbered_list_item"].includes(b.type))
    .map(b => b[b.type].rich_text.map(t => t.plain_text).join(""))
    .filter(Boolean)
    .join("\n");
}

export async function fetchIntakeRow(pageId, env) {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    headers: headers(env.NOTION_TOKEN),
  });
  const page = await res.json();
  const props = page.properties;

  const getText = (prop) => prop?.rich_text?.map(t => t.plain_text).join("") ?? "";
  const getTitle = (prop) => prop?.title?.map(t => t.plain_text).join("") ?? "";
  const getSelect = (prop) => prop?.select?.name ?? "";

  return {
    title: getTitle(props.Title),
    options: getText(props.Options),
    criteria: getText(props["My Criteria"]),
    decisionType: getSelect(props["Decision Type"]),
    urgency: getSelect(props.Urgency),
  };
}

export async function createRecommendationPage(title, blocks, env) {
  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: headers(env.NOTION_TOKEN),
    body: JSON.stringify({
      parent: { database_id: env.NOTION_INTAKE_DATABASE_ID },
      properties: {
        title: { title: [{ text: { content: `✅ ${title} — Recommendation` } }] },
      },
      children: blocks,
    }),
  });
  const page = await res.json();
  return { id: page.id, url: page.url };
}

export async function updateIntakeRow(pageId, pageUrl, env) {
  await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(env.NOTION_TOKEN),
    body: JSON.stringify({
      properties: {
        Status: { select: { name: "Done" } },
        "Output Page": { url: pageUrl },
      },
    }),
  });
}

export function recommendationToBlocks(text) {
  const blocks = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("## ")) {
      blocks.push({
        type: "heading_2",
        heading_2: { rich_text: [{ type: "text", text: { content: trimmed.slice(3) } }] },
      });
    } else {
      blocks.push({
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: trimmed } }] },
      });
    }
  }
  return blocks;
}
