import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { auth } from "../../lib/firebase";
import {
  getFoodOrder,
  updateFoodOrderStatus,
  type FoodOrder,
  type FoodOrderStatus,
} from "../../lib/db_logic";

const C = Colors.light;

const STATUS: Record<
  FoodOrderStatus,
  { label: string; color: string; bg: string }
> = {
  pending: {
    label: "قيد الانتظار",
    color: "#F59E0B",
    bg: "rgba(245,158,11,.12)",
  },
  accepted: {
    label: "تم قبول الطلب",
    color: "#22C55E",
    bg: "rgba(34,197,94,.12)",
  },
  preparing: {
    label: "جارٍ تحضير الطلب",
    color: "#3B82F6",
    bg: "rgba(59,130,246,.12)",
  },
  ready: {
    label: "الطلب جاهز",
    color: "#8B5CF6",
    bg: "rgba(139,92,246,.12)",
  },
  completed: {
    label: "مكتمل",
    color: "#16A34A",
    bg: "rgba(22,163,74,.12)",
  },
  rejected: {
    label: "مرفوض",
    color: "#EF4444",
    bg: "rgba(239,68,68,.12)",
  },
  cancelled: {
    label: "ملغي",
    color: "#6B7280",
    bg: "rgba(107,114,128,.12)",
  },
};

