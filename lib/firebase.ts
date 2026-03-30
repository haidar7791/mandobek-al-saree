import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// إعدادات Firebase الخاصة بمشروع مندوبك السريع
const firebaseConfig = {
  apiKey: "AIzaSyDbZoqW41iZiBYYKt8PjeFVTMvjSxp2Xvg",
  authDomain: "mandobek-al-saree.firebaseapp.com",
  databaseURL: "https://mandobek-al-saree-default-rtdb.firebaseio.com",
  projectId: "mandobek-al-saree",
  storageBucket: "mandobek-al-saree.firebasestorage.app",
  messagingSenderId: "911663879269",
  appId: "1:911663879269:web:0294058114f2f18f55a28c",
  measurementId: "G-1NJKJGPBL8"
};

// التأكد من عدم تكرار تهيئة التطبيق لمنع الأخطاء
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// تصدير الخدمات لاستخدامها في صفحات التسجيل والدخول
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
export default app;
