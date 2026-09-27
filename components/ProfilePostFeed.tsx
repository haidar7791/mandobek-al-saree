import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Share,
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
import ProfileAvatar from "./ProfileAvatar";
import ReportButton from "./ReportButton";

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
  profileName?: string;
  profilePhotoUri?: string | null;
  /** Called by a double-tap on a post. Return true when the like was recorded. */
  onDoubleTapLike?: (post: ProfilePost) => Promise<boolean> | boolean;
  /** Called by the persistent heart button. */
  onLike?: (post: ProfilePost) => Promise<boolean> | boolean;
  onComment?: (post: ProfilePost) => void;
  isLiked?: (postId: string) => boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
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
  profileName = "مستخدم",
  profilePhotoUri,
  onDoubleTapLike,
  onLike,
  onComment,
  isLiked,
  onLoadMore,
  loadingMore = false,
  hasMore = false,
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

  const sharePost = async (post: ProfilePost) => {
    try {
      await Share.share({
        message: `📱 منشور عبر تطبيق FORUS\n\n👤 ${profileName}${post.description ? `\n\n${post.description}` : ""}`,
      });
    } catch {
      // Native share cancellation should not affect the feed.
    }
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
        <Text style={styles.emptyHint}>اضغط على إضافة منشور لاختيار صورة أو فيديو</Text>
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
              <View style={styles.postHeader}>
                <ProfileAvatar
                  photoUri={profilePhotoUri}
                  name={profileName}
                  size={42}
                  disableNavigation
                />
                <View style={styles.postHeaderInfo}>
                  <Text style={styles.postName} numberOfLines={1}>{profileName}</Text>
                  <Text style={styles.postTime}>
                    {post.createdAt ? new Date(post.createdAt).toLocaleDateString("ar-IQ-u-nu-latn") : "منذ لحظات"}
                  </Text>
                </View>
              </View>

              {!!post.description && (
                <Text style={styles.description}>{post.description}</Text>
              )}

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

              <View style={styles.actions}>
                <Pressable
                  style={styles.action}
                  onPress={() => { void Promise.resolve(onLike?.(post)).catch(() => undefined); }}
                  disabled={!onLike}
                  accessibilityRole="button"
                  accessibilityLabel={isLiked?.(post.id) ? "إلغاء إعجاب المنشور" : "الإعجاب بالمنشور"}
                >
                  <Ionicons name={isLiked?.(post.id) ? "heart" : "heart-outline"} size={21} color={isLiked?.(post.id) ? "#EF4444" : C.textSecondary} />
                  <Text style={[styles.actionText, isLiked?.(post.id) && styles.likedText]}>{post.likesCount ?? 0}</Text>
                </Pressable>

                <Pressable
                  style={styles.action}
                  onPress={() => {
                    onComment?.(post);
                  }}
                  disabled={!onComment}
                  accessibilityRole="button"
                  accessibilityLabel="التعليقات"
                >
                  <Ionicons name="chatbubble-outline" size={20} color={C.textSecondary} />
                  <Text style={styles.actionText}>{post.commentsCount ?? 0}</Text>
                </Pressable>

                <Pressable
                  style={styles.action}
                  onPress={() => { void sharePost(post); }}
                  accessibilityRole="button"
                  accessibilityLabel="مشاركة المنشور"
                >
                  <Feather name="share-2" size={19} color={C.textSecondary} />
                </Pressable>

                {!canDelete && (
                  <ReportButton
                    targetType="post"
                    targetId={post.id}
                    targetName={profileName}
                    style={styles.reportButton}
                  />
                )}

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
                      <Feather name="trash-2" size={10} color="#FFF" />
                    )}
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </View>
      {onLoadMore && hasMore ? (
        <Pressable
          style={styles.loadMoreButton}
          onPress={onLoadMore}
          disabled={loadingMore}
          accessibilityRole="button"
          accessibilityLabel="تحميل المزيد من المنشورات"
        >
          {loadingMore ? (
            <ActivityIndicator size="small" color={C.accent} />
          ) : (
            <Text style={styles.loadMoreText}>تحميل المزيد</Text>
          )}
        </Pressable>
      ) : null}

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
  title: { color: C.text, fontSize: 16, fontFamily: undefined, textAlign: "right" },
  actionButton: { flexDirection: "row-reverse", alignItems: "center", gap: 5, borderWidth: 1, borderColor: C.accent, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#FFF8EC" },
  actionButtonDisabled: { opacity: 0.55 },
  actionButtonText: { fontSize: 12, fontFamily: undefined, color: C.accent },
  list: {
    gap: 14,
  },
  card: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  postHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 9,
  },
  postHeaderInfo: { flex: 1, alignItems: "flex-end", gap: 2 },
  postName: { color: C.text, fontSize: 14, fontWeight: "800", textAlign: "right" },
  postTime: { color: C.textMuted, fontSize: 10, textAlign: "right" },
  description: {
    color: C.text,
    fontSize: 13,
    lineHeight: 21,
    textAlign: "right",
    paddingHorizontal: 13,
    paddingBottom: 10,
  },
  mediaPressable: { width: "100%", aspectRatio: 1, position: "relative", backgroundColor: "#111" },
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
  actions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 28,
  },
  actionDisabled: { opacity: 0.55 },
  actionText: { color: C.textSecondary, fontSize: 12 },
  likedText: { color: "#EF4444" },
  reportButton: { paddingHorizontal: 0, paddingVertical: 0, marginLeft: "auto" },
  deleteButton: {
    width: 34,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF4444",
    marginLeft: "auto",
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
    fontFamily: undefined,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 12,
    gap: 7,
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: undefined,
    color: C.textSecondary,
  },
  emptyHint: {
    fontSize: 12,
    fontFamily: undefined,
    color: C.textMuted,
    textAlign: "center",
  },
  loadMoreButton: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  loadMoreText: { color: C.accent, fontSize: 12, fontWeight: "700" },
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
