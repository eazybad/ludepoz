// ─── Kampasika Biz · Cloud Functions ───
//
// Step 1 of Kampasika Biz: getting a hostel / PBSA operator "pawaPay ready".
//
//   bizConnectPawapay      operator saves their own pawaPay API token
//                          (sandbox or production); we verify it against
//                          pawaPay and store it encrypted.
//   bizDisconnectPawapay   removes a saved token.
//   bizCreateTestDeposit   sends a small sandbox deposit with the operator's
//                          own token, proving money would reach THEIR account.
//   bizRefreshDeposit      re-checks a deposit's status with pawaPay.
//   bizPawapayCallback     endpoint the operator pastes into their pawaPay
//                          dashboard: …/bizPawapayCallback/<operatorId>
//   bizAdminReview         Kampasika admin approves documents, requests
//                          changes, sets an operator live or suspends them.
//
// Data:
//   operators/{ownerUid}          public-ish operator profile + progress.
//                                 Fields review, pawapay, paymentMode,
//                                 status (beyond self-submit) and liveAt
//                                 are written only from here / by admin.
//   bizOperatorSecrets/{ownerUid} encrypted tokens. Clients never read it.
//   bizDeposits/{depositId}       every deposit Biz creates.
//
// Payment mode: every operator starts on "operator_own" (their token, their
// money). "kampasika_platform" is reserved for later, once Kampasika is set
// up to collect on operators' behalf — createDepositForOperator is the one
// place that would branch on it.

const admin = require("firebase-admin");
const crypto = require("crypto");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const pawapay = require("./bizPawapay");
const { applyPaymentToCharge } = require("./bizLedger");

// Keep in sync with ADMIN_UIDS in index.js and isAdmin() in firestore.rules.
const BIZ_ADMIN_UIDS = new Set(["LTrwUHH6utQJGiw4lcsKflzXvPR2"]);

// Any long random string. Set once with:
//   firebase functions:secrets:set BIZ_CREDENTIALS_KEY
// Changing it later makes every saved operator token unreadable (operators
// would just reconnect), so set it once and keep it.
const BIZ_CREDENTIALS_KEY = defineSecret("BIZ_CREDENTIALS_KEY");

const PAYMENT_MODES = { OPERATOR_OWN: "operator_own", KAMPASIKA_PLATFORM: "kampasika_platform" };
const TEST_DEPOSIT_MAX_TZS = 5000;

const FieldValue = () => admin.firestore.FieldValue;
const db = () => admin.firestore();
const operatorRef = (operatorId) => db().collection("operators").doc(operatorId);
const secretRef = (operatorId) => db().collection("bizOperatorSecrets").doc(operatorId);
const depositRef = (depositId) => db().collection("bizDeposits").doc(depositId);

function requireUid(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in to Kampasika first.");
  return uid;
}

function isBizAdmin(uid) {
  return BIZ_ADMIN_UIDS.has(uid);
}

// The caller acts on their own operator, or — admin only — on any operator
// passed as data.operatorId (so you can help an operator set up in person).
async function resolveOperator(request) {
  const uid = requireUid(request);
  const requested = String(request.data?.operatorId || "").trim();
  const operatorId = requested && isBizAdmin(uid) ? requested : uid;
  const snap = await operatorRef(operatorId).get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "Create your Kampasika Biz business profile first.");
  }
  return { uid, operatorId, operator: snap.data() || {} };
}

async function loadToken(operatorId, environment) {
  const snap = await secretRef(operatorId).get();
  const box = snap.exists ? snap.data()?.[environment] : null;
  if (!box) return "";
  try {
    return pawapay.decryptToken(box, BIZ_CREDENTIALS_KEY.value(), operatorId, environment);
  } catch (err) {
    console.error("Could not decrypt operator token", operatorId, environment, err.message);
    return "";
  }
}

// Maps pawaPay's deposit status onto the small set the app shows.
function simpleStatus(pawaPayStatus) {
  const s = String(pawaPayStatus || "").toUpperCase();
  if (s === "COMPLETED") return "paid";
  if (s === "FAILED" || s === "REJECTED" || s === "DUPLICATE_IGNORED") return "failed";
  return "pending";
}

