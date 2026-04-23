import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Modal,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  ensureUserDocument,
  createOrUpdateArtisan,
  getCategoryForSpecialty,
  ALL_SPECIALTIES,
  HOME_SERVICES,
  CAR_SERVICES,
  GENERAL_SERVICES,
  type GeoLocation,
} from "@/lib/db_logic";
import Colors from "@/constants/colors";

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

const API_BASE = (() => {
  const dom = process.env.EXPO_PUBLIC_DOMAIN;
  if (dom) {
    const cleaned = dom.replace(/:\d+$/, "");
    return `https://${cleaned}`;
  }
  return "";
})();

const C = Colors.light;

function InputField({
  label,
  placeholder,
  value,
  onChangeText,
  icon,
  secureTextEntry = false,
  keyboardType = "default",
  onSubmitEditing,
  returnKeyType = "next",
  innerRef,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  icon: React.ReactNode;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  onSubmitEditing?: () => void;
  returnKeyType?: "next" | "done" | "go";
  innerRef?: React.RefObject<TextInput | null>;
}) {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputRow, focused && styles.inputFocused]}>
        <View style={styles.inputIcon}>{icon}</View>
        <TextInput
          ref={innerRef}
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry && !showPassword}
          keyboardType={keyboardType}
          textAlign="right"
          textAlignVertical="center"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          autoCapitalize="none"
        />
        {secureTextEntry && (
          <Pressable onPress={() => setShowPassword((p) => !p)} style={styles.eyeBtn}>
            <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={C.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const CLIENT_OPTION = { key: "client", label: "زبون", icon: "user" };

const SPECIALTY_SECTIONS = [
  { title: "نوع الحساب", items: [CLIENT_OPTION] },
  { title: "خدمات المنزل", items: HOME_SERVICES },
  { title: "خدمات السيارات", items: CAR_SERVICES },
  { title: "خدمات عامة", items: GENERAL_SERVICES },
];

const ALL_OPTIONS = [CLIENT_OPTION, ...HOME_SERVICES, ...CAR_SERVICES, ...GENERAL_SERVICES];

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [specialtyModal, setSpecialtyModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const [step, setStep] = useState<"form" | "otp">("form");
  const [otp, setOtp] = useState("");
  const [otpResendIn, setOtpResendIn] = useState(0);
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);

  const role: "client" | "artisan" = specialty === "client" ? "client" : "artisan";

  React.useEffect(() => {
    if (step !== "otp") return;
    const t = setInterval(() => {
      setOtpResendIn((n) => (n > 0 ? n - 1 : 0));
      setOtpExpiresIn((n) => (n > 0 ? n - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [step]);

  const ref2 = useRef<TextInput>(null);
  const ref3 = useRef<TextInput>(null);

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  const requestLocation = async (): Promise<GeoLocation | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch {
      return null;
    }
  };

  const requestOtp = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.error === "cooldown") {
          Alert.alert("انتظر قليلاً", `يرجى المحاولة بعد ${data.waitSeconds} ثانية`);
          setOtpResendIn(data.waitSeconds || 60);
        } else if (data.error === "invalid_email") {
          Alert.alert("خطأ", "البريد الإلكتروني غير صحيح");
        } else if (data.error === "email_not_configured") {
          Alert.alert("إعدادات البريد ناقصة", "لم يتم تكوين بريد الإرسال على الخادم. يرجى التواصل مع الإدارة.");
        } else {
          Alert.alert("فشل الإرسال", "تأكد من إعدادات البريد أو حاول مرة أخرى.");
        }
        return false;
      }
      setOtpExpiresIn(data.expiresIn || 600);
      setOtpResendIn(60);
      return true;
    } catch (err) {
      Alert.alert("خطأ", "تعذّر الاتصال بالخادم");
      return false;
    }
  };

  const handleSendOtp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !isValidEmail(trimmedEmail)) {
      Alert.alert("خطأ", "يرجى إدخال بريد إلكتروني صحيح");
      return;
    }
    if (password.length < 6) {
      Alert.alert("خطأ", "كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("خطأ", "كلمتا المرور غير متطابقتين");
      return;
    }
    if (!specialty) {
      Alert.alert("خطأ", "يرجى اختيار نوع الحساب أو التخصص");
      return;
    }

    btnScale.value = withSpring(0.96, { damping: 12 }, () => { btnScale.value = withSpring(1); });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const ok = await requestOtp();
      if (ok) {
        setStep("otp");
        setOtp("");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpResendIn > 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try {
      await requestOtp();
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndCreate = async () => {
    if (otp.trim().length !== 6) {
      Alert.alert("خطأ", "يرجى إدخال رمز التحقق المكوّن من 6 أرقام");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const trimmedEmail = email.trim().toLowerCase();
      // Verify OTP first
      const vres = await fetch(`${API_BASE}/api/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, code: otp.trim() }),
      });
      const vdata = await vres.json();
      if (!vres.ok || !vdata.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        if (vdata.error === "wrong_code") {
          Alert.alert("رمز خاطئ", `الرمز غير صحيح. المحاولات المتبقية: ${vdata.attemptsLeft}`);
        } else if (vdata.error === "expired") {
          Alert.alert("انتهت الصلاحية", "انتهت صلاحية الرمز، يرجى طلب رمز جديد");
        } else if (vdata.error === "too_many_attempts") {
          Alert.alert("محاولات كثيرة", "تجاوزت عدد المحاولات، يرجى طلب رمز جديد");
        } else {
          Alert.alert("خطأ", "تعذّر التحقق من الرمز");
        }
        return;
      }

      // OTP verified — now create account
      const location = await requestLocation();
      const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      const uid = credential.user.uid;

      const savedSpecialty = role === "artisan" ? specialty : undefined;
      await ensureUserDocument(uid, trimmedEmail, role, { specialty: savedSpecialty, location });

      if (role === "artisan" && specialty) {
        const category = getCategoryForSpecialty(specialty);
        await createOrUpdateArtisan(uid, {
          name: trimmedEmail.split("@")[0],
          phone: "",
          photoUri: null,
          specialty,
          category,
          location,
          bio: "",
          isAvailable: true,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("تم التسجيل", "تم التحقق من بريدك وإنشاء حسابك بنجاح!", [
        { text: "تسجيل الدخول", onPress: () => router.replace("/login") },
      ]);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const code = err?.code || "";
      if (code === "auth/email-already-in-use") {
        Alert.alert("خطأ", "هذا البريد مسجل مسبقاً");
        setStep("form");
      } else if (code === "auth/weak-password") {
        Alert.alert("خطأ", "كلمة المرور ضعيفة، استخدم 6 أحرف على الأقل");
        setStep("form");
      } else {
        Alert.alert("خطأ", "حدث خطأ أثناء إنشاء الحساب");
      }
    } finally {
      setLoading(false);
    }
  };

  const formatSeconds = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const selectedSpecialtyLabel = ALL_OPTIONS.find((s) => s.key === specialty)?.label ?? "";

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={styles.header}>
        <View style={[styles.headerContent, { paddingTop: topPad + 10 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-right" size={24} color="#FFF" />
          </Pressable>
          <View style={styles.headerTextGroup}>
            <Text style={styles.headerTitle}>إنشاء حساب جديد</Text>
            <Text style={styles.headerSub}>أدخل بياناتك لتسجيل حسابك</Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="person-add" size={26} color={C.accent} />
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === "form" ? (
            <View style={styles.card}>
              <InputField
                label="البريد الإلكتروني"
                placeholder="example@email.com"
                value={email}
                onChangeText={setEmail}
                icon={<Feather name="mail" size={18} color={C.textSecondary} />}
                keyboardType="email-address"
                onSubmitEditing={() => ref2.current?.focus()}
              />

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>نوع الحساب / التخصص</Text>
                <Pressable
                  style={[styles.inputRow, styles.pickerRow]}
                  onPress={() => setSpecialtyModal(true)}
                >
                  <Feather name="chevron-down" size={16} color={C.textMuted} />
                  <Text style={[styles.input, { paddingVertical: 13, color: specialty ? C.text : C.textMuted }]}>
                    {selectedSpecialtyLabel || "اختر زبون أو تخصصك المهني"}
                  </Text>
                  <View style={styles.inputIcon}>
                    <Feather name="briefcase" size={15} color={C.textMuted} />
                  </View>
                </Pressable>
                <Text style={styles.helperText}>
                  يمكنك تغيير التخصص لاحقاً من ملفك الشخصي
                </Text>
              </View>

              <InputField
                label="كلمة المرور"
                placeholder="أدخل كلمة المرور (6 أحرف على الأقل)"
                value={password}
                onChangeText={setPassword}
                icon={<Feather name="lock" size={18} color={C.textSecondary} />}
                secureTextEntry
                innerRef={ref2}
                onSubmitEditing={() => ref3.current?.focus()}
              />

              <InputField
                label="تأكيد كلمة المرور"
                placeholder="أعد إدخال كلمة المرور"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                icon={<Feather name="check-circle" size={18} color={C.textSecondary} />}
                secureTextEntry
                innerRef={ref3}
                returnKeyType="done"
                onSubmitEditing={handleSendOtp}
              />

              <View style={styles.locationNote}>
                <Feather name="mail" size={14} color={C.accent} />
                <Text style={styles.locationNoteText}>
                  سنرسل رمز تحقق مكوّن من 6 أرقام إلى بريدك لإكمال التسجيل
                </Text>
              </View>

              <Animated.View style={btnStyle}>
                <Pressable
                  style={[styles.registerBtn, loading && styles.btnDisabled]}
                  onPress={handleSendOtp}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={[C.accent, C.accentLight]}
                    style={styles.registerGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {loading ? (
                      <Text style={styles.registerBtnText}>جارٍ الإرسال...</Text>
                    ) : (
                      <>
                        <Text style={styles.registerBtnText}>إرسال رمز التحقق</Text>
                        <Feather name="send" size={18} color={C.primary} />
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={otpStyles.iconCircle}>
                <Feather name="mail" size={28} color={C.accent} />
              </View>
              <Text style={otpStyles.title}>تحقق من بريدك</Text>
              <Text style={otpStyles.subtitle}>
                أرسلنا رمز تحقق إلى{"\n"}
                <Text style={{ color: C.accent, fontFamily: "Cairo_700Bold" }}>{email}</Text>
              </Text>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>الرمز المكوّن من 6 أرقام</Text>
                <View style={styles.inputRow}>
                  <View style={styles.inputIcon}>
                    <Feather name="hash" size={16} color={C.textSecondary} />
                  </View>
                  <TextInput
                    style={[styles.input, { letterSpacing: 8, fontSize: 22, textAlign: "center", fontFamily: "Cairo_700Bold" }]}
                    placeholder="------"
                    placeholderTextColor={C.textMuted}
                    value={otp}
                    onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, "").slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                  />
                </View>
                {otpExpiresIn > 0 && (
                  <Text style={styles.helperText}>
                    تنتهي صلاحية الرمز خلال {formatSeconds(otpExpiresIn)}
                  </Text>
                )}
              </View>

              <Animated.View style={btnStyle}>
                <Pressable
                  style={[styles.registerBtn, (loading || otp.length !== 6) && styles.btnDisabled]}
                  onPress={handleVerifyAndCreate}
                  disabled={loading || otp.length !== 6}
                >
                  <LinearGradient
                    colors={[C.accent, C.accentLight]}
                    style={styles.registerGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {loading ? (
                      <Text style={styles.registerBtnText}>جارٍ التحقق...</Text>
                    ) : (
                      <>
                        <Text style={styles.registerBtnText}>تأكيد وإنشاء الحساب</Text>
                        <Feather name="check" size={18} color={C.primary} />
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
              </Animated.View>

              <Pressable
                style={otpStyles.resendBtn}
                onPress={handleResendOtp}
                disabled={otpResendIn > 0 || loading}
              >
                <Text style={[otpStyles.resendText, otpResendIn > 0 && { color: C.textMuted }]}>
                  {otpResendIn > 0
                    ? `إعادة إرسال الرمز خلال ${otpResendIn} ثانية`
                    : "إعادة إرسال الرمز"}
                </Text>
              </Pressable>

              <Pressable style={otpStyles.changeBtn} onPress={() => setStep("form")}>
                <Feather name="edit-2" size={13} color={C.textSecondary} />
                <Text style={otpStyles.changeText}>تعديل البريد الإلكتروني</Text>
              </Pressable>
            </View>
          )}

          <Pressable onPress={() => router.push("/login")} style={styles.loginLink}>
            <Text style={styles.loginLinkText}>
              لديك حساب؟{" "}
              <Text style={{ color: C.accent, fontFamily: "Cairo_600SemiBold" }}>سجّل دخولك</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={specialtyModal} transparent animationType="slide" onRequestClose={() => setSpecialtyModal(false)}>
        <View style={modalStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSpecialtyModal(false)} />
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <View style={modalStyles.header}>
              <Pressable onPress={() => setSpecialtyModal(false)} style={modalStyles.closeBtn}>
                <Feather name="x" size={18} color={C.textSecondary} />
              </Pressable>
              <Text style={modalStyles.title}>اختر تخصصك</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              {SPECIALTY_SECTIONS.map((section) => (
                <View key={section.title}>
                  <View style={modalStyles.sectionHeader}>
                    <Text style={modalStyles.sectionTitle}>{section.title}</Text>
                  </View>
                  {section.items.map((item) => (
                    <Pressable
                      key={item.key}
                      style={[modalStyles.item, specialty === item.key && modalStyles.itemSelected]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSpecialty(item.key);
                        setSpecialtyModal(false);
                      }}
                    >
                      {specialty === item.key ? (
                        <Feather name="check" size={16} color={C.accent} />
                      ) : (
                        <View style={{ width: 16 }} />
                      )}
                      <Text style={[modalStyles.itemText, specialty === item.key && modalStyles.itemTextSelected]}>
                        {item.label}
                      </Text>
                      <Feather name={item.icon as any} size={16} color={specialty === item.key ? C.accent : C.textMuted} />
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 10,
    gap: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  headerTextGroup: { flex: 1, alignItems: "flex-end" },
  headerTitle: { fontSize: 20, fontFamily: "Cairo_700Bold", color: "#FFF", textAlign: "right" },
  headerSub: { fontSize: 12, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.6)", textAlign: "right" },
  headerIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "rgba(201,168,76,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, gap: 16 },
  card: {
    backgroundColor: C.card,
    borderRadius: 20, padding: 22, gap: 18,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
  },
  roleSection: { gap: 8 },
  sectionLabel: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.text, textAlign: "right" },
  roleRow: { flexDirection: "row", gap: 10 },
  roleBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12, borderRadius: 12,
    backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: "transparent",
  },
  roleBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  roleBtnText: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  roleBtnTextActive: { color: C.card },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.text, textAlign: "right" },
  helperText: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted, textAlign: "right", marginTop: 4 },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.inputBg, borderRadius: 12,
    borderWidth: 1.5, borderColor: "transparent",
    paddingHorizontal: 14, paddingVertical: 2, gap: 10,
  },
  pickerRow: { paddingVertical: 0 },
  inputFocused: { borderColor: C.accent, backgroundColor: "#FFF" },
  inputIcon: { width: 28, alignItems: "center" },
  input: {
    flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular",
    color: C.text, paddingVertical: 13, textAlign: "right",
  },
  eyeBtn: { padding: 6 },
  locationNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(201,168,76,0.08)",
    borderRadius: 10, padding: 12,
  },
  locationNoteText: {
    flex: 1, fontSize: 12, fontFamily: "Cairo_400Regular",
    color: C.textSecondary, textAlign: "right", lineHeight: 20,
  },
  registerBtn: { borderRadius: 14, overflow: "hidden", marginTop: 6 },
  registerGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 15, paddingHorizontal: 24, gap: 8,
  },
  registerBtnText: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.primary },
  btnDisabled: { opacity: 0.6 },
  loginLink: { alignItems: "center", paddingVertical: 8 },
  loginLinkText: { fontSize: 14, fontFamily: "Cairo_400Regular", color: C.textSecondary },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "85%",
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: "center", marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 20,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center",
    marginLeft: "auto",
  },
  title: { flex: 1, fontSize: 16, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  sectionHeader: {
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: C.background,
  },
  sectionTitle: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.textSecondary, textAlign: "right" },
  item: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  itemSelected: { backgroundColor: "rgba(201,168,76,0.06)" },
  itemText: { flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular", color: C.text, textAlign: "right" },
  itemTextSelected: { color: C.accent, fontFamily: "Cairo_600SemiBold" },
});

const otpStyles = StyleSheet.create({
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(201,168,76,0.12)",
    alignItems: "center", justifyContent: "center",
    alignSelf: "center", marginBottom: 4,
  },
  title: { fontSize: 18, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "center" },
  subtitle: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 6 },
  resendBtn: { alignItems: "center", paddingVertical: 8 },
  resendText: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.accent },
  changeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 6,
  },
  changeText: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textSecondary },
});
