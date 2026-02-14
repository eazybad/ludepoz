import { useState, useEffect, useCallback } from "react";
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendEmailVerification } from 'firebase/auth';
import { initializeFirestore, collection, addDoc, updateDoc, doc, query, where, getDocs, serverTimestamp, orderBy, setDoc, getDoc, onSnapshot, increment, deleteDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyANHZKNAfYFlEFAQ0lwG50PMOv2OBrEXEY",
  authDomain: "ludepoz.firebaseapp.com",
  projectId: "ludepoz",
  storageBucket: "ludepoz.firebasestorage.app",
  messagingSenderId: "621042040835",
  appId: "1:621042040835:web:011319e9504f928e75ce36"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);
const auth = getAuth(app);
const db = initializeFirestore(app, {});
const storage = getStorage(app);

const DEFAULT_UNI = { id: 1, name: "University of Dar es Salaam", short: "UDSM", location: "Dar es Salaam" };

const CATEGORIES = [
  { id: "all", name: "All", icon: "◻" },
  { id: "notes", name: "Notes & Books", icon: "📓" },
  { id: "electronics", name: "Electronics", icon: "💻" },
  { id: "furniture", name: "Furniture", icon: "🪑" },
  { id: "roommates", name: "Roommates", icon: "🤝" },
  { id: "rooms", name: "Room Leasing", icon: "🏠" },
  { id: "clothing", name: "Clothing", icon: "👕" },
  { id: "other", name: "Other", icon: "📦" },
];

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState("signup");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [userName, setUserName] = useState("");
  const [userAvatar, setUserAvatar] = useState(null);
  const [selectedUni, setSelectedUni] = useState(DEFAULT_UNI);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [page, setPage] = useState("home");
  const [profileTab, setProfileTab] = useState("listings");
  const [activeCat, setActiveCat] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [listings, setListings] = useState([]);
  const [cart, setCart] = useState([]);
  const [createData, setCreateData] = useState({ 
  cat: "", 
  title: "", 
  desc: "", 
  price: "", 
  cond: "", 
  photoFiles: [],      // Changed from photoFile to photoFiles (array)
  photoPreviews: []    // Changed from photoPreview to photoPreviews (array)
});
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [fullScreenPhotos, setFullScreenPhotos] = useState(null); // array of all photos
  const [fullScreenIndex, setFullScreenIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showCreateSuccess, setShowCreateSuccess] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editProfileData, setEditProfileData] = useState({ name: "", avatarFile: null, avatarPreview: null });
  const [uploading, setUploading] = useState(false);
  const [showVerificationBanner, setShowVerificationBanner] = useState(false);
  const [showSafetyMessage, setShowSafetyMessage] = useState(true);
  const [showChatTip, setShowChatTip] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState("");
  const [viewingListing, setViewingListing] = useState(null);
  const [sellerStats, setSellerStats] = useState(null);
  const [openListingId, setOpenListingId] = useState(null);
  const [viewedListingsSet, setViewedListingsSet] = useState(() => {
  const stored = localStorage.getItem('viewedListings');
  return new Set(stored ? JSON.parse(stored) : []);
   });

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [isVerified, setIsVerified] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [studentIdFile, setStudentIdFile] = useState(null);
  const [studentIdPreview, setStudentIdPreview] = useState(null); 
  const [verificationStatus, setVerificationStatus] = useState(null);

  // Activity tab state
  const [activityData, setActivityData] = useState({ activeSellers: [], verifiedSellers: [], recentDeals: [] });
  const [activityTab, setActivityTab] = useState("active");
  const [activityLoading, setActivityLoading] = useState(false);

  const isExpired = (listing) => {
    if (!listing.expiresAt) return false;
    const expiryDate = listing.expiresAt.toDate ? listing.expiresAt.toDate() : new Date(listing.expiresAt);
    return expiryDate < new Date();
  };
  
 const canPerformAction = (action = "default") => {
  if (!user) return false;
  return true;
};

  // Require auth - shows modal if not logged in
  const requireAuth = (action, callback) => {
    if (user) { callback(); return; }
    setShowAuthModal(true);
  };

  // WhatsApp share for a listing
  const shareOnWhatsApp = (item) => {
    const sellerUni = item.universityName || "campus";
    const priceStr = item.price ? `TSh ${item.price.toLocaleString()}` : "";
    const appUrl = "https://kampasika.netlify.app";
    const msg = `Hey! I found this ${sellerUni} student's listing on Kampasika:\n\n` +
      `*${item.title}*${priceStr ? ` — ${priceStr}` : ""}\n` +
      `${item.description ? item.description.substring(0, 80) + (item.description.length > 80 ? '...' : '') + '\n' : ''}` +
      `By ${item.userName} (${sellerUni})\n` +
      `\nCheck it out on Kampasika: ${appUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const getTimeUntilExpiry = (listing) => {
    if (!listing.expiresAt) return "";
    const expiryDate = listing.expiresAt.toDate ? listing.expiresAt.toDate() : new Date(listing.expiresAt);
    const now = new Date();
    const diff = expiryDate - now;
    
    if (diff < 0) {
      const daysPast = Math.floor(Math.abs(diff) / (1000 * 60 * 60 * 24));
      return `Expired ${daysPast > 0 ? daysPast + ' days' : 'today'}`;
    }
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 24) return `Expires in ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Expires in ${days}d`;
  };

  const renewListing = async (listingId) => {
    try {
      const newExpiry = new Date(Date.now() + 48 * 3600000);
      await updateDoc(doc(db, "listings", listingId), {
        expiresAt: newExpiry,
        renewedAt: serverTimestamp()
      });
      await loadListings();
      setSuccess("Listing renewed for 48 hours!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error renewing listing:", err);
      setError("Failed to renew listing");
    }
  };

  const deleteListing = async (listingId) => {
    if (!window.confirm("Delete this listing permanently?")) return;
    try {
      await deleteDoc(doc(db, "listings", listingId));
      await loadListings();
      setSuccess("Listing deleted!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error deleting listing:", err);
      setError("Failed to delete listing");
    }
  };
  
  const deleteConversation = async (conversationId) => {
  if (!window.confirm("Delete this conversation? This cannot be undone.")) return;
  try {
    // Delete all messages in the conversation first
    const messagesQuery = query(
      collection(db, "conversations", conversationId, "messages")
    );
    const messagesSnap = await getDocs(messagesQuery);
    const deletePromises = messagesSnap.docs.map(d => 
      deleteDoc(doc(db, "conversations", conversationId, "messages", d.id))
    );
    await Promise.all(deletePromises);
    
    // Then delete the conversation itself
    await deleteDoc(doc(db, "conversations", conversationId));
    
    // Update local state
    setConversations(prev => prev.filter(c => c.id !== conversationId));
    setSuccess("Conversation deleted");
    setTimeout(() => setSuccess(""), 3000);
  } catch (err) {
    console.error("Error deleting conversation:", err);
    setError("Failed to delete conversation");
  }
};

  const submitReport = async () => {
    if (!reportReason.trim() || !reportTarget) return;
    
    try {
      await addDoc(collection(db, "reports"), {
        reporterId: user.uid,
        reporterName: userName,
        targetType: reportTarget.type,
        targetId: reportTarget.id,
        targetName: reportTarget.name,
        reason: reportReason.trim(),
        createdAt: serverTimestamp(),
        status: "pending"
      });
      
      setSuccess("Report submitted. We'll review it shortly.");
      setShowReportModal(false);
      setReportTarget(null);
      setReportReason("");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error submitting report:", err);
      setError("Failed to submit report");
    }
  };

  const loadListings = useCallback(async () => {
  try {
    let q = query(
      collection(db, "listings"),
      where("sold", "==", false),
      orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);
    const listingsData = querySnapshot.docs.map(doc => ({ 
      id: doc.id, ...doc.data(), 
      createdAt: doc.data().createdAt?.toDate() 
    }));
    setListings(listingsData);
  } catch (err) {
    console.error("Error loading listings:", err);
    try {
      let q2 = query(
        collection(db, "listings"),
        where("sold", "==", false)
      );
      const querySnapshot2 = await getDocs(q2);
      const listingsData2 = querySnapshot2.docs.map(doc => ({ 
        id: doc.id, ...doc.data(), 
        createdAt: doc.data().createdAt?.toDate() 
      }));
      setListings(listingsData2);
    } catch (err2) {
      console.error("Error loading listings (fallback):", err2);
    }
  }
}, []);

  // Load activity data
  const loadActivityData = useCallback(async () => {
    setActivityLoading(true);
    try {
      const activeListingsQ = query(collection(db, "listings"), where("sold", "==", false), orderBy("createdAt", "desc"));
      const activeSnap = await getDocs(activeListingsQ);
      const sellerMap = {};
      activeSnap.docs.forEach(d => {
        const data = d.data();
        const expiryDate = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
        if (expiryDate > new Date()) {
          if (!sellerMap[data.userId]) {
            sellerMap[data.userId] = { userId: data.userId, name: data.userName, avatar: data.userAvatar, uni: data.universityName, activeCount: 0, latestTitle: data.title, latestPrice: data.price };
          }
          sellerMap[data.userId].activeCount++;
        }
      });
      const activeSellers = Object.values(sellerMap).sort((a,b) => b.activeCount - a.activeCount);
      let verifiedSellers = [];
      try {
        const verifiedQ = query(collection(db, "verificationRequests"), where("status", "==", "approved"));
        const verifiedSnap = await getDocs(verifiedQ);
        verifiedSellers = verifiedSnap.docs.map(d => ({ userId: d.data().userId, name: d.data().userName, uni: d.data().universityName }));
      } catch(e) { console.log("Verified query failed:", e); }
      let recentDeals = [];
      try {
        const dealsQ = query(collection(db, "listings"), where("sold", "==", true), orderBy("soldAt", "desc"));
        const dealsSnap = await getDocs(dealsQ);
        recentDeals = dealsSnap.docs.slice(0, 20).map(d => {
          const data = d.data();
          return { id: d.id, title: data.title, price: data.price, sellerName: data.userName, uni: data.universityName, soldAt: data.soldAt?.toDate ? data.soldAt.toDate() : new Date(data.soldAt), category: data.category };
        });
      } catch(e) {
        try {
          const dealsQ2 = query(collection(db, "listings"), where("sold", "==", true));
          const dealsSnap2 = await getDocs(dealsQ2);
          recentDeals = dealsSnap2.docs.slice(0, 20).map(d => {
            const data = d.data();
            return { id: d.id, title: data.title, price: data.price, sellerName: data.userName, uni: data.universityName, soldAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(), category: data.category };
          });
        } catch(e2) { console.log("Deals fallback failed:", e2); }
      }
      setActivityData({ activeSellers, verifiedSellers, recentDeals });
    } catch (err) { console.error("Error loading activity:", err); }
    finally { setActivityLoading(false); }
  }, []);

 const checkVerificationStatus = useCallback(async (userId) => {
  try {
    // Check if user already has a verification request
    const q = query(
      collection(db, "verificationRequests"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      // User has submitted verification request(s)
      const latestRequest = snapshot.docs[0].data();
      setVerificationStatus(latestRequest.status); // "pending", "approved", or "rejected"
      
      console.log("Verification status:", latestRequest.status);
      
      // If approved, set isVerified to true
      if (latestRequest.status === "approved") {
        setIsVerified(true);
      }
    } else {
      // No verification request yet
      setVerificationStatus(null);
    }
  } catch (err) {
    console.error("Error checking verification status:", err);
  }
}, []);

const requestNotificationPermission = async (currentUser) => {
  try {
    if (!currentUser) return;
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const token = await getToken(messaging, {
        vapidKey: "BCpZgxfVSjWFXh3ySZm5oeZb3ak8nEK_zCc9brxVGq-9JVgEIhpiJCOg3169zvMK4OvF3CBGzSq9YpMMnjYaGTE"
      });
      console.log("FCM Token:", token);

      await updateDoc(doc(db, "users", currentUser.uid), {
        fcmToken: token
      });

    } else {
      console.log("Notification permission denied");
    }
  } catch (error) {
    console.error("Error getting token:", error);
  }
};

 const loadUserProfile = useCallback(async (userId) => {
  try {
    const userDocRef = doc(db, "users", userId);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const userData = userDoc.data();
      setUserName(userData.name || "");
      setUserAvatar(userData.avatarUrl || null);
      setSelectedUni(DEFAULT_UNI);
      setIsVerified(userData.verified || false);
      
      // ⭐ CHECK VERIFICATION STATUS
      await checkVerificationStatus(userId);
      
      if (auth.currentUser && !auth.currentUser.emailVerified) {
        setShowVerificationBanner(true);
      }
    }
  } catch (err) {
    console.error("Error loading profile:", err);
  }
}, [checkVerificationStatus]); // ⭐ ADD DEPENDENCY

 
  const loadConversations = useCallback(async () => {
    if (!user) return;
    try {
      const q1 = query(
        collection(db, "conversations"),
        where("buyerId", "==", user.uid),
        orderBy("lastMessageAt", "desc")
      );
      const q2 = query(
        collection(db, "conversations"),
        where("sellerId", "==", user.uid),
        orderBy("lastMessageAt", "desc")
      );
      
      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      const convos1 = snap1.docs.map(d => ({ id: d.id, ...d.data() }));
      const convos2 = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const allConvos = [...convos1, ...convos2];
      const uniqueConvos = Array.from(new Map(allConvos.map(c => [c.id, c])).values());
      uniqueConvos.sort((a, b) => (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0));
      
      setConversations(uniqueConvos);
      
      const unread = uniqueConvos.reduce((sum, conv) => {
        const myUnread = user.uid === conv.buyerId ? conv.buyerUnread : conv.sellerUnread;
        return sum + (myUnread || 0);
      }, 0);
      setUnreadCount(unread);
    } catch (err) {
      console.error("Error loading conversations:", err);
    }
  }, [user]);

  const startConversation = async (listing) => {
    if (!user) {
      requireAuth("message", () => startConversation(listing));
      return;
    }

    if (user.uid === listing.userId) {
      setError("You can't message your own listing!");
      return;
    }
    
    try {
      const q = query(
        collection(db, "conversations"),
        where("listingId", "==", listing.id),
        where("buyerId", "==", user.uid)
      );
      
      const existing = await getDocs(q);
      
      if (!existing.empty) {
        const conv = { id: existing.docs[0].id, ...existing.docs[0].data() };
        setActiveConversation(conv);
        setPage("chat");
        await markAsRead(conv.id);
      } else {
        const newConv = await addDoc(collection(db, "conversations"), {
          listingId: listing.id,
          listingTitle: listing.title,
          listingPrice: listing.price,
          listingPhoto: listing.photoUrl || null,
          buyerId: user.uid,
          buyerName: userName,
          buyerAvatar: userAvatar,
          sellerId: listing.userId,
          sellerName: listing.userName,
          sellerAvatar: listing.userAvatar,
          lastMessage: "",
          lastMessageAt: serverTimestamp(),
          buyerUnread: 0,
          sellerUnread: 0,
          createdAt: serverTimestamp()
        });
        
        const convDoc = await getDoc(newConv);
        setActiveConversation({ id: convDoc.id, ...convDoc.data() });
        setPage("chat");
      }
    } catch (err) {
      console.error("Error starting conversation:", err);
      setError("Failed to start conversation");
    }
  };

 const sendMessage = async () => {
    if (!messageText.trim() || !activeConversation) return;
    
    const text = messageText.trim();
    setMessageText(""); // Clear immediately (optimistic)
    
    try {
      await addDoc(collection(db, "conversations", activeConversation.id, "messages"), {
        senderId: user.uid,
        senderName: userName,
        text: text,
        createdAt: serverTimestamp()
      });
      
      const isFromBuyer = user.uid === activeConversation.buyerId;
      await updateDoc(doc(db, "conversations", activeConversation.id), {
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        [isFromBuyer ? "sellerUnread" : "buyerUnread"]: increment(1)
      });
    } catch (err) {
      console.error("Error sending message:", err);
      setMessageText(text); // Restore text if failed
      setError("Failed to send message");
    }
  };

  const markAsRead = async (conversationId) => {
    if (!user) return;
    try {
      const convRef = doc(db, "conversations", conversationId);
      const convDoc = await getDoc(convRef);
      if (convDoc.exists()) {
        const conv = convDoc.data();
        const isFromBuyer = user.uid === conv.buyerId;
        const unreadField = isFromBuyer ? "buyerUnread" : "sellerUnread";
        if ((conv[unreadField] || 0) > 0) {
          await updateDoc(convRef, { [unreadField]: 0 });
        }
      }
    } catch (err) {
      console.error("Error marking as read:", err);
    }
  };

  useEffect(() => {
    // Load listings immediately for everyone (no auth required)
    loadListings();
    
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await requestNotificationPermission(currentUser);
        await loadUserProfile(currentUser.uid);
        await loadListings();
        await loadConversations();
      } else {
        setUser(null);
        setUserName("");
        setUserAvatar(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [loadUserProfile, loadListings, loadConversations]);

  const [tokenRequested, setTokenRequested] = useState(false);

useEffect(() => {
  if (!user || tokenRequested) return;

  requestNotificationPermission(user);
  setTokenRequested(true);

}, [user, tokenRequested]);


  useEffect(() => {
    if (page === "home") {
      const interval = setInterval(() => loadListings(), 30000);
      return () => clearInterval(interval);
    }
  }, [page, loadListings]);

  useEffect(() => {
  const unsubscribe = onMessage(messaging, (payload) => {
    console.log("Message received:", payload);

    new Notification(payload.notification.title, {
      body: payload.notification.body,
      icon: '/logo192.png'
    });
  });

  return () => unsubscribe();
}, []);

  useEffect(() => {
    if (user && page === "messages") {
      const interval = setInterval(() => loadConversations(), 15000);
      return () => clearInterval(interval);
    }
  }, [user, page, loadConversations]);

  // Load activity data when switching to activity page
  useEffect(() => {
    if (page === "activity") loadActivityData();
  }, [page, loadActivityData]);

useEffect(() => {
  if (!activeConversation) return;

  const q = query(
    collection(db, "conversations", activeConversation.id, "messages"),
    orderBy("createdAt", "asc")
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const msgs = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
    setMessages(msgs);
  });

  return () => unsubscribe();
}, [activeConversation]);

useEffect(() => {
  const container = document.getElementById('messages-container');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}, [messages]);

  const handleSignup = async () => {
    if (!signupName.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all required fields");
      return;
    }
    if (!email.endsWith('@gmail.com')) {
      setError("Please use a Gmail address (@gmail.com)");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    try {
      setError("");
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      await sendEmailVerification(userCredential.user);
      
      await setDoc(doc(db, "users", userCredential.user.uid), {
        name: signupName.trim(),
        email: email,
        registrationNumber: regNumber.trim(),
        universityId: DEFAULT_UNI.id,
        universityName: DEFAULT_UNI.short,
        avatarUrl: null,
        emailVerified: false,
        createdAt: serverTimestamp()
      });
      
      setUserName(signupName.trim());
      setSelectedUni(DEFAULT_UNI);
      setSuccess("Account created! Check your email to verify.");
      setShowVerificationBanner(true);
      setShowAuthModal(false);
      setPage("home");
    } catch (err) {
      setError(err.code === 'auth/email-already-in-use' ? "Email already in use" : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }
    try {
      setError("");
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
      setSuccess("Logged in successfully!");
      setShowAuthModal(false);
      setPage("home");
    } catch (err) {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setPage("home");
      setListings([]);
      setCart([]);
      setConversations([]);
      setMessages([]);
      setActiveConversation(null);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const handlePhotoSelect = (e, type) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  
  if (type === 'listing') {
    // Validate all files
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        setError("All files must be images");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("Each image must be under 5MB");
        return;
      }
    }
    
    // Combine with existing files
    const existingFiles = createData.photoFiles || [];
    const existingPreviews = createData.photoPreviews || [];
    
    // Limit to 5 total photos
    const combinedFiles = [...existingFiles, ...files].slice(0, 5);
    
    // Generate all previews
    const newPreviews = [...existingPreviews];
    let processedCount = 0;
    
    files.forEach((file, index) => {
      if (existingFiles.length + index >= 5) return; // Skip if already at limit
      
      const reader = new FileReader();
      reader.onload = (event) => {
        newPreviews.push(event.target.result);
        processedCount++;
        
        // Update state only when all new files are processed
        if (processedCount === Math.min(files.length, 5 - existingFiles.length)) {
          setCreateData({
            ...createData,
            photoFiles: combinedFiles,
            photoPreviews: newPreviews
          });
        }
      };
      reader.readAsDataURL(file);
    });
    
  } else if (type === 'profile') {
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      setError("Please select an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image too large. Max 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setEditProfileData({...editProfileData, avatarFile: file, avatarPreview: event.target.result});
    };
    reader.readAsDataURL(file);
  }
};

  const handleCreateListing = async () => {
    if (!canPerformAction()) return;

  if (!createData.cat || !createData.title.trim() || !createData.price || !user) {
    setError("Please fill in all required fields");
    return;
  }
  try {
    setError("");
    setUploading(true);
    
    // Upload multiple photos
    const photoUrls = [];
    if (createData.photoFiles.length > 0) {
      for (let i = 0; i < createData.photoFiles.length; i++) {
        const file = createData.photoFiles[i];
        const storageRef = ref(storage, `listings/${user.uid}_${Date.now()}_${i}.jpg`);
        const snapshot = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snapshot.ref);
        photoUrls.push(url);
      }
    }

    await addDoc(collection(db, "listings"), {
      userId: user.uid,
      userName: userName,
      userAvatar: userAvatar,
      universityId: selectedUni.id,
      universityName: selectedUni.short,
      category: createData.cat,
      title: createData.title.trim(),
      description: createData.desc.trim(),
      price: parseInt(createData.price),
      condition: createData.cond,
      photoUrl: photoUrls[0] || null,        // Keep first photo as main
      photos: photoUrls,                      // ⭐ ADD ALL PHOTOS
      sold: false,
      views: 0,
      saves: 0,
      createdAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 48 * 3600000)
    });
    
    setShowCreateSuccess(true);
    setSuccess("Listing created successfully!");
    setCreateData({ 
      cat: "", 
      title: "", 
      desc: "", 
      price: "", 
      cond: "", 
      photoFiles: [],      // Reset to empty array
      photoPreviews: []    // Reset to empty array
    });
    await loadListings();
    setTimeout(() => { 
      setShowCreateSuccess(false); 
      setPage("home"); 
    }, 2000);
  } catch (err) {
    console.error("Error creating listing:", err);
    setError("Failed to create listing: " + err.message);
  } finally {
    setUploading(false);
  }
};

 const handleUpdateProfile = async () => {
  if (!user) return;
  
  try {
    setUploading(true);
    setError("");
    
    let avatarUrl = userAvatar;
    if (editProfileData.avatarFile) {
      const storageRef = ref(storage, `avatars/${user.uid}/${Date.now()}.jpg`);
      const snapshot = await uploadBytes(storageRef, editProfileData.avatarFile);
      avatarUrl = await getDownloadURL(snapshot.ref);
    }

    const updateData = {};
    if (avatarUrl) updateData.avatarUrl = avatarUrl;
    if (editProfileData.name.trim()) updateData.name = editProfileData.name.trim();

    // 1. Update user document
    await updateDoc(doc(db, "users", user.uid), updateData);
    
    // 2. Update all user's listings with new name/avatar
    const listingsQuery = query(
      collection(db, "listings"),
      where("userId", "==", user.uid)
    );
    const listingsSnap = await getDocs(listingsQuery);
    const listingUpdates = listingsSnap.docs.map(d => 
      updateDoc(doc(db, "listings", d.id), {
        ...(updateData.name && { userName: updateData.name }),
        ...(avatarUrl && { userAvatar: avatarUrl })
      })
    );
    
    // 3. Update conversations where user is buyer
    const buyerConvQuery = query(
      collection(db, "conversations"),
      where("buyerId", "==", user.uid)
    );
    const buyerConvSnap = await getDocs(buyerConvQuery);
    const buyerUpdates = buyerConvSnap.docs.map(d =>
      updateDoc(doc(db, "conversations", d.id), {
        ...(updateData.name && { buyerName: updateData.name }),
        ...(avatarUrl && { buyerAvatar: avatarUrl })
      })
    );
    
    // 4. Update conversations where user is seller
    const sellerConvQuery = query(
      collection(db, "conversations"),
      where("sellerId", "==", user.uid)
    );
    const sellerConvSnap = await getDocs(sellerConvQuery);
    const sellerUpdates = sellerConvSnap.docs.map(d =>
      updateDoc(doc(db, "conversations", d.id), {
        ...(updateData.name && { sellerName: updateData.name }),
        ...(avatarUrl && { sellerAvatar: avatarUrl })
      })
    );
    
    // Run all updates in parallel
    await Promise.all([...listingUpdates, ...buyerUpdates, ...sellerUpdates]);
    
    // 5. Update local state
    if (updateData.name) setUserName(updateData.name);
    if (avatarUrl) setUserAvatar(avatarUrl);
    
    setShowEditProfile(false);
    setEditProfileData({ name: "", avatarFile: null, avatarPreview: null });
    setSuccess("Profile updated everywhere!");
    
    // Reload to reflect changes
    await loadListings();
    await loadConversations();
    
    setTimeout(() => setSuccess(""), 3000);
  } catch (err) {
    console.error("Error updating profile:", err);
    setError("Failed to update profile: " + err.message);
  } finally {
    setUploading(false);
  }
};

 const submitVerification = async () => {
  if (!studentIdFile || !user) {
    setError("Please upload your student ID");
    return;
  }
  
  try {
    setUploading(true);
    setError("");
    
    // ⭐ CHECK IF ALREADY SUBMITTED
    const existingQuery = query(
      collection(db, "verificationRequests"),
      where("userId", "==", user.uid)
    );
    const existingSnapshot = await getDocs(existingQuery);
    
    if (!existingSnapshot.empty) {
      const existingRequest = existingSnapshot.docs[0].data();
      
      if (existingRequest.status === "pending") {
        setError("You already have a pending verification request");
        setUploading(false);
        return;
      }
      
      if (existingRequest.status === "approved") {
        setError("Your account is already verified");
        setUploading(false);
        return;
      }
      
      // If rejected, allow resubmission (continue with upload)
    }
    
    // Upload student ID
    const storageRef = ref(storage, `verification/${user.uid}/${Date.now()}.jpg`);
    const snapshot = await uploadBytes(storageRef, studentIdFile);
    const idUrl = await getDownloadURL(snapshot.ref);
    
    console.log("Upload successful!", snapshot);

    // Create verification request
    await addDoc(collection(db, "verificationRequests"), {
      userId: user.uid,
      userName: userName,
      email: user.email,
      universityId: selectedUni.id,
      universityName: selectedUni.short,
      studentIdUrl: idUrl,
      status: "pending",
      createdAt: serverTimestamp()
    });
    
    // ⭐ UPDATE STATUS IMMEDIATELY
    setVerificationStatus("pending");
    
    setShowVerifyModal(false);
    setStudentIdFile(null);
    setStudentIdPreview(null);
    setSuccess("Verification request submitted! We'll review it within one hour.");
    setTimeout(() => setSuccess(""), 5000);
    
  } catch (err) {
    console.error("Error submitting verification:", err);
    setError("Failed to submit verification: " + err.message);
  } finally {
    setUploading(false);
  }
};

  const markAsSold = async (listingId) => {
    try {
      await updateDoc(doc(db, "listings", listingId), { 
        sold: true, 
        soldAt: serverTimestamp() 
      });
      await loadListings();
      setSuccess("Marked as sold!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error marking as sold:", err);
      setError("Failed to mark as sold");
    }
  };

  const incrementViews = async (listingId) => {
  if (viewedListingsSet.has(listingId)) return;
  
  try {
    await updateDoc(doc(db, "listings", listingId), {
      views: increment(1)
    });
    
    const newSet = new Set(viewedListingsSet);
    newSet.add(listingId);
    setViewedListingsSet(newSet);
    localStorage.setItem('viewedListings', JSON.stringify([...newSet]));
  } catch (err) {
    console.error("Error incrementing views:", err);
  }
};

  const toggleSave = async (item) => {
    if (!user) {
      requireAuth("save", () => toggleSave(item));
      return;
    }

  const isSaved = cart.some(c => c.id === item.id);
  
  if (isSaved) {
  setCart(cart.filter(c => c.id !== item.id));
  try {
    // Only decrement if saves > 0
    const listingDoc = await getDoc(doc(db, "listings", item.id));
    if (listingDoc.exists() && (listingDoc.data().saves || 0) > 0) {
      await updateDoc(doc(db, "listings", item.id), {
        saves: increment(-1)
      });
    }
  } catch (err) {
    console.error("Error updating saves:", err);
  }
  
  } else {
    setCart([...cart, item]);
    try {
      await updateDoc(doc(db, "listings", item.id), {
        saves: increment(1)
      });
    } catch (err) {
      console.error("Error updating saves:", err);
    }
    await loadListings();
  }
};

const loadSellerStats = useCallback(async (userId) => {
  try {
    const q1 = query(
      collection(db, "listings"),
      where("userId", "==", userId),
      where("sold", "==", false)
    );
    const q2 = query(
      collection(db, "listings"),
      where("userId", "==", userId),
      where("sold", "==", true)
    );
    
    const [activeSnap, soldSnap] = await Promise.all([getDocs(q1), getDocs(q2)]);
    
    setSellerStats({
      active: activeSnap.size,
      sold: soldSnap.size
    });
  } catch (err) {
    console.error("Error loading seller stats:", err);
  }
}, []);

  const myActiveListings = listings.filter(l => l.userId === user?.uid && !isExpired(l));
  const myExpiredListings = listings.filter(l => l.userId === user?.uid && isExpired(l));

  if (loading) {
  return (
    <div style={{textAlign:'center',padding:'40px',fontFamily:'system-ui'}}>
      ⏳ Loading...
    </div>
  );
}

return (
      
 <>
    {/* ⭐ ADD THIS STYLE TAG HERE */}
    <style>{`
       html, body, #root {
  height: 100%;
  overflow: hidden;
  overscroll-behavior: none;
}

