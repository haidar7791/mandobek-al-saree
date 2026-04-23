import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  Linking,
  Image,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { auth } from "../lib/firebase";
import {
  subscribeToServiceRequest,
  markRequestOnTheWay,
  updateRequestLiveLocation,
  completeServiceRequest,
  cancelServiceRequest,
  getArtisanByUserId,
  STATUS_LABELS,
  getSpecialtyLabel,
  buildChatId,
  calcDistanceKm,
  type ServiceRequest,
} from "../lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

function staticMapUrl(lat: number, lng: number, lat2?: number, lng2?: number) {
  // OpenStreetMap-based static map (no API key required)
  const markers = lat2 != null && lng2 != null
    ? `${lat},${lng},red|${lat2},${lng2},blue`
    : `${lat},${lng},red`;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=14&size=600x300&markers=${markers}`;
}

export default function ActiveOrderScreen() {
  const insets = useSafeAreaInsets();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [isArtisanSide, setIsArtisanSide] = useState(false);
  const [updating, setUpdating] = useState(false);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  useEffect(() => {
    if (!requestId) return;
    const user = auth.currentUser;
    if (!user) {
      router.replace("/login");
      return;
    }
    (async () => {
      const a = await getArtisanByUserId(user.uid);
      setIsArtisanSide(!!a);
    })();
    const unsub = subscribeToServiceRequest(requestId, (r) => setRequest(r));
    return unsub;
  }, [requestId]);

  // Auto-update artisan live location every 30s while on_the_way
  useEffect(() => {
    if (!isArtisanSide || !request || request.status !== "on_the_way") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        await updateRequestLiveLocation(request.id, {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        });
      } catch {}
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isArtisanSide, request?.status, request?.id]);

  const onTheWay = async () => {
    if (!request) return;
    setUpdating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let loc = null as { lat: number; lng: number } | null;
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
      await markRequestOnTheWay(request.id, loc);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("خطأ", "تعذّر تحديث الحالة");
    } finally {
      setUpdating(false);
    }
  };

  const complete = () => {
    if (!request) return;
    Alert.alert("إنهاء الخدمة", "هل تأكدت من إنجاز الخدمة؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "تأكيد",
        onPress: async () => {
          setUpdating(true);
          try {
            await completeServiceRequest(request.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          } catch {
            Alert.alert("خطأ", "تعذّر إنهاء الخدمة");
          } finally {
            setUpdating(false);
          }
        },
      },
    ]);
  };

  const cancel = () => {
    if (!request) return;
    Alert.alert("إلغاء الطلب", "هل تريد إلغاء هذا الطلب؟", [
      { text: "تراجع", style: "cancel" },
      {
        text: "إلغاء الطلب",
        style: "destructive",
        onPress: async () => {
          await cancelServiceRequest(request.id);
          router.back();
        },
      },
    ]);
  };

  const openMaps = (lat: number, lng: number) => {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
  };

  const callOther = () => {
    if (!request) return;
    if (isArtisanSide && request.clientPhone) {
      Linking.openURL(`tel:${request.clientPhone}`);
    }
  };

  const openChat = () => {
    const user = auth.currentUser;
    if (!user || !request) return;
    const otherUid = isArtisanSide ? request.clientId : request.artisanUserId || "";
    if (!otherUid) return;
    const chatId = buildChatId(user.uid, otherUid);
    const otherName = isArtisanSide ? request.clientName : request.artisanName;
    router.push({ pathname: "/chat", params: { chatId, otherName } });
  };

  if (!request) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ fontFamily: "Cairo_400Regular", color: C.textSecondary }}>
          جارٍ التحميل...
        </Text>
      </View>
    );
  }

  const live = request.artisanLiveLocation;
  const client = request.clientLocation;
  const distanceKm =
    live && client ? calcDistanceKm(live, client) : null;

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-right" size={22} color="#FFF" />
        </Pressable>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={styles.title}>تفاصيل الطلب</Text>
          <Text style={styles.sub}>{STATUS_LABELS[request.status]}</Text>
        </View>
        <View style={styles.iconBadge}>
          <Feather name="navigation" size={20} color={C.accent} />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 20 }]}>
        <View style={styles.peerCard}>
          <View style={styles.peerLeft}>
            <Text style={styles.peerLabel}>
              {isArtisanSide ? "العميل" : "صاحب الاختصاص"}
            </Text>
            <Text style={styles.peerName}>
              {isArtisanSide ? request.clientName : request.artisanName}
            </Text>
            <Text style={styles.specialty}>{getSpecialtyLabel(request.specialty)}</Text>
          </View>
          <View style={styles.peerActions}>
            {isArtisanSide && request.clientPhone ? (
              <Pressable style={styles.iconCircle} onPress={callOther}>
                <Feather name="phone" size={16} color="#FFF" />
              </Pressable>
            ) : null}
            <Pressable style={[styles.iconCircle, { backgroundColor: "#3B82F6" }]} onPress={openChat}>
              <Feather name="message-circle" size={16} color="#FFF" />
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>وصف المشكلة</Text>
          <Text style={styles.sectionBody}>{request.problemDescription}</Text>
        </View>

        {request.clientAddress ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>العنوان</Text>
            <Text style={styles.sectionBody}>{request.clientAddress}</Text>
          </View>
        ) : null}

        {/* Map preview */}
        {(live || client) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {request.status === "on_the_way" && live
                ? "الموقع المباشر لصاحب الاختصاص"
                : "موقع العميل"}
            </Text>
            {(() => {
              const center = live || client!;
              return (
                <Image
                  source={{ uri: staticMapUrl(center.lat, center.lng, client?.lat, client?.lng) }}
                  style={styles.mapImg}
                  resizeMode="cover"
                />
              );
            })()}
            {distanceKm != null && (
              <View style={styles.distancePill}>
                <Feather name="navigation" size={13} color={C.accent} />
                <Text style={styles.distanceText}>
                  {distanceKm < 1
                    ? `${Math.round(distanceKm * 1000)}م من العميل`
                    : `${distanceKm.toFixed(1)}كم من العميل`}
                </Text>
              </View>
            )}
            <View style={styles.mapBtnRow}>
              {client && (
                <Pressable style={styles.mapBtn} onPress={() => openMaps(client.lat, client.lng)}>
                  <Feather name="map-pin" size={14} color={C.accent} />
                  <Text style={styles.mapBtnText}>موقع العميل</Text>
                </Pressable>
              )}
              {live && (
                <Pressable
                  style={[styles.mapBtn, { backgroundColor: "rgba(34,197,94,0.12)" }]}
                  onPress={() => openMaps(live.lat, live.lng)}
                >
                  <Feather name="navigation" size={14} color="#22C55E" />
                  <Text style={[styles.mapBtnText, { color: "#22C55E" }]}>موقع صاحب الاختصاص</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* Action buttons */}
        {isArtisanSide ? (
          <View style={styles.actions}>
            {request.status === "accepted" && (
              <Pressable style={[styles.bigBtn, styles.bigBtnGreen]} onPress={onTheWay} disabled={updating}>
                <Feather name="navigation" size={18} color="#FFF" />
                <Text style={styles.bigBtnText}>أنا في الطريق</Text>
              </Pressable>
            )}
            {(request.status === "on_the_way" || request.status === "in_progress") && (
              <Pressable style={[styles.bigBtn, styles.bigBtnBlue]} onPress={complete} disabled={updating}>
                <Feather name="check-circle" size={18} color="#FFF" />
                <Text style={styles.bigBtnText}>إنهاء الخدمة</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.actions}>
            {(request.status === "pending" || request.status === "accepted") && (
              <Pressable style={[styles.bigBtn, styles.bigBtnRed]} onPress={cancel}>
                <Feather name="x-circle" size={18} color="#FFF" />
                <Text style={styles.bigBtnText}>إلغاء الطلب</Text>
              </Pressable>
            )}
          </View>
        )}
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
  sub: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.accent },
  iconBadge: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(201,168,76,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  scroll: { padding: 14, gap: 14 },
  peerCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: C.card, borderRadius: 14, padding: 14,
  },
  peerLeft: { flex: 1, alignItems: "flex-end", gap: 3 },
  peerLabel: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted },
  peerName: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.text },
  specialty: {
    fontSize: 11, fontFamily: "Cairo_600SemiBold", color: C.accent,
    backgroundColor: "rgba(201,168,76,0.12)", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2, marginTop: 4,
  },
  peerActions: { flexDirection: "row", gap: 8 },
  iconCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
  },
  section: { gap: 8 },
  sectionTitle: { fontSize: 14, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  sectionBody: {
    fontSize: 13, fontFamily: "Cairo_400Regular", color: C.text,
    textAlign: "right", lineHeight: 22,
    backgroundColor: C.card, borderRadius: 12, padding: 12,
  },
  mapImg: {
    width: "100%", height: 180, borderRadius: 12, backgroundColor: C.inputBg,
  },
  distancePill: {
    alignSelf: "flex-end",
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(201,168,76,0.12)", borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  distanceText: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.accent },
  mapBtnRow: { flexDirection: "row", gap: 8 },
  mapBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "rgba(201,168,76,0.12)", borderRadius: 10, paddingVertical: 9,
  },
  mapBtnText: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.accent },
  actions: { gap: 10, marginTop: 6 },
  bigBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 14,
  },
  bigBtnGreen: { backgroundColor: "#22C55E" },
  bigBtnBlue: { backgroundColor: "#3B82F6" },
  bigBtnRed: { backgroundColor: "#EF4444" },
  bigBtnText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: "#FFF" },
});
