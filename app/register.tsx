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
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  ensureUserDocument,
  createOrUpdateArtisan,
  getCategoryForSpecialty,
  ALL_SPECIALTIES,
  HOME_SERVICES,
  CAR_SERVICES,
  GENERAL_SERVICES,
  type GeoLocation,
} from "@/lib/db_logic";
import Colors from "@/constants/colors";

function toFirebaseEmail(contact: string): string {
  const trimmed = contact.trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed;
  return `${trimmed}@sanad.app`;
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

const CLIENT_OPTION = { key: "client", label: "زبون", icon: "user" };

const SPECIALTY_SECTIONS = [
  { title: "نوع الحساب", items: [CLIENT_OPTION] },
  { title: "خدمات المنزل", items: HOME_SERVICES },
  { title: "خدمات السيارات", items: CAR_SERVICES },
  { title: "خدمات عامة", items: GENERAL_SERVICES },
];

const ALL_OPTIONS = [CLIENT_OPTION, ...HOME_SERVICES, ...CAR_SERVICES, ...GENERAL_SERVICES];

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [specialtyModal, setSpecialtyModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const role: "client" | "artisan" = specialty === "client" ? "client" : "artisan";

  const ref2 = useRef<TextInput>(null);
  const ref3 = useRef<TextInput>(null);

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

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

  const handleRegister = async () => {
    const trimmedContact = contact.trim();
    if (!trimmedContact) {
      Alert.alert("خطأ", "يرجى إدخال البريد الإلكتروني أو رقم الهاتف");
      return;
    }
    const isEmail = trimmedContact.includes("@");
    const isPhone = /^[0-9+\-\s]{7,15}$/.test(trimmedContact);
    if (!isEmail && !isPhone) {
      Alert.alert("خطأ", "يرجى إدخال بريد إلكتروني صحيح أو رقم هاتف");
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
    if (!specialty) {
      Alert.alert("خطأ", "يرجى اختيار نوع الحساب أو التخصص");
      return;
    }

    btnScale.value = withSpring(0.96, { damping: 12 }, () => { btnScale.value = withSpring(1); });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);

    try {
      const location = await requestLocation();
      const email = toFirebaseEmail(contact);
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = credential.user.uid;

      const savedSpecialty = role === "artisan" ? specialty : undefined;
      await ensureUserDocument(uid, email, role, { specialty: savedSpecialty, location });

      if (role === "artisan" && specialty) {
        const category = getCategoryForSpecialty(specialty);
        await createOrUpdateArtisan(uid, {
          name: email.split("@")[0],
          phone: isPhone ? trimmedContact : "",
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
        Alert.alert("خطأ", "هذا الحساب مسجل مسبقاً");
      } else if (code === "auth/weak-password") {
        Alert.alert("خطأ", "كلمة المرور ضعيفة، استخدم 6 أحرف على الأقل");
      } else {
        Alert.alert("خطأ", "حدث خطأ أثناء التسجيل");
      }
    } finally {
      setLoading(false);
    }
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const selectedSpecialtyLabel = ALL_OPTIONS.find((s) => s.key === specialty)?.label ?? "";

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
            <InputField
              label="البريد الإلكتروني أو رقم الهاتف"
              placeholder="example@email.com أو 07xxxxxxxx"
              value={contact}
              onChangeText={setContact}
              icon={<Feather name="user" size={18} color={C.textSecondary} />}
              keyboardType="default"
              onSubmitEditing={() => ref2.current?.focus()}
            />

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

            <View style={styles.locationNote}>
              <Feather name="map-pin" size={14} color={C.accent} />
              <Text style={styles.locationNoteText}>
                سيطلب التطبيق إذن الوصول إلى موقعك لعرض أقرب أصحاب الاختصاص إليك
              </Text>
            </View>

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
              <Text style={{ color: C.accent, fontFamily: "Cairo_600SemiBold" }}>سجّل دخولك</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

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
  roleSection: { gap: 8 },
  sectionLabel: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.text, textAlign: "right" },
  roleRow: { flexDirection: "row", gap: 10 },
  roleBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12, borderRadius: 12,
    backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: "transparent",
  },
  roleBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  roleBtnText: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  roleBtnTextActive: { color: C.card },
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
  locationNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(201,168,76,0.08)",
    borderRadius: 10, padding: 12,
  },
  locationNoteText: {
    flex: 1, fontSize: 12, fontFamily: "Cairo_400Regular",
    color: C.textSecondary, textAlign: "right", lineHeight: 20,
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
