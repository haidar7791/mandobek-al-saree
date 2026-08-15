import React, { useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import type { ProductMedia } from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

export function normalizeProductMedia(
  media: ProductMedia[] | undefined,
  imageUrl?: string | null
): ProductMedia[] {
  const validMedia = (media ?? []).filter((item) => item?.url && (item.type === "image" || item.type === "video"));
  if (validMedia.length > 0) return validMedia;
  return imageUrl ? [{ url: imageUrl, type: "image" }] : [];
}

type ProductMediaCarouselProps = {
  media: ProductMedia[];
  height?: number;
  style?: StyleProp<ViewStyle>;
  showIndicators?: boolean;
  onMediaPress?: (item: ProductMedia) => void;
};

export default function ProductMediaCarousel({
  media,
  height = 210,
  style,
  showIndicators = true,
  onMediaPress,
}: ProductMediaCarouselProps) {
  const listRef = useRef<FlatList<ProductMedia>>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const itemWidth = containerWidth || 1;
  const dotItems = useMemo(() => media.slice(0, 8), [media]);

  if (media.length === 0) {
    return (
      <View style={[styles.empty, { height }, style]}>
        <Ionicons name="image-outline" size={34} color={C.textMuted} />
      </View>
    );
  }

  const renderItem = ({ item, index }: ListRenderItemInfo<ProductMedia>) => {
    const content =
      item.type === "video" ? (
        <Video
          source={{ uri: item.url }}
          style={{ width: itemWidth, height }}
          resizeMode={ResizeMode.COVER}
          shouldPlay={activeIndex === index}
          isLooping
          isMuted
          useNativeControls={false}
        />
      ) : (
        <Image source={{ uri: item.url }} style={{ width: itemWidth, height }} resizeMode="cover" />
      );

    return (
      <View style={{ width: itemWidth, height }}>
        {onMediaPress ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={() => onMediaPress(item)}>
            {content}
          </Pressable>
        ) : (
          content
        )}
        {item.type === "video" && (
          <View pointerEvents="none" style={styles.videoBadge}>
            <Ionicons name="play" size={12} color="#FFF" />
          </View>
        )}
      </View>
    );
  };

  return (
    <View
      style={[styles.container, { height }, style]}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
    >
      <FlatList
        ref={listRef}
        data={media}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, index) => `${item.url}-${index}`}
        renderItem={renderItem}
        onMomentumScrollEnd={(event) => {
          if (containerWidth <= 0) return;
          const nextIndex = Math.round(event.nativeEvent.contentOffset.x / containerWidth);
          setActiveIndex(Math.max(0, Math.min(nextIndex, media.length - 1)));
        }}
        scrollEventThrottle={16}
      />

      {showIndicators && media.length > 1 && (
        <>
          <View pointerEvents="none" style={styles.counter}>
            <Text style={styles.counterText}>{activeIndex + 1}/{media.length}</Text>
          </View>
          <View pointerEvents="none" style={styles.dots}>
            {dotItems.map((_, index) => (
              <View
                key={index}
                style={[styles.dot, index === activeIndex && styles.activeDot]}
              />
            ))}
            {media.length > dotItems.length && <Text style={styles.moreDots}>…</Text>}
          </View>
        </>
      )}
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
  moreDots: { color: "#FFF", fontSize: 12, lineHeight: 8, marginLeft: 1 },
  videoBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
    justifyContent: "center",
  },
});