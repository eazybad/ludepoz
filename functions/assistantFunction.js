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
 * Video attachments: when the model decides a question comes from a
 * landlord / hostel owner or is about Kampasika Biz, it ends its reply with
 * the marker [[BIZ_VIDEO]]. generateAssistantReply strips the marker and
 * returns { text, videoUrl, linkUrl } so the caller in index.js can attach
 * the Kampasika Biz pitch video (public/media/kampasika-biz-pitch.mp4) to
 * the message. The model can never choose the URL itself — only whether
 * the one fixed video is attached.
 */
const { defineSecret } = require("firebase-functions/params");
const Anthropic = require("@anthropic-ai/sdk");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const OFF_TOPIC_REPLY_EN = "That's not something I can help with — I can only answer questions about how to use Kampasika.";
const OFF_TOPIC_REPLY_SW = "Sina uwezo wa kukusaidia na hilo — ninaweza kujibu maswali kuhusu jinsi ya kutumia Kampasika pekee.";
const ERROR_REPLY = "Samahani, kuna tatizo la muda — jaribu tena baadaye. / Sorry, something went wrong — please try again shortly.";

const SITE = "https://kampasika.org";
const BIZ_VIDEO_MARKER = "[[BIZ_VIDEO]]";
const BIZ_VIDEO_URL = `${SITE}/media/kampasika-biz-pitch.mp4`;
const BIZ_VIDEO_POSTER = `${SITE}/media/kampasika-biz-pitch.jpg`;
const BIZ_LINK_URL = `${SITE}/biz`;

// Questions that should always get the Biz video, whatever the model says —
// asking for "the video"/"demo", or clearly coming from a hostel owner.
// English + Swahili; matched on the student's own message.
const BIZ_VIDEO_REQUEST = /\b(video|vide?o|demo|pitch|kampasika\s*biz|biz)\b|landlord|hostel\s*owner|my\s+hostel|my\s+rooms?\b|tenants?|lease|rent\s+collect|collect\s+rent|mwenye\s+(nyumba|hosteli)|nina\s+hosteli|hosteli\s+yangu|vyumba\s+vyangu|wapangaji|mpangaji|mkataba|kukusanya\s+kodi|kodi\s+ya/i;

const VIDEO_ASK = /\b(video|demo|pitch)\b/i;
const BIZ_VIDEO_INTRO = "Hii hapa video fupi ya Kampasika Biz — jinsi mwanafunzi anavyoona chumba, anaomba, anasaini mkataba na kulipa kodi moja kwa moja kwenye akaunti yako, na unavyoona yote kwenye dashibodi. Anza hapa: kampasika.org/biz\n\nHere's a short Kampasika Biz video — how students find your room, apply, sign the lease and pay rent straight to your own account, and how you track it all on your dashboard. Start at kampasika.org/biz";

