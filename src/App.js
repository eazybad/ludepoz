import { useState, useEffect, useCallback, useRef } from "react";
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, collection, collectionGroup, addDoc, updateDoc, doc, query, where, getDocs, serverTimestamp, orderBy, setDoc, getDoc, onSnapshot, increment, deleteDoc, writeBatch } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getFunctions, httpsCallable } from "firebase/functions";
import { QRCodeSVG } from 'qrcode.react';


import {
  useKampasikaSearch,
  filterListings,
  filterServices,
  filterRooms,
  filterCollections,
  AISearchBadge,
} from './kampasikaSearch';
import {
  localParseCreate,
  shouldUseCreateAI,
  parseCreateWithAI,
} from './kampasikaCreateAssist';
import {
  compressImage,
  COMPRESSION_PRESETS,
  // eslint-disable-next-line no-unused-vars
  validateVideo,
} from './imageCompression';
import { computePriceSignal, PriceSignalBadge } from './priceSignal';
import { CreateGroupModal, GroupListPage } from './groups/GroupListPage';
import { GroupDetailPage } from './groups/GroupDetailPage';
import {
  addGroupResource,
  createUniversityGroup,
  archiveUniversityGroup,
  joinUniversityGroup,
  seedDemoGroups,
  subscribeGroups,
  subscribePublicGroupEvents,
} from './groups/groupService';

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
const functions = getFunctions(app);

const UNIVERSITIES = [
  { id: 1, name: "Ardhi University", short: "ARU", location: "Dar es Salaam" },
];

const DEFAULT_UNI = UNIVERSITIES[0];
const ENABLE_PHONE_VERIFICATION = false;

// ========== FEATURE FLAGS ==========
// Set to true to enable these features when ready

// eslint-disable-next-line no-unused-vars
const ENABLE_COLLECTIONS = true;  // Communities & events (group orders)
// ====================================

function WhatsAppIcon({ size = 16, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

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

const AVATAR_COLORS = [
  "#06d6c7",
  "#0d9488",
  "#0f1b2d",
  "#7c3aed",
  "#dc2626",
  "#2563eb",
];

function avatarInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : (parts[0] || "?").slice(0, 2);
  return initials.toUpperCase();
}

function makeInitialAvatarUrl(name, color = "#06d6c7") {
  const text = avatarInitials(name);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
      <rect width="240" height="240" rx="120" fill="${color}"/>
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="82" font-weight="800" fill="#ffffff">${text}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// Generate URL-friendly slug from seller name + uni
const generateSellerSlug = (name, uni) => {
  return (name + '-' + (uni || 'student'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
};

const SEARCH_EXAMPLES = [
  "Ni nini unatafuta leo?",
  "Try: iphone 11 chini ya 400k",
  "Try: tutor wa math",
  "Try: notes za calculus",
  "Try: calculator ya engineering",
  "Try: barber survey",
  "Try: laptop chini ya 300k",
];

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

// ─── Feature flags ───
// Toggle for the price-signal badges — disabled while inventory is sparse.
// Re-enable when each category has 30+ listings (otherwise medians are noise).
const SHOW_PRICE_SIGNAL = false;

// Admin UIDs — accounts with access to the /admin dashboard.
// Read by an isAdmin check in the App component; never used for security gates
// at the data layer (Firestore rules still enforce real permissions).
const ADMIN_UIDS = ["LTrwUHH6utQJGiw4lcsKflzXvPR2"];

const QS_DRIVE_ROOT_URL = "https://drive.google.com/drive/folders/1OZjhlt-B9RI9tM8fjxEksoeRX__ZcuPs";
const QS_RESOURCE_FOLDERS = [
  "BUILDING CONSTRUCTION 2",
  "COMMUNICATION SKILLS",
  "COMPUTER DESIGNS",
  "FINANCIAL LITERACY",
  "MATERIAL FOR CONSTRUCTION 2",
  "MECHANICS OF MATERIALS",
  "STATISTICS AND PROBABILITY",
  "TOPOGRAPHICAL SURVEYING",
];

// Resilient compression wrapper. If compression fails (HEIC images, very large
// files, browser memory limits), fall back to the ORIGINAL file so the upload
// still succeeds. The user gets their listing/photo posted; they just don't
// get the size benefit on that one image.
async function safeCompress(file, preset) {
  try {
    const { file: compressed } = await compressImage(file, preset);
    return { file: compressed, fallback: false };
  } catch (err) {
    console.warn("Compression failed, uploading original:", err.message);
    return { file, fallback: true };
  }
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState("signup");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [userName, setUserName] = useState("");
  const [userAvatar, setUserAvatar] = useState(null);
  const [userAccountType, setUserAccountType] = useState("student");
  const [userProviderLocation, setUserProviderLocation] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpBusy, setPhoneOtpBusy] = useState(false);
  const [showPhoneVerifyModal, setShowPhoneVerifyModal] = useState(false);
  // Phone capture modal — appears when user tries to save a search alert without a phone on file
  const [phonePromptOpen, setPhonePromptOpen] = useState(false);
  const [pendingAlert, setPendingAlert] = useState(null); // {kind, query, parsedFilters}
  const [phoneInputValue, setPhoneInputValue] = useState("");
  const [userBio, setUserBio] = useState("");
  const [userServices, setUserServices] = useState([]);
  const [selectedUni, setSelectedUni] = useState(DEFAULT_UNI);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [isStudent, setIsStudent] = useState(true);
  const [signupLocation, setSignupLocation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [page, setPageRaw] = useState("communities");
  const [ENABLE_ROOMS, setEnableRooms] = useState(false);
  const [REQUIRE_IDENTITY_VERIFICATION, setRequireIdentityVerification] = useState(false);
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState(false);
  const pageHistory = useRef(["communities"]);
  const isGoingBack = useRef(false)
  const groupInternalBackRef = useRef(null);

  // Tracks whether any home-tab search is active. The back-button handler
  // reads this to decide whether to clear search first vs. navigate pages.
  const activeSearchRef = useRef({ kind: null, query: "" });

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
      const prev = pageHistory.current[pageHistory.current.length - 1] || "communities";
      setPageRaw(prev);
    } else {
      setPageRaw("communities");
    }
    setTimeout(() => { isGoingBack.current = false; }, 50);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setOfflineBannerDismissed(false);
    };
    const handleOffline = () => {
      setIsOffline(true);
      setOfflineBannerDismissed(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);
  const [homeTab, setHomeTab] = useState("goods");
  const [tabIconsVisible, setTabIconsVisible] = useState(false);
  const homeScrollRef = useRef(null);
  const lastScrollY = useRef(0);
  const [profileTab, setProfileTab] = useState("listings");
  const [activeCat, setActiveCat] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [committedSearchQ, setCommittedSearchQ] = useState("");
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
  const imagePreloadCache = useRef(new Set());
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showCreateSuccess, setShowCreateSuccess] = useState(false);
  const [lastCreatedListing, setLastCreatedListing] = useState(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editProfileData, setEditProfileData] = useState({ name: "", bio: "", services: [], avatarFile: null, avatarPreview: null, avatarPreset: null });
  const [uploading, setUploading] = useState(false);
  const [showAppMenu, setShowAppMenu] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  // Collection payment QR scanner
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showAdvancedCollection, setShowAdvancedCollection] = useState(false);
  // Groups
  const [groups, setGroups] = useState([]);
  const [myGroupMemberships, setMyGroupMemberships] = useState({});
  const [publicGroupEvents, setPublicGroupEvents] = useState([]);
  const [groupReadAt, setGroupReadAt] = useState(() => {
    try { return JSON.parse(localStorage.getItem("groupReadAt") || "{}"); }
    catch (_) { return {}; }
  });
  const [viewingGroup, setViewingGroup] = useState(null);
  const [groupInitialView, setGroupInitialView] = useState({ tab: "chats", collectionId: "", collection: null, source: "" });
  const [groupsInitialMode, setGroupsInitialMode] = useState("groups");
  const [createGroupData, setCreateGroupData] = useState({ name: "", desc: "", type: "class", visibility: "public" });
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupAnnouncements, setGroupAnnouncements] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [currentGroupMember, setCurrentGroupMember] = useState(null);
  const [joiningGroup, setJoiningGroup] = useState(false);
  const [groupViewTab, setGroupViewTab] = useState("announcements");
  const [newAnnouncement, setNewAnnouncement] = useState("");
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);
  const [seedingDemoGroups, setSeedingDemoGroups] = useState(false);
  const [seedingQsGroup, setSeedingQsGroup] = useState(false);
  const unsubGroupAnnouncements = useRef(null);
  const unsubGroupMembers = useRef(null);
  const [scanResult, setScanResult] = useState(null); // { order, studentName, paid, collectionTitle }
  const [scanError, setScanError] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const scanVideoRef = useRef(null);
  const scanStreamRef = useRef(null);
  const scanAnimRef = useRef(null);
  const [createAssistText, setCreateAssistText] = useState("");
  const [createAssistLoading, setCreateAssistLoading] = useState(false);
  const [showAboutBanner, setShowAboutBanner] = useState(false);
  const [showVerifiedBanner, setShowVerifiedBanner] = useState(false);
  const [showGetVerifiedBanner, setShowGetVerifiedBanner] = useState(false);
  const [showSafetyMessage, setShowSafetyMessage] = useState(() => localStorage.getItem("safetyMessageDismissed") !== "true");
  const [showChatTip, setShowChatTip] = useState(true);
  // Services state
  const [services, setServices] = useState([]);
  const [activeServiceCat, setActiveServiceCat] = useState("all");
  const [serviceSearchQ, setServiceSearchQ] = useState("");
  const [committedServiceSearchQ, setCommittedServiceSearchQ] = useState("");
  const [viewingService, setViewingService] = useState(null);
  const [createServiceData, setCreateServiceData] = useState({
    category: "", title: "", desc: "", price: "", priceType: "fixed",
    whatsapp: "", location: "", availability: "", photoFiles: [], photoPreviews: []
  });
  const [showCreateServiceSuccess, setShowCreateServiceSuccess] = useState(false);
  // Collections/Orders tracker state
  const [collections, setCollections] = useState([]);
  const [viewingCommunity, setViewingCommunity] = useState(null);
  const feedsHydratedRef = useRef(false);
  const [viewingCollection, setViewingCollection] = useState(null);
  const [collectionOrders, setCollectionOrders] = useState([]);
  const [createCollectionData, setCreateCollectionData] = useState({
    title: "", desc: "", price: "", expectedPeople: "", options: "", paymentMethods: [], adminEmails: "", deadline: "", communityName: "", communityType: "class", collectionType: "order", groupId: "", photoFiles: [], photoPreviews: []
  });
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

useEffect(() => {
  if (searchQ) return;
  const interval = setInterval(() => {
    setPlaceholderIdx(i => (i + 1) % SEARCH_EXAMPLES.length);
  }, 3500);
  return () => clearInterval(interval);
}, [searchQ]);

// ─── Upload watchdog ───
// Mobile browsers can suspend JS during a long upload (when the user backgrounds
// the app or the screen sleeps). When that happens, our `finally { setUploading(false) }`
// may never run, leaving the button stuck on "Uploading...". This watchdog
// force-resets the uploading state after 90 seconds and shows a clear error.
useEffect(() => {
  if (!uploading) return;
  const timeout = setTimeout(() => {
    setUploading(false);
    setError("Imeshindwa kupakia. Jaribu tena. (Hakikisha mtandao uko vizuri.)");
    setTimeout(() => setError(""), 5000);
  }, 90000);
  return () => clearTimeout(timeout);
}, [uploading]);

// ─── Auto-load admin data when admin opens the dashboard ───
useEffect(() => {
  if (page === "admin" && user && ADMIN_UIDS.includes(user.uid)) {
    loadAdminData();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [page, user]);
  const {
  parsed: aiParsed,
  isAIActive,
  isSearching: aiSearching,
  search: runAISearch,
  clear: clearAISearch,
} = useKampasikaSearch(app);
  const [showCreateCollectionSuccess, setShowCreateCollectionSuccess] = useState(false);
  const [lastCreatedCollectionId, setLastCreatedCollectionId] = useState(null);
  const [showEntryQR, setShowEntryQR] = useState(false);
  const [showRoomIndoor, setShowRoomIndoor] = useState(false);
  const [orderFormData, setOrderFormData] = useState({ selectedOption: "", paymentRef: "", studentName: "", phone: "", amountPaid: "", payerName: "", paymentProofFile: null, paymentProofPreview: null });
  const [myOrderId, setMyOrderId] = useState(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [collectionSearchQ, setCollectionSearchQ] = useState("");
  const [committedCollectionSearchQ, setCommittedCollectionSearchQ] = useState("");
  const [orderSearchQ, setOrderSearchQ] = useState("");
  const [editingCollection, setEditingCollection] = useState(false);
  // Rooms & Housing state
  const [rooms, setRooms] = useState([]);
  // All rooms owned by the current user, INCLUDING unavailable/rented ones.
  // Public feed shows only available; this lets the owner manage everything.
  const [myAllRooms, setMyAllRooms] = useState([]);
  const [roomSearchQ, setRoomSearchQ] = useState("");
  const [committedRoomSearchQ, setCommittedRoomSearchQ] = useState("");

  // Keep activeSearchRef in sync with whichever home-tab search is active.
  // Read by the back-button handler in the main popstate effect.
  useEffect(() => {
    if (page !== "home") {
      activeSearchRef.current = { kind: null, query: "" };
      return;
    }
    if (homeTab === "goods" && committedSearchQ.trim()) {
      activeSearchRef.current = { kind: "listing", query: committedSearchQ };
    } else if (homeTab === "services" && committedServiceSearchQ.trim()) {
      activeSearchRef.current = { kind: "service", query: committedServiceSearchQ };
    } else if (homeTab === "rooms" && committedRoomSearchQ.trim()) {
      activeSearchRef.current = { kind: "room", query: committedRoomSearchQ };
    } else {
      activeSearchRef.current = { kind: null, query: "" };
    }
  }, [page, homeTab, committedSearchQ, committedServiceSearchQ, committedRoomSearchQ]);

  const [roomFilterType, setRoomFilterType] = useState("all");
  const [roomFilterMaxPrice, setRoomFilterMaxPrice] = useState("");
  const [viewingRoom, setViewingRoom] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [roommateSearchQ, setRoommateSearchQ] = useState("");
  const [roommatePosts, setRoommatePosts] = useState([]);
  const [createRoomData, setCreateRoomData] = useState({
    landlordName: "", landlordPhone: "", roomType: "", price: "", location: "", lat: null, lng: null, nearUni: "ARU", desc: "", amenities: [], photoFiles: [], photoPreviews: [], videoFile: null, videoPreview: null
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
   // eslint-disable-next-line no-unused-vars
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
  // Tracks whether we've finished loading the user's profile from Firestore.
  // Used to suppress the verification banner flash on page load — we don't
  // want to show "Pata Verified" then disappear it once we discover the user
  // is already verified. Wait until we know.
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [studentIdFile, setStudentIdFile] = useState(null);
  const [studentIdPreview, setStudentIdPreview] = useState(null); 
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [nidaNumberInput, setNidaNumberInput] = useState("");
  const [nameOnIdInput, setNameOnIdInput] = useState("");

  // Public seller profile state
  const [publicSeller, setPublicSeller] = useState(null);
  const [publicSellerListings, setPublicSellerListings] = useState([]);
  const [publicSellerServices, setPublicSellerServices] = useState([]);
  const [publicSellerStats, setPublicSellerStats] = useState(null);
  const [publicSellerLoading, setPublicSellerLoading] = useState(false);

  // PWA Install Prompt state
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [offlineBannerDismissed, setOfflineBannerDismissed] = useState(false);

  // Saved search alerts — track which queries the user has already subscribed to in this session
  const [savedAlerts, setSavedAlerts] = useState(new Set());
  const [savingAlert, setSavingAlert] = useState(false);

  // Admin dashboard state
  const [adminAlerts, setAdminAlerts] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminFilter, setAdminFilter] = useState("inbox"); // "inbox" | "routed" | "fulfilled" | "all"
  // Verification queue state
  const [adminVerifications, setAdminVerifications] = useState([]);
  const [verificationFilter, setVerificationFilter] = useState("pending"); // "pending" | "approved" | "rejected"
  const [rejectingId, setRejectingId] = useState(null); // currently picking reject reason
  const [viewingIdPhoto, setViewingIdPhoto] = useState(null); // url of full-size ID being viewed
  
  // eslint-disable-next-line no-unused-vars
  const isExpired = (listing) => {
    if (!listing.expiresAt) return false;
    const expiryDate = listing.expiresAt.toDate ? listing.expiresAt.toDate() : new Date(listing.expiresAt);
    return expiryDate < new Date();
  };
  
 const canPerformAction = (action = "default") => {
  if (loading) {
    setError("Inakaribia... subiri sekunde chache na ujaribu tena.");
    setTimeout(() => setError(""), 3000);
    return false;
  }
  if (!user) {
    setError("Tafadhali ingia kwenye akaunti yako kwanza.");
    setTimeout(() => setError(""), 3000);
    setShowAuthModal(true);
    return false;
  }
  return true;
};

  // Check if current user is creator or co-admin of a collection
  const isCollectionAdmin = (col) => {
    if (!user || !col) return false;
    if (user.uid === col.userId) return true;
    const adminList = col.adminEmails || [];
    const myEmail = user.email?.toLowerCase();
    return myEmail && adminList.includes(myEmail);
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

      // Load active services (portfolio)
      try {
        const svcQ = query(collection(db, "services"), where("userId", "==", userId), orderBy("createdAt", "desc"));
        const svcSnap = await getDocs(svcQ);
        setPublicSellerServices(svcSnap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })));
      } catch(e) {
        // Fallback if no orderBy index yet
        try {
          const svcQ2 = query(collection(db, "services"), where("userId", "==", userId));
          const svcSnap2 = await getDocs(svcQ2);
          setPublicSellerServices(svcSnap2.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch(e2) { setPublicSellerServices([]); }
      }

      setPage("seller");
    } catch (err) { console.error("Error loading public seller:", err); }
    finally { setPublicSellerLoading(false); }
  }, [setPage]);

  // Open seller profile from a listing card
  const openSellerProfile = (listing) => { loadPublicSellerProfile(listing.userId); };

  // ─── Search commit helpers ───
  // Commit a search: lock in the query so filters use it, then run AI if needed.
  // Used by Enter key and the search icon click. Typing alone does NOT commit.
  const commitListingsSearch = (q) => {
    setCommittedSearchQ(q);
    if (q && q.trim()) runAISearch(q);
    else clearAISearch();
  };
  const commitServicesSearch = (q) => {
    setCommittedServiceSearchQ(q);
    if (q && q.trim()) runAISearch(q);
    else clearAISearch();
  };
  const commitRoomsSearch = (q) => {
    setCommittedRoomSearchQ(q);
    if (q && q.trim()) runAISearch(q);
    else clearAISearch();
  };
  const commitCollectionsSearch = (q) => {
    setCommittedCollectionSearchQ(q);
    if (q && q.trim()) runAISearch(q);
    else clearAISearch();
  };

  // Close seller profile and restore URL
  const closeSellerProfile = () => {
    setPublicSeller(null);
    setPublicSellerListings([]);
    setPublicSellerServices([]);
    setPublicSellerStats(null);
    window.history.pushState({}, '', '/');
    document.title = 'Kampasika - Student Marketplace';
    setPage("home");
  };

  // ─── Saved-search alerts ───
  // When a user searches for something we don't have, they can tap "Notify me"
  // and we save the query. This data is gold — it tells you exactly what supply
  // you should be recruiting. View it in Firestore → searchAlerts collection.
  //
  // Phone-first model: ARU students mostly don't check email. We need a phone
  // number to actually reach them when supply appears. If we don't have one on
  // file, open the phone-prompt modal first; the actual save happens after.
  const saveSearchAlert = async (kind, query, parsedFilters) => {
    if (!user) {
      requireAuth("save_alert", () => saveSearchAlert(kind, query, parsedFilters));
      return;
    }
    if (!query || !query.trim()) return;
    const alertKey = `${kind}:${query.toLowerCase().trim()}`;
    if (savedAlerts.has(alertKey)) return; // already saved this session

    // No phone on file? Ask for it before saving the alert.
    if (!userPhone || !userPhone.trim()) {
      setPendingAlert({ kind, query, parsedFilters });
      setPhoneInputValue("");
      setPhonePromptOpen(true);
      return;
    }
    // Phone already on file → save directly
    return performSaveAlert(kind, query, parsedFilters, userPhone);
  };

  // Actual write to Firestore. Separated so the phone-prompt modal can also
  // call it after collecting the phone number.
  const performSaveAlert = async (kind, query, parsedFilters, phone) => {
    const alertKey = `${kind}:${query.toLowerCase().trim()}`;
    setSavingAlert(true);
    try {
      await addDoc(collection(db, "searchAlerts"), {
        userId: user.uid,
        userName: userName || "",
        userEmail: user.email || "",
        userPhone: phone || "",
        kind, // "listing" | "service" | "room" | "collection"
        query: query.trim(),
        parsedFilters: parsedFilters || null,
        universityId: selectedUni?.id || null,
        notified: false,
        routedAt: null, // set by admin when they broadcast to channel
        fulfilledAt: null, // set by admin when supply matched
        createdAt: serverTimestamp(),
      });
      setSavedAlerts(new Set([...savedAlerts, alertKey]));
      setSuccess("✓ Sawa! Tutakutaarifu utakapopatikana.");
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      console.error("Save alert failed:", err);
      setError("Imeshindwa kuhifadhi. Jaribu tena.");
    } finally {
      setSavingAlert(false);
    }
  };

  // Called from the phone-prompt modal. Validates input, saves phone to user
  // profile so we don't ask again, then completes the pending alert.
  const submitPhoneAndSaveAlert = async () => {
    const cleaned = (phoneInputValue || "").trim();
    // Basic TZ phone validation — accept 07xxxxxxxx, 06xxxxxxxx, or +2557xxxxxxxx
    const valid = /^(\+?255|0)[67]\d{8}$/.test(cleaned.replace(/\s/g, ""));
    if (!valid) {
      setError("Tafadhali andika namba sahihi (mfano: 0712345678)");
      setTimeout(() => setError(""), 4000);
      return;
    }
    try {
      // Save phone to user's profile doc so we never ask again
      await updateDoc(doc(db, "users", user.uid), { phone: cleaned });
      setUserPhone(cleaned);
      // Close modal, then complete the pending alert
      setPhonePromptOpen(false);
      if (pendingAlert) {
        await performSaveAlert(pendingAlert.kind, pendingAlert.query, pendingAlert.parsedFilters, cleaned);
        setPendingAlert(null);
      }
    } catch (err) {
      console.error("Phone save failed:", err);
      setError("Imeshindwa. Jaribu tena.");
      setTimeout(() => setError(""), 3000);
    }
  };

  const requestPhoneOtp = async () => {
    if (!user) { requireAuth("verify phone", () => setPage("profile")); return; }
    const cleaned = (userPhone || "").trim();
    if (!/^(\+?255|0)[67]\d{8}$/.test(cleaned.replace(/\s/g, ""))) {
      setError("Enter a valid Tanzania phone number first.");
      setTimeout(() => setError(""), 3500);
      return;
    }
    setPhoneOtpBusy(true);
    try {
      const sendOtp = httpsCallable(functions, "requestPhoneOtp");
      const result = await sendOtp({ phone: cleaned });
      setUserPhone(result.data?.phone || cleaned);
      setPhoneOtpSent(true);
      setPhoneOtpCode("");
      setSuccess("Verification code sent by SMS.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to send verification code.");
      setTimeout(() => setError(""), 4000);
    } finally {
      setPhoneOtpBusy(false);
    }
  };

  const verifyPhoneOtp = async () => {
    if (!user) return;
    if (!/^\d{6}$/.test(phoneOtpCode.trim())) {
      setError("Enter the 6 digit code.");
      setTimeout(() => setError(""), 3000);
      return;
    }
    setPhoneOtpBusy(true);
    try {
      const confirmOtp = httpsCallable(functions, "verifyPhoneOtp");
      const result = await confirmOtp({ code: phoneOtpCode.trim() });
      setUserPhone(result.data?.phone || userPhone);
      setPhoneVerified(true);
      setPhoneOtpSent(false);
      setPhoneOtpCode("");
      setShowPhoneVerifyModal(false);
      setSuccess("Phone number verified.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to verify code.");
      setTimeout(() => setError(""), 4000);
    } finally {
      setPhoneOtpBusy(false);
    }
  };

  // ─── Admin dashboard ───
  // Loads all search alerts + headline stats. Only callable from the admin page,
  // which is itself gated by the ADMIN_UIDS check. Firestore rules should also
  // restrict who can read these collections (not enforced here).
  const isAdmin = user && ADMIN_UIDS.includes(user.uid);

  const loadAdminData = async () => {
    if (!isAdmin) return;
    setAdminLoading(true);
    try {
      // Load all search alerts, newest first
      let alertSnap;
      try {
        alertSnap = await getDocs(query(collection(db, "searchAlerts"), orderBy("createdAt", "desc")));
      } catch (e) {
        // Fallback if no index
        alertSnap = await getDocs(collection(db, "searchAlerts"));
      }
      const alerts = alertSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate?.() || null,
        routedAt: d.data().routedAt?.toDate?.() || null,
        fulfilledAt: d.data().fulfilledAt?.toDate?.() || null,
      }));
      // Sort in JS too in case the index fallback returned unsorted
      alerts.sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
      setAdminAlerts(alerts);

      // Headline stats: simple counts, this-week vs total
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const isThisWeek = (createdAt) => {
        if (!createdAt) return false;
        const d = createdAt.toDate ? createdAt.toDate() : (createdAt instanceof Date ? createdAt : null);
        return d && d >= oneWeekAgo;
      };

      const [usersSnap, listingsSnap, servicesSnap, roomsSnap, verifSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "listings")),
        getDocs(collection(db, "services")),
        getDocs(collection(db, "rooms")),
        getDocs(collection(db, "verificationRequests")),
      ]);

      setAdminStats({
        users: { total: usersSnap.size, thisWeek: usersSnap.docs.filter(d => isThisWeek(d.data().createdAt)).length },
        listings: { total: listingsSnap.size, thisWeek: listingsSnap.docs.filter(d => isThisWeek(d.data().createdAt)).length },
        services: { total: servicesSnap.size, thisWeek: servicesSnap.docs.filter(d => isThisWeek(d.data().createdAt)).length },
        rooms: { total: roomsSnap.size, thisWeek: roomsSnap.docs.filter(d => isThisWeek(d.data().createdAt)).length },
        alerts: { total: alerts.length, thisWeek: alerts.filter(a => isThisWeek(a.createdAt)).length },
      });

      // Verification requests
      const verifs = verifSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate?.() || null,
        reviewedAt: d.data().reviewedAt?.toDate?.() || null,
      }));
      verifs.sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
      setAdminVerifications(verifs);
    } catch (err) {
      console.error("Admin load failed:", err);
      setError("Imeshindwa kupakia data ya admin.");
    } finally {
      setAdminLoading(false);
    }
  };

  // Mark an alert as routed (you've broadcast it to your WhatsApp Channel)
  const markAlertRouted = async (alert) => {
    try {
      await updateDoc(doc(db, "searchAlerts", alert.id), { routedAt: serverTimestamp() });
      setAdminAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, routedAt: new Date() } : a));
    } catch (err) { console.error("Mark routed failed:", err); }
  };

  // Mark an alert as fulfilled (supply matched, student notified)
  const markAlertFulfilled = async (alert) => {
    try {
      await updateDoc(doc(db, "searchAlerts", alert.id), { fulfilledAt: serverTimestamp(), notified: true });
      setAdminAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, fulfilledAt: new Date(), notified: true } : a));
    } catch (err) { console.error("Mark fulfilled failed:", err); }
  };

  // ─── Verification approval flow ───
  // approveVerification: marks request as approved, flips user's isVerified,
  // sets the badge type on the user doc, and sends an in-app notification.
  const approveVerification = async (req) => {
    try {
      // Determine badge type from account type
      const badgeType = req.accountType === "provider"
        ? (req.providerLocation ? "landlord" : "provider")  // future: room verification triggers "landlord"
        : "student";

      // Update the verification request
      await updateDoc(doc(db, "verificationRequests", req.id), {
        status: "approved",
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid,
      });

      // Update the user's profile
      await updateDoc(doc(db, "users", req.userId), {
        isVerified: true,
        verificationBadge: badgeType,
        verifiedAt: serverTimestamp(),
      });

      // Send in-app notification
      await addDoc(collection(db, "notifications"), {
        userId: req.userId,
        type: "verification_approved",
        title: "✓ Akaunti yako imethibitishwa!",
        message: badgeType === "student"
          ? "Sasa una alama ya 🎓 Verified Student. Wengi watakuamini zaidi."
          : badgeType === "landlord"
          ? "Sasa una alama ya 🏠 Verified Landlord. Vyumba vyako vitaonekana zaidi."
          : "Sasa una alama ya 💼 Verified Provider. Huduma zako zitaonekana zaidi.",
        read: false,
        createdAt: serverTimestamp(),
      });

      // Update local state
      setAdminVerifications(prev => prev.map(v => v.id === req.id
        ? { ...v, status: "approved", reviewedAt: new Date() }
        : v));
      setSuccess("✓ Imethibitishwa");
      setTimeout(() => setSuccess(""), 2500);
    } catch (err) {
      console.error("Approve failed:", err);
      setError("Imeshindwa kuthibitisha. Jaribu tena.");
    }
  };

  // rejectVerification with a specific reason from the picker
  const rejectVerification = async (req, reason) => {
    const reasonText = {
      blurry: "Picha haijawa wazi vya kutosha. Jaribu kwa picha bora.",
      mismatched_name: "Jina kwenye kitambulisho halilingani na jina ulilotuma.",
      fake_id: "Kitambulisho hakionekani halisi. Tafadhali wasilisha kitambulisho cha kweli.",
      wrong_type: req.accountType === "provider"
        ? "Tafadhali wasilisha NIDA, sio aina nyingine ya kitambulisho."
        : "Tafadhali wasilisha Student ID, sio aina nyingine ya kitambulisho.",
      expired: "Kitambulisho kimeisha muda wake. Wasilisha kipya.",
    }[reason] || "Ombi lako halijakubalika. Jaribu tena.";

    try {
      await updateDoc(doc(db, "verificationRequests", req.id), {
        status: "rejected",
        rejectionReason: reason,
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid,
      });

      await addDoc(collection(db, "notifications"), {
        userId: req.userId,
        type: "verification_rejected",
        title: "Ombi la uthibitisho halikukubalika",
        message: reasonText + " Unaweza kuwasilisha tena kupitia profile yako.",
        read: false,
        createdAt: serverTimestamp(),
      });

      setAdminVerifications(prev => prev.map(v => v.id === req.id
        ? { ...v, status: "rejected", rejectionReason: reason, reviewedAt: new Date() }
        : v));
      setRejectingId(null);
      setSuccess("Ombi limekataliwa na mtumiaji ameambiwa");
      setTimeout(() => setSuccess(""), 2500);
    } catch (err) {
      console.error("Reject failed:", err);
      setError("Imeshindwa. Jaribu tena.");
    }
  };



  // Compute matches in OTHER categories besides the current `kind`.
  // Used to show a "found 3 in Services, switch?" hint when the user searches
  // on the wrong tab and the AI correctly classified intent elsewhere.
  const computeCrossCategoryHint = (currentKind, query) => {
    if (!query || !query.trim() || !aiParsed) return [];
    const hints = [];

    // Check listings
    if (currentKind !== "listing") {
      const matches = filterListings(listings, aiParsed);
      if (matches.length > 0) hints.push({ kind: "listing", count: matches.length, label: "Goods" });
    }
    // Check services
    if (currentKind !== "service") {
      const matches = filterServices(services, aiParsed);
      if (matches.length > 0) hints.push({ kind: "service", count: matches.length, label: "Services" });
    }
    // Check rooms
    if (currentKind !== "room") {
      const matches = filterRooms(rooms, aiParsed);
      if (matches.length > 0) hints.push({ kind: "room", count: matches.length, label: "Rooms" });
    }
    return hints;
  };

  // Switch the home tab AND copy the active query to the destination tab's search.
  // Called from the CrossCategoryHint banner.
  const switchToCategoryWithQuery = (newKind, query) => {
    const tabMap = { listing: "goods", service: "services", room: "rooms" };
    const newTab = tabMap[newKind];
    if (!newTab) return;
    setHomeTab(newTab);
    // Move the query to the destination tab's search state
    if (newKind === "listing") { setSearchQ(query); setCommittedSearchQ(query); }
    else if (newKind === "service") { setServiceSearchQ(query); setCommittedServiceSearchQ(query); }
    else if (newKind === "room") { setRoomSearchQ(query); setCommittedRoomSearchQ(query); }
    // Clear the original tab's search
    // (the cross-hint is shown FROM the original tab, so we want it cleared on return)
  };

  // ─── Price input helpers ───
  // parsePrice accepts the messy ways real users type prices:
  //   "25000", "25,000", "25 000", "25k", "25K", "25.5k", "1m", "1.5M"
  // Returns a number, or null if it can't be parsed.
  // Used by the create-listing/service/room/collection forms so sellers don't
  // have to type a bare integer.
  const parsePrice = (raw) => {
    if (!raw) return null;
    let s = String(raw).trim().toLowerCase();
    if (!s) return null;
    // Strip commas, spaces, and TSh suffix if user typed it
    s = s.replace(/,/g, "").replace(/\s+/g, "").replace(/tsh$/i, "").replace(/tzs$/i, "");
    // Handle k/m suffixes
    let multiplier = 1;
    if (s.endsWith("k")) { multiplier = 1000; s = s.slice(0, -1); }
    else if (s.endsWith("m")) { multiplier = 1000000; s = s.slice(0, -1); }
    const n = parseFloat(s);
    if (isNaN(n) || n < 0) return null;
    return Math.round(n * multiplier);
  };

  // formatPriceInput returns a display-friendly version of what the user typed,
  // for showing under the input so they can confirm the parsed value.
  const formatPriceHint = (raw) => {
    const n = parsePrice(raw);
    if (n === null) return "";
    return n.toLocaleString() + " TSh";
  };

  const applyCreateDraft = useCallback((draft) => {
    if (draft.type === "collection") {
      setCreateCollectionData((prev) => ({
        ...prev,
        title: draft.title || prev.title,
        desc: draft.description || draft.desc || prev.desc,
        price: draft.price != null ? String(draft.price) : prev.price,
        communityName: draft.communityName || prev.communityName,
        communityType: draft.communityType || prev.communityType,
        collectionType: draft.collectionType || prev.collectionType,
        expectedPeople: draft.expectedPeople != null ? String(draft.expectedPeople) : prev.expectedPeople,
        deadline: draft.deadline || prev.deadline,
        options: Array.isArray(draft.options)
          ? draft.options.join(", ")
          : typeof draft.options === "string"
          ? draft.options
          : prev.options,
        adminEmails: Array.isArray(draft.adminEmails)
          ? draft.adminEmails.join(", ")
          : typeof draft.adminEmails === "string"
          ? draft.adminEmails
          : prev.adminEmails,
        paymentMethods: (draft.paymentMethods && draft.paymentMethods.length > 0)
          ? draft.paymentMethods
          : draft.payNumber
          ? [{ network: draft.payNetwork || "M-Pesa", number: draft.payNumber, name: draft.payName || "" }]
          : prev.paymentMethods,
      }));
      setPage("createCollection");
    } else {
      setCreateData((prev) => ({
        ...prev,
        cat: draft.category || prev.cat,
        title: draft.title || prev.title,
        desc: draft.description || prev.desc,
        price: draft.price != null ? String(draft.price) : prev.price,
        location: draft.location || prev.location,
      }));
      setPage("create");
    }
    setSuccess("Form filled — review, add photos, then publish.");
    setTimeout(() => setSuccess(""), 5000);
  }, [setPage]);

  // Inline collection field extractor — works offline, no network needed
  const extractCollectionFields = (text) => {
    const t = text.toLowerCase();
    // price
    const priceMatch = text.match(/(\d[\d,.]*)\s*(k|elfu|000)?\s*(?:tsh|tzs|shilingi)?/i);
    let price = null;
    if (priceMatch) {
      let n = parseFloat(priceMatch[1].replace(/,/g,''));
      if (priceMatch[2]) n *= priceMatch[2]==='k'||priceMatch[2]==='elfu' ? 1000 : priceMatch[2]==='000' ? 1 : 1;
      if (n > 100) price = Math.round(n);
    }
    // deadline — "15 Juni", "Juni 15", DD/MM/YYYY, YYYY-MM-DD
    const monthsSw = {januari:1,februari:2,machi:3,aprili:4,mei:5,juni:6,julai:7,agosti:8,septemba:9,oktoba:10,novemba:11,desemba:12,jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    let deadline = null;
    const yr = new Date().getFullYear();
    let dm = text.match(/(\d{1,2})(\d{1,2})(\d{4})/);
    if (dm) deadline = `${dm[3]}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`;
    if (!deadline) { dm = text.match(/(\d{4}-\d{2}-\d{2})/); if (dm) deadline = dm[1]; }
    if (!deadline) { dm = text.match(/(\d{1,2})\s+([a-z]+)/i)||text.match(/([a-z]{3,})\s+(\d{1,2})/i); if(dm){const d=dm[1].match(/^\d/)?dm[1]:dm[2];const ms=dm[1].match(/^\d/)?dm[2]:dm[1];const mon=monthsSw[ms.toLowerCase()];if(mon)deadline=`${yr}-${String(mon).padStart(2,'0')}-${String(parseInt(d)).padStart(2,'0')}`;}}
    // expectedPeople
    let expectedPeople = null;
    const ep = text.match(/(\d+)\s*(?:watu|people|persons|members|students|wanafunzi|nafasi|spots?)/i)||text.match(/total\s*(?:of\s*)?(\d+)/i);
    if (ep) expectedPeople = parseInt(ep[1]);
    // communityName — look for proper nouns followed by Year/Class/etc or after "ya"/"for"/"kwa"
    let communityName = null;
    const cn = text.match(/(?:ya|for|kwa|of|darasa la|group ya|class ya|jamii ya)\s+([A-Za-z][A-Za-z0-9\s]{2,30}?)(?:\s*,|\s*\.|$|\s+bei|\s+price)/i)
      || text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z0-9]+){0,3}(?:\s+(?:Year|Class|Club|Community|Church|Association|Batch))[\s\d]*)/);
    if (cn) communityName = cn[1].trim();
    // communityType
    let communityType = "class";
    if (/(kanisa|church|parokia|catholic|christian|islamic|mosque|kkkt|msalaba)/.test(t)) communityType = "church";
    else if (/(club|timu|team|association|society|league)/.test(t)) communityType = "club";
    else if (/(hostel|dormitory|nyumba|chumba|room)/.test(t)) communityType = "hostel";
    else if (/(freshers|wapya|newcomers|first year)/.test(t)) communityType = "freshers";
    // collectionType
    let collectionType = "order";
    if (/(event|ticket|usajili|registration|tamasha|sherehe|party|graduation|convocation|matamshi)/.test(t)) collectionType = "event";
    else if (/(mchango|contribution|donate|donation|fundraiser|msaada|support|sadaka)/.test(t)) collectionType = "contribution";
    else if (/(freshers|wapya)/.test(t)) collectionType = "freshers";
    // options (sizes etc)
    let options = [];
    const szRe = text.match(/(XS|S|M|L|XL|XXL|XXXL)/g);
    if (szRe) options = [...new Set(szRe)];
    else { const optM = text.match(/(?:sizes?|chaguo|options?)[:\s]+([A-Za-z0-9,\s/]+)/i); if(optM) options = optM[1].split(/[,/]/).map(s=>s.trim()).filter(Boolean); }
    // payment — "lipia" keyword + number
    let payNumber = null, payNetwork = "M-Pesa", payName = null;
    const nets = [["mpesa","M-Pesa"],["m-pesa","M-Pesa"],["tigopesa","Tigo Pesa"],["tigo pesa","Tigo Pesa"],["airtel","Airtel Money"],["halotel","Halopesa"],["halopesa","Halopesa"]];
    for (const [kw,name] of nets) { if (t.includes(kw)) { payNetwork = name; break; } }
    const numM = text.match(/(0[67]\d{8}|255[67]\d{8})/);
    if (numM) payNumber = numM[1];
    const nameM = text.match(/(?:lipia|jina|name|akaunti|account)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
    if (nameM) payName = nameM[1].trim();
    return { price, deadline, expectedPeople, communityName, communityType, collectionType, options: options.length>0?options:undefined, payNumber, payNetwork, payName };
  };

  const handleCreateAssist = async (preferredTarget) => {
    const text = createAssistText.trim();
    if (!text) return;
    if (!canPerformAction()) return;
    setCreateAssistLoading(true);
    setError("");
    try {
      let draft = localParseCreate(text);
      if (shouldUseCreateAI(text)) {
        try {
          const aiDraft = await parseCreateWithAI(app, text);
          if (aiDraft && typeof aiDraft === "object") {
            draft = { ...draft, ...aiDraft, price: aiDraft.price ?? draft.price };
          }
        } catch (err) {
          console.warn("Create assist AI unavailable, using local parse:", err);
        }
      }
      if (preferredTarget === "listing") draft = { ...draft, type: "listing" };
      if (preferredTarget === "collection") {
        draft = { ...draft, type: "collection" };
        // Always apply inline extractor — works even when AI/network fails
        const local = extractCollectionFields(text);
        draft = {
          ...draft,
          price: local.price ?? draft.price,
          communityName: local.communityName || draft.communityName,
          communityType: local.communityType || draft.communityType,
          collectionType: local.collectionType || draft.collectionType,
          expectedPeople: local.expectedPeople ?? draft.expectedPeople,
          deadline: local.deadline || draft.deadline,
          options: (local.options?.length > 0 ? local.options : draft.options),
          payNumber: local.payNumber || draft.payNumber,
          payNetwork: local.payNetwork || draft.payNetwork,
          payName: local.payName || draft.payName,
        };
        // AI layer on top if available
        if (shouldUseCreateAI(text)) {
          try {
            const aiDraft2 = await parseCreateWithAI(app, text);
            if (aiDraft2 && typeof aiDraft2 === "object") {
              draft = {
                ...draft,
                ...aiDraft2,
                type: "collection",
                price: aiDraft2.price ?? draft.price,
                communityName: aiDraft2.communityName || draft.communityName,
                communityType: aiDraft2.communityType || draft.communityType,
                collectionType: aiDraft2.collectionType || draft.collectionType,
                expectedPeople: aiDraft2.expectedPeople ?? draft.expectedPeople,
                deadline: aiDraft2.deadline || draft.deadline,
                options: (aiDraft2.options?.length > 0 ? aiDraft2.options : draft.options),
                payNumber: aiDraft2.payNumber || draft.payNumber,
                payNetwork: aiDraft2.payNetwork || draft.payNetwork,
                payName: aiDraft2.payName || draft.payName,
              };
            }
          } catch (err) {
            console.warn("Collection AI layer failed, local parse used:", err);
          }
        }
      }
      applyCreateDraft(draft);
    } catch (err) {
      console.error(err);
      setError('Jaribu: "Nauza iPhone 11 bei 400k pale Mlimani"');
      setTimeout(() => setError(""), 4000);
    } finally {
      setCreateAssistLoading(false);
    }
  };

  // Reusable empty-results component for any tab.
  // Three states:
  //   1. No query yet → fallback message ("Be the first to post")
  //   2. Search committed + AI still thinking → render nothing (caller keeps existing list visible)
  //   3. Search committed + AI done + no results → friendly "no results" with Niarifu button
  //   4. After Niarifu tapped → success state, not a gray dead-end
  // ─── Verified badge component ───
  // Renders a colored, branded chip indicating that a user has been verified.
  // Receives the user doc or a partial { isVerified, verificationBadge } shape.
  // Three variants based on verificationBadge:
  //   "student" → 🎓 teal     "provider" → 💼 gray     "landlord" → 🏠 gold
  // Returns null if the user isn't verified.
  const VerifiedBadge = ({ user: u, size = "sm" }) => {
    if (!u || !u.isVerified) return null;
    const badge = u.verificationBadge || "student";
    const variants = {
      student: { icon: "🎓", label: "Verified Student", bg: "#f0fffe", color: "#0d9488", border: "#99f0ee" },
      provider: { icon: "💼", label: "Verified Provider", bg: "#f3f4f6", color: "#374151", border: "#d1d5db" },
      landlord: { icon: "🏠", label: "Verified Landlord", bg: "#ccfbf1", color: "#0f766e", border: "#99f0ee" },
    };
    const v = variants[badge] || variants.student;
    const padding = size === "xs" ? "1px 6px" : size === "sm" ? "2px 8px" : "4px 10px";
    const fontSize = size === "xs" ? "9px" : size === "sm" ? "10px" : "12px";
    return (
      <span style={{
        display:'inline-flex',
        alignItems:'center',
        gap:'4px',
        padding,
        fontSize,
        fontWeight:'700',
        color: v.color,
        background: v.bg,
        border: `1px solid ${v.border}`,
        borderRadius:'10px',
        whiteSpace:'nowrap',
      }}>
        <span>{v.icon}</span>
        <span>{size === "xs" ? "Verified" : v.label}</span>
      </span>
    );
  };

  const EmptyResults = ({ kind, query, parsedFilters, fallbackTitle, fallbackHint }) => {
    const hasQuery = query && query.trim().length > 0;
    const alertKey = hasQuery ? `${kind}:${query.toLowerCase().trim()}` : null;
    const alreadySaved = alertKey && savedAlerts.has(alertKey);

    if (!hasQuery) {
      if (isOffline) {
        const offlineKind = kind === "listing" ? "Discover posts" : kind === "service" ? "services" : kind === "room" ? "rooms" : "updates";
        return (
          <div style={{textAlign:'center',padding:'44px 18px',background:'#fff',borderRadius:'12px',border:'1px solid #dbe8e7'}}>
            <div style={{fontSize:'34px',marginBottom:'12px'}}>⌁</div>
            <div style={{fontSize:'16px',fontWeight:'700',color:'#0f1b2d'}}>You're offline</div>
            <div style={{fontSize:'13px',color:'#667085',marginTop:'6px',lineHeight:1.45}}>
              No saved {offlineKind} are available on this device yet. Open this page when online once, then Kampasika can show saved results here.
            </div>
          </div>
        );
      }
      // No active search — just an empty list. Use the original fallback.
      return (
        <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px'}}>
          <div style={{fontSize:'40px',marginBottom:'16px'}}>📭</div>
          <div style={{fontSize:'16px',fontWeight:'600'}}>{fallbackTitle || 'Hakuna kitu hapa bado'}</div>
          {fallbackHint && <div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>{fallbackHint}</div>}
        </div>
      );
    }

    // AI is still thinking — render nothing. Caller keeps existing items visible
    // and the "✨ AI is thinking..." badge already shows somewhere else in the UI.
    if (aiSearching) return null;

    // After the user has saved the alert — show a clear success state,
    // not just a grayed-out button next to "Hakuna matokeo" (that read as a dead-end).
    if (alreadySaved) {
      return (
        <div style={{textAlign:'center',padding:'40px 20px',background:'#f0fffe',borderRadius:'14px',border:'1px solid #99f0ee'}}>
          <div style={{fontSize:'40px',marginBottom:'12px'}}>✓</div>
          <div style={{fontSize:'15px',fontWeight:'700',color:'#0d9488',marginBottom:'6px'}}>
            Tumeshakuhifadhi
          </div>
          <div style={{fontSize:'13px',color:'#0d9488',lineHeight:1.5,marginBottom:'4px'}}>
            Utapata ujumbe "{query.length > 30 ? query.slice(0,30) + '…' : query}" itakapopatikana.
          </div>
          <div style={{fontSize:'11px',color:'#0ea5a0',opacity:0.7,marginTop:'8px',marginBottom:'16px'}}>
            (We'll reach you when this is listed)
          </div>
          <button
            onClick={() => {
              if (kind === "listing") { setSearchQ(""); setCommittedSearchQ(""); }
              else if (kind === "service") { setServiceSearchQ(""); setCommittedServiceSearchQ(""); }
              else if (kind === "room") { setRoomSearchQ(""); setCommittedRoomSearchQ(""); }
              else if (kind === "collection") { setCollectionSearchQ(""); setCommittedCollectionSearchQ(""); }
              clearAISearch();
            }}
            style={{
              padding:'10px 24px',
              background:'#fff',
              color:'#0d9488',
              border:'1.5px solid #99f0ee',
              borderRadius:'20px',
              fontSize:'13px',
              fontWeight:'600',
              cursor:'pointer',
            }}>
            ← Angalia vingine
          </button>
        </div>
      );
    }

    // Default empty state — but first, check if other categories have matches
    const crossHints = computeCrossCategoryHint(kind, query);

    return (
      <>
        {/* Cross-category hint banner */}
        {crossHints.length > 0 && (
          <div style={{background:'linear-gradient(90deg,#f0fffe,#f0fffe)',borderRadius:'12px',border:'1px solid #99f0ee',padding:'14px 16px',marginBottom:'10px'}}>
            <div style={{fontSize:'13px',color:'#0d9488',fontWeight:'600',marginBottom:'10px',lineHeight:1.4}}>
              ✨ Tumepata "{query.length > 30 ? query.slice(0,30) + '…' : query}" katika sehemu nyingine:
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
              {crossHints.map(hint => (
                <button
                  key={hint.kind}
                  onClick={() => switchToCategoryWithQuery(hint.kind, query)}
                  style={{
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'space-between',
                    padding:'10px 14px',
                    background:'#fff',
                    border:'1px solid #99f0ee',
                    borderRadius:'10px',
                    fontSize:'13px',
                    fontWeight:'600',
                    color:'#0d9488',
                    cursor:'pointer',
                    textAlign:'left',
                  }}>
                  <span>{hint.count} katika {hint.label}</span>
                  <span style={{fontSize:'16px'}}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* The big "Hakuna matokeo" panel only appears when there are no
            cross-category matches. If matches exist elsewhere, the banner
            above is enough — no need to also dominate the screen with an empty state. */}
        {crossHints.length === 0 && (
          <div style={{textAlign:'center',padding:'40px 20px',background:'#fff',borderRadius:'14px',border:'1px solid #f0f0f0'}}>
            <div style={{fontSize:'36px',marginBottom:'12px'}}>🔍</div>
            <div style={{fontSize:'15px',fontWeight:'700',color:'#0f1b2d',marginBottom:'6px'}}>
              Hakuna matokeo sasa hivi katika {kind === "listing" ? "Goods" : kind === "service" ? "Services" : kind === "room" ? "Rooms" : "Collections"}
            </div>
            <div style={{fontSize:'13px',color:'#6b7280',marginBottom:'4px',lineHeight:1.5}}>
              Tutakutaarifu mtu akiiorodhesha "{query.length > 40 ? query.slice(0, 40) + '…' : query}"
            </div>
            <div style={{fontSize:'11px',color:'#8a9bb0',marginBottom:'18px'}}>
              (We'll notify you when something matching is listed)
            </div>
            <button
              onClick={() => saveSearchAlert(kind, query, parsedFilters)}
              disabled={savingAlert}
              style={{
                padding:'12px 24px',
                background: 'linear-gradient(135deg,#0d9488,#0ea5a0)',
                color: '#fff',
                border:'none',
                borderRadius:'24px',
                fontSize:'14px',
                fontWeight:'700',
                cursor: savingAlert ? 'wait' : 'pointer',
                boxShadow: '0 2px 10px rgba(13,148,136,0.2)',
              }}>
              {savingAlert ? '...' : '🔔 Niarifu kikipatikana'}
            </button>
          </div>
        )}
      </>
    );
  };


  // eslint-disable-next-line no-unused-vars
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

  // eslint-disable-next-line no-unused-vars
  const renewListing = async (listingId) => {
    try {
      const newExpiry = new Date(Date.now() + 48 * 3600000);
      await updateDoc(doc(db, "listings", listingId), {
        expiresAt: newExpiry,
        renewedAt: serverTimestamp()
      });
      loadListings();
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
      loadListings();
      setSuccess("Listing deleted!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error deleting listing:", err);
      setError("Failed to delete listing");
    }
  };
  
  const toggleRoomsFeature = async () => {
  try {
    const newValue = !ENABLE_ROOMS;

    await setDoc(
      doc(db, "system", "features"),
      {
        rooms: newValue
      },
      { merge: true }
    );

    setEnableRooms(newValue);
    if (newValue) {
  await Promise.all([loadRooms(), loadRoommatePosts()]);
  if (user) await loadMyAllRooms();
} else {
  setRooms([]);
  setRoommatePosts([]);
  setMyAllRooms([]);
}

    setSuccess(
      newValue
        ? "✓ Rooms feature enabled"
        : "✓ Rooms feature disabled"
    );
  } catch (err) {
    console.error("Toggle failed:", err);
    setError("Failed to update feature");
  }
};
  const toggleIdentityVerificationRequirement = async () => {
    try {
      const newValue = !REQUIRE_IDENTITY_VERIFICATION;

      await setDoc(
        doc(db, "system", "features"),
        { requireIdentityVerification: newValue },
        { merge: true }
      );

      setRequireIdentityVerification(newValue);
      setSuccess(newValue ? "Identity verification required for the whole app" : "Identity verification disabled for the whole app");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Toggle failed:", err);
      setError("Failed to update identity verification setting");
    }
  };

 const deleteConversation = async (conversationId) => {
  if (!conversationId) return;
  if (!window.confirm("Delete this conversation? This cannot be undone.")) return;

  try {
    const convRef = doc(db, "conversations", conversationId);
    const convSnap = await getDoc(convRef);

    if (!convSnap.exists()) {
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      return;
    }

    const conv = convSnap.data();
    const isParticipant = user && (user.uid === conv.buyerId || user.uid === conv.sellerId);

    if (!isParticipant) {
      setError("You can only delete your own conversations.");
      return;
    }

    // Old blank conversations have no real message, so delete only the parent doc.
    const isEmptyConversation = !conv.lastMessage || !conv.lastMessage.trim();

    if (!isEmptyConversation) {
      const messagesQuery = query(
        collection(db, "conversations", conversationId, "messages")
      );
      const messagesSnap = await getDocs(messagesQuery);

      const deletePromises = messagesSnap.docs.map(d =>
        deleteDoc(doc(db, "conversations", conversationId, "messages", d.id))
      );

      await Promise.all(deletePromises);
    }

    await deleteDoc(convRef);

    setConversations(prev => prev.filter(c => c.id !== conversationId));

    if (activeConversation?.id === conversationId) {
      setActiveConversation(null);
      setMessages([]);
      setPage("messages");
    }

    setSuccess("Conversation deleted");
    setTimeout(() => setSuccess(""), 3000);
  } catch (err) {
    console.error("Error deleting conversation:", err);
    setError("Failed to delete conversation: " + err.message);
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

  // Real-time listeners — stored so we can unsubscribe
  const unsubListings = useRef(null);
  const unsubServices = useRef(null);
  const unsubCollections = useRef(null);
  const unsubCollectionOrders = useRef(null);

  // Auto-pop About banner for unverified/guest users after 5s
  useEffect(() => {
    setShowAboutBanner(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isVerified]);

  const markFeedsHydrated = useCallback(() => {
    if (feedsHydratedRef.current) return;
    feedsHydratedRef.current = true;
    setLoading(false);
  }, []);

  const loadListings = useCallback(() => {
  if (unsubListings.current) unsubListings.current();
  try {
    const q = query(collection(db, "listings"), where("sold", "==", false), orderBy("createdAt", "desc"));
    unsubListings.current = onSnapshot(q, (snap) => {
      setListings(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })));
      markFeedsHydrated();
    }, (err) => {
      console.error("Listings listener error:", err);
      // Fallback without orderBy
      const q2 = query(collection(db, "listings"), where("sold", "==", false));
      unsubListings.current = onSnapshot(q2, (snap) => {
        setListings(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })));
        markFeedsHydrated();
      }, (err2) => console.error("Listings fallback error:", err2));
    });
  } catch(e) { console.error("Error setting up listings listener:", e); }
}, [markFeedsHydrated]);

  const loadServices = useCallback(() => {
    if (unsubServices.current) unsubServices.current();
    try {
      const q = query(collection(db, "services"), where("active", "==", true), orderBy("createdAt", "desc"));
      unsubServices.current = onSnapshot(q, (snap) => {
        setServices(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })));
      }, (err) => {
        const q2 = query(collection(db, "services"), where("active", "==", true));
        unsubServices.current = onSnapshot(q2, (snap) => {
          setServices(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })));
        }, (err2) => console.error("Services fallback error:", err2));
      });
    } catch(e) { console.error("Error setting up services listener:", e); }
  }, []);

  const loadCollections = useCallback(() => {
    if (unsubCollections.current) unsubCollections.current();
    try {
      const q = query(collection(db, "collections"), where("active", "==", true), orderBy("createdAt", "desc"));
      unsubCollections.current = onSnapshot(q, (snap) => {
        setCollections(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })));
      }, (err) => {
        const q2 = query(collection(db, "collections"), where("active", "==", true));
        unsubCollections.current = onSnapshot(q2, (snap) => {
          setCollections(snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() })));
        }, (err2) => console.error("Collections fallback error:", err2));
      });
    } catch(e) { console.error("Error setting up collections listener:", e); }
  }, []);

  useEffect(() => {
    const urls = [];
    const collect = (item) => {
      if (!item) return;
      if (item.photoUrl) urls.push(item.photoUrl);
      if (Array.isArray(item.photos)) urls.push(...item.photos.filter(Boolean));
    };
    listings.forEach(collect);
    services.forEach(collect);
    rooms.forEach(collect);
    collections.forEach(collect);

    urls.slice(0, 160).forEach(url => {
      if (!url || imagePreloadCache.current.has(url)) return;
      imagePreloadCache.current.add(url);
      const img = new Image();
      img.decoding = "async";
      img.src = url;
    });
  }, [collections, listings, rooms, services]);

  const loadFeatureFlags = async () => {
  try {
    const refDoc = doc(db, "system", "features");
    const snap = await getDoc(refDoc);

    if (snap.exists()) {
      const data = snap.data();
      setEnableRooms(data.rooms === true);
      // Only treat as ON when admin explicitly set true in Firestore
      setRequireIdentityVerification(data.requireIdentityVerification === true);
    } else {
      setEnableRooms(false);
      setRequireIdentityVerification(false);
    }
  } catch (err) {
    console.error("Error loading feature flags:", err);
    setEnableRooms(false);
    setRequireIdentityVerification(false);
  } finally {
    setFeatureFlagsLoaded(true);
  }
};

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
    if (!user) { requireAuth("list a room", () => setPage("createRoom")); return; }
    const parsedRoomPrice = parsePrice(createRoomData.price);
    if (!createRoomData.landlordName.trim() || !createRoomData.landlordPhone.trim() || !createRoomData.roomType || parsedRoomPrice === null || !createRoomData.location.trim()) {
      setError("Please fill in name, phone, room type, price, and location"); return;
    }
    try {
      setUploading(true);
      const photoUrls = [];
      if (createRoomData.photoFiles.length > 0) {
        for (let i = 0; i < createRoomData.photoFiles.length; i++) {
          const original = createRoomData.photoFiles[i];
          const { file } = await safeCompress(original, COMPRESSION_PRESETS.room);
          const storageRef = ref(storage, `rooms/${Date.now()}_${i}.jpg`);
          const snapshot = await uploadBytes(storageRef, file);
          photoUrls.push(await getDownloadURL(snapshot.ref));
        }
      }
      // eslint-disable-next-line no-unused-vars
      let videoUrl = null;
      await addDoc(collection(db, "rooms"), {
        landlordName: createRoomData.landlordName.trim(),
        landlordPhone: createRoomData.landlordPhone.trim(),
        roomType: createRoomData.roomType,
        price: parsedRoomPrice,
        location: createRoomData.location.trim(),
        lat: createRoomData.lat || null,
        lng: createRoomData.lng || null,
        nearUni: createRoomData.nearUni || "ARU",
        description: createRoomData.desc.trim(),
        amenities: createRoomData.amenities || [],
        photoUrl: photoUrls[0] || null,
        photos: photoUrls,
        available: true,
        views: 0,
        userId: user.uid,
        listedBy: user.uid,
        listedByName: userName || createRoomData.landlordName.trim(),
        listedByAvatar: userAvatar || null,
        createdAt: serverTimestamp()
      });
      setShowCreateRoomSuccess(true);
      setSuccess("Room listed successfully!");
      setCreateRoomData({ landlordName: "", landlordPhone: "", roomType: "", price: "", location: "", lat: null, lng: null, nearUni: "ARU", desc: "", amenities: [], photoFiles: [], photoPreviews: [] });
      await loadRooms();
      loadMyAllRooms();
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
  
  // eslint-disable-next-line no-unused-vars
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
    if (!("Notification" in window)) {
      setShowNotificationBanner(false);
      setError("Notifications are not supported on this browser.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const token = await getToken(messaging, {
        vapidKey: "BCpZgxfVSjWFXh3ySZm5oeZb3ak8nEK_zCc9brxVGq-9JVgEIhpiJCOg3169zvMK4OvF3CBGzSq9YpMMnjYaGTE"
      });
      console.log("FCM Token:", token);

      await updateDoc(doc(db, "users", currentUser.uid), {
        fcmToken: token
      });
      setShowNotificationBanner(false);
      localStorage.setItem("notificationBannerDismissed", Date.now().toString());
      setSuccess("Notifications enabled. Hutapitwa na updates.");

    } else {
      console.log("Notification permission denied");
      setShowNotificationBanner(false);
      localStorage.setItem("notificationBannerDismissed", Date.now().toString());
    }
  } catch (error) {
    console.error("Error getting token:", error);
    setError("Could not enable notifications right now. Try again later.");
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
      setUserAccountType(userData.accountType || "student");
      setUserProviderLocation(userData.location || "");
      setUserPhone(userData.phone || "");
      setPhoneVerified(userData.phoneVerified === true);
      setSelectedUni(UNIVERSITIES.find(u => u.id === userData.universityId) || DEFAULT_UNI);
      // Read both legacy "verified" and current "isVerified" field — handles
      // both data shapes since users created before v16 may have either.
      setIsVerified(userData.isVerified === true || userData.verified === true);

      checkVerificationStatus(userId).catch(() => {});
    }
  } catch (err) {
    console.error("Error loading profile:", err);
  } finally {
    setProfileLoaded(true);
  }
}, [checkVerificationStatus]);

  // ─── Landlord room management ───
  // Loads ALL rooms owned by the current user, regardless of availability.
  // The public feed (loadRooms) filters by available==true, but the owner
  // needs to see rented rooms too in order to toggle them back on later.
  const loadMyAllRooms = useCallback(async () => {
    if (!user) { setMyAllRooms([]); return; }
    try {
      const q = query(collection(db, "rooms"), where("userId", "==", user.uid));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() }));
      // Sort newest first (in JS to avoid a composite index requirement)
      list.sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0));
      setMyAllRooms(list);
    } catch (err) {
      console.error("Error loading my rooms:", err);
    }
  }, [user]);

  useEffect(() => {
  if (!ENABLE_ROOMS) {
    setRooms([]);
    setRoommatePosts([]);
    setMyAllRooms([]);
    return;
  }

  loadRooms();
  loadRoommatePosts();
  if (user) loadMyAllRooms();
}, [ENABLE_ROOMS, user, loadRooms, loadRoommatePosts, loadMyAllRooms]);

  // Flip a room between KIPO WAZI (available) and KIMEPANGISHWA (rented).
  // Optimistic update: change UI immediately, then write to Firestore.
  // If Firestore fails, we re-load to get true state back.
  const toggleRoomAvailability = async (room) => {
    if (!user || room.userId !== user.uid) return;
    const newAvailable = !room.available;
    // Optimistic local update
    setMyAllRooms(prev => prev.map(r => r.id === room.id ? { ...r, available: newAvailable } : r));
    try {
      await updateDoc(doc(db, "rooms", room.id), { available: newAvailable });
      // Refresh the public rooms list so this change reflects elsewhere
      loadRooms();
      setSuccess(newAvailable ? "✓ Chumba kimerudi kwenye listings" : "✓ Chumba kimewekwa kuwa Kimepangishwa");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Toggle failed:", err);
      setError("Imeshindwa. Jaribu tena.");
      loadMyAllRooms(); // revert by re-loading
    }
  };

  // Permanently delete a room. Used for test posts or wrong listings.
  // Two-step confirmation to prevent accidents.
  const deleteMyRoom = async (room) => {
    if (!user || room.userId !== user.uid) return;
    const confirmed = window.confirm(
      `Una uhakika unataka kufuta "${room.location || 'chumba hiki'}" kabisa?\n\nHaitarudi tena.`
    );
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "rooms", room.id));
      setMyAllRooms(prev => prev.filter(r => r.id !== room.id));
      loadRooms();
      setSuccess("✓ Chumba kimefutwa");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Delete failed:", err);
      setError("Imeshindwa kufuta. Jaribu tena.");
    }
  };


 
  const loadConversations = useCallback(async (userId) => {
    const uid = userId || user?.uid;
    if (!uid) return;
    try {
      const q1 = query(
        collection(db, "conversations"),
        where("buyerId", "==", uid),
        orderBy("lastMessageAt", "desc")
      );
      const q2 = query(
        collection(db, "conversations"),
        where("sellerId", "==", uid),
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
        const myUnread = uid === conv.buyerId ? conv.buyerUnread : conv.sellerUnread;
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
      setActiveConversation(prev => {
  if (!prev?.id) return prev;
  return uniqueConvos.find(c => c.id === prev.id) || prev;
});
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
      return;
    }

    setActiveConversation({
      id: null,
      _draft: true,
      listingId: listing.id,
      listingTitle: listing.title,
      listingPrice: listing.price,
      listingPhoto: listing.photoUrl || null,
      buyerId: user.uid,
      buyerName: userName,
      buyerAvatar: userAvatar,
      sellerId: listing.userId,
      sellerName: listing.userName,
      sellerAvatar: listing.userAvatar
    });

    setMessages([]);
    setPage("chat");
    setSuccess("");
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
status: "sending",
_pending: true
    }]);
    
    try {

      if (!activeConversation.id) {
  const convRef = doc(collection(db, "conversations"));
  const msgRef = doc(collection(db, "conversations", convRef.id, "messages"));
  const isFromBuyer = user.uid === activeConversation.buyerId;

  const batch = writeBatch(db);

  batch.set(convRef, {
    listingId: activeConversation.listingId,
    listingTitle: activeConversation.listingTitle,
    listingPrice: activeConversation.listingPrice,
    listingPhoto: activeConversation.listingPhoto || null,
    buyerId: activeConversation.buyerId,
    buyerName: activeConversation.buyerName,
    buyerAvatar: activeConversation.buyerAvatar || null,
    sellerId: activeConversation.sellerId,
    sellerName: activeConversation.sellerName,
    sellerAvatar: activeConversation.sellerAvatar || null,
    lastMessage: text,
    lastMessageAt: serverTimestamp(),
    buyerUnread: 0,
    sellerUnread: isFromBuyer ? 1 : 0,
    createdAt: serverTimestamp()
  });

  batch.set(msgRef, {
    senderId: user.uid,
    senderName: userName,
    text: text,
status: "sent",
readBy: [user.uid],
createdAt: serverTimestamp()
  });

  await batch.commit();
  setActiveConversation(prev => ({ ...prev, id: convRef.id, _draft: false }));
  return;
}

      await addDoc(collection(db, "conversations", activeConversation.id, "messages"), {
        senderId: user.uid,
        senderName: userName,
        text: text,
status: "sent",
readBy: [user.uid],
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

  const sendImageMessage = async (file) => {
    if (!file || !activeConversation) return;
    const tempId = 'temp_img_' + Date.now();
    const localPreview = URL.createObjectURL(file);
    // Optimistic bubble
    setMessages(prev => [...prev, {
      id: tempId,
      senderId: user.uid,
      senderName: userName,
      imageUrl: localPreview,
      text: '',
      createdAt: new Date(),
      _pending: true
    }]);
    try {
      const { file: compressed } = await safeCompress(file, COMPRESSION_PRESETS.listing);
      const storageRef = ref(storage, `chat/${Date.now()}_${user.uid}.jpg`);
      const snap = await uploadBytes(storageRef, compressed);
      const imageUrl = await getDownloadURL(snap.ref);

      let convId = activeConversation.id;
      if (!convId) {
        const convRef = doc(collection(db, "conversations"));
        const msgRef = doc(collection(db, "conversations", convRef.id, "messages"));
        const isFromBuyer = user.uid === activeConversation.buyerId;
        const batch = writeBatch(db);
        batch.set(convRef, {
          listingId: activeConversation.listingId,
          listingTitle: activeConversation.listingTitle,
          listingPrice: activeConversation.listingPrice,
          listingPhoto: activeConversation.listingPhoto || null,
          buyerId: activeConversation.buyerId,
          buyerName: activeConversation.buyerName,
          buyerAvatar: activeConversation.buyerAvatar || null,
          sellerId: activeConversation.sellerId,
          sellerName: activeConversation.sellerName,
          sellerAvatar: activeConversation.sellerAvatar || null,
          lastMessage: '📷 Photo',
          lastMessageAt: serverTimestamp(),
          buyerUnread: 0,
          sellerUnread: isFromBuyer ? 1 : 0,
          createdAt: serverTimestamp()
        });
        batch.set(msgRef, {
          senderId: user.uid,
          senderName: userName,
          text: '',
          imageUrl,
          status: "sent",
          readBy: [user.uid],
          createdAt: serverTimestamp()
        });
        await batch.commit();
        setActiveConversation(prev => ({ ...prev, id: convRef.id, _draft: false }));
        setMessages(prev => prev.filter(m => m.id !== tempId));
        return;
      }

      await addDoc(collection(db, "conversations", convId, "messages"), {
        senderId: user.uid,
        senderName: userName,
        text: '',
        imageUrl,
        status: "sent",
        readBy: [user.uid],
        createdAt: serverTimestamp()
      });
      const isFromBuyer = user.uid === activeConversation.buyerId;
      await updateDoc(doc(db, "conversations", convId), {
        lastMessage: '📷 Photo',
        lastMessageAt: serverTimestamp(),
        [isFromBuyer ? "sellerUnread" : "buyerUnread"]: increment(1)
      });
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } catch (err) {
      console.error("Error sending image:", err);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setError("Failed to send photo. Try again.");
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
const lastReadField = isFromBuyer ? "buyerLastReadAt" : "sellerLastReadAt";

await updateDoc(doc(db, "conversations", conversationId), {
  [unreadField]: 0,
  [lastReadField]: serverTimestamp()
});
      } else {
        // Fallback: fetch then update (for conversations not yet in local state)
        const convRef = doc(db, "conversations", conversationId);
        const convDoc = await getDoc(convRef);
        if (convDoc.exists()) {
          const convData = convDoc.data();
          const isFromBuyer = user.uid === convData.buyerId;
         const unreadField = isFromBuyer ? "buyerUnread" : "sellerUnread";
const lastReadField = isFromBuyer ? "buyerLastReadAt" : "sellerLastReadAt";

await updateDoc(convRef, {
  [unreadField]: 0,
  [lastReadField]: serverTimestamp()
});
        }
      }
    } catch (err) {
      console.error("Error marking as read:", err);
    }
  };

  useEffect(() => {
    // Try to show cached data immediately (works offline too)
    // This won't fail even without auth since it reads from local IndexedDB
    try {
      loadListings().catch(() => {});
      loadServices().catch(() => {});
      loadCollections().catch(() => {});
    } catch(_) {}
    
    // Check URL for /seller/ or /u/ route (public seller profiles)
    const path = window.location.pathname;
    if (path.startsWith('/u/')) {
      const userId = path.replace('/u/', '').trim();
      if (userId) loadPublicSellerProfile(userId);
    }
    if (path.startsWith('/g/') && path.includes('/verify/')) {
      const parts = path.split('/').filter(Boolean);
      if (parts.length === 5 && parts[0] === "g" && parts[2] === "verify") {
        handleGroupVerifyScan(parts[1], parts[3], parts[4]);
      }
    } else if (path.startsWith('/verify/')) {
      const parts = path.replace('/verify/', '').split('/');
      if (parts.length === 2) handleVerifyScan(parts[0], parts[1]);
    }
    if (path.startsWith('/g/') && !path.includes('/verify/')) {
      const inviteCode = path.replace('/g/', '').trim();
      if (inviteCode) {
        const q = query(collection(db, "groups"), where("inviteCode", "==", inviteCode));
        getDocs(q).then(snap => {
          if (!snap.empty) {
            const group = { id: snap.docs[0].id, ...snap.docs[0].data() };
            openGroup(group);
          }
        }).catch(console.error);
      }
    }
    if (path.startsWith('/c/')) {
      const colId = path.replace('/c/', '').trim();
      if (colId) {
        getDoc(doc(db, "collections", colId)).then(snap => {
          if (snap.exists()) {
            const col = { id: snap.id, ...snap.data() };
            setViewingCollection(col);
            setMyOrderId(null);
            setPaymentConfirmed(false);
            loadCollectionOrders(col.id);
            setOrderFormData(prev => ({...prev, selectedOption:"", paymentRef:"", amountPaid:"", payerName:"", studentName:userName, paymentProofFile:null, paymentProofPreview:null}));
            setPage("collectionDetail");
          }
        }).catch(console.error);
      }
    }
    
    // Push initial state so browser back works step-by-step
    window.history.replaceState({ page: 'communities' }, '', window.location.pathname);
    
    // Handle browser/Android back button — go back one step instead of exiting
    const handlePopState = (e) => {
      const p = window.location.pathname;

      if (pageHistory.current[pageHistory.current.length - 1] === "groupDetail" && groupInternalBackRef.current?.()) {
        window.history.pushState({ page: "groupDetail" }, "", "/");
        return;
      }

      // If there's an active search on the home page, clearing it is the
      // expected back-button behavior — not navigating away.
      const active = activeSearchRef.current;
      if (active && active.kind) {
        if (active.kind === "listing") { setSearchQ(""); setCommittedSearchQ(""); }
        else if (active.kind === "service") { setServiceSearchQ(""); setCommittedServiceSearchQ(""); }
        else if (active.kind === "room") { setRoomSearchQ(""); setCommittedRoomSearchQ(""); }
        clearAISearch();
        activeSearchRef.current = { kind: null, query: "" };
        // Re-push so the next back press can still go back through pages
        window.history.pushState({ page: 'app' }, '', '/');
        return;
      }

      if (p.startsWith('/seller/') || p.startsWith('/collection/') || p.startsWith('/u/')) {
        setPublicSeller(null);
        setViewingCollection(null);
        setCollectionOrders([]);
        setPageRaw("home");
        pageHistory.current = ["home"];
        window.history.replaceState({ page: 'home' }, '', '/');
        document.title = 'Kampasika - Student Marketplace';
      } else {
        if (pageHistory.current[pageHistory.current.length - 1] === "groupDetail") {
          if (unsubGroupAnnouncements.current) unsubGroupAnnouncements.current();
          if (unsubGroupMembers.current) unsubGroupMembers.current();
          setViewingGroup(null);
          setGroupAnnouncements([]);
          setGroupMembers([]);
          setCurrentGroupMember(null);
          setGroupViewTab("announcements");
          pageHistory.current = pageHistory.current.filter(p => p !== "groupDetail");
          if (pageHistory.current[pageHistory.current.length - 1] !== "communities") pageHistory.current.push("communities");
          setPageRaw("communities");
          window.history.replaceState({ page: "communities" }, "", "/");
          return;
        }
        if (pageHistory.current.length > 1) {
  pageHistory.current.pop();
  const prev = pageHistory.current[pageHistory.current.length - 1] || "communities";

  if (prev !== "chat") {
    setActiveConversation(null);
    setMessages([]);
  }

  setPageRaw(prev);
}
        window.history.pushState({ page: 'app' }, '', '/');
      }
    };
    window.addEventListener('popstate', handlePopState);
    
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Keep splash until first listings snapshot (or timeout) — avoids empty home flash
        Promise.all([
          loadUserProfile(currentUser.uid),
          loadListings(),
          loadServices(),
          loadCollections(),
          loadFeatureFlags(),
          loadConversations(currentUser.uid),
        ]).catch(err => console.error("Data load error:", err));
        // Handle deep links after auth
        if (path.startsWith('/seller/')) {
          const slug = path.replace('/seller/', '');
          try {
            const usersSnap = await getDocs(collection(db, "users"));
            const match = usersSnap.docs.find(d => generateSellerSlug(d.data().name, d.data().universityName) === slug);
            if (match) loadPublicSellerProfile(match.id);
          } catch(e) { console.error("Error resolving seller slug:", e); }
        }
        if (path.startsWith('/collection/')) {
          const colId = path.replace('/collection/', '');
          if (colId) {
            try {
              const colDoc = await getDoc(doc(db, "collections", colId));
              if (colDoc.exists()) {
                const colData = { id: colDoc.id, ...colDoc.data(), createdAt: colDoc.data().createdAt?.toDate() };
                setViewingCollection(colData);
                loadCollectionOrders(colId);
                setPage("collectionDetail");
              }
            } catch(e) { console.error("Error loading shared collection:", e); }
          }
        }
      } else {
        setUser(null);
        setUserName("");
        setUserAvatar(null);
        setUserPhone("");
        setPhoneVerified(false);
        setPhoneOtpCode("");
        setPhoneOtpSent(false);
        setIsVerified(false);
        setProfileLoaded(false);
        // Not logged in — still try to load public data (will work if Firestore rules allow public reads)
        loadListings();
        loadServices();
        loadCollections();
        loadGroups();
        // Handle deep links for non-authenticated users
        if (path.startsWith('/collection/')) {
          const colId = path.replace('/collection/', '');
          if (colId) {
            try {
              const colDoc = await getDoc(doc(db, "collections", colId));
              if (colDoc.exists()) {
                const colData = { id: colDoc.id, ...colDoc.data(), createdAt: colDoc.data().createdAt?.toDate() };
                setViewingCollection(colData);
                loadCollectionOrders(colId);
                setPage("collectionDetail");
              }
            } catch(e) { console.error("Error loading shared collection:", e); }
          }
        }
      }
    });
    return () => {
      unsubscribe();
      window.removeEventListener('popstate', handlePopState);
      if (unsubListings.current) unsubListings.current();
      if (unsubServices.current) unsubServices.current();
      if (unsubCollections.current) unsubCollections.current();
      if (unsubCollectionOrders.current) unsubCollectionOrders.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadUserProfile, loadListings, loadServices, loadCollections, loadRooms, loadRoommatePosts, loadMyAllRooms, loadConversations, loadPublicSellerProfile, setPage]);

  // Never stay on splash forever if Firestore is slow or offline
  useEffect(() => {
    const t = setTimeout(() => markFeedsHydrated(), 4500);
    return () => clearTimeout(t);
  }, [markFeedsHydrated]);

  //eslint-disable-next-line
  const [tokenRequested, setTokenRequested] = useState(false);

// Notification permission is now deferred in onAuthStateChanged above

  // ─── QR Payment Scanner ───
  const loadJsQR = () => new Promise((resolve, reject) => {
    if (window.jsQR) { resolve(window.jsQR); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    s.onload = () => resolve(window.jsQR);
    s.onerror = reject;
    document.head.appendChild(s);
  });

  const stopScanner = () => {
    if (scanAnimRef.current) { cancelAnimationFrame(scanAnimRef.current); scanAnimRef.current = null; }
    if (scanStreamRef.current) { scanStreamRef.current.getTracks().forEach(t => t.stop()); scanStreamRef.current = null; }
    setShowQRScanner(false);
    setScanResult(null);
    setScanError("");
    setScanLoading(false);
  };

  const openScanner = async () => {
    setScanResult(null);
    setScanError("");
    setScanLoading(true);
    setShowQRScanner(true);
    try {
      const [jsQR, stream] = await Promise.all([
        loadJsQR(),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      ]);
      scanStreamRef.current = stream;
      setScanLoading(false);
      // Wait one tick for the video element to mount
      setTimeout(() => {
        const video = scanVideoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.play();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const tick = () => {
          if (!scanStreamRef.current) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
            if (code && code.data.includes('/verify/')) {
              let verifyPath = "";
              try {
                verifyPath = new URL(code.data).pathname;
              } catch (_) {
                verifyPath = code.data;
              }
              const pathParts = verifyPath.split('/').filter(Boolean);
              if (pathParts.length === 5 && pathParts[0] === "g" && pathParts[2] === "verify") {
                const [, groupId, , collectionId, paymentId] = pathParts;
                cancelAnimationFrame(scanAnimRef.current);
                scanStreamRef.current.getTracks().forEach(t => t.stop());
                scanStreamRef.current = null;
                handleGroupVerifyScan(groupId, collectionId, paymentId);
                return;
              }
              if (pathParts.length === 3 && pathParts[0] === "verify") {
                const [, colId, ordId] = pathParts;
                cancelAnimationFrame(scanAnimRef.current);
                scanStreamRef.current.getTracks().forEach(t => t.stop());
                scanStreamRef.current = null;
                handleVerifyScan(colId, ordId);
                return;
              }
            }
            if (code && code.data.includes('/g/') && !code.data.includes('/verify/')) {
              let invitePath = "";
              try {
                invitePath = new URL(code.data).pathname;
              } catch (_) {
                invitePath = code.data;
              }
              const pathParts = invitePath.split('/').filter(Boolean);
              if (pathParts.length === 2 && pathParts[0] === "g") {
                const inviteCode = decodeURIComponent(pathParts[1]);
                cancelAnimationFrame(scanAnimRef.current);
                scanStreamRef.current.getTracks().forEach(t => t.stop());
                scanStreamRef.current = null;
                setScanLoading(true);
                getDocs(query(collection(db, "groups"), where("inviteCode", "==", inviteCode)))
                  .then(async snap => {
                    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
                    const fallbackSnap = await getDoc(doc(db, "groups", inviteCode));
                    return fallbackSnap.exists() ? { id: fallbackSnap.id, ...fallbackSnap.data() } : null;
                  })
                  .then(group => {
                    if (!group) {
                      setScanError("Group QR not found.");
                      return;
                    }
                    setShowQRScanner(false);
                    openGroup(group);
                  })
                  .catch(err => setScanError("Could not open group QR: " + err.message))
                  .finally(() => setScanLoading(false));
                return;
              }
            }
          }
          scanAnimRef.current = requestAnimationFrame(tick);
        };
        scanAnimRef.current = requestAnimationFrame(tick);
      }, 300);
    } catch (err) {
      setScanLoading(false);
      setScanError(err.name === 'NotAllowedError' ? 'Camera permission denied. Please allow camera access and try again.' : 'Could not open camera: ' + err.message);
    }
  };

  const handleVerifyScan = async (collectionId, orderId) => {
    setScanLoading(true);
    setScanError("");
    setShowQRScanner(true);
    try {
      const orderSnap = await getDoc(doc(db, "collections", collectionId, "orders", orderId));
      const colSnap = await getDoc(doc(db, "collections", collectionId));
      if (!orderSnap.exists()) { setScanError("Order not found. This QR may be invalid."); setScanLoading(false); return; }
      const order = { id: orderSnap.id, ...orderSnap.data() };
      const colData = colSnap.exists() ? colSnap.data() : {};
      setScanResult({ order, collectionTitle: colData.title || "Collection", collectionId, orderId });
    } catch (err) {
      setScanError("Failed to verify: " + err.message);
    } finally { setScanLoading(false); }
  };

  const handleGroupVerifyScan = async (groupId, collectionId, paymentId) => {
    setScanLoading(true);
    setScanError("");
    setShowQRScanner(true);
    try {
      const paymentSnap = await getDoc(doc(db, "groups", groupId, "collections", collectionId, "payments", paymentId));
      const collectionSnap = await getDoc(doc(db, "groups", groupId, "collections", collectionId));
      const groupSnap = await getDoc(doc(db, "groups", groupId));
      if (!paymentSnap.exists()) {
        setScanError("Group payment not found. This QR may be invalid.");
        setScanLoading(false);
        return;
      }
      const payment = { id: paymentSnap.id, ...paymentSnap.data() };
      const collectionData = collectionSnap.exists() ? collectionSnap.data() : {};
      const groupData = groupSnap.exists() ? groupSnap.data() : {};
      setScanResult({
        kind: "groupPayment",
        order: {
          ...payment,
          paid: payment.status === "paid",
          approved: payment.status === "paid" || payment.status === "registered",
          registered: payment.status === "registered",
          amount: Number(payment.amountPaid || payment.amountDue || collectionData.amount || 0),
        },
        collectionTitle: collectionData.title || "Group payment",
        groupTitle: groupData.name || "Group",
        groupId,
        collectionId,
        paymentId,
      });
    } catch (err) {
      setScanError("Failed to verify group payment: " + err.message);
    } finally { setScanLoading(false); }
  };

  const confirmScanPayment = async () => {
    if (!scanResult) return;
    const { collectionId, orderId, order } = scanResult;
    try {
      setScanLoading(true);
      if (scanResult.kind === "groupPayment") {
        await updateDoc(doc(db, "groups", scanResult.groupId, "collections", scanResult.collectionId, "payments", scanResult.paymentId), {
          status: "paid",
          verifiedByQR: true,
          verifiedByUid: user?.uid || "",
          verifiedByName: userName || user?.email || "Verifier",
          verifiedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setScanResult({ ...scanResult, order: { ...order, paid: true, status: "paid" } });
        return;
      }
      await updateDoc(doc(db, "collections", collectionId, "orders", orderId), {
        paid: true, status: "paid", amountPaid: order.amount, verifiedByQR: true, verifiedAt: serverTimestamp()
      });
      if (!order.paid) {
        await updateDoc(doc(db, "collections", collectionId), { totalPaid: increment(1), totalCollected: increment(order.amount) });
      }
      setScanResult({ ...scanResult, order: { ...order, paid: true } });
      loadCollectionOrders(collectionId);
    } catch (err) {
      setScanError("Failed to confirm: " + err.message);
    } finally { setScanLoading(false); }
  };

  // ─── Groups ───
  const loadGroups = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, "groups"), orderBy("updatedAt", "desc")));
      setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("loadGroups:", e); }
  }, []);

  const closeGroupDetail = useCallback(() => {
    if (unsubGroupAnnouncements.current) unsubGroupAnnouncements.current();
    if (unsubGroupMembers.current) unsubGroupMembers.current();
    setViewingGroup(null);
    setGroupAnnouncements([]);
    setGroupMembers([]);
    setCurrentGroupMember(null);
    setGroupViewTab("announcements");
    pageHistory.current = pageHistory.current.filter(p => p !== "groupDetail");
    if (pageHistory.current[pageHistory.current.length - 1] !== "communities") {
      pageHistory.current.push("communities");
    }
    setPageRaw("communities");
    window.history.replaceState({ page: "communities" }, "", "/");
  }, []);

  const createGroup = async () => {
    if (!user) { requireAuth("createGroup", () => {}); return; }
    if (!createGroupData.name.trim()) { setError("Group name is required"); return; }
    setUploading(true);
    try {
      const newGroup = await createUniversityGroup(db, {
        data: createGroupData,
        user,
        profile: { name: userName, avatarUrl: userAvatar },
        selectedUni,
      });
      setShowCreateGroup(false);
      setCreateGroupData({ name: "", desc: "", type: "class", visibility: "public" });
      await loadGroups();
      openGroup(newGroup);
    } catch (e) { setError("Failed to create group: " + e.message); }
    finally { setUploading(false); }
  };

  const openGroup = (group, initialView = {}) => {
    setViewingGroup(group);
    setGroupInitialView({
      tab: initialView.tab || "chats",
      collectionId: initialView.collectionId || "",
      collection: initialView.collection || null,
      source: initialView.source || "",
    });
    setGroupAnnouncements([]);
    setGroupMembers([]);
    setCurrentGroupMember(null);
    setGroupViewTab("announcements");
    setNewAnnouncement("");
    setPage("groupDetail");
    if (unsubGroupAnnouncements.current) unsubGroupAnnouncements.current();
    if (unsubGroupMembers.current) unsubGroupMembers.current();
  };

  const joinGroup = async (group = viewingGroup) => {
    if (!group) return;
    if (!user) { requireAuth("join group", () => openGroup(group)); return; }
    if (currentGroupMember) return;
    setJoiningGroup(true);
    try {
      const joinStatus = await joinUniversityGroup(db, { group, user, profile: { name: userName, avatarUrl: userAvatar } });
      setSuccess(joinStatus === "pending" ? "Join request sent for admin approval." : "Joined group!");
      setTimeout(() => setSuccess(""), 2000);
    } catch (e) { setError("Failed to join group: " + e.message); }
    finally { setJoiningGroup(false); }
  };

  const handleSeedDemoGroups = async () => {
    setSeedingDemoGroups(true);
    try {
      if (!user || !ADMIN_UIDS.includes(user.uid)) {
        requireAuth("add demo groups", () => {});
        if (user) setError("Only admins can add demo groups.");
        return;
      }
      const seeded = await seedDemoGroups(db, {
        selectedUni,
        user,
        profile: { name: userName, avatarUrl: userAvatar },
      });
      await loadGroups();
      setSuccess(seeded === "updated" ? "Demo groups updated with sample data." : "Demo groups added with sample data.");
    } catch (e) {
      setError("Failed to add demo groups: " + e.message);
    } finally {
      setSeedingDemoGroups(false);
    }
  };

  const handleSeedQuantitySurveyGroup = async () => {
    setSeedingQsGroup(true);
    try {
      if (!user || !ADMIN_UIDS.includes(user.uid)) {
        requireAuth("add QS group", () => {});
        if (user) setError("Only admins can add the QS group.");
        return;
      }

      const existingSnap = await getDocs(query(collection(db, "groups"), where("name", "==", "QUANTITY SURVEY YR1")));
      if (!existingSnap.empty) {
        const existingGroup = { id: existingSnap.docs[0].id, ...existingSnap.docs[0].data() };
        await updateDoc(doc(db, "groups", existingGroup.id), {
          visibility: "inviteOnly",
          joinPolicy: "inviteOnly",
          updatedAt: serverTimestamp(),
        });
        const updatedGroup = { ...existingGroup, visibility: "inviteOnly", joinPolicy: "inviteOnly" };
        setSuccess("QUANTITY SURVEY YR1 already exists. Invite-only mode applied.");
        await loadGroups();
        openGroup(updatedGroup, { tab: "resources" });
        return;
      }

      const newGroup = await createUniversityGroup(db, {
        data: {
          name: "QUANTITY SURVEY YR1",
          desc: "Year 1 Quantity Survey resources, updates, work groups, submissions, and class coordination.",
          type: "class",
          visibility: "inviteOnly",
        },
        user,
        profile: { name: userName, avatarUrl: userAvatar },
        selectedUni,
      });

      const resourceProfile = { name: userName, avatarUrl: userAvatar };
      await addGroupResource(db, {
        groupId: newGroup.id,
        user,
        profile: resourceProfile,
        title: "QS NOTES full Drive package",
        url: QS_DRIVE_ROOT_URL,
        subject: "General",
        topic: "Main Drive package",
        resourceType: "Drive folder",
        description: "Main Google Drive package for QS Year 1. Groups and Moments can be added later inside Kampasika.",
      });

      for (const folderName of QS_RESOURCE_FOLDERS) {
        await addGroupResource(db, {
          groupId: newGroup.id,
          user,
          profile: resourceProfile,
          title: folderName,
          url: QS_DRIVE_ROOT_URL,
          subject: folderName,
          topic: "Drive folder",
          resourceType: "Drive folder",
          description: `Open the main QS Drive package and choose ${folderName}. More files can be uploaded directly into this Kampasika folder later.`,
        });
      }

      await loadGroups();
      setSuccess("QUANTITY SURVEY YR1 created with QS resources.");
      openGroup(newGroup, { tab: "resources" });
    } catch (e) {
      setError("Failed to add QS group: " + e.message);
    } finally {
      setSeedingQsGroup(false);
    }
  };

  const postAnnouncement = async () => {
    if (!newAnnouncement.trim() || !viewingGroup) return;
    setPostingAnnouncement(true);
    try {
      await addDoc(collection(db, "groups", viewingGroup.id, "announcements"), {
        text: newAnnouncement.trim(),
        authorName: userName,
        authorUid: user.uid,
        createdAt: serverTimestamp(),
        pinned: false,
      });
      setNewAnnouncement("");
    } catch (e) { setError("Failed to post: " + e.message); }
    finally { setPostingAnnouncement(false); }
  };

  const getGroupMember = (group, uid = user?.uid) => {
    if (!group || !uid) return null;
    return groupMembers.find(m => m.uid === uid && m.status !== "removed") || null;
  };

  const isGroupAdmin = (group) => {
    if (!user || !group) return false;
    const member = getGroupMember(group);
    return group.adminUid === user.uid
      || group.ownerUid === user.uid
      || ["owner", "admin", "treasurer"].includes(member?.role)
      || (group.coAdmins || []).includes(user.email);
  };

  const canArchiveGroup = (group) => {
    if (!user || !group) return false;
    return group.ownerUid === user.uid
      || group.adminUid === user.uid
      || (group.coAdmins || []).includes(user.email);
  };

  const handleArchiveGroup = async (group, mode = "archive") => {
    if (!canArchiveGroup(group)) {
      setError("Only the owner or admin can delete this group.");
      return;
    }
    const action = mode === "delete" ? "Delete" : "Archive";
    if (!window.confirm(`${action} ${group.name}? It will be removed from the groups list.`)) return;
    try {
      await archiveUniversityGroup(db, { groupId: group.id, user, mode });
      setGroups(prev => prev.filter(item => item.id !== group.id));
      if (viewingGroup?.id === group.id) closeGroupDetail();
      setSuccess(mode === "delete" ? "Group deleted." : "Group archived.");
      setTimeout(() => setSuccess(""), 2500);
    } catch (err) {
      setError("Failed to delete group: " + (err.message || String(err)));
    }
  };

  const markGroupRead = useCallback((group) => {
    if (!group?.id) return;
    const readAt = Date.now();
    setGroupReadAt(prev => {
      if ((prev[group.id] || 0) >= readAt) return prev;
      const next = { ...prev, [group.id]: readAt };
      try { localStorage.setItem("groupReadAt", JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, []);

  const groupUnreadCount = groups.filter(group => (
    group.active !== false
    && group.lastActivityByUid !== user?.uid
    && group.activityAt?.toMillis
    && group.activityAt.toMillis() > (groupReadAt[group.id] || 0)
  )).length;

  useEffect(() => {
    let unsubscribe;
    try {
      unsubscribe = subscribeGroups(db, setGroups, (err) => console.error("groups:", err));
    } catch (err) {
      console.error("groups listener setup:", err);
      loadGroups();
    }
    return () => { if (unsubscribe) unsubscribe(); };
  }, [loadGroups]);

  useEffect(() => {
    if (!user?.uid) {
      setMyGroupMemberships({});
      return undefined;
    }
    const membershipsQuery = query(collectionGroup(db, "members"), where("uid", "==", user.uid));
    const unsubscribe = onSnapshot(membershipsQuery, snap => {
      const memberships = {};
      snap.docs.forEach(memberDoc => {
        const groupId = memberDoc.ref.parent.parent?.id;
        if (!groupId) return;
        const data = memberDoc.data();
        if (data.status !== "removed" && data.status !== "left" && data.status !== "rejected") {
          memberships[groupId] = data.status || "active";
        }
      });
      setMyGroupMemberships(memberships);
    }, err => {
      console.error("my group memberships:", err);
      setMyGroupMemberships({});
    });
    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    let unsubscribe;
    try {
      unsubscribe = subscribePublicGroupEvents(db, setPublicGroupEvents, (err) => console.error("public group events:", err));
    } catch (err) {
      console.error("public events listener setup:", err);
    }
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  // Handle /g/ invite link
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

  useEffect(() => {
    if (!user || !("Notification" in window) || Notification.permission !== "default") {
      setShowNotificationBanner(false);
      return;
    }

    const dismissed = localStorage.getItem("notificationBannerDismissed");
    if (dismissed && Date.now() - parseInt(dismissed, 10) < 7 * 24 * 60 * 60 * 1000) {
      return;
    }

    const timer = setTimeout(() => setShowNotificationBanner(true), 4500);
    return () => clearTimeout(timer);
  }, [user]);

  const dismissNotificationBanner = () => {
    setShowNotificationBanner(false);
    localStorage.setItem("notificationBannerDismissed", Date.now().toString());
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
      if ("Notification" in window && Notification.permission === "granted") {
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
  if (!activeConversation || !activeConversation.id) {
  setMessages([]);
  return;
}

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

  const getAuthErrorMessage = (err, mode = "login") => {
    switch (err?.code) {
      case "auth/invalid-email":
        return "That email address is not valid. Please check it and try again.";
      case "auth/email-already-in-use":
        return "That email is already registered. Try logging in instead.";
      case "auth/weak-password":
        return "Your password is too weak. Use at least 6 characters.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "The email or password is incorrect. Please check both and try again.";
      case "auth/too-many-requests":
        return "Too many attempts. Please wait a few minutes, then try again.";
      case "auth/network-request-failed":
        return "Network problem. Check your internet connection and try again.";
      default:
        return mode === "signup"
          ? "We could not create your account right now. Please check your details and try again."
          : "We could not log you in right now. Please try again.";
    }
  };

    const handleSignup = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!signupName.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      setError("Please enter a valid email address, like alex@gmail.com.");
      return;
    }
    if (!password.trim()) {
      setError("Please create a password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    const chosenUni = DEFAULT_UNI;

    try {
      setError("");
      setLoading(true);

      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);

      const userDoc = {
        name: signupName.trim(),
        email: cleanEmail,
        accountType: "student",
        avatarUrl: null,
        bio: "",
        services: [],
        createdAt: serverTimestamp()
      };

      userDoc.universityId = chosenUni.id;
      userDoc.universityName = chosenUni.short;

      await setDoc(doc(db, "users", userCredential.user.uid), userDoc);

      setUserName(signupName.trim());
      setSelectedUni(chosenUni);
      setPhoneVerified(false);
      setLoading(false);
      setSuccess(isStudent
        ? "Account created! Welcome to Kampasika 🎉"
        : "Akaunti yako imeundwa! Sasa wanafunzi wanaweza kukupata.");
      setTimeout(() => setSuccess(""), 4000);
      setShowAuthModal(false);
      setPage("communities");
    } catch (err) {
      console.error("Signup error:", err);
      setError(getAuthErrorMessage(err, "signup"));
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!password.trim()) {
      setError("Please enter your password.");
      return;
    }

    try {
      setError("");
      setLoading(true);

      const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const userSnap = await getDoc(doc(db, "users", credential.user.uid));
      const loggedInUser = userSnap.exists() ? userSnap.data() : {};
      setUserPhone(loggedInUser.phone || "");
      setPhoneVerified(loggedInUser.phoneVerified === true);

      setLoading(false);
      setSuccess("Logged in successfully!");
      setTimeout(() => setSuccess(""), 4000);
      setShowAuthModal(false);
      setPage("communities");
    } catch (err) {
      console.error("Login error:", err);
      setError(getAuthErrorMessage(err, "login"));
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setPage("communities");
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
      setEditProfileData({...editProfileData, avatarFile: file, avatarPreview: event.target.result, avatarPreset: null});
    };
    reader.readAsDataURL(file);
  }
};

  const handleCreateListing = async () => {
    if (!canPerformAction()) return;

   const parsedPrice = parsePrice(createData.price);

  if (!user) {
    setError("Please log in before creating a listing.");
    setTimeout(() => setError(""), 4000);
    return;
  }
  if (!createData.cat) {
    setError("Please choose a category for your item.");
    setTimeout(() => setError(""), 4000);
    return;
  }
  if (!createData.title.trim()) {
    setError("Please add a title for your item.");
    setTimeout(() => setError(""), 4000);
    return;
  }
  if (!createData.price.trim()) {
    setError("Please add the price.");
    setTimeout(() => setError(""), 4000);
    return;
  }
  if (parsedPrice === null) {
    setError("The price is not readable. Try 25000, 25k, or 25,000.");
    setTimeout(() => setError(""), 4000);
    return;
  }
  if (!createData.location.trim()) {
    setError("Please add the pickup or meeting location.");
    setTimeout(() => setError(""), 4000);
    return;
  }
  try {
    setError("");
    setUploading(true);
    
    // Upload multiple photos (compressed on-device first to save data + storage)
    const photoUrls = [];
    if (createData.photoFiles.length > 0) {
      for (let i = 0; i < createData.photoFiles.length; i++) {
        const original = createData.photoFiles[i];
        const { file } = await safeCompress(original, COMPRESSION_PRESETS.listing);
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
      // Stamp verification at creation time so badges display without lookups.
      // If the user later gets verified, OLDER listings won't show the badge —
      // that's fine; they can re-list, and new listings will reflect the new status.
      userIsVerified: isVerified || false,
      userVerificationBadge: isVerified ? (userAccountType === "provider" ? "provider" : "student") : null,
      universityId: selectedUni.id,
      universityName: selectedUni.short,
      category: createData.cat,
      title: createData.title.trim(),
      description: createData.desc.trim(),
      price: parsedPrice,
      condition: createData.cond,
      location: createData.location.trim(),
      whatsapp: createData.whatsapp.trim(),
      photoUrl: photoUrls[0] || null,        // Keep first photo as main
      photos: photoUrls,                      // ⭐ ADD ALL PHOTOS
      sold: false,
      views: 0,
      saves: 0,
      createdAt: serverTimestamp(),
      // expiresAt removed — listings no longer auto-expire. Sellers mark them sold or delete them.
    });
    
    setShowCreateSuccess(true);
    setSuccess("Listing created successfully!");
    setTimeout(() => setSuccess(""), 4000);
    // Auto-dismiss celebration after 3 seconds
    setTimeout(() => {
      setShowCreateSuccess(false);
      setLastCreatedListing(null);
      setPage("home");
      pageHistory.current = ["home"];
      window.history.replaceState({ page: "home" }, "", "/");
    }, 3000);
    // Store last listing info for the share prompt
    const lastListing = {
      title: createData.title.trim(),
      price: parsedPrice,
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
    loadListings();
    // Don't auto-redirect — let user choose to share or go home
  } catch (err) {
    console.error("Error creating listing:", err);
    setError("Could not create the listing. Check your internet connection and try again.");
  } finally {
    setUploading(false);
  }
};

  const handleCreateService = async () => {
    if (!canPerformAction()) return;
    const parsedSvcPrice = parsePrice(createServiceData.price);
    if (!createServiceData.category || !createServiceData.title.trim() || parsedSvcPrice === null || !user) {
      setError("Tafadhali jaza sehemu zote: aina, kichwa, na bei.");
      setTimeout(() => setError(""), 4000);
      return;
    }
    try {
      setError("");
      setUploading(true);
      
      const photoUrls = [];
      if (createServiceData.photoFiles.length > 0) {
        for (let i = 0; i < createServiceData.photoFiles.length; i++) {
          const original = createServiceData.photoFiles[i];
          const { file } = await safeCompress(original, COMPRESSION_PRESETS.listing);
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
        accountType: userAccountType || "student",
        providerLocation: userAccountType === "provider" ? (userProviderLocation || "") : "",
        universityId: selectedUni.id,
        universityName: selectedUni.short,
        category: createServiceData.category,
        title: createServiceData.title.trim(),
        description: createServiceData.desc.trim(),
        price: parsedSvcPrice,
        priceType: createServiceData.priceType || "fixed",
        location: (createServiceData.location || "").trim(),
        availability: (createServiceData.availability || "").trim(),
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
        whatsapp: "", location: "", availability: "", photoFiles: [], photoPreviews: []
      });
      loadServices();
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
      loadServices();
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

  const loadCollectionOrders = (collectionId) => {
    if (unsubCollectionOrders.current) unsubCollectionOrders.current();
    try {
      const q = query(collection(db, "collections", collectionId, "orders"), orderBy("createdAt", "desc"));
      unsubCollectionOrders.current = onSnapshot(q, (snap) => {
        const orders = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() }));
        setCollectionOrders(orders);
        // Restore this user's order state if they already placed one
        if (user) {
          const myOrder = orders.find(o => o.userId === user.uid);
          if (myOrder) {
            setMyOrderId(prev => prev || myOrder.id);
            if (myOrder.paid) setPaymentConfirmed(true);
          }
        }
      }, (err) => {
        console.error("Orders listener error:", err);
        const q2 = query(collection(db, "collections", collectionId, "orders"));
        unsubCollectionOrders.current = onSnapshot(q2, (snap) => {
          const orders = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate() }));
          setCollectionOrders(orders);
          if (user) {
            const myOrder = orders.find(o => o.userId === user.uid);
            if (myOrder) {
              setMyOrderId(prev => prev || myOrder.id);
              if (myOrder.paid) setPaymentConfirmed(true);
            }
          }
        });
      });
    } catch(e) { console.error("Error setting up orders listener:", e); }
  };

  const handleCreateCollection = async () => {
    if (!canPerformAction("createCommunityOrder")) return;
    if (featureFlagsLoaded && REQUIRE_IDENTITY_VERIFICATION && !isVerified) {
      setError("Please verify your account before creating a community order or event.");
      setShowVerifyModal(true);
      return;
    }
    const parsedColPrice = parsePrice(createCollectionData.price);
    if (!createCollectionData.title.trim() || parsedColPrice === null) {
      setError("Tafadhali jaza kichwa na bei.");
      setTimeout(() => setError(""), 4000);
      return;
    }
    try {
      setUploading(true);
      const photoUrls = [];
      if (createCollectionData.photoFiles.length > 0) {
        for (let i = 0; i < createCollectionData.photoFiles.length; i++) {
          const original = createCollectionData.photoFiles[i];
          const { file } = await safeCompress(original, COMPRESSION_PRESETS.listing);
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
        communityName: createCollectionData.communityName.trim() || selectedUni.short,
        ...(createCollectionData.groupId ? { groupId: createCollectionData.groupId } : {}),
        communityType: createCollectionData.communityType || "class",
        collectionType: createCollectionData.collectionType || "order",
        title: createCollectionData.title.trim(),
        description: createCollectionData.desc.trim(),
        price: parsedColPrice,
        expectedPeople: createCollectionData.expectedPeople ? parseInt(createCollectionData.expectedPeople) : 0,
        options: optionsList,
        paymentMethods: createCollectionData.paymentMethods.filter(pm => pm.number.trim()).map(pm => ({ network: pm.network, number: pm.number.trim(), name: pm.name.trim() })),
        // Keep legacy fields for backwards compat
        payNumber: createCollectionData.paymentMethods[0]?.number?.trim() || "",
        payName: createCollectionData.paymentMethods[0]?.name?.trim() || "",
        payNetwork: createCollectionData.paymentMethods[0]?.network || "M-Pesa",
        adminEmails: createCollectionData.adminEmails.split(",").map(e => e.trim().toLowerCase()).filter(e => e),
        adminUserIds: [],
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
      setShowEntryQR(false);
      setShowCreateCollectionSuccess(true);
      setSuccess("Order / event created!");
      setCreateCollectionData({ title: "", desc: "", price: "", expectedPeople: "", options: "", paymentMethods: [], adminEmails: "", deadline: "", communityName: "", communityType: "class", collectionType: "order", groupId: "", photoFiles: [], photoPreviews: [] });
      loadCollections();
    } catch (err) {
      console.error("Error creating collection:", err);
      setError("Failed to create collection: " + err.message);
    } finally { setUploading(false); }
  };

  // Place order — just registers name, phone, option (no payment)
  const placeOrder = async (collectionItem) => {
    if (!user) { requireAuth("order", () => {}); return; }
    if (!orderFormData.studentName.trim()) { setError("Please enter your name"); return; }
    if (collectionItem.options?.length > 0 && !orderFormData.selectedOption) { setError("Please select an option"); return; }
    try {
      setUploading(true);
      const orderRef = await addDoc(collection(db, "collections", collectionItem.id, "orders"), {
        userId: user.uid,
        studentName: orderFormData.studentName.trim(),
        phone: orderFormData.phone.trim(),
        payerName: "",
        selectedOption: orderFormData.selectedOption || "",
        paymentRef: "",
        amount: collectionItem.price,
        amountPaid: 0,
        paid: false,
        status: "unpaid",
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, "collections", collectionItem.id), {
        totalOrders: increment(1),
        totalAmount: increment(collectionItem.price),
      });
      setMyOrderId(orderRef.id);
      const methods = collectionItem.paymentMethods || (collectionItem.payNumber ? [{ network: collectionItem.payNetwork || "Mobile Money", number: collectionItem.payNumber, name: collectionItem.payName }] : []);
      const payMsg = methods.length > 0 ? " Send " + collectionItem.price.toLocaleString() + " TSh to: " + methods.map(m => m.number + " (" + m.network + ")").join(" or ") + " and confirm below." : "";
      setSuccess("Order placed!" + payMsg);
      loadCollectionOrders(collectionItem.id);
      const updatedDoc = await getDoc(doc(db, "collections", collectionItem.id));
      if (updatedDoc.exists()) setViewingCollection({ id: updatedDoc.id, ...updatedDoc.data() });
    } catch (err) {
      console.error("Error placing order:", err);
      setError("Failed to place order: " + err.message);
    } finally { setUploading(false); }
  };

  // Confirm payment — updates an existing order with payment details
  const confirmPayment = async (collectionItem) => {
    if (!myOrderId) { setError("Place your order first"); return; }
    if (!orderFormData.amountPaid) { setError("Please enter amount paid"); return; }
    const amountPaid = parseInt(orderFormData.amountPaid) || 0;
    try {
      setUploading(true);
      let paymentProofUrl = null;
      if (orderFormData.paymentProofFile) {
        const { file } = await safeCompress(orderFormData.paymentProofFile, COMPRESSION_PRESETS.listing);
        const proofRef = ref(storage, `collection-payment-proofs/${collectionItem.id}/${user.uid}_${Date.now()}.jpg`);
        const proofSnap = await uploadBytes(proofRef, file);
        paymentProofUrl = await getDownloadURL(proofSnap.ref);
      }
      await updateDoc(doc(db, "collections", collectionItem.id, "orders", myOrderId), {
        amountPaid: amountPaid,
        payerName: (orderFormData.payerName || "").trim(),
        paymentRef: orderFormData.paymentRef.trim(),
        ...(paymentProofUrl ? { paymentProofUrl } : {}),
        paid: amountPaid >= collectionItem.price,
        status: amountPaid >= collectionItem.price ? "paid" : amountPaid > 0 ? "partial" : "unpaid",
      });
      if (amountPaid >= collectionItem.price) {
        await updateDoc(doc(db, "collections", collectionItem.id), {
          totalPaid: increment(1),
          totalCollected: increment(amountPaid)
        });
      } else {
        await updateDoc(doc(db, "collections", collectionItem.id), {
          totalCollected: increment(amountPaid)
        });
      }
      setSuccess("Payment confirmed! The rep can now verify your transaction.");
      setOrderFormData({ ...orderFormData, amountPaid: "", payerName: "", paymentRef: "", paymentProofFile: null, paymentProofPreview: null });
      setPaymentConfirmed(true);
      loadCollectionOrders(collectionItem.id);
      const updatedDoc = await getDoc(doc(db, "collections", collectionItem.id));
      if (updatedDoc.exists()) setViewingCollection({ id: updatedDoc.id, ...updatedDoc.data() });
    } catch (err) {
      console.error("Error confirming payment:", err);
      setError("Failed to confirm payment: " + err.message);
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
      loadCollectionOrders(collectionId);
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
      loadCollections();
    } catch (err) { setError("Failed to update: " + err.message); }
  };

  const deleteCollection = async (collectionId) => {
    if (!window.confirm("Delete this collection permanently? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, "collections", collectionId));
      setViewingCollection(null);
      setCollectionOrders([]);
      setPage("communities");
      setSuccess("Collection deleted.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError("Failed to delete: " + err.message);
    }
  };

  const closeCollection = async (collectionId) => {
    if (!window.confirm("Close this collection? No new orders will be accepted.")) return;
    try {
      await updateDoc(doc(db, "collections", collectionId), { active: false });
      loadCollections();
      setViewingCollection(null);
      setCollectionOrders([]);
      setPage("communities");
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
  const handlePaymentProofSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Payment proof must be an image"); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Payment proof must be under 5MB"); return; }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setOrderFormData(prev => ({
        ...prev,
        paymentProofFile: file,
        paymentProofPreview: ev.target.result
      }));
    };
    reader.readAsDataURL(file);
  };

 const handleUpdateProfile = async () => {
  if (!user) return;
  
  try {
    setUploading(true);
    setError("");
    
    let avatarUrl = userAvatar;
    if (editProfileData.avatarFile) {
      const { file: compressedAvatar } = await safeCompress(editProfileData.avatarFile, COMPRESSION_PRESETS.avatar);
      const storageRef = ref(storage, `avatars/${user.uid}/${Date.now()}.jpg`);
      const snapshot = await uploadBytes(storageRef, compressedAvatar);
      avatarUrl = await getDownloadURL(snapshot.ref);
    } else if (editProfileData.avatarPreset) {
      avatarUrl = makeInitialAvatarUrl(editProfileData.name || userName, editProfileData.avatarPreset);
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
    
    // 5. Update user's services
const servicesQuery = query(
  collection(db, "services"),
  where("userId", "==", user.uid)
);
const servicesSnap = await getDocs(servicesQuery);
const serviceUpdates = servicesSnap.docs.map(d =>
  updateDoc(doc(db, "services", d.id), {
    ...(updateData.name && { userName: updateData.name }),
    ...(avatarUrl && { userAvatar: avatarUrl })
  })
);

// 6. Update user's collections
const collectionsQuery = query(
  collection(db, "collections"),
  where("userId", "==", user.uid)
);
const collectionsSnap = await getDocs(collectionsQuery);
const collectionUpdates = collectionsSnap.docs.map(d =>
  updateDoc(doc(db, "collections", d.id), {
    ...(updateData.name && { userName: updateData.name }),
    ...(avatarUrl && { userAvatar: avatarUrl })
  })
);

// 7. Update roommate posts
const roommatePostsQuery = query(
  collection(db, "roommatePosts"),
  where("userId", "==", user.uid)
);
const roommatePostsSnap = await getDocs(roommatePostsQuery);
const roommatePostUpdates = roommatePostsSnap.docs.map(d =>
  updateDoc(doc(db, "roommatePosts", d.id), {
    ...(updateData.name && { userName: updateData.name }),
    ...(avatarUrl && { userAvatar: avatarUrl })
  })
);

// 8. Update rooms listed by this user
const roomsQuery = query(
  collection(db, "rooms"),
  where("listedBy", "==", user.uid)
);
const roomsSnap = await getDocs(roomsQuery);
const roomUpdates = roomsSnap.docs.map(d =>
  updateDoc(doc(db, "rooms", d.id), {
    ...(updateData.name && { listedByName: updateData.name }),
    ...(avatarUrl && { listedByAvatar: avatarUrl })
  })
);

// 9. Update university group member profiles
const groupMembersQuery = query(
  collectionGroup(db, "members"),
  where("uid", "==", user.uid)
);
const groupMembersSnap = await getDocs(groupMembersQuery);
const groupMemberUpdates = groupMembersSnap.docs.map(d =>
  updateDoc(d.ref, {
    ...(updateData.name && { name: updateData.name }),
    ...(avatarUrl && { avatarUrl })
  })
);

// Run all updates in parallel
await Promise.all([
  ...listingUpdates,
  ...buyerUpdates,
  ...sellerUpdates,
  ...serviceUpdates,
  ...collectionUpdates,
  ...roommatePostUpdates,
  ...roomUpdates,
  ...groupMemberUpdates
]);
    
    // 5. Update local state
    if (updateData.name) setUserName(updateData.name);
    if (avatarUrl) setUserAvatar(avatarUrl);
    setUserBio(updateData.bio);
    setUserServices(updateData.services);
    
    setShowEditProfile(false);
    setEditProfileData({ name: "", bio: "", services: [], avatarFile: null, avatarPreview: null, avatarPreset: null });
    setSuccess("Profile updated everywhere!");
    
    // Reload to reflect changes
    loadListings();
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
    setError(userAccountType === "provider"
      ? "Tafadhali pakia picha ya kitambulisho cha NIDA"
      : "Tafadhali pakia picha ya kitambulisho cha mwanafunzi");
    setTimeout(() => setError(""), 4000);
    return;
  }
  if (!nameOnIdInput.trim()) {
    setError("Tafadhali andika jina lako kama lilivyo kwenye kitambulisho");
    setTimeout(() => setError(""), 4000);
    return;
  }
  // For providers, require NIDA number too
  if (userAccountType === "provider" && !nidaNumberInput.trim()) {
    setError("Tafadhali andika namba yako ya NIDA");
    setTimeout(() => setError(""), 4000);
    return;
  }
  
  try {
    setUploading(true);
    setError("");
    
    // Check if already submitted (allow resubmit if rejected)
    const existingQuery = query(
      collection(db, "verificationRequests"),
      where("userId", "==", user.uid)
    );
    const existingSnapshot = await getDocs(existingQuery);
    
    if (!existingSnapshot.empty) {
      const existingRequest = existingSnapshot.docs[0].data();
      if (existingRequest.status === "pending") {
        setError("Una ombi linaloendelea kuangaliwa");
        setUploading(false);
        return;
      }
      if (existingRequest.status === "approved") {
        setError("Akaunti yako tayari imethibitishwa");
        setUploading(false);
        return;
      }
    }
    
    // Upload the ID image (compressed; receipt preset preserves legibility)
    const { file: compressedId } = await safeCompress(studentIdFile, COMPRESSION_PRESETS.receipt);
    const idType = userAccountType === "provider" ? "nida" : "studentId";
    const storageRef = ref(storage, `verification/${user.uid}/${idType}_${Date.now()}.jpg`);
    const snapshot = await uploadBytes(storageRef, compressedId);
    const idUrl = await getDownloadURL(snapshot.ref);

    // Create verification request — different shape for student vs provider
    const request = {
      userId: user.uid,
      userName: userName,
      email: user.email,
      phone: userPhone || "",
      accountType: userAccountType || "student",
      nameOnId: nameOnIdInput.trim(),
      idUrl: idUrl,
      status: "pending",
      submittedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };
    if (userAccountType === "provider") {
      request.nidaNumber = nidaNumberInput.trim();
      request.providerLocation = userProviderLocation || "";
    } else {
      request.universityId = selectedUni.id;
      request.universityName = selectedUni.short;
      request.studentIdUrl = idUrl; // keep legacy field for backward compat
    }

    await addDoc(collection(db, "verificationRequests"), request);
    
    setVerificationStatus("pending");
    setShowVerifyModal(false);
    setStudentIdFile(null);
    setStudentIdPreview(null);
    setNidaNumberInput("");
    setNameOnIdInput("");
    setSuccess("✓ Ombi limepokelewa! Tutakuthibitisha ndani ya saa 24-48.");
    setTimeout(() => setSuccess(""), 5000);
  } catch (err) {
    console.error("Verification submit failed:", err);
    setError("Imeshindwa. Jaribu tena.");
    setTimeout(() => setError(""), 4000);
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
      loadListings();
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
    loadListings();
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
  // Note: expiry was removed. All user listings appear under "Active" regardless of age.
  // To re-enable expiry someday: restore `isExpired` checks and a TTL field.
  const myActiveListings = listings.filter(l => l.userId === user?.uid);
  const myServices = services.filter(s => s.userId === user?.uid);
  const currentUniId = selectedUni?.id || "aru";
  const canSeeInviteOnlyGroup = (group) => (
    !!user?.uid
    && (
      group.ownerUid === user.uid
      || group.adminUid === user.uid
      || (group.coAdmins || []).includes(user.email)
      || !!myGroupMemberships[group.id]
    )
  );
  const isGroupVisibleInDirectory = (group) => (
    group.visibility !== "inviteOnly"
    && group.joinPolicy !== "inviteOnly"
  ) || canSeeInviteOnlyGroup(group);
  const groupsForSelectedUni = groups.filter(group => (
    group.active !== false
    && (group.uniId || currentUniId) === currentUniId
    && isGroupVisibleInDirectory(group)
  ));
  const publicEventsForGroups = publicGroupEvents.filter(eventItem => (
    (eventItem.uniId || currentUniId) === currentUniId
    && groupsForSelectedUni.some(group => group.id === eventItem.groupId)
  ));

if (loading) {
  return (
    <div style={{
      minHeight:'100vh',
      height:'100dvh',
      background:'#0f1b2d',
      fontFamily:'system-ui',
      overflow:'hidden',
      display:'flex',
      alignItems:'center',
      justifyContent:'center',
      padding:'24px',
      boxSizing:'border-box'
    }}>
      <style>{`
        @keyframes loadingBar {
          0% { transform: translateX(-70px); }
          50% { transform: translateX(150px); }
          100% { transform: translateX(-70px); }
        }
      `}</style>
      <div style={{
        display:'flex',
        flexDirection:'column',
        alignItems:'center',
        justifyContent:'center',
        width:'100%',
        maxWidth:'260px',
        minHeight:'220px',
        textAlign:'center'
      }}>
        <div style={{
          width:'48px',
          height:'48px',
          borderRadius:'14px',
          background:'#06d6c7',
          color:'#0f1b2d',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          fontSize:'22px',
          fontWeight:'900',
          marginBottom:'18px',
          boxShadow:'0 10px 30px rgba(6,214,199,0.24)'
        }}>
          K
        </div>
        <div style={{
          fontFamily:'serif',
          fontSize:'31px',
          fontWeight:'800',
          color:'#fff',
          letterSpacing:'0',
          lineHeight:1,
          marginBottom:'18px'
        }}>
          Kam<em style={{color:'#06d6c7'}}>pa</em>sika
        </div>
        <div style={{
          width:'138px',
          height:'4px',
          borderRadius:'999px',
          background:'rgba(255,255,255,0.16)',
          overflow:'hidden'
        }}>
          <div style={{
            width:'58px',
            height:'100%',
            borderRadius:'999px',
            background:'#06d6c7',
            animation:'loadingBar 1.15s ease-in-out infinite'
          }} />
        </div>
      </div>
    </div>
  );
}

  const getFirstName = () => {
    const name = userName || user?.displayName || user?.email || "Friend";
    return name.split(" ")[0].split("@")[0].toUpperCase();
  };

  const getTimeGreeting = () => {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) {
      return "ZA ASUBUHI";
    }

    if (hour >= 12 && hour < 17) {
      return "ZA MCHANA";
    }

    if (hour >= 17 && hour < 22) {
      return "ZA JIONI";
    }

    return "KARIBU TENA";
  };

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
        -webkit-tap-highlight-color: transparent;
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
      {isOffline && !offlineBannerDismissed && (
        <div
          style={{
            margin: '10px 12px 0',
            background: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #a7f3d0',
            padding: '10px 38px 10px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            lineHeight: 1.35,
            flexShrink: 0,
            zIndex: 80,
            boxShadow: '0 8px 20px rgba(6, 95, 70, 0.08)',
            position: 'relative'
          }}
        >
          <strong style={{ display: 'block', marginBottom: '2px' }}>Offline mode</strong>
          Showing saved group data on this device. New updates, messages, and submissions will sync when internet returns.
          <button
            type="button"
            aria-label="Dismiss offline message"
            onClick={() => setOfflineBannerDismissed(true)}
            style={{
              position:'absolute',
              top:'7px',
              right:'8px',
              width:'24px',
              height:'24px',
              border:'none',
              borderRadius:'50%',
              background:'rgba(6,95,70,0.1)',
              color:'#065f46',
              fontSize:'16px',
              lineHeight:1,
              cursor:'pointer'
            }}
          >
            ×
          </button>
        </div>
      )}

      {showNotificationBanner && !isOffline && (
        <div
          style={{
            margin: '10px 12px 0',
            background: '#fff',
            color: '#0f1b2d',
            border: '1px solid #dbe8e7',
            padding: '11px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            lineHeight: 1.35,
            flexShrink: 0,
            zIndex: 80,
            boxShadow: '0 10px 24px rgba(15, 27, 45, 0.1)',
            display:'flex',
            alignItems:'center',
            gap:'10px'
          }}
        >
          <div style={{minWidth:0, flex:1}}>
            <strong style={{ display: 'block', marginBottom: '2px' }}>Enable notifications</strong>
            <span style={{color:'#486171'}}>Usipitwe na updates za group, messages, submissions na events.</span>
          </div>
          <button
            type="button"
            onClick={() => requestNotificationPermission(user)}
            style={{border:'none',borderRadius:'8px',background:'#0d9488',color:'#fff',fontSize:'12px',fontWeight:'800',padding:'8px 10px',cursor:'pointer',whiteSpace:'nowrap'}}
          >
            Enable
          </button>
          <button
            type="button"
            aria-label="Dismiss notification prompt"
            onClick={dismissNotificationBanner}
            style={{border:'none',background:'transparent',color:'#667085',fontSize:'18px',lineHeight:1,cursor:'pointer',padding:'4px'}}
          >
            ×
          </button>
        </div>
      )}

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
    {page !== "chat" && page !== "groupDetail" && page !== "communities" && (
  <div
    style={{
      background:'#fff',
      padding:'6px 10px',
      display:'flex',
      alignItems:'center',
      gap:'4px',
      borderBottom:'none',
      flexShrink:0,
      zIndex:50
    }}
  >
    {(page==="home"||page==="create"||page==="profile"||page==="messages"||page==="saved"||page==="seller"||page==="services"||page==="createService"||page==="communityDetail"||page==="collections"||page==="createCollection"||page==="collectionDetail"||page==="rooms"||page==="createRoom"||page==="roommates"||page==="admin"||page==="groupDetail") && (
      <button
        onClick={()=>{
          if (page==="seller") closeSellerProfile();
          else if (page==="collectionDetail") { if (unsubCollectionOrders.current) unsubCollectionOrders.current(); setViewingCollection(null); setCollectionOrders([]); goBack(); }
          else if (page==="groupDetail") {
            if (groupInternalBackRef.current?.()) return;
            closeGroupDetail();
          }
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

 <div style={{display:'flex',alignItems:'center',gap:'4px',flexShrink:0}}>
  {false && page==="home" && user ? (
    <>
      <div style={{position:'relative'}}>
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setShowAppMenu(v => !v)}
          style={{
            width:'40px',
            height:'40px',
            borderRadius:'50%',
            border:'1.5px solid #dbe3ea',
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            color:'#0d9488',
            fontSize:'18px',
            background:'#fff',
            cursor:'pointer',
            padding:0
          }}
        >
          ✧
        </button>
        {showAppMenu && (
          <>
            <div
              style={{position:'fixed',inset:0,zIndex:150}}
              onClick={() => setShowAppMenu(false)}
            />
            <div style={{
              position:'absolute',
              top:'46px',
              left:0,
              zIndex:151,
              background:'#fff',
              borderRadius:'12px',
              boxShadow:'0 8px 24px rgba(15,27,45,0.15)',
              border:'1px solid #e2e6ea',
              minWidth:'168px',
              overflow:'hidden'
            }}>
              <button
                type="button"
                onClick={() => {
                  setShowAppMenu(false);
                  setShowAboutBanner(false);
                  if (isVerified) {
                    setShowGetVerifiedBanner(false);
                    setShowVerifiedBanner(true);
                  } else {
                    setShowVerifiedBanner(false);
                    setShowGetVerifiedBanner(true);
                  }
                }}
                style={{
                  width:'100%',
                  padding:'12px 16px',
                  border:'none',
                  background:'none',
                  textAlign:'left',
                  fontSize:'14px',
                  fontWeight:'600',
                  color:'#0f1b2d',
                  cursor:'pointer'
                }}
              >
                {isVerified ? '✓ Uko Verified' : '✓ Get Verified'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAppMenu(false);
                  setShowAboutBanner(true);
                  if (page !== 'profile') setPage('profile');
                }}
                style={{
                  width:'100%',
                  padding:'12px 16px',
                  border:'none',
                  borderTop:'1px solid #f0f2f5',
                  background:'none',
                  textAlign:'left',
                  fontSize:'14px',
                  fontWeight:'600',
                  color:'#0f1b2d',
                  cursor:'pointer'
                }}
              >
                ℹ About
              </button>
            </div>
          </>
        )}
      </div>

      <div style={{
        minWidth:'94px',
        height:'40px',
        padding:'0 12px',
        boxSizing:'border-box',
        display:'flex',
        flexDirection:'column',
        alignItems:'center',
        justifyContent:'center',
        borderRadius:'999px',
        border:'1.5px solid #dbe3ea',
        background:'#fff',
        lineHeight:1.05,
        textAlign:'center',
        fontFamily:'Kalam'
      }}>
        <div style={{fontSize:'11px',fontWeight:'700',color:'#0f1b2d'}}>
          {getTimeGreeting()}
        </div>
        <div style={{fontSize:'14px',fontWeight:'700',color:'#0d9488'}}>
          {getFirstName()}
        </div>
      </div>
    </>
  ) : page==="chat" && activeConversation ? (
    activeConversation.listingTitle.substring(0,20) + (activeConversation.listingTitle.length > 20 ? "..." : "")
  ) : page==="groupDetail" || page==="home" ? (
    null
  ) : (
    <div style={{fontFamily:'serif',fontSize:'20px',fontWeight:'700',color:'#0f1b2d'}}>
      Kam<em style={{color:'#06d6c7'}}>pa</em>sika
    </div>
  )}
</div>

    {page==="home" && (
     <div style={{
  flex:1,
  minWidth:0,
  display:'flex',
  alignItems:'center',
  gap:'10px',
  background:'#fff',
  height:'40px',
  borderRadius:'999px',
  padding:'0 12px',
  marginLeft:'4px',
  boxSizing:'border-box',
  border:'1.5px solid #dbe3ea',
  transition:'all 0.2s ease'
}}>
      
        <input
          type="text"
          placeholder={SEARCH_EXAMPLES[placeholderIdx]}
          value={searchQ}
          onChange={e => {
            setSearchQ(e.target.value);
            // If user clears the box, clear any committed search & AI state too
            if (!e.target.value.trim()) {
              setCommittedSearchQ("");
              clearAISearch();
            }
          }}
          onKeyDown={e => { if (e.key === 'Enter') commitListingsSearch(searchQ); }}
          style={{flex:1,minWidth:0,border:'none',background:'none',outline:'none',fontSize:'14px',fontWeight:'400',color:'#0f1b2d'}}
        />
        <button
          type="button"
          onClick={() => commitListingsSearch(searchQ)}
          aria-label="Search"
          style={{
            width:'30px',height:'30px',borderRadius:'50%',
            background:'transparent',border:'none',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',
            flexShrink:0,padding:0,color:'#6b7280'
          }}>
          🔍
        </button>
      </div>
      
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

         {false && showAboutBanner && (
  <div style={{margin:'0 16px 12px 16px'}}>
  <div style={{
    position:'relative',
    borderRadius:'14px',
    marginBottom:'0',
    overflow:'hidden',
    boxShadow:'0 4px 16px rgba(15,27,45,0.14)',
    border:'1px solid rgba(6,214,199,0.2)',
    maxHeight:'22vh'
  }}>
    <div style={{
      position:'absolute',
      inset:0,
      background:'linear-gradient(135deg, #0f1b2d 0%, #0d9488 100%)'
    }} />
    <div style={{position:'relative',padding:'12px 14px',display:'flex',alignItems:'flex-start',gap:'10px'}}>
      <div style={{
        width:'36px',
        height:'36px',
        minWidth:'36px',
        minHeight:'36px',
        borderRadius:'50%',
        background:'rgba(255,255,255,0.15)',
        display:'flex',
        alignItems:'center',
        justifyContent:'center',
        fontSize:'16px',
        flexShrink:0
      }}>✧</div>
      <div style={{flex:1,minWidth:0,paddingRight:'28px'}}>
        <div style={{fontFamily:'serif',fontSize:'17px',fontWeight:'700',color:'#fff',lineHeight:1.2,marginBottom:'4px'}}>
          Kam<em style={{color:'#5eead4',fontStyle:'normal'}}>pa</em>sika
        </div>
        <p style={{color:'rgba(255,255,255,0.9)',fontSize:'11px',lineHeight:'1.45',margin:0}}>
          Mtandao wa wanachuo — ambapo unaweza kununua, kuuza, kutoa huduma, na kukutana na jamii za chuo. Salama na haraka.
        </p>
        <div style={{display:'flex',flexWrap:'wrap',gap:'4px',marginTop:'8px'}}>
          {['Goods', 'Services', 'Communities', 'Verified'].map(tag => (
            <span key={tag} style={{fontSize:'9px',fontWeight:'700',color:'#fff',background:'rgba(255,255,255,0.12)',padding:'3px 7px',borderRadius:'6px'}}>{tag}</span>
          ))}
        </div>
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={() => setShowAboutBanner(false)}
        style={{
          position:'absolute',
          top:'10px',
          right:'10px',
          background:'rgba(255,255,255,0.12)',
          border:'none',
          borderRadius:'50%',
          width:'24px',
          height:'24px',
          color:'#fff',
          cursor:'pointer',
          fontSize:'14px',
          lineHeight:1
        }}
      >×</button>
    </div>
  </div>
  </div>
)}

{/* ── SLIM STRIP: already verified ── */}
{false && showVerifiedBanner && (
  <div style={{margin:'0 16px 8px 16px'}}>
    {/* Slim strip at top */}
    <div style={{
      display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'8px 14px',
      background:'linear-gradient(90deg,#0d9488,#0f766e)',
      borderRadius:'10px 10px 0 0'
    }}>
      <span style={{fontSize:'12px',fontWeight:'700',color:'#fff',display:'flex',alignItems:'center',gap:'6px'}}>
        ✦ Uko Verified — akaunti yako imethibitishwa
      </span>
      <button type="button" onClick={()=>setShowVerifiedBanner(false)} style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:'50%',width:'20px',height:'20px',color:'#fff',cursor:'pointer',fontSize:'12px',lineHeight:1,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
    </div>
    {/* Full card below strip */}
    <div style={{
      background:'linear-gradient(135deg,#042f2e 0%,#134e4a 60%,#0f766e 100%)',
      borderRadius:'0 0 14px 14px',
      padding:'16px 16px 18px',
      position:'relative',
      overflow:'hidden'
    }}>
      {/* decorative circle */}
      <div style={{position:'absolute',top:'-20px',right:'-20px',width:'100px',height:'100px',borderRadius:'50%',background:'rgba(255,255,255,0.05)'}} />
      <div style={{display:'flex',alignItems:'flex-start',gap:'14px'}}>
        <div style={{width:'44px',height:'44px',minWidth:'44px',borderRadius:'14px',background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'22px',flexShrink:0}}>🏆</div>
        <div style={{flex:1}}>
          <div style={{fontSize:'17px',fontWeight:'800',color:'#fff',marginBottom:'4px',lineHeight:1.2}}>Uko Verified! 🎉</div>
          <p style={{color:'rgba(255,255,255,0.85)',fontSize:'12px',lineHeight:'1.55',margin:'0 0 12px'}}>
            Listings na huduma zako zinaonyesha badge ya uthibitisho — wanunuzi wanakuamini zaidi, na unauza haraka zaidi.
          </p>
          <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
            {['🏅 Trusted badge', '👁 More views', '⚡ Faster sales'].map(b => (
              <span key={b} style={{fontSize:'10px',fontWeight:'700',color:'#5eead4',background:'rgba(255,255,255,0.1)',padding:'4px 9px',borderRadius:'8px'}}>{b}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
)}

{/* ── GET VERIFIED: unverified user banner ── */}
{false && showGetVerifiedBanner && (
  <div style={{margin:'0 16px 8px 16px'}}>
    {/* Slim orange strip */}
    <div style={{
      display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'8px 14px',
      background:'linear-gradient(90deg,#0ea5a0,#06d6c7)',
      borderRadius:'10px 10px 0 0'
    }}>
      <span style={{fontSize:'12px',fontWeight:'700',color:'#fff',display:'flex',alignItems:'center',gap:'6px'}}>
        ⚡ Thibitisha akaunti yako — inakuwezesha kuuza zaidi
      </span>
      <button type="button" onClick={()=>setShowGetVerifiedBanner(false)} style={{background:'rgba(255,255,255,0.2)',border:'none',borderRadius:'50%',width:'20px',height:'20px',color:'#fff',cursor:'pointer',fontSize:'12px',lineHeight:1,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
    </div>
    {/* Full card */}
    <div style={{
      background:'linear-gradient(135deg,#042f2e 0%,#0f766e 55%,#0ea5a0 100%)',
      borderRadius:'0 0 14px 14px',
      padding:'16px 16px 18px',
      position:'relative',
      overflow:'hidden'
    }}>
      <div style={{position:'absolute',top:'-20px',right:'-20px',width:'100px',height:'100px',borderRadius:'50%',background:'rgba(255,255,255,0.05)'}} />
      <div style={{display:'flex',alignItems:'flex-start',gap:'14px',marginBottom:'14px'}}>
        <div style={{width:'44px',height:'44px',minWidth:'44px',borderRadius:'14px',background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'22px',flexShrink:0}}>🛡️</div>
        <div style={{flex:1}}>
          <div style={{fontSize:'17px',fontWeight:'800',color:'#fff',marginBottom:'4px',lineHeight:1.2}}>Pata Verified Badge</div>
          <p style={{color:'rgba(255,255,255,0.85)',fontSize:'12px',lineHeight:'1.55',margin:0}}>
            Wanunuzi wanakuamini zaidi ukiwa na badge. Listings zako zinaonekana juu zaidi — inahitaji dakika chache tu.
          </p>
        </div>
      </div>
      <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'14px'}}>
        {['🏅 Verified badge', '👁 More visibility', '💬 More messages', '⚡ Faster sales'].map(b => (
          <span key={b} style={{fontSize:'10px',fontWeight:'700',color:'#99f0ee',background:'rgba(255,255,255,0.12)',padding:'4px 9px',borderRadius:'8px'}}>{b}</span>
        ))}
      </div>
      <button
        type="button"
        onClick={()=>{ setShowGetVerifiedBanner(false); setShowVerifyModal(true); }}
        style={{
          width:'100%',padding:'12px',
          background:'linear-gradient(135deg,#06d6c7,#5eead4)',
          color:'#fff',border:'none',borderRadius:'10px',
          fontSize:'14px',fontWeight:'800',cursor:'pointer',
          boxShadow:'0 4px 14px rgba(6,214,199,0.4)',
          letterSpacing:'0.3px'
        }}
      >
        Anza Sasa — Thibitisha Akaunti →
      </button>
    </div>
  </div>
)}

{/* ===== AIRBNB-STYLE TOP TAB BAR ===== */}
<div style={{
  display:'flex',
  justifyContent:'center',
  gap:'0',
  borderBottom:'none',
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
      padding: tabIconsVisible ? '5px 0 3px 0' : '7px 0 4px 0',
      background:'none',
      border:'none',
      borderBottom: 'none',
      cursor:'pointer',
      transition:'all 0.25s cubic-bezier(0.4,0,0.2,1)'
    }}>
      {tabIconsVisible && <span style={{fontSize:'20px',opacity:homeTab===tab.id?1:0.4,transition:'opacity 0.2s ease'}}>{tab.icon}</span>}
     <span style={{
  fontSize: tabIconsVisible ? '10px' : '13px',
  fontWeight: homeTab===tab.id ? '700' : '500',
  color: homeTab===tab.id ? '#0f1b2d' : '#8a9bb0',
  transition:'all 0.2s ease',
  position:'relative',
  paddingBottom:'4px'
}}>
  {tab.label}
  {homeTab===tab.id && (
    <span style={{
      position:'absolute',
      left:'50%',
      bottom:0,
      transform:'translateX(-50%)',
      width:'100%',
      height:'3px',
      borderRadius:'999px',
      background:'#0f1b2d'
    }} />
  )}
</span>
    </button>
  ))}
</div>
<AISearchBadge
  parsed={aiParsed}
  isAIActive={isAIActive}
  onClear={() => { clearAISearch(); setSearchQ(""); setCommittedSearchQ(""); }}
/>
{aiSearching && (
  <div style={{padding:'8px 16px',fontSize:'12px',color:'#0d9488'}}>
    ✨ AI is thinking...
  </div>
)}
{featureFlagsLoaded && REQUIRE_IDENTITY_VERIFICATION && user && profileLoaded && !isVerified && (
  <div style={{margin:'0 16px 12px 16px',background:'#eef2ff',border:'1px solid #c7d2fe',borderRadius:'14px',padding:'11px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'10px',boxShadow:'0 2px 10px rgba(79,70,229,0.08)'}}>
    <div style={{display:'flex',alignItems:'center',gap:'10px',minWidth:0}}>
      <div style={{width:'32px',height:'32px',borderRadius:'10px',background:'#0d9488',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'15px',flexShrink:0}}>✓</div>
      <div style={{minWidth:0}}>
        <div style={{fontSize:'13px',fontWeight:'700',color:'#0f1b2d',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Verify your identity</div>
        <div style={{fontSize:'10px',color:'rgba(15,27,45,0.58)',marginTop:'1px'}}>Required before using main app features</div>
      </div>
    </div>
    <button type="button" onClick={()=>setShowVerifyModal(true)} style={{padding:'7px 10px',background:'#0d9488',color:'#fff',border:'none',borderRadius:'10px',fontSize:'11px',fontWeight:'800',cursor:'pointer',whiteSpace:'nowrap',flexShrink:0}}>Verify</button>
  </div>
)}
{/* ===== GOODS TAB CONTENT ===== */}
<div style={{display: homeTab==="goods" ? "block" : "none"}}>
<div style={{display:'flex',gap:'8px',marginBottom:'16px',overflowX:'auto',paddingBottom:'4px',margin:'0 12px 10px 12px',boxSizing:'border-box',width:'calc(100% - 24px)',scrollbarWidth:'none',msOverflowStyle:'none'}}>{CATEGORIES.map(c=><button key={c.id} onClick={()=>setActiveCat(c.id)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 16px',background:activeCat===c.id?'#0f1b2d':'#fff',color:activeCat===c.id?'#fff':'#0f1b2d',border:activeCat===c.id?'none':'1.5px solid #e2e6ea',borderRadius:'22px',fontSize:'12px',fontWeight:activeCat===c.id?'600':'500',cursor:'pointer',whiteSpace:'nowrap',boxShadow:activeCat===c.id?'0 2px 8px rgba(15,27,45,0.2)':'none',transition:'all 0.2s ease'}}>{c.icon} {c.name}</button>)}</div>

    {(() => {
  let filteredListings = listings;
  if (activeCat !== "all") {
    filteredListings = filteredListings.filter(item => item.category === activeCat);
  }
  // Only apply search filter when AI has finished (or wasn't needed).
  // While AI is thinking, keep the unfiltered list visible — avoids a flash of empty state.
  if (!aiSearching) {
    if (aiParsed && committedSearchQ.trim()) {
      filteredListings = filterListings(filteredListings, aiParsed);
    } else if (committedSearchQ.trim()) {
      const q = committedSearchQ.toLowerCase();
      filteredListings = filteredListings.filter(item =>
        item.title.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
      );
    }
  }
  return (
<div style={{display:'flex',flexDirection:'column',margin:'0 16px',boxSizing:'border-box',width:'calc(100% - 32px)'}}>
            {filteredListings.length===0?(
              <EmptyResults kind="listing" query={committedSearchQ} parsedFilters={aiParsed?.filters}
                fallbackTitle="No listings yet" fallbackHint={`Be the first to post in ${selectedUni?.short}!`} />
            ):(
              filteredListings.map((item,idx)=>(
                <div key={item.id} onClick={()=>setOpenListingId(openListingId===item.id?null:item.id)} style={{background:'#fff',marginBottom:'12px',padding:'16px',cursor:'pointer',opacity:item.sold?0.5:1,borderRadius:'16px',border:openListingId===item.id?'1.5px solid #06d6c7':'1px solid #f0f0f0',boxShadow:openListingId===item.id?'0 4px 16px rgba(6,214,199,0.12)':'0 1px 6px rgba(0,0,0,0.04)',transition:'border 0.15s ease,box-shadow 0.15s ease'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
                    <div onClick={(e)=>{e.stopPropagation();openSellerProfile(item);}} style={{width:'36px',height:'36px',minWidth:'36px',minHeight:'36px',flexShrink:0,aspectRatio:'1 / 1',borderRadius:'50%',overflow:'hidden',backgroundImage:item.userAvatar?`url(${item.userAvatar})`:'none',backgroundSize:'cover',backgroundPosition:'center',backgroundColor:!item.userAvatar?'#06d6c7':'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:'700',color:'#fff',cursor:'pointer'}}>{!item.userAvatar&&(item.userName||"?").split(" ").map(n=>n[0]).join("")}</div>
                    <span onClick={(e)=>{e.stopPropagation();openSellerProfile(item);}} style={{fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>{item.userName}</span>
                    {item.userIsVerified && (
                      <VerifiedBadge user={{ isVerified: true, verificationBadge: item.userVerificationBadge || "student" }} size="xs" />
                    )}
                    <span style={{fontSize:'11px',color:'#8a9bb0',background:'#f4f6f8',padding:'2px 8px',borderRadius:'8px'}}>{item.universityName}</span>
                    {item.location && <span style={{fontSize:'11px',color:'#8a9bb0',background:'#f4f6f8',padding:'2px 8px',borderRadius:'8px'}}>📍 {item.location}</span>}
                    <span style={{fontSize:'11px',color:'#8a9bb0',marginLeft:'auto'}}>{item.createdAt?new Date(item.createdAt).toLocaleDateString():"Recently"}</span>
                  </div>
                  <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'4px'}}>{item.title}</div>
                  {item.description && <div style={{fontSize:'13px',color:'#4a5568',marginBottom:'10px',lineHeight:1.5}}>{item.description}</div>}
               {(item.photos && item.photos.length > 0) ? (
  <div style={{marginBottom:'10px'}}>
    {item.photos.length === 1 ? (
      /* Single photo — full width */
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
        style={{width:'100%',height:'280px',objectFit:'cover',borderRadius:'14px',cursor:'pointer',display:'block'}}
      />
    ) : (
      /* Multiple photos — horizontal scroll strip */
      <div style={{position:'relative'}}>
        <div style={{
          display:'flex',
          gap:'6px',
          overflowX:'auto',
          scrollbarWidth:'none',
          msOverflowStyle:'none',
          borderRadius:'14px',
          WebkitOverflowScrolling:'touch'
        }}>
          {item.photos.map((photo, idx) => (
            <div key={idx} style={{position:'relative',flexShrink:0}}>
              <img
                src={photo}
                alt=""
                loading="lazy"
                onClick={(e) => {
                  e.stopPropagation();
                  setFullScreenImage(photo);
                  setFullScreenPhotos(item.photos);
                  setFullScreenIndex(idx);
                  incrementViews(item.id);
                }}
                style={{
                  width: item.photos.length === 2 ? 'calc(50vw - 30px)' : item.photos.length === 3 ? 'calc(33vw - 16px)' : '140px',
                  height:'200px',
                  objectFit:'cover',
                  borderRadius:'12px',
                  cursor:'pointer',
                  display:'block'
                }}
              />
              {/* photo count pill on last visible */}
              {idx === 0 && item.photos.length > 3 && (
                <div style={{position:'absolute',bottom:'6px',right:'6px',background:'rgba(0,0,0,0.55)',color:'#fff',fontSize:'10px',fontWeight:'700',padding:'2px 7px',borderRadius:'8px'}}>
                  +{item.photos.length - 1} photos
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )}
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
          <div style={{paddingTop:'10px',borderTop:'1px solid #e2e6ea'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',marginBottom: openListingId===item.id ? '10px' : '0'}}>
              <div style={{fontFamily:'serif',fontSize:'20px',fontWeight:'700',lineHeight:1.1}}>{item.price.toLocaleString()} TSh</div>
              {SHOW_PRICE_SIGNAL && <PriceSignalBadge signal={computePriceSignal(item, listings, "listing")} compact />}
              {openListingId!==item.id && <span style={{fontSize:'11px',color:'#8a9bb0',marginLeft:'auto'}}>Tap for options</span>}
            </div>

            {openListingId===item.id && (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(68px, 1fr))',gap:'6px',width:'100%'}}>
                {item.whatsapp && item.userId !== user?.uid && (
                  <button onClick={(e)=>{e.stopPropagation();const num=item.whatsapp.replace(/^0/,'255').replace(/[^0-9]/g,'');const msg=`Hi! I'm interested in your listing "${item.title}" on Kampasika for ${item.price.toLocaleString()} TSh.`;window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,'_blank');}} style={{minWidth:0,padding:'9px 6px',background:'#25D366',color:'#fff',border:'none',borderRadius:'9px',fontSize:'12px',fontWeight:'800',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'4px',whiteSpace:'nowrap'}}>
                    <WhatsAppIcon size={15} /><span>WhatsApp</span>
                  </button>
                )}
                <button onClick={(e)=>{e.stopPropagation();shareOnWhatsApp(item);}} style={{minWidth:0,padding:'9px 6px',background:'#f4f6f8',color:'#0f1b2d',border:'none',borderRadius:'9px',fontSize:'12px',fontWeight:'800',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'4px',whiteSpace:'nowrap'}}>
                  <span>📲</span><span>Share</span>
                </button>
                <button onClick={(e)=>{e.stopPropagation();setViewingListing(item);setPhotoIndex(0);incrementViews(item.id);if(item.userId !== user?.uid){loadSellerStats(item.userId);}}} style={{minWidth:0,padding:'9px 6px',background:'#fff',color:'#0f1b2d',border:'1px solid #e2e6ea',borderRadius:'9px',fontSize:'12px',fontWeight:'800',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'4px',whiteSpace:'nowrap'}}>
                  <span>📋</span><span>Details</span>
                </button>
                {item.userId !== user?.uid && (
                  <button onClick={(e)=>{e.stopPropagation();requireAuth("message",()=>startConversation(item));}} style={{minWidth:0,padding:'9px 6px',background:'#e6fffe',color:'#0d9488',border:'none',borderRadius:'9px',fontSize:'12px',fontWeight:'800',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'4px',whiteSpace:'nowrap'}} title="Message seller">
                    <span>💬</span><span>Message</span>
                  </button>
                )}
              </div>
            )}
          </div>
                  {user && item.userId===user.uid&&!item.sold&&openListingId===item.id&&(<button onClick={(e)=>{e.stopPropagation();markAsSold(item.id);}} style={{padding:'8px 16px',background:'#10b981',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer',marginTop:'8px'}}>✓ Mark as Sold</button>)}
                </div>
              ))
            )}
          </div>
  );
})()}
</div>

{/* ===== SERVICES TAB CONTENT ===== */}
<div style={{display: homeTab==="services" ? "block" : "none"}}>
  <div style={{margin:'0 16px 10px 16px',display:'flex',alignItems:'center',background:'#fff',borderRadius:'12px',padding:'8px 12px',border:'1.5px solid #e2e6ea'}}>
    <input type="text" placeholder="Tafuta huduma..." value={serviceSearchQ}
      onChange={e => {
        setServiceSearchQ(e.target.value);
        if (!e.target.value.trim()) {
          setCommittedServiceSearchQ("");
          clearAISearch();
        }
      }}
      onKeyDown={e => { if (e.key === 'Enter') commitServicesSearch(serviceSearchQ); }}
      style={{flex:1,border:'none',background:'none',outline:'none',fontSize:'14px'}}/>
    <button type="button" onClick={() => commitServicesSearch(serviceSearchQ)} aria-label="Search" style={{background:'none',border:'none',cursor:'pointer',fontSize:'16px',padding:'4px 6px',color:'#6b7280'}}>🔍</button>
  </div>
  <AISearchBadge parsed={aiParsed} isAIActive={isAIActive} onClear={() => { clearAISearch(); setServiceSearchQ(""); setCommittedServiceSearchQ(""); }} />
  {aiSearching && <div style={{padding:'6px 16px 8px',fontSize:'11px',color:'#0d9488'}}>✨ AI is thinking...</div>}
  <div style={{display:'flex',gap:'8px',overflowX:'auto',paddingBottom:'4px',margin:'0 16px 12px 16px'}}>
    {SERVICE_CATEGORIES.map(c=>(
      <button key={c.id} onClick={()=>setActiveServiceCat(c.id)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 14px',background:activeServiceCat===c.id?'#0d9488':'#fff',color:activeServiceCat===c.id?'#fff':'#0f1b2d',border:activeServiceCat===c.id?'1.5px solid #0d9488':'1.5px solid #e2e6ea',borderRadius:'20px',fontSize:'12px',fontWeight:'500',cursor:'pointer',whiteSpace:'nowrap'}}>{c.icon} {c.name}</button>
    ))}
  </div>
  <div style={{margin:'0 16px 12px 16px'}}>
    <button onClick={()=>{user ? setPage("createService") : requireAuth("list service",()=>setPage("createService"));}} style={{padding:'10px 18px',background:'#0d9488',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Offer a Service</button>
  </div>
  {(()=>{
    let filtered = services;
    if (activeServiceCat !== "all") {
      filtered = filtered.filter(s => s.category === activeServiceCat);
    }
    if (!aiSearching) {
      if (aiParsed && committedServiceSearchQ.trim()) {
        filtered = filterServices(filtered, aiParsed);
      } else if (committedServiceSearchQ.trim()) {
        const q = committedServiceSearchQ.toLowerCase();
        filtered = filtered.filter(s =>
          s.title.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q)
        );
      }
    }
    return (
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',margin:'0 16px'}}>
        {filtered.length === 0 ? (
          <div style={{gridColumn:'1/-1'}}>
            <EmptyResults kind="service" query={committedServiceSearchQ} parsedFilters={aiParsed?.filters}
              fallbackTitle="No services yet" fallbackHint="Be the first to offer a service!" />
            {!committedServiceSearchQ?.trim() && (
              <div style={{textAlign:'center',marginTop:'12px'}}>
                <button onClick={()=>{user ? setPage("createService") : requireAuth("list service",()=>setPage("createService"));}} style={{padding:'10px 20px',background:'#0d9488',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Offer a Service</button>
              </div>
            )}
          </div>
        ) : (
          filtered.map(svc => (
            <div key={svc.id} onClick={()=>setViewingService(svc)} style={{background:'#fff',borderRadius:'14px',overflow:'hidden',cursor:'pointer',border:'1px solid #e2e6ea'}}>
              {(svc.photos && svc.photos.length > 0) ? (
                <img src={svc.photos[0]} alt={svc.title} loading="lazy" style={{width:'100%',height:'130px',objectFit:'cover'}}/>
              ) : svc.photoUrl ? (
                <img src={svc.photoUrl} alt={svc.title} loading="lazy" style={{width:'100%',height:'130px',objectFit:'cover'}}/>
              ) : (
                <div style={{width:'100%',height:'130px',background:'linear-gradient(135deg,#0d9488,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'40px'}}>
                  {SERVICE_CATEGORIES.find(c=>c.id===svc.category)?.icon || '⚡'}
                </div>
              )}
              <div style={{padding:'10px'}}>
                <div style={{fontSize:'13px',fontWeight:'600',marginBottom:'4px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{svc.title}</div>
                <div style={{display:'flex',alignItems:'center',gap:'4px',marginBottom:'4px'}}>
                  <div style={{width:'18px',height:'18px',borderRadius:'50%',backgroundImage:svc.userAvatar?`url(${svc.userAvatar})`:'none',backgroundColor:!svc.userAvatar?'#0d9488':'transparent',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'8px',fontWeight:'700',color:'#fff'}}>
                    {!svc.userAvatar&&(svc.userName||"?").split(" ").map(n=>n[0]).join("")}
                  </div>
                  <span style={{fontSize:'11px',color:'#6b7280'}}>{svc.userName}</span>
                </div>
                {svc.accountType === "provider" ? (
                  <div style={{fontSize:'10px',color:'#6b7280',marginBottom:'4px'}}>💼 Near campus{svc.providerLocation ? ` · ${svc.providerLocation}` : ''}</div>
                ) : (
                  <div style={{fontSize:'10px',color:'#0d9488',fontWeight:'600',marginBottom:'4px'}}>🎓 {svc.universityName || 'ARU'} Student</div>
                )}
                <div style={{fontSize:'12px',color:'#8a9bb0'}}>{SERVICE_CATEGORIES.find(c=>c.id===svc.category)?.name}</div>
              </div>
            </div>
          ))
        )}
      </div>
    );
  })()}
</div>

{/* ===== ROOMS TAB CONTENT ===== */}
<div style={{display: ENABLE_ROOMS && homeTab==="rooms" ? "block" : "none"}}>
  <div style={{margin:'0 16px 10px 16px',display:'flex',alignItems:'center',background:'#fff',borderRadius:'10px',padding:'8px 12px',border:'1.5px solid #e2e6ea'}}>
    <input type="text" placeholder="Tafuta kwa eneo, bei, amenity..." value={roomSearchQ}
      onChange={e => {
        setRoomSearchQ(e.target.value);
        if (!e.target.value.trim()) {
          setCommittedRoomSearchQ("");
          clearAISearch();
        }
      }}
      onKeyDown={e => { if (e.key === 'Enter') commitRoomsSearch(roomSearchQ); }}
      style={{flex:1,border:'none',background:'none',outline:'none',fontSize:'14px'}}/>
    <button type="button" onClick={() => commitRoomsSearch(roomSearchQ)} aria-label="Search" style={{background:'none',border:'none',cursor:'pointer',fontSize:'14px',padding:'4px 6px',color:'#6b7280'}}>🔍</button>
  </div>
  <AISearchBadge parsed={aiParsed} isAIActive={isAIActive} onClear={() => { clearAISearch(); setRoomSearchQ(""); setCommittedRoomSearchQ(""); }} />
  {aiSearching && <div style={{padding:'6px 16px 8px',fontSize:'11px',color:'#0d9488'}}>✨ AI is thinking...</div>}
  <div style={{display:'flex',gap:'6px',overflowX:'auto',margin:'0 16px 10px 16px'}}>
    {ROOM_TYPES.map(t=>(
      <button key={t.id} onClick={()=>setRoomFilterType(t.id)} style={{padding:'6px 14px',background:roomFilterType===t.id?'#06d6c7':'#fff',color:roomFilterType===t.id?'#fff':'#0f1b2d',border:roomFilterType===t.id?'none':'1.5px solid #e2e6ea',borderRadius:'20px',fontSize:'12px',fontWeight:'500',cursor:'pointer',whiteSpace:'nowrap'}}>{t.icon} {t.name}</button>
    ))}
  </div>
  <div style={{margin:'0 16px 12px 16px',display:'flex',gap:'8px'}}>
    <button onClick={()=>{if(!user){requireAuth("listRoom",()=>setPage("createRoom"));return;}setPage("createRoom");}} style={{padding:'10px 16px',background:'#06d6c7',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>+ List a Room</button>
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
    let filtered = rooms;
    if (roomFilterType !== "all") {
      filtered = filtered.filter(r => r.roomType === roomFilterType);
    }
    if (roomFilterMaxPrice) {
      filtered = filtered.filter(r => r.price <= parseInt(roomFilterMaxPrice));
    }
    if (!aiSearching) {
      if (aiParsed && committedRoomSearchQ.trim()) {
        filtered = filterRooms(filtered, aiParsed);
      } else if (committedRoomSearchQ.trim()) {
        const q = committedRoomSearchQ.toLowerCase();
        filtered = filtered.filter(r =>
          r.location?.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.landlordName?.toLowerCase().includes(q)
        );
      }
    }
    return filtered.length === 0 ? (
      <div style={{margin:'0 16px'}}>
        <EmptyResults kind="room" query={committedRoomSearchQ} parsedFilters={aiParsed?.filters}
          fallbackTitle="No rooms listed yet" fallbackHint="Know a landlord? Help them list their room!" />
        {!committedRoomSearchQ?.trim() && (
          <div style={{textAlign:'center',marginTop:'12px'}}>
            <button onClick={()=>{if(!user){requireAuth("listRoom",()=>setPage("createRoom"));return;}setPage("createRoom");}} style={{padding:'10px 20px',background:'#06d6c7',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ List a Room</button>
          </div>
        )}
      </div>
    ) : (
      <div style={{display:'flex',flexDirection:'column',gap:'10px',margin:'0 16px'}}>
        {filtered.map(room => (
          <div key={room.id} onClick={()=>{setViewingRoom(room);setShowRoomIndoor(false);}} style={{background:'#fff',borderRadius:'14px',overflow:'hidden',cursor:'pointer',border:'1px solid #e2e6ea'}}>
            {room.photoUrl ? (
              <img src={room.photoUrl} alt="" loading="lazy" style={{width:'100%',height:'180px',objectFit:'cover'}}/>
            ) : (
              <div style={{width:'100%',height:'120px',background:'linear-gradient(135deg,#06d6c7,#38bdf8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'48px'}}>🏠</div>
            )}
            <div style={{padding:'12px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'start',marginBottom:'6px'}}>
                <div>
                  <span style={{fontSize:'11px',background:'#e0f2fe',color:'#0369a1',padding:'2px 8px',borderRadius:'8px',fontWeight:'500'}}>{ROOM_TYPES.find(t=>t.id===room.roomType)?.name || room.roomType}</span>
                  <div style={{fontSize:'15px',fontWeight:'600',marginTop:'6px'}}>📍 {room.location}</div>
                </div>
                <div style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700',color:'#f59e0b'}}>{room.price?.toLocaleString()}<span style={{fontSize:'11px',fontWeight:'400',color:'#8a9bb0'}}>/mo</span></div>
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
                    pageHistory.current = ["home"];
                    window.history.replaceState({ page: "home" }, "", "/");
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
                <div style={{background:'#f0fffe',border:'1px solid #99f0ee',borderRadius:'12px',padding:'14px',marginBottom:'16px'}}>
                  <div style={{fontSize:'13px',fontWeight:'700',color:'#0d9488',marginBottom:'8px'}}>✨ Andika kwa maneno yako</div>
                  <textarea
                    value={createAssistText}
                    onChange={e => setCreateAssistText(e.target.value)}
                    placeholder='Mfano: Nauza iPhone 11 bei 400k pale Mlimani'
                    rows={3}
                    style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',fontFamily:'inherit',resize:'vertical',boxSizing:'border-box',marginBottom:'8px'}}
                  />
                  <button
                    type="button"
                    onClick={() => handleCreateAssist('listing')}
                    disabled={createAssistLoading || !createAssistText.trim()}
                    style={{width:'100%',padding:'10px',background:'#0d9488',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:createAssistLoading?'wait':'pointer',opacity:!createAssistText.trim()?0.6:1}}
                  >
                    {createAssistLoading ? 'Inaelewa...' : 'Nijazie Fomu'}
                  </button>
                  <div style={{fontSize:'11px',color:'#6b7280',marginTop:'8px',lineHeight:1.4}}>
                    Works in Swahili or English. You still add photos and tap Create Listing.
                  </div>
                </div>
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
              border:'2px dashed #06d6c7',
              borderRadius:'10px',
              display:'flex',
              alignItems:'center',
              justifyContent:'center',
              background:'#f0fffe',
              flexShrink:0
            }}>
              <span style={{fontSize:'24px',color:'#06d6c7'}}>+</span>
            </div>
          )}
        </div>
      )}

      {/* Add more when only 1 photo */}
      {createData.photoPreviews.length === 1 && createData.photoPreviews.length < 5 && (
        <div style={{
          height:'48px',
          border:'2px dashed #06d6c7',
          borderRadius:'10px',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          background:'#f0fffe',
          gap:'6px'
        }}>
          <span style={{fontSize:'18px',color:'#06d6c7'}}>+</span>
          <span style={{fontSize:'13px',color:'#06d6c7',fontWeight:'600'}}>Add more photos</span>
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
                <div style={{marginBottom:'16px'}}>
                  <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Price (TSh) *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 25,000 or 25k"
                    value={createData.price}
                    onChange={e=>setCreateData({...createData,price:e.target.value})}
                    style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none'}}
                  />
                  {createData.price && (
                    <div style={{fontSize:'11px',color:formatPriceHint(createData.price) ? '#0d9488' : '#ef4444',marginTop:'4px',fontWeight:'600'}}>
                      {formatPriceHint(createData.price) || '⚠ Bei haisomeki — andika mfano: 25000, 25k, 25,000'}
                    </div>
                  )}
                </div>
                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Condition</label><select value={createData.cond} onChange={e=>setCreateData({...createData,cond:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none'}}><option value="">Select condition...</option><option value="New">New</option><option value="Like New">Like New</option><option value="Good">Good</option><option value="Fair">Fair</option><option value="Worn">Worn</option></select></div>
                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>📍 Pickup Location *</label><input type="text" placeholder="e.g. Old Library, Mlimani City, Kijitonyama" value={createData.location} onChange={e=>setCreateData({...createData,location:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/><div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>Where can the buyer pick up or meet you?</div></div>
                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>📱 WhatsApp Number (optional)</label><input type="tel" placeholder="e.g. 0712345678" value={createData.whatsapp} onChange={e=>setCreateData({...createData,whatsapp:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/><div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>Let buyers contact you directly on WhatsApp (visible on your listing)</div></div>
                <button onClick={handleCreateListing} disabled={uploading} style={{width:'100%',marginTop:'16px',padding:'12px',background:'#06d6c7',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:uploading?'not-allowed':'pointer'}}>{uploading?"Uploading...":"💾 Create Listing"}</button>
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
              <button onClick={() => { setShowSafetyMessage(false); localStorage.setItem("safetyMessageDismissed", "true"); }} style={{background:'none',border:'none',fontSize:'18px',cursor:'pointer',flexShrink:0}}>×</button>
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
              backgroundColor:!otherPerson.avatar?'#06d6c7':'transparent',
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
              <div style={{fontSize:'12px',color:'#06d6c7',marginBottom:'4px',fontWeight:'500'}}>{conv.listingTitle} • {conv.listingPrice?.toLocaleString()} TSh</div>
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
        onClick={() => {
  setActiveConversation(null);
  setMessages([]);
  setPageRaw("messages");
  pageHistory.current = pageHistory.current.filter(p => p !== "chat");
  if (pageHistory.current[pageHistory.current.length - 1] !== "messages") {
    pageHistory.current.push("messages");
  }
  window.history.replaceState({ page: "messages" }, "", "/");
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
              backgroundColor:!otherUser.avatar?'#06d6c7':'transparent',
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
  padding:'14px 12px',
  display:'flex',
  flexDirection:'column',
  backgroundColor:'#f7f7f4',
  backgroundImage:"linear-gradient(rgba(255,255,255,0.82), rgba(255,255,255,0.82)), url('/chatwallpaper.jpeg')",
  backgroundSize:'cover',
  backgroundPosition:'center'
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
        const toMillis = (value) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (value.toDate) return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  return 0;
};

const sentAt = toMillis(msg.createdAt);
const otherLastReadAt = isMine
  ? (user.uid === activeConversation.buyerId
      ? activeConversation.sellerLastReadAt
      : activeConversation.buyerLastReadAt)
  : null;

const wasRead = isMine && sentAt > 0 && toMillis(otherLastReadAt) >= sentAt;
const statusText = msg._pending ? "Sending..." : wasRead ? "Read" : "Sent";
        return (
          <div key={msg.id} style={{
            display:'flex',
            justifyContent:isMine?'flex-end':'flex-start',
            marginBottom:'8px'
          }}>
            <div style={{
              maxWidth:'78%',
              background:isMine?'#d9fdd3':'#fff',
              color:'#111827',
              padding:'8px 12px',
              borderRadius:isMine?'14px 14px 4px 14px':'14px 14px 14px 4px',
              fontSize:'14px',
              lineHeight:'1.35',
              boxShadow:'0 1px 1px rgba(0,0,0,0.08)'
            }}>
              {!isMine&&<div style={{fontSize:'11px',fontWeight:'600',marginBottom:'4px',color:'#6b7280'}}>{msg.senderName}</div>}
              {msg.imageUrl && (
                <img
                  src={msg.imageUrl}
                  alt=""
                  onClick={()=>setFullScreenImage(msg.imageUrl)}
                  style={{
                    maxWidth:'220px',
                    width:'100%',
                    borderRadius:'10px',
                    display:'block',
                    cursor:'pointer',
                    opacity: msg._pending ? 0.6 : 1,
                    marginBottom: msg.text ? '6px' : '0'
                  }}
                />
              )}
              {msg.text && <div style={{wordBreak:'break-word'}}>{msg.text}</div>}
             <div style={{fontSize:'10px',marginTop:'4px',opacity:0.65,textAlign:'right'}}>
  {msg.createdAt ? (() => {
    try {
      const date = msg.createdAt instanceof Date ? msg.createdAt : msg.createdAt.toDate();
      return date.toLocaleTimeString('en', {hour:'2-digit', minute:'2-digit'});
    } catch(e) {
      return '';
    }
  })() : ''}
  {isMine && (
    <span style={{marginLeft:'6px',color:wasRead?'#22c55e':'inherit',fontWeight:wasRead?'600':'400'}}>
      {statusText}
    </span>
  )}
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
      {/* Hidden file input for photo */}
      <input
        type="file"
        id="chat-photo-input"
        accept="image/*"
        style={{display:'none'}}
        onChange={e => {
          const file = e.target.files[0];
          if (!file) return;
          if (!file.type.startsWith('image/')) { setError("Please select an image."); return; }
          if (file.size > 10 * 1024 * 1024) { setError("Image too large. Max 10MB."); return; }
          e.target.value = '';
          sendImageMessage(file);
        }}
      />
      {/* Photo button */}
      <button
        type="button"
        onClick={() => document.getElementById('chat-photo-input').click()}
        style={{
          width:'40px',
          height:'40px',
          borderRadius:'50%',
          background:'#f4f6f8',
          border:'1.5px solid #e2e6ea',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          fontSize:'18px',
          cursor:'pointer',
          flexShrink:0
        }}
        title="Send photo"
      >
        📷
      </button>
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
          background:messageText.trim()?'#06d6c7':'#e2e6ea',
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
          <div style={{background:'linear-gradient(135deg,#0d9488 0%,#a78bfa 100%)',borderRadius:'18px',padding:'20px 18px',margin:'0 16px 16px 16px',boxSizing:'border-box',width:'calc(100% - 32px)'}}>
            <h2 style={{fontFamily:'serif',fontSize:'22px',fontWeight:'700',color:'#fff',marginBottom:'6px'}}>Campus Services</h2>
            <p style={{color:'rgba(255,255,255,0.8)',fontSize:'13px',marginBottom:'14px',lineHeight:1.5}}>Book haircuts, order food, hire photographers & more — all from fellow students.</p>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>{user ? setPage("createService") : requireAuth("list service",()=>setPage("createService"));}} style={{padding:'10px 18px',background:'#fff',color:'#0d9488',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Offer a Service</button>
            </div>
          </div>

          {/* Search */}
          <div style={{margin:'0 16px 12px 16px',display:'flex',alignItems:'center',background:'#fff',borderRadius:'12px',padding:'8px 12px',border:'1.5px solid #e2e6ea'}}>
            <input type="text" placeholder="Tafuta huduma..." value={serviceSearchQ}
              onChange={e => {
                setServiceSearchQ(e.target.value);
                if (!e.target.value.trim()) {
                  setCommittedServiceSearchQ("");
                  clearAISearch();
                }
              }}
              onKeyDown={e => { if (e.key === 'Enter') commitServicesSearch(serviceSearchQ); }}
              style={{flex:1,border:'none',background:'none',outline:'none',fontSize:'14px'}}/>
            <button type="button" onClick={() => commitServicesSearch(serviceSearchQ)} aria-label="Search" style={{background:'none',border:'none',cursor:'pointer',fontSize:'16px',padding:'4px 6px',color:'#6b7280'}}>🔍</button>
          </div>
          <AISearchBadge parsed={aiParsed} isAIActive={isAIActive} onClear={() => { clearAISearch(); setServiceSearchQ(""); setCommittedServiceSearchQ(""); }} />
          {aiSearching && <div style={{padding:'6px 16px 8px',fontSize:'11px',color:'#0d9488'}}>✨ AI is thinking...</div>}

          {/* Category Filter */}
          <div style={{display:'flex',gap:'8px',overflowX:'auto',paddingBottom:'4px',margin:'0 16px 16px 16px'}}>
            {SERVICE_CATEGORIES.map(c=>(
              <button key={c.id} onClick={()=>setActiveServiceCat(c.id)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 14px',background:activeServiceCat===c.id?'#0d9488':'#fff',color:activeServiceCat===c.id?'#fff':'#0f1b2d',border:activeServiceCat===c.id?'1.5px solid #0d9488':'1.5px solid #e2e6ea',borderRadius:'20px',fontSize:'12px',fontWeight:'500',cursor:'pointer',whiteSpace:'nowrap'}}>{c.icon} {c.name}</button>
            ))}
          </div>

          {/* Services Grid */}
          {(() => {
            let filtered = services;
            if (activeServiceCat !== "all") {
              filtered = filtered.filter(s => s.category === activeServiceCat);
            }
            if (!aiSearching) {
              if (aiParsed && committedServiceSearchQ.trim()) {
                filtered = filterServices(filtered, aiParsed);
              } else if (committedServiceSearchQ.trim()) {
                const q = committedServiceSearchQ.toLowerCase();
                filtered = filtered.filter(s =>
                  s.title.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q)
                );
              }
            }
            return (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',margin:'0 16px'}}>
                {filtered.length === 0 ? (
                  <div style={{gridColumn:'1/-1'}}>
                    <EmptyResults kind="service" query={committedServiceSearchQ} parsedFilters={aiParsed?.filters}
                      fallbackTitle="No services yet" fallbackHint="Be the first to offer a service!" />
                    {!committedServiceSearchQ?.trim() && (
                      <div style={{textAlign:'center',marginTop:'12px'}}>
                        <button onClick={()=>{user ? setPage("createService") : requireAuth("list service",()=>setPage("createService"));}} style={{padding:'10px 20px',background:'#0d9488',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Offer a Service</button>
                      </div>
                    )}
                  </div>
                ) : (
                  filtered.map(svc => (
                    <div key={svc.id} onClick={()=>setViewingService(svc)} style={{background:'#fff',borderRadius:'14px',overflow:'hidden',cursor:'pointer',border:'1px solid #e2e6ea'}}>
                      {(svc.photos && svc.photos.length > 0) ? (
                        <img src={svc.photos[0]} alt={svc.title} loading="lazy" style={{width:'100%',height:'130px',objectFit:'cover'}}/>
                      ) : svc.photoUrl ? (
                        <img src={svc.photoUrl} alt={svc.title} loading="lazy" style={{width:'100%',height:'130px',objectFit:'cover'}}/>
                      ) : (
                        <div style={{width:'100%',height:'130px',background:'linear-gradient(135deg,#0d9488,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'40px'}}>
                          {SERVICE_CATEGORIES.find(c=>c.id===svc.category)?.icon || '⚡'}
                        </div>
                      )}
                      <div style={{padding:'10px'}}>
                        <div style={{fontSize:'13px',fontWeight:'600',marginBottom:'4px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{svc.title}</div>
                        <div style={{display:'flex',alignItems:'center',gap:'4px',marginBottom:'6px'}}>
                          <div style={{width:'18px',height:'18px',borderRadius:'50%',backgroundImage:svc.userAvatar?`url(${svc.userAvatar})`:'none',backgroundColor:!svc.userAvatar?'#0d9488':'transparent',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'8px',fontWeight:'700',color:'#fff'}}>
                            {!svc.userAvatar&&(svc.userName||"?").split(" ").map(n=>n[0]).join("")}
                          </div>
                          <span style={{fontSize:'11px',color:'#8a9bb0'}}>{svc.userName}</span>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontFamily:'serif',fontSize:'15px',fontWeight:'700',color:'#f59e0b'}}>{svc.price?.toLocaleString()} TSh</span>
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
                <button onClick={()=>{setShowCreateServiceSuccess(false);setPage("services");}} style={{width:'100%',padding:'14px',background:'#0d9488',color:'#fff',border:'none',borderRadius:'12px',fontSize:'16px',fontWeight:'600',cursor:'pointer',marginBottom:'12px'}}>View All Services</button>
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
                          <div style={{width:'60px',height:'60px',border:'2px dashed #0d9488',borderRadius:'8px',display:'flex',alignItems:'center',justifyContent:'center',background:'#e6fffe',flexShrink:0}}>
                            <span style={{fontSize:'20px',color:'#0d9488'}}>+</span>
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
                  <div style={{flex:1}}>
                    <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Price (TSh) *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 5,000 or 5k"
                      value={createServiceData.price}
                      onChange={e=>setCreateServiceData({...createServiceData,price:e.target.value})}
                      style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}
                    />
                    {createServiceData.price && (
                      <div style={{fontSize:'11px',color:formatPriceHint(createServiceData.price) ? '#0d9488' : '#ef4444',marginTop:'4px',fontWeight:'600'}}>
                        {formatPriceHint(createServiceData.price) || '⚠ Bei haisomeki'}
                      </div>
                    )}
                  </div>
                  <div style={{width:'130px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Price Type</label><select value={createServiceData.priceType} onChange={e=>setCreateServiceData({...createServiceData,priceType:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none'}}><option value="fixed">Fixed</option><option value="starting">Starting at</option><option value="negotiable">Negotiable</option></select></div>
                </div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>📍 Where? (optional)</label><input type="text" placeholder="e.g. Room 23 Block B, Campus Gate" value={createServiceData.location} onChange={e=>setCreateServiceData({...createServiceData,location:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>🕐 Working hours (optional)</label><input type="text" placeholder="e.g. Mon–Sat, 9am–7pm" value={createServiceData.availability} onChange={e=>setCreateServiceData({...createServiceData,availability:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/><div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>When are customers welcome to reach out?</div></div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>📱 WhatsApp Number (optional)</label><input type="tel" placeholder="e.g. 0712345678" value={createServiceData.whatsapp} onChange={e=>setCreateServiceData({...createServiceData,whatsapp:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/><div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>Let customers contact you directly on WhatsApp</div></div>

                <button onClick={handleCreateService} disabled={uploading} style={{width:'100%',marginTop:'16px',padding:'12px',background:'#0d9488',color:'#fff',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:uploading?'not-allowed':'pointer'}}>{uploading?"Uploading...":"✨ List My Service"}</button>
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
            <div style={{width:'100%',height:'200px',background:'linear-gradient(135deg,#0d9488,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'64px'}}>
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
            <span style={{fontSize:'12px',background:'#e6fffe',color:'#0d9488',padding:'4px 12px',borderRadius:'20px',fontWeight:'500'}}>
              {SERVICE_CATEGORIES.find(c=>c.id===viewingService.category)?.icon} {SERVICE_CATEGORIES.find(c=>c.id===viewingService.category)?.name}
            </span>

            <h1 style={{fontSize:'24px',fontWeight:'700',margin:'12px 0 8px',color:'#0f1b2d'}}>{viewingService.title}</h1>
            
            <div style={{fontFamily:'serif',fontSize:'28px',fontWeight:'700',color:'#0d9488',marginBottom:'16px'}}>
              {viewingService.priceType === "starting" ? "From " : ""}{viewingService.price?.toLocaleString()} TSh
              {viewingService.priceType === "negotiable" && <span style={{fontSize:'14px',color:'#8a9bb0',fontFamily:'system-ui',fontWeight:'400'}}> (negotiable)</span>}
            </div>

            {/* Meta */}
            <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}}>
              <span style={{fontSize:'12px',background:'#f4f6f8',padding:'6px 12px',borderRadius:'20px',color:'#6b7280'}}>🎓 {viewingService.universityName}</span>
              {viewingService.location && <span style={{fontSize:'12px',background:'#f0fffe',padding:'6px 12px',borderRadius:'20px',color:'#0f1b2d',fontWeight:'500'}}>📍 {viewingService.location}</span>}
              {viewingService.availability && <span style={{fontSize:'12px',background:'#ccfbf1',padding:'6px 12px',borderRadius:'20px',color:'#0f766e',fontWeight:'500'}}>🕐 {viewingService.availability}</span>}
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
                <div style={{width:'52px',height:'52px',minWidth:'52px',minHeight:'52px',flexShrink:0,aspectRatio:'1 / 1',overflow:'hidden',borderRadius:'50%',background:viewingService.userAvatar?`url(${viewingService.userAvatar})`:'linear-gradient(135deg,#0d9488,#a78bfa)',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',fontWeight:'700',color:'#fff',cursor:'pointer'}}>
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
                  }} style={{flex:1,padding:'16px',background:'#25D366',color:'#fff',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:'600',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}><WhatsAppIcon size={18} /> WhatsApp</button>
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
                }} style={{flex:1,padding:'16px',background:'#0d9488',color:'#fff',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:'600',cursor:'pointer'}}>💬 Message</button>
              </>
            ) : (
              <div style={{width:'100%',display:'flex',gap:'8px'}}>
                <div style={{flex:1,textAlign:'center',padding:'12px',background:'#e6fffe',borderRadius:'10px',color:'#0d9488',fontSize:'14px',fontWeight:'600'}}>This is your service</div>
                <button onClick={()=>{setViewingService(null);deleteService(viewingService.id);}} style={{padding:'12px 20px',background:'#fee2e2',color:'#991b1b',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>🗑 Remove</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ COMMUNITIES INDEX ============ */}
      {page==="communities"&&(
        <>
          <GroupListPage
            groups={groupsForSelectedUni}
            publicEvents={publicEventsForGroups}
            legacyCollections={collections}
            initialViewMode={groupsInitialMode}
            onOpenGroup={(group) => {
              setGroupsInitialMode("groups");
              openGroup(group);
            }}
            onDeleteGroup={handleArchiveGroup}
            onCreateGroup={() => { user ? setShowCreateGroup(true) : requireAuth("createGroup", () => setShowCreateGroup(true)); }}
            onCreateCollection={() => { user ? setPage("createCollection") : requireAuth("create collection", () => setPage("createCollection")); }}
            onOpenScanner={() => { user ? openScanner() : requireAuth("scan group QR", openScanner); }}
            onSeedDemoGroups={handleSeedDemoGroups}
            onSeedQuantitySurveyGroup={handleSeedQuantitySurveyGroup}
            canSeedDemoGroups={!!user && ADMIN_UIDS.includes(user.uid)}
            groupReadAt={groupReadAt}
            currentUserId={user?.uid || ""}
            onOpenLegacyCommunity={(group) => { setViewingCommunity(group); setPage("communityDetail"); }}
            onOpenPublicEvent={(eventItem) => {
              const hostGroup = groupsForSelectedUni.find(g => g.id === eventItem.groupId);
              if (hostGroup) {
                setGroupsInitialMode("events");
                openGroup(hostGroup, { tab: "events", collectionId: eventItem.id, collection: eventItem, source: "publicEvents" });
              }
              else setError("Open the host group to register for this event.");
            }}
            isGroupAdmin={isGroupAdmin}
            seedingDemo={seedingDemoGroups}
            seedingQsGroup={seedingQsGroup}
          />
          {showCreateGroup && (
            <CreateGroupModal
              data={createGroupData}
              onChange={setCreateGroupData}
              onClose={() => setShowCreateGroup(false)}
              onCreate={createGroup}
              uploading={uploading}
            />
          )}
        </>
      )}

      {false && page==="communities"&&(
        <div style={{width:'100%',flex:1,overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',boxSizing:'border-box',paddingBottom:'100px'}}>
          {/* Header */}
          <div style={{background:'linear-gradient(135deg,#0d9488 0%,#14b8a6 100%)',borderRadius:'18px',padding:'20px 18px',margin:'0 16px 16px 16px',width:'calc(100% - 32px)',boxSizing:'border-box'}}>
            <h2 style={{fontFamily:'serif',fontSize:'22px',fontWeight:'700',color:'#0f1b2d',marginBottom:'6px'}}>Groups</h2>
            <p style={{color:'rgba(15,27,45,0.7)',fontSize:'13px',marginBottom:'14px',lineHeight:1.5}}>Open a group to see all active orders/collections and events inside it.</p>
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
              <button onClick={()=>{user ? setShowCreateGroup(true) : requireAuth("createGroup",()=>setShowCreateGroup(true));}} style={{padding:'10px 18px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Create Group</button>
              <button onClick={()=>{user ? setPage("createCollection") : requireAuth("create collection",()=>setPage("createCollection"));}} style={{padding:'10px 18px',background:'rgba(15,27,45,0.15)',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Create order / event</button>
            </div>
          </div>

          {/* Real groups */}
          {groups.length > 0 && (
            <div style={{margin:'0 16px 16px'}}>
              <div style={{fontSize:'12px',fontWeight:'700',color:'#8a9bb0',marginBottom:'8px',letterSpacing:'0.5px'}}>GROUPS</div>
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                {groups.map(group => (
                  <button key={group.id} type="button" onClick={()=>openGroup(group)} style={{background:'#fff',border:'1px solid #e2e6ea',borderRadius:'14px',padding:'14px',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:'12px'}}>
                    <div style={{width:'44px',height:'44px',borderRadius:'12px',background:'linear-gradient(135deg,#06d6c7,#0d9488)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'20px',flexShrink:0}}>
                      {group.type==="church"?"⛪":group.type==="club"?"🏆":group.type==="hostel"?"🏠":group.type==="freshers"?"🎓":"🏫"}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:'15px',fontWeight:'700',color:'#0f1b2d'}}>{group.name}</div>
                      {group.desc && <div style={{fontSize:'12px',color:'#8a9bb0',marginTop:'2px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{group.desc}</div>}
                      <div style={{fontSize:'11px',color:'#06d6c7',fontWeight:'600',marginTop:'3px'}}>Tap to view →</div>
                    </div>
                    {isGroupAdmin(group) && <span style={{fontSize:'10px',background:'#ccfbf1',color:'#0f766e',padding:'3px 8px',borderRadius:'6px',fontWeight:'700',flexShrink:0}}>Admin</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Legacy collection-based communities */}
          {collections.length > 0 && (
            <div style={{margin:'0 16px'}}>
              <div style={{fontSize:'12px',fontWeight:'700',color:'#8a9bb0',marginBottom:'8px',letterSpacing:'0.5px'}}>ORDERS & EVENTS</div>
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                {Object.values(collections.reduce((acc, col) => {
                  const key = (col.communityName || col.universityName || "General").trim();
                  if (!acc[key]) acc[key] = { name: key, items: [], orders: 0, events: 0 };
                  acc[key].items.push(col);
                  if ((col.collectionType || "order") === "event") acc[key].events += 1;
                  else acc[key].orders += 1;
                  return acc;
                }, {})).sort((a, b) => b.items.length - a.items.length).map(group => (
                  <button key={group.name} type="button" onClick={() => { setViewingCommunity(group); setPage("communityDetail"); }} style={{background:'#fff',border:'1px solid #e2e6ea',borderRadius:'14px',padding:'14px',cursor:'pointer',textAlign:'left'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}>
                      <div style={{fontSize:'15px',fontWeight:'700',color:'#0f1b2d'}}>{group.name}</div>
                      <div style={{fontSize:'11px',fontWeight:'700',color:'#0f766e',background:'#ccfbf1',padding:'4px 8px',borderRadius:'8px'}}>{group.items.length} total</div>
                    </div>
                    <div style={{marginTop:'6px',fontSize:'12px',color:'#6b7280'}}>{group.orders} orders • {group.events} events</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {groups.length === 0 && collections.length === 0 && (
            <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px',margin:'0 16px'}}>
              <div style={{fontSize:'40px',marginBottom:'16px'}}>🏫</div>
              <div style={{fontSize:'16px',fontWeight:'600'}}>No active groups yet</div>
              <div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Create a group or an order/event and it will appear here.</div>
            </div>
          )}

          {/* Create Group Modal */}
          {showCreateGroup && (
            <div onClick={()=>setShowCreateGroup(false)} style={{position:'fixed',inset:0,background:'rgba(15,27,45,0.6)',zIndex:3000,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
              <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:'20px 20px 0 0',padding:'24px',width:'100%',maxWidth:'480px',maxHeight:'80vh',overflowY:'auto'}}>
                <div style={{fontSize:'18px',fontWeight:'700',marginBottom:'16px'}}>Create a Group</div>

                <div style={{marginBottom:'14px'}}>
                  <label style={{display:'block',fontSize:'12px',fontWeight:'700',marginBottom:'6px'}}>Group Name *</label>
                  <input type="text" placeholder="e.g. ARU Catholic Community, Architecture Year 2" value={createGroupData.name} onChange={e=>setCreateGroupData({...createGroupData,name:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'15px',outline:'none',boxSizing:'border-box'}}/>
                </div>

                <div style={{marginBottom:'14px'}}>
                  <label style={{display:'block',fontSize:'12px',fontWeight:'700',marginBottom:'6px'}}>Description (optional)</label>
                  <input type="text" placeholder="What is this group for?" value={createGroupData.desc} onChange={e=>setCreateGroupData({...createGroupData,desc:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'15px',outline:'none',boxSizing:'border-box'}}/>
                </div>

                <div style={{marginBottom:'20px'}}>
                  <label style={{display:'block',fontSize:'12px',fontWeight:'700',marginBottom:'8px'}}>Group Type</label>
                  <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                    {[["class","🏫","Class / Year"],["church","⛪","Church"],["club","🏆","Club"],["hostel","🏠","Hostel"],["freshers","🎓","Freshers"],["other","👥","Other"]].map(([id,icon,label])=>(
                      <button key={id} type="button" onClick={()=>setCreateGroupData({...createGroupData,type:id})} style={{padding:'8px 14px',borderRadius:'10px',border:createGroupData.type===id?'2px solid #06d6c7':'1.5px solid #e2e6ea',background:createGroupData.type===id?'#f0fffe':'#fff',fontSize:'13px',fontWeight:createGroupData.type===id?'700':'400',cursor:'pointer'}}>{icon} {label}</button>
                    ))}
                  </div>
                </div>

                <button onClick={createGroup} disabled={uploading||!createGroupData.name.trim()} style={{width:'100%',padding:'14px',background:'#06d6c7',color:'#0f1b2d',border:'none',borderRadius:'12px',fontSize:'16px',fontWeight:'700',cursor:uploading?'wait':'pointer',opacity:!createGroupData.name.trim()?0.6:1}}>
                  {uploading ? "Creating..." : "✓ Create Group"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============ GROUP DETAIL ============ */}
      {page==="groupDetail"&&viewingGroup&&(
        <GroupDetailPage
          db={db}
          storage={storage}
          group={viewingGroup}
          user={user}
          userName={userName}
          userAvatar={userAvatar}
          onJoinGroup={() => joinGroup(viewingGroup)}
          joiningGroup={joiningGroup}
          onBack={() => {
            if (groupInternalBackRef.current?.()) return;
            closeGroupDetail();
          }}
          onShareGroup={() => {
            const link = viewingGroup.inviteLink?.startsWith("http")
              ? viewingGroup.inviteLink
              : `${window.location.origin}/g/${viewingGroup.inviteCode}`;
            if (navigator.share) {
              navigator.share({ title: viewingGroup.name, text: `Join ${viewingGroup.name} on Kampasika`, url: link });
            } else {
              navigator.clipboard?.writeText(link).then(() => {
                setSuccess("Link copied!");
                setTimeout(() => setSuccess(""), 2000);
              });
            }
          }}
          onLeaveGroup={closeGroupDetail}
          onMarkRead={markGroupRead}
          onBackHandlerChange={(handler) => {
            groupInternalBackRef.current = handler;
          }}
          initialTab={groupInitialView.tab}
          initialCollectionId={groupInitialView.collectionId}
          initialCollection={groupInitialView.collection}
          initialSource={groupInitialView.source}
          groupHasUnread={
            viewingGroup.active !== false
            && viewingGroup.lastActivityByUid !== user?.uid
            && viewingGroup.activityAt?.toMillis
            && viewingGroup.activityAt.toMillis() > (groupReadAt[viewingGroup.id] || 0)
          }
          groupReadAtValue={groupReadAt[viewingGroup.id] || 0}
          onGroupUpdated={(updatedGroup) => {
            setViewingGroup(updatedGroup);
            setGroups(prev => prev.map(group => group.id === updatedGroup.id ? { ...group, ...updatedGroup } : group));
          }}
          onOpenScanner={openScanner}
          onError={(err) => setError(err.message || String(err))}
          onSuccess={(msg) => {
            setSuccess(msg);
            setTimeout(() => setSuccess(""), 2500);
          }}
        />
      )}

      {false && page==="groupDetail"&&viewingGroup&&(
        <div style={{width:"100%",flex:1,overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",boxSizing:"border-box",paddingBottom:"100px",background:"#f4f6f8"}}>
          <div style={{background:"#075e54",color:"#fff",padding:"14px 16px 16px",margin:"0 0 12px",boxShadow:"0 2px 8px rgba(0,0,0,0.12)"}}>
            <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"12px"}}>
              <div style={{width:"48px",height:"48px",borderRadius:"50%",background:"rgba(255,255,255,0.18)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"18px",fontWeight:"800",flexShrink:0}}>{(viewingGroup.name || "G").slice(0,2).toUpperCase()}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"18px",fontWeight:"800",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{viewingGroup.name}</div>
                <div style={{fontSize:"12px",color:"rgba(255,255,255,0.78)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{groupMembers.length || viewingGroup.memberCount || 0} members{currentGroupMember?.role ? ` - ${currentGroupMember.role}` : ""}</div>
              </div>
              <button onClick={()=>{ const link = viewingGroup.inviteLink || `https://kampasika.org/g/${viewingGroup.inviteCode}`; if (navigator.share) { navigator.share({ title: viewingGroup.name, text: `Join ${viewingGroup.name} on Kampasika`, url: link }); } else { navigator.clipboard?.writeText(link).then(()=>{ setSuccess("Link copied!"); setTimeout(()=>setSuccess(""),2000); }); } }} style={{background:"rgba(255,255,255,0.16)",color:"#fff",border:"1px solid rgba(255,255,255,0.25)",borderRadius:"999px",padding:"7px 12px",fontSize:"12px",fontWeight:"700",cursor:"pointer",flexShrink:0}}>Share</button>
            </div>
            {viewingGroup.desc && <div style={{fontSize:"13px",lineHeight:1.45,color:"rgba(255,255,255,0.86)",marginBottom:"12px"}}>{viewingGroup.desc}</div>}
            {!currentGroupMember && user && (
              <button onClick={()=>joinGroup(viewingGroup)} disabled={joiningGroup} style={{width:"100%",padding:"11px",background:"#fff",color:"#075e54",border:"none",borderRadius:"10px",fontSize:"14px",fontWeight:"800",cursor:joiningGroup?"wait":"pointer",marginBottom:"12px"}}>{joiningGroup ? "Joining..." : "Join Group"}</button>
            )}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"6px",background:"rgba(0,0,0,0.16)",borderRadius:"10px",padding:"4px"}}>
              {[
                ["announcements","Chats"],
                ["payments","Payments"],
                ["members","Members"],
              ].map(([id,label])=>(
                <button key={id} onClick={()=>setGroupViewTab(id)} style={{padding:"9px 6px",border:"none",borderRadius:"8px",background:groupViewTab===id?"#fff":"transparent",color:groupViewTab===id?"#075e54":"#fff",fontSize:"12px",fontWeight:"800",cursor:"pointer"}}>{label}</button>
              ))}
            </div>
          </div>

          {groupViewTab==="announcements" && (
            <div style={{margin:"0 12px 16px"}}>
              {isGroupAdmin(viewingGroup) && (
                <div style={{background:"#fff",borderRadius:"8px",padding:"12px",border:"1px solid #e2e6ea",marginBottom:"10px"}}>
                  <textarea value={newAnnouncement} onChange={e=>setNewAnnouncement(e.target.value)} placeholder="Post an announcement like you would in WhatsApp..." rows={3} style={{width:"100%",border:"none",outline:"none",fontSize:"14px",fontFamily:"inherit",resize:"none",boxSizing:"border-box",marginBottom:"8px"}} />
                  <button onClick={postAnnouncement} disabled={postingAnnouncement||!newAnnouncement.trim()} style={{padding:"10px 16px",background:"#075e54",color:"#fff",border:"none",borderRadius:"8px",fontSize:"13px",fontWeight:"800",cursor:"pointer",opacity:!newAnnouncement.trim()?0.5:1}}>{postingAnnouncement ? "Posting..." : "Post"}</button>
                </div>
              )}
              {groupAnnouncements.length === 0 ? (
                <div style={{textAlign:"center",padding:"28px 16px",background:"#fff",borderRadius:"8px",color:"#8a9bb0",fontSize:"13px"}}>No announcements yet.</div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                  {groupAnnouncements.map(ann=>(
                    <div key={ann.id} style={{background:"#dcf8c6",borderRadius:"8px",padding:"11px 12px",boxShadow:"0 1px 2px rgba(0,0,0,0.08)",maxWidth:"92%",alignSelf:"flex-start"}}>
                      <div style={{fontSize:"12px",fontWeight:"800",color:"#075e54",marginBottom:"5px"}}>{ann.authorName || "Admin"}</div>
                      <div style={{fontSize:"14px",lineHeight:1.5,color:"#0f1b2d",whiteSpace:"pre-wrap"}}>{ann.text}</div>
                      <div style={{fontSize:"10px",color:"#667781",marginTop:"6px",textAlign:"right"}}>{ann.createdAt ? ann.createdAt.toLocaleDateString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : ""}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {groupViewTab==="payments" && (
            <div style={{margin:"0 12px 16px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
                <div style={{fontSize:"14px",fontWeight:"800",color:"#0f1b2d"}}>Payment trackers</div>
                {isGroupAdmin(viewingGroup) && <button onClick={()=>{ setCreateCollectionData(prev=>({...prev,communityName:viewingGroup.name,groupId:viewingGroup.id})); setPage("createCollection"); }} style={{padding:"8px 12px",background:"#25d366",color:"#063b24",border:"none",borderRadius:"8px",fontSize:"12px",fontWeight:"800",cursor:"pointer"}}>New</button>}
              </div>
              {collections.filter(c=>(c.communityName||"").trim()===viewingGroup.name.trim()||c.groupId===viewingGroup.id).length === 0 ? (
                <div style={{textAlign:"center",padding:"28px 16px",background:"#fff",borderRadius:"8px",color:"#8a9bb0",fontSize:"13px"}}>No payment trackers yet.</div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                  {collections.filter(c=>(c.communityName||"").trim()===viewingGroup.name.trim()||c.groupId===viewingGroup.id).map(col=>{
                    const target = col.expectedPeople || col.totalOrders || 0;
                    const paidPercent = target > 0 ? Math.round(((col.totalPaid || 0) / target) * 100) : 0;
                    return (
                      <div key={col.id} onClick={async()=>{setViewingCollection(col);setMyOrderId(null);setPaymentConfirmed(false);loadCollectionOrders(col.id);setOrderFormData({...orderFormData,selectedOption:"",paymentRef:"",amountPaid:"",payerName:"",studentName:userName,paymentProofFile:null,paymentProofPreview:null});setPage("collectionDetail");}} style={{background:"#fff",borderRadius:"8px",padding:"14px",cursor:"pointer",border:"1px solid #e2e6ea"}}>
                        <div style={{display:"flex",justifyContent:"space-between",gap:"10px",alignItems:"flex-start"}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:"15px",fontWeight:"800",color:"#0f1b2d",marginBottom:"3px"}}>{col.title}</div>
                            <div style={{fontSize:"12px",color:"#f59e0b",fontWeight:"700"}}>{col.price?.toLocaleString()} TSh per person - {col.totalOrders || 0} joined</div>
                          </div>
                          <div style={{fontSize:"12px",fontWeight:"800",color:paidPercent>=100?"#22c55e":"#0d9488",background:paidPercent>=100?"#f0fdf4":"#ccfbf1",padding:"4px 8px",borderRadius:"999px",flexShrink:0}}>{paidPercent}% paid</div>
                        </div>
                        <div style={{height:"6px",background:"#eef2f7",borderRadius:"999px",overflow:"hidden",marginTop:"12px"}}><div style={{height:"100%",width:`${Math.min(paidPercent,100)}%`,background:paidPercent>=100?"#22c55e":"#06d6c7",borderRadius:"999px"}} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {groupViewTab==="members" && (
            <div style={{margin:"0 12px 16px"}}>
              <div style={{fontSize:"14px",fontWeight:"800",color:"#0f1b2d",marginBottom:"10px"}}>Members</div>
              {groupMembers.length === 0 ? (
                <div style={{textAlign:"center",padding:"28px 16px",background:"#fff",borderRadius:"8px",color:"#8a9bb0",fontSize:"13px"}}>No members loaded yet.</div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                  {groupMembers.map(member => (
                    <div key={member.uid || member.id} style={{background:"#fff",border:"1px solid #e2e6ea",borderRadius:"8px",padding:"12px",display:"flex",alignItems:"center",gap:"10px"}}>
                      <div style={{width:"38px",height:"38px",borderRadius:"50%",background:member.avatarUrl?`url(${member.avatarUrl}) center/cover`:"#075e54",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:"800",flexShrink:0}}>{!member.avatarUrl && (member.name || member.email || "?").slice(0,2).toUpperCase()}</div>
                      <div style={{flex:1,minWidth:0}}><div style={{fontSize:"14px",fontWeight:"800",color:"#0f1b2d",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{member.name || member.email || "Member"}</div><div style={{fontSize:"11px",color:"#667781"}}>{member.role || "member"}</div></div>
                    </div>
                  ))}
                </div>
              )}
              {isGroupAdmin(viewingGroup) && (
                <div style={{marginTop:"12px",background:"#fff",borderRadius:"8px",padding:"12px",border:"1px solid #e2e6ea"}}>
                  <div style={{fontSize:"13px",fontWeight:"800",color:"#0f1b2d",marginBottom:"8px"}}>Admin tools</div>
                  <div style={{display:"flex",gap:"8px"}}><input type="email" id="coAdminEmail" placeholder="co-admin email" style={{flex:1,padding:"10px",border:"1.5px solid #e2e6ea",borderRadius:"8px",fontSize:"14px",outline:"none",boxSizing:"border-box"}}/><button onClick={async()=>{ const emailInput = document.getElementById("coAdminEmail"); const email = emailInput?.value?.trim(); if (!email) return; try { await updateDoc(doc(db, "groups", viewingGroup.id), { coAdmins: [...(viewingGroup.coAdmins||[]), email] }); setViewingGroup({...viewingGroup, coAdmins:[...(viewingGroup.coAdmins||[]),email]}); emailInput.value = ""; setSuccess("Co-admin added!"); setTimeout(()=>setSuccess(""),2000); } catch(e){ setError("Failed: "+e.message); } }} style={{padding:"10px 14px",background:"#075e54",color:"#fff",border:"none",borderRadius:"8px",fontSize:"13px",fontWeight:"800",cursor:"pointer"}}>Add</button></div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============ COMMUNITY DETAIL ============ */}
      {page==="communityDetail"&&viewingCommunity&&(
        <div style={{width:'100%',flex:1,overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',boxSizing:'border-box',paddingBottom:'100px'}}>
          <div style={{margin:'0 16px 12px 16px',background:'#f0fffe',border:'1px solid #99f0ee',borderRadius:'14px',padding:'14px'}}>
            <h3 style={{margin:0,fontSize:'18px',fontWeight:'700',color:'#0f766e'}}>{viewingCommunity.name}</h3>
            <div style={{marginTop:'6px',fontSize:'12px',color:'#7c2d12'}}>{viewingCommunity.items.length} active collections</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:'10px',margin:'0 16px'}}>
            {viewingCommunity.items.map(col => {
              const target = col.expectedPeople || col.totalOrders || 0;
              const paidPercent = target > 0 ? Math.round((col.totalPaid / target) * 100) : 0;
              return (
                <div key={col.id} onClick={async()=>{setViewingCollection(col);setMyOrderId(null);setPaymentConfirmed(false);loadCollectionOrders(col.id);setOrderFormData({...orderFormData,selectedOption:"",paymentRef:"",amountPaid:"",payerName:"",studentName:userName,paymentProofFile:null,paymentProofPreview:null});setPage("collectionDetail");}} style={{background:'#fff',borderRadius:'14px',padding:'16px',cursor:'pointer',border:'1px solid #e2e6ea'}}>
                  <div style={{display:'flex',gap:'12px',alignItems:'center'}}>
                    {col.photoUrl ? (
                      <img src={col.photoUrl} alt="" style={{width:'56px',height:'56px',objectFit:'cover',borderRadius:'10px',flexShrink:0}}/>
                    ) : (
                      <div style={{width:'56px',height:'56px',borderRadius:'10px',background:'linear-gradient(135deg,#0d9488,#14b8a6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'24px',flexShrink:0}}>📋</div>
                    )}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'2px'}}>{col.title}</div>
                      <div style={{fontSize:'13px',color:'#6b7280',marginBottom:'4px'}}>{col.communityName || col.universityName} • {(()=>{const t=col.collectionType||"order";const m={order:"Group Order",event:"Event",contribution:"Contribution",freshers:"Freshers Support"};return m[t]||t;})()}</div>
                      <div style={{fontSize:'11px',color:'#8a9bb0',marginBottom:'4px'}}>by {col.userName}</div>
                      <div style={{fontFamily:'serif',fontSize:'16px',fontWeight:'700',color:'#f59e0b'}}>{col.price?.toLocaleString()} TSh</div>
                    </div>
                  </div>
                  <div style={{marginTop:'12px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px',color:'#6b7280',marginBottom:'4px'}}>
                      <span>{col.totalOrders || 0}{col.expectedPeople ? `/${col.expectedPeople}` : ''} ordered</span>
                      <span>{col.totalPaid || 0} paid ({paidPercent}%)</span>
                    </div>
                    <div style={{height:'6px',background:'#f4f6f8',borderRadius:'3px',overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${Math.min(paidPercent,100)}%`,background:paidPercent>=100?'#22c55e':'#06d6c7',borderRadius:'3px',transition:'width 0.3s'}}/>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ COLLECTIONS / ORDERS TRACKER ============ */}
      {page==="collections"&&(
        <div style={{width:'100%',flex:1,overflowY:'auto',overflowX:'hidden',WebkitOverflowScrolling:'touch',boxSizing:'border-box',paddingBottom:'100px'}}>
          
          <div style={{background:'linear-gradient(135deg,#0d9488 0%,#14b8a6 100%)',borderRadius:'18px',padding:'20px 18px',margin:'0 16px 16px 16px',width:'calc(100% - 32px)',boxSizing:'border-box'}}>
            <h2 style={{fontFamily:'serif',fontSize:'22px',fontWeight:'700',color:'#0f1b2d',marginBottom:'6px'}}>All Orders & Events</h2>
            <p style={{color:'rgba(15,27,45,0.7)',fontSize:'13px',marginBottom:'14px',lineHeight:1.5}}>T-shirts, event tickets, class contributions — browse everything or open a community first.</p>
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
              <button onClick={()=>setPage("communities")} style={{padding:'10px 18px',background:'#fff',color:'#0f1b2d',border:'1.5px solid rgba(15,27,45,0.15)',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>🏫 By group</button>
              <button onClick={()=>{user ? setPage("createCollection") : requireAuth("create collection",()=>setPage("createCollection"));}} style={{padding:'10px 18px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Create order / event</button>
            </div>
          </div>

          {/* Search collections */}
          {collections.length > 2 && (
            <>
              <div style={{margin:'0 16px 8px 16px',display:'flex',alignItems:'center',background:'#fff',borderRadius:'10px',padding:'8px 12px',border:'1.5px solid #e2e6ea'}}>
                <input type="text" placeholder="Search orders, events, communities..." value={collectionSearchQ}
                  onChange={e => {
                    setCollectionSearchQ(e.target.value);
                    if (!e.target.value.trim()) {
                      setCommittedCollectionSearchQ("");
                      clearAISearch();
                    }
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') commitCollectionsSearch(collectionSearchQ); }}
                  style={{flex:1,border:'none',background:'none',outline:'none',fontSize:'14px'}}/>
                <button type="button" onClick={() => commitCollectionsSearch(collectionSearchQ)} aria-label="Search" style={{background:'none',border:'none',cursor:'pointer',fontSize:'14px',padding:'4px 6px',color:'#6b7280'}}>🔍</button>
              </div>
              <AISearchBadge parsed={aiParsed} isAIActive={isAIActive} onClear={() => { clearAISearch(); setCollectionSearchQ(""); setCommittedCollectionSearchQ(""); }} />
              {aiSearching && <div style={{padding:'6px 16px 8px',fontSize:'11px',color:'#0d9488'}}>✨ AI is thinking...</div>}
            </>
          )}

          {collections.length === 0 ? (
            <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px',margin:'0 16px'}}>
              <div style={{fontSize:'40px',marginBottom:'16px'}}>📋</div>
              <div style={{fontSize:'16px',fontWeight:'600'}}>No active orders or events</div>
              <div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Class reps & councils can create group orders and event registrations for their group.</div>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:'10px',margin:'0 16px'}}>
              {(aiParsed && committedCollectionSearchQ.trim()
                ? filterCollections(collections, aiParsed)
                : collections.filter(col => {
                    if (!committedCollectionSearchQ.trim()) return true;
                    const q = committedCollectionSearchQ.toLowerCase();
                    return col.title?.toLowerCase().includes(q) || col.userName?.toLowerCase().includes(q) || col.description?.toLowerCase().includes(q) || col.communityName?.toLowerCase().includes(q) || col.communityType?.toLowerCase().includes(q) || col.collectionType?.toLowerCase().includes(q);
                  })
              ).map(col => {
                const target = col.expectedPeople || col.totalOrders || 0;
                const paidPercent = target > 0 ? Math.round((col.totalPaid / target) * 100) : 0;
                // eslint-disable-next-line no-unused-vars
                const orderedPercent = target > 0 ? Math.round((col.totalOrders / target) * 100) : 0;
                return (
                  <div key={col.id} onClick={async()=>{setViewingCollection(col);setMyOrderId(null);setPaymentConfirmed(false);loadCollectionOrders(col.id);setOrderFormData({...orderFormData,selectedOption:"",paymentRef:"",amountPaid:"",payerName:"",studentName:userName,paymentProofFile:null,paymentProofPreview:null});setPage("collectionDetail");}} style={{background:'#fff',borderRadius:'14px',padding:'16px',cursor:'pointer',border:'1px solid #e2e6ea'}}>
                    <div style={{display:'flex',gap:'12px',alignItems:'center'}}>
                      {col.photoUrl ? (
                        <img src={col.photoUrl} alt="" style={{width:'56px',height:'56px',objectFit:'cover',borderRadius:'10px',flexShrink:0}}/>
                      ) : (
                        <div style={{width:'56px',height:'56px',borderRadius:'10px',background:'linear-gradient(135deg,#0d9488,#14b8a6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'24px',flexShrink:0}}>📋</div>
                      )}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'2px'}}>{col.title}</div>
                        <div style={{fontSize:'13px',color:'#6b7280',marginBottom:'4px'}}>{col.communityName || col.universityName} • {(()=>{const t=col.collectionType||"order";const m={order:"Group Order",event:"Event",contribution:"Contribution",freshers:"Freshers Support"};return m[t]||t;})()}</div>
                        <div style={{fontSize:'11px',color:'#8a9bb0',marginBottom:'4px'}}>by {col.userName}</div>
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
                        <div style={{height:'100%',width:`${Math.min(paidPercent,100)}%`,background:paidPercent>=100?'#22c55e':'#06d6c7',borderRadius:'3px',transition:'width 0.3s'}}/>
                      </div>
                    </div>
                    {col.options && col.options.length > 0 && (
                      <div style={{display:'flex',gap:'4px',marginTop:'8px',flexWrap:'wrap'}}>
                        {col.options.slice(0,4).map((opt,i)=><span key={i} style={{fontSize:'10px',background:'#ccfbf1',color:'#0f766e',padding:'2px 8px',borderRadius:'8px'}}>{opt}</span>)}
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
            <h2 style={{fontSize:'20px',fontWeight:'700',marginBottom:'16px'}}>{showCreateCollectionSuccess?"Success!":"New order / event"}</h2>
            {showCreateCollectionSuccess ? (
              <div style={{textAlign:'center',padding:'32px 16px'}}>
                <div style={{fontSize:'56px',marginBottom:'16px'}}>🎉</div>
                <div style={{fontSize:'20px',fontWeight:'700',marginBottom:'4px'}}>Created successfully!</div>
                <div style={{fontSize:'13px',color:'#8a9bb0',marginBottom:'20px'}}>Share the link with your class or group</div>
                {lastCreatedCollectionId && (
                  <>
                    {/* PRIMARY — WhatsApp share */}
                    <button onClick={()=>{
                      const link = `https://kampasika.org/c/${lastCreatedCollectionId}`;
                      const msg = `📋 New collection on Kampasika!\n\nOrder here: ${link}`;
                      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank');
                    }} style={{width:'100%',padding:'14px',background:'#25D366',color:'#fff',border:'none',borderRadius:'12px',fontSize:'16px',fontWeight:'600',cursor:'pointer',marginBottom:'8px',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}>📲 Share on WhatsApp</button>

                    {/* Copy link */}
                    <button onClick={()=>{
                      const link = `https://kampasika.org/c/${lastCreatedCollectionId}`;
                      navigator.clipboard?.writeText(link).then(()=>{setSuccess("Link copied!");setTimeout(()=>setSuccess(""),2000);});
                    }} style={{width:'100%',padding:'11px',background:'#f4f6f8',color:'#0f1b2d',border:'1px solid #e2e6ea',borderRadius:'12px',fontSize:'14px',fontWeight:'600',cursor:'pointer',marginBottom:'12px'}}>🔗 Copy Link</button>

                    {/* SECONDARY — QR collapsible */}
                    <button onClick={()=>setShowEntryQR(v=>!v)} style={{width:'100%',padding:'10px',background:'none',color:'#8a9bb0',border:'1px dashed #d1d5db',borderRadius:'10px',fontSize:'13px',fontWeight:'500',cursor:'pointer',marginBottom: showEntryQR ? '10px' : '12px'}}>
                      {showEntryQR ? '▲ Hide QR code' : '▼ Show QR for printing / display'}
                    </button>

                    {showEntryQR && (
                      <div style={{background:'#f4f6f8',borderRadius:'16px',padding:'20px',marginBottom:'12px',textAlign:'center'}}>
                        <div style={{fontSize:'13px',fontWeight:'700',color:'#0f1b2d',marginBottom:'4px'}}>📋 Entry QR</div>
                        <div style={{fontSize:'11px',color:'#8a9bb0',marginBottom:'14px'}}>Useful for posters, noticeboards, or projecting in a meeting</div>
                        <div style={{display:'inline-block',padding:'12px',background:'#fff',borderRadius:'12px',border:'2px solid #e2e6ea'}}>
                          <QRCodeSVG
                            value={`https://kampasika.org/c/${lastCreatedCollectionId}`}
                            size={180}
                            bgColor="#ffffff"
                            fgColor="#0f1b2d"
                            level="M"
                          />
                        </div>
                        <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'10px'}}>Anyone who scans this with their camera lands directly on this collection</div>
                      </div>
                    )}
                  </>
                )}
                <button onClick={()=>{setShowCreateCollectionSuccess(false);setPage("communities");}} style={{width:'100%',padding:'14px',background:'#0d9488',color:'#0f1b2d',border:'none',borderRadius:'12px',fontSize:'16px',fontWeight:'600',cursor:'pointer',marginBottom:'12px'}}>View Groups</button>
                <button onClick={()=>{setShowCreateCollectionSuccess(false);setPage("home");}} style={{width:'100%',padding:'14px',background:'#f4f6f8',color:'#0f1b2d',border:'none',borderRadius:'12px',fontSize:'16px',fontWeight:'600',cursor:'pointer'}}>← Home</button>
              </div>
            ) : (
              <>
                <div style={{background:'#ccfbf1',padding:'12px',borderRadius:'10px',marginBottom:'16px',fontSize:'13px',color:'#0f766e',lineHeight:1.5}}>
                  📋 <strong>For class reps & councils:</strong> Create an order or event — t-shirts, tickets, contributions. Students join by scanning your QR or link.
                </div>
                {/* PHOTO */}
                <input type="file" id="collection-photo" accept="image/*" multiple style={{display:'none'}} onChange={handleCollectionPhotoSelect}/>
                <label htmlFor="collection-photo" style={{display:'block',marginBottom:'16px',cursor:'pointer'}}>
                  {createCollectionData.photoPreviews.length > 0 ? (
                    <div><img src={createCollectionData.photoPreviews[0]} alt="" style={{width:'100%',height:'180px',objectFit:'cover',borderRadius:'12px'}}/></div>
                  ) : (
                    <div style={{border:'2px dashed #e2e6ea',borderRadius:'12px',padding:'24px',textAlign:'center',background:'#f9fafb'}}>
                      <div style={{fontSize:'36px',marginBottom:'8px'}}>📸</div>
                      <div style={{fontSize:'14px',fontWeight:'600'}}>Add a photo (optional)</div>
                      <div style={{fontSize:'12px',color:'#8a9bb0'}}>e.g. the t-shirt design, event poster</div>
                    </div>
                  )}
                </label>

                {/* SIMPLE REQUIRED FIELDS */}
                <div style={{marginBottom:'14px'}}>
                  <label style={{display:'block',fontSize:'12px',fontWeight:'700',marginBottom:'6px'}}>Title *</label>
                  <input type="text" placeholder="e.g. ARU Catholic T-Shirt Order, Bagamoyo Trip" value={createCollectionData.title} onChange={e=>setCreateCollectionData({...createCollectionData,title:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/>
                </div>

                <div style={{marginBottom:'14px'}}>
                  <label style={{display:'block',fontSize:'12px',fontWeight:'700',marginBottom:'6px'}}>Price per person (TSh) *</label>
                  <input type="number" placeholder="e.g. 15000" value={createCollectionData.price} onChange={e=>setCreateCollectionData({...createCollectionData,price:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/>
                </div>

                {/* PAYMENT METHOD — simple single field */}
                <div style={{marginBottom:'14px'}}>
                  <label style={{display:'block',fontSize:'12px',fontWeight:'700',marginBottom:'6px'}}>Payment number (M-Pesa / Tigo / Airtel) *</label>
                  <input type="tel" placeholder="e.g. 0712345678" value={createCollectionData.paymentMethods[0]?.number||''} onChange={e=>{const updated=[{network:createCollectionData.paymentMethods[0]?.network||'M-Pesa',number:e.target.value,name:createCollectionData.paymentMethods[0]?.name||'',saved:true}];setCreateCollectionData({...createCollectionData,paymentMethods:updated});}} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/>
                  <div style={{display:'flex',gap:'6px',marginTop:'8px',flexWrap:'wrap'}}>
                    {["M-Pesa","Tigo Pesa","Airtel Money","Halopesa"].map(net=>(
                      <button key={net} type="button" onClick={()=>{const updated=[{...(createCollectionData.paymentMethods[0]||{}),network:net,saved:true}];setCreateCollectionData({...createCollectionData,paymentMethods:updated});}} style={{padding:'5px 12px',borderRadius:'8px',border:(createCollectionData.paymentMethods[0]?.network||'M-Pesa')===net?'2px solid #0d9488':'1px solid #e2e6ea',background:(createCollectionData.paymentMethods[0]?.network||'M-Pesa')===net?'#ccfbf1':'#fff',fontSize:'12px',cursor:'pointer',fontWeight:(createCollectionData.paymentMethods[0]?.network||'M-Pesa')===net?'700':'400'}}>{net}</button>
                    ))}
                  </div>
                </div>

                {/* OPTIONS — clear and bold */}
                <div style={{marginBottom:'14px'}}>
                  <label style={{display:'block',fontSize:'12px',fontWeight:'700',marginBottom:'4px'}}>Options (optional)</label>
                  <div style={{fontSize:'11px',color:'#8a9bb0',marginBottom:'6px'}}>e.g. for t-shirts: <strong>S, M, L, XL</strong> — or leave blank if no options needed</div>
                  <input type="text" placeholder="S, M, L, XL  or  Chicken, Beef, Vegetarian" value={createCollectionData.options} onChange={e=>setCreateCollectionData({...createCollectionData,options:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'15px',outline:'none',boxSizing:'border-box'}}/>
                  {createCollectionData.options.trim() && (
                    <div style={{marginTop:'8px',display:'flex',gap:'6px',flexWrap:'wrap'}}>
                      {createCollectionData.options.split(',').map(o=>o.trim()).filter(o=>o).map((o,i)=>(
                        <span key={i} style={{padding:'5px 12px',background:'#ccfbf1',color:'#0f766e',borderRadius:'8px',fontSize:'13px',fontWeight:'700',border:'1.5px solid #99f0ee'}}>{o}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* ADVANCED TOGGLE */}
                <button type="button" onClick={()=>setShowAdvancedCollection(v=>!v)} style={{width:'100%',padding:'10px',background:'#f4f6f8',color:'#0f1b2d',border:'1px solid #e2e6ea',borderRadius:'10px',fontSize:'13px',fontWeight:'600',cursor:'pointer',marginBottom:'14px',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
                  {showAdvancedCollection ? '▲ Hide advanced options' : '▼ Advanced options (community, deadline, co-admins...)'}
                </button>

                {showAdvancedCollection && (
                  <div style={{marginBottom:'14px',display:'flex',flexDirection:'column',gap:'14px'}}>
                    <div>
                      <label style={{display:'block',fontSize:'12px',fontWeight:'700',marginBottom:'6px'}}>Community / group name</label>
                      <input type="text" placeholder="e.g. TUCASA ARU Community, Architecture Year 1" value={createCollectionData.communityName} onChange={e=>setCreateCollectionData({...createCollectionData,communityName:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/>
                      <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>Helps students find orders from their people.</div>
                    </div>

                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                      <div><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Community type</label><select value={createCollectionData.communityType} onChange={e=>setCreateCollectionData({...createCollectionData,communityType:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none',boxSizing:'border-box'}}><option value="class">Class / Year</option><option value="church">Church</option><option value="club">Club</option><option value="hostel">Hostel</option><option value="freshers">Freshers</option><option value="other">Other</option></select></div>
                      <div><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Type</label><select value={createCollectionData.collectionType} onChange={e=>setCreateCollectionData({...createCollectionData,collectionType:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none',boxSizing:'border-box'}}><option value="order">Group order</option><option value="event">Event registration</option><option value="contribution">Contribution</option><option value="freshers">Freshers support</option></select></div>
                    </div>

                    <div>
                      <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Description (optional)</label>
                      <textarea placeholder="More details about the order or event..." value={createCollectionData.desc} onChange={e=>setCreateCollectionData({...createCollectionData,desc:e.target.value})} rows={3} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/>
                    </div>

                    <div>
                      <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Expected number of people</label>
                      <input type="number" placeholder="e.g. 50" value={createCollectionData.expectedPeople} onChange={e=>setCreateCollectionData({...createCollectionData,expectedPeople:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/>
                    </div>

                    {/* Additional payment methods */}
                    <div>
                      <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'8px'}}>Additional payment methods</label>
                      {createCollectionData.paymentMethods.slice(1).map((pm,idx)=>
                        pm.saved ? (
                          <div key={idx+1} style={{background:'#f0fdf4',borderRadius:'8px',padding:'10px',marginBottom:'8px',border:'1px solid #bbf7d0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <span style={{fontSize:'13px',fontWeight:'600'}}>{pm.network}: {pm.number}{pm.name?` (${pm.name})`:''}</span>
                            <div style={{display:'flex',gap:'8px'}}>
                              <button onClick={()=>{const updated=[...createCollectionData.paymentMethods];updated[idx+1]={...updated[idx+1],saved:false};setCreateCollectionData({...createCollectionData,paymentMethods:updated});}} style={{fontSize:'11px',color:'#3b82f6',background:'none',border:'none',cursor:'pointer',fontWeight:'600'}}>Edit</button>
                              <button onClick={()=>{const updated=[...createCollectionData.paymentMethods];updated.splice(idx+1,1);setCreateCollectionData({...createCollectionData,paymentMethods:updated});}} style={{fontSize:'11px',color:'#ef4444',background:'none',border:'none',cursor:'pointer',fontWeight:'600'}}>✕</button>
                            </div>
                          </div>
                        ) : (
                          <div key={idx+1} style={{background:'#f9fafb',borderRadius:'10px',padding:'12px',marginBottom:'8px',border:'1.5px solid #0d9488'}}>
                            <div style={{display:'flex',justifyContent:'space-between',marginBottom:'8px'}}><span style={{fontSize:'12px',fontWeight:'600',color:'#6b7280'}}>Method {idx+2}</span><button onClick={()=>{const updated=[...createCollectionData.paymentMethods];updated.splice(idx+1,1);setCreateCollectionData({...createCollectionData,paymentMethods:updated});}} style={{fontSize:'11px',color:'#ef4444',background:'none',border:'none',cursor:'pointer',fontWeight:'600'}}>✕ Cancel</button></div>
                            <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'8px'}}>{["M-Pesa","Tigo Pesa","Airtel Money","Halopesa","AzamPesa","CRDB","NMB"].map(net=>(<button key={net} type="button" onClick={()=>{const updated=[...createCollectionData.paymentMethods];updated[idx+1]={...updated[idx+1],network:net};setCreateCollectionData({...createCollectionData,paymentMethods:updated});}} style={{padding:'4px 10px',borderRadius:'6px',border:pm.network===net?'2px solid #0d9488':'1px solid #e2e6ea',background:pm.network===net?'#ccfbf1':'#fff',fontSize:'11px',cursor:'pointer',fontWeight:pm.network===net?'600':'400'}}>{net}</button>))}</div>
                            <input type="tel" placeholder="Number" value={pm.number} onChange={e=>{const updated=[...createCollectionData.paymentMethods];updated[idx+1]={...updated[idx+1],number:e.target.value};setCreateCollectionData({...createCollectionData,paymentMethods:updated});}} style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'14px',outline:'none',boxSizing:'border-box',marginBottom:'6px'}}/>
                            <input type="text" placeholder="Account name" value={pm.name} onChange={e=>{const updated=[...createCollectionData.paymentMethods];updated[idx+1]={...updated[idx+1],name:e.target.value};setCreateCollectionData({...createCollectionData,paymentMethods:updated});}} style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'14px',outline:'none',boxSizing:'border-box',marginBottom:'8px'}}/>
                            <button onClick={()=>{if(!pm.number.trim()){setError("Please enter a payment number");return;}const updated=[...createCollectionData.paymentMethods];updated[idx+1]={...updated[idx+1],saved:true};setCreateCollectionData({...createCollectionData,paymentMethods:updated});}} style={{width:'100%',padding:'10px',background:'#0d9488',color:'#0f1b2d',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>✓ Save</button>
                          </div>
                        )
                      )}
                      {createCollectionData.paymentMethods.length < 2 && (
                        <button type="button" onClick={()=>setCreateCollectionData({...createCollectionData,paymentMethods:[...createCollectionData.paymentMethods,{network:"Tigo Pesa",number:"",name:"",saved:false}]})} style={{padding:'10px 16px',background:'#fff',color:'#0d9488',border:'1.5px dashed #0d9488',borderRadius:'10px',fontSize:'13px',fontWeight:'600',cursor:'pointer',width:'100%'}}>+ Add Another Payment Method</button>
                      )}
                    </div>

                    <div>
                      <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>👥 Co-admins (optional)</label>
                      <input type="text" placeholder="e.g. john@gmail.com, amina@gmail.com" value={createCollectionData.adminEmails} onChange={e=>setCreateCollectionData({...createCollectionData,adminEmails:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none',boxSizing:'border-box'}}/>
                      <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>Comma-separated emails of others who can manage orders.</div>
                    </div>

                    <div>
                      <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Deadline (optional)</label>
                      <input type="date" value={createCollectionData.deadline} onChange={e=>setCreateCollectionData({...createCollectionData,deadline:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/>
                    </div>
                  </div>
                )}

                <button onClick={handleCreateCollection} disabled={uploading} style={{width:'100%',padding:'14px',background:'#0d9488',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:uploading?'not-allowed':'pointer'}}>{uploading?"Creating...":"📋 Create order / event"}</button>
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
            <div style={{fontSize:'13px',color:'#6b7280',marginBottom:'8px'}}>
              by {viewingCollection.userName} • {viewingCollection.communityName || viewingCollection.universityName}
              {isCollectionAdmin(viewingCollection) && user?.uid !== viewingCollection.userId && (
                <span style={{marginLeft:'8px',fontSize:'11px',background:'#dbeafe',color:'#1e40af',padding:'2px 8px',borderRadius:'6px',fontWeight:'600'}}>👥 Co-admin</span>
              )}
              {user?.uid === viewingCollection.userId && (
                <span style={{marginLeft:'8px',fontSize:'11px',background:'#ccfbf1',color:'#0f766e',padding:'2px 8px',borderRadius:'6px',fontWeight:'600'}}>👑 Creator</span>
              )}
            </div>

            {/* ── Creator action bar ── */}
            {user?.uid === viewingCollection.userId && (
              <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
                <button
                  onClick={() => setEditingCollection(!editingCollection)}
                  style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',padding:'10px',background:'#eff6ff',color:'#1e40af',border:'1.5px solid #bfdbfe',borderRadius:'10px',fontSize:'14px',fontWeight:'700',cursor:'pointer'}}
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => deleteCollection(viewingCollection.id)}
                  style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',padding:'10px',background:'#fee2e2',color:'#991b1b',border:'1.5px solid #fecaca',borderRadius:'10px',fontSize:'14px',fontWeight:'700',cursor:'pointer'}}
                >
                  🗑️ Delete
                </button>
              </div>
            )}
            
            <div style={{fontFamily:'serif',fontSize:'28px',fontWeight:'700',color:'#f59e0b',marginBottom:'12px'}}>{viewingCollection.price?.toLocaleString()} TSh <span style={{fontSize:'14px',fontFamily:'system-ui',fontWeight:'400',color:'#8a9bb0'}}>per person</span></div>

            {(viewingCollection.communityType || viewingCollection.collectionType) && <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'12px'}}><span style={{fontSize:'11px',background:'#ccfbf1',color:'#0f766e',padding:'3px 8px',borderRadius:'8px',fontWeight:'600'}}>{viewingCollection.collectionType || "order"}</span><span style={{fontSize:'11px',background:'#f4f6f8',color:'#6b7280',padding:'3px 8px',borderRadius:'8px',fontWeight:'600'}}>{viewingCollection.communityType || "community"}</span></div>}

            {viewingCollection.description && <p style={{fontSize:'14px',color:'#4a5568',lineHeight:1.6,marginBottom:'16px',whiteSpace:'pre-wrap'}}>{viewingCollection.description}</p>}

            {viewingCollection.deadline && <div style={{fontSize:'13px',color:'#ef4444',fontWeight:'600',marginBottom:'12px'}}>⏰ Deadline: {new Date(viewingCollection.deadline).toLocaleDateString('en',{day:'numeric',month:'long',year:'numeric'})}</div>}

            {/* Stats cards */}
            <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
              <div style={{flex:1,background:'#ccfbf1',borderRadius:'12px',padding:'12px',textAlign:'center'}}>
                <div style={{fontSize:'24px',fontWeight:'700',color:'#f59e0b'}}>{viewingCollection.totalOrders || 0}{viewingCollection.expectedPeople ? <span style={{fontSize:'14px',fontWeight:'400',color:'#f59e0b'}}>/{viewingCollection.expectedPeople}</span> : ''}</div>
                <div style={{fontSize:'11px',color:'#0f766e'}}>Ordered</div>
              </div>
              <div style={{flex:1,background:'#d1fae5',borderRadius:'12px',padding:'12px',textAlign:'center'}}>
                <div style={{fontSize:'24px',fontWeight:'700',color:'#22c55e'}}>{viewingCollection.totalPaid || 0}</div>
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
                <span style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700',color:'#22c55e'}}>{((viewingCollection.totalPaid||0) * viewingCollection.price).toLocaleString()} TSh</span>
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
                    <div style={{height:'100%',width:`${Math.min(100, Math.round(((viewingCollection.totalPaid||0) / viewingCollection.expectedPeople) * 100))}%`,background:((viewingCollection.totalPaid||0) >= viewingCollection.expectedPeople)?'#22c55e':'#06d6c7',borderRadius:'4px',transition:'width 0.3s'}}/>
                  </div>
                  <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px',textAlign:'right'}}>{Math.round(((viewingCollection.totalPaid||0) / viewingCollection.expectedPeople) * 100)}% collected</div>
                </div>
              )}
            </div>

            {/* Payment info (visible to buyers) — shows all payment methods */}
            {(()=>{
              const methods = viewingCollection.paymentMethods || (viewingCollection.payNumber ? [{ network: viewingCollection.payNetwork || "Mobile Money", number: viewingCollection.payNumber, name: viewingCollection.payName }] : []);
              const isAdmin = isCollectionAdmin(viewingCollection);
              if (methods.length === 0) return null;
              return (
                <div style={{background: isAdmin ? '#eff6ff' : '#f0fdf4',borderRadius:'12px',padding:'14px',marginBottom:'16px',border: isAdmin ? '1px solid #bfdbfe' : '1px solid #bbf7d0'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
                    <div style={{fontSize:'14px',fontWeight:'600',color: isAdmin ? '#1e40af' : '#166534'}}>💰 {isAdmin ? 'Collecting via' : 'How to Pay'}</div>
                    {isAdmin && <button onClick={()=>setEditingCollection(!editingCollection)} style={{padding:'6px 12px',background: isAdmin ? '#dbeafe' : '#dcfce7',color: isAdmin ? '#1e40af' : '#166534',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>✏️ Edit</button>}
                  </div>
                  {methods.map((m, i) => (
                    <div key={i} style={{padding:'8px 0',borderTop: i > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none'}}>
                      <div style={{fontSize:'14px',color:'#0f1b2d',fontWeight:'600'}}>{m.network}: {m.number}</div>
                      {m.name && <div style={{fontSize:'12px',color:'#6b7280'}}>Account: {m.name}</div>}
                    </div>
                  ))}
                  {!isAdmin && <div style={{fontSize:'12px',color:'#6b7280',marginTop:'6px'}}>After sending, confirm your payment below</div>}
                </div>
              );
            })()}

            {/* Edit Collection (for creator) */}
            {editingCollection && isCollectionAdmin(viewingCollection) && (
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

            {/* SHARE BUTTON — always visible */}
            <button onClick={()=>{
              const methods = viewingCollection.paymentMethods || (viewingCollection.payNumber ? [{ network: viewingCollection.payNetwork || "Mobile Money", number: viewingCollection.payNumber, name: viewingCollection.payName }] : []);
              let msg = `📋 *${viewingCollection.title}*\n\n`;
              msg += `💰 ${viewingCollection.price?.toLocaleString()} TSh per person\n`;
              if (viewingCollection.deadline) msg += `⏰ Deadline: ${viewingCollection.deadline}\n`;
              if (methods.length > 0) {
                msg += `\n📱 Pay to:\n`;
                methods.forEach(m => { msg += `• ${m.network}: ${m.number}${m.name ? ' ('+m.name+')' : ''}\n`; });
              }
              msg += `\nOrder here: https://kampasika.netlify.app/collection/${viewingCollection.id}`;
              window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank');
            }} style={{width:'calc(100% - 32px)',margin:'0 16px 16px 16px',padding:'14px',background:'#25D366',color:'#fff',border:'none',borderRadius:'12px',fontSize:'15px',fontWeight:'600',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',boxShadow:'0 2px 8px rgba(37,211,102,0.25)'}}>
              📲 Share on WhatsApp
            </button>

            {/* ORDER FORM — for students */}
            {user && viewingCollection.active && (
              <div style={{marginBottom:'16px'}}>

                {/* STEP 1: Place Order — collapses after placed */}
                {!myOrderId ? (
                  <div style={{background:'#fff',borderRadius:'12px',padding:'16px',border:'2px solid #0d9488',marginBottom:'12px'}}>
                    <h3 style={{fontSize:'16px',fontWeight:'700',marginBottom:'4px',color:'#0f1b2d'}}>{(()=>{
                      const ct = viewingCollection.collectionType || "order";
                      const headers = { order:"📝 Place Your Order", event:"🎟 Register for Event", contribution:"💰 Add Yourself", freshers:"🎓 Join Support" };
                      return headers[ct] || headers.order;
                    })()}</h3>
                    <div style={{fontSize:'12px',color:'#8a9bb0',marginBottom:'12px'}}>Required amount: <strong>{viewingCollection.price?.toLocaleString()} TSh</strong></div>
                    
                    <div style={{marginBottom:'12px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'4px'}}>Your Name *</label><input type="text" value={orderFormData.studentName} onChange={e=>setOrderFormData({...orderFormData,studentName:e.target.value})} placeholder="Full name" style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'15px',outline:'none',boxSizing:'border-box'}}/></div>

                    <div style={{marginBottom:'12px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'4px'}}>Phone (optional)</label><input type="tel" value={orderFormData.phone} onChange={e=>setOrderFormData({...orderFormData,phone:e.target.value})} placeholder="0712345678" style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'15px',outline:'none',boxSizing:'border-box'}}/></div>

                    {viewingCollection.options && viewingCollection.options.length > 0 && (
                      <div style={{marginBottom:'12px'}}>
                        <label style={{display:'block',fontSize:'13px',fontWeight:'800',marginBottom:'8px',color:'#0f1b2d'}}>
                          Select Option *
                          <span style={{fontWeight:'400',color:'#ef4444',marginLeft:'4px'}}>— required</span>
                        </label>
                        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                          {viewingCollection.options.map((opt,i)=>(
                            <button key={i} onClick={()=>setOrderFormData({...orderFormData,selectedOption:opt})} style={{padding:'10px 18px',borderRadius:'10px',border:orderFormData.selectedOption===opt?'2.5px solid #0d9488':'2px solid #e2e6ea',background:orderFormData.selectedOption===opt?'#ccfbf1':'#fff',color:'#0f1b2d',fontSize:'15px',fontWeight:'800',cursor:'pointer',transition:'all 0.1s',boxShadow:orderFormData.selectedOption===opt?'0 2px 8px rgba(245,158,11,0.3)':'none'}}>{opt}</button>
                          ))}
                        </div>
                        {!orderFormData.selectedOption && <div style={{fontSize:'11px',color:'#0d9488',marginTop:'6px',fontWeight:'600'}}>⚠ Please select an option above</div>}
                      </div>
                    )}

                    {(()=>{
                      const ct = viewingCollection.collectionType || "order";
                      const labels = {
                        order: { idle: "✓ Place Order", loading: "Placing..." },
                        event: { idle: "🎟 Register for Event", loading: "Registering..." },
                        contribution: { idle: "💰 Add Myself to Collection", loading: "Adding..." },
                        freshers: { idle: "🎓 Join Freshers Support", loading: "Joining..." },
                      };
                      const lbl = labels[ct] || labels.order;
                      return (
                        <button onClick={()=>placeOrder(viewingCollection)} disabled={uploading} style={{width:'100%',padding:'14px',background:'#0d9488',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'700',cursor:uploading?'not-allowed':'pointer',letterSpacing:'0.2px'}}>
                          {uploading ? lbl.loading : lbl.idle}
                        </button>
                      );
                    })()}
                  </div>
                ) : (
                  <div style={{background:'#f0fdf4',borderRadius:'12px',padding:'16px',border:'1.5px solid #bbf7d0',marginBottom:'12px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
                      <span style={{fontSize:'20px'}}>✅</span>
                      <span style={{fontSize:'15px',fontWeight:'700',color:'#166534'}}>{(()=>{const ct=viewingCollection.collectionType||"order";return ct==="event"?"Registered!":ct==="contribution"?"Added to collection!":ct==="freshers"?"Joined!":"Order Placed!";})()}</span>
                    </div>
                    <div style={{fontSize:'13px',color:'#166534',marginBottom:'10px'}}>
                      {(()=>{
                        const methods = viewingCollection.paymentMethods || (viewingCollection.payNumber ? [{ network: viewingCollection.payNetwork || "Mobile Money", number: viewingCollection.payNumber }] : []);
                        return methods.length > 0 ? (
                          <>Send <strong>{viewingCollection.price?.toLocaleString()} TSh</strong> to any of these and confirm below:<br/>{methods.map((m,i)=><span key={i} style={{display:'block',marginTop:'4px'}}>• <strong>{m.network}:</strong> {m.number}{m.name ? ` (${m.name})` : ''}</span>)}</>
                        ) : 'You\'ve been added. Confirm your payment below when ready.';
                      })()}
                    </div>
                    <button onClick={()=>{setMyOrderId(null);setPaymentConfirmed(false);setOrderFormData({...orderFormData,selectedOption:"",studentName:userName,phone:"",paymentRef:"",amountPaid:"",payerName:"",paymentProofFile:null,paymentProofPreview:null});}} style={{padding:'8px 16px',background:'#fff',color:'#166534',border:'1.5px solid #bbf7d0',borderRadius:'8px',fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>
                      {(()=>{const ct=viewingCollection.collectionType||"order";return ct==="event"?"+ Register Another Person":ct==="contribution"?"+ Add Another Person":"+ Place Another Order";})()}
                    </button>
                  </div>
                )}

                {/* STEP 2: Confirm Payment — only shows after order is placed */}
                {myOrderId && !paymentConfirmed && !collectionOrders.find(o=>o.userId===user?.uid)?.paid && (
                  <div style={{background:'#fff',borderRadius:'12px',padding:'16px',border:'2px solid #10b981'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'4px'}}><span style={{fontSize:'16px'}}>💰</span><span style={{fontSize:'15px',fontWeight:'700',color:'#0f1b2d'}}>Confirm Payment</span></div>
                    <div style={{fontSize:'12px',color:'#8a9bb0',marginBottom:'12px'}}>Already sent the money? Fill in your payment details so the rep can verify</div>
                    
                    <div style={{marginBottom:'10px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'4px'}}>Amount Paid (TSh) *</label><input type="number" value={orderFormData.amountPaid} onChange={e=>setOrderFormData({...orderFormData,amountPaid:e.target.value})} placeholder={`${viewingCollection.price?.toLocaleString()}`} style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'15px',outline:'none',boxSizing:'border-box'}}/>{orderFormData.amountPaid && parseInt(orderFormData.amountPaid) < viewingCollection.price && <div style={{fontSize:'11px',color:'#f59e0b',marginTop:'4px',fontWeight:'600'}}>Partial payment - {(viewingCollection.price - parseInt(orderFormData.amountPaid)).toLocaleString()} TSh remaining</div>}</div>

                    <div style={{marginBottom:'10px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'4px'}}>Name on {viewingCollection.payNetwork || 'Mobile Money'} account</label><input type="text" value={orderFormData.payerName} onChange={e=>setOrderFormData({...orderFormData,payerName:e.target.value})} placeholder="e.g. AMINA JUMA (as on M-Pesa)" style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'15px',outline:'none',boxSizing:'border-box'}}/><div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>So the rep can match your payment</div></div>

                    <div style={{marginBottom:'12px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'4px'}}>Transaction Code</label><input type="text" value={orderFormData.paymentRef} onChange={e=>setOrderFormData({...orderFormData,paymentRef:e.target.value.toUpperCase()})} placeholder="e.g. SCI12345XYZ" style={{width:'100%',padding:'10px',border:'1.5px solid #e2e6ea',borderRadius:'8px',fontSize:'15px',outline:'none',boxSizing:'border-box',fontFamily:'monospace'}}/><div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>From your payment SMS</div></div>


                    <input type="file" id="payment-proof" accept="image/*" style={{display:'none'}} onChange={handlePaymentProofSelect}/>
                    <label htmlFor="payment-proof" style={{display:'block',marginBottom:'12px',cursor:'pointer'}}>
                      {orderFormData.paymentProofPreview ? (
                        <div style={{border:'1.5px solid #bbf7d0',borderRadius:'10px',padding:'8px',background:'#f0fdf4'}}>
                          <img src={orderFormData.paymentProofPreview} alt="Payment proof preview" style={{width:'100%',maxHeight:'180px',objectFit:'cover',borderRadius:'8px'}}/>
                          <div style={{fontSize:'12px',color:'#166534',fontWeight:'600',marginTop:'6px'}}>Proof screenshot attached. Tap to change.</div>
                        </div>
                      ) : (
                        <div style={{border:'1.5px dashed #10b981',borderRadius:'10px',padding:'14px',textAlign:'center',background:'#f0fdf4'}}>
                          <div style={{fontSize:'20px',marginBottom:'4px'}}>📷</div>
                          <div style={{fontSize:'13px',fontWeight:'700',color:'#166534'}}>Attach payment screenshot</div>
                          <div style={{fontSize:'11px',color:'#6b7280',marginTop:'3px'}}>Optional but recommended for informal payments</div>
                        </div>
                      )}
                    </label>
                    <button onClick={()=>confirmPayment(viewingCollection)} disabled={uploading} style={{width:'100%',padding:'14px',background:'#10b981',color:'#fff',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:uploading?'not-allowed':'pointer'}}>{uploading?"Confirming...":"✅ Confirm Payment"}</button>
                  </div>
                )}

                {/* Payment confirmed success */}
                {paymentConfirmed && (
                  <div style={{background:'#f0fdf4',borderRadius:'12px',padding:'16px',border:'1.5px solid #bbf7d0'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <span style={{fontSize:'20px'}}>🎉</span>
                      <div>
                        <div style={{fontSize:'15px',fontWeight:'700',color:'#166534'}}>Payment Confirmed!</div>
                        <div style={{fontSize:'12px',color:'#15803d',marginTop:'2px'}}>The rep can now verify your transaction</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!user && viewingCollection.active && (
              <button onClick={()=>requireAuth("order",()=>{})} style={{width:'100%',padding:'14px',background:'#0d9488',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'700',cursor:'pointer',marginBottom:'16px'}}>
                {(()=>{
                  const ct = viewingCollection.collectionType || "order";
                  const signInLabels = { order:"Sign in to Order", event:"Sign in to Register", contribution:"Sign in to Contribute", freshers:"Sign in to Join" };
                  return "🔐 " + (signInLabels[ct] || signInLabels.order);
                })()}
              </button>
            )}

            {/* ORDERS LIST — visible to collection creator AND co-admins */}
            {isCollectionAdmin(viewingCollection) && (
              <div style={{marginBottom:'16px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
                  <h3 style={{fontSize:'16px',fontWeight:'700'}}>Orders ({collectionOrders.length})</h3>
                  {viewingCollection.active && <button onClick={()=>closeCollection(viewingCollection.id)} style={{padding:'6px 14px',background:'#fee2e2',color:'#991b1b',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>Close Collection</button>}
                </div>

                {/* Search orders + Scan QR */}
                {collectionOrders.length > 0 && (
                  <div style={{marginBottom:'10px',display:'flex',gap:'8px',alignItems:'center'}}>
                    {collectionOrders.length > 3 && (
                      <div style={{flex:1,display:'flex',alignItems:'center',background:'#f4f6f8',borderRadius:'8px',padding:'8px 10px'}}>
                        <input type="text" placeholder="Search by name, phone, ref code..." value={orderSearchQ} onChange={e=>setOrderSearchQ(e.target.value)} style={{flex:1,border:'none',background:'none',outline:'none',fontSize:'13px'}}/>
                        <span style={{fontSize:'14px'}}>🔍</span>
                      </div>
                    )}
                    <button onClick={openScanner} style={{padding:'8px 14px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',display:'flex',alignItems:'center',gap:'6px',whiteSpace:'nowrap',flexShrink:0}}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/></svg>
                      Scan QR
                    </button>
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
                      const statusColor = order.paid ? '#10b981' : (order.amountPaid > 0 ? '#0d9488' : '#ef4444');
                      const statusBg = order.paid ? '#d1fae5' : (order.amountPaid > 0 ? '#ccfbf1' : '#fff');
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
                              {order.selectedOption && <span style={{background:'#ccfbf1',color:'#0f766e',padding:'1px 6px',borderRadius:'4px',marginRight:'4px',fontSize:'11px'}}>{order.selectedOption}</span>}
                              {order.payerName && <span style={{background:'#eff6ff',color:'#1e40af',padding:'1px 6px',borderRadius:'4px',marginRight:'4px',fontSize:'11px'}}>{order.payerName}</span>}
                              {order.phone && <span>{order.phone} • </span>}
                              {order.paymentRef ? <span style={{fontFamily:'monospace',background:'#f0fdf4',color:'#22c55e',padding:'1px 6px',borderRadius:'4px',fontSize:'11px',fontWeight:'800'}}>{order.paymentRef}</span> : <span style={{color:'#ef4444',fontSize:'11px'}}>No ref</span>} {order.paymentProofUrl && <a href={order.paymentProofUrl} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:'11px',color:'#0d9488',fontWeight:'700',marginLeft:'6px'}}>View proof</a>}
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
                              <div style={{height:'100%',width:`${Math.min(100,Math.round((order.amountPaid/order.amount)*100))}%`,background:'#0d9488',borderRadius:'2px'}}/>
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
                    📲 {collectionOrders.length === 0 ? 'Share on WhatsApp' : 'Share Payment Status on WhatsApp'}
                  </button>
              </div>
            )}

            {/* Check own order status — for students (not admins) */}
            {user && !isCollectionAdmin(viewingCollection) && collectionOrders.length > 0 && (
              <div style={{marginBottom:'16px'}}>
                {collectionOrders.filter(o=>o.userId===user.uid).map(order=>(
                  <div key={order.id} style={{background:order.paid?'#d1fae5':'#ccfbf1',borderRadius:'12px',padding:'14px',border:order.paid?'1px solid #6ee7b7':'1px solid #99f0ee'}}>
                    <div style={{fontSize:'14px',fontWeight:'600',color:order.paid?'#065f46':'#0f766e'}}>
                      {order.paid ? '✅ Your payment has been confirmed!' : '⏳ Your order is placed — waiting for payment confirmation'}
                    </div>
                    {order.selectedOption && <div style={{fontSize:'12px',color:'#6b7280',marginTop:'4px'}}>Option: {order.selectedOption}</div>}
                    {order.paymentRef && <div style={{fontSize:'12px',color:'#6b7280',marginTop:'2px'}}>Ref: {order.paymentRef}</div>}
                    {order.paymentProofUrl && <a href={order.paymentProofUrl} target="_blank" rel="noreferrer" style={{display:'inline-block',fontSize:'12px',color:'#0d9488',fontWeight:'700',marginTop:'4px'}}>View payment proof</a>}

                    {/* QR TICKET — only shown when admin has confirmed payment */}
                    {order.paid && (
                      <div style={{marginTop:'14px',paddingTop:'14px',borderTop:'1px solid #6ee7b7',textAlign:'center'}}>
                        <div style={{fontSize:'12px',fontWeight:'700',color:'#065f46',marginBottom:'8px'}}>🎟 Your Entry QR — show the QR to the admin</div>
                        <div style={{display:'inline-block',padding:'12px',background:'#fff',borderRadius:'12px',border:'2px solid #6ee7b7'}}>
                          <QRCodeSVG
                            value={`https://kampasika.org/verify/${viewingCollection.id}/${order.id}`}
                            size={160}
                            bgColor="#ffffff"
                            fgColor="#065f46"
                            level="M"
                          />
                        </div>
                        <div style={{fontSize:'11px',color:'#6b7280',marginTop:'8px'}}>{order.studentName}</div>
                        <div style={{fontSize:'10px',color:'#9ca3af',marginTop:'2px'}}>{viewingCollection.title}</div>
                      </div>
                    )}
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
          
          <div style={{background:'linear-gradient(135deg,#06d6c7 0%,#38bdf8 100%)',borderRadius:'18px',padding:'20px 18px',margin:'0 16px 16px 16px',width:'calc(100% - 32px)',boxSizing:'border-box'}}>
            <h2 style={{fontFamily:'serif',fontSize:'22px',fontWeight:'700',color:'#fff',marginBottom:'6px'}}>🏠 Find a Room</h2>
            <p style={{color:'rgba(255,255,255,0.8)',fontSize:'13px',marginBottom:'14px',lineHeight:1.5}}>Browse rooms near campus — listed directly by landlords. No dalali fees.</p>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>{if(!user){requireAuth("listRoom",()=>setPage("createRoom"));return;}setPage("createRoom");}} style={{padding:'10px 16px',background:'#fff',color:'#06d6c7',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>+ List a Room</button>
              <button onClick={()=>setPage("roommates")} style={{padding:'10px 16px',background:'rgba(255,255,255,0.2)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>🤝 Find Roommate</button>
            </div>
          </div>

          {/* Search & Filters */}
          <div style={{margin:'0 16px 10px 16px',display:'flex',alignItems:'center',background:'#fff',borderRadius:'10px',padding:'8px 12px',border:'1.5px solid #e2e6ea'}}>
            <input type="text" placeholder="Tafuta kwa eneo, bei, amenity..." value={roomSearchQ}
              onChange={e => {
                setRoomSearchQ(e.target.value);
                if (!e.target.value.trim()) {
                  setCommittedRoomSearchQ("");
                  clearAISearch();
                }
              }}
              onKeyDown={e => { if (e.key === 'Enter') commitRoomsSearch(roomSearchQ); }}
              style={{flex:1,border:'none',background:'none',outline:'none',fontSize:'14px'}}/>
            <button type="button" onClick={() => commitRoomsSearch(roomSearchQ)} aria-label="Search" style={{background:'none',border:'none',cursor:'pointer',fontSize:'14px',padding:'4px 6px',color:'#6b7280'}}>🔍</button>
          </div>
          <AISearchBadge parsed={aiParsed} isAIActive={isAIActive} onClear={() => { clearAISearch(); setRoomSearchQ(""); setCommittedRoomSearchQ(""); }} />
          {aiSearching && <div style={{padding:'6px 16px 8px',fontSize:'11px',color:'#0d9488'}}>✨ AI is thinking...</div>}
          <div style={{display:'flex',gap:'6px',overflowX:'auto',margin:'0 16px 10px 16px'}}>
            {ROOM_TYPES.map(t=>(
              <button key={t.id} onClick={()=>setRoomFilterType(t.id)} style={{padding:'6px 14px',background:roomFilterType===t.id?'#06d6c7':'#fff',color:roomFilterType===t.id?'#fff':'#0f1b2d',border:roomFilterType===t.id?'none':'1.5px solid #e2e6ea',borderRadius:'20px',fontSize:'12px',fontWeight:'500',cursor:'pointer',whiteSpace:'nowrap'}}>{t.icon} {t.name}</button>
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
            let filtered = rooms;
            if (roomFilterType !== "all") {
              filtered = filtered.filter(r => r.roomType === roomFilterType);
            }
            if (roomFilterMaxPrice) {
              filtered = filtered.filter(r => r.price <= parseInt(roomFilterMaxPrice));
            }
            if (!aiSearching) {
              if (aiParsed && committedRoomSearchQ.trim()) {
                filtered = filterRooms(filtered, aiParsed);
              } else if (committedRoomSearchQ.trim()) {
                const q = committedRoomSearchQ.toLowerCase();
                filtered = filtered.filter(r =>
                  r.location?.toLowerCase().includes(q) ||
                  r.description?.toLowerCase().includes(q) ||
                  r.landlordName?.toLowerCase().includes(q)
                );
              }
            }
            return filtered.length === 0 ? (
              <div style={{margin:'0 16px'}}>
                <EmptyResults kind="room" query={committedRoomSearchQ} parsedFilters={aiParsed?.filters}
                  fallbackTitle="No rooms listed yet" fallbackHint="Know a landlord? Help them list their room!" />
                {!committedRoomSearchQ?.trim() && (
                  <div style={{textAlign:'center',marginTop:'12px'}}>
                    <button onClick={()=>{if(!user){requireAuth("listRoom",()=>setPage("createRoom"));return;}setPage("createRoom");}} style={{padding:'10px 20px',background:'#06d6c7',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ List a Room</button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:'10px',margin:'0 16px'}}>
                {filtered.map(room => (
                  <div key={room.id} onClick={()=>{setViewingRoom(room);setShowRoomIndoor(false);}} style={{background:'#fff',borderRadius:'14px',overflow:'hidden',cursor:'pointer',border:'1px solid #e2e6ea'}}>
                    {room.photoUrl ? (
                      <img src={room.photoUrl} alt="" loading="lazy" style={{width:'100%',height:'180px',objectFit:'cover'}}/>
                    ) : (
                      <div style={{width:'100%',height:'120px',background:'linear-gradient(135deg,#06d6c7,#38bdf8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'48px'}}>🏠</div>
                    )}
                    <div style={{padding:'12px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'start',marginBottom:'6px'}}>
                        <div>
                          <span style={{fontSize:'11px',background:'#e0f2fe',color:'#0369a1',padding:'2px 8px',borderRadius:'8px',fontWeight:'500'}}>{ROOM_TYPES.find(t=>t.id===room.roomType)?.name || room.roomType}</span>
                          <div style={{fontSize:'15px',fontWeight:'600',marginTop:'6px'}}>📍 {room.location}</div>
                        </div>
                        <div style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700',color:'#f59e0b'}}>{room.price?.toLocaleString()}<span style={{fontSize:'11px',fontWeight:'400',color:'#8a9bb0'}}>/mo</span></div>
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
            {!showCreateRoomSuccess && <p style={{fontSize:'13px',color:'#8a9bb0',marginBottom:'16px'}}>List your room and students will contact you directly.</p>}
            {showCreateRoomSuccess ? (
              <div style={{textAlign:'center',padding:'32px 16px'}}>
                <div style={{fontSize:'56px',marginBottom:'16px'}}>🏠</div>
                <div style={{fontSize:'20px',fontWeight:'700',marginBottom:'4px'}}>Room listed!</div>
                <div style={{fontSize:'13px',color:'#8a9bb0',marginBottom:'28px'}}>Students can now find and contact you</div>
                <button onClick={()=>{setShowCreateRoomSuccess(false);setPage("rooms");}} style={{width:'100%',padding:'14px',background:'#06d6c7',color:'#fff',border:'none',borderRadius:'12px',fontSize:'16px',fontWeight:'600',cursor:'pointer',marginBottom:'12px'}}>View All Rooms</button>
                <button onClick={()=>{setShowCreateRoomSuccess(false);setPage("home");}} style={{width:'100%',padding:'14px',background:'#f4f6f8',color:'#0f1b2d',border:'none',borderRadius:'12px',fontSize:'16px',fontWeight:'600',cursor:'pointer'}}>← Home</button>
              </div>
            ) : (
              <>
                {/* Photos */}
                <input type="file" id="room-photo" accept="image/*" multiple style={{display:'none'}} onChange={handleRoomPhotoSelect}/>
                <label htmlFor="room-photo" style={{display:'block',marginBottom:'12px',cursor:'pointer'}}>
                  {createRoomData.photoPreviews.length > 0 ? (
                    <div><img src={createRoomData.photoPreviews[0]} alt="" style={{width:'100%',height:'200px',objectFit:'cover',borderRadius:'12px',marginBottom:'6px'}}/>
                      <div style={{display:'flex',gap:'6px',overflowX:'auto'}}>{createRoomData.photoPreviews.slice(1).map((p,i)=><img key={i} src={p} alt="" style={{width:'56px',height:'56px',objectFit:'cover',borderRadius:'8px',flexShrink:0}}/>)}{createRoomData.photoPreviews.length<5&&<div style={{width:'56px',height:'56px',border:'2px dashed #06d6c7',borderRadius:'8px',display:'flex',alignItems:'center',justifyContent:'center',background:'#f0f9ff',flexShrink:0}}><span style={{fontSize:'18px',color:'#06d6c7'}}>+</span></div>}</div>
                    </div>
                  ) : (
                    <div style={{border:'2px dashed #e2e6ea',borderRadius:'12px',padding:'28px',textAlign:'center',background:'#f9fafb'}}>
                      <div style={{fontSize:'40px',marginBottom:'8px'}}>📸</div>
                      <div style={{fontSize:'14px',fontWeight:'600'}}>Add Room Photos</div>
                      <div style={{fontSize:'12px',color:'#8a9bb0'}}>Up to 5 photos — show the room, bathroom, entrance</div>
                    </div>
                  )}
                </label>

                {/* Outdoor photo */}
                <div style={{marginBottom:'16px'}}>
                  <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>📸 Outdoor Photo / Picha ya mazingira ya nje (optional)</label>
                  <input type="file" id="room-outdoor-photo" accept="image/*" style={{display:'none'}} onChange={e=>{
                    const file = e.target.files[0];
                    if (!file) return;
                    if (!file.type.startsWith('image/')) { setError("Must be an image file"); return; }
                    setCreateRoomData(prev => ({
                      ...prev,
                      photoFiles: [file, ...prev.photoFiles.slice(1)],
                      photoPreviews: [URL.createObjectURL(file), ...prev.photoPreviews.slice(1)]
                    }));
                  }}/>
                  <label htmlFor="room-outdoor-photo" style={{display:'block',cursor:'pointer'}}>
                    {createRoomData.photoPreviews[0] ? (
                      <div style={{position:'relative'}}>
                        <img src={createRoomData.photoPreviews[0]} alt="Outdoor" style={{width:'100%',height:'140px',objectFit:'cover',borderRadius:'10px'}}/>
                        <div style={{position:'absolute',top:'6px',right:'6px',background:'rgba(0,0,0,0.6)',color:'#fff',padding:'2px 8px',borderRadius:'6px',fontSize:'11px'}}>🏠 Outdoor added</div>
                      </div>
                    ) : (
                      <div style={{border:'1.5px dashed #06d6c7',borderRadius:'10px',padding:'16px',textAlign:'center',background:'#f0fffe'}}>
                        <div style={{fontSize:'24px',marginBottom:'4px'}}>🏠</div>
                        <span style={{fontSize:'13px',color:'#06d6c7',fontWeight:'600'}}>Add outdoor photo — gate, compound, exterior</span>
                        <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'3px'}}>Helps students recognise the house from outside</div>
                      </div>
                    )}
                  </label>
                </div>

                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Landlord / Contact Name *</label><input type="text" placeholder="e.g. Bwana Juma" value={createRoomData.landlordName} onChange={e=>setCreateRoomData({...createRoomData,landlordName:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>

                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>📱 Phone / WhatsApp *</label><input type="tel" placeholder="e.g. 0712345678" value={createRoomData.landlordPhone} onChange={e=>setCreateRoomData({...createRoomData,landlordPhone:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>

                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'8px'}}>Room Type *</label>
                  <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                    {ROOM_TYPES.filter(t=>t.id!=="all").map(t=>(
                      <button key={t.id} onClick={()=>setCreateRoomData({...createRoomData,roomType:t.id})} style={{padding:'10px 16px',borderRadius:'10px',border:createRoomData.roomType===t.id?'2px solid #06d6c7':'1.5px solid #e2e6ea',background:createRoomData.roomType===t.id?'#e0f2fe':'#fff',fontSize:'13px',fontWeight:'500',cursor:'pointer'}}>{t.icon} {t.name}{t.sw?' ('+t.sw+')':''}</button>
                    ))}
                  </div>
                </div>

                <div style={{marginBottom:'14px'}}>
                  <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Monthly Rent (TSh) *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 80,000 or 80k"
                    value={createRoomData.price}
                    onChange={e=>setCreateRoomData({...createRoomData,price:e.target.value})}
                    style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}
                  />
                  {createRoomData.price && (
                    <div style={{fontSize:'11px',color:formatPriceHint(createRoomData.price) ? '#0d9488' : '#ef4444',marginTop:'4px',fontWeight:'600'}}>
                      {formatPriceHint(createRoomData.price) ? formatPriceHint(createRoomData.price) + ' kwa mwezi' : '⚠ Bei haisomeki'}
                    </div>
                  )}
                </div>

                <div style={{marginBottom:'14px'}}>
                  <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>📍 Location / Area *</label>
                  <input type="text" placeholder="e.g. Sinza C, near Ardhi gate" value={createRoomData.location} onChange={e=>setCreateRoomData({...createRoomData,location:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box',marginBottom:'8px'}}/>
                  <button type="button" onClick={()=>{
                    if (!navigator.geolocation) { setError("GPS not supported on this device"); return; }
                    setSuccess("Getting your location...");
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        const { latitude, longitude } = pos.coords;
                        setCreateRoomData(prev => ({ ...prev, lat: latitude, lng: longitude }));
                        setSuccess("📍 Location pinned! Map will show exact position.");
                        setTimeout(() => setSuccess(""), 3000);
                      },
                      (err) => {
                        setSuccess("");
                        setError("Could not get location: " + (err.message || "Permission denied"));
                      },
                      { enableHighAccuracy: true, timeout: 10000 }
                    );
                  }} style={{width:'100%',padding:'10px',background: createRoomData.lat ? '#d1fae5' : '#f4f6f8',color: createRoomData.lat ? '#065f46' : '#0f1b2d',border: createRoomData.lat ? '1.5px solid #6ee7b7' : '1px solid #e2e6ea',borderRadius:'10px',fontSize:'13px',fontWeight:'600',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
                    {createRoomData.lat ? (
                      <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> GPS pinned — exact location saved</>
                    ) : (
                      <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Pin exact location with GPS (optional)</>
                    )}
                  </button>
                  {createRoomData.lat && <div style={{fontSize:'11px',color:'#6b7280',marginTop:'4px',fontFamily:'monospace'}}>Lat: {createRoomData.lat.toFixed(5)}, Lng: {createRoomData.lng.toFixed(5)}</div>}
                  {!createRoomData.lat && <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px',lineHeight:1.5}}>⚠ Hakikisha upo eneo halisi la chumba unapobonyeza kitufe hiki — maana inapakia eneo uliopo saizi.</div>}
                </div>

                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Nearest University</label><select value={createRoomData.nearUni} onChange={e=>setCreateRoomData({...createRoomData,nearUni:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none'}}>{UNIVERSITIES.map(u=><option key={u.id} value={u.short}>{u.name} ({u.short})</option>)}</select></div>

                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'8px'}}>Amenities</label>
                  <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                    {ROOM_AMENITIES.map(a=>{const sel=(createRoomData.amenities||[]).includes(a.id);return(
                      <button key={a.id} onClick={()=>{const cur=createRoomData.amenities||[];setCreateRoomData({...createRoomData,amenities:sel?cur.filter(x=>x!==a.id):[...cur,a.id]});}} style={{padding:'6px 12px',borderRadius:'8px',border:sel?'2px solid #06d6c7':'1.5px solid #e2e6ea',background:sel?'#e0f2fe':'#fff',fontSize:'12px',cursor:'pointer'}}>{a.icon} {a.label}</button>
                    );})}
                  </div>
                </div>

                <div style={{marginBottom:'16px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Description (optional)</label><textarea placeholder="Any extra details — available date, rules, what's nearby..." value={createRoomData.desc} onChange={e=>setCreateRoomData({...createRoomData,desc:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',minHeight:'80px',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}}/></div>

                <button onClick={handleCreateRoom} disabled={uploading} style={{width:'100%',padding:'14px',background:'#06d6c7',color:'#fff',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:uploading?'not-allowed':'pointer'}}>{uploading?"Uploading...":"🏠 List Room"}</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ============ ROOM DETAIL ============ */}
      {ENABLE_ROOMS && viewingRoom && (
        <div style={{position:'fixed',inset:0,background:'#f4f6f8',zIndex:300,overflowY:'auto'}}>
          {/* Header */}
          <div style={{background:'#fff',padding:'12px 16px',display:'flex',alignItems:'center',gap:'10px',borderBottom:'1px solid #e2e6ea',position:'sticky',top:0,zIndex:50}}>
            <button onClick={()=>{if(showRoomIndoor){setShowRoomIndoor(false);}else{setViewingRoom(null);}}} style={{width:'36px',height:'36px',borderRadius:'50%',background:'#f4f6f8',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'18px',border:'none'}}>←</button>
            <div style={{fontFamily:'serif',fontSize:'20px',fontWeight:'700',color:'#0f1b2d'}}>{showRoomIndoor ? 'Indoor View' : 'Room Location'}</div>
          </div>

          {!showRoomIndoor ? (
            <>
              {/* MAP — Google Maps embed via location text */}
              <div style={{position:'relative',width:'100%',height:'340px',background:'#e2e6ea',overflow:'hidden'}}>
                <iframe
                  title="Room location map"
                  width="100%"
                  height="340"
                  style={{border:'none',display:'block'}}
                  loading="lazy"
                  allowFullScreen
                  src={viewingRoom.lat && viewingRoom.lng
                    ? `https://maps.google.com/maps?q=${viewingRoom.lat},${viewingRoom.lng}&t=m&z=17&ie=UTF8&iwloc=&output=embed`
                    : `https://maps.google.com/maps?q=${encodeURIComponent((viewingRoom.location||'') + ', Dar es Salaam, Tanzania')}&t=m&z=16&ie=UTF8&iwloc=&output=embed`
                  }
                />
                {/* Location label overlay */}
                <div style={{position:'absolute',bottom:'12px',left:'12px',background:'rgba(15,27,45,0.85)',color:'#fff',borderRadius:'10px',padding:'6px 12px',fontSize:'13px',fontWeight:'600',backdropFilter:'blur(4px)'}}>
                  📍 {viewingRoom.location}
                </div>
                {/* Open in Google Maps button */}
                <button
                  onClick={()=>window.open(
                    viewingRoom.lat && viewingRoom.lng
                      ? `https://www.google.com/maps/search/?api=1&query=${viewingRoom.lat},${viewingRoom.lng}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((viewingRoom.location||'') + ', Dar es Salaam, Tanzania')}`,
                    '_blank'
                  )}
                  style={{position:'absolute',top:'12px',right:'12px',background:'#fff',border:'none',borderRadius:'10px',padding:'7px 12px',fontSize:'12px',fontWeight:'700',color:'#0f1b2d',cursor:'pointer',boxShadow:'0 2px 8px rgba(0,0,0,0.15)',display:'flex',alignItems:'center',gap:'5px'}}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Open in Maps
                </button>
              </div>

              {/* Room summary strip */}
              <div style={{background:'#fff',padding:'14px 16px',borderBottom:'1px solid #e2e6ea',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:'15px',fontWeight:'700',color:'#0f1b2d'}}>{ROOM_TYPES.find(t=>t.id===viewingRoom.roomType)?.icon} {ROOM_TYPES.find(t=>t.id===viewingRoom.roomType)?.name}</div>
                  <div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'2px'}}>Near {viewingRoom.nearUni}</div>
                </div>
                <div style={{fontFamily:'serif',fontSize:'22px',fontWeight:'700',color:'#06d6c7'}}>{viewingRoom.price?.toLocaleString()} <span style={{fontSize:'13px',color:'#8a9bb0',fontFamily:'system-ui'}}>TSh/mo</span></div>
              </div>

              {/* Outdoor / Indoor cards */}
              <div style={{padding:'16px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>

                {/* OUTDOOR card */}
                <div style={{background:'#fff',borderRadius:'16px',overflow:'hidden',border:'1px solid #e2e6ea',cursor:'default'}}>
                  {viewingRoom.photos && viewingRoom.photos.length > 0 ? (
                    <img src={viewingRoom.photos[0]} alt="Outdoor" style={{width:'100%',height:'130px',objectFit:'cover'}} onClick={()=>{setFullScreenImage(viewingRoom.photos[0]);setFullScreenPhotos(viewingRoom.photos);setFullScreenIndex(0);}}/>
                  ) : (
                    <div style={{width:'100%',height:'130px',background:'linear-gradient(135deg,#a8edea,#fed6e3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'40px'}}>🏠</div>
                  )}
                  <div style={{padding:'10px 12px'}}>
                    <div style={{fontSize:'13px',fontWeight:'700',color:'#0f1b2d',marginBottom:'2px'}}>Outdoor</div>
                    <div style={{fontSize:'11px',color:'#8a9bb0'}}>Exterior view</div>
                  </div>
                </div>

                {/* INDOOR card — tappable */}
                <div onClick={()=>setShowRoomIndoor(true)} style={{background:'#fff',borderRadius:'16px',overflow:'hidden',border:'2px solid #06d6c7',cursor:'pointer',boxShadow:'0 4px 14px rgba(6,214,199,0.15)'}}>
                  {viewingRoom.photos && viewingRoom.photos.length > 1 ? (
                    <img src={viewingRoom.photos[1]} alt="Indoor" style={{width:'100%',height:'130px',objectFit:'cover'}}/>
                  ) : (
                    <div style={{width:'100%',height:'130px',background:'linear-gradient(135deg,#06d6c7,#38bdf8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'40px'}}>🛏</div>
                  )}
                  <div style={{padding:'10px 12px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div>
                      <div style={{fontSize:'13px',fontWeight:'700',color:'#0f1b2d',marginBottom:'2px'}}>Indoor</div>
                      <div style={{fontSize:'11px',color:'#0d9488',fontWeight:'600'}}>Tap to view details →</div>
                    </div>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06d6c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                  </div>
                </div>
              </div>

              {/* Amenities preview */}
              {viewingRoom.amenities && viewingRoom.amenities.length > 0 && (
                <div style={{padding:'0 16px 16px'}}>
                  <div style={{fontSize:'13px',fontWeight:'600',color:'#6b7280',marginBottom:'8px'}}>Amenities</div>
                  <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                    {viewingRoom.amenities.map(a=>{const am=ROOM_AMENITIES.find(x=>x.id===a);return am?<span key={a} style={{fontSize:'12px',background:'#f4f6f8',padding:'6px 12px',borderRadius:'8px'}}>{am.icon} {am.label}</span>:null;})}
                  </div>
                </div>
              )}

              {/* Contact buttons */}
              <div style={{padding:'0 16px 100px',display:'flex',gap:'8px'}}>
                <button onClick={()=>{const num=viewingRoom.landlordPhone.replace(/^0/,'255').replace(/[^0-9]/g,'');const msg=`Habari! Nimeona chumba chako kupitia Kampasika — ${ROOM_TYPES.find(t=>t.id===viewingRoom.roomType)?.name} pale ${viewingRoom.location}, ${viewingRoom.price?.toLocaleString()} TSh/month. Je bado kinapatikana?`;window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`,'_blank');}} style={{flex:1,padding:'14px',background:'#25D366',color:'#fff',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:'600',cursor:'pointer'}}>📱 WhatsApp</button>
                <button onClick={()=>{window.open(`tel:${viewingRoom.landlordPhone}`);}} style={{flex:1,padding:'14px',background:'#06d6c7',color:'#fff',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:'600',cursor:'pointer'}}>📞 Call</button>
              </div>
            </>
          ) : (
            /* ── INDOOR VIEW — full current detail ── */
            <>
              {viewingRoom.photos && viewingRoom.photos.length > 0 ? (
                <div>
                  <img src={viewingRoom.photos[viewingRoom.photos.length > 1 ? 1 : 0]} alt="" onClick={()=>{setFullScreenImage(viewingRoom.photos[1]||viewingRoom.photos[0]);setFullScreenPhotos(viewingRoom.photos);setFullScreenIndex(viewingRoom.photos.length>1?1:0);}} style={{width:'100%',height:'280px',objectFit:'cover',cursor:'pointer'}}/>
                  {viewingRoom.photos.length > 1 && (
                    <div style={{display:'flex',gap:'6px',padding:'8px 16px',overflowX:'auto'}}>
                      {viewingRoom.photos.map((p,i)=><img key={i} src={p} alt="" onClick={()=>{setFullScreenImage(p);setFullScreenPhotos(viewingRoom.photos);setFullScreenIndex(i);}} style={{width:'56px',height:'56px',objectFit:'cover',borderRadius:'8px',cursor:'pointer',flexShrink:0}}/>)}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{width:'100%',height:'180px',background:'linear-gradient(135deg,#06d6c7,#38bdf8)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'64px'}}>🏠</div>
              )}

              <div style={{padding:'20px'}}>
                <span style={{fontSize:'12px',background:'#e0f2fe',color:'#0369a1',padding:'4px 12px',borderRadius:'20px',fontWeight:'500'}}>{ROOM_TYPES.find(t=>t.id===viewingRoom.roomType)?.icon} {ROOM_TYPES.find(t=>t.id===viewingRoom.roomType)?.name}</span>
                <div style={{fontFamily:'serif',fontSize:'32px',fontWeight:'700',color:'#f59e0b',margin:'12px 0 4px'}}>{viewingRoom.price?.toLocaleString()} <span style={{fontSize:'16px',color:'#8a9bb0',fontFamily:'system-ui'}}>TSh/month</span></div>
                {SHOW_PRICE_SIGNAL && <PriceSignalBadge signal={computePriceSignal(viewingRoom, rooms, "room")} />}
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
                <button onClick={()=>{window.open(`tel:${viewingRoom.landlordPhone}`);}} style={{flex:1,padding:'16px',background:'#06d6c7',color:'#fff',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:'600',cursor:'pointer'}}>📞 Call</button>
              </div>
            </>
          )}
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
                <button onClick={handleCreateRoommatePost} disabled={uploading} style={{width:'100%',padding:'12px',background:'#06d6c7',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:uploading?'not-allowed':'pointer'}}>{uploading?"Posting...":"Post"}</button>
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
                      <div style={{width:'36px',height:'36px',borderRadius:'50%',backgroundImage:post.userAvatar?`url(${post.userAvatar})`:'none',backgroundColor:!post.userAvatar?'#06d6c7':'transparent',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',fontWeight:'700',color:'#fff'}}>{!post.userAvatar&&(post.userName||"?").split(" ").map(n=>n[0]).join("")}</div>
                      <div><div style={{fontSize:'14px',fontWeight:'600'}}>{post.userName}</div><div style={{fontSize:'11px',color:'#8a9bb0'}}>{post.universityName}</div></div>
                    </div>
                    <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'8px'}}>
                      <span style={{fontSize:'12px',background:'#e0f2fe',color:'#0369a1',padding:'3px 10px',borderRadius:'8px',fontWeight:'500'}}>Budget: {post.budget?.toLocaleString()} TSh</span>
                      <span style={{fontSize:'12px',background:'#f4f6f8',padding:'3px 10px',borderRadius:'8px'}}>📍 {post.preferredArea}</span>
                      {post.gender && <span style={{fontSize:'12px',background:'#f4f6f8',padding:'3px 10px',borderRadius:'8px'}}>{post.gender === 'male' ? '👨' : post.gender === 'female' ? '👩' : '👤'} {post.gender}</span>}
                      {post.moveDate && <span style={{fontSize:'12px',background:'#ccfbf1',color:'#0f766e',padding:'3px 10px',borderRadius:'8px'}}>📅 {new Date(post.moveDate).toLocaleDateString('en',{month:'short',day:'numeric'})}</span>}
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
          {/* Seller Hero - Instagram style */}
          <div style={{background:'#fff',padding:'20px 18px',borderBottom:'1px solid #f0f2f5'}}>
            {/* Top row: avatar + stats */}
            <div style={{display:'flex',alignItems:'center',gap:'20px',marginBottom:'14px'}}>
              <div style={{position:'relative',flexShrink:0}}>
                <div style={{width:'76px',height:'76px',borderRadius:'50%',backgroundImage:publicSeller.avatarUrl?`url(${publicSeller.avatarUrl})`:'none',backgroundColor:!publicSeller.avatarUrl?'#06d6c7':'transparent',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'28px',fontWeight:'700',color:'#0f1b2d',border:'2.5px solid #f0fffe'}}>
                  {!publicSeller.avatarUrl&&publicSeller.name.split(" ").map(n=>n[0]).join("")}
                </div>
                {publicSeller.isVerified && (
                  <div style={{position:'absolute',bottom:'-2px',right:'-2px',width:'22px',height:'22px',borderRadius:'50%',background:'#06d6c7',border:'2.5px solid #fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',color:'#0f1b2d',fontWeight:'700'}}>✓</div>
                )}
              </div>
              {/* Stats */}
              <div style={{display:'flex',gap:'16px',flex:1,justifyContent:'space-around'}}>
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:'18px',fontWeight:'700',color:'#0f1b2d',lineHeight:1.1}}>{publicSellerListings.length}</div>
                  <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'2px'}}>Goods</div>
                </div>
                <div style={{textAlign:'center'}}>
                  <div style={{fontSize:'18px',fontWeight:'700',color:'#0f1b2d',lineHeight:1.1}}>{publicSellerServices.length}</div>
                  <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'2px'}}>Services</div>
                </div>
                {publicSellerStats && publicSellerStats.sold > 0 && (
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:'18px',fontWeight:'700',color:'#06d6c7',lineHeight:1.1}}>{publicSellerStats.sold}</div>
                    <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'2px'}}>Sold</div>
                  </div>
                )}
              </div>
            </div>
            {/* Name + badge */}
            <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'2px'}}>
              <span style={{fontSize:'15px',fontWeight:'700',color:'#0f1b2d'}}>{publicSeller.name}</span>
              {publicSeller.isVerified && <VerifiedBadge user={publicSeller} size="xs" />}
            </div>
            <div style={{fontSize:'12px',color:'#8a9bb0',marginBottom:'12px'}}>
              {publicSeller.accountType === "provider" ? `💼 Service Provider${publicSeller.location ? ' · ' + publicSeller.location : ''}` : `🎓 ${publicSeller.universityName || 'ARU'} Student`}
            </div>
            {/* Service Tags */}
            {publicSeller.services && publicSeller.services.length > 0 && (
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'12px'}}>
                {publicSeller.services.map(sId => {
                  const tag = SERVICE_TAGS.find(t=>t.id===sId);
                  return tag ? <span key={sId} style={{fontSize:'11px',background:'#f4f6f8',padding:'3px 10px',borderRadius:'20px',color:'#0f1b2d',fontWeight:'500',display:'flex',alignItems:'center',gap:'4px'}}>{tag.icon} {tag.label}</span> : null;
                })}
              </div>
            )}
            {/* Action buttons */}
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>{
                if (!publicSellerListings.length) return;
                requireAuth("message", () => startConversation(publicSellerListings[0]));
              }} style={{flex:1,padding:'9px',background:'#f4f6f8',color:'#0f1b2d',border:'1px solid #e2e6ea',borderRadius:'8px',fontSize:'13px',fontWeight:'600',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px'}}>
                💬 Message
              </button>
              <button onClick={()=>{
                const slug = generateSellerSlug(publicSeller.name, publicSeller.universityName);
                const profileUrl = `https://kampasika.netlify.app/seller/${slug}`;
                const msg = `Check out ${publicSeller.name}'s listings on Kampasika!\n\n${profileUrl}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
              }} style={{flex:1,padding:'9px',background:'#25D366',color:'#fff',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:'600',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px'}}>
                📲 Share
              </button>
              <button onClick={()=>{
                const slug = generateSellerSlug(publicSeller.name, publicSeller.universityName);
                const profileUrl = `https://kampasika.netlify.app/seller/${slug}`;
                navigator.clipboard?.writeText(profileUrl).then(()=>{setSuccess("Link copied!"); setTimeout(()=>setSuccess(""),2000);}).catch(()=>{});
              }} style={{padding:'9px 14px',background:'#f4f6f8',color:'#0f1b2d',border:'1px solid #e2e6ea',borderRadius:'8px',fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>
                🔗
              </button>
            </div>
          </div>

          {/* Seller's Listings */}
          <div style={{padding:'16px'}}>
            <h3 style={{fontSize:'16px',fontWeight:'700',marginBottom:'12px'}}>
              {publicSellerListings.length > 0
                ? `${publicSeller.name}'s ${publicSeller.accountType === "provider" ? "Items" : "Listings"}`
                : (publicSellerServices.length > 0 ? '' : 'No active listings or services')}
            </h3>
            
            {publicSellerListings.length === 0 ? (
              publicSellerServices.length === 0 ? (
                <div style={{textAlign:'center',padding:'40px 16px',background:'#fff',borderRadius:'12px'}}>
                  <div style={{fontSize:'40px',marginBottom:'12px'}}>📭</div>
                  <div style={{fontSize:'14px',color:'#8a9bb0'}}>Nothing active right now</div>
                </div>
              ) : null
            ) : publicSellerListings.length >= 4 ? (
              // ─── Horizontal scroll for sellers with 4+ listings ───
              // Avoids a long vertical scroll dominated by one seller's inventory.
              // Cards are smaller (160px wide) and tappable to open full detail.
              <div style={{
                display:'flex',
                gap:'10px',
                overflowX:'auto',
                paddingBottom:'10px',
                WebkitOverflowScrolling:'touch',
                scrollSnapType:'x mandatory',
              }}>
                {publicSellerListings.map((item) => {
                  const cover = (item.photos && item.photos[0]) || item.photoUrl;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setViewingListing(item)}
                      style={{
                        flexShrink:0,
                        width:'160px',
                        background:'#fff',
                        borderRadius:'12px',
                        border:'1px solid #e2e6ea',
                        overflow:'hidden',
                        cursor:'pointer',
                        scrollSnapAlign:'start',
                      }}>
                      {cover ? (
                        <img src={cover} alt={item.title} style={{width:'100%',height:'120px',objectFit:'cover'}} />
                      ) : (
                        <div style={{width:'100%',height:'120px',background:'#f4f6f8',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'32px'}}>📦</div>
                      )}
                      <div style={{padding:'8px 10px 10px'}}>
                        <div style={{fontSize:'12px',fontWeight:'600',color:'#0f1b2d',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:'4px'}}>
                          {item.title}
                        </div>
                        <div style={{fontFamily:'serif',fontSize:'14px',fontWeight:'700',color:'#0f1b2d'}}>
                          {item.price?.toLocaleString()} TSh
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                        <button onClick={()=>{requireAuth("message",()=>startConversation(item));}} style={{fontSize:'12px',color:'#06d6c7',cursor:'pointer',border:'none',background:'none',fontWeight:'600'}}>💬 Message</button>
                        <button onClick={()=>shareOnWhatsApp(item)} style={{fontSize:'12px',color:'#25D366',cursor:'pointer',border:'none',background:'none',fontWeight:'600'}}>📲</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Services Portfolio */}
          {publicSellerServices.length > 0 && (
            <div style={{padding:'0 16px 16px'}}>
              <h3 style={{fontSize:'16px',fontWeight:'700',marginBottom:'12px',color:'#0f1b2d'}}>
                Services offered
              </h3>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'10px'}}>
                {publicSellerServices.map((svc) => {
                  const cat = SERVICE_CATEGORIES.find(c=>c.id===svc.category);
                  const cover = (svc.photos && svc.photos[0]) || svc.photoUrl;
                  return (
                    <div key={svc.id} onClick={()=>{closeSellerProfile();setTimeout(()=>setViewingService(svc),100);}} style={{background:'#fff',borderRadius:'14px',overflow:'hidden',cursor:'pointer',border:'1px solid #e2e6ea'}}>
                      {cover ? (
                        <img src={cover} alt={svc.title} style={{width:'100%',height:'110px',objectFit:'cover'}}/>
                      ) : (
                        <div style={{width:'100%',height:'110px',background:'linear-gradient(135deg,#0d9488,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'36px'}}>
                          {cat?.icon || '⚡'}
                        </div>
                      )}
                      <div style={{padding:'10px'}}>
                        <div style={{fontSize:'12px',color:'#0d9488',fontWeight:'600',marginBottom:'2px'}}>{cat?.name}</div>
                        <div style={{fontSize:'13px',fontWeight:'600',color:'#0f1b2d',marginBottom:'4px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{svc.title}</div>
                        <div style={{fontSize:'13px',fontWeight:'700',color:'#0d9488'}}>
                          {svc.priceType==="starting"?"From ":""}{svc.price?.toLocaleString()} TSh
                          {svc.priceType==="negotiable" && <span style={{fontSize:'10px',color:'#8a9bb0',fontWeight:'400'}}> · negotiable</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SEO-friendly footer text */}
          <div style={{padding:'16px',textAlign:'center',fontSize:'12px',color:'#8a9bb0',lineHeight:'1.6'}}>
            <p>{publicSeller.name} is a student seller on Kampasika, the campus marketplace. Browse their listings, message them directly, or share their profile with friends.</p>
            <p style={{marginTop:'8px'}}>
              <span style={{fontFamily:'serif',fontWeight:'700',color:'#0f1b2d'}}>Kam<em style={{color:'#06d6c7'}}>pa</em>sika</span> — Trade, share & find your next deal on campus.
            </p>
          </div>
          </>
          )}
        </div>
      )}
      
      {/* ─── ADMIN DASHBOARD ─── */}
      {page==="admin" && (
        <div style={{width:'100%',flex:1,paddingTop:'12px',paddingBottom:'100px',background:'#f9fafb',minHeight:'100vh',height:'100vh',overflowY:'auto',WebkitOverflowScrolling:'touch'}}>
          <div style={{maxWidth:'700px',margin:'0 auto',padding:'0 16px'}}>
            {!isAdmin ? (
              <div style={{textAlign:'center',padding:'60px 16px',background:'#fff',borderRadius:'12px',marginTop:'20px'}}>
                <div style={{fontSize:'40px',marginBottom:'12px'}}>🔒</div>
                <div style={{fontSize:'16px',fontWeight:'600'}}>Admin access only</div>
                <div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Ukurasa huu ni kwa admin tu.</div>
                <button onClick={()=>setPage("home")} style={{marginTop:'20px',padding:'10px 20px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>← Back to home</button>
              </div>
            ) : (
              <>
                {/* Header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px',marginTop:'12px'}}>
                  <h1 style={{fontSize:'22px',fontWeight:'700',color:'#0f1b2d',margin:0}}>Admin Dashboard</h1>
                  <button onClick={loadAdminData} disabled={adminLoading} style={{padding:'8px 14px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:adminLoading?'wait':'pointer'}}>
                    {adminLoading ? '...' : '↻ Refresh'}
                  </button>
                </div>

                {/* Six numbers (no charts) */}
                {adminStats && (
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'24px'}}>
                    {[
                      {label:'Users', data: adminStats.users, color:'#0d9488'},
                      {label:'Search Alerts', data: adminStats.alerts, color:'#06d6c7'},
                      {label:'Listings (Goods)', data: adminStats.listings, color:'#0d9488'},
                      {label:'Services', data: adminStats.services, color:'#0d9488'},
                      {label:'Rooms', data: adminStats.rooms, color:'#ef4444'},
                    ].map(stat => (
                      <div key={stat.label} style={{background:'#fff',borderRadius:'12px',padding:'14px',border:'1px solid #e2e6ea'}}>
                        <div style={{fontSize:'11px',color:'#8a9bb0',marginBottom:'4px',textTransform:'uppercase',letterSpacing:'0.5px'}}>{stat.label}</div>
                        <div style={{fontSize:'24px',fontWeight:'700',color: stat.color}}>{stat.data.total}</div>
                        <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'2px'}}>+{stat.data.thisWeek} this week</div>
                      </div>
                    ))}
                  </div>
                )}
               
                <div style={{
  background:'#fff',
  padding:'16px',
  borderRadius:'12px',
  marginBottom:'16px',
  border:'1px solid #e2e6ea'
}}>
  <div style={{
    display:'flex',
    justifyContent:'space-between',
    alignItems:'center'
  }}>
    
    <div>
      <div style={{
        fontSize:'16px',
        fontWeight:'700',
        marginBottom:'4px'
      }}>
        🏠 Rooms Feature
      </div>

      <div style={{
        fontSize:'13px',
        color:'#6b7280'
      }}>
        Enable or disable room listings platform-wide
      </div>
    </div>

    <button
      onClick={toggleRoomsFeature}
      style={{
        padding:'10px 16px',
        border:'none',
        borderRadius:'10px',
        cursor:'pointer',
        fontWeight:'700',
        background: ENABLE_ROOMS
          ? '#10b981'
          : '#ef4444',
        color:'#fff'
      }}
    >
      {ENABLE_ROOMS ? 'ON' : 'OFF'}
    </button>
  </div>
</div>


                <div style={{background:'#fff',padding:'16px',borderRadius:'12px',marginBottom:'16px',border:'1px solid #e2e6ea'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'12px'}}>
                    <div>
                      <div style={{fontSize:'16px',fontWeight:'700',marginBottom:'4px'}}>Identity Verification</div>
                      <div style={{fontSize:'13px',color:'#6b7280'}}>Require verified accounts before using main app features</div>
                    </div>
                    <button onClick={toggleIdentityVerificationRequirement} style={{padding:'10px 16px',border:'none',borderRadius:'10px',cursor:'pointer',fontWeight:'700',background:REQUIRE_IDENTITY_VERIFICATION?'#10b981':'#ef4444',color:'#fff',flexShrink:0}}>
                      {REQUIRE_IDENTITY_VERIFICATION ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>                {/* ─── VERIFICATION QUEUE ─── */}
                <div style={{marginBottom:'24px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                    <h2 style={{fontSize:'16px',fontWeight:'700',color:'#0f1b2d',margin:0}}>
                      Verification Queue
                      {adminVerifications.filter(v => v.status === "pending").length > 0 && (
                        <span style={{marginLeft:'8px',padding:'2px 8px',background:'#ccfbf1',color:'#0f766e',fontSize:'11px',fontWeight:'700',borderRadius:'10px'}}>
                          {adminVerifications.filter(v => v.status === "pending").length} pending
                        </span>
                      )}
                    </h2>
                    <div style={{fontSize:'11px',color:'#8a9bb0'}}>ID submissions to review</div>
                  </div>

                  {/* Filter chips */}
                  <div style={{display:'flex',gap:'6px',marginBottom:'12px',overflowX:'auto'}}>
                    {[
                      {id:'pending',label:'Pending'},
                      {id:'approved',label:'Approved'},
                      {id:'rejected',label:'Rejected'},
                    ].map(f => (
                      <button key={f.id} onClick={()=>setVerificationFilter(f.id)} style={{flexShrink:0,padding:'6px 14px',background:verificationFilter===f.id?'#0f1b2d':'#fff',color:verificationFilter===f.id?'#fff':'#6b7280',border:verificationFilter===f.id?'none':'1px solid #e2e6ea',borderRadius:'18px',fontSize:'12px',fontWeight:'600',cursor:'pointer',whiteSpace:'nowrap'}}>
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Queue */}
                  {(() => {
                    const filtered = adminVerifications.filter(v => v.status === verificationFilter);
                    if (filtered.length === 0) {
                      return <div style={{textAlign:'center',padding:'24px',background:'#fff',borderRadius:'12px',color:'#8a9bb0',fontSize:'13px'}}>Hakuna {verificationFilter}</div>;
                    }
                    return (
                      <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                        {filtered.map(req => {
                          const isStudent = req.accountType !== "provider";
                          const idType = isStudent ? "🎓 Student ID" : "🪪 NIDA";
                          return (
                            <div key={req.id} style={{background:'#fff',borderRadius:'12px',padding:'12px',border:'1px solid #e2e6ea'}}>
                              <div style={{display:'flex',gap:'10px',alignItems:'flex-start',marginBottom:'8px'}}>
                                {/* ID photo */}
                                {(req.idUrl || req.studentIdUrl) && (
                                  <img
                                    src={req.idUrl || req.studentIdUrl}
                                    alt="ID"
                                    onClick={() => setViewingIdPhoto(req.idUrl || req.studentIdUrl)}
                                    style={{width:'80px',height:'80px',objectFit:'cover',borderRadius:'8px',flexShrink:0,cursor:'pointer',border:'1px solid #e2e6ea'}}
                                  />
                                )}
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{display:'flex',gap:'6px',alignItems:'center',marginBottom:'4px',flexWrap:'wrap'}}>
                                    <span style={{padding:'2px 8px',background:isStudent?'#dbeafe':'#ccfbf1',color:isStudent?'#1e40af':'#0f766e',fontSize:'10px',fontWeight:'700',borderRadius:'8px'}}>{idType}</span>
                                    <span style={{fontSize:'10px',color:'#9ca3af'}}>{req.createdAt ? req.createdAt.toLocaleString() : '—'}</span>
                                  </div>
                                  <div style={{fontSize:'13px',fontWeight:'700',color:'#0f1b2d',marginBottom:'2px'}}>
                                    {req.userName || 'Unknown'}
                                  </div>
                                  <div style={{fontSize:'11px',color:'#6b7280',lineHeight:1.5}}>
                                    Account: {req.email}<br/>
                                    {req.phone && <>Phone: {req.phone}<br/></>}
                                    {req.nameOnId && <>Jina kwenye ID: <b>{req.nameOnId}</b><br/></>}
                                    {req.nidaNumber && <>NIDA: <span style={{fontFamily:'monospace'}}>{req.nidaNumber}</span><br/></>}
                                    {isStudent && req.universityName && <>Chuo: {req.universityName}<br/></>}
                                  </div>
                                </div>
                              </div>

                              {/* Status / Actions */}
                              {req.status === "pending" && (
                                rejectingId === req.id ? (
                                  // Reject reason picker
                                  <div style={{background:'#fef2f2',borderRadius:'10px',padding:'10px',marginTop:'8px'}}>
                                    <div style={{fontSize:'11px',fontWeight:'600',color:'#991b1b',marginBottom:'8px'}}>Sababu ya kukataa:</div>
                                    <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                                      {[
                                        {id:'blurry',label:'Picha haijawa wazi'},
                                        {id:'mismatched_name',label:'Jina halilingani'},
                                        {id:'fake_id',label:'Kitambulisho si halisi'},
                                        {id:'wrong_type',label:'Aina mbaya ya ID'},
                                        {id:'expired',label:'Imeisha muda'},
                                      ].map(r => (
                                        <button key={r.id} onClick={() => rejectVerification(req, r.id)} style={{padding:'8px 10px',background:'#fff',border:'1px solid #fecaca',borderRadius:'6px',fontSize:'12px',color:'#991b1b',cursor:'pointer',textAlign:'left'}}>
                                          {r.label}
                                        </button>
                                      ))}
                                    </div>
                                    <button onClick={()=>setRejectingId(null)} style={{marginTop:'8px',padding:'6px 12px',background:'transparent',border:'none',fontSize:'11px',color:'#6b7280',cursor:'pointer'}}>Ghairi</button>
                                  </div>
                                ) : (
                                  <div style={{display:'flex',gap:'6px'}}>
                                    <button onClick={()=>approveVerification(req)} style={{flex:1,padding:'8px',background:'#0d9488',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'700',cursor:'pointer'}}>✓ Approve</button>
                                    <button onClick={()=>setRejectingId(req.id)} style={{flex:1,padding:'8px',background:'#fff',color:'#ef4444',border:'1px solid #fecaca',borderRadius:'8px',fontSize:'12px',fontWeight:'700',cursor:'pointer'}}>✗ Reject</button>
                                  </div>
                                )
                              )}
                              {req.status === "approved" && (
                                <div style={{padding:'6px 10px',background:'#dcfce7',color:'#166534',fontSize:'11px',fontWeight:'700',borderRadius:'8px',display:'inline-block'}}>✓ Approved {req.reviewedAt ? req.reviewedAt.toLocaleDateString() : ''}</div>
                              )}
                              {req.status === "rejected" && (
                                <div style={{padding:'6px 10px',background:'#fee2e2',color:'#991b1b',fontSize:'11px',fontWeight:'700',borderRadius:'8px',display:'inline-block'}}>✗ Rejected ({req.rejectionReason || 'no reason'})</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Demand Inbox header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                  <h2 style={{fontSize:'16px',fontWeight:'700',color:'#0f1b2d',margin:0}}>Demand Inbox</h2>
                  <div style={{fontSize:'11px',color:'#8a9bb0'}}>Search queries that need supply matching</div>
                </div>

                {/* Filter chips */}
                <div style={{display:'flex',gap:'6px',marginBottom:'14px',overflowX:'auto'}}>
                  {[
                    {id:'inbox',label:'New'},
                    {id:'routed',label:'Routed'},
                    {id:'fulfilled',label:'Fulfilled'},
                    {id:'all',label:'All'},
                  ].map(f => (
                    <button key={f.id} onClick={()=>setAdminFilter(f.id)} style={{flexShrink:0,padding:'6px 14px',background:adminFilter===f.id?'#0f1b2d':'#fff',color:adminFilter===f.id?'#fff':'#6b7280',border:adminFilter===f.id?'none':'1px solid #e2e6ea',borderRadius:'18px',fontSize:'12px',fontWeight:'600',cursor:'pointer',whiteSpace:'nowrap'}}>
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Alerts list */}
                {(() => {
                  const filtered = adminAlerts.filter(a => {
                    if (adminFilter === 'inbox') return !a.routedAt && !a.fulfilledAt;
                    if (adminFilter === 'routed') return a.routedAt && !a.fulfilledAt;
                    if (adminFilter === 'fulfilled') return a.fulfilledAt;
                    return true;
                  });
                  if (adminLoading) {
                    return <div style={{textAlign:'center',padding:'40px',color:'#8a9bb0'}}>Inapakia...</div>;
                  }
                  if (filtered.length === 0) {
                    return <div style={{textAlign:'center',padding:'30px',background:'#fff',borderRadius:'12px',color:'#8a9bb0',fontSize:'13px'}}>Hakuna alerts katika {adminFilter}</div>;
                  }
                  return (
                    <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                      {filtered.map(alert => {
                        const kindColors = {
                          listing: {bg:'#ccfbf1',color:'#0f766e'},
                          service: {bg:'#ede9fe',color:'#5b21b6'},
                          room: {bg:'#dbeafe',color:'#1e40af'},
                          collection: {bg:'#fce7f3',color:'#9f1239'},
                        };
                        const k = kindColors[alert.kind] || {bg:'#f3f4f6',color:'#374151'};
                        return (
                          <div key={alert.id} style={{background:'#fff',borderRadius:'12px',padding:'12px',border:'1px solid #e2e6ea'}}>
                            {/* Top row: kind badge + date */}
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
                              <span style={{display:'inline-block',padding:'3px 10px',background:k.bg,color:k.color,fontSize:'10px',fontWeight:'700',borderRadius:'10px',textTransform:'uppercase',letterSpacing:'0.3px'}}>{alert.kind}</span>
                              <span style={{fontSize:'10px',color:'#9ca3af'}}>{alert.createdAt ? alert.createdAt.toLocaleString() : '—'}</span>
                            </div>
                            {/* Query */}
                            <div style={{fontSize:'14px',fontWeight:'600',color:'#0f1b2d',marginBottom:'6px',lineHeight:1.4}}>
                              "{alert.query}"
                            </div>
                            {/* User info */}
                            <div style={{fontSize:'11px',color:'#6b7280',marginBottom:'10px',lineHeight:1.5}}>
                              <div><b>{alert.userName || 'Unknown'}</b> · {alert.userEmail || 'no email'}</div>
                              {alert.userPhone && <div>📞 <a href={`tel:${alert.userPhone}`} style={{color:'#0d9488',textDecoration:'none'}}>{alert.userPhone}</a> · <a href={`https://wa.me/255${alert.userPhone.replace(/\D/g, '').replace(/^0/, '')}`} target="_blank" rel="noreferrer" style={{color:'#25d366',textDecoration:'none'}}>WhatsApp</a></div>}
                            </div>
                            {/* Status + actions */}
                            <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                              {alert.fulfilledAt ? (
                                <span style={{padding:'5px 10px',background:'#dcfce7',color:'#166534',fontSize:'10px',fontWeight:'700',borderRadius:'8px'}}>✓ Fulfilled</span>
                              ) : alert.routedAt ? (
                                <>
                                  <span style={{padding:'5px 10px',background:'#ccfbf1',color:'#0f766e',fontSize:'10px',fontWeight:'700',borderRadius:'8px'}}>→ Routed</span>
                                  <button onClick={()=>markAlertFulfilled(alert)} style={{padding:'5px 10px',background:'#0d9488',color:'#fff',border:'none',borderRadius:'8px',fontSize:'10px',fontWeight:'700',cursor:'pointer'}}>Mark Fulfilled</button>
                                </>
                              ) : (
                                <button onClick={()=>markAlertRouted(alert)} style={{padding:'5px 10px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'8px',fontSize:'10px',fontWeight:'700',cursor:'pointer'}}>Mark Routed →</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Footer */}
                <div style={{textAlign:'center',padding:'30px 0 10px',color:'#9ca3af',fontSize:'11px'}}>
                  Use this inbox to drive your WhatsApp Channel demand broadcasts.<br/>
                  Mark <b>Routed</b> after broadcasting. Mark <b>Fulfilled</b> when student is matched.
                </div>
              </>
            )}
          </div>
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
          {!user ? (
            <div style={{
              marginTop:'24px',
              background:'#fff',
              borderRadius:'20px',
              padding:'36px 24px',
              textAlign:'center',
              boxShadow:'0 4px 20px rgba(15,27,45,0.08)',
              border:'1px solid #e8ecf0'
            }}>
              <div style={{
                width:'80px',
                height:'80px',
                margin:'0 auto 20px',
                borderRadius:'50%',
                background:'linear-gradient(135deg,#0f1b2d,#0d9488)',
                display:'flex',
                alignItems:'center',
                justifyContent:'center',
                fontSize:'36px',
                color:'#fff',
                boxShadow:'0 8px 24px rgba(13,148,136,0.25)'
              }}>👤</div>
              <h2 style={{fontFamily:'serif',fontSize:'22px',fontWeight:'700',color:'#0f1b2d',margin:'0 0 8px'}}>
                You don&apos;t have a profile yet
              </h2>
              <p style={{fontSize:'14px',color:'#6b7280',lineHeight:1.6,margin:'0 0 24px',maxWidth:'280px',marginLeft:'auto',marginRight:'auto'}}>
                Join Kampasika to create your campus profile — sell items, offer services, message buyers, and save listings.
              </p>
              <button
                type="button"
                onClick={()=>{ setAuthMode('signup'); setShowAuthModal(true); }}
                style={{
                  width:'100%',
                  maxWidth:'280px',
                  padding:'14px 20px',
                  background:'linear-gradient(135deg,#0d9488,#0ea5a0)',
                  color:'#fff',
                  border:'none',
                  borderRadius:'12px',
                  fontSize:'16px',
                  fontWeight:'700',
                  cursor:'pointer',
                  marginBottom:'10px',
                  boxShadow:'0 4px 14px rgba(13,148,136,0.3)'
                }}
              >
                Join Kampasika — it&apos;s free
              </button>
              <button
                type="button"
                onClick={()=>{ setAuthMode('login'); setShowAuthModal(true); }}
                style={{
                  width:'100%',
                  maxWidth:'280px',
                  padding:'12px 20px',
                  background:'#f4f6f8',
                  color:'#0f1b2d',
                  border:'none',
                  borderRadius:'12px',
                  fontSize:'15px',
                  fontWeight:'600',
                  cursor:'pointer'
                }}
              >
                Already have an account? Sign in
              </button>
              <div style={{marginTop:'28px',paddingTop:'20px',borderTop:'1px solid #eef2f5',display:'flex',flexDirection:'column',gap:'10px',textAlign:'left'}}>
                {[
                  { icon:'🛍️', text:'Buy and sell on campus' },
                  { icon:'💬', text:'Chat with sellers safely' },
                  { icon:'✓', text:'Optional verified badge' },
                ].map(row => (
                  <div key={row.text} style={{display:'flex',alignItems:'center',gap:'10px',fontSize:'13px',color:'#4a5568'}}>
                    <span style={{fontSize:'18px'}}>{row.icon}</span>
                    <span>{row.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
          <>
          {showAboutBanner && (
            <div style={{background:'#fff',borderRadius:'16px',padding:'16px',marginBottom:'16px',border:'1px solid #ccfbf1',boxShadow:'0 4px 16px rgba(15,27,45,0.06)'}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px'}}>
                <div>
                  <div style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700',color:'#0f1b2d',marginBottom:'6px'}}>
                    Kam<em style={{color:'#06d6c7',fontStyle:'normal'}}>pa</em>sika
                  </div>
                  <p style={{fontSize:'12px',lineHeight:1.55,color:'#4a5568',margin:'0 0 10px'}}>
                    Mtandao wa wanachuo kwa kumanage group, kununua, kuuza, kutoa huduma, na kuunda jamii za chuo.
                  </p>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                    {['Goods', 'Services', 'Groups', 'Verified'].map(tag => (
                      <span key={tag} style={{fontSize:'10px',fontWeight:'800',color:'#0f766e',background:'#ecfeff',padding:'4px 8px',borderRadius:'8px'}}>{tag}</span>
                    ))}
                  </div>
                </div>
                <button type="button" aria-label="Close about" onClick={()=>setShowAboutBanner(false)} style={{width:'24px',height:'24px',borderRadius:'50%',border:'none',background:'#f4f6f8',color:'#344054',fontSize:'14px',fontWeight:'800',cursor:'pointer',flexShrink:0}}>×</button>
              </div>
            </div>
          )}

          {showVerifiedBanner && (
            <div style={{background:'linear-gradient(135deg,#042f2e,#0f766e)',borderRadius:'16px',padding:'16px',marginBottom:'16px',color:'#fff',boxShadow:'0 4px 16px rgba(15,27,45,0.12)'}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px'}}>
                <div>
                  <div style={{fontSize:'15px',fontWeight:'800',marginBottom:'6px'}}>Uko Verified</div>
                  <p style={{fontSize:'12px',lineHeight:1.55,margin:0,color:'rgba(255,255,255,0.86)'}}>
                    Akaunti yako imethibitishwa. Listings na huduma zako zinaonyesha badge ya uaminifu.
                  </p>
                </div>
                <button type="button" aria-label="Close verification status" onClick={()=>setShowVerifiedBanner(false)} style={{width:'24px',height:'24px',borderRadius:'50%',border:'none',background:'rgba(255,255,255,0.15)',color:'#fff',fontSize:'14px',fontWeight:'800',cursor:'pointer',flexShrink:0}}>×</button>
              </div>
            </div>
          )}

          {showGetVerifiedBanner && (
            <div style={{background:'linear-gradient(135deg,#0f766e,#06d6c7)',borderRadius:'16px',padding:'16px',marginBottom:'16px',color:'#fff',boxShadow:'0 4px 16px rgba(6,214,199,0.22)'}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px',marginBottom:'12px'}}>
                <div>
                  <div style={{fontSize:'15px',fontWeight:'800',marginBottom:'6px'}}>Pata Verified Badge</div>
                  <p style={{fontSize:'12px',lineHeight:1.55,margin:0,color:'rgba(255,255,255,0.9)'}}>
                    Thibitisha akaunti yako ili wanunuzi wakuamini zaidi na listings zako zionekane vizuri.
                  </p>
                </div>
                <button type="button" aria-label="Close get verified" onClick={()=>setShowGetVerifiedBanner(false)} style={{width:'24px',height:'24px',borderRadius:'50%',border:'none',background:'rgba(255,255,255,0.18)',color:'#fff',fontSize:'14px',fontWeight:'800',cursor:'pointer',flexShrink:0}}>×</button>
              </div>
              <button type="button" onClick={()=>{setShowGetVerifiedBanner(false);setShowVerifyModal(true);}} style={{width:'100%',padding:'11px',background:'#fff',color:'#0f766e',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'800',cursor:'pointer'}}>
                Anza kuthibitisha
              </button>
            </div>
          )}

          <div style={{background:'#fff',borderRadius:'16px',padding:'20px 18px',marginBottom:'16px'}}>
           {/* Top row: avatar + stats */}
           <div style={{display:'flex',alignItems:'center',gap:'20px',marginBottom:'14px'}}>
             <div style={{position:'relative',flexShrink:0}}>
  <div
    role="button"
    tabIndex={0}
    title="Change profile picture"
    onClick={()=>{setEditProfileData({name:userName,bio:userBio,services:userServices,avatarFile:null,avatarPreview:userAvatar,avatarPreset:null});setShowEditProfile(true)}}
    onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){setEditProfileData({name:userName,bio:userBio,services:userServices,avatarFile:null,avatarPreview:userAvatar,avatarPreset:null});setShowEditProfile(true)}}}
    style={{width:'72px',height:'72px',minWidth:'72px',minHeight:'72px',flexShrink:0,aspectRatio:'1 / 1',overflow:'hidden',borderRadius:'50%',backgroundImage:userAvatar?`url(${userAvatar})`:'none',
backgroundColor:!userAvatar?'#06d6c7':'transparent',
backgroundSize:'cover',
backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'26px',fontWeight:'700',color:'#0f1b2d',border:'2.5px solid #f0fffe',cursor:'pointer'}}>
    {!userAvatar&&userName.split(" ").map(n=>n[0]).join("")}
  </div>
  <button
    type="button"
    onClick={()=>{setEditProfileData({name:userName,bio:userBio,services:userServices,avatarFile:null,avatarPreview:userAvatar,avatarPreset:null});setShowEditProfile(true)}}
    aria-label="Change profile picture"
    style={{position:'absolute',bottom:'-3px',right:'-3px',width:'24px',height:'24px',borderRadius:'50%',background:'#0f1b2d',border:'2px solid #fff',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:'800',cursor:'pointer',padding:0}}
  >
    +
  </button>
</div>
             {/* Stats */}
             <div style={{display:'flex',gap:'20px',flex:1,justifyContent:'space-around'}}>
               <div style={{textAlign:'center'}}>
                 <div style={{fontSize:'18px',fontWeight:'700',color:'#0f1b2d',lineHeight:1.1}}>{myActiveListings.length}</div>
                 <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'2px'}}>Listings</div>
               </div>
               <div style={{textAlign:'center'}}>
                 <div style={{fontSize:'18px',fontWeight:'700',color:'#0f1b2d',lineHeight:1.1}}>{myServices.length}</div>
                 <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'2px'}}>Services</div>
               </div>
               <div style={{textAlign:'center'}}>
                 <div style={{fontSize:'18px',fontWeight:'700',color:'#0f1b2d',lineHeight:1.1}}>{cart.length}</div>
                 <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'2px'}}>Saved</div>
               </div>
             </div>
           </div>
           {/* Name + verified badge */}
           <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'4px'}}>
             <div style={{fontSize:'16px',fontWeight:'700',color:'#0f1b2d'}}>{userName}</div>
             {isVerified && (
               <VerifiedBadge user={{ isVerified: true, verificationBadge: userAccountType === "provider" ? "provider" : "student" }} size="xs" />
             )}
           </div>
           <div style={{fontSize:'12px',color:'#8a9bb0',marginBottom:ENABLE_PHONE_VERIFICATION?'8px':'12px'}}>{userAccountType === "provider" ? "Service Provider" : "Student - " + (selectedUni?.short || "ARU")}</div>
           {ENABLE_PHONE_VERIFICATION && <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px',fontSize:'12px',color:phoneVerified?'#065f46':'#0f766e',fontWeight:'700'}}>
             <span>{phoneVerified ? 'Phone verified' : 'Phone not verified'}</span>
             {!phoneVerified && <button type="button" onClick={()=>setShowPhoneVerifyModal(true)} style={{border:'none',background:'#ccfbf1',color:'#0f766e',borderRadius:'999px',padding:'4px 8px',fontSize:'11px',fontWeight:'800',cursor:'pointer'}}>Verify now</button>}
           </div>}
           {/* Edit profile + QR buttons */}
           <div style={{display:'flex',gap:'8px'}}>
             <button onClick={()=>{setEditProfileData({name:userName,bio:userBio,services:userServices,avatarFile:null,avatarPreview:userAvatar,avatarPreset:null});setShowEditProfile(true)}} style={{flex:1,padding:'8px',background:'#f4f6f8',color:'#0f1b2d',border:'1px solid #e2e6ea',borderRadius:'8px',fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>Edit Profile</button>
             <button onClick={()=>setShowQRModal(true)} style={{padding:'8px 14px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:'600',cursor:'pointer',display:'flex',alignItems:'center',gap:'5px'}}>
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><rect x="19" y="14" width="2" height="2"/><rect x="14" y="19" width="2" height="2"/><rect x="19" y="19" width="2" height="2"/></svg>
               My QR
             </button>
           </div>
           <div style={{display:'flex',gap:'8px',marginTop:'8px'}}>
             <button type="button" onClick={()=>{setShowAboutBanner(false);setShowGetVerifiedBanner(false);isVerified ? setShowVerifiedBanner(true) : setShowVerifyModal(true);}} style={{flex:1,padding:'8px',background:'#ecfeff',color:'#0f766e',border:'1px solid #99f0ee',borderRadius:'8px',fontSize:'12px',fontWeight:'800',cursor:'pointer'}}>{isVerified ? 'Verification status' : 'Get verified'}</button>
             <button type="button" onClick={()=>{setShowAboutBanner(true);setShowVerifiedBanner(false);setShowGetVerifiedBanner(false);}} style={{flex:1,padding:'8px',background:'#f4f6f8',color:'#344054',border:'1px solid #e2e6ea',borderRadius:'8px',fontSize:'12px',fontWeight:'800',cursor:'pointer'}}>About</button>
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
          
          <div style={{display:'flex',gap:'4px',background:'#fff',borderRadius:'10px',padding:'4px',marginBottom:'16px',overflowX:'auto'}}>
            <button onClick={()=>setProfileTab("listings")} style={{flex:'1 0 auto',padding:'8px 10px',border:'none',background:profileTab==="listings"?'#0f1b2d':'none',color:profileTab==="listings"?'#fff':'#8a9bb0',fontSize:'12px',fontWeight:'500',cursor:'pointer',borderRadius:'8px',whiteSpace:'nowrap'}}>My Listings</button>
            <button onClick={()=>setProfileTab("myServices")} style={{flex:'1 0 auto',padding:'8px 10px',border:'none',background:profileTab==="myServices"?'#0d9488':'none',color:profileTab==="myServices"?'#fff':'#8a9bb0',fontSize:'12px',fontWeight:'500',cursor:'pointer',borderRadius:'8px',whiteSpace:'nowrap'}}>My Services</button>
            {ENABLE_ROOMS && <button onClick={()=>setProfileTab("myRooms")} style={{flex:'1 0 auto',padding:'8px 10px',border:'none',background:profileTab==="myRooms"?'#06d6c7':'none',color:profileTab==="myRooms"?'#fff':'#8a9bb0',fontSize:'12px',fontWeight:'500',cursor:'pointer',borderRadius:'8px',whiteSpace:'nowrap'}}>My Rooms</button>}
            <button onClick={()=>setProfileTab("saved")} style={{flex:'1 0 auto',padding:'8px 10px',border:'none',background:profileTab==="saved"?'#0f1b2d':'none',color:profileTab==="saved"?'#fff':'#8a9bb0',fontSize:'12px',fontWeight:'500',cursor:'pointer',borderRadius:'8px',whiteSpace:'nowrap'}}>Saved ({cart.length})</button>
          </div>
          
          {profileTab==="listings"&&(
            <>
              {myActiveListings.length>0&&<div style={{marginBottom:'16px'}}>
                <h3 style={{fontSize:'16px',fontWeight:'700',color:'#10b981',marginBottom:'12px'}}>Active Listings ({myActiveListings.length})</h3>
                <div style={{display:'flex',flexDirection:'column'}}>
                  {myActiveListings.map((item,idx)=>(
                    <div key={item.id} onClick={()=>setOpenListingId(openListingId===item.id?null:item.id)} style={{background:'#fff',borderBottom:idx===myActiveListings.length-1?'none':'1px solid #e2e6ea',padding:'16px',borderRadius:idx===0?'12px 12px 0 0':idx===myActiveListings.length-1?'0 0 12px 12px':'0',cursor:'pointer',border:openListingId===item.id?'1.5px solid #06d6c7':'',transition:'border 0.15s ease'}}>
                      {item.photoUrl && <img src={item.photoUrl} alt={item.title} style={{width:'100%',height:'150px',objectFit:'cover',borderRadius:'10px',marginBottom:'10px'}} />}
                      <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'4px'}}>{item.title}</div>
                      {item.description && <div style={{fontSize:'13px',color:'#4a5568',marginBottom:'8px',lineHeight:1.5}}>{item.description}</div>}
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:'10px',borderTop:'1px solid #e2e6ea'}}>
                        <div style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700'}}>{item.price.toLocaleString()} TSh</div>
                        {openListingId!==item.id && <span style={{fontSize:'11px',color:'#8a9bb0'}}>Tap to manage</span>}
                      </div>
                     {openListingId===item.id && <div style={{display:'flex',gap:'8px',marginTop:'8px'}}>
                        {!item.sold&&<button onClick={(e)=>{e.stopPropagation();markAsSold(item.id);}} style={{padding:'8px 16px',background:'#10b981',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>✓ Mark as Sold</button>}
                        <button onClick={(e)=>{e.stopPropagation();deleteListing(item.id);}} style={{padding:'8px 16px',background:'#ef4444',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>🗑 Delete</button>
                      </div>}
                    </div>
                  ))}
                </div>
              </div>}

              {myActiveListings.length===0&&<div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px'}}><div style={{fontSize:'40px'}}>📝</div><div style={{fontSize:'16px',fontWeight:'600',marginTop:'12px'}}>No listings yet</div><button onClick={()=>setPage("create")} style={{marginTop:'16px',padding:'10px 20px',background:'#06d6c7',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:'pointer'}}>Create Listing</button></div>}
            </>
          )}
          
          {profileTab==="myServices"&&(
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              {myServices.length === 0 ? (
                <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px'}}>
                  <div style={{fontSize:'40px'}}>⚡</div>
                  <div style={{fontSize:'16px',fontWeight:'600',marginTop:'12px'}}>No services listed</div>
                  <div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Offer your skills to fellow students</div>
                  <button onClick={()=>setPage("createService")} style={{marginTop:'16px',padding:'10px 20px',background:'#0d9488',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Offer a Service</button>
                </div>
              ) : (
                <>
                  {myServices.map((svc,idx)=>(
                    <div key={svc.id} style={{background:'#fff',padding:'16px',borderRadius:'12px',border:'1px solid #e2e6ea'}}>
                      <div style={{display:'flex',gap:'12px',alignItems:'center',marginBottom:'8px'}}>
                        {(svc.photos && svc.photos.length > 0) ? (
                          <img src={svc.photos[0]} alt="" style={{width:'60px',height:'60px',objectFit:'cover',borderRadius:'10px',flexShrink:0}}/>
                        ) : (
                          <div style={{width:'60px',height:'60px',borderRadius:'10px',background:'linear-gradient(135deg,#0d9488,#a78bfa)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'24px',flexShrink:0}}>
                            {SERVICE_CATEGORIES.find(c=>c.id===svc.category)?.icon || '⚡'}
                          </div>
                        )}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'2px'}}>{svc.title}</div>
                          <div style={{fontSize:'13px',color:'#0d9488',fontWeight:'600'}}>{svc.price?.toLocaleString()} TSh</div>
                          <div style={{fontSize:'11px',color:'#8a9bb0'}}>{SERVICE_CATEGORIES.find(c=>c.id===svc.category)?.name}</div>
                        </div>
                      </div>
                      <button onClick={()=>deleteService(svc.id)} style={{padding:'8px 16px',background:'#ef4444',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>🗑 Remove</button>
                    </div>
                  ))}
                  <button onClick={()=>setPage("createService")} style={{padding:'12px',background:'#0d9488',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Add Another Service</button>
                </>
              )}
            </div>
          )}

          {ENABLE_ROOMS && profileTab==="myRooms" && (
            <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <h3 style={{fontSize:'16px',fontWeight:'700',color:'#0f1b2d'}}>
                  My Rooms ({myAllRooms.length})
                </h3>
                <button onClick={()=>{if(!user){requireAuth("listRoom",()=>setPage("createRoom"));return;}setPage("createRoom");}} style={{padding:'8px 14px',background:'#06d6c7',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>+ Add room</button>
              </div>

              {myAllRooms.length === 0 ? (
                <div style={{textAlign:'center',padding:'40px 16px',background:'#fff',borderRadius:'12px'}}>
                  <div style={{fontSize:'40px',marginBottom:'10px'}}>🏠</div>
                  <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'6px'}}>Hauna chumba kilichoorodheshwa bado</div>
                  <div style={{fontSize:'12px',color:'#8a9bb0'}}>Bonyeza "Add room" hapo juu kuanza.</div>
                </div>
              ) : (
                myAllRooms.map(room => {
                  const isAvailable = room.available !== false;
                  return (
                    <div key={room.id} style={{background:'#fff',borderRadius:'12px',padding:'12px',border:'1px solid #e2e6ea',display:'flex',gap:'12px',alignItems:'stretch'}}>
                      {/* Photo or placeholder */}
                      {(room.photos && room.photos[0]) ? (
                        <img src={room.photos[0]} alt={room.location||'Chumba'} style={{width:'80px',height:'80px',objectFit:'cover',borderRadius:'10px',flexShrink:0}}/>
                      ) : (
                        <div style={{width:'80px',height:'80px',borderRadius:'10px',background:'#f4f6f8',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'28px',flexShrink:0}}>🏠</div>
                      )}
                      {/* Info + buttons */}
                      <div style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'space-between',minWidth:0}}>
                        <div>
                          <div style={{fontSize:'13px',fontWeight:'700',color:'#0f1b2d',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {room.location || 'Chumba'}
                          </div>
                          <div style={{fontSize:'12px',color:'#6b7280',marginBottom:'2px'}}>
                            {room.roomType ? `${room.roomType} · ` : ''}{room.price?.toLocaleString()} TSh/mwezi
                          </div>
                          <div style={{
                            display:'inline-block',
                            fontSize:'10px',fontWeight:'600',
                            color: isAvailable ? '#0d9488' : '#9ca3af',
                            background: isAvailable ? '#f0fffe' : '#f3f4f6',
                            padding:'2px 8px',borderRadius:'10px',marginTop:'2px'
                          }}>
                            {isAvailable ? '● KIPO WAZI' : '● KIMEPANGISHWA'}
                          </div>
                        </div>
                        <div style={{display:'flex',gap:'6px',marginTop:'8px'}}>
                          <button
                            onClick={()=>toggleRoomAvailability(room)}
                            style={{
                              flex:1,
                              padding:'7px 8px',
                              fontSize:'11px',
                              fontWeight:'600',
                              borderRadius:'8px',
                              border:'none',
                              cursor:'pointer',
                              background: isAvailable ? '#06d6c7' : '#10b981',
                              color:'#fff'
                            }}>
                            {isAvailable ? 'Weka Kimepangishwa' : 'Rudisha Kipo Wazi'}
                          </button>
                          <button
                            onClick={()=>deleteMyRoom(room)}
                            style={{
                              padding:'7px 10px',
                              fontSize:'11px',
                              fontWeight:'600',
                              borderRadius:'8px',
                              border:'1px solid #fecaca',
                              cursor:'pointer',
                              background:'#fff',
                              color:'#ef4444'
                            }}>
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
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
          
          {isAdmin && (
            <button onClick={()=>setPage("admin")} style={{width:'100%',padding:'12px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:'600',cursor:'pointer',marginTop:'10px'}}>
              ⚙️ Admin Dashboard
            </button>
          )}

          {/* Instagram-style subtle logout */}
          <div style={{marginTop:'24px',paddingTop:'16px',borderTop:'1px solid #f0f2f5',display:'flex',justifyContent:'center'}}>
            <button type="button" onClick={handleLogout} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 16px',background:'#fee2e2',color:'#dc2626',border:'1px solid #fca5a5',borderRadius:'20px',fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>
              🚪 <span>Log out</span>
            </button>
          </div>
          </>
          )}
        </div>
      )}
      
      {/* ============ QR PAYMENT SCANNER MODAL ============ */}
      {showQRScanner && (
        <div style={{position:'fixed',inset:0,background:'#0f1b2d',zIndex:4000,display:'flex',flexDirection:'column'}}>
          {/* Header */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',background:'rgba(0,0,0,0.4)'}}>
            <div style={{color:'#fff',fontSize:'16px',fontWeight:'700'}}>Scan Payment QR</div>
            <button onClick={stopScanner} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:'8px',padding:'8px 14px',fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>Close</button>
          </div>

          {/* Camera or result */}
          <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'20px'}}>

            {scanLoading && !scanResult && (
              <div style={{textAlign:'center',color:'#fff'}}>
                <div style={{fontSize:'40px',marginBottom:'12px'}}>📷</div>
                <div style={{fontSize:'15px',fontWeight:'600'}}>Opening camera...</div>
              </div>
            )}

            {scanError && (
              <div style={{textAlign:'center',color:'#fff',maxWidth:'300px'}}>
                <div style={{fontSize:'40px',marginBottom:'12px'}}>⚠️</div>
                <div style={{fontSize:'14px',lineHeight:1.6,marginBottom:'20px'}}>{scanError}</div>
                <button onClick={()=>{setScanError("");openScanner();}} style={{padding:'12px 24px',background:'#06d6c7',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'700',cursor:'pointer'}}>Try Again</button>
              </div>
            )}

            {/* Live camera feed */}
            {!scanResult && !scanError && (
              <div style={{position:'relative',width:'100%',maxWidth:'360px'}}>
                <video ref={scanVideoRef} style={{width:'100%',borderRadius:'16px',background:'#000'}} playsInline muted/>
                {/* Scanning overlay */}
                <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
                  <div style={{width:'200px',height:'200px',border:'3px solid #06d6c7',borderRadius:'16px',boxShadow:'0 0 0 9999px rgba(15,27,45,0.55)'}}>
                    {/* Corner accents */}
                    {[['0','0','borderTopLeftRadius'],['0','auto','borderTopRightRadius'],['auto','0','borderBottomLeftRadius'],['auto','auto','borderBottomRightRadius']].map(([t,r,_],i)=>(
                      <div key={i} style={{position:'absolute',top:t==='0'?-3:'auto',bottom:t==='auto'?-3:'auto',left:r==='0'?-3:'auto',right:r==='auto'?-3:'auto',width:'20px',height:'20px',border:'4px solid #06d6c7',borderTop:i<2?'4px solid #06d6c7':'none',borderBottom:i>=2?'4px solid #06d6c7':'none',borderLeft:r==='0'?'4px solid #06d6c7':'none',borderRight:r==='auto'?'4px solid #06d6c7':'none'}}/>
                    ))}
                  </div>
                </div>
                <div style={{textAlign:'center',marginTop:'16px',color:'rgba(255,255,255,0.7)',fontSize:'13px'}}>Point camera at student's QR code</div>
              </div>
            )}

            {/* Scan result */}
            {scanResult && (
              <div style={{width:'100%',maxWidth:'340px',background:'#fff',borderRadius:'20px',padding:'24px',textAlign:'center'}}>
                <div style={{fontSize:'48px',marginBottom:'8px'}}>{(scanResult.order.approved || scanResult.order.paid) ? '✅' : '⏳'}</div>
                <div style={{fontSize:'18px',fontWeight:'800',color: (scanResult.order.approved || scanResult.order.paid) ? '#065f46' : '#0f766e',marginBottom:'4px'}}>
                  {scanResult.order.registered ? 'REGISTERED' : scanResult.order.paid ? 'CONFIRMED PAID' : 'NOT YET PAID'}
                </div>
                <div style={{fontSize:'20px',fontWeight:'700',color:'#0f1b2d',marginBottom:'4px'}}>{scanResult.order.studentName}</div>
                <div style={{fontSize:'13px',color:'#8a9bb0',marginBottom:'4px'}}>{scanResult.collectionTitle}</div>
                {scanResult.groupTitle && <div style={{fontSize:'12px',color:'#0d9488',fontWeight:'800',marginBottom:'8px'}}>{scanResult.groupTitle}</div>}
                {scanResult.order.selectedOption && <div style={{fontSize:'12px',background:'#ccfbf1',color:'#0f766e',padding:'3px 10px',borderRadius:'8px',display:'inline-block',marginBottom:'8px'}}>{scanResult.order.selectedOption}</div>}
                {scanResult.order.paymentRef && <div style={{fontSize:'12px',fontFamily:'monospace',color:'#166534',background:'#f0fdf4',padding:'4px 10px',borderRadius:'6px',marginBottom:'16px'}}>Ref: {scanResult.order.paymentRef}</div>}
                <div style={{display:'flex',gap:'8px',marginTop:'8px'}}>
                  {!(scanResult.order.approved || scanResult.order.paid) && (
                    <button onClick={confirmScanPayment} disabled={scanLoading} style={{flex:1,padding:'12px',background:'#10b981',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'700',cursor:'pointer'}}>
                      {scanLoading ? 'Confirming...' : '✓ Mark as Paid'}
                    </button>
                  )}
                  <button onClick={()=>{setScanResult(null);setScanError("");openScanner();}} style={{flex:1,padding:'12px',background:'#f4f6f8',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>
                    Scan Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ QR CODE MODAL ============ */}
      {showQRModal && user && (
        <div
          onClick={()=>setShowQRModal(false)}
          style={{
            position:'fixed',top:0,left:0,right:0,bottom:0,
            background:'rgba(15,27,45,0.7)',
            backdropFilter:'blur(6px)',
            WebkitBackdropFilter:'blur(6px)',
            zIndex:3000,
            display:'flex',alignItems:'center',justifyContent:'center',
            padding:'24px'
          }}
        >
          <div
            onClick={e=>e.stopPropagation()}
            style={{
              background:'#fff',
              borderRadius:'24px',
              padding:'28px 24px',
              width:'100%',
              maxWidth:'320px',
              textAlign:'center',
              boxShadow:'0 20px 60px rgba(0,0,0,0.3)',
              position:'relative'
            }}
          >
            <button
              onClick={()=>setShowQRModal(false)}
              style={{position:'absolute',top:'14px',right:'16px',background:'none',border:'none',fontSize:'22px',color:'#8a9bb0',cursor:'pointer',lineHeight:1}}
            >×</button>

            <div style={{
              width:'56px',height:'56px',borderRadius:'50%',
              backgroundImage:userAvatar?`url(${userAvatar})`:'none',
              backgroundColor:!userAvatar?'#06d6c7':'transparent',
              backgroundSize:'cover',backgroundPosition:'center',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:'20px',fontWeight:'700',color:'#0f1b2d',
              margin:'0 auto 8px',
              border:'2.5px solid #f0fffe'
            }}>
              {!userAvatar && userName.split(" ").map(n=>n[0]).join("").substring(0,2).toUpperCase()}
            </div>

            <div style={{fontSize:'15px',fontWeight:'700',color:'#0f1b2d',marginBottom:'2px'}}>
              {userName}
              {isVerified && <span style={{marginLeft:'6px',fontSize:'12px',color:'#06d6c7'}}>✓</span>}
            </div>
            <div style={{fontSize:'12px',color:'#8a9bb0',marginBottom:'20px'}}>
              {userAccountType === "provider" ? "Service Provider" : `Student · ${selectedUni?.short || "ARU"}`}
            </div>

            <div style={{
              display:'inline-block',
              padding:'16px',
              background:'#fff',
              borderRadius:'16px',
              border:'2px solid #e2e6ea',
              marginBottom:'16px'
            }}>
              <QRCodeSVG
                value={`https://kampasika.org/u/${user.uid}`}
                size={180}
                bgColor="#ffffff"
                fgColor="#0f1b2d"
                level="M"
              />
            </div>

            <div style={{
              fontSize:'11px',color:'#8a9bb0',
              background:'#f4f6f8',borderRadius:'8px',
              padding:'6px 10px',marginBottom:'16px',
              wordBreak:'break-all',fontFamily:'monospace'
            }}>
              kampasika.org/u/{user.uid.substring(0,14)}...
            </div>

            <div style={{display:'flex',gap:'8px'}}>
              <button
                onClick={()=>{
                  const url = `https://kampasika.org/u/${user.uid}`;
                  if (navigator.share) {
                    navigator.share({ title: `${userName} on Kampasika`, url });
                  } else {
                    navigator.clipboard?.writeText(url).then(()=>{
                      setSuccess("Link copied!");
                      setTimeout(()=>setSuccess(""),2000);
                    }).catch(()=>{});
                  }
                }}
                style={{flex:1,padding:'11px',background:'#f4f6f8',color:'#0f1b2d',border:'1px solid #e2e6ea',borderRadius:'10px',fontSize:'13px',fontWeight:'600',cursor:'pointer'}}
              >
                🔗 Share Link
              </button>
              <button
                onClick={()=>{
                  const msg = `Check out my Kampasika profile!\nhttps://kampasika.org/u/${user.uid}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                }}
                style={{flex:1,padding:'11px',background:'#25D366',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:'600',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px'}}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </button>
            </div>

            <p style={{fontSize:'11px',color:'#8a9bb0',marginTop:'14px',lineHeight:1.5,margin:'14px 0 0'}}>
              Anyone who scans this will see your profile, listings and services on Kampasika.
            </p>
          </div>
        </div>
      )}

      {showEditProfile && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}} onClick={()=>setShowEditProfile(false)}>
          <div style={{background:'#fff',borderRadius:'16px',padding:'20px',width:'100%',maxWidth:'400px',maxHeight:'88vh',overflowY:'auto',boxSizing:'border-box'}} onClick={(e)=>e.stopPropagation()}>
            <h3 style={{fontSize:'20px',fontWeight:'700',marginBottom:'16px'}}>Edit Profile</h3>
            
            <input type="file" id="avatar-upload" accept="image/*" style={{display:'none'}} onChange={(e)=>handlePhotoSelect(e,'profile')} />
            <label htmlFor="avatar-upload" style={{display:'block',marginBottom:'16px',cursor:'pointer'}}>
              <div style={{width:'80px',height:'80px',margin:'0 auto',borderRadius:'50%',backgroundImage:editProfileData.avatarPreview?`url(${editProfileData.avatarPreview})`:'none',
backgroundColor:!editProfileData.avatarPreview?'#f4f6f8':'transparent',
backgroundSize:'cover',
backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
                {!editProfileData.avatarPreview && <span style={{fontSize:'32px'}}>📷</span>}
                <div style={{position:'absolute',bottom:'0',background:'rgba(6,214,199,0.9)',color:'#0f1b2d',fontSize:'10px',fontWeight:'600',padding:'4px 8px',borderRadius:'12px'}}>Change</div>
              </div>
            </label>
            
            <div style={{marginBottom:'16px'}}>
              <div style={{fontSize:'12px',fontWeight:'700',color:'#0f1b2d',marginBottom:'8px',textAlign:'center'}}>Or choose an avatar</div>
              <div style={{display:'flex',gap:'8px',justifyContent:'center',flexWrap:'wrap'}}>
                {AVATAR_COLORS.map(color => {
                  const selected = editProfileData.avatarPreset === color;
                  const previewUrl = makeInitialAvatarUrl(editProfileData.name || userName, color);
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setEditProfileData({
                        ...editProfileData,
                        avatarFile: null,
                        avatarPreset: color,
                        avatarPreview: previewUrl,
                      })}
                      aria-label="Choose avatar color"
                      style={{
                        width:'38px',
                        height:'38px',
                        borderRadius:'50%',
                        border:selected?'3px solid #0f1b2d':'2px solid #e2e6ea',
                        backgroundImage:`url(${previewUrl})`,
                        backgroundSize:'cover',
                        backgroundPosition:'center',
                        cursor:'pointer',
                        padding:0,
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <div style={{marginBottom:'12px'}}>
              <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Username</label>
              <input type="text" value={editProfileData.name} onChange={e=>{
                const nextName = e.target.value;
                setEditProfileData({
                  ...editProfileData,
                  name: nextName,
                  avatarPreview: editProfileData.avatarPreset ? makeInitialAvatarUrl(nextName || userName, editProfileData.avatarPreset) : editProfileData.avatarPreview,
                });
              }} placeholder="Your name" style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}} />
            </div>

            {/* BIO FIELD HIDDEN FOR NOW — uncomment to re-enable */}
            <div style={{marginBottom:'12px'}}>
              <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Short bio</label>
              <textarea value={editProfileData.bio || ""} onChange={e=>setEditProfileData({...editProfileData,bio:e.target.value})} placeholder="A few words about you" maxLength={150} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',minHeight:'76px',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'}} />
              <div style={{fontSize:'11px',color:'#8a9bb0',textAlign:'right',marginTop:'4px'}}>{(editProfileData.bio||"").length}/150</div>
            </div>

            <div style={{display:'none',marginBottom:'16px'}}>
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
                    }} style={{padding:'6px 12px',borderRadius:'20px',border: selected ? '2px solid #06d6c7' : '1.5px solid #e2e6ea',background: selected ? '#f0fffe' : '#fff',color: selected ? '#0f1b2d' : '#6b7280',fontSize:'12px',fontWeight:'500',cursor:'pointer',display:'flex',alignItems:'center',gap:'4px',opacity: !selected && (editProfileData.services||[]).length >= 3 ? 0.4 : 1}}>
                      {tag.icon} {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div style={{position:'sticky',bottom:'-20px',background:'#fff',paddingTop:'10px',paddingBottom:'2px'}}>
              <button onClick={handleUpdateProfile} disabled={uploading} style={{width:'100%',padding:'13px',background:'#06d6c7',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'700',cursor:uploading?'not-allowed':'pointer'}}>{uploading?"Uploading...":"Save changes"}</button>
              <button onClick={()=>setShowEditProfile(false)} style={{width:'100%',padding:'12px',background:'#f4f6f8',color:'#344054',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:'700',cursor:'pointer',marginTop:'8px'}}>Cancel</button>
            </div>
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
              border:(photoIndex || 0) === idx ? '2px solid #06d6c7' : '2px solid transparent',
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
          color:'#06d6c7',
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
              background:'#f0fffe',
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
                minWidth:'56px',
                minHeight:'56px',
                flexShrink:0,
                aspectRatio:'1 / 1',
                overflow:'hidden',
                borderRadius:'50%',
                background:viewingListing.userAvatar?`url(${viewingListing.userAvatar})`:'linear-gradient(135deg,#06d6c7,#0f1b2d)',
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
                <WhatsAppIcon size={22} color="#25D366" />
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
              background:'#06d6c7',
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
                cursor:'pointer',
                display:'flex',
                alignItems:'center',
                justifyContent:'center',
                gap:'8px'
              }}
            >
              <WhatsAppIcon size={18} /> WhatsApp
            </button>
          )}
          <button 
            onClick={() => toggleSave(viewingListing)}
            style={{
              padding:'16px',
              background:cart.some(c => c.id === viewingListing.id)?'#0d9488':'#f4f6f8',
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
      maxWidth:'420px',
      maxHeight:'90vh',
      overflowY:'auto'
    }} onClick={(e)=>e.stopPropagation()}>
      <h3 style={{fontSize:'20px',fontWeight:'700',marginBottom:'6px'}}>
        {userAccountType === "provider" ? "Thibitisha akaunti yako" : "Thibitisha kwamba ni mwanafunzi"}
      </h3>
      <p style={{fontSize:'13px',color:'#6b7280',marginBottom:'16px',lineHeight:1.5}}>
        {userAccountType === "provider"
          ? "Pakia picha ya kitambulisho cha NIDA. Hii inasaidia wanafunzi kukuamini unaweza kufanya kazi kweli."
          : "Pakia picha ya kitambulisho chako cha mwanafunzi. Hii inasaidia kuhakikisha Kampasika ni salama."}
      </p>

      {/* Name on ID (required for both) */}
      <label style={{display:'block',fontSize:'12px',fontWeight:'600',color:'#374151',marginBottom:'6px'}}>
        Jina kama lilivyo kwenye kitambulisho
      </label>
      <input
        type="text"
        value={nameOnIdInput}
        onChange={e => setNameOnIdInput(e.target.value)}
        placeholder="Jina kamili"
        style={{
          width:'100%',
          padding:'12px',
          border:'1.5px solid #e2e6ea',
          borderRadius:'10px',
          fontSize:'14px',
          outline:'none',
          boxSizing:'border-box',
          marginBottom:'14px'
        }}
      />

      {/* NIDA number — providers only */}
      {userAccountType === "provider" && (
        <>
          <label style={{display:'block',fontSize:'12px',fontWeight:'600',color:'#374151',marginBottom:'6px'}}>
            Namba ya NIDA
          </label>
          <input
            type="text"
            value={nidaNumberInput}
            onChange={e => setNidaNumberInput(e.target.value)}
            placeholder="Mfano: 19850315-12345-12345-12"
            style={{
              width:'100%',
              padding:'12px',
              border:'1.5px solid #e2e6ea',
              borderRadius:'10px',
              fontSize:'14px',
              outline:'none',
              boxSizing:'border-box',
              marginBottom:'14px'
            }}
          />
        </>
      )}

      <input 
        type="file" 
        id="student-id-upload" 
        accept="image/*" 
        style={{display:'none'}} 
        onChange={(e) => {
          const file = e.target.files[0];
          if (!file) return;
          if (!file.type.startsWith('image/')) {
            setError("Tafadhali chagua picha");
            return;
          }
          if (file.size > 5 * 1024 * 1024) {
            setError("Picha ni kubwa sana. Max 5MB");
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
              alt="ID" 
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
              Badilisha picha
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
            <div style={{fontSize:'48px',marginBottom:'12px'}}>
              {userAccountType === "provider" ? "🪪" : "🎓"}
            </div>
            <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'4px'}}>
              {userAccountType === "provider" ? "Pakia picha ya NIDA" : "Pakia picha ya Student ID"}
            </div>
            <div style={{fontSize:'11px',color:'#8a9bb0'}}>Bonyeza kuchagua (max 5MB)</div>
          </div>
        )}
      </label>
      
      <div style={{
        background:'#eff6ff',
        padding:'12px',
        borderRadius:'10px',
        marginBottom:'16px'
      }}>
        <div style={{fontSize:'12px',color:'#1e40af',lineHeight:1.5}}>
          <strong>Tutaangalia:</strong>
          <br/>• Picha iko wazi (haina ukungu)
          <br/>• Jina linafanana na uliloandika hapo juu
          {userAccountType === "provider" ? <><br/>• Namba ya NIDA inalingana</> : <><br/>• Chuo kinaonekana</>}
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
      : (studentIdFile && !uploading ? '#0d9488' : '#e2e6ea'),
    color: verificationStatus === "pending"
      ? '#6b7280'
      : (studentIdFile && !uploading ? '#fff' : '#8a9bb0'),
    border:'none',
    borderRadius:'10px',
    fontSize:'14px',
    fontWeight:'700',
    cursor: verificationStatus === "pending" || !studentIdFile || uploading 
      ? 'not-allowed' 
      : 'pointer',
    marginBottom:'8px'
  }}
>
  {uploading 
    ? 'Inawasilisha...' 
    : verificationStatus === "pending"
    ? '⏳ Tayari imewasilishwa'
    : verificationStatus === "rejected"
    ? 'Wasilisha tena'
    : 'Wasilisha kwa Uthibitisho'
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
      

      {/* Phone Capture Modal (for saving search alerts) */}
      {/* Full-size ID photo viewer for admin */}
      {viewingIdPhoto && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}} onClick={()=>setViewingIdPhoto(null)}>
          <img src={viewingIdPhoto} alt="ID full size" style={{maxWidth:'100%',maxHeight:'90vh',borderRadius:'8px'}} />
          <button onClick={()=>setViewingIdPhoto(null)} style={{position:'fixed',top:'20px',right:'20px',background:'#fff',color:'#000',border:'none',borderRadius:'50%',width:'40px',height:'40px',fontSize:'18px',cursor:'pointer'}}>×</button>
        </div>
      )}

      {phonePromptOpen && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:600,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}} onClick={()=>{ setPhonePromptOpen(false); setPendingAlert(null); }}>
          <div style={{background:'#fff',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'380px'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:'34px',textAlign:'center',marginBottom:'10px'}}>📱</div>
            <div style={{fontSize:'17px',fontWeight:'700',textAlign:'center',color:'#0f1b2d',marginBottom:'8px'}}>
              Tunahitaji namba yako
            </div>
            <div style={{fontSize:'13px',color:'#6b7280',textAlign:'center',lineHeight:1.5,marginBottom:'18px'}}>
              Ili nikupate ukipatikana kile unachosaka. Hatutatuma matangazo — ni mawasiliano ya moja kwa moja tu.
              <br/><br/>
              <span style={{fontSize:'11px',color:'#9ca3af'}}>
                (So I can reach you when what you searched for is found. No spam — just direct contact.)
              </span>
            </div>
            <input
              type="tel"
              autoFocus
              placeholder="0712345678"
              value={phoneInputValue}
              onChange={e=>setPhoneInputValue(e.target.value)}
              onKeyDown={e=>{ if (e.key==='Enter') submitPhoneAndSaveAlert(); }}
              style={{width:'100%',padding:'14px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box',marginBottom:'12px'}}
            />
            <button onClick={submitPhoneAndSaveAlert} style={{width:'100%',padding:'14px',background:'#0d9488',color:'#fff',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:'700',cursor:'pointer',marginBottom:'8px'}}>
              Hifadhi na uniarifu
            </button>
            <button onClick={()=>{ setPhonePromptOpen(false); setPendingAlert(null); }} style={{width:'100%',padding:'10px',background:'transparent',color:'#6b7280',border:'none',fontSize:'13px',cursor:'pointer'}}>
              Hapana, asante
            </button>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}} onClick={()=>{setShowAuthModal(false);setError("");}}>
          <div style={{background:'#fff',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'400px',maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
              <h2 style={{fontFamily:'serif',fontSize:'22px',fontWeight:'700'}}>Kam<em style={{color:'#06d6c7'}}>pa</em>sika</h2>
              <button onClick={()=>{setShowAuthModal(false);setError("");}} style={{background:'none',border:'none',fontSize:'24px',cursor:'pointer',color:'#8a9bb0'}}>×</button>
            </div>
            {error && <div style={{background:'#fee2e2',color:'#991b1b',padding:'12px',borderRadius:'8px',marginBottom:'16px',fontSize:'13px'}}>{error}</div>}
            {authMode==="signup"?(
              <>
                <p style={{fontSize:'14px',color:'#6b7280',marginBottom:'16px'}}>Create an account to sell, message sellers, and save items</p>
                <div style={{marginBottom:'12px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Username</label><input type="text" placeholder="e.g. Amina Juma" value={signupName} onChange={e=>setSignupName(e.target.value)} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>
                <div style={{marginBottom:'12px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Email address</label><input type="email" placeholder="yourname@gmail.com" value={email} onChange={e=>setEmail(e.target.value)} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>
                {false && <>
                  <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'8px'}}>Are you a student?</label>
                  <div style={{display:'flex',gap:'8px'}}>
                    <button type="button" onClick={()=>setIsStudent(true)} style={{
                      flex:1,
                      padding:'12px',
                      background: isStudent ? '#0f1b2d' : '#fff',
                      color: isStudent ? '#fff' : '#0f1b2d',
                      border: isStudent ? '1.5px solid #0f1b2d' : '1.5px solid #e2e6ea',
                      borderRadius:'10px',
                      fontSize:'14px',
                      fontWeight:'600',
                      cursor:'pointer',
                      transition:'all 0.15s ease'
                    }}>🎓 Yes, student</button>
                    <button type="button" onClick={()=>setIsStudent(false)} style={{
                      flex:1,
                      padding:'12px',
                      background: !isStudent ? '#0f1b2d' : '#fff',
                      color: !isStudent ? '#fff' : '#0f1b2d',
                      border: !isStudent ? '1.5px solid #0f1b2d' : '1.5px solid #e2e6ea',
                      borderRadius:'10px',
                      fontSize:'14px',
                      fontWeight:'600',
                      cursor:'pointer',
                      transition:'all 0.15s ease'
                    }}>💼 No, provider</button>
                  </div>
                  <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'6px',lineHeight:1.4}}>
                    {isStudent
                      ? 'Students at ARU can sell goods, offer services, find rooms.'
                      : 'Providers (barbers, tailors, landlords, vendors) can list services near campus.'}
                  </div>
                </>}

                {false && (
                  <div style={{marginBottom:'12px'}}>
                    <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Your location / area *</label>
                    <input type="text" placeholder="e.g. Kijitonyama, Mlimani, Ubungo" value={signupLocation} onChange={e=>setSignupLocation(e.target.value)} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/>
                    <div style={{fontSize:'11px',color:'#8a9bb0',marginTop:'4px'}}>
                      So students can find you. Use the area name your customers know you by.
                    </div>
                  </div>
                )}
                <div style={{marginBottom:'16px',position:'relative'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Password</label><input type={showPassword?"text":"password"} placeholder="At least 6 characters" value={password} onChange={e=>setPassword(e.target.value)} style={{width:'100%',padding:'12px 45px 12px 12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/><button onClick={()=>setShowPassword(!showPassword)} style={{position:'absolute',right:'12px',top:'34px',background:'none',border:'none',cursor:'pointer',fontSize:'18px'}}>{showPassword?"👁":"👁‍🗨"}</button></div>
                <button onClick={handleSignup} disabled={loading} style={{width:'100%',padding:'12px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'600',cursor:loading?'not-allowed':'pointer'}}>{loading?"Creating...":"Create Account"}</button>
                <p style={{textAlign:'center',marginTop:'16px',fontSize:'13px',color:'#8a9bb0'}}>Already have an account? <span style={{color:'#06d6c7',cursor:'pointer',fontWeight:'600'}} onClick={()=>{setAuthMode("login");setError("");}}>Log in</span></p>
              </>
            ):(
              <>
                <p style={{fontSize:'14px',color:'#6b7280',marginBottom:'16px'}}>Welcome back to Kampasika</p>
                <div style={{marginBottom:'12px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Email</label><input type="email" placeholder="yourname@gmail.com" value={email} onChange={e=>setEmail(e.target.value)} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/></div>
                <div style={{marginBottom:'16px',position:'relative'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Password</label><input type={showPassword?"text":"password"} placeholder="Your password" value={password} onChange={e=>setPassword(e.target.value)} style={{width:'100%',padding:'12px 45px 12px 12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box'}}/><button onClick={()=>setShowPassword(!showPassword)} style={{position:'absolute',right:'12px',top:'34px',background:'none',border:'none',cursor:'pointer',fontSize:'18px'}}>{showPassword?"👁":"👁‍🗨"}</button></div>
                <button onClick={handleLogin} disabled={loading} style={{width:'100%',padding:'14px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'10px',fontSize:'16px',fontWeight:'800',boxShadow:'0 4px 14px rgba(15,27,45,0.25)',cursor:loading?'not-allowed':'pointer'}}>{loading?"Logging in...":"Log In"}</button>
                <p style={{textAlign:'center',marginTop:'16px',fontSize:'13px',color:'#8a9bb0'}}>Don't have an account? <span style={{color:'#06d6c7',cursor:'pointer',fontWeight:'600'}} onClick={()=>{setAuthMode("signup");setError("");}}>Sign up</span></p>
              </>
            )}
          </div>
        </div>
      )}

      {ENABLE_PHONE_VERIFICATION && showPhoneVerifyModal && user && !phoneVerified && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1200,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}} onClick={()=>setShowPhoneVerifyModal(false)}>
          <div style={{background:'#fff',borderRadius:'16px',padding:'22px',width:'100%',maxWidth:'390px',boxShadow:'0 18px 50px rgba(15,27,45,0.22)'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:'20px',fontWeight:'900',color:'#0f1b2d',marginBottom:'6px'}}>Verify your phone</div>
            <div style={{fontSize:'13px',color:'#6b7280',lineHeight:1.5,marginBottom:'16px'}}>
              This helps protect groups, orders, payments, and event registrations.
            </div>
            <label style={{display:'block',fontSize:'12px',fontWeight:'700',color:'#0f1b2d',marginBottom:'6px'}}>Phone number</label>
            <input
              type="tel"
              value={userPhone}
              disabled={phoneOtpBusy}
              onChange={e=>{setUserPhone(e.target.value);setPhoneOtpSent(false);setPhoneOtpCode("");}}
              placeholder="0712345678"
              style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box',marginBottom:'10px'}}
            />
            {phoneOtpSent && (
              <>
                <label style={{display:'block',fontSize:'12px',fontWeight:'700',color:'#0f1b2d',marginBottom:'6px'}}>SMS code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={phoneOtpCode}
                  onChange={e=>setPhoneOtpCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                  placeholder="Enter 6 digit code"
                  style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'16px',outline:'none',boxSizing:'border-box',marginBottom:'10px'}}
                />
              </>
            )}
            <div style={{display:'flex',gap:'8px',marginTop:'6px'}}>
              <button type="button" onClick={requestPhoneOtp} disabled={phoneOtpBusy} style={{flex:1,padding:'12px',background:'#0d9488',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'900',cursor:phoneOtpBusy?'wait':'pointer'}}>
                {phoneOtpBusy ? 'Please wait...' : phoneOtpSent ? 'Resend code' : 'Send code'}
              </button>
              {phoneOtpSent && (
                <button type="button" onClick={verifyPhoneOtp} disabled={phoneOtpBusy || phoneOtpCode.length!==6} style={{flex:1,padding:'12px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'900',cursor:phoneOtpBusy?'wait':'pointer',opacity:phoneOtpCode.length===6?1:0.55}}>
                  Verify
                </button>
              )}
            </div>
            <button type="button" onClick={()=>setShowPhoneVerifyModal(false)} style={{width:'100%',padding:'11px',background:'transparent',color:'#8a9bb0',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'800',cursor:'pointer',marginTop:'8px'}}>
              Skip for now
            </button>
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
              background:'linear-gradient(135deg, #06d6c7, #06d6c7)',
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
              background:'linear-gradient(135deg, #06d6c7, #06d6c7)',
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
  display:page==="create"||page==="chat"||page==="createService"||page==="createCollection"||page==="createRoom"||page==="groupDetail"?'none':'flex',
  alignItems:'center',
  justifyContent:'space-around',
  zIndex:1000,
  boxSizing:'border-box',
  padding:'6px 0 env(safe-area-inset-bottom, 8px) 0'
}}>
        <button onClick={()=>setPage("communities")} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',cursor:'pointer',padding:'8px',border:'none',background:'none',position:'relative'}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={page==="communities"?'#06d6c7':'#8a9bb0'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transition:'all 0.2s ease'}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span style={{fontSize:'10px',color:page==="communities"?'#06d6c7':'#8a9bb0',fontWeight:page==="communities"?'700':'500',transition:'all 0.2s ease'}}>Groups</span>
          {groupUnreadCount>0&&<span style={{position:'absolute',top:'2px',right:'2px',background:'#22c55e',color:'#fff',fontSize:'8px',fontWeight:'700',padding:'2px 5px',borderRadius:'10px',minWidth:'16px',textAlign:'center',boxShadow:'0 2px 7px rgba(34,197,94,0.28)'}}>{groupUnreadCount}</span>}
        </button>
        <button onClick={()=>{setPage("home");handleTabTap("goods");}} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',cursor:'pointer',padding:'8px',border:'none',background:'none',position:'relative'}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{transition:'all 0.2s ease'}}><circle cx="10.5" cy="10.5" r="6" stroke={page==="home"?'#06d6c7':'#8a9bb0'} strokeWidth="2.2" fill="none"/><line x1="15" y1="15" x2="20" y2="20" stroke={page==="home"?'#06d6c7':'#8a9bb0'} strokeWidth="2.2" strokeLinecap="round"/><path d="M16.5 4.5L17.2 6.3L19 7L17.2 7.7L16.5 9.5L15.8 7.7L14 7L15.8 6.3Z" fill={page==="home"?'#06d6c7':'#8a9bb0'}/></svg><span style={{fontSize:'10px',color:page==="home"?'#06d6c7':'#8a9bb0',fontWeight:page==="home"?'700':'500',transition:'all 0.2s ease'}}>Discover</span></button>
        <button onClick={()=>{user ? setPage("create") : requireAuth("sell", ()=>setPage("create"));}} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'0',cursor:'pointer',padding:'0',border:'none',background:'none',marginTop:'-20px'}}><div style={{width:'48px',height:'48px',borderRadius:'16px',background:'linear-gradient(135deg,#06d6c7,#06d6c7)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 14px rgba(6,214,199,0.35)'}}><span style={{fontSize:'24px',color:'#fff',lineHeight:1}}>＋</span></div><span style={{fontSize:'10px',color:'#06d6c7',fontWeight:'600',marginTop:'2px'}}>Sell</span></button>
        <button onClick={()=>{ if(!user){requireAuth("messages",()=>setPage("messages"));return;} setPage("messages"); }} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',cursor:'pointer',padding:'8px',border:'none',background:'none',position:'relative'}}><span style={{fontSize:'22px',color:page==="messages"?'#06d6c7':'#8a9bb0',transition:'color 0.2s ease'}}>💬</span><span style={{fontSize:'10px',color:page==="messages"?'#06d6c7':'#8a9bb0',fontWeight:page==="messages"?'700':'500',transition:'all 0.2s ease'}}>Messages</span>{unreadCount>0&&<span style={{position:'absolute',top:'2px',right:'2px',background:'#ef4444',color:'#fff',fontSize:'8px',fontWeight:'700',padding:'2px 5px',borderRadius:'10px',minWidth:'16px',textAlign:'center',boxShadow:'0 2px 6px rgba(239,68,68,0.3)'}}>{unreadCount}</span>}</button>
        <button onClick={()=>setPage("profile")} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',cursor:'pointer',padding:'8px',border:'none',background:'none'}}>
  <span style={{
    width:'24px',
    height:'24px',
    minWidth:'24px',
    minHeight:'24px',
    flexShrink:0,
    aspectRatio:'1 / 1',
    borderRadius:'50%',
    overflow:'hidden',
    backgroundImage:userAvatar?`url(${userAvatar})`:'none',
    backgroundColor:userAvatar?'transparent':(page==="profile"?'#06d6c7':'#8a9bb0'),
    backgroundSize:'cover',
    backgroundPosition:'center',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    color:'#fff',
    fontSize:'10px',
    fontWeight:'700',
    border:page==="profile"?'2px solid #06d6c7':'2px solid transparent',
    boxSizing:'border-box',
    transition:'all 0.2s ease'
  }}>
    {!userAvatar && (userName ? userName.split(" ").map(n=>n[0]).join("").substring(0,2).toUpperCase() : "👤")}
  </span>
  <span style={{fontSize:'10px',color:page==="profile"?'#06d6c7':'#8a9bb0',fontWeight:page==="profile"?'700':'500',transition:'all 0.2s ease'}}>Profile</span>
</button>
      
    </div>
  </div>
  </>
);
}

export default App;
