import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
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
  getArtisanByUserId,
  ADMIN_UID,
  ADMIN_DISPLAY_NAME,
  type ChatMessage,
  type ArtisanProfile,
} from "../lib/db_logic";
import { subscribeToPresence } from "../lib/presence";
import Colors from "@/constants/colors";

// Only images use the pending-preview step before sending. Voice notes are
// uploaded and sent immediately when the user confirms the recording.
type PendingMedia = { type: "image"; uri: string };

const C = Colors.light;

export interface ChatRoomProps {
  chatId: string;
  otherName: string;
  /** Explicit uid of the other participant. Derived from chatId if omitted. */
  otherUid?: string | null;
  /**
   * Pre-fetched artisan profile for the other participant (JSON-serialized),
   * passed by callers that already have it — e.g. the artisan-profile screen
   * navigating into a chat. Lets the header avatar/name become tappable
   * instantly instead of waiting on a Firestore round-trip. If omitted,
   * ChatRoom resolves it itself from `otherUid` in the background.
   */
  otherArtisan?: string | null;
  /** Whether to show the live online/offline presence indicator. Default true. */
  showPresence?: boolean;
  /** Feather icon to render in the header avatar instead of the name initial. */
  headerIcon?: keyof typeof Feather.glyphMap;
  /** Subtitle shown under the header name when presence is hidden. */
  headerSubtitle?: string;
}

function parsePassedArtisan(raw?: string | null): ArtisanProfile | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ArtisanProfile;
  } catch {
    return null;
  }
}

/**
 * Full-featured chat room UI: text, images, voice notes, read receipts,
 * "delete for everyone", and a full-screen image viewer. Shared by regular
 * user↔artisan chats (app/chat.tsx) and the support chat (app/support.tsx)
 * so both get identical media capabilities.
 */
