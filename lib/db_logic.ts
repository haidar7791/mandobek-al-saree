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
  onSnapshot,
  increment,
  deleteDoc,
  type Unsubscribe,
} from "firebase/firestore";

// ─── Artisan Specialties ──────────────────────────────────────────────────────

export const HOME_SERVICES = [
  { key: "plumber", label: "سباك", icon: "droplet" },
  { key: "electrician", label: "كهربائي", icon: "zap" },
  { key: "carpenter", label: "نجار", icon: "tool" },
  { key: "painter", label: "دهّان", icon: "edit-3" },
  { key: "mason", label: "بنّاء", icon: "home" },
  { key: "tiler", label: "سيراميك", icon: "grid" },
  { key: "ironsmith", label: "حداد", icon: "settings" },
  { key: "ac_tech", label: "فيتر مكيفات", icon: "wind" },
];

export const CAR_SERVICES = [
  { key: "mechanic", label: "ميكانيكي", icon: "settings" },
  { key: "auto_elec", label: "كهرباء سيارات", icon: "zap" },
  { key: "tire_spec", label: "كاوتش", icon: "circle" },
  { key: "body_repair", label: "تصليح بودي", icon: "truck" },
  { key: "ac_car", label: "مكيف سيارة", icon: "wind" },
];

export const GENERAL_SERVICES = [
  { key: "cleaning", label: "تنظيف منازل", icon: "trash-2" },
  { key: "moving", label: "نقل عفش", icon: "package" },
  { key: "pest_control", label: "مكافحة حشرات", icon: "shield" },
  { key: "generator", label: "مولدات كهرباء", icon: "battery-charging" },
  { key: "satellite", label: "دشات وأنظمة", icon: "radio" },
];

export type ServiceCategory = "home" | "car" | "general";

export const ALL_SPECIALTIES = [...HOME_SERVICES, ...CAR_SERVICES, ...GENERAL_SERVICES];

export function getCategoryForSpecialty(key: string): ServiceCategory {
  if (HOME_SERVICES.find((s) => s.key === key)) return "home";
  if (CAR_SERVICES.find((s) => s.key === key)) return "car";
  return "general";
}

