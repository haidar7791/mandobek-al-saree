import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { auth } from "@/lib/firebase";
import { getUserProfile, setUserProfile, uploadProfilePhoto } from "@/lib/db_logic";
import type { UserProfile } from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

export default function StoreManagerScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/");
      return;
    }
    try {
      const next = await getUserProfile(user.uid);
      if (next?.specialty !== "store") {
        router.replace("/profile" as any);
        return;
      }
      setProfile(next);
    } catch (error) {
      console.error("load store manager failed:", error);
      Alert.alert("تعذر تحميل المتجر", "تحقق من اتصالك ثم أعد المحاولة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const changeCover = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId || uploading) return;
    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("إذن الصور مطلوب", "اسمح بالوصول إلى الصور لاختيار غلاف المتجر.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 8],
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]) return;
    const previous = profile?.coverUri ?? null;
    setProfile((current) => current ? { ...current, coverUri: result.assets[0].uri } : current);
    setUploading(true);
    try {
      const url = await uploadProfilePhoto(userId, result.assets[0].uri);
      await setUserProfile(userId, { coverUri: url });
      setProfile((current) => current ? { ...current, coverUri: url } : current);
    } catch (error) {
      console.error("upload store cover failed:", error);
      setProfile((current) => current ? { ...current, coverUri: previous } : current);
      Alert.alert("تعذر رفع الغلاف", "لم يتم حفظ الصورة. تحقق من الاتصال ثم حاول مجدداً.");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <View style={S.center}><ActivityIndicator color={C.accent} /></View>;
  }

  return (
    <ScrollView style={S.root} contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
      <View style={[S.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={S.back}>
          <Feather name="arrow-right" size={22} color="#FFF" />
        </Pressable>
        <Text style={S.headerTitle}>إدارة المتجر</Text>
        <View style={{ width: 40 }} />
      </View>

      <Pressable style={S.cover} onPress={changeCover} accessibilityRole="button">
        {profile?.coverUri ? (
          <Image source={{ uri: profile.coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={S.coverEmpty}>
            <Feather name="image" size={30} color={C.accent} />
            <Text style={S.coverEmptyText}>أضف خلفية للمتجر</Text>
          </View>
        )}
        <View style={S.coverBadge}>
          {uploading ? <ActivityIndicator size="small" color="#FFF" /> : <Feather name="camera" size={16} color="#FFF" />}
          <Text style={S.coverBadgeText}>{uploading ? "جارٍ الرفع" : "تغيير الخلفية"}</Text>
        </View>
      </Pressable>

      <View style={S.identity}>
        {profile?.photoUri ? (
          <Image source={{ uri: profile.photoUri }} style={S.avatar} />
        ) : (
          <View style={[S.avatar, S.avatarEmpty]}><Feather name="shopping-bag" size={25} color={C.accent} /></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={S.storeName}>{profile?.name || "متجري"}</Text>
          <Text style={S.identityHint}>صورة حسابك الشخصية هي شعار المتجر</Text>
        </View>
      </View>

      <View style={S.actions}>
        <Pressable style={S.primaryAction} onPress={() => router.push("/add-product" as any)}>
          <Feather name="plus" size={18} color={C.primary} />
          <Text style={S.primaryActionText}>إضافة منتج</Text>
        </Pressable>
        <Pressable style={S.secondaryAction} onPress={() => router.push("/product-orders" as any)}>
          <Feather name="clipboard" size={17} color={C.accent} />
          <Text style={S.secondaryActionText}>طلبات المتجر</Text>
        </Pressable>
        <Pressable
          style={S.secondaryAction}
          onPress={() => router.push({ pathname: "/shop/[id]", params: { id: auth.currentUser?.uid || "" } } as any)}
        >
          <Feather name="eye" size={17} color={C.accent} />
          <Text style={S.secondaryActionText}>عرض واجهة المتجر</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.background },
  header: { backgroundColor: "#0D1B3E", paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,.1)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFF", fontSize: 18, fontWeight: "700" },
  cover: { margin: 16, height: 190, borderRadius: 18, overflow: "hidden", backgroundColor: "#182754" },
  coverEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  coverEmptyText: { color: "#FFF", fontWeight: "600" },
  coverBadge: { position: "absolute", left: 12, bottom: 12, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(8,15,33,.78)", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
  coverBadgeText: { color: "#FFF", fontSize: 12, fontWeight: "600" },
  identity: { marginHorizontal: 18, marginBottom: 22, flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 66, height: 66, borderRadius: 33, borderWidth: 2, borderColor: C.accent, backgroundColor: "#FFF" },
  avatarEmpty: { alignItems: "center", justifyContent: "center" },
  storeName: { color: C.text, fontSize: 18, fontWeight: "700", textAlign: "right" },
  identityHint: { color: C.textSecondary, fontSize: 12, marginTop: 5, textAlign: "right" },
  actions: { paddingHorizontal: 18, gap: 11 },
  primaryAction: { minHeight: 52, borderRadius: 14, backgroundColor: C.accent, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  primaryActionText: { color: C.primary, fontSize: 15, fontWeight: "700" },
  secondaryAction: { minHeight: 50, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  secondaryActionText: { color: C.text, fontSize: 14, fontWeight: "600" },
});
