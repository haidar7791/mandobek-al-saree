import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { setUserPushToken, clearUserPushToken } from "./db_logic";

let configured = false;

// Background task: lets Android deliver/process remote pushes while the app is
// backgrounded or fully killed (swiped away). Registering it is what makes the
// system show the notification (and keep the data payload available for the
// tap handler) even when no JS is running — the same mechanism WhatsApp relies
// on for its background push delivery on Android.
export const BACKGROUND_NOTIFICATION_TASK = "BACKGROUND_NOTIFICATION_TASK";

if (!TaskManager.isTaskDefined(BACKGROUND_NOTIFICATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error) {
      console.error("BACKGROUND_NOTIFICATION_TASK error:", error);
      return;
    }
    // No extra work needed here — expo-notifications + FCM/APNs already display
    // the system notification. This task's job is simply to exist and be
    // registered so Android keeps the app process alive long enough to do so
    // when the app was killed.
  });
}

function configureHandler() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  if (Platform.OS === "android") {
    Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((err) => {
      console.error("registerTaskAsync(BACKGROUND_NOTIFICATION_TASK) failed:", err);
    });
  }
}

export function configurePushHandler() {
  configureHandler();
}

export async function registerForPushNotifications(
  userId: string
): Promise<string | null> {
  configureHandler();

  if (Platform.OS === "web") return null;
  if (!Device.isDevice) {
    // Simulators/emulators can't get a real Expo push token
    return null;
  }

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "تنبيهات فورس",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#C9A84C",
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return null;

    const projectId =
      (Constants?.expoConfig as any)?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenData.data;
    if (token) {
      await setUserPushToken(userId, token);
    }
    return token;
  } catch (err) {
    console.error("registerForPushNotifications failed:", err);
    return null;
  }
}

// Clears the account's push token in Firestore *before* signing out, so a
// device that just logged out never receives notifications meant for the
// account that just left it. Firestore rules require request.auth.uid to
// match the doc being written, so the clear must happen before signOut().
export async function performSignOut(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      await clearUserPushToken(uid);
    } catch (err) {
      console.error("clearUserPushToken failed:", err);
    }
  }
  await signOut(auth);
}

export function addNotificationTapListener(
  handler: (data: Record<string, any>) => void
) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data || {};
    handler(data as Record<string, any>);
  });
}
