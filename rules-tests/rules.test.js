// Security-rules tests for Kampasika + Kampasika Biz.
// Run from this folder:  npm install  then  npm test
// (npm test starts the Firestore + Storage emulators from the project root,
// loads ../firestore.rules and ../storage.rules, runs every check below and
// prints PASS / FAIL. Nothing touches the live project.)

import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, collection, collectionGroup, query, where, getDocs, writeBatch, increment } from "firebase/firestore";
import { ref, uploadBytes, getBytes } from "firebase/storage";

const ADMIN = "LTrwUHH6utQJGiw4lcsKflzXvPR2";

// Emulator hosts/ports come from the environment variables that
// `firebase emulators:exec` sets, and the rules are the project's real
// ../firestore.rules and ../storage.rules (from the root firebase.json).
const env = await initializeTestEnvironment({
  projectId: "demo-kampasika",
  firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  storage: { rules: readFileSync(new URL("../storage.rules", import.meta.url), "utf8") },
});

// Seed data with rules off.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "users/alice"), { name: "Alice", roomUserVerified: false });
  await setDoc(doc(db, "users/bob"), { name: "Bob" });
  await setDoc(doc(db, "users/carol"), { name: "Carol" });
  await setDoc(doc(db, "users/stud"), { name: "Stud", roomUserVerified: true, roomUserVerifyRole: "student" });
  await setDoc(doc(db, "verificationRequests/v1"), { userId: "alice", status: "pending", nidaNumber: "1990" });
  await setDoc(doc(db, "properties/p1"), { ownerId: "alice", name: "Block A" });
  await setDoc(doc(db, "properties/p1/team/alice"), { uid: "alice", role: "owner" });
  await setDoc(doc(db, "properties/p1/team/mgr"), { uid: "mgr", role: "manager" });
  await setDoc(doc(db, "rooms/r1"), { userId: "alice", listedBy: "alice", propertyId: "p1", landlordVerified: false, available: true, price: 90000 });
  await setDoc(doc(db, "roommatePosts/rp1"), { userId: "alice", active: true });
  await setDoc(doc(db, "groups/g1"), { ownerUid: "alice", adminUid: "alice", name: "G" });
  await setDoc(doc(db, "groups/g1/members/alice"), { uid: "alice", role: "owner", status: "active" });
  await setDoc(doc(db, "groups/g1/members/bob"), { uid: "bob", role: "member", status: "active" });
  await setDoc(doc(db, "phoneAuthOtps/o1"), { attempts: 3, codeHash: "x" });
  await setDoc(doc(db, "system/features"), { discoverGoods: true });
  await setDoc(doc(db, "listings/l1"), { userId: "alice", views: 0 });
  await setDoc(doc(db, "operators/alice"), { ownerUid: "alice", status: "draft", profile: { businessName: "A" } });
  await setDoc(doc(db, "bizOperatorSecrets/alice"), { sandbox: { ciphertext: "x" } });
  await setDoc(doc(db, "bizApplications/r1_bob"), { operatorId: "alice", studentUid: "bob", status: "submitted" });
  await setDoc(doc(db, "bizLeases/L1"), { operatorId: "alice", studentUid: "bob", status: "sent" });
  await setDoc(doc(db, "bizCharges/L1_r01"), { operatorId: "alice", studentUid: "bob", leaseId: "L1", status: "due" });
  await setDoc(doc(db, "bizDeposits/d1"), { operatorId: "alice", createdBy: "bob", status: "pending" });
  await setDoc(doc(db, "bizPublic/alice"), { businessName: "A" });
  // chats, groups, marketplace
  await setDoc(doc(db, "conversations/c1"), { buyerId: "bob", sellerId: "alice", lastMessage: "hi", propertyId: null });
  await setDoc(doc(db, "conversations/c1/messages/m1"), { senderId: "bob", text: "hi" });
  await setDoc(doc(db, "conversations/cp"), { buyerId: "stud", sellerId: "alice", propertyId: "p1", lastMessage: "is room free?" });
  await setDoc(doc(db, "conversations/cp/messages/m1"), { senderId: "stud", text: "is room free?" });
  await setDoc(doc(db, "groups/g1/channels/chats/messages/gm1"), { authorUid: "alice", text: "welcome" });
  await setDoc(doc(db, "groups/g1/channels/chats/messages/gm2"), { authorUid: "bob", text: "thanks" });
  await setDoc(doc(db, "groups/g2"), { ownerUid: "alice", adminUid: "alice", name: "Closed", joinPolicy: "approvalRequired" });
  await setDoc(doc(db, "groups/g2/members/alice"), { uid: "alice", role: "owner", status: "active" });
  await setDoc(doc(db, "groups/g2/members/pend"), { uid: "pend", role: "member", status: "pending" });
  await setDoc(doc(db, "groups/g1/members/blk"), { uid: "blk", role: "member", status: "blocked" });
  await setDoc(doc(db, "groups/g1/collections/gc1"), { title: "Class fee", amount: 5000, visibility: "groupOnly" });
  await setDoc(doc(db, "groups/g1/collections/ev1"), { title: "Dinner", amount: 0, visibility: "public", collectionType: "event" });
  await setDoc(doc(db, "collections/col1"), { userId: "alice", title: "T-shirts", adminEmails: ["helper@x.com"], totalOrders: 0 });
  await setDoc(doc(db, "collections/col1/orders/o1"), { userId: "bob", paid: false, amount: 10000 });
  await setDoc(doc(db, "services/s1"), { userId: "alice", title: "Tutoring" });
  await setDoc(doc(db, "searchAlerts/a1"), { userId: "alice", userPhone: "0712" });
  await setDoc(doc(db, "reports/rep1"), { reporterId: "alice", reason: "spam" });
  const st = ctx.storage();
  await uploadBytes(ref(st, "verification/alice/id.jpg"), new Uint8Array([1, 2, 3]), { contentType: "image/jpeg" });
  await uploadBytes(ref(st, "biz/alice/documents/tin.pdf"), new Uint8Array([1]), { contentType: "application/pdf" });
  await uploadBytes(ref(st, "avatars/alice/a.jpg"), new Uint8Array([1]), { contentType: "image/jpeg" });
});

