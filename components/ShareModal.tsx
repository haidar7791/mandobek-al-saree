/**
 * ShareModal — external sharing plus internal sharing.
 * Internal sharing keeps recent chats and also provides a global user search.
 */
import React, { useEffect, useState } from "react";
import {
  Modal, View, Text, FlatList, Pressable, Share, StyleSheet,
  ActivityIndicator, Alert, Image, TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { auth } from "@/lib/firebase";
import {
  sendMessage,
  sendCardMessage,
  sendOrderCardMessage,
  getUserChats,
  getUserProfile,
  searchUsersForSharing,
  type ChatSummary,
  type ShareUserResult,
  type OrderSharePayload,
} from "@/lib/db_logic";
import Colors from "@/constants/colors";
import { PUBLIC_SHARE_BASE_URL } from "@/lib/config";

const C = Colors.light;

export interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  shareText: string;
  shareMessage: string;
  title?: string;
  cardImage?: string;
  cardTitle?: string;
  cardRoute?: string;
  /** Path without scheme, e.g. product/ABC or profile/UID. */
  deepLinkPath?: string;
  /** Optional structured details shown on a shared product card. */
  cardDetails?: string[];
  /** One or more accepted seller orders to send as rich order cards. */
  orderCards?: OrderSharePayload[];
}

