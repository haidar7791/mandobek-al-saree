import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import {
  fetchFoodItems,
  getUserProfile,
  FoodItem,
  UserProfile,
} from "../../lib/db_logic";
import Colors from "@/constants/colors";
import { getCart, getCartTotal } from "../../lib/food_cart";

const C = Colors.light;

type Category =
  | "all"
  | "popular"
  | "main"
  | "appetizer"
  | "drink"
  | "dessert";

const CATEGORY_LABELS: Record<Category, string> = {
  all: "قائمة الطعام",
  popular: "الأكثر طلباً",
  main: "الأطباق الرئيسية",
  appetizer: "المقبلات",
  drink: "المشروبات",
  dessert: "الحلويات",
};

const CATEGORY_ICONS: Record<Category, keyof typeof Ionicons.glyphMap> = {
  all: "restaurant-outline",
  popular: "flame-outline",
  main: "fast-food-outline",
  appetizer: "leaf-outline",
  drink: "cafe-outline",
  dessert: "ice-cream-outline",
};

export default function RestaurantScreen() {
  const [restaurantCartCount, setRestaurantCartCount] = useState(0);
  const [restaurantCartTotal, setRestaurantCartTotal] = useState(0);

  const refreshRestaurantCart = () => {
    setRestaurantCartCount(
      getCart().reduce((sum, item) => sum + item.quantity, 0)
    );
    setRestaurantCartTotal(getCartTotal());
  };

  useFocusEffect(
    useCallback(() => {
      refreshRestaurantCart();
    }, [])
  );


  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const restaurantId = Array.isArray(id) ? id[0] : id;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRestaurant = useCallback(async () => {
    if (!restaurantId) return;

    try {
      const [restaurant, foods] = await Promise.all([
        getUserProfile(restaurantId),
        fetchFoodItems(),
      ]);

      setProfile(restaurant ?? null);
      setItems((foods ?? []).filter((item) => item.userId === restaurantId));
    } catch (error) {
      console.error("Failed to load restaurant:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId]);

  useFocusEffect(
    useCallback(() => {
      loadRestaurant();
    }, [loadRestaurant])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRestaurant();
  }, [loadRestaurant]);

  const counts = useMemo(() => {
    return {
      all: items.length,
      popular: items.filter((item) => item.isPopular).length,
      main: items.filter((item) => item.category === "main").length,
      appetizer: items.filter((item) => item.category === "appetizer").length,
      drink: items.filter((item) => item.category === "drink").length,
      dessert: items.filter((item) => item.category === "dessert").length,
    };
  }, [items]);

  const visibleItems = useMemo(() => {
    if (activeCategory === "all") return items;
    if (activeCategory === "popular") {
      return items.filter((item) => item.isPopular);
    }
    return items.filter((item) => item.category === activeCategory);
  }, [activeCategory, items]);

  const cover =
    profile?.coverUri ||
    profile?.photoUri ||
    items[0]?.media?.find((x) => x.type === "image")?.url ||
    null;

  const logo = profile?.restaurantLogoUri || profile?.photoUri || null;

  if (loading) {
    return (
      <View style={S.loading}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={S.loadingText}>جاري تحميل المطعم...</Text>
      </View>
    );
  }

  if (!restaurantId || !profile) {
    return (
      <View style={S.emptyScreen}>
        <Ionicons name="restaurant-outline" size={58} color="#aaa" />
        <Text style={S.emptyTitle}>المطعم غير متوفر</Text>
        <Pressable style={S.backButton} onPress={() => router.back()}>
          <Text style={S.backButtonText}>العودة</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={S.screen}>
      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              S.dish,
              pressed && S.dishPressed,
            ]}
            onPress={() =>
              router.push(
                `/restaurant/dish?id=${item.id}` as any
              )
            }
          >
            {item.media?.[0]?.url ? (
              <Image
                source={{ uri: item.media[0].url }}
                style={S.dishImage}
                resizeMode="cover"
              />
            ) : (
              <View style={S.dishPlaceholder}>
                <Ionicons
                  name="restaurant-outline"
                  size={32}
                  color={C.accent}
                />
              </View>
            )}

            <View style={S.dishInfo}>
              <Text style={S.dishName} numberOfLines={2}>
                {item.name}
              </Text>

              {!!item.description && (
                <Text style={S.description} numberOfLines={2}>
                  {item.description}
                </Text>
              )}

              <Text style={S.price}>
                {Number(item.price || 0).toLocaleString()} د.ع
              </Text>
            </View>

            <View style={S.dishArrow}>
              <Ionicons
                name="chevron-back"
                size={18}
                color={C.textMuted}
              />
            </View>
          </Pressable>
        )}
        ListHeaderComponent={
          <>
            <View style={S.hero}>
              {cover ? (
                <Image
                  source={{ uri: cover }}
                  style={S.heroImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={S.heroPlaceholder}>
                  <Ionicons
                    name="restaurant-outline"
                    size={72}
                    color="rgba(255,255,255,0.72)"
                  />
                </View>
              )}

              <View style={S.heroOverlay} />

              <Pressable
                style={S.back}
                onPress={() => router.back()}
              >
                <Ionicons
                  name="arrow-forward"
                  size={23}
                  color="#fff"
                />
              </Pressable>

              <View style={S.heroContent}>
                <View style={S.logoWrap}>
                  {logo ? (
                    <Image
                      source={{ uri: logo }}
                      style={S.logo}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={S.logoPlaceholder}>
                      <Ionicons
                        name="restaurant-outline"
                        size={30}
                        color={C.accent}
                      />
                    </View>
                  )}
                </View>

                <View style={S.heroText}>
                  <Text
                    style={S.name}
                    numberOfLines={1}
                  >
                    {profile.name || "المطعم"}
                  </Text>

                  <Text style={S.cuisine}>
                    {profile.restaurantCategory || "مطعم"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={S.infoCard}>
              <View style={S.infoItem}>
                <Ionicons
                  name="star"
                  size={18}
                  color="#F5C842"
                />
                <Text style={S.infoValue}>
                  {typeof profile.rating === "number" &&
                  profile.rating > 0
                    ? profile.rating.toFixed(1)
                    : "جديد"}
                </Text>
                <Text style={S.infoLabel}>التقييم</Text>
              </View>

              <View style={S.infoDivider} />

              <View style={S.infoItem}>
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={C.accent}
                />
                <Text style={S.infoValue}>
                  {profile.estimatedDelivery ||
                    "25-35 دقيقة"}
                </Text>
                <Text style={S.infoLabel}>
                  وقت التوصيل
                </Text>
              </View>

              <View style={S.infoDivider} />

              <View style={S.infoItem}>
                <View
                  style={[
                    S.statusDot,
                    profile.isAvailable === false
                      ? S.statusClosed
                      : S.statusOpen,
                  ]}
                />

                <Text
                  style={[
                    S.infoValue,
                    profile.isAvailable === false
                      ? S.closedText
                      : S.openText,
                  ]}
                >
                  {profile.isAvailable === false
                    ? "مغلق"
                    : "مفتوح"}
                </Text>

                <Text style={S.infoLabel}>الحالة</Text>
              </View>
            </View>

            <View style={S.menuHeader}>
              <View style={S.menuTitleBox}>
                <Text style={S.menuTitle}>
                  قائمة الطعام
                </Text>

                <Text style={S.menuSubtitle}>
                  {items.length} أطباق متاحة
                </Text>
              </View>

              <View style={S.menuIcon}>
                <Ionicons
                  name="restaurant"
                  size={22}
                  color={C.accent}
                />
              </View>
            </View>

            <FlatList
              horizontal
              inverted
              data={[
                "all",
                "popular",
                "main",
                "appetizer",
                "drink",
                "dessert",
              ] as Category[]}
              keyExtractor={(item) => item}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={S.tabs}
              renderItem={({ item: category }) => {
                const active =
                  activeCategory === category;

                return (
                  <Pressable
                    onPress={() =>
                      setActiveCategory(category)
                    }
                    style={[
                      S.tab,
                      active && S.tabActive,
                    ]}
                  >
                    <Ionicons
                      name={CATEGORY_ICONS[category]}
                      size={16}
                      color={
                        active
                          ? "#fff"
                          : C.textMuted
                      }
                    />

                    <Text
                      style={[
                        S.tabText,
                        active && S.tabTextActive,
                      ]}
                    >
                      {CATEGORY_LABELS[category]}
                    </Text>

                    <View
                      style={[
                        S.count,
                        active && S.countActive,
                      ]}
                    >
                      <Text
                        style={[
                          S.countText,
                          active &&
                            S.countTextActive,
                        ]}
                      >
                        {counts[category]}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />

            <View style={S.sectionHeading}>
              <View>
                <Text style={S.heading}>
                  {CATEGORY_LABELS[activeCategory]}
                </Text>

                <Text style={S.headingCount}>
                  {visibleItems.length} عنصر
                </Text>
              </View>

              <Ionicons
                name={CATEGORY_ICONS[activeCategory]}
                size={22}
                color={C.accent}
              />
            </View>
          </>
        }
      />
    
      {restaurantCartCount > 0 && (
        <Pressable
          style={S.restaurantCartBar}
          onPress={() => router.push("/restaurant/cart" as any)}
        >
          <View style={S.restaurantCartIcon}>
            <Ionicons name="cart" size={22} color="#fff" />
            <Text style={S.restaurantCartBadge}>
              {restaurantCartCount}
            </Text>
          </View>

          <Text style={S.restaurantCartText}>
            عرض السلة · {restaurantCartTotal.toLocaleString()} د.ع
          </Text>

          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
      )}

</View>
  );
}

const S = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },

  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: C.background,
  },

  loadingText: {
    color: C.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },

  emptyScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: C.background,
  },

  emptyTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: "900",
  },

  backButton: {
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 13,
    backgroundColor: C.primary,
  },

  backButtonText: {
    color: "#fff",
    fontWeight: "900",
  },

  hero: {
    height: 310,
    position: "relative",
    backgroundColor: C.primary,
  },

  heroImage: {
    width: "100%",
    height: "100%",
  },

  heroPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.primary,
  },

  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,10,25,0.48)",
  },

  back: {
    position: "absolute",
    top: 48,
    right: 15,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.48)",
    alignItems: "center",
    justifyContent: "center",
  },

  heroContent: {
    position: "absolute",
    left: 17,
    right: 17,
    bottom: 22,
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    gap: 12,
  },

  logoWrap: {
    width: 76,
    height: 76,
    borderRadius: 22,
    padding: 3,
    backgroundColor: "#fff",
    elevation: 6,
  },

  logo: {
    width: "100%",
    height: "100%",
    borderRadius: 19,
  },

  logoPlaceholder: {
    flex: 1,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F0E5",
  },

  heroText: {
    flex: 1,
    alignItems: "flex-end",
  },

  name: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "right",
  },

  cuisine: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
    textAlign: "right",
  },

  infoCard: {
    marginHorizontal: 14,
    marginTop: -1,
    minHeight: 82,
    borderRadius: 18,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
  },

  infoItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },

  infoValue: {
    color: C.text,
    fontSize: 12,
    fontWeight: "900",
  },

  infoLabel: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: "700",
  },

  infoDivider: {
    width: 1,
    height: 42,
    backgroundColor: C.border,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  statusOpen: {
    backgroundColor: "#20B56B",
  },

  statusClosed: {
    backgroundColor: "#E34E55",
  },

  openText: {
    color: "#15945A",
  },

  closedText: {
    color: "#D63D4B",
  },

  menuHeader: {
    marginHorizontal: 16,
    marginTop: 22,
    marginBottom: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },

  menuTitleBox: {
    alignItems: "flex-end",
  },

  menuTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "right",
  },

  menuSubtitle: {
    color: C.textMuted,
    fontSize: 11,
    marginTop: 3,
    textAlign: "right",
  },

  menuIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "rgba(201,168,76,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },

  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },

  tab: {
    minHeight: 42,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 13,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },

  tabActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },

  tabText: {
    color: C.textSecondary,
    fontSize: 10,
    fontWeight: "800",
  },

  tabTextActive: {
    color: "#fff",
    fontWeight: "900",
  },

  count: {
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.background,
  },

  countActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },

  countText: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: "900",
  },

  countTextActive: {
    color: "#fff",
  },

  sectionHeading: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
    paddingTop: 4,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },

  heading: {
    color: C.text,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "right",
  },

  headingCount: {
    color: C.textMuted,
    fontSize: 10,
    marginTop: 3,
    textAlign: "right",
  },

  dish: {
    marginHorizontal: 13,
    marginBottom: 11,
    minHeight: 110,
    padding: 9,
    borderRadius: 17,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 9,
  },

  dishPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },

  dishImage: {
    width: 94,
    height: 94,
    borderRadius: 14,
    backgroundColor: C.background,
  },

  dishPlaceholder: {
    width: 94,
    height: 94,
    borderRadius: 14,
    backgroundColor: C.background,
    alignItems: "center",
    justifyContent: "center",
  },

  dishInfo: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },

  dishName: {
    width: "100%",
    color: C.text,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "right",
  },

  description: {
    width: "100%",
    color: C.textMuted,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 4,
    textAlign: "right",
  },

  price: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 6,
    textAlign: "right",
  },

  dishArrow: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.background,
  },

  empty: {
    marginHorizontal: 15,
    marginTop: 10,
    minHeight: 230,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 25,
    gap: 8,
  },

  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: "rgba(201,168,76,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },

  emptyText: {
    color: C.textMuted,
    fontSize: 11,
    textAlign: "center",
  },

  restaurantCartBar:{
    position:"absolute",
    left:14,
    right:14,
    bottom:31,
    minHeight:58,
    borderRadius:18,
    backgroundColor:"#111",
    flexDirection:"row-reverse",
    alignItems:"center",
    paddingHorizontal:16,
    elevation:8,
    shadowOpacity:0.2,
    shadowRadius:8,
    shadowOffset:{width:0,height:4},
  },
  restaurantCartIcon:{
    width:38,
    height:38,
    borderRadius:12,
    backgroundColor:"#f39c12",
    alignItems:"center",
    justifyContent:"center",
    marginLeft:10,
  },
  restaurantCartBadge:{
    position:"absolute",
    top:-5,
    right:-5,
    minWidth:18,
    height:18,
    borderRadius:9,
    backgroundColor:"#e74c3c",
    color:"#fff",
    fontSize:10,
    fontWeight:"900",
    textAlign:"center",
    paddingTop:2,
  },
  restaurantCartText:{
    flex:1,
    color:"#fff",
    fontSize:14,
    fontWeight:"900",
    textAlign:"right",
  },
});
