import React, { useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import {
  clearStoreCart,
  getStoreCart,
  getStoreCartTotal,
  updateStoreCartQuantity,
  type StoreCartItem,
} from "@/lib/store_cart";
import Colors from "@/constants/colors";

const C = Colors.light;

export default function StoreCartScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<StoreCartItem[]>([]);
  useFocusEffect(React.useCallback(() => { setItems(getStoreCart()); }, []));

  const update = (item: StoreCartItem, quantity: number) => {
    setItems(updateStoreCartQuantity(item.product.id, item.color, item.size, quantity));
  };

  return (
    <View style={S.root}>
      <View style={[S.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={S.headerButton}><Feather name="arrow-right" size={21} color="#FFF" /></Pressable>
        <Text style={S.headerTitle}>سلة المتجر</Text>
        {items.length ? <Pressable onPress={() => Alert.alert("إفراغ السلة", "هل تريد إزالة جميع المنتجات؟", [{ text: "إلغاء", style: "cancel" }, { text: "إفراغ", style: "destructive", onPress: () => { clearStoreCart(); setItems([]); } }])} style={S.headerButton}><Feather name="trash-2" size={18} color="#FFF" /></Pressable> : <View style={S.headerButton} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 120 }}>
        {items.length ? (
          <>
            <View style={S.storeNotice}>
              <Ionicons name="storefront-outline" size={18} color={C.accent} />
              <Text style={S.storeNoticeText}>كل عناصر الطلب من متجر واحد</Text>
            </View>
            {items.map((entry) => (
              <View key={`${entry.product.id}_${entry.color}_${entry.size}`} style={S.itemCard}>
                {entry.product.imageUrl ? <Image source={{ uri: entry.product.imageUrl }} style={S.image} /> : <View style={[S.image, S.imageEmpty]}><Feather name="image" size={23} color={C.textMuted} /></View>}
                <View style={S.itemInfo}>
                  <Text style={S.itemTitle} numberOfLines={2}>{entry.product.title}</Text>
                  {!!entry.color && <Text style={S.variant}>اللون: {entry.color}</Text>}
                  {!!entry.size && <Text style={S.variant}>القياس: {entry.size}</Text>}
                  <Text style={S.price}>{Number(entry.product.price || 0).toLocaleString("ar-IQ-u-nu-latn")} د.ع</Text>
                  <View style={S.quantityRow}>
                    <Pressable onPress={() => update(entry, entry.quantity + 1)} style={S.quantityButton}><Feather name="plus" size={15} color={C.text} /></Pressable>
                    <Text style={S.quantity}>{entry.quantity}</Text>
                    <Pressable onPress={() => update(entry, entry.quantity - 1)} style={S.quantityButton}><Feather name="minus" size={15} color={C.text} /></Pressable>
                    <Pressable onPress={() => update(entry, 0)} style={S.removeButton}><Feather name="x" size={15} color="#D44949" /><Text style={S.removeText}>إزالة</Text></Pressable>
                  </View>
                </View>
              </View>
            ))}
            <View style={S.totalRow}>
              <Text style={S.totalValue}>{getStoreCartTotal().toLocaleString("ar-IQ-u-nu-latn")} د.ع</Text>
              <Text style={S.totalLabel}>المجموع</Text>
            </View>
          </>
        ) : (
          <View style={S.empty}>
            <Ionicons name="cart-outline" size={54} color={C.textMuted} />
            <Text style={S.emptyTitle}>السلة فارغة</Text>
            <Text style={S.emptyHint}>أضف منتجات من أحد المتاجر للمتابعة.</Text>
            <Pressable style={S.browseButton} onPress={() => router.replace("/dashboard" as any)}><Text style={S.browseText}>العودة للمتاجر</Text></Pressable>
          </View>
        )}
      </ScrollView>

      {items.length ? (
        <View style={[S.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable style={S.checkoutButton} onPress={() => router.push("/shop/checkout" as any)}>
            <Text style={S.checkoutText}>متابعة وإتمام الطلب</Text>
            <Feather name="arrow-left" size={17} color={C.primary} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: 14, paddingBottom: 13, backgroundColor: "#0D1B3E", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: "rgba(255,255,255,.1)" },
  headerTitle: { color: "#FFF", fontSize: 17, fontWeight: "700" },
  storeNotice: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 7, marginBottom: 12, padding: 12, borderRadius: 12, backgroundColor: "rgba(201,168,76,.09)" },
  storeNoticeText: { color: C.textSecondary, fontSize: 12 },
  itemCard: { flexDirection: "row", backgroundColor: C.card, borderRadius: 15, overflow: "hidden", marginBottom: 11, borderWidth: 1, borderColor: C.border },
  image: { width: 104, minHeight: 132, backgroundColor: "#ECEEF2" },
  imageEmpty: { alignItems: "center", justifyContent: "center" },
  itemInfo: { flex: 1, padding: 12, gap: 5, alignItems: "flex-end" },
  itemTitle: { alignSelf: "stretch", textAlign: "right", color: C.text, fontSize: 14, fontWeight: "700" },
  variant: { color: C.textSecondary, fontSize: 11, textAlign: "right" },
  price: { color: C.accent, fontSize: 14, fontWeight: "800" },
  quantityRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 5 },
  quantityButton: { width: 28, height: 28, borderRadius: 9, backgroundColor: C.background, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  quantity: { color: C.text, fontWeight: "700", minWidth: 18, textAlign: "center" },
  removeButton: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: 8 },
  removeText: { color: "#D44949", fontSize: 11 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 16, borderTopWidth: 1, borderColor: C.border },
  totalLabel: { color: C.textSecondary, fontSize: 14 },
  totalValue: { color: C.text, fontSize: 17, fontWeight: "800" },
  empty: { minHeight: 430, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: "700" },
  emptyHint: { color: C.textSecondary, fontSize: 13, textAlign: "center" },
  browseButton: { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11, marginTop: 6 },
  browseText: { color: C.primary, fontWeight: "700" },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 14, paddingTop: 12, backgroundColor: C.card, borderTopWidth: 1, borderColor: C.border },
  checkoutButton: { backgroundColor: C.accent, minHeight: 50, borderRadius: 14, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9 },
  checkoutText: { color: C.primary, fontSize: 14, fontWeight: "800" },
});
