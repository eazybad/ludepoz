// ─── Kampasika Biz · Step 2: room applications ───
//
// Students apply for a room on Kampasika; the hostel operator reviews the
// application in Kampasika Biz. Everything goes through these functions so
// the operator, room and status can never be forged from the client.
//
//   bizSyncOperatorPublic   keeps bizPublic/{operatorId} in step with the
//                           operator doc: the small public record the student
//                           app reads to decide whether to show "Apply".
//   bizSubmitApplication    student applies for a room.
//   bizWithdrawApplication  student withdraws their own application.
//   bizDecideApplication    operator (or admin) shortlists / approves / rejects.
//
// Data:
//   bizPublic/{operatorId}        { businessName, area, nearUni, live, acceptingApplications }
//                                 Public read; written only here.
//   bizApplications/{appId}       one application. Readable by the student
//                                 and the operator; written only here.

const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");

const BIZ_ADMIN_UIDS = new Set(["LTrwUHH6utQJGiw4lcsKflzXvPR2"]);

const OPEN_STATUSES = ["submitted", "shortlisted"];
const DECISIONS = {
  shortlist: { from: ["submitted"], to: "shortlisted" },
  approve: { from: ["submitted", "shortlisted"], to: "approved" },
  reject: { from: ["submitted", "shortlisted", "approved"], to: "rejected" },
};
const DURATIONS = new Set(["semester", "academic_year", "monthly", "other"]);

const db = () => admin.firestore();
const FieldValue = () => admin.firestore.FieldValue;

function requireUid(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in first.");
  return uid;
}

function clean(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizePhone(rawPhone) {
  const compact = String(rawPhone || "").replace(/[\s-]/g, "").replace(/^\+/, "");
  if (/^0[67]\d{8}$/.test(compact)) return `255${compact.slice(1)}`;
  if (/^255[67]\d{8}$/.test(compact)) return compact;
  return "";
}

// Which operator a room belongs to: the property owner when the room sits
// under a property (staff may have listed it), otherwise whoever listed it.
async function operatorIdForRoom(room) {
  if (room.propertyId) {
    const propertySnap = await db().collection("properties").doc(room.propertyId).get();
    const ownerId = propertySnap.exists ? propertySnap.data()?.ownerId : "";
    if (ownerId) return { operatorId: ownerId, property: propertySnap.data() };
  }
  return { operatorId: room.userId || room.listedBy || "", property: null };
}

// A business is shown to students once Kampasika has approved its
// documents, as long as it isn't paused and hasn't switched applications off.
function publicRecordFor(operator) {
  if (!operator) return null;
  const approved = operator.review?.documents === "approved";
  const suspended = operator.status === "suspended";
  if (!approved || suspended) return null;
  return {
    businessName: operator.profile?.businessName || "",
    area: operator.profile?.area || "",
    region: operator.profile?.region || "",
    nearUni: operator.profile?.nearUni || "",
    live: operator.status === "live",
    acceptingApplications: operator.settings?.acceptingApplications !== false,
    // Whether students can pay rent online: "live", "test" (sandbox pilot) or "".
    onlinePayments: operator.status === "live" && operator.pawapay?.production?.connected
      ? "live"
      : operator.settings?.sandboxRent === true && operator.pawapay?.sandbox?.connected ? "test" : "",
  };
}

async function notify(userId, title, message, extra = {}) {
  if (!userId) return;
  await db().collection("notifications").add({
    userId,
    title,
    message,
    read: false,
    createdAt: FieldValue().serverTimestamp(),
    ...extra,
  }).catch(err => console.error("Biz notification failed", err.message));
}

exports.bizSyncOperatorPublic = onDocumentWritten("operators/{operatorId}", async (event) => {
  const operatorId = event.params.operatorId;
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  const record = publicRecordFor(after);
  const ref = db().collection("bizPublic").doc(operatorId);
  if (!record) {
    await ref.delete().catch(() => {});
    return;
  }
  const current = await ref.get();
  const same = current.exists && Object.keys(record).every(k => current.data()?.[k] === record[k]);
  if (!same) {
    await ref.set({ ...record, updatedAt: FieldValue().serverTimestamp() });
  }
});

exports.bizSubmitApplication = onCall(async (request) => {
  const uid = requireUid(request);
  const data = request.data || {};
  const roomId = clean(data.roomId, 128);
  if (!roomId) throw new HttpsError("invalid-argument", "Missing room.");

  const roomSnap = await db().collection("rooms").doc(roomId).get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "This room is no longer listed.");
  const room = roomSnap.data() || {};
  if (room.available === false) throw new HttpsError("failed-precondition", "This room has already been taken.");

  const { operatorId, property } = await operatorIdForRoom(room);
  if (!operatorId) throw new HttpsError("failed-precondition", "This room can't take online applications.");
  if (operatorId === uid) throw new HttpsError("failed-precondition", "You can't apply for your own room.");

  const publicSnap = await db().collection("bizPublic").doc(operatorId).get();
  const pub = publicSnap.exists ? publicSnap.data() : null;
  if (!pub || pub.acceptingApplications === false) {
    throw new HttpsError("failed-precondition", "This landlord isn't taking online applications right now.");
  }

  const applicant = {
    name: clean(data.name, 80),
    phone: normalizePhone(data.phone),
    university: clean(data.university, 80),
    course: clean(data.course, 80),
    yearOfStudy: clean(data.yearOfStudy, 20),
    regNumber: clean(data.regNumber, 40),
    moveInDate: clean(data.moveInDate, 10),
    duration: DURATIONS.has(data.duration) ? data.duration : "other",
    message: clean(data.message, 600),
  };
  if (applicant.name.length < 3) throw new HttpsError("invalid-argument", "Enter your full name.");
  if (!applicant.phone) throw new HttpsError("invalid-argument", "Enter a Tanzania mobile number, e.g. 0712 345 678.");
  if (!applicant.university) throw new HttpsError("invalid-argument", "Enter your university.");
  if (applicant.moveInDate && !/^\d{4}-\d{2}-\d{2}$/.test(applicant.moveInDate)) {
    throw new HttpsError("invalid-argument", "Choose a valid move-in date.");
  }

  // One open application per student per room. The deterministic id makes
  // the check race-free: two taps can't create two applications.
  const appId = `${roomId}_${uid}`;
  const appRef = db().collection("bizApplications").doc(appId);

  const result = await db().runTransaction(async tx => {
    const existing = await tx.get(appRef);
    if (existing.exists && OPEN_STATUSES.concat("approved").includes(existing.data()?.status)) {
      return { appId, status: existing.data().status, duplicate: true };
    }
    const now = FieldValue().serverTimestamp();
    tx.set(appRef, {
      operatorId,
      studentUid: uid,
      roomId,
      propertyId: room.propertyId || null,
      room: {
        roomType: room.roomType || "",
        roomNumber: room.roomNumber || "",
        price: Number(room.price) || 0,
        location: room.location || "",
        nearUni: room.nearUni || "",
        photoUrl: room.photoUrl || room.photos?.[0] || null,
        propertyName: property?.name || "",
      },
      businessName: pub.businessName || "",
      applicant,
      status: "submitted",
      history: [{ status: "submitted", by: uid, at: new Date().toISOString() }],
      decisionNote: "",
      createdAt: now,
      updatedAt: now,
    });
    return { appId, status: "submitted", duplicate: false };
  });

  if (!result.duplicate) {
    const where = [room.roomNumber ? `Room ${room.roomNumber}` : "", property?.name || room.location || ""].filter(Boolean).join(", ");
    await notify(
      operatorId,
      "Kampasika Biz · New application",
      `${applicant.name} applied for ${where || "one of your rooms"}.`,
      { type: "biz_application", applicationId: appId }
    );
  }
  return { success: true, ...result };
});

