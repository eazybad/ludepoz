import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getBlob, getDownloadURL, ref, uploadBytes, uploadBytesResumable } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { compressImage, COMPRESSION_PRESETS } from "../imageCompression";
import "./GroupComponents.css";
import {
  GROUP_ROLES,
  DEFAULT_GROUP_NOTIFICATION_PREFS,
  canManageGroup,
  canVerifyPayments,
  addManualGroupPayment,
  attachGroupCollectionPhoto,
  createGroupCollection,
  createGroupWorkGroup,
  deleteGroupMessage,
  deleteGroupCollection,
  deleteGroupResource,
  deleteGroupWorkGroup,
  groupAvatarText,
  isGroupMember,
  leaveUniversityGroup,
  paymentSummary,
  addGroupResource,
  archiveGroupCollectionRound,
  approveGroupMember,
  pinGroupMessage,
  reactToGroupMessage,
  rejectGroupMember,
  sendGroupMessage,
  submitGroupPayment,
  submitGroupWork,
  registerGroupEvent,
  subscribeChannelMessages,
  subscribeGroupCollection,
  subscribeCollectionPayments,
  subscribeGroupCollections,
  subscribeGroupMembers,
  subscribeGroupWorkGroups,
  subscribeMyCollectionPayment,
  requestGroupPaymentProof,
  sendCollectionDeadlineReminder,
  updateGroupMentionPermission,
  updateGroupMemberStatus,
  updateGroupCollection,
  updateGroupCurrentAction,
  updateGroupMute,
  updateGroupNotificationPreferences,
  updateGroupPaymentAmount,
  updateGroupResource,
  updateGroupWorkGroup,
  updateMemberRole,
  updateUniversityGroupProfile,
  verifyGroupPayment,
} from "./groupService";

const emptyTracker = {
  title: "",
  description: "",
  collectionType: "contribution",
  amount: "",
  options: "",
  expectedPeople: "",
  paymentMethods: "",
  visibility: "groupOnly",
  deadline: "",
  photoFile: null,
  photoPreview: "",
};

const emptyPayment = {
  studentName: "",
  phone: "",
  provider: "Mpesa",
  payerName: "",
  paymentRef: "",
  amountPaid: "",
  selectedOption: "",
  paymentProofFile: null,
  paymentProofPreview: "",
};

const AZAMPAY_PROVIDERS = [
  { value: "Mpesa", label: "M-Pesa" },
  { value: "Airtel", label: "Airtel Money" },
  { value: "Tigo", label: "Tigo Pesa / Yas" },
  { value: "Halopesa", label: "HaloPesa" },
  { value: "Azampesa", label: "AzamPesa" },
];
const ENABLE_AZAMPAY_PAYMENTS = false;
const PAWAPAY_PROVIDERS = [
  { value: "AIRTEL_TZA", label: "Airtel Money" },
  { value: "VODACOM_TZA", label: "M-Pesa" },
  { value: "TIGO_TZA", label: "Tigo Pesa / Yas" },
  { value: "HALOTEL_TZA", label: "HaloPesa" },
];
const ENABLE_PAWAPAY_PAYMENTS = true;

const emptyManualPayment = {
  studentName: "",
  phone: "",
  payerName: "",
  paymentRef: "",
  amountPaid: "",
};

const emptyResource = {
  title: "",
  subject: "",
  topic: "",
  resourceType: "",
  description: "",
  url: "",
  file: null,
  files: [],
  fileName: "",
  deadline: "",
};

const emptySimpleResource = {
  mode: "files",
  subject: "",
  url: "",
  files: [],
};

const emptyWorkGroup = {
  name: "",
  description: "",
  taskTitle: "",
  taskInstructions: "",
  deadline: "",
  leaderUid: "",
  memberUids: [],
};

const emptyWorkSubmission = {
  title: "",
  note: "",
  url: "",
  file: null,
  filePreview: "",
};

const OFFLINE_RESOURCE_CACHE = "kampasika-offline-resources-v1";
const OFFLINE_GROUP_MESSAGE_QUEUE = "kampasika-offline-group-message-queue-v1";
const MAX_RESOURCE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_FILE_MB = Math.round(MAX_RESOURCE_FILE_BYTES / (1024 * 1024));
const ENABLE_DOCUMENT_PDF_PREVIEWS = false;
// Hidden for this stage — focusing on Collections. Flip back to true to restore.
const ENABLE_GROUP_FILES = false;
const ENABLE_SUBGROUPS = false;
const RESOURCE_FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.heic";
const ALLOWED_RESOURCE_FILE_EXTENSIONS = /\.(pdf|docx?|xlsx?|csv|pptx?|jpe?g|png|webp|heic)$/i;
const ALLOWED_RESOURCE_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

function offlineResourceStoreKey(groupId) {
  return `kampasikaOfflineResources:${groupId || "unknown"}`;
}

function readOfflineResourceStore(groupId) {
  try {
    return JSON.parse(localStorage.getItem(offlineResourceStoreKey(groupId)) || "{}");
  } catch (_) {
    return {};
  }
}

function writeOfflineResourceStore(groupId, value) {
  try {
    localStorage.setItem(offlineResourceStoreKey(groupId), JSON.stringify(value));
  } catch (_) {}
}

function groupScreenCacheKey(groupId) {
  return `kampasikaGroupScreen:${groupId || "unknown"}`;
}

function encodeCacheValue(value) {
  if (value instanceof Date) return { __kampasikaDate: value.toISOString() };
  if (Array.isArray(value)) return value.map(encodeCacheValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeCacheValue(item)]));
  }
  return value;
}

function decodeCacheValue(value) {
  if (Array.isArray(value)) return value.map(decodeCacheValue);
  if (value && typeof value === "object") {
    if (value.__kampasikaDate) return new Date(value.__kampasikaDate);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeCacheValue(item)]));
  }
  return value;
}

function readGroupScreenCache(groupId) {
  try {
    return decodeCacheValue(JSON.parse(localStorage.getItem(groupScreenCacheKey(groupId)) || "null")) || {};
  } catch (_) {
    return {};
  }
}

function writeGroupScreenCache(groupId, value) {
  try {
    localStorage.setItem(groupScreenCacheKey(groupId), JSON.stringify(encodeCacheValue(value)));
  } catch (_) {}
}

function readOfflineMessageQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_GROUP_MESSAGE_QUEUE) || "[]");
  } catch (_) {
    return [];
  }
}

function writeOfflineMessageQueue(items) {
  try {
    localStorage.setItem(OFFLINE_GROUP_MESSAGE_QUEUE, JSON.stringify(items));
  } catch (_) {}
}

function queuedMessagesForGroup(groupId, uid) {
  return readOfflineMessageQueue()
    .filter(item => item.groupId === groupId && (!uid || item.authorUid === uid))
    .map(item => ({
      ...item,
      createdAt: new Date(item.createdAt || Date.now()),
      offlinePending: true,
    }));
}

function saveQueuedGroupMessage(message) {
  const queue = readOfflineMessageQueue();
  writeOfflineMessageQueue([...queue.filter(item => item.id !== message.id), message]);
}

function removeQueuedGroupMessage(messageId) {
  writeOfflineMessageQueue(readOfflineMessageQueue().filter(item => item.id !== messageId));
}

