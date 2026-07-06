---
name: Firestore persistent cache on React Native
description: Why persistentLocalCache/IndexedDB-based Firestore caching only works on web, not native RN
---

Firebase JS SDK's `persistentLocalCache` (with `persistentMultipleTabManager`) relies on IndexedDB, which does not exist in the React Native JS engine (Hermes/JSC). Calling `initializeFirestore` with `persistentLocalCache` on native throws or silently no-ops.

**Why:** The project uses the `firebase` web SDK (not `@react-native-firebase`, which has real native offline persistence). Attempting persistent cache unconditionally breaks native builds.

**How to apply:** Guard Firestore initialization on `Platform.OS === "web"` — use `initializeFirestore` + `persistentLocalCache` only for web, and plain `getFirestore(app)` for iOS/Android. If true offline persistence is required on native, that means migrating to `@react-native-firebase/firestore`, which is a larger, separate effort.
