import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  updatePassword,
  type ConfirmationResult,
  type ApplicationVerifier,
  RecaptchaVerifier,
} from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ensureUserDocument } from "@/lib/db_logic";
import Colors from "@/constants/colors";
import FirebaseRecaptcha, {
  type FirebaseRecaptchaHandle,
} from "@/components/FirebaseRecaptcha";

// ─── Constants ────────────────────────────────────────────────────────────────

const CREDS_KEY = "forus.biometric.creds";
const RESEND_COUNTDOWN = 60; // seconds

const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainService: CREDS_KEY,
  requireAuthentication: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPhoneInput(s: string): boolean {
  const t = s.trim();
  return /^[\d\+]/.test(t) && !t.includes("@");
}

function toFirebaseEmail(contact: string): string {
  const trimmed = contact.trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed;
  return `${trimmed}@sanad.app`;
}

/**
 * Converts an Iraqi phone to E.164 format for Firebase Phone Auth.
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

interface SavedCreds {
  contact: string;
  password: string;
}

async function loadSavedCreds(): Promise<SavedCreds | null> {
  try {
    const available = await SecureStore.isAvailableAsync();
    if (!available) return null;
    const raw = await SecureStore.getItemAsync(CREDS_KEY, SECURE_OPTS);
    return raw ? (JSON.parse(raw) as SavedCreds) : null;
  } catch {
    return null;
  }
}

async function saveCreds(contact: string, password: string) {
  try {
    const available = await SecureStore.isAvailableAsync();
    if (!available) return;
    await SecureStore.setItemAsync(
      CREDS_KEY,
      JSON.stringify({ contact, password }),
      SECURE_OPTS
    );
  } catch {
    /* silently ignore */
  }
}

async function clearCreds() {
  try {
    const available = await SecureStore.isAvailableAsync();
    if (!available) return;
    await SecureStore.deleteItemAsync(CREDS_KEY, SECURE_OPTS);
  } catch {
    /* silently ignore */
  }
}

// ─── InputField ───────────────────────────────────────────────────────────────

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
  autoFocus = false,
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
  autoFocus?: boolean;
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          autoCapitalize="none"
          autoFocus={autoFocus}
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
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={styles.otpRow}
    >
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

// ─── OTP step type ────────────────────────────────────────────────────────────

