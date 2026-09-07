import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { auth } from "@/lib/firebase";
import {
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
  type ActivityNotification,
} from "@/lib/notifications";
import Colors from "@/constants/colors";

const C = Colors.light;

const iconFor = (type: ActivityNotification["type"]): keyof typeof Feather.glyphMap => {
  switch (type) {
    case "like":
      return "heart";
    case "follow":
      return "user-plus";
    case "comment":
      return "message-circle";
    case "share":
      return "share-2";
    case "purchase":
      return "shopping-bag";
    default:
      return "bell";
  }
};

const destinationFor = (item: ActivityNotification): string | null => {
  if (item.type === "purchase") {
    return item.entityType === "service" ? "/reservations" : "/product-orders";
  }
  if (item.entityType === "profile" && item.entityId) {
    return `/user-profile?userId=${encodeURIComponent(item.entityId)}`;
  }
  if (item.entityType === "product" && item.entityId) {
    return `/product/${encodeURIComponent(item.entityId)}`;
  }
  return null;
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ActivityNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const userId = auth.currentUser?.uid;

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    return subscribeToNotifications(
      userId,
      (next) => {
        setItems(next);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [userId]);

  const handleMarkAll = useCallback(async () => {
    if (!userId || markingAll || !items.some((item) => !item.read)) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(userId);
    } finally {
      setMarkingAll(false);
    }
  }, [items, markingAll, userId]);

  const handlePress = useCallback(async (item: ActivityNotification) => {
    if (!item.read) {
      await markNotificationRead(item.id).catch((error) =>
        console.warn("mark notification read failed:", error),
      );
    }
    const destination = destinationFor(item);
    if (destination) router.push(destination as any);
  }, []);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={10}>
          <Feather name="arrow-right" size={22} color={C.accent} />
        </Pressable>
        <Text style={styles.headerTitle}>الإشعارات</Text>
        <Pressable
          onPress={handleMarkAll}
          disabled={markingAll || !items.some((item) => !item.read)}
          style={({ pressed }) => [
            styles.markAllButton,
            (markingAll || !items.some((item) => !item.read)) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {markingAll ? (
            <ActivityIndicator size="small" color={C.accent} />
          ) : (
            <Text style={styles.markAllText}>قراءة الكل</Text>
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            !items.length && styles.emptyList,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="bell-off" size={42} color={C.textMuted} />
              <Text style={styles.emptyTitle}>لا توجد إشعارات بعد</Text>
              <Text style={styles.emptyText}>ستظهر هنا تفاعلات حسابك وطلباتك الجديدة.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void handlePress(item)}
              style={({ pressed }) => [
                styles.notification,
                !item.read && styles.unread,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.icon, !item.read && styles.unreadIcon]}>
                <Feather
                  name={iconFor(item.type)}
                  size={19}
                  color={!item.read ? C.primary : C.accent}
                />
              </View>
              <View style={styles.copy}>
                <View style={styles.titleRow}>
                  <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                  {!item.read && <View style={styles.dot} />}
                </View>
                <Text style={styles.body}>{item.actorName} {item.body}</Text>
                <Text style={styles.time}>{formatTime(item.createdAt)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function formatTime(iso: string): string {
  const time = new Date(iso).getTime();
  if (!time) return "الآن";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: {
    backgroundColor: C.primary,
    paddingHorizontal: 18,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: { width: 44, alignItems: "flex-start" },
  headerTitle: { color: "#FFF", fontSize: 19, fontWeight: "700" },
  markAllButton: { minWidth: 70, alignItems: "flex-end" },
  markAllText: { color: C.accent, fontSize: 12, fontWeight: "700" },
  list: { padding: 14, gap: 10 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  notification: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  unread: { backgroundColor: "rgba(201,168,76,0.12)", borderColor: "rgba(201,168,76,0.3)" },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(201,168,76,0.12)",
  },
  unreadIcon: { backgroundColor: C.accent },
  copy: { flex: 1, alignItems: "flex-end" },
  titleRow: { width: "100%", flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  title: { flex: 1, color: C.text, fontSize: 14, fontWeight: "700", textAlign: "right" },
  body: { width: "100%", color: C.textMuted, fontSize: 12, lineHeight: 20, textAlign: "right", marginTop: 3 },
  time: { width: "100%", color: C.textMuted, fontSize: 10, textAlign: "right", marginTop: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },
  center: { alignItems: "center", justifyContent: "center", gap: 10 },
  emptyTitle: { color: C.text, fontSize: 16, fontWeight: "700" },
  emptyText: { color: C.textMuted, fontSize: 12 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
});