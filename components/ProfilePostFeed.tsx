import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ResizeMode, Video } from "expo-av";
import type { ProfilePost } from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

type Props = {
  posts: ProfilePost[];
  loading?: boolean;
  canDelete?: boolean;
  deletingPostId?: string | null;
  onDelete?: (post: ProfilePost) => void;
  showEmptyState?: boolean;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  /** Called by a double-tap on a post. Return true when the like was recorded. */
  onDoubleTapLike?: (post: ProfilePost) => Promise<boolean> | boolean;
};

export default function ProfilePostFeed({
  posts,
  loading = false,
  canDelete = false,
  deletingPostId,
  onDelete,
  showEmptyState = false,
  title = "المنشورات",
  actionLabel,
  onAction,
  actionDisabled = false,
  onDoubleTapLike,
}: Props) {
  const [fullscreenPost, setFullscreenPost] = useState<ProfilePost | null>(null);
  const [heartPostId, setHeartPostId] = useState<string | null>(null);
  const lastTapRef = useRef<Record<string, number>>({});
  const heartScale = useSharedValue(0.35);
  const heartOpacity = useSharedValue(0);
  const heartStyle = useAnimatedStyle(() => ({
    opacity: heartOpacity.value,
    transform: [{ scale: heartScale.value }],
  }));

  const showLikeEffect = (postId: string) => {
    setHeartPostId(postId);
    heartScale.value = 0.35;
    heartOpacity.value = 0;
    heartOpacity.value = withTiming(1, { duration: 90 });
    heartScale.value = withSpring(1.15, { damping: 7, stiffness: 260 });
    setTimeout(() => {
      heartOpacity.value = withTiming(0, { duration: 240 });
      heartScale.value = withTiming(0.9, { duration: 240 });
      setTimeout(() => setHeartPostId((current) => current === postId ? null : current), 250);
    }, 280);
  };

  const handleMediaTap = (post: ProfilePost) => {
    const now = Date.now();
    const last = lastTapRef.current[post.id] || 0;
    lastTapRef.current[post.id] = now;
    if (now - last < 300) {
      if (onDoubleTapLike) {
        Promise.resolve(onDoubleTapLike(post)).then((liked) => {
          if (liked) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            showLikeEffect(post.id);
          }
        }).catch(() => {});
      }
      return;
    }
    setTimeout(() => {
      if (lastTapRef.current[post.id] === now) {
        setFullscreenPost(post);
      }
    }, 310);
  };
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const markFailed = (postId: string) => {
    setFailedIds((current) => new Set(current).add(postId));
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={C.accent} />
      </View>
    );
  }

  const header = (
    <View style={styles.sectionHeader}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable
          style={[styles.actionButton, actionDisabled && styles.actionButtonDisabled]}
          onPress={onAction}
          disabled={actionDisabled}
          accessibilityRole="button"
        >
          {actionDisabled ? (
            <ActivityIndicator size="small" color={C.accent} />
          ) : (
            <Feather name="plus" size={15} color={C.accent} />
          )}
          <Text style={styles.actionButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (posts.length === 0) {
    if (!showEmptyState) return null;
    return (
      <View>
        {header}
        <Ionicons name="images-outline" size={42} color={C.textMuted} />
        <Text style={styles.emptyTitle}>لا توجد منشورات بعد</Text>
        <Text style={styles.emptyHint}>اضغط "إضافة منشور" لاختيار صورة أو فيديو</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {header}
      <View style={styles.list}>
        {posts.map((post) => {
          const failed = failedIds.has(post.id);
          return (
            <View key={post.id} style={styles.card}>
              <Pressable
                style={styles.mediaPressable}
                onPress={() => !failed && handleMediaTap(post)}
                accessibilityRole="button"
                accessibilityLabel={
                  post.mediaType === "video"
                    ? "فتح الفيديو بملء الشاشة"
                    : "فتح الصورة بملء الشاشة"
                }
              >
                {failed ? (
                  <View style={styles.failed}>
                    <Feather name="alert-circle" size={30} color={C.textMuted} />
                    <Text style={styles.failedText}>تعذّر تحميل هذا المنشور</Text>
                  </View>
                ) : post.mediaType === "video" ? (
                  <>
                    <Video
                      source={{ uri: post.url }}
                      style={styles.media}
                      resizeMode={ResizeMode.COVER}
                      shouldPlay={false}
                      isMuted
                      useNativeControls={false}
                      onError={() => markFailed(post.id)}
                    />
                    <View pointerEvents="none" style={styles.playBadge}>
                      <Ionicons name="play" size={24} color="#FFF" />
                    </View>
                  </>
                ) : (
                  <Image
                    source={{ uri: post.url }}
                    style={styles.media}
                    resizeMode="cover"
                    onError={() => markFailed(post.id)}
                  />
                )}
                {heartPostId === post.id && (
                  <Animated.View pointerEvents="none" style={[styles.heartOverlay, heartStyle]}>
                    <Ionicons name="heart" size={82} color="#EF4444" />
                  </Animated.View>
                )}
              </Pressable>

              {canDelete && onDelete && (
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => onDelete(post)}
                  disabled={deletingPostId === post.id}
                  accessibilityRole="button"
                  accessibilityLabel="حذف المنشور"
                >
                  {deletingPostId === post.id ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Feather name="trash-2" size={17} color="#FFF" />
                  )}
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      <Modal
        visible={!!fullscreenPost}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreenPost(null)}
      >
        <View style={styles.fullscreen}>
          {fullscreenPost?.mediaType === "video" ? (
            <Video
              source={{ uri: fullscreenPost.url }}
              style={styles.fullscreenMedia}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              isMuted={false}
              useNativeControls
            />
          ) : fullscreenPost ? (
            <Image
              source={{ uri: fullscreenPost.url }}
              style={styles.fullscreenMedia}
              resizeMode="contain"
            />
          ) : null}
          <Pressable
            style={styles.closeButton}
            onPress={() => setFullscreenPost(null)}
            accessibilityRole="button"
            accessibilityLabel="إغلاق العرض بملء الشاشة"
          >
            <Ionicons name="close" size={26} color="#FFF" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  root: { gap: 10 },
  sectionHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { color: C.text, fontSize: 16, fontFamily: "Cairo_700Bold", textAlign: "right" },
  actionButton: { flexDirection: "row-reverse", alignItems: "center", gap: 5, borderWidth: 1, borderColor: C.accent, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#FFF8EC" },
  actionButtonDisabled: { opacity: 0.55 },
  actionButtonText: { fontSize: 12, fontFamily: "Cairo_700Bold", color: C.accent },
  list: { gap: 14 },
  card: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#111",
    position: "relative",
  },
  mediaPressable: { flex: 1, position: "relative" },
  heartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  media: { width: "100%", height: "100%" },
  playBadge: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    marginTop: -25,
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 3,
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  deleteButton: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.68)",
  },
  failed: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.inputBg,
  },
  failedText: {
    color: C.textMuted,
    fontSize: 13,
    fontFamily: "Cairo_400Regular",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 12,
    gap: 7,
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: "Cairo_600SemiBold",
    color: C.textSecondary,
  },
  emptyHint: {
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    color: C.textMuted,
    textAlign: "center",
  },
  fullscreen: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenMedia: { width: "100%", height: "100%" },
  closeButton: {
    position: "absolute",
    top: 48,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
  },
});
