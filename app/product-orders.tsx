import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { auth } from "@/lib/firebase";
import {
  subscribeToSellerProductOrders,
  respondToProductOrder,
  type ProductOrder,
} from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

const STATUS_CONFIG = {
  pending:  { label: "بانتظار ردك", color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  accepted: { label: "تم القبول",   color: "#22C55E", bg: "rgba(34,197,94,0.1)"   },
  rejected: { label: "مرفوض",       color: "#EF4444", bg: "rgba(239,68,68,0.1)"   },
};

function OrderCard({ order, onAccept, onReject }: {
  order: ProductOrder;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [acting, setActing] = useState(false);
  const cfg = STATUS_CONFIG[order.status];
  const date = new Date(order.createdAt).toLocaleDateString("ar-IQ", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });

  const act = async (fn: () => void) => {
    setActing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try { await fn(); }
    finally { setActing(false); }
  };

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <View style={styles.card}>
        {/* Product image + title */}
        <View style={styles.cardTop}>
          {order.productImageUrl ? (
            <Image source={{ uri: order.productImageUrl }} style={styles.productThumb} resizeMode="cover" />
          ) : (
            <View style={[styles.productThumb, styles.thumbFallback]}>
              <Feather name="image" size={22} color={C.textMuted} />
            </View>
          )}
          <View style={styles.productInfo}>
            <Text style={styles.productTitle} numberOfLines={2}>{order.productTitle}</Text>
            <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            <Text style={styles.dateText}>{date}</Text>
          </View>
        </View>

        {/* Buyer info */}
        <View style={styles.buyerSection}>
          <Text style={styles.sectionLabel}>بيانات المشتري</Text>
          <View style={styles.buyerRow}>
            <Feather name="user" size={14} color={C.textSecondary} />
            <Text style={styles.buyerText}>{order.buyerName}</Text>
          </View>
          <View style={styles.buyerRow}>
            <Feather name="phone" size={14} color={C.textSecondary} />
            <Text style={styles.buyerText}>{order.buyerPhone || "غير متوفر"}</Text>
          </View>
          {order.buyerLocation && (
            <View style={styles.buyerRow}>
              <Feather name="map-pin" size={14} color={C.accent} />
              <Text style={[styles.buyerText, { color: C.accent }]}>
                {order.buyerLocation.lat.toFixed(4)}, {order.buyerLocation.lng.toFixed(4)}
              </Text>
            </View>
          )}
        </View>

        {/* Action buttons — only shown for pending orders */}
        {order.status === "pending" && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn, acting && styles.btnDisabled]}
              onPress={() =>
                Alert.alert("رفض الطلب", "هل تريد رفض هذا الطلب؟", [
                  { text: "إلغاء", style: "cancel" },
                  { text: "رفض", style: "destructive", onPress: () => act(onReject) },
                ])
              }
              disabled={acting}
              activeOpacity={0.8}
            >
              {acting ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <>
                  <Feather name="x" size={15} color="#EF4444" />
                  <Text style={styles.rejectBtnText}>رفض</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn, acting && styles.btnDisabled]}
              onPress={() =>
                Alert.alert("قبول الطلب", "هل تريد قبول هذا الطلب وتحديد المنتج كـ مباع؟", [
                  { text: "إلغاء", style: "cancel" },
                  { text: "قبول", onPress: () => act(onAccept) },
                ])
              }
              disabled={acting}
              activeOpacity={0.8}
            >
              {acting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <LinearGradient
                  colors={["#22C55E", "#16A34A"]}
                  style={styles.acceptGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Feather name="check" size={15} color="#FFF" />
                  <Text style={styles.acceptBtnText}>قبول</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

export default function ProductOrdersScreen() {
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<ProductOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) { router.replace("/login" as any); return; }
    const unsub = subscribeToSellerProductOrders(
      user.uid,
      (data) => {
        setOrders(data);
        setLoading(false);
      },
      (_err) => {
        // PERMISSION_DENIED or network error — stop spinner, show empty state
        setLoading(false);
        setOrders([]);
      }
    );
    return unsub;
  }, []);

  const pending = orders.filter((o) => o.status === "pending");
  const others  = orders.filter((o) => o.status !== "pending");

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={[styles.header, { paddingTop: topPad + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="chevron-right" size={24} color="#FFF" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>طلبات شراء منتجاتك</Text>
          <Text style={styles.headerSub}>
            {pending.length > 0 ? `${pending.length} طلب بانتظار ردك` : "لا طلبات جديدة"}
          </Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="bag-handle" size={24} color={C.accent} />
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          <Feather name="inbox" size={52} color={C.textMuted} />
          <Text style={styles.emptyTitle}>لا توجد طلبات بعد</Text>
          <Text style={styles.emptySub}>ستظهر هنا طلبات شراء منتجاتك</Text>
        </View>
      ) : (
        <FlatList
          data={[...pending, ...others]}
          keyExtractor={(o) => o.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            pending.length > 0 ? (
              <View style={styles.sectionHeader}>
                <View style={styles.pendingDot} />
                <Text style={styles.sectionHeaderText}>طلبات بانتظار ردك ({pending.length})</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const user = auth.currentUser!;
            return (
              <OrderCard
                order={item}
                onAccept={() =>
                  respondToProductOrder(
                    item.id, item.productId, item.productTitle, item.buyerId, "accepted"
                  )
                }
                onReject={() =>
                  respondToProductOrder(
                    item.id, item.productId, item.productTitle, item.buyerId, "rejected"
                  )
                }
              />
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 18, gap: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  headerText: { flex: 1, alignItems: "flex-end" },
  headerTitle: { fontSize: 18, fontFamily: "Cairo_700Bold", color: "#FFF", textAlign: "right" },
  headerSub: { fontSize: 12, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.6)", textAlign: "right" },
  headerIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: "rgba(201,168,76,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontSize: 17, fontFamily: "Cairo_700Bold", color: C.text },
  emptySub: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary },
  listContent: { padding: 16, gap: 12 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginBottom: 8, justifyContent: "flex-end",
  },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#F59E0B" },
  sectionHeaderText: { fontSize: 13, fontFamily: "Cairo_700Bold", color: C.text },
  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 14,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  cardTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  productThumb: { width: 70, height: 70, borderRadius: 12 },
  thumbFallback: { backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center" },
  productInfo: { flex: 1, gap: 4, alignItems: "flex-end" },
  productTitle: { fontSize: 14, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-end" },
  statusText: { fontSize: 12, fontFamily: "Cairo_600SemiBold" },
  dateText: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted },
  buyerSection: {
    backgroundColor: C.inputBg, borderRadius: 12, padding: 12, gap: 8,
  },
  sectionLabel: { fontSize: 12, fontFamily: "Cairo_700Bold", color: C.primary, textAlign: "right" },
  buyerRow: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "flex-end" },
  buyerText: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.text },
  actions: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, borderRadius: 12, overflow: "hidden" },
  rejectBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12,
    borderWidth: 1.5, borderColor: "rgba(239,68,68,0.4)",
    backgroundColor: "rgba(239,68,68,0.06)",
    borderRadius: 12,
  },
  rejectBtnText: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: "#EF4444" },
  acceptBtn: { borderRadius: 12, overflow: "hidden" },
  acceptGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12,
  },
  acceptBtnText: { fontSize: 14, fontFamily: "Cairo_700Bold", color: "#FFF" },
  btnDisabled: { opacity: 0.6 },
});
