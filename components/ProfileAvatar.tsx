import React from "react";
import { View, Image, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import Colors from "@/constants/colors";

const C = Colors.light;

interface ProfileAvatarProps {
  photoUri?: string | null;
  name?: string;
  percent: number;
  size?: number;
}

/**
 * Avatar surrounded by a circular progress ring showing profile-completion
 * percentage (0/25/50/75/100). Ring color shifts from orange (incomplete) to
 * green (100%). A small percentage label sits under the avatar. Tapping
 * always routes to the profile screen.
 */
export default function ProfileAvatar({
  photoUri,
  name = "",
  percent,
  size = 44,
}: ProfileAvatarProps) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const clamped = Math.max(0, Math.min(100, percent));
  const isComplete = clamped >= 100;
  const ringColor = isComplete ? "#22C55E" : "#F97316";

  const strokeWidth = 3;
  const svgSize = size + strokeWidth * 2;
  const radius = (svgSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const innerSize = size - 4;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => router.push("/profile" as any)}
        style={{ width: svgSize, height: svgSize, alignItems: "center", justifyContent: "center" }}
        hitSlop={8}
      >
        <Svg
          width={svgSize}
          height={svgSize}
          style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
        >
          <Circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </Svg>

        <View
          style={[
            styles.avatarInner,
            { width: innerSize, height: innerSize, borderRadius: innerSize / 2 },
          ]}
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
        </View>
      </Pressable>

      <View style={[styles.percentPill, { backgroundColor: isComplete ? "#22C55E" : "#F97316" }]}>
        <Text style={styles.percentText}>{clamped}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInner: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
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
  percentPill: {
    marginTop: -6,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1.5,
    borderColor: "#0D1B3E",
    zIndex: 2,
  },
  percentText: {
    fontSize: 9,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
  },
});
