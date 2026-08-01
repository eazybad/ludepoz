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
const PAWAPAY_API_TOKEN = defineSecret("PAWAPAY_API_TOKEN");

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

function normalizeAuthUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/^@+/, "").replace(/[^a-z0-9._-]/g, "");
}

function usernameToAuthEmail(username) {
  return `${normalizeAuthUsername(username)}@kampasika.local`;
}

function authOtpSignupError(err) {
  switch (err?.code) {
    case "auth/email-already-exists":
      return new HttpsError("already-exists", "That username is already taken. Please choose another one.");
    case "auth/invalid-phone-number":
      return new HttpsError("invalid-argument", "Enter a valid Tanzania phone number.");
    case "auth/invalid-email":
      return new HttpsError("invalid-argument", "Please choose a valid username.");
    default:
      console.error("OTP signup auth user error:", err);
      return new HttpsError("internal", "Could not create your account after verifying the OTP. Please try again.");
  }
}

async function createOrReuseAuthUserForOtpSignup({ usernameKey, phone, displayUsername }) {
  try {
    return await admin.auth().createUser({
      email: usernameToAuthEmail(usernameKey),
      phoneNumber: phone,
      displayName: displayUsername || `@${usernameKey}`,
    });
  } catch (err) {
    if (err?.code !== "auth/phone-number-already-exists") {
      throw authOtpSignupError(err);
    }

    const existingUser = await admin.auth().getUserByPhoneNumber(phone);
    const updates = {};
    if (!existingUser.email) updates.email = usernameToAuthEmail(usernameKey);
    if (!existingUser.displayName) updates.displayName = displayUsername || `@${usernameKey}`;
    if (Object.keys(updates).length) {
      try {
        await admin.auth().updateUser(existingUser.uid, updates);
      } catch (updateErr) {
        if (updateErr?.code === "auth/email-already-exists") {
          throw new HttpsError("already-exists", "That username is already taken. Please choose another one.");
        }
        console.warn("Could not update reused OTP auth user:", updateErr);
      }
    }
    return existingUser;
  }
}

async function findAuthUserByIdentifier(db, identifier) {
  const phone = normalizeTanzaniaPhone(identifier);
  if (phone) {
    const byPhone = await db.collection("users").where("phone", "==", phone).limit(1).get();
    if (!byPhone.empty) return { uid: byPhone.docs[0].id, data: byPhone.docs[0].data(), phone };
    return null;
  }

  const usernameKey = normalizeAuthUsername(identifier);
  if (!usernameKey) return null;
  const byUsername = await db.collection("users").where("usernameKey", "==", usernameKey).limit(1).get();
  if (byUsername.empty) return null;
  const data = byUsername.docs[0].data();
  return { uid: byUsername.docs[0].id, data, phone: data.phone || "" };
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
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "Africa's Talking SMS credentials are not configured.");
  }
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

