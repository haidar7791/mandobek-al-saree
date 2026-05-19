import React, { useState, useCallback, useEffect } from "react";
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
import { Feather, Ionicons } from "@expo/vector-icons";
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
  getSpecialtyLabel,
  isFeaturedActive,
} from "../lib/db_logic";
import { signOut } from "firebase/auth";
import Colors from "@/constants/colors";
import {
  registerForPushNotifications,
  addNotificationTapListener,
} from "../lib/push_notifications";

const C = Colors.light;

const BOTTOM_NAV_HEIGHT = 64;

type CategoryTab = "all" | ServiceCategory;

const CATEGORY_TABS: { key: CategoryTab; label: string; icon: string }[] = [
  { key: "all", label: "الكل", icon: "grid" },
  { key: "home", label: "خدمات المنزل", icon: "home" },
  { key: "car", label: "خدمات السيارات", icon: "truck" },
  { key: "general", label: "خدمات عامة", icon: "tool" },
];

const SPECIALTY_FILTERS: Record<CategoryTab, { key: string; label: string; icon: string }[]> = {
  all: [],
  home: HOME_SERVICES,
  car: CAR_SERVICES,
  general: GENERAL_SERVICES,
};

// ── Bottom Navigation Bar ───────────────────────────────────────────────────
function BottomNavBar({
  bottomInset,
  userRole,
}: {
  bottomInset: number;
  userRole: "client" | "artisan" | "admin";
}) {
  const navItems = [
    { icon: "user", label: "البروفايل", route: "/profile" },
    { icon: "credit-card", label: "المحفظة", route: "/wallet" },
    { icon: "message-circle", label: "المراسلات", route: "/messages" },
    { icon: "calendar", label: "الحجوزات", route: "/reservations" },
  ];

  return (
    <View style={[navStyles.container, { paddingBottom: Math.max(bottomInset, 8) }]}>
      <LinearGradient
        colors={["rgba(255,255,255,0.98)", "#ffffff"]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={navStyles.inner}>
        {navItems.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={navStyles.item}
            activeOpacity={0.7}
            onPress={() => {
              Haptics.selectionAsync();
              router.push(item.route as any);
            }}
          >
            <View style={navStyles.iconWrap}>
              <Feather name={item.icon as any} size={22} color={C.primary} />
            </View>
            <Text style={navStyles.label}>{item.label}</Text>
          </TouchableOpacity>
        ))}
        {userRole === "admin" && (
          <TouchableOpacity
            style={navStyles.item}
            activeOpacity={0.7}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/admin-dashboard" as any);
            }}
          >
            <View style={navStyles.iconWrap}>
              <Feather name="shield" size={22} color={C.accent} />
            </View>
            <Text style={[navStyles.label, { color: C.accent }]}>الإدارة</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Star Rating ─────────────────────────────────────────────────────────────
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

// ── Compact Featured Card ───────────────────────────────────────────────────
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
      style={featStyles.card}
      activeOpacity={0.82}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({ pathname: "/artisan-profile", params: { artisanId: artisan.id } });
      }}
    >
      {/* Avatar */}
      <View style={featStyles.avatarWrap}>
        {artisan.photoUri ? (
          <Image source={{ uri: artisan.photoUri }} style={featStyles.avatar} />
        ) : (
          <LinearGradient colors={[C.primary, "#1E2F60"]} style={featStyles.avatarGrad}>
            <Text style={featStyles.avatarInitials}>{initials}</Text>
          </LinearGradient>
        )}
        {/* Promo dot */}
        <View style={featStyles.promoDot} />
      </View>

      {/* Info */}
      <View style={featStyles.info}>
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
              <Text style={featStyles.separator}>·</Text>
              <Feather name="map-pin" size={9} color={C.accent} />
              <Text style={featStyles.distText}>
                {distance < 1
                  ? `${Math.round(distance * 1000)} م`
                  : `${distance.toFixed(1)} كم`}
              </Text>
            </>
          )}
        </View>
      </View>

      <Feather name="chevron-left" size={14} color={C.textMuted} />
    </TouchableOpacity>
  );
}

// ── Artisan List Card ───────────────────────────────────────────────────────
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
          router.push({ pathname: "/artisan-profile", params: { artisanId: artisan.id } });
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
            <Text style={styles.artisanBio} numberOfLines={2}>{artisan.bio}</Text>
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

