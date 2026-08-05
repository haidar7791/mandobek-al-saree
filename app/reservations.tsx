import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
  Alert,
  Linking,
  TouchableOpacity,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { auth } from "../lib/firebase";
import {
  subscribeToServiceRequests,
  subscribeToClientServiceRequests,
  getArtisanByUserId,
  getUserProfile,
  acceptServiceRequest,
  rejectServiceRequest,
  hideServiceRequestsForUser,
  subscribeToSellerProductOrders,
  respondToProductOrder,
  ACTIVE_STATUSES,
  STATUS_LABELS,
  getSpecialtyLabel,
  type ServiceRequest,
  type ServiceRequestStatus,
  type ProductOrder,
} from "../lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

type Tab = "pending" | "active" | "history" | "products";

const TAB_LABELS: Record<Tab, string> = {
  pending: "الجديدة",
  active: "النشطة",
  history: "السجل",
  products: "المنتجات",
};

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ar-IQ", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusColor(status: ServiceRequestStatus): string {
  switch (status) {
    case "pending":
      return "#F59E0B";
    case "accepted":
    case "on_the_way":
    case "in_progress":
      return "#22C55E";
    case "completed":
      return "#3B82F6";
    case "rejected":
    case "cancelled":
      return "#EF4444";
    default:
      return C.textMuted;
  }
}

function RequestCard({
  request,
  isArtisan,
  onAccept,
  onReject,
  onOpen,
  selectionMode,
  selected,
  onToggleSelect,
  onLongPress,
}: {
  request: ServiceRequest;
  isArtisan: boolean;
  onAccept: () => void;
  onReject: () => void;
  onOpen: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onLongPress?: () => void;
}) {
  const openMaps = () => {
    if (!request.clientLocation) return;
    const { lat, lng } = request.clientLocation;
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url);
  };
  const callClient = () => {
    if (!request.clientPhone) return;
    Linking.openURL(`tel:${request.clientPhone}`);
  };
  const isPending = request.status === "pending";
  const showLiveLink = !isArtisan && request.status === "on_the_way";

  return (
    <Pressable
      onLongPress={onLongPress}
      onPress={selectionMode ? onToggleSelect : undefined}
      delayLongPress={400}
    >
      <Animated.View
        entering={FadeInDown.springify()}
        style={[styles.card, selected && styles.cardSelected]}
      >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          {selectionMode ? (
            <Pressable onPress={onToggleSelect} hitSlop={8} style={styles.checkboxWrap}>
              <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                {selected ? <Feather name="check" size={12} color="#FFF" /> : null}
              </View>
            </Pressable>
          ) : null}
          <View style={[styles.statusPill, { backgroundColor: statusColor(request.status) + "22" }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor(request.status) }]} />
            <Text style={[styles.statusText, { color: statusColor(request.status) }]}>
              {STATUS_LABELS[request.status]}
            </Text>
          </View>
        </View>
        <Text style={styles.cardTime}>{formatTime(request.createdAt)}</Text>
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.specialtyTag}>{getSpecialtyLabel(request.specialty)}</Text>
        <Text style={styles.peerName}>
          {isArtisan ? request.clientName : request.artisanName}
        </Text>
      </View>

      {request.problemDescription ? (
        <Text style={styles.problem}>{request.problemDescription}</Text>
      ) : null}

      {isArtisan && request.clientPhone ? (
        <View style={styles.metaRow}>
          <Feather name="phone" size={13} color={C.textSecondary} />
          <Text style={styles.metaText}>{request.clientPhone}</Text>
        </View>
      ) : null}

      {request.clientAddress ? (
        <View style={styles.metaRow}>
          <Feather name="map-pin" size={13} color={C.textSecondary} />
          <Text style={styles.metaText}>{request.clientAddress}</Text>
        </View>
      ) : null}

      {isArtisan && request.clientLocation ? (
        <Pressable style={styles.mapBtn} onPress={openMaps}>
          <Feather name="map" size={15} color={C.accent} />
          <Text style={styles.mapBtnText}>عرض موقع العميل على الخريطة</Text>
        </Pressable>
      ) : null}

      {showLiveLink ? (
        <Pressable style={styles.trackBtn} onPress={onOpen}>
          <Feather name="navigation" size={15} color="#FFF" />
          <Text style={styles.trackText}>تتبّع صاحب الاختصاص مباشرة</Text>
        </Pressable>
      ) : null}

      {isPending && isArtisan ? (
        <View style={styles.actionRow}>
          <Pressable style={[styles.actionBtn, styles.rejectBtn]} onPress={onReject}>
            <Feather name="x" size={16} color="#FFF" />
            <Text style={styles.actionBtnText}>رفض</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.acceptBtn]} onPress={onAccept}>
            <Feather name="check" size={16} color="#FFF" />
            <Text style={styles.actionBtnText}>قبول</Text>
          </Pressable>
        </View>
      ) : null}

      {!isPending && !selectionMode ? (
        <View style={styles.bottomRow}>
          {isArtisan && request.clientPhone ? (
            <Pressable style={styles.smallBtn} onPress={callClient}>
              <Feather name="phone" size={14} color={C.primary} />
              <Text style={styles.smallBtnText}>اتصال</Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.smallBtn, styles.smallBtnPrimary]} onPress={onOpen}>
            <Feather name="arrow-left" size={14} color="#FFF" />
            <Text style={[styles.smallBtnText, { color: "#FFF" }]}>التفاصيل</Text>
          </Pressable>
        </View>
      ) : null}
      </Animated.View>
    </Pressable>
  );
}

