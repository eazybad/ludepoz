// ─── Kampasika Biz · Step 3: leases ───
//
// An operator turns an APPROVED application into a lease: they send their
// (editable) lease clauses plus this student's terms; the server fills in the
// facts it trusts (business, student, room) and freezes the result. The
// student reads it at /biz/lease/<id> and signs by typing their name. The
// signature records exactly which version they saw (contentHash), when, and
// from which device — the simple "in-app acceptance" model. A drawn
// signature can be added on top later without changing this data.
//
//   bizCreateLease   operator issues a lease for an approved application
//   bizSignLease     student signs (typed name + content hash)
//   bizDeclineLease  student declines (optional reason)
//   bizCancelLease   operator withdraws a lease that isn't signed yet
//
// Data: bizLeases/{leaseId}; the application gets a small mirror
// (application.lease = { id, status }) so the student app can show it.

const admin = require("firebase-admin");
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { createChargesForLease } = require("./bizRent");

const BIZ_ADMIN_UIDS = new Set(["LTrwUHH6utQJGiw4lcsKflzXvPR2"]);
const RENT_PERIODS = new Set(["month", "semester", "year"]);
const LANGS = new Set(["en", "sw"]);
const MAX_CLAUSES = 30;

const db = () => admin.firestore();
const FieldValue = () => admin.firestore.FieldValue;

const PERIOD_LABELS = {
  en: { month: "month", semester: "semester", year: "year" },
  sw: { month: "mwezi", semester: "semester", year: "mwaka" },
};
const ROOM_TYPE_LABELS = {
  en: { single: "Single room", master: "Master room", apartment: "Apartment" },
  sw: { single: "Chumba kimoja", master: "Chumba cha master", apartment: "Nyumba" },
};

function requireUid(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in first.");
  return uid;
}

function clean(value, max) {
  return String(value ?? "").replace(/[ \t]+/g, " ").trim().slice(0, max);
}

function cleanMultiline(value, max) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

