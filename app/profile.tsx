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
  Modal,
  ActivityIndicator,
  Dimensions,
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
import Constants from "expo-constants";
import { auth } from "@/lib/firebase";
import { performSignOut } from "@/lib/push_notifications";
import {
  getBalance,
  getUserProfile,
  setUserProfile,
  addPortfolioImage,
  removePortfolioImage,
  uploadPortfolioImage,
  uploadProfilePhoto,
  updateArtisanPhotoIfExists,
  createOrUpdateArtisan,
  getCategoryForSpecialty,
  ALL_SPECIALTIES,
} from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;
const SCREEN_W = Dimensions.get("window").width;
// Portfolio images are full-width with a 4:3 aspect ratio
const PORTFOLIO_IMG_H = Math.round((SCREEN_W - 18 * 2) * 0.75);

// ─── Backend URL helpers (same logic as register.tsx) ────────────────────────
const CLOUD_RUN_BASE = "https://forus-backend-laoeoqcoza-ew.a.run.app/";
const REPLIT_BACKEND_HOST =
  "7ad1563a-fd03-4049-b8e0-44592245fa3b-00-124n16ica1aqg.pike.replit.dev";

function getServerUrl(): string {
  const explicitUrl = process.env.EXPO_PUBLIC_SERVER_URL;
  if (
    typeof explicitUrl === "string" &&
    explicitUrl.startsWith("https://") &&
    !explicitUrl.includes("localhost") &&
    !explicitUrl.includes("127.0.0.1")
  ) {
    return explicitUrl.endsWith("/") ? explicitUrl : explicitUrl + "/";
  }
  function withPort5000(raw: string): string {
    const noProto = raw.replace(/^https?:\/\//, "");
    const noPort = noProto.replace(/:\d+\/?$/, "").replace(/\/$/, "");
    if (noPort.endsWith(".run.app")) return `https://${noPort}/`;
    return `https://${noPort}:5000/`;
  }
  const bakedDomain: unknown = (Constants.expoConfig as any)?.extra?.replitDomain;
  if (typeof bakedDomain === "string" && bakedDomain.length > 0) {
    return withPort5000(bakedDomain);
  }
  const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (typeof envDomain === "string" && envDomain.length > 0) {
    return withPort5000(envDomain);
  }
  if (typeof window !== "undefined" && window.location?.hostname) {
    const h = window.location.hostname;
    if (h !== "localhost" && h !== "127.0.0.1") return withPort5000(h);
  }
  return withPort5000(REPLIT_BACKEND_HOST);
}

const IRAQI_PHONE_REGEX = /^07\d{9}$/;

// ─── Component ────────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  // ── Profile state ──────────────────────────────────────────────────────────
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [role, setRole] = useState<"client" | "artisan" | "admin">("client");
  const [specialty, setSpecialty] = useState("");
  const [bio, setBio] = useState("");
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);
  const [uploadingPortfolio, setUploadingPortfolio] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // ── Edit modal state ───────────────────────────────────────────────────────
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editPhone, setEditPhone] = useState("");
  // OTP sub-modal (opens after WhatsApp OTP is sent)
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [phoneVerifiedInSession, setPhoneVerifiedInSession] = useState(false);
  const [saving, setSaving] = useState(false);

  const ADMIN_UID = "JBtQBKkpMvOT58abx2wZqOtxNwU2";
  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad =
    Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const specialtyLabel =
    specialty === "client"
      ? "زبون"
      : ALL_SPECIALTIES.find((s) => s.key === specialty)?.label || specialty || "";

  // ── Load profile on screen focus ───────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        const user = auth.currentUser;
        if (!user) { router.replace("/"); return; }
        setUid(user.uid);
        const profile = await getUserProfile(user.uid);
        if (profile) {
          setName(profile.name || "");
          setPhone(profile.phone || "");
          setIsPhoneVerified(profile.isPhoneVerified ?? false);
          setPhotoUri(profile.photoUri || null);
          setRole(profile.role || "client");
          setSpecialty(profile.specialty || "");
          setBio(profile.bio || "");
          setPortfolioImages(profile.portfolio || []);
        }
        const bal = await getBalance(user.uid);
        setBalance(bal);
      };
      load();
    }, [])
  );

  // ── Profile photo ──────────────────────────────────────────────────────────
  const handlePickImage = async () => {
    if (Platform.OS === "ios") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("إذن مرفوض", "يرجى السماح بالوصول إلى مكتبة الصور");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0])
      await handleSaveNewPhoto(result.assets[0].uri);
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
    if (!result.canceled && result.assets[0])
      await handleSaveNewPhoto(result.assets[0].uri);
  };

  const handleSaveNewPhoto = async (localUri: string) => {
    const prev = photoUri;
    setPhotoUri(localUri);
    setUploadingPhoto(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error("not authenticated");
      const url = await uploadProfilePhoto(userId, localUri);
      setPhotoUri(url);
      await setUserProfile(userId, { photoUri: url });
      if (role === "artisan") await updateArtisanPhotoIfExists(userId, url);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setPhotoUri(prev);
      Alert.alert("خطأ", "تعذّر حفظ الصورة الشخصية، حاول مرة أخرى");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleChangePhoto = () => {
    Alert.alert("تغيير الصورة الشخصية", "اختر مصدر الصورة", [
      { text: "إلغاء", style: "cancel" },
      { text: "التقاط صورة", onPress: handleTakePhoto },
      { text: "من المعرض", onPress: handlePickImage },
    ]);
  };

  // ── Portfolio ──────────────────────────────────────────────────────────────
  const handleAddPortfolioImage = async () => {
    if (Platform.OS === "ios") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("إذن مرفوض", "يرجى السماح بالوصول إلى مكتبة الصور");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingPortfolio(true);
    try {
      const url = await uploadPortfolioImage(uid, result.assets[0].uri);
      await addPortfolioImage(uid, url);
      setPortfolioImages((prev) => [...prev, url]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const code = err?.code || "";
      const msg = err?.message || "";
      let userMsg = "تعذّر رفع الصورة، حاول مرة أخرى";
      if (
        code.includes("unauthorized") ||
        msg.includes("unauthorized") ||
        msg.includes("permission")
      )
        userMsg = "صلاحيات الرفع مرفوضة من Firebase Storage.";
      else if (msg.includes("network") || code.includes("network"))
        userMsg = "تعذّر الاتصال بالخادم، تحقق من الإنترنت";
      Alert.alert("خطأ في رفع الصورة", `${userMsg}\n\n[${code || "unknown"}]`);
    } finally {
      setUploadingPortfolio(false);
    }
  };

  const handleDeletePortfolioImage = (imageUrl: string) => {
    Alert.alert("حذف الصورة", "هل تريد حذف هذه الصورة من معرضك؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            await removePortfolioImage(uid, imageUrl);
            setPortfolioImages((prev) => prev.filter((u) => u !== imageUrl));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } catch {
            Alert.alert("خطأ", "تعذّر حذف الصورة");
          }
        },
      },
    ]);
  };

  // ── Edit Modal logic ───────────────────────────────────────────────────────
  const openEditModal = () => {
    setEditName(name);
    setEditBio(bio);
    setEditPhone(phone);
    setOtpModalVisible(false);
    setOtpCode("");
    setPhoneVerifiedInSession(false);
    setEditModalVisible(true);
  };

  const handleSendOtp = async () => {
    const trimmed = editPhone.trim();
    if (!IRAQI_PHONE_REGEX.test(trimmed)) {
      Alert.alert(
        "رقم غير صحيح",
        "أدخل رقم هاتف عراقي صحيح (11 رقماً يبدأ بـ 07)\nمثال: 07812345678"
      );
      return;
    }
    setSendingOtp(true);
    try {
      const r = await fetch(`${getServerUrl()}api/send-whatsapp-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmed }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "فشل إرسال الرمز");
      setOtpCode("");
      setOtpModalVisible(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("خطأ", err.message || "تعذّر إرسال رمز التحقق عبر الواتساب");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode.trim() || otpCode.trim().length < 4) {
      Alert.alert("خطأ", "أدخل رمز التحقق المرسل إليك");
      return;
    }
    setVerifyingOtp(true);
    try {
      const r = await fetch(`${getServerUrl()}api/verify-otp-only`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: editPhone.trim(), code: otpCode.trim() }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "الرمز غير صحيح");
      // Persist new phone + verified flag to Firestore immediately
      await setUserProfile(uid, {
        phone: editPhone.trim(),
        isPhoneVerified: true,
      });
      setPhone(editPhone.trim());
      setIsPhoneVerified(true);
      setPhoneVerifiedInSession(true);
      setOtpModalVisible(false);
      setOtpCode("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("خطأ", err.message || "رمز التحقق غير صحيح");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) {
      Alert.alert("خطأ", "يرجى إدخال الاسم الكامل");
      return;
    }
    setSaving(true);
    try {
      await setUserProfile(uid, {
        name: editName.trim(),
        bio: editBio.trim(),
      });
      // Sync artisan record if applicable
      if (role === "artisan" && specialty) {
        const profile = await getUserProfile(uid);
        await createOrUpdateArtisan(uid, {
          name: editName.trim(),
          phone: phone,
          photoUri: profile?.photoUri ?? photoUri,
          specialty,
          category: getCategoryForSpecialty(specialty),
          location: profile?.location ?? null,
          bio: editBio.trim(),
          isAvailable: true,
        });
      }
      setName(editName.trim());
      setBio(editBio.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditModalVisible(false);
      Alert.alert("تم الحفظ ✓", "تم تحديث ملفك الشخصي بنجاح");
    } catch {
      Alert.alert("خطأ", "حدث خطأ أثناء حفظ البيانات");
    } finally {
      setSaving(false);
    }
  };

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert("تسجيل الخروج", "هل أنت متأكد من رغبتك في تسجيل الخروج؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "تسجيل الخروج",
        style: "destructive",
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await performSignOut();
          router.replace("/login");
        },
      },
    ]);
  };

  const btnScale = useSharedValue(1);
  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>

      {/* ══════════════════════════════════════════
          HEADER — avatar · name · wallet
      ══════════════════════════════════════════ */}
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
          {/* Avatar */}
          <Pressable style={styles.avatarWrap} onPress={handleChangePhoto}>
            {uploadingPhoto ? (
              <LinearGradient colors={["#1E2F60", "#0D1B3E"]} style={styles.avatarPlaceholder}>
                <ActivityIndicator size="large" color={C.accent} />
              </LinearGradient>
            ) : photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarImg} />
            ) : (
              <LinearGradient colors={["#1E2F60", "#0D1B3E"]} style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={44} color={C.accent} />
              </LinearGradient>
            )}
            <View style={styles.cameraBtn}>
              <LinearGradient colors={[C.accent, C.accentLight]} style={styles.cameraBtnGrad}>
                <Feather name="camera" size={14} color={C.primary} />
              </LinearGradient>
            </View>
          </Pressable>

          {/* Name only — NO email/contact line */}
          <Text style={styles.displayName}>{name || "—"}</Text>

          {/* Wallet pill */}
          <View style={styles.balancePill}>
            <MaterialCommunityIcons name="wallet" size={14} color={C.accent} />
            <Text style={styles.balancePillText}>
              {balance.toLocaleString("ar-IQ")} د.ع
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* ══════════════════════════════════════════
          SCROLLABLE BODY
      ══════════════════════════════════════════ */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: bottomPad + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Personal Data Card (read-only) ── */}
          <View style={styles.card}>
            {/* Card header */}
            <View style={styles.cardTitleRow}>
              <Pressable style={styles.editBtn} onPress={openEditModal}>
                <Feather name="edit-2" size={13} color={C.accent} />
                <Text style={styles.editBtnText}>تعديل الملف الشخصي</Text>
              </Pressable>
              <Text style={styles.cardTitle}>البيانات الشخصية</Text>
            </View>

            {/* Specialty */}
            {specialtyLabel ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoValue}>{specialtyLabel}</Text>
                <View style={styles.infoIconWrap}>
                  <MaterialCommunityIcons name="briefcase-outline" size={16} color={C.accent} />
                </View>
              </View>
            ) : null}

            {/* Bio */}
            {bio ? (
              <View style={styles.infoRow}>
                <Text style={[styles.infoValue, styles.bioValue]}>{bio}</Text>
                <View style={styles.infoIconWrap}>
                  <Feather name="file-text" size={16} color={C.accent} />
                </View>
              </View>
            ) : null}

            {/* Phone with inline verified badge */}
            <View style={styles.infoRow}>
              <View style={styles.phoneValueInline}>
                <Text style={[styles.infoValue, !phone && { color: C.textMuted }]}>
                  {phone || "لم يُضف رقم هاتف"}
                </Text>
                {isPhoneVerified && (
                  <View style={styles.verifiedBadgeInline}>
                    <Feather name="check-circle" size={13} color={C.success} />
                    <Text style={styles.verifiedText}>موثق ✓</Text>
                  </View>
                )}
              </View>
              <View style={styles.infoIconWrap}>
                <Feather name="phone" size={16} color={C.accent} />
              </View>
            </View>
          </View>

          {/* ── Portfolio Gallery (all users) ── */}
          <View style={styles.card}>
            <View style={styles.portfolioHeader}>
              <Pressable
                style={[styles.addImageBtn, uploadingPortfolio && { opacity: 0.5 }]}
                onPress={handleAddPortfolioImage}
                disabled={uploadingPortfolio}
              >
                {uploadingPortfolio ? (
                  <ActivityIndicator size="small" color={C.accent} />
                ) : (
                  <Feather name="plus" size={15} color={C.accent} />
                )}
                <Text style={styles.addImageBtnText}>إضافة صورة</Text>
              </Pressable>
              <Text style={styles.cardTitle}>معرض أعمالي</Text>
            </View>

            {portfolioImages.length === 0 ? (
              <View style={styles.emptyPortfolio}>
                <MaterialCommunityIcons
                  name="image-multiple-outline"
                  size={44}
                  color={C.textMuted}
                />
                <Text style={styles.emptyPortfolioText}>لم تضف أي صور بعد</Text>
                <Text style={styles.emptyPortfolioSub}>
                  اضغط "إضافة صورة" لرفع أعمالك السابقة
                </Text>
              </View>
            ) : (
              /* Vertical list — one image per row */
              <View style={styles.portfolioList}>
                {portfolioImages.map((uri, idx) => (
                  <View key={idx} style={styles.portfolioItem}>
                    <Image
                      source={{ uri }}
                      style={styles.portfolioImg}
                      resizeMode="cover"
                    />
                    <Pressable
                      style={styles.deleteImgBtn}
                      onPress={() => handleDeletePortfolioImage(uri)}
                    >
                      <Text style={styles.deleteImgIcon}>🗑️</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Admin button */}
          {uid === ADMIN_UID && (
            <Pressable
              style={styles.adminBtn}
              onPress={() => router.push("/admin")}
            >
              <View style={styles.adminIcon}>
                <Ionicons name="shield-checkmark" size={20} color="#fff" />
              </View>
              <Text style={styles.adminText}>لوحة تحكم المشرف</Text>
              <Feather
                name="chevron-left"
                size={16}
                color="rgba(255,255,255,0.6)"
              />
            </Pressable>
          )}

          {/* Logout */}
          <Pressable style={styles.logoutBtn} onPress={handleLogout}>
            <View style={styles.logoutIcon}>
              <Feather name="log-out" size={20} color={C.danger} />
            </View>
            <Text style={styles.logoutText}>تسجيل الخروج</Text>
            <Feather
              name="chevron-left"
              size={16}
              color={C.danger}
              style={{ opacity: 0.5 }}
            />
          </Pressable>

          <Text style={styles.versionNote}>
            فورس - ForUs • خدمات المنزل والسيارة
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ══════════════════════════════════════════
          EDIT PROFILE MODAL
      ══════════════════════════════════════════ */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setEditModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: "100%" }}
          >
            <Pressable
              style={styles.modalSheet}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>تعديل الملف الشخصي</Text>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* ── Full Name ── */}
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>الاسم الكامل</Text>
                  <View style={styles.inputRow}>
                    <View style={styles.inputIconWrap}>
                      <Feather name="user" size={17} color={C.textSecondary} />
                    </View>
                    <TextInput
                      style={styles.input}
                      placeholder="أدخل اسمك الكامل"
                      placeholderTextColor={C.textMuted}
                      value={editName}
                      onChangeText={setEditName}
                      textAlign="right"
                      autoCapitalize="words"
                    />
                  </View>
                </View>

                {/* ── Bio ── */}
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>
                    النبذة الشخصية (اختياري)
                  </Text>
                  <View style={styles.bioInputRow}>
                    <TextInput
                      style={styles.bioInput}
                      placeholder="اكتب نبذة عنك، خبراتك، شهاداتك..."
                      placeholderTextColor={C.textMuted}
                      value={editBio}
                      onChangeText={setEditBio}
                      textAlign="right"
                      multiline
                      numberOfLines={3}
                      maxLength={500}
                    />
                  </View>
                  <Text style={styles.bioCounter}>{editBio.length}/500</Text>
                </View>

                {/* ── Phone + inline verify button ── */}
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>رقم الهاتف</Text>

                  {/* Input row with embedded verify / verified badge */}
                  <View style={[
                    styles.inputRow,
                    phoneVerifiedInSession && { borderColor: C.success, borderWidth: 1.5 },
                  ]}>
                    {/* Left side: verified badge OR verify button */}
                    {phoneVerifiedInSession ? (
                      <View style={styles.inlineVerifiedBadge}>
                        <Feather name="check-circle" size={14} color={C.success} />
                        <Text style={styles.inlineVerifiedText}>موثق</Text>
                      </View>
                    ) : (
                      <Pressable
                        style={[styles.inlineVerifyBtn, sendingOtp && { opacity: 0.55 }]}
                        onPress={handleSendOtp}
                        disabled={sendingOtp}
                      >
                        {sendingOtp ? (
                          <ActivityIndicator size="small" color="#fff" style={{ width: 42 }} />
                        ) : (
                          <Text style={styles.inlineVerifyBtnText}>تحقق</Text>
                        )}
                      </Pressable>
                    )}

                    {/* Divider */}
                    <View style={styles.inputDivider} />

                    {/* Phone TextInput */}
                    <TextInput
                      style={styles.input}
                      placeholder="07xxxxxxxx"
                      placeholderTextColor={C.textMuted}
                      value={editPhone}
                      onChangeText={(v) => {
                        setEditPhone(v);
                        setOtpModalVisible(false);
                        setPhoneVerifiedInSession(false);
                        setOtpCode("");
                      }}
                      textAlign="right"
                      keyboardType="phone-pad"
                      maxLength={11}
                    />

                    {/* Phone icon on far right */}
                    <View style={styles.inputIconWrap}>
                      <Feather name="phone" size={17} color={C.textSecondary} />
                    </View>
                  </View>
                </View>

                {/* ── Save button ── */}
                <Animated.View
                  style={[btnAnimStyle, { marginTop: 8, marginBottom: 28 }]}
                >
                  <Pressable
                    style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                    onPress={handleSaveEdit}
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
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ══════════════════════════════════════════
          OTP SUB-MODAL — opens on top of edit modal
      ══════════════════════════════════════════ */}
      <Modal
        visible={otpModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOtpModalVisible(false)}
      >
        <View style={styles.otpModalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: "100%", paddingHorizontal: 24 }}
          >
            <View style={styles.otpModalCard}>
              {/* Header */}
              <View style={styles.otpModalHeader}>
                <MaterialCommunityIcons name="whatsapp" size={28} color="#25D366" />
                <Text style={styles.otpModalTitle}>أدخل رمز التحقق</Text>
              </View>
              <Text style={styles.otpModalSub}>
                أُرسل إليك رمز مكوّن من 6 أرقام عبر الواتساب إلى{"\n"}
                <Text style={styles.otpPhoneHighlight}>{editPhone}</Text>
              </Text>

              {/* OTP input */}
              <View style={[styles.inputRow, { marginTop: 16 }]}>
                <View style={styles.inputIconWrap}>
                  <Feather name="key" size={17} color={C.textSecondary} />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="• • • • • •"
                  placeholderTextColor={C.textMuted}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  textAlign="center"
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
              </View>

              {/* Confirm button */}
              <Pressable
                style={[styles.verifyBtn, { marginTop: 14 }, verifyingOtp && { opacity: 0.55 }]}
                onPress={handleVerifyOtp}
                disabled={verifyingOtp}
              >
                {verifyingOtp ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.verifyBtnText}>تأكيد الرمز</Text>
                )}
              </Pressable>

              {/* Cancel */}
              <Pressable
                style={styles.otpCancelBtn}
                onPress={() => { setOtpModalVisible(false); setOtpCode(""); }}
              >
                <Text style={styles.otpCancelText}>إلغاء</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },

  // ── Header ──
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
  avatarSection: { alignItems: "center", gap: 8 },
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
  cameraBtnGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
  displayName: {
    fontSize: 18,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
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

  // ── Body ──
  body: {
    paddingHorizontal: 18,
    paddingTop: 20,
    gap: 14,
  },

  // ── Cards ──
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 18,
    gap: 14,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Cairo_700Bold",
    color: C.textSecondary,
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(201,168,76,0.1)",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.3)",
  },
  editBtnText: {
    fontSize: 12,
    fontFamily: "Cairo_600SemiBold",
    color: C.accent,
  },

  // ── Info rows (read-only) ──
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: C.inputBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoIconWrap: {
    width: 28,
    alignItems: "center",
    paddingTop: 2,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Cairo_400Regular",
    color: C.text,
    textAlign: "right",
  },
  bioValue: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 22,
  },
  phoneValueInline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
  },
  verifiedBadgeInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.successLight,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  verifiedText: {
    fontSize: 11,
    fontFamily: "Cairo_600SemiBold",
    color: C.success,
  },

  // ── Portfolio ──
  portfolioHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addImageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(201,168,76,0.1)",
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.3)",
  },
  addImageBtnText: {
    fontSize: 12,
    fontFamily: "Cairo_600SemiBold",
    color: C.accent,
  },
  emptyPortfolio: {
    alignItems: "center",
    paddingVertical: 28,
    gap: 6,
  },
  emptyPortfolioText: {
    fontSize: 14,
    fontFamily: "Cairo_600SemiBold",
    color: C.textSecondary,
  },
  emptyPortfolioSub: {
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    color: C.textMuted,
    textAlign: "center",
  },
  portfolioList: {
    gap: 12,
  },
  portfolioItem: {
    width: "100%",
    height: PORTFOLIO_IMG_H,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    backgroundColor: C.inputBg,
  },
  portfolioImg: {
    width: "100%",
    height: "100%",
  },
  deleteImgBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteImgIcon: {
    fontSize: 18,
  },

  // ── Settings rows ──
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
  divider: { height: 1, backgroundColor: C.border, marginVertical: 2 },

  // ── Admin / Logout ──
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
  versionNote: {
    fontSize: 11,
    fontFamily: "Cairo_400Regular",
    color: C.textMuted,
    textAlign: "center",
    marginTop: 4,
  },

  // ── Edit Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 14,
    maxHeight: "88%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "Cairo_700Bold",
    color: C.text,
    textAlign: "center",
    marginBottom: 18,
  },

  // ── Form fields (inside modal) ──
  fieldWrap: { gap: 7, marginBottom: 14 },
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
  inputIconWrap: { width: 28, alignItems: "center" },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Cairo_400Regular",
    color: C.text,
    paddingVertical: 13,
    textAlign: "right",
  },
  bioInputRow: {
    backgroundColor: C.inputBg,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 90,
  },
  bioInput: {
    fontSize: 13,
    fontFamily: "Cairo_400Regular",
    color: C.text,
    textAlignVertical: "top",
    minHeight: 70,
    padding: 0,
    textAlign: "right",
  },
  bioCounter: {
    fontSize: 11,
    fontFamily: "Cairo_400Regular",
    color: C.textMuted,
    textAlign: "left",
  },

  // ── Phone verification (inline inside input row) ──
  inlineVerifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#25D366",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 52,
  },
  inlineVerifyBtnText: {
    fontSize: 12,
    fontFamily: "Cairo_700Bold",
    color: "#fff",
  },
  inlineVerifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.successLight,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  inlineVerifiedText: {
    fontSize: 12,
    fontFamily: "Cairo_600SemiBold",
    color: C.success,
  },
  inputDivider: {
    width: 1,
    height: 22,
    backgroundColor: C.border,
    marginHorizontal: 4,
  },
  // ── OTP sub-modal ──
  otpModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  otpModalCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 24,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 16,
  },
  otpModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 8,
  },
  otpModalTitle: {
    fontSize: 18,
    fontFamily: "Cairo_700Bold",
    color: C.text,
    textAlign: "center",
  },
  otpModalSub: {
    fontSize: 13,
    fontFamily: "Cairo_400Regular",
    color: C.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  otpPhoneHighlight: {
    fontFamily: "Cairo_700Bold",
    color: C.primary,
    fontSize: 14,
  },
  otpCancelBtn: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 8,
  },
  otpCancelText: {
    fontSize: 13,
    fontFamily: "Cairo_400Regular",
    color: C.textMuted,
  },
  verifyBtn: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyBtnText: {
    fontSize: 14,
    fontFamily: "Cairo_700Bold",
    color: "#fff",
  },

  // ── Save button ──
  saveBtn: { borderRadius: 13, overflow: "hidden" },
  saveBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    gap: 8,
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: "Cairo_700Bold",
    color: C.primary,
  },
});
