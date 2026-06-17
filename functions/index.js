/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");

// Initialize Firebase Admin
initializeApp();

// Send notification when new message is created
exports.sendMessageNotification = onDocumentCreated(
  "conversations/{conversationId}/messages/{messageId}",
  async (event) => {
    const message = event.data.data();
    const conversationId = event.params.conversationId;

    console.log("New message:", message);

    try {
      // Get conversation details
      const conversationDoc = await getFirestore()
        .collection("conversations")
        .doc(conversationId)
        .get();

      if (!conversationDoc.exists) {
        console.log("Conversation not found");
        return null;
      }

      const conversation = conversationDoc.data();

      // Determine recipient
      const recipientId = message.senderId === conversation.buyerId
        ? conversation.sellerId
        : conversation.buyerId;

      console.log("Recipient:", recipientId);

      // Get recipient's FCM token
      const userDoc = await getFirestore()
        .collection("users")
        .doc(recipientId)
        .get();

      if (!userDoc.exists) {
        console.log("User not found");
        return null;
      }

      const fcmToken = userDoc.data().fcmToken;

      if (!fcmToken) {
        console.log("No FCM token for user:", recipientId);
        return null;
      }

      // Send notification
      const payload = {
        notification: {
          title: `New message from ${message.senderName}`,
          body: message.text.substring(0, 100),
        },
        data: {
          type: "message",
          conversationId: conversationId,
          senderId: message.senderId,
        },
        token: fcmToken,
      };

      await getMessaging().send(payload);
      console.log("Notification sent successfully!");

      return null;
    } catch (error) {
      console.error("Error sending notification:", error);
      return null;
    }
  }
);

// Send notification when new listing is created
exports.sendNewListingNotification = onDocumentCreated(
  "listings/{listingId}",
  async (event) => {
    const listing = event.data.data();
    const listingId = event.params.listingId;

    console.log("New listing:", listing);

    try {
      // Get all users from the same university with notifications enabled
      const usersSnapshot = await getFirestore()
        .collection("users")
        .where("universityId", "==", listing.universityId)
        .where("fcmToken", "!=", null)
        .get();

      const tokens = [];

      usersSnapshot.forEach((doc) => {
        // Don't send to the listing creator
        if (doc.id !== listing.userId && doc.data().fcmToken) {
          tokens.push(doc.data().fcmToken);
        }
      });

      if (tokens.length === 0) {
        console.log("No users to notify");
        return null;
      }

      console.log(`Sending to ${tokens.length} users`);

      // Send to multiple devices
      const payload = {
        notification: {
          title: `New listing: ${listing.title}`,
          body: `${listing.price.toLocaleString()} TSh - ${listing.category}`,
        },
        data: {
          type: "listing",
          listingId: listingId,
        },
      };

      // Send to each token (Firebase v2 doesn't support batch sends like v1)
      const promises = tokens.map((token) =>
        getMessaging().send({...payload, token})
      );

      await Promise.all(promises);
      console.log(`Notifications sent to ${tokens.length} users`);

      return null;
    } catch (error) {
      console.error("Error sending notifications:", error);
      return null;
    }
  }
);

// Send push notification for in-app notification documents.
exports.sendInAppNotificationPush = onDocumentCreated(
  "notifications/{notificationId}",
  async (event) => {
    const notification = event.data.data();

    if (!notification || !notification.userId) {
      console.log("Notification missing userId");
      return null;
    }

    try {
      const userDoc = await getFirestore()
        .collection("users")
        .doc(notification.userId)
        .get();

      if (!userDoc.exists) {
        console.log("Notification recipient not found:", notification.userId);
        return null;
      }

      const fcmToken = userDoc.data().fcmToken;
      if (!fcmToken) {
        console.log("No FCM token for notification recipient:", notification.userId);
        return null;
      }

      const payload = {
        notification: {
          title: String(notification.title || "Kampasika"),
          body: String(notification.message || "You have a new notification").substring(0, 180),
        },
        data: {
          type: String(notification.type || "notification"),
          notificationId: event.params.notificationId,
          groupId: String(notification.groupId || ""),
          messageId: String(notification.messageId || ""),
        },
        token: fcmToken,
      };

      await getMessaging().send(payload);
      console.log("In-app notification push sent:", event.params.notificationId);
      return null;
    } catch (error) {
      console.error("Error sending in-app notification push:", error);
      return null;
    }
  }
);
exports.kampasikaSearch = require('./searchFunction').kampasikaSearch;
exports.kampasikaCreateAssist = require('./createAssistFunction').kampasikaCreateAssist;
const admin = require("firebase-admin");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const crypto = require("crypto");

