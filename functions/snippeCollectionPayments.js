const admin = require("firebase-admin");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const crypto = require("crypto");

const SNIPPE_API_KEY = defineSecret("SNIPPE_API_KEY");
const SNIPPE_WEBHOOK_SECRET = defineSecret("SNIPPE_WEBHOOK_SECRET");
const SNIPPE_API_BASE_URL = "https://api.snippe.sh";
const SUPPORTED_COLLECTION_SCOPES = new Set(["public", "group"]);
const PAYMENT_EVENTS = new Set([
  "payment.completed",
  "payment.failed",
  "payment.voided",
  "payment.expired",
]);

function normalizeSnippePhone(rawPhone) {
  const compact = String(rawPhone || "").replace(/[^\d+]/g, "");
  if (/^0[67]\d{8}$/.test(compact)) return `255${compact.slice(1)}`;
  if (/^255[67]\d{8}$/.test(compact)) return compact;
  if (/^\+255[67]\d{8}$/.test(compact)) return compact.slice(1);
  return "";
}

function cleanAmount(rawAmount) {
  const amount = Number(rawAmount);
  if (!Number.isInteger(amount) || amount < 500) {
    throw new HttpsError("invalid-argument", "Amount must be at least TZS 500.");
  }
  return amount;
}

function cleanNonNegativeAmount(rawAmount, fallback = 0) {
  const amount = Number(rawAmount ?? fallback);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount);
}

function deriveAmountDue(requestedAmountDue, collectionData, amount) {
  const rawDue = requestedAmountDue
    ?? collectionData.amountDue
    ?? collectionData.amount
    ?? collectionData.price
    ?? amount;
  return cleanNonNegativeAmount(rawDue, amount) || amount;
}

function deriveContributionStatus(amountPaidGross, amountDue) {
  if (amountPaidGross <= 0) return "unpaid";
  if (amountDue > 0 && amountPaidGross < amountDue) return "partial";
  if (amountDue > 0 && amountPaidGross > amountDue) return "overpaid";
  return "paid";
}

function countDelta(previousStatus, nextStatus) {
  const delta = {
    paidCount: 0,
    partialCount: 0,
    overpaidCount: 0,
  };
  const countable = {
    paid: "paidCount",
    partial: "partialCount",
    overpaid: "overpaidCount",
  };
  if (countable[previousStatus]) delta[countable[previousStatus]] -= 1;
  if (countable[nextStatus]) delta[countable[nextStatus]] += 1;
  return delta;
}

function buildCollectionPath({ scope, groupId, collectionId }) {
  if (scope === "group") {
    if (!groupId) {
      throw new HttpsError("invalid-argument", "Missing group id.");
    }
    return `groups/${groupId}/collections/${collectionId}`;
  }
  return `collections/${collectionId}`;
}

function buildContributorPath({ collectionPath, contributorId }) {
  return `${collectionPath}/contributors/${contributorId}`;
}

async function assertCanPayCollection(db, { scope, groupId, collectionId, uid }) {
  const collectionPath = buildCollectionPath({ scope, groupId, collectionId });
  const collectionRef = db.doc(collectionPath);
  const collectionSnap = await collectionRef.get();
  if (!collectionSnap.exists) {
    throw new HttpsError("not-found", "Collection not found.");
  }

  if (scope === "group") {
    const memberSnap = await db
      .collection("groups")
      .doc(groupId)
      .collection("members")
      .doc(uid)
      .get();
    if (!memberSnap.exists) {
      throw new HttpsError("permission-denied", "Join this group before paying.");
    }
  }

  const collectionData = collectionSnap.data() || {};
  if (collectionData.active === false || collectionData.status === "cancelled") {
    throw new HttpsError("failed-precondition", "This collection is not accepting payments.");
  }

  return { collectionRef, collectionData, collectionPath };
}

