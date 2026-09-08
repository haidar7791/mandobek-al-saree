import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, FontAwesome, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { auth } from "@/lib/firebase";
import { ensureUserDocument } from "@/lib/db_logic";
import { getApiUrl, GOOGLE_EMAIL_LOGIN_PATH } from "@/lib/config";
import {
  createUserWithEmailAndPassword,
  signInWithCustomToken,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { pickGoogleEmail } from "@/lib/google-email-picker";

const C = Colors.light;

type ApiResponse = {
  ok?: boolean;
  exists?: boolean;
  customToken?: string;
  email?: string;
  error?: string;
  message?: string;
};

async function readApiJson(response: Response): Promise<ApiResponse> {
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (!raw.trim()) {
    throw new Error(`الخادم لم يُرجع استجابة (HTTP ${response.status})`);
  }

  let data: ApiResponse;
  try {
    data = JSON.parse(raw) as ApiResponse;
  } catch {
    console.error("[API] Non-JSON response", {
      status: response.status,
      contentType,
      preview: raw.slice(0, 240),
    });
    if (response.status === 404) {
      throw new Error("خدمة المصادقة غير محدثة على Google Cloud. يرجى نشر Backend الأخير.");
    }
    throw new Error(`الخادم أرجع استجابة غير صالحة (HTTP ${response.status})`);
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.error ?? data.message ?? `فشل الطلب (HTTP ${response.status})`);
  }

  return data;
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function InputField({
  label,
  placeholder,
  value,
  onChangeText,
  icon,
  secureTextEntry = false,
  inputRef,
  onSubmitEditing,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  icon: React.ReactNode;
  secureTextEntry?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  onSubmitEditing?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputRow, focused && styles.inputFocused]}>
        <View style={styles.inputIcon}>{icon}</View>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          keyboardType="default"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secureTextEntry && !visible}
          textAlign="right"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={onSubmitEditing ? "next" : "done"}
        />
        {secureTextEntry && (
          <Pressable
            onPress={() => setVisible((current) => !current)}
            style={styles.eyeButton}
            hitSlop={8}
          >
            <Feather name={visible ? "eye-off" : "eye"} size={18} color={C.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountPassword, setNewAccountPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [forgotVisible, setForgotVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 38) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 24) : insets.bottom;

  const showError = (message: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Alert.alert("تعذّر إكمال العملية", message);
  };

  const handleManualLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!validEmail(normalizedEmail)) {
      showError("يرجى إدخال بريد إلكتروني صحيح");
      return;
    }
    if (!password) {
      showError("يرجى إدخال كلمة المرور");
      return;
    }

    setLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      await ensureUserDocument(credential.user.uid, normalizedEmail);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/dashboard" as any);
    } catch (error: any) {
      const code = error?.code ?? "";
      if (
        code === "auth/user-not-found" ||
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        showError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
      } else if (code === "auth/too-many-requests") {
        showError("تم تجاوز عدد المحاولات، يرجى المحاولة لاحقاً");
      } else {
        showError("حدث خطأ أثناء تسجيل الدخول");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleEmailPick = async () => {
    if (googleLoading || loading || createLoading) return;

    setGoogleLoading(true);
    try {
      const selection = await pickGoogleEmail();
      if (!selection?.email) return;

      const selectedEmail = selection.email.trim().toLowerCase();
      const response = await fetch(getApiUrl(GOOGLE_EMAIL_LOGIN_PATH), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: selectedEmail }),
      });
      const data = await readApiJson(response);

      if (data.exists && data.customToken) {
        const credential = await signInWithCustomToken(auth, data.customToken);
        await ensureUserDocument(credential.user.uid, selectedEmail);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/dashboard" as any);
        return;
      }

      // New email: keep this on the same screen and show only the two fields
      // needed to create the account. No email OTP or verification code is sent.
      setGoogleEmail(selectedEmail);
      setNewAccountName("");
      setNewAccountPassword("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => newPasswordRef.current?.focus(), 200);
    } catch (error: any) {
      console.error("[Google email auth]", error);
      showError(error?.message ?? "تعذّر اختيار حساب Google");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleCreateGoogleAccount = async () => {
    const selectedEmail = googleEmail?.trim().toLowerCase() ?? "";
    const name = newAccountName.trim();

    if (!selectedEmail) return;
    if (!name) {
      showError("يرجى إدخال الاسم الكامل");
      return;
    }
    if (newAccountPassword.length < 6) {
      showError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }

    setCreateLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        selectedEmail,
        newAccountPassword,
      );
      await ensureUserDocument(credential.user.uid, selectedEmail, "client", {
        name,
        specialty: "client",
        location: null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/dashboard" as any);
    } catch (error: any) {
      const code = error?.code ?? "";
      if (code === "auth/email-already-in-use") {
        showError("هذا البريد مسجل مسبقاً. استخدم الدخول اليدوي.");
      } else if (code === "auth/weak-password") {
        showError("كلمة المرور ضعيفة، استخدم 6 أحرف على الأقل");
      } else {
        showError("حدث خطأ أثناء إنشاء الحساب");
      }
    } finally {
      setCreateLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = forgotEmail.trim().toLowerCase();
    if (!validEmail(normalizedEmail)) {
      showError("يرجى إدخال بريد إلكتروني صحيح");
      return;
    }

    setForgotLoading(true);
    try {
      const response = await fetch(getApiUrl("/api/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: normalizedEmail }),
      });
      await readApiJson(response);
      setForgotVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "تم الإرسال",
        `تم إرسال رابط إعادة تعيين كلمة المرور إلى ${normalizedEmail}`,
      );
    } catch (error: any) {
      showError(error?.message ?? "تعذّر إرسال رابط إعادة التعيين");
    } finally {
      setForgotLoading(false);
    }
  };

  const renderBrand = () => (
    <View style={styles.brand}>
      <View style={styles.logoCircle}>
        <LinearGradient colors={[C.accent, C.accentLight]} style={styles.logoGradient}>
          <Text style={styles.logoLetter}>F</Text>
        </LinearGradient>
      </View>
      <Text style={styles.appName}>فورس</Text>
      <Text style={styles.appNameLatin}>ForUs</Text>
      <Text style={styles.tagline}>وجهتك الأولى للمنتجات و الخدمات والترفيه</Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#0D1B3E", "#162452", "#0D1B3E"]}
        locations={[0, 0.52, 1]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: topPad + 24, paddingBottom: bottomPad + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {renderBrand()}

          <View style={styles.card}>
            {googleEmail ? (
              <>
                <View style={styles.cardHeading}>
                  <View style={styles.headingIcon}>
                    <Ionicons name="person-add" size={22} color={C.accent} />
                  </View>
                  <View style={styles.headingText}>
                    <Text style={styles.headingTitle}>إنشاء حساب جديد</Text>
                    <Text style={styles.headingSubtitle}>أكمل بياناتك للمتابعة</Text>
                  </View>
                </View>

                <View style={styles.selectedEmail}>
                  <Ionicons name="mail-outline" size={18} color={C.accent} />
                  <Text style={styles.selectedEmailText}>{googleEmail}</Text>
                </View>

                <InputField
                  label="الاسم الكامل"
                  placeholder="أدخل اسمك الكامل"
                  value={newAccountName}
                  onChangeText={setNewAccountName}
                  icon={<Feather name="user" size={18} color={C.textSecondary} />}
                  onSubmitEditing={() => newPasswordRef.current?.focus()}
                />
                <InputField
                  label="كلمة المرور"
                  placeholder="6 أحرف على الأقل"
                  value={newAccountPassword}
                  onChangeText={setNewAccountPassword}
                  icon={<Feather name="lock" size={18} color={C.textSecondary} />}
                  secureTextEntry
                  inputRef={newPasswordRef}
                  onSubmitEditing={handleCreateGoogleAccount}
                />

                <Pressable
                  style={[styles.primaryButton, createLoading && styles.disabled]}
                  onPress={handleCreateGoogleAccount}
                  disabled={createLoading}
                >
                  <LinearGradient
                    colors={[C.accent, C.accentLight]}
                    style={styles.primaryGradient}
                  >
                    {createLoading ? (
                      <ActivityIndicator size="small" color={C.primary} />
                    ) : (
                      <>
                        <Text style={styles.primaryButtonText}>إنشاء حساب</Text>
                        <Feather name="check" size={18} color={C.primary} />
                      </>
                    )}
                  </LinearGradient>
                </Pressable>

                <Pressable
                  onPress={() => setGoogleEmail(null)}
                  style={styles.secondaryButton}
                  disabled={createLoading}
                >
                  <Text style={styles.secondaryButtonText}>العودة لتسجيل الدخول</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={[styles.googleButton, googleLoading && styles.disabled]}
                  onPress={handleGoogleEmailPick}
                  disabled={googleLoading || loading}
                >
                  {googleLoading ? (
                    <ActivityIndicator size="small" color="#4285F4" />
                  ) : (
                    <FontAwesome name="google" size={19} color="#4285F4" />
                  )}
                  <Text style={styles.googleButtonText}>
                    {googleLoading ? "جارٍ اختيار البريد..." : "التسجيل بواسطة Google"}
                  </Text>
                </Pressable>

                <View style={styles.orRow}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>أو</Text>
                  <View style={styles.orLine} />
                </View>

                <InputField
                  label="البريد الإلكتروني"
                  placeholder="example@email.com"
                  value={email}
                  onChangeText={setEmail}
                  icon={<Feather name="mail" size={18} color={C.textSecondary} />}
                  inputRef={emailRef}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
                <InputField
                  label="كلمة المرور"
                  placeholder="أدخل كلمة المرور"
                  value={password}
                  onChangeText={setPassword}
                  icon={<Feather name="lock" size={18} color={C.textSecondary} />}
                  secureTextEntry
                  inputRef={passwordRef}
                  onSubmitEditing={handleManualLogin}
                />

                <Pressable
                  onPress={() => {
                    setForgotEmail(email.trim());
                    setForgotVisible(true);
                  }}
                  style={styles.forgotButton}
                  disabled={loading || googleLoading}
                >
                  <Text style={styles.forgotText}>نسيت كلمة المرور؟</Text>
                </Pressable>

                <Pressable
                  style={[styles.primaryButton, loading && styles.disabled]}
                  onPress={handleManualLogin}
                  disabled={loading || googleLoading}
                >
                  <LinearGradient
                    colors={[C.accent, C.accentLight]}
                    style={styles.primaryGradient}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color={C.primary} />
                    ) : (
                      <>
                        <Text style={styles.primaryButtonText}>دخول</Text>
                        <Feather name="arrow-left" size={18} color={C.primary} />
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
              </>
            )}
          </View>

          <Text style={styles.footerText}>خدمات موثوقة بالقرب منك في ثوانٍ</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={forgotVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setForgotVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeading}>
              <View style={styles.headingIcon}>
                <Feather name="lock" size={21} color={C.accent} />
              </View>
              <Text style={styles.modalTitle}>نسيت كلمة المرور؟</Text>
            </View>
            <Text style={styles.modalDescription}>
              أدخل بريدك الإلكتروني لإرسال رابط إعادة التعيين
            </Text>
            <InputField
              label="البريد الإلكتروني"
              placeholder="example@email.com"
              value={forgotEmail}
              onChangeText={setForgotEmail}
              icon={<Feather name="mail" size={18} color={C.textSecondary} />}
              onSubmitEditing={handleForgotPassword}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setForgotVisible(false)}
                disabled={forgotLoading}
              >
                <Text style={styles.modalCancelText}>إلغاء</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSend, forgotLoading && styles.disabled]}
                onPress={handleForgotPassword}
                disabled={forgotLoading}
              >
                <LinearGradient colors={[C.accent, C.accentLight]} style={styles.modalSendGradient}>
                  {forgotLoading ? (
                    <ActivityIndicator size="small" color={C.primary} />
                  ) : (
                    <>
                      <Text style={styles.modalSendText}>إرسال الرابط</Text>
                      <Feather name="send" size={15} color={C.primary} />
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0D1B3E" },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, gap: 14 },
  brand: { alignItems: "center", gap: 5 },
  logoCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    marginBottom: 4,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  logoGradient: {
    flex: 1,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  logoLetter: { fontSize: 26, fontFamily: "Cairo_700Bold", color: C.primary },
  appName: {
    fontSize: 34,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
    textAlign: "center",
  },
  appNameLatin: {
    fontSize: 14,
    fontFamily: "Cairo_400Regular",
    color: C.accent,
    letterSpacing: 4,
  },
  tagline: {
    fontSize: 13,
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.58)",
    textAlign: "center",
    marginTop: 2,
  },
  card: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 20,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 7,
  },
  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headingIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: "rgba(201,168,76,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  headingText: { flex: 1, alignItems: "flex-end" },
  headingTitle: {
    fontSize: 19,
    fontFamily: "Cairo_700Bold",
    color: C.text,
    textAlign: "right",
  },
  headingSubtitle: {
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    color: C.textMuted,
    textAlign: "right",
  },
  fieldWrap: { gap: 4 },
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
    paddingHorizontal: 13,
    paddingVertical: 2,
    gap: 10,
  },
  inputFocused: { borderColor: C.accent, backgroundColor: "#FFF" },
  inputIcon: { width: 27, alignItems: "center" },
  input: {
    flex: 1,
    minHeight: 44,
    fontSize: 14,
    fontFamily: "Cairo_400Regular",
    color: C.text,
    textAlign: "right",
  },
  eyeButton: { padding: 6 },
  selectedEmail: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    backgroundColor: "rgba(201,168,76,0.09)",
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedEmailText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
    color: C.text,
    textAlign: "right",
  },
  primaryButton: { borderRadius: 14, overflow: "hidden", marginTop: 0 },
  primaryGradient: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: "Cairo_700Bold",
    color: C.primary,
  },
  forgotButton: { alignSelf: "flex-end", paddingVertical: 2 },
  forgotText: {
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
    color: C.accent,
  },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 0 },
  orLine: { flex: 1, height: 1, backgroundColor: "#E2E5EA" },
  orText: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textMuted },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 51,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#D9DDE5",
    backgroundColor: "#FFF",
  },
  googleButtonText: {
    fontSize: 14,
    fontFamily: "Cairo_600SemiBold",
    color: C.text,
  },
  secondaryButton: { alignItems: "center", paddingVertical: 4 },
  secondaryButtonText: {
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
    color: C.accent,
  },
  disabled: { opacity: 0.58 },
  footerText: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.38)",
    marginTop: "auto",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(7,15,35,0.62)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 20,
    gap: 15,
  },
  modalHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Cairo_700Bold",
    color: C.text,
    textAlign: "right",
  },
  modalDescription: {
    fontSize: 13,
    fontFamily: "Cairo_400Regular",
    color: C.textSecondary,
    textAlign: "right",
    lineHeight: 22,
  },
  modalActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  modalCancel: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: C.inputBg,
  },
  modalCancelText: {
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
    color: C.textSecondary,
  },
  modalSend: { flex: 1.4, borderRadius: 13, overflow: "hidden" },
  modalSendGradient: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  modalSendText: {
    fontSize: 13,
    fontFamily: "Cairo_700Bold",
    color: C.primary,
  },
});
