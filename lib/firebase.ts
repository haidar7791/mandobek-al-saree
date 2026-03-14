import { initializeApp } from "firebase/app";

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

const app = initializeApp(firebaseConfig);
export default app;
