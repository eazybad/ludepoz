// ─── Kampasika Biz · Step 4: rent ───
//
// When a student signs a lease, its rent schedule becomes charges
// (bizCharges). Students pay a charge by mobile money through the OPERATOR's
// own pawaPay account (createDepositForOperator — money never touches
// Kampasika); operators can also record cash / bank payments or waive a
// charge. A daily job reminds students before and after due dates.
//
//   createChargesForLease(leaseId, lease)   called by bizSignLease
//   bizPayCharge          student pays (all or part of) a charge
//   bizRecordPayment      operator records a payment made outside Kampasika
//   bizWaiveCharge        operator waives a charge
//   bizRentReminders      daily 09:00 EAT reminders
//
// Online payment is available when the operator is live (production token),
// or — for pilots — when they switched on sandbox test payments
// (operators.settings.sandboxRent). Test payments are labelled as such.

const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const pawapay = require("./bizPawapay");
const { applyPaymentToCharge, formatTzs } = require("./bizLedger");
const { createDepositForOperator, BIZ_CREDENTIALS_KEY } = require("./bizFunctions");

const BIZ_ADMIN_UIDS = new Set(["LTrwUHH6utQJGiw4lcsKflzXvPR2"]);
const MAX_CHARGES = 60;
const MANUAL_METHODS = new Set(["cash", "bank", "mobile_money", "other"]);
const PENDING_WINDOW_MS = 5 * 60 * 1000;

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

