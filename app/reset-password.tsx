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
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const C = Colors.light;

// ─── Backend URL ──────────────────────────────────────────────────────────────
const REPLIT_BACKEND_HOST =
  "7ad1563a-fd03-4049-b8e0-44592245fa3b-00-124n16ica1aqg.pike.replit.dev";

function getApiBase(): string {
  const envDomain = process.env.EXPO_PUBLIC_DOMAIN;
  const host =
    envDomain && !envDomain.includes("127.0.0.1") && !envDomain.includes("localhost")
      ? envDomain.replace(/^https?:\/\//, "").replace(/:\d+\/?$/, "").replace(/\/$/, "")
      : REPLIT_BACKEND_HOST;
  return `https://${host}:5000/`;
}

// ─── PasswordInput helper ─────────────────────────────────────────────────────

function PasswordInput({
  label,
  value,
  onChange,
  onSubmit,
  returnKeyType = "next",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  returnKeyType?: "next" | "done";
}) {
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputRow, focused && styles.inputFocused]}>
        <View style={styles.inputIcon}>
          <Feather name="lock" size={18} color={C.textSecondary} />
        </View>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!show}
          placeholder="6 أحرف على الأقل"
          placeholderTextColor={C.textMuted}
          textAlign="right"
          autoCapitalize="none"
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <Pressable onPress={() => setShow((s) => !s)} style={styles.eyeBtn} hitSlop={8}>
          <Feather name={show ? "eye-off" : "eye"} size={18} color={C.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const handleSubmit = async () => {
    if (!token) {
      Alert.alert("خطأ", "رابط إعادة التعيين غير صالح");
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

    setLoading(true);
    try {
      const endpoint = `${getApiBase()}api/reset-password-with-token`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("خطأ", data.error ?? "تعذّر تحديث كلمة المرور");
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", "تعذّر الاتصال بالخادم — تحقق من الإنترنت وأعد المحاولة");
    } finally {
      setLoading(false);
    }
  };

  // ── Success state ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <View style={styles.root}>
        <LinearGradient colors={["#0D1B3E", "#162452"]} style={styles.header}>
          <View style={[styles.headerContent, { paddingTop: topPad + 10 }]}>
            <View style={styles.headerTextGroup}>
              <Text style={styles.headerTitle}>تمّ بنجاح ✓</Text>
            </View>
            <View style={styles.headerIcon}>
              <Ionicons name="checkmark-circle" size={26} color={C.accent} />
            </View>
          </View>
        </LinearGradient>

        <View style={styles.successCard}>
          <View style={styles.successIconCircle}>
            <Ionicons name="shield-checkmark" size={44} color={C.accent} />
          </View>
          <Text style={styles.successTitle}>تم تغيير كلمة المرور بنجاح</Text>
          <Text style={styles.successSub}>
            يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة
          </Text>
          <Pressable
            style={styles.loginBtn}
            onPress={() => router.replace("/login" as any)}
          >
            <LinearGradient
              colors={[C.accent, C.accentLight]}
              style={styles.loginGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.loginBtnText}>تسجيل الدخول</Text>
              <Feather name="arrow-left" size={18} color={C.primary} />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={styles.header}>
        <View style={[styles.headerContent, { paddingTop: topPad + 10 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-right" size={24} color="#FFF" />
          </Pressable>
          <View style={styles.headerTextGroup}>
            <Text style={styles.headerTitle}>إعادة تعيين كلمة المرور</Text>
            <Text style={styles.headerSub}>أدخل كلمة مرورك الجديدة</Text>
          </View>
          <View style={styles.headerIcon}>
            <Feather name="lock" size={24} color={C.accent} />
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Token validity warning */}
          {!token && (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={16} color="#C0392B" />
              <Text style={styles.errorBannerText}>
                رابط إعادة التعيين غير صالح أو منتهي الصلاحية
              </Text>
            </View>
          )}

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconCircle}>
                <Feather name="lock" size={22} color={C.accent} />
              </View>
              <Text style={styles.cardTitle}>كلمة المرور الجديدة</Text>
            </View>

            <PasswordInput
              label="كلمة المرور الجديدة"
              value={newPassword}
              onChange={setNewPassword}
              returnKeyType="next"
            />

            <PasswordInput
              label="تأكيد كلمة المرور"
              value={confirmPassword}
              onChange={setConfirmPassword}
              returnKeyType="done"
              onSubmit={handleSubmit}
            />

            <Pressable
              style={[styles.submitBtn, (loading || !token) && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={loading || !token}
            >
              <LinearGradient
                colors={[C.accent, C.accentLight]}
                style={styles.submitGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <>
                    <ActivityIndicator size="small" color={C.primary} />
                    <Text style={styles.submitText}>جارٍ التحديث...</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.submitText}>تغيير كلمة المرور</Text>
                    <Feather name="check" size={18} color={C.primary} />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: { paddingBottom: 28 },
  headerContent: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 10, gap: 12,
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
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FDECEA", borderRadius: 10, padding: 14,
  },
  errorBannerText: { flex: 1, fontSize: 13, fontFamily: "Cairo_400Regular", color: "#C0392B", textAlign: "right" },
  card: {
    backgroundColor: C.card, borderRadius: 20, padding: 22, gap: 18,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "flex-end" },
  cardIconCircle: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: "rgba(201,168,76,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  cardTitle: { fontSize: 17, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
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
  input: { flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular", color: C.text, paddingVertical: 13, textAlign: "right" },
  eyeBtn: { padding: 6 },
  submitBtn: { borderRadius: 14, overflow: "hidden", marginTop: 6 },
  submitGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 15, paddingHorizontal: 24, gap: 8,
  },
  submitText: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.primary },
  btnDisabled: { opacity: 0.6 },

  // ── Success state ──
  successCard: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 32, gap: 16,
  },
  successIconCircle: {
    width: 88, height: 88, borderRadius: 24,
    backgroundColor: "rgba(201,168,76,0.12)",
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  successTitle: { fontSize: 20, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "center" },
  successSub: { fontSize: 14, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "center", lineHeight: 22 },
  loginBtn: { borderRadius: 14, overflow: "hidden", marginTop: 16, width: "100%" },
  loginGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 15, paddingHorizontal: 24, gap: 8,
  },
  loginBtnText: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.primary },
});
