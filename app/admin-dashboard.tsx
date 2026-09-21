import React, { useState, useCallback, useEffect } from "react";
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
  ActivityIndicator,
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
import { ADMIN_UID } from "@/lib/db_logic";
import { auth } from "@/lib/firebase";
import {
  banReportedContentOwners,
  deleteReportedContent,
  getAdminReports,
  removeAdminReport,
  type AdminReport,
} from "@/lib/admin_reporting";
import Colors from "@/constants/colors";

const C = Colors.light;

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString("ar-IQ-u-nu-latn")} د.ع`;
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

function formatReportDate(value: unknown): string {
  let date: Date;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    date = value.toDate();
  } else {
    date = new Date(String(value ?? ""));
  }
  if (Number.isNaN(date.getTime())) return "وقت غير معروف";
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} - ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function reportMessageLabel(message: {
  text: string;
  type?: string;
  deleted?: boolean;
}): string {
  if (message.deleted) return "تم حذف هذه الرسالة";
  if (message.text) return message.text;
  if (message.type === "image") return "صورة";
  if (message.type === "video") return "فيديو";
  if (message.type === "audio") return "رسالة صوتية";
  if (message.type === "location") return "موقع";
  return "رسالة بدون نص";
}

const reportTargetLabels: Record<AdminReport["targetType"], string> = {
  product: "منتج",
  post: "منشور",
  story: "استوري",
  chat: "محادثة",
};

function ReportPreview({ item }: { item: AdminReport }) {
  const preview = item.preview;
  if (!preview) return null;

  return (
    <View style={styles.reportPreview}>
      <View style={styles.reportPreviewHeader}>
        <Feather name="eye" size={14} color={C.primary} />
        <Text style={styles.reportPreviewTitle}>معاينة المحتوى</Text>
      </View>

      {preview.imageUrl && (
        <Image
          source={{ uri: preview.imageUrl }}
          style={styles.reportPreviewImage}
          resizeMode="cover"
        />
      )}

      {!!preview.title && (
        <Text style={styles.reportPreviewContentTitle} numberOfLines={2}>
          {preview.title}
        </Text>
      )}
      {!!preview.text && (
        <Text style={styles.reportPreviewText} numberOfLines={6}>
          {preview.text}
        </Text>
      )}

      {!!preview.messages?.length && (
        <View style={styles.reportMessages}>
          {preview.messages.map((message) => (
            <View key={message.id} style={styles.reportMessage}>
              <View style={styles.reportMessageMeta}>
                <Text style={styles.reportMessageDate}>{formatReportDate(message.createdAt)}</Text>
                <Text style={styles.reportMessageSender} numberOfLines={1}>
                  {message.senderName}
                </Text>
              </View>
              <Text style={styles.reportMessageText} numberOfLines={4}>
                {reportMessageLabel(message)}
              </Text>
              {!!message.mediaUrl && (message.type === "image" || message.type === "video") && (
                <Image
                  source={{ uri: message.mediaUrl }}
                  style={styles.reportMessageImage}
                  resizeMode="cover"
                />
              )}
            </View>
          ))}
        </View>
      )}

      {!preview.imageUrl && !preview.title && !preview.text && !preview.messages?.length && (
        <Text style={styles.reportPreviewEmpty}>تعذر العثور على تفاصيل إضافية لهذا المحتوى</Text>
      )}
    </View>
  );
}

function ReportCard({
  item,
  action,
  deleted,
  banned,
  onDeleteContent,
  onBanUser,
  onRemove,
}: {
  item: AdminReport;
  action: "delete" | "ban" | "remove" | null;
  deleted: boolean;
  banned: boolean;
  onDeleteContent: () => void;
  onBanUser: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.reportCard}>
      <View style={styles.reportHeader}>
        <View style={styles.reportStatusBadge}>
          <Text style={styles.reportStatusText}>{item.status === "open" ? "مفتوح" : item.status}</Text>
        </View>
        <View style={styles.reportTitleWrap}>
          <Text style={styles.reportTitle}>{item.reasonLabel || "بلاغ محتوى"}</Text>
          <Text style={styles.reportTargetType}>{reportTargetLabels[item.targetType]}</Text>
        </View>
        <View style={styles.reportIcon}>
          <Feather name="flag" size={18} color={C.danger} />
        </View>
      </View>

      <View style={styles.reportDetails}>
        <View style={styles.reportDetailRow}>
          <Text style={styles.reportDetailValue}>{item.reporterName || "مستخدم"}</Text>
          <Text style={styles.reportDetailLabel}>المُبلّغ</Text>
        </View>
        <View style={styles.reportDetailRow}>
          <Text style={styles.reportDetailValue} numberOfLines={1}>{item.reporterId || "غير متوفر"}</Text>
          <Text style={styles.reportDetailLabel}>معرّف المُبلّغ</Text>
        </View>
        <View style={styles.reportDetailRow}>
          <Text style={styles.reportDetailValue}>{item.targetName || item.targetId}</Text>
          <Text style={styles.reportDetailLabel}>المحتوى</Text>
        </View>
        <View style={styles.reportDetailRow}>
          <Text style={styles.reportDetailValue} numberOfLines={1}>{item.targetId}</Text>
          <Text style={styles.reportDetailLabel}>معرّف المحتوى</Text>
        </View>
        <View style={styles.reportDetailRow}>
          <Text style={styles.reportDetailValue}>
            {item.targetOwnerIds.length > 0 ? item.targetOwnerIds.join("، ") : "تعذر تحديد المالك"}
          </Text>
          <Text style={styles.reportDetailLabel}>صاحب المحتوى</Text>
        </View>
        <View style={styles.reportDetailRow}>
          <Text style={styles.reportDetailValue}>{formatReportDate(item.createdAt)}</Text>
          <Text style={styles.reportDetailLabel}>تاريخ البلاغ</Text>
        </View>
      </View>

      <ReportPreview item={item} />

      {!item.targetExists && !deleted && (
        <View style={styles.reportNotice}>
          <Feather name="info" size={14} color="#B45309" />
          <Text style={styles.reportNoticeText}>المحتوى غير موجود حالياً</Text>
        </View>
      )}
      {deleted && (
        <View style={[styles.reportNotice, styles.reportNoticeSuccess]}>
          <Feather name="check-circle" size={14} color={C.success} />
          <Text style={[styles.reportNoticeText, { color: C.success }]}>تم حذف المحتوى</Text>
        </View>
      )}
      {banned && (
        <View style={[styles.reportNotice, styles.reportNoticeDanger]}>
          <Feather name="slash" size={14} color={C.danger} />
          <Text style={[styles.reportNoticeText, { color: C.danger }]}>تم حظر صاحب المحتوى</Text>
        </View>
      )}

      <View style={styles.reportActions}>
        <Pressable
          style={[styles.reportActionBtn, styles.reportRemoveBtn]}
          onPress={onRemove}
          disabled={action !== null}
        >
          {action === "remove" ? (
            <ActivityIndicator size="small" color={C.textSecondary} />
          ) : (
            <Feather name="archive" size={15} color={C.textSecondary} />
          )}
          <Text style={styles.reportRemoveText}>إزالة البلاغ</Text>
        </Pressable>
        <Pressable
          style={[styles.reportActionBtn, styles.reportBanBtn, (banned || item.targetOwnerIds.length === 0) && styles.actionDisabled]}
          onPress={onBanUser}
          disabled={action !== null || banned || item.targetOwnerIds.length === 0}
        >
          {action === "ban" ? (
            <ActivityIndicator size="small" color={C.danger} />
          ) : (
            <Feather name="slash" size={15} color={C.danger} />
          )}
          <Text style={styles.reportBanText}>{banned ? "تم الحظر" : "حظر المستخدم"}</Text>
        </Pressable>
        <Pressable
          style={[styles.reportActionBtn, styles.reportDeleteBtn, (!item.targetExists || deleted) && styles.actionDisabled]}
          onPress={onDeleteContent}
          disabled={action !== null || !item.targetExists || deleted}
        >
          {action === "delete" ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Feather name="trash-2" size={15} color="#FFF" />
          )}
          <Text style={styles.reportDeleteText}>{deleted ? "تم الحذف" : "حذف المحتوى"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

type FilterTab = "pending" | "approved" | "rejected" | "all";

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState<WalletRequest[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>("pending");
  const [activeSection, setActiveSection] = useState<"wallet" | "reports">("wallet");
  const [refreshing, setRefreshing] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [reportAction, setReportAction] = useState<{ id: string; type: "delete" | "ban" | "remove" } | null>(null);
  const [reportHandled, setReportHandled] = useState<Record<string, { deleted?: boolean; banned?: boolean }>>({});

  useEffect(() => {
    if (auth.currentUser?.uid === ADMIN_UID) {
      setAuthorized(true);
      return;
    }
    setAuthorized(false);
    Alert.alert("غير مصرح", "هذه الصفحة مخصصة لحساب المسؤول فقط.", [
      { text: "حسناً", onPress: () => router.replace("/dashboard" as any) },
    ]);
  }, []);

  const loadData = useCallback(async () => {
    if (auth.currentUser?.uid !== ADMIN_UID) return;
    try {
      const [reqs, nextReports] = await Promise.all([getWalletRequests(), getAdminReports()]);
      setRequests(reqs);
      setReports(nextReports);
    } catch (error) {
      console.error("load admin data failed:", error);
      Alert.alert("خطأ", "تعذر تحميل بيانات لوحة المشرف.");
    }
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

  const handleDeleteReportedContent = (item: AdminReport) => {
    Alert.alert(
      "حذف المحتوى المخالف",
      `سيتم حذف ${reportTargetLabels[item.targetType]} نهائياً. هل تريد المتابعة؟`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف نهائياً",
          style: "destructive",
          onPress: async () => {
            setReportAction({ id: item.id, type: "delete" });
            try {
              await deleteReportedContent(item);
              setReportHandled((current) => ({ ...current, [item.id]: { ...current[item.id], deleted: true } }));
              setReports((current) =>
                current.map((report) => report.id === item.id ? { ...report, targetExists: false } : report)
              );
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (error) {
              console.error("delete reported content failed:", error);
              Alert.alert("خطأ", "تعذر حذف المحتوى المخالف.");
            } finally {
              setReportAction(null);
            }
          },
        },
      ]
    );
  };

  const handleBanReportedOwner = (item: AdminReport) => {
    if (item.targetOwnerIds.length === 0) {
      Alert.alert("تعذر الحظر", "لم يتم العثور على معرف صاحب المحتوى.");
      return;
    }
    Alert.alert(
      "حظر صاحب المحتوى",
      `سيتم حظر ${item.targetOwnerIds.length > 1 ? "أصحاب المحتوى المحددين" : "صاحب المحتوى"} نهائياً من استخدام التطبيق. هل تريد المتابعة؟`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حظر نهائي",
          style: "destructive",
          onPress: async () => {
            setReportAction({ id: item.id, type: "ban" });
            try {
              await banReportedContentOwners(item);
              setReportHandled((current) => ({ ...current, [item.id]: { ...current[item.id], banned: true } }));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            } catch (error) {
              console.error("ban reported owner failed:", error);
              Alert.alert(
                "خطأ",
                error instanceof Error && error.message === "REPORT_OWNER_NOT_FOUND"
                  ? "تعذر تحديد صاحب المحتوى."
                  : "تعذر حظر صاحب المحتوى."
              );
            } finally {
              setReportAction(null);
            }
          },
        },
      ]
    );
  };

  const handleRemoveReport = (item: AdminReport) => {
    Alert.alert("إزالة البلاغ", "سيتم حذف سجل البلاغ من مجموعة reports. هل تريد المتابعة؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "إزالة",
        style: "destructive",
        onPress: async () => {
          setReportAction({ id: item.id, type: "remove" });
          try {
            await removeAdminReport(item.id);
            setReports((current) => current.filter((report) => report.id !== item.id));
          } catch (error) {
            console.error("remove report failed:", error);
            Alert.alert("خطأ", "تعذر إزالة البلاغ.");
          } finally {
            setReportAction(null);
          }
        },
      },
    ]);
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

  if (authorized !== true) {
    return <View style={styles.root} />;
  }

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
            <Text style={styles.headerSub}>فورس - ForUs</Text>
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

      <View style={styles.sectionTabsRow}>
        <Pressable
          style={[styles.sectionTab, activeSection === "reports" && styles.sectionTabActive]}
          onPress={() => { setActiveSection("reports"); Haptics.selectionAsync(); }}
        >
          <Feather name="flag" size={15} color={activeSection === "reports" ? "#FFF" : C.textSecondary} />
          <Text style={[styles.sectionTabText, activeSection === "reports" && styles.sectionTabTextActive]}>البلاغات</Text>
          {reports.length > 0 && (
            <View style={[styles.tabBadge, activeSection === "reports" && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeSection === "reports" && styles.tabBadgeTextActive]}>{reports.length}</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          style={[styles.sectionTab, activeSection === "wallet" && styles.sectionTabActive]}
          onPress={() => { setActiveSection("wallet"); Haptics.selectionAsync(); }}
        >
          <Feather name="credit-card" size={15} color={activeSection === "wallet" ? "#FFF" : C.textSecondary} />
          <Text style={[styles.sectionTabText, activeSection === "wallet" && styles.sectionTabTextActive]}>طلبات المحفظة</Text>
        </Pressable>
      </View>

      {activeSection === "wallet" ? (
        <>
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
        </>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
          renderItem={({ item, index }) => {
            const handled = reportHandled[item.id] ?? {};
            return (
              <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
                <ReportCard
                  item={item}
                  action={reportAction?.id === item.id ? reportAction.type : null}
                  deleted={!!handled.deleted}
                  banned={!!handled.banned}
                  onDeleteContent={() => handleDeleteReportedContent(item)}
                  onBanUser={() => handleBanReportedOwner(item)}
                  onRemove={() => handleRemoveReport(item)}
                />
              </Animated.View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="flag" size={56} color={C.border} />
              <Text style={styles.emptyTitle}>لا توجد بلاغات</Text>
              <Text style={styles.emptyText}>ستظهر البلاغات الجديدة هنا للمراجعة</Text>
            </View>
          }
        />
      )}
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
  headerTitle: { fontSize: 18, fontFamily: undefined, color: "#FFF", textAlign: "right" },
  headerSub: { fontSize: 11, fontFamily: undefined, color: "rgba(255,255,255,0.5)", textAlign: "right" },
  adminBadge: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "rgba(139,92,246,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10 },
  sectionTabsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sectionTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 42,
    borderRadius: 11,
    backgroundColor: C.inputBg,
  },
  sectionTabActive: { backgroundColor: C.primary },
  sectionTabText: { fontSize: 12, fontFamily: undefined, color: C.textSecondary },
  sectionTabTextActive: { color: "#FFF" },
  statCard: {
    flex: 1, backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 14, padding: 12, alignItems: "center", gap: 6, borderTopWidth: 2,
  },
  statIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  statValue: { fontSize: 20, fontFamily: undefined, color: "#FFF" },
  statLabel: { fontSize: 10, fontFamily: undefined, color: "rgba(255,255,255,0.6)", textAlign: "center" },
  tabsRow: {
    flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, gap: 8,
    backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 8, borderRadius: 10, gap: 4, backgroundColor: C.inputBg,
  },
  tabActive: { backgroundColor: C.primary },
  tabText: { fontSize: 11, fontFamily: undefined, color: C.textSecondary, textAlign: "center" },
  tabTextActive: { color: "#FFF" },
  tabBadge: {
    backgroundColor: C.border, borderRadius: 8,
    minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  tabBadgeActive: { backgroundColor: C.accent },
  tabBadgeText: { fontSize: 10, fontFamily: undefined, color: C.textSecondary },
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
  statusText: { fontSize: 11, fontFamily: undefined },
  requestInfo: { flex: 1, alignItems: "flex-end", gap: 6 },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  typeChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8,
  },
  typeText: { fontSize: 12, fontFamily: undefined },
  amountText: { fontSize: 18, fontFamily: undefined, textAlign: "right" },
  detailRow: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end",
  },
  detailText: { fontSize: 12, fontFamily: undefined, color: C.textSecondary, textAlign: "right" },
  viewImageBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 10, paddingVertical: 10,
    backgroundColor: C.primary + "12",
    borderWidth: 1, borderColor: C.primary + "25",
  },
  viewImageText: { fontSize: 13, fontFamily: undefined, color: C.primary },
  actionRow: {
    flexDirection: "row", gap: 10,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border,
  },
  approveBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: C.success, borderRadius: 10, paddingVertical: 11, gap: 6,
  },
  approveBtnText: { fontSize: 14, fontFamily: undefined, color: "#FFF" },
  rejectBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: C.dangerLight, borderRadius: 10, paddingVertical: 11, gap: 6,
    borderWidth: 1, borderColor: C.danger + "30",
  },
  rejectBtnText: { fontSize: 14, fontFamily: undefined, color: C.danger },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontFamily: undefined, color: C.text, textAlign: "center" },
  emptyText: { fontSize: 13, fontFamily: undefined, color: C.textSecondary, textAlign: "center" },
  reportCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  reportHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  reportIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.dangerLight,
  },
  reportTitleWrap: { flex: 1, alignItems: "flex-end", gap: 2 },
  reportTitle: { fontSize: 15, fontFamily: undefined, color: C.text, textAlign: "right" },
  reportTargetType: { fontSize: 11, fontFamily: undefined, color: C.textMuted, textAlign: "right" },
  reportStatusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "#FEF3C7",
  },
  reportStatusText: { fontSize: 10, fontFamily: undefined, color: "#B45309" },
  reportDetails: {
    gap: 7,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  reportDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  reportDetailLabel: { fontSize: 11, fontFamily: undefined, color: C.textMuted },
  reportDetailValue: { flex: 1, fontSize: 12, fontFamily: undefined, color: C.text, textAlign: "right" },
  reportPreview: {
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.border,
  },
  reportPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  reportPreviewTitle: { fontSize: 12, fontFamily: undefined, color: C.primary },
  reportPreviewImage: {
    width: "100%",
    height: 150,
    borderRadius: 9,
    backgroundColor: "#E5E7EB",
  },
  reportPreviewContentTitle: {
    fontSize: 13,
    fontFamily: undefined,
    color: C.text,
    textAlign: "right",
  },
  reportPreviewText: {
    fontSize: 12,
    lineHeight: 19,
    fontFamily: undefined,
    color: C.textSecondary,
    textAlign: "right",
  },
  reportPreviewEmpty: {
    fontSize: 11,
    fontFamily: undefined,
    color: C.textMuted,
    textAlign: "right",
  },
  reportMessages: { gap: 7 },
  reportMessage: {
    gap: 4,
    padding: 8,
    borderRadius: 9,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  reportMessageMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  reportMessageSender: { flex: 1, fontSize: 10, fontFamily: undefined, color: C.primary, textAlign: "right" },
  reportMessageDate: { fontSize: 9, fontFamily: undefined, color: C.textMuted },
  reportMessageText: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: undefined,
    color: C.text,
    textAlign: "right",
  },
  reportMessageImage: {
    width: "100%",
    height: 90,
    borderRadius: 7,
    backgroundColor: "#E5E7EB",
  },
  reportNotice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FEF3C7",
  },
  reportNoticeSuccess: { backgroundColor: C.successLight },
  reportNoticeDanger: { backgroundColor: C.dangerLight },
  reportNoticeText: { fontSize: 11, fontFamily: undefined, color: "#B45309" },
  reportActions: { flexDirection: "row", gap: 7 },
  reportActionBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 5,
  },
  reportRemoveBtn: { backgroundColor: C.inputBg },
  reportRemoveText: { fontSize: 10, fontFamily: undefined, color: C.textSecondary },
  reportBanBtn: { backgroundColor: C.dangerLight, borderWidth: 1, borderColor: C.danger + "30" },
  reportBanText: { fontSize: 10, fontFamily: undefined, color: C.danger },
  reportDeleteBtn: { backgroundColor: C.danger },
  reportDeleteText: { fontSize: 10, fontFamily: undefined, color: "#FFF" },
  actionDisabled: { opacity: 0.45 },
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
