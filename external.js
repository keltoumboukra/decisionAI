async function safeFetch(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchPurchaseData(options) {
  const isCarDecision = /car|vehicle|transport|truck|suv|auto|transit/i.test(options);

  if (isCarDecision) {
    // Fetch reliability data for top makes from NHTSA safety ratings
    const topMakes = ["Toyota", "Honda", "Hyundai"];
    const complaints = [];
    for (const make of topMakes) {
      const data = await safeFetch(`https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${make}&modelYear=2021`);
      if (data?.results) {
        const total = data.results.reduce((sum, r) => sum + (r.numberOfComplaints ?? 0), 0);
        if (total > 0) complaints.push(`${make} 2021 models: ${total} NHTSA complaints`);
      }
    }
    const safetyLine = complaints.length ? complaints.join("; ") : "";
    return [
      "US car market context (2024–2025):",
      "• New car avg price: ~$48,000 | Certified used: ~$28,000 | Private used: $8,000–$18,000",
      "• Annual ownership cost (insurance + maintenance + fuel + parking in SF): ~$10,000–$13,000/year",
      "• Public transit (SF BART + Muni): ~$100/month = ~$1,200/year",
      "• Reliable used cars $10k–$15k range: Toyota Corolla, Honda Civic, Hyundai Elantra (2018–2021)",
      safetyLine,
    ].filter(Boolean).join("\n");
  }

  // Generic purchase fallback
  return "Compare total cost of ownership across all options, not just purchase price. Factor in maintenance, insurance, and resale value.";
}

async function fetchTechData(options) {
  const terms = options.split(/[,/]/).map(o => o.trim()).filter(Boolean).slice(0, 3);
  const results = [];
  for (const term of terms) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&format=json&srlimit=1&origin=*`;
    const data = await safeFetch(url);
    if (data?.query?.search?.[0]) {
      const snippet = data.query.search[0].snippet.replace(/<[^>]+>/g, "").slice(0, 150);
      results.push(`${term}: ${snippet}`);
    }
  }
  return results.length ? results.join("\n") : "No external data available";
}

async function fetchTravelData(options) {
  const terms = options.split(/[,/]/).map(o => o.trim()).filter(Boolean).slice(0, 3);
  const results = [];
  for (const term of terms) {
    const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(term)}?fields=name,capital,population,region,subregion`;
    const data = await safeFetch(url);
    if (Array.isArray(data) && data[0]) {
      const c = data[0];
      results.push(
        `${c.name.common}: capital ${c.capital?.[0] ?? "N/A"}, region ${c.region}, population ${c.population?.toLocaleString()}`
      );
    }
  }
  return results.length ? results.join("\n") : "No external data available";
}

async function fetchCareerData(options) {
  const term = options.split(/[,/]/)[0].trim();
  const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(term)}&limit=5`;
  const data = await safeFetch(url);
  if (!data?.jobs?.length) return "No external data available";
  const jobs = data.jobs.map(j => `${j.title} at ${j.company_name} (${j.job_type})`).join("; ");
  return `Current remote job market for "${term}": ${jobs}`;
}

async function fetchFoodData(options) {
  const meal = options.split(/[,/]/)[0].trim();
  const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(meal)}`;
  const data = await safeFetch(url);
  if (!data?.meals?.length) return "No external data available";
  const m = data.meals[0];
  return `${m.strMeal}: ${m.strCategory} dish from ${m.strArea}. ${m.strInstructions?.slice(0, 200) ?? ""}`;
}

export async function fetchExternalData(decisionType, options) {
  try {
    switch (decisionType?.toLowerCase()) {
      case "purchase": return await fetchPurchaseData(options);
      case "tech":     return await fetchTechData(options);
      case "travel":   return await fetchTravelData(options);
      case "career":   return await fetchCareerData(options);
      case "food":     return await fetchFoodData(options);
      default:         return "No external data available";
    }
  } catch {
    return "No external data available";
  }
}
