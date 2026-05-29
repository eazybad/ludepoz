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
exports.kampasikaSearch = require('./searchFunction').kampasikaSearch;
exports.kampasikaCreateAssist = require('./createAssistFunction').kampasikaCreateAssist;
const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const ADMIN_UIDS = new Set(["LTrwUHH6utQJGiw4lcsKflzXvPR2"]);
const KAMPASIKA_WEB_API_KEY = defineSecret("KAMPASIKA_WEB_API_KEY");

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