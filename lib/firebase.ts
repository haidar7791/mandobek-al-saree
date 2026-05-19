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
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
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
  } catch {
    auth = getAuth(app);
  }
}

const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
export default app;
