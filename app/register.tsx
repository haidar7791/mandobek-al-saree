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
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { createUserWithEmailAndPassword } from "firebase/auth";
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
      <View
        style={[
          styles.inputRow,
          focused && styles.inputFocused,
        ]}
      >
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
          <Pressable
            onPress={() => setShowPassword((p) => !p)}
            style={styles.eyeBtn}
          >
            <Feather
              name={showPassword ? "eye-off" : "eye"}
              size={18}
              color={C.textMuted}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const ref2 = useRef<TextInput>(null);
  const ref3 = useRef<TextInput>(null);

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const handleRegister = async () => {
    if (!contact.trim()) {
      Alert.alert("خطأ", "يرجى إدخال البريد الإلكتروني أو رقم الهاتف");
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

    btnScale.value = withSpring(0.96, { damping: 12 }, () => {
      btnScale.value = withSpring(1);
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);

    try {
      const email = toFirebaseEmail(contact);
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await ensureUserDocument(credential.user.uid, email);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("تم التسجيل", "تم إنشاء حسابك بنجاح!", [
        { text: "تسجيل الدخول", onPress: () => router.replace("/login") },
      ]);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const code = err?.code || "";
      if (code === "auth/email-already-in-use") {
        Alert.alert("خطأ", "هذا الحساب مسجل مسبقاً");
      } else if (code === "auth/weak-password") {
        Alert.alert("خطأ", "كلمة المرور ضعيفة، استخدم 6 أحرف على الأقل");
      } else if (code === "auth/invalid-email") {
        Alert.alert("خطأ", "البريد الإلكتروني أو رقم الهاتف غير صحيح");
      } else {
        Alert.alert("خطأ", "حدث خطأ أثناء التسجيل");
      }
    } finally {
      setLoading(false);
    }
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#0D1B3E", "#162452"]}
        style={styles.header}
      >
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
            <InputField
              label="البريد الإلكتروني أو رقم الهاتف"
              placeholder="example@email.com أو 05xxxxxxxx"
              value={contact}
              onChangeText={setContact}
              icon={<Feather name="user" size={18} color={C.textSecondary} />}
              keyboardType="email-address"
              onSubmitEditing={() => ref2.current?.focus()}
            />

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
              onSubmitEditing={handleRegister}
            />

            <Animated.View style={btnStyle}>
              <Pressable
                style={[styles.registerBtn, loading && styles.btnDisabled]}
                onPress={handleRegister}
                disabled={loading}
              >
                <LinearGradient
                  colors={[C.accent, C.accentLight]}
                  style={styles.registerGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <Text style={styles.registerBtnText}>جارٍ التسجيل...</Text>
                  ) : (
                    <>
                      <Text style={styles.registerBtnText}>إنشاء الحساب</Text>
                      <Feather name="arrow-left" size={18} color={C.primary} />
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </Animated.View>
          </View>

          <Pressable onPress={() => router.push("/login")} style={styles.loginLink}>
            <Text style={styles.loginLinkText}>
              لديك حساب؟{" "}
              <Text style={{ color: C.accent, fontFamily: "Cairo_600SemiBold" }}>
                سجّل دخولك
              </Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: {
    paddingBottom: 28,
  },
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
  headerTextGroup: {
    flex: 1,
    alignItems: "flex-end",
  },
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
  fieldWrap: {
    gap: 6,
  },
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
  inputFocused: {
    borderColor: C.accent,
    backgroundColor: "#FFF",
  },
  inputIcon: {
    width: 28,
    alignItems: "center",
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Cairo_400Regular",
    color: C.text,
    paddingVertical: 13,
    textAlign: "right",
  },
  eyeBtn: {
    padding: 6,
  },
  registerBtn: {
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 6,
  },
  registerGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    paddingHorizontal: 24,
    gap: 8,
  },
  registerBtnText: {
    fontSize: 16,
    fontFamily: "Cairo_700Bold",
    color: C.primary,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  loginLink: {
    alignItems: "center",
    paddingVertical: 8,
  },
  loginLinkText: {
    fontSize: 14,
    fontFamily: "Cairo_400Regular",
    color: C.textSecondary,
  },
});