export function getSpecialtyLabel(key: string): string {
  return ALL_SPECIALTIES.find((s) => s.key === key)?.label ?? key;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeoLocation {
  lat: number;
  lng: number;
}

export interface ArtisanProfile {
  id: string;
  userId: string;
  name: string;
  phone: string;
  photoUri: string | null;
  specialty: string;
  category: ServiceCategory;
  location: GeoLocation | null;
  bio: string;
  rating: number;
  reviewCount: number;
  isAvailable: boolean;
  createdAt: string;
}

export interface Review {
  id: string;
  artisanId: string;
  clientId: string;
  clientName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export type ServiceRequestStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface ServiceRequest {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  artisanId: string;
  artisanName: string;
  specialty: string;
  problemDescription: string;
  clientLocation: GeoLocation | null;
  clientAddress: string;
  status: ServiceRequestStatus;
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

// ─── Distance Calculation ─────────────────────────────────────────────────────

export function calcDistanceKm(a: GeoLocation, b: GeoLocation): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

// ─── Artisan Functions ────────────────────────────────────────────────────────

export const getArtisans = async (category?: ServiceCategory): Promise<ArtisanProfile[]> => {
  try {
    let q;
    if (category) {
      q = query(
        collection(db, "artisans"),
        where("category", "==", category)
      );
    } else {
      q = query(collection(db, "artisans"));
    }
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ArtisanProfile));
  } catch (err) {
    console.error("getArtisans error:", err);
    return [];
  }
};

export const getArtisanByUserId = async (userId: string): Promise<ArtisanProfile | null> => {
  try {
    const q = query(collection(db, "artisans"), where("userId", "==", userId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as ArtisanProfile;
  } catch (err) {
    console.error("getArtisanByUserId error:", err);
    return null;
  }
};

export const getArtisanById = async (artisanId: string): Promise<ArtisanProfile | null> => {
  try {
    const snap = await getDoc(doc(db, "artisans", artisanId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as ArtisanProfile;
  } catch (err) {
    console.error("getArtisanById error:", err);
    return null;
  }
};

export const createOrUpdateArtisan = async (
  userId: string,
  data: Omit<ArtisanProfile, "id" | "userId" | "rating" | "reviewCount" | "createdAt">
): Promise<string> => {
  const existing = await getArtisanByUserId(userId);
  if (existing) {
    await updateDoc(doc(db, "artisans", existing.id), { ...data });
    return existing.id;
  }
  const docRef = await addDoc(collection(db, "artisans"), {
    ...data,
    userId,
    rating: 0,
    reviewCount: 0,
    createdAt: new Date().toISOString(),
  });
  return docRef.id;
};

export const subscribeToArtisans = (
  callback: (artisans: ArtisanProfile[]) => void,
  category?: ServiceCategory
): Unsubscribe => {
  let q;
  if (category) {
    q = query(collection(db, "artisans"), where("category", "==", category));
  } else {
    q = query(collection(db, "artisans"));
  }
  return onSnapshot(q, (snap) => {
    const artisans = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ArtisanProfile));
    callback(artisans);
  });
};

// ─── Reviews ──────────────────────────────────────────────────────────────────

export const getReviews = async (artisanId: string): Promise<Review[]> => {
  try {
    const q = query(
      collection(db, "reviews"),
      where("artisanId", "==", artisanId),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Review));
  } catch (err) {
    console.error("getReviews error:", err);
    return [];
  }
};

export const addReview = async (
  review: Omit<Review, "id" | "createdAt">
): Promise<void> => {
  const docRef = await addDoc(collection(db, "reviews"), {
    ...review,
    createdAt: new Date().toISOString(),
  });

  const reviews = await getReviews(review.artisanId);
  const allRatings = reviews.map((r) => r.rating);
  allRatings.push(review.rating);
  const avg = allRatings.reduce((a, b) => a + b, 0) / allRatings.length;

  await updateDoc(doc(db, "artisans", review.artisanId), {
    rating: Math.round(avg * 10) / 10,
    reviewCount: allRatings.length,
  });
};

// ─── Service Requests ─────────────────────────────────────────────────────────

export const createServiceRequest = async (
  data: Omit<ServiceRequest, "id" | "createdAt" | "status">
): Promise<string> => {
  const docRef = await addDoc(collection(db, "serviceRequests"), {
    ...data,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  return docRef.id;
};

export const getServiceRequestsByClient = async (clientId: string): Promise<ServiceRequest[]> => {
  try {
    const q = query(
      collection(db, "serviceRequests"),
      where("clientId", "==", clientId),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ServiceRequest));
  } catch (err) {
    console.error("getServiceRequestsByClient error:", err);
    return [];
  }
};

export const getServiceRequestsByArtisan = async (artisanId: string): Promise<ServiceRequest[]> => {
  try {
    const q = query(
      collection(db, "serviceRequests"),
      where("artisanId", "==", artisanId),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ServiceRequest));
  } catch (err) {
    console.error("getServiceRequestsByArtisan error:", err);
    return [];
  }
};

export const getAllServiceRequests = async (): Promise<ServiceRequest[]> => {
  try {
    const q = query(collection(db, "serviceRequests"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ServiceRequest));
  } catch (err) {
    console.error("getAllServiceRequests error:", err);
    return [];
  }
};

export const updateServiceRequestStatus = async (
  requestId: string,
  status: ServiceRequestStatus
): Promise<void> => {
  await updateDoc(doc(db, "serviceRequests", requestId), {
    status,
    updatedAt: new Date().toISOString(),
  });
};

export const subscribeToServiceRequests = (
  artisanId: string,
  callback: (requests: ServiceRequest[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, "serviceRequests"),
    where("artisanId", "==", artisanId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snap) => {
    const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ServiceRequest));
    callback(requests);
  });
};

// ─── Chat Messages ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

export function buildChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join("_");
}

