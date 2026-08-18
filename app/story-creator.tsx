/**
 * story-creator.tsx
 * Full-screen story creation:
 *   • Pick image or video (≤30s) from gallery
 *   • Add draggable coloured text overlay
 *   • Choose background music (preset labels)
 *   • Upload to Firebase Storage → create Firestore doc → back
 */
import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  PanResponder,
  Animated,
  Image,
  Modal,
  TouchableOpacity,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { auth } from "@/lib/firebase";
import { getUserProfile } from "@/lib/db_logic";
import { createStory, uploadStoryMedia } from "@/lib/stories_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

const TEXT_COLORS = [
  "#FFFFFF", "#FFD200", "#FF4B4B",
  "#4BFF8A", "#4BC6FF", "#FF7BFF", "#000000",
];

const MUSIC_PRESETS = [
  { id: "none",      name: "بدون موسيقى",       emoji: "🔇" },
  { id: "calm",      name: "موسيقى هادئة",       emoji: "🎵" },
  { id: "energetic", name: "إيقاع حيوي",          emoji: "🎶" },
  { id: "arabic",    name: "ألحان عربية",         emoji: "🎸" },
  { id: "soft",      name: "ناعمة ورومانسية",     emoji: "🎹" },
  { id: "pop",       name: "بوب عربي",             emoji: "🎤" },
];

