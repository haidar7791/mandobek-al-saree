import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { Feather } from "@expo/vector-icons";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { ProductMedia } from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;
// Expo web is served by Metro on :8081 while API routes live behind the
// Express proxy on :5000, so relative /api URLs miss the server in development.
const API_ORIGIN = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

type ProductOrderThumbnailProps = {
  imageUrl?: string | null;
  media?: ProductMedia[];
  productId?: string | null;
  style: StyleProp<ImageStyle>;
  fallbackIconSize?: number;
};

type ProductThumbnailData = {
  media?: ProductMedia[];
  imageUrl?: string;
  thumbnailUrl?: string;
};

const productCache: Record<string, ProductThumbnailData> = {};

function isVideoUrl(uri: string): boolean {
  return /\.(mp4|mov|m4v|webm|avi|mkv)(?:$|[?#])/i.test(uri);
}

/**
 * Renders an image thumbnail for every order card. Video-only products receive
 * a real JPEG of their first frame from the server, avoiding browser CORS
 * restrictions on Firebase Storage video files.
 */
export default function ProductOrderThumbnail({
  imageUrl,
  media,
  productId,
  style,
  fallbackIconSize = 22,
}: ProductOrderThumbnailProps) {
  const [product, setProduct] = useState<ProductThumbnailData | null>(
    productId ? productCache[productId] ?? null : null,
  );
  const [serverThumbnailUrl, setServerThumbnailUrl] = useState<string | null>(null);
  const didLoadProduct = useRef(false);
  const didRequestThumbnail = useRef(false);

  useEffect(() => {
    if (!productId || didLoadProduct.current) return;
    didLoadProduct.current = true;

    if (productCache[productId]) {
      setProduct(productCache[productId]);
      return;
    }

    getDoc(doc(db, "products", productId))
      .then((snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data() as ProductThumbnailData;
        productCache[productId] = data;
        setProduct(data);
      })
      .catch(() => {});
  }, [productId]);

  const effectiveMedia = media ?? product?.media;
  const imageFromMedia = useMemo(
    () => effectiveMedia?.find((item) => item.type === "image" && item.url)?.url ?? null,
    [effectiveMedia],
  );
  const videoUrl = useMemo(
    () =>
      effectiveMedia?.find((item) => item.type === "video" && item.url)?.url ??
      (imageUrl && isVideoUrl(imageUrl) ? imageUrl : null),
    [effectiveMedia, imageUrl],
  );
  const directImageUrl =
    imageFromMedia ??
    (!imageUrl || isVideoUrl(imageUrl) ? null : imageUrl);
  const resolvedImageUrl =
    serverThumbnailUrl ?? product?.thumbnailUrl ?? directImageUrl;

  useEffect(() => {
    if (
      !productId ||
      !videoUrl ||
      resolvedImageUrl ||
      didRequestThumbnail.current
    ) {
      return;
    }
    didRequestThumbnail.current = true;

    auth.currentUser
      ?.getIdToken()
      .then((idToken) =>
        fetch(`${API_ORIGIN}/api/products/${encodeURIComponent(productId)}/video-thumbnail`, {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      )
      .then(async (response) => {
        if (!response?.ok) return;
        const data = (await response.json()) as { thumbnailUrl?: string };
        if (data.thumbnailUrl) {
          setServerThumbnailUrl(data.thumbnailUrl);
          productCache[productId] = {
            ...(productCache[productId] ?? {}),
            thumbnailUrl: data.thumbnailUrl,
          };
        }
      })
      .catch(() => {});
  }, [productId, videoUrl, resolvedImageUrl]);

  if (resolvedImageUrl) {
    return <Image source={{ uri: resolvedImageUrl }} style={style} resizeMode="cover" />;
  }

  if (videoUrl && Platform.OS !== "web") {
    return (
      <Video
        source={{ uri: videoUrl }}
        style={style}
        resizeMode={ResizeMode.COVER}
        shouldPlay={false}
        isMuted
        useNativeControls={false}
      />
    );
  }

  return (
    <View style={[style, styles.fallback]}>
      <Feather
        name={videoUrl ? "play-circle" : "image"}
        size={fallbackIconSize}
        color={C.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: C.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },
});