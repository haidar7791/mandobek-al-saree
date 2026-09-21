import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View, Pressable } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import ProductMediaCarousel, { normalizeProductMedia } from "./ProductMediaCarousel";
import ProfilePostFeed from "./ProfilePostFeed";
import ProductPurchaseButton from "./ProductPurchaseButton";
import {
  getIsProductLiked,
  getIsProfilePostLiked,
  likeProduct,
  likeProfilePost,
  unlikeProduct,
  unlikeProfilePost,
  subscribeToProducts,
  type Product,
  type ProfilePost,
} from "@/lib/db_logic";
import { auth } from "@/lib/firebase";
import Colors from "@/constants/colors";

const C = Colors.light;

type Props = {
  userId: string;
  posts: ProfilePost[];
  onContentLiked?: () => void;
};

export default function PublicProfileTabs({ userId, posts, onContentLiked }: Props) {
  const [activeTab, setActiveTab] = useState<"posts" | "products">("posts");
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productLikes, setProductLikes] = useState<Record<string, number>>({});
  const [postLikes, setPostLikes] = useState<Record<string, number>>({});
  const [productLikedIds, setProductLikedIds] = useState<Record<string, boolean>>({});
  const [postLikedIds, setPostLikedIds] = useState<Record<string, boolean>>({});
  const pendingProductLikes = React.useRef(new Set<string>());
  const pendingPostLikes = React.useRef(new Set<string>());

  useEffect(() => {
    if (!userId) return;
    setProductsLoading(true);
    const unsubscribe = subscribeToProducts(
      (items) => {
        const owned = items.filter((product) => product.sellerId === userId && product.status === "available");
        setProducts(owned);
        setProductLikes(Object.fromEntries(owned.map((product) => [product.id, product.likesCount ?? 0])));
        setProductsLoading(false);
      },
      () => {
        setProducts([]);
        setProductsLoading(false);
      },
    );
    return unsubscribe;
  }, [userId]);

  useEffect(() => {
    const viewer = auth.currentUser;
    if (!viewer || viewer.uid === userId || posts.length === 0) {
      setPostLikedIds({});
      return;
    }
    let cancelled = false;
    Promise.all(posts.map(async (post) => {
      try {
        return [post.id, await getIsProfilePostLiked(viewer.uid, userId, post.id)] as const;
      } catch (error) {
        console.warn("profile post like state read failed", post.id, error);
        return [post.id, false] as const;
      }
    })).then((entries) => {
      if (!cancelled) setPostLikedIds(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [posts, userId]);

  useEffect(() => {
    const viewer = auth.currentUser;
    if (!viewer || products.length === 0) {
      setProductLikedIds({});
      return;
    }
    let cancelled = false;
    Promise.all(products.map(async (product) => {
      try {
        return [product.id, await getIsProductLiked(viewer.uid, product.id)] as const;
      } catch (error) {
        console.warn("profile product like state read failed", product.id, error);
        return [product.id, false] as const;
      }
    })).then((entries) => {
      if (!cancelled) setProductLikedIds(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [products]);

  const handleLikePost = async (post: ProfilePost) => {
    const viewer = auth.currentUser;
    if (!viewer || viewer.uid === userId || pendingPostLikes.current.has(post.id)) return false;
    const wasLiked = !!postLikedIds[post.id];
    const nextLiked = !wasLiked;
    const delta = nextLiked ? 1 : -1;
    pendingPostLikes.current.add(post.id);
    setPostLikedIds((current) => ({ ...current, [post.id]: nextLiked }));
    setPostLikes((current) => ({ ...current, [post.id]: Math.max(0, (current[post.id] ?? post.likesCount ?? 0) + delta) }));
    try {
      const operationChanged = nextLiked
        ? await likeProfilePost(viewer.uid, userId, post.id)
        : await unlikeProfilePost(viewer.uid, userId, post.id);
      if (operationChanged && nextLiked) onContentLiked?.();
      return nextLiked;
    } catch (error) {
      setPostLikedIds((current) => ({ ...current, [post.id]: wasLiked }));
      setPostLikes((current) => ({ ...current, [post.id]: Math.max(0, (current[post.id] ?? 0) - delta) }));
      throw error;
    } finally {
      pendingPostLikes.current.delete(post.id);
    }
  };

  const handleLikeProduct = async (product: Product) => {
    const viewer = auth.currentUser;
    if (!viewer || viewer.uid === product.sellerId || pendingProductLikes.current.has(product.id)) return false;
    const wasLiked = !!productLikedIds[product.id];
    const nextLiked = !wasLiked;
    const delta = nextLiked ? 1 : -1;
    pendingProductLikes.current.add(product.id);
    setProductLikedIds((current) => ({ ...current, [product.id]: nextLiked }));
    setProductLikes((current) => ({ ...current, [product.id]: Math.max(0, (current[product.id] ?? product.likesCount ?? 0) + delta) }));
    try {
      const operationChanged = nextLiked
        ? await likeProduct(viewer.uid, product.id)
        : await unlikeProduct(viewer.uid, product.id);
      if (operationChanged && nextLiked) onContentLiked?.();
      return nextLiked;
    } catch (error) {
      setProductLikedIds((current) => ({ ...current, [product.id]: wasLiked }));
      setProductLikes((current) => ({ ...current, [product.id]: Math.max(0, (current[product.id] ?? 0) - delta) }));
      throw error;
    } finally {
      pendingProductLikes.current.delete(product.id);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.tabsBar} accessibilityRole="tablist">
        <Pressable
          style={styles.tabItem}
          onPress={() => { Haptics.selectionAsync(); setActiveTab("posts"); }}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "posts" }}
        >
          <Feather name="image" size={17} color={activeTab === "posts" ? C.accent : C.textMuted} />
          
          <View style={[styles.indicator, activeTab === "posts" && styles.indicatorActive]} />
        </Pressable>
        <Pressable
          style={styles.tabItem}
          onPress={() => { Haptics.selectionAsync(); setActiveTab("products"); }}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "products" }}
        >
          <Feather name="shopping-bag" size={17} color={activeTab === "products" ? C.accent : C.textMuted} />
          
          <View style={[styles.indicator, activeTab === "products" && styles.indicatorActive]} />
        </Pressable>
      </View>

      {activeTab === "posts" ? (
        <View style={styles.card}>
          <ProfilePostFeed
            posts={posts.map((post) => ({ ...post, likesCount: postLikes[post.id] ?? post.likesCount ?? 0 }))}
            showEmptyState
            title=""
            onDoubleTapLike={handleLikePost}
            onLike={handleLikePost}
            isLiked={(postId) => !!postLikedIds[postId]}
          />
        </View>
      ) : (
        <View style={styles.card}>
          {productsLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color={C.accent} />
            </View>
          ) : products.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="shopping-bag" size={36} color={C.textMuted} />
              <Text style={styles.emptyTitle}>لا توجد منتجات منشورة</Text>
              <Text style={styles.emptyHint}>لا توجد منتجات للبيع لهذا المستخدم حالياً.</Text>
            </View>
          ) : (
            <View style={styles.productsList}>
              {products.map((product) => (
                <View key={product.id} style={styles.productCard}>
                  <ProductMediaCarousel
                    media={normalizeProductMedia(product.media, product.imageUrl)}
                    height={220}
                    showIndicators
                    isVisible={false}
                    onDoubleTapLike={() => {
                      if (productLikedIds[product.id]) return false;
                      return handleLikeProduct(product);
                    }}
                  />
                  <View style={styles.productBottomRow}>
                    <Pressable
                      style={styles.likesRow}
                      onPress={() => {
                        void handleLikeProduct(product).catch((error) => {
                          Alert.alert("تعذر الإعجاب", error?.message || "حدث خطأ.");
                        });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={productLikedIds[product.id] ? "إلغاء إعجاب المنتج" : "الإعجاب بالمنتج"}
                    >
                      <Ionicons name={productLikedIds[product.id] ? "heart" : "heart-outline"} size={13} color={productLikedIds[product.id] ? "#EF4444" : C.textMuted} />
                      <Text style={styles.likesText}>{productLikes[product.id] ?? product.likesCount ?? 0}</Text>
                    </Pressable>

                    {auth.currentUser?.uid !== product.sellerId && (
                      <ProductPurchaseButton
                        compact
                        product={product}
                        userId={auth.currentUser?.uid ?? null}
          compactPublicProfile/>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  tabsBar: {
    flexDirection: "row",
    marginTop: 2,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  tabItem: {
    flex: 1,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    position: "relative",
  },
  tabText: { fontSize: 13, fontFamily: undefined, color: C.textMuted },
  tabTextActive: { color: C.primary, fontFamily: undefined },
  indicator: {
    position: "absolute",
    bottom: 0,
    left: 18,
    right: 18,
    height: 3,
    borderRadius: 3,
    backgroundColor: "transparent",
  },
  indicatorActive: { backgroundColor: C.accent },
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
  },
  loading: { minHeight: 180, alignItems: "center", justifyContent: "center" },
  empty: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 7 },
  emptyTitle: { fontSize: 15, fontFamily: undefined, color: C.text },
  emptyHint: { fontSize: 12, fontFamily: undefined, color: C.textMuted, textAlign: "center" },
  productsList: { gap: 14, flexDirection: "row", flexWrap: "wrap", columnGap: 4, rowGap: 4,},
  productCard: { borderRadius: 16, overflow: "hidden", backgroundColor: C.background, borderWidth: 1, borderColor: C.border, width: "32%",},
  productBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  likesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 3,
  },
  likesText: {
    fontSize: 8,
    fontFamily: undefined,
    color: C.text,
  },
});
