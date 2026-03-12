import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  FlatList,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Feather, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";

const C = Colors.light;

const ZAIN_CASH = "07827263200";
const ASIA_HAWALA = "07827263200";

export type WalletRequestType = "deposit" | "withdrawal";
export type WalletRequestStatus = "pending" | "approved" | "rejected";

export interface WalletRequest {
  id: string;
  userId: string;
  type: WalletRequestType;
  amount: number;
  accountNumber: string;
  imageUri?: string;
  status: WalletRequestStatus;
  createdAt: string;
}

async function getWalletRequests(): Promise<WalletRequest[]> {
  const stored = await AsyncStorage.getItem("@wallet_requests");
  return stored ? JSON.parse(stored) : [];
}

async function saveWalletRequests(reqs: WalletRequest[]): Promise<void> {
  await AsyncStorage.setItem("@wallet_requests", JSON.stringify(reqs));
}

async function getUserBalance(userId: string): Promise<number> {
  const stored = await AsyncStorage.getItem(`@balance_${userId}`);
  return stored !== null ? parseFloat(stored) : 0;
}

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString("ar-IQ")} د.ع`;
}

const STATUS_CONFIG: Record<
  WalletRequestStatus,
  { label: string; color: string; bg: string }
> = {
  pending: { label: "قيد المراجعة", color: "#F59E0B", bg: "#FEF3C7" },
  approved: { label: "تمت الموافقة", color: C.success, bg: C.successLight },
  rejected: { label: "مرفوض", color: C.danger, bg: C.dangerLight },
};

function RequestHistoryCard({ item }: { item: WalletRequest }) {
  const isDeposit = item.type === "deposit";
  const st = STATUS_CONFIG[item.status];
  const date = new Date(item.createdAt);
  const formatted = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

  return (
    <View style={histStyles.card}>
      <View style={histStyles.row}>
        <View style={[histStyles.statusBadge, { backgroundColor: st.bg }]}>
          <Text style={[histStyles.statusText, { color: st.color }]}>{st.label}</Text>
        </View>
        <View style={histStyles.info}>
          <View style={histStyles.typeRow}>
            <View
              style={[
                histStyles.typeBadge,
                { backgroundColor: isDeposit ? `${C.success}18` : `${C.danger}18` },
              ]}
            >
              <Feather
                name={isDeposit ? "trending-up" : "trending-down"}
                size={12}
                color={isDeposit ? C.success : C.danger}
              />
              <Text
                style={[
                  histStyles.typeText,
                  { color: isDeposit ? C.success : C.danger },
                ]}
              >
                {isDeposit ? "إيداع" : "سحب"}
              </Text>
            </View>
            <Text style={histStyles.amount}>{formatCurrency(item.amount)}</Text>
          </View>
          <Text style={histStyles.account}>رقم: {item.accountNumber}</Text>
          <Text style={histStyles.date}>{formatted}</Text>
        </View>
      </View>
    </View>
  );
}

function InputField({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType = "default",
  icon,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: "default" | "decimal-pad" | "phone-pad" | "number-pad";
  icon: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={formStyles.fieldWrap}>
      <Text style={formStyles.label}>{label}</Text>
      <View style={[formStyles.inputRow, focused && formStyles.inputFocused]}>
        <View style={formStyles.iconBox}>{icon}</View>
        <TextInput
          style={formStyles.input}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          textAlign="right"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCapitalize="none"
        />
      </View>
    </View>
  );
}

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const [currentUser, setCurrentUser] = useState("");
  const [balance, setBalance] = useState(0);
  const [activeTab, setActiveTab] = useState<"deposit" | "withdrawal">("deposit");
  const [myRequests, setMyRequests] = useState<WalletRequest[]>([]);
  const [loading, setLoading] = useState(false);

  const [amount, setAmount] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const loadData = useCallback(async () => {
    const user = await AsyncStorage.getItem("@currentUser");
    if (!user) { router.replace("/"); return; }
    setCurrentUser(user);
    const bal = await getUserBalance(user);
    setBalance(bal);
    const all = await getWalletRequests();
    const mine = all
      .filter((r) => r.userId === user)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setMyRequests(mine);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const resetForm = () => {
    setAmount("");
    setAccountNumber("");
    setImageUri(null);
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("إذن مرفوض", "يرجى السماح بالوصول إلى مكتبة الصور");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      Alert.alert("خطأ", "يرجى إدخال مبلغ صحيح");
      return;
    }
    if (!accountNumber.trim()) {
      Alert.alert("خطأ", "يرجى إدخال رقم الحساب");
      return;
    }
    if (activeTab === "deposit" && !imageUri) {
      Alert.alert("خطأ", "يرجى رفع صورة التحويل لإتمام طلب الإيداع");
      return;
    }
    if (activeTab === "withdrawal" && numAmount > balance) {
      Alert.alert("رصيد غير كافٍ", `رصيدك الحالي ${formatCurrency(balance)} لا يكفي لسحب ${formatCurrency(numAmount)}`);
      return;
    }

    setLoading(true);
    try {
      const newReq: WalletRequest = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        userId: currentUser,
        type: activeTab,
        amount: numAmount,
        accountNumber: accountNumber.trim(),
        imageUri: activeTab === "deposit" ? (imageUri ?? undefined) : undefined,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      const all = await getWalletRequests();
      all.push(newReq);
      await saveWalletRequests(all);
      setMyRequests((prev) => [newReq, ...prev]);
      resetForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        activeTab === "deposit" ? "تم إرسال طلب الإيداع" : "تم إرسال طلب السحب",
        "سيتم مراجعة طلبك من قبل الإدارة خلال 24 ساعة."
      );
    } catch {
      Alert.alert("خطأ", "حدث خطأ أثناء إرسال الطلب");
    } finally {
      setLoading(false);
    }
  };

  const pendingCount = myRequests.filter((r) => r.status === "pending").length;

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={styles.header}>
        <View style={[styles.headerContent, { paddingTop: topPad + 10 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-right" size={22} color="rgba(255,255,255,0.8)" />
          </Pressable>
          <Text style={styles.headerTitle}>المحفظة المالية</Text>
          <View style={styles.headerIcon}>
            <MaterialCommunityIcons name="wallet" size={22} color={C.accent} />
          </View>
        </View>

        <View style={styles.balanceCard}>
          <View style={styles.balanceLeft}>
            <MaterialCommunityIcons name="bank-outline" size={26} color={C.accent} />
          </View>
          <View style={styles.balanceRight}>
            <Text style={styles.balanceLabel}>الرصيد الحالي</Text>
            <Text style={styles.balanceValue}>
              {balance.toLocaleString("ar-IQ")}{" "}
              <Text style={styles.balanceCurrency}>د.ع</Text>
            </Text>
          </View>
          {pendingCount > 0 && (
            <View style={styles.pendingChip}>
              <Feather name="clock" size={12} color="#F59E0B" />
              <Text style={styles.pendingChipText}>{pendingCount} قيد المراجعة</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.transferBanner}>
            <View style={styles.bannerIconWrap}>
              <MaterialCommunityIcons name="information" size={20} color={C.accent} />
            </View>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>للإيداع أو السحب، حوّل إلى:</Text>
              <View style={styles.bannerRow}>
                <MaterialCommunityIcons name="cellphone" size={14} color={C.textSecondary} />
                <Text style={styles.bannerAccount}>
                  زين كاش: <Text style={styles.bannerNum}>{ZAIN_CASH}</Text>
                </Text>
              </View>
              <View style={styles.bannerRow}>
                <MaterialCommunityIcons name="bank-transfer" size={14} color={C.textSecondary} />
                <Text style={styles.bannerAccount}>
                  آسيا حوالة: <Text style={styles.bannerNum}>{ASIA_HAWALA}</Text>
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.tabBar}>
            {(["deposit", "withdrawal"] as const).map((tab) => (
              <Pressable
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => {
                  setActiveTab(tab);
                  resetForm();
                  Haptics.selectionAsync();
                }}
              >
                <Feather
                  name={tab === "deposit" ? "trending-up" : "trending-down"}
                  size={15}
                  color={
                    activeTab === tab
                      ? tab === "deposit" ? C.success : C.danger
                      : C.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.tabText,
                    activeTab === tab && {
                      color: tab === "deposit" ? C.success : C.danger,
                    },
                  ]}
                >
                  {tab === "deposit" ? "إيداع" : "سحب"}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.formCard}>
            {activeTab === "deposit" ? (
              <>
                <View style={styles.formHeader}>
                  <View style={[styles.formHeaderIcon, { backgroundColor: `${C.success}15` }]}>
                    <Feather name="trending-up" size={20} color={C.success} />
                  </View>
                  <Text style={styles.formTitle}>طلب إيداع</Text>
                </View>

                <InputField
                  label="المبلغ المراد إيداعه (د.ع)"
                  placeholder="مثال: 50000"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  icon={<MaterialCommunityIcons name="cash" size={17} color={C.textSecondary} />}
                />

                <InputField
                  label="رقم حسابك (الذي تم التحويل منه)"
                  placeholder="07xxxxxxxx"
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  keyboardType="phone-pad"
                  icon={<Feather name="smartphone" size={17} color={C.textSecondary} />}
                />

                <View style={formStyles.fieldWrap}>
                  <Text style={formStyles.label}>صورة إيصال التحويل</Text>
                  {imageUri ? (
                    <View style={styles.imagePreviewWrap}>
                      <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
                      <Pressable style={styles.removeImageBtn} onPress={() => setImageUri(null)}>
                        <Feather name="x" size={14} color="#FFF" />
                      </Pressable>
                      <Pressable style={styles.changeImageBtn} onPress={handlePickImage}>
                        <Feather name="edit-2" size={13} color={C.primary} />
                        <Text style={styles.changeImageText}>تغيير</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable style={styles.uploadBtn} onPress={handlePickImage}>
                      <Feather name="upload-cloud" size={24} color={C.accent} />
                      <Text style={styles.uploadText}>اضغط لرفع صورة التحويل</Text>
                      <Text style={styles.uploadSub}>PNG، JPG مقبولة</Text>
                    </Pressable>
                  )}
                </View>

                <Pressable
                  style={[styles.submitBtn, { backgroundColor: C.success }, loading && { opacity: 0.6 }]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  <Feather name="check-circle" size={18} color="#FFF" />
                  <Text style={styles.submitText}>{loading ? "جارٍ الإرسال..." : "تأكيد الإيداع"}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.formHeader}>
                  <View style={[styles.formHeaderIcon, { backgroundColor: `${C.danger}15` }]}>
                    <Feather name="trending-down" size={20} color={C.danger} />
                  </View>
                  <Text style={styles.formTitle}>طلب سحب</Text>
                </View>

                <InputField
                  label="المبلغ المراد سحبه (د.ع)"
                  placeholder="مثال: 50000"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  icon={<MaterialCommunityIcons name="cash" size={17} color={C.textSecondary} />}
                />

                <InputField
                  label="رقم حسابك (لاستلام المبلغ)"
                  placeholder="07xxxxxxxx"
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  keyboardType="phone-pad"
                  icon={<Feather name="smartphone" size={17} color={C.textSecondary} />}
                />

                <View style={styles.note24h}>
                  <Feather name="clock" size={14} color="#F59E0B" />
                  <Text style={styles.note24hText}>
                    سيتم مراجعة طلبك من قبل الإدارة وتحويل المبلغ خلال 24 ساعة
                  </Text>
                </View>

                <Pressable
                  style={[styles.submitBtn, { backgroundColor: C.danger }, loading && { opacity: 0.6 }]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  <Feather name="send" size={18} color="#FFF" />
                  <Text style={styles.submitText}>{loading ? "جارٍ الإرسال..." : "تأكيد طلب السحب"}</Text>
                </Pressable>
              </>
            )}
          </View>

          {myRequests.length > 0 && (
            <View style={styles.historySection}>
              <Text style={styles.historyTitle}>سجل طلباتي</Text>
              {myRequests.map((req, index) => (
                <Animated.View key={req.id} entering={FadeInDown.delay(index * 40).springify()}>
                  <RequestHistoryCard item={req} />
                </Animated.View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    flex: 1, fontSize: 18, fontFamily: "Cairo_700Bold",
    color: "#FFF", textAlign: "center",
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(201,168,76,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  balanceCard: {
    marginHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: "rgba(201,168,76,0.2)",
    flexDirection: "row", gap: 14, alignItems: "center", flexWrap: "wrap",
  },
  balanceLeft: {
    width: 48, height: 48, borderRadius: 13,
    backgroundColor: "rgba(201,168,76,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  balanceRight: { flex: 1, alignItems: "flex-end" },
  balanceLabel: {
    fontSize: 11, fontFamily: "Cairo_400Regular",
    color: "rgba(255,255,255,0.6)", textAlign: "right",
  },
  balanceValue: {
    fontSize: 24, fontFamily: "Cairo_700Bold",
    color: C.accent, textAlign: "right",
  },
  balanceCurrency: { fontSize: 13, fontFamily: "Cairo_400Regular" },
  pendingChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(245,158,11,0.15)",
    borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10,
    borderWidth: 1, borderColor: "rgba(245,158,11,0.25)",
  },
  pendingChipText: {
    fontSize: 11, fontFamily: "Cairo_600SemiBold", color: "#F59E0B",
  },
  scrollContent: { paddingHorizontal: 16, paddingTop: 18, gap: 16 },
  transferBanner: {
    flexDirection: "row",
    backgroundColor: "rgba(201,168,76,0.08)",
    borderRadius: 16, padding: 14, gap: 12,
    borderWidth: 1, borderColor: "rgba(201,168,76,0.2)",
    alignItems: "flex-start",
  },
  bannerIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(201,168,76,0.15)",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  bannerText: { flex: 1, gap: 6, alignItems: "flex-end" },
  bannerTitle: {
    fontSize: 13, fontFamily: "Cairo_700Bold",
    color: C.text, textAlign: "right",
  },
  bannerRow: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end",
  },
  bannerAccount: {
    fontSize: 12, fontFamily: "Cairo_400Regular",
    color: C.textSecondary, textAlign: "right",
  },
  bannerNum: {
    fontFamily: "Cairo_700Bold", color: C.accent,
  },
  tabBar: {
    flexDirection: "row", gap: 10,
    backgroundColor: C.card, borderRadius: 14, padding: 6,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "center", paddingVertical: 12,
    borderRadius: 10, gap: 6,
  },
  tabActive: { backgroundColor: C.inputBg },
  tabText: {
    fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.textSecondary,
  },
  formCard: {
    backgroundColor: C.card, borderRadius: 18, padding: 18, gap: 16,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
  },
  formHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  formHeaderIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  formTitle: {
    flex: 1, fontSize: 17, fontFamily: "Cairo_700Bold",
    color: C.text, textAlign: "right",
  },
  uploadBtn: {
    borderWidth: 1.5, borderColor: C.border, borderStyle: "dashed",
    borderRadius: 14, padding: 24, alignItems: "center",
    justifyContent: "center", gap: 8, backgroundColor: "rgba(201,168,76,0.04)",
  },
  uploadText: {
    fontSize: 14, fontFamily: "Cairo_600SemiBold",
    color: C.text, textAlign: "center",
  },
  uploadSub: {
    fontSize: 11, fontFamily: "Cairo_400Regular",
    color: C.textMuted, textAlign: "center",
  },
  imagePreviewWrap: { borderRadius: 14, overflow: "hidden", position: "relative" },
  imagePreview: { width: "100%", height: 180, borderRadius: 14 },
  removeImageBtn: {
    position: "absolute", top: 8, right: 8,
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
  },
  changeImageBtn: {
    position: "absolute", bottom: 8, right: 8,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: C.accent, borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 10,
  },
  changeImageText: {
    fontSize: 11, fontFamily: "Cairo_600SemiBold", color: C.primary,
  },
  note24h: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "rgba(245,158,11,0.2)",
  },
  note24hText: {
    flex: 1, fontSize: 12, fontFamily: "Cairo_400Regular",
    color: C.text, textAlign: "right", lineHeight: 20,
  },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 13, paddingVertical: 15, gap: 8,
  },
  submitText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: "#FFF" },
  historySection: { gap: 10 },
  historyTitle: {
    fontSize: 15, fontFamily: "Cairo_700Bold",
    color: C.text, textAlign: "right",
  },
});

const histStyles = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 14, padding: 14,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  statusBadge: {
    borderRadius: 8, paddingVertical: 5, paddingHorizontal: 9,
    alignSelf: "flex-start",
  },
  statusText: { fontSize: 11, fontFamily: "Cairo_600SemiBold" },
  info: { flex: 1, alignItems: "flex-end", gap: 4 },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  typeBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7,
  },
  typeText: { fontSize: 11, fontFamily: "Cairo_600SemiBold" },
  amount: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.text },
  account: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textSecondary },
  date: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted },
});

const formStyles = StyleSheet.create({
  fieldWrap: { gap: 7 },
  label: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.text, textAlign: "right" },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.inputBg, borderRadius: 12,
    borderWidth: 1.5, borderColor: "transparent",
    paddingHorizontal: 12, paddingVertical: 2, gap: 8,
  },
  inputFocused: { borderColor: C.accent, backgroundColor: "#FFF" },
  iconBox: { width: 26, alignItems: "center" },
  input: {
    flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular",
    color: C.text, paddingVertical: 13, textAlign: "right",
  },
});
