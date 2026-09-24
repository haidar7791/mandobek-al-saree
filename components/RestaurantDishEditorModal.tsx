import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import * as ImagePicker from "expo-image-picker";
import { Feather, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import type { FoodItem } from "@/lib/db_logic";

const C = Colors.light;

export type RestaurantDishCategory = "main" | "appetizer" | "drink" | "dessert";

export type RestaurantDishDraft = {
  name: string;
  description: string;
  price: string;
  category: RestaurantDishCategory;
  imageUri: string | null;
  imageChanged: boolean;
  isPopular: boolean;
};

const categories: { key: RestaurantDishCategory; label: string; emoji: string }[] = [
  { key: "main", label: "أطباق رئيسية", emoji: "🍢" },
  { key: "appetizer", label: "مقبلات", emoji: "🥗" },
  { key: "drink", label: "مشروبات", emoji: "🥤" },
  { key: "dessert", label: "حلويات", emoji: "🍰" },
];

type Props = {
  visible: boolean;
  initialDish?: FoodItem | null;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: RestaurantDishDraft) => void;
};

export default function RestaurantDishEditorModal({
  visible,
  initialDish,
  saving,
  onClose,
  onSave,
}: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState<RestaurantDishCategory>("main");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageChanged, setImageChanged] = useState(false);
  const [isPopular, setIsPopular] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setName(initialDish?.name ?? "");
    setDescription(initialDish?.description ?? initialDish?.appetizers ?? "");
    setPrice(initialDish ? String(initialDish.price ?? "") : "");
    setCategory(initialDish?.category ?? "main");
    setImageUri(initialDish?.media?.[0]?.url ?? null);
    setImageChanged(false);
    setIsPopular(initialDish?.isPopular ?? false);
    setError("");
  }, [initialDish, visible]);

  const chooseImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setImageUri(result.assets[0].uri);
    setImageChanged(true);
  };

  const submit = () => {
    const cleanName = name.trim();
    const numericPrice = Number(price.replace(/[^\d]/g, ""));
    if (!cleanName) {
      setError("اكتب اسم الطبق.");
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setError("أدخل سعراً صحيحاً بالدينار.");
      return;
    }
    if (!imageUri) {
      setError("أضف صورة للطبق.");
      return;
    }
    onSave({
      name: cleanName,
      description: description.trim(),
      price: String(numericPrice),
      category,
      imageUri,
      imageChanged,
      isPopular,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.headingRow}>
              <View>
                <Text style={styles.title}>
                  {initialDish ? "تعديل الطبق" : "إضافة طبق جديد"}
                </Text>
                <Text style={styles.subtitle}>أدخل تفاصيل واضحة لعملائك</Text>
              </View>
              <Pressable
                onPress={onClose}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="إغلاق"
              >
                <Feather name="x" size={20} color={C.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.label}>صورة الطبق</Text>
              <Pressable style={styles.imagePicker} onPress={() => void chooseImage()}>
                {imageUri ? (
                  <>
                    <Image source={{ uri: imageUri }} style={styles.dishImage} />
                    <View style={styles.imageEditBadge}>
                      <Feather name="camera" size={15} color="#FFF" />
                      <Text style={styles.imageEditText}>تغيير الصورة</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.imageEmpty}>
                    <Ionicons name="image-outline" size={30} color={C.accent} />
                    <Text style={styles.imageEmptyText}>اختر صورة جذابة للطبق</Text>
                  </View>
                )}
              </Pressable>

              <Text style={styles.label}>اسم الطبق</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="مثال: مندي لحم"
                placeholderTextColor={C.textMuted}
                style={styles.input}
                textAlign="right"
                maxLength={60}
              />

              <Text style={styles.label}>الوصف والمكونات</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="اكتب وصفاً قصيراً للطبق..."
                placeholderTextColor={C.textMuted}
                style={[styles.input, styles.multiline]}
                textAlign="right"
                multiline
                maxLength={240}
              />

              <Text style={styles.label}>السعر</Text>
              <View style={styles.priceRow}>
                <Text style={styles.currency}>د.ع</Text>
                <TextInput
                  value={price}
                  onChangeText={(value) => setPrice(value.replace(/[^\d]/g, ""))}
                  placeholder="18,000"
                  placeholderTextColor={C.textMuted}
                  style={styles.priceInput}
                  textAlign="right"
                  keyboardType="number-pad"
                />
              </View>

              <Text style={styles.label}>الفئة</Text>
              <View style={styles.categoryGrid}>
                {categories.map((item) => {
                  const selected = category === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setCategory(item.key)}
                      style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                    >
                      <Text style={styles.categoryEmoji}>{item.emoji}</Text>
                      <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={() => setIsPopular((value) => !value)}
                style={[styles.popularToggle, isPopular && styles.popularToggleActive]}
              >
                <Ionicons
                  name={isPopular ? "star" : "star-outline"}
                  size={18}
                  color={isPopular ? "#C18A16" : C.textMuted}
                />
                <Text style={[styles.popularText, isPopular && styles.popularTextActive]}>
                  أظهره ضمن الأكثر طلباً
                </Text>
                <View style={[styles.check, isPopular && styles.checkActive]}>
                  {isPopular && <Feather name="check" size={12} color="#FFF" />}
                </View>
              </Pressable>
              {!!error && <Text style={styles.error}>{error}</Text>}

              <Pressable
                onPress={submit}
                disabled={saving}
                style={[styles.saveButton, saving && { opacity: 0.7 }]}
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Feather name="check" size={18} color="#FFF" />
                    <Text style={styles.saveText}>
                      {initialDish ? "حفظ التعديلات" : "إضافة إلى القائمة"}
                    </Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(10,17,34,0.62)" },
  keyboardWrap: { width: "100%", maxHeight: "94%" },
  sheet: {
    maxHeight: "100%",
    backgroundColor: C.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "web" ? 26 : 18,
  },
  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "#D6D9E0", marginBottom: 18 },
  headingRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
  title: { color: C.text, fontSize: 21, fontWeight: "900", textAlign: "right" },
  subtitle: { color: C.textMuted, fontSize: 12, marginTop: 4, textAlign: "right" },
  closeButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.card, alignItems: "center", justifyContent: "center" },
  content: { paddingBottom: 10 },
  label: { color: C.text, fontSize: 13, fontWeight: "800", textAlign: "right", marginTop: 15, marginBottom: 8 },
  imagePicker: { height: 156, borderRadius: 18, overflow: "hidden", backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  dishImage: { width: "100%", height: "100%" },
  imageEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 9 },
  imageEmptyText: { color: C.textSecondary, fontSize: 13, fontWeight: "700" },
  imageEditBadge: { position: "absolute", left: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(14,24,48,0.82)", paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12 },
  imageEditText: { color: "#FFF", fontWeight: "700", fontSize: 11 },
  input: { minHeight: 48, paddingHorizontal: 14, borderRadius: 13, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, color: C.text, fontSize: 14 },
  multiline: { minHeight: 78, paddingTop: 12, textAlignVertical: "top" },
  priceRow: { flexDirection: "row-reverse", alignItems: "center", borderRadius: 13, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14 },
  currency: { color: C.accent, fontWeight: "900", fontSize: 14 },
  priceInput: { flex: 1, minHeight: 48, color: C.text, fontSize: 15, paddingHorizontal: 12 },
  categoryGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  categoryChip: { flexGrow: 1, minWidth: "46%", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 43, paddingHorizontal: 10, borderRadius: 13, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  categoryChipSelected: { backgroundColor: "rgba(201,168,76,0.14)", borderColor: C.accent },
  categoryEmoji: { fontSize: 15 },
  categoryText: { color: C.textSecondary, fontSize: 12, fontWeight: "700" },
  categoryTextSelected: { color: C.text, fontWeight: "900" },
  popularToggle: { marginTop: 14, minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, flexDirection: "row-reverse", alignItems: "center", gap: 9, paddingHorizontal: 12 },
  popularToggleActive: { borderColor: "rgba(193,138,22,0.45)", backgroundColor: "rgba(245,193,73,0.12)" },
  popularText: { flex: 1, color: C.textSecondary, textAlign: "right", fontSize: 12, fontWeight: "700" },
  popularTextActive: { color: C.text, fontWeight: "900" },
  check: { width: 19, height: 19, borderRadius: 6, borderWidth: 1.5, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  checkActive: { backgroundColor: C.accent, borderColor: C.accent },
  error: { color: C.danger, textAlign: "right", marginTop: 10, fontSize: 12, fontWeight: "700" },
  saveButton: { minHeight: 51, marginTop: 18, borderRadius: 15, backgroundColor: C.primary, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { color: "#FFF", fontSize: 14, fontWeight: "900" },
});