@supports (height: 100dvh) {
  .app-container {
    height: 100dvh !important;
  }
}

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      html {
        width: 100%;
        height: 100%;
        position: fixed;
        overflow: hidden;
      }
      
      body {
        width: 100%;
        height: 100%;
        position: fixed;
        overflow: hidden;
        overscroll-behavior: none;
        -webkit-overflow-scrolling: touch;
        margin: 0 !important;
        padding: 0 !important;
        touch-action: pan-y;
      }
      
      #root {
        margin: 0 !important;
        padding: 0 !important;
        width: 100%;
        height: 100%;
        position: fixed;
        overflow: hidden;
        touch-action: pan-y;
      }
      
      body {
        overscroll-behavior-y: contain;
      }
      
      ::-webkit-scrollbar {
        display: none;
      }
      
      * {
        -ms-overflow-style: none;
        scrollbar-width: none;
      }
      
      html {
        -webkit-text-size-adjust: 100%;
        -moz-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }
      
      input, textarea, select {
        font-size: 16px !important;
      }
      
      .scrollable {
        -webkit-overflow-scrolling: touch;
        overflow-y: auto;
      }
    `}</style>
    {/* ⭐ END OF STYLE TAG */}

  <div className="app-container" style={{
  fontFamily:'system-ui',
  background:'#f4f6f8',
  width:'100%',
  height:'calc(100vh - env(safe-area-inset-bottom))',
  maxWidth:'100vw',
  position:'fixed',
  top:0,
  left:0,
  overflowX:'hidden',
  overflowY:'hidden',
  boxSizing:'border-box',
  margin:0,
  display:'flex',
  flexDirection:'column'
}}>
       {error && (
  <div
    style={{
      margin: '16px',
      background: '#fee2e2',
      color: '#991b1b',
      padding: '12px',
      borderRadius: '8px',
      fontSize: '13px',
      flexShrink: 0
    }}
  >
    {error}
  </div>
)
  }

      {success&&<div style={{margin:'16px',background:'#d1fae5',color:'#065f46',padding:'12px',borderRadius:'8px',fontSize:'13px',flexShrink:0}}>{success}</div>}
      
      {showVerificationBanner && user && !user.emailVerified && (
        <div style={{background:'#fef3c7',padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:'13px'}}>
          <span>📧 Please verify your email to unlock all features(check spam folder)</span>
          <button onClick={()=>setShowVerificationBanner(false)} style={{background:'none',border:'none',fontSize:'18px',cursor:'pointer'}}>×</button>
        </div>
      )}
    {page !== "chat" && (
  <div
    style={{
      background:'#fff',
      padding:'12px 16px',
      display:'flex',
      alignItems:'center',
      gap:'10px',
      borderBottom:'1px solid #e2e6ea',
      flexShrink:0,
      zIndex:50
    }}
  >
    {(page==="create"||page==="profile"||page==="messages"||page==="saved"||page==="activity") && (
      <button
        onClick={()=>setPage("home")}
        style={{
          width:'36px',
          height:'36px',
          borderRadius:'50%',
          background:'#f4f6f8',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          cursor:'pointer',
          fontSize:'18px',
          border:'none'
        }}
      >
        ←
      </button>
    )}

    <div style={{fontFamily:'serif',fontSize:'20px',fontWeight:'700',color:'#0f1b2d'}}>
      {page==="chat" && activeConversation ? (
        activeConversation.listingTitle.substring(0,20) + (activeConversation.listingTitle.length > 20 ? "..." : "")
      ) : (
        <>
          Kam<em style={{color:'#2dd4bf'}}>pa</em>sika
        </>
      )}
    </div>

    <div style={{flex:1}} />

    {page==="home" && (
      <div style={{
        flex:1,
        display:'flex',
        alignItems:'center',
        background:'#f4f6f8',
        borderRadius:'20px',
        padding:'8px 16px'
      }}>
        <input
          type="text"
          placeholder="Search listings..."
          value={searchQ}
          onChange={e=>setSearchQ(e.target.value)}
          style={{flex:1,border:'none',background:'none',outline:'none',fontSize:'16px'}}
        />
        <span style={{fontSize:'18px',cursor:'pointer',marginLeft:'8px'}}>🔍</span>
      </div>
    )}
    {!user && page === "home" && (
      <button onClick={()=>setShowAuthModal(true)} style={{padding:'8px 16px',background:'#2dd4bf',color:'#0f1b2d',border:'none',borderRadius:'20px',fontSize:'13px',fontWeight:'600',cursor:'pointer',whiteSpace:'nowrap'}}>Sign In</button>
    )}
  </div>
)}
        
        {page==="home"&&(
       <div style={{
    width:'100%',
    flex:1,
    overflowY:'auto',
    overflowX:'hidden',
    WebkitOverflowScrolling:'touch',
    boxSizing:'border-box',
    paddingBottom:'100px'
  }}>

         {false && (
  <div style={{
    background: verificationStatus === "pending" 
      ? 'linear-gradient(135deg, #60a5fa, #3b82f6)'  // Blue for pending
      : verificationStatus === "rejected"
      ? 'linear-gradient(135deg, #f87171, #ef4444)'  // Red for rejected
      : 'linear-gradient(135deg, #fbbf24, #f59e0b)',  // Orange for not submitted
    borderRadius:'16px',
    padding:'20px',
    marginBottom:'16px',
    boxShadow:'0 4px 12px rgba(245,158,11,0.2)'
  }}>
    <div style={{
      fontSize:'20px',
      fontWeight:'700',
      color:'#fff',
      marginBottom:'8px',
      display:'flex',
      alignItems:'center',
      gap:'8px'
    }}>
      {verificationStatus === "pending" && (
        <>
          <span>⏳</span>
          <span>Verification Pending</span>
        </>
      )}
      {verificationStatus === "rejected" && (
        <>
          <span>❌</span>
          <span>Verification Rejected</span>
        </>
      )}
      {!verificationStatus && (
        <>
          <span>⚠️</span>
          <span>Verify Your Account</span>
        </>
      )}
    </div>
    
    <p style={{
      color:'rgba(255,255,255,0.95)',
      fontSize:'14px',
      lineHeight:'1.5',
      marginBottom:'12px'
    }}>
      {verificationStatus === "pending" && 
        "We're reviewing your student ID. You'll be notified within 1 hour."
      }
      {verificationStatus === "rejected" && 
        "Your verification was rejected. Please submit a clearer photo of your student ID."
      }
      {!verificationStatus && 
        "Get verified to post listings, message sellers, and save items. Help grow our community!"
      }
    </p>
    
    <div style={{
      display:'flex',
      gap:'8px',
      marginBottom:'12px'
    }}>
      {/* Show verify button only if not pending */}
      {verificationStatus !== "pending" && (
        <button 
          onClick={() => setShowVerifyModal(true)}
          style={{
            background:'#fff',
            color: verificationStatus === "rejected" ? '#ef4444' : '#f59e0b',
            padding:'10px 20px',
            borderRadius:'10px',
            border:'none',
            fontSize:'14px',
            fontWeight:'600',
            cursor:'pointer',
            flex:1
          }}
        >
          {verificationStatus === "rejected" ? '🔄 Resubmit' : '✓ Verify Now'}
        </button>
      )}
      
      {/* Show pending message if pending */}
      {verificationStatus === "pending" && (
        <div style={{
          background:'rgba(255,255,255,0.2)',
          padding:'10px 20px',
          borderRadius:'10px',
          fontSize:'14px',
          fontWeight:'600',
          flex:1,
          textAlign:'center',
          color:'#fff'
        }}>
          ⏳ Under Review
        </div>
      )}
      
      <button 
        onClick={() => {
          const text = `Join kampasika - ${selectedUni?.short}'s marketplace for students! Buy, sell & trade on campus. https://ludepoz.netlify.app`;
          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        }}
        style={{
          background:'#25D366',
          color:'#fff',
          padding:'10px 20px',
          borderRadius:'10px',
          border:'none',
          fontSize:'14px',
          fontWeight:'600',
          cursor:'pointer',
          flex:1,
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          gap:'6px'
        }}
      >
        <span>📱</span>
        <span>Invite Friends</span>
      </button>
    </div>
    
    <div style={{
      fontSize:'12px',
      color:'rgba(255,255,255,0.8)',
      textAlign:'center'
    }}>
      💡 More students = more items to trade!
    </div>
  </div>
)}
          <div style={{background:'linear-gradient(135deg,#0f1b2d 0%,#1a3350 100%)',borderRadius:'18px',padding:'24px 18px',marginBottom:'20px',margin:'0 16px 20px 16px',boxSizing:'border-box',width:'calc(100% - 32px)'}}>
            <h1 style={{fontFamily:'serif',fontSize:'26px',fontWeight:'700',color:'#fff',lineHeight:1.2}}>Trade, share &<br/><em style={{color:'#2dd4bf'}}>find your next deal</em><br/>— all on campus.</h1>
            <p style={{color:'rgba(255,255,255,0.6)',fontSize:'13px',marginTop:'10px'}}>Buy phones, sell used laptops, find a roommate, or lease a room.</p>
            <div style={{display:'flex',gap:'8px',marginTop:'16px'}}><button onClick={()=>{user ? setPage("create") : requireAuth("sell", ()=>setPage("create"));}} style={{background:'#2dd4bf',color:'#0f1b2d',padding:'10px 20px',borderRadius:'10px',border:'none',fontSize:'16px',fontWeight:'600',cursor:'pointer'}}>+ Sell</button>{user ? <button onClick={()=>setPage("profile")} style={{background:'transparent',color:'rgba(255,255,255,0.8)',padding:'10px 20px',borderRadius:'10px',border:'1.5px solid rgba(255,255,255,0.2)',fontSize:'16px',fontWeight:'500',cursor:'pointer'}}>Profile</button> : <button onClick={()=>setShowAuthModal(true)} style={{background:'transparent',color:'rgba(255,255,255,0.8)',padding:'10px 20px',borderRadius:'10px',border:'1.5px solid rgba(255,255,255,0.2)',fontSize:'16px',fontWeight:'500',cursor:'pointer'}}>Join Now</button>}</div>
          </div>
