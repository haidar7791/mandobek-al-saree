import React from "react";
import { View, Image, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";

interface ProfileAvatarProps {
  photoUri?: string | null;
  name?: string;
  size?: number;
}

/**
 * Simple circular avatar — tapping always routes to the profile screen.
 * (No completion ring or percentage label.)
 */
export default function ProfileAvatar({
  photoUri,
  name = "",
  size = 44,
}: ProfileAvatarProps) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Pressable
      onPress={() => router.push("/profile" as any)}
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
      hitSlop={8}
    >
      {photoUri ? (
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
      )}
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
