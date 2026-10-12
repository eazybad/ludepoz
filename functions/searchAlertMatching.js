// ─── "Notify me" search alerts, automated ───
// 1. notifyRoomSearchAlerts: when a room is posted, students whose saved
//    search (searchAlerts, kind "room") matches it get a notification, and
//    the alert is marked fulfilled. The poster is told their room is live
//    and how many students were waiting.
// 2. sendRoomDemandDigest: once a day, people who list rooms get ONE
//    summary of what students searched for and didn't find — never a ping
//    per search.
// Notifications are written to notifications/, which sendInAppNotificationPush
// (index.js) turns into a push.

const admin = require("firebase-admin");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");

const ALERT_MAX_AGE_DAYS = 60;
const PRICE_SLACK = 1.1; // a room up to 10% over budget still counts

const ROOM_TYPE_NAMES = {
  single: "Single room",
  master: "Master room",
  apartment: "Apartment",
};

// Words that say "I want a room" but don't describe which one.
const GENERIC_WORDS = new Set([
  "chumba", "vyumba", "room", "rooms", "nyumba", "house", "hostel", "hostels",
  "near", "karibu", "na", "ya", "wa", "la", "kwa", "in", "at", "around", "the",
  "a", "an", "for", "bei", "price", "cheap", "rahisi", "nafuu", "tsh", "sh",
  "kodi", "rent", "mwezi", "month", "per", "nataka", "natafuta", "want",
  "looking", "kupanga", "pango", "kupangisha", "to", "of", "and", "or",
  "chini", "under", "below", "less", "than",
]);

function filtersOf(alert) {
  const pf = alert.parsedFilters || {};
  return pf.filters || pf; // parsed search objects keep filters nested
}

function meaningfulWords(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9À-ɏ\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !GENERIC_WORDS.has(w) && !/^\d+k?$/.test(w));
}

function roomMatchesAlert(room, alert) {
  const f = filtersOf(alert) || {};
  const price = Number(room.price) || 0;
  let structured = false;

  if (f.maxPrice != null && Number(f.maxPrice) > 0) {
    structured = true;
    if (price > Number(f.maxPrice) * PRICE_SLACK) return false;
  }
  if (f.minPrice != null && Number(f.minPrice) > 0) {
    structured = true;
    if (price < Number(f.minPrice)) return false;
  }
  if (f.roomType) {
    structured = true;
    if (room.roomType !== f.roomType) return false;
  }
  if (Array.isArray(f.amenities) && f.amenities.length) {
    structured = true;
    const have = room.amenities || [];
    if (!f.amenities.every(a => have.includes(a))) return false;
  }

  const haystack = [
    room.location, room.description, room.nearUni,
    ROOM_TYPE_NAMES[room.roomType], room.roomType,
  ].filter(Boolean).join(" ").toLowerCase();

  if (f.location) {
    structured = true;
    if (!haystack.includes(String(f.location).toLowerCase())) return false;
  }

  // No structured filters: the search text itself has to say something this
  // room has (an area name, "master", "wifi"...). Otherwise every search
  // would match every room.
  const words = meaningfulWords(alert.query);
  if (!structured) {
    if (!words.length) return false;
    return words.some(w => haystack.includes(w));
  }
  return true;
}

function roomTitle(room) {
  return `${ROOM_TYPE_NAMES[room.roomType] || "Room"} — ${room.location || ""}`.trim();
}

function formatPrice(n) {
  return Number(n || 0).toLocaleString("en-US");
}

