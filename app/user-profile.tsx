/**
 * user-profile.tsx
 * Lightweight public-profile viewer for client accounts.
 * Accessible from ChatRoom when the other participant has no artisan record.
 * Shows: name, photo, bio, contact. No "طلب خدمة", no portfolio, no ratings.
 */
import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, Image, Linking, Platform,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, FontAwesome } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { auth } from "../lib/firebase";
import { getUserProfile, buildChatId } from "../lib/db_logic";
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
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  useEffect(() => {
    if (!userId) return;
    getUserProfile(userId).then((p) => {
      if (p) setProfile({ name: p.name, phone: p.phone, bio: p.bio, photoUri: p.photoUri });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

  const displayName = profile?.name || nameProp || "مستخدم";
  const photoUri = profile?.photoUri || (userPhoto || undefined);
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

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

  return (
    <View style={styles.root}>
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
              <Text style={styles.roleTag}>زبون</Text>
            </>
          )}
        </View>
      </LinearGradient>

      {!loading && (
        <>
          {/* Action buttons */}
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

          {/* Bio */}
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
  nav: { flexDirection: "row", marginBottom: 16 },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  heroContent: { alignItems: "center", gap: 8 },
  photo: { width: 90, height: 90, borderRadius: 22, borderWidth: 2.5, borderColor: "rgba(255,255,255,0.25)" },
  initials: {
    width: 90, height: 90, borderRadius: 22,
    backgroundColor: "rgba(201,168,76,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  initialsText: { fontSize: 32, fontFamily: "Cairo_700Bold", color: C.accent },
  name: { fontSize: 22, fontFamily: "Cairo_700Bold", color: "#FFF", textAlign: "center" },
  roleTag: {
    backgroundColor: "rgba(201,168,76,0.2)", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 4,
    fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.accent,
  },
  actionRow: {
    flexDirection: "row-reverse", gap: 10, paddingHorizontal: 20, paddingBottom: 16,
  },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 12, borderRadius: 14,
  },
  callBtn: { backgroundColor: "#22C55E" },
  waBtn: { backgroundColor: "#25D366" },
  chatBtn: { backgroundColor: C.primary },
  actionBtnText: { fontSize: 14, fontFamily: "Cairo_700Bold", color: "#FFF" },
  section: { margin: 16, backgroundColor: C.card, borderRadius: 14, padding: 14 },
  sectionTitle: { fontSize: 13, fontFamily: "Cairo_700Bold", color: C.primary, textAlign: "right", marginBottom: 8 },
  bioText: { fontSize: 14, fontFamily: "Cairo_400Regular", color: C.text, textAlign: "right", lineHeight: 22 },
});
