import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Modal,
  Alert,
  Linking,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { ShareModal } from "@/components/ShareModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, FontAwesome } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { auth } from "../lib/firebase";
import {
  getArtisanById,
  createServiceRequest,
  getUserProfile,
  getProfileEngagementCounts,
  calcDistanceKm,
  buildChatId,
  getSpecialtyLabel,
  getIsFollowing,
  followArtisan,
  unfollowArtisan,
  getIsLiked,
  likeArtisan,
  unlikeArtisan,
  normalizeProfilePosts,
  type ArtisanProfile,
  type GeoLocation,
  type ProfilePost,
} from "../lib/db_logic";
import PublicProfileTabs from "@/components/PublicProfileTabs";
import Colors from "@/constants/colors";
import { createActivityNotification } from "../lib/notifications";

const C = Colors.light;

function parsePassedArtisan(raw?: string): ArtisanProfile | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as ArtisanProfile; } catch { return null; }
}

export default function ArtisanProfileScreen() {
  const insets = useSafeAreaInsets();
  const { artisanId, artisan: artisanParam } = useLocalSearchParams<{
    artisanId: string;
    artisan?: string;
  }>();

  const initialArtisan = useMemo(() => parsePassedArtisan(artisanParam), [artisanParam]);

  const [artisan, setArtisan] = useState<ArtisanProfile | null>(initialArtisan);
  const [profilePosts, setProfilePosts] = useState<ProfilePost[]>([]);
  const [userLocation, setUserLocation] = useState<GeoLocation | null>(null);
  const [userName, setUserName] = useState("مستخدم");
  const [loading, setLoading] = useState(!initialArtisan);
  const [shareVisible, setShareVisible] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followCount, setFollowCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [bookingModal, setBookingModal] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const loadData = useCallback(async () => {
    if (!artisanId) return;
    try {
      const user = auth.currentUser;
      if (user) {
        const profile = await getUserProfile(user.uid);
        if (profile) setUserName(profile.name || "مستخدم");
        if (profile?.location) setUserLocation(profile.location);
      }

      // Best-effort GPS
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch { /* GPS unavailable */ }

      const artisanData = await getArtisanById(artisanId);
      if (artisanData) {
        // Canonical routing: client accounts always use /user-profile so the
        // public profile looks identical regardless of where it was opened.
        if (artisanData.specialty === "client") {
          router.replace({
            pathname: "/user-profile",
            params: {
              userId: artisanData.userId,
              userName: artisanData.name,
              userPhoto: artisanData.photoUri || "",
            },
          } as any);
          return;
        }
        setArtisan(artisanData);
        const [artisanProfile, engagement] = await Promise.all([
          getUserProfile(artisanData.userId),
          getProfileEngagementCounts(artisanData.userId),
        ]);
        setProfilePosts(normalizeProfilePosts(artisanProfile));
        setFollowCount(engagement.followCount);
        setLikesCount(engagement.likesCount);
      }
      const currentUser = auth.currentUser;
      if (currentUser && artisanData?.userId && currentUser.uid !== artisanData.userId) {
        const [following, liked] = await Promise.all([
          getIsFollowing(currentUser.uid, artisanData.userId),
          getIsLiked(currentUser.uid, artisanData.userId),
        ]);
        setIsFollowing(following);
        setIsLiked(liked);
      }
    } catch (err) {
      console.error("loadData error:", err);
    } finally {
      setLoading(false);
    }
  }, [artisanId]);

  useEffect(() => {
    if (initialArtisan?.specialty === "client") {
      router.replace({
        pathname: "/user-profile",
        params: {
          userId: initialArtisan.userId,
          userName: initialArtisan.name,
          userPhoto: initialArtisan.photoUri || "",
        },
      } as any);
    }
  }, [initialArtisan]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleChat = () => {
    const user = auth.currentUser;
    if (!user || !artisan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const chatId = buildChatId(user.uid, artisan.userId);
    router.push({
      pathname: "/chat",
      params: { chatId, otherName: artisan.name, otherArtisan: JSON.stringify(artisan) },
    });
  };

  const handleBooking = async () => {
    const user = auth.currentUser;
    if (!user || !artisan) return;
    if (user.uid === artisan.userId) {
      Alert.alert("غير مسموح", "لا يمكنك إرسال طلب خدمة لنفسك");
      setBookingModal(false);
      return;
    }
    setBookingLoading(true);
    try {
      const userProfile = await getUserProfile(user.uid);
      await createServiceRequest({
        clientId: user.uid,
        clientName: userName,
        clientPhone: userProfile?.phone || "",
        artisanId: artisan.id,
        artisanName: artisan.name,
        specialty: artisan.specialty,
        problemDescription: "",
        clientLocation: userLocation,
        clientAddress: "",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBookingModal(false);
      Alert.alert("تم الإرسال ✓", "تم إرسال طلب خدمتك لصاحب الاختصاص، سيتواصل معك قريباً");
    } catch {
      Alert.alert("خطأ", "حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مجدداً");
    } finally {
      setBookingLoading(false);
    }
  };

  const handleOpenMap = () => {
    if (!artisan?.location) {
      Alert.alert("تنبيه", "لا يوجد موقع محدد لصاحب الاختصاص");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { lat, lng } = artisan.location;
    const url = userLocation
      ? `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${lat},${lng}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url);
  };

  const handleToggleFollow = async () => {
    const user = auth.currentUser;
    if (!user || !artisan?.userId) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await unfollowArtisan(user.uid, artisan.userId);
      } else {
        await followArtisan(user.uid, artisan.userId);
      }
      const [following, engagement] = await Promise.all([
        getIsFollowing(user.uid, artisan.userId),
        getProfileEngagementCounts(artisan.userId),
      ]);
      setIsFollowing(following);
      setFollowCount(engagement.followCount);
      Haptics.selectionAsync();
    } catch {
      Alert.alert("خطأ", "تعذّرت عملية المتابعة، حاول مجدداً");
    } finally {
      setFollowLoading(false);
    }
  };

  const handleToggleLike = async () => {
    const user = auth.currentUser;
    if (!user || !artisan?.userId) return;
    setLikeLoading(true);
    try {
      if (isLiked) {
        await unlikeArtisan(user.uid, artisan.userId);
      } else {
        await likeArtisan(user.uid, artisan.userId);
      }
      const [liked, engagement] = await Promise.all([
        getIsLiked(user.uid, artisan.userId),
        getProfileEngagementCounts(artisan.userId),
      ]);
      setIsLiked(liked);
      setLikesCount(engagement.likesCount);
      Haptics.selectionAsync();
    } catch {
      Alert.alert("خطأ", "تعذّرت عملية الإعجاب، حاول مجدداً");
    } finally {
      setLikeLoading(false);
    }
  };

  const distance =
    userLocation && artisan?.location
      ? calcDistanceKm(userLocation, artisan.location)
      : null;

  if (loading || !artisan) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  const initials = artisan.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const isOwnProfile = auth.currentUser?.uid === artisan.userId;
  const isClientProfile = artisan.specialty === "client";

  const distanceLabel = distance !== null
    ? (distance < 1 ? `${Math.round(distance * 1000)} م` : `${distance.toFixed(1)} كم`)
    : "—";

  return (
    <View style={[styles.root, { paddingBottom: bottomPad }]}>
      {/* ─────────────── HERO (gradient) ─────────────── */}
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={[styles.hero, { paddingTop: topPad + 6 }]}>
        {/* Public profile share button — replaces the visible back button. */}
        <Pressable style={styles.topShareBtn} onPress={() => setShareVisible(true)} hitSlop={8}>
          <Feather name="share-2" size={19} color={C.accent} />
        </Pressable>

        {/* Photo — centered */}
        <View style={styles.photoWrap}>
          {artisan.photoUri ? (
            <Image source={{ uri: artisan.photoUri }} style={styles.photo} />
          ) : (
            <View style={styles.photoFallback}>
              <Text style={styles.photoInitials}>{initials}</Text>
            </View>
          )}
          <View style={[styles.availDot, artisan.isAvailable ? styles.dotOnline : styles.dotOffline]} />
        </View>

        {/* Name */}
        <Text style={styles.heroName}>{artisan.name}</Text>

        {/* Specialty */}
        <View style={styles.specialtyPill}>
          <Text style={styles.specialtyPillText}>{getSpecialtyLabel(artisan.specialty)}</Text>
        </View>

        {/* Bio — no title */}
        {artisan.bio ? (
          <Text style={styles.heroBio} numberOfLines={3}>{artisan.bio}</Text>
        ) : null}

        {/* Stats row: followers | likes | distance */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{followCount}</Text>
            <Text style={styles.statLabel}>متابع</Text>
          </View>
          <View style={styles.statDiv} />
          <Pressable
            style={styles.statItem}
            onPress={!isOwnProfile ? handleToggleLike : undefined}
            disabled={likeLoading || isOwnProfile}
          >
            <FontAwesome
              name={isLiked ? "heart" : "heart-o"}
              size={16}
              color={isLiked ? "#EF4444" : "rgba(255,255,255,0.75)"}
            />
            <Text style={styles.statVal}>{likesCount}</Text>
            <Text style={styles.statLabel}>إعجاب</Text>
          </Pressable>
          <View style={styles.statDiv} />
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{distanceLabel}</Text>
            <Text style={styles.statLabel}>البُعد</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ─────────────── ACTION ROWS ─────────────── */}

      {/* Row 1: Follow + Chat + Map (3 equal buttons) */}
      {!isOwnProfile && (
        <View style={styles.actionRow}>
          {/* Follow */}
          {!isClientProfile && (
            <Pressable
              style={[styles.actionBtn, isFollowing ? styles.followingBtn : styles.followBtn]}
              onPress={handleToggleFollow}
              disabled={followLoading}
            >
              {followLoading ? (
                <ActivityIndicator size="small" color={isFollowing ? C.accent : "#FFF"} />
              ) : (
                <>
                  <Feather
                    name={isFollowing ? "user-check" : "user-plus"}
                    size={16}
                    color={isFollowing ? C.accent : "#FFF"}
                  />
                  <Text style={[styles.actionBtnText, isFollowing && { color: C.accent }]}>
                    {isFollowing ? "مُتابَع" : "متابعة"}
                  </Text>
                </>
              )}
            </Pressable>
          )}

          {/* Chat */}
          <Pressable style={[styles.actionBtn, styles.chatBtn]} onPress={handleChat}>
            <Feather name="message-circle" size={16} color="#FFF" />
            <Text style={styles.actionBtnText}>دردشة</Text>
          </Pressable>

          {/* Map */}
          <Pressable style={[styles.actionBtn, styles.mapBtn]} onPress={handleOpenMap}>
            <Feather name="map-pin" size={16} color={C.accent} />
            <Text style={styles.mapBtnText}>الخريطة</Text>
          </Pressable>

        </View>
      )}

      {/* Row 2: Book service — full width */}
      {!isClientProfile && !isOwnProfile && (
        <View style={styles.bookRow}>
          <Pressable style={styles.bookBtn} onPress={() => setBookingModal(true)}>
            <LinearGradient
              colors={[C.accent, C.accentLight]}
              style={styles.bookBtnGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.bookBtnText}>طلب الخدمة الآن</Text>
              <Feather name="arrow-left" size={16} color={C.primary} />
            </LinearGradient>
          </Pressable>
        </View>
      )}

      {/* ─────────────── SCROLLABLE BODY ─────────────── */}
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <PublicProfileTabs
          userId={artisan.userId}
          posts={profilePosts}
          onContentLiked={async () => {
            const engagement = await getProfileEngagementCounts(artisan.userId);
            setLikesCount(engagement.likesCount);
          }}
        />
      </ScrollView>

      {/* ─────────────── BOOKING MODAL ─────────────── */}
      <Modal visible={bookingModal} transparent animationType="fade" onRequestClose={() => setBookingModal(false)}>
        <View style={modalStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !bookingLoading && setBookingModal(false)} />
          <View style={modalStyles.card}>
            <View style={modalStyles.iconCircle}>
              <Feather name="calendar" size={28} color={C.accent} />
            </View>
            <Text style={modalStyles.cardTitle}>تأكيد طلب الخدمة</Text>
            <Text style={modalStyles.cardMsg}>
              هل تريد تأكيد طلب الخدمة من{"\n"}
              <Text style={{ fontFamily: "Cairo_700Bold", color: C.accent }}>{artisan.name}</Text>؟
            </Text>
            {userLocation && (
              <View style={modalStyles.locationNote}>
                <Feather name="map-pin" size={13} color={C.accent} />
                <Text style={modalStyles.locationNoteText}>سيُرسل موقعك الجغرافي تلقائياً</Text>
              </View>
            )}
            <View style={modalStyles.actions}>
              <Pressable
                style={[modalStyles.cancelBtn, bookingLoading && { opacity: 0.5 }]}
                onPress={() => setBookingModal(false)}
                disabled={bookingLoading}
              >
                <Text style={modalStyles.cancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                style={[modalStyles.confirmBtn, bookingLoading && { opacity: 0.6 }]}
                onPress={handleBooking}
                disabled={bookingLoading}
              >
                <LinearGradient colors={[C.accent, C.accentLight]} style={modalStyles.confirmGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Text style={modalStyles.confirmText}>{bookingLoading ? "جارٍ الإرسال..." : "تأكيد"}</Text>
                  {!bookingLoading && <Feather name="check" size={16} color={C.primary} />}
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─────────────── SHARE MODAL ─────────────── */}
      <ShareModal
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        title={artisan.name}
        cardImage={artisan.photoUri ?? undefined}
        cardTitle={artisan.name}
        cardRoute={artisanId ? `/artisan-profile?artisanId=${artisanId}` : undefined}
        deepLinkPath={artisanId ? `profile/${artisanId}` : undefined}
        shareText={`👤 ${artisan.name} — ${artisan.specialty ? getSpecialtyLabel(artisan.specialty) : "متخصص"}\nملف شخصي على تطبيق فورس`}
        shareMessage={`👤 تعرّف على ${artisan.name}${artisan.specialty ? " (" + getSpecialtyLabel(artisan.specialty) + ")" : ""} على تطبيق فورس`}
        onShared={() => {
          const viewer = auth.currentUser;
          if (viewer && artisan.userId) {
            void createActivityNotification({
              recipientId: artisan.userId,
              actorId: viewer.uid,
              type: "share",
              title: "مشاركة ملفك",
              body: "تمت مشاركة ملفك الشخصي",
              entityId: artisan.userId,
              entityType: "profile",
            });
          }
        }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },

  // ── Hero gradient section ─────────────────────────────────────────────────
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: "center",
  },
  topShareBtn: {
    alignSelf: "flex-start",
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: "rgba(201,168,76,0.12)",
    borderWidth: 1, borderColor: "rgba(201,168,76,0.35)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
  },

  // Photo
  photoWrap: { position: "relative", marginBottom: 12 },
  photo: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: C.accent,
  },
  photoFallback: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: "rgba(201,168,76,0.2)",
    borderWidth: 3, borderColor: C.accent,
    alignItems: "center", justifyContent: "center",
  },
  photoInitials: { fontSize: 32, fontFamily: "Cairo_700Bold", color: C.accent },
  availDot: {
    position: "absolute", bottom: 3, right: 3,
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2.5, borderColor: "#162452",
  },
  dotOnline: { backgroundColor: "#22C55E" },
  dotOffline: { backgroundColor: "#9CA3AF" },

  // Name + specialty + bio
  heroName: { fontSize: 22, fontFamily: "Cairo_700Bold", color: "#FFF", textAlign: "center", marginBottom: 6 },
  specialtyPill: {
    backgroundColor: "rgba(201,168,76,0.2)", borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 4, marginBottom: 10,
  },
  specialtyPillText: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.accent },
  heroBio: {
    fontSize: 13, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.7)",
    textAlign: "center", lineHeight: 20, marginBottom: 16, paddingHorizontal: 8,
  },

  // Stats row
  statsRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16, paddingVertical: 10, paddingHorizontal: 6,
    width: "100%",
  },
  statItem: { flex: 1, alignItems: "center", gap: 3 },
  statVal: { fontSize: 15, fontFamily: "Cairo_700Bold", color: "#FFF" },
  statLabel: { fontSize: 10, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.6)" },
  statDiv: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.2)" },

  // ── Row 1: three equal buttons ─────────────────────────────────────────────
  actionRow: {
    flexDirection: "row", gap: 8,
    paddingHorizontal: 16, paddingTop: 14,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 13, borderRadius: 12,
  },
  actionBtnText: {
    fontSize: 13, fontFamily: "Cairo_700Bold", color: "#FFF",
    includeFontPadding: false,
  },

  // Chat — blue
  chatBtn: { backgroundColor: "#2563EB" },

  // Follow / Following
  followBtn: { backgroundColor: "#0F172A" },
  followingBtn: {
    backgroundColor: "rgba(201,168,76,0.1)",
    borderWidth: 1.5, borderColor: C.accent,
  },

  // Map — outlined gold
  mapBtn: {
    borderWidth: 1.5, borderColor: C.accent,
    backgroundColor: "rgba(201,168,76,0.06)",
  },
  shareBtn: { backgroundColor: "rgba(201,168,76,0.1)", borderWidth: 1, borderColor: "rgba(201,168,76,0.35)" },
  mapBtnText: { fontSize: 13, fontFamily: "Cairo_700Bold", color: C.accent, includeFontPadding: false },

  // ── Row 2: full-width book button ───────────────────────────────────────────
  bookRow: { paddingHorizontal: 16, paddingTop: 8 },
  bookBtn: { borderRadius: 12, overflow: "hidden" },
  bookBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 15, gap: 10,
  },
  bookBtnText: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.primary },

  // Scroll body
  scrollContent: { padding: 16, gap: 16 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  portfolioRow: { gap: 10, paddingVertical: 4 },
  portfolioImg: { width: 140, height: 140, borderRadius: 14, backgroundColor: C.inputBg },

  // Booking modal location note
  locationNote: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(201,168,76,0.08)", borderRadius: 10, padding: 10,
    width: "100%",
  },
  locationNoteText: {
    flex: 1, fontSize: 12, fontFamily: "Cairo_400Regular",
    color: C.textSecondary, textAlign: "right",
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center", alignItems: "center", paddingHorizontal: 24,
  },
  card: {
    width: "100%", backgroundColor: C.card, borderRadius: 22,
    padding: 24, gap: 14, alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 10,
  },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(201,168,76,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  cardTitle: { fontSize: 18, fontFamily: "Cairo_700Bold", color: C.text },
  cardMsg: {
    fontSize: 15, fontFamily: "Cairo_400Regular", color: C.textSecondary,
    textAlign: "center", lineHeight: 26,
  },
  locationNote: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(201,168,76,0.08)", borderRadius: 10, padding: 10,
    width: "100%",
  },
  locationNoteText: {
    flex: 1, fontSize: 12, fontFamily: "Cairo_400Regular",
    color: C.textSecondary, textAlign: "right",
  },
  actions: { flexDirection: "row", gap: 10, width: "100%", marginTop: 4 },
  cancelBtn: {
    flex: 1, borderRadius: 14, paddingVertical: 13,
    borderWidth: 1.5, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  cancelText: { fontSize: 15, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  confirmBtn: { flex: 1, borderRadius: 14, overflow: "hidden" },
  confirmGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 13, gap: 8,
  },
  confirmText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.primary },
});
