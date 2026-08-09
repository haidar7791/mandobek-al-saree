import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, FlatList,
  Image, TouchableOpacity, Platform, ActivityIndicator,
  Modal, ScrollView, Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { auth } from "@/lib/firebase";
import {
  getArtisans,
  subscribeToProducts,
  getSpecialtyLabel,
  isFeaturedActive,
  createProductOrder,
  cancelProductOrder,
  getUserProfile,
  type ArtisanProfile,
  type Product,
} from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [artisans, setArtisans] = useState<ArtisanProfile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingArtisans, setLoadingArtisans] = useState(true);

  // ── Product detail modal ─────────────────────────────────────────────────
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [buyingProduct, setBuyingProduct] = useState(false);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  useEffect(() => {
    getArtisans()
      .then((data) => { setArtisans(data); setLoadingArtisans(false); })
      .catch(() => setLoadingArtisans(false));
    const unsub = subscribeToProducts((data) => setProducts(data));
    return unsub;
  }, []);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const q = query.trim().toLowerCase();

  const filteredArtisans = useMemo(() => {
    if (!q) return [];
    return artisans.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        getSpecialtyLabel(a.specialty).toLowerCase().includes(q)
    );
  }, [artisans, q]);

  const filteredProducts = useMemo(() => {
    if (!q) return [];
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        p.sellerName.toLowerCase().includes(q)
    );
  }, [products, q]);

  type ResultItem =
    | { type: "artisan"; data: ArtisanProfile }
    | { type: "product"; data: Product }
    | { type: "section"; label: string; key: string };

  const listData = useMemo((): ResultItem[] => {
    if (!q) return [];
    const out: ResultItem[] = [];
    if (filteredArtisans.length > 0) {
      out.push({ type: "section", label: `أصحاب الاختصاص (${filteredArtisans.length})`, key: "sec_artisans" });
      filteredArtisans.forEach((a) => out.push({ type: "artisan", data: a }));
    }
    if (filteredProducts.length > 0) {
      out.push({ type: "section", label: `المنتجات (${filteredProducts.length})`, key: "sec_products" });
      filteredProducts.forEach((p) => out.push({ type: "product", data: p }));
    }
    return out;
  }, [filteredArtisans, filteredProducts, q]);

  const totalResults = filteredArtisans.length + filteredProducts.length;

  // ── Buy handler (same logic as dashboard) ────────────────────────────────
  const handleBuyProduct = async (p: Product) => {
    const user = auth.currentUser;
    if (!user) { router.replace("/login" as any); return; }
    const selfProfile = await getUserProfile(user.uid);
    Alert.alert(
      "تأكيد الشراء",
      `هل تريد إرسال طلب شراء لـ "${p.title}"؟\n\nسيتلقى البائع بياناتك ويتواصل معك.`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "إرسال الطلب",
          onPress: async () => {
            setBuyingProduct(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              await createProductOrder({
                productId: p.id,
                productTitle: p.title,
                productImageUrl: p.imageUrl,
                productPrice: p.price,
                sellerId: p.sellerId,
                sellerName: p.sellerName,
                buyerId: user.uid,
                buyerName: selfProfile?.name || "",
                buyerPhone: selfProfile?.phone || "",
                buyerLocation: null,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setSelectedProduct(null);
              Alert.alert("تم الإرسال ✓", "تم إرسال طلب الشراء للبائع، سيتواصل معك قريباً.");
            } catch {
              Alert.alert("خطأ", "حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مجدداً.");
            } finally {
              setBuyingProduct(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={24} color="#FFF" />
        </Pressable>
        <View style={styles.inputWrap}>
          <Feather name="search" size={16} color={C.textMuted} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="ابحث عن خدمة، منتج، أو صاحب اختصاص..."
            placeholderTextColor={C.textMuted}
            value={query}
            onChangeText={setQuery}
            textAlign="right"
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Feather name="x" size={15} color={C.textMuted} />
            </Pressable>
          )}
        </View>
      </LinearGradient>

      {q === "" ? (
        <View style={styles.center}>
          <View style={styles.centerIcon}>
            <Feather name="search" size={36} color={C.accent} />
          </View>
          <Text style={styles.emptyTitle}>ابحث في كامل التطبيق</Text>
          <Text style={styles.emptySub}>أصحاب الاختصاص · المنتجات</Text>
        </View>
      ) : loadingArtisans ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : totalResults === 0 ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={48} color={C.textMuted} />
          <Text style={styles.emptyTitle}>لا نتائج لـ "{query}"</Text>
          <Text style={styles.emptySub}>جرّب مصطلحاً مختلفاً</Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) =>
            item.type === "section" ? item.key : `${item.type}_${item.data.id}`
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.resultsCount}>{totalResults} نتيجة</Text>
          }
          renderItem={({ item }) => {
            if (item.type === "section") {
              return <Text style={styles.sectionLabel}>{item.label}</Text>;
            }

            if (item.type === "artisan") {
              const a = item.data as ArtisanProfile;
              return (
                <TouchableOpacity
                  style={styles.rowCard}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: "/artisan-profile",
                      params: { artisanId: a.id, artisan: JSON.stringify(a) },
                    });
                  }}
                >
                  {a.photoUri ? (
                    <Image source={{ uri: a.photoUri }} style={styles.artisanPhoto} />
                  ) : (
                    <View style={styles.artisanInitials}>
                      <Text style={styles.artisanInitialsText}>{a.name[0]}</Text>
                    </View>
                  )}
                  <View style={styles.rowInfo}>
                    <View style={styles.nameRow}>
                      <Text style={styles.rowName}>{a.name}</Text>
                      {isFeaturedActive(a) && (
                        <View style={styles.featuredBadge}>
                          <Ionicons name="star" size={9} color={C.primary} />
                          <Text style={styles.featuredText}>مميز</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.rowSub}>{getSpecialtyLabel(a.specialty)}</Text>
                  </View>
                  <View style={[styles.availDot, { backgroundColor: a.isAvailable ? "#22C55E" : C.border }]} />
                </TouchableOpacity>
              );
            }

            // ── Product card ── now fully pressable → opens detail modal
            const p = item.data as Product;
            const isSold = p.status === "sold";
            const sellerFeatured = isFeaturedActive({ featuredUntil: p.sellerFeaturedUntil });
            return (
              <TouchableOpacity
                style={[styles.rowCard, isSold && styles.rowCardDim]}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedProduct(p);
                }}
              >
                {p.imageUrl ? (
                  <Image source={{ uri: p.imageUrl }} style={styles.productThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.productThumb, styles.thumbFallback]}>
                    <Feather name="image" size={18} color={C.textMuted} />
                  </View>
                )}
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName} numberOfLines={1}>{p.title}</Text>
                  <Text style={styles.priceText}>{p.price.toLocaleString("ar-IQ")} د.ع</Text>
                  <View style={styles.sellerRow}>
                    <Text style={styles.rowSub} numberOfLines={1}>{p.sellerName}</Text>
                    {sellerFeatured && (
                      <View style={styles.featuredBadge}>
                        <Ionicons name="star" size={9} color={C.primary} />
                        <Text style={styles.featuredText}>مميز</Text>
                      </View>
                    )}
                  </View>
                </View>
                {isSold ? (
                  <View style={styles.soldBadge}>
                    <Text style={styles.soldText}>مباع</Text>
                  </View>
                ) : (
                  <Feather name="chevron-left" size={16} color={C.textMuted} />
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ══════════════════════════════════════════
          PRODUCT DETAIL BOTTOM SHEET MODAL
      ══════════════════════════════════════════ */}
      <Modal
        visible={!!selectedProduct}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedProduct(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedProduct(null)}>
          <Pressable style={styles.detailSheet} onPress={(e) => e.stopPropagation()}>
            {selectedProduct && (() => {
              const p = selectedProduct;
              const isSold = p.status === "sold";
              const sellerFeatured = isFeaturedActive({ featuredUntil: p.sellerFeaturedUntil });
              return (
                <>
                  {/* Handle */}
                  <View style={styles.sheetHandle} />

                  <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                    {/* Product image */}
                    {p.imageUrl ? (
                      <Image
                        source={{ uri: p.imageUrl }}
                        style={styles.detailImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.detailImage, styles.detailImageFallback]}>
                        <Feather name="image" size={48} color={C.textMuted} />
                      </View>
                    )}

                    {/* Sold overlay label */}
                    {isSold && (
                      <View style={styles.detailSoldBanner}>
                        <Text style={styles.detailSoldBannerText}>هذا المنتج تم بيعه</Text>
                      </View>
                    )}

                    <View style={styles.detailBody}>
                      {/* Title + price */}
                      <Text style={styles.detailTitle}>{p.title}</Text>
                      <Text style={styles.detailPrice}>
                        {p.price.toLocaleString("ar-IQ")}
                        <Text style={styles.detailCurrency}> د.ع</Text>
                      </Text>

                      {/* Description */}
                      {p.description ? (
                        <Text style={styles.detailDesc}>{p.description}</Text>
                      ) : null}

                      {/* Seller row */}
                      <TouchableOpacity
                        style={styles.detailSellerRow}
                        activeOpacity={0.75}
                        onPress={() => {
                          setSelectedProduct(null);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push({ pathname: "/user-profile", params: { userId: p.sellerId, userName: p.sellerName } } as any);
                        }}
                      >
                        <Feather name="chevron-left" size={16} color={C.textSecondary} />
                        <View style={styles.detailSellerInfo}>
                          <Text style={styles.detailSellerName}>{p.sellerName}</Text>
                          {sellerFeatured && (
                            <View style={styles.featuredBadge}>
                              <Ionicons name="star" size={9} color={C.primary} />
                              <Text style={styles.featuredText}>مميز</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.detailSellerIcon}>
                          <Feather name="user" size={16} color={C.primary} />
                        </View>
                      </TouchableOpacity>

                      {/* Buy / sold button */}
                      {isSold ? (
                        <View style={[styles.detailBuyBtn, styles.detailBuyBtnSold]}>
                          <Text style={styles.detailBuyBtnText}>تم البيع</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[styles.detailBuyBtn, buyingProduct && { opacity: 0.6 }]}
                          activeOpacity={0.85}
                          disabled={buyingProduct}
                          onPress={() => handleBuyProduct(p)}
                        >
                          {buyingProduct ? (
                            <ActivityIndicator size="small" color={C.primary} />
                          ) : (
                            <>
                              <Feather name="shopping-bag" size={16} color={C.primary} />
                              <Text style={styles.detailBuyBtnText}>إرسال طلب شراء</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}

                      <View style={{ height: 8 }} />
                    </View>
                  </ScrollView>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10, gap: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  inputWrap: {
    flex: 1, flexDirection: "row", alignItems: "center",
    backgroundColor: "#FFF", borderRadius: 13,
    paddingHorizontal: 12, paddingVertical: 9, gap: 8,
  },
  input: {
    flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular",
    color: C.text, padding: 0,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
  centerIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: "rgba(201,168,76,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontFamily: "Cairo_700Bold", color: C.text },
  emptySub: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "center" },
  list: { padding: 14, gap: 8, paddingBottom: 40 },
  resultsCount: {
    fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted,
    textAlign: "right", marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 13, fontFamily: "Cairo_700Bold", color: C.text,
    textAlign: "right", marginTop: 10, marginBottom: 4,
  },
  rowCard: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    backgroundColor: C.card, borderRadius: 14, padding: 12,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  rowCardDim: { opacity: 0.65 },
  artisanPhoto: { width: 50, height: 50, borderRadius: 14 },
  artisanInitials: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: "rgba(201,168,76,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  artisanInitialsText: { fontSize: 20, fontFamily: "Cairo_700Bold", color: C.accent },
  rowInfo: { flex: 1, gap: 3, alignItems: "flex-end" },
  nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  rowName: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text },
  rowSub: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textSecondary },
  priceText: { fontSize: 13, fontFamily: "Cairo_700Bold", color: C.accent },
  featuredBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: C.accent, borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  featuredText: { fontSize: 9, fontFamily: "Cairo_700Bold", color: C.primary },
  availDot: { width: 10, height: 10, borderRadius: 5 },
  productThumb: { width: 60, height: 60, borderRadius: 12 },
  thumbFallback: { backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center" },
  sellerRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 5, flexWrap: "wrap",
  },
  soldBadge: {
    backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  soldText: { fontSize: 11, fontFamily: "Cairo_700Bold", color: "#EF4444" },

  // ── Product Detail Modal ──────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  detailSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    maxHeight: "88%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 16,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center", marginTop: 10, marginBottom: 4,
  },
  detailImage: {
    width: "100%",
    height: 240,
  },
  detailImageFallback: {
    backgroundColor: C.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },
  detailSoldBanner: {
    backgroundColor: "rgba(239,68,68,0.9)",
    paddingVertical: 8,
    alignItems: "center",
  },
  detailSoldBannerText: {
    fontSize: 14, fontFamily: "Cairo_700Bold", color: "#fff",
  },
  detailBody: {
    padding: 20, gap: 10,
  },
  detailTitle: {
    fontSize: 20, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right",
  },
  detailPrice: {
    fontSize: 22, fontFamily: "Cairo_700Bold", color: C.accent, textAlign: "right",
  },
  detailCurrency: {
    fontSize: 14, fontFamily: "Cairo_400Regular", color: C.textSecondary,
  },
  detailDesc: {
    fontSize: 14, fontFamily: "Cairo_400Regular", color: C.textSecondary,
    textAlign: "right", lineHeight: 22,
  },
  detailSellerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.inputBg,
    borderRadius: 14,
    padding: 12,
    marginTop: 4,
  },
  detailSellerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(201,168,76,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  detailSellerInfo: {
    flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 6,
  },
  detailSellerName: {
    fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.text,
  },
  detailBuyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  detailBuyBtnSold: {
    backgroundColor: C.border,
  },
  detailBuyBtnText: {
    fontSize: 15, fontFamily: "Cairo_700Bold", color: C.primary,
  },
});
