import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
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
  fetchSellerProductsPage,
  type Product,
  type ProfilePost,
} from "@/lib/db_logic";
import { auth } from "@/lib/firebase";
import Colors from "@/constants/colors";

const C = Colors.light;

type Props = {
  userId: string;
  posts: ProfilePost[];
  profileName?: string;
  profilePhotoUri?: string | null;
  onContentLiked?: () => void;
  onComment?: (post: ProfilePost) => void;
};

export type PublicProfileTabsRef = {
  loadMore: () => void;
};

const PublicProfileTabs = forwardRef<PublicProfileTabsRef, Props>(function PublicProfileTabs({
  userId,
  posts,
  profileName = "مستخدم",
  profilePhotoUri,
  onContentLiked,
  onComment,
}, ref) {
  const [activeTab, setActiveTab] = useState<"posts" | "products">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsLoadingMore, setProductsLoadingMore] = useState(false);
  const [productsHasMore, setProductsHasMore] = useState(false);
  const [productsCursor, setProductsCursor] = useState<any | null>(null);
  const [visiblePostCount, setVisiblePostCount] = useState(3);
  const [productLikes, setProductLikes] = useState<Record<string, number>>({});
  const [postLikes, setPostLikes] = useState<Record<string, number>>({});
  const [productLikedIds, setProductLikedIds] = useState<Record<string, boolean>>({});
  const [postLikedIds, setPostLikedIds] = useState<Record<string, boolean>>({});
  const pendingProductLikes = React.useRef(new Set<string>());
  const pendingPostLikes = React.useRef(new Set<string>());

  const loadMoreProducts = useCallback(async () => {
    if (!userId || productsLoading || productsLoadingMore || !productsHasMore) return;
    setProductsLoadingMore(true);
    try {
      const page = await fetchSellerProductsPage(userId, 3, productsCursor);
      setProducts((current) => {
        const existing = new Set(current.map((product) => product.id));
        return [...current, ...page.products.filter((product) => !existing.has(product.id))];
      });
      setProductLikes((current) => ({
        ...current,
        ...Object.fromEntries(page.products.map((product) => [product.id, product.likesCount ?? 0])),
      }));
      setProductsCursor(page.lastDoc);
      setProductsHasMore(page.hasMore);
    } catch (error) {
      console.warn("profile products page load failed", error);
    } finally {
      setProductsLoadingMore(false);
    }
  }, [productsCursor, productsHasMore, productsLoading, productsLoadingMore, userId]);

  useImperativeHandle(ref, () => ({
    loadMore: () => {
      if (activeTab === "posts") {
        setVisiblePostCount((count) => Math.min(posts.length, count + 3));
      } else {
        void loadMoreProducts();
      }
    },
  }), [activeTab, loadMoreProducts, posts.length]);

  useEffect(() => {
    if (!userId) return;
    setProductsLoading(true);
    setProducts([]);
    setProductsCursor(null);
    setProductsHasMore(false);
    fetchSellerProductsPage(userId, 3)
      .then((page) => {
        setProducts(page.products);
        setProductLikes(Object.fromEntries(page.products.map((product) => [product.id, product.likesCount ?? 0])));
        setProductsCursor(page.lastDoc);
        setProductsHasMore(page.hasMore);
      })
      .catch((error) => {
        console.warn("profile products load failed", error);
        setProductsLoading(false);
      })
      .finally(() => setProductsLoading(false));
  }, [userId]);

  useEffect(() => {
    setVisiblePostCount(3);
  }, [userId, posts]);

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
      {activeTab === "posts" ? (
         <View style={styles.card}>
          <ProfilePostFeed
            posts={posts.slice(0, visiblePostCount).map((post) => ({
              ...post,
              likesCount: postLikes[post.id] ?? post.likesCount ?? 0,
            }))}
            showEmptyState
            title=""
            profileName={profileName}
            profilePhotoUri={profilePhotoUri}
            onDoubleTapLike={handleLikePost}
            onLike={handleLikePost}
            onComment={onComment}
            isLiked={(postId) => !!postLikedIds[postId]}
            onLoadMore={() => {
              if (visiblePostCount < posts.length) {
                setVisiblePostCount((count) => Math.min(posts.length, count + 3));
              } else {
                // The parent can call the same imperative method when its
                // outer ScrollView reaches the end.
                loadMoreProducts();
              }
            }}
            hasMore={visiblePostCount < posts.length}
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
                    <View style={styles.engagementGroup}>
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
                        <Ionicons name={productLikedIds[product.id] ? "heart" : "heart-outline"} size={15} color={productLikedIds[product.id] ? "#EF4444" : C.textMuted} />
                        <Text style={styles.likesText}>{productLikes[product.id] ?? product.likesCount ?? 0}</Text>
                      </Pressable>
                      <View style={styles.likesRow} accessibilityLabel="عدد تعليقات المنتج">
                        <Ionicons name="chatbubble-outline" size={14} color={C.textMuted} />
                        <Text style={styles.likesText}>{product.commentsCount ?? 0}</Text>
                      </View>
                    </View>

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
              {productsLoadingMore ? (
                <View style={styles.productsMoreLoading}>
                  <ActivityIndicator size="small" color={C.accent} />
                </View>
              ) : null}
            </View>
          )}
        </View>
      )}
    </View>
  );
});

export default PublicProfileTabs;

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
  productsList: { gap: 14 },
  productCard: { borderRadius: 16, overflow: "hidden", backgroundColor: C.background, borderWidth: 1, borderColor: C.border, width: "100%" },
  productBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 5,
    paddingVertical: 8,
  },
  likesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 3,
  },
  engagementGroup: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  likesText: {
    fontSize: 11,
    fontFamily: undefined,
    color: C.text,
  },
  productsMoreLoading: { alignItems: "center", paddingVertical: 8 },
});
