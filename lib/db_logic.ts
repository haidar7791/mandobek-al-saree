import { db, storage } from "./firebase";
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
  getCountFromServer,
  runTransaction,
  arrayUnion,
  arrayRemove,
  writeBatch,
  deleteField,
  type Unsubscribe,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

// ─── Artisan Specialties ──────────────────────────────────────────────────────

export const HOME_SERVICES = [
  { key: "plumber", label: "سباك", icon: "droplet" },
  { key: "electrician", label: "كهربائي", icon: "zap" },
  { key: "carpenter", label: "نجار", icon: "tool" },
  { key: "painter", label: "صباغ", icon: "edit-3" },
  { key: "mason", label: "بنّاء", icon: "home" },
  { key: "tiler", label: "سيراميك", icon: "grid" },
  { key: "ironsmith", label: "حداد", icon: "settings" },
  { key: "ac_tech", label: "صيانة مكيفات", icon: "wind" },
  { key: "shovel", label: "شفل", icon: "layers" },
  { key: "roller", label: "حادلة", icon: "minus-square" },
  { key: "backhoe", label: "بوكلن", icon: "minimize-2" },
  { key: "crane", label: "ونج", icon: "anchor" },
];

export const CAR_SERVICES = [
  { key: "mechanic", label: "ميكانيكي", icon: "settings" },
  { key: "auto_elec", label: "كهرباء سيارات", icon: "zap" },
  { key: "tire_spec", label: "كرين", icon: "circle" },
  { key: "body_repair", label: "بنجرجي", icon: "truck" },
  { key: "ac_car", label: "تبريد سيارات", icon: "wind" },
];

export const GENERAL_SERVICES = [
  { key: "clinic", label: "عيادات طبية", icon: "activity" },
  { key: "lab_center", label: "مراكز ومختبرات", icon: "thermometer" },
];

export const DELIVERY_SERVICES = [
  { key: "taxi", label: "تكسي", icon: "navigation" },
  { key: "bus", label: "باص", icon: "truck" },
  { key: "courier", label: "مندوب", icon: "package" },
];

export type ServiceCategory = "home" | "car" | "general" | "delivery";

export const ALL_SPECIALTIES = [...HOME_SERVICES, ...CAR_SERVICES, ...GENERAL_SERVICES, ...DELIVERY_SERVICES];

export function getCategoryForSpecialty(key: string): ServiceCategory {
  if (HOME_SERVICES.find((s) => s.key === key)) return "home";
  if (CAR_SERVICES.find((s) => s.key === key)) return "car";
  if (DELIVERY_SERVICES.find((s) => s.key === key)) return "delivery";
  return "general";
}

export function getSpecialtyLabel(key: string): string {
  if (key === "client") return "زبون";
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
  featuredUntil?: string | null;
  isPromoted?: boolean;
  createdAt: string;
  followCount?: number;
  likesCount?: number;
}

export function isFeaturedActive(a: { featuredUntil?: string | null }): boolean {
  if (!a.featuredUntil) return false;
  return new Date(a.featuredUntil).getTime() > Date.now();
}

export interface PromotionPlan {
  id: string;
  days: number;
  cost: number;
  label: string;
}

export const PROMOTION_PLANS: PromotionPlan[] = [
  { id: "p3", days: 3, cost: 5000, label: "٣ أيام" },
  { id: "p7", days: 7, cost: 10000, label: "٧ أيام" },
  { id: "p30", days: 30, cost: 35000, label: "٣٠ يوم" },
];

export const ADMIN_UID = "JBtQBKkpMvOT58abx2wZqOtxNwU2";
export const ADMIN_DISPLAY_NAME = "فريق الدعم - فورس";
export const SUPPORT_AUTO_REPLY =
  "أهلاً بك، نحن جاهزون لخدمتك. تفضل بطرح مشكلتك بوضوح وسوف يتواصل معك فريق الدعم قريباً.";

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
  | "on_the_way"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "rejected";

export const STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  pending: "قيد الانتظار",
  accepted: "تم القبول",
  on_the_way: "في الطريق إليك",
  in_progress: "قيد التنفيذ",
  completed: "مكتمل",
  cancelled: "ملغى",
  rejected: "مرفوض",
};

export const ACTIVE_STATUSES: ServiceRequestStatus[] = [
  "accepted",
  "on_the_way",
  "in_progress",
];

