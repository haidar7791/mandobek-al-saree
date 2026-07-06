import React from "react";
import { View, Image, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import Colors from "@/constants/colors";

const C = Colors.light;

interface ProfileAvatarProps {
  photoUri?: string | null;
  name?: string;
  isComplete: boolean;
  size?: number;
}

/**
 * Avatar with a colored ring + floating badge dot instead of a hard block:
 * orange ring + red dot while the profile is incomplete, green ring with no
 * dot once complete. Tapping always routes to the profile screen.
 */
export default function ProfileAvatar({
  photoUri,
  name = "",
  isComplete,
  size = 44,
}: ProfileAvatarProps) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const ringColor = isComplete ? "#22C55E" : "#F97316";
  const innerSize = size - 6;

  return (
    <Pressable
      onPress={() => router.push("/profile" as any)}
      style={[styles.wrap, { width: size, height: size, borderRadius: size / 2, borderColor: ringColor }]}
      hitSlop={8}
    >
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={{ width: innerSize, height: innerSize, borderRadius: innerSize / 2 }}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            { width: innerSize, height: innerSize, borderRadius: innerSize / 2 },
          ]}
        >
          <Text style={styles.initials}>{initials || "؟"}</Text>
        </View>
      )}

      {!isComplete && (
        <View style={styles.badgeDot}>
          <View style={styles.badgeDotInner} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
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
  badgeDot: {
    position: "absolute",
    top: -2,
    left: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeDotInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#EF4444",
  },
});
