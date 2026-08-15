import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  // @ts-ignore - getReactNativePersistence is available in firebase/auth for RN
  getReactNativePersistence,
  setPersistence,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getDatabase } from "firebase/database";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyDbZoqW41iZiBYYKt8PjeFVTMvjSxp2Xvg",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "mandobek-al-saree.firebaseapp.com",
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || "https://mandobek-al-saree-default-rtdb.firebaseio.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "mandobek-al-saree",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "mandobek-al-saree.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "911663879269",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:911663879269:web:0294058114f2f18f55a28c",
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-1NJKJGPBL8",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let auth: Auth;
if (Platform.OS === "web") {
  auth = getAuth(app);
  setPersistence(auth, indexedDBLocalPersistence).catch(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {});
  });
} else {
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    // Fast Refresh can leave an Auth instance registered already. Reuse it
    // in that case, but keep the reason visible instead of silently masking a
    // real persistence/configuration problem.
    console.warn("[Firebase] initializeAuth reused existing instance:", error);
    auth = getAuth(app);
  }
}

// Firestore persistent local cache: caches artisan profiles / static data on-device
// to cut down repeated reads and speed up cold starts.
// IndexedDB-backed persistence (persistentLocalCache) only exists in browser environments;
// on native (iOS/Android via Expo Go / Hermes) there's no IndexedDB, so we fall back to the
// default in-memory Firestore cache there.
let db: ReturnType<typeof getFirestore>;
if (Platform.OS === "web") {
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // initializeFirestore throws if Firestore was already initialized for this app
    // (e.g. Fast Refresh) — fall back to the existing instance.
    db = getFirestore(app);
  }
} else {
  db = getFirestore(app);
}

const storage = getStorage(app);
const rtdb = getDatabase(app);

export { app, auth, db, storage, rtdb, firebaseConfig };
export default app;
