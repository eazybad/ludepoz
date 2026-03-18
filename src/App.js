import { useState, useEffect, useCallback, useRef } from "react";
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, collection, addDoc, updateDoc, doc, query, where, getDocs, getDocsFromCache, serverTimestamp, orderBy, setDoc, getDoc, onSnapshot, increment, deleteDoc } from 'firebase/firestore';
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
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) })
});
const storage = getStorage(app);

const UNIVERSITIES = [
  { id: 1, name: "Ardhi University", short: "ARU", location: "Dar es Salaam" },
];

const DEFAULT_UNI = UNIVERSITIES[0];

// ========== FEATURE FLAGS ==========
// Set to true to enable these features when ready
const ENABLE_ROOMS = false;       // Rooms & Housing feature
const ENABLE_COLLECTIONS = true;  // Collections & Orders feature
// ====================================

const SERVICE_TAGS = [
  { id: "phone_repair", label: "Phone Repair", icon: "📱" },
  { id: "laptop_repair", label: "Laptop Repair", icon: "💻" },
  { id: "logo_design", label: "Logo Design", icon: "🎨" },
  { id: "graphic_design", label: "Graphic Design", icon: "✏️" },
  { id: "room_broker", label: "Room Broker", icon: "🏠" },
  { id: "tutor", label: "Tutoring", icon: "📚" },
  { id: "photography", label: "Photography", icon: "📷" },
  { id: "delivery", label: "Delivery", icon: "🚚" },
  { id: "hair_beauty", label: "Hair & Beauty", icon: "💇" },
  { id: "tailor", label: "Tailoring", icon: "🧵" },
  { id: "food", label: "Food & Snacks", icon: "🍲" },
  { id: "printing", label: "Printing", icon: "🖨️" },
  { id: "other_service", label: "Other", icon: "⚡" },
];

// Generate URL-friendly slug from seller name + uni
const generateSellerSlug = (name, uni) => {
  return (name + '-' + (uni || 'student'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
};

const CATEGORIES = [
  { id: "all", name: "All", icon: "◻" },
  { id: "notes", name: "Notes & Books", icon: "📓" },
  { id: "electronics", name: "Electronics", icon: "💻" },
  { id: "furniture", name: "Furniture", icon: "🪑" },
  { id: "clothing", name: "Clothing", icon: "👕" },
  { id: "other", name: "Other", icon: "📦" },
];

const SERVICE_CATEGORIES = [
  { id: "all", name: "All Services", icon: "⚡" },
  { id: "personal_care", name: "Personal Care", icon: "💇", desc: "Haircuts, nails, barber, braiding" },
  { id: "creative", name: "Creative", icon: "📸", desc: "Photography, videography, design" },
  { id: "clothing_brand", name: "Clothing Brands", icon: "👕", desc: "Student-run fashion & merch" },
  { id: "food", name: "Food & Drinks", icon: "🍲", desc: "Homemade meals, snacks, drinks" },
  { id: "delivery", name: "Campus Runner", icon: "🏃", desc: "Delivery & errands within campus" },
  { id: "other_service", name: "Other", icon: "🔧", desc: "Tutoring, printing, tech help" },
];

const ROOM_TYPES = [
  { id: "all", name: "All Types", icon: "🏠" },
  { id: "single", name: "Single Room", icon: "🚪", sw: "Chumba Kimoja" },
  { id: "master", name: "Master", icon: "🛏️", sw: "Master (na choo)" },
  { id: "apartment", name: "Apartment 1BR+", icon: "🏢", sw: "Nyumba" },
];

const ROOM_AMENITIES = [
  { id: "electricity", label: "Umeme (Electricity)", icon: "⚡" },
  { id: "water", label: "Maji (Water)", icon: "💧" },
  { id: "wifi", label: "WiFi", icon: "📶" },
  { id: "toilet_inside", label: "Choo ndani", icon: "🚿" },
  { id: "toilet_shared", label: "Choo nje (shared)", icon: "🚻" },
  { id: "furnished", label: "Na samani", icon: "🪑" },
  { id: "parking", label: "Parking", icon: "🅿️" },
  { id: "security", label: "Ulinzi (Security)", icon: "🔒" },
];

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState("signup");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [userName, setUserName] = useState("");
  const [userAvatar, setUserAvatar] = useState(null);
  const [userBio, setUserBio] = useState("");
  const [userServices, setUserServices] = useState([]);
  const [selectedUni, setSelectedUni] = useState(DEFAULT_UNI);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [signupUni, setSignupUni] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [page, setPageRaw] = useState("home");
  const pageHistory = useRef(["home"]);
  const isGoingBack = useRef(false);
  
  // Wrapper that tracks navigation history and pushes browser state
  const setPage = useCallback((newPage) => {
    setPageRaw(prev => {
      if (pageHistory.current[pageHistory.current.length - 1] !== newPage) {
        pageHistory.current.push(newPage);
        if (pageHistory.current.length > 20) pageHistory.current.splice(0, 10);
      }
      // Push browser history so Android back button triggers popstate
      if (!isGoingBack.current) {
        window.history.pushState({ page: newPage }, '', '/');
      }
      return newPage;
    });
  }, []);
  
  // Go back one step in history
  const goBack = useCallback(() => {
    isGoingBack.current = true;
    if (pageHistory.current.length > 1) {
      pageHistory.current.pop();
      const prev = pageHistory.current[pageHistory.current.length - 1] || "home";
      setPageRaw(prev);
    } else {
      setPageRaw("home");
    }
    setTimeout(() => { isGoingBack.current = false; }, 50);
  }, []);
  const [homeTab, setHomeTab] = useState("goods");
  const [tabIconsVisible, setTabIconsVisible] = useState(false);
  const homeScrollRef = useRef(null);
  const lastScrollY = useRef(0);
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
  location: "",
  whatsapp: "",
  photoFiles: [],      // Changed from photoFile to photoFiles (array)
  photoPreviews: []    // Changed from photoPreview to photoPreviews (array)
});
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [fullScreenPhotos, setFullScreenPhotos] = useState(null); // array of all photos
  const [fullScreenIndex, setFullScreenIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showCreateSuccess, setShowCreateSuccess] = useState(false);
  const [lastCreatedListing, setLastCreatedListing] = useState(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editProfileData, setEditProfileData] = useState({ name: "", bio: "", services: [], avatarFile: null, avatarPreview: null });
  const [uploading, setUploading] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [showVerificationBanner, setShowVerificationBanner] = useState(false);
  const [showSafetyMessage, setShowSafetyMessage] = useState(true);
  const [showHeroBanner, setShowHeroBanner] = useState(true);
  const [showChatTip, setShowChatTip] = useState(true);
  // Services state
  const [services, setServices] = useState([]);
  const [activeServiceCat, setActiveServiceCat] = useState("all");
  const [serviceSearchQ, setServiceSearchQ] = useState("");
  const [viewingService, setViewingService] = useState(null);
  const [createServiceData, setCreateServiceData] = useState({
    category: "", title: "", desc: "", price: "", priceType: "fixed",
    whatsapp: "", location: "", photoFiles: [], photoPreviews: []
  });
  const [showCreateServiceSuccess, setShowCreateServiceSuccess] = useState(false);
  // Collections/Orders tracker state
  const [collections, setCollections] = useState([]);
  const [viewingCollection, setViewingCollection] = useState(null);
  const [collectionOrders, setCollectionOrders] = useState([]);
  const [createCollectionData, setCreateCollectionData] = useState({
    title: "", desc: "", price: "", expectedPeople: "", options: "", payNumber: "", payName: "", payNetwork: "M-Pesa", deadline: "", photoFiles: [], photoPreviews: []
  });
  const [showCreateCollectionSuccess, setShowCreateCollectionSuccess] = useState(false);
  const [lastCreatedCollectionId, setLastCreatedCollectionId] = useState(null);
  const [orderFormData, setOrderFormData] = useState({ selectedOption: "", paymentRef: "", studentName: "", phone: "", amountPaid: "", payerName: "" });
  const [collectionSearchQ, setCollectionSearchQ] = useState("");
  const [orderSearchQ, setOrderSearchQ] = useState("");
  const [editingCollection, setEditingCollection] = useState(false);
  // Rooms & Housing state
  const [rooms, setRooms] = useState([]);
  const [roomSearchQ, setRoomSearchQ] = useState("");
  const [roomFilterType, setRoomFilterType] = useState("all");
  const [roomFilterMaxPrice, setRoomFilterMaxPrice] = useState("");
  const [viewingRoom, setViewingRoom] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [roommateSearchQ, setRoommateSearchQ] = useState("");
  const [roommatePosts, setRoommatePosts] = useState([]);
  const [createRoomData, setCreateRoomData] = useState({
    landlordName: "", landlordPhone: "", roomType: "", price: "", location: "", nearUni: "ARU", desc: "", amenities: [], photoFiles: [], photoPreviews: [], videoFile: null, videoPreview: null
  });
  const [createRoommateData, setCreateRoommateData] = useState({
    budget: "", preferredArea: "", roomType: "", gender: "", desc: "", moveDate: ""
  });
  const [showCreateRoomSuccess, setShowCreateRoomSuccess] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState("");
  const [viewingListing, setViewingListing] = useState(null);
  // eslint-disable-next-line no-unused-vars
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

  // Public seller profile state
  const [publicSeller, setPublicSeller] = useState(null);
  const [publicSellerListings, setPublicSellerListings] = useState([]);
  const [publicSellerStats, setPublicSellerStats] = useState(null);
  const [publicSellerLoading, setPublicSellerLoading] = useState(false);

  // PWA Install Prompt state
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  
  // eslint-disable-next-line no-unused-vars
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
    const locationStr = item.location ? `📍 ${item.location}` : "";
    const appUrl = "https://kampasika.netlify.app";
    const msg = `Hey! I found this ${sellerUni} student's listing on Kampasika:\n\n` +
      `*${item.title}*${priceStr ? ` — ${priceStr}` : ""}\n` +
      `${item.description ? item.description.substring(0, 80) + (item.description.length > 80 ? '...' : '') + '\n' : ''}` +
      `${locationStr ? locationStr + '\n' : ''}` +
      `By ${item.userName} (${sellerUni})\n` +
      `\nCheck it out on Kampasika: ${appUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Load a public seller profile by userId
  const loadPublicSellerProfile = useCallback(async (userId) => {
    setPublicSellerLoading(true);
    try {
      const userDocRef = doc(db, "users", userId);
      const userSnap = await getDoc(userDocRef);
      if (!userSnap.exists()) { setPublicSellerLoading(false); return; }
      const userData = userSnap.data();
      setPublicSeller({ odId: userId, ...userData });

      // Update URL without reload
      const slug = generateSellerSlug(userData.name, userData.universityName);
      window.history.pushState({}, '', `/seller/${slug}`);

      // SEO: update title + meta description
      document.title = `${userData.name} - Student Seller on Kampasika | ${userData.universityName || ''}`;
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) { metaDesc = document.createElement('meta'); metaDesc.name = 'description'; document.head.appendChild(metaDesc); }
      metaDesc.content = `Check out ${userData.name}'s listings on Kampasika. Student marketplace for buying and selling on campus.`;

      // Load their active listings
      try {
        const listQ = query(collection(db, "listings"), where("userId", "==", userId), where("sold", "==", false), orderBy("createdAt", "desc"));
        const listSnap = await getDocs(listQ);
        setPublicSellerListings(listSnap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })));
      } catch(e) {
        const listQ2 = query(collection(db, "listings"), where("userId", "==", userId), where("sold", "==", false));
        const listSnap2 = await getDocs(listQ2);
        setPublicSellerListings(listSnap2.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })));
      }

      // Load sold stats
      const soldQ = query(collection(db, "listings"), where("userId", "==", userId), where("sold", "==", true));
      const soldSnap = await getDocs(soldQ);
      setPublicSellerStats({ sold: soldSnap.size });

      setPage("seller");
    } catch (err) { console.error("Error loading public seller:", err); }
    finally { setPublicSellerLoading(false); }
  }, []);

  // Open seller profile from a listing card
  const openSellerProfile = (listing) => { loadPublicSellerProfile(listing.userId); };

  // Close seller profile and restore URL
  const closeSellerProfile = () => {
    setPublicSeller(null);
    setPublicSellerListings([]);
    setPublicSellerStats(null);
    window.history.pushState({}, '', '/');
    document.title = 'Kampasika - Student Marketplace';
    setPage("home");
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
  const q = query(collection(db, "listings"), where("sold", "==", false), orderBy("createdAt", "desc"));
  const parseSnap = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() }));
  // 1. Try cache first for instant display
  try {
    const cached = await getDocsFromCache(q);
    if (cached.docs.length > 0) setListings(parseSnap(cached));
  } catch(_) { /* no cache yet — that's fine */ }
  // 2. Then fetch from network to get latest
  try {
    const fresh = await getDocs(q);
    setListings(parseSnap(fresh));
  } catch (err) {
    console.error("Error loading listings:", err);
    try {
      const q2 = query(collection(db, "listings"), where("sold", "==", false));
      const fresh2 = await getDocs(q2);
      setListings(parseSnap(fresh2));
    } catch (err2) { console.error("Error loading listings (fallback):", err2); }
  }
}, []);

  const loadServices = useCallback(async () => {
    const q = query(collection(db, "services"), where("active", "==", true), orderBy("createdAt", "desc"));
    const parseSnap = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() }));
    try { const cached = await getDocsFromCache(q); if (cached.docs.length > 0) setServices(parseSnap(cached)); } catch(_) {}
    try {
      const fresh = await getDocs(q);
      setServices(parseSnap(fresh));
    } catch (err) {
      console.error("Error loading services:", err);
      try {
        const q2 = query(collection(db, "services"), where("active", "==", true));
        const fresh2 = await getDocs(q2);
        setServices(parseSnap(fresh2));
      } catch (err2) { console.error("Error loading services (fallback):", err2); }
    }
  }, []);

  const loadCollections = useCallback(async () => {
    const q = query(collection(db, "collections"), where("active", "==", true), orderBy("createdAt", "desc"));
    const parseSnap = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() }));
    try { const cached = await getDocsFromCache(q); if (cached.docs.length > 0) setCollections(parseSnap(cached)); } catch(_) {}
    try {
      const fresh = await getDocs(q);
      setCollections(parseSnap(fresh));
    } catch (err) {
      console.error("Error loading collections:", err);
      try {
        const q2 = query(collection(db, "collections"), where("active", "==", true));
        const fresh2 = await getDocs(q2);
        setCollections(parseSnap(fresh2));
      } catch (err2) { console.error("Error loading collections fallback:", err2); }
    }
  }, []);

  // ============ ROOMS & HOUSING ============
  const loadRooms = useCallback(async () => {
    try {
      let q = query(collection(db, "rooms"), where("available", "==", true), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setRooms(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })));
    } catch (err) {
      try {
        let q2 = query(collection(db, "rooms"), where("available", "==", true));
        const snap2 = await getDocs(q2);
        setRooms(snap2.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })));
      } catch (err2) { console.error("Error loading rooms:", err2); }
    }
  }, []);

  const loadRoommatePosts = useCallback(async () => {
    try {
      let q = query(collection(db, "roommatePosts"), where("active", "==", true), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setRoommatePosts(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })));
    } catch (err) {
      try {
        let q2 = query(collection(db, "roommatePosts"), where("active", "==", true));
        const snap2 = await getDocs(q2);
        setRoommatePosts(snap2.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })));
      } catch (err2) { console.error("Error loading roommate posts:", err2); }
    }
  }, []);

  const handleCreateRoom = async () => {
    if (!createRoomData.landlordName.trim() || !createRoomData.landlordPhone.trim() || !createRoomData.roomType || !createRoomData.price || !createRoomData.location.trim()) {
      setError("Please fill in name, phone, room type, price, and location"); return;
    }
    try {
      setUploading(true);
      const photoUrls = [];
      if (createRoomData.photoFiles.length > 0) {
        for (let i = 0; i < createRoomData.photoFiles.length; i++) {
          const file = createRoomData.photoFiles[i];
          const storageRef = ref(storage, `rooms/${Date.now()}_${i}.jpg`);
          const snapshot = await uploadBytes(storageRef, file);
          photoUrls.push(await getDownloadURL(snapshot.ref));
        }
      }
      let videoUrl = null;
      if (createRoomData.videoFile) {
        const vRef = ref(storage, `rooms/vid_${Date.now()}.mp4`);
        const vSnap = await uploadBytes(vRef, createRoomData.videoFile);
        videoUrl = await getDownloadURL(vSnap.ref);
      }
      await addDoc(collection(db, "rooms"), {
        landlordName: createRoomData.landlordName.trim(),
        landlordPhone: createRoomData.landlordPhone.trim(),
        roomType: createRoomData.roomType,
        price: parseInt(createRoomData.price),
        location: createRoomData.location.trim(),
        nearUni: createRoomData.nearUni || "ARU",
        description: createRoomData.desc.trim(),
        amenities: createRoomData.amenities || [],
        photoUrl: photoUrls[0] || null,
        photos: photoUrls,
        videoUrl: videoUrl,
        available: true,
        views: 0,
        listedBy: user ? user.uid : "anonymous",
        listedByName: user ? userName : createRoomData.landlordName.trim(),
        createdAt: serverTimestamp()
      });
      setShowCreateRoomSuccess(true);
      setSuccess("Room listed successfully!");
      setCreateRoomData({ landlordName: "", landlordPhone: "", roomType: "", price: "", location: "", nearUni: "ARU", desc: "", amenities: [], photoFiles: [], photoPreviews: [], videoFile: null, videoPreview: null });
      await loadRooms();
    } catch (err) {
      console.error("Error listing room:", err);
      setError("Failed to list room: " + err.message);
    } finally { setUploading(false); }
  };

  const handleCreateRoommatePost = async () => {
    if (!user) { requireAuth("post", () => {}); return; }
    if (!createRoommateData.budget || !createRoommateData.preferredArea.trim()) {
      setError("Please fill in budget and preferred area"); return;
    }
    try {
      setUploading(true);
      await addDoc(collection(db, "roommatePosts"), {
        userId: user.uid,
        userName: userName,
        userAvatar: userAvatar,
        universityName: selectedUni.short,
        budget: parseInt(createRoommateData.budget),
        preferredArea: createRoommateData.preferredArea.trim(),
        roomType: createRoommateData.roomType || "",
        gender: createRoommateData.gender || "",
        description: createRoommateData.desc.trim(),
        moveDate: createRoommateData.moveDate || "",
        active: true,
        createdAt: serverTimestamp()
      });
      setSuccess("Roommate post created!");
      setCreateRoommateData({ budget: "", preferredArea: "", roomType: "", gender: "", desc: "", moveDate: "" });
      await loadRoommatePosts();
    } catch (err) {
      console.error("Error creating roommate post:", err);
      setError("Failed to post: " + err.message);
    } finally { setUploading(false); }
  };

  const handleRoomPhotoSelect = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    for (const file of files) {
      if (!file.type.startsWith('image/')) { setError("Must be an image"); return; }
      if (file.size > 5 * 1024 * 1024) { setError("Max 5MB per photo"); return; }
    }
    const existing = createRoomData.photoFiles || [];
    const existingP = createRoomData.photoPreviews || [];
    const combined = [...existing, ...files].slice(0, 5);
    const newPreviews = [...existingP];
    let count = 0;
    files.forEach((file, i) => {
      if (existing.length + i >= 5) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        newPreviews.push(ev.target.result);
        count++;
        if (count === Math.min(files.length, 5 - existing.length)) {
          setCreateRoomData({ ...createRoomData, photoFiles: combined, photoPreviews: newPreviews });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRoomVideoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { setError("Must be a video file"); return; }
    if (file.size > 50 * 1024 * 1024) { setError("Video must be under 50MB"); return; }
    setCreateRoomData({ ...createRoomData, videoFile: file, videoPreview: URL.createObjectURL(file) });
  };

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
      setUserBio(userData.bio || "");
      setUserServices(userData.services || []);
      setSelectedUni(UNIVERSITIES.find(u => u.id === userData.universityId) || DEFAULT_UNI);
      setIsVerified(userData.verified || false);
      
      // ⭐ CHECK VERIFICATION STATUS
      await checkVerificationStatus(userId);
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

  // Realtime conversation listener for instant notification updates
  // Scroll handler for Airbnb-style tab bar
  // Airbnb behavior: text-only at rest/top, icons appear when scrolled down, 
  // scroll back up = icons disappear back to text-only, stable with delta threshold
  const scrollDelta = useRef(0);
  const tabLocked = useRef(false);

  useEffect(() => {
    const el = homeScrollRef.current;
    if (!el || page !== "home") return;
    const handleScroll = () => {
      if (tabLocked.current) return;
      const y = el.scrollTop;
      const diff = y - lastScrollY.current;
      
      // Near top — always show text-only
      if (y <= 20) {
        setTabIconsVisible(false);
        scrollDelta.current = 0;
        lastScrollY.current = y;
        return;
      }
      
      // Reset delta on direction change
      if ((diff > 0 && scrollDelta.current < 0) || (diff < 0 && scrollDelta.current > 0)) {
        scrollDelta.current = 0;
      }
      scrollDelta.current += diff;
      
      // Scrolling DOWN past threshold → show icons
      if (scrollDelta.current > 60) {
        setTabIconsVisible(true);
      }
      // Scrolling UP past threshold → hide icons (back to text-only)
      else if (scrollDelta.current < -40) {
        setTabIconsVisible(false);
      }
      
      lastScrollY.current = y;
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [page]);

  // When a tab is tapped, show icons and lock scroll briefly
  const handleTabTap = (tabId) => {
    setHomeTab(tabId);
    setTabIconsVisible(true);
    scrollDelta.current = 0;
    tabLocked.current = true;
    if (homeScrollRef.current) homeScrollRef.current.scrollTop = 0;
    setTimeout(() => { tabLocked.current = false; }, 800);
  };

  useEffect(() => {
    if (!user) return;
    const unsubs = [];
    const mergeConvos = (allDocs) => {
      const uniqueConvos = Array.from(new Map(allDocs.map(c => [c.id, c])).values());
      uniqueConvos.sort((a, b) => (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0));
      setConversations(uniqueConvos);
      const unread = uniqueConvos.reduce((sum, conv) => {
        const myUnread = user.uid === conv.buyerId ? conv.buyerUnread : conv.sellerUnread;
        return sum + (myUnread || 0);
      }, 0);
      setUnreadCount(unread);
    };
    let buyerConvos = [];
    let sellerConvos = [];
    try {
      const q1 = query(collection(db, "conversations"), where("buyerId", "==", user.uid), orderBy("lastMessageAt", "desc"));
      unsubs.push(onSnapshot(q1, (snap) => {
        buyerConvos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        mergeConvos([...buyerConvos, ...sellerConvos]);
      }));
      const q2 = query(collection(db, "conversations"), where("sellerId", "==", user.uid), orderBy("lastMessageAt", "desc"));
      unsubs.push(onSnapshot(q2, (snap) => {
        sellerConvos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        mergeConvos([...buyerConvos, ...sellerConvos]);
      }));
    } catch (err) {
      console.error("Error setting up realtime conversations:", err);
    }
    return () => unsubs.forEach(u => u());
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
      setSuccess("Opening conversation...");
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
        setSuccess("");
        markAsRead(conv.id);
      } else {
        const convData = {
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
        };
        const newConvRef = await addDoc(collection(db, "conversations"), convData);
        // Use local data instead of extra getDoc round trip
        setActiveConversation({ id: newConvRef.id, ...convData });
        setPage("chat");
        setSuccess("");
      }
    } catch (err) {
      console.error("Error starting conversation:", err);
      setError("Failed to start conversation. Check your connection.");
      setSuccess("");
    }
  };

 const sendMessage = async () => {
    if (!messageText.trim() || !activeConversation) return;
    
    const text = messageText.trim();
    const tempId = 'temp_' + Date.now();
    setMessageText(""); // Clear immediately
    
    // Optimistic: show message instantly before server confirms
    setMessages(prev => [...prev, {
      id: tempId,
      senderId: user.uid,
      senderName: userName,
      text: text,
      createdAt: new Date(),
      _pending: true
    }]);
    
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
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setMessageText(text); // Restore text
      setError("Failed to send. Check your connection.");
    }
  };

  const markAsRead = async (conversationId) => {
    if (!user) return;
    try {
      // Find the conversation in local state to determine which field to update
      const conv = conversations.find(c => c.id === conversationId);
      if (conv) {
        const isFromBuyer = user.uid === conv.buyerId;
        const unreadField = isFromBuyer ? "buyerUnread" : "sellerUnread";
        if ((conv[unreadField] || 0) > 0) {
          await updateDoc(doc(db, "conversations", conversationId), { [unreadField]: 0 });
        }
      } else {
        // Fallback: fetch then update (for conversations not yet in local state)
        const convRef = doc(db, "conversations", conversationId);
        const convDoc = await getDoc(convRef);
        if (convDoc.exists()) {
          const convData = convDoc.data();
          const isFromBuyer = user.uid === convData.buyerId;
          const unreadField = isFromBuyer ? "buyerUnread" : "sellerUnread";
          if ((convData[unreadField] || 0) > 0) {
            await updateDoc(convRef, { [unreadField]: 0 });
          }
        }
      }
    } catch (err) {
      console.error("Error marking as read:", err);
    }
  };

  useEffect(() => {
    // Safety: show UI after 2s max even if auth/network is slow
    const safetyTimer = setTimeout(() => setLoading(false), 2000);
    
    // Load public data IN PARALLEL immediately (don't await sequentially)
    // Firestore persistentLocalCache will serve cached data instantly when offline
    Promise.all([
      loadListings(),
      loadServices(),
      loadCollections(),
      ...(ENABLE_ROOMS ? [loadRooms(), loadRoommatePosts()] : [])
    ]).catch(err => console.error("Initial load error:", err));
    
    // Check URL for /seller/ route (public seller profiles)
    const path = window.location.pathname;
    if (path.startsWith('/seller/')) {
      const slug = path.replace('/seller/', '');
      (async () => {
        try {
          const usersSnap = await getDocs(collection(db, "users"));
          const match = usersSnap.docs.find(d => {
            const data = d.data();
            return generateSellerSlug(data.name, data.universityName) === slug;
          });
          if (match) {
            loadPublicSellerProfile(match.id);
          }
        } catch(e) { console.error("Error resolving seller slug:", e); }
      })();
    }
    
    // Check URL for /collection/ route (direct collection links)
    if (path.startsWith('/collection/')) {
      const colId = path.replace('/collection/', '');
      if (colId) {
        (async () => {
          try {
            const colDoc = await getDoc(doc(db, "collections", colId));
            if (colDoc.exists()) {
              const colData = { id: colDoc.id, ...colDoc.data(), createdAt: colDoc.data().createdAt?.toDate() };
              setViewingCollection(colData);
              await loadCollectionOrders(colId);
              setPage("collectionDetail");
            }
          } catch(e) { console.error("Error loading shared collection:", e); }
        })();
      }
    }
    
    // Push initial state so browser back works step-by-step
    window.history.replaceState({ page: 'home' }, '', window.location.pathname);
    
    // Handle browser/Android back button — go back one step instead of exiting
    const handlePopState = (e) => {
      const p = window.location.pathname;
      if (p.startsWith('/seller/') || p.startsWith('/collection/')) {
        // On deep link pages, go to home
        setPublicSeller(null);
        setViewingCollection(null);
        setCollectionOrders([]);
        setPageRaw("home");
        pageHistory.current = ["home"];
        window.history.replaceState({ page: 'home' }, '', '/');
        document.title = 'Kampasika - Student Marketplace';
      } else {
        // Normal back — go back one step
        if (pageHistory.current.length > 1) {
          pageHistory.current.pop();
          const prev = pageHistory.current[pageHistory.current.length - 1] || "home";
          setPageRaw(prev);
        }
        // Prevent app exit by pushing state back
        window.history.pushState({ page: 'app' }, '', '/');
      }
    };
    window.addEventListener('popstate', handlePopState);
    
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Show UI immediately — don't block on these
        setLoading(false);
        // Load user-specific data in parallel AFTER showing UI
        Promise.all([
          loadUserProfile(currentUser.uid),
          loadConversations(),
        ]).catch(err => console.error("User data load error:", err));
        // Defer notification permission — not critical for first paint
        setTimeout(() => requestNotificationPermission(currentUser), 3000);
      } else {
        setUser(null);
        setUserName("");
        setUserAvatar(null);
        setLoading(false);
      }
    });
    return () => { unsubscribe(); clearTimeout(safetyTimer); window.removeEventListener('popstate', handlePopState); };
  }, [loadUserProfile, loadListings, loadServices, loadCollections, loadRooms, loadRoommatePosts, loadConversations, loadPublicSellerProfile]);

  //eslint-disable-next-line
  const [tokenRequested, setTokenRequested] = useState(false);

