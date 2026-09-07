import { Platform } from "react-native";

let configured = false;

export interface GoogleAccountSelection {
  email: string;
  idToken: string | null;
}

/**
 * Opens the native Google account chooser and returns only the selected email.
 *
 * Google is used only as an email/account picker.
 * The selected email is returned to the existing email/password
 * authentication system.
 *
 * IMPORTANT:
 * The Google Sign-In native module is loaded dynamically.
 * This allows the application to open normally in Expo Go.
 * The Google button itself requires a Development Build because
 * Expo Go does not contain RNGoogleSignin.
 */
export async function pickGoogleEmail(): Promise<GoogleAccountSelection | null> {
  if (Platform.OS !== "android") {
    throw new Error(
      "اختيار حساب Google متاح حالياً على أجهزة Android فقط"
    );
  }

  /**
   * Load Google Sign-In only when the Google button is actually used.
   *
   * This prevents Expo Go from trying to load RNGoogleSignin
    * while opening the auth screen.
   */
  let GoogleSignin: any;
  let isSuccessResponse: any;

  try {
    const GoogleSignInModule = require(
      "@react-native-google-signin/google-signin"
    );

    GoogleSignin = GoogleSignInModule.GoogleSignin;
    isSuccessResponse = GoogleSignInModule.isSuccessResponse;
  } catch (error) {
    throw new Error(
      "ميزة اختيار حساب Google تحتاج إلى Development Build وليست متاحة داخل Expo Go"
    );
  }

  if (!GoogleSignin) {
    throw new Error(
      "Google Sign-In native module غير متوفر. قم بتشغيل التطبيق باستخدام Development Build."
    );
  }

  if (!configured) {
    GoogleSignin.configure({
      scopes: ["email", "profile"],
      webClientId: "911663879269-006njooa5njderg7o05sju4bvtqaq3t7.apps.googleusercontent.com",
      offlineAccess: false,
    });

    configured = true;
  }

  try {
    await GoogleSignin.hasPlayServices({
      showPlayServicesUpdateDialog: true,
    });

    /**
     * Clear any previous Google session.
     * This makes the account chooser appear again.
     */
    await GoogleSignin.signOut().catch(() => {});

    const response = await GoogleSignin.signIn();

    if (!isSuccessResponse(response)) {
      return null;
    }

    const email = response.data?.user?.email
      ?.trim()
      .toLowerCase();

    return email
      ? { email, idToken: response.data?.idToken ?? null }
      : null;
  } finally {
    /**
     * Google is only being used as an email picker.
     * We don't keep the Google account signed in.
     */
    await GoogleSignin.signOut().catch(() => {});
  }
}
