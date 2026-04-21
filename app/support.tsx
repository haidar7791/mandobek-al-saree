import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { auth } from "../lib/firebase";
import {
  sendMessage,
  subscribeToMessages,
  getUserProfile,
  ensureSupportWelcome,
  buildSupportChatId,
  ADMIN_DISPLAY_NAME,
  ADMIN_UID,
  type ChatMessage,
} from "../lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [senderName, setSenderName] = useState("مستخدم");
  const [chatId, setChatId] = useState<string | null>(null);
  const flatRef = useRef<FlatList>(null);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/login");
      return;
    }
    const cid = buildSupportChatId(user.uid);
    setChatId(cid);

    getUserProfile(user.uid).then((p) => {
      if (p) setSenderName(p.name || "مستخدم");
    });

    ensureSupportWelcome(user.uid).catch(() => {});

    const unsub = subscribeToMessages(cid, (msgs) => {
      setMessages(msgs);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return unsub;
  }, []);

  const handleSend = async () => {
    const user = auth.currentUser;
    if (!user || !chatId || !text.trim()) return;
    const msg = text.trim();
    setText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await sendMessage(chatId, user.uid, senderName, msg);
  };

  const currentUid = auth.currentUser?.uid;

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = item.senderId === currentUid;
    const isAdmin = item.senderId === ADMIN_UID;
    const time = new Date(item.createdAt).toLocaleTimeString("ar-IQ", {
      hour: "2-digit", minute: "2-digit",
    });
    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
        <View style={[styles.msgBubble, isMine ? styles.bubbleMine : styles.bubbleAdmin]}>
          {!isMine && isAdmin && (
            <Text style={styles.adminLabel}>{ADMIN_DISPLAY_NAME}</Text>
          )}
          <Text style={[styles.msgText, isMine ? styles.msgTextMine : styles.msgTextTheirs]}>
            {item.text}
          </Text>
          <Text style={[styles.msgTime, isMine ? { color: "rgba(255,255,255,0.6)" } : { color: C.textMuted }]}>
            {time}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={22} color="#FFF" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>الدعم الفني</Text>
          <Text style={styles.headerSub}>فريق سند جاهز لخدمتك</Text>
        </View>
        <View style={styles.headerAvatar}>
          <Feather name="headphones" size={18} color={C.accent} />
        </View>
      </LinearGradient>

      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.msgList, { paddingBottom: 12 }]}
        renderItem={renderMessage}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
      />

      <View style={[styles.inputBar, { paddingBottom: bottomPad + 8 }]}>
        <Pressable
          style={[styles.sendBtn, !text.trim() && { opacity: 0.5 }]}
          onPress={handleSend}
          disabled={!text.trim()}
        >
          <LinearGradient colors={[C.accent, C.accentLight]} style={styles.sendBtnGrad}>
            <Feather name="send" size={18} color={C.primary} />
          </LinearGradient>
        </Pressable>
        <TextInput
          style={styles.textInput}
          placeholder="اشرح مشكلتك بوضوح..."
          placeholderTextColor={C.textMuted}
          value={text}
          onChangeText={setText}
          textAlign="right"
          multiline
          maxLength={1000}
          returnKeyType="send"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 14, gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  headerInfo: { flex: 1, alignItems: "flex-end" },
  headerName: { fontSize: 16, fontFamily: "Cairo_700Bold", color: "#FFF", textAlign: "right" },
  headerSub: { fontSize: 12, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.5)" },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(201,168,76,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  msgList: { padding: 14, gap: 8 },
  msgRow: { flexDirection: "row", marginBottom: 6 },
  msgRowMine: { justifyContent: "flex-start" },
  msgRowTheirs: { justifyContent: "flex-end" },
  msgBubble: {
    maxWidth: "78%", borderRadius: 16, paddingHorizontal: 14,
    paddingVertical: 10, gap: 4,
  },
  bubbleMine: { backgroundColor: C.primary, borderBottomLeftRadius: 4 },
  bubbleAdmin: {
    backgroundColor: "rgba(201,168,76,0.16)",
    borderWidth: 1, borderColor: "rgba(201,168,76,0.3)",
    borderBottomRightRadius: 4,
  },
  adminLabel: {
    fontSize: 10, fontFamily: "Cairo_600SemiBold",
    color: C.accent, textAlign: "right", marginBottom: 2,
  },
  msgText: { fontSize: 14, fontFamily: "Cairo_400Regular", lineHeight: 22 },
  msgTextMine: { color: "#FFF", textAlign: "left" },
  msgTextTheirs: { color: C.text, textAlign: "right" },
  msgTime: { fontSize: 10, fontFamily: "Cairo_400Regular" },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 14, paddingTop: 10,
    backgroundColor: C.card,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  textInput: {
    flex: 1, backgroundColor: C.inputBg, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, fontFamily: "Cairo_400Regular", color: C.text,
    maxHeight: 100,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 14, overflow: "hidden" },
  sendBtnGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
});
