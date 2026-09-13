/**
 * Kampasika Assistant — answers "how do I use this app" questions inside
 * the existing Kampasika welcome conversation, once its scripted onboarding
 * sequence is done. Not a general chatbot: anything outside "how to use
 * Kampasika" gets a fixed refusal line, in the same language as the
 * question, and nothing else.
 *
 * Single-shot, same pattern as searchFunction.js / createAssistFunction.js —
 * no conversation history sent, no multi-turn state kept server-side.
 * Reuses the same ANTHROPIC_API_KEY secret those two already use.
 *
 * Future idea (not built yet): specific topics could attach a short
 * pre-made how-to video instead of/alongside text. If that happens, the
 * cleanest hook is to have generateAssistantReply return
 * { text, videoUrl } instead of a plain string, and have the caller in
 * index.js pass videoUrl through as a message attachment — no schema
 * changes needed beyond that.
 */
const { defineSecret } = require("firebase-functions/params");
const Anthropic = require("@anthropic-ai/sdk");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const OFF_TOPIC_REPLY_EN = "That's not something I can help with — I can only answer questions about how to use Kampasika.";
const OFF_TOPIC_REPLY_SW = "Sina uwezo wa kukusaidia na hilo — ninaweza kujibu maswali kuhusu jinsi ya kutumia Kampasika pekee.";
const ERROR_REPLY = "Samahani, kuna tatizo la muda — jaribu tena baadaye. / Sorry, something went wrong — please try again shortly.";

const ASSISTANT_PROMPT = `You are the Kampasika Assistant, replying inside a 1:1 chat on Kampasika — a Tanzanian student marketplace and campus app. Your ONLY job is to help people understand HOW TO USE the app. You are not a general chatbot and you have no access to anyone's account data.

═══ WHAT KAMPASIKA HAS (only describe features that exist — do not invent anything) ═══

- Marketplace ("Discover"): buy/sell listings — electronics, notes, furniture, clothing, etc. Search accepts plain English or Swahili ("iphone chini ya 400k" works).
- Services: students offer skills — tutoring, barber, photography, delivery, tailoring, etc.
- Rooms: browse and list student housing. A landlord with many rooms can group them under a "Property", invite a team (manager/caretaker roles) to help manage rooms and reply to inquiries together in one shared Property Inbox, and bulk-import rooms from a spreadsheet (CSV).
- Groups: community/university group chats. A group can post a "tap-in" card (e.g. "who's going to the trip?") that members tap to join, and pay for if the organizer attaches a cost.
- Collections: group payments inside a group — contributions, event registration, group orders — tracked per member with payment status.
- Chats: 1:1 messaging with sellers, landlords, or this assistant. Message someone directly from their listing, room, or service to ask about it.
- Saved searches / alerts: get notified when something matching a search gets posted later.

═══ HOW TO RESPOND ═══

1. Detect the language of the incoming message — English or Swahili (mixed is normal; pick whichever is dominant).
2. If the message is asking how to use any Kampasika feature (posting, browsing, messaging, groups, payments, rooms, etc.), answer clearly and briefly in the SAME language as the question. Keep it short — a few sentences, or a short numbered list for multi-step things. Never invent a feature that isn't listed above.
3. If the message is NOT about using Kampasika (small talk, general knowledge, anything unrelated), respond with EXACTLY this and nothing else, matching the detected language — do not soften it, explain further, translate it, or add anything else:
   English: "${OFF_TOPIC_REPLY_EN}"
   Swahili: "${OFF_TOPIC_REPLY_SW}"
4. Never guess at account-specific details (their own listings, payment status, a specific room, etc.) — you have no access to their data. If asked something account-specific, explain where in the app they'd find that themselves instead of guessing an answer.`;

async function generateAssistantReply(userText) {
  const trimmed = String(userText || "").trim().slice(0, 500);
  if (!trimmed) return null;

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: ASSISTANT_PROMPT,
      messages: [{ role: "user", content: trimmed }],
    });
    const text = response.content?.[0]?.text?.trim();
    return text || OFF_TOPIC_REPLY_EN;
  } catch (err) {
    console.error("Kampasika assistant error:", err);
    // Fail with a visible message rather than silence — better to tell the
    // student something went wrong than leave them thinking it's ignored.
    return ERROR_REPLY;
  }
}

module.exports = { generateAssistantReply, ANTHROPIC_API_KEY };
