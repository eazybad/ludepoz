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

// ─── Constants ───

export const BUSINESS_TYPES = ["company", "sole_proprietor", "individual"];

export const DOCUMENT_TYPES = [
  { id: "brela", requiredFor: ["company", "sole_proprietor"] },
  { id: "tin", requiredFor: ["company", "sole_proprietor", "individual"] },
  { id: "ownerId", requiredFor: ["company", "sole_proprietor", "individual"] },
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

export const ONBOARDING_STEPS = ["profile", "documents", "settlement", "application", "sandbox", "test", "live"];

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
  ["businessName", "businessType", "contactName", "contactPhone", "region", "area", "tin"].forEach(key => {
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

  const docsUploaded = documentsMissing(operator).length === 0;
  const docsReview = operator?.review?.documents;
  steps.documents = !docsUploaded || docsReview === "changes_requested"
    ? "todo"
    : docsReview === "approved" ? "done" : "waiting";

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

export function progressPercent(steps) {
  const values = ONBOARDING_STEPS.map(id => steps[id]);
  const score = values.reduce((sum, s) => sum + (s === "done" ? 1 : s === "waiting" ? 0.5 : 0), 0);
  return Math.round((score / values.length) * 100);
}

// Profile, documents and settlement are enough for Kampasika to start
// checking the business while the operator waits on pawaPay.
export function canSubmitForReview(operator) {
  if (!["draft", "needs_changes"].includes(operator?.status || "draft")) return false;
  return profileMissing(operator).length === 0
    && documentsMissing(operator).length === 0
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
  return onSnapshot(
    operatorDocRef(operatorId),
    snap => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    onError
  );
}

export async function createOperator(user, { businessName, contactName, contactPhone, nearUni }) {
  const existing = await getDoc(operatorDocRef(user.uid));
  if (existing.exists()) return;
  await setDoc(operatorDocRef(user.uid), {
    ownerUid: user.uid,
    status: "draft",
    profile: {
      businessName: String(businessName || "").trim(),
      businessType: "",
      brelaNumber: "",
      tin: "",
      contactName: String(contactName || "").trim(),
      contactPhone: String(contactPhone || "").trim(),
      contactEmail: "",
      region: "Dar es Salaam",
      area: "",
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
  return updateDoc(operatorDocRef(operatorId), {
    profile: cleanObject(profile),
    updatedAt: serverTimestamp(),
  });
}

export function saveSettlement(operatorId, settlement) {
  return updateDoc(operatorDocRef(operatorId), {
    settlement: cleanObject(settlement),
    updatedAt: serverTimestamp(),
  });
}

export function savePawapayApplication(operatorId, application) {
  const clean = cleanObject(application);
  if (!PAWAPAY_APPLICATION_STATUSES.includes(clean.status)) clean.status = "not_started";
  return updateDoc(operatorDocRef(operatorId), {
    pawapayApplication: { ...clean, updatedAt: new Date().toISOString() },
    updatedAt: serverTimestamp(),
  });
}

export function submitForReview(operatorId) {
  return updateDoc(operatorDocRef(operatorId), {
    status: "in_review",
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function uploadDocument(operatorId, docType, file) {
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

export function documentUrl(path) {
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

// Students can see a business (and apply) once Kampasika approved its
// documents — mirrors publicRecordFor() in functions/biz/bizApplications.js.
export function applicationsUnlocked(operator) {
  return operator?.review?.documents === "approved" && operator?.status !== "suspended";
}

function millis(value) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

// Sorted client-side (newest first) so no composite index is needed.
export function subscribeOperatorApplications(operatorId, onData, onError) {
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
  return updateDoc(operatorDocRef(operatorId), {
    [`leaseTemplates.${language}`]: {
      clauses: clauses.map(c => ({ title: String(c.title || "").slice(0, 120), body: String(c.body || "").slice(0, 4000) })),
      updatedAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  });
}

export function resetLeaseTemplate(operatorId, language) {
  return updateDoc(operatorDocRef(operatorId), {
    [`leaseTemplates.${language}`]: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

export function saveLeaseDefaults(operatorId, defaults) {
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
  return onSnapshot(
    query(collection(db, "bizLeases"), where("operatorId", "==", operatorId)),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b.createdAt) - millis(a.createdAt))),
    onError
  );
}

export function subscribeLease(leaseId, onData, onError) {
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
  return onSnapshot(
    query(collection(db, "bizCharges"), where("operatorId", "==", operatorId)),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))),
    onError
  );
}

// Charges for one lease, as either party (the rules need the party filter).
export function subscribeLeaseCharges(leaseId, uid, role, onData, onError) {
  const partyField = role === "student" ? "studentUid" : "operatorId";
  return onSnapshot(
    query(collection(db, "bizCharges"), where("leaseId", "==", leaseId), where(partyField, "==", uid)),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))),
    onError
  );
}

export function subscribeDeposit(depositId, onData, onError) {
  return onSnapshot(doc(db, "bizDeposits", depositId), snap => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null), onError);
}

export async function getBizPublic(operatorId) {
  const snap = await getDoc(doc(db, "bizPublic", operatorId));
  return snap.exists() ? snap.data() : null;
}

export function setSandboxRent(operatorId, on) {
  return updateDoc(operatorDocRef(operatorId), {
    "settings.sandboxRent": Boolean(on),
    updatedAt: serverTimestamp(),
  });
}

// Every room this operator owns: rooms they listed themselves plus rooms
// under their properties (which managers may have listed).
export async function loadOperatorRooms(operatorId) {
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