const ADMIN_UIDS = new Set(["LTrwUHH6utQJGiw4lcsKflzXvPR2"]);
const KAMPASIKA_WEB_API_KEY = defineSecret("KAMPASIKA_WEB_API_KEY");
const AFRICASTALKING_API_KEY = defineSecret("AFRICASTALKING_API_KEY");
const AFRICASTALKING_USERNAME = defineSecret("AFRICASTALKING_USERNAME");
const AZAMPAY_APP_NAME = defineSecret("AZAMPAY_APP_NAME");
const AZAMPAY_CLIENT_ID = defineSecret("AZAMPAY_CLIENT_ID");
const AZAMPAY_CLIENT_SECRET = defineSecret("AZAMPAY_CLIENT_SECRET");

function assertAdmin(request) {
  const callerUid = request.auth && request.auth.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }
  if (!ADMIN_UIDS.has(callerUid)) {
    throw new HttpsError("permission-denied", "Only admins can do this.");
  }
  return callerUid;
}

exports.adminSendPasswordReset = onCall({ secrets: [KAMPASIKA_WEB_API_KEY] }, async (request) => {
  assertAdmin(request);

  const email = String(request.data && request.data.email || "").trim().toLowerCase();
  if (!email) {
    throw new HttpsError("invalid-argument", "Missing user email.");
  }

  const apiKey = KAMPASIKA_WEB_API_KEY.value();
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "Set KAMPASIKA_WEB_API_KEY in your Cloud Functions environment."
    );
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType: "PASSWORD_RESET",
        email,
      }),
    }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new HttpsError("internal", body.error?.message || "Password reset failed.");
  }

  return { success: true };
});

function normalizeTanzaniaPhone(rawPhone) {
  const compact = String(rawPhone || "").replace(/\s+/g, "").replace(/-/g, "");
  if (/^0[67]\d{8}$/.test(compact)) return `+255${compact.slice(1)}`;
  if (/^255[67]\d{8}$/.test(compact)) return `+${compact}`;
  if (/^\+255[67]\d{8}$/.test(compact)) return compact;
  return "";
}

