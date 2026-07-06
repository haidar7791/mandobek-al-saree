import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import type { MissingProfileField } from "@/hooks/useProfileCheck";
import Colors from "@/constants/colors";

const C = Colors.light;

const FIELD_MESSAGES: Record<MissingProfileField, string> = {
  phone: "⚠️ يرجى إضافة وتأكيد رقم هاتفك لتفعيل حسابك",
  photo: "🙂 أضف صورة شخصية ليتعرف عليك العملاء بسهولة",
  bio: "✍️ أضف نبذة قصيرة عن خبرتك (10 أحرف على الأقل)",
  portfolio: "📸 أضف 3 صور على الأقل لمعرض أعمالك",
};

interface ProfileAlertBannerProps {
  missingFields: MissingProfileField[];
}

/**
 * Gentle, dismiss-free nudge shown at the top of the dashboard when the
 * user's profile is incomplete. Never blocks browsing — just informs.
 */
export default function ProfileAlertBanner({ missingFields }: ProfileAlertBannerProps) {
  if (missingFields.length === 0) return null;

  const message = FIELD_MESSAGES[missingFields[0]];

  return (
    <Pressable
      style={styles.banner}
      onPress={() => router.push("/profile" as any)}
    >
      <Text style={styles.text} numberOfLines={2}>
        {message}
      </Text>
      {missingFields.length > 1 && (
        <View style={styles.countPill}>
          <Text style={styles.countText}>+{missingFields.length - 1}</Text>
        </View>
      )}
      <Feather name="chevron-left" size={16} color="#B45309" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginTop: 10,
    gap: 8,
  },
  text: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: "Cairo_600SemiBold",
    color: "#9A3412",
    textAlign: "right",
  },
  countPill: {
    backgroundColor: "#FDBA74",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countText: {
    fontSize: 10,
    fontFamily: "Cairo_700Bold",
    color: "#7C2D12",
  },
});
