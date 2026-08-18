import React from "react";
import { View, Image, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";

interface ProfileAvatarProps {
  photoUri?: string | null;
  name?: string;
  size?: number;
  /**
   * When true the avatar is a plain View (no onPress).
   * Use this whenever the avatar sits inside another Pressable (e.g. story circles)
   * so inner-Pressable touch-capture doesn't steal the outer press event.
   */
  disableNavigation?: boolean;
}

/**
 * Simple circular avatar.
 * By default tapping routes to /profile.
 * Pass disableNavigation={true} to render a non-interactive View instead.
 */
export default function ProfileAvatar({
  photoUri,
  name = "",
  size = 44,
  disableNavigation = false,
}: ProfileAvatarProps) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const inner = photoUri ? (
    <Image
      source={{ uri: photoUri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  ) : (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={styles.initials}>{initials || "؟"}</Text>
    </View>
  );

  if (disableNavigation) {
    return (
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
        {inner}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => router.push("/profile" as any)}
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
      hitSlop={8}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  initials: {
    fontSize: 14,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
  },
});
