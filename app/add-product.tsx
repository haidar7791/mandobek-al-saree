import React, { useState } from "react";
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
  Image,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { auth } from "@/lib/firebase";
import { createProduct, getUserProfile } from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

export default function AddProductScreen() {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("إذن مطلوب", "يرجى السماح للتطبيق بالوصول إلى معرض الصور");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handlePublish = async () => {
    if (!title.trim()) { Alert.alert("خطأ", "يرجى إدخال اسم المنتج"); return; }
    const parsedPrice = parseFloat(price);
    if (!price || isNaN(parsedPrice) || parsedPrice <= 0) {
      Alert.alert("خطأ", "يرجى إدخال سعر صحيح"); return;
    }
    if (!imageUri) { Alert.alert("خطأ", "يرجى إضافة صورة للمنتج"); return; }

    const user = auth.currentUser;
    if (!user) { router.replace("/login" as any); return; }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const profile = await getUserProfile(user.uid);
      await createProduct({
        title: title.trim(),
        price: parsedPrice,
        description: description.trim(),
        localImageUri: imageUri,
        sellerId: user.uid,
        sellerName: profile?.name || "مجهول",
        sellerPhone: profile?.phone || "",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("تم النشر ✓", "تم نشر منتجك في السوق بنجاح!", [
        { text: "حسناً", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      console.error("createProduct error:", err);
      const msg =
        err?.code === "storage/unauthorized"
          ? "ليس لديك صلاحية رفع الصورة — تأكد من تسجيل الدخول"
          : err?.code === "storage/canceled"
          ? "تم إلغاء رفع الصورة"
          : err?.message
          ? `تفاصيل الخطأ: ${err.message}`
          : "حدث خطأ أثناء نشر المنتج، يرجى المحاولة مجدداً";
      Alert.alert("خطأ في النشر", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={[styles.header, { paddingTop: topPad + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="chevron-right" size={24} color="#FFF" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>إضافة منتج جديد</Text>
          <Text style={styles.headerSub}>انشر منتجك في سوق فورس</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="pricetag" size={24} color={C.accent} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Image Picker */}
          <TouchableOpacity style={styles.imagePicker} onPress={pickImage} activeOpacity={0.8}>
            {imageUri ? (
              <>
                <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
                <View style={styles.changeImageOverlay}>
                  <Feather name="camera" size={20} color="#FFF" />
                  <Text style={styles.changeImageText}>تغيير الصورة</Text>
                </View>
              </>
            ) : (
              <View style={styles.imagePlaceholder}>
                <View style={styles.imagePlaceholderIcon}>
                  <Feather name="camera" size={32} color={C.accent} />
                </View>
                <Text style={styles.imagePlaceholderText}>اضغط لإضافة صورة المنتج</Text>
                <Text style={styles.imagePlaceholderSub}>مطلوب · JPG أو PNG</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Form */}
          <View style={styles.card}>
            {/* Title */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>اسم المنتج <Text style={styles.required}>*</Text></Text>
              <View style={styles.inputRow}>
                <Feather name="tag" size={17} color={C.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder="مثال: تلفاز سامسونج 55 بوصة"
                  placeholderTextColor={C.textMuted}
                  value={title}
                  onChangeText={setTitle}
                  textAlign="right"
                  autoCapitalize="none"
                  maxLength={80}
                />
              </View>
            </View>

            {/* Price */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>السعر (د.ع) <Text style={styles.required}>*</Text></Text>
              <View style={styles.inputRow}>
                <Text style={styles.currencyLabel}>IQD</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={C.textMuted}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                  textAlign="right"
                />
              </View>
            </View>

            {/* Description */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>التفاصيل / الوصف <Text style={styles.optional}>(اختياري)</Text></Text>
              <View style={[styles.inputRow, styles.multilineRow]}>
                <Feather name="align-left" size={17} color={C.textSecondary} style={{ marginTop: 4 }} />
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  placeholder="صف حالة المنتج، مواصفاته، سبب البيع..."
                  placeholderTextColor={C.textMuted}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={4}
                  textAlign="right"
                  textAlignVertical="top"
                  maxLength={400}
                />
              </View>
              <Text style={styles.charCount}>{description.length}/400</Text>
            </View>
          </View>

          {/* Publish Button */}
          <TouchableOpacity
            style={[styles.publishBtn, loading && styles.btnDisabled]}
            onPress={handlePublish}
            disabled={loading}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[C.accent, C.accentLight]}
              style={styles.publishGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {loading ? (
                <>
                  <ActivityIndicator size="small" color={C.primary} />
                  <Text style={styles.publishBtnText}>جارٍ النشر...</Text>
                </>
              ) : (
                <>
                  <Text style={styles.publishBtnText}>نشر المنتج</Text>
                  <Ionicons name="rocket" size={18} color={C.primary} />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 20,
    paddingBottom: 18, gap: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  headerText: { flex: 1, alignItems: "flex-end" },
  headerTitle: { fontSize: 19, fontFamily: "Cairo_700Bold", color: "#FFF", textAlign: "right" },
  headerSub: { fontSize: 12, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.6)", textAlign: "right" },
  headerIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: "rgba(201,168,76,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  content: { padding: 16, gap: 16 },
  imagePicker: {
    height: 200, borderRadius: 18, overflow: "hidden",
    backgroundColor: C.card,
    borderWidth: 2, borderColor: C.border, borderStyle: "dashed",
  },
  previewImage: { width: "100%", height: "100%" },
  changeImageOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 10, gap: 6,
  },
  changeImageText: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: "#FFF" },
  imagePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  imagePlaceholderIcon: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: "rgba(201,168,76,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  imagePlaceholderText: { fontSize: 15, fontFamily: "Cairo_600SemiBold", color: C.text },
  imagePlaceholderSub: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textMuted },
  card: {
    backgroundColor: C.card, borderRadius: 18, padding: 20, gap: 18,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
  },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.text, textAlign: "right" },
  required: { color: "#EF4444" },
  optional: { color: C.textMuted, fontFamily: "Cairo_400Regular", fontSize: 11 },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.inputBg, borderRadius: 12,
    borderWidth: 1.5, borderColor: "transparent",
    paddingHorizontal: 14, paddingVertical: 2, gap: 10,
  },
  multilineRow: { alignItems: "flex-start", paddingVertical: 10 },
  input: {
    flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular",
    color: C.text, paddingVertical: 11, textAlign: "right",
  },
  multilineInput: { minHeight: 88, paddingVertical: 0 },
  currencyLabel: {
    fontSize: 12, fontFamily: "Cairo_700Bold", color: C.accent,
  },
  charCount: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted, textAlign: "left" },
  publishBtn: { borderRadius: 16, overflow: "hidden" },
  publishGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 16, gap: 10,
  },
  publishBtnText: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.primary },
  btnDisabled: { opacity: 0.6 },
});