export interface ServiceRequest {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  artisanId: string;
  artisanUserId?: string;
  artisanName: string;
  specialty: string;
  problemDescription: string;
  clientLocation: GeoLocation | null;
  clientAddress: string;
  artisanLiveLocation?: GeoLocation | null;
  status: ServiceRequestStatus;
  createdAt: string;
  updatedAt?: string;
  // Uids that have soft-deleted this request from their own "السجل" history
  // view. The document itself is never removed so the other side's history
  // (and any chat/records tied to it) stays intact.
  hiddenFor?: string[];
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

// ─── Helper: map a users/{userId} doc → ArtisanProfile shape ─────────────────
// id === userId now that users collection is the single source of truth.
function userDocToArtisanProfile(userId: string, data: UserProfile): ArtisanProfile {
  return {
    id: userId,
    userId,
    name: data.name ?? "",
    phone: data.phone ?? "",
    photoUri: data.photoUri ?? null,
    specialty: data.specialty ?? "",
    category: data.category ?? getCategoryForSpecialty(data.specialty ?? ""),
    location: data.location ?? null,
    bio: data.bio ?? "",
    rating: data.rating ?? 0,
    reviewCount: data.reviewCount ?? 0,
    isAvailable: data.isAvailable ?? true,
    featuredUntil: data.featuredUntil ?? null,
    createdAt:
      typeof data.createdAt === "string"
        ? data.createdAt
        : (data.createdAt?.toDate?.()?.toISOString() ?? ""),
  };
}

/**
 * Returns users for the services listing.
 * • No category → ALL registered users (clients + artisans) for the "الكل" tab.
 * • With category → artisans only, filtered by that category.
 * Admin accounts are excluded in both cases.
 */
export const getArtisans = async (category?: ServiceCategory): Promise<ArtisanProfile[]> => {
  try {
    let q;
    if (category) {
      q = query(
        collection(db, "users"),
        where("role", "==", "artisan"),
        where("category", "==", category)
      );
    } else {
      // "All" tab — every user except admins
      q = query(collection(db, "users"));
    }
    const snap = await getDocs(q);
    const list = snap.docs
      .filter((d) => (d.data() as UserProfile).role !== "admin")
      .map((d) => userDocToArtisanProfile(d.id, d.data() as UserProfile));
    return list.sort((a, b) => {
      const fa = isFeaturedActive(a) ? 1 : 0;
      const fb = isFeaturedActive(b) ? 1 : 0;
      return fb - fa;
    });
  } catch (err) {
    console.error("getArtisans error:", err);
    return [];
  }
};

export const promoteArtisan = async (
  userId: string,
  artisanId: string,  // artisanId === userId with users-only model
  days: number,
  cost: number
): Promise<{ ok: true; until: string } | { ok: false; reason: "no_balance" | "error"; balance?: number }> => {
  try {
    const balance = await getBalance(userId);
    if (balance < cost) {
      return { ok: false, reason: "no_balance", balance };
    }
    // Compute new featured-until from users collection; extend if still active
    const userSnap = await getDoc(doc(db, "users", artisanId));
    const current = userSnap.exists() ? (userSnap.data() as any).featuredUntil : null;
    const startMs = current && new Date(current).getTime() > Date.now()
      ? new Date(current).getTime()
      : Date.now();
    const untilIso = new Date(startMs + days * 24 * 60 * 60 * 1000).toISOString();

    await adjustBalanceByDelta(userId, -cost);
    await updateDoc(doc(db, "users", artisanId), { featuredUntil: untilIso });
    return { ok: true, until: untilIso };
  } catch (err) {
    console.error("promoteArtisan error:", err);
    return { ok: false, reason: "error" };
  }
};

export const getArtisanByUserId = async (userId: string): Promise<ArtisanProfile | null> => {
  try {
    const profile = await getUserProfile(userId);
    if (!profile) return null;
    return userDocToArtisanProfile(userId, profile);
  } catch (err) {
    console.error("getArtisanByUserId error:", err);
    return null;
  }
};

export const getArtisanById = async (artisanId: string): Promise<ArtisanProfile | null> => {
  // artisanId === userId with users-only model
  return getArtisanByUserId(artisanId);
};

export const createOrUpdateArtisan = async (
  userId: string,
  data: Omit<ArtisanProfile, "id" | "userId" | "rating" | "reviewCount" | "createdAt">
): Promise<string> => {
  // Write artisan fields directly into the user document (single collection model)
  const { name, phone, photoUri, specialty, category, location, bio, isAvailable } = data;
  await setDoc(doc(db, "users", userId), {
    name, phone, photoUri, specialty, category, location, bio, isAvailable,
    role: "artisan",
  }, { merge: true });
  return userId;
};

// Lightweight sync used when only the photo changes (e.g. immediate profile-photo
// save) — avoids requiring the full ArtisanProfile payload that createOrUpdateArtisan needs.
/**
 * No-op: with the users-only model, visibility is controlled by role/specialty
 * fields on the user document. The caller already updates role → "client" via
 * setUserProfile, so there is nothing to delete here.
 */
export const deleteArtisanIfExists = async (_userId: string): Promise<void> => {
  // intentionally empty — single-collection model
};

export const updateArtisanPhotoIfExists = async (
  userId: string,
  photoUri: string
): Promise<void> => {
  try {
    await updateDoc(doc(db, "users", userId), { photoUri });
  } catch (err) {
    console.error("updateArtisanPhotoIfExists error:", err);
  }
};

// Push a fresh GPS fix into the user document (artisanId === userId).
export const updateArtisanLocation = async (
  artisanId: string,  // artisanId === userId with users-only model
  location: GeoLocation
): Promise<void> => {
  await updateDoc(doc(db, "users", artisanId), { location });
};

export const subscribeToArtisans = (
  callback: (artisans: ArtisanProfile[]) => void,
  category?: ServiceCategory
): Unsubscribe => {
  const q = category
    ? query(collection(db, "users"), where("role", "==", "artisan"), where("category", "==", category))
    : query(collection(db, "users"), where("role", "==", "artisan"));
  return onSnapshot(q, (snap) => {
    const artisans = snap.docs.map((d) => userDocToArtisanProfile(d.id, d.data() as UserProfile));
    callback(artisans);
  });
};

// ─── Reviews (subcollection: users/{userId}/reviews) ─────────────────────────
// artisanId parameter is now the userId (id === userId in users-only model).

export const getReviews = async (artisanId: string): Promise<Review[]> => {
  try {
    const q = query(
      collection(db, "users", artisanId, "reviews"),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Review));
  } catch (err) {
    console.error("getReviews error:", err);
    return [];
  }
};

export const subscribeToReviews = (
  artisanId: string,
  callback: (reviews: Review[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, "users", artisanId, "reviews"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Review)));
    },
    (err) => {
      console.error("subscribeToReviews error:", err);
    }
  );
};

export const addReview = async (
  review: Omit<Review, "id" | "createdAt">
): Promise<void> => {
  // One review per client per artisan: deterministic doc ID prevents duplicates.
  const reviewId = `${review.clientId}_${review.artisanId}`;
  await setDoc(
    doc(db, "users", review.artisanId, "reviews", reviewId),
    { ...review, createdAt: new Date().toISOString() },
    { merge: true }
  );

  // Recalculate average and update user document
  const allReviews = await getReviews(review.artisanId);
  const avg =
    allReviews.length > 0
      ? allReviews.reduce((a, r) => a + r.rating, 0) / allReviews.length
      : review.rating;

  await updateDoc(doc(db, "users", review.artisanId), {
    rating: Math.round(avg * 10) / 10,
    reviewCount: allReviews.length,
  });
};

// ─── Service Requests ─────────────────────────────────────────────────────────

