/**
 * ProductMediaCarousel.tsx
 * Horizontal paged carousel for product images and videos.
 *
 * Instagram-style audio behaviour:
 *  - Only the focused card (isVisible=true) plays its video.
 *  - Mute state is global: toggling the ðŸ”Š/ðŸ”‡ button on any card
 *    instantly affects all other cards too.
 *  - Fullscreen video always plays with sound regardless of global mute.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import type { ProductMedia } from "@/lib/db_logic";
import { useVideoAudio } from "@/lib/video-audio-context";
import Colors from "@/constants/colors";

const C = Colors.light;

export function normalizeProductMedia(
  media: ProductMedia[] | undefined,
  imageUrl?: string | null
): ProductMedia[] {
  const validMedia = (media ?? []).filter(
    (item) => item?.url && (item.type === "image" || item.type === "video")
  );
  if (validMedia.length > 0) return validMedia;
  return imageUrl ? [{ url: imageUrl, type: "image" }] : [];
}

type ProductMediaCarouselProps = {
  media: ProductMedia[];
  height?: number;
  style?: StyleProp<ViewStyle>;
  showIndicators?: boolean;
  onMediaPress?: (item: ProductMedia) => void;
  /** Called by a double-tap on media. */
  onDoubleTapLike?: (item: ProductMedia) => Promise<boolean> | boolean;
  /** True when this card is the focused one in the viewport â€” videos play only when true */
  isVisible?: boolean;
};