const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext());
const fs = (uid) => as(uid).firestore();
const st = (uid) => as(uid).storage();

let pass = 0;
let fail = 0;
async function check(label, expectation, fn) {
  try {
    await (expectation === "allow" ? assertSucceeds(fn()) : assertFails(fn()));
    pass += 1;
    console.log(`PASS  ${expectation.padEnd(5)} ${label}`);
  } catch (err) {
    fail += 1;
    console.log(`FAIL  ${expectation.padEnd(5)} ${label}\n      ${err.message.split("\n")[0]}`);
  }
}

// ── users ──
await check("sign-up: create own user doc", "allow", () => setDoc(doc(fs("new1"), "users/new1"), { name: "New", accountType: "student" }));
await check("sign-up with isVerified:true", "deny", () => setDoc(doc(fs("new2"), "users/new2"), { name: "X", isVerified: true }));
await check("edit own profile name", "allow", () => updateDoc(doc(fs("alice"), "users/alice"), { name: "Alice M", bio: "hi" }));
await check("give yourself a verified badge", "deny", () => updateDoc(doc(fs("alice"), "users/alice"), { roomUserVerified: true }));
await check("submit own verification (pending)", "allow", () => updateDoc(doc(fs("alice"), "users/alice"), { roomUserVerificationStatus: "pending" }));
await check("approve own verification", "deny", () => updateDoc(doc(fs("alice"), "users/alice"), { roomUserVerificationStatus: "approved" }));
await check("edit someone else's profile", "deny", () => updateDoc(doc(fs("bob"), "users/alice"), { name: "hacked" }));
await check("admin approves verification", "allow", () => updateDoc(doc(fs(ADMIN), "users/carol"), { roomUserVerified: true }));
await check("read public profile", "allow", () => getDoc(doc(fs(null), "users/alice")));

