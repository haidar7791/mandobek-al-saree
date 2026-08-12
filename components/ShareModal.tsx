/**
 * ShareModal.tsx
 * Bottom-sheet that lets the user share content:
 *  - Externally via the device's native Share sheet (WhatsApp, Telegram, …)
 *    → appends a forus:// deep link when deepLinkPath is provided
 *  - Internally by picking a recent chat and auto-sending:
 *    → a card message (thumbnail + title + "عرض" button) when cardImage/cardRoute provided
 *    → a plain text message otherwise
 */
import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { auth } from "@/lib/firebase";
import {
  sendMessage,
  sendCardMessage,
  getUserChats,
  getUserProfile,
  type ChatSummary,
} from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

export interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  /** Full text for the native share sheet (deep link appended automatically) */
  shareText: string;
  /** Shorter text used as preview when sending a plain-text in-app message */
  shareMessage: string;
  /** Optional title shown in the native share sheet header */
  title?: string;

  // ── Card / deep-link props ──────────────────────────────────────────────────
  /** Thumbnail URL shown in the card bubble and on the preview row */
  cardImage?: string;
  /** Title text rendered inside the card bubble (falls back to title prop) */
  cardTitle?: string;
  /**
   * Internal Expo Router path pushed when the receiver taps the card's "عرض"
   * button, e.g. "/artisan-profile?artisanId=XXX"
   */
  cardRoute?: string;
  /**
   * Deep-link path segment appended to forus:// for external shares,
   * e.g. "profile/artisanId" → "forus://profile/artisanId"
   */
  deepLinkPath?: string;
}

export function ShareModal({
  visible,
  onClose,
  shareText,
  shareMessage,
  title,
  cardImage,
  cardTitle,
  cardRoute,
  deepLinkPath,
}: ShareModalProps) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setChats([]);
      return;
    }
    const user = auth.currentUser;
    if (!user) return;
    setLoadingChats(true);
    getUserChats(user.uid, user.email).then((c) => {
      setChats(c.slice(0, 8));
      setLoadingChats(false);
    });
  }, [visible]);

  // ── External share (native sheet) ──────────────────────────────────────────
  const handleExternalShare = async () => {
    try {
      const deepLink = deepLinkPath ? `\n🔗 forus://${deepLinkPath}` : "";
      await Share.share({ message: shareText + deepLink, title });
    } catch {
      // user cancelled or not supported — silently ignore
    }
  };

  // ── Internal chat send ──────────────────────────────────────────────────────
  const handleSendToChat = async (chat: ChatSummary) => {
    const user = auth.currentUser;
    if (!user) return;
    setSendingId(chat.chatId);
    try {
      const myProfile = await getUserProfile(user.uid);
      const senderName = myProfile?.name || "مستخدم";

      if (cardRoute) {
        // Send a rich card message
        await sendCardMessage(
          chat.chatId,
          user.uid,
          senderName,
          cardImage || "",
          cardTitle || title || shareMessage,
          cardRoute,
          `📎 ${cardTitle || title || shareMessage}`
        );
      } else {
        // Fallback: plain text
        await sendMessage(chat.chatId, user.uid, senderName, shareMessage);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      router.push({
        pathname: "/chat",
        params: { chatId: chat.chatId, otherName: chat.otherName },
      } as any);
    } catch {
      Alert.alert("خطأ", "تعذّر إرسال الرسالة، حاول مجدداً");
    } finally {
      setSendingId(null);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Scrim */}
      <Pressable style={styles.overlay} onPress={onClose} />

      {/* Bottom sheet */}
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>مشاركة</Text>

        {/* ── Card preview row (shown when card props are available) ── */}
        {(cardImage || cardTitle) && (
          <View style={styles.cardPreview}>
            {cardImage ? (
              <Image source={{ uri: cardImage }} style={styles.cardPreviewImg} />
            ) : (
              <View style={[styles.cardPreviewImg, styles.cardPreviewImgFallback]}>
                <Feather name="image" size={18} color={C.textMuted} />
              </View>
            )}
            <Text style={styles.cardPreviewTitle} numberOfLines={2}>
              {cardTitle || title}
            </Text>
          </View>
        )}

        {/* ── External share ── */}
        <Pressable
          style={styles.externalBtn}
          onPress={handleExternalShare}
          accessibilityRole="button"
        >
          <Feather name="share-2" size={17} color="#FFF" />
          <Text style={styles.externalBtnText}>مشاركة خارجية (واتساب، تيليغرام…)</Text>
        </Pressable>

        {/* ── Internal chat share ── */}
        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>إرسال لصديق عبر الرسائل</Text>

        {loadingChats ? (
          <ActivityIndicator color={C.accent} style={{ marginVertical: 20 }} />
        ) : chats.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد محادثات بعد</Text>
        ) : (
          <FlatList
            data={chats}
            keyExtractor={(c) => c.chatId}
            style={styles.chatList}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isSending = sendingId === item.chatId;
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.chatRow,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    handleSendToChat(item);
                  }}
                  disabled={!!sendingId}
                >
                  <View style={styles.chatAvatar}>
                    <Text style={styles.chatInitial}>
                      {(item.otherName || "?")[0]}
                    </Text>
                  </View>
                  <Text style={styles.chatName} numberOfLines={1}>
                    {item.otherName || "مستخدم"}
                  </Text>
                  {isSending ? (
                    <ActivityIndicator size="small" color={C.accent} />
                  ) : (
                    <Feather name="send" size={15} color={C.accent} />
                  )}
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 14,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    alignSelf: "center",
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 17,
    fontFamily: "Cairo_700Bold",
    color: C.text,
    textAlign: "center",
    marginBottom: 16,
  },
  // Card preview strip
  cardPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.inputBg,
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  cardPreviewImg: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  cardPreviewImgFallback: {
    backgroundColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cardPreviewTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Cairo_600SemiBold",
    color: C.text,
    textAlign: "right",
  },
  externalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 13,
    marginBottom: 16,
  },
  externalBtnText: {
    fontSize: 14,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
    color: C.textSecondary,
    textAlign: "right",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Cairo_400Regular",
    color: C.textMuted,
    textAlign: "center",
    marginVertical: 20,
  },
  chatList: { maxHeight: 240 },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  chatAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(201,168,76,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  chatInitial: {
    fontSize: 15,
    fontFamily: "Cairo_700Bold",
    color: C.accent,
  },
  chatName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Cairo_600SemiBold",
    color: C.text,
    textAlign: "right",
  },
});