export const createServiceRequest = async (
  data: Omit<ServiceRequest, "id" | "createdAt" | "status" | "artisanUserId">
): Promise<string> => {
  // Resolve artisan user id so we can subscribe by user later
  const artisan = await getArtisanById(data.artisanId);
  const docRef = await addDoc(collection(db, "serviceRequests"), {
    ...data,
    artisanUserId: artisan?.userId || null,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  // Notify artisan via push
  try {
    if (artisan?.userId) {
      const profile = await getUserProfile(artisan.userId);
      if (profile?.pushToken) {
        const desc = data.problemDescription || "";
        const body =
          `العميل: ${data.clientName}\n` +
          `الهاتف: ${data.clientPhone || "غير متوفر"}\n` +
          `المشكلة: ${desc.length > 100 ? desc.slice(0, 100) + "…" : desc}` +
          (data.clientAddress ? `\nالعنوان: ${data.clientAddress}` : "");
        await sendExpoPush(
          profile.pushToken,
          `طلب خدمة جديد - ${getSpecialtyLabel(data.specialty)}`,
          body,
          {
            type: "serviceRequest",
            requestId: docRef.id,
            clientId: data.clientId,
            artisanId: data.artisanId,
          }
        );
      }
    }
  } catch (err) {
    console.error("notify on createServiceRequest failed:", err);
  }

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

export const getServiceRequestsByArtisan = async (artisanUserId: string): Promise<ServiceRequest[]> => {
  try {
    const q = query(
      collection(db, "serviceRequests"),
      where("artisanUserId", "==", artisanUserId),
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

async function notifyClientOnRequest(
  request: ServiceRequest,
  title: string,
  body: string
) {
  try {
    const profile = await getUserProfile(request.clientId);
    if (profile?.pushToken) {
      await sendExpoPush(profile.pushToken, title, body, {
        type: "requestStatus",
        requestId: request.id,
        status: request.status,
        artisanName: request.artisanName,
      });
    }
  } catch (err) {
    console.error("notifyClientOnRequest failed:", err);
  }
}

export const acceptServiceRequest = async (requestId: string): Promise<void> => {
  const ref = doc(db, "serviceRequests", requestId);
  await updateDoc(ref, { status: "accepted", updatedAt: new Date().toISOString() });
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const req = { id: snap.id, ...snap.data() } as ServiceRequest;
    await notifyClientOnRequest(
      req,
      "تم قبول طلبك! 🎉",
      `قَبِل ${req.artisanName} طلبك. سيتواصل معك قريباً.`
    );
  }
};

export const rejectServiceRequest = async (requestId: string): Promise<void> => {
  const ref = doc(db, "serviceRequests", requestId);
  await updateDoc(ref, { status: "rejected", updatedAt: new Date().toISOString() });
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const req = { id: snap.id, ...snap.data() } as ServiceRequest;
    await notifyClientOnRequest(
      req,
      "تم رفض طلبك",
      `اعتذر ${req.artisanName} عن قبول طلبك. يمكنك تجربة صاحب اختصاص آخر.`
    );
  }
};

export const markRequestOnTheWay = async (
  requestId: string,
  liveLocation: GeoLocation | null
): Promise<void> => {
  const ref = doc(db, "serviceRequests", requestId);
  await updateDoc(ref, {
    status: "on_the_way",
    artisanLiveLocation: liveLocation,
    updatedAt: new Date().toISOString(),
  });
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const req = { id: snap.id, ...snap.data() } as ServiceRequest;
    await notifyClientOnRequest(
      req,
      "صاحب الاختصاص في الطريق إليك 🚗",
      `${req.artisanName} في طريقه إلى موقعك الآن.`
    );
  }
};

export const updateRequestLiveLocation = async (
  requestId: string,
  location: GeoLocation
): Promise<void> => {
  await updateDoc(doc(db, "serviceRequests", requestId), {
    artisanLiveLocation: location,
    updatedAt: new Date().toISOString(),
  });
};

export const completeServiceRequest = async (requestId: string): Promise<void> => {
  const ref = doc(db, "serviceRequests", requestId);
  await updateDoc(ref, { status: "completed", updatedAt: new Date().toISOString() });
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const req = { id: snap.id, ...snap.data() } as ServiceRequest;
    await notifyClientOnRequest(
      req,
      "اكتملت الخدمة ✓",
      `تم إنجاز طلبك مع ${req.artisanName}. لا تنسَ تقييم الخدمة.`
    );
  }
};

export const cancelServiceRequest = async (requestId: string): Promise<void> => {
  await updateDoc(doc(db, "serviceRequests", requestId), {
    status: "cancelled",
    updatedAt: new Date().toISOString(),
  });
};

/**
 * Soft-delete one or more service requests from the current user's own
 * "السجل" history view. Adds userId to each request's hiddenFor array
 * instead of deleting the document, so the other participant's history and
 * any linked records stay intact. Capped batches of 400 writes, same
 * pattern as other bulk Firestore operations in this file.
 */
export const hideServiceRequestsForUser = async (
  requestIds: string[],
  userId: string
): Promise<void> => {
  const BATCH_LIMIT = 400;
  for (let i = 0; i < requestIds.length; i += BATCH_LIMIT) {
    const chunk = requestIds.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    chunk.forEach((id) => {
      batch.update(doc(db, "serviceRequests", id), {
        hiddenFor: arrayUnion(userId),
      });
    });
    await batch.commit();
  }
};

export const subscribeToServiceRequests = (
  artisanUserId: string,
  callback: (requests: ServiceRequest[]) => void,
  onError?: (err: Error) => void
): Unsubscribe => {
  const q = query(
    collection(db, "serviceRequests"),
    where("artisanUserId", "==", artisanUserId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ServiceRequest));
      callback(requests);
    },
    (err) => {
      console.error("subscribeToServiceRequests error:", err);
      onError?.(err);
    }
  );
};

export const subscribeToClientServiceRequests = (
  clientId: string,
  callback: (requests: ServiceRequest[]) => void,
  onError?: (err: Error) => void
): Unsubscribe => {
  // Single-field filter only (no orderBy) to avoid requiring a Composite Index.
  // Results are sorted in-memory by createdAt descending.
  const q = query(
    collection(db, "serviceRequests"),
    where("clientId", "==", clientId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const requests = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as ServiceRequest))
        .sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });
      callback(requests);
    },
    (err) => {
      console.error("subscribeToClientServiceRequests error:", err);
      onError?.(err);
    }
  );
};

export const getPromotedArtisans = async (): Promise<ArtisanProfile[]> => {
  try {
    const snap = await getDocs(
      query(collection(db, "users"), where("role", "==", "artisan"))
    );
    const all = snap.docs.map((d) => userDocToArtisanProfile(d.id, d.data() as UserProfile));
    return all.filter(isFeaturedActive);
  } catch (err) {
    console.error("getPromotedArtisans error:", err);
    return [];
  }
};

// ─── Follow / Like reactions ──────────────────────────────────────────────────
//
// The subcollection documents are the source of truth. We never display the
// legacy followCount/likesCount fields because they can drift after older,
// interrupted writes. Transactions make each actor's reaction idempotent even
// when taps or devices race each other.

export type ProfileEngagementCounts = {
  followCount: number;
  likesCount: number;
};

export const getProfileEngagementCounts = async (
  userId: string
): Promise<ProfileEngagementCounts> => {
  const [followers, likes] = await Promise.all([
    getCountFromServer(collection(db, "users", userId, "followers")),
    getCountFromServer(collection(db, "users", userId, "likes")),
  ]);
  return {
    followCount: followers.data().count,
    likesCount: likes.data().count,
  };
};

export const getIsFollowing = async (followerId: string, artisanId: string): Promise<boolean> => {
  const snap = await getDoc(doc(db, "users", artisanId, "followers", followerId));
  return snap.exists();
};

export const followArtisan = async (followerId: string, artisanId: string): Promise<boolean> => {
  const profileRef = doc(db, "users", artisanId);
  const followRef = doc(db, "users", artisanId, "followers", followerId);
  return runTransaction(db, async (transaction) => {
    const [profileSnap, followSnap] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(followRef),
    ]);
    if (!profileSnap.exists()) {
      throw new Error("Cannot follow a profile that does not exist");
    }
    if (followSnap.exists()) return false;

    transaction.set(followRef, { followedAt: serverTimestamp() });
    return true;
  });
};

export const unfollowArtisan = async (followerId: string, artisanId: string): Promise<boolean> => {
  const followRef = doc(db, "users", artisanId, "followers", followerId);
  return runTransaction(db, async (transaction) => {
    const followSnap = await transaction.get(followRef);
    if (!followSnap.exists()) return false;

    transaction.delete(followRef);
    return true;
  });
};

// ─── Like / Unlike ────────────────────────────────────────────────────────────

export const getIsLiked = async (likerId: string, artisanId: string): Promise<boolean> => {
  const snap = await getDoc(doc(db, "users", artisanId, "likes", likerId));
  return snap.exists();
};

export const likeArtisan = async (likerId: string, artisanId: string): Promise<boolean> => {
  const profileRef = doc(db, "users", artisanId);
  const likeRef = doc(db, "users", artisanId, "likes", likerId);
  return runTransaction(db, async (transaction) => {
    const [profileSnap, likeSnap] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(likeRef),
    ]);
    if (!profileSnap.exists()) {
      throw new Error("Cannot like a profile that does not exist");
    }
    if (likeSnap.exists()) return false;

    transaction.set(likeRef, { likedAt: serverTimestamp() });
    return true;
  });
};