// Notification permission is now deferred in onAuthStateChanged above

  // PWA Install Prompt logic
  useEffect(() => {
    // Check if already running as installed PWA
    const standalone = window.matchMedia('(display-mode: standalone)').matches 
      || window.navigator.standalone === true;
    setIsStandalone(standalone);
    if (standalone) return; // Already installed, don't show banner

    // Check if user already dismissed the banner
    const dismissed = localStorage.getItem('installBannerDismissed');
    if (dismissed) {
      const dismissedAt = parseInt(dismissed);
      // Show again after 7 days
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    }

    // Detect iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIos(isIosDevice);

    if (isIosDevice) {
      // iOS doesn't support beforeinstallprompt, show manual instructions after 3s
      const timer = setTimeout(() => setShowInstallBanner(true), 3000);
      return () => clearTimeout(timer);
    }

    // Android / Desktop Chrome — listen for the native install prompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show banner after a short delay so user sees the page first
      setTimeout(() => setShowInstallBanner(true), 2500);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (isIos) {
      // Can't programmatically install on iOS — banner already shows instructions
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setShowInstallBanner(false);
      localStorage.setItem('installBannerDismissed', Date.now().toString());
    }
    setDeferredPrompt(null);
  };

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('installBannerDismissed', Date.now().toString());
  };


  // Auto-clear success messages after 4 seconds
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(""), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  // Auto-clear error messages after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (page === "home") {
      const interval = setInterval(() => loadListings(), 30000);
      return () => clearInterval(interval);
    }
  }, [page, loadListings]);

  useEffect(() => {
  let unsubscribe;
  try {
    unsubscribe = onMessage(messaging, (payload) => {
      console.log("Message received:", payload);
      
      // Only show notification if we have permission and app is in foreground
      if (Notification.permission === "granted") {
        try {
          new Notification(payload.notification?.title || "Kampasika", {
            body: payload.notification?.body || "You have a new message",
            icon: '/logo192.png',
            tag: 'kampasika-msg',
            vibrate: [200, 100, 200]
          });
        } catch (e) {
          // Notification API not available (some mobile browsers)
          console.log("Notification display failed:", e);
        }
      }
      
      // Always refresh conversations when we get a push
      if (user) loadConversations();
    });
  } catch (e) {
    console.log("FCM onMessage setup failed:", e);
  }

  return () => { if (unsubscribe) unsubscribe(); };
}, [user, loadConversations]);

  // Conversations now use realtime onSnapshot listener - no polling needed
  // Clear notifications when entering messages page
  useEffect(() => {
    if (user && page === "messages") {
      loadConversations();
      // Clear all PWA notifications
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
          reg.getNotifications().then(notifications => {
            notifications.forEach(n => n.close());
          });
        }).catch(() => {});
      }
    }
  }, [user, page, loadConversations]);

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
    
    // Auto mark as read whenever new messages arrive while chat is open
    if (page === "chat" && user) {
      markAsRead(activeConversation.id);
    }
  });

  // Clear all PWA/browser notifications when opening a chat
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.getNotifications({ tag: 'kampasika-notification' }).then(notifications => {
        notifications.forEach(n => n.close());
      });
      reg.getNotifications({ tag: 'kampasika-msg' }).then(notifications => {
        notifications.forEach(n => n.close());
      });
      // Also clear any untagged notifications
      reg.getNotifications().then(notifications => {
        notifications.forEach(n => n.close());
      });
    });
  }

  return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeConversation, page, user]);

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
    if (!signupUni) {
      setError("Please select your university");
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
    const chosenUni = UNIVERSITIES.find(u => u.id === parseInt(signupUni));
    if (!chosenUni) {
      setError("Please select a valid university");
      return;
    }
    try {
      setError("");
      setLoading(true);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      await setDoc(doc(db, "users", userCredential.user.uid), {
        name: signupName.trim(),
        email: email,
        registrationNumber: regNumber.trim(),
        universityId: chosenUni.id,
        universityName: chosenUni.short,
        avatarUrl: null,
        bio: "",
        services: [],
        createdAt: serverTimestamp()
      });
      
      setUserName(signupName.trim());
      setSelectedUni(chosenUni);
      setSuccess("Account created! Welcome to Kampasika 🎉");
      setTimeout(() => setSuccess(""), 4000);
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
      setTimeout(() => setSuccess(""), 4000);
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

  if (!createData.cat || !createData.title.trim() || !createData.price || !createData.location.trim() || !user) {
    setError("Please fill in all required fields (category, title, price, location)");
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
      location: createData.location.trim(),
      whatsapp: createData.whatsapp.trim(),
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
    setTimeout(() => setSuccess(""), 4000);
    // Store last listing info for the share prompt
    const lastListing = {
      title: createData.title.trim(),
      price: parseInt(createData.price),
      description: createData.desc.trim(),
      location: createData.location.trim(),
      universityName: selectedUni.short,
      userName: userName
    };
    setLastCreatedListing(lastListing);
    setCreateData({ 
      cat: "", 
      title: "", 
      desc: "", 
      price: "", 
      cond: "", 
      location: "",
      whatsapp: "",
      photoFiles: [],      // Reset to empty array
      photoPreviews: []    // Reset to empty array
    });
    await loadListings();
    // Don't auto-redirect — let user choose to share or go home
  } catch (err) {
    console.error("Error creating listing:", err);
    setError("Failed to create listing: " + err.message);
  } finally {
    setUploading(false);
  }
};

  const handleCreateService = async () => {
    if (!canPerformAction()) return;
    if (!createServiceData.category || !createServiceData.title.trim() || !createServiceData.price || !user) {
      setError("Please fill in all required fields (category, title, price)");
      return;
    }
    try {
      setError("");
      setUploading(true);
      
      const photoUrls = [];
      if (createServiceData.photoFiles.length > 0) {
        for (let i = 0; i < createServiceData.photoFiles.length; i++) {
          const file = createServiceData.photoFiles[i];
          const storageRef = ref(storage, `services/${user.uid}_${Date.now()}_${i}.jpg`);
          const snapshot = await uploadBytes(storageRef, file);
          const url = await getDownloadURL(snapshot.ref);
          photoUrls.push(url);
        }
      }

      await addDoc(collection(db, "services"), {
        userId: user.uid,
        userName: userName,
        userAvatar: userAvatar,
        universityId: selectedUni.id,
        universityName: selectedUni.short,
        category: createServiceData.category,
        title: createServiceData.title.trim(),
        description: createServiceData.desc.trim(),
        price: parseInt(createServiceData.price),
        priceType: createServiceData.priceType || "fixed",
        location: (createServiceData.location || "").trim(),
        whatsapp: (createServiceData.whatsapp || "").trim(),
        photoUrl: photoUrls[0] || null,
        photos: photoUrls,
        active: true,
        views: 0,
        createdAt: serverTimestamp()
      });
      
      setShowCreateServiceSuccess(true);
      setSuccess("Service listed successfully!");
      setCreateServiceData({
        category: "", title: "", desc: "", price: "", priceType: "fixed",
        whatsapp: "", location: "", photoFiles: [], photoPreviews: []
      });
      await loadServices();
    } catch (err) {
      console.error("Error creating service:", err);
      setError("Failed to create service: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteService = async (serviceId) => {
    if (!window.confirm("Remove this service listing?")) return;
    try {
      await deleteDoc(doc(db, "services", serviceId));
      await loadServices();
      setSuccess("Service removed!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error deleting service:", err);
      setError("Failed to remove service");
    }
  };

  const handleServicePhotoSelect = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    for (const file of files) {
      if (!file.type.startsWith('image/')) { setError("All files must be images"); return; }
      if (file.size > 5 * 1024 * 1024) { setError("Each image must be under 5MB"); return; }
    }
    const existingFiles = createServiceData.photoFiles || [];
    const existingPreviews = createServiceData.photoPreviews || [];
    const combinedFiles = [...existingFiles, ...files].slice(0, 3);
    const newPreviews = [...existingPreviews];
    let processedCount = 0;
    files.forEach((file, index) => {
      if (existingFiles.length + index >= 3) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        newPreviews.push(event.target.result);
        processedCount++;
        if (processedCount === Math.min(files.length, 3 - existingFiles.length)) {
          setCreateServiceData({
            ...createServiceData,
            photoFiles: combinedFiles,
            photoPreviews: newPreviews
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const loadCollectionOrders = async (collectionId) => {
    try {
      const q = query(collection(db, "collections", collectionId, "orders"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      setCollectionOrders(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })));
    } catch (err) {
      console.error("Error loading orders:", err);
      const q2 = query(collection(db, "collections", collectionId, "orders"));
      const snap2 = await getDocs(q2);
      setCollectionOrders(snap2.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })));
    }
  };

  const handleCreateCollection = async () => {
    if (!user) return;
    if (!createCollectionData.title.trim() || !createCollectionData.price) {
      setError("Please fill in title and price"); return;
    }
    try {
      setUploading(true);
      const photoUrls = [];
      if (createCollectionData.photoFiles.length > 0) {
        for (let i = 0; i < createCollectionData.photoFiles.length; i++) {
          const file = createCollectionData.photoFiles[i];
          const storageRef = ref(storage, `collections/${user.uid}_${Date.now()}_${i}.jpg`);
          const snapshot = await uploadBytes(storageRef, file);
          photoUrls.push(await getDownloadURL(snapshot.ref));
        }
      }
      const optionsList = createCollectionData.options.split(",").map(o => o.trim()).filter(o => o);
      const newColRef = await addDoc(collection(db, "collections"), {
        userId: user.uid,
        userName: userName,
        userAvatar: userAvatar,
        universityId: selectedUni.id,
        universityName: selectedUni.short,
        title: createCollectionData.title.trim(),
        description: createCollectionData.desc.trim(),
        price: parseInt(createCollectionData.price),
        expectedPeople: createCollectionData.expectedPeople ? parseInt(createCollectionData.expectedPeople) : 0,
        options: optionsList,
        payNumber: createCollectionData.payNumber.trim(),
        payName: createCollectionData.payName.trim(),
        payNetwork: createCollectionData.payNetwork || "M-Pesa",
        deadline: createCollectionData.deadline || null,
        photoUrl: photoUrls[0] || null,
        photos: photoUrls,
        active: true,
        totalOrders: 0,
        totalPaid: 0,
        totalCollected: 0,
        totalAmount: 0,
        createdAt: serverTimestamp()
      });
      setLastCreatedCollectionId(newColRef.id);
      setShowCreateCollectionSuccess(true);
      setSuccess("Collection created!");
      setCreateCollectionData({ title: "", desc: "", price: "", expectedPeople: "", options: "", payNumber: "", payName: "", payNetwork: "M-Pesa", deadline: "", photoFiles: [], photoPreviews: [] });
      await loadCollections();
    } catch (err) {
      console.error("Error creating collection:", err);
      setError("Failed to create collection: " + err.message);
    } finally { setUploading(false); }
  };

  const placeOrder = async (collectionItem) => {
    if (!user) { requireAuth("order", () => {}); return; }
    if (!orderFormData.studentName.trim()) { setError("Please enter your name"); return; }
    const amountPaid = orderFormData.amountPaid ? parseInt(orderFormData.amountPaid) : 0;
    try {
      setUploading(true);
      // eslint-disable-next-line no-unused-vars
      const orderRef = await addDoc(collection(db, "collections", collectionItem.id, "orders"), {
        userId: user.uid,
        studentName: orderFormData.studentName.trim(),
        phone: orderFormData.phone.trim(),
        payerName: (orderFormData.payerName || "").trim(),
        selectedOption: orderFormData.selectedOption || "",
        paymentRef: orderFormData.paymentRef.trim(),
        amount: collectionItem.price,
        amountPaid: amountPaid,
        paid: amountPaid >= collectionItem.price,
        status: amountPaid >= collectionItem.price ? "paid" : amountPaid > 0 ? "partial" : "unpaid",
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, "collections", collectionItem.id), {
        totalOrders: increment(1),
        totalAmount: increment(collectionItem.price),
        ...(amountPaid >= collectionItem.price ? { totalPaid: increment(1) } : {}),
        totalCollected: increment(amountPaid)
      });
      setSuccess("Order placed!" + (collectionItem.payNumber ? " Send payment to " + collectionItem.payNumber + " (" + (collectionItem.payNetwork||"Mobile Money") + ")" : ""));
      setOrderFormData({ selectedOption: "", paymentRef: "", studentName: userName, phone: "", amountPaid: "", payerName: "" });
      await loadCollectionOrders(collectionItem.id);
      const updatedDoc = await getDoc(doc(db, "collections", collectionItem.id));
      if (updatedDoc.exists()) setViewingCollection({ id: updatedDoc.id, ...updatedDoc.data() });
    } catch (err) {
      console.error("Error placing order:", err);
      setError("Failed to place order: " + err.message);
    } finally { setUploading(false); }
  };

  const toggleOrderPaid = async (collectionId, orderId, currentlyPaid, orderAmount) => {
    try {
      const newPaid = !currentlyPaid;
      await updateDoc(doc(db, "collections", collectionId, "orders", orderId), { 
        paid: newPaid,
        status: newPaid ? "paid" : "unpaid",
        ...(newPaid ? { amountPaid: orderAmount } : {})
      });
      await updateDoc(doc(db, "collections", collectionId), {
        totalPaid: increment(currentlyPaid ? -1 : 1)
      });
      await loadCollectionOrders(collectionId);
      const updatedDoc = await getDoc(doc(db, "collections", collectionId));
      if (updatedDoc.exists()) setViewingCollection({ id: updatedDoc.id, ...updatedDoc.data() });
    } catch (err) {
      console.error("Error updating payment:", err);
      setError("Failed to update payment status");
    }
  };

  const updateCollectionField = async (collectionId, updates) => {
    try {
      await updateDoc(doc(db, "collections", collectionId), updates);
      const updatedDoc = await getDoc(doc(db, "collections", collectionId));
      if (updatedDoc.exists()) setViewingCollection({ id: updatedDoc.id, ...updatedDoc.data() });
      setSuccess("Collection updated!");
      await loadCollections();
    } catch (err) { setError("Failed to update: " + err.message); }
  };

  const closeCollection = async (collectionId) => {
    if (!window.confirm("Close this collection? No new orders will be accepted.")) return;
    try {
      await updateDoc(doc(db, "collections", collectionId), { active: false });
      await loadCollections();
      setViewingCollection(null);
      setSuccess("Collection closed!");
    } catch (err) { setError("Failed to close collection"); }
  };

  const handleCollectionPhotoSelect = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    for (const file of files) {
      if (!file.type.startsWith('image/')) { setError("Must be an image"); return; }
      if (file.size > 5 * 1024 * 1024) { setError("Max 5MB per photo"); return; }
    }
    const existing = createCollectionData.photoFiles || [];
    const existingP = createCollectionData.photoPreviews || [];
    const combined = [...existing, ...files].slice(0, 3);
    const newPreviews = [...existingP];
    let count = 0;
    files.forEach((file, i) => {
      if (existing.length + i >= 3) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        newPreviews.push(ev.target.result);
        count++;
        if (count === Math.min(files.length, 3 - existing.length)) {
          setCreateCollectionData({ ...createCollectionData, photoFiles: combined, photoPreviews: newPreviews });
        }
      };
      reader.readAsDataURL(file);
    });
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
    updateData.bio = (editProfileData.bio || "").trim();
    updateData.services = editProfileData.services || [];

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
    setUserBio(updateData.bio);
    setUserServices(updateData.services);
    
    setShowEditProfile(false);
    setEditProfileData({ name: "", bio: "", services: [], avatarFile: null, avatarPreview: null });
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

  // EXPIRY DISABLED — all user listings show as "active" for now
  // To re-enable: restore isExpired checks below
  const myActiveListings = listings.filter(l => l.userId === user?.uid);
  const myExpiredListings = []; // listings.filter(l => l.userId === user?.uid && isExpired(l));
  const myServices = services.filter(s => s.userId === user?.uid);

  if (loading) {
  return (
    <div style={{
      display:'flex',
      flexDirection:'column',
      alignItems:'center',
      justifyContent:'center',
      height:'100vh',
      background:'#0f1b2d',
      fontFamily:'system-ui'
    }}>
      <div style={{fontFamily:'serif',fontSize:'32px',fontWeight:'700',color:'#fff',marginBottom:'8px'}}>
        Kam<em style={{color:'#2dd4bf'}}>pa</em>sika
      </div>
      <div style={{fontSize:'13px',color:'rgba(255,255,255,0.5)'}}>Student Marketplace</div>
      <div style={{
        marginTop:'24px',
        width:'32px',height:'32px',
        border:'3px solid rgba(255,255,255,0.1)',
        borderTopColor:'#2dd4bf',
        borderRadius:'50%',
        animation:'spin 0.8s linear infinite'
      }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
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

      @keyframes installSlideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes toastSlideIn {
        from { opacity: 0; transform: translateY(-12px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes toastProgress {
        from { width: 100%; }
        to { width: 0%; }
      }

      /* Hide scrollbar for tab bars */
      *::-webkit-scrollbar { width: 0; height: 0; }
      * { scrollbar-width: none; }
      
      /* Smooth press feedback */
      button:active { transform: scale(0.97); }
      
      /* Card hover effect for touch */
      @media (hover: hover) {
        .listing-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important; }
      }
    `}</style>
    {/* ⭐ END OF STYLE TAG */}

  <div className="app-container" style={{
  fontFamily:'-apple-system,BlinkMacSystemFont,system-ui,sans-serif',
  background:'#f5f5f7',
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
    onClick={() => setError("")}
    style={{
      margin: '16px',
      background: '#fee2e2',
      color: '#991b1b',
      padding: '12px 40px 12px 12px',
      borderRadius: '8px',
      fontSize: '13px',
      flexShrink: 0,
      position: 'relative',
      cursor: 'pointer',
      animation: 'toastSlideIn 0.3s ease-out'
    }}
  >
    {error}
    <button onClick={(e) => { e.stopPropagation(); setError(""); }} style={{
      position:'absolute', top:'8px', right:'10px', background:'none', border:'none',
      color:'#991b1b', fontSize:'18px', cursor:'pointer', lineHeight:1, padding:'0 4px'
    }}>×</button>
  </div>
)
  }

      {success && (
  <div
    onClick={() => setSuccess("")}
    style={{
      margin:'16px',
      background:'#d1fae5',
      color:'#065f46',
      padding:'12px 40px 12px 12px',
      borderRadius:'8px',
      fontSize:'13px',
      flexShrink:0,
      position:'relative',
      cursor:'pointer',
      animation:'toastSlideIn 0.3s ease-out',
      overflow:'hidden'
    }}
  >
    {success}
    <button onClick={(e) => { e.stopPropagation(); setSuccess(""); }} style={{
      position:'absolute', top:'8px', right:'10px', background:'none', border:'none',
      color:'#065f46', fontSize:'18px', cursor:'pointer', lineHeight:1, padding:'0 4px'
    }}>×</button>
    <div style={{
      position:'absolute', bottom:0, left:0, height:'3px',
      background:'#059669', borderRadius:'0 0 8px 8px',
      animation:'toastProgress 4s linear forwards'
    }} />
  </div>
)}
      
      {/* EMAIL VERIFICATION BANNER REMOVED */}
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
    {(page==="create"||page==="profile"||page==="messages"||page==="saved"||page==="seller"||page==="services"||page==="createService"||page==="collections"||page==="createCollection"||page==="collectionDetail"||page==="rooms"||page==="createRoom"||page==="roommates") && (
      <button
        onClick={()=>{
          if (page==="seller") closeSellerProfile();
          else if (page==="collectionDetail") { setViewingCollection(null); setCollectionOrders([]); goBack(); }
          else goBack();
        }}
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

    <div style={{fontFamily:'serif',fontSize:'20px',fontWeight:'700',color:'#0f1b2d',flexShrink:0}}>
      {page==="chat" && activeConversation ? (
        activeConversation.listingTitle.substring(0,20) + (activeConversation.listingTitle.length > 20 ? "..." : "")
      ) : (
        <>
          Kam<em style={{color:'#2dd4bf'}}>pa</em>sika
        </>
      )}
    </div>

    {page==="home" && (
      <div style={{
        flex:1,
        minWidth:0,
        display:'flex',
        alignItems:'center',
        background:'#fff',
        borderRadius:'24px',
        padding:'8px 14px',
        marginLeft:'8px',
        border:'1.5px solid #e2e6ea',
        boxShadow:'0 2px 8px rgba(0,0,0,0.06)',
        transition:'box-shadow 0.2s ease'
      }}>
        <span style={{fontSize:'14px',marginRight:'8px',flexShrink:0,opacity:0.5}}>🔍</span>
        <input
          type="text"
          placeholder="Search kampasika..."
          value={searchQ}
          onChange={e=>setSearchQ(e.target.value)}
          style={{flex:1,minWidth:0,border:'none',background:'none',outline:'none',fontSize:'14px',fontWeight:'400',color:'#0f1b2d'}}
        />
      </div>
    )}
    {!user && page === "home" && (
      <button onClick={()=>setShowAuthModal(true)} style={{padding:'8px 14px',background:'linear-gradient(135deg,#2dd4bf,#14b8a6)',color:'#fff',border:'none',borderRadius:'22px',fontSize:'12px',fontWeight:'700',cursor:'pointer',whiteSpace:'nowrap',flexShrink:0,marginLeft:'6px',boxShadow:'0 2px 8px rgba(45,212,191,0.25)'}}>Sign In</button>
    )}
  </div>
)}
        
        {page==="home"&&(
       <div ref={homeScrollRef} style={{
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
          const text = `Join kampasika - ${selectedUni?.short}'s marketplace for students! Buy, sell & trade on campus. https://kampasika.netlify.app`;
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
          {showHeroBanner && (
          <div style={{background:'linear-gradient(135deg,#0f1b2d 0%,#1e293b 50%,#0f172a 100%)',borderRadius:'20px',padding:'24px 20px',marginBottom:'20px',margin:'0 16px 16px 16px',boxSizing:'border-box',width:'calc(100% - 32px)',position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',top:'-30px',right:'-30px',width:'120px',height:'120px',borderRadius:'50%',background:'radial-gradient(circle,rgba(45,212,191,0.25) 0%,transparent 70%)',filter:'blur(10px)'}}/>
            <div style={{position:'absolute',bottom:'-20px',left:'20px',width:'80px',height:'80px',borderRadius:'50%',background:'radial-gradient(circle,rgba(124,58,237,0.2) 0%,transparent 70%)',filter:'blur(8px)'}}/>
            <button onClick={()=>setShowHeroBanner(false)} style={{position:'absolute',top:'12px',right:'12px',background:'rgba(255,255,255,0.1)',backdropFilter:'blur(10px)',border:'none',color:'rgba(255,255,255,0.5)',fontSize:'16px',cursor:'pointer',width:'28px',height:'28px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
            <h1 style={{fontFamily:'serif',fontSize:'26px',fontWeight:'700',color:'#fff',lineHeight:1.25,position:'relative'}}>Trade, share &<br/><em style={{background:'linear-gradient(90deg,#2dd4bf,#a78bfa)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>find your next deal</em><br/>— all on campus.</h1>
            <p style={{color:'rgba(255,255,255,0.5)',fontSize:'13px',marginTop:'10px',lineHeight:1.5,position:'relative'}}>Buy secondhand phones, sell used laptops, find furniture, and more.</p>
            <div style={{display:'flex',gap:'8px',marginTop:'16px',position:'relative'}}><button onClick={()=>{user ? setPage("create") : requireAuth("sell", ()=>setPage("create"));}} style={{background:'linear-gradient(135deg,#2dd4bf,#14b8a6)',color:'#0f1b2d',padding:'11px 22px',borderRadius:'12px',border:'none',fontSize:'15px',fontWeight:'700',cursor:'pointer',boxShadow:'0 4px 14px rgba(45,212,191,0.3)'}}>+ Sell</button>{user ? <button onClick={()=>setPage("profile")} style={{background:'rgba(255,255,255,0.08)',backdropFilter:'blur(10px)',color:'rgba(255,255,255,0.85)',padding:'11px 22px',borderRadius:'12px',border:'1px solid rgba(255,255,255,0.12)',fontSize:'15px',fontWeight:'500',cursor:'pointer'}}>Profile</button> : <button onClick={()=>setShowAuthModal(true)} style={{background:'rgba(255,255,255,0.08)',backdropFilter:'blur(10px)',color:'rgba(255,255,255,0.85)',padding:'11px 22px',borderRadius:'12px',border:'1px solid rgba(255,255,255,0.12)',fontSize:'15px',fontWeight:'500',cursor:'pointer'}}>Join Now</button>}</div>
          </div>
          )}
{/* ===== AIRBNB-STYLE TOP TAB BAR ===== */}
<div style={{
  display:'flex',
  justifyContent:'center',
  gap:'0',
  borderBottom:'1px solid #e2e6ea',
  margin:'0',
  background:'#fff',
  position:'sticky',
  top:0,
  zIndex:40,
  transition:'all 0.3s cubic-bezier(0.4,0,0.2,1)'
}}>
  {[
    {id:'goods',label:'Goods',icon:'🛍️'},
    {id:'services',label:'Services',icon:'⚡'},
    ...(ENABLE_ROOMS ? [{id:'rooms',label:'Rooms',icon:'🏠'}] : [])
  ].map(tab=>(
    <button key={tab.id} onClick={()=>handleTabTap(tab.id)} style={{
      flex:1,
      display:'flex',
      flexDirection: tabIconsVisible ? 'column' : 'row',
      alignItems:'center',
      justifyContent:'center',
      gap: tabIconsVisible ? '2px' : '6px',
      padding: tabIconsVisible ? '8px 0 6px 0' : '12px 0 10px 0',
      background:'none',
      border:'none',
      borderBottom: homeTab===tab.id ? '2.5px solid #0f1b2d' : '2.5px solid transparent',
      cursor:'pointer',
      transition:'all 0.25s cubic-bezier(0.4,0,0.2,1)'
    }}>
      {tabIconsVisible && <span style={{fontSize:'20px',opacity:homeTab===tab.id?1:0.4,transition:'opacity 0.2s ease'}}>{tab.icon}</span>}
      <span style={{
        fontSize: tabIconsVisible ? '10px' : '13px',
        fontWeight: homeTab===tab.id ? '700' : '500',
        color: homeTab===tab.id ? '#0f1b2d' : '#8a9bb0',
        letterSpacing:'0.2px',
        transition:'all 0.2s ease'
      }}>{tab.label}</span>
    </button>
  ))}
</div>

{/* Collections & Orders compact strip */}
{ENABLE_COLLECTIONS && <div style={{margin:'0 16px 14px 16px',background:'linear-gradient(135deg,#fbbf24 0%,#f59e0b 100%)',borderRadius:'14px',padding:'11px 14px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',boxShadow:'0 2px 10px rgba(245,158,11,0.15)',transition:'transform 0.2s ease'}} onClick={()=>setPage("collections")} onMouseDown={e=>e.currentTarget.style.transform='scale(0.98)'} onMouseUp={e=>e.currentTarget.style.transform='scale(1)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
  <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
    <div style={{width:'32px',height:'32px',borderRadius:'10px',background:'rgba(255,255,255,0.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'15px'}}>📋</div>
    <div>
      <span style={{fontSize:'13px',fontWeight:'700',color:'#0f1b2d'}}>Collections & Orders{collections.length > 0 ? ` (${collections.length})` : ''}</span>
      <div style={{fontSize:'10px',color:'rgba(15,27,45,0.55)',marginTop:'1px'}}>Track group buys & payments</div>
    </div>
  </div>
  <span style={{fontSize:'16px',color:'rgba(15,27,45,0.4)',fontWeight:'600'}}>→</span>
</div>}

{/* ===== GOODS TAB CONTENT ===== */}
{homeTab==="goods"&&(<>
<div style={{display:'flex',gap:'8px',marginBottom:'16px',overflowX:'auto',paddingBottom:'4px',margin:'0 16px 16px 16px',boxSizing:'border-box',width:'calc(100% - 32px)',scrollbarWidth:'none',msOverflowStyle:'none'}}>{CATEGORIES.map(c=><button key={c.id} onClick={()=>setActiveCat(c.id)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 16px',background:activeCat===c.id?'#0f1b2d':'#fff',color:activeCat===c.id?'#fff':'#0f1b2d',border:activeCat===c.id?'none':'1.5px solid #e2e6ea',borderRadius:'22px',fontSize:'12px',fontWeight:activeCat===c.id?'600':'500',cursor:'pointer',whiteSpace:'nowrap',boxShadow:activeCat===c.id?'0 2px 8px rgba(15,27,45,0.2)':'none',transition:'all 0.2s ease'}}>{c.icon} {c.name}</button>)}</div>

        {(() => {
  const filteredListings = listings.filter(item => {
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
                <div key={item.id}  style={{background:'#fff',marginBottom:'12px',padding:'16px',cursor:'pointer',opacity:item.sold?0.5:1,borderRadius:'16px',border:'1px solid #f0f0f0',boxShadow:'0 1px 6px rgba(0,0,0,0.04)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
                    <div onClick={(e)=>{e.stopPropagation();openSellerProfile(item);}} style={{width:'36px',height:'36px',borderRadius:'50%',backgroundImage:item.userAvatar?`url(${item.userAvatar})`:'none',backgroundSize:'cover',backgroundPosition:'center',backgroundColor:!item.userAvatar?'#2dd4bf':'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:'700',color:'#fff',cursor:'pointer'}}>{!item.userAvatar&&(item.userName||"?").split(" ").map(n=>n[0]).join("")}</div>
                    <span onClick={(e)=>{e.stopPropagation();openSellerProfile(item);}} style={{fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>{item.userName}</span>
                    <span style={{fontSize:'11px',color:'#8a9bb0',background:'#f4f6f8',padding:'2px 8px',borderRadius:'8px'}}>{item.universityName}</span>
                    {item.location && <span style={{fontSize:'11px',color:'#8a9bb0',background:'#f4f6f8',padding:'2px 8px',borderRadius:'8px'}}>📍 {item.location}</span>}
                    <span style={{fontSize:'11px',color:'#8a9bb0',marginLeft:'auto'}}>{item.createdAt?new Date(item.createdAt).toLocaleDateString():"Recently"}</span>
                  </div>
                  <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'4px'}}>{item.title}</div>
                  {item.description && <div style={{fontSize:'13px',color:'#4a5568',marginBottom:'10px',lineHeight:1.5}}>{item.description}</div>}
               {(item.photos && item.photos.length > 0) ? (
  <div style={{marginBottom:'10px'}}>
    <img
      src={item.photos[0]}
      alt={item.title}
      loading="lazy"
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
        borderRadius:'14px',
        cursor:'pointer'
      }}
    />
  </div>
) : item.photoUrl ? (
  <div style={{marginBottom:'10px'}}>
    <img
      src={item.photoUrl}
      alt={item.title}
      loading="lazy"
      onClick={(e) => {
        e.stopPropagation();
        setFullScreenImage(item.photoUrl);
        incrementViews(item.id);
      }}
      style={{
        width:'100%',
        height:'280px',
        objectFit:'cover',
        borderRadius:'14px',
        cursor:'pointer'
      }}
    />
  </div>
) : null}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:'10px',borderTop:'1px solid #e2e6ea'}}>
                    <div style={{fontFamily:'serif',fontSize:'20px',fontWeight:'700'}}>{item.price.toLocaleString()} TSh</div>
                    {openListingId === item.id && (
  <div style={{
    marginTop:'10px',
    display:'flex',
    gap:'12px',
    borderTop:'1px solid #f0f0f0',
    paddingTop:'10px'
  }}>
    {item.whatsapp ? (
      <button
        onClick={(e)=>{
          e.stopPropagation();
          const num = item.whatsapp.replace(/^0/, '255').replace(/[^0-9]/g, '');
          const msg = `Hi! I'm interested in your listing "${item.title}" on Kampasika for ${item.price.toLocaleString()} TSh.`;
          window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
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
        📱 WhatsApp
      </button>
    ) : null}

    <button
      onClick={(e)=>{
        e.stopPropagation();
        shareOnWhatsApp(item);
      }}
      style={{
        flex:1,
        padding:'8px',
        background:'#f4f6f8',
        color:'#0f1b2d',
        border:'none',
        borderRadius:'6px',
        fontSize:'13px',
        fontWeight:'600',
        cursor:'pointer'
      }}
    >
      📲 Share
    </button>
  </div>
)}

                    <div style={{display:'flex',alignItems:'center',gap:'16px'}}>
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
                      {item.userId !== user?.uid && (
                        <button onClick={(e)=>{e.stopPropagation();requireAuth("message",()=>startConversation(item));}} style={{display:'flex',alignItems:'center',gap:'3px',fontSize:'12px',color:'#2dd4bf',cursor:'pointer',border:'none',background:'none',fontWeight:'600'}} title="Message seller">💬 Message</button>
                      )}
                      {/* VIEW COUNT HIDDEN FOR NOW — uncomment to re-enable */}
                      {/* <span style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'12px',color:'#8a9bb0'}}>👁 {item.views||0}</span> */}
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
</>)}

{/* ===== SERVICES TAB CONTENT ===== */}
{homeTab==="services"&&(<>
  <div style={{margin:'0 16px 10px 16px',display:'flex',alignItems:'center',background:'#fff',borderRadius:'12px',padding:'8px 12px',border:'1.5px solid #e2e6ea'}}>
    <input type="text" placeholder="Search services..." value={serviceSearchQ} onChange={e=>setServiceSearchQ(e.target.value)} style={{flex:1,border:'none',background:'none',outline:'none',fontSize:'14px'}}/>
    <span style={{fontSize:'16px'}}>🔍</span>
  </div>
  <div style={{display:'flex',gap:'8px',overflowX:'auto',paddingBottom:'4px',margin:'0 16px 12px 16px'}}>
    {SERVICE_CATEGORIES.map(c=>(
      <button key={c.id} onClick={()=>setActiveServiceCat(c.id)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 14px',background:activeServiceCat===c.id?'#7c3aed':'#fff',color:activeServiceCat===c.id?'#fff':'#0f1b2d',border:activeServiceCat===c.id?'1.5px solid #7c3aed':'1.5px solid #e2e6ea',borderRadius:'20px',fontSize:'12px',fontWeight:'500',cursor:'pointer',whiteSpace:'nowrap'}}>{c.icon} {c.name}</button>
    ))}
  </div>
  <div style={{margin:'0 16px 12px 16px'}}>
    <button onClick={()=>{user ? setPage("createService") : requireAuth("list service",()=>setPage("createService"));}} style={{padding:'10px 18px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Offer a Service</button>
  </div>
  {(()=>{
    const filtered = services.filter(s => {
      if (activeServiceCat !== "all" && s.category !== activeServiceCat) return false;
      if (serviceSearchQ.trim()) {
        const q = serviceSearchQ.toLowerCase();
        return s.title.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q);
      }
      return true;
    });
    return (
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',margin:'0 16px'}}>
        {filtered.length === 0 ? (
          <div style={{gridColumn:'1/-1',textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px'}}>
            <div style={{fontSize:'40px',marginBottom:'16px'}}>🔍</div>
            <div style={{fontSize:'16px',fontWeight:'600'}}>No services yet</div>
            <div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Be the first to offer a service!</div>
            <button onClick={()=>{user ? setPage("createService") : requireAuth("list service",()=>setPage("createService"));}} style={{marginTop:'16px',padding:'10px 20px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Offer a Service</button>
          </div>
        ) : (
          filtered.map(svc => (
            <div key={svc.id} onClick={()=>setViewingService(svc)} style={{background:'#fff',borderRadius:'14px',overflow:'hidden',cursor:'pointer',border:'1px solid #e2e6ea'}}>
              {(svc.photos && svc.photos.length > 0) ? (
                <img src={svc.photos[0]} alt={svc.title} loading="lazy" style={{width:'100%',height:'130px',objectFit:'cover'}}/>
              ) : svc.photoUrl ? (
                <img src={svc.photoUrl} alt={svc.title} loading="lazy" style={{width:'100%',height:'130px',objectFit:'cover'}}/>
              ) : (
                <div style={{width:'100%',height:'130px',background:'linear-gradient(135deg,#7c3aed,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'40px'}}>
                  {SERVICE_CATEGORIES.find(c=>c.id===svc.category)?.icon || '⚡'}
                </div>
              )}
              <div style={{padding:'10px'}}>
                <div style={{fontSize:'13px',fontWeight:'600',marginBottom:'4px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{svc.title}</div>
                <div style={{display:'flex',alignItems:'center',gap:'4px',marginBottom:'6px'}}>
                  <div style={{width:'18px',height:'18px',borderRadius:'50%',backgroundImage:svc.userAvatar?`url(${svc.userAvatar})`:'none',backgroundColor:!svc.userAvatar?'#7c3aed':'transparent',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'8px',fontWeight:'700',color:'#fff'}}>
                    {!svc.userAvatar&&(svc.userName||"?").split(" ").map(n=>n[0]).join("")}
                  </div>
                  <span style={{fontSize:'11px',color:'#6b7280'}}>{svc.userName}</span>
                </div>
                <div style={{fontSize:'12px',color:'#8a9bb0'}}>{SERVICE_CATEGORIES.find(c=>c.id===svc.category)?.name}</div>
              </div>
            </div>
          ))
        )}
      </div>
    );
  })()}
</>)}

{/* ===== ROOMS TAB CONTENT ===== */}
{ENABLE_ROOMS && homeTab==="rooms"&&(<>
  <div style={{margin:'0 16px 10px 16px',display:'flex',alignItems:'center',background:'#fff',borderRadius:'10px',padding:'8px 12px',border:'1.5px solid #e2e6ea'}}>
    <input type="text" placeholder="Search by location, area..." value={roomSearchQ} onChange={e=>setRoomSearchQ(e.target.value)} style={{flex:1,border:'none',background:'none',outline:'none',fontSize:'14px'}}/>
    <span style={{fontSize:'14px'}}>🔍</span>
  </div>
  <div style={{display:'flex',gap:'6px',overflowX:'auto',margin:'0 16px 10px 16px'}}>
    {ROOM_TYPES.map(t=>(
      <button key={t.id} onClick={()=>setRoomFilterType(t.id)} style={{padding:'6px 14px',background:roomFilterType===t.id?'#0ea5e9':'#fff',color:roomFilterType===t.id?'#fff':'#0f1b2d',border:roomFilterType===t.id?'none':'1.5px solid #e2e6ea',borderRadius:'20px',fontSize:'12px',fontWeight:'500',cursor:'pointer',whiteSpace:'nowrap'}}>{t.icon} {t.name}</button>
    ))}
  </div>
  <div style={{margin:'0 16px 12px 16px',display:'flex',gap:'8px'}}>
    <button onClick={()=>setPage("createRoom")} style={{padding:'10px 16px',background:'#0ea5e9',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>+ List a Room</button>
    <button onClick={()=>setPage("roommates")} style={{padding:'10px 16px',background:'#f4f6f8',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>🤝 Find Roommate</button>
  </div>
  {roomFilterMaxPrice === "" && <button onClick={()=>setRoomFilterMaxPrice("150000")} style={{margin:'0 16px 12px 16px',padding:'6px 14px',background:'#f4f6f8',border:'none',borderRadius:'8px',fontSize:'12px',color:'#6b7280',cursor:'pointer'}}>💰 Set max price filter</button>}
  {roomFilterMaxPrice !== "" && (
    <div style={{margin:'0 16px 12px 16px',display:'flex',alignItems:'center',gap:'8px'}}>
      <span style={{fontSize:'12px',color:'#6b7280'}}>Max:</span>
      <input type="number" value={roomFilterMaxPrice} onChange={e=>setRoomFilterMaxPrice(e.target.value)} placeholder="Max price" style={{width:'120px',padding:'6px 10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'13px',outline:'none'}}/>
      <span style={{fontSize:'12px',color:'#6b7280'}}>TSh</span>
      <button onClick={()=>setRoomFilterMaxPrice("")} style={{fontSize:'12px',color:'#ef4444',background:'none',border:'none',cursor:'pointer'}}>✕ Clear</button>
    </div>
  )}
  {(()=>{
    const filtered = rooms.filter(r => {
      if (roomFilterType !== "all" && r.roomType !== roomFilterType) return false;
      if (roomFilterMaxPrice && r.price > parseInt(roomFilterMaxPrice)) return false;
      if (roomSearchQ.trim()) {
        const q = roomSearchQ.toLowerCase();
        return r.location?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q) || r.landlordName?.toLowerCase().includes(q);
      }
      return true;
    });
    return filtered.length === 0 ? (
      <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px',margin:'0 16px'}}>
        <div style={{fontSize:'40px',marginBottom:'16px'}}>🏠</div>
        <div style={{fontSize:'16px',fontWeight:'600'}}>No rooms listed yet</div>
        <div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Know a landlord? Help them list their room!</div>
        <button onClick={()=>setPage("createRoom")} style={{marginTop:'16px',padding:'10px 20px',background:'#0ea5e9',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ List a Room</button>
      </div>
    ) : (
      <div style={{display:'flex',flexDirection:'column',gap:'10px',margin:'0 16px'}}>
        {filtered.map(room => (
          <div key={room.id} onClick={()=>setViewingRoom(room)} style={{background:'#fff',borderRadius:'14px',overflow:'hidden',cursor:'pointer',border:'1px solid #e2e6ea'}}>
            {room.photoUrl ? (
              <img src={room.photoUrl} alt="" loading="lazy" style={{width:'100%',height:'180px',objectFit:'cover'}}/>
            ) : (
              <div style={{width:'100%',height:'120px',background:'linear-gradient(135deg,#0ea5e9,#38bdf8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'48px'}}>🏠</div>
            )}
            <div style={{padding:'12px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'start',marginBottom:'6px'}}>
                <div>
                  <span style={{fontSize:'11px',background:'#e0f2fe',color:'#0369a1',padding:'2px 8px',borderRadius:'8px',fontWeight:'500'}}>{ROOM_TYPES.find(t=>t.id===room.roomType)?.name || room.roomType}</span>
                  <div style={{fontSize:'15px',fontWeight:'600',marginTop:'6px'}}>📍 {room.location}</div>
                </div>
                <div style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700',color:'#0ea5e9'}}>{room.price?.toLocaleString()}<span style={{fontSize:'11px',fontWeight:'400',color:'#8a9bb0'}}>/mo</span></div>
              </div>
              <div style={{fontSize:'12px',color:'#6b7280'}}>{room.landlordName} • {room.nearUni}</div>
              {room.amenities && room.amenities.length > 0 && (
                <div style={{display:'flex',gap:'4px',marginTop:'6px',flexWrap:'wrap'}}>
                  {room.amenities.slice(0,4).map(a=>{const am=ROOM_AMENITIES.find(x=>x.id===a);return am?<span key={a} style={{fontSize:'10px',background:'#f4f6f8',padding:'2px 6px',borderRadius:'6px'}}>{am.icon} {am.label}</span>:null;})}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  })()}
</>)}
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
              <div style={{textAlign:'center',padding:'32px 16px'}}>
                <div style={{fontSize:'56px',marginBottom:'16px'}}>🎉</div>
                <div style={{fontSize:'20px',fontWeight:'700',marginBottom:'4px',color:'#0f1b2d'}}>Listing created!</div>
                <div style={{fontSize:'13px',color:'#8a9bb0',marginBottom:'28px'}}>Share it to get buyers faster</div>
                
                <button 
                  onClick={() => {
                    if (lastCreatedListing) {
                      const priceStr = lastCreatedListing.price ? `TSh ${lastCreatedListing.price.toLocaleString()}` : "";
                      const locationStr = lastCreatedListing.location ? `📍 ${lastCreatedListing.location}` : "";
                      const appUrl = "https://kampasika.netlify.app";
                      const msg = `I just listed something on Kampasika!\n\n` +
                        `*${lastCreatedListing.title}*${priceStr ? ` — ${priceStr}` : ""}\n` +
                        `${lastCreatedListing.description ? lastCreatedListing.description.substring(0, 80) + (lastCreatedListing.description.length > 80 ? '...' : '') + '\n' : ''}` +
                        `${locationStr ? locationStr + '\n' : ''}` +
                        `\nCheck it out: ${appUrl}`;
                      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                    }
                  }}
                  style={{
                    width:'100%',
                    padding:'14px',
                    background:'#25D366',
                    color:'#fff',
                    border:'none',
                    borderRadius:'12px',
                    fontSize:'16px',
                    fontWeight:'600',
                    cursor:'pointer',
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'center',
                    gap:'8px',
                    marginBottom:'12px'
                  }}
                >
                  📲 Share on WhatsApp
                </button>
                
                <button 
                  onClick={() => {
                    setShowCreateSuccess(false);
                    setLastCreatedListing(null);
                    setPage("home");
                  }}
                  style={{
                    width:'100%',
                    padding:'14px',
                    background:'#f4f6f8',
                    color:'#0f1b2d',
                    border:'none',
                    borderRadius:'12px',
                    fontSize:'16px',
                    fontWeight:'600',
                    cursor:'pointer'
                  }}
                >
                  ← Go to Home
                </button>
              </div>
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
                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>📍 Pickup Location *</label><input type="text" placeholder="e.g. Old Library, Mlimani City, Kijitonyama" value={createData.location} onChange={e=>setCreateData({...createData,location:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/><div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>Where can the buyer pick up or meet you?</div></div>
                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>📱 WhatsApp Number (optional)</label><input type="tel" placeholder="e.g. 0712345678" value={createData.whatsapp} onChange={e=>setCreateData({...createData,whatsapp:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/><div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>Let buyers contact you directly on WhatsApp (visible on your listing)</div></div>
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
                {msg._pending ? '⏳ sending...' : msg.createdAt ? (() => {
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
      
      {page==="saved"&&(
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
          <h2 style={{fontSize:'20px',fontWeight:'700',marginBottom:'16px'}}>Saved Items ({cart.length})</h2>
          <div style={{display:'flex',flexDirection:'column'}}>
            {cart.length===0?(
              <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px'}}><div style={{fontSize:'40px'}}>🔖</div><div style={{fontSize:'16px',fontWeight:'600',marginTop:'12px'}}>No saved items</div><div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Save items from the home feed to see them here</div></div>
            ):(
              cart.map((item,idx)=>(
                <div key={item.id} style={{background:'#fff',borderBottom:idx===cart.length-1?'none':'1px solid #e2e6ea',padding:'16px',borderRadius:idx===0?'12px 12px 0 0':idx===cart.length-1?'0 0 12px 12px':'0'}}>
                  {item.photoUrl && <img src={item.photoUrl} alt={item.title} style={{width:'100%',height:'150px',objectFit:'cover',borderRadius:'10px',marginBottom:'10px'}} />}
                  <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'4px'}}>{item.title}</div>
                  {item.description && <div style={{fontSize:'13px',color:'#4a5568',marginBottom:'10px'}}>{item.description}</div>}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:'10px',borderTop:'1px solid #e2e6ea'}}>
                    <div style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700'}}>{item.price.toLocaleString()} TSh</div>
                    <button onClick={()=>toggleSave(item)} style={{fontSize:'12px',color:'#ef4444',cursor:'pointer',border:'none',background:'none',fontWeight:'600'}}>Remove</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ============ SERVICES BROWSE ============ */}
      {page==="services"&&(
        <div style={{width:'100%',flex:1,overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',boxSizing:'border-box',paddingBottom:'100px'}}>
          
          {/* Services Hero */}
          <div style={{background:'linear-gradient(135deg,#7c3aed 0%,#a78bfa 100%)',borderRadius:'18px',padding:'20px 18px',margin:'0 16px 16px 16px',boxSizing:'border-box',width:'calc(100% - 32px)'}}>
            <h2 style={{fontFamily:'serif',fontSize:'22px',fontWeight:'700',color:'#fff',marginBottom:'6px'}}>Campus Services</h2>
            <p style={{color:'rgba(255,255,255,0.8)',fontSize:'13px',marginBottom:'14px',lineHeight:1.5}}>Book haircuts, order food, hire photographers & more — all from fellow students.</p>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>{user ? setPage("createService") : requireAuth("list service",()=>setPage("createService"));}} style={{padding:'10px 18px',background:'#fff',color:'#7c3aed',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Offer a Service</button>
            </div>
          </div>

          {/* Search */}
          <div style={{margin:'0 16px 12px 16px',display:'flex',alignItems:'center',background:'#fff',borderRadius:'12px',padding:'8px 12px',border:'1.5px solid #e2e6ea'}}>
            <input type="text" placeholder="Search services..." value={serviceSearchQ} onChange={e=>setServiceSearchQ(e.target.value)} style={{flex:1,border:'none',background:'none',outline:'none',fontSize:'14px'}}/>
            <span style={{fontSize:'16px'}}>🔍</span>
          </div>

          {/* Category Filter */}
          <div style={{display:'flex',gap:'8px',overflowX:'auto',paddingBottom:'4px',margin:'0 16px 16px 16px'}}>
            {SERVICE_CATEGORIES.map(c=>(
              <button key={c.id} onClick={()=>setActiveServiceCat(c.id)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 14px',background:activeServiceCat===c.id?'#7c3aed':'#fff',color:activeServiceCat===c.id?'#fff':'#0f1b2d',border:activeServiceCat===c.id?'1.5px solid #7c3aed':'1.5px solid #e2e6ea',borderRadius:'20px',fontSize:'12px',fontWeight:'500',cursor:'pointer',whiteSpace:'nowrap'}}>{c.icon} {c.name}</button>
            ))}
          </div>

          {/* Services Grid */}
          {(() => {
            const filtered = services.filter(s => {
              if (activeServiceCat !== "all" && s.category !== activeServiceCat) return false;
              if (serviceSearchQ.trim()) {
                const q = serviceSearchQ.toLowerCase();
                return s.title.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q);
              }
              return true;
            });
            return (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',margin:'0 16px'}}>
                {filtered.length === 0 ? (
                  <div style={{gridColumn:'1/-1',textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px'}}>
                    <div style={{fontSize:'40px',marginBottom:'16px'}}>🔍</div>
                    <div style={{fontSize:'16px',fontWeight:'600'}}>No services yet</div>
                    <div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Be the first to offer a service!</div>
                    <button onClick={()=>{user ? setPage("createService") : requireAuth("list service",()=>setPage("createService"));}} style={{marginTop:'16px',padding:'10px 20px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Offer a Service</button>
                  </div>
                ) : (
                  filtered.map(svc => (
                    <div key={svc.id} onClick={()=>setViewingService(svc)} style={{background:'#fff',borderRadius:'14px',overflow:'hidden',cursor:'pointer',border:'1px solid #e2e6ea'}}>
                      {(svc.photos && svc.photos.length > 0) ? (
                        <img src={svc.photos[0]} alt={svc.title} loading="lazy" style={{width:'100%',height:'130px',objectFit:'cover'}}/>
                      ) : svc.photoUrl ? (
                        <img src={svc.photoUrl} alt={svc.title} loading="lazy" style={{width:'100%',height:'130px',objectFit:'cover'}}/>
                      ) : (
                        <div style={{width:'100%',height:'130px',background:'linear-gradient(135deg,#7c3aed,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'40px'}}>
                          {SERVICE_CATEGORIES.find(c=>c.id===svc.category)?.icon || '⚡'}
                        </div>
                      )}
                      <div style={{padding:'10px'}}>
                        <div style={{fontSize:'13px',fontWeight:'600',marginBottom:'4px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{svc.title}</div>
                        <div style={{display:'flex',alignItems:'center',gap:'4px',marginBottom:'6px'}}>
                          <div style={{width:'18px',height:'18px',borderRadius:'50%',backgroundImage:svc.userAvatar?`url(${svc.userAvatar})`:'none',backgroundColor:!svc.userAvatar?'#7c3aed':'transparent',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'8px',fontWeight:'700',color:'#fff'}}>
                            {!svc.userAvatar&&(svc.userName||"?").split(" ").map(n=>n[0]).join("")}
                          </div>
                          <span style={{fontSize:'11px',color:'#8a9bb0'}}>{svc.userName}</span>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontFamily:'serif',fontSize:'15px',fontWeight:'700',color:'#7c3aed'}}>{svc.price?.toLocaleString()} TSh</span>
                          <span style={{fontSize:'10px',color:'#8a9bb0',background:'#f4f6f8',padding:'2px 6px',borderRadius:'6px'}}>{svc.priceType === "starting" ? "from" : ""}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ============ CREATE SERVICE ============ */}
      {page==="createService"&&(
        <div style={{width:'100%',flex:1,overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',boxSizing:'border-box',paddingBottom:'100px'}}>
          <div style={{background:'#fff',borderRadius:'12px',padding:'20px',margin:'0 16px'}}>
            <h2 style={{fontSize:'20px',fontWeight:'700',marginBottom:'16px'}}>{showCreateServiceSuccess?"Success!":"Offer a Service"}</h2>
            {showCreateServiceSuccess ? (
              <div style={{textAlign:'center',padding:'32px 16px'}}>
                <div style={{fontSize:'56px',marginBottom:'16px'}}>🎉</div>
                <div style={{fontSize:'20px',fontWeight:'700',marginBottom:'4px',color:'#0f1b2d'}}>Service listed!</div>
                <div style={{fontSize:'13px',color:'#8a9bb0',marginBottom:'28px'}}>Students can now find and book you</div>
                <button onClick={()=>{setShowCreateServiceSuccess(false);setPage("services");}} style={{width:'100%',padding:'14px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:'12px',fontSize:'16px',fontWeight:'600',cursor:'pointer',marginBottom:'12px'}}>View All Services</button>
                <button onClick={()=>{setShowCreateServiceSuccess(false);setPage("home");}} style={{width:'100%',padding:'14px',background:'#f4f6f8',color:'#0f1b2d',border:'none',borderRadius:'12px',fontSize:'16px',fontWeight:'600',cursor:'pointer'}}>← Go to Home</button>
              </div>
            ) : (
              <>
                {/* Service Photo Upload */}
                <input type="file" id="service-photo" accept="image/*" multiple style={{display:'none'}} onChange={handleServicePhotoSelect}/>
                <label htmlFor="service-photo" style={{display:'block',marginBottom:'16px',cursor:'pointer'}}>
                  {createServiceData.photoPreviews.length > 0 ? (
                    <div>
                      <img src={createServiceData.photoPreviews[0]} alt="Preview" style={{width:'100%',height:'200px',objectFit:'cover',borderRadius:'12px',marginBottom:'8px'}}/>
                      <div style={{display:'flex',gap:'6px',overflowX:'auto'}}>
                        {createServiceData.photoPreviews.slice(1).map((p,i)=>(
                          <div key={i} style={{position:'relative',flexShrink:0}}>
                            <img src={p} alt="" style={{width:'60px',height:'60px',objectFit:'cover',borderRadius:'8px'}}/>
                            <button onClick={(e)=>{e.preventDefault();e.stopPropagation();const nf=[...createServiceData.photoFiles];const np=[...createServiceData.photoPreviews];nf.splice(i+1,1);np.splice(i+1,1);setCreateServiceData({...createServiceData,photoFiles:nf,photoPreviews:np});}} style={{position:'absolute',top:'-4px',right:'-4px',width:'18px',height:'18px',borderRadius:'50%',background:'#ef4444',color:'#fff',border:'2px solid #fff',cursor:'pointer',fontSize:'10px',display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
                          </div>
                        ))}
                        {createServiceData.photoPreviews.length < 3 && (
                          <div style={{width:'60px',height:'60px',border:'2px dashed #7c3aed',borderRadius:'8px',display:'flex',alignItems:'center',justifyContent:'center',background:'#f5f3ff',flexShrink:0}}>
                            <span style={{fontSize:'20px',color:'#7c3aed'}}>+</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{border:'2px dashed #e2e6ea',borderRadius:'12px',padding:'32px',textAlign:'center',background:'#f9fafb'}}>
                      <div style={{fontSize:'48px',marginBottom:'12px'}}>📸</div>
                      <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'6px'}}>Add Photos of Your Work</div>
                      <div style={{fontSize:'13px',color:'#8a9bb0'}}>Show off your skills (up to 3 photos)</div>
                    </div>
                  )}
                </label>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Service Category *</label><select value={createServiceData.category} onChange={e=>setCreateServiceData({...createServiceData,category:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none'}}><option value="">Select category...</option>{SERVICE_CATEGORIES.filter(c=>c.id!=="all").map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Service Title *</label><input type="text" placeholder="e.g. Men's Haircuts & Fades, Campus Food Delivery" value={createServiceData.title} onChange={e=>setCreateServiceData({...createServiceData,title:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none'}}/></div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Description</label><textarea placeholder="Describe what you offer, your experience, availability..." value={createServiceData.desc} onChange={e=>setCreateServiceData({...createServiceData,desc:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',minHeight:'100px',resize:'vertical',fontFamily:'inherit'}}/></div>

                <div style={{display:'flex',gap:'10px',marginBottom:'16px'}}>
                  <div style={{flex:1}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Price (TSh) *</label><input type="number" placeholder="e.g. 5000" value={createServiceData.price} onChange={e=>setCreateServiceData({...createServiceData,price:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>
                  <div style={{width:'130px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Price Type</label><select value={createServiceData.priceType} onChange={e=>setCreateServiceData({...createServiceData,priceType:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none'}}><option value="fixed">Fixed</option><option value="starting">Starting at</option><option value="negotiable">Negotiable</option></select></div>
                </div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>📍 Where? (optional)</label><input type="text" placeholder="e.g. Room 23 Block B, Campus Gate" value={createServiceData.location} onChange={e=>setCreateServiceData({...createServiceData,location:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>📱 WhatsApp Number (optional)</label><input type="tel" placeholder="e.g. 0712345678" value={createServiceData.whatsapp} onChange={e=>setCreateServiceData({...createServiceData,whatsapp:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/><div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>Let customers contact you directly on WhatsApp</div></div>

                <button onClick={handleCreateService} disabled={uploading} style={{width:'100%',marginTop:'16px',padding:'12px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:uploading?'not-allowed':'pointer'}}>{uploading?"Uploading...":"✨ List My Service"}</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ============ SERVICE DETAIL ============ */}
      {viewingService && (
        <div style={{position:'fixed',inset:0,background:'#f4f6f8',zIndex:300,overflowY:'auto'}}>
          <div style={{background:'#fff',padding:'12px 16px',display:'flex',alignItems:'center',gap:'10px',borderBottom:'1px solid #e2e6ea',position:'sticky',top:0,zIndex:50}}>
            <button onClick={()=>setViewingService(null)} style={{width:'36px',height:'36px',borderRadius:'50%',background:'#f4f6f8',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'18px',border:'none'}}>←</button>
            <div style={{fontFamily:'serif',fontSize:'20px',fontWeight:'700',color:'#0f1b2d'}}>Service Details</div>
          </div>

          {/* Service Photos */}
          {(viewingService.photos && viewingService.photos.length > 0) ? (
            <img src={viewingService.photos[0]} alt={viewingService.title} onClick={()=>{setFullScreenImage(viewingService.photos[0]);setFullScreenPhotos(viewingService.photos);setFullScreenIndex(0);}} style={{width:'100%',height:'300px',objectFit:'cover',cursor:'pointer'}}/>
          ) : viewingService.photoUrl ? (
            <img src={viewingService.photoUrl} alt={viewingService.title} onClick={()=>setFullScreenImage(viewingService.photoUrl)} style={{width:'100%',height:'300px',objectFit:'cover',cursor:'pointer'}}/>
          ) : (
            <div style={{width:'100%',height:'200px',background:'linear-gradient(135deg,#7c3aed,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'64px'}}>
              {SERVICE_CATEGORIES.find(c=>c.id===viewingService.category)?.icon || '⚡'}
            </div>
          )}

          {/* Thumbnail strip */}
          {viewingService.photos && viewingService.photos.length > 1 && (
            <div style={{padding:'10px 16px',background:'#fff',display:'flex',gap:'8px',overflowX:'auto'}}>
              {viewingService.photos.map((p,i)=>(
                <img key={i} src={p} alt="" onClick={()=>{setFullScreenImage(p);setFullScreenPhotos(viewingService.photos);setFullScreenIndex(i);}} style={{width:'60px',height:'60px',objectFit:'cover',borderRadius:'8px',cursor:'pointer',flexShrink:0}}/>
              ))}
            </div>
          )}

          <div style={{padding:'20px'}}>
            {/* Category Badge */}
            <span style={{fontSize:'12px',background:'#f5f3ff',color:'#7c3aed',padding:'4px 12px',borderRadius:'20px',fontWeight:'500'}}>
              {SERVICE_CATEGORIES.find(c=>c.id===viewingService.category)?.icon} {SERVICE_CATEGORIES.find(c=>c.id===viewingService.category)?.name}
            </span>

            <h1 style={{fontSize:'24px',fontWeight:'700',margin:'12px 0 8px',color:'#0f1b2d'}}>{viewingService.title}</h1>
            
            <div style={{fontFamily:'serif',fontSize:'28px',fontWeight:'700',color:'#7c3aed',marginBottom:'16px'}}>
              {viewingService.priceType === "starting" ? "From " : ""}{viewingService.price?.toLocaleString()} TSh
              {viewingService.priceType === "negotiable" && <span style={{fontSize:'14px',color:'#8a9bb0',fontFamily:'system-ui',fontWeight:'400'}}> (negotiable)</span>}
            </div>

            {/* Meta */}
            <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}}>
              <span style={{fontSize:'12px',background:'#f4f6f8',padding:'6px 12px',borderRadius:'20px',color:'#6b7280'}}>🎓 {viewingService.universityName}</span>
              {viewingService.location && <span style={{fontSize:'12px',background:'#f0fdfa',padding:'6px 12px',borderRadius:'20px',color:'#0f1b2d',fontWeight:'500'}}>📍 {viewingService.location}</span>}
            </div>

            {/* Description */}
            {viewingService.description && (
              <div style={{background:'#fff',padding:'16px',borderRadius:'12px',marginBottom:'16px'}}>
                <h4 style={{fontSize:'14px',fontWeight:'600',marginBottom:'8px',color:'#6b7280'}}>About this service</h4>
                <p style={{fontSize:'15px',lineHeight:1.7,color:'#4a5568',whiteSpace:'pre-wrap'}}>{viewingService.description}</p>
              </div>
            )}

            {/* Provider Info */}
            <div style={{background:'#fff',padding:'16px',borderRadius:'12px',marginBottom:'16px'}}>
              <h4 style={{fontSize:'14px',fontWeight:'600',marginBottom:'12px',color:'#6b7280'}}>Service Provider</h4>
              <div style={{display:'flex',alignItems:'center',gap:'12px'}} onClick={()=>{setViewingService(null);loadPublicSellerProfile(viewingService.userId);}}>
                <div style={{width:'52px',height:'52px',borderRadius:'50%',background:viewingService.userAvatar?`url(${viewingService.userAvatar})`:'linear-gradient(135deg,#7c3aed,#a78bfa)',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',fontWeight:'700',color:'#fff',cursor:'pointer'}}>
                  {!viewingService.userAvatar && viewingService.userName.split(" ").map(n=>n[0]).join("")}
                </div>
                <div>
                  <div style={{fontSize:'16px',fontWeight:'600',color:'#0f1b2d',cursor:'pointer'}}>{viewingService.userName}</div>
                  <div style={{fontSize:'13px',color:'#6b7280'}}>{viewingService.universityName} Student</div>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Bottom Actions */}
          <div style={{position:'sticky',bottom:0,background:'#fff',borderTop:'1px solid #e2e6ea',padding:'16px',display:'flex',gap:'8px'}}>
            {(!user || viewingService.userId !== user.uid) ? (
              <>
                {viewingService.whatsapp ? (
                  <button onClick={()=>{
                    const num = viewingService.whatsapp.replace(/^0/,'255').replace(/[^0-9]/g,'');
                    const msg = `Hi! I'm interested in your service "${viewingService.title}" on Kampasika.`;
                    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,'_blank');
                  }} style={{flex:1,padding:'16px',background:'#25D366',color:'#fff',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:'600',cursor:'pointer'}}>📱 WhatsApp</button>
                ) : null}
                <button onClick={()=>{
                  // Create a dummy listing-like object for conversation
                  const svcAsListing = {
                    id: viewingService.id,
                    title: viewingService.title,
                    price: viewingService.price,
                    photoUrl: viewingService.photoUrl || null,
                    userId: viewingService.userId,
                    userName: viewingService.userName,
                    userAvatar: viewingService.userAvatar
                  };
                  setViewingService(null);
                  requireAuth("message",()=>startConversation(svcAsListing));
                }} style={{flex:1,padding:'16px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:'600',cursor:'pointer'}}>💬 Message</button>
              </>
            ) : (
              <div style={{width:'100%',display:'flex',gap:'8px'}}>
                <div style={{flex:1,textAlign:'center',padding:'12px',background:'#f5f3ff',borderRadius:'10px',color:'#7c3aed',fontSize:'14px',fontWeight:'600'}}>This is your service</div>
                <button onClick={()=>{setViewingService(null);deleteService(viewingService.id);}} style={{padding:'12px 20px',background:'#fee2e2',color:'#991b1b',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>🗑 Remove</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ COLLECTIONS / ORDERS TRACKER ============ */}
      {page==="collections"&&(
        <div style={{width:'100%',flex:1,overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',boxSizing:'border-box',paddingBottom:'100px'}}>
          
          <div style={{background:'linear-gradient(135deg,#f59e0b 0%,#fbbf24 100%)',borderRadius:'18px',padding:'20px 18px',margin:'0 16px 16px 16px',width:'calc(100% - 32px)',boxSizing:'border-box'}}>
            <h2 style={{fontFamily:'serif',fontSize:'22px',fontWeight:'700',color:'#0f1b2d',marginBottom:'6px'}}>Collections & Orders</h2>
            <p style={{color:'rgba(15,27,45,0.7)',fontSize:'13px',marginBottom:'14px',lineHeight:1.5}}>T-shirts, event tickets, class contributions — order and track payments in one place.</p>
            <button onClick={()=>{user ? setPage("createCollection") : requireAuth("create collection",()=>setPage("createCollection"));}} style={{padding:'10px 18px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Create Collection</button>
          </div>

          {/* Search collections */}
          {collections.length > 2 && (
            <div style={{margin:'0 16px 12px 16px',display:'flex',alignItems:'center',background:'#fff',borderRadius:'10px',padding:'8px 12px',border:'1.5px solid #e2e6ea'}}>
              <input type="text" placeholder="Search collections..." value={collectionSearchQ} onChange={e=>setCollectionSearchQ(e.target.value)} style={{flex:1,border:'none',background:'none',outline:'none',fontSize:'14px'}}/>
              <span style={{fontSize:'14px'}}>🔍</span>
            </div>
          )}

          {collections.length === 0 ? (
            <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px',margin:'0 16px'}}>
              <div style={{fontSize:'40px',marginBottom:'16px'}}>📋</div>
              <div style={{fontSize:'16px',fontWeight:'600'}}>No active collections</div>
              <div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Class reps & councils can create collections for t-shirts, tickets, contributions etc.</div>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'10px',margin:'0 16px'}}>
              {collections.filter(col => {
                if (!collectionSearchQ.trim()) return true;
                const q = collectionSearchQ.toLowerCase();
                return col.title?.toLowerCase().includes(q) || col.userName?.toLowerCase().includes(q) || col.description?.toLowerCase().includes(q);
              }).map(col => {
                const target = col.expectedPeople || col.totalOrders || 0;
                const paidPercent = target > 0 ? Math.round((col.totalPaid / target) * 100) : 0;
                // eslint-disable-next-line no-unused-vars
                const orderedPercent = target > 0 ? Math.round((col.totalOrders / target) * 100) : 0;
                return (
                  <div key={col.id} onClick={async()=>{setViewingCollection(col);await loadCollectionOrders(col.id);setOrderFormData({...orderFormData,studentName:userName});setPage("collectionDetail");}} style={{background:'#fff',borderRadius:'14px',padding:'16px',cursor:'pointer',border:'1px solid #e2e6ea'}}>
                    <div style={{display:'flex',gap:'12px',alignItems:'center'}}>
                      {col.photoUrl ? (
                        <img src={col.photoUrl} alt="" style={{width:'56px',height:'56px',objectFit:'cover',borderRadius:'10px',flexShrink:0}}/>
                      ) : (
                        <div style={{width:'56px',height:'56px',borderRadius:'10px',background:'linear-gradient(135deg,#f59e0b,#fbbf24)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'24px',flexShrink:0}}>📋</div>
                      )}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'2px'}}>{col.title}</div>
                        <div style={{fontSize:'13px',color:'#6b7280',marginBottom:'4px'}}>by {col.userName} • {col.universityName}</div>
                        <div style={{fontFamily:'serif',fontSize:'16px',fontWeight:'700',color:'#f59e0b'}}>{col.price?.toLocaleString()} TSh</div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div style={{marginTop:'12px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px',color:'#6b7280',marginBottom:'4px'}}>
                        <span>{col.totalOrders || 0}{col.expectedPeople ? `/${col.expectedPeople}` : ''} ordered</span>
                        <span>{col.totalPaid || 0} paid ({paidPercent}%)</span>
                      </div>
                      <div style={{height:'6px',background:'#f4f6f8',borderRadius:'3px',overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${Math.min(paidPercent,100)}%`,background:paidPercent>=100?'#10b981':'#f59e0b',borderRadius:'3px',transition:'width 0.3s'}}/>
                      </div>
                    </div>
                    {col.options && col.options.length > 0 && (
                      <div style={{display:'flex',gap:'4px',marginTop:'8px',flexWrap:'wrap'}}>
                        {col.options.slice(0,4).map((opt,i)=><span key={i} style={{fontSize:'10px',background:'#fef3c7',color:'#92400e',padding:'2px 8px',borderRadius:'8px'}}>{opt}</span>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============ CREATE COLLECTION ============ */}
      {page==="createCollection"&&(
        <div style={{width:'100%',flex:1,overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',boxSizing:'border-box',paddingBottom:'100px'}}>
          <div style={{background:'#fff',borderRadius:'12px',padding:'20px',margin:'0 16px'}}>
            <h2 style={{fontSize:'20px',fontWeight:'700',marginBottom:'16px'}}>{showCreateCollectionSuccess?"Success!":"New Collection"}</h2>
            {showCreateCollectionSuccess ? (
              <div style={{textAlign:'center',padding:'32px 16px'}}>
                <div style={{fontSize:'56px',marginBottom:'16px'}}>🎉</div>
                <div style={{fontSize:'20px',fontWeight:'700',marginBottom:'4px'}}>Collection created!</div>
                <div style={{fontSize:'13px',color:'#8a9bb0',marginBottom:'20px'}}>Share the link with your class or group</div>
                {lastCreatedCollectionId && (
                  <button onClick={()=>{
                    const link = `https://kampasika.netlify.app/collection/${lastCreatedCollectionId}`;
                    const msg = `📋 New collection on Kampasika!\n\nOrder here: ${link}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank');
                  }} style={{width:'100%',padding:'14px',background:'#25D366',color:'#fff',border:'none',borderRadius:'12px',fontSize:'16px',fontWeight:'600',cursor:'pointer',marginBottom:'12px',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}>📲 Share on WhatsApp</button>
                )}
                <button onClick={()=>{setShowCreateCollectionSuccess(false);setPage("collections");}} style={{width:'100%',padding:'14px',background:'#f59e0b',color:'#0f1b2d',border:'none',borderRadius:'12px',fontSize:'16px',fontWeight:'600',cursor:'pointer',marginBottom:'12px'}}>View Collections</button>
                <button onClick={()=>{setShowCreateCollectionSuccess(false);setPage("home");}} style={{width:'100%',padding:'14px',background:'#f4f6f8',color:'#0f1b2d',border:'none',borderRadius:'12px',fontSize:'16px',fontWeight:'600',cursor:'pointer'}}>← Home</button>
              </div>
            ) : (
              <>
                <div style={{background:'#fef3c7',padding:'12px',borderRadius:'10px',marginBottom:'16px',fontSize:'13px',color:'#92400e',lineHeight:1.5}}>
                  📋 <strong>For class reps & councils:</strong> Create a collection for t-shirts, event tickets, field trip contributions, or any group order. Students can order and you can track who has paid.
                </div>

                <input type="file" id="collection-photo" accept="image/*" multiple style={{display:'none'}} onChange={handleCollectionPhotoSelect}/>
                <label htmlFor="collection-photo" style={{display:'block',marginBottom:'16px',cursor:'pointer'}}>
                  {createCollectionData.photoPreviews.length > 0 ? (
                    <div><img src={createCollectionData.photoPreviews[0]} alt="" style={{width:'100%',height:'180px',objectFit:'cover',borderRadius:'12px'}}/></div>
                  ) : (
                    <div style={{border:'2px dashed #e2e6ea',borderRadius:'12px',padding:'24px',textAlign:'center',background:'#f9fafb'}}>
                      <div style={{fontSize:'36px',marginBottom:'8px'}}>📸</div>
                      <div style={{fontSize:'14px',fontWeight:'600'}}>Add a photo</div>
                      <div style={{fontSize:'12px',color:'#8a9bb0'}}>e.g. the t-shirt design, event poster</div>
                    </div>
                  )}
                </label>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>What are you collecting for? *</label><input type="text" placeholder="e.g. Year 3 Graduation T-Shirts, Field Trip Bus" value={createCollectionData.title} onChange={e=>setCreateCollectionData({...createCollectionData,title:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Description</label><textarea placeholder="Details — deadline, what's included, pickup info..." value={createCollectionData.desc} onChange={e=>setCreateCollectionData({...createCollectionData,desc:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',minHeight:'80px',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}/></div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Price per person (TSh) *</label><input type="number" placeholder="e.g. 15000" value={createCollectionData.price} onChange={e=>setCreateCollectionData({...createCollectionData,price:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Expected number of people (optional)</label><input type="number" placeholder="e.g. 45" value={createCollectionData.expectedPeople} onChange={e=>setCreateCollectionData({...createCollectionData,expectedPeople:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/><div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>How many people in your class/group? This helps calculate the expected total amount{createCollectionData.price && createCollectionData.expectedPeople ? ` — Expected: ${(parseInt(createCollectionData.price) * parseInt(createCollectionData.expectedPeople)).toLocaleString()} TSh` : ''}</div></div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Options (comma separated, optional)</label><input type="text" placeholder="e.g. Size S, Size M, Size L, Size XL" value={createCollectionData.options} onChange={e=>setCreateCollectionData({...createCollectionData,options:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/><div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>Sizes, colors, quantities — anything students need to pick</div></div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>📱 Payment Network</label>
                  <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'8px'}}>
                    {["M-Pesa","Tigo Pesa","Airtel Money","Halopesa","AzamPesa"].map(net=>(
                      <button key={net} onClick={()=>setCreateCollectionData({...createCollectionData,payNetwork:net})} style={{padding:'6px 14px',borderRadius:'8px',border:createCollectionData.payNetwork===net?'2px solid #f59e0b':'1.5px solid #e2e6ea',background:createCollectionData.payNetwork===net?'#fef3c7':'#fff',fontSize:'13px',cursor:'pointer',fontWeight:createCollectionData.payNetwork===net?'600':'400'}}>{net}</button>
                    ))}
                  </div>
                </div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>📱 Number to pay to</label><input type="tel" placeholder="e.g. 0712345678" value={createCollectionData.payNumber} onChange={e=>setCreateCollectionData({...createCollectionData,payNumber:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/><div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>The {createCollectionData.payNetwork} number students will send money to</div></div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Name on the account</label><input type="text" placeholder="e.g. JOHN MWANGI" value={createCollectionData.payName} onChange={e=>setCreateCollectionData({...createCollectionData,payName:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/><div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>So students can verify they're sending to the right person</div></div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Deadline (optional)</label><input type="date" value={createCollectionData.deadline} onChange={e=>setCreateCollectionData({...createCollectionData,deadline:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>

                <button onClick={handleCreateCollection} disabled={uploading} style={{width:'100%',padding:'14px',background:'#f59e0b',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:uploading?'not-allowed':'pointer'}}>{uploading?"Creating...":"📋 Create Collection"}</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ============ COLLECTION DETAIL ============ */}
      {page==="collectionDetail"&&viewingCollection&&(
        <div style={{width:'100%',flex:1,overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',boxSizing:'border-box',paddingBottom:'100px'}}>
          
          {/* Header image */}
          {viewingCollection.photoUrl && <img src={viewingCollection.photoUrl} alt="" style={{width:'100%',height:'200px',objectFit:'cover'}}/>}
          
          <div style={{padding:'16px'}}>
            <h2 style={{fontSize:'22px',fontWeight:'700',marginBottom:'4px'}}>{viewingCollection.title}</h2>
            <div style={{fontSize:'13px',color:'#6b7280',marginBottom:'8px'}}>by {viewingCollection.userName} • {viewingCollection.universityName}</div>
            
            <div style={{fontFamily:'serif',fontSize:'28px',fontWeight:'700',color:'#f59e0b',marginBottom:'12px'}}>{viewingCollection.price?.toLocaleString()} TSh <span style={{fontSize:'14px',fontFamily:'system-ui',fontWeight:'400',color:'#8a9bb0'}}>per person</span></div>

            {viewingCollection.description && <p style={{fontSize:'14px',color:'#4a5568',lineHeight:1.6,marginBottom:'16px',whiteSpace:'pre-wrap'}}>{viewingCollection.description}</p>}

            {viewingCollection.deadline && <div style={{fontSize:'13px',color:'#ef4444',fontWeight:'600',marginBottom:'12px'}}>⏰ Deadline: {new Date(viewingCollection.deadline).toLocaleDateString('en',{day:'numeric',month:'long',year:'numeric'})}</div>}

            {/* Stats cards */}
            <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
              <div style={{flex:1,background:'#fef3c7',borderRadius:'12px',padding:'12px',textAlign:'center'}}>
                <div style={{fontSize:'24px',fontWeight:'700',color:'#f59e0b'}}>{viewingCollection.totalOrders || 0}{viewingCollection.expectedPeople ? <span style={{fontSize:'14px',fontWeight:'400',color:'#92400e'}}>/{viewingCollection.expectedPeople}</span> : ''}</div>
                <div style={{fontSize:'11px',color:'#92400e'}}>Ordered</div>
              </div>
              <div style={{flex:1,background:'#d1fae5',borderRadius:'12px',padding:'12px',textAlign:'center'}}>
                <div style={{fontSize:'24px',fontWeight:'700',color:'#10b981'}}>{viewingCollection.totalPaid || 0}</div>
                <div style={{fontSize:'11px',color:'#065f46'}}>Paid</div>
              </div>
              <div style={{flex:1,background:'#fee2e2',borderRadius:'12px',padding:'12px',textAlign:'center'}}>
                <div style={{fontSize:'24px',fontWeight:'700',color:'#ef4444'}}>{(viewingCollection.totalOrders||0)-(viewingCollection.totalPaid||0)}</div>
                <div style={{fontSize:'11px',color:'#991b1b'}}>Unpaid</div>
              </div>
            </div>

            {/* Amount collected */}
            <div style={{background:'#fff',borderRadius:'12px',padding:'14px',border:'1px solid #e2e6ea',marginBottom:'16px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:'13px',color:'#6b7280'}}>Amount Collected</span>
                <span style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700',color:'#10b981'}}>{((viewingCollection.totalPaid||0) * viewingCollection.price).toLocaleString()} TSh</span>
              </div>
              {viewingCollection.expectedPeople > 0 && (
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'6px'}}>
                  <span style={{fontSize:'13px',color:'#6b7280'}}>Expected Total ({viewingCollection.expectedPeople} people)</span>
                  <span style={{fontFamily:'serif',fontSize:'16px',fontWeight:'600',color:'#8a9bb0'}}>{(viewingCollection.expectedPeople * viewingCollection.price).toLocaleString()} TSh</span>
                </div>
              )}
              {viewingCollection.expectedPeople > 0 && (
                <div style={{marginTop:'8px'}}>
                  <div style={{height:'8px',background:'#f4f6f8',borderRadius:'4px',overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${Math.min(100, Math.round(((viewingCollection.totalPaid||0) / viewingCollection.expectedPeople) * 100))}%`,background:((viewingCollection.totalPaid||0) >= viewingCollection.expectedPeople)?'#10b981':'#f59e0b',borderRadius:'4px',transition:'width 0.3s'}}/>
                  </div>
                  <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px',textAlign:'right'}}>{Math.round(((viewingCollection.totalPaid||0) / viewingCollection.expectedPeople) * 100)}% collected</div>
                </div>
              )}
            </div>

            {/* Payment info (visible to buyers) */}
            {viewingCollection.payNumber && user?.uid !== viewingCollection.userId && (
              <div style={{background:'#f0fdf4',borderRadius:'12px',padding:'14px',marginBottom:'16px',border:'1px solid #bbf7d0'}}>
                <div style={{fontSize:'14px',fontWeight:'600',color:'#166534',marginBottom:'6px'}}>💰 How to Pay</div>
                <div style={{fontSize:'15px',color:'#0f1b2d',fontWeight:'600'}}>{viewingCollection.payNetwork || "Mobile Money"}: {viewingCollection.payNumber}</div>
                {viewingCollection.payName && <div style={{fontSize:'13px',color:'#6b7280'}}>Account Name: {viewingCollection.payName}</div>}
                <div style={{fontSize:'12px',color:'#6b7280',marginTop:'6px'}}>After sending, fill in your details below so the rep can verify your payment</div>
              </div>
            )}

            {/* Payment info also visible to creator */}
            {viewingCollection.payNumber && user?.uid === viewingCollection.userId && (
              <div style={{background:'#eff6ff',borderRadius:'12px',padding:'14px',marginBottom:'16px',border:'1px solid #bfdbfe',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:'12px',color:'#1e40af',fontWeight:'600'}}>Collecting via {viewingCollection.payNetwork || "Mobile Money"}</div>
                  <div style={{fontSize:'14px',color:'#0f1b2d',fontWeight:'600'}}>{viewingCollection.payNumber} {viewingCollection.payName ? '• '+viewingCollection.payName : ''}</div>
                </div>
                <button onClick={()=>setEditingCollection(!editingCollection)} style={{padding:'6px 12px',background:'#dbeafe',color:'#1e40af',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>✏️ Edit</button>
              </div>
            )}

            {/* Edit Collection (for creator) */}
            {editingCollection && user?.uid === viewingCollection.userId && (
              <div style={{background:'#fff',borderRadius:'12px',padding:'16px',border:'2px solid #3b82f6',marginBottom:'16px'}}>
                <h3 style={{fontSize:'15px',fontWeight:'700',marginBottom:'12px'}}>Edit Collection</h3>
                <div style={{marginBottom:'10px'}}><label style={{fontSize:'12px',fontWeight:'600'}}>Title</label><input type="text" defaultValue={viewingCollection.title} id="edit-col-title" style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'14px',outline:'none',boxSizing:'border-box',marginTop:'4px'}}/></div>
                <div style={{marginBottom:'10px'}}><label style={{fontSize:'12px',fontWeight:'600'}}>Description</label><textarea defaultValue={viewingCollection.description} id="edit-col-desc" style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'14px',outline:'none',minHeight:'60px',fontFamily:'inherit',boxSizing:'border-box',marginTop:'4px'}}/></div>
                <div style={{marginBottom:'10px'}}><label style={{fontSize:'12px',fontWeight:'600'}}>Price (TSh)</label><input type="number" defaultValue={viewingCollection.price} id="edit-col-price" style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'14px',outline:'none',boxSizing:'border-box',marginTop:'4px'}}/></div>
                <div style={{marginBottom:'10px'}}><label style={{fontSize:'12px',fontWeight:'600'}}>Payment Number</label><input type="text" defaultValue={viewingCollection.payNumber} id="edit-col-paynum" style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'14px',outline:'none',boxSizing:'border-box',marginTop:'4px'}}/></div>
                <div style={{display:'flex',gap:'8px'}}>
                  <button onClick={()=>{
                    const t=document.getElementById('edit-col-title').value;
                    const d=document.getElementById('edit-col-desc').value;
                    const p=document.getElementById('edit-col-price').value;
                    const pn=document.getElementById('edit-col-paynum').value;
                    updateCollectionField(viewingCollection.id,{title:t.trim(),description:d.trim(),price:parseInt(p),payNumber:pn.trim()});
                    setEditingCollection(false);
                  }} style={{flex:1,padding:'10px',background:'#3b82f6',color:'#fff',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>Save</button>
                  <button onClick={()=>setEditingCollection(false)} style={{padding:'10px 16px',background:'#f4f6f8',color:'#6b7280',border:'none',borderRadius:'8px',fontSize:'14px',cursor:'pointer'}}>Cancel</button>
                </div>
              </div>
            )}

            {/* ORDER FORM — for students (including creator if they want to add themselves) */}
            {user && viewingCollection.active && (
              <div style={{background:'#fff',borderRadius:'12px',padding:'16px',border:'2px solid #f59e0b',marginBottom:'16px'}}>
                <h3 style={{fontSize:'16px',fontWeight:'700',marginBottom:'4px',color:'#0f1b2d'}}>📝 {user.uid === viewingCollection.userId ? 'Add Yourself to This Collection' : 'Place Your Order'}</h3>
                <div style={{fontSize:'12px',color:'#8a9bb0',marginBottom:'12px'}}>Required amount: <strong>{viewingCollection.price?.toLocaleString()} TSh</strong></div>
                
                <div style={{marginBottom:'12px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'4px'}}>Your Name *</label><input type="text" value={orderFormData.studentName} onChange={e=>setOrderFormData({...orderFormData,studentName:e.target.value})} placeholder="Full name" style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'15px',outline:'none',boxSizing:'border-box'}}/></div>

                <div style={{marginBottom:'12px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'4px'}}>Phone (optional)</label><input type="tel" value={orderFormData.phone} onChange={e=>setOrderFormData({...orderFormData,phone:e.target.value})} placeholder="0712345678" style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'15px',outline:'none',boxSizing:'border-box'}}/></div>

                {viewingCollection.options && viewingCollection.options.length > 0 && (
                  <div style={{marginBottom:'12px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Select Option *</label>
                    <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                      {viewingCollection.options.map((opt,i)=>(
                        <button key={i} onClick={()=>setOrderFormData({...orderFormData,selectedOption:opt})} style={{padding:'8px 16px',borderRadius:'8px',border:orderFormData.selectedOption===opt?'2px solid #f59e0b':'1.5px solid #e2e6ea',background:orderFormData.selectedOption===opt?'#fef3c7':'#fff',color:'#0f1b2d',fontSize:'14px',fontWeight:'500',cursor:'pointer'}}>{opt}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{background:'#f9fafb',borderRadius:'10px',padding:'12px',marginBottom:'12px'}}>
                  <div style={{fontSize:'12px',fontWeight:'700',color:'#6b7280',marginBottom:'8px'}}>💰 PAYMENT DETAILS</div>
                  
                  <div style={{marginBottom:'10px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'4px'}}>Amount Paid (TSh)</label><input type="number" value={orderFormData.amountPaid} onChange={e=>setOrderFormData({...orderFormData,amountPaid:e.target.value})} placeholder={`Full amount: ${viewingCollection.price?.toLocaleString()}`} style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'15px',outline:'none',boxSizing:'border-box'}}/>{orderFormData.amountPaid && parseInt(orderFormData.amountPaid) < viewingCollection.price && <div style={{fontSize:'11px',color:'#f59e0b',marginTop:'4px',fontWeight:'600'}}>⏳ Partial payment — {(viewingCollection.price - parseInt(orderFormData.amountPaid)).toLocaleString()} TSh remaining</div>}{!orderFormData.amountPaid && <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>Leave empty if you haven't paid yet — you can update later</div>}</div>

                  <div style={{marginBottom:'10px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'4px'}}>Name on the {viewingCollection.payNetwork || 'Mobile Money'} account</label><input type="text" value={orderFormData.payerName} onChange={e=>setOrderFormData({...orderFormData,payerName:e.target.value})} placeholder="e.g. AMINA JUMA (as it appears on M-Pesa)" style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'15px',outline:'none',boxSizing:'border-box'}}/><div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>The name the rep will see on their payment notification</div></div>

                  <div style={{marginBottom:'4px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'4px'}}>Transaction Code</label><input type="text" value={orderFormData.paymentRef} onChange={e=>setOrderFormData({...orderFormData,paymentRef:e.target.value.toUpperCase()})} placeholder="e.g. SCI12345XYZ" style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'15px',outline:'none',boxSizing:'border-box',fontFamily:'monospace'}}/><div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>The code from your payment SMS so the rep can verify</div></div>
                </div>

                <button onClick={()=>placeOrder(viewingCollection)} disabled={uploading} style={{width:'100%',padding:'14px',background:'#f59e0b',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:uploading?'not-allowed':'pointer'}}>{uploading?"Placing...":"✓ Place Order"}</button>
              </div>
            )}

            {!user && viewingCollection.active && (
              <button onClick={()=>requireAuth("order",()=>{})} style={{width:'100%',padding:'14px',background:'#f59e0b',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:'pointer',marginBottom:'16px'}}>Sign in to Order</button>
            )}

            {/* ORDERS LIST — visible to collection creator (the rep) */}
            {user && user.uid === viewingCollection.userId && (
              <div style={{marginBottom:'16px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
                  <h3 style={{fontSize:'16px',fontWeight:'700'}}>Orders ({collectionOrders.length})</h3>
                  {viewingCollection.active && <button onClick={()=>closeCollection(viewingCollection.id)} style={{padding:'6px 14px',background:'#fee2e2',color:'#991b1b',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>Close Collection</button>}
                </div>

                {/* Search orders */}
                {collectionOrders.length > 3 && (
                  <div style={{marginBottom:'10px',display:'flex',alignItems:'center',background:'#f4f6f8',borderRadius:'8px',padding:'8px 10px'}}>
                    <input type="text" placeholder="Search by name, phone, ref code..." value={orderSearchQ} onChange={e=>setOrderSearchQ(e.target.value)} style={{flex:1,border:'none',background:'none',outline:'none',fontSize:'13px'}}/>
                    <span style={{fontSize:'14px'}}>🔍</span>
                  </div>
                )}
                
                {collectionOrders.length === 0 ? (
                  <div style={{textAlign:'center',padding:'32px',background:'#fff',borderRadius:'12px',color:'#8a9bb0'}}>No orders yet. Share this collection with your class!</div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                    {collectionOrders.filter(order => {
                      if (!orderSearchQ.trim()) return true;
                      const q = orderSearchQ.toLowerCase();
                      return order.studentName?.toLowerCase().includes(q) || order.phone?.includes(q) || order.paymentRef?.toLowerCase().includes(q) || order.payerName?.toLowerCase().includes(q);
                    }).map(order => {
                      const statusColor = order.paid ? '#10b981' : (order.amountPaid > 0 ? '#f59e0b' : '#ef4444');
                      const statusBg = order.paid ? '#d1fae5' : (order.amountPaid > 0 ? '#fef3c7' : '#fff');
                      const statusText = order.paid ? 'PAID' : (order.amountPaid > 0 ? `${order.amountPaid.toLocaleString()}/${order.amount.toLocaleString()}` : 'UNPAID');
                      return (
                      <div key={order.id} style={{background:'#fff',borderRadius:'10px',padding:'12px',border:'1px solid #e2e6ea'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                          {/* Paid toggle */}
                          <button onClick={()=>toggleOrderPaid(viewingCollection.id,order.id,order.paid,order.amount)} style={{width:'36px',height:'36px',borderRadius:'50%',border:`2px solid ${statusColor}`,background:statusBg,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'16px',flexShrink:0}}>
                            {order.paid ? '✓' : order.amountPaid > 0 ? '◐' : ''}
                          </button>
                          
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:'14px',fontWeight:'600',color:statusColor}}>{order.studentName}</div>
                            <div style={{fontSize:'12px',color:'#8a9bb0',lineHeight:1.6}}>
                              {order.selectedOption && <span style={{background:'#fef3c7',color:'#92400e',padding:'1px 6px',borderRadius:'4px',marginRight:'4px',fontSize:'11px'}}>{order.selectedOption}</span>}
                              {order.payerName && <span style={{background:'#eff6ff',color:'#1e40af',padding:'1px 6px',borderRadius:'4px',marginRight:'4px',fontSize:'11px'}}>{order.payerName}</span>}
                              {order.phone && <span>{order.phone} • </span>}
                              {order.paymentRef ? <span style={{fontFamily:'monospace',background:'#f0fdf4',color:'#166534',padding:'1px 6px',borderRadius:'4px',fontSize:'11px'}}>{order.paymentRef}</span> : <span style={{color:'#ef4444',fontSize:'11px'}}>No ref</span>}
                            </div>
                          </div>
                          
                          <div style={{fontSize:'11px',fontWeight:'600',color:statusColor,flexShrink:0,textAlign:'right'}}>
                            {statusText}
                          </div>
                        </div>
                        {/* Partial payment bar */}
                        {order.amountPaid > 0 && !order.paid && (
                          <div style={{marginTop:'8px',marginLeft:'48px'}}>
                            <div style={{height:'4px',background:'#f4f6f8',borderRadius:'2px',overflow:'hidden'}}>
                              <div style={{height:'100%',width:`${Math.min(100,Math.round((order.amountPaid/order.amount)*100))}%`,background:'#f59e0b',borderRadius:'2px'}}/>
                            </div>
                            <div style={{fontSize:'10px',color:'#8a9bb0',marginTop:'2px'}}>{Math.round((order.amountPaid/order.amount)*100)}% paid — {(order.amount-order.amountPaid).toLocaleString()} TSh remaining</div>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}

                {/* Summary for sharing */}
                  <button onClick={()=>{
                    if (collectionOrders.length === 0) {
                      // No orders yet — share collection link
                      let msg = `📋 *${viewingCollection.title}*\n\n`;
                      msg += `💰 ${viewingCollection.price.toLocaleString()} TSh per person\n`;
                      if (viewingCollection.deadline) msg += `⏰ Deadline: ${viewingCollection.deadline}\n`;
                      if (viewingCollection.payNumber) msg += `\n📱 Pay to: ${viewingCollection.payNumber}${viewingCollection.payName ? ' ('+viewingCollection.payName+')' : ''}\n`;
                      msg += `\nOrder here: https://kampasika.netlify.app/collection/${viewingCollection.id}`;
                      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank');
                    } else {
                      const unpaid = collectionOrders.filter(o=>!o.paid);
                      const paid = collectionOrders.filter(o=>o.paid);
                      let msg = `📋 *${viewingCollection.title}* — Status Update\n\n`;
                      msg += `✅ Paid: ${paid.length}${viewingCollection.expectedPeople ? '/'+viewingCollection.expectedPeople : ''}\n❌ Unpaid: ${unpaid.length}\n💰 Collected: ${(paid.length * viewingCollection.price).toLocaleString()} TSh${viewingCollection.expectedPeople ? ' / '+(viewingCollection.expectedPeople * viewingCollection.price).toLocaleString()+' TSh expected' : ''}\n\n`;
                      if (unpaid.length > 0) {
                        msg += `⚠️ *Not yet paid:*\n`;
                        unpaid.forEach(o => { msg += `- ${o.studentName}${o.selectedOption ? ' ('+o.selectedOption+')' : ''}\n`; });
                        msg += `\nPlease send ${viewingCollection.price.toLocaleString()} TSh to ${viewingCollection.payNumber || 'the rep'}`;
                      } else {
                        msg += `🎉 Everyone has paid!`;
                      }
                      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank');
                    }
                  }} style={{width:'100%',padding:'12px',background:'#25D366',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer',marginTop:'12px',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
                    📲 {collectionOrders.length === 0 ? 'Share Collection on WhatsApp' : 'Share Payment Status on WhatsApp'}
                  </button>
              </div>
            )}

            {/* Check own order status — for students */}
            {user && user.uid !== viewingCollection.userId && collectionOrders.length > 0 && (
              <div style={{marginBottom:'16px'}}>
                {collectionOrders.filter(o=>o.userId===user.uid).map(order=>(
                  <div key={order.id} style={{background:order.paid?'#d1fae5':'#fef3c7',borderRadius:'12px',padding:'14px',border:order.paid?'1px solid #6ee7b7':'1px solid #fde68a'}}>
                    <div style={{fontSize:'14px',fontWeight:'600',color:order.paid?'#065f46':'#92400e'}}>
                      {order.paid ? '✅ Your payment has been confirmed!' : '⏳ Your order is placed — waiting for payment confirmation'}
                    </div>
                    {order.selectedOption && <div style={{fontSize:'12px',color:'#6b7280',marginTop:'4px'}}>Option: {order.selectedOption}</div>}
                    {order.paymentRef && <div style={{fontSize:'12px',color:'#6b7280',marginTop:'2px'}}>Ref: {order.paymentRef}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ ROOMS & HOUSING ============ */}
      {ENABLE_ROOMS && page==="rooms"&&(
        <div style={{width:'100%',flex:1,overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',boxSizing:'border-box',paddingBottom:'100px'}}>
          
          <div style={{background:'linear-gradient(135deg,#0ea5e9 0%,#38bdf8 100%)',borderRadius:'18px',padding:'20px 18px',margin:'0 16px 16px 16px',width:'calc(100% - 32px)',boxSizing:'border-box'}}>
            <h2 style={{fontFamily:'serif',fontSize:'22px',fontWeight:'700',color:'#fff',marginBottom:'6px'}}>🏠 Find a Room</h2>
            <p style={{color:'rgba(255,255,255,0.8)',fontSize:'13px',marginBottom:'14px',lineHeight:1.5}}>Browse rooms near campus — listed directly by landlords. No dalali fees.</p>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>setPage("createRoom")} style={{padding:'10px 16px',background:'#fff',color:'#0ea5e9',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>+ List a Room</button>
              <button onClick={()=>setPage("roommates")} style={{padding:'10px 16px',background:'rgba(255,255,255,0.2)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>🤝 Find Roommate</button>
            </div>
          </div>

          {/* Search & Filters */}
          <div style={{margin:'0 16px 10px 16px',display:'flex',alignItems:'center',background:'#fff',borderRadius:'10px',padding:'8px 12px',border:'1.5px solid #e2e6ea'}}>
            <input type="text" placeholder="Search by location, area..." value={roomSearchQ} onChange={e=>setRoomSearchQ(e.target.value)} style={{flex:1,border:'none',background:'none',outline:'none',fontSize:'14px'}}/>
            <span style={{fontSize:'14px'}}>🔍</span>
          </div>
          <div style={{display:'flex',gap:'6px',overflowX:'auto',margin:'0 16px 10px 16px'}}>
            {ROOM_TYPES.map(t=>(
              <button key={t.id} onClick={()=>setRoomFilterType(t.id)} style={{padding:'6px 14px',background:roomFilterType===t.id?'#0ea5e9':'#fff',color:roomFilterType===t.id?'#fff':'#0f1b2d',border:roomFilterType===t.id?'none':'1.5px solid #e2e6ea',borderRadius:'20px',fontSize:'12px',fontWeight:'500',cursor:'pointer',whiteSpace:'nowrap'}}>{t.icon} {t.name}</button>
            ))}
          </div>
          {roomFilterMaxPrice === "" && <button onClick={()=>setRoomFilterMaxPrice("150000")} style={{margin:'0 16px 12px 16px',padding:'6px 14px',background:'#f4f6f8',border:'none',borderRadius:'8px',fontSize:'12px',color:'#6b7280',cursor:'pointer'}}>💰 Set max price filter</button>}
          {roomFilterMaxPrice !== "" && (
            <div style={{margin:'0 16px 12px 16px',display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{fontSize:'12px',color:'#6b7280'}}>Max:</span>
              <input type="number" value={roomFilterMaxPrice} onChange={e=>setRoomFilterMaxPrice(e.target.value)} placeholder="Max price" style={{width:'120px',padding:'6px 10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'13px',outline:'none'}}/>
              <span style={{fontSize:'12px',color:'#6b7280'}}>TSh</span>
              <button onClick={()=>setRoomFilterMaxPrice("")} style={{fontSize:'12px',color:'#ef4444',background:'none',border:'none',cursor:'pointer'}}>✕ Clear</button>
            </div>
          )}

          {/* Room Cards */}
          {(() => {
            const filtered = rooms.filter(r => {
              if (roomFilterType !== "all" && r.roomType !== roomFilterType) return false;
              if (roomFilterMaxPrice && r.price > parseInt(roomFilterMaxPrice)) return false;
              if (roomSearchQ.trim()) {
                const q = roomSearchQ.toLowerCase();
                return r.location?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q) || r.landlordName?.toLowerCase().includes(q);
              }
              return true;
            });
            return filtered.length === 0 ? (
              <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px',margin:'0 16px'}}>
                <div style={{fontSize:'40px',marginBottom:'16px'}}>🏠</div>
                <div style={{fontSize:'16px',fontWeight:'600'}}>No rooms listed yet</div>
                <div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Know a landlord? Help them list their room!</div>
                <button onClick={()=>setPage("createRoom")} style={{marginTop:'16px',padding:'10px 20px',background:'#0ea5e9',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ List a Room</button>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:'10px',margin:'0 16px'}}>
                {filtered.map(room => (
                  <div key={room.id} onClick={()=>setViewingRoom(room)} style={{background:'#fff',borderRadius:'14px',overflow:'hidden',cursor:'pointer',border:'1px solid #e2e6ea'}}>
                    {room.photoUrl ? (
                      <img src={room.photoUrl} alt="" loading="lazy" style={{width:'100%',height:'180px',objectFit:'cover'}}/>
                    ) : (
                      <div style={{width:'100%',height:'120px',background:'linear-gradient(135deg,#0ea5e9,#38bdf8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'48px'}}>🏠</div>
                    )}
                    <div style={{padding:'12px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'start',marginBottom:'6px'}}>
                        <div>
                          <span style={{fontSize:'11px',background:'#e0f2fe',color:'#0369a1',padding:'2px 8px',borderRadius:'8px',fontWeight:'500'}}>{ROOM_TYPES.find(t=>t.id===room.roomType)?.name || room.roomType}</span>
                          <div style={{fontSize:'15px',fontWeight:'600',marginTop:'6px'}}>📍 {room.location}</div>
                        </div>
                        <div style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700',color:'#0ea5e9'}}>{room.price?.toLocaleString()}<span style={{fontSize:'11px',fontWeight:'400',color:'#8a9bb0'}}>/mo</span></div>
                      </div>
                      <div style={{fontSize:'12px',color:'#6b7280'}}>{room.landlordName} • {room.nearUni}</div>
                      {room.amenities && room.amenities.length > 0 && (
                        <div style={{display:'flex',gap:'4px',marginTop:'6px',flexWrap:'wrap'}}>
                          {room.amenities.slice(0,4).map(a=>{const am=ROOM_AMENITIES.find(x=>x.id===a);return am?<span key={a} style={{fontSize:'10px',background:'#f4f6f8',padding:'2px 6px',borderRadius:'6px'}}>{am.icon} {am.label}</span>:null;})}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ============ CREATE ROOM LISTING ============ */}
      {ENABLE_ROOMS && page==="createRoom"&&(
        <div style={{width:'100%',flex:1,overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',boxSizing:'border-box',paddingBottom:'100px'}}>
          <div style={{background:'#fff',borderRadius:'12px',padding:'20px',margin:'0 16px'}}>
            <h2 style={{fontSize:'20px',fontWeight:'700',marginBottom:'4px'}}>{showCreateRoomSuccess?"Room Listed!":"List a Room"}</h2>
            {!showCreateRoomSuccess && <p style={{fontSize:'13px',color:'#8a9bb0',marginBottom:'16px'}}>No account needed — just fill in the details and students will contact you directly.</p>}
            {showCreateRoomSuccess ? (
              <div style={{textAlign:'center',padding:'32px 16px'}}>
                <div style={{fontSize:'56px',marginBottom:'16px'}}>🏠</div>
                <div style={{fontSize:'20px',fontWeight:'700',marginBottom:'4px'}}>Room listed!</div>
                <div style={{fontSize:'13px',color:'#8a9bb0',marginBottom:'28px'}}>Students can now find and contact you</div>
                <button onClick={()=>{setShowCreateRoomSuccess(false);setPage("rooms");}} style={{width:'100%',padding:'14px',background:'#0ea5e9',color:'#fff',border:'none',borderRadius:'12px',fontSize:'16px',fontWeight:'600',cursor:'pointer',marginBottom:'12px'}}>View All Rooms</button>
                <button onClick={()=>{setShowCreateRoomSuccess(false);setPage("home");}} style={{width:'100%',padding:'14px',background:'#f4f6f8',color:'#0f1b2d',border:'none',borderRadius:'12px',fontSize:'16px',fontWeight:'600',cursor:'pointer'}}>← Home</button>
              </div>
            ) : (
              <>
                {/* Photos */}
                <input type="file" id="room-photo" accept="image/*" multiple style={{display:'none'}} onChange={handleRoomPhotoSelect}/>
                <label htmlFor="room-photo" style={{display:'block',marginBottom:'12px',cursor:'pointer'}}>
                  {createRoomData.photoPreviews.length > 0 ? (
                    <div><img src={createRoomData.photoPreviews[0]} alt="" style={{width:'100%',height:'200px',objectFit:'cover',borderRadius:'12px',marginBottom:'6px'}}/>
                      <div style={{display:'flex',gap:'6px',overflowX:'auto'}}>{createRoomData.photoPreviews.slice(1).map((p,i)=><img key={i} src={p} alt="" style={{width:'56px',height:'56px',objectFit:'cover',borderRadius:'8px',flexShrink:0}}/>)}{createRoomData.photoPreviews.length<5&&<div style={{width:'56px',height:'56px',border:'2px dashed #0ea5e9',borderRadius:'8px',display:'flex',alignItems:'center',justifyContent:'center',background:'#f0f9ff',flexShrink:0}}><span style={{fontSize:'18px',color:'#0ea5e9'}}>+</span></div>}</div>
                    </div>
                  ) : (
                    <div style={{border:'2px dashed #e2e6ea',borderRadius:'12px',padding:'28px',textAlign:'center',background:'#f9fafb'}}>
                      <div style={{fontSize:'40px',marginBottom:'8px'}}>📸</div>
                      <div style={{fontSize:'14px',fontWeight:'600'}}>Add Room Photos</div>
                      <div style={{fontSize:'12px',color:'#8a9bb0'}}>Up to 5 photos — show the room, bathroom, entrance</div>
                    </div>
                  )}
                </label>

                {/* Video */}
                <input type="file" id="room-video" accept="video/*" style={{display:'none'}} onChange={handleRoomVideoSelect}/>
                <label htmlFor="room-video" style={{display:'block',marginBottom:'16px',cursor:'pointer'}}>
                  {createRoomData.videoPreview ? (
                    <div style={{position:'relative'}}><video src={createRoomData.videoPreview} style={{width:'100%',height:'120px',objectFit:'cover',borderRadius:'10px'}} controls/><div style={{position:'absolute',top:'6px',right:'6px',background:'rgba(0,0,0,0.6)',color:'#fff',padding:'2px 8px',borderRadius:'6px',fontSize:'11px'}}>🎥 Video added</div></div>
                  ) : (
                    <div style={{border:'1.5px dashed #0ea5e9',borderRadius:'10px',padding:'12px',textAlign:'center',background:'#f0f9ff'}}>
                      <span style={{fontSize:'13px',color:'#0ea5e9',fontWeight:'600'}}>🎥 Add a Video Tour (optional, max 50MB)</span>
                    </div>
                  )}
                </label>

                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Landlord / Contact Name *</label><input type="text" placeholder="e.g. Bwana Juma" value={createRoomData.landlordName} onChange={e=>setCreateRoomData({...createRoomData,landlordName:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>

                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>📱 Phone / WhatsApp *</label><input type="tel" placeholder="e.g. 0712345678" value={createRoomData.landlordPhone} onChange={e=>setCreateRoomData({...createRoomData,landlordPhone:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>

                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'8px'}}>Room Type *</label>
                  <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                    {ROOM_TYPES.filter(t=>t.id!=="all").map(t=>(
                      <button key={t.id} onClick={()=>setCreateRoomData({...createRoomData,roomType:t.id})} style={{padding:'10px 16px',borderRadius:'10px',border:createRoomData.roomType===t.id?'2px solid #0ea5e9':'1.5px solid #e2e6ea',background:createRoomData.roomType===t.id?'#e0f2fe':'#fff',fontSize:'13px',fontWeight:'500',cursor:'pointer'}}>{t.icon} {t.name}{t.sw?' ('+t.sw+')':''}</button>
                    ))}
                  </div>
                </div>

                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Monthly Rent (TSh) *</label><input type="number" placeholder="e.g. 80000" value={createRoomData.price} onChange={e=>setCreateRoomData({...createRoomData,price:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>

                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>📍 Location / Area *</label><input type="text" placeholder="e.g. Sinza C, near Ardhi gate" value={createRoomData.location} onChange={e=>setCreateRoomData({...createRoomData,location:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>

                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Nearest University</label><select value={createRoomData.nearUni} onChange={e=>setCreateRoomData({...createRoomData,nearUni:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none'}}>{UNIVERSITIES.map(u=><option key={u.id} value={u.short}>{u.name} ({u.short})</option>)}</select></div>

                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'8px'}}>Amenities</label>
                  <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                    {ROOM_AMENITIES.map(a=>{const sel=(createRoomData.amenities||[]).includes(a.id);return(
                      <button key={a.id} onClick={()=>{const cur=createRoomData.amenities||[];setCreateRoomData({...createRoomData,amenities:sel?cur.filter(x=>x!==a.id):[...cur,a.id]});}} style={{padding:'6px 12px',borderRadius:'8px',border:sel?'2px solid #0ea5e9':'1.5px solid #e2e6ea',background:sel?'#e0f2fe':'#fff',fontSize:'12px',cursor:'pointer'}}>{a.icon} {a.label}</button>
                    );})}
                  </div>
                </div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Description (optional)</label><textarea placeholder="Any extra details — available date, rules, what's nearby..." value={createRoomData.desc} onChange={e=>setCreateRoomData({...createRoomData,desc:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',minHeight:'80px',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}/></div>

                <button onClick={handleCreateRoom} disabled={uploading} style={{width:'100%',padding:'14px',background:'#0ea5e9',color:'#fff',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:uploading?'not-allowed':'pointer'}}>{uploading?"Uploading...":"🏠 List Room"}</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ============ ROOM DETAIL ============ */}
      {ENABLE_ROOMS && viewingRoom && (
        <div style={{position:'fixed',inset:0,background:'#f4f6f8',zIndex:300,overflowY:'auto'}}>
          <div style={{background:'#fff',padding:'12px 16px',display:'flex',alignItems:'center',gap:'10px',borderBottom:'1px solid #e2e6ea',position:'sticky',top:0,zIndex:50}}>
            <button onClick={()=>setViewingRoom(null)} style={{width:'36px',height:'36px',borderRadius:'50%',background:'#f4f6f8',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'18px',border:'none'}}>←</button>
            <div style={{fontFamily:'serif',fontSize:'20px',fontWeight:'700',color:'#0f1b2d'}}>Room Details</div>
          </div>

          {viewingRoom.photos && viewingRoom.photos.length > 0 ? (
            <div>
              <img src={viewingRoom.photos[0]} alt="" onClick={()=>{setFullScreenImage(viewingRoom.photos[0]);setFullScreenPhotos(viewingRoom.photos);setFullScreenIndex(0);}} style={{width:'100%',height:'280px',objectFit:'cover',cursor:'pointer'}}/>
              {viewingRoom.photos.length > 1 && (
                <div style={{display:'flex',gap:'6px',padding:'8px 16px',overflowX:'auto'}}>
                  {viewingRoom.photos.map((p,i)=><img key={i} src={p} alt="" onClick={()=>{setFullScreenImage(p);setFullScreenPhotos(viewingRoom.photos);setFullScreenIndex(i);}} style={{width:'56px',height:'56px',objectFit:'cover',borderRadius:'8px',cursor:'pointer',flexShrink:0}}/>)}
                </div>
              )}
            </div>
          ) : (
            <div style={{width:'100%',height:'180px',background:'linear-gradient(135deg,#0ea5e9,#38bdf8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'64px'}}>🏠</div>
          )}

          {viewingRoom.videoUrl && (
            <div style={{padding:'0 16px',marginTop:'8px'}}><video src={viewingRoom.videoUrl} controls style={{width:'100%',borderRadius:'12px',maxHeight:'250px'}}/></div>
          )}

          <div style={{padding:'20px'}}>
            <span style={{fontSize:'12px',background:'#e0f2fe',color:'#0369a1',padding:'4px 12px',borderRadius:'20px',fontWeight:'500'}}>{ROOM_TYPES.find(t=>t.id===viewingRoom.roomType)?.icon} {ROOM_TYPES.find(t=>t.id===viewingRoom.roomType)?.name}</span>
            
            <div style={{fontFamily:'serif',fontSize:'32px',fontWeight:'700',color:'#0ea5e9',margin:'12px 0 4px'}}>{viewingRoom.price?.toLocaleString()} <span style={{fontSize:'16px',color:'#8a9bb0',fontFamily:'system-ui'}}>TSh/month</span></div>
            
            <div style={{fontSize:'16px',fontWeight:'600',marginBottom:'4px'}}>📍 {viewingRoom.location}</div>
            <div style={{fontSize:'13px',color:'#6b7280',marginBottom:'16px'}}>Near {viewingRoom.nearUni}</div>

            {viewingRoom.amenities && viewingRoom.amenities.length > 0 && (
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'16px'}}>
                {viewingRoom.amenities.map(a=>{const am=ROOM_AMENITIES.find(x=>x.id===a);return am?<span key={a} style={{fontSize:'12px',background:'#f4f6f8',padding:'6px 12px',borderRadius:'8px'}}>{am.icon} {am.label}</span>:null;})}
              </div>
            )}

            {viewingRoom.description && (
              <div style={{background:'#fff',padding:'16px',borderRadius:'12px',marginBottom:'16px'}}>
                <h4 style={{fontSize:'14px',fontWeight:'600',marginBottom:'8px',color:'#6b7280'}}>Details</h4>
                <p style={{fontSize:'15px',lineHeight:1.7,color:'#4a5568',whiteSpace:'pre-wrap'}}>{viewingRoom.description}</p>
              </div>
            )}

            <div style={{background:'#fff',padding:'16px',borderRadius:'12px',marginBottom:'16px'}}>
              <h4 style={{fontSize:'14px',fontWeight:'600',marginBottom:'12px',color:'#6b7280'}}>Contact Landlord</h4>
              <div style={{fontSize:'16px',fontWeight:'600',color:'#0f1b2d',marginBottom:'4px'}}>{viewingRoom.landlordName}</div>
              <div style={{fontSize:'14px',color:'#6b7280'}}>{viewingRoom.landlordPhone}</div>
            </div>
          </div>

          <div style={{position:'sticky',bottom:0,background:'#fff',borderTop:'1px solid #e2e6ea',padding:'16px',display:'flex',gap:'8px'}}>
            <button onClick={()=>{const num=viewingRoom.landlordPhone.replace(/^0/,'255').replace(/[^0-9]/g,'');const msg=`Habari! Nimeona chumba chako kupitia Kampasika — ${ROOM_TYPES.find(t=>t.id===viewingRoom.roomType)?.name} pale ${viewingRoom.location}, ${viewingRoom.price?.toLocaleString()} TSh/month. Je bado kinapatikana?`;window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,'_blank');}} style={{flex:1,padding:'16px',background:'#25D366',color:'#fff',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:'600',cursor:'pointer'}}>📱 WhatsApp</button>
            <button onClick={()=>{window.open(`tel:${viewingRoom.landlordPhone}`);}} style={{flex:1,padding:'16px',background:'#0ea5e9',color:'#fff',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:'600',cursor:'pointer'}}>📞 Call</button>
          </div>
        </div>
      )}

      {/* ============ ROOMMATE FINDER ============ */}
      {ENABLE_ROOMS && page==="roommates"&&(
        <div style={{width:'100%',flex:1,overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',boxSizing:'border-box',paddingBottom:'100px'}}>
          <div style={{padding:'16px'}}>
            <h2 style={{fontSize:'20px',fontWeight:'700',marginBottom:'16px'}}>🤝 Looking for Roommate</h2>
            
            {/* Post form */}
            {user && (
              <div style={{background:'#fff',borderRadius:'12px',padding:'16px',border:'1.5px solid #e2e6ea',marginBottom:'16px'}}>
                <h3 style={{fontSize:'15px',fontWeight:'600',marginBottom:'12px'}}>Post that you're looking</h3>
                <div style={{display:'flex',gap:'8px',marginBottom:'10px'}}>
                  <div style={{flex:1}}><input type="number" placeholder="Budget (TSh/mo)" value={createRoommateData.budget} onChange={e=>setCreateRoommateData({...createRoommateData,budget:e.target.value})} style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'14px',outline:'none',boxSizing:'border-box'}}/></div>
                  <div style={{flex:1}}><input type="text" placeholder="Area e.g. Sinza" value={createRoommateData.preferredArea} onChange={e=>setCreateRoommateData({...createRoommateData,preferredArea:e.target.value})} style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'14px',outline:'none',boxSizing:'border-box'}}/></div>
                </div>
                <div style={{display:'flex',gap:'8px',marginBottom:'10px'}}>
                  <select value={createRoommateData.gender} onChange={e=>setCreateRoommateData({...createRoommateData,gender:e.target.value})} style={{flex:1,padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'14px',outline:'none'}}><option value="">Gender pref...</option><option value="male">Male</option><option value="female">Female</option><option value="any">Any</option></select>
                  <input type="date" placeholder="Move date" value={createRoommateData.moveDate} onChange={e=>setCreateRoommateData({...createRoommateData,moveDate:e.target.value})} style={{flex:1,padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'14px',outline:'none'}}/>
                </div>
                <textarea placeholder="Anything else — habits, preferences, course..." value={createRoommateData.desc} onChange={e=>setCreateRoommateData({...createRoommateData,desc:e.target.value})} style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'14px',outline:'none',minHeight:'60px',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box',marginBottom:'10px'}}/>
                <button onClick={handleCreateRoommatePost} disabled={uploading} style={{width:'100%',padding:'12px',background:'#0ea5e9',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:uploading?'not-allowed':'pointer'}}>{uploading?"Posting...":"Post"}</button>
              </div>
            )}

            {/* Roommate posts */}
            {roommatePosts.length === 0 ? (
              <div style={{textAlign:'center',padding:'32px',background:'#fff',borderRadius:'12px',color:'#8a9bb0'}}>No roommate posts yet</div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                {roommatePosts.map(post=>(
                  <div key={post.id} style={{background:'#fff',borderRadius:'12px',padding:'16px',border:'1px solid #e2e6ea'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'8px'}}>
                      <div style={{width:'36px',height:'36px',borderRadius:'50%',backgroundImage:post.userAvatar?`url(${post.userAvatar})`:'none',backgroundColor:!post.userAvatar?'#0ea5e9':'transparent',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',fontWeight:'700',color:'#fff'}}>{!post.userAvatar&&(post.userName||"?").split(" ").map(n=>n[0]).join("")}</div>
                      <div><div style={{fontSize:'14px',fontWeight:'600'}}>{post.userName}</div><div style={{fontSize:'11px',color:'#8a9bb0'}}>{post.universityName}</div></div>
                    </div>
                    <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'8px'}}>
                      <span style={{fontSize:'12px',background:'#e0f2fe',color:'#0369a1',padding:'3px 10px',borderRadius:'8px',fontWeight:'500'}}>Budget: {post.budget?.toLocaleString()} TSh</span>
                      <span style={{fontSize:'12px',background:'#f4f6f8',padding:'3px 10px',borderRadius:'8px'}}>📍 {post.preferredArea}</span>
                      {post.gender && <span style={{fontSize:'12px',background:'#f4f6f8',padding:'3px 10px',borderRadius:'8px'}}>{post.gender === 'male' ? '👨' : post.gender === 'female' ? '👩' : '👤'} {post.gender}</span>}
                      {post.moveDate && <span style={{fontSize:'12px',background:'#fef3c7',color:'#92400e',padding:'3px 10px',borderRadius:'8px'}}>📅 {new Date(post.moveDate).toLocaleDateString('en',{month:'short',day:'numeric'})}</span>}
                    </div>
                    {post.description && <p style={{fontSize:'13px',color:'#4a5568',lineHeight:1.5}}>{post.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ PUBLIC SELLER PROFILE ============ */}
      {page==="seller"&&publicSeller&&(
        <div style={{width:'100%',flex:1,overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',boxSizing:'border-box',paddingBottom:'100px'}}>
          
          {publicSellerLoading ? (
            <div style={{textAlign:'center',padding:'60px',color:'#8a9bb0'}}>Loading seller profile...</div>
          ) : (
          <>
          {/* Seller Hero */}
          <div style={{background:'linear-gradient(135deg,#0f1b2d 0%,#1a3350 100%)',padding:'28px 20px',textAlign:'center'}}>
            <div style={{width:'80px',height:'80px',borderRadius:'50%',margin:'0 auto 12px',backgroundImage:publicSeller.avatarUrl?`url(${publicSeller.avatarUrl})`:'none',backgroundColor:!publicSeller.avatarUrl?'#2dd4bf':'transparent',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'28px',fontWeight:'700',color:'#0f1b2d',border:'3px solid rgba(255,255,255,0.2)'}}>
              {!publicSeller.avatarUrl&&publicSeller.name.split(" ").map(n=>n[0]).join("")}
            </div>
            <h1 style={{fontFamily:'serif',fontSize:'24px',fontWeight:'700',color:'#fff',marginBottom:'4px'}}>{publicSeller.name}</h1>
            {publicSeller.universityName && <div style={{fontSize:'13px',color:'#2dd4bf',marginBottom:'8px'}}>{publicSeller.universityName} Student</div>}
            
            {/* Bio — HIDDEN FOR NOW, uncomment to re-enable */}
            {/* {publicSeller.bio && <div style={{fontSize:'13px',color:'rgba(255,255,255,0.75)',marginBottom:'12px',lineHeight:'1.5',maxWidth:'320px',margin:'0 auto 12px'}}>{publicSeller.bio}</div>} */}
            
            {/* Service Tags */}
            {publicSeller.services && publicSeller.services.length > 0 && (
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap',justifyContent:'center',marginBottom:'16px'}}>
                {publicSeller.services.map(sId => {
                  const tag = SERVICE_TAGS.find(t=>t.id===sId);
                  return tag ? <span key={sId} style={{fontSize:'12px',background:'rgba(255,255,255,0.15)',padding:'4px 12px',borderRadius:'20px',color:'#fff',fontWeight:'500',display:'flex',alignItems:'center',gap:'4px'}}>{tag.icon} {tag.label}</span> : null;
                })}
              </div>
            )}
            
            {/* Stats row */}
            <div style={{display:'flex',justifyContent:'center',gap:'24px',marginBottom:'16px'}}>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:'20px',fontWeight:'700',color:'#fff'}}>{publicSellerListings.length}</div>
                <div style={{fontSize:'11px',color:'rgba(255,255,255,0.6)'}}>Active</div>
              </div>
              {publicSellerStats && (
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:'20px',fontWeight:'700',color:'#2dd4bf'}}>{publicSellerStats.sold}</div>
                  <div style={{fontSize:'11px',color:'rgba(255,255,255,0.6)'}}>Sold</div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{display:'flex',gap:'8px',justifyContent:'center',flexWrap:'wrap'}}>
              <button onClick={()=>{
                if (!publicSellerListings.length) return;
                requireAuth("message", () => startConversation(publicSellerListings[0]));
              }} style={{padding:'10px 20px',background:'#2dd4bf',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}}>
                💬 Message Seller
              </button>
              <button onClick={()=>{
                const slug = generateSellerSlug(publicSeller.name, publicSeller.universityName);
                const profileUrl = `https://kampasika.netlify.app/seller/${slug}`;
                const msg = `Check out ${publicSeller.name}'s listings on Kampasika (${publicSeller.universityName || 'student'} seller)!\n\n${profileUrl}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
              }} style={{padding:'10px 20px',background:'#25D366',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}}>
                📲 Share Profile
              </button>
              <button onClick={()=>{
                const slug = generateSellerSlug(publicSeller.name, publicSeller.universityName);
                const profileUrl = `https://kampasika.netlify.app/seller/${slug}`;
                navigator.clipboard?.writeText(profileUrl).then(()=>{setSuccess("Link copied!"); setTimeout(()=>setSuccess(""),2000);}).catch(()=>{});
              }} style={{padding:'10px 20px',background:'rgba(255,255,255,0.15)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>
                🔗 Copy Link
              </button>
            </div>
          </div>

          {/* Seller's Listings */}
          <div style={{padding:'16px'}}>
            <h3 style={{fontSize:'16px',fontWeight:'700',marginBottom:'12px'}}>
              {publicSellerListings.length > 0 ? `${publicSeller.name}'s Listings` : 'No Active Listings'}
            </h3>
            
            {publicSellerListings.length === 0 ? (
              <div style={{textAlign:'center',padding:'40px 16px',background:'#fff',borderRadius:'12px'}}>
                <div style={{fontSize:'40px',marginBottom:'12px'}}>📭</div>
                <div style={{fontSize:'14px',color:'#8a9bb0'}}>This seller has no active listings right now</div>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column'}}>
                {publicSellerListings.map((item, idx) => (
                  <div key={item.id} style={{background:'#fff',borderBottom:idx===publicSellerListings.length-1?'none':'1px solid #e2e6ea',padding:'16px',borderRadius:idx===0?'12px 12px 0 0':idx===publicSellerListings.length-1?'0 0 12px 12px':'0'}}>
                    {(item.photos && item.photos.length > 0) ? (
                      <img src={item.photos[0]} alt={item.title} onClick={()=>{setFullScreenImage(item.photos[0]);setFullScreenPhotos(item.photos);setFullScreenIndex(0);}} style={{width:'100%',height:'220px',objectFit:'cover',borderRadius:'10px',marginBottom:'10px',cursor:'pointer'}} />
                    ) : item.photoUrl ? (
                      <img src={item.photoUrl} alt={item.title} onClick={()=>setFullScreenImage(item.photoUrl)} style={{width:'100%',height:'220px',objectFit:'cover',borderRadius:'10px',marginBottom:'10px',cursor:'pointer'}} />
                    ) : null}
                    <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'4px'}}>{item.title}</div>
                    {item.description && <div style={{fontSize:'13px',color:'#4a5568',marginBottom:'8px',lineHeight:1.5}}>{item.description.substring(0,120)}{item.description.length>120?'...':''}</div>}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:'10px',borderTop:'1px solid #e2e6ea'}}>
                      <div style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700'}}>{item.price?.toLocaleString()} TSh</div>
                      <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
                        {item.condition && <span style={{fontSize:'11px',color:'#6b7280',background:'#f4f6f8',padding:'2px 8px',borderRadius:'8px'}}>{item.condition}</span>}
                        <button onClick={()=>{requireAuth("message",()=>startConversation(item));}} style={{fontSize:'12px',color:'#2dd4bf',cursor:'pointer',border:'none',background:'none',fontWeight:'600'}}>💬 Message</button>
                        <button onClick={()=>shareOnWhatsApp(item)} style={{fontSize:'12px',color:'#25D366',cursor:'pointer',border:'none',background:'none',fontWeight:'600'}}>📲</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SEO-friendly footer text */}
          <div style={{padding:'16px',textAlign:'center',fontSize:'12px',color:'#8a9bb0',lineHeight:'1.6'}}>
            <p>{publicSeller.name} is a student seller on Kampasika, the campus marketplace. Browse their listings, message them directly, or share their profile with friends.</p>
            <p style={{marginTop:'8px'}}>
              <span style={{fontFamily:'serif',fontWeight:'700',color:'#0f1b2d'}}>Kam<em style={{color:'#2dd4bf'}}>pa</em>sika</span> — Trade, share & find your next deal on campus.
            </p>
          </div>
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
              {/* BIO HIDDEN FOR NOW */}
              {/* {userBio && <div style={{fontSize:'12px',color:'rgba(255,255,255,0.7)',marginTop:'4px',lineHeight:'1.4'}}>{userBio}</div>} */}
              <button onClick={()=>{setEditProfileData({name:userName,bio:userBio,services:userServices,avatarFile:null,avatarPreview:userAvatar});setShowEditProfile(true)}} style={{marginTop:'8px',padding:'6px 12px',background:'#2dd4bf',color:'#0f1b2d',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>Edit Profile</button>
            </div>
          </div>
          
          {/* Service Tags */}
          {userServices.length > 0 && (
            <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'16px'}}>
              {userServices.map(sId => {
                const tag = SERVICE_TAGS.find(t=>t.id===sId);
                return tag ? (
                  <span key={sId} style={{fontSize:'12px',background:'#fff',padding:'4px 12px',borderRadius:'20px',color:'#0f1b2d',fontWeight:'500',display:'flex',alignItems:'center',gap:'4px'}}>{tag.icon} {tag.label}</span>
                ) : null;
              })}
            </div>
          )}
          
          <div style={{display:'flex',gap:'4px',background:'#fff',borderRadius:'10px',padding:'4px',marginBottom:'16px'}}>
            <button onClick={()=>setProfileTab("listings")} style={{flex:1,padding:'8px',border:'none',background:profileTab==="listings"?'#0f1b2d':'none',color:profileTab==="listings"?'#fff':'#8a9bb0',fontSize:'12px',fontWeight:'500',cursor:'pointer',borderRadius:'8px'}}>My Listings</button>
            <button onClick={()=>setProfileTab("myServices")} style={{flex:1,padding:'8px',border:'none',background:profileTab==="myServices"?'#7c3aed':'none',color:profileTab==="myServices"?'#fff':'#8a9bb0',fontSize:'12px',fontWeight:'500',cursor:'pointer',borderRadius:'8px'}}>My Services</button>
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
                        {/* VIEW COUNT HIDDEN FOR NOW */}
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
          
          {profileTab==="myServices"&&(
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              {myServices.length === 0 ? (
                <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px'}}>
                  <div style={{fontSize:'40px'}}>⚡</div>
                  <div style={{fontSize:'16px',fontWeight:'600',marginTop:'12px'}}>No services listed</div>
                  <div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Offer your skills to fellow students</div>
                  <button onClick={()=>setPage("createService")} style={{marginTop:'16px',padding:'10px 20px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Offer a Service</button>
                </div>
              ) : (
                <>
                  {myServices.map((svc,idx)=>(
                    <div key={svc.id} style={{background:'#fff',padding:'16px',borderRadius:'12px',border:'1px solid #e2e6ea'}}>
                      <div style={{display:'flex',gap:'12px',alignItems:'center',marginBottom:'8px'}}>
                        {(svc.photos && svc.photos.length > 0) ? (
                          <img src={svc.photos[0]} alt="" style={{width:'60px',height:'60px',objectFit:'cover',borderRadius:'10px',flexShrink:0}}/>
                        ) : (
                          <div style={{width:'60px',height:'60px',borderRadius:'10px',background:'linear-gradient(135deg,#7c3aed,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'24px',flexShrink:0}}>
                            {SERVICE_CATEGORIES.find(c=>c.id===svc.category)?.icon || '⚡'}
                          </div>
                        )}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'2px'}}>{svc.title}</div>
                          <div style={{fontSize:'13px',color:'#7c3aed',fontWeight:'600'}}>{svc.price?.toLocaleString()} TSh</div>
                          <div style={{fontSize:'11px',color:'#8a9bb0'}}>{SERVICE_CATEGORIES.find(c=>c.id===svc.category)?.name}</div>
                        </div>
                      </div>
                      <button onClick={()=>deleteService(svc.id)} style={{padding:'8px 16px',background:'#ef4444',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>🗑 Remove</button>
                    </div>
                  ))}
                  <button onClick={()=>setPage("createService")} style={{padding:'12px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Add Another Service</button>
                </>
              )}
            </div>
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
            
            <div style={{marginBottom:'12px'}}>
              <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Username</label>
              <input type="text" value={editProfileData.name} onChange={e=>setEditProfileData({...editProfileData,name:e.target.value})} placeholder="Your name" style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}} />
            </div>

            {/* BIO FIELD HIDDEN FOR NOW — uncomment to re-enable */}
            {/*
            <div style={{marginBottom:'12px'}}>
              <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Bio / What you do</label>
              <textarea value={editProfileData.bio || ""} onChange={e=>setEditProfileData({...editProfileData,bio:e.target.value})} placeholder="e.g. I fix phones and sell accessories near campus gate" maxLength={150} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',minHeight:'70px',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}} />
              <div style={{fontSize:'11px',color:'#8a9bb0',textAlign:'right',marginTop:'4px'}}>{(editProfileData.bio||"").length}/150</div>
            </div>
            */}

            <div style={{marginBottom:'16px'}}>
              <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'8px'}}>What do you offer? (pick up to 3)</label>
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                {SERVICE_TAGS.map(tag => {
                  const selected = (editProfileData.services||[]).includes(tag.id);
                  return (
                    <button key={tag.id} onClick={()=>{
                      const current = editProfileData.services || [];
                      if (selected) {
                        setEditProfileData({...editProfileData, services: current.filter(s=>s!==tag.id)});
                      } else if (current.length < 3) {
                        setEditProfileData({...editProfileData, services: [...current, tag.id]});
                      }
                    }} style={{padding:'6px 12px',borderRadius:'20px',border: selected ? '2px solid #2dd4bf' : '1.5px solid #e2e6ea',background: selected ? '#f0fdfa' : '#fff',color: selected ? '#0f1b2d' : '#6b7280',fontSize:'12px',fontWeight:'500',cursor:'pointer',display:'flex',alignItems:'center',gap:'4px',opacity: !selected && (editProfileData.services||[]).length >= 3 ? 0.4 : 1}}>
                      {tag.icon} {tag.label}
                    </button>
                  );
                })}
              </div>
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
          {viewingListing.location && (
            <span style={{
              fontSize:'12px',
              background:'#f0fdfa',
              padding:'6px 12px',
              borderRadius:'20px',
              color:'#0f1b2d',
              display:'flex',
              alignItems:'center',
              gap:'4px',
              fontWeight:'500'
            }}>
              📍 {viewingListing.location}
            </span>
          )}
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
            {/* SELLER STATS HIDDEN FOR NOW — uncomment to re-enable */}
            {/* {sellerStats && (
              <div style={{
                display:'flex',
                gap:'16px',
                fontSize:'16px',
                color:'#6b7280'
              }}>
                <span>📦 {sellerStats.active} active</span>
                <span>✅ {sellerStats.sold} sold</span>
              </div>
            )} */}
            {viewingListing.whatsapp && (
              <div 
                onClick={() => {
                  const num = viewingListing.whatsapp.replace(/^0/, '255').replace(/[^0-9]/g, '');
                  const msg = `Hi! I'm interested in your listing "${viewingListing.title}" on Kampasika for ${viewingListing.price.toLocaleString()} TSh.`;
                  window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
                }}
                style={{
                  marginTop:'12px',
                  padding:'10px 16px',
                  background:'#f0fdf4',
                  borderRadius:'10px',
                  display:'flex',
                  alignItems:'center',
                  gap:'8px',
                  cursor:'pointer'
                }}
              >
                <span style={{fontSize:'18px'}}>📱</span>
                <div>
                  <div style={{fontSize:'13px',fontWeight:'600',color:'#166534'}}>WhatsApp Available</div>
                  <div style={{fontSize:'12px',color:'#6b7280'}}>Tap to chat directly with seller</div>
                </div>
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
            {/* SAVES HIDDEN FOR NOW */}
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
          {viewingListing.whatsapp && (
            <button 
              onClick={() => {
                const num = viewingListing.whatsapp.replace(/^0/, '255').replace(/[^0-9]/g, '');
                const msg = `Hi! I'm interested in your listing "${viewingListing.title}" on Kampasika for ${viewingListing.price.toLocaleString()} TSh.`;
                window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
              }}
              style={{
                flex:2,
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
              📱 WhatsApp
            </button>
          )}
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
    onTouchStart={(e) => {
      const touch = e.touches[0];
      e.currentTarget._touchStartX = touch.clientX;
      e.currentTarget._touchStartY = touch.clientY;
      e.currentTarget._touchStartTime = Date.now();
    }}
    onTouchEnd={(e) => {
      if (!fullScreenPhotos || fullScreenPhotos.length <= 1) return;
      const startX = e.currentTarget._touchStartX;
      const startY = e.currentTarget._touchStartY;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = startX - endX;
      const diffY = Math.abs(startY - endY);
      const elapsed = Date.now() - (e.currentTarget._touchStartTime || 0);
      
      // Only count as swipe if horizontal movement > 50px, more horizontal than vertical, and fast enough
      if (Math.abs(diffX) > 50 && diffX !== 0 && Math.abs(diffX) > diffY && elapsed < 500) {
        e.preventDefault();
        e.stopPropagation();
        if (diffX > 0 && fullScreenIndex < fullScreenPhotos.length - 1) {
          // Swipe left = next
          setFullScreenIndex(fullScreenIndex + 1);
        } else if (diffX < 0 && fullScreenIndex > 0) {
          // Swipe right = previous
          setFullScreenIndex(fullScreenIndex - 1);
        }
      }
    }}
    style={{
      position:'fixed',
      inset:0,
      background:'rgba(0,0,0,0.95)',
      zIndex:9999,
      display:'flex',
      flexDirection:'column',
      alignItems:'center',
      justifyContent:'center',
      touchAction: 'pan-y'
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

    <div style={{
      width:'100%',
      display:'flex',
      alignItems:'center',
      justifyContent:'center',
      overflow:'hidden',
      position:'relative'
    }}>
      <img 
        src={fullScreenPhotos ? fullScreenPhotos[fullScreenIndex] : fullScreenImage} 
        alt="Full view" 
        onClick={(e) => e.stopPropagation()}
        draggable={false}
        style={{
          maxWidth:'95vw',
          maxHeight:'85vh',
          objectFit:'contain',
          borderRadius:'4px',
          cursor:'default',
          userSelect:'none',
          WebkitUserSelect:'none',
          transition:'opacity 0.15s ease'
        }} 
      />
    </div>

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

    {fullScreenPhotos && fullScreenPhotos.length > 1 && (
      <div style={{
        position:'absolute',
        bottom:'44px',
        color:'rgba(255,255,255,0.4)',
        fontSize:'11px'
      }}>
        Swipe or tap arrows to browse
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
                <div style={{marginBottom:'12px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Registration Number</label><input type="text" placeholder="e.g. 33421/T.2022" value={regNumber} onChange={e=>setRegNumber(e.target.value)} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>
                <div style={{marginBottom:'12px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>University *</label><select value={signupUni} onChange={e=>setSignupUni(e.target.value)} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box',background:'#fff',color:signupUni?'#0f1b2d':'#8a9bb0'}}><option value="">Select your university...</option>{UNIVERSITIES.map(u=><option key={u.id} value={u.id}>{u.name} ({u.short})</option>)}</select></div>
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

      {/* PWA Install Banner */}
      {showInstallBanner && !isStandalone && (
        <div style={{
          position:'fixed',
          bottom:'76px',
          left:'12px',
          right:'12px',
          background:'linear-gradient(135deg, #0f1b2d 0%, #1a2d4a 100%)',
          color:'#fff',
          borderRadius:'16px',
          padding:'16px',
          zIndex:1100,
          boxShadow:'0 8px 32px rgba(0,0,0,0.3)',
          animation:'installSlideUp 0.4s ease-out'
        }}>
          <button onClick={dismissInstallBanner} style={{
            position:'absolute', top:'10px', right:'12px', background:'none', border:'none',
            color:'rgba(255,255,255,0.6)', fontSize:'20px', cursor:'pointer', padding:'4px'
          }}>×</button>

          <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'12px'}}>
            <div style={{
              width:'44px', height:'44px', borderRadius:'12px',
              background:'linear-gradient(135deg, #2dd4bf, #14b8a6)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'20px', flexShrink:0
            }}>📲</div>
            <div>
              <div style={{fontWeight:'700', fontSize:'15px', marginBottom:'2px'}}>
                Install Kampasika
              </div>
              <div style={{fontSize:'12px', color:'rgba(255,255,255,0.7)'}}>
                Get the full app experience — faster, offline access & notifications
              </div>
            </div>
          </div>

          {isIos ? (
            <div style={{
              background:'rgba(255,255,255,0.1)', borderRadius:'10px',
              padding:'12px', fontSize:'13px', lineHeight:'1.5'
            }}>
              <span style={{fontWeight:'600'}}>To install on iPhone/iPad:</span><br/>
              1. Tap the <span style={{
                display:'inline-flex', alignItems:'center', justifyContent:'center',
                background:'rgba(255,255,255,0.2)', borderRadius:'4px',
                padding:'1px 6px', fontSize:'16px', verticalAlign:'middle', margin:'0 2px'
              }}>⬆</span> Share button in Safari<br/>
              2. Scroll down and tap <strong>"Add to Home Screen"</strong><br/>
              3. Tap <strong>"Add"</strong> — done!
            </div>
          ) : (
            <button onClick={handleInstallClick} style={{
              width:'100%', padding:'12px', border:'none', borderRadius:'10px',
              background:'linear-gradient(135deg, #2dd4bf, #14b8a6)',
              color:'#fff', fontSize:'15px', fontWeight:'700',
              cursor:'pointer', letterSpacing:'0.3px'
            }}>
              Install App
            </button>
          )}

          <div style={{textAlign:'center', marginTop:'8px'}}>
            <button onClick={dismissInstallBanner} style={{
              background:'none', border:'none', color:'rgba(255,255,255,0.5)',
              fontSize:'12px', cursor:'pointer', padding:'4px 8px'
            }}>
              Not now
            </button>
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
  height:'70px',
  background:'rgba(255,255,255,0.92)',
  backdropFilter:'blur(20px)',
  WebkitBackdropFilter:'blur(20px)',
  borderTop:'1px solid rgba(226,230,234,0.6)',
  display:page==="create"||page==="chat"||page==="createService"||page==="createCollection"||page==="createRoom"?'none':'flex',
  alignItems:'center',
  justifyContent:'space-around',
  zIndex:1000,
  boxSizing:'border-box',
  padding:'6px 0 env(safe-area-inset-bottom, 8px) 0'
}}>
        <button onClick={()=>{setPage("home");handleTabTap("goods");}} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',cursor:'pointer',padding:'8px',border:'none',background:'none',position:'relative'}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{transition:'all 0.2s ease'}}><circle cx="10.5" cy="10.5" r="6" stroke={page==="home"?'#2dd4bf':'#8a9bb0'} strokeWidth="2.2" fill="none"/><line x1="15" y1="15" x2="20" y2="20" stroke={page==="home"?'#2dd4bf':'#8a9bb0'} strokeWidth="2.2" strokeLinecap="round"/><path d="M16.5 4.5L17.2 6.3L19 7L17.2 7.7L16.5 9.5L15.8 7.7L14 7L15.8 6.3Z" fill={page==="home"?'#2dd4bf':'#8a9bb0'}/></svg><span style={{fontSize:'10px',color:page==="home"?'#2dd4bf':'#8a9bb0',fontWeight:page==="home"?'700':'500',transition:'all 0.2s ease'}}>Discover</span></button>
        <button onClick={()=>{setPage("home");handleTabTap("services");}} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',cursor:'pointer',padding:'8px',border:'none',background:'none',position:'relative'}}><span style={{fontSize:'22px',color:page==="home"&&homeTab==="services"?'#7c3aed':'#8a9bb0',transition:'color 0.2s ease'}}>⚡</span><span style={{fontSize:'10px',color:page==="home"&&homeTab==="services"?'#7c3aed':'#8a9bb0',fontWeight:page==="home"&&homeTab==="services"?'700':'500',transition:'all 0.2s ease'}}>Services</span></button>
        <button onClick={()=>{user ? setPage("create") : requireAuth("sell", ()=>setPage("create"));}} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'0',cursor:'pointer',padding:'0',border:'none',background:'none',marginTop:'-20px'}}><div style={{width:'48px',height:'48px',borderRadius:'16px',background:'linear-gradient(135deg,#2dd4bf,#14b8a6)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 14px rgba(45,212,191,0.35)'}}><span style={{fontSize:'24px',color:'#fff',lineHeight:1}}>＋</span></div><span style={{fontSize:'10px',color:'#2dd4bf',fontWeight:'600',marginTop:'2px'}}>Sell</span></button>
        <button onClick={()=>setPage("messages")} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',cursor:'pointer',padding:'8px',border:'none',background:'none',position:'relative'}}><span style={{fontSize:'22px',color:page==="messages"?'#2dd4bf':'#8a9bb0',transition:'color 0.2s ease'}}>💬</span><span style={{fontSize:'10px',color:page==="messages"?'#2dd4bf':'#8a9bb0',fontWeight:page==="messages"?'700':'500',transition:'all 0.2s ease'}}>Messages</span>{unreadCount>0&&<span style={{position:'absolute',top:'2px',right:'2px',background:'#ef4444',color:'#fff',fontSize:'8px',fontWeight:'700',padding:'2px 5px',borderRadius:'10px',minWidth:'16px',textAlign:'center',boxShadow:'0 2px 6px rgba(239,68,68,0.3)'}}>{unreadCount}</span>}</button>
        <button onClick={()=>setPage("profile")} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',cursor:'pointer',padding:'8px',border:'none',background:'none'}}><span style={{fontSize:'22px',color:page==="profile"?'#2dd4bf':'#8a9bb0',transition:'color 0.2s ease'}}>👤</span><span style={{fontSize:'10px',color:page==="profile"?'#2dd4bf':'#8a9bb0',fontWeight:page==="profile"?'700':'500',transition:'all 0.2s ease'}}>Profile</span></button>
      
    </div>
  </div>
  </>
);
}

export default App;