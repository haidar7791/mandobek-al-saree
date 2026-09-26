import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApproximateLocationByIP } from "../lib/location";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
  Image,
  KeyboardAvoidingView,
  RefreshControl,
  ScrollView,
  Alert,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  TextInput,
  Dimensions,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Feather, Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { auth } from "../lib/firebase";
import { Video, ResizeMode } from "expo-av";
import { ShareModal } from "@/components/ShareModal";
import ReportButton from "@/components/ReportButton";
import {
  subscribeToActiveStories,
  subscribeToMyStories,
  type Story,
  type StoryGroup,
} from "@/lib/stories_logic";
import {
  getArtisans,
  getUserProfile,
  calcDistanceKm,
  type ArtisanProfile,
  type ServiceCategory,
  type GeoLocation,
  type Product,
  type ProductMedia,
  getSpecialtyLabel,
  getCategoryForSpecialty,
  ALL_SPECIALTIES,
  isFeaturedActive,
  subscribeToUserChatLastAts,
  type ChatLastActivity,
  fetchProductsOnce,
  deleteProduct,
  getIsProductLiked,
  type FoodItem,
  fetchFoodItems,
  getIsFoodLiked,
  toggleFoodLike,
  unlikeProduct,
  likeProduct,
  rankProductsForFeed,
  subscribeToBuyerProductOrders,
  type ProductOrder,
  type HomeFeedPost,
  getHomeFeedPosts,
  getPostComments,
  type HomeFeedComment,
  uploadProfilePostMedia,
  addProfilePost,
  removeHomeFeedPost,
  getIsHomePostLiked,
  toggleProfilePostLike,
  addProfilePostComment,
  togglePostCommentLike,
  replyToPostComment,
  uploadCommentImage,
  updateProfilePostComment,
  deleteProfilePostComment,
  getIsFollowing,
  followArtisan,
  unfollowArtisan,
} from "../lib/db_logic";
// Note: getPromotedArtisans removed — promoted artisans now bubble to top of main list
import Colors from "@/constants/colors";
import {
  registerForPushNotifications,
  addNotificationTapListener,
} from "../lib/push_notifications";
import { useProfileCheck } from "@/hooks/useProfileCheck";
import { createActivityNotification, subscribeToNotifications } from "@/lib/notifications";
import ProfileAvatar from "@/components/ProfileAvatar";
import ProfilePostComposerModal, {
  type ProfilePostDraftMedia,
} from "@/components/ProfilePostComposerModal";
import ProductMediaCarousel, { normalizeProductMedia } from "@/components/ProductMediaCarousel";
import ProductPurchaseButton from "@/components/ProductPurchaseButton";
import { useVideoAudio } from "@/lib/video-audio-context";
import { navigateWithHomeBase } from "@/lib/navigation";

const getRelativeTime = (dateValue: string | number | Date) => {
  const date = new Date(dateValue).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - date);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;

  if (diff < minute) return "منذ لحظات";
  if (diff < hour) {
    const n = Math.floor(diff / minute);
    return `منذ ${n} ${n === 1 ? "دقيقة" : n === 2 ? "دقيقتين" : n < 11 ? "دقائق" : "دقيقة"}`;
  }
  if (diff < day) {
    const n = Math.floor(diff / hour);
    return `منذ ${n} ${n === 1 ? "ساعة" : n === 2 ? "ساعتين" : n < 11 ? "ساعات" : "ساعة"}`;
  }
  if (diff < month) {
    const n = Math.floor(diff / day);
    return `منذ ${n} ${n === 1 ? "يوم" : n === 2 ? "يومين" : n < 11 ? "أيام" : "يوم"}`;
  }
  if (diff < year) {
    const n = Math.floor(diff / month);
    return `منذ ${n} ${n === 1 ? "شهر" : n === 2 ? "شهرين" : n < 11 ? "أشهر" : "شهر"}`;
  }

  const n = Math.floor(diff / year);
  return `منذ ${n} ${n === 1 ? "سنة" : n === 2 ? "سنتين" : n < 11 ? "سنوات" : "سنة"}`;
};

const C = Colors.light;
const STORY_PUBLISH_PROGRESS_KEY = (userId: string) => `@forus:storyPublishProgress:${userId}`;
const HOME_PUBLISH_PROGRESS_KEY = (userId: string) => `@forus:homePublishProgress:${userId}`;
const PRODUCT_PUBLISH_PROGRESS_KEY = (userId: string) => `@forus:productPublishProgress:${userId}`;
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * 29;
const REEL_VIEWABILITY_CONFIG = Object.freeze({ itemVisiblePercentThreshold: 70 });
const HOME_VIEWABILITY_CONFIG = Object.freeze({ itemVisiblePercentThreshold: 65 });
const PRODUCT_VIEWABILITY_CONFIG = Object.freeze({ itemVisiblePercentThreshold: 60 });

type CategoryTab = "home" | "products" | "food" | "restaurants" | "services";

const SERVICE_CATEGORY_TABS: {
  key: ServiceCategory;
  label: string;
  icon: string;
}[] = [
  { key: "home", label: "منزل", icon: "home" },
  { key: "car", label: "سيارات", icon: "truck" },
  { key: "general", label: "طبية", icon: "activity" },
  { key: "delivery", label: "توصيل", icon: "navigation" },
];



function ArtisanCard({
  artisan,
  userLocation,
  index,
}: {
  artisan: ArtisanProfile;
  userLocation: GeoLocation | null;
  index: number;
}) {
  const distance =
    userLocation && artisan.location
      ? calcDistanceKm(userLocation, artisan.location)
      : null;

  const isRestaurant = artisan.specialty === "restaurant";

  const initials = artisan.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const reviewCount =
    typeof artisan.reviewCount === "number" ? artisan.reviewCount : 0;

  const rating =
    typeof artisan.rating === "number" && artisan.rating > 0
      ? artisan.rating.toFixed(1)
      : null;

  const distanceText =
    distance !== null
      ? distance < 1
        ? `${Math.round(distance * 1000)} م`
        : `${distance.toFixed(1)} كم`
      : "غير محددة";

  /*
   * Restaurant cards use the profile photo as a premium banner until a
   * dedicated restaurant cover image is available in the profile schema.
   * This keeps the card visually rich without inventing a database field.
   */
  if (isRestaurant) {
    return (
      <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
        <Pressable
          style={({ pressed }) => [
            styles.restaurantCard,
            pressed && { transform: [{ scale: 0.985 }], opacity: 0.96 },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigateWithHomeBase({
              pathname: "/restaurant/[id]",
              params: {
                id: artisan.id,
              },
            });
          }}
        >
          <View style={styles.restaurantHero}>
            {artisan.coverUri || artisan.photoUri ? (
              <Image
                source={{ uri: artisan.coverUri || artisan.photoUri || undefined }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient
                colors={["#24345D", "#0D1834"]}
                style={StyleSheet.absoluteFill}
              >
                <Text style={styles.restaurantBannerInitials}>
                  {initials}
                </Text>
              </LinearGradient>
            )}

            <LinearGradient
              colors={[
                "rgba(7,12,25,0.05)",
                "rgba(7,12,25,0.30)",
                "rgba(7,12,25,0.94)",
              ]}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFill}
            />

            {isFeaturedActive(artisan) && (
              <View style={styles.restaurantFeaturedBadge}>
                <Ionicons name="star" size={12} color={C.primary} />
                <Text style={styles.restaurantFeaturedText}>مميز</Text>
              </View>
            )}

            <View style={styles.restaurantLogoWrap}>
              {artisan.restaurantLogoUri ? (
                <Image
                  source={{ uri: artisan.restaurantLogoUri }}
                  style={styles.restaurantLogo}
                  resizeMode="cover"
                />
              ) : (
                <LinearGradient
                  colors={[C.primary, "#1E2F60"]}
                  style={styles.restaurantLogo}
                >
                  <Text style={styles.restaurantLogoInitials}>
                    {initials}
                  </Text>
                </LinearGradient>
              )}

              <View
                style={[
                  styles.restaurantStatusDot,
                  artisan.isAvailable
                    ? styles.restaurantStatusOpen
                    : styles.restaurantStatusClosed,
                ]}
              />
            </View>

            <View style={styles.restaurantHeroText}>
              <Text
                style={styles.restaurantName}
                numberOfLines={1}
              >
                {artisan.name}
              </Text>

              <Text
                style={styles.restaurantCuisine}
                numberOfLines={1}
              >
                {artisan.restaurantCategory || "مطعم"}
              </Text>
            </View>
          </View>

          <View style={styles.restaurantInfoBar}>
            <View style={styles.restaurantInfoItem}>
              <Ionicons
                name="star"
                size={18}
                color="#F6C945"
              />
              <Text style={styles.restaurantInfoValue}>
                {rating ? rating : "جديد"}
              </Text>
              {reviewCount > 0 && (
                <Text style={styles.restaurantReviewCount}>
                  ({reviewCount} تقييم)
                </Text>
              )}
            </View>

            <View style={styles.restaurantInfoDivider} />

            <View style={styles.restaurantInfoItem}>
              <View
                style={[
                  styles.restaurantLiveDot,
                  artisan.isAvailable
                    ? styles.restaurantStatusOpen
                    : styles.restaurantStatusClosed,
                ]}
              />
              <Text
                style={[
                  styles.restaurantInfoValue,
                  artisan.isAvailable
                    ? styles.restaurantOpenText
                    : styles.restaurantClosedText,
                ]}
              >
                {artisan.isAvailable ? "مفتوح الآن" : "مغلق"}
              </Text>
            </View>

            <View style={styles.restaurantInfoDivider} />

            <View style={styles.restaurantInfoItem}>
              <Feather
                name="map-pin"
                size={15}
                color={C.accent}
              />
              <Text style={styles.restaurantInfoValue}>
                {distanceText}
              </Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  const distanceLabel =
    distance !== null
      ? distance < 1
        ? `${Math.round(distance * 1000)} م`
        : `${distance.toFixed(1)} كم`
      : "موقع غير متاح";

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <Pressable
        style={({ pressed }) => [
          styles.artisanCard,
          pressed && { opacity: 0.92 },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigateWithHomeBase({
            pathname: "/artisan-profile",
            params: {
              artisanId: artisan.id,
              artisan: JSON.stringify(artisan),
            },
          });
        }}
      >
        <View style={styles.cardLeft}>
          {artisan.photoUri ? (
            <Image
              source={{ uri: artisan.photoUri }}
              style={styles.artisanPhoto}
            />
          ) : (
            <View style={styles.artisanInitials}>
              <LinearGradient
                colors={[C.primary, "#1E2F60"]}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.initialsText}>{initials}</Text>
            </View>
          )}
          <View
            style={[
              styles.availDot,
              artisan.isAvailable
                ? styles.availOnline
                : styles.availOffline,
            ]}
          />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <View style={styles.specialtyBadge}>
              <Text style={styles.specialtyText}>
                {getSpecialtyLabel(artisan.specialty)}
              </Text>
            </View>
            <Text style={styles.artisanName} numberOfLines={1}>
              {artisan.name}
            </Text>
          </View>

          {isFeaturedActive(artisan) && (
            <View style={styles.featuredBadgeRow}>
              <View style={styles.featuredBadge}>
                <Ionicons name="star" size={10} color={C.primary} />
                <Text style={styles.featuredBadgeText}>مميز</Text>
              </View>
            </View>
          )}

          {artisan.bio ? (
            <Text style={styles.artisanBio} numberOfLines={4}>
              {artisan.bio}
            </Text>
          ) : null}

          <View style={styles.cardFooter}>
            <View style={styles.distancePill}>
              <Feather
                name="map-pin"
                size={11}
                color={distance !== null ? C.accent : C.textMuted}
              />
              <Text
                style={[
                  styles.distanceText,
                  distance === null && { color: C.textMuted },
                ]}
              >
                {distanceLabel}
              </Text>
            </View>

            <Text
              style={[
                styles.availText,
                artisan.isAvailable
                  ? styles.availOnlineText
                  : styles.availOfflineText,
              ]}
            >
              {artisan.isAvailable ? "متاح الآن" : "غير متاح"}
            </Text>
          </View>
        </View>

        <Feather
          name="chevron-left"
          size={18}
          color={C.textMuted}
        />
      </Pressable>
    </Animated.View>
  );
}

