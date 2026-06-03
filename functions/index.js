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
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const crypto = require("crypto");

const ADMIN_UIDS = new Set(["LTrwUHH6utQJGiw4lcsKflzXvPR2"]);
const KAMPASIKA_WEB_API_KEY = defineSecret("KAMPASIKA_WEB_API_KEY");
const AFRICASTALKING_API_KEY = defineSecret("AFRICASTALKING_API_KEY");
const AFRICASTALKING_USERNAME = defineSecret("AFRICASTALKING_USERNAME");

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
    throw new HttpsError("failed-precondition", "Africa's Talking secrets are not configured.");
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

  const body = new URLSearchParams({
    username,
    to: phone,
    message: `Kampasika verification code: ${code}. Do not share this code.`,
  });

  const response = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      "apiKey": apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const lower = text.toLowerCase();
    if (response.status === 401 || lower.includes("authentication") || lower.includes("auth")) {
      throw new HttpsError(
        "failed-precondition",
        "Africa's Talking authentication failed. Check AFRICASTALKING_USERNAME and AFRICASTALKING_API_KEY belong to the same sandbox or live account."
      );
    }
    throw new HttpsError("internal", text || "SMS failed to send.");
  }

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
