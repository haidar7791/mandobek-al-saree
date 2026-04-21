import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  TextInput,
  Modal,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Feather, Ionicons, FontAwesome } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { auth } from "../lib/firebase";
import {
  getArtisanById,
  getReviews,
  addReview,
  createServiceRequest,
  getUserProfile,
  calcDistanceKm,
  buildChatId,
  getSpecialtyLabel,
  type ArtisanProfile,
  type Review,
  type GeoLocation,
} from "../lib/db_logic";
import Colors from "@/constants/colors";

const C = Colors.light;

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={() => { Haptics.selectionAsync(); onChange(i); }}>
          <Ionicons name={i <= value ? "star" : "star-outline"} size={28} color={i <= value ? "#F59E0B" : C.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

function StarDisplay({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= Math.round(rating) ? "star" : "star-outline"}
          size={size}
          color={i <= Math.round(rating) ? "#F59E0B" : C.textMuted}
        />
      ))}
    </View>
  );
}

function ReviewCard({ review, index }: { review: Review; index: number }) {
  const date = new Date(review.createdAt);
  const formatted = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()} style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <Text style={styles.reviewDate}>{formatted}</Text>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={styles.reviewAuthor}>{review.clientName}</Text>
          <StarDisplay rating={review.rating} />
        </View>
        <View style={styles.reviewAvatar}>
          <Text style={styles.reviewAvatarText}>{review.clientName[0]}</Text>
        </View>
      </View>
      {review.comment ? (
        <Text style={styles.reviewComment}>{review.comment}</Text>
      ) : null}
    </Animated.View>
  );
}