export const sendMessage = async (
  chatId: string,
  senderId: string,
  senderName: string,
  text: string
): Promise<void> => {
  await addDoc(collection(db, "chats", chatId, "messages"), {
    chatId,
    senderId,
    senderName,
    text,
    createdAt: new Date().toISOString(),
  });
  await setDoc(
    doc(db, "chats", chatId),
    {
      participants: chatId.split("_"),
      lastMessage: text,
      lastAt: new Date().toISOString(),
    },
    { merge: true }
  );
};

export const subscribeToMessages = (
  chatId: string,
  callback: (messages: ChatMessage[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage));
    callback(msgs);
  });
};

// ─── Wallet ─────────────────────────────────────────────────────────────────

export const getBalance = async (userId: string): Promise<number> => {
  try {
    const snap = await getDoc(doc(db, "wallets", userId));
    if (snap.exists()) return snap.data().balance ?? 0;
    return 0;
  } catch (err) {
    console.error("getBalance error:", err);
    return 0;
  }
};

export const setBalance = async (userId: string, amount: number): Promise<void> => {
  await setDoc(doc(db, "wallets", userId), { balance: amount }, { merge: true });
};

export const adjustBalanceByDelta = async (userId: string, delta: number): Promise<void> => {
  const ref = doc(db, "wallets", userId);
  await updateDoc(ref, { balance: increment(delta) });
};

// ─── Wallet Requests ─────────────────────────────────────────────────────────

export const getWalletRequests = async (): Promise<WalletRequest[]> => {
  try {
    const q = query(collection(db, "walletRequests"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WalletRequest));
  } catch (err) {
    console.error("getWalletRequests error:", err);
    return [];
  }
};

export const getWalletRequestsByUser = async (userId: string): Promise<WalletRequest[]> => {
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
  const walletRef = doc(db, "wallets", userId);
  try {
    await updateDoc(walletRef, { balance: increment(delta) });
  } catch (err: any) {
    if (err?.code === "not-found") {
      await setDoc(walletRef, { balance: delta });
    } else {
      throw err;
    }
  }
};

export const rejectWalletRequest = async (reqId: string): Promise<void> => {
  await updateDoc(doc(db, "walletRequests", reqId), {
    status: "rejected",
    processedAt: new Date().toISOString(),
  });
};

// ─── User Profiles ────────────────────────────────────────────────────────────

export interface UserProfile {
  name: string;
  phone: string;
  photoUri: string | null;
  role: "client" | "artisan" | "admin";
  location?: GeoLocation | null;
  specialty?: string;
  createdAt?: any;
  email?: string;
}

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  try {
    const snap = await getDoc(doc(db, "users", userId));
    if (!snap.exists()) return null;
    return snap.data() as UserProfile;
  } catch (err) {
    console.error("getUserProfile error:", err);
    return null;
  }
};

export const setUserProfile = async (
  userId: string,
  profile: Partial<UserProfile>
): Promise<void> => {
  await setDoc(doc(db, "users", userId), profile, { merge: true });
};

export const ensureUserDocument = async (
  userId: string,
  email: string,
  role: "client" | "artisan" = "client",
  extraData?: { specialty?: string; location?: GeoLocation | null }
): Promise<void> => {
  try {
    const ref = doc(db, "users", userId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const isPhone = email.endsWith("@sanad.app");
      const defaultName = isPhone
        ? email.replace("@sanad.app", "")
        : email.split("@")[0];
      await setDoc(
        ref,
        {
          name: defaultName,
          email,
          role,
          balance: 0,
          phone: isPhone ? email.replace("@sanad.app", "") : "",
          photoUri: null,
          location: extraData?.location ?? null,
          specialty: extraData?.specialty ?? null,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      const updates: Record<string, any> = {};
      if (extraData?.location !== undefined) updates.location = extraData.location;
      if (extraData?.specialty) updates.specialty = extraData.specialty;
      if (Object.keys(updates).length > 0) {
        await updateDoc(ref, updates);
      }
    }
  } catch (err) {
    console.error("ensureUserDocument error:", err);
  }
};
