import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  Share,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Circle, Rect } from "react-native-svg";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { auth } from "../lib/firebase";
import { Video, ResizeMode } from "expo-av";
import { ShareModal } from "@/components/ShareModal";
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
  ALL_SPECIALTIES,
  isFeaturedActive,
  subscribeToUserChatLastAts,
  fetchProductsOnce,
  deleteProduct,
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
  toggleProfilePostLike,
  addProfilePostComment,
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
  performSignOut,
} from "../lib/push_notifications";
import { useProfileCheck } from "@/hooks/useProfileCheck";
import ProfileAvatar from "@/components/ProfileAvatar";
import ProductMediaCarousel, { normalizeProductMedia } from "@/components/ProductMediaCarousel";
import ProductPurchaseButton from "@/components/ProductPurchaseButton";
import ReservationsScreen from "./reservations";

const C = Colors.light;
const STORY_PUBLISH_PROGRESS_KEY = (userId: string) => `@forus:storyPublishProgress:${userId}`;
const PRODUCT_PUBLISH_PROGRESS_KEY = (userId: string) => `@forus:productPublishProgress:${userId}`;
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * 29;

type CategoryTab = "home" | "products" | "services" | "orders";

const CATEGORY_TABS: { key: CategoryTab; label: string }[] = [
  { key: "home", label: "الرئيسية" },
  { key: "products", label: "المنتجات" },
  { key: "services", label: "الخدمات" },
  { key: "orders", label: "الطلبات" },
];

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

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
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

