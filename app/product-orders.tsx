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
  subscribeToBuyerProductOrders,
  respondToProductOrder,
  type ProductOrder,
} from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

const SELLER_STATUS = {
  pending:  { label: "بانتظار ردك", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  accepted: { label: "تم القبول",   color: "#22C55E", bg: "rgba(34,197,94,0.12)"  },
  rejected: { label: "مرفوض",       color: "#EF4444", bg: "rgba(239,68,68,0.12)"  },
};

const BUYER_STATUS = {
  pending:  { label: "🟡 قيد المعالجة", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  accepted: { label: "🟢 مقبول",         color: "#22C55E", bg: "rgba(34,197,94,0.12)"  },
  rejected: { label: "🔴 مرفوض",         color: "#EF4444", bg: "rgba(239,68,68,0.12)"  },
};

/* ─────────────────────────────────────────────
   ProductThumb — shared image/fallback helper
───────────────────────────────────────────── */
function ProductThumb({ uri }: { uri?: string }) {
  if (uri) {
    return <Image source={{ uri }} style={styles.productThumb} resizeMode="cover" />;
  }
  return (
    <View style={[styles.productThumb, styles.thumbFallback]}>
      <Feather name="image" size={18} color={C.textMuted} />
    </View>
  );
}

/* ─────────────────────────────────────────────
   SellerCard — for "طلباتي" (My Purchases) tab
───────────────────────────────────────────── */
function PurchaseCard({ order }: { order: ProductOrder }) {
  const cfg = BUYER_STATUS[order.status];
  const date = new Date(order.createdAt).toLocaleDateString("ar-IQ", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <View style={styles.card}>
        {/* ── Top row: thumbnail + product info ── */}
        <View style={styles.cardTopRow}>
          <ProductThumb uri={order.productImageUrl} />
          <View style={styles.productInfo}>
            <Text style={styles.productTitle} numberOfLines={2}>{order.productTitle}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>السعر:</Text>
              <Text style={styles.priceText}>
                {(order.productPrice ?? (order as any).price) != null
                  ? Number(order.productPrice ?? (order as any).price).toLocaleString("ar-IQ")
                  : "غير محدد"}
                {(order.productPrice ?? (order as any).price) != null && (
                  <Text style={styles.currencyText}> د.ع</Text>
                )}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Seller name (tappable) ── */}
        {order.sellerName ? (
          <TouchableOpacity
            style={styles.personBtn}
            activeOpacity={0.75}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({
                pathname: "/user-profile",
                params: { userId: order.sellerId, userName: order.sellerName },
              } as any);
            }}
          >
            <Text style={styles.personBtnText} numberOfLines={1}>{order.sellerName}</Text>
            <Feather name="user" size={14} color={C.accent} />
            <Text style={styles.personBtnLabel}>البائع:</Text>
          </TouchableOpacity>
        ) : null}

        {/* ── Date + status badge ── */}
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={styles.dateText}>{date}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

/* ─────────────────────────────────────────────
   SaleCard — for "منتجاتي" (My Sales) tab
───────────────────────────────────────────── */
function SaleCard({ order, onAccept, onReject }: {
  order: ProductOrder;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [acting, setActing] = useState(false);
  const cfg = SELLER_STATUS[order.status];
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
        {/* ── Top row: thumbnail + product info ── */}
        <View style={styles.cardTopRow}>
          <ProductThumb uri={order.productImageUrl} />
          <View style={styles.productInfo}>
            <Text style={styles.productTitle} numberOfLines={2}>{order.productTitle}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>السعر:</Text>
              <Text style={styles.priceText}>
                {(order.productPrice ?? (order as any).price) != null
                  ? Number(order.productPrice ?? (order as any).price).toLocaleString("ar-IQ")
                  : "غير محدد"}
                {(order.productPrice ?? (order as any).price) != null && (
                  <Text style={styles.currencyText}> د.ع</Text>
                )}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Buyer name (tappable) ── */}
        <TouchableOpacity
          style={styles.personBtn}
          activeOpacity={0.75}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({
              pathname: "/user-profile",
              params: { userId: order.buyerId, userName: order.buyerName },
            } as any);
          }}
        >
          <Text style={styles.personBtnText} numberOfLines={1}>{order.buyerName}</Text>
          <Feather name="user" size={14} color={C.accent} />
          <Text style={styles.personBtnLabel}>المشتري:</Text>
        </TouchableOpacity>

        {/* ── Date + status badge ── */}
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <Text style={styles.dateText}>{date}</Text>
        </View>

        {/* ── Contact details ── */}
        <View style={styles.contactSection}>
          <Text style={styles.contactLabel}>بيانات التواصل</Text>
          <View style={styles.contactRow}>
            <Feather name="phone" size={13} color={C.textSecondary} />
            <Text style={styles.contactText}>{order.buyerPhone || "غير متوفر"}</Text>
          </View>
          {order.buyerLocation && (
            <View style={styles.contactRow}>
              <Feather name="map-pin" size={13} color={C.accent} />
              <Text style={[styles.contactText, { color: C.accent }]}>
                {order.buyerLocation.lat.toFixed(4)}, {order.buyerLocation.lng.toFixed(4)}
              </Text>
            </View>
          )}
        </View>

        {/* ── Action buttons (pending only) ── */}
        {order.status === "pending" && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.rejectBtn, acting && styles.btnDisabled]}
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
                  <Feather name="x" size={14} color="#EF4444" />
                  <Text style={styles.rejectBtnText}>رفض</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.acceptBtn, acting && styles.btnDisabled]}
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
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                >
                  <Feather name="check" size={14} color="#FFF" />
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

