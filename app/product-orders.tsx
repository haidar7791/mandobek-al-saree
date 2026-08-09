import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  bulkDeleteProductOrders,
  type ProductOrder,
} from "@/lib/db_logic";

/** Orders in these statuses may be deleted */
const DELETABLE_STATUSES = new Set(["accepted", "rejected", "completed"]);
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
   PriceDisplay — shared formatted price helper
───────────────────────────────────────────── */
function PriceDisplay({ order }: { order: ProductOrder }) {
  const raw = order.productPrice ?? (order as any).price;
  return (
    <View style={styles.pricePill}>
      <Text style={styles.pricePillText}>
        {raw != null ? Number(raw).toLocaleString("ar-IQ") : "غير محدد"}
      </Text>
      {raw != null && <Text style={styles.pricePillCurrency}>د.ع</Text>}
    </View>
  );
}

/* ─────────────────────────────────────────────
   PurchaseCard — "طلباتي" (My Orders) tab
───────────────────────────────────────────── */
function PurchaseCard({ order }: { order: ProductOrder }) {
  const cfg = BUYER_STATUS[order.status];
  const date = new Date(order.createdAt).toLocaleDateString("ar-IQ", {
    day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });

  const goToProfile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/user-profile",
      params: { userId: order.sellerId, userName: order.sellerName ?? "" },
    } as any);
  };

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <View style={styles.card}>

        {/* ── Top section: thumbnail + name + price ── */}
        <View style={styles.cardTopRow}>
          <View style={styles.productInfo}>
            <Text style={styles.productTitle} numberOfLines={2}>{order.productTitle}</Text>
            <PriceDisplay order={order} />
          </View>
          <ProductThumb uri={order.productImageUrl} />
        </View>

        {/* ── Divider ── */}
        <View style={styles.divider} />

        {/* ── Seller info row ── */}
        <View style={styles.personRow}>
          <View style={styles.personAvatar}>
            <Feather name="user" size={15} color={C.accent} />
          </View>
          <View style={styles.personMeta}>
            <Text style={styles.personRoleLabel}>البائع</Text>
            <Text style={styles.personName} numberOfLines={1}>
              {order.sellerName || "—"}
            </Text>
          </View>
          {/* ── Status badge inline ── */}
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        <Text style={styles.dateText}>{date}</Text>

        {/* ── Full-width contact button ── */}
        <TouchableOpacity
          style={styles.contactBtn}
          activeOpacity={0.82}
          onPress={goToProfile}
        >
          <LinearGradient
            colors={[C.accent, "#B8952A"]}
            style={styles.contactBtnGradient}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            <Feather name="message-circle" size={16} color={C.primary} />
            <Text style={styles.contactBtnText}>تواصل مع المشتري</Text>
          </LinearGradient>
        </TouchableOpacity>

      </View>
    </Animated.View>
  );
}

