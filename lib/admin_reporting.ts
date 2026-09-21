import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, ref } from "firebase/storage";
import { auth, db, storage } from "./firebase";
import { ADMIN_UID } from "./db_logic";
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

  if (targetType !== "chat") {
    return uniqueIds([...explicitOwner, ...directOwners]);
  }

  const participants = Array.isArray(targetData?.participants) ? targetData.participants : [];
  const reporterId = typeof report.reporterId === "string" ? report.reporterId : "";
  return uniqueIds([
    ...explicitOwner,
    ...directOwners,
    ...participants.filter((participant) => participant !== ADMIN_UID && participant !== reporterId),
  ]).filter((id) => id !== ADMIN_UID);
}

async function getTargetSnapshot(report: AdminReport) {
  return getDoc(doc(db, report.targetCollection, report.targetId));
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
      } satisfies AdminReport];
    }).filter((report) => report.targetId.length > 0);

  const enriched = await Promise.all(
    reports.map(async (report) => {
      try {
        const targetSnapshot = await getTargetSnapshot(report);
        return {
          ...report,
          targetExists: targetSnapshot.exists(),
          targetOwnerIds: getOwnerIds(
            report.targetType,
            targetSnapshot.exists() ? (targetSnapshot.data() as Record<string, unknown>) : null,
            report as unknown as Record<string, unknown>
          ),
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

  if (report.targetType === "chat") {
    const messagesSnapshot = await getDocs(collection(db, "chats", report.targetId, "messages"));
    for (let index = 0; index < messagesSnapshot.docs.length; index += 500) {
      const batch = writeBatch(db);
      messagesSnapshot.docs.slice(index, index + 500).forEach((message) => batch.delete(message.ref));
      await batch.commit();
    }
    await deleteDoc(targetRef);
    return;
  }

  await deleteDoc(targetRef);

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

  await Promise.all(
    ownerIds.map((userId) =>
      setDoc(
        doc(db, "users", userId),
        {
          isBanned: true,
          bannedAt: serverTimestamp(),
          bannedBy: ADMIN_UID,
          banReason: report.reasonLabel || report.reason,
        },
        { merge: true }
      )
    )
  );

  return ownerIds;
}

export async function removeAdminReport(reportId: string): Promise<void> {
  assertAdmin();
  if (!reportId.trim()) throw new Error("REPORT_ID_REQUIRED");
  await deleteDoc(doc(db, "reports", reportId));
}