// Writes the latest known status of a deposit to bizDeposits and, for test
// deposits, mirrors it onto the operator so the checklist updates live.
async function recordDepositStatus(depositId, deposit, extra = {}) {
  const ref = depositRef(depositId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  const pawaPayStatus = String(deposit?.status || extra.pawaPayStatus || data.pawaPayStatus || "").toUpperCase();
  const status = simpleStatus(pawaPayStatus);
  const update = {
    pawaPayStatus,
    status,
    providerTransactionId: deposit?.providerTransactionId || data.providerTransactionId || "",
    failureReason: deposit?.failureReason || null,
    updatedAt: FieldValue().serverTimestamp(),
    ...extra,
  };
  if (status === "paid" && !data.paidAt) update.paidAt = FieldValue().serverTimestamp();
  await ref.set(update, { merge: true });

  if (data.purpose === "test" && data.operatorId) {
    const testUpdate = {
      "pawapay.testDeposit.status": status,
      "pawapay.testDeposit.pawaPayStatus": pawaPayStatus,
      "pawapay.testDeposit.updatedAt": FieldValue().serverTimestamp(),
      updatedAt: FieldValue().serverTimestamp(),
    };
    if (status === "paid") {
      testUpdate[`pawapay.${data.environment}.testPassedAt`] = FieldValue().serverTimestamp();
    }
    await operatorRef(data.operatorId).update(testUpdate).catch(err => {
      console.error("Could not mirror test deposit on operator", data.operatorId, err.message);
    });
  }

  // Rent: a completed deposit is added to its charge exactly once.
  if (data.purpose === "rent" && data.chargeId && status === "paid" && !data.appliedToCharge) {
    await applyPaymentToCharge(data.chargeId, {
      amount: Number(deposit?.amount || data.amount || 0),
      method: data.environment === "production" ? "pawapay" : "pawapay_sandbox",
      reference: deposit?.providerTransactionId || data.providerTransactionId || depositId,
      depositId,
      phone: data.phone || "",
      by: data.createdBy || "",
    }, { depositId });
  }
  return { ...data, ...update, status };
}

// The single place Biz starts a collection. Today it always uses the
// operator's own pawaPay token. When Kampasika later collects on behalf of
// operators, the "kampasika_platform" branch goes here.
async function createDepositForOperator({ operatorId, operator, environment, purpose, phone, provider, amount, customerMessage, createdBy, extraMetadata = [], beforeSend, record = {} }) {
  const mode = operator.paymentMode || PAYMENT_MODES.OPERATOR_OWN;
  if (mode !== PAYMENT_MODES.OPERATOR_OWN) {
    throw new HttpsError("failed-precondition", "Collecting through Kampasika's own account isn't switched on yet.");
  }

  const token = await loadToken(operatorId, environment);
  if (!token) {
    throw new HttpsError("failed-precondition", `Connect your ${environment} pawaPay API token first.`);
  }

  const depositId = crypto.randomUUID();
  const body = {
    depositId,
    payer: { type: "MMO", accountDetails: { phoneNumber: phone, provider } },
    amount,
    currency: "TZS",
    clientReferenceId: `KPB-${operatorId.slice(0, 8)}-${Date.now()}`.slice(0, 50),
    customerMessage,
    metadata: [
      { app: "KAMPASIKA_BIZ" },
      { operatorId },
      { purpose },
      ...extraMetadata,
    ],
  };

  await depositRef(depositId).set({
    depositId,
    operatorId,
    environment,
    purpose,
    paymentMode: mode,
    amount: Number(amount),
    currency: "TZS",
    phone,
    provider,
    status: "creating",
    pawaPayStatus: "",
    ...record,
    createdBy,
    createdAt: FieldValue().serverTimestamp(),
    updatedAt: FieldValue().serverTimestamp(),
  });

  // Lets the caller record the deposit (e.g. on the operator's checklist)
  // before pawaPay can possibly call back about it.
  if (beforeSend) await beforeSend(depositId);

  let result;
  try {
    result = await pawapay.createDeposit(environment, token, body);
  } catch (err) {
    console.error("pawaPay deposit request failed", depositId, err);
    result = { ok: false, status: 0, payload: null };
  }
  const initialStatus = String(result.payload?.status || (result.ok ? "ACCEPTED" : "REJECTED")).toUpperCase();
  // Never downgrade a status a fast callback may already have written.
  const latest = (await depositRef(depositId).get()).data() || {};
  if (!["paid", "failed"].includes(latest.status)) {
    await recordDepositStatus(depositId, null, {
      pawaPayStatus: result.ok && initialStatus !== "REJECTED" ? initialStatus : "REJECTED",
      failureReason: result.payload?.failureReason || null,
      responseStatus: result.status,
    });
  }

  if (!result.ok || initialStatus === "REJECTED") {
    const reason = result.payload?.failureReason?.failureMessage || result.payload?.message || "pawaPay did not accept the payment request.";
    throw new HttpsError("internal", reason, { depositId, status: result.status });
  }
  return { depositId, pawaPayStatus: initialStatus };
}

// ─── Callables ───

exports.bizConnectPawapay = onCall({ secrets: [BIZ_CREDENTIALS_KEY] }, async (request) => {
  const { uid, operatorId } = await resolveOperator(request);
  const environment = pawapay.cleanEnvironment(request.data?.environment);
  const token = String(request.data?.token || "").trim();
  if (!environment) throw new HttpsError("invalid-argument", "Choose sandbox or production.");
  if (token.length < 20) throw new HttpsError("invalid-argument", "Paste the full pawaPay API token.");

  const config = await pawapay.fetchActiveConfig(environment, token);
  if (!config.ok) {
    const hint = config.status === 401 || config.status === 403
      ? `pawaPay rejected this token. Check it is a ${environment} token with deposit permission.`
      : "Could not reach pawaPay to check this token. Try again in a moment.";
    throw new HttpsError("permission-denied", hint);
  }

  await secretRef(operatorId).set({
    [environment]: pawapay.encryptToken(token, BIZ_CREDENTIALS_KEY.value(), operatorId, environment),
    updatedAt: FieldValue().serverTimestamp(),
  }, { merge: true });

  const summary = {
    connected: true,
    companyName: config.companyName,
    signedCallbacks: config.signedCallbacks,
    providers: config.providers.length ? config.providers : pawapay.DEFAULT_TZ_PROVIDERS,
    tokenLast4: token.slice(-4),
    connectedAt: FieldValue().serverTimestamp(),
    connectedBy: uid,
  };
  await operatorRef(operatorId).update({
    [`pawapay.${environment}`]: summary,
    paymentMode: PAYMENT_MODES.OPERATOR_OWN,
    updatedAt: FieldValue().serverTimestamp(),
  });

  return {
    success: true,
    environment,
    companyName: config.companyName,
    providers: summary.providers,
  };
});

exports.bizDisconnectPawapay = onCall({ secrets: [BIZ_CREDENTIALS_KEY] }, async (request) => {
  const { operatorId, operator } = await resolveOperator(request);
  const environment = pawapay.cleanEnvironment(request.data?.environment);
  if (!environment) throw new HttpsError("invalid-argument", "Choose sandbox or production.");

  await secretRef(operatorId).set({
    [environment]: FieldValue().delete(),
    updatedAt: FieldValue().serverTimestamp(),
  }, { merge: true });

  const update = {
    [`pawapay.${environment}`]: FieldValue().delete(),
    updatedAt: FieldValue().serverTimestamp(),
  };
  // A live operator without a production token can't collect rent, so step
  // them back to review rather than leaving a broken "live" badge.
  if (environment === "production" && operator.status === "live") {
    update.status = "in_review";
  }
  await operatorRef(operatorId).update(update);
  return { success: true };
});

exports.bizCreateTestDeposit = onCall({ secrets: [BIZ_CREDENTIALS_KEY] }, async (request) => {
  const { uid, operatorId, operator } = await resolveOperator(request);
  const environment = "sandbox";
  if (!operator.pawapay?.sandbox?.connected) {
    throw new HttpsError("failed-precondition", "Connect your sandbox pawaPay token first.");
  }

  const phone = pawapay.normalizePhone(request.data?.phone);
  const provider = pawapay.normalizeProvider(request.data?.provider);
  const amount = pawapay.cleanAmount(request.data?.amount || 1000);
  if (!phone) throw new HttpsError("invalid-argument", "Enter a Tanzania mobile number, e.g. 0712 345 678.");
  if (!provider) throw new HttpsError("invalid-argument", "Choose the mobile money network.");
  if (!amount || Number(amount) > TEST_DEPOSIT_MAX_TZS) {
    throw new HttpsError("invalid-argument", `Test amount must be between 1 and ${TEST_DEPOSIT_MAX_TZS} TZS.`);
  }

  const { depositId, pawaPayStatus } = await createDepositForOperator({
    operatorId,
    operator,
    environment,
    purpose: "test",
    phone,
    provider,
    amount,
    customerMessage: pawapay.cleanCustomerMessage("Kampasika Biz test"),
    createdBy: uid,
    beforeSend: (newDepositId) => operatorRef(operatorId).update({
      "pawapay.testDeposit": {
        depositId: newDepositId,
        environment,
        amount: Number(amount),
        provider,
        status: "pending",
        pawaPayStatus: "",
        createdAt: FieldValue().serverTimestamp(),
      },
      updatedAt: FieldValue().serverTimestamp(),
    }),
  });

  return { success: true, depositId, pawaPayStatus };
});

exports.bizRefreshDeposit = onCall({ secrets: [BIZ_CREDENTIALS_KEY] }, async (request) => {
  const uid = requireUid(request);
  const depositId = String(request.data?.depositId || "").trim();
  if (!depositId) throw new HttpsError("invalid-argument", "Missing deposit.");

  const snap = await depositRef(depositId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Payment not found.");
  const data = snap.data() || {};
  if (data.operatorId !== uid && data.createdBy !== uid && !isBizAdmin(uid)) {
    throw new HttpsError("permission-denied", "This payment belongs to another business.");
  }

  const token = await loadToken(data.operatorId, data.environment);
  if (!token) throw new HttpsError("failed-precondition", "The pawaPay token for this payment is no longer connected.");

  const result = await pawapay.checkDeposit(data.environment, token, depositId);
  if (!result.ok) throw new HttpsError("unavailable", "Could not reach pawaPay. Try again in a moment.");
  if (!result.found) return { success: true, status: data.status, pawaPayStatus: data.pawaPayStatus, found: false };

  const updated = await recordDepositStatus(depositId, result.deposit, { lastCheckedAt: FieldValue().serverTimestamp() });
  return { success: true, status: updated?.status, pawaPayStatus: updated?.pawaPayStatus, found: true };
});

// ─── Callback ───
// The operator sets their pawaPay deposit callback URL to
//   https://us-central1-ludepoz.cloudfunctions.net/bizPawapayCallback/<operatorId>
// We never trust the callback body: it only tells us WHICH deposit changed,
// and we then ask pawaPay directly (with that operator's token) for the real
// status. So an unsigned or forged callback can't mark anything as paid.
exports.bizPawapayCallback = onRequest({ cors: false, secrets: [BIZ_CREDENTIALS_KEY] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const lastSegment = String(req.path || "").split("/").filter(Boolean).pop() || "";
  const operatorIdFromPath = lastSegment === "bizPawapayCallback" ? "" : lastSegment;
  const depositId = String(req.body?.depositId || "").trim();
  if (!depositId) {
    res.status(200).json({ success: false, reason: "not_a_deposit" });
    return;
  }

  try {
    const snap = await depositRef(depositId).get();
    if (!snap.exists) {
      res.status(200).json({ success: false, reason: "unknown_deposit" });
      return;
    }
    const data = snap.data() || {};
    if (operatorIdFromPath && operatorIdFromPath !== data.operatorId) {
      console.error("Biz callback operator mismatch", { depositId, operatorIdFromPath, owner: data.operatorId });
      res.status(200).json({ success: false, reason: "operator_mismatch" });
      return;
    }

    const token = await loadToken(data.operatorId, data.environment);
    if (!token) {
      res.status(200).json({ success: false, reason: "token_missing" });
      return;
    }
    const result = await pawapay.checkDeposit(data.environment, token, depositId);
    if (result.ok && result.found) {
      await recordDepositStatus(depositId, result.deposit, { callbackReceivedAt: FieldValue().serverTimestamp() });
    }
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Biz callback failed", depositId, err);
    // 500 lets pawaPay retry later.
    res.status(500).json({ success: false });
  }
});

// ─── Admin review ───
const ADMIN_ACTIONS = new Set(["approve_documents", "request_changes", "set_live", "suspend", "reopen"]);

exports.bizAdminReview = onCall(async (request) => {
  const uid = requireUid(request);
  if (!isBizAdmin(uid)) throw new HttpsError("permission-denied", "Only Kampasika admins can review businesses.");

  const operatorId = String(request.data?.operatorId || "").trim();
  const action = String(request.data?.action || "").trim();
  const note = String(request.data?.note || "").trim().slice(0, 500);
  if (!operatorId || !ADMIN_ACTIONS.has(action)) throw new HttpsError("invalid-argument", "Missing business or action.");

  const snap = await operatorRef(operatorId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Business not found.");
  const operator = snap.data() || {};

  const stamp = { reviewedBy: uid, reviewedAt: FieldValue().serverTimestamp(), note };
  const update = { updatedAt: FieldValue().serverTimestamp() };

  if (action === "approve_documents") {
    update.review = { ...(operator.review || {}), documents: "approved", ...stamp };
  } else if (action === "request_changes") {
    update.review = { ...(operator.review || {}), documents: "changes_requested", ...stamp };
    update.status = "needs_changes";
  } else if (action === "set_live") {
    if (operator.review?.documents !== "approved") {
      throw new HttpsError("failed-precondition", "Approve the documents first.");
    }
    if (!operator.pawapay?.production?.connected) {
      throw new HttpsError("failed-precondition", "The business hasn't connected a production pawaPay token yet.");
    }
    update.status = "live";
    update.liveAt = FieldValue().serverTimestamp();
    update.paymentMode = operator.paymentMode || PAYMENT_MODES.OPERATOR_OWN;
    update.review = { ...(operator.review || {}), live: "approved", ...stamp };
  } else if (action === "suspend") {
    update.status = "suspended";
    update.review = { ...(operator.review || {}), live: "suspended", ...stamp };
  } else if (action === "reopen") {
    update.status = "in_review";
    update.review = { ...(operator.review || {}), ...stamp };
  }

  await operatorRef(operatorId).update(update);

  // Same in-app notifications collection the verification flow uses.
  const messages = {
    approve_documents: "Your Kampasika Biz documents were approved.",
    request_changes: `Kampasika Biz needs a few changes to your business profile.${note ? ` ${note}` : ""}`,
    set_live: "Your business is live on Kampasika Biz. You can now collect rent through your own pawaPay account.",
    suspend: `Your Kampasika Biz account has been paused.${note ? ` ${note}` : ""}`,
    reopen: "Your Kampasika Biz profile is back in review.",
  };
  await db().collection("notifications").add({
    userId: operatorId,
    type: "biz_review",
    title: "Kampasika Biz",
    message: messages[action],
    read: false,
    createdAt: FieldValue().serverTimestamp(),
  }).catch(() => {});

  return { success: true, status: update.status || operator.status || "draft" };
});

// Used by bizRent.js (rent payments).
module.exports.createDepositForOperator = createDepositForOperator;
module.exports.PAYMENT_MODES = PAYMENT_MODES;
module.exports.BIZ_CREDENTIALS_KEY = BIZ_CREDENTIALS_KEY;
