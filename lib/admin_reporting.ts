import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { auth, db, storage } from "./firebase";
import { ADMIN_UID } from "./db_logic";
import { buildModerationNotificationData } from "./notifications";
import type { ReportTargetType } from "./reporting";

const TARGET_COLLECTIONS: Record<ReportTargetType, string> = {
  product: "products",
  post: "posts",
  story: "stories",
  chat: "chats",
};

export type AdminReport = {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: ReportTargetType;
  targetId: string;
  targetName?: string;
  targetOwnerId?: string;
  reason: string;
  reasonLabel: string;
  status: string;
  createdAt: unknown;
  targetCollection: string;
  targetExists: boolean;
  targetOwnerIds: string[];
  preview?: AdminReportPreview;
};

export type AdminReportMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  type?: string;
  mediaUrl?: string;
  createdAt: unknown;
  deleted?: boolean;
};

export type AdminReportPreview = {
  title?: string;
  text?: string;
  imageUrl?: string;
  mediaType?: "image" | "video";
  messages?: AdminReportMessage[];
};

function assertAdmin(): void {
  if (auth.currentUser?.uid !== ADMIN_UID) {
    throw new Error("ADMIN_REQUIRED");
  }
}

function isReportTargetType(value: unknown): value is ReportTargetType {
  return value === "product" || value === "post" || value === "story" || value === "chat";
}

