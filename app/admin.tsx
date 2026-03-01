import React, { useState } from "react";
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
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Ionicons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const C = Colors.light;
const ADMIN_PASSWORD = "admin2025";

export default function AdminLoginScreen() {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState("");
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const btnScale = useSharedValue(1);
  const shakeX = useSharedValue(0);

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const handleLogin = async () => {
    if (!password) {
      Alert.alert("خطأ", "يرجى إدخال كلمة المرور");
      return;
    }

    setLoading(true);
    btnScale.value = withSpring(0.96, { damping: 12 }, () => {
      btnScale.value = withSpring(1);
    });

    await new Promise((r) => setTimeout(r, 600));

    if (password !== ADMIN_PASSWORD) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      shakeX.value = withSequence(
        withTiming(-12, { duration: 60 }),
        withTiming(12, { duration: 60 }),
        withTiming(-8, { duration: 60 }),
        withTiming(8, { duration: 60 }),
        withTiming(0, { duration: 60 })
      );
      Alert.alert("خطأ", "كلمة المرور غير صحيحة");
      setLoading(false);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading(false);
    router.push("/admin-dashboard");
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#1A0D3E", "#0D1B3E", "#0A1628"]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: topPad + 20, paddingBottom: bottomPad + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-right" size={22} color="rgba(255,255,255,0.7)" />
          </Pressable>

          <View style={styles.iconSection}>
            <View style={styles.shieldOuter}>
              <LinearGradient
                colors={["#8B5CF6", "#6D28D9"]}
                style={styles.shieldGradient}
              >
                <Ionicons name="shield-checkmark" size={48} color="#FFF" />
              </LinearGradient>
            </View>
            <Text style={styles.title}>وصول المشرف</Text>
            <Text style={styles.subtitle}>
              هذه المنطقة مخصصة لأصحاب النظام فقط
            </Text>
          </View>

          <Animated.View style={[styles.card, shakeStyle]}>
            <View style={styles.warningBadge}>
              <Ionicons name="warning" size={16} color="#F59E0B" />
              <Text style={styles.warningText}>منطقة محمية بكلمة مرور خاصة</Text>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>كلمة مرور المشرف</Text>
              <View style={[styles.inputRow, focused && styles.inputFocused]}>
                <View style={styles.inputIcon}>
                  <Ionicons
                    name="key"
                    size={18}
                    color={focused ? "#8B5CF6" : C.textSecondary}
                  />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="أدخل كلمة مرور المشرف"
                  placeholderTextColor={C.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  textAlign="right"
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  autoCapitalize="none"
                />
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
              </View>
            </View>

            <Animated.View style={btnStyle}>
              <Pressable
                onPress={handleLogin}
                disabled={loading}
                style={[styles.loginBtn, loading && styles.btnDisabled]}
              >
                <LinearGradient
                  colors={["#8B5CF6", "#7C3AED"]}
                  style={styles.loginGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <Text style={styles.loginBtnText}>جارٍ التحقق...</Text>
                  ) : (
                    <>
                      <Text style={styles.loginBtnText}>دخول لوحة التحكم</Text>
                      <Ionicons name="lock-open" size={18} color="#FFF" />
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            </Animated.View>
          </Animated.View>

          <View style={styles.secureNote}>
            <Feather name="lock" size={13} color="rgba(255,255,255,0.35)" />
            <Text style={styles.secureText}>
              محمي بتشفير عالي المستوى
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#1A0D3E" },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 28,
    flexGrow: 1,
    justifyContent: "center",
  },
  backBtn: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  iconSection: {
    alignItems: "center",
    gap: 12,
    marginTop: 40,
  },
  shieldOuter: {
    width: 96,
    height: 96,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
  },
  shieldGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontFamily: "Cairo_700Bold",
    color: "#FFFFFF",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    padding: 22,
    gap: 18,
    borderWidth: 1,
    borderColor: "rgba(139,92,246,0.25)",
  },
  warningBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245,158,11,0.1)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.2)",
    justifyContent: "flex-end",
  },
  warningText: {
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    color: "#F59E0B",
    textAlign: "right",
  },
  fieldWrap: { gap: 6 },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
    color: "rgba(255,255,255,0.8)",
    textAlign: "right",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 2,
    gap: 10,
  },
  inputFocused: {
    borderColor: "#8B5CF6",
    backgroundColor: "rgba(139,92,246,0.1)",
  },
  inputIcon: { width: 28, alignItems: "center" },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Cairo_400Regular",
    color: "#FFFFFF",
    paddingVertical: 13,
    textAlign: "right",
  },
  eyeBtn: { padding: 6 },
  loginBtn: { borderRadius: 14, overflow: "hidden" },
  loginGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    gap: 8,
  },
  loginBtnText: {
    fontSize: 16,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
  },
  btnDisabled: { opacity: 0.6 },
  secureNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  secureText: {
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.35)",
  },
});
