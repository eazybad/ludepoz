import {
  collection,
  doc,
  deleteField,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { db, functions, storage } from "./bizFirebase";
import { DemoError, demoData, demoDeliver, demoParam, isBizDemo } from "./bizDemo";

// /biz/demo serves sample data from bizDemo.js; writes are refused politely.
const DEMO = isBizDemo();
const demoRefuse = () => Promise.reject(new DemoError());

// ─── Constants ───

// "unregistered" = not registered yet: students pay the owner's own number
// directly and the owner confirms (no pawaPay until they register).
export const BUSINESS_TYPES = ["company", "sole_proprietor", "individual", "unregistered"];

export const DOCUMENT_TYPES = [
  { id: "brela", requiredFor: ["company", "sole_proprietor"] },
  { id: "tin", requiredFor: ["company", "sole_proprietor", "individual"] },
  { id: "ownerId", requiredFor: ["company", "sole_proprietor", "individual", "unregistered"] },
  { id: "licence", requiredFor: [] },
];

export const SETTLEMENT_METHODS = ["bank", "mobile_money"];

export const PAWAPAY_APPLICATION_STATUSES = ["not_started", "submitted", "approved"];

export const TZ_PROVIDERS = [
  { provider: "VODACOM_TZA", displayName: "M-Pesa (Vodacom)" },
  { provider: "AIRTEL_TZA", displayName: "Airtel Money" },
  { provider: "TIGO_TZA", displayName: "Mixx by Yas (Tigo Pesa)" },
  { provider: "HALOTEL_TZA", displayName: "HaloPesa" },
];

// Kampasika Biz is open the moment an owner creates their business: they can
// take applications, sign leases and record rent straight away. Students pay
// the owner directly (payTo) and the owner confirms — Kampasika never holds
// the money. Everything below is optional:
//   documents → a "Verified" badge on their rooms (Kampasika checks them)
//   ONLINE_STEPS → automatic online rent payments (registered businesses)
export const ONLINE_STEPS = ["profile", "settlement", "application", "sandbox", "test", "live"];
export const ONBOARDING_STEPS = ONLINE_STEPS;
export const ALL_STEP_IDS = [...ONLINE_STEPS, "documents", "payto"];

// Not registered yet (no BRELA / TIN): direct payments only.
export function isManualOperator(operator) {
  return operator?.profile?.businessType === "unregistered";
}

export function stepsFor() {
  return ONLINE_STEPS;
}

// Open for business (applications, leases, rent) unless Kampasika paused it.
export function isOpen(operator) {
  return Boolean(operator) && operator.status !== "suspended";
}

export function isVerified(operator) {
  return operator?.review?.documents === "approved";
}

export function onlinePaymentsLive(operator) {
  return operator?.status === "live" && Boolean(operator?.pawapay?.production?.connected);
}

export const PAY_TO_METHODS = ["mobile_money", "lipa", "bank"];

export function payToMissing(operator) {
  const p = operator?.payTo || {};
  const missing = [];
  if (!PAY_TO_METHODS.includes(p.method)) missing.push("method");
  if (!String(p.number || "").trim()) missing.push("number");
  if (!String(p.name || "").trim()) missing.push("name");
  return missing;
}

const MAX_DOC_BYTES = 10 * 1024 * 1024;

// ─── Readiness (pure — the checklist, progress bar and admin view all use it) ───

export function requiredDocumentTypes(businessType) {
  return DOCUMENT_TYPES
    .filter(d => d.requiredFor.includes(businessType || "individual"))
    .map(d => d.id);
}

function filled(value) {
  return String(value ?? "").trim().length > 0;
}

export function profileMissing(operator) {
  const p = operator?.profile || {};
  const missing = [];
  const keys = ["businessName", "businessType", "contactName", "contactPhone", "region", "area"];
  if (p.businessType !== "unregistered") keys.push("tin");
  keys.forEach(key => {
    if (!filled(p[key])) missing.push(key);
  });
  if (["company", "sole_proprietor"].includes(p.businessType) && !filled(p.brelaNumber)) {
    missing.push("brelaNumber");
  }
  return missing;
}

export function documentsMissing(operator) {
  const docs = operator?.documents || {};
  return requiredDocumentTypes(operator?.profile?.businessType).filter(id => !docs[id]?.path);
}

export function settlementMissing(operator) {
  const s = operator?.settlement || {};
  const missing = [];
  if (!SETTLEMENT_METHODS.includes(s.method)) missing.push("method");
  if (!filled(s.institution)) missing.push("institution");
  if (!filled(s.accountName)) missing.push("accountName");
  if (s.confirmedWithPawapay !== true) missing.push("confirmedWithPawapay");
  return missing;
}

export function testPassed(operator) {
  return Boolean(operator?.pawapay?.sandbox?.testPassedAt) || operator?.pawapay?.testDeposit?.status === "paid";
}

// Returns { [stepId]: "done" | "waiting" | "todo" | "blocked" }.
//   waiting = the operator did their part, someone else (pawaPay / Kampasika) is next.
export function computeSteps(operator) {
  const steps = {};
  steps.profile = profileMissing(operator).length === 0 ? "done" : "todo";

  steps.settlement = settlementMissing(operator).length === 0 ? "done" : "todo";

  const app = operator?.pawapayApplication?.status || "not_started";
  steps.application = app === "approved" ? "done" : app === "submitted" ? "waiting" : "todo";

  steps.sandbox = operator?.pawapay?.sandbox?.connected ? "done" : steps.application === "todo" ? "blocked" : "todo";

  if (testPassed(operator)) steps.test = "done";
  else if (steps.sandbox !== "done") steps.test = "blocked";
  else steps.test = operator?.pawapay?.testDeposit?.status === "pending" ? "waiting" : "todo";

  if (operator?.status === "live") steps.live = "done";
  else if (steps.test !== "done") steps.live = "blocked";
  else steps.live = operator?.pawapay?.production?.connected && operator?.status === "in_review" ? "waiting" : "todo";

  return steps;
}

// Optional extras, outside the online-payments checklist.
export function payToState(operator) {
  return payToMissing(operator).length === 0 ? "done" : "todo";
}

// done | waiting (asked, Kampasika hasn't answered) | changes | ready (all
// uploaded, not asked yet) | todo (documents missing).
export function documentsState(operator) {
  const review = operator?.review || {};
  if (review.documents === "approved") return "done";
  const asked = millis(operator?.verifyRequestedAt);
  if (asked && asked > millis(review.reviewedAt)) return "waiting";
  if (review.documents === "changes_requested") return "changes";
  return documentsMissing(operator).length === 0 ? "ready" : "todo";
}

export function progressPercent(steps) {
  const values = Object.values(steps);
  const score = values.reduce((sum, s) => sum + (s === "done" ? 1 : s === "waiting" ? 0.5 : 0), 0);
  return Math.round((score / values.length) * 100);
}

// Online payments: profile and settlement are enough for Kampasika to start
// checking the business while the operator waits on pawaPay.
export function canSubmitForReview(operator) {
  if (!["draft", "needs_changes"].includes(operator?.status || "draft")) return false;
  if (isManualOperator(operator)) return false;
  return profileMissing(operator).length === 0
    && settlementMissing(operator).length === 0;
}

export function callbackUrlFor(operatorId, base) {
  return `${base}/${operatorId}`;
}

// ─── Firestore ───

export function operatorDocRef(operatorId) {
  return doc(db, "operators", operatorId);
}

export function subscribeOperator(operatorId, onData, onError) {
  if (DEMO) return demoDeliver(() => demoData().operator, onData);
  return onSnapshot(
    operatorDocRef(operatorId),
    snap => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError
  );
}

export async function createOperator(user, { businessName, contactName, contactPhone, nearUni, area, businessType, payTo }) {
  if (DEMO) return demoRefuse();
  const existing = await getDoc(operatorDocRef(user.uid));
  if (existing.exists()) return;
  const cleanPayTo = payTo && String(payTo.number || "").trim() ? cleanObject(payTo) : null;
  await setDoc(operatorDocRef(user.uid), {
    ...(cleanPayTo ? { payTo: cleanPayTo } : {}),
    ownerUid: user.uid,
    status: "draft",
    profile: {
      businessName: String(businessName || "").trim(),
      businessType: BUSINESS_TYPES.includes(businessType) ? businessType : "",
      brelaNumber: "",
      tin: "",
      contactName: String(contactName || "").trim(),
      contactPhone: String(contactPhone || "").trim(),
      contactEmail: "",
      region: "Dar es Salaam",
      area: String(area || "").trim(),
      nearUni: nearUni || "ARU",
      propertyCount: "",
      bedCount: "",
    },
    documents: {},
    settlement: { method: "", institution: "", accountName: "", confirmedWithPawapay: false },
    pawapayApplication: { status: "not_started" },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

function cleanObject(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    out[k] = typeof v === "string" ? v.trim() : v;
  });
  return out;
}

export function saveProfile(operatorId, profile) {
  if (DEMO) return demoRefuse();
  return updateDoc(operatorDocRef(operatorId), {
    profile: cleanObject(profile),
    updatedAt: serverTimestamp(),
  });
}

export function savePayTo(operatorId, payTo) {
  if (DEMO) return demoRefuse();
  return updateDoc(operatorDocRef(operatorId), {
    payTo: cleanObject(payTo),
    updatedAt: serverTimestamp(),
  });
}

export function saveSettlement(operatorId, settlement) {
  if (DEMO) return demoRefuse();
  return updateDoc(operatorDocRef(operatorId), {
    settlement: cleanObject(settlement),
    updatedAt: serverTimestamp(),
  });
}

export function savePawapayApplication(operatorId, application) {
  if (DEMO) return demoRefuse();
  const clean = cleanObject(application);
  if (!PAWAPAY_APPLICATION_STATUSES.includes(clean.status)) clean.status = "not_started";
  return updateDoc(operatorDocRef(operatorId), {
    pawapayApplication: { ...clean, updatedAt: new Date().toISOString() },
    updatedAt: serverTimestamp(),
  });
}

export function submitForReview(operatorId) {
  if (DEMO) return demoRefuse();
  return updateDoc(operatorDocRef(operatorId), {
    status: "in_review",
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function uploadDocument(operatorId, docType, file) {
  if (DEMO) return demoRefuse();
  if (!file) throw new Error("No file chosen.");
  const okType = file.type === "application/pdf" || file.type.startsWith("image/");
  if (!okType) throw new Error("bad_type");
  if (file.size > MAX_DOC_BYTES) throw new Error("too_big");

  const ext = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const path = `biz/${operatorId}/documents/${docType}_${Date.now()}.${ext}`;
  await uploadBytes(ref(storage, path), file, { contentType: file.type });
  await updateDoc(operatorDocRef(operatorId), {
    [`documents.${docType}`]: {
      path,
      name: file.name.slice(0, 120),
      contentType: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  });
  return path;
}

// "Please check my documents" — the owner asks for the Verified badge.
export function requestVerification(operatorId) {
  if (DEMO) return demoRefuse();
  return updateDoc(operatorDocRef(operatorId), {
    verifyRequestedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function documentUrl(path) {
  if (DEMO) return demoRefuse();
  return getDownloadURL(ref(storage, path));
}

// ─── Admin ───

export function subscribeAllOperators(onData, onError) {
  return onSnapshot(
    query(collection(db, "operators"), orderBy("updatedAt", "desc")),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    onError
  );
}

// ─── Cloud Functions ───

async function call(name, data) {
  if (DEMO) return demoRefuse();
  const fn = httpsCallable(functions, name);
  const result = await fn(data);
  return result.data;
}

export const connectPawapay = (environment, token, operatorId) =>
  call("bizConnectPawapay", { environment, token, operatorId });

export const disconnectPawapay = (environment, operatorId) =>
  call("bizDisconnectPawapay", { environment, operatorId });

export const createTestDeposit = ({ phone, provider, amount, operatorId }) =>
  call("bizCreateTestDeposit", { phone, provider, amount, operatorId });

export const refreshDeposit = (depositId) =>
  call("bizRefreshDeposit", { depositId });

export const adminReview = (operatorId, action, note) =>
  call("bizAdminReview", { operatorId, action, note });

// Firebase callable errors carry a readable message from the function.
export function errorMessage(err, fallback) {
  const msg = err?.message || "";
  if (!msg || msg === "internal" || msg === "INTERNAL") return fallback;
  return msg.replace(/^Firebase:\s*/, "");
}

// ─── Step 2: applications ───

export const APPLICATION_FILTERS = {
  new: ["submitted"],
  shortlisted: ["shortlisted"],
  approved: ["approved"],
  closed: ["rejected", "withdrawn"],
};

// Students can apply as soon as the business exists (unless paused) —
// mirrors publicRecordFor() in functions/biz/bizApplications.js.
export function applicationsUnlocked(operator) {
  return isOpen(operator);
}

function millis(value) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// Sorted client-side (newest first) so no composite index is needed.
export function subscribeOperatorApplications(operatorId, onData, onError) {
  if (DEMO) return demoDeliver(() => demoData().apps, onData);
  return onSnapshot(
    query(collection(db, "bizApplications"), where("operatorId", "==", operatorId)),
    snap => onData(
      snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
    ),
    onError
  );
}

export function setAcceptingApplications(operatorId, accepting) {
  if (DEMO) return demoRefuse();
  return updateDoc(operatorDocRef(operatorId), {
    "settings.acceptingApplications": Boolean(accepting),
    updatedAt: serverTimestamp(),
  });
}

export const decideApplication = (applicationId, decision, note) =>
  call("bizDecideApplication", { applicationId, decision, note });

export function applicationTime(app) {
  return millis(app?.createdAt);
}

// ─── Step 3: leases ───

export function saveLeaseTemplate(operatorId, language, clauses) {
  if (DEMO) return demoRefuse();
  return updateDoc(operatorDocRef(operatorId), {
    [`leaseTemplates.${language}`]: {
      clauses: clauses.map(c => ({ title: String(c.title || "").slice(0, 120), body: String(c.body || "").slice(0, 4000) })),
      updatedAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  });
}

export function resetLeaseTemplate(operatorId, language) {
  if (DEMO) return demoRefuse();
  return updateDoc(operatorDocRef(operatorId), {
    [`leaseTemplates.${language}`]: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

export function saveLeaseDefaults(operatorId, defaults) {
  if (DEMO) return demoRefuse();
  return updateDoc(operatorDocRef(operatorId), {
    leaseDefaults: {
      rentPeriod: defaults.rentPeriod || "month",
      deposit: String(defaults.deposit ?? ""),
      dueDay: Number(defaults.dueDay) || 5,
      noticeDays: Number(defaults.noticeDays) || 30,
      utilities: String(defaults.utilities || "").slice(0, 300),
    },
    updatedAt: serverTimestamp(),
  });
}

export function subscribeOperatorLeases(operatorId, onData, onError) {
  if (DEMO) return demoDeliver(() => demoData().leases, onData);
  return onSnapshot(
    query(collection(db, "bizLeases"), where("operatorId", "==", operatorId)),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b.createdAt) - millis(a.createdAt))),
    onError
  );
}

export function subscribeLease(leaseId, onData, onError) {
  if (DEMO) return demoDeliver(() => demoData().leases.find(l => l.id === leaseId) || null, onData);
  return onSnapshot(
    doc(db, "bizLeases", leaseId),
    snap => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError
  );
}

export const createLease = (applicationId, terms, clauses) => call("bizCreateLease", { applicationId, terms, clauses });
export const signLease = (leaseId, typedName, contentHash) => call("bizSignLease", { leaseId, typedName, contentHash, agreed: true });
export const declineLease = (leaseId, reason) => call("bizDeclineLease", { leaseId, reason });
export const cancelLease = (leaseId, reason) => call("bizCancelLease", { leaseId, reason });

// ─── Step 4: rent ───

export function subscribeOperatorCharges(operatorId, onData, onError) {
  if (DEMO) return demoDeliver(() => demoData().charges, onData);
  return onSnapshot(
    query(collection(db, "bizCharges"), where("operatorId", "==", operatorId)),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))),
    onError
  );
}

// Charges for one lease, as either party (the rules need the party filter).
export function subscribeLeaseCharges(leaseId, uid, role, onData, onError) {
  if (DEMO) return demoDeliver(() => demoData().charges.filter(c => c.leaseId === leaseId), onData);
  const partyField = role === "student" ? "studentUid" : "operatorId";
  return onSnapshot(
    query(collection(db, "bizCharges"), where("leaseId", "==", leaseId), where(partyField, "==", uid)),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))),
    onError
  );
}

export function subscribeDeposit(depositId, onData, onError) {
  if (DEMO) return demoDeliver(null, onData);
  return onSnapshot(doc(db, "bizDeposits", depositId), snap => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null), onError);
}

export async function getBizPublic(operatorId) {
  if (DEMO) return { businessName: demoData().operator.profile.businessName, onlinePayments: demoParam("pay") === "direct" ? "" : "live" };
  const snap = await getDoc(doc(db, "bizPublic", operatorId));
  return snap.exists() ? snap.data() : null;
}

export function setSandboxRent(operatorId, on) {
  if (DEMO) return demoRefuse();
  return updateDoc(operatorDocRef(operatorId), {
    "settings.sandboxRent": Boolean(on),
    updatedAt: serverTimestamp(),
  });
}

// Every room this operator owns: rooms they listed themselves plus rooms
// under their properties (which managers may have listed).
export async function loadOperatorRooms(operatorId) {
  if (DEMO) return { properties: demoData().properties, rooms: demoData().rooms };
  const [propsSnap, ownRoomsSnap] = await Promise.all([
    getDocs(query(collection(db, "properties"), where("ownerId", "==", operatorId))),
    getDocs(query(collection(db, "rooms"), where("userId", "==", operatorId))),
  ]);
  const properties = propsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const rooms = new Map(ownRoomsSnap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
  const ids = properties.map(p => p.id);
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await getDocs(query(collection(db, "rooms"), where("propertyId", "in", ids.slice(i, i + 30))));
    snap.docs.forEach(d => rooms.set(d.id, { id: d.id, ...d.data() }));
  }
  return { properties, rooms: [...rooms.values()] };
}

export function chargeBalance(charge) {
  return Math.max(0, Number(charge?.amount || 0) - Number(charge?.amountPaid || 0));
}

export function isChargeOpen(charge) {
  return ["due", "partial"].includes(charge?.status);
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isOverdue(charge, today = todayIso()) {
  return isChargeOpen(charge) && String(charge.dueDate) < today;
}

export const payCharge = ({ chargeId, phone, provider, amount }) => call("bizPayCharge", { chargeId, phone, provider, amount });
export const recordPayment = ({ chargeId, amount, method, reference, paidOn }) => call("bizRecordPayment", { chargeId, amount, method, reference, paidOn });
export const waiveCharge = (chargeId, note) => call("bizWaiveCharge", { chargeId, note });

// ─── Kampasika fees (placement fee — Kampasika's own revenue) ───
// Pricing: system/bizPricing (admin-edited). Invoices: bizInvoices, created
// by functions/biz/bizBilling.js when a student signs a lease.

export const DEFAULT_PRICING = {
  serviceFee: { enabled: false, percent: 0, capPercentOfMonth: 0 },
  placementFee: { enabled: false, type: "percent", amount: 0, freePlacements: 0, dueDays: 7 },
  graceDays: 14,
  platformEnvironment: "sandbox",
};

export function normalizePricing(raw) {
  const fee = raw?.placementFee || {};
  const sf = raw?.serviceFee || {};
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    serviceFee: {
      enabled: sf.enabled === true,
      percent: Math.min(100, Math.max(0, num(sf.percent, 0))),
      capPercentOfMonth: Math.max(0, num(sf.capPercentOfMonth, 0)),
    },
    placementFee: {
      enabled: fee.enabled === true,
      type: fee.type === "fixed" ? "fixed" : "percent",
      amount: Math.max(0, num(fee.amount, 0)),
      freePlacements: Math.max(0, Math.floor(num(fee.freePlacements, 0))),
      dueDays: Math.max(0, Math.floor(num(fee.dueDays, 7))),
    },
    graceDays: Math.max(0, Math.floor(num(raw?.graceDays, 14))),
    platformEnvironment: raw?.platformEnvironment === "production" ? "production" : "sandbox",
  };
}

export function subscribePricing(onData, onError) {
  if (DEMO) return demoDeliver(() => normalizePricing(demoData().pricing), onData);
  return onSnapshot(doc(db, "system", "bizPricing"), snap => onData(normalizePricing(snap.exists() ? snap.data() : null)), onError);
}

export function savePricing(pricing) {
  if (DEMO) return demoRefuse();
  const p = normalizePricing(pricing);
  return setDoc(doc(db, "system", "bizPricing"), { ...p, updatedAt: serverTimestamp() });
}

// Mirrors placementFeeFor() in functions/biz/bizBilling.js.
export function monthlyRentOf(terms) {
  const rent = Number(terms?.rent || 0);
  if (terms?.rentPeriod === "semester") return rent / 6;
  if (terms?.rentPeriod === "year") return rent / 12;
  return rent;
}

export function placementFeeFor(terms, fee) {
  if (!fee || !fee.enabled || !(fee.amount > 0)) return 0;
  const raw = fee.type === "fixed" ? fee.amount : (monthlyRentOf(terms) * Math.min(fee.amount, 100)) / 100;
  return Math.max(0, Math.round(raw / 100) * 100);
}

// ── Student service fee (mirrors functions/biz/bizBilling.js) ──
function isoAddDays(iso, days) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function isoAddMonths(iso, months) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
function isoDaysBetween(a, b) { return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000); }

// Total rent over the lease — same schedule as buildSchedule() in functions/biz/bizRent.js.
export function leaseRentTotal(terms) {
  const { startDate, endDate, rentPeriod } = terms || {};
  const rent = Number(terms?.rent || 0);
  if (!startDate || !endDate || endDate <= startDate || !(rent > 0)) return 0;
  if (rentPeriod === "month") {
    let total = 0;
    for (let i = 0; i < 60; i += 1) {
      const start = i === 0 ? startDate : isoAddMonths(startDate, i);
      if (start > endDate) break;
      const fullEnd = isoAddDays(isoAddMonths(startDate, i + 1), -1);
      const end = fullEnd < endDate ? fullEnd : endDate;
      const fullDays = isoDaysBetween(start, fullEnd) + 1;
      const days = isoDaysBetween(start, end) + 1;
      total += days >= fullDays ? rent : Math.max(0, Math.round((rent * days) / fullDays / 100) * 100);
    }
    return total;
  }
  const block = rentPeriod === "year" ? 12 : 6;
  let n = 0;
  while (isoAddMonths(startDate, n + 1) <= isoAddDays(endDate, 1) && n < 600) n += 1;
  const rest = isoDaysBetween(isoAddMonths(startDate, n), isoAddDays(endDate, 1));
  const months = n + (rest > 0 ? rest / 30 : 0);
  return rent * Math.max(1, Math.ceil(months / block - 0.01));
}

export function serviceFeeFor(terms, cfg) {
  if (!cfg || !cfg.enabled || !(cfg.percent > 0)) return null;
  const totalRent = leaseRentTotal(terms);
  let amount = (totalRent * cfg.percent) / 100;
  const cap = cfg.capPercentOfMonth > 0 ? (monthlyRentOf(terms) * cfg.capPercentOfMonth) / 100 : 0;
  if (cap > 0) amount = Math.min(amount, cap);
  amount = Math.max(0, Math.round(amount / 100) * 100);
  return amount > 0 ? { amount, totalRent, percent: cfg.percent, capPercentOfMonth: cfg.capPercentOfMonth } : null;
}

export function subscribeInvoice(invoiceId, onData, onError) {
  if (DEMO) return demoDeliver(null, onData);
  return onSnapshot(doc(db, "bizInvoices", invoiceId), snap => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null), onError);
}

export function freePlacementsLeft(operator, pricing) {
  const used = Number(operator?.billing?.placements || 0);
  return Math.max(0, Number(pricing?.placementFee?.freePlacements || 0) - used);
}

export function subscribeOperatorInvoices(operatorId, onData, onError) {
  if (DEMO) return demoDeliver(() => demoData().invoices, onData);
  return onSnapshot(
    query(collection(db, "bizInvoices"), where("operatorId", "==", operatorId)),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b.createdAt) - millis(a.createdAt))),
    onError
  );
}

