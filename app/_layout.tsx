import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import React, { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import { queryClient } from "@/lib/query-client";
import { BackHandler, I18nManager, Linking, Modal, Pressable, Text, View } from "react-native";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { configurePushHandler, registerForPushNotifications } from "@/lib/push_notifications";
import { NetworkProvider } from "@/lib/network";
import { VideoAudioProvider } from "@/lib/video-audio-context";
import { setupPresence } from "@/lib/presence";
import { useArtisanLocationTracking } from "@/hooks/useArtisanLocationTracking";
import { isAuthRoutingSuspended } from "@/lib/auth_flow";
import { KeyboardProvider } from "react-native-keyboard-controller";
import * as Application from "expo-application";
import { compareVersions, getMinimumRequiredVersion } from "@/lib/remote_config";
import { goBack, navigateWithHomeBase } from "@/lib/navigation";

SplashScreen.preventAutoHideAsync();

I18nManager.forceRTL(true);

// Auth-gated routing: the single logged-out auth screen (index) and the
// "logged in" group (dashboard and everything behind it) are mounted
// exclusively via Stack.Protected. When isLoggedIn flips, expo-router
// unmounts the inactive group entirely — its screens are wiped from the
// navigation history, not just covered by the new screen. That's what stops
// the hardware back button from ever revealing the login screen again once
// signed in, and (symmetrically) from revealing authenticated screens after
// sign-out.
function RootLayoutNav({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!isLoggedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="reset-password" />
      </Stack.Protected>

      <Stack.Protected guard={isLoggedIn}>
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="admin-dashboard" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="restaurant-manager" />
        <Stack.Screen name="wallet" />
        <Stack.Screen name="artisan-profile" />
        <Stack.Screen name="user-profile" />
        <Stack.Screen name="product/[id]" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="messages" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="reservations" />
        <Stack.Screen name="active-order" />
        <Stack.Screen name="support" />
        <Stack.Screen name="promote" />
        <Stack.Screen name="story-creator" />
        <Stack.Screen name="story-viewer" />
        <Stack.Screen name="add-product" />
        <Stack.Screen name="group-details" />
        <Stack.Screen name="group-media" />
        <Stack.Screen name="group-members" />
        <Stack.Screen name="product-orders" />
        <Stack.Screen name="search" />
        <Stack.Screen name="user-search" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsReady, setFontsReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [accountStatusChecked, setAccountStatusChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const pendingDeepLink = useRef<string | null>(null);
  const handledDeepLink = useRef<string | null>(null);
  // Catches async errors from Firebase / network that can't be caught by the
  // class-based ErrorBoundary (which only intercepts render-phase throws).
  const [fatalError, setFatalError] = useState<Error | null>(null);
  const [forceUpdateRequired, setForceUpdateRequired] = useState(false);

  // Automatic artisan location tracking: no-op for client accounts, kicks in
  // silently for artisan accounts as soon as they're signed in.
  useArtisanLocationTracking(uid);

  // Expo Router handles normal stack pops, but Android dispatches the
  // hardware back event before a screen is always able to render its own
  // header action. Keep the event inside the app and use the same fallback
  // policy as every in-app back button.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        goBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    try {
      configurePushHandler();
    } catch {}
  }, []);

  useEffect(() => {
    if (!uid) return;
    const unsubscribe = onSnapshot(
      doc(db, "users", uid),
      (profileSnapshot) => {
        if (profileSnapshot.data()?.isBanned === true) {
          void signOut(auth);
        }
      },
      () => {
        // The initial auth check remains the source of truth when a profile
        // read is temporarily unavailable.
      }
    );
    return unsubscribe;
  }, [uid]);

  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          Cairo_400Regular: require("@expo-google-fonts/cairo/400Regular/Cairo_400Regular.ttf"),
          Cairo_600SemiBold: require("@expo-google-fonts/cairo/600SemiBold/Cairo_600SemiBold.ttf"),
          Cairo_700Bold: require("@expo-google-fonts/cairo/700Bold/Cairo_700Bold.ttf"),
        });
      } catch {}
      setFontsReady(true);
    }
    loadFonts();
  }, []);

  // Firebase Remote Config: enforce the minimum app version without changing
  // authentication or navigation logic. A failed fetch is non-blocking.
  useEffect(() => {
    let cancelled = false;
    getMinimumRequiredVersion().then((requiredVersion) => {
      if (cancelled) return;
      const currentVersion = Application.nativeApplicationVersion || "0";
      if (compareVersions(currentVersion, requiredVersion) < 0) {
        setForceUpdateRequired(true);
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let presenceCleanup: (() => void) | null = null;
    let unsub: (() => void) | null = null;
    let accountCheckId = 0;

    const activateAccount = (user: NonNullable<typeof auth.currentUser>) => {
      setIsLoggedIn(true);
      setUid(user.uid);
      setAccountStatusChecked(true);

      if (presenceCleanup) {
        presenceCleanup();
        presenceCleanup = null;
      }
      presenceCleanup = setupPresence(user.uid);
      // Refresh this device's push token for the account that's now active.
      registerForPushNotifications(user.uid).catch(() => {});
    };

    try {
      unsub = onAuthStateChanged(auth, (user) => {
        try {
          if (isAuthRoutingSuspended()) {
            setAuthChecked(true);
            setAccountStatusChecked(true);
            return;
          }
          setAuthChecked(true);

          if (presenceCleanup) {
            presenceCleanup();
            presenceCleanup = null;
          }
          if (!user) {
            accountCheckId += 1;
            setIsLoggedIn(false);
            setUid(null);
            setAccountStatusChecked(true);
            return;
          }

          const checkId = ++accountCheckId;
          setAccountStatusChecked(false);
          getDoc(doc(db, "users", user.uid))
            .then(async (profileSnapshot) => {
              if (checkId !== accountCheckId) return;
              if (profileSnapshot.data()?.isBanned === true) {
                setIsLoggedIn(false);
                setUid(null);
                setAccountStatusChecked(true);
                await signOut(auth);
                return;
              }
              activateAccount(user);
            })
            .catch(() => {
              // A missing profile should not lock out a newly-created account.
              if (checkId === accountCheckId) activateAccount(user);
            });
        } catch (innerErr) {
          console.warn("Auth state handler error:", innerErr);
          // Still mark auth as checked so the app doesn't hang on splash
          setAuthChecked(true);
          setAccountStatusChecked(true);
        }
      });
    } catch (err) {
      // Firebase itself failed to initialize (e.g. google-services.json missing
      // in AAB, network unreachable at cold start). Surface via ErrorFallback
      // instead of a silent crash.
      console.error("Firebase auth init error:", err);
      setFatalError(err instanceof Error ? err : new Error(String(err)));
      setAuthChecked(true);
      setAccountStatusChecked(true);
    }

    return () => {
      unsub?.();
      if (presenceCleanup) presenceCleanup();
    };
  }, []);

  useEffect(() => {
    if (fontsReady && authChecked && accountStatusChecked) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsReady, authChecked, accountStatusChecked]);

  // ── Deep-link handler ──────────────────────────────────────────────────────
  // Keep the link while auth is loading or the user is logged out. This lets a
  // user tap a shared link first, sign in, and still land on the requested
  // product/profile once the protected stack is mounted.
  useEffect(() => {
    if (!authChecked) return;

    const navigate = (url: string) => {
      let path = "";
      if (url.startsWith("forus://")) {
        path = url.replace(/^forus:\/\//, "");
      } else if (
        url.startsWith("https://forus-backend-911663879269.europe-west1.run.app/") ||
        url.startsWith("https://forus-backend-new-911663879269.europe-west1.run.app/")
      ) {
        path = url.replace(/^https:\/\/forus-backend-911663879269\.europe-west1\.run\.app\//, "");
        if (path === url) {
          path = url.replace(/^https:\/\/forus-backend-new-911663879269\.europe-west1\.run\.app\//, "");
        }
      } else {
        return;
      }
      if (!isLoggedIn) {
        pendingDeepLink.current = url;
        return;
      }
      if (handledDeepLink.current === url) return;
      handledDeepLink.current = url;

      const [type, rawId] = path.split("/");
      const id = rawId ? decodeURIComponent(rawId.split("?")[0]) : "";
      if (!id) return;

      if (type === "profile") {
        // A deep link is a new navigation root: keep exactly one Home screen
        // underneath the public profile instead of accumulating profile/profile/profile.
        navigateWithHomeBase({ pathname: "/artisan-profile", params: { artisanId: id } } as any);
      } else if (type === "user") {
        navigateWithHomeBase({ pathname: "/user-profile", params: { userId: id } } as any);
      } else if (type === "product") {
        navigateWithHomeBase({ pathname: "/product/[id]", params: { id } } as any);
      }
    };

    if (isLoggedIn && pendingDeepLink.current) {
      const url = pendingDeepLink.current;
      pendingDeepLink.current = null;
      navigate(url);
    }

    // Cold-start: app was launched via a deep link
    Linking.getInitialURL().then((url) => { if (url) navigate(url); }).catch(() => {});
    // Foreground: deep link arrived while app is already open
    const sub = Linking.addEventListener("url", ({ url }) => navigate(url));
    return () => sub.remove();
  }, [authChecked, isLoggedIn]);

  // Show a recoverable error screen if Firebase/network threw during boot.
  // The user sees a "Try Again" button (reloadAppAsync) instead of a blank crash.
  if (fatalError) {
    return (
      <ErrorFallback
        error={fatalError}
        resetError={() => setFatalError(null)}
      />
    );
  }

  if (!fontsReady || !authChecked || !accountStatusChecked) return null;

  return (
    <ErrorBoundary>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <NetworkProvider>
              <VideoAudioProvider>
                <RootLayoutNav isLoggedIn={isLoggedIn} />
                <Modal
                  visible={forceUpdateRequired}
                  transparent
                  animationType="fade"
                  onRequestClose={() => {}}
                >
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: "rgba(0,0,0,0.72)",
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 24,
                    }}
                  >
                    <View
                      style={{
                        width: "100%",
                        maxWidth: 420,
                        backgroundColor: "#FFF",
                        borderRadius: 20,
                        padding: 24,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontSize: 22, fontWeight: "700", color: "#111827", textAlign: "center", marginBottom: 10 }}>
                        يتوفر تحديث جديد
                      </Text>
                      <Text style={{ fontSize: 16, color: "#4B5563", textAlign: "center", lineHeight: 25, marginBottom: 22 }}>
                        يجب تحديث تطبيق فورس إلى أحدث إصدار للمتابعة.
                      </Text>
                      <Pressable
                        onPress={() => {
                          const marketUrl = "market://details?id=com.haidar.forus";
                          const webUrl = "https://play.google.com/store/apps/details?id=com.haidar.forus";
                          Linking.openURL(marketUrl).catch(() => Linking.openURL(webUrl).catch(() => {}));
                        }}
                        style={{
                          width: "100%",
                          minHeight: 48,
                          borderRadius: 12,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#0D1421",
                        }}
                      >
                        <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "700" }}>
                          تحديث التطبيق
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </Modal>
              </VideoAudioProvider>
            </NetworkProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </KeyboardProvider>
    </ErrorBoundary>
  );
}