export const unlikeArtisan = async (likerId: string, artisanId: string): Promise<boolean> => {
  const likeRef = doc(db, "users", artisanId, "likes", likerId);
  return runTransaction(db, async (transaction) => {
    const likeSnap = await transaction.get(likeRef);
    if (!likeSnap.exists()) return false;

    transaction.delete(likeRef);
    return true;
  });
};

export const subscribeToServiceRequest = (
  requestId: string,
  callback: (request: ServiceRequest | null) => void
): Unsubscribe => {
  return onSnapshot(doc(db, "serviceRequests", requestId), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback({ id: snap.id, ...snap.data() } as ServiceRequest);
  });
};

export const getServiceRequest = async (requestId: string): Promise<ServiceRequest | null> => {
  try {
    const snap = await getDoc(doc(db, "serviceRequests", requestId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as ServiceRequest;
  } catch (err) {
    console.error("getServiceRequest error:", err);
    return null;
  }
};

// ─── Support Chat ─────────────────────────────────────────────────────────────

export function buildSupportChatId(userId: string): string {
  return buildChatId(userId, ADMIN_UID);
}

export const ensureSupportWelcome = async (userId: string): Promise<void> => {
  const chatId = buildSupportChatId(userId);
  try {
    const msgsSnap = await getDocs(
      query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"))
    );
    if (!msgsSnap.empty) return; // already initialized

    await addDoc(collection(db, "chats", chatId, "messages"), {
      chatId,
      senderId: ADMIN_UID,
      senderName: ADMIN_DISPLAY_NAME,
      text: SUPPORT_AUTO_REPLY,
      createdAt: new Date().toISOString(),
    });
    await setDoc(
      doc(db, "chats", chatId),
      {
        participants: [userId, ADMIN_UID].sort(),
        lastMessage: SUPPORT_AUTO_REPLY,
        lastAt: new Date().toISOString(),
        isSupport: true,
      },
      { merge: true }
    );
  } catch (err) {
    console.error("ensureSupportWelcome failed:", err);
  }
};

// ─── Push Notifications ───────────────────────────────────────────────────────

export const sendExpoPush = async (
  toToken: string | null | undefined,
  title: string,
  body: string,
  data: Record<string, any> = {}
): Promise<void> => {
  if (!toToken) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: toToken,
        sound: "default",
        title,
        body,
        data,
        priority: "high",
        channelId: "default",
      }),
    });
  } catch (err) {
    console.error("sendExpoPush failed:", err);
  }
};

// ─── Chat Messages ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
  read?: boolean;
  type?: "text" | "image" | "audio" | "card";
  mediaUrl?: string;
  duration?: number;
  deleted?: boolean;
  /** Card message fields — populated when type === "card" */
  cardImage?: string;   // image URL for the card thumbnail
  cardTitle?: string;   // display title inside the card bubble
  cardRoute?: string;   // internal Expo Router path to push on tap
  /** Story reply — thumbnail of the story that was replied to */
  storyImageUrl?: string;
}

export const DELETED_MESSAGE_TEXT = "تم حذف هذه الرسالة";

export interface ChatSummary {
  chatId: string;
  otherUserId: string;
  otherName: string;
  otherPhotoUri: string | null;
  lastMessage: string;
  lastAt: string;
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

  // Notify recipient
  try {
    const otherUid = chatId.split("_").find((u) => u !== senderId);
    if (otherUid) {
      const profile = await getUserProfile(otherUid);
      if (profile?.pushToken) {
        await sendExpoPush(
          profile.pushToken,
          `رسالة جديدة من ${senderName}`,
          text.length > 80 ? `${text.slice(0, 80)}…` : text,
          { type: "chat", chatId, senderId, senderName }
        );
      }
    }
  } catch (err) {
    console.error("notify on sendMessage failed:", err);
  }
};

/**
 * Send a story-reply message to a chat.
 * Stored as a plain text message with `storyImageUrl` attached so the
 * chat bubble can show a thumbnail of the story above the reply text.
 */