// ── verificationRequests ──
await check("read someone else's NIDA request", "deny", () => getDoc(doc(fs("bob"), "verificationRequests/v1")));
await check("read own verification request", "allow", () => getDocs(query(collection(fs("alice"), "verificationRequests"), where("userId", "==", "alice"))));
await check("submit own pending request", "allow", () => addDoc(collection(fs("bob"), "verificationRequests"), { userId: "bob", status: "pending" }));
await check("self-approve request", "deny", () => updateDoc(doc(fs("alice"), "verificationRequests/v1"), { status: "approved" }));

// ── rooms ──
await check("owner renames on own room (badge unchanged)", "allow", () => updateDoc(doc(fs("alice"), "rooms/r1"), { listedByName: "Alice M" }));
await check("unverified owner sets verified badge", "deny", () => updateDoc(doc(fs("alice"), "rooms/r1"), { landlordVerified: true }));
await check("property manager toggles availability", "allow", () => updateDoc(doc(fs("mgr"), "rooms/r1"), { available: false }));
await check("property manager changes price", "deny", () => updateDoc(doc(fs("mgr"), "rooms/r1"), { price: 1 }));
await check("stranger edits room", "deny", () => updateDoc(doc(fs("bob"), "rooms/r1"), { available: true }));
await check("list a new room (unverified)", "allow", () => addDoc(collection(fs("bob"), "rooms"), { userId: "bob", landlordVerified: false, available: true }));

// ── roommatePosts ──
await check("author (unverified) queries own posts", "allow", () => getDocs(query(collection(fs("alice"), "roommatePosts"), where("userId", "==", "alice"))));
await check("unverified user reads all posts", "deny", () => getDocs(query(collection(fs("bob"), "roommatePosts"), where("active", "==", true))));
await check("verified student reads all posts", "allow", () => getDocs(query(collection(fs("stud"), "roommatePosts"), where("active", "==", true))));

// ── notifications ──
await check("group mention to a group member", "allow", () => setDoc(doc(fs("alice"), "notifications/bob_g1_m1"), { userId: "bob", read: false, type: "group_mention", groupId: "g1", title: "t", message: "m" }));
await check("fake 'verified' notification", "deny", () => addDoc(collection(fs("alice"), "notifications"), { userId: "bob", read: false, type: "verification_approved", title: "✓" }));
await check("group notification to a non-member", "deny", () => addDoc(collection(fs("alice"), "notifications"), { userId: "stud", read: false, type: "group_mention", groupId: "g1" }));
await check("dedupe lookup of a missing notification", "allow", () => getDoc(doc(fs("alice"), "notifications/does_not_exist")));

// ── system / server-only ──
await check("user flips a feature flag", "deny", () => setDoc(doc(fs("bob"), "system/features"), { discoverGoods: false }, { merge: true }));
await check("admin flips a feature flag", "allow", () => setDoc(doc(fs(ADMIN), "system/features"), { discoverGoods: false }, { merge: true }));
await check("reset OTP attempts", "deny", () => updateDoc(doc(fs("bob"), "phoneAuthOtps/o1"), { attempts: 0 }));
await check("read OTP doc", "deny", () => getDoc(doc(fs("bob"), "phoneAuthOtps/o1")));

// ── still-open compatibility collections keep working ──
await check("bump listing views (compat)", "allow", () => updateDoc(doc(fs("bob"), "listings/l1"), { views: 1 }));
await check("collection-group: team", "allow", () => getDocs(query(collectionGroup(fs("mgr"), "team"), where("uid", "==", "mgr"))));
await check("collection-group: members", "allow", () => getDocs(query(collectionGroup(fs("bob"), "members"), where("uid", "==", "bob"))));

