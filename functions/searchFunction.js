/**
 * Kampasika AI Search — Firebase Function
 *
 * Takes a natural-language search query (Swahili, English, or mixed) and
 * returns structured filters the frontend can plug straight into Firestore queries.
 *
 * This is NOT a chat. It's a single-shot query parser. ~200-300ms, ~$0.0005 per call.
 *
 * ─── SETUP ───
 *   Already set up? If you did the collections version, this drops into the same
 *   functions/ folder. Just append this export to your existing index.js.
 *   Otherwise: follow DEPLOYMENT.md.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");

// If this is a fresh functions project, uncomment:
// admin.initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// ─── SYSTEM PROMPT ───
// Notice: NO small talk, NO reply text, just JSON extraction. This is a parser,
// not a chatbot. That's how we keep it fast and cheap.
const SEARCH_PROMPT = `You are a search query parser for Kampasika, a Tanzanian student marketplace. Your ONLY job is to convert natural-language queries (Swahili, English, or mixed) into structured search filters.

You receive a query. You return ONE JSON object. No explanation, no markdown, no code fences.

═══ OUTPUT SCHEMA ═══

{
  "intent": "listing" | "service" | "room" | "collection" | "any",
  "keywords": ["string", "string"],
  "filters": {
    "maxPrice": number | null,
    "minPrice": number | null,
    "category": string | null,
    "serviceCategory": string | null,
    "roomType": string | null,
    "amenities": [string],
    "location": string | null,
    "sizeOrOption": string | null
  },
  "rewritten": "clean English summary of what they're looking for"
}

═══ INTENT DETECTION ═══

- "listing" — physical goods (phones, books, furniture, clothes, electronics)
- "service" — people offering skills (tutoring, barber, photography, delivery, tailoring)
- "room" — housing (room, master, apartment, nyumba, chumba, hostel)
- "collection" — group orders (t-shirt za class, field trip, contribution, kukusanya)
- "any" — unclear which category, search across all

═══ VALID VALUES ═══

category (for intent=listing): "notes" | "electronics" | "furniture" | "clothing" | "other"
serviceCategory (for intent=service): "personal_care" | "creative" | "clothing_brand" | "food" | "delivery" | "other_service"
roomType (for intent=room): "single" | "master" | "apartment"
amenities (for intent=room): any of ["electricity", "water", "wifi", "toilet_inside", "toilet_shared", "furnished", "parking", "security"]

═══ PRICE PARSING ═══

Tanzania shilling price shorthand:
- "15k" or "15K" = 15000
- "400k" = 400000
- "1.5M" or "milioni 1.5" = 1500000
- "elfu 15" or "15 elfu" = 15000
- "laki 4" = 400000 (1 laki = 100,000)
- "chini ya X" / "under X" / "below X" → maxPrice: X
- "juu ya X" / "above X" / "over X" → minPrice: X
- "kati ya X na Y" / "between X and Y" → minPrice: X, maxPrice: Y
- Plain number without context → treat as max price in keywords, NOT maxPrice filter (ambiguous)

═══ LOCATION PARSING ═══

Extract location phrases like "karibu na ARU", "near campus", "Mlimani", "Kijitonyama" into the location field as-is. DO NOT guess if unclear.

═══ KEYWORDS ═══

Put the CORE nouns/brands into keywords — what they're actually looking for. Strip filler words ("nataka", "looking for", "chini ya", prices, locations). Keep brand names, model numbers, colors, sizes as keywords.

═══ EXAMPLES ═══

Query: "iphone 11 chini ya 400k"
Output: {"intent":"listing","keywords":["iphone","11"],"filters":{"maxPrice":400000,"minPrice":null,"category":"electronics","serviceCategory":null,"roomType":null,"amenities":[],"location":null,"sizeOrOption":null},"rewritten":"iPhone 11 under 400,000 TSh"}

Query: "calculator ya engineering chini ya 30k"
Output: {"intent":"listing","keywords":["calculator","engineering"],"filters":{"maxPrice":30000,"minPrice":null,"category":"electronics","serviceCategory":null,"roomType":null,"amenities":[],"location":null,"sizeOrOption":null},"rewritten":"engineering calculator under 30,000 TSh"}

Query: "chumba cha master karibu na ARU na wifi"
Output: {"intent":"room","keywords":[],"filters":{"maxPrice":null,"minPrice":null,"category":null,"serviceCategory":null,"roomType":"master","amenities":["wifi"],"location":"near ARU","sizeOrOption":null},"rewritten":"master room near ARU with WiFi"}

Query: "tutor wa math"
Output: {"intent":"service","keywords":["math","tutor"],"filters":{"maxPrice":null,"minPrice":null,"category":null,"serviceCategory":"other_service","roomType":null,"amenities":[],"location":null,"sizeOrOption":null},"rewritten":"math tutor"}

Query: "barber Kijitonyama"
Output: {"intent":"service","keywords":["barber"],"filters":{"maxPrice":null,"minPrice":null,"category":null,"serviceCategory":"personal_care","roomType":null,"amenities":[],"location":"Kijitonyama","sizeOrOption":null},"rewritten":"barber in Kijitonyama"}

Query: "notes za calculus 1"
Output: {"intent":"listing","keywords":["calculus","1","notes"],"filters":{"maxPrice":null,"minPrice":null,"category":"notes","serviceCategory":null,"roomType":null,"amenities":[],"location":null,"sizeOrOption":null},"rewritten":"Calculus 1 notes"}

Query: "graduation t-shirt collection"
Output: {"intent":"collection","keywords":["graduation","t-shirt"],"filters":{"maxPrice":null,"minPrice":null,"category":null,"serviceCategory":null,"roomType":null,"amenities":[],"location":null,"sizeOrOption":null},"rewritten":"graduation t-shirt collection"}

Query: "samsung"
Output: {"intent":"listing","keywords":["samsung"],"filters":{"maxPrice":null,"minPrice":null,"category":"electronics","serviceCategory":null,"roomType":null,"amenities":[],"location":null,"sizeOrOption":null},"rewritten":"Samsung"}

Query: "kitu cha kupikia"
Output: {"intent":"listing","keywords":["kupikia","cooker","hotplate"],"filters":{"maxPrice":null,"minPrice":null,"category":null,"serviceCategory":null,"roomType":null,"amenities":[],"location":null,"sizeOrOption":null},"rewritten":"cooking equipment"}

Remember: ONE JSON object. No text before or after. No markdown. No code fences.`;

// ─── THE CALLABLE FUNCTION ───
exports.kampasikaSearch = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    region: "us-central1",
    cors: true,
    maxInstances: 20,
  },
  async (request) => {
    // Auth required
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Please sign in to search.");
    }

    const { query } = request.data || {};
    if (!query || typeof query !== "string" || !query.trim()) {
      throw new HttpsError("invalid-argument", "Query required.");
    }

    const trimmed = query.trim().slice(0, 200); // Cap length — protects against abuse

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    let response;
    try {
      response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400, // Parser output is small — cap tight for speed
        system: SEARCH_PROMPT,
        messages: [{ role: "user", content: trimmed }],
      });
    } catch (err) {
      console.error("Claude search error:", err);
      // Graceful fallback: return the query as plain keywords
      return {
        intent: "any",
        keywords: trimmed.toLowerCase().split(/\s+/).filter(Boolean),
        filters: {
          maxPrice: null, minPrice: null, category: null,
          serviceCategory: null, roomType: null, amenities: [],
          location: null, sizeOrOption: null,
        },
        rewritten: trimmed,
        fallback: true,
      };
    }

    const raw = response.content[0]?.text || "";
    let parsed;
    try {
      const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Parse fail:", raw);
      return {
        intent: "any",
        keywords: trimmed.toLowerCase().split(/\s+/).filter(Boolean),
        filters: {
          maxPrice: null, minPrice: null, category: null,
          serviceCategory: null, roomType: null, amenities: [],
          location: null, sizeOrOption: null,
        },
        rewritten: trimmed,
        fallback: true,
      };
    }

    // Defensive defaults
    parsed.intent = parsed.intent || "any";
    parsed.keywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    parsed.filters = parsed.filters || {};
    parsed.filters.amenities = Array.isArray(parsed.filters.amenities) ? parsed.filters.amenities : [];
    parsed.rewritten = parsed.rewritten || trimmed;

    return parsed;
  }
);
