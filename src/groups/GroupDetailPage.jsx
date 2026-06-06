import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import "./GroupComponents.css";
import {
  GROUP_ROLES,
  DEFAULT_GROUP_NOTIFICATION_PREFS,
  canManageGroup,
  canVerifyPayments,
  createGroupCollection,
  createGroupWorkGroup,
  deleteGroupResource,
  deleteGroupWorkGroup,
  groupAvatarText,
  isGroupMember,
  leaveUniversityGroup,
  paymentSummary,
  addGroupResource,
  approveGroupMember,
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
  payerName: "",
  paymentRef: "",
  amountPaid: "",
  paymentProofFile: null,
  paymentProofPreview: "",
};

const emptyResource = {
  title: "",
  subject: "",
  topic: "",
  description: "",
  url: "",
  deadline: "",
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
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    mute: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" /><path d="M10 21h4" /><path d="M3 3l18 18" /></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" /><path d="M10 21h4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 9c.2.6.8 1 1.5 1H21a2 2 0 1 1 0 4h-.2c-.7 0-1.3.4-1.5 1Z" /></>,
    qr: <><path d="M4 4h6v6H4z" /><path d="M14 4h6v6h-6z" /><path d="M4 14h6v6H4z" /><path d="M14 14h2v2h-2z" /><path d="M18 14h2v6h-2z" /><path d="M14 18h2v2h-2z" /></>,
    back: <><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></>,
    leave: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
    send: <><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7Z" /></>,
    down: <><path d="M12 5v14" /><path d="M19 12l-7 7-7-7" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    close: <><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 10.7l6.8-4.4" /><path d="M8.6 13.3l6.8 4.4" /></>,
    more: <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
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

function statusClass(status) {
  if (status === "paid") return "paid";
  if (status === "rejected") return "rejected";
  if (status === "registered") return "registered";
  return "pending";
}

function groupPaymentVerifyUrl(groupId, collectionId, paymentId) {
  return `https://kampasika.org/g/${groupId}/verify/${collectionId}/${paymentId}`;
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
  onMarkRead,
  onError,
  onSuccess,
  onBackHandlerChange,
  onGroupUpdated,
  onOpenScanner,
  initialTab = "chats",
  initialCollectionId = "",
  initialCollection = null,
  initialSource = "",
  groupHasUnread = false,
  groupReadAtValue = 0,
}) {
  const [activeTab, setActiveTab] = useState(initialTab || "chats");
  const [menuOpen, setMenuOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [resources, setResources] = useState([]);
  const [workGroups, setWorkGroups] = useState([]);
  const [collections, setCollections] = useState(initialCollection ? [initialCollection] : []);
  const [selectedCollectionId, setSelectedCollectionId] = useState(initialCollectionId || "");
  const [payments, setPayments] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [showChatComposer, setShowChatComposer] = useState(false);
  const [showChatTools, setShowChatTools] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [activeMessageActions, setActiveMessageActions] = useState(null);
  const [showPinnedFocus, setShowPinnedFocus] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [posting, setPosting] = useState(false);
  const [showTrackerForm, setShowTrackerForm] = useState(false);
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState("");
  const [showWorkGroupForm, setShowWorkGroupForm] = useState(false);
  const [editingWorkGroupId, setEditingWorkGroupId] = useState("");
  const [submittingWorkGroupId, setSubmittingWorkGroupId] = useState("");
  const [trackerData, setTrackerData] = useState(emptyTracker);
  const [resourceData, setResourceData] = useState(emptyResource);
  const [workGroupData, setWorkGroupData] = useState(emptyWorkGroup);
  const [workSubmissionData, setWorkSubmissionData] = useState(emptyWorkSubmission);
  const [paymentData, setPaymentData] = useState(emptyPayment);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [expandedProofUrl, setExpandedProofUrl] = useState("");
  const [mentionPermission, setMentionPermission] = useState(group.mentionPermission || "admins");
  const [showEditGroup, setShowEditGroup] = useState(false);
  const [editGroupData, setEditGroupData] = useState({ name: group.name || "", desc: group.desc || "", avatarFile: null, avatarPreview: group.avatarUrl || "" });
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showGroupQr, setShowGroupQr] = useState(false);
  const [notificationPrefsDraft, setNotificationPrefsDraft] = useState(DEFAULT_GROUP_NOTIFICATION_PREFS);
  const [busy, setBusy] = useState(false);
  const groupNavDepth = useRef(0);
  const chatBottomRef = useRef(null);
  const messageListRef = useRef(null);
  const messageHoldTimer = useRef(null);
  const touchStartPos = useRef({ x: 0, y: 0 });
  const openedReadAtRef = useRef(groupReadAtValue || 0);

  const profile = useMemo(() => ({ name: userName, avatarUrl: userAvatar }), [userName, userAvatar]);
  const currentMember = useMemo(() => members.find(member => member.uid === user?.uid && member.status === "active") || null, [members, user]);
  const pendingCurrentMember = useMemo(() => members.find(member => member.uid === user?.uid && member.status === "pending") || null, [members, user]);
  const memberCanManage = canManageGroup(currentMember) || group.adminUid === user?.uid || group.ownerUid === user?.uid;
  const memberCanEditGroup = ["owner", "admin"].includes(currentMember?.role) || group.adminUid === user?.uid || group.ownerUid === user?.uid;
  const memberCanVerify = canVerifyPayments(currentMember) || group.adminUid === user?.uid || group.ownerUid === user?.uid;
  const memberCanChat = isGroupMember(currentMember) || memberCanManage;
  const canViewGroupContent = isGroupMember(currentMember) || memberCanManage;
  const groupInviteUrl = group.inviteLink?.startsWith("http")
    ? group.inviteLink
    : `${window.location.origin}/g/${group.inviteCode || group.id}`;
  const selectedCollection = collections.find(item => item.id === selectedCollectionId) || null;
  const eventCollections = collections.filter(item => (item.collectionType || "") === "event");
  const selectedNeedsPayment = Number(selectedCollection?.amount || 0) > 0;
  const selectedPaidEvent = selectedCollection?.collectionType === "event" && selectedNeedsPayment;
  const canViewPublicSelectedEvent = selectedCollection?.collectionType === "event" && selectedCollection.visibility === "public";
  const myPayment = payments.find(payment => payment.uid === user?.uid || payment.id === user?.uid) || null;
  const myPaymentRemaining = Math.max(0, Number(selectedCollection?.amount || 0) - Number(myPayment?.amountPaid || 0));
  const myPaymentStatusLabel = myPayment?.status === "paid"
    ? "Paid"
    : myPayment?.status === "registered"
      ? "Registered"
      : myPayment && selectedNeedsPayment && myPaymentRemaining > 0
        ? "Payment submitted"
      : myPayment
        ? "Payment submitted"
        : "";
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
  const pendingMembers = members.filter(member => member.status === "pending");
  const activeMembers = members.filter(member => member.status !== "pending" && member.status !== "rejected" && member.status !== "removed");
  const memberNameByUid = useMemo(() => activeMembers.reduce((acc, member) => {
    acc[member.uid] = member.name || member.email || "Member";
    return acc;
  }, {}), [activeMembers]);
  const summary = memberCanVerify ? paymentSummary(selectedCollection, payments) : paymentSummary(selectedCollection, myPayment ? [myPayment] : []);
  const pinnedMessage = messages.find(message => message.pinned || message.kind === "announcement");
  const currentAction = group.currentAction || (pinnedMessage ? {
    type: pinnedMessage.kind === "announcement" ? "announcement" : "message",
    title: "Pinned update",
    description: pinnedMessage.text,
  } : null);
  const chatMessages = useMemo(() => [...messages].sort((a, b) => (
    (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0)
  )), [messages]);
  const unreadChatMessages = useMemo(() => chatMessages.filter(message => (
    message.authorUid !== user?.uid
    && message.createdAt?.getTime
    && message.createdAt.getTime() > openedReadAtRef.current
  )), [chatMessages, user?.uid]);
  const firstUnreadMessageId = unreadChatMessages[0]?.id || "";
  const sortedResources = useMemo(() => [...resources].sort((a, b) => (
    (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0)
  )), [resources]);
  const groupedResources = useMemo(() => sortedResources.reduce((acc, resource) => {
    const key = (resource.subject || "General").trim() || "General";
    if (!acc[key]) acc[key] = [];
    acc[key].push(resource);
    return acc;
  }, {}), [sortedResources]);

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
    setPaymentSearch("");
  };

  const goBackWithinGroup = useCallback(() => {
    setMenuOpen(false);

    if (expandedProofUrl) {
      setExpandedProofUrl("");
      return true;
    }
    if (showPaymentForm) {
      setShowPaymentForm(false);
      return true;
    }
    if (showTrackerForm) {
      setShowTrackerForm(false);
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
      return true;
    }
    if (initialSource === "publicEvents" && activeTab === "events") {
      return false;
    }
    if (selectedCollectionId) {
      setSelectedCollectionId("");
      setPayments([]);
      setPaymentSearch("");
      return true;
    }
    if (activeTab !== "chats") {
      setActiveTab("chats");
      setPaymentSearch("");
      return true;
    }

    return false;
  }, [activeMessageActions, activeTab, expandedProofUrl, initialSource, replyToMessage, selectedCollectionId, showChatComposer, showChatTools, showPaymentForm, showResourceForm, showTrackerForm, showWorkGroupForm, submittingWorkGroupId]);

  useEffect(() => {
    if (!group?.id) return undefined;
    setActiveTab(initialTab || "chats");
    setMenuOpen(false);
    setCollections(initialCollection ? [initialCollection] : []);
    setSelectedCollectionId(initialCollectionId || "");
    setPayments([]);
    setPaymentSearch("");
    setShowPaymentForm(false);
    setShowTrackerForm(false);
    setShowWorkGroupForm(false);
    setShowResourceForm(false);
    setEditingResourceId("");
    setEditingWorkGroupId("");
    setSubmittingWorkGroupId("");
    setShowChatComposer(false);
    setShowChatTools(false);
    setReplyToMessage(null);
    setActiveMessageActions(null);
    setShowPinnedFocus(false);
    setExpandedProofUrl("");
    setShowGroupQr(false);
  }, [group?.id, user?.uid, initialTab, initialCollectionId, initialCollection]);

  useEffect(() => {
    if (!group?.id) return undefined;
    if (!user?.uid) {
      setMembers([]);
      setMembersLoaded(true);
      return undefined;
    }
    setMembersLoaded(false);
    const unsubMembers = subscribeGroupMembers(db, group.id, items => {
      setMembers(items);
      setMembersLoaded(true);
    }, err => {
      setMembersLoaded(true);
      onError(err);
    });
    return () => {
      unsubMembers();
    };
  }, [db, group?.id, onError, user?.uid]);

  useEffect(() => {
    const canReadCollections = canViewGroupContent || !!initialCollectionId;
    if (!group?.id || !canReadCollections) {
      setMessages([]);
      setResources([]);
      setWorkGroups([]);
      setCollections(initialCollection ? [initialCollection] : []);
      setSelectedCollectionId(initialCollectionId || "");
      return undefined;
    }
    const unsubMessages = canViewGroupContent ? subscribeChannelMessages(db, group.id, "chats", setMessages, onError) : null;
    const unsubResources = canViewGroupContent ? subscribeChannelMessages(db, group.id, "resources", setResources, onError) : null;
    const unsubWorkGroups = canViewGroupContent ? subscribeGroupWorkGroups(db, group.id, setWorkGroups, onError) : null;
    const subscribeCollections = canViewGroupContent
      ? (next) => subscribeGroupCollections(db, group.id, next, onError)
      : (next) => subscribeGroupCollection(db, group.id, initialCollectionId, next, onError);
    const unsubCollections = subscribeCollections(items => {
      const nextItems = items.length ? items : initialCollection ? [initialCollection] : [];
      setCollections(nextItems);
      setSelectedCollectionId(prev => (prev && nextItems.some(item => item.id === prev)) ? prev : (initialCollectionId || ""));
    });
    return () => {
      unsubMessages?.();
      unsubResources?.();
      unsubWorkGroups?.();
      unsubCollections();
    };
  }, [canViewGroupContent, db, group?.id, initialCollection, initialCollectionId, onError]);

  useEffect(() => {
    if (!group?.id || !selectedCollection?.id) {
      setPayments([]);
      return undefined;
    }
    if (memberCanVerify) {
      return subscribeCollectionPayments(db, group.id, selectedCollection.id, setPayments, onError);
    }
    if (user?.uid) {
      return subscribeMyCollectionPayment(db, group.id, selectedCollection.id, user.uid, setPayments, onError);
    }
    setPayments([]);
    return undefined;
  }, [db, group?.id, selectedCollection?.id, memberCanVerify, user?.uid, onError]);

  useEffect(() => {
    if (activeTab !== "chats") return;
    const el = messageListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setShowJumpToLatest(false);
  }, [activeTab, chatMessages.length]);

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
    if (!myPayment) return;
    setPaymentData(prev => ({
      ...prev,
      studentName: prev.studentName || myPayment.studentName || userName || "",
      phone: prev.phone || myPayment.phone || "",
      amountPaid: prev.amountPaid || String(myPayment.amountPaid || ""),
      paymentRef: prev.paymentRef || myPayment.paymentRef || "",
      payerName: prev.payerName || myPayment.payerName || "",
    }));
  }, [myPayment, userName]);

  useEffect(() => {
    setMentionPermission(group.mentionPermission || "admins");
  }, [group.mentionPermission]);

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
    if (!messageText.trim() || !user || !group?.id) return;
    const hasMention = /(^|\s)@[a-zA-Z0-9._-]+/.test(messageText);
    if (hasMention && mentionPermission === "admins" && !memberCanManage) {
      onError(new Error("Only admins, owners, and treasurers can tag members in this group."));
      return;
    }
    setPosting(true);
    try {
      await sendGroupMessage(db, {
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
      });
      setMessageText("");
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

  const handleReactToMessage = async (message, emoji) => {
    try {
      await reactToGroupMessage(db, { groupId: group.id, messageId: message.id, emoji, user });
      setActiveMessageActions(null);
    } catch (err) {
      onError(err);
    }
  };

  const openCreateResourceForm = () => {
    setEditingResourceId("");
    setResourceData(emptyResource);
    setShowResourceForm(true);
  };

  const openEditResourceForm = (resource) => {
    setEditingResourceId(resource.id);
    setResourceData({
      title: resource.title || resource.text || "",
      subject: resource.subject || "",
      topic: resource.topic || "",
      description: resource.description || (resource.text && resource.text !== resource.title ? resource.text : ""),
      url: resource.url || "",
      deadline: resource.deadline || "",
    });
    setShowResourceForm(true);
  };

  const handleSaveResource = async () => {
    if (!resourceData.title.trim() && !resourceData.url.trim()) {
      onError(new Error("Add a resource title or link."));
      return;
    }
    setBusy(true);
    try {
      if (editingResourceId) {
        await updateGroupResource(db, {
          groupId: group.id,
          resourceId: editingResourceId,
          user,
          data: {
            ...resourceData,
            title: resourceData.title || resourceData.url,
          },
        });
      } else {
        await addGroupResource(db, {
          groupId: group.id,
          user,
          profile,
          ...resourceData,
          title: resourceData.title || resourceData.url,
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

  const handleDeleteResource = async (resource) => {
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
    setShowWorkGroupForm(true);
  };

  const handleSaveWorkGroup = async () => {
    if (!workGroupData.name.trim()) {
      onError(new Error("Work group name is required."));
      return;
    }
    if (workGroupData.memberUids.length === 0) {
      onError(new Error("Add at least one member to this work group."));
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
      onSuccess(editingWorkGroupId ? "Work group updated." : "Work group created.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteWorkGroup = async (workGroup) => {
    if (!window.confirm(`Delete "${workGroup.name || "this work group"}"? Submissions for it will be removed from this view.`)) return;
    setBusy(true);
    try {
      await deleteGroupWorkGroup(db, { groupId: group.id, workGroupId: workGroup.id, user });
      onSuccess("Work group deleted.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitWork = async (workGroup) => {
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

  const handleUploadResourceFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !memberCanManage || !storage || !group?.id) return;
    if (file.size > 12 * 1024 * 1024) {
      onError(new Error("File is too large. Maximum size is 12MB."));
      return;
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "resource";
    const filePath = `groups/${group.id}/resources/${user.uid}_${Date.now()}_${safeName}`;
    setBusy(true);
    try {
      const snap = await uploadBytes(ref(storage, filePath), file);
      const url = await getDownloadURL(snap.ref);
      await addGroupResource(db, {
        groupId: group.id,
        user,
        profile,
        title: file.name,
        url,
        subject: "Files",
        topic: "Uploaded file",
      });
      setShowChatTools(false);
      onSuccess("File shared in resources.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTracker = async () => {
    if (!trackerData.title.trim() || (trackerData.collectionType !== "event" && !trackerData.amount)) {
      onError(new Error(trackerData.collectionType === "event" ? "Event title is required." : "Tracker title and amount are required."));
      return;
    }
    setBusy(true);
    try {
      const createdTracker = await createGroupCollection(db, {
        groupId: group.id,
        user,
        profile,
        storage,
        data: {
          ...trackerData,
          paymentMethods: trackerData.paymentMethods
            .split(",")
            .map(item => item.trim())
            .filter(Boolean),
        },
      });
      setTrackerData(emptyTracker);
      setShowTrackerForm(false);
      if (activeTab === "payments") setSelectedCollectionId(createdTracker.id);
      markCurrentGroupRead();
      onSuccess(trackerData.collectionType === "event" ? "Event created." : "Payment tracker created.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitPayment = async () => {
    if (!selectedCollection) return;
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
      onSuccess("Payment submitted for treasurer/admin verification.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterEvent = async () => {
    if (!selectedCollection || !user) return;
    if (myPayment && !window.confirm("You already registered. Do you want to update your registration?")) return;
    setBusy(true);
    try {
      await registerGroupEvent(db, {
        groupId: group.id,
        collectionItem: selectedCollection,
        user,
        profile,
        data: { phone: paymentData.phone },
      });
      setShowPaymentForm(false);
      onSuccess("Registration saved.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (payment, status) => {
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

  const handleAdjustAmount = async (payment) => {
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
      ["Name", "Status", "Amount Paid", "Amount Due", "Phone", "Reference", "Proof URL", "Submitted At"],
      ...payments.map(payment => [
        payment.studentName || "",
        payment.status || "pending",
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

  const handleEditPinnedUpdate = async () => {
    if (!memberCanManage || !user) return;
    const nextTitleInput = window.prompt("Pinned update title", currentAction?.title || "Pinned update");
    if (nextTitleInput === null) return;
    const nextDescription = window.prompt("Pinned update message", currentAction?.description || group.desc || "");
    if (nextDescription === null) return;
    setBusy(true);
    try {
      const nextAction = {
        ...(currentAction || {}),
        title: nextTitleInput.trim() || "Pinned update",
        description: nextDescription.trim(),
      };
      await updateGroupCurrentAction(db, { groupId: group.id, currentAction: nextAction, user });
      onGroupUpdated?.({ ...group, currentAction: nextAction });
      onSuccess("Pinned update changed.");
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveGroup = async () => {
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

  const renderTrackerForm = () => (
    <div className="payment-card group-create-card">
      <div className="group-field">
        <label>{trackerData.collectionType === "event" ? "Event poster / photo" : "Photo"}</label>
        <input type="file" accept="image/*" onChange={event => {
          const file = event.target.files?.[0] || null;
          setTrackerData({ ...trackerData, photoFile: file, photoPreview: file ? URL.createObjectURL(file) : "" });
        }} />
        {trackerData.photoPreview && <img className="tracker-photo-preview" src={trackerData.photoPreview} alt="Preview" />}
      </div>
      <div className="group-field"><label>Title</label><input value={trackerData.title} onChange={event => setTrackerData({ ...trackerData, title: event.target.value })} placeholder={trackerData.collectionType === "event" ? "ARU Freshers welcome night" : "Studio model materials"} /></div>
      <div className="group-field"><label>Type</label><select value={trackerData.collectionType} onChange={event => setTrackerData({ ...trackerData, collectionType: event.target.value, visibility: event.target.value === "event" ? "public" : "groupOnly", amount: event.target.value === "event" ? trackerData.amount : trackerData.amount })}><option value="contribution">Contribution</option><option value="order">Group order</option><option value="event">Event registration</option></select></div>
      <div className="group-field"><label>Visibility</label><select value={trackerData.visibility} onChange={event => setTrackerData({ ...trackerData, visibility: event.target.value })}><option value="groupOnly">Group members only</option><option value="public">Public - all students can participate</option><option value="inviteOnly">Invite link only</option></select></div>
      <div className="group-field"><label>{trackerData.collectionType === "event" ? "Payment amount, optional" : "Amount per member"}</label><input type="number" value={trackerData.amount} onChange={event => setTrackerData({ ...trackerData, amount: event.target.value })} placeholder={trackerData.collectionType === "event" ? "Leave empty for free registration" : "10000"} /></div>
      <div className="group-field"><label>Expected people</label><input type="number" value={trackerData.expectedPeople} onChange={event => setTrackerData({ ...trackerData, expectedPeople: event.target.value })} placeholder="45" /></div>
      <div className="group-field"><label>Payment numbers</label><input value={trackerData.paymentMethods} onChange={event => setTrackerData({ ...trackerData, paymentMethods: event.target.value })} placeholder="M-Pesa 255..., Airtel Money 255..." /></div>
      <div className="group-field"><label>Deadline</label><input type="date" value={trackerData.deadline} onChange={event => setTrackerData({ ...trackerData, deadline: event.target.value })} /></div>
      <div className="group-field"><label>Description</label><textarea value={trackerData.description} onChange={event => setTrackerData({ ...trackerData, description: event.target.value })} placeholder={trackerData.collectionType === "event" ? "Where, when, who can register, and what students should bring." : "What this payment is for and how members should pay."} /></div>
      <button className="group-btn primary" type="button" disabled={busy} onClick={handleCreateTracker}>{busy ? "Creating..." : trackerData.collectionType === "event" ? "Create event" : "Create order / contribution"}</button>
    </div>
  );

  return (
    <div className={`group-detail ${activeTab === "chats" ? "group-detail-chat" : ""}`}>
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
          <div className="group-header-title">
            <h2>{group.name}</h2>
            <div>
              {(members.length || group.memberCount || 0).toLocaleString()} members
              {currentMember?.role ? ` - ${currentMember.role}` : ""}
            </div>
          </div>
          <button type="button" className="group-icon-btn" aria-label="Share group" onClick={onShareGroup}><MenuIcon name="share" /></button>
          <div className="group-menu-wrap">
            <button type="button" className="group-icon-btn" aria-label="Open group menu" onClick={() => setMenuOpen(value => !value)}><MenuIcon name="more" /></button>
            {menuOpen && (
              <>
                <button type="button" className="group-menu-scrim" aria-label="Close group menu" onClick={() => setMenuOpen(false)} />
                <div className="group-side-menu">
                  <div className="group-side-menu-title">{group.name}</div>
                  {canViewGroupContent && (
                    <>
                      {[
                        ["chats", "Chats"],
                        ["payments", "Payments"],
                        ["workgroups", "Work Groups"],
                        ["members", "Members"],
                        ["resources", "Resources"],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          className={`group-menu-item ${activeTab === id ? "active" : ""}`}
                          onClick={() => switchGroupTab(id)}
                        >
                          <span><MenuIcon name={id} /></span>
                          <strong>{label}</strong>
                          {groupHasUnread && ["chats", "payments", "workgroups", "resources"].includes(id) && <em className="group-menu-new">New</em>}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`group-menu-item ${activeTab === "events" ? "active" : ""}`}
                        onClick={() => switchGroupTab("events")}
                      >
                        <span><MenuIcon name="events" /></span>
                        <strong>Events</strong>
                        {groupHasUnread && <em className="group-menu-new">New</em>}
                      </button>
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
                    <strong>Group QR</strong>
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
        {(canViewGroupContent || canViewPublicSelectedEvent) && <div className="group-current-channel">{activeTab}</div>}
      </div>

      {(!user || membersLoaded) && !canViewGroupContent && !canViewPublicSelectedEvent && (
        <div className="group-panel">
          <div className="group-preview-lock">
            <div className="group-preview-title">{group.visibility === "public" ? "Public group preview" : "Private group"}</div>
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

      {canViewGroupContent && activeTab === "chats" && (
        <div className={`group-panel chat-panel ${(showChatComposer || replyToMessage || showChatTools) ? "composer-open" : ""}`}>
          {(currentAction || group.desc) && (
            <button
              type="button"
              className="group-pin-float"
              onClick={() => setShowPinnedFocus(true)}
            >
              <strong>{currentAction?.title || "Pinned update"}:</strong>{" "}
              <span>{currentAction?.description || group.desc}</span>
            </button>
          )}
          {messages.length === 0 ? (
            <div className="group-empty">No messages yet.</div>
          ) : (
            <div className="message-list" ref={messageListRef} onScroll={handleChatScroll}>
              {chatMessages.map((message, index) => (
                <div key={message.id} className="message-stack">
                  {(index === 0 || !sameMessageDay(chatMessages[index - 1]?.createdAt, message.createdAt)) && (
                    <div className="message-date-chip">{formatMessageDay(message.createdAt)}</div>
                  )}
                  {message.id === firstUnreadMessageId && (
                    <div className="message-unread-chip">
                      {unreadChatMessages.length} unread {unreadChatMessages.length === 1 ? "message" : "messages"}
                    </div>
                  )}
                  <button
                    type="button"
                    className={`message-bubble ${message.kind === "announcement" ? "announcement" : ""}`}
                    onMouseDown={() => startMessageHold(message)}
                    onMouseUp={clearMessageHold}
                    onMouseLeave={clearMessageHold}
                    onTouchStart={(e) => startMessageHold(message, e)}
                    onTouchMove={cancelMessageHoldIfMoved}
                    onTouchEnd={clearMessageHold}
                    onTouchCancel={clearMessageHold}
                  >
                    <div className="message-author">{message.authorName || "Member"}</div>
                    {message.replyTo && (
                      <div className="message-reply-preview">
                        <strong>{message.replyTo.authorName}</strong>
                        <span>{message.replyTo.text}</span>
                      </div>
                    )}
                    <div className="message-text">{message.text}</div>
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
                    <div className="message-time">{formatDate(message.createdAt)}</div>
                  </button>
                </div>
              ))}
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
                      <span className="message-action-preview-text">{activeMessageActions.text?.slice(0, 80)}{(activeMessageActions.text?.length || 0) > 80 ? "…" : ""}</span>
                    </div>
                    <div className="message-action-emojis">
                      {["\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F64F}", "\u{1F525}"].map(emoji => (
                        <button key={emoji} type="button" onClick={() => handleReactToMessage(activeMessageActions, emoji)}>{emoji}</button>
                      ))}
                    </div>
                    <button type="button" className="message-action-row" onClick={() => { setReplyToMessage(activeMessageActions); setShowChatComposer(true); setActiveMessageActions(null); }}>Reply</button>
                    {memberCanManage && <button type="button" className="message-action-row" onClick={() => { setMessageText(activeMessageActions.text || ""); setActiveMessageActions(null); }}>Copy to composer</button>}
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
                    onClick={() => { setShowChatComposer(false); setShowChatTools(false); setReplyToMessage(null); }}
                  />
                  <div className="chat-input-bar">
                    {replyToMessage && (
                      <div className="chat-replying">
                        <span>Replying to {replyToMessage.authorName || "Member"}</span>
                        <button type="button" aria-label="Cancel reply" onClick={() => setReplyToMessage(null)}><MenuIcon name="close" /></button>
                      </div>
                    )}
                    {showChatTools && (
                      <div className="chat-tools-menu">
                        {memberCanManage && <button type="button" onClick={openCreateResourceForm}>Add board resource</button>}
                        {memberCanManage && (
                          <label className="chat-tool-file">
                            Upload file
                            <input type="file" onChange={handleUploadResourceFile} disabled={busy} />
                          </label>
                        )}
                        {memberCanManage && <button type="button" onClick={() => { setShowChatTools(false); handlePost("announcement"); }} disabled={!messageText.trim()}>Pin as announcement</button>}
                        {!memberCanManage && <span>Only leaders can share files and resources here.</span>}
                      </div>
                    )}
                    <div className="chat-input-row">
                      <button type="button" className="chat-plus-btn" aria-label="Open chat tools" onClick={() => { setShowChatComposer(true); setShowChatTools(value => !value); }}>
                        <MenuIcon name="plus" />
                      </button>
                      <textarea value={messageText} onChange={event => setMessageText(event.target.value)} placeholder="Message" rows={1} autoFocus />
                      <button
                        type="button"
                        className="chat-close-btn"
                        aria-label="Close message composer"
                        onClick={() => { setShowChatComposer(false); setShowChatTools(false); setReplyToMessage(null); }}
                      >
                        <MenuIcon name="close" />
                      </button>
                      <button className="chat-send-btn" type="button" aria-label="Send message" disabled={posting || !messageText.trim()} onClick={() => handlePost("message")}>
                        <MenuIcon name="send" />
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
          {selectedCollection && <div className="payment-grid">
            {memberCanVerify ? (
              <>
                <div className="payment-stat"><strong>{summary.paidCount}</strong><span>Paid</span></div>
                <div className="payment-stat"><strong>{summary.unpaidCount}</strong><span>Unpaid</span></div>
                <div className="payment-stat"><strong>{summary.pendingCount}</strong><span>Pending proof</span></div>
                <div className="payment-stat"><strong>{summary.totalCollected.toLocaleString()}</strong><span>TSh collected</span></div>
              </>
            ) : (
              <>
                <div className="payment-stat"><strong>{myPayment?.status || "Not registered"}</strong><span>Your status</span></div>
                <div className="payment-stat"><strong>{selectedCollection?.amount ? Number(selectedCollection.amount).toLocaleString() : "0"}</strong><span>TSh required</span></div>
              </>
            )}
          </div>}

          {memberCanManage && (
            <div style={{ marginBottom: 10 }}>
              <button className="group-btn primary" type="button" onClick={() => {
                if (!showTrackerForm) {
                  setTrackerData(prev => ({ ...prev, collectionType: "contribution", visibility: "groupOnly" }));
                  pushGroupHistory();
                }
                setShowTrackerForm(value => !value);
              }}>
                {showTrackerForm ? "Close form" : "Create order / contribution"}
              </button>
            </div>
          )}

          {showTrackerForm && renderTrackerForm()}

          {collections.length === 0 ? (
            <div className="group-empty">No payment trackers yet.</div>
          ) : (
            <>
              {!selectedCollection && (
                <div className="tracker-list">
                  {collections.map(item => {
                    const needsPayment = Number(item.amount || 0) > 0;
                    return (
                      <button key={item.id} type="button" className="tracker-card" onClick={() => openTracker(item.id)}>
                        {item.photoUrl && <img className="tracker-card-photo" src={item.photoUrl} alt="" />}
                        <div>
                          <strong>{item.title}</strong>
                          <span>{item.collectionType === "event" ? "Event" : item.collectionType === "order" ? "Group order" : "Contribution"}</span>
                        </div>
                        <p>{item.description || "No description added."}</p>
                        <div className="tracker-card-meta">
                          <span>{needsPayment ? `${Number(item.amount || 0).toLocaleString()} TSh` : "Registration only"}</span>
                          {item.expectedPeople ? <span>{item.expectedPeople} expected</span> : null}
                          {item.visibility ? <span>{item.visibility}</span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedCollection && (
                <button className="group-btn ghost" type="button" style={{ marginBottom: 10 }} onClick={() => {
                  if (groupNavDepth.current > 0) {
                    window.history.back();
                    return;
                  }
                  setSelectedCollectionId("");
                  setShowPaymentForm(false);
                  setPayments([]);
                }}>Back to trackers</button>
              )}
              {selectedCollection && (
                <div className="payment-card">
                  {selectedCollection.photoUrl && <img className="tracker-card-photo" src={selectedCollection.photoUrl} alt="" />}
                  <h4>{selectedCollection.title}</h4>
                  <div className="payment-meta">
                    {selectedNeedsPayment ? `${(selectedCollection.amount || 0).toLocaleString()} TSh per member` : "Registration only"}
                    {selectedCollection.expectedPeople ? ` - ${selectedCollection.expectedPeople} expected` : ""}
                    {selectedCollection.paymentMethods?.length ? ` - Pay: ${selectedCollection.paymentMethods.join(" / ")}` : ""}
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
                    </div>
                  )}
                  <div className="payment-bar"><div style={{ width: `${summary.progress}%` }} /></div>
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
                      <strong>{selectedNeedsPayment ? "Your payment is on record." : "You are registered."}</strong>
                      <span>{myPayment.amountPaid ? `${Number(myPayment.amountPaid).toLocaleString()} TSh` : selectedNeedsPayment ? "Amount not recorded" : "Registered"}</span>
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
                      <button className="group-btn ghost" type="button" onClick={() => setShowPaymentForm(true)}>Pay now</button>
                    </div>
                  )}
                  {(!myPayment && !selectedPaidEvent) || showPaymentForm || myPayment?.proofRequested ? (
                    <>
                      {!selectedNeedsPayment && <div className="group-field"><label>Phone number</label><input value={paymentData.phone} onChange={event => setPaymentData({ ...paymentData, phone: event.target.value })} placeholder="Optional contact number" /></div>}
                      {selectedNeedsPayment && (
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
                      <button className="group-btn primary" type="button" disabled={busy} onClick={selectedNeedsPayment ? handleSubmitPayment : handleRegisterEvent}>{myPayment ? "Update payment details" : selectedNeedsPayment ? (selectedCollection.collectionType === "event" ? "Pay / submit proof" : "Submit proof") : "Register"}</button>
                    </>
                  ) : myPayment?.status === "paid" ? null : (
                    <button className="group-btn ghost" type="button" onClick={() => setShowPaymentForm(true)}>{selectedNeedsPayment ? (myPayment?.status === "registered" ? "Pay / submit proof" : "Resubmit proof") : "Update registration"}</button>
                  )}
                </div>
              )}

              {memberCanVerify && <div className="payment-card">
                <h4>People</h4>
                {payments.length > 0 && <div className="group-field"><label>Search people</label><input value={paymentSearch} onChange={event => setPaymentSearch(event.target.value)} placeholder="Search by name, phone, ref, or status" /></div>}
                {filteredPayments.length === 0 ? (
                  <div className="payment-meta">No payment proofs yet.</div>
                ) : filteredPayments.map(payment => (
                  <div key={payment.id} className="payment-row">
                    <span className={`payment-pill ${statusClass(payment.status)}`}>{payment.status || "pending"}</span>
                    <div className="payment-row-main">
                      <div className="member-name">{payment.studentName || "Student"}</div>
                      <div className="payment-detail-grid">
                        <span><small>Amount</small><strong>{(payment.amountPaid || 0).toLocaleString()} TSh</strong></span>
                        {selectedNeedsPayment ? <span><small>Remaining</small><strong>{Math.max(0, Number(selectedCollection.amount || 0) - Number(payment.amountPaid || 0)).toLocaleString()} TSh</strong></span> : null}
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
                    </div>
                    {memberCanVerify && (
                      <div className="group-inline-actions">
                        {payment.status !== "paid" && <button className="group-btn secondary" type="button" disabled={busy} onClick={() => handleVerify(payment, "paid")}>Paid</button>}
                        {payment.status !== "rejected" && <button className="group-btn ghost" type="button" disabled={busy} onClick={() => handleVerify(payment, "rejected")}>Reject</button>}
                        <button className="group-btn ghost" type="button" disabled={busy} onClick={() => handleAdjustAmount(payment)}>Adjust amount</button>
                        <button className="group-btn ghost" type="button" disabled={busy} onClick={() => handleRequestProof(payment)}>Request proof</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>}
            </>
          )}
        </div>
      )}

      {canViewGroupContent && activeTab === "workgroups" && (
        <div className="group-panel">
          <div className="class-board-header">
            <div>
              <strong>Work Groups</strong>
              <span>Create class groups, assign tasks, and receive submissions from each group.</span>
            </div>
            {memberCanManage && (
              <button type="button" className="group-btn primary compact" onClick={openCreateWorkGroupForm}>
                Add
              </button>
            )}
          </div>

          {workGroups.length === 0 ? (
            <div className="resource-box">No work groups yet. Leaders can create Group 01, Group 02, assign members, and collect submissions here.</div>
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
                        <strong>{workGroup.name}{workGroup.createdAt?.getTime?.() > openedReadAtRef.current && <span className="inline-new-pill">New</span>}</strong>
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
            <div style={{ marginBottom: 10 }}>
              <button
                className="group-btn primary"
                type="button"
                onClick={() => {
                  if (!showTrackerForm) pushGroupHistory();
                  setShowTrackerForm(value => !value);
                  setTrackerData(prev => ({ ...prev, collectionType: "event", visibility: "public", amount: "" }));
                }}
              >
                {showTrackerForm ? "Close form" : "Create event"}
              </button>
            </div>
          )}
          {showTrackerForm && renderTrackerForm()}
          {selectedCollection && selectedCollection.collectionType === "event" && (
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
                {selectedCollection.photoUrl && <img className="tracker-card-photo" src={selectedCollection.photoUrl} alt="" />}
                <h4>{selectedCollection.title}</h4>
                <div className="payment-meta">
                  {selectedCollection.description || "Event details"}
                  {selectedCollection.deadline ? ` - Deadline: ${selectedCollection.deadline}` : ""}
                  {Number(selectedCollection.amount || 0) > 0 ? ` - ${Number(selectedCollection.amount || 0).toLocaleString()} TSh` : " - Free registration"}
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
                  </div>
                )}
              </div>
              {user && (
                <div className="payment-card">
                  <h4>{selectedNeedsPayment ? "Pay for event" : "Register"}</h4>
                  {myPayment && (
                    <div className="member-payment-card">
                      <span className={`payment-pill ${statusClass(myPayment.status)}`}>{myPaymentStatusLabel || myPayment.status || "pending"}</span>
                      <strong>{selectedNeedsPayment ? "Your payment is on record." : "You are registered."}</strong>
                      <span>{myPayment.amountPaid ? `${Number(myPayment.amountPaid).toLocaleString()} TSh` : selectedNeedsPayment ? "Amount not recorded" : "Registered"}</span>
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
                      <button className="group-btn ghost" type="button" onClick={() => setShowPaymentForm(true)}>Pay now</button>
                    </div>
                  )}
                  {(!myPayment && !selectedPaidEvent) || showPaymentForm || myPayment?.proofRequested ? (
                    <>
                      {!selectedNeedsPayment && <div className="group-field"><label>Phone number</label><input value={paymentData.phone} onChange={event => setPaymentData({ ...paymentData, phone: event.target.value })} placeholder="Optional contact number" /></div>}
                      {selectedNeedsPayment && (
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
                      <button className="group-btn primary" type="button" disabled={busy} onClick={selectedNeedsPayment ? handleSubmitPayment : handleRegisterEvent}>{myPayment ? "Update payment details" : selectedNeedsPayment ? "Pay / submit proof" : "Register"}</button>
                    </>
                  ) : myPayment?.status === "paid" ? null : (
                    <button className="group-btn ghost" type="button" onClick={() => setShowPaymentForm(true)}>{selectedNeedsPayment ? (myPayment?.status === "registered" ? "Pay / submit proof" : "Resubmit proof") : "Update registration"}</button>
                  )}
                </div>
              )}
              {!user && (
                <div className="payment-card">
                  <h4>{selectedNeedsPayment ? "Register, then pay" : "Register"}</h4>
                  <div className="payment-meta">Sign in to register for this public event. You can pay later if payment is required.</div>
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
                        <div className="member-name">{payment.studentName || "Student"}</div>
                        <div className="payment-detail-grid">
                          <span><small>Amount</small><strong>{(payment.amountPaid || 0).toLocaleString()} TSh</strong></span>
                          {selectedNeedsPayment ? <span><small>Remaining</small><strong>{Math.max(0, Number(selectedCollection.amount || 0) - Number(payment.amountPaid || 0)).toLocaleString()} TSh</strong></span> : null}
                          {payment.phone ? <span><small>Phone</small><strong>{payment.phone}</strong></span> : null}
                          {payment.paymentRef ? <span><small>Reference</small><strong>{payment.paymentRef}</strong></span> : null}
                        </div>
                      </div>
                      {memberCanVerify && (
                        <div className="group-inline-actions">
                          {payment.status !== "paid" && <button className="group-btn secondary" type="button" disabled={busy} onClick={() => handleVerify(payment, "paid")}>Paid</button>}
                          {payment.status !== "rejected" && <button className="group-btn ghost" type="button" disabled={busy} onClick={() => handleVerify(payment, "rejected")}>Reject</button>}
                          <button className="group-btn ghost" type="button" disabled={busy} onClick={() => handleAdjustAmount(payment)}>Adjust amount</button>
                          <button className="group-btn ghost" type="button" disabled={busy} onClick={() => handleRequestProof(payment)}>Request proof</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {eventCollections.length === 0 ? (
            <div className="group-empty">No events yet.</div>
          ) : selectedCollection?.collectionType === "event" ? null : eventCollections.map(eventItem => (
            <div key={eventItem.id} className="tracker-card event-card">
              {eventItem.photoUrl && <img className="tracker-card-photo" src={eventItem.photoUrl} alt="" />}
              <div>
                <strong>{eventItem.title}</strong>
                <span>{Number(eventItem.amount || 0) > 0 ? `${Number(eventItem.amount || 0).toLocaleString()} TSh` : "Free"}</span>
              </div>
              <p>
                {eventItem.description || "Event details"}
                {eventItem.deadline ? ` - Deadline: ${eventItem.deadline}` : ""}
                {eventItem.visibility ? ` - ${eventItem.visibility}` : ""}
              </p>
              <button
                className="group-btn secondary"
                type="button"
                onClick={() => {
                  openTracker(eventItem.id);
                }}
                style={{ marginTop: 10 }}
              >
                View
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
                        {!member.avatarUrl && groupAvatarText(member.name || member.email || "M")}
                      </div>
                      <div className="member-meta">
                        <div className="member-name">{member.name || member.email || "Member"}</div>
                        <div className="member-role">Requested to join</div>
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
                    {!member.avatarUrl && groupAvatarText(member.name || member.email || "M")}
                  </div>
                  <div className="member-meta">
                    <div className="member-name">{member.name || member.email || "Member"}</div>
                    <div className="member-role">{member.role || "member"}</div>
                  </div>
                  {memberCanEditGroup && member.role !== "owner" ? (
                    <select className="member-role-select" value={member.role || "member"} disabled={busy} onChange={event => handleRoleChange(member, event.target.value)}>
                      {GROUP_ROLES.filter(role => role !== "owner").map(role => <option key={role} value={role}>{role}</option>)}
                    </select>
                  ) : (
                    <span className="group-role-pill">{member.role || "member"}</span>
                  )}
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
              <strong>Class Board</strong>
              <span>Organized links, notes, deadlines, and files for this group.</span>
            </div>
            {memberCanManage && (
              <button type="button" className="group-btn primary compact" onClick={openCreateResourceForm}>
                Add
              </button>
            )}
          </div>
          {sortedResources.length > 0 && (
            <div className="class-board-latest">
              <div className="group-section-title">Latest updates</div>
              {sortedResources.slice(0, 3).map(resource => (
                <a key={resource.id} className="class-board-update" href={resource.url || undefined} target={resource.url ? "_blank" : undefined} rel="noreferrer">
                  <strong>{resource.title || resource.text}</strong>
                  <span>{resource.subject || "General"}{resource.topic ? ` - ${resource.topic}` : ""}</span>
                </a>
              ))}
            </div>
          )}
          {sortedResources.length === 0 ? (
            <div className="resource-box">No resources yet. Add Drive links, notes, past papers, deadlines, or class files here.</div>
          ) : Object.entries(groupedResources).map(([subject, items]) => (
            <div key={subject} className="class-board-subject">
              <div className="class-board-subject-title">{subject}</div>
              {items.map(resource => (
                <div key={resource.id} className="resource-box class-board-resource">
                  <div className="resource-title">{resource.title || resource.text}{resource.createdAt?.getTime?.() > openedReadAtRef.current && <span className="inline-new-pill">New</span>}</div>
                  {resource.topic && <div className="class-board-topic">{resource.topic}</div>}
                  {(resource.description || (resource.text && resource.title && resource.text !== resource.title)) && (
                    <div className="resource-text">{resource.description || resource.text}</div>
                  )}
                  <div className="class-board-meta">
                    {resource.deadline && <span>Deadline: {resource.deadline}</span>}
                    {resource.createdAt && <span>Added {formatDate(resource.createdAt)}</span>}
                  </div>
                  <div className="group-inline-actions">
                    {resource.url && <a className="group-btn secondary group-link-btn" href={resource.url} target="_blank" rel="noreferrer">Open file / resource</a>}
                    {memberCanManage && <button className="group-btn ghost" type="button" onClick={() => openEditResourceForm(resource)}>Edit</button>}
                    {memberCanManage && <button className="group-btn danger" type="button" disabled={busy} onClick={() => handleDeleteResource(resource)}>Delete</button>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {showResourceForm && (
        <div className="group-modal-backdrop" onClick={() => setShowResourceForm(false)}>
          <div className="group-modal" onClick={event => event.stopPropagation()}>
            <h3>{editingResourceId ? "Edit Board Resource" : "Add Board Resource"}</h3>
            <div className="group-field">
              <label>Title</label>
              <input value={resourceData.title} onChange={event => setResourceData({ ...resourceData, title: event.target.value })} placeholder="Resection and Intersection notes" />
            </div>
            <div className="group-field">
              <label>Subject / folder</label>
              <input value={resourceData.subject} onChange={event => setResourceData({ ...resourceData, subject: event.target.value })} placeholder="Topographical Surveying" />
            </div>
            <div className="group-field">
              <label>Topic</label>
              <input value={resourceData.topic} onChange={event => setResourceData({ ...resourceData, topic: event.target.value })} placeholder="Week 4 - Resection / Intersection" />
            </div>
            <div className="group-field">
              <label>Link</label>
              <input value={resourceData.url} onChange={event => setResourceData({ ...resourceData, url: event.target.value })} placeholder="Google Drive, PDF, YouTube, or any resource link" />
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
        <div className="group-modal-backdrop" onClick={() => setShowWorkGroupForm(false)}>
          <div className="group-modal" onClick={event => event.stopPropagation()}>
            <h3>{editingWorkGroupId ? "Edit Work Group" : "Create Work Group"}</h3>
            <div className="group-field">
              <label>Group name</label>
              <input value={workGroupData.name} onChange={event => setWorkGroupData({ ...workGroupData, name: event.target.value })} placeholder="Group 01" />
            </div>
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
            <div className="group-field">
              <label>Members</label>
              <div className="workgroup-member-picker">
                {activeMembers.length === 0 ? (
                  <div className="payment-meta">No active members yet.</div>
                ) : activeMembers.map(member => {
                  const selected = workGroupData.memberUids.includes(member.uid);
                  return (
                    <label key={member.uid} className={`workgroup-member-option ${selected ? "selected" : ""}`}>
                      <input type="checkbox" checked={selected} onChange={() => toggleWorkGroupMember(member.uid)} />
                      <span>{member.name || member.email || "Member"}</span>
                    </label>
                  );
                })}
              </div>
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
            <div className="group-inline-actions">
              <button className="group-btn primary" type="button" disabled={busy} onClick={handleSaveWorkGroup}>
                {busy ? "Saving..." : editingWorkGroupId ? "Update work group" : "Create work group"}
              </button>
              <button className="group-btn ghost" type="button" disabled={busy} onClick={() => { setShowWorkGroupForm(false); setEditingWorkGroupId(""); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showPinnedFocus && (
        <div className="group-modal-backdrop" onClick={() => setShowPinnedFocus(false)}>
          <div className="group-modal pinned-focus-modal" onClick={event => event.stopPropagation()}>
            <h3>{currentAction?.title || "Pinned update"}</h3>
            <p>{currentAction?.description || group.desc}</p>
            {currentAction?.amount ? <div className="pinned-focus-amount">{Number(currentAction.amount).toLocaleString()} TSh</div> : null}
            {group.desc && currentAction ? <small>{group.desc}</small> : null}
            <div className="group-inline-actions">
              {memberCanManage && (
                <button className="group-btn primary" type="button" onClick={() => { setShowPinnedFocus(false); handleEditPinnedUpdate(); }}>
                  Edit
                </button>
              )}
              <button className="group-btn ghost" type="button" onClick={() => setShowPinnedFocus(false)}>
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
            <input id="group-avatar-upload" type="file" accept="image/*" style={{ display: "none" }} onChange={handleGroupAvatarSelect} />
            <label htmlFor="group-avatar-upload" className="group-avatar-editor">
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
            </label>
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