// ── private chats ──
await check("stranger reads someone's chat", "deny", () => getDoc(doc(fs("carol"), "conversations/c1")));
await check("stranger reads chat messages", "deny", () => getDocs(collection(fs("carol"), "conversations/c1/messages")));
await check("buyer lists own chats", "allow", () => getDocs(query(collection(fs("bob"), "conversations"), where("buyerId", "==", "bob"))));
await check("seller lists own chats", "allow", () => getDocs(query(collection(fs("alice"), "conversations"), where("sellerId", "==", "alice"))));
await check("list someone else's chats", "deny", () => getDocs(query(collection(fs("carol"), "conversations"), where("buyerId", "==", "bob"))));
await check("participant reads messages", "allow", () => getDocs(collection(fs("bob"), "conversations/c1/messages")));
await check("property manager lists property inbox", "allow", () => getDocs(query(collection(fs("mgr"), "conversations"), where("propertyId", "==", "p1"))));
await check("outsider lists property inbox", "deny", () => getDocs(query(collection(fs("carol"), "conversations"), where("propertyId", "==", "p1"))));
await check("property manager reads inquiry messages", "allow", () => getDocs(collection(fs("mgr"), "conversations/cp/messages")));
await check("property manager claims inquiry", "allow", () => updateDoc(doc(fs("mgr"), "conversations/cp"), { assignedTo: "mgr", assignedToName: "M" }));
await check("check a chat exists before starting it", "allow", () => getDoc(doc(fs("carol"), "conversations/group_g1_carol_bob")));
await check("start chat + first message (batch)", "allow", () => {
  const db = fs("carol"); const b = writeBatch(db);
  b.set(doc(db, "conversations/new1"), { buyerId: "carol", sellerId: "alice", lastMessage: "hello", propertyId: null });
  b.set(doc(db, "conversations/new1/messages/x1"), { senderId: "carol", text: "hello" });
  return b.commit();
});
await check("create a chat between two other people", "deny", () => setDoc(doc(fs("carol"), "conversations/fake"), { buyerId: "bob", sellerId: "alice" }));
await check("send message as someone else", "deny", () => addDoc(collection(fs("bob"), "conversations/c1/messages"), { senderId: "alice", text: "x" }));
await check("participant sends message", "allow", () => addDoc(collection(fs("bob"), "conversations/c1/messages"), { senderId: "bob", text: "ok" }));
await check("participant updates last message / unread", "allow", () => updateDoc(doc(fs("bob"), "conversations/c1"), { lastMessage: "ok", sellerUnread: increment(1) }));
await check("participant swaps the other person out", "deny", () => updateDoc(doc(fs("bob"), "conversations/c1"), { sellerId: "carol" }));

