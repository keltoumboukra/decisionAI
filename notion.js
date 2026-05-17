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
  const res = await fetch(`${NOTION_API}/blocks/${env.PROFILE_PAGE_ID}/children`, {
    headers: headers(env.NOTION_TOKEN),
  });
  const data = await res.json();
  if (!res.ok) {
    console.warn(`  [notion] Profile fetch failed (${res.status}): ${data.message ?? JSON.stringify(data)}`);
    return "";
  }
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
  if (!res.ok) {
    throw new Error(`fetchIntakeRow failed (${res.status}): ${page.message ?? JSON.stringify(page)}`);
  }
  const props = page.properties;
  if (!props) {
    throw new Error(`fetchIntakeRow: no properties in response for page ${pageId}: ${JSON.stringify(page)}`);
  }

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

export async function createRecommendationPage(title, blocks, env, intakePageId) {
  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: headers(env.NOTION_TOKEN),
    body: JSON.stringify({
      parent: { page_id: intakePageId },
      properties: {
        title: { title: [{ text: { content: `✅ ${title} — Recommendation` } }] },
      },
      children: blocks,
    }),
  });
  const page = await res.json();
  if (!res.ok) {
    throw new Error(`Notion create page failed (${res.status}): ${page.message ?? JSON.stringify(page)}`);
  }
  return { id: page.id, url: page.url };
}

export async function updateIntakeRow(pageId, pageUrl, env) {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(env.NOTION_TOKEN),
    body: JSON.stringify({
      properties: {
        Status: { select: { name: "Done" } },
        "Output Page": { url: pageUrl },
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Notion update row failed (${res.status}): ${err.message ?? JSON.stringify(err)}`);
  }
}

export async function setErrorStatus(pageId, env) {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(env.NOTION_TOKEN),
    body: JSON.stringify({
      properties: { Status: { select: { name: "Error" } } },
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    console.error(`setErrorStatus failed (${res.status}): ${err.message ?? JSON.stringify(err)}`);
  }
}

export function recommendationToBlocks(text) {
  const blocks = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) { i++; continue; }

    if (trimmed.startsWith("|")) {
      // Collect all consecutive table lines
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      // Filter out separator rows like |---|---|
      const dataRows = tableLines.filter(l => !/^[\|\s\-:]+$/.test(l));
      if (dataRows.length === 0) continue;

      const parsedRows = dataRows.map(row =>
        row.split("|").map(c => c.trim()).filter(Boolean)
      );
      const tableWidth = parsedRows[0].length;

      blocks.push({
        type: "table",
        table: {
          table_width: tableWidth,
          has_column_header: true,
          has_row_header: false,
          children: parsedRows.map(cells => ({
            type: "table_row",
            table_row: {
              cells: cells.map(cell => [{ type: "text", text: { content: cell } }]),
            },
          })),
        },
      });
    } else if (trimmed.startsWith("## ")) {
      blocks.push({
        type: "heading_2",
        heading_2: { rich_text: [{ type: "text", text: { content: trimmed.slice(3) } }] },
      });
      i++;
    } else {
      blocks.push({
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: trimmed } }] },
      });
      i++;
    }
  }

  return blocks;
}
