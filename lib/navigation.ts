import { router } from "expo-router";

/**
 * Opens a screen without adding another stale screen to the stack.
 *
 * The previous stack-pop approach was not handled reliably by the protected
 * Expo Router stack, so use replace instead. Replacing keeps the current
 * stack bounded and avoids replaying search/profile/detail screens.
 */
export function navigateWithHomeBase(target: any): void {
  router.replace(target);
}

/**
 * Return to Home without dispatching an unsupported stack-pop action.
 */
export function goHome(): void {
  router.replace("/dashboard" as any);
}