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

function extractDeadline(text) {
  // Match dates like "15 Juni", "June 15", "15/06/2025", "2025-06-15"
  const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
    januari:1,februari:2,machi:3,aprili:4,mei:5,juni:6,julai:7,agosti:8,septemba:9,oktoba:10,novemba:11,desemba:12 };
  const now = new Date();
  const year = now.getFullYear();

  // ISO format
  let m = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (m) return m[1];

  // DD/MM/YYYY or DD-MM-YYYY
  m = text.match(/\b(\d{1,2})[-](\d{1,2})[-](\d{4})\b/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;

  // "15 Juni" or "Juni 15"
  m = text.match(/\b(\d{1,2})\s+([a-z]+)\b/i) || text.match(/\b([a-z]+)\s+(\d{1,2})\b/i);
  if (m) {
    const dayStr = m[1].match(/\d/) ? m[1] : m[2];
    const monStr = m[1].match(/\d/) ? m[2] : m[1];
    const mon = months[monStr.toLowerCase()];
    if (mon) {
      const day = parseInt(dayStr);
      return `${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }
  }
  return null;
}

function extractExpectedPeople(text) {
  const m = text.match(/\b(\d+)\s*(?:watu|people|persons|members|students|wanafunzi|wanachama)\b/i)
    || text.match(/\b(?:watu|people|students)\s*(\d+)\b/i)
    || text.match(/\btotal\s*(?:of\s*)?(\d+)\b/i)
    || text.match(/\b(\d+)\s*(?:spots?|slots?|nafasi)\b/i);
  return m ? parseInt(m[1]) : null;
}

function extractCommunityName(text) {
  const m = text.match(/\b(?:class|darasa|group|jamii|community|club|kanisa|church|hostel|year|batch)\s+([A-Za-z0-9\s]+?)(?:\s*,|\s*\.|$)/i)
    || text.match(/([A-Z][A-Za-z\s]+(?:Year|Class|Club|Community|Church|Association)[\s\d]*)/);
  return m ? m[1].trim() : null;
}

function extractCommunityType(text) {
  const t = text.toLowerCase();
  if (/\b(class|darasa|year|batch|students?|wanafunzi)\b/.test(t)) return "class";
  if (/\b(church|kanisa|parokia|msalaba|catholic|christian|islamic|mosque)\b/.test(t)) return "church";
  if (/\b(club|timu|team|association|society)\b/.test(t)) return "club";
  if (/\b(hostel|dormitory|nyumba|chumba)\b/.test(t)) return "hostel";
  if (/\b(freshers|wapya|newcomers)\b/.test(t)) return "freshers";
  return "other";
}

function extractCollectionType(text) {
  const t = text.toLowerCase();
  if (/\b(event|tiketi|ticket|usajili|registration|tamasha|sherehe|party|graduation|convocation)\b/.test(t)) return "event";
  if (/\b(mchango|contribution|donate|donation|fundraiser|msaada|support)\b/.test(t)) return "contribution";
  if (/\b(freshers|wapya)\b/.test(t)) return "freshers";
  // default for t-shirts, group orders etc
  return "order";
}

function extractOptions(text) {
  // sizes
  const sizeMatch = text.match(/\b(sizes?|ukubwa)[:\s]+([A-Za-z0-9,\s/]+)/i);
  if (sizeMatch) return sizeMatch[2].split(/[,/]/).map(s => s.trim()).filter(Boolean);
  if (/\b(XS|S|M|L|XL|XXL)\b/.test(text)) {
    return text.match(/\b(XS|S|M|L|XL|XXL)\b/g);
  }
  return [];
}

function extractPayment(text) {
  const networks = ["M-Pesa","Tigo Pesa","Airtel Money","Halopesa","Mpesa","Tigopesa"];
  let payNetwork = null;
  for (const n of networks) {
    if (text.toLowerCase().includes(n.toLowerCase())) { payNetwork = n; break; }
  }
  const numMatch = text.match(/\b(0[67]\d{8}|255[67]\d{8})\b/);
  const payNumber = numMatch ? numMatch[1] : null;
  // name after "jina" or after the number
  const nameMatch = text.match(/(?:jina|name|akaunti)[:\s]+([A-Za-z\s]+?)(?:\s*,|\s*\.|$)/i);
  const payName = nameMatch ? nameMatch[1].trim() : null;
  return { payNetwork, payNumber, payName };
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

  const isCollection = /\b(collection|jamii|community|class order|group order|event|graduation|t-shirt|kaptula|contribution|mchango|kukusanya|oda ya|usajili)\b/i.test(lower);

  const price = extractPrice(raw);
  const deadline = extractDeadline(raw);
  const expectedPeople = extractExpectedPeople(raw);
  const communityName = extractCommunityName(raw);
  const communityType = extractCommunityType(raw);
  const collectionType = extractCollectionType(raw);
  const options = extractOptions(raw);
  const { payNetwork, payNumber, payName } = extractPayment(raw);

  let location = null;
  const locMatch = raw.match(/(?:pale|pickup|location|karibu na|at|@)\s+([^,.\n]+)/i);
  if (locMatch) location = locMatch[1].trim();

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
    communityType,
    collectionType,
    expectedPeople,
    deadline,
    options: options.length > 0 ? options : undefined,
    payNumber,
    payNetwork,
    payName,
    local: true,
  };
}

export async function parseCreateWithAI(app, query) {
  const functions = getFunctions(app);
  const fn = httpsCallable(functions, "kampasikaCreateAssist");
  const result = await fn({ query });
  return result.data;
}