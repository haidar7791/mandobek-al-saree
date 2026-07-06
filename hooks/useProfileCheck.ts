import { useEffect, useState } from "react";
import { onSnapshot, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserProfile } from "@/lib/db_logic";

export type MissingProfileField = "phone" | "photo" | "bio" | "portfolio";

export interface ProfileCheckResult {
  profile: UserProfile | null;
  missingFields: MissingProfileField[];
  isComplete: boolean;
  loading: boolean;
  completionPercent: number;
  isPhoneOk: boolean;
}

const MIN_BIO_LENGTH = 10;
const MIN_PORTFOLIO_IMAGES = 3;

/**
 * Live-tracks the current user's profile document (users/{userId}) and reports
 * which fields still need to be completed, so the UI can gently nudge the user
 * instead of blocking navigation.
 *
 * Fields checked (matching the real Firestore schema in `users/{userId}`):
 * `phone` + `isPhoneVerified`, `photoUri`, `bio` (>=10 chars), `portfolio` (array, >=3 images).
 */
export function useProfileCheck(userId: string | null | undefined): ProfileCheckResult {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(
      doc(db, "users", userId),
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        setLoading(false);
      },
      (err) => {
        console.error("useProfileCheck onSnapshot error:", err);
        setLoading(false);
      }
    );

    return unsub;
  }, [userId]);

  const missingFields: MissingProfileField[] = [];
  let completionPercent = 0;
  let isPhoneOk = false;

  if (profile) {
    isPhoneOk = !!profile.phone && profile.isPhoneVerified === true;
    const isPhotoOk = !!profile.photoUri;
    const isBioOk = !!profile.bio && profile.bio.trim().length >= MIN_BIO_LENGTH;
    const isPortfolioOk = !!profile.portfolio && profile.portfolio.length >= MIN_PORTFOLIO_IMAGES;

    if (!isPhoneOk) missingFields.push("phone");
    if (!isPhotoOk) missingFields.push("photo");
    if (!isBioOk) missingFields.push("bio");
    if (!isPortfolioOk) missingFields.push("portfolio");

    completionPercent =
      (isPhoneOk ? 25 : 0) +
      (isPhotoOk ? 25 : 0) +
      (isBioOk ? 25 : 0) +
      (isPortfolioOk ? 25 : 0);
  }

  return {
    profile,
    missingFields,
    isComplete: profile !== null && missingFields.length === 0,
    loading,
    completionPercent,
    isPhoneOk,
  };
}