function otpHash(uid, phone, code, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${uid}:${phone}:${code}`)
    .digest("hex");
}

async function sendAfricasTalkingSms({ apiKey, username, phone, message }) {
  const body = new URLSearchParams({
    username,
    to: phone,
    message,
    from: "KAMPASIKA",
  });

  const response = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      "apiKey": apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body,
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new HttpsError("internal", text || "Africa's Talking failed to send SMS.");
  }

  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {}
  const recipient = payload?.SMSMessageData?.Recipients?.[0];
  const status = String(recipient?.status || "").toLowerCase();
  if (status && !["success", "sent", "submitted", "queued"].includes(status)) {
    throw new HttpsError("internal", recipient?.status || "Africa's Talking did not accept the SMS.");
  }
}

exports.requestPhoneOtp = onCall({ secrets: [AFRICASTALKING_API_KEY, AFRICASTALKING_USERNAME] }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const phone = normalizeTanzaniaPhone(request.data && request.data.phone);
  if (!phone) {
    throw new HttpsError("invalid-argument", "Enter a valid Tanzania phone number.");
  }

  const apiKey = AFRICASTALKING_API_KEY.value();
  const username = AFRICASTALKING_USERNAME.value();
  if (!apiKey || !username) {
    throw new HttpsError("failed-precondition", "Africa's Talking SMS credentials are not configured.");
  }

  const code = String(crypto.randomInt(100000, 999999));
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const db = getFirestore();

  await db.collection("phoneOtps").doc(uid).set({
    phone,
    codeHash: otpHash(uid, phone, code, apiKey),
    attempts: 0,
    expiresAt,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await sendAfricasTalkingSms({
    apiKey,
    username,
    phone,
    message: `Kampasika verification code: ${code}. Do not share this code.`,
  });

  await db.collection("users").doc(uid).set({
    phone,
    phoneVerified: false,
    phoneVerificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { success: true, phone };
});

exports.verifyPhoneOtp = onCall({ secrets: [AFRICASTALKING_API_KEY] }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const code = String(request.data && request.data.code || "").trim();
  if (!/^\d{6}$/.test(code)) {
    throw new HttpsError("invalid-argument", "Enter the 6 digit code.");
  }

  const apiKey = AFRICASTALKING_API_KEY.value();
  const db = getFirestore();
  const otpRef = db.collection("phoneOtps").doc(uid);
  const otpSnap = await otpRef.get();

  if (!otpSnap.exists) {
    throw new HttpsError("not-found", "Request a new code first.");
  }

  const otp = otpSnap.data();
  if (!otp || Date.now() > Number(otp.expiresAt || 0)) {
    await otpRef.delete();
    throw new HttpsError("deadline-exceeded", "Code expired. Request a new one.");
  }

  if (Number(otp.attempts || 0) >= 5) {
    await otpRef.delete();
    throw new HttpsError("resource-exhausted", "Too many attempts. Request a new code.");
  }

  const expectedHash = otpHash(uid, otp.phone, code, apiKey);
  if (expectedHash !== otp.codeHash) {
    await otpRef.update({
      attempts: admin.firestore.FieldValue.increment(1),
      lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw new HttpsError("permission-denied", "Wrong code.");
  }

  await db.collection("users").doc(uid).set({
    phone: otp.phone,
    phoneVerified: true,
    phoneVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await otpRef.delete();

  return { success: true, phone: otp.phone };
});

const AZAMPAY_AUTH_BASE_URL = "https://authenticator-sandbox.azampay.co.tz";
const AZAMPAY_CHECKOUT_BASE_URL = "https://sandbox.azampay.co.tz";
const AZAMPAY_CALLBACK_PUBLIC_KEY_CACHE_MS = 60 * 60 * 1000;
let azamPayTokenCache = { token: "", expiresAt: 0 };
let azamPayPublicKeyCache = { key: "", loadedAt: 0 };

function normalizeAzamPayPhone(rawPhone) {
  const compact = String(rawPhone || "").replace(/\s+/g, "").replace(/-/g, "").replace(/^\+/, "");
  if (/^0[67]\d{8}$/.test(compact)) return `255${compact.slice(1)}`;
  if (/^255[67]\d{8}$/.test(compact)) return compact;
  return "";
}

function normalizeAzamPayProvider(value) {
  const clean = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  const providers = {
    airtel: "Airtel",
    airtelmoney: "Airtel",
    tigo: "Tigo",
    tigopesa: "Tigo",
    yas: "Tigo",
    halopesa: "Halopesa",
    halo: "Halopesa",
    azampesa: "Azampesa",
    azam: "Azampesa",
    mpesa: "Mpesa",
    vodacom: "Mpesa",
    "m-pesa": "Mpesa",
  };
  return providers[clean] || "";
}

function azamPayPaymentPath({ groupId, collectionId, paymentId }) {
  return admin.firestore()
    .collection("groups").doc(groupId)
    .collection("collections").doc(collectionId)
    .collection("payments").doc(paymentId);
}

async function getAzamPayToken() {
  if (azamPayTokenCache.token && Date.now() < azamPayTokenCache.expiresAt - 60000) {
    return azamPayTokenCache.token;
  }

  const appName = AZAMPAY_APP_NAME.value();
  const clientId = AZAMPAY_CLIENT_ID.value();
  const clientSecret = AZAMPAY_CLIENT_SECRET.value();
  if (!appName || !clientId || !clientSecret) {
    throw new HttpsError("failed-precondition", "AzamPay credentials are not configured.");
  }

  const response = await fetch(`${AZAMPAY_AUTH_BASE_URL}/AppRegistration/GenerateToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appName, clientId, clientSecret }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !payload?.data?.accessToken) {
    throw new HttpsError("internal", payload?.message || "AzamPay token generation failed.");
  }

  const expiresAt = payload.data.expire ? new Date(payload.data.expire).getTime() : Date.now() + 20 * 60 * 1000;
  azamPayTokenCache = { token: payload.data.accessToken, expiresAt };
  return azamPayTokenCache.token;
}

async function getAzamPayPublicKey() {
  if (azamPayPublicKeyCache.key && Date.now() - azamPayPublicKeyCache.loadedAt < AZAMPAY_CALLBACK_PUBLIC_KEY_CACHE_MS) {
    return azamPayPublicKeyCache.key;
  }
  const response = await fetch(`${AZAMPAY_CHECKOUT_BASE_URL}/azampay/v1/public-key?format=Pem`);
  const text = await response.text().catch(() => "");
  if (!response.ok || !text) return "";
  azamPayPublicKeyCache = { key: text, loadedAt: Date.now() };
  return text;
}

async function verifyAzamPayCallbackSignature(payload) {
  const signature = payload.signature || payload.Signature;
  if (!signature) return false;
  const publicKey = await getAzamPayPublicKey();
  if (!publicKey) return false;
  const signedText = [
    payload.utilityref || payload.utilityRef || payload.UtilityRef,
    payload.externalreference || payload.externalReference || payload.ExternalReference,
    payload.transactionstatus || payload.transactionStatus || payload.TransactionStatus,
    payload.operator || payload.Operator,
  ].filter(value => value !== undefined && value !== null).join("");
  if (!signedText) return false;
  try {
    return crypto.verify(
      "RSA-SHA256",
      Buffer.from(signedText),
      publicKey,
      Buffer.from(signature, "base64")
    );
  } catch (err) {
    console.error("AzamPay signature verification failed:", err);
    return false;
  }
}

