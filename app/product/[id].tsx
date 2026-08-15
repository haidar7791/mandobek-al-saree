import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { subscribeToProducts, type Product } from "@/lib/db_logic";
import ProductMediaCarousel, { normalizeProductMedia } from "@/components/ProductMediaCarousel";
import Colors from "@/constants/colors";

const C = Colors.light;

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToProducts((products) => {
      setProduct(products.find((item) => item.id === id) ?? null);
      setLoading(false);
    }, () => setLoading(false));
    return unsubscribe;
  }, [id]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="رجوع">
          <Feather name="arrow-right" size={22} color={C.text} />
        </Pressable>
        <Text style={styles.headerTitle}>تفاصيل المنتج</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      ) : !product ? (
        <View style={styles.center}>
          <Feather name="package" size={42} color={C.textMuted} />
          <Text style={styles.emptyTitle}>المنتج غير متاح</Text>
          <Text style={styles.emptyText}>ربما تم بيع المنتج أو حذفه.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
           <ProductMediaCarousel
             media={normalizeProductMedia(product.media, product.imageUrl)}
             height={320}
           />
          <View style={styles.details}>
            <View style={styles.titleRow}>
              <View style={styles.priceBadge}>
                <Text style={styles.price}>{product.price.toLocaleString("ar-IQ")} د.ع</Text>
              </View>
              <Text style={styles.title}>{product.title}</Text>
            </View>
            {product.description ? <Text style={styles.description}>{product.description}</Text> : null}
            <View style={styles.divider} />
            <Pressable
              style={styles.sellerRow}
              onPress={() => router.push({ pathname: "/user-profile", params: { userId: product.sellerId } } as any)}
            >
              <View style={styles.sellerIcon}>
                <Feather name="user" size={18} color={C.accent} />
              </View>
              <View style={styles.sellerText}>
                <Text style={styles.sellerLabel}>البائع</Text>
                <Text style={styles.sellerName}>{product.sellerName}</Text>
              </View>
              <Feather name="chevron-left" size={18} color={C.textMuted} />
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerSpacer: { width: 38 },
  headerTitle: { fontSize: 17, fontFamily: "Cairo_700Bold", color: C.text },
  content: { paddingBottom: 32 },
  details: { padding: 18 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  title: { flex: 1, fontSize: 22, lineHeight: 32, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  priceBadge: { backgroundColor: "#FFF8EC", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  price: { fontSize: 14, fontFamily: "Cairo_700Bold", color: C.accent },
  description: { marginTop: 18, fontSize: 15, lineHeight: 27, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "right" },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 20 },
  sellerRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  sellerIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#FFF8EC", alignItems: "center", justifyContent: "center" },
  sellerText: { flex: 1, alignItems: "flex-end" },
  sellerLabel: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textMuted },
  sellerName: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  emptyTitle: { fontSize: 18, fontFamily: "Cairo_700Bold", color: C.text },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular", color: C.textMuted },
});