exports.requestAuthOtp = onCall({ secrets: [AFRICASTALKING_API_KEY, AFRICASTALKING_USERNAME] }, async (request) => {
  const mode = request.data?.mode === "signup" ? "signup" : "login";
  const db = getFirestore();
  const apiKey = AFRICASTALKING_API_KEY.value();
  const username = AFRICASTALKING_USERNAME.value();
  if (!apiKey || !username) {
    throw new HttpsError("failed-precondition", "Africa's Talking SMS credentials are not configured.");
  }

  let phone = "";
  let usernameKey = "";
  let displayUsername = "";
  let uid = "";

  if (mode === "signup") {
    usernameKey = normalizeAuthUsername(request.data?.username);
    displayUsername = usernameKey ? `@${usernameKey}` : "";
    phone = normalizeTanzaniaPhone(request.data?.phone);
    if (!usernameKey || usernameKey.length < 3) {
      throw new HttpsError("invalid-argument", "Please choose a username with at least 3 letters or numbers.");
    }
    if (!phone) {
      throw new HttpsError("invalid-argument", "Enter a valid Tanzania phone number.");
    }

    const [byUsername, byPhone] = await Promise.all([
      db.collection("users").where("usernameKey", "==", usernameKey).limit(1).get(),
      db.collection("users").where("phone", "==", phone).limit(1).get(),
    ]);
    if (!byUsername.empty) {
      throw new HttpsError("already-exists", "That username is already taken. Please choose another one.");
    }
    if (!byPhone.empty) {
      throw new HttpsError("already-exists", "That phone number already has an account. Log in instead.");
    }
  } else {
    const identifier = String(request.data?.identifier || "").trim();
    const match = await findAuthUserByIdentifier(db, identifier);
    if (!match || !normalizeTanzaniaPhone(match.phone)) {
      throw new HttpsError("not-found", "No account found for that username or phone number.");
    }
    uid = match.uid;
    phone = normalizeTanzaniaPhone(match.phone);
    usernameKey = match.data?.usernameKey || normalizeAuthUsername(match.data?.username || match.data?.name);
    displayUsername = match.data?.username || match.data?.name || (usernameKey ? `@${usernameKey}` : "");
  }

  const requestId = crypto.randomUUID();
  const code = String(crypto.randomInt(100000, 999999));
  const expiresAt = Date.now() + 10 * 60 * 1000;

  await db.collection("phoneAuthOtps").doc(requestId).set({
    mode,
    uid: uid || null,
    phone,
    usernameKey: usernameKey || null,
    displayUsername: displayUsername || null,
    codeHash: otpHash(requestId, phone, code, apiKey),
    attempts: 0,
    expiresAt,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await sendAfricasTalkingSms({
    apiKey,
    username,
    phone,
    message: `Kampasika login code: ${code}. Do not share this code.`,
  });

  return { success: true, requestId, phone };
});

exports.verifyAuthOtp = onCall({ secrets: [AFRICASTALKING_API_KEY] }, async (request) => {
  const requestId = String(request.data?.requestId || "").trim();
  const code = String(request.data?.code || "").trim();
  if (!requestId) {
    throw new HttpsError("invalid-argument", "Request a new code first.");
  }
  if (!/^\d{6}$/.test(code)) {
    throw new HttpsError("invalid-argument", "Enter the 6 digit code.");
  }

  const apiKey = AFRICASTALKING_API_KEY.value();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "Africa's Talking SMS credentials are not configured.");
  }
  const db = getFirestore();
  const otpRef = db.collection("phoneAuthOtps").doc(requestId);
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

  const expectedHash = otpHash(requestId, otp.phone, code, apiKey);
  if (expectedHash !== otp.codeHash) {
    await otpRef.update({
      attempts: admin.firestore.FieldValue.increment(1),
      lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw new HttpsError("permission-denied", "Wrong code.");
  }

  let uid = otp.uid || "";
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (otp.mode === "signup") {
    const usernameKey = normalizeAuthUsername(otp.usernameKey);
    if (!usernameKey) {
      throw new HttpsError("invalid-argument", "Username is missing. Request a new code.");
    }
    const [byUsername, byPhone] = await Promise.all([
      db.collection("users").where("usernameKey", "==", usernameKey).limit(1).get(),
      db.collection("users").where("phone", "==", otp.phone).limit(1).get(),
    ]);
    if (!byUsername.empty || !byPhone.empty) {
      await otpRef.delete();
      throw new HttpsError("already-exists", "That account already exists. Log in instead.");
    }

    const authUser = await createOrReuseAuthUserForOtpSignup({
      usernameKey,
      phone: otp.phone,
      displayUsername: otp.displayUsername,
    });
    uid = authUser.uid;

    await db.collection("users").doc(uid).set({
      username: otp.displayUsername || `@${usernameKey}`,
      usernameKey,
      name: otp.displayUsername || `@${usernameKey}`,
      email: usernameToAuthEmail(usernameKey),
      phone: otp.phone,
      phoneVerified: true,
      phoneVerifiedAt: now,
      authProvider: "phoneOtp",
      hasPassword: false,
      passwordSetAt: null,
      accountType: "student",
      avatarUrl: null,
      bio: "",
      services: [],
      createdAt: now,
    });
  } else {
    if (!uid) {
      const match = await findAuthUserByIdentifier(db, otp.phone);
      uid = match?.uid || "";
    }
    if (!uid) {
      await otpRef.delete();
      throw new HttpsError("not-found", "No account found for that phone number.");
    }
    await db.collection("users").doc(uid).set({
      phone: otp.phone,
      phoneVerified: true,
      phoneVerifiedAt: now,
      lastOtpLoginAt: now,
    }, { merge: true });
  }

  let token = "";
  try {
    token = await admin.auth().createCustomToken(uid);
  } catch (err) {
    console.error("OTP custom token error:", err);
    throw new HttpsError("failed-precondition", "OTP was verified, but Firebase sign-in is not configured correctly yet.");
  }
  await otpRef.delete();
  return { success: true, token, uid, phone: otp.phone };
});

const AZAMPAY_AUTH_BASE_URL = "https://authenticator-sandbox.azampay.co.tz";
const AZAMPAY_CHECKOUT_BASE_URL = "https://sandbox.azampay.co.tz";
const PAWAPAY_SANDBOX_BASE_URL = "https://api.sandbox.pawapay.io";
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

function normalizePawaPayProvider(value) {
  const clean = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  const providers = {
    airtel: "AIRTEL_TZA",
    airtelmoney: "AIRTEL_TZA",
    vodacom: "VODACOM_TZA",
    mpesa: "VODACOM_TZA",
    "mpesatz": "VODACOM_TZA",
    tigo: "TIGO_TZA",
    tigopesa: "TIGO_TZA",
    yas: "TIGO_TZA",
    halotel: "HALOTEL_TZA",
    halopesa: "HALOTEL_TZA",
  };
  return providers[clean] || String(value || "").trim().toUpperCase();
}

function normalizePawaPayPhone(rawPhone) {
  const compact = String(rawPhone || "").replace(/\s+/g, "").replace(/-/g, "").replace(/^\+/, "");
  if (/^0[67]\d{8}$/.test(compact)) return `255${compact.slice(1)}`;
  if (/^255[67]\d{8}$/.test(compact)) return compact;
  return "";
}

function cleanPawaPayAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return amount % 1 === 0 ? String(amount) : amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function azamPayPaymentPath({ groupId, collectionId, paymentId }) {
  return admin.firestore()
    .collection("groups").doc(groupId)
    .collection("collections").doc(collectionId)
    .collection("payments").doc(paymentId);
}

function pawaPayMetadataValue(metadata, key) {
  if (!metadata) return "";
  if (Array.isArray(metadata)) {
    const row = metadata.find(item => item && Object.prototype.hasOwnProperty.call(item, key));
    return row ? String(row[key] || "") : "";
  }
  return String(metadata[key] || "");
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

// ---- PawaPay callback signature verification (RFC 9421 HTTP Message Signatures) ----
// Docs: https://docs.pawapay.io/v2/docs/signatures
// This only works once "Signed callbacks" is enabled in the PawaPay Dashboard —
// otherwise PawaPay never sends these headers and every callback will be rejected below.
const PAWAPAY_PUBLIC_KEY_CACHE_MS = 60 * 60 * 1000;
let pawaPayPublicKeyCache = { keys: {}, loadedAt: 0 };

async function getPawaPayPublicKeys(token) {
  if (Object.keys(pawaPayPublicKeyCache.keys).length && Date.now() - pawaPayPublicKeyCache.loadedAt < PAWAPAY_PUBLIC_KEY_CACHE_MS) {
    return pawaPayPublicKeyCache.keys;
  }
  const response = await fetch(`${PAWAPAY_SANDBOX_BASE_URL}/public-key/http`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const list = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(list)) {
    console.error("Could not fetch PawaPay public keys:", response.status);
    return pawaPayPublicKeyCache.keys;
  }
  const keys = {};
  list.forEach(item => { if (item?.id && item?.key) keys[item.id] = item.key; });
  pawaPayPublicKeyCache = { keys, loadedAt: Date.now() };
  return keys;
}

function parsePawaPaySignatureInput(headerValue) {
  // e.g. sig-pp=("@method" "@authority" "@path" "signature-date" "content-digest" "content-type");alg="ecdsa-p256-sha256";keyid="HTTP_EC_P256_KEY:1";created=...;expires=...
  const match = /^sig-pp=(\(.*)$/.exec(String(headerValue || "").trim());
  if (!match) return null;
  const paramsPart = match[1];
  const componentsMatch = /^\(([^)]*)\)/.exec(paramsPart);
  if (!componentsMatch) return null;
  const components = componentsMatch[1]
    .split(" ")
    .map(item => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
  const metaPart = paramsPart.slice(componentsMatch[0].length);
  const keyidMatch = /keyid="([^"]+)"/.exec(metaPart);
  const algMatch = /alg="([^"]+)"/.exec(metaPart);
  return {
    components,
    keyid: keyidMatch ? keyidMatch[1] : "",
    alg: algMatch ? algMatch[1] : "",
    signatureParamsValue: paramsPart,
  };
}

