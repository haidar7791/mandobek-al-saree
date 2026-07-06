import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const C = Colors.light;

interface NetworkContextValue {
  isConnected: boolean;
}

const NetworkContext = createContext<NetworkContextValue>({ isConnected: true });

export function useNetworkStatus() {
  return useContext(NetworkContext);
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const [showBanner, setShowBanner] = useState(false);
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-100)).current;
  const hasCheckedOnce = useRef(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const connected = !!(state.isConnected && state.isInternetReachable !== false);

      if (!hasCheckedOnce.current) {
        hasCheckedOnce.current = true;
        setIsConnected(connected);
        return;
      }

      setIsConnected((prev) => {
        if (prev !== connected) {
          setShowBanner(!connected);
        }
        return connected;
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (showBanner) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 9,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: -100,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [showBanner]);

  useEffect(() => {
    if (isConnected && showBanner) {
      const t = setTimeout(() => setShowBanner(false), 1500);
      return () => clearTimeout(t);
    }
  }, [isConnected, showBanner]);

  return (
    <NetworkContext.Provider value={{ isConnected }}>
      {children}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.banner,
          { top: insets.top + 8, transform: [{ translateY }] },
          isConnected ? styles.bannerOnline : styles.bannerOffline,
        ]}
      >
        <Feather
          name={isConnected ? "wifi" : "wifi-off"}
          size={16}
          color="#FFF"
        />
        <Text style={styles.bannerText}>
          {isConnected
            ? "تم استعادة الاتصال بالإنترنت"
            : "عذراً، يبدو أنك غير متصل بالإنترنت حالياً"}
        </Text>
      </Animated.View>
    </NetworkContext.Provider>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  bannerOffline: { backgroundColor: "#DC2626" },
  bannerOnline: { backgroundColor: "#16A34A" },
  bannerText: {
    color: "#FFF",
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    textAlign: "center",
  },
});