export default function ProductMediaCarousel({
  media,
  height = 210,
  style,
  showIndicators = true,
  onMediaPress,
  onDoubleTapLike,
  isVisible = true,
}: ProductMediaCarouselProps) {
  const { isAudioMuted, toggleMute } = useVideoAudio();

  const videoRefs = useRef<Record<number, Video | null>>({});
  const [slideWidth, setSlideWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreenMedia, setFullscreenMedia] = useState<ProductMedia | null>(null);
  const [heartIndex, setHeartIndex] = useState<number | null>(null);
  const lastTapRef = useRef<Record<number, number>>({});
  const heartScale = useSharedValue(0.35);
  const heartOpacity = useSharedValue(0);
  const heartStyle = useAnimatedStyle(() => ({
    opacity: heartOpacity.value,
    transform: [{ scale: heartScale.value }],
  }));
  const itemWidth = slideWidth || 1;

  // Explicitly play/pause the active-slide video when visibility changes.
  // expo-av's shouldPlay prop is not always reactive enough on its own (known quirk),
  // so we belt-and-suspenders with an imperative call.
  // Story screens (story-viewer / story-creator) manage their own separate Video
  // instances and do NOT share this ref, so there is no cross-screen interference.
  useEffect(() => {
    const activeVideo = videoRefs.current[activeIndex];
    if (isVisible) {
      // Explicitly resume the centred video after returning from any overlay screen
      activeVideo?.playAsync().catch(() => {});
    } else {
      // Pause every mounted video in this carousel immediately
      Object.values(videoRefs.current).forEach((video) => {
        video?.pauseAsync().catch(() => {});
      });
    }
  }, [isVisible, activeIndex]);

  const showLikeEffect = (index: number) => {
    setHeartIndex(index);
    heartScale.value = 0.35;
    heartOpacity.value = 0;
    heartOpacity.value = withTiming(1, { duration: 90 });
    heartScale.value = withSpring(1.15, { damping: 7, stiffness: 260 });
    setTimeout(() => {
      heartOpacity.value = withTiming(0, { duration: 240 });
      heartScale.value = withTiming(0.9, { duration: 240 });
      setTimeout(() => setHeartIndex((current) => current === index ? null : current), 250);
    }, 280);
  };

  const handleMediaPress = (item: ProductMedia, index: number) => {
    if (!item?.url) return;
    const now = Date.now();
    const last = lastTapRef.current[index] || 0;
    lastTapRef.current[index] = now;
    if (now - last < 300) {
      if (onDoubleTapLike) {
        Promise.resolve(onDoubleTapLike(item)).then((liked) => {
          if (liked) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            showLikeEffect(index);
          }
        }).catch(() => {});
      }
      return;
    }
    setTimeout(() => {
      if (lastTapRef.current[index] === now) {
        if (onMediaPress) onMediaPress(item);
        else setFullscreenMedia(item);
      }
    }, 310);
  };

  const handleToggleMute = () => {
    Haptics.selectionAsync();
    toggleMute();
  };

  if (media.length === 0) {
    return (
      <View style={[styles.empty, { height }, style]}>
        <Ionicons name="image-outline" size={34} color={C.textMuted} />
      </View>
    );
  }

  const renderItem = ({ item, index }: ListRenderItemInfo<ProductMedia>) => {
    const isVideoItem = item.type === "video";
    const isActiveSlide = activeIndex === index;
    // Video plays only when this card is focused AND this slide is active
    const shouldPlayVideo = isVisible && isActiveSlide;

    const content = isVideoItem ? (
      <Video
        ref={(video) => {
          videoRefs.current[index] = video;
        }}
        source={{ uri: item.url }}
        style={{ width: itemWidth, height }}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={shouldPlayVideo}
        progressUpdateIntervalMillis={250}
        isLooping
        // Muted when card is out of viewport OR global mute is on
        isMuted={!isVisible || isAudioMuted}
        useNativeControls={false}
      />
    ) : (
      <Image
        source={{ uri: item.url }}
        style={{ width: itemWidth, height }}
        resizeMode="cover"
      />
    );

    return (
      <View style={{ width: itemWidth, height }}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => handleMediaPress(item, index)}
          accessibilityRole="button"
          accessibilityLabel={
            isVideoItem ? "ÙØªØ­ Ø§Ù„ÙÙŠØ¯ÙŠÙˆ Ø¨Ù…Ù„Ø¡ Ø§Ù„Ø´Ø§Ø´Ø©" : "ÙØªØ­ Ø§Ù„ØµÙˆØ±Ø© Ø¨Ù…Ù„Ø¡ Ø§Ù„Ø´Ø§Ø´Ø©"
          }
        >
          {content}
          {heartIndex === index && (
            <Animated.View pointerEvents="none" style={[styles.heartOverlay, heartStyle]}>
              <Ionicons name="heart" size={92} color="#EF4444" />
            </Animated.View>
          )}
        </Pressable>

        {/* Video indicator badge â€” top-left */}
        {isVideoItem && (
          <View pointerEvents="none" style={styles.videoBadge}>
            <Ionicons name="play-circle" size={13} color="#FFF" />
          </View>
        )}

        {/* Global mute toggle â€” bottom-right, only on the active video slide */}
        {isVideoItem && isActiveSlide && (
          <TouchableOpacity
            style={styles.muteBtn}
            onPress={handleToggleMute}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={isAudioMuted ? "ØªÙØ¹ÙŠÙ„ Ø§Ù„ØµÙˆØª" : "ÙƒØªÙ… Ø§Ù„ØµÙˆØª"}
          >
            <Ionicons
              name={isAudioMuted ? "volume-mute" : "volume-high"}
              size={15}
              color="#FFF"
            />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View
      style={[styles.container, { height }, style]}
      onLayout={(event) => setSlideWidth(event.nativeEvent.layout.width)}
    >
      <FlatList
        data={media}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, index) => `${item.url}-${index}`}
        renderItem={renderItem}
        onMomentumScrollEnd={(event) => {
          if (slideWidth <= 0) return;
          const nextIndex = Math.round(
            event.nativeEvent.contentOffset.x / slideWidth
          );
          setActiveIndex(Math.max(0, Math.min(nextIndex, media.length - 1)));
        }}
        scrollEventThrottle={16}
      />

      {showIndicators && media.length > 1 && (
        <>
          <View pointerEvents="none" style={styles.counter}>
            <Text style={styles.counterText}>
              {activeIndex + 1}/{media.length}
            </Text>
          </View>
          <View pointerEvents="none" style={styles.dots}>
            {media.map((_, index) => (
              <View
                key={index}
                style={[styles.dot, index === activeIndex && styles.activeDot]}
              />
            ))}
          </View>
        </>
      )}

      {/* â”€â”€ Fullscreen viewer (images + videos) â”€â”€ */}
      <Modal
        visible={!!fullscreenMedia}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreenMedia(null)}
      >
        <View style={styles.fullscreenOverlay}>
          {fullscreenMedia?.type === "video" ? (
            <Video
              source={{ uri: fullscreenMedia.url }}
              style={styles.fullscreenMedia}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              // Always unmute in fullscreen for immersive experience
              isMuted={false}
              useNativeControls
              progressUpdateIntervalMillis={250}
            />
          ) : fullscreenMedia ? (
            <Image
              source={{ uri: fullscreenMedia.url }}
              style={styles.fullscreenMedia}
              resizeMode="contain"
            />
          ) : null}
          <TouchableOpacity
            style={styles.fullscreenClose}
            onPress={() => setFullscreenMedia(null)}
            accessibilityRole="button"
            accessibilityLabel="Ø¥ØºÙ„Ø§Ù‚ Ø§Ù„Ø¹Ø±Ø¶ Ø¨Ù…Ù„Ø¡ Ø§Ù„Ø´Ø§Ø´Ø©"
          >
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  heartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  container: { width: "100%", backgroundColor: "#111", overflow: "hidden" },
  empty: { alignItems: "center", justifyContent: "center", backgroundColor: C.inputBg },
  counter: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.62)",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  counterText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  dots: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.55)" },
  activeDot: { width: 18, backgroundColor: "#FFF" },

  // Video play badge â€” top-left indicator
  videoBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Global mute toggle button â€” bottom-right
  muteBtn: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },

  fullscreenOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.94)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenMedia: { width: "100%", height: "100%" },
  fullscreenClose: {
    position: "absolute",
    top: 44,
    right: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.68)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
});
