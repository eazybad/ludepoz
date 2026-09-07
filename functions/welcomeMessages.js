/**
 * Kampasika Welcome Chat — wording lives here.
 *
 * This is a real 1-on-1 conversation, sent to every new user from the
 * "Kampasika" official account (KAMPASIKA_OFFICIAL_UID in index.js) the
 * moment their account is created — same as getting a welcome DM from
 * WhatsApp itself. To change what it says, edit the arrays below.
 *
 * Flow:
 *   1. LANGUAGE_PROMPT is sent immediately after signup.
 *   2. The new user replies in the chat (e.g. types "English" or "Swahili").
 *   3. index.js's onKampasikaWelcomeReply function reads that reply,
 *      matches it against LANGUAGE_MATCHERS below, and sends every message
 *      in WELCOME_MESSAGES_EN or WELCOME_MESSAGES_SW in sequence.
 *
 * Each array entry is sent as its own separate chat bubble (matches how a
 * real person or bot sending several short messages in a row looks in chat),
 * not one long wall of text. Keep entries short for that reason.
 *
 * The Rooms message only gets sent if Rooms is currently switched on
 * (checked live against system/features in index.js) — so this never
 * promises a feature that isn't actually available yet.
 */

const LANGUAGE_PROMPT =
  "Welcome to Kampasika \ud83c\udf89\nKaribu Kampasika!\n\nWhich language do you prefer? Reply with \"English\" or \"Swahili\".\nUnapendelea lugha gani? Jibu na \"English\" au \"Swahili\".";

const LANGUAGE_MATCHERS = {
  en: /english|inglish|eng\b/i,
  sw: /swahili|kiswahili|sw\b/i,
};

const WELCOME_MESSAGES_EN = [
  "Welcome to Kampasika \ud83d\udc4b",
  "Kampasika helps your class, club, or community organize together \u2014 chat, collect money, and keep track of who's paid, all in one place.",
  "\ud83d\udcac Groups\nJoin or create a group for your class, church, chama, or any community. Everyone chats, coordinates, and keeps files in one shared space.",
  "\ud83d\udcb0 Collections\nNeed to collect money for a trip, event, or contribution? Create a Collection, share the invite, and everyone can see the goal and who's paid \u2014 no more chasing people in a WhatsApp group.",
  "\u26a1 Quick pay in chat\nNo need to leave the conversation \u2014 just type \"pay 1000 for Trip Fund\" right in chat, and Kampasika finds the right collection for you.",
  "\ud83d\udcf1 Two ways to pay\n\"Pay in-app\" sends and confirms your payment automatically. \"Pay directly\" dials your mobile money code for you and lets you confirm once you've sent it \u2014 pick whichever works for you.",
  "\u2705 Get verified\nVerify your Student ID to build trust with your groups and unlock more features.",
  "That's it \u2014 you're ready to go. Open a group or start one, and Kampasika will handle the coordinating. \ud83d\ude80",
];

const WELCOME_MESSAGES_EN_ROOMS =
  "\ud83c\udfe0 Rooms\nLooking for a place to stay? Browse verified rooms and landlords near campus, right inside Kampasika.";

const WELCOME_MESSAGES_SW = [
  "Karibu Kampasika \ud83d\udc4b",
  "Kampasika inasaidia darasa lako, klabu, au jamii yako kushirikiana kwa urahisi \u2014 mazungumzo, kukusanya pesa, na kufuatilia nani amelipa, yote mahali pamoja.",
  "\ud83d\udcac Vikundi\nJiunge au unda kikundi kwa ajili ya darasa lako, kanisa, chama, au jamii yoyote. Kila mtu anaweza kuzungumza, kupanga, na kuweka faili mahali pamoja.",
  "\ud83d\udcb0 Michango\nUnahitaji kukusanya pesa kwa ajili ya safari, tukio, au mchango? Tengeneza Mchango, shiriki mwaliko, na kila mtu ataona lengo na nani ameshalipa \u2014 hakuna tena kufuatilia watu kwenye kikundi cha WhatsApp.",
  "\u26a1 Lipa haraka kwenye mazungumzo\nHuhitaji kutoka kwenye mazungumzo \u2014 andika tu \"pay 1000 for Trip Fund\" moja kwa moja kwenye chat, na Kampasika itatambua mchango unaomaanisha.",
  "\ud83d\udcf1 Njia mbili za kulipa\n\"Lipa ndani ya app\" inatuma na kuthibitisha malipo yako moja kwa moja. \"Lipa moja kwa moja\" inapiga simu ya mtandao wako wa pesa na kukuruhusu kuthibitisha ukishatuma \u2014 chagua inayokufaa.",
  "\u2705 Thibitisha akaunti yako\nThibitisha kitambulisho chako cha mwanafunzi ili kuongeza uaminifu kwenye vikundi vyako na kufungua vipengele zaidi.",
  "Hayo ndiyo yote \u2014 uko tayari. Fungua kikundi au anzisha kimoja, na Kampasika itashughulikia upangaji. \ud83d\ude80",
];

const WELCOME_MESSAGES_SW_ROOMS =
  "\ud83c\udfe0 Vyumba\nUnatafuta sehemu ya kuishi? Angalia vyumba na wenye nyumba waliohakikiwa karibu na chuo, ndani ya Kampasika.";

const UNRECOGNIZED_LANGUAGE_REPLY =
  "Sorry, I didn't catch that \u2014 please reply with \"English\" or \"Swahili\".\nSamahani, sijaelewa \u2014 tafadhali jibu na \"English\" au \"Swahili\".";

module.exports = {
  LANGUAGE_PROMPT,
  LANGUAGE_MATCHERS,
  WELCOME_MESSAGES_EN,
  WELCOME_MESSAGES_EN_ROOMS,
  WELCOME_MESSAGES_SW,
  WELCOME_MESSAGES_SW_ROOMS,
  UNRECOGNIZED_LANGUAGE_REPLY,
};
