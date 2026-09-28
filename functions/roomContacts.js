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
