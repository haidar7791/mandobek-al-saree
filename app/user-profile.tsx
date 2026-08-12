/**
 * user-profile.tsx
 * Public-profile viewer for client / admin accounts.
 * Accessible from ChatRoom when the other participant has no artisan record.
 * Shows: name, photo, bio, contact buttons, map + distance (when location available).
 * "طلب خدمة" is intentionally absent — clients offer no service.
 */
import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, Image, Linking, Platform,
  ActivityIndicator, Alert, Share,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ShareModal } from "@/components/ShareModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, FontAwesome } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { auth } from "../lib/firebase";
import {
  getUserProfile,
  getArtisanByUserId,
  buildChatId,
  calcDistanceKm,
  type GeoLocation,
} from "../lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

export default function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const { userId, userName: nameProp, userPhoto } = useLocalSearchParams<{
    userId: string;
    userName?: string;
    userPhoto?: string;
  }>();

  const [profile, setProfile] = useState<{
    name: string; phone?: string; bio?: string; photoUri?: string;
    location?: GeoLocation | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareVisible, setShareVisible] = useState(false);
  // null = still resolving, "client" | "admin" = stay here, "artisan" = redirected
  const [resolvedRole, setResolvedRole] = useState<"client" | "artisan" | "admin" | null>(null);

  // Viewer's GPS location (to compute distance + enable directions)
  const [viewerLocation, setViewerLocation] = useState<GeoLocation | null>(null);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await getUserProfile(userId);
        if (cancelled) return;

        if (p?.role === "artisan") {
          // Hand off to artisan-profile for a richer view
          const artisan = await getArtisanByUserId(userId);
          if (cancelled) return;
          if (artisan) {
            router.replace({
              pathname: "/artisan-profile",
              params: { artisanId: artisan.id, artisan: JSON.stringify(artisan) },
            } as any);
            return;
          }
        }

        if (p) {
          setProfile({
            name: p.name,
            phone: p.phone ?? undefined,
            bio: p.bio ?? undefined,
            photoUri: p.photoUri ?? undefined,
            location: p.location ?? null,
          });
        }
        setResolvedRole(p?.role === "admin" ? "admin" : "client");
      } catch {
        setResolvedRole("client");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Request GPS for the viewer (to show distance + directions)
  useEffect(() => {
    (async () => {
      try {
        // First try saved profile location
        const me = auth.currentUser;
        if (me) {
          const myProfile = await getUserProfile(me.uid);
          if (myProfile?.location) {
            setViewerLocation(myProfile.location);
          }
        }
        // Then try live GPS (more accurate, overwrites profile location)
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setViewerLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch {
        // GPS unavailable — silently skip
      }
    })();
  }, []);

  const displayName = profile?.name || nameProp || "مستخدم";
  const photoUri = profile?.photoUri || userPhoto || undefined;
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  // Distance between viewer and this user's saved location
  const distance =
    viewerLocation && profile?.location
      ? calcDistanceKm(viewerLocation, profile.location)
      : null;

  const handleCall = () => {
    if (!profile?.phone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${profile.phone}`);
  };

  const handleWhatsApp = () => {
    if (!profile?.phone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const phone = profile.phone.replace(/^0/, "964").replace(/\s+/g, "");
    Linking.openURL(`https://wa.me/${phone}`);
  };

  const handleChat = () => {
    const me = auth.currentUser;
    if (!me || !userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const chatId = buildChatId(me.uid, userId);
    router.push({ pathname: "/chat", params: { chatId, otherName: displayName } });
  };

  const handleOpenMap = () => {
    if (!profile?.location) {
      Alert.alert("تنبيه", "لا يوجد موقع محدد لهذا المستخدم");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { lat, lng } = profile.location;
    const url = viewerLocation
      ? `https://www.google.com/maps/dir/?api=1&origin=${viewerLocation.lat},${viewerLocation.lng}&destination=${lat},${lng}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url);
  };

  // While resolving an artisan redirect, show nothing to avoid flash
  if (loading && resolvedRole === null) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  const roleLabel = resolvedRole === "admin" ? "مدير" : "زبون";

  return (
    <View style={[styles.root, { paddingBottom: bottomPad }]}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={[styles.hero, { paddingTop: topPad + 8 }]}>
        <View style={styles.nav}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="chevron-right" size={22} color="#FFF" />
          </Pressable>
          <Pressable style={styles.shareNavBtn} onPress={() => setShareVisible(true)}>
            <Feather name="share-2" size={15} color={C.accent} />
            <Text style={styles.shareNavBtnText}>مشاركة</Text>
          </Pressable>
        </View>
        <View style={styles.heroContent}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <View style={styles.initials}>
              <Text style={styles.initialsText}>{initials}</Text>
            </View>
          )}
          {loading ? (
            <ActivityIndicator color={C.accent} style={{ marginTop: 12 }} />
          ) : (
            <>
              <Text style={styles.name}>{displayName}</Text>
              <View style={styles.roleTagRow}>
                <Text style={styles.roleTag}>{roleLabel}</Text>
                {distance !== null && (
                  <View style={styles.distancePill}>
                    <Feather name="navigation" size={11} color={C.accent} />
                    <Text style={styles.distanceText}>
                      {distance < 1
                        ? `${Math.round(distance * 1000)} م`
                        : `${distance.toFixed(1)} كم`}
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      </LinearGradient>

      {/* ── Share modal ── */}
      <ShareModal
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        title={displayName}
        cardImage={photoUri}
        cardTitle={displayName}
        cardRoute={`/user-profile?userId=${userId}`}
        deepLinkPath={`user/${userId}`}
        shareText={`👤 ${displayName} — ${roleLabel}\nملف شخصي على تطبيق فورس`}
        shareMessage={`👤 تعرّف على ${displayName} على تطبيق فورس`}
      />

      {!loading && (
        <>
          {/* ── Action buttons ── */}
          <View style={[styles.actionRow, { paddingTop: 16 }]}>
            {profile?.phone ? (
              <Pressable style={[styles.actionBtn, styles.callBtn]} onPress={handleCall}>
                <Feather name="phone" size={20} color="#FFF" />
                <Text style={styles.actionBtnText}>اتصال</Text>
              </Pressable>
            ) : null}
            {profile?.phone ? (
              <Pressable style={[styles.actionBtn, styles.waBtn]} onPress={handleWhatsApp}>
                <FontAwesome name="whatsapp" size={20} color="#FFF" />
                <Text style={styles.actionBtnText}>واتساب</Text>
              </Pressable>
            ) : null}
            {auth.currentUser?.uid !== userId && (
              <Pressable style={[styles.actionBtn, styles.chatBtn]} onPress={handleChat}>
                <Feather name="message-circle" size={20} color="#FFF" />
                <Text style={styles.actionBtnText}>مراسلة</Text>
              </Pressable>
            )}
          </View>

          {/* ── Map button (shown whenever location exists or as fallback) ── */}
          <Pressable style={styles.mapBtn} onPress={handleOpenMap}>
            <Feather name="map-pin" size={18} color={C.accent} />
            <Text style={styles.mapBtnText}>عرض على الخريطة</Text>
          </Pressable>

          {/* ── Bio ── */}
          {profile?.bio ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>نبذة</Text>
              <Text style={styles.bioText}>{profile.bio}</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  hero: { paddingHorizontal: 20, paddingBottom: 28 },
  nav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  shareNavBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 10,
    paddingVertical: 7, paddingHorizontal: 12,
  },
  shareNavBtnText: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.accent },
  heroContent: { alignItems: "center", gap: 8 },
  photo: {
    width: 90, height: 90, borderRadius: 22,
    borderWidth: 2.5, borderColor: "rgba(255,255,255,0.25)",
  },
  initials: {
    width: 90, height: 90, borderRadius: 22,
    backgroundColor: "rgba(201,168,76,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  initialsText: { fontSize: 32, fontFamily: "Cairo_700Bold", color: C.accent },
  name: { fontSize: 22, fontFamily: "Cairo_700Bold", color: "#FFF", textAlign: "center" },

  roleTagRow: {
    flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center",
  },
  roleTag: {
    backgroundColor: "rgba(201,168,76,0.2)", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 4,
    fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.accent,
  },
  distancePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
  },
  distanceText: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.accent },

  actionRow: {
    flexDirection: "row-reverse", gap: 10, paddingHorizontal: 20, paddingBottom: 12,
  },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderRadius: 14, paddingVertical: 12,
  },
  actionBtnText: { fontSize: 13, fontFamily: "Cairo_700Bold", color: "#FFF" },
  callBtn: { backgroundColor: "#22C55E" },
  waBtn: { backgroundColor: "#25D366" },
  chatBtn: { backgroundColor: C.primary },

  mapBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: C.card,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  mapBtnText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.accent },

  section: { marginHorizontal: 20, marginBottom: 16 },
  sectionTitle: {
    fontSize: 14, fontFamily: "Cairo_700Bold", color: C.text,
    textAlign: "right", marginBottom: 6,
  },
  bioText: {
    fontSize: 14, fontFamily: "Cairo_400Regular", color: C.textSecondary,
    textAlign: "right", lineHeight: 22,
  },
});
