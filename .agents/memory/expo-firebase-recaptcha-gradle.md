---
name: expo-firebase-recaptcha breaks Android Gradle build
description: Why expo-firebase-recaptcha cannot be used for Firebase JS SDK phone auth on Android, and what replaces it.
---

`expo-firebase-recaptcha` (all published versions, including latest 2.3.1 as of 2026-06)
transitively depends on `expo-firebase-core@~6.0.0`, which breaks the Android Gradle build
in EAS builds. There is no version of the package that avoids this.

**Why:** `expo-firebase-core` conflicts with the project's native Firebase setup
(google-services.json-based, no `@react-native-firebase`), causing Gradle build failures.
Firebase JS SDK's `RecaptchaVerifier` (from `firebase/auth`) has no silent/automatic native
phone-auth path on React Native — unlike `@react-native-firebase`, it always requires a real
`ApplicationVerifier`, so simply omitting the verifier on native breaks phone auth
("حدث خطأ غير متوقع" style errors).

**How to apply:** use `components/RecaptchaWebViewVerifier.tsx` instead — it runs an invisible
Google reCAPTCHA challenge inside a `react-native-webview` WebView (loading Firebase Auth
compat SDK from CDN, bound to this Firebase project's config/site key) and returns a one-time
token wrapped as `{ type: "recaptcha", verify: () => Promise<string> }`, which can be passed
directly to `linkWithPhoneNumber`/`signInWithPhoneNumber`. This avoids any native module or
Gradle dependency. Do not reintroduce `expo-firebase-recaptcha` or `expo-firebase-core`.
