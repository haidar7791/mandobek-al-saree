import React, { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Alert,
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { updateProfile } from "firebase/auth";
import {
  ALL_SPECIALTIES,
  addFoodItem,
  addReview,
  deleteFoodItem,
  fetchFoodItems,
  followArtisan,
  getCategoryForSpecialty,
  getIsFollowing,
  getProfileEngagementCounts,
  getReviews,
  getUserProfile,
  setUserProfile,
  unfollowArtisan,
  updateFoodItem,
  uploadProfilePhoto,
  uploadProfilePostMedia,
  type FoodItem,
  type UserProfile,
} from "../../lib/db_logic";
import Colors from "@/constants/colors";
import { auth } from "../../lib/firebase";
import {
  addToCart,
  getCart,
  getCartRestaurantId,
  getCartTotal,
} from "../../lib/food_cart";
import RestaurantDishEditorModal, {
  type RestaurantDishDraft,
} from "@/components/RestaurantDishEditorModal";
import { performSignOut } from "@/lib/push_notifications";

const C = Colors.light;

const openRestaurantLocation = async (location?: UserProfile["location"]) => {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    Alert.alert("موقع المطعم غير محدد", "لم يقم صاحب المطعم بتثبيت موقعه على الخريطة بعد.");
    return;
  }

  const url = `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;

  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("تعذر فتح الخريطة", "تأكد من توفر خرائط Google على جهازك.");
  }
};

type Category =
  | "main"
  | "appetizer"
  | "drink"
  | "dessert";

const CATEGORY_LABELS: Record<Category, string> = {
  main: "المأكولات",
  appetizer: "المقبلات",
  drink: "المشروبات",
  dessert: "الحلويات",
};

const CATEGORY_ICONS: Record<Category, keyof typeof Ionicons.glyphMap> = {
  main: "fast-food-outline",
  appetizer: "leaf-outline",
  drink: "cafe-outline",
  dessert: "ice-cream-outline",
};

type OwnerConfirmation =
  | { kind: "logout" }
  | { kind: "deleteMeal"; item: FoodItem };

export default function RestaurantScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const heroHeight = Math.min(310, Math.max(230, windowWidth * 0.72));
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingSaving, setRatingSaving] = useState(false);

  const openRatingModal = () => {
    setSelectedRating(0);
    setRatingModalVisible(true);
  };

  const submitRating = async () => {
    console.log("[RATING] submitRating بدأ", {
      selectedRating,
      ratingSaving,
      restaurantId,
    });

    if (ratingSaving) {
      return;
    }

    if (!selectedRating) {
      Alert.alert("تنبيه", "اختر عدد النجوم أولاً.");
      return;
    }

    if (!restaurantId) {
      Alert.alert("خطأ", "لم يتم تحديد المطعم بشكل صحيح.");
      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser?.uid) {
      Alert.alert("تنبيه", "يجب تسجيل الدخول أولاً لإضافة تقييم.");
      return;
    }

    try {
      setRatingSaving(true);

      const clientId = currentUser.uid;
      const clientName = currentUser.displayName || "مستخدم فورس";
      const ratingValue = Number(selectedRating);
      const targetRestaurantId = String(restaurantId);

      console.log("[RATING] بدء حفظ التقييم:", {
        restaurantId: targetRestaurantId,
        clientId,
        ratingValue,
      });

      await addReview({
        artisanId: targetRestaurantId,

        clientId,
        clientName,
        rating: ratingValue,
        comment: "",
      });

      // تحقق فعلي من أن التقييم أصبح موجوداً في Firestore.
      const savedReviews = await getReviews(targetRestaurantId);
      const savedReview = savedReviews.find(
        (review) =>
          review.clientId === clientId &&
          Number(review.rating) === ratingValue
      );

      if (!savedReview) {
        throw new Error("تم تنفيذ الحفظ لكن لم يتم العثور على التقييم بعد الحفظ.");
      }

      console.log("[RATING] تم حفظ التقييم والتحقق منه بنجاح:", savedReview);

      // تحديث بيانات المطعم على الشاشة مباشرة.
      try {
        const refreshedProfile = await getUserProfile(targetRestaurantId);
        if (refreshedProfile) {
          setProfile(refreshedProfile);
        }
      } catch (refreshError) {
        console.warn("[RATING] تعذر تحديث بيانات المطعم على الشاشة:", refreshError);
      }

      setRatingModalVisible(false);
      setSelectedRating(0);

      Alert.alert(
        "تم بنجاح",
        "تم إرسال تقييمك وحفظه بنجاح، وسيظهر عدد التقييمات والتقييم الجديد على المطعم."
      );
    } catch (error) {
      console.error("[RATING] فشل حفظ التقييم:", error);

      Alert.alert(
        "تعذر حفظ التقييم",
        "لم يتم حفظ التقييم. تأكد من اتصال الإنترنت ثم حاول مرة أخرى."
      );
    } finally {
      setRatingSaving(false);
    }
  };

  const [restaurantCartCount, setRestaurantCartCount] = useState(0);
  const [restaurantCartTotal, setRestaurantCartTotal] = useState(0);

  const refreshRestaurantCart = () => {
    setRestaurantCartCount(
      getCart().reduce((sum, item) => sum + item.quantity, 0)
    );
    setRestaurantCartTotal(getCartTotal());
  };

  useFocusEffect(
    useCallback(() => {
      refreshRestaurantCart();
    }, [])
  );


  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const restaurantId = Array.isArray(id) ? id[0] : id;
  const isOwner = Boolean(restaurantId && auth.currentUser?.uid === restaurantId);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [followersCount, setFollowersCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowingViewer, setIsFollowingViewer] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category>("main");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<"coverUri" | "restaurantLogoUri" | null>(null);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [specialtyModalVisible, setSpecialtyModalVisible] = useState(false);
  const [editedSpecialty, setEditedSpecialty] = useState("restaurant");
  const [savingSpecialty, setSavingSpecialty] = useState(false);
  const [dishModalVisible, setDishModalVisible] = useState(false);
  const [editingDish, setEditingDish] = useState<FoodItem | null>(null);
  const [savingDish, setSavingDish] = useState(false);
  const [deletingDishId, setDeletingDishId] = useState<string | null>(null);
  const [ownerConfirmation, setOwnerConfirmation] = useState<OwnerConfirmation | null>(null);
  const [confirmingOwnerAction, setConfirmingOwnerAction] = useState(false);
  const [ownerActionError, setOwnerActionError] = useState("");
  const [pendingCartMeal, setPendingCartMeal] = useState<FoodItem | null>(null);

  const loadRestaurant = useCallback(async () => {
    if (!restaurantId) return;

    try {
      setFollowersCount(0);
      setIsFollowing(false);
      setIsFollowingViewer(false);
      const [restaurant, foods] = await Promise.all([
        getUserProfile(restaurantId),
        fetchFoodItems(),
      ]);

      if (!restaurant || restaurant.specialty !== "restaurant") {
        setProfile(null);
        setItems([]);
        return;
      }
      setProfile(restaurant);
      setItems((foods ?? []).filter((item) => item.userId === restaurantId));

      const viewer = auth.currentUser;
      const followStatePromise: Promise<[boolean, boolean]> =
        viewer && viewer.uid !== restaurantId
          ? Promise.all([
              getIsFollowing(viewer.uid, restaurantId),
              getIsFollowing(restaurantId, viewer.uid),
            ])
          : Promise.resolve([false, false]);
      const [engagement, [viewerFollowsRestaurant, restaurantFollowsViewer]] =
        await Promise.all([
          getProfileEngagementCounts(restaurantId),
          followStatePromise,
        ]);
      setFollowersCount(engagement.followCount);
      setIsFollowing(viewerFollowsRestaurant);
      setIsFollowingViewer(restaurantFollowsViewer);
    } catch (error) {
      console.error("Failed to load restaurant:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId]);

  useFocusEffect(
    useCallback(() => {
      loadRestaurant();
    }, [loadRestaurant])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRestaurant();
  }, [loadRestaurant]);

  const changeRestaurantImage = async (
    field: "coverUri" | "restaurantLogoUri",
  ) => {
    if (!isOwner || !restaurantId || uploadingImage) return;
    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("إذن الصور مطلوب", "اسمح بالوصول إلى الصور لاختيار صورة المطعم.");
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
    setProfile((current) =>
      current ? { ...current, [field]: result.assets[0].uri } : current,
    );
    setUploadingImage(field);
    try {
      const url = await uploadProfilePhoto(restaurantId, result.assets[0].uri);
      await setUserProfile(restaurantId, { [field]: url });
      setProfile((current) => (current ? { ...current, [field]: url } : current));
    } catch (error) {
      console.error(`save restaurant ${field} failed:`, error);
      setProfile(previousProfile);
      Alert.alert("تعذر حفظ الصورة", "لم يتم حفظ الصورة. تحقق من الاتصال ثم حاول مجدداً.");
    } finally {
      setUploadingImage(null);
    }
  };

  const openNameEditor = () => {
    if (!isOwner || !profile) return;
    setEditedName(profile.name || "");
    setNameModalVisible(true);
  };

  const saveRestaurantName = async () => {
    const name = editedName.trim();
    if (!isOwner || !restaurantId || !profile) return;
    if (!name) {
      Alert.alert("الاسم مطلوب", "اكتب اسم المطعم.");
      return;
    }
    setSavingName(true);
    try {
      await setUserProfile(restaurantId, { name });
      if (auth.currentUser?.uid === restaurantId) {
        try {
          await updateProfile(auth.currentUser, { displayName: name });
        } catch (error) {
          console.warn("sync restaurant name to Firebase Auth failed:", error);
        }
      }
      setProfile((current) => (current ? { ...current, name } : current));
      setItems((current) => current.map((item) => ({ ...item, userName: name })));
      setNameModalVisible(false);
    } catch (error) {
      console.error("save restaurant name failed:", error);
      Alert.alert("تعذر حفظ الاسم", "تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSavingName(false);
    }
  };

  const openSpecialtyEditor = () => {
    if (!isOwner || !profile) return;
    setEditedSpecialty(profile.specialty || "restaurant");
    setSpecialtyModalVisible(true);
  };

  const saveSpecialty = async () => {
    if (!isOwner || !restaurantId || !profile) return;
    if (
      editedSpecialty !== "client" &&
      !ALL_SPECIALTIES.some((specialty) => specialty.key === editedSpecialty)
    ) {
      Alert.alert("تخصص غير صالح", "اختر تخصصاً من القائمة.");
      return;
    }
    if (editedSpecialty === profile.specialty) {
      setSpecialtyModalVisible(false);
      return;
    }
    setSavingSpecialty(true);
    try {
      if (editedSpecialty === "client") {
        await setUserProfile(restaurantId, {
          specialty: "client",
          role: "client",
          category: "client" as any,
          isAvailable: false,
        });
        router.replace("/profile" as any);
      } else {
        await setUserProfile(restaurantId, {
          specialty: editedSpecialty,
          role: "artisan",
          category: getCategoryForSpecialty(editedSpecialty),
          isAvailable: true,
        });
        if (editedSpecialty === "store") {
          router.replace({ pathname: "/shop/[id]", params: { id: restaurantId } } as any);
        } else {
          router.replace("/profile" as any);
        }
      }
    } catch (error) {
      console.error("save restaurant specialty failed:", error);
      Alert.alert("تعذر تغيير التخصص", "تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSavingSpecialty(false);
    }
  };

  const toggleRestaurantFollow = async () => {
    const viewer = auth.currentUser;
    if (!viewer) {
      router.push("/" as any);
      return;
    }
    if (!restaurantId || viewer.uid === restaurantId || followLoading) return;
    setFollowLoading(true);
    try {
      if (isFollowing) await unfollowArtisan(viewer.uid, restaurantId);
      else await followArtisan(viewer.uid, restaurantId);
      const [following, engagement] = await Promise.all([
        getIsFollowing(viewer.uid, restaurantId),
        getProfileEngagementCounts(restaurantId),
      ]);
      setIsFollowing(following);
      setFollowersCount(engagement.followCount);
    } catch (error) {
      console.error("toggle restaurant follow failed:", error);
      Alert.alert("تعذر تحديث المتابعة", "تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setFollowLoading(false);
    }
  };

  const openDishEditor = (dish?: FoodItem) => {
    if (!isOwner) return;
    setEditingDish(dish ?? null);
    setDishModalVisible(true);
  };

  const saveDish = async (draft: RestaurantDishDraft) => {
    if (!isOwner || !restaurantId || !profile) return;
    setSavingDish(true);
    try {
      let media = editingDish?.media ?? [];
      if (draft.imageChanged && draft.imageUri) {
        const uploaded = await uploadProfilePostMedia(
          restaurantId,
          draft.imageUri,
          "image",
        );
        media = [{ url: uploaded.url, type: "image" }];
      } else if (!media.length && draft.imageUri) {
        media = [{ url: draft.imageUri, type: "image" }];
      }
      const description = draft.description.trim();
      const data = {
        name: draft.name.trim(),
        price: Number(draft.price),
        description,
        appetizers: description,
        category: draft.category,
        media,
        isPopular: draft.isPopular,
      };
      if (editingDish) {
        if (editingDish.userId !== restaurantId) throw new Error("هذه الوجبة لا تخص هذا المطعم.");
        await updateFoodItem(editingDish.id, data);
        setItems((current) =>
          current.map((item) => item.id === editingDish.id ? { ...item, ...data } : item),
        );
      } else {
        const createdAt = Date.now();
        const id = await addFoodItem({
          userId: restaurantId,
          userName: profile.name || "",
          userPhoto: profile.restaurantLogoUri || profile.photoUri || null,
          ...data,
          likesCount: 0,
          commentsCount: 0,
          createdAt,
        });
        setItems((current) => [
          { id, userId: restaurantId, userName: profile.name || "", userPhoto: profile.restaurantLogoUri || profile.photoUri || null, ...data, likesCount: 0, commentsCount: 0, createdAt },
          ...current,
        ]);
      }
      setDishModalVisible(false);
      setEditingDish(null);
    } catch (error) {
      console.error("save restaurant dish failed:", error);
      Alert.alert("تعذر حفظ الوجبة", "لم يتم حفظ الوجبة. تحقق من الاتصال ثم حاول مرة أخرى.");
    } finally {
      setSavingDish(false);
    }
  };

  const requestDeleteDish = (dish: FoodItem) => {
    if (!isOwner || !restaurantId || dish.userId !== restaurantId || deletingDishId) return;
    setOwnerActionError("");
    setOwnerConfirmation({ kind: "deleteMeal", item: dish });
  };

  const runOwnerConfirmation = async () => {
    const confirmation = ownerConfirmation;
    if (!confirmation || !isOwner || !restaurantId || confirmingOwnerAction) return;
    setConfirmingOwnerAction(true);
    setOwnerActionError("");
    try {
      if (confirmation.kind === "logout") {
        await performSignOut();
        setOwnerConfirmation(null);
        router.replace("/");
        return;
      }
      if (confirmation.item.userId !== restaurantId) {
        throw new Error("هذه الوجبة لا تخص هذا المطعم.");
      }
      setDeletingDishId(confirmation.item.id);
      await deleteFoodItem(confirmation.item.id);
      setItems((current) => current.filter((item) => item.id !== confirmation.item.id));
      setOwnerConfirmation(null);
    } catch (error) {
      console.error("restaurant owner action failed:", error);
      setOwnerActionError(
        confirmation.kind === "logout"
          ? "تعذر تسجيل الخروج. حاول مرة أخرى."
          : "تعذر حذف الوجبة. تحقق من الاتصال ثم حاول مرة أخرى.",
      );
    } finally {
      setConfirmingOwnerAction(false);
      setDeletingDishId(null);
    }
  };

  const addMealToCart = (dish: FoodItem) => {
    if (getCartRestaurantId() && getCartRestaurantId() !== dish.userId) {
      setPendingCartMeal(dish);
      return;
    }
    addToCart(dish, 1);
    refreshRestaurantCart();
  };

  const counts = useMemo(() => {
    return {
      main: items.filter((item) => item.category === "main").length,
      appetizer: items.filter((item) => item.category === "appetizer").length,
      drink: items.filter((item) => item.category === "drink").length,
      dessert: items.filter((item) => item.category === "dessert").length,
    };
  }, [items]);

  const visibleItems = useMemo(() => {
    return items.filter((item) => item.category === activeCategory);
  }, [activeCategory, items]);

  const cover =
    profile?.coverUri ||
    profile?.photoUri ||
    items[0]?.media?.find((x) => x.type === "image")?.url ||
    null;

  const logo = profile?.restaurantLogoUri || profile?.photoUri || null;

  if (loading) {
    return (
      <View style={S.loading}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={S.loadingText}>جاري تحميل المطعم...</Text>
      </View>
    );
  }

  if (!restaurantId || !profile) {
    return (
      <View style={S.emptyScreen}>
        <Ionicons name="restaurant-outline" size={58} color="#aaa" />
        <Text style={S.emptyTitle}>المطعم غير متوفر</Text>
        <Pressable style={S.backButton} onPress={() => router.back()}>
          <Text style={S.backButtonText}>العودة</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <View style={S.screen}>
      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={S.mealColumns}
        contentContainerStyle={{
          paddingBottom: insets.bottom + (restaurantCartCount > 0 && !isOwner ? 100 : 28),
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
          />
        }
        renderItem={({ item }) => (
          <View style={S.mealCard}>
            <Pressable
              onPress={() => {
                if (isOwner) openDishEditor(item);
                else router.push(`/restaurant/dish?id=${item.id}` as any);
              }}
              accessibilityRole="button"
              accessibilityLabel={isOwner ? `تعديل ${item.name}` : `عرض الوجبة ${item.name}`}
            >
              {item.media?.[0]?.url ? (
                <Image source={{ uri: item.media[0].url }} style={S.mealImage} resizeMode="cover" />
              ) : (
                <View style={[S.mealImage, S.mealImageFallback]}>
                  <Ionicons name="restaurant-outline" size={30} color={C.accent} />
                </View>
              )}
              {item.isPopular ? (
                <View style={S.popularBadge}>
                  <Ionicons name="star" size={11} color="#fff" />
                  <Text style={S.popularBadgeText}>الأكثر طلباً</Text>
                </View>
              ) : null}
            </Pressable>
            <View style={S.mealBody}>
              <Text style={S.mealName} numberOfLines={2}>{item.name}</Text>
              {!!(item.description || item.appetizers) ? (
                <Text style={S.mealDescription} numberOfLines={2}>
                  {item.description || item.appetizers}
                </Text>
              ) : null}
              <Text style={S.mealPrice}>
                {Number(item.price || 0).toLocaleString("ar-IQ-u-nu-latn")} د.ع
              </Text>
              {isOwner ? (
                <View style={S.mealOwnerActions}>
                  <Pressable
                    style={S.mealEditButton}
                    onPress={() => openDishEditor(item)}
                    disabled={deletingDishId === item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`تعديل ${item.name}`}
                  >
                    <Feather name="edit-2" size={13} color={C.primary} />
                    <Text style={S.mealActionText}>تعديل</Text>
                  </Pressable>
                  <Pressable
                    style={S.mealDeleteButton}
                    onPress={() => requestDeleteDish(item)}
                    disabled={deletingDishId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`حذف ${item.name}`}
                  >
                    {deletingDishId === item.id
                      ? <ActivityIndicator size="small" color="#B42318" />
                      : <Feather name="trash-2" size={13} color="#B42318" />}
                    <Text style={[S.mealActionText, S.mealDeleteText]}>حذف</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={S.mealAddButton}
                  onPress={() => addMealToCart(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`إضافة ${item.name} إلى السلة`}
                >
                  <Ionicons name="cart-outline" size={15} color={C.primary} />
                  <Text style={S.mealAddButtonText}>أضف للسلة</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={S.empty}>
            <View style={S.emptyIcon}>
              <Ionicons name="restaurant-outline" size={28} color={C.accent} />
            </View>
            <Text style={S.emptyTitle}>
              {items.length ? "لا توجد وجبات في هذا القسم" : "لا توجد وجبات منشورة بعد"}
            </Text>
            <Text style={S.emptyText}>
              {isOwner ? "أضف وجبتك الأولى لتظهر هنا للزبائن." : "ستظهر الوجبات هنا عند إضافتها من المطعم."}
            </Text>
            {isOwner ? (
              <Pressable style={S.emptyAddButton} onPress={() => openDishEditor()}>
                <Feather name="plus" size={16} color={C.primary} />
                <Text style={S.emptyAddButtonText}>إضافة وجبة</Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListHeaderComponent={
          <>
            <View style={[S.hero, { height: heroHeight }]}>
              {cover ? (
                <Image
                  source={{ uri: cover }}
                  style={S.heroImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={S.heroPlaceholder}>
                  <Ionicons
                    name="restaurant-outline"
                    size={72}
                    color="rgba(255,255,255,0.72)"
                  />
                </View>
              )}

              <View style={S.heroOverlay} />

              {isOwner ? (
                <Pressable
                  style={[S.headerButton, { top: insets.top + 12, right: 14 }]}
                  onPress={() => router.push("/support" as any)}
                  accessibilityRole="button"
                  accessibilityLabel="مراسلة الدعم"
                >
                  <Feather name="headphones" size={19} color={C.accent} />
                </Pressable>
              ) : (
                <Pressable
                  style={[S.headerButton, { top: insets.top + 12, right: 14 }]}
                  onPress={() => router.back()}
                  accessibilityRole="button"
                  accessibilityLabel="رجوع"
                >
                  <Feather name="arrow-right" size={20} color="#FFF" />
                </Pressable>
              )}

              {isOwner ? (
                <Pressable
                  style={[S.headerButton, S.logoutHeaderButton, { top: insets.top + 12, left: 14 }]}
                  onPress={() => {
                    setOwnerActionError("");
                    setOwnerConfirmation({ kind: "logout" });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="تسجيل الخروج"
                >
                  <Feather name="log-out" size={19} color="#FFF" />
                </Pressable>
              ) : (
                <Pressable
                  style={[S.headerButton, { top: insets.top + 12, left: 14 }]}
                  onPress={() => router.push("/restaurant/cart" as any)}
                  accessibilityRole="button"
                  accessibilityLabel="سلة المطعم"
                >
                  <Ionicons name="cart-outline" size={20} color="#FFF" />
                  {restaurantCartCount > 0 ? (
                    <View style={S.cartBadge}>
                      <Text style={S.cartBadgeText}>{restaurantCartCount}</Text>
                    </View>
                  ) : null}
                </Pressable>
              )}

              {isOwner ? (
                <Pressable
                  style={[S.coverEditButton, { top: insets.top + 62, left: 14 }]}
                  onPress={() => void changeRestaurantImage("coverUri")}
                  disabled={uploadingImage !== null}
                  accessibilityRole="button"
                  accessibilityLabel="تغيير غلاف المطعم"
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

              <View style={S.heroContent}>
                <View style={S.logoWrap}>
                  {logo ? (
                    <Image
                      source={{ uri: logo }}
                      style={S.logo}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={S.logoPlaceholder}>
                      <Ionicons
                        name="restaurant-outline"
                        size={30}
                        color={C.accent}
                      />
                    </View>
                  )}
                  {isOwner ? (
                    <Pressable
                      style={S.logoEditButton}
                      onPress={() => void changeRestaurantImage("restaurantLogoUri")}
                      disabled={uploadingImage !== null}
                      accessibilityRole="button"
                      accessibilityLabel="تغيير شعار المطعم"
                    >
                      {uploadingImage === "restaurantLogoUri" ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Feather name="camera" size={12} color="#FFF" />
                      )}
                    </Pressable>
                  ) : null}
                </View>

                <View style={S.heroText}>
                  <View style={S.nameRow}>
                    <Text style={S.name} numberOfLines={1}>
                      {profile.name || "المطعم"}
                    </Text>
                    {isOwner ? (
                      <Pressable
                        style={S.nameEditButton}
                        onPress={openNameEditor}
                        accessibilityRole="button"
                        accessibilityLabel="تغيير اسم المطعم"
                      >
                        <Feather name="edit-3" size={15} color={C.accent} />
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={S.specialtyRow}>
                    <View style={S.specialtyPill}>
                      <Ionicons name="restaurant-outline" size={12} color="#FFF" />
                      <Text style={S.specialtyPillText}>مطعم</Text>
                    </View>
                    {isOwner ? (
                      <Pressable
                        style={S.changeSpecialtyButton}
                        onPress={openSpecialtyEditor}
                        accessibilityRole="button"
                        accessibilityLabel="تغيير التخصص"
                      >
                        <Feather name="edit-2" size={11} color="#FFF" />
                        <Text style={S.changeSpecialtyText}>تغيير التخصص</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {!!profile.restaurantCategory?.trim() ? (
                    <Text style={S.cuisine} numberOfLines={1}>
                      {profile.restaurantCategory.trim()}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>

            {isOwner ? (
              <View style={S.ownerActions}>
                <Pressable
                  style={S.ownerPrimaryAction}
                  onPress={() => openDishEditor()}
                  accessibilityRole="button"
                  accessibilityLabel="إضافة وجبة"
                >
                  <Feather name="plus" size={17} color={C.primary} />
                  <Text style={S.ownerPrimaryText}>إضافة وجبة</Text>
                </Pressable>
                <Pressable
                  style={S.ownerSecondaryAction}
                  onPress={() =>
                    router.push({ pathname: "/reservations", params: { tab: "myProducts" } } as any)
                  }
                  accessibilityRole="button"
                  accessibilityLabel="طلبات المطعم"
                >
                  <Feather name="clipboard" size={16} color={C.accent} />
                  <Text style={S.ownerSecondaryText}>طلبات المطعم</Text>
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
              <View style={S.engagementColumn}>
                <View style={S.ratingButtonRow}>
                  <Ionicons name="star" size={19} color="#F5C842" />
                  <Text style={S.infoValue}>
                    {profile.rating && profile.rating > 0 ? profile.rating.toFixed(1) : "جديد"}
                  </Text>
                  <Text style={S.reviewCountText}>
                    ({profile.reviewCount || 0} تقييم)
                  </Text>
                </View>
                {!isOwner ? (
                  <Pressable
                    style={S.engagementButton}
                    onPress={openRatingModal}
                    accessibilityRole="button"
                    accessibilityLabel="تقييم المطعم"
                  >
                    <Text style={S.engagementButtonText}>تقييم</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={S.engagementDivider} />
              <View style={S.engagementColumn}>
                <View style={S.followersSummary}>
                  <Feather name="users" size={15} color={C.accent} />
                  <Text style={S.infoValue}>
                    {followersCount.toLocaleString("ar-IQ-u-nu-latn")}
                  </Text>
                  <Text style={S.reviewCountText}>متابع</Text>
                </View>
                {!isOwner ? (
                  <Pressable
                    style={[S.engagementButton, isFollowing && S.followingButton]}
                    onPress={() => void toggleRestaurantFollow()}
                    disabled={followLoading}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isFollowing ? "إلغاء المتابعة" : isFollowingViewer ? "رد المتابعة" : "متابعة"
                    }
                  >
                    {followLoading ? (
                      <ActivityIndicator size="small" color={isFollowing ? C.accent : "#FFF"} />
                    ) : (
                      <>
                        <Feather
                          name={isFollowing ? "user-check" : "user-plus"}
                          size={14}
                          color={isFollowing ? C.accent : "#FFF"}
                        />
                        <Text style={[S.engagementButtonText, isFollowing && S.followingButtonText]}>
                          {isFollowing ? "إلغاء المتابعة" : isFollowingViewer ? "رد المتابعة" : "متابعة"}
                        </Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={S.restaurantQuickInfo}>
              <View style={S.restaurantAvailability}>
                <View
                  style={[
                    S.statusDot,
                    profile.isAvailable === false ? S.statusClosed : S.statusOpen,
                  ]}
                />
                <Text
                  style={[
                    S.availabilityText,
                    profile.isAvailable === false ? S.closedText : S.openText,
                  ]}
                >
                  {profile.isAvailable === false ? "مغلق" : "مفتوح"}
                </Text>
              </View>
              <Pressable
                style={S.locationButton}
                onPress={() => void openRestaurantLocation(profile.location)}
                accessibilityRole="button"
                accessibilityLabel="موقع المطعم على الخريطة"
              >
                <Ionicons name="location-outline" size={15} color={C.accent} />
                <Text style={S.locationButtonText}>الموقع</Text>
              </Pressable>
              {isOwner ? (
                <Pressable
                  style={S.locationButton}
                  onPress={() => router.push("/restaurant-manager" as any)}
                  accessibilityRole="button"
                  accessibilityLabel="تعديل بيانات المطعم"
                >
                  <Feather name="settings" size={14} color={C.accent} />
                  <Text style={S.locationButtonText}>بيانات المطعم</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={S.menuHeader}>
              <View style={S.menuTitleBox}>
                <Text style={S.menuTitle}>قائمة المطعم</Text>
                <Text style={S.menuSubtitle}>{items.length} وجبة متاحة</Text>
              </View>

              <View style={S.menuHeaderActions}>
                {isOwner ? (
                  <Pressable
                    style={S.addMealButton}
                    onPress={() => openDishEditor()}
                    accessibilityRole="button"
                    accessibilityLabel="إضافة وجبة"
                  >
                    <Feather name="plus" size={15} color={C.primary} />
                    <Text style={S.addMealButtonText}>إضافة وجبة</Text>
                  </Pressable>
                ) : null}
                <View style={S.menuIcon}>
                  <Ionicons name="restaurant" size={22} color={C.accent} />
                </View>
              </View>
            </View>

            <FlatList
              horizontal
              inverted
              data={[
                "main",
                "appetizer",
                "drink",
                "dessert",
              ] as Category[]}
              keyExtractor={(item) => item}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={S.tabs}
              renderItem={({ item: category }) => {
                const active =
                  activeCategory === category;

                return (
                  <Pressable
                    onPress={() =>
                      setActiveCategory(category)
                    }
                    style={[
                      S.tab,
                      active && S.tabActive,
                    ]}
                  >
                    <Ionicons
                      name={CATEGORY_ICONS[category]}
                      size={16}
                      color={
                        active
                          ? "#fff"
                          : C.textMuted
                      }
                    />

                    <Text
                      style={[
                        S.tabText,
                        active && S.tabTextActive,
                      ]}
                    >
                      {CATEGORY_LABELS[category]}
                    </Text>

                    <View
                      style={[
                        S.count,
                        active && S.countActive,
                      ]}
                    >
                      <Text
                        style={[
                          S.countText,
                          active &&
                            S.countTextActive,
                        ]}
                      >
                        {counts[category]}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />

            <View style={S.sectionHeading}>
              <View>
                <Text style={S.heading}>
                  {CATEGORY_LABELS[activeCategory]}
                </Text>

                <Text style={S.headingCount}>
                  {visibleItems.length} عنصر
                </Text>
              </View>

              <Ionicons
                name={CATEGORY_ICONS[activeCategory]}
                size={22}
                color={C.accent}
              />
            </View>
          </>
        }
      />
    
      {restaurantCartCount > 0 && (
        <Pressable
          style={[S.restaurantCartBar, { bottom: insets.bottom + 12 }]}
          onPress={() => router.push("/restaurant/cart" as any)}
        >
          <View style={S.restaurantCartIcon}>
            <Ionicons name="cart" size={22} color="#fff" />
            <Text style={S.restaurantCartBadge}>
              {restaurantCartCount}
            </Text>
          </View>

          <Text style={S.restaurantCartText}>
            عرض السلة · {restaurantCartTotal.toLocaleString()} د.ع
          </Text>

          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
      )}

</View>
      <Modal
        visible={ratingModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <View style={S.ratingModalOverlay}>
          <View style={S.ratingModalCard}>
            <Text style={S.ratingModalTitle}>
              قيّم المطعم
            </Text>

            <Text style={S.ratingModalHint}>
              اختر عدد النجوم التي يستحقها المطعم
            </Text>

            <View style={S.ratingStarsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable
                  key={star}
                  onPress={() => setSelectedRating(star)}
                  hitSlop={8}
                  style={S.ratingStarButton}
                >
                  <Ionicons
                    name={
                      star <= selectedRating
                        ? "star"
                        : "star-outline"
                    }
                    size={38}
                    color="#F5C842"
                  />
                </Pressable>
              ))}
            </View>

            <Text style={S.selectedRatingText}>
              {selectedRating
                ? `${selectedRating} من 5`
                : "لم يتم اختيار تقييم"}
            </Text>

            <View style={S.ratingModalActions}>
              <Pressable
                style={S.ratingCancelButton}
                onPress={() => setRatingModalVisible(false)}
              >
                <Text style={S.ratingCancelText}>
                  إلغاء
                </Text>
              </Pressable>

              <Pressable
                style={[
                  S.ratingSubmitButton,
                  ratingSaving && S.ratingSubmitDisabled,
                ]}
                disabled={ratingSaving}
                onPress={() => {
                  console.log("[RATING] تم الضغط على زر إرسال التقييم", {
                    selectedRating,
                    ratingSaving,
                    restaurantId,
                  });

                  if (!selectedRating) {
                    Alert.alert("تنبيه", "اختر عدد النجوم أولاً.");
                    return;
                  }

                  submitRating();
                }}
              >
                <Text style={S.ratingSubmitText}>
                  {ratingSaving ? "جارٍ الحفظ..." : "إرسال التقييم"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <RestaurantDishEditorModal
        visible={dishModalVisible}
        initialDish={editingDish}
        saving={savingDish}
        onClose={() => {
          if (!savingDish) {
            setDishModalVisible(false);
            setEditingDish(null);
          }
        }}
        onSave={(draft) => void saveDish(draft)}
      />

      <Modal
        visible={nameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !savingName && setNameModalVisible(false)}
      >
        <View style={S.modalOverlay}>
          <View style={S.editorModal}>
            <Text style={S.editorTitle}>تعديل اسم المطعم</Text>
            <TextInput
              value={editedName}
              onChangeText={setEditedName}
              placeholder="اسم المطعم"
              placeholderTextColor={C.textMuted}
              style={S.editorInput}
              textAlign="right"
              maxLength={60}
              autoFocus
            />
            <View style={S.editorActions}>
              <Pressable
                style={S.editorCancelButton}
                onPress={() => setNameModalVisible(false)}
                disabled={savingName}
              >
                <Text style={S.editorCancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                style={S.editorSaveButton}
                onPress={() => void saveRestaurantName()}
                disabled={savingName}
              >
                {savingName ? <ActivityIndicator size="small" color="#FFF" /> : null}
                <Text style={S.editorSaveText}>حفظ</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={specialtyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !savingSpecialty && setSpecialtyModalVisible(false)}
      >
        <View style={S.modalOverlay}>
          <View style={S.specialtyModal}>
            <Text style={S.editorTitle}>تغيير التخصص</Text>
            <FlatList
              data={[{ key: "client", label: "مستخدم" }, ...ALL_SPECIALTIES]}
              keyExtractor={(item) => item.key}
              style={S.specialtyOptionsList}
              renderItem={({ item }) => {
                const selected = editedSpecialty === item.key;
                return (
                  <Pressable
                    style={[S.specialtyOption, selected && S.specialtyOptionSelected]}
                    onPress={() => setEditedSpecialty(item.key)}
                  >
                    <Text style={[S.specialtyOptionText, selected && S.specialtyOptionTextSelected]}>
                      {item.label}
                    </Text>
                    {selected ? <Ionicons name="checkmark-circle" size={19} color={C.primary} /> : null}
                  </Pressable>
                );
              }}
            />
            <View style={S.editorActions}>
              <Pressable
                style={S.editorCancelButton}
                onPress={() => setSpecialtyModalVisible(false)}
                disabled={savingSpecialty}
              >
                <Text style={S.editorCancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                style={S.editorSaveButton}
                onPress={() => void saveSpecialty()}
                disabled={savingSpecialty}
              >
                {savingSpecialty ? <ActivityIndicator size="small" color="#FFF" /> : null}
                <Text style={S.editorSaveText}>حفظ</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={ownerConfirmation !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !confirmingOwnerAction && setOwnerConfirmation(null)}
      >
        <View style={S.modalOverlay}>
          <View style={S.editorModal}>
            <View style={S.confirmIcon}>
              <Feather
                name={ownerConfirmation?.kind === "logout" ? "log-out" : "trash-2"}
                size={22}
                color={ownerConfirmation?.kind === "logout" ? C.accent : "#B42318"}
              />
            </View>
            <Text style={S.editorTitle}>
              {ownerConfirmation?.kind === "logout" ? "تسجيل الخروج؟" : "حذف الوجبة؟"}
            </Text>
            <Text style={S.confirmDescription}>
              {ownerConfirmation?.kind === "logout"
                ? "هل تريد تسجيل الخروج من حسابك؟"
                : `سيتم حذف «${ownerConfirmation?.kind === "deleteMeal" ? ownerConfirmation.item.name : ""}» نهائياً.`}
            </Text>
            {!!ownerActionError ? <Text style={S.confirmError}>{ownerActionError}</Text> : null}
            <View style={S.editorActions}>
              <Pressable
                style={S.editorCancelButton}
                onPress={() => setOwnerConfirmation(null)}
                disabled={confirmingOwnerAction}
              >
                <Text style={S.editorCancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                style={[
                  S.confirmDeleteButton,
                  ownerConfirmation?.kind === "logout" && S.confirmLogoutButton,
                ]}
                onPress={() => void runOwnerConfirmation()}
                disabled={confirmingOwnerAction}
              >
                {confirmingOwnerAction ? <ActivityIndicator size="small" color="#FFF" /> : null}
                <Text style={S.editorSaveText}>
                  {ownerConfirmation?.kind === "logout" ? "تسجيل الخروج" : "حذف"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={pendingCartMeal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingCartMeal(null)}
      >
        <View style={S.modalOverlay}>
          <View style={S.editorModal}>
            <View style={S.confirmIcon}>
              <Ionicons name="cart-outline" size={23} color={C.accent} />
            </View>
            <Text style={S.editorTitle}>السلة مرتبطة بمطعم آخر</Text>
            <Text style={S.confirmDescription}>
              اعرض السلة الحالية أولاً، ثم يمكنك إكمال الطلب أو تفريغها قبل إضافة وجبة من {profile.name}.
            </Text>
            <View style={S.editorActions}>
              <Pressable style={S.editorCancelButton} onPress={() => setPendingCartMeal(null)}>
                <Text style={S.editorCancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                style={S.editorSaveButton}
                onPress={() => {
                  setPendingCartMeal(null);
                  router.push("/restaurant/cart" as any);
                }}
              >
                <Text style={S.editorSaveText}>عرض السلة</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>

  );
}

const S = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },

  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: C.background,
  },

  loadingText: {
    color: C.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },

  emptyScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: C.background,
  },

  emptyTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: "900",
  },

  backButton: {
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 13,
    backgroundColor: C.primary,
  },

  backButtonText: {
    color: "#fff",
    fontWeight: "900",
  },

  hero: {
    height: 310,
    position: "relative",
    backgroundColor: C.primary,
  },

  heroImage: {
    width: "100%",
    height: "100%",
  },

  heroPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.primary,
  },

  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,10,25,0.48)",
  },

  back: {
    position: "absolute",
    top: 48,
    right: 15,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.48)",
    alignItems: "center",
    justifyContent: "center",
  },

  heroContent: {
    position: "absolute",
    left: 17,
    right: 17,
    bottom: 22,
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    gap: 12,
  },

  logoWrap: {
    width: 76,
    height: 76,
    borderRadius: 22,
    padding: 3,
    backgroundColor: "#fff",
    elevation: 6,
  },

  logo: {
    width: "100%",
    height: "100%",
    borderRadius: 19,
  },

  logoPlaceholder: {
    flex: 1,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F0E5",
  },

  heroText: {
    flex: 1,
    alignItems: "flex-end",
  },

  name: {
    flexShrink: 1,
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "right",
  },

  cuisine: {
    flexShrink: 1,
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
    textAlign: "right",
  },

  address: {
    flexShrink: 1,
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 3,
    textAlign: "right",
  },

  infoCard: {
    marginHorizontal: 14,
    marginTop: -1,
    minHeight: 82,
    borderRadius: 18,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
  },

  infoItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },

  ratingButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },

  reviewCountText: {
    fontSize: 10,
    color: C.textMuted,
  },

  ratingModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  ratingModalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
  },

  ratingModalTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: C.text,
    marginBottom: 7,
  },

  ratingModalHint: {
    fontSize: 12,
    color: C.textMuted,
    textAlign: "center",
    marginBottom: 18,
  },

  ratingStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  ratingStarButton: {
    padding: 2,
  },

  selectedRatingText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "700",
    color: C.text,
  },

  ratingModalActions: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
  },

  ratingCancelButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.inputBg,
  },

  ratingCancelText: {
    fontSize: 13,
    fontWeight: "700",
    color: C.textMuted,
  },

  ratingSubmitButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
  },

  ratingSubmitDisabled: {
    opacity: 0.45,
  },

  ratingSubmitText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  infoValue: {
    color: C.text,
    fontSize: 12,
    fontWeight: "900",
  },

  infoLabel: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: "700",
  },

  infoDivider: {
    width: 1,
    height: 42,
    backgroundColor: C.border,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  statusOpen: {
    backgroundColor: "#20B56B",
  },

  statusClosed: {
    backgroundColor: "#E34E55",
  },

  openText: {
    color: "#15945A",
  },

  closedText: {
    color: "#D63D4B",
  },

  menuHeader: {
    marginHorizontal: 16,
    marginTop: 22,
    marginBottom: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },

  menuTitleBox: {
    alignItems: "flex-end",
  },

  menuTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "right",
  },

  menuSubtitle: {
    color: C.textMuted,
    fontSize: 11,
    marginTop: 3,
    textAlign: "right",
  },

  menuIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "rgba(201,168,76,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },

  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },

  tab: {
    minHeight: 42,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 13,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },

  tabActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },

  tabText: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "800",
  },

  tabTextActive: {
    color: "#fff",
    fontWeight: "900",
  },

  count: {
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.background,
  },

  countActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },

  countText: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: "900",
  },

  countTextActive: {
    color: "#fff",
  },

  sectionHeading: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
    paddingTop: 4,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },

  heading: {
    color: C.text,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "right",
  },

  headingCount: {
    color: C.textMuted,
    fontSize: 10,
    marginTop: 3,
    textAlign: "right",
  },

  dish: {
    marginHorizontal: 13,
    marginBottom: 11,
    minHeight: 110,
    padding: 9,
    borderRadius: 17,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 9,
  },

  dishPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },

  dishImage: {
    width: 94,
    height: 94,
    borderRadius: 14,
    backgroundColor: C.background,
  },

  dishPlaceholder: {
    width: 94,
    height: 94,
    borderRadius: 14,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
  },

  dishInfo: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },

  dishName: {
    width: "100%",
    color: C.text,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "right",
  },

  description: {
    width: "100%",
    color: C.textMuted,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 4,
    textAlign: "right",
  },

  price: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 6,
    textAlign: "right",
  },

  dishArrow: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.background,
  },

  empty: {
    marginHorizontal: 15,
    marginTop: 10,
    minHeight: 230,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
    gap: 8,
  },

  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: "rgba(201,168,76,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },

  emptyText: {
    color: C.textMuted,
    fontSize: 11,
    textAlign: "center",
  },

  restaurantCartBar:{
    position:"absolute",
    left:14,
    right:14,
    bottom:31,
    minHeight:58,
    borderRadius:18,
    backgroundColor:"#111",
    flexDirection:"row-reverse",
    alignItems:"center",
    paddingHorizontal:16,
    elevation:8,
    shadowOpacity:0.2,
    shadowRadius:8,
    shadowOffset:{width:0,height:4},
  },
  restaurantCartIcon:{
    width:38,
    height:38,
    borderRadius:12,
    backgroundColor:"#f39c12",
    alignItems:"center",
    justifyContent:"center",
    marginLeft:10,
  },
  restaurantCartBadge:{
    position:"absolute",
    top:-5,
    right:-5,
    minWidth:18,
    height:18,
    borderRadius:9,
    backgroundColor:"#e74c3c",
    color:"#fff",
    fontSize:10,
    fontWeight:"900",
    textAlign:"center",
    paddingTop:2,
  },
  restaurantCartText:{
    flex:1,
    color:"#fff",
    fontSize:14,
    fontWeight:"900",
    textAlign:"right",
  },

  headerButton: {
    position: "absolute",
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  logoutHeaderButton: {
    backgroundColor: "rgba(180,35,24,0.8)",
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: "#E5484D",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "900",
  },
  coverEditButton: {
    position: "absolute",
    zIndex: 5,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  coverEditText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "800",
  },
  logoEditButton: {
    position: "absolute",
    left: -3,
    bottom: -3,
    width: 27,
    height: 27,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: C.card,
  },
  nameRow: {
    width: "100%",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 5,
  },
  nameEditButton: {
    width: 25,
    height: 25,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  specialtyRow: {
    width: "100%",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    marginTop: 6,
  },
  specialtyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    height: 23,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  specialtyPillText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "800",
  },
  changeSpecialtyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 23,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  changeSpecialtyText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "800",
  },
  ownerActions: {
    marginHorizontal: 14,
    marginTop: 13,
    flexDirection: "row-reverse",
    gap: 9,
  },
  ownerPrimaryAction: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: C.accent,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  ownerPrimaryText: {
    color: C.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  ownerSecondaryAction: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  ownerSecondaryText: {
    color: C.text,
    fontSize: 12,
    fontWeight: "800",
  },
  ownerAccountActions: {
    marginHorizontal: 14,
    marginTop: 9,
    flexDirection: "row-reverse",
    gap: 8,
  },
  ownerAccountAction: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  ownerPromoteAction: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  ownerPromoteText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "900",
  },
  ownerAccountActionText: {
    color: C.text,
    fontSize: 11,
    fontWeight: "800",
  },
  ratingCard: {
    marginHorizontal: 14,
    marginTop: 12,
    minHeight: 99,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row-reverse",
    alignItems: "center",
  },
  engagementColumn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  engagementDivider: {
    width: 1,
    height: 56,
    backgroundColor: C.border,
  },
  followersSummary: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  engagementButton: {
    minWidth: 96,
    minHeight: 31,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: C.primary,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  engagementButtonText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "900",
  },
  followingButton: {
    backgroundColor: "rgba(201,168,76,0.12)",
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.45)",
  },
  followingButtonText: {
    color: C.accent,
  },
  restaurantQuickInfo: {
    marginHorizontal: 14,
    marginTop: 8,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  restaurantAvailability: {
    minHeight: 30,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  availabilityText: {
    fontSize: 11,
    fontWeight: "800",
  },
  locationButton: {
    minHeight: 30,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  locationButtonText: {
    color: C.accent,
    fontSize: 11,
    fontWeight: "800",
  },
  menuHeaderActions: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 9,
  },
  addMealButton: {
    minHeight: 36,
    paddingHorizontal: 11,
    borderRadius: 11,
    backgroundColor: C.accent,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  addMealButtonText: {
    color: C.primary,
    fontSize: 10,
    fontWeight: "900",
  },
  mealColumns: {
    marginHorizontal: 13,
    justifyContent: "space-between",
    gap: 9,
  },
  mealCard: {
    flex: 1,
    maxWidth: "49%",
    marginBottom: 11,
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  mealImage: {
    width: "100%",
    height: 125,
    backgroundColor: C.background,
  },
  mealImageFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  popularBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    height: 23,
    borderRadius: 8,
    backgroundColor: "rgba(26,26,26,0.78)",
  },
  popularBadgeText: {
    color: "#FFF",
    fontSize: 8,
    fontWeight: "800",
  },
  mealBody: {
    padding: 10,
    alignItems: "flex-end",
  },
  mealName: {
    width: "100%",
    minHeight: 36,
    color: C.text,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "900",
    textAlign: "right",
  },
  mealDescription: {
    width: "100%",
    minHeight: 30,
    marginTop: 3,
    color: C.textMuted,
    fontSize: 9,
    lineHeight: 14,
    textAlign: "right",
  },
  mealPrice: {
    width: "100%",
    marginTop: 7,
    marginBottom: 8,
    color: C.accent,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right",
  },
  mealOwnerActions: {
    width: "100%",
    flexDirection: "row-reverse",
    gap: 6,
  },
  mealEditButton: {
    flex: 1,
    minHeight: 31,
    borderRadius: 9,
    backgroundColor: "rgba(201,168,76,0.12)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row-reverse",
    gap: 4,
  },
  mealDeleteButton: {
    flex: 1,
    minHeight: 31,
    borderRadius: 9,
    backgroundColor: "rgba(180,35,24,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row-reverse",
    gap: 4,
  },
  mealActionText: {
    color: C.primary,
    fontSize: 9,
    fontWeight: "900",
  },
  mealDeleteText: {
    color: "#B42318",
  },
  mealAddButton: {
    width: "100%",
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: "rgba(201,168,76,0.14)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row-reverse",
    gap: 6,
  },
  mealAddButtonText: {
    color: C.primary,
    fontSize: 10,
    fontWeight: "900",
  },
  emptyAddButton: {
    marginTop: 7,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: C.accent,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  emptyAddButtonText: {
    color: C.primary,
    fontSize: 11,
    fontWeight: "900",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.52)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 22,
  },
  editorModal: {
    width: "100%",
    maxWidth: 420,
    padding: 20,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "stretch",
  },
  editorTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "right",
    marginBottom: 13,
  },
  editorInput: {
    minHeight: 48,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.background,
    color: C.text,
    fontSize: 14,
  },
  editorActions: {
    flexDirection: "row-reverse",
    gap: 9,
    marginTop: 17,
  },
  editorCancelButton: {
    flex: 1,
    minHeight: 43,
    borderRadius: 12,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  editorCancelText: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  editorSaveButton: {
    flex: 1,
    minHeight: 43,
    borderRadius: 12,
    backgroundColor: C.primary,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  editorSaveText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "900",
  },
  specialtyModal: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "80%",
    padding: 18,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  specialtyOptionsList: {
    maxHeight: 410,
  },
  specialtyOption: {
    minHeight: 45,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  specialtyOptionSelected: {
    backgroundColor: "rgba(201,168,76,0.1)",
  },
  specialtyOptionText: {
    color: C.text,
    fontSize: 12,
    fontWeight: "700",
  },
  specialtyOptionTextSelected: {
    color: C.primary,
    fontWeight: "900",
  },
  confirmIcon: {
    width: 50,
    height: 50,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: "rgba(201,168,76,0.12)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  confirmDescription: {
    color: C.textMuted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: "right",
  },
  confirmError: {
    marginTop: 10,
    color: "#B42318",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
  },
  confirmDeleteButton: {
    flex: 1,
    minHeight: 43,
    borderRadius: 12,
    backgroundColor: "#B42318",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  confirmLogoutButton: {
    backgroundColor: C.primary,
  },
});