function ProductCard({
  product,
  userId,
  userName,
  userLocation,
  pendingOrderId,
  isLoading,
  isActive,
  onShare,
  onMediaPress,
  isFullscreenOpen,
  onLoadingChange,
}: {
  product: Product;
  userId: string | null;
  userName: string;
  userLocation: GeoLocation | null;
  pendingOrderId?: string;
  isLoading: boolean;
  isActive: boolean;
  onShare: () => void;
  onMediaPress: (item: ProductMedia, positionMillis?: number) => void;
  isFullscreenOpen: boolean;
  onLoadingChange: (productId: string | null) => void;
}) {
  const isFocused = useIsFocused();
  const isVisible = isFocused && isActive;
  const isMine = product.sellerId === userId;
  const [, forceRelativeTimeUpdate] = useState(0);
  const [likesCount, setLikesCount] = useState(product.likesCount ?? 0);
  const [isLiked, setIsLiked] = useState(false);
  const pendingLikeRef = useRef(false);

  useEffect(() => {
    setLikesCount(product.likesCount ?? 0);
  }, [product.likesCount]);

  useEffect(() => {
    const viewer = auth.currentUser;
    if (!viewer || isMine) {
      setIsLiked(false);
      return;
    }
    let cancelled = false;
    getIsProductLiked(viewer.uid, product.id)
      .then((liked) => {
        if (!cancelled) setIsLiked(liked);
      })
      .catch((error) => {
        console.warn("product like state read failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, [isMine, product.id]);

  const handleLike = async () => {
    const viewer = auth.currentUser;
    if (!viewer || isMine || pendingLikeRef.current) return false;

    const wasLiked = isLiked;
    const nextLiked = !wasLiked;
    const delta = nextLiked ? 1 : -1;
    pendingLikeRef.current = true;
    setIsLiked(nextLiked);
    setLikesCount((count) => Math.max(0, count + delta));

    try {
      await (nextLiked
        ? likeProduct(viewer.uid, product.id)
        : unlikeProduct(viewer.uid, product.id));
      return nextLiked;
    } catch (error) {
      setIsLiked(wasLiked);
      setLikesCount((count) => Math.max(0, count - delta));
      throw error;
    } finally {
      pendingLikeRef.current = false;
    }
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("حذف المنتج", `هل أنت متأكد من حذف "${product.title}"؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          onLoadingChange(product.id);
          try {
            await deleteProduct(product.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            Alert.alert("خطأ", "تعذّر حذف المنتج، حاول مجدداً.");
          } finally {
            onLoadingChange(null);
          }
        },
      },
    ]);
  };

  useEffect(() => {
    const timer = setInterval(() => forceRelativeTimeUpdate((v) => v + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.productCard}>
      <Pressable
        style={styles.productShareBtn}
        onPress={onShare}
        accessibilityLabel="مشاركة المنتج"
      >
        <Feather name="share-2" size={13} color={C.accent} />
      </Pressable>
      {!isMine && (
        <ReportButton
          targetType="product"
          targetId={product.id}
          targetName={product.title}
          targetOwnerId={product.sellerId}
          style={styles.productReportBtn}
        />
      )}
      <View><ProductMediaCarousel
          media={normalizeProductMedia(product.media, product.imageUrl)}
          height={380}
          isVisible={isVisible}
          isFullscreenOpen={isFullscreenOpen}
          onMediaPress={onMediaPress}
          onDoubleTapLike={async () => {
            const viewer = auth.currentUser;
             if (!viewer || isMine || isLiked) return false;
             return handleLike();
          }}
        />
      </View>
      <View style={styles.productBody}>
        <View style={styles.productInfoStack}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigateWithHomeBase({
                pathname: "/user-profile",
                params: { userId: product.sellerId, userName: product.sellerName },
              } as any);
            }}
            style={styles.productSellerTouchable}
          >
            <Text style={styles.productSellerName} numberOfLines={1}>{product.sellerName}</Text>
            {isFeaturedActive({ featuredUntil: product.sellerFeaturedUntil }) && (
              <View style={styles.productFeaturedBadge}>
                <Ionicons name="star" size={10} color={C.primary} />
                <Text style={styles.productFeaturedText}>مميز</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.productTitle} numberOfLines={2}>{product.title}</Text>

          <View style={styles.productPriceLikesRow}>
            <Text style={styles.productPrice}>
              <Text style={styles.productPriceLabel}>السعر: </Text>
              {product.price.toLocaleString("ar-IQ-u-nu-latn")}{" "}
              <Text style={styles.productCurrency}>د.ع</Text>
            </Text>

            <View style={styles.productEngagement}>
               <Pressable
                 onPress={() => { void handleLike().catch(() => undefined); }}
                 disabled={isMine}
                 hitSlop={8}
                 style={styles.productLikeButton}
                 accessibilityRole="button"
                 accessibilityLabel={isLiked ? "إلغاء إعجاب المنتج" : "الإعجاب بالمنتج"}
               >
                 <Ionicons name={isLiked ? "heart" : "heart-outline"} size={17} color={isLiked ? "#EF4444" : C.textSecondary} />
               </Pressable>
               <Text style={[styles.productLikesText, isLiked && styles.likedCountText]}>{likesCount}</Text>
              <Text style={styles.productLikesLabel}>إعجاب</Text>
            </View>
          </View>
        </View>
        {product.description ? (
          <Text style={styles.productDesc} numberOfLines={2}>{product.description}</Text>
        ) : null}
      </View>
      {isMine ? (
          <TouchableOpacity
            style={[styles.buyBtn, styles.deleteBtn]}
            activeOpacity={0.85}
            disabled={isLoading}
            onPress={handleDelete}
          >
            <View style={styles.deleteBtnInner}>
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Feather name="trash-2" size={14} color="#FFF" />
                  <Text style={styles.deleteBtnText}>حذف المنتج</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        ) : (
          <ProductPurchaseButton
            product={product}
            userId={userId}
            userName={userName}
            userLocation={userLocation}
            pendingOrderId={pendingOrderId}
            isLoading={isLoading}
            onLoadingChange={onLoadingChange}
          />
        )}
    </View>
  );
}


const HomeFeedCard = React.memo(function HomeFeedCard({
  post,
  isActive,
  isScreenFocused,
  isReelsOpen,
  isInlineVideoPlaying,
  isMuted,
  onToggleMute,
  onOpenVideo,
  onDoubleTapLike,
  onResumeVideo,
  isLiked,
  onLike,
  onComment,
  onShare,
  onOpenProfile,
  isOwner,
  onDelete,
  deleteLoading,
}: {
  post: HomeFeedPost;
  isActive: boolean;
  isScreenFocused: boolean;
  isReelsOpen: boolean;
  isInlineVideoPlaying: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenVideo: () => void;
  onDoubleTapLike: () => void;
  onResumeVideo: () => void;
  isLiked: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onOpenProfile: () => void;
  isOwner: boolean;
  onDelete: () => void;
  deleteLoading: boolean;
}) {
  const lastTapRef = useRef(0);
  const handleMediaPress = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      onDoubleTapLike();
      return;
    }
    lastTapRef.current = now;
    onOpenVideo();
  };
  const handleImagePress = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      onDoubleTapLike();
      return;
    }
    lastTapRef.current = now;
  };

  return (
    <View style={styles.homePostCard}>
      <View style={styles.homePostHeader}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={onOpenProfile}
          style={styles.homePostProfileTouchable}
          accessibilityRole="button"
          accessibilityLabel={`فتح ملف ${post.userName}`}
        >
          <ProfileAvatar photoUri={post.userPhotoUri} name={post.userName} size={42} disableNavigation />
          <View style={styles.homePostUser}>
            <Text style={styles.homePostName} numberOfLines={1}>{post.userName}</Text>
            <Text style={styles.homePostTime}>{post.createdAt ? getRelativeTime(post.createdAt) : "منذ لحظات"}</Text>
          </View>
        </TouchableOpacity>
        {isOwner && (
          <Pressable
            style={styles.homePostDelete}
            onPress={onDelete}
            disabled={deleteLoading}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="حذف المنشور"
          >
            {deleteLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Feather name="trash-2" size={16} color="#FFF" />
            )}
          </Pressable>
        )}
      </View>

      {!!post.description && (
        <Text style={styles.homePostDescription}>{post.description}</Text>
      )}

      <Pressable onPress={post.mediaType === "video" ? handleMediaPress : post.mediaType === "image" ? handleImagePress : undefined} style={styles.homeMediaPressable}>
        {post.mediaType === "video" ? (
          <View style={styles.homeMedia}>
            <Video
              source={{ uri: post.url }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.COVER}
              shouldPlay={isScreenFocused && !isReelsOpen && isInlineVideoPlaying && isActive}
              isMuted={isMuted}
              isLooping
              useNativeControls={false}
            />
            <Pressable
              style={styles.homeMuteBtn}
              onPress={(event) => {
                event.stopPropagation();
                onToggleMute();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={isMuted ? "تشغيل الصوت" : "كتم الصوت"}
            >
              <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={18} color="#FFF" />
            </Pressable>
            {!isActive && (
              <Pressable
                style={styles.homePlay}
                onPress={(event) => { event.stopPropagation(); onResumeVideo(); }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="تشغيل الفيديو"
              >
                <Feather name="play" size={28} color="#FFF" />
              </Pressable>
            )}
          </View>
        ) : (
          <Image source={{ uri: post.url }} style={styles.homeMedia} resizeMode="cover" />
        )}
      </Pressable>

      <View style={styles.homeActions}>
        <Pressable onPress={onLike} style={styles.homeAction}><Ionicons name={isLiked ? "heart" : "heart-outline"} size={22} color={isLiked ? "#EF4444" : C.textSecondary} /><Text style={[styles.homeActionText, isLiked && styles.likedCountText]}>{post.likesCount}</Text></Pressable>
        <Pressable onPress={onComment} style={styles.homeAction}><Ionicons name="chatbubble-outline" size={21} color={C.textSecondary} /><Text style={styles.homeActionText}>{post.commentsCount}</Text></Pressable>
        <Pressable onPress={onShare} style={styles.homeAction}><Feather name="share-2" size={20} color={C.textSecondary} /></Pressable>
        {!isOwner && (
          <ReportButton
            targetType="post"
            targetId={post.id}
            targetName={post.userName}
            targetOwnerId={post.userId}
            style={styles.homePostReport}
          />
        )}
      </View>
    </View>
  );
});

function HomeVideoViewer({
  posts,
  index,
  visible,
  screenFocused,
  onClose,
  onLike,
  isLiked,
  onDoubleTapLike,
  onComment,
  onShare,
  onOpenProfile,
  onLoadMore,
  hasMore,
  loadingMore,
}: {
  posts: HomeFeedPost[];
  index: number;
  visible: boolean;
  screenFocused: boolean;
  onClose: () => void;
  onLike: (post: HomeFeedPost) => void;
  isLiked: (postId: string) => boolean;
  onDoubleTapLike: (post: HomeFeedPost) => void;
  onComment: (post: HomeFeedPost) => void;
  onShare: (post: HomeFeedPost) => void;
  onOpenProfile: (post: HomeFeedPost) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}) {
  const videos = posts.filter((p) => p.mediaType === "video");
  const [activeIndex, setActiveIndex] = useState(index);
  const [muted, setMuted] = useState(false);
  const [followedUserIds, setFollowedUserIds] = useState<Set<string>>(new Set());
  const pendingFollowStateRef = useRef(new Map<string, boolean>());
  const reelLastTapRef = useRef(0);
  const reelViewabilityConfig = REEL_VIEWABILITY_CONFIG;
  const hasMoreRef = useRef(!!hasMore);
  const loadingMoreRef = useRef(!!loadingMore);
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    hasMoreRef.current = !!hasMore;
    loadingMoreRef.current = !!loadingMore;
    onLoadMoreRef.current = onLoadMore;
  }, [hasMore, loadingMore, onLoadMore]);
  const reelViewabilityHandler = useRef(
    ({ viewableItems }: { viewableItems: Array<any> }) => {
      const first = viewableItems?.find((entry) => entry?.isViewable && entry?.index != null);
      if (first?.index != null) {
        setActiveIndex(first.index);
        if (hasMoreRef.current && !loadingMoreRef.current && first.index >= videos.length - 3) {
          void onLoadMoreRef.current?.();
        }
      }
    }
  ).current;

  useEffect(() => {
    if (visible) {
      setActiveIndex(Math.min(Math.max(0, index), Math.max(0, videos.length - 1)));
      setMuted(false);
      setFollowedUserIds(new Set());
      pendingFollowStateRef.current.clear();
    }
  }, [visible, index]);

  useEffect(() => {
    const viewer = auth.currentUser;
    const current = videos[activeIndex];
    if (!visible || !viewer || !current || viewer.uid === current.userId) return;
    let cancelled = false;
    getIsFollowing(viewer.uid, current.userId)
      .then((following) => {
        if (cancelled) return;
        if (pendingFollowStateRef.current.has(current.userId)) return;
        setFollowedUserIds((prev) => {
          const next = new Set(prev);
          if (following) next.add(current.userId); else next.delete(current.userId);
          return next;
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [visible, activeIndex, videos]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.reelsRoot}>
        <FlatList
          data={videos}
          initialScrollIndex={Math.min(Math.max(0, index), Math.max(0, videos.length - 1))}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews={Platform.OS !== "web"}
          viewabilityConfig={reelViewabilityConfig}
          onViewableItemsChanged={reelViewabilityHandler}
          onEndReached={() => {
            if (hasMoreRef.current && !loadingMoreRef.current) void onLoadMoreRef.current?.();
          }}
          onEndReachedThreshold={0.7}
          getItemLayout={(_, i) => ({ length: Dimensions.get("window").height, offset: Dimensions.get("window").height * i, index: i })}
          renderItem={({ item, index: itemIndex }) => {
            const itemLiked = isLiked(item.id);
            const isFollowing = followedUserIds.has(item.userId);
            return (
              <View style={styles.reelPage}>
                <Video
                  source={{ uri: item.url }}
                  style={StyleSheet.absoluteFill}
                  resizeMode={ResizeMode.COVER}
                  shouldPlay={visible && screenFocused && itemIndex === activeIndex}
                  isMuted={muted}
                  isLooping
                  useNativeControls={false}
                />
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={() => {
                    const now = Date.now();
                    if (now - reelLastTapRef.current < 320) {
                      reelLastTapRef.current = 0;
                      if (!itemLiked) onDoubleTapLike(item);
                    } else {
                      reelLastTapRef.current = now;
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="الضغط مرتين للإعجاب"
                />
                <View style={styles.reelOverlay}>
                  <View style={styles.reelTopRow}>
                    <Pressable onPress={onClose} style={styles.reelClose}><Feather name="x" size={25} color="#FFF" /></Pressable>
                    <View style={styles.reelTopActions}>
                      {auth.currentUser?.uid !== item.userId && (
                        <ReportButton
                          targetType="post"
                          targetId={item.id}
                          targetName={item.userName}
                          targetOwnerId={item.userId}
                          variant="dark"
                          style={styles.reelReportBtn}
                        />
                      )}
                      <Pressable
                        onPress={() => setMuted((value) => !value)}
                        style={styles.reelMuteBtn}
                        accessibilityRole="button"
                        accessibilityLabel={muted ? "تشغيل صوت الريلز" : "كتم صوت الريلز"}
                      >
                        <Ionicons name={muted ? "volume-mute" : "volume-high"} size={21} color="#FFF" />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.reelBottomArea}>
                    <View style={styles.reelActions}>
                      <View style={styles.reelProfileColumn}>
                        <View style={styles.reelAvatarWrap}>
                          <TouchableOpacity activeOpacity={0.8} onPress={() => onOpenProfile(item)}>
                            <ProfileAvatar photoUri={item.userPhotoUri} name={item.userName} size={50} disableNavigation />
                          </TouchableOpacity>
                          {auth.currentUser?.uid !== item.userId && (
                            <Pressable
                              style={[styles.reelFollowBadge, isFollowing && styles.reelFollowBadgeFollowing]}
                              onPress={async () => {
                                const viewer = auth.currentUser;
                                if (!viewer || viewer.uid === item.userId) return;
                                const nextFollowing = !isFollowing;
                                pendingFollowStateRef.current.set(item.userId, nextFollowing);
                                setFollowedUserIds((prev) => {
                                  const next = new Set(prev);
                                  if (nextFollowing) next.add(item.userId);
                                  else next.delete(item.userId);
                                  return next;
                                });
                                try {
                                  if (!nextFollowing) {
                                    await unfollowArtisan(viewer.uid, item.userId);
                                  } else {
                                    await followArtisan(viewer.uid, item.userId);
                                  }
                                  pendingFollowStateRef.current.delete(item.userId);
                                } catch (e) {
                                  console.warn("follow toggle failed", e);
                                  pendingFollowStateRef.current.delete(item.userId);
                                  setFollowedUserIds((prev) => {
                                    const next = new Set(prev);
                                    if (isFollowing) next.add(item.userId);
                                    else next.delete(item.userId);
                                    return next;
                                  });
                                }
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={isFollowing ? "إلغاء المتابعة" : "متابعة"}
                            >
                              <Text style={styles.reelFollowBadgeText}>{isFollowing ? "✓" : "+"}</Text>
                            </Pressable>
                          )}
                        </View>
                        <TouchableOpacity activeOpacity={0.75} onPress={() => onOpenProfile(item)}>
                          <Text style={styles.reelName} numberOfLines={1}>{item.userName}</Text>
                        </TouchableOpacity>
                      </View>

                      <Pressable style={styles.reelAction} onPress={() => onLike(item)}>
                        <Ionicons name={itemLiked ? "heart" : "heart-outline"} size={31} color={itemLiked ? "#EF4444" : "#FFF"} />
                        <Text style={styles.reelCount}>{item.likesCount}</Text>
                      </Pressable>
                      <Pressable style={styles.reelAction} onPress={() => onComment(item)}><Ionicons name="chatbubble-outline" size={29} color="#FFF" /><Text style={styles.reelCount}>{item.commentsCount}</Text></Pressable>
                      <Pressable style={styles.reelAction} onPress={() => onShare(item)}><Feather name="share-2" size={28} color="#FFF" /></Pressable>
                    </View>

                    {!!item.description && (
                      <Text style={styles.reelDescriptionBottom} numberOfLines={4}>{item.description}</Text>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
}



function FoodDashboardCard({ item }: { item: FoodItem }) {
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(item.likesCount || 0);
  const [liking, setLiking] = useState(false);

  useEffect(() => {
    let active = true;

    const checkLike = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      try {
        const value = await getIsFoodLiked(item.id, uid);
        if (active) setLiked(value);
      } catch (error) {
        console.error("food like check failed:", error);
      }
    };

    void checkLike();

    return () => {
      active = false;
    };
  }, [item.id]);

  const handleLike = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || liking) return;

    setLiking(true);

    try {
      const nextLiked = await toggleFoodLike(item.id, uid);

      setLiked(nextLiked);
      setLikesCount((count) =>
        Math.max(0, count + (nextLiked ? 1 : -1))
      );
    } catch (error: any) {
      Alert.alert(
        "تعذر الإعجاب",
        error?.message || "حدث خطأ."
      );
    } finally {
      setLiking(false);
    }
  };

  const first = item.media?.[0];

  return (
    <View
      style={{
        backgroundColor: C.card,
        borderRadius: 17,
        overflow: "hidden",
        marginBottom: 15,
        borderWidth: 1,
        borderColor: C.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 12,
          gap: 8,
        }}
      >
        {item.userPhoto ? (
          <Image
            source={{ uri: item.userPhoto }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
            }}
          />
        ) : (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: C.background,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather
              name="user"
              size={18}
              color={C.textMuted}
            />
          </View>
        )}

        <Text
          style={{
            flex: 1,
            color: C.text,
            fontSize: 15,
            fontWeight: "800",
          }}
          numberOfLines={1}
        >
          {item.userName || "مستخدم"}
        </Text>
      </View>

      {first ? (
        first.type === "video" ? (
          <View
            style={{
              width: "100%",
              height: 300,
              backgroundColor: "#111",
            }}
          >
            <Video
              source={{ uri: first.url }}
              style={{ width: "100%", height: "100%" }}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
              isLooping
            />
          </View>
        ) : (
          <Image
            source={{ uri: first.url }}
            style={{
              width: "100%",
              height: 300,
              backgroundColor: C.background,
            }}
            resizeMode="contain"
          />
        )
      ) : (
        <View
          style={{
            height: 220,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: C.background,
          }}
        >
          <Ionicons
            name="restaurant-outline"
            size={50}
            color={C.accent}
          />
        </View>
      )}

      <View style={{ padding: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <Text
            style={{
              flex: 1,
              color: C.text,
              fontSize: 17,
              fontWeight: "900",
              textAlign: "right",
            }}
            numberOfLines={2}
          >
            {item.name}
          </Text>

          <Text
            style={{
              color: C.accent,
              fontSize: 16,
              fontWeight: "900",
            }}
          >
            {Number(item.price || 0).toLocaleString("en-US")} د.ع
          </Text>
        </View>

        {!!item.appetizers?.trim() && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 10,
            }}
          >
            <Ionicons
              name="restaurant-outline"
              size={17}
              color={C.accent}
            />
            <Text
              style={{
                flex: 1,
                color: C.textSecondary,
                fontSize: 13,
                textAlign: "right",
              }}
            >
              {item.appetizers}
            </Text>
          </View>
        )}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 12,
            gap: 20,
          }}
        >
          <Pressable
            onPress={() => void handleLike()}
            disabled={liking}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={23}
              color={liked ? "#e53935" : C.text}
            />
            <Text style={{ color: C.text }}>
              {likesCount}
            </Text>
          </Pressable>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
            }}
          >
            <Ionicons
              name="chatbubble-outline"
              size={22}
              color={C.text}
            />
            <Text style={{ color: C.text }}>
              {item.commentsCount || 0}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const {
    productId: sharedProductId,
    postId: requestedPostId,
    openComments,
  } = useLocalSearchParams<{ productId?: string; postId?: string; openComments?: string }>();
  // Screen-level focus — drives video start/stop & viewability guard
const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [artisans, setArtisans] = useState<ArtisanProfile[]>([]);
  const [userLocation, setUserLocation] = useState<GeoLocation | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryTab>("home");
    const [showNewMenu, setShowNewMenu] = useState(false);
  const [activeServiceCategory, setActiveServiceCategory] =
    useState<ServiceCategory>("home");
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState("المستخدم");
  const [userRole, setUserRole] = useState<"client" | "artisan" | "admin">("client");
  const [loading, setLoading] = useState(true);

  const [chatLastAts, setChatLastAts] = useState<ChatLastActivity[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // ── Marketplace ──
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsRefreshing, setProductsRefreshing] = useState(false);

  // ── Food ──
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [foodLoading, setFoodLoading] = useState(true);
  const [foodRefreshing, setFoodRefreshing] = useState(false);

  const [smartFeedSeed, setSmartFeedSeed] = useState(0);
  const [shareProduct, setShareProduct] = useState<Product | null>(null);
  const [sharePost, setSharePost] = useState<HomeFeedPost | null>(null);
  const [fullscreenMedia, setFullscreenMedia] = useState<ProductMedia | null>(null);
  const [fullscreenMediaPosition, setFullscreenMediaPosition] = useState(0);
  const fullscreenVideoRef = useRef<Video | null>(null);
  const { isAudioMuted } = useVideoAudio();
  const [homeFeed, setHomeFeed] = useState<HomeFeedPost[]>([]);
  const [homeLoading, setHomeLoading] = useState(true);
  const [homeRefreshing, setHomeRefreshing] = useState(false);
  const [homeLoadingMore, setHomeLoadingMore] = useState(false);
  const [homeHasMore, setHomeHasMore] = useState(true);
  const homeFeedCursorRef = useRef<any | null>(null);
  const homeLoadingMoreRef = useRef(false);
  const [activeHomePostId, setActiveHomePostId] = useState<string | null>(null);
  const [homeVideoMuted, setHomeVideoMuted] = useState(true);
  const [isInlineVideoPlaying, setIsInlineVideoPlaying] = useState(true);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const pendingPostLikeRef = useRef(new Set<string>());
  const homeResumeBlockedRef = useRef(false);
  const isReelsOpenRef = useRef(false);
  const isInlineVideoPlayingRef = useRef(true);
  const [reelIndex, setReelIndex] = useState(0);
  const [showReels, setShowReels] = useState(false);
  const reopenReelsOnFocusRef = useRef(false);
  const [commentPost, setCommentPost] = useState<HomeFeedPost | null>(null);
  const [comments, setComments] = useState<HomeFeedComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentImageUri, setCommentImageUri] = useState<string | null>(null);
  const [commentPosting, setCommentPosting] = useState(false);
  const [commentEditingId, setCommentEditingId] = useState<string | null>(null);
  const [commentReplyingTo, setCommentReplyingTo] = useState<HomeFeedComment | null>(null);
  const [commentInputOpen, setCommentInputOpen] = useState(false);
  const [commentActionsComment, setCommentActionsComment] = useState<HomeFeedComment | null>(null);
  const [commentToast, setCommentToast] = useState<string | null>(null);
  const [expandedCommentReplies, setExpandedCommentReplies] = useState<Set<string>>(new Set());
  const commentInputRef = useRef<TextInput>(null);
  const commentToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [homePublishing, setHomePublishing] = useState(false);
  const [homePublishProgress, setHomePublishProgress] = useState(0);
  const [pendingPostMedia, setPendingPostMedia] = useState<ProfilePostDraftMedia | null>(null);
  const [postCaption, setPostCaption] = useState("");
  const [deletingHomePostId, setDeletingHomePostId] = useState<string | null>(null);
  const homeFeedListRef = useRef<FlatList<HomeFeedPost>>(null);
  const handledPostIntentRef = useRef<string | null>(null);

  const [buyingProductId, setBuyingProductId] = useState<string | null>(null);
  // productId → orderId for the current user's pending buy orders (prevents duplicates)
  const [myPendingOrders, setMyPendingOrders] = useState<Map<string, string>>(new Map());

  // ── Video focus tracking (Instagram-style: only the centred card plays) ──
  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);
  const productsListRef = useRef<FlatList<Product>>(null);

  // ── Screen-focus guard ──────────────────────────────────────────────────────
  // Mirror isFocused into a ref so the handler below stays reference-stable
  // (FlatList compares props by reference; recreating the callback breaks tracking)
  const isFocusedRef = useRef(false);

  // Home feed video focus: exactly one visible post may play at a time.
  const homeViewabilityConfig = HOME_VIEWABILITY_CONFIG;
  const homeViewabilityHandler = useRef(
    ({ viewableItems }: { viewableItems: Array<any> }) => {
      if (!isFocusedRef.current || isReelsOpenRef.current || homeResumeBlockedRef.current || !isInlineVideoPlayingRef.current) return;
      const first = viewableItems?.find((entry) => entry?.isViewable && entry?.item?.id);
      if (first?.item?.id) setActiveHomePostId(first.item.id);
    }
  ).current;

  const loadHomeFeed = useCallback(async (refresh = false) => {
    const requestedCursor = refresh ? null : homeFeedCursorRef.current;
    if (refresh) {
      setHomeRefreshing(true);
      homeFeedCursorRef.current = null;
      setHomeHasMore(true);
    } else {
      setHomeLoading(true);
    }
    try {
      const page = await getHomeFeedPosts(10, requestedCursor);
      const viewerId = auth.currentUser?.uid;
      const likedEntries = viewerId
        ? await Promise.all(page.posts.map(async (post) => {
            try {
              return [post.id, await getIsHomePostLiked(viewerId, post.id)] as const;
            } catch (error) {
              console.warn("home post like state read failed", post.id, error);
              return [post.id, false] as const;
            }
          }))
        : [];
      if (requestedCursor === null) {
        setHomeFeed(page.posts);
        setLikedPostIds(new Set(likedEntries.filter(([, liked]) => liked).map(([id]) => id)));
      } else if (page.posts.length) {
        setHomeFeed((current) => {
          const seen = new Set(current.map((item) => item.id));
          return [...current, ...page.posts.filter((item) => !seen.has(item.id))];
        });
        setLikedPostIds((current) => {
          const next = new Set(current);
          likedEntries.forEach(([id, liked]) => liked ? next.add(id) : next.delete(id));
          return next;
        });
      }
      homeFeedCursorRef.current = page.lastDoc;
      setHomeHasMore(page.hasMore);
    } catch (e) {
      console.error("Home feed error", e);
    } finally {
      setHomeLoading(false);
      setHomeRefreshing(false);
    }
  }, []);

  const loadMoreHomeFeed = useCallback(async () => {
    if (homeLoadingMoreRef.current || homeLoadingMore || !homeHasMore || !homeFeedCursorRef.current) return;
    homeLoadingMoreRef.current = true;
    setHomeLoadingMore(true);
    try {
      const page = await getHomeFeedPosts(10, homeFeedCursorRef.current);
      const viewerId = auth.currentUser?.uid;
      const likedEntries = viewerId
        ? await Promise.all(page.posts.map(async (post) => {
            try {
              return [post.id, await getIsHomePostLiked(viewerId, post.id)] as const;
            } catch (error) {
              console.warn("home post like state read failed", post.id, error);
              return [post.id, false] as const;
            }
          }))
        : [];
      if (page.posts.length) {
        setHomeFeed((current) => {
          const seen = new Set(current.map((item) => item.id));
          return [...current, ...page.posts.filter((item) => !seen.has(item.id))];
        });
        setLikedPostIds((current) => {
          const next = new Set(current);
          likedEntries.forEach(([id, liked]) => liked ? next.add(id) : next.delete(id));
          return next;
        });
      }
      homeFeedCursorRef.current = page.lastDoc;
      setHomeHasMore(page.hasMore);
    } catch (e) {
      console.error("Home feed pagination error", e);
    } finally {
      homeLoadingMoreRef.current = false;
      setHomeLoadingMore(false);
    }
  }, [homeHasMore, homeLoadingMore]);

  const handleHomePostLike = useCallback(async (postId: string) => {
    if (pendingPostLikeRef.current.has(postId)) return;
    pendingPostLikeRef.current.add(postId);
    const wasLiked = likedPostIds.has(postId);
    const nextLiked = !wasLiked;
    const countDelta = nextLiked ? 1 : -1;

    setLikedPostIds((prev) => {
      const next = new Set(prev);
      if (nextLiked) next.add(postId);
      else next.delete(postId);
      return next;
    });
    setHomeFeed((prev) => prev.map((post) => (
      post.id === postId
        ? { ...post, likesCount: Math.max(0, post.likesCount + countDelta) }
        : post
    )));

    try {
      const persistedLiked = await toggleProfilePostLike(postId);
      if (persistedLiked === nextLiked) return;

      setLikedPostIds((prev) => {
        const next = new Set(prev);
        if (persistedLiked) next.add(postId);
        else next.delete(postId);
        return next;
      });
      setHomeFeed((prev) => prev.map((post) => (
        post.id === postId
          ? { ...post, likesCount: Math.max(0, post.likesCount + (persistedLiked ? 1 : -1) - countDelta) }
          : post
      )));
    } catch (e: any) {
      setLikedPostIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(postId);
        else next.delete(postId);
        return next;
      });
      setHomeFeed((prev) => prev.map((post) => (
        post.id === postId
          ? { ...post, likesCount: Math.max(0, post.likesCount - countDelta) }
          : post
      )));
      Alert.alert("تعذر الإعجاب", e?.message || "حدث خطأ.");
    } finally {
      pendingPostLikeRef.current.delete(postId);
    }
  }, [likedPostIds]);

  const handleAddPost = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return Alert.alert("تنبيه", "سجّل الدخول أولاً.");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mediaType = asset.type === "video" ? "video" : "image";
    setPostCaption("");
    setPendingPostMedia({ uri: asset.uri, mediaType, mimeType: asset.mimeType, fileName: asset.fileName });
  }, []);

  const publishPendingPost = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    const media = pendingPostMedia;
    const caption = postCaption.trim();
    if (!uid || !media) return;

    // Match the existing product publishing flow: persist a small status marker,
    // close the composer immediately, then let upload + Firestore writes continue.
    await AsyncStorage.setItem(
      HOME_PUBLISH_PROGRESS_KEY(uid),
      JSON.stringify({ startedAt: Date.now() }),
    );
    setPendingPostMedia(null);
    setPostCaption("");

    try {
      const uploaded = await uploadProfilePostMedia(uid, media.uri, media.mediaType, {
        mimeType: media.mimeType,
        fileName: media.fileName,
      });
      await addProfilePost(uid, {
        id: `${uid}-${Date.now()}`,
        url: uploaded.url,
        mediaType: media.mediaType,
        createdAt: new Date().toISOString(),
        description: caption,
        likesCount: 0,
        commentsCount: 0,
        storagePath: uploaded.storagePath,
        mimeType: uploaded.mimeType,
      });
    } catch (e: any) {
      console.error("background home post publish error:", e);
      Alert.alert("تعذر النشر", e?.message || "حدث خطأ أثناء رفع المنشور.");
    } finally {
      await AsyncStorage.removeItem(HOME_PUBLISH_PROGRESS_KEY(uid));
    }
  }, [pendingPostMedia, postCaption]);

  const handleDeleteHomePost = useCallback((post: HomeFeedPost) => {
    const viewer = auth.currentUser;
    if (!viewer || viewer.uid !== post.userId) return;

    Alert.alert("حذف المنشور", "هل تريد حذف هذا المنشور من الرئيسية؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          setDeletingHomePostId(post.id);
          try {
            await removeHomeFeedPost(post.id);
            setHomeFeed((current) => current.filter((item) => item.id !== post.id));
            setLikedPostIds((current) => {
              const next = new Set(current);
              next.delete(post.id);
              return next;
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e: any) {
            Alert.alert("تعذر حذف المنشور", e?.message || "حدث خطأ أثناء حذف المنشور.");
          } finally {
            setDeletingHomePostId(null);
          }
        },
      },
    ]);
  }, []);

  useFocusEffect(useCallback(() => {
    if (homeFeed.length === 0 && !homeLoadingMore && !homeRefreshing) {
      loadHomeFeed();
    }
    if (reopenReelsOnFocusRef.current) {
      const timer = setTimeout(() => {
        if (!isFocusedRef.current) return;
        reopenReelsOnFocusRef.current = false;
        isReelsOpenRef.current = true;
        setShowReels(true);
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [loadHomeFeed, homeFeed.length, homeLoadingMore, homeRefreshing]));

  useEffect(() => {
    isFocusedRef.current = isFocused;
    if (!isFocused) setFocusedProductId(null); // switched to another app screen
  }, [isFocused]);

  // Hard playback guard: while Reels is open, inline Home videos are always stopped.
  // Keep the inline video stopped after closing Reels until the user explicitly resumes it.
  useEffect(() => {
    isReelsOpenRef.current = showReels;
    if (showReels) {
      isInlineVideoPlayingRef.current = false;
      setIsInlineVideoPlaying(false);
      setActiveHomePostId(null);
    }
  }, [showReels]);

  // Clear focused video when user switches to any non-Home tab
  useEffect(() => {
    if (activeCategory !== "products") setFocusedProductId(null);
    if (activeCategory !== "home") {
      setActiveHomePostId(null);
      isInlineVideoPlayingRef.current = false;
      setIsInlineVideoPlaying(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    if (!homeFeed.length) {
      setActiveHomePostId(null);
      return;
    }
    setActiveHomePostId((current) => current && homeFeed.some((post) => post.id === current) ? current : homeFeed[0].id);
  }, [homeFeed]);

  // Notifications can deep-link to a post that is not the first item in the
  // feed. The feed is loaded from the full /posts collection, so once it is
  // available we can scroll to the exact card and open its comments.
  useEffect(() => {
    if (!requestedPostId || !homeFeed.length) return;
    if (handledPostIntentRef.current === requestedPostId) return;

    const post = homeFeed.find((item) => item.id === requestedPostId);
    if (!post) return;

    handledPostIntentRef.current = requestedPostId;
    setActiveCategory("home");
    setActiveHomePostId(post.id);

    const postIndex = homeFeed.findIndex((item) => item.id === post.id);
    requestAnimationFrame(() => {
      homeFeedListRef.current?.scrollToIndex({
        index: postIndex,
        viewPosition: 0.08,
        animated: true,
      });
      if (openComments === "1" || openComments === "true") {
        setCommentPost(post);
        setComments([]);
        setCommentText("");
      }
    });
  }, [homeFeed, openComments, requestedPostId]);

  useEffect(() => {
    let cancelled = false;
    if (!commentPost) {
      setComments([]);
      setCommentsLoading(false);
      return;
    }
    setCommentsLoading(true);
    getPostComments(commentPost.id)
      .then((items) => { if (!cancelled) setComments(items); })
      .catch((error) => {
        console.error("load post comments error:", error);
        if (!cancelled) setComments([]);
      })
      .finally(() => { if (!cancelled) setCommentsLoading(false); });
    return () => { cancelled = true; };
  }, [commentPost]);

  const showCommentToast = useCallback((message: string) => {
    if (commentToastTimerRef.current) clearTimeout(commentToastTimerRef.current);
    setCommentToast(message);
    commentToastTimerRef.current = setTimeout(() => {
      setCommentToast(null);
      commentToastTimerRef.current = null;
    }, 2200);
  }, []);

  const closeCommentSheet = useCallback(() => {
    setCommentPost(null);
    setCommentText("");
    setCommentEditingId(null);
    setCommentInputOpen(false);
    setCommentActionsComment(null);
  }, []);

  const handleSubmitComment = useCallback(async () => {
    const post = commentPost;
    const text = commentText.trim();
    const editingId = commentEditingId;
    const replyingTo = commentReplyingTo;
    const imageUri = commentImageUri;

    if ((!post || (!text && !imageUri)) || commentPosting) return;

    setCommentPosting(true);
    try {
      if (editingId) {
        await updateProfilePostComment(post.id, editingId, text);

        setComments((prev) =>
          prev.map((comment) =>
            comment.id === editingId
              ? { ...comment, text }
              : comment
          )
        );
      } else if (replyingTo) {
        const added = await replyToPostComment(
          post.id,
          replyingTo.id,
          text
        );

        setComments((prev) => [added, ...prev]);

        setHomeFeed((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  commentsCount: p.commentsCount + 1,
                }
              : p
          )
        );
      } else {
        let uploadedImage: { url: string; storagePath: string } | null = null;
        if (imageUri) {
          const uid = auth.currentUser?.uid;
          if (uid) {
            uploadedImage = await uploadCommentImage(post.id, uid, imageUri);
          }
        }

        const added = await addProfilePostComment(
          post.id,
          text,
          uploadedImage?.url || null,
          uploadedImage?.storagePath || null
        );

        setComments((prev) => [added, ...prev]);

        setHomeFeed((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  commentsCount: p.commentsCount + 1,
                }
              : p
          )
        );
      }

      setCommentEditingId(null);
      setCommentReplyingTo(null);
      setCommentText("");
      setCommentImageUri(null);
      setCommentInputOpen(false);
    } catch (e: any) {
      const title = editingId
        ? "تعذر تعديل التعليق"
        : replyingTo
          ? "تعذر إرسال الرد"
          : "تعذر التعليق";

      Alert.alert(
        title,
        e?.message || "حدث خطأ أثناء حفظ التعليق."
      );
    } finally {
      setCommentPosting(false);
    }
  }, [
    commentPost,
    commentText,
    commentEditingId,
    commentReplyingTo,
    commentPosting,
  ]);

  const dismissCommentInput = useCallback(async () => {
    if (commentPosting) return;
    if (commentText.trim()) {
      await handleSubmitComment();
      return;
    }
    setCommentInputOpen(false);
    setCommentEditingId(null);
    setCommentReplyingTo(null);
    setCommentText("");
  }, [commentPosting, commentText, handleSubmitComment]);

  const handleLikeComment = useCallback(async (comment: HomeFeedComment) => {
    const post = commentPost;
    if (!post) return;

    try {
      const liked = await togglePostCommentLike(post.id, comment.id);

      setComments((prev) =>
        prev.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                isLiked: liked,
                likesCount: Math.max(
                  0,
                  Number(item.likesCount ?? 0) + (liked ? 1 : -1)
                ),
              }
            : item
        )
      );
    } catch (e: any) {
      Alert.alert(
        "تعذر الإعجاب",
        e?.message || "حدث خطأ أثناء الإعجاب بالتعليق."
      );
    }
  }, [commentPost]);

  const handleReplyComment = useCallback((comment: HomeFeedComment) => {
    setCommentReplyingTo(comment);
    setCommentEditingId(null);
    setCommentText("");
    setCommentInputOpen(true);
  }, []);

  const toggleCommentReplies = useCallback((commentId: string) => {
    setExpandedCommentReplies((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  }, []);

  const handleDeleteComment = useCallback(async (comment: HomeFeedComment) => {
    const post = commentPost;
    if (!post) return;
    setCommentActionsComment(null);
    if (commentEditingId === comment.id) {
      setCommentInputOpen(false);
      setCommentEditingId(null);
      setCommentText("");
    }
    try {
      await deleteProfilePostComment(post.id, comment.id);
      setComments((prev) => prev.filter((item) => item.id !== comment.id));
      setHomeFeed((prev) => prev.map((p) => p.id === post.id ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) } : p));
      showCommentToast("تم الحذف");
    } catch (e: any) {
      Alert.alert("تعذر حذف التعليق", e?.message || "حدث خطأ أثناء حذف التعليق.");
    }
  }, [commentPost, commentEditingId, showCommentToast]);

  useEffect(() => {
    if (!commentInputOpen) return;
    const focusTimer = setTimeout(() => commentInputRef.current?.focus(), 120);
    return () => clearTimeout(focusTimer);
  }, [commentInputOpen]);

  // ── Viewability refs — created ONCE, never reassigned ───────────────────────
  // useRef(...).current freezes the value at mount time → perfectly stable reference
  const viewabilityConfig = PRODUCT_VIEWABILITY_CONFIG;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<any> }) => {
      try {
        // Reject events that arrive during tab transitions or after screen blur
        if (!isFocusedRef.current) return;
        if (!viewableItems?.length) return;
        const visibleId =
          viewableItems[0]?.item?.id ?? viewableItems[0]?.item?._id;
        if (visibleId) setFocusedProductId(visibleId);
      } catch {
        // Swallow any error during rapid navigation to prevent the crash screen
      }
    }
  ).current;

  // Contextual search — filters products (الرئيسية) and artisans (specialty tabs)
  const [searchQuery, setSearchQuery] = useState("");

  // عند البحث باسم تخصص، انتقل تلقائيًا إلى فئة ذلك التخصص.
  // مثال: مندوب ← توصيل، سباك ← منزل، ميكانيكي ← سيارات.
  useEffect(() => {
    if (activeCategory !== "services") return;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return;

    const specialtyMatch = ALL_SPECIALTIES.find((item) => {
      const label = item.label.toLowerCase();
      const key = item.key.toLowerCase();

      return label === q || label.includes(q) || key === q || key.includes(q);
    });

    if (!specialtyMatch) return;

    const targetCategory = getCategoryForSpecialty(specialtyMatch.key);

    if (targetCategory !== activeServiceCategory) {
      setActiveServiceCategory(targetCategory);
    }
  }, [
    activeCategory,
    activeServiceCategory,
    searchQuery,
  ]);

  // ── Stories ───────────────────────────────────────────────────────────────
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [storyPublishing, setStoryPublishing] = useState(false);
  const [storyPublishProgress, setStoryPublishProgress] = useState(0);
  const [productPublishing, setProductPublishing] = useState(false);
  const [productPublishProgress, setProductPublishProgress] = useState(0);

  // Background publish indicators. Progress intentionally approaches 92%
  // while uploading and reaches 100% only when the background task removes
  // its status key, so the user can see that publishing is still in progress.
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    const refreshPublishProgress = async () => {
      try {
        const [storyRaw, productRaw, homeRaw] = await Promise.all([
          AsyncStorage.getItem(STORY_PUBLISH_PROGRESS_KEY(userId)),
          AsyncStorage.getItem(PRODUCT_PUBLISH_PROGRESS_KEY(userId)),
          AsyncStorage.getItem(HOME_PUBLISH_PROGRESS_KEY(userId)),
        ]);

        const now = Date.now();

        if (!cancelled) {
          if (storyRaw) {
            const startedAt = Number(JSON.parse(storyRaw)?.startedAt || now);
            const elapsed = Math.max(0, now - startedAt);
            setStoryPublishing(true);
            setStoryPublishProgress(Math.min(0.92, elapsed / 90000 * 0.92));
          } else {
            setStoryPublishing(false);
            setStoryPublishProgress(0);
          }

          if (productRaw) {
            const startedAt = Number(JSON.parse(productRaw)?.startedAt || now);
            const elapsed = Math.max(0, now - startedAt);
            setProductPublishing(true);
            setProductPublishProgress(Math.min(0.92, elapsed / 90000 * 0.92));
          } else {
            setProductPublishing(false);
            setProductPublishProgress(0);
          }

          if (homeRaw) {
            const startedAt = Number(JSON.parse(homeRaw)?.startedAt || now);
            const elapsed = Math.max(0, now - startedAt);
            setHomePublishing(true);
            setHomePublishProgress(Math.min(0.92, (elapsed / 90000) * 0.92));
          } else {
            setHomePublishing(false);
            setHomePublishProgress(0);
          }
        }
      } catch (err) {
        console.error("publish progress refresh failed:", err);
      }
    };

    refreshPublishProgress();
    const timer = setInterval(refreshPublishProgress, 500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const unsub1 = subscribeToActiveStories(userId, setStoryGroups);
    const unsub2 = subscribeToMyStories(userId, setMyStories);
    return () => { unsub1(); unsub2(); };
  }, [userId]);

  /** Cover image shown inside my story circle — latest story's thumbnail (or mediaUrl for images) */
  const myCoverImageUri = useMemo(() => {
    if (myStories.length === 0) return null;
    const latest = myStories[myStories.length - 1];
    return latest.thumbnailUrl ?? (latest.mediaType === "image" ? latest.mediaUrl : null);
  }, [myStories]);
  const { profile: liveProfile } = useProfileCheck(userId);

  const unreadMsgCount = useMemo(() => {
    if (!userId) return 0;
    return chatLastAts.filter(
      (activity) =>
        activity.unreadCount > 0 && activity.lastSenderId !== userId,
    ).length;
  }, [chatLastAts, userId]);

  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  useEffect(() => {
    if (!userId) {
      setUnreadNotificationCount(0);
      return;
    }
    return subscribeToNotifications(userId, (items) => {
      setUnreadNotificationCount(items.filter((item) => !item.read).length);
    });
  }, [userId]);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const loadData = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) { router.replace("/" as any); return; }

    try {
      const [profile, allArtisans] = await Promise.all([
        getUserProfile(user.uid),
        getArtisans(),
      ]);

      if (profile) {
        setUserName(profile.name || user.email?.split("@")[0] || "المستخدم");
        setUserRole(profile.role || "client");
        if (profile.location) setUserLocation(profile.location);
      }
      setUserId(user.uid);

      setArtisans(allArtisans);

      // Approximate location from IP only.
      // Never request GPS permission automatically while loading the dashboard.
      try {
        const approximateLocation = await getApproximateLocationByIP();
        if (approximateLocation) {
          setUserLocation(approximateLocation);
        }
      } catch {
        // Approximate location unavailable — never block the dashboard.
      }
    } catch (err) {
      console.error("loadData error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Register for push notifications + handle notification taps
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    registerForPushNotifications(user.uid).catch(() => {});

    const sub = addNotificationTapListener((data) => {
      if (data?.type === "chat" && data?.chatId && data?.senderName) {
        navigateWithHomeBase({
          pathname: "/chat",
          params: { chatId: data.chatId, otherName: data.senderName },
        });
      } else if (data?.type === "serviceRequest" || data?.type === "requestStatus") {
        navigateWithHomeBase({
          pathname: "/reservations",
          params: { tab: "services" },
        } as any);
      } else if (data?.type === "productOrder") {
        navigateWithHomeBase({
          pathname: "/reservations",
          params: { tab: "myProducts" },
        } as any);
      } else if (data?.type === "productOrderResponse") {
        navigateWithHomeBase({
          pathname: "/reservations",
          params: { tab: "myOrders" },
        } as any);
      }
    });
    return () => sub.remove();
  }, []);

  // Badge: subscribe to incoming unread messages only.
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsub = subscribeToUserChatLastAts(user.uid, setChatLastAts);
    return unsub;
  }, []);

  // Marketplace feed: deliberately one-shot. We do NOT subscribe to the
  // products collection in Home because likes/counters can otherwise replace
  // and reorder the FlatList while the user is scrolling.
  const loadProducts = useCallback(async (showSpinner = false) => {
    if (!userId) return;
    if (showSpinner) setProductsRefreshing(true);
    try {
      const data = await fetchProductsOnce();
      setProducts(data);
    } catch (error) {
      console.error("fetchProductsOnce failed:", error);
      if (showSpinner) Alert.alert("خطأ", "تعذّر تحديث المنتجات، حاول مجدداً.");
    } finally {
      setProductsLoading(false);
      setProductsRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) loadProducts(false);
  }, [userId, loadProducts]);

  const onProductsRefresh = useCallback(async () => {
    setSmartFeedSeed((seed) => seed + 1);
    await loadProducts(true);
  }, [loadProducts]);

  // ── Food feed ──
  const loadFoodItems = useCallback(async (showSpinner = false) => {
    if (showSpinner) setFoodRefreshing(true);

    try {
      const data = await fetchFoodItems();
      setFoodItems(data);
    } catch (error) {
      console.error("fetchFoodItems failed:", error);

      if (showSpinner) {
        Alert.alert(
          "خطأ",
          "تعذّر تحديث المأكولات، حاول مجدداً."
        );
      }
    } finally {
      setFoodLoading(false);
      setFoodRefreshing(false);
    }
  }, []);

  const onFoodRefresh = useCallback(async () => {
    await loadFoodItems(true);
  }, [loadFoodItems]);

  useEffect(() => {
    if (activeCategory === ("food" as any)) {
      void loadFoodItems(false);
    }
  }, [activeCategory, loadFoodItems]);

  // Buyer: keep a live map of productId → orderId for MY pending orders
  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeToBuyerProductOrders(
      userId,
      (orders: ProductOrder[]) => {
        const map = new Map<string, string>();
        orders.forEach((o) => {
          if (o.status === "pending") map.set(o.productId, o.id);
        });
        setMyPendingOrders(map);
      },
      () => setMyPendingOrders(new Map())
    );
    return unsub;
  }, [userId]);

  const handleMessagesPress = useCallback(async () => {
    navigateWithHomeBase("/messages" as any);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const filteredArtisans = React.useMemo(() => {
    let result = [...artisans];

    if (activeCategory === "services") {
      // Services must contain only a real, explicitly selected specialty.
      // New/incomplete accounts use "client" (or no specialty) and are never
      // eligible for any services tab.
      result = result.filter(
        (a) =>
          typeof a.specialty === "string" &&
          ALL_SPECIALTIES.some((item) => item.key === a.specialty) &&
          a.specialty !== "client"
      );
      result = result.filter((a) => a.category === activeServiceCategory);
    }
    // Contextual service search — search by displayed specialty label
    // as well as name, specialty key, bio, or phone number.
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((a) => {
        const specialtyLabel = getSpecialtyLabel(a.specialty || "").toLowerCase();

        return (
          a.name?.toLowerCase().includes(q) ||
          specialtyLabel.includes(q) ||
          a.specialty?.toLowerCase().includes(q) ||
          a.bio?.toLowerCase().includes(q) ||
          a.phone?.includes(q)
        );
      });
    }

    if (userLocation) {
      result.sort((a, b) => {
        // Promoted artisans always bubble to the top; among equals, sort by distance
        const aFeat = isFeaturedActive(a) ? 0 : 1;
        const bFeat = isFeaturedActive(b) ? 0 : 1;
        if (aFeat !== bFeat) return aFeat - bFeat;
        const da = a.location ? calcDistanceKm(userLocation, a.location) : Infinity;
        const db = b.location ? calcDistanceKm(userLocation, b.location) : Infinity;
        return da - db;
      });
    } else {
      // No location — promoted first, then rest
      result.sort((a, b) => {
        const aFeat = isFeaturedActive(a) ? 0 : 1;
        const bFeat = isFeaturedActive(b) ? 0 : 1;
        return aFeat - bFeat;
      });
    }

    return result;
  }, [
    artisans,
    activeCategory,
    activeServiceCategory,
    userLocation,
    searchQuery,
  ]);

  const filteredRestaurants = React.useMemo(() => {
    let result = artisans.filter(
      (a) =>
        typeof a.specialty === "string" &&
        a.specialty === "restaurant"
    );

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((a) => {
        const specialtyLabel = getSpecialtyLabel(a.specialty || "").toLowerCase();
        return (
          a.name?.toLowerCase().includes(q) ||
          specialtyLabel.includes(q) ||
          a.bio?.toLowerCase().includes(q) ||
          a.phone?.includes(q)
        );
      });
    }

    if (userLocation) {
      result.sort((a, b) => {
        const aFeat = isFeaturedActive(a) ? 0 : 1;
        const bFeat = isFeaturedActive(b) ? 0 : 1;
        if (aFeat !== bFeat) return aFeat - bFeat;

        const da = a.location ? calcDistanceKm(userLocation, a.location) : Infinity;
        const db = b.location ? calcDistanceKm(userLocation, b.location) : Infinity;
        return da - db;
      });
    } else {
      result.sort((a, b) => {
        const aFeat = isFeaturedActive(a) ? 0 : 1;
        const bFeat = isFeaturedActive(b) ? 0 : 1;
        return aFeat - bFeat;
      });
    }

    return result;
  }, [artisans, userLocation, searchQuery]);

  // Smart feed: one sponsored slot first, then a rotating mix of engagement,
  // recency, interest, and affinity. The seed changes only on pull-to-refresh.
  const sortedProducts = React.useMemo(
    () => rankProductsForFeed(products, smartFeedSeed),
    [products, smartFeedSeed],
  );

  // Filter sorted products by search query (empty query → all products)
  const filteredProducts = React.useMemo(() => {
    if (!searchQuery.trim()) return sortedProducts;
    const q = searchQuery.toLowerCase().trim();
    return sortedProducts.filter(
      (p) =>
        p.title?.toLowerCase().includes(q) ||
        p.sellerName?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }, [sortedProducts, searchQuery]);

  // Shared products must open in the real marketplace feed, not a separate
  // details screen. Clear filters and scroll to the product's current live
  // position after the realtime list has arrived.
  useEffect(() => {
    if (!sharedProductId || !products.length) return;
    setActiveCategory("products");
    if (searchQuery) setSearchQuery("");

    const index = sortedProducts.findIndex((product) => product.id === sharedProductId);
    if (index < 0) return;

    const scrollToProduct = (attempt = 0) => {
      try {
        productsListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.08 });
      } catch {
        if (attempt < 3) setTimeout(() => scrollToProduct(attempt + 1), 250);
      }
    };
    const timer = setTimeout(() => scrollToProduct(), 150);
    return () => clearTimeout(timer);
  }, [sharedProductId, products, sortedProducts, searchQuery, activeCategory]);

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#0D1B3E", "#162452"]} style={[styles.headerGrad, { paddingTop: topPad }]}>
        <View style={styles.headerActions}>

          <View style={styles.headerRightGroup}>
            <Pressable
              style={styles.headerIconCol}
              onPress={handleMessagesPress}
              accessibilityLabel="المراسلات"
            >
              <View style={styles.headerIconBtn}>
                <Feather name="message-circle" size={20} color="#FFF" />
                {unreadMsgCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadMsgCount > 99 ? "99+" : unreadMsgCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text pointerEvents="none" style={styles.headerIconLabel}>
                المراسلات
              </Text>
            </Pressable>

            <Pressable
              style={styles.headerIconCol}
              onPress={() => {
                Haptics.selectionAsync();
                navigateWithHomeBase("/user-search" as any);
              }}
              accessibilityLabel="البحث عن المستخدمين"
            >
              <View style={styles.headerIconBtn}>
                <Feather name="search" size={20} color="#FFF" />
              </View>
              <Text pointerEvents="none" style={styles.headerIconLabel}>
                بحث
              </Text>
            </Pressable>
          </View>

          <Text
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 5,
              textAlign: "center",
              color: "#FFF",
              fontSize: 20,
              fontWeight: "900",
              letterSpacing: 0.5,
              transform: [{ translateX: -9 }],
            }}
          >
            <Text style={{ fontSize: 32, fontWeight: "bold", color: "#FFF", letterSpacing: 0, marginRight: 12, transform: [{ translateX: -18 }] }}>ℱ𝒪 ℛ𝒰 𝒮</Text>
          </Text>

          <View style={styles.headerLeftGroup}>
            <Pressable
              style={styles.headerIconCol}
              onPress={() => {
                Haptics.selectionAsync();
                navigateWithHomeBase("/profile" as any);
              }}
              accessibilityLabel="الملف الشخصي"
            >
              <View>
                <ProfileAvatar
                  photoUri={liveProfile?.photoUri}
                  name={userName}
                  size={36}
                />
              </View>
              <Text
                pointerEvents="none"
                style={styles.headerIconLabel}
                numberOfLines={1}
              >
                {userName}
              </Text>
            </Pressable>

              <Pressable
              style={styles.headerIconCol}
              onPress={() => {
                Haptics.selectionAsync();
                setShowNewMenu((v) => !v);
              }}
              accessibilityLabel="جديد"
            >
              <View style={styles.headerIconBtn}>
                <Feather name="plus" size={22} color="#FFF" />
              </View>
              <Text pointerEvents="none" style={styles.headerIconLabel}>
                جديد
              </Text>
            </Pressable>

            {showNewMenu && (
              <View style={styles.newMenu}>
                <Pressable
                  style={styles.newMenuItem}
                  onPress={() => {
                    setShowNewMenu(false);
                    void handleAddPost();
                  }}
                >
                  <Feather name="play-circle" size={20} color="#111" />
                  <Text style={styles.newMenuText}>إضافة ريلز</Text>
                </Pressable>

                <View style={styles.newMenuDivider} />

                <Pressable
                  style={styles.newMenuItem}
                  onPress={() => {
                    setShowNewMenu(false);
                    Haptics.impactAsync(
                      Haptics.ImpactFeedbackStyle.Medium
                    );
                    navigateWithHomeBase("/add-product" as any);
                  }}
                >
                  <Feather name="shopping-bag" size={20} color="#111" />
                  <Text style={styles.newMenuText}>إضافة منتج</Text>
                </Pressable>

                <View style={styles.newMenuDivider} />

                
              </View>
            )}
          </View>

          {userRole === "admin" && (
            <Pressable
              style={[
                styles.headerIconCol,
                {
                  position: "absolute",
                  left: 140,
                  top: 0,
                },
              ]}
              onPress={() => navigateWithHomeBase("/admin-dashboard" as any)}
            >
              <View style={styles.headerIconBtn}>
                <Feather name="shield" size={20} color={C.accent} />
              </View>
              <Text pointerEvents="none" style={styles.headerIconLabel}>
                الإدارة
              </Text>
            </Pressable>
          )}
        </View>

        {/* ── Story Strip — between header icons and promote button ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.storyStrip, { transform: [{ translateY: -23 }] }]}
          contentContainerStyle={styles.storyStripContent}
        >
          {/* My Story circle — Instagram-style:
              • No active stories  → tap circle (or + badge) → story-creator
              • Has active stories → tap circle → story-viewer (own); tap + badge → story-creator */}
          <View style={styles.storyCircleWrap}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                if (myStories.length === 0) {
                  navigateWithHomeBase("/story-creator" as any);
                } else {
                  navigateWithHomeBase({ pathname: "/story-viewer", params: { userId } } as any);
                }
              }}
            >
              <View style={[
                styles.storyRing,
                myStories.length > 0 ? styles.storyRingMine : styles.storyRingEmpty,
              ]}>
<View style={styles.storyInner}>
                  {/* Show latest story thumbnail if available, otherwise profile photo */}
                  {myCoverImageUri ? (
                    <Image
                      source={{ uri: myCoverImageUri }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                  ) : (
                    <ProfileAvatar photoUri={liveProfile?.photoUri} name={userName} size={50} disableNavigation />
                  )}
                </View>

                {storyPublishing && (
                  <View style={styles.storyProgressOverlay} pointerEvents="none">
                    <Svg width={62} height={62} viewBox="0 0 62 62">
                      <Circle
                        cx="31"
                        cy="31"
                        r="29"
                        fill="none"
                        stroke="#4BFF8A"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={`${PROGRESS_CIRCUMFERENCE} ${PROGRESS_CIRCUMFERENCE}`}
                        strokeDashoffset={PROGRESS_CIRCUMFERENCE * (1 - storyPublishProgress)}
                        transform="rotate(-90 31 31)"
                      />
                      {storyPublishProgress < 0.02 && (
                        <Circle cx="31" cy="2" r="2.5" fill="#4BFF8A" />
                      )}
                    </Svg>
                  </View>
                )}
                {/* + badge always visible: taps independently to add a new story */}
                <Pressable
                  style={styles.storyAddBadge}
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.selectionAsync();
                    navigateWithHomeBase("/story-creator" as any);
                  }}
                  hitSlop={6}
                >
                  <Feather name="plus" size={11} color="#FFF" />
                </Pressable>
              </View>
            </Pressable>
            <Text style={styles.storyLabel} numberOfLines={1}>قصتك</Text>
          </View>

          {/* Other users' story circles */}
          {storyGroups.map((group) => (
            <Pressable
              key={group.userId}
              style={styles.storyCircleWrap}
              onPress={() => {
                Haptics.selectionAsync();
                navigateWithHomeBase({ pathname: "/story-viewer", params: { userId: group.userId } } as any);
              }}
            >
              <View style={[
                styles.storyRing,
                group.hasUnseen ? styles.storyRingUnseen : styles.storyRingSeen,
              ]}>
                <View style={styles.storyInner}>
                  {/* Show latest story thumbnail if available, otherwise profile photo */}
                  {group.coverImageUri ? (
                    <Image
                      source={{ uri: group.coverImageUri }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                  ) : (
                    <ProfileAvatar photoUri={group.userPhotoUri} name={group.userName} size={50} disableNavigation />
                  )}
                </View>
              </View>
              <Text style={styles.storyLabel} numberOfLines={1}>
                {group.userName.split(" ")[0]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ── Second navigation row ── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 4,
            paddingTop: 4,
            paddingBottom: 8,
            transform: [{ translateY: -12 }],
          }}
        >
          {[
            { key: "home" as CategoryTab, icon: "home-outline" as const },
            { key: "products" as CategoryTab, icon: "bag-handle-outline" as const },
            { key: "restaurants" as const, icon: "restaurant-outline" as const },
            { key: "services" as CategoryTab, icon: "construct-outline" as const },
          ].map((item) => (
            <Pressable
              key={item.key}
              style={[
                styles.headerIconCol,
                { flex: 0, width: 64, alignItems: "center" },
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setFocusedProductId(null);
                setSearchQuery("");

                if (item.key === "products") {
                  productsListRef.current?.scrollToOffset({
                    offset: 0,
                    animated: true,
                  });
                  onProductsRefresh();
                }

                if (item.key === "services") {
                  setActiveServiceCategory("home");
                }

                if (item.key === "restaurants") {
                  setActiveCategory("restaurants");
                  return;
                }

                if (item.key === "food") {
                  setActiveCategory("food");
                  void loadFoodItems(false);
                  return;
                }

                setActiveCategory(item.key);
              }}
               accessibilityLabel={
                item.key === "home"
                  ? "المنزل"
                  : item.key === "products"
                    ? "المنتجات"
                    : item.key === "food"
                      ? "المأكولات"
                      : item.key === "restaurants"
                        ? "المطاعم"
                        : "الخدمات"
              }
           >
              <View
                style={[
                  styles.headerIconBtn,
                  activeCategory === item.key && {
                    backgroundColor: C.accent,
                  },
                ]}
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={activeCategory === item.key ? C.primary : "#FFF"}
                />
              </View>
            </Pressable>
          ))}

          <Pressable
            style={[
              styles.headerIconCol,
              { flex: 0, width: 64, alignItems: "center" },
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              navigateWithHomeBase("/notifications" as any);
            }}
            accessibilityLabel="الإشعارات"
          >
            <View style={styles.headerIconBtn}>
              <Feather name="bell" size={20} color="#FFF" />
              {unreadNotificationCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadNotificationCount > 99
                      ? "99+"
                      : unreadNotificationCount}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        </View>



      </LinearGradient>

      <View style={styles.stickyBar}>
            {activeCategory === "services" && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.serviceCategoryTabs}
                style={styles.serviceCategoryTabsWrapper}
              >
                {SERVICE_CATEGORY_TABS.map((tab) => (
                  <Pressable
                    key={tab.key}
                    style={[
                      styles.serviceCatTab,
                      activeServiceCategory === tab.key && styles.catTabActive,
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSearchQuery("");
                      setActiveServiceCategory(tab.key);
                    }}
                  >
                    <Feather
                      name={tab.icon as any}
                      size={12}
                      color={
                        activeServiceCategory === tab.key
                          ? C.primary
                          : C.textSecondary
                      }
                    />
                    <Text
                      style={[
                        styles.serviceCatTabText,
                        activeServiceCategory === tab.key &&
                          styles.catTabTextActive,
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

          </View>

          {/* ── Sub-header bar: fixed below tabs, only in الرئيسية ── */}

          {/* ── Conditional content: products, services, or inline incoming orders ── */}
          <View style={styles.listWrapper}>
            {activeCategory === "home" ? (
              /* ══ HOME SOCIAL FEED — posts/media only ══ */
              <FlatList
                ref={homeFeedListRef}
                key="feed-list-home"
                data={homeFeed}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[styles.listContent, styles.homeFeedContent, { paddingBottom: bottomPad + 20 }]}
                refreshControl={<RefreshControl refreshing={homeRefreshing} onRefresh={() => loadHomeFeed(true)} tintColor={C.accent} />}
                showsVerticalScrollIndicator={false}
                initialNumToRender={3}
                maxToRenderPerBatch={3}
                windowSize={5}
                removeClippedSubviews={Platform.OS !== "web"}
                onEndReached={loadMoreHomeFeed}
                onEndReachedThreshold={0.6}
                ListFooterComponent={homeLoadingMore ? <ActivityIndicator size="small" color={C.accent} style={{ paddingVertical: 16 }} /> : null}
                viewabilityConfig={homeViewabilityConfig}
                onViewableItemsChanged={homeViewabilityHandler}
                renderItem={({ item }) => (
                  <HomeFeedCard
                    post={item}
                    isActive={activeHomePostId === item.id}
                    isScreenFocused={isFocused && activeCategory === "home"}
                    isReelsOpen={showReels}
                    isInlineVideoPlaying={isInlineVideoPlaying}
                    isMuted={homeVideoMuted}
                    onToggleMute={() => setHomeVideoMuted((value) => !value)}
                    onOpenVideo={() => {
                      isReelsOpenRef.current = true;
                      isInlineVideoPlayingRef.current = false;
                      homeResumeBlockedRef.current = true;
                      setIsInlineVideoPlaying(false);
                      setActiveHomePostId(null);
                      const videoIndex = homeFeed.filter((p) => p.mediaType === "video").findIndex((p) => p.id === item.id);
                      setReelIndex(Math.max(0, videoIndex));
                      setShowReels(true);
                    }}
                    onDoubleTapLike={() => { void handleHomePostLike(item.id); }}
                    onResumeVideo={() => {
                      if (showReels || isReelsOpenRef.current) return;
                      homeResumeBlockedRef.current = false;
                      isInlineVideoPlayingRef.current = true;
                      setIsInlineVideoPlaying(true);
                      setActiveHomePostId(item.id);
                    }}
                    isLiked={likedPostIds.has(item.id)}
                    onLike={() => { void handleHomePostLike(item.id); }}
                    onComment={() => {
                      setCommentPost(item);
                      setComments([]);
                      setCommentText("");
                      setCommentEditingId(null);
                      setCommentReplyingTo(null);
                    }}
                    onShare={() => {
                      Haptics.selectionAsync();
                      setSharePost(item);
                    }}
                    onOpenProfile={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      navigateWithHomeBase({ pathname: "/user-profile", params: { userId: item.userId, userName: item.userName } } as any);
                    }}
                    isOwner={auth.currentUser?.uid === item.userId}
                    onDelete={() => handleDeleteHomePost(item)}
                    deleteLoading={deletingHomePostId === item.id}
                  />
                )}
                ListEmptyComponent={
                  homeLoading ? (
                    <View style={styles.emptyState}>
                      <ActivityIndicator size="large" color={C.accent} />
                      <Text style={styles.emptySubtitle}>جارٍ تحميل المنشورات...</Text>
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <Feather name="image" size={48} color={C.textMuted} />
                      <Text style={styles.emptyTitle}>لا توجد منشورات حالياً</Text>
                      <Text style={styles.emptySubtitle}>أضف أول صورة أو مقطع فيديو إلى معرض الأعمال.</Text>
                    </View>
                  )
                }
              />
            ) : activeCategory === "products" ? (
              /* ══ PRODUCTS-ONLY VIEW ══ */
              <FlatList
                ref={productsListRef}
                key={`feed-list-${activeCategory}`}
                data={filteredProducts}
                keyExtractor={(p) => p.id}
                contentContainerStyle={[styles.listContent, styles.productListContent, { paddingBottom: bottomPad + 20 }]}
                refreshControl={<RefreshControl refreshing={productsRefreshing} onRefresh={onProductsRefresh} tintColor={C.accent} />}
                showsVerticalScrollIndicator={false}
                // Instagram-style: only the centred card is "active" → its video plays
                viewabilityConfig={viewabilityConfig}
                onViewableItemsChanged={onViewableItemsChanged}
                onScrollToIndexFailed={({ index }) => {
                  setTimeout(() => {
                    productsListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.08 });
                  }, 300);
                }}
                renderItem={({ item: product }) => (
                  <ProductCard
                    product={product}
                    userId={userId}
                    userName={userName}
                    userLocation={userLocation}
                    pendingOrderId={myPendingOrders.get(product.id)}
                    isLoading={buyingProductId === product.id}
                    isActive={product.id === focusedProductId}
                    onShare={() => { Haptics.selectionAsync(); setShareProduct(product); }}
                    isFullscreenOpen={!!fullscreenMedia}
                    onMediaPress={(item, positionMillis = 0) => {
                      setFullscreenMediaPosition(positionMillis);
                      setFullscreenMedia(item);
                    }}
                    onLoadingChange={setBuyingProductId}
                  />
                )}
                ListEmptyComponent={
                  productsLoading ? (
                    <View style={styles.emptyState}>
                      <ActivityIndicator size="large" color={C.accent} />
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <Ionicons name="pricetag-outline" size={52} color={C.textMuted} />
                      <Text style={styles.emptyTitle}>لا توجد منتجات حالياً</Text>
                      <Text style={styles.emptySubtitle}>كن أول من ينشر منتجاً في السوق!</Text>
                    </View>
                  )
                }
              />
            ) : (activeCategory as any) === "restaurants" ? (
              /* ══ RESTAURANTS VIEW ══ */
              <FlatList
                key="feed-list-restaurants"
                data={filteredRestaurants}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[
                  styles.listContent,
                  { paddingBottom: bottomPad + 20 },
                ]}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={C.accent}
                  />
                }
                showsVerticalScrollIndicator={false}
                renderItem={({ item, index }) => (
                  <ArtisanCard
                    artisan={item}
                    userLocation={userLocation}
                    index={index}
                  />
                )}
                ListEmptyComponent={
                  loading ? (
                    <View style={styles.emptyState}>
                      <ActivityIndicator size="large" color={C.accent} />
                      <Text style={styles.emptySubtitle}>
                        جارٍ تحميل المطاعم...
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <Ionicons
                        name="restaurant-outline"
                        size={52}
                        color={C.textMuted}
                      />
                      <Text style={styles.emptyTitle}>
                        لا توجد مطاعم حالياً
                      </Text>
                      <Text style={styles.emptySubtitle}>
                        ستظهر هنا حسابات أصحاب تخصص مطعم
                      </Text>
                    </View>
                  )
                }
              />
            ) : (activeCategory as any) === "food" ? (
              /* ══ FOOD VIEW ══ */
              <FlatList
                key="feed-list-food"
                data={foodItems}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[
                  styles.listContent,
                  { paddingBottom: bottomPad + 20 },
                ]}
                refreshControl={
                  <RefreshControl
                    refreshing={foodRefreshing}
                    onRefresh={onFoodRefresh}
                    tintColor={C.accent}
                  />
                }
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <FoodDashboardCard item={item} />
                )}
                ListEmptyComponent={
                  foodLoading ? (
                    <View style={styles.emptyState}>
                      <ActivityIndicator
                        size="large"
                        color={C.accent}
                      />
                      <Text style={styles.emptySubtitle}>
                        جارٍ تحميل المأكولات...
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <Ionicons
                        name="restaurant-outline"
                        size={52}
                        color={C.textMuted}
                      />
                      <Text style={styles.emptyTitle}>
                        لا توجد أطباق منشورة بعد
                      </Text>
                      <Text style={styles.emptySubtitle}>
                        كن أول من يضيف طبقًا إلى قسم المأكولات
                      </Text>
                    </View>
                  )
                }
              />
            ) : (
              /* ══ ARTISANS VIEW (specialty categories) ══ */
              <FlatList
                data={filteredArtisans}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 20 }]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
                showsVerticalScrollIndicator={false}
                renderItem={({ item, index }) => (
                  <ArtisanCard artisan={item} userLocation={userLocation} index={index} />
                )}
                ListHeaderComponent={
                  <View style={styles.listHeader}>
                    {filteredArtisans.length > 0 && userLocation && (
                      <View style={styles.sortedBadge}>
                        <Feather name="navigation" size={11} color={C.accent} />
                        <Text style={styles.sortedText}>مرتب حسب القرب</Text>
                      </View>
                    )}
<View style={styles.inlineSearchRow}>
                      <Feather name="search" size={14} color={C.textMuted} />
                      <TextInput
                        style={styles.inlineSearchInput}
                        placeholder="ابحث في الحرفيين..."
                        placeholderTextColor={C.textMuted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        returnKeyType="search"
                        textAlign="right"
                      />
                      {searchQuery.length > 0 && (
                        <Pressable
                          onPress={() => { setSearchQuery(""); Haptics.selectionAsync(); }}
                          style={styles.searchClearBtn}
                          hitSlop={8}
                          accessibilityLabel="مسح البحث"
                        >
                          <Feather name="x" size={14} color={C.textMuted} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                }
                ListEmptyComponent={
                  loading ? (
                    <View style={styles.emptyState}>
                      <Feather name="loader" size={36} color={C.textMuted} />
                      <Text style={styles.emptySubtitle}>جارٍ التحميل...</Text>
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <Feather name="users" size={48} color={C.textMuted} />
                      <Text style={styles.emptyTitle}>لا يوجد أصحاب اختصاص في هذا القسم حالياً</Text>
                      <Text style={styles.emptySubtitle}>جرّب قسماً آخر أو عُد لاحقاً</Text>
                    </View>
                  )
                }
              />
            )}
          </View>

      <ProfilePostComposerModal
        media={pendingPostMedia}
        caption={postCaption}
        posting={homePublishing}
        onCaptionChange={setPostCaption}
        onClose={() => {
          setPendingPostMedia(null);
          setPostCaption("");
        }}
        onPublish={publishPendingPost}
      />

      <HomeVideoViewer
        posts={homeFeed}
        index={reelIndex}
        visible={showReels}
        screenFocused={isFocused && showReels}
        onClose={() => {
          isReelsOpenRef.current = false;
          setShowReels(false);
          homeResumeBlockedRef.current = true;
          isInlineVideoPlayingRef.current = false;
          setIsInlineVideoPlaying(false);
          setActiveHomePostId(null);
          setHomeVideoMuted(true);
        }}
        onLike={(item) => { void handleHomePostLike(item.id); }}
        isLiked={(postId) => likedPostIds.has(postId)}
        onDoubleTapLike={(item) => { void handleHomePostLike(item.id); }}
        onLoadMore={loadMoreHomeFeed}
        hasMore={homeHasMore}
        loadingMore={homeLoadingMore}
         onComment={(item) => {
          setCommentPost(item);
          setComments([]);
          setCommentText("");
          setCommentEditingId(null);
          setCommentReplyingTo(null);
          setCommentInputOpen(false);
          setCommentActionsComment(null);
        }}
         onShare={(item) => {
           Haptics.selectionAsync();
           setSharePost(item);
         }}
        onOpenProfile={(item) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
           const currentVideoIndex = homeFeed
             .filter((post) => post.mediaType === "video")
             .findIndex((post) => post.id === item.id);
           if (currentVideoIndex >= 0) setReelIndex(currentVideoIndex);
           reopenReelsOnFocusRef.current = true;
          setShowReels(false);
          navigateWithHomeBase({ pathname: "/user-profile", params: { userId: item.userId, userName: item.userName } } as any);
        }}
      />

      <Modal
        visible={!!commentPost}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeCommentSheet}
      >
        <View style={styles.commentBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeCommentSheet} />
          <View style={styles.commentSheet}>
            <View style={styles.commentHandle} />
            <View style={styles.commentHeaderRow}>
              <Text style={styles.commentTitle}>التعليقات {commentPost ? `(${commentPost.commentsCount})` : ""}</Text>
              <Pressable onPress={closeCommentSheet} style={styles.commentCloseBtn}>
                <Feather name="x" size={19} color={C.textSecondary} />
              </Pressable>
            </View>

            <FlatList
              data={comments.filter((comment) => !comment.parentCommentId)}
              keyExtractor={(item) => item.id}
              style={styles.commentsList}
              contentContainerStyle={comments.length ? styles.commentsListContent : styles.commentsEmptyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                commentsLoading ? (
                  <View style={styles.commentsState}><ActivityIndicator size="small" color={C.accent} /><Text style={styles.commentsStateText}>جارٍ تحميل التعليقات...</Text></View>
                ) : (
                  <View style={styles.commentsState}><Ionicons name="chatbubble-ellipses-outline" size={35} color={C.textMuted} /><Text style={styles.commentsStateText}>لا توجد تعليقات بعد</Text></View>
                )
              }
              renderItem={({ item }) => {
              const isReply = Boolean(item.parentCommentId);

              const replies = comments.filter(
                (reply) => reply.parentCommentId === item.id
              );

              const repliesExpanded = expandedCommentReplies.has(item.id);

              return (
                <View style={styles.commentThread}>
                  <View style={styles.commentRow}>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() =>
                        navigateWithHomeBase({
                          pathname: "/user-profile",
                          params: {
                            userId: item.userId,
                            userName: item.userName,
                          },
                        } as any)
                      }
                    >
                      <ProfileAvatar
                        photoUri={item.userPhotoUri}
                        name={item.userName}
                        size={38}
                        disableNavigation
                      />
                    </TouchableOpacity>

                    <Pressable
                      style={styles.commentBody}
                      onLongPress={() => {
                        if (item.userId !== auth.currentUser?.uid) return;
                        setCommentActionsComment(item);
                      }}
                    >
                      <View style={styles.commentMetaRow}>
                        <TouchableOpacity
                          activeOpacity={0.75}
                          onPress={() =>
                            navigateWithHomeBase({
                              pathname: "/user-profile",
                              params: {
                                userId: item.userId,
                                userName: item.userName,
                              },
                            } as any)
                          }
                        >
                          <Text
                            style={styles.commentUserName}
                            numberOfLines={1}
                          >
                            {item.userName}
                          </Text>
                        </TouchableOpacity>

                        <Text style={styles.commentTime}>
                          {item.createdAt
                            ? getRelativeTime(item.createdAt)
                            : "منذ قليل"}
                        </Text>
                      </View>

                      {!!item.text && (
                        <Text style={styles.commentText}>{item.text}</Text>
                      )}

                      {!!item.imageUrl && (
                        <Image
                          source={{ uri: item.imageUrl }}
                          style={[
                            styles.commentImage,
                            isReply && styles.commentReplyImage,
                          ]}
                          resizeMode="cover"
                        />
                      )}

                      <View style={styles.commentActionsRow}>
                        <Pressable
                          style={styles.commentActionButton}
                          onPress={() => handleLikeComment(item)}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel={
                            item.isLiked
                              ? "إلغاء إعجاب التعليق"
                              : "الإعجاب بالتعليق"
                          }
                        >
                          <Feather
                            name="heart"
                            size={15}
                            color={item.isLiked ? "#e53935" : C.textMuted}
                          />

                          {Number(item.likesCount ?? 0) > 0 && (
                            <Text
                              style={[
                                styles.commentActionCount,
                                item.isLiked &&
                                  styles.commentActionCountLiked,
                              ]}
                            >
                              {Number(item.likesCount ?? 0)}
                            </Text>
                          )}
                        </Pressable>

                        <Pressable
                          style={styles.commentReplyButton}
                          onPress={() => handleReplyComment(item)}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel="الرد على التعليق"
                        >
                          <Text style={styles.commentReplyText}>رد</Text>
                        </Pressable>
                      </View>

                      {replies.length > 0 && (
                        <Pressable
                          style={styles.commentRepliesToggle}
                          onPress={() => toggleCommentReplies(item.id)}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel={
                            repliesExpanded
                              ? "إخفاء الردود"
                              : "عرض الردود"
                          }
                        >
                          <View style={styles.commentRepliesLine} />
                          <Text style={styles.commentRepliesToggleText}>
                            {repliesExpanded
                              ? "إخفاء الردود"
                              : `عرض الردود (${replies.length})`}
                          </Text>
                        </Pressable>
                      )}
                    </Pressable>
                  </View>

                  {repliesExpanded && replies.length > 0 && (
                    <View style={styles.commentRepliesContainer}>
                      {replies.map((reply) => {
                        const nestedReplies = comments.filter(
                          (child) => child.parentCommentId === reply.id
                        );

                        return (
                          <View key={reply.id} style={styles.commentReplyGroup}>
                            <View style={styles.commentReplyItem}>
                              <TouchableOpacity
                                activeOpacity={0.75}
                                onPress={() =>
                                  navigateWithHomeBase({
                                    pathname: "/user-profile",
                                    params: {
                                      userId: reply.userId,
                                      userName: reply.userName,
                                    },
                                  } as any)
                                }
                              >
                                <ProfileAvatar
                                  photoUri={reply.userPhotoUri}
                                  name={reply.userName}
                                  size={32}
                                  disableNavigation
                                />
                              </TouchableOpacity>

                              <Pressable
                                style={styles.commentReplyBubble}
                                onLongPress={() => {
                                  if (reply.userId !== auth.currentUser?.uid) return;
                                  setCommentActionsComment(reply);
                                }}
                              >
                                <View style={styles.commentReplyMetaRow}>
                                  <TouchableOpacity
                                    activeOpacity={0.75}
                                    onPress={() =>
                                      navigateWithHomeBase({
                                        pathname: "/user-profile",
                                        params: {
                                          userId: reply.userId,
                                          userName: reply.userName,
                                        },
                                      } as any)
                                    }
                                  >
                                    <Text
                                      style={styles.commentReplyUserName}
                                      numberOfLines={1}
                                    >
                                      {reply.userName}
                                    </Text>
                                  </TouchableOpacity>

                                  <Text style={styles.commentReplyTime}>
                                    {reply.createdAt
                                      ? getRelativeTime(reply.createdAt)
                                      : "منذ قليل"}
                                  </Text>
                                </View>

                                <Text style={styles.commentReplyTextBody}>
                                  {reply.text}
                                </Text>

                                <View style={styles.commentActionsRow}>
                                  <Pressable
                                    style={styles.commentActionButton}
                                    onPress={() => handleLikeComment(reply)}
                                    hitSlop={6}
                                    accessibilityRole="button"
                                    accessibilityLabel={
                                      reply.isLiked
                                        ? "إلغاء إعجاب الرد"
                                        : "الإعجاب بالرد"
                                    }
                                  >
                                    <Feather
                                      name="heart"
                                      size={14}
                                      color={
                                        reply.isLiked
                                          ? "#e53935"
                                          : C.textMuted
                                      }
                                    />

                                    {Number(reply.likesCount ?? 0) > 0 && (
                                      <Text
                                        style={[
                                          styles.commentActionCount,
                                          reply.isLiked &&
                                            styles.commentActionCountLiked,
                                        ]}
                                      >
                                        {Number(reply.likesCount ?? 0)}
                                      </Text>
                                    )}
                                  </Pressable>

                                  <Pressable
                                    style={styles.commentReplyButton}
                                    onPress={() => handleReplyComment(reply)}
                                    hitSlop={6}
                                    accessibilityRole="button"
                                    accessibilityLabel="الرد على الرد"
                                  >
                                    <Text style={styles.commentReplyText}>
                                      رد
                                    </Text>
                                  </Pressable>
                                </View>
                              </Pressable>
                            </View>

                            {nestedReplies.length > 0 && (
                              <View style={styles.nestedRepliesContainer}>
                                {nestedReplies.map((nested) => (
                                  <View
                                    key={nested.id}
                                    style={styles.nestedReplyItem}
                                  >
                                    <ProfileAvatar
                                      photoUri={nested.userPhotoUri}
                                      name={nested.userName}
                                      size={28}
                                      disableNavigation
                                    />

                                    <View style={styles.nestedReplyBubble}>
                                      <Text
                                        style={styles.commentReplyUserName}
                                        numberOfLines={1}
                                      >
                                        {nested.userName}
                                      </Text>

                                      <Text
                                        style={styles.commentReplyTextBody}
                                      >
                                        {nested.text}
                                      </Text>

                                      <Pressable
                                        style={styles.commentReplyButton}
                                        onPress={() =>
                                          handleReplyComment(nested)
                                        }
                                        hitSlop={6}
                                        accessibilityRole="button"
                                        accessibilityLabel="الرد على الرد"
                                      >
                                        <Text style={styles.commentReplyText}>
                                          رد
                                        </Text>
                                      </Pressable>
                                    </View>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            }}
            />

            {commentEditingId && (
              <Pressable style={styles.commentEditCancel} onPress={() => { setCommentEditingId(null); setCommentText(""); }}>
                <Text style={styles.commentEditCancelText}>إلغاء التعديل</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.commentComposer}
              onPress={() => setCommentInputOpen(true)}
              disabled={commentPosting}
              accessibilityRole="button"
              accessibilityLabel="إضافة تعليق"
            >
              <View style={styles.commentComposerFakeInput}>
                <Text style={styles.commentComposerPlaceholder}>{commentEditingId ? "اضغط لتعديل تعليقك..." : "إضافة تعليق..."}</Text>
                <Feather name="smile" size={18} color={C.textMuted} />
              </View>
              <View style={styles.commentComposerSend}>
                <Feather name="send" size={17} color={C.primary} />
              </View>
            </Pressable>
          </View>

          {commentInputOpen && (
            <View style={styles.commentInputOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={dismissCommentInput} />
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={0}
                style={styles.commentInputKeyboard}
              >
                <View style={styles.commentInputSheet}>
                  <View style={styles.commentHandle} />
                  <View style={styles.commentInputHeader}>
                    <Text style={styles.commentInputTitle}>
                      {commentEditingId
                        ? "تعديل التعليق"
                        : commentReplyingTo
                          ? `الرد على ${commentReplyingTo.userName}`
                          : "إضافة تعليق"}
                    </Text>
                    <Pressable onPress={dismissCommentInput} style={styles.commentInputClose}>
                      <Feather name="chevron-down" size={21} color={C.textSecondary} />
                    </Pressable>
                  </View>
                  <View style={styles.commentEmojiRow}>
                    {["❤️", "😂", "😍", "🔥"].map((emoji) => (
                      <Pressable
                        key={emoji}
                        style={styles.commentEmojiButton}
                        onPress={() => setCommentText((current) => `${current}${emoji}`)}
                        accessibilityRole="button"
                        accessibilityLabel={`إضافة ${emoji}`}
                      >
                        <Text style={styles.commentEmoji}>{emoji}</Text>
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={async () => {
                        if (commentPosting) return;
                        const result = await ImagePicker.launchImageLibraryAsync({
                          mediaTypes: ["images"],
                          allowsMultipleSelection: false,
                          quality: 0.9,
                        });
                        if (result.canceled || !result.assets?.[0]?.uri) return;
                        setCommentImageUri(result.assets[0].uri);
                      }}
                      disabled={commentPosting}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="إضافة صورة"
                    >
                      <Feather
                        name="image"
                        size={19}
                        color={commentImageUri ? C.accent : C.textMuted}
                      />
                    </Pressable>
                    <Feather name="at-sign" size={19} color={C.textMuted} />
                  </View>
                  {!!commentImageUri && (
                    <View style={styles.commentSelectedImageWrap}>
                      <Image
                        source={{ uri: commentImageUri }}
                        style={styles.commentSelectedImage}
                        resizeMode="cover"
                      />
                      <Pressable
                        style={styles.commentSelectedImageRemove}
                        onPress={() => setCommentImageUri(null)}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel="إزالة الصورة"
                      >
                        <Feather name="x" size={13} color="#FFF" />
                      </Pressable>
                    </View>
                  )}

                  <View style={styles.commentInputRow}>
                    <TextInput
                      ref={commentInputRef}
                      value={commentText}
                      onChangeText={setCommentText}
                      placeholder={
                        commentEditingId
                          ? "عدّل تعليقك..."
                          : commentReplyingTo
                            ? `اكتب ردك على ${commentReplyingTo.userName}...`
                            : "اكتب تعليقك هنا..."
                      }
                      placeholderTextColor={C.textMuted}
                      style={styles.commentLargeInput}
                      multiline
                      maxLength={500}
                      textAlign="left"
                      autoFocus
                      editable={!commentPosting}
                      returnKeyType="default"
                    />
                    <Pressable
                      style={[styles.commentInputSend, (!commentText.trim() && !commentImageUri || commentPosting) && styles.commentSendDisabled]}
                      disabled={(!commentText.trim() && !commentImageUri) || commentPosting}
                      onPress={handleSubmitComment}
                      accessibilityRole="button"
                      accessibilityLabel="إرسال التعليق"
                    >
                      {commentPosting ? <ActivityIndicator size="small" color="#FFF" /> : <Feather name="send" size={18} color="#FFF" />}
                    </Pressable>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </View>
          )}

          {commentActionsComment && (
            <View style={styles.commentOptionsOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setCommentActionsComment(null)} />
              <View style={styles.commentOptionsSheet}>
                <View style={styles.commentHandle} />
                <Text style={styles.commentOptionsTitle}>خيارات التعليق</Text>
                <View style={styles.commentOptionsRow}>
                  <Pressable
                    style={styles.commentOption}
                    onPress={() => {
                      const selected = commentActionsComment;
                      setCommentActionsComment(null);
                      setCommentEditingId(selected.id);
                      setCommentText(selected.text);
                      setCommentInputOpen(true);
                    }}
                  >
                    <View style={styles.commentOptionIcon}><Feather name="edit-3" size={19} color={C.accent} /></View>
                    <Text style={styles.commentOptionText}>تعديل</Text>
                  </Pressable>
                  <Pressable
                    style={styles.commentOption}
                    onPress={async () => {
                      const selected = commentActionsComment;
                      setCommentActionsComment(null);
                      await Clipboard.setStringAsync(selected.text);
                      showCommentToast("تم النسخ");
                    }}
                  >
                    <View style={styles.commentOptionIcon}><Feather name="copy" size={19} color={C.accent} /></View>
                    <Text style={styles.commentOptionText}>نسخ</Text>
                  </Pressable>
                  <Pressable style={styles.commentOption} onPress={() => handleDeleteComment(commentActionsComment)}>
                    <View style={[styles.commentOptionIcon, styles.commentDeleteIcon]}><Feather name="trash-2" size={19} color="#EF4444" /></View>
                    <Text style={[styles.commentOptionText, styles.commentDeleteText]}>حذف</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {commentToast && (
            <View pointerEvents="none" style={[styles.commentToast, { bottom: Math.max(insets.bottom, 12) }]}>
              <Feather name="check" size={15} color="#FFF" />
              <Text style={styles.commentToastText}>{commentToast}</Text>
            </View>
          )}
        </View>
      </Modal>

      {/* ── Share post/reel modal — same internal sharing flow as products ── */}
      <ShareModal
        visible={!!sharePost}
        onClose={() => setSharePost(null)}
        title={sharePost?.userName || "منشور"}
        cardImage={sharePost?.url}
        cardTitle={sharePost?.description?.trim() || `منشور من ${sharePost?.userName || "مستخدم"}`}
        cardRoute={sharePost ? `/dashboard?postId=${encodeURIComponent(sharePost.id)}` : undefined}
        deepLinkPath={sharePost ? `post/${sharePost.id}` : undefined}
        cardDetails={
          sharePost
            ? [
                `👤 ${sharePost.userName}`,
                sharePost.mediaType === "video" ? "🎬 ريلز" : "🖼️ منشور صورة",
              ]
            : undefined
        }
        shareText={
          sharePost
            ? `📱 منشور عبر تطبيق FORUS\n\n👤 ${sharePost.userName}${sharePost.description ? `\n\n${sharePost.description}` : ""}`
            : ""
        }
        shareMessage={
          sharePost
            ? `📱 شاهد منشور ${sharePost.userName} على تطبيق FORUS`
            : ""
        }
        onShared={() => {
          const viewer = auth.currentUser;
          if (viewer && sharePost) {
            void createActivityNotification({
              recipientId: sharePost.userId,
              actorId: viewer.uid,
              type: "share",
              title: "مشاركة جديدة",
              body: "تمت مشاركة منشورك",
              entityId: sharePost.id,
              entityType: "post",
            });
          }
        }}
      />

      {/* ── Share product modal ── */}
      <ShareModal
        visible={!!shareProduct}
        onClose={() => setShareProduct(null)}
        title={shareProduct?.title || "منتج"}
        cardImage={shareProduct?.imageUrl}
        cardTitle={shareProduct?.title}
        cardRoute={shareProduct ? `/dashboard?productId=${encodeURIComponent(shareProduct.id)}` : undefined}
        deepLinkPath={shareProduct ? `product/${shareProduct.id}` : undefined}
        cardDetails={
          shareProduct
            ? [
                `💰 ${shareProduct.price.toLocaleString("ar-IQ-u-nu-latn")} د.ع`,
                `👤 ${shareProduct.sellerName}`,
              ]
            : undefined
        }
        shareText={
          shareProduct
            ? `🛍️ منتج للبيع عبر تطبيق FORUS\n\n📦 ${shareProduct.title}\n💰 السعر: ${shareProduct.price.toLocaleString("ar-IQ-u-nu-latn")} د.ع\n👤 البائع: ${shareProduct.sellerName}${shareProduct.description ? "\n\n" + shareProduct.description : ""}`
            : ""
        }
        shareMessage={
          shareProduct
            ? `🛍️ منتج للبيع: ${shareProduct.title}\n💰 ${shareProduct.price.toLocaleString("ar-IQ-u-nu-latn")} د.ع — من تطبيق FORUS`
            : ""
        }
      />

      {/* ── Fullscreen image viewer ── */}
      <Modal
          visible={!!fullscreenMedia}
        transparent
        animationType="fade"
        statusBarTranslucent
          onRequestClose={() => setFullscreenMedia(null)}
      >
          <View style={styles.fullscreenOverlay}>
            {fullscreenMedia?.type === "video" ? (
              <Video
                ref={(video) => {
                  fullscreenVideoRef.current = video;
                }}
                source={{ uri: fullscreenMedia.url }}
                style={styles.fullscreenImage}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={fullscreenMediaPosition <= 0}
                onLoad={async () => {
                  const video = fullscreenVideoRef.current;
                  if (!video) return;
                  if (fullscreenMediaPosition > 0) {
                    await video.setPositionAsync(fullscreenMediaPosition).catch(() => {});
                  }
                  await video.playAsync().catch(() => {});
                }}
                isMuted={isAudioMuted}
                useNativeControls
                progressUpdateIntervalMillis={250}
              />
            ) : fullscreenMedia ? (
              <Image
                source={{ uri: fullscreenMedia.url }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
            ) : null}
            <TouchableOpacity style={styles.fullscreenClose} onPress={() => setFullscreenMedia(null)}>
            <Feather name="x" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: C.background,
    ...(Platform.OS === "web" ? ({ height: "100vh", overflow: "hidden" } as any) : null),
  },
  stickyBar: { backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: C.border },
  listWrapper: { flex: 1, minHeight: 0 },
  headerGrad: { paddingBottom: -47, paddingHorizontal: 20, gap: 14 },

  // ── Story strip ────────────────────────────────────────────────────────────
  storyStrip: { flexGrow: 0, marginHorizontal: -20 },
  storyStripContent: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  storyCircleWrap: { alignItems: "center", gap: 5 },
  /** Outer ring — provides the coloured border */
  storyRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  storyRingUnseen: { borderColor: C.accent },          // gold = new story
  storyRingSeen:   { borderColor: "rgba(255,255,255,0.25)" }, // dim = already seen
  storyRingMine:   { borderColor: "#4BFF8A" },          // green = I have a story
  storyRingEmpty:  { borderColor: "rgba(255,255,255,0.2)" },  // plain = no story yet
  storyProgressOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Inner clip circle */
  storyInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  /** + badge on the user's own circle */
  storyAddBadge: {
    position: "absolute",
    bottom: -1,
    right: -1,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#0D1B3E",
  },
  storyLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    maxWidth: 64,
  },
  headerActions: {
    position: "relative",
    width: "100%",
    height: 66,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: -16,
  },

  headerRightGroup: {
    position: "absolute",
    right: -32,
    top: 0,
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 2,
  },

  headerLeftGroup: {
    position: "absolute",
    left: 4,
    top: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 2,
  },
  newMenu: {
    position: "absolute",
    left: 46,
    top: 42,
    width: 160,
    backgroundColor: "#FFF",
    borderRadius: 12,
    overflow: "hidden",
    zIndex: 100,
    elevation: 20,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  newMenuItem: {
    height: 50,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  newMenuText: {
    color: "#111",
    fontSize: 14,
    fontFamily: undefined,
  },
  newMenuDivider: {
    height: 1,
    backgroundColor: "#E5E5E5",
  },
  addPostHeaderBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: C.accent, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, marginTop: 2,
  },
  addPostHeaderText: { fontSize: 11, fontFamily: undefined, color: C.primary },
  homeFeedContent: { paddingHorizontal: 8, paddingTop: 10 },
  homeFeedIntro: { paddingHorizontal: 8, paddingBottom: 12 },
  homeFeedHeaderRow: { flexDirection: "column", alignItems: "flex-end", gap: 8 },
  homeFeedIntroText: { flex: 1, alignItems: "flex-end" },
  addPostBtn: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, minHeight: 40 },
  addPostBtnText: { fontSize: 12, fontFamily: undefined, color: "#FFF" },
  homeFeedTitle: { fontSize: 19, fontFamily: undefined, color: C.text, textAlign: "right" },
  homeFeedSubtitle: { fontSize: 12, fontFamily: undefined, color: C.textSecondary, marginTop: 2, textAlign: "right" },
  homePostCard: {
    backgroundColor: C.card, borderRadius: 14, marginBottom: 14, overflow: "hidden",
    borderWidth: 1, borderColor: C.border,
  },
  homePostHeader: { flexDirection: "row-reverse", alignItems: "center", padding: 12, gap: 9 },
  homePostProfileTouchable: { flex: 1, flexDirection: "row", alignItems: "center", gap: 1, margin: 0, padding: 0 },
  homePostDelete: { width: 34, height: 34, borderRadius: 11, backgroundColor: "rgba(0,0,0,.68)", alignItems: "center", justifyContent: "center" },
  homePostReport: { marginLeft: 2 },
  homeMediaPressable: { width: "100%" },
  homeMuteBtn: { position: "absolute", right: 12, bottom: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,.48)", alignItems: "center", justifyContent: "center" },
  homePostUser: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flex: 1, margin: 0, padding: 0 },
  homePostName: { fontSize: 16, margin: 0, padding: 0 },
  homePostDescriptionHeader: { fontSize: 14, lineHeight: 21, fontFamily: undefined, color: C.textSecondary, marginTop: 2, textAlign: "right" },
  homePostTime: { margin: 0, padding: 0 },
  homeMedia: { width: "100%", height: 390, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  homePlay: { width: 62, height: 62, borderRadius: 31, backgroundColor: "rgba(0,0,0,.45)", alignItems: "center", justifyContent: "center" },
  homePostDescription: { fontSize: 13, color: C.text, textAlign: "left", width: "100%", paddingHorizontal: 4, paddingTop: 10, fontFamily: undefined },
  homeActions: { flexDirection: "row-reverse", alignItems: "center", padding: 11, gap: 18 },
  homeAction: { flexDirection: "row", alignItems: "center", gap: 5 },
  homeActionText: { fontSize: 12, fontFamily: undefined, color: C.textSecondary },
  likedCountText: { color: "#EF4444" },
  reelsRoot: { flex: 1, backgroundColor: "#000" },
  reelPage: { width: Dimensions.get("window").width, height: Dimensions.get("window").height, backgroundColor: "#000" },
  reelOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between", padding: 18, paddingTop: 52 },
  reelTopRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", width: "100%" },
  reelTopActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  reelClose: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,.35)", alignItems: "center", justifyContent: "center" },
  reelMuteBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,.35)", alignItems: "center", justifyContent: "center" },
  reelReportBtn: { width: 42, height: 42, borderRadius: 21 },
  reelBottomArea: { position: "relative", minHeight: 220, justifyContent: "flex-end", paddingBottom: 4 },
  reelActions: { position: "absolute", right: 2, bottom: 78, gap: 20, alignItems: "center" },
  reelProfileColumn: { width: 68, alignItems: "center", gap: 4 },
  reelAvatarWrap: { position: "relative", width: 54, height: 54, alignItems: "center", justifyContent: "center" },
  reelFollowBadge: { position: "absolute", right: -3, bottom: -2, width: 21, height: 21, borderRadius: 11, backgroundColor: C.accent, borderWidth: 2, borderColor: "#FFF", alignItems: "center", justifyContent: "center" },
  reelFollowBadgeFollowing: { backgroundColor: "#22C55E" },
  reelFollowBadgeText: { color: "#FFF", fontSize: 14, lineHeight: 17, fontFamily: undefined },
  reelName: { color: "#FFF", fontSize: 11, fontFamily: undefined, textAlign: "center", maxWidth: 68 },
  reelDescriptionBottom: { color: "#FFF", fontSize: 12, lineHeight: 19, fontFamily: undefined, textAlign: "right", marginRight: 82, marginLeft: 8, marginBottom: 78 },
  reelAction: { alignItems: "center", gap: 2 },
  reelCount: { color: "#FFF", fontSize: 12, fontFamily: undefined },
  commentBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,.55)", justifyContent: "flex-end", paddingBottom: 0, marginBottom: 0 },
  commentSheetKeyboard: { width: "100%", paddingBottom: 0, marginBottom: 0 },
  commentSheet: { position: "relative", backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 14, paddingBottom: 0, marginBottom: 0, bottom: 0, height: "80%", overflow: "hidden" },
  commentHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: "center", marginBottom: 9 },
  commentHeaderRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingBottom: 8 },
  commentTitle: { fontSize: 17, fontFamily: undefined, color: C.text, textAlign: "right" },
  commentCloseBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.background, alignItems: "center", justifyContent: "center" },
  commentsList: { flex: 1, minHeight: 0 },
  commentsListContent: { paddingTop: 4, paddingBottom: 64, gap: 2 },
  commentsEmptyContent: { flexGrow: 1, justifyContent: "center" },
  commentsState: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 30 },
  commentsStateText: { fontSize: 12, fontFamily: undefined, color: C.textMuted },
  commentRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, paddingVertical: 8, paddingHorizontal: 2 },
  commentReplyRow: {
    marginStart: 28,
    paddingStart: 10,
    borderStartWidth: 2,
    borderStartColor: C.border,
  },

  commentThread: {
    width: "100%",
  },

  commentRepliesToggle: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 7,
    marginTop: 6,
    marginBottom: 2,
  },

  commentRepliesLine: {
    width: 22,
    height: 1,
    backgroundColor: C.border,
  },

  commentRepliesToggleText: {
    fontSize: 11,
    fontFamily: undefined,
    color: C.accent,
    textAlign: "left",
  },

  commentReplyGroup: {
    width: "100%",
  },
  nestedRepliesContainer: {
    marginLeft: 40,
    marginTop: 4,
    gap: 5,
  },
  nestedReplyItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  nestedReplyBubble: {
    flex: 1,
    backgroundColor: C.background,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  commentRepliesContainer: {
    marginStart: 46,
    paddingStart: 10,
    marginTop: 3,
    borderStartWidth: 2,
    borderStartColor: C.border,
    gap: 8,
  },

  commentReplyItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    width: "100%",
  },

  commentReplyBubble: {
    flex: 1,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },

  commentReplyMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 3,
  },

  commentReplyUserName: {
    flexShrink: 1,
    fontSize: 11,
    fontFamily: undefined,
    color: C.text,
    textAlign: "left",
  },

  commentReplyTime: {
    fontSize: 9,
    fontFamily: undefined,
    color: C.textMuted,
    textAlign: "left",
  },

  commentReplyTextBody: {
    fontSize: 12,
    lineHeight: 20,
    fontFamily: undefined,
    color: C.text,
    textAlign: "left",
  },
  commentBody: { flex: 1, backgroundColor: C.background, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8 },
  commentMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  commentUserName: { flexShrink: 1, fontSize: 12, fontFamily: undefined, color: C.text, textAlign: "left" },
  commentTime: { fontSize: 9, fontFamily: undefined, color: C.textMuted },
  commentText: { marginTop: 3, fontSize: 12, lineHeight: 20, fontFamily: undefined, color: C.text, textAlign: "left" },
  commentEditCancel: { alignSelf: "flex-end", paddingHorizontal: 6, paddingVertical: 4 },
  commentEditCancelText: { fontSize: 10, fontFamily: undefined, color: C.accent },
  commentActionsRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 16,
    marginTop: 7,
  },
  commentActionButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
  },
  commentActionCount: {
    fontSize: 12,
    color: C.textMuted,
  },
  commentActionCountLiked: {
    color: "#e53935",
  },
  commentReplyButton: {
    paddingVertical: 2,
  },
  commentReplyText: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: "600",
  },
  commentComposer: { position: "absolute", left: 0, right: 0, bottom: 40, flexDirection: "row-reverse", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card, paddingTop: 10, paddingHorizontal: 14, paddingBottom: 0, marginTop: 0, marginBottom: 0 },
  commentComposerFakeInput: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: C.border, backgroundColor: C.background, borderRadius: 15, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  commentComposerPlaceholder: { flex: 1, fontSize: 12, fontFamily: undefined, color: C.textMuted, textAlign: "right" },
  commentComposerSend: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.background, alignItems: "center", justifyContent: "center" },
  commentSendDisabled: { opacity: 0.45 },
  commentInputOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,.42)", zIndex: 20 },
  commentInputKeyboard: { flex: 1, justifyContent: "flex-end" },
  commentInputSheet: { position: "relative", bottom: 0, backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 14, paddingBottom: 0, marginBottom: 0, minHeight: 245 },
  commentInputHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 3, paddingBottom: 8 },
  commentInputTitle: { fontSize: 16, fontFamily: undefined, color: C.text, textAlign: "right" },
  commentInputClose: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: C.background },
  commentEmojiRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border },
  commentEmojiButton: { width: 34, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.background },
  commentEmoji: { fontSize: 18 },
  commentSelectedImageWrap: {
    position: "relative",
    alignSelf: "flex-start",
    marginTop: 8,
    marginBottom: 2,
  },
  commentSelectedImage: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: C.background,
  },
  commentSelectedImageRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.68)",
  },
  commentImage: {
    width: 180,
    height: 180,
    borderRadius: 12,
    marginTop: 7,
    backgroundColor: C.background,
  },
  commentReplyImage: {
    width: 145,
    height: 145,
  },
  commentInputRow: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 8, paddingTop: 11 },
  commentLargeInput: { flex: 1, minHeight: 108, maxHeight: 190, borderWidth: 1, borderColor: C.accent, backgroundColor: C.background, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 11, color: C.text, fontFamily: undefined, fontSize: 14, lineHeight: 23, textAlignVertical: "top" },
  commentInputSend: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  commentOptionsOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,.28)", justifyContent: "flex-end", zIndex: 30 },
  commentOptionsSheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 18, paddingBottom: 0, marginBottom: 0 },
  commentOptionsTitle: { fontSize: 15, fontFamily: undefined, color: C.text, textAlign: "center", paddingVertical: 8 },
  commentOptionsRow: { flexDirection: "row-reverse", justifyContent: "space-around", paddingTop: 8 },
  commentOption: { alignItems: "center", gap: 6, minWidth: 78 },
  commentOptionIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.background, alignItems: "center", justifyContent: "center" },
  commentDeleteIcon: { backgroundColor: "rgba(239,68,68,.1)" },
  commentOptionText: { fontSize: 11, fontFamily: undefined, color: C.textSecondary },
  commentDeleteText: { color: "#EF4444" },
  commentToast: { position: "absolute", alignSelf: "center", flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 20, backgroundColor: "rgba(25,25,25,.94)", zIndex: 50 },
  commentToastText: { color: "#FFF", fontSize: 12, fontFamily: undefined },

  headerIconCol: {
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
    width: 40,
    minWidth: 40,
    maxWidth: 40,
    zIndex: 10,
    elevation: 10,
    marginHorizontal: 0,
  },
  headerIconLabel: {
    fontSize: 10, fontFamily: undefined,
    color: "rgba(255,255,255,0.85)", textAlign: "center",
  },
  featuredBadgeRow: {
    flexDirection: "row", justifyContent: "flex-end", marginTop: 2,
  },
  featuredBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#C9A84C", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: "flex-end",
  },
  featuredBadgeText: { fontSize: 10, fontFamily: undefined, color: "#0D1B3E" },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  // ── Header utility row: promote + search ──
  headerUtilRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 10, gap: 10,
  },
  promoteHeaderBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(201,168,76,0.15)", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: "rgba(201,168,76,0.35)",
    flex: 1,
  },
  promoteHeaderBtnText: {
    fontSize: 13, fontFamily: undefined, color: C.accent,
  },
  searchCircleBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  categoryTabsWrapper: { backgroundColor: "#FFF", maxHeight: 54 },
  serviceCategoryTabsWrapper: {
    backgroundColor: "#FFF",
    maxHeight: 54,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  serviceCategoryTabs: {
    width: "100%",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
    flexDirection: "row",
  },
  serviceCatTab: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: C.background,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  serviceCatTabText: {
    flexShrink: 1,
    textAlign: "center",
    fontSize: 11,
    fontFamily: undefined,
    color: C.textSecondary,
  },
  mainCategoryTabs: {
    width: "100%",
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 6,
    flexDirection: "row",
  },
  mainCatTab: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: C.background,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  mainCatTabText: {
    flexShrink: 1,
    textAlign: "center",
    fontSize: 14,
    fontFamily: undefined,
    color: C.textSecondary,
  },
  categoryTabs: {
    paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: "row",
  },
  catTab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, backgroundColor: C.background,
    borderWidth: 1.5, borderColor: "transparent",
  },
  catTabActive: {
    backgroundColor: C.accent, borderColor: C.accent,
  },
  catTabText: { fontSize: 13, fontFamily: undefined, color: C.textSecondary },
  catTabTextActive: { color: C.primary },
  listContent: { padding: 16, gap: 12 },
  listHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 4,
  },
  listCount: { fontSize: 13, fontFamily: undefined, color: C.textSecondary },
  sortedBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(201,168,76,0.1)", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  sortedText: { fontSize: 11, fontFamily: undefined, color: C.accent },
  restaurantCard: {
    width: "100%",
    marginBottom: 16,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 7,
  },

  restaurantHero: {
    height: 220,
    width: "100%",
    position: "relative",
    overflow: "hidden",
    justifyContent: "flex-end",
  },

  restaurantBannerInitials: {
    position: "absolute",
    alignSelf: "center",
    top: 72,
    fontSize: 54,
    fontWeight: "900",
    color: "rgba(255,255,255,0.20)",
  },

  restaurantFeaturedBadge: {
    position: "absolute",
    top: 14,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.94)",
  },

  restaurantFeaturedText: {
    fontSize: 11,
    fontWeight: "800",
    color: C.primary,
  },

  restaurantLogoWrap: {
    position: "absolute",
    right: 18,
    bottom: 48,
    width: 76,
    height: 76,
    borderRadius: 38,
    padding: 3,
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 8,
  },

  restaurantLogo: {
    width: "100%",
    height: "100%",
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  restaurantLogoInitials: {
    fontSize: 23,
    fontWeight: "900",
    color: C.accent,
  },

  restaurantStatusDot: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    bottom: 2,
    left: 2,
    borderWidth: 3,
    borderColor: "#FFF",
  },

  restaurantStatusOpen: {
    backgroundColor: "#22C55E",
  },

  restaurantStatusClosed: {
    backgroundColor: "#EF4444",
  },

  restaurantHeroText: {
    paddingHorizontal: 18,
    paddingBottom: 17,
    paddingRight: 108,
  },

  restaurantName: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "right",
  },

  restaurantCuisine: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 5,
    textAlign: "right",
  },

  restaurantInfoBar: {
    minHeight: 58,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.card,
  },

  restaurantInfoItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },

  restaurantReviewCount: {
    fontSize: 10,
    fontFamily: undefined,
    color: C.textMuted,
    marginStart: 3,
  },
  restaurantInfoValue: {
    color: C.text,
    fontSize: 11,
    fontWeight: "800",
  },

  restaurantInfoDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255,255,255,0.10)",
  },

  restaurantLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  restaurantOpenText: {
    color: "#22C55E",
  },

  restaurantClosedText: {
    color: "#EF4444",
  },

  artisanCard: {
    backgroundColor: C.card, borderRadius: 16, padding: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  cardLeft: { position: "relative" },
  artisanPhoto: { width: 58, height: 58, borderRadius: 14 },
  artisanInitials: {
    width: 58, height: 58, borderRadius: 14,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  initialsText: { fontSize: 20, fontFamily: undefined, color: C.accent },
  availDot: {
    position: "absolute", bottom: 2, right: 2,
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: C.card,
  },
availOnline: { backgroundColor: "#22C55E" },
  availOffline: { backgroundColor: "#9CA3AF" },
  cardBody: { flex: 1, gap: 4 },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  artisanName: { fontSize: 15, fontFamily: undefined, color: C.text, flex: 1, textAlign: "right" },
  specialtyBadge: {
    backgroundColor: "rgba(13,27,62,0.07)", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  specialtyText: { fontSize: 11, fontFamily: undefined, color: C.primary },
  cardMidRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "flex-end" },
  ratingText: { fontSize: 12, fontFamily: undefined, color: C.text },
  reviewCount: { fontSize: 11, fontFamily: undefined, color: C.textMuted },
  artisanBio: { fontSize: 12, fontFamily: undefined, color: C.textSecondary, textAlign: "right" },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  distancePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(201,168,76,0.1)", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  distanceText: { fontSize: 11, fontFamily: undefined, color: C.accent },
  availText: { fontSize: 11, fontFamily: undefined },
  availOnlineText: { color: "#22C55E" },
  availOfflineText: { color: C.textMuted },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: undefined, color: C.text },
  emptySubtitle: { fontSize: 14, fontFamily: undefined, color: C.textSecondary },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "#EF4444",
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#0D1B3E",
    zIndex: 10,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: undefined,
    color: "#FFF",
    lineHeight: 11,
  },
  btnDisabled: { opacity: 0.6 },

  // ── Product card  share button ──
  productShareBtn: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  productReportBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 10,
  },

  // ── Inline search bars ─────────────────────────────────────────────────────
  inlineSearchRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.inputBg,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 8 : 5,
    borderWidth: 1,
    borderColor: C.border,
  },
  inlineSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: C.text,
    textAlign: "right",
    paddingVertical: 0,
  },
  searchClearBtn: {
    padding: 2,
  },
  productsSubBar: {
    position: "relative",
    alignItems: "center",
    minHeight: 54,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  productSearchRow: {
    position: "absolute",
    left: 124,
    right: 12,
    top: 9,
    bottom: 9,
  },
  addProductProgressWrap: {
    position: "absolute",
    left: 7,
    top: 6,
    width: 136,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  addProductBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFF8EC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.accent,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  productProgressOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  addProductBtnPinned: {
    position: "absolute",
    left: 12,
    top: 9,
  },
  addProductBtnText: {
    fontSize: 13,
    fontFamily: undefined,
    color: C.accent,
  },

  // ── Products bar ──
  productsBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: C.background,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  productsBarTitle: { fontSize: 15, fontFamily: undefined, color: C.text },
  productsBtnsGroup: { flexDirection: "row", gap: 8, alignItems: "center" },
  ordersBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(201,168,76,0.1)", borderRadius: 10,
    paddingHorizontal: 11, paddingVertical: 6,
    borderWidth: 1, borderColor: "rgba(201,168,76,0.3)",
  },
  ordersBtnText: { fontSize: 12, fontFamily: undefined, color: C.accent },

  // ── Product cards ──
  productsContent: { paddingTop: 12 },
  productListContent: { paddingHorizontal: 0 },
  productCard: {
    marginHorizontal: 2, marginBottom: 12,
    backgroundColor: C.card, borderRadius: 6, overflow: "hidden",
    shadowColor: C.shadow, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10, shadowRadius: 10, elevation: 4,
  },
  productCardSold: { opacity: 0.7 },
  productImage: { width: "100%", height: 210 },
  soldOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  soldOverlayText: { fontSize: 18, fontFamily: undefined, color: "#FFF" },
  productBody: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, gap: 6 },
  // Header row: title (right) ↔ seller name (left)
  productInfoStack: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 3,
  },
  productTitle: {
    fontSize: 16, fontFamily: undefined,
    color: C.text, textAlign: "left",
    width: "100%",
  },
  productSellerTouchable: {
    flexDirection: "column", alignItems: "flex-start", gap: 3, flexShrink: 0,
  },
  productSellerName: {
    fontSize: 16, fontFamily: undefined,
    color: C.accent, textAlign: "left",
  },
  productPriceLikesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  productPrice: {
    fontSize: 18, fontFamily: undefined,
    color: C.accent, textAlign: "left",
    flexShrink: 1,
  },
  productPriceLabel: { fontSize: 14, fontFamily: undefined, color: C.textSecondary },
  productCurrency: { fontSize: 13, fontFamily: undefined, color: C.accent },
  productDesc: { fontSize: 13, fontFamily: undefined, color: C.textSecondary, textAlign: "right" },
  productEngagement: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "flex-start", gap: 5,
    paddingTop: 0,
    flexShrink: 0,
  },
  productLikeButton: { alignItems: "center", justifyContent: "center" },
  productLikesText: { fontSize: 13, fontFamily: undefined, color: C.text },
  productLikesLabel: { fontSize: 12, fontFamily: undefined, color: C.textSecondary },
  productFeaturedBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: C.accent, borderRadius: 7,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  productFeaturedText: { fontSize: 10, fontFamily: undefined, color: C.primary },
  buyBtn: { marginHorizontal: 14, marginTop: 10, marginBottom: 14, borderRadius: 12, overflow: "hidden" },
  buyBtnGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 13, gap: 6,
  },
  buyBtnText: { fontSize: 15, fontFamily: undefined, color: C.primary },

  // Delete button (seller view)
  deleteBtn: { backgroundColor: "transparent" },
  deleteBtnInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 13, gap: 6,
    backgroundColor: "#EF4444", borderRadius: 12,
  },
  deleteBtnText: { fontSize: 15, fontFamily: undefined, color: "#FFF" },

  // Cancel-order button (buyer with pending order)
  cancelOrderBtn: { backgroundColor: "transparent" },
  cancelOrderBtnInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 13, gap: 6,
    backgroundColor: "#F59E0B", borderRadius: 12,
  },
  cancelOrderBtnText: { fontSize: 15, fontFamily: undefined, color: "#FFF" },

  // ── Buy Details Modal ──
  buyModalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end",
  },
  buyModalSheet: {
    backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 12,
  },
  buyModalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: "center", marginBottom: 8,
  },
  buyModalTitle: {
    fontSize: 18, fontFamily: undefined, color: C.text,
    textAlign: "center",
  },
  buyModalProductName: {
    fontSize: 14, fontFamily: undefined, color: C.textSecondary,
    textAlign: "right",
  },
  buyModalPriceText: {
    fontSize: 20, fontFamily: undefined, color: C.accent, textAlign: "right",
  },
  buyModalCurrency: {
    fontSize: 14, fontFamily: undefined, color: C.accent,
  },
  buyModalSection: { gap: 8 },
  buyModalSectionLabel: {
    fontSize: 13, fontFamily: undefined, color: C.text, textAlign: "right",
  },
  buyModalOptional: {
    fontSize: 11, fontFamily: undefined, color: C.textMuted,
  },
  buyModalRequired: {
    fontSize: 13, fontFamily: undefined, color: "#4BFF8A",
  },
  chipRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: C.inputBg,
  },
  chipActive: { borderColor: C.accent, backgroundColor: "rgba(201,168,76,0.12)" },
  chipText: { fontSize: 13, fontFamily: undefined, color: C.textSecondary },
  chipTextActive: { color: C.accent },
  buyModalConfirmBtn: { borderRadius: 12, overflow: "hidden", marginTop: 4 },

  // ── Fullscreen viewer ──
  fullscreenOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center", justifyContent: "center",
  },
  fullscreenImage: { width: "100%", height: "80%" },
  fullscreenClose: {
    position: "absolute", top: 52, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
});
