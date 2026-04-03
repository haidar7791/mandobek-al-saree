import React, { useState, useRef } from "react";
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
  withTiming,
} from "react-native-reanimated";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ensureUserDocument } from "@/lib/db_logic";
import Colors from "@/constants/colors";

function toFirebaseEmail(contact: string): string {
  const trimmed = contact.trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed;
  return `${trimmed}@mandobek.app`;
}

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
  keyboardType?: "default" | "email-address" | "phone-pad";
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

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetContact, setResetContact] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const handleForgotPassword = () => {
    setResetContact(contact.trim());
    setResetModalVisible(true);
  };

  const handleSendResetEmail = async () => {
    const trimmed = resetContact.trim();
    if (!trimmed) {
      Alert.alert("خطأ", "يرجى إدخال البريد الإلكتروني أو رقم الهاتف");
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
        Alert.alert("خطأ", "البريد الإلكتروني أو رقم الهاتف غير مسجل في النظام");
      } else if (code === "auth/too-many-requests") {
        Alert.alert("محاولات كثيرة", "يرجى الانتظار قليلاً ثم المحاولة مجدداً");
      } else {
        Alert.alert("خطأ", "تعذّر إرسال رابط إعادة التعيين، يرجى المحاولة لاحقاً");
      }
    } finally {
      setResetLoading(false);
    }
  };

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
      const email = toFirebaseEmail(contact);
      const credential = await signInWithEmailAndPassword(auth, email, password);
      await ensureUserDocument(credential.user.uid, email);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/dashboard" as any);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const code = err?.code || "";
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
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

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  return (
    <View style={styles.root}>
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
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: bottomPad + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.welcomeRow}>
              <View style={styles.welcomeIconCircle}>
                <LinearGradient
                  colors={[C.primary, "#1E2F60"]}
                  style={styles.welcomeGradient}
                >
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
              placeholder="example@email.com"
              value={contact}
              onChangeText={setContact}
              icon={<Feather name="user" size={18} color={C.textSecondary} />}
              keyboardType="email-address"
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
            >
              <Text style={styles.forgotText}>نسيت كلمة المرور؟</Text>
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
                    <Text style={styles.loginBtnText}>جارٍ الدخول...</Text>
                  ) : (
                    <>
                      <Text style={styles.loginBtnText}>دخول</Text>
                      <Feather name="arrow-left" size={18} color={C.primary} />
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </Animated.View>
          </View>

          <Pressable
            onPress={() => router.push("/register")}
            style={styles.registerLink}
          >
            <Text style={styles.registerLinkText}>
              ليس لديك حساب؟{" "}
              <Text style={{ color: C.accent, fontFamily: "Cairo_600SemiBold" }}>
                سجّل الآن
              </Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={resetModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setResetModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setResetModalVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconCircle}>
                <Feather name="lock" size={22} color={C.accent} />
              </View>
              <Text style={styles.modalTitle}>إعادة تعيين كلمة المرور</Text>
            </View>

            <Text style={styles.modalDesc}>
              أدخل بريدك الإلكتروني أو رقم هاتفك المسجّل وسنرسل لك رابط إعادة التعيين
            </Text>

            <View style={[styles.inputRow, { marginTop: 4 }]}>
              <View style={styles.inputIcon}>
                <Feather name="mail" size={18} color={C.textSecondary} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="البريد الإلكتروني أو رقم الهاتف"
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
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextGroup: { flex: 1, alignItems: "flex-end" },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
    textAlign: "right",
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.6)",
    textAlign: "right",
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(201,168,76,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 16,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 22,
    gap: 18,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  welcomeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 4,
  },
  welcomeIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    overflow: "hidden",
  },
  welcomeGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeText: { flex: 1, alignItems: "flex-end" },
  welcomeTitle: {
    fontSize: 18,
    fontFamily: "Cairo_700Bold",
    color: C.text,
    textAlign: "right",
  },
  welcomeSub: {
    fontSize: 13,
    fontFamily: "Cairo_400Regular",
    color: C.textSecondary,
    textAlign: "right",
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
    paddingVertical: 2,
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
  eyeBtn: { padding: 6 },
  loginBtn: { borderRadius: 14, overflow: "hidden", marginTop: 4 },
  loginGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    paddingHorizontal: 24,
    gap: 8,
  },
  loginBtnText: {
    fontSize: 16,
    fontFamily: "Cairo_700Bold",
    color: C.primary,
  },
  btnDisabled: { opacity: 0.6 },
  registerLink: { alignItems: "center", paddingVertical: 8 },
  registerLinkText: {
    fontSize: 14,
    fontFamily: "Cairo_400Regular",
    color: C.textSecondary,
  },
  forgotBtn: {
    alignSelf: "flex-end",
    marginTop: -8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  forgotText: {
    fontSize: 14,
    fontFamily: "Cairo_600SemiBold",
    color: C.accent,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 24,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    justifyContent: "flex-end",
  },
  modalIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(201,168,76,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "Cairo_700Bold",
    color: C.text,
    textAlign: "right",
  },
  modalDesc: {
    fontSize: 13,
    fontFamily: "Cairo_400Regular",
    color: C.textSecondary,
    textAlign: "right",
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border || "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  modalCancelText: {
    fontSize: 14,
    fontFamily: "Cairo_600SemiBold",
    color: C.textSecondary,
  },
  modalSendBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  modalSendGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 8,
  },
  modalSendText: {
    fontSize: 14,
    fontFamily: "Cairo_700Bold",
    color: C.primary,
  },
});
