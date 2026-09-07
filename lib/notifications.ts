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

export type ActivityNotificationAction = "new" | "accepted" | "rejected";

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
  action?: ActivityNotificationAction;
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

const inferAction = (
  value: unknown,
  title: string,
): ActivityNotificationAction | undefined => {
  if (value === "new" || value === "accepted" || value === "rejected") {
    return value;
  }
  if (title.startsWith("تم قبول")) return "accepted";
  if (title.startsWith("تم رفض")) return "rejected";
  return undefined;
};

const formatNotificationBody = ({
  type,
  entityType,
  actorName,
  action,
  fallback,
}: {
  type: ActivityNotificationType;
  entityType?: ActivityNotification["entityType"];
  actorName: string;
  action?: ActivityNotificationAction;
  fallback: string;
}): string => {
  const name = actorName.trim();
  if (!name) return fallback;

  if (type === "like") {
    const target =
      entityType === "product"
        ? "منتجك"
        : entityType === "story"
          ? "قصتك"
          : "منشورك";
    return `${name} أعجب بـ ${target}`;
  }
  if (type === "follow") return `${name} قام بمتابعتك`;
  if (type === "comment") return `${name} قام بالتعليق على منشورك`;

  if (type === "purchase") {
    const isService = entityType === "service";
    const subject = isService ? "طلب الخدمة" : "طلب الشراء";
    if (action === "accepted") return `تم قبول ${subject} من قبل ${name}`;
    if (action === "rejected") return `تم رفض ${subject} من قبل ${name}`;
    if (action === "new") {
      return `${name} أرسل طلب شراء ${isService ? "لخدمتك" : "لمنتجك"}`;
    }
  }

  return fallback;
};

const toNotification = (id: string, data: DocumentData): ActivityNotification => {
  const type = data.type as ActivityNotificationType;
  const title = String(data.title || "نشاط جديد");
  const actorName = String(data.actorName || "");
  const entityType = data.entityType as ActivityNotification["entityType"];
  const action = inferAction(data.action, title);
  return {
    id,
    recipientId: String(data.recipientId || ""),
    actorId: String(data.actorId || ""),
    actorName,
    actorPhotoUri: data.actorPhotoUri || null,
    type,
    title,
    body: formatNotificationBody({
      type,
      entityType,
      actorName,
      action,
      fallback: String(data.body || ""),
    }),
    entityId: data.entityId ? String(data.entityId) : undefined,
    entityType,
    action,
    read: data.read === true,
    createdAt: toIsoString(data.createdAt),
  };
};

export const createActivityNotification = async (input: {
  recipientId: string;
  actorId?: string;
  type: ActivityNotificationType;
  title: string;
  body: string;
  entityId?: string;
  entityType?: ActivityNotification["entityType"];
  action?: ActivityNotificationAction;
}): Promise<void> => {
  const actorId = input.actorId || auth.currentUser?.uid || "";
  if (!input.recipientId || !actorId || input.recipientId === actorId) return;

  try {
    const actorSnap = await getDoc(doc(db, "users", actorId));
    const actor = actorSnap.exists() ? actorSnap.data() : {};
    const actorName = String(
      actor.name ||
        actor.displayName ||
        auth.currentUser?.displayName ||
        auth.currentUser?.email?.split("@")[0] ||
        "",
    ).trim();
    await addDoc(collection(db, "notifications"), {
      recipientId: input.recipientId,
      actorId,
      actorName,
      actorPhotoUri: actor.photoUri || null,
      type: input.type,
      title: input.title,
      body: formatNotificationBody({
        type: input.type,
        entityType: input.entityType,
        actorName,
        action: input.action,
        fallback: input.body,
      }),
      entityId: input.entityId || null,
      entityType: input.entityType || null,
      action: input.action || null,
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