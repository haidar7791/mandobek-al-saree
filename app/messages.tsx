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
  Modal,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Animated, { FadeInDown } from "react-native-reanimated";
import { auth } from "../lib/firebase";
import {
  subscribeToUserChats,
  deleteChat,
  createGroupChat,
  searchUsersByName,
  type ChatSummary,
  type ShareUserResult,
} from "../lib/db_logic";
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
    return d.toLocaleTimeString("ar-IQ-u-nu-latn", { hour: "2-digit", minute: "2-digit" });
  }
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function ChatItem({ chat, index, onDelete }: { chat: ChatSummary; index: number; onDelete: (c: ChatSummary) => void }) {
  const initial = (chat.otherName || "مستخدم")[0] || "?";
  const isUnread = (chat.unreadCount ?? 0) > 0;
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <Pressable
        style={({ pressed }) => [
          styles.row,
          isUnread && styles.unreadRow,
          pressed && { opacity: 0.85 },
        ]}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onDelete(chat);
        }}
        delayLongPress={350}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({
            pathname: "/chat",
            params: {
              chatId: chat.chatId,
              otherName: chat.otherName,
              otherUid: chat.otherUserId,
              isGroup: chat.isGroup ? "1" : "0",
              groupPhotoUri: chat.groupPhotoUri || "",
            },
          });
        }}
      >
        <View style={styles.avatarWrap}>
          {chat.otherPhotoUri ? (
            <Image source={{ uri: chat.otherPhotoUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Feather name={chat.isGroup ? "users" : "user"} size={21} color={C.accent} />
              {!chat.isGroup && <Text style={styles.avatarText}>{initial}</Text>}
            </View>
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.topRow}>
            <Text style={styles.name} numberOfLines={1}>
              {chat.otherName}
            </Text>
            <View style={styles.timeWrap}>
              <Text style={styles.time}>{formatTime(chat.lastAt)}</Text>
              {isUnread && <View style={styles.unreadDot} />}
            </View>
          </View>
          <Text style={styles.last} numberOfLines={1}>
            {chat.lastMessage || "ابدأ المحادثة الآن"}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupUsers, setGroupUsers] = useState<ShareUserResult[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<ShareUserResult[]>([]);
  const [groupPhotoUri, setGroupPhotoUri] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);

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
    const term = groupSearch.trim();
    if (!term) {
      setGroupUsers([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        const found = await searchUsersByName(term, uid);
        if (!cancelled) setGroupUsers(found);
      } catch {
        if (!cancelled) setGroupUsers([]);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [groupSearch]);

  const pickGroupPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets?.[0]) setGroupPhotoUri(result.assets[0].uri);
  };

  const resetGroupModal = () => {
    setGroupModalVisible(false);
    setGroupName("");
    setGroupSearch("");
    setGroupUsers([]);
    setSelectedUsers([]);
    setGroupPhotoUri(null);
  };

  const handleCreateGroup = async () => {
    const user = auth.currentUser;
    if (!user || !groupName.trim() || selectedUsers.length < 1 || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const profile = await import("../lib/db_logic").then((mod) => mod.getUserProfile(user.uid));
      const created = await createGroupChat(
        user.uid,
        profile?.name || "مستخدم",
        selectedUsers.map((u) => u.userId),
        groupName.trim(),
        groupPhotoUri,
      );
      resetGroupModal();
      router.push({
        pathname: "/chat",
        params: {
          chatId: created.chatId,
          otherName: groupName.trim(),
          isGroup: "1",
          groupPhotoUri: created.groupPhotoUri || "",
        },
      } as any);
    } catch (error) {
      console.error("create group failed:", error);
      Alert.alert("خطأ", "تعذّر إنشاء المجموعة، حاول مرة أخرى");
    } finally {
      setCreatingGroup(false);
    }
  };

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/");
      return;
    }
    const unsub = subscribeToUserChats(
      user.uid,
      (list) => {
        setChats(list);
        setLoading(false);
        setRefreshing(false);
      },
      user.email
    );
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
        <Pressable style={styles.createGroupBtn} onPress={() => setGroupModalVisible(true)}>
          <Feather name="users" size={18} color={C.primary} />
          <Text style={styles.createGroupText}>إنشاء مجموعة</Text>
        </Pressable>
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

      <Modal
        visible={groupModalVisible}
        transparent
        animationType="slide"
        onRequestClose={resetGroupModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.groupModal, { paddingBottom: bottomPad + 14 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>إنشاء مجموعة جديدة</Text>
              <Pressable onPress={resetGroupModal} hitSlop={8}>
                <Feather name="x" size={22} color={C.textMuted} />
              </Pressable>
            </View>

            <Pressable style={styles.groupPhotoPicker} onPress={pickGroupPhoto}>
              {groupPhotoUri ? (
                <Image source={{ uri: groupPhotoUri }} style={styles.groupPhoto} />
              ) : (
                <>
                  <Feather name="camera" size={24} color={C.accent} />
                  <Text style={styles.photoHint}>إضافة صورة</Text>
                </>
              )}
            </Pressable>

            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="اسم المجموعة"
              placeholderTextColor={C.textMuted}
              style={styles.groupInput}
              textAlign="right"
              maxLength={60}
            />

            {selectedUsers.length > 0 && (
              <FlatList
                horizontal
                inverted
                data={selectedUsers}
                keyExtractor={(u) => u.userId}
                style={styles.selectedList}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.selectedChip}
                    onPress={() => setSelectedUsers((prev) => prev.filter((u) => u.userId !== item.userId))}
                  >
                    <Text style={styles.selectedChipText}>{item.name}</Text>
                    <Feather name="x" size={13} color={C.accent} />
                  </Pressable>
                )}
              />
            )}

            <TextInput
              value={groupSearch}
              onChangeText={setGroupSearch}
              placeholder="ابحث عن المستخدمين لإضافتهم..."
              placeholderTextColor={C.textMuted}
              style={styles.groupInput}
              textAlign="right"
            />

            <FlatList
              data={groupUsers.filter((u) => !selectedUsers.some((s) => s.userId === u.userId))}
              keyExtractor={(u) => u.userId}
              keyboardShouldPersistTaps="handled"
              style={styles.userResults}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.userResult}
                  onPress={() => setSelectedUsers((prev) => [...prev, item])}
                >
                  {item.photoUri ? (
                    <Image source={{ uri: item.photoUri }} style={styles.userAvatar} />
                  ) : (
                    <View style={styles.userAvatarFallback}>
                      <Text style={styles.avatarText}>{(item.name || "?")[0]}</Text>
                    </View>
                  )}
                  <Text style={styles.userResultName} numberOfLines={1}>{item.name}</Text>
                  <Feather name="plus-circle" size={20} color={C.accent} />
                </Pressable>
              )}
              ListEmptyComponent={
                groupSearch.trim() ? <Text style={styles.noUsers}>لا توجد نتائج</Text> : null
              }
            />

            <Pressable
              style={[styles.createGroupAction, (!groupName.trim() || selectedUsers.length === 0 || creatingGroup) && { opacity: 0.45 }]}
              disabled={!groupName.trim() || selectedUsers.length === 0 || creatingGroup}
              onPress={handleCreateGroup}
            >
              {creatingGroup ? (
                <ActivityIndicator color={C.primary} />
              ) : (
                <Text style={styles.createGroupActionText}>إنشاء المجموعة</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
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
  title: { fontSize: 18, fontFamily: undefined, color: "#FFF", textAlign: "right" },
  sub: { fontSize: 12, fontFamily: undefined, color: "rgba(255,255,255,0.6)" },
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
    gap: 4,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 12,
  },
  unreadRow: {
    backgroundColor: "rgba(201,168,76,0.13)",
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.45)",
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
  avatarText: { fontSize: 20, fontFamily: undefined, color: C.accent },
  body: { flex: 1, gap: 4 },
  topRow: { flexDirection: "row", alignItems: "center", minHeight: 24, width: "100%" },
  name: { flexShrink: 1, fontSize: 15, fontFamily: undefined, color: C.text, textAlign: "right", paddingLeft: 0 },
  time: { fontSize: 11, fontFamily: undefined, color: C.textMuted },
  timeWrap: { marginLeft: "auto", minWidth: 62, flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  last: { fontSize: 13, fontFamily: undefined, color: C.textSecondary, textAlign: "right" },
  createGroupBtn: {
    minHeight: 38, borderRadius: 11, paddingHorizontal: 10,
    backgroundColor: C.accent, flexDirection: "row", alignItems: "center", gap: 5,
  },
  createGroupText: { fontSize: 12, fontFamily: undefined, color: C.primary },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  groupModal: {
    maxHeight: "88%", backgroundColor: C.background, borderTopLeftRadius: 24,
    borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 16,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { fontSize: 18, fontFamily: undefined, color: C.text },
  groupPhotoPicker: {
    alignSelf: "center", width: 78, height: 78, borderRadius: 39,
    backgroundColor: C.card, alignItems: "center", justifyContent: "center", overflow: "hidden",
    marginBottom: 12,
  },
  groupPhoto: { width: "100%", height: "100%" },
  photoHint: { fontSize: 10, fontFamily: undefined, color: C.textMuted, marginTop: 2 },
  groupInput: {
    minHeight: 46, borderRadius: 13, backgroundColor: C.card, color: C.text,
    fontFamily: undefined, fontSize: 14, paddingHorizontal: 13, marginBottom: 9,
  },
  selectedList: { maxHeight: 42, marginBottom: 8 },
  selectedChip: {
    flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(201,168,76,0.13)",
    borderRadius: 18, paddingHorizontal: 10, marginHorizontal: 3,
  },
  selectedChipText: { fontSize: 11, fontFamily: undefined, color: C.text },
  userResults: { minHeight: 70, maxHeight: 210, marginBottom: 10 },
  userResult: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card,
    borderRadius: 12, padding: 9, marginBottom: 7,
  },
  userAvatar: { width: 40, height: 40, borderRadius: 20 },
  userAvatarFallback: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(201,168,76,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  userResultName: { flex: 1, textAlign: "right", fontSize: 13, fontFamily: undefined, color: C.text },
  noUsers: { textAlign: "center", color: C.textMuted, fontFamily: undefined, padding: 15 },
  createGroupAction: {
    minHeight: 48, borderRadius: 14, backgroundColor: C.accent,
    alignItems: "center", justifyContent: "center", marginTop: 4,
  },
  createGroupActionText: { fontSize: 14, fontFamily: undefined, color: C.primary },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 30 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontFamily: undefined, color: C.text, textAlign: "center" },
  emptySub: {
    fontSize: 13,
    fontFamily: undefined,
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});