function timestampMillis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }
  const parsed = new Date(String(value ?? "")).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueIds(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function getOwnerIds(
  targetType: ReportTargetType,
  targetData: Record<string, unknown> | null,
  report: Record<string, unknown>
): string[] {
  const explicitOwner = typeof report.targetOwnerId === "string" ? [report.targetOwnerId] : [];
  const directOwners = [
    targetData?.userId,
    targetData?.ownerId,
    targetData?.authorId,
    targetData?.createdBy,
    targetData?.sellerId,
    targetData?.senderId,
  ];
  const reportOwnerIds = Array.isArray(report.targetOwnerIds) ? report.targetOwnerIds : [];

  if (targetType !== "chat") {
    return uniqueIds([...explicitOwner, ...reportOwnerIds, ...directOwners]);
  }

  const participants = Array.isArray(targetData?.participants) ? targetData.participants : [];
  const reporterId = typeof report.reporterId === "string" ? report.reporterId : "";
  return uniqueIds([
    ...explicitOwner,
    ...reportOwnerIds,
    ...directOwners,
    ...participants.filter((participant) => participant !== ADMIN_UID && participant !== reporterId),
  ]).filter((id) => id !== ADMIN_UID);
}

async function getTargetSnapshot(report: AdminReport) {
  return getDoc(doc(db, report.targetCollection, report.targetId));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getPreviewImage(targetData: Record<string, unknown>): string {
  const media = Array.isArray(targetData.media) ? targetData.media : [];
  const imageMedia = media.find(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as Record<string, unknown>).type === "image",
  );
  const mediaUrl =
    imageMedia && typeof imageMedia === "object"
      ? stringValue((imageMedia as Record<string, unknown>).url)
      : "";

  return (
    stringValue(targetData.thumbnailUrl) ||
    stringValue(targetData.imageUrl) ||
    mediaUrl ||
    (targetData.mediaType !== "video" ? stringValue(targetData.mediaUrl) : "") ||
    (targetData.mediaType !== "video" ? stringValue(targetData.url) : "")
  );
}

function getContentPreview(
  targetType: ReportTargetType,
  targetData: Record<string, unknown>,
  report: AdminReport,
): AdminReportPreview {
  if (targetType === "product") {
    return {
      title: stringValue(targetData.title) || report.targetName || report.targetId,
      text: stringValue(targetData.description),
      imageUrl: getPreviewImage(targetData),
      mediaType: targetData.mediaType === "video" ? "video" : "image",
    };
  }

  if (targetType === "story") {
    return {
      text: stringValue(targetData.text),
      imageUrl: getPreviewImage({
        ...targetData,
        mediaUrl: targetData.mediaUrl,
        mediaType: targetData.mediaType,
      }),
      mediaType: targetData.mediaType === "video" ? "video" : "image",
    };
  }

  return {
    text:
      stringValue(targetData.description) ||
      stringValue(targetData.caption) ||
      stringValue(targetData.text),
    imageUrl: getPreviewImage(targetData),
    mediaType: targetData.mediaType === "video" ? "video" : "image",
  };
}

async function getChatPreview(chatId: string): Promise<AdminReportMessage[]> {
  const mapMessage = (message: { id: string; data: () => Record<string, unknown> }): AdminReportMessage => {
    const data = message.data();
    return {
      id: message.id,
      senderId: stringValue(data.senderId),
      senderName: stringValue(data.senderName) || "مستخدم",
      text: stringValue(data.text),
      type: stringValue(data.type) || undefined,
      mediaUrl: stringValue(data.mediaUrl) || undefined,
      createdAt: data.createdAt,
      deleted: data.deleted === true,
    };
  };

  try {
    const snapshot = await getDocs(
      query(
        collection(db, "chats", chatId, "messages"),
        orderBy("createdAt", "desc"),
        limit(5),
      ),
    );
    return snapshot.docs.reverse().map(mapMessage);
  } catch (error) {
    try {
      const snapshot = await getDocs(collection(db, "chats", chatId, "messages"));
      return snapshot.docs
        .map(mapMessage)
        .sort((a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt))
        .slice(-5);
    } catch (fallbackError) {
      console.error("get reported chat preview failed:", error, fallbackError);
      return [];
    }
  }
}

export async function getAdminReports(): Promise<AdminReport[]> {
  assertAdmin();
  const snapshot = await getDocs(collection(db, "reports"));
  const reports: AdminReport[] = snapshot.docs.flatMap((reportDoc) => {
      const data = reportDoc.data();
      if (!isReportTargetType(data.targetType)) return [];
      return [{
        id: reportDoc.id,
        reporterId: String(data.reporterId ?? ""),
        reporterName: String(data.reporterName ?? "مستخدم"),
        targetType: data.targetType,
        targetId: String(data.targetId ?? ""),
        targetName: typeof data.targetName === "string" ? data.targetName : undefined,
        targetOwnerId: typeof data.targetOwnerId === "string" ? data.targetOwnerId : undefined,
        reason: String(data.reason ?? ""),
        reasonLabel: String(data.reasonLabel ?? data.reason ?? ""),
        status: String(data.status ?? "open"),
        createdAt: data.createdAt,
        targetCollection: TARGET_COLLECTIONS[data.targetType],
        targetExists: false,
        targetOwnerIds: [],
        preview: undefined,
      } satisfies AdminReport];
    }).filter((report) => report.targetId.length > 0);

  const enriched = await Promise.all(
    reports.map(async (report) => {
      try {
        const targetSnapshot = await getTargetSnapshot(report);
        const targetData = targetSnapshot.exists()
          ? (targetSnapshot.data() as Record<string, unknown>)
          : null;
        const preview = targetData
          ? report.targetType === "chat"
            ? { messages: await getChatPreview(report.targetId) }
            : getContentPreview(report.targetType, targetData, report)
          : undefined;
        return {
          ...report,
          targetExists: targetSnapshot.exists(),
          targetOwnerIds: getOwnerIds(
            report.targetType,
            targetData,
            report as unknown as Record<string, unknown>
          ),
          preview,
        };
      } catch {
        return report;
      }
    })
  );

  return enriched.sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
}

export async function deleteReportedContent(report: AdminReport): Promise<void> {
  assertAdmin();
  const targetRef = doc(db, report.targetCollection, report.targetId);
  const targetSnapshot = await getTargetSnapshot(report);
  if (!targetSnapshot.exists()) return;

  const targetData = targetSnapshot.data() as Record<string, unknown>;
  const ownerIds = getOwnerIds(
    report.targetType,
    targetData,
    report as unknown as Record<string, unknown>,
  ).filter((userId) => userId !== ADMIN_UID);
  const notificationBody =
    "تنبيه إداري: تم حذف محتواك لانتهاكه معايير وقواعد استخدام التطبيق (مثل سياسة سلامة الأطفال أو شروط النشر). يرجى الالتزام بالشروط لتجنب حظر حسابك نهائياً";

  if (report.targetType === "chat") {
    const messagesSnapshot = await getDocs(collection(db, "chats", report.targetId, "messages"));
    for (let index = 0; index < messagesSnapshot.docs.length; index += 500) {
      const batch = writeBatch(db);
      messagesSnapshot.docs.slice(index, index + 500).forEach((message) => batch.delete(message.ref));
      await batch.commit();
    }
    const batch = writeBatch(db);
    batch.delete(targetRef);
    ownerIds.forEach((userId) => {
      batch.set(
        doc(collection(db, "notifications")),
        buildModerationNotificationData({
          recipientId: userId,
          title: "تنبيه بشأن المحتوى",
          body: notificationBody,
          entityId: report.targetId,
          entityType: report.targetType,
        }),
      );
    });
    await batch.commit();
    return;
  }

  const deleteBatch = writeBatch(db);
  deleteBatch.delete(targetRef);
  ownerIds.forEach((userId) => {
    deleteBatch.set(
      doc(collection(db, "notifications")),
      buildModerationNotificationData({
        recipientId: userId,
        title: "تنبيه بشأن المحتوى",
        body: notificationBody,
        entityId: report.targetId,
        entityType: report.targetType,
      }),
    );
  });
  await deleteBatch.commit();

  if (report.targetType === "post") {
    const ownerId = getOwnerIds(report.targetType, targetData, report as unknown as Record<string, unknown>)[0];
    const mediaUrl = typeof targetData.url === "string" ? targetData.url : "";
    if (ownerId) {
      const profileRef = doc(db, "users", ownerId);
      const profileSnapshot = await getDoc(profileRef);
      const profilePosts = profileSnapshot.data()?.profilePosts;
      if (Array.isArray(profilePosts)) {
        const matchingPost = profilePosts.find(
          (post) =>
            post &&
            typeof post === "object" &&
            ((post as Record<string, unknown>).id === report.targetId ||
              (post as Record<string, unknown>).id === targetData.postId ||
              (mediaUrl && (post as Record<string, unknown>).url === mediaUrl))
        );
        if (matchingPost) {
          await setDoc(profileRef, { profilePosts: arrayRemove(matchingPost) }, { merge: true });
        }
      }
    }
  }

  const storagePath = typeof targetData.storagePath === "string" ? targetData.storagePath : "";
  const mediaUrl =
    typeof targetData.mediaUrl === "string"
      ? targetData.mediaUrl
      : typeof targetData.url === "string"
        ? targetData.url
        : "";
  if (storagePath || mediaUrl) {
    await deleteObject(ref(storage, storagePath || mediaUrl)).catch(() => undefined);
  }
}

export async function banReportedContentOwners(report: AdminReport): Promise<string[]> {
  assertAdmin();
  const targetSnapshot = await getTargetSnapshot(report);
  const targetData = targetSnapshot.exists()
    ? (targetSnapshot.data() as Record<string, unknown>)
    : null;
  const ownerIds = getOwnerIds(
    report.targetType,
    targetData,
    report as unknown as Record<string, unknown>
  ).filter((userId) => userId !== ADMIN_UID);

  if (ownerIds.length === 0) {
    throw new Error("REPORT_OWNER_NOT_FOUND");
  }

  const batch = writeBatch(db);
  ownerIds.forEach((userId) => {
    batch.set(
      doc(db, "users", userId),
      {
        isBanned: true,
        bannedAt: serverTimestamp(),
        bannedBy: ADMIN_UID,
        banReason: report.reasonLabel || report.reason,
      },
      { merge: true },
    );
    batch.set(
      doc(collection(db, "notifications")),
      buildModerationNotificationData({
        recipientId: userId,
        title: "تنبيه إداري",
        body: "تنبيه إداري: تم حظر حسابك نهائياً لمخالفتك معايير وقواعد استخدام التطبيق.",
        entityId: report.targetId,
        entityType: report.targetType,
      }),
    );
  });
  await batch.commit();

  return ownerIds;
}

export async function removeAdminReport(reportId: string): Promise<void> {
  assertAdmin();
  if (!reportId.trim()) throw new Error("REPORT_ID_REQUIRED");
  await deleteDoc(doc(db, "reports", reportId));
}