/* ─────────────────────────────────────────────
   SaleCard — "منتجاتي" (My Products) tab
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

  const goToProfile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/user-profile",
      params: { userId: order.buyerId, userName: order.buyerName },
    } as any);
  };

  return (
    <Animated.View entering={FadeInDown.springify()}>
      <View style={styles.card}>

        {/* ── Top section: thumbnail + title + price ── */}
        <View style={styles.cardTopRow}>
          <View style={styles.productInfo}>
            <Text style={styles.productTitle} numberOfLines={2}>{order.productTitle}</Text>
            <PriceDisplay order={order} />
          </View>
          <ProductThumb uri={order.productImageUrl} />
        </View>

        {/* ── Divider ── */}
        <View style={styles.divider} />

        {/* ── Buyer info row ── */}
        <View style={styles.personRow}>
          <View style={styles.personAvatar}>
            <Feather name="user" size={15} color={C.accent} />
          </View>
          <View style={styles.personMeta}>
            <Text style={styles.personRoleLabel}>المشتري</Text>
            <Text style={styles.personName} numberOfLines={1}>{order.buyerName}</Text>
          </View>
          {/* ── Status badge inline ── */}
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        {/* ── Date + contact details ── */}
        <Text style={styles.dateText}>{date}</Text>

        {order.buyerPhone ? (
          <View style={styles.phoneRow}>
            <Feather name="phone" size={13} color={C.textSecondary} />
            <Text style={styles.phoneText}>{order.buyerPhone}</Text>
          </View>
        ) : null}

        {order.buyerLocation && (
          <View style={styles.phoneRow}>
            <Feather name="map-pin" size={13} color={C.accent} />
            <Text style={[styles.phoneText, { color: C.accent }]}>
              {order.buyerLocation.lat.toFixed(4)}, {order.buyerLocation.lng.toFixed(4)}
            </Text>
          </View>
        )}

        {/* ── Accept / Reject (pending only) ── */}
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

        {/* ── Full-width contact button ── */}
        <TouchableOpacity
          style={styles.contactBtn}
          activeOpacity={0.82}
          onPress={goToProfile}
        >
          <LinearGradient
            colors={[C.accent, "#B8952A"]}
            style={styles.contactBtnGradient}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            <Feather name="message-circle" size={16} color={C.primary} />
            <Text style={styles.contactBtnText}>تواصل مع المشتري</Text>
          </LinearGradient>
        </TouchableOpacity>

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

  // ── Bulk selection ──
  const [selectMode, setSelectMode]     = useState(false);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [deleting, setDeleting]         = useState(false);

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

  // Reset selection when changing tabs
  const switchTab = useCallback((tab: "sales" | "purchases") => {
    Haptics.selectionAsync();
    setActiveTab(tab);
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const pendingSales = saleOrders.filter((o) => o.status === "pending");
  const loading = activeTab === "sales" ? loadingSales : loadingPurchases;
  const listData: ProductOrder[] = activeTab === "sales"
    ? [...saleOrders.filter(o => o.status === "pending"), ...saleOrders.filter(o => o.status !== "pending")]
    : purchaseOrders;

  // Only non-pending orders are deletable
  const deletableInList = useMemo(
    () => listData.filter(o => DELETABLE_STATUSES.has(o.status)),
    [listData]
  );

  // Toggle one order in the selection set
  const toggleSelect = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Select / deselect all deletable orders
  const toggleSelectAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selectedIds.size === deletableInList.length && deletableInList.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(deletableInList.map(o => o.id)));
    }
  }, [selectedIds, deletableInList]);

  // Batch delete
  const handleBulkDelete = useCallback(() => {
    if (!selectedIds.size) return;
    Alert.alert(
      "تأكيد الحذف",
      `هل تريد حذف ${selectedIds.size} طلب؟ لا يمكن التراجع عن هذا الإجراء.`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            try {
              const uid = auth.currentUser?.uid ?? "";
              const role = activeTab === "sales" ? "seller" : "buyer";
              await bulkDeleteProductOrders(Array.from(selectedIds), uid, role);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setSelectMode(false);
              setSelectedIds(new Set());
            } catch {
              Alert.alert("خطأ", "تعذّر حذف الطلبات، يرجى المحاولة مجدداً.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }, [selectedIds]);

  const allSelected =
    deletableInList.length > 0 && selectedIds.size === deletableInList.length;

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
        {/* Select-mode toggle */}
        <TouchableOpacity
          style={styles.selectModeBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (selectMode) { setSelectMode(false); setSelectedIds(new Set()); }
            else setSelectMode(true);
          }}
          activeOpacity={0.8}
        >
          <Feather name={selectMode ? "x" : "check-square"} size={20} color={selectMode ? "#EF4444" : C.accent} />
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Tabs ── */}
      <View style={styles.tabsBar}>
        <Pressable
          style={[styles.tabBtn, activeTab === "purchases" && styles.tabBtnActive]}
          onPress={() => switchTab("purchases")}
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
          onPress={() => switchTab("sales")}
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

      {/* ── Select-all toolbar ── */}
      {selectMode && (
        <View style={styles.selectToolbar}>
          <TouchableOpacity
            style={styles.selectAllBtn}
            onPress={toggleSelectAll}
            activeOpacity={0.8}
          >
            <Feather
              name={allSelected ? "check-circle" : "circle"}
              size={16}
              color={allSelected ? C.accent : C.textMuted}
            />
            <Text style={styles.selectAllText}>
              {allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
            </Text>
            {deletableInList.length > 0 && (
              <Text style={styles.selectAllCount}>({deletableInList.length})</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.selectHint}>
            الطلبات المعلقة غير قابلة للحذف
          </Text>
        </View>
      )}

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
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + (selectMode && selectedIds.size > 0 ? 100 : 24) },
          ]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            activeTab === "sales" && pendingSales.length > 0 ? (
              <View style={styles.sectionHeader}>
                <View style={styles.pendingDot} />
                <Text style={styles.sectionHeaderText}>طلبات بانتظار ردك ({pendingSales.length})</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const canDelete = DELETABLE_STATUSES.has(item.status);
            const isSelected = selectedIds.has(item.id);

            const cardNode = activeTab === "sales" ? (
              <SaleCard
                order={item}
                onAccept={() => respondToProductOrder(item.id, item.productId, item.productTitle, item.buyerId, "accepted")}
                onReject={() => respondToProductOrder(item.id, item.productId, item.productTitle, item.buyerId, "rejected")}
              />
            ) : (
              <PurchaseCard order={item} />
            );

            if (!selectMode) return cardNode;

            return (
              <Pressable
                onPress={() => canDelete && toggleSelect(item.id)}
                style={[
                  styles.selectableWrapper,
                  isSelected && styles.selectableWrapperSelected,
                  !canDelete && styles.selectableWrapperDisabled,
                ]}
              >
                {/* Checkbox overlay */}
                <View style={styles.checkboxOverlay} pointerEvents="none">
                  <View style={[
                    styles.checkbox,
                    isSelected && styles.checkboxSelected,
                    !canDelete && styles.checkboxDisabled,
                  ]}>
                    {isSelected && <Feather name="check" size={12} color="#FFF" />}
                  </View>
                </View>
                {cardNode}
              </Pressable>
            );
          }}
        />
      )}

      {/* ── Bottom action bar (shown only in selectMode with items selected) ── */}
      {selectMode && selectedIds.size > 0 && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.bottomBarCount}>
            {selectedIds.size} طلب محدد
          </Text>
          <TouchableOpacity
            style={[styles.deleteSelectedBtn, deleting && styles.btnDisabled]}
            activeOpacity={0.85}
            disabled={deleting}
            onPress={handleBulkDelete}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Feather name="trash-2" size={16} color="#FFF" />
                <Text style={styles.deleteSelectedText}>حذف المحدد</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
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

  // ── Header select button ──
  selectModeBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },

  // ── Select-all toolbar ──
  selectToolbar: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: "rgba(201,168,76,0.06)",
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  selectAllBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  selectAllText: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.text },
  selectAllCount: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textMuted },
  selectHint: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted },

  // ── Selectable card wrapper ──
  selectableWrapper: {
    borderRadius: 16, position: "relative",
    borderWidth: 2, borderColor: "transparent",
  },
  selectableWrapperSelected: {
    borderColor: C.accent,
    backgroundColor: "rgba(201,168,76,0.04)",
  },
  selectableWrapperDisabled: { opacity: 0.55 },

  // ── Checkbox overlay (top-left corner) ──
  checkboxOverlay: {
    position: "absolute", top: 10, left: 10, zIndex: 10,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: C.border,
    backgroundColor: C.card,
    alignItems: "center", justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: C.accent, borderColor: C.accent,
  },
  checkboxDisabled: {
    borderColor: C.textMuted, backgroundColor: C.inputBg,
  },

  // ── Bottom action bar ──
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 14,
    backgroundColor: C.card,
    borderTopWidth: 1, borderTopColor: C.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 8,
  },
  bottomBarCount: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text },
  deleteSelectedBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#EF4444", borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  deleteSelectedText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: "#FFF" },

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
    backgroundColor: C.card, borderRadius: 18, padding: 16, gap: 12,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
  },

  // Top row: thumbnail + product info
  // row (not row-reverse) — elements ordered in JSX as [textBlock, image]
  // RTL native: row flows right→left, so textBlock lands on RIGHT, image on LEFT ✓
  // RTL web:    same RTL flow, same visual result ✓
  cardTopRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
  },
  productThumb: { width: 72, height: 72, borderRadius: 14 },
  thumbFallback: { backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center" },
  productInfo: { flex: 1, gap: 6, alignItems: "flex-end" },
  productTitle: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },

  // Price pill
  pricePill: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    alignSelf: "flex-end",
    backgroundColor: "rgba(22,163,74,0.1)",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  pricePillText: { fontSize: 16, fontFamily: "Cairo_700Bold", color: "#16A34A" },
  pricePillCurrency: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: "#16A34A" },

  // Divider
  divider: { height: 1, backgroundColor: C.border, marginVertical: 2 },

  // Person info row
  personRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
  },
  personAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(201,168,76,0.12)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(201,168,76,0.25)",
  },
  personMeta: { flex: 1, alignItems: "flex-end" },
  personRoleLabel: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted },
  personName: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },

  // Status badge
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontFamily: "Cairo_600SemiBold" },
  dateText: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted, textAlign: "right" },

  // Phone / location rows
  phoneRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  phoneText: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary },

  // Full-width contact button
  contactBtn: { borderRadius: 14, overflow: "hidden", marginTop: 2 },
  contactBtnGradient: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14,
  },
  contactBtnText: {
    fontSize: 15, fontFamily: "Cairo_700Bold", color: C.primary,
  },

  // Actions (accept / reject)
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
