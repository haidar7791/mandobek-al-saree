import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { auth } from "../lib/firebase";
import {
  PROMOTION_PLANS,
  promoteArtisan,
  getArtisanByUserId,
  getBalance,
  isFeaturedActive,
  type ArtisanProfile,
  type PromotionPlan,
} from "../lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ar-IQ", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PromoteScreen() {
  const insets = useSafeAreaInsets();
  const [artisan, setArtisan] = useState<ArtisanProfile | null>(null);
  const [balance, setBalance] = useState(0);
  const [selected, setSelected] = useState<string>(PROMOTION_PLANS[1].id);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const load = async () => {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/login");
      return;
    }
    const [a, b] = await Promise.all([
      getArtisanByUserId(user.uid),
      getBalance(user.uid),
    ]);
    setArtisan(a);
    setBalance(b);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const plan: PromotionPlan = PROMOTION_PLANS.find((p) => p.id === selected) || PROMOTION_PLANS[0];
  const featured = artisan ? isFeaturedActive(artisan) : false;

  const handlePay = () => {
    if (!artisan) {
      Alert.alert("خطأ", "يجب أن يكون لديك ملف حرفي مكتمل أولاً");
      return;
    }
    if (balance < plan.cost) {
      Alert.alert(
        "رصيد غير كافٍ",
        `سعر الباقة ${plan.cost.toLocaleString("ar-IQ")} د.ع بينما رصيدك ${balance.toLocaleString("ar-IQ")} د.ع. يرجى شحن المحفظة أولاً.`,
        [
          { text: "إلغاء", style: "cancel" },
          { text: "شحن المحفظة", onPress: () => router.push("/wallet" as any) },
        ]
      );
      return;
    }
    Alert.alert(
      "تأكيد الدفع",
      `سيتم خصم ${plan.cost.toLocaleString("ar-IQ")} د.ع لتفعيل الترويج لمدة ${plan.label}.`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "تأكيد الدفع",
          onPress: async () => {
            const user = auth.currentUser;
            if (!user || !artisan) return;
            setPaying(true);
            try {
              const result = await promoteArtisan(user.uid, artisan.id, plan.days, plan.cost);
              if (result.ok) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert(
                  "تم تفعيل الترويج 🎉",
                  `حسابك الآن يظهر في أعلى نتائج البحث حتى ${formatExpiry(result.until)}.`
                );
                await load();
              } else if (result.reason === "no_balance") {
                Alert.alert("رصيد غير كافٍ", "تم تحديث رصيدك. حاول مرة أخرى.");
                await load();
              } else {
                Alert.alert("خطأ", "تعذّر تفعيل الترويج، حاول لاحقاً");
              }
            } finally {
              setPaying(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ fontFamily: "Cairo_400Regular", color: C.textSecondary }}>
          جارٍ التحميل...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={22} color="#FFF" />
        </Pressable>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={styles.title}>روّج لحسابك</Text>
          <Text style={styles.sub}>اظهر في أعلى نتائج البحث</Text>
        </View>
        <View style={styles.iconBadge}>
          <Ionicons name="rocket" size={20} color={C.accent} />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 20 }]}>
        {featured && artisan?.featuredUntil && (
          <View style={styles.activeCard}>
            <View style={styles.activeIcon}>
              <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={styles.activeTitle}>الترويج مُفعّل ✓</Text>
              <Text style={styles.activeSub}>
                حتى: {formatExpiry(artisan.featuredUntil)}
              </Text>
              <Text style={styles.activeNote}>يمكنك التمديد بشراء باقة جديدة.</Text>
            </View>
          </View>
        )}

        <View style={styles.balanceCard}>
          <Feather name="credit-card" size={18} color={C.accent} />
          <Text style={styles.balanceLabel}>رصيد المحفظة</Text>
          <Text style={styles.balanceValue}>{balance.toLocaleString("ar-IQ")} د.ع</Text>
        </View>

        <View style={styles.benefits}>
          <Text style={styles.benefitsTitle}>ماذا يقدم الترويج؟</Text>
          <View style={styles.benefitItem}>
            <Ionicons name="trending-up" size={16} color={C.accent} />
            <Text style={styles.benefitText}>ظهور حسابك في أعلى قائمة الحرفيين</Text>
          </View>
          <View style={styles.benefitItem}>
            <Ionicons name="star" size={16} color={C.accent} />
            <Text style={styles.benefitText}>شارة "مميز" تظهر بجانب اسمك</Text>
          </View>
          <View style={styles.benefitItem}>
            <Ionicons name="people" size={16} color={C.accent} />
            <Text style={styles.benefitText}>زيادة في عدد الطلبات والمشاهدات</Text>
          </View>
        </View>

        <Text style={styles.plansTitle}>اختر الباقة</Text>
        <View style={styles.plans}>
          {PROMOTION_PLANS.map((p) => {
            const active = selected === p.id;
            return (
              <Pressable
                key={p.id}
                style={[styles.plan, active && styles.planActive]}
                onPress={() => { Haptics.selectionAsync(); setSelected(p.id); }}
              >
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active && <View style={styles.radioDot} />}
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={styles.planLabel}>{p.label}</Text>
                  <Text style={styles.planCost}>{p.cost.toLocaleString("ar-IQ")} د.ع</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={[styles.payBtn, paying && { opacity: 0.6 }]}
          onPress={handlePay}
          disabled={paying}
        >
          <LinearGradient colors={[C.accent, C.accentLight]} style={styles.payGrad}>
            <Text style={styles.payText}>
              {paying ? "جارٍ الدفع..." : `تفعيل الترويج (${plan.cost.toLocaleString("ar-IQ")} د.ع)`}
            </Text>
            <Feather name="zap" size={16} color={C.primary} />
          </LinearGradient>
        </Pressable>

        <Text style={styles.disclaimer}>
          سيتم خصم المبلغ من رصيد محفظتك مباشرة. لا يمكن استرجاع المبلغ بعد التفعيل.
        </Text>
      </ScrollView>
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
  scroll: { padding: 14, gap: 16 },
  activeCard: {
    flexDirection: "row", gap: 12, alignItems: "center",
    backgroundColor: "rgba(34,197,94,0.1)", borderColor: "rgba(34,197,94,0.3)",
    borderWidth: 1, borderRadius: 14, padding: 14,
  },
  activeIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(34,197,94,0.18)", alignItems: "center", justifyContent: "center",
  },
  activeTitle: { fontSize: 14, fontFamily: "Cairo_700Bold", color: "#16A34A" },
  activeSub: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.text, marginTop: 2 },
  activeNote: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textSecondary, marginTop: 2 },
  balanceCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.card, borderRadius: 12, padding: 14,
  },
  balanceLabel: { flex: 1, fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.textSecondary, textAlign: "right" },
  balanceValue: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.text },
  benefits: {
    backgroundColor: C.card, borderRadius: 14, padding: 14, gap: 10,
  },
  benefitsTitle: { fontSize: 14, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  benefitItem: {
    flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "flex-end",
  },
  benefitText: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.text, textAlign: "right" },
  plansTitle: { fontSize: 14, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  plans: { gap: 8 },
  plan: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.card, borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: "transparent",
  },
  planActive: { borderColor: C.accent, backgroundColor: "rgba(201,168,76,0.08)" },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: C.border,
    alignItems: "center", justifyContent: "center",
  },
  radioActive: { borderColor: C.accent },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.accent },
  planLabel: { fontSize: 14, fontFamily: "Cairo_700Bold", color: C.text },
  planCost: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.accent, marginTop: 2 },
  payBtn: { borderRadius: 14, overflow: "hidden", marginTop: 4 },
  payGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14,
  },
  payText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.primary },
  disclaimer: {
    fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted,
    textAlign: "center", marginTop: 4, lineHeight: 18,
  },
});
