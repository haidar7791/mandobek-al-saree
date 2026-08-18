/**
 * ProductMediaCarousel.tsx
 * Horizontal paged carousel for product images and videos.
 *
 * Instagram-style audio behaviour:
 *  - Only the focused card (isVisible=true) plays its video.
 *  - Mute state is global: toggling the 🔊/🔇 button on any card
 *    instantly affects all other cards too.
 *  - Fullscreen video always plays with sound regardless of global mute.
 */
import React, { useRef, useState } from "react";
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
  /** True when this card is the focused one in the viewport — videos play only when true */
  isVisible?: boolean;
};

export default function ProductMediaCarousel({
  media,
  height = 210,
  style,
  showIndicators = true,
  onMediaPress,
  isVisible = true,
}: ProductMediaCarouselProps) {
  const { isAudioMuted, toggleMute } = useVideoAudio();

  const videoRefs = useRef<Record<number, Video | null>>({});
  const [slideWidth, setSlideWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullscreenMedia, setFullscreenMedia] = useState<ProductMedia | null>(null);
  const itemWidth = slideWidth || 1;

  const handleMediaPress = (item: ProductMedia, index: number) => {
    if (onMediaPress) {
      onMediaPress(item);
      return;
    }
    if (item.type === "video") {
      // Use our fullscreen modal (with sound on) instead of native player
      setFullscreenMedia(item);
    } else {
      setFullscreenMedia(item);
    }
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
            isVideoItem ? "فتح الفيديو بملء الشاشة" : "فتح الصورة بملء الشاشة"
          }
        >
          {content}
        </Pressable>

        {/* Video indicator badge — top-left */}
        {isVideoItem && (
          <View pointerEvents="none" style={styles.videoBadge}>
            <Ionicons name="play-circle" size={13} color="#FFF" />
          </View>
        )}

        {/* Global mute toggle — bottom-right, only on the active video slide */}
        {isVideoItem && isActiveSlide && (
          <TouchableOpacity
            style={styles.muteBtn}
            onPress={handleToggleMute}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={isAudioMuted ? "تفعيل الصوت" : "كتم الصوت"}
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

      {/* ── Fullscreen viewer (images + videos) ── */}
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
            accessibilityLabel="إغلاق العرض بملء الشاشة"
          >
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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

  // Video play badge — top-left indicator
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

  // Global mute toggle button — bottom-right
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