export default function StoryCreatorScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "ios" ? insets.top : Math.max(insets.top, 24);

  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [overlayText, setOverlayText] = useState("");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [textVisible, setTextVisible] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState(MUSIC_PRESETS[0]);
  const [showMusicModal, setShowMusicModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Draggable text overlay ────────────────────────────────────────────────
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => textVisible,
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => pan.extractOffset(),
    })
  ).current;

  // ── Image / Video picker ──────────────────────────────────────────────────
  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("إذن مطلوب", "يرجى السماح بالوصول إلى معرض الصور");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
      allowsEditing: true,
      aspect: [9, 16],
      videoMaxDuration: 30,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      setMediaUri(asset.uri);
      setMediaType(asset.type === "video" ? "video" : "image");
      Haptics.selectionAsync();
    }
  };

  // ── Publish ───────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!mediaUri) {
      Alert.alert("اختر وسيطاً", "يرجى اختيار صورة أو فيديو قبل النشر");
      return;
    }
    const user = auth.currentUser;
    if (!user) return;

    setLoading(true);
    try {
      const profile = await getUserProfile(user.uid);
      const mediaUrl = await uploadStoryMedia(mediaUri, mediaType, user.uid);
      await createStory({
        userId: user.uid,
        userName: profile?.name || "مستخدم فورس",
        userPhotoUri: profile?.photoUri || null,
        mediaUrl,
        mediaType,
        text: overlayText.trim() || null,
        textColor: overlayText.trim() ? textColor : null,
        musicName: selectedMusic.id === "none" ? null : selectedMusic.name,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert("خطأ", "حدث خطأ أثناء نشر القصة. حاول مجدداً.");
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: topPad }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10}>
          <Feather name="x" size={22} color="#FFF" />
        </Pressable>
        <Text style={styles.topTitle}>إنشاء قصة</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* ── Media preview ── */}
      <Pressable style={styles.mediaArea} onPress={mediaUri ? undefined : pickMedia}>
        {mediaUri ? (
          <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={styles.mediaPlaceholder}>
            <Feather name="image" size={52} color="rgba(255,255,255,0.35)" />
            <Text style={styles.mediaPlaceholderText}>اضغط لاختيار صورة أو فيديو</Text>
            <Text style={styles.mediaPlaceholderHint}>حتى 30 ثانية للفيديو</Text>
          </View>
        )}

        {/* Draggable text overlay */}
        {textVisible && overlayText.length > 0 && (
          <Animated.View
            style={[
              styles.textOverlay,
              { transform: [{ translateX: pan.x }, { translateY: pan.y }] },
            ]}
            {...panResponder.panHandlers}
          >
            <Text style={[styles.overlayText, { color: textColor }]}>{overlayText}</Text>
          </Animated.View>
        )}
      </Pressable>

      {/* ── Text input area (when text tool is active) ── */}
      {textVisible && (
        <View style={styles.textToolArea}>
          <TextInput
            style={[styles.textInput, { color: textColor }]}
            placeholder="اكتب نصاً على القصة..."
            placeholderTextColor="rgba(255,255,255,0.45)"
            value={overlayText}
            onChangeText={setOverlayText}
            textAlign="right"
            multiline
            maxLength={80}
            autoFocus
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.colorRow}
          >
            {TEXT_COLORS.map((color) => (
              <Pressable
                key={color}
                onPress={() => setTextColor(color)}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: color },
                  textColor === color && styles.colorSwatchActive,
                ]}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Bottom toolbar ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        {/* Change media */}
        <TouchableOpacity style={styles.toolBtn} onPress={pickMedia}>
          <Feather name="image" size={20} color="#FFF" />
          <Text style={styles.toolLabel}>تغيير</Text>
        </TouchableOpacity>

        {/* Text toggle */}
        <TouchableOpacity
          style={[styles.toolBtn, textVisible && styles.toolBtnOn]}
          onPress={() => { setTextVisible((v) => !v); Haptics.selectionAsync(); }}
        >
          <Feather name="type" size={20} color={textVisible ? C.accent : "#FFF"} />
          <Text style={[styles.toolLabel, textVisible && { color: C.accent }]}>نص</Text>
        </TouchableOpacity>

        {/* Music */}
        <TouchableOpacity
          style={styles.toolBtn}
          onPress={() => setShowMusicModal(true)}
        >
          <Ionicons
            name="musical-notes"
            size={20}
            color={selectedMusic.id !== "none" ? C.accent : "#FFF"}
          />
          <Text style={[styles.toolLabel, selectedMusic.id !== "none" && { color: C.accent }]}>
            موسيقى
          </Text>
        </TouchableOpacity>

        {/* Publish */}
        <TouchableOpacity
          style={[styles.publishBtn, loading && styles.publishBtnDisabled]}
          onPress={handlePublish}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color={C.primary} />
          ) : (
            <>
              <Feather name="send" size={15} color={C.primary} />
              <Text style={styles.publishBtnText}>نشر</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Music picker modal ── */}
      <Modal
        visible={showMusicModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMusicModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowMusicModal(false)}>
          <View style={[styles.musicSheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.musicSheetHandle} />
            <Text style={styles.musicSheetTitle}>اختر موسيقى خلفية</Text>
            {MUSIC_PRESETS.map((preset) => (
              <Pressable
                key={preset.id}
                style={[
                  styles.musicOption,
                  selectedMusic.id === preset.id && styles.musicOptionActive,
                ]}
                onPress={() => {
                  setSelectedMusic(preset);
                  setShowMusicModal(false);
                  Haptics.selectionAsync();
                }}
              >
                <Text style={styles.musicEmoji}>{preset.emoji}</Text>
                <Text
                  style={[
                    styles.musicName,
                    selectedMusic.id === preset.id && { color: C.accent },
                  ]}
                >
                  {preset.name}
                </Text>
                {selectedMusic.id === preset.id && (
                  <Ionicons name="checkmark-circle" size={18} color={C.accent} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0A" },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  closeBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  topTitle: { color: "#FFF", fontSize: 16, fontWeight: "700" },

  // Media
  mediaArea: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaPlaceholder: { alignItems: "center", gap: 10 },
  mediaPlaceholderText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  mediaPlaceholderHint: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 12,
    textAlign: "center",
  },

  // Text overlay
  textOverlay: {
    position: "absolute",
    top: "40%",
    left: 20,
    right: 20,
    alignItems: "center",
  },
  overlayText: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  },

  // Text tool area
  textToolArea: {
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  textInput: {
    fontSize: 15,
    paddingVertical: 6,
    paddingHorizontal: 4,
    minHeight: 40,
  },
  colorRow: { flexDirection: "row", gap: 8, paddingVertical: 8 },
  colorSwatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorSwatchActive: { borderColor: "#FFF", transform: [{ scale: 1.2 }] },

  // Bottom toolbar
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "rgba(0,0,0,0.85)",
    paddingTop: 12,
    paddingHorizontal: 8,
    gap: 4,
  },
  toolBtn: { alignItems: "center", gap: 4, minWidth: 54 },
  toolBtnOn: { opacity: 1 },
  toolLabel: { color: "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: "600" },
  publishBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.accent,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  publishBtnDisabled: { opacity: 0.55 },
  publishBtnText: { color: C.primary, fontSize: 14, fontWeight: "700" },

  // Music modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  musicSheet: {
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  musicSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center",
    marginBottom: 14,
  },
  musicSheetTitle: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  musicOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  musicOptionActive: { backgroundColor: "rgba(255,210,0,0.1)" },
  musicEmoji: { fontSize: 20, width: 28, textAlign: "center" },
  musicName: { flex: 1, color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600", textAlign: "right" },
});