const ASSISTANT_PROMPT = `You are the Kampasika Assistant, replying inside a 1:1 chat on Kampasika — a Tanzanian student marketplace and campus app. Your ONLY job is to help people understand HOW TO USE the app. You are not a general chatbot and you have no access to anyone's account data.

═══ WHAT KAMPASIKA HAS (only describe features that exist — do not invent anything) ═══

- Marketplace ("Discover"): buy/sell listings — electronics, notes, furniture, clothing, etc. Search accepts plain English or Swahili ("iphone chini ya 400k" works).
- Services: students offer skills — tutoring, barber, photography, delivery, tailoring, etc.
- Rooms: browse and list student housing. A landlord with many rooms can group them under a "Property", invite a team (manager/caretaker roles) to help manage rooms and reply to inquiries together in one shared Property Inbox, and bulk-import rooms from a spreadsheet (CSV).
- Groups: community/university group chats. A group can post a "tap-in" card (e.g. "who's going to the trip?") that members tap to join, and pay for if the organizer attaches a cost.
- Collections: group payments inside a group — contributions, event registration, group orders — tracked per member with payment status.
- Chats: 1:1 messaging with sellers, landlords, or this assistant. Message someone directly from their listing, room, or service to ask about it.
- Saved searches / alerts: get notified when something matching a search gets posted later.
- Posting a listing, room, or service costs nothing, and browsing/searching and applying for rooms cost nothing either. The only fee: when a student signs a lease with a Kampasika Biz hostel, they pay Kampasika a small service fee, shown before signing and kept cheaper than a dalali (described below).
- Every listing's location is pinned exactly (a precise map point, not a vague area), so it's easy to walk straight to it, or get there quickly with a Bolt ride.
- Kampasika Biz (kampasika.org/biz, also linked from My Rooms / My Properties): the business side for hostel and student-housing owners (landlords, PBSA operators). It's free for owners, and owners receive 100% of the rent. When a student signs a lease through Kampasika, the STUDENT pays Kampasika a service fee (a small % of the lease rent with a cap so it stays cheaper than a dalali; the exact amount is shown on the lease before signing — never quote a number); the lease becomes active once it's paid. It has:
  • Setup: open in a minute — business name, contact, and the owner's own M-Pesa / Lipa / bank number that tenants pay into. No documents or approval needed to start. Optional: upload documents for a "Verified" badge; registered businesses can also switch on automatic online payments into their own account.
  • Applications: students tap "Omba · Apply" on the owner's rooms; the owner sees every application in one list, can call/WhatsApp the student, shortlist, approve or reject.
  • Leases: a standard lease in English and Kiswahili the owner can edit; the student reads it and signs in the app by typing their name; both sides can print / save it as PDF.
  • Rent: rent and deposit schedule created from the lease; students pay by mobile money (M-Pesa, Airtel Money, Mixx by Yas, HaloPesa); students pay the owner's own number and report it, and the owner confirms (or, where switched on, pay online straight into the owner's own account) — Kampasika never receives or holds rent. Owners can also record cash payments, see who is late, occupancy per property, download a payment statement, and students get automatic rent reminders.
  Kampasika Biz is new and open to any owner. Don't name payment companies, and don't promise timelines, fees charged by mobile networks, or any numbers/results.

═══ HOW TO RESPOND ═══

1. Detect the language of the incoming message — English or Swahili (mixed is normal; pick whichever is dominant).
2. If the message is asking how to use any Kampasika feature (posting, browsing, messaging, groups, payments, rooms, etc.), answer clearly and briefly in the SAME language as the question. Keep it short — a few sentences, or a short numbered list for multi-step things. Never invent a feature that isn't listed above.
3. When the question is about posting/listing something, browsing or searching, or finding a room's location, naturally work in that it's free and that locations are pinned exactly (walkable or a quick Bolt ride away) — these two points matter a lot for how people see the app, so don't leave them out when they're genuinely relevant. Don't force them into questions where they don't fit.
4. If the message is NOT about using Kampasika (small talk, general knowledge, anything unrelated), respond with EXACTLY this and nothing else, matching the detected language — do not soften it, explain further, translate it, or add anything else:
   English: "${OFF_TOPIC_REPLY_EN}"
   Swahili: "${OFF_TOPIC_REPLY_SW}"
5. If the person asks for the video / a demo, is a landlord / hostel or student-housing owner, or asks about Kampasika Biz, managing tenants, leases, collecting rent or getting their hostel listed, answer about Kampasika Biz (point them to kampasika.org/biz) and put the exact marker ${BIZ_VIDEO_MARKER} on its own at the very end of your reply — the app then attaches a short video showing the whole process automatically, right in this chat. So you CAN send the video: never say you can't send videos or that the video is somewhere else. Use the marker only in that case, at most once, and never in the off-topic reply.
6. Write plain text only — the chat does not render Markdown, so no **bold**, # headings or links in brackets.
7. Never guess at account-specific details (their own listings, payment status, a specific room, etc.) — you have no access to their data. If asked something account-specific, explain where in the app they'd find that themselves instead of guessing an answer.`;

// Returns null (nothing to answer) or { text, videoUrl?, videoPoster?, linkUrl? }.
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
    const raw = response.content?.[0]?.text?.trim();
    if (!raw) return { text: OFF_TOPIC_REPLY_EN };
    // (non-video replies also get Markdown bold stripped below)
    const isOffTopic = raw.includes(OFF_TOPIC_REPLY_EN) || raw.includes(OFF_TOPIC_REPLY_SW);
    const askedForVideo = VIDEO_ASK.test(trimmed);
    const wantsVideo = raw.includes(BIZ_VIDEO_MARKER) || askedForVideo || (!isOffTopic && BIZ_VIDEO_REQUEST.test(trimmed));
    // Asked straight for the video but the model filed it as off-topic:
    // send the video with a fixed intro instead of the refusal line.
    // Asked straight for the video: always the fixed intro, so the text can
    // never contradict the attachment ("I can't send videos…").
    const cleaned = raw.split(BIZ_VIDEO_MARKER).join("").replace(/\*\*(.+?)\*\*/g, "$1").trim();
    const text = askedForVideo ? BIZ_VIDEO_INTRO : (cleaned || OFF_TOPIC_REPLY_EN);
    if (!wantsVideo) return { text };
    return { text, videoUrl: BIZ_VIDEO_URL, videoPoster: BIZ_VIDEO_POSTER, linkUrl: BIZ_LINK_URL };
  } catch (err) {
    console.error("Kampasika assistant error:", err);
    // Fail with a visible message rather than silence — better to tell the
    // student something went wrong than leave them thinking it's ignored.
    return { text: ERROR_REPLY };
  }
}

module.exports = { generateAssistantReply, ANTHROPIC_API_KEY };