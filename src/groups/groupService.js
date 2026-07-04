import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { compressImage, COMPRESSION_PRESETS } from "../imageCompression";

export const GROUP_ROLES = ["owner", "admin", "treasurer", "member"];

export const GROUP_CHANNELS = [
  { id: "chats", name: "Chats", kind: "chat" },
  { id: "payments", name: "Payments", kind: "payments" },
  { id: "events", name: "Events", kind: "events" },
  { id: "members", name: "Members", kind: "members" },
  { id: "resources", name: "Resources", kind: "resources" },
];

export const DEMO_GROUPS = [
  {
    name: "TUCASA ARU Family",
    desc: "Announcements, events, choir practice, and contribution updates.",
    type: "church",
    avatarText: "TA",
  },
  {
    name: "Architecture Year 2",
    desc: "Studio notices, model materials, field work, and class payments.",
    type: "class",
    avatarText: "A2",
  },
  {
    name: "ARU Freshers 2026",
    desc: "Orientation, hostel tips, first week help, and campus updates.",
    type: "freshers",
    avatarText: "F6",
  },
  {
    name: "Hostel Block A",
    desc: "Block updates, cleaning rota, shared resources, and payments.",
    type: "hostel",
    avatarText: "HA",
  },
];

const DEMO_MEMBER_PROFILES = [
  { uid: "demo-treasurer", name: "Neema Treasurer", role: "treasurer" },
  { uid: "demo-admin", name: "Baraka Class Rep", role: "admin" },
  { uid: "demo-member-1", name: "Asha Msuya", role: "member" },
  { uid: "demo-member-2", name: "Kelvin John", role: "member" },
];

const DEMO_PAYMENTS = [
  { uid: "demo-member-1", studentName: "Asha Msuya", status: "paid", amountPaid: 15000, paymentRef: "MPESA-QA72" },
  { uid: "demo-member-2", studentName: "Kelvin John", status: "pending", amountPaid: 15000, paymentRef: "AIRTEL-8891" },
  { uid: "demo-member-3", studentName: "Rehema Ally", status: "rejected", amountPaid: 8000, paymentRef: "missing proof" },
];

const DEMO_RESOURCES = [
  {
    id: "orientation-checklist",
    title: "Orientation checklist",
    text: "What to carry, where to meet, and who to call when lost on campus.",
    url: "https://kampasika.org",
  },
  {
    id: "payment-instructions",
    title: "Payment instructions",
    text: "Send money to the listed number, then upload screenshot proof in Payments.",
    url: "https://kampasika.org",
  },
];

function demoTrackerFor(group) {
  if (group.type === "hostel") {
    return {
      title: "Block A cleaning contribution",
      description: "Monthly cleaning supplies and shared dustbin bags.",
      collectionType: "contribution",
      amount: 5000,
      expectedPeople: 64,
      paymentMethods: ["M-Pesa 255 700 111 222 - Hostel Treasurer"],
    };
  }
  if (group.type === "freshers") {
    return {
      title: "Freshers welcome package",
      description: "Badge, campus map, and first-week support items.",
      collectionType: "order",
      amount: 12000,
      expectedPeople: 128,
      paymentMethods: ["Airtel Money 255 688 222 333 - Freshers Rep"],
    };
  }
  if (group.type === "church") {
    return {
      title: "Sunday transport contribution",
      description: "Bus contribution for Sunday fellowship trip.",
      collectionType: "event",
      amount: 10000,
      expectedPeople: 42,
      paymentMethods: ["Tigo Pesa 255 713 444 555 - TUCASA Treasurer"],
    };
  }
  return {
    title: "Studio model materials",
    description: "Shared boards, glue, blades, and printing for studio review.",
    collectionType: "contribution",
    amount: 15000,
    expectedPeople: 45,
    paymentMethods: ["M-Pesa 255 715 333 444 - Class Treasurer"],
  };
}

function demoEventsFor(group) {
  const shared = {
    church: [
      {
        id: "demo-event-worship-night",
        title: "Friday worship night",
        description: "Evening worship, prayer, and small group sharing at ARU main hall.",
        amount: 0,
        expectedPeople: 90,
        deadline: "2026-06-12",
        photoUrl: "https://images.unsplash.com/photo-1507692049790-de58290a4334?auto=format&fit=crop&w=900&q=80",
      },
      {
        id: "demo-event-sunday-trip",
        title: "Sunday fellowship transport",
        description: "Register for Sunday transport and food coordination.",
        amount: 3000,
        expectedPeople: 80,
        deadline: "2026-06-13",
        paymentMethods: ["Tigo Pesa 255 713 444 555 - TUCASA Treasurer"],
        photoUrl: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=80",
      },
    ],
    class: [
      {
        id: "demo-event-studio-review",
        title: "Studio review day",
        description: "Pin-up review for housing studio. Bring printed drawings and model photos.",
        amount: 0,
        expectedPeople: 45,
        deadline: "2026-06-18",
        photoUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80",
      },
      {
        id: "demo-event-site-visit",
        title: "Kigamboni site visit",
        description: "Class field visit for urban housing analysis. Transport contribution required.",
        amount: 8000,
        expectedPeople: 45,
        deadline: "2026-06-20",
        paymentMethods: ["M-Pesa 255 715 333 444 - Class Treasurer"],
        photoUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=80",
      },
    ],
    freshers: [
      {
        id: "demo-event-campus-tour",
        title: "Freshers campus tour",
        description: "Meet at the administration block for campus tour, registration help, and Q&A.",
        amount: 0,
        expectedPeople: 160,
        deadline: "2026-06-10",
        photoUrl: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=900&q=80",
      },
      {
        id: "demo-event-welcome-bonfire",
        title: "Freshers welcome night",
        description: "Welcome night with games, music, and student mentors.",
        amount: 5000,
        expectedPeople: 120,
        deadline: "2026-06-15",
        paymentMethods: ["Airtel Money 255 688 222 333 - Freshers Rep"],
        photoUrl: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=900&q=80",
      },
    ],
    hostel: [
      {
        id: "demo-event-block-meeting",
        title: "Block A residents meeting",
        description: "Quick meeting about cleaning schedule, security, and water updates.",
        amount: 0,
        expectedPeople: 64,
        deadline: "2026-06-09",
        photoUrl: "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=900&q=80",
      },
      {
        id: "demo-event-hostel-dinner",
        title: "Hostel shared dinner",
        description: "Optional dinner contribution for Block A residents after exams.",
        amount: 4000,
        expectedPeople: 50,
        deadline: "2026-06-21",
        paymentMethods: ["M-Pesa 255 700 111 222 - Hostel Treasurer"],
        photoUrl: "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=900&q=80",
      },
    ],
  };
  return shared[group.type] || shared.class;
}