function intInRange(value, min, max, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpsError("invalid-argument", `${label} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}

function isoDate(value, label) {
  const s = clean(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())) {
    throw new HttpsError("invalid-argument", `Choose a valid ${label}.`);
  }
  return s;
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function formatDate(iso, lang) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// Same placeholders the editor offers (src/biz/bizLeaseTemplate.js).
function renderText(text, values) {
  return String(text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}

function hashContent(content) {
  return crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

function leaseReference(leaseId, date = new Date()) {
  return `KPL-${date.getUTCFullYear()}-${leaseId.slice(0, 6).toUpperCase()}`;
}

async function notify(userId, title, message, extra = {}) {
  if (!userId) return;
  await db().collection("notifications").add({
    userId, title, message, read: false, createdAt: FieldValue().serverTimestamp(), ...extra,
  }).catch(err => console.error("Biz notification failed", err.message));
}

async function loadLeaseFor(uid, leaseId, role) {
  const ref = db().collection("bizLeases").doc(clean(leaseId, 128));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Lease not found.");
  const lease = snap.data() || {};
  const allowed = role === "student"
    ? lease.studentUid === uid
    : lease.operatorId === uid || BIZ_ADMIN_UIDS.has(uid);
  if (!allowed) throw new HttpsError("permission-denied", "This lease belongs to someone else.");
  return { ref, lease };
}

function mirrorOnApplication(applicationId, leaseId, status) {
  if (!applicationId) return Promise.resolve();
  return db().collection("bizApplications").doc(applicationId).update({
    lease: { id: leaseId, status },
    updatedAt: FieldValue().serverTimestamp(),
  }).catch(err => console.error("Could not mirror lease on application", applicationId, err.message));
}

exports.bizCreateLease = onCall(async (request) => {
  const uid = requireUid(request);
  const data = request.data || {};
  const applicationId = clean(data.applicationId, 200);
  const appRef = db().collection("bizApplications").doc(applicationId);
  const appSnap = await appRef.get();
  if (!appSnap.exists) throw new HttpsError("not-found", "Application not found.");
  const app = appSnap.data() || {};
  if (app.operatorId !== uid && !BIZ_ADMIN_UIDS.has(uid)) {
    throw new HttpsError("permission-denied", "This application belongs to another business.");
  }
  if (app.status !== "approved") throw new HttpsError("failed-precondition", "Approve the application before creating a lease.");
  if (app.lease && ["sent", "signed"].includes(app.lease.status)) {
    throw new HttpsError("failed-precondition", "This student already has an active lease. Cancel it first to issue a new one.");
  }

  const operatorSnap = await db().collection("operators").doc(app.operatorId).get();
  const operator = operatorSnap.data() || {};

  // Terms for this student.
  const t = data.terms || {};
  const language = LANGS.has(t.language) ? t.language : "en";
  const rentPeriod = RENT_PERIODS.has(t.rentPeriod) ? t.rentPeriod : "month";
  const terms = {
    language,
    rent: intInRange(t.rent, 1000, 100000000, "Rent"),
    rentPeriod,
    deposit: intInRange(t.deposit ?? 0, 0, 100000000, "Deposit"),
    startDate: isoDate(t.startDate, "start date"),
    endDate: isoDate(t.endDate, "end date"),
    dueDay: intInRange(t.dueDay ?? 5, 1, 28, "Due day"),
    noticeDays: intInRange(t.noticeDays ?? 30, 0, 365, "Notice period"),
    utilities: clean(t.utilities, 300),
    extraTerms: cleanMultiline(t.extraTerms, 2000),
  };
  if (terms.endDate <= terms.startDate) throw new HttpsError("invalid-argument", "The end date must be after the start date.");

  // Clauses come from the operator's own template — it's their lease.
  const rawClauses = Array.isArray(data.clauses) ? data.clauses.slice(0, MAX_CLAUSES) : [];
  const clauses = rawClauses
    .map(c => ({ title: clean(c?.title, 120), body: cleanMultiline(c?.body, 4000) }))
    .filter(c => c.title || c.body);
  if (clauses.length === 0) throw new HttpsError("invalid-argument", "The lease has no clauses.");

  // Facts the server fills in itself.
  const room = app.room || {};
  const roomType = ROOM_TYPE_LABELS[language][room.roomType] || room.roomType || (language === "sw" ? "Chumba" : "Room");
  const roomLabel = [room.roomNumber ? `${language === "sw" ? "Chumba namba" : "Room"} ${room.roomNumber}` : "", roomType, room.propertyName].filter(Boolean).join(", ");
  const parties = {
    landlord: {
      businessName: operator.profile?.businessName || app.businessName || "",
      contactName: operator.profile?.contactName || "",
      contactPhone: operator.profile?.contactPhone || "",
      tin: operator.profile?.tin || "",
      brelaNumber: operator.profile?.brelaNumber || "",
    },
    tenant: {
      name: app.applicant?.name || "",
      phone: app.applicant?.phone || "",
      university: app.applicant?.university || "",
      regNumber: app.applicant?.regNumber || "",
    },
  };
  const values = {
    businessName: parties.landlord.businessName,
    landlordContact: parties.landlord.contactName,
    studentName: parties.tenant.name,
    university: parties.tenant.university,
    regNumber: parties.tenant.regNumber || "—",
    roomLabel,
    location: room.location || room.propertyName || "",
    rent: formatMoney(terms.rent),
    rentPeriod: PERIOD_LABELS[language][rentPeriod],
    deposit: formatMoney(terms.deposit),
    startDate: formatDate(terms.startDate, language),
    endDate: formatDate(terms.endDate, language),
    dueDay: String(terms.dueDay),
    noticeDays: String(terms.noticeDays),
    utilities: terms.utilities || (language === "sw" ? "yamejumuishwa kwenye kodi" : "included in the rent"),
    extraTerms: terms.extraTerms || (language === "sw" ? "Hakuna." : "None."),
  };
  const rendered = clauses.map(c => ({ title: renderText(c.title, values), body: renderText(c.body, values) }));

  const leaseRef = db().collection("bizLeases").doc();
  const reference = leaseReference(leaseRef.id);
  const content = { reference, language, parties, room: { ...room, label: roomLabel }, terms, clauses: rendered };
  const contentHash = hashContent(content);

  await leaseRef.set({
    ...content,
    operatorId: app.operatorId,
    studentUid: app.studentUid,
    applicationId,
    roomId: app.roomId || null,
    propertyId: app.propertyId || null,
    contentHash,
    status: "sent",
    signatures: {
      landlord: { uid, name: parties.landlord.contactName || parties.landlord.businessName, issuedAt: new Date().toISOString() },
    },
    history: [{ status: "sent", by: uid, at: new Date().toISOString() }],
    createdAt: FieldValue().serverTimestamp(),
    updatedAt: FieldValue().serverTimestamp(),
  });
  await mirrorOnApplication(applicationId, leaseRef.id, "sent");
  await notify(app.studentUid, "Lease ready to sign",
    `${parties.landlord.businessName || "Your landlord"} sent you a lease for ${roomLabel}. Open Kampasika to read and sign it.`,
    { type: "biz_lease", leaseId: leaseRef.id, link: `/biz/lease/${leaseRef.id}` });

  return { success: true, leaseId: leaseRef.id, reference };
});

exports.bizSignLease = onCall(async (request) => {
  const uid = requireUid(request);
  const { ref, lease } = await loadLeaseFor(uid, request.data?.leaseId, "student");
  if (lease.status !== "sent") throw new HttpsError("failed-precondition", `This lease is ${lease.status} and can't be signed.`);

  const seenHash = clean(request.data?.contentHash, 128);
  if (seenHash !== lease.contentHash) {
    throw new HttpsError("failed-precondition", "The lease changed while you were reading it. Please reload and read it again.");
  }
  const typedName = clean(request.data?.typedName, 80);
  if (typedName.length < 3) throw new HttpsError("invalid-argument", "Type your full name to sign.");
  if (request.data?.agreed !== true) throw new HttpsError("invalid-argument", "Tick the box to confirm you agree.");

  const raw = request.rawRequest || {};
  const forwarded = String(raw.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const signature = {
    uid,
    typedName,
    method: "typed_name",
    contentHash: lease.contentHash,
    signedAt: new Date().toISOString(),
    ip: forwarded || raw.ip || "",
    userAgent: String(raw.headers?.["user-agent"] || "").slice(0, 300),
  };

  await ref.update({
    status: "signed",
    "signatures.tenant": signature,
    signedAt: FieldValue().serverTimestamp(),
    history: FieldValue().arrayUnion({ status: "signed", by: uid, at: signature.signedAt }),
    updatedAt: FieldValue().serverTimestamp(),
  });
  await mirrorOnApplication(lease.applicationId, ref.id, "signed");

  // Step 4: the lease's rent schedule becomes charges, and the room stops
  // showing as available on Kampasika (the operator can relist it).
  const chargeCount = await createChargesForLease(ref.id, { ...lease, status: "signed" }).catch(err => {
    console.error("Could not create rent charges", ref.id, err);
    return 0;
  });
  if (lease.roomId) {
    await db().collection("rooms").doc(lease.roomId).update({ available: false, occupiedByLeaseId: ref.id }).catch(() => {});
  }
  await ref.update({ chargeCount }).catch(() => {});

  await notify(lease.operatorId, "Kampasika Biz · Lease signed",
    `${lease.parties?.tenant?.name || "The student"} signed lease ${lease.reference}.`,
    { type: "biz_lease", leaseId: ref.id, link: `/biz/lease/${ref.id}` });
  return { success: true, status: "signed" };
});

exports.bizDeclineLease = onCall(async (request) => {
  const uid = requireUid(request);
  const { ref, lease } = await loadLeaseFor(uid, request.data?.leaseId, "student");
  if (lease.status !== "sent") throw new HttpsError("failed-precondition", `This lease is ${lease.status}.`);
  const reason = clean(request.data?.reason, 500);
  await ref.update({
    status: "declined",
    declineReason: reason,
    history: FieldValue().arrayUnion({ status: "declined", by: uid, at: new Date().toISOString(), note: reason }),
    updatedAt: FieldValue().serverTimestamp(),
  });
  await mirrorOnApplication(lease.applicationId, ref.id, "declined");
  await notify(lease.operatorId, "Kampasika Biz · Lease declined",
    `${lease.parties?.tenant?.name || "The student"} declined lease ${lease.reference}.${reason ? ` “${reason}”` : ""}`,
    { type: "biz_lease", leaseId: ref.id, link: `/biz/lease/${ref.id}` });
  return { success: true, status: "declined" };
});

exports.bizCancelLease = onCall(async (request) => {
  const uid = requireUid(request);
  const { ref, lease } = await loadLeaseFor(uid, request.data?.leaseId, "operator");
  if (lease.status !== "sent") throw new HttpsError("failed-precondition", "Only a lease that hasn't been signed yet can be cancelled.");
  const reason = clean(request.data?.reason, 500);
  await ref.update({
    status: "cancelled",
    cancelReason: reason,
    history: FieldValue().arrayUnion({ status: "cancelled", by: uid, at: new Date().toISOString(), note: reason }),
    updatedAt: FieldValue().serverTimestamp(),
  });
  await mirrorOnApplication(lease.applicationId, ref.id, "cancelled");
  await notify(lease.studentUid, "Lease withdrawn",
    `${lease.parties?.landlord?.businessName || "The landlord"} withdrew lease ${lease.reference}.${reason ? ` ${reason}` : ""}`,
    { type: "biz_lease", leaseId: ref.id });
  return { success: true, status: "cancelled" };
});

module.exports.renderText = renderText;
module.exports.hashContent = hashContent;
