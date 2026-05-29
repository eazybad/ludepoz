/**
 * Kampasika Create Assist — turns plain-language text into listing/collection draft fields.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const Anthropic = require("@anthropic-ai/sdk");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const CREATE_PROMPT = `You parse plain-language posts for Kampasika (Tanzanian student marketplace). Return ONE JSON object only — no markdown.

Schema:
{
  "type": "listing" | "collection",
  "title": "short title",
  "description": "full description",
  "price": number | null,
  "category": "notes" | "electronics" | "furniture" | "clothing" | "other" | null,
  "location": string | null,
  "communityName": string | null,
  "collectionType": "order" | "event" | "contribution" | null
}

Rules:
- Swahili/English/mixed input is normal.
- "nauza", "sell" → listing unless clearly a group order/event/collection.
- collection: class t-shirts, field trip money, event registration, jamii orders.
- Parse prices: 25k=25000, elfu 15=15000, laki 2=200000.
- Extract pickup location if mentioned (pale X, karibu na X).
- communityName for collections when a group/class/church is named.`;

exports.kampasikaCreateAssist = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    region: "us-central1",
    cors: true,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Please sign in.");
    }
    const { query } = request.data || {};
    if (!query || typeof query !== "string" || !query.trim()) {
      throw new HttpsError("invalid-argument", "Describe what you want to post.");
    }
    const trimmed = query.trim().slice(0, 500);

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    let response;
    try {
      response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: CREATE_PROMPT,
        messages: [{ role: "user", content: trimmed }],
      });
    } catch (err) {
      console.error("Create assist error:", err);
      throw new HttpsError("internal", "Could not parse — try simpler words.");
    }

    const text = response.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new HttpsError("internal", "Invalid AI response");
    }
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new HttpsError("internal", "Could not read AI response");
    }
  }
);
