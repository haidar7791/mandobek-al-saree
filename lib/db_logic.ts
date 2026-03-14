import { db } from "./firebase";
import { 
  collection, addDoc, getDocs, getDoc, doc, 
  updateDoc, query, where, orderBy, setDoc 
} from "firebase/firestore";

export const getAllOrders = async () => {
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const saveAllOrders = async (orders: any[]) => {
  // ملاحظة: في Firebase نحدث المستندات الفردية، لكن للتوافق مع كودك الحالي:
  for (const order of orders) {
    await setDoc(doc(db, "orders", order.id), order, { merge: true });
  }
};

export const getBalance = async (userId: string) => {
  const docRef = doc(db, "wallets", userId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data().balance : 0; // رصيد افتراضي 50 الف
};

export const setBalance = async (userId: string, amount: number) => {
  await setDoc(doc(db, "wallets", userId), { balance: amount }, { merge: true });
};