export function subscribeAllInvoices(onData, onError) {
  if (DEMO) return demoDeliver(() => demoData().invoices, onData);
  return onSnapshot(
    collection(db, "bizInvoices"),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b.createdAt) - millis(a.createdAt))),
    onError
  );
}

export function invoiceBalance(inv) {
  return Math.max(0, Number(inv?.amount || 0) - Number(inv?.amountPaid || 0));
}

// "late" = past the due date; "blocking" = past due + grace (new leases paused).
export function invoiceState(inv, graceDays = 14, today = todayIso()) {
  if (inv?.status !== "due") return inv?.status || "due";
  if (String(inv.dueDate) >= today) return "due";
  const d = new Date(`${inv.dueDate}T00:00:00`);
  d.setDate(d.getDate() + Number(graceDays || 0));
  const limit = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return limit < today ? "blocking" : "late";
}

export const payInvoice = ({ invoiceId, phone, provider }) => call("bizPayInvoice", { invoiceId, phone, provider });
export const refreshPlatformDeposit = (depositId) => call("bizRefreshPlatformDeposit", { depositId });
export const adminWaiveInvoice = (invoiceId, note) => call("bizAdminWaiveInvoice", { invoiceId, note });

// ─── Direct payments (owner's own number; owner confirms) ───
export const payInstructions = (chargeId) => {
  if (DEMO) {
    const c = demoData().charges.find(x => x.id === chargeId);
    return Promise.resolve({ available: true, ...demoData().operator.payTo, amount: c ? c.amount - c.amountPaid : 0, reference: c?.leaseReference || "" });
  }
  return call("bizPayInstructions", { chargeId });
};
export const reportPayment = ({ chargeId, amount, reference, paidOn, method, proofPath }) => call("bizReportPayment", { chargeId, amount, reference, paidOn, method, proofPath });

