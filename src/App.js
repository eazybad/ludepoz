import { useState, useEffect } from "react";
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, doc, query, where, getDocs, serverTimestamp, orderBy, setDoc, getDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyANHZKNAfYFlEFAQ0lwG50PMOv2OBrEXEY",
  authDomain: "ludepoz.firebaseapp.com",
  projectId: "ludepoz",
  storageBucket: "ludepoz.firebasestorage.app",
  messagingSenderId: "621042040835",
  appId: "1:621042040835:web:011319e9504f928e75ce36"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const UNIVERSITIES = [
  { id: 1, name: "University of Dar es Salaam", short: "UDSM", location: "Dar es Salaam" },
  { id: 2, name: "Ardhi University", short: "ARU", location: "Dar es Salaam" },
  { id: 3, name: "Institute of Finance Management", short: "IFM", location: "Dar es Salaam" },
  { id: 4, name: "Tanzania Institute of Accountancy", short: "TIA", location: "Dar es Salaam" },
  { id: 5, name: "National Institute of Transport", short: "NIT", location: "Dar es Salaam" },
  { id: 6, name: "Dar es Salaam Institute of Technology", short: "DIT", location: "Dar es Salaam" },
];

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
  const [userName, setUserName] = useState("");
  const [userAvatar, setUserAvatar] = useState(null);
  const [selectedUni, setSelectedUni] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [page, setPage] = useState("home");
  const [profileTab, setProfileTab] = useState("listings");
  const [activeCat, setActiveCat] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [listings, setListings] = useState([]);
  const [cart, setCart] = useState([]);
  const [createData, setCreateData] = useState({ cat: "", title: "", desc: "", price: "", cond: "", photoFile: null, photoPreview: null });
  const [showCreateSuccess, setShowCreateSuccess] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editProfileData, setEditProfileData] = useState({ name: "", avatarFile: null, avatarPreview: null });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await loadUserProfile(currentUser.uid);
        await loadListings();
      } else {
        setUser(null);
        setUserName("");
        setUserAvatar(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user && page === "home") {
      const interval = setInterval(() => loadListings(), 5000);
      return () => clearInterval(interval);
    }
  }, [user, page]);

  const handleSignup = async () => {
    if (!signupName.trim() || !email.trim() || !password.trim() || !selectedUni) {
      setError("Please fill in all fields");
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
      await setDoc(doc(db, "users", userCredential.user.uid), {
        name: signupName.trim(),
        email: email,
        universityId: selectedUni.id,
        universityName: selectedUni.short,
        avatarUrl: null,
        createdAt: serverTimestamp()
      });
      setUserName(signupName.trim());
      setSuccess("Account created successfully!");
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
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const loadUserProfile = async (userId) => {
    try {
      const userDocRef = doc(db, "users", userId);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUserName(userData.name || "");
        setUserAvatar(userData.avatarUrl || null);
        setSelectedUni(UNIVERSITIES.find(u => u.id === userData.universityId) || UNIVERSITIES[0]);
      }
    } catch (err) {
      console.error("Error loading profile:", err);
    }
  };

  const loadListings = async () => {
    if (!selectedUni) return;
    try {
      const q = query(
        collection(db, "listings"),
        where("sold", "==", false),
        where("universityId", "==", selectedUni.id),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const listingsData = querySnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(), 
        createdAt: doc.data().createdAt?.toDate() 
      }));
      setListings(listingsData);
    } catch (err) {
      console.error("Error loading listings:", err);
      try {
        const q2 = query(
          collection(db, "listings"),
          where("sold", "==", false),
          where("universityId", "==", selectedUni.id)
        );
        const querySnapshot2 = await getDocs(q2);
        const listingsData2 = querySnapshot2.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(), 
          createdAt: doc.data().createdAt?.toDate() 
        }));
        setListings(listingsData2);
      } catch (err2) {
        console.error("Error loading listings (fallback):", err2);
      }
    }
  };

  const handlePhotoSelect = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      setError("Please select an image file");
      return;
    }

    const maxSize = type === 'listing' ? 5 * 1024 * 1024 : 2 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(`Image too large. Max ${type === 'listing' ? '5MB' : '2MB'}`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (type === 'listing') {
        setCreateData({...createData, photoFile: file, photoPreview: event.target.result});
      } else if (type === 'profile') {
        setEditProfileData({...editProfileData, avatarFile: file, avatarPreview: event.target.result});
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateListing = async () => {
    if (!createData.cat || !createData.title.trim() || !createData.price || !user) {
      setError("Please fill in all required fields");
      return;
    }
    try {
      setError("");
      setUploading(true);
      
      let photoUrl = null;
      if (createData.photoFile) {
        const storageRef = ref(storage, `listings/${user.uid}_${Date.now()}.jpg`);
        const snapshot = await uploadBytes(storageRef, createData.photoFile);
        photoUrl = await getDownloadURL(snapshot.ref);
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
        photoUrl: photoUrl,
        sold: false,
        views: 0,
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 48 * 3600000)
      });
      
      setShowCreateSuccess(true);
      setSuccess("Listing created successfully!");
      setCreateData({ cat: "", title: "", desc: "", price: "", cond: "", photoFile: null, photoPreview: null });
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
      let avatarUrl = userAvatar;
      
      if (editProfileData.avatarFile) {
        const storageRef = ref(storage, `avatars/${user.uid}/${Date.now()}.jpg`);
        const snapshot = await uploadBytes(storageRef, editProfileData.avatarFile);
        avatarUrl = await getDownloadURL(snapshot.ref);
      }

      const updateData = { avatarUrl };
      if (editProfileData.name.trim()) {
        updateData.name = editProfileData.name.trim();
      }

      await updateDoc(doc(db, "users", user.uid), updateData);
      
      if (updateData.name) setUserName(updateData.name);
      setUserAvatar(avatarUrl);
      setShowEditProfile(false);
      setEditProfileData({ name: "", avatarFile: null, avatarPreview: null });
      setSuccess("Profile updated!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("Error updating profile:", err);
      setError("Failed to update profile");
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

  const toggleSave = (item) => {
    const isSaved = cart.some(c => c.id === item.id);
    setCart(isSaved ? cart.filter(c => c.id !== item.id) : [...cart, item]);
  };

  const filteredListings = listings.filter(item => {
    if (activeCat !== "all" && item.category !== activeCat) return false;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      return item.title.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q);
    }
    return true;
  });

  const myListings = listings.filter(l => l.userId === user?.uid);

  if (!user && !loading) {
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'24px',background:'#f4f6f8',fontFamily:'system-ui'}}>
        <div style={{width:'100%',maxWidth:'400px',background:'#fff',borderRadius:'18px',padding:'28px 20px',boxShadow:'0 4px 20px rgba(0,0,0,0.08)'}}>
          <h1 style={{fontFamily:'serif',fontSize:'28px',fontWeight:'700',textAlign:'center',marginBottom:'24px'}}>Lud<em style={{color:'#2dd4bf'}}>e</em>poz</h1>
          {error && <div style={{background:'#fee2e2',color:'#991b1b',padding:'12px',borderRadius:'8px',marginBottom:'16px',fontSize:'13px'}}>{error}</div>}
          {success && <div style={{background:'#d1fae5',color:'#065f46',padding:'12px',borderRadius:'8px',marginBottom:'16px',fontSize:'13px'}}>{success}</div>}
          {authMode==="signup"?(
            <>
              <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Full Name</label><input type="text" placeholder="e.g. Amina Juma" value={signupName} onChange={e=>setSignupName(e.target.value)} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none'}}/></div>
              <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Email</label><input type="email" placeholder="your.email@student.udsm.ac.tz" value={email} onChange={e=>setEmail(e.target.value)} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none'}}/></div>
              <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Password</label><input type="password" placeholder="At least 6 characters" value={password} onChange={e=>setPassword(e.target.value)} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none'}}/></div>
              <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>University</label><select onChange={e=>setSelectedUni(UNIVERSITIES.find(u=>u.id===parseInt(e.target.value)))} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none'}}><option value="">Select university...</option>{UNIVERSITIES.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
              <button onClick={handleSignup} disabled={loading} style={{width:'100%',padding:'12px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:loading?'not-allowed':'pointer',marginTop:'8px'}}>{loading?"Creating...":"Create Account"}</button>
              <p style={{textAlign:'center',marginTop:'16px',fontSize:'13px',color:'#8a9bb0'}}>Already have an account? <span style={{color:'#2dd4bf',cursor:'pointer',fontWeight:'600'}} onClick={()=>{setAuthMode("login");setError("");}}>Log in</span></p>
            </>
          ):(
            <>
              <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Email</label><input type="email" placeholder="your.email@student.udsm.ac.tz" value={email} onChange={e=>setEmail(e.target.value)} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none'}}/></div>
              <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Password</label><input type="password" placeholder="Your password" value={password} onChange={e=>setPassword(e.target.value)} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none'}}/></div>
              <button onClick={handleLogin} disabled={loading} style={{width:'100%',padding:'12px',background:'#0f1b2d',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:loading?'not-allowed':'pointer',marginTop:'8px'}}>{loading?"Logging in...":"Log In"}</button>
              <p style={{textAlign:'center',marginTop:'16px',fontSize:'13px',color:'#8a9bb0'}}>Don't have an account? <span style={{color:'#2dd4bf',cursor:'pointer',fontWeight:'600'}} onClick={()=>{setAuthMode("signup");setError("");}}>Sign up</span></p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (loading) return <div style={{textAlign:'center',padding:'40px',fontFamily:'system-ui'}}>⏳ Loading...</div>;

  return (
    <div style={{fontFamily:'system-ui',background:'#f4f6f8',minHeight:'100vh',paddingBottom:'80px'}}>
      <div style={{background:'#fff',padding:'12px 16px',display:'flex',alignItems:'center',gap:'10px',borderBottom:'1px solid #e2e6ea',position:'sticky',top:0,zIndex:50}}>
        {(page==="create"||page==="profile"||page==="messages"||page==="saved")&&<button onClick={()=>setPage("home")} style={{width:'36px',height:'36px',borderRadius:'50%',background:'#f4f6f8',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'18px',border:'none'}}>←</button>}
        <div style={{fontFamily:'serif',fontSize:'20px',fontWeight:'700',color:'#0f1b2d'}}>Lud<em style={{color:'#2dd4bf'}}>e</em>poz</div>
        {page==="home"&&<div style={{flex:1,display:'flex',alignItems:'center',background:'#f4f6f8',borderRadius:'20px',padding:'8px 14px'}}><input type="text" placeholder={`Search ${selectedUni?.short||""}...`} value={searchQ} onChange={e=>setSearchQ(e.target.value)} style={{flex:1,border:'none',background:'none',outline:'none',fontSize:'14px'}}/><span style={{fontSize:'18px',cursor:'pointer',marginLeft:'8px'}}>🔍</span></div>}
      </div>
      {error&&<div style={{margin:'16px',background:'#fee2e2',color:'#991b1b',padding:'12px',borderRadius:'8px',fontSize:'13px'}}>{error}</div>}
      {success&&<div style={{margin:'16px',background:'#d1fae5',color:'#065f46',padding:'12px',borderRadius:'8px',fontSize:'13px'}}>{success}</div>}
      
      {page==="home"&&(
        <div style={{padding:'16px'}}>
          <div style={{background:'linear-gradient(135deg,#0f1b2d 0%,#1a3350 100%)',borderRadius:'18px',padding:'24px 18px',marginBottom:'20px'}}>
            <h1 style={{fontFamily:'serif',fontSize:'26px',fontWeight:'700',color:'#fff',lineHeight:1.2}}>Trade, share &<br/><em style={{color:'#2dd4bf'}}>find your next room</em><br/>— all on campus.</h1>
            <p style={{color:'rgba(255,255,255,0.6)',fontSize:'13px',marginTop:'10px'}}>Buy notes, sell electronics, find a roommate, or lease a room.</p>
            <div style={{display:'flex',gap:'8px',marginTop:'16px'}}><button onClick={()=>setPage("create")} style={{background:'#2dd4bf',color:'#0f1b2d',padding:'10px 20px',borderRadius:'10px',border:'none',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>+ Sell</button><button onClick={()=>setPage("profile")} style={{background:'transparent',color:'rgba(255,255,255,0.8)',padding:'10px 20px',borderRadius:'10px',border:'1.5px solid rgba(255,255,255,0.2)',fontSize:'14px',fontWeight:'500',cursor:'pointer'}}>Profile</button></div>
          </div>
          <div style={{display:'flex',gap:'8px',marginBottom:'16px',overflowX:'auto',paddingBottom:'4px'}}>{CATEGORIES.map(c=><button key={c.id} onClick={()=>setActiveCat(c.id)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 14px',background:activeCat===c.id?'#0f1b2d':'#fff',color:activeCat===c.id?'#fff':'#0f1b2d',border:activeCat===c.id?'1.5px solid #0f1b2d':'1.5px solid #e2e6ea',borderRadius:'20px',fontSize:'12px',fontWeight:'500',cursor:'pointer',whiteSpace:'nowrap'}}>{c.icon} {c.name}</button>)}</div>
          <div style={{display:'flex',flexDirection:'column'}}>
            {filteredListings.length===0?(
              <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px'}}><div style={{fontSize:'40px',marginBottom:'16px'}}>📭</div><div style={{fontSize:'16px',fontWeight:'600'}}>No listings yet</div><div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Be the first to post in {selectedUni?.short}!</div></div>
            ):(
              filteredListings.map((item,idx)=>(
                <div key={item.id} style={{background:'#fff',borderBottom:idx===filteredListings.length-1?'none':'1px solid #e2e6ea',padding:'16px',cursor:'pointer',opacity:item.sold?0.5:1,borderRadius:idx===0?'12px 12px 0 0':idx===filteredListings.length-1?'0 0 12px 12px':'0'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
                    <div style={{width:'36px',height:'36px',borderRadius:'50%',background:item.userAvatar?`url(${item.userAvatar})`:'linear-gradient(135deg,#2dd4bf,#0f1b2d)',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:'700',color:'#fff'}}>{!item.userAvatar&&(item.userName||"?").split(" ").map(n=>n[0]).join("")}</div>
                    <span style={{fontSize:'13px',fontWeight:'600'}}>{item.userName}</span>
                    <span style={{fontSize:'11px',color:'#8a9bb0',background:'#f4f6f8',padding:'2px 8px',borderRadius:'8px'}}>{item.universityName}</span>
                    <span style={{fontSize:'11px',color:'#8a9bb0',marginLeft:'auto'}}>{item.createdAt?new Date(item.createdAt).toLocaleDateString():"Recently"}</span>
                  </div>
                  <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'4px'}}>{item.title}</div>
                  {item.description && <div style={{fontSize:'13px',color:'#4a5568',marginBottom:'10px',lineHeight:1.5}}>{item.description}</div>}
                  {item.photoUrl && <img src={item.photoUrl} alt={item.title} style={{width:'100%',height:'200px',objectFit:'cover',borderRadius:'10px',marginBottom:'10px'}} />}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:'10px',borderTop:'1px solid #e2e6ea'}}>
                    <div style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700'}}>{item.price.toLocaleString()} TSh</div>
                    <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                      <button style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'12px',color:'#8a9bb0',cursor:'pointer',border:'none',background:'none'}}>💬</button>
                      <button onClick={()=>toggleSave(item)} style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'12px',color:cart.some(c=>c.id===item.id)?'#f59e0b':'#8a9bb0',cursor:'pointer',border:'none',background:'none'}}>🔖 {cart.some(c=>c.id===item.id)&&"Saved"}</button>
                      <span style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'12px',color:'#8a9bb0'}}>👁 {item.views||0}</span>
                    </div>
                  </div>
                  {item.userId===user.uid&&!item.sold&&<button onClick={()=>markAsSold(item.id)} style={{padding:'8px 16px',background:'#10b981',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer',marginTop:'8px'}}>✓ Mark as Sold</button>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      
      {page==="create"&&(
        <div style={{padding:'16px'}}>
          <div style={{background:'#fff',borderRadius:'12px',padding:'20px'}}>
            <h2 style={{fontSize:'20px',fontWeight:'700',marginBottom:'16px'}}>{showCreateSuccess?"Success!":"New Listing"}</h2>
            {showCreateSuccess?(
              <div style={{textAlign:'center',padding:'40px'}}><div style={{fontSize:'48px',marginBottom:'12px'}}>✅</div><div style={{fontSize:'16px',fontWeight:'600'}}>Listing created!</div><div style={{fontSize:'13px',color:'#8a9bb0',marginTop:'4px'}}>Redirecting to home...</div></div>
            ):(
              <>
                <input type="file" id="listing-photo" accept="image/*" style={{display:'none'}} onChange={(e)=>handlePhotoSelect(e,'listing')} />
                <label htmlFor="listing-photo" style={{display:'block',marginBottom:'14px',cursor:'pointer'}}>
                  {createData.photoPreview ? (
                    <div style={{position:'relative'}}>
                      <img src={createData.photoPreview} alt="Preview" style={{width:'100%',height:'180px',objectFit:'cover',borderRadius:'12px'}} />
                      <div style={{position:'absolute',top:'8px',right:'8px',background:'rgba(0,0,0,0.6)',color:'#fff',padding:'6px 12px',borderRadius:'8px',fontSize:'12px',fontWeight:'600'}}>Change Photo</div>
                    </div>
                  ) : (
                    <div style={{border:'2px dashed #e2e6ea',borderRadius:'12px',padding:'32px',textAlign:'center',background:'#f9fafb'}}>
                      <div style={{fontSize:'32px',marginBottom:'8px'}}>📷</div>
                      <div style={{fontSize:'14px',fontWeight:'600',marginBottom:'4px'}}>Add Photo</div>
                      <div style={{fontSize:'12px',color:'#8a9bb0'}}>Click to upload (max 5MB)</div>
                    </div>
                  )}
                </label>
                
                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Category *</label><select value={createData.cat} onChange={e=>setCreateData({...createData,cat:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none'}}><option value="">Select category...</option>{CATEGORIES.filter(c=>c.id!=="all").map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Title *</label><input type="text" placeholder="e.g. Business Year 2 Notes" value={createData.title} onChange={e=>setCreateData({...createData,title:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none'}}/></div>
                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Description</label><textarea placeholder="Describe your item..." value={createData.desc} onChange={e=>setCreateData({...createData,desc:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none',minHeight:'100px',resize:'vertical',fontFamily:'inherit'}}/></div>
                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Price (TSh) *</label><input type="number" placeholder="e.g. 25000" value={createData.price} onChange={e=>setCreateData({...createData,price:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none'}}/></div>
                <div style={{marginBottom:'14px'}}><label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Condition</label><select value={createData.cond} onChange={e=>setCreateData({...createData,cond:e.target.value})} style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none'}}><option value="">Select condition...</option><option value="Like New">Like New</option><option value="Good">Good</option><option value="Fair">Fair</option><option value="Worn">Worn</option></select></div>
                <button onClick={handleCreateListing} disabled={uploading} style={{width:'100%',marginTop:'16px',padding:'12px',background:'#2dd4bf',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:uploading?'not-allowed':'pointer'}}>{uploading?"Uploading...":"💾 Create Listing"}</button>
              </>
            )}
          </div>
        </div>
      )}
      
      {page==="messages"&&(
        <div style={{padding:'16px'}}>
          <div style={{background:'#fff',borderRadius:'12px',padding:'40px',textAlign:'center'}}>
            <div style={{fontSize:'48px',marginBottom:'16px'}}>💬</div>
            <h2 style={{fontSize:'20px',fontWeight:'700',marginBottom:'8px'}}>Messages</h2>
            <p style={{fontSize:'14px',color:'#8a9bb0'}}>Chat feature coming soon!</p>
          </div>
        </div>
      )}
      
      {page==="saved"&&(
        <div style={{padding:'16px'}}>
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
      
      {page==="profile"&&(
        <div style={{padding:'16px'}}>
          <div style={{background:'linear-gradient(135deg,#0f1b2d,#1a3350)',borderRadius:'16px',padding:'24px 18px',marginBottom:'16px',display:'flex',gap:'14px',alignItems:'center'}}>
            <div style={{width:'60px',height:'60px',borderRadius:'50%',background:userAvatar?`url(${userAvatar})`:'#2dd4bf',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'22px',fontWeight:'700',color:'#0f1b2d'}}>{!userAvatar&&userName.split(" ").map(n=>n[0]).join("")}</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700',color:'#fff'}}>{userName}</div>
              <div style={{fontSize:'11px',color:'#2dd4bf',marginTop:'4px'}}>📍 {selectedUni?.name}</div>
              <button onClick={()=>{setEditProfileData({name:userName,avatarFile:null,avatarPreview:userAvatar});setShowEditProfile(true)}} style={{marginTop:'8px',padding:'6px 12px',background:'#2dd4bf',color:'#0f1b2d',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer'}}>✏️ Edit Profile</button>
            </div>
          </div>
          
          <div style={{display:'flex',gap:'4px',background:'#fff',borderRadius:'10px',padding:'4px',marginBottom:'16px'}}>
            <button onClick={()=>setProfileTab("listings")} style={{flex:1,padding:'8px',border:'none',background:profileTab==="listings"?'#0f1b2d':'none',color:profileTab==="listings"?'#fff':'#8a9bb0',fontSize:'12px',fontWeight:'500',cursor:'pointer',borderRadius:'8px'}}>My Listings ({myListings.length})</button>
            <button onClick={()=>setProfileTab("saved")} style={{flex:1,padding:'8px',border:'none',background:profileTab==="saved"?'#0f1b2d':'none',color:profileTab==="saved"?'#fff':'#8a9bb0',fontSize:'12px',fontWeight:'500',cursor:'pointer',borderRadius:'8px'}}>Saved ({cart.length})</button>
          </div>
          
          {profileTab==="listings"&&(
            <div style={{display:'flex',flexDirection:'column'}}>
              {myListings.length===0?(
                <div style={{textAlign:'center',padding:'48px 16px',background:'#fff',borderRadius:'12px'}}><div style={{fontSize:'40px'}}>📝</div><div style={{fontSize:'16px',fontWeight:'600',marginTop:'12px'}}>No listings yet</div><button onClick={()=>setPage("create")} style={{marginTop:'16px',padding:'10px 20px',background:'#2dd4bf',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>Create Listing</button></div>
              ):(
                myListings.map((item,idx)=>(
                  <div key={item.id} style={{background:'#fff',borderBottom:idx===myListings.length-1?'none':'1px solid #e2e6ea',padding:'16px',opacity:item.sold?0.5:1,borderRadius:idx===0?'12px 12px 0 0':idx===myListings.length-1?'0 0 12px 12px':'0'}}>
                    {item.photoUrl && <img src={item.photoUrl} alt={item.title} style={{width:'100%',height:'150px',objectFit:'cover',borderRadius:'10px',marginBottom:'10px'}} />}
                    <div style={{fontSize:'15px',fontWeight:'600',marginBottom:'4px'}}>{item.title}</div>
                    {item.description && <div style={{fontSize:'13px',color:'#4a5568',marginBottom:'10px',lineHeight:1.5}}>{item.description}</div>}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:'10px',borderTop:'1px solid #e2e6ea'}}>
                      <div style={{fontFamily:'serif',fontSize:'18px',fontWeight:'700'}}>{item.price.toLocaleString()} TSh</div>
                      <span style={{fontSize:'12px',color:'#8a9bb0'}}>👁 {item.views||0}</span>
                    </div>
                    {!item.sold&&<button onClick={()=>markAsSold(item.id)} style={{padding:'8px 16px',background:'#10b981',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:'600',cursor:'pointer',marginTop:'8px'}}>✓ Mark as Sold</button>}
                  </div>
                ))
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
          
          <button onClick={handleLogout} style={{width:'100%',padding:'12px',background:'#ef4444',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer',marginTop:'16px'}}>🚪 Logout</button>
        </div>
      )}
      
      {showEditProfile && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}} onClick={()=>setShowEditProfile(false)}>
          <div style={{background:'#fff',borderRadius:'16px',padding:'24px',width:'100%',maxWidth:'400px'}} onClick={(e)=>e.stopPropagation()}>
            <h3 style={{fontSize:'20px',fontWeight:'700',marginBottom:'16px'}}>Edit Profile</h3>
            
            <input type="file" id="avatar-upload" accept="image/*" style={{display:'none'}} onChange={(e)=>handlePhotoSelect(e,'profile')} />
            <label htmlFor="avatar-upload" style={{display:'block',marginBottom:'16px',cursor:'pointer'}}>
              <div style={{width:'80px',height:'80px',margin:'0 auto',borderRadius:'50%',background:editProfileData.avatarPreview?`url(${editProfileData.avatarPreview})`:'#f4f6f8',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
                {!editProfileData.avatarPreview && <span style={{fontSize:'32px'}}>📷</span>}
                <div style={{position:'absolute',bottom:'0',background:'rgba(45,212,191,0.9)',color:'#0f1b2d',fontSize:'10px',fontWeight:'600',padding:'4px 8px',borderRadius:'12px'}}>Change</div>
              </div>
            </label>
            
            <div style={{marginBottom:'14px'}}>
              <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'6px'}}>Full Name</label>
              <input type="text" value={editProfileData.name} onChange={e=>setEditProfileData({...editProfileData,name:e.target.value})} placeholder="Your name" style={{width:'100%',padding:'12px',border:'1.5px solid #e2e6ea',borderRadius:'10px',fontSize:'14px',outline:'none'}} />
            </div>
            
            <button onClick={handleUpdateProfile} disabled={uploading} style={{width:'100%',padding:'12px',background:'#2dd4bf',color:'#0f1b2d',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:uploading?'not-allowed':'pointer',marginTop:'12px'}}>{uploading?"Uploading...":"Save Changes"}</button>
            <button onClick={()=>setShowEditProfile(false)} style={{width:'100%',padding:'12px',background:'transparent',color:'#8a9bb0',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:'600',cursor:'pointer',marginTop:'8px'}}>Cancel</button>
          </div>
        </div>
      )}
      
      <div style={{position:'fixed',bottom:0,left:0,right:0,height:'68px',background:'#fff',borderTop:'1px solid #e2e6ea',display:page==="create"?'none':'flex',alignItems:'center',justifyContent:'space-around',zIndex:100}}>
        <button onClick={()=>setPage("home")} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',cursor:'pointer',padding:'8px',border:'none',background:'none',position:'relative'}}><span style={{fontSize:'22px',color:page==="home"?'#2dd4bf':'#8a9bb0'}}>🏠</span><span style={{fontSize:'10px',color:'#8a9bb0',fontWeight:'500'}}>Home</span></button>
        <button onClick={()=>setPage("messages")} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',cursor:'pointer',padding:'8px',border:'none',background:'none'}}><span style={{fontSize:'22px',color:page==="messages"?'#2dd4bf':'#8a9bb0'}}>💬</span><span style={{fontSize:'10px',color:'#8a9bb0',fontWeight:'500'}}>Messages</span></button>
        <button onClick={()=>setPage("create")} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',cursor:'pointer',padding:'8px',border:'none',background:'none'}}><span style={{fontSize:'24px',color:'#2dd4bf'}}>＋</span><span style={{fontSize:'10px',color:'#2dd4bf',fontWeight:'500'}}>Sell</span></button>
        <button onClick={()=>setPage("saved")} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',cursor:'pointer',padding:'8px',border:'none',background:'none',position:'relative'}}><span style={{fontSize:'22px',color:page==="saved"?'#2dd4bf':'#8a9bb0'}}>🔖</span><span style={{fontSize:'10px',color:'#8a9bb0',fontWeight:'500'}}>Saved</span>{cart.length>0&&<span style={{position:'absolute',top:'4px',right:'4px',background:'#ef4444',color:'#fff',fontSize:'8px',fontWeight:'700',padding:'1px 4px',borderRadius:'7px',minWidth:'14px',textAlign:'center'}}>{cart.length}</span>}</button>
        <button onClick={()=>setPage("profile")} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',cursor:'pointer',padding:'8px',border:'none',background:'none'}}><span style={{fontSize:'22px',color:page==="profile"?'#2dd4bf':'#8a9bb0'}}>👤</span><span style={{fontSize:'10px',color:'#8a9bb0',fontWeight:'500'}}>Profile</span></button>
      </div>
    </div>
  );
}

export default App;