import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { auth } from "@/lib/firebase";
import {
  addFoodItem,
  deleteFoodItem,
  fetchFoodItems,
  getUserProfile,
  setUserProfile,
  updateFoodItem,
  uploadProfilePhoto,
  uploadProfilePostMedia,
  type FoodItem,
  type UserProfile,
} from "@/lib/db_logic";
import { goBack } from "@/lib/navigation";
import RestaurantDishEditorModal, {
  type RestaurantDishCategory,
  type RestaurantDishDraft,
} from "@/components/RestaurantDishEditorModal";

const C = Colors.light;

const restaurantTypes = [
  "مأكولات عراقية وعالمية",
  "مشويات",
  "وجبات سريعة",
  "حلويات",
];

const menuTabs: { key: "popular" | RestaurantDishCategory; label: string; emoji: string }[] = [
  { key: "popular", label: "الأكثر طلباً", emoji: "🔥" },
  { key: "main", label: "الأطباق الرئيسية", emoji: "🍢" },
  { key: "appetizer", label: "المقبلات", emoji: "🥗" },
  { key: "drink", label: "المشروبات", emoji: "🥤" },
  { key: "dessert", label: "الحلويات", emoji: "🍰" },
];

type BrandImage = "cover" | "logo";

function firstFoodImage(item: FoodItem): string | null {
  return item.media?.find((media) => media.type === "image")?.url ?? item.media?.[0]?.url ?? null;
}