export default function ChatRoom({
  chatId,
  otherName,
  otherUid: otherUidProp,
  otherArtisan,
  showPresence = true,
  headerIcon,
  headerSubtitle,
}: ChatRoomProps) {
  const insets = useSafeAreaInsets();
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
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingStartTime = useRef<number>(0);
  const isRecordingRef = useRef(false);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // TikTok-style pulsing waveform bars shown while recording.
  const waveAnims = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(6))
  );

  const animateWaveBar = (anim: Animated.Value) => {
    const next = () => {
      if (!isRecordingRef.current) return;
      const toValue = 6 + Math.random() * 18;
      Animated.timing(anim, {
        toValue,
        duration: 280 + Math.random() * 220,
        useNativeDriver: false,
      }).start(() => next());
    };
    next();
  };

  const startWaveAnimation = () => {
    waveAnims.current.forEach((anim) => animateWaveBar(anim));
  };

  const stopWaveAnimation = () => {
    waveAnims.current.forEach((anim) => {
      anim.stopAnimation();
      anim.setValue(6);
    });
  };

  // Audio playback — track which messageId is playing
  const [playingId, setPlayingId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Full-screen image viewer
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const currentUid = auth.currentUser?.uid;

  // Derive the other participant's uid from chatId unless explicitly provided.
  const otherUid =
    otherUidProp ?? (chatId ? chatId.split("_").find((u) => u !== currentUid) || null : null);

  // Artisan profile of the other participant, used to make the header
  // avatar/name tappable and to open their profile instantly. Seeded from
  // the `otherArtisan` param (if the caller already had it) and quietly
  // reconciled in the background from `otherUid` — mirrors the same
  // instant-paint pattern used by app/artisan-profile.tsx.
  const initialOtherArtisan = useMemo(() => parsePassedArtisan(otherArtisan), [otherArtisan]);
  const [otherArtisanProfile, setOtherArtisanProfile] = useState<ArtisanProfile | null>(
    initialOtherArtisan
  );

  useEffect(() => {
    if (!otherUid || otherUid === ADMIN_UID) {
      setOtherArtisanProfile(null);
      return;
    }
    let cancelled = false;
    getArtisanByUserId(otherUid).then((a) => {
      if (!cancelled) setOtherArtisanProfile(a);
    });
    return () => {
      cancelled = true;
    };
  }, [otherUid]);

  const handleOpenArtisanProfile = () => {
    if (!otherArtisanProfile) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/artisan-profile",
      params: {
        artisanId: otherArtisanProfile.id,
        artisan: JSON.stringify(otherArtisanProfile),
      },
    });
  };

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
    if (!showPresence || !otherUid) return;
    const unsub = subscribeToPresence(otherUid, (p) => {
      setPresenceState(p?.state ?? "offline");
    });
    return unsub;
  }, [otherUid, showPresence]);

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

  // Cleanup audio/timers on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      isRecordingRef.current = false;
    };
  }, []);

  const handleSend = async () => {
    const user = auth.currentUser;
    if (!user || !chatId || uploading) return;

    // If there's a pending image (picked but not yet sent), upload+send it;
    // the text box is otherwise reserved for text messages.
    if (pendingMedia) {
      setUploading(true);
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await sendMediaMessage(chatId, user.uid, senderName, "image", pendingMedia.uri);
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
      isRecordingRef.current = true;
      recordingStartTime.current = Date.now();
      setRecordingSeconds(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
      startWaveAnimation();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      Alert.alert("خطأ", "تعذّر بدء التسجيل");
    }
  };

  const stopRecordingTimer = () => {
    isRecordingRef.current = false;
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    stopWaveAnimation();
  };

  // Confirming a recording (✔) sends the voice note immediately — no
  // preview/draft step, unlike picked images.
  const handleStopRecording = async () => {
    if (!recording) return;
    let uri: string | null = null;
    let duration = 0;
    try {
      setIsRecording(false);
      stopRecordingTimer();
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();
      duration = Math.round((Date.now() - recordingStartTime.current) / 1000);
    } catch (err) {
      Alert.alert("خطأ", "تعذّر إنهاء التسجيل");
    } finally {
      setRecording(null);
      setRecordingSeconds(0);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    }

    if (!uri || duration < 1) return; // too short or failed, discard

    const user = auth.currentUser;
    if (!user || !chatId) return;

    setUploading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await sendMediaMessage(chatId, user.uid, senderName, "audio", uri, duration);
    } catch (err) {
      Alert.alert("خطأ", "تعذّر إرسال الرسالة الصوتية");
    } finally {
      setUploading(false);
    }
  };

  // TikTok-style cancel: discard the in-progress recording without sending it.
  const handleCancelRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    stopRecordingTimer();
    setRecordingSeconds(0);
    try {
      await recording.stopAndUnloadAsync();
    } catch {
      // already stopped/unloaded — ignore
    }
    setRecording(null);
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch {}
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    const isAdminSender = !isMine && item.senderId === ADMIN_UID;
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
          {isAdminSender && <Text style={styles.adminLabel}>{ADMIN_DISPLAY_NAME}</Text>}
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
      behavior={Platform.select({ ios: "padding", android: "height", default: undefined })}
      keyboardVerticalOffset={0}
    >
      <LinearGradient
        colors={["#0D1B3E", "#162452"]}
        style={[styles.header, { paddingTop: topPad + 8 }]}
      >
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={22} color="#FFF" />
        </Pressable>
        <Pressable
          style={styles.headerInfo}
          onPress={handleOpenArtisanProfile}
          disabled={!otherArtisanProfile}
          hitSlop={6}
        >
          <Text style={styles.headerName}>{otherName}</Text>
          {showPresence ? (
            <View style={styles.presenceRow}>
              {presenceState === "online" && <View style={styles.onlineDot} />}
              <Text style={[styles.headerSub, { color: presenceColor }]}>{presenceLabel}</Text>
            </View>
          ) : headerSubtitle ? (
            <Text style={[styles.headerSub, { color: "rgba(255,255,255,0.5)" }]}>{headerSubtitle}</Text>
          ) : null}
        </Pressable>
        <Pressable
          style={styles.headerAvatar}
          onPress={handleOpenArtisanProfile}
          disabled={!otherArtisanProfile}
          hitSlop={6}
        >
          {otherArtisanProfile?.photoUri ? (
            <Image
              source={{ uri: otherArtisanProfile.photoUri }}
              style={styles.headerAvatarImage}
              contentFit="cover"
            />
          ) : headerIcon ? (
            <Feather name={headerIcon} size={18} color={C.accent} />
          ) : (
            <Text style={styles.headerAvatarText}>{otherName?.[0] ?? "?"}</Text>
          )}
        </Pressable>
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
            <Text style={styles.emptyChatText}>ابدأ المحادثة الآن</Text>
          </View>
        }
      />

      {pendingMedia && (
        <View style={styles.pendingBar}>
          <Image source={{ uri: pendingMedia.uri }} style={styles.pendingThumb} contentFit="cover" />
          <Text style={styles.pendingLabel}>جاهزة للإرسال</Text>
          <Pressable style={styles.pendingCancelBtn} onPress={handleCancelPendingMedia} disabled={uploading}>
            <Feather name="x" size={16} color={C.textMuted} />
          </Pressable>
        </View>
      )}

      {isRecording ? (
        // TikTok-style recording bar: cancel (trash) on the right where the
        // mic button normally sits, live timer + pulsing waveform in the
        // middle, and a confirm button on the left where send normally sits.
        <View style={[styles.recordingBar, { paddingBottom: bottomPad + 8 }]}>
          <Pressable style={styles.trashBtn} onPress={handleCancelRecording}>
            <Feather name="trash-2" size={20} color="#ef4444" />
          </Pressable>

          <View style={styles.waveformRow}>
            <View style={styles.recDot} />
            <Text style={styles.recordingTimerText}>{formatDuration(recordingSeconds)}</Text>
            <View style={styles.waveformBars}>
              {waveAnims.current.map((anim, i) => (
                <Animated.View key={i} style={[styles.waveBar, { height: anim }]} />
              ))}
            </View>
          </View>

          <Pressable style={styles.confirmRecordingBtn} onPress={handleStopRecording}>
            <LinearGradient colors={[C.accent, C.accentLight]} style={styles.confirmRecordingGrad}>
              <Feather name="check" size={18} color={C.primary} />
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.inputBar, { paddingBottom: bottomPad + 8 }]}>
          {/* Mic + image icons — right side of the bar (mic outermost) */}
          {uploading ? (
            <ActivityIndicator size="small" color={C.accent} style={styles.uploadSpinner} />
          ) : (
            <>
              <Pressable
                style={styles.mediaBtn}
                onPress={handleStartRecording}
                disabled={!!pendingMedia}
              >
                <Feather name="mic" size={18} color={C.textMuted} />
              </Pressable>
              <Pressable
                style={styles.mediaBtn}
                onPress={handlePickImage}
                disabled={!!pendingMedia}
              >
                <Feather name="image" size={18} color={C.textMuted} />
              </Pressable>
            </>
          )}

          <TextInput
            style={styles.textInput}
            placeholder="اكتب رسالتك..."
            placeholderTextColor={C.textMuted}
            value={text}
            onChangeText={setText}
            textAlign="right"
            multiline
            maxLength={500}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={!pendingMedia}
          />

          {/* Send button — left side of the bar */}
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
      )}

      {/* Full-screen image viewer */}
      <Modal
        visible={!!viewerUri}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerUri(null)}
      >
        <View style={styles.viewerBackdrop}>
          <Pressable style={styles.viewerCloseBtn} onPress={() => setViewerUri(null)}>
            <Feather name="x" size={26} color="#FFF" />
          </Pressable>
          {viewerUri && (
            <Image source={{ uri: viewerUri }} style={styles.viewerImage} contentFit="contain" />
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
    overflow: "hidden",
  },
  headerAvatarImage: { width: 40, height: 40, borderRadius: 12 },
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
  adminLabel: {
    fontSize: 10, fontFamily: "Cairo_600SemiBold",
    color: C.accent, textAlign: "right",
  },
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
    // row-reverse so the mic/image icons land on the right and the send
    // button lands on the left, matching RTL reading order.
    flexDirection: "row-reverse", alignItems: "flex-end", gap: 8,
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
  // TikTok-style recording bar: trash on the right (mic's slot), waveform +
  // timer filling the middle, confirm button on the left (send's slot).
  recordingBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  trashBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  waveformRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.inputBg,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  recDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  recordingTimerText: {
    fontSize: 14, fontFamily: "Cairo_700Bold", color: C.text,
    minWidth: 34,
  },
  waveformBars: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 24,
  },
  waveBar: {
    width: 3, borderRadius: 2, backgroundColor: C.accent, minHeight: 4,
  },
  confirmRecordingBtn: { width: 44, height: 44, borderRadius: 14, overflow: "hidden" },
  confirmRecordingGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
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
