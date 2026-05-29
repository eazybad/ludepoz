// Kampasika — describe what you're selling in plain language, fill the form.
import { getFunctions, httpsCallable } from "firebase/functions";

export function parsePriceFromText(raw) {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/,/g, "").replace(/\s+/g, "").replace(/tsh$/i, "").replace(/tzs$/i, "");
  let multiplier = 1;
  if (s.endsWith("k")) { multiplier = 1000; s = s.slice(0, -1); }
  else if (s.endsWith("m")) { multiplier = 1000000; s = s.slice(0, -1); }
  const n = parseFloat(s);
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * multiplier);
}

function extractPrice(text) {
  const lower = text.toLowerCase();
  const patterns = [
    /(?:bei|price|@|kwa)\s*(\d[\d,.\s]*)\s*(k|m|elfu|laki)?/i,
    /(\d[\d,.\s]*)\s*(k|m)\b/i,
    /(\d[\d,.\s]*)\s*(?:tsh|tzs|shilingi|elfu)/i,
    /(?:chini ya|juu ya)\s*(\d[\d,.\s]*)\s*(k|m|elfu|laki)?/i,
  ];
  for (const re of patterns) {
    const m = lower.match(re);
    if (m) {
      let token = (m[1] || "").replace(/\s/g, "") + (m[2] || "");
      if (m[2] === "elfu" && m[1]) token = m[1] + "k";
      if (m[2] === "laki" && m[1]) token = String(parseFloat(m[1]) * 100) + "k";
      const p = parsePriceFromText(token);
      if (p) return p;
    }
  }
  return null;
}

function guessCategory(text) {
  const t = text.toLowerCase();
  if (/\b(iphone|samsung|laptop|phone|calculator|charger|earphone|tablet|electronics)\b/.test(t)) return "electronics";
  if (/\b(note|book|textbook|calculus|engineering notes|masomo)\b/.test(t)) return "notes";
  if (/\b(chair|table|bed|mattress|furniture|sofa)\b/.test(t)) return "furniture";
  if (/\b(shirt|dress|shoe|nike|clothes|hoodie|t-shirt)\b/.test(t)) return "clothing";
  return "other";
}

export function looksLikeCreateIntent(query) {
  const q = (query || "").trim().toLowerCase();
  if (q.length < 8) return false;
  return /\b(nauza|uza|kuuza|sell|selling|chapisha|post|listing|bei|tsh|elfu|collection|jamii|oda|event|graduation|t-shirt|kukusanya)\b/i.test(q);
}

export function shouldUseCreateAI(query) {
  const q = (query || "").trim();
  if (q.length < 12) return false;
  return looksLikeCreateIntent(q);
}

export function localParseCreate(query) {
  const raw = (query || "").trim();
  const lower = raw.toLowerCase();

  const isCollection = /\b(collection|jamii|community|class order|group order|event registration|graduation|t-shirt|contribution|kukusanya|oda ya)\b/i.test(lower);

  const price = extractPrice(raw);

  let location = null;
  const locMatch = raw.match(/(?:pale|pickup|location|karibu na|at|@)\s+([^,.\n]+)/i);
  if (locMatch) location = locMatch[1].trim();

  let communityName = null;
  const commMatch = raw.match(/(?:jamii|community|class|group)\s+([^,.\n]+)/i);
  if (commMatch) communityName = commMatch[1].trim();

  let title = raw
    .replace(/\b(nauza|nataka kuuza|sell|selling|chapisha|post|listing|collection)\b/gi, "")
    .replace(/(?:bei|price|@)\s*[\d,\s.kmelfu]+/gi, "")
    .replace(/\b(tsh|tzs|shilingi)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (title.length > 80) title = title.slice(0, 80).trim();

  return {
    type: isCollection ? "collection" : "listing",
    title: title || raw.slice(0, 60),
    description: raw,
    price,
    category: guessCategory(raw),
    location,
    communityName,
    collectionType: /\bevent\b/i.test(lower) ? "event" : "order",
    local: true,
  };
}

export async function parseCreateWithAI(app, query) {
  const functions = getFunctions(app);
  const fn = httpsCallable(functions, "kampasikaCreateAssist");
  const result = await fn({ query });
  return result.data;
}
