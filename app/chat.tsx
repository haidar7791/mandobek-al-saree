import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import { auth } from "../lib/firebase";
import {
  sendMessage,
  sendMediaMessage,
  subscribeToMessages,
  markMessagesRead,
  deleteMessageForEveryone,
  getUserProfile,
  type ChatMessage,
} from "../lib/db_logic";
import { subscribeToPresence } from "../lib/presence";
import Colors from "@/constants/colors";

type PendingMedia =
  | { type: "image"; uri: string }
  | { type: "audio"; uri: string; duration: number };

const C = Colors.light;

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { chatId, otherName } = useLocalSearchParams<{ chatId: string; otherName: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [senderName, setSenderName] = useState("مستخدم");
  const flatRef = useRef<FlatList>(null);

  // Presence state
  const [presenceState, setPresenceState] = useState<"online" | "offline" | null>(null);

  // Media upload state
  const [uploading, setUploading] = useState(false);
  // Media selected/recorded but not yet sent — shown as a preview above the input bar.
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);

  // Audio recording state
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recordingStartTime = useRef<number>(0);

  // Audio playback — track which messageId is playing
  const [playingId, setPlayingId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Full-screen image viewer
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const currentUid = auth.currentUser?.uid;

  // Derive the other participant's uid from chatId
  const otherUid = chatId
    ? chatId.split("_").find((u) => u !== currentUid) || null
    : null;

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !chatId) return;

    getUserProfile(user.uid).then((p) => {
      if (p) setSenderName(p.name || "مستخدم");
    });

    const unsub = subscribeToMessages(chatId, (msgs) => {
      setMessages(msgs);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return unsub;
  }, [chatId]);

  // If the message currently playing gets deleted (or loses its media) from
  // under us, stop playback instead of leaving audio running with no controls.
  useEffect(() => {
    if (!playingId) return;
    const playingMsg = messages.find((m) => m.id === playingId);
    if (!playingMsg || playingMsg.deleted || !playingMsg.mediaUrl) {
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      setPlayingId(null);
    }
  }, [messages, playingId]);

  // Subscribe to other user's presence
  useEffect(() => {
    if (!otherUid) return;
    const unsub = subscribeToPresence(otherUid, (p) => {
      setPresenceState(p?.state ?? "offline");
    });
    return unsub;
  }, [otherUid]);

  // Mark messages as read when screen is focused or messages update
  useFocusEffect(
    useCallback(() => {
      if (chatId && currentUid) {
        markMessagesRead(chatId, currentUid);
      }
    }, [chatId, currentUid])
  );

  useEffect(() => {
    if (chatId && currentUid && messages.length > 0) {
      markMessagesRead(chatId, currentUid);
    }
  }, [messages, chatId, currentUid]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const handleSend = async () => {
    const user = auth.currentUser;
    if (!user || !chatId || uploading) return;

    // If there's a pending media item (image/audio picked but not yet sent),
    // upload+send that; the text box is otherwise reserved for text messages.
    if (pendingMedia) {
      setUploading(true);
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (pendingMedia.type === "image") {
          await sendMediaMessage(chatId, user.uid, senderName, "image", pendingMedia.uri);
        } else {
          await sendMediaMessage(
            chatId,
            user.uid,
            senderName,
            "audio",
            pendingMedia.uri,
            pendingMedia.duration
          );
        }
        setPendingMedia(null);
      } catch (err) {
        Alert.alert("خطأ", "تعذّر إرسال الوسائط، حاول مرة أخرى");
      } finally {
        setUploading(false);
      }
      return;
    }

    if (!text.trim()) return;
    const msg = text.trim();
    setText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await sendMessage(chatId, user.uid, senderName, msg);
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingMedia({ type: "image", uri: asset.uri });
  };

  const handleCancelPendingMedia = () => {
    setPendingMedia(null);
  };

  const handleStartRecording = async () => {
    if (isRecording) return;
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("إذن مرفوض", "يجب منح إذن الميكروفون لإرسال رسائل صوتية");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
      recordingStartTime.current = Date.now();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      Alert.alert("خطأ", "تعذّر بدء التسجيل");
    }
  };

  const handleStopRecording = async () => {
    if (!recording) return;
    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      if (!uri) return;
      const duration = Math.round((Date.now() - recordingStartTime.current) / 1000);
      if (duration < 1) return; // too short, discard
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPendingMedia({ type: "audio", uri, duration });
    } catch (err) {
      Alert.alert("خطأ", "تعذّر إنهاء التسجيل");
    }
  };

  const handlePlayAudio = async (item: ChatMessage) => {
    if (!item.mediaUrl) return;
    // If this message is already playing, stop it
    if (playingId === item.id) {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      setPlayingId(null);
      return;
    }
    // Stop any currently playing sound
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setPlayingId(item.id);
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: item.mediaUrl },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
      });
    } catch (err) {
      setPlayingId(null);
      Alert.alert("خطأ", "تعذّر تشغيل الرسالة الصوتية");
    }
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleDeleteMessage = (item: ChatMessage) => {
    if (!chatId) return;
    Alert.alert(
      "حذف الرسالة",
      "هل تريد حذف هذه الرسالة للجميع؟ لا يمكن التراجع عن هذا الإجراء.",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف الرسالة للجميع",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMessageForEveryone(chatId, item.id);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } catch {
              Alert.alert("خطأ", "تعذّر حذف الرسالة");
            }
          },
        },
      ]
    );
  };

  const handleLongPressMessage = (item: ChatMessage) => {
    if (item.senderId !== currentUid || item.deleted) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("خيارات الرسالة", undefined, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف الرسالة للجميع",
        style: "destructive",
        onPress: () => handleDeleteMessage(item),
      },
    ]);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMine = item.senderId === currentUid;
    const time = new Date(item.createdAt).toLocaleTimeString("ar-IQ", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const readIndicator = isMine ? (
      <View style={styles.readIndicator}>
        {item.read ? (
          <>
            <Feather name="check" size={11} color="#60a5fa" />
            <Feather name="check" size={11} color="#60a5fa" style={{ marginLeft: -5 }} />
          </>
        ) : (
          <Feather name="check" size={11} color="rgba(255,255,255,0.5)" />
        )}
      </View>
    ) : null;

    let bubbleContent: React.ReactNode;
    if (item.deleted) {
      bubbleContent = (
        <View style={styles.deletedRow}>
          <Feather
            name="slash"
            size={13}
            color={isMine ? "rgba(255,255,255,0.6)" : C.textMuted}
          />
          <Text
            style={[
              styles.deletedText,
              isMine ? { color: "rgba(255,255,255,0.6)" } : { color: C.textMuted },
            ]}
          >
            {item.text}
          </Text>
        </View>
      );
    } else if (item.type === "image" && item.mediaUrl) {
      bubbleContent = (
        <View>
          <Pressable onPress={() => setViewerUri(item.mediaUrl!)}>
            <Image
              source={{ uri: item.mediaUrl }}
              style={styles.imageBubble}
              contentFit="cover"
            />
          </Pressable>
          <View style={styles.mediaFooter}>
            <View style={styles.readIndicatorRow}>
              {readIndicator}
              <Text style={[styles.msgTime, isMine ? { color: "rgba(255,255,255,0.6)" } : { color: C.textMuted }]}>
                {time}
              </Text>
            </View>
          </View>
        </View>
      );
    } else if (item.type === "audio") {
      const isPlaying = playingId === item.id;
      bubbleContent = (
        <View style={styles.audioBubble}>
          <Pressable
            style={[styles.playBtn, isMine ? styles.playBtnMine : styles.playBtnTheirs]}
            onPress={() => handlePlayAudio(item)}
          >
            <Feather
              name={isPlaying ? "pause" : "play"}
              size={16}
              color={isMine ? C.primary : "#FFF"}
            />
          </Pressable>
          <Text style={[styles.audioDuration, isMine ? { color: "rgba(255,255,255,0.9)" } : { color: C.text }]}>
            {formatDuration(item.duration)}
          </Text>
          <View style={styles.readIndicatorRow}>
            {readIndicator}
            <Text style={[styles.msgTime, isMine ? { color: "rgba(255,255,255,0.6)" } : { color: C.textMuted }]}>
              {time}
            </Text>
          </View>
        </View>
      );
    } else {
      bubbleContent = (
        <>
          <Text style={[styles.msgText, isMine ? styles.msgTextMine : styles.msgTextTheirs]}>
            {item.text}
          </Text>
          <View style={styles.readIndicatorRow}>
            {readIndicator}
            <Text style={[styles.msgTime, isMine ? { color: "rgba(255,255,255,0.6)" } : { color: C.textMuted }]}>
              {time}
            </Text>
          </View>
        </>
      );
    }

    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
        <Pressable
          onLongPress={() => handleLongPressMessage(item)}
          delayLongPress={350}
          style={[styles.msgBubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}
        >
          {bubbleContent}
        </Pressable>
      </View>
    );
  };

  const presenceLabel =
    presenceState === "online" ? "نشط الآن" : presenceState === "offline" ? "غير نشط" : "دردشة مباشرة";
  const presenceColor =
    presenceState === "online" ? "#4ade80" : "rgba(255,255,255,0.5)";

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <LinearGradient
        colors={["#0D1B3E", "#162452"]}
        style={[styles.header, { paddingTop: topPad + 8 }]}
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={22} color="#FFF" />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{otherName}</Text>
          <View style={styles.presenceRow}>
            {presenceState === "online" && (
              <View style={styles.onlineDot} />
            )}
            <Text style={[styles.headerSub, { color: presenceColor }]}>
              {presenceLabel}
            </Text>
          </View>
        </View>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>{otherName?.[0] ?? "?"}</Text>
        </View>
      </LinearGradient>

      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.msgList, { paddingBottom: 12 }]}
        showsVerticalScrollIndicator={false}
        renderItem={renderMessage}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Feather name="message-circle" size={40} color={C.textMuted} />
            <Text style={styles.emptyChatText}>ابدأ محادثة مع صاحب الاختصاص</Text>
          </View>
        }
      />

      {pendingMedia && (
        <View style={styles.pendingBar}>
          {pendingMedia.type === "image" ? (
            <Image source={{ uri: pendingMedia.uri }} style={styles.pendingThumb} contentFit="cover" />
          ) : (
            <View style={styles.pendingAudioPreview}>
              <Feather name="mic" size={16} color={C.accent} />
              <Text style={styles.pendingAudioText}>
                رسالة صوتية · {formatDuration(pendingMedia.duration)}
              </Text>
            </View>
          )}
          <Text style={styles.pendingLabel}>
            {pendingMedia.type === "image" ? "جاهزة للإرسال" : "جاهزة للإرسال"}
          </Text>
          <Pressable style={styles.pendingCancelBtn} onPress={handleCancelPendingMedia} disabled={uploading}>
            <Feather name="x" size={16} color={C.textMuted} />
          </Pressable>
        </View>
      )}

      <View style={[styles.inputBar, { paddingBottom: bottomPad + 8 }]}>
        {/* Media icons (image / voice) — left side of the bar */}
        {uploading ? (
          <ActivityIndicator size="small" color={C.accent} style={styles.uploadSpinner} />
        ) : (
          <>
            <Pressable
              style={[styles.mediaBtn, isRecording && styles.mediaBtnActive]}
              onPress={isRecording ? handleStopRecording : handleStartRecording}
              disabled={!!pendingMedia}
            >
              <Feather name="mic" size={18} color={isRecording ? "#ef4444" : C.textMuted} />
            </Pressable>
            <Pressable
              style={styles.mediaBtn}
              onPress={handlePickImage}
              disabled={!!pendingMedia || isRecording}
            >
              <Feather name="image" size={18} color={C.textMuted} />
            </Pressable>
          </>
        )}

        <TextInput
          style={styles.textInput}
          placeholder={isRecording ? "جارٍ التسجيل..." : "اكتب رسالتك..."}
          placeholderTextColor={isRecording ? "#ef4444" : C.textMuted}
          value={text}
          onChangeText={setText}
          textAlign="right"
          multiline
          maxLength={500}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!isRecording && !pendingMedia}
        />

        {/* Send button — rightmost, next to the text input */}
        <Pressable
          style={[
            styles.sendBtn,
            (uploading || (!text.trim() && !pendingMedia)) && { opacity: 0.5 },
          ]}
          onPress={handleSend}
          disabled={uploading || (!text.trim() && !pendingMedia)}
        >
          <LinearGradient colors={[C.accent, C.accentLight]} style={styles.sendBtnGrad}>
            <Feather name="send" size={18} color={C.primary} />
          </LinearGradient>
        </Pressable>
      </View>

      {/* Full-screen image viewer */}
      <Modal
        visible={!!viewerUri}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerUri(null)}
      >
        <View style={styles.viewerBackdrop}>
          <Pressable
            style={styles.viewerCloseBtn}
            onPress={() => setViewerUri(null)}
          >
            <Feather name="x" size={26} color="#FFF" />
          </Pressable>
          {viewerUri && (
            <Image
              source={{ uri: viewerUri }}
              style={styles.viewerImage}
              contentFit="contain"
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  headerInfo: { flex: 1, alignItems: "flex-end" },
  headerName: { fontSize: 16, fontFamily: "Cairo_700Bold", color: "#FFF", textAlign: "right" },
  headerSub: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  presenceRow: { flexDirection: "row", alignItems: "center", gap: 5, justifyContent: "flex-end" },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#4ade80" },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(201,168,76,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  headerAvatarText: { fontSize: 18, fontFamily: "Cairo_700Bold", color: C.accent },
  msgList: { padding: 14, gap: 8 },
  msgRow: { flexDirection: "row" },
  msgRowMine: { justifyContent: "flex-start" },
  msgRowTheirs: { justifyContent: "flex-end" },
  msgBubble: {
    maxWidth: "75%", borderRadius: 16, paddingHorizontal: 14,
    paddingVertical: 10, gap: 4,
  },
  bubbleMine: { backgroundColor: C.primary, borderBottomLeftRadius: 4 },
  bubbleTheirs: { backgroundColor: C.card, borderBottomRightRadius: 4 },
  msgText: { fontSize: 14, fontFamily: "Cairo_400Regular", lineHeight: 22 },
  msgTextMine: { color: "#FFF", textAlign: "left" },
  msgTextTheirs: { color: C.text, textAlign: "right" },
  msgTime: { fontSize: 10, fontFamily: "Cairo_400Regular" },
  readIndicator: { flexDirection: "row", alignItems: "center" },
  readIndicatorRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 2 },
  imageBubble: { width: 200, height: 200, borderRadius: 10 },
  mediaFooter: { marginTop: 4 },
  audioBubble: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 140 },
  playBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  playBtnMine: { backgroundColor: "rgba(255,255,255,0.25)" },
  playBtnTheirs: { backgroundColor: C.primary },
  audioDuration: { fontSize: 13, fontFamily: "Cairo_400Regular", flex: 1 },
  emptyChat: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyChatText: { fontSize: 14, fontFamily: "Cairo_400Regular", color: C.textMuted },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
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
  mediaBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.inputBg,
    alignItems: "center", justifyContent: "center",
  },
  mediaBtnActive: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1, borderColor: "#ef4444",
  },
  uploadSpinner: { width: 38, height: 38, justifyContent: "center", alignItems: "center" },
  deletedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  deletedText: { fontSize: 13, fontFamily: "Cairo_400Regular", fontStyle: "italic" },
  pendingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  pendingThumb: { width: 48, height: 48, borderRadius: 8 },
  pendingAudioPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.inputBg,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  pendingAudioText: { fontSize: 12.5, fontFamily: "Cairo_600SemiBold", color: C.text },
  pendingLabel: { flex: 1, fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textMuted, textAlign: "right" },
  pendingCancelBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerCloseBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  viewerImage: { width: "100%", height: "80%" },
});
