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
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";

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

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

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
      const stored = await AsyncStorage.getItem("@users");
      const users: { contact: string; password: string }[] = stored
        ? JSON.parse(stored)
        : [];

      const user = users.find(
        (u) => u.contact === contact.trim() && u.password === password
      );

      if (!user) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("خطأ في تسجيل الدخول", "البريد الإلكتروني أو كلمة المرور غير صحيحة");
        setLoading(false);
        return;
      }

      await AsyncStorage.setItem("@currentUser", contact.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/dashboard" as any);
    } catch {
      Alert.alert("خطأ", "حدث خطأ أثناء تسجيل الدخول");
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
});