export default function ArtisanProfileScreen() {
  const insets = useSafeAreaInsets();
  const { artisanId } = useLocalSearchParams<{ artisanId: string }>();

  const [artisan, setArtisan] = useState<ArtisanProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [userLocation, setUserLocation] = useState<GeoLocation | null>(null);
  const [userName, setUserName] = useState("مستخدم");
  const [loading, setLoading] = useState(true);

  const [bookingModal, setBookingModal] = useState(false);
  const [problemDesc, setProblemDesc] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);

  const [reviewModal, setReviewModal] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const loadData = useCallback(async () => {
    if (!artisanId) return;
    try {
      const user = auth.currentUser;
      if (user) {
        const profile = await getUserProfile(user.uid);
        if (profile) setUserName(profile.name || "مستخدم");
        if (profile?.location) setUserLocation(profile.location);
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }

      const [artisanData, reviewData] = await Promise.all([
        getArtisanById(artisanId),
        getReviews(artisanId),
      ]);
      setArtisan(artisanData);
      setReviews(reviewData);
    } catch (err) {
      console.error("loadData error:", err);
    } finally {
      setLoading(false);
    }
  }, [artisanId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const handleCall = () => {
    if (!artisan?.phone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${artisan.phone}`);
  };

  const handleWhatsApp = () => {
    if (!artisan?.phone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const phone = artisan.phone.replace(/^0/, "964").replace(/\s+/g, "");
    const msg = encodeURIComponent(`مرحباً، أريد الاستفسار عن خدمة ${getSpecialtyLabel(artisan.specialty)} عبر تطبيق سند`);
    Linking.openURL(`https://wa.me/${phone}?text=${msg}`);
  };

  const handleChat = () => {
    const user = auth.currentUser;
    if (!user || !artisan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const chatId = buildChatId(user.uid, artisan.userId);
    router.push({ pathname: "/chat", params: { chatId, otherName: artisan.name } });
  };

  const handleBooking = async () => {
    const user = auth.currentUser;
    if (!user || !artisan) return;
    if (user.uid === artisan.userId) {
      Alert.alert("غير مسموح", "لا يمكنك إرسال طلب خدمة لنفسك");
      setBookingModal(false);
      return;
    }
    if (!problemDesc.trim()) {
      Alert.alert("خطأ", "يرجى وصف المشكلة التي تحتاج مساعدة فيها");
      return;
    }
    setBookingLoading(true);
    try {
      const userProfile = await getUserProfile(user.uid);
      await createServiceRequest({
        clientId: user.uid,
        clientName: userName,
        clientPhone: userProfile?.phone || "",
        artisanId: artisan.id,
        artisanName: artisan.name,
        specialty: artisan.specialty,
        problemDescription: problemDesc.trim(),
        clientLocation: userLocation,
        clientAddress: clientAddress.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBookingModal(false);
      setProblemDesc("");
      setClientAddress("");
      Alert.alert("تم الإرسال", "تم إرسال طلب خدمتك للحرفي، سيتواصل معك قريباً");
    } catch (err) {
      Alert.alert("خطأ", "حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مجدداً");
    } finally {
      setBookingLoading(false);
    }
  };

  const handleAddReview = async () => {
    const user = auth.currentUser;
    if (!user || !artisan) return;
    if (user.uid === artisan.userId) {
      Alert.alert("غير مسموح", "لا يمكنك تقييم نفسك");
      setReviewModal(false);
      return;
    }
    setReviewLoading(true);
    try {
      await addReview({
        artisanId: artisan.id,
        clientId: user.uid,
        clientName: userName,
        rating: reviewRating,
        comment: reviewComment.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReviewModal(false);
      setReviewComment("");
      setReviewRating(5);
      await loadData();
      Alert.alert("شكراً", "تم إضافة تقييمك بنجاح");
    } catch {
      Alert.alert("خطأ", "حدث خطأ أثناء إضافة التقييم");
    } finally {
      setReviewLoading(false);
    }
  };

  const distance =
    userLocation && artisan?.location
      ? calcDistanceKm(userLocation, artisan.location)
      : null;

  if (loading || !artisan) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ fontFamily: "Cairo_400Regular", color: C.textSecondary }}>جارٍ التحميل...</Text>
      </View>
    );
  }

  const initials = artisan.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const isOwnProfile = !!auth.currentUser && auth.currentUser.uid === artisan.userId;

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={[styles.heroGrad, { paddingTop: topPad + 8 }]}>
        <View style={styles.heroNav}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="chevron-right" size={22} color="#FFF" />
          </Pressable>
          {!isOwnProfile && (
            <Pressable style={styles.reviewNavBtn} onPress={() => setReviewModal(true)}>
              <Ionicons name="star" size={16} color={C.accent} />
              <Text style={styles.reviewNavText}>تقييم</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.heroContent}>
          <View style={styles.heroPhotoWrap}>
            {artisan.photoUri ? (
              <Image source={{ uri: artisan.photoUri }} style={styles.heroPhoto} />
            ) : (
              <View style={styles.heroInitials}>
                <Text style={styles.heroInitialsText}>{initials}</Text>
              </View>
            )}
            <View style={[styles.heroAvailDot, artisan.isAvailable ? styles.dotOnline : styles.dotOffline]} />
          </View>

          <Text style={styles.heroName}>{artisan.name}</Text>
          <View style={styles.specialtyPill}>
            <Text style={styles.specialtyPillText}>{getSpecialtyLabel(artisan.specialty)}</Text>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.statItem}>
              <Text style={styles.statVal}>
                {artisan.rating > 0 ? artisan.rating.toFixed(1) : "-"}
              </Text>
              <Text style={styles.statLabel}>التقييم</Text>
            </View>
            <View style={styles.statDiv} />
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{artisan.reviewCount}</Text>
              <Text style={styles.statLabel}>تقييم</Text>
            </View>
            <View style={styles.statDiv} />
            <View style={styles.statItem}>
              <Text style={styles.statVal}>
                {distance !== null
                  ? distance < 1
                    ? `${Math.round(distance * 1000)}م`
                    : `${distance.toFixed(1)}كم`
                  : "-"}
              </Text>
              <Text style={styles.statLabel}>البعد</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.actionRow}>
        <Pressable style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={handleCall}>
          <Feather name="phone" size={20} color="#FFF" />
          <Text style={styles.actionBtnText}>اتصال</Text>
        </Pressable>

        <Pressable style={[styles.actionBtn, styles.actionBtnWhatsApp]} onPress={handleWhatsApp}>
          <FontAwesome name="whatsapp" size={20} color="#FFF" />
          <Text style={styles.actionBtnText}>واتساب</Text>
        </Pressable>

        <Pressable style={[styles.actionBtn, styles.actionBtnChat]} onPress={handleChat}>
          <Feather name="message-circle" size={20} color="#FFF" />
          <Text style={styles.actionBtnText}>دردشة</Text>
        </Pressable>
      </View>

      <Pressable style={styles.bookBtn} onPress={() => setBookingModal(true)}>
        <LinearGradient colors={[C.accent, C.accentLight]} style={styles.bookBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <Text style={styles.bookBtnText}>طلب الخدمة الآن</Text>
          <Feather name="arrow-left" size={18} color={C.primary} />
        </LinearGradient>
      </Pressable>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {artisan.bio ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>عن الحرفي</Text>
            <Text style={styles.bioText}>{artisan.bio}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            {isOwnProfile ? (
              <View style={styles.selfRatingBadge}>
                <Feather name="user" size={12} color={C.textMuted} />
                <Text style={styles.selfRatingText}>هذه صفحتك الشخصية</Text>
              </View>
            ) : (
              <Pressable style={styles.addReviewBtn} onPress={() => setReviewModal(true)}>
                <Feather name="plus" size={14} color={C.accent} />
                <Text style={styles.addReviewText}>أضف تقييم</Text>
              </Pressable>
            )}
            <Text style={styles.sectionTitle}>التقييمات والآراء</Text>
          </View>

          {artisan.reviewCount > 0 && (
            <View style={styles.ratingOverview}>
              <StarDisplay rating={artisan.rating} size={20} />
              <Text style={styles.ratingBig}>{artisan.rating.toFixed(1)}</Text>
              <Text style={styles.ratingOf}>/ 5</Text>
              <Text style={styles.ratingCount}>({artisan.reviewCount} تقييم)</Text>
            </View>
          )}

          {reviews.length === 0 ? (
            <View style={styles.noReviews}>
              <Ionicons name="star-outline" size={32} color={C.textMuted} />
              <Text style={styles.noReviewsText}>لا توجد تقييمات بعد</Text>
              <Text style={styles.noReviewsSub}>كن أول من يقيّم هذا الحرفي</Text>
            </View>
          ) : (
            reviews.map((r, i) => <ReviewCard key={r.id} review={r} index={i} />)
          )}
        </View>
      </ScrollView>

      <Modal visible={bookingModal} transparent animationType="slide" onRequestClose={() => setBookingModal(false)}>
        <View style={modalStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setBookingModal(false)} />
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <View style={modalStyles.header}>
              <Pressable onPress={() => setBookingModal(false)} style={modalStyles.closeBtn}>
                <Feather name="x" size={18} color={C.textSecondary} />
              </Pressable>
              <Text style={modalStyles.title}>طلب خدمة من {artisan.name}</Text>
            </View>

            <ScrollView contentContainerStyle={modalStyles.body} keyboardShouldPersistTaps="handled">
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>وصف المشكلة أو الخدمة المطلوبة</Text>
                <TextInput
                  style={styles.textArea}
                  placeholder="مثال: تسريب مياه في المطبخ..."
                  placeholderTextColor={C.textMuted}
                  value={problemDesc}
                  onChangeText={setProblemDesc}
                  multiline
                  numberOfLines={4}
                  textAlign="right"
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>عنوانك (اختياري)</Text>
                <TextInput
                  style={styles.inputField}
                  placeholder="مثال: الكرادة، شارع فلسطين"
                  placeholderTextColor={C.textMuted}
                  value={clientAddress}
                  onChangeText={setClientAddress}
                  textAlign="right"
                />
              </View>

              {userLocation && (
                <View style={styles.locationNote}>
                  <Feather name="map-pin" size={14} color={C.accent} />
                  <Text style={styles.locationNoteText}>سيتم إرسال موقعك الجغرافي تلقائياً للحرفي</Text>
                </View>
              )}

              <Pressable
                style={[modalStyles.sendBtn, bookingLoading && { opacity: 0.6 }]}
                onPress={handleBooking}
                disabled={bookingLoading}
              >
                <LinearGradient colors={[C.accent, C.accentLight]} style={modalStyles.sendGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Text style={modalStyles.sendText}>{bookingLoading ? "جارٍ الإرسال..." : "إرسال الطلب"}</Text>
                  <Feather name="send" size={16} color={C.primary} />
                </LinearGradient>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={reviewModal} transparent animationType="slide" onRequestClose={() => setReviewModal(false)}>
        <View style={modalStyles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setReviewModal(false)} />
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <View style={modalStyles.header}>
              <Pressable onPress={() => setReviewModal(false)} style={modalStyles.closeBtn}>
                <Feather name="x" size={18} color={C.textSecondary} />
              </Pressable>
              <Text style={modalStyles.title}>تقييم {artisan.name}</Text>
            </View>

            <ScrollView contentContainerStyle={modalStyles.body} keyboardShouldPersistTaps="handled">
              <StarPicker value={reviewRating} onChange={setReviewRating} />
              <Text style={styles.ratingLabel}>
                {["", "ضعيف", "مقبول", "جيد", "جيد جداً", "ممتاز"][reviewRating]}
              </Text>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>تعليقك (اختياري)</Text>
                <TextInput
                  style={styles.textArea}
                  placeholder="شاركنا تجربتك مع هذا الحرفي..."
                  placeholderTextColor={C.textMuted}
                  value={reviewComment}
                  onChangeText={setReviewComment}
                  multiline
                  numberOfLines={3}
                  textAlign="right"
                  textAlignVertical="top"
                />
              </View>

              <Pressable
                style={[modalStyles.sendBtn, reviewLoading && { opacity: 0.6 }]}
                onPress={handleAddReview}
                disabled={reviewLoading}
              >
                <LinearGradient colors={[C.accent, C.accentLight]} style={modalStyles.sendGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Text style={modalStyles.sendText}>{reviewLoading ? "جارٍ الإرسال..." : "إرسال التقييم"}</Text>
                  <Ionicons name="star" size={16} color={C.primary} />
                </LinearGradient>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  heroGrad: { paddingBottom: 20, paddingHorizontal: 20 },
  heroNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 16,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  reviewNavBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(201,168,76,0.15)",
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
  },
  reviewNavText: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.accent },
  heroContent: { alignItems: "center", gap: 8 },
  heroPhotoWrap: { position: "relative" },
  heroPhoto: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: C.accent },
  heroInitials: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: "rgba(201,168,76,0.2)",
    borderWidth: 3, borderColor: C.accent,
    alignItems: "center", justifyContent: "center",
  },
  heroInitialsText: { fontSize: 30, fontFamily: "Cairo_700Bold", color: C.accent },
  heroAvailDot: {
    position: "absolute", bottom: 4, right: 4,
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2.5, borderColor: "#162452",
  },
  dotOnline: { backgroundColor: "#22C55E" },
  dotOffline: { backgroundColor: "#9CA3AF" },
  heroName: { fontSize: 22, fontFamily: "Cairo_700Bold", color: "#FFF", textAlign: "center" },
  specialtyPill: {
    backgroundColor: "rgba(201,168,76,0.2)", borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 5,
  },
  specialtyPillText: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.accent },
  heroStats: { flexDirection: "row", alignItems: "center", gap: 0, marginTop: 4 },
  statItem: { alignItems: "center", paddingHorizontal: 20, gap: 2 },
  statVal: { fontSize: 18, fontFamily: "Cairo_700Bold", color: "#FFF" },
  statLabel: { fontSize: 11, fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.6)" },
  statDiv: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.2)" },
  actionRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderRadius: 14,
  },
  actionBtnPrimary: { backgroundColor: C.primary },
  actionBtnWhatsApp: { backgroundColor: "#25D366" },
  actionBtnChat: { backgroundColor: "#3B82F6" },
  actionBtnText: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: "#FFF" },
  bookBtn: { marginHorizontal: 16, marginBottom: 10, borderRadius: 14, overflow: "hidden" },
  bookBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 14, gap: 10,
  },
  bookBtnText: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.primary },
  scrollContent: { padding: 16, gap: 16 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addReviewBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(201,168,76,0.1)", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  addReviewText: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.accent },
  selfRatingBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(156,163,175,0.12)", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  selfRatingText: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted },
  bioText: {
    fontSize: 14, fontFamily: "Cairo_400Regular", color: C.textSecondary,
    textAlign: "right", lineHeight: 22,
    backgroundColor: C.card, borderRadius: 12, padding: 14,
  },
  ratingOverview: {
    flexDirection: "row", alignItems: "center", gap: 8,
    justifyContent: "flex-end",
    backgroundColor: C.card, borderRadius: 12, padding: 14,
  },
  ratingBig: { fontSize: 28, fontFamily: "Cairo_700Bold", color: C.text },
  ratingOf: { fontSize: 16, fontFamily: "Cairo_400Regular", color: C.textMuted },
  ratingCount: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textMuted },
  noReviews: { alignItems: "center", gap: 8, paddingVertical: 24 },
  noReviewsText: { fontSize: 15, fontFamily: "Cairo_600SemiBold", color: C.text },
  noReviewsSub: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary },
  reviewCard: {
    backgroundColor: C.card, borderRadius: 14, padding: 14, gap: 8,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  reviewAvatar: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
  },
  reviewAvatarText: { fontSize: 14, fontFamily: "Cairo_700Bold", color: C.accent },
  reviewAuthor: { fontSize: 13, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  reviewDate: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted },
  reviewComment: {
    fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary,
    textAlign: "right", lineHeight: 20,
  },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.text, textAlign: "right" },
  textArea: {
    backgroundColor: C.inputBg, borderRadius: 12, padding: 14,
    fontSize: 14, fontFamily: "Cairo_400Regular", color: C.text,
    minHeight: 100, textAlign: "right",
  },
  inputField: {
    backgroundColor: C.inputBg, borderRadius: 12, padding: 14,
    fontSize: 14, fontFamily: "Cairo_400Regular", color: C.text,
  },
  locationNote: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(201,168,76,0.08)", borderRadius: 10, padding: 10,
  },
  locationNoteText: { flex: 1, fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "right" },
  ratingLabel: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.accent, textAlign: "center" },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: C.border,
    alignSelf: "center", marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 20,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, gap: 10,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: C.inputBg,
    alignItems: "center", justifyContent: "center",
  },
  title: { flex: 1, fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  body: { padding: 20, gap: 16 },
  sendBtn: { borderRadius: 14, overflow: "hidden", marginTop: 8 },
  sendGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 14, gap: 10,
  },
  sendText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.primary },
});
