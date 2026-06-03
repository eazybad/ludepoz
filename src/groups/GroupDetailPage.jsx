import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import "./GroupComponents.css";
import {
  GROUP_ROLES,
  DEFAULT_GROUP_NOTIFICATION_PREFS,
  canManageGroup,
  canVerifyPayments,
  createGroupCollection,
  groupAvatarText,
  isGroupMember,
  leaveUniversityGroup,
  paymentSummary,
  sendGroupMessage,
  submitGroupPayment,
  registerGroupEvent,
  subscribeChannelMessages,
  subscribeCollectionPayments,
  subscribeGroupCollections,
  subscribeGroupMembers,
  subscribeMyCollectionPayment,
  requestGroupPaymentProof,
  sendCollectionDeadlineReminder,
  updateGroupMentionPermission,
  updateGroupMute,
  updateGroupNotificationPreferences,
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
    members: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.8" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>,
    resources: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h5" /></>,
    events: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    mute: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" /><path d="M10 21h4" /><path d="M3 3l18 18" /></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" /><path d="M10 21h4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 9c.2.6.8 1 1.5 1H21a2 2 0 1 1 0 4h-.2c-.7 0-1.3.4-1.5 1Z" /></>,
    leave: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function formatDate(value) {
  if (!value) return "";
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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
  onJoinGroup,
  joiningGroup,
  onShareGroup,
  onLeaveGroup,
  onMarkRead,
  onError,
  onSuccess,
  onBackHandlerChange,
  onGroupUpdated,
}) {
  const [activeTab, setActiveTab] = useState("chats");
  const [menuOpen, setMenuOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [resources, setResources] = useState([]);
  const [collections, setCollections] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [payments, setPayments] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [posting, setPosting] = useState(false);
  const [showTrackerForm, setShowTrackerForm] = useState(false);
  const [trackerData, setTrackerData] = useState(emptyTracker);
  const [paymentData, setPaymentData] = useState(emptyPayment);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [expandedProofUrl, setExpandedProofUrl] = useState("");
  const [mentionPermission, setMentionPermission] = useState(group.mentionPermission || "admins");
  const [showEditGroup, setShowEditGroup] = useState(false);
  const [editGroupData, setEditGroupData] = useState({ name: group.name || "", desc: group.desc || "", avatarFile: null, avatarPreview: group.avatarUrl || "" });
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [notificationPrefsDraft, setNotificationPrefsDraft] = useState(DEFAULT_GROUP_NOTIFICATION_PREFS);
  const [busy, setBusy] = useState(false);
  const groupNavDepth = useRef(0);

  const profile = useMemo(() => ({ name: userName, avatarUrl: userAvatar }), [userName, userAvatar]);
  const currentMember = useMemo(() => members.find(member => member.uid === user?.uid && member.status === "active") || null, [members, user]);
  const memberCanManage = canManageGroup(currentMember) || group.adminUid === user?.uid || group.ownerUid === user?.uid;
  const memberCanEditGroup = ["owner", "admin"].includes(currentMember?.role) || group.adminUid === user?.uid || group.ownerUid === user?.uid;
  const memberCanVerify = canVerifyPayments(currentMember) || group.adminUid === user?.uid || group.ownerUid === user?.uid;
  const memberCanChat = isGroupMember(currentMember) || memberCanManage;
  const selectedCollection = collections.find(item => item.id === selectedCollectionId) || null;
  const eventCollections = collections.filter(item => (item.collectionType || "") === "event");
  const selectedNeedsPayment = Number(selectedCollection?.amount || 0) > 0;
  const myPayment = payments.find(payment => payment.uid === user?.uid || payment.id === user?.uid) || null;
  const myPaymentStatusLabel = myPayment?.status === "paid"
    ? "Paid"
    : myPayment?.status === "registered"
      ? "Registered"
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
  const summary = memberCanVerify ? paymentSummary(selectedCollection, payments) : paymentSummary(selectedCollection, myPayment ? [myPayment] : []);
  const pinnedMessage = messages.find(message => message.pinned || message.kind === "announcement");
  const currentAction = group.currentAction || (pinnedMessage ? {
    type: pinnedMessage.kind === "announcement" ? "announcement" : "message",
    title: "Pinned update",
    description: pinnedMessage.text,
  } : null);

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
  }, [activeTab, expandedProofUrl, selectedCollectionId, showPaymentForm, showTrackerForm]);

  useEffect(() => {
    if (!group?.id) return undefined;
    const unsubMembers = subscribeGroupMembers(db, group.id, setMembers, onError);
    const unsubMessages = subscribeChannelMessages(db, group.id, "chats", setMessages, onError);
    const unsubResources = subscribeChannelMessages(db, group.id, "resources", setResources, onError);
    const unsubCollections = subscribeGroupCollections(db, group.id, items => {
      setCollections(items);
      setSelectedCollectionId(prev => (prev && items.some(item => item.id === prev)) ? prev : "");
    }, onError);
    return () => {
      unsubMembers();
      unsubMessages();
      unsubResources();
      unsubCollections();
    };
  }, [db, group?.id, onError]);

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
      if (groupNavDepth.current <= 0) return;

      if (!goBackWithinGroup()) return;

      event.stopImmediatePropagation();
      groupNavDepth.current -= 1;
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
      });
      setMessageText("");
      markCurrentGroupRead();
    } catch (err) {
      onError(err);
    } finally {
      setPosting(false);
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
    <div className="group-detail">
      <div className="group-wa-header">
        <div className="group-header-main">
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
              {currentMember?.role ? ` · ${currentMember.role}` : ""}
            </div>
          </div>
          <button type="button" className="group-icon-btn" aria-label="Share group" onClick={onShareGroup}>↗</button>
          <div className="group-menu-wrap">
            <button type="button" className="group-icon-btn" aria-label="Open group menu" onClick={() => setMenuOpen(value => !value)}>⋮</button>
            {menuOpen && (
              <>
                <button type="button" className="group-menu-scrim" aria-label="Close group menu" onClick={() => setMenuOpen(false)} />
                <div className="group-side-menu">
                  <div className="group-side-menu-title">{group.name}</div>
                  {[
                    ["chats", "Chats", "💬"],
                    ["payments", "Payments", "💳"],
                    ["members", "Members", "👥"],
                    ["resources", "Resources", "📎"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`group-menu-item ${activeTab === id ? "active" : ""}`}
                      onClick={() => switchGroupTab(id)}
                    >
                      <span><MenuIcon name={id} /></span>
                      <strong>{label}</strong>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`group-menu-item ${activeTab === "events" ? "active" : ""}`}
                    onClick={() => switchGroupTab("events")}
                  >
                    <span><MenuIcon name="events" /></span>
                    <strong>Events</strong>
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
        {currentAction || group.desc ? (
          <div className={`group-pin ${isGroupMember(currentMember) ? "active-member" : ""}`}>
            <strong>{currentAction?.title || "Current action"}:</strong> {currentAction?.description || group.desc}
            {currentAction?.amount ? <span> · {Number(currentAction.amount).toLocaleString()} TSh</span> : null}
          </div>
        ) : null}
        {currentAction && group.desc ? (
          <div className="group-description-strip">{group.desc}</div>
        ) : null}
        {!isGroupMember(currentMember) && user && (
          <div style={{ padding: "0 12px 10px" }}>
            <button type="button" className="group-btn secondary" style={{ width: "100%" }} disabled={joiningGroup} onClick={onJoinGroup}>
              {joiningGroup ? "Joining..." : "Join Group"}
            </button>
          </div>
        )}
        <div className="group-current-channel">{activeTab}</div>
      </div>

      {activeTab === "chats" && (
        <div className="group-panel chat-panel">
          {messages.length === 0 ? (
            <div className="group-empty">No messages yet.</div>
          ) : (
            <div className="message-list">
              {messages.map(message => (
                <div key={message.id} className={`message-bubble ${message.kind === "announcement" ? "announcement" : ""}`}>
                  <div className="message-author">{message.authorName || "Member"}</div>
                  <div className="message-text">{message.text}</div>
                  <div className="message-time">{formatDate(message.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
          {memberCanChat && (
            <div className="composer chat-composer">
              <textarea value={messageText} onChange={event => setMessageText(event.target.value)} placeholder="Send a message. Use @firstName to tag someone." />
              <div className="group-inline-actions">
                <button className="group-btn primary" type="button" disabled={posting || !messageText.trim()} onClick={() => handlePost("message")}>Send</button>
                {memberCanManage && <button className="group-btn warn" type="button" disabled={posting || !messageText.trim()} onClick={() => handlePost("announcement")}>Pin announcement</button>}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "payments" && (
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
                  <h4>{selectedCollection.title}</h4>
                  <div className="payment-meta">
                    {selectedNeedsPayment ? `${(selectedCollection.amount || 0).toLocaleString()} TSh per member` : "Registration only"}
                    {selectedCollection.expectedPeople ? ` · ${selectedCollection.expectedPeople} expected` : ""}
                    {selectedCollection.paymentMethods?.length ? ` · Pay: ${selectedCollection.paymentMethods.join(" / ")}` : ""}
                  </div>
                  {memberCanManage && (
                    <div className="group-inline-actions" style={{ marginTop: 10 }}>
                      <button className="group-btn secondary" type="button" disabled={busy} onClick={handleSendDeadlineReminder}>
                        Send deadline reminder
                      </button>
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
                  {!myPayment || showPaymentForm || myPayment.proofRequested ? (
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
                      <button className="group-btn primary" type="button" disabled={busy} onClick={selectedNeedsPayment ? handleSubmitPayment : handleRegisterEvent}>{myPayment ? "Update details" : selectedNeedsPayment ? (selectedCollection.collectionType === "event" ? "Pay / submit proof" : "Submit proof") : "Register"}</button>
                    </>
                  ) : myPayment?.status === "paid" ? null : (
                    <button className="group-btn ghost" type="button" onClick={() => setShowPaymentForm(true)}>{selectedNeedsPayment ? "Resubmit proof" : "Update registration"}</button>
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
                    {memberCanVerify && payment.status !== "paid" && (
                      <div className="group-inline-actions">
                        <button className="group-btn secondary" type="button" disabled={busy} onClick={() => handleVerify(payment, "paid")}>Paid</button>
                        <button className="group-btn ghost" type="button" disabled={busy} onClick={() => handleVerify(payment, "rejected")}>Reject</button>
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

      {activeTab === "events" && (
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
                <h4>{selectedCollection.title}</h4>
                <div className="payment-meta">
                  {selectedCollection.description || "Event details"}
                  {selectedCollection.deadline ? ` · Deadline: ${selectedCollection.deadline}` : ""}
                  {Number(selectedCollection.amount || 0) > 0 ? ` · ${Number(selectedCollection.amount || 0).toLocaleString()} TSh` : " · Free registration"}
                </div>
                {memberCanManage && (
                  <div className="group-inline-actions" style={{ marginTop: 10 }}>
                    <button className="group-btn secondary" type="button" disabled={busy} onClick={handleSendDeadlineReminder}>
                      Send deadline reminder
                    </button>
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
                    </div>
                  )}
                  {!myPayment || showPaymentForm || myPayment.proofRequested ? (
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
                      <button className="group-btn primary" type="button" disabled={busy} onClick={selectedNeedsPayment ? handleSubmitPayment : handleRegisterEvent}>{myPayment ? "Update details" : selectedNeedsPayment ? "Pay / submit proof" : "Register"}</button>
                    </>
                  ) : myPayment?.status === "paid" ? null : (
                    <button className="group-btn ghost" type="button" onClick={() => setShowPaymentForm(true)}>{selectedNeedsPayment ? "Resubmit proof" : "Update registration"}</button>
                  )}
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
                        <div className="payment-meta">{payment.phone || "No phone"}{payment.paymentRef ? ` · ${payment.paymentRef}` : ""}</div>
                      </div>
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
                {eventItem.deadline ? ` · Deadline: ${eventItem.deadline}` : ""}
                {eventItem.visibility ? ` · ${eventItem.visibility}` : ""}
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

      {activeTab === "members" && (
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
              {members.map(member => (
                <div key={member.uid || member.id} className="member-row">
                  <div className="group-avatar" style={{ width: 38, height: 38, fontSize: 12, backgroundImage: member.avatarUrl ? `url(${member.avatarUrl})` : undefined, backgroundSize: "cover" }}>
                    {!member.avatarUrl && groupAvatarText(member.name || member.email || "M")}
                  </div>
                  <div className="member-meta">
                    <div className="member-name">{member.name || member.email || "Member"}</div>
                    <div className="member-role">{member.role || "member"}</div>
                  </div>
                  {memberCanManage && member.role !== "owner" ? (
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

      {activeTab === "resources" && (
        <div className="group-panel">
          {resources.length === 0 ? (
            <div className="resource-box">No resources yet.</div>
          ) : resources.map(resource => (
            <div key={resource.id} className="resource-box">
              <div className="resource-title">{resource.title || resource.text}</div>
              {resource.text && resource.title && <div className="resource-text">{resource.text}</div>}
              {resource.url && <a href={resource.url} target="_blank" rel="noreferrer">Open resource</a>}
              <div className="message-time">{formatDate(resource.createdAt)}</div>
            </div>
          ))}
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

      {expandedProofUrl && (
        <button type="button" className="proof-lightbox" onClick={() => setExpandedProofUrl("")} aria-label="Close payment proof preview">
          <img src={expandedProofUrl} alt="Expanded payment proof" />
        </button>
      )}
    </div>
  );
}
