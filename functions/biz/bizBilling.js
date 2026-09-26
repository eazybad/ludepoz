// ─── Kampasika Biz · Kampasika's own fees ───
//
// Two fees, both paid into KAMPASIKA'S OWN pawaPay account (Kampasika's
// income — never rent, so no one else's money is held):
//
//   Student service fee (serviceFee) — the Tanzanian norm is that the
//   tenant pays the finder (dalali), so the student pays Kampasika a clearly
//   labelled service fee when signing a lease: a % of the whole lease's rent,
//   capped at a share of one month's rent so it stays cheaper than a dalali.
//   The lease becomes active ("signed") once the fee is paid; until then it
//   is "pending_fee". The owner receives 100% of the rent.
//
//   Owner placement fee (placementFee) — DigsConnect-style, described below.
//   Kept as an option; off by default.
//
// "Bolt-style" commission without touching rent: Kampasika sees the whole
// deal happen inside the app (application → approval → lease → signature),
// so when a student SIGNS a lease that came through Kampasika, the operator
// owes Kampasika a placement fee. The fee is an invoice to the operator,
// paid by mobile money into KAMPASIKA'S OWN pawaPay account — it is
// Kampasika's income, never rent, so no one else's money is held.
//
//   createPlacementInvoice(leaseId, lease)  called by bizSignLease
//   assertNoOverdueFees(operatorId)         called by bizCreateLease
//   bizPayInvoice               operator pays an invoice (mobile money prompt)
//   bizRefreshPlatformDeposit   "check status" for a fee payment
//   handlePlatformDepositCallback(depositId)  used by pawapayCallback in index.js
//   bizAdminWaiveInvoice        admin waives an invoice (e.g. student never moved in)
//   bizFeeReminders             daily reminders for due / overdue fees
//
// Pricing lives in system/bizPricing (admin edits it in /biz/admin):
//   placementFee: { enabled, type: "percent"|"fixed", amount, freePlacements, dueDays }
//   graceDays                 days after the due date before new leases are blocked
//   platformEnvironment       "sandbox" | "production" — which pawaPay environment
//                             Kampasika's own PAWAPAY_API_TOKEN belongs to
// Nothing is charged until the admin switches placementFee.enabled on.
//
// Data: bizInvoices/{leaseId}_placement (operator + admin read; Functions write),
//       bizDeposits/{depositId} with account: "kampasika", purpose: "placement".

const admin = require("firebase-admin");
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const pawapay = require("./bizPawapay");
const { formatTzs } = require("./bizLedger");

// Kampasika's own pawaPay token — the same secret index.js uses.
const PAWAPAY_API_TOKEN = defineSecret("PAWAPAY_API_TOKEN");

const BIZ_ADMIN_UIDS = new Set(["LTrwUHH6utQJGiw4lcsKflzXvPR2"]);
const PENDING_WINDOW_MS = 5 * 60 * 1000;

const DEFAULT_PRICING = {
  serviceFee: { enabled: false, percent: 0, capPercentOfMonth: 0 },
  placementFee: { enabled: false, type: "percent", amount: 0, freePlacements: 0, dueDays: 7 },
  graceDays: 14,
  platformEnvironment: "sandbox",
};

const db = () => admin.firestore();
const FieldValue = () => admin.firestore.FieldValue;
const invoiceRef = (id) => db().collection("bizInvoices").doc(id);
const depositRef = (id) => db().collection("bizDeposits").doc(id);

function requireUid(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in first.");
  return uid;
}