// ─── Dates (all ISO yyyy-mm-dd, UTC arithmetic) ───
function toDate(iso) { return new Date(`${iso}T00:00:00Z`); }
function toIso(d) { return d.toISOString().slice(0, 10); }
function addDays(iso, days) { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + days); return toIso(d); }
function addMonths(iso, months) {
  const d = toDate(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toIso(d);
}
function daysBetween(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }
function minIso(a, b) { return a < b ? a : b; }
function monthsBetween(start, end) {
  let n = 0;
  while (addMonths(start, n + 1) <= addDays(end, 1) && n < 600) n += 1;
  const rest = daysBetween(addMonths(start, n), addDays(end, 1));
  return n + (rest > 0 ? rest / 30 : 0);
}
function todayEat() {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function fmtDate(iso, lang) {
  return toDate(iso).toLocaleDateString(lang === "sw" ? "sw-TZ" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function roundTzs(n) {
  return Math.max(0, Math.round(n / 100) * 100);
}

// Builds the rent schedule for a lease's terms.
//   month:    one charge per month from the start date; a short final
//             month is charged pro rata by days.
//   semester: the term split into equal parts of up to 6 months, full rent each.
//   year:     the term split into equal parts of up to 12 months, full rent each.
// Each rent charge is due on day `dueDay` of its period (counting the first
// day as day 1), matching the lease wording "paid in advance by day N of
// each rent period".
function buildSchedule(terms) {
  const { startDate, endDate, rent, rentPeriod, dueDay = 1 } = terms;
  const periods = [];
  if (rentPeriod === "month") {
    // Each period is counted from the original start date, so a lease that
    // starts on the 31st doesn't drift to the 28th after February.
    for (let i = 0; i < MAX_CHARGES; i += 1) {
      const start = i === 0 ? startDate : addMonths(startDate, i);
      if (start > endDate) break;
      const fullEnd = addDays(addMonths(startDate, i + 1), -1);
      const end = minIso(fullEnd, endDate);
      const fullDays = daysBetween(start, fullEnd) + 1;
      const days = daysBetween(start, end) + 1;
      const amount = days >= fullDays ? rent : roundTzs((rent * days) / fullDays);
      periods.push({ start, end, amount });
    }
  } else {
    const block = rentPeriod === "year" ? 12 : 6;
    const count = Math.max(1, Math.ceil(monthsBetween(startDate, endDate) / block - 0.01));
    const totalDays = daysBetween(startDate, endDate) + 1;
    for (let i = 0; i < count && i < MAX_CHARGES; i += 1) {
      const start = addDays(startDate, Math.round((totalDays * i) / count));
      const end = i === count - 1 ? endDate : addDays(startDate, Math.round((totalDays * (i + 1)) / count) - 1);
      periods.push({ start, end, amount: rent });
    }
  }
  return periods
    .filter(p => p.amount > 0)
    .map(p => ({ ...p, due: minIso(addDays(p.start, Math.max(0, Number(dueDay) - 1)), p.end) }));
}

async function createChargesForLease(leaseId, lease) {
  const terms = lease.terms || {};
  const lang = lease.language || "en";
  const base = {
    operatorId: lease.operatorId,
    studentUid: lease.studentUid,
    leaseId,
    leaseReference: lease.reference || "",
    propertyId: lease.propertyId || null,
    roomId: lease.roomId || null,
    roomLabel: lease.room?.label || "",
    tenantName: lease.parties?.tenant?.name || "",
    tenantPhone: lease.parties?.tenant?.phone || "",
    businessName: lease.parties?.landlord?.businessName || "",
    currency: "TZS",
    amountPaid: 0,
    status: "due",
    payments: [],
    createdAt: FieldValue().serverTimestamp(),
    updatedAt: FieldValue().serverTimestamp(),
  };

  const batch = db().batch();
  let count = 0;
  if (Number(terms.deposit) > 0) {
    batch.set(db().collection("bizCharges").doc(`${leaseId}_dep`), {
      ...base,
      type: "deposit",
      label: lang === "sw" ? "Amana" : "Deposit",
      periodStart: terms.startDate,
      periodEnd: terms.startDate,
      dueDate: terms.startDate,
      amount: Number(terms.deposit),
    });
    count += 1;
  }
  buildSchedule({ ...terms, rent: Number(terms.rent) }).forEach((p, i) => {
    batch.set(db().collection("bizCharges").doc(`${leaseId}_r${String(i + 1).padStart(2, "0")}`), {
      ...base,
      type: "rent",
      label: `${lang === "sw" ? "Kodi" : "Rent"} ${fmtDate(p.start, lang)} – ${fmtDate(p.end, lang)}`,
      periodStart: p.start,
      periodEnd: p.end,
      dueDate: p.due,
      amount: p.amount,
    });
    count += 1;
  });
  await batch.commit();
  return count;
}

async function loadCharge(chargeId) {
  const ref = db().collection("bizCharges").doc(clean(chargeId, 200));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Charge not found.");
  return { ref, charge: snap.data() || {} };
}

// Which pawaPay environment the operator collects rent in, if any.
function rentEnvironment(operator) {
  if (operator.status === "live" && operator.pawapay?.production?.connected) return "production";
  if (operator.settings?.sandboxRent === true && operator.pawapay?.sandbox?.connected) return "sandbox";
  return "";
}

exports.bizPayCharge = onCall({ secrets: [BIZ_CREDENTIALS_KEY] }, async (request) => {
  const uid = requireUid(request);
  const { charge } = await loadCharge(request.data?.chargeId);
  const chargeId = clean(request.data?.chargeId, 200);
  if (charge.studentUid !== uid) throw new HttpsError("permission-denied", "This isn't your charge.");
  if (["paid", "waived"].includes(charge.status)) throw new HttpsError("failed-precondition", "This charge is already settled.");

  const remaining = Number(charge.amount || 0) - Number(charge.amountPaid || 0);
  const amount = request.data?.amount ? Math.round(Number(request.data.amount)) : remaining;
  const minimum = Math.min(1000, remaining);
  if (!Number.isFinite(amount) || amount < minimum || amount > remaining) {
    throw new HttpsError("invalid-argument", `Enter an amount between ${formatTzs(minimum)} and ${formatTzs(remaining)}.`);
  }
  const phone = pawapay.normalizePhone(request.data?.phone);
  const provider = pawapay.normalizeProvider(request.data?.provider);
  if (!phone) throw new HttpsError("invalid-argument", "Enter a Tanzania mobile number, e.g. 0712 345 678.");
  if (!provider) throw new HttpsError("invalid-argument", "Choose your mobile money network.");

  const operatorSnap = await db().collection("operators").doc(charge.operatorId).get();
  const operator = operatorSnap.data() || {};
  const environment = rentEnvironment(operator);
  if (!environment) {
    throw new HttpsError("failed-precondition", "This landlord isn't collecting rent through Kampasika yet. Please pay them directly.");
  }

  // One payment prompt at a time per charge.
  const recent = await db().collection("bizDeposits").where("chargeId", "==", chargeId).get();
  const now = Date.now();
  const waiting = recent.docs.map(d => d.data()).find(d => {
    const created = d.createdAt?.toMillis ? d.createdAt.toMillis() : Date.parse(d.createdAt || 0);
    return ["creating", "pending"].includes(d.status) && now - created < PENDING_WINDOW_MS;
  });
  if (waiting) {
    throw new HttpsError("failed-precondition", "A payment request is already waiting on your phone. Approve it or wait a few minutes.");
  }

  const { depositId, pawaPayStatus } = await createDepositForOperator({
    operatorId: charge.operatorId,
    operator,
    environment,
    purpose: "rent",
    phone,
    provider,
    amount: String(amount),
    customerMessage: pawapay.cleanCustomerMessage(`Rent ${charge.leaseReference || ""}`),
    createdBy: uid,
    extraMetadata: [{ chargeId }],
    record: { chargeId, leaseId: charge.leaseId, studentUid: uid },
  });
  return { success: true, depositId, pawaPayStatus, environment };
});

exports.bizRecordPayment = onCall(async (request) => {
  const uid = requireUid(request);
  const chargeId = clean(request.data?.chargeId, 200);
  const { charge } = await loadCharge(chargeId);
  if (charge.operatorId !== uid && !BIZ_ADMIN_UIDS.has(uid)) throw new HttpsError("permission-denied", "This charge belongs to another business.");
  if (["paid", "waived"].includes(charge.status)) throw new HttpsError("failed-precondition", "This charge is already settled.");

  const remaining = Number(charge.amount || 0) - Number(charge.amountPaid || 0);
  const amount = Math.round(Number(request.data?.amount));
  if (!Number.isFinite(amount) || amount < 1 || amount > remaining) {
    throw new HttpsError("invalid-argument", `Enter an amount between TZS 1 and ${formatTzs(remaining)}.`);
  }
  const method = MANUAL_METHODS.has(request.data?.method) ? request.data.method : "other";
  const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(String(request.data?.paidOn || "")) ? request.data.paidOn : todayEat();

  await applyPaymentToCharge(chargeId, {
    amount,
    method,
    reference: clean(request.data?.reference, 80),
    paidOn,
    recordedBy: uid,
    manual: true,
  });
  return { success: true };
});

exports.bizWaiveCharge = onCall(async (request) => {
  const uid = requireUid(request);
  const chargeId = clean(request.data?.chargeId, 200);
  const { ref, charge } = await loadCharge(chargeId);
  if (charge.operatorId !== uid && !BIZ_ADMIN_UIDS.has(uid)) throw new HttpsError("permission-denied", "This charge belongs to another business.");
  if (charge.status === "paid") throw new HttpsError("failed-precondition", "A paid charge can't be waived.");
  const note = clean(request.data?.note, 300);
  await ref.update({
    status: "waived",
    waivedNote: note,
    waivedBy: uid,
    waivedAt: FieldValue().serverTimestamp(),
    updatedAt: FieldValue().serverTimestamp(),
  });
  await db().collection("notifications").add({
    userId: charge.studentUid,
    title: "Rent update",
    message: `${charge.businessName || "Your landlord"} waived ${charge.label}.${note ? ` ${note}` : ""}`,
    type: "biz_rent",
    chargeId,
    read: false,
    createdAt: FieldValue().serverTimestamp(),
  }).catch(() => {});
  return { success: true };
});

// Daily 09:00 in Dar es Salaam: remind students 3 days before, on the day,
// and 3 and 7 days after a charge is due.
exports.bizRentReminders = onSchedule({ schedule: "every day 09:00", timeZone: "Africa/Dar_es_Salaam" }, async () => {
  const today = todayEat();
  const offsets = { [addDays(today, 3)]: "soon", [today]: "today", [addDays(today, -3)]: "late", [addDays(today, -7)]: "late" };
  const snap = await db().collection("bizCharges").where("dueDate", "in", Object.keys(offsets)).get();
  const writes = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => ["due", "partial"].includes(c.status))
    .map(c => {
      const balance = formatTzs(Number(c.amount || 0) - Number(c.amountPaid || 0));
      const kind = offsets[c.dueDate];
      const message = kind === "soon"
        ? `${c.label} (${balance}) is due in 3 days.`
        : kind === "today"
          ? `${c.label} (${balance}) is due today.`
          : `${c.label} (${balance}) is overdue. Please pay or talk to ${c.businessName || "your landlord"}.`;
      return db().collection("notifications").add({
        userId: c.studentUid,
        title: kind === "late" ? "Rent overdue" : "Rent reminder",
        message,
        type: "biz_rent",
        chargeId: c.id,
        read: false,
        createdAt: FieldValue().serverTimestamp(),
      });
    });
  await Promise.all(writes);
  console.log(`bizRentReminders: ${writes.length} reminders for ${today}`);
});

module.exports.createChargesForLease = createChargesForLease;
module.exports.buildSchedule = buildSchedule;
module.exports.rentEnvironment = rentEnvironment;
