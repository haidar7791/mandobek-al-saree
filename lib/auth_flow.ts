/**
 * Short-lived guard used only while Firebase Phone Auth verifies a password
 * reset code. Phone verification signs the user in before the new password is
 * entered; suspending the root auth redirect keeps the reset modal mounted.
 */
let authRoutingSuspended = false;

export function suspendAuthRouting(): void {
  authRoutingSuspended = true;
}

export function resumeAuthRouting(): void {
  authRoutingSuspended = false;
}

export function isAuthRoutingSuspended(): boolean {
  return authRoutingSuspended;
}