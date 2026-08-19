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
import { auth } from "@/lib/firebase";
import { linkWithPhoneNumber, type ConfirmationResult } from "firebase/auth";
import FirebaseRecaptcha, {
  type FirebaseRecaptchaHandle,
} from "@/components/FirebaseRecaptcha";
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
  getCategoryForSpecialty,
  ALL_SPECIALTIES,
} from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;
const SCREEN_W = Dimensions.get("window").width;
// Portfolio images are full-width with a 4:3 aspect ratio
const PORTFOLIO_IMG_H = Math.round((SCREEN_W - 18 * 2) * 0.75);

const IRAQI_PHONE_REGEX = /^07\d{9}$/;

function toE164(phone: string): string {
  const digits = phone.trim().replace(/\D/g, "");
  if (digits.startsWith("00964")) return `+${digits.slice(2)}`;
  if (digits.startsWith("964")) return `+${digits}`;
  if (digits.startsWith("07")) return `+964${digits.slice(1)}`;
  if (digits.startsWith("7")) return `+964${digits}`;
  return `+964${digits}`;
}

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
  const [followCount, setFollowCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [portfolioImages, setPortfolioImages] = useState<string[]>([]);
  const [uploadingPortfolio, setUploadingPortfolio] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // ── Edit modal state ───────────────────────────────────────────────────────
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editSpecialty, setEditSpecialty] = useState("");
  const [specialtyPickerVisible, setSpecialtyPickerVisible] = useState(false);
  // OTP sub-modal (opens after WhatsApp OTP is sent)
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [phoneVerifiedInSession, setPhoneVerifiedInSession] = useState(false);
  const [phoneConfirmation, setPhoneConfirmation] =
    useState<ConfirmationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const recaptchaRef = React.useRef<FirebaseRecaptchaHandle>(null);

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
           setFollowCount(profile.followCount ?? 0);
           setLikesCount(profile.likesCount ?? 0);
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
    setEditSpecialty(specialty || "client");
    setOtpModalVisible(false);
    setOtpCode("");
    setPhoneVerifiedInSession(false);
    setPhoneConfirmation(null);
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
      const currentUser = auth.currentUser;
      const verifier = recaptchaRef.current?.verifier;
      if (!currentUser || !verifier) {
        throw new Error("تعذّر تجهيز التحقق الآمن، أعد فتح الشاشة");
      }
      const confirmation = await linkWithPhoneNumber(
        currentUser,
        toE164(trimmed),
        verifier,
      );
      setPhoneConfirmation(confirmation);
      setOtpCode("");
      setOtpModalVisible(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert("خطأ", err.message || "تعذّر إرسال رمز التحقق عبر SMS");
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
      if (!phoneConfirmation) throw new Error("انتهت جلسة التحقق، أرسل رمزاً جديداً");
      await phoneConfirmation.confirm(otpCode.trim());
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
      setPhoneConfirmation(null);
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
      // Two explicit branches — no undefined values (Firestore/merge ignores undefined,
      // leaving stale artisan fields behind).
      if (editSpecialty === "client") {
        await setUserProfile(uid, {
          name: editName.trim(),
          bio: editBio.trim(),
          specialty: "client",
          role: "client",
          category: "client" as any,   // explicit overwrite so old artisan category is cleared
          isAvailable: false,
        });
      } else {
        await setUserProfile(uid, {
          name: editName.trim(),
          bio: editBio.trim(),
          specialty: editSpecialty,
          role: "artisan",
          category: getCategoryForSpecialty(editSpecialty),
          isAvailable: true,
        });
      }
      const newRole: "client" | "artisan" =
        editSpecialty === "client" ? "client" : "artisan";

      // Reflect changes locally
      setName(editName.trim());
      setBio(editBio.trim());
      setSpecialty(editSpecialty);
      setRole(newRole);
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
          HEADER — avatar · name · specialty · bio · stats
      ══════════════════════════════════════════ */}
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={styles.header}>
        <View style={[styles.headerContent, { paddingTop: topPad + 10 }]}>
          {/* Logout — top-left */}
          <Pressable onPress={handleLogout} style={styles.logoutHeaderBtn}>
            <Feather name="log-out" size={19} color="#EF4444" />
            <Text style={styles.logoutHeaderText}>خروج</Text>
          </Pressable>
          <Text style={styles.headerTitle}>الملف الشخصي</Text>
          {/* Settings — top-right → opens edit modal */}
          <Pressable onPress={openEditModal} style={styles.headerIcon}>
            <Feather name="settings" size={20} color={C.accent} />
          </Pressable>
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

          {/* Specialty */}
          <View style={styles.specialtyPill}>
            <Text style={styles.specialtyPillText}>{specialtyLabel || "زبون"}</Text>
          </View>

          {/* Bio — plain text, without a heading */}
          {bio ? <Text style={styles.heroBio}>{bio}</Text> : null}

          {/* Stats — followers and likes */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{followCount}</Text>
              <Text style={styles.statLabel}>متابع</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Feather name="heart" size={16} color="rgba(255,255,255,0.8)" />
              <Text style={styles.statLabel}>{likesCount} إعجاب</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Three equal controls: wallet · promote · add image */}
      <View style={styles.controlRow}>
        <Pressable style={[styles.controlBtn, styles.walletBtn]} onPress={() => router.push("/wallet" as any)}>
          <MaterialCommunityIcons name="wallet-outline" size={17} color={C.accent} />
          <Text style={styles.controlBtnText} numberOfLines={1}>
            {balance.toLocaleString("ar-IQ")} د.ع
          </Text>
        </Pressable>

        <Pressable
          style={[styles.controlBtn, styles.promoteControlBtn]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/promote" as any);
          }}
          accessibilityLabel="روّج حسابك"
        >
          <Ionicons name="rocket-outline" size={17} color="#FFF" />
          <Text style={styles.controlBtnText} numberOfLines={1}>روّج حسابك</Text>
        </Pressable>

        <Pressable
          style={[styles.controlBtn, styles.addImageControlBtn, uploadingPortfolio && { opacity: 0.55 }]}
          onPress={handleAddPortfolioImage}
          disabled={uploadingPortfolio}
          accessibilityLabel="إضافة صورة"
        >
          {uploadingPortfolio ? (
            <ActivityIndicator size="small" color={C.accent} />
          ) : (
            <Feather name="plus" size={18} color={C.accent} />
          )}
          <Text style={styles.addImageControlText} numberOfLines={1}>إضافة صورة</Text>
        </Pressable>
      </View>

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

          {/* ── Portfolio Gallery (all users) ── */}
          <View style={styles.card}>
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

          <Text style={styles.versionNote}>
            فورس - ForUs • خدمات المنزل والسيارة
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <FirebaseRecaptcha ref={recaptchaRef} />

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

                {/* ── Specialty picker ── */}
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>التخصص المهني</Text>
                  <Pressable
                    style={styles.specialtyPickerBtn}
                    onPress={() => setSpecialtyPickerVisible(true)}
                  >
                    <Feather name="chevron-left" size={17} color={C.textSecondary} />
                    <Text
                      style={[
                        styles.specialtyPickerValue,
                        !editSpecialty && { color: C.textMuted },
                      ]}
                    >
                      {editSpecialty === "client"
                        ? "زبون (عميل)"
                        : ALL_SPECIALTIES.find((s) => s.key === editSpecialty)?.label ||
                          "اختر التخصص"}
                    </Text>
                    <Feather name="briefcase" size={17} color={C.textSecondary} />
                  </Pressable>
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
          SPECIALTY PICKER MODAL
      ══════════════════════════════════════════ */}
      <Modal
        visible={specialtyPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSpecialtyPickerVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSpecialtyPickerVisible(false)}
        >
          <Pressable style={styles.specialtySheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>اختر التخصص المهني</Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              {/* ── Client option ── */}
              <Text style={styles.spCategoryHeader}>عام</Text>
              {[{ key: "client", label: "زبون (عميل)" }].map((item) => (
                <Pressable
                  key={item.key}
                  style={[
                    styles.spOptionRow,
                    editSpecialty === item.key && styles.spOptionRowActive,
                  ]}
                  onPress={() => {
                    setEditSpecialty(item.key);
                    setSpecialtyPickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.spOptionLabel,
                      editSpecialty === item.key && styles.spOptionLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {editSpecialty === item.key && (
                    <Feather name="check" size={16} color={C.primary} />
                  )}
                </Pressable>
              ))}

              {/* ── Home services ── */}
              <Text style={styles.spCategoryHeader}>خدمات المنزل</Text>
              {[
                { key: "plumber", label: "سباك" },
                { key: "electrician", label: "كهربائي" },
                { key: "carpenter", label: "نجار" },
                { key: "painter", label: "صباغ" },
                { key: "mason", label: "بنّاء" },
                { key: "tiler", label: "سيراميك" },
                { key: "ironsmith", label: "حداد" },
                { key: "ac_tech", label: "صيانة مكيفات" },
                { key: "shovel", label: "شفل" },
                { key: "roller", label: "حادلة" },
                { key: "backhoe", label: "بوكلن" },
                { key: "crane", label: "ونج" },
              ].map((item) => (
                <Pressable
                  key={item.key}
                  style={[
                    styles.spOptionRow,
                    editSpecialty === item.key && styles.spOptionRowActive,
                  ]}
                  onPress={() => {
                    setEditSpecialty(item.key);
                    setSpecialtyPickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.spOptionLabel,
                      editSpecialty === item.key && styles.spOptionLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {editSpecialty === item.key && (
                    <Feather name="check" size={16} color={C.primary} />
                  )}
                </Pressable>
              ))}

              {/* ── Car services ── */}
              <Text style={styles.spCategoryHeader}>خدمات السيارات</Text>
              {[
                { key: "mechanic", label: "ميكانيكي" },
                { key: "auto_elec", label: "كهرباء سيارات" },
                { key: "tire_spec", label: "كرين" },
                { key: "body_repair", label: "بنجرجي" },
                { key: "ac_car", label: "تبريد سيارات" },
              ].map((item) => (
                <Pressable
                  key={item.key}
                  style={[
                    styles.spOptionRow,
                    editSpecialty === item.key && styles.spOptionRowActive,
                  ]}
                  onPress={() => {
                    setEditSpecialty(item.key);
                    setSpecialtyPickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.spOptionLabel,
                      editSpecialty === item.key && styles.spOptionLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {editSpecialty === item.key && (
                    <Feather name="check" size={16} color={C.primary} />
                  )}
                </Pressable>
              ))}

              {/* ── General services ── */}
              <Text style={styles.spCategoryHeader}>خدمات عامة</Text>
              {[
                { key: "clinic", label: "عيادات طبية" },
                { key: "lab_center", label: "مراكز ومختبرات" },
              ].map((item) => (
                <Pressable
                  key={item.key}
                  style={[
                    styles.spOptionRow,
                    editSpecialty === item.key && styles.spOptionRowActive,
                  ]}
                  onPress={() => {
                    setEditSpecialty(item.key);
                    setSpecialtyPickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.spOptionLabel,
                      editSpecialty === item.key && styles.spOptionLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {editSpecialty === item.key && (
                    <Feather name="check" size={16} color={C.primary} />
                  )}
                </Pressable>
              ))}

              {/* ── Delivery services ── */}
              <Text style={styles.spCategoryHeader}>خدمات التوصيل</Text>
              {[
                { key: "taxi", label: "تكسي" },
                { key: "bus", label: "باص" },
                { key: "courier", label: "مندوب" },
              ].map((item) => (
                <Pressable
                  key={item.key}
                  style={[
                    styles.spOptionRow,
                    editSpecialty === item.key && styles.spOptionRowActive,
                  ]}
                  onPress={() => {
                    setEditSpecialty(item.key);
                    setSpecialtyPickerVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.spOptionLabel,
                      editSpecialty === item.key && styles.spOptionLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {editSpecialty === item.key && (
                    <Feather name="check" size={16} color={C.primary} />
                  )}
                </Pressable>
              ))}

              <View style={{ height: 32 }} />
            </ScrollView>
          </Pressable>
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
                <MaterialCommunityIcons
                  name="message-text-outline"
                  size={28}
                  color={C.accent}
                />
                <Text style={styles.otpModalTitle}>أدخل رمز التحقق</Text>
              </View>
              <Text style={styles.otpModalSub}>
                أُرسل إليك رمز مكوّن من 6 أرقام عبر SMS إلى{"\n"}
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
  // Logout button — top-left of header
  logoutHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  logoutHeaderText: {
    fontSize: 13,
    fontFamily: "Cairo_700Bold",
    color: "#EF4444",
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
  specialtyPill: {
    backgroundColor: "rgba(201,168,76,0.2)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginTop: 2,
  },
  specialtyPillText: {
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
    color: C.accent,
  },
  heroBio: {
    maxWidth: "92%",
    fontSize: 13,
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    fontSize: 15,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
  },
  statLabel: {
    fontSize: 10,
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.65)",
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
  },

  // ── Three controls below the hero ──
  controlRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  controlBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  controlBtnText: {
    flexShrink: 1,
    fontSize: 11,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
    textAlign: "center",
  },
  walletBtn: {
    backgroundColor: "rgba(201,168,76,0.1)",
    borderColor: "rgba(201,168,76,0.45)",
  },
  promoteControlBtn: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  addImageControlBtn: {
    backgroundColor: "rgba(201,168,76,0.06)",
    borderColor: C.accent,
  },
  addImageControlText: {
    flexShrink: 1,
    fontSize: 11,
    fontFamily: "Cairo_700Bold",
    color: C.accent,
    textAlign: "center",
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
  // ── Portfolio ──
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

  // ── Specialty picker button (inside edit modal) ──
  specialtyPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.inputBg,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 8,
  },
  specialtyPickerValue: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Cairo_400Regular",
    color: C.text,
    textAlign: "right",
  },

  // ── Specialty picker sheet ──
  specialtySheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  spCategoryHeader: {
    fontSize: 12,
    fontFamily: "Cairo_700Bold",
    color: C.textMuted,
    textAlign: "right",
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  spOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 2,
  },
  spOptionRowActive: {
    backgroundColor: "#EEF2FF",
  },
  spOptionLabel: {
    fontSize: 14,
    fontFamily: "Cairo_400Regular",
    color: C.text,
    textAlign: "right",
  },
  spOptionLabelActive: {
    fontFamily: "Cairo_700Bold",
    color: C.primary,
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