// Screenshot for "I've paid": compressed on the phone, stored at
// biz/{operatorId}/proofs/{studentUid}/… (only those two + admin can read it).
export async function uploadPaymentProof(operatorId, studentUid, file) {
  if (DEMO) return demoRefuse();
  if (!file || !String(file.type || "").startsWith("image/")) throw new Error("Choose a photo or screenshot.");
  let blob = file;
  try {
    const { compressImage, COMPRESSION_PRESETS } = await import("../imageCompression");
    const out = await compressImage(file, COMPRESSION_PRESETS.receipt);
    if (out?.file) blob = out.file;
  } catch (_) { /* upload the original if compression fails */ }
  const path = `biz/${operatorId}/proofs/${studentUid}/${Date.now()}.jpg`;
  await uploadBytes(ref(storage, path), blob, { contentType: blob.type || "image/jpeg" });
  return path;
}

export function proofUrl(path) {
  if (DEMO) return demoRefuse();
  return getDownloadURL(ref(storage, path));
}
export const reviewClaim = ({ chargeId, claimId, decision, note }) => call("bizReviewClaim", { chargeId, claimId, decision, note });

export function pendingClaim(charge) {
  return (charge?.claims || []).find(c => c.status === "pending") || null;
}

export function lastClaim(charge) {
  const list = charge?.claims || [];
  return list.length ? list[list.length - 1] : null;
}
