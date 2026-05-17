import type { Env } from "./notion.js";

type PromptInput = {
  profile: string;
  title: string;
  options: string;
  criteria: string;
  externalData: string;
  decisionType?: string;
};

export function buildPrompt({ profile, title, options, criteria, externalData }: PromptInput): string {
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

function extractBudget(text: string): number | null {
  const m = text.match(/\$\s?([\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, "")) : null;
}

type Row = { option: string; pros: string; cons: string; score: string };

function buildPurchaseRows(optionList: string[], criteria: string): Row[] {
  const budget = extractBudget(criteria);
  const inSF = /\bsf\b|san francisco/i.test(criteria);
  const wfh = /wfh|work from home|remote|hybrid/i.test(criteria);

  return optionList.map(opt => {
    const lo = opt.toLowerCase();
    if (/\bnew\b/.test(lo)) {
      const over = budget !== null && budget < 20000;
      return {
        option: opt,
        pros: "Full warranty, latest safety features, manufacturer financing available",
        cons: over ? `Typically $20,000+ new — over your $${budget!.toLocaleString()} budget` : "Depreciates ~20% in year one",
        score: over ? "3" : "6",
      };
    }
    if (/used|second/.test(lo)) {
      const fits = budget === null || budget >= 7000;
      return {
        option: opt,
        pros: `Lower depreciation${fits && budget ? `; fits your $${budget.toLocaleString()} budget` : ""}; good value at $8k–$15k`,
        cons: "No manufacturer warranty, unknown maintenance history",
        score: fits ? "8" : "5",
      };
    }
    if (/public|transit|transport|bus|train|metro/.test(lo)) {
      return {
        option: opt,
        pros: `No capital cost; saves ~$10,000/year in ownership${inSF ? "; SF has excellent BART + Muni" : ""}`,
        cons: wfh ? "Great for WFH schedule; limits flexibility on commute days" : "Less flexibility, schedule-dependent",
        score: inSF && wfh ? "7" : "6",
      };
    }
    return { option: opt, pros: "Evaluate against budget and total cost of ownership", cons: "Verify all ongoing costs", score: "—" };
  });
}

function rowsToMarkdown(rows: Row[]): string {
  const header = "| Option | Pros | Cons | Fit Score /10 |\n|--------|------|------|----------------|";
  return header + "\n" + rows.map(r => `| ${r.option} | ${r.pros} | ${r.cons} | ${r.score} |`).join("\n");
}

function buildFallbackRecommendation({ title, options, criteria, externalData, decisionType }: PromptInput): string {
  const type = (decisionType ?? "").toLowerCase();
  const optionList = options.split(/[,/]/).map(o => o.trim()).filter(Boolean);
  const budget = extractBudget(criteria);
  const inSF = /\bsf\b|san francisco/i.test(criteria);
  const wfh = /wfh|work from home|remote|hybrid/i.test(criteria);
  const hasExternal = externalData && externalData !== "No external data available";

  let topPick: string, tableMarkdown: string, insight: string, watchOut: string, nextStep: string;

  if (type === "purchase") {
    const isCarDecision = /car|vehicle|transport|truck|suv|auto/i.test(options + criteria);
    const rows = isCarDecision
      ? buildPurchaseRows(optionList, criteria)
      : optionList.map(o => ({ option: o, pros: "Evaluate total cost of ownership", cons: "Factor in ongoing and hidden costs", score: "—" }));

    const bestRow = rows.reduce((best, r) => (parseInt(r.score) || 0) > (parseInt(best.score) || 0) ? r : best, rows[0]);
    topPick = bestRow.option;
    tableMarkdown = rowsToMarkdown(rows);

    if (isCarDecision) {
      insight = `With a ${budget ? `$${budget.toLocaleString()}` : "stated"} budget, buying used is the strongest fit — new cars are typically $20,000+ which is above range, while public transport in${inSF ? " San Francisco" : " your city"} is a genuinely competitive option given${wfh ? " your WFH schedule reduces daily commute dependency" : " lower ongoing costs"}.${hasExternal ? ` ${externalData}` : ""}`;
      watchOut = `Total annual ownership cost in${inSF ? " SF" : " major US cities"} typically runs $9,000–$13,000 (insurance, maintenance, fuel, parking). Factor this against the no-car option before deciding.`;
      nextStep = `Search for certified used ${budget ? `vehicles under $${budget.toLocaleString()}` : "vehicles"} (Toyota, Honda, Hyundai) with under 80,000 miles this week. Get 3 quotes to compare.`;
    } else {
      insight = `Compare total cost of ownership across all options — upfront price is rarely the full picture. Your criteria (${criteria}) should anchor every comparison.`;
      watchOut = "Hidden costs and ongoing fees often exceed the initial purchase price. Request a full cost breakdown.";
      nextStep = "Create a side-by-side cost comparison (upfront + 3-year total) for each option before deciding.";
    }

  } else if (type === "tech") {
    const rows = optionList.map((opt, i) => ({
      option: opt,
      pros: "Established product with user reviews and benchmarks available",
      cons: "Check software support end-date and ecosystem compatibility",
      score: String(8 - i),
    }));
    topPick = optionList[0];
    tableMarkdown = rowsToMarkdown(rows);
    insight = `For tech decisions, ecosystem fit and longevity matter as much as specs.${hasExternal ? ` ${externalData}` : ""}`;
    watchOut = "Check software support end dates. Avoid products within 1–2 years of end-of-life.";
    nextStep = "Shortlist your top 2 options and read one long-term ownership review each before buying.";

  } else if (type === "travel") {
    const rows = optionList.map(opt => ({
      option: opt,
      pros: "Unique cultural experience; direct flights typically available",
      cons: "Verify visa requirements, safety ratings, and travel advisories",
      score: "—",
    }));
    topPick = optionList[0];
    tableMarkdown = rowsToMarkdown(rows);
    insight = hasExternal ? externalData : `Match each destination to your criteria (${criteria}).`;
    watchOut = "Check visa requirements, travel advisories (travel.state.gov), and entry health requirements before booking anything.";
    nextStep = "Compare round-trip flight and 7-night accommodation costs for your top 2 destinations for your target dates.";

  } else if (type === "career") {
    const rows = optionList.map((opt, i) => ({
      option: opt,
      pros: "Career growth potential; skill development opportunity",
      cons: "Evaluate compensation, job security, and culture fit",
      score: String(8 - i),
    }));
    topPick = optionList[0];
    tableMarkdown = rowsToMarkdown(rows);
    insight = hasExternal ? `Job market context: ${externalData}` : `Balance short-term compensation against long-term growth. Your criteria (${criteria}) should anchor every comparison.`;
    watchOut = "Optimising only for salary is a common mistake. Culture fit and growth trajectory have a higher long-term impact.";
    nextStep = "Talk to 2 people currently in each role or company you're considering before making a decision.";

  } else if (type === "food") {
    const rows = optionList.map(opt => ({
      option: opt,
      pros: "Satisfies stated preference; widely available ingredients",
      cons: "Check nutritional fit and preparation time",
      score: "—",
    }));
    topPick = optionList[0];
    tableMarkdown = rowsToMarkdown(rows);
    insight = hasExternal ? externalData : `Balance taste, nutrition, and convenience against your criteria: ${criteria}.`;
    watchOut = "Consider dietary restrictions, ingredient availability, and weekly prep time.";
    nextStep = "Try your top option this week and evaluate honestly against your criteria.";

  } else {
    const rows = optionList.map(o => ({ option: o, pros: "Evaluate against your stated priorities", cons: "Identify key risks and unknowns", score: "—" }));
    topPick = optionList[0];
    tableMarkdown = rowsToMarkdown(rows);
    insight = `Rank each option against your non-negotiables first. Your criteria (${criteria}) should eliminate options before you deliberate.`;
    watchOut = "Reversibility matters. Prefer options that can be adjusted if circumstances change.";
    nextStep = "Write down your top 3 must-haves and score each option against them before deciding.";
  }

  return `## 🎯 Recommendation
Go with **${topPick}** — it best fits your criteria: ${criteria}.

## 📊 Options Compared
${tableMarkdown}

## 🔍 Key Insight
${insight}

## ⚠️ Watch out for
${watchOut}

## ✅ Next step
${nextStep}`;
}

export async function callNotionAI(input: PromptInput, env: Env): Promise<string> {
  const prompt = buildPrompt(input);

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

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Notion AI returned ${res.status}: ${errBody}`);
    }
    const result: any = await res.json();
    if (!result.generated_text) throw new Error("Empty response from Notion AI");
    return result.generated_text;
  } catch (err: any) {
    console.error("Notion AI unavailable, using fallback:", err.message);
    return buildFallbackRecommendation(input);
  }
}
