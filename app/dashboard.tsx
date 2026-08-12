import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
  Image,
  RefreshControl,
  ScrollView,
  Alert,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { auth } from "../lib/firebase";
import {
  getArtisans,
  getUserProfile,
  calcDistanceKm,
  type ArtisanProfile,
  type ServiceCategory,
  type GeoLocation,
  type Product,
  HOME_SERVICES,
  CAR_SERVICES,
  GENERAL_SERVICES,
  DELIVERY_SERVICES,
  getSpecialtyLabel,
  isFeaturedActive,
  subscribeToUserChatLastAts,
  subscribeToClientServiceRequests,
  subscribeToProducts,
  createProductOrder,
  deleteProduct,
  cancelProductOrder,
  subscribeToBuyerProductOrders,
  type ProductOrder,
} from "../lib/db_logic";
// Note: getPromotedArtisans removed — promoted artisans now bubble to top of main list
import Colors from "@/constants/colors";
import {
  registerForPushNotifications,
  addNotificationTapListener,
  performSignOut,
} from "../lib/push_notifications";
import { useProfileCheck } from "@/hooks/useProfileCheck";
import ProfileAvatar from "@/components/ProfileAvatar";

const C = Colors.light;

type CategoryTab = "all" | ServiceCategory;

const CATEGORY_TABS: { key: CategoryTab; label: string; icon: string }[] = [
  { key: "all", label: "الرئيسية", icon: "home" },
  { key: "home", label: "خدمات المنزل", icon: "home" },
  { key: "car", label: "خدمات السيارات", icon: "truck" },
  { key: "general", label: "خدمات طبية", icon: "activity" },
  { key: "delivery", label: "خدمات توصيل", icon: "navigation" },
];

const SPECIALTY_FILTERS: Record<CategoryTab, { key: string; label: string; icon: string }[]> = {
  all: [],
  home: HOME_SERVICES,
  car: CAR_SERVICES,
  general: GENERAL_SERVICES,
  delivery: DELIVERY_SERVICES,
};

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= Math.round(rating) ? "star" : "star-outline"}
          size={size}
          color={i <= Math.round(rating) ? "#F59E0B" : C.textMuted}
        />
      ))}
    </View>
  );
}

function StarRow({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.4;
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= full ? "star" : half && i === full + 1 ? "star-half" : "star-outline"}
          size={12}
          color="#F59E0B"
        />
      ))}
    </View>
  );
}


