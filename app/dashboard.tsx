import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
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
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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

function RequestItem({ item }: { item: Request }) {
  const typeLabel = item.type === "deposit" ? "إيداع" : "سحب";
  const typeColor = item.type === "deposit" ? C.success : "#E53935";
  const typeIcon = item.type === "deposit" ? "trending-up" : "trending-down";

  const statusConfig = {
    pending: { label: "قيد الانتظار", color: "#F59E0B", bg: "#FEF3C7" },
    approved: { label: "تمت الموافقة", color: C.success, bg: C.successLight },
    rejected: { label: "مرفوض", color: C.danger, bg: C.dangerLight },
  };

  const st = statusConfig[item.status];
  const date = new Date(item.createdAt);
  const formatted = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

  return (
    <View style={styles.requestItem}>
      <View style={[styles.statusDot, { backgroundColor: st.color }]} />
      <View style={styles.itemContent}>
        <View style={styles.itemRow}>
          <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
            <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
          </View>
          <View style={styles.itemRight}>
            <Text style={[styles.itemAmount, { color: typeColor }]}>
              {item.amount.toLocaleString("ar-SA")} ريال
            </Text>
            <View style={[styles.typeTag, { backgroundColor: typeColor + "18" }]}>
              <Feather name={typeIcon} size={12} color={typeColor} />
              <Text style={[styles.typeTagText, { color: typeColor }]}>{typeLabel}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.itemDate}>{formatted}</Text>
      </View>
    </View>
  );
}

function RequestModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (type: RequestType, amount: number) => void;
}) {
  const [type, setType] = useState<RequestType>("deposit");
  const [amount, setAmount] = useState("");

  const handleSubmit = () => {
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) {
      Alert.alert("خطأ", "يرجى إدخال مبلغ صحيح");
      return;
    }
    onSubmit(type, num);
    setAmount("");
    setType("deposit");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} style={styles.modalCloseBtn}>
              <Feather name="x" size={20} color={C.textSecondary} />
            </Pressable>
            <Text style={styles.modalTitle}>طلب جديد</Text>
          </View>

          <View style={styles.typeToggle}>
            <Pressable
              style={[
                styles.typeBtn,
                type === "withdrawal" && styles.typeBtnActive,
                type === "withdrawal" && { backgroundColor: "#FDECEA" },
              ]}
              onPress={() => {
                setType("withdrawal");
                Haptics.selectionAsync();
              }}
            >
              <Feather
                name="trending-down"
                size={16}
                color={type === "withdrawal" ? C.danger : C.textSecondary}
              />
              <Text
                style={[
                  styles.typeBtnText,
                  type === "withdrawal" && { color: C.danger },
                ]}
              >
                سحب
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.typeBtn,
                type === "deposit" && styles.typeBtnActive,
                type === "deposit" && { backgroundColor: C.successLight },
              ]}
              onPress={() => {
                setType("deposit");
                Haptics.selectionAsync();
              }}
            >
              <Feather
                name="trending-up"
                size={16}
                color={type === "deposit" ? C.success : C.textSecondary}
              />
              <Text
                style={[
                  styles.typeBtnText,
                  type === "deposit" && { color: C.success },
                ]}
              >
                إيداع
              </Text>
            </Pressable>
          </View>

          <View style={styles.amountField}>
            <Text style={styles.amountLabel}>المبلغ (ريال سعودي)</Text>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor={C.textMuted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              textAlign="right"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          <Pressable
            style={[
              styles.submitBtn,
              {
                backgroundColor:
                  type === "deposit" ? C.success : C.danger,
              },
            ]}
            onPress={handleSubmit}
          >
            <Text style={styles.submitBtnText}>
              {type === "deposit" ? "إرسال طلب الإيداع" : "إرسال طلب السحب"}
            </Text>
            <Feather name="arrow-left" size={18} color="#FFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [currentUser, setCurrentUser] = useState("");
  const [requests, setRequests] = useState<Request[]>([]);
  const [showModal, setShowModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        const user = await AsyncStorage.getItem("@currentUser");
        if (!user) {
          router.replace("/");
          return;
        }
        setCurrentUser(user);

        const storedRequests = await AsyncStorage.getItem("@requests");
        const allRequests: Request[] = storedRequests
          ? JSON.parse(storedRequests)
          : [];
        const myRequests = allRequests
          .filter((r) => r.userId === user)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        setRequests(myRequests);
      };
      load();
    }, [])
  );

  const handleNewRequest = async (type: RequestType, amount: number) => {
    try {
      const newRequest: Request = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        userId: currentUser,
        type,
        amount,
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      const stored = await AsyncStorage.getItem("@requests");
      const all: Request[] = stored ? JSON.parse(stored) : [];
      all.push(newRequest);
      await AsyncStorage.setItem("@requests", JSON.stringify(all));

      setRequests((prev) => [newRequest, ...prev]);
      setShowModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("تم الإرسال", "تم إرسال طلبك بنجاح وهو قيد المراجعة");
    } catch {
      Alert.alert("خطأ", "حدث خطأ أثناء إرسال الطلب");
    }
  };

  const handleLogout = () => {
    Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "خروج",
        style: "destructive",
        onPress: async () => {
          await AsyncStorage.removeItem("@currentUser");
          router.replace("/");
        },
      },
    ]);
  };

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedTotal = requests
    .filter((r) => r.status === "approved" && r.type === "deposit")
    .reduce((acc, r) => acc + r.amount, 0);

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={styles.header}>
        <View style={[styles.headerContent, { paddingTop: topPad + 10 }]}>
          <Pressable onPress={handleLogout} style={styles.logoutBtn}>
            <Feather name="log-out" size={20} color="rgba(255,255,255,0.7)" />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>مرحباً بك</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {currentUser}
            </Text>
          </View>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={24} color={C.accent} />
          </View>
        </View>

        <View style={styles.balanceCard}>
          <View style={styles.balanceRow}>
            <View>
              <Text style={styles.balanceLabel}>إجمالي الإيداعات المعتمدة</Text>
              <Text style={styles.balanceValue}>
                {approvedTotal.toLocaleString("ar-SA")}{" "}
                <Text style={styles.balanceCurrency}>ريال</Text>
              </Text>
            </View>
            <View style={styles.balanceIcon}>
              <MaterialCommunityIcons
                name="bank-outline"
                size={28}
                color={C.accent}
              />
            </View>
          </View>

          <View style={styles.quickStats}>
            <View style={styles.quickStat}>
              <Text style={styles.quickStatValue}>{requests.length}</Text>
              <Text style={styles.quickStatLabel}>إجمالي الطلبات</Text>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStat}>
              <Text style={[styles.quickStatValue, { color: "#F59E0B" }]}>
                {pendingCount}
              </Text>
              <Text style={styles.quickStatLabel}>قيد الانتظار</Text>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStat}>
              <Text style={[styles.quickStatValue, { color: C.success }]}>
                {requests.filter((r) => r.status === "approved").length}
              </Text>
              <Text style={styles.quickStatLabel}>معتمد</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.sectionHeader}>
        <Pressable
          style={styles.newRequestBtn}
          onPress={() => {
            setShowModal(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <LinearGradient
            colors={[C.accent, C.accentLight]}
            style={styles.newRequestGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Feather name="plus" size={18} color={C.primary} />
            <Text style={styles.newRequestText}>طلب جديد</Text>
          </LinearGradient>
        </Pressable>
        <Text style={styles.sectionTitle}>طلباتي</Text>
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: bottomPad + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
            <RequestItem item={item} />
          </Animated.View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="file-document-outline"
              size={56}
              color={C.border}
            />
            <Text style={styles.emptyTitle}>لا توجد طلبات بعد</Text>
            <Text style={styles.emptyText}>
              أنشئ طلب إيداع أو سحب جديد للبدء
            </Text>
          </View>
        }
      />

      <RequestModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleNewRequest}
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
  headerText: { flex: 1, alignItems: "flex-end" },
  greeting: {
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.6)",
    textAlign: "right",
  },
  userName: {
    fontSize: 16,
    fontFamily: "Cairo_600SemiBold",
    color: "#FFF",
    textAlign: "right",
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(201,168,76,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(201,168,76,0.3)",
  },
  balanceCard: {
    marginHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.2)",
    gap: 16,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  balanceLabel: {
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.6)",
    textAlign: "right",
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 28,
    fontFamily: "Cairo_700Bold",
    color: C.accent,
    textAlign: "right",
  },
  balanceCurrency: {
    fontSize: 14,
    fontFamily: "Cairo_400Regular",
  },
  balanceIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: "rgba(201,168,76,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  quickStats: {
    flexDirection: "row",
    alignItems: "center",
  },
  quickStat: { flex: 1, alignItems: "center", gap: 2 },
  quickStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  quickStatValue: {
    fontSize: 20,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
  },
  quickStatLabel: {
    fontSize: 10,
    fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Cairo_700Bold",
    color: C.text,
    textAlign: "right",
  },
  newRequestBtn: {
    borderRadius: 12,
    overflow: "hidden",
  },
  newRequestGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 14,
    gap: 6,
  },
  newRequestText: {
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
    color: C.primary,
  },
  listContent: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  requestItem: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  itemContent: { flex: 1, gap: 6 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusPill: {
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  statusText: {
    fontSize: 11,
    fontFamily: "Cairo_600SemiBold",
  },
  itemRight: { alignItems: "flex-end", gap: 4 },
  itemAmount: {
    fontSize: 16,
    fontFamily: "Cairo_700Bold",
    textAlign: "right",
  },
  typeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  typeTagText: {
    fontSize: 11,
    fontFamily: "Cairo_600SemiBold",
  },
  itemDate: {
    fontSize: 11,
    fontFamily: "Cairo_400Regular",
    color: C.textMuted,
    textAlign: "right",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 20,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: "center",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Cairo_700Bold",
    color: C.text,
    textAlign: "right",
  },
  typeToggle: {
    flexDirection: "row",
    backgroundColor: C.inputBg,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  typeBtnActive: {},
  typeBtnText: {
    fontSize: 14,
    fontFamily: "Cairo_600SemiBold",
    color: C.textSecondary,
  },
  amountField: { gap: 8 },
  amountLabel: {
    fontSize: 13,
    fontFamily: "Cairo_600SemiBold",
    color: C.text,
    textAlign: "right",
  },
  amountInput: {
    backgroundColor: C.inputBg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    fontFamily: "Cairo_700Bold",
    color: C.text,
    textAlign: "right",
  },
  submitBtn: {
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    gap: 8,
    marginTop: 4,
  },
  submitBtnText: {
    fontSize: 16,
    fontFamily: "Cairo_700Bold",
    color: "#FFF",
  },
  emptyState: {
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
