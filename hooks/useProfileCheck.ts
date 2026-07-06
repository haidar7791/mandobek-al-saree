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
}

const MIN_BIO_LENGTH = 10;
const MIN_PORTFOLIO_IMAGES = 3;

/**
 * Live-tracks the current user's profile document (users/{userId}) and reports
 * which fields still need to be completed, so the UI can gently nudge the user
 * instead of blocking navigation.
 *
 * Field mapping note: the app's existing schema uses `phone` / `photoUri` /
 * `professionalBio` / `portfolio_images`. `isPhoneVerified` is a new optional
 * field (defaults to unverified when absent) layered on top of the existing `phone`.
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

  if (profile) {
    const isPhoneVerified = (profile as any).isPhoneVerified === true;
    if (!profile.phone || !isPhoneVerified) missingFields.push("phone");
    if (!profile.photoUri) missingFields.push("photo");
    if (!profile.professionalBio || profile.professionalBio.trim().length < MIN_BIO_LENGTH) {
      missingFields.push("bio");
    }
    if (!profile.portfolio_images || profile.portfolio_images.length < MIN_PORTFOLIO_IMAGES) {
      missingFields.push("portfolio");
    }
  }

  return {
    profile,
    missingFields,
    isComplete: profile !== null && missingFields.length === 0,
    loading,
  };
}