// ── Main Screen ─────────────────────────────────────────────────────────────
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

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    registerForPushNotifications(user.uid).catch(() => {});

    const sub = addNotificationTapListener((data) => {
      if (data?.type === "chat" && data?.chatId && data?.senderName) {
        router.push({ pathname: "/chat", params: { chatId: data.chatId, otherName: data.senderName } });
      } else if (data?.type === "serviceRequest") {
        router.push("/messages" as any);
      }
    });
    return () => sub.remove();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const filteredArtisans = React.useMemo(() => {
    let result = [...artisans];
    if (activeCategory !== "all") result = result.filter((a) => a.category === activeCategory);
    if (activeSpecialty !== "all") result = result.filter((a) => a.specialty === activeSpecialty);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (a) => a.name.toLowerCase().includes(q) || getSpecialtyLabel(a.specialty).includes(q)
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
      {/* ── Slim Header ── */}
      <LinearGradient
        colors={["#0D1B3E", "#162452"]}
        style={[styles.headerGrad, { paddingTop: topPad }]}
      >
        {/* Top bar: customer service (left) | logo (center) | location (right) */}
        <View style={styles.headerTopRow}>
          {/* Right: location */}
          <View style={styles.locationRow}>
            <Feather name="map-pin" size={12} color={C.accent} />
            <Text style={styles.locationText}>
              {userLocation ? "موقعك الحالي" : "الموقع غير متاح"}
            </Text>
          </View>

          {/* Center: logo */}
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>ForUs</Text>
          </View>

          {/* Left: customer service */}
          <TouchableOpacity
            style={styles.supportBtn}
            activeOpacity={0.75}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/support" as any);
            }}
          >
            <Feather name="headphones" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Search bar */}
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

      {/* ── أفضل مقدمي الخدمة ── */}
      {promotedArtisans.length > 0 && (
        <View style={featStyles.section}>
          <View style={featStyles.sectionHeader}>
            <View style={featStyles.sectionBadge}>
              <Ionicons name="star" size={11} color={C.primary} />
              <Text style={featStyles.sectionBadgeText}>ترويج</Text>
            </View>
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

      {/* ── Category + Specialty Tabs ── */}
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

      {/* ── Artisan List ── */}
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
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPad + BOTTOM_NAV_HEIGHT + 16 },
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <ArtisanCard artisan={item} userLocation={userLocation} index={index} />
          )}
          ListHeaderComponent={
            filteredArtisans.length > 0 ? (
              <View style={styles.listHeader}>
                <Text style={styles.listCount}>{`${filteredArtisans.length} صاحب اختصاص متاح`}</Text>
                {userLocation && (
                  <View style={styles.sortedBadge}>
                    <Feather name="navigation" size={11} color={C.accent} />
                    <Text style={styles.sortedText}>مرتب حسب القرب</Text>
                  </View>
                )}
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

      {/* ── Bottom Navigation Bar ── */}
      <BottomNavBar bottomInset={bottomPad} userRole={userRole} />
    </View>
  );
}

// ── Bottom Nav Styles ────────────────────────────────────────────────────────
const navStyles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: "#FFF",
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
  },
  inner: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingTop: 10,
    paddingHorizontal: 8,
    height: BOTTOM_NAV_HEIGHT,
  },
  item: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    flex: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(13,27,62,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 10,
    fontFamily: "Cairo_600SemiBold",
    color: C.primary,
    textAlign: "center",
  },
});

// ── Featured Card Styles ─────────────────────────────────────────────────────
const featStyles = StyleSheet.create({
  section: {
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.background,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 14, fontFamily: "Cairo_700Bold", color: C.text },
  sectionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  sectionBadgeText: { fontSize: 10, fontFamily: "Cairo_700Bold", color: C.primary },
  scrollRow: { paddingHorizontal: 14, gap: 10, paddingBottom: 4 },

  /* Compact horizontal card */
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: 210,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },

  /* Avatar */
  avatarWrap: { position: "relative" },
  avatar: { width: 44, height: 44, borderRadius: 12 },
  avatarGrad: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.accent },
  promoDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.accent,
    borderWidth: 2,
    borderColor: C.card,
  },

  /* Text info */
  info: { flex: 1, gap: 3, alignItems: "flex-end" },
  name: { fontSize: 13, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  specialtyBadge: {
    backgroundColor: "rgba(13,27,62,0.08)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  specialtyText: { fontSize: 10, fontFamily: "Cairo_600SemiBold", color: C.primary },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    justifyContent: "flex-end",
  },
  ratingText: { fontSize: 11, fontFamily: "Cairo_700Bold", color: "#F59E0B" },
  separator: { fontSize: 11, color: C.textMuted },
  distText: { fontSize: 11, fontFamily: "Cairo_600SemiBold", color: C.accent },
});