function addDemoSampleData(batch, groupRef, group, { user, profile }) {
  const ownerName = profile.name || "Group owner";
  const tracker = demoTrackerFor(group);
  const trackerRef = doc(groupRef, "collections", "demo-main-tracker");

  batch.set(doc(groupRef, "members", user.uid), {
    uid: user.uid,
    name: ownerName,
    email: user.email || "",
    avatarUrl: profile.avatarUrl || null,
    role: "owner",
    status: "active",
    joinedAt: serverTimestamp(),
  }, { merge: true });

  DEMO_MEMBER_PROFILES.forEach(member => {
    batch.set(doc(groupRef, "members", member.uid), {
      ...member,
      email: "",
      avatarUrl: null,
      status: "active",
      joinedAt: serverTimestamp(),
    }, { merge: true });
  });

  [
    {
      id: "welcome",
      authorName: ownerName,
      text: group.desc,
      kind: "announcement",
      pinned: true,
    },
    {
      id: "payment-reminder",
      authorName: "Neema Treasurer",
      text: `Reminder: ${tracker.title} is open. Please pay ${tracker.amount.toLocaleString()} TSh and upload proof.`,
      kind: "message",
      pinned: false,
    },
    {
      id: "member-question",
      authorName: "Asha Msuya",
      text: "Nimetuma proof. Treasurer akiangalia anijulishe kama ipo sawa.",
      kind: "message",
      pinned: false,
    },
  ].forEach(message => {
    batch.set(doc(groupRef, "channels", "chats", "messages", message.id), {
      ...message,
      authorUid: user.uid,
      createdAt: serverTimestamp(),
    }, { merge: true });
  });

  batch.set(trackerRef, {
    ...tracker,
    createdByUid: user.uid,
    createdByName: ownerName,
    groupId: groupRef.id,
    status: "active",
    demo: true,
    visibility: group.type === "freshers" || group.type === "church" ? "public" : "groupOnly",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  demoEventsFor(group).forEach(eventItem => {
    const eventRef = doc(groupRef, "collections", eventItem.id);
    batch.set(eventRef, {
      title: eventItem.title,
      description: eventItem.description,
      collectionType: "event",
      amount: eventItem.amount,
      expectedPeople: eventItem.expectedPeople,
      paymentMethods: eventItem.paymentMethods || [],
      deadline: eventItem.deadline,
      photoUrl: eventItem.photoUrl,
      photos: [eventItem.photoUrl],
      visibility: "public",
      status: "active",
      demo: true,
      groupId: groupRef.id,
      groupName: group.name,
      communityName: group.name,
      universityName: group.universityName || "ARU",
      createdByUid: user.uid,
      createdByName: ownerName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    batch.set(doc(eventRef, "payments", "demo-member-1"), {
      uid: "demo-member-1",
      studentName: "Asha Msuya",
      phone: "07xx xxx xxx",
      payerName: "Asha Msuya",
      amountDue: eventItem.amount,
      amountPaid: eventItem.amount,
      paymentRef: eventItem.amount > 0 ? "MPESA-EVT42" : "Registered",
      status: eventItem.amount > 0 ? "paid" : "registered",
      paymentProofUrl: "",
      submittedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...(eventItem.amount > 0 ? {
        verifiedByUid: user.uid,
        verifiedByName: ownerName,
        verifiedAt: serverTimestamp(),
      } : {}),
    }, { merge: true });
  });

  DEMO_PAYMENTS.forEach(payment => {
    batch.set(doc(trackerRef, "payments", payment.uid), {
      ...payment,
      phone: "07xx xxx xxx",
      payerName: payment.studentName,
      amountDue: tracker.amount,
      paymentProofUrl: "",
      submittedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...(payment.status === "paid" ? {
        verifiedByUid: user.uid,
        verifiedByName: ownerName,
        verifiedAt: serverTimestamp(),
      } : {}),
    }, { merge: true });
  });

  DEMO_RESOURCES.forEach(resource => {
    batch.set(doc(groupRef, "channels", "resources", "messages", resource.id), {
      ...resource,
      authorUid: user.uid,
      authorName: ownerName,
      kind: "resource",
      pinned: false,
      createdAt: serverTimestamp(),
    }, { merge: true });
  });
}

const roleRank = { owner: 4, admin: 3, treasurer: 2, member: 1 };

export function canManageGroup(member) {
  return roleRank[member?.role] >= roleRank.treasurer;
}

export function canVerifyPayments(member) {
  return ["owner", "admin", "treasurer"].includes(member?.role);
}

export function isGroupMember(member) {
  return !!member && member.status === "active";
}

export const DEFAULT_GROUP_NOTIFICATION_PREFS = {
  announcements: true,
  payments: true,
  events: true,
  mentions: true,
  deadlineReminders: true,
  proofRequests: true,
  paymentStatus: true,
  adminAlerts: true,
};

function notificationCategory(type, explicitCategory = "") {
  if (explicitCategory) return explicitCategory;
  if (type === "group_mention") return "mentions";
  if (type === "group_announcement") return "announcements";
  if (type === "group_event" || type === "group_event_registered") return "events";
  if (type === "group_payment_request") return "payments";
  if (type === "group_payment_deadline_reminder") return "deadlineReminders";
  if (type === "group_payment_proof_requested") return "proofRequests";
  if (type === "group_payment_verified" || type === "group_payment_rejected") return "paymentStatus";
  if (type === "group_payment_submitted") return "adminAlerts";
  return "announcements";
}

function memberAllowsNotification(member, category) {
  const prefs = { ...DEFAULT_GROUP_NOTIFICATION_PREFS, ...(member.notificationPrefs || {}) };
  return prefs[category] !== false;
}

export function normalizeGroupType(type) {
  return ["class", "church", "club", "hostel", "freshers", "other"].includes(type) ? type : "other";
}

export function makeInviteCode(name) {
  const slug = (name || "group")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 34) || "group";
  return `${slug}-${Math.random().toString(36).slice(2, 7)}`;
}

export function groupAvatarText(name, fallback = "GR") {
  return (name || fallback)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

export function paymentSummary(collectionItem, payments) {
  const expectedMembers = Number(collectionItem?.expectedPeople || 0);
  const amount = Number(collectionItem?.amount || collectionItem?.price || 0);
  const paid = payments.filter(payment => payment.status === "paid");
  const pending = payments.filter(payment => payment.status === "pending");
  const registered = payments.filter(payment => payment.status === "registered");
  const rejected = payments.filter(payment => payment.status === "rejected");
  const totalCollected = paid.reduce((sum, payment) => sum + Number(payment.amountPaid || amount || 0), 0);
  const paidCount = paid.length;
  const unpaidCount = Math.max(0, expectedMembers - paidCount - pending.length - registered.length);
  const expectedTotal = expectedMembers * amount;
  const progress = expectedTotal > 0 ? Math.min(100, Math.round((totalCollected / expectedTotal) * 100)) : 0;

  return {
    paidCount,
    unpaidCount,
    pendingCount: pending.length,
    registeredCount: registered.length,
    rejectedCount: rejected.length,
    totalCollected,
    expectedTotal,
    progress,
  };
}

function memberCanReceiveNotification(member, excludeUid = "") {
  return member.uid
    && member.uid !== excludeUid
    && member.status === "active"
    && !member.notificationMuted;
}

async function getGroupMembers(db, groupId) {
  const snap = await getDocs(collection(db, "groups", groupId, "members"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function notificationDocId(uid, key) {
  return `${uid}_${key}`.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 900);
}

function collectionDedupeKey(type, groupId, collectionId, extra = "") {
  return [type, groupId, collectionId, extra].filter(Boolean).join("_");
}

async function writeNotification(db, uid, notificationData) {
  const { dedupeKey = "", ...payload } = notificationData;
  if (!dedupeKey) {
    await addDoc(collection(db, "notifications"), {
      userId: uid,
      read: false,
      createdAt: serverTimestamp(),
      ...payload,
    });
    return true;
  }

  const notificationRef = doc(db, "notifications", notificationDocId(uid, dedupeKey));
  const existing = await getDoc(notificationRef);
  if (existing.exists()) return false;

  await setDoc(notificationRef, {
    userId: uid,
    read: false,
    dedupeKey,
    createdAt: serverTimestamp(),
    ...payload,
  });
  return true;
}

async function notifyMembers(db, members, notification) {
  const { excludeUid = "", category: explicitCategory = "", ...notificationData } = notification;
  const category = notificationCategory(notificationData.type, explicitCategory);
  const recipients = members.filter(member => (
    memberCanReceiveNotification(member, excludeUid)
    && memberAllowsNotification(member, category)
  ));
  await Promise.all(recipients.map(member => writeNotification(db, member.uid, {
    ...notificationData,
    category,
  })));
}

async function notifyGroupUser(db, { groupId, uid, notification }) {
  if (!uid) return false;
  const memberSnap = await getDoc(doc(db, "groups", groupId, "members", uid));
  if (!memberSnap.exists()) return false;
  const member = { id: memberSnap.id, ...memberSnap.data() };
  const category = notificationCategory(notification.type, notification.category);
  if (!memberCanReceiveNotification(member) || !memberAllowsNotification(member, category)) return false;
  return writeNotification(db, uid, {
    ...notification,
    category,
  });
}

async function getGroupReviewers(db, groupId) {
  const groupSnap = await getDoc(doc(db, "groups", groupId));
  const groupData = groupSnap.exists() ? groupSnap.data() : {};
  let members = [];
  try {
    members = await getGroupMembers(db, groupId);
  } catch (_) {
    members = [];
  }
  const reviewers = members.filter(member => ["owner", "admin", "treasurer"].includes(member.role));
  if (reviewers.length > 0) return { groupName: groupData.name || "Group", reviewers };

  const fallbackReviewers = [
    groupData.ownerUid ? { uid: groupData.ownerUid, role: "owner", status: "active" } : null,
    groupData.adminUid && groupData.adminUid !== groupData.ownerUid ? { uid: groupData.adminUid, role: "admin", status: "active" } : null,
  ].filter(Boolean);
  return { groupName: groupData.name || "Group", reviewers: fallbackReviewers };
}

function mentionKey(value) {
  return (value || "")
    .toLowerCase()
    .replace(/@/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function mentionedMembersFromText(text, members) {
  const tags = Array.from(text.matchAll(/(^|\s)@([a-zA-Z0-9._-]+)/g))
    .map(match => mentionKey(match[2]))
    .filter(Boolean);
  if (tags.length === 0) return [];

  const wantsAll = tags.includes("all") || tags.includes("everyone");
  if (wantsAll) return members.filter(member => member.status !== "removed");

  return members.filter(member => {
    const firstName = mentionKey((member.name || "").split(/\s+/)[0]);
    const fullName = mentionKey(member.name || "");
    const emailName = mentionKey((member.email || "").split("@")[0]);
    return tags.includes(firstName) || tags.includes(fullName) || tags.includes(emailName);
  });
}

export function subscribeGroups(db, onNext, onError = console.error) {
  const q = query(collection(db, "groups"), orderBy("updatedAt", "desc"));
  return onSnapshot(
    q,
    snap => onNext(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    async err => {
      console.error("groups listener:", err);
      try {
        const fallback = await getDocs(collection(db, "groups"));
        onNext(fallback.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (fallbackErr) {
        onError(fallbackErr);
      }
    },
  );
}

export async function createUniversityGroup(db, { data, user, profile, selectedUni }) {
  const name = data.name.trim();
  const inviteCode = makeInviteCode(name);
  const groupRef = doc(collection(db, "groups"));
  const batch = writeBatch(db);
  const memberRef = doc(db, "groups", groupRef.id, "members", user.uid);

  batch.set(groupRef, {
    name,
    desc: data.desc.trim(),
    type: normalizeGroupType(data.type),
    avatarText: groupAvatarText(name),
    inviteCode,
    inviteLink: `/g/${inviteCode}`,
    ownerUid: user.uid,
    adminUid: user.uid,
    adminEmail: user.email || "",
    adminName: profile.name || "Group owner",
    memberCount: 1,
    mentionPermission: "admins",
    visibility: data.visibility || "inviteOnly",
    joinPolicy: data.visibility === "approvalRequired" ? "approvalRequired" : "inviteOnly",
    uniId: selectedUni?.id || "aru",
    universityName: selectedUni?.short || "ARU",
    active: true,
    createdAt: serverTimestamp(),
    activityAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(memberRef, {
    uid: user.uid,
    name: profile.username || profile.name || "Group owner",
    fullName: profile.fullName || "",
    email: user.email || "",
    phone: profile.phone || "",
    avatarUrl: profile.avatarUrl || null,
    role: "owner",
    status: "active",
    joinedAt: serverTimestamp(),
  });

  GROUP_CHANNELS.forEach(channel => {
    batch.set(doc(db, "groups", groupRef.id, "channels", channel.id), {
      ...channel,
      createdAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return { id: groupRef.id, name, desc: data.desc.trim(), type: data.type, inviteCode, memberCount: 1, visibility: data.visibility || "inviteOnly" };
}

export async function seedDemoGroups(db, { selectedUni, user, profile }) {
  const existing = await getDocs(query(collection(db, "groups"), where("demo", "==", true)));
  if (!existing.empty) {
    const batch = writeBatch(db);
    existing.docs.forEach(groupDoc => {
      addDemoSampleData(batch, doc(db, "groups", groupDoc.id), groupDoc.data(), { user, profile });
      batch.set(doc(db, "groups", groupDoc.id), {
      demoVersion: 3,
      currentAction: {
        type: demoTrackerFor(groupDoc.data()).collectionType === "event" ? "event" : "payment",
        title: demoTrackerFor(groupDoc.data()).title,
        description: demoTrackerFor(groupDoc.data()).description,
        targetId: "demo-main-tracker",
        amount: demoTrackerFor(groupDoc.data()).amount,
        ctaLabel: demoTrackerFor(groupDoc.data()).collectionType === "event" ? "Register" : "Contribute",
      },
      mentionPermission: groupDoc.data().mentionPermission || "admins",
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
    return "updated";
  }

  const batch = writeBatch(db);
  DEMO_GROUPS.forEach(group => {
    const groupRef = doc(collection(db, "groups"));
    const inviteCode = makeInviteCode(group.name);
    batch.set(groupRef, {
      ...group,
      inviteCode,
      inviteLink: `/g/${inviteCode}`,
      ownerUid: user.uid,
      adminUid: user.uid,
      adminEmail: user.email || "",
      adminName: profile.name || "Kampasika Demo",
      memberCount: group.name === "ARU Freshers 2026" ? 128 : group.name === "Hostel Block A" ? 64 : 42,
      mentionPermission: "admins",
      visibility: "public",
      joinPolicy: "public",
      uniId: selectedUni?.id || "aru",
      universityName: selectedUni?.short || "ARU",
      active: true,
      demo: true,
      demoVersion: 3,
      currentAction: {
        type: demoTrackerFor(group).collectionType === "event" ? "event" : "payment",
        title: demoTrackerFor(group).title,
        description: demoTrackerFor(group).description,
        targetId: "demo-main-tracker",
        amount: demoTrackerFor(group).amount,
        ctaLabel: demoTrackerFor(group).collectionType === "event" ? "Register" : "Contribute",
      },
      createdAt: serverTimestamp(),
      activityAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    GROUP_CHANNELS.forEach(channel => {
      batch.set(doc(db, "groups", groupRef.id, "channels", channel.id), {
        ...channel,
        createdAt: serverTimestamp(),
      });
    });
    addDemoSampleData(batch, groupRef, group, { user, profile });
  });

  await batch.commit();
  return "created";
}

export async function joinUniversityGroup(db, { group, user, profile }) {
  const memberRef = doc(db, "groups", group.id, "members", user.uid);
  const existingMember = await getDoc(memberRef);
  if (existingMember.exists() && existingMember.data()?.status === "blocked") {
    throw new Error("You cannot join this group right now.");
  }
  if (group.joinPolicy === "approvalRequired") {
    await setDoc(memberRef, {
      uid: user.uid,
      name: profile.username || profile.name || "Member",
      fullName: profile.fullName || "",
      email: user.email || "",
      phone: profile.phone || "",
      avatarUrl: profile.avatarUrl || null,
      role: "member",
      status: "pending",
      requestedAt: serverTimestamp(),
    }, { merge: true });
    return "pending";
  }
  await setDoc(memberRef, {
    uid: user.uid,
    name: profile.username || profile.name || "Member",
    fullName: profile.fullName || "",
    email: user.email || "",
    phone: profile.phone || "",
    avatarUrl: profile.avatarUrl || null,
    role: "member",
    status: "active",
    joinedAt: serverTimestamp(),
  }, { merge: true });
  await updateDoc(doc(db, "groups", group.id), {
    memberCount: increment(1),
    activityAt: serverTimestamp(),
    lastActivityByUid: user.uid,
    updatedAt: serverTimestamp(),
  });
  return "active";
}

export function subscribeGroupMembers(db, groupId, onNext, onError = console.error) {
  return onSnapshot(collection(db, "groups", groupId, "members"), { includeMetadataChanges: true }, snap => {
    const items = snap.docs
      .map(d => ({
        id: d.id,
        ...d.data(),
        joinedAt: d.data().joinedAt?.toDate?.() || null,
        requestedAt: d.data().requestedAt?.toDate?.() || null,
      }))
      .sort((a, b) => {
        const aTime = a.joinedAt?.getTime?.() || a.requestedAt?.getTime?.() || 0;
        const bTime = b.joinedAt?.getTime?.() || b.requestedAt?.getTime?.() || 0;
        return aTime - bTime;
      });
    onNext(items, { fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites });
  }, onError);
}

export function subscribeChannelMessages(db, groupId, channelId, onNext, onError = console.error) {
  const q = query(collection(db, "groups", groupId, "channels", channelId, "messages"), orderBy("createdAt", "desc"));
  return onSnapshot(q, { includeMetadataChanges: true }, snap => {
    onNext(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || null })), {
      fromCache: snap.metadata.fromCache,
      hasPendingWrites: snap.metadata.hasPendingWrites,
    });
  }, onError);
}

export function subscribeGroupWorkGroups(db, groupId, onNext, onError = console.error) {
  const q = query(collection(db, "groups", groupId, "workGroups"), orderBy("createdAt", "asc"));
  return onSnapshot(q, { includeMetadataChanges: true }, snap => {
    onNext(snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toDate?.() || null,
      submittedAt: d.data().submittedAt?.toDate?.() || null,
    })), { fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites });
  }, onError);
}

export async function createGroupWorkGroup(db, { groupId, user, profile, data }) {
  const name = (data.name || "").trim();
  if (!name) throw new Error("In-group name is required.");
  const memberUids = Array.from(new Set(data.memberUids || [])).filter(Boolean);
  const leaderUid = data.leaderUid || memberUids[0] || "";
  await addDoc(collection(db, "groups", groupId, "workGroups"), {
    name,
    description: (data.description || "").trim(),
    taskTitle: (data.taskTitle || "").trim(),
    taskInstructions: (data.taskInstructions || "").trim(),
    deadline: data.deadline || null,
    leaderUid,
    leaderName: data.leaderName || "",
    memberUids,
    memberNames: data.memberNames || [],
    status: "open",
    createdByUid: user.uid,
    createdByName: profile.name || "Leader",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "groups", groupId), {
    activityAt: serverTimestamp(),
    lastActivityByUid: user.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function updateGroupWorkGroup(db, { groupId, workGroupId, user, data }) {
  const memberUids = Array.from(new Set(data.memberUids || [])).filter(Boolean);
  await updateDoc(doc(db, "groups", groupId, "workGroups", workGroupId), {
    name: (data.name || "").trim(),
    description: (data.description || "").trim(),
    taskTitle: (data.taskTitle || "").trim(),
    taskInstructions: (data.taskInstructions || "").trim(),
    deadline: data.deadline || null,
    leaderUid: data.leaderUid || memberUids[0] || "",
    leaderName: data.leaderName || "",
    memberUids,
    memberNames: data.memberNames || [],
    editedByUid: user.uid,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "groups", groupId), {
    activityAt: serverTimestamp(),
    lastActivityByUid: user.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteGroupWorkGroup(db, { groupId, workGroupId, user }) {
  await deleteDoc(doc(db, "groups", groupId, "workGroups", workGroupId));
  await updateDoc(doc(db, "groups", groupId), {
    activityAt: serverTimestamp(),
    lastActivityByUid: user.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function submitGroupWork(db, { groupId, workGroupId, user, profile, data }) {
  await updateDoc(doc(db, "groups", groupId, "workGroups", workGroupId), {
    status: "submitted",
    submissionTitle: (data.title || "").trim(),
    submissionNote: (data.note || "").trim(),
    submissionUrl: (data.url || "").trim(),
    submittedByUid: user.uid,
    submittedByName: profile.name || "Member",
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "groups", groupId), {
    activityAt: serverTimestamp(),
    lastActivityByUid: user.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function sendGroupMessage(db, { groupId, channelId = "chats", text = "", user, profile, kind = "message", pinned = false, group = null, members = [], replyTo = null, attachments = [] }) {
  const cleanText = text.trim();
  const mentionCategory = notificationCategory("group_mention");
  const mentionedMembers = mentionedMembersFromText(cleanText, members)
    .filter(member => (
      member.uid
      && member.uid !== user.uid
      && member.status === "active"
      && !member.notificationMuted
      && memberAllowsNotification(member, mentionCategory)
    ));
  const messageRef = await addDoc(collection(db, "groups", groupId, "channels", channelId, "messages"), {
    text: cleanText,
    authorName: profile.name || "Member",
    authorUid: user.uid,
    kind,
    pinned,
    replyTo: replyTo ? {
      id: replyTo.id,
      authorName: replyTo.authorName || "Member",
      text: (replyTo.text || replyTo.attachments?.[0]?.name || "Attachment").slice(0, 140),
    } : null,
    attachments,
    reactions: {},
    mentionedUids: mentionedMembers.map(member => member.uid),
    createdAt: serverTimestamp(),
  });

  await Promise.all(mentionedMembers.map(member => writeNotification(db, member.uid, {
    type: "group_mention",
    title: `${profile.name || "Someone"} tagged you`,
    message: `${group?.name || "Group"}: ${cleanText.slice(0, 140)}`,
    groupId,
    messageId: messageRef.id,
    category: mentionCategory,
    dedupeKey: collectionDedupeKey("group_mention", groupId, messageRef.id, member.uid),
  })));

  if (kind === "announcement") {
    await notifyMembers(db, members, {
      excludeUid: user.uid,
    type: "group_announcement",
    title: `${group?.name || "Group"} announcement`,
    message: cleanText.slice(0, 160),
    groupId,
    messageId: messageRef.id,
    category: "announcements",
    dedupeKey: collectionDedupeKey("group_announcement", groupId, messageRef.id),
  });
  }

  await updateDoc(doc(db, "groups", groupId), { activityAt: serverTimestamp(), lastActivityByUid: user.uid, updatedAt: serverTimestamp() });
  return messageRef;
}

export async function deleteGroupMessage(db, { groupId, channelId = "chats", messageId, user }) {
  await deleteDoc(doc(db, "groups", groupId, "channels", channelId, "messages", messageId));
  await updateDoc(doc(db, "groups", groupId), {
    activityAt: serverTimestamp(),
    lastActivityByUid: user.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function reactToGroupMessage(db, { groupId, channelId = "chats", messageId, emoji, user }) {
  const safeEmoji = ["\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F64F}", "\u{1F525}"].includes(emoji) ? emoji : "\u{1F44D}";
  await updateDoc(doc(db, "groups", groupId, "channels", channelId, "messages", messageId), {
    [`reactions.${user.uid}`]: safeEmoji,
    updatedAt: serverTimestamp(),
  });
}

export async function addGroupResource(db, { groupId, user, profile, title, url = "", subject = "", topic = "", resourceType = "", fileName = "", storagePath = "", description = "", deadline = "" }) {
  const text = title.trim();
  const cleanUrl = url.trim();
  const cleanDescription = description.trim();
  if (!text) throw new Error("Resource title is required.");
  const resourceRef = await addDoc(collection(db, "groups", groupId, "channels", "resources", "messages"), {
    title: text,
    text: cleanDescription || text,
    url: cleanUrl,
    subject: subject.trim(),
    topic: topic.trim(),
    resourceType: resourceType.trim(),
    fileName: fileName.trim(),
    storagePath: storagePath.trim(),
    description: cleanDescription,
    deadline: deadline || null,
    authorName: profile.name || "Admin",
    authorUid: user.uid,
    kind: "resource",
    pinned: false,
    previewPdfUrl: "",
    previewStatus: "",
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "groups", groupId), { activityAt: serverTimestamp(), lastActivityByUid: user.uid, updatedAt: serverTimestamp() });
  return resourceRef;
}

export async function updateGroupResource(db, { groupId, resourceId, user, data }) {
  const text = (data.title || "").trim();
  const cleanDescription = (data.description || "").trim();
  if (!text) throw new Error("Resource title is required.");
  const updates = {
    title: text,
    text: cleanDescription || text,
    url: (data.url || "").trim(),
    subject: (data.subject || "").trim(),
    topic: (data.topic || "").trim(),
    resourceType: (data.resourceType || "").trim(),
    fileName: (data.fileName || "").trim(),
    storagePath: (data.storagePath || "").trim(),
    description: cleanDescription,
    deadline: data.deadline || null,
    editedByUid: user.uid,
    updatedAt: serverTimestamp(),
  };
  if (Object.prototype.hasOwnProperty.call(data, "previewPdfUrl")) updates.previewPdfUrl = data.previewPdfUrl || "";
  if (Object.prototype.hasOwnProperty.call(data, "previewStatus")) updates.previewStatus = data.previewStatus || "";
  await updateDoc(doc(db, "groups", groupId, "channels", "resources", "messages", resourceId), updates);
  await updateDoc(doc(db, "groups", groupId), { activityAt: serverTimestamp(), lastActivityByUid: user.uid, updatedAt: serverTimestamp() });
}

export async function deleteGroupResource(db, { groupId, resourceId, user }) {
  await deleteDoc(doc(db, "groups", groupId, "channels", "resources", "messages", resourceId));
  await updateDoc(doc(db, "groups", groupId), { activityAt: serverTimestamp(), lastActivityByUid: user.uid, updatedAt: serverTimestamp() });
}

export async function updateGroupMentionPermission(db, { groupId, mentionPermission }) {
  if (!["admins", "all"].includes(mentionPermission)) throw new Error("Invalid mention permission");
  await updateDoc(doc(db, "groups", groupId), {
    mentionPermission,
    updatedAt: serverTimestamp(),
  });
}

export async function updateGroupMute(db, { groupId, uid, notificationMuted }) {
  await updateDoc(doc(db, "groups", groupId, "members", uid), {
    notificationMuted: !!notificationMuted,
    updatedAt: serverTimestamp(),
  });
}

export async function updateGroupNotificationPreferences(db, { groupId, uid, notificationPrefs }) {
  const safePrefs = Object.keys(DEFAULT_GROUP_NOTIFICATION_PREFS).reduce((acc, key) => {
    acc[key] = notificationPrefs?.[key] !== false;
    return acc;
  }, {});
  await updateDoc(doc(db, "groups", groupId, "members", uid), {
    notificationPrefs: safePrefs,
    updatedAt: serverTimestamp(),
  });
}

export async function updateUniversityGroupProfile(db, storage, { group, data, user }) {
  const nextName = (data.name || "").trim();
  if (!nextName) throw new Error("Group name is required.");

  let avatarUrl = group.avatarUrl || "";
  if (storage && data.avatarFile) {
    const avatarRef = ref(storage, `groups/${group.id}/avatar/${user.uid}_${Date.now()}.jpg`);
    const snap = await uploadBytes(avatarRef, data.avatarFile);
    avatarUrl = await getDownloadURL(snap.ref);
  }

  const updates = {
    name: nextName,
    desc: (data.desc || "").trim(),
    avatarText: groupAvatarText(nextName),
    profileUpdatedAt: serverTimestamp(),
  };
  if (avatarUrl) updates.avatarUrl = avatarUrl;

  await updateDoc(doc(db, "groups", group.id), updates);
  return {
    ...group,
    ...updates,
    updatedAt: new Date(),
  };
}

export async function updateGroupCurrentAction(db, { groupId, currentAction, user }) {
  if (!currentAction) {
    await updateDoc(doc(db, "groups", groupId), {
      currentAction: null,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  await updateDoc(doc(db, "groups", groupId), {
    currentAction: {
      type: currentAction.type || "announcement",
      title: "Pinned update",
      description: (currentAction.description || "").trim(),
      amount: Number(currentAction.amount || 0),
      targetId: currentAction.targetId || "",
      ctaLabel: currentAction.ctaLabel || "",
      updatedByUid: user.uid,
      updatedAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });
}

export async function leaveUniversityGroup(db, { group, member }) {
  if (member?.role === "owner") {
    throw new Error("The owner cannot leave before transferring ownership.");
  }
  await updateDoc(doc(db, "groups", group.id, "members", member.uid), {
    status: "left",
    leftAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function archiveUniversityGroup(db, { groupId, user, mode = "archive" }) {
  await updateDoc(doc(db, "groups", groupId), {
    active: false,
    status: mode === "delete" ? "deleted" : "archived",
    deleteRequested: mode === "delete",
    archivedByUid: user.uid,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function subscribeGroupCollections(db, groupId, onNext, onError = console.error) {
  const q = query(collection(db, "groups", groupId, "collections"), orderBy("createdAt", "desc"));
  return onSnapshot(q, { includeMetadataChanges: true }, snap => {
    onNext(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || null })), {
      fromCache: snap.metadata.fromCache,
      hasPendingWrites: snap.metadata.hasPendingWrites,
    });
  }, onError);
}

export function subscribeGroupCollection(db, groupId, collectionId, onNext, onError = console.error) {
  return onSnapshot(doc(db, "groups", groupId, "collections", collectionId), { includeMetadataChanges: true }, snap => {
    onNext(snap.exists() ? [{ id: snap.id, ...snap.data(), createdAt: snap.data().createdAt?.toDate?.() || null }] : [], {
      fromCache: snap.metadata.fromCache,
      hasPendingWrites: snap.metadata.hasPendingWrites,
    });
  }, onError);
}

export async function uploadCollectionPhoto(storage, { groupId, collectionId, uid, file }) {
  const photoRef = ref(storage, `groups/${groupId}/collections/${collectionId}/media/${uid}_${Date.now()}.jpg`);
  const snap = await uploadBytes(photoRef, file, {
    contentType: file.type?.startsWith("image/") ? file.type : "image/jpeg",
  });
  return getDownloadURL(snap.ref);
}

export async function attachGroupCollectionPhoto(db, storage, { groupId, collectionId, uid, file }) {
  if (!storage || !file) return "";
  try {
    await updateDoc(doc(db, "groups", groupId, "collections", collectionId), {
      photoUploadStatus: "pending",
      photoUploadStartedAt: serverTimestamp(),
      photoUploadError: "",
      updatedAt: serverTimestamp(),
    });
    let uploadFile = file;
    if (uploadFile.type?.startsWith("image/")) {
      try {
        const { file: compressed } = await compressImage(uploadFile, {
          ...COMPRESSION_PRESETS.listing,
          maxSizeKB: 350,
          maxWidth: 1600,
          maxHeight: 1600,
        });
        uploadFile = compressed;
      } catch (compressionError) {
        console.warn("attachGroupCollectionPhoto compression failed, uploading original:", compressionError);
      }
    }
    const photoUrl = await uploadCollectionPhoto(storage, { groupId, collectionId, uid, file: uploadFile });
    await updateDoc(doc(db, "groups", groupId, "collections", collectionId), {
      photoUrl,
      photoUploadStatus: "ready",
      photoUploadedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return photoUrl;
  } catch (error) {
    console.error("attachGroupCollectionPhoto failed:", error);
    await updateDoc(doc(db, "groups", groupId, "collections", collectionId), {
      photoUploadStatus: "failed",
      photoUploadError: String(error.message || error).slice(0, 250),
      updatedAt: serverTimestamp(),
    });
    throw error;
  }
}

export async function createGroupCollection(db, { groupId, user, profile, data, storage = null }) {
  const amount = Number(data.amount || 0);
  const docRef = doc(collection(db, "groups", groupId, "collections"));

  await setDoc(docRef, {
    title: data.title.trim(),
    description: data.description.trim(),
    collectionType: data.collectionType || "contribution",
    amount,
    options: (data.options || "").trim(),
    expectedPeople: Number(data.expectedPeople || 0),
    paymentMethods: data.paymentMethods,
    deadline: data.deadline || null,
    photoUrl: "",
    photoUploadStatus: "",
    photoUploadStartedAt: null,
    visibility: data.visibility || "groupOnly",
    roundSourceId: data.roundSourceId || "",
    roundRootId: data.roundRootId || data.roundSourceId || "",
    roundNumber: Number(data.roundNumber || 1),
    roundBaseTitle: data.roundBaseTitle || data.roundStartedFromTitle || data.title.trim(),
    roundStartedFromTitle: data.roundStartedFromTitle || "",
    createdByUid: user.uid,
    createdByName: profile.name || "Admin",
    groupId,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "groups", groupId), {
    activityAt: serverTimestamp(),
    lastActivityByUid: user.uid,
    updatedAt: serverTimestamp(),
  });

  Promise.resolve().then(async () => {
    try {
      const [groupSnap, members] = await Promise.all([
        getDoc(doc(db, "groups", groupId)),
        getGroupMembers(db, groupId),
      ]);
      const groupName = groupSnap.exists() ? groupSnap.data().name : "Group";
      if (groupSnap.exists()) {
        await updateDoc(docRef, {
          uniId: groupSnap.data().uniId || "aru",
          universityName: groupSnap.data().universityName || "ARU",
        });
      }
      const isEvent = data.collectionType === "event";
      await notifyMembers(db, members, {
        excludeUid: user.uid,
        type: isEvent ? "group_event" : "group_payment_request",
        title: isEvent ? `${groupName}: new event` : `${groupName}: new payment request`,
        message: `${data.title.trim()} - ${amount.toLocaleString()} TSh`,
        groupId,
        collectionId: docRef.id,
        category: isEvent ? "events" : "payments",
        dedupeKey: collectionDedupeKey(isEvent ? "group_event" : "group_payment_request", groupId, docRef.id),
      });
    } catch (error) {
      console.error("createGroupCollection background updates failed:", error);
    }
  });
  return docRef;
}

export async function archiveGroupCollectionRound(db, { groupId, collectionId, user, roundRootId, roundNumber = 1 }) {
  if (!groupId || !collectionId || !user?.uid) return;
  await updateDoc(doc(db, "groups", groupId, "collections", collectionId), {
    status: "archived",
    roundRootId: roundRootId || collectionId,
    roundNumber: Number(roundNumber || 1),
    archivedRound: true,
    archivedAt: serverTimestamp(),
    archivedByUid: user.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function updateGroupCollection(db, { groupId, collectionId, user, data, storage = null }) {
  const amount = Number(data.amount || 0);
  const collectionRef = doc(db, "groups", groupId, "collections", collectionId);
  const currentSnap = await getDoc(collectionRef);
  let photoUrl = currentSnap.exists() ? (currentSnap.data().photoUrl || "") : "";
  if (storage && data.photoFile) {
    photoUrl = await uploadCollectionPhoto(storage, {
      groupId,
      collectionId,
      uid: user.uid,
      file: data.photoFile,
    });
  }

  await updateDoc(collectionRef, {
    title: data.title.trim(),
    description: data.description.trim(),
    collectionType: data.collectionType || "contribution",
    amount,
    options: (data.options || "").trim(),
    expectedPeople: Number(data.expectedPeople || 0),
    paymentMethods: data.paymentMethods,
    deadline: data.deadline || null,
    photoUrl,
    visibility: data.visibility || "groupOnly",
    updatedByUid: user.uid,
    updatedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "groups", groupId), {
    activityAt: serverTimestamp(),
    lastActivityByUid: user.uid,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteGroupCollection(db, { groupId, collectionId, user }) {
  const paymentsSnap = await getDocs(collection(db, "groups", groupId, "collections", collectionId, "payments"));
  const batch = writeBatch(db);
  paymentsSnap.docs.forEach(paymentDoc => batch.delete(paymentDoc.ref));
  batch.delete(doc(db, "groups", groupId, "collections", collectionId));
  batch.update(doc(db, "groups", groupId), {
    activityAt: serverTimestamp(),
    lastActivityByUid: user.uid,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function addManualGroupPayment(db, { groupId, collectionItem, data, recorder }) {
  const paymentId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const paymentRef = doc(db, "groups", groupId, "collections", collectionItem.id, "payments", paymentId);
  await setDoc(paymentRef, {
    uid: "",
    studentName: (data.studentName || "").trim() || "Student",
    phone: (data.phone || "").trim(),
    payerName: (data.payerName || "").trim(),
    paymentRef: (data.paymentRef || "").trim(),
    amountDue: Number(collectionItem.amount || 0),
    amountPaid: Number(data.amountPaid || collectionItem.amount || 0),
    status: "paid",
    manual: true,
    recordedByUid: recorder.uid,
    recordedByName: recorder.name || recorder.email || "Leader",
    verifiedByUid: recorder.uid,
    verifiedByName: recorder.name || recorder.email || "Leader",
    verifiedAt: serverTimestamp(),
    submittedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return paymentRef;
}

export function subscribePublicGroupEvents(db, onNext, onError = console.error) {
  const q = query(
    collectionGroup(db, "collections"),
    where("collectionType", "in", ["event", "order"]),
    where("visibility", "==", "public")
  );
  return onSnapshot(q, snap => {
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data(), groupId: d.data().groupId || d.ref.parent.parent?.id || "" }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    onNext(items);
  }, onError);
}

export function subscribeCollectionPayments(db, groupId, collectionId, onNext, onError = console.error) {
  const q = query(collection(db, "groups", groupId, "collections", collectionId, "payments"), orderBy("createdAt", "desc"));
  return onSnapshot(q, { includeMetadataChanges: true }, snap => {
    onNext(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() || null })), {
      fromCache: snap.metadata.fromCache,
      hasPendingWrites: snap.metadata.hasPendingWrites,
    });
  }, onError);
}

export function subscribeMyCollectionPayment(db, groupId, collectionId, uid, onNext, onError = console.error) {
  return onSnapshot(doc(db, "groups", groupId, "collections", collectionId, "payments", uid), { includeMetadataChanges: true }, snap => {
    onNext(snap.exists() ? [{ id: snap.id, ...snap.data(), createdAt: snap.data().createdAt?.toDate?.() || null }] : [], {
      fromCache: snap.metadata.fromCache,
      hasPendingWrites: snap.metadata.hasPendingWrites,
    });
  }, onError);
}

export async function uploadPaymentProof(storage, { groupId, collectionId, uid, file }) {
  const proofRef = ref(storage, `groups/${groupId}/collections/${collectionId}/payments/${uid}_${Date.now()}.jpg`);
  const snap = await uploadBytes(proofRef, file);
  return getDownloadURL(snap.ref);
}

export async function submitGroupPayment(db, storage, { groupId, collectionItem, user, profile, data }) {
  let paymentProofUrl = "";
  if (data.paymentProofFile) {
    paymentProofUrl = await uploadPaymentProof(storage, {
      groupId,
      collectionId: collectionItem.id,
      uid: user.uid,
      file: data.paymentProofFile,
    });
  }

  const paymentRef = doc(db, "groups", groupId, "collections", collectionItem.id, "payments", user.uid);
  await setDoc(paymentRef, {
    uid: user.uid,
    studentName: data.studentName.trim() || profile.name || "Member",
    phone: data.phone.trim(),
    payerName: data.payerName.trim(),
    paymentRef: data.paymentRef.trim(),
    selectedOption: (data.selectedOption || "").trim(),
    amountDue: Number(collectionItem.amount || 0),
    amountPaid: Number(data.amountPaid || 0),
    ...(paymentProofUrl ? { paymentProofUrl } : {}),
    proofRequested: false,
    proofRequestMessage: "",
    status: "pending",
    submittedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  const { groupName, reviewers } = await getGroupReviewers(db, groupId);
  await notifyMembers(db, reviewers, {
    excludeUid: user.uid,
    type: "group_payment_submitted",
    title: `${groupName}: payment proof submitted`,
    message: `${data.studentName.trim() || profile.name || "Member"} submitted proof for ${collectionItem.title}`,
    groupId,
    collectionId: collectionItem.id,
    paymentId: paymentRef.id,
    category: "adminAlerts",
    dedupeKey: collectionDedupeKey("group_payment_submitted", groupId, collectionItem.id, paymentRef.id),
  });
}

export async function registerGroupEvent(db, { groupId, collectionItem, user, profile, data = {} }) {
  const registrationRef = doc(db, "groups", groupId, "collections", collectionItem.id, "payments", user.uid);
  const isOrder = collectionItem.collectionType === "order";
  await setDoc(registrationRef, {
    uid: user.uid,
    studentName: profile.name || "Member",
    phone: (data.phone || "").trim(),
    payerName: "",
    paymentRef: "",
    selectedOption: (data.selectedOption || "").trim(),
    amountDue: Number(collectionItem.amount || 0),
    amountPaid: 0,
    status: "registered",
    registeredAt: serverTimestamp(),
    submittedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  const { groupName, reviewers } = await getGroupReviewers(db, groupId);
  await notifyMembers(db, reviewers, {
    excludeUid: user.uid,
    type: isOrder ? "group_order_placed" : "group_event_registered",
    title: isOrder ? `${groupName}: new order` : `${groupName}: event registration`,
    message: isOrder
      ? `${profile.name || "Member"} placed an order for ${collectionItem.title}`
      : `${profile.name || "Member"} registered for ${collectionItem.title}`,
    groupId,
    collectionId: collectionItem.id,
    paymentId: registrationRef.id,
    category: "adminAlerts",
    dedupeKey: collectionDedupeKey(isOrder ? "group_order_placed" : "group_event_registered", groupId, collectionItem.id, registrationRef.id),
  });
}

export async function verifyGroupPayment(db, { groupId, collectionId, paymentId, status, verifier }) {
  const paymentRef = doc(db, "groups", groupId, "collections", collectionId, "payments", paymentId);
  const paymentSnap = await getDoc(paymentRef);
  await updateDoc(paymentRef, {
    status,
    verifiedByUid: verifier.uid,
    verifiedByName: verifier.name || verifier.email || "Verifier",
    proofRequested: false,
    verifiedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (paymentSnap.exists() && paymentSnap.data().uid) {
    await notifyGroupUser(db, {
      groupId,
      uid: paymentSnap.data().uid,
      notification: {
        type: status === "paid" ? "group_payment_verified" : "group_payment_rejected",
        title: status === "paid" ? "Payment verified" : "Payment rejected",
        message: status === "paid" ? "Your group payment has been verified." : "Your group payment needs checking.",
        groupId,
        collectionId,
        paymentId,
        category: "paymentStatus",
        dedupeKey: collectionDedupeKey(status === "paid" ? "group_payment_verified" : "group_payment_rejected", groupId, collectionId, paymentId),
      },
    });
  }
}

export async function requestGroupPaymentProof(db, { groupId, collectionId, payment, requester, message }) {
  const cleanMessage = (message || "Please upload a clearer payment screenshot proof.").trim();
  await updateDoc(doc(db, "groups", groupId, "collections", collectionId, "payments", payment.id), {
    status: "pending",
    proofRequested: true,
    proofRequestMessage: cleanMessage,
    proofRequestedByUid: requester.uid,
    proofRequestedByName: requester.name || requester.email || "Admin",
    proofRequestedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (payment.uid) {
    await notifyGroupUser(db, {
      groupId,
      uid: payment.uid,
      notification: {
        type: "group_payment_proof_requested",
        title: "Payment proof requested",
        message: cleanMessage,
        groupId,
        collectionId,
        paymentId: payment.id,
        category: "proofRequests",
        dedupeKey: collectionDedupeKey("group_payment_proof_requested", groupId, collectionId, payment.id),
      },
    });
  }
}

export async function sendCollectionDeadlineReminder(db, { groupId, collectionItem, requester }) {
  const [groupSnap, members, paymentsSnap] = await Promise.all([
    getDoc(doc(db, "groups", groupId)),
    getGroupMembers(db, groupId),
    getDocs(collection(db, "groups", groupId, "collections", collectionItem.id, "payments")),
  ]);
  const groupName = groupSnap.exists() ? groupSnap.data().name : "Group";
  const settledUids = new Set(paymentsSnap.docs
    .map(paymentDoc => paymentDoc.data())
    .filter(payment => ["paid", "registered", "pending"].includes(payment.status))
    .map(payment => payment.uid)
    .filter(Boolean));
  const affectedMembers = members.filter(member => (
    member.uid !== requester.uid
    && !settledUids.has(member.uid)
  ));
  await notifyMembers(db, affectedMembers, {
    excludeUid: requester.uid,
    type: "group_payment_deadline_reminder",
    title: `${groupName}: deadline reminder`,
    message: `${collectionItem.title} is still open${collectionItem.deadline ? ` until ${collectionItem.deadline}` : ""}.`,
    groupId,
    collectionId: collectionItem.id,
    category: "deadlineReminders",
    dedupeKey: collectionDedupeKey("group_payment_deadline_reminder", groupId, collectionItem.id),
  });
  return affectedMembers.length;
}

export async function updateMemberRole(db, { groupId, uid, role }) {
  if (!GROUP_ROLES.includes(role)) throw new Error("Invalid role");
  await updateDoc(doc(db, "groups", groupId, "members", uid), {
    role,
    updatedAt: serverTimestamp(),
  });
}

export async function updateGroupMemberStatus(db, { groupId, member, status }) {
  if (!["removed", "blocked"].includes(status)) throw new Error("Invalid member action");
  if (member?.role === "owner") throw new Error("The group owner cannot be removed or blocked.");
  const update = {
    status,
    updatedAt: serverTimestamp(),
  };
  if (status === "removed") update.removedAt = serverTimestamp();
  if (status === "blocked") update.blockedAt = serverTimestamp();
  await updateDoc(doc(db, "groups", groupId, "members", member.uid), update);
  if (["removed", "blocked"].includes(status) && (!member.status || member.status === "active")) {
    await updateDoc(doc(db, "groups", groupId), {
      memberCount: increment(-1),
      activityAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function updateGroupPaymentAmount(db, { groupId, collectionId, paymentId, amountPaid, verifier }) {
  const paymentRef = doc(db, "groups", groupId, "collections", collectionId, "payments", paymentId);
  await updateDoc(paymentRef, {
    amountPaid: Number(amountPaid || 0),
    adjustedByUid: verifier.uid,
    adjustedByName: verifier.name || verifier.email || "Verifier",
    adjustedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function approveGroupMember(db, { groupId, member }) {
  await updateDoc(doc(db, "groups", groupId, "members", member.uid), {
    status: "active",
    joinedAt: serverTimestamp(),
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "groups", groupId), {
    memberCount: increment(1),
    activityAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function rejectGroupMember(db, { groupId, member }) {
  await updateDoc(doc(db, "groups", groupId, "members", member.uid), {
    status: "rejected",
    rejectedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
