export function buildPrompt({ profile, title, options, criteria, externalData }) {
  return `
You are a structured decision advisor. You never ask follow-up questions.
You always produce a final, confident recommendation based on the inputs given.
You are direct, practical, and concise. You never hedge excessively.

User profile:
${profile}

Decision to make: ${title}
Options on the table: ${options}
User's own criteria: ${criteria}
External data fetched: ${externalData}

Produce a structured recommendation in this exact format:

## 🎯 Recommendation
[Your single, clear recommendation in one sentence. Be decisive.]

## 📊 Options Compared
| Option | Pros | Cons | Fit Score /10 |
|--------|------|------|----------------|
[fill one row per option]

## 🔍 Key Insight
[One short paragraph explaining the reasoning, referencing the user profile and external data where relevant]

## ⚠️ Watch out for
[One or two concrete risks or things to verify before deciding]

## ✅ Next step
[One single concrete action the user should take in the next 48 hours]
  `;
}

function buildFallbackRecommendation({ title, options, criteria, externalData }) {
  const optionList = options.split(/[,/]/).map(o => o.trim()).filter(Boolean);
  const rows = optionList
    .map(opt => `| ${opt} | Aligns with stated criteria | Verify against constraints | — |`)
    .join("\n");
  const extSnippet =
    externalData !== "No external data available"
      ? `External context gathered: ${externalData.slice(0, 300)}`
      : "No external data was available for this decision type.";

  return `## 🎯 Recommendation
Based on your criteria (${criteria}), evaluate each option carefully before deciding on: ${title}.

## 📊 Options Compared
| Option | Pros | Cons | Fit Score /10 |
|--------|------|------|----------------|
${rows}

## 🔍 Key Insight
Your criteria suggest prioritising best fit over convenience. ${extSnippet}

## ⚠️ Watch out for
Hidden costs or constraints not listed may shift the outcome. Validate each option against your full criteria list before committing.

## ✅ Next step
Score each option against your top 3 must-have criteria within the next 48 hours.`;
}

export async function callNotionAI({ profile, title, options, criteria, externalData }, env) {
  const prompt = buildPrompt({ profile, title, options, criteria, externalData });

  try {
    const res = await fetch("https://api.notion.com/v1/ai/generate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        prompt,
        context: "You are a structured decision advisor. Be direct and decisive.",
      }),
    });

    if (!res.ok) throw new Error(`Notion AI returned ${res.status}`);
    const result = await res.json();
    if (!result.generated_text) throw new Error("Empty response from Notion AI");
    return result.generated_text;
  } catch (err) {
    console.error("Notion AI unavailable, using fallback:", err.message);
    return buildFallbackRecommendation({ title, options, criteria, externalData, profile });
  }
}