// ── Main Styles ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
    ...(Platform.OS === "web" ? ({ height: "100vh", overflow: "hidden" } as any) : null),
  },
  stickyBar: { backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: C.border },
  listWrapper: { flex: 1, minHeight: 0 },

  /* Slim header */
  headerGrad: {
    paddingBottom: 14,
    paddingHorizontal: 18,
    gap: 12,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: {
    fontSize: 12,
    fontFamily: "Cairo_600SemiBold",
    color: "rgba(255,255,255,0.85)",
  },
  logoMark: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoMarkText: { fontSize: 17, fontFamily: "Cairo_700Bold", color: C.accent },
  supportBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  /* Search */
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Cairo_400Regular",
    color: C.text,
    padding: 0,
  },

  /* Category tabs */
  categoryTabsWrapper: { backgroundColor: "#FFF", maxHeight: 54 },
  categoryTabs: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: "row" },
  catTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: C.background,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  catTabActive: { backgroundColor: C.accent, borderColor: C.accent },
  catTabText: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  catTabTextActive: { color: C.primary },

  /* Specialty filters */
  specialtyFilterWrapper: {
    backgroundColor: "#FFF",
    maxHeight: 46,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  specialtyFilters: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: "row" },
  specFilter: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
  },
  specFilterActive: { backgroundColor: "rgba(13,27,62,0.08)", borderColor: C.primary },
  specFilterText: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textSecondary },
  specFilterTextActive: { color: C.primary, fontFamily: "Cairo_600SemiBold" },

  /* List */
  listContent: { padding: 16, gap: 12 },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  listCount: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  sortedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(201,168,76,0.1)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sortedText: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.accent },

  /* Artisan card */
  artisanCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardLeft: { position: "relative" },
  artisanPhoto: { width: 58, height: 58, borderRadius: 14 },
  artisanInitials: {
    width: 58,
    height: 58,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initialsText: { fontSize: 20, fontFamily: "Cairo_700Bold", color: C.accent },
  availDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.card,
  },
  availOnline: { backgroundColor: "#22C55E" },
  availOffline: { backgroundColor: "#9CA3AF" },
  cardBody: { flex: 1, gap: 4 },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  artisanName: {
    fontSize: 15,
    fontFamily: "Cairo_700Bold",
    color: C.text,
    flex: 1,
    textAlign: "right",
  },
  specialtyBadge: {
    backgroundColor: "rgba(13,27,62,0.07)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  specialtyText: { fontSize: 11, fontFamily: "Cairo_600SemiBold", color: C.primary },
  cardMidRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "flex-end",
  },
  ratingText: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.text },
  reviewCount: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted },
  artisanBio: {
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    color: C.textSecondary,
    textAlign: "right",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  distancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(201,168,76,0.1)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  distanceText: { fontSize: 11, fontFamily: "Cairo_600SemiBold", color: C.accent },
  availText: { fontSize: 11, fontFamily: "Cairo_400Regular" },
  availOnlineText: { color: "#22C55E" },
  availOfflineText: { color: C.textMuted },

  /* Empty / loading states */
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Cairo_700Bold", color: C.text },
  emptySubtitle: { fontSize: 14, fontFamily: "Cairo_400Regular", color: C.textSecondary },

  /* Promote banner */
  promoteBanner: {
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 4,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.3)",
  },
  promoteBannerGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  promoteIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(201,168,76,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  promoteTitle: {
    fontSize: 13,
    fontFamily: "Cairo_700Bold",
    color: Colors.light.text,
    textAlign: "right",
  },
  promoteSub: {
    fontSize: 11,
    fontFamily: "Cairo_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "right",
  },

  /* Featured badge on artisan list cards */
  featuredBadgeRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 2 },
  featuredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#C9A84C",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-end",
  },
  featuredBadgeText: { fontSize: 10, fontFamily: "Cairo_700Bold", color: "#0D1B3E" },
});