// ── groups ──
await check("check own membership before joining", "allow", () => getDoc(doc(fs("carol"), "groups/g1/members/carol")));
await check("join an open group", "allow", () => setDoc(doc(fs("carol"), "groups/g1/members/carol"), { uid: "carol", role: "member", status: "active" }, { merge: true }));
await check("join an approval-only group as active", "deny", () => setDoc(doc(fs("carol"), "groups/g2/members/carol"), { uid: "carol", role: "member", status: "active" }));
await check("request to join an approval-only group", "allow", () => setDoc(doc(fs("carol"), "groups/g2/members/carol"), { uid: "carol", role: "member", status: "pending" }));
await check("pending member approves themself", "deny", () => updateDoc(doc(fs("pend"), "groups/g2/members/pend"), { status: "active" }));
await check("blocked member un-blocks themself", "deny", () => updateDoc(doc(fs("blk"), "groups/g1/members/blk"), { status: "active" }));
await check("member makes themself admin", "deny", () => updateDoc(doc(fs("bob"), "groups/g1/members/bob"), { role: "admin" }));
await check("member mutes notifications", "allow", () => updateDoc(doc(fs("bob"), "groups/g1/members/bob"), { notificationMuted: true }));
await check("member leaves", "allow", () => updateDoc(doc(fs("bob"), "groups/g1/members/bob"), { status: "left" }));
await check("member re-joins after leaving", "allow", () => updateDoc(doc(fs("bob"), "groups/g1/members/bob"), { status: "active" }));
await check("outsider reads group chat", "deny", () => getDocs(collection(fs("stud"), "groups/g1/channels/chats/messages")));
await check("member unsends own message", "allow", () => deleteDoc(doc(fs("bob"), "groups/g1/channels/chats/messages/gm2")));
await check("member deletes someone else's message", "deny", () => deleteDoc(doc(fs("bob"), "groups/g1/channels/chats/messages/gm1")));
await check("member marks own payment as paid", "deny", () => setDoc(doc(fs("bob"), "groups/g1/collections/gc1/payments/bob"), { uid: "bob", status: "paid", amountPaid: 5000 }));
await check("member declares payment sent", "allow", () => setDoc(doc(fs("bob"), "groups/g1/collections/gc1/payments/bob"), { uid: "bob", status: "sent", amountPaid: 5000 }, { merge: true }));
await check("member re-submits with an option", "allow", () => setDoc(doc(fs("bob"), "groups/g1/collections/gc1/payments/bob"), { uid: "bob", status: "pending", selectedOption: "XL", paymentRef: "MP1" }, { merge: true }));
await check("owner verifies payment", "allow", () => updateDoc(doc(fs("alice"), "groups/g1/collections/gc1/payments/bob"), { status: "paid" }));
await check("member creates a work group", "allow", () => addDoc(collection(fs("bob"), "groups/g1/workGroups"), { name: "Team 1", createdByUid: "bob", memberUids: ["bob"] }));
await check("collection-group: public events feed", "allow", () => getDocs(query(collectionGroup(fs("stud"), "collections"), where("collectionType", "in", ["event", "order"]), where("visibility", "==", "public"))));
await check("collection-group: all collections incl. private", "deny", () => getDocs(query(collectionGroup(fs("stud"), "collections"), where("collectionType", "==", "contribution"))));
await check("collection-group: someone else's memberships", "deny", () => getDocs(query(collectionGroup(fs("bob"), "members"), where("uid", "==", "alice"))));

// ── listings, services, collections ──
await check("stranger bumps views by 5", "deny", () => updateDoc(doc(fs("bob"), "listings/l1"), { views: 6 }));
await check("stranger edits a listing", "deny", () => updateDoc(doc(fs("bob"), "listings/l1"), { title: "mine now" }));
await check("owner edits own listing", "allow", () => updateDoc(doc(fs("alice"), "listings/l1"), { title: "Desk lamp" }));
await check("stranger deletes a service", "deny", () => deleteDoc(doc(fs("bob"), "services/s1")));
await check("owner edits own service", "allow", () => updateDoc(doc(fs("alice"), "services/s1"), { title: "Maths tutoring" }));
await check("buyer places an order", "allow", () => addDoc(collection(fs("carol"), "collections/col1/orders"), { userId: "carol", paid: false, amount: 10000 }));
await check("buyer bumps order totals", "allow", () => updateDoc(doc(fs("carol"), "collections/col1"), { totalOrders: increment(1) }));
await check("buyer edits collection title", "deny", () => updateDoc(doc(fs("carol"), "collections/col1"), { title: "hacked" }));
await check("buyer adds own payment reference", "allow", () => updateDoc(doc(fs("bob"), "collections/col1/orders/o1"), { paymentRef: "MP77", amountPaid: 10000 }));
await check("someone edits another buyer's order", "deny", () => updateDoc(doc(fs("carol"), "collections/col1/orders/o1"), { paymentRef: "x" }));
await check("co-admin (by email) confirms order", "allow", () => updateDoc(doc(env.authenticatedContext("helper", { email: "Helper@x.com" }).firestore(), "collections/col1/orders/o1"), { paid: true, status: "paid" }));

