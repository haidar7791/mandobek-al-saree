/**
 * story-viewer.tsx
 * Full-screen Instagram-style story viewer.
 *
 * Route params:
 *   userId — whose stories to show
 *
 * Features:
 *   • Segmented progress bar (auto-advances after 5s / video length)
 *   • Tap left = prev, tap right = next, long-press = pause
 *   • ❤️ like toggle
 *   • Quick reply input (non-owner only)
 *   • 👁 view count strip (owner only)
 *   • 🗑 delete (owner only)
 *   • Text & music-name overlay from creator
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  Image,
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  TouchableOpacity,
  KeyboardAvoidingView,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Video, ResizeMode } from "expo-av";
import { auth } from "@/lib/firebase";
import {
  fetchUserStories,
  markStoryViewed,
  toggleStoryLike,
  deleteStory,
  type Story,
} from "@/lib/stories_logic";
import Colors from "@/constants/colors";

const C = Colors.light;
const { width: W } = Dimensions.get("window");
const IMAGE_DURATION = 5000;  // ms
const VIDEO_DURATION = 15000; // ms (fallback)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} دقيقة`;
  return `منذ ${Math.floor(m / 60)} ساعة`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StoryViewerScreen() {
  const insets = useSafeAreaInsets();
  const { userId: rawUserId } = useLocalSearchParams<{ userId: string | string[] }>();
  // Expo Router can return string | string[] — always normalise to a plain string
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  const currentUserId = auth.currentUser?.uid ?? "";

  const [stories, setStories] = useState<Story[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState(false);
  const [reply, setReply] = useState("");

  const progressAnim = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const pausedProgressRef = useRef(0); // stores progress when paused

  const story = stories[index] ?? null;
  const isOwner = story?.userId === currentUserId;
  const duration = story?.mediaType === "video" ? VIDEO_DURATION : IMAGE_DURATION;

  // ── Load stories ────────────────────────────────────────────────────────
  useEffect(() => {
    // Normalize param — Expo Router can return string | string[]
    const uid = Array.isArray(userId) ? userId[0] : userId;
    if (!uid) { router.back(); return; }

    let cancelled = false;
    (async () => {
      try {
        const data = await fetchUserStories(uid);
        if (cancelled) return;
        if (!data || data.length === 0) {
          router.back();
          return;
        }
        setStories(data);
        setLoading(false);
      } catch {
        // Permission error or network failure — exit gracefully, never crash
        if (!cancelled) router.back();
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  // ── Progress animation ──────────────────────────────────────────────────
  const startProgress = useCallback(
    (fromValue = 0, dur = duration) => {
      progressAnim.setValue(fromValue);
      const remaining = dur * (1 - fromValue / W);
      animationRef.current?.stop();
      const anim = Animated.timing(progressAnim, {
        toValue: W,
        duration: remaining,
        useNativeDriver: false,
      });
      animationRef.current = anim;
      anim.start(({ finished }) => {
        if (finished) goNext();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [duration, index]
  );

  useEffect(() => {
    if (loading || !story) return;
    // mark viewed
    markStoryViewed(story.id, currentUserId).catch(() => {});
    setLiked(story.likes.includes(currentUserId));
    startProgress(0, duration);
    return () => { animationRef.current?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, story?.id, loading]);

  // ── Pause / resume ──────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || !story) return;
    if (paused) {
      animationRef.current?.stop();
      // capture current progress value
      progressAnim.stopAnimation((val) => { pausedProgressRef.current = val; });
    } else {
      startProgress(pausedProgressRef.current, duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  // ── Navigation ──────────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i < stories.length - 1) return i + 1;
      router.back();
      return i;
    });
  }, [stories.length]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  // ── Like ────────────────────────────────────────────────────────────────
  const handleLike = async () => {
    if (!story) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const wasLiked = liked;
    setLiked(!wasLiked);
    try { await toggleStoryLike(story.id, currentUserId, wasLiked); } catch { setLiked(wasLiked); }
  };

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = () => {
    if (!story) return;
    Alert.alert("حذف القصة", "هل أنت متأكد من حذف هذه القصة؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try { await deleteStory(story.id); } catch { /* ignore */ }
          const remaining = stories.filter((_, i) => i !== index);
          if (remaining.length === 0) { router.back(); return; }
          setStories(remaining);
          setIndex(Math.min(index, remaining.length - 1));
        },
      },
    ]);
  };

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  if (!story) return null;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* ── Media background ── */}
      {story.mediaType === "image" ? (
        <Image
          source={{ uri: story.mediaUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <Video
          source={{ uri: story.mediaUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={!paused}
          isLooping={false}
          isMuted={false}
          useNativeControls={false}
        />
      )}

      {/* Gradient overlay (top + bottom) */}
      <View style={styles.gradTop} pointerEvents="none" />
      <View style={styles.gradBottom} pointerEvents="none" />

      {/* Text overlay from creator */}
      {!!story.text && (
        <View style={styles.storyTextWrap} pointerEvents="none">
          <Text style={[styles.storyText, { color: story.textColor || "#FFF" }]}>
            {story.text}
          </Text>
        </View>
      )}

      {/* ── Progress bars ── */}
      <View style={[styles.progressRow, { top: insets.top + 6 }]}>
        {stories.map((_, i) => (
          <View key={i} style={[styles.progressBg, { flex: 1 }]}>
            <Animated.View
              style={[
                styles.progressFill,
                i < index
                  ? { width: "100%" }
                  : i === index
                  ? { width: progressAnim }
                  : { width: 0 },
              ]}
            />
          </View>
        ))}
      </View>

      {/* ── Top bar: user info + actions ── */}
      <View style={[styles.topBar, { top: insets.top + 22 }]}>
        <View style={styles.userRow}>
          <View>
            <Text style={styles.storyUserName}>{story.userName}</Text>
            <Text style={styles.storyTime}>{timeAgo(story.createdAt)}</Text>
          </View>
          {!!story.musicName && (
            <View style={styles.musicTag}>
              <Ionicons name="musical-notes" size={10} color={C.accent} />
              <Text style={styles.musicTagText} numberOfLines={1}>{story.musicName}</Text>
            </View>
          )}
        </View>
        <View style={styles.topActions}>
          {isOwner && (
            <Pressable onPress={handleDelete} hitSlop={10} style={styles.topActionBtn}>
              <Feather name="trash-2" size={18} color="rgba(255,255,255,0.85)" />
            </Pressable>
          )}
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.topActionBtn}>
            <Feather name="x" size={22} color="#FFF" />
          </Pressable>
        </View>
      </View>

      {/* ── View count (owner only) ── */}
      {isOwner && (
        <View style={[styles.viewCountBar, { bottom: insets.bottom + 96 }]}>
          <Feather name="eye" size={13} color="rgba(255,255,255,0.8)" />
          <Text style={styles.viewCountText}>{story.views.length} مشاهدة</Text>
          <Text style={styles.viewLikeCount}>· {story.likes.length} إعجاب</Text>
        </View>
      )}

      {/* ── Bottom bar ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        {!isOwner && (
          <TextInput
            style={styles.replyInput}
            placeholder={`أرسل رداً لـ ${story.userName.split(" ")[0]}...`}
            placeholderTextColor="rgba(255,255,255,0.45)"
            value={reply}
            onChangeText={setReply}
            textAlign="right"
            returnKeyType="send"
            onSubmitEditing={() => { setReply(""); Haptics.selectionAsync(); }}
          />
        )}
        <TouchableOpacity onPress={handleLike} style={styles.likeBtn} activeOpacity={0.7}>
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={32}
            color={liked ? "#FF4B4B" : "#FFF"}
          />
        </TouchableOpacity>
      </View>

      {/* ── Tap areas (prev / next / pause) ── */}
      <Pressable
        style={styles.tapLeft}
        onPress={goPrev}
        onLongPress={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
        delayLongPress={200}
      />
      <Pressable
        style={styles.tapRight}
        onPress={goNext}
        onLongPress={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
        delayLongPress={200}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  loadingRoot: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },

  // Overlay gradients
  gradTop: {
    position: "absolute", top: 0, left: 0, right: 0, height: 130,
    backgroundColor: "transparent",
    // simple semi-transparent via opacity on children — no LinearGradient dep needed
  },
  gradBottom: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 160,
    backgroundColor: "transparent",
  },

  // Story text overlay
  storyTextWrap: {
    position: "absolute",
    top: "42%",
    left: 16,
    right: 16,
    alignItems: "center",
  },
  storyText: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 5,
  },

  // Progress bars
  progressRow: {
    position: "absolute",
    left: 10,
    right: 10,
    flexDirection: "row",
    gap: 4,
    zIndex: 10,
  },
  progressBg: {
    height: 2.5,
    backgroundColor: "rgba(255,255,255,0.35)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#FFF",
    borderRadius: 2,
  },

  // Top bar
  topBar: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    zIndex: 10,
  },
  userRow: { flex: 1, gap: 2 },
  storyUserName: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  storyTime: { color: "rgba(255,255,255,0.65)", fontSize: 11 },
  musicTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  musicTagText: { color: C.accent, fontSize: 10, fontWeight: "600", maxWidth: 100 },
  topActions: { flexDirection: "row", gap: 4, alignItems: "center" },
  topActionBtn: { padding: 6 },

  // View count
  viewCountBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    zIndex: 10,
  },
  viewCountText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600" },
  viewLikeCount: { color: "rgba(255,255,255,0.55)", fontSize: 12 },

  // Bottom bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
    zIndex: 10,
  },
  replyInput: {
    flex: 1,
    height: 44,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 22,
    paddingHorizontal: 16,
    color: "#FFF",
    fontSize: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  likeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },

  // Tap zones
  tapLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 100,
    width: "35%",
    zIndex: 9,
  },
  tapRight: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 100,
    width: "65%",
    zIndex: 9,
  },
});
