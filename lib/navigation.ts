import { router } from "expo-router";

/**
 * Opens a screen with a clean authenticated navigation base.
 *
 * dismissAll() returns to the first screen in the protected stack (Home).
 * Pushing the destination after that leaves exactly one Home screen below it,
 * so Back never walks through stale search/profile/detail screens.
 */
export function navigateWithHomeBase(target: any): void {
  router.dismissAll();
  router.push(target);
}

/**
 * Return to the single Home root without replaying the previous stack.
 */
export function goHome(): void {
  router.dismissAll();
}