export default function RestaurantManagerScreen() {
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [restaurantType, setRestaurantType] = useState(restaurantTypes[0]);
  const [estimatedDelivery, setEstimatedDelivery] = useState("20–30 دقيقة");
  const [isAvailable, setIsAvailable] = useState(true);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [activeMenuTab, setActiveMenuTab] = useState<(typeof menuTabs)[number]["key"]>("popular");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [uploadingBrandImage, setUploadingBrandImage] = useState<BrandImage | null>(null);
  const [dishModalVisible, setDishModalVisible] = useState(false);
  const [editingDish, setEditingDish] = useState<FoodItem | null>(null);
  const [savingDish, setSavingDish] = useState(false);
  const [deletingDishId, setDeletingDishId] = useState<string | null>(null);
  const initialNameRef = useRef("");

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 28) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 20) : insets.bottom;

  const load = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/");
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const [profile, allFood] = await Promise.all([
        getUserProfile(user.uid),
        fetchFoodItems(),
      ]);
      if (!profile || profile.specialty !== "restaurant") {
        router.replace("/profile" as any);
        return;
      }
      setUserId(user.uid);
      setName(profile.name || "");
      initialNameRef.current = profile.name || "";
      setRestaurantType(profile.restaurantCategory || restaurantTypes[0]);
      setEstimatedDelivery(profile.estimatedDelivery || "20–30 دقيقة");
      setIsAvailable(profile.isAvailable ?? true);
      setCoverUri(profile.coverUri || null);
      setLogoUri(profile.restaurantLogoUri || null);
      setFoods(allFood.filter((item) => item.userId === user.uid));
    } catch (error) {
      console.error("load restaurant manager failed:", error);
      setLoadError("تعذر تحميل بيانات المطعم. تحقق من الاتصال ثم أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visibleFoods = useMemo(() => {
    if (activeMenuTab === "popular") return foods.filter((food) => food.isPopular);
    return foods.filter((food) => (food.category || "main") === activeMenuTab);
  }, [activeMenuTab, foods]);

  const saveRestaurantInfo = async () => {
    const cleanName = name.trim();
    const cleanDelivery = estimatedDelivery.trim();
    if (!userId) return;
    if (!cleanName) {
      Alert.alert("اسم المطعم مطلوب", "اكتب اسم المطعم قبل حفظ التغييرات.");
      return;
    }
    if (!cleanDelivery) {
      Alert.alert("وقت التوصيل مطلوب", "أدخل متوسط وقت تجهيز وتوصيل الطلب.");
      return;
    }
    setSavingProfile(true);
    try {
      const changes: Partial<UserProfile> = {
        specialty: "restaurant",
        role: "artisan",
        restaurantCategory: restaurantType,
        estimatedDelivery: cleanDelivery,
      };
      if (cleanName !== initialNameRef.current) changes.name = cleanName;
      await setUserProfile(userId, changes);
      initialNameRef.current = cleanName;
      setFoods((current) =>
        current.map((food) => ({ ...food, userName: cleanName })),
      );
      Alert.alert("تم الحفظ", "تم تحديث بيانات المطعم.");
    } catch (error) {
      console.error("save restaurant details failed:", error);
      Alert.alert("تعذر الحفظ", "لم يتم حفظ البيانات. حاول مرة أخرى.");
    } finally {
      setSavingProfile(false);
    }
  };

  const changeAvailability = async (nextValue: boolean) => {
    if (!userId || savingAvailability) return;
    const previous = isAvailable;
    setIsAvailable(nextValue);
    setSavingAvailability(true);
    try {
      await setUserProfile(userId, { isAvailable: nextValue });
    } catch (error) {
      console.error("update restaurant availability failed:", error);
      setIsAvailable(previous);
      Alert.alert("تعذر تغيير الحالة", "حاول مرة أخرى بعد قليل.");
    } finally {
      setSavingAvailability(false);
    }
  };

  const changeBrandImage = async (target: BrandImage) => {
    if (!userId || uploadingBrandImage) return;
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
      aspect: target === "cover" ? [16, 8] : [1, 1],
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]) return;

    const localUri = result.assets[0].uri;
    const previous = target === "cover" ? coverUri : logoUri;
    if (target === "cover") setCoverUri(localUri);
    else setLogoUri(localUri);
    setUploadingBrandImage(target);
    try {
      const url = await uploadProfilePhoto(userId, localUri);
      if (target === "cover") {
        await setUserProfile(userId, { coverUri: url });
        setCoverUri(url);
      } else {
        await setUserProfile(userId, { restaurantLogoUri: url });
        setLogoUri(url);
      }
    } catch (error) {
      console.error("upload restaurant image failed:", error);
      if (target === "cover") setCoverUri(previous);
      else setLogoUri(previous);
      Alert.alert("تعذر رفع الصورة", "لم يتم حفظ الصورة. تحقق من الاتصال وحاول مجدداً.");
    } finally {
      setUploadingBrandImage(null);
    }
  };

  const saveDish = async (draft: RestaurantDishDraft) => {
    const user = auth.currentUser;
    if (!user || !userId) return;
    setSavingDish(true);
    try {
      let media = editingDish?.media ?? [];
      if (draft.imageChanged && draft.imageUri) {
        const uploaded = await uploadProfilePostMedia(user.uid, draft.imageUri, "image");
        media = [{ url: uploaded.url, type: "image" }];
      } else if (!media.length && draft.imageUri) {
        media = [{ url: draft.imageUri, type: "image" }];
      }
      const description = draft.description.trim();
      const data = {
        name: draft.name,
        price: Number(draft.price),
        description,
        appetizers: description,
        category: draft.category,
        isPopular: draft.isPopular,
        media,
      };

      if (editingDish) {
        await updateFoodItem(editingDish.id, data);
        setFoods((current) =>
          current.map((food) => (food.id === editingDish.id ? { ...food, ...data } : food)),
        );
      } else {
        const dishId = await addFoodItem({
          userId,
          userName: name.trim(),
          userPhoto: logoUri,
          ...data,
          likesCount: 0,
          commentsCount: 0,
          createdAt: Date.now(),
        });
        setFoods((current) => [
          { id: dishId, userId, userName: name.trim(), userPhoto: logoUri, ...data, likesCount: 0, commentsCount: 0, createdAt: Date.now() },
          ...current,
        ]);
      }
      setDishModalVisible(false);
      setEditingDish(null);
    } catch (error) {
      console.error("save restaurant dish failed:", error);
      Alert.alert("تعذر حفظ الطبق", "لم يتم حفظ الطبق. حاول مرة أخرى.");
    } finally {
      setSavingDish(false);
    }
  };

  const openDishEditor = (dish?: FoodItem) => {
    setEditingDish(dish ?? null);
    setDishModalVisible(true);
  };

  const confirmDeleteDish = (dish: FoodItem) => {
    Alert.alert("حذف الطبق", `هل تريد حذف «${dish.name}» من قائمتك؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setDeletingDishId(dish.id);
            try {
              await deleteFoodItem(dish.id);
              setFoods((current) => current.filter((food) => food.id !== dish.id));
            } catch (error) {
              console.error("delete restaurant dish failed:", error);
              Alert.alert("تعذر الحذف", "لم يتم حذف الطبق. حاول مرة أخرى.");
            } finally {
              setDeletingDishId(null);
            }
          })();
        },
      },
    ]);
  };

  const togglePopular = async (dish: FoodItem) => {
    const next = !dish.isPopular;
    setFoods((current) =>
      current.map((food) => (food.id === dish.id ? { ...food, isPopular: next } : food)),
    );
    try {
      await updateFoodItem(dish.id, { isPopular: next });
    } catch (error) {
      console.error("update popular dish failed:", error);
      setFoods((current) =>
        current.map((food) => (food.id === dish.id ? { ...food, isPopular: !next } : food)),
      );
      Alert.alert("تعذر تحديث الطبق", "حاول مرة أخرى.");
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={styles.loadingText}>جارٍ تجهيز لوحة المطعم...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.loadingScreen}>
        <Ionicons name="cloud-offline-outline" size={36} color={C.textMuted} />
        <Text style={styles.loadError}>{loadError}</Text>
        <Pressable onPress={() => void load()} style={styles.retryButton}>
          <Text style={styles.retryText}>إعادة المحاولة</Text>
        </Pressable>
        <Pressable onPress={goBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>رجوع</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: bottomPad + 34 }}
      >
        <View style={[styles.header, { paddingTop: topPad + 12 }]}>
          <Pressable onPress={goBack} style={styles.headerButton} accessibilityLabel="رجوع">
            <Feather name="arrow-right" size={21} color="#FFF" />
          </Pressable>
          <View style={styles.headerTitleGroup}>
            <Text style={styles.headerTitle}>إدارة المطعم</Text>
            <Text style={styles.headerSubtitle}>كل تفاصيل مطعمك في مكان واحد</Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="restaurant" size={20} color={C.accent} />
          </View>
        </View>

        <View style={styles.brandCard}>
          <Pressable
            style={styles.cover}
            onPress={() => void changeBrandImage("cover")}
            accessibilityRole="button"
            accessibilityLabel="تغيير صورة غلاف المطعم"
          >
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="restaurant-outline" size={38} color="rgba(255,255,255,0.72)" />
                <Text style={styles.coverPlaceholderText}>أضف صورة غلاف لمطعمك</Text>
              </View>
            )}
            <View style={styles.coverShade} />
            <View style={styles.coverEdit}>
              {uploadingBrandImage === "cover" ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Feather name="camera" size={15} color="#FFF" />
              )}
              <Text style={styles.coverEditText}>تغيير الغلاف</Text>
            </View>
            <View style={styles.brandLogoWrap}>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  void changeBrandImage("logo");
                }}
                style={styles.logoTouch}
                accessibilityRole="button"
                accessibilityLabel="تغيير شعار المطعم"
              >
                {logoUri ? (
                  <Image source={{ uri: logoUri }} style={styles.logoImage} />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <Ionicons name="restaurant-outline" size={29} color={C.accent} />
                  </View>
                )}
                <View style={styles.logoCamera}>
                  {uploadingBrandImage === "logo" ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Feather name="camera" size={12} color="#FFF" />
                  )}
                </View>
              </Pressable>
            </View>
          </Pressable>
          <View style={styles.brandCaption}>
            <Text style={styles.brandTitle}>{name || "مطعمك"}</Text>
            <Text style={styles.brandHint}>الغلاف والشعار يساعدان العملاء على التعرّف على مطعمك</Text>
          </View>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusCopy}>
            <View style={[styles.statusDot, isAvailable ? styles.statusDotOpen : styles.statusDotClosed]} />
            <View>
              <Text style={styles.statusTitle}>{isAvailable ? "المطعم مفتوح" : "المطعم مغلق"}</Text>
              <Text style={styles.statusDescription}>
                {isAvailable ? "يمكن للعملاء طلب الأطباق الآن" : "لن تظهر الأطباق كمتاحة للطلب"}
              </Text>
            </View>
          </View>
          <View style={styles.statusControl}>
            {savingAvailability && <ActivityIndicator size="small" color={C.accent} />}
            <Switch
              value={isAvailable}
              onValueChange={(value) => void changeAvailability(value)}
              disabled={savingAvailability}
              trackColor={{ false: "#CBD0D9", true: "#73C798" }}
              thumbColor={isAvailable ? "#FFF" : "#F8FAFC"}
              accessibilityLabel="حالة المطعم مفتوح أو مغلق"
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionIcon}>
              <Feather name="edit-3" size={17} color={C.accent} />
            </View>
            <View style={styles.sectionHeadingText}>
              <Text style={styles.sectionTitle}>بيانات المطعم</Text>
              <Text style={styles.sectionSubtitle}>معلومات تظهر للعملاء في صفحة مطعمك</Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>اسم المطعم</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="مثال: مطعم أبو كيان"
            placeholderTextColor={C.textMuted}
            style={styles.input}
            textAlign="right"
            maxLength={60}
          />

          <Text style={styles.fieldLabel}>نوع المأكولات</Text>
          <View style={styles.typeChips}>
            {restaurantTypes.map((type) => {
              const selected = restaurantType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => setRestaurantType(type)}
                  style={[styles.typeChip, selected && styles.typeChipSelected]}
                >
                  <Text style={[styles.typeChipText, selected && styles.typeChipTextSelected]}>
                    {type}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>وقت التجهيز والتوصيل المتوقع</Text>
          <View style={styles.deliveryInputRow}>
            <Text style={styles.deliveryUnit}>دقيقة</Text>
            <TextInput
              value={estimatedDelivery}
              onChangeText={setEstimatedDelivery}
              placeholder="20–30 دقيقة"
              placeholderTextColor={C.textMuted}
              style={styles.deliveryInput}
              textAlign="right"
              maxLength={30}
            />
            <Feather name="clock" size={17} color={C.textMuted} />
          </View>

          <Pressable
            onPress={() => void saveRestaurantInfo()}
            disabled={savingProfile}
            style={[styles.saveProfileButton, savingProfile && { opacity: 0.7 }]}
          >
            {savingProfile ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Feather name="save" size={17} color="#FFF" />
                <Text style={styles.saveProfileText}>حفظ بيانات المطعم</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.menuSection}>
          <View style={styles.menuHeader}>
            <Pressable onPress={() => openDishEditor()} style={styles.addDishButton}>
              <Feather name="plus" size={16} color={C.primary} />
              <Text style={styles.addDishText}>إضافة طبق</Text>
            </Pressable>
            <View style={styles.menuHeadingText}>
              <Text style={styles.sectionTitle}>قائمة الطعام</Text>
              <Text style={styles.sectionSubtitle}>{foods.length} أطباق في قائمتك</Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.menuTabs}
          >
            {menuTabs.map((tab) => {
              const selected = activeMenuTab === tab.key;
              const count = tab.key === "popular"
                ? foods.filter((food) => food.isPopular).length
                : foods.filter((food) => (food.category || "main") === tab.key).length;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveMenuTab(tab.key)}
                  style={[styles.menuTab, selected && styles.menuTabSelected]}
                >
                  <Text style={styles.menuTabEmoji}>{tab.emoji}</Text>
                  <Text style={[styles.menuTabLabel, selected && styles.menuTabLabelSelected]}>
                    {tab.label}
                  </Text>
                  <Text style={[styles.menuTabCount, selected && styles.menuTabLabelSelected]}>
                    {count}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {visibleFoods.length === 0 ? (
            <View style={styles.emptyMenu}>
              <View style={styles.emptyMenuIcon}>
                <Ionicons name="restaurant-outline" size={27} color={C.accent} />
              </View>
              <Text style={styles.emptyMenuTitle}>
                {activeMenuTab === "popular" ? "لا توجد أطباق ضمن الأكثر طلباً" : "لا توجد أطباق في هذه الفئة"}
              </Text>
              <Text style={styles.emptyMenuHint}>أضف طبقاً أو غيّر الفئة لمتابعة إدارة قائمتك.</Text>
              <Pressable onPress={() => openDishEditor()} style={styles.emptyAddButton}>
                <Feather name="plus" size={15} color={C.primary} />
                <Text style={styles.emptyAddText}>إضافة أول طبق</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.dishList}>
              {visibleFoods.map((dish) => {
                const image = firstFoodImage(dish);
                const isDeleting = deletingDishId === dish.id;
                const tabInfo = menuTabs.find((tab) => tab.key === (dish.category || "main"));
                return (
                  <View key={dish.id} style={styles.dishCard}>
                    {image ? (
                      <Image source={{ uri: image }} style={styles.dishThumb} />
                    ) : (
                      <View style={[styles.dishThumb, styles.dishThumbPlaceholder]}>
                        <Ionicons name="restaurant-outline" size={24} color={C.accent} />
                      </View>
                    )}
                    <View style={styles.dishInfo}>
                      <Text style={styles.dishName} numberOfLines={1}>{dish.name}</Text>
                      <Text style={styles.dishCategory}>
                        {tabInfo?.emoji ?? "🍽️"} {tabInfo?.label ?? "أطباق رئيسية"}
                      </Text>
                      {!!(dish.description || dish.appetizers) && (
                        <Text style={styles.dishDescription} numberOfLines={1}>
                          {dish.description || dish.appetizers}
                        </Text>
                      )}
                      <Text style={styles.dishPrice}>
                        {Number(dish.price || 0).toLocaleString("ar-IQ-u-nu-latn")} د.ع
                      </Text>
                    </View>
                    <View style={styles.dishActions}>
                      <Pressable
                        onPress={() => void togglePopular(dish)}
                        style={[styles.actionIcon, dish.isPopular && styles.popularAction]}
                        accessibilityLabel={dish.isPopular ? "إزالة من الأكثر طلباً" : "إضافة إلى الأكثر طلباً"}
                      >
                        <Ionicons name={dish.isPopular ? "star" : "star-outline"} size={17} color={dish.isPopular ? "#B78111" : C.textMuted} />
                      </Pressable>
                      <Pressable onPress={() => openDishEditor(dish)} style={styles.actionIcon} accessibilityLabel="تعديل الطبق">
                        <Feather name="edit-2" size={15} color={C.textSecondary} />
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDeleteDish(dish)}
                        style={styles.actionIcon}
                        disabled={isDeleting}
                        accessibilityLabel="حذف الطبق"
                      >
                        {isDeleting ? <ActivityIndicator size="small" color={C.danger} /> : <Feather name="trash-2" size={15} color={C.danger} />}
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <RestaurantDishEditorModal
        visible={dishModalVisible}
        initialDish={editingDish}
        saving={savingDish}
        onClose={() => {
          if (savingDish) return;
          setDishModalVisible(false);
          setEditingDish(null);
        }}
        onSave={(draft) => void saveDish(draft)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  loadingScreen: { flex: 1, backgroundColor: C.background, alignItems: "center", justifyContent: "center", padding: 28, gap: 12 },
  loadingText: { color: C.textSecondary, fontWeight: "700", fontSize: 13 },
  loadError: { color: C.textSecondary, fontSize: 14, lineHeight: 22, textAlign: "center" },
  retryButton: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12, backgroundColor: C.primary, marginTop: 5 },
  retryText: { color: "#FFF", fontWeight: "800" },
  backLink: { padding: 10 },
  backLinkText: { color: C.textMuted, fontWeight: "700" },
  header: { minHeight: 86, paddingHorizontal: 18, paddingBottom: 15, backgroundColor: C.primary, flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  headerButton: { width: 41, height: 41, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  headerTitleGroup: { flex: 1, alignItems: "flex-start" },
  headerTitle: { color: "#FFF", fontSize: 20, fontWeight: "900", textAlign: "right" },
  headerSubtitle: { color: "rgba(255,255,255,0.68)", fontSize: 11, marginTop: 3, textAlign: "right" },
  headerIcon: { width: 41, height: 41, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(201,168,76,0.17)" },
  brandCard: { margin: 16, marginBottom: 12, backgroundColor: C.card, borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: C.border, elevation: 2 },
  cover: { height: 190, backgroundColor: "#1B2B53", position: "relative", justifyContent: "center", alignItems: "center" },
  coverPlaceholder: { alignItems: "center", gap: 8 },
  coverPlaceholderText: { color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: "700" },
  coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(6,13,30,0.16)" },
  coverEdit: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(13,20,40,0.72)", borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 },
  coverEditText: { color: "#FFF", fontSize: 11, fontWeight: "800" },
  brandLogoWrap: { position: "absolute", bottom: -37, right: 19, width: 82, height: 82, borderRadius: 25, padding: 4, backgroundColor: C.card, elevation: 5 },
  logoTouch: { flex: 1, borderRadius: 21, overflow: "visible", position: "relative" },
  logoImage: { width: "100%", height: "100%", borderRadius: 21 },
  logoPlaceholder: { flex: 1, borderRadius: 21, backgroundColor: "#F2F0E8", alignItems: "center", justifyContent: "center" },
  logoCamera: { position: "absolute", left: -4, bottom: -3, width: 27, height: 27, borderRadius: 14, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.card },
  brandCaption: { paddingTop: 47, paddingBottom: 15, paddingHorizontal: 18, alignItems: "flex-end" },
  brandTitle: { fontSize: 17, fontWeight: "900", color: C.text, textAlign: "right" },
  brandHint: { color: C.textMuted, fontSize: 11, marginTop: 4, textAlign: "right" },
  statusCard: { marginHorizontal: 16, marginBottom: 18, minHeight: 78, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 15 },
  statusCopy: { flexDirection: "row-reverse", alignItems: "center", gap: 11 },
  statusDot: { width: 11, height: 11, borderRadius: 6 },
  statusDotOpen: { backgroundColor: "#1DA96B" },
  statusDotClosed: { backgroundColor: "#E34E55" },
  statusTitle: { color: C.text, fontWeight: "900", fontSize: 14, textAlign: "right" },
  statusDescription: { color: C.textMuted, fontSize: 11, marginTop: 3, textAlign: "right" },
  statusControl: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  section: { marginHorizontal: 16, marginBottom: 18, padding: 16, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  sectionHeading: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 15 },
  sectionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(201,168,76,0.14)", alignItems: "center", justifyContent: "center" },
  sectionHeadingText: { flex: 1, alignItems: "flex-end" },
  sectionTitle: { color: C.text, fontWeight: "900", fontSize: 17, textAlign: "right" },
  sectionSubtitle: { color: C.textMuted, fontSize: 11, marginTop: 3, textAlign: "right" },
  fieldLabel: { color: C.textSecondary, fontSize: 12, fontWeight: "800", textAlign: "right", marginBottom: 8, marginTop: 12 },
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: C.border, backgroundColor: C.background, color: C.text, paddingHorizontal: 13, fontSize: 14 },
  typeChips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  typeChip: { paddingHorizontal: 12, minHeight: 36, borderRadius: 12, justifyContent: "center", backgroundColor: C.background, borderWidth: 1, borderColor: C.border },
  typeChipSelected: { backgroundColor: "rgba(201,168,76,0.16)", borderColor: C.accent },
  typeChipText: { color: C.textSecondary, fontSize: 11, fontWeight: "700" },
  typeChipTextSelected: { color: C.text, fontWeight: "900" },
  deliveryInputRow: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: C.border, backgroundColor: C.background, flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 13, gap: 9 },
  deliveryInput: { flex: 1, color: C.text, fontSize: 13, minHeight: 46 },
  deliveryUnit: { color: C.textMuted, fontSize: 11, fontWeight: "700" },
  saveProfileButton: { minHeight: 48, backgroundColor: C.primary, borderRadius: 14, marginTop: 18, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  saveProfileText: { color: "#FFF", fontSize: 13, fontWeight: "900" },
  menuSection: { marginHorizontal: 16, padding: 16, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  menuHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 15 },
  menuHeadingText: { flex: 1, alignItems: "flex-end" },
  addDishButton: { minHeight: 39, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.accent, flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  addDishText: { color: C.primary, fontSize: 12, fontWeight: "900" },
  menuTabs: { flexDirection: "row-reverse", gap: 8, paddingBottom: 13 },
  menuTab: { minHeight: 39, flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 11, borderRadius: 13, backgroundColor: C.background, borderWidth: 1, borderColor: C.border },
  menuTabSelected: { backgroundColor: C.primary, borderColor: C.primary },
  menuTabEmoji: { fontSize: 13 },
  menuTabLabel: { color: C.textSecondary, fontSize: 11, fontWeight: "700" },
  menuTabLabelSelected: { color: "#FFF", fontWeight: "900" },
  menuTabCount: { color: C.textMuted, fontSize: 10, fontWeight: "800" },
  emptyMenu: { alignItems: "center", paddingHorizontal: 14, paddingVertical: 28, borderRadius: 17, backgroundColor: C.background, borderWidth: 1, borderColor: C.border, borderStyle: "dashed" },
  emptyMenuIcon: { width: 51, height: 51, borderRadius: 18, backgroundColor: "rgba(201,168,76,0.13)", alignItems: "center", justifyContent: "center", marginBottom: 11 },
  emptyMenuTitle: { color: C.text, fontSize: 13, fontWeight: "900", textAlign: "center" },
  emptyMenuHint: { color: C.textMuted, fontSize: 11, marginTop: 5, textAlign: "center" },
  emptyAddButton: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginTop: 14, backgroundColor: C.accent, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 9 },
  emptyAddText: { color: C.primary, fontWeight: "900", fontSize: 11 },
  dishList: { gap: 10 },
  dishCard: { minHeight: 100, padding: 9, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.background, flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  dishThumb: { width: 76, height: 78, borderRadius: 13, backgroundColor: "#E9E9E5" },
  dishThumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  dishInfo: { flex: 1, alignItems: "flex-end", minWidth: 0 },
  dishName: { color: C.text, fontSize: 13, fontWeight: "900", textAlign: "right", width: "100%" },
  dishCategory: { color: C.textMuted, fontSize: 10, fontWeight: "700", marginTop: 3, textAlign: "right" },
  dishDescription: { color: C.textMuted, fontSize: 10, marginTop: 3, textAlign: "right", width: "100%" },
  dishPrice: { color: "#A98020", fontSize: 12, fontWeight: "900", marginTop: 5, textAlign: "right" },
  dishActions: { gap: 5 },
  actionIcon: { width: 31, height: 31, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  popularAction: { backgroundColor: "rgba(245,193,73,0.16)", borderColor: "rgba(193,138,22,0.28)" },
});