export const sendStoryReply = async (
  chatId: string,
  senderId: string,
  senderName: string,
  storyImageUrl: string,
  text: string
): Promise<void> => {
  await addDoc(collection(db, "chats", chatId, "messages"), {
    chatId,
    senderId,
    senderName,
    text,
    storyImageUrl,
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
  try {
    const otherUid = chatId.split("_").find((u) => u !== senderId);
    if (otherUid) {
      const profile = await getUserProfile(otherUid);
      if (profile?.pushToken) {
        await sendExpoPush(
          profile.pushToken,
          `رد على قصتك من ${senderName}`,
          text.length > 80 ? `${text.slice(0, 80)}…` : text,
          { type: "chat", chatId, senderId, senderName }
        );
      }
    }
  } catch (err) {
    console.error("notify on sendStoryReply failed:", err);
  }
};

/**
 * Send a rich card message (profile / product card) to a chat.
 * The card is stored with type:"card" and renders as an interactive bubble
 * with thumbnail + title + "عرض" button that navigates to cardRoute.
 */
export const sendCardMessage = async (
  chatId: string,
  senderId: string,
  senderName: string,
  cardImage: string,
  cardTitle: string,
  cardRoute: string,
  previewText: string
): Promise<void> => {
  await addDoc(collection(db, "chats", chatId, "messages"), {
    chatId,
    senderId,
    senderName,
    text: previewText,
    type: "card",
    cardImage,
    cardTitle,
    cardRoute,
    createdAt: new Date().toISOString(),
  });
  await setDoc(
    doc(db, "chats", chatId),
    {
      participants: chatId.split("_"),
      lastMessage: previewText,
      lastAt: new Date().toISOString(),
    },
    { merge: true }
  );
  try {
    const otherUid = chatId.split("_").find((u) => u !== senderId);
    if (otherUid) {
      const profile = await getUserProfile(otherUid);
      if (profile?.pushToken) {
        await sendExpoPush(
          profile.pushToken,
          `رسالة جديدة من ${senderName}`,
          previewText.length > 80 ? `${previewText.slice(0, 80)}…` : previewText,
          { type: "chat", chatId, senderId, senderName }
        );
      }
    }
  } catch (err) {
    console.error("notify on sendCardMessage failed:", err);
  }
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

// Account allowed to see every conversation in the messages list, including
// support/customer-service chats that are hidden from regular users.
const UNRESTRICTED_INBOX_EMAIL = "haidar.askry@gmail.com";

/**
 * Whether the signed-in viewer should see support chats in their general
 * messages list instead of having them filtered out.
 */
export function canViewAllChats(viewerEmail?: string | null): boolean {
  return viewerEmail?.toLowerCase() === UNRESTRICTED_INBOX_EMAIL;
}

export const getUserChats = async (
  userId: string,
  viewerEmail?: string | null
): Promise<ChatSummary[]> => {
  try {
    const bypassFilter = canViewAllChats(viewerEmail);
    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", userId)
    );
    const snap = await getDocs(q);
    const summaries = await Promise.all(
      snap.docs
        .filter((d) => {
          if (bypassFilter) return true;
          const data = d.data();
          if (data.isSupport === true) return false;
          const participants: string[] = data.participants || [];
          if (participants.includes(ADMIN_UID)) return false;
          return true;
        })
        .map(async (d) => {
          const data = d.data();
          const participants: string[] = data.participants || [];
          const otherUid = participants.find((u) => u !== userId) || "";
          const otherProfile = otherUid && otherUid !== ADMIN_UID ? await getUserProfile(otherUid) : null;
          return {
            chatId: d.id,
            otherUserId: otherUid,
            otherName: otherUid === ADMIN_UID ? ADMIN_DISPLAY_NAME : otherProfile?.name || "مستخدم فورس",
            otherPhotoUri: otherProfile?.photoUri || null,
            lastMessage: data.lastMessage || "",
            lastAt: data.lastAt || "",
          } as ChatSummary;
        })
    );
    return summaries.sort((a, b) => (b.lastAt > a.lastAt ? 1 : -1));
  } catch (err) {
    console.error("getUserChats error:", err);
    return [];
  }
};

export const subscribeToUserChats = (
  userId: string,
  callback: (chats: ChatSummary[]) => void,
  viewerEmail?: string | null
): Unsubscribe => {
  const bypassFilter = canViewAllChats(viewerEmail);
  const q = query(
    collection(db, "chats"),
    where("participants", "array-contains", userId)
  );
  return onSnapshot(q, async (snap) => {
    const summaries = await Promise.all(
      snap.docs
        .filter((d) => {
          if (bypassFilter) return true;
          const data = d.data();
          if (data.isSupport === true) return false;
          const participants: string[] = data.participants || [];
          if (participants.includes(ADMIN_UID)) return false;
          return true;
        })
        .map(async (d) => {
          const data = d.data();
          const participants: string[] = data.participants || [];
          const otherUid = participants.find((u) => u !== userId) || "";
          const otherProfile = otherUid && otherUid !== ADMIN_UID ? await getUserProfile(otherUid) : null;
          return {
            chatId: d.id,
            otherUserId: otherUid,
            otherName: otherUid === ADMIN_UID ? ADMIN_DISPLAY_NAME : otherProfile?.name || "مستخدم فورس",
            otherPhotoUri: otherProfile?.photoUri || null,
            lastMessage: data.lastMessage || "",
            lastAt: data.lastAt || "",
          } as ChatSummary;
        })
    );
    callback(summaries.sort((a, b) => (b.lastAt > a.lastAt ? 1 : -1)));
  });
};

/**
 * Mark all unread messages (sent by others) as read in a chat.
 * Uses writeBatch, capped at 400 per batch.
 */
export const markMessagesRead = async (chatId: string, readerId: string): Promise<void> => {
  try {
    const q = query(
      collection(db, "chats", chatId, "messages"),
      where("senderId", "!=", readerId)
    );
    const snap = await getDocs(q);
    const unread = snap.docs.filter((d) => d.data().read !== true);
    if (unread.length === 0) return;
    const BATCH_SIZE = 400;
    for (let i = 0; i < unread.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      unread.slice(i, i + BATCH_SIZE).forEach((d) => {
        batch.update(d.ref, { read: true });
      });
      await batch.commit();
    }
  } catch (err) {
    console.error("markMessagesRead error:", err);
  }
};

/**
 * "Delete for everyone": replaces the message's content with a placeholder
 * so both participants see the change live via onSnapshot. Only the
 * original sender may do this (enforced by firestore.rules).
 */
export const deleteMessageForEveryone = async (
  chatId: string,
  messageId: string
): Promise<void> => {
  await updateDoc(doc(db, "chats", chatId, "messages", messageId), {
    deleted: true,
    text: DELETED_MESSAGE_TEXT,
    type: "text",
    mediaUrl: deleteField(),
    duration: deleteField(),
  });
};

/**
 * Upload a media file (image or audio) to Storage and send a message.
 */
export const sendMediaMessage = async (
  chatId: string,
  senderId: string,
  senderName: string,
  type: "image" | "audio",
  localUri: string,
  duration?: number
): Promise<void> => {
  const timestamp = Date.now();
  const ext = type === "audio" ? ".m4a" : ".jpg";
  const filename = `${timestamp}${ext}`;
  const path = `chatMedia/${chatId}/${filename}`;
  const storageRef = ref(storage, path);

  const blob = await uriToBlob(localUri);
  const contentType = type === "audio" ? "audio/mp4" : "image/jpeg";
  await uploadBytes(storageRef, blob, { contentType });
  const mediaUrl = await getDownloadURL(storageRef);

  const msgData: Record<string, any> = {
    chatId,
    senderId,
    senderName,
    text: type === "image" ? "📷 صورة" : "🎤 رسالة صوتية",
    type,
    mediaUrl,
    createdAt: new Date().toISOString(),
  };
  if (type === "audio" && duration !== undefined) {
    msgData.duration = duration;
  }

  await addDoc(collection(db, "chats", chatId, "messages"), msgData);
  await setDoc(
    doc(db, "chats", chatId),
    {
      participants: chatId.split("_"),
      lastMessage: msgData.text,
      lastAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // Notify recipient
  try {
    const otherUid = chatId.split("_").find((u) => u !== senderId);
    if (otherUid) {
      const profile = await getUserProfile(otherUid);
      if (profile?.pushToken) {
        await sendExpoPush(
          profile.pushToken,
          `رسالة جديدة من ${senderName}`,
          msgData.text,
          { type: "chat", chatId, senderId, senderName }
        );
      }
    }
  } catch (err) {
    console.error("notify on sendMediaMessage failed:", err);
  }
};

export const subscribeToUserChatLastAts = (
  userId: string,
  callback: (lastAts: string[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, "chats"),
    where("participants", "array-contains", userId)
  );
  return onSnapshot(q, (snap) => {
    const lastAts = snap.docs.map((d) => (d.data().lastAt as string) || "");
    callback(lastAts);
  });
};

export const deleteChat = async (chatId: string): Promise<void> => {
  try {
    const msgsSnap = await getDocs(collection(db, "chats", chatId, "messages"));
    await Promise.all(msgsSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "chats", chatId));
  } catch (err) {
    console.error("deleteChat error:", err);
    throw err;
  }
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
  phoneNumber?: string;
  isPhoneVerified?: boolean;
  photoUri: string | null;
  role: "client" | "artisan" | "admin";
  location?: GeoLocation | null;
  specialty?: string;
  category?: ServiceCategory;
  bio?: string;
  portfolio?: string[];
  profilePosts?: ProfilePost[];
  pushToken?: string | null;
  createdAt?: any;
  email?: string;
  featuredUntil?: string | null;
  rating?: number;
  reviewCount?: number;
  isAvailable?: boolean;
  balance?: number;
  followCount?: number;
  likesCount?: number;
}

export interface ProfilePost {
  id: string;
  url: string;
  mediaType: "image" | "video";
  createdAt: string;
  storagePath?: string;
  mimeType?: string | null;
  /** Added only while normalizing old portfolio URLs; never persisted. */
  legacy?: boolean;
}

export const setUserPushToken = async (
  userId: string,
  token: string | null
): Promise<void> => {
  await setDoc(doc(db, "users", userId), { pushToken: token }, { merge: true });
};

// Clears the push token for a user (called on sign-out) so notifications for
// the account they just left stop arriving on this device, and so a stale
// token isn't left behind for another account to inherit.
export const clearUserPushToken = async (userId: string): Promise<void> => {
  await setDoc(doc(db, "users", userId), { pushToken: null }, { merge: true });
};

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

export function normalizeProfilePosts(
  profile: Pick<UserProfile, "profilePosts" | "portfolio"> | null | undefined
): ProfilePost[] {
  const saved = (profile?.profilePosts ?? []).filter(
    (post): post is ProfilePost =>
      !!post?.id &&
      !!post?.url &&
      (post.mediaType === "image" || post.mediaType === "video")
  );
  const savedUrls = new Set(saved.map((post) => post.url));
  const legacy = (profile?.portfolio ?? [])
    .filter((url) => !!url && !savedUrls.has(url))
    .map((url, index) => ({
      id: `legacy-${index}-${url}`,
      url,
      mediaType: "image" as const,
      createdAt: "",
      legacy: true,
    }));

  return [...saved]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .concat(legacy);
}

// ─── Portfolio Images ─────────────────────────────────────────────────────────

async function uriToBlob(uri: string): Promise<Blob> {
  // fetch() works on web AND on React Native (Hermes/JSC) for file:// URIs
  try {
    const response = await fetch(uri);
    if (!response.ok && response.status !== 0) {
      throw new Error(`fetch failed: ${response.status}`);
    }
    return await response.blob();
  } catch (err) {
    // XHR fallback for stubborn cases on native
    return new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.responseType = "blob";
      xhr.onload = () => resolve(xhr.response as Blob);
      xhr.onerror = () => reject(new Error("XHR failed reading file"));
      xhr.open("GET", uri, true);
      xhr.send(null);
    });
  }
}

export const uploadProfilePhoto = async (
  userId: string,
  localUri: string
): Promise<string> => {
  try {
    const blob = await uriToBlob(localUri);
    const path = `avatars/${userId}/${Date.now()}.jpg`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(storageRef);
    return url;
  } catch (err: any) {
    console.error("uploadProfilePhoto failed:", err?.code, err?.message, err);
    throw new Error(err?.message || "upload failed");
  }
};

export const uploadPortfolioImage = async (
  userId: string,
  localUri: string
): Promise<string> => {
  try {
    const blob = await uriToBlob(localUri);
    const path = `portfolio/${userId}/${Date.now()}.jpg`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(storageRef);
    return url;
  } catch (err: any) {
    console.error("uploadPortfolioImage failed:", err?.code, err?.message, err);
    throw new Error(err?.message || "upload failed");
  }
};

export const addPortfolioImage = async (
  userId: string,
  imageUrl: string
): Promise<void> => {
  const userRef = doc(db, "users", userId);
  try {
    await updateDoc(userRef, { portfolio: arrayUnion(imageUrl) });
  } catch (err: any) {
    if (err?.code === "not-found") {
      await setDoc(userRef, { portfolio: [imageUrl] }, { merge: true });
    } else {
      throw err;
    }
  }
};

export const removePortfolioImage = async (
  userId: string,
  imageUrl: string
): Promise<void> => {
  await updateDoc(doc(db, "users", userId), {
    portfolio: arrayRemove(imageUrl),
  });
  try {
    const storageRef = ref(storage, imageUrl);
    await deleteObject(storageRef);
  } catch {
    // ignore if file already removed
  }
};

// ─── Persistent Profile Posts ─────────────────────────────────────────────────

function extensionForMedia(
  mediaType: "image" | "video",
  mimeType?: string | null,
  fileName?: string | null,
  uri?: string
): string {
  const namedExtension = (fileName || uri?.split("?")[0] || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  const allowed = new Set(
    mediaType === "video"
      ? ["mp4", "mov", "m4v", "webm", "3gp"]
      : ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"]
  );
  if (namedExtension && allowed.has(namedExtension)) return namedExtension;

  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/x-m4v": "m4v",
    "video/webm": "webm",
    "video/3gpp": "3gp",
  };
  return (mimeType && byMime[mimeType.toLowerCase()]) || (mediaType === "video" ? "mp4" : "jpg");
}

export const uploadProfilePostMedia = async (
  userId: string,
  localUri: string,
  mediaType: "image" | "video",
  metadata?: { mimeType?: string | null; fileName?: string | null }
): Promise<{ url: string; storagePath: string; mimeType: string }> => {
  try {
    const blob = await uriToBlob(localUri);
    const extension = extensionForMedia(
      mediaType,
      metadata?.mimeType,
      metadata?.fileName,
      localUri
    );
    const mimeByExtension: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      heic: "image/heic",
      heif: "image/heif",
      mp4: "video/mp4",
      mov: "video/quicktime",
      m4v: "video/x-m4v",
      webm: "video/webm",
      "3gp": "video/3gpp",
    };
    const detectedMime =
      metadata?.mimeType?.startsWith(`${mediaType}/`)
        ? metadata.mimeType
        : blob.type?.startsWith(`${mediaType}/`)
          ? blob.type
          : mimeByExtension[extension] ||
            (mediaType === "video" ? "video/mp4" : "image/jpeg");
    const storagePath = `profile-posts/${userId}/${Date.now()}.${extension}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, blob, { contentType: detectedMime });
    return {
      url: await getDownloadURL(storageRef),
      storagePath,
      mimeType: detectedMime,
    };
  } catch (err: any) {
    console.error("uploadProfilePostMedia failed:", err?.code, err?.message);
    throw new Error(err?.message || "upload failed");
  }
};

export const addProfilePost = async (
  userId: string,
  post: ProfilePost
): Promise<void> => {
  const persistedPost = {
    id: post.id,
    url: post.url,
    mediaType: post.mediaType,
    createdAt: post.createdAt,
    storagePath: post.storagePath ?? null,
    mimeType: post.mimeType ?? null,
  };
  await setDoc(
    doc(db, "users", userId),
    { profilePosts: arrayUnion(persistedPost) },
    { merge: true }
  );
};

export const removeProfilePost = async (
  userId: string,
  post: ProfilePost
): Promise<void> => {
  if (post.legacy) {
    await removePortfolioImage(userId, post.url);
    return;
  }

  const persistedPost = {
    id: post.id,
    url: post.url,
    mediaType: post.mediaType,
    createdAt: post.createdAt,
    storagePath: post.storagePath ?? null,
    mimeType: post.mimeType ?? null,
  };
  await updateDoc(doc(db, "users", userId), {
    profilePosts: arrayRemove(persistedPost),
  });

  try {
    await deleteObject(ref(storage, post.storagePath || post.url));
  } catch {
    // The database entry is already removed; a missing Storage object is harmless.
  }
};

// ─── Products / Marketplace ───────────────────────────────────────────────────

export interface Product {
  id: string;
  title: string;
  price: number;
  description?: string;
  imageUrl: string;
  media?: ProductMedia[];
  sellerId: string;
  sellerName: string;
  sellerPhone: string;
  sellerFeaturedUntil?: string | null;
  /** Set to 100 when seller is promoted; absent/0 for regular sellers */
  priorityScore?: number;
  /** True while seller has an active promotion */
  isPromoted?: boolean;
  status: "available" | "sold";
  soldAt?: string | null;
  createdAt: string;
}

export type ProductMediaType = "image" | "video";

export interface ProductMedia {
  url: string;
  type: ProductMediaType;
}

export interface ProductOrder {
  id: string;
  productId: string;
  productTitle: string;
  productImageUrl: string;
  productPrice?: number;
  sellerId: string;
  sellerName?: string;
  buyerId: string;
  buyerName: string;
  buyerPhone: string;
  buyerLocation?: GeoLocation | null;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  /** UIDs of sellers who hid this order from their view (soft delete) */
  hiddenForSeller?: string[];
  /** UIDs of buyers who hid this order from their view (soft delete) */
  hiddenForBuyer?: string[];
}

export interface LocalProductMedia {
  uri: string;
  type: ProductMediaType;
  mimeType?: string | null;
  fileName?: string | null;
}

const localUriToBlob = async (localUri: string, fallbackMime = "image/jpeg"): Promise<Blob> => {
  let blob: Blob;

  if (localUri.startsWith("data:")) {
    // Web: expo-image-picker may return a base64 data URI
    const [header, base64] = localUri.split(",");
    const mime = header.match(/:(.*?);/)?.[1] ?? fallbackMime;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    blob = new Blob([bytes], { type: mime });
  } else {
    // Native / blob URL
    const resp = await fetch(localUri);
    if (!resp.ok) throw new Error(`fetch media failed: ${resp.status}`);
    blob = await resp.blob();
  }
  return blob;
};

const mediaExtension = (media: LocalProductMedia, mimeType: string): string => {
  const fileNameExtension = media.fileName?.split(".").pop()?.toLowerCase();
  if (fileNameExtension && /^[a-z0-9]{2,5}$/.test(fileNameExtension)) return fileNameExtension;
  return mimeType.includes("mp4") ? "mp4" : mimeType.includes("quicktime") ? "mov" : "jpg";
};

export const uploadProductMedia = async (
  media: LocalProductMedia,
  productId: string,
  index: number
): Promise<ProductMedia> => {
  const fallbackMime = media.type === "video" ? "video/mp4" : "image/jpeg";
  const blob = await localUriToBlob(media.uri, fallbackMime);
  const contentType = media.mimeType || blob.type || fallbackMime;
  const extension = mediaExtension(media, contentType);
  const storageRef = ref(storage, `products/${productId}/media/${index}-${Date.now()}.${extension}`);
  await uploadBytes(storageRef, blob, { contentType });
  return {
    url: await getDownloadURL(storageRef),
    type: media.type,
  };
};

export const createProduct = async (data: {
  title: string;
  price: number;
  description?: string;
  localMedia: LocalProductMedia[];
  sellerId: string;
  sellerName: string;
  sellerPhone: string;
}): Promise<string> => {
  const docRef = doc(collection(db, "products"));
  if (data.localMedia.length === 0) throw new Error("At least one media item is required");
  const media = await Promise.all(
    data.localMedia.map((item, index) => uploadProductMedia(item, docRef.id, index))
  );
  const imageUrl = media.find((item) => item.type === "image")?.url || media[0].url;

  // Carry seller's active featured-until so the marketplace can sort/badge instantly
  const sellerSnap = await getDoc(doc(db, "users", data.sellerId));
  const sellerFeaturedUntil = sellerSnap.exists()
    ? (sellerSnap.data() as any).featuredUntil ?? null
    : null;

  await setDoc(docRef, {
    title: data.title,
    price: data.price,
    description: data.description || "",
    imageUrl,
    media,
    sellerId: data.sellerId,
    sellerName: data.sellerName,
    sellerPhone: data.sellerPhone,
    sellerFeaturedUntil,
    status: "available",
    soldAt: null,
    createdAt: new Date().toISOString(),
  });
  return docRef.id;
};

// Promote any user (client OR artisan). Deducts cost from wallet, writes
// featuredUntil to users/{userId}, batch-updates all their products, and if the
// user also has an artisan profile it gets promoted too.
export const promoteUser = async (
  userId: string,
  days: number,
  cost: number
): Promise<{ ok: true; until: string } | { ok: false; reason: "no_balance" | "error"; balance?: number }> => {
  try {
    const bal = await getBalance(userId);
    if (bal < cost) return { ok: false, reason: "no_balance", balance: bal };

    const userSnap = await getDoc(doc(db, "users", userId));
    const current = userSnap.exists() ? (userSnap.data() as any).featuredUntil : null;
    const startMs =
      current && new Date(current).getTime() > Date.now()
        ? new Date(current).getTime()
        : Date.now();
    const untilIso = new Date(startMs + days * 24 * 60 * 60 * 1000).toISOString();

    await adjustBalanceByDelta(userId, -cost);
    await setDoc(
      doc(db, "users", userId),
      { featuredUntil: untilIso, isPromoted: true },
      { merge: true }
    );

    // Batch-update sellerFeaturedUntil + priorityScore + isPromoted on all products
    const prodSnap = await getDocs(
      query(collection(db, "products"), where("sellerId", "==", userId))
    );
    if (prodSnap.docs.length > 0) {
      const batch = writeBatch(db);
      prodSnap.docs.forEach((d) =>
        batch.update(d.ref, {
          sellerFeaturedUntil: untilIso,
          priorityScore: 100,
          isPromoted: true,
        })
      );
      await batch.commit();
    }

    // Batch-update priorityScore + isPromoted on all active stories by this user
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const storySnap = await getDocs(
        query(
          collection(db, "stories"),
          where("userId", "==", userId),
          where("createdAt", ">", since)
        )
      );
      if (storySnap.docs.length > 0) {
        const storyBatch = writeBatch(db);
        storySnap.docs.forEach((d) =>
          storyBatch.update(d.ref, { priorityScore: 100, isPromoted: true })
        );
        await storyBatch.commit();
      }
    } catch { /* stories update is best-effort */ }

    // If user is also an artisan, promote their artisan profile too
    try {
      const artisan = await getArtisanByUserId(userId);
      if (artisan) {
        await updateDoc(doc(db, "artisans", artisan.id), {
          featuredUntil: untilIso,
          isPromoted: true,
          priorityScore: 100,
        });
      }
    } catch { /* not an artisan — ignore */ }

    return { ok: true, until: untilIso };
  } catch (err) {
    console.error("promoteUser error:", err);
    return { ok: false, reason: "error" };
  }
};

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export const subscribeToProducts = (
  callback: (products: Product[]) => void,
  onError?: (err: Error) => void
): (() => void) => {
  // Single-field orderBy keeps Firestore happy (no composite index needed).
  // Client-side sort below applies the full priority → date order.
  const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now();
      const expired: string[] = [];

      const products = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Product))
        .filter((p) => {
          if (p.status !== "sold") return true;
          if (!p.soldAt) {
            expired.push(p.id);
            return false;
          }
          const soldTime = new Date(p.soldAt).getTime();
          const isExpired = now - soldTime > FIVE_MINUTES_MS;
          if (isExpired) expired.push(p.id);
          return !isExpired;
        });

      // Fire-and-forget: delete expired sold products from Firestore
      if (expired.length > 0) {
        const batch = writeBatch(db);
        expired.forEach((id) => batch.delete(doc(db, "products", id)));
        batch.commit().catch((err) =>
          console.error("subscribeToProducts: failed to delete expired sold products", err)
        );
      }

      // Client-side priority sort:
      //   1. priorityScore desc  (promoted sellers score 100, others 0)
      //   2. createdAt desc      (newer first within same tier)
      products.sort((a, b) => {
        const pa = a.priorityScore ?? 0;
        const pb = b.priorityScore ?? 0;
        if (pb !== pa) return pb - pa;
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });

      callback(products);
    },
    (err) => {
      console.error("subscribeToProducts error:", err);
      onError?.(err);
    }
  );
};

export const createProductOrder = async (
  data: Omit<ProductOrder, "id" | "createdAt" | "status">
): Promise<string> => {
  const docRef = await addDoc(collection(db, "productOrders"), {
    ...data,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  try {
    const sellerProfile = await getUserProfile(data.sellerId);
    if (sellerProfile?.pushToken) {
      await sendExpoPush(
        sellerProfile.pushToken,
        `طلب شراء جديد — ${data.productTitle}`,
        `${data.buyerName} يريد شراء منتجك\nالهاتف: ${data.buyerPhone}`,
        { type: "productOrder", orderId: docRef.id, productId: data.productId }
      );
    }
  } catch (err) {
    console.error("notify seller on productOrder failed:", err);
  }
  return docRef.id;
};

export const respondToProductOrder = async (
  orderId: string,
  productId: string,
  productTitle: string,
  buyerId: string,
  response: "accepted" | "rejected"
): Promise<void> => {
  await updateDoc(doc(db, "productOrders", orderId), { status: response });
  if (response === "accepted") {
    await updateDoc(doc(db, "products", productId), {
      status: "sold",
      soldAt: new Date().toISOString(),
    });
  }
  try {
    const buyerProfile = await getUserProfile(buyerId);
    if (buyerProfile?.pushToken) {
      const accepted = response === "accepted";
      await sendExpoPush(
        buyerProfile.pushToken,
        accepted ? `تم قبول طلبك — ${productTitle}` : `اعتذار — ${productTitle}`,
        accepted
          ? "تم قبول طلب الشراء! تواصل مع صاحب المنتج لإتمام الصفقة."
          : "اعتذر صاحب المنتج عن البيع في الوقت الحالي.",
        { type: "productOrderResponse", orderId, productId, response }
      );
    }
  } catch (err) {
    console.error("notify buyer on productOrder response failed:", err);
  }
};

export const deleteProduct = async (productId: string): Promise<void> => {
  await deleteDoc(doc(db, "products", productId));
};

export const cancelProductOrder = async (orderId: string): Promise<void> => {
  await deleteDoc(doc(db, "productOrders", orderId));
};

/**
 * Soft-delete productOrder documents by hiding them for the given user.
 *
 * Hard deletion is blocked by Firestore rules for sellers (and for buyers on
 * non-pending orders). Instead we set hiddenForSeller / hiddenForBuyer so the
 * order disappears from the caller's view while the document stays intact.
 *
 * Firestore batch limit is 500 writes; large lists are split automatically.
 */
export const bulkDeleteProductOrders = async (
  orderIds: string[],
  userId: string,
  role: "seller" | "buyer"
): Promise<void> => {
  if (!orderIds.length) return;
  const field = role === "seller" ? "hiddenForSeller" : "hiddenForBuyer";
  const chunks: string[][] = [];
  for (let i = 0; i < orderIds.length; i += 500) chunks.push(orderIds.slice(i, i + 500));
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach((id) =>
      batch.update(doc(db, "productOrders", id), {
        [field]: arrayUnion(userId),
      })
    );
    await batch.commit();
  }
};

export const subscribeToSellerProductOrders = (
  sellerId: string,
  callback: (orders: ProductOrder[]) => void,
  onError?: (err: Error) => void
): (() => void) => {
  // Single-field filter only (no orderBy) to avoid requiring a Composite Index.
  // Results are sorted in-memory by createdAt descending.
  // Orders soft-deleted by this seller (hiddenForSeller contains sellerId) are excluded.
  const q = query(
    collection(db, "productOrders"),
    where("sellerId", "==", sellerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const orders = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as ProductOrder))
        .filter((o) => !o.hiddenForSeller?.includes(sellerId))
        .sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });
      callback(orders);
    },
    (err) => {
      console.error("subscribeToSellerProductOrders error:", err);
      onError?.(err);
    }
  );
};

export const subscribeToBuyerProductOrders = (
  buyerId: string,
  callback: (orders: ProductOrder[]) => void,
  onError?: (err: Error) => void
): (() => void) => {
  // Filter by buyerId only (no status filter) so the buyer can see all their orders
  // (pending, accepted, rejected) and soft-deleted ones are excluded client-side.
  const q = query(
    collection(db, "productOrders"),
    where("buyerId", "==", buyerId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const orders = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as ProductOrder))
        .filter((o) => !o.hiddenForBuyer?.includes(buyerId))
        .sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });
      callback(orders);
    },
    (err) => {
      console.error("subscribeToBuyerProductOrders error:", err);
      onError?.(err);
    }
  );
};

// ─── User Documents ────────────────────────────────────────────────────────────

export const ensureUserDocument = async (
  userId: string,
  email: string, // E.164 phone (+964...), old @sanad.app email, or real email address
  role: "client" | "artisan" = "client",
  extraData?: { name?: string; specialty?: string; location?: GeoLocation | null; phone?: string }
): Promise<void> => {
  try {
    const ref = doc(db, "users", userId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      // Determine how to store phone/email based on the identifier format
      const isE164Phone = email.startsWith("+");         // new Phone Auth accounts
      const isOldPhoneEmail = email.endsWith("@sanad.app"); // legacy fake-email accounts

      let storedPhone: string;
      let storedEmail: string;
      let fallbackName: string;

      if (isE164Phone) {
        storedPhone = email; // already E.164
        storedEmail = "";
        fallbackName = email;
      } else if (isOldPhoneEmail) {
        storedPhone = email.replace("@sanad.app", ""); // raw local number
        storedEmail = "";
        fallbackName = email.replace("@sanad.app", "");
      } else {
        storedPhone = extraData?.phone ?? "";
        storedEmail = email;
        fallbackName = email.split("@")[0];
      }

      const displayName = extraData?.name?.trim() || fallbackName;
      const isPhoneAccount = isE164Phone || isOldPhoneEmail;
      const specialty = extraData?.specialty ?? null;
      await setDoc(
        ref,
        {
          name: displayName,
          email: storedEmail,
          role,
          balance: 0,
          phone: storedPhone,
          phoneNumber: isPhoneAccount ? storedPhone : "",
          isPhoneVerified: isPhoneAccount,
          photoUri: null,
          location: extraData?.location ?? null,
          specialty,
          // Derived fields for listings/filtering (artisans only)
          category: specialty && specialty !== "client"
            ? getCategoryForSpecialty(specialty)
            : null,
          isAvailable: role === "artisan",
          rating: 0,
          reviewCount: 0,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      const updates: Record<string, any> = {};
      if (extraData?.location !== undefined) updates.location = extraData.location;
      if (extraData?.specialty) updates.specialty = extraData.specialty;
      if (extraData?.name?.trim()) updates.name = extraData.name.trim();
      if (extraData?.phone) updates.phone = extraData.phone;
      if (Object.keys(updates).length > 0) {
        await updateDoc(ref, updates);
      }
    }
  } catch (err) {
    console.error("ensureUserDocument error:", err);
  }
};