/* ─────────────────────────────────────────────
   Main screen
───────────────────────────────────────────── */
export default function ProductOrdersScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;

  const [activeTab, setActiveTab] = useState<"sales" | "purchases">("sales");
  const [saleOrders, setSaleOrders]         = useState<ProductOrder[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<ProductOrder[]>([]);
  const [loadingSales, setLoadingSales]         = useState(true);
  const [loadingPurchases, setLoadingPurchases] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) { router.replace("/login" as any); return; }

    const unsubSales = subscribeToSellerProductOrders(
      user.uid,
      (data) => { setSaleOrders(data); setLoadingSales(false); },
      ()     => { setLoadingSales(false); setSaleOrders([]); }
    );
    const unsubPurchases = subscribeToBuyerProductOrders(
      user.uid,
      (data) => { setPurchaseOrders(data); setLoadingPurchases(false); },
      ()     => { setLoadingPurchases(false); setPurchaseOrders([]); }
    );
    return () => { unsubSales(); unsubPurchases(); };
  }, []);

  const pendingSales = saleOrders.filter((o) => o.status === "pending");
  const loading = activeTab === "sales" ? loadingSales : loadingPurchases;
  const listData = activeTab === "sales"
    ? [...saleOrders.filter(o => o.status === "pending"), ...saleOrders.filter(o => o.status !== "pending")]
    : purchaseOrders;

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={[styles.header, { paddingTop: topPad + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="chevron-right" size={24} color="#FFF" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>طلبات المنتجات</Text>
          <Text style={styles.headerSub}>
            {pendingSales.length > 0 ? `${pendingSales.length} طلب بانتظار ردك` : "إدارة طلبات البيع والشراء"}
          </Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="bag-handle" size={24} color={C.accent} />
        </View>
      </LinearGradient>

      {/* ── Tabs ── */}
      <View style={styles.tabsBar}>
        <Pressable
          style={[styles.tabBtn, activeTab === "purchases" && styles.tabBtnActive]}
          onPress={() => { Haptics.selectionAsync(); setActiveTab("purchases"); }}
        >
          <Feather name="shopping-bag" size={14} color={activeTab === "purchases" ? C.accent : C.textMuted} />
          <Text style={[styles.tabText, activeTab === "purchases" && styles.tabTextActive]}>طلباتي</Text>
          {purchaseOrders.filter(o => o.status === "pending").length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{purchaseOrders.filter(o => o.status === "pending").length}</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === "sales" && styles.tabBtnActive]}
          onPress={() => { Haptics.selectionAsync(); setActiveTab("sales"); }}
        >
          <Feather name="inbox" size={14} color={activeTab === "sales" ? C.accent : C.textMuted} />
          <Text style={[styles.tabText, activeTab === "sales" && styles.tabTextActive]}>منتجاتي</Text>
          {pendingSales.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{pendingSales.length}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* ── List ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : listData.length === 0 ? (
        <View style={styles.center}>
          <Feather name="inbox" size={52} color={C.textMuted} />
          <Text style={styles.emptyTitle}>
            {activeTab === "sales" ? "لا توجد طلبات بعد" : "لم تقم بأي طلب شراء بعد"}
          </Text>
          <Text style={styles.emptySub}>
            {activeTab === "sales"
              ? "ستظهر هنا طلبات شراء منتجاتك"
              : "تصفّح السوق وأرسل طلب شراء"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(o) => o.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            activeTab === "sales" && pendingSales.length > 0 ? (
              <View style={styles.sectionHeader}>
                <View style={styles.pendingDot} />
                <Text style={styles.sectionHeaderText}>طلبات بانتظار ردك ({pendingSales.length})</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) =>
            activeTab === "sales" ? (
              <SaleCard
                order={item}
                onAccept={() => respondToProductOrder(item.id, item.productId, item.productTitle, item.buyerId, "accepted")}
                onReject={() => respondToProductOrder(item.id, item.productId, item.productTitle, item.buyerId, "rejected")}
              />
            ) : (
              <PurchaseCard order={item} />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },

  // ── Header ──
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

  // ── Tabs ──
  tabsBar: {
    flexDirection: "row", backgroundColor: C.card,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 13, gap: 6,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabBtnActive: { borderBottomColor: C.accent },
  tabText: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.textMuted },
  tabTextActive: { color: C.accent },
  tabBadge: {
    backgroundColor: C.accent, borderRadius: 8,
    minWidth: 18, height: 18, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 5,
  },
  tabBadgeText: { fontSize: 10, fontFamily: "Cairo_700Bold", color: C.primary },

  // ── Misc ──
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyTitle: { fontSize: 17, fontFamily: "Cairo_700Bold", color: C.text },
  emptySub: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "center" },
  listContent: { padding: 16, gap: 12 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginBottom: 4, justifyContent: "flex-end",
  },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#F59E0B" },
  sectionHeaderText: { fontSize: 13, fontFamily: "Cairo_700Bold", color: C.text },

  // ── Card ──
  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 12,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },

  // Top row: thumbnail + product info
  cardTopRow: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 12,
  },
  productThumb: { width: 60, height: 60, borderRadius: 12 },
  thumbFallback: { backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center" },
  productInfo: { flex: 1, gap: 4, alignItems: "flex-end" },
  productTitle: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  priceRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4, marginTop: 2 },
  priceLabel: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  priceText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: "#16A34A", textAlign: "right" },
  currencyText: { fontSize: 11, fontFamily: "Cairo_600SemiBold", color: "#16A34A" },

  // Person button (buyer / seller)
  personBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    backgroundColor: "rgba(201,168,76,0.08)",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: "rgba(201,168,76,0.2)",
  },
  personBtnLabel: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textSecondary },
  personBtnText: { flex: 1, fontSize: 14, fontFamily: "Cairo_700Bold", color: C.accent, textAlign: "right" },

  // Status row
  statusRow: {
    flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center",
  },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 12, fontFamily: "Cairo_600SemiBold" },
  dateText: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted },

  // Contact section
  contactSection: {
    backgroundColor: C.inputBg, borderRadius: 12, padding: 12, gap: 8,
  },
  contactLabel: { fontSize: 11, fontFamily: "Cairo_700Bold", color: C.primary, textAlign: "right" },
  contactRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  contactText: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.text },

  // Actions
  actions: { flexDirection: "row", gap: 10 },
  rejectBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12,
    borderWidth: 1.5, borderColor: "rgba(239,68,68,0.4)",
    backgroundColor: "rgba(239,68,68,0.06)", borderRadius: 12,
  },
  rejectBtnText: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: "#EF4444" },
  acceptBtn: { flex: 1, borderRadius: 12, overflow: "hidden" },
  acceptGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12,
  },
  acceptBtnText: { fontSize: 14, fontFamily: "Cairo_700Bold", color: "#FFF" },
  btnDisabled: { opacity: 0.6 },
});
