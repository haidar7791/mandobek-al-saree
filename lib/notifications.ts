import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "./firebase";

export type ActivityNotificationType =
  | "like"
  | "follow"
  | "comment"
  | "share"
  | "purchase";

export type ActivityNotification = {
  id: string;
  recipientId: string;
  actorId: string;
  actorName: string;
  actorPhotoUri?: string | null;
  type: ActivityNotificationType;
  title: string;
  body: string;
  entityId?: string;
  entityType?: "post" | "product" | "story" | "profile" | "order" | "service";
  read: boolean;
  createdAt: string;
};

const toIsoString = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  return new Date(0).toISOString();
};

const toNotification = (id: string, data: DocumentData): ActivityNotification => ({
  id,
  recipientId: String(data.recipientId || ""),
  actorId: String(data.actorId || ""),
  actorName: String(data.actorName || "مستخدم فورس"),
  actorPhotoUri: data.actorPhotoUri || null,
  type: data.type as ActivityNotificationType,
  title: String(data.title || "نشاط جديد"),
  body: String(data.body || ""),
  entityId: data.entityId ? String(data.entityId) : undefined,
  entityType: data.entityType,
  read: data.read === true,
  createdAt: toIsoString(data.createdAt),
});

export const createActivityNotification = async (input: {
  recipientId: string;
  actorId?: string;
  type: ActivityNotificationType;
  title: string;
  body: string;
  entityId?: string;
  entityType?: ActivityNotification["entityType"];
}): Promise<void> => {
  const actorId = input.actorId || auth.currentUser?.uid || "";
  if (!input.recipientId || !actorId || input.recipientId === actorId) return;

  try {
    const actorSnap = await getDoc(doc(db, "users", actorId));
    const actor = actorSnap.exists() ? actorSnap.data() : {};
    await addDoc(collection(db, "notifications"), {
      recipientId: input.recipientId,
      actorId,
      actorName: String(actor.name || auth.currentUser?.displayName || "مستخدم فورس"),
      actorPhotoUri: actor.photoUri || null,
      type: input.type,
      title: input.title,
      body: input.body,
      entityId: input.entityId || null,
      entityType: input.entityType || null,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    // Activity logging must never make the original like/order/follow fail.
    console.error("createActivityNotification error:", error);
  }
};

export const subscribeToNotifications = (
  userId: string,
  callback: (notifications: ActivityNotification[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe => {
  const q = query(collection(db, "notifications"), where("recipientId", "==", userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const notifications = snapshot.docs
        .map((item) => toNotification(item.id, item.data()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callback(notifications);
    },
    (error) => {
      console.error("subscribeToNotifications error:", error);
      onError?.(error);
    },
  );
};

export const markNotificationRead = async (notificationId: string): Promise<void> => {
  await updateDoc(doc(db, "notifications", notificationId), { read: true });
};

export const markAllNotificationsRead = async (userId: string): Promise<void> => {
  const snapshot = await getDocs(
    query(collection(db, "notifications"), where("recipientId", "==", userId)),
  );
  const unread = snapshot.docs.filter((item) => item.data().read !== true);
  if (!unread.length) return;

  for (let start = 0; start < unread.length; start += 500) {
    const batch = writeBatch(db);
    unread.slice(start, start + 500).forEach((item) => {
      batch.update(item.ref, { read: true });
    });
    await batch.commit();
  }
};