import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { I18nManager } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { configurePushHandler, registerForPushNotifications } from "@/lib/push_notifications";
import { NetworkProvider } from "@/lib/network";
import { setupPresence } from "@/lib/presence";
import { useArtisanLocationTracking } from "@/hooks/useArtisanLocationTracking";

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
        <Stack.Screen name="chat" />
        <Stack.Screen name="messages" />
        <Stack.Screen name="reservations" />
        <Stack.Screen name="active-order" />
        <Stack.Screen name="support" />
        <Stack.Screen name="promote" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsReady, setFontsReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  // Automatic artisan location tracking: no-op for client accounts, kicks in
  // silently for artisan accounts as soon as they're signed in.
  useArtisanLocationTracking(uid);

  useEffect(() => {
    configurePushHandler();
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
    const unsub = onAuthStateChanged(auth, (user) => {
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
    });
    return () => {
      unsub();
      if (presenceCleanup) presenceCleanup();
    };
  }, []);

  useEffect(() => {
    if (fontsReady && authChecked) {
      SplashScreen.hideAsync();
    }
  }, [fontsReady, authChecked]);

  if (!fontsReady || !authChecked) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <NetworkProvider>
            <RootLayoutNav isLoggedIn={isLoggedIn} />
          </NetworkProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
