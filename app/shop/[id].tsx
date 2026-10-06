import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  ALL_SPECIALTIES,
  addReview,
  fetchSellerProductsPage,
  getCategoryForSpecialty,
  getProfileEngagementCounts,
  getUserProfile,
  deleteProduct,
  setUserProfile,
  updateStoreProductDetails,
  type Product,
  type UserProfile,
  uploadProfilePhoto,
} from "@/lib/db_logic";
import { PRODUCT_CATEGORY_OPTIONS, normalizeProductCategory, type ProductCategoryFilter } from "@/lib/product_categories";
import { addStoreCartItem, getStoreCartCount } from "@/lib/store_cart";
import { performSignOut } from "@/lib/push_notifications";
import Colors from "@/constants/colors";

const C = Colors.light;

type OwnerConfirmation =
  | { kind: "logout" }
  | { kind: "deleteProduct"; product: Product };

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const storeId = Array.isArray(rawId) ? rawId[0] : rawId;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [followersCount, setFollowersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<"coverUri" | "photoUri" | null>(null);
  const [activeCategory, setActiveCategory] = useState<ProductCategoryFilter>("all");
  const [cartCount, setCartCount] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [ratingVisible, setRatingVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [savingRating, setSavingRating] = useState(false);
  const [nameEditorVisible, setNameEditorVisible] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [specialtyEditorVisible, setSpecialtyEditorVisible] = useState(false);
  const [editedSpecialty, setEditedSpecialty] = useState("store");
  const [savingSpecialty, setSavingSpecialty] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editedProductTitle, setEditedProductTitle] = useState("");
  const [editedProductPrice, setEditedProductPrice] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [ownerConfirmation, setOwnerConfirmation] = useState<OwnerConfirmation | null>(null);
  const [confirmingOwnerAction, setConfirmingOwnerAction] = useState(false);
  const [ownerActionError, setOwnerActionError] = useState("");
  const isOwner = Boolean(storeId && auth.currentUser?.uid === storeId);

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFollowersCount(0);
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
      const engagement = await getProfileEngagementCounts(storeId);
      setFollowersCount(engagement.followCount);
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

  const changeStoreImage = async (field: "coverUri" | "photoUri") => {
    if (!isOwner || !storeId || uploadingImage) return;

    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("إذن الصور مطلوب", "اسمح بالوصول إلى الصور لاختيار صورة المتجر.");
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: field === "coverUri" ? [16, 8] : [1, 1],
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0] || !profile) return;

    const previousProfile = profile;
    const localUri = result.assets[0].uri;
    setProfile((current) => current ? { ...current, [field]: localUri } : current);
    setUploadingImage(field);
    try {
      const url = await uploadProfilePhoto(storeId, localUri);
      if (field === "coverUri") {
        await setUserProfile(storeId, { coverUri: url });
      } else {
        await setUserProfile(storeId, { photoUri: url });
      }
      setProfile((current) => current ? { ...current, [field]: url } : current);
    } catch (error) {
      console.error(`save store ${field} failed:`, error);
      setProfile(previousProfile);
      Alert.alert(
        "تعذر حفظ الصورة",
        field === "coverUri"
          ? "لم يتم حفظ غلاف المتجر. تحقق من الاتصال ثم حاول مجدداً."
          : "لم يتم حفظ شعار المتجر. تحقق من الاتصال ثم حاول مجدداً.",
      );
    } finally {
      setUploadingImage(null);
    }
  };

  const openNameEditor = () => {
    if (!isOwner || !profile) return;
    setEditedName(profile.name || "");
    setNameEditorVisible(true);
  };

  const saveStoreName = async () => {
    const nextName = editedName.trim();
    if (!storeId || !profile || !isOwner) return;
    if (!nextName) {
      Alert.alert("الاسم مطلوب", "اكتب الاسم الذي سيظهر في المتجر.");
      return;
    }
    if (nextName === profile.name?.trim()) {
      setNameEditorVisible(false);
      return;
    }

    setSavingName(true);
    try {
      await setUserProfile(storeId, { name: nextName });
      const currentUser = auth.currentUser;
      if (currentUser?.uid === storeId) {
        try {
          await updateProfile(currentUser, { displayName: nextName });
        } catch (error) {
          console.warn("sync store name to Firebase Auth failed:", error);
        }
      }
      setProfile((current) => current ? { ...current, name: nextName } : current);
      setNameEditorVisible(false);
      Alert.alert("تم تحديث الاسم", "تم تحديث اسم المتجر وملفك الشخصي.");
    } catch (error) {
      console.error("save store name failed:", error);
      Alert.alert("تعذر حفظ الاسم", "تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSavingName(false);
    }
  };

  const openSpecialtyEditor = () => {
    if (!isOwner || !profile) return;
    setEditedSpecialty(profile.specialty || "store");
    setSpecialtyEditorVisible(true);
  };

  const saveSpecialty = async () => {
    if (!storeId || !profile || !isOwner) return;
    if (
      editedSpecialty !== "client" &&
      !ALL_SPECIALTIES.some((item) => item.key === editedSpecialty)
    ) {
      Alert.alert("تخصص غير صالح", "اختر تخصصاً من القائمة.");
      return;
    }
    if (editedSpecialty === profile.specialty) {
      setSpecialtyEditorVisible(false);
      return;
    }

    setSavingSpecialty(true);
    try {
      if (editedSpecialty === "client") {
        await setUserProfile(storeId, {
          specialty: "client",
          role: "client",
          category: "client" as any,
          isAvailable: false,
        });
      } else {
        await setUserProfile(storeId, {
          specialty: editedSpecialty,
          role: "artisan",
          category: getCategoryForSpecialty(editedSpecialty),
          isAvailable: true,
        });
      }
      setSpecialtyEditorVisible(false);
      router.replace("/profile" as any);
    } catch (error) {
      console.error("save store specialty failed:", error);
      Alert.alert("تعذر تغيير التخصص", "تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSavingSpecialty(false);
    }
  };

  const confirmOwnerSignOut = () => {
    if (!isOwner) return;
    setOwnerActionError("");
    setOwnerConfirmation({ kind: "logout" });
  };

  const openProductEditor = (product: Product) => {
    if (!isOwner || !storeId || product.sellerId !== storeId) return;
    setEditingProduct(product);
    setEditedProductTitle(product.title);
    setEditedProductPrice(String(product.price));
  };

  const saveProductChanges = async () => {
    if (!isOwner || !storeId || !editingProduct || editingProduct.sellerId !== storeId) return;
    const title = editedProductTitle.trim();
    const price = Number(editedProductPrice.trim().replace(/,/g, ""));
    if (!title) {
      Alert.alert("اسم المنتج مطلوب", "اكتب اسم المنتج قبل الحفظ.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      Alert.alert("السعر غير صالح", "أدخل سعراً أكبر من صفر.");
      return;
    }

    setSavingProduct(true);
    try {
      await updateStoreProductDetails(editingProduct.id, { title, price });
      setProducts((current) => current.map((product) =>
        product.id === editingProduct.id ? { ...product, title, price } : product
      ));
      setEditingProduct(null);
      Alert.alert("تم التعديل", "تم تحديث اسم المنتج وسعره.");
    } catch (error) {
      console.error("update store product failed:", error);
      Alert.alert("تعذر تعديل المنتج", "تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSavingProduct(false);
    }
  };

  const confirmDeleteProduct = (product: Product) => {
    if (!isOwner || !storeId || product.sellerId !== storeId || deletingProductId) return;
    setOwnerActionError("");
    setOwnerConfirmation({ kind: "deleteProduct", product });
  };

  const runOwnerConfirmation = async () => {
    const confirmation = ownerConfirmation;
    if (!confirmation || !isOwner || !storeId || confirmingOwnerAction) return;

    setConfirmingOwnerAction(true);
    setOwnerActionError("");
    try {
      if (confirmation.kind === "logout") {
        await performSignOut();
        setOwnerConfirmation(null);
        router.replace("/");
        return;
      }

      if (confirmation.product.sellerId !== storeId) {
        throw new Error("لا تملك صلاحية حذف هذا المنتج");
      }
      setDeletingProductId(confirmation.product.id);
      await deleteProduct(confirmation.product.id);
      setProducts((current) => current.filter((item) => item.id !== confirmation.product.id));
      setOwnerConfirmation(null);
    } catch (error) {
      console.error(
        confirmation.kind === "logout" ? "store owner sign out failed:" : "delete store product failed:",
        error,
      );
      setOwnerActionError(
        confirmation.kind === "logout"
          ? "تعذر تسجيل الخروج. حاول مرة أخرى."
          : "تعذر حذف المنتج. تحقق من الاتصال ثم حاول مرة أخرى.",
      );
    } finally {
      setConfirmingOwnerAction(false);
      setDeletingProductId(null);
    }
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
              {isOwner ? (
                <Pressable
                  onPress={() => router.push("/support" as any)}
                  style={[S.headerButton, { top: insets.top + 10, right: 14 }]}
                  accessibilityRole="button"
                  accessibilityLabel="مراسلة الدعم"
                >
                  <Feather name="headphones" size={19} color={C.accent} />
                </Pressable>
              ) : (
                <Pressable onPress={() => router.back()} style={[S.headerButton, { top: insets.top + 10, right: 14 }]}>
                  <Feather name="arrow-right" size={20} color="#FFF" />
                </Pressable>
              )}
              {isOwner ? (
                <Pressable
                  onPress={confirmOwnerSignOut}
                  style={[S.headerButton, S.headerLogoutButton, { top: insets.top + 10, left: 14 }]}
                  accessibilityRole="button"
                  accessibilityLabel="تسجيل الخروج"
                >
                  <Feather name="log-out" size={19} color="#FFF" />
                </Pressable>
              ) : (
                <Pressable onPress={() => router.push("/shop/cart" as any)} style={[S.headerButton, { top: insets.top + 10, left: 14 }]}>
                  <Ionicons name="cart-outline" size={20} color="#FFF" />
                  {cartCount > 0 ? <View style={S.cartBadge}><Text style={S.cartBadgeText}>{cartCount}</Text></View> : null}
                </Pressable>
              )}
              {isOwner ? (
                <Pressable
                  onPress={() => void changeStoreImage("coverUri")}
                  disabled={uploadingImage !== null}
                  style={[S.coverEditButton, { top: insets.top + 60, left: 14 }]}
                  accessibilityRole="button"
                  accessibilityLabel="تغيير غلاف المتجر"
                >
                  {uploadingImage === "coverUri" ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Feather name="camera" size={14} color="#FFF" />
                  )}
                  <Text style={S.coverEditText}>
                    {uploadingImage === "coverUri" ? "جارٍ الحفظ" : "تغيير الغلاف"}
                  </Text>
                </Pressable>
              ) : null}
              <View style={S.storeIdentity}>
                <View style={S.logoWrap}>
                  {profile.photoUri ? (
                    <Image source={{ uri: profile.photoUri }} style={S.storeLogo} />
                  ) : (
                    <View style={[S.storeLogo, S.logoFallback]}>
                      <Feather name="shopping-bag" size={25} color={C.accent} />
                    </View>
                  )}
                  {isOwner ? (
                    <Pressable
                      onPress={() => void changeStoreImage("photoUri")}
                      disabled={uploadingImage !== null}
                      style={S.logoEditButton}
                      accessibilityRole="button"
                      accessibilityLabel="تغيير شعار المتجر"
                    >
                      {uploadingImage === "photoUri" ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Feather name="camera" size={12} color="#FFF" />
                      )}
                    </Pressable>
                  ) : null}
                </View>
                <View style={[S.storeIdentityText, isOwner && S.storeIdentityTextOwner]}>
                  <View style={S.storeNameRow}>
                    <Text style={S.storeName} numberOfLines={1}>{profile.name || "المتجر"}</Text>
                    {isOwner ? (
                      <Pressable
                        onPress={openNameEditor}
                        style={S.nameEditButton}
                        accessibilityRole="button"
                        accessibilityLabel="تغيير اسم المتجر"
                      >
                        <Feather name="edit-3" size={15} color={C.accent} />
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={S.storeMetaRow}>
                    <View style={S.specialtyPill}>
                      <Feather name="shopping-bag" size={11} color="#FFF" />
                      <Text style={S.specialtyPillText}>
                        {ALL_SPECIALTIES.find((specialty) => specialty.key === profile.specialty)?.label || "متجر"}
                      </Text>
                    </View>
                    {isOwner ? (
                      <Pressable
                        onPress={openSpecialtyEditor}
                        style={S.changeSpecialtyButton}
                        accessibilityRole="button"
                        accessibilityLabel="تغيير التخصص"
                      >
                        <Feather name="edit-2" size={11} color="#FFF" />
                        <Text style={S.changeSpecialtyText}>تغيير التخصص</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>

            {isOwner ? (
              <View style={S.ownerActions}>
                <Pressable
                  style={S.ownerPrimaryAction}
                  onPress={() => router.push("/add-product" as any)}
                  accessibilityRole="button"
                >
                  <Feather name="plus" size={17} color={C.primary} />
                  <Text style={S.ownerPrimaryText}>إضافة منتج</Text>
                </Pressable>
                <Pressable
                  style={S.ownerSecondaryAction}
                  onPress={() => router.push("/product-orders" as any)}
                  accessibilityRole="button"
                >
                  <Feather name="clipboard" size={16} color={C.accent} />
                  <Text style={S.ownerSecondaryText}>طلبات المتجر</Text>
                </Pressable>
              </View>
            ) : null}

            {isOwner ? (
              <View style={S.ownerAccountActions}>
                <Pressable
                  style={[S.ownerAccountAction, S.ownerPromoteAction]}
                  onPress={() => router.push("/promote" as any)}
                  accessibilityRole="button"
                  accessibilityLabel="ترويج وإعلان"
                >
                  <Ionicons name="rocket-outline" size={16} color="#FFF" />
                  <Text style={S.ownerPromoteText}>ترويج وإعلان</Text>
                </Pressable>
                <Pressable
                  style={S.ownerAccountAction}
                  onPress={() => router.push("/wallet" as any)}
                  accessibilityRole="button"
                  accessibilityLabel="المحفظة والرصيد"
                >
                  <Feather name="credit-card" size={16} color={C.accent} />
                  <Text style={S.ownerAccountActionText}>المحفظة والرصيد</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={S.ratingCard}>
              <View style={S.ratingMetrics}>
                <View style={S.ratingSummary}>
                  <Ionicons name="star" size={21} color="#F5C842" />
                  <Text style={S.ratingValue}>{profile.rating && profile.rating > 0 ? profile.rating.toFixed(1) : "جديد"}</Text>
                  <Text style={S.reviewCount}>({profile.reviewCount || 0} تقييم)</Text>
                </View>
                <View style={S.followersSummary}>
                  <Feather name="users" size={15} color={C.accent} />
                  <Text style={S.followersValue}>{followersCount.toLocaleString("ar-IQ-u-nu-latn")}</Text>
                  <Text style={S.reviewCount}>متابع</Text>
                </View>
              </View>
              {!isOwner ? (
                <Pressable style={S.rateButton} onPress={() => { setRating(0); setRatingVisible(true); }}>
                  <Text style={S.rateButtonText}>قيّم المتجر</Text>
                </Pressable>
              ) : null}
            </View>

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
              {isOwner ? (
                <View style={S.ownerProductActions}>
                  <Pressable
                    style={S.editProductButton}
                    onPress={() => openProductEditor(item)}
                    disabled={deletingProductId === item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`تعديل ${item.title}`}
                  >
                    <Feather name="edit-2" size={13} color={C.primary} />
                    <Text style={S.productActionText}>تعديل</Text>
                  </Pressable>
                  <Pressable
                    style={S.deleteProductButton}
                    onPress={() => confirmDeleteProduct(item)}
                    disabled={deletingProductId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`حذف ${item.title}`}
                  >
                    {deletingProductId === item.id
                      ? <ActivityIndicator size="small" color="#B42318" />
                      : <Feather name="trash-2" size={13} color="#B42318" />}
                    <Text style={[S.productActionText, S.deleteProductText]}>حذف</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={S.addButton} onPress={() => showProductOptions(item)}>
                  <Ionicons name="cart-outline" size={15} color={C.primary} />
                  <Text style={S.addButtonText}>أضف للسلة</Text>
                </Pressable>
              )}
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

      <Modal visible={!!editingProduct} transparent animationType="slide" onRequestClose={() => !savingProduct && setEditingProduct(null)}>
        <Pressable style={S.modalOverlay} onPress={() => !savingProduct && setEditingProduct(null)}>
          <Pressable style={S.accountModalSheet} onPress={(event) => event.stopPropagation()}>
            <View style={S.modalHandle} />
            <Text style={S.modalTitle}>تعديل بيانات المنتج</Text>
            <Text style={S.productEditLabel}>اسم المنتج</Text>
            <TextInput
              style={S.accountInput}
              value={editedProductTitle}
              onChangeText={setEditedProductTitle}
              placeholder="اسم المنتج"
              placeholderTextColor={C.textMuted}
              textAlign="right"
              maxLength={100}
              returnKeyType="next"
            />
            <Text style={S.productEditLabel}>السعر بالدينار العراقي</Text>
            <TextInput
              style={S.accountInput}
              value={editedProductPrice}
              onChangeText={setEditedProductPrice}
              placeholder="السعر"
              placeholderTextColor={C.textMuted}
              textAlign="right"
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={() => void saveProductChanges()}
            />
            <View style={S.accountModalActions}>
              <Pressable
                style={S.accountCancelButton}
                onPress={() => setEditingProduct(null)}
                disabled={savingProduct}
              >
                <Text style={S.accountCancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                style={[S.accountSaveButton, savingProduct && S.accountButtonDisabled]}
                onPress={() => void saveProductChanges()}
                disabled={savingProduct}
              >
                {savingProduct ? <ActivityIndicator size="small" color={C.primary} /> : <Text style={S.accountSaveText}>حفظ التعديلات</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!ownerConfirmation}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!confirmingOwnerAction) {
            setOwnerConfirmation(null);
            setOwnerActionError("");
          }
        }}
      >
        <View style={S.confirmOverlay}>
          <View style={S.confirmSheet}>
            <View style={S.confirmIcon}>
              <Feather
                name={ownerConfirmation?.kind === "logout" ? "log-out" : "trash-2"}
                size={22}
                color="#B42318"
              />
            </View>
            <Text style={S.modalTitle}>
              {ownerConfirmation?.kind === "logout" ? "تسجيل الخروج" : "حذف المنتج"}
            </Text>
            <Text style={S.confirmMessage}>
              {ownerConfirmation?.kind === "logout"
                ? "هل تريد تسجيل الخروج من حسابك؟"
                : `هل تريد حذف «${ownerConfirmation?.product.title || ""}» نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`}
            </Text>
            {ownerActionError ? <Text style={S.confirmError}>{ownerActionError}</Text> : null}
            <View style={S.accountModalActions}>
              <Pressable
                style={S.accountCancelButton}
                onPress={() => {
                  setOwnerConfirmation(null);
                  setOwnerActionError("");
                }}
                disabled={confirmingOwnerAction}
              >
                <Text style={S.accountCancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                style={[S.confirmDangerButton, confirmingOwnerAction && S.accountButtonDisabled]}
                onPress={() => void runOwnerConfirmation()}
                disabled={confirmingOwnerAction}
              >
                {confirmingOwnerAction
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={S.confirmDangerText}>{ownerConfirmation?.kind === "logout" ? "تسجيل الخروج" : "حذف المنتج"}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
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

      <Modal visible={nameEditorVisible} transparent animationType="slide" onRequestClose={() => setNameEditorVisible(false)}>
        <Pressable style={S.modalOverlay} onPress={() => setNameEditorVisible(false)}>
          <Pressable style={S.accountModalSheet} onPress={(event) => event.stopPropagation()}>
            <View style={S.modalHandle} />
            <Text style={S.modalTitle}>تغيير اسم المتجر</Text>
            <TextInput
              style={S.accountInput}
              value={editedName}
              onChangeText={setEditedName}
              placeholder="اكتب الاسم الجديد"
              placeholderTextColor={C.textMuted}
              textAlign="right"
              autoCapitalize="words"
              maxLength={60}
              returnKeyType="done"
              onSubmitEditing={() => void saveStoreName()}
            />
            <View style={S.accountModalActions}>
              <Pressable
                style={S.accountCancelButton}
                onPress={() => setNameEditorVisible(false)}
                disabled={savingName}
              >
                <Text style={S.accountCancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                style={[S.accountSaveButton, savingName && S.accountButtonDisabled]}
                onPress={() => void saveStoreName()}
                disabled={savingName}
              >
                {savingName ? <ActivityIndicator size="small" color={C.primary} /> : <Text style={S.accountSaveText}>حفظ الاسم</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={specialtyEditorVisible} transparent animationType="slide" onRequestClose={() => setSpecialtyEditorVisible(false)}>
        <Pressable style={S.modalOverlay} onPress={() => setSpecialtyEditorVisible(false)}>
          <Pressable
            style={[S.specialtyModalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={S.modalHandle} />
            <Text style={S.modalTitle}>اختر التخصص الجديد</Text>
            <ScrollView style={S.specialtyOptions} showsVerticalScrollIndicator={false}>
              {[{ key: "client", label: "عام" }, ...ALL_SPECIALTIES].map((item) => {
                const selected = editedSpecialty === item.key;
                return (
                  <Pressable
                    key={item.key}
                    style={[S.specialtyOption, selected && S.specialtyOptionSelected]}
                    onPress={() => setEditedSpecialty(item.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[S.specialtyOptionText, selected && S.specialtyOptionTextSelected]}>
                      {item.label}
                    </Text>
                    {selected ? <Feather name="check" size={17} color={C.accent} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={S.accountModalActions}>
              <Pressable
                style={S.accountCancelButton}
                onPress={() => setSpecialtyEditorVisible(false)}
                disabled={savingSpecialty}
              >
                <Text style={S.accountCancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                style={[S.accountSaveButton, savingSpecialty && S.accountButtonDisabled]}
                onPress={() => void saveSpecialty()}
                disabled={savingSpecialty}
              >
                {savingSpecialty ? <ActivityIndicator size="small" color={C.primary} /> : <Text style={S.accountSaveText}>حفظ التخصص</Text>}
              </Pressable>
            </View>
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
  coverEditButton: { position: "absolute", minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 12, borderRadius: 13, backgroundColor: "rgba(8,15,33,.78)", zIndex: 2 },
  coverEditText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  cartBadge: { position: "absolute", top: -3, right: -3, backgroundColor: "#EF4444", minWidth: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  cartBadgeText: { color: "#FFF", fontSize: 10, fontWeight: "700" },
  storeIdentity: { margin: 16, flexDirection: "row", alignItems: "center", gap: 4, zIndex: 1 },
  logoWrap: { width: 64, height: 64, position: "relative" },
  storeLogo: { width: 64, height: 64, borderRadius: 20, borderWidth: 2, borderColor: "#FFF", backgroundColor: "#FFF" },
  logoFallback: { alignItems: "center", justifyContent: "center" },
  logoEditButton: { position: "absolute", left: -5, bottom: -4, width: 27, height: 27, borderRadius: 14, borderWidth: 2, borderColor: "#FFF", backgroundColor: "#0D1B3E", alignItems: "center", justifyContent: "center" },
  storeIdentityText: { flex: 1 },
  storeIdentityTextOwner: { flex: 0, flexShrink: 1, maxWidth: "100%" },
  storeNameRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start", alignSelf: "flex-start", gap: 2, maxWidth: "100%" },
  storeName: { flexShrink: 1, color: "#FFF", fontSize: 20, fontWeight: "800", textAlign: "right" },
  nameEditButton: { width: 29, height: 29, borderRadius: 10, backgroundColor: "rgba(8,15,33,.72)", alignItems: "center", justifyContent: "center" },
  storeMetaRow: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, marginTop: 4, flexWrap: "wrap", maxWidth: "100%" },
  specialtyPill: { minHeight: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,.16)", borderWidth: 1, borderColor: "rgba(255,255,255,.28)" },
  specialtyPillText: { color: "#FFF", fontSize: 10, fontWeight: "700" },
  changeSpecialtyButton: { minHeight: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 7, borderRadius: 8, backgroundColor: "rgba(8,15,33,.72)", borderWidth: 1, borderColor: "rgba(255,255,255,.22)" },
  changeSpecialtyText: { color: "#FFF", fontSize: 10, fontWeight: "600" },
  ownerActions: { marginHorizontal: 14, marginTop: 12, flexDirection: "row", gap: 9 },
  ownerPrimaryAction: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: C.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  ownerPrimaryText: { color: C.primary, fontSize: 12, fontWeight: "700" },
  ownerSecondaryAction: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  ownerSecondaryText: { color: C.text, fontSize: 12, fontWeight: "600" },
  ownerAccountActions: { marginHorizontal: 14, marginTop: 9, flexDirection: "row", gap: 9 },
  ownerAccountAction: { flex: 1, minHeight: 43, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  ownerAccountActionText: { color: C.text, fontSize: 12, fontWeight: "600" },
  ownerPromoteAction: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  ownerPromoteText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  headerLogoutButton: { backgroundColor: "rgba(220,38,38,.78)" },
  ratingCard: { margin: 14, marginBottom: 4, padding: 14, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  ratingMetrics: { flex: 1, gap: 7 },
  ratingSummary: { flexDirection: "row", alignItems: "center", gap: 7 },
  followersSummary: { flexDirection: "row", alignItems: "center", gap: 6 },
  followersValue: { fontSize: 13, color: C.text, fontWeight: "700" },
  ratingValue: { fontSize: 18, color: C.text, fontWeight: "700" },
  reviewCount: { color: C.textSecondary, fontSize: 12 },
  rateButton: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: C.accent },
  rateButtonText: { color: C.accent, fontWeight: "700", fontSize: 12 },
  sectionTitle: { color: C.text, fontSize: 16, fontWeight: "700", textAlign: "right" },
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
  ownerProductActions: { flexDirection: "row", gap: 5, marginTop: 5 },
  editProductButton: { flex: 1, minHeight: 38, borderRadius: 10, backgroundColor: C.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  deleteProductButton: { flex: 1, minHeight: 38, borderRadius: 10, backgroundColor: "rgba(220,38,38,.08)", borderWidth: 1, borderColor: "rgba(220,38,38,.2)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  productActionText: { color: C.primary, fontWeight: "700", fontSize: 11 },
  deleteProductText: { color: "#B42318" },
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
  accountModalSheet: { backgroundColor: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 28, gap: 16 },
  confirmOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,.52)", alignItems: "center", justifyContent: "center", padding: 22 },
  confirmSheet: { width: "100%", maxWidth: 420, backgroundColor: C.card, borderRadius: 20, padding: 22, gap: 14 },
  confirmIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "rgba(220,38,38,.08)", alignItems: "center", justifyContent: "center", alignSelf: "center" },
  confirmMessage: { color: C.textSecondary, fontSize: 14, lineHeight: 22, textAlign: "center" },
  confirmError: { color: "#B42318", fontSize: 12, textAlign: "center" },
  confirmDangerButton: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: "#B42318", alignItems: "center", justifyContent: "center" },
  confirmDangerText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  specialtyModalSheet: { maxHeight: "88%", backgroundColor: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 14, gap: 12 },
  accountInput: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.background, paddingHorizontal: 14, color: C.text, fontSize: 15 },
  productEditLabel: { color: C.textSecondary, fontSize: 12, fontWeight: "600", textAlign: "right", marginBottom: -10 },
  accountModalActions: { flexDirection: "row", gap: 10, marginTop: 2 },
  accountCancelButton: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  accountCancelText: { color: C.textSecondary, fontSize: 13, fontWeight: "600" },
  accountSaveButton: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  accountSaveText: { color: C.primary, fontSize: 13, fontWeight: "700" },
  accountButtonDisabled: { opacity: 0.6 },
  specialtyOptions: { maxHeight: 430 },
  specialtyOption: { minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  specialtyOptionSelected: { backgroundColor: "rgba(201,168,76,.1)", borderRadius: 10 },
  specialtyOptionText: { color: C.text, fontSize: 14, textAlign: "right" },
  specialtyOptionTextSelected: { color: C.accent, fontWeight: "700" },
});
