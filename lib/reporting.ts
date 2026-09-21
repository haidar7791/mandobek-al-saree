import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase";

export type ReportTargetType = "product" | "post" | "story" | "chat";

export const REPORT_REASONS = [
  {
    value: "inappropriate",
    label: "محتوى غير لائق",
    description: "محتوى مسيء أو مخالف للآداب العامة",
  },
  {
    value: "violence",
    label: "عنف أو تهديد",
    description: "محتوى يروّج للعنف أو يتضمن تهديداً",
  },
  {
    value: "child_exploitation",
    label: "استغلال الأطفال",
    description: "أي محتوى يعرّض الأطفال للخطر أو يستغلهم",
  },
  {
    value: "harassment",
    label: "تنمّر أو مضايقة",
    description: "إساءة أو مضايقة أو كراهية",
  },
  {
    value: "spam_scam",
    label: "احتيال أو محتوى مزعج",
    description: "إعلانات مضللة أو محاولات احتيال",
  },
  {
    value: "other",
    label: "سبب آخر",
    description: "سبب لا يندرج ضمن الخيارات السابقة",
  },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

type SubmitReportInput = {
  targetType: ReportTargetType;
  targetId: string;
  targetName?: string;
  targetOwnerId?: string;
  reason: ReportReason;
  reasonLabel: string;
};

export async function submitReport({
  targetType,
  targetId,
  targetName,
  targetOwnerId,
  reason,
  reasonLabel,
}: SubmitReportInput): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("REPORT_AUTH_REQUIRED");
  }

  const cleanTargetId = targetId.trim();
  if (!cleanTargetId) {
    throw new Error("REPORT_TARGET_REQUIRED");
  }

  let reporterName = user.displayName?.trim() ?? "";

  if (!reporterName) {
    try {
      const profileSnapshot = await getDoc(doc(db, "users", user.uid));
      reporterName = (profileSnapshot.data()?.name as string | undefined)?.trim() ?? "";
    } catch {
      // Fall back to the Firebase account identity below if the profile is unavailable.
    }
  }

  if (!reporterName) {
    reporterName = user.email?.split("@")[0]?.trim() || "مستخدم";
  }

  await addDoc(collection(db, "reports"), {
    reporterId: user.uid,
    reporterName,
    targetType,
    targetId: cleanTargetId,
    ...(targetName?.trim() ? { targetName: targetName.trim() } : {}),
    ...(targetOwnerId?.trim() ? { targetOwnerId: targetOwnerId.trim() } : {}),
    reason,
    reasonLabel,
    status: "open",
    createdAt: serverTimestamp(),
  });
}