type OtpStep = "verify" | "newpass";

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  // ── Email reset modal ──
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetContact, setResetContact] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // ── Phone OTP reset flow ──
  const [otpStep, setOtpStep] = useState<OtpStep | null>(null);
  const [otpPhone, setOtpPhone] = useState(""); // raw input (07xxx)
  const [otpSending, setOtpSending] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [confirmationResult, setConfirmationResult] =
    useState<ConfirmationResult | null>(null);
  const [phoneToken, setPhoneToken] = useState<string | null>(null); // idToken after OTP
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordUpdating, setPasswordUpdating] = useState(false);

  // ── reCAPTCHA (native only) ──
  const recaptchaRef = useRef<FirebaseRecaptchaHandle>(null);
  // Web reCAPTCHA container div id
  const webRecaptchaContainerId = "web-recaptcha-container";
  const webVerifierRef = useRef<ApplicationVerifier | null>(null);

  // ── Biometric ──
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [savedCreds, setSavedCreds] = useState<SavedCreds | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const contactKeyboardType = isPhoneInput(contact) ? "phone-pad" : "email-address";

  // ── Boot ──
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const [hasHw, isEnrolled, creds] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          loadSavedCreds(),
        ]);
        setBiometricAvailable(hasHw && isEnrolled);
        setSavedCreds(creds);
      } catch (err) {
        console.warn("Biometric init error:", err);
        setBiometricAvailable(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // ── Countdown timer for OTP resend ──
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ─── Sign-in logic ────────────────────────────────────────────────────────
  const performSignIn = useCallback(async (contactVal: string, passwordVal: string) => {
    const email = toFirebaseEmail(contactVal);
    const credential = await signInWithEmailAndPassword(auth, email, passwordVal);
    await ensureUserDocument(credential.user.uid, email);
    return credential;
  }, []);

  const handleLogin = async () => {
    if (!contact.trim() || !password) {
      Alert.alert("خطأ", "يرجى تعبئة جميع الحقول");
      return;
    }

    btnScale.value = withSpring(0.96, { damping: 12 }, () => {
      btnScale.value = withSpring(1);
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);

    try {
      await performSignIn(contact.trim(), password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/dashboard" as any);
      saveCreds(contact.trim(), password)
        .then(() => setSavedCreds({ contact: contact.trim(), password }))
        .catch(() => {});
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const code = err?.code || "";
      if (
        code === "auth/user-not-found" ||
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        Alert.alert("خطأ في تسجيل الدخول", "البريد الإلكتروني أو كلمة المرور غير صحيحة");
      } else if (code === "auth/too-many-requests") {
        Alert.alert("محاولات كثيرة", "تم حظر الحساب مؤقتاً، يرجى المحاولة لاحقاً");
      } else {
        Alert.alert("خطأ", "حدث خطأ أثناء تسجيل الدخول");
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Biometric login ───────────────────────────────────────────────────────
  const handleBiometricLogin = async () => {
    if (!savedCreds) return;
    setBiometricLoading(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "تسجيل الدخول بالبصمة",
        fallbackLabel: "استخدم كلمة المرور",
        cancelLabel: "إلغاء",
        disableDeviceFallback: false,
      });

      if (!result.success) {
        setBiometricLoading(false);
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await performSignIn(savedCreds.contact, savedCreds.password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/dashboard" as any);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const code = err?.code || "";
      if (
        code === "auth/user-not-found" ||
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        await clearCreds();
        setSavedCreds(null);
        Alert.alert(
          "انتهت صلاحية البصمة",
          "يرجى تسجيل الدخول يدوياً مرة أخرى لإعادة ربط البصمة"
        );
      } else {
        Alert.alert("خطأ", "حدث خطأ أثناء تسجيل الدخول بالبصمة");
      }
    } finally {
      setBiometricLoading(false);
    }
  };

  // ─── Forgot password ────────────────────────────────────────────────────────
  const handleForgotPassword = () => {
    const trimmed = contact.trim();
    if (isPhoneInput(trimmed)) {
      setOtpPhone(trimmed);
      // Begin OTP flow: send OTP immediately
      handleSendOtp(trimmed);
    } else {
      setResetContact(trimmed);
      setResetModalVisible(true);
    }
  };

  // ─── Email reset ───────────────────────────────────────────────────────────
  const handleSendResetEmail = async () => {
    const trimmed = resetContact.trim();
    if (!trimmed) {
      Alert.alert("خطأ", "يرجى إدخال البريد الإلكتروني");
      return;
    }
    setResetLoading(true);
    try {
      const email = toFirebaseEmail(trimmed);
      await sendPasswordResetEmail(auth, email);
      setResetModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "تم الإرسال ✓",
        "تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني، يرجى التحقق من صندوق الوارد"
      );
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const code = err?.code || "";
      if (code === "auth/user-not-found" || code === "auth/invalid-email") {
        Alert.alert("خطأ", "البريد الإلكتروني غير مسجل في النظام");
      } else if (code === "auth/too-many-requests") {
        Alert.alert("محاولات كثيرة", "يرجى الانتظار قليلاً ثم المحاولة مجدداً");
      } else {
        Alert.alert("خطأ", "تعذّر إرسال رابط إعادة التعيين، يرجى المحاولة لاحقاً");
      }
    } finally {
      setResetLoading(false);
    }
  };

  // ─── OTP: Send ────────────────────────────────────────────────────────────
  const handleSendOtp = async (rawPhone?: string) => {
    const phone = (rawPhone ?? otpPhone).trim();
    if (!phone) {
      Alert.alert("خطأ", "يرجى إدخال رقم الهاتف");
      return;
    }

    setOtpSending(true);
    try {
      // 1. Check Firestore for a registered account with this phone
      const usersSnap = await getDocs(
        query(collection(db, "users"), where("phone", "==", phone))
      );

      if (usersSnap.empty) {
        Alert.alert("خطأ", "رقم الهاتف غير مسجل لدينا");
        return;
      }

      // 2. Resolve ApplicationVerifier
      let verifier: ApplicationVerifier;
      if (Platform.OS === "web") {
        // On web: use Firebase's built-in RecaptchaVerifier
        let container = document.getElementById(webRecaptchaContainerId);
        if (!container) {
          container = document.createElement("div");
          container.id = webRecaptchaContainerId;
          container.style.display = "none";
          document.body.appendChild(container);
        }
        if (!webVerifierRef.current) {
          webVerifierRef.current = new RecaptchaVerifier(
            auth,
            webRecaptchaContainerId,
            { size: "invisible" }
          );
        }
        verifier = webVerifierRef.current;
      } else {
        // On native: use our WebView-backed verifier
        if (!recaptchaRef.current) {
          Alert.alert("خطأ", "لم يتم تحميل reCAPTCHA بعد — يرجى الانتظار لحظة ثم المحاولة");
          return;
        }
        verifier = recaptchaRef.current.verifier;
      }

      // 3. Send OTP
      const e164 = toE164(phone);
      const result = await signInWithPhoneNumber(auth, e164, verifier);
      setConfirmationResult(result);
      setOtpPhone(phone);
      setOtpCode("");
      setOtpStep("verify");
      setCountdown(RESEND_COUNTDOWN);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error("OTP send error:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const code: string = err?.code ?? "";
      if (code === "auth/invalid-phone-number") {
        Alert.alert("خطأ", "صيغة رقم الهاتف غير صحيحة");
      } else if (code === "auth/too-many-requests") {
        Alert.alert("محاولات كثيرة", "تم إيقاف الإرسال مؤقتاً، يرجى المحاولة لاحقاً");
      } else {
        Alert.alert("خطأ", "تعذّر إرسال رمز التحقق — يرجى المحاولة لاحقاً");
      }
    } finally {
      setOtpSending(false);
    }
  };

  // ─── OTP: Verify ─────────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) {
      Alert.alert("خطأ", "يرجى إدخال الرمز المكون من 6 أرقام");
      return;
    }
    if (!confirmationResult) return;

    setOtpVerifying(true);
    try {
      const credential = await confirmationResult.confirm(otpCode);
      // Get idToken from the phone-auth user to prove identity to the server
      const token = await credential.user.getIdToken();
      setPhoneToken(token);
      setOtpStep("newpass");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const code: string = err?.code ?? "";
      if (code === "auth/invalid-verification-code") {
        Alert.alert("رمز خاطئ", "الرمز الذي أدخلته غير صحيح — تحقق وأعد المحاولة");
      } else if (code === "auth/code-expired") {
        Alert.alert("رمز منتهي الصلاحية", "انتهت صلاحية الرمز — اطلب رمزاً جديداً");
      } else {
        Alert.alert("خطأ", "تعذّر التحقق من الرمز — يرجى المحاولة مجدداً");
      }
    } finally {
      setOtpVerifying(false);
    }
  };

  // ─── Password update ──────────────────────────────────────────────────────
  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert("خطأ", "يرجى إدخال كلمة المرور وتأكيدها");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("خطأ", "كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("خطأ", "كلمتا المرور غير متطابقتين");
      return;
    }
    if (!phoneToken) return;

    setPasswordUpdating(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: phoneToken, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        Alert.alert("خطأ", data?.error ?? "تعذّر تحديث كلمة المرور");
        return;
      }

      // Clear saved biometric creds since password changed
      await clearCreds();
      setSavedCreds(null);

      // Reset all OTP state
      resetOtpFlow();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "تم بنجاح ✓",
        "تم تغيير كلمة المرور بنجاح — يمكنك الآن تسجيل الدخول",
        [{ text: "حسناً", onPress: () => {} }]
      );
    } catch (err) {
      console.error("Password update error:", err);
      Alert.alert("خطأ", "تعذّر الاتصال بالخادم — يرجى التحقق من الإنترنت والمحاولة مجدداً");
    } finally {
      setPasswordUpdating(false);
    }
  };

  const resetOtpFlow = () => {
    setOtpStep(null);
    setOtpCode("");
    setOtpPhone("");
    setConfirmationResult(null);
    setPhoneToken(null);
    setNewPassword("");
    setConfirmPassword("");
    setCountdown(0);
    // Reset web verifier so next attempt gets a fresh one
    webVerifierRef.current = null;
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;
  const showBiometricBtn = biometricAvailable && !!savedCreds;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* Hidden reCAPTCHA for native phone auth */}
      {Platform.OS !== "web" && <FirebaseRecaptcha ref={recaptchaRef} />}

      <LinearGradient colors={["#0D1B3E", "#162452"]} style={styles.header}>
        <View style={[styles.headerContent, { paddingTop: topPad + 10 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-right" size={24} color="#FFF" />
          </Pressable>
          <View style={styles.headerTextGroup}>
            <Text style={styles.headerTitle}>تسجيل الدخول</Text>
            <Text style={styles.headerSub}>مرحباً بعودتك!</Text>
          </View>
          <View style={styles.headerIcon}>
            <Ionicons name="log-in" size={26} color={C.accent} />
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.welcomeRow}>
              <View style={styles.welcomeIconCircle}>
                <LinearGradient colors={[C.primary, "#1E2F60"]} style={styles.welcomeGradient}>
                  <Ionicons name="person" size={28} color={C.accent} />
                </LinearGradient>
              </View>
              <View style={styles.welcomeText}>
                <Text style={styles.welcomeTitle}>أهلاً وسهلاً</Text>
                <Text style={styles.welcomeSub}>سجّل دخولك للمتابعة</Text>
              </View>
            </View>

            <InputField
              label="البريد الإلكتروني أو رقم الهاتف"
              placeholder="example@email.com أو 07xxxxxxxx"
              value={contact}
              onChangeText={setContact}
              icon={<Feather name="user" size={18} color={C.textSecondary} />}
              keyboardType={contactKeyboardType}
              onSubmitEditing={() => passwordRef.current?.focus()}
            />

            <InputField
              label="كلمة المرور"
              placeholder="أدخل كلمة المرور"
              value={password}
              onChangeText={setPassword}
              icon={<Feather name="lock" size={18} color={C.textSecondary} />}
              secureTextEntry
              innerRef={passwordRef}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            <TouchableOpacity
              onPress={handleForgotPassword}
              style={styles.forgotBtn}
              activeOpacity={0.7}
              disabled={otpSending}
            >
              {otpSending ? (
                <ActivityIndicator size="small" color={C.accent} />
              ) : (
                <Text style={styles.forgotText}>نسيت كلمة المرور؟</Text>
              )}
            </TouchableOpacity>

            <Animated.View style={btnStyle}>
              <Pressable
                style={[styles.loginBtn, loading && styles.btnDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                <LinearGradient
                  colors={[C.accent, C.accentLight]}
                  style={styles.loginGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <>
                      <ActivityIndicator size="small" color={C.primary} />
                      <Text style={styles.loginBtnText}>جارٍ الدخول...</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.loginBtnText}>دخول</Text>
                      <Feather name="arrow-left" size={18} color={C.primary} />
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </Animated.View>

            {showBiometricBtn && (
              <TouchableOpacity
                style={[styles.biometricBtn, biometricLoading && styles.btnDisabled]}
                onPress={handleBiometricLogin}
                disabled={biometricLoading}
                activeOpacity={0.8}
              >
                {biometricLoading ? (
                  <ActivityIndicator size="small" color={C.accent} />
                ) : (
                  <MaterialCommunityIcons name="fingerprint" size={22} color={C.accent} />
                )}
                <Text style={styles.biometricText}>
                  {biometricLoading ? "جارٍ التحقق..." : "تسجيل الدخول بالبصمة"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <Pressable onPress={() => router.push("/register")} style={styles.registerLink}>
            <Text style={styles.registerLinkText}>
              ليس لديك حساب؟{" "}
              <Text style={{ color: C.accent, fontFamily: "Cairo_600SemiBold" }}>سجّل الآن</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Email reset modal ── */}
      <Modal
        visible={resetModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setResetModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setResetModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconCircle}>
                <Feather name="lock" size={22} color={C.accent} />
              </View>
              <Text style={styles.modalTitle}>إعادة تعيين كلمة المرور</Text>
            </View>

            <Text style={styles.modalDesc}>
              أدخل بريدك الإلكتروني المسجّل وسنرسل لك رابط إعادة التعيين
            </Text>

            <View style={[styles.inputRow, { marginTop: 4 }]}>
              <View style={styles.inputIcon}>
                <Feather name="mail" size={18} color={C.textSecondary} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="البريد الإلكتروني"
                placeholderTextColor={C.textMuted}
                value={resetContact}
                onChangeText={setResetContact}
                keyboardType="email-address"
                textAlign="right"
                autoCapitalize="none"
                autoFocus
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setResetModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSendBtn, resetLoading && styles.btnDisabled]}
                onPress={handleSendResetEmail}
                activeOpacity={0.8}
                disabled={resetLoading}
              >
                <LinearGradient
                  colors={[C.accent, C.accentLight]}
                  style={styles.modalSendGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {resetLoading ? (
                    <ActivityIndicator size="small" color={C.primary} />
                  ) : (
                    <>
                      <Text style={styles.modalSendText}>إرسال</Text>
                      <Feather name="send" size={15} color={C.primary} />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── OTP Verify modal ── */}
      <Modal
        visible={otpStep === "verify"}
        transparent
        animationType="slide"
        onRequestClose={resetOtpFlow}
      >
        <Pressable style={styles.modalOverlay} onPress={() => {}}>
          <View style={styles.modalCard}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalIconCircle}>
                <Ionicons name="shield-checkmark" size={22} color={C.accent} />
              </View>
              <Text style={styles.modalTitle}>رمز التحقق</Text>
            </View>

            <Text style={styles.modalDesc}>
              أُرسل رمز تحقق مكون من 6 أرقام إلى الرقم{"\n"}
              <Text style={styles.modalPhoneHighlight}>{otpPhone}</Text>
            </Text>

            {/* OTP input */}
            <OtpInput value={otpCode} onChange={setOtpCode} />

            {/* Verify button */}
            <TouchableOpacity
              style={[styles.modalSendBtn, (otpVerifying || otpCode.length < 6) && styles.btnDisabled]}
              onPress={handleVerifyOtp}
              activeOpacity={0.8}
              disabled={otpVerifying || otpCode.length < 6}
            >
              <LinearGradient
                colors={[C.accent, C.accentLight]}
                style={styles.modalSendGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {otpVerifying ? (
                  <ActivityIndicator size="small" color={C.primary} />
                ) : (
                  <>
                    <Text style={styles.modalSendText}>تحقق من الرمز</Text>
                    <Ionicons name="checkmark" size={18} color={C.primary} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Resend / countdown */}
            <View style={styles.resendRow}>
              {countdown > 0 ? (
                <Text style={styles.countdownText}>
                  إعادة الإرسال بعد{" "}
                  <Text style={styles.countdownNum}>{countdown}</Text> ث
                </Text>
              ) : (
                <TouchableOpacity
                  onPress={() => handleSendOtp(otpPhone)}
                  disabled={otpSending}
                  activeOpacity={0.7}
                >
                  <Text style={styles.resendText}>
                    {otpSending ? "جارٍ الإرسال..." : "إعادة إرسال الرمز"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Cancel */}
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={resetOtpFlow}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCancelText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── New password modal ── */}
      <Modal
        visible={otpStep === "newpass"}
        transparent
        animationType="slide"
        onRequestClose={resetOtpFlow}
      >
        <Pressable style={styles.modalOverlay} onPress={() => {}}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: "100%" }}
          >
            <View style={styles.modalCard}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View style={styles.modalIconCircle}>
                  <Feather name="lock" size={22} color={C.accent} />
                </View>
                <Text style={styles.modalTitle}>كلمة المرور الجديدة</Text>
              </View>

              <Text style={styles.modalDesc}>
                تم التحقق من هويتك بنجاح ✓{"\n"}أدخل كلمة المرور الجديدة
              </Text>

              {/* New password */}
              <InputField
                label="كلمة المرور الجديدة"
                placeholder="6 أحرف على الأقل"
                value={newPassword}
                onChangeText={setNewPassword}
                icon={<Feather name="lock" size={18} color={C.textSecondary} />}
                secureTextEntry
                autoFocus
                returnKeyType="next"
              />

              {/* Confirm password */}
              <InputField
                label="تأكيد كلمة المرور"
                placeholder="أعد إدخال كلمة المرور"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                icon={<Feather name="lock" size={18} color={C.textSecondary} />}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleUpdatePassword}
              />

              {/* Submit */}
              <TouchableOpacity
                style={[
                  styles.modalSendBtn,
                  passwordUpdating && styles.btnDisabled,
                ]}
                onPress={handleUpdatePassword}
                activeOpacity={0.8}
                disabled={passwordUpdating}
              >
                <LinearGradient
                  colors={[C.accent, C.accentLight]}
                  style={styles.modalSendGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {passwordUpdating ? (
                    <ActivityIndicator size="small" color={C.primary} />
                  ) : (
                    <>
                      <Text style={styles.modalSendText}>تغيير كلمة المرور</Text>
                      <Feather name="check" size={16} color={C.primary} />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={resetOtpFlow}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
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
    backgroundColor: C.card, borderRadius: 20, padding: 22, gap: 18,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
  },
  welcomeRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 4 },
  welcomeIconCircle: { width: 56, height: 56, borderRadius: 16, overflow: "hidden" },
  welcomeGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
  welcomeText: { flex: 1, alignItems: "flex-end" },
  welcomeTitle: { fontSize: 18, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  welcomeSub: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "right" },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.text, textAlign: "right" },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.inputBg, borderRadius: 12,
    borderWidth: 1.5, borderColor: "transparent",
    paddingHorizontal: 14, paddingVertical: 2, gap: 10,
  },
  inputFocused: { borderColor: C.accent, backgroundColor: "#FFF" },
  inputIcon: { width: 28, alignItems: "center" },
  input: {
    flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular",
    color: C.text, paddingVertical: 13, textAlign: "right",
  },
  eyeBtn: { padding: 6 },
  forgotBtn: {
    alignSelf: "flex-end", marginTop: -8,
    paddingVertical: 4, paddingHorizontal: 2,
    minHeight: 30, justifyContent: "center",
  },
  forgotText: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.accent },
  loginBtn: { borderRadius: 14, overflow: "hidden", marginTop: 4 },
  loginGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 15, paddingHorizontal: 24, gap: 8,
  },
  loginBtnText: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.primary },
  btnDisabled: { opacity: 0.6 },
  biometricBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 13, borderRadius: 14,
    borderWidth: 1.5, borderColor: "rgba(201,168,76,0.4)",
    backgroundColor: "rgba(201,168,76,0.06)",
  },
  biometricText: { fontSize: 15, fontFamily: "Cairo_600SemiBold", color: C.accent },
  registerLink: { alignItems: "center", paddingVertical: 8 },
  registerLinkText: { fontSize: 14, fontFamily: "Cairo_400Regular", color: C.textSecondary },

  // ── Modals ──
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
  modalPhoneHighlight: {
    fontFamily: "Cairo_700Bold", color: C.accent, fontSize: 14,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalCancelBtn: {
    borderRadius: 12, borderWidth: 1.5, borderColor: C.border || "#E5E7EB",
    alignItems: "center", justifyContent: "center", paddingVertical: 12,
  },
  modalCancelText: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  modalSendBtn: { borderRadius: 12, overflow: "hidden" },
  modalSendGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 14, gap: 8,
  },
  modalSendText: { fontSize: 14, fontFamily: "Cairo_700Bold", color: C.primary },

  // ── OTP boxes ──
  otpRow: {
    flexDirection: "row", justifyContent: "center",
    gap: 10, marginVertical: 8, position: "relative",
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
  otpHiddenInput: {
    position: "absolute", opacity: 0,
    width: 1, height: 1,
  },

  // ── Resend ──
  resendRow: { alignItems: "center", marginTop: -4 },
  countdownText: {
    fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary,
  },
  countdownNum: { fontFamily: "Cairo_700Bold", color: C.accent },
  resendText: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.accent },
});