exports.bizWithdrawApplication = onCall(async (request) => {
  const uid = requireUid(request);
  const appId = clean(request.data?.applicationId, 200);
  const appRef = db().collection("bizApplications").doc(appId);
  const snap = await appRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Application not found.");
  const app = snap.data() || {};
  if (app.studentUid !== uid) throw new HttpsError("permission-denied", "This isn't your application.");
  if (!OPEN_STATUSES.concat("approved").includes(app.status)) {
    throw new HttpsError("failed-precondition", "This application is already closed.");
  }
  await appRef.update({
    status: "withdrawn",
    history: FieldValue().arrayUnion({ status: "withdrawn", by: uid, at: new Date().toISOString() }),
    updatedAt: FieldValue().serverTimestamp(),
  });
  await notify(app.operatorId, "Kampasika Biz", `${app.applicant?.name || "A student"} withdrew their application.`, {
    type: "biz_application", applicationId: appId,
  });
  return { success: true, status: "withdrawn" };
});

exports.bizDecideApplication = onCall(async (request) => {
  const uid = requireUid(request);
  const appId = clean(request.data?.applicationId, 200);
  const decision = clean(request.data?.decision, 20);
  const note = clean(request.data?.note, 500);
  const rule = DECISIONS[decision];
  if (!appId || !rule) throw new HttpsError("invalid-argument", "Missing application or decision.");

  const appRef = db().collection("bizApplications").doc(appId);
  const snap = await appRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Application not found.");
  const app = snap.data() || {};
  if (app.operatorId !== uid && !BIZ_ADMIN_UIDS.has(uid)) {
    throw new HttpsError("permission-denied", "This application belongs to another business.");
  }
  if (!rule.from.includes(app.status)) {
    throw new HttpsError("failed-precondition", `An application that is ${app.status} can't be moved to ${rule.to}.`);
  }

  await appRef.update({
    status: rule.to,
    decisionNote: note,
    decidedAt: FieldValue().serverTimestamp(),
    history: FieldValue().arrayUnion({ status: rule.to, by: uid, at: new Date().toISOString(), note }),
    updatedAt: FieldValue().serverTimestamp(),
  });

  const business = app.businessName || "The landlord";
  const messages = {
    shortlisted: `${business} shortlisted your room application. They may contact you soon.`,
    approved: `${business} approved your room application! They'll contact you about the lease and payment.`,
    rejected: `${business} couldn't offer you this room.${note ? ` ${note}` : ""}`,
  };
  await notify(app.studentUid, "Room application", messages[rule.to], { type: "biz_application", applicationId: appId });
  return { success: true, status: rule.to };
});

module.exports.publicRecordFor = publicRecordFor;
