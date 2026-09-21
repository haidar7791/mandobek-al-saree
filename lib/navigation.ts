import { router } from "expo-router";
import { auth } from "./firebase";

/**
 * Open a child screen while keeping the current screen mounted underneath it.
 * This is important for feeds: returning from a profile/detail screen must
 * preserve the feed's scroll position and active media.
 */
export function navigateWithHomeBase(target: any): void {
  router.push(target);
}

/**
 * Pop the current screen when possible. Deep links and cold starts have no
 * parent route, so they fall back to Home instead of closing the app.
 */
export function goBack(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  // A protected screen opened from a cold start may have no parent entry.
  // Always keep the user inside the correct auth branch instead of allowing
  // the native back action to close the app or reveal the login route.
  router.replace((auth.currentUser ? "/dashboard" : "/") as any);
}

/**
 * Return to Home intentionally, for completed flows such as sign-out or
 * finishing story creation.
 */
export function goHome(): void {
  router.replace("/dashboard" as any);
}