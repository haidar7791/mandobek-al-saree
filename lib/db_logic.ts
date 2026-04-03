import { db } from "./firebase";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  setDoc,
  serverTimestamp,
  Timestamp,
  onSnapshot,
  increment,
  type Unsubscribe,
} from "firebase/firestore";

export interface Order {
  id: string;
  merchantId: string;
  productName: string;
  merchantAddress: { governorate: string; neighborhood: string; street: string };
  merchantAddress2?: string;
  merchantPhone: string;
  customerAddress: { governorate: string; neighborhood: string; street: string };
  customerAddress2?: string;
  customerPhone: string;
  productPrice: number;
  deliveryPrice: number;
  uniqueCode: string;
  status: "pending" | "in_delivery" | "delivered" | "returned";
  acceptedBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface WalletRequest {
  id: string;
  userId: string;
  type: "deposit" | "withdrawal";
  amount: number;
  accountNumber: string;
  imageUri?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  processedAt?: string;
}

// ─── Orders ────────────────────────────────────────────────────────────────

export const getAllOrders = async (): Promise<Order[]> => {
  try {
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
  } catch (err) {
    console.error("getAllOrders error:", err);
    return [];
  }
};

export const getOrdersByMerchant = async (merchantId: string): Promise<Order[]> => {
  try {
    const q = query(
      collection(db, "orders"),
      where("merchantId", "==", merchantId),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
  } catch (err) {
    console.error("getOrdersByMerchant error:", err);
    return [];
  }
};

export const createOrder = async (
  orderData: Omit<Order, "id">
): Promise<string> => {
  const docRef = await addDoc(collection(db, "orders"), {
    ...orderData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return docRef.id;
};

export const updateOrderStatus = async (
  orderId: string,
  status: Order["status"],
  acceptedBy?: string
): Promise<void> => {
  const ref = doc(db, "orders", orderId);
  const data: Record<string, unknown> = {
    status,
    updatedAt: new Date().toISOString(),
  };
  if (acceptedBy !== undefined) data.acceptedBy = acceptedBy;
  await updateDoc(ref, data);
};

export const saveAllOrders = async (orders: Order[]): Promise<void> => {
  for (const order of orders) {
    const { id, ...rest } = order;
    await setDoc(doc(db, "orders", id), { ...rest, updatedAt: new Date().toISOString() }, { merge: true });
  }
};

export const subscribeToOrders = (
  callback: (orders: Order[]) => void
): Unsubscribe => {
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
    callback(orders);
  });
};

// ─── Wallet ─────────────────────────────────────────────────────────────────

export const getBalance = async (userId: string): Promise<number> => {
  try {
    const docRef = doc(db, "wallets", userId);
    const snap = await getDoc(docRef);
    if (snap.exists()) return snap.data().balance ?? 0;
    await setDoc(docRef, { balance: 0 }, { merge: true });
    return 0;
  } catch (err) {
    console.error("getBalance error:", err);
    return 0;
  }
};

export const setBalance = async (
  userId: string,
  amount: number
): Promise<void> => {
  await setDoc(
    doc(db, "wallets", userId),
    { balance: amount },
    { merge: true }
  );
};

export const adjustBalance = async (
  userId: string,
  delta: number
): Promise<number> => {
  const current = await getBalance(userId);
  const next = current + delta;
  await setBalance(userId, next);
  return next;
};

export const adjustBalanceByDelta = async (
  userId: string,
  delta: number
): Promise<void> => {
  const ref = doc(db, "wallets", userId);
  try {
    await updateDoc(ref, { balance: increment(delta) });
  } catch (err: any) {
    if (err?.code === "not-found") {
      await setDoc(ref, { balance: delta }, { merge: true });
    } else {
      throw err;
    }
  }
};

// ─── Wallet Requests ─────────────────────────────────────────────────────────

export const getWalletRequests = async (): Promise<WalletRequest[]> => {
  try {
    const q = query(
      collection(db, "walletRequests"),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WalletRequest));
  } catch (err) {
    console.error("getWalletRequests error:", err);
    return [];
  }
};

export const getWalletRequestsByUser = async (
  userId: string
): Promise<WalletRequest[]> => {
  try {
    const q = query(
      collection(db, "walletRequests"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WalletRequest));
  } catch (err) {
    console.error("getWalletRequestsByUser error:", err);
    return [];
  }
};

export const createWalletRequest = async (
  req: Omit<WalletRequest, "id" | "createdAt" | "status">
): Promise<string> => {
  const docRef = await addDoc(collection(db, "walletRequests"), {
    ...req,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  return docRef.id;
};

export const approveWalletRequest = async (
  reqId: string,
  userId: string,
  amount: number,
  type: "deposit" | "withdrawal"
): Promise<void> => {
  await updateDoc(doc(db, "walletRequests", reqId), {
    status: "approved",
    processedAt: new Date().toISOString(),
  });
  const delta = type === "deposit" ? amount : -amount;
  await adjustBalance(userId, delta);
};

export const rejectWalletRequest = async (reqId: string): Promise<void> => {
  await updateDoc(doc(db, "walletRequests", reqId), {
    status: "rejected",
    processedAt: new Date().toISOString(),
  });
};

// ─── User Profiles ────────────────────────────────────────────────────────────

export const getUserProfile = async (
  userId: string
): Promise<{ name: string; phone: string; photoUri: string | null } | null> => {
  try {
    const snap = await getDoc(doc(db, "users", userId));
    if (!snap.exists()) return null;
    return snap.data() as { name: string; phone: string; photoUri: string | null };
  } catch (err) {
    console.error("getUserProfile error:", err);
    return null;
  }
};

export const setUserProfile = async (
  userId: string,
  profile: { name: string; phone: string; photoUri: string | null }
): Promise<void> => {
  await setDoc(doc(db, "users", userId), profile, { merge: true });
};

export const ensureUserDocument = async (
  userId: string,
  email: string
): Promise<void> => {
  try {
    const ref = doc(db, "users", userId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const isPhone = email.endsWith("@mandobek.app");
      const defaultName = isPhone
        ? email.replace("@mandobek.app", "")
        : email.split("@")[0];
      await setDoc(
        ref,
        {
          name: defaultName,
          email,
          role: "delivery",
          balance: 0,
          phone: isPhone ? email.replace("@mandobek.app", "") : "",
          photoUri: null,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.error("ensureUserDocument error:", err);
  }
};
