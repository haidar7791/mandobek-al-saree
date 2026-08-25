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
import { Feather, Ionicons, FontAwesome } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import {
  EmailAuthProvider,
  linkWithCredential,
  signInWithPhoneNumber,
  signInWithCustomToken,
  type ConfirmationResult,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import FirebaseRecaptcha, {
  type FirebaseRecaptchaHandle,
  getPhoneAuthErrorMessage,
} from "@/components/FirebaseRecaptcha";
import {
  ensureUserDocument,
  type GeoLocation,
} from "@/lib/db_logic";
import Colors from "@/constants/colors";
import { pickGoogleEmail } from "@/lib/google-email-picker";

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
// ── Backend URL resolution ─────────────────────────────────────────────────
//
// Priority order:
//   1. Cloud Run production URL  — always used if host ends with .run.app
//   2. EXPO_PUBLIC_SERVER_URL env var (explicit override)
//   3. Baked Replit domain (app.config.js) + forced :5000  (dev only)
//   4. EXPO_PUBLIC_DOMAIN env var + forced :5000            (dev only)
//   5. Hardcoded Replit fallback + :5000                    (dev only)
//
// Cloud Run serves on standard HTTPS (443) — no extra port needed.
// Replit dev backend runs on port 5000 (different from Metro on 80/443).

/** Cloud Run production backend — stable URL, never changes */
const CLOUD_RUN_BASE = "https://forus-backend-laoeoqcoza-ew.a.run.app/";

/** Replit dev backend fallback */
const REPLIT_BACKEND_HOST =
  "7ad1563a-fd03-4049-b8e0-44592245fa3b-00-124n16ica1aqg.pike.replit.dev";

function getServerUrl(): string {
  // 1. Explicit env override (e.g. set to Cloud Run URL in EAS builds)
  const explicitUrl = process.env.EXPO_PUBLIC_SERVER_URL;
  if (
    typeof explicitUrl === "string" &&
    explicitUrl.startsWith("https://") &&
    !explicitUrl.includes("localhost") &&
    !explicitUrl.includes("127.0.0.1")
  ) {
    const url = explicitUrl.endsWith("/") ? explicitUrl : explicitUrl + "/";
    console.log("[API-URL] env-override →", url);
    return url;
  }

  // Helper: strip proto/port and force :5000 (Replit dev only)
  function withPort5000(raw: string): string {
    const noProto = raw.replace(/^https?:\/\//, "");
    const noPort  = noProto.replace(/:\d+\/?$/, "").replace(/\/$/, "");
    // Cloud Run hosts must NOT get :5000
    if (noPort.endsWith(".run.app")) return `https://${noPort}/`;
    return `https://${noPort}:5000/`;
  }

  // 2. Domain baked into native bundle by app.config.js at Metro startup
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

  // 3. EXPO_PUBLIC_DOMAIN env var (baked by Metro, may include :5000)
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

  // 4. Cloud Run production — stable fallback for production builds
  console.log("[API-URL] cloud-run →", CLOUD_RUN_BASE);
  return CLOUD_RUN_BASE;
}

/** Returns true if the input looks like a phone number (starts with digit or +, no @) */
function isPhoneInput(s: string): boolean {
  const t = s.trim();
  return /^[\d\+]/.test(t) && !t.includes("@");
}

/** Removes punctuation/+ and keeps phone input in Iraqi international digits. */
function sanitizePhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("00964")) return digits.slice(2);
  if (digits.startsWith("964")) return digits;
  if (digits.startsWith("0")) return `964${digits.slice(1)}`;
  return digits;
}

/** Validates that the contact is either a non-empty email or a phone (min 7 digits) */
function isValidContact(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (isPhoneInput(t)) return /[\d]{7,}/.test(t); // at least 7 digits
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t); // classic email regex
}

function toFirebaseEmail(contact: string): string {
  const trimmed = contact.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : `${trimmed}@sanad.app`;
}

/**
 * Converts any Iraqi phone input to E.164 (+9647xxxxxxxx).
 * Strips spaces, dashes, parens, and plus signs, then normalises:
 *   00964/+964/964 + optional leading zero → +964 7xxxxxxx
 *   07xxxxxxxx                             → +9647xxxxxxxx
 *   7xxxxxxxx                              → +9647xxxxxxxx
 */
function toE164(phone: string): string {
  const t = sanitizePhoneInput(phone);

  if (t.startsWith("00964")) {
    const rest = t.slice(5);
    return "+964" + (rest.startsWith("0") ? rest.slice(1) : rest);
  }
  if (t.startsWith("964")) {
    const rest = t.slice(3);
    return "+964" + (rest.startsWith("0") ? rest.slice(1) : rest);
  }
  if (t.startsWith("07")) return "+964" + t.slice(1);
  if (t.startsWith("0"))  return "+964" + t.slice(1);
  if (t.startsWith("7"))  return "+964" + t;
  return "+964" + t;
}

