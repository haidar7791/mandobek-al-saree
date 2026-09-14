import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import ProductMediaCarousel, { normalizeProductMedia } from "./ProductMediaCarousel";
import ProfilePostFeed from "./ProfilePostFeed";
import ProductPurchaseButton from "./ProductPurchaseButton";
import {
  likeProduct,
  likeProfilePost,
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

  const handleLikePost = async (post: ProfilePost) => {
    const viewer = auth.currentUser;
    if (!viewer || viewer.uid === userId) return false;
    setPostLikes((current) => ({ ...current, [post.id]: (current[post.id] ?? post.likesCount ?? 0) + 1 }));
    try {
      const liked = await likeProfilePost(viewer.uid, userId, post.id);
      if (!liked) {
        setPostLikes((current) => ({ ...current, [post.id]: Math.max(0, (current[post.id] ?? 0) - 1) }));
      } else {
        onContentLiked?.();
      }
      return liked;
    } catch (error) {
      setPostLikes((current) => ({ ...current, [post.id]: Math.max(0, (current[post.id] ?? 0) - 1) }));
      throw error;
    }
  };

  const handleLikeProduct = async (product: Product) => {
    const viewer = auth.currentUser;
    if (!viewer || viewer.uid === product.sellerId) return false;
    setProductLikes((current) => ({ ...current, [product.id]: (current[product.id] ?? product.likesCount ?? 0) + 1 }));
    try {
      const liked = await likeProduct(viewer.uid, product.id);
      if (!liked) {
        setProductLikes((current) => ({ ...current, [product.id]: Math.max(0, (current[product.id] ?? 0) - 1) }));
      } else if (product.sellerId === userId) {
        onContentLiked?.();
      }
      return liked;
    } catch (error) {
      setProductLikes((current) => ({ ...current, [product.id]: Math.max(0, (current[product.id] ?? 0) - 1) }));
      throw error;
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
                    onDoubleTapLike={() => handleLikeProduct(product)}
                  />
                  <View style={styles.productBottomRow}>
                    <View style={styles.likesRow}>
                      <Feather name="heart" size={8} color="#EF4444" />
                      <Text style={styles.likesText}>{productLikes[product.id] ?? product.likesCount ?? 0}</Text>
                    </View>

                    {auth.currentUser?.uid !== product.sellerId && (
                      <ProductPurchaseButton
                        compact
                        product={product}
                        userId={auth.currentUser?.uid ?? null}
                      />
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
  tabText: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.textMuted },
  tabTextActive: { color: C.primary, fontFamily: "Cairo_700Bold" },
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
  emptyTitle: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text },
  emptyHint: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textMuted, textAlign: "center" },
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
    fontFamily: "Cairo_700Bold",
    color: C.text,
  },
});