function resolvePawaPaySignatureComponent(name, req) {
  switch (name) {
    case "@method":
      return req.method.toUpperCase();
    case "@authority":
      return req.get("host") || "";
    case "@path":
      return (req.originalUrl || req.url || "/").split("?")[0];
    default:
      return req.get(name) || "";
  }
}

function verifyPawaPayContentDigest(req) {
  const header = req.get("content-digest") || "";
  const match = /^(sha-256|sha-512)=:([^:]+):$/i.exec(header.trim());
  if (!match) return false;
  const algo = match[1].toLowerCase() === "sha-256" ? "sha256" : "sha512";
  const expected = match[2];
  const actual = crypto.createHash(algo).update(req.rawBody || Buffer.from("")).digest("base64");
  return expected === actual;
}

async function verifyPawaPayCallbackSignature(req, token) {
  const signatureHeader = req.get("signature") || "";
  const signatureInputHeader = req.get("signature-input") || "";
  if (!signatureHeader || !signatureInputHeader) return false;

  const parsedInput = parsePawaPaySignatureInput(signatureInputHeader);
  if (!parsedInput || !parsedInput.keyid) return false;
  if (parsedInput.alg && parsedInput.alg !== "ecdsa-p256-sha256") {
    console.error("Unexpected PawaPay signature algorithm:", parsedInput.alg);
    return false;
  }

  if (!verifyPawaPayContentDigest(req)) {
    console.error("PawaPay Content-Digest did not match request body.");
    return false;
  }

  const sigMatch = /^sig-pp=:([^:]+):$/.exec(signatureHeader.trim());
  if (!sigMatch) return false;
  const signatureBytes = Buffer.from(sigMatch[1], "base64");

  const baseLines = parsedInput.components.map(name => `"${name}": ${resolvePawaPaySignatureComponent(name, req)}`);
  baseLines.push(`"@signature-params": ${parsedInput.signatureParamsValue}`);
  const signatureBase = baseLines.join("\n");

  const keys = await getPawaPayPublicKeys(token);
  const publicKey = keys[parsedInput.keyid];
  if (!publicKey) {
    console.error("No cached PawaPay public key for keyid:", parsedInput.keyid);
    return false;
  }

  try {
    return crypto.verify(
      "sha256",
      Buffer.from(signatureBase),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      signatureBytes
    );
  } catch (err) {
    console.error("PawaPay signature verification failed:", err);
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

exports.createPawaPayTestDeposit = onCall({
  secrets: [PAWAPAY_API_TOKEN],
}, async (request) => {
  assertAdmin(request);

  const token = PAWAPAY_API_TOKEN.value();
  if (!token) {
    throw new HttpsError("failed-precondition", "PawaPay API token is not configured.");
  }

  const phoneNumber = normalizePawaPayPhone(request.data?.phone || "255683456789");
  const provider = normalizePawaPayProvider(request.data?.provider || "AIRTEL_TZA");
  const amount = cleanPawaPayAmount(request.data?.amount || 1000);
  const clientReferenceId = String(request.data?.clientReferenceId || `KP-TEST-${Date.now()}`).trim().slice(0, 50);
  const customerMessage = String(request.data?.customerMessage || "KAMPASIKA TEST").replace(/[^a-zA-Z0-9 ]+/g, "").trim().slice(0, 22);

  if (!phoneNumber) {
    throw new HttpsError("invalid-argument", "Enter a valid Tanzania sandbox phone number.");
  }
  if (!provider) {
    throw new HttpsError("invalid-argument", "Choose a valid PawaPay Tanzania provider.");
  }
  if (!amount) {
    throw new HttpsError("invalid-argument", "Enter a valid amount.");
  }
  if (customerMessage.length < 4) {
    throw new HttpsError("invalid-argument", "Customer message must be at least 4 characters.");
  }

  const depositId = crypto.randomUUID();
  const db = admin.firestore();
  const testDepositRef = db.collection("pawaPayTestDeposits").doc(depositId);
  const body = {
    depositId,
    payer: {
      type: "MMO",
      accountDetails: {
        phoneNumber,
        provider,
      },
    },
    amount,
    currency: "TZS",
    clientReferenceId,
    customerMessage,
    metadata: [
      { app: "KAMPASIKA" },
      { purpose: "sandbox-test-deposit" },
      { requestedBy: request.auth.uid },
    ],
  };

  await testDepositRef.set({
    depositId,
    provider,
    phoneNumber,
    amount,
    currency: "TZS",
    clientReferenceId,
    customerMessage,
    status: "creating",
    request: body,
    createdBy: request.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const response = await fetch(`${PAWAPAY_SANDBOX_BASE_URL}/v2/deposits`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  const nextStatus = payload?.status || (response.ok ? "UNKNOWN" : "REQUEST_FAILED");

  await testDepositRef.set({
    status: nextStatus,
    responseStatus: response.status,
    responseOk: response.ok,
    response: payload || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  if (!response.ok) {
    throw new HttpsError("internal", payload?.message || "PawaPay sandbox deposit request failed.", {
      depositId,
      status: response.status,
      response: payload,
    });
  }

  return {
    success: true,
    depositId,
    status: nextStatus,
    response: payload,
  };
});

exports.createPawaPayGroupDeposit = onCall({
  secrets: [PAWAPAY_API_TOKEN],
}, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const token = PAWAPAY_API_TOKEN.value();
  if (!token) {
    throw new HttpsError("failed-precondition", "PawaPay API token is not configured.");
  }

  const groupId = String(request.data?.groupId || "").trim();
  const collectionId = String(request.data?.collectionId || "").trim();
  const provider = normalizePawaPayProvider(request.data?.provider || "AIRTEL_TZA");
  const phoneNumber = normalizePawaPayPhone(request.data?.phone);
  const selectedOption = String(request.data?.selectedOption || "").trim();

  if (!groupId || !collectionId) {
    throw new HttpsError("invalid-argument", "Missing group or collection.");
  }
  if (!phoneNumber) {
    throw new HttpsError("invalid-argument", "Enter a valid Tanzania mobile money number.");
  }
  if (!provider) {
    throw new HttpsError("invalid-argument", "Choose a valid mobile money provider.");
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
  const amount = cleanPawaPayAmount(collectionItem.amount || 0);
  if (!amount) {
    throw new HttpsError("failed-precondition", "This item does not require payment.");
  }

  const options = String(collectionItem.options || "").split(",").map(item => item.trim()).filter(Boolean);
  if (collectionItem.collectionType === "order" && options.length > 0 && !selectedOption) {
    throw new HttpsError("invalid-argument", "Choose an option or size first.");
  }

  const depositId = crypto.randomUUID();
  const amountNumber = Number(amount);
  const userProfile = userSnap.exists ? userSnap.data() || {} : {};
  const studentName = userProfile.username || userProfile.name || request.auth.token?.name || request.auth.token?.email || "Member";
  const paymentRef = azamPayPaymentPath({ groupId, collectionId, paymentId: uid });
  const transactionRef = db.collection("pawaPayTransactions").doc(depositId);
  const clientReferenceId = `KP-${groupId.slice(0, 8)}-${Date.now()}`.slice(0, 50);
  const customerMessage = "KAMPASIKA PAY";
  const body = {
    depositId,
    payer: {
      type: "MMO",
      accountDetails: {
        phoneNumber,
        provider,
      },
    },
    amount,
    currency: "TZS",
    clientReferenceId,
    customerMessage,
    metadata: [
      { app: "KAMPASIKA" },
      { purpose: "group-payment" },
      { groupId },
      { collectionId },
      { paymentId: uid },
      { requestedBy: uid },
    ],
  };

  await paymentRef.set({
    uid,
    studentName,
    phone: phoneNumber,
    payerName: studentName,
    paymentRef: depositId,
    selectedOption,
    amountDue: amountNumber,
    amountPaid: 0,
    provider,
    status: "pending",
    paymentProvider: "PawaPay",
    pawaPayDepositId: depositId,
    submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await transactionRef.set({
    depositId,
    groupId,
    collectionId,
    paymentId: uid,
    uid,
    amount: amountNumber,
    currency: "TZS",
    provider,
    phoneNumber,
    clientReferenceId,
    status: "pending",
    request: body,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const response = await fetch(`${PAWAPAY_SANDBOX_BASE_URL}/v2/deposits`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  const nextStatus = payload?.status || (response.ok ? "UNKNOWN" : "REQUEST_FAILED");

  await transactionRef.set({
    status: nextStatus,
    responseStatus: response.status,
    responseOk: response.ok,
    response: payload || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  if (!response.ok || nextStatus === "REJECTED") {
    await paymentRef.set({
      status: "pending",
      pawaPayStartError: payload?.failureReason?.message || payload?.message || "PawaPay could not start payment.",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    throw new HttpsError("internal", payload?.failureReason?.message || payload?.message || "PawaPay could not start payment.", {
      depositId,
      status: response.status,
      response: payload,
    });
  }

  return {
    success: true,
    depositId,
    status: nextStatus,
    message: "Payment request accepted. Wait for confirmation.",
    response: payload,
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

exports.pawapayCallback = onRequest({ cors: false, secrets: [PAWAPAY_API_TOKEN] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const pawaPayToken = PAWAPAY_API_TOKEN.value();
  const signatureOk = pawaPayToken ? await verifyPawaPayCallbackSignature(req, pawaPayToken) : false;
  if (!signatureOk) {
    console.error("Rejected PawaPay callback: signature verification failed or missing.", {
      hasSignature: !!req.get("signature"),
      hasSignatureInput: !!req.get("signature-input"),
    });
    // Respond 200 so PawaPay doesn't endlessly retry a request that will never verify,
    // but do NOT touch Firestore below — an unverified callback is never trusted.
    res.status(200).json({ success: false, reason: "signature_verification_failed" });
    return;
  }

  const payload = req.body || {};
  const inferredOperationType = payload.depositId ? "deposit" : payload.payoutId ? "payout" : payload.refundId ? "refund" : "";
  const operationType = String(
    payload.operationType ||
    payload.type ||
    payload.eventType ||
    payload.event ||
    payload.statusType ||
    inferredOperationType ||
    "unknown"
  ).trim().toLowerCase();
  const referenceId = String(
    payload.depositId ||
    payload.payoutId ||
    payload.refundId ||
    payload.transactionId ||
    payload.paymentId ||
    payload.id ||
    ""
  ).trim();
  const statusText = String(
    payload.status ||
    payload.transactionStatus ||
    payload.paymentStatus ||
    ""
  ).trim().toLowerCase();

  const db = admin.firestore();
  const eventRef = referenceId
    ? db.collection("pawaPayWebhookEvents").doc(referenceId)
    : db.collection("pawaPayWebhookEvents").doc();

  await eventRef.set({
    provider: "PawaPay",
    operationType,
    referenceId,
    signatureVerified: true,
    status: statusText || "unknown",
    payload,
    headers: {
      userAgent: req.get("user-agent") || "",
      contentType: req.get("content-type") || "",
    },
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  if (referenceId && operationType === "deposit") {
    const transactionRef = db.collection("pawaPayTransactions").doc(referenceId);
    const transactionSnap = await transactionRef.get();
    const statusCompleted = ["completed", "success", "successful", "paid", "approved"].includes(statusText);
    const statusFailed = ["failed", "rejected", "cancelled", "canceled", "expired"].includes(statusText);
    const nextStatus = statusCompleted ? "paid" : statusFailed ? "failed" : "pending";

    if (transactionSnap.exists) {
      const transaction = transactionSnap.data() || {};
      const groupId = transaction.groupId || pawaPayMetadataValue(payload.metadata, "groupId");
      const collectionId = transaction.collectionId || pawaPayMetadataValue(payload.metadata, "collectionId");
      const paymentId = transaction.paymentId || pawaPayMetadataValue(payload.metadata, "paymentId");
      const paymentRef = groupId && collectionId && paymentId
        ? azamPayPaymentPath({ groupId, collectionId, paymentId })
        : null;

      await db.runTransaction(async tx => {
        tx.set(transactionRef, {
          callback: payload,
          callbackStatus: statusText,
          status: nextStatus,
          providerTransactionId: payload.providerTransactionId || "",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        if (paymentRef) {
          tx.set(paymentRef, {
            status: nextStatus,
            amountPaid: statusCompleted ? Number(transaction.amount || payload.amount || 0) : 0,
            paymentProvider: "PawaPay",
            paymentRef: referenceId,
            pawaPayDepositId: referenceId,
            pawaPayCallbackStatus: statusText,
            pawaPayProviderTransactionId: payload.providerTransactionId || "",
            verifiedAt: statusCompleted ? admin.firestore.FieldValue.serverTimestamp() : null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      });
    }
  }

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

  await deleteUserData(uid);
  await admin.auth().deleteUser(uid);

  return { success: true };
});

exports.deleteMyAccount = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  await deleteUserData(uid);
  await admin.auth().deleteUser(uid);

  return { success: true };
});

async function deleteUserData(uid) {
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
}

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