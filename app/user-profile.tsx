/**
 * user-profile.tsx
 * Public-profile viewer for client / admin accounts.
 * Accessible from ChatRoom when the other participant has no artisan record.
 * Shows: name, photo, bio, contact buttons, map + distance (when location available).
 * "طلب خدمة" is intentionally absent — clients offer no service.
 */
import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, Image, Platform,
  ActivityIndicator, ScrollView,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, FontAwesome } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { auth } from "../lib/firebase";
import {
  getUserProfile,
  getProfileEngagementCounts,
  getArtisanByUserId,
  buildChatId,
  calcDistanceKm,
  normalizeProfilePosts,
  getIsFollowing,
  followArtisan,
  unfollowArtisan,
  getIsLiked,
  likeArtisan,
  unlikeArtisan,
  type GeoLocation,
  type ProfilePost,
} from "../lib/db_logic";
import ProfilePostFeed from "@/components/ProfilePostFeed";
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
    name: string; bio?: string; photoUri?: string;
    location?: GeoLocation | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [profilePosts, setProfilePosts] = useState<ProfilePost[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followCount, setFollowCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
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
            bio: p.bio ?? undefined,
            photoUri: p.photoUri ?? undefined,
            location: p.location ?? null,
          });
          setProfilePosts(normalizeProfilePosts(p));
          const engagement = await getProfileEngagementCounts(userId);
          if (cancelled) return;
          setFollowCount(engagement.followCount);
          setLikesCount(engagement.likesCount);

          const viewer = auth.currentUser;
          if (viewer && viewer.uid !== userId) {
            const [following, liked] = await Promise.all([
              getIsFollowing(viewer.uid, userId),
              getIsLiked(viewer.uid, userId),
            ]);
            if (cancelled) return;
            setIsFollowing(following);
            setIsLiked(liked);
          }
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

  // Request GPS for the viewer so the stats bar can show distance.
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
  const isOwnProfile = auth.currentUser?.uid === userId;
  // A chat can occasionally point to a legacy/system participant with no
  // corresponding user document. Keep chat available, but never write
  // follow/like data to a profile that does not exist.
  const canFollowProfile = Boolean(profile) && !isOwnProfile;

  const handleChat = () => {
    const me = auth.currentUser;
    if (!me || !userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const chatId = buildChatId(me.uid, userId);
    router.push({ pathname: "/chat", params: { chatId, otherName: displayName } });
  };

  const handleToggleFollow = async () => {
    const viewer = auth.currentUser;
    if (!viewer || !userId || viewer.uid === userId) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await unfollowArtisan(viewer.uid, userId);
      } else {
        await followArtisan(viewer.uid, userId);
      }
      const [following, engagement] = await Promise.all([
        getIsFollowing(viewer.uid, userId),
        getProfileEngagementCounts(userId),
      ]);
      setIsFollowing(following);
      setFollowCount(engagement.followCount);
      Haptics.selectionAsync();
    } catch (err) {
      console.error("user profile follow toggle failed:", err);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleToggleLike = async () => {
    const viewer = auth.currentUser;
    if (!viewer || !userId || viewer.uid === userId) return;
    setLikeLoading(true);
    try {
      if (isLiked) {
        await unlikeArtisan(viewer.uid, userId);
      } else {
        await likeArtisan(viewer.uid, userId);
      }
      const [liked, engagement] = await Promise.all([
        getIsLiked(viewer.uid, userId),
        getProfileEngagementCounts(userId),
      ]);
      setIsLiked(liked);
      setLikesCount(engagement.likesCount);
      Haptics.selectionAsync();
    } catch (err) {
      console.error("user profile like toggle failed:", err);
    } finally {
      setLikeLoading(false);
    }
  };

  // While resolving an artisan redirect, show nothing to avoid flash
  if (loading && resolvedRole === null) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingBottom: bottomPad }]}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={[styles.hero, { paddingTop: topPad + 8 }]}>
        <View style={styles.nav}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="chevron-right" size={22} color="#FFF" />
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
              {profile?.bio ? (
                <Text style={styles.heroBio} numberOfLines={3}>{profile.bio}</Text>
              ) : null}
            </>
          )}
          {!loading && (
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statVal}>{followCount}</Text>
                <Text style={styles.statLabel}>متابع</Text>
              </View>
              <View style={styles.statDiv} />
              <Pressable
                style={styles.statItem}
                onPress={canFollowProfile ? handleToggleLike : undefined}
                disabled={likeLoading || !canFollowProfile}
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
                <Text style={styles.statVal}>
                  {distance === null
                    ? "—"
                    : distance < 1
                      ? `${Math.round(distance * 1000)} م`
                      : `${distance.toFixed(1)} كم`}
                </Text>
                <Text style={styles.statLabel}>البُعد</Text>
              </View>
            </View>
          )}
        </View>
      </LinearGradient>

      {!loading && (
        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={{ paddingBottom: bottomPad + 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Action buttons ── */}
          {!isOwnProfile && (
            <View style={[styles.actionRow, { paddingTop: 14 }]}>
              {canFollowProfile && (
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
              <Pressable style={[styles.actionBtn, styles.chatBtn]} onPress={handleChat}>
                <Feather name="message-circle" size={16} color="#FFF" />
                <Text style={styles.actionBtnText}>دردشة</Text>
              </Pressable>
            </View>
          )}

          {/* ── Persistent profile posts ── */}
          {profilePosts.length > 0 && (
            <View style={styles.postsSection}>
              <ProfilePostFeed posts={profilePosts} />
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  bodyScroll: { flex: 1 },
  hero: { paddingHorizontal: 16, paddingBottom: 20 },
  nav: { alignSelf: "flex-start", marginBottom: 12 },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  heroContent: { alignItems: "center" },
  photo: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: C.accent,
  },
  initials: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: "rgba(201,168,76,0.2)",
    borderWidth: 3, borderColor: C.accent,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  initialsText: { fontSize: 32, fontFamily: "Cairo_700Bold", color: C.accent },
  name: {
    fontSize: 22, fontFamily: "Cairo_700Bold", color: "#FFF",
    textAlign: "center", marginTop: 12, marginBottom: 6,
  },
  heroBio: {
    fontSize: 13, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.7)",
    textAlign: "center", lineHeight: 20, marginBottom: 16, paddingHorizontal: 8,
  },
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
  actionRow: {
    flexDirection: "row", gap: 8, paddingHorizontal: 16,
  },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 13, borderRadius: 12,
  },
  actionBtnText: { fontSize: 13, fontFamily: "Cairo_700Bold", color: "#FFF", includeFontPadding: false },
  chatBtn: { backgroundColor: "#2563EB" },
  followBtn: { backgroundColor: "#0F172A" },
  followingBtn: {
    backgroundColor: "rgba(201,168,76,0.1)",
    borderWidth: 1.5, borderColor: C.accent,
  },
  postsSection: { marginHorizontal: 16, marginTop: 16, marginBottom: 16 },
});
