// Kampasika Biz runs on the same Firebase project as Kampasika, so a user
// signed in on kampasika.org is already signed in here (same origin, same
// Auth persistence). /biz loads without App.js, so it sets up its own
// handles — reusing the default app if App.js already created it.
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Same public web config as App.js.
const firebaseConfig = {
  apiKey: "AIzaSyANHZKNAfYFlEFAQ0lwG50PMOv2OBrEXEY",
  authDomain: "ludepoz.firebaseapp.com",
  projectId: "ludepoz",
  storageBucket: "ludepoz.firebasestorage.app",
  messagingSenderId: "621042040835",
  appId: "1:621042040835:web:011319e9504f928e75ce36",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Same single admin as ADMIN_UIDS in App.js / index.js / firestore.rules.
export const BIZ_ADMIN_UIDS = ["LTrwUHH6utQJGiw4lcsKflzXvPR2"];

// Where operators point their pawaPay deposit callbacks (default region,
// same as every other Kampasika function).
export const BIZ_CALLBACK_BASE = "https://us-central1-ludepoz.cloudfunctions.net/bizPawapayCallback";
