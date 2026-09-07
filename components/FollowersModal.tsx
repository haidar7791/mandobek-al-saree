import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { getFollowerProfiles, type FollowerProfile } from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

type Props = {
  visible: boolean;
  onClose: () => void;
  profileId: string;
  profileName?: string;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function FollowersModal({ visible, onClose, profileId, profileName }: Props) {
  const [followers, setFollowers] = useState<FollowerProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!visible || !profileId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    getFollowerProfiles(profileId)
      .then((items) => {
        if (!cancelled) setFollowers(items);
      })
      .catch((err) => {
        console.error("load followers failed:", err);
        if (!cancelled) {
          setFollowers([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>المتابعون</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {profileName ? `حسابات تتابع ${profileName}` : "الحسابات التي تتابع هذا الحساب"}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8}>
              <Feather name="x" size={20} color={C.textSecondary} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="small" color={C.accent} />
              <Text style={styles.helperText}>جارٍ تحميل المتابعين...</Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Feather name="wifi-off" size={28} color={C.textMuted} />
              <Text style={styles.emptyTitle}>تعذّر تحميل القائمة</Text>
              <Text style={styles.helperText}>حاول فتحها مرة أخرى.</Text>
            </View>
          ) : (
            <FlatList
              data={followers}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.list, followers.length === 0 && styles.emptyList]}
              ListEmptyComponent={
                <View style={styles.center}>
                  <View style={styles.emptyIcon}>
                    <Feather name="users" size={24} color={C.accent} />
                  </View>
                  <Text style={styles.emptyTitle}>لا يوجد متابعون بعد</Text>
                  <Text style={styles.helperText}>ستظهر الحسابات هنا عند متابعتهم لهذا الحساب.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.row}>
                  {item.photoUri ? (
                    <Image source={{ uri: item.photoUri }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarText}>{initials(item.name)}</Text>
                    </View>
                  )}
                  <View style={styles.rowCopy}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.rowHint}>متابع حقيقي</Text>
                  </View>
                  <Feather name="user" size={17} color={C.textMuted} />
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(3, 8, 24, 0.62)",
  },
  sheet: {
    maxHeight: "78%",
    minHeight: 280,
    backgroundColor: C.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: C.border,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 4,
    backgroundColor: C.border,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerCopy: { flex: 1, alignItems: "flex-end", gap: 2 },
  title: { color: C.text, fontSize: 19, fontFamily: "Cairo_700Bold" },
  subtitle: { color: C.textMuted, fontSize: 11, fontFamily: "Cairo_400Regular" },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.inputBg,
    marginRight: 10,
  },
  list: { paddingTop: 4, paddingBottom: 8, gap: 8 },
  emptyList: { flexGrow: 1 },
  row: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: C.accent },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.primary,
    borderWidth: 2,
    borderColor: C.accent,
  },
  avatarText: { color: C.accent, fontSize: 15, fontFamily: "Cairo_700Bold" },
  rowCopy: { flex: 1, alignItems: "flex-end", gap: 1 },
  name: { color: C.text, fontSize: 14, fontFamily: "Cairo_700Bold", textAlign: "right" },
  rowHint: { color: C.textMuted, fontSize: 10, fontFamily: "Cairo_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 28 },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(201,168,76,0.12)",
  },
  emptyTitle: { color: C.text, fontSize: 15, fontFamily: "Cairo_700Bold" },
  helperText: { color: C.textMuted, fontSize: 12, fontFamily: "Cairo_400Regular", textAlign: "center" },
});