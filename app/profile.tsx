import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getBalance, getUserProfile, setUserProfile } from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

interface UserProfile {
  name: string;
  phone: string;
  photoUri: string | null;
}

function InputField({
  label,
  placeholder,
  value,
  onChangeText,
  icon,
  keyboardType = "default",
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  icon: React.ReactNode;
  keyboardType?: "default" | "phone-pad" | "email-address";
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputRow, focused && styles.inputFocused]}>
        <View style={styles.inputIcon}>{icon}</View>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          textAlign="right"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCapitalize="none"
        />
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [currentUser, setCurrentUser] = useState("");
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [saving, setSaving] = useState(false);

  const ADMIN_UID = "JBtQBKkpMvOT58abx2wZqOtxNwU2";

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad =
    Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        const user = auth.currentUser;
        if (!user) {
          router.replace("/");
          return;
        }
        const uid = user.uid;
        setUid(uid);
        const displayId = user.email?.replace("@sanad.app", "") || uid;
        setCurrentUser(displayId);

        const profile = await getUserProfile(uid);
        if (profile) {
          setName(profile.name || "");
          setPhone(profile.phone || "");
          setPhotoUri(profile.photoUri || null);
        } else {
          setName(displayId);
        }

        const bal = await getBalance(uid);
        setBalance(bal);
      };
      load();
    }, [])
  );

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("إذن مرفوض", "يرجى السماح بالوصول إلى مكتبة الصور");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("إذن مرفوض", "يرجى السماح بالوصول إلى الكاميرا");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleChangePhoto = () => {
    Alert.alert("تغيير الصورة الشخصية", "اختر مصدر الصورة", [
      { text: "إلغاء", style: "cancel" },
      { text: "التقاط صورة", onPress: handleTakePhoto },
      { text: "من المعرض", onPress: handlePickImage },
    ]);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("خطأ", "يرجى إدخال الاسم");
      return;
    }
    setSaving(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("not authenticated");
      await setUserProfile(uid, {
        name: name.trim(),
        phone: phone.trim(),
        photoUri,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("تم الحفظ", "تم حفظ بياناتك بنجاح");
    } catch {
      Alert.alert("خطأ", "حدث خطأ أثناء حفظ البيانات");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "تسجيل الخروج",
      "هل أنت متأكد من رغبتك في تسجيل الخروج؟",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "تسجيل الخروج",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await signOut(auth);
            router.replace("/");
          },
        },
      ]
    );
  };

  const btnScale = useSharedValue(1);
  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={styles.header}>
        <View style={[styles.headerContent, { paddingTop: topPad + 10 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-right" size={22} color="rgba(255,255,255,0.8)" />
          </Pressable>
          <Text style={styles.headerTitle}>الملف الشخصي</Text>
          <View style={styles.headerIcon}>
            <Ionicons name="person-circle" size={24} color={C.accent} />
          </View>
        </View>

        <View style={styles.avatarSection}>
          <Pressable style={styles.avatarWrap} onPress={handleChangePhoto}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarImg} />
            ) : (
              <LinearGradient
                colors={["#1E2F60", "#0D1B3E"]}
                style={styles.avatarPlaceholder}
              >
                <Ionicons name="person" size={44} color={C.accent} />
              </LinearGradient>
            )}
            <View style={styles.cameraBtn}>
              <LinearGradient
                colors={[C.accent, C.accentLight]}
                style={styles.cameraBtnGrad}
              >
                <Feather name="camera" size={14} color={C.primary} />
              </LinearGradient>
            </View>
          </Pressable>

          <Text style={styles.displayName}>{name || currentUser}</Text>
          <Text style={styles.displayContact}>{currentUser}</Text>

          <View style={styles.balancePill}>
            <MaterialCommunityIcons name="wallet" size={14} color={C.accent} />
            <Text style={styles.balancePillText}>
              {balance.toLocaleString("ar-IQ")} د.ع
            </Text>
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.formContent,
            { paddingBottom: bottomPad + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.cardTitle}>البيانات الشخصية</Text>

            <InputField
              label="الاسم الكامل"
              placeholder="أدخل اسمك الكامل"
              value={name}
              onChangeText={setName}
              icon={<Feather name="user" size={17} color={C.textSecondary} />}
            />

            <InputField
              label="رقم الهاتف"
              placeholder="07xxxxxxxx"
              value={phone}
              onChangeText={setPhone}
              icon={<Feather name="phone" size={17} color={C.textSecondary} />}
              keyboardType="phone-pad"
            />

            <Animated.View style={btnAnimStyle}>
              <Pressable
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
                onPressIn={() => {
                  btnScale.value = withSpring(0.97);
                }}
                onPressOut={() => {
                  btnScale.value = withSpring(1);
                }}
              >
                <LinearGradient
                  colors={[C.accent, C.accentLight]}
                  style={styles.saveBtnGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {saving ? (
                    <Text style={styles.saveBtnText}>جارٍ الحفظ...</Text>
                  ) : (
                    <>
                      <Text style={styles.saveBtnText}>حفظ التغييرات</Text>
                      <Feather name="check" size={18} color={C.primary} />
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </Animated.View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>إعدادات الحساب</Text>

            <Pressable style={styles.settingsRow} onPress={() => router.push("/dashboard")}>
              <Feather name="chevron-left" size={18} color={C.textMuted} />
              <View style={styles.settingsRowText}>
                <Text style={styles.settingsRowLabel}>الرئيسية</Text>
                <Text style={styles.settingsRowSub}>عرض الحرفيين القريبين</Text>
              </View>
              <View style={[styles.settingsRowIcon, { backgroundColor: "rgba(59,130,246,0.1)" }]}>
                <Feather name="home" size={18} color="#3B82F6" />
              </View>
            </Pressable>

            <View style={styles.divider} />

            <Pressable
              style={styles.settingsRow}
              onPress={handleChangePhoto}
            >
              <Feather name="chevron-left" size={18} color={C.textMuted} />
              <View style={styles.settingsRowText}>
                <Text style={styles.settingsRowLabel}>تغيير الصورة الشخصية</Text>
                <Text style={styles.settingsRowSub}>من الكاميرا أو المعرض</Text>
              </View>
              <View style={[styles.settingsRowIcon, { backgroundColor: "rgba(201,168,76,0.1)" }]}>
                <Feather name="camera" size={18} color={C.accent} />
              </View>
            </Pressable>
          </View>

          {uid === ADMIN_UID && (
            <Pressable
              style={styles.adminBtn}
              onPress={() => router.push("/admin")}
            >
              <View style={styles.adminIcon}>
                <Ionicons name="shield-checkmark" size={20} color="#fff" />
              </View>
              <Text style={styles.adminText}>لوحة تحكم المشرف</Text>
              <Feather name="chevron-left" size={16} color="rgba(255,255,255,0.6)" />
            </Pressable>
          )}

          <Pressable style={styles.logoutBtn} onPress={handleLogout}>
            <View style={styles.logoutIcon}>
              <Feather name="log-out" size={20} color={C.danger} />
            </View>
            <Text style={styles.logoutText}>تسجيل الخروج</Text>
            <Feather name="chevron-left" size={16} color={C.danger} style={{ opacity: 0.5 }} />
          </Pressable>

          <Text style={styles.versionNote}>سند • خدمات المنزل والسيارة</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: { paddingBottom: 28 },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
    textAlign: "center",
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(201,168,76,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSection: {
    alignItems: "center",
    gap: 8,
  },
  avatarWrap: {
    width: 100,
    height: 100,
    borderRadius: 28,
    position: "relative",
    marginBottom: 4,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  avatarImg: {
    width: 100,
    height: 100,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: C.accent,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(201,168,76,0.4)",
  },
  cameraBtn: {
    position: "absolute",
    bottom: -4,
    left: -4,
    width: 30,
    height: 30,
    borderRadius: 9,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#0D1B3E",
  },
  cameraBtnGrad: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  displayName: {
    fontSize: 18,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
    textAlign: "center",
  },
  displayContact: {
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
  },
  balancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(201,168,76,0.15)",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.25)",
    marginTop: 4,
  },
  balancePillText: {
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
    color: C.accent,
  },
  formContent: {
    paddingHorizontal: 18,
    paddingTop: 20,
    gap: 14,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 18,
    gap: 16,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Cairo_700Bold",
    color: C.textSecondary,
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldWrap: { gap: 6 },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
    color: C.text,
    textAlign: "right",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.inputBg,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingHorizontal: 14,
    gap: 10,
  },
  inputFocused: { borderColor: C.accent, backgroundColor: "#FFF" },
  inputIcon: { width: 28, alignItems: "center" },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Cairo_400Regular",
    color: C.text,
    paddingVertical: 13,
    textAlign: "right",
  },
  saveBtn: { borderRadius: 13, overflow: "hidden", marginTop: 4 },
  saveBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: "Cairo_700Bold",
    color: C.primary,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingsRowIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsRowText: { flex: 1, alignItems: "flex-end" },
  settingsRowLabel: {
    fontSize: 14,
    fontFamily: "Cairo_600SemiBold",
    color: C.text,
    textAlign: "right",
  },
  settingsRowSub: {
    fontSize: 11,
    fontFamily: "Cairo_400Regular",
    color: C.textSecondary,
    textAlign: "right",
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 2,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: `${C.danger}25`,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  logoutIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: C.dangerLight,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Cairo_600SemiBold",
    color: C.danger,
    textAlign: "right",
  },
  adminBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#162452",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.35)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  adminIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  adminText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Cairo_600SemiBold",
    color: "#fff",
    textAlign: "right",
  },
  versionNote: {
    fontSize: 11,
    fontFamily: "Cairo_400Regular",
    color: C.textMuted,
    textAlign: "center",
    marginTop: 4,
  },
});