function MenuIcon({ name }) {
  const common = {
    width: "22",
    height: "22",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  const paths = {
    chats: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path d="M8 9h8" /><path d="M8 13h5" /></>,
    payments: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M7 15h4" /></>,
    workgroups: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.8" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>,
    members: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.8" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>,
    resources: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h5" /></>,
    events: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /></>,
    overview: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    mute: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" /><path d="M10 21h4" /><path d="M3 3l18 18" /></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" /><path d="M10 21h4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 9c.2.6.8 1 1.5 1H21a2 2 0 1 1 0 4h-.2c-.7 0-1.3.4-1.5 1Z" /></>,
    qr: <><path d="M4 4h6v6H4z" /><path d="M14 4h6v6h-6z" /><path d="M4 14h6v6H4z" /><path d="M14 14h2v2h-2z" /><path d="M18 14h2v6h-2z" /><path d="M14 18h2v2h-2z" /></>,
    back: <><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></>,
    leave: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
    trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></>,
    send: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7Z" /></>,
    down: <><path d="M12 5v14" /><path d="M19 12l-7 7-7-7" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
    folder: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" /></>,
    close: <><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.7l6.8-4.4" /><path d="M8.6 13.3l6.8 4.4" /></>,
    more: <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
    pin: <><path d="M12 17v5" /><path d="M9 10.5 5 12l1.5-4L5 4l7 3 7-3-1.5 4L19 12l-4 1.5" /><path d="M9 10.5 14.5 16" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function formatDate(value) {
  if (!value) return "";
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function sameMessageDay(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatMessageDay(value) {
  if (!value) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameMessageDay(value, today)) return "Today";
  if (sameMessageDay(value, yesterday)) return "Yesterday";
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function memberMentionHandle(member) {
  const label = member?.username || member?.name || member?.fullName || member?.email || "member";
  return String(label).split(/\s+/)[0].replace(/^@+/, "");
}

function getUserColor(userId) {
  if (!userId) return "#0f766e";
  const colors = [
    "#e11d48", "#f97316", "#eab308", "#22c55e", "#14b8a6",
    "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#06b6d4",
    "#84cc16", "#a855f7", "#6366f1", "#0ea5e9", "#10b981"
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

function getMentionContext(text, cursorPos) {
  const before = text.slice(0, cursorPos);
  const match = before.match(/(^|\s)@([a-zA-Z0-9._-]*)$/);
  if (!match) return null;
  return {
    query: match[2] || "",
    start: before.length - match[2].length - 1,
  };
}

function getPaymentCommandContext(text) {
  const match = String(text || "").match(/^\s*pay(?:\s+([0-9][0-9,.\s]*))?(?:\s+for\s*(.*))?$/i);
  if (!match) return null;
  return {
    amountText: (match[1] || "").replace(/\s+/g, ""),
    query: (match[2] || "").trim().toLowerCase(),
    hasFor: /\bfor\s*$/i.test(text) || /\bfor\s+\S/i.test(text),
  };
}

function collectionTypeAccent(type = "") {
  const key = String(type).toLowerCase();
  if (key === "event") return { bg: "#f5f0ff", text: "#7c3aed", accent: "#7c3aed" };
  if (key === "order") return { bg: "#eff6ff", text: "#2563eb", accent: "#2563eb" };
  return { bg: "#ecfdf5", text: "#16a34a", accent: "#16a34a" };
}

function statusClass(status) {
  if (status === "paid") return "paid";
  if (status === "rejected" || status === "failed") return "rejected";
  if (status === "registered") return "registered";
  return "pending";
}

function groupPaymentVerifyUrl(groupId, collectionId, paymentId) {
  return `https://kampasika.org/g/${groupId}/verify/${collectionId}/${paymentId}`;
}

function inferResourceType(value = "") {
  const clean = value.toLowerCase().split("?")[0];
  if (clean.includes("drive.google.com/drive/folders")) return "Drive folder";
  if (clean.includes("docs.google.com/presentation") || clean.endsWith(".ppt") || clean.endsWith(".pptx")) return "PPT";
  if (clean.includes("docs.google.com/document") || clean.endsWith(".doc") || clean.endsWith(".docx")) return "DOC";
  if (clean.includes("docs.google.com/spreadsheets") || clean.endsWith(".xls") || clean.endsWith(".xlsx")) return "Sheet";
  if (clean.endsWith(".pdf")) return "PDF";
  if (/\.(png|jpe?g|webp|gif)$/i.test(clean)) return "Image";
  if (clean.includes("drive.google.com")) return "Drive file";
  if (clean.includes("youtube.com") || clean.includes("youtu.be")) return "Video";
  return "";
}

function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function resourcePreviewKind(resource = {}) {
  const type = String(resource.resourceType || "").toLowerCase();
  const source = [
    resource.fileName,
    resource.name,
    resource.title,
    resource.text,
    resource.url,
  ].filter(Boolean).join(" ").toLowerCase();
  if (type.includes("image") || /\.(png|jpe?g|webp|gif|bmp|svg)(\s|$|\?)/i.test(source)) return "image";
  if (type.includes("pdf") || /\.pdf(\s|$|\?)/i.test(source)) return "pdf";
  if (/(ppt|doc)/i.test(type) || /\.(pptx?|docx?)(\s|$|\?)/i.test(source)) return "convertible";
  if (/(sheet|xls)/i.test(type) || /\.(xlsx?)(\s|$|\?)/i.test(source)) return "office";
  if (/\.(txt|csv)(\s|$|\?)/i.test(source)) return "text";
  return "generic";
}

function resourceBadgeInfo(resource = {}) {
  const kind = resourcePreviewKind(resource);
  const source = [resource.fileName, resource.name, resource.title, resource.url].filter(Boolean).join(" ").toLowerCase();
  if (kind === "image") return { label: "IMG", bg: "#0d9488", isImage: true };
  if (kind === "pdf") return { label: "PDF", bg: "#e11d48", icon: "file" };
  if (kind === "convertible") {
    if (/\.pptx?(\s|$|\?)/i.test(source)) return { label: "PPT", bg: "#ea580c", icon: "file" };
    return { label: "DOC", bg: "#2563eb", icon: "file" };
  }
  if (kind === "office") return { label: "XLS", bg: "#16a34a", icon: "file" };
  if (kind === "text") {
    if (/\.csv(\s|$|\?)/i.test(source)) return { label: "CSV", bg: "#0891b2", icon: "file" };
    return { label: "TXT", bg: "#64748b", icon: "file" };
  }
  if (resource.url && !resource.fileName) return { label: "LINK", bg: "#7c3aed", icon: "link", isLink: true };
  return { label: "FILE", bg: "#64748b", icon: "file" };
}

function eventPosterStatus(item = {}) {
  if (item.photoUrl) return null;
  if (item.photoUploadStatus === "failed") return { text: "Poster upload failed. The event is still active.", kind: "error" };
  if (item.photoUploadStatus !== "pending") return null;
  const startedAt = item.photoUploadStartedAt?.toDate?.() || item.createdAt || null;
  const startedMs = startedAt?.getTime?.() || 0;
  if (startedMs && Date.now() - startedMs > 3 * 60 * 1000) {
    return { text: "Poster did not attach. The event is still active.", kind: "error" };
  }
  return { text: "Poster is still attaching...", kind: "" };
}

function savedFileSection(resource = {}) {
  const value = `${resource.resourceType || ""} ${resource.fileName || ""} ${resource.title || ""} ${resource.url || ""}`.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|heic|avif)(\?|$)/.test(value) || value.includes("image")) return "Images";
  if (/\.(pdf)(\?|$)/.test(value) || value.includes("pdf")) return "PDFs";
  if (/\.(pptx?|docx?|xlsx?)(\?|$)/.test(value) || value.includes("document") || value.includes("slide") || value.includes("office")) return "Documents";
  if (/\.(mp4|webm|mov|m4v)(\?|$)/.test(value) || value.includes("video")) return "Videos";
  if (/\.(mp3|wav|m4a|ogg)(\?|$)/.test(value) || value.includes("audio")) return "Audio";
  return "Other files";
}

function isDriveFolderUrl(url = "") {
  return /drive\.google\.com\/drive\/folders\//i.test(url);
}

function isLikelyHtmlResponse(response) {
  return (response.headers.get("content-type") || "").toLowerCase().includes("text/html");
}

function storagePathFromDownloadUrl(url = "") {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/o\/([^/?]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : "";
  } catch (_) {
    return "";
  }
}

function isAllowedResourceFile(file) {
  if (!file) return false;
  if (file.type && ALLOWED_RESOURCE_MIME_TYPES.has(file.type)) return true;
  return ALLOWED_RESOURCE_FILE_EXTENSIONS.test(file.name || "");
}

export function GroupDetailPage({
  db,
  storage,
  group,
  user,
  userName,
  userAvatar,
  onBack,
  onJoinGroup,
  joiningGroup,
  onShareGroup,
  onLeaveGroup,
  onDeleteGroup,
  onMarkRead,
  onError,
  onSuccess,
  onBackHandlerChange,
  onGroupUpdated,
  onOpenScanner,
  onMessageMember,
  isDarkMode = false,
  initialTab = "overview",
  initialCollectionId = "",
  initialCollection = null,
  initialSource = "",
  groupHasUnread = false,
  groupReadAtValue = 0,
}) {
  const [activeTab, setActiveTab] = useState(initialTab || "overview");
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuActivitySeen, setMenuActivitySeen] = useState(false);
  const [pinDotSeen, setPinDotSeen] = useState(false);
  const [members, setMembers] = useState([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [queuedMessages, setQueuedMessages] = useState([]);
  const [pendingSendMessages, setPendingSendMessages] = useState([]);
  const [resources, setResources] = useState([]);
  const [workGroups, setWorkGroups] = useState([]);
  const [collections, setCollections] = useState(initialCollection ? [initialCollection] : []);
  const [selectedCollectionId, setSelectedCollectionId] = useState(initialCollectionId || "");
  const [payments, setPayments] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [chatPaymentTargetId, setChatPaymentTargetId] = useState("");
  const [chatAttachments, setChatAttachments] = useState([]);
  const [showChatComposer, setShowChatComposer] = useState(false);
  const [showChatTools, setShowChatTools] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [activeMessageActions, setActiveMessageActions] = useState(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [posting, setPosting] = useState(false);
  const [showTrackerForm, setShowTrackerForm] = useState(false);
  const [showResourceAddMenu, setShowResourceAddMenu] = useState(false);
  const [showSimpleResourceForm, setShowSimpleResourceForm] = useState(false);
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState("");
  const [selectedResourceSubject, setSelectedResourceSubject] = useState("");
  const [resourceFolderSearchQ, setResourceFolderSearchQ] = useState("");
  const [resourceSortMode, setResourceSortMode] = useState("latest");
  const [showWorkGroupForm, setShowWorkGroupForm] = useState(false);
  const [showTrackerMore, setShowTrackerMore] = useState(false);
  const [showWorkGroupMembers, setShowWorkGroupMembers] = useState(false);
  const [showWorkGroupMore, setShowWorkGroupMore] = useState(false);
  const [editingWorkGroupId, setEditingWorkGroupId] = useState("");
  const [submittingWorkGroupId, setSubmittingWorkGroupId] = useState("");
  const [trackerData, setTrackerData] = useState(emptyTracker);
  const [editingTrackerId, setEditingTrackerId] = useState("");
  const [resourceData, setResourceData] = useState(emptyResource);
  const [simpleResourceData, setSimpleResourceData] = useState(emptySimpleResource);
  const [workGroupData, setWorkGroupData] = useState(emptyWorkGroup);
  const [workSubmissionData, setWorkSubmissionData] = useState(emptyWorkSubmission);
  const [paymentData, setPaymentData] = useState(emptyPayment);
  const [manualPaymentData, setManualPaymentData] = useState(emptyManualPayment);
  const [showManualPaymentForm, setShowManualPaymentForm] = useState(false);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [expandedPaymentIds, setExpandedPaymentIds] = useState({});
  const [memberActionMenuId, setMemberActionMenuId] = useState("");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showAzamPayOptions, setShowAzamPayOptions] = useState(false);
  const [showPawaPayOptions, setShowPawaPayOptions] = useState(false);
  const [showManualProofFields, setShowManualProofFields] = useState(false);
  const [expandedProofUrl, setExpandedProofUrl] = useState("");
  const [convertingResourceId, setConvertingResourceId] = useState("");
  const [groupUploadStatus, setGroupUploadStatus] = useState("");
  const [pendingEventPhotoPreviews, setPendingEventPhotoPreviews] = useState({});
  const [mentionPermission, setMentionPermission] = useState(group.mentionPermission || "admins");
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [chatAttachmentUploadIds, setChatAttachmentUploadIds] = useState([]);
  const chatUploadTasksRef = useRef({});
  const cancelledUploadIdsRef = useRef(new Set());
  const [showEditGroup, setShowEditGroup] = useState(false);
  const [editGroupData, setEditGroupData] = useState({ name: group.name || "", desc: group.desc || "", avatarFile: null, avatarPreview: group.avatarUrl || "" });
  const [showGroupAbout, setShowGroupAbout] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showGroupQr, setShowGroupQr] = useState(false);
  const [notificationPrefsDraft, setNotificationPrefsDraft] = useState(DEFAULT_GROUP_NOTIFICATION_PREFS);
  const [savedOfflineResources, setSavedOfflineResources] = useState({});
  // eslint-disable-next-line no-unused-vars
  const [savingOfflineResourceId, setSavingOfflineResourceId] = useState("");
  // eslint-disable-next-line no-unused-vars
  const [resourcePreview, setResourcePreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const screenCacheRef = useRef({});
  const groupNavDepth = useRef(0);
  const chatBottomRef = useRef(null);
  const messageListRef = useRef(null);
  const chatPhotoInputRef = useRef(null);
  const chatFileInputRef = useRef(null);
  const chatToolsMenuRef = useRef(null);
  const chatPlusButtonRef = useRef(null);
  const messageHoldTimer = useRef(null);
  const touchStartPos = useRef({ x: 0, y: 0 });
  const [openedReadAt, setOpenedReadAt] = useState(groupReadAtValue || 0);
  const syncingQueuedMessagesRef = useRef(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const profile = useMemo(() => ({ name: userName, avatarUrl: userAvatar }), [userName, userAvatar]);
  const currentMember = useMemo(() => members.find(member => member.uid === user?.uid && member.status === "active") || null, [members, user]);
  const membersByUid = useMemo(() => new Map(members.map(member => [member.uid, member])), [members]);
  const pendingCurrentMember = useMemo(() => members.find(member => member.uid === user?.uid && member.status === "pending") || null, [members, user]);
  const memberCanManage = canManageGroup(currentMember) || group.adminUid === user?.uid || group.ownerUid === user?.uid;
  const memberCanEditGroup = ["owner", "admin"].includes(currentMember?.role) || group.adminUid === user?.uid || group.ownerUid === user?.uid;
  const memberCanVerify = canVerifyPayments(currentMember) || group.adminUid === user?.uid || group.ownerUid === user?.uid;
  const memberCanSeePhone = memberCanEditGroup || memberCanManage;
  const memberCanChat = isGroupMember(currentMember) || memberCanManage;
  const canViewGroupContent = isGroupMember(currentMember) || memberCanManage;
  const groupInviteUrl = group.inviteLink?.startsWith("http")
    ? group.inviteLink
    : `${window.location.origin}/g/${group.inviteCode || group.id}`;
  const canSeeCollection = item => item?.status !== "archived" || memberCanManage || item.createdByUid === user?.uid;
  const collectionDisplayTitle = item => {
    if (!item) return "";
    const roundNumber = Number(item.roundNumber || 0);
    const baseTitle = item.roundBaseTitle || item.roundStartedFromTitle || item.title || "";
    if (roundNumber > 1) return item.title || `${baseTitle} ${roundNumber}`;
    if (item.status === "archived" && roundNumber === 1) return `${baseTitle || item.title} 1`;
    return item.title || baseTitle;
  };
  const visibleCollections = collections.filter(canSeeCollection);
  const selectedCollection = visibleCollections.find(item => item.id === selectedCollectionId) || null;
  const eventCollections = visibleCollections.filter(item => ["event", "order"].includes(item.collectionType || ""));
  const visibleEventCollections = ["event", "order"].includes(selectedCollection?.collectionType || "")
    ? eventCollections.filter(item => item.id !== selectedCollection.id)
    : eventCollections;
  const paymentCollections = visibleCollections.filter(item => (item.collectionType || "") !== "event" || Number(item.amount || 0) > 0);
  const chatPaymentCommand = useMemo(() => getPaymentCommandContext(messageText), [messageText]);
  const selectedChatPaymentTarget = chatPaymentTargetId
    ? paymentCollections.find(item => item.id === chatPaymentTargetId) || null
    : null;
  const chatPaymentTargets = useMemo(() => {
    if (!chatPaymentCommand?.hasFor) return [];
    const query = chatPaymentCommand.query;
    return paymentCollections
      .filter(item => Number(item.amount || 0) > 0)
      .filter(item => {
        if (!query) return true;
        return [
          item.title,
          item.description,
          item.collectionType,
          ...(Array.isArray(item.paymentMethods) ? item.paymentMethods : []),
        ].filter(Boolean).some(value => String(value).toLowerCase().includes(query));
      })
      .slice(0, 8);
  }, [chatPaymentCommand, paymentCollections]);
  const chatPaymentMode = Boolean(chatPaymentCommand || selectedChatPaymentTarget);
  const selectedNeedsPayment = Number(selectedCollection?.amount || 0) > 0;
  const selectedPaidEvent = selectedCollection?.collectionType === "event" && selectedNeedsPayment;
  const selectedGroupOrder = selectedCollection?.collectionType === "order";
  const selectedOrderOptions = (selectedCollection?.options || "").split(",").map(item => item.trim()).filter(Boolean);
  const canViewPublicSelectedEvent = false;
  const myPayment = payments.find(payment => payment.uid === user?.uid || payment.id === user?.uid) || null;
  const myPaymentRemaining = Math.max(0, Number(selectedCollection?.amount || 0) - Number(myPayment?.amountPaid || 0));
  const myPaymentWaitingForProvider = selectedNeedsPayment
    && myPayment?.paymentProvider === "PawaPay"
    && myPayment?.status !== "paid"
    && Boolean(myPayment?.pawaPayDepositId || myPayment?.paymentRef);
  const myPaymentHasSubmittedProofOrPayment = Boolean(
    myPayment?.paymentProofUrl
    || myPayment?.paymentRef
    || myPayment?.pawaPayDepositId
    || Number(myPayment?.amountPaid || 0) > 0
    || (myPayment?.status && myPayment.status !== "registered")
  );
  const myPaymentStatusLabel = myPayment?.status === "paid"
    ? "Paid"
    : myPayment?.status === "registered"
      ? "Registered"
      : myPayment && selectedNeedsPayment && myPaymentRemaining > 0
        ? "Payment submitted"
      : myPayment
        ? "Payment submitted"
        : "";
  const myPaymentPrimaryMessage = selectedGroupOrder
    ? "Your order is on record."
    : myPaymentWaitingForProvider
      ? "Waiting for payment confirmation."
      : selectedNeedsPayment && myPaymentRemaining > 0 && !myPaymentHasSubmittedProofOrPayment
        ? "You are already registered, waiting for your payment."
        : selectedNeedsPayment && myPayment?.status === "paid"
          ? "Your payment is on record."
          : selectedNeedsPayment && myPayment
            ? "Payment proof submitted. Waiting for admin confirmation."
            : myPayment
              ? "You are registered."
              : "";
  const myPaymentSecondaryMessage = myPaymentWaitingForProvider
    ? "Payment request sent. This updates automatically when the provider confirms."
    : myPayment?.amountPaid
      ? `${Number(myPayment.amountPaid).toLocaleString()} TSh`
      : selectedGroupOrder
        ? "Payment proof not submitted yet"
        : selectedNeedsPayment && myPaymentHasSubmittedProofOrPayment
          ? "Waiting for admin review"
          : selectedNeedsPayment
            ? "Amount not recorded"
            : "Registered";
  const memberDisplayName = member => member?.username || member?.name || "Member";
  const togglePaymentDetails = paymentId => {
    setExpandedPaymentIds(prev => ({ ...prev, [paymentId]: !prev[paymentId] }));
  };
  const filteredPayments = memberCanVerify
    ? payments.filter(payment => {
        const term = paymentSearch.trim().toLowerCase();
        if (!term) return true;
        return [
          payment.studentName,
          payment.phone,
          payment.payerName,
          payment.paymentRef,
          payment.status,
        ].some(value => String(value || "").toLowerCase().includes(term));
      })
    : payments;
  const pendingMembers = useMemo(() => members.filter(member => member.status === "pending"), [members]);
  const activeMembers = useMemo(() => members.filter(member => !["pending", "rejected", "removed", "left", "blocked"].includes(member.status)), [members]);
  const memberNameByUid = useMemo(() => activeMembers.reduce((acc, member) => {
    acc[member.uid] = member.name || "Member";
    return acc;
  }, {}), [activeMembers]);
  const summary = memberCanVerify ? paymentSummary(selectedCollection, payments) : paymentSummary(selectedCollection, myPayment ? [myPayment] : []);
  const currentAction = group.currentAction || null;
  const chatMessages = useMemo(() => [...messages, ...queuedMessages, ...pendingSendMessages].sort((a, b) => (
    (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0)
  )), [messages, queuedMessages, pendingSendMessages]);
  const unreadChatMessages = useMemo(() => chatMessages.filter(message => (
    message.authorUid !== user?.uid
    && message.createdAt?.getTime
    && message.createdAt.getTime() > openedReadAt
  )), [chatMessages, user?.uid, openedReadAt]);
  const firstUnreadMessageId = unreadChatMessages[0]?.id || "";
  const noteSnapshotMeta = useCallback(() => {}, []);
  const rememberGroupScreen = useCallback((patch = {}) => {
    if (!group?.id) return;
    const previous = screenCacheRef.current || {};
    const next = {
      ...previous,
      ...patch,
      paymentsByCollection: {
        ...(previous.paymentsByCollection || {}),
        ...(patch.paymentsByCollection || {}),
      },
      savedAt: Date.now(),
    };
    screenCacheRef.current = next;
    writeGroupScreenCache(group.id, next);
  }, [group?.id]);
  const sortedResources = useMemo(() => [...resources].sort((a, b) => (
    (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0)
  )), [resources]);
  const visibleSortedResources = useMemo(() => sortedResources.filter(resource => resource.resourceType !== "Folder"), [sortedResources]);
  const groupedResources = useMemo(() => sortedResources.reduce((acc, resource) => {
    const key = (resource.subject || "General").trim() || "General";
    if (!acc[key]) acc[key] = [];
    acc[key].push(resource);
    return acc;
  }, {}), [sortedResources]);
  const resourceSubjectEntries = useMemo(() => Object.entries(groupedResources).sort(([a], [b]) => a.localeCompare(b)), [groupedResources]);
  const selectedResourceItems = useMemo(() => {
    let items = selectedResourceSubject ? (groupedResources[selectedResourceSubject] || []).filter(resource => resource.resourceType !== "Folder") : [];
    const q = resourceFolderSearchQ.trim().toLowerCase();
    if (q) {
      items = items.filter(resource => [resource.title, resource.text, resource.fileName, resource.resourceType].filter(Boolean).some(value => String(value).toLowerCase().includes(q)));
    }
    if (resourceSortMode === "alpha") {
      return items.sort((a, b) => String(a.title || a.text || "").localeCompare(String(b.title || b.text || "")));
    }
    return items.sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
  }, [groupedResources, resourceSortMode, selectedResourceSubject, resourceFolderSearchQ]);
  const savedOfflineResourceList = useMemo(() => Object.entries(savedOfflineResources)
    .map(([id, saved]) => {
      const liveResource = resources.find(resource => resource.id === id) || {};
      const merged = { ...saved, ...liveResource, id, savedAt: saved.savedAt || liveResource.savedAt || 0 };
      return { ...merged, section: savedFileSection(merged) };
    })
    .sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0)), [resources, savedOfflineResources]);
  const savedOfflineResourceGroups = useMemo(() => savedOfflineResourceList.reduce((acc, resource) => {
    const key = resource.section || "Other files";
    if (!acc[key]) acc[key] = [];
    acc[key].push(resource);
    return acc;
  }, {}), [savedOfflineResourceList]);
  const latestMessage = chatMessages[chatMessages.length - 1] || null;
  const activePaymentItem = collections.find(item => item.id === currentAction?.targetId)
    || paymentCollections.find(item => (item.collectionType || "") !== "event")
    || null;
  const upcomingActivity = eventCollections[0] || null;
  const latestResource = visibleSortedResources[0] || null;
  const groupScreenSavedAt = screenCacheRef.current?.savedAt || 0;
  const showSubGroups = group.type === "class" && ENABLE_SUBGROUPS;
  const groupMenuItems = [
    ["overview", "Overview"],
    ["chats", "Chat"],
    ["payments", "Payments"],
    ["events", "Activities"],
    ...(ENABLE_GROUP_FILES ? [["resources", "Files"]] : []),
    ["members", "Members"],
    ...(showSubGroups ? [["workgroups", "Sub-groups"]] : []),
  ];
  const showMenuActivityDot = groupHasUnread && !menuActivitySeen;
  const channelLabels = {
    overview: "Overview",
    chats: "Chat",
    payments: "Payments",
    events: "Activities",
    resources: "Files",
    members: "Members",
    workgroups: "Sub-groups",
  };
  const primaryGroupTabs = [
    ["overview", "Overview"],
    ["chats", "Chat"],
    ["payments", "Payments"],
    ["events", "Activities"],
    ...(ENABLE_GROUP_FILES ? [["resources", "Files"]] : []),
    ["members", "Members"],
  ];
  const guardOfflineAction = (label = "This action") => {
    if (!isOffline) return false;
    onError(new Error(`${label} is disabled while offline. You can read the saved group view until you are back online.`));
    return true;
  };

  useEffect(() => {
    setSavedOfflineResources(readOfflineResourceStore(group.id));
  }, [group.id]);

  useEffect(() => {
    setQueuedMessages(queuedMessagesForGroup(group.id, user?.uid));
  }, [group.id, user?.uid]);

  useEffect(() => {
    if (isOffline || !user || !group?.id || queuedMessages.length === 0 || syncingQueuedMessagesRef.current) return;
    const syncQueuedMessages = async () => {
      syncingQueuedMessagesRef.current = true;
      const pending = queuedMessages.filter(item => item.groupId === group.id && item.authorUid === user.uid);
      for (const item of pending) {
        try {
          await sendGroupMessage(db, {
            groupId: group.id,
            channelId: "chats",
            text: item.text,
            user,
            profile,
            kind: "message",
            pinned: false,
            group,
            members,
            replyTo: item.replyTo || null,
            attachments: [],
          });
          removeQueuedGroupMessage(item.id);
          setQueuedMessages(queuedMessagesForGroup(group.id, user.uid));
          onMarkRead?.({ ...group, activityAt: { toMillis: () => Date.now() } });
        } catch (_) {
          break;
        }
      }
      syncingQueuedMessagesRef.current = false;
      setQueuedMessages(queuedMessagesForGroup(group.id, user.uid));
    };
    syncQueuedMessages();
  }, [db, group, isOffline, members, onMarkRead, profile, queuedMessages, user]);

  useEffect(() => {
    setMenuActivitySeen(false);
  }, [group.id, groupHasUnread]);

  useEffect(() => {
    setPinDotSeen(false);
  }, [group.id, currentAction?.targetId]);

  useEffect(() => {
    if (!showSubGroups && activeTab === "workgroups") setActiveTab("overview");
  }, [activeTab, showSubGroups]);

  const pushGroupHistory = () => {
    try {
      window.history.pushState({ page: "groupDetail", groupSubView: true }, "", "/");
      groupNavDepth.current += 1;
    } catch (_) {}
  };

  const switchGroupTab = (tabId) => {
    if (tabId !== activeTab) pushGroupHistory();
    setActiveTab(tabId);
    setMenuOpen(false);
    setResourcePreview(null);
    if (tabId !== "resources") setSelectedResourceSubject("");
    setSelectedCollectionId("");
    setShowPaymentForm(false);
    setShowTrackerForm(false);
    setShowWorkGroupForm(false);
    setPaymentSearch("");
  };

  const openTracker = (collectionId) => {
    if (collectionId !== selectedCollectionId) pushGroupHistory();
    setSelectedCollectionId(collectionId);
    setShowPaymentForm(false);
    setShowPawaPayOptions(false);
    setShowManualProofFields(false);
    setPaymentSearch("");
  };

  const openResourceSubject = (subject) => {
    if (!subject) return;
    if (subject !== selectedResourceSubject) pushGroupHistory();
    setSelectedResourceSubject(subject);
    setResourceFolderSearchQ("");
  };

  const goBackWithinGroup = useCallback(() => {
    setMenuOpen(false);

    if (resourcePreview) {
      setResourcePreview(null);
      return true;
    }
    if (expandedProofUrl) {
      setExpandedProofUrl("");
      return true;
    }
    if (showPaymentForm) {
      setShowPaymentForm(false);
      setShowPawaPayOptions(false);
      setShowManualProofFields(false);
      return true;
    }
    if (showManualPaymentForm) {
      setShowManualPaymentForm(false);
      return true;
    }
    if (showTrackerForm) {
      setShowTrackerForm(false);
      setEditingTrackerId("");
      return true;
    }
    if (showResourceAddMenu) {
      setShowResourceAddMenu(false);
      return true;
    }
    if (showSimpleResourceForm) {
      setShowSimpleResourceForm(false);
      return true;
    }
    if (showResourceForm) {
      setShowResourceForm(false);
      setEditingResourceId("");
      return true;
    }
    if (showWorkGroupForm) {
      setShowWorkGroupForm(false);
      setEditingWorkGroupId("");
      return true;
    }
    if (submittingWorkGroupId) {
      setSubmittingWorkGroupId("");
      return true;
    }
    if (activeMessageActions) {
      setActiveMessageActions(null);
      return true;
    }
    if (showChatComposer || showChatTools || replyToMessage) {
      setShowChatComposer(false);
      setShowChatTools(false);
      setReplyToMessage(null);
      setChatAttachments([]);
      return true;
    }
    if (initialSource === "publicEvents" && activeTab === "events") {
      return false;
    }
    if (selectedCollectionId && initialSource === "profileCollections") {
      return false;
    }
    if (selectedCollectionId) {
      setSelectedCollectionId("");
      setPayments([]);
      setPaymentSearch("");
      return true;
    }
    if (selectedResourceSubject) {
      setSelectedResourceSubject("");
      return true;
    }
    if (activeTab !== "overview") {
      setActiveTab("overview");
      setPaymentSearch("");
      return true;
    }

    return false;
  }, [activeMessageActions, activeTab, expandedProofUrl, initialSource, replyToMessage, resourcePreview, selectedCollectionId, selectedResourceSubject, showChatComposer, showChatTools, showManualPaymentForm, showPaymentForm, showResourceAddMenu, showResourceForm, showSimpleResourceForm, showTrackerForm, showWorkGroupForm, submittingWorkGroupId]);

  useEffect(() => {
    if (!showChatTools) return undefined;
    const handleOutsideChatTools = (event) => {
      const target = event.target;
      if (chatToolsMenuRef.current?.contains(target) || chatPlusButtonRef.current?.contains(target)) return;
      setShowChatTools(false);
    };
    document.addEventListener("pointerdown", handleOutsideChatTools);
    return () => document.removeEventListener("pointerdown", handleOutsideChatTools);
  }, [showChatTools]);

  useEffect(() => {
    if (!group?.id) return undefined;
    setActiveTab(initialTab || "overview");
    setMenuOpen(false);
    setCollections(initialCollection ? [initialCollection] : []);
    setSelectedCollectionId(initialCollectionId || "");
    setPayments([]);
    setPaymentSearch("");
    setShowPaymentForm(false);
    setShowPawaPayOptions(false);
    setShowManualProofFields(false);
    setShowManualPaymentForm(false);
    setShowTrackerForm(false);
    setEditingTrackerId("");
    setShowWorkGroupForm(false);
    setShowResourceAddMenu(false);
    setShowSimpleResourceForm(false);
    setShowResourceForm(false);
    setSelectedResourceSubject("");
    setResourcePreview(null);
    setEditingResourceId("");
    setEditingWorkGroupId("");
    setSubmittingWorkGroupId("");
    setShowChatComposer(false);
    setShowChatTools(false);
    setReplyToMessage(null);
    setActiveMessageActions(null);
    setExpandedProofUrl("");
    setShowGroupQr(false);
  }, [group?.id, user?.uid, initialTab, initialCollectionId, initialCollection]);

  useEffect(() => {
    if (!group?.id) return;
    const cached = readGroupScreenCache(group.id);
    screenCacheRef.current = cached;
    if (!cached.savedAt) {
      return;
    }
    setMembers(cached.members || []);
    setMessages(cached.messages || []);
    setResources(cached.resources || []);
    setWorkGroups(cached.workGroups || []);
    setCollections(cached.collections?.length ? cached.collections : (initialCollection ? [initialCollection] : []));
    if (initialCollectionId && cached.paymentsByCollection?.[initialCollectionId]) {
      setPayments(cached.paymentsByCollection[initialCollectionId]);
    }
    setMembersLoaded(true);
  }, [group?.id, initialCollection, initialCollectionId]);

  useEffect(() => {
    if (!group?.id) return undefined;
    if (!user?.uid) {
      setMembers([]);
      setMembersLoaded(true);
      return undefined;
    }
    setMembersLoaded(false);
    const unsubMembers = subscribeGroupMembers(db, group.id, (items, meta) => {
      setMembers(items);
      rememberGroupScreen({ members: items });
      noteSnapshotMeta(meta);
      setMembersLoaded(true);
    }, err => {
      setMembersLoaded(true);
      onError(err);
    });
    return () => {
      unsubMembers();
    };
  }, [db, group?.id, noteSnapshotMeta, onError, rememberGroupScreen, user?.uid]);

  useEffect(() => {
    const canPreviewPublicGroup = false;
    const canReadCollections = canViewGroupContent || canPreviewPublicGroup || !!initialCollectionId;
    if (!group?.id || !canReadCollections) {
      setMessages([]);
      setResources([]);
      setWorkGroups([]);
      setCollections(initialCollection ? [initialCollection] : []);
      setSelectedCollectionId(initialCollectionId || "");
      return undefined;
    }
    const unsubMessages = canViewGroupContent ? subscribeChannelMessages(db, group.id, "chats", (items, meta) => {
      setMessages(items);
      rememberGroupScreen({ messages: items.slice(0, 100) });
      noteSnapshotMeta(meta);
    }, onError) : null;
    const unsubResources = (canViewGroupContent || canPreviewPublicGroup) ? subscribeChannelMessages(db, group.id, "resources", (items, meta) => {
      setResources(items);
      rememberGroupScreen({ resources: items.slice(0, 250) });
      noteSnapshotMeta(meta);
    }, onError) : null;
    const unsubWorkGroups = (canViewGroupContent || canPreviewPublicGroup) ? subscribeGroupWorkGroups(db, group.id, (items, meta) => {
      setWorkGroups(items);
      rememberGroupScreen({ workGroups: items.slice(0, 100) });
      noteSnapshotMeta(meta);
    }, onError) : null;
    const subscribeCollections = (canViewGroupContent || canPreviewPublicGroup)
      ? (next) => subscribeGroupCollections(db, group.id, next, onError)
      : (next) => subscribeGroupCollection(db, group.id, initialCollectionId, next, onError);
    const unsubCollections = subscribeCollections((items, meta) => {
      const nextItems = items.length ? items : initialCollection ? [initialCollection] : [];
      setCollections(nextItems);
      rememberGroupScreen({ collections: nextItems.slice(0, 150) });
      noteSnapshotMeta(meta);
      setPendingEventPhotoPreviews(prev => {
        const next = { ...prev };
        nextItems.forEach(item => {
          if (item.photoUrl && next[item.id]) delete next[item.id];
        });
        return next;
      });
      setSelectedCollectionId(prev => (prev && nextItems.some(item => item.id === prev)) ? prev : (initialCollectionId || ""));
    });
    return () => {
      unsubMessages?.();
      unsubResources?.();
      unsubWorkGroups?.();
      unsubCollections();
    };
  }, [canViewGroupContent, db, group?.id, group.visibility, group.joinPolicy, initialCollection, initialCollectionId, noteSnapshotMeta, onError, rememberGroupScreen]);

  useEffect(() => {
    if (!group?.id || !selectedCollection?.id) {
      setPayments([]);
      return undefined;
    }
    if (memberCanVerify) {
      return subscribeCollectionPayments(db, group.id, selectedCollection.id, (items, meta) => {
        setPayments(items);
        rememberGroupScreen({ paymentsByCollection: { [selectedCollection.id]: items.slice(0, 250) } });
        noteSnapshotMeta(meta);
      }, onError);
    }
    if (user?.uid) {
      return subscribeMyCollectionPayment(db, group.id, selectedCollection.id, user.uid, (items, meta) => {
        setPayments(items);
        rememberGroupScreen({ paymentsByCollection: { [selectedCollection.id]: items.slice(0, 20) } });
        noteSnapshotMeta(meta);
      }, onError);
    }
    setPayments([]);
    return undefined;
  }, [db, group?.id, selectedCollection?.id, memberCanVerify, user?.uid, noteSnapshotMeta, onError, rememberGroupScreen]);

  useEffect(() => {
    if (!selectedCollection?.id) return;
    const cachedPayments = screenCacheRef.current?.paymentsByCollection?.[selectedCollection.id];
    if (cachedPayments?.length) setPayments(cachedPayments);
  }, [selectedCollection?.id]);

  useEffect(() => {
    if (activeTab !== "chats") return;
    const el = messageListRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      setShowJumpToLatest(false);
    });
  }, [activeTab, chatMessages.length, showChatComposer, replyToMessage, showChatTools]);

  useEffect(() => {
    if (activeTab !== "chats" || unreadChatMessages.length === 0) return;
    const timer = setTimeout(() => setOpenedReadAt(Date.now()), 1500);
    return () => clearTimeout(timer);
  }, [activeTab, unreadChatMessages.length]);

  const scrollChatToLatest = () => {
    const el = messageListRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
    setShowJumpToLatest(false);
  };

  const handleChatScroll = () => {
    const el = messageListRef.current;
    if (!el) return;
    setShowJumpToLatest(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  };

  const startMessageHold = (message, event) => {
    clearTimeout(messageHoldTimer.current);
    // Record touch start position so we can cancel if user scrolls
    if (event?.touches?.[0]) {
      touchStartPos.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    } else {
      touchStartPos.current = { x: 0, y: 0 };
    }
    messageHoldTimer.current = setTimeout(() => setActiveMessageActions(message), 480);
  };

  const cancelMessageHoldIfMoved = (event) => {
    if (!event?.touches?.[0]) return;
    const dx = Math.abs(event.touches[0].clientX - touchStartPos.current.x);
    const dy = Math.abs(event.touches[0].clientY - touchStartPos.current.y);
    // If finger moved more than 8px in any direction it's a scroll — cancel hold
    if (dx > 8 || dy > 8) clearTimeout(messageHoldTimer.current);
  };

  const clearMessageHold = () => clearTimeout(messageHoldTimer.current);

  useEffect(() => {
    setPaymentData(prev => ({ ...prev, studentName: prev.studentName || userName || "" }));
  }, [userName]);

  useEffect(() => {
    setShowAzamPayOptions(false);
  }, [selectedCollectionId]);

  useEffect(() => {
    if (!myPayment) return;
    setPaymentData(prev => ({
      ...prev,
      studentName: prev.studentName || myPayment.studentName || userName || "",
      phone: prev.phone || myPayment.phone || "",
      amountPaid: prev.amountPaid || String(myPayment.amountPaid || ""),
      selectedOption: prev.selectedOption || myPayment.selectedOption || "",
      paymentRef: prev.paymentRef || myPayment.paymentRef || "",
      payerName: prev.payerName || myPayment.payerName || "",
    }));
  }, [myPayment, userName]);

  useEffect(() => {
    setMentionPermission(group.mentionPermission || "admins");
  }, [group.mentionPermission]);

  useEffect(() => {
    if (chatPaymentCommand) {
      setShowMentionSuggestions(false);
      setMentionSuggestions([]);
      return;
    }
    const context = getMentionContext(messageText, messageText.length);
    if (context) {
      const query = context.query.toLowerCase();
      const filtered = activeMembers.filter(member => {
        const handle = memberMentionHandle(member).toLowerCase();
        const name = (member.name || "").toLowerCase();
        return !query || handle.includes(query) || name.includes(query);
      }).slice(0, 30);
      setMentionSuggestions(filtered);
      setShowMentionSuggestions(true);
    } else {
      setShowMentionSuggestions(false);
      setMentionSuggestions([]);
    }
  }, [messageText, activeMembers, chatPaymentCommand]);

  useEffect(() => {
    if (!chatPaymentCommand) setChatPaymentTargetId("");
  }, [chatPaymentCommand]);

  useEffect(() => {
    setNotificationPrefsDraft({
      ...DEFAULT_GROUP_NOTIFICATION_PREFS,
      ...(currentMember?.notificationPrefs || {}),
    });
  }, [currentMember?.uid, currentMember?.notificationPrefs]);

  useEffect(() => {
    setEditGroupData({ name: group.name || "", desc: group.desc || "", avatarFile: null, avatarPreview: group.avatarUrl || "" });
  }, [group.id, group.name, group.desc, group.avatarUrl]);

  useEffect(() => {
    onMarkRead?.(group);
  }, [group, onMarkRead]);

  useEffect(() => {
    const handleGroupPop = (event) => {
      if (!goBackWithinGroup()) return;

      event.stopImmediatePropagation();
      if (groupNavDepth.current > 0) groupNavDepth.current -= 1;
      try {
        window.history.pushState({ page: "groupDetail", groupSubView: groupNavDepth.current > 0 }, "", "/");
      } catch (_) {}
    };

    window.addEventListener("popstate", handleGroupPop, true);
    return () => window.removeEventListener("popstate", handleGroupPop, true);
  }, [goBackWithinGroup]);

  useEffect(() => {
    onBackHandlerChange?.(goBackWithinGroup);
    return () => onBackHandlerChange?.(null);
  }, [goBackWithinGroup, onBackHandlerChange]);

  const markCurrentGroupRead = () => {
    onMarkRead?.({ ...group, activityAt: { toMillis: () => Date.now() } });
  };

  const handlePost = async (kind = "message") => {
    if (isOffline && kind === "message" && messageText.trim() && chatAttachments.length === 0 && user && group?.id) {
      const queuedMessage = {
        id: `offline-${group.id}-${user.uid}-${Date.now()}`,
        groupId: group.id,
        channelId: "chats",
        text: messageText.trim(),
        authorName: profile.name || user.email || "Member",
        authorUid: user.uid,
        kind: "message",
        pinned: false,
        replyTo: replyToMessage ? {
          id: replyToMessage.id,
          authorName: replyToMessage.authorName || "Member",
          text: (replyToMessage.text || replyToMessage.attachments?.[0]?.name || "Attachment").slice(0, 140),
        } : null,
        attachments: [],
        reactions: {},
        createdAt: Date.now(),
      };
      saveQueuedGroupMessage(queuedMessage);
      setQueuedMessages(queuedMessagesForGroup(group.id, user.uid));
      setMessageText("");
      setShowChatComposer(false);
      setShowChatTools(false);
      setReplyToMessage(null);
      markCurrentGroupRead();
      onSuccess("Message saved. It will send when you are online.");
      return;
    }
    if (guardOfflineAction(kind === "announcement" ? "Pinning updates" : "Sending messages")) return;
    if ((!messageText.trim() && chatAttachments.length === 0) || !user || !group?.id) return;
    if (kind === "announcement" && !messageText.trim()) return;
    const hasMention = /(^|\s)@[a-zA-Z0-9._-]+/.test(messageText);
    if (hasMention && mentionPermission === "admins" && !memberCanManage) {
      onError(new Error("Only admins, owners, and treasurers can tag members in this group."));
      return;
    }

    if (kind === "message" && chatAttachments.length === 0 && messageText.trim()) {
      const text = messageText.trim();
      const tempId = `pending-${group.id}-${user.uid}-${Date.now()}`;
      const replySnapshot = replyToMessage ? {
        id: replyToMessage.id,
        authorName: replyToMessage.authorName || "Member",
        text: (replyToMessage.text || replyToMessage.attachments?.[0]?.name || "Attachment").slice(0, 140),
      } : null;
      const pendingReplyTo = replyToMessage;
      setPendingSendMessages(prev => [...prev, {
        id: tempId,
        groupId: group.id,
        channelId: "chats",
        text,
        authorName: profile.name || user.email || "Member",
        authorUid: user.uid,
        kind: "message",
        pinned: false,
        replyTo: replySnapshot,
        attachments: [],
        reactions: {},
        createdAt: new Date(),
        sending: true,
      }]);
      setMessageText("");
      setShowChatComposer(false);
      setShowChatTools(false);
      setReplyToMessage(null);
      try {
        await sendGroupMessage(db, {
          groupId: group.id,
          channelId: "chats",
          text,
          user,
          profile,
          kind: "message",
          pinned: false,
          group,
          members,
          replyTo: pendingReplyTo,
          attachments: [],
        });
        markCurrentGroupRead();
      } catch (err) {
        onError(err);
        setMessageText(text);
      } finally {
        setPendingSendMessages(prev => prev.filter(m => m.id !== tempId));
      }
      return;
    }

    setPosting(true);
    try {
      if (chatAttachments.length > 0 && !storage) {
        throw new Error("File upload is not ready. Try again in a moment.");
      }
      const attachments = [];
      setUploadProgress(prev => {
        const next = { ...prev };
        chatAttachmentUploadIds.forEach(id => next[id] = 0);
        return next;
      });
      
      for (let i = 0; i < chatAttachments.length; i++) {
        const file = chatAttachments[i];
        const uploadId = chatAttachmentUploadIds[i];
        const uploadFile = await prepareResourceUploadFile(file);
        const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "attachment";
        const filePath = `groups/${group.id}/chat/${user.uid}_${Date.now()}_${safeName}`;
        const fileRef = ref(storage, filePath);
        
        const uploadTask = uploadBytesResumable(fileRef, uploadFile);
        chatUploadTasksRef.current[uploadId] = uploadTask;

        await new Promise((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(prev => ({ ...prev, [uploadId]: progress }));
            },
            (error) => {
              delete chatUploadTasksRef.current[uploadId];
              setUploadProgress(prev => {
                const next = { ...prev };
                delete next[uploadId];
                return next;
              });
              if (cancelledUploadIdsRef.current.has(uploadId) || error?.code === "storage/canceled") {
                cancelledUploadIdsRef.current.delete(uploadId);
                resolve();
                return;
              }
              reject(error);
            },
            async () => {
              delete chatUploadTasksRef.current[uploadId];
              setUploadProgress(prev => {
                const next = { ...prev };
                delete next[uploadId];
                return next;
              });
              if (cancelledUploadIdsRef.current.has(uploadId)) {
                cancelledUploadIdsRef.current.delete(uploadId);
                resolve();
                return;
              }
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              attachments.push({
                name: file.name,
                url,
                size: uploadFile.size,
                contentType: uploadFile.type || file.type || "",
                resourceType: inferResourceType(uploadFile.name || file.name) || "File",
              });
              resolve();
            }
          );
        });
      }
      const messageRef = await sendGroupMessage(db, {
        groupId: group.id,
        channelId: "chats",
        text: messageText,
        user,
        profile,
        kind,
        pinned: kind === "announcement",
        group,
        members,
        replyTo: replyToMessage,
        attachments,
      });
      if (kind === "announcement" && memberCanManage) {
        const nextAction = {
          type: "announcement",
          title: "Pinned update",
          description: messageText.trim(),
          targetId: messageRef.id,
        };
        await updateGroupCurrentAction(db, { groupId: group.id, currentAction: nextAction, user });
        onGroupUpdated?.({ ...group, currentAction: nextAction });
      }
      setMessageText("");
      setChatAttachments([]);
      setChatAttachmentUploadIds([]);
      setShowChatComposer(false);
      setShowChatTools(false);
      setReplyToMessage(null);
      markCurrentGroupRead();
    } catch (err) {
      onError(err);
    } finally {
      setPosting(false);
    }
  };

  const handleSelectChatAttachments = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;
    setChatAttachments(prev => [...prev, ...files]);
    setChatAttachmentUploadIds(prev => [
      ...prev,
      ...files.map((file, index) => `${file.name}-${prev.length + index}-${Date.now()}`)
    ]);
    setShowChatComposer(true);
    setShowChatTools(false);
  };

  const openChatPicker = (kind = "file") => {
    setShowChatComposer(true);
    if (kind === "photo") chatPhotoInputRef.current?.click();
    else chatFileInputRef.current?.click();
  };

  const removeChatAttachment = (index) => {
    const uploadId = chatAttachmentUploadIds[index];
    const activeTask = uploadId && chatUploadTasksRef.current[uploadId];
    if (activeTask) {
      cancelledUploadIdsRef.current.add(uploadId);
      activeTask.cancel();
      delete chatUploadTasksRef.current[uploadId];
    }
    setChatAttachments(prev => prev.filter((_, itemIndex) => itemIndex !== index));
    setChatAttachmentUploadIds(prev => prev.filter((_, itemIndex) => itemIndex !== index));
    setUploadProgress(prev => {
      const next = { ...prev };
      if (uploadId) delete next[uploadId];
      return next;
    });
  };

  const handleSelectMention = (member) => {
    const context = getMentionContext(messageText, messageText.length);
    if (!context) return;
    const handle = memberMentionHandle(member);
    const before = messageText.slice(0, context.start);
    const after = messageText.slice(context.start + context.query.length + 1);
    setMessageText(`${before}@${handle} ${after}`);
    setShowMentionSuggestions(false);
    setMentionSuggestions([]);
  };

  const handleSelectChatPaymentTarget = (item) => {
    if (!item?.id) return;
    const amount = Number(item.amount || 0);
    setChatPaymentTargetId(item.id);
    setMessageText(`pay ${amount.toLocaleString()} for ${collectionDisplayTitle(item)}`);
    setShowMentionSuggestions(false);
    setMentionSuggestions([]);
    const hasPawaPayProvider = PAWAPAY_PROVIDERS.some(provider => provider.value === paymentData.provider);
    if (!hasPawaPayProvider) {
      setPaymentData(prev => ({ ...prev, provider: "AIRTEL_TZA" }));
    }
  };

  const handleStartChatPayment = async () => {
    if (guardOfflineAction("Starting chat payment")) return;
    if (!selectedChatPaymentTarget || !user) {
      onError(new Error("Choose what you want to pay for first."));
      return;
    }
    const options = (selectedChatPaymentTarget.options || "").split(",").map(item => item.trim()).filter(Boolean);
    if (selectedChatPaymentTarget.collectionType === "order" && options.length > 0 && !paymentData.selectedOption) {
      onError(new Error("Choose an option or size first."));
      return;
    }
    if (!paymentData.phone.trim()) {
      onError(new Error("Enter the mobile money phone number first."));
      return;
    }
    setPosting(true);
    try {
      const startDeposit = httpsCallable(getFunctions(), "createPawaPayGroupDeposit");
      const result = await startDeposit({
        groupId: group.id,
        collectionId: selectedChatPaymentTarget.id,
        provider: paymentData.provider || "AIRTEL_TZA",
        phone: paymentData.phone,
        selectedOption: paymentData.selectedOption,
        fromChat: true,
      });
      setMessageText("");
      setChatPaymentTargetId("");
      setShowChatComposer(false);
      setShowChatTools(false);
      setReplyToMessage(null);
      markCurrentGroupRead();
      onSuccess(result.data?.message || "Payment request sent. Wait for confirmation.");
    } catch (err) {
      onError(err);
    } finally {
      setPosting(false);
    }
  };

  const handleReactToMessage = async (message, emoji) => {
    if (guardOfflineAction("Reacting to messages")) return;
    try {
      await reactToGroupMessage(db, { groupId: group.id, messageId: message.id, emoji, user });
      setActiveMessageActions(null);
    } catch (err) {
      onError(err);
    }
  };

  const handleDeleteMessage = async (message) => {
    if (guardOfflineAction("Deleting messages")) return;
    const isOwnMessage = message.authorUid === user?.uid;
    if (!isOwnMessage && !memberCanManage) return;
    if (!window.confirm(isOwnMessage ? "Unsend this message?" : "Delete this message from the group?")) return;
    setBusy(true);
    try {
      await deleteGroupMessage(db, { groupId: group.id, messageId: message.id, user });
      setActiveMessageActions(null);
      onSuccess(isOwnMessage ? "Message unsent." : "Message deleted.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handlePinMessageUpdate = async (message) => {
    if (guardOfflineAction("Pinning updates")) return;
    if (!memberCanManage || !user || !message?.text) return;
    setBusy(true);
    try {
      await pinGroupMessage(db, { groupId: group.id, channelId: "chats", messageId: message.id, pinned: true, user });
      const nextAction = {
        ...(currentAction || {}),
        type: "message",
        title: "Pinned update",
        description: message.text.trim(),
        targetId: message.id,
      };
      await updateGroupCurrentAction(db, { groupId: group.id, currentAction: nextAction, user });
      onGroupUpdated?.({ ...group, currentAction: nextAction });
      setActiveMessageActions(null);
      onSuccess("Message pinned as update.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleUnpinMessage = async (message) => {
    if (guardOfflineAction("Unpinning updates")) return;
    if (!memberCanManage || !user || !message?.id) return;
    setBusy(true);
    try {
      await pinGroupMessage(db, { groupId: group.id, channelId: "chats", messageId: message.id, pinned: false, user });
      if (currentAction?.targetId === message.id) {
        await updateGroupCurrentAction(db, { groupId: group.id, currentAction: null, user });
        onGroupUpdated?.({ ...group, currentAction: null });
      }
      setActiveMessageActions(null);
      onSuccess("Message unpinned.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const openResourceAddMenu = () => {
    if (guardOfflineAction("Adding files")) return;
    setShowResourceAddMenu(true);
    setShowChatTools(false);
  };

  const openSimpleResourceForm = (mode = "files") => {
    setSimpleResourceData({
      ...emptySimpleResource,
      mode,
      subject: selectedResourceSubject || "",
    });
    setShowResourceAddMenu(false);
    setShowSimpleResourceForm(true);
  };

  const handleSelectSimpleResourceFiles = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;
    setSimpleResourceData(prev => ({
      ...prev,
      mode: "files",
      subject: prev.subject || selectedResourceSubject || "Files",
      files,
    }));
    setShowResourceAddMenu(false);
    setShowSimpleResourceForm(true);
  };

  const removeSimpleResourceFile = (index) => {
    setSimpleResourceData(prev => ({
      ...prev,
      files: prev.files.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const selectResourceDataFiles = (files) => {
    const file = files[0] || null;
    if (!file || files.length === 0) {
      setResourceData(prev => ({ ...prev, file: null, files: [], fileName: "" }));
      return;
    }
    setResourceData(prev => ({
      ...prev,
      file,
      files,
      fileName: file.name,
      title: prev.title || file.name.replace(/\.[^.]+$/, ""),
      resourceType: prev.resourceType || inferResourceType(file.name) || "File",
    }));
  };

  const removeResourceDataFile = (index) => {
    setResourceData(prev => {
      const files = (prev.files || []).filter((_, itemIndex) => itemIndex !== index);
      const file = files[0] || null;
      return {
        ...prev,
        file,
        files,
        fileName: file?.name || "",
      };
    });
  };

  const openCreateResourceForm = (subject = selectedResourceSubject) => {
    if (guardOfflineAction("Adding files")) return;
    setEditingResourceId("");
    setResourceData({ ...emptyResource, subject: subject || "" });
    setShowResourceAddMenu(false);
    setShowResourceForm(true);
  };

  const openEditResourceForm = (resource) => {
    if (guardOfflineAction("Editing files")) return;
    setEditingResourceId(resource.id);
    setResourceData({
      title: resource.title || resource.text || "",
      subject: resource.subject || "",
      topic: resource.topic || "",
      resourceType: resource.resourceType || inferResourceType(resource.url || resource.title || ""),
      description: resource.description || (resource.text && resource.text !== resource.title ? resource.text : ""),
      url: resource.url || "",
      file: null,
      files: [],
      fileName: resource.fileName || "",
      deadline: resource.deadline || "",
    });
    setShowResourceForm(true);
  };

  const handleSaveResource = async () => {
    if (guardOfflineAction("Saving files")) return;
    if (!resourceData.title.trim() && !resourceData.url.trim() && !resourceData.file && (!resourceData.files || resourceData.files.length === 0)) {
      onError(new Error("Add a resource title, link, or file."));
      return;
    }
    setBusy(true);
    try {
      if (!editingResourceId && resourceData.files?.length > 1) {
        const subject = resourceData.subject?.trim() || selectedResourceSubject || "General";
        for (const file of resourceData.files) {
          await uploadResourceFileToFolder(file, subject);
        }
        setResourceData(emptyResource);
        setShowResourceForm(false);
        setShowChatTools(false);
        setSelectedResourceSubject(subject);
        onSuccess(`${resourceData.files.length} files shared.`);
        return;
      }
      let resourceUrl = resourceData.url.trim();
      let fileName = resourceData.fileName || "";
      let storagePath = "";
      let fileSize = 0;
      if (storage && resourceData.file) {
        const uploadFile = await prepareResourceUploadFile(resourceData.file);
        const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "resource";
        const fileRef = ref(storage, `groups/${group.id}/resources/${user.uid}_${Date.now()}_${safeName}`);
        const snap = await uploadBytes(fileRef, uploadFile);
        resourceUrl = await getDownloadURL(snap.ref);
        fileName = resourceData.file.name;
        storagePath = fileRef.fullPath;
        fileSize = uploadFile.size;
      }
      const title = resourceData.title || fileName || resourceUrl;
      const resourceType = resourceData.resourceType || inferResourceType(fileName || resourceUrl || title) || "Resource";
      const payload = {
        ...resourceData,
        title,
        url: resourceUrl,
        fileName,
        resourceType,
        storagePath,
        size: fileSize || resourceData.size || 0,
      };
      if (editingResourceId) {
        await updateGroupResource(db, {
          groupId: group.id,
          resourceId: editingResourceId,
          user,
          data: payload,
        });
      } else {
        await addGroupResource(db, {
          groupId: group.id,
          user,
          profile,
          ...payload,
        });
      }
      setResourceData(emptyResource);
      setEditingResourceId("");
      setShowResourceForm(false);
      setShowChatTools(false);
      onSuccess(editingResourceId ? "Resource updated." : "Resource shared.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateResourceFolder = async () => {
    if (guardOfflineAction("Creating folders")) return;
    if (!memberCanManage || !user) return;
    const folderName = window.prompt("Folder name", selectedResourceSubject || "");
    const cleanFolder = folderName?.trim();
    if (!cleanFolder) return;
    setBusy(true);
    try {
      await addGroupResource(db, {
        groupId: group.id,
        user,
        profile,
        title: `${cleanFolder} folder`,
        subject: cleanFolder,
        topic: "Folder",
        resourceType: "Folder",
        description: "Add files or links inside this folder.",
      });
      setSelectedResourceSubject(cleanFolder);
      setShowResourceAddMenu(false);
      onSuccess("Folder created.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSimpleResource = async () => {
    if (guardOfflineAction("Saving files")) return;
    if (!memberCanManage || !user) return;
    const subject = simpleResourceData.mode === "files"
      ? (simpleResourceData.subject.trim() || selectedResourceSubject || "Files")
      : simpleResourceData.subject.trim();
    if (!subject) {
      onError(new Error("Add a folder name."));
      return;
    }
    if (simpleResourceData.mode === "link" && !simpleResourceData.url.trim()) {
      onError(new Error("Paste a file or Drive link."));
      return;
    }
    if (simpleResourceData.mode === "files" && simpleResourceData.files.length === 0) {
      onError(new Error("Choose at least one file."));
      return;
    }
    setBusy(true);
    setGroupUploadStatus(simpleResourceData.mode === "files" ? `Uploading ${simpleResourceData.files.length} ${simpleResourceData.files.length === 1 ? "file" : "files"}...` : "Adding link...");
    try {
      if (simpleResourceData.mode === "link") {
        const cleanUrl = simpleResourceData.url.trim();
        await addGroupResource(db, {
          groupId: group.id,
          user,
          profile,
          title: cleanUrl,
          url: cleanUrl,
          subject,
          topic: "Link",
          resourceType: inferResourceType(cleanUrl) || "Link",
        });
      } else {
        for (const file of simpleResourceData.files) {
          await uploadResourceFileToFolder(file, subject);
        }
      }
      setSelectedResourceSubject(subject);
      setShowSimpleResourceForm(false);
      setSimpleResourceData(emptySimpleResource);
      markCurrentGroupRead();
      onSuccess(simpleResourceData.mode === "link" ? "Link added." : `${simpleResourceData.files.length} ${simpleResourceData.files.length === 1 ? "file" : "files"} added.`);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
      setGroupUploadStatus("");
    }
  };

  const handleDeleteResource = async (resource) => {
    if (guardOfflineAction("Deleting files")) return;
    if (!window.confirm(`Delete "${resource.title || resource.text || "this resource"}"?`)) return;
    setBusy(true);
    try {
      await deleteGroupResource(db, { groupId: group.id, resourceId: resource.id, user });
      onSuccess("Resource deleted.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  // eslint-disable-next-line no-unused-vars
  const handleSaveResourceOffline = async (resource) => {
    if (!resource.url) {
      onError(new Error("This resource does not have a file link to save."));
      return;
    }
    if (isDriveFolderUrl(resource.url)) {
      onError(new Error("Drive folders cannot be saved offline inside Kampasika. Upload the actual files to Kampasika first."));
      return;
    }
    if (!("caches" in window)) {
      onError(new Error("This browser does not support offline file saving."));
      return;
    }

    setSavingOfflineResourceId(resource.id);
    try {
      const storagePath = resource.storagePath || storagePathFromDownloadUrl(resource.url);
      let response;
      let contentType = "";
      let size = 0;
      if (storage && storagePath) {
        const blob = await getBlob(ref(storage, storagePath));
        contentType = blob.type || resource.contentType || "";
        size = blob.size || 0;
        response = new Response(blob, {
          headers: contentType ? { "content-type": contentType } : undefined,
        });
      } else {
        response = await fetch(resource.url, { mode: "cors", credentials: "omit", cache: "no-store" });
        if (!response.ok) {
          throw new Error("The file could not be downloaded.");
        }
        if (isLikelyHtmlResponse(response) && !["PDF", "Image", "Video", "Audio"].includes(resource.resourceType || "")) {
          throw new Error("This link opens a web page, not a direct file.");
        }
        contentType = response.headers.get("content-type") || "";
        size = Number(response.headers.get("content-length") || 0);
      }

      const cache = await caches.open(OFFLINE_RESOURCE_CACHE);
      await cache.put(resource.url, response.clone());

      const nextSaved = {
        ...savedOfflineResources,
        [resource.id]: {
          url: resource.url,
          title: resource.title || resource.text || "Saved resource",
          fileName: resource.fileName || "",
          resourceType: resource.resourceType || "",
          storagePath,
          contentType,
          size,
          subject: resource.subject || "",
          savedAt: Date.now(),
        },
      };
      setSavedOfflineResources(nextSaved);
      writeOfflineResourceStore(group.id, nextSaved);
      onSuccess("Saved on this device.");
    } catch (err) {
      onError(new Error("This file could not be saved offline. If it is a Drive link, upload the actual file to Kampasika; if it is already uploaded, try opening it once and saving again."));
    } finally {
      setSavingOfflineResourceId("");
    }
  };

  // eslint-disable-next-line no-unused-vars
  const handleOpenSavedResource = async (resource) => {
    if (!resource.url || !("caches" in window)) {
      window.open(resource.url, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      const cache = await caches.open(OFFLINE_RESOURCE_CACHE);
      const response = await cache.match(resource.url);
      if (!response) {
        onError(new Error("This resource is not saved on this device yet."));
        return;
      }

      const blob = await response.blob();
      const savedUrl = URL.createObjectURL(blob);
      window.open(savedUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(savedUrl), 60000);
    } catch (err) {
      onError(new Error("Could not open the saved copy. Try opening the original link when online."));
    }
  };

  const handleRemoveSavedResource = async (resource) => {
    const saved = savedOfflineResources[resource.id];
    const savedUrl = saved?.url || resource.url;
    try {
      if (savedUrl && "caches" in window) {
        const cache = await caches.open(OFFLINE_RESOURCE_CACHE);
        await cache.delete(savedUrl);
      }
      const nextSaved = { ...savedOfflineResources };
      delete nextSaved[resource.id];
      setSavedOfflineResources(nextSaved);
      writeOfflineResourceStore(group.id, nextSaved);
      onSuccess("Removed saved copy from this device.");
    } catch (err) {
      onError(new Error("Could not remove the saved copy. Try again."));
    }
  };

  const getPreviewUrl = (resource) => {
    const url = typeof resource === "string" ? resource : resource?.url;
    if (resource?.previewPdfUrl) return resource.previewPdfUrl;
    if (!url) return "";
    const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (driveFileMatch?.[1]) return `https://drive.google.com/file/d/${driveFileMatch[1]}/preview`;
    if (resourcePreviewKind(resource).includes("office")) {
      return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  const getOriginalOpenUrl = (resource = {}) => {
    return resource.url || "";
  };

  const handleSaveImage = async (url, filename) => {
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const safeName = filename && /\.[a-z0-9]+$/i.test(filename) ? filename : `${filename || "image"}.jpg`;
      const file = new File([blob], safeName, { type: blob.type || "image/jpeg" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = safeName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
      onSuccess("Image saved.");
    } catch (err) {
      if (err?.name === "AbortError") return;
      onError(new Error("Couldn't save the image. Try again."));
    }
  };

  const handleOpenResourceInApp = (resource) => {
    if (!resource.url) return;
    if (resource.url.includes("drive.google.com/drive/folders/")) {
      window.open(resource.url, "_blank", "noopener,noreferrer");
      return;
    }
    pushGroupHistory();
    setResourcePreview({
      id: resource.id || "",
      title: resource.title || resource.text || "Resource",
      url: resource.url,
      previewPdfUrl: resource.previewPdfUrl || "",
      previewStatus: resource.previewStatus || "",
      previewError: resource.previewError || "",
      previewUrl: getPreviewUrl(resource),
      type: resource.resourceType || inferResourceType(resource.fileName || resource.name || resource.url || resource.title || ""),
      kind: resourcePreviewKind(resource),
    });
  };

  const handlePrepareDocumentPreview = async (resource = resourcePreview) => {
    if (!resource?.id || !memberCanManage || !user) return;
    setConvertingResourceId(resource.id);
    try {
      const convertResource = httpsCallable(getFunctions(), "convertGroupResourceToPdf");
      const result = await convertResource({ groupId: group.id, resourceId: resource.id });
      const previewPdfUrl = result.data?.previewPdfUrl || "";
      setResourcePreview(prev => prev && prev.id === resource.id ? {
        ...prev,
        previewPdfUrl,
        previewUrl: previewPdfUrl || prev.previewUrl,
        previewStatus: "ready",
      } : prev);
      onSuccess("PDF preview is ready.");
    } catch (err) {
      onError(err);
    } finally {
      setConvertingResourceId("");
    }
  };

  const prepareResourceUploadFile = async (file) => {
    if (!file) return null;
    if (!isAllowedResourceFile(file)) {
      throw new Error(`${file.name} is not supported. Upload PDF, DOC/DOCX, PPT/PPTX, spreadsheets, CSV, or images only.`);
    }
    if (file.size <= MAX_RESOURCE_FILE_BYTES) return file;
    if (file.type?.startsWith("image/")) {
      const { file: compressed } = await compressImage(file, {
        ...COMPRESSION_PRESETS.verification,
        maxSizeKB: 1400,
        maxWidth: 1800,
        maxHeight: 1800,
      });
      if (compressed.size <= MAX_RESOURCE_FILE_BYTES) return compressed;
    }
    throw new Error(`${file.name} is too large. Keep files under ${MAX_UPLOAD_FILE_MB}MB. Videos and archive files are not allowed.`);
  };

  const uploadResourceFileToFolder = async (file, subject) => {
    const uploadFile = await prepareResourceUploadFile(file);
    const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "resource";
    const filePath = `groups/${group.id}/resources/${user.uid}_${Date.now()}_${safeName}`;
    const snap = await uploadBytes(ref(storage, filePath), uploadFile);
    const url = await getDownloadURL(snap.ref);
    const resourceRef = await addGroupResource(db, {
      groupId: group.id,
      user,
      profile,
      title: file.name.replace(/\.[^.]+$/, "") || file.name,
      url,
      subject,
      topic: file.name,
      resourceType: inferResourceType(uploadFile.name || file.name) || "File",
      fileName: file.name,
      storagePath: filePath,
      size: uploadFile.size,
    });
    if (ENABLE_DOCUMENT_PDF_PREVIEWS && resourcePreviewKind({ fileName: file.name, resourceType: inferResourceType(uploadFile.name || file.name) }) === "convertible") {
      await handlePrepareDocumentPreview({ id: resourceRef.id });
    }
  };

  const toggleWorkGroupMember = (uid) => {
    setWorkGroupData(prev => {
      const hasMember = prev.memberUids.includes(uid);
      const memberUids = hasMember ? prev.memberUids.filter(item => item !== uid) : [...prev.memberUids, uid];
      return {
        ...prev,
        memberUids,
        leaderUid: memberUids.includes(prev.leaderUid) ? prev.leaderUid : (memberUids[0] || ""),
      };
    });
  };

  const openCreateWorkGroupForm = () => {
    setEditingWorkGroupId("");
    setWorkGroupData(emptyWorkGroup);
    setShowWorkGroupMembers(false);
    setShowWorkGroupMore(false);
    setShowWorkGroupForm(true);
  };

  const openEditWorkGroupForm = (workGroup) => {
    setEditingWorkGroupId(workGroup.id);
    setWorkGroupData({
      name: workGroup.name || "",
      description: workGroup.description || "",
      taskTitle: workGroup.taskTitle || "",
      taskInstructions: workGroup.taskInstructions || "",
      deadline: workGroup.deadline || "",
      leaderUid: workGroup.leaderUid || "",
      memberUids: workGroup.memberUids || [],
    });
    setShowWorkGroupMembers(true);
    setShowWorkGroupMore(Boolean(workGroup.description || workGroup.taskTitle || workGroup.taskInstructions || workGroup.deadline || workGroup.leaderUid));
    setShowWorkGroupForm(true);
  };

  const handleSaveWorkGroup = async () => {
    if (guardOfflineAction("Saving sub-groups")) return;
    if (!workGroupData.name.trim()) {
      onError(new Error("Sub-group name is required."));
      return;
    }
    if (workGroupData.memberUids.length === 0) {
      onError(new Error("Add at least one member to this sub-group."));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...workGroupData,
        leaderName: memberNameByUid[workGroupData.leaderUid] || "",
        memberNames: workGroupData.memberUids.map(uid => memberNameByUid[uid] || uid),
      };
      if (editingWorkGroupId) {
        await updateGroupWorkGroup(db, {
          groupId: group.id,
          workGroupId: editingWorkGroupId,
          user,
          data: payload,
        });
      } else {
        await createGroupWorkGroup(db, {
          groupId: group.id,
          user,
          profile,
          data: payload,
        });
      }
      setWorkGroupData(emptyWorkGroup);
      setEditingWorkGroupId("");
      setShowWorkGroupForm(false);
      markCurrentGroupRead();
      onSuccess(editingWorkGroupId ? "Sub-group updated." : "Sub-group created.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteWorkGroup = async (workGroup) => {
    if (guardOfflineAction("Deleting sub-groups")) return;
    if (!window.confirm(`Delete "${workGroup.name || "this sub-group"}"? Submissions for it will be removed from this view.`)) return;
    setBusy(true);
    try {
      await deleteGroupWorkGroup(db, { groupId: group.id, workGroupId: workGroup.id, user });
      onSuccess("Sub-group deleted.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitWork = async (workGroup) => {
    if (guardOfflineAction("Submitting work")) return;
    if (!workSubmissionData.title.trim() && !workSubmissionData.url.trim() && !workSubmissionData.file) {
      onError(new Error("Add a submission title, link, or file."));
      return;
    }
    setBusy(true);
    try {
      let submissionUrl = workSubmissionData.url.trim();
      if (storage && workSubmissionData.file) {
        const safeName = workSubmissionData.file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "submission";
        const fileRef = ref(storage, `groups/${group.id}/workGroups/${workGroup.id}/${user.uid}_${Date.now()}_${safeName}`);
        const snap = await uploadBytes(fileRef, workSubmissionData.file);
        submissionUrl = await getDownloadURL(snap.ref);
      }
      await submitGroupWork(db, {
        groupId: group.id,
        workGroupId: workGroup.id,
        user,
        profile,
        data: {
          ...workSubmissionData,
          title: workSubmissionData.title || workGroup.taskTitle || workGroup.name,
          url: submissionUrl,
        },
      });
      setWorkSubmissionData(emptyWorkSubmission);
      setSubmittingWorkGroupId("");
      markCurrentGroupRead();
      onSuccess("Work submitted to the group leader.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };
   
  // eslint-disable-next-line no-unused-vars
  const handleUploadResourceFile = async (event) => {
    if (guardOfflineAction("Uploading files")) return;
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0 || !memberCanManage || !storage || !group?.id) return;
    setBusy(true);
    try {
      for (const file of files) {
        await uploadResourceFileToFolder(file, "Files");
      }
      setShowChatTools(false);
      onSuccess(`${files.length} ${files.length === 1 ? "file" : "files"} shared in resources.`);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTracker = async () => {
    if (guardOfflineAction("Creating payments or activities")) return;
    const effectiveCollectionType = activeTab === "events"
      ? (trackerData.collectionType === "order" ? "order" : "event")
      : trackerData.collectionType;
    if (!trackerData.title.trim() || (effectiveCollectionType !== "event" && !trackerData.amount)) {
      onError(new Error(effectiveCollectionType === "event" ? "Event title is required." : "Order title and price are required."));
      return;
    }
    setBusy(true);
    setGroupUploadStatus(effectiveCollectionType === "event" ? "Creating event..." : "Saving tracker...");
    try {
      let photoFile = trackerData.photoFile || null;
      const data = {
        ...trackerData,
        collectionType: effectiveCollectionType,
        visibility: "groupOnly",
        photoFile,
        paymentMethods: typeof trackerData.paymentMethods === "string"
          ? trackerData.paymentMethods.split(",").map(item => item.trim()).filter(Boolean)
          : trackerData.paymentMethods || [],
      };
      setGroupUploadStatus(effectiveCollectionType === "event" ? "Creating event..." : "Saving tracker...");
      let createdTracker = null;
      if (editingTrackerId) {
        await updateGroupCollection(db, {
          groupId: group.id,
          collectionId: editingTrackerId,
          user,
          storage,
          data,
        });
      } else {
        createdTracker = await createGroupCollection(db, {
          groupId: group.id,
          user,
          profile,
          storage,
          data,
        });
      }
      setTrackerData(emptyTracker);
      setEditingTrackerId("");
      setShowTrackerForm(false);
      if (activeTab === "payments" && createdTracker) setSelectedCollectionId(createdTracker.id);
      if (activeTab === "events" && createdTracker) {
        setSelectedCollectionId(createdTracker.id);
        if (trackerData.photoPreview) {
          setPendingEventPhotoPreviews(prev => ({ ...prev, [createdTracker.id]: trackerData.photoPreview }));
        }
      }
      if (!editingTrackerId && ["event", "order"].includes(effectiveCollectionType) && createdTracker && photoFile) {
        setGroupUploadStatus("Attaching poster...");
        try {
          await attachGroupCollectionPhoto(db, storage, {
            groupId: group.id,
            collectionId: createdTracker.id,
            uid: user.uid,
            file: photoFile,
          });
        } catch (photoError) {
          onError(new Error(`Event created, but poster did not attach: ${photoError.message || photoError}`));
        }
      }
      markCurrentGroupRead();
      onSuccess(editingTrackerId ? "Tracker updated." : effectiveCollectionType === "event" ? "Event created." : effectiveCollectionType === "order" ? "Order created." : "Payment tracker created.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
      setGroupUploadStatus("");
    }
  };

  const handleDeleteTracker = async (item = selectedCollection) => {
    if (guardOfflineAction("Deleting payments or activities")) return;
    if (!item || !memberCanManage || !user) return;
    const label = item.collectionType === "event" ? "event" : item.collectionType === "order" ? "order" : "payment tracker";
    if (!window.confirm(`Delete "${item.title || label}"? This will remove its registrations/payment records from this group.`)) return;
    setBusy(true);
    try {
      await deleteGroupCollection(db, { groupId: group.id, collectionId: item.id, user });
      setSelectedCollectionId("");
      setPayments([]);
      setShowPaymentForm(false);
      setShowManualPaymentForm(false);
      if (group.currentAction?.targetId === item.id) {
        await updateGroupCurrentAction(db, { groupId: group.id, currentAction: null, user });
        onGroupUpdated?.({ ...group, currentAction: null });
      }
      markCurrentGroupRead();
      onSuccess(item.collectionType === "event" ? "Event deleted." : "Payment tracker deleted.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleStartNewTrackerRound = async (item = selectedCollection) => {
    if (guardOfflineAction("Starting a new round")) return;
    if (!item || !memberCanManage || !user) return;
    const label = item.collectionType === "event" ? "event" : item.collectionType === "order" ? "order" : "contribution";
    if (!window.confirm(`Start a new ${label} from "${item.title}"? The current history will stay unchanged.`)) return;
    setBusy(true);
    try {
      const roundRootId = item.roundRootId || item.roundSourceId || item.id;
      const baseTitle = item.roundBaseTitle || item.roundStartedFromTitle || item.title || "";
      const relatedRounds = collections.filter(collectionItem => {
        const collectionRootId = collectionItem.roundRootId || collectionItem.roundSourceId || collectionItem.id;
        return collectionRootId === roundRootId || collectionItem.id === roundRootId;
      });
      const nextRound = Math.max(1, ...relatedRounds.map(collectionItem => Number(collectionItem.roundNumber || 1))) + 1;
      await archiveGroupCollectionRound(db, {
        groupId: group.id,
        collectionId: item.id,
        user,
        roundRootId,
        roundNumber: Number(item.roundNumber || 1),
      });
      const createdTracker = await createGroupCollection(db, {
        groupId: group.id,
        user,
        profile,
        storage,
        data: {
          title: `${baseTitle} ${nextRound}`.trim(),
          description: item.description || "",
          collectionType: item.collectionType || "contribution",
          amount: item.amount || "",
          options: item.options || "",
          expectedPeople: item.expectedPeople || "",
          paymentMethods: item.paymentMethods || [],
          visibility: "groupOnly",
          deadline: item.deadline || "",
          roundSourceId: item.id,
          roundRootId,
          roundNumber: nextRound,
          roundBaseTitle: baseTitle,
          roundStartedFromTitle: baseTitle,
          photoFile: null,
        },
      });
      setSelectedCollectionId(createdTracker.id);
      setPayments([]);
      setShowPaymentForm(false);
      setShowManualPaymentForm(false);
      markCurrentGroupRead();
      onSuccess("New round started. Previous history is still saved.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const openEditTrackerForm = (item) => {
    setEditingTrackerId(item.id);
    setTrackerData({
      title: item.title || "",
      description: item.description || "",
      collectionType: item.collectionType || "contribution",
      amount: item.amount || "",
      options: item.options || "",
      expectedPeople: item.expectedPeople || "",
      paymentMethods: Array.isArray(item.paymentMethods) ? item.paymentMethods.join(", ") : item.paymentMethods || "",
      visibility: "groupOnly",
      deadline: item.deadline || "",
      photoFile: null,
      photoPreview: item.photoUrl || "",
    });
    setShowTrackerMore(Boolean(item.photoUrl || item.options || item.expectedPeople || item.paymentMethods?.length || item.paymentMethods || item.deadline || item.description));
    setShowTrackerForm(true);
    pushGroupHistory();
  };

  const handleAddManualPayment = async () => {
    if (guardOfflineAction("Adding paid people")) return;
    if (!selectedCollection || !memberCanVerify || !user) return;
    if (!manualPaymentData.studentName.trim()) {
      onError(new Error("Add the student's name."));
      return;
    }
    setBusy(true);
    try {
      await addManualGroupPayment(db, {
        groupId: group.id,
        collectionItem: selectedCollection,
        data: manualPaymentData,
        recorder: { uid: user.uid, name: userName, email: user.email },
      });
      setManualPaymentData(emptyManualPayment);
      setShowManualPaymentForm(false);
      onSuccess("Paid person added.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitPayment = async () => {
    if (guardOfflineAction("Submitting payment proof")) return;
    if (!selectedCollection) return;
    const needsOption = selectedCollection.collectionType === "order" && selectedOrderOptions.length > 0;
    if (needsOption && !paymentData.selectedOption) {
      onError(new Error("Choose an option or size first."));
      return;
    }
    if (!paymentData.phone.trim() || !String(paymentData.amountPaid || "").trim() || !paymentData.paymentRef.trim()) {
      onError(new Error("Phone number, amount paid, and sender name/reference are required."));
      return;
    }
    if (myPayment?.proofRequested && !paymentData.paymentProofFile) {
      onError(new Error("Admin requested screenshot proof. Please upload a clearer proof image."));
      return;
    }
    if (myPayment && !window.confirm("You already submitted this payment. Do you want to update the information?")) return;
    setBusy(true);
    try {
      await submitGroupPayment(db, storage, {
        groupId: group.id,
        collectionItem: selectedCollection,
        user,
        profile,
        data: {
          ...paymentData,
          studentName: userName || profile.name || user?.email || "",
          amountPaid: paymentData.amountPaid || selectedCollection.amount,
        },
      });
      setPaymentData({ ...emptyPayment, studentName: userName || "" });
      setShowPaymentForm(false);
      setShowPawaPayOptions(false);
      onSuccess("Payment submitted for treasurer/admin verification.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleStartAzamPayCheckout = async () => {
    if (guardOfflineAction("Starting AzamPay payment")) return;
    if (!selectedCollection || !user) return;
    const needsOption = selectedCollection.collectionType === "order" && selectedOrderOptions.length > 0;
    if (needsOption && !paymentData.selectedOption) {
      onError(new Error("Choose an option or size first."));
      return;
    }
    if (!paymentData.phone.trim()) {
      onError(new Error("Enter the mobile money phone number first."));
      return;
    }
    setBusy(true);
    try {
      const startCheckout = httpsCallable(getFunctions(), "createAzamPayCheckout");
      const result = await startCheckout({
        groupId: group.id,
        collectionId: selectedCollection.id,
        provider: paymentData.provider || "Mpesa",
        phone: paymentData.phone,
        selectedOption: paymentData.selectedOption,
      });
      setShowPaymentForm(false);
      setShowAzamPayOptions(false);
      setShowPawaPayOptions(false);
      onSuccess(result.data?.message || "AzamPay payment started. Confirm it on your phone.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleStartPawaPayDeposit = async () => {
    if (guardOfflineAction("Starting mobile money payment")) return;
    if (!selectedCollection || !user) return;
    const needsOption = selectedCollection.collectionType === "order" && selectedOrderOptions.length > 0;
    if (needsOption && !paymentData.selectedOption) {
      onError(new Error("Choose an option or size first."));
      return;
    }
    if (!paymentData.phone.trim()) {
      onError(new Error("Enter the mobile money phone number first."));
      return;
    }
    setBusy(true);
    try {
      const startDeposit = httpsCallable(getFunctions(), "createPawaPayGroupDeposit");
      const result = await startDeposit({
        groupId: group.id,
        collectionId: selectedCollection.id,
        provider: paymentData.provider || "AIRTEL_TZA",
        phone: paymentData.phone,
        selectedOption: paymentData.selectedOption,
      });
      setShowPaymentForm(false);
      setShowPawaPayOptions(false);
      onSuccess(result.data?.message || "Payment request sent. Wait for confirmation.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const renderPawaPayChoice = ({ includeOrderOption = false } = {}) => {
    if (!selectedNeedsPayment) return null;
    if (!ENABLE_PAWAPAY_PAYMENTS) return null;
    const amount = Number(selectedCollection?.amount || 0);
    return (
      <div className={`azam-pay-box ${showPawaPayOptions ? "expanded" : ""}`}>
        {!showPawaPayOptions ? (
          <>
            <button className="group-btn primary" type="button" disabled={busy} onClick={() => {
              const hasPawaPayProvider = PAWAPAY_PROVIDERS.some(provider => provider.value === paymentData.provider);
              if (!hasPawaPayProvider) setPaymentData(prev => ({ ...prev, provider: "AIRTEL_TZA" }));
              setShowAzamPayOptions(false);
              setShowPawaPayOptions(true);
              setShowManualProofFields(false);
            }}>
              Pay with mobile money
            </button>
            <span>Choose your network and enter the number that will approve the payment.</span>
          </>
        ) : (
          <>
            {includeOrderOption && selectedGroupOrder && selectedOrderOptions.length > 0 && (
              <div className="group-field"><label>Choose option / size *</label><select value={paymentData.selectedOption} onChange={event => setPaymentData({ ...paymentData, selectedOption: event.target.value })}><option value="">Choose option</option>{selectedOrderOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></div>
            )}
            <div className="group-field"><label>Network</label><select value={paymentData.provider} onChange={event => setPaymentData({ ...paymentData, provider: event.target.value })}>{PAWAPAY_PROVIDERS.map(provider => <option key={provider.value} value={provider.value}>{provider.label}</option>)}</select></div>
            <div className="group-field"><label>Phone number to approve payment *</label><input value={paymentData.phone} onChange={event => setPaymentData({ ...paymentData, phone: event.target.value })} placeholder="0712345678" /></div>
            <div className="group-field"><label>Amount</label><input value={`${amount.toLocaleString()} TSh`} readOnly /></div>
            <div className="payment-meta">You will approve the request from your mobile money phone.</div>
            <div className="group-inline-actions">
              <button className="group-btn primary" type="button" disabled={busy} onClick={handleStartPawaPayDeposit}>{busy ? "Starting..." : `Pay ${amount.toLocaleString()} TSh`}</button>
              <button className="group-btn ghost" type="button" disabled={busy} onClick={() => setShowPawaPayOptions(false)}>Cancel</button>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderAzamPayChoice = ({ includeOrderOption = false } = {}) => {
    if (!ENABLE_AZAMPAY_PAYMENTS || !selectedNeedsPayment) return null;
    const amount = Number(selectedCollection?.amount || 0);
    return (
      <div className={`azam-pay-box ${showAzamPayOptions ? "expanded" : ""}`}>
        {!showAzamPayOptions ? (
          <>
            <button className="group-btn primary" type="button" disabled={busy} onClick={() => { setShowPawaPayOptions(false); setShowAzamPayOptions(true); setShowManualProofFields(false); }}>
              Pay with AzamPay
            </button>
            <span>Automatic mobile money confirmation. Choose this first if you want the group to update after payment.</span>
          </>
        ) : (
          <>
            {includeOrderOption && selectedGroupOrder && selectedOrderOptions.length > 0 && (
              <div className="group-field"><label>Choose option / size *</label><select value={paymentData.selectedOption} onChange={event => setPaymentData({ ...paymentData, selectedOption: event.target.value })}><option value="">Choose option</option>{selectedOrderOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></div>
            )}
            <div className="group-field"><label>Mobile money provider</label><select value={paymentData.provider} onChange={event => setPaymentData({ ...paymentData, provider: event.target.value })}>{AZAMPAY_PROVIDERS.map(provider => <option key={provider.value} value={provider.value}>{provider.label}</option>)}</select></div>
            <div className="group-field"><label>Payment phone number *</label><input value={paymentData.phone} onChange={event => setPaymentData({ ...paymentData, phone: event.target.value })} placeholder="0712345678" /></div>
            <div className="group-field"><label>Amount</label><input value={`${amount.toLocaleString()} TSh`} readOnly /></div>
            <div className="payment-meta">You will approve the request from your mobile money phone.</div>
            <div className="group-inline-actions">
              <button className="group-btn primary" type="button" disabled={busy} onClick={handleStartAzamPayCheckout}>{busy ? "Starting..." : `Pay ${amount.toLocaleString()} TSh`}</button>
              <button className="group-btn ghost" type="button" disabled={busy} onClick={() => setShowAzamPayOptions(false)}>Cancel</button>
            </div>
          </>
        )}
      </div>
    );
  };

  const handleRegisterEvent = async () => {
    if (guardOfflineAction(selectedGroupOrder ? "Placing orders" : "Registering")) return;
    if (!selectedCollection || !user) return;
    const needsOption = selectedCollection.collectionType === "order" && selectedOrderOptions.length > 0;
    if (needsOption && !paymentData.selectedOption) {
      onError(new Error("Choose an option or size first."));
      return;
    }
    if (myPayment && !window.confirm("You already registered. Do you want to update your registration?")) return;
    setBusy(true);
    try {
      await registerGroupEvent(db, {
        groupId: group.id,
        collectionItem: selectedCollection,
        user,
        profile,
        data: { phone: paymentData.phone, selectedOption: paymentData.selectedOption },
      });
      setShowPaymentForm(false);
      onSuccess(selectedCollection.collectionType === "order" ? "Order placed. You can submit payment proof later." : "Registration saved.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (payment, status) => {
    if (guardOfflineAction("Verifying payments")) return;
    setBusy(true);
    try {
      await verifyGroupPayment(db, {
        groupId: group.id,
        collectionId: selectedCollection.id,
        paymentId: payment.id,
        status,
        verifier: { uid: user.uid, name: userName, email: user.email },
      });
      onSuccess(status === "paid" ? "Payment marked paid." : "Payment rejected.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleRequestProof = async (payment) => {
    if (guardOfflineAction("Requesting proof")) return;
    const message = window.prompt("Message to member", "Please upload a clearer payment screenshot proof.");
    if (message === null) return;
    setBusy(true);
    try {
      await requestGroupPaymentProof(db, {
        groupId: group.id,
        collectionId: selectedCollection.id,
        payment,
        requester: { uid: user.uid, name: userName, email: user.email },
        message,
      });
      onSuccess("Proof request sent to member.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleRoleChange = async (member, role) => {
    if (guardOfflineAction("Changing member roles")) return;
    setBusy(true);
    try {
      await updateMemberRole(db, { groupId: group.id, uid: member.uid, role });
      onSuccess("Member role updated.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleMemberStatusAction = async (member, status) => {
    if (guardOfflineAction(status === "blocked" ? "Blocking members" : "Removing members")) return;
    const label = status === "blocked" ? "block" : "remove";
    if (!memberCanEditGroup || !member?.uid || member.role === "owner") return;
    if (!window.confirm(`${label === "block" ? "Block" : "Remove"} ${memberDisplayName(member)} from this group?`)) return;
    setBusy(true);
    try {
      await updateGroupMemberStatus(db, { groupId: group.id, member, status });
      setMemberActionMenuId("");
      onSuccess(status === "blocked" ? "Member blocked." : "Member removed.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleAdjustAmount = async (payment) => {
    if (guardOfflineAction("Adjusting payments")) return;
    const nextAmount = window.prompt("Amount paid so far", String(payment.amountPaid || ""));
    if (nextAmount === null) return;
    const cleanAmount = Number(nextAmount);
    if (Number.isNaN(cleanAmount) || cleanAmount < 0) {
      onError(new Error("Enter a valid amount."));
      return;
    }
    setBusy(true);
    try {
      await updateGroupPaymentAmount(db, {
        groupId: group.id,
        collectionId: selectedCollection.id,
        paymentId: payment.id,
        amountPaid: cleanAmount,
        verifier: { uid: user.uid, name: userName, email: user.email },
      });
      onSuccess("Amount paid updated.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleApproveMember = async (member) => {
    setBusy(true);
    try {
      await approveGroupMember(db, { groupId: group.id, member });
      onSuccess("Member approved.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleRejectMember = async (member) => {
    setBusy(true);
    try {
      await rejectGroupMember(db, { groupId: group.id, member });
      onSuccess("Join request rejected.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleExportPayments = () => {
    if (!selectedCollection) return;
    const rows = [
      ["Name", "Status", "Option", "Amount Paid", "Amount Due", "Phone", "Reference", "Proof URL", "Submitted At"],
      ...payments.map(payment => [
        payment.studentName || "",
        payment.status || "pending",
        payment.selectedOption || "",
        payment.amountPaid || "",
        payment.amountDue || selectedCollection.amount || "",
        payment.phone || "",
        payment.paymentRef || "",
        payment.paymentProofUrl || "",
        formatDate(payment.submittedAt?.toDate?.() || payment.submittedAt || payment.createdAt || ""),
      ]),
    ];
    const csv = rows
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeTitle = (selectedCollection.title || "group-payments").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    link.href = url;
    link.download = `${safeTitle || "group-payments"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleMentionPermissionChange = async (nextMentionPermission) => {
    if (guardOfflineAction("Changing tag permissions")) return;
    setBusy(true);
    try {
      setMentionPermission(nextMentionPermission);
      await updateGroupMentionPermission(db, { groupId: group.id, mentionPermission: nextMentionPermission });
      onSuccess("Tag permission updated.");
    } catch (err) {
      setMentionPermission(group.mentionPermission || "admins");
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleMute = async () => {
    if (guardOfflineAction("Changing mute settings")) return;
    if (!currentMember || !user) return;
    const nextMuted = !currentMember.notificationMuted;
    setBusy(true);
    try {
      await updateGroupMute(db, { groupId: group.id, uid: user.uid, notificationMuted: nextMuted });
      onSuccess(nextMuted ? "Group muted." : "Group unmuted.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  const openNotificationSettings = () => {
    setNotificationPrefsDraft({
      ...DEFAULT_GROUP_NOTIFICATION_PREFS,
      ...(currentMember?.notificationPrefs || {}),
    });
    setShowNotificationSettings(true);
    setMenuOpen(false);
  };

  const handleSaveNotificationSettings = async () => {
    if (guardOfflineAction("Saving notification settings")) return;
    if (!currentMember || !user) return;
    setBusy(true);
    try {
      await updateGroupNotificationPreferences(db, {
        groupId: group.id,
        uid: user.uid,
        notificationPrefs: notificationPrefsDraft,
      });
      setShowNotificationSettings(false);
      onSuccess("Notification preferences saved.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleSendDeadlineReminder = async () => {
    if (guardOfflineAction("Sending reminders")) return;
    if (!selectedCollection || !user) return;
    if (!window.confirm(`Send one reminder for ${selectedCollection.title} to members who still need to act?`)) return;
    setBusy(true);
    try {
      const count = await sendCollectionDeadlineReminder(db, {
        groupId: group.id,
        collectionItem: selectedCollection,
        requester: { uid: user.uid, name: userName, email: user.email },
      });
      onSuccess(count > 0 ? `Reminder sent to ${count} affected member${count === 1 ? "" : "s"}.` : "No affected members needed a reminder.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const openEditGroup = () => {
    if (guardOfflineAction("Editing group")) return;
    setEditGroupData({ name: group.name || "", desc: group.desc || "", avatarFile: null, avatarPreview: group.avatarUrl || "" });
    setShowEditGroup(true);
    setMenuOpen(false);
  };

  const handleGroupAvatarSelect = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onError(new Error("Please choose an image file."));
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      onError(new Error("Group photo is too large. Choose an image under 4MB."));
      return;
    }
    setEditGroupData(prev => ({
      ...prev,
      avatarFile: file,
      avatarPreview: URL.createObjectURL(file),
    }));
  };

  const handleSaveGroupProfile = async () => {
    if (guardOfflineAction("Editing group")) return;
    if (!memberCanEditGroup) return;
    setBusy(true);
    try {
      const updatedGroup = await updateUniversityGroupProfile(db, storage, {
        group,
        data: editGroupData,
        user,
      });
      onGroupUpdated?.(updatedGroup);
      setShowEditGroup(false);
      onSuccess("Group profile updated.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (guardOfflineAction("Leaving groups")) return;
    if (!currentMember || !user) return;
    if (!window.confirm(`Leave ${group.name}?`)) return;
    setBusy(true);
    try {
      await leaveUniversityGroup(db, { group, member: currentMember });
      onSuccess("You left the group.");
      onLeaveGroup?.();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  const handleDeleteGroup = () => {
    if (!onDeleteGroup || !memberCanEditGroup) return;
    setMenuOpen(false);
    onDeleteGroup(group, "delete");
  };

  const renderTrackerForm = () => (
    <div className="payment-card group-create-card">
      {editingTrackerId && <div className="payment-alert compact">Editing existing {trackerData.collectionType === "event" ? "event" : trackerData.collectionType === "order" ? "order" : "payment tracker"}</div>}
      <div className="group-field"><label>Title</label><input value={trackerData.title} onChange={event => setTrackerData({ ...trackerData, title: event.target.value })} placeholder={trackerData.collectionType === "event" ? "ARU Freshers welcome night" : trackerData.collectionType === "order" ? "CSN YR 2 T-Shirts" : "Studio model materials"} /></div>
      {activeTab === "events" ? (
        <div className="payment-alert compact">{trackerData.collectionType === "order" ? "Group order" : "Event registration"}</div>
      ) : null}
      <div className="group-field"><label>{trackerData.collectionType === "event" ? "Payment amount, optional" : trackerData.collectionType === "order" ? "Price per item" : "Amount per member"}</label><input type="number" value={trackerData.amount} onChange={event => setTrackerData({ ...trackerData, amount: event.target.value })} placeholder={trackerData.collectionType === "event" ? "Leave empty for free registration" : "10000"} /></div>
      <button className="group-option-row" type="button" onClick={() => setShowTrackerMore(value => !value)}>
        <span>More</span>
        <strong>{showTrackerMore ? "Hide" : "Open"}</strong>
      </button>
      {showTrackerMore && (
        <>
          <div className="group-field">
            <label>{trackerData.collectionType === "event" ? "Event poster / photo" : trackerData.collectionType === "order" ? "Order photo / poster" : "Photo"}</label>
            <input type="file" accept="image/*" onChange={event => {
              const file = event.target.files?.[0] || null;
              setTrackerData({ ...trackerData, photoFile: file, photoPreview: file ? URL.createObjectURL(file) : "" });
            }} />
            {trackerData.photoPreview && <img className="tracker-photo-preview" src={trackerData.photoPreview} alt="Preview" />}
          </div>
          {trackerData.collectionType === "order" && (
            <div className="group-field"><label>Options / sizes</label><input value={trackerData.options} onChange={event => setTrackerData({ ...trackerData, options: event.target.value })} placeholder="S, M, L, XL" /></div>
          )}
          <div className="group-field"><label>Expected people</label><input type="number" value={trackerData.expectedPeople} onChange={event => setTrackerData({ ...trackerData, expectedPeople: event.target.value })} placeholder="45" /></div>
          <div className="group-field"><label>Payment numbers</label><input value={trackerData.paymentMethods} onChange={event => setTrackerData({ ...trackerData, paymentMethods: event.target.value })} placeholder="M-Pesa 255..., Airtel Money 255..." /></div>
          <div className="group-field"><label>Deadline</label><input type="date" value={trackerData.deadline} onChange={event => setTrackerData({ ...trackerData, deadline: event.target.value })} /></div>
          <div className="group-field"><label>Description</label><textarea value={trackerData.description} onChange={event => setTrackerData({ ...trackerData, description: event.target.value })} placeholder={trackerData.collectionType === "event" ? "Where, when, who can register, and what students should bring." : trackerData.collectionType === "order" ? "Fabric, pickup point, deadline, and order instructions." : "What this payment is for and how members should pay."} /></div>
        </>
      )}
      {busy && groupUploadStatus && <div className="group-upload-status">{groupUploadStatus}</div>}
      <button className="group-btn primary" type="button" disabled={busy || isOffline} onClick={handleCreateTracker}>{busy ? (groupUploadStatus || "Saving...") : editingTrackerId ? "Save changes" : trackerData.collectionType === "event" ? "Create event" : trackerData.collectionType === "order" ? "Create order" : "Create contribution"}</button>
      {editingTrackerId && <button className="group-btn ghost" type="button" disabled={busy} onClick={() => { setShowTrackerForm(false); setEditingTrackerId(""); setTrackerData(emptyTracker); }}>Cancel edit</button>}
    </div>
  );

  return (
    <div className={`group-detail ${isDarkMode ? "dark-mode" : "light-mode"} ${activeTab === "chats" ? "group-detail-chat" : ""}`}>
      <div className="group-wa-header">
        <div className="group-header-main">
          <button
            type="button"
            className="group-back-btn"
            aria-label="Back"
            onClick={() => {
              if (!goBackWithinGroup()) onBack?.();
            }}
          >
            <MenuIcon name="back" />
          </button>
          <div
            className="group-avatar"
            style={{
              backgroundImage: group.avatarUrl ? `url(${group.avatarUrl})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {!group.avatarUrl && (group.avatarText || groupAvatarText(group.name))}
          </div>
          <button type="button" className="group-header-title" onClick={() => setShowGroupAbout(true)}>
            <h2>{group.name}</h2>
            <div>
              {(members.length || group.memberCount || 0).toLocaleString()} members
              {currentMember?.role ? ` - ${currentMember.role}` : ""}
            </div>
          </button>
          <button type="button" className="group-invite-btn" aria-label="Invite to group" onClick={onShareGroup}>
            <MenuIcon name="share" />
            <span>Invite</span>
          </button>
          <div className="group-menu-wrap">
            <button
              type="button"
              className={`group-icon-btn ${showMenuActivityDot ? "has-activity" : ""}`}
              aria-label="Open group menu"
              onClick={() => {
                setMenuOpen(value => !value);
                setMenuActivitySeen(true);
              }}
            >
              <MenuIcon name="more" />
              {showMenuActivityDot && <span className="group-menu-activity-dot" aria-hidden="true" />}
            </button>
            {menuOpen && (
              <>
                <button type="button" className="group-menu-scrim" aria-label="Close group menu" onClick={() => setMenuOpen(false)} />
                <div className="group-side-menu">
                  <div className="group-side-menu-title">{group.name}</div>
                  {canViewGroupContent && (
                    <>
                      {groupMenuItems.map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          className={`group-menu-item ${activeTab === id ? "active" : ""}`}
                          onClick={() => switchGroupTab(id)}
                        >
                          <span><MenuIcon name={id} /></span>
                          <strong>{label}</strong>
                          {groupHasUnread && ["chats", "payments", "events", "workgroups", "resources"].includes(id) && <em className="group-menu-new">New</em>}
                        </button>
                      ))}
                    </>
                  )}
                  <button
                    type="button"
                    className="group-menu-item"
                    onClick={() => {
                      setShowGroupQr(true);
                      setMenuOpen(false);
                    }}
                  >
                    <span><MenuIcon name="qr" /></span>
                    <strong>Invite / QR</strong>
                  </button>
                  {isGroupMember(currentMember) && (
                    <>
                      <div className="group-menu-divider" />
                      {memberCanEditGroup && (
                        <button type="button" className="group-menu-item" disabled={busy} onClick={openEditGroup}>
                          <span><MenuIcon name="edit" /></span>
                          <strong>Edit group</strong>
                        </button>
                      )}
                      <button type="button" className="group-menu-item" disabled={busy} onClick={handleToggleMute}>
                        <span><MenuIcon name={currentMember.notificationMuted ? "bell" : "mute"} /></span>
                        <strong>{currentMember.notificationMuted ? "Unmute group" : "Mute group"}</strong>
                      </button>
                      <button type="button" className="group-menu-item" disabled={busy} onClick={openNotificationSettings}>
                        <span><MenuIcon name="settings" /></span>
                        <strong>Notification settings</strong>
                      </button>
                      {currentMember.role !== "owner" && (
                        <button type="button" className="group-menu-item danger" disabled={busy} onClick={handleLeaveGroup}>
                          <span><MenuIcon name="leave" /></span>
                          <strong>Leave group</strong>
                        </button>
                      )}
                      <div className="group-menu-divider" />
                      {memberCanEditGroup && onDeleteGroup && (
                        <button type="button" className="group-menu-item danger" disabled={busy} onClick={handleDeleteGroup}>
                          <span><MenuIcon name="trash" /></span>
                          <strong>Delete group</strong>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        {(!user || membersLoaded) && !isGroupMember(currentMember) && (
          <div style={{ padding: "0 12px 10px" }}>
            <button type="button" className="group-btn secondary" style={{ width: "100%" }} disabled={joiningGroup || !!pendingCurrentMember} onClick={onJoinGroup}>
              {pendingCurrentMember
                ? "Join request pending"
                : joiningGroup
                  ? "Joining..."
                  : !user
                    ? group.joinPolicy === "approvalRequired" ? "Sign in to request access" : "Sign in to join"
                    : group.joinPolicy === "approvalRequired"
                      ? "Request to join"
                      : "Join Group"}
            </button>
          </div>
        )}
        {(canViewGroupContent || canViewPublicSelectedEvent) && <div className="group-current-channel">{channelLabels[activeTab] || activeTab}</div>}
      </div>

      {isOffline && canViewGroupContent && (
        <div className="group-offline-banner">
          <strong>Saved group view</strong>
          <span>
            Reading last saved content{groupScreenSavedAt ? ` from ${new Date(groupScreenSavedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}. Actions are disabled until you are online.
          </span>
        </div>
      )}

      {(!user || membersLoaded) && !canViewGroupContent && !canViewPublicSelectedEvent && (
        <div className="group-panel">
          <div className="group-preview-lock">
            <div className="group-preview-title">{group.visibility === "public" ? "Public group preview" : "Private group"}</div>
            {(group.visibility === "public" || group.joinPolicy === "public") && (
              <>
                <div className="group-preview-stats">
                  <span><strong>{sortedResources.length}</strong><small>Resources</small></span>
                  {showSubGroups && <span><strong>{workGroups.length}</strong><small>Sub-groups</small></span>}
                  <span><strong>{collections.filter(item => (item.collectionType || "") === "event").length}</strong><small>Events</small></span>
                </div>
                {sortedResources.length > 0 && (
                  <div className="group-preview-section">
                    <strong>Latest group board</strong>
                    {sortedResources.slice(0, 3).map(resource => (
                      <div key={resource.id} className="group-preview-row">
                        <span>{resource.title || resource.text}</span>
                        <small>{resource.subject || "General"}</small>
                      </div>
                    ))}
                  </div>
                )}
                {showSubGroups && workGroups.length > 0 && (
                  <div className="group-preview-section">
                    <strong>Sub-groups</strong>
                    {workGroups.slice(0, 3).map(workGroup => (
                      <div key={workGroup.id} className="group-preview-row">
                        <span>{workGroup.name}</span>
                        <small>{workGroup.status === "submitted" ? "Submitted" : workGroup.deadline ? `Deadline: ${workGroup.deadline}` : "Open"}</small>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <p>
              {pendingCurrentMember
                ? "Your join request is waiting for a group leader to approve it."
                : user
                  ? "Join this group to see chats, payments, events, members, and resources."
                  : "Sign in first, then join this group to see chats, payments, events, members, and resources."}
            </p>
            <button type="button" className="group-btn primary" disabled={joiningGroup || !!pendingCurrentMember} onClick={onJoinGroup}>
              {pendingCurrentMember
                ? "Request pending"
                : !user
                  ? group.joinPolicy === "approvalRequired" ? "Sign in to request access" : "Sign in to join"
                  : group.joinPolicy === "approvalRequired"
                    ? "Request to join"
                    : "Join Group"}
            </button>
          </div>
        </div>
      )}

      {canViewGroupContent && activeTab === "overview" && (
        <div className="group-panel group-overview-panel">
          <div className="group-overview-grid">
            <button
              type="button"
              className="group-overview-card"
              style={{ position: "relative" }}
              onClick={() => {
                setPinDotSeen(true);
                switchGroupTab("chats");
              }}
            >
              {currentAction?.description && !pinDotSeen && (
                <span
                  aria-hidden="true"
                  title={currentAction.title || "Pinned update"}
                  style={{
                    position: "absolute",
                    bottom: "10px",
                    right: "10px",
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: "#2ecc71",
                    boxShadow: "0 0 0 6px rgba(46, 204, 113, 0.25)",
                  }}
                />
              )}
              <small>Latest chat</small>
              <strong>{latestMessage?.authorName || "Chat"}</strong>
              <span>{latestMessage?.text || latestMessage?.attachments?.[0]?.name || "No messages yet."}</span>
            </button>
            <button
              type="button"
              className="group-overview-card"
              onClick={() => {
                switchGroupTab("payments");
                if (activePaymentItem) openTracker(activePaymentItem.id);
              }}
            >
              <small>Latest payment</small>
              <strong>{activePaymentItem?.title || "No active payment"}</strong>
              <span>{activePaymentItem?.amount ? `${Number(activePaymentItem.amount).toLocaleString()} TSh` : activePaymentItem ? "Registration / tracking" : "Create one when members need to pay."}</span>
            </button>
            <button
              type="button"
              className="group-overview-card"
              style={!ENABLE_GROUP_FILES ? { gridColumn: "1 / -1" } : undefined}
              onClick={() => {
                switchGroupTab("events");
                if (upcomingActivity) openTracker(upcomingActivity.id);
              }}
            >
              <small>Latest activity</small>
              <strong>{upcomingActivity?.title || "No activity yet"}</strong>
              <span>{upcomingActivity?.deadline ? `Deadline: ${upcomingActivity.deadline}` : upcomingActivity?.collectionType === "order" ? "Group order" : "Events and orders live here."}</span>
            </button>
            {ENABLE_GROUP_FILES && (
              <button
                type="button"
                className="group-overview-card"
                onClick={() => {
                  switchGroupTab("resources");
                  if (latestResource?.subject) openResourceSubject((latestResource.subject || "General").trim() || "General");
                }}
              >
                <small>Latest file</small>
                <strong>{latestResource?.title || latestResource?.text || "No files yet"}</strong>
                <span>{latestResource?.subject || "Files and resources for this group."}</span>
              </button>
            )}
          </div>

          <div className="group-overview-actions">
            {primaryGroupTabs.slice(1).map(([id, label]) => (
              <button key={id} type="button" className="group-btn secondary compact" onClick={() => switchGroupTab(id)}>
                {label}
              </button>
            ))}
            <button type="button" className="group-btn ghost compact" onClick={onShareGroup}>
              Invite
            </button>
          </div>

          <div className="group-overview-members">
            <strong>{activeMembers.length || members.length || group.memberCount || 0}</strong>
            <span>members coordinating in this group</span>
          </div>
        </div>
      )}

      {canViewGroupContent && activeTab === "chats" && (
        <div
          className={`group-panel chat-panel ${isDarkMode ? "dark-mode" : "light-mode"} ${(showChatComposer || replyToMessage || showChatTools) ? "composer-open" : ""}`}
          style={{
            backgroundImage: isDarkMode
              ? `linear-gradient(rgba(11,20,26,0.85), rgba(11,20,26,0.85)), url(${process.env.PUBLIC_URL}/groupwallpaper-dark.jpeg)`
              : `linear-gradient(rgba(255,255,255,0.85), rgba(255,255,255,0.85)), url(${process.env.PUBLIC_URL}/groupwallpaper-light.jpeg)`,
          }}
        >
          {chatMessages.length === 0 ? (
            <div className="chat-empty-friendly">💬 No messages yet — say hi!</div>
          ) : (
            <div className="message-list" ref={messageListRef} onScroll={handleChatScroll}>
              {chatMessages.map((message, index) => {
                const isOwnMessage = message.authorUid === user?.uid;
                return (
                <div key={message.id} className="message-stack">
                  {(index === 0 || !sameMessageDay(chatMessages[index - 1]?.createdAt, message.createdAt)) && (
                    <div className="message-date-chip">{formatMessageDay(message.createdAt)}</div>
                  )}
                  {message.id === firstUnreadMessageId && (
                    <div className="message-unread-chip">
                      {unreadChatMessages.length} unread {unreadChatMessages.length === 1 ? "message" : "messages"}
                    </div>
                  )}
                  <div className="message-row">
                    {(() => {
                      const senderAvatarUrl = isOwnMessage ? profile.avatarUrl : membersByUid.get(message.authorUid)?.avatarUrl;
                      if (senderAvatarUrl) {
                        return <div className="message-avatar" style={{ backgroundImage: `url(${senderAvatarUrl})`, backgroundSize: "cover", backgroundPosition: "center" }} />;
                      }
                      return (
                        <div className="message-avatar" style={{ background: isOwnMessage ? "#0d9488" : getUserColor(message.authorUid) }}>
                          {isOwnMessage ? "Me" : (message.authorName || "?").trim().charAt(0).toUpperCase()}
                        </div>
                      );
                    })()}
                    <div
                    role="button"
                    tabIndex={0}
                    className={`message-bubble ${message.kind === "announcement" ? "announcement" : ""} ${message.kind === "payment_intent" ? "payment" : ""} ${(message.offlinePending || message.sending) ? "pending" : ""}`}
                    style={{ borderLeftColor: isOwnMessage ? "#0d9488" : getUserColor(message.authorUid) }}
                    onMouseDown={() => !message.offlinePending && startMessageHold(message)}
                    onMouseUp={clearMessageHold}
                    onMouseLeave={clearMessageHold}
                    onTouchStart={(e) => !message.offlinePending && startMessageHold(message, e)}
                    onTouchMove={cancelMessageHoldIfMoved}
                    onTouchEnd={clearMessageHold}
                    onTouchCancel={clearMessageHold}
                  >
                    <div className="message-author" style={{ color: isOwnMessage ? "#0d9488" : getUserColor(message.authorUid) }}>
                      {isOwnMessage ? "You" : (message.authorName || "Member")}
                      {message.pinned && (
                        <span
                          className="message-pinned-badge"
                          title="Pinned"
                          style={{ display: "inline-flex", alignItems: "center", marginLeft: "6px", color: "#0d9488", width: "13px", height: "13px", overflow: "hidden" }}
                        >
                          <span style={{ display: "inline-block", transform: "scale(0.6)", transformOrigin: "top left" }}>
                            <MenuIcon name="pin" />
                          </span>
                        </span>
                      )}
                    </div>
                    {message.replyTo && (
                      <div className="message-reply-preview">
                        <strong>{message.replyTo.authorName}</strong>
                        <span>{message.replyTo.text}</span>
                      </div>
                    )}
                    {message.kind === "payment_intent" && message.paymentIntent && (
                      <div className={`message-payment-card ${statusClass(message.paymentIntent.status)}`}>
                        <small>{message.paymentIntent.status === "paid" ? "Payment received" : message.paymentIntent.status === "failed" ? "Payment failed" : "Payment processing"}</small>
                        <strong>{message.paymentIntent.title || "Group payment"}</strong>
                        <span>{Number(message.paymentIntent.amount || 0).toLocaleString()} TSh</span>
                      </div>
                    )}
                    {message.text && <div className="message-text">{message.text}</div>}
                    {message.attachments?.length > 0 && (() => {
                      const openAttachment = (attachment) => handleOpenResourceInApp({
                        title: attachment.name,
                        text: attachment.name,
                        url: attachment.url,
                        fileName: attachment.name,
                        resourceType: attachment.resourceType || inferResourceType(attachment.name || attachment.url || ""),
                      });
                      const imageAttachments = message.attachments.filter(a => (a.resourceType || inferResourceType(a.name || a.url || "")) === "Image");
                      const fileAttachments = message.attachments.filter(a => (a.resourceType || inferResourceType(a.name || a.url || "")) !== "Image");
                      const totalImageBytes = imageAttachments.reduce((sum, a) => sum + (Number(a.size) || 0), 0);
                      return (
                        <div className="message-attachments">
                          {imageAttachments.length > 0 && (
                            <div className={`message-image-grid count-${Math.min(imageAttachments.length, 4)}`}>
                              {imageAttachments.slice(0, 4).map((attachment, attachmentIndex) => (
                                <button
                                  key={`${attachment.url || attachment.name}-${attachmentIndex}`}
                                  type="button"
                                  className="message-image-thumb"
                                  style={{ backgroundImage: `url(${attachment.url})` }}
                                  onClick={(event) => { event.stopPropagation(); openAttachment(attachment); }}
                                >
                                  {attachmentIndex === 3 && imageAttachments.length > 4 && (
                                    <span className="message-image-overlay">
                                      <MenuIcon name="down" />
                                      <small>{formatBytes(totalImageBytes)} · picha {imageAttachments.length}</small>
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                          {fileAttachments.map((attachment, attachmentIndex) => (
                            <button
                              key={`${attachment.url || attachment.name}-file-${attachmentIndex}`}
                              type="button"
                              className="message-attachment"
                              onClick={(event) => { event.stopPropagation(); openAttachment(attachment); }}
                            >
                              <span className="attachment-type-icon"><MenuIcon name="file" /></span>
                              <span className="message-attachment-meta">
                                <strong>{attachment.name || "Attachment"}</strong>
                                <span>{attachment.resourceType || inferResourceType(attachment.name || attachment.url || "") || "File"}{attachment.size ? ` · ${formatBytes(attachment.size)}` : ""}</span>
                              </span>
                              <span className="attachment-download-icon"><MenuIcon name="down" /></span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                    {message.reactions && Object.keys(message.reactions).length > 0 && (
                      <div className="message-reactions">
                        {Object.entries(
                          Object.values(message.reactions).reduce((acc, emoji) => {
                            acc[emoji] = (acc[emoji] || 0) + 1;
                            return acc;
                          }, {})
                        ).slice(0, 5).map(([emoji, count]) => (
                          <span key={emoji}>{emoji}{count > 1 ? ` ${count}` : ""}</span>
                        ))}
                      </div>
                    )}
                    <div className={`message-time ${(message.offlinePending || message.sending) ? "pending" : ""}`}>
                      {message.offlinePending ? "Pending" : message.sending ? "Sending..." : formatDate(message.createdAt)}
                    </div>
                  </div>
                  </div>
                </div>
                );
              })}
              <div ref={chatBottomRef} />
            </div>
          )}
          {memberCanChat && (
            <>
              {showJumpToLatest && (
                <button type="button" className="chat-jump-btn" aria-label="Go to latest message" onClick={scrollChatToLatest}>
                  <MenuIcon name="down" />
                </button>
              )}
              {activeMessageActions && (
                <>
                  <button type="button" className="message-action-scrim" aria-label="Close message actions" onClick={() => setActiveMessageActions(null)} />
                  <div className="message-action-sheet">
                    <div className="message-action-preview">
                      <span className="message-action-preview-author">{activeMessageActions.authorName || "Member"}</span>
                      <span className="message-action-preview-text">{(activeMessageActions.text || activeMessageActions.attachments?.[0]?.name || "Attachment").slice(0, 80)}{((activeMessageActions.text || activeMessageActions.attachments?.[0]?.name || "").length || 0) > 80 ? "..." : ""}</span>
                    </div>
                    <div className="message-action-emojis">
                      {["\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F64F}", "\u{1F525}"].map(emoji => (
                        <button key={emoji} type="button" onClick={() => handleReactToMessage(activeMessageActions, emoji)}>{emoji}</button>
                      ))}
                    </div>
                    <button type="button" className="message-action-row" onClick={() => { setReplyToMessage(activeMessageActions); setShowChatComposer(true); setActiveMessageActions(null); }}>Reply</button>
                    {memberCanManage && (
                      activeMessageActions.pinned
                        ? <button type="button" className="message-action-row" disabled={busy} onClick={() => handleUnpinMessage(activeMessageActions)}>Unpin</button>
                        : <button type="button" className="message-action-row" disabled={busy} onClick={() => handlePinMessageUpdate(activeMessageActions)}>Pin update</button>
                    )}
                    {memberCanManage && <button type="button" className="message-action-row" onClick={() => { setMessageText(activeMessageActions.text || ""); setActiveMessageActions(null); }}>Copy to composer</button>}
                    {(activeMessageActions.authorUid === user?.uid || memberCanManage) && (
                      <button type="button" className="message-action-row danger" disabled={busy} onClick={() => handleDeleteMessage(activeMessageActions)}>
                        {activeMessageActions.authorUid === user?.uid ? "Unsend" : "Delete"}
                      </button>
                    )}
                  </div>
                </>
              )}
              {!showChatComposer && !replyToMessage && !showChatTools && (
                <button
                  type="button"
                  className="chat-compose-pill"
                  aria-label="Write group message"
                  onClick={() => setShowChatComposer(true)}
                >
                  <MenuIcon name="chats" />
                </button>
              )}
              {(showChatComposer || replyToMessage || showChatTools) && (
                <>
                  <button
                    type="button"
                    className="chat-composer-dismiss"
                    aria-label="Close message composer"
                    onClick={() => { setShowChatComposer(false); setShowChatTools(false); setReplyToMessage(null); setChatAttachments([]); }}
                  />
                  <div className="chat-input-bar">
                    <input
                      ref={chatPhotoInputRef}
                      className="visually-hidden-file"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleSelectChatAttachments}
                      disabled={posting || busy}
                    />
                    <input
                      ref={chatFileInputRef}
                      className="visually-hidden-file"
                      type="file"
                      multiple
                      onChange={handleSelectChatAttachments}
                      disabled={posting || busy}
                    />
                    {replyToMessage && (
                      <div className="chat-replying">
                        <span>Replying to {replyToMessage.authorName || "Member"}</span>
                        <button type="button" aria-label="Cancel reply" onClick={() => setReplyToMessage(null)}><MenuIcon name="close" /></button>
                      </div>
                    )}
                    {showChatTools && (
                      <div className="chat-tools-menu" ref={chatToolsMenuRef}>
                        <button type="button" className="chat-tool-action" onClick={() => openChatPicker("photo")} disabled={posting || busy}>
                          <MenuIcon name="image" />
                          <span>Photo</span>
                        </button>
                        <small>Files up to {MAX_UPLOAD_FILE_MB}MB each.</small>
                      </div>
                    )}
                    {chatAttachments.length > 0 && (
                      <div className="chat-attachment-preview">
                        {chatAttachments.map((file, index) => {
                          const uploadId = chatAttachmentUploadIds[index];
                          const progress = uploadProgress[uploadId];
                          const isUploading = progress !== undefined;
                          const isImage = /^image\//.test(file.type || "") || /\.(png|jpe?g|webp|gif)$/i.test(file.name || "");
                          const ringCircumference = 2 * Math.PI * 9;
                          const ringOffset = ringCircumference * (1 - Math.min(100, Math.max(0, progress || 0)) / 100);
                          return (
                            <span key={`${file.name}-${index}`} className={isUploading ? "uploading" : ""}>
                              {isUploading ? (
                                <span className="upload-progress-ring" aria-hidden="true">
                                  <svg width="24" height="24" viewBox="0 0 24 24" style={{ transform: "rotate(-90deg)" }}>
                                    <circle cx="12" cy="12" r="9" fill="none" stroke="var(--upload-ring-track, rgba(15,110,86,0.25))" strokeWidth="2.5" />
                                    <circle cx="12" cy="12" r="9" fill="none" stroke="var(--upload-ring-active, #0f6e56)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={ringCircumference} strokeDashoffset={ringOffset} />
                                  </svg>
                                </span>
                              ) : isImage ? (
                                <span className="attachment-type-icon"><MenuIcon name="image" /></span>
                              ) : (
                                <span className="attachment-type-icon"><MenuIcon name="file" /></span>
                              )}
                              <span className="attachment-file-name">{file.name}</span>
                              {isUploading && (
                                <small className="upload-progress-text">{Math.round(progress)}%</small>
                              )}
                              <button
                                type="button"
                                className={isUploading ? "attachment-cancel-btn" : ""}
                                aria-label={isUploading ? `Cancel upload of ${file.name}` : `Remove ${file.name}`}
                                onClick={() => removeChatAttachment(index)}
                              >
                                <MenuIcon name="close" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {chatPaymentCommand?.hasFor && chatPaymentTargets.length > 0 && !selectedChatPaymentTarget && (
                      <div className="payment-suggestions-dropdown">
                        {chatPaymentTargets.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            className="payment-suggestion-item"
                            onClick={() => handleSelectChatPaymentTarget(item)}
                          >
                            <span className="payment-suggestion-icon"><MenuIcon name="payments" /></span>
                            <span>
                              <strong>{collectionDisplayTitle(item)}</strong>
                              <small>{Number(item.amount || 0).toLocaleString()} TSh · {item.collectionType === "event" ? "Event" : item.collectionType === "order" ? "Order" : "Contribution"}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {chatPaymentCommand?.hasFor && chatPaymentTargets.length === 0 && !selectedChatPaymentTarget && (
                      <div className="payment-suggestions-dropdown">
                        <div className="payment-suggestion-empty">No active payable item matches this.</div>
                      </div>
                    )}
                    {showMentionSuggestions && mentionSuggestions.length > 0 && (
                      <div className="mention-suggestions-dropdown">
                        {mentionSuggestions.map(member => (
                          <button
                            key={member.uid}
                            type="button"
                            className="mention-suggestion-item"
                            onClick={() => handleSelectMention(member)}
                          >
                            <span className="mention-suggestion-avatar" style={{ background: getUserColor(member.uid) }}>
                              {(member.name || "?").trim().charAt(0).toUpperCase()}
                            </span>
                            <span className="mention-suggestion-name">{member.name || "Member"}</span>
                            <span className="mention-suggestion-handle">@{memberMentionHandle(member)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedChatPaymentTarget && (
                      <div className="chat-payment-compose-card">
                        <button type="button" className="chat-payment-clear" aria-label="Clear payment" onClick={() => setChatPaymentTargetId("")}>
                          <MenuIcon name="close" />
                        </button>
                        <div>
                          <small>Paying</small>
                          <strong>{collectionDisplayTitle(selectedChatPaymentTarget)}</strong>
                          <span>{Number(selectedChatPaymentTarget.amount || 0).toLocaleString()} TSh</span>
                        </div>
                        {selectedChatPaymentTarget.collectionType === "order" && (selectedChatPaymentTarget.options || "").split(",").map(item => item.trim()).filter(Boolean).length > 0 && (
                          <select value={paymentData.selectedOption} onChange={event => setPaymentData({ ...paymentData, selectedOption: event.target.value })}>
                            <option value="">Choose option</option>
                            {(selectedChatPaymentTarget.options || "").split(",").map(item => item.trim()).filter(Boolean).map(option => <option key={option} value={option}>{option}</option>)}
                          </select>
                        )}
                        <div className="chat-payment-fields">
                          <select value={paymentData.provider} onChange={event => setPaymentData({ ...paymentData, provider: event.target.value })}>
                            {PAWAPAY_PROVIDERS.map(provider => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
                          </select>
                          <input value={paymentData.phone} onChange={event => setPaymentData({ ...paymentData, phone: event.target.value })} placeholder="0712345678" inputMode="tel" />
                        </div>
                      </div>
                    )}
                    {showEmojiPicker && (
                      <div className="emoji-picker-dropdown">
                        {["😀","😂","😅","😊","😍","😘","😎","🤔","😢","😭","😡","😴","👍","👎","🙏","👏","💪","🙌","🔥","💯","❤️","💚","💛","💙","✨","🎉","🎓","📌","✅","❌","⚠️","⏰","📷","📎","🎵","😇","🤝","👋","🥳","😱"].map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            className="emoji-picker-item"
                            onClick={() => setMessageText(prev => `${prev}${emoji}`)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="chat-input-row">
                      <button type="button" className="chat-plus-btn" ref={chatPlusButtonRef} aria-label="Open chat tools" onClick={() => { setShowChatComposer(true); setShowChatTools(value => !value); setShowEmojiPicker(false); }}>
                        <MenuIcon name="plus" />
                      </button>
                      <button type="button" className="chat-emoji-btn" aria-label="Emoji picker" onClick={() => { setShowChatComposer(true); setShowEmojiPicker(value => !value); }}>
                        🙂
                      </button>
                      <textarea value={messageText} onChange={event => setMessageText(event.target.value)} placeholder="use @username to tag" rows={1} autoFocus />
                      <button
                        type="button"
                        className="chat-close-btn"
                        aria-label="Close message composer"
                        onClick={() => { setShowChatComposer(false); setShowChatTools(false); setReplyToMessage(null); setChatAttachments([]); setChatPaymentTargetId(""); }}
                      >
                        <MenuIcon name="close" />
                      </button>
                      <button
                        className={`chat-send-btn ${chatPaymentMode ? "pay-mode" : ""}`}
                        type="button"
                        aria-label={chatPaymentMode ? "Pay" : "Send message"}
                        disabled={posting || (chatPaymentMode ? !selectedChatPaymentTarget : (!messageText.trim() && chatAttachments.length === 0))}
                        onClick={chatPaymentMode ? handleStartChatPayment : () => handlePost("message")}
                      >
                        {chatPaymentMode ? "Pay" : <MenuIcon name="send" />}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {canViewGroupContent && activeTab === "payments" && (
        <div className="group-panel">
          {memberCanManage && !selectedCollection && (
            <div style={{ marginBottom: 10 }}>
              <button className="group-btn primary" type="button" onClick={() => {
                if (!showTrackerForm) {
                  setTrackerData(prev => ({ ...prev, collectionType: "contribution", visibility: "groupOnly" }));
                  setShowTrackerMore(false);
                  pushGroupHistory();
                }
                setShowTrackerForm(value => !value);
              }}>
                {showTrackerForm ? "Close form" : "Create contribution"}
              </button>
            </div>
          )}

          {showTrackerForm && renderTrackerForm()}

          {paymentCollections.length === 0 ? (
            <div className="group-empty">No payment trackers yet.</div>
          ) : (
            <>
              {!selectedCollection && (
                <div className="tracker-list">
                  {paymentCollections.map(item => {
                    const needsPayment = Number(item.amount || 0) > 0;
                    const accent = collectionTypeAccent(item.collectionType);
                    return (
                      <button key={item.id} type="button" className="tracker-card" style={{ borderLeft: `4px solid ${accent.accent}` }} onClick={() => openTracker(item.id)}>
                        {item.photoUrl && <img className="tracker-card-photo" src={item.photoUrl} alt="" />}
                        <div>
                          <strong>{collectionDisplayTitle(item)}</strong>
                          <span style={{ background: accent.bg, color: accent.text }}>{item.collectionType === "event" ? "Event" : item.collectionType === "order" ? "Group order" : "Contribution"}</span>
                        </div>
                        <p>{item.description || "No description added."}</p>
                        <div className="tracker-card-meta">
                          <span>{needsPayment ? `${Number(item.amount || 0).toLocaleString()} TSh` : "Registration only"}</span>
                          {item.expectedPeople ? <span>{item.expectedPeople} expected</span> : null}
                        </div>
                        {memberCanManage && <span className="group-role-pill">Tap to view / edit</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedCollection && (
                <div className="payment-card">
                  {selectedCollection.photoUrl && <img className="tracker-card-photo" src={selectedCollection.photoUrl} alt="" />}
                  <h4>{collectionDisplayTitle(selectedCollection)}</h4>
                  <div className="payment-meta">
                    {selectedNeedsPayment ? `${(selectedCollection.amount || 0).toLocaleString()} TSh per member` : "Registration only"}
                    {selectedCollection.expectedPeople ? ` - ${selectedCollection.expectedPeople} expected` : ""}
                    {selectedCollection.paymentMethods?.length ? ` - Pay: ${selectedCollection.paymentMethods.join(" / ")}` : ""}
                  </div>
                  <div className="payment-grid">
                    {memberCanVerify ? (
                      <>
                        <div className="payment-stat"><strong>{summary.paidCount}</strong><span>Paid</span></div>
                        <div className="payment-stat"><strong>{summary.unpaidCount}</strong><span>Unpaid</span></div>
                        <div className="payment-stat"><strong>{summary.pendingCount}</strong><span>Proof to review</span></div>
                        <div className="payment-stat"><strong>{summary.totalCollected.toLocaleString()}</strong><span>TSh collected</span></div>
                      </>
                    ) : (
                      <>
                        <div className="payment-stat">
                          <span>Your status</span>
                          <strong
                            className={`payment-status-word ${myPayment?.status ? statusClass(myPayment.status) : "not-registered"}`}
                          >
                            {myPayment?.status || "Not registered"}
                          </strong>
                        </div>
                        <div className="payment-stat">
                          <span>TSh required</span>
                          <strong className="payment-required-amount">{selectedCollection?.amount ? Number(selectedCollection.amount).toLocaleString() : "0"}</strong>
                        </div>
                      </>
                    )}
                  </div>
                  {memberCanManage && (
                    <div className="group-inline-actions" style={{ marginTop: 10 }}>
                      <button className="group-btn secondary" type="button" disabled={busy} onClick={handleSendDeadlineReminder}>
                        Send deadline reminder
                      </button>
                      <button className="group-btn secondary" type="button" disabled={payments.length === 0} onClick={handleExportPayments}>
                        Export CSV
                      </button>
                      {memberCanVerify && (
                        <button className="group-btn primary" type="button" onClick={onOpenScanner}>
                          Scan QR
                        </button>
                      )}
                      <button className="group-btn ghost" type="button" disabled={busy} onClick={() => openEditTrackerForm(selectedCollection)}>
                        Edit
                      </button>
                      <button className="group-btn secondary" type="button" disabled={busy} onClick={() => handleStartNewTrackerRound(selectedCollection)}>
                        Start new round
                      </button>
                      <button className="group-btn danger" type="button" disabled={busy} onClick={() => handleDeleteTracker(selectedCollection)}>
                        Delete
                      </button>
                      {memberCanVerify && (
                        <button className="group-btn ghost" type="button" disabled={busy} onClick={() => setShowManualPaymentForm(value => !value)}>
                          Add paid person
                        </button>
                      )}
                    </div>
                  )}
                  <div className="payment-bar"><div style={{ width: `${summary.progress}%` }} /></div>
                </div>
              )}

              {selectedCollection && memberCanVerify && showManualPaymentForm && (
                <div className="payment-card">
                  <h4>Add paid person manually</h4>
                  <div className="group-field"><label>Student name *</label><input value={manualPaymentData.studentName} onChange={event => setManualPaymentData({ ...manualPaymentData, studentName: event.target.value })} placeholder="Student full name" /></div>
                  <div className="group-field"><label>Phone</label><input value={manualPaymentData.phone} onChange={event => setManualPaymentData({ ...manualPaymentData, phone: event.target.value })} placeholder="Optional" /></div>
                  <div className="group-field"><label>Amount paid</label><input type="number" value={manualPaymentData.amountPaid} onChange={event => setManualPaymentData({ ...manualPaymentData, amountPaid: event.target.value })} placeholder={String(selectedCollection.amount || "")} /></div>
                  <div className="group-field"><label>Reference / note</label><input value={manualPaymentData.paymentRef} onChange={event => setManualPaymentData({ ...manualPaymentData, paymentRef: event.target.value })} placeholder="Cash, receipt, M-Pesa ref..." /></div>
                  <div className="group-inline-actions">
                    <button className="group-btn primary" type="button" disabled={busy} onClick={handleAddManualPayment}>{busy ? "Saving..." : "Add as paid"}</button>
                    <button className="group-btn ghost" type="button" disabled={busy} onClick={() => setShowManualPaymentForm(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {selectedCollection && user && (
                <div className="payment-card">
                  <h4>{selectedCollection.collectionType === "event" ? (selectedNeedsPayment ? "Register and pay" : "Register") : "Submit payment proof"}</h4>
                  {myPayment?.proofRequested && (
                    <div className="payment-alert">{myPayment.proofRequestMessage || "Admin requested a clearer screenshot proof."}</div>
                  )}
                  {myPayment && (
                    <div className="member-payment-card">
                      <span className={`payment-pill ${statusClass(myPayment.status)}`}>{myPaymentStatusLabel || myPayment.status || "pending"}</span>
                      <strong>{myPaymentPrimaryMessage}</strong>
                      <span>{myPaymentSecondaryMessage}</span>
                      {selectedNeedsPayment && myPaymentRemaining > 0 && <span>{myPaymentRemaining.toLocaleString()} TSh remaining</span>}
                      {myPayment.paymentProofUrl && <button type="button" className="proof-thumb-btn" onClick={() => setExpandedProofUrl(myPayment.paymentProofUrl)}><img className="payment-proof-thumb" src={myPayment.paymentProofUrl} alt="Your payment proof" /></button>}
                      <details className="group-payment-qr">
                        <summary>Your QR</summary>
                        <div className="group-payment-qr-box">
                          <QRCodeSVG value={groupPaymentVerifyUrl(group.id, selectedCollection.id, myPayment.id)} size={132} bgColor="#ffffff" fgColor="#0f1b2d" level="M" />
                          <span>Show this to the treasurer on verification day.</span>
                        </div>
                      </details>
                    </div>
                  )}
                  {selectedPaidEvent && !myPayment && !showPaymentForm && (
                    <div className="group-inline-actions">
                      <button className="group-btn primary" type="button" disabled={busy} onClick={handleRegisterEvent}>Register first</button>
                      <button className="group-btn ghost" type="button" onClick={() => { setShowManualProofFields(false); setShowPaymentForm(true); }}>Pay now</button>
                    </div>
                  )}
                  {(!myPayment && !selectedPaidEvent) || showPaymentForm || myPayment?.proofRequested ? (
                    <>
                      {!selectedNeedsPayment && <div className="group-field"><label>Phone number</label><input value={paymentData.phone} onChange={event => setPaymentData({ ...paymentData, phone: event.target.value })} placeholder="Optional contact number" /></div>}
                      {selectedNeedsPayment && (
                        <>
                          {renderPawaPayChoice()}
                          {renderAzamPayChoice()}
                          {!showAzamPayOptions && !showPawaPayOptions && (
                            <>
                              <div className="payment-divider"><span>Having trouble?</span></div>
                              {!showManualProofFields ? (
                                <button className="group-btn ghost" type="button" disabled={busy} onClick={() => setShowManualProofFields(true)}>Submit proof manually</button>
                              ) : (
                                <>
                                  <div className="group-field"><label>Phone number *</label><input value={paymentData.phone} onChange={event => setPaymentData({ ...paymentData, phone: event.target.value })} /></div>
                                  <div className="group-field"><label>Amount paid *</label><input type="number" value={paymentData.amountPaid} onChange={event => setPaymentData({ ...paymentData, amountPaid: event.target.value })} placeholder={String(selectedCollection.amount || "")} /></div>
                                  <div className="group-field"><label>Sender name / reference *</label><input value={paymentData.paymentRef} onChange={event => setPaymentData({ ...paymentData, paymentRef: event.target.value })} placeholder="Transaction ID or payer name" /></div>
                                  <div className="group-field"><label>Screenshot proof {myPayment?.proofRequested ? "*" : ""}</label><input type="file" accept="image/*" onChange={event => {
                                    const file = event.target.files?.[0] || null;
                                    setPaymentData({ ...paymentData, paymentProofFile: file, paymentProofPreview: file ? URL.createObjectURL(file) : "" });
                                  }} /></div>
                                  {paymentData.paymentProofPreview && <button type="button" className="proof-thumb-btn" onClick={() => setExpandedProofUrl(paymentData.paymentProofPreview)}><img className="payment-proof-thumb large" src={paymentData.paymentProofPreview} alt="Selected payment proof preview" /></button>}
                                </>
                              )}
                            </>
                          )}
                        </>
                      )}
                      {(!selectedNeedsPayment || (showManualProofFields && !showAzamPayOptions && !showPawaPayOptions)) && <button className="group-btn primary" type="button" disabled={busy} onClick={selectedNeedsPayment ? handleSubmitPayment : handleRegisterEvent}>{myPayment ? "Update payment details" : selectedNeedsPayment ? "Submit proof" : "Register"}</button>}
                    </>
                  ) : myPayment && myPayment.status !== "paid" ? (
                    <button className="group-btn ghost" type="button" onClick={() => { setShowManualProofFields(false); setShowPaymentForm(true); }}>{selectedNeedsPayment ? (myPayment?.status === "registered" ? "Pay / submit proof" : "Resubmit proof") : "Update registration"}</button>
                  ) : null}
                </div>
              )}

              {selectedCollection && memberCanVerify && <div className="payment-card">
                <h4>People</h4>
                {payments.length > 0 && <div className="group-field"><label>Search people</label><input value={paymentSearch} onChange={event => setPaymentSearch(event.target.value)} placeholder="Search by name, phone, ref, or status" /></div>}
                {filteredPayments.length === 0 ? (
                  <div className="payment-meta">No payment proofs yet.</div>
                ) : filteredPayments.map(payment => (
                  <div key={payment.id} className="payment-row">
                    <span className={`payment-pill ${statusClass(payment.status)}`}>{payment.status || "pending"}</span>
                    <div className="payment-row-main">
                      <button type="button" className="payment-name-toggle" onClick={() => togglePaymentDetails(payment.id)}>
                        {payment.studentName || "Student"}
                      </button>
                      {expandedPaymentIds[payment.id] && (
                        <>
                          <div className="payment-detail-grid">
                            <span><small>Amount</small><strong>{(payment.amountPaid || 0).toLocaleString()} TSh</strong></span>
                            {payment.selectedOption ? <span><small>Option</small><strong>{payment.selectedOption}</strong></span> : null}
                            {selectedNeedsPayment ? <span><small>Remaining</small><strong>{Math.max(0, Number(selectedCollection.amount || 0) - Number(payment.amountPaid || 0)).toLocaleString()} TSh</strong></span> : null}
                            {payment.paymentProvider ? <span><small>Provider</small><strong>{payment.paymentProvider}</strong></span> : null}
                            {payment.phone ? <span><small>Phone</small><strong>{payment.phone}</strong></span> : null}
                            {payment.paymentRef ? <span><small>Reference</small><strong>{payment.paymentRef}</strong></span> : null}
                          </div>
                          {payment.proofRequested && <div className="payment-alert compact">{payment.proofRequestMessage || "Proof requested"}</div>}
                          {payment.paymentProofUrl && (
                            <button type="button" className="proof-thumb-btn" onClick={() => setExpandedProofUrl(payment.paymentProofUrl)}>
                              <img className="payment-proof-thumb" src={payment.paymentProofUrl} alt={`${payment.studentName || "Student"} payment proof`} />
                            </button>
                          )}
                          <details className="group-payment-qr">
                            <summary>Payment QR</summary>
                            <div className="group-payment-qr-box">
                              <QRCodeSVG
                                value={groupPaymentVerifyUrl(group.id, selectedCollection.id, payment.id)}
                                size={132}
                                bgColor="#ffffff"
                                fgColor="#0f1b2d"
                                level="M"
                              />
                              <span>Scan to verify this group payment.</span>
                            </div>
                          </details>
                          {memberCanVerify && (
                            <div className="group-inline-actions">
                              {payment.status !== "paid" && <button className="group-btn secondary" type="button" disabled={busy} onClick={() => handleVerify(payment, "paid")}>Paid</button>}
                              {payment.status !== "rejected" && <button className="group-btn ghost" type="button" disabled={busy} onClick={() => handleVerify(payment, "rejected")}>Reject</button>}
                              <button className="group-btn ghost" type="button" disabled={busy} onClick={() => handleAdjustAmount(payment)}>Adjust amount</button>
                              <button className="group-btn ghost" type="button" disabled={busy} onClick={() => handleRequestProof(payment)}>Request proof</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>}
            </>
          )}
        </div>
      )}

      {canViewGroupContent && showSubGroups && activeTab === "workgroups" && (
        <div className="group-panel">
          <div className="class-board-header">
            <div>
              <strong>Sub-groups</strong>
              <span>Create smaller class groups, assign tasks, and receive submissions.</span>
            </div>
            {memberCanManage && (
              <button type="button" className="group-btn primary compact" onClick={openCreateWorkGroupForm}>
                Add
              </button>
            )}
          </div>

          {workGroups.length === 0 ? (
            <div className="resource-box">No sub-groups yet. Leaders can create Group 01, Group 02, assign members, and collect submissions here.</div>
          ) : (
            <div className="workgroup-list">
              {workGroups.map(workGroup => {
                const isAssigned = workGroup.memberUids?.includes(user?.uid);
                const canSubmit = memberCanManage || isAssigned || workGroup.leaderUid === user?.uid;
                const isSubmitting = submittingWorkGroupId === workGroup.id;
                return (
                  <div key={workGroup.id} className="workgroup-card">
                  <div className="workgroup-card-head">
                      <div>
                        <strong>{workGroup.name}{workGroup.createdAt?.getTime?.() > openedReadAt && <span className="inline-new-pill">New</span>}</strong>
                        <span>{workGroup.memberNames?.length || workGroup.memberUids?.length || 0} members{workGroup.leaderName ? ` - Leader: ${workGroup.leaderName}` : ""}</span>
                      </div>
                      <em className={`workgroup-status ${workGroup.status === "submitted" ? "submitted" : ""}`}>{workGroup.status === "submitted" ? "Submitted" : "Open"}</em>
                    </div>
                    {workGroup.description && <p>{workGroup.description}</p>}
                    {(workGroup.taskTitle || workGroup.taskInstructions || workGroup.deadline) && (
                      <div className="workgroup-task">
                        {workGroup.taskTitle && <strong>{workGroup.taskTitle}</strong>}
                        {workGroup.taskInstructions && <span>{workGroup.taskInstructions}</span>}
                        {workGroup.deadline && <small>Deadline: {workGroup.deadline}</small>}
                      </div>
                    )}
                    {workGroup.memberNames?.length > 0 && (
                      <div className="workgroup-members">
                        {workGroup.memberNames.slice(0, 10).map(name => <span key={name}>{name}</span>)}
                        {workGroup.memberNames.length > 10 && <span>+{workGroup.memberNames.length - 10}</span>}
                      </div>
                    )}
                    {workGroup.status === "submitted" && (
                      <div className="workgroup-submission">
                        <strong>{workGroup.submissionTitle || "Submitted work"}</strong>
                        {workGroup.submissionNote && <span>{workGroup.submissionNote}</span>}
                        {workGroup.submissionUrl && <a href={workGroup.submissionUrl} target="_blank" rel="noreferrer">Open submission</a>}
                        <small>Submitted by {workGroup.submittedByName || "member"}{workGroup.submittedAt ? ` - ${formatDate(workGroup.submittedAt)}` : ""}</small>
                      </div>
                    )}
                    {canSubmit && (
                      <div className="group-inline-actions">
                        <button className="group-btn secondary" type="button" onClick={() => {
                          setSubmittingWorkGroupId(isSubmitting ? "" : workGroup.id);
                          setWorkSubmissionData(emptyWorkSubmission);
                        }}>
                          {workGroup.status === "submitted" ? "Update submission" : "Submit work"}
                        </button>
                        {workGroup.submissionUrl && <a className="group-btn ghost group-link-btn" href={workGroup.submissionUrl} target="_blank" rel="noreferrer">Open</a>}
                        {memberCanManage && <button className="group-btn ghost" type="button" onClick={() => openEditWorkGroupForm(workGroup)}>Edit</button>}
                        {memberCanManage && <button className="group-btn danger" type="button" disabled={busy} onClick={() => handleDeleteWorkGroup(workGroup)}>Delete</button>}
                      </div>
                    )}
                    {isSubmitting && (
                      <div className="workgroup-submit-box">
                        <div className="group-field"><label>Submission title</label><input value={workSubmissionData.title} onChange={event => setWorkSubmissionData({ ...workSubmissionData, title: event.target.value })} placeholder="Group 01 field report" /></div>
                        <div className="group-field"><label>Link, optional</label><input value={workSubmissionData.url} onChange={event => setWorkSubmissionData({ ...workSubmissionData, url: event.target.value })} placeholder="Drive link, PDF link, or submission URL" /></div>
                        <div className="group-field"><label>Upload file, optional</label><input type="file" onChange={event => {
                          const file = event.target.files?.[0] || null;
                          setWorkSubmissionData({ ...workSubmissionData, file, filePreview: file ? file.name : "" });
                        }} />{workSubmissionData.filePreview && <small>{workSubmissionData.filePreview}</small>}</div>
                        <div className="group-field"><label>Note</label><textarea value={workSubmissionData.note} onChange={event => setWorkSubmissionData({ ...workSubmissionData, note: event.target.value })} placeholder="Anything the class rep or lecturer should know." /></div>
                        <div className="group-inline-actions">
                          <button className="group-btn primary" type="button" disabled={busy} onClick={() => handleSubmitWork(workGroup)}>{busy ? "Submitting..." : "Submit to leader"}</button>
                          <button className="group-btn ghost" type="button" disabled={busy} onClick={() => setSubmittingWorkGroupId("")}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(canViewGroupContent || canViewPublicSelectedEvent) && activeTab === "events" && (
        <div className="group-panel">
          {memberCanManage && (
            <div className="group-inline-actions" style={{ marginBottom: 10 }}>
              <button
                className="group-btn primary"
                type="button"
                onClick={() => {
                  if (!showTrackerForm) pushGroupHistory();
                  setShowTrackerMore(false);
                  setShowTrackerForm(value => !value);
                  setTrackerData(prev => ({ ...prev, collectionType: "event", visibility: "groupOnly", amount: "" }));
                }}
              >
                {showTrackerForm ? "Close form" : "Create event"}
              </button>
              <button
                className="group-btn secondary"
                type="button"
                onClick={() => {
                  if (!showTrackerForm) pushGroupHistory();
                  setShowTrackerMore(false);
                  setShowTrackerForm(true);
                  setTrackerData(prev => ({ ...prev, collectionType: "order", visibility: "groupOnly", amount: prev.amount || "" }));
                }}
              >
                Create order
              </button>
            </div>
          )}
          {showTrackerForm && renderTrackerForm()}
          {selectedCollection && ["event", "order"].includes(selectedCollection.collectionType) && (
            <>
              <button className="group-btn ghost" type="button" style={{ marginBottom: 10 }} onClick={() => {
                if (groupNavDepth.current > 0) {
                  window.history.back();
                  return;
                }
                setSelectedCollectionId("");
                setShowPaymentForm(false);
                setPayments([]);
              }}>Back to events</button>
              <div className="payment-card">
                {(selectedCollection.photoUrl || pendingEventPhotoPreviews[selectedCollection.id]) && <img className="tracker-card-photo" src={selectedCollection.photoUrl || pendingEventPhotoPreviews[selectedCollection.id]} alt="" />}
                {eventPosterStatus(selectedCollection) && <div className={`tracker-photo-status ${eventPosterStatus(selectedCollection).kind}`}>{eventPosterStatus(selectedCollection).text}</div>}
                <h4>{collectionDisplayTitle(selectedCollection)}</h4>
                <div className="payment-meta">
                  {selectedCollection.description || (selectedGroupOrder ? "Order details" : "Event details")}
                  {selectedCollection.deadline ? ` - Deadline: ${selectedCollection.deadline}` : ""}
                  {Number(selectedCollection.amount || 0) > 0 ? ` - ${Number(selectedCollection.amount || 0).toLocaleString()} TSh` : selectedGroupOrder ? " - Price not set" : " - Free registration"}
                  {selectedGroupOrder && selectedCollection.options ? ` - Options: ${selectedCollection.options}` : ""}
                </div>
                {memberCanManage && (
                  <div className="group-inline-actions" style={{ marginTop: 10 }}>
                    <button className="group-btn secondary" type="button" disabled={busy} onClick={handleSendDeadlineReminder}>
                      Send deadline reminder
                    </button>
                    {memberCanVerify && (
                      <button className="group-btn primary" type="button" onClick={onOpenScanner}>
                        Scan QR
                      </button>
                    )}
                    <button className="group-btn ghost" type="button" disabled={busy} onClick={() => openEditTrackerForm(selectedCollection)}>
                      Edit
                    </button>
                    <button className="group-btn secondary" type="button" disabled={busy} onClick={() => handleStartNewTrackerRound(selectedCollection)}>
                      Start new round
                    </button>
                    <button className="group-btn danger" type="button" disabled={busy} onClick={() => handleDeleteTracker(selectedCollection)}>
                      Delete
                    </button>
                    {memberCanVerify && selectedNeedsPayment && (
                      <button className="group-btn ghost" type="button" disabled={busy} onClick={() => setShowManualPaymentForm(value => !value)}>
                        Add paid person
                      </button>
                    )}
                  </div>
                )}
              </div>
              {memberCanVerify && selectedNeedsPayment && showManualPaymentForm && (
                <div className="payment-card">
                  <h4>Add paid person manually</h4>
                  <div className="group-field"><label>Student name *</label><input value={manualPaymentData.studentName} onChange={event => setManualPaymentData({ ...manualPaymentData, studentName: event.target.value })} placeholder="Student full name" /></div>
                  <div className="group-field"><label>Phone</label><input value={manualPaymentData.phone} onChange={event => setManualPaymentData({ ...manualPaymentData, phone: event.target.value })} placeholder="Optional" /></div>
                  <div className="group-field"><label>Amount paid</label><input type="number" value={manualPaymentData.amountPaid} onChange={event => setManualPaymentData({ ...manualPaymentData, amountPaid: event.target.value })} placeholder={String(selectedCollection.amount || "")} /></div>
                  <div className="group-field"><label>Reference / note</label><input value={manualPaymentData.paymentRef} onChange={event => setManualPaymentData({ ...manualPaymentData, paymentRef: event.target.value })} placeholder="Cash, receipt, M-Pesa ref..." /></div>
                  <div className="group-inline-actions">
                    <button className="group-btn primary" type="button" disabled={busy} onClick={handleAddManualPayment}>{busy ? "Saving..." : "Add as paid"}</button>
                    <button className="group-btn ghost" type="button" disabled={busy} onClick={() => setShowManualPaymentForm(false)}>Cancel</button>
                  </div>
                </div>
              )}
              {user && (
                <div className="payment-card">
                  <h4>{selectedGroupOrder ? "Place order" : selectedNeedsPayment ? "Pay for event" : "Register"}</h4>
                  {myPayment && (
                    <div className="member-payment-card">
                      <span className={`payment-pill ${statusClass(myPayment.status)}`}>{myPaymentStatusLabel || myPayment.status || "pending"}</span>
                      <strong>{myPaymentPrimaryMessage}</strong>
                      {myPayment.selectedOption && <span>Option: {myPayment.selectedOption}</span>}
                      <span>{myPaymentSecondaryMessage}</span>
                      {selectedNeedsPayment && myPaymentRemaining > 0 && <span>{myPaymentRemaining.toLocaleString()} TSh remaining</span>}
                      <details className="group-payment-qr">
                        <summary>{selectedNeedsPayment ? "Payment QR" : "Registration QR"}</summary>
                        <div className="group-payment-qr-box">
                          <QRCodeSVG value={groupPaymentVerifyUrl(group.id, selectedCollection.id, myPayment.id)} size={132} bgColor="#ffffff" fgColor="#0f1b2d" level="M" />
                          <span>{selectedNeedsPayment ? "Show this to the treasurer on verification day." : "Show this at the event entrance."}</span>
                        </div>
                      </details>
                    </div>
                  )}
                  {selectedPaidEvent && !myPayment && !showPaymentForm && (
                    <div className="group-inline-actions">
                      <button className="group-btn primary" type="button" disabled={busy} onClick={handleRegisterEvent}>Register first</button>
                      <button className="group-btn ghost" type="button" onClick={() => { setShowManualProofFields(false); setShowPaymentForm(true); }}>Pay now</button>
                    </div>
                  )}
                  {selectedGroupOrder && myPayment && !showPaymentForm && myPayment.status !== "paid" && (
                    <button className="group-btn primary" type="button" onClick={() => { setShowManualProofFields(true); setShowPaymentForm(true); }}>Submit payment proof</button>
                  )}
                  {selectedGroupOrder && !myPayment && !showPaymentForm ? (
                    <>
                      {renderPawaPayChoice({ includeOrderOption: true })}
                      {renderAzamPayChoice({ includeOrderOption: true })}
                      {!showAzamPayOptions && !showPawaPayOptions && (
                        <>
                          <div className="payment-divider"><span>or place order without paying now</span></div>
                          {selectedOrderOptions.length > 0 && (
                            <div className="group-field"><label>Choose option / size *</label><select value={paymentData.selectedOption} onChange={event => setPaymentData({ ...paymentData, selectedOption: event.target.value })}><option value="">Choose option</option>{selectedOrderOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></div>
                          )}
                          <div className="group-field"><label>Phone number</label><input value={paymentData.phone} onChange={event => setPaymentData({ ...paymentData, phone: event.target.value })} placeholder="Optional contact number" /></div>
                          <button className="group-btn primary" type="button" disabled={busy} onClick={handleRegisterEvent}>{busy ? "Placing..." : "Place order"}</button>
                        </>
                      )}
                    </>
                  ) : (!myPayment && !selectedPaidEvent) || showPaymentForm || myPayment?.proofRequested ? (
                    <>
                      {!selectedNeedsPayment && <div className="group-field"><label>Phone number</label><input value={paymentData.phone} onChange={event => setPaymentData({ ...paymentData, phone: event.target.value })} placeholder="Optional contact number" /></div>}
                      {selectedNeedsPayment && (
                        <>
                          {selectedGroupOrder && selectedOrderOptions.length > 0 && (
                            <div className="group-field"><label>Choose option / size *</label><select value={paymentData.selectedOption} onChange={event => setPaymentData({ ...paymentData, selectedOption: event.target.value })}><option value="">Choose option</option>{selectedOrderOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></div>
                          )}
                          {renderPawaPayChoice()}
                          {renderAzamPayChoice()}
                          {!showAzamPayOptions && !showPawaPayOptions && (
                            <>
                              <div className="payment-divider"><span>Having trouble?</span></div>
                              {!showManualProofFields ? (
                                <button className="group-btn ghost" type="button" disabled={busy} onClick={() => setShowManualProofFields(true)}>Submit proof manually</button>
                              ) : (
                                <>
                                  <div className="group-field"><label>Phone number *</label><input value={paymentData.phone} onChange={event => setPaymentData({ ...paymentData, phone: event.target.value })} /></div>
                                  <div className="group-field"><label>Amount paid *</label><input type="number" value={paymentData.amountPaid} onChange={event => setPaymentData({ ...paymentData, amountPaid: event.target.value })} placeholder={String(selectedCollection.amount || "")} /></div>
                                  <div className="group-field"><label>Sender name / reference *</label><input value={paymentData.paymentRef} onChange={event => setPaymentData({ ...paymentData, paymentRef: event.target.value })} placeholder="Transaction ID or payer name" /></div>
                                  <div className="group-field"><label>Screenshot proof {myPayment?.proofRequested ? "*" : ""}</label><input type="file" accept="image/*" onChange={event => {
                                    const file = event.target.files?.[0] || null;
                                    setPaymentData({ ...paymentData, paymentProofFile: file, paymentProofPreview: file ? URL.createObjectURL(file) : "" });
                                  }} /></div>
                                </>
                              )}
                            </>
                          )}
                        </>
                      )}
                      {(!selectedNeedsPayment || (showManualProofFields && !showAzamPayOptions && !showPawaPayOptions)) && <button className="group-btn primary" type="button" disabled={busy} onClick={selectedNeedsPayment ? handleSubmitPayment : handleRegisterEvent}>{myPayment ? "Submit / update payment proof" : selectedGroupOrder ? "Submit order proof" : selectedNeedsPayment ? "Submit proof" : "Register"}</button>}
                    </>
                  ) : myPayment && myPayment.status !== "paid" ? (
                    <button className="group-btn ghost" type="button" onClick={() => { setShowManualProofFields(false); setShowPaymentForm(true); }}>{selectedGroupOrder ? "Update order / proof" : selectedNeedsPayment ? (myPayment?.status === "registered" ? "Pay / submit proof" : "Resubmit proof") : "Update registration"}</button>
                  ) : null}
                </div>
              )}
              {!user && (
                <div className="payment-card">
                  <h4>{selectedGroupOrder ? "Sign in to order" : selectedNeedsPayment ? "Register, then pay" : "Register"}</h4>
                  <div className="payment-meta">{selectedGroupOrder ? "Sign in to place an order. You can submit payment proof later." : "Sign in to register for this public event. You can pay later if payment is required."}</div>
                  <button className="group-btn primary" type="button" onClick={onJoinGroup} style={{ marginTop: 10 }}>
                    Sign in to register
                  </button>
                </div>
              )}
              {memberCanVerify && (
                <div className="payment-card">
                  <h4>People</h4>
                  {payments.length > 0 && <div className="group-field"><label>Search people</label><input value={paymentSearch} onChange={event => setPaymentSearch(event.target.value)} placeholder="Search by name, phone, ref, or status" /></div>}
                  {filteredPayments.length === 0 ? <div className="payment-meta">No registrations yet.</div> : filteredPayments.map(payment => (
                    <div key={payment.id} className="payment-row">
                      <span className={`payment-pill ${statusClass(payment.status)}`}>{payment.status || "pending"}</span>
                      <div className="payment-row-main">
                        <button type="button" className="payment-name-toggle" onClick={() => togglePaymentDetails(payment.id)}>
                          {payment.studentName || "Student"}
                        </button>
                        {expandedPaymentIds[payment.id] && (
                          <>
                            <div className="payment-detail-grid">
                              <span><small>Amount</small><strong>{(payment.amountPaid || 0).toLocaleString()} TSh</strong></span>
                              {payment.selectedOption ? <span><small>Option</small><strong>{payment.selectedOption}</strong></span> : null}
                              {selectedNeedsPayment ? <span><small>Remaining</small><strong>{Math.max(0, Number(selectedCollection.amount || 0) - Number(payment.amountPaid || 0)).toLocaleString()} TSh</strong></span> : null}
                              {payment.paymentProvider ? <span><small>Provider</small><strong>{payment.paymentProvider}</strong></span> : null}
                              {payment.phone ? <span><small>Phone</small><strong>{payment.phone}</strong></span> : null}
                              {payment.paymentRef ? <span><small>Reference</small><strong>{payment.paymentRef}</strong></span> : null}
                            </div>
                            {memberCanVerify && (
                              <div className="group-inline-actions">
                                {payment.status !== "paid" && <button className="group-btn secondary" type="button" disabled={busy} onClick={() => handleVerify(payment, "paid")}>Paid</button>}
                                {payment.status !== "rejected" && <button className="group-btn ghost" type="button" disabled={busy} onClick={() => handleVerify(payment, "rejected")}>Reject</button>}
                                <button className="group-btn ghost" type="button" disabled={busy} onClick={() => handleAdjustAmount(payment)}>Adjust amount</button>
                                <button className="group-btn ghost" type="button" disabled={busy} onClick={() => handleRequestProof(payment)}>Request proof</button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {!selectedCollection && eventCollections.length === 0 ? (
            <div className="group-empty">No events yet.</div>
          ) : visibleEventCollections.map(eventItem => (
            <div key={eventItem.id} className="tracker-card event-card">
              {(eventItem.photoUrl || pendingEventPhotoPreviews[eventItem.id]) && <img className="tracker-card-photo" src={eventItem.photoUrl || pendingEventPhotoPreviews[eventItem.id]} alt="" />}
              {eventPosterStatus(eventItem) && <div className={`tracker-photo-status ${eventPosterStatus(eventItem).kind}`}>{eventPosterStatus(eventItem).text}</div>}
              <div>
                <strong>{collectionDisplayTitle(eventItem)}</strong>
                <span>{Number(eventItem.amount || 0) > 0 ? `${Number(eventItem.amount || 0).toLocaleString()} TSh` : eventItem.collectionType === "order" ? "Price not set" : "Free"}</span>
              </div>
              {eventItem.collectionType === "order" && <span className="group-role-pill">Group order</span>}
              {Number(eventItem.amount || 0) > 0 && <span className="group-role-pill">Also in payments</span>}
              <p>
                {eventItem.description || "Event details"}
                {eventItem.deadline ? ` - Deadline: ${eventItem.deadline}` : ""}
                {eventItem.collectionType === "order" && eventItem.options ? ` - Options: ${eventItem.options}` : ""}
              </p>
              {memberCanManage && <span className="group-role-pill">Tap to view / edit</span>}
              <button
                className="group-btn secondary"
                type="button"
                onClick={() => {
                  openTracker(eventItem.id);
                }}
                style={{ marginTop: 10 }}
              >
                {eventItem.collectionType === "order" ? "Place order" : "View"}
              </button>
            </div>
          ))}
        </div>
      )}

      {canViewGroupContent && activeTab === "members" && (
        <div className="group-panel">
          {members.length === 0 ? (
            <div className="group-empty">No members loaded yet.</div>
          ) : (
            <>
              {memberCanEditGroup && (
                <div className="member-admin-box">
                  <div className="member-name">Tag permissions</div>
                  <div className="member-role">Choose who can notify people using @tags.</div>
                  <select
                    className="member-role-select wide"
                    value={mentionPermission}
                    disabled={busy}
                    onChange={event => handleMentionPermissionChange(event.target.value)}
                  >
                    <option value="admins">Owner/admin/treasurer only</option>
                    <option value="all">Everyone can tag</option>
                  </select>
                </div>
              )}
              {memberCanEditGroup && pendingMembers.length > 0 && (
                <div className="member-admin-box">
                  <div className="member-name">Join requests</div>
                  <div className="member-role">Approve students who requested access to this group.</div>
                  {pendingMembers.map(member => (
                    <div key={member.uid || member.id} className="member-request-row">
                      <div className="group-avatar" style={{ width: 34, height: 34, fontSize: 11, backgroundImage: member.avatarUrl ? `url(${member.avatarUrl})` : undefined, backgroundSize: "cover" }}>
                        {!member.avatarUrl && groupAvatarText(memberDisplayName(member))}
                      </div>
                      <div className="member-meta">
                        <div className="member-name">{memberDisplayName(member)}</div>
                        <div className="member-role">Requested to join{memberCanSeePhone && member.phone ? ` - ${member.phone}` : ""}</div>
                      </div>
                      <button type="button" className="group-btn secondary compact" disabled={busy} onClick={() => handleApproveMember(member)}>Approve</button>
                      <button type="button" className="group-btn ghost compact" disabled={busy} onClick={() => handleRejectMember(member)}>Reject</button>
                    </div>
                  ))}
                </div>
              )}
              {activeMembers.map(member => (
                <div key={member.uid || member.id} className="member-row">
                  <div className="group-avatar" style={{ width: 38, height: 38, fontSize: 12, backgroundImage: member.avatarUrl ? `url(${member.avatarUrl})` : undefined, backgroundSize: "cover" }}>
                    {!member.avatarUrl && groupAvatarText(memberDisplayName(member))}
                  </div>
                  <div className="member-meta">
                    <div className="member-name">{memberDisplayName(member)}</div>
                    <div className="member-role">{member.role || "member"}{memberCanSeePhone && member.phone ? ` - ${member.phone}` : ""}</div>
                  </div>
                  <div className="member-actions">
                    {member.uid !== user?.uid && (
                      <button
                        type="button"
                        className="group-btn secondary compact"
                        disabled={busy}
                        onClick={() => onMessageMember?.(member, group)}
                      >
                        Message
                      </button>
                    )}
                    {memberCanEditGroup && member.role !== "owner" ? (
                      <select className="member-role-select" value={member.role || "member"} disabled={busy} onChange={event => handleRoleChange(member, event.target.value)}>
                        {GROUP_ROLES.filter(role => role !== "owner").map(role => <option key={role} value={role}>{role}</option>)}
                      </select>
                    ) : (
                      <span className="group-role-pill">{member.role || "member"}</span>
                    )}
                    {memberCanEditGroup && member.role !== "owner" && (
                      <div className="member-menu-wrap">
                        <button type="button" className="member-menu-btn" aria-label={`Manage ${memberDisplayName(member)}`} onClick={() => setMemberActionMenuId(value => value === member.uid ? "" : member.uid)}>
                          <MenuIcon name="more" />
                        </button>
                        {memberActionMenuId === member.uid && (
                          <div className="member-menu">
                            <button type="button" disabled={busy} onClick={() => handleMemberStatusAction(member, "removed")}>Remove member</button>
                            <button type="button" disabled={busy} onClick={() => handleMemberStatusAction(member, "blocked")}>Block member</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {canViewGroupContent && activeTab === "resources" && (
        <div className="group-panel">
          <div className="class-board-header">
            <div>
              <strong>Group Board</strong>
              <span>Organized links, resources, deadlines, and files for this group.</span>
            </div>
            {memberCanManage && (
              <button type="button" className="group-btn primary compact" onClick={openResourceAddMenu}>
                Add
              </button>
            )}
          </div>
          {visibleSortedResources.length > 0 && (
            <div className="class-board-latest">
              <div className="group-section-title">Latest updates</div>
              {visibleSortedResources.slice(0, 3).map(resource => (
                <button key={resource.id} type="button" className="class-board-update" onClick={() => openResourceSubject((resource.subject || "General").trim() || "General")}>
                  <strong>{resource.title || resource.text}</strong>
                  <span>{resource.subject || "General"}{resource.topic ? ` - ${resource.topic}` : ""}</span>
                </button>
              ))}
            </div>
          )}
          {savedOfflineResourceList.length > 0 && (
            <div className="saved-files-panel">
              <div className="saved-files-head">
                <div>
                  <strong>Saved files</strong>
                  <span>{savedOfflineResourceList.length} available on this device</span>
                </div>
              </div>
              <div className="saved-files-grid">
                {Object.entries(savedOfflineResourceGroups).map(([section, items]) => (
                  <div key={section} className="saved-files-section">
                    <div className="saved-files-section-title">
                      <strong>{section}</strong>
                      <span>{items.length}</span>
                    </div>
                    {items.map(resource => (
                      <div key={resource.id} className="saved-file-row">
                        <button type="button" onClick={() => handleOpenSavedResource(resource)}>
                          <strong>{resource.title || resource.fileName || "Saved file"}</strong>
                          <span>
                            {resource.subject || "Saved"}
                            {resource.savedAt ? ` - ${new Date(resource.savedAt).toLocaleDateString()}` : ""}
                          </span>
                        </button>
                        <button type="button" className="saved-file-remove" aria-label="Remove saved file" onClick={() => handleRemoveSavedResource(resource)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          {sortedResources.length === 0 ? (
            <div className="resource-box">No folders yet. Create a folder, then add files or links inside it.</div>
          ) : selectedResourceSubject ? (
            <div className="class-board-subject">
              <div className="class-board-folder-header">
                <button type="button" className="group-btn resource-back-btn compact" onClick={() => setSelectedResourceSubject("")}>Back</button>
                <div>
                  <strong>{selectedResourceSubject}</strong>
                  <span>{selectedResourceItems.length} {selectedResourceItems.length === 1 ? "resource" : "resources"}</span>
                </div>
                <div className="class-board-sort">
                  <button type="button" className={resourceSortMode === "latest" ? "active" : ""} onClick={() => setResourceSortMode("latest")}>Latest</button>
                  <button type="button" className={resourceSortMode === "alpha" ? "active" : ""} onClick={() => setResourceSortMode("alpha")}>A-Z</button>
                </div>
                {memberCanManage && (
                  <button type="button" className="group-btn primary compact" disabled={busy} onClick={openResourceAddMenu}>
                    + Add
                  </button>
                )}
              </div>
              {selectedResourceItems.length > 0 || resourceFolderSearchQ ? (
                <div className="resource-folder-search">
                  <input
                    type="text"
                    value={resourceFolderSearchQ}
                    onChange={event => setResourceFolderSearchQ(event.target.value)}
                    placeholder="Search files in this folder..."
                  />
                </div>
              ) : null}
              {selectedResourceItems.length === 0 ? (
                resourceFolderSearchQ ? (
                  <div className="resource-box">No files match "{resourceFolderSearchQ}".</div>
                ) : (
                <div className="resource-box">
                  This folder is empty.
                  {memberCanManage && (
                    <button type="button" className="group-btn primary compact" disabled={busy} onClick={openResourceAddMenu}>
                      Add files or links
                    </button>
                  )}
                </div>
                )
              ) : (
                selectedResourceItems.map(resource => {
                  const badge = resourceBadgeInfo(resource);
                  let linkDomain = "";
                  if (badge.isLink && resource.url) {
                    try { linkDomain = new URL(resource.url).hostname.replace(/^www\./, ""); } catch (e) { linkDomain = resource.url; }
                  }
                  return (
                  <div key={resource.id} className="resource-box class-board-resource">
                    <div className="resource-file-row">
                      {badge.isImage ? (
                        <div className="resource-thumb" style={{ backgroundImage: resource.url ? `url(${resource.url})` : undefined }}>
                          {!resource.url && <MenuIcon name="image" />}
                        </div>
                      ) : (
                        <div className="resource-file-badge" style={{ background: badge.bg }}>
                          <MenuIcon name={badge.icon} />
                          <span>{badge.label}</span>
                        </div>
                      )}
                      <div className="resource-file-info">
                        <div className="resource-title">{resource.title || resource.text}{resource.createdAt?.getTime?.() > openedReadAt && <span className="inline-new-pill">New</span>}</div>
                        {badge.isLink && linkDomain && <div className="resource-link-domain">{linkDomain}</div>}
                        {!badge.isLink && !badge.isImage && resource.size > 0 && <div className="resource-file-size">{formatBytes(resource.size)}</div>}
                      </div>
                    </div>
                    {resource.topic && <div className="class-board-topic">{resource.topic}</div>}
                    {(resource.description || (resource.text && resource.title && resource.text !== resource.title)) && (
                      <div className="resource-text">{resource.description || resource.text}</div>
                    )}
                    <div className="class-board-meta">
                      {resource.resourceType && <span>{resource.resourceType}</span>}
                      {resource.deadline && <span>Deadline: {resource.deadline}</span>}
                      {resource.createdAt && <span>Added {formatDate(resource.createdAt)}</span>}
                    </div>
                    <div className="group-inline-actions">
                      {resource.url && <button className="group-btn secondary group-link-btn" type="button" onClick={() => handleOpenResourceInApp(resource)}>Open</button>}
                      {resource.url && !savedOfflineResources[resource.id] && (
                        <button
                          className="group-btn ghost"
                          type="button"
                          disabled={savingOfflineResourceId === resource.id}
                          onClick={() => handleSaveResourceOffline(resource)}
                        >
                          {savingOfflineResourceId === resource.id ? "Saving..." : "Save offline"}
                        </button>
                      )}
                      {resource.url && savedOfflineResources[resource.id] && (
                        <button
                          className="group-btn saved-offline"
                          type="button"
                          onClick={() => handleOpenSavedResource(resource)}
                        >
                          Open saved
                        </button>
                      )}
                      {memberCanManage && <button className="group-btn ghost" type="button" onClick={() => openEditResourceForm(resource)}>Edit</button>}
                      {memberCanManage && <button className="group-btn danger" type="button" disabled={busy} onClick={() => handleDeleteResource(resource)}>Delete</button>}
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="class-board-folder-grid">
              {resourceSubjectEntries.map(([subject, items]) => {
                const realItems = items.filter(resource => resource.resourceType !== "Folder");
                const latest = realItems[0];
                return (
                  <button key={subject} type="button" className="class-board-folder-card" onClick={() => openResourceSubject(subject)}>
                    <div className="class-board-folder-icon"><MenuIcon name="folder" /></div>
                    <strong>{subject}</strong>
                    <span>{realItems.length} {realItems.length === 1 ? "resource" : "resources"}</span>
                    {latest && <small>Latest: {latest.title || latest.text}</small>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showResourceAddMenu && (
        <div className="group-modal-backdrop" onClick={() => setShowResourceAddMenu(false)}>
          <div className="group-modal resource-add-menu" onClick={event => event.stopPropagation()}>
            <h3>{selectedResourceSubject ? `Add to ${selectedResourceSubject}` : "Add to Group Board"}</h3>
            <div className="resource-add-grid">
              {!selectedResourceSubject ? (
                <button type="button" onClick={handleCreateResourceFolder} disabled={busy}>
                  <MenuIcon name="folder" />
                  <strong>Create folder</strong>
                  <span>Start an empty folder such as Topographical Surveying.</span>
                </button>
              ) : (
                <>
                  <label className={busy ? "disabled" : ""}>
                    <MenuIcon name="file" />
                    <strong>Add files</strong>
                    <span>Choose PDFs, docs, slides, sheets, images, or zip files.</span>
                    <input
                      type="file"
                      multiple
                      accept={RESOURCE_FILE_ACCEPT}
                      onChange={handleSelectSimpleResourceFiles}
                      disabled={busy}
                    />
                  </label>
                  <button type="button" onClick={() => openSimpleResourceForm("link")} disabled={busy}>
                    <MenuIcon name="link" />
                    <strong>Add link</strong>
                    <span>Use this for exact Drive links or large files.</span>
                  </button>
                  <button type="button" onClick={() => openCreateResourceForm(selectedResourceSubject)} disabled={busy}>
                    <MenuIcon name="plus" />
                    <strong>Advanced</strong>
                    <span>Add title, topic, type, deadline, and description.</span>
                  </button>
                </>
              )}
            </div>
            <div className="group-inline-actions">
              <button className="group-btn ghost" type="button" onClick={() => setShowResourceAddMenu(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showSimpleResourceForm && (
        <div className="group-modal-backdrop" onClick={() => setShowSimpleResourceForm(false)}>
          <div className="group-modal" onClick={event => event.stopPropagation()}>
            <h3>{simpleResourceData.mode === "link" ? "Add link" : "Add files"}</h3>
            {!selectedResourceSubject && (
              <div className="group-field">
                <label>Folder name</label>
                <input
                  value={simpleResourceData.subject}
                  onChange={event => setSimpleResourceData(prev => ({ ...prev, subject: event.target.value }))}
                  placeholder="Topographical Surveying"
                />
              </div>
            )}
            {simpleResourceData.mode === "link" ? (
              <div className="group-field">
                <label>File / Drive link</label>
                <input
                  value={simpleResourceData.url}
                  onChange={event => setSimpleResourceData(prev => ({ ...prev, url: event.target.value }))}
                  placeholder="Paste exact file link or large-file Drive link"
                />
              </div>
            ) : (
              <div className="group-field">
                <label>Files</label>
                <label className="upload-drop-btn">
                  <MenuIcon name="file" />
                  <span>{simpleResourceData.files.length > 0 ? "Choose different files" : "Choose files"}</span>
                  <input
                    type="file"
                    multiple
                    accept={RESOURCE_FILE_ACCEPT}
                    onChange={handleSelectSimpleResourceFiles}
                  />
                </label>
                <small className="field-hint">PDF, DOCX, PPTX, spreadsheets, CSV, or images only. Up to {MAX_UPLOAD_FILE_MB}MB each.</small>
                {simpleResourceData.files.length > 0 && (
                  <div className="selected-file-list">
                    {simpleResourceData.files.map((file, index) => (
                      <span key={`${file.name}-${index}`}>
                        {file.name}
                        <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeSimpleResourceFile(index)}>
                          <MenuIcon name="close" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="group-inline-actions">
              {busy && groupUploadStatus && <div className="group-upload-status full">{groupUploadStatus}</div>}
              <button className="group-btn primary" type="button" disabled={busy} onClick={handleSaveSimpleResource}>
                {busy ? (groupUploadStatus || "Saving...") : simpleResourceData.mode === "link" ? "Add link" : "Add files"}
              </button>
              <button className="group-btn ghost" type="button" disabled={busy} onClick={() => setShowSimpleResourceForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showResourceForm && (
        <div className="group-modal-backdrop" onClick={() => setShowResourceForm(false)}>
          <div className="group-modal" onClick={event => event.stopPropagation()}>
            <h3>{editingResourceId ? "Edit Board Resource" : "Advanced Resource"}</h3>
            <div className="group-field">
              <label>Title</label>
              <input value={resourceData.title} onChange={event => setResourceData({ ...resourceData, title: event.target.value })} placeholder="Resection notes, Sunday program, or meeting file" />
            </div>
            {(!selectedResourceSubject || editingResourceId) && (
              <div className="group-field">
                <label>Category / folder</label>
                <input value={resourceData.subject} onChange={event => setResourceData({ ...resourceData, subject: event.target.value })} placeholder="Topographical Surveying, Choir, Events" />
              </div>
            )}
            <div className="group-field">
              <label>Topic / item</label>
              <input value={resourceData.topic} onChange={event => setResourceData({ ...resourceData, topic: event.target.value })} placeholder="Week 4, Sunday service, or meeting agenda" />
            </div>
            <div className="group-field">
              <label>Link</label>
              <input value={resourceData.url} onChange={event => {
                const url = event.target.value;
                setResourceData(prev => ({ ...prev, url, resourceType: prev.resourceType || inferResourceType(url) }));
              }} placeholder="Google Drive, PDF, YouTube, or any resource link" />
            </div>
            <div className="group-field">
              <label>Upload file</label>
              <label className="upload-drop-btn">
                <MenuIcon name="file" />
                <span>{resourceData.files?.length || resourceData.fileName ? "Choose different file" : "Choose file"}</span>
                <input type="file" multiple={!editingResourceId} onChange={event => selectResourceDataFiles(Array.from(event.target.files || []))} />
              </label>
              <small className="field-hint">PDF, DOCX, PPTX, spreadsheets, CSV, or images only. Up to {MAX_UPLOAD_FILE_MB}MB each.</small>
              {(resourceData.files?.length || resourceData.fileName) && (
                <div className="selected-file-list">
                  {(resourceData.files?.length ? resourceData.files : [{ name: resourceData.fileName }]).map((file, index) => (
                    <span key={`${file.name}-${index}`}>
                      {file.name}
                      {resourceData.files?.length > 0 && (
                        <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeResourceDataFile(index)}>
                          <MenuIcon name="close" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="group-field">
              <label>Type</label>
              <select value={resourceData.resourceType} onChange={event => setResourceData({ ...resourceData, resourceType: event.target.value })}>
                <option value="">Auto / not sure</option>
                <option value="Drive folder">Drive folder</option>
                <option value="Drive file">Drive file</option>
                <option value="PPT">PPT</option>
                <option value="PDF">PDF</option>
                <option value="DOC">DOC</option>
                <option value="Sheet">Sheet</option>
                <option value="Image">Image</option>
                <option value="Video">Video</option>
                <option value="Assignment">Assignment</option>
                <option value="Past paper">Past paper</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="group-field">
              <label>Deadline, optional</label>
              <input type="date" value={resourceData.deadline} onChange={event => setResourceData({ ...resourceData, deadline: event.target.value })} />
            </div>
            <div className="group-field">
              <label>Description</label>
              <textarea value={resourceData.description} onChange={event => setResourceData({ ...resourceData, description: event.target.value })} placeholder="What changed, who should read it, or where it belongs." />
            </div>
            <div className="group-inline-actions">
              <button className="group-btn primary" type="button" disabled={busy} onClick={handleSaveResource}>
                {busy ? "Saving..." : editingResourceId ? "Update resource" : "Save resource"}
              </button>
              <button className="group-btn ghost" type="button" disabled={busy} onClick={() => { setShowResourceForm(false); setEditingResourceId(""); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showWorkGroupForm && (
        <div className="group-modal-backdrop" onClick={() => { setShowWorkGroupForm(false); setEditingWorkGroupId(""); setShowWorkGroupMembers(false); setShowWorkGroupMore(false); }}>
          <div className="group-modal" onClick={event => event.stopPropagation()}>
            <h3>{editingWorkGroupId ? "Edit Sub-group" : "Create Sub-group"}</h3>
            <div className="group-field">
              <label>Group name</label>
              <input value={workGroupData.name} onChange={event => setWorkGroupData({ ...workGroupData, name: event.target.value })} placeholder="Group 01" />
            </div>
            <button className="group-option-row" type="button" onClick={() => setShowWorkGroupMembers(value => !value)}>
              <span>Add members</span>
              <strong>{workGroupData.memberUids.length > 0 ? `${workGroupData.memberUids.length} selected` : showWorkGroupMembers ? "Hide" : "Open"}</strong>
            </button>
            {showWorkGroupMembers && (
              <div className="group-field">
                <div className="workgroup-member-picker">
                  {activeMembers.length === 0 ? (
                    <div className="payment-meta">No active members yet.</div>
                  ) : activeMembers.map(member => {
                    const selected = workGroupData.memberUids.includes(member.uid);
                    return (
                      <label key={member.uid} className={`workgroup-member-option ${selected ? "selected" : ""}`}>
                        <input type="checkbox" checked={selected} onChange={() => toggleWorkGroupMember(member.uid)} />
                        <span>{member.name || "Member"}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <button className="group-option-row" type="button" onClick={() => setShowWorkGroupMore(value => !value)}>
              <span>More</span>
              <strong>{showWorkGroupMore ? "Hide" : "Open"}</strong>
            </button>
            {showWorkGroupMore && (
              <>
                <div className="group-field">
                  <label>Description</label>
                  <input value={workGroupData.description} onChange={event => setWorkGroupData({ ...workGroupData, description: event.target.value })} placeholder="Topographical surveying assignment group" />
                </div>
                <div className="group-field">
                  <label>Task title</label>
                  <input value={workGroupData.taskTitle} onChange={event => setWorkGroupData({ ...workGroupData, taskTitle: event.target.value })} placeholder="Submit field report" />
                </div>
                <div className="group-field">
                  <label>Task instructions</label>
                  <textarea value={workGroupData.taskInstructions} onChange={event => setWorkGroupData({ ...workGroupData, taskInstructions: event.target.value })} placeholder="What this group should do and submit." />
                </div>
                <div className="group-field">
                  <label>Deadline</label>
                  <input type="date" value={workGroupData.deadline} onChange={event => setWorkGroupData({ ...workGroupData, deadline: event.target.value })} />
                </div>
                {workGroupData.memberUids.length > 0 && (
                  <div className="group-field">
                    <label>Group leader</label>
                    <select value={workGroupData.leaderUid} onChange={event => setWorkGroupData({ ...workGroupData, leaderUid: event.target.value })}>
                      {workGroupData.memberUids.map(uid => (
                        <option key={uid} value={uid}>{memberNameByUid[uid] || uid}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
            <div className="group-inline-actions">
              <button className="group-btn primary" type="button" disabled={busy} onClick={handleSaveWorkGroup}>
                {busy ? "Saving..." : editingWorkGroupId ? "Update sub-group" : "Create sub-group"}
              </button>
              <button className="group-btn ghost" type="button" disabled={busy} onClick={() => { setShowWorkGroupForm(false); setEditingWorkGroupId(""); setShowWorkGroupMembers(false); setShowWorkGroupMore(false); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showGroupAbout && (
        <div className="group-modal-backdrop" onClick={() => setShowGroupAbout(false)}>
          <div className="group-modal" onClick={event => event.stopPropagation()}>
            <h3>{group.name}</h3>
            <p className="group-about-text">{group.desc || "No group description yet."}</p>
            <div className="class-board-meta">
              <span>{(members.length || group.memberCount || 0).toLocaleString()} members</span>
              <span>{group.joinPolicy === "inviteOnly" || group.visibility === "inviteOnly" ? "Invite link only" : group.joinPolicy === "approvalRequired" ? "Approval required" : "Public"}</span>
              {currentMember?.role && <span>{currentMember.role}</span>}
            </div>
            <div className="group-inline-actions">
              {memberCanEditGroup && (
                <button className="group-btn primary" type="button" onClick={() => { setShowGroupAbout(false); openEditGroup(); }}>
                  Edit description
                </button>
              )}
              <button className="group-btn ghost" type="button" onClick={() => setShowGroupAbout(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditGroup && (
        <div className="group-modal-backdrop" onClick={() => setShowEditGroup(false)}>
          <div className="group-modal" onClick={event => event.stopPropagation()}>
            <h3>Edit Group</h3>
            <div className="group-avatar-editor">
              <div
                className="group-avatar group-avatar-large"
                style={{
                  backgroundImage: editGroupData.avatarPreview ? `url(${editGroupData.avatarPreview})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {!editGroupData.avatarPreview && groupAvatarText(editGroupData.name || group.name)}
              </div>
              <span>Change group photo</span>
            </div>
            <div className="group-field">
              <label>Group photo</label>
              <input id="group-avatar-upload" type="file" accept="image/*" onChange={handleGroupAvatarSelect} />
            </div>
            <div className="group-field">
              <label>Group name</label>
              <input value={editGroupData.name} onChange={event => setEditGroupData({ ...editGroupData, name: event.target.value })} placeholder="TUCASA ARU Family" />
            </div>
            <div className="group-field">
              <label>Description</label>
              <textarea value={editGroupData.desc} onChange={event => setEditGroupData({ ...editGroupData, desc: event.target.value })} placeholder="What this group is for" />
            </div>
            <div className="group-inline-actions">
              <button className="group-btn primary" type="button" disabled={busy} onClick={handleSaveGroupProfile}>
                {busy ? "Saving..." : "Save changes"}
              </button>
              <button className="group-btn ghost" type="button" disabled={busy} onClick={() => setShowEditGroup(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showNotificationSettings && (
        <div className="group-modal-backdrop" onClick={() => setShowNotificationSettings(false)}>
          <div className="group-modal" onClick={event => event.stopPropagation()}>
            <h3>Notification Settings</h3>
            <div className="notification-settings-list">
              {[
                ["announcements", "Announcements", "Pinned and structured group updates."],
                ["payments", "Payment requests", "New collections, orders, and contributions."],
                ["events", "Events", "New event registrations and event updates."],
                ["mentions", "Mentions", "When someone tags you with @name."],
                ["deadlineReminders", "Deadline reminders", "Only when you still need to act."],
                ["proofRequests", "Proof requests", "When an admin asks you for clearer proof."],
                ["paymentStatus", "Payment status", "Verified or rejected payment updates."],
                ["adminAlerts", "Admin review alerts", "Pending proof and registration alerts for leaders."],
              ].map(([key, title, text]) => (
                <label key={key} className="notification-setting-row">
                  <span>
                    <strong>{title}</strong>
                    <small>{text}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={notificationPrefsDraft[key] !== false}
                    onChange={event => setNotificationPrefsDraft(prev => ({ ...prev, [key]: event.target.checked }))}
                  />
                </label>
              ))}
            </div>
            <div className="group-inline-actions">
              <button className="group-btn primary" type="button" disabled={busy} onClick={handleSaveNotificationSettings}>
                {busy ? "Saving..." : "Save preferences"}
              </button>
              <button className="group-btn ghost" type="button" disabled={busy} onClick={() => setShowNotificationSettings(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {resourcePreview && (
        <div className="group-modal-backdrop" onClick={() => setResourcePreview(null)}>
          <div className="group-modal resource-preview-modal" onClick={event => event.stopPropagation()}>
            <div className="resource-preview-header">
              {resourcePreview.kind !== "image" && <h3>{resourcePreview.title}</h3>}
              <button className="group-btn ghost compact" type="button" onClick={() => setResourcePreview(null)} style={resourcePreview.kind === "image" ? { marginLeft: "auto" } : undefined}>Close</button>
            </div>
            {resourcePreview.kind === "convertible" && (
              <div className="resource-preview-note">
                {resourcePreview.previewPdfUrl
                  ? "Converted PDF preview is ready for smooth reading inside Kampasika."
                  : ENABLE_DOCUMENT_PDF_PREVIEWS
                    ? "PPT/PPTX/DOC/DOCX file. Open original for now, or let a group leader prepare a PDF preview."
                    : "PPT/PPTX/DOC/DOCX file. Use Open original to view it smoothly."}
              </div>
            )}
            {resourcePreview.kind === "image" ? (
              <img className="resource-preview-image" src={resourcePreview.previewUrl} alt={resourcePreview.title} />
            ) : resourcePreview.kind === "convertible" && !resourcePreview.previewPdfUrl ? (
              <div className="resource-preview-fallback">
                <MenuIcon name="file" />
                <strong>{resourcePreview.type || "Document"}</strong>
                <span>Open the original file to view it smoothly.</span>
                {resourcePreview.previewStatus === "failed" && resourcePreview.previewError ? (
                  <small>{resourcePreview.previewError}</small>
                ) : null}
              </div>
            ) : resourcePreview.kind === "generic" ? (
              <div className="resource-preview-fallback">
                <MenuIcon name="file" />
                <strong>{resourcePreview.type || "File"}</strong>
                <span>This file type can't be previewed inside Kampasika. Open it with another app on your phone instead.</span>
              </div>
            ) : (
              <iframe className="resource-preview-frame" src={resourcePreview.previewUrl} title={resourcePreview.title} />
            )}
            <div className="group-inline-actions">
              {ENABLE_DOCUMENT_PDF_PREVIEWS && resourcePreview.kind === "convertible" && !resourcePreview.previewPdfUrl && memberCanManage && resourcePreview.id && (
                <button className="group-btn primary group-link-btn" type="button" disabled={!!convertingResourceId} onClick={() => handlePrepareDocumentPreview(resourcePreview)}>
                  {convertingResourceId === resourcePreview.id ? "Preparing..." : "Prepare PDF preview"}
                </button>
              )}
              {resourcePreview.kind === "image" ? (
                <button className="group-btn primary group-link-btn" type="button" onClick={() => handleSaveImage(resourcePreview.previewUrl || resourcePreview.url, resourcePreview.title)}>Save to phone</button>
              ) : (
                <a className={`group-btn group-link-btn ${resourcePreview.kind === "convertible" || resourcePreview.kind === "generic" ? "primary" : "ghost"}`} href={getOriginalOpenUrl(resourcePreview)} target="_blank" rel="noreferrer">{resourcePreview.kind === "convertible" || resourcePreview.kind === "generic" ? "Open with another app" : "Open original"}</a>
              )}
              {(resourcePreview.kind === "convertible" || resourcePreview.kind === "office") && (
                <a className="group-btn ghost group-link-btn" href={getPreviewUrl(resourcePreview)} target="_blank" rel="noreferrer">Try web viewer</a>
              )}
            </div>
          </div>
        </div>
      )}

      {showGroupQr && (
        <div className="group-modal-backdrop" onClick={() => setShowGroupQr(false)}>
          <div className="group-modal group-qr-modal" onClick={event => event.stopPropagation()}>
            <h3>Group QR</h3>
            <div className="group-qr-card">
              <div
                className="group-avatar group-qr-avatar"
                style={{
                  backgroundImage: group.avatarUrl ? `url(${group.avatarUrl})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {!group.avatarUrl && (group.avatarText || groupAvatarText(group.name))}
              </div>
              <strong>{group.name}</strong>
              <span>Scan to open or join this group.</span>
              <div className="group-qr-box">
                <QRCodeSVG value={groupInviteUrl} size={190} bgColor="#ffffff" fgColor="#0f1b2d" level="M" />
              </div>
              <small>{groupInviteUrl}</small>
            </div>
            <div className="group-inline-actions">
              <button
                className="group-btn primary"
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(groupInviteUrl).then(() => onSuccess("Group link copied."));
                }}
              >
                Copy link
              </button>
              <button
                className="group-btn secondary"
                type="button"
                onClick={() => {
                  if (navigator.share) navigator.share({ title: group.name, text: `Join ${group.name} on Kampasika`, url: groupInviteUrl });
                  else navigator.clipboard?.writeText(groupInviteUrl).then(() => onSuccess("Group link copied."));
                }}
              >
                Share
              </button>
              <button className="group-btn ghost" type="button" onClick={() => setShowGroupQr(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {expandedProofUrl && (
        <button type="button" className="proof-lightbox" onClick={() => setExpandedProofUrl("")} aria-label="Close payment proof preview">
          <img src={expandedProofUrl} alt="Expanded payment proof" />
        </button>
      )}
    </div>
  );
}