import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { auth } from "@/lib/firebase";
import {
  addReview,
  fetchSellerProductsPage,
  getReviews,
  getUserProfile,
  type Product,
  type UserProfile,
} from "@/lib/db_logic";
import { PRODUCT_CATEGORY_OPTIONS, normalizeProductCategory, type ProductCategoryFilter } from "@/lib/product_categories";
import { addStoreCartItem, getStoreCartCount } from "@/lib/store_cart";
import Colors from "@/constants/colors";

const C = Colors.light;

type ReviewItem = { clientId?: string; clientName?: string; rating?: number; comment?: string };

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const storeId = Array.isArray(rawId) ? rawId[0] : rawId;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ProductCategoryFilter>("all");
  const [cartCount, setCartCount] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [ratingVisible, setRatingVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [savingRating, setSavingRating] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    try {
      const nextProfile = await getUserProfile(storeId);
      if (!nextProfile || nextProfile.specialty !== "store") {
        setProfile(null);
        setProducts([]);
        return;
      }
      setProfile(nextProfile);
      const allProducts: Product[] = [];
      let cursor: any = null;
      let hasMore = true;
      while (hasMore) {
        const page = await fetchSellerProductsPage(storeId, 100, cursor);
        allProducts.push(...page.products);
        cursor = page.lastDoc;
        hasMore = page.hasMore;
      }
      setProducts(allProducts);
      setReviews((await getReviews(storeId)).slice(0, 4) as ReviewItem[]);
    } catch (error) {
      console.error("load shop failed:", error);
      Alert.alert("تعذر تحميل المتجر", "تحقق من اتصالك ثم أعد المحاولة.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId]);

  useFocusEffect(useCallback(() => {
    setCartCount(getStoreCartCount());
    void load();
  }, [load]));

  const visibleProducts = useMemo(
    () => products.filter((product) =>
      activeCategory === "all" || normalizeProductCategory(product.category) === activeCategory
    ),
    [activeCategory, products],
  );

  const showProductOptions = (product: Product) => {
    setSelectedProduct(product);
    setSelectedColor(product.colors?.length ? "" : "");
    setSelectedSize(product.sizes?.length ? "" : "");
  };

  const confirmAddToCart = () => {
    if (!selectedProduct) return;
    if (selectedProduct.colors?.length && !selectedColor) {
      Alert.alert("اختر اللون", "حدد لون المنتج قبل إضافته إلى السلة.");
      return;
    }
    if (selectedProduct.sizes?.length && !selectedSize) {
      Alert.alert("اختر القياس", "حدد قياس المنتج قبل إضافته إلى السلة.");
      return;
    }
    const result = addStoreCartItem(selectedProduct, 1, selectedColor, selectedSize);
    setSelectedProduct(null);
    if (result === "different-seller") {
      Alert.alert("السلة لمتجر واحد", "أكمل طلبك الحالي أو أفرغ السلة قبل إضافة منتجات من متجر آخر.", [
        { text: "إلغاء", style: "cancel" },
        { text: "فتح السلة", onPress: () => router.push("/shop/cart" as any) },
      ]);
      return;
    }
    setCartCount(getStoreCartCount());
  };

  const submitRating = async () => {
    const viewer = auth.currentUser;
    if (!viewer || !storeId) {
      Alert.alert("تسجيل الدخول مطلوب", "سجّل الدخول لإضافة تقييم.");
      return;
    }
    if (viewer.uid === storeId) {
      Alert.alert("التقييم", "لا يمكنك تقييم متجرك.");
      return;
    }
    if (!rating) {
      Alert.alert("اختر التقييم", "حدد عدد النجوم أولاً.");
      return;
    }
    setSavingRating(true);
    try {
      const current = await getUserProfile(viewer.uid);
      await addReview({
        artisanId: storeId,
        clientId: viewer.uid,
        clientName: current?.name || viewer.displayName || "مستخدم فورس",
        rating,
        comment: "",
      });
      setRatingVisible(false);
      setRating(0);
      await load();
      Alert.alert("تم التقييم", "تم حفظ تقييمك للمتجر.");
    } catch (error) {
      console.error("rate shop failed:", error);
      Alert.alert("تعذر حفظ التقييم", "حاول مرة أخرى بعد قليل.");
    } finally {
      setSavingRating(false);
    }
  };

  if (loading) {
    return <View style={S.center}><ActivityIndicator size="large" color={C.accent} /></View>;
  }
  if (!profile) {
    return (
      <View style={S.center}>
        <Feather name="shopping-bag" size={48} color={C.textMuted} />
        <Text style={S.emptyTitle}>المتجر غير متوفر</Text>
        <Pressable onPress={() => router.back()} style={S.backFallback}><Text style={S.backText}>رجوع</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={S.root}>
      <FlatList
        data={visibleProducts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={S.productColumns}
        contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); void load(); }}
        ListHeaderComponent={
          <>
            <View style={S.cover}>
              {profile.coverUri ? (
                <Image source={{ uri: profile.coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : <View style={S.coverFallback}><Feather name="shopping-bag" size={48} color="rgba(255,255,255,.65)" /></View>}
              <View style={S.coverShade} />
              <Pressable onPress={() => router.back()} style={[S.headerButton, { top: insets.top + 10, right: 14 }]}>
                <Feather name="arrow-right" size={20} color="#FFF" />
              </Pressable>
              <Pressable onPress={() => router.push("/shop/cart" as any)} style={[S.headerButton, { top: insets.top + 10, left: 14 }]}>
                <Ionicons name="cart-outline" size={20} color="#FFF" />
                {cartCount > 0 ? <View style={S.cartBadge}><Text style={S.cartBadgeText}>{cartCount}</Text></View> : null}
              </Pressable>
              <View style={S.storeIdentity}>
                {profile.photoUri ? <Image source={{ uri: profile.photoUri }} style={S.storeLogo} /> : <View style={[S.storeLogo, S.logoFallback]}><Feather name="shopping-bag" size={25} color={C.accent} /></View>}
                <View style={S.storeIdentityText}>
                  <Text style={S.storeName} numberOfLines={1}>{profile.name || "المتجر"}</Text>
                  <Text style={S.storeSubtitle}>متجر فورس</Text>
                </View>
                {auth.currentUser?.uid === storeId ? (
                  <Pressable onPress={() => router.push("/store-manager" as any)} style={S.manageButton}>
                    <Feather name="settings" size={15} color={C.primary} />
                    <Text style={S.manageText}>إدارة</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={S.ratingCard}>
              <View style={S.ratingSummary}>
                <Ionicons name="star" size={21} color="#F5C842" />
                <Text style={S.ratingValue}>{profile.rating && profile.rating > 0 ? profile.rating.toFixed(1) : "جديد"}</Text>
                <Text style={S.reviewCount}>({profile.reviewCount || 0} تقييم)</Text>
              </View>
              <Pressable style={S.rateButton} onPress={() => { setRating(0); setRatingVisible(true); }}>
                <Text style={S.rateButtonText}>قيّم المتجر</Text>
              </Pressable>
            </View>

            {reviews.length ? (
              <View style={S.reviewsBox}>
                <Text style={S.sectionTitle}>آراء الزبائن</Text>
                {reviews.map((review, index) => (
                  <View key={`${review.clientId || "review"}-${index}`} style={S.reviewRow}>
                    <View style={S.reviewStars}>
                      {Array.from({ length: Math.min(5, Math.max(0, Number(review.rating) || 0)) }, (_, i) => (
                        <Ionicons key={i} name="star" size={12} color="#F5C842" />
                      ))}
                    </View>
                    <Text style={S.reviewName} numberOfLines={1}>{review.clientName || "زبون"}</Text>
                    {!!review.comment && <Text style={S.reviewComment}>{review.comment}</Text>}
                  </View>
                ))}
              </View>
            ) : null}

            <View style={S.productsHeader}>
              <View>
                <Text style={S.sectionTitle}>منتجات المتجر</Text>
                <Text style={S.productsCount}>{products.length} منتج متاح</Text>
              </View>
              <Feather name="grid" size={21} color={C.accent} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.categories}>
              {PRODUCT_CATEGORY_OPTIONS.map((category) => (
                <Pressable
                  key={category.key}
                  onPress={() => setActiveCategory(category.key)}
                  style={[S.categoryChip, activeCategory === category.key && S.categoryChipActive]}
                >
                  <Text style={[S.categoryText, activeCategory === category.key && S.categoryTextActive]}>{category.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        }
        renderItem={({ item }) => (
          <View style={S.productCard}>
            <Pressable onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.id, product: JSON.stringify(item) } } as any)}>
              {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={S.productImage} resizeMode="cover" /> : <View style={[S.productImage, S.productImageFallback]}><Feather name="image" size={28} color={C.textMuted} /></View>}
            </Pressable>
            <View style={S.productBody}>
              <Text style={S.productTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={S.productCategory}>{PRODUCT_CATEGORY_OPTIONS.find((category) => category.key === normalizeProductCategory(item.category))?.label || "أخرى"}</Text>
              <Text style={S.productPrice}>{Number(item.price || 0).toLocaleString("ar-IQ-u-nu-latn")} د.ع</Text>
              <Pressable style={S.addButton} onPress={() => showProductOptions(item)}>
                <Ionicons name="cart-outline" size={15} color={C.primary} />
                <Text style={S.addButtonText}>أضف للسلة</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={S.emptyProducts}>
            <Feather name="package" size={38} color={C.textMuted} />
            <Text style={S.emptyTitle}>{products.length ? "لا توجد منتجات في هذا القسم" : "لا توجد منتجات منشورة بعد"}</Text>
          </View>
        }
      />

      <Modal visible={!!selectedProduct} transparent animationType="slide" onRequestClose={() => setSelectedProduct(null)}>
        <Pressable style={S.modalOverlay} onPress={() => setSelectedProduct(null)}>
          <Pressable style={S.modalSheet} onPress={(event) => event.stopPropagation()}>
            <View style={S.modalHandle} />
            <Text style={S.modalTitle}>إضافة إلى السلة</Text>
            <Text style={S.modalProduct}>{selectedProduct?.title}</Text>
            {selectedProduct?.colors?.length ? (
              <View style={S.optionBlock}>
                <Text style={S.optionLabel}>اللون</Text>
                <View style={S.optionChoices}>
                  {selectedProduct.colors.map((value) => <Pressable key={value} onPress={() => setSelectedColor(value)} style={[S.optionChip, selectedColor === value && S.optionChipActive]}><Text style={[S.optionText, selectedColor === value && S.optionTextActive]}>{value}</Text></Pressable>)}
                </View>
              </View>
            ) : null}
            {selectedProduct?.sizes?.length ? (
              <View style={S.optionBlock}>
                <Text style={S.optionLabel}>القياس</Text>
                <View style={S.optionChoices}>
                  {selectedProduct.sizes.map((value) => <Pressable key={value} onPress={() => setSelectedSize(value)} style={[S.optionChip, selectedSize === value && S.optionChipActive]}><Text style={[S.optionText, selectedSize === value && S.optionTextActive]}>{value}</Text></Pressable>)}
                </View>
              </View>
            ) : null}
            <Pressable style={S.addButton} onPress={confirmAddToCart}>
              <Ionicons name="cart-outline" size={16} color={C.primary} />
              <Text style={S.addButtonText}>أضف للسلة</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={ratingVisible} transparent animationType="fade" onRequestClose={() => setRatingVisible(false)}>
        <Pressable style={S.modalOverlay} onPress={() => setRatingVisible(false)}>
          <Pressable style={S.ratingModal} onPress={(event) => event.stopPropagation()}>
            <Text style={S.modalTitle}>قيّم المتجر</Text>
            <View style={S.ratingChoices}>
              {[1, 2, 3, 4, 5].map((value) => <Pressable key={value} onPress={() => setRating(value)}><Ionicons name={value <= rating ? "star" : "star-outline"} size={34} color="#F5C842" /></Pressable>)}
            </View>
            <Pressable style={S.addButton} onPress={() => void submitRating()} disabled={savingRating}>
              {savingRating ? <ActivityIndicator size="small" color={C.primary} /> : <Text style={S.addButtonText}>إرسال التقييم</Text>}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, backgroundColor: C.background, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontSize: 15, color: C.textSecondary, textAlign: "center" },
  backFallback: { paddingHorizontal: 22, paddingVertical: 10, backgroundColor: C.accent, borderRadius: 12 },
  backText: { color: C.primary, fontWeight: "700" },
  cover: { height: 265, backgroundColor: "#14224a", position: "relative", justifyContent: "flex-end" },
  coverFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(4,10,25,.32)" },
  headerButton: { position: "absolute", width: 42, height: 42, borderRadius: 14, backgroundColor: "rgba(8,15,33,.72)", alignItems: "center", justifyContent: "center", zIndex: 2 },
  cartBadge: { position: "absolute", top: -3, right: -3, backgroundColor: "#EF4444", minWidth: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  cartBadgeText: { color: "#FFF", fontSize: 10, fontWeight: "700" },
  storeIdentity: { margin: 16, flexDirection: "row", alignItems: "center", gap: 12, zIndex: 1 },
  storeLogo: { width: 64, height: 64, borderRadius: 20, borderWidth: 2, borderColor: "#FFF", backgroundColor: "#FFF" },
  logoFallback: { alignItems: "center", justifyContent: "center" },
  storeIdentityText: { flex: 1 },
  storeName: { color: "#FFF", fontSize: 20, fontWeight: "800", textAlign: "right" },
  storeSubtitle: { color: "rgba(255,255,255,.78)", fontSize: 12, marginTop: 4, textAlign: "right" },
  manageButton: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9 },
  manageText: { color: C.primary, fontSize: 12, fontWeight: "700" },
  ratingCard: { margin: 14, marginBottom: 4, padding: 14, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ratingSummary: { flexDirection: "row", alignItems: "center", gap: 7 },
  ratingValue: { fontSize: 18, color: C.text, fontWeight: "700" },
  reviewCount: { color: C.textSecondary, fontSize: 12 },
  rateButton: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: C.accent },
  rateButtonText: { color: C.accent, fontWeight: "700", fontSize: 12 },
  reviewsBox: { marginHorizontal: 14, marginTop: 12, padding: 14, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  sectionTitle: { color: C.text, fontSize: 16, fontWeight: "700", textAlign: "right" },
  reviewRow: { paddingTop: 10, paddingBottom: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border, alignItems: "flex-end" },
  reviewStars: { flexDirection: "row", gap: 2 },
  reviewName: { color: C.text, fontWeight: "600", fontSize: 12, marginTop: 3 },
  reviewComment: { color: C.textSecondary, fontSize: 12, marginTop: 4 },
  productsHeader: { marginHorizontal: 16, marginTop: 20, marginBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  productsCount: { color: C.textSecondary, fontSize: 11, textAlign: "right", marginTop: 4 },
  categories: { gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  categoryChip: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  categoryChipActive: { backgroundColor: C.accent, borderColor: C.accent },
  categoryText: { color: C.textSecondary, fontSize: 12, fontWeight: "600" },
  categoryTextActive: { color: C.primary },
  productColumns: { paddingHorizontal: 10, gap: 10 },
  productCard: { flex: 1, marginBottom: 10, backgroundColor: C.card, borderRadius: 15, overflow: "hidden", borderWidth: 1, borderColor: C.border },
  productImage: { width: "100%", height: 170, backgroundColor: "#ECEEF2" },
  productImageFallback: { alignItems: "center", justifyContent: "center" },
  productBody: { padding: 11, gap: 5 },
  productTitle: { minHeight: 38, color: C.text, fontWeight: "700", fontSize: 13, textAlign: "right" },
  productCategory: { color: C.textSecondary, fontSize: 10, textAlign: "right" },
  productPrice: { color: C.accent, fontWeight: "800", fontSize: 14, textAlign: "right" },
  addButton: { backgroundColor: C.accent, borderRadius: 11, minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 5 },
  addButtonText: { color: C.primary, fontWeight: "700", fontSize: 12 },
  emptyProducts: { minHeight: 170, alignItems: "center", justifyContent: "center", gap: 10 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,.52)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 26, gap: 14 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: "center" },
  modalTitle: { color: C.text, fontSize: 17, fontWeight: "700", textAlign: "center" },
  modalProduct: { color: C.textSecondary, fontSize: 14, textAlign: "right" },
  optionBlock: { gap: 8 },
  optionLabel: { color: C.text, fontSize: 13, fontWeight: "600", textAlign: "right" },
  optionChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: { borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 },
  optionChipActive: { borderColor: C.accent, backgroundColor: "rgba(201,168,76,.12)" },
  optionText: { color: C.textSecondary, fontSize: 12 },
  optionTextActive: { color: C.accent, fontWeight: "700" },
  ratingModal: { margin: 22, backgroundColor: C.card, borderRadius: 20, padding: 22, gap: 20, alignItems: "center" },
  ratingChoices: { flexDirection: "row", gap: 8 },
});