export function ShareModal({
  visible, onClose, shareText, shareMessage, title, cardImage, cardTitle, cardRoute,
  deepLinkPath, cardDetails, orderCards,
}: ShareModalProps) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [searchResults, setSearchResults] = useState<ShareUserResult[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loadingChats, setLoadingChats] = useState(false);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setChats([]); setSearchResults([]); setSearchText(""); return;
    }
    const user = auth.currentUser;
    if (!user) return;
    setLoadingChats(true);
    getUserChats(user.uid, user.email).then((c) => {
      setChats(c.slice(0, 12));
    }).finally(() => setLoadingChats(false));
  }, [visible]);

  useEffect(() => {
    if (!visible || !searchText.trim()) { setSearchResults([]); setSearching(false); return; }
    const timer = setTimeout(async () => {
      const user = auth.currentUser;
      if (!user) return;
      setSearching(true);
      try { setSearchResults(await searchUsersForSharing(searchText, user.uid)); }
      catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchText, visible]);

  const handleExternalShare = async () => {
    try {
      let links = "";
      if (deepLinkPath) {
        const httpsLink = `${PUBLIC_SHARE_BASE_URL}/${deepLinkPath.replace(/^\//, "")}`;
        links = `\n\n🔗 ${httpsLink}`;
      }
      if (orderCards?.length) {
        links = orderCards.map((o) => `\n\n📦 ${o.productTitle}\n🔗 ${PUBLIC_SHARE_BASE_URL}/product/${o.productId}`).join("");
      }
      await Share.share({ message: shareText + links, title });
    } catch {}
  };

  const sendToRecipient = async (recipient: { chatId?: string; otherUserId?: string; otherName: string }) => {
    const user = auth.currentUser;
    if (!user) return;
    const recipientId = recipient.otherUserId;
    if (!recipientId) return;
    const chatId = recipient.chatId || [user.uid, recipientId].sort().join("_");
    setSendingId(recipientId);
    try {
      const myProfile = await getUserProfile(user.uid);
      const senderName = myProfile?.name || "مستخدم";
      if (orderCards?.length) {
        for (const order of orderCards) await sendOrderCardMessage(chatId, user.uid, senderName, order);
      } else if (cardRoute) {
        await sendCardMessage(
          chatId,
          user.uid,
          senderName,
          cardImage || "",
          cardTitle || title || shareMessage,
          cardRoute,
          `📌 ${cardTitle || title || shareMessage}`,
          cardDetails,
        );
      } else {
        await sendMessage(chatId, user.uid, senderName, shareMessage);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      router.push({ pathname: "/chat", params: { chatId, otherName: recipient.otherName } } as any);
    } catch {
      Alert.alert("خطأ", "تعذّر إرسال المشاركة، حاول مجدداً");
    } finally { setSendingId(null); }
  };

  const renderRecipient = (item: { chatId?: string; otherUserId?: string; otherName: string; otherPhotoUri?: string | null; roleLabel?: string }) => {
    const id = item.otherUserId || item.chatId || "";
    const isSending = sendingId === id;
    return (
      <Pressable style={({ pressed }) => [styles.chatRow, pressed && { opacity: .7 }]} onPress={() => { Haptics.selectionAsync(); sendToRecipient(item); }} disabled={!!sendingId}>
        {item.otherPhotoUri ? <Image source={{ uri: item.otherPhotoUri }} style={styles.chatAvatarImg} /> : <View style={styles.chatAvatar}><Text style={styles.chatInitial}>{(item.otherName || "?")[0]}</Text></View>}
        <View style={styles.recipientMeta}>
          <Text style={styles.chatName} numberOfLines={1}>{item.otherName || "مستخدم"}</Text>
          {item.roleLabel ? <Text style={styles.roleLabel}>{item.roleLabel}</Text> : null}
        </View>
        {isSending ? <ActivityIndicator size="small" color={C.accent} /> : <Feather name="send" size={15} color={C.accent} />}
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.overlay} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>مشاركة</Text>

          {(cardImage || cardTitle || orderCards?.length) && (
            <View style={styles.cardPreview}>
              {orderCards?.length ? <View style={[styles.cardPreviewImg, styles.cardPreviewImgFallback]}><Feather name="package" size={18} color={C.textMuted} /></View> : cardImage ? <Image source={{ uri: cardImage }} style={styles.cardPreviewImg} /> : <View style={[styles.cardPreviewImg, styles.cardPreviewImgFallback]}><Feather name="user" size={18} color={C.textMuted} /></View>}
              <View style={{ flex: 1 }}>
                <Text style={styles.cardPreviewTitle} numberOfLines={2}>{orderCards?.length ? `مشاركة ${orderCards.length} طلب${orderCards.length > 1 ? "ات" : ""}` : cardTitle || title}</Text>
                {cardDetails?.slice(0, 2).map((detail, index) => (
                  <Text key={`${detail}-${index}`} style={styles.cardPreviewDetail} numberOfLines={1}>{detail}</Text>
                ))}
              </View>
            </View>
          )}

          <Pressable style={styles.externalBtn} onPress={handleExternalShare} accessibilityRole="button">
            <Feather name="share-2" size={17} color="#FFF" />
            <Text style={styles.externalBtnText}>مشاركة خارجية (واتساب، تيليغرام…)</Text>
          </Pressable>

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>إرسال لصديق عبر الرسائل</Text>
          <View style={styles.searchBox}>
            <Feather name="search" size={18} color={C.textMuted} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="ابحث عن اسم أي مستخدم في فورس"
              placeholderTextColor={C.textMuted}
              style={styles.searchInput}
              textAlign="right"
              autoCorrect={false}
              returnKeyType="search"
            />
            {!!searchText && <Pressable onPress={() => setSearchText("")}><Feather name="x-circle" size={17} color={C.textMuted} /></Pressable>}
          </View>

          {searchText.trim() ? (
            searching ? <ActivityIndicator color={C.accent} style={{ marginVertical: 16 }} /> : searchResults.length ? (
              <FlatList data={searchResults} keyExtractor={(u) => u.userId} style={styles.chatList} keyboardShouldPersistTaps="handled" renderItem={({ item }) => renderRecipient({ otherUserId: item.userId, otherName: item.name, otherPhotoUri: item.photoUri, roleLabel: item.roleLabel })} />
            ) : <Text style={styles.emptyText}>لا يوجد مستخدم بهذا الاسم</Text>
          ) : loadingChats ? (
            <ActivityIndicator color={C.accent} style={{ marginVertical: 20 }} />
          ) : chats.length === 0 ? (
            <Text style={styles.emptyText}>لا توجد محادثات بعد — استخدم البحث أعلاه</Text>
          ) : (
            <FlatList data={chats} keyExtractor={(c) => c.chatId} style={styles.chatList} keyboardShouldPersistTaps="handled" renderItem={({ item }) => renderRecipient({ ...item, otherUserId: item.otherUserId, otherName: item.otherName, otherPhotoUri: item.otherPhotoUri })} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { backgroundColor: "#FFF", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 14, maxHeight: "88%" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 14 },
  sheetTitle: { fontSize: 17, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "center", marginBottom: 16 },
  cardPreview: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.inputBg, borderRadius: 12, padding: 10, marginBottom: 14 },
  cardPreviewImg: { width: 48, height: 48, borderRadius: 10 },
  cardPreviewImgFallback: { backgroundColor: C.border, alignItems: "center", justifyContent: "center" },
  cardPreviewTitle: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.text, textAlign: "right" },
  cardPreviewDetail: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted, textAlign: "right", marginTop: 2 },
  externalBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 13, marginBottom: 16 },
  externalBtnText: { fontSize: 14, fontFamily: "Cairo_700Bold", color: "#FFF" },
  divider: { height: 1, backgroundColor: "#F1F5F9", marginBottom: 12 },
  sectionLabel: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.textSecondary, textAlign: "right", marginBottom: 8 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.inputBg, borderRadius: 13, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, marginBottom: 8 },
  searchInput: { flex: 1, minHeight: 44, fontSize: 13, fontFamily: "Cairo_400Regular", color: C.text },
  emptyText: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textMuted, textAlign: "center", marginVertical: 20 },
  chatList: { maxHeight: 300 },
  chatRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F8FAFC" },
  chatAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(201,168,76,0.15)", alignItems: "center", justifyContent: "center" },
  chatAvatarImg: { width: 38, height: 38, borderRadius: 19 },
  chatInitial: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.accent },
  recipientMeta: { flex: 1, alignItems: "flex-end" },
  chatName: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.text, textAlign: "right" },
  roleLabel: { fontSize: 10, fontFamily: "Cairo_400Regular", color: C.textMuted, textAlign: "right", marginTop: 1 },
});

