import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { auth } from "../lib/firebase";
import { subscribeToUserChats, deleteChat, type ChatSummary } from "../lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" });
  }
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function ChatItem({ chat, index, onDelete }: { chat: ChatSummary; index: number; onDelete: (c: ChatSummary) => void }) {
  const initial = chat.otherName?.[0] || "?";
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onDelete(chat);
        }}
        delayLongPress={350}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({
            pathname: "/chat",
            params: { chatId: chat.chatId, otherName: chat.otherName },
          });
        }}
      >
        <View style={styles.avatarWrap}>
          {chat.otherPhotoUri ? (
            <Image source={{ uri: chat.otherPhotoUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.topRow}>
            <Text style={styles.time}>{formatTime(chat.lastAt)}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {chat.otherName}
            </Text>
          </View>
          <Text style={styles.last} numberOfLines={1}>
            {chat.lastMessage || "ابدأ المحادثة الآن"}
          </Text>
        </View>
        <Pressable
          hitSlop={10}
          style={styles.deleteIconBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onDelete(chat);
          }}
        >
          <Feather name="trash-2" size={16} color={C.danger} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const handleDeleteChat = (chat: ChatSummary) => {
    Alert.alert(
      "حذف المحادثة",
      `هل تريد حذف محادثتك مع ${chat.otherName}؟ سيتم حذف جميع الرسائل نهائياً.`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteChat(chat.chatId);
              setChats((prev) => prev.filter((c) => c.chatId !== chat.chatId));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              Alert.alert("خطأ", "تعذّر حذف المحادثة، حاول مرة أخرى");
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/login");
      return;
    }
    const unsub = subscribeToUserChats(user.uid, (list) => {
      setChats(list);
      setLoading(false);
      setRefreshing(false);
    });
    return unsub;
  }, []);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#0D1B3E", "#162452"]}
        style={[styles.header, { paddingTop: topPad + 8 }]}
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={22} color="#FFF" />
        </Pressable>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={styles.title}>المحادثات</Text>
          <Text style={styles.sub}>
            {chats.length > 0 ? `${chats.length} محادثة نشطة` : "لا توجد محادثات"}
          </Text>
        </View>
        <View style={styles.iconBadge}>
          <Feather name="message-circle" size={20} color={C.accent} />
        </View>
      </LinearGradient>

      <FlatList
        data={chats}
        keyExtractor={(c) => c.chatId}
        renderItem={({ item, index }) => (
          <ChatItem chat={item} index={index} onDelete={handleDeleteChat} />
        )}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: bottomPad + 20 },
          chats.length === 0 && { flex: 1 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              const user = auth.currentUser;
              if (!user) return;
              // subscription will deliver fresh data; clear refresh after a short while
              setTimeout(() => setRefreshing(false), 800);
            }}
            tintColor={C.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Feather name="message-circle" size={40} color={C.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>
              {loading ? "جارٍ التحميل..." : "لا توجد محادثات بعد"}
            </Text>
            {!loading && (
              <Text style={styles.emptySub}>
                ابدأ بالتواصل مع أحد أصحاب الاختصاص من صفحته الشخصية
              </Text>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontFamily: "Cairo_700Bold", color: "#FFF", textAlign: "right" },
  sub: { fontSize: 12, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.6)" },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(201,168,76,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: { padding: 14, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 12,
  },
  avatarWrap: { width: 52, height: 52, borderRadius: 26, overflow: "hidden" },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(201,168,76,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontFamily: "Cairo_700Bold", color: C.accent },
  body: { flex: 1, gap: 4 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { flex: 1, fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  time: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted, marginLeft: 8 },
  last: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "right" },
  deleteIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 30 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "center" },
  emptySub: {
    fontSize: 13,
    fontFamily: "Cairo_400Regular",
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});
