import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { auth } from "@/lib/firebase";
import {
  createProductOrdersBatch,
  getUserProfile,
  type GeoLocation,
} from "@/lib/db_logic";
import {
  clearStoreCart,
  getStoreCart,
  getStoreCartTotal,
  type StoreCartItem,
} from "@/lib/store_cart";
import { getOptionalCurrentLocation } from "@/lib/location";
import Colors from "@/constants/colors";

const C = Colors.light;

export default function StoreCheckoutScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<StoreCartItem[]>([]);
  const [buyerName, setBuyerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(useCallback(() => {
    setItems(getStoreCart());
    const userId = auth.currentUser?.uid;
    if (!userId) return;
    void getUserProfile(userId).then((profile) => {
      if (!profile) return;
      setBuyerName(profile.name || "");
      setPhone(profile.phone || "");
    }).catch((error) => console.error("load buyer profile for store checkout failed:", error));
  }, []));

  const chooseLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const next = await getOptionalCurrentLocation();
      if (!next) {
        Alert.alert("تعذر تحديد الموقع", "اسمح بالوصول إلى الموقع أو اكتب عنوان التوصيل.");
        return;
      }
      setLocation(next);
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    const viewer = auth.currentUser;
    if (!viewer) {
      Alert.alert("تسجيل الدخول مطلوب", "سجّل الدخول قبل إتمام الطلب.");
      return;
    }
    if (!items.length) {
      Alert.alert("السلة فارغة", "أضف منتجاً واحداً على الأقل.");
      return;
    }
    if (!phone.trim() || (!address.trim() && !location)) {
      Alert.alert("بيانات التوصيل مطلوبة", "أدخل رقم هاتفك وعنوان التوصيل أو حدد موقعك.");
      return;
    }
    setSubmitting(true);
    try {
      await createProductOrdersBatch(items.map((entry) => ({
        productId: entry.product.id,
        productTitle: entry.product.title,
        productImageUrl: entry.product.imageUrl || "",
        productMedia: entry.product.media,
        productPrice: entry.product.price,
        sellerId: entry.product.sellerId,
        sellerName: entry.product.sellerName,
        buyerId: viewer.uid,
        buyerName: buyerName.trim() || "زبون فورس",
        buyerPhone: phone.trim(),
        buyerAddress: address.trim(),
        buyerLocation: location,
        selectedColor: entry.color,
        selectedSize: entry.size,
        quantity: entry.quantity,
      })));
      clearStoreCart();
      Alert.alert("تم إرسال الطلب", "وصل طلبك إلى المتجر، ويمكنك متابعة حالته من الطلبات.", [
        { text: "عرض الطلبات", onPress: () => router.replace({ pathname: "/reservations", params: { tab: "myOrders" } } as any) },
      ]);
    } catch (error) {
      console.error("create store cart order failed:", error);
      Alert.alert("تعذر إرسال الطلب", error instanceof Error ? error.message : "حاول مرة أخرى بعد قليل.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={S.root}>
      <View style={[S.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={S.headerButton}><Feather name="arrow-right" size={21} color="#FFF" /></Pressable>
        <Text style={S.headerTitle}>إتمام طلب المتجر</Text>
        <Ionicons name="checkmark-circle-outline" size={23} color={C.accent} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        <Text style={S.sectionTitle}>بيانات التوصيل</Text>
        <TextInput style={S.input} value={buyerName} onChangeText={setBuyerName} placeholder="الاسم" placeholderTextColor={C.textMuted} textAlign="right" />
        <TextInput style={S.input} value={phone} onChangeText={setPhone} placeholder="رقم الهاتف" placeholderTextColor={C.textMuted} keyboardType="phone-pad" textAlign="right" />
        <TextInput style={[S.input, S.address]} value={address} onChangeText={setAddress} placeholder="عنوان التوصيل" placeholderTextColor={C.textMuted} multiline textAlign="right" />
        <Pressable style={S.locationButton} onPress={() => void chooseLocation()} disabled={locating}>
          {locating ? <ActivityIndicator size="small" color={C.accent} /> : <Feather name="map-pin" size={16} color={C.accent} />}
          <Text style={S.locationText}>{location ? "تم تحديد الموقع" : "تحديد موقعي على الخريطة (اختياري)"}</Text>
        </Pressable>

        <Text style={[S.sectionTitle, { marginTop: 22 }]}>ملخص الطلب</Text>
        <View style={S.summaryCard}>
          {items.map((entry) => (
            <View key={`${entry.product.id}_${entry.color}_${entry.size}`} style={S.summaryRow}>
              <Text style={S.summaryPrice}>{(Number(entry.product.price || 0) * entry.quantity).toLocaleString("ar-IQ-u-nu-latn")} د.ع</Text>
              <Text style={S.summaryName} numberOfLines={2}>{entry.product.title} × {entry.quantity}</Text>
            </View>
          ))}
          <View style={S.divider} />
          <View style={S.summaryRow}>
            <Text style={S.total}>{getStoreCartTotal().toLocaleString("ar-IQ-u-nu-latn")} د.ع</Text>
            <Text style={S.totalLabel}>الإجمالي</Text>
          </View>
        </View>
      </ScrollView>
      <View style={[S.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={[S.submitButton, submitting && { opacity: 0.65 }]} disabled={submitting || !items.length} onPress={() => void submit()}>
          {submitting ? <ActivityIndicator size="small" color={C.primary} /> : <><Text style={S.submitText}>إرسال الطلب</Text><Feather name="arrow-left" size={17} color={C.primary} /></>}
        </Pressable>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: 14, paddingBottom: 13, backgroundColor: "#0D1B3E", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,.1)", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  sectionTitle: { color: C.text, textAlign: "right", fontSize: 16, fontWeight: "700", marginBottom: 12 },
  input: { minHeight: 48, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, color: C.text, marginBottom: 10 },
  address: { minHeight: 86, paddingTop: 12, textAlignVertical: "top" },
  locationButton: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: C.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 2 },
  locationText: { color: C.accent, fontSize: 12, fontWeight: "600" },
  summaryCard: { backgroundColor: C.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, gap: 12 },
  summaryPrice: { color: C.text, fontSize: 12, fontWeight: "700" },
  summaryName: { color: C.textSecondary, fontSize: 12, textAlign: "right", flex: 1 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 7 },
  total: { color: C.accent, fontSize: 16, fontWeight: "800" },
  totalLabel: { color: C.text, fontSize: 14, fontWeight: "700" },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 14, paddingTop: 12, backgroundColor: C.card, borderTopWidth: 1, borderColor: C.border },
  submitButton: { minHeight: 50, borderRadius: 14, backgroundColor: C.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  submitText: { color: C.primary, fontWeight: "800", fontSize: 14 },
});
