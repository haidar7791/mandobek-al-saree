import React, { useState, useRef, forwardRef, useImperativeHandle, useEffect } from "react";
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
// ─── Backend URL ─────────────────────────────────────────────────────────────
//
// Replit port mapping (.replit):
//   localPort 8081 → externalPort 80   (Metro / frontend — serves HTML)
//   localPort 5000 → externalPort 5000 (Express / backend — serves JSON API)
//
// Default HTTPS (port 443 / port 80) goes to Metro.
// We MUST always use :5000 for API calls, otherwise Metro intercepts and returns HTML.
//
// Priority order:
//   1. Baked domain from app.config.js (REACT_NATIVE_PACKAGER_HOSTNAME) + forced :5000
//   2. EXPO_PUBLIC_DOMAIN (baked by Metro at bundle time) + forced :5000
//   3. Hardcoded constant — verified working via curl from external devices

const REPLIT_BACKEND_HOST =
  "7ad1563a-fd03-4049-b8e0-44592245fa3b-00-124n16ica1aqg.pike.replit.dev";

function getServerUrl(): string {
  // Helper: take a raw host/url string, strip any existing port, force :5000, return base URL
  function withPort5000(raw: string): string {
    // Remove protocol prefix if present
    const noProto = raw.replace(/^https?:\/\//, "");
    // Remove any existing port
    const noPort = noProto.replace(/:\d+\/?$/, "").replace(/\/$/, "");
    return `https://${noPort}:5000/`;
  }

  // 1. Domain baked into native bundle by app.config.js at Metro startup
  const bakedDomain: unknown = (Constants.expoConfig as any)?.extra?.replitDomain;
  if (
    typeof bakedDomain === "string" &&
    bakedDomain.length > 0 &&
    bakedDomain.includes(".") &&
    !bakedDomain.includes("127.0.0.1") &&
    !bakedDomain.includes("localhost")
  ) {
    const url = withPort5000(bakedDomain);
    console.log("[API-URL] baked-domain →", url);
    return url;
  }

  // 2. EXPO_PUBLIC_DOMAIN env var (baked by Metro, may already include :5000)
  const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (
    typeof envDomain === "string" &&
    envDomain.length > 0 &&
    !envDomain.includes("127.0.0.1") &&
    !envDomain.includes("localhost")
  ) {
    const url = withPort5000(envDomain);
    console.log("[API-URL] env-domain →", url);
    return url;
  }

  // 3. Hardcoded fallback — external curl confirmed HTTP 200 on this URL
  const url = `https://${REPLIT_BACKEND_HOST}:5000/`;
  console.log("[API-URL] hardcoded-fallback →", url);
  return url;
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

interface OtpInputHandle {
  focus(): void;
}

const OtpInput = forwardRef<OtpInputHandle, { value: string; onChange: (v: string) => void }>(
  function OtpInput({ value, onChange }, ref) {
    const inputRef = useRef<TextInput>(null);

    // Expose focus() so the parent Modal's onShow can trigger the keyboard
    useImperativeHandle(ref, () => ({
      focus() {
        inputRef.current?.focus();
      },
    }));

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
          showSoftInputOnFocus
          autoFocus={false} // controlled manually via onShow to work inside Modal
        />
      </Pressable>
    );
  }
);

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

  // ── Email OTP flow ──
  const [emailOtpStep, setEmailOtpStep] = useState<"form" | "otp">("form");
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [emailOtpSending, setEmailOtpSending] = useState(false);
  const [emailOtpVerifying, setEmailOtpVerifying] = useState(false);

  const contactRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const otpInputRef = useRef<OtpInputHandle>(null);

  // ── Explicit auth method toggle ──
  const [authMethod, setAuthMethod] = useState<"phone" | "email">("phone");

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  const role: "client" | "artisan" = specialty === "client" ? "client" : "artisan";
  const isPhone = authMethod === "phone";
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

    if (authMethod === "phone") {
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
          body: JSON.stringify({ phone: rawContact, forRegistration: true }),
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
      // ── Email registration: send OTP to email ──
      setEmailOtpSending(true);
      try {
        const location = await requestLocation();
        setSavedLocation(location);

        const endpoint = `${getServerUrl()}api/send-email-otp`;
        console.log("[OTP-Register] sending Email OTP to:", rawContact, "→", endpoint);
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: rawContact, forRegistration: true }),
        });
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) {
          const text = await res.text();
          console.error("[OTP-Register] non-JSON email response:", text.slice(0, 300));
          throw new Error(`الخادم أعاد استجابة غير متوقعة (${res.status})`);
        }
        const data = await res.json() as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? "فشل إرسال رمز التحقق");

        console.log("[OTP-Register] Email OTP sent ✓");
        setEmailOtpCode("");
        setEmailOtpStep("otp");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err: any) {
        console.error("[OTP-Register] email send error:", err?.message ?? err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("خطأ", err?.message ?? "تعذّر إرسال رمز التحقق");
      } finally {
        setEmailOtpSending(false);
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
        body: JSON.stringify({ phone: rawContact, code: regOtpCode, password, forRegistration: true }),
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

  // ─── Verify Email OTP and complete registration ──────────────────────────

  const handleVerifyEmailOtp = async () => {
    if (emailOtpCode.length !== 6) return;

    const trimmedName = fullName.trim();
    const rawContact  = contact.trim();

    setEmailOtpVerifying(true);
    try {
      const endpoint = `${getServerUrl()}api/verify-email-otp`;
      console.log("[OTP-Register] verifying Email OTP for", rawContact, "→", endpoint);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: rawContact, code: emailOtpCode, password }),
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        const text = await res.text();
        console.error("[OTP-Register] non-JSON email verify response:", text.slice(0, 300));
        throw new Error(`الخادم أعاد استجابة غير متوقعة (${res.status})`);
      }
      const data = await res.json() as { ok?: boolean; customToken?: string; uid?: string; email?: string; error?: string };

      if (!res.ok || !data.ok || !data.customToken) {
        throw new Error(data.error ?? "الرمز غير صحيح أو منتهي الصلاحية");
      }

      const credential = await signInWithCustomToken(auth, data.customToken);
      const uid = credential.user.uid;
      console.log("[OTP-Register] email: signed in with custom token, uid:", uid);

      await ensureUserDocument(uid, rawContact, role, {
        name: trimmedName,
        specialty,
        location: savedLocation,
      });

      if (role === "artisan" && specialty) {
        const category = getCategoryForSpecialty(specialty);
        await createOrUpdateArtisan(uid, {
          name: trimmedName,
          phone: "",
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
      console.error("[OTP-Register] email verify error:", err?.message ?? err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", err?.message ?? "تعذّر التحقق من الرمز — يرجى المحاولة مجدداً");
    } finally {
      setEmailOtpVerifying(false);
    }
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;
  const selectedSpecialtyLabel = ALL_OPTIONS.find((s) => s.key === specialty)?.label ?? "";
  const anyLoading = loading || regOtpSending || emailOtpSending;

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

            {/* 2 ── رقم الهاتف أو البريد — مع زر تبديل صريح */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>
                {isPhone ? "رقم الهاتف" : "البريد الإلكتروني"}
              </Text>
              <View style={[styles.inputRow, styles.inputRowFull]}>
                <View style={styles.inputIcon}>
                  <Feather
                    name={isPhone ? "phone" : "mail"}
                    size={18}
                    color={C.textSecondary}
                  />
                </View>
                <TextInput
                  ref={contactRef}
                  style={styles.input}
                  placeholder={isPhone ? "07xxxxxxxxxx" : "example@email.com"}
                  placeholderTextColor={C.textMuted}
                  value={contact}
                  onChangeText={setContact}
                  keyboardType={contactKeyboardType}
                  textAlign="right"
                  textAlignVertical="center"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  returnKeyType="next"
                />
              </View>
              {/* Toggle link */}
              <Pressable
                onPress={() => {
                  setAuthMethod(isPhone ? "email" : "phone");
                  setContact("");
                  setTimeout(() => contactRef.current?.focus(), 100);
                }}
                style={styles.toggleMethodBtn}
                hitSlop={6}
              >
                <Text style={styles.toggleMethodText}>
                  {isPhone
                    ? "استخدام البريد الإلكتروني بدلاً من ذلك"
                    : "استخدام رقم الهاتف بدلاً من ذلك"}
                </Text>
              </Pressable>
            </View>

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

            {/* 4 ── كلمة المرور (دائماً ظاهرة) */}
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

            {/* Note: WhatsApp OTP for phone, Email OTP for email */}
            <View style={styles.phoneNote}>
              <Ionicons
                name={isPhone ? "logo-whatsapp" : "mail-outline"}
                size={16}
                color={C.accent}
              />
              <Text style={styles.phoneNoteText}>
                {isPhone
                  ? "سيتم إرسال رمز تحقق إلى رقمك عبر واتساب"
                  : "سيتم إرسال رمز تحقق إلى بريدك الإلكتروني"}
              </Text>
            </View>

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
                      <Text style={styles.registerBtnText}>جارٍ الإرسال...</Text>
                    </>
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

      {/* ── OTP modal: WhatsApp (phone) ── */}
      <Modal
        visible={regOtpStep === "otp"}
        transparent
        animationType="slide"
        onRequestClose={() => setRegOtpStep("form")}
        onShow={() => setTimeout(() => otpInputRef.current?.focus(), 300)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => {}}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconCircle}>
                <Ionicons name="logo-whatsapp" size={22} color={C.accent} />
              </View>
              <Text style={styles.modalTitle}>رمز التحقق — واتساب</Text>
            </View>

            <Text style={styles.modalDesc}>
              أُرسل رمز مكون من 6 أرقام عبر{" "}
              <Text style={styles.modalPhoneHighlight}>واتساب</Text>
              {" "}إلى{"\n"}
              <Text style={styles.modalPhoneHighlight}>{toE164(contact.trim())}</Text>
            </Text>

            <OtpInput ref={otpInputRef} value={regOtpCode} onChange={setRegOtpCode} />

            <Pressable
              style={[styles.modalSendBtn, (regOtpVerifying || regOtpCode.length < 6) && styles.btnDisabled]}
              onPress={handleVerifyRegisterOtp}
              disabled={regOtpVerifying || regOtpCode.length < 6}
            >
              <LinearGradient colors={[C.accent, C.accentLight]} style={styles.modalSendGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {regOtpVerifying ? <ActivityIndicator size="small" color={C.primary} /> : (
                  <><Text style={styles.modalSendText}>تحقق وإنشاء الحساب</Text><Ionicons name="checkmark" size={18} color={C.primary} /></>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable style={styles.modalCancelBtn} onPress={() => setRegOtpStep("form")}>
              <Text style={styles.modalCancelText}>إلغاء وتعديل الرقم</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── OTP modal: Email ── */}
      <Modal
        visible={emailOtpStep === "otp"}
        transparent
        animationType="slide"
        onRequestClose={() => setEmailOtpStep("form")}
        onShow={() => setTimeout(() => otpInputRef.current?.focus(), 300)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => {}}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconCircle}>
                <Ionicons name="mail" size={22} color={C.accent} />
              </View>
              <Text style={styles.modalTitle}>رمز التحقق — البريد</Text>
            </View>

            <Text style={styles.modalDesc}>
              أُرسل رمز مكون من 6 أرقام إلى{"\n"}
              <Text style={styles.modalPhoneHighlight}>{contact.trim()}</Text>
              {"\n"}تحقق من صندوق الوارد (أو Spam)
            </Text>

            <OtpInput ref={otpInputRef} value={emailOtpCode} onChange={setEmailOtpCode} />

            <Pressable
              style={[styles.modalSendBtn, (emailOtpVerifying || emailOtpCode.length < 6) && styles.btnDisabled]}
              onPress={handleVerifyEmailOtp}
              disabled={emailOtpVerifying || emailOtpCode.length < 6}
            >
              <LinearGradient colors={[C.accent, C.accentLight]} style={styles.modalSendGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {emailOtpVerifying ? <ActivityIndicator size="small" color={C.primary} /> : (
                  <><Text style={styles.modalSendText}>تحقق وإنشاء الحساب</Text><Ionicons name="checkmark" size={18} color={C.primary} /></>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable style={styles.modalCancelBtn} onPress={() => setEmailOtpStep("form")}>
              <Text style={styles.modalCancelText}>إلغاء وتعديل البريد</Text>
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
  inputRowFull: { paddingVertical: 0 },
  // Toggle link beneath the contact field
  toggleMethodBtn: { alignSelf: "flex-end", paddingVertical: 4 },
  toggleMethodText: {
    fontSize: 12, fontFamily: "Cairo_600SemiBold",
    color: C.accent, textDecorationLine: "underline",
  },
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
