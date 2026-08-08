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
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { fetch } from "expo/fetch";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import {
  createUserWithEmailAndPassword,
  signInWithCustomToken,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  ensureUserDocument,
  createOrUpdateArtisan,
  getCategoryForSpecialty,
  HOME_SERVICES,
  CAR_SERVICES,
  GENERAL_SERVICES,
  DELIVERY_SERVICES,
  type GeoLocation,
} from "@/lib/db_logic";
import Colors from "@/constants/colors";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the base URL of the Express server.
 * Priority:
 *  1. replitDomain baked into app.config.js extra at Metro startup (most reliable)
 *  2. EXPO_PUBLIC_DOMAIN env var (if explicitly set)
 *  3. Relative "/" (web fallback — works via Vite/Express proxy on web)
 *
 * NOTE: We intentionally do NOT use Constants.expoConfig.hostUri because
 * Metro is started with --localhost, making hostUri always "127.0.0.1".
 */
// Hardcoded Replit dev domain — stable per-repl, used as guaranteed fallback.
// Port 5000 is the Express backend (externalPort 5000 in .replit).
// Port 80/443 (default HTTPS) maps to Metro (8081) — never use it for API calls.
const REPLIT_SERVER_URL = "https://7ad1563a-fd03-4049-b8e0-44592245fa3b-00-124n16ica1aqg.pike.replit.dev:5000";

function getServerUrl(): string {
  // 1. Baked-in Replit domain from app.config.js extra (REACT_NATIVE_PACKAGER_HOSTNAME)
  const rawExtra = (Constants.expoConfig as any)?.extra;
  const replitDomain: unknown = rawExtra?.replitDomain;

  if (
    typeof replitDomain === "string" &&
    replitDomain.length > 0 &&
    replitDomain.includes(".") &&
    !replitDomain.includes("127.0.0.1") &&
    !replitDomain.includes("localhost")
  ) {
    // Ensure :5000 — Express is on externalPort 5000, NOT the default 443/80 (that goes to Metro)
    const host = replitDomain.includes(":") ? replitDomain : `${replitDomain}:5000`;
    const url = `https://${host}/`;
    console.log("[getServerUrl] baked domain:", url);
    return url;
  }

  // 2. EXPO_PUBLIC_DOMAIN env var
  const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (
    typeof envDomain === "string" &&
    envDomain.length > 0 &&
    !envDomain.includes("127.0.0.1") &&
    !envDomain.includes("localhost")
  ) {
    const clean = envDomain.replace(/\/$/, "");
    const url = clean.startsWith("http") ? `${clean}/` : `https://${clean}/`;
    console.log("[getServerUrl] env domain:", url);
    return url;
  }

  // 3. Hardcoded fallback — always works on physical devices, never returns a relative URL
  console.log("[getServerUrl] using hardcoded fallback:", REPLIT_SERVER_URL);
  return `${REPLIT_SERVER_URL}/`;
}

/** Returns true if the input looks like a phone number (starts with digit or +, no @) */
function isPhoneInput(s: string): boolean {
  const t = s.trim();
  return /^[\d\+]/.test(t) && !t.includes("@");
}

/** Validates that the contact is either a non-empty email or a phone (min 7 digits) */
function isValidContact(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (isPhoneInput(t)) return /[\d]{7,}/.test(t); // at least 7 digits
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t); // classic email regex
}

/**
 * Converts an Iraqi phone number to E.164 format.
 * 07xxxxxxxx → +9647xxxxxxxx
 */
function toE164(phone: string): string {
  const t = phone.trim().replace(/[\s\-]/g, "");
  if (t.startsWith("+")) return t;
  if (t.startsWith("00964")) return "+" + t.slice(2);
  if (t.startsWith("964")) return "+" + t;
  if (t.startsWith("07")) return "+964" + t.slice(1);
  if (t.startsWith("7")) return "+964" + t;
  return "+964" + t;
}


const C = Colors.light;

// ─── InputField ───────────────────────────────────────────────────────────────

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

// ─── OTP digit boxes ──────────────────────────────────────────────────────────

function OtpInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<TextInput>(null);
  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.otpRow}>
      {Array.from({ length: 6 }).map((_, i) => {
        const char = value[i] ?? "";
        const active = value.length === i;
        return (
          <View
            key={i}
            style={[
              styles.otpBox,
              char ? styles.otpBoxFilled : active ? styles.otpBoxActive : null,
            ]}
          >
            <Text style={styles.otpChar}>{char}</Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, "").slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        style={styles.otpHiddenInput}
        caretHidden
        autoFocus
      />
    </Pressable>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CLIENT_OPTION = { key: "client", label: "زبون", icon: "user" };

const SPECIALTY_SECTIONS = [
  { title: "نوع الحساب", items: [CLIENT_OPTION] },
  { title: "خدمات المنزل", items: HOME_SERVICES },
  { title: "خدمات السيارات", items: CAR_SERVICES },
  { title: "خدمات طبية", items: GENERAL_SERVICES },
  { title: "خدمات توصيل", items: DELIVERY_SERVICES },
];

const ALL_OPTIONS = [CLIENT_OPTION, ...HOME_SERVICES, ...CAR_SERVICES, ...GENERAL_SERVICES, ...DELIVERY_SERVICES];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState("");
  const [contact, setContact] = useState(""); // phone or email
  const [password, setPassword] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [specialtyModal, setSpecialtyModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── WhatsApp OTP registration flow ──
  const [regOtpStep, setRegOtpStep] = useState<"form" | "otp">("form");
  const [regOtpCode, setRegOtpCode] = useState("");
  const [regOtpSending, setRegOtpSending] = useState(false);
  const [regOtpVerifying, setRegOtpVerifying] = useState(false);
  const [savedLocation, setSavedLocation] = useState<GeoLocation | null>(null);

  const contactRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  const role: "client" | "artisan" = specialty === "client" ? "client" : "artisan";
  const isPhone = isPhoneInput(contact);
  const contactKeyboardType: "phone-pad" | "email-address" = isPhone ? "phone-pad" : "email-address";

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

  // ─── Register handler ──────────────────────────────────────────────────────

  const handleRegister = async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      Alert.alert("خطأ", "يرجى إدخال الاسم الكامل");
      return;
    }
    const rawContact = contact.trim();
    if (!isValidContact(rawContact)) {
      Alert.alert("خطأ", "يرجى إدخال بريد إلكتروني صحيح أو رقم هاتف صحيح");
      return;
    }
    if (!specialty) {
      Alert.alert("خطأ", "يرجى اختيار نوع الحساب أو التخصص");
      return;
    }

    btnScale.value = withSpring(0.96, { damping: 12 }, () => {
      btnScale.value = withSpring(1);
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (isPhoneInput(rawContact)) {
      // ── Phone registration: send OTP via WhatsApp (UltraMsg) ──
      setRegOtpSending(true);
      try {
        const location = await requestLocation();
        setSavedLocation(location);

        const endpoint = `${getServerUrl()}api/send-whatsapp-otp`;
        console.log("[OTP-Register] sending WhatsApp OTP to:", rawContact, "→", endpoint);
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: rawContact }),
        });
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) {
          const text = await res.text();
          console.error("[OTP-Register] non-JSON response:", text.slice(0, 300));
          throw new Error(`الخادم أعاد استجابة غير متوقعة (${res.status})`);
        }
        const data = await res.json() as { ok?: boolean; error?: string };
        console.log("[OTP-Register] server response:", data);

        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "فشل إرسال رمز التحقق");
        }

        console.log("[OTP-Register] WhatsApp OTP sent ✓");
        setRegOtpCode("");
        setRegOtpStep("otp");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err: any) {
        console.error("[OTP-Register] send error:", err?.message ?? err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("خطأ", err?.message ?? "تعذّر إرسال رمز التحقق");
      } finally {
        setRegOtpSending(false);
      }
    } else {
      // ── Email registration: create with email + password ──
      if (password.length < 6) {
        Alert.alert("خطأ", "كلمة المرور يجب أن تكون 6 أحرف على الأقل");
        return;
      }
      setLoading(true);
      try {
        const location = await requestLocation();
        const credential = await createUserWithEmailAndPassword(auth, rawContact, password);
        const uid = credential.user.uid;

        await ensureUserDocument(uid, rawContact, role, {
          name: trimmedName,
          specialty,
          location,
        });

        if (role === "artisan" && specialty) {
          const category = getCategoryForSpecialty(specialty);
          await createOrUpdateArtisan(uid, {
            name: trimmedName,
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
        Alert.alert("تم التسجيل", "تم إنشاء حسابك بنجاح!", [
          { text: "تسجيل الدخول", onPress: () => router.replace("/login") },
        ]);
      } catch (err: any) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const code = err?.code || "";
        if (code === "auth/email-already-in-use") {
          Alert.alert("خطأ", "هذا البريد مسجل مسبقاً");
        } else if (code === "auth/weak-password") {
          Alert.alert("خطأ", "كلمة المرور ضعيفة، استخدم 6 أحرف على الأقل");
        } else if (code === "auth/invalid-email") {
          Alert.alert("خطأ", "صيغة البريد الإلكتروني غير صحيحة");
        } else {
          Alert.alert("خطأ", "حدث خطأ أثناء إنشاء الحساب");
        }
      } finally {
        setLoading(false);
      }
    }
  };

  // ─── Verify WhatsApp OTP and complete registration ────────────────────────

  const handleVerifyRegisterOtp = async () => {
    if (regOtpCode.length !== 6) return;

    const trimmedName = fullName.trim();
    const rawContact  = contact.trim();
    const e164        = toE164(rawContact);

    setRegOtpVerifying(true);
    try {
      // 1. Verify OTP on server — returns a Firebase custom token
      const endpoint = `${getServerUrl()}api/verify-whatsapp-otp`;
      console.log("[OTP-Register] verifying WhatsApp OTP for", e164, "→", endpoint);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: rawContact, code: regOtpCode }),
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        const text = await res.text();
        console.error("[OTP-Register] non-JSON verify response:", text.slice(0, 300));
        throw new Error(`الخادم أعاد استجابة غير متوقعة (${res.status})`);
      }
      const data = await res.json() as { ok?: boolean; customToken?: string; uid?: string; e164?: string; error?: string };
      console.log("[OTP-Register] verify response:", { ok: data.ok, uid: data.uid });

      if (!res.ok || !data.ok || !data.customToken) {
        throw new Error(data.error ?? "الرمز غير صحيح أو منتهي الصلاحية");
      }

      // 2. Sign in to Firebase with the custom token
      const credential = await signInWithCustomToken(auth, data.customToken);
      const uid = credential.user.uid;
      console.log("[OTP-Register] signed in with custom token, uid:", uid);

      // 3. Create Firestore user document + artisan record
      await ensureUserDocument(uid, e164, role, {
        name: trimmedName,
        specialty,
        location: savedLocation,
      });

      if (role === "artisan" && specialty) {
        const category = getCategoryForSpecialty(specialty);
        await createOrUpdateArtisan(uid, {
          name: trimmedName,
          phone: e164,
          photoUri: null,
          specialty,
          category,
          location: savedLocation,
          bio: "",
          isAvailable: true,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/dashboard" as any);
    } catch (err: any) {
      console.error("[OTP-Register] verify error:", err?.message ?? err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", err?.message ?? "تعذّر التحقق من الرمز — يرجى المحاولة مجدداً");
    } finally {
      setRegOtpVerifying(false);
    }
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;
  const selectedSpecialtyLabel = ALL_OPTIONS.find((s) => s.key === specialty)?.label ?? "";
  const anyLoading = loading || regOtpSending;

  // ─── Render ───────────────────────────────────────────────────────────────

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
          <View style={styles.card}>
            {/* 1 ── الاسم الكامل */}
            <InputField
              label="الاسم الكامل"
              placeholder="أدخل اسمك الكامل"
              value={fullName}
              onChangeText={setFullName}
              icon={<Feather name="user" size={18} color={C.textSecondary} />}
              keyboardType="default"
              onSubmitEditing={() => contactRef.current?.focus()}
            />

            {/* 2 ── رقم الهاتف أو البريد */}
            <InputField
              label="رقم الهاتف أو البريد الإلكتروني"
              placeholder="07xxxxxxxx أو example@email.com"
              value={contact}
              onChangeText={setContact}
              icon={<Feather name="phone" size={18} color={C.textSecondary} />}
              keyboardType={contactKeyboardType}
              innerRef={contactRef}
              onSubmitEditing={() => isPhone ? undefined : passwordRef.current?.focus()}
            />

            {/* 3 ── نوع الحساب / التخصص */}
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

            {/* 4 ── كلمة المرور (email only) */}
            {!isPhone && (
              <InputField
                label="كلمة المرور"
                placeholder="أدخل كلمة المرور (6 أحرف على الأقل)"
                value={password}
                onChangeText={setPassword}
                icon={<Feather name="lock" size={18} color={C.textSecondary} />}
                secureTextEntry
                innerRef={passwordRef}
                returnKeyType="done"
                onSubmitEditing={handleRegister}
              />
            )}

            {/* Phone auth note */}
            {isPhone && (
              <View style={styles.phoneNote}>
                <Ionicons name="shield-checkmark-outline" size={16} color={C.accent} />
                <Text style={styles.phoneNoteText}>
                  سيتم إرسال رمز تحقق إلى رقمك عبر SMS
                </Text>
              </View>
            )}

            <Animated.View style={btnStyle}>
              <Pressable
                style={[styles.registerBtn, anyLoading && styles.btnDisabled]}
                onPress={handleRegister}
                disabled={anyLoading}
              >
                <LinearGradient
                  colors={[C.accent, C.accentLight]}
                  style={styles.registerGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {anyLoading ? (
                    <>
                      <ActivityIndicator size="small" color={C.primary} />
                      <Text style={styles.registerBtnText}>
                        {regOtpSending ? "جارٍ الإرسال..." : "جارٍ إنشاء الحساب..."}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.registerBtnText}>
                        {isPhone ? "إرسال رمز التحقق" : "إنشاء حساب"}
                      </Text>
                      <Feather name={isPhone ? "send" : "check"} size={18} color={C.primary} />
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </Animated.View>
          </View>

          <Pressable onPress={() => router.push("/login")} style={styles.loginLink}>
            <Text style={styles.loginLinkText}>
              لديك حساب؟{" "}
              <Text style={{ color: C.accent, fontFamily: "Cairo_600SemiBold" }}>سجّل دخولك</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Specialty picker modal ── */}
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

      {/* ── OTP verification modal (phone registration) ── */}
      <Modal
        visible={regOtpStep === "otp"}
        transparent
        animationType="slide"
        onRequestClose={() => setRegOtpStep("form")}
      >
        <Pressable style={styles.modalOverlay} onPress={() => {}}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconCircle}>
                <Ionicons name="shield-checkmark" size={22} color={C.accent} />
              </View>
              <Text style={styles.modalTitle}>رمز التحقق</Text>
            </View>

            <Text style={styles.modalDesc}>
              أُرسل رمز تحقق مكون من 6 أرقام عبر{" "}
              <Text style={styles.modalPhoneHighlight}>واتساب</Text>
              {" "}إلى الرقم{"\n"}
              <Text style={styles.modalPhoneHighlight}>{toE164(contact.trim())}</Text>
            </Text>

            <OtpInput value={regOtpCode} onChange={setRegOtpCode} />

            <Pressable
              style={[styles.modalSendBtn, (regOtpVerifying || regOtpCode.length < 6) && styles.btnDisabled]}
              onPress={handleVerifyRegisterOtp}
              disabled={regOtpVerifying || regOtpCode.length < 6}
            >
              <LinearGradient
                colors={[C.accent, C.accentLight]}
                style={styles.modalSendGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {regOtpVerifying ? (
                  <ActivityIndicator size="small" color={C.primary} />
                ) : (
                  <>
                    <Text style={styles.modalSendText}>تحقق وإنشاء الحساب</Text>
                    <Ionicons name="checkmark" size={18} color={C.primary} />
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable
              style={styles.modalCancelBtn}
              onPress={() => setRegOtpStep("form")}
            >
              <Text style={styles.modalCancelText}>إلغاء وتعديل الرقم</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  phoneNote: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(201,168,76,0.08)",
    borderRadius: 10, padding: 12,
  },
  phoneNoteText: {
    flex: 1, fontSize: 12, fontFamily: "Cairo_400Regular",
    color: C.textSecondary, textAlign: "right",
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

  // ── OTP Modal ──
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center", alignItems: "center", paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%", backgroundColor: C.card, borderRadius: 20,
    padding: 24, gap: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 10,
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center",
    gap: 12, justifyContent: "flex-end",
  },
  modalIconCircle: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: "rgba(201,168,76,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  modalTitle: { fontSize: 17, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  modalDesc: {
    fontSize: 13, fontFamily: "Cairo_400Regular",
    color: C.textSecondary, textAlign: "right", lineHeight: 22,
  },
  modalPhoneHighlight: { fontFamily: "Cairo_700Bold", color: C.accent, fontSize: 14 },
  modalSendBtn: { borderRadius: 12, overflow: "hidden" },
  modalSendGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 14, gap: 8,
  },
  modalSendText: { fontSize: 14, fontFamily: "Cairo_700Bold", color: C.primary },
  modalCancelBtn: {
    borderRadius: 12, borderWidth: 1.5, borderColor: C.border || "#E5E7EB",
    alignItems: "center", justifyContent: "center", paddingVertical: 12,
  },
  modalCancelText: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },

  // ── OTP boxes ──
  otpRow: {
    flexDirection: "row", justifyContent: "center",
    gap: 10, marginVertical: 4, position: "relative",
  },
  otpBox: {
    width: 44, height: 52, borderRadius: 10,
    backgroundColor: C.inputBg,
    borderWidth: 1.5, borderColor: "transparent",
    alignItems: "center", justifyContent: "center",
  },
  otpBoxActive: { borderColor: C.accent, backgroundColor: "rgba(201,168,76,0.06)" },
  otpBoxFilled: { borderColor: C.accent, backgroundColor: "#FFF" },
  otpChar: { fontSize: 20, fontFamily: "Cairo_700Bold", color: C.text },
  otpHiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },
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
