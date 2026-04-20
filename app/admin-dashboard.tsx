import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
  Alert,
  RefreshControl,
  Modal,
  Image,
  ScrollView,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, FadeInDown } from "react-native-reanimated";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  getWalletRequests,
  approveWalletRequest,
  rejectWalletRequest,
  getBalance,
  type WalletRequest,
} from "@/lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString("ar-IQ")} د.ع`;
}

function StatCard({
  label, value, icon, color,
}: {
  label: string; value: number; icon: React.ReactNode; color: string;
}) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>{icon}</View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ImageViewerModal({
  uri, visible, onClose,
}: {
  uri: string; visible: boolean; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={imgStyles.overlay} onPress={onClose}>
        <View style={imgStyles.container}>
          <Image source={{ uri }} style={imgStyles.image} resizeMode="contain" />
          <Pressable style={imgStyles.closeBtn} onPress={onClose}>
            <Feather name="x" size={20} color="#FFF" />
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function RequestCard({
  item, onApprove, onReject,
}: {
  item: WalletRequest; onApprove: () => void; onReject: () => void;
}) {
  const approveScale = useSharedValue(1);
  const rejectScale = useSharedValue(1);
  const approveStyle = useAnimatedStyle(() => ({ transform: [{ scale: approveScale.value }] }));
  const rejectStyle = useAnimatedStyle(() => ({ transform: [{ scale: rejectScale.value }] }));

  const [showImage, setShowImage] = useState(false);

  const isDeposit = item.type === "deposit";
  const typeColor = isDeposit ? C.success : "#E53935";
  const typeIcon = isDeposit ? "trending-up" : "trending-down";
  const typeLabel = isDeposit ? "إيداع" : "سحب";

  const statusConfig = {
    pending: { label: "قيد الانتظار", color: "#F59E0B", bg: "#FEF3C7" },
    approved: { label: "تمت الموافقة", color: C.success, bg: C.successLight },
    rejected: { label: "مرفوض", color: C.danger, bg: C.dangerLight },
  };
  const st = statusConfig[item.status];

  const date = new Date(item.createdAt);
  const formattedDate = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} - ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;

  return (
    <View style={styles.requestCard}>
      <View style={styles.cardTop}>
        <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
          <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
        </View>
        <View style={styles.requestInfo}>
          <View style={styles.typeRow}>
            <View style={[styles.typeChip, { backgroundColor: typeColor + "18" }]}>
              <Feather name={typeIcon as any} size={13} color={typeColor} />
              <Text style={[styles.typeText, { color: typeColor }]}>{typeLabel}</Text>
            </View>
            <Text style={[styles.amountText, { color: typeColor }]}>
              {formatCurrency(item.amount)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Feather name="user" size={12} color={C.textMuted} />
            <Text style={styles.detailText}>{item.userId}</Text>
          </View>
          <View style={styles.detailRow}>
            <Feather name="smartphone" size={12} color={C.textMuted} />
            <Text style={styles.detailText}>{item.accountNumber}</Text>
          </View>
          <View style={styles.detailRow}>
            <Feather name="clock" size={12} color={C.textMuted} />
            <Text style={styles.detailText}>{formattedDate}</Text>
          </View>
        </View>
      </View>

      {isDeposit && item.imageUri && (
        <Pressable style={styles.viewImageBtn} onPress={() => setShowImage(true)}>
          <Feather name="image" size={14} color={C.primary} />
          <Text style={styles.viewImageText}>عرض صورة التحويل</Text>
        </Pressable>
      )}

      {item.status === "pending" && (
        <View style={styles.actionRow}>
          <Animated.View style={[{ flex: 1 }, rejectStyle]}>
            <Pressable
              style={styles.rejectBtn}
              onPress={() => {
                rejectScale.value = withSpring(0.95, {}, () => { rejectScale.value = withSpring(1); });
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onReject();
              }}
            >
              <Feather name="x" size={16} color={C.danger} />
              <Text style={styles.rejectBtnText}>رفض</Text>
            </Pressable>
          </Animated.View>
          <Animated.View style={[{ flex: 1 }, approveStyle]}>
            <Pressable
              style={styles.approveBtn}
              onPress={() => {
                approveScale.value = withSpring(0.95, {}, () => { approveScale.value = withSpring(1); });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                onApprove();
              }}
            >
              <Feather name="check" size={16} color="#FFF" />
              <Text style={styles.approveBtnText}>موافقة</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}

      {item.imageUri && (
        <ImageViewerModal uri={item.imageUri} visible={showImage} onClose={() => setShowImage(false)} />
      )}
    </View>
  );
}

type FilterTab = "pending" | "approved" | "rejected" | "all";

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState<WalletRequest[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>("pending");
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const reqs = await getWalletRequests();
      setRequests(reqs);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const handleApprove = async (item: WalletRequest) => {
    try {
      if (item.type === "withdrawal") {
        const currentBal = await getBalance(item.userId);
        if (currentBal < item.amount) {
          Alert.alert(
            "رصيد غير كافٍ",
            `رصيد المستخدم ${formatCurrency(currentBal)} لا يكفي لسحب ${formatCurrency(item.amount)}. يرجى الرفض.`
          );
          return;
        }
      }
      await approveWalletRequest(item.id, item.userId, item.amount, item.type);
      const newBal = await getBalance(item.userId);
      const updated = requests.map((r) =>
        r.id === item.id ? { ...r, status: "approved" as const } : r
      );
      setRequests(updated);
      Alert.alert(
        "تمت الموافقة",
        `${item.type === "deposit" ? "تم إضافة" : "تم خصم"} ${formatCurrency(item.amount)} ${item.type === "deposit" ? "إلى" : "من"} محفظة المستخدم.\nالرصيد الجديد: ${formatCurrency(newBal)}`
      );
    } catch {
      Alert.alert("خطأ", "حدث خطأ أثناء الموافقة على الطلب");
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectWalletRequest(id);
      const updated = requests.map((r) =>
        r.id === id ? { ...r, status: "rejected" as const } : r
      );
      setRequests(updated);
    } catch {
      Alert.alert("خطأ", "حدث خطأ أثناء رفض الطلب");
    }
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const rejectedCount = requests.filter((r) => r.status === "rejected").length;

  const filteredRequests =
    activeTab === "all" ? requests : requests.filter((r) => r.status === activeTab);

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "pending", label: "معلقة", count: pendingCount },
    { key: "approved", label: "موافق", count: approvedCount },
    { key: "rejected", label: "مرفوض", count: rejectedCount },
    { key: "all", label: "الكل", count: requests.length },
  ];

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#1A0D3E", "#0D1B3E"]} style={styles.header}>
        <View style={[styles.headerContent, { paddingTop: topPad + 10 }]}>
          <Pressable
            onPress={() => Alert.alert("تسجيل الخروج", "هل تريد الخروج من لوحة التحكم؟", [
              { text: "إلغاء", style: "cancel" },
              { text: "خروج", style: "destructive", onPress: () => router.replace("/") },
            ])}
            style={styles.logoutBtn}
          >
            <Feather name="log-out" size={20} color="rgba(255,255,255,0.7)" />
          </Pressable>
          <View style={styles.headerTextGroup}>
            <Text style={styles.headerTitle}>لوحة تحكم المشرف</Text>
            <Text style={styles.headerSub}>سند</Text>
          </View>
          <View style={styles.adminBadge}>
            <Ionicons name="shield-checkmark" size={22} color="#8B5CF6" />
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard label="مرفوض" value={rejectedCount}
            icon={<Feather name="x-circle" size={18} color={C.danger} />} color={C.danger} />
          <StatCard label="موافق" value={approvedCount}
            icon={<Feather name="check-circle" size={18} color={C.success} />} color={C.success} />
          <StatCard label="معلق" value={pendingCount}
            icon={<Feather name="clock" size={18} color="#F59E0B" />} color="#F59E0B" />
          <StatCard label="مستخدمون" value={new Set(requests.map(r => r.userId)).size}
            icon={<Feather name="users" size={18} color="#8B5CF6" />} color="#8B5CF6" />
        </View>
      </LinearGradient>

      <View style={styles.tabsRow}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => { setActiveTab(tab.key); Haptics.selectionAsync(); }}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[styles.tabBadge, activeTab === tab.key && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === tab.key && styles.tabBadgeTextActive]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filteredRequests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
            <RequestCard
              item={item}
              onApprove={() => handleApprove(item)}
              onReject={() => handleReject(item.id)}
            />
          </Animated.View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="clipboard-check-outline" size={56} color={C.border} />
            <Text style={styles.emptyTitle}>لا توجد طلبات</Text>
            <Text style={styles.emptyText}>
              {activeTab === "pending" ? "لا توجد طلبات معلقة حالياً" : "لا توجد طلبات في هذه الفئة"}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: { paddingBottom: 20 },
  headerContent: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 16, gap: 12,
  },
  logoutBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  headerTextGroup: { flex: 1, alignItems: "flex-end" },
  headerTitle: { fontSize: 18, fontFamily: "Cairo_700Bold", color: "#FFF", textAlign: "right" },
  headerSub: { fontSize: 11, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.5)", textAlign: "right" },
  adminBadge: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "rgba(139,92,246,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10 },
  statCard: {
    flex: 1, backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 14, padding: 12, alignItems: "center", gap: 6, borderTopWidth: 2,
  },
  statIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  statValue: { fontSize: 20, fontFamily: "Cairo_700Bold", color: "#FFF" },
  statLabel: { fontSize: 10, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.6)", textAlign: "center" },
  tabsRow: {
    flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, gap: 8,
    backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 8, borderRadius: 10, gap: 4, backgroundColor: C.inputBg,
  },
  tabActive: { backgroundColor: C.primary },
  tabText: { fontSize: 11, fontFamily: "Cairo_600SemiBold", color: C.textSecondary, textAlign: "center" },
  tabTextActive: { color: "#FFF" },
  tabBadge: {
    backgroundColor: C.border, borderRadius: 8,
    minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  tabBadgeActive: { backgroundColor: C.accent },
  tabBadgeText: { fontSize: 10, fontFamily: "Cairo_700Bold", color: C.textSecondary },
  tabBadgeTextActive: { color: C.primary },
  listContent: { padding: 16, gap: 12 },
  requestCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 16,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
    gap: 12,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  statusBadge: {
    borderRadius: 8, paddingVertical: 5, paddingHorizontal: 9, alignSelf: "flex-start",
  },
  statusText: { fontSize: 11, fontFamily: "Cairo_600SemiBold" },
  requestInfo: { flex: 1, alignItems: "flex-end", gap: 6 },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  typeChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8,
  },
  typeText: { fontSize: 12, fontFamily: "Cairo_600SemiBold" },
  amountText: { fontSize: 18, fontFamily: "Cairo_700Bold", textAlign: "right" },
  detailRow: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end",
  },
  detailText: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "right" },
  viewImageBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 10, paddingVertical: 10,
    backgroundColor: C.primary + "12",
    borderWidth: 1, borderColor: C.primary + "25",
  },
  viewImageText: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.primary },
  actionRow: {
    flexDirection: "row", gap: 10,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border,
  },
  approveBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: C.success, borderRadius: 10, paddingVertical: 11, gap: 6,
  },
  approveBtnText: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: "#FFF" },
  rejectBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: C.dangerLight, borderRadius: 10, paddingVertical: 11, gap: 6,
    borderWidth: 1, borderColor: C.danger + "30",
  },
  rejectBtnText: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.danger },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "center" },
  emptyText: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "center" },
});

const imgStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center", justifyContent: "center",
  },
  container: { width: "100%", height: "80%", position: "relative" },
  image: { width: "100%", height: "100%" },
  closeBtn: {
    position: "absolute", top: 16, right: 16,
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
});