<div style={{display:'flex',gap:'8px',marginBottom:'16px',overflowX:'auto',paddingBottom:'4px',margin:'0 16px 16px 16px',boxSizing:'border-box',width:'calc(100% - 32px)'}}>{CATEGORIES.map(c=><button key={c.id} onClick={()=>setActiveCat(c.id)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 16px',background:activeCat===c.id?'#0f1b2d':'#fff',color:activeCat===c.id?'#fff':'#0f1b2d',border:activeCat===c.id?'1.5px solid #0f1b2d':'1.5px solid #e2e6ea',borderRadius:'20px',fontSize:'12px',fontWeight:'500',cursor:'pointer',whiteSpace:'nowrap'}}>{c.icon} {c.name}</button>)}</div>
        {(() => {
  const filteredListings = listings.filter(item => {
    
    if (isExpired(item)) return false;
    if (activeCat !== "all" && item.category !== activeCat) return false;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      return item.title.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q);
    }
    return true;
  });
  return (
<div style={{display:'flex',flexDirection:'column',margin:'0 16px',boxSizing:'border-box',width:'calc(100% - 32px)'}}>
            {filteredListings.length===0?(
              <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px'}}><div style={{fontSize:'40px',marginBottom:'16px'}}>📭</div><div style={{fontSize:'16px',fontWeight:'600'}}>No listings yet</div><div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Be the first to post in {selectedUni?.short}!</div></div>
            ):(
              filteredListings.map((item,idx)=>(
                <div key={item.id}  style={{background:'#fff',borderBottom:idx===filteredListings.length-1?'none':'1px solid #e2e6ea',padding:'16px',cursor:'pointer',opacity:item.sold?0.5:1,borderRadius:idx===0?'12px 12px 0 0':idx===filteredListings.length-1?'0 0 12px 12px':'0'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
                    <div style={{width:'36px',height:'36px',borderRadius:'50%',backgroundImage:item.userAvatar?`url(${item.userAvatar})`:'none',backgroundSize:'cover',backgroundPosition:'center',backgroundColor:!item.userAvatar?'#2dd4bf':'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:'700',color:'#fff'}}>{!item.userAvatar&&(item.userName||"?").split(" ").map(n=>n[0]).join("")}</div>
                    <span style={{fontSize:'13px',fontWeight:'600'}}>{item.userName}</span>
                    <span style={{fontSize:'11px',color:'#8a9bb0',background:'#f4f6f8',padding:'2px 8px',borderRadius:'8px'}}>{item.universityName}</span>
                    <span style={{fontSize:'11px',color:'#8a9bb0',marginLeft:'auto'}}>{item.createdAt?new Date(item.createdAt).toLocaleDateString():"Recently"}</span>
                  </div>
                  <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'4px'}}>{item.title}</div>
                  {item.description && <div style={{fontSize:'13px',color:'#4a5568',marginBottom:'10px',lineHeight:1.5}}>{item.description}</div>}
               {(item.photos && item.photos.length > 0) ? (
  <div style={{marginBottom:'10px'}}>
    <img
      src={item.photos[0]}
      alt={item.title}
     onClick={(e) => {
  e.stopPropagation();
  setFullScreenImage(item.photos[0]);
  setFullScreenPhotos(item.photos);
  setFullScreenIndex(0);
  incrementViews(item.id);
}}
      style={{
        width:'100%',
        height:'280px',
        objectFit:'cover',
        borderRadius:'10px',
        cursor:'pointer'
      }}
    />
  </div>
) : item.photoUrl ? (
  <div style={{marginBottom:'10px'}}>
    <img
      src={item.photoUrl}
      alt={item.title}
      onClick={(e) => {
        e.stopPropagation();
        setFullScreenImage(item.photoUrl);
        incrementViews(item.id);
      }}
      style={{
        width:'100%',
        height:'280px',
        objectFit:'cover',
        borderRadius:'10px',
        cursor:'pointer'
      }}
    />
  </div>
) : null}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:'10px',borderTop:'1px solid #e2e6ea'}}>
                    <div style={{fontFamily:'serif',fontSize:'20px',fontWeight:'700'}}>{item.price.toLocaleString()} TSh</div>
                    <div style={{display:'flex',alignItems:'center',gap:'16px'}}>
                      {openListingId === item.id && (
  <div style={{
    marginTop:'10px',
    display:'flex',
    gap:'12px',
    borderTop:'1px solid #f0f0f0',
    paddingTop:'10px'
  }}>
    <button
      onClick={(e)=>{
        e.stopPropagation();
        requireAuth("message",()=>startConversation(item));
      }}
      style={{
        flex:1,
        padding:'8px',
        background:'#2dd4bf',
        color:'#fff',
        border:'none',
        borderRadius:'6px',
        fontSize:'13px',
        fontWeight:'600',
        cursor:'pointer'
      }}
    >
      💬 Message
    </button>

    <button
      onClick={(e)=>{
        e.stopPropagation();
        shareOnWhatsApp(item);
      }}
      style={{
        flex:1,
        padding:'8px',
        background:'#25D366',
        color:'#fff',
        border:'none',
        borderRadius:'6px',
        fontSize:'13px',
        fontWeight:'600',
        cursor:'pointer'
      }}
    >
      📲 WhatsApp
    </button>
  </div>
)}
                      {item.userId !== user?.uid && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      setOpenListingId(openListingId === item.id ? null : item.id);
      setViewingListing(item);
      setPhotoIndex(0);
      incrementViews(item.id);
      if (item.userId !== user?.uid) {
        loadSellerStats(item.userId);
      }
    }}
    style={{
      display:'flex',
      alignItems:'center',
      gap:'4px',
      fontSize:'12px',
      color:'#0f1b2d',
      cursor:'pointer',
      border:'none',
      background:'none',
      fontWeight:'600'
    }}
  >
    📋 Details
  </button>
)}
                      <button onClick={(e)=>{e.stopPropagation();toggleSave(item);}} style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'12px',color:cart.some(c=>c.id===item.id)?'#f59e0b':'#8a9bb0',cursor:'pointer',border:'none',background:'none'}}>🔖</button>
                      <button onClick={(e)=>{e.stopPropagation();shareOnWhatsApp(item);}} style={{display:'flex',alignItems:'center',gap:'3px',fontSize:'12px',color:'#25D366',cursor:'pointer',border:'none',background:'none',fontWeight:'600'}} title="Share on WhatsApp">📲</button>
                      <span style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'12px',color:'#8a9bb0'}}>👁 {item.views||0}</span>
                      <button onClick={(e)=>{e.stopPropagation();setReportTarget({type:'listing',id:item.id,name:item.title});setShowReportModal(true);}} style={{fontSize:'12px',color:'#8a9bb0',cursor:'pointer',border:'none',background:'none'}}>⋮</button>
                    </div>
                  </div>
                  {user && item.userId===user.uid&&!item.sold&&(<button onClick={(e)=>{e.stopPropagation();markAsSold(item.id);}} style={{padding:'8px 16px',background:'#10b981',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer',marginTop:'8px'}}>✓ Mark as Sold</button>)}
                </div>
              ))
            )}
          </div>
  );
})()}
        </div>
      )}
      
      {page==="create"&&(
        <div style={{
    width:'100%',
    flex:1,
    overflowY:'auto',
    overflowX:'hidden',
    WebkitOverflowScrolling:'touch',
    boxSizing:'border-box',
    paddingBottom:'100px'
  }}>
          <div style={{background:'#fff',borderRadius:'12px',padding:'20px'}}>
            <h2 style={{fontSize:'20px',fontWeight:'700',marginBottom:'16px'}}>{showCreateSuccess?"Success!":"New Listing"}</h2>
            {showCreateSuccess?(
              <div style={{textAlign:'center',padding:'40px'}}><div style={{fontSize:'48px',marginBottom:'12px'}}>✅</div><div style={{fontSize:'16px',fontWeight:'600'}}>Listing created!</div><div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Active for 48 hours</div></div>
            ):(
              <>
                <input 
  type="file" 
  id="listing-photo" 
  accept="image/*" 
  multiple  // ⭐ ADD THIS
  style={{display:'none'}} 
  onChange={(e)=>handlePhotoSelect(e,'listing')} 
/>
<label htmlFor="listing-photo" style={{display:'block',marginBottom:'16px',cursor:'pointer'}}>
  {createData.photoPreviews && createData.photoPreviews.length > 0 ? (
    <div style={{position:'relative'}}>
      {/* Main large preview — like WhatsApp/Instagram story */}
      <div style={{position:'relative',marginBottom:'8px'}}>
        <img 
          src={createData.photoPreviews[0]} 
          alt="Main preview" 
          style={{
            width:'100%',
            height:'300px',
            objectFit:'cover',
            borderRadius:'12px'
          }} 
        />
        <div style={{
          position:'absolute',
          top:'10px',
          right:'10px',
          display:'flex',
          gap:'6px'
        }}>
          <div style={{
            background:'rgba(0,0,0,0.6)',
            color:'#fff',
            padding:'4px 10px',
            borderRadius:'12px',
            fontSize:'12px',
            fontWeight:'600'
          }}>
            {createData.photoPreviews.length} / 5
          </div>
        </div>
        {/* Delete main photo */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const newFiles = [...createData.photoFiles];
            const newPreviews = [...createData.photoPreviews];
            newFiles.splice(0, 1);
            newPreviews.splice(0, 1);
            setCreateData({...createData, photoFiles: newFiles, photoPreviews: newPreviews});
          }}
          style={{
            position:'absolute',
            top:'10px',
            left:'10px',
            width:'30px',
            height:'30px',
            borderRadius:'50%',
            background:'rgba(239,68,68,0.85)',
            color:'#fff',
            border:'none',
            cursor:'pointer',
            fontSize:'18px',
            fontWeight:'700',
            display:'flex',
            alignItems:'center',
            justifyContent:'center'
          }}
        >
          ×
        </button>
      </div>

      {/* Thumbnail strip below — like Instagram multi-select */}
      {createData.photoPreviews.length > 1 && (
        <div style={{
          display:'flex',
          gap:'6px',
          overflowX:'auto',
          paddingBottom:'4px'
        }}>
          {createData.photoPreviews.slice(1).map((preview, idx) => (
            <div key={idx+1} style={{position:'relative',flexShrink:0}}>
              <img 
                src={preview} 
                alt={`Preview ${idx+2}`} 
                style={{
                  width:'72px',
                  height:'72px',
                  objectFit:'cover',
                  borderRadius:'10px'
                }} 
              />
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const newFiles = [...createData.photoFiles];
                  const newPreviews = [...createData.photoPreviews];
                  newFiles.splice(idx+1, 1);
                  newPreviews.splice(idx+1, 1);
                  setCreateData({...createData, photoFiles: newFiles, photoPreviews: newPreviews});
                }}
                style={{
                  position:'absolute',
                  top:'-4px',
                  right:'-4px',
                  width:'20px',
                  height:'20px',
                  borderRadius:'50%',
                  background:'#ef4444',
                  color:'#fff',
                  border:'2px solid #fff',
                  cursor:'pointer',
                  fontSize:'12px',
                  fontWeight:'700',
                  display:'flex',
                  alignItems:'center',
                  justifyContent:'center',
                  padding:0
                }}
              >
                ×
              </button>
            </div>
          ))}
          {/* Add more mini button */}
          {createData.photoPreviews.length < 5 && (
            <div style={{
              width:'72px',
              height:'72px',
              border:'2px dashed #2dd4bf',
              borderRadius:'10px',
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              background:'#f0fdfa',
              flexShrink:0
            }}>
              <span style={{fontSize:'24px',color:'#2dd4bf'}}>+</span>
            </div>
          )}
        </div>
      )}

      {/* Add more when only 1 photo */}
      {createData.photoPreviews.length === 1 && createData.photoPreviews.length < 5 && (
        <div style={{
          height:'48px',
          border:'2px dashed #2dd4bf',
          borderRadius:'10px',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          background:'#f0fdfa',
          gap:'6px'
        }}>
          <span style={{fontSize:'18px',color:'#2dd4bf'}}>+</span>
          <span style={{fontSize:'13px',color:'#2dd4bf',fontWeight:'600'}}>Add more photos</span>
        </div>
      )}
    </div>
  ) : (
    <div style={{
      border:'2px dashed #e2e6ea',
      borderRadius:'12px',
      padding:'32px',
      textAlign:'center',
      background:'#f9fafb',
      transition:'all 0.2s'
    }}>
      <div style={{fontSize:'48px',marginBottom:'12px'}}>📷</div>
      <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'6px',color:'#0f1b2d'}}>Add Photos</div>
      <div style={{fontSize:'13px',color:'#8a9bb0',marginBottom:'4px'}}>Upload up to 5 photos</div>
      <div style={{fontSize:'12px',color:'#6b7280'}}>Max 5MB per photo</div>
    </div>
  )}