exports.createAzamPayCheckout = onCall({
  secrets: [AZAMPAY_APP_NAME, AZAMPAY_CLIENT_ID, AZAMPAY_CLIENT_SECRET],
}, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const groupId = String(request.data?.groupId || "").trim();
  const collectionId = String(request.data?.collectionId || "").trim();
  const provider = normalizeAzamPayProvider(request.data?.provider);
  const accountNumber = normalizeAzamPayPhone(request.data?.phone);
  const selectedOption = String(request.data?.selectedOption || "").trim();

  if (!groupId || !collectionId) {
    throw new HttpsError("invalid-argument", "Missing group or collection.");
  }
  if (!provider) {
    throw new HttpsError("invalid-argument", "Choose a valid mobile money provider.");
  }
  if (!accountNumber) {
    throw new HttpsError("invalid-argument", "Enter a valid Tanzania mobile money number.");
  }

  const db = admin.firestore();
  const [groupSnap, collectionSnap, memberSnap, userSnap] = await Promise.all([
    db.collection("groups").doc(groupId).get(),
    db.collection("groups").doc(groupId).collection("collections").doc(collectionId).get(),
    db.collection("groups").doc(groupId).collection("members").doc(uid).get(),
    db.collection("users").doc(uid).get(),
  ]);

  if (!groupSnap.exists || !collectionSnap.exists) {
    throw new HttpsError("not-found", "Group payment was not found.");
  }
  const group = groupSnap.data() || {};
  const member = memberSnap.exists ? memberSnap.data() || {} : {};
  if (group.ownerUid !== uid && group.adminUid !== uid && !["active", "pending"].includes(member.status)) {
    throw new HttpsError("permission-denied", "Join this group before paying.");
  }

  const collectionItem = collectionSnap.data() || {};
  const amount = Number(collectionItem.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("failed-precondition", "This item does not require payment.");
  }

  const options = String(collectionItem.options || "").split(",").map(item => item.trim()).filter(Boolean);
  if (collectionItem.collectionType === "order" && options.length > 0 && !selectedOption) {
    throw new HttpsError("invalid-argument", "Choose an option or size first.");
  }

  const token = await getAzamPayToken();
  const externalId = `kp_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const userProfile = userSnap.exists ? userSnap.data() || {} : {};
  const studentName = userProfile.username || userProfile.name || request.auth.token?.name || request.auth.token?.email || "Member";
  const paymentRef = azamPayPaymentPath({ groupId, collectionId, paymentId: uid });
  const transactionRef = db.collection("azamPayTransactions").doc(externalId);

  await paymentRef.set({
    uid,
    studentName,
    phone: accountNumber,
    payerName: studentName,
    paymentRef: externalId,
    selectedOption,
    amountDue: amount,
    amountPaid: 0,
    provider,
    status: "pending",
    paymentProvider: "AzamPay",
    azamPayExternalId: externalId,
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await transactionRef.set({
    externalId,
    groupId,
    collectionId,
    paymentId: uid,
    uid,
    amount,
    currency: "TZS",
    provider,
    accountNumber,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const response = await fetch(`${AZAMPAY_CHECKOUT_BASE_URL}/azampay/mno/checkout`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accountNumber,
      amount: String(amount),
      currency: "TZS",
      externalId,
      provider,
      additionalProperties: {
        groupId,
        collectionId,
        paymentId: uid,
        collectionTitle: collectionItem.title || "KAMPASIKA payment",
      },
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    await transactionRef.set({
      status: "failed_to_start",
      azamPayResponse: payload || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await paymentRef.set({
      status: "pending",
      paymentProvider: "AzamPay",
      azamPayStartError: payload?.message || "AzamPay could not start checkout.",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    throw new HttpsError("internal", payload?.message || "AzamPay could not start checkout.");
  }

  await transactionRef.set({
    status: "checkout_started",
    azamPayTransactionId: payload?.transactionId || "",
    azamPayResponse: payload || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await paymentRef.set({
    status: "pending",
    azamPayTransactionId: payload?.transactionId || "",
    azamPayMessage: payload?.message || "Confirm payment on your phone.",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    success: true,
    externalId,
    transactionId: payload?.transactionId || "",
    message: payload?.message || "Confirm payment on your phone.",
  };
});

exports.azampayPaymentCallback = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const payload = req.body || {};
  const externalId = String(
    payload.externalreference ||
    payload.externalReference ||
    payload.ExternalReference ||
    payload.externalId ||
    ""
  ).trim();

  if (!externalId) {
    res.status(400).json({ success: false, message: "Missing external reference." });
    return;
  }

  const signatureOk = await verifyAzamPayCallbackSignature(payload);
  const db = admin.firestore();
  const transactionRef = db.collection("azamPayTransactions").doc(externalId);
  const transactionSnap = await transactionRef.get();
  if (!transactionSnap.exists) {
    await transactionRef.set({
      externalId,
      status: "unknown_reference",
      callback: payload,
      signatureVerified: signatureOk,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    res.status(200).json({ success: true });
    return;
  }

  const transaction = transactionSnap.data() || {};
  const statusText = String(
    payload.transactionstatus ||
    payload.transactionStatus ||
    payload.TransactionStatus ||
    payload.status ||
    ""
  ).toLowerCase();
  const paid = ["success", "successful", "completed", "paid", "approved"].some(item => statusText.includes(item));
  const failed = ["fail", "failed", "cancel", "cancelled", "rejected", "timeout"].some(item => statusText.includes(item));
  const nextStatus = paid ? "paid" : failed ? "failed" : "pending";
  const paymentRef = azamPayPaymentPath({
    groupId: transaction.groupId,
    collectionId: transaction.collectionId,
    paymentId: transaction.paymentId,
  });

  await db.runTransaction(async tx => {
    tx.set(transactionRef, {
      callback: payload,
      signatureVerified: signatureOk,
      callbackStatus: statusText,
      status: nextStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(paymentRef, {
      status: nextStatus,
      amountPaid: paid ? Number(transaction.amount || 0) : 0,
      paymentProvider: "AzamPay",
      paymentRef: externalId,
      azamPayExternalId: externalId,
      azamPayCallbackStatus: statusText,
      azamPayOperator: payload.operator || payload.Operator || transaction.provider || "",
      azamPayUtilityRef: payload.utilityref || payload.utilityRef || payload.UtilityRef || "",
      azamPaySignatureVerified: signatureOk,
      verifiedAt: paid ? admin.firestore.FieldValue.serverTimestamp() : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  res.status(200).json({ success: true });
});

exports.adminDeleteUser = onCall(async (request) => {
  const callerUid = assertAdmin(request);
  const uid = String(request.data && request.data.uid || "").trim();

  if (!uid) {
    throw new HttpsError("invalid-argument", "Missing user uid.");
  }
  if (uid === callerUid) {
    throw new HttpsError("failed-precondition", "Admins cannot delete their own account.");
  }

  const db = admin.firestore();
  const deleteRefs = [db.collection("users").doc(uid)];

  const collectionsToClean = [
    ["listings", "userId"],
    ["services", "userId"],
    ["rooms", "userId"],
    ["searchAlerts", "userId"],
    ["verificationRequests", "userId"],
    ["notifications", "userId"],
  ];

  for (const [collectionName, field] of collectionsToClean) {
    const snap = await db.collection(collectionName).where(field, "==", uid).limit(400).get();
    snap.docs.forEach((doc) => deleteRefs.push(doc.ref));
  }

  for (let i = 0; i < deleteRefs.length; i += 450) {
    const batch = db.batch();
    deleteRefs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  await admin.auth().deleteUser(uid);

  return { success: true };
});

function isConvertibleDocumentResource(resource) {
  const text = [
    resource.resourceType,
    resource.fileName,
    resource.title,
    resource.text,
    resource.url,
  ].filter(Boolean).join(" ").toLowerCase();
  return /\b(ppt|pptx|doc|docx)\b/i.test(text) || /\.(pptx?|docx?)(\?|#|\s|$)/i.test(text);
}

function safeFileName(value) {
  return String(value || "document")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100) || "document";
}

async function assertGroupManager(db, groupId, uid) {
  const [groupSnap, memberSnap] = await Promise.all([
    db.collection("groups").doc(groupId).get(),
    db.collection("groups").doc(groupId).collection("members").doc(uid).get(),
  ]);
  if (!groupSnap.exists) {
    throw new HttpsError("not-found", "Group not found.");
  }
  const group = groupSnap.data() || {};
  const member = memberSnap.exists ? (memberSnap.data() || {}) : {};
  const manages = group.ownerUid === uid
    || group.adminUid === uid
    || ["owner", "admin", "treasurer"].includes(member.role);
  if (!manages) {
    throw new HttpsError("permission-denied", "Only group leaders can prepare document previews.");
  }
  return group;
}
