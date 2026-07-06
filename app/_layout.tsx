import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import React, { useEffect, useState, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { I18nManager } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { configurePushHandler } from "@/lib/push_notifications";
import { NetworkProvider } from "@/lib/network";
import { setupPresence } from "@/lib/presence";

SplashScreen.preventAutoHideAsync();

I18nManager.forceRTL(true);

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="admin-dashboard" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="artisan-profile" />
      <Stack.Screen name="chat" />
      <Stack.Screen name="messages" />
      <Stack.Screen name="reservations" />
      <Stack.Screen name="active-order" />
      <Stack.Screen name="support" />
      <Stack.Screen name="promote" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsReady, setFontsReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const redirectedRef = useRef(false);

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
      setAuthChecked(true);

      if (presenceCleanup) {
        presenceCleanup();
        presenceCleanup = null;
      }
      if (user) {
        presenceCleanup = setupPresence(user.uid);
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
      if (isLoggedIn && !redirectedRef.current) {
        redirectedRef.current = true;
        router.replace("/dashboard" as any);
      }
    }
  }, [fontsReady, authChecked, isLoggedIn]);

  if (!fontsReady || !authChecked) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <NetworkProvider>
            <RootLayoutNav />
          </NetworkProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
