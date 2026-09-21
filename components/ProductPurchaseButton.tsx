import React, { useState } from "react";
import { getOptionalCurrentLocation } from "../lib/location";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { auth } from "@/lib/firebase";
import {
  cancelProductOrder,
  createProductOrder,
  getUserProfile,
  type GeoLocation,
  type Product,
} from "@/lib/db_logic";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";

const C = Colors.light;

type Props = {
  compact?: boolean;
  product: Product;
  userId: string | null;
  userName?: string;
  userLocation?: GeoLocation | null;
  pendingOrderId?: string;
  isLoading?: boolean;
  onLoadingChange?: (productId: string | null) => void;
  compactPublicProfile?: boolean;
};

/**
 * The single purchase entry point used by the home feed and public profiles.
 * Keeping the modal and validation here prevents the two surfaces from drifting.
 */
export default function ProductPurchaseButton({
  compact = false,
  product,
  userId,
  userName = "المستخدم",
  userLocation = null,
  pendingOrderId,
  isLoading = false,
  onLoadingChange,
  compactPublicProfile,
  }: Props) {
  const [visible, setVisible] = useState(false);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const colors = (product.colors ?? []).filter((value) => value.trim());
  const sizes = (product.sizes ?? []).filter((value) => value.trim());

  const open = () => {
    if (!auth.currentUser || !userId) {
      Alert.alert("تسجيل الدخول مطلوب", "سجّل الدخول أولاً لإرسال طلب شراء.");
      return;
    }
    if (auth.currentUser.uid === product.sellerId) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedColor("");
    setSelectedSize("");

    // إذا لم يحدد البائع لونًا أو قياسًا، يتم إرسال الطلب مباشرة
    // بدون فتح نافذة تفاصيل الشراء.
    if (colors.length === 0 && sizes.length === 0) {
      submit();
      return;
    }

    setVisible(true);
  };

  const cancel = () => {
    if (!pendingOrderId) return;
    Alert.alert("إلغاء طلب الشراء", "هل تريد إلغاء طلبك المعلق لهذا المنتج؟", [
      { text: "تراجع", style: "cancel" },
      {
        text: "إلغاء الطلب",
        style: "destructive",
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onLoadingChange?.(product.id);
          try {
            await cancelProductOrder(pendingOrderId);
          } catch {
            Alert.alert("خطأ", "تعذّر إلغاء الطلب، حاول مجدداً.");
          } finally {
            onLoadingChange?.(null);
          }
        },
      },
    ]);
  };

  const submit = async () => {
    const viewer = auth.currentUser;
    if (!viewer || !userId) return;
    if (colors.length > 0 && !selectedColor) {
      Alert.alert("اختيار مطلوب", "يجب اختيار اللون قبل إتمام الشراء.");
      return;
    }
    if (sizes.length > 0 && !selectedSize) {
      Alert.alert("اختيار مطلوب", "يجب اختيار القياس قبل إتمام الشراء.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLoadingChange?.(product.id);
    try {
      const profile = await getUserProfile(viewer.uid);

      // GPS is requested only for the actual purchase submission.
      // Refusing permission must never prevent the order from being created.
      const actualBuyerLocation = await getOptionalCurrentLocation();

      const imageUrl =
        product.media?.find((item) => item.type === "image")?.url ||
        (product.imageUrl && !/\.(mp4|mov|m4v|webm|avi|mkv)(?:$|[?#])/i.test(product.imageUrl)
          ? product.imageUrl
          : "") ||
        "";
      await createProductOrder({
        productId: product.id,
        productTitle: product.title,
        productImageUrl: imageUrl,
        productMedia: product.media,
        productPrice: product.price,
        sellerId: product.sellerId,
        sellerName: product.sellerName,
        buyerId: viewer.uid,
        buyerName: profile?.name || userName,
        buyerPhone: profile?.phone || "",
        buyerLocation: actualBuyerLocation,
        selectedColor,
        selectedSize,
      });
      setVisible(false);
      Alert.alert("تم الإرسال ✓", "تم إرسال طلب الشراء للبائع، سيتواصل معك قريباً.");
    } catch {
      Alert.alert("خطأ", "حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مجدداً.");
    } finally {
      onLoadingChange?.(null);
    }
  };

  if (pendingOrderId) {
    return (
      <TouchableOpacity
        style={[styles.button, styles.cancelButton, isLoading && styles.disabled]}
        activeOpacity={0.85}
        disabled={isLoading}
        onPress={cancel}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <>
            <Ionicons name="close-circle-outline" size={15} color="#FFF" />
            <Text style={styles.cancelText}>إلغاء الطلب</Text>
          </>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.button, isLoading && styles.disabled]}
        activeOpacity={0.85}
        disabled={isLoading}
        onPress={open}
      >
        <LinearGradient colors={[C.accent, C.accentLight]} style={styles.gradient}>
          {isLoading ? (
            <ActivityIndicator size="small" color={C.primary} />
          ) : (
            <>
              {!(
                compactPublicProfile &&
                (colors.length > 0 || sizes.length > 0)
              ) && (
                <Ionicons name="cart-outline" size={15} color={C.primary} />
              )}
              <Text
                style={
                  compactPublicProfile
                    ? styles.publicProfilePurchaseButtonText
                    : styles.publicProfileButtonText
                }
              >
  {colors.length === 0 && sizes.length === 0 ? "شراء الآن" : "تفاصيل الشراء"}
</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.title}>تفاصيل الشراء</Text>
            <Text style={styles.productName} numberOfLines={2}>{product.title}</Text>
            <Text style={styles.price}>
              {product.price.toLocaleString("ar-IQ-u-nu-latn")} <Text style={styles.currency}>د.ع</Text>
            </Text>

            {colors.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.label}>اختر اللون <Text style={styles.required}>*</Text></Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {colors.map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[styles.chip, selectedColor === color && styles.chipActive]}
                      onPress={() => setSelectedColor(color)}
                    >
                      <Text style={[styles.chipText, selectedColor === color && styles.chipTextActive]}>{color}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {sizes.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.label}>اختر القياس <Text style={styles.required}>*</Text></Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {sizes.map((size) => (
                    <TouchableOpacity
                      key={size}
                      style={[styles.chip, selectedSize === size && styles.chipActive]}
                      onPress={() => setSelectedSize(size)}
                    >
                      <Text style={[styles.chipText, selectedSize === size && styles.chipTextActive]}>{size}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity style={styles.confirm} onPress={submit} activeOpacity={0.85}>
              <LinearGradient colors={[C.accent, C.accentLight]} style={styles.gradient}>
                <Ionicons name="cart-outline" size={16} color={C.primary} />
                <Text style={styles.buttonText}>شراء</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.close} onPress={() => setVisible(false)}>
              <Text style={styles.closeText}>إلغاء</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { marginHorizontal: 14, marginTop: 10, marginBottom: 14, borderRadius: 12, overflow: "hidden" },
  gradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 13 },
  buttonText: { fontSize: 15, fontFamily: undefined, color: C.primary },
  publicProfileButtonText: { fontSize: 13, fontFamily: undefined, color: C.primary },
  publicProfilePurchaseButtonText: { fontSize: 13, fontFamily: undefined, color: C.primary },
  disabled: { opacity: 0.6 },
  cancelButton: { backgroundColor: "#DC2626", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 13 },
  cancelText: { fontSize: 14, fontFamily: undefined, color: "#FFF" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: "center" },
  title: { fontSize: 19, fontFamily: undefined, color: C.text, textAlign: "right" },
  productName: { fontSize: 15, fontFamily: undefined, color: C.text, textAlign: "right" },
  price: { fontSize: 17, fontFamily: undefined, color: C.accent, textAlign: "right" },
  currency: { fontSize: 13 },
  section: { gap: 8 },
  label: { fontSize: 13, fontFamily: undefined, color: C.text, textAlign: "right" },
  required: { color: "#DC2626" },
  chips: { flexDirection: "row", gap: 8 },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive: { borderColor: C.accent, backgroundColor: "rgba(201,168,76,0.12)" },
  chipText: { fontSize: 13, fontFamily: undefined, color: C.textSecondary },
  chipTextActive: { color: C.accent, fontFamily: undefined },
  confirm: { borderRadius: 12, overflow: "hidden", marginTop: 4 },
  close: { borderWidth: 1, borderColor: C.border, borderRadius: 12, alignItems: "center", paddingVertical: 12 },
  closeText: { fontSize: 14, fontFamily: undefined, color: C.textSecondary },
});