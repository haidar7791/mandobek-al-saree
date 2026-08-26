import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import React, { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorFallback } from "@/components/ErrorFallback";
import { queryClient } from "@/lib/query-client";
import { I18nManager, Linking } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { configurePushHandler, registerForPushNotifications } from "@/lib/push_notifications";
import { NetworkProvider } from "@/lib/network";
import { VideoAudioProvider } from "@/lib/video-audio-context";
import { setupPresence } from "@/lib/presence";
import { useArtisanLocationTracking } from "@/hooks/useArtisanLocationTracking";
import { isAuthRoutingSuspended } from "@/lib/auth_flow";

SplashScreen.preventAutoHideAsync();

I18nManager.forceRTL(true);

// Auth-gated routing: the "logged out" group (index/login/register) and the
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
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack.Protected>

      <Stack.Protected guard={isLoggedIn}>
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="admin-dashboard" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="wallet" />
        <Stack.Screen name="artisan-profile" />
        <Stack.Screen name="user-profile" />
        <Stack.Screen name="product/[id]" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="messages" />
        <Stack.Screen name="reservations" />
        <Stack.Screen name="active-order" />
        <Stack.Screen name="support" />
        <Stack.Screen name="promote" />
        <Stack.Screen name="story-creator" />
        <Stack.Screen name="story-viewer" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsReady, setFontsReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const pendingDeepLink = useRef<string | null>(null);
  const handledDeepLink = useRef<string | null>(null);
  // Catches async errors from Firebase / network that can't be caught by the
  // class-based ErrorBoundary (which only intercepts render-phase throws).
  const [fatalError, setFatalError] = useState<Error | null>(null);

  // Automatic artisan location tracking: no-op for client accounts, kicks in
  // silently for artisan accounts as soon as they're signed in.
  useArtisanLocationTracking(uid);

  useEffect(() => {
    try {
      configurePushHandler();
    } catch {}
  }, []);

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

  useEffect(() => {
    let presenceCleanup: (() => void) | null = null;
    let unsub: (() => void) | null = null;

    try {
      unsub = onAuthStateChanged(auth, (user) => {
        try {
          if (isAuthRoutingSuspended()) {
            setAuthChecked(true);
            return;
          }
          setIsLoggedIn(!!user);
          setUid(user?.uid ?? null);
          setAuthChecked(true);

          if (presenceCleanup) {
            presenceCleanup();
            presenceCleanup = null;
          }
          if (user) {
            presenceCleanup = setupPresence(user.uid);
            // Refresh this device's push token for the account that's now
            // active, so notifications always target whoever is currently
            // signed in (and never the account that just logged out).
            registerForPushNotifications(user.uid).catch(() => {});
          }
        } catch (innerErr) {
          console.warn("Auth state handler error:", innerErr);
          // Still mark auth as checked so the app doesn't hang on splash
          setAuthChecked(true);
        }
      });
    } catch (err) {
      // Firebase itself failed to initialize (e.g. google-services.json missing
      // in AAB, network unreachable at cold start). Surface via ErrorFallback
      // instead of a silent crash.
      console.error("Firebase auth init error:", err);
      setFatalError(err instanceof Error ? err : new Error(String(err)));
      setAuthChecked(true);
    }

    return () => {
      unsub?.();
      if (presenceCleanup) presenceCleanup();
    };
  }, []);

  useEffect(() => {
    if (fontsReady && authChecked) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsReady, authChecked]);

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
      } else if (url.startsWith("https://forus-backend-911663879269.europe-west1.run.app/")) {
        path = url.replace(/^https:\/\/forus-backend-911663879269\.europe-west1\.run\.app\//, "");
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
        router.push({ pathname: "/artisan-profile", params: { artisanId: id } } as any);
      } else if (type === "user") {
        router.push({ pathname: "/user-profile", params: { userId: id } } as any);
      } else if (type === "product") {
        router.push({ pathname: "/product/[id]", params: { id } } as any);
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

  if (!fontsReady || !authChecked) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <NetworkProvider>
            <VideoAudioProvider>
              <RootLayoutNav isLoggedIn={isLoggedIn} />
            </VideoAudioProvider>
          </NetworkProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