function requireIraqiMobileE164(phone: string): string {
  const normalized = toE164(phone);
  if (!/^\+9647\d{9}$/.test(normalized)) {
    throw new Error("يرجى إدخال رقم هاتف عراقي محمول صحيح بصيغة +9647xxxxxxxxx");
  }
  return normalized;
}

async function phoneIsRegistered(phone: string): Promise<boolean> {
  const normalized = requireIraqiMobileE164(phone);
  const internationalDigits = normalized.slice(1);
  const local = `0${internationalDigits.slice(3)}`;
  const candidates = [local, normalized, internationalDigits];
  const snapshot = await getDoc(doc(db, "phoneIndex", normalized));
  console.log("[PhoneLookup][register]", {
    input: phone,
    candidates,
    userDocument: snapshot.exists() ? snapshot.data() : null,
  });
  return snapshot.exists();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      const error: any = new Error("انتهت مهلة الاتصال");
      error.code = "timeout";
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const C = Colors.light;
const PHONE_OTP_TIMEOUT_MS = 5 * 60 * 1000;

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

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState("");
  const [contact, setContact] = useState(""); // phone or email
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // ── Firebase Phone Auth registration flow ──
  const [regOtpStep, setRegOtpStep] = useState<"form" | "otp">("form");
  const [regOtpCode, setRegOtpCode] = useState("");
  const [regOtpSending, setRegOtpSending] = useState(false);
  const [regOtpVerifying, setRegOtpVerifying] = useState(false);
  const [phoneConfirmation, setPhoneConfirmation] = useState<ConfirmationResult | null>(null);
  const [savedLocation, setSavedLocation] = useState<GeoLocation | null>(null);
  const recaptchaRef = useRef<FirebaseRecaptchaHandle>(null);

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

  // Every new account starts as a client. The user can choose/change their
  // professional specialty later from the profile screen.
  const role: "client" = "client";
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

  // Google is used only to choose an email from the device. It switches the
  // registration method to email and fills the existing email field; the
  // current email OTP flow remains unchanged.
  const handleGoogleEmailPick = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    try {
      const email = await pickGoogleEmail();
      if (!email) return;

      setAuthMethod("email");
      setContact(email);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => passwordRef.current?.focus(), 150);
    } catch (err: any) {
      console.error("[Google-Email-Picker] register error:", err?.message ?? err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("تعذّر اختيار حساب Google", err?.message ?? "تعذّر جلب حسابات Google على الجهاز");
    } finally {
      setGoogleLoading(false);
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
    if (isPhone && !/^\+?[\d\s()-]+$/.test(rawContact)) {
      Alert.alert("صيغة الرقم غير صحيحة", "أدخل رقم الهاتف العراقي بصيغة 07XXXXXXXX ثم أعد المحاولة.");
      return;
    }
    if (!isValidContact(rawContact)) {
      Alert.alert("خطأ", isPhone
        ? "يرجى إدخال رقم هاتف عراقي صحيح بصيغة 07XXXXXXXX"
        : "يرجى إدخال بريد إلكتروني صحيح");
      return;
    }
    btnScale.value = withSpring(0.96, { damping: 12 }, () => {
      btnScale.value = withSpring(1);
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (authMethod === "phone") {
      // ── Phone registration: Firebase Phone Auth ──
      setRegOtpSending(true);
      setLoading(true);
      try {
        const registered = await withTimeout(
          phoneIsRegistered(rawContact),
          PHONE_OTP_TIMEOUT_MS,
        );
        if (registered) {
          Alert.alert("لديك حساب بالفعل", "لديك حساب بالفعل، يرجى تسجيل الدخول");
          return;
        }

        const location = await requestLocation();
        setSavedLocation(location);
        const phone = requireIraqiMobileE164(rawContact);
        recaptchaRef.current?.reset();
        const verifier = recaptchaRef.current?.verifier;
        if (!verifier) throw new Error("تعذّر تجهيز التحقق الآمن، أعد فتح الشاشة");
        const confirmation = await withTimeout(
          signInWithPhoneNumber(auth, phone, verifier),
          PHONE_OTP_TIMEOUT_MS,
        );
        setPhoneConfirmation(confirmation);
        setRegOtpCode("");
        setRegOtpStep("otp");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err: any) {
        console.error("[OTP-Register] send error:", err?.message ?? err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const message = err?.code === "timeout"
          ? "استغرق الاتصال أكثر من 5 دقائق. تحقق من الإنترنت واضغط إعادة المحاولة."
          : getPhoneAuthErrorMessage(err);
        Alert.alert("تعذّر إرسال رمز التحقق", message, [
          { text: "إغلاق", style: "cancel" },
          { text: "إعادة المحاولة", onPress: () => void handleRegister() },
        ]);
      } finally {
        setRegOtpSending(false);
        setLoading(false);
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

  // ─── Verify Firebase Phone OTP and complete registration ────────────────

  const handleVerifyRegisterOtp = async () => {
    if (regOtpCode.length !== 6) return;

    const trimmedName = fullName.trim();
    const rawContact  = contact.trim();
    const e164        = toE164(rawContact);

    setRegOtpVerifying(true);
    try {
      if (!phoneConfirmation) throw new Error("انتهت جلسة التحقق، أرسل رمزاً جديداً");
      const credential = await withTimeout(
        phoneConfirmation.confirm(regOtpCode),
        PHONE_OTP_TIMEOUT_MS,
      );
      const uid = credential.user.uid;

      try {
        await linkWithCredential(
          credential.user,
          EmailAuthProvider.credential(toFirebaseEmail(rawContact), password),
        );
      } catch (linkErr: any) {
        if (linkErr?.code !== "auth/provider-already-linked") throw linkErr;
      }

      // Create Firestore user document after the phone identity is confirmed.
      await ensureUserDocument(uid, e164, role, {
        name: trimmedName,
        location: savedLocation,
        phone: rawContact,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/dashboard" as any);
    } catch (err: any) {
      console.error("[OTP-Register] verify error:", err?.message ?? err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = err?.code === "timeout"
        ? "استغرق التحقق أكثر من 5 دقائق. تحقق من الإنترنت واضغط إعادة المحاولة."
        : getPhoneAuthErrorMessage(err);
      Alert.alert("تعذّر التحقق من الرمز", message, [
        { text: "إغلاق", style: "cancel" },
        { text: "إعادة المحاولة", onPress: () => void handleVerifyRegisterOtp() },
      ]);
    } finally {
      setRegOtpVerifying(false);
      setLoading(false);
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
        location: savedLocation,
      });

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
  const anyLoading = loading || regOtpSending || emailOtpSending || googleLoading;

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
                  style={[styles.input, isPhone && styles.phoneInput]}
                  placeholder={isPhone ? "07xxxxxxxxxx" : "example@email.com"}
                  placeholderTextColor={C.textMuted}
                  value={contact}
                   onChangeText={(value) => setContact(isPhone ? sanitizePhoneInput(value) : value)}
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

            {/* 4 ── كلمة المرور (دائماً ظاهرة) ── */}
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

            {/* Firebase SMS OTP for phone, Email OTP for email */}
            <View style={styles.phoneNote}>
              <Ionicons
                name={isPhone ? "phone-portrait-outline" : "mail-outline"}
                size={16}
                color={C.accent}
              />
              <Text style={styles.phoneNoteText}>
                {isPhone
                  ? "سيتم إرسال رمز تحقق SMS إلى رقمك عبر Firebase"
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
            <Pressable
              style={[styles.googleBtn, googleLoading && styles.btnDisabled]}
              onPress={handleGoogleEmailPick}
              disabled={anyLoading}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#4285F4" />
              ) : (
                <FontAwesome name="google" size={20} color="#4285F4" />
              )}
              <Text style={styles.googleBtnText}>
                {googleLoading ? "جارٍ اختيار البريد..." : "اختيار البريد بواسطة Google"}
              </Text>
            </Pressable>
          </View>

          <Pressable onPress={() => router.push("/login")} style={styles.loginLink}>
            <Text style={styles.loginLinkText}>
              لديك حساب؟{" "}
              <Text style={{ color: C.accent, fontFamily: "Cairo_600SemiBold" }}>سجّل دخولك</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <FirebaseRecaptcha ref={recaptchaRef} />

      {/* ── OTP modal: Firebase Phone Auth ── */}
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
                <Ionicons name="phone-portrait-outline" size={22} color={C.accent} />
              </View>
              <Text style={styles.modalTitle}>رمز التحقق — SMS</Text>
            </View>

            <Text style={styles.modalDesc}>
              أُرسل رمز مكون من 6 أرقام عبر رسالة SMS إلى{" "}
              {"\n"}
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
  phoneInput: { writingDirection: "ltr", textAlign: "left" },
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
  googleBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 13, borderRadius: 14,
    borderWidth: 1.5, borderColor: "#D9DDE5", backgroundColor: "#FFF",
    marginTop: -4,
  },
  googleBtnText: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.text },
  btnDisabled: { opacity: 0.6 },
  loginLink: { alignItems: "center", paddingVertical: 8 },
  loginLinkText: { fontSize: 14, fontFamily: "Cairo_400Regular", color: C.textSecondary },

  // ──  OTP Modal ──
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