function clean(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function todayEat() {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function loadPricing() {
  const snap = await db().collection("system").doc("bizPricing").get().catch(() => null);
  const raw = snap && snap.exists ? (snap.data() || {}) : {};
  const fee = raw.placementFee || {};
  const sf = raw.serviceFee || {};
  return {
    serviceFee: {
      enabled: sf.enabled === true,
      percent: Math.min(100, Math.max(0, toNumber(sf.percent, 0))),
      capPercentOfMonth: Math.max(0, toNumber(sf.capPercentOfMonth, 0)),
    },
    placementFee: {
      enabled: fee.enabled === true,
      type: fee.type === "fixed" ? "fixed" : "percent",
      amount: Math.max(0, toNumber(fee.amount, 0)),
      freePlacements: Math.max(0, Math.floor(toNumber(fee.freePlacements, 0))),
      dueDays: Math.min(60, Math.max(0, Math.floor(toNumber(fee.dueDays, DEFAULT_PRICING.placementFee.dueDays)))),
    },
    graceDays: Math.min(90, Math.max(0, Math.floor(toNumber(raw.graceDays, DEFAULT_PRICING.graceDays)))),
    platformEnvironment: raw.platformEnvironment === "production" ? "production" : "sandbox",
  };
}

// One month's rent, whatever period the lease uses.
function monthlyRent(terms = {}) {
  const rent = Number(terms.rent || 0);
  if (terms.rentPeriod === "semester") return rent / 6;
  if (terms.rentPeriod === "year") return rent / 12;
  return rent;
}

// Same rule the Biz app shows before a lease is issued (src/biz/bizService.js).
function placementFeeFor(terms, fee) {
  if (!fee || !fee.enabled || !(fee.amount > 0)) return 0;
  const raw = fee.type === "fixed" ? fee.amount : (monthlyRent(terms) * Math.min(fee.amount, 100)) / 100;
  return Math.max(0, Math.round(raw / 100) * 100);
}

// Total rent over the whole lease — the same schedule the rent charges use.
function leaseRentTotal(terms = {}) {
  const { buildSchedule } = require("./bizRent");
  if (!terms.startDate || !terms.endDate || !(Number(terms.rent) > 0)) return 0;
  return buildSchedule({ ...terms, rent: Number(terms.rent) }).reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

// Student service fee: percent of the whole lease rent, capped at
// capPercentOfMonth % of one month's rent (0 = no cap). Mirrors
// serviceFeeFor() in src/biz/bizService.js.
function serviceFeeFor(terms, cfg) {
  if (!cfg || !cfg.enabled || !(cfg.percent > 0)) return null;
  const totalRent = leaseRentTotal(terms);
  let amount = (totalRent * cfg.percent) / 100;
  const cap = cfg.capPercentOfMonth > 0 ? (monthlyRent(terms) * cfg.capPercentOfMonth) / 100 : 0;
  if (cap > 0) amount = Math.min(amount, cap);
  amount = Math.max(0, Math.round(amount / 100) * 100);
  if (!(amount > 0)) return null;
  return { amount, percent: cfg.percent, capPercentOfMonth: cfg.capPercentOfMonth, totalRent: Math.round(totalRent), capped: cap > 0 && amount >= Math.round(cap / 100) * 100 };
}

async function notify(userId, title, message, extra = {}) {
  if (!userId) return;
  await db().collection("notifications").add({
    userId, title, message, type: "biz_fee", read: false, createdAt: FieldValue().serverTimestamp(), ...extra,
  }).catch(err => console.error("Biz fee notification failed", err.message));
}

// Called once when a student signs. Idempotent: the invoice id is derived
// from the lease, and the operator's placement counter is only bumped when
// the invoice is actually created.
async function createPlacementInvoice(leaseId, lease) {
  const pricing = await loadPricing();
  const fee = pricing.placementFee;
  if (!fee.enabled) return null;
  const fullAmount = placementFeeFor(lease.terms, fee);
  if (!(fullAmount > 0)) return null;

  const id = `${leaseId}_placement`;
  const operatorDoc = db().collection("operators").doc(lease.operatorId);
  const created = await db().runTransaction(async tx => {
    const existing = await tx.get(invoiceRef(id));
    if (existing.exists) return null;
    const opSnap = await tx.get(operatorDoc);
    const placementsBefore = Number(opSnap.exists ? (opSnap.data()?.billing?.placements || 0) : 0);
    const free = placementsBefore < fee.freePlacements;
    const today = todayEat();
    const invoice = {
      id,
      kind: "placement",
      operatorId: lease.operatorId,
      leaseId,
      leaseReference: lease.reference || "",
      applicationId: lease.applicationId || null,
      studentUid: lease.studentUid || null,
      tenantName: lease.parties?.tenant?.name || "",
      roomLabel: lease.room?.label || "",
      businessName: lease.parties?.landlord?.businessName || "",
      currency: "TZS",
      amount: free ? 0 : fullAmount,
      listAmount: fullAmount,
      amountPaid: 0,
      status: free ? "free" : "due",
      freePlacement: free,
      placementNumber: placementsBefore + 1,
      pricing: { type: fee.type, rate: fee.amount, monthlyRent: Math.round(monthlyRent(lease.terms)) },
      issuedOn: today,
      dueDate: addDays(today, fee.dueDays),
      payments: [],
      createdAt: FieldValue().serverTimestamp(),
      updatedAt: FieldValue().serverTimestamp(),
    };
    tx.set(invoiceRef(id), invoice);
    if (opSnap.exists) {
      tx.update(operatorDoc, {
        "billing.placements": placementsBefore + 1,
        "billing.lastPlacementAt": FieldValue().serverTimestamp(),
      });
    }
    return invoice;
  });

  if (created) {
    const room = created.roomLabel ? ` (${created.roomLabel})` : "";
    const message = created.freePlacement
      ? `${created.tenantName || "A student"} signed a lease${room}. This placement is free — it's one of your free placements.`
      : `${created.tenantName || "A student"} signed a lease${room}. Kampasika placement fee: ${formatTzs(created.amount)}, due ${created.dueDate}. Pay it on the Fees page.`;
    await notify(created.operatorId, "Kampasika Biz · Room filled", message, { invoiceId: id, link: "/biz/fees" });
  }
  return created;
}

// Called by bizSignLease when the lease carries a service fee. The lease
// stays "pending_fee" until this invoice is paid (or waived by the admin).
async function createServiceFeeInvoice(leaseId, lease) {
  const fee = lease.serviceFee;
  if (!fee || !(fee.amount > 0)) return null;
  const id = `${leaseId}_service`;
  const ref = invoiceRef(id);
  const existing = await ref.get();
  if (existing.exists) return { id, ...existing.data() };
  const today = todayEat();
  const invoice = {
    id,
    kind: "service_fee",
    payerUid: lease.studentUid,
    studentUid: lease.studentUid,
    operatorId: lease.operatorId,
    leaseId,
    leaseReference: lease.reference || "",
    applicationId: lease.applicationId || null,
    tenantName: lease.parties?.tenant?.name || "",
    roomLabel: lease.room?.label || "",
    businessName: lease.parties?.landlord?.businessName || "",
    currency: "TZS",
    amount: fee.amount,
    listAmount: fee.amount,
    amountPaid: 0,
    status: "due",
    pricing: { type: "service", rate: fee.percent, cap: fee.capPercentOfMonth, totalRent: fee.totalRent },
    issuedOn: today,
    dueDate: addDays(today, 3),
    payments: [],
    createdAt: FieldValue().serverTimestamp(),
    updatedAt: FieldValue().serverTimestamp(),
  };
  await ref.set(invoice);
  return invoice;
}

async function overdueInvoices(operatorId) {
  const pricing = await loadPricing();
  const cutoff = addDays(todayEat(), -pricing.graceDays);
  const snap = await db().collection("bizInvoices")
    .where("operatorId", "==", operatorId)
    .where("status", "==", "due")
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(inv => (inv.kind || "placement") === "placement" && inv.dueDate && inv.dueDate < cutoff);
}

// New leases are paused while a fee is more than graceDays past due. Signed
// leases, rent collection and everything the students see keep working.
async function assertNoOverdueFees(operatorId) {
  const overdue = await overdueInvoices(operatorId);
  if (overdue.length) {
    const total = overdue.reduce((sum, inv) => sum + Number(inv.amount || 0) - Number(inv.amountPaid || 0), 0);
    throw new HttpsError("failed-precondition",
      `You have an unpaid Kampasika fee (${formatTzs(total)}). Pay it on the Fees page to issue new leases.`);
  }
}

// ─── Payment status (Kampasika's own account) ───
function simpleStatus(pawaPayStatus) {
  const s = String(pawaPayStatus || "").toUpperCase();
  if (s === "COMPLETED") return "paid";
  if (s === "FAILED" || s === "REJECTED" || s === "DUPLICATE_IGNORED") return "failed";
  return "pending";
}

async function applyDepositToInvoice(depositId, deposit) {
  const dRef = depositRef(depositId);
  return db().runTransaction(async tx => {
    const dSnap = await tx.get(dRef);
    if (!dSnap.exists) return null;
    const d = dSnap.data() || {};
    if (d.appliedToInvoice || !d.invoiceId) return null;
    const iRef = invoiceRef(d.invoiceId);
    const iSnap = await tx.get(iRef);
    if (!iSnap.exists) return null;
    const inv = iSnap.data() || {};
    const amount = Number(deposit?.amount || d.amount || 0);
    const amountPaid = Number(inv.amountPaid || 0) + amount;
    const status = amountPaid >= Number(inv.amount || 0) ? "paid" : inv.status;
    const update = {
      amountPaid,
      status,
      payments: FieldValue().arrayUnion({
        amount,
        method: d.environment === "production" ? "pawapay" : "pawapay_sandbox",
        reference: deposit?.providerTransactionId || depositId,
        depositId,
        phone: d.phone || "",
        at: new Date().toISOString(),
      }),
      updatedAt: FieldValue().serverTimestamp(),
    };
    if (status === "paid") update.paidAt = FieldValue().serverTimestamp();
    tx.update(iRef, update);
    tx.update(dRef, { appliedToInvoice: true, updatedAt: FieldValue().serverTimestamp() });
    return { ...inv, amountPaid, status, paidAmount: amount };
  });
}

// Asks pawaPay (with Kampasika's token) for the real status and applies a
// completed payment to its invoice exactly once. Never trusts a callback body.
async function settlePlatformDeposit(depositId, extra = {}) {
  const snap = await depositRef(depositId).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (data.account !== "kampasika") return null;

  const token = PAWAPAY_API_TOKEN.value();
  if (!token) throw new HttpsError("failed-precondition", "Kampasika's pawaPay account isn't configured.");
  const result = await pawapay.checkDeposit(data.environment, token, depositId);
  if (!result.ok) throw new HttpsError("unavailable", "Could not reach pawaPay. Try again in a moment.");
  if (!result.found) return { ...data, found: false };

  const deposit = result.deposit;
  const pawaPayStatus = String(deposit.status || "").toUpperCase();
  const status = simpleStatus(pawaPayStatus);
  const update = {
    pawaPayStatus,
    status,
    providerTransactionId: deposit.providerTransactionId || data.providerTransactionId || "",
    failureReason: deposit.failureReason || null,
    updatedAt: FieldValue().serverTimestamp(),
    ...extra,
  };
  if (status === "paid" && !data.paidAt) update.paidAt = FieldValue().serverTimestamp();
  await depositRef(depositId).set(update, { merge: true });

  if (status === "paid" && !data.appliedToInvoice) {
    const applied = await applyDepositToInvoice(depositId, deposit);
    if (applied && applied.status === "paid") await afterInvoiceSettled({ id: data.invoiceId, ...applied });
  }
  return { ...data, ...update, found: true };
}

// A paid (or waived) service fee activates its lease; a paid placement fee
// just gets a thank-you.
async function afterInvoiceSettled(inv) {
  if (inv.kind === "service_fee") {
    // Lazy require: bizLeases requires this module too.
    const { activateLease } = require("./bizLeases");
    await activateLease(inv.leaseId);
    if (inv.status === "paid") {
      await notify(inv.payerUid, "Kampasika · Lease active",
        `Thank you — service fee ${formatTzs(inv.paidAmount || inv.amount)} received. Your lease ${inv.leaseReference || ""} is now active.`,
        { invoiceId: inv.id, leaseId: inv.leaseId, link: `/biz/lease/${inv.leaseId}` });
    }
    return;
  }
  if (inv.status === "paid") {
    await notify(inv.operatorId, "Kampasika Biz · Fee paid",
      `Thank you — ${formatTzs(inv.paidAmount || inv.amount)} received for the placement of ${inv.tenantName || "your tenant"}.`,
      { invoiceId: inv.id, link: "/biz/fees" });
  }
}

// Used by pawapayCallback in index.js. Returns true when the deposit is one
// of ours (so index.js can stop there).
async function handlePlatformDepositCallback(depositId) {
  const id = clean(depositId, 100);
  if (!id) return false;
  const snap = await depositRef(id).get();
  if (!snap.exists || snap.data()?.account !== "kampasika") return false;
  await settlePlatformDeposit(id, { callbackReceivedAt: FieldValue().serverTimestamp() });
  return true;
}

// ─── Callables ───
exports.bizPayInvoice = onCall({ secrets: [PAWAPAY_API_TOKEN] }, async (request) => {
  const uid = requireUid(request);
  const invoiceId = clean(request.data?.invoiceId, 200);
  const snap = await invoiceRef(invoiceId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Invoice not found.");
  const inv = snap.data() || {};
  const payer = inv.payerUid || inv.operatorId;
  if (payer !== uid && !BIZ_ADMIN_UIDS.has(uid)) throw new HttpsError("permission-denied", "This invoice belongs to someone else.");
  if (inv.status !== "due") throw new HttpsError("failed-precondition", "This invoice is already settled.");

  const amount = Number(inv.amount || 0) - Number(inv.amountPaid || 0);
  if (!(amount > 0)) throw new HttpsError("failed-precondition", "Nothing to pay on this invoice.");
  const phone = pawapay.normalizePhone(request.data?.phone);
  const provider = pawapay.normalizeProvider(request.data?.provider);
  if (!phone) throw new HttpsError("invalid-argument", "Enter a Tanzania mobile number, e.g. 0712 345 678.");
  if (!provider) throw new HttpsError("invalid-argument", "Choose your mobile money network.");

  const recent = await db().collection("bizDeposits").where("invoiceId", "==", invoiceId).get();
  const now = Date.now();
  const waiting = recent.docs.map(d => d.data()).find(d => {
    const created = d.createdAt?.toMillis ? d.createdAt.toMillis() : Date.parse(d.createdAt || 0);
    return ["creating", "pending"].includes(d.status) && now - created < PENDING_WINDOW_MS;
  });
  if (waiting) throw new HttpsError("failed-precondition", "A payment request is already waiting on your phone. Approve it or wait a few minutes.");

  const token = PAWAPAY_API_TOKEN.value();
  if (!token) throw new HttpsError("failed-precondition", "Online fee payment isn't set up yet. Please contact Kampasika.");
  const pricing = await loadPricing();
  const environment = pricing.platformEnvironment;

  const depositId = crypto.randomUUID();
  await depositRef(depositId).set({
    depositId,
    account: "kampasika",
    purpose: inv.kind || "placement",
    invoiceId,
    operatorId: inv.operatorId,
    environment,
    amount,
    currency: "TZS",
    phone,
    provider,
    status: "creating",
    pawaPayStatus: "",
    createdBy: uid,
    createdAt: FieldValue().serverTimestamp(),
    updatedAt: FieldValue().serverTimestamp(),
  });

  let result;
  try {
    result = await pawapay.createDeposit(environment, token, {
      depositId,
      payer: { type: "MMO", accountDetails: { phoneNumber: phone, provider } },
      amount: String(Math.round(amount)),
      currency: "TZS",
      clientReferenceId: `KPF-${invoiceId}`.slice(0, 50),
      customerMessage: pawapay.cleanCustomerMessage(inv.kind === "service_fee" ? "Kampasika service fee" : "Kampasika fee"),
      metadata: [{ app: "KAMPASIKA_BIZ" }, { purpose: inv.kind || "placement" }, { invoiceId }, { operatorId: inv.operatorId }],
    });
  } catch (err) {
    console.error("pawaPay fee deposit failed", depositId, err);
    result = { ok: false, status: 0, payload: null };
  }
  const initial = String(result.payload?.status || (result.ok ? "ACCEPTED" : "REJECTED")).toUpperCase();
  const accepted = result.ok && initial !== "REJECTED";
  const latest = (await depositRef(depositId).get()).data() || {};
  if (!["paid", "failed"].includes(latest.status)) {
    await depositRef(depositId).set({
      pawaPayStatus: accepted ? initial : "REJECTED",
      status: accepted ? "pending" : "failed",
      failureReason: result.payload?.failureReason || null,
      responseStatus: result.status,
      updatedAt: FieldValue().serverTimestamp(),
    }, { merge: true });
  }
  if (!accepted) {
    const reason = result.payload?.failureReason?.failureMessage || result.payload?.message || "pawaPay did not accept the payment request.";
    throw new HttpsError("internal", reason, { depositId });
  }
  return { success: true, depositId, environment };
});

exports.bizRefreshPlatformDeposit = onCall({ secrets: [PAWAPAY_API_TOKEN] }, async (request) => {
  const uid = requireUid(request);
  const depositId = clean(request.data?.depositId, 100);
  const snap = await depositRef(depositId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Payment not found.");
  const data = snap.data() || {};
  if (data.account !== "kampasika") throw new HttpsError("invalid-argument", "Not a Kampasika fee payment.");
  if (data.operatorId !== uid && data.createdBy !== uid && !BIZ_ADMIN_UIDS.has(uid)) {
    throw new HttpsError("permission-denied", "This payment belongs to another business.");
  }
  const updated = await settlePlatformDeposit(depositId, { lastCheckedAt: FieldValue().serverTimestamp() });
  return { success: true, status: updated?.status || data.status, found: updated?.found !== false };
});

exports.bizAdminWaiveInvoice = onCall(async (request) => {
  const uid = requireUid(request);
  if (!BIZ_ADMIN_UIDS.has(uid)) throw new HttpsError("permission-denied", "Only Kampasika admins can waive fees.");
  const invoiceId = clean(request.data?.invoiceId, 200);
  const note = clean(request.data?.note, 300);
  const snap = await invoiceRef(invoiceId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Invoice not found.");
  const inv = snap.data() || {};
  if (inv.status !== "due") throw new HttpsError("failed-precondition", "Only an unpaid invoice can be waived.");
  await invoiceRef(invoiceId).update({
    status: "waived",
    waivedNote: note,
    waivedBy: uid,
    waivedAt: FieldValue().serverTimestamp(),
    updatedAt: FieldValue().serverTimestamp(),
  });
  if (inv.kind === "service_fee") {
    await notify(inv.payerUid, "Kampasika · Service fee waived",
      `Kampasika waived your service fee for lease ${inv.leaseReference || ""}.${note ? ` ${note}` : ""}`,
      { invoiceId, leaseId: inv.leaseId, link: `/biz/lease/${inv.leaseId}` });
  } else {
    await notify(inv.operatorId, "Kampasika Biz · Fee waived",
      `Kampasika waived the placement fee for ${inv.tenantName || "your tenant"}.${note ? ` ${note}` : ""}`,
      { invoiceId, link: "/biz/fees" });
  }
  await afterInvoiceSettled({ id: invoiceId, ...inv, status: "waived" });
  return { success: true };
});

// Daily 09:10 in Dar es Salaam: 2 days before, on the due date, and 7 days after.
exports.bizFeeReminders = onSchedule({ schedule: "every day 09:10", timeZone: "Africa/Dar_es_Salaam" }, async () => {
  const today = todayEat();
  const kinds = { [addDays(today, 2)]: "soon", [today]: "today", [addDays(today, -7)]: "late" };
  const snap = await db().collection("bizInvoices").where("dueDate", "in", Object.keys(kinds)).get();
  const writes = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(inv => inv.status === "due")
    .map(inv => {
      if (inv.kind === "service_fee") {
        const kind = kinds[inv.dueDate];
        if (kind === "late") return null; // the owner can withdraw an unpaid lease
        return notify(inv.payerUid, "Kampasika · Activate your lease",
          `Pay the Kampasika service fee (${formatTzs(Number(inv.amount || 0) - Number(inv.amountPaid || 0))}) to activate lease ${inv.leaseReference || ""}.`,
          { invoiceId: inv.id, leaseId: inv.leaseId, link: `/biz/lease/${inv.leaseId}` });
      }
      const balance = formatTzs(Number(inv.amount || 0) - Number(inv.amountPaid || 0));
      const kind = kinds[inv.dueDate];
      const message = kind === "soon"
        ? `Your Kampasika placement fee for ${inv.tenantName || "a new tenant"} (${balance}) is due in 2 days.`
        : kind === "today"
          ? `Your Kampasika placement fee for ${inv.tenantName || "a new tenant"} (${balance}) is due today.`
          : `Your Kampasika placement fee for ${inv.tenantName || "a new tenant"} (${balance}) is overdue. New leases pause if it stays unpaid.`;
      return notify(inv.operatorId, kind === "late" ? "Kampasika Biz · Fee overdue" : "Kampasika Biz · Fee reminder", message, { invoiceId: inv.id, link: "/biz/fees" });
    });
  await Promise.all(writes.filter(Boolean));
  console.log(`bizFeeReminders: ${writes.length} reminders for ${today}`);
});

module.exports.createPlacementInvoice = createPlacementInvoice;
module.exports.assertNoOverdueFees = assertNoOverdueFees;
module.exports.handlePlatformDepositCallback = handlePlatformDepositCallback;
module.exports.placementFeeFor = placementFeeFor;
module.exports.serviceFeeFor = serviceFeeFor;
module.exports.createServiceFeeInvoice = createServiceFeeInvoice;
module.exports.loadPricing = loadPricing;
