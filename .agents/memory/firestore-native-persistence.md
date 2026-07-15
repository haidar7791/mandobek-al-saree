---
name: Firestore offline persistence on React Native (Expo, firebase JS SDK)
description: Why persistentLocalCache only helps on web in this project, and what to do instead on iOS/Android
---

The Firestore JS SDK's `persistentLocalCache` (disk-backed offline cache) requires
`indexedDB`, which only exists in browser environments. Expo/React Native (Hermes)
has no IndexedDB and no polyfill installed in this project, so `initializeFirestore`
is only given `persistentLocalCache` on `Platform.OS === "web"`; native falls back to
Firestore's default in-memory cache (session-only, cleared on app restart).

**Why:** requesting real disk persistence on native would require either migrating to
`@react-native-firebase/firestore` (native SDK, different API) or adding an IndexedDB
polyfill backed by AsyncStorage/SQLite — both are large, risky changes out of scope for
a perf tweak.

**How to apply:** when asked to "speed up" a screen on native via Firestore caching,
don't chase native disk persistence — it's not realistically available with the current
stack. Instead: pass already-fetched data forward via nav params for instant paint, and
let detail data (reviews, etc.) refresh in the background. This was applied to the
artisan profile screen (`app/artisan-profile.tsx`), fed from `app/dashboard.tsx` cards.
