// ─── Private landlord contacts ───
// Rooms and properties are public (guests can browse them), so the
// landlord's phone number no longer lives on those documents. It is kept in
// contacts/{room_<id> | property_<id>} — readable only by its owner and the
// admin (firestore.rules). App.js writes new listings that way; this admin
// action moves numbers already stored on older rooms / properties. Safe to
// run more than once.

const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

const ADMIN_UIDS = new Set(["LTrwUHH6utQJGiw4lcsKflzXvPR2"]);

async function moveCollection(db, collectionName, kind, ownerField) {
  let moved = 0;
  let lastDoc = null;
  for (;;) {
    let q = db.collection(collectionName).orderBy(admin.firestore.FieldPath.documentId()).limit(200);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    let writes = 0;
    snap.docs.forEach(d => {
      const data = d.data() || {};
      if (!Object.prototype.hasOwnProperty.call(data, "landlordPhone")) return;
      const phone = String(data.landlordPhone || "").trim();
      if (phone) {
        batch.set(db.collection("contacts").doc(`${kind}_${d.id}`), {
          kind,
          refId: d.id,
          ownerId: data[ownerField] || data.userId || data.ownerId || null,
          landlordName: data.landlordName || "",
          landlordPhone: phone,
          movedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        writes += 1;
      }
      batch.update(d.ref, { landlordPhone: admin.firestore.FieldValue.delete() });
      writes += 1;
      moved += 1;
    });
    if (writes) await batch.commit();
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < 200) break;
  }
  return moved;
}

exports.adminMoveLandlordPhones = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid || !ADMIN_UIDS.has(uid)) throw new HttpsError("permission-denied", "Admins only.");
  const db = admin.firestore();
  const rooms = await moveCollection(db, "rooms", "room", "userId");
  const properties = await moveCollection(db, "properties", "property", "ownerId");
  return { success: true, rooms, properties };
});

// ─── Revealing a landlord's number on tap ───
// The room page shows WhatsApp / Call buttons, but the number itself stays
// private: only when a signed-in user taps one does the app ask for it here.
// Every tap is logged in contactTaps/ (admin-only) so the admin dashboard can
// count how many students reached a landlord.
const CHANNELS = new Set(["whatsapp", "call"]);

function normalizeTzPhone(raw) {
  const digits = String(raw || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("255")) return digits;
  if (digits.startsWith("0")) return "255" + digits.slice(1);
  if (digits.length === 9) return "255" + digits;
  return digits;
}

exports.getRoomContact = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to contact the landlord.");

  const roomId = String((request.data && request.data.roomId) || "").trim();
  const channel = String((request.data && request.data.channel) || "").trim();
  if (!roomId || roomId.includes("/")) throw new HttpsError("invalid-argument", "Missing room.");
  if (!CHANNELS.has(channel)) throw new HttpsError("invalid-argument", "Unknown contact channel.");

  const db = admin.firestore();
  const roomSnap = await db.collection("rooms").doc(roomId).get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "This room is no longer listed.");
  const room = roomSnap.data() || {};

  // Respect the admin switch that requires verified room users.
  const features = (await db.collection("system").doc("features").get()).data() || {};
  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.exists ? (userSnap.data() || {}) : {};
  if (features.requireRoomUserVerification === true && userData.roomUserVerified !== true && !ADMIN_UIDS.has(uid)) {
    throw new HttpsError("permission-denied", "Verify your account to contact landlords.");
  }

  // Room's own contact first, then its property's.
  let contact = null;
  const roomContact = await db.collection("contacts").doc(`room_${roomId}`).get();
  if (roomContact.exists && roomContact.data().landlordPhone) contact = roomContact.data();
  if (!contact && room.propertyId) {
    const propContact = await db.collection("contacts").doc(`property_${room.propertyId}`).get();
    if (propContact.exists && propContact.data().landlordPhone) contact = propContact.data();
  }
  const phone = normalizeTzPhone(contact && contact.landlordPhone);
  if (!phone) throw new HttpsError("not-found", "This landlord hasn't added a phone number.");

  const ownerId = room.userId || room.listedBy || (contact && contact.ownerId) || null;
  // Don't count landlords tapping their own rooms.
  if (uid !== ownerId) {
    await db.collection("contactTaps").add({
      roomId,
      propertyId: room.propertyId || null,
      roomTitle: [room.roomType || "Room", room.location || ""].filter(Boolean).join(" — "),
      roomLocation: room.location || "",
      nearUni: room.nearUni || "",
      ownerId,
      landlordName: (contact && contact.landlordName) || room.landlordName || room.listedByName || "",
      channel,
      userId: uid,
      userName: userData.name || userData.username || userData.displayName || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return { phone, landlordName: (contact && contact.landlordName) || room.landlordName || "" };
});