export default function ReservationsScreen() {
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [productOrders, setProductOrders] = useState<ProductOrder[]>([]);
  const [tab, setTab] = useState<Tab>("pending");
  const [isArtisan, setIsArtisan] = useState(false);
  const [loading, setLoading] = useState(true);
  // History cleanup: selection mode is only ever entered from the "السجل"
  // tab (enforced in enterSelectionMode / the tab-change effect below) so
  // active/pending requests can never be bulk-deleted by accident.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const currentUid = auth.currentUser?.uid;

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/login");
      return;
    }

    let unsub: (() => void) | null = null;
    let mounted = true;
    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 8000);

    (async () => {
      try {
        // Fetch in parallel to reduce wait time
        const [profile, artisanRecord] = await Promise.all([
          getUserProfile(user.uid),
          getArtisanByUserId(user.uid),
        ]);

        if (!mounted) return; // Component unmounted during async fetch — abort

        const asArtisan = profile?.role === "artisan" && !!artisanRecord;
        setIsArtisan(asArtisan);

        const handleList = (list: ServiceRequest[]) => {
          if (!mounted) return;
          setRequests(list);
          setLoading(false);
          clearTimeout(safetyTimer);
        };
        const handleError = (err: Error) => {
          if (!mounted) return;
          setLoading(false);
          clearTimeout(safetyTimer);
          // Surface the real Firestore error instead of silently showing an empty
          // list — this is the fastest way to spot permission-denied / missing-index
          // issues (Firestore prints a one-click "create index" link in this case).
          console.error("Service requests subscription failed:", err);
          Alert.alert(
            "تعذّر تحميل الطلبات",
            "حدث خطأ أثناء الاتصال بقاعدة البيانات. حاول لاحقاً أو تحقق من صلاحيات Firestore.\n\n" +
              (err?.message || "")
          );
        };

        if (asArtisan && artisanRecord) {
          // Firestore security rules authorize reads by artisanUserId (auth uid),
          // not artisanId (the artisans/{id} document id) — must match or the
          // query is rejected outright with permission-denied.
          unsub = subscribeToServiceRequests(user.uid, handleList, handleError);
        } else {
          unsub = subscribeToClientServiceRequests(user.uid, handleList, handleError);
        }
      } catch (err) {
        console.error("reservations setup error:", err);
        if (mounted) {
          setLoading(false);
          clearTimeout(safetyTimer);
        }
      }
    })();

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      if (unsub) unsub();
    };
  }, []);

  // Product orders subscription — runs in parallel with service requests
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsub = subscribeToSellerProductOrders(
      user.uid,
      (orders) => setProductOrders(orders),
      () => setProductOrders([])
    );
    return unsub;
  }, []);

  // Requests this user has soft-deleted from their own history stay hidden
  // everywhere in this screen (they're already completed/cancelled/rejected).
  const visibleRequests = useMemo(
    () => requests.filter((r) => !currentUid || !r.hiddenFor?.includes(currentUid)),
    [requests, currentUid]
  );

  const filtered = useMemo(() => {
    if (tab === "pending") return visibleRequests.filter((r) => r.status === "pending");
    if (tab === "active") return visibleRequests.filter((r) => ACTIVE_STATUSES.includes(r.status));
    return visibleRequests.filter((r) =>
      ["completed", "cancelled", "rejected"].includes(r.status)
    );
  }, [visibleRequests, tab]);

  // Exit selection mode automatically if the user switches away from السجل,
  // so a stray toolbar can never linger over the pending/active tabs.
  useEffect(() => {
    if (tab !== "history") {
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  }, [tab]);

  const enterSelectionMode = (id: string) => {
    if (tab !== "history") return; // hard gate: only السجل may enter selection mode
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  };

  const toggleSelect = (id: string) => {
    Haptics.selectionAsync();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    Haptics.selectionAsync();
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)));
    }
  };

  const handleCancelSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0 || tab !== "history") return;
    Alert.alert(
      "حذف من السجل",
      "هل أنت متأكد من حذف الطلبات المحددة من السجل؟ لا يمكن التراجع عن هذه الخطوة.",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: async () => {
            const user = auth.currentUser;
            if (!user) return;
            const ids = Array.from(selectedIds);
            setDeleting(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            try {
              await hideServiceRequestsForUser(ids, user.uid);
              // Optimistic: mark them hidden locally instead of waiting on the
              // Firestore round-trip so the list updates instantly.
              setRequests((prev) =>
                prev.map((r) =>
                  ids.includes(r.id)
                    ? { ...r, hiddenFor: [...(r.hiddenFor || []), user.uid] }
                    : r
                )
              );
              setSelectionMode(false);
              setSelectedIds(new Set());
            } catch (err) {
              console.error("hideServiceRequestsForUser error:", err);
              Alert.alert("خطأ", "تعذّر حذف الطلبات المحددة، حاول مرة أخرى");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const counts = useMemo(
    () => ({
      pending: visibleRequests.filter((r) => r.status === "pending").length,
      active: visibleRequests.filter((r) => ACTIVE_STATUSES.includes(r.status)).length,
      history: visibleRequests.filter((r) =>
        ["completed", "cancelled", "rejected"].includes(r.status)
      ).length,
      products: productOrders.filter((o) => o.status === "pending").length,
    }),
    [visibleRequests, productOrders]
  );

  const pendingProductOrders = productOrders.filter((o) => o.status === "pending");
  const otherProductOrders  = productOrders.filter((o) => o.status !== "pending");

  const handleAccept = async (req: ServiceRequest) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Optimistic update: reflect the new status instantly, before Firestore confirms
    setRequests((prev) =>
      prev.map((r) => (r.id === req.id ? { ...r, status: "accepted" } : r))
    );
    try {
      await acceptServiceRequest(req.id);
    } catch {
      // Revert on failure
      setRequests((prev) =>
        prev.map((r) => (r.id === req.id ? { ...r, status: "pending" } : r))
      );
      Alert.alert("خطأ", "تعذّر قبول الطلب");
    }
  };

  const handleReject = (req: ServiceRequest) => {
    Alert.alert("رفض الطلب", "هل أنت متأكد من رفض هذا الطلب؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "رفض",
        style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          // Optimistic update: reflect the new status instantly, before Firestore confirms
          setRequests((prev) =>
            prev.map((r) => (r.id === req.id ? { ...r, status: "rejected" } : r))
          );
          try {
            await rejectServiceRequest(req.id);
          } catch {
            setRequests((prev) =>
              prev.map((r) => (r.id === req.id ? { ...r, status: "pending" } : r))
            );
            Alert.alert("خطأ", "تعذّر رفض الطلب");
          }
        },
      },
    ]);
  };

  const handleOpen = (req: ServiceRequest) => {
    router.push({ pathname: "/active-order", params: { requestId: req.id } });
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={22} color="#FFF" />
        </Pressable>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={styles.title}>طلبات واردة</Text>
          <Text style={styles.sub}>
            {isArtisan ? "طلبات الخدمات والمنتجات" : "تتبّع طلباتك"}
          </Text>
        </View>
        <View style={styles.iconBadge}>
          <Ionicons name="calendar" size={20} color={C.accent} />
        </View>
      </LinearGradient>

      <View style={styles.tabsRow}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => {
          const active = tab === t;
          const count = counts[t];
          return (
            <Pressable
              key={t}
              style={[styles.tab, active && styles.tabActive]}
              disabled={selectionMode}
              onPress={() => {
                Haptics.selectionAsync();
                setTab(t);
              }}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {TAB_LABELS[t]} {count > 0 ? `(${count})` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === "history" && selectionMode ? (
        <View style={styles.selectionBar}>
          <Pressable
            style={[styles.selectionTrashBtn, (deleting || selectedIds.size === 0) && { opacity: 0.5 }]}
            onPress={handleDeleteSelected}
            disabled={deleting || selectedIds.size === 0}
          >
            <Feather name="trash-2" size={18} color="#FFF" />
          </Pressable>
          <Pressable style={styles.selectAllBtn} onPress={handleSelectAll}>
            <Text style={styles.selectAllText}>
              {selectedIds.size === filtered.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
            </Text>
          </Pressable>
          <Text style={styles.selectionCount}>تم تحديد {selectedIds.size} طلب</Text>
          <Pressable style={styles.selectionCancelBtn} onPress={handleCancelSelection} hitSlop={8}>
            <Feather name="x" size={20} color={C.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {tab !== "products" ? (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <RequestCard
              request={item}
              isArtisan={isArtisan}
              onAccept={() => handleAccept(item)}
              onReject={() => handleReject(item)}
              onOpen={() => handleOpen(item)}
              selectionMode={tab === "history" && selectionMode}
              selected={selectedIds.has(item.id)}
              onToggleSelect={() => toggleSelect(item.id)}
              onLongPress={tab === "history" ? () => enterSelectionMode(item.id) : undefined}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPad + 20 },
            filtered.length === 0 && { flex: 1 },
          ]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="calendar-outline" size={42} color={C.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>
                {loading ? "جارٍ التحميل..." : "لا توجد طلبات في هذا القسم"}
              </Text>
              {!loading && (
                <Text style={styles.emptySub}>
                  {isArtisan
                    ? "ستظهر طلبات العملاء هنا فور وصولها"
                    : "ابحث عن صاحب اختصاص وأرسل طلب خدمتك من صفحته الشخصية"}
                </Text>
              )}
            </View>
          }
        />
      ) : (
        /* ── تبويب طلبات المنتجات ── */
        <FlatList
          data={[...pendingProductOrders, ...otherProductOrders]}
          keyExtractor={(o) => o.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPad + 20 },
            productOrders.length === 0 && { flex: 1 },
          ]}
          ListHeaderComponent={
            pendingProductOrders.length > 0 ? (
              <View style={styles.productOrdersHeader}>
                <View style={styles.pendingDot} />
                <Text style={styles.productOrdersHeaderText}>
                  بانتظار ردك ({pendingProductOrders.length})
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item: order }) => {
            const cfg =
              order.status === "pending"
                ? { label: "بانتظار ردك", color: "#F59E0B", bg: "rgba(245,158,11,0.1)" }
                : order.status === "accepted"
                ? { label: "تم القبول", color: "#22C55E", bg: "rgba(34,197,94,0.1)" }
                : { label: "مرفوض", color: "#EF4444", bg: "rgba(239,68,68,0.1)" };
            const date = new Date(order.createdAt).toLocaleDateString("ar-IQ", {
              day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
            });
            return (
              <Animated.View entering={FadeInDown.springify()} style={styles.card}>
                {/* ── Header: product title (right) ↔ buyer name (left, tappable) ── */}
                <View style={styles.productOrderHeaderRow}>
                  {/* Left: buyer name → profile */}
                  <TouchableOpacity
                    style={styles.buyerNameBtn}
                    activeOpacity={0.75}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push({
                        pathname: "/user-profile",
                        params: { userId: order.buyerId, userName: order.buyerName },
                      } as any);
                    }}
                  >
                    <Feather name="user" size={15} color={C.accent} />
                    <Text style={styles.buyerNameText} numberOfLines={1}>{order.buyerName}</Text>
                  </TouchableOpacity>
                  {/* Right: product title */}
                  <Text style={styles.productOrderTitle} numberOfLines={2}>{order.productTitle}</Text>
                </View>
                {/* ── Status badge + date ── */}
                <View style={styles.productOrderStatusRow}>
                  <Text style={styles.cardTime}>{date}</Text>
                  <View style={[styles.productOrderStatus, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.productOrderStatusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
                {/* ── Phone ── */}
                {order.buyerPhone ? (
                  <View style={styles.metaRow}>
                    <Feather name="phone" size={13} color={C.textSecondary} />
                    <Text style={styles.metaText}>{order.buyerPhone}</Text>
                  </View>
                ) : null}
                {order.status === "pending" && (
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.actionBtn, styles.rejectBtn]}
                      onPress={() =>
                        Alert.alert("رفض الطلب", "هل تريد رفض هذا الطلب؟", [
                          { text: "إلغاء", style: "cancel" },
                          {
                            text: "رفض", style: "destructive",
                            onPress: () => respondToProductOrder(order.id, order.productId, order.productTitle, order.buyerId, "rejected"),
                          },
                        ])
                      }
                    >
                      <Feather name="x" size={16} color="#FFF" />
                      <Text style={styles.actionBtnText}>رفض</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.acceptBtn]}
                      onPress={() =>
                        Alert.alert("قبول الطلب", "هل تريد قبول هذا الطلب؟", [
                          { text: "إلغاء", style: "cancel" },
                          {
                            text: "قبول",
                            onPress: () => respondToProductOrder(order.id, order.productId, order.productTitle, order.buyerId, "accepted"),
                          },
                        ])
                      }
                    >
                      <Feather name="check" size={16} color="#FFF" />
                      <Text style={styles.actionBtnText}>قبول</Text>
                    </Pressable>
                  </View>
                )}
              </Animated.View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Feather name="inbox" size={42} color={C.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>لا توجد طلبات منتجات</Text>
              <Text style={styles.emptySub}>ستظهر هنا طلبات شراء منتجاتك فور وصولها</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 16, gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 18, fontFamily: "Cairo_700Bold", color: "#FFF", textAlign: "right" },
  sub: { fontSize: 12, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.6)" },
  iconBadge: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(201,168,76,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  tabsRow: {
    flexDirection: "row", gap: 8, padding: 12,
    backgroundColor: C.background,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  selectionBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  selectionCount: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
    color: C.text,
    textAlign: "right",
  },
  selectAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.inputBg,
  },
  selectAllText: {
    fontSize: 12,
    fontFamily: "Cairo_600SemiBold",
    color: C.accent,
  },
  selectionTrashBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#EF4444",
    alignItems: "center", justifyContent: "center",
  },
  selectionCancelBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
  },
  tab: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingVertical: 9, borderRadius: 10,
    backgroundColor: C.card,
  },
  tabActive: { backgroundColor: C.primary },
  tabText: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  tabTextActive: { color: "#FFF" },
  listContent: { padding: 14, gap: 12 },
  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 14, gap: 10,
    borderWidth: 1, borderColor: C.border,
  },
  cardSelected: {
    borderColor: C.accent,
    backgroundColor: "rgba(201,168,76,0.08)",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkboxWrap: { padding: 2 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 2, borderColor: C.textMuted,
    alignItems: "center", justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: C.accent, borderColor: C.accent,
  },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontFamily: "Cairo_600SemiBold" },
  cardTime: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  peerName: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right", flex: 1 },
  specialtyTag: {
    fontSize: 11, fontFamily: "Cairo_600SemiBold", color: C.accent,
    backgroundColor: "rgba(201,168,76,0.12)", borderRadius: 10,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  problem: {
    fontSize: 13, fontFamily: "Cairo_400Regular", color: C.text,
    textAlign: "right", lineHeight: 21,
    backgroundColor: C.inputBg, borderRadius: 10, padding: 10,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "flex-end" },
  metaText: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "right" },
  mapBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "rgba(201,168,76,0.12)", borderRadius: 10, paddingVertical: 9,
  },
  mapBtnText: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.accent },
  trackBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#22C55E", borderRadius: 10, paddingVertical: 10,
  },
  trackText: { fontSize: 13, fontFamily: "Cairo_700Bold", color: "#FFF" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 11, borderRadius: 12,
  },
  acceptBtn: { backgroundColor: "#22C55E" },
  rejectBtn: { backgroundColor: "#EF4444" },
  actionBtnText: { fontSize: 14, fontFamily: "Cairo_700Bold", color: "#FFF" },
  bottomRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  smallBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 9, borderRadius: 10,
    backgroundColor: C.inputBg,
  },
  smallBtnPrimary: { backgroundColor: C.primary },
  smallBtnText: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.primary },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 30 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.card, alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "center" },
  emptySub: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "center", lineHeight: 22 },
  productOrdersHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginBottom: 8, justifyContent: "flex-end",
  },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#F59E0B" },
  productOrdersHeaderText: { fontSize: 13, fontFamily: "Cairo_700Bold", color: C.text },
  // Header row: buyer name (left) ↔ product title (right)
  productOrderHeaderRow: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "flex-start", gap: 10,
  },
  buyerNameBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    flexShrink: 0, maxWidth: "42%",
  },
  buyerNameText: {
    fontSize: 18, fontFamily: "Cairo_700Bold",
    color: C.accent, flexShrink: 1,
  },
  productOrderTitle: {
    flex: 1, fontSize: 18, fontFamily: "Cairo_700Bold",
    color: C.text, textAlign: "right",
  },
  // Status row: date (left) ↔ badge (right)
  productOrderStatusRow: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center",
  },
  productOrderStatus: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  productOrderStatusText: { fontSize: 11, fontFamily: "Cairo_600SemiBold" },
});