// ── alerts, reports, reminders ──
await check("read someone's search alert (phone)", "deny", () => getDoc(doc(fs("bob"), "searchAlerts/a1")));
await check("save own search alert", "allow", () => addDoc(collection(fs("bob"), "searchAlerts"), { userId: "bob", query: "desk" }));
await check("user reads reports", "deny", () => getDoc(doc(fs("bob"), "reports/rep1")));
await check("user files a report", "allow", () => addDoc(collection(fs("bob"), "reports"), { reporterId: "bob", reason: "scam" }));
await check("schedule own payment reminder", "allow", () => addDoc(collection(fs("bob"), "paymentReminders"), { uid: "bob", sent: false, groupId: "g1" }));
await check("unknown collection is closed", "deny", () => setDoc(doc(fs("bob"), "randomStuff/x"), { a: 1 }));

// ── Kampasika Biz ──
await check("read another operator", "deny", () => getDoc(doc(fs("bob"), "operators/alice")));
await check("operator reads own", "allow", () => getDoc(doc(fs("alice"), "operators/alice")));
await check("operator marks self pawaPay-connected", "deny", () => updateDoc(doc(fs("alice"), "operators/alice"), { pawapay: { production: { connected: true } } }));
await check("operator sets self live", "deny", () => updateDoc(doc(fs("alice"), "operators/alice"), { status: "live" }));
await check("operator submits for review", "allow", () => updateDoc(doc(fs("alice"), "operators/alice"), { status: "in_review" }));
await check("read encrypted tokens", "deny", () => getDoc(doc(fs("alice"), "bizOperatorSecrets/alice")));
await check("student reads own application", "allow", () => getDoc(doc(fs("bob"), "bizApplications/r1_bob")));
await check("stranger reads application", "deny", () => getDoc(doc(fs("stud"), "bizApplications/r1_bob")));
await check("student forges approval", "deny", () => updateDoc(doc(fs("bob"), "bizApplications/r1_bob"), { status: "approved" }));
await check("student reads own lease", "allow", () => getDoc(doc(fs("bob"), "bizLeases/L1")));
await check("student marks lease signed directly", "deny", () => updateDoc(doc(fs("bob"), "bizLeases/L1"), { status: "signed" }));
await check("student lists own charges for a lease", "allow", () => getDocs(query(collection(fs("bob"), "bizCharges"), where("leaseId", "==", "L1"), where("studentUid", "==", "bob"))));
await check("student marks charge paid", "deny", () => updateDoc(doc(fs("bob"), "bizCharges/L1_r01"), { status: "paid" }));
await check("student watches own payment", "allow", () => getDoc(doc(fs("bob"), "bizDeposits/d1")));
await check("anyone reads bizPublic", "allow", () => getDoc(doc(fs(null), "bizPublic/alice")));
await check("write bizPublic", "deny", () => setDoc(doc(fs("alice"), "bizPublic/alice"), { live: true }));

// ── Storage ──
await check("stranger downloads an ID photo", "deny", () => getBytes(ref(st("bob"), "verification/alice/id.jpg")));
await check("owner reads own ID photo", "allow", () => getBytes(ref(st("alice"), "verification/alice/id.jpg")));
await check("admin reads ID photo", "allow", () => getBytes(ref(st(ADMIN), "verification/alice/id.jpg")));
await check("upload own ID photo", "allow", () => uploadBytes(ref(st("bob"), "verification/bob/id.jpg"), new Uint8Array([1]), { contentType: "image/jpeg" }));
await check("upload into someone else's folder", "deny", () => uploadBytes(ref(st("bob"), "verification/alice/x.jpg"), new Uint8Array([1]), { contentType: "image/jpeg" }));
await check("stranger reads operator TIN document", "deny", () => getBytes(ref(st("bob"), "biz/alice/documents/tin.pdf")));
await check("avatars stay public", "allow", () => getBytes(ref(st(null), "avatars/alice/a.jpg")));

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
