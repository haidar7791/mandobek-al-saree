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
  ScrollView,
  RefreshControl,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { getAllOrders, saveAllOrders, getBalance, setBalance } from "../lib/db_logic";
import { db } from "../lib/firebase";
import * as Haptics from "expo-haptics";
//import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";

const C = Colors.light;
const [balance, setBalanceState] = useState(0);
const INSURANCE_AMOUNT = 10000;

const IRAQ_GOVERNORATES = [
  "بغداد",
  "البصرة",
  "نينوى",
  "أربيل",
  "النجف",
  "كربلاء",
  "ذي قار",
  "بابل",
  "الأنبار",
  "ميسان",
  "المثنى",
  "القادسية",
  "صلاح الدين",
  "ديالى",
  "كركوك",
  "السليمانية",
  "دهوك",
  "واسط",
];

type OrderStatus = "pending" | "in_delivery" | "delivered" | "returned";

interface AddressFields {
  governorate: string;
  neighborhood: string;
  street: string;
}

interface Order {
  id: string;
  merchantId: string;
  productName: string;
  merchantAddress: AddressFields;
  merchantPhone: string;
  customerAddress: AddressFields;
  customerPhone: string;
  productPrice: number;
  deliveryPrice: number;
  uniqueCode: string;
  status: OrderStatus;
  acceptedBy?: string;
  createdAt: string;
}
const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; color: string; bg: string; icon: string }
> = {
  pending: { label: "بانتظار مندوب", color: "#F59E0B", bg: "#FEF3C7", icon: "clock" },
  in_delivery: { label: "قيد التوصيل", color: "#3B82F6", bg: "#EFF6FF", icon: "truck" },
  delivered: { label: "تم التوصيل", color: C.success, bg: C.successLight, icon: "check-circle" },
  returned: { label: "تم الإرجاع", color: "#8B5CF6", bg: "#EDE9FE", icon: "rotate-ccw" },
};

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString("ar-IQ")} د.ع`;
}

function GovernoratePickerModal({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: string;
  onSelect: (g: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={govStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={govStyles.sheet}>
          <View style={govStyles.handle} />
          <View style={govStyles.header}>
            <Pressable onPress={onClose} style={govStyles.closeBtn}>
              <Feather name="x" size={18} color={C.textSecondary} />
            </Pressable>
            <Text style={govStyles.title}>اختر المحافظة</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={govStyles.list}>
            {IRAQ_GOVERNORATES.map((g) => (
              <Pressable
                key={g}
                style={[govStyles.item, selected === g && govStyles.itemSelected]}
                onPress={() => {
                  Haptics.selectionAsync();
                  onSelect(g);
                  onClose();
                }}
              >
                {selected === g ? (
                  <Feather name="check" size={16} color={C.accent} />
                ) : (
                  <View style={{ width: 16 }} />
                )}
                <Text style={[govStyles.itemText, selected === g && govStyles.itemTextSelected]}>
                  {g}
                </Text>
                <Feather name="map-pin" size={14} color={selected === g ? C.accent : C.textMuted} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FormField({
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
  keyboardType?: "default" | "phone-pad" | "decimal-pad" | "number-pad";
  icon?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={formStyles.fieldWrap}>
      <Text style={formStyles.label}>{label}</Text>
      <View style={[formStyles.inputRow, focused && formStyles.inputFocused]}>
        {icon && <View style={formStyles.iconWrap}>{icon}</View>}
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

function GovernorateField({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: string;
  onSelect: (g: string) => void;
}) {
  const [pickerVisible, setPickerVisible] = useState(false);
  return (
    <View style={formStyles.fieldWrap}>
      <Text style={formStyles.label}>{label}</Text>
      <Pressable
        style={[formStyles.inputRow, formStyles.pickerRow]}
        onPress={() => setPickerVisible(true)}
      >
        <Feather name="chevron-down" size={16} color={C.textMuted} />
        <Text style={[formStyles.input, { paddingVertical: 13, color: value ? C.text : C.textMuted }]}>
          {value || "اختر المحافظة"}
        </Text>
        <View style={formStyles.iconWrap}>
          <Feather name="map-pin" size={15} color={C.textMuted} />
        </View>
      </Pressable>
      <GovernoratePickerModal
        visible={pickerVisible}
        selected={value}
        onSelect={onSelect}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
}

function AddressGroup({
  title,
  color,
  address,
  onChange,
}: {
  title: string;
  color: string;
  address: AddressFields;
  onChange: (key: keyof AddressFields, val: string) => void;
}) {
  return (
    <View style={formStyles.addressGroup}>
      <View style={[formStyles.groupHeader, { borderRightColor: color }]}>
        <Text style={[formStyles.groupTitle, { color }]}>{title}</Text>
      </View>
      <GovernorateField
        label="المحافظة"
        value={address.governorate}
        onSelect={(v) => onChange("governorate", v)}
      />
      <FormField
        label="الحي / المنطقة"
        placeholder="مثال: الكرادة"
        value={address.neighborhood}
        onChangeText={(v) => onChange("neighborhood", v)}
        icon={<Feather name="home" size={15} color={C.textMuted} />}
      />
      <FormField
        label="الشارع"
        placeholder="مثال: شارع فلسطين"
        value={address.street}
        onChangeText={(v) => onChange("street", v)}
        icon={<Feather name="navigation" size={15} color={C.textMuted} />}
      />
    </View>
  );
}

function AddOrderModal({
  visible,
  currentUser,
  merchantBalance,
  onClose,
  onCreated,
  onMerchantBalanceChanged,
}: {
  visible: boolean;
  currentUser: string;
  merchantBalance: number;
  onClose: () => void;
  onCreated: (order: Order) => void;
  onMerchantBalanceChanged: (newBalance: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;
  const emptyAddress = (): AddressFields => ({ governorate: "", neighborhood: "", street: "" });

  const [productName, setProductName] = useState("");
  const [merchantAddress, setMerchantAddress] = useState<AddressFields>(emptyAddress());
  const [merchantPhone, setMerchantPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState<AddressFields>(emptyAddress());
  const [customerPhone, setCustomerPhone] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [deliveryPrice, setDeliveryPrice] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setProductName(""); setMerchantAddress(emptyAddress()); setMerchantPhone("");
    setCustomerAddress(emptyAddress()); setCustomerPhone("");
    setProductPrice(""); setDeliveryPrice("");
  };

  const updateMerchantAddr = (key: keyof AddressFields, val: string) =>
    setMerchantAddress((prev) => ({ ...prev, [key]: val }));
  const updateCustomerAddr = (key: keyof AddressFields, val: string) =>
    setCustomerAddress((prev) => ({ ...prev, [key]: val }));

  const handleCreate = async () => {
    if (!productName.trim()) { Alert.alert("خطأ", "يرجى إدخال اسم المنتج"); return; }
    if (!merchantAddress.governorate || !merchantAddress.neighborhood || !merchantAddress.street) {
      Alert.alert("خطأ", "يرجى إكمال عنوان التاجر"); return;
    }
    if (!merchantPhone.trim()) { Alert.alert("خطأ", "يرجى إدخال هاتف التاجر"); return; }
    if (!customerAddress.governorate || !customerAddress.neighborhood || !customerAddress.street) {
      Alert.alert("خطأ", "يرجى إكمال عنوان الزبون"); return;
    }
    if (!customerPhone.trim()) { Alert.alert("خطأ", "يرجى إدخال هاتف الزبون"); return; }
    const pp = parseFloat(productPrice);
    const dp = parseFloat(deliveryPrice);
    if (!productPrice || isNaN(pp) || pp <= 0) { Alert.alert("خطأ", "يرجى إدخال سعر المنتج"); return; }
    if (!deliveryPrice || isNaN(dp) || dp < 0) { Alert.alert("خطأ", "يرجى إدخال أجر التوصيل"); return; }
    if (merchantBalance < INSURANCE_AMOUNT) {
      Alert.alert(
        "رصيد غير كافٍ",
        `يلزم توفر ${formatCurrency(INSURANCE_AMOUNT)} في محفظتك كتأمين مؤقت لإنشاء الطلب. رصيدك الحالي: ${formatCurrency(merchantBalance)}`
      );
      return;
    }

    setLoading(true);
    try {
      const code = generateCode();
      const newOrder: Order = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        merchantId: currentUser,
        productName: productName.trim(),
        merchantAddress, merchantPhone: merchantPhone.trim(),
        customerAddress, customerPhone: customerPhone.trim(),
        productPrice: pp, deliveryPrice: dp,
        uniqueCode: code, status: "pending",
        createdAt: new Date().toISOString(),
      };
      const all = await getAllOrders();
      all.push(newOrder);
      await saveAllOrders(all);
      const newMerchantBal = merchantBalance - INSURANCE_AMOUNT;
      await setBalance(currentUser, newMerchantBal);
      onMerchantBalanceChanged(newMerchantBal);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset(); onClose(); onCreated(newOrder);
    } catch {
      Alert.alert("خطأ", "حدث خطأ أثناء إنشاء الطلب");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={modalStyles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[modalStyles.sheet, { maxHeight: "92%" }]}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <Pressable onPress={onClose} style={modalStyles.closeBtn}>
              <Feather name="x" size={20} color={C.textSecondary} />
            </Pressable>
            <Text style={modalStyles.title}>إضافة طلب توصيل جديد</Text>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[formStyles.formContent, { paddingBottom: bottomPad + 16 }]}
            keyboardShouldPersistTaps="handled"
          >
            <FormField
              label="اسم المنتج"
              placeholder="مثال: جوال آيفون 15"
              value={productName}
              onChangeText={setProductName}
              icon={<MaterialCommunityIcons name="package-variant" size={15} color={C.textMuted} />}
            />
            <AddressGroup title="عنوان التاجر" color={C.primary} address={merchantAddress} onChange={updateMerchantAddr} />
            <FormField
              label="هاتف التاجر"
              placeholder="07xxxxxxxx"
              value={merchantPhone}
              onChangeText={setMerchantPhone}
              keyboardType="phone-pad"
              icon={<Feather name="phone" size={15} color={C.textMuted} />}
            />
            <AddressGroup title="عنوان الزبون" color="#3B82F6" address={customerAddress} onChange={updateCustomerAddr} />
            <FormField
              label="هاتف الزبون"
              placeholder="07xxxxxxxx"
              value={customerPhone}
              onChangeText={setCustomerPhone}
              keyboardType="phone-pad"
              icon={<Feather name="phone" size={15} color={C.textMuted} />}
            />
            <View style={formStyles.priceRow}>
              <View style={{ flex: 1 }}>
                <FormField
                  label="أجر التوصيل (د.ع)"
                  placeholder="0"
                  value={deliveryPrice}
                  onChangeText={setDeliveryPrice}
                  keyboardType="decimal-pad"
                  icon={<MaterialCommunityIcons name="truck-delivery" size={15} color={C.textMuted} />}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormField
                  label="سعر المنتج (د.ع)"
                  placeholder="0"
                  value={productPrice}
                  onChangeText={setProductPrice}
                  keyboardType="decimal-pad"
                  icon={<MaterialCommunityIcons name="cash" size={15} color={C.textMuted} />}
                />
              </View>
            </View>
            <View style={formStyles.codeNote}>
              <Feather name="shield" size={14} color={C.accent} />
              <Text style={formStyles.codeNoteText}>
                سيُخصم {formatCurrency(INSURANCE_AMOUNT)} من محفظتك كتأمين مؤقت فور إنشاء الطلب، ويُعاد إليك عند إتمام التوصيل أو الإرجاع.
              </Text>
            </View>
            <Pressable style={[formStyles.submitBtn, loading && { opacity: 0.6 }]} onPress={handleCreate} disabled={loading}>
              <LinearGradient colors={[C.accent, C.accentLight]} style={formStyles.submitGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {loading ? (
                  <Text style={formStyles.submitText}>جارٍ الإنشاء...</Text>
                ) : (
                  <>
                    <Text style={formStyles.submitText}>إنشاء الطلب</Text>
                    <Feather name="arrow-left" size={18} color={C.primary} />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CodeModal({ visible, code, productName, onClose }: { visible: boolean; code: string; productName: string; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <View style={modalStyles.codeCard}>
          <View style={modalStyles.codeIconCircle}>
            <LinearGradient colors={[C.accent, C.accentLight]} style={StyleSheet.absoluteFill} />
            <Feather name="shield" size={32} color={C.primary} />
          </View>
          <Text style={modalStyles.codeTitle}>الرمز السري للطلب</Text>
          <Text style={modalStyles.codeProductName}>{productName}</Text>
          <Text style={modalStyles.codeNote}>
            احتفظ بهذا الرمز، أعطه للزبون لتأكيد الاستلام
          </Text>
          <View style={modalStyles.codeBox}>
            {code.split("").map((char, i) => (
              <Text key={i} style={modalStyles.codeCharText}>{char}</Text>
            ))}
          </View>
          <Pressable style={modalStyles.codeDoneBtn} onPress={onClose}>
            <Text style={modalStyles.codeDoneText}>حسناً، فهمت</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function EnterCodeModal({ visible, mode, onClose, onConfirm }: {
  visible: boolean; mode: "deliver" | "return"; onClose: () => void; onConfirm: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const isDelivery = mode === "deliver";

  const handleConfirm = () => {
    if (code.trim().length < 4) { Alert.alert("خطأ", "يرجى إدخال الرمز السري الصحيح"); return; }
    onConfirm(code.trim().toUpperCase());
    setCode("");
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { setCode(""); onClose(); }}>
      <KeyboardAvoidingView style={modalStyles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { setCode(""); onClose(); }} />
        <View style={modalStyles.enterCodeSheet}>
          <View style={modalStyles.handle} />
          <View style={[modalStyles.enterCodeIcon, { backgroundColor: isDelivery ? C.successLight : "rgba(139,92,246,0.12)" }]}>
            <Feather name={isDelivery ? "check-circle" : "rotate-ccw"} size={28} color={isDelivery ? C.success : "#8B5CF6"} />
          </View>
          <Text style={modalStyles.enterCodeTitle}>{isDelivery ? "تأكيد التوصيل" : "تأكيد الإرجاع"}</Text>
          <Text style={modalStyles.enterCodeSubtitle}>
            {isDelivery
              ? "أدخل الرمز السري الذي حصلت عليه من الزبون عند التسليم"
              : "أدخل الرمز السري الذي حصلت عليه من التاجر عند الإرجاع"}
          </Text>
          <TextInput
            style={modalStyles.codeInput}
            placeholder="------"
            placeholderTextColor={C.textMuted}
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            textAlign="left"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
          />
          <Pressable style={[modalStyles.confirmBtn, { backgroundColor: isDelivery ? C.success : "#8B5CF6" }]} onPress={handleConfirm}>
            <Text style={modalStyles.confirmBtnText}>{isDelivery ? "تأكيد التوصيل" : "تأكيد الإرجاع"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function OrderCard({ order, currentUser, onAction }: { order: Order; currentUser: string; onAction: () => void }) {
  const isMerchant = order.merchantId === currentUser;
  const isMyDelivery = order.acceptedBy === currentUser;
  const st = STATUS_CONFIG[order.status];
  const date = new Date(order.createdAt);
  const formatted = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.cardHeader}>
        <View style={[cardStyles.statusBadge, { backgroundColor: st.bg }]}>
          <Feather name={st.icon as any} size={12} color={st.color} />
          <Text style={[cardStyles.statusText, { color: st.color }]}>{st.label}</Text>
        </View>
        <View style={cardStyles.cardHeaderRight}>
          <Text style={cardStyles.productName}>{order.productName}</Text>
          <Text style={cardStyles.dateText}>{formatted}</Text>
        </View>
      </View>
      <View style={cardStyles.priceRow}>
        <View style={cardStyles.priceItem}>
          <Text style={cardStyles.priceLabel}>أجر التوصيل</Text>
          <Text style={[cardStyles.priceValue, { color: "#3B82F6" }]}>{formatCurrency(order.deliveryPrice)}</Text>
        </View>
        <View style={cardStyles.priceDivider} />
        <View style={cardStyles.priceItem}>
          <Text style={cardStyles.priceLabel}>سعر المنتج</Text>
          <Text style={[cardStyles.priceValue, { color: C.text }]}>{formatCurrency(order.productPrice)}</Text>
        </View>
      </View>
      <View style={cardStyles.addrRow}>
        <View style={cardStyles.addrItem}>
          <Feather name="truck" size={12} color={C.textMuted} />
          <Text style={cardStyles.addrText} numberOfLines={1}>
            {order.customerAddress.governorate} · {order.customerAddress.neighborhood}
          </Text>
        </View>
        <View style={cardStyles.addrItem}>
          <Feather name="map-pin" size={12} color={C.textMuted} />
          <Text style={cardStyles.addrText} numberOfLines={1}>
            {order.merchantAddress.governorate} · {order.merchantAddress.neighborhood}
          </Text>
        </View>
      </View>
      {isMerchant && order.status === "pending" && (
        <View style={cardStyles.codeRow}>
          <Text style={cardStyles.codeLabel}>الرمز السري:</Text>
          <View style={cardStyles.codePill}>
            {order.uniqueCode.split("").map((c, i) => (
              <Text key={i} style={cardStyles.codeChar}>{c}</Text>
            ))}
          </View>
        </View>
      )}
      {isMyDelivery && order.status === "in_delivery" && (
        <Pressable style={cardStyles.actionArea} onPress={onAction}>
          <Feather name="chevron-left" size={16} color={C.accent} />
          <Text style={cardStyles.actionText}>إدارة التوصيل</Text>
        </Pressable>
      )}
    </View>
  );
}

function MarketOrderCard({ order, userBalance, onAccept }: { order: Order; userBalance: number; onAccept: () => void }) {
  const canAfford = userBalance >= order.productPrice;
  const date = new Date(order.createdAt);
  const formatted = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.cardHeader}>
        <View style={cardStyles.newBadge}>
          <Feather name="zap" size={11} color={C.accent} />
          <Text style={cardStyles.newBadgeText}>متاح</Text>
        </View>
        <View style={cardStyles.cardHeaderRight}>
          <Text style={cardStyles.productName}>{order.productName}</Text>
          <Text style={cardStyles.dateText}>{formatted}</Text>
        </View>
      </View>
      <View style={cardStyles.priceRow}>
        <View style={cardStyles.priceItem}>
          <Text style={cardStyles.priceLabel}>أجر التوصيل</Text>
          <Text style={[cardStyles.priceValue, { color: C.success }]}>+{formatCurrency(order.deliveryPrice)}</Text>
        </View>
        <View style={cardStyles.priceDivider} />
        <View style={cardStyles.priceItem}>
          <Text style={cardStyles.priceLabel}>ضمان المنتج</Text>
          <Text style={[cardStyles.priceValue, { color: C.danger }]}>-{formatCurrency(order.productPrice)}</Text>
        </View>
      </View>
      <View style={cardStyles.addrRow}>
        <View style={cardStyles.addrItem}>
          <Feather name="truck" size={12} color="#3B82F6" />
          <Text style={cardStyles.addrText} numberOfLines={1}>
            التوصيل: {order.customerAddress.governorate} · {order.customerAddress.neighborhood}
          </Text>
        </View>
        <View style={cardStyles.addrItem}>
          <Feather name="map-pin" size={12} color={C.textMuted} />
          <Text style={cardStyles.addrText} numberOfLines={1}>
            الاستلام: {order.merchantAddress.governorate} · {order.merchantAddress.neighborhood}
          </Text>
        </View>
      </View>
      {!canAfford && (
        <View style={cardStyles.noBalanceWarn}>
          <Feather name="alert-circle" size={13} color={C.danger} />
          <Text style={cardStyles.noBalanceText}>
            رصيدك غير كافٍ لقبول هذا الطلب ({formatCurrency(order.productPrice)} ضمان)
          </Text>
        </View>
      )}
      <Pressable
        style={[cardStyles.acceptBtn, !canAfford && cardStyles.acceptBtnDisabled]}
        onPress={canAfford ? onAccept : undefined}
        disabled={!canAfford}
      >
        <LinearGradient
          colors={canAfford ? [C.accent, C.accentLight] : [C.border, C.border]}
          style={cardStyles.acceptGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Feather name="check" size={16} color={canAfford ? C.primary : C.textMuted} />
          <Text style={[cardStyles.acceptText, !canAfford && { color: C.textMuted }]}>قبول الطلب</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

type ActiveTab = "my_orders" | "market" | "my_deliveries";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [currentUser, setCurrentUser] = useState("");
  const [balance, setBalanceState] = useState(DEFAULT_BALANCE);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("my_orders");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newOrderCode, setNewOrderCode] = useState<{ code: string; name: string } | null>(null);
  const [codeEntry, setCodeEntry] = useState<{ orderId: string; mode: "deliver" | "return" } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const user = await AsyncStorage.getItem("@currentUser");
      if (!user) { router.replace("/"); return; }
      setCurrentUser(user);
      const bal = await getBalance(user);
      setBalanceState(bal);
      const orders = await getAllOrders();
      setAllOrders(
        orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      );
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const handleOrderCreated = (order: Order) => {
    setAllOrders((prev) => [order, ...prev]);
    setNewOrderCode({ code: order.uniqueCode, name: order.productName });
  };

  const handleAcceptOrder = async (order: Order) => {
    Alert.alert(
      "تأكيد قبول الطلب",
      `سيتم خصم ${formatCurrency(order.productPrice)} من رصيدك كضمان للمنتج. هل تريد المتابعة؟`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "قبول",
          onPress: async () => {
            try {
              const newBal = balance - order.productPrice;
              await setBalance(currentUser, newBal);
              setBalanceState(newBal);
              const updated = allOrders.map((o) =>
                o.id === order.id ? { ...o, status: "in_delivery" as OrderStatus, acceptedBy: currentUser } : o
              );
              await saveAllOrders(updated);
              setAllOrders(updated);
              setActiveTab("my_deliveries");
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("تم قبول الطلب", `تم قبول طلب "${order.productName}" بنجاح. تم خصم ${formatCurrency(order.productPrice)} من رصيدك.`);
            } catch { Alert.alert("خطأ", "حدث خطأ أثناء قبول الطلب"); }
          },
        },
      ]
    );
  };

  const handleConfirmCode = async (enteredCode: string) => {
    if (!codeEntry) return;
    const { orderId, mode } = codeEntry;
    const order = allOrders.find((o) => o.id === orderId);
    if (!order) return;
    if (enteredCode !== order.uniqueCode) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("رمز خاطئ", "الرمز الذي أدخلته غير صحيح. حاول مرة أخرى.");
      return;
    }
    try {
      const newStatus: OrderStatus = mode === "deliver" ? "delivered" : "returned";
      const updated = allOrders.map((o) => o.id === orderId ? { ...o, status: newStatus } : o);
      await saveAllOrders(updated);
      setAllOrders(updated);
      setCodeEntry(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (mode === "deliver") {
        // المندوب: لا يُردّ له شيء (استلم كاش من الزبون)
        // التاجر: يستلم سعر المنتج + مبلغ التأمين
        const merchantCurrentBal = await getBalance(order.merchantId);
        const merchantNewBal = merchantCurrentBal + order.productPrice + INSURANCE_AMOUNT;
        await setBalance(order.merchantId, merchantNewBal);
        // إذا كان المستخدم الحالي هو التاجر نفسه، نحدّث الواجهة
        if (order.merchantId === currentUser) {
          setBalanceState(merchantNewBal);
        }
        Alert.alert(
          "✅ تم التوصيل بنجاح",
          `تم تأكيد توصيل "${order.productName}".\n\n` +
          `• تم إضافة ${formatCurrency(order.productPrice)} (سعر المنتج) إلى محفظة التاجر.\n` +
          `• تم إعادة تأمين ${formatCurrency(INSURANCE_AMOUNT)} للتاجر.\n\n` +
          `ملاحظة: استلمت ${formatCurrency(order.productPrice + order.deliveryPrice)} كاش من الزبون.`
        );
      } else {
        // الإرجاع: يُردّ سعر المنتج للمندوب + التأمين للتاجر
        const mandoubNewBal = balance + order.productPrice;
        await setBalance(currentUser, mandoubNewBal);
        setBalanceState(mandoubNewBal);

        const merchantCurrentBal = await getBalance(order.merchantId);
        const merchantNewBal = merchantCurrentBal + INSURANCE_AMOUNT;
        await setBalance(order.merchantId, merchantNewBal);

        Alert.alert(
          "↩️ تم الإرجاع",
          `تم تأكيد إرجاع "${order.productName}".\n\n` +
          `• تم إعادة ${formatCurrency(order.productPrice)} (ضمان المنتج) إلى محفظتك.\n` +
          `• تم إعادة تأمين ${formatCurrency(INSURANCE_AMOUNT)} إلى محفظة التاجر.`
        );
      }
    } catch { Alert.alert("خطأ", "حدث خطأ أثناء تحديث حالة الطلب"); }
  };

  const myOrders = allOrders.filter((o) => o.merchantId === currentUser);
  const marketOrders = allOrders.filter((o) => o.merchantId !== currentUser && o.status === "pending");
  const myDeliveries = allOrders.filter((o) => o.acceptedBy === currentUser);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const tabs: { key: ActiveTab; label: string; count: number; icon: string }[] = [
    { key: "my_orders", label: "طلباتي", count: myOrders.length, icon: "list" },
    { key: "market", label: "السوق", count: marketOrders.length, icon: "shopping-bag" },
    { key: "my_deliveries", label: "توصيلاتي", count: myDeliveries.length, icon: "truck" },
  ];

  const currentList =
    activeTab === "my_orders" ? myOrders : activeTab === "market" ? marketOrders : myDeliveries;

  const emptyMessages: Record<ActiveTab, { title: string; sub: string }> = {
    my_orders: { title: "لا توجد طلبات بعد", sub: "أنشئ طلب توصيل جديد للبدء" },
    market: { title: "السوق فارغ حالياً", sub: "لا توجد طلبات متاحة للقبول" },
    my_deliveries: { title: "لا توجد توصيلات", sub: "اذهب إلى السوق لقبول طلبات التوصيل" },
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={styles.header}>
        <View style={[styles.headerContent, { paddingTop: topPad + 10 }]}>
          <Pressable
            onPress={() => router.push("/profile")}
            style={styles.profileBtn}
          >
            <Ionicons name="person-circle-outline" size={22} color="rgba(255,255,255,0.8)" />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>مرحباً بك</Text>
            <Text style={styles.userName} numberOfLines={1}>{currentUser}</Text>
          </View>
          <View style={styles.avatarCircle}>
            <MaterialCommunityIcons name="lightning-bolt" size={22} color={C.accent} />
          </View>
        </View>

        <View style={styles.balanceCard}>
          <View style={styles.balanceTopRow}>
            <Pressable
              style={styles.walletBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/wallet"); }}
            >
              <MaterialCommunityIcons name="bank-transfer" size={14} color={C.accent} />
              <Text style={styles.walletBtnText}>إيداع / سحب</Text>
            </Pressable>
            <View style={styles.balanceRight}>
              <Text style={styles.balanceLabel}>الرصيد الحالي</Text>
              <Text style={styles.balanceValue}>
                {balance.toLocaleString("ar-IQ")}{" "}
                <Text style={styles.balanceCurrency}>د.ع</Text>
              </Text>
            </View>
            <View style={styles.balanceLeft}>
              <MaterialCommunityIcons name="wallet-outline" size={26} color={C.accent} />
            </View>
          </View>
          <View style={styles.balanceStats}>
            <View style={styles.bStat}>
              <Text style={[styles.bStatValue, { color: "#F59E0B" }]}>
                {myOrders.filter((o) => o.status === "pending").length}
              </Text>
              <Text style={styles.bStatLabel}>انتظار</Text>
            </View>
            <View style={styles.bStatDiv} />
            <View style={styles.bStat}>
              <Text style={[styles.bStatValue, { color: "#3B82F6" }]}>
                {myDeliveries.filter((o) => o.status === "in_delivery").length}
              </Text>
              <Text style={styles.bStatLabel}>قيد التوصيل</Text>
            </View>
            <View style={styles.bStatDiv} />
            <View style={styles.bStat}>
              <Text style={[styles.bStatValue, { color: C.success }]}>
                {myDeliveries.filter((o) => o.status === "delivered").length}
              </Text>
              <Text style={styles.bStatLabel}>مكتمل</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => { setActiveTab(tab.key); Haptics.selectionAsync(); }}
          >
            <Feather name={tab.icon as any} size={14} color={activeTab === tab.key ? C.primary : C.textSecondary} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
            {tab.count > 0 && (
              <View style={[styles.tabBadge, activeTab === tab.key && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === tab.key && styles.tabBadgeTextActive]}>{tab.count}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {activeTab === "my_orders" && (
        <View style={styles.listHeader}>
          <Pressable style={styles.addBtn} onPress={() => { setShowAddModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
            <LinearGradient colors={[C.accent, C.accentLight]} style={styles.addBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Feather name="plus" size={16} color={C.primary} />
              <Text style={styles.addBtnText}>طلب جديد</Text>
            </LinearGradient>
          </Pressable>
          <Text style={styles.listTitle}>طلباتي كتاجر</Text>
        </View>
      )}

      {activeTab === "market" && (
        <View style={styles.marketHeader}>
          <Text style={styles.marketBalanceNote}>
            رصيدك:{" "}
            <Text style={{ color: C.accent, fontFamily: "Cairo_700Bold" }}>
              {balance.toLocaleString("ar-IQ")} د.ع
            </Text>
          </Text>
          <Text style={styles.listTitle}>سوق الطلبات</Text>
        </View>
      )}

      {activeTab === "my_deliveries" && (
        <View style={[styles.listHeader, { justifyContent: "flex-end" }]}>
          <Text style={styles.listTitle}>توصيلاتي</Text>
        </View>
      )}

      <FlatList
        data={currentList}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
            {activeTab === "market" ? (
              <MarketOrderCard order={item} userBalance={balance} onAccept={() => handleAcceptOrder(item)} />
            ) : (
              <OrderCard
                order={item}
                currentUser={currentUser}
                onAction={
                  item.acceptedBy === currentUser && item.status === "in_delivery"
                    ? () => {
                        Alert.alert(`إدارة: ${item.productName}`, "اختر الإجراء المناسب", [
                          { text: "إلغاء", style: "cancel" },
                          { text: "تم الإرجاع للتاجر", onPress: () => setCodeEntry({ orderId: item.id, mode: "return" }) },
                          { text: "تم التوصيل للزبون", onPress: () => setCodeEntry({ orderId: item.id, mode: "deliver" }) },
                        ]);
                      }
                    : () => {}
                }
              />
            )}
          </Animated.View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name={activeTab === "market" ? "store-search-outline" : activeTab === "my_deliveries" ? "truck-outline" : "file-document-outline"}
              size={56}
              color={C.border}
            />
            <Text style={styles.emptyTitle}>{emptyMessages[activeTab].title}</Text>
            <Text style={styles.emptyText}>{emptyMessages[activeTab].sub}</Text>
          </View>
        }
      />

      <AddOrderModal
        visible={showAddModal}
        currentUser={currentUser}
        merchantBalance={balance}
        onClose={() => setShowAddModal(false)}
        onCreated={handleOrderCreated}
        onMerchantBalanceChanged={(newBal) => setBalanceState(newBal)}
      />

      {newOrderCode && (
        <CodeModal visible={!!newOrderCode} code={newOrderCode.code} productName={newOrderCode.name} onClose={() => setNewOrderCode(null)} />
      )}

      {codeEntry && (
        <EnterCodeModal visible={!!codeEntry} mode={codeEntry.mode} onClose={() => setCodeEntry(null)} onConfirm={handleConfirmCode} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  header: { paddingBottom: 16 },
  headerContent: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 14, gap: 12,
  },
  profileBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  headerText: { flex: 1, alignItems: "flex-end" },
  greeting: { fontSize: 11, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.6)", textAlign: "right" },
  userName: { fontSize: 15, fontFamily: "Cairo_600SemiBold", color: "#FFF", textAlign: "right" },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: "rgba(201,168,76,0.15)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(201,168,76,0.3)",
  },
  balanceCard: {
    marginHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: "rgba(201,168,76,0.2)",
    flexDirection: "column", gap: 10,
  },
  balanceTopRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  walletBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(201,168,76,0.18)",
    borderRadius: 10, paddingVertical: 7, paddingHorizontal: 11,
    borderWidth: 1, borderColor: "rgba(201,168,76,0.3)",
  },
  walletBtnText: {
    fontSize: 11, fontFamily: "Cairo_600SemiBold", color: C.accent,
  },
  balanceLeft: {
    width: 48, height: 48, borderRadius: 13,
    backgroundColor: "rgba(201,168,76,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  balanceRight: { flex: 1, alignItems: "flex-end" },
  balanceLabel: { fontSize: 11, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.6)", textAlign: "right" },
  balanceValue: { fontSize: 22, fontFamily: "Cairo_700Bold", color: C.accent, textAlign: "right" },
  balanceCurrency: { fontSize: 13, fontFamily: "Cairo_400Regular" },
  balanceStats: {
    flexDirection: "row", width: "100%", alignItems: "center",
    paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)",
  },
  bStat: { flex: 1, alignItems: "center", gap: 2 },
  bStatDiv: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.1)" },
  bStatValue: { fontSize: 18, fontFamily: "Cairo_700Bold", color: "#FFF" },
  bStatLabel: { fontSize: 10, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.5)", textAlign: "center" },
  tabBar: {
    flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10, gap: 8,
    backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 9, borderRadius: 11, gap: 5, backgroundColor: C.inputBg,
  },
  tabActive: { backgroundColor: C.primary },
  tabText: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  tabTextActive: { color: "#FFF" },
  tabBadge: {
    backgroundColor: C.border, borderRadius: 8,
    minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  tabBadgeActive: { backgroundColor: C.accent },
  tabBadgeText: { fontSize: 10, fontFamily: "Cairo_700Bold", color: C.textSecondary },
  tabBadgeTextActive: { color: C.primary },
  listHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  marketHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  listTitle: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text },
  marketBalanceNote: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textSecondary },
  addBtn: { borderRadius: 11, overflow: "hidden" },
  addBtnGradient: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 8, paddingHorizontal: 14, gap: 5,
  },
  addBtnText: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.primary },
  listContent: { paddingHorizontal: 14, gap: 10 },
  emptyState: { alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 60 },
  emptyTitle: { fontSize: 17, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "center" },
  emptyText: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "center" },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 14, gap: 10,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 8, paddingVertical: 5, paddingHorizontal: 9, alignSelf: "flex-start",
  },
  statusText: { fontSize: 11, fontFamily: "Cairo_600SemiBold" },
  newBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 8, paddingVertical: 5, paddingHorizontal: 9,
    backgroundColor: "rgba(201,168,76,0.12)", alignSelf: "flex-start",
  },
  newBadgeText: { fontSize: 11, fontFamily: "Cairo_600SemiBold", color: C.accent },
  cardHeaderRight: { flex: 1, alignItems: "flex-end", gap: 2 },
  productName: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  dateText: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted, textAlign: "right" },
  priceRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.inputBg, borderRadius: 10, padding: 10,
  },
  priceItem: { flex: 1, alignItems: "center", gap: 2 },
  priceDivider: { width: 1, height: 28, backgroundColor: C.border },
  priceLabel: { fontSize: 10, fontFamily: "Cairo_400Regular", color: C.textSecondary },
  priceValue: { fontSize: 13, fontFamily: "Cairo_700Bold", color: C.text },
  addrRow: { gap: 5 },
  addrItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  addrText: { flex: 1, fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "right" },
  codeRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "rgba(201,168,76,0.08)", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: "rgba(201,168,76,0.2)",
  },
  codeLabel: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  codePill: { flexDirection: "row", gap: 4 },
  codeChar: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.accent, letterSpacing: 2 },
  actionArea: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginTop: 2,
  },
  actionText: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.accent },
  noBalanceWarn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: C.dangerLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  noBalanceText: { flex: 1, fontSize: 11, fontFamily: "Cairo_400Regular", color: C.danger, textAlign: "right" },
  acceptBtn: { borderRadius: 12, overflow: "hidden" },
  acceptBtnDisabled: { opacity: 0.5 },
  acceptGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 12, gap: 6,
  },
  acceptText: { fontSize: 14, fontFamily: "Cairo_700Bold", color: C.primary },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: C.border,
    alignSelf: "center", marginTop: 12, marginBottom: 4,
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 17, fontFamily: "Cairo_700Bold", color: C.text },
  codeCard: {
    backgroundColor: C.card, borderRadius: 24, margin: 24, padding: 28,
    alignItems: "center", gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  codeIconCircle: {
    width: 72, height: 72, borderRadius: 20,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  codeTitle: { fontSize: 18, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "center" },
  codeProductName: { fontSize: 14, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "center" },
  codeNote: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "center", lineHeight: 20 },
  codeBox: {
    flexDirection: "row", gap: 8, backgroundColor: C.primary,
    borderRadius: 14, paddingHorizontal: 20, paddingVertical: 16, marginVertical: 4,
  },
  codeCharText: { fontSize: 26, fontFamily: "Cairo_700Bold", color: C.accent, letterSpacing: 4 },
  codeDoneBtn: {
    backgroundColor: C.primary, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 40, width: "100%", alignItems: "center",
  },
  codeDoneText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.accent },
  enterCodeSheet: {
    backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 16, alignItems: "center",
  },
  enterCodeIcon: {
    width: 64, height: 64, borderRadius: 18,
    alignItems: "center", justifyContent: "center", marginTop: 8,
  },
  enterCodeTitle: { fontSize: 20, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "center" },
  enterCodeSubtitle: {
    fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary,
    textAlign: "center", lineHeight: 22,
  },
  codeInput: {
    width: "100%", backgroundColor: C.inputBg, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 20,
    fontSize: 28, fontFamily: "Cairo_700Bold", color: C.text,
    textAlign: "center", letterSpacing: 8,
    borderWidth: 1.5, borderColor: C.border,
  },
  confirmBtn: {
    width: "100%", borderRadius: 14, paddingVertical: 15,
    alignItems: "center", justifyContent: "center", marginTop: 4,
  },
  confirmBtnText: { fontSize: 16, fontFamily: "Cairo_700Bold", color: "#FFF" },
});

const govStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "70%",
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: C.border,
    alignSelf: "center", marginTop: 12, marginBottom: 4,
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: C.inputBg, alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.text },
  list: { paddingVertical: 8, paddingHorizontal: 12 },
  item: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 13, paddingHorizontal: 14,
    borderRadius: 12, marginVertical: 2,
  },
  itemSelected: { backgroundColor: "rgba(201,168,76,0.1)" },
  itemText: { flex: 1, fontSize: 15, fontFamily: "Cairo_400Regular", color: C.text, textAlign: "right" },
  itemTextSelected: { fontFamily: "Cairo_600SemiBold", color: C.accent },
});

const formStyles = StyleSheet.create({
  formContent: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  fieldWrap: { gap: 6 },
  label: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.text, textAlign: "right" },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.inputBg, borderRadius: 11,
    borderWidth: 1.5, borderColor: "transparent",
    paddingHorizontal: 12, paddingVertical: 2, gap: 8,
  },
  inputFocused: { borderColor: C.accent, backgroundColor: "#FFF" },
  pickerRow: { paddingVertical: 0 },
  iconWrap: { width: 24, alignItems: "center" },
  input: {
    flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular",
    color: C.text, paddingVertical: 12, textAlign: "right",
  },
  addressGroup: { gap: 10, backgroundColor: C.inputBg, borderRadius: 14, padding: 14 },
  groupHeader: { borderRightWidth: 3, paddingRight: 10, alignSelf: "flex-end" },
  groupTitle: { fontSize: 13, fontFamily: "Cairo_700Bold", textAlign: "right" },
  priceRow: { flexDirection: "row", gap: 10 },
  codeNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(201,168,76,0.08)", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "rgba(201,168,76,0.2)",
  },
  codeNoteText: {
    flex: 1, fontSize: 12, fontFamily: "Cairo_400Regular",
    color: C.textSecondary, textAlign: "right", lineHeight: 20,
  },
  submitBtn: { borderRadius: 14, overflow: "hidden" },
  submitGradient: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "center", paddingVertical: 15, gap: 8,
  },
  submitText: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.primary },
});
