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
  ACTIVE_STATUSES,
  STATUS_LABELS,
  getSpecialtyLabel,
  type ServiceRequest,
  type ServiceRequestStatus,
} from "../lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

type Tab = "pending" | "active" | "history";

const TAB_LABELS: Record<Tab, string> = {
  pending: "الجديدة",
  active: "النشطة",
  history: "السجل",
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
}: {
  request: ServiceRequest;
  isArtisan: boolean;
  onAccept: () => void;
  onReject: () => void;
  onOpen: () => void;
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
    <Animated.View entering={FadeInDown.springify()} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.statusPill, { backgroundColor: statusColor(request.status) + "22" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor(request.status) }]} />
          <Text style={[styles.statusText, { color: statusColor(request.status) }]}>
            {STATUS_LABELS[request.status]}
          </Text>
        </View>
        <Text style={styles.cardTime}>{formatTime(request.createdAt)}</Text>
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.specialtyTag}>{getSpecialtyLabel(request.specialty)}</Text>
        <Text style={styles.peerName}>
          {isArtisan ? request.clientName : request.artisanName}
        </Text>
      </View>

      <Text style={styles.problem}>{request.problemDescription}</Text>

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
          <Text style={styles.trackText}>تتبّع الحرفي مباشرة</Text>
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

      {!isPending ? (
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
  );
}

export default function ReservationsScreen() {
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [tab, setTab] = useState<Tab>("pending");
  const [isArtisan, setIsArtisan] = useState(false);
  const [loading, setLoading] = useState(true);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/login");
      return;
    }
    let unsub: (() => void) | null = null;
    (async () => {
      const profile = await getUserProfile(user.uid);
      const artisanRecord = await getArtisanByUserId(user.uid);
      const asArtisan = profile?.role === "artisan" && !!artisanRecord;
      setIsArtisan(asArtisan);

      if (asArtisan && artisanRecord) {
        unsub = subscribeToServiceRequests(artisanRecord.id, (list) => {
          setRequests(list);
          setLoading(false);
        });
      } else {
        unsub = subscribeToClientServiceRequests(user.uid, (list) => {
          setRequests(list);
          setLoading(false);
        });
      }
    })();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const filtered = useMemo(() => {
    if (tab === "pending") return requests.filter((r) => r.status === "pending");
    if (tab === "active") return requests.filter((r) => ACTIVE_STATUSES.includes(r.status));
    return requests.filter((r) =>
      ["completed", "cancelled", "rejected"].includes(r.status)
    );
  }, [requests, tab]);

  const counts = useMemo(
    () => ({
      pending: requests.filter((r) => r.status === "pending").length,
      active: requests.filter((r) => ACTIVE_STATUSES.includes(r.status)).length,
      history: requests.filter((r) =>
        ["completed", "cancelled", "rejected"].includes(r.status)
      ).length,
    }),
    [requests]
  );

  const handleAccept = async (req: ServiceRequest) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await acceptServiceRequest(req.id);
    } catch {
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
          try {
            await rejectServiceRequest(req.id);
          } catch {
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
          <Text style={styles.title}>{isArtisan ? "الحجوزات" : "طلباتي"}</Text>
          <Text style={styles.sub}>
            {isArtisan ? "إدارة طلبات العملاء" : "تتبّع طلبات الخدمة"}
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
                  : "ابحث عن حرفي وأرسل طلب خدمتك من صفحته الشخصية"}
              </Text>
            )}
          </View>
        }
      />
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
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
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
});
