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
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeInDown,
} from "react-native-reanimated";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";

const C = Colors.light;

type RequestType = "deposit" | "withdrawal";
type RequestStatus = "pending" | "approved" | "rejected";

interface Request {
  id: string;
  userId: string;
  type: RequestType;
  amount: number;
  status: RequestStatus;
  createdAt: string;
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>
        {icon}
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RequestCard({
  item,
  onApprove,
  onReject,
}: {
  item: Request;
  onApprove: () => void;
  onReject: () => void;
}) {
  const approveScale = useSharedValue(1);
  const rejectScale = useSharedValue(1);

  const approveStyle = useAnimatedStyle(() => ({
    transform: [{ scale: approveScale.value }],
  }));
  const rejectStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rejectScale.value }],
  }));

  const date = new Date(item.createdAt);
  const formattedDate = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  const typeLabel = item.type === "deposit" ? "إيداع" : "سحب";
  const typeColor = item.type === "deposit" ? C.success : "#E53935";
  const typeIcon = item.type === "deposit" ? "trending-up" : "trending-down";

  const statusConfig = {
    pending: { label: "قيد الانتظار", color: "#F59E0B", bg: "#FEF3C7" },
    approved: { label: "تمت الموافقة", color: C.success, bg: C.successLight },
    rejected: { label: "مرفوض", color: C.danger, bg: C.dangerLight },
  };

  const st = statusConfig[item.status];

  return (
    <View style={styles.requestCard}>
      <View style={styles.requestTop}>
        <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
          <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
        </View>

        <View style={styles.requestInfo}>
          <View style={styles.requestTypeRow}>
            <Text style={[styles.amountText, { color: typeColor }]}>
              {item.amount.toLocaleString("ar-IQ")} د.ع
            </Text>
            <View style={[styles.typeChip, { backgroundColor: typeColor + "18" }]}>
              <Feather name={typeIcon} size={14} color={typeColor} />
              <Text style={[styles.typeText, { color: typeColor }]}>{typeLabel}</Text>
            </View>
          </View>
          <Text style={styles.userText}>{item.userId}</Text>
          <Text style={styles.dateText}>{formattedDate}</Text>
        </View>
      </View>

      {item.status === "pending" && (
        <View style={styles.actionRow}>
          <Animated.View style={[{ flex: 1 }, rejectStyle]}>
            <Pressable
              style={styles.rejectBtn}
              onPress={() => {
                rejectScale.value = withSpring(0.95, {}, () => {
                  rejectScale.value = withSpring(1);
                });
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
                approveScale.value = withSpring(0.95, {}, () => {
                  approveScale.value = withSpring(1);
                });
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
    </View>
  );
}

type FilterTab = "all" | "pending" | "approved" | "rejected";

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState<Request[]>([]);
  const [users, setUsers] = useState<{ contact: string }[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>("pending");
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [storedRequests, storedUsers] = await Promise.all([
        AsyncStorage.getItem("@requests"),
        AsyncStorage.getItem("@users"),
      ]);
      const parsedRequests: Request[] = storedRequests
        ? JSON.parse(storedRequests)
        : [];
      const parsedUsers = storedUsers ? JSON.parse(storedUsers) : [];
      setRequests(parsedRequests.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
      setUsers(parsedUsers);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const updateRequestStatus = async (id: string, status: "approved" | "rejected") => {
    try {
      const updated = requests.map((r) =>
        r.id === id ? { ...r, status } : r
      );
      await AsyncStorage.setItem("@requests", JSON.stringify(updated));
      setRequests(updated);
    } catch {
      Alert.alert("خطأ", "حدث خطأ أثناء تحديث الطلب");
    }
  };

  const handleLogout = () => {
    Alert.alert("تسجيل الخروج", "هل تريد الخروج من لوحة التحكم؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "خروج", style: "destructive", onPress: () => router.replace("/") },
    ]);
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const rejectedCount = requests.filter((r) => r.status === "rejected").length;

  const filteredRequests =
    activeTab === "all"
      ? requests
      : requests.filter((r) => r.status === activeTab);

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "pending", label: "قيد الانتظار", count: pendingCount },
    { key: "approved", label: "موافق عليه", count: approvedCount },
    { key: "rejected", label: "مرفوض", count: rejectedCount },
    { key: "all", label: "الكل", count: requests.length },
  ];

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#1A0D3E", "#0D1B3E"]} style={styles.header}>
        <View style={[styles.headerContent, { paddingTop: topPad + 10 }]}>
          <Pressable onPress={handleLogout} style={styles.logoutBtn}>
            <Feather name="log-out" size={20} color="rgba(255,255,255,0.7)" />
          </Pressable>
          <View style={styles.headerTextGroup}>
            <Text style={styles.headerTitle}>لوحة تحكم المشرف</Text>
            <Text style={styles.headerSub}>مندوبك السريع</Text>
          </View>
          <View style={styles.adminBadge}>
            <Ionicons name="shield-checkmark" size={22} color="#8B5CF6" />
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard
            label="مرفوض"
            value={rejectedCount}
            icon={<Feather name="x-circle" size={18} color={C.danger} />}
            color={C.danger}
          />
          <StatCard
            label="موافق"
            value={approvedCount}
            icon={<Feather name="check-circle" size={18} color={C.success} />}
            color={C.success}
          />
          <StatCard
            label="انتظار"
            value={pendingCount}
            icon={<Feather name="clock" size={18} color="#F59E0B" />}
            color="#F59E0B"
          />
          <StatCard
            label="مستخدمون"
            value={users.length}
            icon={<Feather name="users" size={18} color="#8B5CF6" />}
            color="#8B5CF6"
          />
        </View>
      </LinearGradient>

      <View style={styles.tabsRow}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => {
              setActiveTab(tab.key);
              Haptics.selectionAsync();
            }}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View
                style={[
                  styles.tabBadge,
                  activeTab === tab.key && styles.tabBadgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.tabBadgeText,
                    activeTab === tab.key && styles.tabBadgeTextActive,
                  ]}
                >
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
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: bottomPad + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.accent}
          />
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
            <RequestCard
              item={item}
              onApprove={() => updateRequestStatus(item.id, "approved")}
              onReject={() => updateRequestStatus(item.id, "rejected")}
            />
          </Animated.View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="clipboard-check-outline"
              size={56}
              color={C.border}
            />
            <Text style={styles.emptyTitle}>لا توجد طلبات</Text>
            <Text style={styles.emptyText}>
              {activeTab === "pending"
                ? "لا توجد طلبات معلقة حالياً"
                : "لا توجد طلبات في هذه الفئة"}
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextGroup: { flex: 1, alignItems: "flex-end" },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
    textAlign: "right",
  },
  headerSub: {
    fontSize: 11,
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.5)",
    textAlign: "right",
  },
  adminBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(139,92,246,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 6,
    borderTopWidth: 2,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 20,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
  },
  statLabel: {
    fontSize: 10,
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
  },
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
    backgroundColor: C.inputBg,
  },
  tabActive: {
    backgroundColor: C.primary,
  },
  tabText: {
    fontSize: 11,
    fontFamily: "Cairo_600SemiBold",
    color: C.textSecondary,
    textAlign: "center",
  },
  tabTextActive: { color: "#FFF" },
  tabBadge: {
    backgroundColor: C.border,
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeActive: { backgroundColor: C.accent },
  tabBadgeText: {
    fontSize: 10,
    fontFamily: "Cairo_700Bold",
    color: C.textSecondary,
  },
  tabBadgeTextActive: { color: C.primary },
  listContent: { padding: 16, gap: 12 },
  requestCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  requestTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  statusBadge: {
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  statusText: {
    fontSize: 11,
    fontFamily: "Cairo_600SemiBold",
  },
  requestInfo: {
    flex: 1,
    alignItems: "flex-end",
    gap: 4,
  },
  requestTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  amountText: {
    fontSize: 18,
    fontFamily: "Cairo_700Bold",
    textAlign: "right",
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  typeText: {
    fontSize: 12,
    fontFamily: "Cairo_600SemiBold",
  },
  userText: {
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    color: C.textSecondary,
    textAlign: "right",
  },
  dateText: {
    fontSize: 11,
    fontFamily: "Cairo_400Regular",
    color: C.textMuted,
    textAlign: "right",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.success,
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  approveBtnText: {
    fontSize: 14,
    fontFamily: "Cairo_600SemiBold",
    color: "#FFF",
  },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.dangerLight,
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: C.danger + "30",
  },
  rejectBtnText: {
    fontSize: 14,
    fontFamily: "Cairo_600SemiBold",
    color: C.danger,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Cairo_700Bold",
    color: C.text,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Cairo_400Regular",
    color: C.textSecondary,
    textAlign: "center",
  },
});