export default function RestaurantOrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();

  const [order, setOrder] = useState<FoodOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    try {
      const result = await getFoodOrder(orderId);
      setOrder(result);
    } catch (error) {
      console.error("getFoodOrder error:", error);
      Alert.alert("خطأ", "تعذر تحميل طلب المطعم.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orderId]);

  const changeStatus = async (status: FoodOrderStatus) => {
    if (!order || updating) return;

    setUpdating(true);

    const previous = order.status;
    setOrder((current) =>
      current ? { ...current, status } : current
    );

    try {
      await updateFoodOrderStatus(order.id, status);
    } catch (error) {
      console.error("updateFoodOrderStatus error:", error);

      setOrder((current) =>
        current ? { ...current, status: previous } : current
      );

      Alert.alert("خطأ", "تعذر تحديث حالة الطلب.");
    } finally {
      setUpdating(false);
    }
  };

  const isRestaurant = order?.restaurantId === auth.currentUser?.uid;

  const confirmStatus = (
    status: FoodOrderStatus,
    title: string,
    message: string
  ) => {
    Alert.alert(title, message, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "تأكيد",
        onPress: () => changeStatus(status),
      },
    ]);
  };

  if (loading) {
    return (
      <View style={S.center}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={S.muted}>جاري تحميل الطلب...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={S.center}>
        <Ionicons
          name="receipt-outline"
          size={64}
          color={C.accent}
        />
        <Text style={S.emptyTitle}>الطلب غير موجود</Text>

        <Pressable style={S.backButton} onPress={() => router.back()}>
          <Text style={S.backButtonText}>العودة</Text>
        </Pressable>
      </View>
    );
  }

  const cfg = STATUS[order.status];

  const date =
    order.createdAt?.toDate?.() instanceof Date
      ? order.createdAt.toDate().toLocaleString("ar-IQ-u-nu-latn")
      : "الآن";

  return (
    <View style={S.root}>
      <View style={S.header}>
        <Pressable onPress={() => router.back()} style={S.headerBtn}>
          <Feather name="arrow-right" size={23} color="#FFF" />
        </Pressable>

        <Text style={S.headerTitle}>طلب المطعم</Text>

        <Ionicons
          name="receipt-outline"
          size={24}
          color={C.accent}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={S.content}
      >
        <View style={S.statusCard}>
          <View
            style={[
              S.statusIcon,
              { backgroundColor: cfg.bg },
            ]}
          >
            <Ionicons
              name={
                order.status === "completed"
                  ? "checkmark-circle"
                  : order.status === "rejected"
                  ? "close-circle"
                  : "restaurant"
              }
              size={30}
              color={cfg.color}
            />
          </View>

          <Text style={S.statusTitle}>{cfg.label}</Text>

          <View
            style={[
              S.statusPill,
              { backgroundColor: cfg.bg },
            ]}
          >
            <Text
              style={[
                S.statusPillText,
                { color: cfg.color },
              ]}
            >
              {cfg.label}
            </Text>
          </View>
        </View>

        <View style={S.card}>
          <Text style={S.sectionTitle}>معلومات الطلب</Text>

          <View style={S.infoRow}>
            <Text style={S.infoValue}>{order.restaurantName}</Text>
            <Text style={S.infoLabel}>المطعم</Text>
          </View>

          <View style={S.infoRow}>
            <Text style={S.infoValue}>{order.customerName}</Text>
            <Text style={S.infoLabel}>العميل</Text>
          </View>

          <View style={S.infoRow}>
            <Text style={S.infoValue}>
              {order.paymentMethod === "cash"
                ? "الدفع عند الاستلام"
                : "المحفظة"}
            </Text>
            <Text style={S.infoLabel}>طريقة الدفع</Text>
          </View>

          <View style={S.infoRow}>
            <Text style={S.infoValue}>{date}</Text>
            <Text style={S.infoLabel}>تاريخ الطلب</Text>
          </View>
        </View>

        <View style={S.card}>
          <Text style={S.sectionTitle}>الوجبات</Text>

          {order.items.map((item) => (
            <View style={S.itemRow} key={item.foodId}>
              <View style={S.itemInfo}>
                <Text style={S.itemName}>{item.name}</Text>
                <Text style={S.itemQty}>
                  الكمية: {item.quantity}
                </Text>
              </View>

              <Text style={S.itemPrice}>
                {(item.price * item.quantity).toLocaleString()} د.ع
              </Text>
            </View>
          ))}

          <View style={S.divider} />

          <View style={S.totalRow}>
            <Text style={S.total}>{order.total.toLocaleString()} د.ع</Text>
            <Text style={S.totalLabel}>الإجمالي</Text>
          </View>
        </View>

        {isRestaurant && order.status === "pending" && (
          <View style={S.actions}>
            <Pressable
              style={[S.action, S.accept]}
              disabled={updating}
              onPress={() =>
                changeStatus("accepted")
              }
            >
              {updating ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Feather name="check" size={19} color="#FFF" />
                  <Text style={S.actionText}>قبول الطلب</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[S.action, S.reject]}
              disabled={updating}
              onPress={() =>
                confirmStatus(
                  "rejected",
                  "رفض الطلب",
                  "هل أنت متأكد من رفض هذا الطلب؟"
                )
              }
            >
              <Feather name="x" size={19} color="#FFF" />
              <Text style={S.actionText}>رفض الطلب</Text>
            </Pressable>
          </View>
        )}

        {isRestaurant && order.status === "accepted" && (
          <Pressable
            style={[S.action, S.preparing]}
            disabled={updating}
            onPress={() => changeStatus("preparing")}
          >
            <Feather name="loader" size={19} color="#FFF" />
            <Text style={S.actionText}>بدء تحضير الطلب</Text>
          </Pressable>
        )}

        {isRestaurant && order.status === "preparing" && (
          <Pressable
            style={[S.action, S.ready]}
            disabled={updating}
            onPress={() => changeStatus("ready")}
          >
            <Feather name="check-circle" size={19} color="#FFF" />
            <Text style={S.actionText}>تحديد الطلب كجاهز</Text>
          </Pressable>
        )}

        {isRestaurant && order.status === "ready" && (
          <Pressable
            style={[S.action, S.complete]}
            disabled={updating}
            onPress={() =>
              confirmStatus(
                "completed",
                "إكمال الطلب",
                "هل تم تسليم الطلب للعميل؟"
              )
            }
          >
            <Feather name="check-circle" size={19} color="#FFF" />
            <Text style={S.actionText}>إكمال الطلب</Text>
          </Pressable>
        )}

        {!isRestaurant &&
          ["pending", "accepted", "preparing", "ready"].includes(
            order.status
          ) && (
            <Pressable
              style={[S.action, S.cancel]}
              disabled={updating}
              onPress={() =>
                confirmStatus(
                  "cancelled",
                  "إلغاء الطلب",
                  "هل تريد إلغاء طلب المطعم؟"
                )
              }
            >
              <Feather name="x-circle" size={19} color="#FFF" />
              <Text style={S.actionText}>إلغاء الطلب</Text>
            </Pressable>
          )}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
  },

  header: {
    height: 62,
    backgroundColor: C.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },

  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    color: "#FFF",
    fontSize: 21,
    fontWeight: "900",
  },

  content: {
    padding: 15,
    paddingBottom: 35,
  },

  statusCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    alignItems: "center",
    marginBottom: 14,
  },

  statusIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },

  statusTitle: {
    color: C.text,
    fontSize: 19,
    fontWeight: "900",
  },

  statusPill: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },

  statusPillText: {
    fontSize: 12,
    fontWeight: "900",
  },

  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 15,
    marginBottom: 14,
  },

  sectionTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "right",
    marginBottom: 12,
  },

  infoRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  infoLabel: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },

  infoValue: {
    color: C.text,
    fontSize: 13,
    fontWeight: "800",
    maxWidth: "65%",
    textAlign: "right",
  },

  itemRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },

  itemInfo: {
    flex: 1,
    alignItems: "flex-end",
  },

  itemName: {
    color: C.text,
    fontSize: 14,
    fontWeight: "900",
  },

  itemQty: {
    color: C.textMuted,
    fontSize: 11,
    marginTop: 4,
  },

  itemPrice: {
    color: C.text,
    fontSize: 13,
    fontWeight: "900",
    marginLeft: 10,
  },

  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 8,
  },

  totalRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },

  totalLabel: {
    color: C.text,
    fontSize: 16,
    fontWeight: "900",
  },

  total: {
    color: C.accent,
    fontSize: 20,
    fontWeight: "900",
  },

  actions: {
    gap: 10,
    marginTop: 2,
  },

  action: {
    minHeight: 54,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row-reverse",
    gap: 8,
  },

  actionText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "900",
  },

  accept: {
    backgroundColor: "#16A34A",
  },

  reject: {
    backgroundColor: "#DC2626",
  },

  preparing: {
    backgroundColor: "#2563EB",
  },

  ready: {
    backgroundColor: "#7C3AED",
  },

  complete: {
    backgroundColor: "#16A34A",
  },

  cancel: {
    backgroundColor: "#DC2626",
  },

  center: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 20,
  },

  muted: {
    color: C.textMuted,
  },

  emptyTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "900",
  },

  backButton: {
    marginTop: 10,
    backgroundColor: C.primary,
    paddingHorizontal: 25,
    paddingVertical: 12,
    borderRadius: 14,
  },

  backButtonText: {
    color: "#FFF",
    fontWeight: "900",
  },
});