function verifySnippeSignature(rawBody, headers, signingKey) {
  const timestamp = headers["x-webhook-timestamp"];
  const signature = headers["x-webhook-signature"];
  if (!timestamp || !signature) return false;

  const eventTime = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(eventTime) || Math.abs(now - eventTime) > 300) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", signingKey)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function mapSnippePaymentStatus(eventType, dataStatus) {
  if (eventType === "payment.completed" || dataStatus === "completed") return "paid";
  if (eventType === "payment.failed" || dataStatus === "failed") return "failed";
  if (eventType === "payment.voided" || dataStatus === "voided") return "voided";
  if (eventType === "payment.expired" || dataStatus === "expired") return "expired";
  return "pending";
}

function extractEvent(req) {
  const body = req.body || {};
  const eventType = body.type || body.event || req.get("x-webhook-event") || "";
  const data = body.data || body;
  return { eventId: body.id || `${eventType}:${data.reference || data.external_reference || ""}`, eventType, data };
}

exports.createSnippeCollectionPayment = onCall({
  secrets: [SNIPPE_API_KEY],
  region: "us-central1",
  cors: true,
  maxInstances: 20,
}, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Please sign in to pay.");
  }

  const data = request.data || {};
  const scope = String(data.scope || "public").trim();
  const collectionId = String(data.collectionId || "").trim();
  const groupId = String(data.groupId || "").trim();
  if (!SUPPORTED_COLLECTION_SCOPES.has(scope) || !collectionId) {
    throw new HttpsError("invalid-argument", "Missing collection details.");
  }

  const amount = cleanAmount(data.amount);
  const phone = normalizeSnippePhone(data.phone);
  if (!phone) {
    throw new HttpsError("invalid-argument", "Enter a valid Tanzania phone number.");
  }

  const firstName = String(data.firstName || data.name || "Kampasika").trim().slice(0, 60) || "Kampasika";
  const lastName = String(data.lastName || "Member").trim().slice(0, 60) || "Member";
  const email = String(data.email || `${uid}@kampasika.local`).trim().slice(0, 120);
  const selectedOption = String(data.selectedOption || "").trim().slice(0, 120);
  const contributorId = String(data.memberId || data.contributorId || uid).trim();
  if (!contributorId || contributorId.includes("/")) {
    throw new HttpsError("invalid-argument", "Invalid contributor.");
  }

  const apiKey = SNIPPE_API_KEY.value();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "SNIPPE_API_KEY is not configured.");
  }

  const db = admin.firestore();
  const { collectionRef, collectionData, collectionPath } = await assertCanPayCollection(db, {
    scope,
    groupId,
    collectionId,
    uid,
  });

  const amountDue = deriveAmountDue(data.amountDue, collectionData, amount);
  const allowPartialPayments = Boolean(collectionData.allowPartialPayments || data.allowPartialPayments);
  if (amountDue > 0 && amount < amountDue && !allowPartialPayments) {
    throw new HttpsError(
      "failed-precondition",
      "This collection does not allow partial payments."
    );
  }

  const registeredPhone = normalizeSnippePhone(
    data.registeredPhone || data.memberPhone || data.accountPhone || ""
  );
  const paidByDifferentNumber = Boolean(registeredPhone && registeredPhone !== phone);
  const contributorPath = buildContributorPath({ collectionPath, contributorId });
  const attemptRef = db.collection("collectionPaymentAttempts").doc();
  const idempotencyKey = attemptRef.id.slice(0, 30);
  const webhookUrl = data.webhookUrl || process.env.SNIPPE_WEBHOOK_URL || "";
  const metadata = {
    provider: "snippe",
    attempt_id: attemptRef.id,
    collection_scope: scope,
    collection_id: collectionId,
    collection_path: collectionPath,
    group_id: groupId || "",
    user_id: uid,
    contributor_id: contributorId,
    contributor_path: contributorPath,
  };
  if (selectedOption) metadata.selected_option = selectedOption;

  await attemptRef.set({
    provider: "snippe",
    providerReference: null,
    idempotencyKey,
    status: "creating",
    paymentStatus: "pending",
    collectionScope: scope,
    collectionId,
    groupId: groupId || null,
    collectionPath,
    collectionTitle: collectionData.title || collectionData.name || "",
    userId: uid,
    contributorId,
    contributorPath,
    amount,
    amountDue,
    grossAmount: amount,
    currency: "TZS",
    phone,
    payerPhone: phone,
    registeredPhone: registeredPhone || null,
    paidByDifferentNumber,
    allowPartialPayments,
    selectedOption,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const payload = {
    payment_type: "mobile",
    details: { amount, currency: "TZS" },
    phone_number: phone,
    customer: { firstname: firstName, lastname: lastName, email },
    metadata,
  };
  if (webhookUrl) payload.webhook_url = webhookUrl;

  const response = await fetch(`${SNIPPE_API_BASE_URL}/v1/payments`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    await attemptRef.update({
      status: "failed_to_create",
      providerError: responseBody.error_code || responseBody.message || response.statusText,
      providerResponse: responseBody,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw new HttpsError("internal", responseBody.message || "Could not start Snippe payment.");
  }

  const snippePayment = responseBody.data || {};
  await attemptRef.update({
    status: "pending",
    providerReference: snippePayment.reference || null,
    providerExpiresAt: snippePayment.expires_at || null,
    providerResponse: snippePayment,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await collectionRef.set({
    lastPaymentAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    success: true,
    attemptId: attemptRef.id,
    status: "pending",
    provider: "snippe",
    providerReference: snippePayment.reference || null,
    expiresAt: snippePayment.expires_at || null,
  };
});

exports.snippePaymentWebhook = onRequest({
  secrets: [SNIPPE_WEBHOOK_SECRET],
  region: "us-central1",
  cors: false,
  maxInstances: 20,
}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const signingKey = SNIPPE_WEBHOOK_SECRET.value();
  const rawBody = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body || {});
  if (!signingKey) {
    res.status(500).send("Webhook secret is not configured");
    return;
  }
  if (!verifySnippeSignature(rawBody, req.headers, signingKey)) {
    res.status(401).send("Invalid signature");
    return;
  }

  const { eventId, eventType, data } = extractEvent(req);
  if (!PAYMENT_EVENTS.has(eventType)) {
    res.status(200).json({ received: true, ignored: true });
    return;
  }

  const metadata = data.metadata || {};
  const attemptId = metadata.attempt_id || metadata.url_metadata?.attempt_id || "";
  if (!attemptId) {
    res.status(202).json({ received: true, warning: "Missing attempt id" });
    return;
  }

  const db = admin.firestore();
  const eventRef = db.collection("snippeWebhookEvents").doc(eventId || crypto.randomUUID());
  const eventSnap = await eventRef.get();
  if (eventSnap.exists) {
    res.status(200).json({ received: true, duplicate: true });
    return;
  }

  const attemptRef = db.collection("collectionPaymentAttempts").doc(attemptId);
  const status = mapSnippePaymentStatus(eventType, data.status);
  const webhookGrossAmount = cleanNonNegativeAmount(data.amount?.value || data.amount, 0);
  const currency = data.amount?.currency || "TZS";
  const settlement = data.settlement || {};
  const feeAmount = cleanNonNegativeAmount(
    settlement.fees?.value ?? data.payment_fee,
    0
  );
  const webhookNetAmount = cleanNonNegativeAmount(
    settlement.net?.value,
    Math.max(0, webhookGrossAmount - feeAmount)
  );

  await db.runTransaction(async (transaction) => {
    const attemptSnap = await transaction.get(attemptRef);
    const attempt = attemptSnap.exists ? (attemptSnap.data() || {}) : {};
    const collectionPath = attempt.collectionPath
      || metadata.collection_path
      || metadata.url_metadata?.collection_path
      || "";
    const contributorPath = attempt.contributorPath
      || metadata.contributor_path
      || metadata.url_metadata?.contributor_path
      || "";
    const contributorRef = contributorPath ? db.doc(contributorPath) : null;
    const contributorSnap = contributorRef ? await transaction.get(contributorRef) : null;
    const contributor = contributorSnap && contributorSnap.exists ? (contributorSnap.data() || {}) : {};
    const grossAmount = webhookGrossAmount || cleanNonNegativeAmount(attempt.grossAmount || attempt.amount, 0);
    const netAmount = webhookNetAmount || Math.max(0, grossAmount - feeAmount);
    const amountDue = cleanNonNegativeAmount(attempt.amountDue, grossAmount);

    transaction.set(eventRef, {
      eventId: eventId || null,
      eventType,
      attemptId,
      providerReference: data.reference || null,
      externalReference: data.external_reference || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      payload: req.body || {},
    });

    const attemptUpdate = {
      status,
      paymentStatus: status,
      providerReference: data.reference || null,
      externalReference: data.external_reference || null,
      providerChannel: data.channel || null,
      providerCustomer: data.customer || null,
      providerSettlement: data.settlement || null,
      webhookEventType: eventType,
      webhookReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
      grossAmount,
      feeAmount,
      netAmount,
      currency,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (status === "paid") {
      attemptUpdate.paidAt = data.completed_at || admin.firestore.FieldValue.serverTimestamp();
    }
    transaction.set(attemptRef, attemptUpdate, { merge: true });

    const wasAlreadyPaid = attempt.paymentStatus === "paid";
    if (status === "paid" && !wasAlreadyPaid && collectionPath) {
      const previousContributorStatus = contributor.paymentStatus || "unpaid";
      const previousPaidGross = cleanNonNegativeAmount(contributor.amountPaidGross, 0);
      const previousPaidNet = cleanNonNegativeAmount(contributor.amountPaidNet, 0);
      const previousFees = cleanNonNegativeAmount(contributor.totalFees, 0);
      const nextPaidGross = previousPaidGross + grossAmount;
      const nextContributorStatus = deriveContributionStatus(nextPaidGross, amountDue);
      const deltas = countDelta(previousContributorStatus, nextContributorStatus);

      transaction.set(db.doc(collectionPath), {
        totalCollected: admin.firestore.FieldValue.increment(grossAmount),
        totalCollectedGross: admin.firestore.FieldValue.increment(grossAmount),
        totalCollectedNet: admin.firestore.FieldValue.increment(netAmount),
        totalFees: admin.firestore.FieldValue.increment(feeAmount),
        paidCount: admin.firestore.FieldValue.increment(deltas.paidCount),
        partialCount: admin.firestore.FieldValue.increment(deltas.partialCount),
        overpaidCount: admin.firestore.FieldValue.increment(deltas.overpaidCount),
        lastPaidAt: admin.firestore.FieldValue.serverTimestamp(),
        currency,
      }, { merge: true });

      if (contributorRef) {
        transaction.set(contributorRef, {
          provider: "snippe",
          collectionPath,
          contributorId: attempt.contributorId || metadata.contributor_id || null,
          userId: attempt.userId || metadata.user_id || null,
          amountDue,
          amountPaidGross: nextPaidGross,
          amountPaidNet: previousPaidNet + netAmount,
          totalFees: previousFees + feeAmount,
          paymentStatus: nextContributorStatus,
          lastPaymentAttemptId: attemptId,
          lastProviderReference: data.reference || null,
          lastPayerPhone: data.customer?.phone || attempt.payerPhone || attempt.phone || null,
          registeredPhone: attempt.registeredPhone || null,
          paidByDifferentNumber: Boolean(attempt.paidByDifferentNumber),
          selectedOption: attempt.selectedOption || metadata.selected_option || "",
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: contributor.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
  });

  res.status(200).json({ received: true });
});

module.exports.SNIPPE_COLLECTION_PAYMENT_REQUIREMENTS = {
  secrets: ["SNIPPE_API_KEY", "SNIPPE_WEBHOOK_SECRET"],
  env: ["SNIPPE_WEBHOOK_URL"],
  minAmountTzs: 500,
  currency: "TZS",
  supportedScopes: Array.from(SUPPORTED_COLLECTION_SCOPES),
  partialPaymentFlag: "allowPartialPayments",
  contributorSummarySubcollection: "contributors",
  attemptCollection: "collectionPaymentAttempts",
  webhookEventCollection: "snippeWebhookEvents",
};
