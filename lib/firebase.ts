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
  apiKey: "AIzaSyDbZoqW41iZiBYYKt8PjeFVTMvjSxp2Xvg",
  authDomain: "mandobek-al-saree.firebaseapp.com",
  databaseURL: "https://mandobek-al-saree-default-rtdb.firebaseio.com",
  projectId: "mandobek-al-saree",
  storageBucket: "mandobek-al-saree.firebasestorage.app",
  messagingSenderId: "911663879269",
  appId: "1:911663879269:web:0294058114f2f18f55a28c",
  measurementId: "G-1NJKJGPBL8",
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
