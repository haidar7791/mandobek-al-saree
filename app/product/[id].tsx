import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { auth } from "@/lib/firebase";
import {
  getIsProductLiked,
  likeProduct,
  subscribeToProducts,
  unlikeProduct,
  type Product,
} from "@/lib/db_logic";
import ProductMediaCarousel, { normalizeProductMedia } from "@/components/ProductMediaCarousel";
import ProductPurchaseButton from "@/components/ProductPurchaseButton";
import ReportButton from "@/components/ReportButton";
import Colors from "@/constants/colors";
import { goBack, navigateWithHomeBase } from "@/lib/navigation";

const C = Colors.light;

export default function ProductScreen() {
  const { id, product: productParam } = useLocalSearchParams<{ id: string; product?: string }>();
  const initialProduct = useMemo(() => {
    if (!productParam) return null;
    try {
      return JSON.parse(productParam) as Product;
    } catch {
      return null;
    }
  }, [productParam]);
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [loading, setLoading] = useState(!initialProduct);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(initialProduct?.likesCount ?? 0);
  const [likePending, setLikePending] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToProducts((products) => {
      const nextProduct = products.find((item) => item.id === id) ?? initialProduct;
      setProduct(nextProduct);
      setLikesCount(nextProduct?.likesCount ?? 0);
      setLoading(false);
    }, () => setLoading(false));
    return unsubscribe;
  }, [id, initialProduct]);

  useEffect(() => {
    const viewer = auth.currentUser;
    if (!viewer || !product || viewer.uid === product.sellerId) {
      setIsLiked(false);
      return;
    }
    let cancelled = false;
    getIsProductLiked(viewer.uid, product.id)
      .then((liked) => {
        if (!cancelled) setIsLiked(liked);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [product?.id, product?.sellerId]);

  const handleLike = async () => {
    const viewer = auth.currentUser;
    if (!viewer || !product || viewer.uid === product.sellerId || likePending) return;

    const previousLiked = isLiked;
    const previousCount = likesCount;
    const nextLiked = !previousLiked;
    setLikePending(true);
    setIsLiked(nextLiked);
    setLikesCount(Math.max(0, previousCount + (nextLiked ? 1 : -1)));
    try {
      if (nextLiked) {
        await likeProduct(viewer.uid, product.id);
      } else {
        await unlikeProduct(viewer.uid, product.id);
      }
    } catch {
      setIsLiked(previousLiked);
      setLikesCount(previousCount);
    } finally {
      setLikePending(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.backButton} accessibilityLabel="رجوع">
          <Feather name="arrow-right" size={22} color={C.text} />
        </Pressable>
        <Text style={styles.headerTitle}>تفاصيل المنتج</Text>
         {product && auth.currentUser?.uid !== product.sellerId ? (
           <ReportButton
             targetType="product"
             targetId={product.id}
             targetName={product.title}
              targetOwnerId={product.sellerId}
             style={styles.headerReport}
           />
         ) : (
           <View style={styles.headerSpacer} />
         )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      ) : !product ? (
        <View style={styles.center}>
          <Feather name="package" size={42} color={C.textMuted} />
          <Text style={styles.emptyTitle}>المنتج غير متاح</Text>
          <Text style={styles.emptyText}>ربما تم بيع المنتج أو حذفه.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
           <ProductMediaCarousel
             media={normalizeProductMedia(product.media, product.imageUrl)}
             height={320}
             onDoubleTapLike={async () => {
                const viewer = auth.currentUser;
                if (!viewer || viewer.uid === product.sellerId || likePending) return false;
                const before = isLiked;
                await handleLike();
                return !before;
             }}
           />
          <View style={styles.details}>
            <View style={styles.titleRow}>
              <View style={styles.priceBadge}>
                <Text style={styles.price}>{product.price.toLocaleString("ar-IQ-u-nu-latn")} د.ع</Text>
              </View>
              <Text style={styles.title}>{product.title}</Text>
            </View>
            {product.description ? <Text style={styles.description}>{product.description}</Text> : null}
            {auth.currentUser?.uid !== product.sellerId && (
              <Pressable
                style={styles.likeRow}
                onPress={() => { void handleLike(); }}
                disabled={likePending}
                accessibilityRole="button"
                accessibilityLabel={isLiked ? "إلغاء إعجاب المنتج" : "الإعجاب بالمنتج"}
              >
                <Text style={styles.likeCount}>{likesCount} إعجاب</Text>
                <Feather name={isLiked ? "heart" : "heart"} size={21} color={isLiked ? "#EF4444" : C.textSecondary} />
              </Pressable>
            )}
            <View style={styles.divider} />
            <Pressable
              style={styles.sellerRow}
               onPress={() => navigateWithHomeBase({ pathname: "/user-profile", params: { userId: product.sellerId } } as any)}
            >
              <View style={styles.sellerIcon}>
                <Feather name="user" size={18} color={C.accent} />
              </View>
              <View style={styles.sellerText}>
                <Text style={styles.sellerLabel}>البائع</Text>
                <Text style={styles.sellerName}>{product.sellerName}</Text>
              </View>
              <Feather name="chevron-left" size={18} color={C.textMuted} />
            </Pressable>
            {auth.currentUser?.uid !== product.sellerId && (
              <ProductPurchaseButton
                product={product}
                userId={auth.currentUser?.uid ?? null}
                compactPublicProfile
              />
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerSpacer: { width: 38 },
  headerReport: { width: 38, height: 38, borderRadius: 19 },
  headerTitle: { fontSize: 17, fontFamily: undefined, color: C.text },
  content: { paddingBottom: 32 },
  details: { padding: 18 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  title: { flex: 1, fontSize: 22, lineHeight: 32, fontFamily: undefined, color: C.text, textAlign: "right" },
  priceBadge: { backgroundColor: "#FFF8EC", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  price: { fontSize: 14, fontFamily: undefined, color: C.accent },
  description: { marginTop: 18, fontSize: 15, lineHeight: 27, fontFamily: undefined, color: C.textSecondary, textAlign: "right" },
  likeRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 16 },
  likeCount: { fontSize: 13, fontFamily: undefined, color: C.textSecondary },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 20 },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  sellerIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#FFF8EC", alignItems: "center", justifyContent: "center" },
  sellerText: { flex: 1, alignItems: "flex-end" },
  sellerLabel: { fontSize: 12, fontFamily: undefined, color: C.textMuted },
  sellerName: { fontSize: 15, fontFamily: undefined, color: C.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  emptyTitle: { fontSize: 18, fontFamily: undefined, color: C.text },
  emptyText: { fontSize: 14, fontFamily: undefined, color: C.textMuted },
});