</label>
                
                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Category *</label><select value={createData.cat} onChange={e=>setCreateData({...createData,cat:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none'}}><option value="">Select category...</option>{CATEGORIES.filter(c=>c.id!=="all").map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Title *</label><input type="text" placeholder="e.g. Business Year 2 Notes" value={createData.title} onChange={e=>setCreateData({...createData,title:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none'}}/></div>
                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Description</label><textarea placeholder="Describe your item..." value={createData.desc} onChange={e=>setCreateData({...createData,desc:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',minHeight:'100px',resize:'vertical',fontFamily:'inherit'}}/></div>
                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Price (TSh) *</label><input type="number" placeholder="e.g. 25000" value={createData.price} onChange={e=>setCreateData({...createData,price:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none'}}/></div>
                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Condition</label><select value={createData.cond} onChange={e=>setCreateData({...createData,cond:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none'}}><option value="">Select condition...</option><option value="Like New">Like New</option><option value="Good">Good</option><option value="Fair">Fair</option><option value="Worn">Worn</option></select></div>
                <button onClick={handleCreateListing} disabled={uploading} style={{width:'100%',marginTop:'16px',padding:'12px',background:'#2dd4bf',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:uploading?'not-allowed':'pointer'}}>{uploading?"Uploading...":"💾 Create Listing (48h)"}</button>
              </>
            )}
          </div>
        </div>
      )}
      
      {page==="messages"&&(
        <div style={{
    width:'100%',
    flex:1,
    overflowY:'auto',
    overflowX:'hidden',
    WebkitOverflowScrolling:'touch',
    boxSizing:'border-box',
    paddingBottom:'100px'
  }}>
          {showSafetyMessage && (
            <div style={{background:'#fff3cd',padding:'12px 16px',borderRadius:'10px',marginBottom:'16px',display:'flex',justifyContent:'space-between',alignItems:'start',fontSize:'13px',lineHeight:'1.5'}}>
              <span>⚠️ <strong>Safety First:</strong> Meet in public campus places. Never send money before inspecting items.</span>
              <button onClick={()=>setShowSafetyMessage(false)} style={{background:'none',border:'none',fontSize:'18px',cursor:'pointer',flexShrink:0}}>×</button>
            </div>
          )}
          <h2 style={{fontSize:'20px',fontWeight:'700',marginBottom:'16px'}}>Messages {unreadCount>0&&`(${unreadCount})`}</h2>
          {conversations.length===0?(
            <div style={{background:'#fff',borderRadius:'12px',padding:'40px',textAlign:'center'}}>
              <div style={{fontSize:'48px',marginBottom:'16px'}}>💬</div>
              <h3 style={{fontSize:'18px',fontWeight:'700',marginBottom:'8px'}}>No messages yet</h3>
              <p style={{fontSize:'16px',color:'#8a9bb0'}}>Start a conversation by messaging a seller!</p>
            </div>
          ):(
           <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
  {conversations.map(conv=>{
    const otherPerson = user.uid===conv.buyerId ? {name:conv.sellerName,avatar:conv.sellerAvatar} : {name:conv.buyerName,avatar:conv.buyerAvatar};
    const unread = user.uid===conv.buyerId ? conv.buyerUnread : conv.sellerUnread;
    return (
      <div key={conv.id} style={{background:'#fff',borderRadius:'12px',border:'1px solid #e2e6ea',overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center'}}>
          {/* Main conversation area — tappable */}
          <div 
            onClick={()=>{setActiveConversation(conv);setPage("chat");markAsRead(conv.id);}} 
            style={{flex:1,padding:'16px',cursor:'pointer',display:'flex',gap:'12px',minWidth:0}}
          >
            <div style={{
              width:'48px',
              height:'48px',
              borderRadius:'50%',
              backgroundImage:otherPerson.avatar?`url(${otherPerson.avatar})`:'none',
              backgroundColor:!otherPerson.avatar?'#2dd4bf':'transparent',
              backgroundSize:'cover',
              backgroundPosition:'center',
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              color:'#fff',
              fontWeight:'700',
              fontSize:'16px',
              flexShrink:0
            }}>
              {!otherPerson.avatar&&otherPerson.name.split(" ").map(n=>n[0]).join("")}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'4px'}}>
                <div style={{fontSize:'15px',fontWeight:'600',color:'#0f1b2d'}}>{otherPerson.name}</div>
                {conv.lastMessageAt&&<div style={{fontSize:'11px',color:'#8a9bb0'}}>{new Date(conv.lastMessageAt.seconds*1000).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'})}</div>}
              </div>
              <div style={{fontSize:'12px',color:'#2dd4bf',marginBottom:'4px',fontWeight:'500'}}>{conv.listingTitle} • {conv.listingPrice?.toLocaleString()} TSh</div>
              <div style={{fontSize:'13px',color:'#6b7280',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{conv.lastMessage||"No messages yet"}</div>
            </div>
            {unread>0&&<div style={{width:'22px',height:'22px',borderRadius:'50%',background:'#ef4444',color:'#fff',fontSize:'11px',fontWeight:'700',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,alignSelf:'center'}}>{unread}</div>}
          </div>
          
          {/* 3-dot menu button */}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              deleteConversation(conv.id);
            }}
            style={{
              padding:'16px 12px',
              background:'none',
              border:'none',
              borderLeft:'1px solid #f0f0f0',
              cursor:'pointer',
              fontSize:'18px',
              color:'#8a9bb0',
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              flexShrink:0
            }}
          >
            🗑
          </button>
        </div>
      </div>
    );
  })}
</div>
          )}
        </div>
      )}

     {page==="chat"&&activeConversation&&(
  <div style={{
    position:'fixed',
    top:0,
    left:0,
    right:0,
    height:'100dvh',
    display:'flex',
    flexDirection:'column',
    background:'#f4f6f8',
    zIndex:100
  }}>
    
    {/* Chat Tip (dismissible) */}
    {showChatTip && (
      <div style={{
        background:'#e0f2fe',
        padding:'10px 16px',
        display:'flex',
        justifyContent:'space-between',
        alignItems:'start',
        fontSize:'12px',
        lineHeight:'1.4',
        flexShrink:0
      }}>
        <span>💬 <strong>Quick Reply Tip:</strong> Ghosting damages your reputation. Respond promptly to build trust!</span>
        <button onClick={()=>setShowChatTip(false)} style={{background:'none',border:'none',fontSize:'16px',cursor:'pointer',flexShrink:0}}>×</button>
      </div>
    )}

    {/* Chat Header - FIXED, never moves */}
    <div style={{
      background:'#fff',
      padding:'12px 16px',
      borderBottom:'1px solid #e2e6ea',
      display:'flex',
      alignItems:'center',
      gap:'12px',
      flexShrink:0
    }}>
      <button 
        onClick={()=>setPage("messages")} 
        style={{
          width:'36px',
          height:'36px',
          borderRadius:'50%',
          background:'#f4f6f8',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          cursor:'pointer',
          fontSize:'18px',
          border:'none',
          flexShrink:0
        }}
      >
        ←
      </button>
      
      {(() => {
        const otherUser = user.uid === activeConversation.buyerId ? 
          {name: activeConversation.sellerName, avatar: activeConversation.sellerAvatar} : 
          {name: activeConversation.buyerName, avatar: activeConversation.buyerAvatar};
        
        return (
          <>
            <div style={{
              width:'40px',
              height:'40px',
              borderRadius:'50%',
             backgroundImage:otherUser.avatar?`url(${otherUser.avatar})`:'none',
              backgroundColor:!otherUser.avatar?'#2dd4bf':'transparent',
              backgroundSize:'cover',
              backgroundPosition:'center',
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              color:'#fff',
              fontWeight:'700',
              boxSizing:'border-box',
              fontSize:'16px',
              flexShrink:0
            }}>
              {!otherUser.avatar && otherUser.name.split(" ").map(n=>n[0]).join("")}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{
                fontSize:'15px',
                fontWeight:'600',
                color:'#0f1b2d',
                overflow:'hidden',
                textOverflow:'ellipsis',
                whiteSpace:'nowrap'
              }}>
                {otherUser.name}
              </div>
              <div style={{
                fontSize:'11px',
                color:'#6b7280',
                overflow:'hidden',
                textOverflow:'ellipsis',
                whiteSpace:'nowrap'
              }}>
                {activeConversation.listingTitle}
              </div>
            </div>
          </>
        );
      })()}
    </div>

    {/* Messages Container - scrollable middle area */}
    <div 
      id="messages-container" 
      style={{
        flex:1,
        overflowY:'auto',
        overflowX:'hidden',
        padding:'16px',
        display:'flex',
        flexDirection:'column'
      }}
    >
      {messages.length === 0 && (
        <div style={{
          textAlign:'center',
          padding:'40px 16px',
          color:'#8a9bb0'
        }}>
          <div style={{fontSize:'32px',marginBottom:'8px'}}>💬</div>
          <div style={{fontSize:'14px'}}>Send a message to start the conversation</div>
        </div>
      )}
      {messages.map(msg=>{
        const isMine=msg.senderId===user.uid;
        return (
          <div key={msg.id} style={{
            display:'flex',
            justifyContent:isMine?'flex-end':'flex-start',
            marginBottom:'8px'
          }}>
            <div style={{
              maxWidth:'75%',
              background:isMine?'#2dd4bf':'#fff',
              color:isMine?'#0f1b2d':'#1f2937',
              padding:'10px 14px',
              borderRadius:isMine?'16px 16px 4px 16px':'16px 16px 16px 4px',
              fontSize:'15px',
              lineHeight:'1.4',
              boxShadow:'0 1px 2px rgba(0,0,0,0.05)'
            }}>
              {!isMine&&<div style={{fontSize:'11px',fontWeight:'600',marginBottom:'4px',color:'#6b7280'}}>{msg.senderName}</div>}
              <div style={{wordBreak:'break-word'}}>{msg.text}</div>
              <div style={{fontSize:'10px',marginTop:'4px',opacity:0.6,textAlign:'right'}}>
                {msg.createdAt ? (() => {
                  try {
                    const date = msg.createdAt instanceof Date ? msg.createdAt : msg.createdAt.toDate();
                    return date.toLocaleTimeString('en', {hour:'2-digit', minute:'2-digit'});
                  } catch(e) {
                    return '';
                  }
                })() : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>

    {/* Message Input - part of flex layout, NOT fixed */}
    <div style={{
      background:'#fff',
      borderTop:'1px solid #e2e6ea',
      padding:'8px 12px',
      paddingBottom:'max(8px, env(safe-area-inset-bottom))',
      display:'flex',
      gap:'8px',
      alignItems:'center',
      flexShrink:0
    }}>
      <input 
        type="text" 
        value={messageText} 
        onChange={e=>setMessageText(e.target.value)} 
        onKeyPress={e=>e.key==='Enter'&&sendMessage()} 
        placeholder="Type a message..." 
        style={{
          flex:1,
          padding:'10px 16px',
          border:'1.5px solid #e2e6ea',
          borderRadius:'24px',
          fontSize:'16px',
          outline:'none',
          boxSizing:'border-box'
        }} 
      />
      <button 
        onClick={sendMessage} 
        disabled={!messageText.trim()} 
        style={{
          width:'42px',
          height:'42px',
          borderRadius:'50%',
          background:messageText.trim()?'#2dd4bf':'#e2e6ea',
          color:messageText.trim()?'#0f1b2d':'#8a9bb0',
          border:'none',
          fontSize:'20px',
          cursor:messageText.trim()?'pointer':'not-allowed',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          flexShrink:0
        }}
      >
        📤
      </button>
    </div>

  </div>
)}
      
      {page==="activity"&&(
        <div style={{
    width:'100%',
    flex:1,
    overflowY:'auto',
    overflowX:'hidden',
    WebkitOverflowScrolling:'touch',
    boxSizing:'border-box',
    paddingBottom:'100px',
    padding:'0 16px 100px 16px'
  }}>
          <h2 style={{fontSize:'20px',fontWeight:'700',marginBottom:'16px'}}>Activity</h2>
          
          {/* Activity sub-tabs */}
          <div style={{display:'flex',gap:'4px',background:'#fff',borderRadius:'10px',padding:'4px',marginBottom:'16px'}}>
            <button onClick={()=>setActivityTab("active")} style={{flex:1,padding:'10px 8px',border:'none',background:activityTab==="active"?'#0f1b2d':'none',color:activityTab==="active"?'#fff':'#8a9bb0',fontSize:'12px',fontWeight:'600',cursor:'pointer',borderRadius:'8px'}}>🟢 Active Sellers</button>
            <button onClick={()=>setActivityTab("verified")} style={{flex:1,padding:'10px 8px',border:'none',background:activityTab==="verified"?'#0f1b2d':'none',color:activityTab==="verified"?'#fff':'#8a9bb0',fontSize:'12px',fontWeight:'600',cursor:'pointer',borderRadius:'8px'}}>✅ Verified</button>
            <button onClick={()=>setActivityTab("deals")} style={{flex:1,padding:'10px 8px',border:'none',background:activityTab==="deals"?'#0f1b2d':'none',color:activityTab==="deals"?'#fff':'#8a9bb0',fontSize:'12px',fontWeight:'600',cursor:'pointer',borderRadius:'8px'}}>🤝 Deals</button>
          </div>

          {activityLoading ? (
            <div style={{textAlign:'center',padding:'40px',color:'#8a9bb0'}}>Loading activity...</div>
          ) : (
            <>
              {activityTab === "active" && (
                <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                  {activityData.activeSellers.length === 0 ? (
                    <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px'}}><div style={{fontSize:'40px',marginBottom:'12px'}}>🏪</div><div style={{fontSize:'16px',fontWeight:'600'}}>No active sellers yet</div><div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Be the first to list something!</div></div>
                  ) : (
                    activityData.activeSellers.map((seller) => (
                      <div key={seller.userId} style={{background:'#fff',borderRadius:'12px',padding:'16px',display:'flex',alignItems:'center',gap:'12px'}}>
                        <div style={{position:'relative'}}>
                          <div style={{width:'48px',height:'48px',borderRadius:'50%',backgroundImage:seller.avatar?`url(${seller.avatar})`:'none',backgroundColor:!seller.avatar?'#2dd4bf':'transparent',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',fontWeight:'700',color:'#fff'}}>{!seller.avatar&&seller.name.split(" ").map(n=>n[0]).join("")}</div>
                          <div style={{position:'absolute',bottom:'-2px',right:'-2px',width:'14px',height:'14px',borderRadius:'50%',background:'#10b981',border:'2px solid #fff'}}/>
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:'15px',fontWeight:'600'}}>{seller.name}</div>
                          <div style={{fontSize:'12px',color:'#8a9bb0'}}>{seller.uni} • {seller.activeCount} active listing{seller.activeCount>1?'s':''}</div>
                          <div style={{fontSize:'12px',color:'#6b7280',marginTop:'2px'}}>Latest: {seller.latestTitle}</div>
                        </div>
                        <div style={{fontSize:'14px',fontWeight:'700',color:'#2dd4bf'}}>{seller.latestPrice?.toLocaleString()} TSh</div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {activityTab === "verified" && (
                <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                  {activityData.verifiedSellers.length === 0 ? (
                    <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px'}}><div style={{fontSize:'40px',marginBottom:'12px'}}>🎓</div><div style={{fontSize:'16px',fontWeight:'600'}}>No verified sellers yet</div><div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Get verified by uploading your student ID</div></div>
                  ) : (
                    activityData.verifiedSellers.map((seller) => (
                      <div key={seller.userId} style={{background:'#fff',borderRadius:'12px',padding:'16px',display:'flex',alignItems:'center',gap:'12px'}}>
                        <div style={{width:'48px',height:'48px',borderRadius:'50%',background:'linear-gradient(135deg,#2dd4bf,#0f1b2d)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',fontWeight:'700',color:'#fff'}}>{seller.name.split(" ").map(n=>n[0]).join("")}</div>
                        <div style={{flex:1}}>
                          <div style={{display:'flex',alignItems:'center',gap:'6px'}}><span style={{fontSize:'15px',fontWeight:'600'}}>{seller.name}</span><span style={{fontSize:'12px',background:'#d1fae5',color:'#065f46',padding:'2px 8px',borderRadius:'8px',fontWeight:'600'}}>✓ Verified</span></div>
                          <div style={{fontSize:'12px',color:'#8a9bb0',marginTop:'2px'}}>{seller.uni}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              {activityTab === "deals" && (
                <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                  {activityData.recentDeals.length === 0 ? (
                    <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px'}}><div style={{fontSize:'40px',marginBottom:'12px'}}>🤝</div><div style={{fontSize:'16px',fontWeight:'600'}}>No completed deals yet</div><div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Successful transactions will appear here</div></div>
                  ) : (
                    activityData.recentDeals.map((deal) => (
                      <div key={deal.id} style={{background:'#fff',borderRadius:'12px',padding:'16px'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'start',marginBottom:'8px'}}>
                          <div>
                            <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'4px'}}>{deal.title}</div>
                            <div style={{fontSize:'12px',color:'#8a9bb0'}}>Sold by {deal.sellerName} • {deal.uni}</div>
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:'15px',fontWeight:'700',color:'#10b981'}}>{deal.price?.toLocaleString()} TSh</div>
                            <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'2px'}}>{deal.soldAt ? new Date(deal.soldAt).toLocaleDateString('en',{month:'short',day:'numeric'}) : 'Recently'}</div>
                          </div>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                          <span style={{fontSize:'12px',background:'#d1fae5',color:'#065f46',padding:'2px 10px',borderRadius:'8px',fontWeight:'600'}}>✅ Completed</span>
                          {deal.category && <span style={{fontSize:'11px',color:'#8a9bb0',background:'#f4f6f8',padding:'2px 8px',borderRadius:'8px'}}>{CATEGORIES.find(c=>c.id===deal.category)?.icon} {CATEGORIES.find(c=>c.id===deal.category)?.name}</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
      
      {page==="profile"&&(
      <div style={{
    width:'100%',
    flex:1,
    overflowY:'auto',
    overflowX:'hidden',
    WebkitOverflowScrolling:'touch',
    boxSizing:'border-box',
    padding:'0 16px 88px 16px'
  }}>
          <div style={{background:'linear-gradient(135deg,#0f1b2d,#1a3350)',borderRadius:'16px',padding:'24px 18px',marginBottom:'16px',display:'flex',gap:'16px',alignItems:'center'}}>
           <div style={{position:'relative',width:'60px',height:'60px',boxSizing:'border-box'}}>
  <div style={{width:'60px',height:'60px',borderRadius:'50%',backgroundImage:userAvatar?`url(${userAvatar})`:'none',
backgroundColor:!userAvatar?'#2dd4bf':'transparent',
backgroundSize:'cover',
backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'22px',fontWeight:'700',color:'#0f1b2d'}}>
    {!userAvatar&&userName.split(" ").map(n=>n[0]).join("")}
  </div>
  {isVerified && (
    <div style={{position:'absolute',bottom:'-2px',right:'-2px',width:'24px',height:'24px',borderRadius:'50%',background:'#2dd4bf',border:'3px solid #fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px'}}>
      ✓
    </div>
  )}
</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700',color:'#fff'}}>{userName}</div>
              <button onClick={()=>{setEditProfileData({name:userName,avatarFile:null,avatarPreview:userAvatar});setShowEditProfile(true)}} style={{marginTop:'8px',padding:'6px 12px',background:'#2dd4bf',color:'#0f1b2d',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>✏️ Edit Profile</button>
            </div>
          </div>
          
          <div style={{display:'flex',gap:'4px',background:'#fff',borderRadius:'10px',padding:'4px',marginBottom:'16px'}}>
            <button onClick={()=>setProfileTab("listings")} style={{flex:1,padding:'8px',border:'none',background:profileTab==="listings"?'#0f1b2d':'none',color:profileTab==="listings"?'#fff':'#8a9bb0',fontSize:'12px',fontWeight:'500',cursor:'pointer',borderRadius:'8px'}}>My Listings</button>
            <button onClick={()=>setProfileTab("saved")} style={{flex:1,padding:'8px',border:'none',background:profileTab==="saved"?'#0f1b2d':'none',color:profileTab==="saved"?'#fff':'#8a9bb0',fontSize:'12px',fontWeight:'500',cursor:'pointer',borderRadius:'8px'}}>Saved ({cart.length})</button>
          </div>
          
          {profileTab==="listings"&&(
            <>
              {myActiveListings.length>0&&<div style={{marginBottom:'16px'}}>
                <h3 style={{fontSize:'16px',fontWeight:'700',color:'#10b981',marginBottom:'12px'}}>Active Listings ({myActiveListings.length})</h3>
                <div style={{display:'flex',flexDirection:'column'}}>
                  {myActiveListings.map((item,idx)=>(
                    <div key={item.id} style={{background:'#fff',borderBottom:idx===myActiveListings.length-1?'none':'1px solid #e2e6ea',padding:'16px',borderRadius:idx===0?'12px 12px 0 0':idx===myActiveListings.length-1?'0 0 12px 12px':'0'}}>
                      {item.photoUrl && <img src={item.photoUrl} alt={item.title} style={{width:'100%',height:'150px',objectFit:'cover',borderRadius:'10px',marginBottom:'10px'}} />}
                      <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'4px'}}>{item.title}</div>
                      {item.description && <div style={{fontSize:'13px',color:'#4a5568',marginBottom:'8px',lineHeight:1.5}}>{item.description}</div>}
                      <div style={{fontSize:'12px',color:'#10b981',marginBottom:'8px',fontWeight:'600'}}>⏰ {getTimeUntilExpiry(item)}</div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:'10px',borderTop:'1px solid #e2e6ea'}}>
                        <div style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700'}}>{item.price.toLocaleString()} TSh</div>
                        <span style={{fontSize:'12px',color:'#8a9bb0'}}>👁 {item.views||0}</span>
                      </div>
                     <div style={{display:'flex',gap:'8px',marginTop:'8px'}}>
              {!item.sold&&<button onClick={()=>markAsSold(item.id)} style={{padding:'8px 16px',background:'#10b981',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>✓ Mark as Sold</button>}
            <button onClick={()=>deleteListing(item.id)} style={{padding:'8px 16px',background:'#ef4444',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>🗑 Delete</button>
             </div>
                    </div>
                  ))}
                </div>
              </div>}
              
              {myExpiredListings.length>0&&<div>
                <h3 style={{fontSize:'16px',fontWeight:'700',color:'#ef4444',marginBottom:'12px'}}>Expired Listings ({myExpiredListings.length})</h3>
                <div style={{display:'flex',flexDirection:'column'}}>
                  {myExpiredListings.map((item,idx)=>(
                    <div key={item.id} style={{background:'#fff',borderBottom:idx===myExpiredListings.length-1?'none':'1px solid #e2e6ea',padding:'16px',opacity:0.7,borderRadius:idx===0?'12px 12px 0 0':idx===myExpiredListings.length-1?'0 0 12px 12px':'0'}}>
                      {item.photoUrl && <img src={item.photoUrl} alt={item.title} style={{width:'100%',height:'150px',objectFit:'cover',borderRadius:'10px',marginBottom:'10px'}} />}
                      <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'4px'}}>{item.title}</div>
                      {item.description && <div style={{fontSize:'13px',color:'#4a5568',marginBottom:'8px',lineHeight:1.5}}>{item.description}</div>}
                      <div style={{fontSize:'12px',color:'#ef4444',marginBottom:'8px',fontWeight:'600'}}>🔴 {getTimeUntilExpiry(item)}</div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:'10px',borderTop:'1px solid #e2e6ea'}}>
                        <div style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700'}}>{item.price.toLocaleString()} TSh</div>
                        <div style={{display:'flex',gap:'8px'}}>
                          <button onClick={()=>renewListing(item.id)} style={{padding:'6px 16px',background:'#10b981',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>🔄 Renew</button>
                          <button onClick={()=>deleteListing(item.id)} style={{padding:'6px 16px',background:'#ef4444',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>🗑 Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>}
              
              {myActiveListings.length===0 && myExpiredListings.length===0&&<div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px'}}><div style={{fontSize:'40px'}}>📝</div><div style={{fontSize:'16px',fontWeight:'600',marginTop:'12px'}}>No listings yet</div><button onClick={()=>setPage("create")} style={{marginTop:'16px',padding:'10px 20px',background:'#2dd4bf',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:'pointer'}}>Create Listing</button></div>}
            </>
          )}
          
          {profileTab==="saved"&&(
            <div style={{display:'flex',flexDirection:'column'}}>
              {cart.length===0?(
                <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px'}}><div style={{fontSize:'40px'}}>🔖</div><div style={{fontSize:'16px',fontWeight:'600',marginTop:'12px'}}>No saved items</div></div>
              ):(
                cart.map((item,idx)=>(
                  <div key={item.id} style={{background:'#fff',borderBottom:idx===cart.length-1?'none':'1px solid #e2e6ea',padding:'16px',borderRadius:idx===0?'12px 12px 0 0':idx===cart.length-1?'0 0 12px 12px':'0'}}>
                    {item.photoUrl && <img src={item.photoUrl} alt={item.title} style={{width:'100%',height:'150px',objectFit:'cover',borderRadius:'10px',marginBottom:'10px'}} />}
                    <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'4px'}}>{item.title}</div>
                    {item.description && <div style={{fontSize:'13px',color:'#4a5568',marginBottom:'10px'}}>{item.description}</div>}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:'10px',borderTop:'1px solid #e2e6ea'}}>
                      <div style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700'}}>{item.price.toLocaleString()} TSh</div>
                      <button onClick={()=>toggleSave(item)} style={{fontSize:'12px',color:'#ef4444',cursor:'pointer',border:'none',background:'none'}}>Remove</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          
          <button onClick={handleLogout} style={{width:'100%',padding:'12px',background:'#ef4444',color:'#fff',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:'pointer',marginTop:'16px'}}>🚪 Logout</button>
        </div>
      )}
      
      {showEditProfile && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}} onClick={()=>setShowEditProfile(false)}>
          <div style={{background:'#fff',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'400px'}} onClick={(e)=>e.stopPropagation()}>
            <h3 style={{fontSize:'20px',fontWeight:'700',marginBottom:'16px'}}>Edit Profile</h3>
            
            <input type="file" id="avatar-upload" accept="image/*" style={{display:'none'}} onChange={(e)=>handlePhotoSelect(e,'profile')} />
            <label htmlFor="avatar-upload" style={{display:'block',marginBottom:'16px',cursor:'pointer'}}>
              <div style={{width:'80px',height:'80px',margin:'0 auto',borderRadius:'50%',backgroundImage:editProfileData.avatarPreview?`url(${editProfileData.avatarPreview})`:'none',
backgroundColor:!editProfileData.avatarPreview?'#f4f6f8':'transparent',
backgroundSize:'cover',
backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
                {!editProfileData.avatarPreview && <span style={{fontSize:'32px'}}>📷</span>}
                <div style={{position:'absolute',bottom:'0',background:'rgba(45,212,191,0.9)',color:'#0f1b2d',fontSize:'10px',fontWeight:'600',padding:'4px 8px',borderRadius:'12px'}}>Change</div>
              </div>
            </label>
            
            <div style={{marginBottom:'16px'}}>
              <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>username</label>
              <input type="text" value={editProfileData.name} onChange={e=>setEditProfileData({...editProfileData,name:e.target.value})} placeholder="Your name" style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none'}} />
            </div>
            
            <button onClick={handleUpdateProfile} disabled={uploading} style={{width:'100%',padding:'12px',background:'#2dd4bf',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:uploading?'not-allowed':'pointer',marginTop:'12px'}}>{uploading?"Uploading...":"Save Changes"}</button>
            <button onClick={()=>setShowEditProfile(false)} style={{width:'100%',padding:'12px',background:'transparent',color:'#8a9bb0',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:'pointer',marginTop:'8px'}}>Cancel</button>
          </div>
        </div>
      )}

      {viewingListing && (
  <div style={{
    position:'fixed',
    inset:0,
    background:'#f4f6f8',
    zIndex:300,
    overflowY:'auto'
  }}>
    {/* Header */}
    <div style={{
      background:'#fff',
      padding:'12px 16px',
      display:'flex',
      alignItems:'center',
      gap:'10px',
      borderBottom:'1px solid #e2e6ea',
      position:'sticky',
      top:0,
      zIndex:50
    }}>
      <button 
        onClick={()=>setViewingListing(null)} 
        style={{
          width:'36px',
          height:'36px',
          borderRadius:'50%',
          background:'#f4f6f8',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          cursor:'pointer',
          fontSize:'18px',
          border:'none'
        }}
      >
        ←
      </button>
      <div style={{
        fontFamily:'serif',
        fontSize:'20px',
        fontWeight:'700',
        color:'#0f1b2d'
      }}>
        Listing Details
      </div>
    </div>

    {/* Content */}
    <div style={{padding:'0'}}>
     {/* Photo Carousel */}
{viewingListing.photos && viewingListing.photos.length > 0 ? (
  <div style={{position:'relative'}}>
    {/* Main Photo */}
   <img 
  src={viewingListing.photos[photoIndex || 0]} 
  alt={viewingListing.title} 
  onClick={() => setFullScreenImage(viewingListing.photos[photoIndex || 0])}
  style={{
    width:'100%',
    height:'400px',
    objectFit:'cover',
    cursor:'pointer'
  }} 
/>
    
    {/* Photo Counter */}
    {viewingListing.photos.length > 1 && (
      <div style={{
        position:'absolute',
        top:'16px',
        right:'16px',
        background:'rgba(0,0,0,0.6)',
        color:'#fff',
        padding:'6px 12px',
        borderRadius:'20px',
        fontSize:'12px',
        fontWeight:'600'
      }}>
        {(photoIndex || 0) + 1} / {viewingListing.photos.length}
      </div>
    )}
    
    {/* Navigation Arrows */}
    {viewingListing.photos.length > 1 && (
      <>
        <button
          onClick={() => setPhotoIndex(Math.max(0, (photoIndex || 0) - 1))}
          disabled={(photoIndex || 0) === 0}
          style={{
            position:'absolute',
            left:'16px',
            top:'50%',
            transform:'translateY(-50%)',
            width:'40px',
            height:'40px',
            borderRadius:'50%',
            background:'rgba(0,0,0,0.6)',
            color:'#fff',
            border:'none',
            fontSize:'20px',
            cursor:(photoIndex || 0) === 0 ? 'not-allowed':'pointer',
            opacity:(photoIndex || 0) === 0 ? 0.3 : 1
          }}
        >
          ‹
        </button>
        <button
          onClick={() => setPhotoIndex(Math.min(viewingListing.photos.length - 1, (photoIndex || 0) + 1))}
          disabled={(photoIndex || 0) === viewingListing.photos.length - 1}
          style={{
            position:'absolute',
            right:'16px',
            top:'50%',
            transform:'translateY(-50%)',
            width:'40px',
            height:'40px',
            borderRadius:'50%',
            background:'rgba(0,0,0,0.6)',
            color:'#fff',
            border:'none',
            fontSize:'20px',
            cursor:(photoIndex || 0) === viewingListing.photos.length - 1 ? 'not-allowed':'pointer',
            opacity:(photoIndex || 0) === viewingListing.photos.length - 1 ? 0.3 : 1
          }}
        >
          ›
        </button>
      </>
    )}
    
    {/* Thumbnail Strip */}
    {viewingListing.photos.length > 1 && (
      <div style={{
        padding:'12px 16px',
        background:'#fff',
        overflowX:'auto',
        display:'flex',
        gap:'8px'
      }}>
        {viewingListing.photos.map((photo, idx) => (
          <img
            key={idx}
            src={photo}
            alt={`Thumbnail ${idx+1}`}
            onClick={() => setPhotoIndex(idx)}
            style={{
              width:'60px',
              height:'60px',
              objectFit:'cover',
              borderRadius:'8px',
              cursor:'pointer',
              border:(photoIndex || 0) === idx ? '2px solid #2dd4bf' : '2px solid transparent',
              flexShrink:0
            }}
          />
        ))}
      </div>
    )}
  </div>
) : viewingListing.photoUrl ? (
 <img 
  src={viewingListing.photoUrl} 
  alt={viewingListing.title} 
  onClick={() => setFullScreenImage(viewingListing.photoUrl)}
  style={{
    width:'100%',
    height:'400px',
    objectFit:'cover',
    cursor:'pointer'
  }} 
/>
) : null}


      {/* Main Content */}
      <div style={{padding:'20px'}}>
        
        {/* Title & Price */}
        <h1 style={{
          fontSize:'24px',
          fontWeight:'700',
          marginBottom:'8px',
          color:'#0f1b2d'
        }}>
          {viewingListing.title}
        </h1>
        
        <div style={{
          fontFamily:'serif',
          fontSize:'32px',
          fontWeight:'700',
          color:'#2dd4bf',
          marginBottom:'16px'
        }}>
          {viewingListing.price.toLocaleString()} TSh
        </div>

        {/* Meta Info */}
        <div style={{
          display:'flex',
          gap:'8px',
          marginBottom:'20px',
          flexWrap:'wrap'
        }}>
          <span style={{
            fontSize:'12px',
            background:'#f4f6f8',
            padding:'6px 12px',
            borderRadius:'20px',
            color:'#6b7280',
            display:'flex',
            alignItems:'center',
            gap:'4px'
          }}>
            📍 {viewingListing.universityName}
          </span>
          <span style={{
            fontSize:'12px',
            background:'#f4f6f8',
            padding:'6px 12px',
            borderRadius:'20px',
            color:'#6b7280'
          }}>
            {CATEGORIES.find(c => c.id === viewingListing.category)?.icon} {CATEGORIES.find(c => c.id === viewingListing.category)?.name}
          </span>
          {viewingListing.condition && (
            <span style={{
              fontSize:'12px',
              background:'#f4f6f8',
              padding:'6px 12px',
              borderRadius:'20px',
              color:'#6b7280'
            }}>
              ✨ {viewingListing.condition}
            </span>
          )}
        </div>

        {/* Description */}
        {viewingListing.description && (
          <div style={{
            background:'#fff',
            padding:'16px',
            borderRadius:'12px',
            marginBottom:'16px'
          }}>
            <h4 style={{
              fontSize:'16px',
              fontWeight:'600',
              marginBottom:'8px',
              color:'#6b7280'
            }}>
              Description
            </h4>
            <p style={{
              fontSize:'15px',
              lineHeight:'1.7',
              color:'#4a5568',
              whiteSpace:'pre-wrap'
            }}>
              {viewingListing.description}
            </p>
          </div>
        )}

        {/* Seller Info */}
        {(!user || viewingListing.userId !== user.uid) && (
          <div style={{
            background:'#fff',
            padding:'16px',
            borderRadius:'12px',
            marginBottom:'16px'
          }}>
            <h4 style={{
              fontSize:'16px',
              fontWeight:'600',
              marginBottom:'12px',
              color:'#6b7280'
            }}>
              Seller
            </h4>
            <div style={{
              display:'flex',
              alignItems:'center',
              gap:'12px',
              marginBottom:'12px'
            }}>
              <div style={{
                width:'56px',
                height:'56px',
                borderRadius:'50%',
                background:viewingListing.userAvatar?`url(${viewingListing.userAvatar})`:'linear-gradient(135deg,#2dd4bf,#0f1b2d)',
                backgroundSize:'cover',
                backgroundPosition:'center',
                display:'flex',
                alignItems:'center',
                justifyContent:'center',
                fontSize:'20px',
                fontWeight:'700',
                boxSizing:'border-box',
                color:'#fff'
              }}>
                {!viewingListing.userAvatar && viewingListing.userName.split(" ").map(n=>n[0]).join("")}
              </div>
              <div>
                <div style={{
                  fontSize:'16px',
                  fontWeight:'600',
                  color:'#0f1b2d'
                }}>
                  {viewingListing.userName}
                </div>
                <div style={{
                  fontSize:'13px',
                  color:'#6b7280'
                }}>
                  {viewingListing.universityName}
                </div>
              </div>
            </div>
            {sellerStats && (
              <div style={{
                display:'flex',
                gap:'16px',
                fontSize:'16px',
                color:'#6b7280'
              }}>
                <span>📦 {sellerStats.active} active</span>
                <span>✅ {sellerStats.sold} sold</span>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div style={{
          background:'#fff',
          padding:'16px',
          borderRadius:'12px',
          marginBottom:'20px'
        }}>
          <div style={{
            display:'flex',
            justifyContent:'space-around',
            fontSize:'16px',
            color:'#6b7280'
          }}>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'20px',marginBottom:'4px'}}>👁</div>
              <div style={{fontWeight:'600',color:'#0f1b2d'}}>{viewingListing.views||0}</div>
              <div style={{fontSize:'12px'}}>views</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'20px',marginBottom:'4px'}}>🔖</div>
              <div style={{fontWeight:'600',color:'#0f1b2d'}}>{viewingListing.saves||0}</div>
              <div style={{fontSize:'12px'}}>saves</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'20px',marginBottom:'4px'}}>📅</div>
              <div style={{fontWeight:'600',color:'#0f1b2d'}}>
                {viewingListing.createdAt ? 
                  new Date(viewingListing.createdAt).toLocaleDateString('en', {month:'short', day:'numeric'}) : 
                  'Recent'
                }
              </div>
              <div style={{fontSize:'12px'}}>posted</div>
            </div>
          </div>
        </div>

      </div>
    </div>

    {/* Sticky Bottom Actions */}
    <div style={{
      position:'sticky',
      bottom:0,
      left:0,
      right:0,
      background:'#fff',
      borderTop:'1px solid #e2e6ea',
      padding:'16px',
      display:'flex',
      gap:'8px'
    }}>
      {(!user || viewingListing.userId !== user.uid) && (
        <>
          <button 
            onClick={() => {
              setViewingListing(null);
              requireAuth("message", () => startConversation(viewingListing));
            }}
            style={{
              flex:2,
              padding:'16px',
              background:'#2dd4bf',
              color:'#0f1b2d',
              border:'none',
              borderRadius:'10px',
              fontSize:'15px',
              fontWeight:'600',
              cursor:'pointer'
            }}
          >
            💬 Message Seller
          </button>
          <button 
            onClick={() => toggleSave(viewingListing)}
            style={{
              padding:'16px',
              background:cart.some(c => c.id === viewingListing.id)?'#f59e0b':'#f4f6f8',
              color:cart.some(c => c.id === viewingListing.id)?'#fff':'#0f1b2d',
              border:'none',
              borderRadius:'10px',
              fontSize:'15px',
              fontWeight:'600',
              cursor:'pointer'
            }}
          >
            🔖
          </button>
          <button 
            onClick={() => shareOnWhatsApp(viewingListing)}
            style={{
              padding:'16px',
              background:'#25D366',
              color:'#fff',
              border:'none',
              borderRadius:'10px',
              fontSize:'15px',
              fontWeight:'600',
              cursor:'pointer'
            }}
          >
            📲
          </button>
          <button 
            onClick={() => {
              setViewingListing(null);
              setReportTarget({
                type:'listing',
                id:viewingListing.id,
                name:viewingListing.title
              });
              setShowReportModal(true);
            }}
            style={{
              padding:'16px 16px',
              background:'#fee2e2',
              color:'#991b1b',
              border:'none',
              borderRadius:'10px',
              fontSize:'15px',
              fontWeight:'600',
              cursor:'pointer'
            }}
          >
            ⋮
          </button>
        </>
      )}
      {user && viewingListing.userId === user.uid && (
        <div style={{
          width:'100%',
          textAlign:'center',
          padding:'12px',
          background:'#f4f6f8',
          borderRadius:'10px',
          color:'#6b7280',
          fontSize:'16px'
        }}>
          This is your listing
        </div>
      )}
    </div>

  </div>
)}
       
      {/* Verification Modal */}
{showVerifyModal && (
  <div style={{
    position:'fixed',
    inset:0,
    background:'rgba(0,0,0,0.5)',
    zIndex:200,
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    padding:'20px'
  }} onClick={()=>setShowVerifyModal(false)}>
    <div style={{
      background:'#fff',
      borderRadius:'16px',
      padding:'24px',
      width:'100%',
      maxWidth:'400px'
    }} onClick={(e)=>e.stopPropagation()}>
      <h3 style={{fontSize:'20px',fontWeight:'700',marginBottom:'16px'}}>Verify Your Account</h3>
      
      <p style={{fontSize:'16px',color:'#6b7280',marginBottom:'16px',lineHeight:'1.6'}}>
        Upload a photo of your student ID to get verified. This helps us keep Kampasika safe and trusted.
      </p>
      
      <input 
        type="file" 
        id="student-id-upload" 
        accept="image/*" 
        style={{display:'none'}} 
        onChange={(e) => {
          const file = e.target.files[0];
          if (!file) return;
          if (!file.type.startsWith('image/')) {
            setError("Please select an image file");
            return;
          }
          if (file.size > 5 * 1024 * 1024) {
            setError("Image too large. Max 5MB");
            return;
          }
          setStudentIdFile(file);
          const reader = new FileReader();
          reader.onload = (event) => setStudentIdPreview(event.target.result);
          reader.readAsDataURL(file);
        }} 
      />
      
      <label htmlFor="student-id-upload" style={{display:'block',marginBottom:'16px',cursor:'pointer'}}>
        {studentIdPreview ? (
          <div style={{position:'relative'}}>
            <img 
              src={studentIdPreview} 
              alt="Student ID" 
              style={{
                width:'100%',
                height:'200px',
                objectFit:'cover',
                borderRadius:'12px',
                border:'2px solid #e2e6ea'
              }} 
            />
            <div style={{
              position:'absolute',
              top:'8px',
              right:'8px',
              background:'rgba(0,0,0,0.6)',
              color:'#fff',
              padding:'6px 12px',
              borderRadius:'8px',
              fontSize:'12px',
              fontWeight:'600'
            }}>
              Change Photo
            </div>
          </div>
        ) : (
          <div style={{
            border:'2px dashed #e2e6ea',
            borderRadius:'12px',
            padding:'32px',
            textAlign:'center',
            background:'#f9fafb'
          }}>
            <div style={{fontSize:'48px',marginBottom:'12px'}}>🎓</div>
            <div style={{fontSize:'16px',fontWeight:'600',marginBottom:'4px'}}>Upload Student ID</div>
            <div style={{fontSize:'12px',color:'#8a9bb0'}}>Click to select photo (max 5MB)</div>
          </div>
        )}
      </label>
      
      <div style={{
        background:'#eff6ff',
        padding:'12px',
        borderRadius:'10px',
        marginBottom:'16px'
      }}>
        <div style={{fontSize:'13px',color:'#1e40af',lineHeight:'1.5'}}>
          <strong>✓ What we need:</strong>
          <br/>• Clear photo of your student ID
          <br/>• Visible university name
          <br/>• Readable student name/number
        </div>
      </div>
      
      <button 
  onClick={submitVerification} 
  disabled={!studentIdFile || uploading || verificationStatus === "pending"}
  style={{
    width:'100%',
    padding:'12px',
    background: verificationStatus === "pending" 
      ? '#d1d5db' 
      : (studentIdFile && !uploading ? '#2dd4bf' : '#e2e6ea'),
    color: verificationStatus === "pending"
      ? '#6b7280'
      : (studentIdFile && !uploading ? '#0f1b2d' : '#8a9bb0'),
    border:'none',
    borderRadius:'10px',
    fontSize:'14px',
    fontWeight:'600',
    cursor: verificationStatus === "pending" || !studentIdFile || uploading 
      ? 'not-allowed' 
      : 'pointer',
    marginBottom:'8px'
  }}
>
  {uploading 
    ? 'Submitting...' 
    : verificationStatus === "pending"
    ? '⏳ Already Submitted'
    : verificationStatus === "rejected"
    ? 'Resubmit for Verification'
    : 'Submit for Verification'
  }
</button>
      
      <button 
        onClick={()=>{setShowVerifyModal(false);setStudentIdFile(null);setStudentIdPreview(null);}} 
        style={{
          width:'100%',
          padding:'12px',
          background:'transparent',
          color:'#8a9bb0',
          border:'none',
          borderRadius:'10px',
          fontSize:'16px',
          fontWeight:'600',
          cursor:'pointer'
        }}
      >
        Cancel
      </button>
    </div>
  </div>
)}

      {showReportModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}} onClick={()=>setShowReportModal(false)}>
          <div style={{background:'#fff',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'400px'}} onClick={(e)=>e.stopPropagation()}>
            <h3 style={{fontSize:'20px',fontWeight:'700',marginBottom:'16px'}}>Report {reportTarget?.type==='listing'?'Listing':'User'}</h3>
            <p style={{fontSize:'16px',color:'#6b7280',marginBottom:'16px'}}>Help us keep Kampasika safe. What's wrong with this {reportTarget?.type}?</p>
            
            <div style={{marginBottom:'16px'}}>
              {['Scam/Fraud','Inappropriate Content','Spam','Harassment','Misleading Info','Other'].map(reason=>(
                <label key={reason} style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px',cursor:'pointer'}}>
                  <input type="radio" name="report-reason" value={reason} checked={reportReason===reason} onChange={e=>setReportReason(e.target.value)} />
                  <span style={{fontSize:'16px'}}>{reason}</span>
                </label>
              ))}
            </div>
            
            <button onClick={submitReport} disabled={!reportReason} style={{width:'100%',padding:'12px',background:'#ef4444',color:'#fff',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:reportReason?'pointer':'not-allowed',opacity:reportReason?1:0.5}}>Submit Report</button>
            <button onClick={()=>{setShowReportModal(false);setReportTarget(null);setReportReason("");}} style={{width:'100%',padding:'12px',background:'transparent',color:'#8a9bb0',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:'pointer',marginTop:'8px'}}>Cancel</button>
          </div>
        </div>
      )}
      
    {fullScreenImage && (
  <div 
    onClick={() => {setFullScreenImage(null); setFullScreenPhotos(null); setFullScreenIndex(0);}}
    style={{
      position:'fixed',
      inset:0,
      background:'rgba(0,0,0,0.95)',
      zIndex:9999,
      display:'flex',
      flexDirection:'column',
      alignItems:'center',
      justifyContent:'center'
    }}
  >
    <button 
      onClick={() => {setFullScreenImage(null); setFullScreenPhotos(null); setFullScreenIndex(0);}}
      style={{
        position:'absolute',
        top:'16px',
        right:'16px',
        width:'40px',
        height:'40px',
        borderRadius:'50%',
        background:'rgba(255,255,255,0.15)',
        color:'#fff',
        border:'none',
        fontSize:'24px',
        cursor:'pointer',
        display:'flex',
        alignItems:'center',
        justifyContent:'center',
        zIndex:10000
      }}
    >
      ×
    </button>

    {fullScreenPhotos && fullScreenPhotos.length > 1 && (
      <div style={{
        position:'absolute',
        top:'20px',
        left:'50%',
        transform:'translateX(-50%)',
        color:'#fff',
        fontSize:'14px',
        fontWeight:'600',
        background:'rgba(255,255,255,0.15)',
        padding:'4px 14px',
        borderRadius:'16px'
      }}>
        {fullScreenIndex + 1} / {fullScreenPhotos.length}
      </div>
    )}

    <img 
      src={fullScreenPhotos ? fullScreenPhotos[fullScreenIndex] : fullScreenImage} 
      alt="Full view" 
      onClick={(e) => e.stopPropagation()}
      style={{
        maxWidth:'95vw',
        maxHeight:'85vh',
        objectFit:'contain',
        borderRadius:'4px',
        cursor:'default'
      }} 
    />

    {fullScreenPhotos && fullScreenPhotos.length > 1 && (
      <>
        <button
          onClick={(e) => {e.stopPropagation(); setFullScreenIndex(Math.max(0, fullScreenIndex - 1));}}
          disabled={fullScreenIndex === 0}
          style={{
            position:'absolute',
            left:'12px',
            top:'50%',
            transform:'translateY(-50%)',
            width:'44px',
            height:'44px',
            borderRadius:'50%',
            background:'rgba(255,255,255,0.15)',
            color:'#fff',
            border:'none',
            fontSize:'22px',
            cursor:fullScreenIndex === 0 ? 'not-allowed':'pointer',
            opacity:fullScreenIndex === 0 ? 0.3 : 1
          }}
        >
          ‹
        </button>
        <button
          onClick={(e) => {e.stopPropagation(); setFullScreenIndex(Math.min(fullScreenPhotos.length - 1, fullScreenIndex + 1));}}
          disabled={fullScreenIndex === fullScreenPhotos.length - 1}
          style={{
            position:'absolute',
            right:'12px',
            top:'50%',
            transform:'translateY(-50%)',
            width:'44px',
            height:'44px',
            borderRadius:'50%',
            background:'rgba(255,255,255,0.15)',
            color:'#fff',
            border:'none',
            fontSize:'22px',
            cursor:fullScreenIndex === fullScreenPhotos.length - 1 ? 'not-allowed':'pointer',
            opacity:fullScreenIndex === fullScreenPhotos.length - 1 ? 0.3 : 1
          }}
        >
          ›
        </button>
      </>
    )}

    {fullScreenPhotos && fullScreenPhotos.length > 1 && (
      <div style={{
        position:'absolute',
        bottom:'24px',
        display:'flex',
        gap:'6px'
      }}>
        {fullScreenPhotos.map((_, i) => (
          <div 
            key={i}
            onClick={(e) => {e.stopPropagation(); setFullScreenIndex(i);}}
            style={{
              width: i === fullScreenIndex ? '20px' : '8px',
              height:'8px',
              borderRadius:'4px',
              background: i === fullScreenIndex ? '#fff' : 'rgba(255,255,255,0.4)',
              cursor:'pointer',
              transition:'all 0.2s'
            }}
          />
        ))}
      </div>
    )}
  </div>
)}
      

      {/* Auth Modal */}
      {showAuthModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}} onClick={()=>{setShowAuthModal(false);setError("");}}>
          <div style={{background:'#fff',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'400px',maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
              <h2 style={{fontFamily:'serif',fontSize:'22px',fontWeight:'700'}}>Kam<em style={{color:'#2dd4bf'}}>pa</em>sika</h2>
              <button onClick={()=>{setShowAuthModal(false);setError("");}} style={{background:'none',border:'none',fontSize:'24px',cursor:'pointer',color:'#8a9bb0'}}>×</button>
            </div>
            {error && <div style={{background:'#fee2e2',color:'#991b1b',padding:'12px',borderRadius:'8px',marginBottom:'16px',fontSize:'13px'}}>{error}</div>}
            {authMode==="signup"?(
              <>
                <p style={{fontSize:'14px',color:'#6b7280',marginBottom:'16px'}}>Create an account to sell, message sellers, and save items</p>
                <div style={{marginBottom:'12px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Username</label><input type="text" placeholder="e.g. Amina Juma" value={signupName} onChange={e=>setSignupName(e.target.value)} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>
                <div style={{marginBottom:'12px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Email (@gmail.com)</label><input type="email" placeholder="yourname@gmail.com" value={email} onChange={e=>setEmail(e.target.value)} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>
                <div style={{marginBottom:'12px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Registration Number (optional)</label><input type="text" placeholder="e.g. 33421/T.2022" value={regNumber} onChange={e=>setRegNumber(e.target.value)} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>
                <div style={{marginBottom:'16px',position:'relative'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Password</label><input type={showPassword?"text":"password"} placeholder="At least 6 characters" value={password} onChange={e=>setPassword(e.target.value)} style={{width:'100%',padding:'12px 45px 12px 12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/><button onClick={()=>setShowPassword(!showPassword)} style={{position:'absolute',right:'12px',top:'34px',background:'none',border:'none',cursor:'pointer',fontSize:'18px'}}>{showPassword?"👁":"👁‍🗨"}</button></div>
                <button onClick={handleSignup} disabled={loading} style={{width:'100%',padding:'12px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:loading?'not-allowed':'pointer'}}>{loading?"Creating...":"Create Account"}</button>
                <p style={{textAlign:'center',marginTop:'16px',fontSize:'13px',color:'#8a9bb0'}}>Already have an account? <span style={{color:'#2dd4bf',cursor:'pointer',fontWeight:'600'}} onClick={()=>{setAuthMode("login");setError("");}}>Log in</span></p>
              </>
            ):(
              <>
                <p style={{fontSize:'14px',color:'#6b7280',marginBottom:'16px'}}>Welcome back to Kampasika</p>
                <div style={{marginBottom:'12px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Email</label><input type="email" placeholder="yourname@gmail.com" value={email} onChange={e=>setEmail(e.target.value)} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>
                <div style={{marginBottom:'16px',position:'relative'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Password</label><input type={showPassword?"text":"password"} placeholder="Your password" value={password} onChange={e=>setPassword(e.target.value)} style={{width:'100%',padding:'12px 45px 12px 12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/><button onClick={()=>setShowPassword(!showPassword)} style={{position:'absolute',right:'12px',top:'34px',background:'none',border:'none',cursor:'pointer',fontSize:'18px'}}>{showPassword?"👁":"👁‍🗨"}</button></div>
                <button onClick={handleLogin} disabled={loading} style={{width:'100%',padding:'12px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:loading?'not-allowed':'pointer'}}>{loading?"Logging in...":"Log In"}</button>
                <p style={{textAlign:'center',marginTop:'16px',fontSize:'13px',color:'#8a9bb0'}}>Don't have an account? <span style={{color:'#2dd4bf',cursor:'pointer',fontWeight:'600'}} onClick={()=>{setAuthMode("signup");setError("");}}>Sign up</span></p>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{
  position:'fixed',
  bottom:0,
  left:0,
  right:0,
  width:'100%',
  maxWidth:'100vw',
  height:'68px',
  background:'#fff',
  borderTop:'1px solid #e2e6ea',
  display:page==="create"||page==="chat"?'none':'flex',
  alignItems:'center',
  justifyContent:'space-around',
  zIndex:1000,
  boxSizing:'border-box',
  padding:'8px 0'
}}>
        <button onClick={()=>setPage("home")} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',cursor:'pointer',padding:'8px',border:'none',background:'none',position:'relative'}}><span style={{fontSize:'22px',color:page==="home"?'#2dd4bf':'#8a9bb0'}}>🏠</span><span style={{fontSize:'10px',color:'#8a9bb0',fontWeight:'500'}}>Home</span></button>
        <button onClick={()=>setPage("messages")} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',cursor:'pointer',padding:'8px',border:'none',background:'none',position:'relative'}}><span style={{fontSize:'22px',color:page==="messages"?'#2dd4bf':'#8a9bb0'}}>💬</span><span style={{fontSize:'10px',color:'#8a9bb0',fontWeight:'500'}}>Messages</span>{unreadCount>0&&<span style={{position:'absolute',top:'4px',right:'4px',background:'#ef4444',color:'#fff',fontSize:'8px',fontWeight:'700',padding:'1px 4px',borderRadius:'7px',minWidth:'16px',textAlign:'center'}}>{unreadCount}</span>}</button>
        <button onClick={()=>{user ? setPage("create") : requireAuth("sell", ()=>setPage("create"));}} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',cursor:'pointer',padding:'8px',border:'none',background:'none'}}><span style={{fontSize:'24px',color:'#2dd4bf'}}>＋</span><span style={{fontSize:'10px',color:'#2dd4bf',fontWeight:'500'}}>Sell</span></button>
        <button onClick={()=>setPage("activity")} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',cursor:'pointer',padding:'8px',border:'none',background:'none'}}><span style={{fontSize:'22px',color:page==="activity"?'#2dd4bf':'#8a9bb0'}}>📊</span><span style={{fontSize:'10px',color:'#8a9bb0',fontWeight:'500'}}>Activity</span></button>
        <button onClick={()=>setPage("profile")} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',cursor:'pointer',padding:'8px',border:'none',background:'none'}}><span style={{fontSize:'22px',color:page==="profile"?'#2dd4bf':'#8a9bb0'}}>👤</span><span style={{fontSize:'10px',color:'#8a9bb0',fontWeight:'500'}}>Profile</span></button>
      
    </div>
  </div>
  </>
);
}

export default App;