exports.notifyRoomSearchAlerts = onDocumentCreated("rooms/{roomId}", async (event) => {
  const room = event.data && event.data.data();
  if (!room) return null;
  const roomId = event.params.roomId;
  if (room.available === false) return null;

  const db = admin.firestore();
  const ts = admin.firestore.FieldValue.serverTimestamp;
  const cutoffMs = Date.now() - ALERT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  const snap = await db.collection("searchAlerts")
    .where("kind", "==", "room")
    .where("fulfilledAt", "==", null)
    .limit(500)
    .get();

  const ownerId = room.userId || room.listedBy || null;
  const notifiedUsers = new Set();
  const batch = db.batch();
  let writes = 0;

  for (const alertDoc of snap.docs) {
    const alert = alertDoc.data() || {};
    if (!alert.userId || alert.userId === ownerId) continue;
    const created = alert.createdAt && alert.createdAt.toMillis ? alert.createdAt.toMillis() : 0;
    if (created && created < cutoffMs) continue;
    if (!roomMatchesAlert(room, alert)) continue;

    if (!notifiedUsers.has(alert.userId)) {
      notifiedUsers.add(alert.userId);
      batch.set(db.collection("notifications").doc(), {
        userId: alert.userId,
        read: false,
        createdAt: ts(),
        type: "room_match",
        title: "Chumba ulichotafuta kimepatikana! 🏠",
        message: `${roomTitle(room)}, TSh ${formatPrice(room.price)}/mwezi. Gusa kuona picha.`,
        roomId,
        link: `/room/${roomId}`,
        searchAlertId: alertDoc.id,
      });
      writes += 1;
    }
    batch.update(alertDoc.ref, {
      fulfilledAt: ts(),
      notified: true,
      matchedRoomId: roomId,
      autoMatched: true,
    });
    writes += 1;
    if (writes >= 450) break; // stay under the 500-write batch limit
  }

  // Tell the poster their room is live (and who was waiting for it).
  if (ownerId) {
    const waiting = notifiedUsers.size;
    batch.set(db.collection("notifications").doc(), {
      userId: ownerId,
      read: false,
      createdAt: ts(),
      type: "room_live",
      title: "Chumba chako kiko hewani ✅",
      message: waiting > 0
        ? `${roomTitle(room)} is live. ${waiting} student${waiting === 1 ? " was" : "s were"} waiting for a room like this and just got notified.`
        : `${roomTitle(room)} is live on Kampasika. Share its link on WhatsApp to reach more students.`,
      roomId,
      link: `/room/${roomId}`,
    });
    writes += 1;
  }

  if (writes) await batch.commit();
  console.log(`Room ${roomId}: notified ${notifiedUsers.size} waiting student(s).`);
  return null;
});

exports.sendRoomDemandDigest = onSchedule(
  { schedule: "0 8 * * *", timeZone: "Africa/Dar_es_Salaam" },
  async () => {
    const db = admin.firestore();
    const ts = admin.firestore.FieldValue.serverTimestamp;
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);

    const alertSnap = await db.collection("searchAlerts")
      .where("kind", "==", "room")
      .where("fulfilledAt", "==", null)
      .limit(1000)
      .get();
    const fresh = alertSnap.docs
      .map(d => d.data() || {})
      .filter(a => a.createdAt && a.createdAt.toMillis && a.createdAt.toMillis() >= since.toMillis());
    if (!fresh.length) {
      console.log("Demand digest: no new unmet room searches.");
      return;
    }

    // Group by what students asked for: "Single room · Makongo · ≤ TSh 150,000".
    const groups = new Map();
    for (const a of fresh) {
      const f = filtersOf(a) || {};
      const parts = [];
      if (f.roomType) parts.push(ROOM_TYPE_NAMES[f.roomType] || f.roomType);
      if (f.location) parts.push(`near ${f.location}`);
      if (f.maxPrice) parts.push(`≤ TSh ${formatPrice(f.maxPrice)}`);
      const label = parts.length ? parts.join(" · ") : `"${String(a.query || "").slice(0, 40)}"`;
      groups.set(label, (groups.get(label) || 0) + 1);
    }
    const top = [...groups.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3);
    const total = fresh.length;
    const summary = top.map(([label, n]) => `${n}× ${label}`).join("; ");

    // Everyone who lists rooms: room posters and property owners/managers.
    const recipients = new Set();
    const roomSnap = await db.collection("rooms").select("userId").limit(2000).get();
    roomSnap.docs.forEach(d => { const u = d.get("userId"); if (u) recipients.add(u); });
    const propSnap = await db.collection("properties").select("ownerId").limit(1000).get();
    propSnap.docs.forEach(d => { const u = d.get("ownerId"); if (u) recipients.add(u); });
    if (!recipients.size) return;

    let batch = db.batch();
    let writes = 0;
    for (const uid of recipients) {
      batch.set(db.collection("notifications").doc(), {
        userId: uid,
        read: false,
        createdAt: ts(),
        type: "room_demand_digest",
        title: `Wanafunzi ${total} wanatafuta vyumba 🔎`,
        message: `In the last 24h students searched and found nothing: ${summary}. List a matching room and they'll be notified right away.`,
        link: "/?list=room",
      });
      writes += 1;
      if (writes === 450) { await batch.commit(); batch = db.batch(); writes = 0; }
    }
    if (writes) await batch.commit();
    await db.collection("system").doc("demandDigest").set({ lastSentAt: ts(), total, recipients: recipients.size }, { merge: true });
    console.log(`Demand digest: ${total} searches sent to ${recipients.size} lister(s).`);
  }
);

exports._roomMatchesAlert = roomMatchesAlert; // for tests
