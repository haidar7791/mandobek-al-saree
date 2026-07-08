import { Platform } from "react-native";
import { ref, onValue, onDisconnect, set, serverTimestamp, off } from "firebase/database";
import { rtdb } from "./firebase";

let activeUserId: string | null = null;
let activeConnectedRef: ReturnType<typeof ref> | null = null;

/**
 * Binds a user's device connection state to Firebase Realtime Database.
 * While connected, presence/{userId} = { state: "online", lastChanged }.
 * If the client disconnects unexpectedly (network loss, app killed, etc.),
 * the RTDB server itself flips it to "offline" via onDisconnect — no
 * client-side "goodbye" call is required.
 */
export function setupPresence(userId: string): () => void {
  if (Platform.OS === "web" && typeof window === "undefined") {
    return () => {};
  }

  activeUserId = userId;
  const userStatusRef = ref(rtdb, `presence/${userId}`);
  const connectedRef = ref(rtdb, ".info/connected");
  activeConnectedRef = connectedRef;

  const unsub = onValue(connectedRef, (snap) => {
    if (snap.val() === false) return;

    // On genuine disconnect (network drop, app kill), RTDB will apply this write.
    onDisconnect(userStatusRef)
      .set({ state: "offline", lastChanged: serverTimestamp() })
      .then(() => {
        set(userStatusRef, { state: "online", lastChanged: serverTimestamp() });
      });
  });

  return () => {
    unsub();
    off(connectedRef);
    if (activeUserId === userId) {
      set(userStatusRef, { state: "offline", lastChanged: serverTimestamp() }).catch(() => {});
      activeUserId = null;
    }
  };
}

/**
 * Subscribe to another user's presence in real-time.
 * Calls back with { state, lastChanged } or null if no data.
 * Returns an unsubscribe function.
 */
export function subscribeToPresence(
  userId: string,
  callback: (presence: { state: "online" | "offline"; lastChanged: any } | null) => void
): () => void {
  const userStatusRef = ref(rtdb, `presence/${userId}`);
  const unsub = onValue(userStatusRef, (snap) => {
    if (!snap.exists()) {
      callback(null);
    } else {
      callback(snap.val() as { state: "online" | "offline"; lastChanged: any });
    }
  });
  return () => {
    unsub();
    off(userStatusRef);
  };
}

/** Explicitly mark the current user offline (e.g. on manual sign-out). */
export async function markOffline(userId: string): Promise<void> {
  try {
    await set(ref(rtdb, `presence/${userId}`), {
      state: "offline",
      lastChanged: serverTimestamp(),
    });
  } catch (err) {
    console.error("markOffline failed:", err);
  }
}
