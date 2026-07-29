import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
  TextInput,
  Image,
  RefreshControl,
  ScrollView,
  Alert,
  TouchableOpacity,
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
  getPromotedArtisans,
  getUserProfile,
  calcDistanceKm,
  type ArtisanProfile,
  type ServiceCategory,
  type GeoLocation,
  HOME_SERVICES,
  CAR_SERVICES,
  GENERAL_SERVICES,
  DELIVERY_SERVICES,
  getSpecialtyLabel,
  isFeaturedActive,
  subscribeToUserChatLastAts,
  subscribeToClientServiceRequests,
} from "../lib/db_logic";
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
  { key: "all", label: "الكل", icon: "grid" },
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

function FeaturedCard({
  artisan,
  userLocation,
}: {
  artisan: ArtisanProfile;
  userLocation: GeoLocation | null;
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
    <TouchableOpacity
      activeOpacity={0.75}
      style={featStyles.card}
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
      {/* Avatar */}
      <View style={featStyles.avatarWrap}>
        {artisan.photoUri ? (
          <Image source={{ uri: artisan.photoUri }} style={featStyles.avatar} resizeMode="cover" />
        ) : (
          <View style={featStyles.avatarFallback}>
            <LinearGradient colors={[C.primary, "#1E2F60"]} style={StyleSheet.absoluteFill} />
            <Text style={featStyles.avatarInitials}>{initials}</Text>
          </View>
        )}
        <View style={[featStyles.availDot, artisan.isAvailable ? featStyles.availOnline : featStyles.availOffline]} />
      </View>

      {/* Details */}
      <View style={featStyles.body}>
        <Text style={featStyles.name} numberOfLines={1}>{artisan.name}</Text>

        <View style={featStyles.specialtyBadge}>
          <Text style={featStyles.specialtyText} numberOfLines={1}>
            {getSpecialtyLabel(artisan.specialty)}
          </Text>
        </View>

        <View style={featStyles.metaRow}>
          <Ionicons name="star" size={10} color="#F59E0B" />
          <Text style={featStyles.ratingText}>
            {artisan.rating > 0 ? artisan.rating.toFixed(1) : "جديد"}
          </Text>
          {distance !== null && (
            <>
              <Text style={featStyles.metaSep}>·</Text>
              <Feather name="map-pin" size={9} color={C.accent} />
              <Text style={featStyles.distText} numberOfLines={1}>
                {distance < 1
                  ? `${Math.round(distance * 1000)} م`
                  : `${distance.toFixed(1)} كم`}
              </Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
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
  const [promotedArtisans, setPromotedArtisans] = useState<ArtisanProfile[]>([]);
  const [userLocation, setUserLocation] = useState<GeoLocation | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryTab>("all");
  const [activeSpecialty, setActiveSpecialty] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState("المستخدم");
  const [userRole, setUserRole] = useState<"client" | "artisan" | "admin">("client");
  const [loading, setLoading] = useState(true);

  const [chatLastAts, setChatLastAts] = useState<string[]>([]);
  const [lastMsgSeen, setLastMsgSeen] = useState<string>("");
  const [pendingBookingCount, setPendingBookingCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const { profile: liveProfile, isPhoneOk, completionPercent } = useProfileCheck(userId);

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
      const [profile, allArtisans, promoted] = await Promise.all([
        getUserProfile(user.uid),
        getArtisans(),
        getPromotedArtisans(),
      ]);

      if (profile) {
        setUserName(profile.name || user.email?.split("@")[0] || "المستخدم");
        setUserRole(profile.role || "client");
        if (profile.location) setUserLocation(profile.location);
      }
      setUserId(user.uid);

      setArtisans(allArtisans);
      setPromotedArtisans(promoted);

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
        // New booking (artisan side) or a status change on an existing one
        // (client side) — both live on the reservations screen.
        router.push("/reservations" as any);
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
      result = result.filter((a) => a.category === activeCategory);
    }
    if (activeSpecialty !== "all") {
      result = result.filter((a) => a.specialty === activeSpecialty);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          getSpecialtyLabel(a.specialty).includes(q)
      );
    }

    if (userLocation) {
      result.sort((a, b) => {
        const da = a.location ? calcDistanceKm(userLocation, a.location) : Infinity;
        const db = b.location ? calcDistanceKm(userLocation, b.location) : Infinity;
        return da - db;
      });
    }

    return result;
  }, [artisans, activeCategory, activeSpecialty, search, userLocation]);

  const specialtyFilters = SPECIALTY_FILTERS[activeCategory];

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={[styles.headerGrad, { paddingTop: topPad }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.locationRow}>
            <Feather name="map-pin" size={12} color={C.accent} />
            <Text style={styles.locationText}>
              {userLocation ? "موقعك الحالي" : "الموقع غير متاح"}
            </Text>
          </View>
          {!isPhoneOk && (
            <View style={styles.phoneAlertWrap} pointerEvents="none">
              <Text style={styles.phoneAlertText} numberOfLines={1}>
                ⚠️ يرجى إضافة رقم هاتفك لتفعيل حسابك
              </Text>
            </View>
          )}
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>ForUs</Text>
          </View>
        </View>

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
              <Feather name="calendar" size={20} color="#FFF" />
              {pendingBookingCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {pendingBookingCount > 99 ? "99+" : pendingBookingCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.headerIconLabel}>الحجوزات</Text>
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
          <Pressable style={styles.headerIconCol} onPress={() => router.push("/wallet" as any)}>
            <View style={styles.headerIconBtn}>
              <Feather name="credit-card" size={20} color="#FFF" />
            </View>
            <Text style={styles.headerIconLabel}>المحفظة</Text>
          </Pressable>
          <View style={styles.headerIconCol}>
            <ProfileAvatar
              photoUri={liveProfile?.photoUri}
              name={userName}
              percent={completionPercent}
              size={36}
            />
            <Text style={styles.headerIconLabel} numberOfLines={1}>{userName}</Text>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Feather name="search" size={16} color={C.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="ابحث عن صاحب اختصاص أو خدمة..."
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Feather name="x" size={16} color={C.textMuted} />
            </Pressable>
          )}
        </View>
      </LinearGradient>

      {/* ── أفضل مقدمي الخدمة — directly under search bar ── */}
      {promotedArtisans.length > 0 && (
        <View style={featStyles.section}>
          <View style={featStyles.sectionHeader}>
            <Text style={featStyles.sectionTitle}>أفضل مقدمي الخدمة</Text>
          </View>
          <FlatList
            data={promotedArtisans}
            keyExtractor={(a) => a.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={featStyles.scrollRow}
            renderItem={({ item }) => (
              <FeaturedCard artisan={item} userLocation={userLocation} />
            )}
          />
        </View>
      )}

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

      <View style={styles.listWrapper}>
      {userRole === "artisan" && (
        <Pressable
          style={styles.promoteBanner}
          onPress={() => router.push("/promote" as any)}
        >
          <LinearGradient
            colors={["rgba(201,168,76,0.2)", "rgba(201,168,76,0.08)"]}
            style={styles.promoteBannerGrad}
          >
            <View style={styles.promoteIcon}>
              <Ionicons name="rocket" size={18} color={C.accent} />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={styles.promoteTitle}>روّج لحسابك واظهر في القمة</Text>
              <Text style={styles.promoteSub}>زبائن أكثر، طلبات أكثر</Text>
            </View>
            <Feather name="chevron-left" size={18} color={C.accent} />
          </LinearGradient>
        </Pressable>
      )}

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
      </View>
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
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  phoneAlertWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  phoneAlertText: {
    fontSize: 10.5,
    fontFamily: "Cairo_600SemiBold",
    color: "#FCD34D",
    textAlign: "center",
  },
  logoMark: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "rgba(201,168,76,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  logoMarkText: { fontSize: 18, fontFamily: "Cairo_700Bold", color: C.accent },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontSize: 11, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.6)" },
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
  promoteBanner: {
    marginHorizontal: 12, marginTop: 6, marginBottom: 4,
    borderRadius: 12, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(201,168,76,0.3)",
  },
  promoteBannerGrad: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  promoteIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(201,168,76,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  promoteTitle: { fontSize: 13, fontFamily: "Cairo_700Bold", color: Colors.light.text, textAlign: "right" },
  promoteSub: { fontSize: 11, fontFamily: "Cairo_400Regular", color: Colors.light.textSecondary, textAlign: "right" },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  searchBar: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#FFF", borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10, gap: 10,
  },
  searchInput: {
    flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular",
    color: C.text, padding: 0,
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
});

const featStyles = StyleSheet.create({
  section: {
    paddingTop: 10, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: C.border,
    backgroundColor: C.background,
  },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "flex-end",
    paddingHorizontal: 14, marginBottom: 8,
  },
  sectionTitle: { fontSize: 14, fontFamily: "Cairo_700Bold", color: C.text },
  scrollRow: { paddingHorizontal: 14, gap: 8, paddingBottom: 4 },
  /* Compact horizontal card */
  card: {
    width: 180,
    backgroundColor: C.card,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
    borderWidth: 1,
    borderColor: C.border,
  },
  /* Avatar */
  avatarWrap: { position: "relative" },
  avatar: { width: 44, height: 44, borderRadius: 10 },
  avatarFallback: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  avatarInitials: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.accent },
  availDot: {
    position: "absolute", bottom: 1, right: 1,
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 1.5, borderColor: C.card,
  },
  availOnline: { backgroundColor: "#22C55E" },
  availOffline: { backgroundColor: "#9CA3AF" },
  /* Body */
  body: { flex: 1, gap: 3, alignItems: "flex-end" },
  name: { fontSize: 12, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  specialtyBadge: {
    backgroundColor: "rgba(13,27,62,0.08)", borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  specialtyText: { fontSize: 10, fontFamily: "Cairo_600SemiBold", color: C.primary },
  metaRow: {
    flexDirection: "row", alignItems: "center", gap: 3,
    justifyContent: "flex-end",
  },
  ratingText: { fontSize: 10, fontFamily: "Cairo_700Bold", color: "#F59E0B" },
  metaSep: { fontSize: 10, color: C.textMuted },
  distText: { fontSize: 10, fontFamily: "Cairo_600SemiBold", color: C.accent },
});