function StarRow({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.4;
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= full ? "star" : half && i === full + 1 ? "star-half" : "star-outline"}
          size={12}
          color="#F59E0B"
        />
      ))}
    </View>
  );
}


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

  const initials = artisan.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <Pressable
        style={({ pressed }) => [styles.artisanCard, pressed && { opacity: 0.92 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          // Pass the already-fetched artisan object along so the profile screen
          // can render instantly instead of waiting on a fresh Firestore read.
          router.push({
            pathname: "/artisan-profile",
            params: { artisanId: artisan.id, artisan: JSON.stringify(artisan) },
          });
        }}
      >
        <View style={styles.cardLeft}>
          {artisan.photoUri ? (
            <Image source={{ uri: artisan.photoUri }} style={styles.artisanPhoto} />
          ) : (
            <View style={styles.artisanInitials}>
              <LinearGradient colors={[C.primary, "#1E2F60"]} style={StyleSheet.absoluteFill} />
              <Text style={styles.initialsText}>{initials}</Text>
            </View>
          )}
          <View style={[styles.availDot, artisan.isAvailable ? styles.availOnline : styles.availOffline]} />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <View style={styles.specialtyBadge}>
              <Text style={styles.specialtyText}>{getSpecialtyLabel(artisan.specialty)}</Text>
            </View>
            <Text style={styles.artisanName} numberOfLines={1}>{artisan.name}</Text>
          </View>
          {isFeaturedActive(artisan) && (
            <View style={styles.featuredBadgeRow}>
              <View style={styles.featuredBadge}>
                <Ionicons name="star" size={10} color={C.primary} />
                <Text style={styles.featuredBadgeText}>مميز</Text>
              </View>
            </View>
          )}

          <View style={styles.cardMidRow}>
            <StarRating rating={artisan.rating} />
            <Text style={styles.ratingText}>
              {artisan.rating > 0 ? artisan.rating.toFixed(1) : "جديد"}{" "}
              {artisan.reviewCount > 0 && <Text style={styles.reviewCount}>({artisan.reviewCount})</Text>}
            </Text>
          </View>

          {artisan.bio ? (
            <Text style={styles.artisanBio} numberOfLines={4}>{artisan.bio}</Text>
          ) : null}
          <View style={styles.cardFooter}>
            {distance !== null ? (
              <View style={styles.distancePill}>
                <Feather name="map-pin" size={11} color={C.accent} />
                <Text style={styles.distanceText}>
                  {distance < 1
                    ? `${Math.round(distance * 1000)} م`
                    : `${distance.toFixed(1)} كم`}
                </Text>
              </View>
            ) : (
              <View style={styles.distancePill}>
                <Feather name="map-pin" size={11} color={C.textMuted} />
                <Text style={[styles.distanceText, { color: C.textMuted }]}>موقع غير متاح</Text>
              </View>
            )}
            <Text style={[styles.availText, artisan.isAvailable ? styles.availOnlineText : styles.availOfflineText]}>
              {artisan.isAvailable ? "متاح الآن" : "غير متاح"}
            </Text>
          </View>
        </View>

        <Feather name="chevron-left" size={18} color={C.textMuted} />
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
  onMediaPress: (item: ProductMedia) => void;
  onLoadingChange: (productId: string | null) => void;
}) {
  const isFocused = useIsFocused();
  const isVisible = isFocused && isActive;
  const isMine = product.sellerId === userId;
  const [likesCount, setLikesCount] = useState(product.likesCount ?? 0);

  useEffect(() => {
    setLikesCount(product.likesCount ?? 0);
  }, [product.likesCount]);

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

  return (
    <View style={styles.productCard}>
      <Pressable
        style={styles.productShareBtn}
        onPress={onShare}
        accessibilityLabel="مشاركة المنتج"
      >
        <Feather name="share-2" size={13} color={C.accent} />
      </Pressable>
      <View><ProductMediaCarousel
          media={normalizeProductMedia(product.media, product.imageUrl)}
          height={380}
          isVisible={isVisible}
          onMediaPress={onMediaPress}
          onDoubleTapLike={async () => {
            const viewer = auth.currentUser;
            if (!viewer || isMine) return false;
            setLikesCount((count) => count + 1);
            try {
              const liked = await likeProduct(viewer.uid, product.id);
              if (!liked) setLikesCount((count) => Math.max(0, count - 1));
              return liked;
            } catch (error) {
              setLikesCount((count) => Math.max(0, count - 1));
              throw error;
            }
          }}
        />
      </View>
      <View style={styles.productBody}>
        <View style={styles.productHeaderRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({
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
        </View>
        <Text style={styles.productPrice}>
          <Text style={styles.productPriceLabel}>السعر: </Text>
          {product.price.toLocaleString("ar-IQ")}{" "}
          <Text style={styles.productCurrency}>د.ع</Text>
        </Text>
        {product.description ? (
          <Text style={styles.productDesc} numberOfLines={2}>{product.description}</Text>
        ) : null}
        <View style={styles.productEngagement}>
          <Ionicons name="heart" size={15} color="#EF4444" />
          <Text style={styles.productLikesText}>{likesCount}</Text>
          <Text style={styles.productLikesLabel}>إعجاب</Text>
        </View>
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


function HomeFeedCard({
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
            {!!post.description && <Text style={styles.homePostDescriptionHeader} numberOfLines={3}>{post.description}</Text>}
            <Text style={styles.homePostTime}>{post.createdAt ? new Date(post.createdAt).toLocaleString("ar-IQ") : "منذ قليل"}</Text>
          </View>
        </TouchableOpacity>
      </View>

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
      </View>
    </View>
  );
}

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
}) {
  const videos = posts.filter((p) => p.mediaType === "video");
  const [activeIndex, setActiveIndex] = useState(index);
  const [muted, setMuted] = useState(true);
  const [followedUserIds, setFollowedUserIds] = useState<Set<string>>(new Set());
  const reelLastTapRef = useRef(0);
  const reelViewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;
  const reelViewabilityHandler = useRef(
    ({ viewableItems }: { viewableItems: Array<any> }) => {
      const first = viewableItems?.find((entry) => entry?.isViewable && entry?.index != null);
      if (first?.index != null) setActiveIndex(first.index);
    }
  ).current;

  useEffect(() => {
    if (visible) {
      setActiveIndex(Math.min(Math.max(0, index), Math.max(0, videos.length - 1)));
      setMuted(true);
      setFollowedUserIds(new Set());
    }
  }, [visible, index, videos.length]);

  useEffect(() => {
    const viewer = auth.currentUser;
    const current = videos[activeIndex];
    if (!visible || !viewer || !current || viewer.uid === current.userId) return;
    let cancelled = false;
    getIsFollowing(viewer.uid, current.userId)
      .then((following) => {
        if (cancelled) return;
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
          viewabilityConfig={reelViewabilityConfig}
          onViewableItemsChanged={reelViewabilityHandler}
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
                    <Pressable
                      onPress={() => setMuted((value) => !value)}
                      style={styles.reelMuteBtn}
                      accessibilityRole="button"
                      accessibilityLabel={muted ? "تشغيل صوت الريلز" : "كتم صوت الريلز"}
                    >
                      <Ionicons name={muted ? "volume-mute" : "volume-high"} size={21} color="#FFF" />
                    </Pressable>
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
                                try {
                                  if (isFollowing) {
                                    await unfollowArtisan(viewer.uid, item.userId);
                                    setFollowedUserIds((prev) => { const next = new Set(prev); next.delete(item.userId); return next; });
                                  } else {
                                    await followArtisan(viewer.uid, item.userId);
                                    setFollowedUserIds((prev) => new Set(prev).add(item.userId));
                                  }
                                } catch (e) { console.warn("follow toggle failed", e); }
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


export default function DashboardScreen() {
  const { productId: sharedProductId } = useLocalSearchParams<{ productId?: string }>();
  // Screen-level focus — drives video start/stop & viewability guard
const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [artisans, setArtisans] = useState<ArtisanProfile[]>([]);
  const [userLocation, setUserLocation] = useState<GeoLocation | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryTab>("home");
  const [activeServiceCategory, setActiveServiceCategory] =
    useState<ServiceCategory>("home");
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState("المستخدم");
  const [userRole, setUserRole] = useState<"client" | "artisan" | "admin">("client");
  const [loading, setLoading] = useState(true);

  const [chatLastAts, setChatLastAts] = useState<string[]>([]);
  const [lastMsgSeen, setLastMsgSeen] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);

  // ── Marketplace ──
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsRefreshing, setProductsRefreshing] = useState(false);
  const [smartFeedSeed, setSmartFeedSeed] = useState(0);
  const [shareProduct, setShareProduct] = useState<Product | null>(null);
  const [fullscreenMedia, setFullscreenMedia] = useState<ProductMedia | null>(null);
  const [homeFeed, setHomeFeed] = useState<HomeFeedPost[]>([]);
  const [homeLoading, setHomeLoading] = useState(true);
  const [homeRefreshing, setHomeRefreshing] = useState(false);
  const [activeHomePostId, setActiveHomePostId] = useState<string | null>(null);
  const [homeVideoMuted, setHomeVideoMuted] = useState(true);
  const [isInlineVideoPlaying, setIsInlineVideoPlaying] = useState(true);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const homeResumeBlockedRef = useRef(false);
  const isReelsOpenRef = useRef(false);
  const isInlineVideoPlayingRef = useRef(true);
  const [reelIndex, setReelIndex] = useState(0);
  const [showReels, setShowReels] = useState(false);
  const [commentPost, setCommentPost] = useState<HomeFeedPost | null>(null);
  const [comments, setComments] = useState<HomeFeedComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentPosting, setCommentPosting] = useState(false);
  const [commentEditingId, setCommentEditingId] = useState<string | null>(null);
  const [commentInputOpen, setCommentInputOpen] = useState(false);
  const [commentActionsComment, setCommentActionsComment] = useState<HomeFeedComment | null>(null);
  const [commentToast, setCommentToast] = useState<string | null>(null);
  const commentInputRef = useRef<TextInput>(null);
  const commentToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [posting, setPosting] = useState(false);
  const [pendingPostMedia, setPendingPostMedia] = useState<{ uri: string; mediaType: "image" | "video"; mimeType?: string | null; fileName?: string | null } | null>(null);
  const [postCaption, setPostCaption] = useState("");

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
  const homeViewabilityConfig = useRef({ itemVisiblePercentThreshold: 65 }).current;
  const homeViewabilityHandler = useRef(
    ({ viewableItems }: { viewableItems: Array<any> }) => {
      if (!isFocusedRef.current || isReelsOpenRef.current || homeResumeBlockedRef.current || !isInlineVideoPlayingRef.current) return;
      const first = viewableItems?.find((entry) => entry?.isViewable && entry?.item?.id);
      if (first?.item?.id) setActiveHomePostId(first.item.id);
    }
  ).current;

  const loadHomeFeed = useCallback(async (refresh = false) => {
    if (refresh) setHomeRefreshing(true); else setHomeLoading(true);
    try { setHomeFeed(await getHomeFeedPosts()); }
    catch (e) { console.error("Home feed error", e); }
    finally { setHomeLoading(false); setHomeRefreshing(false); }
  }, []);

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
    if (!uid || !pendingPostMedia) return;
    setPosting(true);
    try {
      const uploaded = await uploadProfilePostMedia(uid, pendingPostMedia.uri, pendingPostMedia.mediaType, {
        mimeType: pendingPostMedia.mimeType,
        fileName: pendingPostMedia.fileName,
      });
      await addProfilePost(uid, {
        id: `${uid}-${Date.now()}`,
        url: uploaded.url,
        mediaType: pendingPostMedia.mediaType,
        createdAt: new Date().toISOString(),
        description: postCaption.trim(),
        likesCount: 0,
        commentsCount: 0,
        storagePath: uploaded.storagePath,
        mimeType: uploaded.mimeType,
      });
      setPendingPostMedia(null);
      setPostCaption("");
      await loadHomeFeed(true);
      Alert.alert("تم النشر", "تمت إضافة المنشور بنجاح.");
    } catch (e: any) {
      Alert.alert("تعذر النشر", e?.message || "حدث خطأ أثناء رفع المنشور.");
    } finally { setPosting(false); }
  }, [pendingPostMedia, postCaption, loadHomeFeed]);

  useFocusEffect(useCallback(() => {
    loadHomeFeed();
  }, [loadHomeFeed]));

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
    if (!post || !text || commentPosting) return;

    setCommentPosting(true);
    try {
      if (editingId) {
        await updateProfilePostComment(post.id, editingId, text);
        setComments((prev) => prev.map((comment) => comment.id === editingId ? { ...comment, text } : comment));
      } else {
        const added = await addProfilePostComment(post.id, text);
        setComments((prev) => [added, ...prev]);
        setHomeFeed((prev) => prev.map((p) => p.id === post.id ? { ...p, commentsCount: p.commentsCount + 1 } : p));
      }
      setCommentEditingId(null);
      setCommentText("");
      setCommentInputOpen(false);
    } catch (e: any) {
      Alert.alert(editingId ? "تعذر تعديل التعليق" : "تعذر التعليق", e?.message || "حدث خطأ أثناء حفظ التعليق.");
    } finally {
      setCommentPosting(false);
    }
  }, [commentPost, commentText, commentEditingId, commentPosting]);

  const dismissCommentInput = useCallback(async () => {
    if (commentPosting) return;
    if (commentText.trim()) {
      await handleSubmitComment();
      return;
    }
    setCommentInputOpen(false);
    setCommentEditingId(null);
    setCommentText("");
  }, [commentPosting, commentText, handleSubmitComment]);

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
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
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

  // ── Stories ───────────────────────────────────────────────────────────────
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [storyPublishing, setStoryPublishing] = useState(false);
  const [storyPublishProgress, setStoryPublishProgress] = useState(0);
  const [productPublishing, setProductPublishing] = useState(false);
  const [productPublishProgress, setProductPublishProgress] = useState(0);
  const [productProgressSize, setProductProgressSize] = useState({ width: 0, height: 0 });

  // Background publish indicators. Progress intentionally approaches 92%
  // while uploading and reaches 100% only when the background task removes
  // its status key, so the user can see that publishing is still in progress.
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    const refreshPublishProgress = async () => {
      try {
        const [storyRaw, productRaw] = await Promise.all([
          AsyncStorage.getItem(STORY_PUBLISH_PROGRESS_KEY(userId)),
          AsyncStorage.getItem(PRODUCT_PUBLISH_PROGRESS_KEY(userId)),
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
    if (!lastMsgSeen) return 0;
    return chatLastAts.filter((at) => at && at > lastMsgSeen).length;
  }, [chatLastAts, lastMsgSeen]);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  const loadData = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) { router.replace("/login" as any); return; }

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

      // Location is best-effort — failure must never block the rest of the UI
try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch {
        // Location unavailable or denied — silently ignore
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
        router.push({
          pathname: "/chat",
          params: { chatId: data.chatId, otherName: data.senderName },
        });
      } else if (data?.type === "serviceRequest" || data?.type === "requestStatus") {
        router.push("/reservations" as any);
      } else if (data?.type === "productOrder") {
        router.push("/product-orders" as any);
      } else if (data?.type === "productOrderResponse") {
        router.push("/product-orders" as any);
      }
    });
    return () => sub.remove();
  }, []);

  // Badge: load last-seen timestamp for messages
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    AsyncStorage.getItem(`@forus:msgSeen:${user.uid}`).then((val) => {
      if (val) {
        setLastMsgSeen(val);
      } else {
        const now = new Date().toISOString();
        AsyncStorage.setItem(`@forus:msgSeen:${user.uid}`, now);
        setLastMsgSeen(now);
      }
    });
  }, []);

  // Badge: subscribe to chat timestamps (no profile lookups — fast)
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
    const user = auth.currentUser;
    if (user) {
      const now = new Date().toISOString();
      await AsyncStorage.setItem(`@forus:msgSeen:${user.uid}`, now);
      setLastMsgSeen(now);
    }
    router.push("/messages" as any);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleLogout = async () => {
    Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "خروج",
        style: "destructive",
        onPress: async () => {
          await performSignOut();
          router.replace("/login");
        },
      },
    ]);
  };

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
    // Contextual text search — name, profession, or phone number
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.name?.toLowerCase().includes(q) ||
          a.specialty?.toLowerCase().includes(q) ||
          a.bio?.toLowerCase().includes(q) ||
          a.phone?.includes(q)
      );
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
          {userRole === "admin" && (
            <Pressable style={styles.headerIconCol} onPress={() => router.push("/admin-dashboard" as any)}>
              <View style={styles.headerIconBtn}>
                <Feather name="shield" size={20} color={C.accent} />
              </View>
              <Text style={styles.headerIconLabel}>الإدارة</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.headerIconCol}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/user-search" as any);
            }}
            accessibilityLabel="البحث عن المستخدمين"
          >
            <View style={styles.headerIconBtn}>
              <Feather name="search" size={20} color="#FFF" />
            </View>
            <Text style={styles.headerIconLabel}>بحث</Text>
          </Pressable>
          <Pressable style={styles.headerIconCol} onPress={handleMessagesPress}>
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
            <Text style={styles.headerIconLabel}>المراسلات</Text>
          </Pressable>
          <Pressable style={styles.headerIconCol} onPress={() => router.push("/support" as any)}>
            <View style={styles.headerIconBtn}>
              <Feather name="headphones" size={20} color="#FFF" />
            </View>
            <Text style={styles.headerIconLabel}>خدمة العملاء</Text>
          </Pressable>
          <View style={styles.headerIconCol}>
            <ProfileAvatar
              photoUri={liveProfile?.photoUri}
              name={userName}
              size={36}
            />
            <Text style={styles.headerIconLabel} numberOfLines={1}>{userName}</Text>
          </View>
        </View>

        {/* ── Story Strip — between header icons and promote button ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.storyStrip}
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
                  router.push("/story-creator" as any);
                } else {
                  router.push({ pathname: "/story-viewer", params: { userId } } as any);
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
                    router.push("/story-creator" as any);
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
                router.push({ pathname: "/story-viewer", params: { userId: group.userId } } as any);
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

      </LinearGradient>

      {/* Category tabs — always visible */}
      <View style={styles.stickyBar}>
            <View style={styles.mainCategoryTabs}>
              {CATEGORY_TABS.map((tab) => (
                <Pressable
                  key={tab.key}
                  style={[
                    styles.mainCatTab,
                    activeCategory === tab.key && styles.catTabActive,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setFocusedProductId(null); // stop any playing video immediately
                    setSearchQuery("");         // clear search when switching tabs
                    if (tab.key === "products") {
                      // Re-tapping Products behaves like "scroll to top + refresh".
                      productsListRef.current?.scrollToOffset({ offset: 0, animated: true });
                      onProductsRefresh();
                    }
                    setActiveCategory(tab.key);
                    if (tab.key === "services") {
                      setActiveServiceCategory("home");
                    }
                  }}
                >
                <Text
                    style={[
                      styles.mainCatTabText,
                      activeCategory === tab.key && styles.catTabTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>

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
          {activeCategory === "products" && (
            <View style={styles.productsSubBar}>
              <View style={[styles.inlineSearchRow, styles.productSearchRow]}>
                <Feather name="search" size={14} color={C.textMuted} />
                <TextInput
                  style={styles.inlineSearchInput}
                  placeholder="ابحث في المنتجات..."
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
              <View style={styles.addProductProgressWrap}>
                <TouchableOpacity
                  style={styles.addProductBtn}
                  onLayout={(event) => {
                    const { width, height } = event.nativeEvent.layout;
                    if (width > 0 && height > 0 &&
                      (Math.abs(productProgressSize.width - width) > 0.5 ||
                        Math.abs(productProgressSize.height - height) > 0.5)) {
                      setProductProgressSize({ width, height });
                    }
                  }}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/add-product" as any); }}
                  activeOpacity={0.8}
                >
                  <Feather name="plus" size={13} color={C.accent} />
                  <Text style={styles.addProductBtnText}>إضافة منتج</Text>

                  {productPublishing && productProgressSize.width > 0 && productProgressSize.height > 0 && (
                    <View style={styles.productProgressOverlay} pointerEvents="none">
                      <Svg
                        width={productProgressSize.width}
                        height={productProgressSize.height}
                        viewBox={`0 0 ${productProgressSize.width} ${productProgressSize.height}`}
                      >
                        <Rect
                          x="1.5"
                          y="1.5"
                          width={Math.max(0, productProgressSize.width - 3)}
                          height={Math.max(0, productProgressSize.height - 3)}
                          rx={8}
                          fill="none"
                          stroke="#4BFF8A"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={`${2 * (Math.max(0, productProgressSize.width - 3) + Math.max(0, productProgressSize.height - 3))} ${2 * (Math.max(0, productProgressSize.width - 3) + Math.max(0, productProgressSize.height - 3))}`}
                          strokeDashoffset={2 * (Math.max(0, productProgressSize.width - 3) + Math.max(0, productProgressSize.height - 3)) * (1 - productPublishProgress)}
                        />
                      </Svg>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Conditional content: products, services, or inline incoming orders ── */}
          <View style={styles.listWrapper}>
            {activeCategory === "orders" ? (
              <ReservationsScreen inline />
            ) : activeCategory === "home" ? (
              /* ══ HOME SOCIAL FEED — posts/media only ══ */
              <FlatList
                data={homeFeed}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[styles.listContent, styles.homeFeedContent, { paddingBottom: bottomPad + 20 }]}
                refreshControl={<RefreshControl refreshing={homeRefreshing} onRefresh={() => loadHomeFeed(true)} tintColor={C.accent} />}
                showsVerticalScrollIndicator={false}
                viewabilityConfig={homeViewabilityConfig}
                onViewableItemsChanged={homeViewabilityHandler}
                ListHeaderComponent={
                  <View style={styles.homeFeedIntro}>
                    <View style={styles.homeFeedHeaderRow}>
                      <View style={styles.homeFeedIntroText}>
                        <Text style={styles.homeFeedTitle}>الرئيسية</Text>
                      </View>
                      <Pressable
                        style={styles.addPostBtn}
                        onPress={handleAddPost}
                        disabled={posting}
                      >
                        {posting ? <ActivityIndicator size="small" color="#FFF" /> : <Feather name="plus" size={16} color="#FFF" />}
                        <Text style={styles.addPostBtnText}>{posting ? "جارٍ النشر..." : "إضافة منشور"}</Text>
                      </Pressable>
                    </View>
                  </View>
                }
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
                    onDoubleTapLike={async () => {
                      try {
                        const liked = await toggleProfilePostLike(item.id);
                        setLikedPostIds((prev) => { const next = new Set(prev); if (liked) next.add(item.id); else next.delete(item.id); return next; });
                        setHomeFeed((prev) => prev.map((p) => p.id === item.id ? { ...p, likesCount: Math.max(0, p.likesCount + (liked ? 1 : -1)) } : p));
                      } catch (e: any) { Alert.alert("تعذر الإعجاب", e?.message || "حدث خطأ."); }
                    }}
                    onResumeVideo={() => {
                      if (showReels || isReelsOpenRef.current) return;
                      homeResumeBlockedRef.current = false;
                      isInlineVideoPlayingRef.current = true;
                      setIsInlineVideoPlaying(true);
                      setActiveHomePostId(item.id);
                    }}
                    isLiked={likedPostIds.has(item.id)}
                    onLike={async () => {
                      try {
                        const liked = await toggleProfilePostLike(item.id);
                        setLikedPostIds((prev) => { const next = new Set(prev); if (liked) next.add(item.id); else next.delete(item.id); return next; });
                        setHomeFeed((prev) => prev.map((p) => p.id === item.id ? { ...p, likesCount: Math.max(0, p.likesCount + (liked ? 1 : -1)) } : p));
                      } catch (e: any) {
                        Alert.alert("تعذر الإعجاب", e?.message || "حدث خطأ.");
                      }
                    }}
                    onComment={() => {
                      setCommentPost(item);
                      setComments([]);
                      setCommentText("");
                    }}
                    onShare={async () => {
                      try {
                        await Share.share({
                          title: item.userName,
                          message: `${item.userName}${item.description ? `\n\n${item.description}` : ""}\n\n${item.url}`,
                        });
                      } catch (e) {
                        console.warn("share post failed", e);
                      }
                    }}
                    onOpenProfile={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push({ pathname: "/user-profile", params: { userId: item.userId, userName: item.userName } } as any);
                    }}
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
                    onMediaPress={(item) => setFullscreenMedia(item)}
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

      <Modal
        visible={!!pendingPostMedia}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => { if (!posting) { setPendingPostMedia(null); setPostCaption(""); } }}
      >
        <View style={styles.captionBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (!posting) { setPendingPostMedia(null); setPostCaption(""); } }} />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.captionSheetKeyboard}>
            <View style={styles.captionSheet}>
              <View style={styles.commentHandle} />
              <View style={styles.captionHeaderRow}>
                <Text style={styles.captionTitle}>وصف المنشور</Text>
                <Pressable disabled={posting} onPress={() => { setPendingPostMedia(null); setPostCaption(""); }} style={styles.commentCloseBtn}>
                  <Feather name="x" size={19} color={C.textSecondary} />
                </Pressable>
              </View>
              {pendingPostMedia && (
                pendingPostMedia.mediaType === "video" ? (
                  <View style={styles.captionPreviewVideo}><Video source={{ uri: pendingPostMedia.uri }} style={StyleSheet.absoluteFill} resizeMode={ResizeMode.COVER} shouldPlay={false} isMuted /></View>
                ) : (
                  <Image source={{ uri: pendingPostMedia.uri }} style={styles.captionPreviewImage} resizeMode="cover" />
                )
              )}
              <TextInput
                value={postCaption}
                onChangeText={setPostCaption}
                placeholder="اكتب وصفاً أو تفاصيل عن المنشور..."
                placeholderTextColor={C.textMuted}
                style={styles.captionInput}
                multiline
                maxLength={1000}
                textAlign="right"
                editable={!posting}
                autoFocus
              />
              <Pressable style={styles.captionPublishBtn} onPress={publishPendingPost} disabled={posting}>
                {posting ? <ActivityIndicator size="small" color="#FFF" /> : <Feather name="send" size={17} color="#FFF" />}
                <Text style={styles.captionPublishText}>{posting ? "جارٍ النشر..." : "نشر"}</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

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
        onLike={async (item) => {
          try {
            const liked = await toggleProfilePostLike(item.id);
            setLikedPostIds((prev) => { const next = new Set(prev); if (liked) next.add(item.id); else next.delete(item.id); return next; });
            setHomeFeed((prev) => prev.map((p) => p.id === item.id ? { ...p, likesCount: Math.max(0, p.likesCount + (liked ? 1 : -1)) } : p));
          } catch (e: any) { Alert.alert("تعذر الإعجاب", e?.message || "حدث خطأ."); }
        }}
        isLiked={(postId) => likedPostIds.has(postId)}
        onDoubleTapLike={async (item) => {
          try {
            const liked = await toggleProfilePostLike(item.id);
            setLikedPostIds((prev) => { const next = new Set(prev); if (liked) next.add(item.id); else next.delete(item.id); return next; });
            setHomeFeed((prev) => prev.map((p) => p.id === item.id ? { ...p, likesCount: Math.max(0, p.likesCount + (liked ? 1 : -1)) } : p));
          } catch (e: any) { Alert.alert("تعذر الإعجاب", e?.message || "حدث خطأ."); }
        }}
         onComment={(item) => { setCommentPost(item); setComments([]); setCommentText(""); setCommentEditingId(null); setCommentInputOpen(false); setCommentActionsComment(null); }}
        onShare={async (item) => {
          try { await Share.share({ title: item.userName, message: `${item.userName}${item.description ? `\n\n${item.description}` : ""}\n\n${item.url}` }); }
          catch (e) { console.warn("share reel failed", e); }
        }}
        onOpenProfile={(item) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowReels(false);
          router.push({ pathname: "/user-profile", params: { userId: item.userId, userName: item.userName } } as any);
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
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
            style={styles.commentSheetKeyboard}
          >
          <View style={styles.commentSheet}>
            <View style={styles.commentHandle} />
            <View style={styles.commentHeaderRow}>
              <Text style={styles.commentTitle}>التعليقات {commentPost ? `(${commentPost.commentsCount})` : ""}</Text>
              <Pressable onPress={closeCommentSheet} style={styles.commentCloseBtn}>
                <Feather name="x" size={19} color={C.textSecondary} />
              </Pressable>
            </View>

            <FlatList
              data={comments}
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
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => router.push({ pathname: "/user-profile", params: { userId: item.userId, userName: item.userName } } as any)}
                  >
                    <ProfileAvatar photoUri={item.userPhotoUri} name={item.userName} size={38} disableNavigation />
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
                        activeOpacity={0.7}
                        onPress={() => router.push({ pathname: "/user-profile", params: { userId: item.userId, userName: item.userName } } as any)}
                      >
                        <Text style={styles.commentUserName} numberOfLines={1}>{item.userName}</Text>
                      </TouchableOpacity>
                      <Text style={styles.commentTime}>{item.createdAt ? new Date(item.createdAt).toLocaleString("ar-IQ") : "منذ قليل"}</Text>
                    </View>
                    <Text style={styles.commentText}>{item.text}</Text>
                  </Pressable>
                </View>
              )}
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
          </KeyboardAvoidingView>

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
                    <Text style={styles.commentInputTitle}>{commentEditingId ? "تعديل التعليق" : "إضافة تعليق"}</Text>
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
                    <Feather name="image" size={19} color={C.textMuted} />
                    <Feather name="at-sign" size={19} color={C.textMuted} />
                  </View>
                  <View style={styles.commentInputRow}>
                    <TextInput
                      ref={commentInputRef}
                      value={commentText}
                      onChangeText={setCommentText}
                      placeholder={commentEditingId ? "عدّل تعليقك..." : "اكتب تعليقك هنا..."}
                      placeholderTextColor={C.textMuted}
                      style={styles.commentLargeInput}
                      multiline
                      maxLength={500}
                      textAlign="right"
                      autoFocus
                      editable={!commentPosting}
                      returnKeyType="default"
                    />
                    <Pressable
                      style={[styles.commentInputSend, (!commentText.trim() || commentPosting) && styles.commentSendDisabled]}
                      disabled={!commentText.trim() || commentPosting}
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
                `💰 ${shareProduct.price.toLocaleString("ar-IQ")} د.ع`,
                `👤 ${shareProduct.sellerName}`,
              ]
            : undefined
        }
        shareText={
          shareProduct
            ? `🛍️ منتج للبيع عبر تطبيق فورس\n\n📦 ${shareProduct.title}\n💰 السعر: ${shareProduct.price.toLocaleString("ar-IQ")} د.ع\n👤 البائع: ${shareProduct.sellerName}${shareProduct.description ? "\n\n" + shareProduct.description : ""}`
            : ""
        }
        shareMessage={
          shareProduct
            ? `🛍️ منتج للبيع: ${shareProduct.title}\n💰 ${shareProduct.price.toLocaleString("ar-IQ")} د.ع — من تطبيق فورس`
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
                source={{ uri: fullscreenMedia.url }}
                style={styles.fullscreenImage}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                isMuted={false}
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
  headerGrad: { paddingBottom: 16, paddingHorizontal: 20, gap: 14 },

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
    flexDirection: "row-reverse", justifyContent: "space-between",
    alignItems: "flex-start", gap: 4,
  },
  addPostHeaderBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: C.accent, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, marginTop: 2,
  },
  addPostHeaderText: { fontSize: 11, fontFamily: "Cairo_700Bold", color: C.primary },
  homeFeedContent: { paddingHorizontal: 8, paddingTop: 10 },
  homeFeedIntro: { paddingHorizontal: 8, paddingBottom: 12 },
  homeFeedHeaderRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  homeFeedIntroText: { flex: 1, alignItems: "flex-end" },
  addPostBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, minHeight: 40 },
  addPostBtnText: { fontSize: 12, fontFamily: "Cairo_700Bold", color: "#FFF" },
  homeFeedTitle: { fontSize: 19, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  homeFeedSubtitle: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textSecondary, marginTop: 2, textAlign: "right" },
  homePostCard: {
    backgroundColor: C.card, borderRadius: 14, marginBottom: 14, overflow: "hidden",
    borderWidth: 1, borderColor: C.border,
  },
  homePostHeader: { flexDirection: "row-reverse", alignItems: "center", padding: 12, gap: 9 },
  homePostProfileTouchable: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  homeMediaPressable: { width: "100%" },
  homeMuteBtn: { position: "absolute", right: 12, bottom: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,.48)", alignItems: "center", justifyContent: "center" },
  homePostUser: { flex: 1, alignItems: "flex-end" },
  homePostName: { fontSize: 14, fontFamily: "Cairo_700Bold", color: C.text },
  homePostDescriptionHeader: { fontSize: 11, lineHeight: 17, fontFamily: "Cairo_400Regular", color: C.textSecondary, marginTop: 2, textAlign: "right" },
  homePostTime: { fontSize: 10, fontFamily: "Cairo_400Regular", color: C.textMuted, marginTop: 1 },
  homeMedia: { width: "100%", height: 390, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  homePlay: { width: 62, height: 62, borderRadius: 31, backgroundColor: "rgba(0,0,0,.45)", alignItems: "center", justifyContent: "center" },
  homePostDescription: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.text, textAlign: "right", paddingHorizontal: 13, paddingTop: 10 },
  homeActions: { flexDirection: "row-reverse", alignItems: "center", padding: 11, gap: 18 },
  homeAction: { flexDirection: "row", alignItems: "center", gap: 5 },
  homeActionText: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  likedCountText: { color: "#EF4444" },
  reelsRoot: { flex: 1, backgroundColor: "#000" },
  reelPage: { width: Dimensions.get("window").width, height: Dimensions.get("window").height, backgroundColor: "#000" },
  reelOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between", padding: 18, paddingTop: 52 },
  reelTopRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", width: "100%" },
  reelClose: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,.35)", alignItems: "center", justifyContent: "center" },
  reelMuteBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(0,0,0,.35)", alignItems: "center", justifyContent: "center" },
  reelBottomArea: { position: "relative", minHeight: 220, justifyContent: "flex-end", paddingBottom: 4 },
  reelActions: { position: "absolute", right: 8, bottom: 18, gap: 20, alignItems: "center" },
  reelProfileColumn: { width: 68, alignItems: "center", gap: 4 },
  reelAvatarWrap: { position: "relative", width: 54, height: 54, alignItems: "center", justifyContent: "center" },
  reelFollowBadge: { position: "absolute", right: -3, bottom: -2, width: 21, height: 21, borderRadius: 11, backgroundColor: C.accent, borderWidth: 2, borderColor: "#FFF", alignItems: "center", justifyContent: "center" },
  reelFollowBadgeFollowing: { backgroundColor: "#22C55E" },
  reelFollowBadgeText: { color: "#FFF", fontSize: 14, lineHeight: 17, fontFamily: "Cairo_700Bold" },
  reelName: { color: "#FFF", fontSize: 11, fontFamily: "Cairo_700Bold", textAlign: "center", maxWidth: 68 },
  reelDescriptionBottom: { color: "#FFF", fontSize: 12, lineHeight: 19, fontFamily: "Cairo_400Regular", textAlign: "right", marginRight: 82, marginLeft: 8, marginBottom: 18 },
  reelAction: { alignItems: "center", gap: 2 },
  reelCount: { color: "#FFF", fontSize: 12, fontFamily: "Cairo_600SemiBold" },
  captionBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.55)", justifyContent: "flex-end" },
  captionSheetKeyboard: { width: "100%" },
  captionSheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 14, paddingBottom: 20, maxHeight: "88%" },
  captionHeaderRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingBottom: 10 },
  captionTitle: { fontSize: 17, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  captionPreviewImage: { width: "100%", height: 190, borderRadius: 16, backgroundColor: "#000", marginBottom: 10 },
  captionPreviewVideo: { width: "100%", height: 190, borderRadius: 16, overflow: "hidden", backgroundColor: "#000", marginBottom: 10 },
  captionInput: { minHeight: 100, maxHeight: 180, borderWidth: 1, borderColor: C.border, backgroundColor: C.background, borderRadius: 15, paddingHorizontal: 13, paddingVertical: 11, color: C.text, fontFamily: "Cairo_400Regular", textAlignVertical: "top", marginBottom: 10 },
  captionPublishBtn: { minHeight: 46, borderRadius: 14, backgroundColor: C.accent, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7 },
  captionPublishText: { color: "#FFF", fontSize: 13, fontFamily: "Cairo_700Bold" },
  commentBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,.55)", justifyContent: "flex-end", paddingBottom: 0, marginBottom: 0 },
  commentSheetKeyboard: { width: "100%", paddingBottom: 0, marginBottom: 0 },
  commentSheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 14, paddingBottom: 0, marginBottom: 0, height: "85%", overflow: "hidden" },
  commentHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: "center", marginBottom: 9 },
  commentHeaderRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingBottom: 8 },
  commentTitle: { fontSize: 17, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  commentCloseBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.background, alignItems: "center", justifyContent: "center" },
  commentsList: { flex: 1, minHeight: 0 },
  commentsListContent: { paddingTop: 4, paddingBottom: 8, gap: 2 },
  commentsEmptyContent: { flexGrow: 1, justifyContent: "center" },
  commentsState: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 30 },
  commentsStateText: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textMuted },
  commentRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 9, paddingVertical: 8, paddingHorizontal: 2 },
  commentBody: { flex: 1, backgroundColor: C.background, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8 },
  commentMetaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  commentUserName: { flexShrink: 1, fontSize: 12, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  commentTime: { fontSize: 9, fontFamily: "Cairo_400Regular", color: C.textMuted },
  commentText: { marginTop: 3, fontSize: 12, lineHeight: 20, fontFamily: "Cairo_400Regular", color: C.text, textAlign: "right" },
  commentEditCancel: { alignSelf: "flex-end", paddingHorizontal: 6, paddingVertical: 4 },
  commentEditCancelText: { fontSize: 10, fontFamily: "Cairo_600SemiBold", color: C.accent },
  commentComposer: { flexDirection: "row-reverse", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginTop: 5, paddingBottom: 0 },
  commentComposerFakeInput: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: C.border, backgroundColor: C.background, borderRadius: 15, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  commentComposerPlaceholder: { flex: 1, fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textMuted, textAlign: "right" },
  commentComposerSend: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.background, alignItems: "center", justifyContent: "center" },
  commentSendDisabled: { opacity: 0.45 },
  commentInputOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,.42)", zIndex: 20 },
  commentInputKeyboard: { flex: 1, justifyContent: "flex-end" },
  commentInputSheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 14, paddingBottom: 0, marginBottom: 0, minHeight: 245 },
  commentInputHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 3, paddingBottom: 8 },
  commentInputTitle: { fontSize: 16, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "right" },
  commentInputClose: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: C.background },
  commentEmojiRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border },
  commentEmojiButton: { width: 34, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.background },
  commentEmoji: { fontSize: 18 },
  commentInputRow: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 8, paddingTop: 11 },
  commentLargeInput: { flex: 1, minHeight: 108, maxHeight: 190, borderWidth: 1, borderColor: C.accent, backgroundColor: C.background, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 11, color: C.text, fontFamily: "Cairo_400Regular", fontSize: 14, lineHeight: 23, textAlignVertical: "top" },
  commentInputSend: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  commentOptionsOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,.28)", justifyContent: "flex-end", zIndex: 30 },
  commentOptionsSheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 18, paddingBottom: 0, marginBottom: 0 },
  commentOptionsTitle: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text, textAlign: "center", paddingVertical: 8 },
  commentOptionsRow: { flexDirection: "row-reverse", justifyContent: "space-around", paddingTop: 8 },
  commentOption: { alignItems: "center", gap: 6, minWidth: 78 },
  commentOptionIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.background, alignItems: "center", justifyContent: "center" },
  commentDeleteIcon: { backgroundColor: "rgba(239,68,68,.1)" },
  commentOptionText: { fontSize: 11, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  commentDeleteText: { color: "#EF4444" },
  commentToast: { position: "absolute", alignSelf: "center", flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 20, backgroundColor: "rgba(25,25,25,.94)", zIndex: 50 },
  commentToastText: { color: "#FFF", fontSize: 12, fontFamily: "Cairo_600SemiBold" },

  headerIconCol: { alignItems: "center", gap: 4, maxWidth: 64 },
  headerIconLabel: {
    fontSize: 10, fontFamily: "Cairo_600SemiBold",
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
  featuredBadgeText: { fontSize: 10, fontFamily: "Cairo_700Bold", color: "#0D1B3E" },
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
    fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.accent,
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
    fontFamily: "Cairo_600SemiBold",
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
    fontFamily: "Cairo_600SemiBold",
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
  catTabText: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  catTabTextActive: { color: C.primary },
  listContent: { padding: 16, gap: 12 },
  listHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 4,
  },
  listCount: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  sortedBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(201,168,76,0.1)", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  sortedText: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.accent },
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
  initialsText: { fontSize: 20, fontFamily: "Cairo_700Bold", color: C.accent },
  availDot: {
    position: "absolute", bottom: 2, right: 2,
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: C.card,
  },
availOnline: { backgroundColor: "#22C55E" },
  availOffline: { backgroundColor: "#9CA3AF" },
  cardBody: { flex: 1, gap: 4 },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  artisanName: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text, flex: 1, textAlign: "right" },
  specialtyBadge: {
    backgroundColor: "rgba(13,27,62,0.07)", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  specialtyText: { fontSize: 11, fontFamily: "Cairo_600SemiBold", color: C.primary },
  cardMidRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "flex-end" },
  ratingText: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.text },
  reviewCount: { fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted },
  artisanBio: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "right" },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  distancePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(201,168,76,0.1)", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  distanceText: { fontSize: 11, fontFamily: "Cairo_600SemiBold", color: C.accent },
  availText: { fontSize: 11, fontFamily: "Cairo_400Regular" },
  availOnlineText: { color: "#22C55E" },
  availOfflineText: { color: C.textMuted },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Cairo_700Bold", color: C.text },
  emptySubtitle: { fontSize: 14, fontFamily: "Cairo_400Regular", color: C.textSecondary },
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
    fontFamily: "Cairo_700Bold",
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
    fontFamily: "Cairo_600SemiBold",
    color: C.accent,
  },

  // ── Products bar ──
  productsBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: C.background,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  productsBarTitle: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.text },
  productsBtnsGroup: { flexDirection: "row", gap: 8, alignItems: "center" },
  ordersBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(201,168,76,0.1)", borderRadius: 10,
    paddingHorizontal: 11, paddingVertical: 6,
    borderWidth: 1, borderColor: "rgba(201,168,76,0.3)",
  },
  ordersBtnText: { fontSize: 12, fontFamily: "Cairo_600SemiBold", color: C.accent },

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
  soldOverlayText: { fontSize: 18, fontFamily: "Cairo_700Bold", color: "#FFF" },
  productBody: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, gap: 6 },
  // Header row: title (right) ↔ seller name (left)
  productHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  productTitle: {
    flex: 1, fontSize: 16, fontFamily: "Cairo_700Bold",
    color: C.text, textAlign: "right",
  },
  productSellerTouchable: {
    flexDirection: "column", alignItems: "flex-start", gap: 3, flexShrink: 0,
  },
  productSellerName: {
    fontSize: 16, fontFamily: "Cairo_700Bold",
    color: C.accent, textAlign: "left",
  },
  productPrice: { fontSize: 18, fontFamily: "Cairo_700Bold", color: C.accent, textAlign: "right" },
  productPriceLabel: { fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
  productCurrency: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.accent },
  productDesc: { fontSize: 13, fontFamily: "Cairo_400Regular", color: C.textSecondary, textAlign: "right" },
  productEngagement: {
    flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 5,
    paddingTop: 2,
  },
  productLikesText: { fontSize: 13, fontFamily: "Cairo_700Bold", color: C.text },
  productLikesLabel: { fontSize: 12, fontFamily: "Cairo_400Regular", color: C.textSecondary },
  productFeaturedBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: C.accent, borderRadius: 7,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  productFeaturedText: { fontSize: 10, fontFamily: "Cairo_700Bold", color: C.primary },
  buyBtn: { marginHorizontal: 14, marginTop: 10, marginBottom: 14, borderRadius: 12, overflow: "hidden" },
  buyBtnGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 13, gap: 6,
  },
  buyBtnText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: C.primary },

  // Delete button (seller view)
  deleteBtn: { backgroundColor: "transparent" },
  deleteBtnInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 13, gap: 6,
    backgroundColor: "#EF4444", borderRadius: 12,
  },
  deleteBtnText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: "#FFF" },

  // Cancel-order button (buyer with pending order)
  cancelOrderBtn: { backgroundColor: "transparent" },
  cancelOrderBtnInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 13, gap: 6,
    backgroundColor: "#F59E0B", borderRadius: 12,
  },
  cancelOrderBtnText: { fontSize: 15, fontFamily: "Cairo_700Bold", color: "#FFF" },

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
    fontSize: 18, fontFamily: "Cairo_700Bold", color: C.text,
    textAlign: "center",
  },
  buyModalProductName: {
    fontSize: 14, fontFamily: "Cairo_600SemiBold", color: C.textSecondary,
    textAlign: "right",
  },
  buyModalPriceText: {
    fontSize: 20, fontFamily: "Cairo_700Bold", color: C.accent, textAlign: "right",
  },
  buyModalCurrency: {
    fontSize: 14, fontFamily: "Cairo_400Regular", color: C.accent,
  },
  buyModalSection: { gap: 8 },
  buyModalSectionLabel: {
    fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.text, textAlign: "right",
  },
  buyModalOptional: {
    fontSize: 11, fontFamily: "Cairo_400Regular", color: C.textMuted,
  },
  buyModalRequired: {
    fontSize: 13, fontFamily: "Cairo_700Bold", color: "#4BFF8A",
  },
  chipRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: C.border, backgroundColor: C.inputBg,
  },
  chipActive: { borderColor: C.accent, backgroundColor: "rgba(201,168,76,0.12)" },
  chipText: { fontSize: 13, fontFamily: "Cairo_600SemiBold", color: C.textSecondary },
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