function ArtisanCard({
  artisan,
  userLocation,
  index,
}: {
  artisan: ArtisanProfile;
  userLocation: GeoLocation | null;
  index: number;
}) {
  const distance =
    userLocation && artisan.location
      ? calcDistanceKm(userLocation, artisan.location)
      : null;

  const initials = artisan.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <Pressable
        style={({ pressed }) => [styles.artisanCard, pressed && { opacity: 0.92 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          // Pass the already-fetched artisan object along so the profile screen
          // can render instantly instead of waiting on a fresh Firestore read.
          router.push({
            pathname: "/artisan-profile",
            params: { artisanId: artisan.id, artisan: JSON.stringify(artisan) },
          });
        }}
      >
        <View style={styles.cardLeft}>
          {artisan.photoUri ? (
            <Image source={{ uri: artisan.photoUri }} style={styles.artisanPhoto} />
          ) : (
            <View style={styles.artisanInitials}>
              <LinearGradient colors={[C.primary, "#1E2F60"]} style={StyleSheet.absoluteFill} />
              <Text style={styles.initialsText}>{initials}</Text>
            </View>
          )}
          <View style={[styles.availDot, artisan.isAvailable ? styles.availOnline : styles.availOffline]} />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <View style={styles.specialtyBadge}>
              <Text style={styles.specialtyText}>{getSpecialtyLabel(artisan.specialty)}</Text>
            </View>
            <Text style={styles.artisanName} numberOfLines={1}>{artisan.name}</Text>
          </View>
          {isFeaturedActive(artisan) && (
            <View style={styles.featuredBadgeRow}>
              <View style={styles.featuredBadge}>
                <Ionicons name="star" size={10} color={C.primary} />
                <Text style={styles.featuredBadgeText}>مميز</Text>
              </View>
            </View>
          )}

          <View style={styles.cardMidRow}>
            <StarRating rating={artisan.rating} />
            <Text style={styles.ratingText}>
              {artisan.rating > 0 ? artisan.rating.toFixed(1) : "جديد"}{" "}
              {artisan.reviewCount > 0 && <Text style={styles.reviewCount}>({artisan.reviewCount})</Text>}
            </Text>
          </View>

          {artisan.bio ? (
            <Text style={styles.artisanBio} numberOfLines={4}>{artisan.bio}</Text>
          ) : null}

          <View style={styles.cardFooter}>
            {distance !== null ? (
              <View style={styles.distancePill}>
                <Feather name="map-pin" size={11} color={C.accent} />
                <Text style={styles.distanceText}>
                  {distance < 1
                    ? `${Math.round(distance * 1000)} م`
                    : `${distance.toFixed(1)} كم`}
                </Text>
              </View>
            ) : (
              <View style={styles.distancePill}>
                <Feather name="map-pin" size={11} color={C.textMuted} />
                <Text style={[styles.distanceText, { color: C.textMuted }]}>موقع غير متاح</Text>
              </View>
            )}
            <Text style={[styles.availText, artisan.isAvailable ? styles.availOnlineText : styles.availOfflineText]}>
              {artisan.isAvailable ? "متاح الآن" : "غير متاح"}
            </Text>
          </View>
        </View>

        <Feather name="chevron-left" size={18} color={C.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [artisans, setArtisans] = useState<ArtisanProfile[]>([]);
  const [userLocation, setUserLocation] = useState<GeoLocation | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryTab>("all");
  const [activeSpecialty, setActiveSpecialty] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState("المستخدم");
  const [userRole, setUserRole] = useState<"client" | "artisan" | "admin">("client");
  const [loading, setLoading] = useState(true);

  const [chatLastAts, setChatLastAts] = useState<string[]>([]);
  const [lastMsgSeen, setLastMsgSeen] = useState<string>("");
  const [pendingBookingCount, setPendingBookingCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  // ── Marketplace ──
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [buyingProductId, setBuyingProductId] = useState<string | null>(null);
  // productId → orderId for the current user's pending buy orders (prevents duplicates)
  const [myPendingOrders, setMyPendingOrders] = useState<Map<string, string>>(new Map());

  // search state — kept for filteredArtisans (search now lives in /search screen)
  const [search] = useState("");
  const { profile: liveProfile } = useProfileCheck(userId);

  const unreadMsgCount = useMemo(() => {
    if (!lastMsgSeen) return 0;
    return chatLastAts.filter((at) => at && at > lastMsgSeen).length;
  }, [chatLastAts, lastMsgSeen]);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const loadData = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) { router.replace("/login" as any); return; }

    try {
      const [profile, allArtisans] = await Promise.all([
        getUserProfile(user.uid),
        getArtisans(),
      ]);

      if (profile) {
        setUserName(profile.name || user.email?.split("@")[0] || "المستخدم");
        setUserRole(profile.role || "client");
        if (profile.location) setUserLocation(profile.location);
      }
      setUserId(user.uid);

      setArtisans(allArtisans);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
    } catch (err) {
      console.error("loadData error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Register for push notifications + handle notification taps
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    registerForPushNotifications(user.uid).catch(() => {});

    const sub = addNotificationTapListener((data) => {
      if (data?.type === "chat" && data?.chatId && data?.senderName) {
        router.push({
          pathname: "/chat",
          params: { chatId: data.chatId, otherName: data.senderName },
        });
      } else if (data?.type === "serviceRequest" || data?.type === "requestStatus") {
        router.push("/reservations" as any);
      } else if (data?.type === "productOrder") {
        router.push("/product-orders" as any);
      } else if (data?.type === "productOrderResponse") {
        router.push("/product-orders" as any);
      }
    });
    return () => sub.remove();
  }, []);

  // Badge: load last-seen timestamp for messages
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    AsyncStorage.getItem(`@forus:msgSeen:${user.uid}`).then((val) => {
      if (val) {
        setLastMsgSeen(val);
      } else {
        const now = new Date().toISOString();
        AsyncStorage.setItem(`@forus:msgSeen:${user.uid}`, now);
        setLastMsgSeen(now);
      }
    });
  }, []);

  // Badge: subscribe to chat timestamps (no profile lookups — fast)
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsub = subscribeToUserChatLastAts(user.uid, setChatLastAts);
    return unsub;
  }, []);

  // Marketplace: subscribe to products (realtime — updates immediately on publish)
  // Depends on userId so we only subscribe after Firebase auth has restored the
  // session. Subscribing before auth is ready causes PERMISSION_DENIED, which
  // would clear the list and never retry.
  useEffect(() => {
    if (!userId) return;
    setProductsLoading(true);
    const unsub = subscribeToProducts(
      (data) => {
        setProducts(data);
        setProductsLoading(false);
      },
      (_err) => {
        // PERMISSION_DENIED or any other error — stop spinner, show empty list
        setProductsLoading(false);
        setProducts([]);
      }
    );
    return unsub;
  }, [userId]);

  // Badge: subscribe to active/pending service requests
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsub = subscribeToClientServiceRequests(
      user.uid,
      (requests) => {
        const count = requests.filter((r) =>
          ["pending", "accepted", "on_the_way", "in_progress"].includes(r.status)
        ).length;
        setPendingBookingCount(count);
      },
      () => {}
    );
    return unsub;
  }, []);

  // Buyer: keep a live map of productId → orderId for MY pending orders
  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeToBuyerProductOrders(
      userId,
      (orders: ProductOrder[]) => {
        const map = new Map<string, string>();
        orders.forEach((o) => {
          if (o.status === "pending") map.set(o.productId, o.id);
        });
        setMyPendingOrders(map);
      },
      () => setMyPendingOrders(new Map())
    );
    return unsub;
  }, [userId]);

  const handleMessagesPress = useCallback(async () => {
    const user = auth.currentUser;
    if (user) {
      const now = new Date().toISOString();
      await AsyncStorage.setItem(`@forus:msgSeen:${user.uid}`, now);
      setLastMsgSeen(now);
    }
    router.push("/messages" as any);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleLogout = async () => {
    Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "خروج",
        style: "destructive",
        onPress: async () => {
          await performSignOut();
          router.replace("/login");
        },
      },
    ]);
  };

  const filteredArtisans = React.useMemo(() => {
    let result = [...artisans];

    if (activeCategory !== "all") {
      // Specialty sub-tabs: exclude clients, filter by category
      result = result.filter((a) => a.specialty !== "client");
      result = result.filter((a) => a.category === activeCategory);
    }
    if (activeSpecialty !== "all") {
      result = result.filter((a) => a.specialty === activeSpecialty);
    }
    // search is now handled in /search screen; keep variable reference to avoid TS warning
    void search;

    if (userLocation) {
      result.sort((a, b) => {
        // Promoted artisans always bubble to the top; among equals, sort by distance
        const aFeat = isFeaturedActive(a) ? 0 : 1;
        const bFeat = isFeaturedActive(b) ? 0 : 1;
        if (aFeat !== bFeat) return aFeat - bFeat;
        const da = a.location ? calcDistanceKm(userLocation, a.location) : Infinity;
        const db = b.location ? calcDistanceKm(userLocation, b.location) : Infinity;
        return da - db;
      });
    } else {
      // No location — promoted first, then rest
      result.sort((a, b) => {
        const aFeat = isFeaturedActive(a) ? 0 : 1;
        const bFeat = isFeaturedActive(b) ? 0 : 1;
        return aFeat - bFeat;
      });
    }

    return result;
  }, [artisans, activeCategory, activeSpecialty, userLocation]);

  // Sort products: featured sellers first, then by creation date (newest first)
  const sortedProducts = React.useMemo(() => {
    return [...products].sort((a, b) => {
      const aF = isFeaturedActive({ featuredUntil: a.sellerFeaturedUntil }) ? 0 : 1;
      const bF = isFeaturedActive({ featuredUntil: b.sellerFeaturedUntil }) ? 0 : 1;
      if (aF !== bF) return aF - bF;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
  }, [products]);

  const specialtyFilters = SPECIALTY_FILTERS[activeCategory];

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={[styles.headerGrad, { paddingTop: topPad }]}>
        <View style={styles.headerActions}>
          {userRole === "admin" && (
            <Pressable style={styles.headerIconCol} onPress={() => router.push("/admin-dashboard" as any)}>
              <View style={styles.headerIconBtn}>
                <Feather name="shield" size={20} color={C.accent} />
              </View>
              <Text style={styles.headerIconLabel}>الإدارة</Text>
            </Pressable>
          )}
          <Pressable style={styles.headerIconCol} onPress={() => router.push("/reservations" as any)}>
            <View style={styles.headerIconBtn}>
              <Feather name="inbox" size={20} color="#FFF" />
              {pendingBookingCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {pendingBookingCount > 99 ? "99+" : pendingBookingCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.headerIconLabel}>طلبات واردة</Text>
          </Pressable>
          <Pressable style={styles.headerIconCol} onPress={handleMessagesPress}>
            <View style={styles.headerIconBtn}>
              <Feather name="message-circle" size={20} color="#FFF" />
              {unreadMsgCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadMsgCount > 99 ? "99+" : unreadMsgCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.headerIconLabel}>المراسلات</Text>
          </Pressable>
          <Pressable style={styles.headerIconCol} onPress={() => router.push("/support" as any)}>
            <View style={styles.headerIconBtn}>
              <Feather name="headphones" size={20} color="#FFF" />
            </View>
            <Text style={styles.headerIconLabel}>خدمة العملاء</Text>
          </Pressable>
          <View style={styles.headerIconCol}>
            <ProfileAvatar
              photoUri={liveProfile?.photoUri}
              name={userName}
              size={36}
            />
            <Text style={styles.headerIconLabel} numberOfLines={1}>{userName}</Text>
          </View>
        </View>

        {/* ── شريط الأدوات الثابت: ترويج + بحث — يظهر لجميع المستخدمين ── */}
        <View style={styles.headerUtilRow}>
          <Pressable
            style={styles.promoteHeaderBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/promote" as any); }}
            accessibilityLabel="روّج حسابك"
          >
            <Ionicons name="rocket" size={13} color={C.accent} />
            <Text style={styles.promoteHeaderBtnText}>روّج حسابك</Text>
          </Pressable>
          <Pressable
            style={styles.searchCircleBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/search" as any); }}
            accessibilityLabel="بحث"
          >
            <Feather name="search" size={18} color="rgba(255,255,255,0.9)" />
          </Pressable>
        </View>

      </LinearGradient>

      {/* Category + specialty tabs — always visible */}
      <View style={styles.stickyBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryTabs}
              style={styles.categoryTabsWrapper}
            >
              {CATEGORY_TABS.map((tab) => (
                <Pressable
                  key={tab.key}
                  style={[styles.catTab, activeCategory === tab.key && styles.catTabActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setActiveCategory(tab.key);
                    setActiveSpecialty("all");
                  }}
                >
                  <Feather
                    name={tab.icon as any}
                    size={14}
                    color={activeCategory === tab.key ? C.primary : C.textSecondary}
                  />
                  <Text style={[styles.catTabText, activeCategory === tab.key && styles.catTabTextActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {specialtyFilters.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.specialtyFilters}
                style={styles.specialtyFilterWrapper}
              >
                <Pressable
                  style={[styles.specFilter, activeSpecialty === "all" && styles.specFilterActive]}
                  onPress={() => { Haptics.selectionAsync(); setActiveSpecialty("all"); }}
                >
                  <Text style={[styles.specFilterText, activeSpecialty === "all" && styles.specFilterTextActive]}>
                    الكل
                  </Text>
                </Pressable>
                {specialtyFilters.map((sp) => (
                  <Pressable
                    key={sp.key}
                    style={[styles.specFilter, activeSpecialty === sp.key && styles.specFilterActive]}
                    onPress={() => { Haptics.selectionAsync(); setActiveSpecialty(sp.key); }}
                  >
                    <Text style={[styles.specFilterText, activeSpecialty === sp.key && styles.specFilterTextActive]}>
                      {sp.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>

          {/* ── Conditional list: Products (الرئيسية) OR Artisans (specialty tabs) ── */}
          <View style={styles.listWrapper}>
            {/* Floating add-product button — above the products list */}
            {activeCategory === "all" && (
              <TouchableOpacity
                style={styles.floatingAddBtn}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/add-product" as any); }}
                activeOpacity={0.8}
              >
                <Feather name="plus" size={13} color={C.accent} />
                <Text style={styles.floatingAddBtnText}>إضافة منتج</Text>
              </TouchableOpacity>
            )}
            {activeCategory === "all" ? (
              /* ══ PRODUCTS-ONLY VIEW ══ */
              <FlatList
                data={sortedProducts}
                keyExtractor={(p) => p.id}
                contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 20 }]}
                refreshControl={<RefreshControl refreshing={productsLoading} onRefresh={onRefresh} tintColor={C.accent} />}
                showsVerticalScrollIndicator={false}
                renderItem={({ item: product }) => {
                  const isSold = product.status === "sold";
                  const isMine = product.sellerId === userId;
                  const pendingOrderId = myPendingOrders.get(product.id);
                  const isLoadingP = buyingProductId === product.id;
                  return (
                    <View style={[styles.productCard, isSold && styles.productCardSold]}>
                      <TouchableOpacity activeOpacity={0.85} onPress={() => setFullscreenImage(product.imageUrl)}>
                        <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="cover" />
                        {isSold && <View style={styles.soldOverlay}><Text style={styles.soldOverlayText}>مباع</Text></View>}
                      </TouchableOpacity>
                      <View style={styles.productBody}>
                        <View style={styles.productHeaderRow}>
                          <TouchableOpacity activeOpacity={0.7} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: "/user-profile", params: { userId: product.sellerId, userName: product.sellerName } } as any); }} style={styles.productSellerTouchable}>
                            <Text style={styles.productSellerName} numberOfLines={1}>{product.sellerName}</Text>
                            {isFeaturedActive({ featuredUntil: product.sellerFeaturedUntil }) && (
                              <View style={styles.productFeaturedBadge}>
                                <Ionicons name="star" size={10} color={C.primary} />
                                <Text style={styles.productFeaturedText}>مميز</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                          <Text style={styles.productTitle} numberOfLines={2}>{product.title}</Text>
                        </View>
                        <Text style={styles.productPrice}><Text style={styles.productPriceLabel}>السعر: </Text>{product.price.toLocaleString("ar-IQ")} <Text style={styles.productCurrency}>د.ع</Text></Text>
                        {product.description ? <Text style={styles.productDesc} numberOfLines={2}>{product.description}</Text> : null}
                      </View>
                      {!isSold && (() => {
                        if (isMine) return (
                          <TouchableOpacity style={[styles.buyBtn, styles.deleteBtn]} activeOpacity={0.85} disabled={isLoadingP} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Alert.alert("حذف المنتج", `هل أنت متأكد من حذف "${product.title}"؟`, [{ text: "إلغاء", style: "cancel" }, { text: "حذف", style: "destructive", onPress: async () => { setBuyingProductId(product.id); try { await deleteProduct(product.id); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { Alert.alert("خطأ", "تعذّر حذف المنتج، حاول مجدداً."); } finally { setBuyingProductId(null); } } }]); }}>
                            <View style={styles.deleteBtnInner}>{isLoadingP ? <ActivityIndicator size="small" color="#FFF" /> : <><Feather name="trash-2" size={14} color="#FFF" /><Text style={styles.deleteBtnText}>حذف المنتج</Text></>}</View>
                          </TouchableOpacity>
                        );
                        if (pendingOrderId) return (
                          <TouchableOpacity style={[styles.buyBtn, styles.cancelOrderBtn]} activeOpacity={0.85} disabled={isLoadingP} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("إلغاء طلب الشراء", "هل تريد إلغاء طلبك المعلق لهذا المنتج؟", [{ text: "تراجع", style: "cancel" }, { text: "إلغاء الطلب", style: "destructive", onPress: async () => { setBuyingProductId(product.id); try { await cancelProductOrder(pendingOrderId); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch { Alert.alert("خطأ", "تعذّر إلغاء الطلب، حاول مجدداً."); } finally { setBuyingProductId(null); } } }]); }}>
                            <View style={styles.cancelOrderBtnInner}>{isLoadingP ? <ActivityIndicator size="small" color="#FFF" /> : <><Feather name="x-circle" size={14} color="#FFF" /><Text style={styles.cancelOrderBtnText}>إلغاء الطلب</Text></>}</View>
                          </TouchableOpacity>
                        );
                        return (
                          <TouchableOpacity style={[styles.buyBtn, isLoadingP && styles.btnDisabled]} activeOpacity={0.85} disabled={isLoadingP} onPress={async () => { const user = auth.currentUser; if (!user) { router.replace("/login" as any); return; } const selfProfile = await getUserProfile(user.uid); Alert.alert("تأكيد الشراء", `هل تريد إرسال طلب شراء لـ "${product.title}"؟\n\nسيتلقى البائع بياناتك ويتواصل معك.`, [{ text: "إلغاء", style: "cancel" }, { text: "إرسال الطلب", onPress: async () => { setBuyingProductId(product.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); try { await createProductOrder({ productId: product.id, productTitle: product.title, productImageUrl: product.imageUrl, productPrice: product.price, sellerId: product.sellerId, sellerName: product.sellerName, buyerId: user.uid, buyerName: selfProfile?.name || userName, buyerPhone: selfProfile?.phone || "", buyerLocation: userLocation }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert("تم الإرسال ✓", "تم إرسال طلب الشراء للبائع، سيتواصل معك قريباً."); } catch { Alert.alert("خطأ", "حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مجدداً."); } finally { setBuyingProductId(null); } } }]); }}>
                            <LinearGradient colors={[C.accent, C.accentLight]} style={styles.buyBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                              {isLoadingP ? <ActivityIndicator size="small" color={C.primary} /> : <><Ionicons name="cart-outline" size={14} color={C.primary} /><Text style={styles.buyBtnText}>شراء</Text></>}
                            </LinearGradient>
                          </TouchableOpacity>
                        );
                      })()}
                    </View>
                  );
                }}
                ListEmptyComponent={
                  productsLoading ? (
                    <View style={styles.emptyState}>
                      <ActivityIndicator size="large" color={C.accent} />
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <Ionicons name="pricetag-outline" size={52} color={C.textMuted} />
                      <Text style={styles.emptyTitle}>لا توجد منتجات حالياً</Text>
                      <Text style={styles.emptySubtitle}>كن أول من ينشر منتجاً في السوق!</Text>
                    </View>
                  )
                }
              />
            ) : (
              /* ══ ARTISANS VIEW (specialty categories) ══ */
              <FlatList
                data={filteredArtisans}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 20 }]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
                showsVerticalScrollIndicator={false}
                renderItem={({ item, index }) => (
                  <ArtisanCard artisan={item} userLocation={userLocation} index={index} />
                )}
                ListHeaderComponent={
                  filteredArtisans.length > 0 && userLocation ? (
                    <View style={styles.listHeader}>
                      <View style={styles.sortedBadge}>
                        <Feather name="navigation" size={11} color={C.accent} />
                        <Text style={styles.sortedText}>مرتب حسب القرب</Text>
                      </View>
                    </View>
                  ) : null
                }
                ListEmptyComponent={
                  loading ? (
                    <View style={styles.emptyState}>
                      <Feather name="loader" size={36} color={C.textMuted} />
                      <Text style={styles.emptySubtitle}>جارٍ التحميل...</Text>
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <Feather name="users" size={48} color={C.textMuted} />
                      <Text style={styles.emptyTitle}>لا يوجد أصحاب اختصاص في هذا القسم حالياً</Text>
                      <Text style={styles.emptySubtitle}>جرّب قسماً آخر أو عُد لاحقاً</Text>
                    </View>
                  )
                }
              />
            )}
          </View>

      {/* ── Fullscreen image viewer ── */}
      <Modal
        visible={!!fullscreenImage}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullscreenImage(null)}
      >
        <Pressable style={styles.fullscreenOverlay} onPress={() => setFullscreenImage(null)}>
          {fullscreenImage && (
            <Image
              source={{ uri: fullscreenImage }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity style={styles.fullscreenClose} onPress={() => setFullscreenImage(null)}>
            <Feather name="x" size={22} color="#FFF" />
          </TouchableOpacity>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: C.background,
    ...(Platform.OS === "web" ? ({ height: "100vh", overflow: "hidden" } as any) : null),
  },
  stickyBar: { backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: C.border },
  listWrapper: { flex: 1, minHeight: 0 },
  headerGrad: { paddingBottom: 16, paddingHorizontal: 20, gap: 14 },
  headerActions: {
    flexDirection: "row-reverse", justifyContent: "space-between",
    alignItems: "flex-start", gap: 4,
  },
  headerIconCol: { alignItems: "center", gap: 4, maxWidth: 64 },
  headerIconLabel: {
    fontSize: 10, fontFamily: "Cairo_600SemiBold",
    color: "rgba(255,255,255,0.85)", textAlign: "center",
  },
  featuredBadgeRow: {
    flexDirection: "row", justifyContent: "flex-end", marginTop: 2,
  },
  featuredBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#C9A84C", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: "flex-end",
  },
  featuredBadgeText: { fontSize: 10, fontFamily: "Cairo_700Bold", color: "#0D1B3E" },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  // ── Header utility row: promote + search ──
  headerUtilRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 10, gap: 10,
  },
  promoteHeaderBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(201,168,76,0.15)", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: "rgba(201,168,76,0.35)",
    flex: 1,
  },
  promoteHeaderBtnText: {
    fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.accent,
  },
  searchCircleBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  categoryTabsWrapper: { backgroundColor: "#FFF", maxHeight: 54 },
  categoryTabs: {
    paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: "row",
  },
  catTab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, backgroundColor: C.background,
    borderWidth: 1.5, borderColor: "transparent",
  },
  catTabActive: {
    backgroundColor: C.accent, borderColor: C.accent,
  },
  catTabText: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  catTabTextActive: { color: C.primary },
  specialtyFilterWrapper: { backgroundColor: "#FFF", maxHeight: 46, borderBottomWidth: 1, borderBottomColor: C.border },
  specialtyFilters: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: "row" },
  specFilter: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14,
    backgroundColor: C.background, borderWidth: 1, borderColor: C.border,
  },
  specFilterActive: { backgroundColor: "rgba(13,27,62,0.08)", borderColor: C.primary },
  specFilterText: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textSecondary },
  specFilterTextActive: { color: C.primary, fontFamily: "Cairo_600SemiBold" },
  listContent: { padding: 16, gap: 12 },
  listHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 4,
  },
  listCount: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  sortedBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(201,168,76,0.1)", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  sortedText: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.accent },
  artisanCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  cardLeft: { position: "relative" },
  artisanPhoto: { width: 58, height: 58, borderRadius: 14 },
  artisanInitials: {
    width: 58, height: 58, borderRadius: 14,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  initialsText: { fontSize: 20, fontFamily: "Cairo_700Bold", color: C.accent },
  availDot: {
    position: "absolute", bottom: 2, right: 2,
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: C.card,
  },
  availOnline: { backgroundColor: "#22C55E" },
  availOffline: { backgroundColor: "#9CA3AF" },
  cardBody: { flex: 1, gap: 4 },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  artisanName: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text, flex: 1, textAlign: "right" },
  specialtyBadge: {
    backgroundColor: "rgba(13,27,62,0.07)", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  specialtyText: { fontSize: 11, fontFamily: "Cairo_600SemiBold", color: C.primary },
  cardMidRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "flex-end" },
  ratingText: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.text },
  reviewCount: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted },
  artisanBio: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "right" },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  distancePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(201,168,76,0.1)", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  distanceText: { fontSize: 11, fontFamily: "Cairo_600SemiBold", color: C.accent },
  availText: { fontSize: 11, fontFamily: "Cairo_400Regular" },
  availOnlineText: { color: "#22C55E" },
  availOfflineText: { color: C.textMuted },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Cairo_700Bold", color: C.text },
  emptySubtitle: { fontSize: 14, fontFamily: "Cairo_400Regular", color: C.textSecondary },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "#EF4444",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#0D1B3E",
    zIndex: 10,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
    lineHeight: 11,
  },
  btnDisabled: { opacity: 0.6 },

  // ── Floating add-product button ──
  floatingAddBtn: {
    position: "absolute",
    top: 10,
    left: 15,
    zIndex: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFF8EC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.accent,
    paddingVertical: 6,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingAddBtnText: {
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
    color: C.accent,
  },

  // ── Products bar ──
  productsBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: C.background,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  productsBarTitle: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text },
  productsBtnsGroup: { flexDirection: "row", gap: 8, alignItems: "center" },
  ordersBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(201,168,76,0.1)", borderRadius: 10,
    paddingHorizontal: 11, paddingVertical: 6,
    borderWidth: 1, borderColor: "rgba(201,168,76,0.3)",
  },
  ordersBtnText: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.accent },
  addProductBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: C.primary, borderRadius: 10,
    paddingHorizontal: 11, paddingVertical: 6,
  },
  addProductBtnText: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: "#FFF" },

  // ── Product cards ──
  productsContent: { paddingTop: 12 },
  productCard: {
    marginHorizontal: 12, marginBottom: 14,
    backgroundColor: C.card, borderRadius: 16, overflow: "hidden",
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10, shadowRadius: 10, elevation: 4,
  },
  productCardSold: { opacity: 0.7 },
  productImage: { width: "100%", height: 210 },
  soldOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  soldOverlayText: { fontSize: 18, fontFamily: "Cairo_700Bold", color: "#FFF" },
  productBody: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, gap: 6 },
  // Header row: title (right) ↔ seller name (left)
  productHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  productTitle: {
    flex: 1, fontSize: 16, fontFamily: "Cairo_700Bold",
    color: C.text, textAlign: "right",
  },
  productSellerTouchable: {
    flexDirection: "column", alignItems: "flex-start", gap: 3, flexShrink: 0,
  },
  productSellerName: {
    fontSize: 16, fontFamily: "Cairo_700Bold",
    color: C.accent, textAlign: "left",
  },
  productPrice: { fontSize: 18, fontFamily: "Cairo_700Bold", color: C.accent, textAlign: "right" },
  productPriceLabel: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  productCurrency: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.accent },
  productDesc: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "right" },
  productFeaturedBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: C.accent, borderRadius: 7,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  productFeaturedText: { fontSize: 10, fontFamily: "Cairo_700Bold", color: C.primary },
  buyBtn: { marginHorizontal: 14, marginTop: 10, marginBottom: 14, borderRadius: 12, overflow: "hidden" },
  buyBtnGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 13, gap: 6,
  },
  buyBtnText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.primary },

  // Delete button (seller view)
  deleteBtn: { backgroundColor: "transparent" },
  deleteBtnInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 13, gap: 6,
    backgroundColor: "#EF4444", borderRadius: 12,
  },
  deleteBtnText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: "#FFF" },

  // Cancel-order button (buyer with pending order)
  cancelOrderBtn: { backgroundColor: "transparent" },
  cancelOrderBtnInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 13, gap: 6,
    backgroundColor: "#F59E0B", borderRadius: 12,
  },
  cancelOrderBtnText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: "#FFF" },

  // ── Fullscreen viewer ──
  fullscreenOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center", justifyContent: "center",
  },
  fullscreenImage: { width: "100%", height: "80%" },
  fullscreenClose: {
    position: "absolute", top: 52, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
});

